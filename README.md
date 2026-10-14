# Trucs à faire

Que faire autour de chez vous ? Agenda des sorties partout en France (brocantes, fêtes, marchés, concerts, expositions,
sport, sorties en famille) et lieux à visiter, sur liste, carte et calendrier. Données mises à jour chaque nuit.
Éditeur : Clément Monteiro EI (Saryn Digital). Charte graphique : dossier `marque/` (logos, icônes) et polices `fonts/trucs.css` (Outfit, DM Sans). Site : https://batiazur-hub.github.io/sorties-bourbonnais-loire/

## Organisation du dépôt

```
src/                     sources de l'application (ne pas modifier index.html à la main)
  app.html               gabarit : HTML, CSS et JavaScript de l'agenda
  *.json                 contours des départements, communes, échantillon de secours
index.html               application assemblée  ← python scripts/construire_app.py
*.html (autres pages)    pages d'information    ← python scripts/pages.py (texte de l'API : scripts/api_page.html)
dlc.js                   bibliothèque JavaScript publique de l'API (servie aussi par le Worker en /v1/dlc.js)
config.js                réglages du site public (adresse du Worker)
pages.css, fonts/        style et police des pages d'information (police hébergée, aucun appel à Google)
vendor/                  MapLibre 4.7.1 et générateur de QR codes, hébergés avec le site
data/                    données publiées, produites uniquement par les scripts ci-dessous
  dep/<code>.json        sorties à venir par département
  lieux/<code>.json      lieux à visiter et offices de tourisme
  enrich/                sources régionales et horaires OpenStreetMap (cache des scripts)
  departements.json      index des départements ; communes-fr.json : communes (recherche)
scripts/
  construire.py          sorties : DATAtourisme, OpenAgenda, Paris, sources régionales (chaque nuit)
  lieux.py               lieux : DATAtourisme + horaires OpenStreetMap (chaque semaine)
  horaires.py            horaires d'ouverture OpenStreetMap par carreaux (chaque jour)
  qualite_donnees.py     corrections communes : communes, positions, dates, identifiants uniques
  verifier.py            contrôle qualité bloquant (données, liens, pages à jour, secrets)
worker/                  serveur Cloudflare : propositions des visiteurs, espace éditeur, API à clés
tests/                   tests du serveur (node --test) et audit mobile (Playwright)
.github/workflows/       mises à jour automatiques et contrôles
```

## Commandes

```sh
python scripts/construire_app.py    # après toute modification de src/
python scripts/pages.py             # après toute modification des pages d'information
python scripts/verifier.py          # avant de publier : doit afficher « tout est en ordre »
node --test tests/worker.test.mjs   # tests du serveur
```

## Automatisations (GitHub Actions)

| Flux | Quand | Garde-fou |
|---|---|---|
| Sorties (`donnees.yml`) | chaque nuit 4 h 17 UTC (ou à la demande) | `verifier.py --donnees` avant d'enregistrer |
| Lieux (`lieux.yml`) | dimanche 3 h 41 UTC | idem |
| Horaires (`horaires.yml`) | chaque jour 2 h 23 UTC | idem |
| Contrôle qualité (`qualite.yml`) | chaque modification du code | pyflakes, syntaxe JS, vérificateur, tests du serveur, empreintes SRI |
| Tests mobiles (`tests-mobile.yml`) | modification des pages | iPhone (WebKit) et Android (Chromium), planches sur la branche `captures` |

Les trois flux de données partagent un même groupe de concurrence : ils ne s'exécutent jamais en même temps.

## Intégration

- Agenda complet dans une page : voir `integrer.html` (iframe, mode borne `#borne`, mode intégré `#integre`).
- API et widgets : voir `api.html` et `worker/LISEZMOI.md`.
