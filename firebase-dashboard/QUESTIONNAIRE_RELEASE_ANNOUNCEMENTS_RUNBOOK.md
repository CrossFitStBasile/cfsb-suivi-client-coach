# Annonces scellées — maintenance et reprise des questionnaires

Cet outil publie les deux avis opérationnels de la release questionnaires :

1. une maintenance destinée aux coachs, obligatoirement avant les mutations;
2. une reprise, uniquement après la preuve qu’une soumission live liée au même
   SHA a été enregistrée et vérifiée.

Il ne déploie aucun code et ne touche ni aux questionnaires, ni aux membres, ni
à GHL. Les modes `preview` et `verify` sont en lecture seule.

## Invariants

- Projet fixe : `cfsb-dashboard-coach-aa9a4`.
- Audience des deux annonces : `coaches`.
- Statut initial des annonces : `published`.
- Les IDs du contrôle, de la maintenance et de la reprise contiennent le SHA
  Git complet.
- Le `planHash` contient le SHA Git et les `updateTime` observés.
- Le SHA doit être le `HEAD` d’un worktree propre.
- Une exécution exige un GO et le `planHash` du preview, tous deux liés au SHA.
- Une reprise exige en plus `CFSB_QUESTIONNAIRE_LIVE_PASS_SHA=<SHA_40>`.
- La reprise archive l’avis de maintenance avec sa précondition `updateTime`,
  met à jour le contrôle et crée l’avis de reprise dans un seul commit
  Firestore.
- Un mode `execute` n’est jamais traité comme un succès idempotent implicite.
  Après une réponse réseau incertaine, utiliser le mode `verify`.
- La sortie ne contient aucun jeton, document Firestore brut, réponse membre ou
  renseignement personnel.

## Contenu de la maintenance

L’avis demande aux coachs :

- de ne pas envoyer de nouveau questionnaire;
- de ne pas demander aux membres d’en remplir ou d’en soumettre;
- d’attendre l’avis de reprise.

Il précise que les liens existants restent accessibles autant que possible
pour préserver la continuité. Cette annonce ne prétend donc pas que les liens
publics ont été fermés.

## 1. Sceller le candidat

Toutes les commandes exigent un commit propre. Remplacer `<SHA_40>` par le SHA
exact qui contient l’outil, ses tests, le runbook et la release à annoncer.

```powershell
git status --short
git rev-parse HEAD
```

`git status --short` doit être vide et le SHA affiché doit être celui utilisé
dans toutes les commandes suivantes.

## 2. Publier la maintenance avant toute mutation

Prévisualiser :

```powershell
node tools/manage-questionnaire-release-announcements.cjs `
  --release-commit=<SHA_40> `
  --maintenance-preview
```

Le preview doit indiquer :

- `readOnly: true`;
- deux écritures atomiques planifiées;
- trois documents observés;
- les IDs déterministes;
- un `planHash`.

Armer exactement ce plan :

```powershell
$env:CFSB_QUESTIONNAIRE_MAINTENANCE_GO = "<SHA_40>"
$env:CFSB_QUESTIONNAIRE_MAINTENANCE_PLAN_HASH = "<PLAN_HASH_MAINTENANCE>"

node tools/manage-questionnaire-release-announcements.cjs `
  --release-commit=<SHA_40> `
  --maintenance-execute
```

Nettoyer immédiatement les variables :

```powershell
Remove-Item Env:CFSB_QUESTIONNAIRE_MAINTENANCE_GO -ErrorAction SilentlyContinue
Remove-Item Env:CFSB_QUESTIONNAIRE_MAINTENANCE_PLAN_HASH -ErrorAction SilentlyContinue
```

Vérifier indépendamment :

```powershell
node tools/manage-questionnaire-release-announcements.cjs `
  --release-commit=<SHA_40> `
  --maintenance-verify
```

Ne commencer aucune mutation questionnaires tant que cette vérification ne
retourne pas `maintenancePublished: true`.

Les wrappers `deploy-questionnaire-stage-a.cmd` (`rules`, `additive`,
`legacy`) répètent cette vérification réelle avant leur dry-run puis juste
avant leur mutation. `deploy-questionnaire-stage-b.cmd` la répète avant
Hosting. `CFSB_COACH_NOTICE_CONFIRMED` ne remplace pas ce document live : si
l'annonce est absente, archivée ou déjà remplacée par la reprise, le
déploiement échoue fermé.

Si l’exécution retourne une erreur réseau ou une confirmation incertaine, ne
pas relancer `--maintenance-execute`. Exécuter `--maintenance-verify`.

## 3. Obtenir la preuve live avant la reprise

La variable de preuve ne doit être définie qu’après que le protocole de release
a confirmé, pour ce même SHA :

- une soumission publique live;
- son accusé durable;
- son enregistrement attendu;
- la vérification de l’état post-soumission.

Le simple fait que les tests locaux passent ne constitue pas cette preuve.
L’outil ne crée pas lui-même la preuve : il exige que l’opérateur la lie
explicitement au SHA avant l’écriture de reprise.

## 4. Publier la reprise

Prévisualiser l’état exact de reprise :

```powershell
node tools/manage-questionnaire-release-announcements.cjs `
  --release-commit=<SHA_40> `
  --resume-preview
```

Le preview doit indiquer trois écritures atomiques :

1. passage du contrôle à `resume_published`;
2. archivage précis de la maintenance;
3. création de l’annonce de reprise.

Armer le plan seulement après le PASS live :

```powershell
$env:CFSB_QUESTIONNAIRE_RESUME_GO = "<SHA_40>"
$env:CFSB_QUESTIONNAIRE_RESUME_PLAN_HASH = "<PLAN_HASH_REPRISE>"
$env:CFSB_QUESTIONNAIRE_LIVE_PASS_SHA = "<SHA_40>"

node tools/manage-questionnaire-release-announcements.cjs `
  --release-commit=<SHA_40> `
  --resume-execute
```

Nettoyer immédiatement :

```powershell
Remove-Item Env:CFSB_QUESTIONNAIRE_RESUME_GO -ErrorAction SilentlyContinue
Remove-Item Env:CFSB_QUESTIONNAIRE_RESUME_PLAN_HASH -ErrorAction SilentlyContinue
Remove-Item Env:CFSB_QUESTIONNAIRE_LIVE_PASS_SHA -ErrorAction SilentlyContinue
```

Vérifier indépendamment :

```powershell
node tools/manage-questionnaire-release-announcements.cjs `
  --release-commit=<SHA_40> `
  --resume-verify
```

Le PASS final doit confirmer :

- `maintenanceArchived: true`;
- `resumePublished: true`;
- `livePassReleaseCommit` égal au SHA;
- aucune écriture externe dans ce mode de vérification.

En cas de réponse incertaine après `--resume-execute`, ne pas relancer
l’exécution. Utiliser `--resume-verify`.

## Arrêts obligatoires

- worktree non propre ou SHA différent;
- annonce ou contrôle déterministe déjà présent dans un état inattendu;
- `planHash` différent du preview;
- `updateTime` de la maintenance ou du contrôle modifié;
- preuve live absente ou liée à un autre SHA;
- compte Firebase non authentifié;
- précondition Firestore refusée;
- vérification maintenance ou reprise incomplète.

Un arrêt ne doit jamais être contourné en modifiant les documents manuellement.
Inspecter l’état, conserver les preuves assainies et décider explicitement de
la suite.
