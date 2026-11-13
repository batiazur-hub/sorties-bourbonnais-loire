/* « La semaine des cathos » : sélection envoyée chaque jeudi (fin de matinée) aux comptes qui l'ont demandée sur Trucs de cathos.
   Même mécanique que « Le Truc de la semaine » (newsletter.js) : lots, budget de requêtes sortantes, une écriture KV par lot,
   lien de désinscription signé (usage « stop-cathos »), consentement propre à Trucs de cathos (c.cathos.lettre), distinct de celui de Trucs à faire.
   Données : fichiers par département de trucsdecathos.fr (data/dep/<code>.json) + propositions publiées (KV « cathos-agenda »). */
import { signature } from "./comptes.js";
import { semaine, depsProches, selection, BUDGET_REQUETES } from "./newsletter.js";
import { agendaCathos } from "./cathos.js";

const TYPE_FAM = {"messe-dominicale":"messes","messe-semaine":"messes","messe-anticipee":"messes","messe-solennite":"messes","messe-familles":"messes","messe-latin":"messes","laudes":"messes","vepres":"messes","complies":"messes","celebration-parole":"messes","semaine-sainte":"messes","liturgie-orientale":"messes","confession":"sacrements","bapteme":"sacrements","confirmation":"sacrements","premiere-communion":"sacrements","mariage":"sacrements","ordination":"sacrements","onction-malades":"sacrements","adoration":"priere","louange":"priere","chapelet":"priere","chemin-de-croix":"priere","veillee":"priere","neuvaine":"priere","procession":"priere","benediction":"priere","pelerinage":"pelerinages","marche":"pelerinages","sanctuaire-marial":"pelerinages","retraite":"pelerinages","session":"pelerinages","conference":"formation","debat":"formation","groupe-biblique":"formation","catechese":"formation","cine-debat":"formation","lecture":"formation","parcours-decouverte":"formation","soiree-jeunes":"jeunes","eveil-foi":"jeunes","familles":"jeunes","rassemblement":"jeunes","scouts-camps":"jeunes","concert":"culture","visite-eglise":"culture","exposition":"culture","creche":"culture","repas":"fraternite","kermesse":"fraternite","brocante":"fraternite","solidarite":"fraternite","mission":"fraternite"};
const FAM = { messes: ["Messe, office", "#2F6DB5"], sacrements: ["Sacrement", "#6E4BB5"], priere: ["Prière", "#B8862B"], pelerinages: ["Pèlerinage, retraite", "#2E7D5B"],
  formation: ["Formation", "#C0562B"], jeunes: ["Jeunes, familles", "#1F8A99"], culture: ["Culture", "#8A5A2B"], fraternite: ["Fraternité", "#B5446E"] };
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const siteCathos = env => (env.SITE_URL_CATHOS || "https://trucsdecathos.fr/").replace(/\/?$/, "/");
export const lettreActive = c => !!(c && c.cathos && c.cathos.lettre && c.cathos.lettre.actif && c.cathos.prefs && c.cathos.prefs.commune);

function quand(e, sem) {
  const s = new Date(Date.parse(e.s < sem.du ? sem.du : e.s));
  const j = JOURS[s.getUTCDay()], txt = j.charAt(0).toUpperCase() + j.slice(1) + " " + s.getUTCDate() + " " + MOIS[s.getUTCMonth()];
  return txt + (e.h ? " · " + e.h.replace(/^0/, "").replace(":", " h ").replace(/ h 00$/, " h") : "");
}

/* Sélection : on réutilise celle de Trucs à faire, la famille du type tenant lieu de catégorie */
export function selectionCathos(evts, prefs, sem, max = 12) {
  const s = evts.filter(e => TYPE_FAM[e.type]).map(e => Object.assign({}, e, { cat: TYPE_FAM[e.type] }));
  return selection(s, { commune: prefs.commune, rayon: prefs.rayon || 20, cats: prefs.familles || [] }, sem, max);
}

export function courrielCathos(prefs, items, sem, liens) {
  const c = prefs.commune, site = liens.site;
  const lignes = items.map(e => {
    const k = FAM[e.cat] || FAM.priere, url = site + "#e=" + encodeURIComponent(e.id) + "&source=nl";
    return `<tr><td style="padding:0 0 12px"><a href="${esc(url)}" style="display:block;text-decoration:none;color:#141A33;background:#ffffff;border-radius:16px;border-left:5px solid ${k[1]};padding:14px 16px">
<span style="display:block;font:700 12px/1.3 Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${k[1]}">${esc(k[0])} · ${esc(quand(e, sem))}</span>
<span style="display:block;font:700 17px/1.3 Arial,sans-serif;margin:4px 0 2px">${esc(e.t)}</span>
<span style="display:block;font:14px/1.4 Arial,sans-serif;color:#4D5470">${esc(e.lieu && e.lieu !== e.w ? e.lieu + ", " + e.w : e.w)}</span></a></td></tr>`;
  }).join("\n");
  const n = items.length, titre = n ? `${n} rendez-vous près de ${esc(c.nom)}` : `Semaine calme près de ${esc(c.nom)}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'"><title>La semaine des cathos</title></head>
<body style="margin:0;background:#F6F3EC">
<div style="display:none;max-height:0;overflow:hidden">${titre} : messes, adoration, veillées, pèlerinages…</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F3EC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:#2F6DB5;border-radius:22px 22px 0 0;padding:26px 24px 22px">
<span style="display:inline-block;background:#D4A537;border-radius:999px;padding:6px 14px;font:700 15px Arial,sans-serif;color:#141A33">trucs de cathos</span>
<p style="margin:18px 0 4px;font:700 12px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#F3D88E">La semaine des cathos</p>
<h1 style="margin:0;font:700 26px/1.15 Arial,sans-serif;color:#ffffff">${titre}</h1>
<p style="margin:8px 0 0;font:15px/1.4 Arial,sans-serif;color:#DCE7F7">Du ${esc(sem.du.split("-").reverse().slice(0, 2).join("/"))} au ${esc(sem.au.split("-").reverse().slice(0, 2).join("/"))}, dans un rayon de ${prefs.rayon || 20} km.</p>
</td></tr>
<tr><td style="background:#FBF7EE;padding:18px 16px 6px;border-radius:0 0 22px 22px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lignes || '<tr><td style="padding:0 0 14px;font:15px/1.5 Arial,sans-serif;color:#141A33">Peu de rendez-vous connus cette semaine dans votre rayon. Élargissez la distance dans « Mon compte » pour en voir davantage.</td></tr>'}</table>
<p style="text-align:center;margin:6px 0 18px"><a href="${esc(site)}?source=nl" style="display:inline-block;background:#2F6DB5;color:#ffffff;font:700 15px Arial,sans-serif;text-decoration:none;padding:13px 24px;border-radius:999px">Tout voir près de ${esc(c.nom)}</a></p>
</td></tr>
<tr><td style="padding:18px 10px;font:12px/1.6 Arial,sans-serif;color:#4D5470;text-align:center">
Vous recevez cet e-mail parce que vous l’avez demandé sur Trucs de cathos.<br>
<a href="${esc(liens.prefs)}" style="color:#4D5470">Changer mes préférences</a> · <a href="${esc(liens.stop)}" style="color:#4D5470">Me désinscrire en un clic</a><br>
Trucs de cathos · Saryn Digital (Clément Monteiro EI), Decize. Rien ne remplace la vie de votre paroisse : vérifiez les horaires auprès d’elle.
</td></tr></table></td></tr></table></body></html>`;
  const texte = `${titre.replace(/&amp;/g, "&")}\n\n` + items.map(e => `- ${quand(e, sem)} : ${e.t} (${e.w})\n  ${site}#e=${encodeURIComponent(e.id)}`).join("\n")
    + `\n\nTout voir : ${site}\nSe désinscrire : ${liens.stop}`;
  return { sujet: n ? `${titre.replace(/&amp;/g, "&")} ✝` : "La semaine des cathos", html, texte };
}

function lire(cache, cle, url, defaut) {
  if (!cache.has(cle)) {
    cache.requetes = (cache.requetes || 0) + 1;
    cache.set(cle, fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } }).then(r => r.ok ? r.json() : defaut).catch(() => defaut));
  }
  return cache.get(cle);
}
const dataTaf = env => env.DATA_URL || "https://trucsafaire.fr/data/";
const dataCathos = env => env.DATA_URL_CATHOS || siteCathos(env) + "data/";
async function depsDe(env, c, cache) {
  const idx = await lire(cache, "idx", dataTaf(env) + "departements.json", { departements: [] }), p = c.cathos.prefs;
  return depsProches(idx.departements || [], p.commune.lat, p.commune.lon, p.rayon || 20);
}
async function liensDe(env, c) {
  const site = siteCathos(env), stop = new URL(env.API_URL || "https://api.trucsafaire.fr");
  stop.pathname = "/newsletter/stop"; stop.searchParams.set("c", c.id); stop.searchParams.set("s", await signature(env, c.id, "stop-cathos")); stop.searchParams.set("site", "cathos");
  return { site, stop: stop.href, prefs: site + "#compte" };
}

export async function pourCompteCathos(env, c, sem, cache) {
  if (!lettreActive(c)) return null;
  if (!cache.has("agenda-cathos")) cache.set("agenda-cathos", agendaCathos(env).catch(() => []));
  const deps = await depsDe(env, c, cache);
  const evts = (await cache.get("agenda-cathos")).concat(...(await Promise.all(deps.map(d => lire(cache, "cdep:" + d, dataCathos(env) + "dep/" + d + ".json", [])))));
  const liens = await liensDe(env, c);
  return Object.assign(courrielCathos(c.cathos.prefs, selectionCathos(evts, c.cathos.prefs, sem), sem, liens), { liens });
}

/* Tâche planifiée : un lot d'envois ; renvoie le nombre d'e-mails partis */
export async function envoyerLotCathos(env, maintenant = new Date(), cache = new Map()) {
  if (!env.BREVO_KEY || !env.SIGNATURE_KEY) return 0;
  const sem = semaine(maintenant), lot = +(env.NL_LOT || 30), cleFait = "nlc:fait:" + sem.edition;
  const fait = new Set((await env.DLC.get(cleFait, "json")) || []), avant = fait.size;
  let curseur = await env.DLC.get("nlc:curseur:" + sem.edition), n = 0, fini = false, coupe = false;
  try {
    while (n < lot && !fini) {
      const r = await env.DLC.list({ prefix: "cpt:", cursor: curseur || undefined, limit: 50 });
      for (const k of r.keys) {
        if (n >= lot) { coupe = true; break; }
        const id = k.name.slice(4); if (fait.has(id)) continue;
        const c = await env.DLC.get(k.name, "json");
        if (!lettreActive(c)) continue;
        const nouveaux = (cache.has("idx") ? 0 : 1) + (cache.has("agenda-cathos") ? 0 : 0) + (await depsDe(env, c, cache)).filter(d => !cache.has("cdep:" + d)).length;
        if ((cache.requetes || 0) + nouveaux + 1 > BUDGET_REQUETES) { coupe = true; break; }
        const m = await pourCompteCathos(env, c, sem, cache); if (!m) continue;
        cache.requetes = (cache.requetes || 0) + 1;
        const rep = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST",
          headers: { "api-key": env.BREVO_KEY, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ sender: { name: "Trucs de cathos", email: env.MAIL_FROM_CATHOS || env.MAIL_FROM || "bonjour@trucsafaire.fr" }, to: [{ email: c.email }],
            subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ["semaine-des-cathos"],
            headers: { "List-Unsubscribe": "<" + m.liens.stop + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }) }).catch(() => null);
        if (rep && rep.ok) { fait.add(id); n++; }
      }
      if (coupe) break;
      curseur = r.list_complete ? null : r.cursor; fini = r.list_complete;
      if (!fini) await env.DLC.put("nlc:curseur:" + sem.edition, curseur, { expirationTtl: 7 * 86400 });
    }
  } finally {
    if (fait.size > avant) await env.DLC.put(cleFait, JSON.stringify([...fait]), { expirationTtl: 8 * 86400 });
  }
  return n;
}
