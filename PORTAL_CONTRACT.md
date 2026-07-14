# Contrat modulaire Portail CFSB V1

## Principe

Le Dashboard Coach et le Dashboard Equipe restent deux applications Firebase
independantes. Elles ne lisent ni n'ecrivent directement dans la base Firestore
de l'autre projet.

## Responsabilites

### Dashboard Coach

- Projet Firebase: `cfsb-dashboard-coach-aa9a4`
- Donnees: coachs, clients, taches, questionnaires, rebookings, impacts et alumni
- Identifiant canonique local: `coachId`

### Dashboard Equipe

- Projet Firebase: `cfsb-roadmap-trimestrielle`
- Donnees: membres, roadmaps, rencontres, parcours, documents et projections
- Identifiant canonique local: `teamMemberId`

## Contrat de liaison

La liaison utilise seulement deux references explicites:

- `coaches/{coachId}.teamMemberId`
- `memberPortalProfiles/{teamMemberId}.coachDashboardId`

Les noms et les courriels ne servent jamais d'identifiants de relation.

## Liens profonds

- Coach vers parcours: `https://cfsb-roadmap-trimestrielle.web.app/portal?member={teamMemberId}`
- Equipe vers operations coach: `https://cfsb-dashboard-coach-aa9a4.web.app/?coach={coachId}`

Un parametre d'URL ne donne aucun droit. Chaque projet valide toujours le compte
Google dans ses propres regles Firestore.

## Version

Le contrat courant est `cfsb-portal-v1`.

Toute modification incompatible doit introduire une nouvelle version et garder
la version precedente fonctionnelle pendant la migration.

## Deploiements

- Dashboard Coach: depuis la racine du depot.
- Dashboard Equipe: depuis `firebase-roadmap/`.
- Ne jamais remplacer un fichier `.firebaserc` par celui de l'autre projet.
- Chaque application peut etre testee, deployee et restauree separement.

## Activation progressive

Le lien `Mon parcours CFSB` est visible aux admins du Dashboard Coach. Pour un
coach, il apparait seulement lorsque `coaches/{coachId}.teamPortalEnabled` vaut
`true`.

Dans le Dashboard Equipe, une invitation associe un courriel Google a un
`teamMemberId`. L'invitation n'accorde jamais l'acces aux notes owners.
