# Architecture de synchronisation - Dashboard Coach CFSB

Derniere mise a jour: 2026-06-05

## Decision centrale

Firebase / Firestore devient la base operationnelle du Dashboard Coach.

Google Sheets et Apps Script restent utiles, mais ils ne doivent plus etre le moteur principal de l'app coach. Ils deviennent:

- sources externes;
- zones d'import;
- miroirs de securite;
- outils admin;
- backups lisibles;
- ponts temporaires pendant la transition.

L'objectif est que le coach travaille dans le dashboard, pendant que les sources se synchronisent en arriere-plan.

## Principe de filet de securite

Les anciens systemes peuvent rouler en parallele pendant la migration.

On ne coupe pas un systeme existant tant que:

1. Firebase recoit la meme donnee de facon fiable;
2. le dashboard affiche cette donnee correctement;
3. les actions coach sont journalisees;
4. un rollback simple existe;
5. au moins quelques tests reels ont confirme le flux.

Pendant la transition, une meme information peut donc exister dans deux endroits:

- le systeme historique, ex. Google Sheet, Apps Script, GHL, CoachRx, rebooking;
- Firestore, comme base operationnelle du dashboard.

La regle est de toujours identifier la source primaire et la direction de synchronisation.

Le registre officiel des sources est `firebase-dashboard/SOURCE_REGISTRY.json`. Il doit etre consulte avant de modifier un flux afin de garder une seule carte des sources, des miroirs temporaires, des collections Firestore et des regles de conflit.

Le plan d'ingestion source par source est `firebase-dashboard/DATA_INGESTION_PLAN.md`. Il doit rester aligne avec les sourceType acceptes par `ingestDashboardSource` avant de brancher CoachRx, CSM/Kilo, GHL, questionnaires, rebooking ou check-ups.

## Roles par systeme

| Systeme | Role cible | Role pendant transition |
| --- | --- | --- |
| Firestore | Base operationnelle du dashboard | Base cible a alimenter progressivement |
| Firebase Auth | Acces et permissions | Source d'acces principale |
| Firebase Hosting | Interface coach | Interface principale |
| Firebase Functions | Actions serveur, GHL, imports, syncs | Backend cible pour les actions lentes/sensibles |
| Google Sheets | Import, audit, backup, certains formulaires | Source temporaire pour CSM, reponses, historiques |
| Apps Script | Scripts existants et ponts | Filet de securite / source temporaire |
| CoachRx | Source client/contexte programme | Extraction via extension ou autre connecteur |
| GoHighLevel | SMS, tags, notes client | Automatisation client et journal secondaire |
| Kilo / CSM | Membership, checkups, donnees membres | Source externe a synchroniser |

## Direction recommandee des flux

## Contrat de source de verite et conflits

Firestore est la source operationnelle du dashboard. Cela veut dire que les coachs travaillent dans Firestore et que l'interface lit Firestore en priorite. Les autres systemes alimentent Firestore ou servent de preuve de secours, mais ils ne doivent pas ecraser une decision manuelle coach sans regle explicite.

| Donnee | Source primaire | Peut ecrire dans Firestore | Regle en cas de conflit |
| --- | --- | --- | --- |
| Acces utilisateur | Firebase Auth + `users` | Admin Firebase | `users.active`, `role` et `coachId` controlent l'acces dashboard. |
| Coach officiel | `coaches` Firestore | Admin / seed controle | Les CoachRx ID officiels gagnent sur les noms saisis librement. |
| Client et coach responsable | Firestore, enrichi par CoachRx/Sheets | Sync CoachRx/Sheets, coach proprietaire ou admin | Le telephone normalise gagne, puis ID source, puis nom normalise. Un transfert coach garde l'historique et reste borne aux coachs pilotes. |
| Telephone client | Firestore, alimente par exports fiables | Sync, coach/admin | Une valeur vide ne remplace jamais un telephone existant. Le telephone normalise reste la cle GHL/questionnaire. |
| Fin membership | Champ manuel dashboard | Coach/admin | Jamais calcule automatiquement. Les imports ne peuvent pas l'ecraser. |
| Recurrence prevue dans Kilo | Champ manuel dashboard | Coach/admin | Jamais calcule automatiquement. Les imports ne peuvent pas l'ecraser. |
| Risque coach | Champ manuel dashboard + questionnaire | Coach/admin, import questionnaire | Le coach peut toujours corriger. Une reponse questionnaire peut proposer un risque, mais ne doit pas effacer une note manuelle. |
| Notes/objectifs coach | Champ manuel dashboard | Coach/admin | Les imports externes ne remplacent pas les notes existantes. |
| Reponses questionnaire | Sheet questionnaire puis Firestore | Sync questionnaire, future Function | Matching par telephone. Non matche = file `A valider`, jamais perdu. |
| Envois questionnaire | Firestore + GHL | Function `sendQuestionnaire` | Firestore journalise la tentative; GHL est la preuve d'envoi SMS/tag. |
| Rebooking | Firestore, alimente par source rebooking | Sync rebooking, coach/admin | Un statut traite dans Firebase ne revient pas a `open` a cause d'une reimportation. |
| Check-ups CSM | Google Sheets CSM vers Firestore | Sync CSM | Sert a Performance; ne modifie pas les champs manuels client. |
| Impacts | Firestore | Coach/admin | Suppression logique seulement (`deleted`) pour garder la trace. |
| Alumni | Firestore | Coach/admin, import admin | Alumni reste separe de Performance. |
| Journal d'action | `actionLogs` | Dashboard seulement | Append-only: aucune modification ou suppression par coach. |

Note To-do: les exports CoachRx de type navigateur sont la source du portefeuille coach. Ils peuvent aussi creer une mission programme seulement quand le signal est actionnable: pastille/couleur rouge ou jaune explicite, date en retard, aujourd'hui, ou echeance proche. Les valeurs seulement informatives, les compliances et les contextes ambigus restent dans la fiche client/diagnostic au lieu de devenir une To-do.

Les lignes `TASKS_Current` restent la source explicite des To-do importees. Le backend normalise toutefois les titres trop vagues avant de les afficher au coach, par exemple `Decider quoi faire avec ce client CoachRx` devient `Valider le statut CoachRx du client`, avec une description d'action et la source visible dans la carte.

Garde-fou d'affichage: la To-do ne doit pas afficher une tache marquee `sourceStale`, archivee, completee ou ignoree. Cette regle protege la version pilote si une ancienne synchronisation a laisse un document Firestore ouvert alors que la source actuelle ne le justifie plus.

Regles generales:

- une valeur vide venant d'une source externe ne remplace jamais une valeur utile deja presente;
- les champs manuels coach gagnent sur les imports;
- les imports doivent enrichir, dedupliquer et diagnostiquer, pas effacer silencieusement;
- tout conflit non resolu doit etre visible dans le diagnostic ou dans une file a valider;
- les sources historiques restent disponibles comme filet de securite tant que le flux Firebase n'a pas ete valide en reel.

## Rythme de synchronisation Firebase

Deux chemins coexistent pour alimenter Firestore:

- `Synchroniser tous les coachs` dans l'onglet Guide: action admin manuelle pour forcer une mise a jour, tester une source ou diagnostiquer Marc-Andre/Iheb avant une rencontre.
- `scheduledDashboardSync`: Cloud Function planifiee toutes les 6 heures, qui lit les memes sources et ecrit dans les memes collections que le bouton manuel.
- `syncRequests` source import queue: chemin recommande pour Apps Script prive avec `firebase-dashboard/apps-script/dashboard-firestore-sync-request-queue.gs`. Le script ecrit une demande `requestType: source_import` dans Firestore avec `ScriptApp.getOAuthToken()`, puis `processSyncRequest` applique la logique serveur vers les collections operationnelles.
- `ingestDashboardSource`: Cloud Function HTTP deployable, protegee par `DASHBOARD_IMPORT_TOKEN`, preparee pour recevoir directement les donnees Apps Script/CoachRx/CSM/Rebooking sans Sheet intermediaire obligatoire. Le code se deploie, mais le projet pilote bloque actuellement la modification IAM/Cloud Run invoker qui permettrait l'appel direct depuis Apps Script.

Les deux chemins utilisent le meme moteur d'import. Si l'un cree une donnee differente de l'autre, c'est un bug.

La sync planifiee ne remplace pas les anciens scripts Google tout de suite. Elle sert a garder Firestore vivant pendant que les Sheets, Apps Script et workflows existants restent disponibles comme filet de securite.

L'import direct ne remplace pas immediatement les Sheets non plus. Il sert a reduire les doublons quand un script possede deja la donnee vivante. Chaque import, qu'il arrive par `syncRequests` ou par endpoint HTTP secondaire, cree un journal `sourceImportRuns` et met a jour `coachSyncStatus` pour que l'admin voie quelle source a alimente Firestore.

### Questionnaire client-coach

Flux actuel acceptable:

1. Client complete le questionnaire GitHub Pages.
2. La reponse est stockee dans le Google Sheet de reponses.
3. Une synchronisation lit les onglets `Responses` et `Test_Responses`, puis importe la reponse dans Firestore.
4. Le dashboard affiche la reponse dans l'inbox coach.

Flux cible:

1. Client complete le questionnaire.
2. La reponse est envoyee a Firebase Function.
3. Firestore recoit la reponse.
4. Une copie de backup peut etre ecrite dans Google Sheets et/ou une note GHL.

Regles:

- le matching principal est `client_phone_normalized`;
- une reponse non matchee ne doit jamais etre perdue;
- GHL peut recevoir une note pour garder une trace hors dashboard;
- le dashboard ne doit pas dependre de l'ordre des colonnes du Sheet.
- les statuts rouge/orange/jaune/vert sont des signaux visuels;
- une tache coach est creee seulement si la reponse exige une action jaune/orange/rouge;
- une reponse lue, archivee ou validee ne doit pas recreer une tache ouverte.

### Envoi questionnaire

Flux cible:

1. Coach clique `Envoyer questionnaire`.
2. Firebase Function valide le coach, le client et le telephone.
3. Firebase Function appelle GHL pour ajouter le tag `dashboardcoach`.
4. Firestore journalise la tentative dans `questionnaireSends`.
5. Le coach recoit un retour clair: envoye, telephone manquant, contact introuvable ou erreur GHL.

Garde-fou UX:

- le clic du coach cree une entree `questionnaireSends` en `pending` avant l'appel Cloud Function;
- la Function reutilise cette tentative et la complete avec le resultat GHL;
- si l'appel Firebase ou GHL echoue, la tentative reste visible dans l'onglet Questionnaires avec le message d'erreur;
- un envoi ne doit jamais donner l'impression que rien ne s'est passe.

Regle anti-fausse relance:

- `Envoyes sans reponse` liste seulement les envois `sent` qui n'ont pas `answeredAt` et qui n'ont pas de reponse client correspondante apres la date d'envoi.
- Le matching se fait par telephone normalise en priorite.
- Une reponse plus ancienne que l'envoi ne ferme pas le suivi; elle represente un ancien cycle questionnaire.
- Une tache de relance peut etre creee seulement apres 7 jours sans reponse recente.

Filet de securite:

- le workflow GHL reste la reference d'envoi SMS;
- les tentatives restent dans Firestore;
- si Firebase plante, l'admin peut encore consulter GHL/Sheets.

### Rebooking

Flux actuel acceptable:

1. L'app rebooking existante continue de fonctionner.
2. Ses donnees peuvent etre synchronisees vers Firestore.
3. Le dashboard affiche une vue integree.

Etat Firebase actuel:

- `SRC_Rebookings_SemiPrive` est lu pendant `Synchroniser tous les coachs`;
- les lignes sont importees dans `rebookings`;
- les statuts sources sont normalises vers `open`, `managed`, `rebooked`, `coach_absence` ou `archived`;
- un statut deja traite dans Firebase n'est pas ecrase par une reimportation ouverte.
- l'action `Absence coach` demande une note de contexte, par exemple vacances ou fermeture, puis l'ajoute a l'historique visible.
- le diagnostic de sync expose les lignes rebooking disponibles, les lignes matchees au coach, la couverture telephone, les items non relies a une fiche client et les statuts proteges.
- les URLs Apps Script historiques contenant des jetons d'acces ne doivent pas etre collees dans `firebase-dashboard/public` ni dans un fichier public. Elles servent de filet de securite ou de source admin protegee, pas de lien public dans le dashboard.

Flux cible:

1. Les donnees rebooking sont dans Firestore.
2. Le coach traite les statuts dans le dashboard.
3. L'historique reste lisible dans la carte et dans les journaux.
4. Les statuts standards sont: `open`, `managed`, `rebooked`, `coach_absence`, `archived`.
5. Les absences coach doivent garder une raison lisible pour eviter de perdre le contexte d'une periode de vacances ou d'absence.

Filet de securite:

- garder le lien externe rebooking tant que la vue Firebase n'a pas remplace 100% du flux;
- ne pas supprimer l'historique de l'ancien systeme;
- importer les actions importantes dans `actionLogs`.
- si un coach voit des rebookings vides ou incoherents, verifier d'abord le diagnostic `Source rebooking`: source vide, source non matchee, telephone absent ou item non relie client.

### CoachRx

Flux actuel acceptable:

1. Le coach/admin ouvre CoachRx.
2. L'extension extrait les donnees visibles.
3. Les donnees sont envoyees a Firestore.

Flux cible:

- l'extension CoachRx envoie directement a Firebase ou a une Function securisee;
- Firestore met a jour les collections `coaches`, `clients`, `tasks` et `actionLogs`;
- Firestore met aussi a jour `coachSyncStatus/{coachId}` pour donner au coach une lecture simple de la derniere importation;
- les clients manuels sont matches par telephone, puis par nom normalise seulement si le telephone manque.

Regles:

- ne pas ecraser les champs manuels coach;
- ne pas ecraser des champs utiles avec des valeurs vides provenant d'un export incomplet;
- ne pas dupliquer un client manuel si CoachRx le retrouve plus tard;
- garder l'historique lors d'un transfert de coach.
- le telephone normalise reste la cle prioritaire pour relier client manuel, CoachRx, questionnaire et GHL.

Garde-fous actuels:

- le test local d'import simule les sept coachs pilotes;
- le matching coach accepte les noms, alias, CoachRx ID et URLs du type `/team/{coachRxId}/clients`;
- les variantes courantes de colonnes telephone sont normalisees avant import;
- un client retrouve dans `CORE_Clients` et `CoachRx` est deduplique par telephone avant ID source ou nom;
- `CORE_Clients_Manual` est lu avec `CORE_Clients` pour enrichir les clients crees/corriges manuellement, notamment telephone, courriel et dates manuelles;
- la Function `ingestDashboardSource` accepte maintenant `coachrx_clients`, ce qui permet a l'extension ou a un Apps Script de pousser directement dans `clients` quand on decide de bypasser Google Sheets;
- une reponse questionnaire peut etre rattachee au client par telephone meme si le nom/courriel saisi par le client est different.
- la sync lit les clients Firestore existants du coach avant l'import;
- si un client manuel/existant est retrouve par telephone, ID source ou nom normalise, l'import ecrit dans cette fiche au lieu de creer un doublon;
- les champs manuels de cette fiche restent prioritaires et `linkedFromManual` trace qu'une fiche manuelle a ete reliee a une source importee.

### CSM / Checkups / Membership

Flux actuel acceptable:

1. CSM continue dans Google Sheets.
2. Une synchronisation importe les donnees utiles dans Firestore.

Etat Firebase actuel:

- `SRC_CSM_FormulaireCheckup` est lu dans le Sheet dashboard;
- le Sheet CSM externe est tente en lecture si un onglet candidat est disponible, incluant l'onglet reel `Formulaire Checkup`;
- les lignes matchees par coach alimentent `checkups`;
- Performance compte les check-ups depuis Firestore selon la periode selectionnee.

Flux cible:

- Firestore stocke seulement les champs utiles au dashboard;
- Google Sheets reste le registre historique/admin;
- les checkups alimentent Performance;
- la fin de membership reste manuelle dans le dashboard tant que la donnee fiable n'existe pas.

## Collections Firestore operationnelles

Les collections operationnelles prioritaires sont:

- `users`
- `coaches`
- `clients`
- `tasks`
- `questionnaireResponses`
- `questionnaireSends`
- `rebookings`
- `checkups`
- `impacts`
- `alumni`
- `syncRuns`
- `coachSyncStatus`
- `actionLogs`

## Champs a proteger lors des imports

Les imports automatiques ne doivent pas ecraser sans regle claire:

- `manualMembershipEndDate`
- `kiloPlannedRecurrenceEndDate`
- `riskLevel`
- `riskNote`
- `notes`
- `coachObjective`
- `status` si defini manuellement par un coach/admin
- tout historique d'action

## Journalisation obligatoire

Chaque synchronisation doit creer une entree dans `syncRuns`:

- `source`
- `startedAt`
- `finishedAt`
- `status`
- `recordsRead`
- `recordsCreated`
- `recordsUpdated`
- `recordsSkipped`
- `errors`
- `triggeredBy`

Valeurs attendues pour `triggeredBy`:

- `manual_admin`: synchronisation lancee par un admin depuis le dashboard;
- `scheduled`: synchronisation automatique `scheduledDashboardSync`;
- `system`: execution systeme sans utilisateur associe.

Le bouton admin `Synchroniser tous les coachs`, le bouton `Synchroniser ce coach` et la sync planifiee doivent utiliser le meme moteur `runDashboardSheetsSync`. Si leurs resultats divergent, c'est un bug d'import, pas une difference volontaire de logique.

Chaque synchronisation doit aussi exposer assez de diagnostic pour comprendre un coach vide sans retourner dans le code:

- lignes disponibles par source;
- lignes matchees par coach;
- entetes normalisees detectees par source;
- alias coach utilises;
- exemples de signaux coach non matches;
- lignes matchees mais sans nom client exploitable.
- clients importes sans telephone normalise, car ils limitent l'envoi questionnaire et le matching GHL;
- couverture telephone par source afin de distinguer un bug d'import d'une source qui ne contient simplement pas le numero;
- exemples de clients sans telephone pour prioriser l'enrichissement manuel ou GHL/Kilo.

Chaque action coach importante doit creer une entree dans `actionLogs`:

- `userId`
- `coachId`
- `entityType`
- `entityId`
- `action`
- `createdAt`
- `details`

## Strategie de migration

### Phase 1 - Stabiliser Firebase comme lecture principale

- Charger les coachs officiels.
- Importer CoachRx visible pour Marc-Andre et Iheb.
- Verifier que les clients et taches apparaissent.
- Garder les scripts existants actifs.

Etat 2026-06-02:

- la liste coach doit rester limitee aux coachs officiels avec CoachRx ID;
- le selecteur coach doit rester cliquable en un clic, sans menu custom fragile et sans select natif qui oblige a maintenir le clic;
- un bouton admin `Synchroniser tous les coachs` est ajoute dans Guide / modules;
- la Function `syncDashboardFromSheets` peut etre appelee sans `coachId` pour synchroniser tous les coachs officiels;
- la Function `scheduledDashboardSync` synchronise automatiquement les memes sources toutes les 6 heures apres deploiement complet;
- chaque synchronisation doit ecrire une entree `syncRuns` avec `completedAt`, `coachIds`, resultats et apercu des sources lues;
- le diagnostic admin doit afficher un audit de matching par coach: alias reconnus, lignes sources disponibles, lignes matchees, signaux coach non reconnus et lignes matchees sans nom client;
- si Marc-Andre ou Iheb n'affichent pas de clients apres `Sync tous`, le probleme n'est plus l'interface mais le matching source: nom coach, CoachRx ID, telephone ou onglet source incomplet.

Test obligatoire apres publication:

1. ouvrir le dashboard Firebase;
2. aller dans `Guide / modules`;
3. cliquer `Synchroniser tous les coachs`;
4. attendre le retour de succes;
5. selectionner Marc-Andre, Iheb et un autre coach;
6. verifier `Clients`, `To-do`, `Questionnaires` et `Rebooking`;
7. si un coach reste vide, lire le diagnostic de synchro dans le guide avant de modifier l'UX.

Audit terminal utile apres une sync:

```cmd
audit-live-firestore.cmd
```

Le script lit Firestore live et confirme les volumes par coach: clients, telephones manquants, To-do, questionnaires, rebookings, check-ups, impacts, alumni, `syncRuns` et `coachSyncStatus`.

Commande de publication actuelle:

```text
C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo\deploy-dashboard-complet.cmd
```

Si Firebase demande une reconnexion, lancer d'abord:

```text
C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo\firebase-login-dashboard.cmd
```

Si Firebase demande combien de jours garder les images de conteneurs, repondre `30`.

Validation specifique Marc-Andre / Iheb:

- `matchingAudit.sourceCounts` confirme si les onglets sources sont lus;
- `matchingAudit.matchedBySource` confirme si le coach est reconnu dans chaque source;
- `matchingAudit.matchedMissingClientName` signale les lignes qui matchent le coach mais ne contiennent pas de nom client exploitable;
- `matchingAudit.unmatchedCoachSignals` montre les signaux coach presents mais non reconnus par le matching;
- `sourcePhoneCoverage` montre si les lignes matchees contiennent des telephones exploitables;
- si `matchedBySource` est positif et que le portefeuille client reste vide, corriger les colonnes nom/telephone dans la source avant de refaire l'UX;
- si les clients apparaissent mais que `sourcePhoneCoverage.coreClients + sourcePhoneCoverage.coachRx` vaut 0, le dashboard fonctionne comme lecteur, mais l'envoi questionnaire doit attendre un enrichissement `CORE_Clients_Manual`, GHL ou Kilo.

### Phase 2 - Synchroniser les sources sans couper les anciens outils

- Importer questionnaires depuis Sheets vers Firestore.
- Importer rebookings depuis `SRC_Rebookings_SemiPrive` vers Firestore.
- Importer checkups CSM vers `checkups`, puis Performance.
- Importer alumni et impacts vers leurs collections Firestore.
- Garder les liens externes dans Guide comme backup.

### Phase 3 - Faire de Firebase le point d'action principal

- Les coachs traitent les taches dans Firebase.
- Les envois questionnaire passent par Firebase Function.
- Les statuts rebooking sont geres dans Firebase.
- Les actions sont journalisees.

### Phase 4 - Reduire les dependances Sheets

- Les Sheets restent des backups ou registres admin.
- Les nouvelles actions coach ne dependent plus de Sheets.
- Les modules instables restent en mode "source externe" jusqu'a stabilisation.

## Reponse courte a la question du filet de securite

Oui, questionnaire, rebooking et scripts Google peuvent rouler en parallele pendant la migration.

C'est meme recommande, tant que chaque flux a une regle claire:

- qui est la source primaire;
- qui recoit une copie;
- qui peut modifier la donnee;
- quelle source gagne en cas de conflit;
- comment on voit qu'une synchronisation a echoue.

Le danger n'est pas d'avoir deux systemes temporairement. Le danger est d'avoir deux systemes sans contrat clair.
