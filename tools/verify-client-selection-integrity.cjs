const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "firebase-dashboard", "public", "app.js");
const source = fs.readFileSync(appPath, "utf8");

function extractFunction(name) {
  const functionStart = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : functionStart;
  if (start < 0) throw new Error(`Fonction introuvable: ${name}`);
  const signatureOpen = source.indexOf("(", start);
  let signatureDepth = 0;
  let signatureClose = -1;
  for (let index = signatureOpen; index < source.length; index += 1) {
    if (source[index] === "(") signatureDepth += 1;
    if (source[index] === ")") signatureDepth -= 1;
    if (signatureDepth === 0) {
      signatureClose = index;
      break;
    }
  }
  const open = source.indexOf("{", signatureClose);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Fonction incomplete: ${name}`);
}

function functionIncludes(name, fragment) {
  return extractFunction(name).includes(fragment);
}

const helperNames = [
  "slugify",
  "normalizeComparable",
  "normalizePhone",
  "uniqueClean",
  "coachRecordById",
  "mergedCoachOptions",
  "coachNameValues",
  "canonicalCoachId",
  "coachIdFromFirestoreIdSignal",
  "coachIdFromFirestoreNameSignal",
  "resolveFirestoreItemCoachId",
  "firestoreItemBelongsToCoach",
  "clientStatus",
  "isActiveClient",
  "clientEntityType",
  "clientOwnershipStatus",
  "clientIsSelectableForCoach",
  "clientPhone",
  "clientRecordRank",
  "dedupeClients",
  "selectableClientsForCoach",
  "selectableClientForCoach",
  "requireSelectableClientForCoach",
  "activeClients",
  "isInfoAdmin",
  "uniqueById",
  "operationalRecordClientLinkStatus",
  "operationalRecordHasSafeClientLink",
  "portfolioOperationalRecords",
  "cleanDisplayKey",
  "keyOf",
  "isNonActionableLegacyTask",
  "isOpenTaskLifecycle",
  "isOpenTask"
];

const helpers = helperNames.map(extractFunction).join("\n\n");
const PILOT_COACHES = [
  {
    id: "15935",
    coachRxId: "15935",
    name: "Marc-Andre Menard",
    aliases: ["Marc-André Ménard", "Marc Andre Menard"]
  },
  {
    id: "15928",
    coachRxId: "15928",
    name: "Iheb Yahyaoui",
    aliases: ["Iheb Yahiaoui", "Iheb"]
  }
];

const marcMember = {
  id: "marc-member",
  coachId: "15935",
  coachRxId: "15935",
  coachName: "Marc-Andre Menard",
  name: "Membre Marc",
  phoneNormalized: "5145551000",
  status: "active",
  entityType: "member",
  ownershipStatus: "confirmed",
  clientSelectable: true
};
const ihebSamePhoneHigherRank = {
  id: "iheb-member",
  coachId: "15928",
  coachRxId: "15928",
  coachName: "Iheb Yahyaoui",
  name: "Membre Iheb enrichi",
  phoneNormalized: "5145551000",
  membershipLabel: "Semi-prive 3x",
  sourceClientId: "coachrx-iheb-1",
  status: "active",
  entityType: "member",
  ownershipStatus: "confirmed",
  clientSelectable: true
};
const marcSecondMember = {
  id: "marc-member-2",
  coachId: "15935",
  name: "Deuxieme Membre",
  phoneNormalized: "5145552000",
  status: "manual",
  entityType: "member",
  ownershipStatus: "confirmed",
  clientSelectable: true
};
const marcStaff = {
  id: "marc-staff",
  coachId: "15935",
  name: "Gabriel Mayer Bedard",
  status: "manual",
  entityType: "staff",
  ownershipStatus: "confirmed",
  clientSelectable: false
};
const marcNeedsReview = {
  id: "marc-review",
  coachId: "15935",
  name: "Membre ambigu",
  phoneNormalized: "5145553000",
  status: "active",
  entityType: "member",
  ownershipStatus: "needs_review",
  clientSelectable: false
};
const marcLegacyUnknown = {
  id: "marc-legacy",
  coachId: "15935",
  name: "Ancienne fiche",
  status: "active"
};

const sandbox = {
  console,
  ADMIN_EMAIL: "info@crossfitstbasilelegrand.com",
  PILOT_COACHES,
  state: {
    selectedCoachId: "15935",
    coaches: [...PILOT_COACHES],
    data: {
      rejectedClients: [],
      clients: [
        ihebSamePhoneHigherRank,
        marcMember,
        marcSecondMember,
        marcStaff,
        marcNeedsReview,
        marcLegacyUnknown
      ]
    }
  }
};

vm.runInNewContext(`${helpers}\nglobalThis.__clientIntegrity = {
  resolveFirestoreItemCoachId,
  firestoreItemBelongsToCoach,
  selectableClientsForCoach,
  selectableClientForCoach,
  requireSelectableClientForCoach,
  activeClients,
  isActiveClient,
  operationalRecordClientLinkStatus,
  operationalRecordHasSafeClientLink,
  portfolioOperationalRecords,
  isOpenTaskLifecycle,
  isOpenTask
};`, sandbox, { filename: "client-selection-integrity-helpers.js" });

const h = sandbox.__clientIntegrity;
const marcSelectable = h.selectableClientsForCoach("15935");
const marcSelectableIds = marcSelectable.map((client) => client.id).sort();
let invalidClientRejected = false;
try {
  h.requireSelectableClientForCoach("marc-staff", "15935");
} catch (error) {
  invalidClientRejected = /membre confirme/.test(error.message);
}

const subscribeCollectionSource = extractFunction("subscribeCollection");
const clientsSubscription = source.slice(
  source.indexOf('subscribeCollection("clients"'),
  source.indexOf('subscribeCollection("questionnaireResponses"')
);
const selectorFunctions = [
  "renderQuickNoteModal",
  "renderAssistantMissionStep",
  "renderQuestionnaireSendModal",
  "questionnaireSendClientOptions",
  "renderQuestionnaireLinkClientModal",
  "renderRebookingFormModal",
  "renderRebookingLinkClientModal"
];
const guardedSubmissionFunctions = [
  "createAssistantTaskDraft",
  "createAssistantVoiceTaskDraft",
  "confirmAssistantTaskProposal",
  "createManualTask",
  "saveClient",
  "saveClientTrainingTarget",
  "saveClientPhoneFix",
  "createRebooking",
  "excludePerformanceNewClient",
  "moveClientToAlumni",
  "deleteClient",
  "journalQuestionnaireSend",
  "saveQuestionnaireSchedule",
  "toggleQuestionnaireSchedule",
  "cancelQuestionnaireSend",
  "createQuestionnaireFollowupTask",
  "createMissionFromQuestionnaireResponse",
  "linkQuestionnaireResponseToClient",
  "linkRebookingToClient"
];

const createClientSource = extractFunction("createClient");
const reactivateClientSource = extractFunction("reactivateAlumniAsClient");
const renderAdminSource = extractFunction("renderAdmin");
const questionnaireGroupSource = extractFunction("renderQuestionnaireGroupCard");
const questionnaireCardSource = extractFunction("renderQuestionnaireCard");
const questionnaireDetailSource = extractFunction("renderQuestionnaireDetailModal");
const questionnaireScheduleSource = extractFunction("renderQuestionnaireScheduleCard");
const manualTaskSource = extractFunction("createManualTask");
const taskSubscription = source.slice(
  source.indexOf('subscribeCollection("tasks"'),
  source.indexOf('subscribeCollection("clients"')
);
const blockedTask = { id: "task-blocked", clientId: "marc-review", status: "open", title: "Action bloquee" };
const validTask = { id: "task-valid", clientId: "marc-member", status: "open", title: "Action valide" };
const unlinkedTask = { id: "task-unlinked", status: "open", title: "Action generale" };
const results = {
  idSignalsTakePriorityOverStaleName: h.firestoreItemBelongsToCoach({
    coachId: "15935",
    coachName: "Iheb Yahyaoui"
  }, "15935"),
  conflictingIdSignalsFailClosed: !h.firestoreItemBelongsToCoach({
    coachId: "15935",
    coachRxId: "15928",
    coachName: "Marc-Andre Menard"
  }, "15935"),
  unknownIdDoesNotFallBackToName: !h.firestoreItemBelongsToCoach({
    coachId: "coach-inconnu",
    coachName: "Marc-Andre Menard"
  }, "15935"),
  nameFallbackWorksWithoutIds: h.firestoreItemBelongsToCoach({
    coachName: "Marc-André Ménard"
  }, "15935"),
  ownershipRunsBeforeDedupe: JSON.stringify(marcSelectableIds) === JSON.stringify(["marc-member", "marc-member-2"]),
  higherRankPeerCannotReplaceSelectedCoachClient: marcSelectable.some((client) => client.id === "marc-member")
    && !marcSelectable.some((client) => client.id === "iheb-member"),
  staffAndReviewAndLegacyFailClosed: !marcSelectable.some((client) => ["marc-staff", "marc-review", "marc-legacy"].includes(client.id)),
  clientSelectableMustBeExplicitlyTrue: !h.selectableClientsForCoach("15935", [{
    ...marcMember,
    id: "missing-selectable-flag",
    clientSelectable: undefined
  }]).length,
  allInactiveStatusesFailClosed: [
    "removed",
    "archived",
    "alumni",
    "do_not_contact",
    "import_stale",
    "ownership_quarantine",
    "deleted"
  ].every((status) => !h.isActiveClient({ status })
    && !h.selectableClientsForCoach("15935", [{ ...marcMember, id: `inactive-${status}`, status }]).length),
  activeClientsUsesStrictPortfolio: JSON.stringify(h.activeClients().map((client) => client.id).sort()) === JSON.stringify(["marc-member", "marc-member-2"]),
  requireSelectableRejectsStaff: invalidClientRejected,
  linkedOperationalRecordsFailClosed: !h.operationalRecordHasSafeClientLink(blockedTask)
    && h.operationalRecordHasSafeClientLink(validTask)
    && h.operationalRecordHasSafeClientLink(unlinkedTask),
  unlinkedClassificationIsRoleIndependentAndIdOnly: h.operationalRecordClientLinkStatus({
    id: "unlinked-by-phone",
    phoneNormalized: marcNeedsReview.phoneNormalized
  }) === "unlinked"
    && !extractFunction("operationalRecordClientLinkStatus").includes("isInfoAdmin")
    && !extractFunction("operationalRecordClientLinkStatus").includes("phone"),
  taskLifecycleSurvivesClientLoadOrder: h.isOpenTaskLifecycle(validTask)
    && h.isOpenTask(validTask)
    && taskSubscription.includes(".filter(isOpenTaskLifecycle)")
    && !taskSubscription.includes(".filter(isOpenTask)"),
  blockedTasksAreNotOperational: !h.isOpenTask(blockedTask)
    && h.isOpenTask(validTask)
    && h.isOpenTask(unlinkedTask),
  portfolioRecordsExcludeBlockedLinks: JSON.stringify(h.portfolioOperationalRecords([blockedTask, validTask, unlinkedTask]).map((item) => item.id))
    === JSON.stringify(["task-valid", "task-unlinked"]),
  subscriptionFiltersBeforeMerge: subscribeCollectionSource.indexOf("firestoreItemBelongsToCoach") >= 0
    && subscribeCollectionSource.indexOf("firestoreItemBelongsToCoach") < subscribeCollectionSource.indexOf("merged.set"),
  clientOwnershipPrecedesDedupe: clientsSubscription.indexOf("items.filter") >= 0
    && clientsSubscription.indexOf("items.filter") < clientsSubscription.indexOf("dedupeClients(ownedItems)"),
  rejectedClientsStayInSeparateAdminChannel: clientsSubscription.includes("rejectedSetter: isInfoAdmin()")
    && clientsSubscription.includes("state.data.rejectedClients")
    && subscribeCollectionSource.includes("const rejected = new Map()")
    && subscribeCollectionSource.includes("rejectedSetter([...rejected.values()])")
    && renderAdminSource.includes("state.data.rejectedClients")
    && renderAdminSource.includes("uniqueById(["),
  allSelectorsUseSharedPortfolio: selectorFunctions.every((name) => functionIncludes(name, "selectableClient")),
  allClientBoundSubmissionsFailClosed: guardedSubmissionFunctions.every((name) => functionIncludes(name, "requireSelectableClientForCoach")),
  manualCreationWritesEntityAndOwnership: createClientSource.includes('entityType: "member"')
    && createClientSource.includes('ownershipStatus: "confirmed"')
    && createClientSource.includes('clientSelectable: true')
    && createClientSource.includes('ownershipSource: existing.ownershipSource || "dashboard_manual"'),
  alumniReactivationWritesEntityAndOwnership: reactivateClientSource.includes('entityType: "member"')
    && reactivateClientSource.includes('ownershipStatus: "confirmed"')
    && reactivateClientSource.includes('clientSelectable: true')
    && reactivateClientSource.includes('ownershipSource: "dashboard_alumni_reactivation"'),
  alumniMoveIsAtomicAndNonSelectable: extractFunction("moveClientToAlumni").includes("const batch = writeBatch(db)")
    && extractFunction("moveClientToAlumni").includes('clientSelectable: false')
    && extractFunction("moveClientToAlumni").includes("await batch.commit()"),
  modalBodyLockSynchronized: extractFunction("render").includes('classList.toggle("modal-open", Boolean(state.modal))'),
  adminOwnershipReviewQueueVisible: extractFunction("renderAdmin").includes("ownershipReviewClients")
    && extractFunction("renderAdminCleanupQueue").includes("Identites et appartenance")
    && extractFunction("renderAdminCleanupQueue").includes("Signaux de coach en conflit"),
  questionnaireLegacyLinksRequireSelectableClient: questionnaireGroupSource.includes("Boolean(selectableClientForCoach(group.clientId))")
    && questionnaireCardSource.includes("Boolean(selectableClientForCoach(response.clientId))")
    && questionnaireDetailSource.includes("Boolean(selectableClientForCoach(response.clientId))")
    && questionnaireGroupSource.includes("openQuestionnaireLinkClient")
    && questionnaireCardSource.includes("openQuestionnaireLinkClient"),
  invalidQuestionnaireSchedulesAreReadOnly: questionnaireScheduleSource.includes("const hasClient = Boolean(client)")
    && questionnaireScheduleSource.includes("Appartenance a valider")
    && questionnaireScheduleSource.includes("A valider par un admin")
    && questionnaireScheduleSource.includes("${hasClient ? `"),
  contaminatedRebookingMissionDoesNotReuseLegacyClientId: !manualTaskSource.includes("data.clientId || rebooking?.clientId")
    && manualTaskSource.includes('const selectedClientId = String(data.clientId || "").trim()')
    && manualTaskSource.includes('clientName = client?.name || rebooking?.clientName || ""'),
  operationalDrilldownsUseSafePortfolios: [
    "portfolioRebookings()",
    "portfolioQuestionnaireResponses()",
    "portfolioCheckups()",
    "portfolioImpacts()"
  ].every((fragment) => extractFunction("performanceDetailData").includes(fragment)),
  directOperationalActionsUseSafePortfolios: extractFunction("markRebookingAbsenceRange").includes("portfolioRebookings()")
    && extractFunction("renderQuestionnaireDetailModal").includes("portfolioQuestionnaireResponses()")
    && extractFunction("renderRebookingLinkClientModal").includes("portfolioRebookings()")
    && extractFunction("renderImpactFormModal").includes("portfolioImpacts()"),
  questionnaireOperationsRequireConfirmedClientLink: extractFunction("portfolioQuestionnaireResponses").includes("allowUnlinked: false")
    && extractFunction("portfolioQuestionnaireSends").includes("allowUnlinked: false")
    && extractFunction("portfolioQuestionnaireSchedules").includes("allowUnlinked: false")
    && extractFunction("questionnaireSendHasResponse").includes("responseClientId !== sendClientId"),
  taskActionsRejectHiddenIds: extractFunction("completeTask").includes("if (!task) throw")
    && extractFunction("completeQuestionnaireTask").includes("if (!task) throw")
    && extractFunction("ignoreOperationalTask").includes("operationalTaskById"),
  rebookingActionsRejectHiddenIds: extractFunction("rebookingActionTargetIds").includes("if (!cleanId || !validIds.has(cleanId)) return []")
    && extractFunction("patchRebooking").includes("if (!targetIds.length) throw"),
  questionnaireReadClosesOnlySafeTasks: extractFunction("markQuestionnaireResponseRead").includes("operationalRecordHasSafeClientLink"),
  liveQuestionnaireRoutesPreserved: source.includes('path: "/questionnaire/"')
    && source.includes('path: "/questionnaire/check-in/"')
    && source.includes('path: "/questionnaire/evaluation-habitudes-vie/"')
};

const failures = Object.entries(results)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({
  ok: failures.length === 0,
  selectableClientIds: marcSelectableIds,
  results,
  failures
}, null, 2));

if (failures.length) process.exit(1);
