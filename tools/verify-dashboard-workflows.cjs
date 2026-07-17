const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "app.js"), "utf8");

function extractFunction(name) {
  const functionStart = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : functionStart;
  if (start < 0) throw new Error(`Fonction introuvable: ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Fonction incomplete: ${name}`);
}

const functions = [
  "dateValue",
  "todayIso",
  "rebookingEventDate",
  "normalizePhone",
  "slugify",
  "normalizeComparable",
  "clientPhone",
  "clientPhoneSuggestion",
  "saveClientPhoneFix",
  "markRebookingAbsenceRange",
  "transferClientRelatedRecords",
  "updateAlumniStatus",
  "archiveAlumni"
].map(extractFunction).join("\n\n");

const patchedRebookings = [];
const patchedEntities = [];
const transferredRelatedRecords = [];
const clientPhoneUpdates = [];
const actionLogs = [];
const toasts = [];
let modalClosed = false;
const relatedCollections = ["tasks", "rebookings", "questionnaireSends", "questionnaireSchedules", "questionnaireResponses", "checkups", "impacts"];

const sandbox = {
  console,
  db: "__db__",
  state: {
    data: {
      rebookings: [
        { id: "r-open-in", status: "open", appointmentAt: "2026-06-10", clientName: "Client A" },
        { id: "r-open-out", status: "open", appointmentAt: "2026-06-25", clientName: "Client B" },
        { id: "r-closed-in", status: "managed", appointmentAt: "2026-06-11", clientName: "Client C" },
        { id: "r-detected-in", status: "open", detectedAt: "2026-06-12", clientName: "Client D" }
      ],
      alumni: [
        { id: "a-1", name: "Laura Pelletier", status: "do_not_contact", phoneNormalized: "5145550001" }
      ],
      clients: [
        {
          id: "client-phone-1",
          name: "Client Sans Telephone",
          phoneNormalized: "",
          clientPhoneNormalized: "",
          membershipLabel: "Semi-Prive 2x",
          manualMembershipEndDate: "2026-08-15",
          kiloPlannedRecurrenceEndDate: "2026-07-01",
          riskLevel: "medium",
          riskNote: "Note risque a garder",
          notes: "Note manuelle a conserver",
          coachId: "15935"
        }
      ],
      checkups: [
        {
          id: "checkup-phone-1",
          clientName: "Client Sans Telephone",
          clientPhoneNormalized: "1 (819) 277-1825",
          checkupDate: "2026-06-10"
        },
        {
          id: "checkup-phone-2",
          clientName: "Client Sans Telephone",
          clientPhoneNormalized: "8192771825",
          checkupDate: "2026-06-11"
        }
      ]
    },
    user: {
      uid: "user-1",
      email: "coach@example.test"
    }
  },
  window: {
    confirm: () => true
  },
  serverTimestamp: () => "__serverTimestamp__",
  collection: (db, collectionName) => ({ db, collectionName }),
  doc: (db, collectionName, id) => ({ db, collectionName, id }),
  where: (field, operator, value) => ({ field, operator, value }),
  query: (collectionRef, filter) => ({ collectionName: collectionRef.collectionName, filter }),
  getDocs: async (queryRef) => ({
    docs: [
      { ref: { collectionName: queryRef.collectionName, id: `${queryRef.collectionName}-1` } },
      { ref: { collectionName: queryRef.collectionName, id: `${queryRef.collectionName}-2` } }
    ]
  }),
  updateDoc: async (ref, patch) => {
    if (ref.collectionName === "clients") {
      clientPhoneUpdates.push({ ref, patch });
    } else {
      transferredRelatedRecords.push({ ref, patch });
    }
  },
  patchRebooking: async (id, status, toast, details) => {
    patchedRebookings.push({ id, status, toast, details });
  },
  patchEntity: async (collectionName, id, patch, toast) => {
    patchedEntities.push({ collectionName, id, patch, toast });
  },
  logAction: async (action, entityType, entityId, details) => {
    actionLogs.push({ action, entityType, entityId, details });
  },
  closeModal: () => {
    modalClosed = true;
  },
  showToast: (message) => {
    toasts.push(message);
  }
};

vm.runInNewContext(`${functions}
globalThis.__helpers = {
  clientPhoneSuggestion,
  saveClientPhoneFix,
  markRebookingAbsenceRange,
  transferClientRelatedRecords,
  updateAlumniStatus,
  archiveAlumni
};`, sandbox, { filename: "app-workflow-helpers.js" });

async function run() {
  const h = sandbox.__helpers;
  const suggestedPhone = h.clientPhoneSuggestion(sandbox.state.data.clients[0]);
  await h.saveClientPhoneFix("client-phone-1", {
    phoneNormalized: "1 (819) 277-1825",
    note: "Confirme CSM"
  });
  let invalidPhoneRejected = false;
  try {
    await h.saveClientPhoneFix("client-phone-1", {
      phoneNormalized: "123",
      note: ""
    });
  } catch (error) {
    invalidPhoneRejected = /10 chiffres/.test(error.message);
  }
  await h.markRebookingAbsenceRange({
    startDate: "2026-06-09",
    endDate: "2026-06-13",
    reason: "Vacances coach"
  });
  await h.updateAlumniStatus("a-1", "to_work", "Alumni remis a travailler");
  await h.updateAlumniStatus("a-1", "reactivated", "Alumni marque reactive");
  await h.archiveAlumni("a-1");
  const transferCounts = await h.transferClientRelatedRecords("client-1", "15935", {
    id: "15928",
    coachRxId: "15928",
    name: "Iheb Yahyaoui"
  });

  const rebookingIds = patchedRebookings.map((item) => item.id).sort();
  const transferredCollections = [...new Set(transferredRelatedRecords.map((item) => item.ref.collectionName))].sort();
  const phonePatch = clientPhoneUpdates[0]?.patch || {};
  const phonePatchFields = Object.keys(phonePatch).sort();
  const forbiddenManualFields = [
    "name",
    "membershipLabel",
    "manualMembershipEndDate",
    "kiloPlannedRecurrenceEndDate",
    "riskLevel",
    "riskNote",
    "notes",
    "coachId",
    "coachRxId",
    "coachName"
  ];
  const results = {
    clientPhoneSuggestionFindsUniqueCsmPhone: suggestedPhone?.phone === "8192771825"
      && suggestedPhone.count === 2
      && suggestedPhone.source === "csm_checkups",
    clientPhoneFixNormalizesAndWritesPhone: clientPhoneUpdates.length === 1
      && clientPhoneUpdates[0].ref.collectionName === "clients"
      && clientPhoneUpdates[0].ref.id === "client-phone-1"
      && phonePatch.phoneNormalized === "8192771825"
      && phonePatch.clientPhoneNormalized === "8192771825",
    clientPhoneFixPreservesManualFields: forbiddenManualFields.every((field) => !phonePatchFields.includes(field)),
    clientPhoneFixWritesManualSourceAndAudit: phonePatch.phoneSource === "dashboard_manual"
      && phonePatch.phoneUpdatedAt
      && phonePatch.phoneUpdatedByUid === "user-1"
      && phonePatch.phoneUpdatedByEmail === "coach@example.test"
      && phonePatch.manualPhoneConfirmedAt
      && phonePatch.manualPhoneNote === "Confirme CSM",
    clientPhoneFixLogsAndCloses: actionLogs.some((item) =>
      item.action === "client.phone_updated"
      && item.entityType === "clients"
      && item.entityId === "client-phone-1"
      && item.details.phoneEnding === "1825"
      && item.details.source === "dashboard_manual"
    )
      && toasts.includes("Telephone client enregistre."),
    clientPhoneFixRejectsInvalidPhone: invalidPhoneRejected,
    absenceTargetsOnlyOpenInRange: JSON.stringify(rebookingIds) === JSON.stringify(["r-detected-in", "r-open-in"]),
    absenceAddsReasonAndRange: patchedRebookings.every((item) =>
      item.status === "coach_absence"
      && item.details.coachAbsenceReason === "Vacances coach"
      && item.details.absenceStartDate === "2026-06-09"
      && item.details.absenceEndDate === "2026-06-13"
    ),
    absenceLogsBatchAction: actionLogs.some((item) =>
      item.action === "rebooking.coach_absence_range"
      && item.details.count === 2
    ),
    absenceClosesModalAndToasts: modalClosed && toasts.includes("2 rebooking(s) classes absence coach."),
    alumniReturnToWorkTracked: patchedEntities.some((item) =>
      item.collectionName === "alumni"
      && item.id === "a-1"
      && item.patch.status === "to_work"
      && item.patch.returnedToWorkAt
    ),
    alumniReactivationTracked: patchedEntities.some((item) =>
      item.collectionName === "alumni"
      && item.id === "a-1"
      && item.patch.status === "reactivated"
      && item.patch.reactivatedAt
    ),
    alumniArchiveTracked: patchedEntities.some((item) =>
      item.collectionName === "alumni"
      && item.id === "a-1"
      && item.patch.status === "archived"
      && item.patch.archivedAt
    ),
    alumniLogsSpecificActions: ["alumni.to_work", "alumni.reactivated", "alumni.archived"]
      .every((action) => actionLogs.some((item) => item.action === action)),
    clientTransferTouchesAllRelatedCollections: JSON.stringify(transferredCollections) === JSON.stringify(relatedCollections.slice().sort()),
    clientTransferCountsAllRelatedCollections: relatedCollections.every((collectionName) => transferCounts[collectionName] === 2),
    clientTransferWritesTargetCoachAndTrace: transferredRelatedRecords.every((item) =>
      item.patch.coachId === "15928"
      && item.patch.coachRxId === "15928"
      && item.patch.coachName === "Iheb Yahyaoui"
      && item.patch.previousCoachId === "15935"
      && item.patch.transferredAt
      && item.patch.updatedAt
    )
  };

  const failures = Object.entries(results)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  console.log(JSON.stringify({ ok: failures.length === 0, results, failures }, null, 2));
  if (failures.length) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
