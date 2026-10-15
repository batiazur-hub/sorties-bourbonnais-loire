/* « Le Truc de la semaine » : sélection personnalisée envoyée chaque jeudi aux Trucophiles qui l'ont demandée.

   - Sélection : sorties du vendredi au jeudi suivant, dans le rayon choisi autour de la commune, selon les centres d'intérêt ;
     les sorties du week-end passent en premier, puis celles publiées par des organisateurs, puis celles avec une affiche.
   - Envoi par lots (NL_LOT comptes par exécution, 35 par défaut) : l'offre gratuite de Cloudflare limite à 50 les requêtes
     sortantes par exécution. La tâche planifiée tourne toutes les 15 minutes le jeudi matin et reprend où elle s'était arrêtée.
   - Chaque e-mail porte un lien de désinscription signé et les en-têtes List-Unsubscribe (désinscription en un clic).
   - Personne ne reçoit deux fois la même édition (date d'envoi gardée sur le compte). */
import { signature } from "./comptes.js";

const CATS = { brocante: ["Brocante", "#A85A12"], fete: ["Fête", "#C2255C"], spectacle: ["Spectacle", "#6741D9"], culture: ["Expo, visite", "#0B7A5E"],
               famille: ["En famille", "#8A6100"], sport: ["Sport", "#1971C2"], pal: ["Le Pal", "#4D7C0F"] };
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const SITE_DEFAUT = "https://batiazur-hub.github.io/sorties-bourbonnais-loire/";
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const km = (a, b, c, d) => Math.hypot((d - b) * Math.cos((a + c) / 2 * Math.PI / 180) * 111.32, (c - a) * 110.57);
const iso = d => d.toISOString().slice(0, 10);
const siteUrl = env => (env.SITE_URL || SITE_DEFAUT).replace(/\/?$/, "/");

/* Édition de la semaine : vendredi (inclus) → jeudi suivant (inclus), calculée depuis la date d'envoi */
export function semaine(maintenant = new Date()) {
  const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
  const ven = new Date(d); ven.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  const jeu = new Date(ven); jeu.setUTCDate(ven.getUTCDate() + 6);
  return { du: iso(ven), au: iso(jeu), edition: iso(ven) };
}

/* Départements à lire autour d'une commune (centres de département à moins de rayon + 90 km) */
export function depsProches(departements, lat, lon, rayon) {
  return departements.map(x => [x.code, km(lat, lon, x.lat, x.lon)]).filter(x => x[1] <= rayon + 90).sort((a, b) => a[1] - b[1]).slice(0, 6).map(x => x[0]);
}

export function selection(sorties, prefs, sem, max = 12) {
  const c = prefs && prefs.commune; if (!c) return [];
  const r = prefs.rayon || 20, cats = prefs.cats || [];
  const weekend = e => e.s <= iso(new Date(Date.parse(sem.du) + 2 * 864e5)) && (e.e || e.s) >= sem.du;
  return sorties.filter(e => e.s <= sem.au && (e.e || e.s) >= sem.du && isFinite(e.lat) && km(c.lat, c.lon, e.lat, e.lon) <= r && (!cats.length || cats.includes(e.cat))
      && !(e.e && (Date.parse(e.e) - Date.parse(e.s)) / 864e5 > 14))
    .map(e => ({ e, k: (weekend(e) ? 0 : 6) + (e.org ? 0 : 2) + (e.img ? 0 : 1) + km(c.lat, c.lon, e.lat, e.lon) / Math.max(5, r / 4) }))
    .sort((a, b) => a.k - b.k || (a.e.s < b.e.s ? -1 : 1))
    .reduce((acc, { e }) => {  // de la variété : pas de doublon, 4 par commune et 5 par type au plus
      const cle = String(e.t).toLowerCase().replace(/\W+/g, " ").trim() + "|" + e.w;
      if (acc.length >= max || acc.vus.has(cle) || (acc.w[e.w] || 0) >= 4 || (acc.c[e.cat] || 0) >= 5) return acc;
      acc.vus.add(cle); acc.w[e.w] = (acc.w[e.w] || 0) + 1; acc.c[e.cat] = (acc.c[e.cat] || 0) + 1; acc.push(e); return acc;
    }, Object.assign([], { vus: new Set(), w: {}, c: {} })).slice()
    .sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : (a.h || "99") < (b.h || "99") ? -1 : 1));
}

function quand(e, sem) {
  const s = new Date(Date.parse(e.s < sem.du ? sem.du : e.s));
  const j = JOURS[s.getUTCDay()], txt = j.charAt(0).toUpperCase() + j.slice(1) + " " + s.getUTCDate() + " " + MOIS[s.getUTCMonth()];
  return txt + (e.h ? " · " + e.h.replace(/^0/, "").replace(":", " h ").replace(/ h 00$/, " h") : "");
}

/* E-mail en tableaux et styles en ligne : rendu correct dans Gmail, Outlook, Apple Mail */
export function courriel(compte, items, sem, liens) {
  const c = compte.prefs.commune, site = liens.site;
  const lignes = items.map(e => {
    const k = CATS[e.cat] || CATS.fete, url = site + "index.html#dep=" + e.z + "&sortie=" + encodeURIComponent(e.id) + "&source=nl";
    return `<tr><td style="padding:0 0 12px"><a href="${esc(url)}" style="display:block;text-decoration:none;color:#141A33;background:#ffffff;border-radius:16px;border-left:5px solid ${k[1]};padding:14px 16px">
<span style="display:block;font:700 12px/1.3 Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${k[1]}">${esc(k[0])} · ${esc(quand(e, sem))}</span>
<span style="display:block;font:700 17px/1.3 Arial,sans-serif;margin:4px 0 2px">${esc(e.t)}</span>
<span style="display:block;font:14px/1.4 Arial,sans-serif;color:#4D5470">${esc(e.lieu && e.lieu !== e.w ? e.lieu + ", " + e.w : e.w)}${e.g ? " · <b style=\"color:#0B7A5E\">Gratuit</b>" : ""}</span></a></td></tr>`;
  }).join("\n");
  const titre = items.length ? `${items.length} truc${items.length > 1 ? "s" : ""} à faire autour de ${esc(c.nom)}` : `Semaine calme autour de ${esc(c.nom)}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Le Truc de la semaine</title></head>
<body style="margin:0;background:#F1F3F8">
<div style="display:none;max-height:0;overflow:hidden">${titre} : brocantes, fêtes, concerts, expos…</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F3F8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:#2546D8;border-radius:22px 22px 0 0;padding:26px 24px 22px">
<span style="display:inline-block;background:#ffffff;border-radius:999px;padding:6px 14px;font:700 15px Arial,sans-serif;color:#141A33">trucs à faire</span>
<p style="margin:18px 0 4px;font:700 12px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#FFB27F">Le Truc de la semaine</p>
<h1 style="margin:0;font:700 26px/1.15 Arial,sans-serif;color:#ffffff">${titre}</h1>
<p style="margin:8px 0 0;font:15px/1.4 Arial,sans-serif;color:#DCE3FF">Du ${esc(sem.du.split("-").reverse().slice(0, 2).join("/"))} au ${esc(sem.au.split("-").reverse().slice(0, 2).join("/"))}, dans un rayon de ${compte.prefs.rayon || 20} km.</p>
</td></tr>
<tr><td style="background:#E8EDFF;padding:18px 16px 6px;border-radius:0 0 22px 22px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lignes || '<tr><td style="padding:0 0 14px;font:15px/1.5 Arial,sans-serif;color:#141A33">Peu de trucs connus cette semaine dans votre rayon. Élargissez la distance dans « Mon compte » pour en voir davantage.</td></tr>'}</table>
<p style="text-align:center;margin:6px 0 18px"><a href="${esc(site)}index.html#q=${encodeURIComponent("autour de " + c.nom)}&amp;source=nl" style="display:inline-block;background:#2546D8;color:#ffffff;font:700 15px Arial,sans-serif;text-decoration:none;padding:13px 24px;border-radius:999px">Tous les trucs autour de ${esc(c.nom)}</a></p>
</td></tr>
<tr><td style="padding:18px 10px;font:12px/1.6 Arial,sans-serif;color:#4D5470;text-align:center">
Vous recevez cet e-mail parce que vous l’avez demandé sur Trucs à faire.<br>
<a href="${esc(liens.prefs)}" style="color:#4D5470">Changer mes préférences</a> · <a href="${esc(liens.stop)}" style="color:#4D5470">Me désinscrire en un clic</a><br>
Trucs à faire · Saryn Digital (Clément Monteiro EI), Decize. Vérifiez les infos auprès des organisateurs avant de vous déplacer.
</td></tr></table></td></tr></table></body></html>`;
  const texte = `${titre.replace(/&amp;/g, "&")}\n\n` + items.map(e => `- ${quand(e, sem)} : ${e.t} (${e.w})\n  ${site}index.html#dep=${e.z}&sortie=${encodeURIComponent(e.id)}`).join("\n")
    + `\n\nTous les trucs : ${site}\nSe désinscrire : ${liens.stop}`;
  return { sujet: items.length ? `${titre.replace(/&amp;/g, "&")} 🎉` : "Le Truc de la semaine", html, texte };
}

async function donneesDep(env, code, cache) {
  if (!cache.has(code)) {
    const base = env.DATA_URL || SITE_DEFAUT + "data/";
    cache.set(code, fetch(base + "dep/" + code + ".json", { cf: { cacheTtl: 3600, cacheEverything: true } }).then(r => r.ok ? r.json() : []).catch(() => []));
  }
  return cache.get(code);
}

async function liensDe(env, c) {
  const site = siteUrl(env), stop = new URL(env.API_URL || "https://api.trucsafaire.fr");
  stop.pathname = "/newsletter/stop"; stop.searchParams.set("c", c.id); stop.searchParams.set("s", await signature(env, c.id));
  return { site, stop: stop.href, prefs: site + "index.html#compte" };
}

/* Composition pour un compte (aperçu ou envoi) */
export async function pourCompte(env, c, sem, cache) {
  if (!c.prefs || !c.prefs.commune) return null;
  const idx = await (await fetch((env.DATA_URL || SITE_DEFAUT + "data/") + "departements.json", { cf: { cacheTtl: 3600, cacheEverything: true } })).json().catch(() => ({ departements: [] }));
  const deps = depsProches(idx.departements || [], c.prefs.commune.lat, c.prefs.commune.lon, c.prefs.rayon || 20);
  const ag = (await env.DLC.get("agenda", "json")) || [];
  const sorties = ag.concat(...(await Promise.all(deps.map(d => donneesDep(env, d, cache)))));
  return courriel(c, selection(sorties, c.prefs, sem), sem, await liensDe(env, c));
}

/* Tâche planifiée : un lot d'envois ; renvoie le nombre d'e-mails partis */
export async function envoyerLot(env, maintenant = new Date()) {
  if (!env.BREVO_KEY) return 0;
  const sem = semaine(maintenant), lot = +(env.NL_LOT || 35), cache = new Map();
  let curseur = await env.DLC.get("nl:curseur:" + sem.edition), n = 0, fini = false, coupe = false;
  while (n < lot && !fini) {
    const r = await env.DLC.list({ prefix: "cpt:", cursor: curseur || undefined, limit: 50 });
    for (const k of r.keys) {
      if (n >= lot) { coupe = true; break; }  // page incomplète : on la reprendra (les comptes déjà servis sont sautés)
      const c = await env.DLC.get(k.name, "json");
      if (!c || !c.newsletter || !c.newsletter.actif || c.nl_edition === sem.edition) continue;
      const m = await pourCompte(env, c, sem, cache); if (!m) continue;
      const liens = await liensDe(env, c);
      const rep = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST",
        headers: { "api-key": env.BREVO_KEY, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ sender: { name: "Trucs à faire", email: env.MAIL_FROM || "bonjour@trucsafaire.fr" }, to: [{ email: c.email }],
          subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ["truc-de-la-semaine"],
          headers: { "List-Unsubscribe": "<" + liens.stop + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }) }).catch(() => null);
      if (rep && rep.ok) { c.nl_edition = sem.edition; await env.DLC.put(k.name, JSON.stringify(c)); n++; }
    }
    if (coupe) break;
    curseur = r.list_complete ? null : r.cursor; fini = r.list_complete;
    if (!fini) await env.DLC.put("nl:curseur:" + sem.edition, curseur, { expirationTtl: 7 * 86400 });
  }
  return n;
}
