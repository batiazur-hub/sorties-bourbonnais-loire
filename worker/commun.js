/* Outils partagés par worker.js, comptes.js et newsletter.js */

/* Mots refusés : recherche sur des MOTS ENTIERS, après passage en minuscules sans accents.
   « pique-nique », « musique », « technique », « salopette », « Saint-Dominique » passent. */
const sansAccent = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const GROS = /(^|[^a-z0-9])(encul(?:e|es|er|ee|ees|eurs?)|connards?|connasses?|salop(?:e|es|s)?|putes?|putains?|merdes?|fdp|ntm|nique ta|niquer|batards?|pd|tafioles?|negros?|bougnoules?|youpins?)(?![a-z0-9])/;
export const motRefuse = (...v) => GROS.test(sansAccent(v.filter(x => x != null).join(" ")));

/* Comparaison à durée constante (codes, signatures) */
export function egal(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  if (x.length !== y.length) return false;
  if (crypto.subtle && crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(x, y);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0;
}

/* Limitation de débit EN MÉMOIRE (par instance du Worker) : aucune écriture KV, donc un robot ne peut pas épuiser
   le quota gratuit de 1 000 écritures par jour. Limite « au mieux » : Cloudflare peut répartir un robot sur plusieurs
   instances. Pour une limite globale stricte, ajouter une règle de limitation de débit Cloudflare (WAF, gratuite pour
   une règle) ou le binding Rate Limiting : voir worker/LISEZMOI.md. */
const COMPTEURS = new Map();
export function limite(cle, max, secondes) {
  const t = Date.now();
  if (COMPTEURS.size > 5000) for (const [k, v] of COMPTEURS) if (v.fin < t) COMPTEURS.delete(k);
  let c = COMPTEURS.get(cle);
  if (!c || c.fin < t) { c = { n: 0, fin: t + secondes * 1000 }; COMPTEURS.set(cle, c); }
  if (c.n >= max) return false;
  c.n++; return true;
}
export function epuise(cle, max) { const c = COMPTEURS.get(cle); return !!c && c.fin >= Date.now() && c.n >= max; }
export const viderLimites = () => COMPTEURS.clear();  // tests

/* ---------- Sorties publiées (« a:<id> ») et récapitulatif « agenda » ----------
   « agenda » est mis à jour par ajout / retrait de l'élément concerné : KV.list() n'est pas cohérent tout de suite
   (jusqu'à ~60 s), on ne s'en sert que pour reconstruire un récapitulatif absent. */
export async function tout(env, prefix) {
  const out = []; let cursor;
  do {
    const r = await env.DLC.list({ prefix, cursor });
    for (const k of r.keys) { const v = await env.DLC.get(k.name, "json"); if (v) out.push(v); }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}
export async function agenda(env) {
  let a = await env.DLC.get("agenda", "json");
  if (!a) { a = await tout(env, "a:"); await env.DLC.put("agenda", JSON.stringify(a)); }
  return a;
}
const hier = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);
export async function majAgenda(env, { ajout = [], retrait = [] } = {}) {
  const a = await agenda(env), ids = new Set(retrait.concat(ajout.map(e => e.id)));
  const out = a.filter(e => !ids.has(e.id) && (e.e || e.s) >= hier()).concat(ajout);
  await env.DLC.put("agenda", JSON.stringify(out));
  return out;
}
/* Une sortie publiée disparaît d'elle-même 30 jours après sa fin (durée annoncée dans la politique de confidentialité) */
export function ttlSortie(e) {
  const fin = Date.parse((e.e || e.s) + "T23:59:59Z");
  return Math.max(3600, Math.round(((isFinite(fin) ? fin : Date.now()) + 30 * 864e5 - Date.now()) / 1000));
}
export async function publier(env, e) {
  await env.DLC.put("a:" + e.id, JSON.stringify(e), { expirationTtl: ttlSortie(e) });
  return majAgenda(env, { ajout: [e] });
}
export async function retirer(env, ids) {
  for (const id of ids) await env.DLC.delete("a:" + id);
  return majAgenda(env, { retrait: ids });
}
