# Serveur des propositions (Cloudflare Worker)

Ce petit serveur reçoit les sorties et les sources proposées par les visiteurs du site public,
les garde en attente, et publie celles que l'éditeur valide. Il est gratuit dans les limites
de l'offre Workers gratuite de Cloudflare.

## Mise en place depuis le tableau de bord Cloudflare (10 minutes, sans ligne de commande)

1. **Créer le stockage** : *Storage & Databases → KV → Create* ; nom : `DLC`.
2. **Créer le Worker** : *Workers & Pages → Create → Worker* ; nom : `trucs-a-faire` ; *Deploy*.
3. **Coller le code** : *Edit code*, remplacer tout le contenu par celui de `worker.js`, puis *Deploy*.
4. **Relier le stockage** : dans le Worker, *Settings → Bindings → Add → KV namespace* ;
   nom de variable : `DLC` ; espace : `DLC`.
5. **Réglages** : *Settings → Variables and Secrets* :
   - `ORIGINS` (texte) : `https://batiazur-hub.github.io` (ajouter le futur nom de domaine, séparé par une virgule) ;
   - `ADMIN_TOKEN` (secret) : un long mot de passe, c'est le **code éditeur** demandé pour valider.
6. **Brancher le site** : recopier l'adresse du Worker (`https://trucs-a-faire.<compte>.workers.dev`)
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
  `<script src="https://trucs-a-faire.<compte>.workers.dev/v1/dlc.js?key=dlc_…&callback=initTrucs" async></script>`.
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

