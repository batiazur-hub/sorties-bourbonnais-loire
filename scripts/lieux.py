"""Lieux à visiter (musées, patrimoine, nature, parcs de loisirs) à partir de l'export national DATAtourisme
« datatourisme-place.csv » publié sur data.gouv.fr. Les lieux changent peu : ce script tourne une fois par semaine.

Sorties :
  data/lieux/<dep>.json     lieux du département
  data/lieux/index.json     nombre de lieux par département et par type
  data/_lieux_stats.json    contrôle : classes DATAtourisme rencontrées, lieux retenus ou écartés
"""
import csv, io, json, os, re, sys, unicodedata, urllib.request
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
    for x in re.split(r"[#|]", contacts or ""):
        x = x.strip()
        if x.startswith("http"):
            return x
    return ""

# Type de lieu d'après les classes DATAtourisme (l'exclusion passe en premier)
EXCLU = re.compile(r"accommodation|foodestablishment|restaurant|store|shop|hotel|camp|rental|transport|service|tasting|producer|"
                   r"sportsandleisureplace$|healthcare|education|practice|course|tour$|trail", re.I)
TYPES = [
    ("musee", re.compile(r"museum|interpretationcent|artgallery|exhibitionhall|ecomuseum", re.I)),
    ("loisirs", re.compile(r"themepark|amusement|zoo|aquarium|animalpark|leisurecomplex|waterpark|adventurepark|farm", re.I)),
    ("nature", re.compile(r"naturalheritage|parkandgarden|garden|cave|viewpoint|natural|beach|lake|forest|waterfall|gorge|summit|river", re.I)),
    ("patrimoine", re.compile(r"castle|culturalsite|religious|church|cathedral|abbey|chapel|remarkablebuilding|archeolog|monument|"
                              r"heritage|memorial|fort|mill|bridge|lighthouse|city|village|historic", re.I)),
]
FORT_EXCLU = re.compile(r"accommodation|foodestablishment|restaurant|hotel|camp|store|shop|rental", re.I)
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
    par_dep = defaultdict(list); vus = set()
    for r in csv.DictReader(flux):
        cls = [x.rsplit("#", 1)[-1].rsplit("/", 1)[-1] for x in (r.get("Categories_de_POI") or "").split("|") if x]
        classes_vues.update(cls)
        k = type_de(cls)
        if not k:
            ecartes["type non retenu"] += 1; continue
        if k not in ("musee", "loisirs") and any(FORT_EXCLU.search(c) for c in cls):
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
        src = (r.get("Createur_de_la_donnee") or "").strip()
        if src: lieu["src"] = src
        par_dep[dep].append(lieu); par_type[k] += 1
    os.makedirs("data/lieux", exist_ok=True)
    for f in os.listdir("data/lieux"):
        if f.endswith(".json") and f != "index.json" and f[:-5] not in par_dep:
            os.remove(f"data/lieux/{f}")
    index = {}
    for dep, L in sorted(par_dep.items()):
        L.sort(key=lambda x: ("lmpn".index(x["k"][0]) if x["k"][0] in "lmpn" else 9, x["t"]))
        json.dump(L, open(f"data/lieux/{dep}.json", "w"), ensure_ascii=False, separators=(",", ":"))
        index[dep] = {"n": len(L), **Counter(x["k"] for x in L)}
    json.dump({"source": res["url"], "total": sum(par_type.values()), "types": par_type, "departements": index},
              open("data/lieux/index.json", "w"), ensure_ascii=False, indent=0)
    json.dump({"retenus_par_type": par_type, "ecartes": ecartes, "classes_gardees": classes_gardees.most_common(80),
               "classes_vues": classes_vues.most_common(200)}, open("data/_lieux_stats.json", "w"), ensure_ascii=False, indent=1)
    print("Lieux retenus :", dict(par_type), "écartés :", dict(ecartes))

if __name__ == "__main__":
    main()
