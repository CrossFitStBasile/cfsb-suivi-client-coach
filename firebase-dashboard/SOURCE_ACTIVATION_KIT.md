# Kit d'activation des sources - Dashboard Coach CFSB

Derniere mise a jour: 2026-06-08

## 1. Context

Le Dashboard Coach Firebase devient l'outil operationnel des coachs. Les donnees arrivent encore de plusieurs endroits: CoachRx, Kilo/CSM, GoHighLevel, questionnaire client-coach, check-ups, rebooking et quelques Google Sheets historiques.

Ce kit transforme le plan d'architecture en procedure de branchement. Il evite de rajouter des Google Sheets intermediaires lorsque le script source possede deja la donnee vivante.

Flux cible:

```text
Source vivante -> preview source privee -> Cloud Function securisee -> Firestore -> Dashboard
```

Google Sheets reste un backup, un journal d'audit ou une source temporaire. Firestore devient la base operationnelle lue par le dashboard.

## 2. Objective

Activer chaque source sans casser les usages actuels, sans publier de secret et sans creer de faux signaux coach.

Chaque activation doit prouver:

- le bon `sourceType`;
- le bon coach;
- la bonne cible Firestore;
- un preview valide avant write;
- un write limite a un coach pilote;
- un rollback clair;
- une preuve visible dans `sourceImportRuns`, `coachSyncStatus` et l'onglet pertinent du dashboard.

## 3. Source of Truth

References a lire avant toute activation:

- `firebase-dashboard/SOURCE_REGISTRY.json`
- `firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json`
- `firebase-dashboard/SOURCE_PAYLOAD_SAMPLES.json`
- `firebase-dashboard/SOURCE_PAYLOAD_PLAYBOOK.md`
- `firebase-dashboard/SOURCE_ACTIVATION_STATUS.json`
- `firebase-dashboard/DATA_INGESTION_PLAN.md`
- `firebase-dashboard/DATA_SOURCE_ACTIVATION_MATRIX.md`
- `firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md`
- `firebase-dashboard/BOB_OPERATOR_SOURCE_HANDOFF.md`
- `firebase-dashboard/apps-script/dashboard-import-bridge-template.gs`
- `functions/index.js`

Les sources vivantes gardent leur responsabilite:

- CoachRx: portefeuille client, contexte programme, statut actif cote coach;
- client directory / CSM / Kilo / admin: telephone, courriel, membership, donnees admin;
- GHL: contactId, telephone confirme et envoi SMS cote serveur;
- questionnaire: reponses, triage, action coach suggeree;
- check-ups CSM: historique et metriques Performance;
- rebooking legacy: etat actuel des dossiers a rebooker pendant la migration.

## 4. Current State

- Le backend accepte les `sourceType` directs.
- Le template Apps Script expose `previewDashboardImportPayload_` et `pushDashboardSourceToFirebase_`.
- `DASHBOARD_IMPORT_TOKEN` doit etre gere dans Firebase Secret Manager et dans les Script Properties du script prive.
- Le rebooking actuel reste le filet de securite.
- Le questionnaire et GHL doivent rester server-side pour ne pas exposer de donnees client ou de token.
- Les champs manuels client restent proteges:
  - fin membership;
  - recurrence Kilo;
  - risque coach;
  - notes et objectifs.

## 5. Decisions Made

- Firestore est la base operationnelle du dashboard.
- Les Google Sheets ne sont pas un passage obligatoire si un script peut pousser directement vers Firestore.
- Chaque source doit d'abord passer par un preview local prive.
- GHL ne doit jamais etre appele depuis le navigateur.
- Rebooking Firebase ne remplace pas l'app legacy avant comparaison source a source.
- Une valeur vide ne remplace jamais une valeur utile.
- Un import ne doit pas rouvrir une tache ou un rebooking ferme, masque, rebooke ou en absence coach.

## 6. Phased Plan

1. Activer CoachRx direct pour un coach pilote.
2. Ajouter `client_directory` pour combler telephone/courriel/membership.
3. Ajouter GHL en enrichissement serveur, sans action destructive.
4. Importer questionnaire V2 en inbox coach robuste.
5. Importer check-ups CSM pour Performance et historique client.
6. Comparer rebooking Firebase et app legacy, puis activer seulement apres parite.

## 7. Deliverables

- Un pont prive par source vivante, base sur `dashboard-import-bridge-template.gs` ou une Cloud Function dediee.
- Un preview documente pour chaque source.
- Un premier write par coach pilote.
- Un journal `sourceImportRuns`.
- Un statut `coachSyncStatus`.
- Une preuve visible dans le dashboard.
- Un rollback par source.
- Une note de suivi dans ce kit ou dans le handoff pilote.

## 8. Owners

- Michael: autoriser l'acces aux scripts/sources vivantes et confirmer les sources reelles quand le code ne peut pas les deviner.
- Bob Operator: inspecter ou adapter les Apps Script prives apres approbation explicite.
- Codex: maintenir les contrats, validations, docs, backend Firebase, UI dashboard et scripts de verification.
- Gabriel / admin CFSB: valider les decisions operationnelles si elles changent l'usage des coachs.

## 9. Risks and Unknowns

- Certains exports peuvent contenir des noms parasites ou des lignes de coach au lieu de clients.
- Certains clients actifs peuvent manquer de telephone dans une source, mais etre presents dans GHL ou CSM.
- Un client manuel peut apparaitre plus tard dans CoachRx; la fusion doit se faire par telephone avant nom.
- Rebooking a une app active; une migration incomplete pourrait creer deux verites concurrentes.
- Les questions du questionnaire peuvent changer; le dashboard doit lire par cle et tolerer les champs inconnus.
- Les permissions Firebase/Apps Script peuvent bloquer un deploy ou un write direct.

## 10. Next Actions

1. Choisir une source pilote.
2. Verifier son etat courant dans `SOURCE_ACTIVATION_STATUS.json`.
3. Copier le template de pont dans le script prive source.
4. Ajouter `DASHBOARD_IMPORT_TOKEN` dans Script Properties.
5. Comparer le format avec `SOURCE_PAYLOAD_SAMPLES.json`.
6. Lancer `previewDashboardImportPayload_` avec 1 a 3 lignes.
7. Comparer les cles detectees avec `SOURCE_PAYLOAD_CONTRACTS.json`.
8. Lancer un write pour un seul coach.
9. Verifier `sourceImportRuns`, `coachSyncStatus` et le dashboard.
9. Documenter les ecarts et le rollback.
10. Passer a la source suivante seulement si la source pilote est stable.

## 11. Follow-up Log

| Date | Source | Etat | Preuve | Prochaine action |
| --- | --- | --- | --- | --- |
| 2026-06-08 | Tous | Kit cree | Validation locale dans le pipeline complet | Garder le kit dans le pipeline |
| 2026-06-08 | Tous | Statut source cree | `SOURCE_ACTIVATION_STATUS.json` | Utiliser ce statut avant tout pont live |

## Activation cards

### CoachRx clients

SourceType: `coachrx_clients`

But: importer le portefeuille client et le contexte programme directement depuis l'extraction CoachRx, sans forcer un Google Sheet si le script possede deja la donnee.

Preflight obligatoire:

- `previewDashboardImportPayload_` avec `coachRxId`, `coachName` et 1 a 3 clients;
- verifier `Client`, `Phone`, `Email`, `Membership`, `Program` ou alias equivalents;
- confirmer que les lignes parasites comme jours de semaine, initiales ou nom du coach ne sont pas importees comme clients;
- confirmer que les To-do ne se remplissent pas de faux programmes.

Write guard:

- un coach pilote;
- aucune valeur vide ne remplace une valeur utile;
- les champs manuels ne sont jamais recalcules.

Preuve de succes:

- `sourceImportRuns` contient `coachrx_clients`;
- `coachSyncStatus` montre le dernier lot;
- `Clients` affiche le portefeuille attendu;
- les To-do visibles viennent de sources d'action, pas d'un contexte CoachRx ambigu.

Rollback:

- ignorer ou archiver le lot direct;
- revenir a la lecture historique Sheets/Firestore;
- conserver les clients manuels et champs manuels.

Ne pas faire:

- ne pas publier de snapshot client dans GitHub Pages;
- ne pas creer de taches programme depuis une colonne ambigue sans preuve d'action.

### Client directory

SourceType: `client_directory`

But: enrichir les clients avec telephone, courriel, membership et donnees admin fiables.

Preflight obligatoire:

- verifier que la source officielle des telephones est identifiee;
- preview avec 1 a 3 clients dont au moins un sans telephone dans Firestore;
- confirmer le matching par telephone normalise, puis sourceId, puis nom seulement si necessaire.

Write guard:

- une valeur vide ne remplace jamais une valeur utile;
- fin membership manuelle et recurrence Kilo restent modifiables seulement par le dashboard ou admin autorise;
- aucun transfert coach automatique sans preuve.

Preuve de succes:

- le compteur `Sans telephone` baisse;
- `Envoyer questionnaire` devient disponible pour les clients enrichis;
- les dates manuelles restent identiques apres import.

Rollback:

- desactiver le pont;
- conserver les champs enrichis deja verifies;
- corriger les mauvais matches via fiche client/admin.

Ne pas faire:

- ne pas recalculer la fin membership;
- ne pas ecraser une note coach par une valeur vide.

### GHL contacts

SourceType: `ghl_contacts`

But: enrichir contactId/telephone et soutenir l'envoi SMS questionnaire sans exposer GHL.

Preflight obligatoire:

- execution cote serveur seulement;
- token GHL dans secret serveur, jamais dans fichier public;
- match exact du telephone normalise;
- preview d'un contact connu.

Write guard:

- GHL enrichit seulement;
- GHL ne supprime pas, ne perime pas et ne transfere pas un client;
- erreurs GHL journalisees dans `questionnaireSends` ou `sourceImportRuns`.

Preuve de succes:

- contactId associe au bon telephone;
- un envoi questionnaire retourne une confirmation ou une erreur explicite;
- aucun document client n'est marque stale par GHL.

Rollback:

- desactiver l'enrichissement GHL;
- garder l'envoi questionnaire en erreur explicite;
- corriger contact/telephone dans GHL ou client directory.

Ne pas faire:

- ne pas appeler GHL depuis le navigateur;
- ne pas accepter le premier resultat GHL si le telephone ne correspond pas.

### Questionnaire responses

SourceType: `questionnaire_responses`

But: alimenter une inbox coach lisible et actionnable.

Preflight obligatoire:

- lire par cle de champ, pas par ordre de colonne;
- verifier `client_phone_normalized`, `coach_name`, `triage_status`, `coach_action_type`;
- accepter les nouveaux champs dans `Autres reponses` sans briser l'inbox.

Write guard:

- contenu de reponse immutable;
- reponse non matchee dans `A valider`;
- aucune fausse To-do pour un questionnaire non envoye;
- relance seulement apres 7 jours suivant un vrai envoi sans reponse.

Preuve de succes:

- `Reponses a lire` affiche les nouvelles reponses;
- rouge/orange/jaune/vert sont des signaux visuels, pas une surcharge de filtres;
- le coach peut marquer `Lu` ou `Creer une mission`.

Rollback:

- continuer la lecture Sheet questionnaire;
- archiver un lot mal matche;
- corriger les alias ou le matching par telephone.

Ne pas faire:

- ne pas compter `non envoye` comme relance;
- ne pas rendre les cartes toutes grises si un signal prioritaire existe.

### Check-ups CSM

SourceType: `checkups`

But: alimenter Performance et l'historique client.

Preflight obligatoire:

- verifier coach, client, telephone/date;
- preview avec une plage recente;
- confirmer que la periode Performance lit la bonne date.

Write guard:

- lecture seulement pour metriques/historique;
- ne modifie pas les champs manuels client;
- ne cree pas de To-do par defaut.

Preuve de succes:

- Performance compte les check-ups par periode;
- la fiche client montre le dernier check-up ou l'historique pertinent.

Rollback:

- desactiver le pont;
- garder le formulaire/Sheet CSM comme registre admin.

Ne pas faire:

- ne pas utiliser les check-ups pour transferer un client de coach sans confirmation.

### Rebooking

SourceType: `rebooking`

But: integrer progressivement le rebooking sans casser l'app Apps Script actuelle.

Preflight obligatoire:

- comparer les compteurs avec l'app legacy;
- preview des dossiers ouverts, a clarifier, 24h+ et a suivre;
- verifier `Event ID`, client, date, service, statut;
- ne pas publier les URLs Apps Script tokenisees.

Write guard:

- un dossier `gere`, `rebooke` ou `absence coach` ne redevient pas ouvert par reimport;
- `Reouvrir` doit journaliser l'action;
- vacances/absence coach doit cibler seulement la plage.

Preuve de succes:

- Firebase et l'app legacy affichent les memes dossiers ouverts;
- les actions `Gere`, `Rebooke`, `Absence coach`, `Reouvrir` sont visibles et journalisees;
- l'historique reste lisible.

Rollback:

- garder l'app rebooking legacy comme source active;
- desactiver le write direct Firebase;
- utiliser le diagnostic pour comparer les ecarts avant correction.

Ne pas faire:

- ne pas remplacer l'app legacy tant que la parite n'est pas prouvee;
- ne pas dupliquer les dossiers d'un meme rendez-vous.

## Bob Operator handoff

Bob Operator peut aider a inspecter ou modifier les scripts prives, mais seulement apres approbation explicite de Michael pour une action live.

Procedure pour Bob:

1. Ouvrir le script source prive.
2. Verifier que le secret est dans Script Properties sous `DASHBOARD_IMPORT_TOKEN`.
3. Ajouter le pont depuis `dashboard-import-bridge-template.gs`.
4. Construire le payload minimal.
5. Lancer `previewDashboardImportPayload_`.
6. Ne lancer `pushDashboardSourceToFirebase_` que si Michael approuve le write ou si la source a deja ete autorisee.
7. Documenter le resultat dans ce kit ou dans le handoff.

### Bob Operator handoff packets

Ces paquets transforment le goal en travaux live isolables. Bob ne doit pas ajouter de Google Sheet obligatoire si le script source possede deja les lignes vivantes. Chaque paquet commence par un preview, puis un write limite a un seul coach pilote.

| Work package | SourceType | Script prive a inspecter | Payload a construire | Preuve preview | Premier write autorise | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| `coachrx_live_bridge` | `coachrx_clients` | Script/extension qui extrait les clients CoachRx par coach | Clients actifs, telephone si visible, courriel, membership, contexte programme | `sampleKeys` contient client, coach ou coachRxId, et aucune ligne parasite evidente | Un coach pilote avec 1 a 3 clients, puis validation Clients + To-do sans faux programmes | Desactiver le pont direct et ignorer les documents `direct_coachrx_extension` non valides |
| `client_directory_phone_bridge` | `client_directory` | Source officielle telephone/courriel/membership: GHL, CSM, Kilo ou repertoire admin confirme | Telephone normalise, courriel, membership, sourceId si disponible | Un client auparavant sans telephone apparait avec un telephone fiable | Un coach pilote, puis verifier que `Sans telephone` baisse sans toucher aux champs manuels | Desactiver la source et corriger les mauvais matches dans la fiche client |
| `ghl_private_enrichment` | `ghl_contacts` | Pont serveur ou Apps Script prive autorise a lire GHL | phone, contactId, email, name | Match exact du telephone normalise; aucun fallback au premier resultat | Enrichissement non destructif seulement, pas de stale, pas de transfert coach | Couper l'enrichissement GHL et garder les erreurs questionnaire explicites |
| `questionnaire_v2_inbox_bridge` | `questionnaire_responses` | Script de reception questionnaire V2 ou source AUTO-009 | response_id, submitted_at, client_phone_normalized, coach_name, triage_status, coach_action_type, reponses connues/inconnues | Une reponse rouge/orange/jaune/vert arrive dans la bonne vue ou `A valider` | Un lot test pour un coach pilote; marquer lu et creer une mission | Revenir a la lecture Sheet Responses/Test_Responses pendant correction |
| `checkups_csm_bridge` | `checkups` | Source CSM check-up / AUTO-002 | Date, client, telephone, coach, note, metriques utiles | Les dates et coachs sont lus par cle, pas par position de colonne | Un coach pilote, puis verifier Performance par periode et historique client | Desactiver le pont; garder CSM comme registre admin |
| `rebooking_legacy_parity_bridge` | `rebooking` | App Apps Script rebooking active / AUTO-003 | Event ID, client, telephone si disponible, date RDV, service, statut, historique | Les comptes ouverts Firebase et app legacy concordent sur un coach | Write seulement apres parite; aucun item ferme ne redevient ouvert | App legacy reste source active; desactiver le write direct Firebase |

Chaque paquet doit produire une note de preuve avec:

- sourceType;
- coach pilote;
- nombre de lignes preview;
- sourceImportRuns attendu ou observe;
- coachSyncStatus attendu ou observe;
- ecarts entre source vivante et dashboard;
- decision: continuer, corriger, ou rollback.

Secrets interdits dans les fichiers:

- mots de passe;
- API keys privees;
- tokens GHL;
- tokens Apps Script;
- `.env`;
- `token.json`;
- `oauth-client.json`.

