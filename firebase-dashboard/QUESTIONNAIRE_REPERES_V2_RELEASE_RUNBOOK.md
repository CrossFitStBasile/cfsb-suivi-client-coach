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
- Le document v1 est ciblé uniquement par une mise à jour sans changement de
  son `versionHash`, liée à son `updateTime` exact. Sa valeur et son
  `updateTime` demeurent inchangés.
- La publication exécute huit opérations dans un seul commit Firestore :
  six mutations pour v2, le formulaire, le catalogue, le slug, la réservation
  GHL et l’audit, plus deux gardes atomiques. Les gardes protègent v1 et
  l’absence d’un audit de rollback avec `delete` + `exists=false`.
- `deliveryReady` est obligatoirement `false` après la publication et après
  un rollback.
- Le rollback exécute huit opérations dans un seul commit Firestore :
  cinq mutations et trois mises à jour sans changement liées aux `updateTime`
  exacts de v1, v2 et de l’audit de publication. La version v2, son hash et
  l’audit de publication sont conservés comme preuves.
- Avant de remettre le brouillon du formulaire sur v1, le rollback conserve
  dans son audit immuable `preservedDraftState` la préimage exacte du brouillon
  admin : contenu, révision, deux fingerprints, indicateur de changements,
  métadonnées d’édition/publication, hash du document source et hash autonome
  de la préimage.
- La sortie ne contient ni réponse membre, ni identité, ni jeton Firebase.
- Le `planHash` inclut deux SHA distincts : `releaseCommit`, soit le SHA live
  source dont l’audit et le contenu sont vérifiés, et `toolingCommit`, soit le
  `HEAD` propre qui contient l’outil corrigé. Il inclut aussi le nom, le hash de
  contenu et le `updateTime` du document v1 observé. Le plan de rollback inclut
  aussi ces trois preuves pour v2.

## Conditions préalables

1. Utiliser un `HEAD` Git propre contenant l’outil corrigé et descendant du
   `releaseCommit` live. Le runner vérifie que le SHA live existe et contient
   exactement la version Dashboard et le hash v2 scellés. Il expose le `HEAD`
   courant sous `toolingCommit`; aucun argument séparé n’est accepté pour le
   substituer.
2. La session Firebase CLI doit être authentifiée sur le bon compte.
3. Les coachs peuvent continuer d’utiliser le Dashboard. Le commit Firestore
   est atomique; aucun état partiellement publié n’est visible.
4. Ne pas activer GHL dans la même opération qu’une publication. La version
   publiée reste partageable manuellement à son URL fixe; son activation doit
   demeurer une opération séparée après un canari GHL lié exactement à cette
   version.

## 1. Prévisualisation obligatoire

Dans PowerShell, remplacer `<RELEASE_SHA_40>` par le SHA du release live
source. Pour le release du 29 juillet, il s’agit de
`9d6c0a9f300f78c5a6e6d22a1d34c436df455f1f` :

```powershell
node tools/publish-reperes-v2.cjs --release-commit=<RELEASE_SHA_40> --preview
```

Le preview est en lecture seule. Il s’arrête si :

- le worktree n’est pas propre, `HEAD` n’est pas un commit descendant du
  release, ou le contenu scellé du release a dérivé;
- le hash v1, son document, le formulaire, le catalogue, le slug ou le tag
  GHL ont dérivé;
- `reperes_cfsb_v2` existe déjà;
- un audit portant le même identifiant existe déjà.

Conserver le `planHash`, le `releaseCommit` et le `toolingCommit` imprimés. Le
hash change si l’un des deux SHA change, même lorsque les préimages Firestore
sont identiques. Ne copier aucun jeton ou document Firestore dans les preuves.

## 2. Exécution explicitement armée

```powershell
$env:CFSB_REPERES_V2_RELEASE_GO = "<RELEASE_SHA_40>"
$env:CFSB_REPERES_V2_PLAN_HASH = "<PLAN_HASH_DU_PREVIEW>"
node tools/publish-reperes-v2.cjs --release-commit=<RELEASE_SHA_40> --execute
```

L’exécution relit toutes les préimages. Toute modification après le preview
change le plan ou fait échouer une précondition `updateTime`. Le preview doit
annoncer `plannedAtomicOperations=8`, `plannedDocumentMutations=6` et
`plannedAtomicGuards=2`. Les deux gardes sont une mise à jour sans changement
de v1 liée à son `updateTime`, puis une suppression conditionnelle liée à
`exists=false` qui prouve atomiquement l’absence d’un audit de rollback.
Firestore applique les huit opérations ensemble ou n’en applique aucune. Le
résultat de commit doit contenir huit `writeResults`; celui de la suppression
conditionnelle sur le document absent peut ne pas porter d’`updateTime`.

Nettoyer immédiatement les variables :

```powershell
Remove-Item Env:CFSB_REPERES_V2_RELEASE_GO -ErrorAction SilentlyContinue
Remove-Item Env:CFSB_REPERES_V2_PLAN_HASH -ErrorAction SilentlyContinue
```

## 3. Vérification indépendante

```powershell
node tools/publish-reperes-v2.cjs --release-commit=<RELEASE_SHA_40> --verify
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
formulaire et le catalogue sont refermés. Sa preuve durable distingue
`sourceReleaseCommit`, le SHA du release live dont l’audit est validé, et
`toolingCommit`, le `HEAD` propre contenant l’outil de rollback exécuté.

Prévisualiser :

```powershell
node tools/publish-reperes-v2.cjs --release-commit=<RELEASE_SHA_40> --rollback-preview
```

Le preview de rollback doit annoncer `plannedAtomicOperations=8`,
`plannedDocumentMutations=5` et `plannedAtomicGuards=3`. Les gardes sont des
mises à jour sans changement liées aux `updateTime` de v1, v2 et de l’audit de
publication. Son `planHash` couvre la préimage préservée ainsi que ces trois
gardes; l’audit de rollback demeure une création liée à `exists=false`.

Puis, seulement si le retour arrière est décidé, utiliser le hash imprimé :

```powershell
$env:CFSB_REPERES_V2_RELEASE_GO = "<RELEASE_SHA_40>"
$env:CFSB_REPERES_V2_ROLLBACK_GO = "<RELEASE_SHA_40>"
$env:CFSB_REPERES_V2_ROLLBACK_PLAN_HASH = "<ROLLBACK_PLAN_HASH>"
node tools/publish-reperes-v2.cjs --release-commit=<RELEASE_SHA_40> --rollback-execute
```

Nettoyer les variables :

```powershell
Remove-Item Env:CFSB_REPERES_V2_RELEASE_GO -ErrorAction SilentlyContinue
Remove-Item Env:CFSB_REPERES_V2_ROLLBACK_GO -ErrorAction SilentlyContinue
Remove-Item Env:CFSB_REPERES_V2_ROLLBACK_PLAN_HASH -ErrorAction SilentlyContinue
```

Vérifier ensuite indépendamment le résultat :

```powershell
node tools/publish-reperes-v2.cjs --release-commit=<RELEASE_SHA_40> --rollback-verify
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
- nombre de `writeResults` différent des huit opérations prévues;
- audit de rollback sans préimage de brouillon strictement valide;
- vérification post-commit incomplète;
- demande d’activer GHL dans la même opération.

En cas de réponse incertaine après le commit, ne pas relancer `--execute`.
Exécuter d’abord `--verify`; décider ensuite de conserver v2 ou de suivre le
rollback préparé.
