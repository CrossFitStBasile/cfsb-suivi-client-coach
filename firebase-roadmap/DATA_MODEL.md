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
- `status`: `to_read`, `meeting_planned`, `meeting_done`, `action_required`, `ready_to_archive`, `archived`
- `source`: `firebase`, `apps_script_import` ou `manual_import`
- `submittedAt`
- `archivedAt`
- `createdAt`
- `updatedAt`

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
- `priorityTopics`
- `questions`
- `memberCommitments`
- `directionCommitments`
- `followupNotes`
- `updatedAt`

## `orgDepartments/{departmentId}`

- `label`
- `className`
- `sortOrder`
- `active`

## `teamMembers/{memberId}`

- `name`
- `normalizedName`
- `departmentId`
- `displayTitle`
- `roleIds`
- `sortOrder`
- `active`
- `createdAt`
- `updatedAt`

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
