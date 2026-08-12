# Ancienne Roadmap CFSB - archivée

La version GitHub Pages de la Roadmap a été retirée le 12 août 2026. Le formulaire employé, le tableau owners, le laboratoire de revenus historique et la synchronisation du cache ne doivent plus être utilisés.

Les anciennes URL affichent maintenant `roadmap/archived.html`, sans charger les scripts historiques.

## Accès actifs

- Employés: `https://cfsb-roadmap-trimestrielle.web.app/portal`
- Michael et Gabriel: `https://cfsb-roadmap-trimestrielle.web.app/`
- Projection de revenus pour les profils admissibles: `https://cfsb-roadmap-trimestrielle.web.app/revenue`

Le portail membre exige un profil actif ou une invitation associée au compte Google de l'employé. La racine du Dashboard Équipe est réservée aux rôles owner/admin.

## Données et automatisation retirées

- `roadmap/data/roadmap-submissions-cache.json` a été supprimé des branches actives.
- Le workflow planifié `Roadmap submissions cache sync` et son script ont été supprimés.
- L'ancien cache ne peut plus servir implicitement à construire un lot d'importation Firebase; un export explicite est requis.

Le code historique demeure récupérable dans Git. Le projet Apps Script partagé avec le questionnaire client-coach est conservé et ne doit pas être supprimé sans une migration séparée de ce questionnaire.
