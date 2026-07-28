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

Le but est d'empêcher qu'un frontend qui dépend de la nouvelle API soit publié
avant le pont backend, ou que les règles et les fonctions existantes changent
sans avis aux coachs.

Ce garde ne doit être retiré que dans un commit ultérieur, après la période
d'observation et la décision explicite de généraliser la nouvelle expérience.
