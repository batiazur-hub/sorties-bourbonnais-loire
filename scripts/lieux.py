"""Lieux à visiter (musées, patrimoine, nature, parcs de loisirs) et offices de tourisme, à partir de l'export national
DATAtourisme « datatourisme-place.csv » publié sur data.gouv.fr. Les horaires d'ouverture viennent d'OpenStreetMap
(balise opening_hours, licence ODbL), rapprochés par position et par nom. Ce script tourne une fois par semaine.

Sorties :
  data/lieux/<dep>.json     lieux du département
  data/lieux/index.json     nombre de lieux par département et par type
  data/_lieux_stats.json    contrôle : classes DATAtourisme rencontrées, lieux retenus ou écartés
"""
import csv, io, json, math, os, re, sys, unicodedata, urllib.parse, urllib.request, datetime as dt
from collections import Counter, defaultdict

API = "https://www.data.gouv.fr/api/1/datasets/5b598be088ee387c0c353714/"
csv.field_size_limit(10**8)

def ouvrir(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dans-le-coin (GitHub Actions)", "Accept-Encoding": "identity"})
    return urllib.request.urlopen(req, timeout=900)

def norm(s):
    return unicodedata.normalize("NFD", (s or "").lower()).encode("ascii", "ignore").decode()

def dep_de(cp):
    cp = (cp or "").strip()
    if not re.match(r"^\d{5}$", cp):
        return None
    if cp.startswith("20"):
        return "2A" if int(cp) < 20200 else "2B"
    return cp[:3] if cp.startswith("97") else cp[:2]

def resume(d, n=260):
    d = re.sub(r"\s+", " ", d or "").strip()
    if len(d) <= n:
        return d
    return d[:n].rsplit(" ", 1)[0].rstrip(",;:") + "…"

def premier_lien(contacts):
    for x in re.split(r"[#|<>\s]+", contacts or ""):
        x = x.strip()
        if x.startswith("http"):
            return x
        if x.startswith("www."):
            return "https://" + x
    return ""

TEL = re.compile(r"(?:\+33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}")
def telephone(contacts):
    m = TEL.search(contacts or "")
    if not m: return ""
    n = re.sub(r"\D", "", m.group(0))
    if n.startswith("33"): n = "0" + n[2:]
    return " ".join(n[i:i + 2] for i in range(0, 10, 2)) if len(n) == 10 else ""

AUJ = dt.date.today()
def periodes(txt):
    """Périodes d'ouverture « AAAA-MM-JJ<->AAAA-MM-JJ|… » : on garde les 3 prochaines (ou en cours)."""
    out = []
    for p in (txt or "").split("|"):
        m = re.match(r"\s*(\d{4}-\d{2}-\d{2})<->(\d{4}-\d{2}-\d{2})", p)
        if m and m.group(2) >= AUJ.isoformat():
            out.append([m.group(1), m.group(2)])
    out.sort()
    return out[:3]

# --- Horaires d'ouverture OpenStreetMap (Overpass) ---
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
REQ = """[out:json][timeout:600];
area["ISO3166-1"="FR"][admin_level=2]->.fr;
(nwr["opening_hours"]["tourism"~"^(museum|gallery|attraction|zoo|aquarium|theme_park|viewpoint)$"](area.fr);
 nwr["opening_hours"]["tourism"="information"]["information"="office"](area.fr);
 nwr["opening_hours"]["historic"~"^(castle|manor|monastery|fort|palace)$"](area.fr);
 nwr["opening_hours"]["leisure"~"^(park|garden|nature_reserve)$"]["name"](area.fr););
out center tags qt;"""
def osm_horaires():
    cache = "data/enrich/osm-horaires.json"
    for url in OVERPASS:
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": REQ}).encode(), headers={"User-Agent": "dans-le-coin (GitHub Actions)"})
            js = json.loads(urllib.request.urlopen(req, timeout=900).read())
            out = []
            for e in js.get("elements", []):
                t = e.get("tags") or {}; c = e.get("center") or e
                if "lat" in c and t.get("opening_hours"):
                    out.append({"n": t.get("name", ""), "lat": c["lat"], "lon": c["lon"], "oh": t["opening_hours"][:200],
                                "office": t.get("information") == "office", "tel": t.get("phone", "")[:30], "web": t.get("website", "")[:200]})
            if len(out) > 1000:
                os.makedirs("data/enrich", exist_ok=True)
                json.dump(out, open(cache, "w"), ensure_ascii=False, separators=(",", ":"))
                print("OpenStreetMap :", len(out), "lieux avec horaires"); return out
        except Exception as ex:
            print("Overpass indisponible", url, ex)
    try:
        return json.load(open(cache))
    except Exception:
        return []

MOTS_VIDES = {"de", "du", "des", "la", "le", "les", "l", "d", "et", "a", "au", "aux", "en", "musee", "office", "tourisme", "chateau", "eglise", "parc", "jardin", "maison", "site", "centre"}
def mots(s):
    return {w for w in re.split(r"[^a-z0-9]+", norm(s)) if len(w) > 2 and w not in MOTS_VIDES}
def rapprocher(par_dep, osm):
    grille = defaultdict(list)
    for o in osm:
        grille[(round(o["lat"] * 200), round(o["lon"] * 200))].append(o)
    n = 0
    for L in par_dep.values():
        for x in L:
            best, bd = None, 1e9
            gy, gx = round(x["lat"] * 200), round(x["lon"] * 200)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    for o in grille.get((gy + dy, gx + dx), ()):
                        d = math.hypot((o["lat"] - x["lat"]) * 111200, (o["lon"] - x["lon"]) * 111200 * math.cos(math.radians(x["lat"])))
                        if d > 300: continue
                        a, b = mots(x["t"]), mots(o["n"])
                        ok = (x["k"] == "office" and o["office"] and d < 300) or (a and b and len(a & b) / min(len(a), len(b)) >= .5) or d < 40
                        if ok and d < bd: best, bd = o, d
            if best:
                x["oh"] = best["oh"]; n += 1
                if not x.get("tel") and best["tel"]: x["tel"] = best["tel"]
                if not x.get("u") and best["web"].startswith("http"): x["u"] = best["web"]
    return n

# Type de lieu d'après les classes DATAtourisme (l'exclusion passe en premier)
EXCLU = re.compile(r"accommodation|foodestablishment|restaurant|store|shop|hotel|camp|rental|transport|service|tasting|producer|"
                   r"sportsandleisureplace$|healthcare|education|practice|course|tour$|trail", re.I)
TYPES = [
    ("musee", re.compile(r"museum|interpretationcent|artgallery|exhibitionhall|ecomuseum", re.I)),
    ("loisirs", re.compile(r"themepark|amusement|zoo|aquarium|animalpark|leisurecomplex|waterpark|adventurepark|teachingfarm", re.I)),
    ("nature", re.compile(r"naturalheritage|parkandgarden|garden|cave|viewpoint|natural|beach|lake|forest|waterfall|gorge|summit|river", re.I)),
    ("patrimoine", re.compile(r"castle|culturalsite|religious|church|cathedral|abbey|chapel|remarkablebuilding|archeolog|monument|"
                              r"heritage|memorial|fort|mill|bridge|lighthouse|city|village|historic", re.I)),
]
FORT_EXCLU = re.compile(r"accommodation|foodestablishment|restaurant|hotel|camp|store|shop|rental", re.I)
OFFICES = {"TouristInformationCenter", "LocalTouristOffice"}
PAS_VISITE = {"Library", "MovieTheater", "Cinema", "Theater", "ConventionCentre", "CivicStructure", "StadiumOrArena"}
MAJEURS = {"Museum", "InterpretationCentre", "ArtGalleryOrExhibitionGallery", "Castle", "RemarkableBuilding", "RemarkableHouse", "ArcheologicalSite",
           "DefenceSite", "Ruins", "ThemePark", "AmusementPark", "Zoo", "ZooAnimalPark", "Aquarium", "ParkAndGarden", "PointOfView", "Beach",
           "Lake", "Cave", "IndustrialSite", "Forest", "TeachingFarm", "LeisureComplex"}
LABELS = re.compile(r"mus[ée]e de france|monument historique|jardin remarquable|maisons? des illustres|plus beaux villages|grand site|"
                    r"patrimoine mondial|unesco|villes? et pays d.art|petites cit[ée]s de caract[èe]re|qualit[ée] tourisme", re.I)

def type_de(classes):
    utiles = [c for c in classes if c not in ("PointOfInterest", "PlaceOfInterest", "Place", "Thing")]
    for c in utiles:
        for k, rx in TYPES:
            if rx.search(c) and not EXCLU.search(c):
                return k
    return None

def main():
    meta = json.loads(ouvrir(API).read())
    res = [r for r in meta["resources"] if r["title"].strip() == "datatourisme-place.csv"][0]
    flux = io.TextIOWrapper(ouvrir(res["url"]), encoding="utf-8-sig", newline="")
    classes_vues = Counter(); classes_gardees = Counter(); ecartes = Counter(); par_type = Counter()
    par_dep = defaultdict(list); vus = set(); echantillons = []
    lecteur = csv.DictReader(flux)
    for r in lecteur:
        cls = [x.rsplit("#", 1)[-1].rsplit("/", 1)[-1] for x in (r.get("Categories_de_POI") or "").split("|") if x]
        classes_vues.update(cls)
        k = "office" if set(cls) & OFFICES else type_de(cls)
        if not k:
            ecartes["type non retenu"] += 1; continue
        if set(cls) & PAS_VISITE and not set(cls) & MAJEURS:
            ecartes["bibliothèque, salle, cinéma"] += 1; continue
        if len(echantillons) < 12 and k in ("musee", "office") and r.get("Periodes_regroupees"):
            echantillons.append({c: (r.get(c) or "")[:300] for c in ("Nom_du_POI", "Periodes_regroupees", "Contacts_du_POI", "Classements_du_POI")})
        if k not in ("musee", "loisirs", "office") and any(FORT_EXCLU.search(c) for c in cls):
            ecartes["hébergement, restauration, commerce"] += 1; continue
        cp, _, commune = (r.get("Code_postal_et_commune") or "").partition("#")
        dep = dep_de(cp); commune = commune.strip()
        arr = re.match(r"^(Paris|Lyon|Marseille) \d+", commune)
        if arr:
            commune = arr.group(1)
        try:
            lat = round(float(r["Latitude"]), 5); lon = round(float(r["Longitude"]), 5)
        except (ValueError, KeyError, TypeError):
            ecartes["sans coordonnées"] += 1; continue
        if not dep or not commune or not (-22 < lat < 52 and -64 < lon < 56):
            ecartes["sans commune ou hors zone"] += 1; continue
        nom = re.sub(r"\s+", " ", r.get("Nom_du_POI") or "").strip()
        if not nom:
            continue
        cle = (norm(nom), norm(commune))
        if cle in vus:
            ecartes["doublon"] += 1; continue
        vus.add(cle)
        classes_gardees.update(cls)
        lieu = {"id": "lv-" + (r.get("URI_ID_du_POI") or "").rsplit("/", 1)[-1][:13], "t": nom, "k": k, "z": dep, "w": commune,
                "a": (r.get("Adresse_postale") or "").strip()[:120], "lat": lat, "lon": lon}
        d = resume(r.get("Description"))
        if d: lieu["d"] = d
        u = premier_lien(r.get("Contacts_du_POI"))
        if u: lieu["u"] = u
        lab = LABELS.search(r.get("Classements_du_POI") or "")
        if lab: lieu["l"] = lab.group(0)[:1].upper() + lab.group(0)[1:]
        if set(cls) & MAJEURS or k == "office" or (lab and "qualit" not in norm(lab.group(0))): lieu["m"] = 1
        tel = telephone(r.get("Contacts_du_POI"))
        if tel: lieu["tel"] = tel
        pp = periodes(r.get("Periodes_regroupees"))
        if pp: lieu["p"] = pp
        src = (r.get("Createur_de_la_donnee") or "").strip()
        if src: lieu["src"] = src
        par_dep[dep].append(lieu); par_type[k] += 1
    avec_horaires = rapprocher(par_dep, osm_horaires())
    print("Horaires OpenStreetMap rattachés :", avec_horaires)
    os.makedirs("data/lieux", exist_ok=True)
    for f in os.listdir("data/lieux"):
        if f.endswith(".json") and f != "index.json" and f[:-5] not in par_dep:
            os.remove(f"data/lieux/{f}")
    index = {}
    for dep, L in sorted(par_dep.items()):
        L.sort(key=lambda x: ("olmpn".index(x["k"][0]) if x["k"][0] in "olmpn" else 9, x["t"]))
        json.dump(L, open(f"data/lieux/{dep}.json", "w"), ensure_ascii=False, separators=(",", ":"))
        index[dep] = {"n": len(L), "m": sum(1 for x in L if x.get("m")), **Counter(x["k"] for x in L)}
    json.dump({"source": res["url"], "total": sum(par_type.values()), "types": par_type, "departements": index},
              open("data/lieux/index.json", "w"), ensure_ascii=False, indent=0)
    json.dump({"retenus_par_type": par_type, "ecartes": ecartes, "avec_horaires_osm": avec_horaires,
               "avec_periodes": sum(1 for L in par_dep.values() for x in L if x.get("p")), "colonnes": lecteur.fieldnames, "echantillons": echantillons, "classes_gardees": classes_gardees.most_common(80),
               "classes_vues": classes_vues.most_common(200)}, open("data/_lieux_stats.json", "w"), ensure_ascii=False, indent=1)
    print("Lieux retenus :", dict(par_type), "écartés :", dict(ecartes))

if __name__ == "__main__":
    main()
