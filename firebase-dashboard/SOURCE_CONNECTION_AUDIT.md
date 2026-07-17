# Audit des connexions sources du Dashboard Coach

Derniere generation: 2026-06-09T20:19:48.851Z

Ce fichier ne contient pas de code source ni de secret. Le backup complet est conserve localement dans Bob Operator:

- C:\Users\micha\Documents\Codex\Bob Operator\bob-operator\generated\dashboard-source-appscript-backup-2026-06-09T20-19-48-847Z.json

## Resume executif

| Source | Lecture | Types detectes | Firestore queue | Portee datastore | Action suivante |
| --- | --- | --- | --- | --- | --- |
| Ancien dashboard coach / sync historique | ok | coachrx_clients, client_directory, ghl_contacts, questionnaire_responses, checkups, rebooking, performance_impacts | non | non | needs_firestore_scope_and_queue_adapter |
| CSM et metriques - script principal | ok | client_directory, checkups | non | non | needs_firestore_scope_and_queue_adapter |
| CSM et metriques - menu lie au Sheet | ok | client_directory, ghl_contacts, checkups, rebooking | non | non | needs_firestore_scope_and_queue_adapter |
| Questionnaire client-coach V2 | ok | coachrx_clients, client_directory, ghl_contacts, questionnaire_responses | oui | oui | already_has_firestore_queue |
| App rebooking semi-prives | ok | client_directory, checkups, rebooking | non | non | needs_firestore_scope_and_queue_adapter |
| Kilo metrics | ok | coachrx_clients, client_directory, ghl_contacts, checkups, performance_impacts | non | non | needs_firestore_scope_and_queue_adapter |

## Details par source

### Ancien dashboard coach / sync historique

- Script ID: `1SeGMN1w7iqn_7ETcmg5qwY6wIys4GZy5GbJHWasg6bToThcxrucYfOLk`
- Lecture: ok
- Fichiers: 4
- Fonctions detectees: 290
- Types probables: coachrx_clients, client_directory, ghl_contacts, questionnaire_responses, checkups, rebooking, performance_impacts
- Pret pour queue Firestore: needs_firestore_scope_and_queue_adapter
- Scope Firestore/datastore: absent
- Signaux manquants attendus: aucun
- Signaux techniques:
  - coachRx: oui
  - ghl: oui
  - firestore: non
  - sheet: oui
  - webApp: oui
  - triggers: oui
  - questionnaire: oui
  - rebooking: oui
  - checkups: oui
  - phone: oui
  - membership: oui
  - dashboardQueue: non
- Fonctions principales detectees:
  - `activateSheet_`
  - `addGhlTagToContact_`
  - `addSummaryLine_`
  - `alumniRowHtml`
  - `appendProgramFormResponseRow_`
  - `appendRowsWithHeader_`
  - `applyAutoCheckboxes_`
  - `applyAutoValidation_`
  - `applyStoredGeneratedTaskStatuses_`
  - `applyTodoFreshnessFormatting_`
  - `assertRequiredColumns_`
  - `browserRowsForCoach_`
  - `buildAutoClients_`
  - `buildAutoDashboardRows_`
  - `buildAutoFormRows_`
  - `buildAutoTodoRows_`
  - `buildAutoValidationRows_`
  - `buildCoachAppContactLookup_`
  - `buildCoachAppData_`
  - `buildCoachAppV3Data_`
  - `buildCoachRxBrowserAllRows_`
  - `buildCoachRxBrowserRows_`
  - `buildCoreClientContextRows_`
  - `buildCoreClientsRows_`
  - `buildGhlPhoneSearchVariants_`
  - `buildProgramFormSummary_`
  - `buildPseudoCoachRxCsvFromBrowser_`
  - `buildQuestionnaireGhlNoteBody_`
  - `buildQuestionnaireInbox_`
  - `buildQuestionnaireSendLog_`

### CSM et metriques - script principal

- Script ID: `1pQ9ecmaVvulUauVMqNKNqQMDX0CDhOaQuolCIm4U_7n87hrMuuklxyLB`
- Lecture: ok
- Fichiers: 2
- Fonctions detectees: 41
- Types probables: client_directory, checkups
- Pret pour queue Firestore: needs_firestore_scope_and_queue_adapter
- Scope Firestore/datastore: absent
- Signaux manquants attendus: client, checkup, membership, phone
- Signaux techniques:
  - coachRx: non
  - ghl: non
  - firestore: non
  - sheet: oui
  - webApp: non
  - triggers: oui
  - questionnaire: non
  - rebooking: non
  - checkups: oui
  - phone: oui
  - membership: oui
  - dashboardQueue: non
- Fonctions principales detectees:
  - `appendLog_`
  - `backupSheet_`
  - `clean_`
  - `clearManualFields_`
  - `copyFormulaBandsDown_`
  - `copyHeaderAndFormulaBands_`
  - `copyTemplateRow_`
  - `createBackupsForActions_`
  - `destinationForMember_`
  - `ensureColumnCount_`
  - `ensureRowCount_`
  - `extractAlumniRecords_`
  - `firstEmptyNameRow_`
  - `fitRow_`
  - `getOrCreateLogSheet_`
  - `getRequiredSheet_`
  - `getSheetConfigs_`
  - `hasCanonicalHeader_`
  - `installWeeklyCsmCleanupTrigger`
  - `logResult_`
  - `mapRow_`
  - `moveFormulaAware_`
  - `normalizeCsmTabs_`
  - `normalizeOneTab_`
  - `onOpen`
  - `previewCsmFormulaTemplateUpgrade`
  - `previewCsmTabNormalization`
  - `previewWeeklyCsmCleanup`
  - `readRowInfo_`
  - `runCsmFormulaTemplateUpgrade`

### CSM et metriques - menu lie au Sheet

- Script ID: `1upjaGrsWIxwsVz_Ht--CjNNeo3zC4uSlAfdRgMCdevwog1FV7Q-_MbIL`
- Lecture: ok
- Fichiers: 2
- Fonctions detectees: 101
- Types probables: client_directory, ghl_contacts, checkups, rebooking
- Pret pour queue Firestore: needs_firestore_scope_and_queue_adapter
- Scope Firestore/datastore: absent
- Signaux manquants attendus: client, membership
- Signaux techniques:
  - coachRx: non
  - ghl: oui
  - firestore: non
  - sheet: oui
  - webApp: oui
  - triggers: oui
  - questionnaire: non
  - rebooking: oui
  - checkups: oui
  - phone: oui
  - membership: oui
  - dashboardQueue: non
- Fonctions principales detectees:
  - `addGhlContactToWorkflow_`
  - `appendLog_`
  - `backupSheet_`
  - `classifyDuplicateGroup_`
  - `cleanPhone_`
  - `clean_`
  - `cleanupTeamMembersFromCourseGroup_`
  - `cleanupTeamMembersFromFollowupTabs_`
  - `cleanupTeamMembersFromNewMembers_`
  - `clearManualFields_`
  - `completenessScore_`
  - `copyFormulaBandsDown_`
  - `copyHeaderAndFormulaBands_`
  - `copyTemplateRow_`
  - `courseGroupLastCheckupFormula_`
  - `courseGroupLatestCheckupCoachFormula_`
  - `courseGroupLatestCheckupNoteFormula_`
  - `createBackupsForActions_`
  - `createBackupsForTabs_`
  - `csmDuplicatesCleanup_`
  - `destinationForMember_`
  - `diagnoseGhlTokenSetup`
  - `ensureColumnCount_`
  - `ensureGhlCallColumnsOnly_`
  - `ensurePriorityCheckupGhlColumns_`
  - `ensureRowCount_`
  - `extractAlumniRecords_`
  - `findGhlContactByPhone_`
  - `findHeaderColumn_`
  - `findRowsByTeamMemberName_`

### Questionnaire client-coach V2

- Script ID: `1RzTyLvUdw6NdVI2vsDoi7a2bjWGAZDXml94QYG4TCs9wF5KJdKm3HFBa`
- Lecture: ok
- Fichiers: 2
- Fonctions detectees: 41
- Types probables: coachrx_clients, client_directory, ghl_contacts, questionnaire_responses
- Pret pour queue Firestore: already_has_firestore_queue
- Scope Firestore/datastore: present
- Signaux manquants attendus: aucun
- Signaux techniques:
  - coachRx: oui
  - ghl: oui
  - firestore: oui
  - sheet: oui
  - webApp: oui
  - triggers: non
  - questionnaire: oui
  - rebooking: non
  - checkups: non
  - phone: oui
  - membership: non
  - dashboardQueue: oui
- Fonctions principales detectees:
  - `appendObject_`
  - `appendResponse_`
  - `arrayOrText_`
  - `backfillDashboardQuestionnaireResponses`
  - `createTestSubmissionToken`
  - `doGet`
  - `doPost`
  - `ensureHeaders_`
  - `ensureSheet_`
  - `fallbackTokenRecord_`
  - `findToken_`
  - `getRoadmapSheet_`
  - `getSpreadsheet_`
  - `json_`
  - `logRoadmap_`
  - `log_`
  - `makeQuestionnaireDashboardRequestId_`
  - `markTokenUsed_`
  - `mirrorResponseToDashboardSafely_`
  - `mirrorResponseToDashboard_`
  - `normalizePhone_`
  - `normalizeQuestionnaireCoachKey_`
  - `normalizeResponseForDashboard_`
  - `normalizeRoadmapAnswer_`
  - `normalizeSubmission_`
  - `parsePayload_`
  - `questionnaireFirestoreEncodeMap_`
  - `questionnaireFirestoreEncodeValue_`
  - `questionnaireFirestorePatchDocument_`
  - `queueQuestionnaireResponseToDashboardSafely_`

### App rebooking semi-prives

- Script ID: `1OsXzGrmJacMYHMIEcTM3dTK-UvaA01bDf0F90HkFNt29XYgK2iHkyBlE`
- Lecture: ok
- Fichiers: 2
- Fonctions detectees: 119
- Types probables: client_directory, checkups, rebooking
- Pret pour queue Firestore: needs_firestore_scope_and_queue_adapter
- Scope Firestore/datastore: absent
- Signaux manquants attendus: aucun
- Signaux techniques:
  - coachRx: non
  - ghl: non
  - firestore: non
  - sheet: oui
  - webApp: oui
  - triggers: oui
  - questionnaire: non
  - rebooking: oui
  - checkups: oui
  - phone: oui
  - membership: non
  - dashboardQueue: non
- Fonctions principales detectees:
  - `absenceReasonLabel_`
  - `activateSemiPrivateLiveMode`
  - `ageMs_`
  - `appendRows_`
  - `applyAbsenceToOpenCancellations_`
  - `applyFilters`
  - `archiveProcessedThread_`
  - `batchKey_`
  - `buildRebookDigestMessage_`
  - `canonicalCoachName_`
  - `clean_`
  - `clearDataRows_`
  - `coachActionWebAppUrl_`
  - `coachCancellationActionToken_`
  - `coachClientActionToken_`
  - `coachDashboardScript_`
  - `coachDashboardToken_`
  - `coachDashboardUrl_`
  - `coachMatches_`
  - `constantTimeEquals_`
  - `digestPriorityLabel_`
  - `digestPriorityRank_`
  - `doGet`
  - `dryRunFromLegacyProcessedCancellations`
  - `dryRunRecentKiloBookings`
  - `ensureHeaders_`
  - `ensureSheet_`
  - `escapeAttr_`
  - `escapeHtml_`
  - `eventRowFromParse_`

### Kilo metrics

- Script ID: `1GlRrhkGoMkgRfsybh0WUILva6ARfHKMfmmHSehEvmwH5rg3jtgn26lAO`
- Lecture: ok
- Fichiers: 2
- Fonctions detectees: 113
- Types probables: coachrx_clients, client_directory, ghl_contacts, checkups, performance_impacts
- Pret pour queue Firestore: needs_firestore_scope_and_queue_adapter
- Scope Firestore/datastore: absent
- Signaux manquants attendus: staff, membership
- Signaux techniques:
  - coachRx: oui
  - ghl: oui
  - firestore: non
  - sheet: oui
  - webApp: oui
  - triggers: non
  - questionnaire: non
  - rebooking: non
  - checkups: oui
  - phone: oui
  - membership: oui
  - dashboardQueue: non
- Fonctions principales detectees:
  - `addDays_`
  - `appendAttendanceMetric_`
  - `appendCatalogEndpointRows_`
  - `appendKiloClassUsageHistory_`
  - `appendKiloSchedulingHistory_`
  - `appendNormalizedMetric_`
  - `appendReportsHistory_`
  - `appendRevenuePeriodRows_`
  - `applyFilter_`
  - `appointmentCategory_`
  - `boolOrBlank_`
  - `buildAppointmentTypeMap_`
  - `buildKiloApiCatalogRows_`
  - `buildKiloClassUsageRows_`
  - `buildKiloClassUsageSummaryRows_`
  - `buildKiloScanConfig_`
  - `buildKiloScanDates_`
  - `buildKiloSchedulingSummaryRows_`
  - `buildMappingRow_`
  - `buildNormalizedKiloMetrics_`
  - `buildRawRows_`
  - `buildRevenueCategoryRows_`
  - `buildVisibleClassUsageRows_`
  - `buildVisibleSchedulingRows_`
  - `catalogList_`
  - `categoryCode_`
  - `checkKiloSyncSecretConfigured`
  - `classUsageMetricKey_`
  - `classUsagePeriodFromKey_`
  - `classUsageSummaryValue_`

## Interpretation

- `already_has_firestore_queue`: le script contient deja le pont direct vers `syncRequests`.
- `ready_for_queue_adapter`: le script possede deja la portee Firestore et peut recevoir l'adaptateur sans changer la source de donnees.
- `needs_firestore_scope_and_queue_adapter`: il faut ajouter la portee `https://www.googleapis.com/auth/datastore` et l'adaptateur queue avant d'activer un push Firestore.
- `manual_review_required`: il faut lire le code source local prive avant de choisir le point d'integration.

