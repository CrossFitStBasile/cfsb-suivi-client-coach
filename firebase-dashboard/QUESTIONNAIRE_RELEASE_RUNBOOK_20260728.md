# Questionnaire Studio — runbook de continuité

Date de préparation : 2026-07-28
Statut : candidat préparé pour un déploiement contrôlé; l'état live exact est
consigné séparément dans les preuves horodatées de chaque sous-étape.

## Résultat recherché

Ajouter le Studio et quatre nouvelles expériences sans interrompre les trois
questionnaires déjà utilisés par les coachs, sans modifier leurs workflows GHL
avant validation, et sans jamais afficher un succès au membre avant la
confirmation d'une écriture durable.

## Invariants bloquants

1. Les trois URL historiques restent servies par Firebase Hosting et soumettent
   au pipeline Apps Script v23 :
   - `/questionnaire/`;
   - `/questionnaire/check-in/`;
   - `/questionnaire/evaluation-habitudes-vie/`.
   Le code et le déploiement de ce Web App restent immuables pendant cette
   release : les runners `activate-questionnaire-firestore-queue.cjs` et
   `deploy-questionnaire-appscript-version.cjs` s'arrêtent avant
   authentification tant que le garde staged existe.
2. Les nouvelles URL sont génériques : `/questionnaire/f/{slug}`. Aucune donnée
   membre, aucun téléphone et aucun identifiant ne sont placés dans l'URL.
3. Une soumission n'est réussie que si l'API retourne `ok: true`,
   `response.stored: true`, un `responseId`, la même `idempotencyKey`, un booléen
   `duplicate` et un `receivedAt`.
4. Le téléphone est une preuve de rapprochement, pas l'identité primaire. Zéro
   correspondance, plusieurs correspondances, une attribution divergente ou une
   fiche non confirmée sont mises en validation sans créer de client.
5. `published` rend un formulaire testable manuellement. `deliveryReady` reste à
   `false` tant que le workflow GHL dédié et ses deux canaris ne sont pas prouvés.
6. Les tags historiques `dashboardcoach`, `suiviregulier` et
   `evaluationnutrition` restent réservés aux trois parcours historiques.
7. `deploy-dashboard-complet.cmd` et le Hosting direct restent bloqués par
   `QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md`.

## Conditions avant toute production

Un GO local ne constitue pas un GO production. Avant l'étape A, il faut :

- un commit candidat scellé et un worktree propre;
- le SHA-256 de l'archive candidate et les preuves de tests;
- une session Firebase valide et les secrets requis;
- une personne responsable du GO/STOP et du rollback;
- une fenêtre calme, hors de la fenêtre protégée du Scheduler;
- l'avis aux coachs publié dans Firestore avant la première mutation et
  confirmé par `--maintenance-verify`; une variable de terminal seule ne
  constitue jamais cette preuve;
- zéro document `questionnaireSchedules` actif avec `nextSendAt` dû ou invalide.

L'avis est obligatoire pour ce candidat parce que la sous-étape A3 redéploie
sept fonctions déjà utilisées et ajoute le reaper d'envoi. Les règles ont
finalement été exécutées avec le
Firestore Emulator et le JRE Temurin local : le canari a confirmé les opérations
legacy coach (création, lecture, modification, pause et reprise), les droits
admin et le refus total des deux collections canari privées. Pendant la fenêtre,
ne pas demander aux membres de soumettre et ne pas lancer de nouveaux envois.

Preuves locales à lier au candidat avant le GO production :

```cmd
set CFSB_QUESTIONNAIRE_RELEASE_COMMIT=<SHA_CANDIDAT_SCELLE>
run-questionnaire-firestore-rules-emulator-canary.cmd
set CFSB_QUESTIONNAIRE_RULES_EMULATOR_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
```

Avant A1, vérifier sans écriture externe la cible Scheduler et le contact
synthétique. Les révisions Functions pré-release sont scellées séparément par
le snapshot obligatoire décrit plus bas :

```cmd
run-questionnaire-release-canary.cmd --preview
set CFSB_QUESTIONNAIRE_CANARY_CONTACT_FINGERPRINT=<EMPREINTE_AFFICHEE_PAR_PREVIEW>
run-questionnaire-release-canary.cmd --pin-contact
```

Si la preview retourne `stop: true`, `next: provision_contact_required` et
`explicitSyntheticContactCount: 0`, publier d'abord l'avis coach. Tout candidat
partiel ou multiple reste un STOP manuel. Le mode scellé suivant peut alors
créer une seule fiche interne, en DND, sur le numéro fictif réservé
`514-555-0100` :

```cmd
set CFSB_QUESTIONNAIRE_RELEASE_GO=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
set CFSB_COACH_NOTICE_CONFIRMED=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
set CFSB_QUESTIONNAIRE_PROVISION_CONTACT_GO=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
run-questionnaire-release-canary.cmd --provision-contact
run-questionnaire-release-canary.cmd --preview
set CFSB_QUESTIONNAIRE_CANARY_CONTACT_FINGERPRINT=<EMPREINTE_AFFICHEE_PAR_PREVIEW>
run-questionnaire-release-canary.cmd --pin-contact
```

Le provisionnement vérifie d'abord l'absence exacte par téléphone avec l'API
GHL de déduplication et l'absence de tout autre canari synthétique sur les
numéros réservés. Les recherches GHL exigent un total complet égal au nombre de
fiches retournées; une page tronquée bloque. Si GHL fournit malgré ce total
complet un `nextPageUrl`, le runner reconstruit un seul GET sans redirection
après validation stricte de l'origine, du chemin, des paramètres de recherche
et du curseur lié au dernier contact. Seule une page terminale vide, au même
total et sans autre pointeur, est acceptée; toute pagination réelle ou ambiguë
reste un STOP. Il n'utilise jamais
`upsert`, applique le tag interne et le DND, puis exige que la fiche créée soit
relue comme unique et absente des clients Dashboard. Juste avant l'unique POST,
un claim Firestore partagé, atomique et permanent, puis un verrou local
atomique et persistant sont créés pour ce numéro. Le claim partagé empêche deux
postes différents de devenir écrivains; le verrou local couvre les rejeux du
poste opérateur. Une réponse réseau incertaine, un rejeu ou une invocation
concurrente n'entraîne jamais un second POST : la récupération est uniquement
en lecture. Un verrou sans fiche GHL observable est un STOP qui exige une
adjudication manuelle; ni le claim ni le verrou ne doivent être supprimés pour
forcer un rejeu.

Le pin refuse de s'exécuter si l'empreinte confirmée n'est pas exactement celle
de la passe preview. Le reçu SHA-bound contient seulement l'identifiant opaque
GHL et une empreinte identité+téléphone; les exécutions suivantes relisent ce
seul ID et ne font plus aucune recherche large. STOP sauf si le contact est
unique, appartient au locationId CFSB exact, porte le tag exact
`cfsb-questionnaire-internal-canary`, utilise un numéro réservé `555-01xx`, ne
correspond à aucun téléphone ou identifiant de `clients`, et ne porte aucun des
deux tags historiques du canari. Cette combinaison constitue l'autorisation
interne explicite de cibler ce contact; aucun membre réel n'est admissible.

La preview vérifie aussi l'état `ENABLED`, la cadence, le fuseau, la cible,
l'OIDC, les retries et le délai exacts du job Scheduler. Le champ
`lastExecutionStatusCode` est conservé comme diagnostic historique de la
dernière exécution; il ne décrit pas la configuration courante et ne bloque pas
à lui seul. Chaque canari exige plutôt un nouveau `syncRun` exact, lié au nonce
et au SHA, après son propre déclenchement.

Pour une Function Firebase Gen 2 planifiée, le job doit cibler exactement son
URL Firebase canonique `cloudfunctions.net`, avec la même audience OIDC. L'API
Cloud Functions expose séparément l'URL du service sous-jacent `a.run.app`; le
canari valide aussi ce service actif et sa révision, sans exiger que ces deux
URL Firebase/Cloud Run soient textuellement identiques.

Les scripts refusent un worktree modifié ou un `HEAD` différent du SHA scellé.
Toutes les autorisations et preuves ci-dessous doivent être égales à ce SHA.
Un nouveau commit de candidat invalide donc automatiquement les anciens GO,
avis et canaris : il faut les reprendre pour le nouveau candidat.
Chaque invocation susceptible de muter fait une passe `firebase deploy
--dry-run` avant la mutation.
Chaque sous-étape exécute aussi le prévol live en lecture seule avant les portes,
puis une seconde fois après le dry-run et immédiatement avant la mutation. Il
parcourt toutes les pages de `questionnaireSchedules`, sans requête composite,
n'affiche que des agrégats et échoue fermé sur erreur d'authentification, de
réseau, de pagination, de statut ou de date. Un suivi actif dû, à date invalide
ou à statut inconnu bloque toute la Stage A.

Ne lancer aucune commande `firebase deploy` manuelle depuis le candidat. Les
hooks Firebase exécutent les tests, mais seuls les scripts Stage A/Stage B
vérifient aussi l'ordre des sous-étapes, les GO, l'avis coach, le commit scellé
et les preuves de canari.

### Snapshot pré-release obligatoire

Immédiatement avant A1, sceller l'état live réellement servi, et non une
ancienne baseline Git. Le reçu contient seulement des identifiants techniques,
des révisions et des empreintes : aucun contenu de règles, courriel, téléphone,
secret ou donnée membre. Il lie au SHA candidat :

- la version exacte du canal Hosting `live`;
- le ruleset Firestore immuable actuellement publié;
- les sept révisions Cloud Run servies par les Functions A2;
- les sept révisions A3 pré-release exactes : `sendQuestionnaire`,
  `processQuestionnaireSendRequest`, `scheduledQuestionnaireSendPlans`,
  `syncDashboardFromSheets`, `scheduledDashboardSync`,
  `scheduledQuestionnaireResponseSync` et `processSyncRequest`;
- l'absence pré-release de la Function `scheduledQuestionnaireSendRecovery` et
  de son job Cloud Scheduler exact
  `firebase-schedule-scheduledQuestionnaireSendRecovery-us-central1`;
- l'unique index `questionnaireSchedules` exact déjà dans l'état `READY`.

Choisir un répertoire de récupération durable, puis exécuter les trois passes :

```cmd
set CFSB_QUESTIONNAIRE_ROLLBACK_DIR=C:\Users\micha\Documents\Codex\questionnaire-rollback-artifacts
node tools\seal-questionnaire-pre-release-state.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --preview
set CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH=<PLAN_HASH_DU_RECU>
node tools\seal-questionnaire-pre-release-state.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH% --record
node tools\seal-questionnaire-pre-release-state.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH% --verify-receipt
node tools\seal-questionnaire-pre-release-state.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH% --verify
```

`--record` crée le reçu une seule fois avec une écriture locale exclusive;
il refuse si le planHash observé n'est pas celui de la preview.
`--verify-receipt` valide localement le fichier, son SHA, son snapshotHash et
son planHash sans lire le live. `--verify` relit exactement le même état live.
Le wrapper `rules` répète cette comparaison complète après son dry-run,
immédiatement avant A1; les wrappers `additive` et `legacy`, dont le live a déjà
changé intentionnellement, répètent plutôt `--verify-receipt`. Tous exigent
aussi une réponse live `maintenancePublished: true` de :

```cmd
node tools\manage-questionnaire-release-announcements.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --maintenance-verify
```

Copier le reçu avec l'archive candidate dans l'emplacement durable prévu. STOP
sur reçu absent, planHash absent ou différent, avis de maintenance absent, ou
toute différence de cible, de SHA, de version, de ruleset, de révision, de
trafic ou d'index. Les anciennes références `2d9c1c0` et `76682dd` ne remplacent
jamais ce snapshot pour A1, A2, A3 ou Hosting.

## Étape A — pont backend en quatre arrêts

Les sous-étapes sont volontairement séparées. Ne jamais les enchaîner dans un
seul script ou une seule commande Firebase.

### A1 — règles compatibles avec l'ancien Dashboard

```cmd
deploy-questionnaire-stage-a.cmd rules
```

La commande ne publie que `firestore:rules`. Elle ne crée aucun index.

Contrôles obligatoires :

- Dashboard actuel ouvrable pour un coach;
- trois pages historiques ouvrables;
- lecture et écriture historiques permises;
- création, modification, pause et reprise d'une planification legacy permises
  dans le canari Firestore Emulator;
- aucune planification existante mise en pause par le système;
- aucun nouveau document `questionnaireSends`.

La sous-étape `rules` refuse maintenant de démarrer tant que
`CFSB_QUESTIONNAIRE_RULES_EMULATOR_OK` ne correspond pas au SHA scellé.

Après conservation des preuves :

```cmd
set CFSB_QUESTIONNAIRE_RULES_CANARY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
```

Le canari de règles live reste non destructif : ne pas activer ni basculer une
planification de membre pour prouver A1. Vérifier l'ouverture et les lectures du
Dashboard, puis conserver la preuve Emulator. STOP si une règle est refusée, si
le Dashboard se vide ou si une réponse ne peut plus être lue.

### A2 — sept fonctions strictement additives

```cmd
deploy-questionnaire-stage-a.cmd additive
```

La commande ne publie que :

- `listQuestionnaireForms`;
- `saveQuestionnaireDraft`;
- `publishQuestionnaireForm`;
- `setQuestionnaireDeliveryReady`;
- `archiveQuestionnaireForm`;
- `duplicateQuestionnaireForm`;
- `questionnairePublicApi`.

Contrôles obligatoires :

- les quatre formulaires initiaux existent avec une version immuable;
- les trois versions v1 déjà canariées conservent `deliveryReady: true`;
- Repères CFSB v2 est créée avec `deliveryReady: false` jusqu’à son nouveau
  canari GHL;
- avant Stage B, utiliser directement
  `https://us-central1-cfsb-dashboard-coach-aa9a4.cloudfunctions.net/questionnairePublicApi?slug=<slug>`;
  le rewrite `/api/questionnaires` et le shell `/questionnaire/f/**` ne sont pas
  encore en production;
- un GET direct initialise et retourne la définition sans tag GHL, preuve admin
  ni donnée membre;
- une soumission canari retourne l'accusé strict;
- la réponse est retrouvée dans Firestore avec le même `responseId`;
- le rejeu identique est idempotent et un contenu différent avec la même clé est
  refusé;
- un téléphone ambigu reste en validation.

Après le déploiement A2, sceller les sept révisions additives live, puis lancer
la migration éducative v2 scellée avant le canari public exact. Cette migration
ne remplace jamais la v1 : elle crée `reperes_cfsb_v2`, bascule atomiquement les
pointeurs publics et remet obligatoirement `deliveryReady: false`.

```cmd
run-questionnaire-public-api-canary.cmd --record-revision
node tools\publish-reperes-v2.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --preview
```

Suivre ensuite les portes GO et `planHash` exactes de
`QUESTIONNAIRE_REPERES_V2_RELEASE_RUNBOOK.md`, puis exécuter :

```cmd
node tools\publish-reperes-v2.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --verify
run-questionnaire-public-api-canary.cmd --execute
```

Le canari conserve une réponse synthétique non membre comme preuve. Il vérifie
les quatre définitions et leurs empreintes — les trois parcours initiaux en v1
et Repères CFSB en v2 — puis les quatre documents
`questionnaireForms` et les quatre documents `questionnaireCatalog` exacts.
Les deux collections doivent rester `published`, sur la version et l'empreinte
attendues, avec l’état de livraison exact : les trois v1 déjà actives restent
à `true`, tandis que Repères v2 reste à `false`. Il vérifie aussi l'accusé strict, le
rejeu idempotent, le conflit `409` sur contenu changé, l'absence de toute
liaison client et la stabilité des sept révisions. Le `createTime`, le
`updateTime` et l'empreinte du document Firestore doivent rester strictement
identiques après le rejeu et le conflit. Son numéro réservé `514-555-01xx` est
recherché dans les trois champs téléphone exacts avant et après chaque écriture.
Il ne supprime ni ne modifie la preuve.

Le reçu local des sept révisions peut être relancé avec
`--record-revision`. Il rafraîchit seulement son heure si les sept révisions,
builds et empreintes de provenance live sont encore exactement identiques; tout
écart bloque la reprise.

Si la première soumission a été écrite mais qu'une panne transitoire a interrompu
la lecture ou les contrôles suivants, ne supprime pas la réponse. Le mode normal
retourne `canary_response_already_exists_use_recover`. Après avoir confirmé le
STOP et conservé l'évidence, lier l'autorité de reprise au même SHA :

```cmd
set CFSB_QUESTIONNAIRE_A2_RECOVERY_GO=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
run-questionnaire-public-api-canary.cmd --record-revision
run-questionnaire-public-api-canary.cmd --recover
```

Le mode `--recover` exige que le document déterministe appartienne exactement à
l'identité synthétique, à la version et à la clé du SHA scellé. Il ne crée ni ne
supprime ce document : il prouve sa stabilité, fait le rejeu identique, exige le
conflit `409`, revalide les huit documents formulaire/catalogue et les sept
révisions. Ne définir la preuve A2 que si ce mode retourne `ok: true`.

Après conservation des preuves :

```cmd
set CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
```

STOP si le catalogue est incomplet, si une réponse est absente, si un faux
succès apparaît ou si une identité ambiguë est rattachée.

#### TTL des compteurs anti-abus

La seule politique TTL autorisée par cette release cible le groupe de
collections `questionnaireRateLimits` et son champ timestamp `expiresAt`.
Elle ne cible jamais `questionnaireResponses` : les réponses suivent leur
politique de conservation métier séparée et ne doivent pas être supprimées par
TTL.

La preview est read-only. L'activation exige un GO égal au SHA et utilise un
`PATCH` limité par `updateMask=ttlConfig`; elle ne touche pas la configuration
d'index du champ. `CREATING` est un état transitoire attendu, mais seule une
vérification ultérieure `ACTIVE` constitue la preuve finale :

```cmd
node tools\manage-questionnaire-rate-limit-ttl.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --preview
set CFSB_QUESTIONNAIRE_TTL_GO=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
node tools\manage-questionnaire-rate-limit-ttl.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --enable
node tools\manage-questionnaire-rate-limit-ttl.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --verify
```

L'activation peut rendre immédiatement admissibles à la suppression les
compteurs déjà expirés; Firestore effectue normalement ces suppressions de
façon asynchrone. STOP sur `NEEDS_REPAIR` ou sur toute cible différente. Il
n'existe aucun mode de désactivation ou de wildcard dans le runner.

### A3 — pont d'envoi, synchronisation et récupération des baux

```cmd
deploy-questionnaire-stage-a.cmd legacy
```

La commande ne redéploie que :

- `sendQuestionnaire`;
- `processQuestionnaireSendRequest`;
- `scheduledQuestionnaireSendRecovery`;
- `scheduledQuestionnaireSendPlans`;
- `syncDashboardFromSheets`;
- `scheduledDashboardSync`;
- `scheduledQuestionnaireResponseSync`;
- `processSyncRequest`.

`sendQuestionnaire` ne fait plus d'appel GHL direct : le callable historique
crée transactionnellement la même demande dans la file sûre que le Dashboard.
Sa révision et celles des six autres Functions A3 préexistantes sont toutes
scellées avant A1. Le même reçu prouve que la nouvelle Function de récupération
et son job Scheduler exact n'existaient pas encore.

Après le succès Firebase, le script lit les huit Functions v2 et produit
automatiquement un reçu local lié au SHA avec, pour chacune, la révision Cloud
Run, le build, l'heure de mise à jour et l'empreinte de provenance source. Le
reçu exige `ACTIVE`, `GEN_2` et 100 % du trafic sur la dernière révision. Si ce
reçu ne peut pas être produit, A3 est considérée partielle et aucun canari ne
doit être exécuté. Chaque mode `--execute-*` relit ensuite les Functions live et
refuse tout écart avec ce reçu; un ancien backend compatible ne peut donc pas
valider le nouveau SHA.

Contrôles obligatoires avant et après :

- un envoi historique utilise encore son tag et son libellé historiques;
- une planification historique conserve sa cadence et son téléphone legacy;
- aucun formulaire Studio avec `deliveryReady: false` ne peut être envoyé ou
  planifié;
- un échec ou une ambiguïté GHL reste explicite et ne produit pas un faux succès;
- la recherche GHL reste bornée et échoue fermée.

Exécuter le canari A3 privé. Il crée une cible système non membre, inaccessible
au Dashboard, puis un seul envoi déterministe du parcours Check-in historique.
Le backend compare l'identifiant GHL au contact synthétique épinglé avant tout
effet externe, conserve le document d'envoi comme preuve et retire seulement la
cible système. Le tag est laissé au workflow jusqu'à 30 secondes; s'il n'est pas
retiré comme prévu, le runner le retire explicitement du même contact
synthétique et en vérifie l'absence :

```cmd
run-questionnaire-release-canary.cmd --execute-process
```

STOP si le résultat n'est pas `ok: true`, si `sendDelta` diffère de `1`, si
l'effet externe n'est pas `completed` ou si le nettoyage exact échoue. Ne
supprimer et ne recréer jamais le document d'envoi pour réessayer un effet
incertain.

Après conservation des preuves :

```cmd
set CFSB_QUESTIONNAIRE_LEGACY_CANARY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
```

STOP et rollback backend si une fonction historique régresse. Ne pas déclencher
le Scheduler, ne pas créer l'index et ne pas publier Hosting.

### A4 — index du Scheduler déjà `READY`, vérification seulement

L'index exact existe déjà en production et le prévol l'a observé une seule fois
dans l'état `READY`. A4 n'est donc plus une sous-étape de déploiement pour ce
candidat. Ne lancer ni `deploy-questionnaire-stage-a.cmd indexes`, ni
`firebase deploy --only firestore:indexes`, ni même un dry-run d'index qui
pourrait être interprété comme un delta à publier.

Le Scheduler quotidien tourne à 07:15 `America/Toronto`. Dans une fenêtre sûre,
après A3, exécuter uniquement les contrôles read-only suivants :

```cmd
node tools\preflight-questionnaire-stage-a-live.cjs --protect-through-next-scheduler --require-index-ready --require-safe-scheduler-window
node tools\seal-questionnaire-pre-release-state.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH% --verify-index-ready
verify-questionnaire-stage-a-index-ready.cmd
```

Ces trois preuves liées au même SHA et au même planHash exigent exactement un
index `COLLECTION`
composé de `status ASCENDING`, puis `nextSendAt ASCENDING`, dans l'état `READY`,
ainsi que zéro suivi actif dû jusqu'au prochain passage de 07:15, à date
invalide ou à statut inconnu. Elles refusent aussi toute variante `unique`,
`multikey`, de recherche, à densité autre que `SPARSE_ALL` ou avec un nombre de
shards non standard. Le reçu pré-release conserve le nom et les champs exacts
de l'index, sans identifiant de membre.

STOP si la preuve diffère du snapshot ou si l'index n'est plus uniquement
`READY`. Une telle différence exige un nouveau diagnostic; elle n'autorise
jamais un redéploiement automatique d'index.

Contrôles obligatoires après la preuve `READY`, dans cet ordre :

1. vérifier qu'aucun `questionnaireSends` inattendu n'a été créé et qu'aucun tag
   GHL n'a été ajouté;
2. lier la preuve `READY` au SHA;
3. exécuter un canari Scheduler à vide;
4. lier sa preuve au SHA;
5. exécuter un seul canari positif sur le contact synthétique épinglé;
6. confirmer un seul ID d'envoi déterministe, l'effet GHL exact, la mise en
   pause de la cadence `once` et l'absence de doublon au rejeu;
7. confirmer la continuité publique, puis ouvrir le Dashboard avec un compte
   admin et un compte coach.

Commandes exactes :

```cmd
set CFSB_QUESTIONNAIRE_INDEX_READY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
run-questionnaire-release-canary.cmd --execute-empty
set CFSB_QUESTIONNAIRE_SCHEDULER_EMPTY_CANARY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
run-questionnaire-release-canary.cmd --execute-positive
```

Les deux exécutions créent d'abord un contrôle privé à expiration courte. Tant
qu'il est armé, la Function refuse sans envoi tout snapshot qui contient une
planification réelle due. Le canari vide exige `0/0/0` et l'empreinte exacte de
toutes les planifications inchangée. Le positif exige `1/1/0`, puis `0/0/0` au
rejeu. La création de l'envoi et l'avancement de la cadence sont
transactionnels : un run concurrent ne peut pas écraser un envoi terminal ni
réouvrir l'effet GHL. Le contrôle, la cible et la planification synthétiques
sont supprimés avec une précondition Firestore `updateTime`; les
`questionnaireSends` et `syncRuns` restent comme audit.

Chaque contrôle porte aussi un nonce aléatoire lié au `syncRun`. Juste avant
chaque `jobs.run`, le runner exige au moins deux minutes de TTL, relit le
contrôle, puis relit la Function et le job Scheduler exacts. Tout contrôle
existant invalide ou expiré bloque le Scheduler au lieu de revenir en mode
production. Un canari positif antérieur portant le même SHA bloque toute
nouvelle tentative, même après minuit Toronto. Un résultat réussi exige que le
tag GHL ait réellement été observé; une simple acceptation API ne déverrouille
jamais l'étape suivante.

### Récupération canari sans rejeu

Si un runner s'interrompt après avoir créé un contrôle ou une fixture, ne
supprimer aucun `questionnaireSends` et ne relancer aucun effet. Utiliser
l'autorité de récupération dédiée :

```cmd
set CFSB_QUESTIONNAIRE_RECOVERY_GO=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
run-questionnaire-release-canary.cmd --cleanup
```

Le cleanup valide les propriétaires exacts, pause la planification, place la
cible en `cancelled` comme barrière transactionnelle avant l'effet GHL, puis
retire le contrôle et attend jusqu'à 45 secondes que tout envoi soit terminal et
qu'aucun `externalEffectState: started` ne puisse encore être en vol. Il retire
ensuite uniquement la planification et la cible avec leurs préconditions
`updateTime`. Si la quiescence n'est pas prouvée, il échoue fermé et conserve
les fixtures annulées pour une nouvelle inspection; il n'annonce jamais un
nettoyage GHL terminé. Un état `uncertain` est un résultat terminal inconnu :
le runner attend au moins 20 secondes après son horodatage, puis relit et retire
au besoin les deux tags exacts pendant sept observations espacées de cinq
secondes sur le seul contact synthétique vérifié non membre. Il ne supprime les
fixtures et ne produit `ok: true` que si cette réconciliation complète réussit;
si GHL ou la preuve du contact est indisponible, il échoue fermé et laisse les
fixtures annulées pour une nouvelle commande `--cleanup`. Le cleanup fonctionne
même si les Functions ont été rollbackées. Les envois, y compris `pending`,
`started`, `uncertain`, `sent` ou `error`, restent intacts.
Le résultat `firestoreRecoveryComplete: true` signifie que le Scheduler est
débloqué et `externalEffectQuiescent: true` confirme qu'aucun ajout de tag n'est
encore en vol. `uncertainExternalEffectsReconciled` indique le nombre d'effets
inconnus stabilisés et nettoyés. `ghlCleanupStatus: deferred` n'est permis que
lorsqu'aucun effet `uncertain` n'existe; il signifie alors séparément que les
deux tags du contact synthétique doivent encore être revérifiés. Le cleanup ne
constitue jamais une preuve de canari réussie.

Après conservation de toutes les preuves :

```cmd
set CFSB_QUESTIONNAIRE_SCHEDULER_CANARY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
set CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
```

STOP si l'index n'est pas `READY` avant la limite de la fenêtre, si un suivi
actif dû réapparaît, si un envoi inattendu existe ou si un canari n'est pas
retrouvé. Garder le gel des nouvelles planifications et ne pas publier Hosting.

## Étape B — Hosting additif seulement

Exige un nouveau GO production :

```cmd
set CFSB_QUESTIONNAIRE_INDEX_READY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
set CFSB_QUESTIONNAIRE_SCHEDULER_CANARY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
set CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
set CFSB_QUESTIONNAIRE_STAGE_B_GO=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
deploy-questionnaire-stage-b.cmd
```

Le script vérifie à nouveau le commit, le worktree, les portes locales et le
reçu pré-release SHA/planHash, ainsi que `maintenancePublished: true` dans le
live avant d'appeler le wrapper Hosting et son dry-run. Il publie uniquement
`firebase deploy --only hosting`; il ne touche ni Functions, ni Firestore, ni
Storage. Si l'avis a été archivé ou repris trop tôt, Stage B échoue avant
Hosting.

Contrôles immédiats :

- Dashboard ouvert avec un compte admin et un compte coach;
- les trois anciennes pages et leurs soumissions toujours fonctionnelles;
- les huit anciennes URL CoachRx redirigent vers le ZIP 0.7.0 exact;
- les quatre nouvelles URL s'ouvrent sur ordinateur et mobile;
- le Check-in contient exactement trois oui/non et n'affiche le commentaire
  qu'après au moins un « non »;
- une erreur réseau ou un accusé incomplet ne montre jamais le succès;
- chaque canari est retrouvé par `responseId`;
- la bibliothèque garde les liens historiques si le catalogue Studio échoue.

STOP si le Dashboard est inutilisable, si un lien historique change, si une
réponse manque, si un mauvais client est lié ou si le rollback Hosting n'est pas
immédiatement disponible.

## Étape C — canari GHL, un formulaire à la fois

La publication d'un formulaire ne l'autorise pas automatiquement à être envoyé.
Pour chaque nouveau formulaire :

1. utiliser son tag unique :
   - `cfsb-bilan-90-jours-v1`;
   - `cfsb-check-in-express-v1`;
   - `cfsb-evaluation-habitudes-vie-v1`;
   - `cfsb-reperes-v1`;
   Le suffixe historique du tag Repères reste `v1` pour préserver le workflow
   déjà configuré; l’URL fixe résout toutefois la version active v2. Toute
   preuve de livraison antérieure à cette v2 est invalidée.
2. créer un workflow GHL distinct qui envoie exactement l'URL générique;
3. n'ajouter aucun champ de contact à l'URL;
4. permettre la réinscription et retirer le tag déclencheur en fin de workflow;
5. exécuter deux canaris successifs avec un contact interne;
6. retrouver chaque réponse dans Firestore;
7. enregistrer la preuve dans le Studio;
8. seulement ensuite activer « Envois GHL » (`deliveryReady: true`).

Les trois workflows historiques ne sont jamais modifiés pendant ces canaris.

## Étape D — adoption graduelle

Après au moins 24 heures stables :

- partager un seul nouveau lien avec un petit groupe;
- vérifier chaque réponse, les cas ambigus et la charge dans « À lire »;
- généraliser un formulaire à la fois;
- retirer le garde de publication seulement dans un commit et un GO séparés.

## Retour arrière exact

Ne jamais faire `git reset --hard` ou `git checkout --` dans le worktree candidat.
Le rollback A1, A2, A3 et Hosting doit utiliser le reçu
`pre-release-state-<SHA>.receipt.json` créé juste avant A1. Les références
historiques `2d9c1c0` et `76682dd` ne décrivent pas l'état live pré-release
complet et ne doivent pas être utilisées pour ces scopes.

Le runner fait d'abord une preview read-only, exige que chaque version,
ruleset et révision scellés existe encore, puis demande deux preuves pour
muter : le SHA et le `planHash` exact du reçu. Les scopes sont indépendants :

- `hosting` crée une nouvelle release du canal `live` vers exactement l'ancien
  `versionName`, sans reconstruire les fichiers;
- `rules` repointe la release Firestore vers exactement l'ancien ruleset
  immuable;
- `a2` route 100 % du trafic des sept services A2 vers leurs révisions
  pré-release exactes;
- `a3` route 100 % du trafic des sept services A3 préexistants vers leurs
  révisions pré-release exactes, vérifie cette restauration, puis retire la
  Function et le job Scheduler additifs uniquement si leur absence pré-release
  est scellée.

Exemple pour les scopes réellement publiés :

```cmd
set CFSB_QUESTIONNAIRE_ROLLBACK_DIR=C:\Users\micha\Documents\Codex\questionnaire-rollback-artifacts
set CFSB_QUESTIONNAIRE_ROLLBACK_PLAN_HASH=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%
node tools\rollback-questionnaire-pre-release-state.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --plan-hash=%CFSB_QUESTIONNAIRE_ROLLBACK_PLAN_HASH% --scope=hosting --scope=rules --scope=a2 --scope=a3 --preview
set CFSB_QUESTIONNAIRE_ROLLBACK_GO=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
node tools\rollback-questionnaire-pre-release-state.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --plan-hash=%CFSB_QUESTIONNAIRE_ROLLBACK_PLAN_HASH% --scope=hosting --scope=rules --scope=a2 --scope=a3 --execute
node tools\rollback-questionnaire-pre-release-state.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --plan-hash=%CFSB_QUESTIONNAIRE_ROLLBACK_PLAN_HASH% --scope=hosting --scope=rules --scope=a2 --scope=a3 --verify
```

Ne jamais ajouter un scope qui n'a pas été publié. Si Stage B a été publié,
restaurer Hosting en premier; le runner respecte cet ordre. Le rollback de
trafic Cloud Run restaure immédiatement le code servi par l'ancienne révision,
mais laisse la révision plus récente disponible pour diagnostic. Une
stabilisation permanente par redéploiement constitue ensuite une nouvelle
release.

Après un rollback Hosting, exécuter
`tools/verify-questionnaire-live-continuity.mjs`, ouvrir les trois parcours
historiques et confirmer leur comportement. Après un rollback de règles ou de
Functions, refaire les lectures Dashboard et les canaris non destructifs
appropriés avant tout message de reprise.

### Archive Git de secours séparée

L'archive Git historique reste un secours séparé pour diagnostic hors ligne.
Elle n'est pas le mécanisme de rollback A3, ne prouve pas l'état live juste
avant cette release et ne doit lancer aucun redéploiement pendant le retour
arrière. La restauration primaire est exclusivement le reçu
`pre-release-state-<SHA>.receipt.json`, qui contient les sept révisions A3
réellement servies et les deux absences additives. Toute stabilisation ultérieure
par redéploiement depuis une archive Git constitue une nouvelle release avec son
propre candidat, ses tests, ses canaris et son GO.

### Rollback A1 — règles seulement

Utiliser seulement `--scope=rules` dans le runner du snapshot. Il repointe la
release vers le ruleset immuable pré-release et vérifie le même
`rulesetName`. Ne redéployer aucune règle depuis `76682`. Aucun index n'est
créé, modifié ou supprimé.

### Rollback A2 — fonctions additives seulement

Utiliser seulement `--scope=a2`. Le runner vérifie les sept révisions
pré-release et y remet 100 % du trafic. Ne supprimer aucun export, formulaire,
catalogue, slug, version ou réponse : ces suppressions seraient des migrations
destructives distinctes et ne font pas partie du rollback de code.

### Rollback A3 — fonctions d'envoi et récupération

Utiliser uniquement `--scope=a3` avec le SHA et le `planHash` du reçu. Le runner
restaure et vérifie d'abord 100 % du trafic des sept services A3 sur leurs
révisions pré-release exactes. Tant que cette postcondition n'est pas vraie, il
ne supprime rien.

Après cette vérification seulement, le runner relit la paire additive et exige
sa configuration exacte. Si elle existe, il utilise le chemin de suppression
Firebase pour retirer ensemble la Function `scheduledQuestionnaireSendRecovery`
et son job Cloud Scheduler
`firebase-schedule-scheduledQuestionnaireSendRecovery-us-central1`, puis attend
et vérifie que les deux ressources sont absentes. Si elles sont déjà toutes deux
absentes, la suppression est un no-op vérifié. Une seule ressource présente, une
cible, une cadence, un fuseau, une URL, une identité OIDC ou un label inattendu
provoque un STOP fermé. Ne lancer aucune commande manuelle de suppression ou de
redéploiement pendant ce rollback.

### A4 — aucun rollback d'index

L'index était déjà `READY` avant cette release et A4 n'effectue aucune mutation.
Il n'existe donc aucun rollback d'index à exécuter. Si sa vérification échoue :

- ne pas lever le gel des nouvelles planifications;
- garder ou remettre à `paused` toute planification réelle due;
- ne pas définir les preuves `INDEX_READY`, `SCHEDULER_CANARY` ou `STAGE_A`;
- ne pas publier Hosting;
- conserver le relevé des `questionnaireSends` avant/après.

Ne jamais tenter de « corriger » ce constat avec
`firebase deploy --only firestore:indexes`. Supprimer un index ou désactiver un
job Scheduler est une mutation de production distincte : obtenir un GO
explicite, identifier la ressource exacte en lecture seule, puis conserver la
preuve avant de lever le gel.

## Communication aux coachs

Avis avant intervention :

> Mise à jour des questionnaires prévue de [heure] à [heure]. Jusqu'à notre
> confirmation de fin, n'envoyez pas de nouveau questionnaire et demandez aux
> membres d'attendre avant de soumettre. Les liens actuels resteront disponibles
> autant que possible. Nous confirmerons la reprise dès qu'une soumission test
> aura été enregistrée et vérifiée.

Message de reprise :

> La mise à jour est terminée. Une soumission test a été enregistrée et vérifiée.
> Vous pouvez reprendre l'envoi des questionnaires. Pour l'instant, continuez
> d'utiliser les liens indiqués dans la bibliothèque du Dashboard.

L'envoi de ces messages est une action opérationnelle distincte. Pour la
présente exécution, l'autorisation autonome donnée par Michael couvre l'avis et
la reprise; la reprise reste interdite tant que la soumission live et sa lecture
Firestore ne sont pas toutes deux confirmées.

## Preuves à conserver

- commit et archive SHA-256 du candidat;
- résultats de toutes les portes locales;
- sorties des dry-runs;
- versions Firebase avant et après chaque sous-étape;
- `responseId`, heure et résultat de chaque canari;
- vérification Firestore du même `responseId`;
- décision GO/STOP et personne responsable;
- heure des messages d'avis et de reprise;
- chemin des worktrees de rollback, sans les supprimer automatiquement.
