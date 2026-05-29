# Modele de donnees Firebase - Dashboard Coach CFSB

## `users/{uid}`

Profil d'acces Firebase Auth.

- `active`: boolean
- `role`: `admin` ou `coach`
- `coachId`: string
- `displayName`: string
- `email`: string
- `createdAt`
- `updatedAt`

## `coaches/{coachId}`

- `coachRxId`
- `name`
- `email`
- `active`
- `rebookingUrl`
- `ghlUserId`
- `createdAt`
- `updatedAt`

IDs pilotes:

- `15935` - Marc-Andre Menard
- `15928` - Iheb Yahyaoui
- `17242` - Camille Proulx
- `15902` - David Olivier
- `15893` - Gabriel Mayer Bedard
- `15937` - Hugo Lelievre
- `15936` - Raphael Samson

## `clients/{clientId}`

- `coachId`
- `name`
- `firstName`
- `lastName`
- `lastNameSort`
- `phoneNormalized`
- `email`
- `status`: `active`, `manual`, `alumni`, `removed`
- `membershipLabel`
- `manualMembershipEndDate`
- `kiloPlannedRecurrenceEndDate`
- `riskLevel`: `none`, `low`, `medium`, `high`
- `riskNote`
- `lastQuestionnaireAt`
- `notes`
- `sourceRefs`
- `createdAt`
- `updatedAt`

## `tasks/{taskId}`

- `coachId`
- `clientId`
- `type`: `program`, `rebooking`, `questionnaire_followup`, `validation`, `coach_note`, `manual`
- `title`
- `description`
- `status`: `open`, `done`, `ignored`, `waiting`, `archived`
- `priority`: `P1`, `P2`, `P3`
- `priorityRank`: number
- `dueAt`
- `createdAt`
- `updatedAt`
- `source`

## `questionnaireResponses/{responseId}`

- `coachId`
- `clientId`
- `clientPhoneNormalized`
- `clientName`
- `submittedAt`
- `triageStatus`: `vert`, `jaune`, `orange`, `rouge`
- `coachActionType`
- `processingStatus`: `to_read`, `read`, `validated`, `archived`, `unmatched`
- `answers`
- `rawPayload`
- `createdAt`
- `updatedAt`

## `questionnaireSends/{sendId}`

- `coachId`
- `clientId`
- `clientPhoneNormalized`
- `status`: `prepared`, `sent`, `answered`, `error`, `cancelled`
- `deliveryStatus`: `pending_backend`, `sent`, `error`
- `preparedAt`
- `sentAt`
- `answeredAt`
- `ghlContactId`
- `ghlWorkflowId`
- `error`
- `createdAt`
- `updatedAt`

## `rebookings/{rebookingId}`

- `coachId`
- `clientId`
- `clientName`
- `sessionsToRebook`
- `status`: `open`, `managed`, `rebooked`, `coach_absence`, `archived`
- `detectedAt`
- `managedAt`
- `history`
- `source`

## `impacts/{impactId}`

- `coachId`
- `clientId`
- `clientName`
- `amount`
- `serviceType`
- `status`: `draft`, `confirmed`, `cancelled`
- `impactDate`
- `note`
- `createdAt`
- `updatedAt`

## `alumni/{alumniId}`

- `coachId`
- `name`
- `phoneNormalized`
- `email`
- `status`: `to_work`, `contacted`, `do_not_contact`, `reactivated`, `archived`
- `lastContactAt`
- `nextFollowupAt`
- `note`

## `actionLogs/{logId}`

Journal append-only des actions importantes.

- `coachId`
- `userId`
- `entityType`
- `entityId`
- `action`
- `createdAt`
- `details`

## Notes d'integration

- Une relance questionnaire ne doit etre creee que si `questionnaireSends.status === "sent"` et que `sentAt` date d'au moins 7 jours sans `answeredAt`.
- Un envoi en `prepared` ne compte pas comme relance et ne doit pas generer de fausse action coach.
- Les champs manuels `manualMembershipEndDate` et `kiloPlannedRecurrenceEndDate` restent manuels: aucune date de fin de membership ne doit etre calculee automatiquement.
- Les tokens GoHighLevel et les liens de rebooking tokenises ne doivent pas etre places dans GitHub Pages ou dans le code public.
