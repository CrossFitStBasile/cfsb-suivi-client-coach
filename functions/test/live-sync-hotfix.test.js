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

function docsFor(collectionName) {
  return (fixtures.get(collectionName) || []).map(({ id, data }) => ({
    id,
    data: () => data,
    get: (field) => data[field]
  }));
}

function querySnapshot(collectionName, field, value) {
  const docs = docsFor(collectionName).filter((doc) => doc.data()[field] === value);
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
        return { get: async () => querySnapshot(collectionName, field, value) };
      },
      get: async () => querySnapshot(collectionName, "__never__", "__never__"),
      doc(id) {
        return {
          set(data, options) {
            writes.push({ collectionName, id, data, options });
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
      }
    };
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
  createClientMatchIndex,
  findClientMatch,
  questionnaireReviewRowsForScope,
  rowsFromValues,
  syncCoachFromRows,
  taskRowBelongsToCoach,
  writeCoachSyncStatus
};`, sandbox, { filename: "functions/index.js" });

const h = sandbox.__helpers;
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

test("les gardes exact-live restent presentes dans le hotfix", () => {
  assert.match(source, /const clientSyncEnabled = !questionnaireOnly && coachRosterVerified/);
  assert.match(source, /const explicitTasks = clientSyncEnabled \? buildTaskRecords/);
  assert.match(source, /const genericStaleClients = !clientSyncEnabled \|\| ownershipReviewBlockCount \? \[\]/);
  assert.match(source, /clientRecordAvailableForMatching\(client\.data\) && client\.data\?\.sourceStale !== true/);
  assert.match(source, /if \(!clientSyncEnabled && \(clients\.length \|\| staleClients\.length\)\)/);
});
