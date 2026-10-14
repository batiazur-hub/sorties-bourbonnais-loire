// Tests du serveur (Cloudflare Worker) sans réseau : stockage KV en mémoire, données lues dans le dépôt.
// Lancer : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const w = (await import(path.join(RACINE, "worker/worker.js"))).default;

const SITE = "https://site.test/";
globalThis.fetch = async (u) => {
  u = String(u);
  if (!u.startsWith(SITE)) throw new Error("réseau interdit pendant les tests : " + u);
  const f = path.join(RACINE, u.slice(SITE.length));
  if (!fs.existsSync(f)) return new Response("absent", { status: 404 });
  return new Response(fs.readFileSync(f));
};
function kv() {
  const m = new Map(); let ecritures = 0;
  return { m, get ecritures() { return ecritures; },
    async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    async put(k, v) { ecritures++; m.set(k, v); }, async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; } };
}
const CODE_TEST = "code-editeur-de-test";
const env = () => ({ DLC: kv(), ADMIN_TOKEN: CODE_TEST, ORIGINS: "https://site.test", DATA_URL: SITE + "data/", SITE_URL: SITE });
const appel = async (e, chemin, o = {}) => {
  const r = await w.fetch(new Request("https://api.test" + chemin, { method: o.body ? "POST" : "GET", headers: o.headers || {}, body: o.body ? JSON.stringify(o.body) : undefined }), e, { waitUntil() {} });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  return { statut: r.status, j, t, h: r.headers };
};
const admin = { Authorization: "Bearer code-editeur-de-test", "Content-Type": "application/json" };
async function cle(e, reglages) { return (await appel(e, "/admin/cles", { headers: admin, body: Object.assign({ nom: "Test" }, reglages) })).j.cle; }

test("sans clé : 401 en JSON", async () => {
  const r = await appel(env(), "/v1/sorties?dep=03");
  assert.equal(r.statut, 401); assert.equal(r.j.erreur, "cle_invalide");
});

test("espace éditeur : mauvais code refusé, bon code accepté", async () => {
  const e = env();
  assert.equal((await appel(e, "/admin/cles", { headers: { Authorization: "Bearer faux" }, body: { nom: "x" } })).statut, 401);
  assert.match(await cle(e, {}), /^dlc_[0-9a-f]{36}$/);
});

test("sorties d'un département, format et licence", async () => {
  const e = env(), k = await cle(e, {});
  const r = await appel(e, "/v1/sorties?dep=03&limite=5", { headers: { "X-API-Key": k } });
  assert.equal(r.statut, 200); assert.ok(r.j.total > 0); assert.ok(r.j.resultats.length <= 5);
  for (const s of r.j.resultats) { assert.ok(s.id && s.titre && s.debut && s.commune); assert.equal(s.departement, "03"); }
  assert.match(r.j.licence, /Trucs à faire/);
});

test("position sans département : départements déduits, résultats triés par distance dans le rayon", async () => {
  const e = env(), k = await cle(e, {});
  const r = await appel(e, "/v1/sorties?lat=46.566&lon=3.333&rayon=15&tri=distance&limite=50&key=" + k);
  assert.equal(r.statut, 200); assert.ok(r.j.total > 0);
  const d = r.j.resultats.map(x => x.distance_km);
  assert.ok(d.every(x => x <= 15.05)); assert.deepEqual(d, [...d].sort((a, b) => a - b));
});

test("clé limitée : département et type hors réglages refusés, position hors zone refusée", async () => {
  const e = env(), k = await cle(e, { deps: "03", types: "brocante,musee" });
  assert.equal((await appel(e, "/v1/sorties?dep=75&key=" + k)).j.erreur, "departement_non_autorise");
  assert.equal((await appel(e, "/v1/sorties?type=sport&key=" + k)).j.erreur, "type_non_autorise");
  assert.equal((await appel(e, "/v1/sorties?lat=48.857&lon=2.352&rayon=10&key=" + k)).j.erreur, "hors_zone");
  const r = await appel(e, "/v1/sorties?key=" + k);
  assert.ok(r.j.resultats.every(x => x.type === "brocante" && x.departement === "03"));
});

test("clé limitée à une zone : rien hors du cercle", async () => {
  const e = env(), k = await cle(e, { zone: { lat: 46.566, lon: 3.333, rayon: 10, nom: "Moulins" } });
  const r = await appel(e, "/v1/lieux?limite=500&key=" + k);
  assert.equal(r.statut, 200); assert.ok(r.j.total > 0); assert.ok(r.j.resultats.every(x => x.distance_km <= 10.05));
});

test("sites autorisés : autre site refusé, site autorisé accepté", async () => {
  const e = env(), k = await cle(e, { deps: "03", origines: "https://www.ville.test" });
  assert.equal((await appel(e, "/v1/cle?key=" + k, { headers: { Origin: "https://pirate.test" } })).j.erreur, "origine_refusee");
  const ok = await appel(e, "/v1/cle?key=" + k, { headers: { Origin: "https://www.ville.test" } });
  assert.equal(ok.statut, 200); assert.equal(ok.h.get("Access-Control-Allow-Origin"), "https://www.ville.test");
});

test("quota : bloqué au-delà, et écritures KV regroupées", async () => {
  const e = env(), k = await cle(e, { deps: "03", quota: 30 }); const avant = e.DLC.ecritures;
  for (let i = 0; i < 30; i++) assert.equal((await appel(e, "/v1/cle?key=" + k)).statut, 200);
  assert.equal((await appel(e, "/v1/cle?key=" + k)).j.erreur, "quota_atteint");
  assert.ok(e.DLC.ecritures - avant <= 3, "trop d'écritures KV : " + (e.DLC.ecritures - avant));
});

test("clé révoquée puis réactivée", async () => {
  const e = env(), k = await cle(e, { deps: "03" });
  await appel(e, "/admin/cles/revoquer", { headers: admin, body: { cle: k } });
  assert.equal((await appel(e, "/v1/cle?key=" + k)).j.erreur, "cle_revoquee");
  await appel(e, "/admin/cles/reactiver", { headers: admin, body: { cle: k } });
  assert.equal((await appel(e, "/v1/cle?key=" + k)).statut, 200);
});

test("bibliothèque /v1/dlc.js servie avec l'adresse du serveur", async () => {
  const r = await appel(env(), "/v1/dlc.js?key=dlc_x");
  assert.equal(r.statut, 200); assert.match(r.h.get("Content-Type"), /javascript/);
  assert.ok(r.t.includes('"https://api.test"')); assert.ok(!r.t.includes("__DLC_API__"));
});

test("proposition, publication, agenda public, retrait", async () => {
  const e = env();
  const ev = { t: "Brocante de test", cat: "brocante", s: "2099-06-01", w: "Moulins", z: "03", lat: 46.56, lon: 3.33 };
  assert.equal((await appel(e, "/propose", { headers: { "Content-Type": "application/json" }, body: ev })).statut, 200);
  const att = (await appel(e, "/admin/list", { headers: admin })).j.propositions;
  assert.equal(att.length, 1);
  await appel(e, "/admin/publish", { headers: admin, body: { id: att[0].id, event: Object.assign({}, att[0]) } });
  assert.equal((await appel(e, "/agenda")).j.length, 1);
  await appel(e, "/admin/unpublish", { headers: admin, body: { id: att[0].id } });
  assert.equal((await appel(e, "/agenda")).j.length, 0);
});

test("propositions : mots grossiers refusés, champs obligatoires", async () => {
  const e = env(), h = { "Content-Type": "application/json" };
  assert.equal((await appel(e, "/propose", { headers: h, body: { t: "Soirée putain", s: "2099-01-01", w: "X", lat: 1, lon: 1 } })).statut, 422);
  assert.equal((await appel(e, "/propose", { headers: h, body: { t: "Sans date", w: "X" } })).statut, 400);
});

test("erreur interne : réponse JSON 500 avec CORS, jamais de page HTML", async () => {
  const e = env(); e.DLC.get = async () => { throw new Error("panne KV"); };
  const r = await appel(e, "/v1/sorties?dep=03&key=dlc_x");
  assert.equal(r.statut, 500); assert.equal(r.j.erreur, "erreur_serveur"); assert.ok(r.h.get("Access-Control-Allow-Origin"));
});

test("sortie proposée avec billetterie : champ « billetterie » dans l'API", async () => {
  const e = env(), k = await cle(e, {});
  const ev = { t: "Concert de test", cat: "spectacle", s: "2099-06-01", w: "Moulins", z: "03", lat: 46.56, lon: 3.33, b: "https://www.billetweb.fr/test" };
  await appel(e, "/propose", { headers: { "Content-Type": "application/json" }, body: ev });
  const att = (await appel(e, "/admin/list", { headers: admin })).j.propositions;
  assert.equal(att[0].b, "https://www.billetweb.fr/test");
  const r = await appel(e, "/v1/sorties?dep=03&limite=3&key=" + k);
  assert.ok(r.j.resultats.every(s => "billetterie" in s));
});

/* ---------- Comptes ---------- */
const { signature } = await import(path.join(RACINE, "worker/comptes.js"));
const envC = () => Object.assign(env(), { MODE_TEST: "1" });
const jsonH = { "Content-Type": "application/json" };
async function inscrire(e, email, extra) {
  const r = await appel(e, "/compte/lien", { headers: jsonH, body: Object.assign({ email, cgu: true }, extra || {}) });
  const jeton = r.j.lien.split("#connexion=")[1];
  return (await appel(e, "/compte/connexion", { headers: jsonH, body: { jeton } })).j;
}

test("comptes : CGU obligatoires, e-mail vérifié, sans service d'envoi = 503 propre", async () => {
  assert.equal((await appel(envC(), "/compte/lien", { headers: jsonH, body: { email: "a@b.fr" } })).j.erreur, "cgu_requises");
  assert.equal((await appel(envC(), "/compte/lien", { headers: jsonH, body: { email: "pas-un-mail", cgu: true } })).j.erreur, "email_invalide");
  assert.equal((await appel(env(), "/compte/lien", { headers: jsonH, body: { email: "a@b.fr", cgu: true } })).statut, 503);
});

test("comptes : inscription par lien, double opt-in newsletter, lien à usage unique", async () => {
  const e = envC();
  const r = await appel(e, "/compte/lien", { headers: jsonH, body: { email: "Lea@Exemple.fr", cgu: true, newsletter: true,
    prefs: { commune: { nom: "Moulins", dep: "03", lat: 46.5661234, lon: 3.3334 }, rayon: 40, cats: ["brocante", "inconnu"] }, fav: ["dt-1"] } });
  const jeton = r.j.lien.split("#connexion=")[1];
  assert.equal(e.DLC.m.size > 0 && [...e.DLC.m.keys()].some(k => k.startsWith("cpt:")), false, "aucun compte avant le clic");
  assert.ok(![...e.DLC.m.keys()].some(k => k.includes(jeton)), "jeton jamais stocké en clair");
  const c = (await appel(e, "/compte/connexion", { headers: jsonH, body: { jeton } })).j;
  assert.equal(c.nouveau, true); assert.equal(c.compte.email, "lea@exemple.fr"); assert.equal(c.compte.newsletter, true);
  assert.equal(c.compte.prefs.rayon, 40); assert.deepEqual(c.compte.prefs.cats, ["brocante"]); assert.equal(c.compte.prefs.commune.lat, 46.566);
  assert.deepEqual(c.compte.fav, ["dt-1"]);
  assert.equal((await appel(e, "/compte/connexion", { headers: jsonH, body: { jeton } })).j.erreur, "lien_expire");
});

test("comptes : profil, retrait du consentement tracé, export, désinscription signée, suppression", async () => {
  const e = envC(), c = await inscrire(e, "tom@exemple.fr", { newsletter: true });
  const auth = { Authorization: "Bearer " + c.session, "Content-Type": "application/json" };
  assert.equal((await appel(e, "/compte")).statut, 401);
  const m = await appel(e, "/compte", { headers: auth, body: { newsletter: false, fav: ["a", "a", "b"], prefs: { rayon: 500 } } });
  assert.equal(m.j.compte.newsletter, false); assert.deepEqual(m.j.compte.fav, ["a", "b"]); assert.equal(m.j.compte.prefs.rayon, 100);
  const x = await appel(e, "/compte/export", { headers: auth });
  assert.deepEqual(x.j.compte.consentements.map(k => k.action), ["accord", "retrait"]); assert.ok(!("sessions" in x.j.compte));
  await appel(e, "/compte", { headers: auth, body: { newsletter: true } });
  const id = x.j.compte.id;
  assert.match((await appel(e, "/newsletter/stop?c=" + id + "&s=faux")).t, /invalide/);
  assert.match((await appel(e, "/newsletter/stop?c=" + id + "&s=" + await signature(e, id))).t, /désinscrit/);
  assert.equal((await appel(e, "/compte", { headers: auth })).j.compte.newsletter, false);
  await appel(e, "/compte/supprimer", { headers: auth, body: {} });
  assert.equal((await appel(e, "/compte", { headers: auth })).statut, 401);
  assert.ok(![...e.DLC.m.keys()].some(k => k.startsWith("cpt:") || k.startsWith("ses:")), "tout est effacé");
});

test("comptes : trop de demandes de lien refusées", async () => {
  const e = envC(); let dernier;
  for (let i = 0; i < 5; i++) dernier = await appel(e, "/compte/lien", { headers: jsonH, body: { email: "x@exemple.fr", cgu: true } });
  assert.equal(dernier.statut, 429);
});

test("comptes : suppression automatique après 3 ans sans connexion", async () => {
  const { purgerInactifs } = await import(path.join(RACINE, "worker/comptes.js"));
  const e = envC(); await inscrire(e, "actif@exemple.fr"); await inscrire(e, "ancien@exemple.fr");
  for (const [k, v] of e.DLC.m) if (k.startsWith("cpt:") && v.includes("ancien")) { const c = JSON.parse(v); c.vu = "2020-01-01"; e.DLC.m.set(k, JSON.stringify(c)); }
  assert.equal(await purgerInactifs(e), 1);
  assert.equal([...e.DLC.m.keys()].filter(k => k.startsWith("cpt:")).length, 1);
});
