"""Assemble l'application « Trucs à faire » (index.html) à partir de ses sources.

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
<title>Trucs à faire · Les sorties près de chez vous</title>
<meta name="description" content="{DESC}">
<link rel="canonical" href="{SITE}">
<link rel="icon" href="marque/icone-favicon.svg" type="image/svg+xml">
<link rel="icon" href="marque/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="marque/apple-touch-icon-180.png">
<link rel="manifest" href="manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Trucs à faire">
<meta name="mobile-web-app-capable" content="yes">
<meta property="og:type" content="website">
<meta property="og:title" content="Trucs à faire">
<meta property="og:image" content="{SITE}marque/partage-1200x630.png">
<meta property="og:site_name" content="Trucs à faire">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:description" content="{DESC}">
<script type="application/ld+json">{{"@context":"https://schema.org","@graph":[{{"@type":"WebSite","@id":"{SITE}#site","name":"Trucs à faire","url":"{SITE}","inLanguage":"fr-FR","description":"{DESC}","publisher":{{"@id":"{SITE}#editeur"}}}},{{"@type":"Organization","@id":"{SITE}#editeur","name":"Trucs à faire","alternateName":"Saryn Digital","url":"{SITE}","logo":"{SITE}marque/icone-512.png","email":"clementer@gmail.com","address":{{"@type":"PostalAddress","addressLocality":"Decize","postalCode":"58300","addressCountry":"FR"}}}}]}}</script>
<meta property="og:url" content="{SITE}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e1226" media="(prefers-color-scheme: dark)">
<script src="config.js"></script>
</head>
<body>
"""
    return tete + corps(MAPLIBRE + "maplibre-gl.js").replace("<title>Trucs à faire</title>\n", "", 1) + "\n</body>\n</html>\n"


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
