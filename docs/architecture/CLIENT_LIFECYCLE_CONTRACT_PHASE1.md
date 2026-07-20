# Contrat d’architecture Phase 1 — Identité et cycle de vie client

Projet: Dashboard Coach CFSB / CoachRx
Version du contrat: 1.0
Date: 2026-07-19
Statut: direction approuvée par Michael; Phase 1 autorisée; aucune migration live autorisée
Portée: modèle client, responsabilité, liens externes, services, questionnaires, permissions, compatibilité et préparation de migration

## 1. Décision structurante

Le Dashboard gère une seule notion de personne cliente. « Dashboard seulement » et « liée à CoachRx » sont des états possibles de la même fiche, et non deux catégories permanentes.

Une personne peut:

1. être créée dans le Dashboard pour une évaluation ponctuelle;
2. être reliée à un contact GHL;
3. recevoir un questionnaire sans exister dans CoachRx;
4. ajouter progressivement d’autres services CFSB;
5. devenir plus tard cliente CoachRx;
6. quitter CoachRx tout en conservant sa fiche, ses services et son historique dans le Dashboard.

L’identité interne ne change jamais pendant ce parcours. L’origine de la fiche reste également inchangée afin de préserver la provenance.

## 2. Portée et exclusions

### 2.1 Inclus dans ce contrat

- identité interne immuable;
- origine immuable;
- liens externes CoachRx et GHL optionnels;
- propriétaire observé dans CoachRx;
- responsable opérationnel dans le Dashboard;
- services et engagements dans le temps;
- transitions de cycle de vie;
- permissions et commandes serveur;
- déduplication et fusion contrôlée;
- envoi et retour des questionnaires;
- lecture temporaire des champs historiques;
- préparation d’une migration non destructive;
- critères de validation et scénarios de tests.

### 2.2 Exclus de la Phase 1

- mutation des fiches live;
- fusion ou suppression de fiches historiques;
- déploiement Firebase, Apps Script ou Hosting;
- modification des données GHL;
- création automatique d’un contact GHL;
- publication d’une nouvelle extension;
- communication ou pop-up aux entraîneurs;
- migration live, laquelle demeure une phase séparée avec un nouveau go.

## 3. Vocabulaire

| Terme | Définition |
| --- | --- |
| Fiche canonique | Document interne représentant une personne, indépendamment de ses systèmes externes |
| Identité interne | Identifiant technique immuable du Dashboard |
| Origine | Système ou parcours ayant créé la fiche pour la première fois |
| Lien externe | Association vérifiée entre la fiche interne et un enregistrement GHL ou CoachRx |
| Propriétaire CoachRx | Coach observé dans le dernier roster CoachRx complet et vérifié |
| Responsable Dashboard | Coach actuellement responsable de la relation opérationnelle dans le Dashboard |
| Portée de service | Type de service que la personne consomme ou a consommé |
| Engagement | Période datée pendant laquelle un service est offert à la personne |
| Candidat de rapprochement | Correspondance possible qui doit être confirmée avant de réunir des identités |
| Fusion | Opération administrative transactionnelle réunissant deux fiches après preuve |

## 4. Axes indépendants

Le contrat sépare obligatoirement les axes suivants:

1. **Identité et origine**: qui est la personne dans le Dashboard et comment sa fiche a été créée.
2. **Liens externes**: quels enregistrements GHL ou CoachRx ont été vérifiés pour cette personne.
3. **Responsabilité**: quel coach la gère actuellement dans le Dashboard.
4. **Services**: quels services elle consomme ou a consommés.
5. **Actions historiques**: qui a créé, envoyé, exécuté ou complété chaque action.

Aucun axe ne doit être déduit silencieusement d’un autre. Par exemple:

- un numéro de téléphone GHL ne prouve pas un propriétaire CoachRx;
- un propriétaire CoachRx ne remplace pas automatiquement un override opérationnel;
- la fin d’un engagement CoachRx ne supprime pas la personne;
- le coach ayant envoyé un questionnaire ne devient pas responsable de la personne.

## 5. Contrat canonique de la fiche client

Le document canonique vit sous `clients/{internalClientId}`.

### 5.1 Identité et provenance

| Champ | Type | Obligatoire | Règle |
| --- | --- | --- | --- |
| `internalClientId` | string UUID | Oui | Égal à l’ID du document; généré côté serveur; immuable |
| `originSystem` | enum | Oui | `dashboard_manual`, `coachrx_import` ou `legacy_migrated`; immuable |
| `originCreatedAt` | timestamp | Oui | Horodatage serveur de création; immuable |
| `originCreatedByUid` | string ou null | Selon l’origine | UID du créateur Dashboard, sinon null; immuable |
| `identityStatus` | enum | Oui | `active`, `needs_review`, `merge_pending` ou `merged_alias` |
| `mergedIntoClientId` | string ou null | Conditionnel | Requis uniquement pour une fiche devenue alias après fusion |
| `createdAt` | timestamp | Oui | Horodatage serveur |
| `updatedAt` | timestamp | Oui | Horodatage serveur |

L’identifiant interne ne contient jamais de nom, téléphone, courriel, coach ou identifiant externe. Une modification de téléphone, de nom, de responsable ou de lien externe ne peut donc pas changer l’identité.

### 5.2 Profil et coordonnées

| Champ | Type | Règle |
| --- | --- | --- |
| `displayName` | string | Donnée modifiable; jamais une clé d’identité |
| `phoneNormalized` | string ou null | Coordonnée et signal de rapprochement; jamais une clé canonique |
| `emailNormalized` | string ou null | Coordonnée et signal de rapprochement; jamais une clé canonique |
| `contactDataUpdatedAt` | timestamp | Dernière mise à jour du profil |
| `contactDataSource` | enum | Source de la dernière valeur: dashboard, GHL, CoachRx ou migration |

Les valeurs originales sensibles ne doivent pas être copiées dans les journaux d’audit. Les journaux peuvent conserver l’existence d’une valeur, sa source et, si nécessaire, une terminaison limitée.

### 5.3 Responsabilité Dashboard

| Champ | Type | Obligatoire | Règle |
| --- | --- | --- | --- |
| `dashboardResponsibleCoachId` | string | Oui pour une fiche active | Coach responsable dans le Dashboard |
| `responsibilityMode` | enum | Oui | `dashboard_only`, `follow_coachrx` ou `manual_override` |
| `responsibilityAssignedAt` | timestamp | Oui | Horodatage serveur |
| `responsibilityAssignedByUid` | string | Oui | Acteur ayant confirmé l’assignation |
| `responsibilityReason` | string | Selon le changement | Motif contrôlé, sans renseignement sensible |

Sémantique de `responsibilityMode`:

| Mode | Condition | Comportement |
| --- | --- | --- |
| `dashboard_only` | Aucun lien CoachRx actif vérifié | La responsabilité est gouvernée uniquement par le Dashboard |
| `follow_coachrx` | Lien CoachRx actif et aucun override | Le responsable suit le propriétaire observé dans le dernier roster valide |
| `manual_override` | Lien CoachRx actif et décision opérationnelle explicite | Le responsable reste celui confirmé dans le Dashboard; un écart CoachRx produit une alerte |

Le libellé `dashboard_only` décrit la source de responsabilité actuelle. Il ne signifie pas que la personne ne consomme aucun autre service CFSB.

### 5.4 Lien CoachRx optionnel

Le champ `coachRxLink` est absent ou null tant qu’aucun lien n’a été vérifié.

| Sous-champ | Type | Règle |
| --- | --- | --- |
| `sourceSystem` | string | Toujours `coachrx` |
| `sourceClientId` | string | Identifiant stable du client CoachRx |
| `linkStatus` | enum | `verified`, `candidate`, `conflict` ou `inactive` |
| `rosterStatus` | enum | `active`, `not_in_latest_roster` ou `unknown` |
| `observedAt` | timestamp | Moment du dernier roster complet et valide |
| `importRunId` | string | Lot ayant produit l’observation |
| `linkedAt` | timestamp | Confirmation du lien |
| `linkedByUid` | string | Acteur ou identité serveur ayant confirmé le lien |

Le champ top-level `coachRxOwnerId` est nullable. Il est écrit uniquement à partir d’un roster CoachRx complet, vérifié et autorisé. Il ne peut être écrit par le navigateur, GHL, CSM, un questionnaire ou une opération de transfert Dashboard.

L’unicité globale de `coachrx + sourceClientId` est obligatoire. Le même identifiant CoachRx ne peut être relié à deux fiches canoniques actives.

### 5.5 Lien GHL optionnel

Le champ `ghlLink` est absent ou null tant qu’un contact GHL unique n’a pas été vérifié.

| Sous-champ | Type | Règle |
| --- | --- | --- |
| `contactId` | string | Identifiant stable du contact GHL |
| `linkStatus` | enum | `verified`, `needs_review`, `conflict` ou `inactive` |
| `matchedBy` | enum | `exact_phone`, `admin_confirmed` ou `migration_verified` |
| `verifiedAt` | timestamp | Horodatage serveur |
| `verifiedByUid` | string | Acteur ou identité serveur |
| `lastObservedAt` | timestamp | Dernière confirmation par GHL |

Le téléphone sert à rechercher une correspondance exacte. Une fois le lien confirmé, `ghlLink.contactId` devient la référence externe stable. Modifier le téléphone ne change ni `internalClientId` ni automatiquement `contactId`.

Un `contactId` GHL ne peut être relié qu’à une seule fiche canonique active. Une absence ou une pluralité de correspondances place la liaison en révision et bloque l’envoi de questionnaire. La Phase 1 ne crée pas automatiquement de contact GHL.

### 5.6 Services et engagements

Le tableau `serviceScopes` est une projection serveur des services actifs ou pertinents pour les filtres. Il ne constitue pas l’historique.

Valeurs initiales proposées:

- `lifestyle_assessment`;
- `nutrition`;
- `personal_training`;
- `group_training`;
- `coachrx_programming`;
- `other`.

L’historique canonique vit sous `clients/{internalClientId}/engagements/{engagementId}`:

| Champ | Type | Règle |
| --- | --- | --- |
| `engagementId` | string | Identité immuable de l’engagement |
| `serviceScope` | enum | Type de service |
| `status` | enum | `planned`, `active`, `paused`, `completed` ou `cancelled` |
| `startsAt` | timestamp ou null | Début connu |
| `endsAt` | timestamp ou null | Fin connue |
| `sourceSystem` | enum | Dashboard, CoachRx, GHL ou migration |
| `createdByUid` | string | Acteur ayant créé l’engagement |
| `createdAt` | timestamp | Horodatage serveur |
| `updatedAt` | timestamp | Horodatage serveur |

Un lien CoachRx et un engagement `coachrx_programming` sont deux faits différents. Le lien peut rester présent et inactif après la fin de l’engagement afin de conserver la traçabilité.

## 6. Transitions de cycle de vie

### 6.1 Création Dashboard pour une évaluation

1. Le coach authentifié soumet le nom et le téléphone.
2. Le serveur crée `internalClientId`.
3. `originSystem = dashboard_manual`.
4. `dashboardResponsibleCoachId` est forcé au coach authentifié.
5. `responsibilityMode = dashboard_only`.
6. Un engagement `lifestyle_assessment` est créé.
7. La recherche GHL tente une correspondance exacte unique.
8. En cas de succès, `ghlLink.contactId` est persisté.
9. L’absence de CoachRx est un état normal et ne produit aucune anomalie.

### 6.2 Ajout progressif de services CFSB

Chaque service crée ou met à jour un engagement distinct. L’origine de la fiche reste `dashboard_manual`. L’ajout d’un service n’ajoute pas automatiquement de lien CoachRx et ne change pas le responsable.

Exemple:

`Évaluation habitudes de vie -> nutrition -> entraînement personnel -> programmation CoachRx`

### 6.3 Apparition ultérieure dans CoachRx

1. Le roster vérifié observe un nouvel identifiant CoachRx.
2. L’index des identités externes recherche d’abord cet identifiant exact.
3. S’il n’existe pas, les signaux de téléphone, courriel ou GHL ne créent qu’un candidat de rapprochement.
4. Un candidat unique est présenté à l’administrateur; une ambiguïté reste en révision.
5. Après confirmation, `coachRxLink` est ajouté à la fiche existante.
6. `originSystem` demeure `dashboard_manual`.
7. L’historique, les questionnaires et les engagements restent sous le même `internalClientId`.
8. Le responsable passe à `follow_coachrx` seulement si cette décision est explicite et que le coach concorde; sinon il passe ou demeure en `manual_override`.

Aucune fusion automatique par nom, téléphone ou courriel n’est permise.

### 6.4 Client créé d’abord par CoachRx

Lorsqu’un identifiant CoachRx inédit ne possède aucun candidat plausible:

1. le serveur crée une fiche avec un nouvel `internalClientId`;
2. `originSystem = coachrx_import`;
3. `coachRxLink.linkStatus = verified`;
4. `coachRxOwnerId` provient du roster validé;
5. `dashboardResponsibleCoachId = coachRxOwnerId`;
6. `responsibilityMode = follow_coachrx`.

### 6.5 Fin ou retrait de CoachRx

Un roster complet peut faire passer `coachRxLink.rosterStatus` à `not_in_latest_roster`, mais ne supprime jamais la fiche.

- le lien externe demeure pour la traçabilité;
- l’engagement CoachRx peut être fermé séparément;
- les autres engagements restent inchangés;
- les questionnaires, notes et actions historiques restent accessibles;
- le responsable courant est conservé;
- `follow_coachrx` devient `dashboard_only` par une transition serveur auditée;
- un override actif devient également `dashboard_only` lorsque le lien n’est plus actif, avec son motif conservé dans le journal.

Un roster vide, incomplet ou anormal ne peut effectuer cette transition.

### 6.6 Retour ultérieur dans CoachRx

Le même `sourceClientId` réactive le lien existant sur la même fiche. Il ne crée pas une nouvelle identité. Le mode de responsabilité est recalculé explicitement selon la décision opérationnelle conservée.

## 7. Invariants obligatoires

1. `internalClientId` est immuable et ne contient aucune donnée métier ou personnelle.
2. `originSystem`, `originCreatedAt` et `originCreatedByUid` sont immuables.
3. L’absence de `coachRxLink` est valide pour un client Dashboard.
4. `dashboardResponsibleCoachId` est obligatoire pour toute fiche active et ne prouve pas une appartenance CoachRx.
5. Seul un roster CoachRx complet, vérifié et autorisé écrit `coachRxOwnerId`.
6. GHL, CSM et les questionnaires n’écrivent jamais `coachRxOwnerId`.
7. Un changement de responsable Dashboard ne modifie jamais `coachRxLink` ou `coachRxOwnerId`.
8. Une synchronisation CoachRx ne remplace jamais un `manual_override`; elle crée une alerte.
9. Une synchronisation CoachRx ne désactive, ne rend obsolète et ne supprime jamais un client sans lien CoachRx.
10. La fin d’un lien ou service externe ne supprime jamais l’identité interne.
11. `phoneNormalized`, `emailNormalized` et `displayName` ne sont jamais des clés d’identité.
12. Un même identifiant CoachRx ou GHL ne peut être lié à deux fiches canoniques actives.
13. Une ambiguïté produit `needs_review` ou `conflict`, jamais une attribution silencieuse.
14. Une fusion est réservée à l’admin, transactionnelle, auditée et réversible par plan ciblé.
15. Les actions terminées conservent leurs acteurs historiques.
16. Un questionnaire ne peut modifier ni origine, ni lien CoachRx, ni responsabilité.
17. Les URL questionnaire ne contiennent ni nom, ni téléphone, ni courriel.
18. Toute commande avec la même clé d’idempotence produit un seul effet logique.
19. Chaque pipeline possède son statut propre; un sync questionnaire ne remplace pas le statut CoachRx.
20. Les champs legacy ne sont jamais une nouvelle source autoritaire.

## 8. Frontières d’écriture par source

| Source ou commande | Champs autorisés | Champs interdits |
| --- | --- | --- |
| Création Dashboard | identité interne, origine Dashboard, profil initial, responsable du créateur, engagement demandé | CoachRx owner/link vérifié, responsabilité d’un autre coach |
| Roster CoachRx vérifié | `coachRxLink`, `coachRxOwnerId`, état de l’engagement CoachRx, observation de provenance | Origine, lien GHL, notes manuelles, questionnaires, acteurs historiques |
| GHL | `ghlLink` et enrichissement de contact contrôlé | Identité interne, origine, propriétaire CoachRx, responsable Dashboard |
| CSM | Enrichissements et engagements explicitement mappés | Origine, liens externes non prouvés, responsabilité |
| Questionnaire | tentative, statut d’envoi, réponse, affectation de lecture | Fiche d’identité, propriétaire CoachRx, responsable Dashboard |
| Assignation admin | `dashboardResponsibleCoachId`, mode, motif et audit | Origine, liens externes, actions terminées |
| Fusion admin | Alias, index d’identité et références explicitement migrées | Suppression silencieuse ou réécriture des acteurs historiques |

## 9. Permissions

### 9.1 Coach

Un coach actif peut:

- créer une fiche dont il devient le responsable;
- lire les fiches où `dashboardResponsibleCoachId` correspond à son identité;
- modifier les champs de profil autorisés de ces fiches;
- créer des engagements et actions autorisés dans son périmètre;
- envoyer un questionnaire si le lien GHL est vérifié;
- lire les réponses et actions qui relèvent de son périmètre.

Il ne peut pas:

- choisir un autre coach lors de la création;
- lire ou modifier le portefeuille opérationnel d’un autre coach;
- changer `dashboardResponsibleCoachId` pendant le pilote;
- écrire `internalClientId`, `originSystem`, `coachRxLink`, `coachRxOwnerId` ou `ghlLink`;
- fusionner des fiches;
- contourner une fiche en `needs_review`.

### 9.2 Administrateur

L’administrateur peut exécuter, par commandes serveur seulement:

- `assignDashboardResponsible`;
- `confirmCoachRxLink`;
- `confirmGhlLink`;
- `mergeClients`;
- `resolveIdentityConflict`.

Chaque commande exige un motif, une clé d’idempotence et une entrée d’audit append-only.

### 9.3 Intégrations

- CoachRx utilise une identité révocable par coach et une route/version autorisée.
- GHL utilise un secret serveur; aucun jeton n’est exposé au navigateur ou aux journaux.
- Les réponses questionnaire utilisent un jeton opaque, signé, à portée unique et expirant.
- Les intégrations n’obtiennent aucun droit transversal par un simple `coachId` fourni dans le payload.

## 10. Commandes serveur cibles

| Commande | Effet | Garde principale |
| --- | --- | --- |
| `createDashboardClient` | Crée identité, origine, responsabilité et engagement initial | Responsable forcé à l’acteur |
| `assignDashboardResponsible` | Change le responsable Dashboard | Admin, motif et audit |
| `linkGhlContact` | Confirme un contact GHL exact et unique | Unicité de `contactId` |
| `proposeCoachRxLink` | Crée un candidat sans fusion | Roster vérifié |
| `confirmCoachRxLink` | Attache CoachRx à la fiche choisie | Admin et unicité de `sourceClientId` |
| `mergeClients` | Désigne un survivant et transforme l’autre en alias | Transaction, dry-run et audit |
| `sendQuestionnaire` | Crée une tentative idempotente et appelle GHL | Responsable autorisé, GHL vérifié |
| `recordQuestionnaireResponse` | Lie une réponse à la tentative et au client | Jeton valide et idempotence |

Les clients web ne font pas d’écriture directe équivalente à ces commandes.

## 11. Déduplication et fusion

### 11.1 Signaux forts

- `internalClientId` pour le Dashboard;
- `coachrx + sourceClientId` pour CoachRx;
- `ghl + contactId` pour GHL.

Ces identités sont protégées par un index d’unicité transactionnel.

### 11.2 Signaux de rapprochement seulement

- téléphone normalisé;
- courriel normalisé;
- nom;
- coach courant;
- membership ou type de service.

Ces champs peuvent classer des candidats, mais ne permettent jamais une fusion automatique.

### 11.3 Cas de décision

| Situation | Résultat |
| --- | --- |
| Identifiant externe déjà lié | Réutiliser la fiche existante |
| Un candidat plausible par téléphone/GHL | Créer une proposition à confirmer |
| Plusieurs candidats | `conflict` et révision admin |
| Même téléphone pour deux personnes | Deux fiches conservées; aucune fusion |
| Changement de téléphone | Même identité interne; réévaluation GHL |
| Aucun candidat pour un client CoachRx | Nouvelle fiche CoachRx canonique |
| Fiche manuelle qui apparaît dans CoachRx | Attacher le lien après confirmation |

### 11.4 Fusion contrôlée

Une fusion:

1. produit un dry-run des références touchées;
2. choisit explicitement un `survivorClientId`;
3. transfère les liens externes seulement s’ils sont compatibles;
4. rattache les documents ouverts selon leur contrat;
5. conserve les documents terminés et leurs acteurs;
6. transforme l’autre fiche en `merged_alias` avec `mergedIntoClientId`;
7. conserve une table d’alias pour les anciennes références;
8. écrit un journal avant/après;
9. ne supprime aucun document pendant la migration initiale.

## 12. Contrat questionnaire et GHL

### 12.1 Conditions d’envoi

L’envoi est permis lorsque:

- la fiche est active et sélectionnable;
- l’acteur est le responsable Dashboard ou un admin;
- `ghlLink.linkStatus = verified`;
- le contact GHL est unique;
- le type de questionnaire est autorisé;
- une clé d’idempotence valide est fournie.

Un client n’a pas besoin de lien CoachRx pour recevoir un questionnaire.

### 12.2 Tentative d’envoi

`questionnaireSends/{sendId}` conserve au minimum:

- `clientId`, qui référence `internalClientId`;
- `questionnaireType`;
- `sentByUid` et `sentByCoachId`;
- `dashboardResponsibleCoachIdAtSend`;
- `ghlContactIdAtSend`;
- `idempotencyKey`;
- `deliveryStatus`;
- `preparedAt`, `ghlAcknowledgedAt`, `deliveryConfirmedAt` et `responseReceivedAt` selon les preuves disponibles.

L’ajout réussi d’un tag GHL signifie `ghl_acknowledged`. Il ne doit pas être affiché comme une livraison confirmée tant qu’aucune preuve de livraison n’existe.

### 12.3 URL et réponse

L’URL publique contient seulement un jeton opaque. Le jeton:

- est signé;
- expire;
- est limité à un `sendId` et un type de questionnaire;
- ne révèle aucune donnée personnelle;
- ne confère aucun droit sur la fiche client;
- ne peut produire qu’une réponse logique grâce à l’idempotence.

Le serveur résout le client, le contact et le coach à partir du `sendId`. La réponse est liée à `internalClientId` et conserve le contexte historique de l’envoi. Elle ne modifie jamais la responsabilité.

### 12.4 Contact GHL absent ou ambigu

- zéro correspondance exacte: `ghlLink.linkStatus = needs_review` et envoi bloqué;
- plusieurs correspondances: `ghlLink.linkStatus = conflict` et envoi bloqué;
- une correspondance exacte unique: lien persisté puis envoi autorisé;
- aucune création automatique de contact GHL en Phase 1.

## 13. Compatibilité avec les champs legacy

La compatibilité est une lecture temporaire et contrôlée. Elle ne transforme pas les champs historiques en vérité cible.

| Champ ou comportement legacy | Interprétation temporaire | Cible | Règle de migration |
| --- | --- | --- | --- |
| ID document `{coachId}_{phone ou nom}` | Identifiant historique instable | `internalClientId` UUID | Conserver comme alias; ne jamais recalculer l’identité cible |
| `source` | Signal de provenance parfois ambigu | `originSystem` | Mapper seulement avec preuve; sinon `legacy_migrated` |
| `firebase_app_manual` ou `manual` | Forte indication de création Dashboard | `originSystem = dashboard_manual` | Valider sans exiger CoachRx |
| `sourceClientId` | Peut être ID CoachRx, GHL ou autre selon la route | `coachRxLink.sourceClientId` seulement avec roster vérifié | Ne jamais le promouvoir sans source prouvée |
| `coachId` | Champ surchargé: responsable, source ou filtre | `dashboardResponsibleCoachId` | Déduire seulement de l’état opérationnel confirmé |
| `coachRxId` sur une fiche client | Souvent ID du coach, pas ID du client | `coachRxOwnerId` ou simple indice legacy | Ne prouve ni le lien client ni la propriété |
| `coachName` | Libellé d’affichage | Résolution via le document coach | Ne jamais utiliser pour une permission |
| `ownershipStatus`, `ownershipSource` | Anciennes validations | `identityStatus` et audit | Utiliser comme preuve secondaire |
| `previousCoachId`, `transferredAt` | Trace partielle de transfert | Journal de responsabilité | Ne pas réécrire l’historique terminé |
| `ghlContactId` | Candidat de lien GHL | `ghlLink.contactId` | Promouvoir seulement après unicité et validation |
| `phoneNormalized`, `clientPhoneNormalized` | Coordonnée et clé de rapprochement actuelle | `phoneNormalized` | Ne plus l’utiliser comme identité |
| `membershipSource` | Source de donnée d’abonnement | Engagement ou enrichissement | Ne détermine ni origine ni propriétaire |
| `status = manual` | Signal de création manuelle | Origine/état explicites | Client potentiellement légitime |
| `clientSelectable` | Garde UI actuelle | `identityStatus` + permissions | Conserver comme projection transitoire |
| `assignedCoachId` | Responsable d’un dossier opérationnel | Même rôle explicite | Préserver séparément du responsable client |
| `performedByCoachId`, `completedByCoachId`, etc. | Acteur historique | Même rôle explicite | Immuable après action confirmée |
| `coachSyncStatus` unique | Statuts de sources qui s’écrasent | Statut séparé par source | Aucun pipeline ne remplace le statut d’un autre |

Pendant la compatibilité:

- les nouveaux champs explicites ont priorité;
- un fallback legacy doit être identifiable dans les diagnostics;
- les nouveaux workflows ne doivent pas écrire de nouvelle vérité dans les champs ambigus;
- le retrait définitif des fallbacks attend la migration validée et une phase séparée.

## 14. Classification des données actuelles

La Phase 0 a identifié douze fiches actives sans `sourceClientId` stable.

- neuf fiches d’origine manuelle ou CSM sont des clients Dashboard potentiellement légitimes;
- l’absence d’identifiant CoachRx n’est pas une anomalie pour ces neuf fiches;
- elles doivent être classifiées comme `dashboard_manual` ou `legacy_migrated` selon la preuve disponible;
- leur lien GHL peut être vérifié séparément;
- les trois fiches actuellement étiquetées CoachRx sans ID source stable restent suspectes;
- ces trois fiches doivent soit retrouver un ID CoachRx vérifié, soit être reclassifiées comme Dashboard, soit demeurer en `needs_review`.

Cette classification est produite en dry-run uniquement pendant la Phase 1.

## 15. Plan de migration sans mutation live

### 15.1 Préparation Phase 1

1. Conserver les snapshots et empreintes de la Phase 0.
2. Inventorier les formes de documents clients et leurs références.
3. Construire une matrice `legacyDocumentId -> internalClientId cible`.
4. Classifier l’origine, la responsabilité, les liens et les engagements avec un niveau de preuve.
5. Générer les conflits et candidats sans afficher de renseignements personnels dans les rapports partagés.
6. Préparer les index d’unicité et alias sur données synthétiques.
7. Exécuter les règles et commandes dans les émulateurs.
8. Générer un rapport agrégé avant/après.
9. Préparer un rollback par client, coach et famille de données.

### 15.2 Catégories du dry-run

| Catégorie | Traitement futur proposé |
| --- | --- |
| CoachRx stable et unique | Créer identité interne et lien CoachRx vérifié |
| Dashboard manuel confirmé | Créer identité interne sans lien CoachRx |
| Manuel devenu CoachRx avec preuve | Une identité interne, origine manuelle, lien CoachRx ajouté |
| GHL exact et unique | Ajouter lien GHL vérifié |
| Correspondance ambiguë | `needs_review` ou `conflict` |
| Ancienne fiche inactive | Préserver; ne pas réactiver automatiquement |
| Doublon confirmé | Préparer fusion admin, sans l’exécuter |

### 15.3 Conditions avant une migration live

- nouveau go explicite de Michael pour la Phase 3;
- snapshot privé récent;
- dry-run examiné;
- zéro suppression prévue;
- conflits listés;
- règles et commandes testées;
- rollback ciblé vérifié sur données synthétiques;
- fenêtre de changement et canari approuvés.

## 16. Tests obligatoires

### 16.1 Contrat et identité

- créer un client Dashboard génère un UUID indépendant du téléphone et du coach;
- modifier nom, téléphone ou responsable conserve `internalClientId`;
- modifier `originSystem` est rejeté;
- créer un client manuel sans CoachRx est accepté;
- l’absence d’un client manuel dans un roster CoachRx ne le rend ni obsolète ni inactif.

### 16.2 Permissions

- un coach crée seulement sous sa propre responsabilité;
- Iheb ne lit ni ne modifie une fiche de Marc-André;
- un coach ne change pas le responsable principal;
- un admin peut changer le responsable par commande auditée;
- un navigateur ne peut écrire les liens CoachRx/GHL ni les champs de provenance.

### 16.3 CoachRx

- un roster complet ajoute ou met à jour uniquement sa tranche;
- une version, route, source ou identité coach invalide est rejetée avant écriture;
- un roster vide, partiel ou anormal conserve le dernier roster valide;
- un second import identique produit zéro nouvelle identité et zéro dérive;
- une synchronisation CoachRx ne modifie pas un client Dashboard non lié;
- un override manuel survit à un nouveau sync CoachRx.

### 16.4 GHL et questionnaires

- un client Dashboard sans CoachRx reçoit une évaluation si son lien GHL est vérifié;
- zéro ou plusieurs contacts GHL bloquent l’envoi;
- un contact exact unique est lié par `contactId`;
- un changement de téléphone conserve l’identité interne;
- l’URL ne contient aucune donnée personnelle;
- un double clic, retry ou accusé réseau perdu produit un seul envoi logique;
- l’ajout de tag est distingué d’une livraison confirmée;
- une réponse revient au bon `internalClientId`;
- un questionnaire ne modifie ni propriétaire CoachRx ni responsable Dashboard.

### 16.5 Transitions

- Dashboard -> évaluation -> services -> CoachRx conserve une seule identité et tout l’historique;
- un client CoachRx absent du dernier roster valide reste dans le Dashboard;
- sa fin CoachRx ferme seulement le lien/engagement concerné;
- son retour avec le même ID réactive la même fiche;
- un candidat ambigu n’est jamais fusionné automatiquement.

### 16.6 Déduplication et migration

- même `sourceClientId` CoachRx sur deux fiches est bloqué;
- même `contactId` GHL sur deux fiches est bloqué;
- même téléphone peut rester sur deux fiches distinctes jusqu’à révision;
- une fusion produit un alias et préserve les acteurs historiques;
- le dry-run est idempotent et ne fait aucune écriture live;
- les neuf fiches manuelles/CSM sont classifiées sans exiger CoachRx;
- les trois fiches CoachRx sans ID restent en révision tant que la preuve manque.

## 17. Critères de fin de la Phase 1

La Phase 1 documentaire et sécuritaire est considérée prête lorsque:

- ce contrat est accepté comme référence de conception;
- les nouveaux champs et commandes utilisent les mêmes noms dans code, règles et tests;
- tous les scénarios obligatoires passent dans les émulateurs;
- les anciennes écritures directes de responsabilité sont bloquées dans la cible;
- les intégrations respectent leurs frontières d’écriture;
- les URL questionnaire ne contiennent aucune donnée personnelle;
- les retries sont idempotents;
- le rapport de classification des douze fiches est produit sans mutation live;
- le dry-run de compatibilité explique chaque fallback legacy;
- un rollback ciblé est documenté;
- aucune donnée de production n’a été modifiée;
- la diffusion de l’extension et la communication équipe demeurent NO-GO.

## 18. Décisions enregistrées

| Date | Décision | Décidé par |
| --- | --- | --- |
| 2026-07-19 | Une fiche interne unique peut évoluer de Dashboard seulement vers CoachRx et inversement | Michael |
| 2026-07-19 | L’origine reste immuable même si de nouveaux liens ou services sont ajoutés | Michael |
| 2026-07-19 | Un client Dashboard sans CoachRx est un état valide | Michael |
| 2026-07-19 | Le téléphone sert au rapprochement GHL, pas à l’identité canonique | Michael |
| 2026-07-19 | Aucun rapprochement ou fusion automatique par nom ou téléphone | Michael |
| 2026-07-19 | La Phase 1 est autorisée; aucune migration ou mutation live ne l’est | Michael |
