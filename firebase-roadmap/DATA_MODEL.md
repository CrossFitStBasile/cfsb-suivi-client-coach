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
- `role`: `owner`, `admin`, `viewer` ou `member`
- `teamMemberId`: requis pour un profil `member`; limite l'acces a ce seul dossier
- `invitationId`: invitation utilisee lors de la premiere activation membre
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

Les statuts `message_to_send`, `ready_to_archive` et `archived` restent supportes pour les donnees historiques. Dans l'interface, `message_to_send` est traite comme `meeting_planned`; aucune tache de messagerie n'est generee. Le flux courant se termine directement a `meeting_done` lorsqu'aucun suivi n'est requis.

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

## `teamMemberPrivate/{memberId}`

Metadonnees reservees aux owners et separees de l'organigramme public.

- `roadmapDocumentUrl`: lien vers le document Drive utilise pendant les rencontres
- `createdAt`
- `updatedAt`
- `updatedByUid`
- `updatedByName`

Le document porte le meme identifiant permanent que `teamMembers/{memberId}`. Le lien Drive n'est jamais publie avec les donnees lues par le formulaire employe.

## `memberPortalProfiles/{memberId}`

Configuration partageable du portail membre. Le document porte le meme identifiant permanent que `teamMembers/{memberId}`.

- `teamMemberId`
- `memberName`
- `roadmapDocumentUrl`: lien Drive volontairement visible au membre
- `coachDashboardId`: identifiant stable du Dashboard Coach
- `portalEmail`
- `portalEnabled`
- `portalContractVersion`
- `updatedAt`
- `updatedByUid`
- `updatedByName`

## `portalInvitations/{memberId}`

Autorisation d'activation du portail avec un compte Google precis.

- `teamMemberId`
- `memberName`
- `email`
- `active`
- `portalContractVersion`
- `suspendedByArchive`: vrai lorsqu'un archivage a retire l'acces
- `createdAt`
- `updatedAt`

Une invitation ne donne acces qu'au dossier dont l'identifiant correspond. L'archivage du membre desactive aussi l'invitation et les profils membres deja lies.

## `memberCareerPlans/{memberId}`

Mandat de carriere modifiable par le membre et les owners.

- `teamMemberId`
- `roleGoal`
- `visionOneYear`
- `ninetyDayFocus`
- `commitments`
- `successMeasures`
- `supportNeeded`
- `skillsToDevelop`
- `certifications`
- `portalContractVersion`
- `createdAt`
- `createdByUid`
- `updatedAt`
- `updatedByUid`

Chaque sauvegarde utilise une verification de version pour eviter qu'une session ecrase silencieusement une modification plus recente.

## `memberCareerPlanEvents/{eventId}`

Historique append-only de chaque sauvegarde du mandat.

- `teamMemberId`
- `summary`
- `changedFields`
- `createdAt`
- `createdByUid`
- `createdByName`

## `memberSharedSummaries/{meetingId}`

Compte rendu volontairement publie a partir d'une rencontre owner finalisee.

- `meetingId`
- `teamMemberId`
- `teamMemberName`
- `meetingDate`
- `headline`
- `summary`
- `commitments`
- `ownerSupport`
- `publishedAt`
- `publishedByUid`
- `updatedAt`

La collection ne contient jamais le brouillon complet de `teamMeetings`. Retirer un compte rendu du portail ne modifie pas la rencontre privee.

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

## `teamMeetings/{meetingId}`

Note privee d'une rencontre 1:1 rattachee au dossier permanent du membre. Cette collection est reservee aux owners.

- `teamMemberId`
- `teamMemberName`
- `meetingType`: `one_on_one`
- `templateVersion`
- `status`: `draft` ou `finalized`
- `meetingDate`: date de la rencontre, sans creer de rendez-vous dans le dashboard
- `facilitatorName`: leader qui mene la rencontre
- `checkIn`
- `previousCommitmentStatus`: `not_applicable`, `kept`, `partial` ou `not_kept`
- `previousCommitmentNotes`
- `pillar`: `money`, `skill`, `relationship` ou `other`
- `pillarNotes`
- `leverageAction`
- `memberCommitment`
- `successMeasure`
- `leaderSupport`
- `additionalNotes`
- `signals`
- `sourceRoadmapId`: roadmap trimestrielle consultee pendant la preparation, si applicable
- `supportTaskId`: action owner creee depuis le soutien promis, si applicable
- `createdAt`
- `createdByUid`
- `createdByName`
- `updatedAt`
- `updatedByUid`
- `updatedByName`
- `finalizedAt`
- `finalizedByUid`
- `finalizedByName`

Un brouillon est modifiable et sauvegarde automatiquement. Une rencontre finalisee demeure en lecture seule afin de proteger l'historique. Aucun champ de prochaine date n'est requis puisque les rendez-vous sont planifies dans le logiciel de reservation CFSB.

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
- `sourceType`: `manual`, `pilotage` ou `pilotage_issue` pour les actions persistees
- `sourceId`: enjeu de pilotage d'origine, si applicable
- `createdAt`
- `createdByUid`
- `createdByName`
- `updatedAt`
- `updatedByUid`
- `updatedByName`
- `completedAt`
- `completedByUid`
- `completedByName`
- `cancelledAt`
- `cancelledByUid`
- `cancelledByName`

Les actions `completed` et `cancelled` quittent la liste ouverte, mais restent consultables dans l'historique du membre. Une reouverture remet le statut a `open` et efface les dates de fin ou d'annulation.

## Zone Pilotage owner

Les cinq collections suivantes sont reservees aux comptes `owner` et `admin`. Elles ne sont jamais lues par le portail membre ni par le Dashboard Coach.

### `pilotageMetrics/{metricId}`

- `name`
- `category`
- `ownerName`
- `targetDirection`: `gte`, `lte`, `range` ou `exact`
- `targetValue`: peut etre `null` tant que la cible n'est pas approuvee
- `targetMax`: requis seulement pour `range`
- `targetStatus`: `validated` ou `to_validate`
- `unit`
- `definition`
- `sourceLabel`, `sourceUrl` et `sourceReference`: provenance lisible et lien vers la plage source
- `sourceConfidence`: `high`, `medium` ou `low`
- `sortOrder`
- `active`
- metadonnees de creation et de mise a jour

### `pilotageMetricEntries/{metricId_weekStart}`

- `metricId`
- `metricName`: libelle historique au moment de la saisie
- `weekStart`: lundi au format `YYYY-MM-DD`
- `value`
- `note`
- `sourceLabel` et `sourceReference`: provenance facultative d'un import initial
- metadonnees de mise a jour

L'identifiant deterministe rend la sauvegarde hebdomadaire idempotente: une nouvelle saisie corrige la meme semaine au lieu de creer un doublon.

### `pilotageRocks/{rockId}`

- `title`
- `quarter`: format `YYYY-QN`
- `ownerName`
- `status`: `on_track`, `off_track` ou `done`
- `progress`: nombre de 0 a 100
- `dueDate`: facultatif
- `successCriteria`
- `notes`
- `archivedAt`: reserve pour une phase ulterieure
- metadonnees de creation et de mise a jour

### `pilotageIssues/{issueId}`

- `title`
- `details`
- `priority`: `P1`, `P2` ou `P3`
- `ownerName`
- `status`: `open` ou `solved`
- `resolution`
- `sourceType`: `manual`, `metric` ou `rock`
- `sourceId`, `sourceWeek`, `sourceLabel` et `sourceUrl`: contexte facultatif de la source
- `linkedTaskId`: action `managementTasks` creee depuis l'enjeu
- `solvedAt`, `solvedByUid`, `solvedByName`
- metadonnees de creation et de mise a jour

### `pilotageMeetings/{weekStart}`

- `weekStart`: lundi de la semaine et identifiant du document
- `quarter`
- `attendees`: Michael et Gabriel dans la phase 1
- `status`: `draft` ou `finalized`
- `wins`
- `headlines`
- `scorecardNotes`
- `rocksNotes`
- `issuesNotes`
- `conclusion`
- `nextWeekFocus`
- `rating`: nombre de 1 a 10, facultatif
- `snapshot`: compteurs de pilotage au moment de la sauvegarde
- metadonnees de creation, mise a jour, finalisation et reouverture

La rencontre utilise les donnees en direct de la scorecard, des priorites et des enjeux. Le document conserve les constats et decisions, sans recopier le contenu complet de ces listes.

## `revenueScenarios/{scenarioId}`

- `authorUid`
- `authorName`
- `teamMemberId`
- `teamMemberName`
- `scenarioName`
- `visibility`: `owner` pour une projection interne, `member` pour un scenario personnel, ou `shared` pour une future publication explicite
- `modelVersion`: version des taux et formules utilisees
- `inputs`: niveau, objectif, semaines, efficacite administrative, modele semi-prive et mix de services
- `results`: revenus, heures, taux horaire reel, ecart annuel et point de discussion calcules au moment de la sauvegarde
- `createdAt`
- `updatedAt`
- `updatedByUid`
- `updatedByName`

Les owners voient tous les scenarios. Un membre voit et modifie seulement les scenarios `member` qu'il a lui-meme crees pour son propre `teamMemberId`. Les projections owners existantes restent privees. L'ancien laboratoire statique demeure intact.

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
