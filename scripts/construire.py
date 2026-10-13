"""Construit les fichiers d'événements par département à partir de l'export national DATAtourisme
(fêtes et manifestations), publié chaque nuit sur data.gouv.fr.

Sorties :
  data/dep/<code>.json      événements à venir (≈ 4 mois) du département
  data/departements.json    liste des départements, nombre d'événements, centre
  data/communes-fr.json     communes de France (nom, département, lat, lon) pour la recherche
  data/_stats.json          contrôle : répartition par type, classes rencontrées
"""
import csv, io, json, os, re, sys, unicodedata, urllib.parse, urllib.request, datetime as dt
from collections import Counter, defaultdict

AUJ = dt.date.today()
HORIZON = AUJ + dt.timedelta(days=130)
API = "https://www.data.gouv.fr/api/1/datasets/5b598be088ee387c0c353714/"

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dans-le-coin (GitHub Actions)", "Accept-Encoding": "identity"})
    data = urllib.request.urlopen(req, timeout=600).read()
    if data[:2] == b"\x1f\x8b":
        import gzip
        data = gzip.decompress(data)
    return data

def norm(s):
    return unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()

# --- Types de sortie : mots du titre d'abord, classes DATAtourisme ensuite ---
MOTS = [
    ("brocante", r"brocante|vide[- ]?grenier|vide[- ]?maison|vide[- ]?dressing|puces|bourse (aux|multi|de|des)|braderie|troc|antiquit|bric[- ]?a[- ]?brac"),
    ("sport", r"\bcourse\b|trail|randonn|\brando\b|marche (nordique|populaire|gourmande|du|de la|des)|cyclo|\bvtt\b|velo|tournoi|championnat|match|regate|triathlon|marathon|foulee|golf|peche|petanque|balade|promenade|sortie nature|canoe|escalade"),
    ("spectacle", r"concert|spectacle|theatre|cirque|humour|danse|opera|chorale|recital|one man|cabaret|comedie|orchestre|jazz|festival de musique|musique"),
    ("famille", r"enfant|famille|jeune public|halloween|chasse aux (oeufs|bonbons|tresors)|kids|pere noel|conte"),
    ("culture", r"expo|musee|visite|conference|patrimoine|vernissage|atelier|lecture|cinema|projection|salon du livre|rencontre|cours |initiation|stage|escape|decouverte|degustation"),
    ("fete", r"march|foire|fete|festiv|carnaval|loto|\bbal\b|repas|soiree|salon|noel|feu d.artifice|kermesse|comice"),
]
MOTS = [(c, re.compile(r)) for c, r in MOTS]
CLASSES = [
    ("brocante", ("SaleEvent", "BricABrac", "GarageSale", "FleaMarket")),
    ("culture", ("Practice", "Traineeship", "Game", "OpenDay")),
    ("sport", ("SportsEvent", "SportsCompetition", "SportsDisplay", "Rambling")),
    ("spectacle", ("ShowEvent", "Concert", "TheaterEvent", "DanceEvent", "Opera", "CircusEvent")),
    ("famille", ("ChildrensEvent",)),
    ("culture", ("Exhibition", "Visit", "Conference", "CulturalEvent", "ScreeningEvent", "Reading")),
    ("fete", ("Market", "LocalAnimation", "TraditionalCelebration", "Carnival", "FairOrShow", "SocialEvent", "BusinessEvent", "Festival")),
]
def categorie(titre, classes):
    t = norm(titre)
    for c, rx in MOTS:
        if rx.search(t):
            return c
    for c, noms in CLASSES:
        if any(n in classes for n in noms):
            return c
    return "fete"

def dep_de(cp):
    cp = cp.strip()
    if not re.match(r"^\d{5}$", cp):
        return None
    if cp.startswith("20"):
        return "2A" if int(cp) < 20200 else "2B"
    if cp.startswith("97"):
        return cp[:3]
    return cp[:2]

def periode_suivante(txt):
    """Renvoie (début, fin, nb d'autres dates) de la prochaine période encore à venir."""
    ps = []
    for p in txt.split("|"):
        m = re.findall(r"\d{4}-\d{2}-\d{2}", p)
        if not m:
            continue
        a = dt.date.fromisoformat(m[0]); b = dt.date.fromisoformat(m[-1])
        if b < a:
            a, b = b, a
        ps.append((a, b))
    ps = sorted(p for p in ps if p[1] >= AUJ)
    if not ps:
        return None
    return ps[0][0], ps[0][1], len(ps) - 1

def premier_lien(contacts):
    for x in re.split(r"[#|]", contacts or ""):
        x = x.strip()
        if x.startswith("http"):
            return x
    return ""

def resume(d, n=300):
    d = re.sub(r"\s+", " ", d or "").strip()
    if len(d) <= n:
        return d
    cut = d[:n].rsplit(" ", 1)[0]
    return cut.rstrip(",;:") + "…"


# --- Paris : « Que faire à Paris ? » (open data de la Ville de Paris, mis à jour chaque jour) ---
QFAP = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/exports/json?where=" + urllib.parse.quote("date_end >= now()")
TAGS = [("famille", ("Enfants",)), ("sport", ("Sport", "Balade", "Nature")),
        ("spectacle", ("Concert", "Spectacle musical", "Théâtre", "Danse", "Humour", "Cirque", "Opéra", "Festival", "Spectacle")),
        ("culture", ("Expo", "Art contemporain", "Conférence", "Littérature", "Histoire", "Ecrans", "Atelier", "Visite", "Musée", "Photo", "Sciences", "Peinture"))]
def paris():
    try:
        rows = json.loads(get(QFAP))
    except Exception as e:
        print("Que faire à Paris indisponible :", e); return []
    out = []
    for r in rows:
        titre = re.sub(r"\s+", " ", r.get("title") or "").strip()
        ll = r.get("lat_lon") or {}
        if not titre or not ll:
            continue
        occ = []
        for o in (r.get("occurrences") or "").split(";"):
            m = re.match(r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})[^_]*_(\d{4}-\d{2}-\d{2})", o.strip())
            if m:
                occ.append((dt.date.fromisoformat(m.group(1)), m.group(2), dt.date.fromisoformat(m.group(3))))
        occ = sorted(x for x in occ if x[2] >= AUJ)
        if occ:
            a, heure, b = occ[0]; autres = len(occ) - 1
        else:
            try:
                a = dt.date.fromisoformat((r.get("date_start") or "")[:10]); b = dt.date.fromisoformat((r.get("date_end") or "")[:10])
            except ValueError:
                continue
            heure = None; autres = 0
            if b < AUJ:
                continue
        if a > HORIZON:
            continue
        tags = set((r.get("qfap_tags") or "").split(";"))
        cat = None
        if MOTS[0][1].search(norm(titre)):
            cat = "brocante"
        for c, noms in TAGS:
            if not cat and tags & set(noms):
                cat = c
        cat = cat or categorie(titre, set())
        cp = (r.get("address_zipcode") or "").strip()
        dep = dep_de(cp) or "75"
        ville = (r.get("address_city") or "Paris").strip() or "Paris"
        if ville.lower().startswith("paris"):
            ville = "Paris"
        arr = f" ({int(cp[3:])}e)" if dep == "75" and cp[3:].isdigit() and int(cp[3:]) > 0 else ""
        ev = {"id": "qp-" + str(r.get("id")), "t": titre, "cat": cat, "z": dep, "w": ville,
              "lieu": ((r.get("address_name") or "").strip() or ville) + arr,
              "s": a.isoformat(), "d": resume(r.get("lead_text") or re.sub("<[^>]+>", " ", r.get("description") or "")),
              "u": r.get("url") or "", "src": "Que faire à Paris (Ville de Paris)",
              "lat": round(float(ll["lat"]), 5), "lon": round(float(ll["lon"]), 5), "o": "qfap"}
        if b != a: ev["e"] = b.isoformat()
        if heure and heure != "00:00": ev["h"] = heure
        if autres: ev["n"] = autres
        if r.get("cover_url"): ev["img"] = r["cover_url"]
        if (r.get("price_type") or "").startswith("gratuit"): ev["g"] = 1
        out.append(ev)
    print("Que faire à Paris :", len(out), "sorties")
    return out


# --- OpenAgenda : événements publics de France (mairies, médiathèques, associations) ---
OA = ("https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/exports/json?"
      + urllib.parse.urlencode({"select": "uid,title_fr,description_fr,conditions_fr,keywords_fr,image,thumbnail,timings,firstdate_begin,lastdate_end,"
                                          "location_coordinates,location_name,location_postalcode,location_city,canonicalurl,originagenda_title,status",
                                "where": "lastdate_end >= now() and location_countrycode = 'FR'"}))
def openagenda():
    try:
        rows = json.loads(get(OA))
    except Exception as e:
        print("OpenAgenda indisponible :", e); return []
    out = []
    for r in rows:
        st = r.get("status") or ""
        if "Annul" in st or "Report" in st:
            continue
        titre = re.sub(r"\s+", " ", r.get("title_fr") or "").strip()
        ll = r.get("location_coordinates") or {}
        cp = (r.get("location_postalcode") or "").strip()
        ville = (r.get("location_city") or "").strip()
        dep = dep_de(cp)
        if not titre or not ll or not dep or not ville:
            continue
        occ = []
        try:
            for o in json.loads(r.get("timings") or "[]"):
                b, e = o.get("begin", ""), o.get("end", "")
                occ.append((dt.date.fromisoformat(b[:10]), b[11:16], dt.date.fromisoformat((e or b)[:10])))
        except (ValueError, TypeError):
            occ = []
        occ = sorted(x for x in occ if x[2] >= AUJ)
        if not occ:
            continue
        a, heure, b = occ[0]
        if a > HORIZON:
            continue
        # plusieurs séances consécutives = un seul événement sur la période
        fin = b
        if len(occ) > 1 and (occ[-1][0] - a).days <= 31 and len(occ) <= 31:
            fin = occ[-1][2]; autres = 0
        else:
            autres = len(occ) - 1
        arr = re.match(r"^(Paris|Lyon|Marseille)\b", ville)
        if arr:
            ville = arr.group(1)
        kw = r.get("keywords_fr") or ""
        if isinstance(kw, list):
            kw = " ".join(kw)
        cat = categorie(titre + " " + kw, set())
        ev = {"id": "oa-" + str(r.get("uid")), "t": titre, "cat": cat, "z": dep, "w": ville,
              "lieu": (r.get("location_name") or "").strip() or ville, "s": a.isoformat(),
              "d": resume(r.get("description_fr")), "u": r.get("canonicalurl") or "",
              "src": ((r.get("originagenda_title") or "").strip() or "OpenAgenda") + " (OpenAgenda)",
              "lat": round(float(ll["lat"]), 5), "lon": round(float(ll["lon"]), 5), "o": "oa"}
        if fin != a: ev["e"] = fin.isoformat()
        if heure and heure != "00:00": ev["h"] = heure
        if autres: ev["n"] = autres
        img = r.get("image") or r.get("thumbnail")
        if isinstance(img, dict):
            img = img.get("url") or img.get("filename")
        if isinstance(img, str) and img.startswith("http"): ev["img"] = img
        if "gratuit" in norm(r.get("conditions_fr") or ""): ev["g"] = 1
        out.append(ev)
    print("OpenAgenda :", len(out), "sorties")
    return out

# --- Enrichissements par département, répartis sur les 7 jours de la semaine ---
JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
def marches_paris():
    url = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/marches-decouverts/exports/json?select=" + urllib.parse.quote(
        "id_marche,nom_long,produit,ardt,localisation,jours_tenue,lundi,mardi,mercredi,jeudi,vendredi,samedi,dimanche,h_deb_sem_1,h_fin_sem_1,h_deb_sam,h_fin_sam,h_deb_dim,h_fin_dim,geo_point_2d")
    rows = json.loads(get(url)); out = []
    for r in rows:
        gp = r.get("geo_point_2d") or {}
        if not gp:
            continue
        nom = (r.get("nom_long") or "").strip().lower().capitalize()
        nom = re.sub(r"\bmarche\b|\bmarché\b", "Marché", nom, count=1)
        nom = " ".join(w if w.isupper() else (w.capitalize() if i and w not in ("de", "du", "des", "la", "le", "les", "d'", "et", "aux", "au") else w) for i, w in enumerate(nom.split()))
        produit = (r.get("produit") or "Alimentaire").strip()
        jours = [j for j in JOURS_FR if r.get(j) == 1]
        if not jours:
            continue
        ardt = r.get("ardt")
        cat = "brocante" if re.search(r"puce|brocante|livre|timbre", norm(produit + nom)) else "fete"
        for k in range(22):
            d = AUJ + dt.timedelta(days=k); j = JOURS_FR[d.weekday()]
            if j not in jours:
                continue
            h0, h1 = (r.get("h_deb_sam"), r.get("h_fin_sam")) if j == "samedi" else (r.get("h_deb_dim"), r.get("h_fin_dim")) if j == "dimanche" else (r.get("h_deb_sem_1"), r.get("h_fin_sem_1"))
            ev = {"id": f"mp-{r.get('id_marche')}-{d.isoformat()}", "t": nom[:1].upper() + nom[1:], "cat": cat, "z": "75", "w": "Paris",
                  "lieu": (r.get("localisation") or "Paris").strip()[:120] + (f" ({ardt}e)" if ardt else ""), "s": d.isoformat(),
                  "d": f"Marché {produit.lower()} en plein air, " + (", ".join(jours[:-1]) + " et " + jours[-1] if len(jours) > 1 else jours[0]) + (f", de {h0.replace(':', 'h')} à {h1.replace(':', 'h')}." if h0 and h1 else "."),
                  "u": "https://www.paris.fr/pages/les-marches-parisiens-2428", "src": "Marchés découverts (Ville de Paris)",
                  "lat": round(float(gp["lat"]), 5), "lon": round(float(gp["lon"]), 5), "o": "marche", "g": 1}
            if h0: ev["h"] = h0
            out.append(ev)
    print("Marchés parisiens :", len(out), "dates")
    return out

def _d(s):
    """Date ISO ou JJ/MM/AAAA -> date."""
    s = (s or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m: return dt.date(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s)
    if m: return dt.date(int(m[3]), int(m[2]), int(m[1]))
    return None
def _ev(src, sid, titre, a, b, dep, ville, lieu, lat, lon, desc="", url="", img="", heure="", txtcat="", gratuit=False, origine="src"):
    """Construit un événement normalisé ou None s'il est passé, trop lointain ou incomplet."""
    titre = re.sub(r"\s+", " ", titre or "").strip()
    if not titre or not a or lat in (None, "") or lon in (None, "") or not dep:
        return None
    b = b or a
    if b < AUJ or a > HORIZON:
        return None
    if a < AUJ and (b - a).days <= 14:
        a = AUJ
    ev = {"id": sid, "t": titre, "cat": categorie(titre + " " + (txtcat or ""), set()), "z": dep, "w": (ville or "").strip(),
          "lieu": (lieu or "").strip() or (ville or "").strip(), "s": a.isoformat(), "d": resume(re.sub("<[^>]+>", " ", desc or "")),
          "u": url or "", "src": src, "lat": round(float(lat), 5), "lon": round(float(lon), 5), "o": origine}
    if b != a: ev["e"] = b.isoformat()
    if heure and re.match(r"\d{2}:\d{2}", heure) and heure[:5] != "00:00": ev["h"] = heure[:5]
    if img and str(img).startswith("http"): ev["img"] = str(img).split("|")[0].strip()
    if gratuit: ev["g"] = 1
    return ev if ev["w"] else None

def pas_de_calais():
    txt = get("https://www.data.gouv.fr/api/1/datasets/r/51c8060e-994c-401b-acd8-515a8128df1e").decode("utf-8-sig", "replace")
    out = []
    for r in csv.DictReader(io.StringIO(txt), delimiter=";"):
        pers = []
        for i in range(1, 10):
            a = _d(r.get(f"periode_date_debut_{i}")); b = _d(r.get(f"periode_date_fin_{i}"))
            if a: pers.append((a, b or a))
        pers = sorted(p for p in pers if p[1] >= AUJ)
        if not pers: continue
        try:
            la, lo = [float(x) for x in (r.get("geo_point_2d") or "").split(",")]
        except ValueError:
            continue
        ev = _ev("Pas-de-Calais Tourisme", "pc-" + r.get("id", ""), r.get("titre"), pers[0][0], pers[0][1], dep_de(r.get("code_postal_etab", "")),
                 r.get("commune_etab"), r.get("raison_sociale_etab") or r.get("adr_etab"), la, lo,
                 r.get("description_introduction") or r.get("description_presentation"), r.get("site_web"), r.get("multimedia_url_photo"),
                 txtcat=(r.get("type") or "") + " " + (r.get("themes") or ""), gratuit="gratuit" in norm(" ".join(v or "" for k, v in r.items() if k.startswith("tarif"))))
        if ev:
            if len(pers) > 1: ev["n"] = len(pers) - 1
            out.append(ev)
    return out

def clermont():
    rows = json.loads(get("https://opendata.clermontmetropole.eu/api/explore/v2.1/catalog/datasets/agenda-vcf/exports/json"))
    out = []
    for r in rows:
        gp = r.get("geo_point_2d") or {}
        img = r.get("illustrations_item_traductionfichiers_item_url")
        if isinstance(img, list): img = img[0] if img else ""
        site = r.get("informations_moyenscommunication_siteweb")
        if isinstance(site, list): site = site[0] if site else ""
        typ = r.get("informationsfeteetmanifestation_typesmanifestation_item_libellefr") or ""
        if isinstance(typ, list): typ = " ".join(typ)
        ho = r.get("ouverture_horaireouverture")
        if isinstance(ho, list): ho = ho[0] if ho else ""
        ev = _ev("Clermont Auvergne Volcans (office de tourisme)", "cf-" + str(r.get("id")), r.get("nom"), _d(r.get("ouverture_datedebut")), _d(r.get("ouverture_datefin")),
                 dep_de(str(r.get("localisation_adresse_codepostal") or "")) or "63", r.get("localisation_adresse_commune_nom"), r.get("localisation_adresse_nomdulieu"),
                 gp.get("lat"), gp.get("lon"), r.get("presentation"), site, img, str(ho or ""), typ,
                 "gratuit" in norm(str(r.get("descriptiontarif_indicationtarif") or "")))
        if ev: out.append(ev)
    return out

def isere_musees():
    rows = json.loads(get("https://www.data.gouv.fr/api/1/datasets/r/e7f4042b-2762-49e8-ad20-5fab9b548ce7"))
    out = []
    for r in rows:
        txt = " ".join(str(r.get(k) or "") for k in ("horaires_ouverture", "descriptif_court"))
        ds = [_d(x) for x in re.findall(r"\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2}", txt)]
        ds = [x for x in ds if x]
        if not ds: continue
        ev = _ev("Musées départementaux de l'Isère", "is-" + str(r.get("id")), r.get("nom"), min(ds), max(ds), dep_de(str(r.get("adresse_code_postal") or "")) or "38",
                 r.get("adresse_nom_commune"), r.get("adresse_nom_du_lieu") or r.get("structure_gestion"), r.get("coordonnees_y_wgs84"), r.get("coordonnees_x_wgs84"),
                 r.get("descriptif_court"), r.get("contact_site_web"), "", "", "expo musee " + str(r.get("type") or ""), "gratuit" in norm(str(r.get("tarif") or "")))
        if ev: out.append(ev)
    return out

def nice_otm():
    j = json.loads(get("https://www.data.gouv.fr/api/1/datasets/r/4d57cbed-521f-44be-a2e4-da313cddd089"))
    out = []
    for o in j.get("objetsTouristiques", []):
        loc = o.get("localisation") or {}; adr = loc.get("adresse") or {}; com = adr.get("commune") or {}
        geo = ((loc.get("geolocalisation") or {}).get("geoJson") or {}).get("coordinates") or [None, None]
        pers = []
        for p in (o.get("ouverture") or {}).get("periodesOuvertures") or []:
            a = _d(p.get("dateDebut")); b = _d(p.get("dateFin"))
            if a: pers.append((a, b or a, p.get("horaireOuverture") or ""))
        pers = sorted(p for p in pers if p[1] >= AUJ)
        if not pers: continue
        img = ""
        for il in o.get("illustrations") or []:
            for f in il.get("traductionFichiers") or []:
                img = img or f.get("url", "")
        site = ""
        for m in (o.get("informations") or {}).get("moyensCommunication") or []:
            if (m.get("type") or {}).get("id") == 205: site = (m.get("coordonnees") or {}).get("fr", "")
        pres = o.get("presentation") or {}
        desc = ((pres.get("descriptifCourt") or {}).get("libelleFr")) or ""
        ev = _ev("Office de tourisme Nice Côte d'Azur", "nc-" + str(o.get("id")), (o.get("nom") or {}).get("libelleFr"), pers[0][0], pers[0][1],
                 dep_de(str(adr.get("codePostal") or "")) or "06", com.get("nom"), adr.get("nomDuLieu") or adr.get("adresse1"), geo[1], geo[0], desc, site, img, pers[0][2])
        if ev:
            if len(pers) > 1: ev["n"] = len(pers) - 1
            out.append(ev)
    return out

def _oa_like(rows, src, prefix):
    out = []
    for r in rows:
        tm = r.get("timings") or r.get("nexttiming") or []
        if isinstance(tm, str):
            try: tm = json.loads(tm)
            except ValueError: tm = []
        if isinstance(tm, dict): tm = [tm]
        occ = []
        for x in tm:
            b = x.get("begin") or x.get("start") or ""; e = x.get("end") or b
            a1, b1 = _d(b), _d(e)
            if a1: occ.append((a1, b[11:16], b1 or a1))
        occ = sorted(x for x in occ if x[2] >= AUJ)
        if not occ: continue
        ll = r.get("location_coordinates") or r.get("geo") or {}
        if isinstance(ll, list) and len(ll) == 2: ll = {"lat": ll[0], "lon": ll[1]}
        img = r.get("image_full_url") or r.get("image") or r.get("thumbnail") or ""
        if isinstance(img, dict): img = img.get("url", "")
        ev = _ev(src, prefix + str(r.get("uid")), r.get("title_fr") or r.get("title"), occ[0][0], occ[-1][2] if (occ[-1][0] - occ[0][0]).days <= 31 else occ[0][2],
                 dep_de(str(r.get("location_postalcode") or "")), r.get("location_city"), r.get("location_name"), (ll or {}).get("lat"), (ll or {}).get("lon"),
                 r.get("description_fr") or r.get("description"), r.get("canonicalurl") or "", img, occ[0][1],
                 " ".join(r.get("keywords_fr") or r.get("keywords") or []) + " " + str(r.get("thematiques_label") or ""), "gratuit" in norm(str(r.get("conditions_fr") or r.get("conditions") or "")))
        if ev: out.append(ev)
    return out
def gpso():
    return _oa_like(json.loads(get("https://www.data.gouv.fr/api/1/datasets/r/f3e3c20e-4f57-4647-8185-83ade400b490")), "Grand Paris Seine Ouest (OpenAgenda)", "oa-")
def idf_nature():
    return _oa_like(json.loads(get("https://www.data.gouv.fr/api/1/datasets/r/2ad8eb37-e7cc-4b7e-9a46-70a6a83120c1")), "Île-de-France Nature", "idfn-")
def occitanie():
    out = []
    for r in json.loads(get("https://www.data.gouv.fr/api/1/datasets/r/a83bc1c2-d259-4aa3-bd8f-17fa4c9cb137")):
        gp = r.get("geo_point_2d") or {}
        ins = str(r.get("code_insee") or "")
        dep = ("2A" if ins.startswith("2A") else "2B" if ins.startswith("2B") else ins[:3] if ins.startswith("97") else ins[:2]) if ins else None
        ev = _ev("Région Occitanie", "oc-" + str(abs(hash((r.get("titre"), r.get("date_debut"), ins))) % 10**10), r.get("titre"), _d(r.get("date_debut")), _d(r.get("date_fin")),
                 dep, r.get("commune"), (r.get("adresse") or "").split(",")[0], gp.get("lat"), gp.get("lon"), r.get("description"), r.get("url"), "", "", str(r.get("thematique") or ""))
        if ev: out.append(ev)
    return out

# Sources complémentaires : chacune est rafraîchie un jour fixe de la semaine (rang modulo 7)
SOURCES_ROT = [("paris-marches", marches_paris), ("62-pas-de-calais", pas_de_calais), ("63-clermont", clermont), ("38-isere-musees", isere_musees),
               ("06-nice", nice_otm), ("92-gpso", gpso), ("idf-nature", idf_nature), ("occitanie", occitanie)]
RAPPORT_ROT = {}
def enrichir():
    os.makedirs("data/enrich", exist_ok=True)
    jour = AUJ.weekday(); force = os.environ.get("TOUT_ENRICHIR") == "1"; tous = []
    for i, (nom, f) in enumerate(SOURCES_ROT):
        fichier = f"data/enrich/{nom}.json"
        if force or i % 7 == jour or not os.path.exists(fichier):
            try:
                evs = f()
                json.dump(evs, open(fichier, "w"), ensure_ascii=False, separators=(",", ":"))
                RAPPORT_ROT[nom] = {"rafraichi": AUJ.isoformat(), "n": len(evs)}
            except Exception as e:
                RAPPORT_ROT[nom] = {"erreur": str(e)[:200]}
        if os.path.exists(fichier):
            evs = [e for e in json.load(open(fichier)) if (e.get("e") or e["s"]) >= AUJ.isoformat()]
            RAPPORT_ROT.setdefault(nom, {})["en_cache"] = len(evs); RAPPORT_ROT[nom]["jour"] = JOURS_FR[i % 7]
            tous += evs
    return tous

PALN = re.compile(r"fondation le pal|le pal nature|pal nature")
def badges(ev):
    txt = norm(ev["t"] + " " + ev.get("d", "") + " " + ev.get("src", ""))
    if PALN.search(txt):
        ev["b"] = "palnature"
    if re.search(r"\ble pal\b", norm(ev["t"])) and norm(ev["w"]) in ("dompierre-sur-besbre", "saint-pourcain-sur-besbre"):
        ev["cat"] = "pal"

def main():
    com = json.loads(get("https://geo.api.gouv.fr/communes?fields=nom,codeDepartement,centre&format=json&geometry=centre"))
    centres = {}
    for c in com:
        try:
            lo, la = c["centre"]["coordinates"]
        except (KeyError, TypeError):
            continue
        centres.setdefault((norm(c["nom"]), c["codeDepartement"]), (la, lo))
    corriges = 0
    meta = json.loads(get(API))
    res = [r for r in meta["resources"] if r["title"].strip() == "datatourisme-fma.csv"][0]
    brut = get(res["url"]).decode("utf-8-sig")
    lignes = csv.DictReader(io.StringIO(brut))
    par_dep = defaultdict(list); vus = set(); classes_vues = Counter(); stats = Counter(); ecartes = Counter()
    for r in lignes:
        per = periode_suivante(r.get("Periodes_regroupees", ""))
        if not per:
            ecartes["passé ou sans date"] += 1; continue
        a, b, autres = per
        if a > HORIZON:
            ecartes["trop lointain"] += 1; continue
        cpc = r.get("Code_postal_et_commune", "")
        cp, _, commune = cpc.partition("#")
        dep = dep_de(cp)
        try:
            lat = round(float(r["Latitude"]), 5); lon = round(float(r["Longitude"]), 5)
        except (ValueError, KeyError):
            ecartes["sans coordonnées"] += 1; continue
        if not dep or not commune:
            ecartes["sans commune"] += 1; continue
        commune = commune.strip()
        arr = re.match(r"^(Paris|Lyon|Marseille) (\d+)(?:er|e|ème) Arrondissement$", commune)
        if arr:
            commune = arr.group(1)
        ce = centres.get((norm(commune), dep))
        if ce and (abs(ce[0] - lat) > 0.45 or abs(ce[1] - lon) > 0.65):
            lat, lon = round(ce[0], 5), round(ce[1], 5); corriges += 1
        elif not ce and not (-22 < lat < 52 and -64 < lon < 56):
            ecartes["coordonnées incohérentes"] += 1; continue
        titre = re.sub(r"\s+", " ", r.get("Nom_du_POI", "")).strip()
        if not titre:
            continue
        cle = (norm(titre), norm(commune), a)
        if cle in vus:
            ecartes["doublon"] += 1; continue
        vus.add(cle)
        cls = set(x.rsplit("#", 1)[-1].rsplit("/", 1)[-1] for x in r.get("Categories_de_POI", "").split("|") if x)
        classes_vues.update(cls)
        cat = categorie(titre, cls)
        stats[cat] += 1
        ev = {"id": "dt-" + r["URI_ID_du_POI"].rsplit("/", 1)[-1][:13], "t": titre, "cat": cat, "z": dep,
              "w": commune, "lieu": ((r.get("Adresse_postale") or "").strip() or commune) + (f" ({arr.group(2)}e)" if arr else ""),
              "s": a.isoformat(), "d": resume(r.get("Description")), "u": premier_lien(r.get("Contacts_du_POI")),
              "src": (r.get("Createur_de_la_donnee") or "DATAtourisme").strip(), "lat": lat, "lon": lon, "o": "dt"}
        if b != a:
            ev["e"] = b.isoformat()
        if autres:
            ev["n"] = autres
        par_dep[dep].append(ev)

    for ev in paris():
        cle = (norm(ev["t"]), norm(ev["w"]), dt.date.fromisoformat(ev["s"]))
        if cle in vus:
            continue
        vus.add(cle); stats[ev["cat"]] += 1; stats["(Paris open data)"] += 1
        par_dep[ev["z"]].append(ev)
    for ev in openagenda():
        cle = (norm(ev["t"]), norm(ev["w"]), dt.date.fromisoformat(ev["s"]))
        if cle in vus:
            continue
        vus.add(cle); stats[ev["cat"]] += 1; stats["(OpenAgenda)"] += 1
        par_dep[ev["z"]].append(ev)
    for ev in enrichir():
        cle = (norm(ev["t"]), norm(ev["w"]), dt.date.fromisoformat(ev["s"]))
        if cle in vus:
            continue
        vus.add(cle); stats[ev["cat"]] += 1; stats["(sources complémentaires)"] += 1
        par_dep[ev["z"]].append(ev)
    for evs in par_dep.values():
        for ev in evs:
            badges(ev)
    os.makedirs("data/dep", exist_ok=True)
    noms = {d["code"]: d["nom"] for d in json.loads(get("https://geo.api.gouv.fr/departements?fields=nom,code"))}
    pop = Counter()
    for c in json.loads(get("https://geo.api.gouv.fr/communes?fields=codeDepartement,population&format=json")):
        pop[c.get("codeDepartement")] += c.get("population") or 0
    index = []
    for dep in [d for d in par_dep if d not in noms]:
        ecartes["département inconnu"] += len(par_dep.pop(dep))
    for dep, evs in sorted(par_dep.items()):
        evs.sort(key=lambda e: (e["s"], e["t"]))
        json.dump(evs, open(f"data/dep/{dep}.json", "w"), ensure_ascii=False, separators=(",", ":"))
        la = sum(e["lat"] for e in evs) / len(evs); lo = sum(e["lon"] for e in evs) / len(evs)
        index.append({"code": dep, "nom": noms.get(dep, dep), "n": len(evs), "lat": round(la, 3), "lon": round(lo, 3),
                      "pop": pop.get(dep, 0), "par10k": round(len(evs) * 10000 / pop[dep], 1) if pop.get(dep) else None,
                      "sources": dict(Counter(e.get("o", "?") for e in evs))})
    json.dump({"maj": AUJ.isoformat(), "source": res["url"], "departements": index}, open("data/departements.json", "w"), ensure_ascii=False, indent=0)

    out = []
    for c in com:
        try:
            lo, la = c["centre"]["coordinates"]
        except (KeyError, TypeError):
            continue
        out.append([c["nom"], c["codeDepartement"], round(la, 4), round(lo, 4)])
    json.dump(out, open("data/communes-fr.json", "w"), ensure_ascii=False, separators=(",", ":"))

    ecartes["coordonnées corrigées (centre de la commune)"] = corriges
    json.dump({"maj": AUJ.isoformat(), "par_type": stats, "ecartes": ecartes, "classes": classes_vues.most_common(80),
               "total": sum(v for k, v in stats.items() if not k.startswith("(")), "rotation": RAPPORT_ROT}, open("data/_stats.json", "w"), ensure_ascii=False, indent=1)
    print("événements retenus :", sum(stats.values()), dict(stats), "écartés :", dict(ecartes))

if __name__ == "__main__":
    main()
