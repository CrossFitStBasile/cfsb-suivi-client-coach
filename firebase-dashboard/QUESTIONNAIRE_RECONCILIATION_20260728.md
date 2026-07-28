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
