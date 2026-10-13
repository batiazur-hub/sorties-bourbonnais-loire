# Serveur des propositions (Cloudflare Worker)

Ce petit serveur reçoit les sorties et les sources proposées par les visiteurs du site public,
les garde en attente, et publie celles que l'éditeur valide. Il est gratuit dans les limites
de l'offre Workers gratuite de Cloudflare.

## Mise en place depuis le tableau de bord Cloudflare (10 minutes, sans ligne de commande)

1. **Créer le stockage** : *Storage & Databases → KV → Create* ; nom : `DLC`.
2. **Créer le Worker** : *Workers & Pages → Create → Worker* ; nom : `dans-le-coin` ; *Deploy*.
3. **Coller le code** : *Edit code*, remplacer tout le contenu par celui de `worker.js`, puis *Deploy*.
4. **Relier le stockage** : dans le Worker, *Settings → Bindings → Add → KV namespace* ;
   nom de variable : `DLC` ; espace : `DLC`.
5. **Réglages** : *Settings → Variables and Secrets* :
   - `ORIGINS` (texte) : `https://batiazur-hub.github.io` (ajouter le futur nom de domaine, séparé par une virgule) ;
   - `ADMIN_TOKEN` (secret) : un long mot de passe, c'est le **code éditeur** demandé pour valider.
6. **Brancher le site** : recopier l'adresse du Worker (`https://dans-le-coin.<compte>.workers.dev`)
   dans `config.js`, champ `apiUrl`.

## Utilisation

- Les visiteurs proposent via « Proposer une sortie » et le formulaire « Vous connaissez une source ».
- L'éditeur ouvre le site avec `#admin` à la fin de l'adresse, saisit le code éditeur,
  puis corrige, publie ou refuse depuis « À valider ».
- Garde-fous : 20 envois par heure et par connexion, mots grossiers refusés, propositions
  non traitées effacées au bout de 120 jours.
