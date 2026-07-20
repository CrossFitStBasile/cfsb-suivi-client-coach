# Rapport consolidé de validation — Phase 2

Projet: Dashboard Coach CFSB / CoachRx

Date locale: 2026-07-19

Verdict indépendant: **GO pour commit; NO-GO pour déploiement live ou diffusion générale**

## Résultat

La tranche Phase 2 est prête à être scellée comme candidat. Elle fournit un
writer CoachRx canonique derrière une double porte d'activation, des commandes
client explicites, des lectures coach basées sur la responsabilité Dashboard,
un plan de backfill sans écriture et l'extension 0.6.10 reproductible.

La production demeure volontairement inchangée. Le seul changement distant est
un canal Firebase Hosting Preview isolé, sans ajout de domaine Firebase Auth.

## Extension 0.6.10 et Preview

- artefact: `coachrx-sync-extension-0.6.10-live.zip`;
- taille: `29 231` octets;
- SHA-256: `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D`;
- delta par rapport à la 0.6.9 scellée: version `0.6.10` et marqueur de route
  `20260719-v79` seulement;
- extraction, authentification Bearer, identité, compteurs et URL Apps Script:
  identiques à la 0.6.9 scellée;
- canal Preview: `coachrx-0610-candidate`;
- URL Preview:
  `https://cfsb-dashboard-coach-aa9a4--coachrx-0610-candidate-mgr2j4gv.web.app`;
- expiration Preview: 2026-07-26 23:04:53, heure America/Toronto;
- vérification Preview: 77 fichiers exacts; ZIP reçu en HTTP 200,
  `application/zip`, même taille et même SHA-256;
- production revérifiée après le Preview: toujours 0.6.8, SHA-256 public
  `38B2FD295894D76D805D64F07928A043ACF1D142E0052F645637FF6EFD8448A9`.

## Contrat canonique et cycle de vie

Le scénario confirmé par Michael est conservé: un client peut être créé dans le
Dashboard, être lié à GHL, recevoir un questionnaire et ne jamais exister dans
CoachRx. S'il rejoint CoachRx plus tard, son identité Dashboard ne change pas;
le lien CoachRx est proposé puis confirmé explicitement.

Le roster CoachRx ne déplace jamais automatiquement
`dashboardResponsibleCoachId`. Les fiches Dashboard seulement, les overrides
manuels et l'historique restent intacts. Une absence dans un roster complet
ferme seulement l'engagement CoachRx déterministe; elle ne supprime aucune
fiche, note, réponse ou action.

Le writer canonique reste OFF tant que le payload et la configuration serveur
`systemConfig/clientContractPhase2` ne satisfont pas simultanément toutes les
conditions de version, backfill, claims vérifiés et coach pilote. Cette
configuration d'activation n'existe pas actuellement.

## Dry-run privé

Source scellée:
`C:\Users\micha\AppData\Local\CFSB-dashboard-phase0\2026-07-19T203948Z\firestore-clients.json`

SHA-256:
`F24C47AC89B772ED568E2BCE00E3BA9E1B73A602FCFC25BEA0D3644A36556C85`

- 313 fiches analysées;
- 165 identifiants CoachRx stables à migrer;
- 145 prêts et 20 à revoir pour l'appartenance;
- 3 revendications CoachRx actives sans identifiant stable à revoir;
- 9 clients Dashboard seulement valides;
- 121 fiches historiques ou inactives différées;
- 0 collision d'identifiant CoachRx;
- 0 donnée personnelle émise et 0 écriture.

## Défauts critiques trouvés et corrigés pendant la revue

1. Une requête legacy `where(coachId == A)` pouvait lister une fiche canonique
   transférée à B, même si sa lecture directe était refusée. Les listes coach
   sont maintenant canoniques seulement sur onze collections; les lectures
   directes legacy sont conservées pour la migration et l'admin reste inchangé.
2. Les neuf abonnements frontend coach utilisent exclusivement
   `dashboardResponsibleCoachId`; les requêtes legacy sont réservées à l'admin.
3. Le fingerprint d'idempotence couvre maintenant le contenu contractuel du
   roster, ses compteurs, son horodatage, son chemin et son run stable.
4. L'invariant entre l'UUID interne et l'identifiant du document est vérifié
   avant claim ou signal téléphonique.
5. `sourceGeneratedAt` est obligatoire, normalisé et refusé s'il est invalide
   ou trop futur; `sourceRunId` ne retombe jamais sur un identifiant de transport
   éphémère.

## Matrice finale

| Domaine | Résultat |
| --- | ---: |
| Functions et contrats backend | 59/59 |
| Frontend, dry-run et générateur live rebase | 38/38 |
| Firestore + Storage Emulator | 22/22 |
| Extension 0.6.10 | 9/9 |
| Fichiers du Preview vérifiés | 77/77 |
| Vérifications syntaxiques | Réussies |
| `git diff --check` | Réussi; avertissements de fin de ligne seulement |

La revue indépendante ne relève aucun P0 ou P1 restant dans le périmètre du
candidat et autorise son commit.

## Portes encore fermées

- aucun déploiement de Functions, Rules ou candidat Dashboard;
- aucun backfill ni claim live;
- aucune bascule du lien public vers 0.6.10;
- aucun pop-up, message équipe ou consigne d'installation;
- aucune synchronisation CoachRx déclenchée pendant le diagnostic.

Le live reste NO-GO jusqu'au backfill et à la résolution des dossiers legacy,
au canari dans une session CoachRx signée, à la répétition idempotente et à la
réconciliation des sept coachs. Déployer seulement les nouvelles Rules avant le
backfill masquerait les fiches legacy aux entraîneurs.

## Prochaine porte GO

1. charger le ZIP exact du Preview dans une session CoachRx signée;
2. tester un petit portefeuille, puis 21 actifs/31 archives et 42 actifs;
3. répéter sans changement et exiger zéro création ou déplacement inattendu;
4. comparer la projection Dashboard et les responsabilités;
5. terminer les sept coachs;
6. seulement ensuite basculer le lien public et envoyer le message préparé.

Rollback immédiat: ne pas basculer le live et laisser expirer le canal Preview.
La 0.6.8 publique et le dernier roster valide demeurent les points de retour.
