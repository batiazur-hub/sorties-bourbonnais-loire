/* Trucs à faire : fonctionnement hors ligne de l'application installée.
   - coquille (page, polices, icônes, illustrations) gardée en cache dès l'installation ;
   - données des sorties (data/*.json) : réseau d'abord, dernière copie si hors ligne ;
   - autres fichiers du site : copie en cache tout de suite, mise à jour en arrière-plan ;
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
  ev.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", ev => {
  const r = ev.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (/\/data\/.*\.json$/.test(u.pathname)) {
    ev.respondWith(fetch(r).then(rep => { if (rep.ok) { const c = rep.clone(); caches.open(VERSION).then(x => x.put(r, c)); } return rep; })
      .catch(() => caches.match(r)));
    return;
  }
  if (r.mode === "navigate") {
    ev.respondWith(fetch(r).then(rep => { const c = rep.clone(); caches.open(VERSION).then(x => x.put(r, c)); return rep; })
      .catch(() => caches.match(r).then(m => m || caches.match("index.html"))));
    return;
  }
  ev.respondWith(caches.match(r).then(m => {
    const frais = fetch(r).then(rep => { if (rep.ok) { const c = rep.clone(); caches.open(VERSION).then(x => x.put(r, c)); } return rep; }).catch(() => m);
    return m || frais;
  }));
});
