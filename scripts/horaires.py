"""Horaires d'ouverture et téléphones depuis OpenStreetMap (Overpass), pour les musées, châteaux, parcs, zoos,
sites touristiques et offices de tourisme. La France est découpée en carreaux ; chaque passage rafraîchit les
carreaux les plus anciens (pour ménager les serveurs Overpass), puis rattache les horaires aux lieux déjà publiés
dans data/lieux/. Données © les contributeurs d'OpenStreetMap, licence ODbL."""
import glob, json, os, re, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import lieux

SERVEURS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
FILTRES = ['["tourism"="museum"]', '["tourism"="gallery"]["opening_hours"]', '["tourism"="information"]["information"="office"]',
           '["tourism"="zoo"]', '["tourism"="aquarium"]', '["tourism"="theme_park"]', '["tourism"="attraction"]["opening_hours"]',
           '["tourism"="viewpoint"]["opening_hours"]', '["historic"="castle"]["opening_hours"]', '["historic"="manor"]["opening_hours"]',
           '["historic"="monastery"]["opening_hours"]', '["leisure"="garden"]["opening_hours"]', '["leisure"="park"]["opening_hours"]["name"]']
DOSSIER = "data/enrich/osm"
PAR_PASSAGE = int(os.environ.get("CARREAUX", "18"))
BUDGET = 25 * 60

def carreaux():
    la = 41.0
    while la < 51.2:
        lo = -5.4
        while lo < 9.8:
            yield f"m{la:.0f}_{lo:.0f}", (la, lo, min(la + 2, 51.2), min(lo + 2, 9.8))
            lo += 2
        la += 2
    for nom, bb in [("glp", (15.8, -61.9, 16.6, -60.9)), ("mtq", (14.3, -61.3, 14.9, -60.7)), ("guf", (2.0, -54.7, 5.9, -51.5)),
                    ("reu", (-21.5, 55.1, -20.8, 55.9)), ("myt", (-13.1, 44.9, -12.6, 45.4))]:
        yield nom, bb

def requete(bb):
    b = ",".join(f"{x:.2f}" for x in bb)
    return "[out:json][timeout:120];(" + "".join(f"nwr{f}({b});" for f in FILTRES) + ");out center tags qt;"

def telecharger(bb):
    for url in SERVEURS:
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": requete(bb)}).encode(),
                                         headers={"User-Agent": "TrucsAFaire/1.0 (GitHub Actions; +https://trucsafaire.fr; contact clementer@gmail.com)"})
            return json.loads(urllib.request.urlopen(req, timeout=150).read())
        except Exception as ex:
            print("  ", url.split("/")[2], str(ex)[:100]); time.sleep(5)
    return None

def main():
    os.makedirs(DOSSIER, exist_ok=True)
    tous = list(carreaux())
    age = lambda nom: os.path.getmtime(f"{DOSSIER}/{nom}.json") if os.path.exists(f"{DOSSIER}/{nom}.json") else 0
    a_faire = sorted(tous, key=lambda c: age(c[0]))[:PAR_PASSAGE]
    debut, faits = time.time(), 0
    for nom, bb in a_faire:
        if time.time() - debut > BUDGET: break
        js = telecharger(bb)
        if js is None: continue
        out = []
        for e in js.get("elements", []):
            t = e.get("tags") or {}; c = e.get("center") or e
            if "lat" not in c or not t.get("name"): continue
            oh, tel = t.get("opening_hours", ""), t.get("phone", t.get("contact:phone", ""))
            if not oh and not tel: continue
            out.append({"n": t["name"], "lat": c["lat"], "lon": c["lon"], "oh": oh[:200], "office": t.get("information") == "office",
                        "tel": re.sub(r"[^0-9+ ;]", "", tel)[:30], "web": t.get("website", t.get("contact:website", ""))[:200]})
        json.dump(out, open(f"{DOSSIER}/{nom}.json", "w"), ensure_ascii=False, separators=(",", ":"))
        faits += 1; print(nom, len(out), "lieux"); time.sleep(2)
    print("Carreaux rafraîchis :", faits, "sur", len(a_faire), "· en cache :", len(glob.glob(f"{DOSSIER}/*.json")), "sur", len(tous))
    # rattachement aux lieux publiés
    osm = lieux.osm_horaires()
    par_dep = {}
    for f in glob.glob("data/lieux/*.json"):
        if f.endswith("index.json"): continue
        L = json.load(open(f))
        for x in L:
            x.pop("oh", None)
        par_dep[f] = L
    n = lieux.rapprocher(par_dep, osm)
    for f, L in par_dep.items():
        json.dump(L, open(f, "w"), ensure_ascii=False, separators=(",", ":"))
    print("Lieux avec horaires :", n)
    st = {}
    try: st = json.load(open("data/_lieux_stats.json"))
    except Exception: pass
    st.update({"avec_horaires_osm": n, "osm_en_cache": len(osm), "osm_carreaux": f"{len(glob.glob(DOSSIER + '/*.json'))}/{len(tous)}"})
    json.dump(st, open("data/_lieux_stats.json", "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
