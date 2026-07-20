const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const exactLiveRosterMode = /const clientSyncEnabled = !questionnaireOnly && coachRosterVerified/.test(source)
  && /function buildClientRecords\(\{\s*coach,\s*browserRows,/.test(source);
const RealDate = Date;
const fixedNow = new RealDate("2026-06-11T12:00:00-04:00").getTime();

class FixedDate extends RealDate {
  constructor(...args) {
    if (!args.length) {
      super(fixedNow);
    } else {
      super(...args);
    }
  }

  static now() {
    return fixedNow;
  }
}

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const firestoreWrites = [];
const dbMock = {
  collection(name) {
    return {
      doc(id) {
        return {
          set(data, options) {
            firestoreWrites.push({ collection: name, id, data, options });
          },
          collection(subcollection) {
            return {
              doc(subId) {
                return {
                  set(data, options) {
                    firestoreWrites.push({
                      collection: `${name}/${id}/${subcollection}`,
                      id: subId,
                      data,
                      options
                    });
                  }
                };
              }
            };
          }
        };
      }
    };
  }
};

const adminMock = {
  initializeApp() {},
  firestore() {
    return dbMock;
  }
};
adminMock.firestore.FieldValue = {
  serverTimestamp: () => "SERVER_TIMESTAMP",
  delete: () => "DELETE_FIELD"
};

const sandbox = {
  console,
  Date: FixedDate,
  exports: {},
  require(name) {
    if (name === "firebase-functions/v2/https") {
      return { onCall: (_options, handler) => handler, onRequest: (_options, handler) => handler, HttpsError };
    }
    if (name === "firebase-functions/v2/scheduler") {
      return { onSchedule: (_options, handler) => handler };
    }
    if (name === "firebase-functions/v2/firestore") {
      return { onDocumentCreated: (_options, handler) => handler };
    }
    if (name === "firebase-functions/params") {
      return { defineSecret: () => ({ value: () => "" }) };
    }
    if (name === "firebase-admin") {
      return adminMock;
    }
    if (name === "./product-report") {
      return require(path.join(root, "functions", "product-report.js"));
    }
    if (name === "./assistant-context") {
      return require(path.join(root, "functions", "assistant-context.js"));
    }
    if (name === "./assistant-ai") {
      return {
        generateReadOnlyAssistantProposal: async () => ({
          output: { intent: "answer", title: "Test", displaySummary: "Test", clarifyingQuestion: "", evidenceRefs: [], suggestedPrompts: [] },
          model: "test-model",
          modelVersion: "test",
          promptVersion: "test",
          latencyMs: 1,
          usage: { promptTokens: 1, outputTokens: 1, totalTokens: 2 }
        })
      };
    }
    if (name.startsWith("./")) {
      return require(path.join(root, "functions", name.slice(2)));
    }
    return require(name);
  },
  URL,
  fetch: async () => ({ ok: true, json: async () => ({ access_token: "test" }) })
};

vm.runInNewContext(`${source}
globalThis.__helpers = {
  rowsFromValues,
  buildClientRecords,
  buildClientEnrichmentRecords,
  buildGhlContactEnrichmentRecords,
  buildTaskRecords,
  buildRebookingRecords,
  rebookingImportDiagnostics,
  buildCheckupRecords,
  buildImpactRecords,
  buildAlumniRecords,
  buildQuestionnaireResponseRecords,
  questionnaireRowBelongsToCoach,
  rowBelongsToCoach,
  mergeSheetRows,
  countRowsWithClientPhone,
  sourceRowsOverview,
  SHEET_TABS,
  CSM_CHECKUP_TAB_CANDIDATES,
  collectStaleImportedDocs,
  collectStaleImportedMapDocs,
  directClientStaleCandidateSources,
  programTaskSignal,
  normalizeRebookingStatus,
  normalizeAlumniStatus,
  normalizeImpactStatus,
  writeCoachSyncStatus,
  exactGhlContactByPhone,
  ghlContactPhones
};`, sandbox, { filename: "functions/index.js" });

const h = sandbox.__helpers;
const coaches = [
  { id: "15935", coachRxId: "15935", name: "Marc-Andre Menard", aliases: ["Marc-Andre Menard", "Marc-André Ménard"] },
  { id: "15928", coachRxId: "15928", name: "Iheb Yahyaoui", aliases: ["Iheb Yahyaoui", "Iheb"] },
  { id: "17242", coachRxId: "17242", name: "Camille Proulx", aliases: ["Camille Proulx"] },
  { id: "15902", coachRxId: "15902", name: "David Olivier", aliases: ["David Olivier"] },
  { id: "15893", coachRxId: "15893", name: "Gabriel Mayer Bedard", aliases: ["Gabriel Mayer Bedard", "Gabriel"] },
  { id: "15937", coachRxId: "15937", name: "Hugo Lelievre", aliases: ["Hugo Lelievre", "Hugo Lelièvre"] },
  { id: "15936", coachRxId: "15936", name: "Raphael Samson", aliases: ["Raphael Samson", "Raphaël Samson"] }
];

const coreRows = h.rowsFromValues([
  ["Client Key", "Client", "Coach", "Dashboard status", "Active package", "Phone", "Email", "Coach URL"],
  ["marc test", "Marc Client", "Marc-André Ménard", "Member", "Semi-Prive", "514-555-1001", "", ""],
  ["karine aubriot", "Karine Aubriot", "Iheb Yahyaoui", "Member", "CrossFit - Illimite", "", ""],
  ["camille test", "Camille Client", "Camille Proulx", "Member", "CrossFit", "(514) 555-1003", "", ""],
  ["david test", "David Client", "David Olivier", "Member", "CrossFit", "", "", "https://dashboard.coachrx.app/team/15902/clients"],
  ["jacques luce", "Jacques Luce", "Gabriel", "Member", "Semi-Prive", "12633809124", "", ""]
]);

const manualCoreRows = h.rowsFromValues([
  ["Client Key", "Client", "Coach", "Phone", "Email", "Membership end date", "Source"],
  ["karine aubriot", "Karine Aubriot", "Iheb Yahyaoui", "514 555 2222", "karine@example.com", "2026-12-01", "Ajout manuel dashboard"]
]);
const mergedCoreRows = h.mergeSheetRows(coreRows, manualCoreRows);

const browserRows = h.rowsFromValues([
  ["Client", "CoachRx URL", "Membership", "Contact Phone Number", "Exercise Due"],
  ["Hugo Client", "https://dashboard.coachrx.app/team/15937/clients", "Semi-Prive", "1 514 555 1006", "Jun 10"],
  ["Raphael Client", "team/15936/clients", "Semi-Prive", "514.555.1007", "Jun 11"],
  ["Marc Client", "team/15935/clients", "Semi-Prive 2x", "5145551001", "Jun 12"]
]);

const rebookingRows = h.rowsFromValues([
  ["Event ID", "Client", "Coach", "Debut RDV", "Service", "Statut", "Recu a", "Source"],
  ["event-1", "Adel Berbaoui", "Iheb Yahyaoui", "May 12, 2026 - 05:30 PM", "Semi-Prive", "OUVERT", "2026-05-11", "Test"],
  ["event-2", "Patrick Leblanc", "Iheb Yahyaoui", "May 19, 2026 - 06:30 PM", "Semi-Prive", "REBOOKE", "2026-05-11", "Test"]
]);

const checkupRows = h.rowsFromValues([
  ["Nom", "Date", "Telephone", "Note", "coach"],
  ["Jacques Luce", "2026-03-04", "12633809124", "fier des poids", "gabriel"]
]);

const iheb = coaches.find((coach) => coach.id === "15928");
const gabriel = coaches.find((coach) => coach.id === "15893");
const ihebCore = mergedCoreRows.filter((row) => h.rowBelongsToCoach(row, iheb));
const gabrielCheckups = checkupRows.filter((row) => h.rowBelongsToCoach(row, gabriel));
const ihebClients = h.buildClientRecords({ coach: iheb, coreRows: ihebCore, browserRows: [] });
const ihebRebookings = h.buildRebookingRecords({
  coach: iheb,
  taskRows: [],
  rebookingRows: rebookingRows.filter((row) => h.rowBelongsToCoach(row, iheb)),
  clients: ihebClients,
  existingById: new Map()
});
const ihebRebookingDiagnostics = h.rebookingImportDiagnostics({
  rebookings: ihebRebookings,
  taskRows: [],
  rebookingRows: rebookingRows.filter((row) => h.rowBelongsToCoach(row, iheb)),
  sourceRebookingRows: rebookingRows
});

const pilotCoverage = {};
coaches.forEach((coach) => {
  const matchedCore = coreRows.filter((row) => h.rowBelongsToCoach(row, coach));
  const matchedBrowser = browserRows.filter((row) => h.rowBelongsToCoach(row, coach));
  const clients = h.buildClientRecords({ coach, coreRows: matchedCore, browserRows: matchedBrowser });
  pilotCoverage[coach.id] = {
    matchedRows: matchedCore.length + matchedBrowser.length,
    clientsImported: clients.length,
    phones: clients.map((client) => client.data.phoneNormalized || client.data.clientPhoneNormalized || "").filter(Boolean)
  };
});

const marc = coaches.find((coach) => coach.id === "15935");
const marcClients = h.buildClientRecords({
  coach: marc,
  coreRows: coreRows.filter((row) => h.rowBelongsToCoach(row, marc)),
  browserRows: browserRows.filter((row) => h.rowBelongsToCoach(row, marc))
});
const questionnaireRows = h.rowsFromValues([
  ["response_id", "submitted_at", "client_name", "client_phone_normalized", "coach_name", "triage_status", "coach_alignment_score", "goal_change_detail", "open_note", "nouvelle_question_v2"],
  ["resp-marc-1", "2026-06-01T12:00:00Z", "Nom saisi different", "5145551001", "", "rouge", "2", "Objectif change pour endurance", "Test matching telephone", "Reponse future visible"],
  ["resp-unmatched-1", "2026-06-01T12:05:00Z", "Client inconnu", "5145559999", "", "orange", "", "", "Devrait rester non matche", ""],
  ["resp-coach-name", "2026-06-01T12:10:00Z", "Marc-André Ménard", "5145556718", "", "rouge", "", "", "Reponse test coach", ""]
]);
const marcQuestionnaireRows = questionnaireRows.filter((row) => h.questionnaireRowBelongsToCoach(row, marc, marcClients));
const marcQuestionnaires = h.buildQuestionnaireResponseRecords({
  coach: marc,
  rows: marcQuestionnaireRows,
  clients: marcClients,
  existingById: new Map()
});
const coachNamedManualClients = [{
  id: "15935_4383995269",
  data: {
    coachId: "15935",
    name: "David Olivier",
    phoneNormalized: "4383995269",
    status: "manual",
    source: "firebase_app_manual"
  }
}];
const coachNamedManualQuestionnaireRows = h.rowsFromValues([
  ["response_id", "submitted_at", "client_name", "client_phone_normalized", "coach_name", "triage_status", "open_note"],
  ["resp-coach-named-manual", "2026-06-11T18:34:17Z", "David Olivier", "4383995269", "", "orange", "Reponse d'un vrai client manuel dont le nom est aussi un coach pilote"]
]);
const coachNamedManualMatchedRows = coachNamedManualQuestionnaireRows
  .filter((row) => h.questionnaireRowBelongsToCoach(row, marc, coachNamedManualClients));
const coachNamedManualQuestionnaires = h.buildQuestionnaireResponseRecords({
  coach: marc,
  rows: coachNamedManualMatchedRows,
  clients: coachNamedManualClients,
  existingById: new Map()
});
const previouslyArchivedCoachNamedManualQuestionnaires = h.buildQuestionnaireResponseRecords({
  coach: marc,
  rows: coachNamedManualMatchedRows,
  clients: coachNamedManualClients,
  existingById: new Map([[coachNamedManualQuestionnaires[0]?.id || "missing", {
    ...(coachNamedManualQuestionnaires[0]?.data || {}),
    processingStatus: "archived",
    sourceInvalidReason: "coach_as_unmatched_client"
  }]])
});
const existingManualClients = new Map([
  ["15935_manual_alex_turcotte", {
    coachId: "15935",
    name: "Alex Turcotte",
    status: "manual",
    source: "firebase_app_manual",
    manualMembershipEndDate: "2026-08-15",
    kiloPlannedRecurrenceEndDate: "2026-07-01",
    riskLevel: "medium",
    notes: "Note manuelle a conserver"
  }]
]);
const manualMergeRows = h.rowsFromValues([
  ["Client", "CoachRx URL", "Membership", "Contact Phone Number", "Exercise Due"],
  ["Alex Turcotte", "https://dashboard.coachrx.app/team/15935/clients", "Semi-Prive", "514-555-2020", "Jun 15"]
]);
const manualMergeClients = h.buildClientRecords({
  coach: marc,
  coreRows: [],
  browserRows: manualMergeRows.filter((row) => h.rowBelongsToCoach(row, marc)),
  existingById: existingManualClients
});
const sourceThenPhoneRows = h.rowsFromValues([
  ["Client Key", "Client", "Coach", "Active package", "Phone"],
  ["source-only-alex", "Client Fusion", "Marc-André Ménard", "Semi-Prive", ""],
  ["", "Client Fusion", "team/15935/clients", "Semi-Prive 2x", "514 555 3030"]
]);
const sourceThenPhoneClients = h.buildClientRecords({
  coach: marc,
  coreRows: sourceThenPhoneRows.filter((row) => h.rowBelongsToCoach(row, marc)).slice(0, 1),
  browserRows: sourceThenPhoneRows.filter((row) => h.rowBelongsToCoach(row, marc)).slice(1)
});
const existingUsefulClientFields = new Map([
  ["15935_keep_useful_fields", {
    coachId: "15935",
    name: "Client Sans Effacement",
    sourceClientId: "client-keep-fields",
    sourceIdentitySystem: "client_directory",
    entityType: "member",
    ownershipStatus: "confirmed",
    clientSelectable: true,
    status: "active",
    phoneNormalized: "5145556060",
    clientPhoneNormalized: "5145556060",
    email: "keep@example.test",
    membershipLabel: "Semi-Prive 2x"
  }]
]);
const blankEnrichmentRows = h.rowsFromValues([
  ["Client Key", "Client", "Coach", "Active package", "Phone", "Email"],
  ["client-keep-fields", "Client Sans Effacement", "Marc-André Ménard", "", "", ""]
]);
const blankEnrichmentClients = h.buildClientRecords({
  coach: marc,
  coreRows: blankEnrichmentRows.filter((row) => h.rowBelongsToCoach(row, marc)),
  browserRows: [],
  existingById: existingUsefulClientFields
});
const existingGhlTargetClients = new Map([
  ["15935_existing_by_name", {
    coachId: "15935",
    name: "Caroline Gaudreault",
    source: "google_sheets_core_clients",
    entityType: "member",
    ownershipStatus: "confirmed",
    clientSelectable: true,
    status: "active",
    manualMembershipEndDate: "2026-09-30",
    targetSessionsPerWeek: 2
  }],
  ["15935_existing_by_phone", {
    coachId: "15935",
    name: "Michael Grondin",
    source: "firebase_app_manual",
    entityType: "member",
    ownershipStatus: "confirmed",
    clientSelectable: true,
    status: "manual",
    phoneNormalized: "8192771825",
    membershipLabel: "Membership conserve",
    notes: "Client manuel a conserver"
  }]
]);
const ghlContactRows = h.rowsFromValues([
  ["Contact ID", "Name", "Phone", "Email"],
  ["ghl-caroline", "Caroline Gaudreault", "(514) 555-9090", "caroline@example.test"],
  ["ghl-michael", "Nom GHL different", "+1 819 277 1825", "michael@example.test"],
  ["ghl-orphan", "Contact Pas Client", "514-555-7777", "orphan@example.test"],
  ["ghl-no-phone", "Sans Phone", "", "sans@example.test"]
]);
const ghlEnrichedClients = h.buildGhlContactEnrichmentRecords({
  coach: marc,
  rows: ghlContactRows,
  existingById: existingGhlTargetClients
});
const csmEnrichmentRows = h.rowsFromValues([
  ["Client", "Phone", "Email", "Active packages", "Dernier Check-up", "Notes importer des formulaires check-ups", "attendance30Days", "attendanceWindowDays", "classAttendance30Days", "appointmentAttendance30Days", "importedEventAttendance30Days", "levelMethodOverall", "levelMethodLevelsLogged"],
  ["Caroline Gaudreault", "(514) 555-9090", "caroline-csm@example.test", "Semi-Prive 1x", "2026-05-15", "Objectif mis a jour", "7", "30", "4", "2", "1", "YELLOW II", "18"],
  ["Michael Grondin", "+1 819 277 1825", "michael-csm@example.test", "Semi-Prive 2x", "2026-04-20", "Note a ignorer car existe", "0", "30", "0", "0", "0", "ORANGE I", "9"],
  ["Client Hors Dashboard", "514-555-7777", "orphan-csm@example.test", "CrossFit", "2026-05-01", "Ne doit pas creer un client", "12", "30", "12", "0", "0", "BLUE I", "4"]
]);
const csmEnrichedClients = h.buildClientEnrichmentRecords({
  coach: marc,
  rows: csmEnrichmentRows,
  existingById: existingGhlTargetClients
});
const invalidCoachRxRows = h.rowsFromValues([
  ["Client", "CoachRx URL", "Membership", "Contact Phone Number", "Exercise Due"],
  ["Not set", "team/15935/clients", "Semi-Prive", "", "Jun 18"],
  ["Tuesday", "team/15935/clients", "Semi-Prive", "", "Jun 19"],
  ["BR", "team/15935/clients", "Semi-Prive", "", "Jun 20"],
  ["KA", "team/15935/clients", "Semi-Prive", "", "Jun 21"],
  ["LTP", "team/15935/clients", "Semi-Prive", "", "Jun 22"],
  ["Today", "team/15935/clients", "Semi-Prive", "", "Jun 23"],
  ["Marc-Andre Menard", "team/15935/clients", "Semi-Prive", "", "Jun 23"],
  ["Vrai Client", "team/15935/clients", "Semi-Prive", "514 555 4040", "Jun 20"]
]);
const invalidCoachRxClients = h.buildClientRecords({
  coach: marc,
  coreRows: [],
  browserRows: invalidCoachRxRows.filter((row) => h.rowBelongsToCoach(row, marc))
});
const staleSnap = {
  forEach(callback) {
    [
      { id: "15935_old_import", data: () => ({ coachId: "15935", source: "google_sheets_coachrx_browser", status: "active" }) },
      { id: "15935_old_snapshot", data: () => ({ coachId: "15935", source: "coachrx_visible_snapshot", status: "open" }) },
      { id: "15935_old_coachrx_task", data: () => ({ coachId: "15935", source: "coachrx_exercise_due", status: "open" }) },
      { id: "15935_current_import", data: () => ({ coachId: "15935", source: "google_sheets_coachrx_browser", status: "active" }) },
      { id: "15935_manual", data: () => ({ coachId: "15935", source: "firebase_app_manual", status: "manual" }) },
      { id: "15935_linked_manual", data: () => ({ coachId: "15935", source: "google_sheets_coachrx_browser", linkedFromManual: true, status: "active" }) }
    ].forEach(callback);
  }
};
const staleImportedDocs = h.collectStaleImportedDocs({
  snap: staleSnap,
  currentIds: new Set(["15935_current_import"]),
  coachId: "15935",
  protectedSources: new Set(["firebase_app_manual", "manual"])
});
const directExistingClients = new Map([
  ["15935_old_direct", { coachId: "15935", source: "direct_coachrx_extension", status: "active" }],
  ["15935_current_direct", { coachId: "15935", source: "direct_coachrx_extension", status: "active" }],
  ["15935_manual_direct", { coachId: "15935", source: "firebase_app_manual", status: "manual" }],
  ["15935_ghl_enriched", { coachId: "15935", source: "direct_ghl_contacts", status: "active" }]
]);
const directCoachRxStaleDocs = h.collectStaleImportedMapDocs({
  existingById: directExistingClients,
  currentIds: new Set(["15935_current_direct"]),
  coachId: "15935",
  protectedSources: new Set(["firebase_app_manual", "manual", "dashboard_manual"]),
  candidateSources: h.directClientStaleCandidateSources("coachrx_clients")
});
const directGhlStaleDocs = h.collectStaleImportedMapDocs({
  existingById: directExistingClients,
  currentIds: new Set([]),
  coachId: "15935",
  protectedSources: new Set(["firebase_app_manual", "manual", "dashboard_manual"]),
  candidateSources: h.directClientStaleCandidateSources("ghl_contacts")
});
const programRows = h.rowsFromValues([
  ["Client", "CoachRx URL", "Membership", "Contact Phone Number", "Exercise Due"],
  ["Marc Client", "team/15935/clients", "Semi-Prive", "5145551001", "Jun 10, 2026"],
  ["Marc Client", "team/15935/clients", "Semi-Prive", "5145551001", "May 27, 2026"],
  ["Marc Client", "team/15935/clients", "Semi-Prive", "5145551001", "Overdue"]
]);
const programClients = h.buildClientRecords({
  coach: marc,
  coreRows: [],
  browserRows: programRows.filter((row) => h.rowBelongsToCoach(row, marc))
});
const coachRxNeedsReviewRows = h.rowsFromValues([
  ["Client", "CoachRx URL", "Membership", "Contact Phone Number", "Exercise Due"],
  ["Client Sans Phone", "team/15935/clients", "", "", "Overdue"]
]);
const coachRxNeedsReviewClients = h.buildClientRecords({
  coach: marc,
  coreRows: [],
  browserRows: coachRxNeedsReviewRows.filter((row) => h.rowBelongsToCoach(row, marc))
});
const programTasks = h.buildTaskRecords({
  coach: marc,
  taskRows: [],
  clients: programClients,
  browserRows: programRows.filter((row) => h.rowBelongsToCoach(row, marc))
});
const coachRxColorSignalRows = h.rowsFromValues([
  ["Client", "CoachRx URL", "Membership", "Contact Phone Number", "Exercise Due", "Exercise Color", "Lifestyle Due"],
  ["Rouge CoachRx", "team/15935/clients", "Semi-Prive", "5145557070", "Fri Jul 3rd", "red", "Not set"],
  ["Jaune Lifestyle CoachRx", "team/15935/clients", "Semi-Prive", "5145558080", "Fri Jul 3rd", "green", "Invite pending"]
]);
const coachRxColorSignalClients = h.buildClientRecords({
  coach: marc,
  coreRows: [],
  browserRows: coachRxColorSignalRows.filter((row) => h.rowBelongsToCoach(row, marc))
});
const coachRxColorSignalTasks = h.buildTaskRecords({
  coach: marc,
  taskRows: [],
  clients: coachRxColorSignalClients,
  browserRows: coachRxColorSignalRows.filter((row) => h.rowBelongsToCoach(row, marc))
});
const importedTaskRows = h.rowsFromValues([
  ["Title", "Client", "Coach", "Priority"],
  ["Decider quoi faire avec ce client CoachRx", "Karine Aubriot", "Iheb Yahyaoui", "P2"],
  ["Rebooker seance semi-privee", "Karine Aubriot", "Iheb Yahyaoui", "P2"]
]);
const importedActionTasks = h.buildTaskRecords({
  coach: iheb,
  taskRows: importedTaskRows.filter((row) => h.rowBelongsToCoach(row, iheb)),
  clients: ihebClients,
  browserRows: []
});
const manualLinkedRebookingRows = h.rowsFromValues([
  ["Event ID", "Client", "Coach", "Phone", "Debut RDV", "Service", "Statut", "Recu a", "Source"],
  ["manual-link-event", "Marc Client", "Marc-André Ménard", "514-555-1001", "Jun 12, 2026 - 05:30 PM", "Semi-Prive", "OUVERT", "2026-06-11", "Test"]
]);
const manualLinkedRebookings = h.buildRebookingRecords({
  coach: marc,
  taskRows: [],
  rebookingRows: manualLinkedRebookingRows.filter((row) => h.rowBelongsToCoach(row, marc)),
  clients: marcClients,
  existingById: new Map([["15935_rebooking_manuallinkevent", {
    coachId: "15935",
    clientId: "15935_manual_alex_turcotte",
    clientName: "Alex Turcotte",
    clientPhoneNormalized: "5145552020",
    matchMethod: "manual_client",
    manuallyLinkedAt: "2026-06-11T18:40:00.000Z",
    manuallyLinkedBy: "coach@example.test",
    manualLinkNote: "Lien corrige par le coach",
    status: "open",
    history: [{ action: "client_linked" }]
  }]])
});
const exactGhlContact = h.exactGhlContactByPhone([
  { id: "wrong", phone: "514-555-0000" },
  { id: "right", phone: "+1 (819) 277-1825" }
], "8192771825");
const noExactGhlContact = h.exactGhlContactByPhone([
  { id: "first-but-wrong", phone: "514-555-0000" },
  { id: "also-wrong", phoneNumber: "450-555-2222" }
], "8192771825");
const nestedGhlPhoneValues = h.ghlContactPhones({
  id: "phone-fields",
  phone: "+1 819 277 1825",
  mobilePhone: "514 555 3333",
  custom_phone_field: ["450-555-4444"]
});

const results = {
  ihebCoreMatched: ihebCore.length,
  ihebClientsImported: ihebClients.length,
  firstIhebClientId: ihebClients[0]?.id,
  firstIhebClientStatus: ihebClients[0]?.data?.status,
  ihebClientsMissingPhone: ihebClients.filter((client) => !client.data.phoneNormalized && !client.data.clientPhoneNormalized).length,
  coreHeaderCount: h.sourceRowsOverview({ coreRows }).headers.coreClients.count,
  coreHeaderHasCoach: h.sourceRowsOverview({ coreRows }).headers.coreClients.normalized.includes("coach"),
  ihebRebookingsImported: ihebRebookings.length,
  rebookingStatuses: ihebRebookings.map((item) => item.data.status),
  rebookingMatchMethods: ihebRebookings.map((item) => item.data.matchMethod),
  rebookingDiagnosticOpen: ihebRebookingDiagnostics.open,
  rebookingDiagnosticSourceRowsMatched: ihebRebookingDiagnostics.sourceRowsMatched,
  rebookingDiagnosticSourceRowsWithoutPhone: ihebRebookingDiagnostics.sourceRowsWithoutPhone,
  rebookingDiagnosticByMatchMethod: ihebRebookingDiagnostics.byMatchMethod,
  rebookingDiagnosticMissingClientId: ihebRebookingDiagnostics.missingClientId,
  gabrielCheckupsMatched: gabrielCheckups.length,
  gabrielCheckupsImported: h.buildCheckupRecords({ coach: gabriel, rows: gabrielCheckups, clients: [] }).length,
  alumniStatus: h.normalizeAlumniStatus("Ne pas contacter"),
  impactStatus: h.normalizeImpactStatus("confirmé"),
  pilotCoverage,
  marcDedupeClientCount: marcClients.length,
  marcPhoneKept: marcClients[0]?.data?.phoneNormalized,
  marcQuestionnaireRowsMatched: marcQuestionnaireRows.length,
  marcQuestionnaireClientId: marcQuestionnaires[0]?.data?.clientId || "",
  marcQuestionnaireCoachAlignment: marcQuestionnaires[0]?.data?.answers?.coach_alignment_score || "",
  marcQuestionnaireGoalChangeDetail: marcQuestionnaires[0]?.data?.answers?.goal_change_detail || "",
  marcQuestionnaireOtherResponse: marcQuestionnaires[0]?.data?.answers?.other_responses?.[0]?.value || "",
  coachNamedQuestionnaireStatus: marcQuestionnaires.find((item) => item.id.includes("respcoachname"))?.data?.processingStatus || "",
  coachNamedQuestionnaireInvalidReason: marcQuestionnaires.find((item) => item.id.includes("respcoachname"))?.data?.sourceInvalidReason || "",
  coachNamedManualRowsMatched: coachNamedManualMatchedRows.length,
  coachNamedManualQuestionnaireClientId: coachNamedManualQuestionnaires[0]?.data?.clientId || "",
  coachNamedManualQuestionnaireStatus: coachNamedManualQuestionnaires[0]?.data?.processingStatus || "",
  coachNamedManualQuestionnaireInvalidReason: coachNamedManualQuestionnaires[0]?.data?.sourceInvalidReason || "",
  coachNamedManualReopenedStatus: previouslyArchivedCoachNamedManualQuestionnaires[0]?.data?.processingStatus || "",
  coachNamedManualReopenedInvalidReason: previouslyArchivedCoachNamedManualQuestionnaires[0]?.data?.sourceInvalidReason || "",
  manualMergeClientId: manualMergeClients[0]?.id || "",
  manualMergePhone: manualMergeClients[0]?.data?.phoneNormalized || "",
  manualMergeMembershipEnd: manualMergeClients[0]?.data?.manualMembershipEndDate || "",
  manualMergeKiloRecurrenceEnd: manualMergeClients[0]?.data?.kiloPlannedRecurrenceEndDate || "",
  manualMergeRiskLevel: manualMergeClients[0]?.data?.riskLevel || "",
  manualMergeNotes: manualMergeClients[0]?.data?.notes || "",
  manualMergeLinkedFromManual: manualMergeClients[0]?.data?.linkedFromManual === true,
  manualMergeOwnershipStatus: manualMergeClients[0]?.data?.ownershipStatus || "",
  sourceThenPhoneClientCount: sourceThenPhoneClients.length,
  sourceThenPhonePhone: sourceThenPhoneClients[0]?.data?.phoneNormalized || "",
  sourceThenPhoneSourceId: sourceThenPhoneClients[0]?.data?.sourceClientId || "",
  blankEnrichmentPhone: blankEnrichmentClients[0]?.data?.phoneNormalized || "",
  blankEnrichmentEmail: blankEnrichmentClients[0]?.data?.email || "",
  blankEnrichmentMembership: blankEnrichmentClients[0]?.data?.membershipLabel || "",
  ghlEnrichmentCount: ghlEnrichedClients.length,
  ghlEnrichmentIds: ghlEnrichedClients.map((client) => client.id),
  ghlCarolinePhone: ghlEnrichedClients.find((client) => client.id === "15935_existing_by_name")?.data?.phoneNormalized || "",
  ghlCarolineSourcePreserved: ghlEnrichedClients.find((client) => client.id === "15935_existing_by_name")?.data?.source || "",
  ghlCarolineManualEndPreserved: ghlEnrichedClients.find((client) => client.id === "15935_existing_by_name")?.data?.manualMembershipEndDate || "",
  ghlMichaelPhone: ghlEnrichedClients.find((client) => client.id === "15935_existing_by_phone")?.data?.phoneNormalized || "",
  ghlMichaelNotesPreserved: ghlEnrichedClients.find((client) => client.id === "15935_existing_by_phone")?.data?.notes || "",
  ghlDiagnostics: ghlEnrichedClients.__diagnostics?.ghlContacts || {},
  csmEnrichmentCount: csmEnrichedClients.length,
  csmEnrichmentIds: csmEnrichedClients.map((client) => client.id),
  csmCarolinePhone: csmEnrichedClients.find((client) => client.id === "15935_existing_by_name")?.data?.phoneNormalized || "",
  csmCarolineMembership: csmEnrichedClients.find((client) => client.id === "15935_existing_by_name")?.data?.membershipLabel || "",
  csmCarolineLastCheckup: csmEnrichedClients.find((client) => client.id === "15935_existing_by_name")?.data?.lastCheckupDate || "",
  csmCarolineAttendance30Days: csmEnrichedClients.find((client) => client.id === "15935_existing_by_name")?.data?.attendance30Days,
  csmCarolineClassAttendance30Days: csmEnrichedClients.find((client) => client.id === "15935_existing_by_name")?.data?.classAttendance30Days,
  csmCarolineLevelMethod: csmEnrichedClients.find((client) => client.id === "15935_existing_by_name")?.data?.levelMethodOverall || "",
  csmCarolineTargetPreserved: csmEnrichedClients.find((client) => client.id === "15935_existing_by_name")?.data?.targetSessionsPerWeek,
  csmMichaelMembershipFromCsm: csmEnrichedClients.find((client) => client.id === "15935_existing_by_phone")?.data?.membershipLabel || "",
  csmMichaelZeroAttendancePreserved: csmEnrichedClients.find((client) => client.id === "15935_existing_by_phone")?.data?.attendance30Days,
  csmEnrichmentDiagnostics: csmEnrichedClients.__diagnostics || {},
  invalidCoachRxClientCount: invalidCoachRxClients.length,
  invalidCoachRxNames: invalidCoachRxClients.map((client) => client.data.name),
  invalidCoachRxSkippedCount: invalidCoachRxClients.__diagnostics?.skippedInvalidNameCount || 0,
  invalidCoachRxMarcOwnershipStatus: invalidCoachRxClients.find((client) => client.data.name === "Marc-Andre Menard")?.data?.ownershipStatus || "",
  invalidCoachRxMarcSelectable: invalidCoachRxClients.find((client) => client.data.name === "Marc-Andre Menard")?.data?.clientSelectable,
  staleImportedDocIds: staleImportedDocs.map((item) => item.id),
  directCoachRxStaleDocIds: directCoachRxStaleDocs.map((item) => item.id),
  directGhlStaleDocIds: directGhlStaleDocs.map((item) => item.id),
  directCoachRxStaleSources: [...h.directClientStaleCandidateSources("coachrx_clients")],
  directGhlStaleSources: [...h.directClientStaleCandidateSources("ghl_contacts")],
  futureProgramActionable: h.programTaskSignal("Jun 10, 2099").actionable,
  yellowProgramActionable: h.programTaskSignal("Jun 10, 2099", { alert: "yellow" }).actionable,
  pastProgramActionable: h.programTaskSignal("May 27, 2026").actionable,
  coachRxPastOrdinalProgramSignal: h.programTaskSignal("Thu Jun 4th"),
  coachRxOldOrdinalProgramSignal: h.programTaskSignal("Fri Mar 20th"),
  coachRxFutureOrdinalProgramSignal: h.programTaskSignal("Fri Jul 3rd"),
  coachRxTomorrowOrdinalProgramSignal: h.programTaskSignal("Fri Jun 12th"),
  coachRxNearWeekdayProgramSignal: h.programTaskSignal("Friday"),
  coachRxFarWeekdayProgramSignal: h.programTaskSignal("Wednesday"),
  overdueProgramActionable: h.programTaskSignal("Overdue").actionable,
  coachRxProgramClientCount: programClients.length,
  coachRxProgramPortfolioStatus: programClients[0]?.data?.coachRxPortfolioStatus || "",
  coachRxProgramContextRows: programClients.__diagnostics?.coachRxPortfolio?.programContextRows || 0,
  coachRxProgramLateSignals: programClients.__diagnostics?.coachRxPortfolio?.lateProgramSignals || 0,
  coachRxProgramContextNote: programClients[0]?.data?.coachRxProgramContext?.note || "",
  coachRxNeedsReviewStatus: coachRxNeedsReviewClients[0]?.data?.clientValidationStatus || "",
  coachRxNeedsReviewAction: coachRxNeedsReviewClients[0]?.data?.recommendedAdminAction || "",
  coachRxNeedsReviewReasons: coachRxNeedsReviewClients[0]?.data?.coachRxValidationReasons || [],
  coachRxNeedsReviewDiagnostics: coachRxNeedsReviewClients.__diagnostics?.coachRxPortfolio || {},
  programTasksImported: programTasks.length,
  programTaskStatuses: programTasks.map((task) => task.data.status),
  coachRxColorSignalTasksImported: coachRxColorSignalTasks.length,
  coachRxColorSignalTaskKinds: coachRxColorSignalTasks.map((task) => task.data.sourceSignal?.kind),
  coachRxColorSignalTaskSeverities: coachRxColorSignalTasks.map((task) => task.data.sourceSignal?.severity),
  importedActionTaskTypes: importedActionTasks.map((task) => task.data.type),
  importedActionTaskTitles: importedActionTasks.map((task) => task.data.title),
  importedActionTaskDescriptions: importedActionTasks.map((task) => task.data.description),
  manualLinkedRebookingClientId: manualLinkedRebookings[0]?.data?.clientId || "",
  manualLinkedRebookingClientName: manualLinkedRebookings[0]?.data?.clientName || "",
  manualLinkedRebookingPhone: manualLinkedRebookings[0]?.data?.clientPhoneNormalized || "",
  manualLinkedRebookingMatchMethod: manualLinkedRebookings[0]?.data?.matchMethod || "",
  manualLinkedRebookingBy: manualLinkedRebookings[0]?.data?.manuallyLinkedBy || "",
  manualLinkedRebookingHistoryCount: manualLinkedRebookings[0]?.data?.history?.length || 0,
  ihebCoreRowsWithPhone: h.countRowsWithClientPhone(ihebCore),
  coreRowsWithPhone: h.countRowsWithClientPhone(coreRows),
  mergedCoreHeaders: h.sourceRowsOverview({ coreRows: mergedCoreRows }).headers.coreClients.normalized,
  sheetTabsReadsManualClients: h.SHEET_TABS.coreClientsManual === "CORE_Clients_Manual",
  csmCandidateHasRealTab: h.CSM_CHECKUP_TAB_CANDIDATES.includes("Formulaire Checkup")
};
results.exactGhlPhoneContactId = exactGhlContact?.id || "";
results.noGhlFallbackToFirstResult = noExactGhlContact === null;
results.ghlPhoneValues = nestedGhlPhoneValues;

h.writeCoachSyncStatus({
  result: {
    coachId: iheb.id,
    coachName: iheb.name,
    clientsImported: ihebClients.length,
    tasksImported: 0,
    questionnaireResponsesImported: 0,
    rebookingsImported: ihebRebookings.length,
    checkupsImported: 0,
    impactsImported: 0,
    alumniImported: 0,
    warnings: ["test warning"]
  },
  request: {
    auth: {
      uid: "test-admin",
      token: { email: "info@crossfitstbasilelegrand.com" }
    }
  }
});

const syncStatusWrite = firestoreWrites.find((write) => write.collection === "coachSyncStatus" && write.id === iheb.id);
results.coachSyncStatusWritten = Boolean(syncStatusWrite);
results.coachSyncStatusStatus = syncStatusWrite?.data?.status;
results.coachSyncStatusWarnings = syncStatusWrite?.data?.warningCount;

const failures = [];
if (results.ihebCoreMatched !== 2) failures.push("Iheb CORE_Clients + CORE_Clients_Manual devrait matcher 2 lignes.");
if (!exactLiveRosterMode && results.ihebClientsImported !== 1) failures.push("Iheb devrait importer 1 client.");
if (!exactLiveRosterMode && !String(results.firstIhebClientId || "").includes("karineaubriot")) failures.push("Client Key devrait produire un ID stable.");
if (!exactLiveRosterMode && results.firstIhebClientStatus !== "active") failures.push("Un client importe devrait etre actif par defaut.");
if (results.ihebClientsMissingPhone !== 0) failures.push("CORE_Clients_Manual devrait enrichir le telephone du client consolide.");
if (results.coreHeaderCount < 7 || !results.coreHeaderHasCoach) failures.push("L'audit de source doit conserver les entetes normalisees.");
if (results.ihebRebookingsImported !== 2) failures.push("Iheb devrait importer 2 rebookings.");
if (!results.rebookingStatuses.includes("open") || !results.rebookingStatuses.includes("rebooked")) failures.push("Statuts rebooking mal normalises.");
if (!results.rebookingMatchMethods.every((method) => method === "unmatched")) failures.push("Les rebookings sans telephone et sans client existant devraient etre marques non relies.");
if (results.rebookingDiagnosticOpen !== 1 || results.rebookingDiagnosticSourceRowsMatched !== 2) failures.push("Le diagnostic rebooking devrait compter les lignes source et statuts ouverts.");
if (results.rebookingDiagnosticSourceRowsWithoutPhone !== 2) failures.push("Le diagnostic rebooking devrait compter les lignes source sans telephone.");
if (results.rebookingDiagnosticByMatchMethod.unmatched !== 2) failures.push("Le diagnostic rebooking devrait exposer les matchings non relies.");
if (results.rebookingDiagnosticMissingClientId !== 2) failures.push("Le diagnostic rebooking devrait signaler les rebookings non relies aux fiches clients.");
if (results.gabrielCheckupsMatched !== 1 || results.gabrielCheckupsImported !== 1) failures.push("Check-up Gabriel par prenom devrait matcher.");
if (results.alumniStatus !== "do_not_contact") failures.push("Statut alumni mal normalise.");
if (results.impactStatus !== "confirmed") failures.push("Statut impact mal normalise.");
Object.entries(results.pilotCoverage).forEach(([coachId, coverage]) => {
  if (coverage.matchedRows < 1) failures.push(`Coach ${coachId} devrait matcher au moins une ligne source de test.`);
  if (!exactLiveRosterMode && coverage.clientsImported < 1) failures.push(`Coach ${coachId} devrait importer au moins un client de test.`);
});
if (results.marcDedupeClientCount !== 1) failures.push("Marc devrait dedupliquer CORE + CoachRx par telephone.");
if (results.marcPhoneKept !== "5145551001") failures.push("Le telephone Marc devrait etre normalise et conserve.");
if (results.marcQuestionnaireRowsMatched !== (exactLiveRosterMode ? 1 : 2)) failures.push("Les reponses questionnaire Marc devraient respecter le mode de roster actif.");
if (!results.marcQuestionnaireClientId.includes("5145551001")) failures.push("La reponse questionnaire Marc devrait etre liee au client par telephone.");
if (results.marcQuestionnaireCoachAlignment !== "2") failures.push("Le champ coach_alignment_score V2 devrait etre capture comme reponse connue.");
if (results.marcQuestionnaireGoalChangeDetail !== "Objectif change pour endurance") failures.push("Le champ goal_change_detail V2 devrait etre capture comme reponse connue.");
if (results.marcQuestionnaireOtherResponse !== "Reponse future visible") failures.push("Les nouveaux champs questionnaire devraient rester visibles dans other_responses.");
if (!exactLiveRosterMode && (results.coachNamedQuestionnaireStatus !== "archived" || results.coachNamedQuestionnaireInvalidReason !== "coach_as_unmatched_client")) failures.push("Une reponse questionnaire au nom d'un coach pilote sans client actif doit etre archivee comme test/bruit, pas envoyee en A valider.");
if (results.coachNamedManualRowsMatched !== 1) failures.push("Une reponse questionnaire doit matcher un client manuel existant par telephone, meme si le nom est aussi un coach pilote.");
if (results.coachNamedManualQuestionnaireClientId !== "15935_4383995269") failures.push("La reponse questionnaire d'un client manuel doit etre liee a sa fiche Firestore.");
if (results.coachNamedManualQuestionnaireStatus !== "to_read" || results.coachNamedManualQuestionnaireInvalidReason) failures.push("Une reponse de client manuel matchee ne doit pas etre archivee comme bruit coach.");
if (results.coachNamedManualReopenedStatus !== "to_read" || results.coachNamedManualReopenedInvalidReason) failures.push("Une reponse archivee par erreur comme coach_as_unmatched_client doit etre rouverte si le client est retrouve par telephone.");
if (results.manualMergeClientId === "15935_manual_alex_turcotte") failures.push("Un import CoachRx ne doit jamais fusionner avec un client manuel par nom seul.");
if (results.manualMergePhone !== "5145552020") failures.push("La fusion client manuel -> CoachRx devrait ajouter le telephone importe.");
if (results.manualMergeMembershipEnd || results.manualMergeKiloRecurrenceEnd || results.manualMergeRiskLevel || results.manualMergeNotes || results.manualMergeLinkedFromManual) failures.push("Un appariement refuse par nom ne doit pas copier les champs de la fiche manuelle homonyme.");
if (results.manualMergeOwnershipStatus !== "confirmed") failures.push("La nouvelle fiche CoachRx avec telephone et enveloppe coach validee devrait etre confirmee sans toucher l'homonyme.");
if (!exactLiveRosterMode && results.sourceThenPhoneClientCount !== 2) failures.push("CORE sans telephone et CoachRx avec telephone du meme nom doivent rester deux fiches tant qu'aucune identite forte ne les relie.");
if (!exactLiveRosterMode && results.sourceThenPhonePhone) failures.push("La fiche CORE sans identite forte ne doit pas absorber le telephone d'un homonyme CoachRx.");
if (!exactLiveRosterMode && results.sourceThenPhoneSourceId !== "source-only-alex") failures.push("La fusion CORE/CoachRx devrait conserver l'ID source CORE.");
if (!exactLiveRosterMode && results.blankEnrichmentPhone !== "5145556060") failures.push("Un import client incomplet ne devrait pas effacer un telephone existant utile.");
if (!exactLiveRosterMode && results.blankEnrichmentEmail !== "keep@example.test") failures.push("Un import client incomplet ne devrait pas effacer un courriel existant utile.");
if (!exactLiveRosterMode && results.blankEnrichmentMembership !== "Semi-Prive 2x") failures.push("Un import client incomplet ne devrait pas effacer un membership existant utile.");
if (results.ghlEnrichmentCount !== 1) failures.push("Un import GHL doit enrichir seulement le client relie par identite forte.");
if (results.ghlEnrichmentIds.includes("15935_existing_by_name") || !results.ghlEnrichmentIds.includes("15935_existing_by_phone")) failures.push("GHL doit refuser le nom seul et conserver le matching telephone.");
if (results.ghlCarolinePhone || results.ghlCarolineSourcePreserved || results.ghlCarolineManualEndPreserved) failures.push("GHL ne doit pas muter un client apparie seulement par nom.");
if (results.ghlMichaelPhone !== "8192771825") failures.push("GHL doit matcher un client existant par telephone meme si le nom differe.");
if (results.ghlMichaelNotesPreserved !== "Client manuel a conserver") failures.push("GHL ne doit pas effacer les notes d'un client manuel.");
if (results.ghlDiagnostics.rowsWithoutPhone !== 1 || results.ghlDiagnostics.skippedNoExistingClientMatch !== 2 || results.ghlDiagnostics.matchedExistingClients !== 1) failures.push("Le diagnostic GHL doit exposer les refus de nom seul, les lignes sans telephone et le matching fort.");
if (results.csmEnrichmentCount !== 1) failures.push("L'enrichissement CSM doit enrichir seulement le client relie par identite forte.");
if (results.csmEnrichmentIds.includes("15935_existing_by_name") || !results.csmEnrichmentIds.includes("15935_existing_by_phone")) failures.push("CSM doit refuser le nom seul et conserver le matching telephone.");
if (results.csmCarolinePhone || results.csmCarolineMembership || results.csmCarolineLastCheckup || results.csmCarolineAttendance30Days !== undefined || results.csmCarolineClassAttendance30Days !== undefined || results.csmCarolineLevelMethod || results.csmCarolineTargetPreserved !== undefined) failures.push("CSM ne doit pas muter un client apparie seulement par nom.");
if (results.csmMichaelMembershipFromCsm !== "Semi-Prive 2x") failures.push("L'enrichissement CSM doit devenir la source prioritaire du membership actif.");
if (results.csmMichaelZeroAttendancePreserved !== 0) failures.push("Une assiduite reelle de zero doit rester zero et ne pas devenir une valeur manquante.");
if (results.csmEnrichmentDiagnostics.fieldsApplied.attendance !== 1 || results.csmEnrichmentDiagnostics.fieldsApplied.levelMethod !== 1) failures.push("Le diagnostic CSM doit compter seulement les metriques appliquees par identite forte.");
if (results.csmEnrichmentDiagnostics.skippedNoExistingClientMatch !== 2 || results.csmEnrichmentDiagnostics.matchedExistingClients !== 1) failures.push("Le diagnostic CSM doit exposer les refus de nom seul et les matchings forts.");
if (exactLiveRosterMode) {
  if (results.invalidCoachRxClientCount !== 1 || !results.invalidCoachRxNames.includes("Vrai Client") || results.invalidCoachRxNames.includes("Marc-Andre Menard")) failures.push("Le roster exact-live doit exclure le profil staff sans identite forte.");
} else {
  if (results.invalidCoachRxClientCount !== 2 || !results.invalidCoachRxNames.includes("Vrai Client") || !results.invalidCoachRxNames.includes("Marc-Andre Menard")) failures.push("Le nom d'un coach doit rester visible en quarantaine, pas etre supprime silencieusement.");
  if (results.invalidCoachRxMarcOwnershipStatus !== "needs_review" || results.invalidCoachRxMarcSelectable !== false) failures.push("Un homonyme de coach doit etre non selectionnable et en validation.");
}
if (results.invalidCoachRxSkippedCount !== 6) failures.push("Le diagnostic devrait compter les autres noms clients invalides ignores.");
if (results.staleImportedDocIds.length !== 3 || !results.staleImportedDocIds.includes("15935_old_import") || !results.staleImportedDocIds.includes("15935_old_snapshot") || !results.staleImportedDocIds.includes("15935_old_coachrx_task")) failures.push("Le nettoyage stale doit toucher les anciens imports Sheets/snapshots/To-do CoachRx non manuels absents de la source.");
if (results.directCoachRxStaleDocIds.length !== 1 || results.directCoachRxStaleDocIds[0] !== "15935_old_direct") failures.push("Un snapshot direct CoachRx doit pouvoir marquer stale seulement les anciens imports directs absents.");
if (results.directGhlStaleDocIds.length !== 0 || results.directGhlStaleSources.length !== 0) failures.push("Un import GHL partiel ne doit jamais marquer des clients stale.");
if (results.futureProgramActionable) failures.push("Une date programme CoachRx future ne devrait pas creer une To-do automatiquement.");
if (!results.yellowProgramActionable || !results.pastProgramActionable || !results.overdueProgramActionable) failures.push("Le detecteur programme doit identifier les signaux CoachRx jaunes, rouges et en retard.");
if (!results.coachRxPastOrdinalProgramSignal.actionable || results.coachRxPastOrdinalProgramSignal.severity !== "red") failures.push("Une date CoachRx passee avec jour/suffixe ordinal devrait creer une mission rouge.");
if (!results.coachRxOldOrdinalProgramSignal.actionable || results.coachRxOldOrdinalProgramSignal.severity !== "red") failures.push("Une ancienne date CoachRx avec suffixe ordinal devrait creer une mission rouge.");
if (results.coachRxFutureOrdinalProgramSignal.actionable) failures.push("Une date CoachRx future eloignee ne devrait pas creer une mission sans pastille explicite.");
if (!results.coachRxTomorrowOrdinalProgramSignal.actionable || results.coachRxTomorrowOrdinalProgramSignal.severity !== "yellow") failures.push("Une date CoachRx demain/proche devrait creer une mission jaune.");
if (!results.coachRxNearWeekdayProgramSignal.actionable || results.coachRxNearWeekdayProgramSignal.severity !== "yellow") failures.push("Un jour CoachRx tres proche devrait creer une mission jaune.");
if (results.coachRxFarWeekdayProgramSignal.actionable) failures.push("Un jour CoachRx seul mais eloigne ne devrait pas creer une mission sans pastille explicite.");
if (results.coachRxProgramClientCount !== 1) failures.push("Les lignes CoachRx programme du meme client devraient rester dedupliquees en une fiche client.");
if (results.coachRxProgramPortfolioStatus !== "present_in_coachrx") failures.push("Un import CoachRx doit marquer la presence portefeuille sans confirmer automatiquement le membership actif.");
if (results.coachRxProgramContextRows < 1 || results.coachRxProgramLateSignals < 1) failures.push("CoachRx doit conserver le contexte programme et signaler les retards en diagnostic.");
if (!String(results.coachRxProgramContextNote).includes("rouges ou jaunes")) failures.push("Le contexte programme CoachRx doit expliquer que les signaux rouges ou jaunes creent une mission.");
if (!exactLiveRosterMode && results.coachRxNeedsReviewStatus !== "needs_review") failures.push("Un client CoachRx sans telephone/membership doit etre a valider.");
if (!exactLiveRosterMode && (!String(results.coachRxNeedsReviewAction).includes("archive") || !String(results.coachRxNeedsReviewAction).includes("Alumni"))) failures.push("Un client CoachRx incomplet doit proposer de valider, archiver ou deplacer dans Alumni.");
if (!exactLiveRosterMode && (!results.coachRxNeedsReviewReasons.includes("telephone manquant") || !results.coachRxNeedsReviewReasons.includes("membership/abonnement non confirme"))) failures.push("Les raisons de validation CoachRx doivent nommer le telephone et le membership manquants.");
if (!exactLiveRosterMode && (results.coachRxNeedsReviewDiagnostics.needsValidation !== 1 || results.coachRxNeedsReviewDiagnostics.rowsImported !== 1)) failures.push("Les diagnostics CoachRx doivent compter les clients a valider.");
if (results.programTasksImported !== 1) failures.push("CoachRx browser doit creer une mission programme quand le signal programme est actionnable.");
if (!results.programTaskStatuses.every((status) => status === "open")) failures.push("Les taches importees doivent avoir un statut open explicite.");
if (results.coachRxColorSignalTasksImported < 2) failures.push("Les pastilles CoachRx rouges/jaunes explicites doivent creer des missions programme.");
if (!results.coachRxColorSignalTaskKinds.includes("exercise") || !results.coachRxColorSignalTaskKinds.includes("lifestyle")) failures.push("CoachRx doit creer des missions distinctes pour exercice et lifestyle quand les signaux sont explicites.");
if (!results.coachRxColorSignalTaskSeverities.includes("red") || !results.coachRxColorSignalTaskSeverities.includes("yellow")) failures.push("CoachRx doit conserver la severite rouge/jaune dans sourceSignal.");
if (!exactLiveRosterMode && (!results.importedActionTaskTypes.includes("validation") || !results.importedActionTaskTypes.includes("rebooking"))) failures.push("Les taches TASKS_Current doivent etre classees par titre quand le type source est ambigu.");
if (!exactLiveRosterMode && !results.importedActionTaskTitles.includes("Confirmer le statut du client")) failures.push("Les validations client doivent avoir un titre actionnable sans jargon inutile.");
if (!exactLiveRosterMode && !results.importedActionTaskDescriptions.some((description) => String(description).includes("traiter le suivi"))) failures.push("Les rebookings importes doivent recevoir une description d'action.");
if (results.manualLinkedRebookingClientId !== "15935_manual_alex_turcotte") failures.push("Un lien client rebooking manuel ne doit pas etre remplace par un futur import source.");
if (results.manualLinkedRebookingClientName !== "Alex Turcotte") failures.push("Un lien client rebooking manuel doit conserver le nom du client choisi par le coach.");
if (results.manualLinkedRebookingPhone !== "5145552020") failures.push("Un lien client rebooking manuel doit conserver le telephone du client choisi par le coach.");
if (results.manualLinkedRebookingMatchMethod !== "manual_client") failures.push("Un lien client rebooking manuel doit conserver matchMethod=manual_client.");
if (results.manualLinkedRebookingBy !== "coach@example.test" || results.manualLinkedRebookingHistoryCount !== 1) failures.push("Un lien client rebooking manuel doit conserver ses metadonnees et son historique.");
if (results.ihebCoreRowsWithPhone !== 1) failures.push("Le diagnostic telephone doit compter les lignes CORE/Manual avec telephone pour le coach.");
if (results.coreRowsWithPhone < 3) failures.push("Le diagnostic telephone doit detecter les telephones presents dans les sources.");
if (!results.mergedCoreHeaders.includes("membershipenddate")) failures.push("La fusion d'onglets doit conserver les entetes de CORE_Clients_Manual.");
if (!results.sheetTabsReadsManualClients) failures.push("La sync doit lire CORE_Clients_Manual.");
if (!results.csmCandidateHasRealTab) failures.push("La sync CSM doit lire l'onglet reel Formulaire Checkup.");
if (results.exactGhlPhoneContactId !== "right") failures.push("GHL doit choisir seulement le contact dont le telephone normalise matche exactement.");
if (!results.noGhlFallbackToFirstResult) failures.push("GHL ne doit pas taguer le premier resultat si aucun telephone exact ne matche.");
if (!results.ghlPhoneValues.includes("8192771825") || !results.ghlPhoneValues.includes("5145553333") || !results.ghlPhoneValues.includes("4505554444")) failures.push("Le matching GHL doit lire les champs telephone connus et personnalises.");
if (!results.coachSyncStatusWritten) failures.push("coachSyncStatus devrait etre ecrit apres une sync.");
if (results.coachSyncStatusStatus !== "warning" || results.coachSyncStatusWarnings !== 1) failures.push("coachSyncStatus devrait exposer le statut warning et le nombre d'avertissements.");

console.log(JSON.stringify({ ok: failures.length === 0, results, failures }, null, 2));
if (failures.length) process.exit(1);
