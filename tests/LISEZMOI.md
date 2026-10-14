# Tests mobile

`tests/mobile.mjs` parcourt le site comme un visiteur sur quatre téléphones (iPhone 14 et iPhone SE avec le moteur
de Safari, Pixel 7 et Galaxy S9+ avec Chrome) : accueil, liste, suggestions, recherche, fiche d'une sortie, fiche
d'un lieu, carte, bulle d'un repère, calendrier, jour choisi, formulaire de proposition, choix des départements.

À chaque écran, il relève :
- les textes qui se chevauchent (et qui sont réellement visibles l'un et l'autre) ;
- tout débordement horizontal de la page ;
- les textes coupés, les caractères trop petits et les zones tactiles trop petites ;
- les erreurs JavaScript.

Il tourne tout seul sur GitHub à chaque modification du site (onglet Actions, « Tests mobile ») ; les captures
d'écran de chaque téléphone sont jointes au résultat (« captures-mobile »). Le test échoue s'il trouve un
chevauchement, un débordement ou une erreur.

En local : `python3 -m http.server 8765` à la racine, puis `node tests/mobile.mjs` (ou `node tests/mobile.mjs pixel7`).
