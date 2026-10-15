"""Pages fixes pour le référencement : une page par commune ayant au moins 3 sorties à venir, une par département,
et un sommaire (que-faire/index.html). Mêmes adresses tous les jours, contenu régénéré chaque nuit.

Ces pages ne sont PAS enregistrées dans le dépôt : le flux « Publication du site » (publier.yml) les fabrique
et publie le site complet directement sur GitHub Pages.

Sortie : dossier PAGES_SORTIE (par défaut _site/), sous-dossier que-faire/ + sitemap-villes.xml.
"""
import datetime as dt, glob, html, json, os, re, unicodedata
from urllib.parse import quote
from collections import defaultdict

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.environ.get("PAGES_SORTIE", os.path.join(RACINE, "_site"))
SITE = os.environ.get("SITE_URL", "https://batiazur-hub.github.io/sorties-bourbonnais-loire/")
MIN_SORTIES = 3          # seuil d'une page commune
MAX_LISTE, MAX_LD = 40, 20
AUJ = dt.date.fromisoformat(os.environ.get("AUJOURDHUI", dt.date.today().isoformat()))

CATS = {"brocante": ("Brocantes et vide-greniers", "Brocante", "#A85A12"), "fete": ("Fêtes, foires et marchés", "Fête", "#C2255C"),
        "spectacle": ("Concerts et spectacles", "Spectacle", "#6741D9"), "culture": ("Expos et visites", "Expo, visite", "#0B7A5E"),
        "famille": ("Sorties en famille", "En famille", "#8A6100"), "sport": ("Sport et randonnées", "Sport", "#1971C2"), "pal": ("Le Pal", "Le Pal", "#4D7C0F")}
Q_CAT = {"brocante": "brocantes", "fete": "fêtes", "spectacle": "concerts", "culture": "expos", "famille": "en famille", "sport": "sport", "pal": "le pal"}
TYPES = {"brocante": ("brocantes", "Brocantes et vide-greniers"), "fete": ("fetes-et-marches", "Fêtes, foires et marchés"),
         "spectacle": ("concerts-et-spectacles", "Concerts et spectacles"), "culture": ("expos-et-visites", "Expos et visites"),
         "famille": ("en-famille", "Sorties en famille"), "sport": ("sport-et-randonnees", "Sport et randonnées")}
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
PLUR = {"Ardennes", "Bouches-du-Rhône", "Côtes-d'Armor", "Deux-Sèvres", "Hautes-Alpes", "Alpes-de-Haute-Provence", "Alpes-Maritimes", "Hautes-Pyrénées",
        "Pyrénées-Atlantiques", "Pyrénées-Orientales", "Landes", "Vosges", "Yvelines", "Hauts-de-Seine"}
MASC_E = {"Rhône", "Finistère", "Puy-de-Dôme", "Maine-et-Loire", "Val-de-Marne", "Val-d'Oise", "Lot-et-Garonne", "Tarn-et-Garonne"}
FEM_X = {"Seine-Saint-Denis", "Eure-et-Loir", "Côte-d'Or", "Corse-du-Sud"}
DOM = {"Guadeloupe": "en Guadeloupe", "Martinique": "en Martinique", "Guyane": "en Guyane", "La Réunion": "à La Réunion", "Mayotte": "à Mayotte", "Paris": "à Paris"}
e_ = html.escape


def slug(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def dans(n):
    if n in DOM: return DOM[n]
    if n in PLUR: return "dans les " + n
    if re.match(r"^[AEIOUYÉÈH]", n, re.I): return "dans l’" + n
    if (n.endswith("e") and n not in MASC_E) or n in FEM_X: return "dans la " + n
    return "dans le " + n


def date_fr(d):
    return f"{JOURS[d.weekday()]} {d.day}{'er' if d.day == 1 else ''} {MOIS[d.month - 1]}"


def quand(e):
    s, f = dt.date.fromisoformat(e["s"]), dt.date.fromisoformat(e.get("e") or e["s"])
    h = (" à " + e["h"].replace(":", " h ").replace(" h 00", " h")) if e.get("h") else ""
    if f > s:
        if s < AUJ: return f"jusqu’au {date_fr(f)}"
        return f"du {date_fr(s)} au {date_fr(f)}{h}"
    return date_fr(s).capitalize() + h


def km(a, b, c, d):
    import math
    return math.hypot((d - b) * math.cos(math.radians((a + c) / 2)) * 111.32, (c - a) * 110.57)


def page(titre, desc, canon, prof, corps, ld):
    r = "../" * prof
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{e_(titre)}</title>
<meta name="description" content="{e_(desc)}">
<link rel="canonical" href="{SITE}{canon}">
<meta property="og:title" content="{e_(titre)}"><meta property="og:description" content="{e_(desc)}"><meta property="og:type" content="website">
<meta property="og:url" content="{SITE}{canon}"><meta property="og:image" content="{SITE}marque/partage-1200x630.png"><meta property="og:locale" content="fr_FR">
<link rel="icon" href="{r}marque/icone-favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{r}marque/apple-touch-icon-180.png">
<link rel="stylesheet" href="{r}fonts/trucs.css">
<link rel="stylesheet" href="{r}pages.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False, separators=(",", ":"))}</script>
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="top"><a class="brand" href="{r}index.html" aria-label="Trucs à faire, accueil"><svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true"><path d="M32 0C52.5 0 64 4.6 64 32S52.5 64 32 64 0 59.4 0 32 11.5 0 32 0Z" fill="#2546D8"/><path d="M29.5 13.5V38c0 7.5 4.2 12 11.6 12h2.4" fill="none" stroke="#fff" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.5 27.6 24.6 34C31.5 26.9 38 22.2 46.4 18.6" fill="none" stroke="#fff" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48.6" cy="46.4" r="4.3" fill="#FF8A3D"/></svg><span class="mk">trucs à faire</span></a>
<a class="back" href="{r}index.html">Tous les trucs</a></header>
<main id="contenu" class="qf">
{corps}
</main>
<footer class="foot"><nav aria-label="Liens">
<a href="{r}que-faire/index.html">Trucs par département</a><a href="{r}plan-du-site.html">Plan du site</a><a href="{r}mentions-legales.html">Mentions légales</a><a href="{r}cgu.html">Conditions d’utilisation</a><a href="{r}confidentialite.html">Confidentialité</a><a href="{r}offres.html">Choisissez votre truc</a>
</nav></footer>
</body>
</html>
"""


def ligne(e, r):
    c = CATS.get(e["cat"], CATS["fete"])
    lien = f'{r}index.html#dep={e["z"]}&amp;sortie={e_(e["id"])}'
    lieu = e.get("lieu") or e["w"]
    gr = ' · <b class="g">Gratuit</b>' if e.get("g") else ""
    return (f'<li style="--c:{c[2]}"><a href="{lien}"><span class="q">{e_(quand(e))}</span>'
            f'<span class="t">{e_(e["t"])}</span><span class="m">{e_(c[1])} · {e_(lieu)}{gr}</span></a></li>')


FUSEAUX = {"971": "America/Guadeloupe", "972": "America/Martinique", "973": "America/Cayenne", "974": "Indian/Reunion", "976": "Indian/Mayotte"}


def debut_ld(e):
    """Date de début avec fuseau horaire (heure d'été ou d'hiver), comme le demande Google pour les événements."""
    if not e.get("h"): return e["s"]
    try:
        from zoneinfo import ZoneInfo
        d = dt.datetime.fromisoformat(e["s"] + "T" + e["h"]).replace(tzinfo=ZoneInfo(FUSEAUX.get(e["z"], "Europe/Paris")))
        return d.isoformat(timespec="minutes")
    except Exception:
        return e["s"] + "T" + e["h"]


def event_ld(e):
    x = {"@type": "Event", "name": e["t"], "startDate": debut_ld(e),
         "endDate": e.get("e") or e["s"], "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
         "eventStatus": "https://schema.org/EventScheduled",
         "location": {"@type": "Place", "name": e.get("lieu") or e["w"],
                      "address": {"@type": "PostalAddress", "addressLocality": e["w"], "addressCountry": "FR"},
                      "geo": {"@type": "GeoCoordinates", "latitude": e["lat"], "longitude": e["lon"]}},
         "url": f'{SITE}index.html?sortie={quote(e["id"])}#dep={e["z"]}&sortie={quote(e["id"])}'}  # adresse distincte par sortie (Google ignore le fragment)
    if e.get("d"): x["description"] = e["d"][:300]
    if e.get("img"): x["image"] = e["img"]
    if e.get("g"): x["isAccessibleForFree"] = True
    if e.get("b"): x["offers"] = {"@type": "Offer", "url": e["b"]}
    return x


def trier(evs):
    return sorted(evs, key=lambda e: (e.get("e", e["s"]) > e["s"] and (dt.date.fromisoformat(e.get("e")) - dt.date.fromisoformat(e["s"])).days > 14,
                                      max(e["s"], AUJ.isoformat()), e.get("h") or "99"))


def main():
    deps = {d["code"]: d for d in json.load(open(os.path.join(RACINE, "data/departements.json"), encoding="utf-8"))["departements"]}
    par_commune, par_dep = defaultdict(list), defaultdict(list)
    tous = [e for f in sorted(glob.glob(os.path.join(RACINE, "data/dep/*.json"))) for e in json.load(open(f, encoding="utf-8"))
            if (e.get("e") or e["s"]) >= AUJ.isoformat()]
    # Une commune, une page : « STRASBOURG » et « Strasbourg », « Chemillé-en-Anjou » et « Chemille-en-Anjou » sont regroupées
    # sous l'écriture la plus fréquente (à égalité : celle qui n'est pas en capitales et qui porte des accents).
    ecritures = defaultdict(lambda: defaultdict(int))
    for e in tous: ecritures[(slug(e["w"]), e["z"])][e["w"]] += 1
    nom_de = {k: max(v.items(), key=lambda x: (x[1], not x[0].isupper(), sum(ord(c) > 127 for c in x[0]), x[0]))[0] for k, v in ecritures.items()}
    for e in tous:
        e["w"] = nom_de[(slug(e["w"]), e["z"])]
        par_commune[(e["w"], e["z"])].append(e); par_dep[e["z"]].append(e)
    communes = {k: v for k, v in par_commune.items() if len(v) >= MIN_SORTIES and k[1] in deps and re.search(r"[A-Za-zÀ-ÿ]{2}", k[0])}
    url_c = {k: f"que-faire/{slug(k[0])}-{k[1].lower()}/" for k in communes}
    url_d = {c: f"que-faire/{slug(d['nom'])}/" for c, d in deps.items()}
    centre = {k: (sum(e["lat"] for e in v) / len(v), sum(e["lon"] for e in v) / len(v)) for k, v in communes.items()}
    urls = []

    def ecrire(chemin, contenu):
        p = os.path.join(SORTIE, chemin, "index.html")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w", encoding="utf-8").write(contenu)
        urls.append(chemin)

    maj = date_fr(AUJ)
    # Pages communes
    for (w, z), evs in communes.items():
        d = deps[z]; r = "../../"; evs = trier(evs); n = len(evs)
        cats = defaultdict(int)
        for e in evs: cats[e["cat"]] += 1
        resume = ", ".join(f"{v} {CATS[k][1].lower() if v < 2 else CATS[k][0].split(',')[0].split(' et ')[0].lower()}" for k, v in sorted(cats.items(), key=lambda x: -x[1])[:3])
        voisins = sorted((k for k in communes if k != (w, z) and abs(centre[k][0] - centre[(w, z)][0]) < .4),
                         key=lambda k: km(*centre[k], *centre[(w, z)]))[:8]
        titre = f"Que faire à {w} ? {n} sorties à venir · Trucs à faire"
        desc = f"Brocantes, fêtes, concerts, expos et sorties en famille à {w} ({d['nom']}) : {n} sorties à venir, mises à jour chaque nuit. Gratuit, sans inscription."
        corps = (f'<nav class="fil" aria-label="Fil d’Ariane"><a href="{r}que-faire/index.html">Que faire ?</a> › <a href="{r}{url_d[z]}">{e_(d["nom"])}</a> › {e_(w)}</nav>'
                 f'<h1>Que faire à {e_(w)}&nbsp;?</h1><p class="lead"><b>{n}</b> sortie{"s" if n > 1 else ""} à venir à {e_(w)} ({e_(d["nom"])}) : {e_(resume)}. Mis à jour le {maj}.</p>'
                 f'<p class="qcta"><a class="qbtn" href="{r}index.html#dep={z}&amp;q={quote("autour de " + w)}">Voir sur la carte et le calendrier</a></p>'
                 f'<ul class="evl">{"".join(ligne(e, r) for e in evs[:MAX_LISTE])}</ul>'
                 + (f'<p class="plus">… et {n - MAX_LISTE} autres trucs dans <a href="{r}index.html#dep={z}">l’agenda complet</a>.</p>' if n > MAX_LISTE else "")
                 + (f'<h2>Autour de {e_(w)}</h2><ul class="vois">{"".join(f"<li><a href=\"{r}{url_c[k]}\">{e_(k[0])}</a></li>" for k in voisins)}</ul>' if voisins else "")
                 + '<p class="src">Sorties issues des agendas publics (offices de tourisme, collectivités, associations) et des organisateurs. Vérifiez auprès de l’organisateur avant de vous déplacer.</p>')
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Que faire ?", "item": SITE + "que-faire/"},
                                                             {"@type": "ListItem", "position": 2, "name": d["nom"], "item": SITE + url_d[z]},
                                                             {"@type": "ListItem", "position": 3, "name": w, "item": SITE + url_c[(w, z)]}]},
            {"@type": "ItemList", "name": f"Sorties à {w}", "itemListElement": [{"@type": "ListItem", "position": i + 1, "item": event_ld(e)} for i, e in enumerate(evs[:MAX_LD])]}]}
        ecrire(url_c[(w, z)], page(titre, desc, url_c[(w, z)], 2, corps, ld))
    # Pages type × département (au moins MIN_SORTIES sorties)
    url_t = {}
    for z, d in deps.items():
        for cat, (sl, lib) in TYPES.items():
            evs = trier([e for e in par_dep.get(z, []) if e["cat"] == cat]); n = len(evs)
            if n < MIN_SORTIES: continue
            url_t[(z, cat)] = f"{url_d[z]}{sl}/"; nom = d["nom"]
            parw = defaultdict(int)
            for e in evs: parw[(e["w"], e["z"])] += 1
            top = [k for k, _ in sorted(parw.items(), key=lambda x: -x[1]) if k in url_c][:12]
            titre = f"{lib} {dans(nom)} : {n} à venir · Trucs à faire"
            desc = f"{lib} {dans(nom)} ({z}) : {n} rendez-vous à venir, dates, lieux et horaires, mis à jour chaque nuit. Gratuit, sans inscription."
            corps = (f'<nav class="fil" aria-label="Fil d’Ariane"><a href="../../index.html">Que faire ?</a> › <a href="../index.html">{e_(nom)}</a> › {e_(lib)}</nav>'
                     f'<h1>{e_(lib)} {e_(dans(nom))}</h1><p class="lead"><b>{n}</b> à venir {e_(dans(nom))}. Mis à jour le {maj}.</p>'
                     f'<p class="qcta"><a class="qbtn" href="../../../index.html#dep={z}&amp;q={quote(Q_CAT[cat])}">Voir sur la carte et le calendrier</a></p>'
                     f'<ul class="evl">{"".join(ligne(e, "../../../") for e in evs[:MAX_LISTE])}</ul>'
                     + (f'<p class="plus">… et {n - MAX_LISTE} autres dans <a href="../../../index.html#dep={z}&amp;q={quote(Q_CAT[cat])}">l’agenda complet</a>.</p>' if n > MAX_LISTE else "")
                     + (f'<h2>Par commune</h2><ul class="vois">{"".join(f"<li><a href=\"../../../{url_c[k]}\">{e_(k[0])} <span>{parw[k]}</span></a></li>" for k in top)}</ul>' if top else ""))
            ld = {"@context": "https://schema.org", "@graph": [
                {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Que faire ?", "item": SITE + "que-faire/"},
                                                                 {"@type": "ListItem", "position": 2, "name": nom, "item": SITE + url_d[z]},
                                                                 {"@type": "ListItem", "position": 3, "name": lib, "item": SITE + url_t[(z, cat)]}]},
                {"@type": "ItemList", "name": f"{lib} {dans(nom)}", "itemListElement": [{"@type": "ListItem", "position": i + 1, "item": event_ld(e)} for i, e in enumerate(evs[:MAX_LD])]}]}
            ecrire(url_t[(z, cat)], page(titre, desc, url_t[(z, cat)], 3, corps, ld))
    # Pages départements
    for z, d in deps.items():
        evs = trier(par_dep.get(z, [])); n = len(evs); nom = d["nom"]
        semaine = [e for e in evs if e["s"] <= (AUJ + dt.timedelta(days=7)).isoformat() and not ((e.get("e") or e["s"]) > e["s"] and (dt.date.fromisoformat(e.get("e")) - dt.date.fromisoformat(e["s"])).days > 14)][:30]
        cs = sorted((k for k in communes if k[1] == z), key=lambda k: -len(communes[k]))
        cats = defaultdict(int)
        for e in evs: cats[e["cat"]] += 1
        titre = f"Que faire {dans(nom)} ? {n} sorties à venir · Trucs à faire"
        desc = f"Toutes les sorties {dans(nom)} ({z}) : brocantes, fêtes, concerts, expos, sorties en famille. {n} sorties à venir dans {len(cs)} communes, mises à jour chaque nuit."
        corps = (f'<nav class="fil" aria-label="Fil d’Ariane"><a href="../index.html">Que faire ?</a> › {e_(nom)}</nav>'
                 f'<h1>Que faire {e_(dans(nom))}&nbsp;?</h1><p class="lead"><b>{n}</b> sorties à venir {e_(dans(nom))}. Mis à jour le {maj}.</p>'
                 f'<p class="qcta"><a class="qbtn" href="../../index.html#dep={z}">Ouvrir l’agenda {e_(dans(nom))}</a></p>'
                 f'<ul class="cats">{"".join(f"<li style=\"--c:{CATS[k][2]}\"><a href=\"{(url_t[(z, k)][len(url_d[z]):] if (z, k) in url_t else "../../index.html#dep=" + z + "&amp;q=" + quote(Q_CAT[k]))}\"><b>{v}</b> {e_(CATS[k][0])}</a></li>" for k, v in sorted(cats.items(), key=lambda x: -x[1]) if k in CATS)}</ul>'
                 + (f'<h2>Cette semaine</h2><ul class="evl">{"".join(ligne(e, "../../") for e in semaine)}</ul>' if semaine else "")
                 + (f'<h2>Par commune</h2><ul class="vois">{"".join(f"<li><a href=\"../../{url_c[k]}\">{e_(k[0])} <span>{len(communes[k])}</span></a></li>" for k in sorted(cs, key=lambda k: slug(k[0])))}</ul>' if cs else ""))
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Que faire ?", "item": SITE + "que-faire/"},
                                                             {"@type": "ListItem", "position": 2, "name": nom, "item": SITE + url_d[z]}]},
            {"@type": "ItemList", "name": f"Sorties {dans(nom)} cette semaine", "itemListElement": [{"@type": "ListItem", "position": i + 1, "item": event_ld(e)} for i, e in enumerate(semaine[:MAX_LD])]}]}
        ecrire(url_d[z], page(titre, desc, url_d[z], 2, corps, ld))
    # Sommaire
    lignes = "".join(f'<li><a href="../{url_d[c]}">{e_(d["nom"])} <span>{len(par_dep.get(c, []))}</span></a></li>' for c, d in sorted(deps.items(), key=lambda x: slug(x[1]["nom"])))
    corps = (f'<h1>Que faire près de chez vous&nbsp;?</h1><p class="lead">Les sorties à venir dans chaque département : brocantes, fêtes, concerts, expos, sorties en famille. Mis à jour le {maj}.</p>'
             f'<ul class="vois deps">{lignes}</ul>')
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": "Que faire près de chez vous ?", "url": SITE + "que-faire/"}
    ecrire("que-faire/", page("Que faire près de chez vous ? Sorties par département · Trucs à faire",
                              "Toutes les sorties de France par département et par commune : brocantes, fêtes, concerts, expos, sorties en famille.", "que-faire/", 1, corps, ld))
    jour = AUJ.isoformat()
    doubles = sorted({u for u in urls if urls.count(u) > 1}) if len(set(urls)) != len(urls) else []
    if doubles: raise SystemExit(f"Adresses en double dans le plan du site : {doubles[:10]}")
    open(os.path.join(SORTIE, "sitemap-villes.xml"), "w", encoding="utf-8").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "".join(f"  <url><loc>{SITE}{u}</loc><lastmod>{jour}</lastmod><changefreq>daily</changefreq></url>\n" for u in urls) + "</urlset>\n")
    print(f"Pages villes : {len(communes)} communes, {len(deps)} départements, {len(url_t)} pages par type, sommaire ; sitemap-villes.xml ({len(urls)} adresses).")


if __name__ == "__main__":
    main()
