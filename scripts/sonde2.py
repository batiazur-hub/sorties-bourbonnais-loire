import json, urllib.request, urllib.parse, re
def raw(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 dans-le-coin"}), timeout=120).read()
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
M = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/marches-decouverts"
try:
    out["marches_champs"] = [(f["name"], f.get("type"), f.get("label")) for f in get(M).get("fields", [])]
    out["marches_ex"] = [{k: str(v)[:200] for k, v in x.items()} for x in get(M + "/records?limit=3")["results"]]
except Exception as e:
    out["marches_err"] = str(e)[:300]
pal = {}
for u in ["https://www.lepal.com/decouvrir/actualites/actualites-de-la-fondation-le-pal-nature",
          "https://www.lepal.com/fondation-le-pal-nature", "https://www.lepal.com/decouvrir/fondation-le-pal-nature",
          "https://en.lepal.com/discover/news/news-from-the-le-pal-nature-foundation/foundation-day-2026",
          "https://www.lepal.com/agenda", "https://www.lepal.com/decouvrir/actualites"]:
    try:
        h = raw(u).decode("utf-8", "ignore")
        txt = re.sub(r"<script.*?</script>|<style.*?</style>", " ", h, flags=re.S)
        links = sorted(set(re.findall(r'href="([^"]*fondation[^"]*)"', h)))[:60]
        pal[u] = {"titre": (re.findall(r"<title>(.*?)</title>", h, re.S) or [""])[0].strip()[:150],
                  "texte": re.sub(r"\s+", " ", re.sub("<[^>]+>", " ", txt))[:3500], "liens": links}
    except Exception as e:
        pal[u] = str(e)[:150]
out["lepal"] = pal
json.dump(out, open("data/_sonde2.json", "w"), ensure_ascii=False, indent=1)
