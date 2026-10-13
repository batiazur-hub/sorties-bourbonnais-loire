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
    req = urllib.request.Request(url, headers={"User-Agent": "sorties-bourbonnais-loire (GitHub Actions)"})
    return urllib.request.urlopen(req, timeout=300).read()

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

def main():
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
    os.makedirs("data/dep", exist_ok=True)
    noms = {d["code"]: d["nom"] for d in json.loads(get("https://geo.api.gouv.fr/departements?fields=nom,code"))}
    index = []
    for dep, evs in sorted(par_dep.items()):
        evs.sort(key=lambda e: (e["s"], e["t"]))
        json.dump(evs, open(f"data/dep/{dep}.json", "w"), ensure_ascii=False, separators=(",", ":"))
        la = sum(e["lat"] for e in evs) / len(evs); lo = sum(e["lon"] for e in evs) / len(evs)
        index.append({"code": dep, "nom": noms.get(dep, dep), "n": len(evs), "lat": round(la, 3), "lon": round(lo, 3)})
    json.dump({"maj": AUJ.isoformat(), "source": res["url"], "departements": index}, open("data/departements.json", "w"), ensure_ascii=False, indent=0)

    com = json.loads(get("https://geo.api.gouv.fr/communes?fields=nom,codeDepartement,centre&format=json&geometry=centre"))
    out = []
    for c in com:
        try:
            lo, la = c["centre"]["coordinates"]
        except (KeyError, TypeError):
            continue
        out.append([c["nom"], c["codeDepartement"], round(la, 4), round(lo, 4)])
    json.dump(out, open("data/communes-fr.json", "w"), ensure_ascii=False, separators=(",", ":"))

    json.dump({"maj": AUJ.isoformat(), "par_type": stats, "ecartes": ecartes, "classes": classes_vues.most_common(80),
               "total": sum(stats.values())}, open("data/_stats.json", "w"), ensure_ascii=False, indent=1)
    print("événements retenus :", sum(stats.values()), dict(stats), "écartés :", dict(ecartes))

if __name__ == "__main__":
    main()
