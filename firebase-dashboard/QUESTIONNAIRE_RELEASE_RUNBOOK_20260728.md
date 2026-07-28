# Questionnaire Studio — runbook de continuité

Date de préparation : 2026-07-28
Statut : candidat local seulement; aucune action en production autorisée ou exécutée.

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
- une fenêtre calme;
- l'avis aux coachs envoyé avant la première mutation.

L'avis est obligatoire pour ce candidat : les règles n'ont pas pu être exécutées
dans l'émulateur local faute de Java, et la sous-étape A3 redéploie trois
fonctions déjà utilisées. Pendant la fenêtre, ne pas demander aux membres de
soumettre et ne pas lancer de nouveaux envois.

Variables à définir dans le même terminal après le GO production :

```cmd
set CFSB_QUESTIONNAIRE_RELEASE_COMMIT=<SHA_CANDIDAT_SCELLE>
set CFSB_QUESTIONNAIRE_RELEASE_GO=YES
set CFSB_COACH_NOTICE_CONFIRMED=YES
```

Les scripts refusent un worktree modifié ou un `HEAD` différent du SHA scellé.
Chaque commande fait une passe `firebase deploy --dry-run` avant la mutation.

Ne lancer aucune commande `firebase deploy` manuelle depuis le candidat. Les
hooks Firebase exécutent les tests, mais seuls les scripts Stage A/Stage B
vérifient aussi l'ordre des sous-étapes, les GO, l'avis coach, le commit scellé
et les preuves de canari.

## Étape A — pont backend en trois arrêts

Les sous-étapes sont volontairement séparées. Ne jamais les enchaîner dans un
seul script ou une seule commande Firebase.

### A1 — règles et index compatibles avec l'ancien Dashboard

```cmd
deploy-questionnaire-stage-a.cmd rules
```

La commande ne publie que `firestore:rules,firestore:indexes`.

Contrôles obligatoires :

- Dashboard actuel ouvrable pour un coach;
- trois pages historiques ouvrables;
- lecture et écriture historiques permises;
- création, modification, pause et reprise d'une planification legacy permises;
- aucune planification existante mise en pause par le système.

Après conservation des preuves :

```cmd
set CFSB_QUESTIONNAIRE_RULES_CANARY_OK=YES
```

STOP si une règle est refusée, si le Dashboard se vide, si une planification
historique échoue ou si une réponse ne peut plus être lue.

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

Après conservation des preuves :

```cmd
set CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK=YES
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

Contrôles obligatoires avant et après :

- un envoi historique utilise encore son tag et son libellé historiques;
- une planification historique conserve sa cadence et son téléphone legacy;
- aucun formulaire Studio avec `deliveryReady: false` ne peut être envoyé ou
  planifié;
- un échec ou une ambiguïté GHL reste explicite et ne produit pas un faux succès;
- la recherche GHL reste bornée et échoue fermée.

Après conservation des preuves :

```cmd
set CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED=YES
```

STOP et rollback backend si une fonction historique régresse. Ne pas publier
Hosting.

## Étape B — Hosting additif seulement

Exige un nouveau GO production :

```cmd
set CFSB_QUESTIONNAIRE_STAGE_B_GO=YES
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

Les index additifs restent en place; les supprimer serait une migration
destructive distincte.

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

L'envoi de ces messages est une action opérationnelle distincte et exige une
autorisation explicite. Aucun message n'est envoyé par ce candidat local.

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
