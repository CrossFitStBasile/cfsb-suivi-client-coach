# Modele de donnees Firebase - Dashboard Coach CFSB

Le registre officiel des sources est `firebase-dashboard/SOURCE_REGISTRY.json`. Ce modele de donnees decrit les collections Firestore; le registre relie ces collections aux sources vivantes, aux backups temporaires et aux regles de conflit.

## `users/{uid}`

Profil d'acces Firebase Auth.

- `active`: boolean
- `role`: `admin` ou `coach`
- `coachId`: string
- `displayName`: string
- `email`: string
- `createdAt`
- `updatedAt`

Acces pilotes:

- `info@crossfitstbasilelegrand.com` peut creer le profil admin initial avec `role: "admin"` et `coachId: "admin"`.
- Les coachs pilotes peuvent creer automatiquement leur profil `role: "coach"` si leur courriel Google correspond exactement a la liste officielle CoachRx.
- L'auto-activation coach ecrit `source: "firebase_self_provision_pilot"` et exige que `coachId` et `coachRxId` soient identiques au CoachRx ID autorise.
- Gabriel/Michael gardent l'acces admin via `info@crossfitstbasilelegrand.com`; cet email n'est pas auto-provisionne comme coach simple.

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
- `attendance30Days`: nombre total de presences dans la fenetre CSM/Kilo de 30 jours
- `attendanceWindowDays`: `30` pour la source actuelle
- `classAttendance30Days`
- `appointmentAttendance30Days`
- `importedEventAttendance30Days`
- `attendanceSource`: `csm_low_attendances`
- `attendanceImportedAt`
- `levelMethodOverall`: niveau global importe de l'onglet CSM `LM`
- `levelMethodLevelsLogged`
- `levelMethodSource`: `csm_lm`
- `levelMethodImportedAt`
- `targetSessionsPerWeek`: cible hebdomadaire manuelle definie par le coach
- `targetSessionsUpdatedAt`
- `targetSessionsUpdatedByUid`
- `targetSessionsUpdatedByEmail`
- `manualMembershipEndDate`
- `kiloPlannedRecurrenceEndDate`
- `riskLevel`: `none`, `low`, `medium`, `high`
- `riskNote`
- `lastQuestionnaireAt`
- `notes`
- `sourceRefs`
- `sourceClientId`
- `sourceUpdatedAt`
- `previousCoachId`
- `transferredAt`
- `transferSource`
- `createdAt`
- `updatedAt`

L'assiduite et le niveau global sont des instantanes importes et peuvent etre actualises par le pont CSM quotidien. `targetSessionsPerWeek` est un champ manuel coach: aucun import externe ne doit le modifier ou l'effacer. Une absence de metrique source reste `indisponible`; elle ne doit jamais etre transformee en zero.

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

## `actionLogs/{logId}`

Trace append-only des actions importantes faites dans le dashboard. Ce journal sert a comprendre l'utilisation reelle, valider les confirmations visuelles et diagnostiquer les erreurs sans exposer de secret.

- `coachId`
- `userId`
- `userEmail`
- `userRole`
- `action`
- `entityType`
- `entityId`
- `details`
- `createdAt`

## `usageEvents/{eventId}`

Evenement d'adoption append-only. Il mesure le module, l'appareil, la session et le type d'interaction sans conserver le texte des missions, notes client ou reponses questionnaire.

- `eventType`
- `coachId`
- `actorCoachId`
- `selectedCoachId`
- `userId`
- `userEmail`
- `userRole`
- `tab`
- `sessionId`
- `appVersion`
- `deviceType`: `mobile`, `tablet` ou `desktop`
- `details`: liste bornee de metadonnees autorisees
- `createdAt`

## `weeklyProductReports/{reportId}`

Rapport prive genere chaque jeudi a 9 h, ou manuellement depuis Admin. Le document ne contient aucun texte libre client.

- `schemaVersion`
- `reportDate`
- `periodStart`
- `periodEnd`
- `summary`
- `adoption`: coachs actifs, sessions, actions, modules et appareils
- `coachRows`: resume d'adoption par coach
- `operations`: missions, rebookings et questionnaires a verifier
- `syncHealth`: fraicheur des coachs et erreurs de synchronisation
- `automationCandidates`: categories repetees et recommandation, sans titre de mission
- `attentionCount`
- `source`
- `generatedAt`

Lecture reservee a l'admin. Ecriture reservee aux Firebase Functions.

## `productReportRequests/{requestId}`

File privee permettant a l'admin de demander un rapport sans droit d'ecriture direct sur `weeklyProductReports`.

- `status`: `queued`, `running`, `success` ou `error`
- `requestedByUid`
- `requestedByEmail`
- `source`
- `reportId`
- `errorMessage`
- `createdAt`
- `startedAt`
- `finishedAt`

## `assistantVoiceRequests/{requestId}`

File privee de transcription pour le pilote vocal admin. Seul le compte exact `info@crossfitstbasilelegrand.com` peut creer et lire ses propres demandes. Le navigateur ne peut ni les modifier ni les supprimer.

- `userId`, `userEmail`: identite Firebase Auth de l'auteur
- `actorCoachId`: toujours `admin`
- `targetCoachId`: coach pilote selectionne
- `requestKind`: uniquement `task_create`
- `contextType`: `global` ou `client`
- `contextEntityId`: vide ou identifiant client canonique
- `status`: `queued`, `transcribing`, `transcribed` ou `error`
- `chunkCount`, `audioBase64Length`, `mimeType`, `durationSeconds`: contrat audio borne; duree maximale de 120 secondes
- `source`: `assistant_admin_voice_pilot`
- `assistantRequestId`: identifiant de la demande texte creee apres une transcription reussie
- `transcriptCharacters`, `language`, `modelName`, `promptVersion`, `latencyMs`, `usage`: metadonnees seulement, sans transcription
- `errorCode`, `errorMessage`: erreur bornee et message coach generique
- `createdAt`, `updatedAt`, `startedAt`, `completedAt`

`processAssistantVoiceRequest` assemble les morceaux, demande uniquement une transcription a Vertex AI, cree ensuite une demande `assistantRequests` normale et nettoie toujours les morceaux. Une transcription ne cree jamais une mission.

## `assistantVoiceChunks/{chunkId}`

Transport audio temporaire et non lisible depuis le navigateur.

- `requestId`, `targetCoachId`, `userId`
- `index`, `total`
- `data`: morceau base64 borne
- `createdAt`

Les regles refusent toute lecture, modification ou suppression cliente. La Firebase Function supprime les morceaux apres le traitement, y compris en erreur. Aucun texte, audio ou morceau brut ne doit etre copie dans `actionLogs`.

## `assistantRequests/{requestId}`

File privee des questions et demandes de mission du pilote Assistant IA. Seul le compte admin `info@crossfitstbasilelegrand.com` peut creer et lire ses propres demandes.

- `userId` et `userEmail`: identite Firebase Auth de l'auteur
- `actorCoachId`: toujours `admin`
- `targetCoachId`: coach pilote selectionne comme portee de lecture
- `requestKind`: `general` en R0 ou `task_create` en R1
- `contextType`: `global` ou `client` pour `task_create`; toujours `global` pour une demande generale
- `contextEntityId`: vide en contexte global ou identifiant client canonique
- `inputMode`: `text` pour une saisie directe ou `voice` pour une transcription serveur
- `inputText`: question admin, limitee a 1200 caracteres
- `status`: `queued`, `processing`, `answered`, `clarification`, `refused`, `proposed` ou `error`
- `source`: `assistant_admin_private_pilot` pour le texte ou `assistant_admin_voice_pilot` pour le vocal
- `proposalId`
- `errorMessage`: message generique sans diagnostic interne
- `createdAt`, `updatedAt`, `startedAt`, `finishedAt`

Le document est reclame par transaction par `processAssistantRequest`. Le modele ne recoit jamais d'acces Firestore et ne peut pas modifier ce document.

## `assistantProposals/{proposalId}`

Reponse ou proposition structuree produite cote serveur. Le modele ne dispose d'aucun droit d'ecriture Firestore.

- `requestId`, `userId`, `userEmail`, `actorCoachId`, `targetCoachId`, `targetCoachName`
- `intent`: `answer`, `clarify`, `refuse` ou `propose_action`
- `title`, `displaySummary`, `clarifyingQuestion`
- `evidenceRefs`: references filtrees contre les elements reellement presents dans le contexte
- `suggestedPrompts`: questions de suivi, sans action automatique
- `riskLevel`: `R0` pour une reponse ou `R1` pour une mission proposee
- `confirmationRequired`: vrai seulement pour R1
- `actionType`: vide en R0 ou `task.create` en R1
- `actionParameters`: client, titre, details, priorite et date proposes
- `status`: `answered`, `clarification`, `refused`, `proposed` ou `executed`
- `expiresAt`: date limite de la proposition; une proposition R1 expire apres 30 minutes
- `modelName`, `modelVersion`, `promptVersion`, `latencyMs`, `usage`
- `createdAt`

Lecture reservee a l'auteur admin. Ecriture reservee aux Firebase Functions. Le texte complet n'est pas recopie dans `actionLogs`.

## `assistantActionRequests/{requestId}`

File privee des actions R1 confirmees. Seul `info@` peut creer et lire ses propres demandes. Le navigateur ne peut ni les modifier ni les supprimer.

- `userId`, `userEmail`: auteur Firebase Auth confirme
- `proposalId`, `targetCoachId`
- `actionType`: uniquement `task.create`
- `confirmedParameters`: `clientId`, `title`, `description`, `priority`, `dueAt`, `starred`
- `status`: `queued`, `processing`, `success` ou `error`
- `resultEntityType`, `resultEntityId`: preuve de la mission creee
- `duplicatePrevented`: vrai si la mission deterministe existait deja
- `source`: `assistant_admin_task_confirmation_pilot`
- `createdAt`, `updatedAt`, `startedAt`, `completedAt`

`processAssistantActionRequest` revalide l'identite, la proposition, son expiration, le coach, le client et les parametres confirmes. Il cree au plus une mission par proposition et journalise seulement des metadonnees techniques.

## `coachSyncStatus/{coachId}`

Resume lisible par le coach et par l'admin pour confirmer la fraicheur des donnees sans exposer le diagnostic complet.

- `coachId`
- `coachName`
- `status`: `ok` ou `warning`
- `warningCount`
- `warnings`
- `clientsImported`
- `tasksImported`
- `questionnaireResponsesImported`
- `rebookingsImported`
- `checkupsImported`
- `impactsImported`
- `alumniImported`
- `requestedByUid`
- `requestedByEmail`
- `triggeredBy`: `manual_admin`, `scheduled` ou `system`
- `syncedAt`
- `source`

## `syncRuns/{syncRunId}`

Journal admin des synchronisations Google Sheets vers Firestore. Cette collection garde le diagnostic complet et n'est pas exposee aux coachs.

- `requestedByUid`
- `requestedByEmail`
- `triggeredBy`: `manual_admin`, `scheduled` ou `system`
- `triggeredByEventId`
- `coachIds`
- `results`
- `sourceOverview`
- `results[].diagnostics.importedClients.missingPhone`
- `results[].diagnostics.sourceHeaders`
- `tabsRead`
- `questionnaireTabsRead`
- `checkupTabsRead`
- `questionnaireWarnings`
- `checkupWarnings`
- `warnings`
- `startedAt`
- `finishedAt`
- `createdAt`
- `completedAt`
- `source`

## `sourceImportRuns/{sourceImportRunId}`

Journal admin des imports directs Apps Script / sources externes vers Firestore.

- `sourceType`: `coachrx_clients`, `client_directory`, `ghl_contacts`, `rebooking`, `checkups`, `questionnaire_responses`
- `requestedBy`
- `importMode`: `direct_cloud_function`
- `coachId`
- `coachName`
- `recordsReceived`
- `recordsWritten`
- `status`: `running`, `done`, `warning`, `error`, `received_unprocessed`
- `warnings`
- `diagnostics`
- `sample`: echantillon masque, jamais de secret ni token
- `errorMessage`
- `createdAt`
- `startedAt`
- `finishedAt`
- `updatedAt`

Cette collection prouve ce que les scripts ont envoye a Firebase sans exposer les secrets. Les coachs ne la lisent pas; elle sert aux admins et aux diagnostics.

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
- `clientPhoneNormalized`
- `sessionsToRebook`
- `status`: `open`, `managed`, `rebooked`, `coach_absence`, `archived`
- `detectedAt`
- `appointmentAt`
- `service`
- `managedAt`
- `sourceStatus`
- `history`
- `statusNote`
- `coachAbsenceReason`
- `absenceStartDate`
- `absenceEndDate`
- `source`
- `sourceEventId`
- `sourceRebookEventId`
- `sourceNewAppointmentAt`
- `sourceClosedAt`
- `sourceClosedBy`
- `sourceClosureReason`
- `sourceClosureNote`
- `sourceRowHasPhone`
- `sourceRowHasEventId`
- `matchMethod`: `phone`, `name`, `existing`, `unmatched`

## `checkups/{checkupId}`

- `coachId`
- `clientId`
- `clientName`
- `clientPhoneNormalized`
- `checkupDate`
- `summary`
- `sourceTab`
- `source`
- `createdAt`
- `updatedAt`

## `impacts/{impactId}`

- `coachId`
- `clientId`
- `clientName`
- `amount`
- `serviceType`
- `status`: `draft`, `confirmed`, `cancelled`, `deleted`
- `impactDate`
- `note`
- `editedAt`
- `statusChangedAt`
- `deletedAt`
- `createdAt`
- `updatedAt`

## `performanceSettings/{coachId}`

Document de pilotage du coach. L'onglet visible s'appelle **Pilotage**, mais la collection conserve son nom technique historique.

- `coachId`
- `coachRxId`
- `coachName`
- `quarterlyObjective`
- `objectivePeriod`
- `objectiveStatus`: `active`, `paused`, `achieved`
- `objectiveNote`
- `reminderEnabled`
- `reminderWeekday`
- `nextReminderAt`
- `pilotageDiscussionItems[]`
  - `id`
  - `title`
  - `note`
  - `status`: `open`, `done`
  - `taskId`
  - `createdAt`
  - `createdByEmail`
  - `discussedAt`
- `pilotageMeetingNotes[]`
  - `id`
  - `meetingDate`
  - `title`
  - `duration`
  - `brightSpot`
  - `impactsCounted`
  - `scheduleNotes`
  - `programmingNotes`
  - `rebookingNotes`
  - `newClientsNotes`
  - `lostClientsNotes`
  - `performanceAnalysis`
  - `netPayResult`
  - `trainingNotes`
  - `idsNotes`
  - `notes`
  - `decisions`
  - `nextActions`
  - `createdAt`
  - `createdByEmail`
  - `updatedAt`
- `manualNewClients[]`
- `newClientExcludedIds[]`
- `updatedAt`
- `updatedByEmail`

## `alumni/{alumniId}`

- `coachId`
- `name`
- `phoneNormalized`
- `email`
- `status`: `to_work`, `contacted`, `do_not_contact`, `reactivated`, `archived`
- `lastContactAt`
- `nextFollowupAt`
- `statusChangedAt`
- `returnedToWorkAt`
- `reactivatedAt`
- `archivedAt`
- `editedAt`
- `note`

## Notes d'integration

- Firestore est la base operationnelle du dashboard. Google Sheets, Apps Script, CoachRx, GHL et Kilo sont des sources externes ou des filets de securite pendant la migration.
- Les champs manuels coach gagnent toujours sur les imports: `manualMembershipEndDate`, `kiloPlannedRecurrenceEndDate`, `riskLevel`, `riskNote`, `notes` et `coachObjective` ne doivent pas etre remplaces par une synchronisation automatique sans action explicite du coach/admin.
- La reconciliation client dans l'interface doit privilegier `phoneNormalized`, puis `sourceClientId`, puis le nom. Le nom seul est un dernier recours parce qu'il est plus fragile lors des imports CoachRx/GHL.
- Le transfert manuel d'un client entre coachs doit conserver la fiche client existante, ses notes, ses dates manuelles et son risque coach. L'ancien coach est trace avec `previousCoachId`. Les donnees liees par `clientId` doivent suivre le transfert: `tasks`, `rebookings`, `questionnaireSends`, `questionnaireResponses`, `checkups` et `impacts`.
- Les transferts de coach peuvent etre faits par le coach proprietaire ou par un admin. Les regles Firestore bornent le transfert aux coachs pilotes connus; les donnees liees suivent le dossier avec `previousCoachId`, `transferredAt` et `transferSource`.
- Une relance questionnaire ne doit etre creee que si `questionnaireSends.status === "sent"` et que `sentAt` date d'au moins 7 jours sans `answeredAt` ni reponse client correspondante apres l'envoi.
- Un envoi en `prepared` ne compte pas comme relance et ne doit pas generer de fausse action coach.
- La vue `Envoyes sans reponse` peut afficher les envois en stand-by avant 7 jours; le bouton de creation de relance reste bloque avant le seuil.
- Pour relier un envoi a une reponse, utiliser le telephone normalise et verifier que `questionnaireResponses.submittedAt` est posterieur ou egal a `questionnaireSends.sentAt`. Une reponse plus ancienne ne doit pas faire disparaitre un nouvel envoi.
- Le dernier envoi questionnaire visible pour un client doit etre choisi par date (`sentAt`, puis `preparedAt`, puis `createdAt`), pas par ordre du tableau local.
- Les champs manuels `manualMembershipEndDate` et `kiloPlannedRecurrenceEndDate` restent manuels: aucune date de fin de membership ne doit etre calculee automatiquement.
- Les imports Google Sheets ne doivent pas ecraser un champ utile par une valeur vide. Si la source n'a pas de courriel, telephone, membership ou ID source, le champ existant doit rester intact.
- Les tokens GoHighLevel et les liens de rebooking tokenises ne doivent pas etre places dans GitHub Pages ou dans le code public.
