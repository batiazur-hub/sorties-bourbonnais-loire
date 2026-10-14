"""Contrôle qualité avant publication. Code de sortie 1 si un problème bloquant est trouvé.

  python scripts/verifier.py            tout vérifier
  python scripts/verifier.py --donnees  données seulement (lancé par les mises à jour automatiques avant d'enregistrer)
  python scripts/verifier.py --site     pages, liens, fichiers générés à jour

Données : JSON valides, champs obligatoires, identifiants uniques, dates, positions dans leur département,
index cohérent avec les fichiers, et pas d'effondrement par rapport à la version publiée (source en panne).
Site : liens internes, plan du site, pages générées à jour, aucun secret dans les fichiers publiés.
"""
import glob, json, os, re, subprocess, sys, tempfile, filecmp, shutil

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RACINE, "scripts"))
from qualite_donnees import zones, km  # noqa: E402

BLOQUANTS, AVERTISSEMENTS = [], []
def ko(msg): BLOQUANTS.append(msg)
def avert(msg): AVERTISSEMENTS.append(msg)
def chemin(*p): return os.path.join(RACINE, *p)
def charger(f):
    with open(f, encoding="utf-8") as h:
        return json.load(h)

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TYPES_SORTIES = {"brocante", "fete", "spectacle", "culture", "famille", "sport", "pal"}
TYPES_LIEUX = {"office", "musee", "patrimoine", "nature", "loisirs"}


def publie(fichier):
    """Version du fichier dans le dernier commit (None si absente ou si git n'est pas disponible)."""
    try:
        return json.loads(subprocess.run(["git", "show", "HEAD:" + fichier], cwd=RACINE, capture_output=True, check=True).stdout)
    except Exception:
        return None


def donnees():
    try:
        zd, _ = zones(charger(chemin("data/communes-fr.json")))
    except Exception as e:
        ko(f"data/communes-fr.json illisible : {e}"); zd = {}
    ids, total = set(), {}
    for genre, champs, types, cle_type in (("dep", ("id", "t", "cat", "z", "w", "s", "lat", "lon"), TYPES_SORTIES, "cat"),
                                           ("lieux", ("id", "t", "k", "z", "w", "lat", "lon"), TYPES_LIEUX, "k")):
        n = 0
        for f in sorted(glob.glob(chemin("data", genre, "*.json"))):
            nom = os.path.basename(f)[:-5]
            if nom == "index":
                continue
            try:
                L = charger(f)
            except Exception as e:
                ko(f"{genre}/{nom}.json : JSON invalide ({e})"); continue
            if not isinstance(L, list) or not L:
                ko(f"{genre}/{nom}.json : liste vide ou format inattendu"); continue
            n += len(L); hors = 0
            for x in L:
                manque = [c for c in champs if x.get(c) in (None, "")]
                if manque:
                    ko(f"{genre}/{nom}.json : fiche {x.get('id')} sans {', '.join(manque)}"); continue
                if x[cle_type] not in types:
                    ko(f"{genre}/{nom}.json : type inconnu « {x[cle_type]} » ({x['id']})")
                if x["z"] != nom:
                    ko(f"{genre}/{nom}.json : fiche {x['id']} rangée dans le mauvais département ({x['z']})")
                if x["id"] in ids:
                    ko(f"identifiant en double : {x['id']}")
                ids.add(x["id"])
                if genre == "dep" and (not DATE.match(x["s"]) or (x.get("e") and (not DATE.match(x["e"]) or x["e"] < x["s"]))):
                    ko(f"dep/{nom}.json : dates invalides pour {x['id']} ({x['s']} → {x.get('e')})")
                if "|" in x["w"] or "#" in x["w"]:
                    ko(f"{genre}/{nom}.json : commune mal découpée « {x['w'][:40]} »")
                z = zd.get(nom)
                if z and km(z[0], z[1], x["lat"], x["lon"]) > z[2]:
                    hors += 1
            if hors:
                ko(f"{genre}/{nom}.json : {hors} fiche(s) positionnée(s) hors du département")
        total[genre] = n
    # index des départements cohérent avec les fichiers
    try:
        D = charger(chemin("data/departements.json"))
        fichiers = {os.path.basename(f)[:-5] for f in glob.glob(chemin("data/dep/*.json"))}
        codes = {d["code"] for d in D["departements"]}
        if codes != fichiers:
            ko(f"departements.json ne correspond pas aux fichiers : {sorted(codes ^ fichiers)}")
        ecart = abs(sum(d["n"] for d in D["departements"]) - total["dep"])
        if ecart > 50:
            avert(f"departements.json : total annoncé différent des fichiers ({ecart} d'écart)")
    except Exception as e:
        ko(f"data/departements.json illisible : {e}")
    # garde-fou : une source en panne ne doit pas vider le site
    for genre, f, cle in (("dep", "data/departements.json", lambda j: sum(d["n"] for d in j["departements"])),
                          ("lieux", "data/lieux/index.json", lambda j: j["total"])):
        avant = publie(f)
        if avant:
            try:
                a = cle(avant)
                if a and total.get(genre, 0) < 0.6 * a:
                    ko(f"{genre} : {total.get(genre, 0)} fiches contre {a} dans la version publiée (chute de plus de 40 %)")
            except Exception:
                pass
    print(f"Données : {total.get('dep', 0)} sorties, {total.get('lieux', 0)} lieux, {len(ids)} identifiants uniques.")


SECRETS = re.compile(r"(ADMIN_TOKEN\s*[:=]\s*['\"][^'\"]{6,}|OPENAGENDA_KEY\s*[:=]\s*['\"][^'\"]{6,}|ghp_[A-Za-z0-9]{20,}|"
                     r"github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|dlc_[0-9a-f]{36}|-----BEGIN [A-Z ]*PRIVATE KEY)")


def site():
    pages = sorted(glob.glob(chemin("*.html")))
    for p in pages:
        s = open(p, encoding="utf-8").read()
        nom = os.path.basename(p)
        for u in re.findall(r'\b(?:href|src)="([^"]+)"', s):
            if re.match(r"^(https?:|mailto:|tel:|data:|javascript:|#|\{)", u) or "+" in u:
                continue
            f = u.split("#")[0].split("?")[0]
            if f and not os.path.exists(chemin(f)):
                ko(f"{nom} : lien cassé vers {u}")
        if not re.search(r'<html lang="fr"', s):
            ko(f"{nom} : langue de la page absente")
        if "<title>" not in s:
            ko(f"{nom} : titre absent")
    for u in re.findall(r"<loc>([^<]+)</loc>", open(chemin("sitemap.xml"), encoding="utf-8").read()):
        f = u.split("/sorties-bourbonnais-loire/", 1)[-1] or "index.html"
        if not os.path.exists(chemin(f)):
            ko(f"sitemap.xml : page absente {f}")
    # fichiers publiés sans secret
    for f in subprocess.run(["git", "ls-files"], cwd=RACINE, capture_output=True, text=True).stdout.split():
        if f.startswith("data/") or not f.endswith((".html", ".js", ".mjs", ".json", ".py", ".yml", ".toml", ".md", ".css")):
            continue
        m = SECRETS.search(open(chemin(f), encoding="utf-8", errors="ignore").read())
        if m:
            ko(f"{f} : secret possible ({m.group(0)[:24]}…)")
    # fichiers générés à jour
    r = subprocess.run([sys.executable, chemin("scripts/construire_app.py"), "--verifier"], capture_output=True, text=True)
    if r.returncode:
        ko((r.stderr or r.stdout).strip())
    tmp = tempfile.mkdtemp()
    try:
        subprocess.run([sys.executable, chemin("scripts/pages.py")], env=dict(os.environ, PAGES_SORTIE=tmp), check=True, capture_output=True)
        for f in glob.glob(os.path.join(tmp, "*.html")):
            if not filecmp.cmp(f, chemin(os.path.basename(f)), shallow=False):
                ko(f"{os.path.basename(f)} n'est pas à jour : lancez python scripts/pages.py")
    finally:
        shutil.rmtree(tmp)
    print(f"Site : {len(pages)} pages contrôlées.")


def main():
    a = sys.argv[1:]
    if not a or "--donnees" in a:
        donnees()
    if not a or "--site" in a:
        site()
    for m in AVERTISSEMENTS:
        print("  avertissement :", m)
    for m in BLOQUANTS[:60]:
        print("  BLOQUANT :", m)
    if BLOQUANTS:
        print(f"{len(BLOQUANTS)} problème(s) bloquant(s).")
        sys.exit(1)
    print("Contrôle qualité : tout est en ordre.")


if __name__ == "__main__":
    main()
