/*! Trucs à faire — bibliothèque JavaScript v1
 *  Sorties, fêtes, brocantes, concerts et lieux à visiter partout en France.
 *  Documentation : https://batiazur-hub.github.io/sorties-bourbonnais-loire/api.html
 *
 *  <script src="https://VOTRE-SERVEUR/v1/dlc.js?key=VOTRE_CLE&callback=initCoin" async></script>
 *
 *  TrucsAFaire.sorties({ autour: { lat: 46.56, lon: 3.33 }, rayon: 20, types: ["brocante"], periode: "weekend" })
 *  TrucsAFaire.lieux({ dep: "03", types: ["musee"] })
 *  new TrucsAFaire.Liste("#agenda", { periode: "semaine", limite: 6 })
 *  new TrucsAFaire.Carte("#carte", { autour: { lat: 46.56, lon: 3.33 }, rayon: 25 })
 *
 *  Données : DATAtourisme (Licence Ouverte), OpenAgenda, open data des collectivités, OpenStreetMap (ODbL).
 *  © Saryn Digital — Clément Monteiro EI.
 */
(function (w, d) {
  "use strict";
  if ((w.TrucsAFaire && w.TrucsAFaire.version) || (w.DansLeCoin && w.DansLeCoin.version)) return;

  var VERSION = "1.0.0";
  var API_INJECTEE = "__DLC_API__"; // remplacé par l'adresse du serveur quand le fichier est servi par /v1/dlc.js
  var SITE = "https://batiazur-hub.github.io/sorties-bourbonnais-loire/";
  var LICENCE = "Données agrégées par Trucs à faire (Saryn Digital) depuis DATAtourisme (Licence Ouverte), OpenAgenda, open data des collectivités et OpenStreetMap (ODbL, horaires). Citer « Trucs à faire » et la source de chaque fiche.";
  var TYPES_SORTIES = ["brocante", "fete", "spectacle", "culture", "famille", "sport", "pal"];
  var TYPES_LIEUX = ["office", "musee", "patrimoine", "nature", "loisirs"];
  var NOMS = { brocante: "Brocante", fete: "Fête, marché", spectacle: "Concert, spectacle", culture: "Expo, visite", famille: "En famille",
    sport: "Sport, rando", pal: "Le Pal", office: "Office de tourisme", musee: "Musée", patrimoine: "Patrimoine", nature: "Nature", loisirs: "Loisirs" };
  var COULEURS = { brocante: "#c2410c", fete: "#d6336c", spectacle: "#7c3aed", culture: "#0f766e", famille: "#ca8a04", sport: "#15803d", pal: "#b45309",
    office: "#1c64b8", musee: "#1c64b8", patrimoine: "#1c64b8", nature: "#1c64b8", loisirs: "#1c64b8" };

  /* ---------- Réglages : clé et serveur lus sur la balise <script> ---------- */
  var script = d.currentScript, sp = {};
  try { if (script && script.src) new URL(script.src, location.href).searchParams.forEach(function (v, k) { sp[k] = v; }); } catch (e) {}
  var ds = (script && script.dataset) || {};
  function serveurParDefaut() {
    if (/^https?:\/\//.test(API_INJECTEE)) return API_INJECTEE;
    if (ds.serveur) return ds.serveur;
    try { var u = new URL(script.src, location.href); if (/\/v1\/dlc\.js$/.test(u.pathname)) return u.origin; } catch (e) {}
    return (w.SORTIES_CONFIG && w.SORTIES_CONFIG.apiUrl) || null;
  }
  function donneesParDefaut() {
    if (ds.donnees) return ds.donnees;
    try { var u = new URL(script.src, location.href); if (/\/dlc\.js$/.test(u.pathname) && !/\/v1\//.test(u.pathname)) return u.href.replace(/dlc\.js.*$/, "data/"); } catch (e) {}
    return SITE + "data/";
  }
  var cfg = { cle: sp.key || sp.cle || ds.cle || null, serveur: serveurParDefaut(), donnees: donneesParDefaut(), langue: "fr-FR" };

  /* ---------- Erreurs ---------- */
  function Erreur(code, statut, message, details) {
    var e = new Error(message || code); e.name = "TrucsAFaireErreur"; e.code = code; e.statut = statut || 0; e.details = details || null;
    Object.setPrototypeOf(e, Erreur.prototype); return e;
  }
  Erreur.prototype = Object.create(Error.prototype); Erreur.prototype.constructor = Erreur;

  /* ---------- Dates ---------- */
  function iso(x) { if (!x) return ""; if (x instanceof Date) return x.getFullYear() + "-" + ("0" + (x.getMonth() + 1)).slice(-2) + "-" + ("0" + x.getDate()).slice(-2); return String(x).slice(0, 10); }
  function plus(j) { var x = new Date(); x.setDate(x.getDate() + j); return x; }
  function periode(p) {
    var auj = new Date(), j = auj.getDay();
    switch (p) {
      case "aujourdhui": case "aujourd'hui": return [iso(auj), iso(auj)];
      case "demain": return [iso(plus(1)), iso(plus(1))];
      case "weekend": case "week-end": var a = j === 0 ? 0 : j === 6 ? 0 : 6 - j, b = j === 0 ? 0 : 7 - j; return [iso(plus(a)), iso(plus(b))];
      case "semaine": return [iso(auj), iso(plus(7))];
      case "mois": return [iso(auj), iso(plus(31))];
      default: var n = parseInt(p, 10); return n > 0 ? [iso(auj), iso(plus(n))] : [null, null];
    }
  }

  /* ---------- Options → paramètres de l'API ---------- */
  function liste(v) { return v == null ? [] : (Array.isArray(v) ? v : String(v).split(",")).map(function (x) { return String(x).trim(); }).filter(Boolean); }
  function parametres(o) {
    o = o || {}; var p = {};
    var dep = liste(o.dep || o.departements); if (dep.length) p.dep = dep.join(",");
    var ty = liste(o.type || o.types); if (ty.length) p.type = ty.join(",");
    var per = o.periode ? periode(o.periode) : [null, null];
    if (o.du || per[0]) p.du = iso(o.du || per[0]);
    if (o.au || per[1]) p.au = iso(o.au || per[1]);
    var c = o.autour || o.centre;
    if (c && isFinite(c.lat) && isFinite(c.lon != null ? c.lon : c.lng)) { p.lat = +c.lat; p.lon = +(c.lon != null ? c.lon : c.lng); }
    if (isFinite(o.lat) && isFinite(o.lon)) { p.lat = +o.lat; p.lon = +o.lon; }
    if (o.rayon) p.rayon = +o.rayon;
    if (o.tri) p.tri = o.tri; else if (p.lat != null && o.tri !== false && o.parDistance) p.tri = "distance";
    if (o.commune) p.commune = o.commune;
    if (o.recherche || o.q) p.q = o.recherche || o.q;
    if (o.gratuit) p.gratuit = 1;
    if (o.limite) p.limite = +o.limite;
    if (o.page) p.page = +o.page;
    return p;
  }

  /* ---------- Appel au serveur (ou mode démonstration sur les données publiques) ---------- */
  function appel(chemin, o) {
    var p = parametres(o);
    var promesse = cfg.serveur ? distant(chemin, p) : demo(chemin, p);
    return promesse.then(function (r) {
      if (r && r.total != null && r.page && r.limite && r.page * r.limite < r.total)
        r.suivante = function () { return appel(chemin, Object.assign({}, o, { page: r.page + 1 })); };
      return r;
    });
  }
  function urlRequete(chemin, p, avecCle) {
    var base = (cfg.serveur || "https://VOTRE-SERVEUR").replace(/\/+$/, "");
    var q = Object.keys(p).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(p[k]); });
    if (avecCle !== false) q.push("key=" + encodeURIComponent(cfg.cle || "VOTRE_CLE"));
    return base + chemin + (q.length ? "?" + q.join("&") : "");
  }
  function distant(chemin, p) {
    if (!cfg.cle) return Promise.reject(Erreur("cle_manquante", 0, "Aucune clé API : ajoutez ?key=VOTRE_CLE à l'adresse du script ou appelez TrucsAFaire.configurer({ cle: '…' })."));
    return fetch(urlRequete(chemin, p)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw Erreur(j.erreur || "http_" + r.status, r.status, j.message || ("Erreur " + r.status), j);
        j.quota_restant = r.headers.get("X-Quota-Restant"); return j;
      });
    }, function (e) { throw Erreur("reseau", 0, "Serveur injoignable : " + e.message); });
  }

  /* Mode démonstration : sans serveur, la bibliothèque lit directement les fichiers publics du site,
     avec les mêmes paramètres et le même format de réponse que l'API (sans quota ni restriction de clé). */
  var cache = {};
  function json(chemin) {
    if (!cache[chemin]) cache[chemin] = fetch(cfg.donnees + chemin).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return cache[chemin];
  }
  function km(a, b, c, e) { var x = (e - b) * Math.cos((a + c) / 2 * Math.PI / 180) * 111.32, y = (c - a) * 110.57; return Math.sqrt(x * x + y * y); }
  function sansAccent(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function demo(chemin, p) {
    return json("departements.json").then(function (D) {
      var tous = (D && D.departements) || [], rep = function (o) { o.licence = LICENCE; o.demo = true; return o; };
      if (chemin === "/v1/cle") return rep({ nom: "Démonstration (sans clé)", departements: [], types: [], zone: null, jours: 0, quota: 0 });
      if (chemin === "/v1/departements") return rep({ mise_a_jour: D && D.maj, resultats: tous.map(function (x) { return { code: x.code, nom: x.nom, sorties: x.n }; }) });
      var aPos = p.lat != null && p.lon != null, rayon = Math.min(300, p.rayon || 20);
      var deps = liste(p.dep).map(function (x) { return x.toUpperCase(); });
      if (!deps.length && aPos) deps = tous.map(function (x) { return [x.code, km(p.lat, p.lon, x.lat, x.lon)]; }).filter(function (x) { return x[1] <= rayon + 90; })
        .sort(function (a, b) { return a[1] - b[1]; }).slice(0, 8).map(function (x) { return x[0]; });
      if (!deps.length) throw Erreur("dep_requis", 400, "Indiquez un ou plusieurs départements (dep) ou une position (autour).");
      if (deps.length > 8) throw Erreur("trop_de_departements", 400, "8 départements au plus par appel.");
      var lieux = chemin === "/v1/lieux", permis = lieux ? TYPES_LIEUX : TYPES_SORTIES;
      var types = liste(p.type).filter(function (t) { return permis.indexOf(t) >= 0; }); if (!types.length) types = permis;
      var limite = Math.max(1, Math.min(500, p.limite || 100)), page = Math.max(1, p.page || 1);
      var commune = sansAccent(p.commune), mot = sansAccent(p.q);
      var dist = function (x) { return aPos ? Math.round(km(p.lat, p.lon, x.lat, x.lon) * 10) / 10 : undefined; };
      var dedans = function (x) { return !aPos || km(p.lat, p.lon, x.lat, x.lon) <= rayon; };
      return Promise.all(deps.map(function (c) { return json((lieux ? "lieux/" : "dep/") + c + ".json"); })).then(function (parts) {
        var L = [].concat.apply([], parts.map(function (x) { return x || []; }));
        if (lieux) {
          L = L.filter(function (x) { return types.indexOf(x.k) >= 0 && dedans(x) && (!commune || sansAccent(x.w) === commune) && (!mot || sansAccent(x.t + " " + (x.d || "")).indexOf(mot) >= 0); });
          if (p.tri === "distance") L.sort(function (a, b) { return dist(a) - dist(b); });
          var t = L.length; L = L.slice((page - 1) * limite, page * limite);
          return rep({ total: t, page: page, limite: limite, resultats: L.map(function (x) { return { id: x.id, nom: x.t, type: x.k, commune: x.w, departement: x.z, adresse: x.a || "",
            description: x.d || "", site: x.u || "", telephone: x.tel || "", horaires_osm: x.oh || "", label: x.l || "", principal: !!x.m,
            latitude: x.lat, longitude: x.lon, distance_km: dist(x), source: x.src || "DATAtourisme" }; }) });
        }
        var du = p.du || iso(new Date()), au = p.au || "9999-12-31";
        L = L.filter(function (e) { return types.indexOf(e.cat) >= 0 && (e.e || e.s) >= du && e.s <= au && (!p.gratuit || e.g) && dedans(e) && (!commune || sansAccent(e.w) === commune) &&
          (!mot || sansAccent(e.t + " " + (e.d || "") + " " + (e.lieu || "")).indexOf(mot) >= 0); });
        var deb = function (e) { return e.s < du ? du : e.s; }, longue = function (e) { return (Date.parse(e.e || e.s) - Date.parse(e.s)) > 14 * 864e5; };
        L.sort(function (a, b) { return (longue(a) - longue(b)) || (p.tri === "distance" ? dist(a) - dist(b) : 0) || (deb(a) < deb(b) ? -1 : deb(a) > deb(b) ? 1 : (a.h || "99") < (b.h || "99") ? -1 : 1); });
        var n = L.length; L = L.slice((page - 1) * limite, page * limite);
        return rep({ total: n, page: page, limite: limite, du: du, au: au, resultats: L.map(function (e) { return { id: e.id, titre: e.t, type: e.cat, debut: e.s, fin: e.e || e.s, heure: e.h || "",
          autres_dates: e.n || 0, commune: e.w, departement: e.z, lieu: e.lieu || "", description: e.d || "", lien: e.u || "", billetterie: e.b || "", image: e.img || "",
          gratuit: !!e.g, latitude: e.lat, longitude: e.lon, distance_km: dist(e), source: e.src || "" }; }) });
      });
    });
  }

  /* ---------- Position du visiteur ---------- */
  function position(o) {
    return new Promise(function (ok, ko) {
      if (!navigator.geolocation) return ko(Erreur("geolocalisation_indisponible", 0, "Ce navigateur ne donne pas sa position."));
      navigator.geolocation.getCurrentPosition(function (p) { ok({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy }); },
        function (e) { ko(Erreur("geolocalisation_refusee", 0, e.message || "Position refusée.")); }, Object.assign({ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }, o || {}));
    });
  }

  /* ---------- Mise en forme ---------- */
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."], JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  function jour(s) { var a = s.split("-").map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function dateCourte(x) {
    if (!x || !x.debut) return "";
    var a = jour(x.debut), b = jour(x.fin || x.debut), h = x.heure ? " · " + x.heure.replace(":", "h") : "";
    if (+a === +b) return JOURS[a.getDay()] + " " + a.getDate() + " " + MOIS[a.getMonth()] + h;
    return "du " + a.getDate() + (a.getMonth() === b.getMonth() ? "" : " " + MOIS[a.getMonth()]) + " au " + b.getDate() + " " + MOIS[b.getMonth()];
  }
  function el(tag, cls, txt) { var e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function cible(x) { var e = typeof x === "string" ? d.querySelector(x) : x; if (!e) throw Erreur("element_introuvable", 0, "Élément introuvable : " + x); return e; }
  var cssPose = false;
  function css() {
    if (cssPose) return; cssPose = true;
    var s = el("style"); s.setAttribute("data-dlc-css", VERSION);
    s.textContent = ".dlc{--dlc-c:#2546d8;font:15px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:inherit}" +
      ".dlc-grille{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))}" +
      ".dlc-liste .dlc-grille{grid-template-columns:minmax(0,1fr);gap:0}" +
      ".dlc-f{display:flex;flex-direction:column;border:1px solid rgba(128,128,128,.25);border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;background:transparent;min-width:0}" +
      "a.dlc-f:hover{border-color:var(--dlc-c)}a.dlc-f:focus-visible{outline:2px solid var(--dlc-c);outline-offset:2px}" +
      ".dlc-liste .dlc-f{flex-direction:row;border:0;border-bottom:1px solid rgba(128,128,128,.22);border-radius:0;padding:10px 0;gap:12px}" +
      ".dlc-img{aspect-ratio:16/9;background:rgba(128,128,128,.12) center/cover no-repeat;display:flex;align-items:flex-end;padding:8px}" +
      ".dlc-liste .dlc-img{aspect-ratio:1;width:64px;flex:none;border-radius:10px;padding:0}" +
      ".dlc-tag{font-size:12px;font-weight:600;color:#fff;padding:2px 8px;border-radius:999px;background:var(--t,#555)}" +
      ".dlc-liste .dlc-tag{display:none}" +
      ".dlc-c{padding:10px 12px 12px;min-width:0}.dlc-liste .dlc-c{padding:0}" +
      ".dlc-d{font-size:13px;font-weight:700;color:var(--dlc-c);text-transform:uppercase;letter-spacing:.02em}" +
      ".dlc-t{font-weight:650;margin:2px 0 2px;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
      ".dlc-w{font-size:13.5px;opacity:.72}" +
      ".dlc-pied{margin-top:10px;font-size:12px;opacity:.7}.dlc-pied a{color:inherit}" +
      ".dlc-vide,.dlc-err{padding:14px;border:1px dashed rgba(128,128,128,.4);border-radius:12px;opacity:.85}" +
      ".dlc-sq{border-radius:14px;height:180px;background:linear-gradient(90deg,rgba(128,128,128,.08),rgba(128,128,128,.18),rgba(128,128,128,.08));background-size:200% 100%;animation:dlc-s 1.2s infinite linear}" +
      "@keyframes dlc-s{to{background-position:-200% 0}}@media (prefers-reduced-motion:reduce){.dlc-sq{animation:none}}" +
      ".dlc-map{position:relative;min-height:320px;border-radius:14px;overflow:hidden}.dlc-map>.dlc-m{position:absolute;inset:0}" +
      ".dlc-pop{font:14px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#151515;max-width:240px}.dlc-pop b{display:block;margin:2px 0}.dlc-pop a{color:#151515}" +
      ".dlc-fond{position:absolute;top:10px;left:10px;z-index:2;display:flex;background:#fff;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.25);overflow:hidden}" +
      ".dlc-fond button{font:600 13px system-ui,sans-serif;border:0;background:none;padding:7px 12px;cursor:pointer;color:#151515}.dlc-fond button[aria-pressed=true]{background:#151515;color:#fff}";
    d.head.appendChild(s);
  }
  function pied(box) {
    var p = el("p", "dlc-pied"); p.append("Agenda fourni par ");
    var a = el("a", null, "Trucs à faire"); a.href = SITE; a.target = "_blank"; a.rel = "noopener"; p.append(a, " · sources : DATAtourisme, OpenAgenda, OpenStreetMap");
    box.append(p);
  }
  function fiche(x, o) {
    var lieu = !!x.nom, lien = lieu ? x.site : x.lien, f = el(lien ? "a" : "div", "dlc-f");
    if (lien) { f.href = lien; f.target = "_blank"; f.rel = "noopener"; }
    var im = el("div", "dlc-img"); im.style.setProperty("--t", COULEURS[x.type] || "#555");
    if (x.image) im.style.backgroundImage = "url(\"" + String(x.image).replace(/["\\]/g, "") + "\")";
    else im.style.background = "linear-gradient(135deg," + (COULEURS[x.type] || "#555") + "22," + (COULEURS[x.type] || "#555") + "55)";
    im.append(el("span", "dlc-tag", NOMS[x.type] || x.type));
    var c = el("div", "dlc-c");
    c.append(el("div", "dlc-d", lieu ? (NOMS[x.type] || "") : dateCourte(x)), el("div", "dlc-t", lieu ? x.nom : x.titre),
      el("div", "dlc-w", [x.commune, x.distance_km != null ? x.distance_km.toLocaleString("fr-FR") + " km" : ""].filter(Boolean).join(" · ")));
    f.append(im, c);
    if (o.auClic) f.addEventListener("click", function (ev) { if (o.auClic(x, ev) === false) ev.preventDefault(); });
    return f;
  }

  /* ---------- Widget : liste de sorties ou de lieux ---------- */
  function Liste(elem, o) {
    if (!(this instanceof Liste)) return new Liste(elem, o);
    css(); this.el = cible(elem); this.options = Object.assign({ quoi: "sorties", limite: 6, disposition: "grille" }, o || {});
    this.el.classList.add("dlc"); this.actualiser();
  }
  Liste.prototype.actualiser = function (o) {
    var self = this; if (o) Object.assign(this.options, o); o = this.options;
    if (o.couleur) this.el.style.setProperty("--dlc-c", o.couleur);
    this.el.classList.toggle("dlc-liste", o.disposition === "liste");
    var g = el("div", "dlc-grille"); for (var i = 0; i < Math.min(o.limite, 6); i++) g.append(el("div", "dlc-sq"));
    this.el.replaceChildren(g);
    var avant = o.autourDeMoi ? position().then(function (p) { return Object.assign({}, o, { autour: p, tri: "distance" }); }, function () { return o; }) : Promise.resolve(o);
    this.pret = avant.then(function (q) { return (o.quoi === "lieux" ? DLC.lieux : DLC.sorties)(q); }).then(function (r) {
      self.resultats = r.resultats; g.replaceChildren();
      if (!r.resultats.length) { self.el.replaceChildren(el("p", "dlc-vide", o.messageVide || "Rien de prévu pour ces critères.")); return r; }
      r.resultats.forEach(function (x) { g.append(fiche(x, o)); });
      if (o.credit !== false) pied(self.el);
      return r;
    }, function (e) { self.el.replaceChildren(el("p", "dlc-err", "Agenda indisponible : " + e.message)); throw e; });
    this.pret.catch(function () {});
    return this.pret;
  };

  /* ---------- Widget : carte (fond IGN, MapLibre chargé à la demande) ---------- */
  var GPF = "https://data.geopf.fr";
  var STYLE_PLAN = GPF + "/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json";
  function stylePhoto() { return { version: 8, sources: { ortho: { type: "raster", tileSize: 256, maxzoom: 19, attribution: "© IGN",
    tiles: [GPF + "/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg"] } },
    layers: [{ id: "ortho", type: "raster", source: "ortho" }] }; }
  var mlPromesse = null;
  function maplibre() {
    if (w.maplibregl) return Promise.resolve(w.maplibregl);
    if (mlPromesse) return mlPromesse;
    var base = "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.";
    mlPromesse = new Promise(function (ok, ko) {
      /* Empreintes SRI : le navigateur refuse un fichier modifié sur le CDN (vérifiées en intégration continue) */
      var l = el("link"); l.rel = "stylesheet"; l.href = base + "css"; l.integrity = "sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V"; l.crossOrigin = "anonymous"; d.head.appendChild(l);
      var s = el("script"); s.src = base + "js"; s.integrity = "sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj"; s.crossOrigin = "anonymous"; s.onload = function () { ok(w.maplibregl); }; s.onerror = function () { ko(Erreur("carte_indisponible", 0, "Impossible de charger la carte.")); };
      d.head.appendChild(s);
    });
    return mlPromesse;
  }
  function Carte(elem, o) {
    if (!(this instanceof Carte)) return new Carte(elem, o);
    css(); var self = this; this.el = cible(elem); this.options = Object.assign({ quoi: "sorties", limite: 300, zoom: 10, fond: "plan" }, o || {});
    this.el.classList.add("dlc", "dlc-map"); var m = el("div", "dlc-m"); this.el.replaceChildren(m);
    var c = this.options.autour || this.options.centre;
    this.pret = maplibre().then(function (ml) {
      self.map = new ml.Map({ container: m, style: self.options.fond === "satellite" ? stylePhoto() : STYLE_PLAN, center: c ? [c.lon, c.lat] : [2.6, 46.6], zoom: c ? self.options.zoom : 5,
        attributionControl: { compact: true, customAttribution: "Plan IGN © IGN · Trucs à faire" }, cooperativeGestures: !!self.options.gestesCooperatifs });
      self.map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      if (self.options.choixFond !== false) self._fonds();
      return new Promise(function (ok) { self.map.once("load", ok); });
    }).then(function () { return self.actualiser(); });
    this.pret.catch(function (e) { self.el.replaceChildren(el("p", "dlc-err", e.message)); });
  }
  Carte.prototype._fonds = function () {
    var self = this, b = el("div", "dlc-fond"), mk = function (nom, val) { var x = el("button", null, nom); x.type = "button"; x.setAttribute("aria-pressed", String(self.options.fond === val));
      x.onclick = function () { if (self.options.fond === val) return; self.options.fond = val; b.querySelectorAll("button").forEach(function (y) { y.setAttribute("aria-pressed", String(y === x)); });
        self.map.setStyle(val === "satellite" ? stylePhoto() : STYLE_PLAN); self.map.once("styledata", function () { self._couches(); }); }; return x; };
    b.append(mk("Plan", "plan"), mk("Satellite", "satellite")); this.el.append(b);
  };
  Carte.prototype._couches = function () {
    var map = this.map, self = this; if (!map || map.getSource("dlc")) { if (map && map.getSource("dlc")) map.getSource("dlc").setData(this._geo); return; }
    map.addSource("dlc", { type: "geojson", data: this._geo || { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 42, clusterMaxZoom: 13 });
    map.addLayer({ id: "dlc-grp", type: "circle", source: "dlc", filter: ["has", "point_count"], paint: { "circle-color": "#151515", "circle-radius": ["step", ["get", "point_count"], 15, 10, 19, 50, 24], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    map.addLayer({ id: "dlc-n", type: "symbol", source: "dlc", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Source Sans Pro Bold"] }, paint: { "text-color": "#fff" } });
    map.addLayer({ id: "dlc-pt", type: "circle", source: "dlc", filter: ["!", ["has", "point_count"]], paint: { "circle-color": ["get", "c"], "circle-radius": 7, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    map.on("click", "dlc-grp", function (e) { var f = e.features[0]; map.getSource("dlc").getClusterExpansionZoom(f.properties.cluster_id).then(function (z) { map.easeTo({ center: f.geometry.coordinates, zoom: z + .3 }); }); });
    map.on("click", "dlc-pt", function (e) { var x = self._items[e.features[0].properties.i]; if (!x) return;
      if (self.options.auClic && self.options.auClic(x, e) === false) return;
      var box = el("div", "dlc-pop"), lieu = !!x.nom, lien = lieu ? x.site : x.lien;
      box.append(el("small", null, lieu ? (NOMS[x.type] || "") : dateCourte(x)), el("b", null, lieu ? x.nom : x.titre), el("span", null, x.commune || ""));
      if (lien) { var a = el("a", null, lieu ? "Site du lieu" : "Voir la fiche"); a.href = lien; a.target = "_blank"; a.rel = "noopener"; box.append(el("br"), a); }
      new w.maplibregl.Popup({ offset: 10, maxWidth: "260px" }).setLngLat(e.features[0].geometry.coordinates).setDOMContent(box).addTo(map); });
    ["dlc-grp", "dlc-pt"].forEach(function (id) { map.on("mouseenter", id, function () { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", id, function () { map.getCanvas().style.cursor = ""; }); });
  };
  Carte.prototype.actualiser = function (o) {
    var self = this; if (o) Object.assign(this.options, o); o = this.options;
    var q = Object.assign({}, o); delete q.limite; q.limite = Math.min(500, o.limite);
    var appels = o.quoi === "tout" ? [DLC.sorties(q), DLC.lieux(q)] : [o.quoi === "lieux" ? DLC.lieux(q) : DLC.sorties(q)];
    return Promise.all(appels).then(function (rs) {
      self._items = [].concat.apply([], rs.map(function (r) { return r.resultats; })).filter(function (x) { return isFinite(x.latitude) && isFinite(x.longitude); });
      self._geo = { type: "FeatureCollection", features: self._items.map(function (x, i) { return { type: "Feature", properties: { i: i, c: COULEURS[x.type] || "#555" }, geometry: { type: "Point", coordinates: [x.longitude, x.latitude] } }; }) };
      self._couches();
      if (!(o.autour || o.centre) && self._items.length) {
        var b = new w.maplibregl.LngLatBounds(); self._items.forEach(function (x) { b.extend([x.longitude, x.latitude]); });
        self.map.fitBounds(b, { padding: 40, maxZoom: 12, duration: 0 });
      }
      self.resultats = self._items; return rs.length === 1 ? rs[0] : { sorties: rs[0], lieux: rs[1] };
    });
  };

  /* ---------- Espace de noms public ---------- */
  var DLC = {
    version: VERSION,
    configurer: function (o) { o = o || {}; if (o.cle !== undefined) cfg.cle = o.cle; if (o.serveur !== undefined) cfg.serveur = o.serveur; if (o.donnees) cfg.donnees = o.donnees; return DLC.reglages(); },
    reglages: function () { return { cle: cfg.cle ? cfg.cle.slice(0, 8) + "…" : null, serveur: cfg.serveur, demo: !cfg.serveur, version: VERSION }; },
    sorties: function (o) { return appel("/v1/sorties", o); },
    lieux: function (o) { return appel("/v1/lieux", o); },
    departements: function () { return appel("/v1/departements"); },
    cle: function () { return appel("/v1/cle"); },
    autourDeMoi: function (o) { o = o || {}; return position().then(function (p) { return appel(o.quoi === "lieux" ? "/v1/lieux" : "/v1/sorties", Object.assign({ rayon: 15, tri: "distance" }, o, { autour: p })); }); },
    position: position,
    url: function (chemin, o) { return urlRequete(chemin, parametres(o)); },
    dateCourte: dateCourte,
    types: { sorties: TYPES_SORTIES.slice(), lieux: TYPES_LIEUX.slice(), noms: NOMS },
    Liste: Liste, Carte: Carte, Erreur: Erreur, licence: LICENCE
  };
  w.TrucsAFaire = DLC;
  w.DansLeCoin = DLC; // ancien nom, conservé pour les sites qui l'utilisent déjà

  /* Prêt : rappel « callback » (comme Google Maps), promesse TrucsAFaire.pret et événement « trucsAFaire:pret » */
  DLC.pret = Promise.resolve(DLC);
  var cb = sp.callback || ds.callback;
  function lancer() {
    if (cb && typeof w[cb] === "function") { try { w[cb](DLC); } catch (e) { setTimeout(function () { throw e; }); } }
    try { d.dispatchEvent(new CustomEvent("trucsAFaire:pret", { detail: DLC })); d.dispatchEvent(new CustomEvent("dansLeCoin:pret", { detail: DLC })); } catch (e) {}
    /* Widgets déclaratifs : <div data-dlc="liste" data-types="brocante" data-limite="6"></div> */
    d.querySelectorAll("div[data-dlc]:not([data-dlc-ok]),section[data-dlc]:not([data-dlc-ok])").forEach(function (n) {
      n.setAttribute("data-dlc-ok", ""); var a = n.dataset, o = {};
      ["quoi", "dep", "types", "periode", "commune", "recherche", "couleur", "disposition", "fond", "du", "au"].forEach(function (k) { if (a[k]) o[k] = a[k]; });
      ["limite", "rayon", "zoom"].forEach(function (k) { if (a[k]) o[k] = +a[k]; });
      if (a.lat && a.lon) o.autour = { lat: +a.lat, lon: +a.lon };
      if (a.gratuit) o.gratuit = true; if (a.autourDeMoi != null && a.autourDeMoi !== "false") o.autourDeMoi = true;
      a.dlc === "carte" ? new Carte(n, o) : new Liste(n, o);
    });
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", lancer); else setTimeout(lancer, 0);
})(window, document);
