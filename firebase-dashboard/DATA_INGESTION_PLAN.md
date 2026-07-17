# Plan technique d'ingestion - Dashboard Coach CFSB

Derniere mise a jour: 2026-06-09

## Objectif

Ce document transforme le registre des sources en plan d'execution. Le but est d'eviter les doublons de plomberie:

```text
Source vivante -> file Firestore privee `syncRequests` -> Cloud Function securisee -> Firestore -> Dashboard
```

Google Sheets peut rester un backup, un audit ou une source temporaire. Il ne doit pas etre ajoute comme passage obligatoire si Apps Script, Bob Operator, CoachRx ou GHL possedent deja la donnee vivante.

Le registre machine-readable est:

```text
firebase-dashboard/SOURCE_REGISTRY.json
```

Chaque pont direct doit correspondre a un `ingestionContract` du registre.

Les formats de payload acceptes sont controles par:

```text
firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json
firebase-dashboard/SOURCE_PAYLOAD_PLAYBOOK.md
```

Le premier fichier sert aux validations automatiques. Le second sert a Bob Operator, Apps Script ou a une extension CoachRx pour preparer un lot de 1 a 3 lignes, lancer `previewDashboardImportPayload_`, puis seulement ensuite appeler `pushDashboardSourceToFirebase_`.

La matrice d'activation operationnelle est:

```text
firebase-dashboard/DATA_SOURCE_ACTIVATION_MATRIX.md
```

Elle precise l'ordre d'activation, les preuves de pret, les blocages et les rollbacks source par source.

## Endpoint d'ingestion

```text
POST https://us-central1-cfsb-dashboard-coach-aa9a4.cloudfunctions.net/ingestDashboardSource
```

Authentification serveur-a-serveur:

```text
Authorization: Bearer <principal Google/Firebase autorise>
X-CFSB-Import-Token: DASHBOARD_IMPORT_TOKEN
```

La Function HTTP `ingestDashboardSource` est deployable et protegee par `DASHBOARD_IMPORT_TOKEN` dans le header `X-CFSB-Import-Token`, mais le projet pilote bloque la modification IAM/Cloud Run invoker qui rendrait cet endpoint appelable directement depuis Apps Script.

Le chemin recommande pour les scripts Google Workspace est donc:

```text
Apps Script prive -> Firestore REST avec ScriptApp.getOAuthToken() -> syncRequests/{requestId} -> processSyncRequest -> collections operationnelles
```

Ce chemin utilise `firebase-dashboard/apps-script/dashboard-firestore-sync-request-queue.gs`. Il ne requiert pas `DASHBOARD_IMPORT_TOKEN` dans Apps Script et conserve la logique de merge cote Firebase Functions.

Le token HTTP doit rester seulement dans:

- Firebase Secret Manager;
- Apps Script Script Properties;
- un environnement serveur prive.

Il ne doit jamais etre dans GitHub Pages, dans `firebase-dashboard/public`, dans une URL rebooking publique ou dans un document partage a l'equipe.

## Contrats actifs

| Contrat | `sourceType` | Source vivante | Collection cible | Etat |
| --- | --- | --- | --- | --- |
| `coachrx_clients_direct` | `coachrx_clients` | CoachRx extension / Apps Script | `clients` | Backend pret, transport Firestore queue pret pour pilote |
| `client_directory_direct` | `client_directory` | CSM/Kilo/admin | `clients` | Backend pret, source officielle a confirmer |
| `ghl_contacts_phone_enrichment` | `ghl_contacts` | GoHighLevel | `clients` | Pont serveur securise a brancher |
| `questionnaire_responses_direct` | `questionnaire_responses` | Questionnaire client-coach | `questionnaireResponses` | Backend pret, Sheet encore filet de securite |
| `rebooking_direct` | `rebooking` | App rebooking legacy | `rebookings` | A auditer avant writeback |
| `csm_checkups_direct` | `checkups` | CSM checkups | `checkups` | Backend pret, pont source a brancher |

## Politique de chemin par source

Le registre `SOURCE_REGISTRY.json` contient maintenant une `pathPolicy` pour chaque contrat. Cette politique empeche de recréer des doublons de plomberie et repond a la question: est-ce que cette source doit passer par un Google Sheet, ou peut-elle pousser directement vers Firestore?

| Source | Chemin prefere | Role du Sheet | Premier pilote | Gate avant production |
| --- | --- | --- | --- | --- |
| CoachRx clients | Direct vers Firestore | Sheet seulement backup/audit | Marc-Andre ou Iheb avec 1 a 3 clients visibles | Transport authentifie + token import + preview Apps Script/extension |
| Repertoire client CSM/Kilo | Direct si le script possede deja la source | Sheet permis si c'est le repertoire admin actuel | Un client connu avec telephone manquant | Source exacte confirmee + valeurs vides protegees |
| GHL telephones | Lookup serveur vers Firestore | Aucun Sheet pour payload prive GHL | Michael Grondin `8192771825`, puis un vrai client coach | Secret GHL seulement serveur / Script Properties |
| Questionnaire | Direct vers Firestore quand endpoint pret | Backup/reconciliation temporaire | Une ligne test et une vraie ligne pour le meme telephone | Parser par cle + file a valider |
| Rebooking | Legacy en parallele, puis Firestore apres parite | Source legacy jusqu'a preuve | Marc-Andre: comparer compte ouvert legacy vs Firestore | Parite legacy avant migration rebooking |
| Check-ups CSM | Direct ou Sheet si le formulaire vit dans Sheet | Source si Google Form Sheet est le systeme courant | Une ligne matchee par telephone/coach | Normalisation coach/telephone et lecture seule client |

Regles pratiques:

- Sheet seulement backup/audit quand une source vivante peut deja pousser vers Firebase.
- Aucun Sheet pour payload prive GHL; le navigateur et les fichiers publics ne doivent jamais voir les donnees/tokens GHL.
- Parite legacy avant migration rebooking: l'app actuelle reste le filet de securite tant que les statuts ne matchent pas.
- Un pont direct commence toujours par un petit pilote et un `preview` avant ecriture Firestore.

## Politique telephone

Le telephone est le point de jonction entre Clients, Questionnaires, GHL et Rebooking. La politique machine-readable est dans:

```text
firebase-dashboard/SOURCE_REGISTRY.json -> phoneResolutionPolicy
```

Ordre de decision:

1. `dashboard_manual`: correction humaine prioritaire, jamais effacee par une valeur vide.
2. `gohighlevel`: meilleure source pour confirmer un contact et enrichir un client existant, mais seulement cote serveur.
3. `client_directory`: repertoire CSM/Kilo/admin pour combler telephone, courriel et membership.
4. `coachrx_clients`: utile si un telephone existe, mais pas considere complet.
5. `questionnaire_responses`: sert au matching et a la file `A valider`; ne remplace pas automatiquement la fiche client.
6. `rebooking`: signal operationnel fragile; ne corrige pas l'identite client par lui-meme.

Regles:

- une valeur vide ne remplace jamais un telephone utile;
- deux telephones differents pour un meme client vont en validation admin;
- un contact GHL sans client existant est journalise comme non matche et ne cree pas de client actif;
- l'envoi questionnaire exige un telephone normalise et un match GHL exact;
- la fiche client doit exposer la source principale du telephone et le diagnostic de matching.

## Ordre recommande

### 1. CoachRx vers Firestore

Priorite la plus haute pour le pilote, parce que le dashboard doit afficher le vrai portefeuille client de chaque coach.

Chemin cible:

```text
CoachRx extraction -> ingestDashboardSource(sourceType=coachrx_clients) -> clients
```

Champs minimum:

- `coachRxId` ou `coachName`;
- nom client.

Champs fortement recommandes:

- telephone;
- courriel;
- package actif;
- ID source client;
- contexte programme.

Regle de merge:

- telephone normalise gagne;
- ensuite ID source;
- ensuite nom normalise;
- une valeur vide ne remplace jamais une valeur utile;
- les champs manuels coach restent proteges.

Garde-fou special:

`coachrx_clients` peut representer un snapshot complet. Il peut donc marquer comme `import_stale` seulement les anciens imports CoachRx de la meme famille, jamais les fiches manuelles.

### 2. CSM / Kilo / repertoire client vers Firestore

But: combler les telephones, courriels, memberships et check-ups que CoachRx ne fournit pas toujours.

Chemin cible:

```text
CSM/Kilo/admin -> ingestDashboardSource(sourceType=client_directory) -> clients
CSM checkups -> ingestDashboardSource(sourceType=checkups) -> checkups
```

Regles:

- `client_directory` enrichit les fiches client;
- `checkups` alimente Performance et historique;
- la fin de membership reste manuelle dans le dashboard;
- la recurrence prevue dans Kilo reste manuelle dans le dashboard;
- les check-ups ne modifient pas les champs manuels client.

### 3. GHL comme enrichissement telephone et action SMS

GHL est probablement la source la plus fiable pour retrouver/confirmer un contact par telephone, mais il doit rester cote serveur.

Chemin cible pour enrichissement:

```text
Firebase Function ou Apps Script prive -> ingestDashboardSource(sourceType=ghl_contacts) -> clients
```

Chemin cible pour envoyer le questionnaire:

```text
Dashboard -> sendQuestionnaire Cloud Function -> GHL tag dashboardcoach
```

Regles:

- GHL peut ajouter ou confirmer `phoneNormalized`, `email` et `contactId`;
- GHL ne peut jamais supprimer, archiver ou perimer un client;
- l'appel GHL ne doit jamais partir du navigateur;
- chaque tentative d'envoi questionnaire doit etre journalisee dans Firestore, meme si GHL echoue.

### 4. Questionnaire client-coach

Chemin actuel acceptable:

```text
Questionnaire -> Google Sheet Responses/Test_Responses -> sync -> Firestore
```

Chemin cible:

```text
Questionnaire endpoint -> ingestDashboardSource(sourceType=questionnaire_responses) -> questionnaireResponses
```

Regles:

- matching principal par telephone normalise;
- reponse non matchee = file `A valider`;
- la lecture/archive par coach ne modifie pas le contenu client;
- jaune/orange/rouge peut creer une vraie To-do coach;
- vert va surtout dans l'historique client.

### 5. Rebooking

Le rebooking est utile, mais il ne doit pas casser l'app Apps Script legacy que les coachs peuvent deja utiliser.

Chemin actuel:

```text
App Apps Script rebooking -> source legacy / Sheet -> dashboard ou sync Firestore
```

Chemin cible:

```text
AUTO-003 Apps Script -> ingestDashboardSource(sourceType=rebooking) -> rebookings
```

Regles:

- audit de la source legacy avant de brancher le write direct;
- un item `managed`, `rebooked` ou `coach_absence` dans Firestore ne redevient pas ouvert par reimport;
- historique et bouton `Reouvrir` doivent rester disponibles;
- les URLs Apps Script tokenisees ne vont jamais dans les assets publics.

## Payload minimal commun

```json
{
  "sourceType": "coachrx_clients",
  "coachRxId": "15935",
  "coachName": "Marc-Andre Menard",
  "requestedBy": "apps_script",
  "records": []
}
```

Le backend accepte aussi:

- `source` ou `kind` au lieu de `sourceType`;
- `coachId`, `teamId` ou `coachTeamId` au lieu de `coachRxId`;
- `rows` ou `data` au lieu de `records`.

## Diagnostic attendu

Chaque import direct doit ecrire:

- `sourceImportRuns/{runId}`;
- `coachSyncStatus/{coachId}`;
- la collection cible.

Le dashboard doit pouvoir expliquer:

- quand la source a ete synchronisee;
- combien de lignes ont ete recues;
- combien de documents ont ete ecrits;
- combien de clients/rebookings/reponses ne sont pas matches;
- quelles sources sont encore temporaires;
- quelle prochaine action admin est recommandee.

## Ce qui peut etre fait sans Michael

- garder les contrats d'ingestion alignes avec le backend;
- renforcer les validateurs;
- documenter les scripts Bob/Apps Script a modifier;
- preparer les snippets Apps Script sans token;
- proteger les merges contre les valeurs vides et les suppressions non voulues;
- auditer les fichiers locaux et les rapports Bob existants.

## Ce qui demande un acces ou une validation humaine

- creer/renouveler `DASHBOARD_IMPORT_TOKEN`;
- confirmer le script Apps Script vivant a modifier;
- deployer une version Functions si Firebase redemande l'authentification;
- tester un vrai SMS GHL;
- valider avec un coach qu'une To-do affichee correspond bien a son contexte CoachRx.

## Definition de pret pour brancher une source

Une source peut etre branchee quand:

1. elle a un `ingestionContract` dans `SOURCE_REGISTRY.json`;
2. le `sourceType` est supporte par `functions/index.js`;
3. la collection cible a une regle Firestore;
4. le payload minimal est documente;
5. les champs de matching sont connus;
6. le rollback est explicite;
7. aucun secret ou lien tokenise n'est publie;
8. la validation locale passe.
