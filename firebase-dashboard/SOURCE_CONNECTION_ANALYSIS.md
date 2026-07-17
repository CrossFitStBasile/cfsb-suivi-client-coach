# Analyse des points d'integration Apps Script -> Firestore

Derniere generation: 2026-06-10T23:35:57.590Z

Cette analyse ne contient pas de code source. Elle sert a choisir le prochain branchement sans modifier les scripts live.

## Priorites recommandees

1. Questionnaire V2: brancher chaque nouvelle reponse directement vers Firestore, car c'est un flux simple et hautement visible.
2. CSM / GHL / repertoire client: enrichir les telephones et check-ups pour corriger les clients sans telephone.
3. CoachRx: isoler les clients/contexte avant de recreer les To-do, parce que l'ancien calcul semble produire du bruit.
4. Rebooking: garder l'app historique comme source de comparaison, puis mirrorer les actions vers Firestore.

## Sources

| Source | Fonctions | CoachRx | Clients | Taches | Questionnaire | GHL | Rebooking | Checkups | Firestore | Recommandation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Ancien dashboard coach / sync historique | 290 | 234 | 125 | 7 | 20 | 9 | 0 | 26 | 0 | Utiliser comme source de transition CoachRx/clients/tasks, mais isoler la logique de lecture avant de pousser Firestore pour eviter de copier les anciennes taches bruitees. |
| CSM et metriques - script principal | 41 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Review manuelle avant activation. |
| CSM et metriques - menu lie au Sheet | 101 | 0 | 16 | 0 | 0 | 2 | 0 | 129 | 0 | Activer d'abord comme enrichissement telephone/check-ups/GHL si les fonctions de recherche GHL et check-up sont confirmees. |
| Questionnaire client-coach V2 | 41 | 19 | 6 | 0 | 42 | 2 | 0 | 0 | 4 | Ajouter le queue adapter directement apres appendResponse_/mirrorResponseToDashboard_: chaque nouvelle reponse peut alimenter Firestore sans attendre une sync Sheet. |
| App rebooking semi-prives | 119 | 0 | 1 | 0 | 0 | 0 | 9 | 0 | 0 | Garder legacy comme reference; ajouter un miroir Firestore apres les actions gerer/reouvrir/absence, puis comparer les compteurs. |
| Kilo metrics | 113 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | Reporter sauf besoin performance; utile pour metrics/churn plus tard. |

## Fonctions utiles detectees

### Ancien dashboard coach / sync historique
- coachrx: `onOpen`, `showCoachRxUpdateInstructions`, `resetPilotTestActionsForActiveCoach`, `showCoachRxImportDialog`, `doGet`, `buildCoachAppContactLookup_`, `pickClientNameFromContactRow_`, `getCoachAppCoaches_`, `setCoachAppActiveCoach`, `summarizeClientInfoForApp_`, `readCoachAppClientsFromCore_`, `updateCoachAppValidation`, `doPost`, `createCoachRxSyncSecret`, `showCoachRxSyncStatus`, `validateCoachRxSyncSecret_`, `getCoachRxSyncConfig_`, `importCoachRxBrowserSync_`, `importCoachRxAdvancedScan_`, `upsertCoachRxClientContextFromScan_`, `rebuildCoachDashboardFromCurrentSheets_`, `filterCoachRxCsvRowsForCoach_`, `buildPseudoCoachRxCsvFromBrowser_`, `isValidCoachRxClientName_`, `browserRowsForCoach_`, `buildAutoClients_`, `readCoachAppManualClients_`, `mergeManualClientsIntoAuto_`, `pickClientPhoneAuto_`, `pickClientEmailAuto_`
- clients: `buildCoachAppData_`, `buildCoachAppContactLookup_`, `readCoachAppTasksFromCore_`, `mapCoreRowsByKey_`, `readCoachAppClientsFromCore_`, `buildCoachAppV3Data_`, `saveCoachAppManualClient`, `ensureManualClientsSheet_`, `syncClientCoachResponsesSource_`, `normalizeQuestionnaireResponseForDashboard_`, `normalizePhoneDashboard_`, `rebuildCoachDashboardFromCurrentSheets_`, `readCoachAppManualClients_`, `mergeManualClientsIntoAuto_`, `writeCoreDataSheets_`, `buildCoreClientsRows_`, `buildCoreClientContextRows_`, `buildV3DerivedRows_`, `ensureV3PilotSheets_`, `ensureCoachCoreDataForActiveCoach_`, `importProgramFormResponse_`, `findProgramFormResponseRow_`, `findGhlContact_`, `buildGhlPhoneSearchVariants_`, `cleanPhone_`, `setStatus`, `renderGoals`, `clientCard`, `taskCard`, `renderCoreInfo`
- tasks: `rebuildCoachDashboardFromCurrentSheets_`, `buildAutoTodoRows_`, `writeCoreDataSheets_`, `applyStoredGeneratedTaskStatuses_`, `buildTasksCurrentRows_`
- questionnaire: `buildCoachAppData_`, `handleCoachAppPublicApi_`, `syncClientCoachResponsesSource_`, `syncQuestionnaireSheetNotesToGhl_`, `buildQuestionnaireGhlNoteBody_`, `clientCoachResponsesForCoach_`, `buildQuestionnaireInbox_`, `normalizeQuestionnaireResponseForDashboard_`, `updateClientCoachQuestionnaireStatus`, `updateQuestionnaireStatusInSheet_`
- ghl: `installDashboardFormEditTrigger`, `syncQuestionnaireSheetNotesToGhl_`, `buildQuestionnaireInbox_`, `dashboardCoachRolloutConfigByName_`, `processProgramFormRow_`, `addGhlTagToContact_`, `createGhlContactNote_`, `showPrototypeStatus`
- checkups: `buildCoachAppData_`, `readCsmCheckupsForCoach_`, `coachNameMatchesCheckup_`, `summarizeClientInfoForApp_`, `readCoachAppClientsFromCore_`, `buildAutoClients_`, `readCoachAppManualClients_`, `buildAutoDashboardRows_`, `buildCoreClientsRows_`

### CSM et metriques - script principal

### CSM et metriques - menu lie au Sheet
- clients: `classifyDuplicateGroup_`, `completenessScore_`, `processPriorityCheckupManualAction_`, `findGhlContactByPhone_`, `cleanPhone_`
- ghl: `processPriorityCheckupManualAction_`, `findGhlContactByPhone_`
- checkups: `runMiseAJour2`, `repairNewMembersDynamicFormulas`, `repairNewMembersDynamicFormulas_`, `newMemberLastCheckupFormula_`, `newMemberLatestNoteFormula_`, `cleanupTeamMembersFromFollowupTabs_`, `repairCourseGroupCheckupDynamicFormulas`, `previewCourseGroupCheckupDynamicFormulas`, `repairCourseGroupCheckupDynamicFormulas_`, `courseGroupLastCheckupFormula_`, `courseGroupLatestCheckupNoteFormula_`, `courseGroupLatestCheckupCoachFormula_`, `repairPriorityCheckupDynamicFormula`, `previewPriorityCheckupDynamicFormula`, `repairPriorityCheckupDynamicFormula_`, `setupPriorityCheckupGhlActions`, `installPriorityCheckupEditTrigger`, `priorityCheckupOnEdit`, `handlePriorityCheckupEdit_`, `processPriorityCheckupManualAction_`, `ensurePriorityCheckupGhlColumns_`, `ensureGhlCallColumnsOnly_`, `getPriorityCheckupColumnMap_`

### Questionnaire client-coach V2
- coachrx: `json_`, `queueQuestionnaireResponseToDashboard_`, `resolveQuestionnaireDashboardCoach_`
- clients: `normalizeSubmission_`
- questionnaire: `doPost`, `saveRoadmapSubmission_`, `createTestSubmissionToken`, `validatePayload_`, `normalizeSubmission_`, `appendResponse_`, `mirrorResponseToDashboardSafely_`, `mirrorResponseToDashboard_`, `backfillDashboardQuestionnaireResponses`, `markTokenUsed_`, `log_`, `queueQuestionnaireResponseToDashboardSafely_`, `queueQuestionnaireResponseToDashboard_`
- ghl: `queueQuestionnaireResponseToDashboard_`, `resolveQuestionnaireDashboardCoach_`
- firestoreQueue: `json_`, `queueQuestionnaireResponseToDashboard_`, `questionnaireFirestorePatchDocument_`, `makeQuestionnaireDashboardRequestId_`

### App rebooking semi-prives
- clients: `processStaleCancellationReminders_`
- rebooking: `doGet`, `handleCoachCloseAction_`, `handleCoachCloseClientAction_`, `handleCoachReopenAction_`, `handleCoachConfirmAbsenceAction_`, `processPendingNotifications_`, `processCancellationForRebookQueue_`, `applyAbsenceToOpenCancellations_`, `markCancellationManaged_`

### Kilo metrics
- clients: `buildKiloScanConfig_`

