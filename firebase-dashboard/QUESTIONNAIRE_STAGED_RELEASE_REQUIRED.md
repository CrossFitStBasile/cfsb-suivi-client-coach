# Garde de publication — Questionnaire Studio

Ce fichier est volontairement présent dans le candidat de réconciliation du
28 juillet 2026.

Tant qu'il existe :

- `deploy-dashboard-complet.cmd` doit refuser un déploiement groupé;
- `deploy-hosting-dashboard.cmd` doit refuser un Hosting isolé qui n'a pas été
  précédé du canari backend;
- la publication doit passer par
  `deploy-questionnaire-stage-a.cmd`, puis par les contrôles du runbook, puis
  par `deploy-questionnaire-stage-b.cmd`.
- Stage A doit séparer strictement `firestore:rules` et
  `firestore:indexes`; l'index du Scheduler arrive seulement après les
  fonctions additives, le pont historique et leurs canaris;
- chaque sous-étape doit réussir le prévol Firestore live en lecture seule;
  l'index exige un second prévol immédiatement avant sa publication, puis une
  preuve distincte `READY` et un canari Scheduler avant Stage B.
- les GO, l'avis coach et toutes les preuves de canari doivent être liés au SHA
  exact du candidat scellé; un nouveau commit invalide les valeurs précédentes.
- le commit scellé et le worktree propre doivent être revérifiés après le
  dry-run, immédiatement avant chaque mutation Firebase.

Le but est d'empêcher qu'un frontend qui dépend de la nouvelle API soit publié
avant le pont backend, ou que les règles et les fonctions existantes changent
sans avis aux coachs.

Ce garde ne doit être retiré que dans un commit ultérieur, après la période
d'observation et la décision explicite de généraliser la nouvelle expérience.
