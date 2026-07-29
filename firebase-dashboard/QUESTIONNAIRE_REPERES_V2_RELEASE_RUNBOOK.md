# Publication scellée — Repères CFSB v2

Ce runbook publie uniquement la version 2 de `reperes_cfsb`. L’outil ne déploie
aucun code et ne modifie aucun questionnaire avant le mode `--execute`.

## Invariants scellés

- Projet : `cfsb-dashboard-coach-aa9a4`
- Formulaire : `reperes_cfsb`
- Version source obligatoire : `reperes_cfsb_v1`
- Hash v1 obligatoire :
  `Cir10OcaFefqzXpmR83Xf598Y1EdWIiTzRClop59KGM`
- Version créée : `reperes_cfsb_v2`
- `publishedAt` de la définition :
  `2026-07-29T19:41:35.000Z`
- Hash v2 :
  `NB4xhuqLECIvs2-gZmQZ54ObrnkuRMm4xeaQkX52XPM`
- Le document v1 n’est jamais écrit, remplacé ou supprimé.
- La publication exécute sept opérations dans un seul commit Firestore :
  une précondition `verify` liée au `updateTime` exact de v1, puis six
  mutations pour v2, le formulaire, le catalogue, le slug, la réservation GHL
  et l’audit.
- `deliveryReady` est obligatoirement `false` après la publication et après
  un rollback.
- Le rollback exécute sept opérations dans un seul commit Firestore :
  deux préconditions `verify` liées aux `updateTime` exacts de v1 et v2, puis
  cinq mutations. La version v2 et son hash scellé sont conservés comme preuve.
- Avant de remettre le brouillon du formulaire sur v1, le rollback conserve
  dans son audit immuable `preservedDraftState` la préimage exacte du brouillon
  admin : contenu, révision, deux fingerprints, indicateur de changements,
  métadonnées d’édition/publication, hash du document source et hash autonome
  de la préimage.
- La sortie ne contient ni réponse membre, ni identité, ni jeton Firebase.
- Le `planHash` inclut le SHA Git scellé ainsi que le nom, le hash de contenu
  et le `updateTime` du document v1 observé. Le plan de rollback inclut aussi
  ces trois preuves pour v2.

## Conditions préalables

1. Utiliser un commit Git propre et scellé contenant l’outil, ses tests et le
   contenu final de `INITIAL_DRAFTS.educationalBenchmarks`.
2. La session Firebase CLI doit être authentifiée sur le bon compte.
3. Les coachs peuvent continuer d’utiliser le Dashboard. Le commit Firestore
   est atomique; aucun état partiellement publié n’est visible.
4. Ne pas activer GHL dans cette opération. La v2 reste partageable
   manuellement à son URL fixe, mais les envois Dashboard et planifiés restent
   fermés jusqu’à un nouveau canari GHL lié exactement à la v2.

## 1. Prévisualisation obligatoire

Dans PowerShell, remplacer `<SHA_40>` par le SHA Git scellé :

```powershell
node tools/publish-reperes-v2.cjs --release-commit=<SHA_40> --preview
```

Le preview est en lecture seule. Il s’arrête si :

- le worktree n’est pas propre ou ne correspond pas au SHA;
- le hash v1, son document, le formulaire, le catalogue, le slug ou le tag
  GHL ont dérivé;
- `reperes_cfsb_v2` existe déjà;
- un audit portant le même identifiant existe déjà.

Conserver seulement le `planHash` imprimé. Ce hash change si le SHA Git change,
même lorsque les préimages Firestore sont identiques. Ne copier aucun jeton ou
document Firestore dans les preuves.

## 2. Exécution explicitement armée

```powershell
$env:CFSB_REPERES_V2_RELEASE_GO = "<SHA_40>"
$env:CFSB_REPERES_V2_PLAN_HASH = "<PLAN_HASH_DU_PREVIEW>"
node tools/publish-reperes-v2.cjs --release-commit=<SHA_40> --execute
```

L’exécution relit toutes les préimages. Toute modification après le preview
change le plan ou fait échouer une précondition `updateTime`. Le preview doit
annoncer `plannedAtomicOperations=7`, `plannedDocumentMutations=6` et
`plannedDocumentVerifications=1`. Firestore applique les sept opérations
ensemble ou n’en applique aucune. Le résultat de commit doit contenir sept
`writeResults`; celui correspondant au `verify` peut légitimement être vide.

Nettoyer immédiatement les variables :

```powershell
Remove-Item Env:CFSB_REPERES_V2_RELEASE_GO -ErrorAction SilentlyContinue
Remove-Item Env:CFSB_REPERES_V2_PLAN_HASH -ErrorAction SilentlyContinue
```

## 3. Vérification indépendante

```powershell
node tools/publish-reperes-v2.cjs --release-commit=<SHA_40> --verify
```

La vérification est en lecture seule et exige :

- v1 toujours intact avec le hash scellé;
- v2 exacte avec le hash scellé;
- formulaire, catalogue et slug pointant vers v2;
- réservation du tag GHL inchangée;
- audit de publication présent;
- `deliveryReady=false` et preuves GHL vidées.

Ne pas activer la livraison si cette vérification échoue.

## Retour arrière préparé

Le rollback restaure atomiquement les pointeurs vers v1, garde v2 et son hash
comme preuves immuables, incrémente la révision du formulaire et garde
`deliveryReady=false`. Il demeure valide si v2 a entre-temps été activée dans
GHL et si un administrateur a commencé un nouveau brouillon non publié.

Le brouillon admin n’est jamais perdu : sa préimage exacte est créée dans le
même commit sous `questionnaireStudioAudit/<audit_rollback>`,
champ `preservedDraftState`, avant que le formulaire ne reprenne le brouillon
v1. Cette préimage permet une récupération manuelle fidèle après diagnostic.
L’audit conserve aussi l’état de livraison antérieur et ses preuves, puis le
formulaire et le catalogue sont refermés.

Prévisualiser :

```powershell
node tools/publish-reperes-v2.cjs --release-commit=<SHA_40> --rollback-preview
```

Le preview de rollback doit annoncer `plannedAtomicOperations=7`,
`plannedDocumentMutations=5` et `plannedDocumentVerifications=2`. Son
`planHash` couvre la préimage préservée ainsi que les `updateTime` de v1 et v2.

Puis, seulement si le retour arrière est décidé, utiliser le hash imprimé :

```powershell
$env:CFSB_REPERES_V2_RELEASE_GO = "<SHA_40>"
$env:CFSB_REPERES_V2_ROLLBACK_GO = "<SHA_40>"
$env:CFSB_REPERES_V2_ROLLBACK_PLAN_HASH = "<ROLLBACK_PLAN_HASH>"
node tools/publish-reperes-v2.cjs --release-commit=<SHA_40> --rollback-execute
```

Nettoyer les variables :

```powershell
Remove-Item Env:CFSB_REPERES_V2_RELEASE_GO -ErrorAction SilentlyContinue
Remove-Item Env:CFSB_REPERES_V2_ROLLBACK_GO -ErrorAction SilentlyContinue
Remove-Item Env:CFSB_REPERES_V2_ROLLBACK_PLAN_HASH -ErrorAction SilentlyContinue
```

Vérifier ensuite indépendamment le résultat :

```powershell
node tools/publish-reperes-v2.cjs --release-commit=<SHA_40> --rollback-verify
```

`--rollback-verify` est en lecture seule. Utiliser ce mode avant toute nouvelle
tentative si la réponse réseau de `--rollback-execute` était absente ou
incertaine. Cette vérification refuse aussi un audit dont le brouillon
préservé, les fingerprints, la révision, les métadonnées, le hash autonome ou
le hash v2 auraient dérivé.

Après un rollback, ne pas relancer `--execute` pour tenter de recréer v2 :
la version v2 est volontairement conservée. Toute publication suivante doit
porter un nouvel identifiant de version.

## Arrêts obligatoires

- SHA ou `planHash` différents du preview;
- authentification Firebase incertaine;
- hash v1 différent;
- version v2 déjà présente avant la première publication;
- une précondition Firestore refusée;
- nombre de `writeResults` différent des sept opérations prévues;
- audit de rollback sans préimage de brouillon strictement valide;
- vérification post-commit incomplète;
- demande d’activer GHL dans la même opération.

En cas de réponse incertaine après le commit, ne pas relancer `--execute`.
Exécuter d’abord `--verify`; décider ensuite de conserver v2 ou de suivre le
rollback préparé.
