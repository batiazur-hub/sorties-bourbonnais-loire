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

export const VERSION_CONSENTEMENT = "newsletter-v2-2026-10";
export const TEXTE_CONSENTEMENT = "Oui, je veux recevoir « Le Truc de la semaine » : chaque semaine par e-mail, une sélection des sorties autour de chez moi, selon mes préférences. Désinscription en un clic dans chaque e-mail.";
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
           newsletter: !!(c.newsletter && c.newsletter.actif), org: c.org || null };
}

/* ---------- Profils organisateurs (Faiseur de trucs) ----------
   « org:<slug> » → { slug, id (compte), nom, bio, site, insta, fb, logo (n° de version, 0 = aucun), verifie, cree }
   « logo:<slug> » → image (data URL, 200 Ko max) ; « orgs » → index public de tous les profils (pastilles dans la liste) */
const slugDe = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "organisateur";
const lienWeb = u => { u = t(u, 200); if (/^www\./i.test(u)) u = "https://" + u; return /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(u) ? u : ""; };
const pseudo = v => t(v, 80).replace(/^https?:\/\/(www\.)?(instagram|facebook)\.com\//i, "").replace(/^@/, "").replace(/[^\w.\-]/g, "").slice(0, 60);
export const orgPublic = o => o && { slug: o.slug, nom: o.nom, bio: o.bio || "", site: o.site || "", insta: o.insta || "", fb: o.fb || "", logo: o.logo || 0, verifie: !!o.verifie };
async function majIndexOrgs(env) {
  const out = []; let cursor;
  do { const r = await env.DLC.list({ prefix: "org:", cursor });
    for (const k of r.keys) { const o = await env.DLC.get(k.name, "json"); if (o) out.push({ slug: o.slug, nom: o.nom, logo: o.logo || 0, verifie: !!o.verifie }); }
    cursor = r.list_complete ? null : r.cursor; } while (cursor);
  await env.DLC.put("orgs", JSON.stringify(out));
}
const MOTS_ORG = /(encul|connard|connass|salop|pute\b|putain|merde|fdp|ntm|nique|batard|bâtard|negro|bougnoul|youpin)/i;
function sortieOrg(b, o, id) {
  const e = { id, t: t(b.t, 90), cat: t(b.cat, 20), s: t(b.s, 10), w: t(b.w, 80), z: t(b.z, 3).toUpperCase(), lieu: t(b.lieu, 90), d: t(b.d, 600),
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

async function limite(env, cle, max, secondes) {
  const n = +(await env.DLC.get(cle) || 0);
  if (n >= max) return false;
  await env.DLC.put(cle, String(n + 1), { expirationTtl: Math.max(60, secondes) });
  return true;
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
  return c ? { c, h } : null;
}
async function enregistrer(env, c) { await env.DLC.put("cpt:" + c.id, JSON.stringify(c)); }

function page(titre, texte, env) {
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre}</title>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#141a33"><h1 style="font-size:1.5rem">${titre}</h1><p>${texte}</p>
<p><a href="${siteUrl(env)}" style="color:#2546d8">Retour aux sorties</a></p></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* Renvoie une réponse si la route concerne les comptes, sinon null */
export async function comptes(req, env, url, p, cors, json, outils) {
  if (p === "/newsletter/stop") {
    const id = t(url.searchParams.get("c"), 40), sig = t(url.searchParams.get("s"), 64);
    const c = /^[0-9a-f]{24}$/.test(id) && await env.DLC.get("cpt:" + id, "json");
    if (!c || sig !== await signature(env, id)) return page("Lien invalide", "Ce lien de désinscription n’est pas valide. Vous pouvez aussi vous désinscrire depuis « Mon compte ».", env);
    consentir(c, false, "lien de désinscription"); await enregistrer(env, c);
    return page("Vous êtes désinscrit", "Vous ne recevrez plus « Le Truc de la semaine ». Votre compte et vos favoris sont conservés.", env);
  }
  if (req.method === "GET" && p === "/orgs") {
    return new Response((await env.DLC.get("orgs")) || "[]", { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", ...cors } });
  }
  let m = p.match(/^\/org\/([a-z0-9-]{1,40})(\/logo)?$/);
  if (req.method === "GET" && m) {
    const o = await env.DLC.get("org:" + m[1], "json");
    if (!o) return json({ erreur: "introuvable" }, 404, cors);
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
    if (!j) return json({ erreur: "lien_expire", message: "Ce lien a fait son temps (il a expiré ou a déjà servi). On vous en renvoie un ?" }, 400, cors);
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
  if (req.method === "POST" && p === "/compte/org") {
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    const nom = t(b.nom, 60);
    if (nom.length < 2) return json({ erreur: "nom_requis", message: "Indiquez le nom de votre organisation." }, 400, cors);
    if (MOTS_ORG.test([nom, b.bio].join(" "))) return json({ erreur: "mot_refuse" }, 422, cors);
    let o = c.org && await env.DLC.get("org:" + c.org.slug, "json");
    if (!o) {
      let slug = slugDe(nom), n = 2; while (await env.DLC.get("org:" + slug)) slug = slugDe(nom).slice(0, 36) + "-" + n++;
      o = { slug, id: c.id, logo: 0, verifie: false, cree: maintenant() };
    }
    Object.assign(o, { nom, bio: t(b.bio, 300), site: lienWeb(b.site), insta: pseudo(b.insta), fb: pseudo(b.fb) });
    await env.DLC.put("org:" + o.slug, JSON.stringify(o));
    c.org = orgPublic(o); if (!c.offre || c.offre === "trucophile") c.offre = "faiseur"; await enregistrer(env, c); await majIndexOrgs(env);
    return json({ ok: true, compte: vuePublique(c) }, 200, cors);
  }
  if (req.method === "POST" && p === "/compte/org/logo") {
    if (!c.org) return json({ erreur: "pas_de_profil" }, 400, cors);
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    const img = String(b.image || "");
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > 270000) return json({ erreur: "image_invalide", message: "Image PNG, JPEG ou WebP de 200 Ko maximum." }, 400, cors);
    const o = await env.DLC.get("org:" + c.org.slug, "json"); o.logo = (o.logo || 0) + 1;
    await env.DLC.put("logo:" + o.slug, img); await env.DLC.put("org:" + o.slug, JSON.stringify(o));
    c.org = orgPublic(o); await enregistrer(env, c); await majIndexOrgs(env);
    return json({ ok: true, compte: vuePublique(c) }, 200, cors);
  }
  if (req.method === "GET" && p === "/compte/apercu") {
    if (!c.org) return json({ erreur: "pas_de_profil" }, 400, cors);
    if (!await limite(env, "rla:" + c.id + ":" + jour, 60, 90000)) return json({ erreur: "trop_de_demandes" }, 429, cors);
    const r = await apercuLien(url.searchParams.get("url") || "");
    return r ? json({ ok: true, sortie: r }, 200, cors) : json({ erreur: "lien_illisible", message: "Impossible de lire cette page. Remplissez les champs à la main." }, 422, cors);
  }
  if (p === "/compte/sorties") {
    if (!c.org) return json({ erreur: "pas_de_profil", message: "Créez d’abord votre page organisateur." }, 400, cors);
    const ag = (await env.DLC.get("agenda", "json")) || [];
    if (req.method === "GET") return json({ ok: true, sorties: ag.filter(e => e.org === c.org.slug) }, 200, cors);
    let b; try { b = await req.json(); } catch { return json({ erreur: "format" }, 400, cors); }
    if (b.supprimer) {
      const id = t(b.supprimer, 40), e = ag.find(x => x.id === id && x.org === c.org.slug);
      if (!e) return json({ erreur: "introuvable" }, 404, cors);
      await env.DLC.delete("a:" + id); if (outils && outils.majAgenda) await outils.majAgenda(env);
      return json({ ok: true }, 200, cors);
    }
    if (!await limite(env, "rlo:" + c.id + ":" + jour, 40, 90000)) return json({ erreur: "trop_de_demandes", message: "40 sorties par jour au maximum." }, 429, cors);
    const ex = b.id && ag.find(x => x.id === b.id && x.org === c.org.slug);
    const e = sortieOrg(b, c.org, ex ? ex.id : "o-" + Date.now().toString(36) + aleatoire(3));
    if (e.t.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(e.s) || !e.w || !isFinite(e.lat) || !isFinite(e.lon)) return json({ erreur: "incomplet" }, 400, cors);
    if (MOTS_ORG.test([e.t, e.d, e.lieu].join(" "))) return json({ erreur: "mot_refuse" }, 422, cors);
    await env.DLC.put("a:" + e.id, JSON.stringify(e)); if (outils && outils.majAgenda) await outils.majAgenda(env);
    return json({ ok: true, sortie: e }, 200, cors);
  }
  if (req.method === "POST" && p === "/compte/supprimer") {
    for (const h of c.sessions || []) await env.DLC.delete("ses:" + h);
    if (c.org) {  // la page organisateur, son logo et ses sorties publiées partent avec le compte
      const ag = (await env.DLC.get("agenda", "json")) || [];
      for (const e of ag.filter(x => x.org === c.org.slug)) await env.DLC.delete("a:" + e.id);
      await env.DLC.delete("org:" + c.org.slug); await env.DLC.delete("logo:" + c.org.slug);
      await majIndexOrgs(env); if (outils && outils.majAgenda) await outils.majAgenda(env);
    }
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

/* Éditeur : pastille « vérifié » (offre Truc & Co, ou vérification manuelle) */
export async function verifierOrg(env, slug, verifie) {
  const o = await env.DLC.get("org:" + slug, "json"); if (!o) return null;
  o.verifie = !!verifie; await env.DLC.put("org:" + slug, JSON.stringify(o));
  const c = await env.DLC.get("cpt:" + o.id, "json"); if (c) { c.org = orgPublic(o); await env.DLC.put("cpt:" + c.id, JSON.stringify(c)); }
  await majIndexOrgs(env); return orgPublic(o);
}

/* Pré-remplissage depuis le lien d'un événement (HelloAsso, Billetweb, site d'association…) :
   données structurées schema.org Event si présentes, sinon balises Open Graph. Seules les pages https publiques sont lues. */
const ent = x => String(x || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
export async function apercuLien(u) {
  let x; try { x = new URL(String(u).trim()); } catch { return null; }
  if (x.protocol !== "https:" || /^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(x.hostname) || !x.hostname.includes(".")) return null;
  let html;
  try {
    const r = await fetch(x.href, { headers: { "User-Agent": "TrucsAFaire/1.0 (+https://trucsafaire.fr)", "Accept": "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!r.ok || !/html/i.test(r.headers.get("Content-Type") || "")) return null;
    html = (await r.text()).slice(0, 1500000);
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
