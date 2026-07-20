"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const functionsRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(functionsRoot, "index.js"), "utf8");
const writes = [];
const fixtures = new Map();
const queryLog = [];
const queryFailures = new Map();
let autoDocumentId = 0;

function fixtureMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return Number(value.toMillis()) || 0;
  if (Number.isFinite(value.milliseconds)) return Number(value.milliseconds);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotFor(collectionName, id) {
  const record = (fixtures.get(collectionName) || []).find((candidate) => candidate.id === id);
  return {
    exists: Boolean(record),
    id,
    ref: { __collectionName: collectionName, __id: id, id },
    data: () => record?.data || {},
    get: (field) => record?.data?.[field]
  };
}

function mergeFixture(collectionName, id, data, merge) {
  const records = fixtures.get(collectionName) || [];
  const index = records.findIndex((candidate) => candidate.id === id);
  const previous = index >= 0 ? records[index].data : {};
  const nextData = merge ? { ...previous, ...data } : { ...data };
  Object.entries(nextData).forEach(([field, value]) => {
    if (value === "DELETE_FIELD") delete nextData[field];
  });
  const next = { id, data: nextData };
  if (index >= 0) records[index] = next;
  else records.push(next);
  fixtures.set(collectionName, records);
}

function docsFor(collectionName) {
  return (fixtures.get(collectionName) || []).map(({ id, data }) => ({
    id,
    ref: { __collectionName: collectionName, __id: id, id },
    data: () => data,
    get: (field) => data[field]
  }));
}

function queryDocumentValue(doc, field) {
  return field === "__name__" ? doc.id : doc.data()[field];
}

function compareQueryDocuments(left, right, orderings) {
  for (const { field, direction } of orderings) {
    const leftValue = queryDocumentValue(left, field);
    const rightValue = queryDocumentValue(right, field);
    const leftComparable = field === "__name__" ? String(leftValue) : fixtureMillis(leftValue) || String(leftValue);
    const rightComparable = field === "__name__" ? String(rightValue) : fixtureMillis(rightValue) || String(rightValue);
    if (leftComparable === rightComparable) continue;
    const result = leftComparable < rightComparable ? -1 : 1;
    return direction === "desc" ? -result : result;
  }
  return 0;
}

function querySnapshot(
  collectionName,
  field,
  operator,
  value,
  maxDocuments = Infinity,
  orderings = [],
  cursor = null
) {
  let docs = docsFor(collectionName).filter((doc) => {
    const actual = doc.data()[field];
    if (operator === "<=") {
      const actualMs = fixtureMillis(actual);
      const expectedMs = fixtureMillis(value);
      return Boolean(actualMs && expectedMs && actualMs <= expectedMs);
    }
    return actual === value;
  });
  if (orderings.length) docs = docs.sort((left, right) => compareQueryDocuments(left, right, orderings));
  if (cursor) docs = docs.filter((doc) => compareQueryDocuments(doc, cursor, orderings) > 0);
  docs = docs.slice(0, maxDocuments);
  return {
    docs,
    forEach(callback) {
      docs.forEach(callback);
    }
  };
}

const dbMock = {
  collection(collectionName) {
    return {
      where(field, _operator, value) {
        let maxDocuments = Infinity;
        let cursor = null;
        const orderings = [];
        const query = {
          orderBy(orderField, direction = "asc") {
            orderings.push({ field: orderField, direction });
            return query;
          },
          startAfter(documentSnapshot) {
            cursor = documentSnapshot;
            return query;
          },
          limit(value) {
            maxDocuments = Number(value);
            return query;
          },
          async get() {
            queryLog.push({
              collectionName,
              field,
              operator: _operator,
              value,
              limit: maxDocuments,
              orderings: orderings.map((ordering) => ({ ...ordering })),
              cursorId: cursor?.id || ""
            });
            if (queryFailures.has(collectionName)) throw queryFailures.get(collectionName);
            return querySnapshot(
              collectionName,
              field,
              _operator,
              value,
              maxDocuments,
              orderings,
              cursor
            );
          }
        };
        return query;
      },
      get: async () => querySnapshot(collectionName, "__never__", "==", "__never__"),
      doc(id = `auto-${++autoDocumentId}`) {
        const ref = {
          __collectionName: collectionName,
          __id: id,
          id,
          get: async () => snapshotFor(collectionName, id),
          set(data, options) {
            writes.push({ collectionName, id, data, options });
            mergeFixture(collectionName, id, data, options?.merge === true);
          },
          collection(subcollection) {
            return {
              doc(subId) {
                return {
                  set(data, options) {
                    writes.push({ collectionName: `${collectionName}/${id}/${subcollection}`, id: subId, data, options });
                  }
                };
              }
            };
          }
        };
        return ref;
      }
    };
  },
  async runTransaction(callback) {
    const transaction = {
      get: async (ref) => snapshotFor(ref.__collectionName, ref.__id),
      set(ref, data, options) {
        writes.push({ collectionName: ref.__collectionName, id: ref.__id, data, options, transaction: true });
        mergeFixture(ref.__collectionName, ref.__id, data, options?.merge === true);
      }
    };
    return callback(transaction);
  },
  batch() {
    return {
      set(ref, data, options) {
        writes.push({ collectionName: "batch", ref, data, options });
      },
      async commit() {}
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
adminMock.firestore.FieldPath = {
  documentId: () => "__name__"
};
adminMock.firestore.Timestamp = {
  now: () => "CLIENT_TIMESTAMP",
  fromMillis: (milliseconds) => ({
    milliseconds,
    toMillis: () => milliseconds
  })
};

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const sandbox = {
  Buffer,
  URL,
  clearTimeout,
  console,
  exports: {},
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  process,
  setTimeout,
  require(name) {
    if (name === "firebase-functions/v2/https") {
      const wrap = (...args) => args.at(-1);
      return { onCall: wrap, onRequest: wrap, HttpsError };
    }
    if (name === "firebase-functions/v2/firestore") return { onDocumentCreated: (...args) => args.at(-1) };
    if (name === "firebase-functions/v2/scheduler") return { onSchedule: (...args) => args.at(-1) };
    if (name === "firebase-functions/params") return { defineSecret: () => ({ value: () => "" }) };
    if (name === "firebase-admin") return adminMock;
    if (name === "./product-report") return { buildWeeklyProductReport: () => ({}) };
    if (name === "./assistant-context") {
      return {
        buildReadOnlyAssistantContext: () => ({}),
        resolveTaskCreateProposal: () => ({}),
        verifiedEvidenceRefs: () => []
      };
    }
    if (name === "./assistant-ai") {
      return {
        generateReadOnlyAssistantProposal: async () => ({}),
        transcribeAssistantVoice: async () => ({})
      };
    }
    if (name.startsWith("./")) return require(path.join(functionsRoot, name.slice(2)));
    return require(name);
  }
};

vm.runInNewContext(`${source}\nglobalThis.__helpers = {
  PROCESS_SYNC_REQUEST_TIMEOUT_SECONDS,
  SYNC_REQUEST_CLAIM_TTL_MS,
  EXECUTION_LEDGER_CONTRACT_VERSION,
  EXECUTION_LEDGER_TTL_MS,
  EXPIRED_EXECUTION_REAP_LIMIT,
  EXPIRED_EXECUTION_REAP_SCAN_LIMIT,
  beginDashboardSyncRun,
  buildClientEnrichmentRecords,
  buildClientRecords,
  buildGhlContactEnrichmentRecords,
  buildStaleImportedTaskPatch,
  buildTaskClientMatcher,
  buildTaskRecords,
  clientRecordAvailableForMatching,
  collectStaleImportedDocs,
  collectStaleImportedMapDocs,
  collectVerifiedLegacyCoachRxDuplicateDocs,
  claimSyncRequestExecution,
  deterministicDashboardSyncRunId,
  deterministicSourceImportRunId,
  createClientMatchIndex,
  findClientMatch,
  questionnaireReviewRowsForScope,
  reapExpiredExecutionLedgers,
  reapExpiredExecutionState,
  reapExpiredSyncRequestClaims,
  reconcileClaimedSyncRequest,
  rowsFromValues,
  syncCoachFromRows,
  taskRowBelongsToCoach,
  validateSyncRequestCanaryBinding,
  markSyncRequestBusinessStarted,
  writeFailedSyncRun,
  writeCoachSyncStatus
};`, sandbox, { filename: "functions/index.js" });

const h = sandbox.__helpers;
const processSyncRequestHandler = sandbox.exports.processSyncRequest;
const scheduledDashboardSyncHandler = sandbox.exports.scheduledDashboardSync;
const scheduledQuestionnaireResponseSyncHandler = sandbox.exports.scheduledQuestionnaireResponseSync;
const marc = {
  id: "15935",
  coachRxId: "15935",
  name: "Marc-Andre Menard",
  aliases: ["Marc-André Ménard"]
};

function activeClient(overrides = {}) {
  return {
    coachId: "15935",
    coachRxId: "15935",
    coachName: "Marc-Andre Menard",
    name: "Client Revenu",
    source: "google_sheets_coachrx_browser",
    sourceIdentitySystem: "coachrx",
    sourceClientId: "coachrx-current-returned",
    phoneNormalized: "5145550101",
    clientPhoneNormalized: "5145550101",
    ownershipStatus: "confirmed",
    clientSelectable: true,
    entityType: "member",
    status: "active",
    ...overrides
  };
}

test("un client import_stale revenu du roster conserve exactement le meme document", () => {
  const existingById = new Map([["15935_existing_stale_current", activeClient({
    status: "import_stale",
    sourceStale: true,
    staleAt: "old-stale-at",
    staleReason: "old-stale-reason"
  })]]);
  const records = h.buildClientRecords({
    coach: marc,
    browserRows: h.rowsFromValues([
      ["Client", "Coach ID", "Client ID", "Membership", "Phone"],
      ["Client Revenu modifie", "15935", "coachrx-current-returned", "Semi-Prive", "5145550199"]
    ]),
    existingById
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].id, "15935_existing_stale_current");
  assert.equal(records[0].data.status, "active");
  assert.equal(records[0].data.phoneNormalized, "5145550199");
  assert.equal(records[0].data.sourceStale, false);
  assert.equal(records[0].data.staleAt, "DELETE_FIELD");
  assert.equal(records[0].data.staleReason, "DELETE_FIELD");
});

test("un meme telephone avec un autre ID CoachRx bloque la fusion", () => {
  const existingById = new Map([["existing", activeClient({ sourceClientId: "old-source-id" })]]);
  const records = h.buildClientRecords({
    coach: marc,
    browserRows: h.rowsFromValues([
      ["Client", "Coach ID", "Client ID", "Phone"],
      ["Client Revenu", "15935", "new-source-id", "5145550101"]
    ]),
    existingById
  });

  assert.equal(records.length, 0);
  assert.equal(records.__diagnostics.ownership.needsReview, 1);
  assert.equal(records.__diagnostics.coachRxPortfolio.needsValidation, 1);
});

test("un sourceClientId duplique ou hors coach est fail-closed", () => {
  const duplicateSource = new Map([
    ["first", activeClient({ phoneNormalized: "5145550101", clientPhoneNormalized: "5145550101" })],
    ["second", activeClient({ phoneNormalized: "5145550102", clientPhoneNormalized: "5145550102" })]
  ]);
  const duplicateRecords = h.buildClientRecords({
    coach: marc,
    browserRows: h.rowsFromValues([
      ["Client", "Coach ID", "Client ID", "Phone"],
      ["Client Revenu", "15935", "coachrx-current-returned", "5145550199"]
    ]),
    existingById: duplicateSource
  });
  const wrongCoach = new Map([
    ["wrong", activeClient({ coachId: "15928" })],
    ["blank", activeClient({ coachId: "" })]
  ]);
  const scopedIndex = h.createClientMatchIndex(wrongCoach, {
    coachId: "15935",
    includeImportStale: true,
    requireUnique: true
  });

  assert.equal(duplicateRecords.length, 0);
  assert.equal(duplicateRecords.__diagnostics.ownership.needsReview, 1);
  assert.equal(h.findClientMatch(scopedIndex, {
    phoneNormalized: "5145550101",
    sourceClientId: "coachrx-current-returned",
    sourceSystem: "coachrx",
    preferSource: true
  }), null);
});

test("import_stale est indexe seulement pour le writer de roster", () => {
  const stale = activeClient({ status: "import_stale", sourceStale: true });
  const existing = new Map([["stale-id", stale]]);
  const operational = h.createClientMatchIndex(existing);
  const importOnly = h.createClientMatchIndex(existing, { includeImportStale: true });
  const identity = {
    phoneNormalized: "5145550101",
    sourceClientId: "coachrx-current-returned",
    sourceSystem: "coachrx",
    preferSource: true
  };

  assert.equal(h.clientRecordAvailableForMatching(stale), false);
  assert.equal(h.findClientMatch(operational, identity), null);
  assert.equal(h.findClientMatch(importOnly, identity).id, "stale-id");
  assert.equal((source.match(/includeImportStale: true/g) || []).length, 1);
});

test("les enrichissements gardent l'ambiguite fail-closed", () => {
  const duplicatePhone = new Map([
    ["first", activeClient({ sourceClientId: "one" })],
    ["second", activeClient({ sourceClientId: "two", name: "Autre homonyme" })]
  ]);
  const index = h.createClientMatchIndex(duplicatePhone, { requireUnique: true });
  const match = h.findClientMatch(index, {
    phoneNormalized: "5145550101",
    sourceClientId: "",
    sourceSystem: "coachrx"
  });
  assert.equal(match.ambiguous, true);
  assert.equal(match.id, undefined);
});

test("les enrichissements directs d'un coach ne peuvent pas toucher un autre portefeuille", () => {
  const existingById = new Map([
    ["marc-client", activeClient()],
    ["other-client", activeClient({
      coachId: "15928",
      coachRxId: "15928",
      coachName: "Autre coach",
      sourceClientId: "other-source-id",
      phoneNormalized: "5145550202",
      clientPhoneNormalized: "5145550202"
    })]
  ]);
  const wrongCoachRows = h.rowsFromValues([
    ["Client", "Client ID", "Phone", "Email"],
    ["Client autre coach", "other-source-id", "5145550202", "other@example.test"]
  ]);

  assert.equal(h.buildGhlContactEnrichmentRecords({
    coach: marc,
    rows: wrongCoachRows,
    existingById
  }).length, 0);
  assert.equal(h.buildClientEnrichmentRecords({
    coach: marc,
    rows: wrongCoachRows,
    existingById
  }).length, 0);
  assert.equal(h.buildClientEnrichmentRecords({
    coachId: "15935",
    rows: wrongCoachRows,
    existingById
  }).length, 0);
});

test("la revision questionnaire globale est desactivee pour un sync coach-only", () => {
  const rows = h.rowsFromValues([
    ["questionnaire_routing_status", "Client"],
    ["matched", "Client lie"],
    ["unmatched", "Client a valider"]
  ]);

  assert.equal(h.questionnaireReviewRowsForScope(rows, "15935").length, 0);
  assert.equal(h.questionnaireReviewRowsForScope(rows, "").length, 1);
});

test("les fiches manuelles sont liees sans perdre leurs champs et les contrats canoniques sont bloques", () => {
  ["firebase_app_manual", "manual", "dashboard_manual"].forEach((manualSource, index) => {
    const phone = `51455502${String(index).padStart(2, "0")}`;
    const existingById = new Map([[`manual-${index}`, activeClient({
      name: `Client Manuel ${index}`,
      source: manualSource,
      sourceClientId: "",
      phoneNormalized: phone,
      clientPhoneNormalized: phone,
      manualNote: "a conserver"
    })]]);
    const records = h.buildClientRecords({
      coach: marc,
      browserRows: h.rowsFromValues([
        ["Client", "Coach ID", "Client ID", "Phone"],
        [`Client Manuel ${index}`, "15935", `coachrx-manual-${index}`, phone]
      ]),
      existingById
    });
    assert.equal(records.length, 1);
    assert.equal(records[0].id, `manual-${index}`);
    assert.equal(records[0].data.linkedFromManual, true);
    assert.equal(records[0].data.manualNote, "a conserver");
  });

  const canonical = new Map([["canonical", activeClient({
    contractVersion: 1,
    internalClientId: "canonical-client",
    originSystem: "dashboard_manual",
    coachRxLink: { sourceClientId: "coachrx-current-returned", linkStatus: "verified" }
  })]]);
  const canonicalRecords = h.buildClientRecords({
    coach: marc,
    browserRows: h.rowsFromValues([
      ["Client", "Coach ID", "Client ID", "Phone"],
      ["Client Revenu", "15935", "coachrx-current-returned", "5145550101"]
    ]),
    existingById: canonical
  });
  assert.equal(canonicalRecords.length, 0);
  assert.equal(canonicalRecords.__diagnostics.ownership.needsReview, 1);
});

test("le nettoyage stale exige le coachId exact et preserve manuel/canonique", () => {
  const snap = {
    forEach(callback) {
      [
        { id: "eligible", data: () => activeClient() },
        { id: "other-coach", data: () => activeClient({ coachId: "15928", coachName: "Marc-Andre Menard" }) },
        { id: "manual", data: () => activeClient({ source: "firebase_app_manual" }) },
        { id: "linked", data: () => activeClient({ linkedFromManual: true }) },
        { id: "canonical", data: () => activeClient({ contractVersion: 1, internalClientId: "canonical-1", originSystem: "coachrx_import" }) }
      ].forEach(callback);
    }
  };
  const stale = h.collectStaleImportedDocs({
    snap,
    currentIds: new Set(),
    coachId: "15935",
    protectedSources: new Set(["firebase_app_manual", "manual", "dashboard_manual"])
  });

  assert.deepEqual(Array.from(stale, (record) => record.id), ["eligible"]);
  assert.deepEqual(Array.from(h.collectStaleImportedDocs({ snap, currentIds: new Set() })), []);

  const map = new Map([
    ["eligible", activeClient({ source: "direct_coachrx_extension" })],
    ["other", activeClient({ coachId: "15928", source: "direct_coachrx_extension" })]
  ]);
  const args = {
    existingById: map,
    currentIds: new Set(),
    candidateSources: new Set(["direct_coachrx_extension"])
  };
  assert.deepEqual(Array.from(h.collectStaleImportedMapDocs(args)), []);
  assert.deepEqual(
    Array.from(h.collectStaleImportedMapDocs({ ...args, coachId: "15935" }), (record) => record.id),
    ["eligible"]
  );
});

test("le rapprochement legacy est etroit et exige un homonyme courant unique", () => {
  const current = [{ id: "current", data: activeClient() }];
  const snap = {
    forEach(callback) {
      [
        { id: "legacy", data: () => activeClient({ sourceClientId: "", sourceStale: true, staleAt: "old" }) },
        { id: "manual-legacy", data: () => activeClient({ sourceClientId: "", sourceStale: true, staleAt: "old", linkedFromManual: true }) },
        { id: "other", data: () => activeClient({ coachId: "15928", sourceClientId: "", sourceStale: true, staleAt: "old" }) }
      ].forEach(callback);
    }
  };
  assert.deepEqual(
    Array.from(h.collectVerifiedLegacyCoachRxDuplicateDocs({ snap, currentRecords: current, coachId: "15935" }), (record) => record.id),
    ["legacy"]
  );
});

test("les taches TASKS_Current sont idempotentes et les collisions explicites sont retirees", () => {
  const clients = [{ id: "client-1", data: activeClient({ name: "Client Exemple", sourceClientId: "client-1" }) }];
  const baselineRows = h.rowsFromValues([
    ["Coach ID", "Client ID", "Client", "Task ID", "Type", "Title", "Description", "Priority", "Due"],
    ["15935", "client-1", "Client Exemple", "event-1", "validation", "Confirmer le statut", "Premier texte", "P2", "2026-07-21"]
  ]);
  const first = h.buildTaskRecords({ coach: marc, taskRows: baselineRows, clients, browserRows: [], existingById: new Map() });
  const existing = new Map(first.map((record) => [record.id, { ...record.data, status: "done", completedAt: "closed" }]));
  const changedRows = h.rowsFromValues([
    ["Coach ID", "Client ID", "Client", "Task ID", "Type", "Title", "Description", "Priority", "Due"],
    ["15935", "client-1", "Client Exemple", "event-1", "validation", "Confirmer le statut", "Texte modifie", "P1", "2026-07-25"]
  ]);
  const second = h.buildTaskRecords({ coach: marc, taskRows: changedRows, clients, browserRows: [], existingById: existing });
  const collisionRows = h.rowsFromValues([
    ["Coach ID", "Client ID", "Client", "Task ID", "Type", "Title", "Description"],
    ["15935", "client-1", "Client Exemple", "collision", "validation", "Confirmer", "A"],
    ["15935", "client-1", "Client Exemple", "collision", "validation", "Confirmer", "B"]
  ]);
  const collision = h.buildTaskRecords({ coach: marc, taskRows: collisionRows, clients, browserRows: [], existingById: new Map() });

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(second[0].id, first[0].id);
  assert.equal(second[0].data.status, "done");
  assert.equal(collision.length, 0);
  assert.equal(collision.__diagnostics.currentIdentityCollisions, 1);
});

test("le retour d'une tache stale efface les metadonnees terminales au merge Firestore", () => {
  const clients = [{ id: "client-1", data: activeClient({ name: "Client Exemple", sourceClientId: "client-1" }) }];
  const rows = h.rowsFromValues([
    ["Coach ID", "Client ID", "Client", "Task ID", "Type", "Title"],
    ["15935", "client-1", "Client Exemple", "event-returned", "validation", "Confirmer le statut"]
  ]);
  const initial = h.buildTaskRecords({ coach: marc, taskRows: rows, clients, browserRows: [], existingById: new Map() })[0];
  const existingById = new Map([[initial.id, {
    ...initial.data,
    status: "archived",
    sourceStale: true,
    completedAt: "old-completed-at",
    completedBy: "old-completed-by",
    ignoredAt: "old-ignored-at",
    ignoredBy: "old-ignored-by",
    archivedAt: "old-archived-at",
    archivedBy: "old-archived-by"
  }]]);
  const returned = h.buildTaskRecords({ coach: marc, taskRows: rows, clients, browserRows: [], existingById })[0];

  assert.equal(returned.id, initial.id);
  assert.equal(returned.data.status, "open");
  ["completedAt", "completedBy", "ignoredAt", "ignoredBy", "archivedAt", "archivedBy"].forEach((field) => {
    assert.equal(returned.data[field], "DELETE_FIELD");
  });
});

test("une tache stale terminale conserve son cycle de vie", () => {
  const done = h.buildStaleImportedTaskPatch({ status: "done" });
  const open = h.buildStaleImportedTaskPatch({ status: "open" });
  assert.equal(done.status, "done");
  assert.equal(Object.hasOwn(done, "archivedAt"), false);
  assert.equal(open.status, "archived");
  assert.equal(open.archivedAt, "SERVER_TIMESTAMP");
});

test("un Coach ID explicite contradictoire gagne sur le nom du coach", () => {
  const row = h.rowsFromValues([
    ["Coach ID", "Coach"],
    ["15928", "Marc-Andre Menard"]
  ])[0];
  const iheb = { id: "15928", coachRxId: "15928", name: "Iheb Yahyaoui", aliases: ["Iheb"] };
  assert.equal(h.taskRowBelongsToCoach(row, marc), false);
  assert.equal(h.taskRowBelongsToCoach(row, iheb), true);
});

test("un roster non verifie ne peut ecrire aucun client, tache ou stale", async () => {
  fixtures.clear();
  writes.length = 0;
  fixtures.set("clients", [{ id: "existing-client", data: activeClient() }]);
  fixtures.set("tasks", [{
    id: "existing-task",
    data: { coachId: "15935", coachName: marc.name, source: "google_sheets_tasks_current", type: "validation", clientId: "", clientName: "", status: "open" }
  }]);
  const result = await h.syncCoachFromRows({
    coach: marc,
    coreRows: [],
    taskRows: h.rowsFromValues([
      ["Coach ID", "Client", "Type", "Title"],
      ["15935", "Client Revenu", "validation", "Confirmer"]
    ]),
    browserRows: h.rowsFromValues([
      ["Client", "Coach ID", "Client ID", "Phone"],
      ["Client Revenu", "15935", "coachrx-current-returned", "5145550101"]
    ]),
    coachDirectory: [marc],
    coachRxRosterState: { globallyVerified: false, verified: false }
  });

  assert.equal(result.clientsImported, 0);
  assert.equal(result.tasksImported, 0);
  assert.equal(result.diagnostics.coachRxRoster.clientSyncEnabled, false);
  assert.equal(writes.filter((write) => ["clients", "tasks", "batch"].includes(write.collectionName)).length, 0);
});

test("une collision TASKS_Current bloque le nettoyage generique", async () => {
  fixtures.clear();
  writes.length = 0;
  fixtures.set("clients", [{ id: "existing-client", data: activeClient({ sourceClientId: "client-1" }) }]);
  fixtures.set("tasks", [{
    id: "old-linked-task",
    data: {
      coachId: "15935",
      coachName: marc.name,
      source: "google_sheets_tasks_current",
      sourceType: "tasks_current",
      type: "validation",
      clientId: "existing-client",
      clientName: "Client Revenu",
      status: "open"
    }
  }]);
  const result = await h.syncCoachFromRows({
    coach: marc,
    coreRows: [],
    taskRows: h.rowsFromValues([
      ["Coach ID", "Client ID", "Client", "Task ID", "Type", "Title", "Description"],
      ["15935", "client-1", "Client Revenu", "collision", "validation", "Confirmer", "A"],
      ["15935", "client-1", "Client Revenu", "collision", "validation", "Confirmer", "B"]
    ]),
    browserRows: h.rowsFromValues([
      ["Client", "Coach ID", "Client ID", "Phone"],
      ["Client Revenu", "15935", "client-1", "5145550101"]
    ]),
    coachDirectory: [marc],
    coachRxRosterState: { globallyVerified: true, verified: true }
  });

  assert.equal(result.tasksImported, 0);
  assert.equal(result.diagnostics.staleCleanup.tasksCleanupBlocked, true);
  assert.equal(result.diagnostics.staleCleanup.tasksArchivedStale, 0);
  assert.deepEqual(Array.from(result.diagnostics.staleCleanup.tasksCleanupBlockReasons), ["task_source_identity_collision"]);
});

test("des doublons historiques de tache bloquent ecriture et nettoyage sans choisir la terminale", async () => {
  fixtures.clear();
  writes.length = 0;
  fixtures.set("clients", [{ id: "existing-client", data: activeClient({ sourceClientId: "client-1" }) }]);
  fixtures.set("tasks", [
    {
      id: "legacy-open",
      data: {
        coachId: "15935",
        coachName: marc.name,
        source: "google_sheets_tasks_current",
        sourceType: "tasks_current",
        type: "validation",
        clientId: "existing-client",
        clientName: "Client Revenu",
        title: "Ancien titre ouvert",
        description: "Ancien contenu ouvert",
        status: "open"
      }
    },
    {
      id: "legacy-done",
      data: {
        coachId: "15935",
        coachName: marc.name,
        source: "google_sheets_tasks_current",
        sourceType: "tasks_current",
        type: "validation",
        clientId: "existing-client",
        clientName: "Client Revenu",
        title: "Ancien titre ferme",
        description: "Ancien contenu ferme",
        status: "done",
        completedAt: "closed"
      }
    }
  ]);
  const result = await h.syncCoachFromRows({
    coach: marc,
    coreRows: [],
    taskRows: h.rowsFromValues([
      ["Coach ID", "Client ID", "Client", "Type", "Title", "Description"],
      ["15935", "client-1", "Client Revenu", "validation", "Titre courant", "Contenu courant"]
    ]),
    browserRows: h.rowsFromValues([
      ["Client", "Coach ID", "Client ID", "Phone"],
      ["Client Revenu", "15935", "client-1", "5145550101"]
    ]),
    coachDirectory: [marc],
    coachRxRosterState: { globallyVerified: true, verified: true }
  });

  assert.equal(result.tasksImported, 0);
  assert.equal(result.diagnostics.importedTasks.existingDuplicateCandidates, 1);
  assert.equal(result.diagnostics.staleCleanup.tasksCleanupBlocked, true);
  assert.equal(result.diagnostics.staleCleanup.tasksArchivedStale, 0);
  assert.deepEqual(Array.from(result.diagnostics.staleCleanup.tasksCleanupBlockReasons), ["existing_task_identity_collision"]);
  assert.equal(writes.some((write) => ["legacy-open", "legacy-done"].includes(write.id)), false);
});

test("les writers de statut creent deux pipelines sans ecrasement portefeuille", async () => {
  writes.length = 0;
  const request = { auth: { uid: "admin", token: { email: "admin@example.test" } } };
  await h.writeCoachSyncStatus({
    result: { coachId: "15935", coachName: marc.name, clientsImported: 20, tasksImported: 23 },
    request,
    source: "firebase_firestore_sync_request_coach",
    triggeredBy: "manual"
  });
  await h.writeCoachSyncStatus({
    result: { coachId: "15935", coachName: marc.name, clientsImported: 0, tasksImported: 0, questionnaireResponsesImported: 4 },
    request,
    source: "firebase_function_questionnaire_response_sync_scheduled",
    triggeredBy: "scheduler"
  });

  const topLevel = writes.filter((write) => write.collectionName === "coachSyncStatus");
  const pipelineWrites = writes.filter((write) => write.collectionName === "coachSyncStatus/15935/pipelines");
  assert.equal(topLevel.length, 2);
  assert.equal(topLevel[0].data.clientsImported, 20);
  assert.equal(topLevel[0].data.tasksImported, 23);
  assert.equal(Object.hasOwn(topLevel[1].data, "clientsImported"), false);
  assert.equal(Object.hasOwn(topLevel[1].data, "tasksImported"), false);
  assert.equal(Object.hasOwn(topLevel[1].data, "syncedAt"), false);
  assert.deepEqual(Array.from(pipelineWrites, (write) => write.id).sort(), ["dashboard_full", "questionnaire"]);
});

test("le canari est lie a la release, au document deterministe et a K_REVISION", () => {
  const releaseKey = "0123456789abcdef01234567";
  const revision = "processsyncrequest-00042-abc";
  const payload = {
    coachId: "15935",
    scope: "coach",
    source: "codex_postdeploy_canary",
    releaseKey,
    expectedProcessRevision: revision
  };
  const requestId = `dashboard_canary_15935_${releaseKey}`;
  const valid = h.validateSyncRequestCanaryBinding({ requestId, payload, executedRevision: revision });

  assert.equal(valid.isCanary, true);
  assert.equal(valid.ok, true);
  assert.equal(valid.releaseKey, releaseKey);
  assert.equal(valid.expectedProcessRevision, revision);
  assert.equal(valid.executedRevision, revision);
  assert.equal(h.validateSyncRequestCanaryBinding({
    requestId,
    payload,
    executedRevision: "processsyncrequest-00043-def"
  }).code, "canary_revision_mismatch");
  assert.equal(h.validateSyncRequestCanaryBinding({
    requestId: "dashboard_canary_15935_wrong",
    payload,
    executedRevision: revision
  }).code, "canary_request_identity_invalid");
  assert.equal(h.validateSyncRequestCanaryBinding({
    requestId: "legacy-request",
    payload: { source: "apps_script_firestore_queue" },
    executedRevision: revision
  }).isCanary, false);
});

test("une demande syncRequests ne peut etre reclamee transactionnellement qu'une fois", async () => {
  fixtures.clear();
  writes.length = 0;
  fixtures.set("syncRequests", [{
    id: "legacy-queued",
    data: {
      status: "queued",
      requestType: "source_import",
      source: "apps_script_firestore_queue",
      records: [{ id: "one" }]
    }
  }]);
  const requestRef = dbMock.collection("syncRequests").doc("legacy-queued");
  const first = await h.claimSyncRequestExecution({
    requestRef,
    requestId: "legacy-queued",
    processingEventId: "event-one",
    executedRevision: "processsyncrequest-00042-abc"
  });
  const second = await h.claimSyncRequestExecution({
    requestRef,
    requestId: "legacy-queued",
    processingEventId: "event-one-duplicate",
    executedRevision: "processsyncrequest-00042-abc"
  });

  assert.equal(first.claimed, true);
  assert.equal(first.payload.requestType, "source_import");
  assert.equal(second.claimed, false);
  assert.equal(second.reason, "request_already_claimed");
  const claimWrites = writes.filter((write) => write.collectionName === "syncRequests");
  assert.equal(claimWrites.length, 1);
  assert.equal(claimWrites[0].transaction, true);
  assert.equal(claimWrites[0].data.status, "running");
  assert.equal(claimWrites[0].data.stage, "source_import_claimed");
  assert.equal(claimWrites[0].data.executionPhase, "claimed");
  assert.equal(claimWrites[0].data.processingEventId, "event-one");
  assert.equal(claimWrites[0].data.executedRevision, "processsyncrequest-00042-abc");
  assert.equal(claimWrites[0].data.sourceImportRunId, h.deterministicSourceImportRunId("legacy-queued"));
  assert.equal(claimWrites[0].data.claimExpiresAt.toMillis() - Date.now() > 300000, true);
});

test("business_started exige le claim exact et false bloque tout metier", async () => {
  fixtures.clear();
  writes.length = 0;
  fixtures.set("syncRequests", [{
    id: "business-gate",
    data: {
      status: "running",
      executionPhase: "claimed",
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      processingEventId: "winning-event",
      executedRevision: "processsyncrequest-00042-abc"
    }
  }]);
  const requestRef = dbMock.collection("syncRequests").doc("business-gate");
  const rejected = await h.markSyncRequestBusinessStarted({
    requestRef,
    processingEventId: "losing-event",
    executedRevision: "processsyncrequest-00042-abc"
  });
  assert.equal(rejected, false);
  assert.equal(writes.length, 0);

  const accepted = await h.markSyncRequestBusinessStarted({
    requestRef,
    processingEventId: "winning-event",
    executedRevision: "processsyncrequest-00042-abc"
  });
  assert.equal(accepted, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.executionPhase, "business_started");
  assert.equal(writes[0].data.businessStartedAt, "SERVER_TIMESTAMP");
  assert.equal((source.match(/if \(!businessStarted\) return;/g) || []).length, 2);
});

test("un canari sur la mauvaise revision est termine en erreur avant execution", async () => {
  fixtures.clear();
  writes.length = 0;
  const releaseKey = "abcdef0123456789abcdef01";
  fixtures.set("syncRequests", [{
    id: `dashboard_canary_15935_${releaseKey}`,
    data: {
      coachId: "15935",
      scope: "coach",
      status: "queued",
      source: "codex_postdeploy_canary",
      releaseKey,
      expectedProcessRevision: "processsyncrequest-00042-abc"
    }
  }]);
  const requestId = `dashboard_canary_15935_${releaseKey}`;
  const rejected = await h.claimSyncRequestExecution({
    requestRef: dbMock.collection("syncRequests").doc(requestId),
    requestId,
    processingEventId: "event-canary",
    executedRevision: "processsyncrequest-00043-def"
  });

  assert.equal(rejected.claimed, false);
  assert.equal(rejected.rejected, true);
  assert.equal(rejected.reason, "canary_revision_mismatch");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.status, "error");
  assert.equal(writes[0].data.stage, "execution_claim_rejected");
  assert.equal(writes[0].data.processingEventId, "event-canary");
  assert.equal(writes[0].data.executedRevision, "processsyncrequest-00043-def");
});

test("une livraison tardive ne reecrit jamais un canari deja terminal", async () => {
  fixtures.clear();
  writes.length = 0;
  const releaseKey = "fedcba9876543210fedcba98";
  const requestId = `dashboard_canary_15935_${releaseKey}`;
  fixtures.set("syncRequests", [{
    id: requestId,
    data: {
      coachId: "15935",
      scope: "coach",
      status: "done",
      source: "codex_postdeploy_canary",
      releaseKey,
      expectedProcessRevision: "processsyncrequest-00041-old",
      executedRevision: "processsyncrequest-00041-old",
      processingEventId: "original-event"
    }
  }]);
  const duplicate = await h.claimSyncRequestExecution({
    requestRef: dbMock.collection("syncRequests").doc(requestId),
    requestId,
    processingEventId: "late-event",
    executedRevision: "processsyncrequest-00042-new"
  });

  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.reason, "request_terminal");
  assert.equal(writes.length, 0);
});

test("le bail de claim depasse le timeout Functions avec une marge explicite", () => {
  assert.equal(h.PROCESS_SYNC_REQUEST_TIMEOUT_SECONDS, 300);
  assert.equal(h.SYNC_REQUEST_CLAIM_TTL_MS > (h.PROCESS_SYNC_REQUEST_TIMEOUT_SECONDS * 1000) + 60000, true);
});

test("un crash apres claim expire est abandonne avant tout appel metier", async () => {
  fixtures.clear();
  writes.length = 0;
  const requestId = "crash-after-claim";
  fixtures.set("syncRequests", [{
    id: requestId,
    data: {
      status: "running",
      scope: "coach",
      coachId: "15935",
      executionPhase: "claimed",
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      processingEventId: "original-event",
      executedRevision: "processsyncrequest-00042-abc",
      claimExpiresAt: "2026-07-20T10:00:00.000Z"
    }
  }]);

  const result = await h.reconcileClaimedSyncRequest({
    requestRef: dbMock.collection("syncRequests").doc(requestId),
    requestId,
    nowMs: Date.parse("2026-07-20T10:01:00.000Z")
  });

  assert.equal(result.action, "abandoned_before_business");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].collectionName, "syncRequests");
  assert.equal(writes[0].data.status, "error");
  assert.equal(writes[0].data.stage, "abandoned_before_business");
  assert.equal(writes[0].data.executionPhase, "terminal");
  assert.equal(writes.some((write) => ["clients", "tasks", "syncRuns"].includes(write.collectionName)), false);
});

test("un doublon concurrent avant expiration reste un no-op absolu", async () => {
  fixtures.clear();
  writes.length = 0;
  const requestId = "concurrent-duplicate";
  fixtures.set("syncRequests", [{
    id: requestId,
    data: {
      status: "running",
      scope: "coach",
      coachId: "15935",
      executionPhase: "claimed",
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      processingEventId: "original-event",
      executedRevision: "processsyncrequest-00042-abc",
      claimExpiresAt: new Date(Date.now() + 120000).toISOString()
    }
  }]);

  await processSyncRequestHandler({ params: { requestId }, id: "duplicate-event" });

  assert.equal(writes.length, 0);
  assert.equal(snapshotFor("syncRequests", requestId).data().executionPhase, "claimed");
});

test("un ledger sheets done terminalise la request sans second appel metier", async () => {
  fixtures.clear();
  writes.length = 0;
  const releaseKey = "1234567890abcdef12345678";
  const requestId = `dashboard_canary_15935_${releaseKey}`;
  const processingEventId = "original-canary-event";
  const revision = "processsyncrequest-00042-abc";
  fixtures.set("syncRequests", [{
    id: requestId,
    data: {
      status: "running",
      scope: "coach",
      coachId: "15935",
      source: "codex_postdeploy_canary",
      releaseKey,
      expectedProcessRevision: revision,
      executedRevision: revision,
      processingEventId,
      executionPhase: "business_started",
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      claimExpiresAt: new Date(Date.now() + 120000).toISOString()
    }
  }]);
  fixtures.set("syncRuns", [{
    id: h.deterministicDashboardSyncRunId(requestId),
    data: {
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      status: "done",
      stage: "completed",
      syncRequestId: requestId,
      processingEventId,
      executedRevision: revision,
      expectedProcessRevision: revision,
      releaseKey,
      resultCoachIds: ["15935"],
      resultSummary: { coaches: 1, clientsImported: 20, clientsMissingPhone: 1, tasksImported: 19, warnings: 1 }
    }
  }]);

  await processSyncRequestHandler({ params: { requestId }, id: "late-delivery" });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].collectionName, "syncRequests");
  assert.equal(writes[0].data.status, "done");
  assert.equal(writes[0].data.stage, "completed");
  assert.equal(writes[0].data.executionPhase, "terminal");
  assert.equal(writes[0].data.resultSummary.clientsImported, 20);
  assert.equal(writes.some((write) => write.collectionName !== "syncRequests"), false);
});

test("un ledger sheets error terminalise seulement la request", async () => {
  fixtures.clear();
  writes.length = 0;
  const requestId = "sheets-ledger-error";
  const processingEventId = "original-error-event";
  const revision = "processsyncrequest-00042-abc";
  fixtures.set("syncRequests", [{
    id: requestId,
    data: {
      status: "running",
      scope: "coach",
      coachId: "15935",
      executedRevision: revision,
      processingEventId,
      executionPhase: "business_started",
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      claimExpiresAt: new Date(Date.now() + 120000).toISOString()
    }
  }]);
  fixtures.set("syncRuns", [{
    id: h.deterministicDashboardSyncRunId(requestId),
    data: {
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      status: "error",
      stage: "read_dashboard_tabs",
      syncRequestId: requestId,
      processingEventId,
      executedRevision: revision,
      errorMessage: "offline ledger failure"
    }
  }]);

  const result = await h.reconcileClaimedSyncRequest({
    requestRef: dbMock.collection("syncRequests").doc(requestId),
    requestId
  });

  assert.equal(result.action, "terminalized_error");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].collectionName, "syncRequests");
  assert.equal(writes[0].data.status, "error");
  assert.equal(writes[0].data.stage, "failed");
  assert.equal(writes[0].data.executionPhase, "terminal");
});

test("un ledger terminal legacy sans contrat ne prouve jamais la fin de la request v1", async () => {
  fixtures.clear();
  writes.length = 0;
  const requestId = "legacy-terminal-ledger";
  const processingEventId = "legacy-ledger-event";
  const revision = "processsyncrequest-00042-abc";
  const nowMs = Date.parse("2026-07-20T12:00:00.000Z");
  fixtures.set("syncRequests", [{
    id: requestId,
    data: {
      status: "running",
      executionPhase: "business_started",
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      processingEventId,
      executedRevision: revision,
      claimExpiresAt: "2026-07-20T12:01:00.000Z"
    }
  }]);
  fixtures.set("syncRuns", [{
    id: h.deterministicDashboardSyncRunId(requestId),
    data: {
      status: "done",
      syncRequestId: requestId,
      processingEventId,
      executedRevision: revision,
      resultSummary: { clientsImported: 999 }
    }
  }]);

  const beforeExpiry = await h.reconcileClaimedSyncRequest({
    requestRef: dbMock.collection("syncRequests").doc(requestId),
    requestId,
    nowMs
  });
  assert.equal(beforeExpiry.action, "claim_still_active");
  assert.equal(writes.length, 0);

  mergeFixture("syncRequests", requestId, { claimExpiresAt: "2026-07-20T11:59:00.000Z" }, true);
  const afterExpiry = await h.reconcileClaimedSyncRequest({
    requestRef: dbMock.collection("syncRequests").doc(requestId),
    requestId,
    nowMs
  });
  assert.equal(afterExpiry.action, "execution_uncertain");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.status, "error");
  assert.equal(writes[0].data.stage, "execution_uncertain");
  assert.equal(writes[0].data.recoveryLedgerStatus, "binding_mismatch");
  assert.notEqual(writes[0].data.status, "done");
});

test("un ledger v1 terminal est refuse tant que la request est encore claimed", async () => {
  fixtures.clear();
  writes.length = 0;
  const requestId = "claimed-with-terminal-ledger";
  const processingEventId = "claimed-ledger-event";
  const revision = "processsyncrequest-00042-abc";
  const nowMs = Date.parse("2026-07-20T12:00:00.000Z");
  fixtures.set("syncRequests", [{
    id: requestId,
    data: {
      status: "running",
      executionPhase: "claimed",
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      processingEventId,
      executedRevision: revision,
      claimExpiresAt: "2026-07-20T12:01:00.000Z"
    }
  }]);
  fixtures.set("syncRuns", [{
    id: h.deterministicDashboardSyncRunId(requestId),
    data: {
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      status: "done",
      syncRequestId: requestId,
      processingEventId,
      executedRevision: revision,
      resultSummary: { clientsImported: 999 }
    }
  }]);

  const beforeExpiry = await h.reconcileClaimedSyncRequest({
    requestRef: dbMock.collection("syncRequests").doc(requestId),
    requestId,
    nowMs
  });
  assert.equal(beforeExpiry.action, "claim_still_active");
  assert.equal(writes.length, 0);

  mergeFixture("syncRequests", requestId, { claimExpiresAt: "2026-07-20T11:59:00.000Z" }, true);
  const afterExpiry = await h.reconcileClaimedSyncRequest({
    requestRef: dbMock.collection("syncRequests").doc(requestId),
    requestId,
    nowMs
  });
  assert.equal(afterExpiry.action, "abandoned_before_business");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.status, "error");
  assert.equal(writes[0].data.stage, "abandoned_before_business");
  assert.notEqual(writes[0].data.status, "done");
});

test("un crash apres business_started et ecriture partielle devient uncertain sans replay", async () => {
  fixtures.clear();
  writes.length = 0;
  const requestId = "partial-business-crash";
  const processingEventId = "partial-original-event";
  const revision = "processsyncrequest-00042-abc";
  fixtures.set("syncRequests", [{
    id: requestId,
    data: {
      status: "running",
      scope: "coach",
      coachId: "15935",
      executedRevision: revision,
      processingEventId,
      executionPhase: "business_started",
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      claimExpiresAt: new Date(Date.now() - 120000).toISOString()
    }
  }]);
  fixtures.set("syncRuns", [{
    id: h.deterministicDashboardSyncRunId(requestId),
    data: {
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      status: "running",
      stage: "sync_coach",
      syncRequestId: requestId,
      processingEventId,
      executedRevision: revision,
      partialWriteCount: 1
    }
  }]);

  await processSyncRequestHandler({ params: { requestId }, id: "retry-after-timeout" });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].collectionName, "syncRequests");
  assert.equal(writes[0].data.status, "error");
  assert.equal(writes[0].data.stage, "execution_uncertain");
  assert.equal(writes[0].data.recoveryLedgerStatus, "running");
  assert.equal(writes.some((write) => ["clients", "tasks", "syncRuns"].includes(write.collectionName)), false);
});

test("un source_import fini dans son ledger deterministe ne rejoue jamais l'import", async () => {
  fixtures.clear();
  writes.length = 0;
  const requestId = "source-import-crash-after-ledger";
  const processingEventId = "source-import-event";
  const revision = "processsyncrequest-00042-abc";
  const sourceImportRunId = h.deterministicSourceImportRunId(requestId);
  fixtures.set("syncRequests", [{
    id: requestId,
    data: {
      status: "running",
      requestType: "source_import",
      sourceType: "questionnaire_responses",
      sourceImportRunId,
      executedRevision: revision,
      processingEventId,
      executionPhase: "business_started",
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      claimExpiresAt: new Date(Date.now() + 120000).toISOString()
    }
  }]);
  fixtures.set("sourceImportRuns", [{
    id: sourceImportRunId,
    data: {
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      status: "done",
      stage: "source_import_completed",
      syncRequestId: requestId,
      processingEventId,
      executedRevision: revision,
      sourceType: "questionnaire_responses",
      recordsReceived: 1,
      recordsWritten: 1,
      coachId: "15935"
    }
  }]);

  await processSyncRequestHandler({ params: { requestId }, id: "source-import-duplicate" });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].collectionName, "syncRequests");
  assert.equal(writes[0].data.status, "done");
  assert.equal(writes[0].data.stage, "source_import_completed");
  assert.equal(writes[0].data.sourceImportRunId, sourceImportRunId);
  assert.equal(writes[0].data.resultSummary.recordsWritten, 1);
  assert.equal(writes.some((write) => write.collectionName !== "syncRequests"), false);
});

test("le reaper syncRequests traite un lot mixte expire sans toucher le futur", async () => {
  fixtures.clear();
  writes.length = 0;
  queryLog.length = 0;
  queryFailures.clear();
  const nowMs = Date.parse("2026-07-20T12:00:00.000Z");
  const expired = "2026-07-20T11:59:00.000Z";
  const future = "2026-07-20T12:01:00.000Z";
  const revision = "processsyncrequest-00042-abc";
  const request = (id, phase, processingEventId, claimExpiresAt) => ({
    id,
    data: {
      status: "running",
      scope: "coach",
      coachId: "15935",
      executionPhase: phase,
      executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
      processingEventId,
      executedRevision: revision,
      claimExpiresAt
    }
  });
  fixtures.set("syncRequests", [
    request("reap-done", "business_started", "event-done", expired),
    request("reap-error", "business_started", "event-error", expired),
    request("reap-partial", "business_started", "event-partial", expired),
    request("reap-absent", "claimed", "event-absent", expired),
    request("reap-future", "claimed", "event-future", future)
  ]);
  fixtures.set("syncRuns", [
    {
      id: h.deterministicDashboardSyncRunId("reap-done"),
      data: {
        executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
        status: "done",
        syncRequestId: "reap-done",
        processingEventId: "event-done",
        executedRevision: revision,
        resultCoachIds: ["15935"],
        resultSummary: { coaches: 1, clientsImported: 20, clientsMissingPhone: 1, tasksImported: 19, warnings: 1 }
      }
    },
    {
      id: h.deterministicDashboardSyncRunId("reap-error"),
      data: {
        executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
        status: "error",
        syncRequestId: "reap-error",
        processingEventId: "event-error",
        executedRevision: revision,
        errorMessage: "offline failure"
      }
    },
    {
      id: h.deterministicDashboardSyncRunId("reap-partial"),
      data: {
        executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
        status: "running",
        syncRequestId: "reap-partial",
        processingEventId: "event-partial",
        executedRevision: revision,
        partialWriteCount: 1
      }
    }
  ]);

  const summary = await h.reapExpiredSyncRequestClaims({
    now: adminMock.firestore.Timestamp.fromMillis(nowMs),
    limit: 10
  });

  assert.equal(summary.scanned, 4);
  assert.equal(summary.eligible, 4);
  assert.equal(summary.actions.terminalized_done, 1);
  assert.equal(summary.actions.terminalized_error, 1);
  assert.equal(summary.actions.execution_uncertain, 1);
  assert.equal(summary.actions.abandoned_before_business, 1);
  assert.equal(writes.length, 4);
  assert.equal(writes.every((write) => write.collectionName === "syncRequests"), true);
  assert.equal(writes.every((write) => write.data.claimExpiresAt === "DELETE_FIELD"), true);
  assert.equal(snapshotFor("syncRequests", "reap-future").data().status, "running");
  assert.equal(queryLog.length, 1);
  assert.equal(queryLog[0].collectionName, "syncRequests");
  assert.equal(queryLog[0].field, "claimExpiresAt");
  assert.equal(queryLog[0].operator, "<=");
  assert.equal(queryLog[0].limit, h.EXPIRED_EXECUTION_REAP_LIMIT);
  const secondPass = await h.reapExpiredSyncRequestClaims({
    now: adminMock.firestore.Timestamp.fromMillis(nowMs),
    limit: 10
  });
  assert.equal(secondPass.scanned, 0);
  assert.equal(writes.length, 4);
});

test("le reaper syncRequests ignore un claim legacy expire sans contrat d'execution", async () => {
  fixtures.clear();
  writes.length = 0;
  queryLog.length = 0;
  queryFailures.clear();
  const nowMs = Date.parse("2026-07-20T12:00:00.000Z");
  fixtures.set("syncRequests", [{
    id: "legacy-expired-claim",
    data: {
      status: "running",
      executionPhase: "claimed",
      processingEventId: "legacy-event",
      executedRevision: "processsyncrequest-legacy",
      claimExpiresAt: "2026-07-20T11:59:00.000Z"
    }
  }]);

  const summary = await h.reapExpiredSyncRequestClaims({
    now: adminMock.firestore.Timestamp.fromMillis(nowMs),
    limit: 10
  });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.eligible, 0);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.cleanedSkipped, 1);
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0].data), ["claimExpiresAt"]);
  assert.equal(writes[0].data.claimExpiresAt, "DELETE_FIELD");
  assert.equal(snapshotFor("syncRequests", "legacy-expired-claim").data().status, "running");
  assert.equal(Object.hasOwn(snapshotFor("syncRequests", "legacy-expired-claim").data(), "claimExpiresAt"), false);
});

test("la pagination bornee retire les marqueurs poison et atteint une request v1 au passage suivant", async () => {
  fixtures.clear();
  writes.length = 0;
  queryLog.length = 0;
  queryFailures.clear();
  const nowMs = Date.parse("2026-07-20T12:00:00.000Z");
  const expired = "2026-07-20T11:59:00.000Z";
  const poisonCount = h.EXPIRED_EXECUTION_REAP_SCAN_LIMIT + 1;
  const legacy = Array.from({ length: poisonCount }, (_, index) => ({
    id: `a-legacy-${String(index).padStart(3, "0")}`,
    data: {
      status: "running",
      executionPhase: "claimed",
      processingEventId: `legacy-event-${index}`,
      claimExpiresAt: expired
    }
  }));
  fixtures.set("syncRequests", [
    ...legacy,
    {
      id: "z-v1-expired",
      data: {
        status: "running",
        executionPhase: "claimed",
        executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
        processingEventId: "v1-event",
        executedRevision: "processsyncrequest-00042-abc",
        claimExpiresAt: expired
      }
    }
  ]);

  const firstPass = await h.reapExpiredSyncRequestClaims({
    now: adminMock.firestore.Timestamp.fromMillis(nowMs),
    limit: 10
  });

  assert.equal(firstPass.scanned, h.EXPIRED_EXECUTION_REAP_SCAN_LIMIT);
  assert.equal(firstPass.eligible, 0);
  assert.equal(firstPass.skipped, h.EXPIRED_EXECUTION_REAP_SCAN_LIMIT);
  assert.equal(firstPass.cleanedSkipped, h.EXPIRED_EXECUTION_REAP_SCAN_LIMIT);
  assert.equal(firstPass.pages, h.EXPIRED_EXECUTION_REAP_SCAN_LIMIT / h.EXPIRED_EXECUTION_REAP_LIMIT);
  assert.equal(snapshotFor("syncRequests", "z-v1-expired").data().status, "running");
  assert.equal(queryLog.every((query) => query.limit === h.EXPIRED_EXECUTION_REAP_LIMIT), true);
  assert.equal(queryLog.every((query) => query.orderings.map(({ field }) => field).join(",") === "claimExpiresAt,__name__"), true);

  const secondPass = await h.reapExpiredSyncRequestClaims({
    now: adminMock.firestore.Timestamp.fromMillis(nowMs),
    limit: 10
  });

  assert.equal(secondPass.scanned, 2);
  assert.equal(secondPass.eligible, 1);
  assert.equal(secondPass.skipped, 1);
  assert.equal(secondPass.cleanedSkipped, 1);
  assert.equal(secondPass.actions.abandoned_before_business, 1);
  assert.equal(snapshotFor("syncRequests", "z-v1-expired").data().status, "error");
  assert.equal(legacy.every(({ id }) => snapshotFor("syncRequests", id).data().status === "running"), true);
  assert.equal(legacy.every(({ id }) => !Object.hasOwn(snapshotFor("syncRequests", id).data(), "claimExpiresAt")), true);
  assert.equal(writes.some((write) => ["clients", "tasks", "syncRuns"].includes(write.collectionName)), false);
});

test("le reaper general ferme les ledgers sync, queue et direct expires seulement", async () => {
  fixtures.clear();
  writes.length = 0;
  queryLog.length = 0;
  queryFailures.clear();
  const nowMs = Date.parse("2026-07-20T12:00:00.000Z");
  const expired = "2026-07-20T11:59:00.000Z";
  const future = "2026-07-20T12:01:00.000Z";
  fixtures.set("syncRequests", []);
  fixtures.set("syncRuns", [
    {
      id: "sync-expired",
      data: {
        status: "running",
        executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
        runExpiresAt: expired
      }
    },
    {
      id: "sync-active",
      data: {
        status: "running",
        executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
        runExpiresAt: future
      }
    },
    {
      id: "sync-legacy-expired",
      data: { status: "running", runExpiresAt: expired }
    },
    {
      id: "sync-terminal",
      data: {
        status: "done",
        executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION
      }
    }
  ]);
  fixtures.set("sourceImportRuns", [
    {
      id: "queue-expired",
      data: {
        status: "running",
        importMode: "firestore_sync_request",
        executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
        runExpiresAt: expired
      }
    },
    {
      id: "direct-expired",
      data: {
        status: "running",
        importMode: "direct_cloud_function",
        executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
        runExpiresAt: expired
      }
    },
    {
      id: "direct-active",
      data: {
        status: "running",
        importMode: "direct_cloud_function",
        executionContractVersion: h.EXECUTION_LEDGER_CONTRACT_VERSION,
        runExpiresAt: future
      }
    }
  ]);

  const summary = await h.reapExpiredExecutionState({
    now: adminMock.firestore.Timestamp.fromMillis(nowMs),
    limit: 10
  });

  assert.equal(summary.syncRuns.eligible, 1);
  assert.equal(summary.syncRuns.skipped, 1);
  assert.equal(summary.syncRuns.cleanedSkipped, 1);
  assert.equal(summary.sourceImportRuns.eligible, 2);
  assert.equal(writes.length, 4);
  assert.deepEqual(Array.from(writes, (write) => `${write.collectionName}/${write.id}`).sort(), [
    "sourceImportRuns/direct-expired",
    "sourceImportRuns/queue-expired",
    "syncRuns/sync-expired",
    "syncRuns/sync-legacy-expired"
  ]);
  writes.filter((write) => write.id !== "sync-legacy-expired").forEach((write) => {
    assert.equal(write.data.status, "error");
    assert.equal(write.data.stage, "execution_uncertain");
    assert.equal(write.data.runExpiresAt, "DELETE_FIELD");
  });
  assert.equal(snapshotFor("syncRuns", "sync-active").data().status, "running");
  assert.equal(snapshotFor("sourceImportRuns", "direct-active").data().status, "running");
  assert.equal(snapshotFor("syncRuns", "sync-legacy-expired").data().status, "running");
  const legacyCleanupWrite = writes.find((write) => write.id === "sync-legacy-expired");
  assert.deepEqual(Object.keys(legacyCleanupWrite.data), ["runExpiresAt"]);
  assert.equal(legacyCleanupWrite.data.runExpiresAt, "DELETE_FIELD");
  assert.equal(Object.hasOwn(snapshotFor("syncRuns", "sync-legacy-expired").data(), "runExpiresAt"), false);
  assert.equal(Object.hasOwn(snapshotFor("syncRuns", "sync-expired").data(), "runExpiresAt"), false);
  assert.equal(Object.hasOwn(snapshotFor("sourceImportRuns", "queue-expired").data(), "runExpiresAt"), false);
  assert.equal(Object.hasOwn(snapshotFor("sourceImportRuns", "direct-expired").data(), "runExpiresAt"), false);
  assert.deepEqual(Array.from(queryLog, (query) => `${query.collectionName}:${query.field}`), [
    "syncRequests:claimExpiresAt",
    "syncRuns:runExpiresAt",
    "sourceImportRuns:runExpiresAt"
  ]);
});

test("une erreur query du reaper bloque le scheduler avant toute sync business", async () => {
  fixtures.clear();
  writes.length = 0;
  queryLog.length = 0;
  queryFailures.clear();
  fixtures.set("syncRequests", []);
  queryFailures.set("syncRuns", new Error("offline query failure"));

  await assert.rejects(
    scheduledQuestionnaireResponseSyncHandler({ id: "questionnaire-scheduler-event" }),
    /offline query failure/
  );

  queryFailures.clear();
  assert.equal(writes.length, 0);
  assert.deepEqual(Array.from(queryLog, (query) => query.collectionName), ["syncRequests", "syncRuns"]);
  assert.equal(writes.some((write) => ["clients", "tasks", "syncRuns"].includes(write.collectionName)), false);
});

test("syncRuns passe de running a un etat terminal sur le meme document", async () => {
  fixtures.clear();
  writes.length = 0;
  const runStart = await h.beginDashboardSyncRun({
    startedAt: "STARTED_AT",
    request: { auth: { uid: "admin", token: { email: "admin@example.test" } } },
    source: "firebase_function_sync_sheets_manual",
    triggeredBy: "manual_admin",
    requestedCoachId: "15935"
  });
  const runRef = runStart.runRef;
  assert.equal(runStart.existing, null);
  await h.writeFailedSyncRun({
    runRef,
    startedAt: "STARTED_AT",
    requestedByUid: "admin",
    requestedByEmail: "admin@example.test",
    triggeredBy: "manual_admin",
    coachIds: ["15935"],
    source: "firebase_function_sync_sheets_manual",
    error: new Error("offline failure"),
    stage: "offline_test"
  });

  const runWrites = writes.filter((write) => write.collectionName === "syncRuns");
  assert.equal(runWrites.length, 2);
  assert.equal(runWrites[0].id, runWrites[1].id);
  assert.equal(runWrites[0].data.status, "running");
  assert.equal(runWrites[0].data.stage, "starting");
  assert.equal(runWrites[0].data.executionContractVersion, h.EXECUTION_LEDGER_CONTRACT_VERSION);
  assert.equal(runWrites[0].data.runExpiresAt.toMillis() - Date.now() > 300000, true);
  assert.equal(runWrites[1].data.status, "error");
  assert.equal(runWrites[1].data.stage, "offline_test");
  assert.equal(runWrites[1].data.finishedAt, "CLIENT_TIMESTAMP");
  assert.equal(runWrites[1].data.updatedAt, "SERVER_TIMESTAMP");
  assert.equal(runWrites[1].data.runExpiresAt, "DELETE_FIELD");
  assert.equal(runWrites[1].options.merge, true);
  assert.equal(Object.hasOwn(snapshotFor("syncRuns", runRef.id).data(), "runExpiresAt"), false);
});

test("un triggeredByEventId reserve un seul syncRun deterministe", async () => {
  fixtures.clear();
  writes.length = 0;
  const requestId = "deterministic-sheets-request";
  const executionContext = {
    syncRequestId: requestId,
    processingEventId: "event-one",
    executedRevision: "processsyncrequest-00042-abc"
  };
  const args = {
    startedAt: "STARTED_AT",
    source: "firebase_firestore_sync_request_coach",
    triggeredBy: "manual_admin",
    triggeredByEventId: requestId,
    requestedCoachId: "15935",
    executionContext
  };
  const first = await h.beginDashboardSyncRun(args);
  const duplicate = await h.beginDashboardSyncRun(args);

  assert.equal(first.runRef.id, h.deterministicDashboardSyncRunId(requestId));
  assert.equal(first.existing, null);
  assert.equal(duplicate.runRef.id, first.runRef.id);
  assert.equal(duplicate.existing.status, "running");
  assert.equal(duplicate.existing.syncRequestId, requestId);
  assert.equal(writes.filter((write) => write.collectionName === "syncRuns").length, 1);
});

test("les gardes exact-live restent presentes dans le hotfix", () => {
  assert.match(source, /const clientSyncEnabled = !questionnaireOnly && coachRosterVerified/);
  assert.match(source, /const explicitTasks = clientSyncEnabled \? buildTaskRecords/);
  assert.match(source, /const genericStaleClients = !clientSyncEnabled \|\| ownershipReviewBlockCount \? \[\]/);
  assert.match(source, /clientRecordAvailableForMatching\(client\.data\) && client\.data\?\.sourceStale !== true/);
  assert.match(source, /if \(!clientSyncEnabled && \(clients\.length \|\| staleClients\.length\)\)/);
  assert.match(source, /await claimSyncRequestExecution\(\{/);
  assert.match(source, /processingEventId: event\.id/);
  assert.match(source, /executedRevision: currentFunctionRevision\(\)/);
  assert.match(source, /executionPhase: "claimed"/);
  assert.match(source, /executionContractVersion: EXECUTION_LEDGER_CONTRACT_VERSION/);
  assert.match(source, /executionClaimedAt: admin\.firestore\.FieldValue\.serverTimestamp\(\)/);
  assert.match(source, /claimExpiresAt/);
  assert.match(source, /executionPhase: "business_started"/);
  assert.equal((source.match(/await reapExpiredExecutionState\(\);/g) || []).length, 2);
  assert.match(source, /\.where\(expiresField, "<=", now\)\s*\.orderBy\(expiresField, "asc"\)\s*\.orderBy\(admin\.firestore\.FieldPath\.documentId\(\), "asc"\)\s*\.limit\(pageLimit\)/);
  assert.match(source, /if \(cursor\) query = query\.startAfter\(cursor\)/);
  assert.match(source, /summary\.scanned < EXPIRED_EXECUTION_REAP_SCAN_LIMIT/);
  assert.match(source, /\[expiresField\]: admin\.firestore\.FieldValue\.delete\(\)/);
  assert.match(source, /Number\(ledger\.executionContractVersion\) !== EXECUTION_LEDGER_CONTRACT_VERSION/);
  assert.match(source, /const terminalPatch = executionPhase === "business_started" && ledgerExact/);
  assert.match(source, /claimExpiresAt: admin\.firestore\.FieldValue\.delete\(\)/);
  assert.match(source, /runExpiresAt: admin\.firestore\.FieldValue\.delete\(\)/);
  assert.match(source, /deterministicDashboardSyncRunId\(triggeredByEventId\)/);
  assert.match(source, /deterministicSourceImportRunId\(requestId\)/);
  assert.match(source, /reconcileClaimedSyncRequest\(\{ requestRef, requestId \}\)/);
  assert.match(source, /status: "done",\s+stage: "completed"/);
  assert.doesNotMatch(source, /await db\.collection\("syncRuns"\)\.add\(\{\s+requestedByUid:[\s\S]{0,900}?clientOwnershipLock/);
});
