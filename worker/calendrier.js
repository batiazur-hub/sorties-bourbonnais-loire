/* Trucs à faire : agenda automatique (abonnement iCalendar).
   GET /calendrier.ics?t=brocante,fete&lat=46.57&lon=3.33&r=20&nom=Moulins   → sorties dans un cercle (r en km, 5 à 100)
   GET /calendrier.ics?t=brocante&dep=03,58                                 → sorties de départements entiers
   Paramètres facultatifs : q (mot dans le titre, ex. « marché »), nom (libellé de la zone, pour le nom de l'agenda).
   GET /calendrier/apercu?…mêmes paramètres…  → JSON { nom, total, premieres[] } pour l'assistant du site.
   Le téléphone (iPhone, Google Agenda, Outlook) relit l'adresse toute seule : les nouvelles sorties apparaissent,
   les sorties annulées disparaissent. Sans compte, sans clé, sans donnée personnelle conservée. */

export const TYPES_AGENDA = ["brocante", "fete", "spectacle", "culture", "famille", "sport", "pal"];
const NOMS = { brocante: "Brocantes et vide-greniers", fete: "Fêtes, foires et marchés", spectacle: "Concerts et spectacles",
  culture: "Expos et visites", famille: "Sorties en famille", sport: "Sport et rando", pal: "Le Pal" };
const COURTS = { brocante: "Brocantes", fete: "Fêtes et marchés", spectacle: "Concerts", culture: "Expos", famille: "En famille", sport: "Sport", pal: "Le Pal" };
const JOURS = 90, MAX = 600, LONGUE = 7;   // horizon, nombre maximum de sorties, au-delà de 7 jours une sortie n'encombre pas l'agenda
const SITE = "https://trucsafaire.fr/";

const sansAccent = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const propre = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/* Lecture et contrôle des paramètres : renvoie { erreur } ou la demande normalisée */
export function demande(q) {
  const t = String(q.get("t") || q.get("type") || "").split(",").map(s => s.trim()).filter(s => TYPES_AGENDA.includes(s));
  const types = t.length ? [...new Set(t)] : TYPES_AGENDA.slice();
  const lat = parseFloat(q.get("lat")), lon = parseFloat(q.get("lon"));
  const deps = String(q.get("dep") || "").toUpperCase().split(",").map(s => s.trim()).filter(s => /^(\d{2,3}|2A|2B)$/.test(s)).slice(0, 8);
  const aPos = isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!aPos && !deps.length) return { erreur: "zone_requise" };
  const r = Math.max(5, Math.min(100, parseFloat(q.get("r") || q.get("rayon")) || 20));
  return { types, deps, pos: aPos ? { lat, lon, r } : null, mot: sansAccent(propre(q.get("q"), 40)), nom: propre(q.get("nom"), 50) };
}

export function nomAgenda(d) {
  const quoi = d.types.length === TYPES_AGENDA.length ? "Toutes les sorties" : d.types.length <= 2 ? d.types.map(t => COURTS[t]).join(" et ") : d.types.length + " types de sorties";
  const ou = d.pos ? (d.nom ? d.pos.r + " km autour de " + d.nom : "dans un rayon de " + d.pos.r + " km") : (d.nom || "départements " + d.deps.join(", "));
  return quoi + (d.mot ? " « " + d.mot + " »" : "") + " · " + ou;
}

/* Sorties correspondant à la demande, du jour à J+90, triées par date */
export async function selection(d, outils) {
  const { donnees, depsDeZone, km } = outils;
  const deps = d.deps.length ? d.deps : await depsDeZone({ lat: d.pos.lat, lon: d.pos.lon, rayon: d.pos.r });
  const auj = new Date().toISOString().slice(0, 10), fin = new Date(Date.now() + JOURS * 864e5).toISOString().slice(0, 10);
  const listes = await Promise.all(deps.map(c => donnees("dep/" + c + ".json")));
  const vus = new Set();
  const E = [];
  for (const L of listes) for (const e of (L || [])) {
    if (!d.types.includes(e.cat) || vus.has(e.id)) continue;
    const f = e.e || e.s;
    if (f < auj || e.s > fin) continue;
    if ((Date.parse(f) - Date.parse(e.s)) / 864e5 > LONGUE) continue;
    if (d.pos && !(km(d.pos.lat, d.pos.lon, e.lat, e.lon) <= d.pos.r)) continue;
    if (d.mot && !sansAccent(e.t + " " + (e.lieu || "")).includes(d.mot)) continue;
    vus.add(e.id); E.push(e);
  }
  E.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : (a.h || "99") < (b.h || "99") ? -1 : 1));
  return E.slice(0, MAX);
}

/* ---------- Écriture iCalendar (RFC 5545) ---------- */
const echap = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function plier(ligne) {   // lignes de 75 octets au plus, sans couper un caractère
  const b = new TextEncoder();
  if (b.encode(ligne).length <= 75) return ligne;
  const out = []; let cur = "", n = 0, max = 75;
  for (const ch of ligne) {
    const l = b.encode(ch).length;
    if (n + l > max) { out.push(cur); cur = " "; n = 1; max = 75; }
    cur += ch; n += l;
  }
  out.push(cur);
  return out.join("\r\n");
}
const jour = s => s.replace(/-/g, "");
const lendemain = s => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const lienSortie = e => SITE + "#dep=" + encodeURIComponent(e.z) + "&sortie=" + encodeURIComponent(e.id);
const FUSEAU = ["BEGIN:VTIMEZONE", "TZID:Europe/Paris", "X-LIC-LOCATION:Europe/Paris",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE"];

export function ics(d, E) {
  const nom = nomAgenda(d), stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Trucs à faire//Agenda automatique//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + echap(nom + " (Trucs à faire)"),
    "X-WR-CALDESC:" + echap("Mis à jour automatiquement chaque jour par Trucs à faire (" + SITE + "). Pour changer ou arrêter : supprimez cet abonnement dans votre agenda."),
    "X-WR-TIMEZONE:Europe/Paris", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H", "COLOR:royalblue", ...FUSEAU];
  for (const e of E) {
    const desc = [propre(e.d, 700), e.lieu ? "Lieu : " + e.lieu + ", " + e.w : "", e.g ? "Gratuit" : "", e.b ? "Billetterie : " + e.b : "",
      "Toutes les infos : " + lienSortie(e), e.u ? "Source : " + e.u : "",
      "Les dates peuvent changer : vérifiez avant de vous déplacer."].filter(Boolean).join("\n\n");
    L.push("BEGIN:VEVENT", "UID:" + echap(e.id) + "@trucsafaire.fr", "DTSTAMP:" + stamp);
    if (e.h && /^\d{1,2}:\d{2}$/.test(e.h)) {
      const [hh, mm] = e.h.split(":").map(Number), fh = String(Math.min(23, hh + 2)).padStart(2, "0"), h0 = String(hh).padStart(2, "0"), m0 = String(mm).padStart(2, "0");
      L.push("DTSTART;TZID=Europe/Paris:" + jour(e.s) + "T" + h0 + m0 + "00", "DTEND;TZID=Europe/Paris:" + jour(e.s) + "T" + fh + m0 + "00");
    } else {
      L.push("DTSTART;VALUE=DATE:" + jour(e.s), "DTEND;VALUE=DATE:" + jour(lendemain(e.e || e.s)), "TRANSP:TRANSPARENT");
    }
    L.push("SUMMARY:" + echap(propre(e.t, 140) + " · " + e.w), "LOCATION:" + echap([e.lieu, e.w].filter(Boolean).join(", ")),
      "DESCRIPTION:" + echap(desc), "URL:" + lienSortie(e), "CATEGORIES:" + echap(NOMS[e.cat] || e.cat), "STATUS:CONFIRMED");
    if (isFinite(e.lat) && isFinite(e.lon)) L.push("GEO:" + (+e.lat).toFixed(5) + ";" + (+e.lon).toFixed(5));
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(plier).join("\r\n") + "\r\n";
}

/* Point d'entrée appelé par worker.js */
export async function calendrier(req, url, p, outils) {
  const ouvert = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ouvert });
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Méthode non prise en charge", { status: 405, headers: ouvert });
  const d = demande(url.searchParams);
  if (d.erreur) return new Response(JSON.stringify({ erreur: d.erreur, message: "Indiquez une zone : lat, lon et r (km), ou dep=03,58." }),
    { status: 400, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, ouvert) });
  const E = await selection(d, outils);
  if (p === "/calendrier/apercu") {
    const parType = {}; E.forEach(e => { parType[e.cat] = (parType[e.cat] || 0) + 1; });
    return new Response(JSON.stringify({ nom: nomAgenda(d), total: E.length, par_type: parType,
      premieres: E.slice(0, 5).map(e => ({ titre: e.t, debut: e.s, heure: e.h || "", commune: e.w, type: e.cat })) }),
      { headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=900" }, ouvert) });
  }
  return new Response(ics(d, E), { headers: Object.assign({ "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="trucs-a-faire.ics"', "Cache-Control": "public, max-age=3600" }, ouvert) });
}
