# Garde de publication — Questionnaire Studio

Ce fichier est volontairement présent dans le candidat de réconciliation du
28 juillet 2026.

Tant qu'il existe :

- `deploy-dashboard-complet.cmd` doit refuser un déploiement groupé;
- `deploy-hosting-dashboard.cmd` doit refuser un Hosting isolé qui n'a pas été
  précédé du canari backend;
- `deploy-hosting-api.cmd` et son runner direct doivent échouer avant toute
  authentification ou écriture; ils ne remplacent jamais Stage B;
- la publication doit passer par
  `deploy-questionnaire-stage-a.cmd`, puis par les contrôles du runbook, puis
  par `deploy-questionnaire-stage-b.cmd`.
- Stage A doit séparer strictement `firestore:rules`, les fonctions additives
  et le pont historique; elle ne doit offrir aucun chemin de publication
  d'index pour ce candidat;
- l'index exact du Scheduler est déjà `READY`; après les fonctions et leurs
  canaris, A4 se limite aux contrôles live en lecture seule, à la preuve
  distincte `READY` et aux canaris Scheduler avant Stage B;
- chaque sous-étape mutable doit réussir le prévol Firestore live en lecture
  seule avant son dry-run, puis une seconde fois immédiatement avant sa
  publication;
- les GO, l'avis coach et toutes les preuves de canari doivent être liés au SHA
  exact du candidat scellé; un nouveau commit invalide les valeurs précédentes.
- avant tout dry-run mutable, le reçu pré-release durable doit être relu et
  validé contre le SHA et
  `CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH`, puis l'avis live doit retourner
  `maintenancePublished: true`; les variables de terminal seules ne suffisent
  jamais;
- immédiatement avant A1, le snapshot complet du reçu doit encore correspondre
  au live; avant A2, A3 et Stage B, son intégrité locale SHA/planHash doit encore
  être valide même si le live a changé intentionnellement;
- le commit scellé et le worktree propre doivent être revérifiés après le
  dry-run, immédiatement avant chaque mutation Firebase.

Le but est d'empêcher qu'un frontend qui dépend de la nouvelle API soit publié
avant le pont backend, ou que les règles et les fonctions existantes changent
sans avis aux coachs.

Ce garde ne doit être retiré que dans un commit ultérieur, après la période
d'observation et la décision explicite de généraliser la nouvelle expérience.
