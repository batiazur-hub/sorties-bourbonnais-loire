import json, urllib.request, urllib.parse, gzip, datetime as dt
def raw(u):
    b = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 dans-le-coin", "Accept-Encoding": "identity"}), timeout=180).read()
    return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b
def get(u): return json.loads(raw(u))
out = {}
for k, u in {"pdl": "https://data.paysdelaloire.fr/api/explore/v2.1/catalog/datasets/234400034_070-002_offre-touristique-fetes_et_manifestations-rpdl",
             "toulouse": "https://data.toulouse-metropole.fr/api/explore/v2.1/catalog/datasets/agenda-des-manifestations-culturelles-so-toulouse",
             "toulouse_marches": "https://data.toulouse-metropole.fr/api/explore/v2.1/catalog/datasets/marches-couverts-et-de-plein-vent"}.items():
    try:
        d = get(u); r = get(u + "/records?limit=2")
        out[k] = {"champs": [f["name"] for f in d.get("fields", [])], "n": r.get("total_count"), "ex": [{a: str(b)[:140] for a, b in x.items()} for x in r["results"]]}
    except Exception as e:
        out[k] = str(e)[:200]
try:
    cat = get("https://data.toulouse-metropole.fr/api/explore/v2.1/catalog/datasets?limit=20&where=" + urllib.parse.quote('search("agenda")'))
    out["toulouse_catalogue"] = [(x["dataset_id"], x["metas"]["default"]["title"], x["metas"]["default"].get("records_count")) for x in cat["results"]]
except Exception as e:
    out["toulouse_catalogue"] = str(e)[:200]
lim = (dt.date.today() - dt.timedelta(days=120)).isoformat()
dg = {}
for zone in ["Val-de-Marne", "Essonne", "Val-d'Oise", "Seine-Saint-Denis", "Seine-et-Marne", "Yvelines", "Hauts-de-Seine", "Ardèche", "Corse", "La Réunion",
             "Guadeloupe", "Martinique", "Guyane", "Mayotte", "Drôme", "Savoie", "Bretagne", "Normandie", "Grand Est", "Nouvelle-Aquitaine", "Hauts-de-France",
             "Centre-Val de Loire", "Bourgogne-Franche-Comté", "Provence", "Auvergne-Rhône-Alpes"]:
    for q in ("agenda " + zone, "événements " + zone, "manifestations " + zone):
        try:
            r = get("https://www.data.gouv.fr/api/1/datasets/?page_size=20&q=" + urllib.parse.quote(q))
        except Exception as e:
            continue
        for x in r["data"]:
            if (x.get("last_update") or "") < lim or x["id"] in dg:
                continue
            t = (x["title"] or "").lower()
            if not any(w in t for w in ("agenda", "événement", "evenement", "manifestation", "sortie", "fête", "fete", "festival", "animation")):
                continue
            dg[x["id"]] = {"zone": zone, "titre": x["title"], "org": (x.get("organization") or {}).get("name"), "maj": x["last_update"][:10],
                           "res": [(rr["format"], rr["url"]) for rr in x.get("resources", [])[:3]]}
out["datagouv"] = dg
json.dump(out, open("data/_sonde5.json", "w"), ensure_ascii=False, indent=1)
