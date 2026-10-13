"""Télécharge l'export DATAtourisme « fêtes et manifestations » et enregistre sa structure (en-tête + exemples)."""
import csv, io, json, sys, urllib.request
API = "https://www.data.gouv.fr/api/1/datasets/5b598be088ee387c0c353714/"
meta = json.load(urllib.request.urlopen(API))
res = [r for r in meta["resources"] if r["title"].strip() == "datatourisme-fma.csv"][0]
raw = urllib.request.urlopen(res["url"]).read().decode("utf-8-sig")
rows = list(csv.reader(io.StringIO(raw)))
out = {"url": res["url"], "lignes": len(rows) - 1, "entete": rows[0], "exemples": rows[1:13]}
# exemples dans l'Allier si possible
allier = [r for r in rows[1:] if any(c.startswith("03") and len(c) == 5 and c.isdigit() for c in r)][:8]
out["exemples_allier"] = allier
json.dump(out, open("data/_structure_fma.json", "w"), ensure_ascii=False, indent=1)
print(out["lignes"], out["entete"])
