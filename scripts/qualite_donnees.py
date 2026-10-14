"""Contrôles communs appliqués aux sorties et aux lieux avant publication.

- nom de commune nettoyé (certaines fiches DATAtourisme listent plusieurs communes : « Nom|CP#Autre ») ;
- position vérifiée : un point situé hors de son département est replacé au centre de sa commune, ou écarté ;
- date de fin antérieure au début retirée ;
- identifiants rendus uniques (une même fiche peut couvrir plusieurs dates ou plusieurs communes).
"""
import math, re, unicodedata


def norm(s):
    return unicodedata.normalize("NFD", (s or "").lower()).encode("ascii", "ignore").decode().strip()


def km(a, b, c, d):
    x = (d - b) * math.cos(math.radians((a + c) / 2)) * 111.32
    y = (c - a) * 110.57
    return math.hypot(x, y)


def commune_propre(w):
    """« Jugon-les-Lacs - Commune nouvelle|22270#Jugon-les-Lacs » → « Jugon-les-Lacs - Commune nouvelle »."""
    w = (w or "").split("|", 1)[0]
    if "#" in w:
        w = w.rsplit("#", 1)[-1]
    return re.sub(r"\s+", " ", w).strip()


def zones(communes):
    """communes : itérable de (nom, dep, lat, lon). Renvoie {dep: (lat, lon, rayon_km)} et {(nom normalisé, dep): (lat, lon)}."""
    par_dep, centres = {}, {}
    for nom, dep, la, lo in communes:
        par_dep.setdefault(dep, []).append((la, lo))
        centres.setdefault((norm(nom), dep), (la, lo))
    z = {}
    for dep, pts in par_dep.items():
        la = sum(p[0] for p in pts) / len(pts)
        lo = sum(p[1] for p in pts) / len(pts)
        z[dep] = (la, lo, max(km(la, lo, p[0], p[1]) for p in pts) + 25)
    return z, centres


def assainir(par_dep, zones_dep, centres, ecartes):
    """Corrige en place {dep: [fiches]} (champs id, w, lat, lon, z ; s facultatif). Compte les corrections dans ecartes."""
    vus = set()
    for dep in list(par_dep):
        garde = []
        for x in par_dep[dep]:
            w = commune_propre(x.get("w"))
            if w != x.get("w"):
                x["w"] = w
                ecartes["commune nettoyée"] += 1
            if x.get("e") and x.get("s") and x["e"] < x["s"]:  # fin avant le début : saisie erronée, on garde le jour de début
                del x["e"]
                ecartes["date de fin incohérente retirée"] += 1
            zd = zones_dep.get(dep)
            if zd and km(zd[0], zd[1], x["lat"], x["lon"]) > zd[2]:
                c = centres.get((norm(w), dep))
                if not c:
                    ecartes["position hors du département"] += 1
                    continue
                x["lat"], x["lon"] = round(c[0], 5), round(c[1], 5)
                ecartes["position replacée au centre de la commune"] += 1
            base = x["id"]
            if base in vus:
                x["id"] = base + "-" + x.get("s", "") if x.get("s") else base
                n = 2
                while x["id"] in vus:
                    x["id"] = f"{base}-{n}"
                    n += 1
                ecartes["identifiant rendu unique"] += 1
            vus.add(x["id"])
            garde.append(x)
        par_dep[dep] = garde
    return par_dep
