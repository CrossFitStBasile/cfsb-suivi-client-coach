# Matrice d'activation des sources - Dashboard Coach CFSB

Derniere mise a jour: 2026-06-09

## Role de cette matrice

Cette matrice sert a eviter les doublons entre Google Sheets, Apps Script, Firestore et les modules du dashboard.

Principe central:

```text
Source vivante -> Cloud Function securisee -> Firestore -> Dashboard
```

Google Sheets reste utile comme backup, audit ou source temporaire lorsqu'il est encore le systeme vivant. Il ne doit pas devenir un passage obligatoire quand le script ou l'application possede deja la donnee a importer.

References obligatoires:

- `firebase-dashboard/SOURCE_REGISTRY.json`
- `firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json`
- `firebase-dashboard/SOURCE_PAYLOAD_PLAYBOOK.md`
- `firebase-dashboard/DATA_INGESTION_PLAN.md`
- `firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md`
- `firebase-dashboard/apps-script/dashboard-import-bridge-template.gs`

## Statuts

| Statut | Sens |
| --- | --- |
| `pret_backend` | Le backend sait recevoir et ecrire ce type de source. |
| `attend_transport_auth` | Le pont direct attend un transport authentifie vers la Function privee, en plus de `DASHBOARD_IMPORT_TOKEN`. |
| `attend_source` | Le script/source vivant doit etre confirme ou modifie. |
| `audit_avant_writeback` | La source existe, mais on doit comparer avec l'app actuelle avant d'ecrire en production. |
| `actif_filet` | Le flux actuel reste le filet de securite pendant la migration. |

## Matrice

| Priorite | Domaine | Source vivante visee | `sourceType` | Firestore cible | Etat actuel | Preuve de pret | Blocage / action restante | Rollback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Portefeuille clients CoachRx | Extension ou Apps Script CoachRx | `coachrx_clients` | `clients` | `pret_backend`, `attend_transport_auth`, `attend_source` | `functions/index.js` accepte `coachrx_clients`; template Apps Script pret | Ajouter le pont dans le script CoachRx vivant, configurer le transport authentifie et garder `DASHBOARD_IMPORT_TOKEN` comme deuxieme serrure | Garder l'import Sheets/CoachRx historique; ignorer les docs `direct_coachrx_extension` si anomalie |
| 2 | Repertoire client / telephones / courriels | CSM/Kilo/admin | `client_directory` | `clients` | `pret_backend`, `attend_source` | Merge client protege les valeurs utiles et champs manuels | Confirmer la source officielle des telephones avant activation | Garder `CORE_Clients` et `CORE_Clients_Manual` comme backup/audit |
| 3 | Enrichissement telephone GHL | GoHighLevel cote serveur | `ghl_contacts` | `clients` | `pret_backend`, `attend_transport_auth`, `attend_source` | Backend interdit le stale GHL; GHL reste serveur seulement | Brancher un pont prive ou Function serveur; aucun appel GHL dans le navigateur | Desactiver le pont GHL; garder les telephones deja presents |
| 4 | Questionnaires client-coach | Questionnaire V2 / AUTO-009 | `questionnaire_responses` | `questionnaireResponses` | `pret_backend`, `actif_filet` | Matching par telephone; file non matchee; Sheet reste disponible | Decider quand quitter `Responses` / `Test_Responses` comme source principale | Continuer a lire le Sheet questionnaire |
| 5 | Check-ups CSM | Formulaire/Sheet CSM / AUTO-002 | `checkups` | `checkups` | `pret_backend`, `attend_source` | Import lecture seulement pour Performance | Ajouter le pont Apps Script ou conserver sync Sheets tant que necessaire | Garder le formulaire CSM comme registre admin |
| 6 | Rebooking | App Apps Script legacy / AUTO-003 | `rebooking` | `rebookings` | `pret_backend`, `audit_avant_writeback`, `actif_filet` | Statuts proteges; historique et reouverture couverts localement | Comparer Firebase avec l'app historique avant de brancher write direct | Continuer l'app rebooking actuelle; ne jamais publier les URLs tokenisees |

## Ordre d'activation recommande

1. Valider que `DASHBOARD_IMPORT_TOKEN` existe dans Firebase Secret Manager.
2. Choisir le transport authentifie du premier script prive a brancher.
3. Configurer seulement les proprietes privees requises dans le script source.
4. Lancer `previewDashboardImportPayload_` dans le script source avec 1 a 3 lignes, sans ecrire dans Firebase.
5. Activer CoachRx direct pour un seul coach pilote avec 1 a 3 lignes.
6. Verifier `sourceImportRuns`, `coachSyncStatus`, `clients` et la fiche client dans l'app.
7. Ajouter `client_directory` pour combler telephone/courriel sans ecraser les champs manuels.
8. Ajouter GHL seulement cote serveur pour enrichissement strict par telephone.
9. Brancher questionnaire et check-ups lorsque les colonnes/source vivantes sont confirmees.
10. Reporter le rebooking direct tant que la comparaison avec l'app legacy n'est pas terminee.

## Triage des symptomes pilotes

La section `pilotSymptomTriage` de `SOURCE_ACTIVATION_STATUS.json` est la reference quand un coach observe un probleme dans l'app. Elle evite de corriger l'interface avant d'avoir trouve la source responsable.

| Symptome vu dans l'app | Source a verifier d'abord | Action attendue |
| --- | --- | --- |
| Aucune To-do ou trop de bruit dans la To-do | `tasks`, `coachrx_clients`, `questionnaire_responses`, `rebooking` | Auditer la source des taches et garder seulement les actions explicites. |
| Client actif sans telephone | `client_directory`, `ghl_contacts`, `coachrx_clients` | Enrichir un client existant par source fiable; jamais par questionnaire ou rebooking. |
| Envoi questionnaire echoue ou reponse absente | `questionnaireSends`, `ghl_contacts`, `questionnaire_responses` | Confirmer telephone normalise, match GHL exact, trace d'envoi et import par cle de champ. |
| Rebooking Firebase different de l'app historique | `rebooking` | Comparer en lecture seule avec l'app legacy; aucun writeback avant parite. |
| Coach reel bloque a l'acces | `Firebase Auth`, `PILOT_COACH_ACCESS.json`, `users` | Valider courriel/CoachRx ID et reparer par le chemin admin/self-provision autorise. |

## Garde-fous non negociables

- Une valeur vide n'ecrase jamais une valeur utile.
- La fin de membership et la recurrence Kilo restent manuelles dans la fiche client.
- GHL ne peut jamais supprimer, archiver ou perimer un client.
- Une tache fermee, masquee ou archivee ne redevient pas ouverte par import.
- Les liens Apps Script tokenises ne vont jamais dans les fichiers publics.
- Les imports directs doivent toujours journaliser `sourceImportRuns` et `coachSyncStatus`.

## Definition de fait par source

Une source est consideree branchee seulement si:

1. son `sourceType` est dans `SOURCE_REGISTRY.json`;
2. le backend accepte ce `sourceType`;
3. le pont source utilise un transport authentifie et `DASHBOARD_IMPORT_TOKEN` sans secret en dur;
4. `previewDashboardImportPayload_` confirme le bon coach, le bon `sourceType`, le nombre de lignes et les cles attendues;
5. un import test ecrit dans la collection cible;
6. le Guide affiche la derniere synchronisation;
7. le rollback est documente;
8. la validation locale passe;
9. une verification avec au moins un coach reel confirme que la donnee affichee correspond a la source vivante.
