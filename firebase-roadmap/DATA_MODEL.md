# Modele de donnees Firebase - Roadmap CFSB

## Principes

- Les identifiants provenant d'Apps Script sont conserves pour rendre l'import idempotent.
- Une soumission finale pointe vers une version immutable du formulaire. Cette version n'est jamais ecrasee.
- Archiver signifie changer le statut d'une soumission, pas la deplacer ou la detruire.
- Les notes owners sont separees des reponses employe.
- Les secrets et webhooks ne sont jamais stockes dans le frontend ou Firestore.

## `users/{uid}`

Profil d'acces au dashboard owners.

- `active`: boolean
- `role`: `owner`, `admin` ou `viewer`
- `displayName`
- `email`
- `createdAt`
- `updatedAt`

## `roadmapForms/{version}`

Version immutable du questionnaire.

- `project`
- `version`
- `publishedAt`
- `active`
- `config`: snapshot complet de `roadmap-config.json`
- `configHash`

## `roadmapCycles/{cycleId}`

Exemple: `2026-Q2`.

- `label`
- `status`: `draft`, `open`, `closed`
- `public`
- `formVersion`
- `opensAt`
- `closesAt`

## `roadmapDrafts/{draftId}`

Brouillon modifiable par son auteur anonyme ou par un owner.

- `authorUid`
- `clientSubmissionId`
- `sourceSubmissionId`
- `cycleId`
- `formVersion`
- `selectedRoleId`
- `selectedRoleLabel`
- `answers`
- `completion`
- `status`: `draft` ou `submitted`
- `createdAt`
- `updatedAt`
- `submittedAt`

## `roadmapSubmissions/{submissionId}`

Soumission finale et dossier durable.

- `authorUid`
- `sourceSubmissionId`
- `clientSubmissionId`
- `teamMemberId`
- `employeeName`
- `cycleId`
- `formVersion`
- `formConfigHash`
- `selectedRoleId`
- `selectedRoleLabel`
- `answers`
- `completion`
- `status`: `to_read`, `message_to_send`, `meeting_planned`, `action_required`, `meeting_done`, `ready_to_archive`, `archived`
- `source`: `firebase`, `apps_script_import` ou `manual_import`
- `submittedAt`
- `archivedAt`
- `createdAt`
- `updatedAt`
- `deletedAt`: date de mise a la corbeille, absente sinon
- `deletedByUid`
- `deletedByName`
- `statusBeforeDelete`: statut historique conserve pendant un passage dans la corbeille

Les statuts `ready_to_archive` et `archived` restent supportes pour les donnees historiques. Le flux courant se termine directement a `meeting_done` lorsqu'aucun suivi n'est requis.

Sous-collection `events/{eventId}`:

- `type`
- `actorUid`
- `occurredAt`
- `details`

## `ownerNotes/{submissionId}`

- `submissionId`
- `reviewerUid`
- `reviewerName`
- `ownerStatus`
- `meetingFormat`
- `meetingDate`
- `meetingSummary`: compte rendu principal utilise par la nouvelle interface
- `priorityTopics`
- `questions`
- `memberCommitments`
- `directionCommitments`
- `followupNotes`
- `nextAction`
- `followupDate`
- `meetingCompletedAt`
- `followupCompletedAt`
- `updatedAt`

Les anciens champs structures, dates et `followupNotes` sont conserves pour ne perdre aucune note importee. Ils restent consultables dans un bloc historique replie, mais le flux courant ne demande ni date de rencontre ni compte rendu obligatoire.

## `orgDepartments/{departmentId}`

- `label`
- `className`
- `sortOrder`
- `active`

## `teamMembers/{memberId}`

- `name`
- `normalizedName`
- `email`
- `aliases`: autres orthographes reconnues pendant le rapprochement des anciennes soumissions
- `departmentId`
- `displayTitle`
- `careerTarget`: direction de carriere visee affichee dans le dossier
- `roleIds`
- `sortOrder`
- `active`
- `createdAt`
- `updatedAt`

L'identifiant du document est permanent. Un changement de nom ne doit jamais creer un nouveau dossier. Chaque soumission est reliee par `teamMemberId`; le nom et le courriel ne servent qu'au rapprochement initial ou a la correction manuelle.

## Suppression et restauration

- Terminer conserve la roadmap dans l'historique et le dossier longitudinal du membre.
- Mettre a la corbeille ajoute `deletedAt` et masque la roadmap de tous les compteurs et dossiers.
- Restaurer depuis la corbeille remet la roadmap dans l'historique.
- La suppression definitive efface `roadmapSubmissions/{submissionId}` et `ownerNotes/{submissionId}` apres une confirmation explicite, tout en conservant une entree minimale sans nom dans `auditLogs`.

## `careerMilestones/{milestoneId}`

Etape durable du parcours professionnel d'un membre.

- `teamMemberId`
- `title`
- `category`: `role`, `certification`, `skill`, `clientele`, `income`, `leadership` ou `other`
- `status`: `planned`, `in_progress`, `blocked`, `completed` ou `abandoned`
- `targetDate`
- `completedDate`
- `description`
- `successCriteria`
- `ownerName`
- `progress`: nombre de 0 a 100
- `sourceSubmissionId`: roadmap d'origine, si applicable
- `sourceLabel`
- `archivedAt`: etape retiree de la ligne du temps, absente sinon
- `createdAt`
- `createdByUid`
- `updatedAt`
- `updatedByUid`

## `careerUpdates/{updateId}`

Note d'evolution immutable rattachee a une etape de carriere.

- `milestoneId`
- `teamMemberId`
- `note`
- `progress`
- `statusSnapshot`
- `createdAt`
- `createdByUid`
- `createdByName`

Les mises a jour sont conservees separement afin qu'une nouvelle note n'ecrase jamais l'historique d'evolution.

## `managementTasks/{taskId}`

Action de gestion creee manuellement par Michael ou Gabriel. Les actions directement issues des Roadmaps et des etapes de carriere sont projetees automatiquement dans l'interface sans dupliquer les donnees sources.

- `title`
- `description`
- `teamMemberId`: membre concerne, si applicable
- `teamMemberName`
- `ownerName`: `Michael`, `Gabriel` ou `Michael + Gabriel`
- `priority`: `P1`, `P2` ou `P3`
- `status`: `open`, `completed` ou `cancelled`
- `dueDate`: facultatif et conserve surtout pour les anciennes actions
- `taskKind`: `general`, `meeting`, `followup` ou `development`
- `sourceType`: `manual`
- `createdAt`
- `createdByUid`
- `createdByName`
- `updatedAt`
- `updatedByUid`
- `completedAt`
- `completedByUid`

## `revenueScenarios/{scenarioId}`

- `authorUid`
- `teamMemberId`
- `cycleId`
- `scenarioName`
- `inputs`
- `results`
- `createdAt`
- `updatedAt`

## `notificationJobs/{jobId}`

Collection serveur seulement, utilisee apres activation des Cloud Functions.

- `type`
- `submissionId`
- `status`
- `attempts`
- `lastError`
- `createdAt`
- `processedAt`

## `auditLogs/{logId}`

Journal append-only des actions owners importantes.

- `actorUid`
- `action`
- `entityType`
- `entityId`
- `details`
- `createdAt`
