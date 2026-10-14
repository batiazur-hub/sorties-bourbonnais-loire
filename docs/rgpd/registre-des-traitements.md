# Registre des activités de traitement — Trucs à faire

Article 30 du RGPD. Document interne, à tenir à jour à chaque nouveau traitement ou nouveau prestataire.

- **Responsable du traitement** : Clément Monteiro EI (nom commercial Saryn Digital), SIREN 109 916 320, 6 rue Les Lauriers, 58300 Decize — clementer@gmail.com
- **Délégué à la protection des données** : non désigné (pas obligatoire : pas de suivi régulier et systématique à grande échelle, pas de données sensibles)
- **Dernière mise à jour** : 14 octobre 2026

| # | Traitement | Finalité | Personnes concernées | Données | Base légale | Destinataires / sous-traitants | Transferts hors UE | Durée de conservation | Sécurité |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Comptes Trucophile | Connexion, favoris, préférences | Visiteurs qui créent un compte (15 ans et plus) | E-mail, commune (centre), distance, centres d'intérêt, favoris, dates de création, de dernière connexion et d'acceptation des CGU | Contrat (6.1.b) | Cloudflare (stockage), Brevo (envoi des liens) | Cloudflare : États-Unis, Data Privacy Framework + clauses types | Jusqu'à suppression par la personne ; suppression automatique après 3 ans sans connexion (tâche planifiée hebdomadaire) | Connexion sans mot de passe ; jetons stockés en empreinte SHA-256 ; lien 30 min à usage unique ; session 90 jours ; HTTPS |
| 2 | Sélection par e-mail (newsletter, alertes) | Envoyer les sorties autour de la personne | Titulaires d'un compte ayant consenti | E-mail, préférences, preuve du consentement (date, version du texte, origine) | Consentement (6.1.a) | Brevo | Non (UE) | Jusqu'au retrait ; preuve conservée avec le compte | Double opt-in (actif seulement après clic sur le lien) ; désinscription en un clic signée (HMAC) dans chaque e-mail |
| 3 | Limitation des abus | Empêcher les envois massifs | Tout visiteur utilisant les formulaires | Adresse IP, compteur horaire | Intérêt légitime (6.1.f) | Cloudflare | Cloudflare | 1 heure (expiration automatique) | Clé expirante |
| 4 | Propositions de sorties et de sources | Compléter l'agenda | Visiteurs qui proposent | Contenu du formulaire (pas de nom ni de contact demandé) | Intérêt légitime | Cloudflare | Cloudflare | Refusées : 4 mois max (expiration automatique) ; publiées : jusqu'à la date de l'événement | Relecture humaine, filtre de mots |
| 5 | Clés API | Fournir l'API aux intégrateurs | Contacts des intégrateurs | Nom, contact, sites autorisés, compteurs d'appels | Contrat | Cloudflare | Cloudflare | Durée de la relation ; compteurs : 40 jours | Code éditeur en secret, comparaison à durée constante |
| 6 | Offres payantes (à ouvrir) | Abonnements Truc & Co / Truc Pro | Clients | Identité ou raison sociale, facturation, factures | Contrat + obligation légale | Prestataire de paiement (à choisir) | À documenter | Factures 10 ans | Carte jamais vue par l'éditeur |

## Ce qui reste à faire avant d'ouvrir les comptes au public

- [ ] Créer le compte Brevo, vérifier le domaine trucsafaire.fr (enregistrements SPF, DKIM et DMARC dans Cloudflare), puis accepter l'accord de traitement des données (DPA) de Brevo.
- [ ] Accepter l'accord de traitement des données de Cloudflare (Data Processing Addendum, dans le tableau de bord).
- [ ] Créer les secrets du serveur : `BREVO_KEY`, `SIGNATURE_KEY` (texte aléatoire long).
- [ ] Désactiver dans Brevo le suivi des ouvertures et des clics pour les e-mails de connexion (inutile au service).
- [ ] Paiement : régler le prestataire pour **une seule nouvelle tentative** après un échec, puis **arrêt automatique** de l'abonnement au 2e échec (aucune relance, aucun recouvrement), et retour à l'offre gratuite. Résiliation en un clic depuis « Mon compte ». Pause en un clic (aucun prélèvement, temps restant conservé). Annuel : un paiement, renouvellement automatique, **e-mail de rappel au moins un mois avant** le renouvellement avec lien d'arrêt (obligation légale, art. L215-1 du code de la consommation).
- [ ] Avant les offres payantes : conditions générales de vente, choix du prestataire de paiement, désignation d'un médiateur de la consommation (obligatoire pour la vente aux particuliers), mise à jour de ce registre.
- [ ] Avant le premier envoi de newsletter : lien de désinscription dans chaque e-mail (déjà prévu côté serveur : `/newsletter/stop`), en-têtes `List-Unsubscribe`, adresse de l'expéditeur identifiable.

## Violation de données

En cas de fuite ou d'accès non autorisé : noter les faits ici (date, données, personnes, mesures), notifier la CNIL sous 72 heures si un risque existe pour les personnes, et prévenir les personnes si le risque est élevé.
