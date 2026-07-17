# Pont Apps Script vers Firebase - Dashboard Coach CFSB

Derniere mise a jour: 2026-06-09

## Objectif

Permettre aux scripts existants de CFSB d'envoyer leurs donnees directement dans Firestore sans passer obligatoirement par un Google Sheet intermediaire.

Le dashboard continue de lire Firestore seulement. Les Google Sheets peuvent rester comme backup, audit ou filet de securite, mais ils ne sont plus obligatoires pour les donnees que les scripts savent deja extraire.

Ce point est important pour CoachRx: si le script ou l'extension possede deja les donnees extraites, il peut les pousser directement vers Firebase. Le Google Sheet n'est plus requis comme passage technique; il devient seulement utile si on veut garder une copie humaine lisible ou un audit admin.

Bob Operator peut servir de couche d'execution pour les scripts Google Workspace: retrouver un projet Apps Script, lire sa structure, ajouter une fonction de push Firebase, configurer les Script Properties et produire une trace de changement. Bob n'est pas une source de donnees en soi; c'est un operateur pour connecter les vraies sources a Firebase.

Le registre officiel des sources est `firebase-dashboard/SOURCE_REGISTRY.json`. Un nouveau pont Apps Script doit correspondre a un `dataDomain` du registre, sinon il risque de creer un doublon ou une nouvelle source parallele difficile a reconciler.

Le plan technique `firebase-dashboard/DATA_INGESTION_PLAN.md` decrit les contrats `ingestionContracts` a respecter pour chaque source. Un Apps Script ne devrait pas pousser vers Firestore avec un `sourceType` absent de ce plan.

Le contrat de payload machine-readable est `firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json`. Le playbook humain est `firebase-dashboard/SOURCE_PAYLOAD_PLAYBOOK.md`. Ensemble, ils definissent les champs minimum, les alias attendus, les regles de merge et les preuves a verifier avant d'ecrire dans Firestore.

La matrice `firebase-dashboard/DATA_SOURCE_ACTIVATION_MATRIX.md` doit etre consultee avant de brancher une source vivante. Elle donne l'ordre recommande: CoachRx, repertoire client, GHL serveur, questionnaire/check-ups, puis rebooking seulement apres audit de l'app legacy.

Un template reutilisable est disponible dans `firebase-dashboard/apps-script/dashboard-import-bridge-template.gs`. Il peut etre copie dans un projet Apps Script prive, puis adapte a la source locale sans mettre de secret dans le code.

Un second fichier optionnel, `firebase-dashboard/apps-script/dashboard-live-source-adapters.gs`, contient des adaptateurs prets a coller dans les scripts vivants. Il sert a transformer les lignes deja disponibles dans CoachRx, CSM/Kilo, GHL, questionnaire ou rebooking en payloads Firebase standardises. C'est le chemin recommande lorsque le script possede deja la donnee: source vivante -> adaptateur Apps Script -> preview -> Cloud Function -> Firestore. Le Sheet reste alors backup/audit, pas passage obligatoire.

Le fichier `firebase-dashboard/apps-script/dashboard-firestore-sync-request-queue.gs` est maintenant le transport recommande dans le projet pilote. Il evite l'endpoint HTTP public: le script Apps Script ecrit une demande privee dans `syncRequests`, puis la Function `processSyncRequest` traite le lot cote serveur avec la meme logique d'import que `ingestDashboardSource`.

Le template inclut deux garde-fous locaux:

- `validateDashboardImportPayload_`: valide le `sourceType`, l'identite coach et la presence de lignes avant tout appel HTTP.
- `previewDashboardImportPayload_`: retourne un apercu sans ecrire dans Firebase (`preview_only_no_firebase_write`), avec le nombre de lignes et les cles detectees dans les premieres lignes.

Avant de brancher une source vivante, lancer le preview sur 1 a 3 lignes. Si le preview ne confirme pas le bon coach, le bon `sourceType` et les bonnes cles, ne pas pousser vers Firestore.

## Transport recommande

Chemin pilote:

```text
Source vivante privee -> preview Apps Script -> Firestore syncRequests -> processSyncRequest -> Firestore operationnel -> Dashboard
```

Pourquoi:

- l'organisation bloque l'ouverture publique de l'endpoint Cloud Run/Functions;
- Apps Script peut utiliser l'identite Google autorisee avec `ScriptApp.getOAuthToken()`;
- les secrets GHL/Firebase ne sont pas copies dans GitHub Pages;
- la logique de merge reste dans Firebase Functions, pas dans chaque script Google.

## Sync CSM quotidienne separee

Le CSM doit rester la source de verite pour les champs client administratifs
comme le membership actif, le telephone et le contexte de check-up. Il ne doit
pas determiner a lui seul le portefeuille d'un coach: le portefeuille vient de
CoachRx ou d'une action manuelle dans le dashboard.

Le fichier dedie a la synchronisation quotidienne est:

```text
firebase-dashboard/apps-script/dashboard-csm-daily-firestore-sync.gs
```

Il doit etre copie dans le projet Apps Script prive du CSM avec:

```text
firebase-dashboard/apps-script/dashboard-csm-firestore-bridge.gs
```

Roles separes:

- le script existant de mise a jour CSM continue de modifier/remplir le Google Sheet;
- le bridge CSM lit les donnees deja presentes dans le Sheet et cree les demandes `syncRequests`;
- le scheduler CSM installe un declencheur quotidien qui lance ce bridge vers Firebase.

Fonctions a utiliser dans Apps Script:

- `previewDashboardFirebaseCsmDailySync`: previsualise le lot sans ecrire dans Firestore;
- `runDashboardFirebaseCsmDailySync`: envoie le lot CSM vers `syncRequests`;
- `installDashboardFirebaseCsmDailyTrigger`: installe le declencheur quotidien vers 00 h 05, heure de Montreal;
- `listDashboardFirebaseCsmDailyTriggers`: confirme qu'un declencheur quotidien existe;
- `removeDashboardFirebaseCsmDailyTrigger`: supprime le declencheur quotidien.

Sequence recommandee:

1. Coller/mettre a jour `dashboard-csm-firestore-bridge.gs`.
2. Coller `dashboard-csm-daily-firestore-sync.gs`.
3. Executer `previewDashboardFirebaseCsmDailySync`.
4. Verifier que le log affiche le bon `bridgeVersion` et des lignes CSM.
5. Executer `runDashboardFirebaseCsmDailySync` pour tester une vraie importation.
6. Executer `installDashboardFirebaseCsmDailyTrigger`.
7. Executer `listDashboardFirebaseCsmDailyTriggers` pour confirmer l'installation.

Cette separation permet de modifier le script qui entretient le document CSM
sans toucher au declencheur Firebase. Tant que les onglets/colonnes CSM utiles
restent disponibles, Firebase peut continuer a s'enrichir automatiquement.

Fichier a coller dans le script source prive:

```text
firebase-dashboard/apps-script/dashboard-firestore-sync-request-queue.gs
```

Scopes Apps Script requis dans `appsscript.json`:

```json
{
  "oauthScopes": [
    "https://www.googleapis.com/auth/datastore",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

Fonctions principales:

- `previewDashboardFirestoreQueue_(payload)`: prevol sans ecriture;
- `queueDashboardSourceImport_(payload)`: cree une demande `syncRequests`;
- `queueCoachRxClientsForDashboard_(coachKey, rows)`;
- `queueClientDirectoryForDashboard_(coachKey, rows)`;
- `queueQuestionnaireResponsesForDashboard_(coachKey, rows)`;
- `queueCheckupsForDashboard_(coachKey, rows)`;
- `queueRebookingsForDashboard_(coachKey, rows)`.

## Endpoint HTTP secondaire

Cloud Function:

```text
https://us-central1-cfsb-dashboard-coach-aa9a4.cloudfunctions.net/ingestDashboardSource
```

Cette Function n'est pas un endpoint HTTP public. Dans le projet CFSB, l'organisation peut bloquer les invocations `allUsers`; le contrat officiel est donc:

1. un appel Google/Firebase authentifie par un principal autorise;
2. le secret applicatif `DASHBOARD_IMPORT_TOKEN` dans l'en-tete `X-CFSB-Import-Token`.

Le secret applicatif est une deuxieme serrure, pas la seule serrure. Il ne doit jamais etre mis dans GitHub Pages, dans `firebase-dashboard/public`, ni dans un document partage.

## Secrets requis

Firebase Secret Manager:

- `DASHBOARD_IMPORT_TOKEN`: token prive utilise par les scripts d'import.

Apps Script Script Properties:

- `DASHBOARD_IMPORT_TOKEN`: meme valeur que le secret Firebase.
- `DASHBOARD_IMPORT_AUTH_BEARER`: seulement si un administrateur fournit explicitement un bearer/ID token court terme ou un transport IAM temporaire pour un test controle. Ce n'est pas une solution durable a coller dans du code.

Le token sert uniquement a authentifier les imports serveur-a-serveur apres que Google/Firebase ait deja autorise l'appelant. Il ne doit pas etre envoye au navigateur des coachs.

Etat actuel: la Function directe est codee et le secret `DASHBOARD_IMPORT_TOKEN` existe. `ingestDashboardSource` est un endpoint HTTP deployable protege par le header `X-CFSB-Import-Token`, mais le projet Firebase pilote a un blocage IAM/Cloud Run invoker qui empeche l'appel direct depuis Apps Script. Le chemin prioritaire est donc la file Firestore `syncRequests`; le token HTTP reste une option serveur-a-serveur secondaire.

## Sources supportees

La Function accepte `sourceType` avec les valeurs suivantes:

| `sourceType` | Usage | Collection cible |
| --- | --- | --- |
| `coachrx_clients` | Export CoachRx / extension / scrape admin | `clients` |
| `client_directory` | Liste client enrichie, CSM/Kilo/admin | `clients` |
| `ghl_contacts` | Enrichissement telephone/courriel depuis GHL | `clients` |
| `rebooking` | Source rebooking vivante | `rebookings` |
| `checkups` | Check-ups CSM | `checkups` |
| `questionnaire_responses` | Reponses questionnaire si on quitte le Sheet | `questionnaireResponses` |

Une source inconnue est journalisee dans `sourceImportRuns` avec le statut `received_unprocessed`, sans ecrire dans les collections operationnelles.

## Matching coach

Le payload doit fournir au moins un de ces champs:

- `coachId`
- `coachRxId`
- `teamId`
- `coachName`

Le backend sait reconnaitre les sept coachs pilotes avec leurs CoachRx ID:

| Coach | CoachRx ID | Courriel |
| --- | --- | --- |
| Marc-Andre Menard | `15935` | `marcandremenard89@gmail.com` |
| Iheb Yahyaoui | `15928` | `ihebya73@gmail.com` |
| Camille Proulx | `17242` | `camproulxx@gmail.com` |
| David Olivier | `15902` | `davidolivier1997@gmail.com` |
| Gabriel Mayer Bedard | `15893` | `info@crossfitstbasilelegrand.com` |
| Hugo Lelievre | `15937` | `hugolelievre34@gmail.com` |
| Raphael Samson | `15936` | `raphael.samson@usherbrooke.ca` |

## Exemple Apps Script

Pour un nouveau pont, partir du template:

```text
firebase-dashboard/apps-script/dashboard-import-bridge-template.gs
```

Si le script source possede deja des lignes en memoire, ajouter aussi:

```text
firebase-dashboard/apps-script/dashboard-live-source-adapters.gs
firebase-dashboard/apps-script/dashboard-firestore-sync-request-queue.gs
```

Exemple d'utilisation directe depuis un extracteur CoachRx prive:

```javascript
function previewCoachRxMarcAndre_(rows) {
  return previewCoachRxClientsForDashboard_('15935', rows.slice(0, 3));
}

function queueCoachRxMarcAndre_(rows) {
  return queueCoachRxClientsForDashboard_('15935', rows);
}
```

Ces adaptateurs normalisent les alias courants (`Client`, `Phone`, `Email`, `Membership`, etc.), ajoutent `phoneNormalized` quand possible et refusent un coach pilote non reconnu. Ils ne contiennent aucun secret.

L'exemple ci-dessous illustre seulement le coeur de l'appel.

Prevol recommande avant l'envoi:

```javascript
function previewCoachRxToFirebase_(coachRxId, coachName, rows) {
  return previewDashboardImportPayload_({
    sourceType: 'coachrx_clients',
    coachRxId,
    coachName,
    records: rows.slice(0, 3)
  });
}
```

Ce prevol ne lit pas `DASHBOARD_IMPORT_TOKEN` et ne touche pas a Firestore. Il sert a verifier la forme du lot avant de passer au vrai push.

```javascript
function pushCoachRxToFirebase_(coachRxId, coachName, rows) {
  const token = PropertiesService.getScriptProperties().getProperty('DASHBOARD_IMPORT_TOKEN');
  if (!token) throw new Error('DASHBOARD_IMPORT_TOKEN manquant dans Script Properties.');
  const authBearer = PropertiesService.getScriptProperties().getProperty('DASHBOARD_IMPORT_AUTH_BEARER');
  if (!authBearer) throw new Error('Transport Firebase authentifie manquant.');

  const response = UrlFetchApp.fetch(
    'https://us-central1-cfsb-dashboard-coach-aa9a4.cloudfunctions.net/ingestDashboardSource',
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        Authorization: /^Bearer\\s+/i.test(authBearer) ? authBearer : 'Bearer ' + authBearer,
        'X-CFSB-Import-Token': token
      },
      payload: JSON.stringify({
        sourceType: 'coachrx_clients',
        coachRxId,
        coachName,
        requestedBy: Session.getActiveUser().getEmail() || 'apps_script',
        records: rows
      })
    }
  );

  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Import Firebase echoue: ' + code + ' ' + body);
  }
  return JSON.parse(body);
}
```

## Format des lignes

Les cles sont normalisees par le backend. Les accents, espaces et majuscules sont toleres.

Exemple minimal `coachrx_clients`:

```json
{
  "sourceType": "coachrx_clients",
  "coachRxId": "15935",
  "records": [
    {
      "Client": "Caroline Gaudreault",
      "Phone": "514-555-1234",
      "Email": "caroline@example.com",
      "Active package": "Semi-Prive",
      "Exercise due": "2026-06-10",
      "Compliance": "80%"
    }
  ]
}
```

Exemple minimal `rebooking`:

```json
{
  "sourceType": "rebooking",
  "coachRxId": "15935",
  "records": [
    {
      "Event ID": "abc123",
      "Client": "Caroline Gaudreault",
      "Debut RDV": "2026-06-10 10:30",
      "Service": "Semi-Prive",
      "Statut": "OUVERT"
    }
  ]
}
```

## Journalisation

Chaque appel cree un document dans:

```text
sourceImportRuns/{runId}
```

Ce journal contient:

- `sourceType`
- `requestedBy`
- `recordsReceived`
- `recordsWritten`
- `coachId`
- `coachName`
- `status`
- `warnings`
- `sample` masque
- `errorMessage` si echec

Le journal est lisible par les admins seulement.

## Regles de securite

- Ne jamais mettre `DASHBOARD_IMPORT_TOKEN` dans un fichier public.
- Ne jamais coller les URLs rebooking tokenisees dans `firebase-dashboard/public`.
- Ne pas remplacer une valeur utile par une valeur vide.
- Les champs manuels coach doivent rester proteges.
- Les imports directs enrichissent Firestore; ils ne suppriment pas automatiquement les documents absents.
- Exception controlee: un import direct `coachrx_clients` ou `client_directory` peut marquer comme `import_stale` les anciens clients provenant de la meme famille de source et absents d'un snapshot complet.
- `ghl_contacts` ne doit jamais marquer des clients comme absents ou perimes, car GHL peut envoyer seulement un lot partiel de contacts.
- Les clients manuels et les champs manuels restent proteges.

## Plan d'activation recommande

1. Confirmer que `DASHBOARD_IMPORT_TOKEN` existe dans Firebase Secret Manager.
2. Choisir le transport authentifie: Bob Operator/service account, backend intermediaire, ou principal Google autorise.
3. Ajouter seulement les proprietes necessaires dans le script prive a connecter.
4. Lancer le preview sur 1 a 3 lignes sans ecriture Firestore.
5. Deployer/valider la Cloud Function privee.
6. Faire un test controle avec un coach et 1 a 3 lignes.
7. Verifier `sourceImportRuns`, `coachSyncStatus` et la collection cible.
8. Brancher progressivement CoachRx, CSM/check-ups, puis rebooking.
