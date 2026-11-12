# Serveur des propositions (Cloudflare Worker)

Ce petit serveur reçoit les sorties et les sources proposées par les visiteurs du site public,
les garde en attente, et publie celles que l'éditeur valide. Il est gratuit dans les limites
de l'offre Workers gratuite de Cloudflare.

## Déploiement automatique (en place)

Le serveur est publié par GitHub Actions (`.github/workflows/serveur.yml`) à chaque modification du dossier `worker/` sur `main`,
après les tests, sur le compte Cloudflare `5e60e1af0bf1f6bc19cb672db3af1863`, à l'adresse **https://api.trucsafaire.fr**.
Stockage : espace KV `TRUCS_A_FAIRE_DLC` (juridiction UE).

Secrets du dépôt (Settings → Secrets and variables → Actions) :
- `CLOUDFLARE_API_TOKEN` : jeton Cloudflare, modèle « Edit Cloudflare Workers » (My Profile → API Tokens) ;
- `ADMIN_TOKEN`, `BREVO_KEY`, `SIGNATURE_KEY` : recopiés vers le serveur à chaque déploiement, s'ils sont renseignés.

Relancer un déploiement à la main : onglet Actions → « Déploiement du serveur » → Run workflow.

## Mise en place manuelle depuis le tableau de bord Cloudflare (ancienne méthode)

1. **Créer le stockage** : *Storage & Databases → KV → Create* ; nom : `DLC`.
2. **Créer le Worker** : *Workers & Pages → Create → Worker* ; nom : `trucs-a-faire` ; *Deploy*.
3. **Coller le code** : *Edit code*, remplacer tout le contenu par celui de `worker.js`, puis *Deploy*.
4. **Relier le stockage** : dans le Worker, *Settings → Bindings → Add → KV namespace* ;
   nom de variable : `DLC` ; espace : `DLC`.
5. **Réglages** : *Settings → Variables and Secrets* :
   - `ORIGINS` (texte) : `https://batiazur-hub.github.io` (ajouter le futur nom de domaine, séparé par une virgule) ;
   - `ADMIN_TOKEN` (secret) : un long mot de passe, c'est le **code éditeur** demandé pour valider.
6. **Brancher le site** : recopier l'adresse du Worker (`https://api.trucsafaire.fr` ; l'adresse `*.workers.dev` est désactivée pour la sécurité)
   dans `config.js`, champ `apiUrl`.

## Utilisation

- Les visiteurs proposent via « Proposer une sortie » et le formulaire « Vous connaissez une source ».
- L'éditeur ouvre le site avec `#admin` à la fin de l'adresse, saisit le code éditeur,
  puis corrige, publie ou refuse depuis « À valider ».
- Garde-fous : 20 envois par heure et par connexion, mots grossiers refusés, propositions
  non traitées effacées au bout de 120 jours.

## API à clés

Le même serveur fournit l'API publique de « Trucs à faire » (`/v1/sorties`, `/v1/lieux`, `/v1/departements`),
documentée sur la page `api.html` du site. Chaque appel exige une clé.

- **Créer, régler, révoquer les clés** : ouvrir `cles.html` sur le site, saisir l'adresse du serveur et le code éditeur.
- **Réglages par clé** : départements autorisés, types de sorties ou de lieux, nombre d'appels par jour,
  sites autorisés (pour un usage depuis un navigateur), notes.
- **Bibliothèque JavaScript** : le serveur sert aussi `/v1/dlc.js` (copie de `dlc.js` publiée sur le site,
  avec son adresse déjà réglée). Les sites l'incluent comme Google Maps :
  `<script src="https://api.trucsafaire.fr/v1/dlc.js?key=dlc_…&callback=initTrucs" async></script>`.
  Pour une clé utilisée dans un navigateur, renseigner toujours les **sites autorisés**.
- Le serveur lit les données publiées sur GitHub Pages (variable facultative `DATA_URL` pour en changer)
  et les garde 30 minutes en cache.

## Limites de l'offre gratuite et choix techniques

- KV gratuit : 100 000 lectures et 1 000 écritures par jour. Les compteurs d'appels sont donc regroupés en mémoire
  (une écriture toutes les 25 requêtes ou toutes les 60 secondes par instance) : le quota est approximatif à quelques appels près.
- L'agenda public (`/agenda`) se lit en un seul enregistrement `agenda`, recalculé à chaque publication ou retrait.
- Toute erreur interne renvoie un JSON `500 erreur_serveur` avec les en-têtes CORS, jamais une page HTML.
- Le code éditeur est comparé à durée constante.
- Tests : `node --test tests/worker.test.mjs` (stockage simulé, aucune connexion réseau).


## Comptes Trucophile (connexion par lien e-mail)

Le code est dans `comptes.js`. Pour l'activer :

1. **Brevo** (envoi des e-mails, société française, données dans l'UE) : créer un compte gratuit sur brevo.com, ajouter le domaine `trucsafaire.fr` et recopier dans Cloudflare (DNS) les enregistrements SPF, DKIM et DMARC qu'il indique. Créer une clé API (menu « SMTP & API »).
2. Secrets du serveur :
   ```sh
   npx wrangler secret put BREVO_KEY       # la clé API Brevo
   npx wrangler secret put SIGNATURE_KEY   # OBLIGATOIRE : un long texte aléatoire (32 caractères ou plus), différent du code éditeur
   ```
   Sans `SIGNATURE_KEY`, la désinscription par lien répond 503 et la newsletter ne part pas (aucune valeur par défaut).
3. Dans `wrangler.toml`, vérifier `SITE_URL` (adresse du site, où arrivent les liens de connexion) et `MAIL_FROM` (expéditeur, sur le domaine vérifié chez Brevo).
4. Déployer : `npx wrangler deploy`. La tâche planifiée (`[triggers]`) supprime chaque semaine les comptes sans connexion depuis 3 ans.

Tant que `BREVO_KEY` n'est pas défini, le serveur répond « envoi indisponible » (503) : aucun compte ne peut être créé par erreur.
Côté site, les boutons « Créer un compte » n'apparaissent que lorsque `config.js` contient l'adresse du serveur (`apiUrl`). Pour les voir avant, ouvrir le site avec `#comptes` à la fin de l'adresse (aperçu, sans envoi).

Registre des traitements et liste des démarches RGPD : `docs/rgpd/registre-des-traitements.md`.

## « Le Truc de la semaine » (newsletter)

Code : `newsletter.js`. Envoi automatique le jeudi matin (tâche planifiée `*/15 5-9 * * 4`), par lots de `NL_LOT` comptes,
uniquement aux Trucophiles qui ont coché la case et confirmé leur adresse. Sélection : du vendredi au jeudi suivant, dans le rayon
choisi autour de leur commune, selon leurs centres d'intérêt (pas de doublon, 4 sorties par commune et 5 par type au plus).
- Variables : `API_URL` (adresse publique de ce serveur, pour les liens de désinscription), `NL_LOT` (30 sur l'offre gratuite Cloudflare,
  jusqu'à 900 avec l'offre payante), `BREVO_KEY` et `SIGNATURE_KEY` (secrets). Le lot compte ses requêtes sortantes et s'arrête
  avant 48 (limite gratuite : 50) ; la liste des comptes servis tient dans une seule clé KV par édition.
- Capacité de l'offre gratuite : 20 passages × 30 = 600 e-mails par jeudi, et Brevo gratuit plafonne à 300 e-mails par jour.
  Au-delà de ~250 abonnés : offre Brevo payante, ou étaler l'envoi (ajouter des créneaux le vendredi).
- Aperçu : « Mon compte » → « Voir un exemple de Le Truc de la semaine » (route `/compte/newsletter`).
- Dans Brevo, **désactiver le suivi des ouvertures et des clics** : la politique de confidentialité annonce qu'il est désactivé.

## Limites de l'offre gratuite et protections

- **Limitation de débit** (connexion, propositions, signalements, code éditeur) : en mémoire du serveur, sans écriture KV.
  Un robot ne peut donc plus épuiser le quota de 1 000 écritures KV par jour. Pour une limite stricte sur tout le réseau,
  ajouter dans Cloudflare une règle « Rate limiting » (Sécurité → WAF, une règle gratuite) sur `/compte/lien`, `/propose` et `/signaler`.
- **Code éditeur** : 10 essais ratés par heure et par adresse IP, puis 429. Choisir un code de 32 caractères ou plus.
- **Pages organisateurs** : le panneau « À valider » permet de vérifier, **suspendre** (page en 404, sorties retirées,
  publication bloquée) ou **supprimer** une page (usurpation, contenu illicite : retrait rapide exigé par la LCEN).
- **Sorties publiées** : effacées automatiquement 30 jours après leur fin (`expirationTtl`).
- **Récapitulatif `agenda`** : mis à jour par ajout ou retrait de la sortie concernée (KV.list n'est pas cohérent tout de suite).
  Si le trafic grandit (publications simultanées fréquentes), passer les sorties sur D1 (SQL, gratuit jusqu'à 5 M de lectures par jour).
- Quand le domaine `trucsafaire.fr` sera branché, ajouter `https://trucsafaire.fr` à `ORIGINS`. Sans `ORIGINS`, aucun site tiers n'est autorisé (plus de repli sur « * »).
