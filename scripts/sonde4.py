import json, urllib.request, urllib.parse, gzip, datetime as dt
def raw(u):
    b = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 dans-le-coin", "Accept-Encoding": "identity"}), timeout=180).read()
    return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b
def get(u): return json.loads(raw(u))
out = {"datagouv": {}, "ods": {}}
lim = (dt.date.today() - dt.timedelta(days=75)).isoformat()
vus = set()
for q in ["fêtes et manifestations", "agenda des manifestations", "agenda événements", "événements touristiques", "manifestations culturelles",
          "agenda culturel", "Tourinsoft", "Apidae", "SIRTAQUI", "LEI tourisme", "Décibelles", "vide-greniers", "brocantes", "marchés hebdomadaires",
          "marchés de plein vent", "agenda sorties", "programme festivals", "office de tourisme événements", "agenda ville", "fête de la science"]:
    for page in (1, 2):
        try:
            r = get("https://www.data.gouv.fr/api/1/datasets/?page_size=50&page=%d&q=%s" % (page, urllib.parse.quote(q)))
        except Exception as e:
            out["datagouv"][q] = str(e)[:100]; break
        for x in r["data"]:
            if x["id"] in vus or (x.get("last_update") or "") < lim:
                continue
            vus.add(x["id"])
            res = [(rr["title"][:60], rr["format"], rr.get("filesize"), rr["url"], rr.get("last_modified", "")[:10]) for rr in x.get("resources", [])[:6]]
            out["datagouv"][x["id"]] = {"q": q, "titre": x["title"], "org": (x.get("organization") or {}).get("name"), "maj": x["last_update"][:10], "page": x["page"], "res": res}
for ds, base in [("fetes-et-manifestations", "https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets/fetes-et-manifestations@data-herault-occitanie"),
                 ("pdl-culture", "https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets/agenda-culture-de-la-region-des-pays-de-la-loire@paysdelaloire"),
                 ("jardins", "https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets/agenda-jardins-ouverts-2026@datailedefrance")]:
    try:
        d = get(base)
        out["ods"][ds] = {"champs": [f["name"] for f in d.get("fields", [])], "ex": [{k: str(v)[:160] for k, v in x.items()} for x in get(base + "/records?limit=2")["results"]]}
    except Exception as e:
        out["ods"][ds] = str(e)[:200]
json.dump(out, open("data/_sonde4.json", "w"), ensure_ascii=False, indent=1)
