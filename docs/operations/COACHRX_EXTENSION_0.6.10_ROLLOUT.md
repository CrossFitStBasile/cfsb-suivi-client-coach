# Déploiement contrôlé — Extension CoachRx Sync 0.6.10

Projet: Dashboard Coach CFSB / CoachRx
Créé: 2026-07-19
Propriétaire principal: Michael / administration CFSB
Statut: candidat construit et publié sur canal Preview isolé; ne pas diffuser avant le verdict canari signé
Source de vérité: dépôt canonique et document Phase 2 dans CFSB Codex HQ

## 1. Contexte

Hosting distribue encore la 0.6.8. La 0.6.9 scellée a réussi les imports historiques, mais elle pointe vers un marqueur de route antérieur aux Web Apps actuelles et son extraction API ne prouve pas la pagination au-delà d'une page. Un ancien build intermédiaire réutilisait aussi le numéro 0.6.9, ce qui rend toute consigne « installe la 0.6.9 » ambiguë.

## 2. Objectif

Fournir un paquet 0.6.10 unique, reproductible et testable qui:

- ouvre seulement `/team/{coachId}/clients` pour le coach sélectionné;
- utilise la route v79 autorisée;
- extrait le roster API actif et archivé avec l'authentification Bearer éprouvée en 0.6.9;
- déduplique exclusivement par identifiant CoachRx stable;
- refuse un roster vide, partiel, incohérent ou attribué au mauvais coach;
- conserve le dernier roster Dashboard valide lors d'un échec;
- peut être retiré rapidement sans modifier les données historiques.

## 3. Source de vérité

- Source immuable: `releases/coachrx-extension/v0.6.9/source`.
- ZIP de référence: `coachrx-sync-extension-0.6.9-live.zip`.
- SHA-256 de référence: `8DCD90C3B1CCC2872430B0B60B2BFE7D60C6E4A3ED8A21CA9857FD2BF0008D30`.
- Base Hosting: snapshot live `releases/dashboard-hosting/2026-07-19T000445Z`, jamais le dossier public périmé sans réconciliation.

## 4. Décisions

| Date | Décision | Raison | Impact | Décidé par |
| --- | --- | --- | --- | --- |
| 2026-07-19 | Ne pas revenir à la 0.6.3 | Elle ne contient pas les protections d'identité et de route récentes | La correction part de la 0.6.9 scellée | Codex, selon le diagnostic autorisé par Michael |
| 2026-07-19 | Publier sous 0.6.10 | Plusieurs builds différents ont déjà porté le numéro 0.6.9 | Un seul numéro correspondra au nouveau hash | Codex |
| 2026-07-19 | Tester avant toute annonce d'installation | Le Dashboard live contient encore des agrégats contradictoires | Le message équipe attend le canari | Michael / Codex |
| 2026-07-19 | Utiliser un canal Preview sans domaine Auth | Valider le vrai téléchargement sans changer la production ni l'authentification | Le ZIP 0.6.10 est testable à une URL temporaire; le live reste 0.6.8 | Codex |

## 5. Construction

Le candidat doit contenir:

- `manifest.json` version 0.6.10;
- `popup.js` identique à la 0.6.9 scellée, sauf la version et le marqueur de provenance v79;
- le même modèle de permissions minimales que la 0.6.9;
- les icônes et fichiers statiques scellés;
- un README sans secret;
- un manifeste de release avec hashes fichier par fichier;
- un ZIP déterministe reconstruit avec le script fourni.

Tests minimaux:

1. portefeuille complet de 21 actifs et 31 archives;
2. portefeuille de 42 actifs;
3. actif incomplet;
4. archive incomplète;
5. état client inconnu;
6. compteur UI/API discordant;
7. mauvais coach ou page générique;
8. authentification Bearer présente dans la requête et absente du résultat;
9. contenu et structure exacte du ZIP;
10. deuxième reconstruction au même hash.

Le hotfix ne modifie pas la stratégie d'extraction déjà validée sur les sept coachs. Toute évolution de pagination sera un changement séparé avec preuve live de troncature et tests dédiés.

## 6. Validation canari

Ordre obligatoire:

1. petit portefeuille pilote;
2. portefeuille de 21 actifs et 31 archives;
3. portefeuille de 42 actifs;
4. quatre autres coachs un par un;
5. répétition des sept synchronisations sans changement source.

Pour chaque coach, conserver uniquement les agrégats suivants:

- coach attendu et route reconnue;
- nombre actif CoachRx;
- nombre archivé CoachRx;
- nombre API extrait;
- identifiants stables présents;
- résultat import;
- créations, mises à jour et conflits;
- hash/version de l'extension.

Verdict GO seulement si:

- actifs et archives concordent exactement;
- aucun identifiant n'apparaît dans deux portefeuilles;
- aucune fiche Dashboard seulement n'est rendue obsolète;
- aucun responsable Dashboard n'est déplacé automatiquement;
- la répétition produit zéro nouveau client et zéro dérive;
- le Dashboard charge les mêmes totaux que la projection Firestore correspondante.

## 7. Publication

Avant publication:

- créer un tag Git immuable;
- reconstruire le ZIP et comparer son hash;
- préparer Hosting depuis le snapshot live, avec seulement les changements approuvés;
- déployer d'abord sur un canal Preview Firebase;
- vérifier le téléchargement, le type MIME, le nom et le hash;
- ne basculer la route publique qu'après le canari.

Ne jamais remplacer silencieusement un ZIP existant sous le même nom ou numéro.

## 8. Retour arrière

En cas d'écart:

1. arrêter les synchronisations suivantes;
2. remettre le lien public vers le ZIP 0.6.8 scellé;
3. conserver le dernier roster valide de chaque coach;
4. ne supprimer ni fusionner aucune fiche créée pendant l'investigation;
5. isoler le lot par `importRunId`;
6. comparer les agrégats avant/après;
7. corriger sous un nouveau numéro de version.

Le rollback de distribution n'autorise pas un rollback destructif des données.

## 9. Messages prêts à utiliser

### Message temporaire si un coach demande avant le canari

> L'import CoachRx est en mise à jour contrôlée. N'installe pas un ancien fichier trouvé dans tes téléchargements et ne relance pas plusieurs fois la synchronisation. Le Dashboard reste disponible pour les suivis déjà présents. La nouvelle version et une procédure courte seront publiées dès que les compteurs actifs et archivés auront été validés.

### Message de diffusion après verdict GO

> La version CoachRx Sync 0.6.10 est prête. Télécharge-la uniquement depuis le Guide du Dashboard, remplace l'ancienne extension, puis ouvre la page Clients CoachRx de ton propre profil. Vérifie que le coach affiché dans l'extension correspond à la page avant de cliquer « Mettre à jour CoachRx ». Si le résultat n'indique pas « Terminé » avec les bons compteurs, arrête-toi et écris à Michael; ne relance pas plusieurs fois.

## 10. Journal

| Date | Mise à jour | Fait par | Prochaine action |
| --- | --- | --- | --- |
| 2026-07-19 | Runbook initial créé à partir des preuves 0.6.8/0.6.9 et du diagnostic live | Codex | Construire et tester le candidat 0.6.10 |
| 2026-07-19 | Candidat 0.6.10 reconstruit trois fois au SHA-256 `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D`; 9 scénarios réussis | Codex | Vérifier le paquet réellement servi |
| 2026-07-19 | Canal Preview `coachrx-0610-candidate` déployé sans ajout de domaine Auth; ZIP HTTP 200, `application/zip`, 29 231 octets et hash exact; live revérifié inchangé en 0.6.8 | Codex | Faire un canari signé avec un coach autorisé avant toute diffusion générale |
