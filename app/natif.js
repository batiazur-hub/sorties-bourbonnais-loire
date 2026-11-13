/* Trucs à faire : pont entre l'agenda (index.html) et les fonctions du téléphone, dans les applis Android et iPhone.
   Chargé uniquement dans les applis (voir scripts/construire_applis.py), jamais sur le site.
   - Rappel la veille (18 h) et deux heures avant pour chaque sortie gardée en favori (notifications locales, sans serveur)
   - Partage avec la feuille de partage du téléphone (navigator.share n'existe pas dans la vue web Android)
   - Fichier .ics ouvert avec l'agenda du téléphone
   - Pages par ville (que-faire/) ouvertes dans le navigateur intégré, liens externes dans le navigateur du téléphone */
(function () {
  "use strict";
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var P = C.Plugins || {};
  var SITE = "https://trucsafaire.fr/";
  // l'agenda lit l'adresse (#dep=…&sortie=…) au démarrage : on la change puis on recharge la page embarquée
  function ouvrirAdresse(h) { location.hash = h || ""; location.reload(); }

  /* ---------- Offres payantes : absentes des applis (achat hors boutique interdit, règle 3.1.1 d'Apple) ---------- */
  var cache = document.createElement("style");
  cache.textContent = 'a[href$="offres.html"],a[href$="cgv.html"]{display:none!important}';
  (document.head || document.documentElement).appendChild(cache);

  /* ---------- Réglages de l'agenda (lus par index.html au démarrage) ---------- */
  window.SORTIES_CONFIG = Object.assign(window.SORTIES_CONFIG || {}, {
    natif: true,
    siteUrl: SITE,
    dataBase: SITE + "data/",
    onIcs: function (texte, nom) { ouvrirIcs(texte, nom); }
  });

  /* ---------- Partage natif ---------- */
  if (P.Share) {
    var partager = function (d) {
      d = d || {};
      return P.Share.share({ title: d.title, text: d.text, url: d.url, dialogTitle: "Partager" })
        .catch(function (e) { if (!/cancel/i.test(String(e && e.message))) throw e; });
    };
    try { Object.defineProperty(navigator, "share", { value: partager, configurable: true }); } catch (_) { navigator.share = partager; }
  }

  /* ---------- Fichier .ics vers l'agenda du téléphone ---------- */
  function ouvrirIcs(texte, nom) {
    if (!P.Filesystem || !P.Share) return;
    P.Filesystem.writeFile({ path: nom.replace(/[^\w.-]/g, "_"), data: texte, directory: "CACHE", encoding: "utf8" })
      .then(function (r) { return P.Share.share({ title: "Ajouter à mon agenda", files: [r.uri], dialogTitle: "Ajouter à mon agenda" }); })
      .catch(function () {});
  }

  /* ---------- Liens : pages villes et sites externes ---------- */
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
    var u;
    try { u = new URL(a.getAttribute("href"), location.href); } catch (_) { return; }
    var interne = u.origin === location.origin;
    if (interne && !/^\/que-faire\//.test(u.pathname)) return;   // pages embarquées dans l'appli
    if (!/^https?:$/.test(u.protocol) && !interne) return;        // tel:, mailto: : le système s'en charge
    ev.preventDefault();
    var cible = interne ? SITE + u.pathname.replace(/^\//, "") + u.search + u.hash : u.href;
    if (P.Browser) P.Browser.open({ url: cible, presentationStyle: "popover" }).catch(function () { location.href = cible; });
    else window.open(cible, "_system");
  }, true);

  /* ---------- Rappels des sorties gardées ---------- */
  var LN = P.LocalNotifications;
  // identifiant numérique stable (les notifications exigent un entier 32 bits)
  function nid(id, k) { var h = 2166136261; id = id + "#" + k; for (var i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 1) || 1; }
  function moments(e) {
    var d = new Date(e.S), out = [];
    if (isNaN(d)) return out;
    var veille = new Date(d); veille.setDate(veille.getDate() - 1); veille.setHours(18, 0, 0, 0);
    out.push({ k: "veille", at: veille, body: "C'est demain" + (e.h ? " à " + e.h.replace(":", " h ") : "") + " · " + (e.lieu ? e.lieu + ", " : "") + e.w });
    if (e.h) {
      var hm = e.h.split(":").map(Number), avant = new Date(d); avant.setHours(hm[0] - 2, hm[1] || 0, 0, 0);
      out.push({ k: "avant", at: avant, body: "Dans deux heures · " + (e.lieu ? e.lieu + ", " : "") + e.w });
    }
    var now = Date.now() + 60000;
    return out.filter(function (m) { return +m.at > now; });
  }
  function programmer(e) {
    var ms = moments(e);
    if (!ms.length) return Promise.resolve();
    return LN.schedule({ notifications: ms.map(function (m) {
      return { id: nid(e.id, m.k), title: e.t, body: m.body, schedule: { at: m.at, allowWhileIdle: true },
               extra: { sortie: e.id, dep: e.z }, channelId: "rappels" };
    }) });
  }
  function annuler(id) { return LN.cancel({ notifications: [{ id: nid(id, "veille") }, { id: nid(id, "avant") }] }).catch(function () {}); }

  if (LN) {
    LN.createChannel && LN.createChannel({ id: "rappels", name: "Rappels de sorties", description: "La veille et deux heures avant une sortie gardée", importance: 4 }).catch(function () {});
    document.addEventListener("sbl:fav", function (ev) {
      var d = ev.detail || {}, e = d.e;
      if (!e || !e.id) return;
      if (!d.on) return void annuler(e.id);
      LN.checkPermissions().then(function (p) { return p.display === "granted" ? p : LN.requestPermissions(); })
        .then(function (p) {
          if (p.display !== "granted") return;
          return programmer(e);
        }).catch(function () {});
    });
    // Toucher un rappel ouvre la sortie dans l'agenda
    LN.addListener("localNotificationActionPerformed", function (a) {
      var x = a && a.notification && a.notification.extra;
      if (x && x.sortie) ouvrirAdresse("dep=" + encodeURIComponent(x.dep || "") + "&sortie=" + encodeURIComponent(x.sortie));
    });
  }

  /* ---------- Bouton retour Android : ferme la fenêtre ouverte, sinon revient en arrière, sinon quitte ---------- */
  if (P.App) {
    P.App.addListener("backButton", function (d) {
      var ouvert = document.querySelector("[data-close]");
      if (ouvert && ouvert.offsetParent !== null) return void ouvert.click();
      if (d && d.canGoBack) history.back(); else P.App.exitApp();
    });
    // Liens trucsafaire.fr ouverts depuis un message ou un e-mail : affichés dans l'appli
    P.App.addListener("appUrlOpen", function (d) {
      try {
        var u = new URL(d.url);
        if (/(^|\.)trucsafaire\.fr$/.test(u.hostname) && (u.pathname === "/" || u.pathname === "/index.html")) {
          ouvrirAdresse(u.hash.replace(/^#/, ""));
        }
      } catch (_) {}
    });
  }
})();
