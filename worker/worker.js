/* Dans le coin : serveur des propositions (Cloudflare Worker + KV).
   Public :  POST /propose   { type: "propositions" | "sources", ... }   → mise en attente
             GET  /agenda                                             → sorties validées
   Éditeur : en-tête Authorization: Bearer <ADMIN_TOKEN>
             GET  /admin/list                → propositions et sources en attente
             POST /admin/publish   { id, event }   POST /admin/refuse { id }
             POST /admin/source    { id }          POST /admin/unpublish { id }
   API publique (clé obligatoire, réglable par clé) :
             GET  /v1/sorties?dep=03,58&type=brocante,fete&du=2026-10-14&au=2026-10-31&commune=Moulins&q=marché&gratuit=1&limite=100&page=1
             GET  /v1/lieux?dep=03&type=musee,office&commune=Moulins
             GET  /v1/departements · GET /v1/cle (réglages de sa clé)
             Position : lat, lon, rayon (km) et tri=distance ; une clé peut être limitée à une zone (centre + rayon).
             La clé se passe en en-tête « X-API-Key » ou en paramètre « cle ».
   Gestion des clés (éditeur) : GET /admin/cles · POST /admin/cles {nom, contact, deps, types, quota, origines, notes}
             POST /admin/cles/maj {cle, ...} · POST /admin/cles/revoquer {cle} · POST /admin/cles/reactiver {cle}
   Variables : KV « DLC », secret « ADMIN_TOKEN », variable « ORIGINS » (origines autorisées, séparées par des virgules),
               variable « DATA_URL » (adresse des données publiées, par défaut le site GitHub Pages). */

const DATA_DEFAUT = "https://batiazur-hub.github.io/sorties-bourbonnais-loire/data/";
const TYPES_SORTIES = ["brocante", "fete", "spectacle", "culture", "famille", "sport", "pal"];
const TYPES_LIEUX = ["office", "musee", "patrimoine", "nature", "loisirs"];
const MAX_DEPS = 8;
const LICENCE = "Données agrégées par Dans le coin (Saryn Digital) depuis DATAtourisme (Licence Ouverte), OpenAgenda, open data des collectivités et OpenStreetMap (ODbL, horaires). Citer « Dans le coin » et la source de chaque fiche. Détail : /mentions-legales.html";

const MAX_PAR_HEURE = 20;
const MOTS = /(encul|connard|connass|salop|pute\b|putain|merde|fdp|ntm|nique|batard|bâtard|pd\b|tafiole|negro|bougnoul|youpin)/i;

const json = (data, status, cors) => new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json; charset=utf-8", ...cors } });
const texte = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const id = () => "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function corsPour(req, env) {
  const o = req.headers.get("Origin") || "";
  const ok = (env.ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const allow = ok.includes(o) ? o : ok[0] || "*";
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
           "Access-Control-Allow-Headers": "Content-Type, Authorization", "Vary": "Origin" };
}

async function tout(env, prefix) {
  const out = []; let cursor;
  do {
    const r = await env.DLC.list({ prefix, cursor });
    for (const k of r.keys) { const v = await env.DLC.get(k.name, "json"); if (v) out.push(v); }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}


/* ---------- API à clés ---------- */
const nouvelleCle = () => "dlc_" + [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, "0")).join("");
const liste = v => (Array.isArray(v) ? v : String(v || "").split(",")).map(x => String(x).trim()).filter(Boolean);
const sansAccent = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function reglages(b, ancien) {
  const r = Object.assign({}, ancien || {});
  if (b.nom !== undefined) r.nom = texte(b.nom, 80);
  if (b.contact !== undefined) r.contact = texte(b.contact, 120);
  if (b.notes !== undefined) r.notes = texte(b.notes, 300);
  if (b.deps !== undefined) r.deps = liste(b.deps).map(x => x.toUpperCase()).filter(x => /^(\d{2,3}|2A|2B)$/.test(x)).slice(0, 120);
  if (b.types !== undefined) r.types = liste(b.types).filter(x => TYPES_SORTIES.includes(x) || TYPES_LIEUX.includes(x));
  if (b.origines !== undefined) r.origines = liste(b.origines).filter(x => /^https?:\/\/[^/]+$/.test(x)).slice(0, 20);
  if (b.quota !== undefined) r.quota = Math.max(0, Math.min(1000000, parseInt(b.quota, 10) || 0));
  if (b.lieux !== undefined) r.lieux = !!b.lieux;
  if (b.jours !== undefined) r.jours = Math.max(0, Math.min(365, parseInt(b.jours, 10) || 0));
  if (b.zone !== undefined) {
    const z = b.zone || {};
    const lat = +z.lat, lon = +z.lon, rayon = +z.rayon;
    r.zone = isFinite(lat) && isFinite(lon) && rayon > 0 ? { lat: +lat.toFixed(5), lon: +lon.toFixed(5), rayon: Math.min(300, Math.max(1, +rayon.toFixed(1))), nom: texte(z.nom, 80) } : null;
  }
  return r;
}
const km = (a, b, c, d) => { const x = (d - b) * Math.cos((a + c) / 2 * Math.PI / 180) * 111.32, y = (c - a) * 110.57; return Math.hypot(x, y); };
/* Départements à lire pour couvrir une zone : ceux dont le centre est à moins de rayon + 90 km, les plus proches d'abord */
async function depsDeZone(env, z) {
  const d = await donnees(env, "departements.json");
  return ((d && d.departements) || []).map(x => [x.code, km(z.lat, z.lon, x.lat, x.lon)]).filter(x => x[1] <= z.rayon + 90)
    .sort((a, b) => a[1] - b[1]).slice(0, 8).map(x => x[0]);
}
async function donnees(env, chemin) {
  const base = env.DATA_URL || DATA_DEFAUT;
  const r = await fetch(base + chemin, { cf: { cacheTtl: 1800, cacheEverything: true } });
  if (!r.ok) return null;
  return r.json();
}
async function api(req, env, url, p) {
  const ouvert = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "X-API-Key, Content-Type" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ouvert });
  const cle = req.headers.get("X-API-Key") || url.searchParams.get("cle") || url.searchParams.get("key") || "";
  const k = cle && await env.DLC.get("k:" + cle, "json");
  if (!k) return json({ erreur: "cle_invalide", message: "Clé API manquante ou inconnue. Demandez une clé : voir /api.html" }, 401, ouvert);
  if (k.active === false) return json({ erreur: "cle_revoquee" }, 403, ouvert);
  const origine = req.headers.get("Origin");
  let cors = ouvert;
  if (k.origines && k.origines.length) {
    if (origine && !k.origines.includes(origine)) return json({ erreur: "origine_refusee", message: "Ce site n'est pas autorisé pour cette clé." }, 403, ouvert);
    cors = Object.assign({}, ouvert, { "Access-Control-Allow-Origin": origine || k.origines[0], "Vary": "Origin" });
  }
  const jour = new Date().toISOString().slice(0, 10), cu = "u:" + cle + ":" + jour;
  const n = +(await env.DLC.get(cu) || 0);
  if (k.quota && n >= k.quota) return json({ erreur: "quota_atteint", quota: k.quota }, 429, cors);
  await env.DLC.put(cu, String(n + 1), { expirationTtl: 60 * 60 * 24 * 40 });
  const q = url.searchParams;
  const entetes = Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600", "X-Quota-Restant": k.quota ? String(k.quota - n - 1) : "illimité" }, cors);
  const rep = d => new Response(JSON.stringify(Object.assign(d, { licence: LICENCE })), { headers: entetes });

  if (p === "/v1/cle") return rep({ nom: k.nom, departements: k.deps || [], types: k.types || [], zone: k.zone || null, jours: k.jours || 0, quota: k.quota || 0, appels_aujourdhui: n + 1 });
  if (p === "/v1/departements") {
    const d = await donnees(env, "departements.json");
    let deps = (d && d.departements) || [];
    if (k.deps && k.deps.length) deps = deps.filter(x => k.deps.includes(x.code));
    return rep({ mise_a_jour: d && d.maj, resultats: deps.map(x => ({ code: x.code, nom: x.nom, sorties: x.n })) });
  }
  // départements demandés, limités à ceux de la clé
  let deps = liste(q.get("dep")).map(x => x.toUpperCase());
  if (k.deps && k.deps.length) {
    const demandes = deps.length;
    deps = demandes ? deps.filter(x => k.deps.includes(x)) : k.deps.slice();
    if (demandes && !deps.length) return json({ erreur: "departement_non_autorise", autorises: k.deps }, 403, cors);
    if (!demandes && deps.length > MAX_DEPS) deps = deps.slice(0, MAX_DEPS);
  }
  if (!deps.length) return json({ erreur: "dep_requis", message: "Indiquez un ou plusieurs départements : dep=03,58" }, 400, cors);
  if (deps.length > MAX_DEPS) return json({ erreur: "trop_de_departements", max: MAX_DEPS }, 400, cors);
  let types = liste(q.get("type"));
  const limite = Math.max(1, Math.min(500, parseInt(q.get("limite") || "100", 10) || 100)), page = Math.max(1, parseInt(q.get("page") || "1", 10) || 1);
  const commune = sansAccent(q.get("commune")), mot = sansAccent(q.get("q"));
  // position : zone de la clé (obligatoire si définie) et cercle demandé (lat, lon, rayon en km)
  const qlat = parseFloat(q.get("lat")), qlon = parseFloat(q.get("lon")), qr = Math.min(300, parseFloat(q.get("rayon")) || 20), aPos = isFinite(qlat) && isFinite(qlon);
  const dansZone = x => (!k.zone || km(k.zone.lat, k.zone.lon, x.lat, x.lon) <= k.zone.rayon) && (!aPos || km(qlat, qlon, x.lat, x.lon) <= qr);
  const dist = x => aPos ? Math.round(km(qlat, qlon, x.lat, x.lon) * 10) / 10 : (k.zone ? Math.round(km(k.zone.lat, k.zone.lon, x.lat, x.lon) * 10) / 10 : undefined);
  const parDistance = q.get("tri") === "distance";

  if (p === "/v1/lieux") {
    if (k.lieux === false) return json({ erreur: "lieux_non_autorises" }, 403, cors);
    const autorises = k.types && k.types.length ? k.types.filter(t => TYPES_LIEUX.includes(t)) : TYPES_LIEUX;
    if (types.length && !types.some(t => autorises.includes(t))) return json({ erreur: "type_non_autorise", autorises }, 403, cors);
    types = types.length ? types.filter(t => autorises.includes(t)) : autorises;
    let L = [];
    for (const d of deps) L = L.concat((await donnees(env, "lieux/" + d + ".json")) || []);
    L = L.filter(x => types.includes(x.k) && dansZone(x) && (!commune || sansAccent(x.w) === commune) && (!mot || sansAccent(x.t + " " + (x.d || "")).includes(mot)));
    if (parDistance) L.sort((a, b) => dist(a) - dist(b));
    const total = L.length; L = L.slice((page - 1) * limite, page * limite);
    return rep({ total, page, limite, resultats: L.map(x => ({ id: x.id, nom: x.t, type: x.k, commune: x.w, departement: x.z, adresse: x.a || "",
      description: x.d || "", site: x.u || "", telephone: x.tel || "", horaires_osm: x.oh || "", label: x.l || "", principal: !!x.m,
      latitude: x.lat, longitude: x.lon, distance_km: dist(x), source: x.src || "DATAtourisme" })) });
  }
  if (p === "/v1/sorties") {
    const autorises = k.types && k.types.length ? k.types.filter(t => TYPES_SORTIES.includes(t)) : TYPES_SORTIES;
    if (types.length && !types.some(t => autorises.includes(t))) return json({ erreur: "type_non_autorise", autorises }, 403, cors);
    types = types.length ? types.filter(t => autorises.includes(t)) : autorises;
    const auj = jour, du = /^\d{4}-\d{2}-\d{2}$/.test(q.get("du") || "") ? q.get("du") : auj;
    let au = /^\d{4}-\d{2}-\d{2}$/.test(q.get("au") || "") ? q.get("au") : "9999-12-31";
    if (k.jours) { const lim = new Date(Date.now() + k.jours * 864e5).toISOString().slice(0, 10); if (au > lim) au = lim; }
    let E = [];
    for (const d of deps) E = E.concat((await donnees(env, "dep/" + d + ".json")) || []);
    const gratuit = q.get("gratuit") === "1";
    E = E.filter(e => types.includes(e.cat) && (e.e || e.s) >= du && e.s <= au && (!gratuit || e.g) && dansZone(e) && (!commune || sansAccent(e.w) === commune) &&
      (!mot || sansAccent(e.t + " " + (e.d || "") + " " + (e.lieu || "")).includes(mot)));
    const deb = e => (e.s < du ? du : e.s), longue = e => (Date.parse(e.e || e.s) - Date.parse(e.s)) > 14 * 864e5;
    E.sort((a, b) => (longue(a) - longue(b)) || (parDistance ? dist(a) - dist(b) : 0) || (deb(a) < deb(b) ? -1 : deb(a) > deb(b) ? 1 : (a.h || "99") < (b.h || "99") ? -1 : 1));
    const total = E.length; E = E.slice((page - 1) * limite, page * limite);
    return rep({ total, page, limite, du, au, resultats: E.map(e => ({ id: e.id, titre: e.t, type: e.cat, debut: e.s, fin: e.e || e.s, heure: e.h || "",
      autres_dates: e.n || 0, commune: e.w, departement: e.z, lieu: e.lieu || "", description: e.d || "", lien: e.u || "", image: e.img || "",
      gratuit: !!e.g, latitude: e.lat, longitude: e.lon, distance_km: dist(e), source: e.src || "" })) });
  }
  return json({ erreur: "introuvable" }, 404, cors);
}

export default {
  async fetch(req, env) {
    const cors = corsPour(req, env), url = new URL(req.url), p = url.pathname.replace(/\/+$/, "");
    if (p.startsWith("/v1/")) return api(req, env, url, p);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (req.method === "GET" && p === "/agenda") {
      const auj = new Date().toISOString().slice(0, 10);
      const ev = (await tout(env, "a:")).filter(e => (e.e || e.s) >= auj);
      return new Response(JSON.stringify(ev), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", ...cors } });
    }

    if (req.method === "POST" && p === "/propose") {
      const ip = req.headers.get("CF-Connecting-IP") || "?";
      const cle = "rl:" + ip + ":" + new Date().toISOString().slice(0, 13);
      const n = +(await env.DLC.get(cle) || 0);
      if (n >= MAX_PAR_HEURE) return json({ erreur: "trop_de_demandes" }, 429, cors);
      await env.DLC.put(cle, String(n + 1), { expirationTtl: 3700 });
      let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
      const tous = Object.values(b || {}).join(" ");
      if (MOTS.test(tous)) return json({ erreur: "mot_refuse" }, 422, cors);
      const ici = new Date().toISOString();
      if (b.type === "sources") {
        const s = { id: id(), url: texte(b.url, 200), note: texte(b.note, 200), statut: "nouvelle", envoye: ici };
        if (s.url.length < 4) return json({ erreur: "incomplet" }, 400, cors);
        await env.DLC.put("s:" + s.id, JSON.stringify(s)); return json({ ok: true }, 200, cors);
      }
      const x = { id: id(), t: texte(b.t, 90), cat: texte(b.cat, 20), s: texte(b.s, 10), e: texte(b.e, 10), h: texte(b.h, 5), w: texte(b.w, 80),
                  z: texte(b.z, 3), lieu: texte(b.lieu, 90), d: texte(b.d, 400), u: texte(b.u, 300), img: texte(b.img, 400), org: texte(b.org, 60),
                  lat: +b.lat, lon: +b.lon, statut: "en_attente", envoye: ici };
      if (x.t.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(x.s) || !x.w || !isFinite(x.lat) || !isFinite(x.lon)) return json({ erreur: "incomplet" }, 400, cors);
      await env.DLC.put("p:" + x.id, JSON.stringify(x), { expirationTtl: 60 * 60 * 24 * 120 });
      return json({ ok: true }, 200, cors);
    }

    if (p.startsWith("/admin/")) {
      const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!env.ADMIN_TOKEN || tok !== env.ADMIN_TOKEN) return json({ erreur: "non_autorise" }, 401, cors);
      if (req.method === "GET" && p === "/admin/cles") {
        const out = []; let cursor;
        const jour = new Date().toISOString().slice(0, 10);
        do {
          const r = await env.DLC.list({ prefix: "k:", cursor });
          for (const it of r.keys) { const v = await env.DLC.get(it.name, "json"); if (v) { const cle = it.name.slice(2); out.push(Object.assign({ cle, appels_aujourdhui: +(await env.DLC.get("u:" + cle + ":" + jour) || 0) }, v)); } }
          cursor = r.list_complete ? null : r.cursor;
        } while (cursor);
        return json({ cles: out }, 200, cors);
      }
      if (req.method === "GET" && p === "/admin/list") {
        const [props, srcs, pub] = await Promise.all([tout(env, "p:"), tout(env, "s:"), tout(env, "a:")]);
        return json({ propositions: props.filter(x => x.statut === "en_attente"), sources: srcs.filter(x => x.statut !== "traitee"), publiees: pub }, 200, cors);
      }
      let b = {}; try { b = await req.json(); } catch {}
      const k = texte(b.id, 40);
      if (p === "/admin/publish" && b.event) {
        const e = b.event; e.id = k; e.p = 1;
        await env.DLC.put("a:" + k, JSON.stringify(e));
        await env.DLC.delete("p:" + k); return json({ ok: true }, 200, cors);
      }
      if (p === "/admin/refuse") { await env.DLC.delete("p:" + k); return json({ ok: true }, 200, cors); }
      if (p === "/admin/source") { await env.DLC.delete("s:" + k); return json({ ok: true }, 200, cors); }
      if (p === "/admin/unpublish") { await env.DLC.delete("a:" + k); return json({ ok: true }, 200, cors); }
      if (p === "/admin/cles" && req.method === "POST") {
        const cle = nouvelleCle(), r = reglages(b, { active: true, cree: new Date().toISOString(), quota: 5000, lieux: true });
        if (!r.nom) return json({ erreur: "nom_requis" }, 400, cors);
        if (r.zone && !(r.deps && r.deps.length)) r.deps = await depsDeZone(env, r.zone);
        await env.DLC.put("k:" + cle, JSON.stringify(r)); return json({ ok: true, cle, reglages: r }, 200, cors);
      }
      if (p === "/admin/cles/maj" || p === "/admin/cles/revoquer" || p === "/admin/cles/reactiver") {
        const cle = texte(b.cle, 80), anc = await env.DLC.get("k:" + cle, "json");
        if (!anc) return json({ erreur: "cle_inconnue" }, 404, cors);
        const r = p.endsWith("maj") ? reglages(b, anc) : Object.assign(anc, { active: p.endsWith("reactiver") });
        if (p.endsWith("maj") && b.zone !== undefined && r.zone && b.deps === undefined) r.deps = await depsDeZone(env, r.zone);
        await env.DLC.put("k:" + cle, JSON.stringify(r)); return json({ ok: true, reglages: r }, 200, cors);
      }
    }
    return json({ erreur: "introuvable" }, 404, cors);
  }
};
