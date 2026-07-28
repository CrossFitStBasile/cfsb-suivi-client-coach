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
- l'avis aux coachs envoyé avant la première mutation.
- zéro document `questionnaireSchedules` actif avec `nextSendAt` dû ou invalide.

L'avis est obligatoire pour ce candidat parce que la sous-étape A3 redéploie
trois fonctions déjà utilisées. Les règles ont finalement été exécutées avec le
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

Avant A1, vérifier sans écriture externe les trois révisions Functions live, la
cible Scheduler et le contact synthétique :

```cmd
node tools\questionnaire-function-revision-receipt.cjs --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --preview
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
--dry-run` avant la mutation. A4 ajoute volontairement une première invocation
sans mutation afin que le delta d'index puisse être examiné avant de permettre
une seconde invocation.
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
- les quatre ont `deliveryReady: false`;
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
le canari public exact :

```cmd
run-questionnaire-public-api-canary.cmd --record-revision
run-questionnaire-public-api-canary.cmd --execute
```

Le canari conserve une réponse synthétique non membre comme preuve. Il vérifie
les quatre définitions et leurs empreintes, puis les quatre documents
`questionnaireForms` et les quatre documents `questionnaireCatalog` exacts.
Les deux collections doivent rester `published`, sur la version et l'empreinte
attendues, avec `deliveryReady: false`. Il vérifie aussi l'accusé strict, le
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

### A3 — pont des trois fonctions historiques en usage

```cmd
deploy-questionnaire-stage-a.cmd legacy
```

La commande ne redéploie que :

- `sendQuestionnaire`;
- `processQuestionnaireSendRequest`;
- `scheduledQuestionnaireSendPlans`.

Après le succès Firebase, le script lit les trois Functions v2 et produit
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

### A4 — index du Scheduler, isolé en dernier

Le Scheduler quotidien tourne à 07:15 `America/Toronto`. La sous-étape A4 est
interdite dans les six heures précédant ce passage et pendant les dix minutes
qui le suivent. La fenêtre recommandée est de 08:00 à 12:00.

```cmd
deploy-questionnaire-stage-a.cmd indexes
```

La commande exige que `CFSB_QUESTIONNAIRE_LEGACY_CANARY_OK` soit égal au SHA
scellé. Cette première invocation :

1. exécute le prévol live à zéro suivi actif dû jusqu'au prochain passage de
   07:15;
2. exécute toutes les portes locales;
3. fait le dry-run de `firestore:indexes` seulement;
4. s'arrête obligatoirement sans publier d'index.

Même si la variable de revue a été prépositionnée, la première invocation crée
d'abord un reçu local SHA-bound après le dry-run puis s'arrête. Une invocation
ultérieure exige à la fois ce reçu et la variable de revue.

Examiner le journal affiché. STOP si ce dry-run annonce autre chose que la
création de l'unique index `questionnaireSchedules` attendu. Un index historique
manquant, une suppression ou toute autre création constitue un delta hors portée
à examiner séparément. Si et seulement si la revue humaine est concluante,
enregistrer la preuve liée au candidat scellé :

```cmd
set CFSB_QUESTIONNAIRE_INDEX_DRY_RUN_REVIEWED=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
```

Cette preuve ne vaut que pour ce SHA. Relancer ensuite exactement la même
commande :

```cmd
deploy-questionnaire-stage-a.cmd indexes
```

La seconde invocation :

1. refait depuis le début le contrôle du commit et du worktree scellés,
   l'authentification, le prévol live et toutes les portes locales;
2. refait le dry-run de `firestore:indexes` seulement;
   STOP si ce nouveau dry-run annonce autre chose que la création de l'unique index
   `questionnaireSchedules` attendu; un index historique manquant ou toute autre
   création constitue un delta hors portée à examiner séparément;
3. refait le prévol live immédiatement et reconfirme le worktree scellé;
4. publie uniquement `firestore:indexes`, en mode non interactif et sans
   `--force` afin de ne supprimer aucun index existant;
5. s'arrête sans déclarer Stage A réussie.

Si le prévol échoue ou si l'état devient dangereux entre les deux lectures,
aucun index n'est publié. Les sorties ne contiennent que des comptes agrégés,
sans identifiant ni empreinte dérivée des données membre. La fenêtre protégée
de six heures avant et dix minutes après est fixe; aucun argument de
contournement n'existe.

La CLI peut revenir avant la fin de construction. Attendre explicitement l'état
`READY`, puis exécuter :

```cmd
verify-questionnaire-stage-a-index-ready.cmd
```

Ce contrôle post-index exige exactement un index `COLLECTION` composé de
`status ASCENDING`, puis `nextSendAt ASCENDING`, dans l'état `READY`, ainsi que
zéro suivi actif dû jusqu'au prochain passage de 07:15, à date invalide ou à
statut inconnu. Le wrapper résout le runtime Node stable même quand `node` n'est
pas présent dans le `PATH`. Il refuse aussi toute variante `unique`,
`multikey`, de recherche, à densité autre que `SPARSE_ALL` ou avec un nombre de
shards non standard.

Contrôles obligatoires après `READY`, dans cet ordre :

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
dry-run, puis appelle uniquement `firebase deploy --only hosting`. Il ne touche
ni Functions, ni Firestore, ni Storage.

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
Créer un worktree détaché séparé et le conserver comme preuve.

La CLI `firebase` n'est pas dans le `PATH` de tous les postes CFSB. Dans le
terminal CMD de rollback, préparer d'abord la CLI locale :

```cmd
for /d %D in ("%USERPROFILE%\.cache\cfsb-dashboard-tools\node-v22\node-v*-win-x64") do set "PATH=%~fD;%PATH%"
set "FIREBASE_BIN=%USERPROFILE%\.cache\cfsb-dashboard-tools\firebase-tools-clean\node_modules\.bin\firebase.cmd"
```

### Rollback Hosting

Provenance :

- tag : `dashboard-hosting-live-20260728-questionnaire-library-provenance`;
- commit : `2d9c1c0dbb08bdf6838c05c5c5781e2c70198525`;
- arbre public : `b318a719139a8464595420eb4ecb804f95957ae5`;
- ZIP CoachRx 0.7.0 :
  `6d365bfa818c8a3b793e8a5825638380b4e4b2d0dd0cfd6d9d16a150e11d2326`.

```cmd
git worktree add --detach C:\Users\micha\Documents\Codex\questionnaire-rollback-hosting-20260728 dashboard-hosting-live-20260728-questionnaire-library-provenance
cd /d C:\Users\micha\Documents\Codex\questionnaire-rollback-hosting-20260728
call "%FIREBASE_BIN%" deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only hosting
call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only hosting
```

`tests/questionnaire-continuity.test.mjs` protège les hashes dans le candidat
local; il ne prouve pas à lui seul les réponses HTTP live. Vérifier ensuite le
live avec `tools/verify-questionnaire-live-continuity.mjs`, puis ouvrir les trois
parcours historiques et exécuter une soumission de contrôle.

### Préparer le worktree backend de rollback

Baseline :
`76682dd77e7b4cf695ed61f63c29aae234ba1d66`.

```cmd
git worktree add --detach C:\Users\micha\Documents\Codex\questionnaire-rollback-backend-20260728 76682dd77e7b4cf695ed61f63c29aae234ba1d66
cd /d C:\Users\micha\Documents\Codex\questionnaire-rollback-backend-20260728
if not exist functions\package-lock.json exit /b 1
call npm ci --prefix functions
```

Le bundle Git scellé doit contenir ce commit : il n'existe actuellement dans
aucune branche distante confirmée. Ne lancer aucune étape production tant que le
bundle de récupération n'est pas copié dans l'emplacement durable prévu.

### Rollback A1 — règles seulement

À utiliser si la sous-étape `rules` a changé le comportement :

```cmd
call "%FIREBASE_BIN%" deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only firestore:rules
call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only firestore:rules
```

Aucun index n'est créé en A1.

### Rollback A2 — fonctions additives seulement

Si l'autorité de rollback couvre explicitement la suppression des exports
effectivement créés à A2 :

```cmd
call "%FIREBASE_BIN%" functions:delete listQuestionnaireForms saveQuestionnaireDraft publishQuestionnaireForm setQuestionnaireDeliveryReady archiveQuestionnaireForm duplicateQuestionnaireForm questionnairePublicApi --region us-central1 --force --project cfsb-dashboard-coach-aa9a4
```

Sans cette autorité, les laisser déployés mais inutilisés. Ne supprimer
automatiquement ni index additif, ni formulaire, ni version, ni réponse :
ces données sont inoffensives et leur suppression serait une migration
destructive distincte.

### Rollback A3 — trois fonctions historiques seulement

À utiliser si le pont legacy régresse :

```cmd
call "%FIREBASE_BIN%" deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only "functions:sendQuestionnaire,functions:processQuestionnaireSendRequest,functions:scheduledQuestionnaireSendPlans"
call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only "functions:sendQuestionnaire,functions:processQuestionnaireSendRequest,functions:scheduledQuestionnaireSendPlans"
```

Appliquer seulement les rollbacks des sous-étapes réellement publiées. Si Stage
B a aussi été publié, restaurer Hosting en premier pour retirer immédiatement
les nouveaux parcours de la circulation.

### STOP opérationnel A4 — index

La présence d'un index additif ne modifie pas les règles ni les documents. Le
risque vient du prochain passage Scheduler. Si A4 échoue :

- ne pas lever le gel des nouvelles planifications;
- garder ou remettre à `paused` toute planification réelle due;
- ne pas définir les preuves `INDEX_READY`, `SCHEDULER_CANARY` ou `STAGE_A`;
- ne pas publier Hosting;
- conserver le relevé des `questionnaireSends` avant/après.

Supprimer un index ou désactiver un job Scheduler est une mutation de production
distincte. Ne pas l'automatiser depuis ce candidat : obtenir un GO explicite,
identifier la ressource exacte en lecture seule, puis conserver la preuve de la
suppression ou de la désactivation avant de lever le gel.

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
