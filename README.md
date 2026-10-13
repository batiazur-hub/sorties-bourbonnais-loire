# Dans le coin

Que faire autour de chez vous ? Agenda des sorties partout en France : brocantes, fêtes, concerts, expositions, sport.
Données DATAtourisme (offices de tourisme) mises à jour chaque nuit, complétées à la main département par département.

- Liste, carte (fonds cartes.gouv.fr / Géoplateforme IGN) et calendrier jour par jour
- Ajout à l'agenda (Google, Outlook, .ics avec rappel) et itinéraire (Waze, Google Maps, Apple Plans)
- Mode borne : ajouter `#borne` à la fin de l'adresse

## Intégration

```html
<script>
window.SORTIES_CONFIG = {
  dataUrl: null,      // flux JSON des événements (Cloudflare Worker)
  submitUrl: null,    // adresse qui reçoit les propositions de sorties et de sources
  tiles: "ign",       // "ign", "osm" ou "none"
  theme: { accent: "#1479c4", head: "#0b3a5c", font: "Montserrat, sans-serif", radius: "8px" }
};
</script>
```

Le thème peut aussi être changé à la volée : `SortiesBL.setTheme({...})`.

## Données

`data/dep/<code>.json` : sorties à venir par département (DATAtourisme, chaque nuit à 6 h).
`data/evenements.json` : relevé manuel du 12 octobre 2026 (offices de tourisme, JDS, Fest.fr, Brocabrac, Vide-greniers.org, France-Voyage).
