# Applis Android et iPhone de Trucs à faire

Les applis embarquent l'agenda du site (même code, `index.html`) dans une coque native [Capacitor 8](https://capacitorjs.com/).
Les sorties sont chargées en ligne depuis `https://trucsafaire.fr/data/`, mises à jour chaque nuit : **il n'est pas
nécessaire de republier les applis pour avoir les nouvelles sorties**. Il faut les republier seulement quand l'agenda
lui-même change (nouvelle fonction, nouveau design).

Identifiant des applis : `fr.trucsafaire.app` (Android et iPhone).

## Ce que les applis ajoutent au site (`natif.js`)

- **Rappels** : quand on garde une sortie (cœur), le téléphone la rappelle la veille à 18 h, et deux heures avant si
  l'heure est connue. Notifications locales : aucun serveur ni compte nécessaire. Toucher le rappel ouvre la sortie.
- **Partage** avec la feuille de partage du téléphone (WhatsApp, SMS…).
- **Ajouter à mon agenda** : le fichier .ics s'ouvre avec l'agenda du téléphone.
- **Autour de moi** : localisation native, demandée seulement quand on touche le bouton.
- Pages « Que faire à … » et sites externes ouverts dans le navigateur ; bouton retour Android géré.

## Construction

Automatique sur GitHub (workflow « Applis Android et iPhone ») à chaque modification de l'agenda ou des applis.
Résultat dans l'onglet **Actions** → la dernière exécution → **Artifacts** :

- `android-1.0.N` : l'APK s'installe directement sur un téléphone Android pour tester ; l'AAB est le fichier pour Google Play.
- Pour l'iPhone, sans compte Apple, la construction vérifie seulement que l'appli compile.

En local : `cd app && npm ci && npm run preparer`, puis `npx cap open android` (Android Studio) ou `npx cap open ios` (Xcode, sur Mac).
Icônes et écran de démarrage : sources dans `app/assets/`, régénérés par `npm run icones`.

## Mise en ligne : ce qu'il faut créer une fois

### Google Play (25 $ une fois)
1. Compte développeur sur https://play.google.com/console (compte « organisation » pour Saryn Digital : demande un numéro D-U-N-S ;
   un compte personnel récent doit faire tester l'appli par 12 personnes pendant 14 jours avant la production).
2. Clé de signature, à garder précieusement (sans elle, plus de mise à jour possible) :
   `keytool -genkeypair -v -keystore publication.jks -alias trucs -keyalg RSA -keysize 2048 -validity 10000`
3. Secrets GitHub (Settings → Secrets and variables → Actions) : `ANDROID_KEYSTORE_BASE64` (`base64 -w0 publication.jks`),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`trucs`), `ANDROID_KEY_PASSWORD`.
4. Créer l'appli dans la console et y déposer **à la main** le premier AAB (test interne). Ensuite, pour les envois automatiques :
   compte de service Google Cloud avec accès à la console → secret `GOOGLE_PLAY_JSON`, puis « Run workflow » avec « publier » coché.

### App Store (99 $ par an)
1. Programme Apple Developer sur https://developer.apple.com/programs/ (organisation : numéro D-U-N-S).
2. Dans App Store Connect : créer l'appli avec l'identifiant `fr.trucsafaire.app`.
3. Clé d'API (App Store Connect → Utilisateurs et accès → Intégrations → clé avec le rôle Admin) et secrets GitHub :
   `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64` (`base64 -i AuthKey_XXXX.p8`).
   Pas besoin de Mac : GitHub signe et envoie l'appli sur TestFlight (« Run workflow » avec « publier » coché).
4. Fiche de l'appli, captures d'écran, politique de confidentialité (`https://trucsafaire.fr/confidentialite.html`) puis envoi en vérification.

Apple refuse les applis qui ne sont qu'un site dans une coque (règle 4.2) : les rappels, le partage, l'agenda et la carte
hors ligne sont les arguments à mettre en avant dans la note de vérification.

## À faire plus tard
- Liens `trucsafaire.fr` qui ouvrent directement l'appli (App Links / Universal Links) : nécessite l'empreinte de la clé
  Android et l'identifiant d'équipe Apple, puis deux fichiers sur le site (`.well-known/assetlinks.json`, `apple-app-site-association`).
- Connexion au compte Trucophile : le lien reçu par e-mail ouvre aujourd'hui le site, pas l'appli (résolu par le point précédent).
