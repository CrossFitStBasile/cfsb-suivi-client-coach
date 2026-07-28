# Réconciliation questionnaires — 2026-07-28

## Contrat de livraison

Le candidat final doit :

1. conserver le Dashboard et la bibliothèque de formulaires utilisés par les coachs;
2. conserver CoachRx Sync 0.7.0, les annonces et les protections d'identité existantes;
3. conserver les trois formulaires historiques tant que le nouveau pipeline n'est pas confirmé;
4. n'afficher un succès qu'après une confirmation durable de stockage;
5. ajouter le Studio, quatre formulaires publiés et des URL génériques sans donnée client;
6. rattacher une réponse seulement à un `internalClientId` unique et déjà possédé;
7. placer les cas ambigus en validation sans créer, transférer ou attribuer un client;
8. être testable et réversible avant toute publication.

Le GO du 28 juillet couvre uniquement la préparation et la validation locales. Il ne couvre ni déploiement, ni écriture de données réelles, ni communication aux coachs.

## Pourquoi la découverte précédente a semblé oubliée

Le problème n'était pas une suppression volontaire du Studio. Quatre états
avaient été mélangés :

1. le travail de conception/Studio existait dans un worktree local divergent,
   avec des changements non scellés;
2. le Dashboard réellement servi provenait d'un snapshot Hosting distinct;
3. la tâche « diagnostic et extension 0.6.9 » concernait surtout l'import
   CoachRx et l'identité client, pas l'architecture des questionnaires;
4. aucun test ne fixait ensemble le snapshot live, les trois anciennes pages,
   Apps Script v23, les tags GHL, les huit redirections et le nouveau Studio.

Une nouvelle tâche pouvait donc repartir correctement du live, mais ne pas voir
le travail non commité du worktree précédent. La conversation conservait
l'intention produit; Git ne conservait pas encore un candidat canonique
déployable. C'est ce décalage entre « discuté/construit localement » et
« intégré/scellé dans le socle live » qui donnait l'impression d'un oubli.

La réconciliation corrige ce défaut de méthode :

- un baseline exact du Hosting live;
- une branche candidate unique;
- des hashes des parcours historiques et de CoachRx;
- une gate commune à Hosting, Functions, Firestore et au pipeline standard;
- un runbook par étapes avec commit propre, dry-run, canaris et rollback;
- une archive et un bundle Git à conserver avant tout GO production.

## Architecture clarifiée

- Les anciennes pages restent sur Firebase Hosting et soumettent à Apps Script
  v23. Elles ne sont ni supprimées ni redirigées dans ce candidat.
- Les nouveaux formulaires utilisent l'API Firebase, des URL génériques et un
  reçu durable.
- Le téléphone sert à retrouver une fiche existante, mais le rattachement
  persistant utilise l'identité interne stable. Une ambiguïté échoue fermée.
- Un dossier à ownership `needs_review` reste disponible pour le suivi interne
  quotidien; un envoi, un rattachement ou un changement de propriétaire exige
  toujours une fiche confirmée.
- `published` et `deliveryReady` sont séparés. Un administrateur peut tester un
  lien publié sans que les coachs ou le planificateur puissent déclencher un
  workflow GHL non vérifié.

## Provenance du socle

- Parent historique Dashboard/CoachRx 0.7.0 :
  `c8d159b8ab5afabc67397630b22ec040a31fdb21`
- Snapshot Hosting exact avec bibliothèque coach :
  `2d9c1c0dbb08bdf6838c05c5c5781e2c70198525`
- Tag local de provenance :
  `dashboard-hosting-live-20260728-questionnaire-library-provenance`
- Arbre Git exact du dossier public live :
  `b318a719139a8464595420eb4ecb804f95957ae5`
- Correctif durable Apps Script source :
  `c2c9776a0fe50ed7ac1194b29938b33859dc860a`
- Source Apps Script v23 importée :
  `apps-script/auto-009-code.gs`

Le 28 juillet, les neuf artefacts critiques suivants ont répondu HTTP 200 et leur SHA-256 était identique au snapshot Hosting :

- `index.html`
- `app.js`
- `styles.css`
- `questionnaire/index.html`
- `questionnaire/check-in/index.html`
- `questionnaire/evaluation-habitudes-vie/index.html`
- `questionnaire/questionnaire-form.js`
- `questionnaire/questionnaire-submission.js`
- `downloads/coachrx-sync-extension-0.7.0-live.zip`

## Protection du travail non intégré

Le worktree Studio original n'est pas utilisé comme candidat de déploiement et n'a pas été modifié.

Une archive locale de récupération a été créée :

`C:\Users\micha\OneDrive\Documents\Dashboard\final-artifacts\questionnaire-reconciliation\phase0\hotfix-worktree-pre-reconcile-20260728.zip`

SHA-256 :

`C7AECF3B123131F2553018AB76FCFDBB747426C1EAE9EC1C8103538D2619E581`

## Règle de continuité

Les anciennes pages de questionnaires restent les pages durables actuellement servies. Elles ne pourront devenir des redirections qu'après validation d'un déploiement backend séparé, du catalogue initial et des quatre nouvelles routes publiques. Si cette validation échoue, Hosting demeure sur le snapshot `2d9c1c0` et Apps Script demeure en v23.
