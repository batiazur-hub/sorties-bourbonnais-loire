/* Dans le coin : serveur des propositions (Cloudflare Worker + KV).
   Public :  POST /propose   { type: "propositions" | "sources", ... }   → mise en attente
             GET  /agenda                                             → sorties validées
   Éditeur : en-tête Authorization: Bearer <ADMIN_TOKEN>
             GET  /admin/list                → propositions et sources en attente
             POST /admin/publish   { id, event }   POST /admin/refuse { id }
             POST /admin/source    { id }          POST /admin/unpublish { id }
   Variables : KV « DLC », secret « ADMIN_TOKEN », variable « ORIGINS » (origines autorisées, séparées par des virgules). */

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

export default {
  async fetch(req, env) {
    const cors = corsPour(req, env), url = new URL(req.url), p = url.pathname.replace(/\/+$/, "");
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
    }
    return json({ erreur: "introuvable" }, 404, cors);
  }
};
