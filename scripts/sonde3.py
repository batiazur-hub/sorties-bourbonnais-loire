import json, io, csv, gzip, urllib.request
def get(u):
    d = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "dans-le-coin", "Accept-Encoding": "identity"}), timeout=300).read()
    return gzip.decompress(d) if d[:2] == b"\x1f\x8b" else d
S = {
 "62_pdct_csv": "https://www.data.gouv.fr/api/1/datasets/r/51c8060e-994c-401b-acd8-515a8128df1e",
 "63_clermont_json": "https://www.data.gouv.fr/api/1/datasets/r/ad56f730-1383-4507-8f10-efea7e26b814",
 "63_clermont_ods": "https://opendata.clermontmetropole.eu/api/explore/v2.1/catalog/datasets/agenda-vcf/exports/json",
 "38_isere_json": "https://www.data.gouv.fr/api/1/datasets/r/e7f4042b-2762-49e8-ad20-5fab9b548ce7",
 "06_nice_json": "https://www.data.gouv.fr/api/1/datasets/r/4d57cbed-521f-44be-a2e4-da313cddd089",
 "92_gpso_json": "https://www.data.gouv.fr/api/1/datasets/r/f3e3c20e-4f57-4647-8185-83ade400b490",
 "idf_nature_json": "https://www.data.gouv.fr/api/1/datasets/r/2ad8eb37-e7cc-4b7e-9a46-70a6a83120c1",
 "occ_json": "https://www.data.gouv.fr/api/1/datasets/r/a83bc1c2-d259-4aa3-bd8f-17fa4c9cb137",
 "corse_oa": "https://www.datacorsica.corsica/api/explore/v2.1/catalog/datasets/public-events-openagenda/records?limit=2",
 "41_catalogue": "https://data.departement41.fr/api/explore/v2.1/catalog/datasets?limit=20&where=search(%22manifestation%22)",
 "974_catalogue": "https://data.regionreunion.com/api/explore/v2.1/catalog/datasets?limit=20&where=search(%22agenda%22)",
}
out = {}
for k, u in S.items():
    try:
        raw = get(u)
        if k.endswith("csv"):
            txt = raw.decode("utf-8-sig", "replace")
            dl = ";" if txt[:2000].count(";") > txt[:2000].count(",") else ","
            rows = list(csv.DictReader(io.StringIO(txt), delimiter=dl))
            out[k] = {"n": len(rows), "sep": dl, "cles": list(rows[0].keys()), "ex": {a: (b or "")[:160] for a, b in rows[-1].items()}}
        else:
            j = json.loads(raw)
            if isinstance(j, dict):
                lst = j.get("results") or j.get("data") or j.get("events") or j.get("features") or j
            else:
                lst = j
            if isinstance(lst, dict):
                out[k] = {"dict_cles": list(lst.keys())[:40], "apercu": json.dumps(lst, ensure_ascii=False)[:2500]}
            else:
                first = lst[0] if lst else {}
                out[k] = {"n": len(lst), "cles": list(first.keys()) if isinstance(first, dict) else str(type(first)), "ex": json.dumps(first, ensure_ascii=False)[:3000]}
    except Exception as e:
        out[k] = "ERREUR " + str(e)[:200]
json.dump(out, open("data/_sonde3.json", "w"), ensure_ascii=False, indent=1)
