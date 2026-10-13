"""Sonde : quelles sources ouvertes et durables pour les sorties à Paris ?"""
import json, urllib.request, urllib.parse, collections
def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "dans-le-coin"}), timeout=120).read())
out = {}
B = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/"
try:
    d = get(B + "que-faire-a-paris-")
    out["qfap_champs"] = [(f["name"], f.get("type"), f.get("label")) for f in d.get("fields", [])]
    r = get(B + "que-faire-a-paris-/records?limit=3&order_by=date_start%20desc")
    out["qfap_total"] = r.get("total_count")
    out["qfap_exemples"] = [{k: (str(v)[:200] if v is not None else None) for k, v in x.items()} for x in r["results"]]
    for fld in ("qfap_tags", "tags", "category", "price_type", "address_zipcode", "access_type"):
        try:
            g = get(B + f"que-faire-a-paris-/records?select=count(*)%20as%20n&group_by={fld}&limit=40&order_by=n%20desc")
            out["qfap_par_" + fld] = g["results"]
        except Exception as e:
            out["qfap_par_" + fld] = str(e)[:120]
    try:
        f = get(B + "que-faire-a-paris-/records?select=count(*)%20as%20n&where=date_end%20%3E%3D%20now()")
        out["qfap_a_venir"] = f["results"]
    except Exception as e:
        out["qfap_a_venir"] = str(e)[:150]
except Exception as e:
    out["qfap_erreur"] = str(e)[:300]
cat = {}
for q in ["brocante", "vide-grenier", "marché", "événement", "agenda", "fête", "concert", "exposition", "sport", "bibliothèque"]:
    try:
        r = get("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets?limit=12&where=" + urllib.parse.quote(f'search("{q}")'))
        cat[q] = [(x["dataset_id"], x["metas"]["default"].get("title"), x["metas"]["default"].get("modified"), x["metas"]["default"].get("records_count")) for x in r["results"]]
    except Exception as e:
        cat[q] = str(e)[:150]
out["catalogue_paris"] = cat
dg = {}
for q in ["agenda événements Paris", "vide-greniers Paris", "brocantes Île-de-France", "événements Île-de-France"]:
    try:
        r = get("https://www.data.gouv.fr/api/1/datasets/?page_size=8&q=" + urllib.parse.quote(q))
        dg[q] = [(x["title"], x["organization"]["name"] if x.get("organization") else None, x["last_update"], x["page"]) for x in r["data"]]
    except Exception as e:
        dg[q] = str(e)[:150]
out["datagouv"] = dg
json.dump(out, open("data/_sonde_paris.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: (v if k.startswith("qfap_t") else "ok") for k, v in out.items()}, ensure_ascii=False)[:2000])
