"""Assemble l'application « Dans le coin » (index.html) à partir de ses sources.

  src/app.html                    gabarit de l'application (HTML, CSS, JavaScript)
  src/departements-contours.json  contours simplifiés des départements (carte de secours)
  src/communes-zone.json          communes de la zone historique (recherche hors ligne)
  src/evenements-secours.json     échantillon de sorties affiché si les données en ligne sont injoignables
  vendor/maplibre-gl-4.7.1/       bibliothèque de carte, hébergée avec le site

Usage :
  python scripts/construire_app.py                   écrit index.html (site public)
  python scripts/construire_app.py --verifier        vérifie que index.html est à jour (contrôle qualité)
  python scripts/construire_app.py --artefact F.html écrit aussi la version autonome pour l'aperçu Claude
"""
import os, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://batiazur-hub.github.io/sorties-bourbonnais-loire/"
MAPLIBRE = "vendor/maplibre-gl-4.7.1/"
MAPLIBRE_CDN = "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js"
DESC = ("Brocantes, fêtes, marchés, concerts, expos et lieux à visiter près de chez vous : "
        "agenda des sorties partout en France, sur carte et calendrier, mis à jour chaque nuit.")
ICONE = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23f07d00' "
         "d='M12 2.5c-4 0-7.3 3.2-7.3 7.2 0 5.3 6.4 11.4 6.7 11.7.3.3.9.3 1.2 0 .3-.3 6.7-6.4 6.7-11.7 0-4-3.3-7.2-7.3-7.2zm0 "
         "9.9a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z'/%3E%3C/svg%3E")


def lire(chemin):
    with open(os.path.join(RACINE, chemin), encoding="utf-8") as f:
        return f.read()


def corps(mapjs):
    h = lire("src/app.html")
    for cle, val in (("%%MAPCSS%%", lire(MAPLIBRE + "maplibre-gl.css")), ("%%MAPJS%%", mapjs),
                     ("%%EVENTS%%", lire("src/evenements-secours.json")), ("%%GEO%%", lire("src/departements-contours.json")),
                     ("%%COMMUNES%%", lire("src/communes-zone.json"))):
        if h.count(cle) != 1:
            sys.exit(f"Gabarit : {cle} devrait apparaître une fois")
        h = h.replace(cle, val)
    return h


def site():
    tete = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Dans le coin · Que faire autour de chez vous ?</title>
<meta name="description" content="{DESC}">
<link rel="canonical" href="{SITE}">
<link rel="icon" href="{ICONE}">
<meta property="og:type" content="website">
<meta property="og:title" content="Dans le coin">
<meta property="og:description" content="{DESC}">
<meta property="og:url" content="{SITE}">
<meta name="theme-color" content="#ffffff">
<script src="config.js"></script>
</head>
<body>
"""
    return tete + corps(MAPLIBRE + "maplibre-gl.js").replace("<title>Dans le coin</title>\n", "", 1) + "\n</body>\n</html>\n"


def main():
    arg = sys.argv[1:]
    html = site()
    cible = os.path.join(RACINE, "index.html")
    if "--verifier" in arg:
        if lire("index.html") != html:
            sys.exit("index.html n'est pas à jour : lancez python scripts/construire_app.py")
        print("index.html est à jour.")
        return
    with open(cible, "w", encoding="utf-8") as f:
        f.write(html)
    print("index.html :", len(html) // 1024, "Ko")
    if "--artefact" in arg:
        chemin = arg[arg.index("--artefact") + 1]
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(corps(MAPLIBRE_CDN))
        print("artefact :", chemin)


if __name__ == "__main__":
    main()
