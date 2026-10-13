import json, urllib.request, urllib.parse, re
import gzip
def raw(u):
    b = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 dans-le-coin", "Accept-Encoding": "identity"}), timeout=180).read()
    return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b
def get(u): return json.loads(raw(u))
out = {}
P = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda"
try:
    d = get(P)
    out["oa_champs"] = [(f["name"], f.get("type")) for f in d.get("fields", [])]
    out["oa_meta"] = {k: d.get("metas", {}).get("default", {}).get(k) for k in ("title", "license", "modified", "records_count", "publisher")}
    w = urllib.parse.quote("lastdate_end >= now()")
    out["oa_a_venir"] = get(P + "/records?select=count(*)%20as%20n&where=" + w)["results"]
    out["oa_par_dep"] = get(P + "/records?select=count(*)%20as%20n&group_by=location_department&limit=120&order_by=n%20desc&where=" + w)["results"]
    out["oa_ex"] = [{k: str(v)[:220] for k, v in x.items()} for x in get(P + "/records?limit=2&where=" + w + urllib.parse.quote(' and location_department="Allier"'))["results"]]
except Exception as e:
    out["oa_err"] = str(e)[:300]

cat = {}
for q in ["agenda", "evenements", "événements", "manifestations", "sorties"]:
    try:
        r = get("https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets?limit=100&where=" + urllib.parse.quote(f'search("{q}")'))
        cat[q] = [(x["dataset_id"], x["metas"]["default"].get("title"), x["metas"]["default"].get("publisher"), x["metas"]["default"].get("records_count"), x["metas"]["default"].get("modified")) for x in r["results"]]
    except Exception as e:
        cat[q] = str(e)[:200]
out["ods_catalogue"] = cat
json.dump(out, open("data/_sonde2.json", "w"), ensure_ascii=False, indent=1)
