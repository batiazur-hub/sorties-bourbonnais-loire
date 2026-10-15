/* Trucs à faire : fonctionnement hors ligne de l'application installée.
   - coquille (page, polices, icônes, illustrations) gardée en cache dès l'installation ;
   - données des sorties (data/*.json) et config.js : réseau d'abord (4 s au plus si une copie existe), dernière copie si hors ligne ;
   - pages visitées : réseau d'abord, seules les réponses correctes sont gardées, 40 pages au plus ;
   - autres fichiers du site : copie en cache tout de suite, mise à jour en arrière-plan ;
   - VERSION est remplacée à chaque publication par l'empreinte de index.html (publier.yml).
   - services extérieurs (cartes, serveur des comptes, photos) : jamais mis en cache ici. */
const VERSION = "taf-2026-10-15";
const COQUILLE = ["./", "index.html", "config.js", "manifest.webmanifest", "fonts/trucs.css",
  "fonts/outfit-latin-700-normal.woff2", "fonts/outfit-latin-600-normal.woff2", "fonts/dm-sans-latin-400-normal.woff2", "fonts/dm-sans-latin-600-normal.woff2", "fonts/dm-sans-latin-700-normal.woff2",
  "marque/icone-favicon.svg", "marque/icone-192.png",
  "marque/illustrations/brocante.svg", "marque/illustrations/fete.svg", "marque/illustrations/spectacle.svg", "marque/illustrations/culture.svg",
  "marque/illustrations/famille.svg", "marque/illustrations/sport.svg", "marque/illustrations/pal.svg"];

self.addEventListener("install", ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", ev => {
  ev.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION && x !== VERSION + "-pages").map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
const PAGES = VERSION + "-pages", MAX_PAGES = 40;
async function garder(nom, r, rep, max) {
  const c = await caches.open(nom); await c.put(r, rep);
  if (max) { const k = await c.keys(); for (let i = 0; i < k.length - max; i++) await c.delete(k[i]); }
}
/* Réseau d'abord ; si une copie existe et que le réseau traîne plus de 4 s, la copie sert (elle sera rafraîchie à la visite suivante) */
function reseauDabord(ev, nom, max) {
  const r = ev.request, reseau = fetch(r).then(rep => { if (rep.ok) ev.waitUntil(garder(nom, r, rep.clone(), max)); return rep; });
  return caches.match(r).then(m => {
    if (!m) return reseau.catch(() => caches.match("index.html"));
    return Promise.race([reseau.catch(() => m), new Promise(ok => setTimeout(() => ok(m), 4000))]);
  });
}
self.addEventListener("fetch", ev => {
  const r = ev.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (/\/data\/.*\.json$/.test(u.pathname) || /\/config\.js$/.test(u.pathname)) return void ev.respondWith(reseauDabord(ev, VERSION));
  if (r.mode === "navigate") return void ev.respondWith(reseauDabord(ev, PAGES, MAX_PAGES));
  ev.respondWith(caches.match(r).then(m => {
    const frais = fetch(r).then(rep => { if (rep.ok) ev.waitUntil(garder(VERSION, r, rep.clone())); return rep; }).catch(() => m);
    return m || frais;
  }));
});
