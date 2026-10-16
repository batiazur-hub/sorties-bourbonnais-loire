/* Réglages du site public. Une fois le serveur des propositions déployé (voir worker/LISEZMOI.md),
   indiquez son adresse ci-dessous, par exemple "https://api.trucsafaire.fr". */
window.SORTIES_CONFIG = Object.assign({
  apiUrl: "https://api.trucsafaire.fr",
  /* Mesure d'audience sans cookie : jeton « Web Analytics » du tableau de bord Cloudflare (32 caractères), ou null */
  analyticsToken: null
}, window.SORTIES_CONFIG || {});
