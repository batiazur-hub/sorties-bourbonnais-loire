/* Comptes Trucophile : connexion sans mot de passe (lien envoyé par e-mail), préférences, favoris, consentement newsletter.

   POST /compte/lien        { email, prefs?, newsletter?, cgu }  → envoie un lien de connexion (réponse identique que le compte existe ou non)
   POST /compte/connexion   { jeton }                            → { session, compte }   (jeton à usage unique, valable 30 min)
   GET  /compte                                                   → profil           (en-tête Authorization: Bearer <session>)
   POST /compte             { prefs?, newsletter?, fav? }         → profil mis à jour
   GET  /compte/export                                            → toutes les données du compte (droit à la portabilité)
   POST /compte/deconnexion · POST /compte/supprimer              → suppression immédiate et définitive
   GET|POST /newsletter/stop?c=<id>&s=<signature>                 → désinscription en un clic (lien présent dans chaque envoi)

   Stockage KV : « cpt:<id> » compte, « ses:<empreinte> » session (90 jours), « jet:<empreinte> » lien de connexion (30 min).
   Les jetons ne sont jamais stockés en clair : seule leur empreinte SHA-256 l'est.
   Secrets : BREVO_KEY (envoi des e-mails, prestataire français, données hébergées dans l'UE), SIGNATURE_KEY (liens de désinscription).
   Variables : MAIL_FROM (expéditeur, ex. bonjour@trucsafaire.fr), SITE_URL (adresse du site, pour les liens). */

export const VERSION_CONSENTEMENT = "newsletter-v1-2026-10";
export const TEXTE_CONSENTEMENT = "J’accepte de recevoir par e-mail une sélection hebdomadaire des sorties autour de chez moi, selon mes préférences. Désinscription en un clic dans chaque e-mail.";
const CATS = ["brocante", "fete", "spectacle", "culture", "famille", "sport", "pal"];
const SESSION_JOURS = 90, JETON_MIN = 30, INACTIF_ANS = 3;
const SITE_DEFAUT = "https://batiazur-hub.github.io/sorties-bourbonnais-loire/";

const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
export const empreinte = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(String(s))));
const aleatoire = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const maintenant = () => new Date().toISOString();
const t = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
export const emailValide = e => /^[^\s@"<>,;]{1,64}@[^\s@"<>,;]{1,180}\.[a-z]{2,24}$/i.test(e);
const siteUrl = env => (env.SITE_URL || SITE_DEFAUT).replace(/\/?$/, "/");

export async function signature(env, id) {
  const k = await crypto.subtle.importKey("raw", enc.encode(env.SIGNATURE_KEY || env.ADMIN_TOKEN || "cle-de-test"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode("stop:" + id))).slice(0, 32);
}

/* Préférences : seules les informations utiles aux alertes sont gardées (minimisation) */
export function prefsPropres(p, anc) {
  const r = Object.assign({ rayon: 20, cats: [], frequence: "hebdo" }, anc || {});
  if (!p || typeof p !== "object") return r;
  if (p.commune && typeof p.commune === "object") {
    const c = p.commune, lat = +c.lat, lon = +c.lon;
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
      r.commune = { nom: t(c.nom, 80), dep: t(c.dep, 3).toUpperCase(), lat: +lat.toFixed(3), lon: +lon.toFixed(3) };  // ~100 m : la commune, pas l'adresse
  } else if (p.commune === null) delete r.commune;
  if (p.rayon !== undefined) r.rayon = Math.max(5, Math.min(100, parseInt(p.rayon, 10) || 20));
  if (p.cats !== undefined) r.cats = (Array.isArray(p.cats) ? p.cats : []).filter(x => CATS.includes(x));
  if (p.frequence !== undefined) r.frequence = ["hebdo", "weekend"].includes(p.frequence) ? p.frequence : "hebdo";
  return r;
}
const favPropres = f => [...new Set((Array.isArray(f) ? f : []).map(x => t(x, 80)).filter(Boolean))].slice(0, 500);

function vuePublique(c) {
  return { email: c.email, cree: c.cree, offre: c.offre || "trucophile", prefs: c.prefs, fav: c.fav || [],
           newsletter: !!(c.newsletter && c.newsletter.actif) };
}
function consentir(c, actif, source) {
  const avant = !!(c.newsletter && c.newsletter.actif);
  if (avant === !!actif) return;
  c.newsletter = { actif: !!actif, date: maintenant(), version: VERSION_CONSENTEMENT, source };
  c.consentements = (c.consentements || []).concat([{ date: c.newsletter.date, action: actif ? "accord" : "retrait", version: VERSION_CONSENTEMENT, source }]).slice(-30);
}

async function limite(env, cle, max, secondes) {
  const n = +(await env.DLC.get(cle) || 0);
  if (n >= max) return false;
  await env.DLC.put(cle, String(n + 1), { expirationTtl: Math.max(60, secondes) });
  return true;
}

async function envoyerLien(env, email, lien, nouveau) {
  const sujet = nouveau ? "Confirmez votre compte Trucs à faire" : "Votre lien de connexion à Trucs à faire";
  const intro = nouveau ? "Bienvenue ! Cliquez sur le bouton pour confirmer votre adresse et activer votre compte Trucophile." : "Cliquez sur le bouton pour vous connecter.";
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f1f3f8;font-family:Arial,sans-serif;color:#141a33">
<div style="max-width:520px;margin:0 auto;padding:32px 20px"><p style="font-size:22px;font-weight:700;margin:0 0 18px;color:#2546d8">trucs à faire</p>
<div style="background:#fff;border-radius:18px;padding:28px"><p style="font-size:16px;line-height:1.5;margin:0 0 22px">${intro}</p>
<p style="margin:0 0 22px"><a href="${lien}" style="display:inline-block;background:#2546d8;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px">${nouveau ? "Confirmer mon compte" : "Me connecter"}</a></p>
<p style="font-size:13px;color:#4d5470;line-height:1.5;margin:0">Ce lien est valable ${JETON_MIN} minutes et ne sert qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : aucun compte ne sera créé.</p></div>
<p style="font-size:12px;color:#4d5470;margin:18px 4px 0">Trucs à faire · Saryn Digital (Clément Monteiro EI)</p></div></body></html>`;
  const txt = `${intro}\n\n${lien}\n\nCe lien est valable ${JETON_MIN} minutes et ne sert qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST",
    headers: { "api-key": env.BREVO_KEY, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ sender: { name: "Trucs à faire", email: env.MAIL_FROM || "bonjour@trucsafaire.fr" }, to: [{ email }], subject: sujet, htmlContent: html, textContent: txt, tags: ["connexion"] }) });
  if (!r.ok) throw new Error("envoi " + r.status);
}

async function compteDeSession(req, env) {
  const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[0-9a-f]{64}$/.test(tok)) return null;
  const h = await empreinte(tok), s = await env.DLC.get("ses:" + h, "json");
  if (!s) return null;
  const c = await env.DLC.get("cpt:" + s.id, "json");
  return c ? { c, h } : null;
}
async function enregistrer(env, c) { await env.DLC.put("cpt:" + c.id, JSON.stringify(c)); }

function page(titre, texte, env) {
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre}</title>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#141a33"><h1 style="font-size:1.5rem">${titre}</h1><p>${texte}</p>
<p><a href="${siteUrl(env)}" style="color:#2546d8">Retour aux sorties</a></p></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* Renvoie une réponse si la route concerne les comptes, sinon null */
export async function comptes(req, env, url, p, cors, json) {
  if (p === "/newsletter/stop") {
    const id = t(url.searchParams.get("c"), 40), sig = t(url.searchParams.get("s"), 64);
    const c = /^[0-9a-f]{24}$/.test(id) && await env.DLC.get("cpt:" + id, "json");
    if (!c || sig !== await signature(env, id)) return page("Lien invalide", "Ce lien de désinscription n’est pas valide. Vous pouvez aussi vous désinscrire depuis « Mon compte ».", env);
    consentir(c, false, "lien de désinscription"); await enregistrer(env, c);
    return page("Vous êtes désinscrit", "Vous ne recevrez plus la sélection hebdomadaire. Votre compte et vos favoris sont conservés.", env);
  }
  if (!p.startsWith("/compte")) return null;

  if (req.method === "POST" && p === "/compte/lien") {
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    const email = t(b.email, 200).toLowerCase();
    if (!emailValide(email)) return json({ erreur: "email_invalide" }, 400, cors);
    const ip = req.headers.get("CF-Connecting-IP") || "?", heure = new Date().toISOString().slice(0, 13);
    if (!await limite(env, "rlc:" + ip + ":" + heure, 10, 3700) || !await limite(env, "rle:" + (await empreinte(email)).slice(0, 24) + ":" + heure, 4, 3700))
      return json({ erreur: "trop_de_demandes", message: "Trop de demandes. Réessayez dans une heure." }, 429, cors);
    const id = (await empreinte(email)).slice(0, 24), existe = !!(await env.DLC.get("cpt:" + id));
    if (!existe && b.cgu !== true) return json({ erreur: "cgu_requises" }, 400, cors);
    const jeton = aleatoire(32);
    await env.DLC.put("jet:" + await empreinte(jeton), JSON.stringify({ email, id, nouveau: !existe, prefs: prefsPropres(b.prefs), newsletter: b.newsletter === true, fav: favPropres(b.fav), cree: maintenant() }), { expirationTtl: JETON_MIN * 60 });
    const lien = siteUrl(env) + "#connexion=" + jeton;
    if (env.BREVO_KEY) {
      try { await envoyerLien(env, email, lien, !existe); } catch { return json({ erreur: "envoi_impossible", message: "L’e-mail n’a pas pu partir. Réessayez dans un instant." }, 502, cors); }
      return json({ ok: true }, 200, cors);
    }
    if (env.MODE_TEST === "1") return json({ ok: true, lien }, 200, cors);  // tests automatiques uniquement
    return json({ erreur: "envoi_indisponible", message: "L’envoi des e-mails n’est pas encore configuré." }, 503, cors);
  }

  if (req.method === "POST" && p === "/compte/connexion") {
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    const jeton = t(b.jeton, 80);
    if (!/^[0-9a-f]{64}$/.test(jeton)) return json({ erreur: "lien_invalide" }, 400, cors);
    const kj = "jet:" + await empreinte(jeton), j = await env.DLC.get(kj, "json");
    if (!j) return json({ erreur: "lien_expire", message: "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau." }, 400, cors);
    await env.DLC.delete(kj);
    let c = await env.DLC.get("cpt:" + j.id, "json");
    if (!c) {
      c = { id: j.id, email: j.email, cree: maintenant(), offre: "trucophile", prefs: j.prefs, fav: j.fav || [], cgu: { date: maintenant(), version: "cgu-2026-10" }, sessions: [] };
      consentir(c, j.newsletter, "inscription");  // double opt-in : actif seulement après clic sur le lien reçu par e-mail
    } else {
      c.fav = favPropres((c.fav || []).concat(j.fav || []));
      if (j.newsletter) consentir(c, true, "formulaire de connexion");
    }
    const session = aleatoire(32), hs = await empreinte(session);
    await env.DLC.put("ses:" + hs, JSON.stringify({ id: c.id, cree: maintenant() }), { expirationTtl: SESSION_JOURS * 86400 });
    c.sessions = (c.sessions || []).concat([hs]).slice(-10);
    c.vu = maintenant().slice(0, 10);
    await enregistrer(env, c);
    return json({ ok: true, session, nouveau: !!j.nouveau, compte: vuePublique(c) }, 200, cors);
  }

  const s = await compteDeSession(req, env);
  if (!s) return json({ erreur: "non_connecte" }, 401, cors);
  const c = s.c, jour = maintenant().slice(0, 10);

  if (req.method === "GET" && p === "/compte") {
    if (c.vu !== jour) { c.vu = jour; await enregistrer(env, c); }  // au plus une écriture par jour
    return json({ ok: true, compte: vuePublique(c) }, 200, cors);
  }
  if (req.method === "GET" && p === "/compte/export") {
    const { sessions, ...donnees } = c;
    return new Response(JSON.stringify({ exporte: maintenant(), service: "Trucs à faire", compte: donnees }, null, 2),
      { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=\"trucs-a-faire-mes-donnees.json\"", ...cors } });
  }
  if (req.method === "POST" && p === "/compte") {
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    if (b.prefs !== undefined) c.prefs = prefsPropres(b.prefs, c.prefs);
    if (b.fav !== undefined) c.fav = favPropres(b.fav);
    if (b.newsletter !== undefined) consentir(c, b.newsletter === true, "Mon compte");
    c.vu = jour; await enregistrer(env, c);
    return json({ ok: true, compte: vuePublique(c) }, 200, cors);
  }
  if (req.method === "POST" && p === "/compte/deconnexion") {
    await env.DLC.delete("ses:" + s.h);
    c.sessions = (c.sessions || []).filter(x => x !== s.h); await enregistrer(env, c);
    return json({ ok: true }, 200, cors);
  }
  if (req.method === "POST" && p === "/compte/supprimer") {
    for (const h of c.sessions || []) await env.DLC.delete("ses:" + h);
    await env.DLC.delete("cpt:" + c.id);
    return json({ ok: true }, 200, cors);
  }
  return json({ erreur: "introuvable" }, 404, cors);
}

/* Tâche planifiée : suppression des comptes sans connexion depuis 3 ans (durée annoncée dans la politique de confidentialité) */
export async function purgerInactifs(env) {
  const limiteDate = new Date(Date.now() - INACTIF_ANS * 365.25 * 86400000).toISOString().slice(0, 10);
  let cursor, n = 0;
  do {
    const r = await env.DLC.list({ prefix: "cpt:", cursor });
    for (const k of r.keys) {
      const c = await env.DLC.get(k.name, "json");
      if (c && (c.vu || c.cree.slice(0, 10)) < limiteDate) {
        for (const h of c.sessions || []) await env.DLC.delete("ses:" + h);
        await env.DLC.delete(k.name); n++;
      }
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return n;
}
