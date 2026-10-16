"""Agent de sécurité de « Trucs à faire » : vérifie que rien ne peut être piraté ni lu par le public.

Usage :
  python scripts/securite.py              contrôles du dépôt (secrets, fichiers publiés, code du site, serveur, GitHub Actions, données)
  python scripts/securite.py --en-ligne   contrôles du site et du serveur en ligne (pages internes cachées, espace éditeur fermé,
                                          CORS, en-têtes de sécurité, aucun lien piégé dans l'agenda public)

Code de sortie 1 si un problème CRITIQUE ou ÉLEVÉ est trouvé (le contrôle échoue et GitHub prévient par e-mail).
Lancé automatiquement par .github/workflows/securite.yml à chaque modification et chaque lundi.
"""
import json, os, re, subprocess, sys, urllib.request, urllib.error

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.environ.get("SITE_URL", "https://trucsafaire.fr/").rstrip("/") + "/"
API = os.environ.get("API_URL", "https://api.trucsafaire.fr").rstrip("/")
GRAVES = {"CRITIQUE", "ÉLEVÉ"}
CONSTATS = []


def constat(niveau, quoi, detail=""):
    CONSTATS.append((niveau, quoi, detail))


def lire(f):
    with open(os.path.join(RACINE, f), encoding="utf-8", errors="ignore") as h:
        return h.read()


def fichiers():
    return subprocess.run(["git", "ls-files"], cwd=RACINE, capture_output=True, text=True, check=True).stdout.split()


# Ce que publier.yml envoie sur GitHub Pages (même règle que l'étape « Assembler le site »)
EXCLUS_PUBLICATION = re.compile(r"^(\.github/|scripts/|tests/|worker/|docs/|README\.md$|\.gitignore$|\.gitleaks\.toml$)")

SECRETS = [
    ("clé Brevo", r"xkeysib-[0-9a-f]{20,}"),
    ("jeton GitHub", r"gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}"),
    ("clé AWS", r"AKIA[0-9A-Z]{16}"),
    ("clé Google", r"AIza[0-9A-Za-z_\-]{35}"),
    ("clé Stripe", r"[sr]k_live_[0-9A-Za-z]{20,}"),
    ("clé privée", r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY"),
    ("clé API Trucs à faire", r"dlc_[0-9a-f]{36}"),
    ("jeton Slack", r"xox[abpr]-[0-9A-Za-z-]{20,}"),
    ("secret en clair", r"(?i)(?:ADMIN_TOKEN|SIGNATURE_KEY|BREVO_KEY|CLOUDFLARE_API_TOKEN|OPENAGENDA_KEY|api[_-]?secret|password|mot_de_passe)"
                        r"\s*[:=]\s*[\"'][A-Za-z0-9_\-+/=]{12,}[\"']"),
]
FICHIERS_INTERDITS = re.compile(r"(^|/)(\.env(\..*)?|\.dev\.vars|.*\.pem|.*\.key|.*\.p12|id_rsa.*|.*\.sqlite3?|.*\.db|.*\.bak|.*\.zip|"
                                r"credentials.*\.json|service-account.*\.json|\.npmrc|\.wrangler/.*)$", re.I)


def controle_secrets(liste):
    soi = {"scripts/securite.py", "scripts/verifier.py", ".gitleaks.toml"}
    for f in liste:
        if FICHIERS_INTERDITS.search(f):
            constat("CRITIQUE", "fichier sensible enregistré dans le dépôt public", f)
        if f in soi or f.startswith(("data/", "vendor/")) or re.search(r"\.(png|jpe?g|webp|ico|woff2?)$", f):
            continue
        texte = lire(f)
        for nom, motif in SECRETS:
            for m in re.finditer(motif, texte):
                if re.search(r"VOTRE_CLE|…|test|exemple|example|xxx|changeme", m.group(0), re.I):
                    continue
                ligne = texte.count("\n", 0, m.start()) + 1
                constat("CRITIQUE", f"{nom} visible dans le dépôt public", f"{f}:{ligne}")


def controle_publication(liste):
    publies = [f for f in liste if not EXCLUS_PUBLICATION.match(f)]
    for f in publies:
        if re.search(r"(^|/)(LISEZMOI|README|registre|notes?|brouillon)[^/]*\.md$", f, re.I):
            constat("MOYEN", "document interne publié sur le site", f)
    for f in ("worker/worker.js", "docs/rgpd/registre-des-traitements.md", "scripts/construire.py"):
        if f in publies:
            constat("ÉLEVÉ", "fichier interne publié sur le site", f)


# Code du site : endroits où une donnée venue de l'extérieur pourrait devenir du code
LIEN_BRUT = re.compile(r"\.(href|action|formAction)\s*=\s*([a-zA-Z_$][\w$]*)\.(u|b|url|site|lien|img|page)\b(?!\s*\()")


def controle_front():
    for f in ("src/app.html", "dlc.js", "cles.html", "kit.html", "integrer.html", "sw.js"):
        if not os.path.exists(os.path.join(RACINE, f)):
            continue
        t = lire(f)
        for m in LIEN_BRUT.finditer(t):
            avant = t[max(0, m.start() - 160):m.start()]
            if "okUrl(" in avant or "https?:" in avant:
                continue
            ligne = t.count("\n", 0, m.start()) + 1
            constat("ÉLEVÉ", "lien affecté sans vérifier qu'il commence par http(s) (risque « javascript: »)", f"{f}:{ligne} {m.group(0)}")
        for motif, nom in ((r"\beval\s*\(", "eval()"), (r"new\s+Function\s*\(", "new Function()"), (r"document\.write\s*\(", "document.write()"),
                           (r"insertAdjacentHTML\s*\(\s*['\"]\w+['\"]\s*,\s*[a-z]\.(t|d|lieu|w|nom|bio)\b", "insertAdjacentHTML avec une donnée")):
            for m in re.finditer(motif, t):
                constat("MOYEN", f"{nom} dans le code du site", f"{f}:{t.count(chr(10), 0, m.start()) + 1}")
        # le code éditeur ne doit jamais être gardé durablement
        if re.search(r"localStorage\.setItem\(\s*[\"'](sbl-tok|dlc-tok)", t):
            constat("ÉLEVÉ", "code éditeur gardé dans localStorage (survit à la fermeture du navigateur)", f)


def controle_serveur():
    w, c, toml = lire("worker/worker.js"), lire("worker/commun.js"), lire("worker/wrangler.toml")
    if re.search(r"^\s*workers_dev\s*=\s*true", toml, re.M):
        constat("MOYEN", "serveur aussi joignable sur *.workers.dev (contourne les règles Cloudflare du domaine)", "worker/wrangler.toml")
    if "securiser(" not in w:
        constat("ÉLEVÉ", "réponses du serveur sans en-têtes de sécurité (securiser)", "worker/worker.js")
    if "sortiePropre(" not in w:
        constat("ÉLEVÉ", "/admin/publish enregistre l'objet reçu sans le filtrer", "worker/worker.js")
    for champ in ("u", "b"):
        if not re.search(rf"\b{champ}:\s*lienSur\(b\.{champ}\)", w):
            constat("ÉLEVÉ", f"/propose : le lien « {champ} » n'est pas filtré (http/https)", "worker/worker.js")
    if not re.search(r"egal\(tok,\s*env\.ADMIN_TOKEN\)", w):
        constat("ÉLEVÉ", "code éditeur comparé sans comparaison à durée constante", "worker/worker.js")
    if re.search(r"console\.(log|info)\([^)]*(tok|jeton|session|BREVO_KEY|ADMIN_TOKEN|email)", w + c + lire("worker/comptes.js"), re.I):
        constat("ÉLEVÉ", "un secret ou une adresse e-mail est écrit dans les journaux du serveur", "worker/")
    if re.search(r"Access-Control-Allow-Origin\"\s*:\s*\"\*\"[^\n]*Authorization", w):
        constat("ÉLEVÉ", "CORS ouvert à tous avec l'en-tête Authorization", "worker/worker.js")
    for nom in ("ADMIN_TOKEN", "BREVO_KEY", "SIGNATURE_KEY"):
        if re.search(rf"^\s*{nom}\s*=", toml, re.M):
            constat("CRITIQUE", f"{nom} écrit en clair dans wrangler.toml (doit être un secret Cloudflare)", "worker/wrangler.toml")


def controle_actions(liste):
    for f in [x for x in liste if x.startswith(".github/workflows/")]:
        t = lire(f)
        if "pull_request_target" in t:
            constat("ÉLEVÉ", "pull_request_target : du code extérieur peut tourner avec les secrets", f)
        if re.search(r"\$\{\{\s*github\.(event\.(issue|pull_request|comment|head_commit|review)[^}]*\.(title|body|message|name)|head_ref)", t):
            constat("ÉLEVÉ", "texte fourni par un tiers injecté dans une commande (injection de script)", f)
        if not re.search(r"^permissions:", t, re.M):
            constat("MOYEN", "permissions du jeton GitHub non limitées", f)
        if re.search(r"npx\s+(--yes\s+)?wrangler@\d+\s", t):
            constat("FAIBLE", "version de wrangler non figée (chaîne d'approvisionnement)", f)


def controle_donnees(liste):
    piege = re.compile(r"javascript:|<script|onerror\s*=|onload\s*=|<iframe", re.I)
    sans_http = {}
    for f in [x for x in liste if x.startswith("data/") and x.endswith(".json")] + ["src/evenements-secours.json"]:
        try:
            d = json.loads(lire(f))
        except ValueError:
            continue
        lignes = d if isinstance(d, list) else []
        for e in lignes:
            if not isinstance(e, dict):
                continue
            for k in ("u", "b", "img"):
                v = str(e.get(k) or "").strip()
                if re.match(r"(?i)(javascript|data|vbscript|file):", v):
                    constat("CRITIQUE", f"lien piégé dans les données publiées ({k})", f"{f} · {e.get('id')}")
                elif v and not re.match(r"^https?://", v):
                    sans_http[f] = sans_http.get(f, 0) + 1
            for k in ("t", "d", "lieu", "w", "u", "b", "tel", "a", "oh", "l", "src"):
                if piege.search(str(e.get(k) or "")):
                    constat("ÉLEVÉ", "code HTML/JavaScript dans les données publiées", f"{f} · {e.get('id')} · {k}")
    for f, n in sans_http.items():  # sans danger (le site les ignore) mais liens perdus pour les visiteurs
        constat("FAIBLE", f"{n} lien(s) sans http(s):// dans les données (non affichés par le site)", f)


# ---------- Contrôles en ligne ----------
def requete(url, methode="GET", entetes=None, corps=None):
    r = urllib.request.Request(url, method=methode, headers=dict({"User-Agent": "TrucsAFaire-Securite/1.0"}, **(entetes or {})),
                               data=json.dumps(corps).encode() if corps is not None else None)
    try:
        with urllib.request.urlopen(r, timeout=20) as rep:
            return rep.status, dict(rep.headers), rep.read(3_000_000)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read(200_000)
    except Exception as e:  # réseau
        return 0, {}, str(e).encode()


def en_ligne():
    # 1. fichiers internes jamais servis par le site
    for chemin in ("worker/worker.js", "worker/wrangler.toml", "docs/rgpd/registre-des-traitements.md", "scripts/construire.py",
                   "tests/worker.test.mjs", ".github/workflows/serveur.yml", ".git/config", ".env", "README.md"):
        s, _, _ = requete(SITE + chemin)
        if s == 200:
            constat("ÉLEVÉ", "fichier interne lisible sur le site public", SITE + chemin)
    s, h, corps = requete(SITE)
    if s != 200:
        constat("MOYEN", "site injoignable", f"{SITE} → {s}")
    # 2. espace éditeur et comptes fermés sans code
    for chemin, entetes in (("/admin/list", {}), ("/admin/cles", {}), ("/admin/list", {"Authorization": "Bearer faux-code"}),
                            ("/compte", {}), ("/compte/export", {"Authorization": "Bearer " + "0" * 64})):
        s, _, _ = requete(API + chemin, entetes=entetes)
        if s not in (401, 429):
            constat("CRITIQUE", "espace protégé accessible sans code valide", f"{API}{chemin} → {s}")
    s, _, _ = requete(API + "/v1/sorties?dep=03")
    if s != 401:
        constat("ÉLEVÉ", "API accessible sans clé", f"/v1/sorties → {s}")
    # 3. CORS : un site pirate ne doit pas pouvoir lire les réponses avec la session d'un visiteur
    s, h, corps = requete(API + "/agenda", entetes={"Origin": "https://pirate.example"})
    acao = {k.lower(): v for k, v in h.items()}.get("access-control-allow-origin", "")
    if acao in ("https://pirate.example", "*"):
        constat("ÉLEVÉ", "CORS : un site inconnu est autorisé", f"Access-Control-Allow-Origin: {acao}")
    hl = {k.lower(): v for k, v in h.items()}
    for nom in ("x-content-type-options", "strict-transport-security", "content-security-policy"):
        if nom not in hl:
            constat("MOYEN", f"en-tête de sécurité absent sur l'API : {nom}", API + "/agenda")
    # 4. agenda public : aucun lien piégé, aucune donnée personnelle
    try:
        ag = json.loads(corps or b"[]")
    except ValueError:
        ag = []
    for e in ag if isinstance(ag, list) else []:
        for k in ("u", "b", "img"):
            if e.get(k) and not re.match(r"^https?://", str(e[k])):
                constat("CRITIQUE", "lien piégé dans l'agenda public", f"{e.get('id')} · {k} = {str(e[k])[:60]}")
        if re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}", json.dumps({k: v for k, v in e.items() if k not in ("u", "b")})):
            constat("FAIBLE", "adresse e-mail dans une sortie publiée", str(e.get("id")))
    # 5. ancienne adresse workers.dev (doit être fermée)
    wd = os.environ.get("WORKERS_DEV_URL")
    if wd:
        s, _, _ = requete(wd.rstrip("/") + "/agenda")
        if s == 200:
            constat("MOYEN", "le serveur répond encore sur workers.dev", wd)


def main():
    liste = fichiers()
    if "--en-ligne" in sys.argv:
        en_ligne()
    else:
        controle_secrets(liste); controle_publication(liste); controle_front(); controle_serveur(); controle_actions(liste); controle_donnees(liste)
    ordre = {"CRITIQUE": 0, "ÉLEVÉ": 1, "MOYEN": 2, "FAIBLE": 3}
    CONSTATS.sort(key=lambda x: ordre[x[0]])
    rapport = ["# Contrôle de sécurité " + ("en ligne" if "--en-ligne" in sys.argv else "du dépôt"), ""]
    if not CONSTATS:
        rapport.append("Aucun problème trouvé.")
    for niveau, quoi, detail in CONSTATS:
        rapport.append(f"- **{niveau}** · {quoi}" + (f" — `{detail}`" if detail else ""))
    texte = "\n".join(rapport)
    print(texte)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as h:
            h.write(texte + "\n\n")
    if os.environ.get("RAPPORT"):
        with open(os.environ["RAPPORT"], "a", encoding="utf-8") as h:
            h.write(texte + "\n\n")
    sys.exit(1 if any(n in GRAVES for n, _, _ in CONSTATS) else 0)


if __name__ == "__main__":
    main()
