# Validation du canal Preview — CoachRx Sync 0.6.10

Date: 2026-07-19

Statut: `PREVIEW_OK / LIVE_NO-GO`

## Canal isolé

- Canal Firebase Hosting: `coachrx-0610-candidate`
- URL: `https://cfsb-dashboard-coach-aa9a4--coachrx-0610-candidate-mgr2j4gv.web.app`
- Expiration: 2026-07-26 23:04:53, heure America/Toronto
- Synchronisation des domaines Firebase Auth: désactivée
- Source: snapshot Hosting live scellé `2026-07-19T000445Z`, avec seulement le paquet, le lien et les libellés 0.6.10 prévus par le manifeste de Preview

## Vérification du téléchargement Preview

- Réponse HTTP: `200`
- Type MIME: `application/zip`
- Taille: `29 231` octets
- SHA-256 reçu: `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D`
- SHA-256 attendu: `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D`
- Verdict: identique au candidat local testé

## Non-régression de la production

Après le déploiement du canal Preview:

- l'application publique annonce toujours la version 0.6.8;
- elle ne contient pas le libellé 0.6.10;
- le ZIP public 0.6.8 répond `200`, mesure `27 997` octets et conserve le SHA-256 `38B2FD295894D76D805D64F07928A043ACF1D142E0052F645637FF6EFD8448A9`.

## Limite bloquante

Cette preuve certifie la construction et la distribution du fichier, pas une synchronisation CoachRx authentifiée. Un canari signé doit encore confirmer les compteurs actifs/archivés, l'identité du coach, l'idempotence et l'absence de déplacement de responsabilité Dashboard avant de basculer le lien public ou d'envoyer une annonce aux entraîneurs.
