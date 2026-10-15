/* Comptes Trucophile : connexion sans mot de passe (lien envoyé par e-mail), préférences, favoris, consentement newsletter.

   POST /compte/lien        { email, prefs?, newsletter?, cgu }  → envoie un lien de connexion (réponse identique que le compte existe ou non)
   POST /compte/connexion   { jeton }                            → { session, compte }   (jeton à usage unique, valable 30 min)
   GET  /compte                                                   → profil           (en-tête Authorization: Bearer <session>)
   POST /compte             { prefs?, newsletter?, fav? }         → profil mis à jour
   GET  /compte/export                                            → toutes les données du compte (droit à la portabilité)
   POST /compte/deconnexion { partout? }                          → déconnexion (de cet appareil, ou de tous)
   POST /compte/supprimer                                         → suppression immédiate et définitive (page organisateur et sorties comprises)
   GET  /newsletter/stop?c=<id>&s=<signature>                     → page de confirmation (les antivirus de messagerie ouvrent les liens : un GET ne désinscrit pas)
   POST /newsletter/stop?c=<id>&s=<signature>                     → désinscription (bouton de la page, ou en un clic depuis la messagerie, RFC 8058)

   Stockage KV : « cpt:<id> » compte, « ses:<empreinte> » session (90 jours), « jet:<empreinte> » lien de connexion (30 min).
   Les jetons ne sont jamais stockés en clair : seule leur empreinte SHA-256 l'est.
   Chaque session porte la « génération » du compte : supprimer le compte ou « se déconnecter partout » invalide toutes les sessions.
   Secrets : BREVO_KEY (envoi des e-mails, prestataire français, données hébergées dans l'UE), SIGNATURE_KEY (liens signés, obligatoire).
   Variables : MAIL_FROM (expéditeur, ex. bonjour@trucsafaire.fr), SITE_URL (adresse du site, pour les liens). */

import { motRefuse, egal, limite, agenda, majAgenda, publier, retirer } from "./commun.js";

export const VERSION_CONSENTEMENT = "newsletter-v2-2026-10";
export const TEXTE_CONSENTEMENT = "Oui, je veux recevoir « Le Truc de la semaine » : chaque semaine par e-mail, une sélection des sorties autour de chez moi, selon mes préférences. Désinscription en un clic dans chaque e-mail.";
const CATS = ["brocante", "fete", "spectacle", "culture", "famille", "sport", "pal"];
const SESSION_JOURS = 90, JETON_MIN = 30, INACTIF_ANS = 3;
const SITE_DEFAUT = "https://trucsafaire.fr/";

const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
export const empreinte = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(String(s))));
const aleatoire = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const maintenant = () => new Date().toISOString();
const t = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
export const emailValide = e => /^[^\s@"<>,;]{1,64}@[^\s@"<>,;]{1,180}\.[a-z]{2,24}$/i.test(e);
const siteUrl = env => (env.SITE_URL || SITE_DEFAUT).replace(/\/?$/, "/");

/* Liens signés (désinscription « stop », lecture dans le navigateur « vue ») : clé dédiée obligatoire, jamais de valeur par défaut */
export async function signature(env, id, usage = "stop") {
  if (!env.SIGNATURE_KEY || String(env.SIGNATURE_KEY).length < 16) throw new Error("SIGNATURE_KEY manquante");
  const k = await crypto.subtle.importKey("raw", enc.encode(env.SIGNATURE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(usage + ":" + id))).slice(0, 32);
}
export async function signatureValide(env, id, sig, usage = "stop") {
  if (!env.SIGNATURE_KEY || !/^[0-9a-f]{24}$/.test(id) || !/^[0-9a-f]{32}$/.test(sig || "")) return false;
  return egal(sig, await signature(env, id, usage));
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
           newsletter: !!(c.newsletter && c.newsletter.actif), org: c.org || null };
}

/* ---------- Profils organisateurs (Faiseur de trucs) ----------
   « org:<slug> » → { slug, id (compte), nom, bio, site, insta, fb, logo (n° de version, 0 = aucun), verifie, cree }
   « logo:<slug> » → image (data URL, 200 Ko max) ; « orgs » → index public de tous les profils (pastilles dans la liste) */
const slugDe = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "organisateur";
const lienWeb = u => { u = t(u, 200); if (/^www\./i.test(u)) u = "https://" + u; return /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(u) ? u : ""; };
const pseudo = v => t(v, 80).replace(/^https?:\/\/(www\.)?(instagram|facebook)\.com\//i, "").replace(/^@/, "").replace(/[^\w.\-]/g, "").slice(0, 60);
export const orgPublic = o => o && { slug: o.slug, nom: o.nom, bio: o.bio || "", site: o.site || "", insta: o.insta || "", fb: o.fb || "", logo: o.logo || 0, verifie: !!o.verifie };
/* Index public « orgs » : mis à jour élément par élément (KV.list n'est pas cohérent tout de suite) ; les pages suspendues n'y figurent pas */
async function majIndexOrgs(env, o, retirerSlug) {
  const idx = (await env.DLC.get("orgs", "json")) || [];
  const slug = o ? o.slug : retirerSlug, out = idx.filter(x => x.slug !== slug);
  if (o && !o.suspendu) out.push({ slug: o.slug, nom: o.nom, logo: o.logo || 0, verifie: !!o.verifie });
  await env.DLC.put("orgs", JSON.stringify(out));
}
const DEP_OK = /^(\d{2}|2A|2B|97[1-6])$/;
function sortieOrg(b, o, id) {
  const e = { id, t: t(b.t, 90), cat: CATS.includes(b.cat) ? b.cat : "", s: t(b.s, 10), w: t(b.w, 80), z: t(b.z, 3).toUpperCase(), lieu: t(b.lieu, 90), d: t(b.d, 600),
              u: lienWeb(b.u), b: lienWeb(b.b), img: /^https:\/\//.test(b.img || "") ? t(b.img, 400) : "", lat: +b.lat, lon: +b.lon,
              src: "Publié par " + o.nom, org: o.slug, p: 1, publie: maintenant() };
  if (b.e && /^\d{4}-\d{2}-\d{2}$/.test(b.e) && b.e > e.s) e.e = t(b.e, 10);
  if (b.h && /^\d{2}:\d{2}$/.test(b.h)) e.h = b.h;
  if (b.g) e.g = 1;
  for (const k of ["u", "b", "img", "lieu", "d"]) if (!e[k]) delete e[k];
  if (!e.lieu) e.lieu = e.w;
  return e;
}
function consentir(c, actif, source) {
  const avant = !!(c.newsletter && c.newsletter.actif);
  if (avant === !!actif) return;
  c.newsletter = { actif: !!actif, date: maintenant(), version: VERSION_CONSENTEMENT, source };
  c.consentements = (c.consentements || []).concat([{ date: c.newsletter.date, action: actif ? "accord" : "retrait", version: VERSION_CONSENTEMENT, source }]).slice(-30);
}


async function envoyerLien(env, email, lien, nouveau) {
  const sujet = nouveau ? "Bienvenue chez les Trucophiles : confirmez votre compte" : "Votre lien pour retrouver vos trucs";
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
  if (!c || (c.gen || "") !== (s.gen || "")) return null;  // compte supprimé, recréé, ou « déconnecté partout »
  return { c, h };
}

/* Suppression en cascade : sessions, page organisateur, logo, sorties publiées, puis le compte (utilisée par
   « Supprimer mon compte » et par la purge des comptes inactifs) */
export async function supprimerCompte(env, c) {
  for (const h of c.sessions || []) await env.DLC.delete("ses:" + h);
  if (c.org && c.org.slug) { const o = await env.DLC.get("org:" + c.org.slug, "json"); if (!o || o.id === c.id) await effacerOrg(env, c.org.slug); }
  await env.DLC.delete("cpt:" + c.id);
}
async function effacerOrg(env, slug) {
  const ids = (await agenda(env)).filter(x => x.org === slug).map(x => x.id);
  const lst = await env.DLC.list({ prefix: "a:o-" });  // y compris les sorties retirées de l'agenda par une suspension
  for (const k of lst.keys) { const e = await env.DLC.get(k.name, "json"); if (e && e.org === slug && !ids.includes(e.id)) ids.push(e.id); }
  if (ids.length) await retirer(env, ids);
  await env.DLC.delete("org:" + slug); await env.DLC.delete("logo:" + slug); await majIndexOrgs(env, null, slug);
}
async function enregistrer(env, c) { await env.DLC.put("cpt:" + c.id, JSON.stringify(c)); }

function page(titre, texte, env, statut, suite) {
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titre}</title>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#141a33"><h1 style="font-size:1.5rem">${titre}</h1><p>${texte}</p>${suite || ""}
<p><a href="${siteUrl(env)}" style="color:#2546d8">Retour aux sorties</a></p></body></html>`, { status: statut || 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/* Renvoie une réponse si la route concerne les comptes, sinon null */
export async function comptes(req, env, url, p, cors, json, outils) {
  if (p === "/newsletter/stop") {
    if (!env.SIGNATURE_KEY) return page("Service indisponible", "La désinscription par lien est momentanément indisponible. Désinscrivez-vous depuis « Mon compte ».", env, 503);
    const id = t(url.searchParams.get("c"), 40), sig = t(url.searchParams.get("s"), 64);
    const c = await signatureValide(env, id, sig) && await env.DLC.get("cpt:" + id, "json");
    if (!c) return page("Lien invalide", "Ce lien de désinscription n’est pas valide. Vous pouvez aussi vous désinscrire depuis « Mon compte ».", env, 400);
    if (req.method !== "POST")  // GET : confirmation (les antivirus de messagerie ouvrent les liens tout seuls)
      return page("Se désinscrire ?", "Vous ne recevrez plus « Le Truc de la semaine ». Votre compte et vos favoris sont conservés.", env, 200,
        `<form method="post"><button style="font:inherit;font-weight:700;background:#2546d8;color:#fff;border:0;border-radius:999px;padding:12px 22px;cursor:pointer">Me désinscrire</button></form>`);
    consentir(c, false, "lien de désinscription"); await enregistrer(env, c);
    return page("Vous êtes désinscrit", "Vous ne recevrez plus « Le Truc de la semaine ». Votre compte et vos favoris sont conservés.", env);
  }
  if (req.method === "GET" && p === "/orgs") {
    return new Response((await env.DLC.get("orgs")) || "[]", { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", ...cors } });
  }
  let m = p.match(/^\/org\/([a-z0-9-]{1,40})(\/logo)?$/);
  if (req.method === "GET" && m) {
    const o = await env.DLC.get("org:" + m[1], "json");
    if (!o || o.suspendu) return json({ erreur: "introuvable" }, 404, cors);
    if (m[2]) {
      const d = await env.DLC.get("logo:" + o.slug); const mm = d && d.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
      if (!mm) return new Response("", { status: 404, headers: cors });
      return new Response(Uint8Array.from(atob(mm[2]), x => x.charCodeAt(0)), { headers: { "Content-Type": mm[1], "Cache-Control": "public, max-age=86400", ...cors } });
    }
    const auj = new Date().toISOString().slice(0, 10), ag = (await env.DLC.get("agenda", "json")) || [];
    return json({ ok: true, org: orgPublic(o), sorties: ag.filter(e => e.org === o.slug && (e.e || e.s) >= auj).sort((a, b) => a.s < b.s ? -1 : 1) }, 200, cors);
  }
  if (!p.startsWith("/compte")) return null;

  if (req.method === "POST" && p === "/compte/lien") {
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    const email = t(b.email, 200).toLowerCase();
    if (!emailValide(email)) return json({ erreur: "email_invalide" }, 400, cors);
    const ip = req.headers.get("CF-Connecting-IP") || "?", id = (await empreinte(email)).slice(0, 24);
    if (!limite("rlc:" + ip, 10, 3600) || !limite("rle:" + id, 4, 3600))
      return json({ erreur: "trop_de_demandes", message: "Trop de demandes. Réessayez dans une heure." }, 429, cors);
    const existe = !!(await env.DLC.get("cpt:" + id));
    // Réponse identique que l'adresse ait un compte ou non : sans CGU acceptées, rien n'est envoyé à une adresse inconnue
    if (!existe && b.cgu !== true) return json({ ok: true }, 200, cors);
    const jeton = aleatoire(32);
    await env.DLC.put("jet:" + await empreinte(jeton), JSON.stringify({ email, id, nouveau: !existe, prefs: prefsPropres(b.prefs), newsletter: b.newsletter === true, fav: favPropres(b.fav), cree: maintenant() }), { expirationTtl: JETON_MIN * 60 });
    const lien = siteUrl(env) + "#connexion=" + jeton;
    if (env.BREVO_KEY) {
      try { await envoyerLien(env, email, lien, !existe); } catch { return json({ erreur: "envoi_impossible", message: "L’e-mail n’a pas pu partir. Réessayez dans un instant." }, 502, cors); }
      return json({ ok: true }, 200, cors);
    }
    if (env.MODE_TEST === "1" && /^(localhost|127\.0\.0\.1|[a-z0-9.-]+\.test)$/.test(url.hostname)) return json({ ok: true, lien }, 200, cors);  // tests automatiques, jamais en ligne
    return json({ erreur: "envoi_indisponible", message: "L’envoi des e-mails n’est pas encore configuré." }, 503, cors);
  }

  if (req.method === "POST" && p === "/compte/connexion") {
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    const jeton = t(b.jeton, 80);
    if (!/^[0-9a-f]{64}$/.test(jeton)) return json({ erreur: "lien_invalide" }, 400, cors);
    const kj = "jet:" + await empreinte(jeton), j = await env.DLC.get(kj, "json");
    if (!j) return json({ erreur: "lien_expire", message: "Ce lien a fait son temps (il a expiré ou a déjà servi). On vous en renvoie un ?" }, 400, cors);
    await env.DLC.delete(kj);
    let c = await env.DLC.get("cpt:" + j.id, "json");
    if (!c) {
      c = { id: j.id, email: j.email, cree: maintenant(), offre: "trucophile", prefs: j.prefs, fav: j.fav || [], cgu: { date: maintenant(), version: "cgu-2026-10" }, sessions: [], gen: aleatoire(6) };
      consentir(c, j.newsletter, "inscription");  // double opt-in : actif seulement après clic sur le lien reçu par e-mail
    } else {
      c.fav = favPropres((c.fav || []).concat(j.fav || []));
      if (j.newsletter) consentir(c, true, "formulaire de connexion");
    }
    const session = aleatoire(32), hs = await empreinte(session);
    await env.DLC.put("ses:" + hs, JSON.stringify({ id: c.id, gen: c.gen || "", cree: maintenant() }), { expirationTtl: SESSION_JOURS * 86400 });
    c.sessions = (c.sessions || []).concat([hs]);
    while (c.sessions.length > 10) await env.DLC.delete("ses:" + c.sessions.shift());  // 10 appareils au plus : la plus ancienne session est fermée
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
  if (req.method === "GET" && p === "/compte/newsletter") {  // aperçu de « Le Truc de la semaine » avec les préférences du compte
    if (!c.prefs || !c.prefs.commune) return json({ erreur: "commune_requise", message: "Indiquez votre commune pour recevoir une sélection autour de chez vous." }, 400, cors);
    const m = outils && outils.apercuNl ? await outils.apercuNl(c) : null;
    return m ? new Response(m.html, { headers: { "Content-Type": "text/html; charset=utf-8", ...cors } }) : json({ erreur: "indisponible" }, 503, cors);
  }
  if (req.method === "GET" && p === "/compte/export") {
    const { sessions, gen, ...donnees } = c, out = { exporte: maintenant(), service: "Trucs à faire", compte: donnees };
    if (c.org) {  // page organisateur et sorties publiées (droit à la portabilité)
      const o = await env.DLC.get("org:" + c.org.slug, "json");
      if (o) { const { id, ...page } = o; out.page_organisateur = Object.assign(page, { logo: o.logo ? await env.DLC.get("logo:" + o.slug) : null }); }
      out.sorties_publiees = (await agenda(env)).filter(e => e.org === c.org.slug);
    }
    return new Response(JSON.stringify(out, null, 2),
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
    let b = {}; try { b = await req.json(); } catch {}
    if (b && b.partout) {  // « Se déconnecter partout » : toutes les sessions, même celles d'un appareil perdu
      for (const h of c.sessions || []) await env.DLC.delete("ses:" + h);
      c.sessions = []; c.gen = aleatoire(6);
    } else { await env.DLC.delete("ses:" + s.h); c.sessions = (c.sessions || []).filter(x => x !== s.h); }
    await enregistrer(env, c);
    return json({ ok: true }, 200, cors);
  }
  if (req.method === "POST" && p === "/compte/org") {
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    const nom = t(b.nom, 60);
    if (nom.length < 2) return json({ erreur: "nom_requis", message: "Indiquez le nom de votre organisation." }, 400, cors);
    if (motRefuse(nom, b.bio)) return json({ erreur: "mot_refuse", message: "Un mot n’est pas accepté. Reformulez, s’il vous plaît." }, 422, cors);
    let o = c.org && await env.DLC.get("org:" + c.org.slug, "json");
    if (o && o.suspendu) return json({ erreur: "suspendu", message: "Votre page est suspendue. Écrivez-nous : contact@trucsafaire.fr" }, 403, cors);
    if (!o) {
      let slug = slugDe(nom), n = 2; while (await env.DLC.get("org:" + slug)) slug = slugDe(nom).slice(0, 36) + "-" + n++;
      o = { slug, id: c.id, logo: 0, verifie: false, cree: maintenant() };
    }
    Object.assign(o, { nom, bio: t(b.bio, 300), site: lienWeb(b.site), insta: pseudo(b.insta), fb: pseudo(b.fb) });
    await env.DLC.put("org:" + o.slug, JSON.stringify(o));
    c.org = orgPublic(o); if (!c.offre || c.offre === "trucophile") c.offre = "faiseur"; await enregistrer(env, c); await majIndexOrgs(env, o);
    return json({ ok: true, compte: vuePublique(c) }, 200, cors);
  }
  if (req.method === "POST" && p === "/compte/org/logo") {
    if (!c.org) return json({ erreur: "pas_de_profil" }, 400, cors);
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    const img = String(b.image || "");
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > 270000) return json({ erreur: "image_invalide", message: "Image PNG, JPEG ou WebP de 200 Ko maximum." }, 400, cors);
    const o = await env.DLC.get("org:" + c.org.slug, "json");
    if (!o || o.suspendu) return json({ erreur: "suspendu" }, 403, cors);
    o.logo = (o.logo || 0) + 1;
    await env.DLC.put("logo:" + o.slug, img); await env.DLC.put("org:" + o.slug, JSON.stringify(o));
    c.org = orgPublic(o); await enregistrer(env, c); await majIndexOrgs(env, o);
    return json({ ok: true, compte: vuePublique(c) }, 200, cors);
  }
  if (req.method === "GET" && p === "/compte/apercu") {
    if (!c.org) return json({ erreur: "pas_de_profil" }, 400, cors);
    if (!limite("rla:" + c.id, 60, 86400)) return json({ erreur: "trop_de_demandes" }, 429, cors);
    const r = await apercuLien(url.searchParams.get("url") || "");
    return r ? json({ ok: true, sortie: r }, 200, cors) : json({ erreur: "lien_illisible", message: "Impossible de lire cette page. Remplissez les champs à la main." }, 422, cors);
  }
  if (p === "/compte/sorties") {
    if (!c.org) return json({ erreur: "pas_de_profil", message: "Créez d’abord votre page organisateur." }, 400, cors);
    const ag = await agenda(env);
    if (req.method === "GET") return json({ ok: true, sorties: ag.filter(e => e.org === c.org.slug) }, 200, cors);
    const o = await env.DLC.get("org:" + c.org.slug, "json");
    if (!o || o.suspendu) return json({ erreur: "suspendu", message: "Votre page est suspendue : la publication est bloquée. Écrivez-nous : contact@trucsafaire.fr" }, 403, cors);
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    if (b.supprimer) {
      const id = t(b.supprimer, 40), e = ag.find(x => x.id === id && x.org === c.org.slug);
      if (!e) return json({ erreur: "introuvable" }, 404, cors);
      await retirer(env, [id]);
      return json({ ok: true }, 200, cors);
    }
    if (!limite("rlo:" + c.id, 40, 86400)) return json({ erreur: "trop_de_demandes", message: "40 sorties par jour au maximum." }, 429, cors);
    const ex = b.id && ag.find(x => x.id === b.id && x.org === c.org.slug);
    const e = sortieOrg(b, c.org, ex ? ex.id : "o-" + Date.now().toString(36) + aleatoire(3));
    if (e.t.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(e.s) || !e.w || !e.cat || !DEP_OK.test(e.z)
        || !isFinite(e.lat) || !isFinite(e.lon) || Math.abs(e.lat) > 90 || Math.abs(e.lon) > 180 || (!e.lat && !e.lon))
      return json({ erreur: "incomplet", message: "Titre, type, date, commune et position sont nécessaires." }, 400, cors);
    if (motRefuse(e.t, e.d, e.lieu)) return json({ erreur: "mot_refuse", message: "Un mot n’est pas accepté. Reformulez, s’il vous plaît." }, 422, cors);
    await publier(env, e);
    return json({ ok: true, sortie: e }, 200, cors);
  }
  if (req.method === "POST" && p === "/compte/supprimer") {
    await supprimerCompte(env, c);
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
      if (c && (c.vu || c.cree.slice(0, 10)) < limiteDate) { await supprimerCompte(env, c); n++; }
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return n;
}

/* Éditeur : pastille « vérifié » (offre Truc & Co, ou vérification manuelle) */
export async function verifierOrg(env, slug, verifie) {
  const o = await env.DLC.get("org:" + slug, "json"); if (!o) return null;
  o.verifie = !!verifie; await env.DLC.put("org:" + slug, JSON.stringify(o));
  const c = await env.DLC.get("cpt:" + o.id, "json"); if (c) { c.org = orgPublic(o); await env.DLC.put("cpt:" + c.id, JSON.stringify(c)); }
  await majIndexOrgs(env, o); return orgPublic(o);
}

/* Éditeur : suspendre une page abusive (usurpation, contenu illicite : retrait prompt, LCEN) ou la rétablir.
   Suspendue : page publique en 404, absente de l'index, sorties retirées de l'agenda, publication bloquée. */
export async function suspendreOrg(env, slug, suspendu, motif) {
  const o = await env.DLC.get("org:" + slug, "json"); if (!o) return null;
  o.suspendu = !!suspendu; if (suspendu) o.motif = t(motif, 200); else delete o.motif;
  await env.DLC.put("org:" + slug, JSON.stringify(o)); await majIndexOrgs(env, o);
  const c = await env.DLC.get("cpt:" + o.id, "json"); if (c) { c.org = Object.assign(orgPublic(o), { suspendu: !!o.suspendu }); await env.DLC.put("cpt:" + c.id, JSON.stringify(c)); }
  if (suspendu) { const ids = (await agenda(env)).filter(e => e.org === slug).map(e => e.id); if (ids.length) await majAgenda(env, { retrait: ids }); }
  else { const lst = await env.DLC.list({ prefix: "a:o-" }); const ajout = [];
    for (const k of lst.keys) { const e = await env.DLC.get(k.name, "json"); if (e && e.org === slug) ajout.push(e); }
    if (ajout.length) await majAgenda(env, { ajout }); }
  return Object.assign(orgPublic(o), { suspendu: !!o.suspendu });
}
/* Éditeur : supprimer une page organisateur (le compte Trucophile est conservé) */
export async function supprimerOrgAdmin(env, slug) {
  const o = await env.DLC.get("org:" + slug, "json"); if (!o) return false;
  await effacerOrg(env, slug);
  const c = await env.DLC.get("cpt:" + o.id, "json");
  if (c) { delete c.org; if (c.offre === "faiseur") c.offre = "trucophile"; await env.DLC.put("cpt:" + c.id, JSON.stringify(c)); }
  return true;
}

/* Pré-remplissage depuis le lien d'un événement (HelloAsso, Billetweb, site d'association…) :
   données structurées schema.org Event si présentes, sinon balises Open Graph. Seules les pages https publiques sont lues. */
const ent = x => String(x || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const adressePublique = x => x.protocol === "https:" && !x.port && x.hostname.includes(".") && !x.username
  && !/^(localhost|.*\.local|.*\.internal|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(x.hostname);
async function lireLimite(r, max) {  // lecture en flux, arrêtée à max octets
  if (!r.body || !r.body.getReader) return (await r.text()).slice(0, max);
  const lect = r.body.getReader(), dec = new TextDecoder(); let out = "";
  while (out.length < max) { const { done, value } = await lect.read(); if (done) break; out += dec.decode(value, { stream: true }); }
  try { lect.cancel(); } catch {}
  return out.slice(0, max);
}
export async function apercuLien(u) {
  let x; try { x = new URL(String(u).trim()); } catch { return null; }
  if (!adressePublique(x)) return null;
  let html;
  try {
    let r;
    for (let saut = 0; ; saut++) {  // redirections suivies à la main (3 au plus), chacune revérifiée
      r = await fetch(x.href, { headers: { "User-Agent": "TrucsAFaire/1.0 (+https://trucsafaire.fr)", "Accept": "text/html" }, redirect: "manual", signal: AbortSignal.timeout(8000) });
      if (r.status < 300 || r.status > 399) break;
      const loc = r.headers.get("Location"); if (!loc || saut >= 3) return null;
      x = new URL(loc, x); if (!adressePublique(x)) return null;
    }
    if (!r.ok || !/html/i.test(r.headers.get("Content-Type") || "")) return null;
    html = await lireLimite(r, 1500000);
  } catch { return null; }
  const meta = k => { const m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + k + '["\'][^>]*content=["\']([^"\']*)', "i")) || html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + k + '["\']', "i")); return m ? ent(m[1]) : ""; };
  let ev = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim()); const pile = [].concat(j, j && j["@graph"] || []);
      ev = pile.find(o => o && /Event$/.test([].concat(o["@type"] || "").join(" "))); if (ev) break;
    } catch {}
  }
  const out = { u: x.href };
  if (ev) {
    out.t = ent(ev.name); out.d = ent(ev.description).slice(0, 400);
    const sd = String(ev.startDate || ""), ed = String(ev.endDate || "");
    if (/^\d{4}-\d{2}-\d{2}/.test(sd)) { out.s = sd.slice(0, 10); const h = sd.match(/T(\d{2}:\d{2})/); if (h && h[1] !== "00:00") out.h = h[1]; }
    if (/^\d{4}-\d{2}-\d{2}/.test(ed) && ed.slice(0, 10) > (out.s || "")) out.e = ed.slice(0, 10);
    const loc = [].concat(ev.location || [])[0] || {}, adr = loc.address || {};
    if (loc.name) out.lieu = ent(loc.name);
    out.w = ent(typeof adr === "string" ? "" : adr.addressLocality);
    const img = [].concat(ev.image || [])[0]; out.img = typeof img === "string" ? img : img && img.url || "";
    const of = [].concat(ev.offers || [])[0]; if (of && of.url) out.b = String(of.url);
  }
  out.t = out.t || meta("og:title") || ent((html.match(/<title>([^<]*)/i) || [])[1]);
  out.d = out.d || meta("og:description") || meta("description");
  out.img = out.img || meta("og:image");
  if (!/^https:\/\//.test(out.img || "")) delete out.img;
  if (out.b && !/^https?:\/\//.test(out.b)) delete out.b;
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  if (out.t) out.t = out.t.slice(0, 90);
  return out.t ? out : null;
}
