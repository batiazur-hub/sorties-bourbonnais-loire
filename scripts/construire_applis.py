"""Prépare le contenu embarqué des applis Android et iPhone (dossier app/www, non enregistré dans le dépôt).

L'appli embarque l'agenda (index.html), les pages d'information, la police, les logos et la carte :
elle s'ouvre instantanément, même sans réseau. Les sorties sont chargées en ligne depuis https://trucsafaire.fr/data/,
mises à jour chaque nuit comme sur le site : pas besoin de republier l'appli pour avoir les nouvelles sorties.
app/natif.js (rappels, partage, agenda du téléphone, liens) est ajouté à chaque page, juste après config.js.

Usage : python scripts/construire_applis.py   puis   cd app && npx cap sync
"""
import os, shutil, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(RACINE, "app", "www")
DOSSIERS = ("fonts", "vendor", "marque")
FICHIERS = ("config.js", "dlc.js", "pages.css")
BALISE = '<script src="natif.js"></script>'


def main():
    pages = [f for f in subprocess.run(["git", "ls-files", "*.html"], cwd=RACINE, capture_output=True, text=True,
                                       check=True).stdout.split() if "/" not in f]
    if "index.html" not in pages:
        sys.exit("index.html introuvable")
    shutil.rmtree(WWW, ignore_errors=True)
    os.makedirs(WWW)
    for d in DOSSIERS:
        shutil.copytree(os.path.join(RACINE, d), os.path.join(WWW, d))
    for f in FICHIERS:
        shutil.copy(os.path.join(RACINE, f), WWW)
    shutil.copy(os.path.join(RACINE, "app", "natif.js"), WWW)
    for p in pages:
        h = open(os.path.join(RACINE, p), encoding="utf-8").read()
        if '<script src="config.js"></script>' in h:
            h = h.replace('<script src="config.js"></script>', '<script src="config.js"></script>' + BALISE, 1)
        elif "</head>" in h:
            h = h.replace("</head>", BALISE + "\n</head>", 1)
        else:
            sys.exit(f"{p} : pas de </head>")
        open(os.path.join(WWW, p), "w", encoding="utf-8").write(h)
    taille = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(WWW) for f in fs)
    print(f"app/www : {len(pages)} pages, {taille // 1024} Ko")


if __name__ == "__main__":
    main()
