/* Trucs de cathos : agenda des messes, veillées, pèlerinages… (déclinaison catholique de Trucs à faire, même serveur).
   Public :  POST /cathos/propose   { t, type, s, e?, h?, hf?, w, z, lieu?, d?, u?, org?, lat, lon } → en attente de validation
             GET  /cathos/agenda                                                                → événements publiés à venir
   Éditeur : GET  /admin/cathos                    → propositions en attente
             POST /admin/cathos/publier  { id, ...corrections } → publiée dans l'agenda
             POST /admin/cathos/refuser  { id }    POST /admin/cathos/retirer { id } (événement publié)
   Stockage KV : « pc:<id> » proposition (effacée après 120 jours), « cathos-agenda » liste publiée (passés retirés à chaque écriture). */
import { motRefuse, limite, lienSur, tout } from "./commun.js";

export const TYPES_CATHOS = ["messe-dominicale", "messe-semaine", "messe-anticipee", "messe-solennite", "messe-familles", "messe-latin", "laudes", "vepres", "complies",
  "celebration-parole", "semaine-sainte", "liturgie-orientale", "confession", "bapteme", "confirmation", "premiere-communion", "mariage", "ordination", "onction-malades",
  "adoration", "louange", "chapelet", "chemin-de-croix", "veillee", "neuvaine", "procession", "benediction", "pelerinage", "marche", "sanctuaire-marial", "retraite", "session",
  "conference", "debat", "groupe-biblique", "catechese", "cine-debat", "lecture", "parcours-decouverte", "soiree-jeunes", "eveil-foi", "familles", "rassemblement", "scouts-camps",
  "concert", "visite-eglise", "exposition", "creche", "repas", "kermesse", "brocante", "solidarite", "mission"];
const MAX_PAR_HEURE = 20;
const txt = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
const nouvelId = () => "c-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const jour = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
const heure = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h) ? h : "";
const auj = () => new Date().toISOString().slice(0, 10);

export function evenementPropre(b, id) {
  const x = { id: id || nouvelId(), t: txt(b.t, 90), type: TYPES_CATHOS.includes(b.type) ? b.type : "", s: jour(txt(b.s, 10)), e: jour(txt(b.e, 10)),
    h: heure(txt(b.h, 5)), hf: heure(txt(b.hf, 5)), w: txt(b.w, 80), z: txt(b.z, 3).toUpperCase(), lieu: txt(b.lieu, 90), d: txt(b.d, 600),
    u: lienSur(b.u), org: txt(b.org, 80), lat: +(+b.lat).toFixed(5), lon: +(+b.lon).toFixed(5) };
  if (x.e && x.e < x.s) x.e = "";
  return x;
}
const complet = x => x.t.length >= 4 && x.type && x.s && x.w && isFinite(x.lat) && isFinite(x.lon) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180;

async function agendaCathos(env) { return (await env.DLC.get("cathos-agenda", "json")) || []; }
async function majAgendaCathos(env, ajout, retrait) {
  const ids = new Set((retrait || []).concat((ajout || []).map(e => e.id))), a = auj();
  const out = (await agendaCathos(env)).filter(e => !ids.has(e.id) && (e.e || e.s) >= a).concat(ajout || []).sort((x, y) => (x.s + x.h < y.s + y.h ? -1 : 1));
  await env.DLC.put("cathos-agenda", JSON.stringify(out));
  return out;
}

/* Renvoie une réponse si la route concerne Trucs de cathos, sinon null. estAdmin() : contrôle du code éditeur (réponse d'erreur, ou null si autorisé) */
export async function cathos(req, env, p, cors, json, estAdmin) {
  if (req.method === "GET" && p === "/cathos/agenda") {
    const a = auj(), ev = (await agendaCathos(env)).filter(e => (e.e || e.s) >= a);
    return new Response(JSON.stringify(ev), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", ...cors } });
  }
  if (req.method === "POST" && p === "/cathos/propose") {
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    if (!limite("rlcp:" + ip, MAX_PAR_HEURE, 3600)) return json({ erreur: "trop_de_demandes" }, 429, cors);
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    if (!b || typeof b !== "object") return json({ erreur: "format" }, 400, cors);
    if (motRefuse(...Object.values(b).map(String))) return json({ erreur: "mot_refuse", message: "Un mot n’est pas accepté. Reformulez, s’il vous plaît." }, 422, cors);
    const x = evenementPropre(b);
    if (!complet(x)) return json({ erreur: "incomplet" }, 400, cors);
    if (x.s < auj()) return json({ erreur: "date_passee" }, 400, cors);
    await env.DLC.put("pc:" + x.id, JSON.stringify(Object.assign(x, { statut: "en_attente", envoye: new Date().toISOString() })), { expirationTtl: 60 * 60 * 24 * 120 });
    return json({ ok: true }, 200, cors);
  }
  if (!p.startsWith("/admin/cathos")) return null;
  const refus = await estAdmin(); if (refus) return refus;
  if (req.method === "GET" && p === "/admin/cathos") {
    return json({ propositions: (await tout(env, "pc:")).sort((a, b) => (a.envoye < b.envoye ? -1 : 1)), publies: await agendaCathos(env) }, 200, cors);
  }
  let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
  const id = txt(b && b.id, 40);
  if (!/^c-[a-z0-9]{4,20}$/.test(id)) return json({ erreur: "id" }, 400, cors);
  if (req.method === "POST" && p === "/admin/cathos/publier") {
    const orig = await env.DLC.get("pc:" + id, "json");
    if (!orig) return json({ erreur: "introuvable" }, 404, cors);
    const x = evenementPropre(Object.assign({}, orig, b), id);
    if (!complet(x)) return json({ erreur: "incomplet" }, 400, cors);
    await majAgendaCathos(env, [x], []); await env.DLC.delete("pc:" + id);
    return json({ ok: true, evenement: x }, 200, cors);
  }
  if (req.method === "POST" && p === "/admin/cathos/refuser") { await env.DLC.delete("pc:" + id); return json({ ok: true }, 200, cors); }
  if (req.method === "POST" && p === "/admin/cathos/retirer") { await majAgendaCathos(env, [], [id]); return json({ ok: true }, 200, cors); }
  return json({ erreur: "introuvable" }, 404, cors);
}
