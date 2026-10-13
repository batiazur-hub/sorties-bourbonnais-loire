import json, urllib.request, urllib.parse
def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "dans-le-coin"}), timeout=180).read())
out = {}
def safe(k, f):
    try: out[k] = f()
    except Exception as e: out[k] = "ERREUR " + str(e)[:200]
P = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/"
safe("marches_champs", lambda: [(f["name"], f.get("type"), f.get("label")) for f in get(P + "marches-decouverts")["fields"]])
safe("marches_ex", lambda: get(P + "marches-decouverts/records?limit=4")["results"])
O = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda"
safe("oa_champs", lambda: [(f["name"], f.get("type"), f.get("label")) for f in get(O)["fields"]])
safe("oa_meta", lambda: {k: get(O)["metas"]["default"].get(k) for k in ("title", "modified", "records_count", "license", "publisher")})
safe("oa_avenir", lambda: get(O + "/records?select=count(*)%20as%20n&where=" + urllib.parse.quote("lastdate_end >= now()"))["results"])
safe("oa_ex", lambda: get(O + "/records?limit=2&where=" + urllib.parse.quote("lastdate_end >= now()"))["results"])
safe("oa_par_dep", lambda: get(O + "/records?select=count(*)%20as%20n&group_by=location_department&limit=120&order_by=n%20desc&where=" + urllib.parse.quote("lastdate_end >= now() and location_countrycode='FR'"))["results"])
cat = {}
for q in ["agenda", "événements", "manifestations", "brocantes", "vide-greniers", "marchés"]:
    try:
        r = get("https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets?limit=60&where=" + urllib.parse.quote(f'search("{q}")'))
        cat[q] = [(x["dataset_id"], x["metas"]["default"].get("title"), x["metas"]["default"].get("publisher"), x["metas"]["default"].get("modified"), x["metas"]["default"].get("records_count")) for x in r["results"]]
    except Exception as e:
        cat[q] = "ERREUR " + str(e)[:200]
out["federe"] = cat
json.dump(out, open("data/_sonde2.json", "w"), ensure_ascii=False, indent=1, default=str)
