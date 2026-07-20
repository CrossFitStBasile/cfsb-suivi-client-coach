"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TASKS_CURRENT_SOURCE,
  collectVerifiedOrphanTasksCurrentRecords,
  createImportedTaskResolver,
  importedTaskIdentity,
  importedTaskTerminalMetadataFieldsToClear,
  preserveImportedTaskLifecycle
} = require("../task-import");

const baseTask = {
  coachId: "15935",
  clientId: "client-1",
  clientName: "Client Exemple",
  type: "validation",
  title: "Confirmer le statut du client",
  description: "Confirmer si ce client doit rester actif.",
  priority: "P2",
  dueAt: "",
  source: TASKS_CURRENT_SOURCE
};

test("l'identite ne depend ni de l'ordre ni des details mutables d'une tache client", () => {
  const baseline = importedTaskIdentity(baseTask);
  const changed = importedTaskIdentity({
    ...baseTask,
    description: "Faire un appel avant vendredi.",
    priority: "P1",
    dueAt: "2026-08-01"
  });
  const otherClient = importedTaskIdentity({ ...baseTask, clientId: "client-2", clientName: "Autre Client" });

  assert.equal(baseline.canonicalId, changed.canonicalId);
  assert.notEqual(baseline.canonicalId, otherClient.canonicalId);
  assert.equal(baseline.identityMethod, "client_task_lineage");
});

test("une tache non-client utilise son contenu semantique", () => {
  const generic = { ...baseTask, clientId: "", clientName: "", type: "manual" };
  assert.notEqual(
    importedTaskIdentity(generic).canonicalId,
    importedTaskIdentity({ ...generic, description: "Autre action" }).canonicalId
  );
});

test("un identifiant evenement explicite est prioritaire et une collision est fail-closed", () => {
  const resolver = createImportedTaskResolver({ coachId: "15935", existingById: new Map() });
  const first = resolver.resolve({ ...baseTask, sourceEventId: "event-1" });
  const collision = resolver.resolve({ ...baseTask, sourceEventId: "event-1", dueAt: "2026-08-01" });

  assert.equal(first.id, collision.id);
  assert.equal(collision.sourceIdentityCollision, true);
  assert.equal(resolver.snapshotDiagnostics().currentIdentityCollisions, 1);
});

test("les lignes identiques sont dedupliquees", () => {
  const resolver = createImportedTaskResolver({ coachId: "15935", existingById: new Map() });
  const first = resolver.resolve(baseTask);
  const duplicate = resolver.resolve(baseTask);
  assert.equal(first.id, duplicate.id);
  assert.equal(duplicate.duplicateSourceRow, true);
  assert.equal(resolver.snapshotDiagnostics().currentDuplicateRowsSuppressed, 1);
});

test("une tache terminale existante est reutilisee sans etre rouverte", () => {
  const existingById = new Map([["legacy-done", {
    ...baseTask,
    status: "done",
    completedAt: "closed",
    createdAt: "created"
  }]]);
  const resolver = createImportedTaskResolver({ coachId: "15935", existingById });
  const resolved = resolver.resolve({ ...baseTask, priority: "P1" });
  const lifecycle = preserveImportedTaskLifecycle(resolved.existing);

  assert.equal(resolved.id, "legacy-done");
  assert.equal(lifecycle.status, "done");
  assert.equal(lifecycle.completedAt, "closed");
});

test("plusieurs candidates historiques de meme lignee sont refusees sans choix arbitraire", () => {
  const existingById = new Map([
    ["legacy-open", {
      ...baseTask,
      title: "Ancien titre ouvert",
      description: "Ancien contenu ouvert",
      status: "open"
    }],
    ["legacy-done", {
      ...baseTask,
      title: "Ancien titre ferme",
      description: "Ancien contenu ferme",
      status: "done",
      completedAt: "closed"
    }]
  ]);
  const resolver = createImportedTaskResolver({ coachId: "15935", existingById });
  const resolved = resolver.resolve({
    ...baseTask,
    title: "Titre courant",
    description: "Contenu courant"
  });

  assert.equal(resolved.sourceIdentityCollision, true);
  assert.equal(resolved.existingCandidateCollision, true);
  assert.notEqual(resolved.id, "legacy-open");
  assert.notEqual(resolved.id, "legacy-done");
  assert.equal(resolver.snapshotDiagnostics().existingDuplicateCandidates, 1);
});

test("une tache archivee automatiquement par stale est rouverte sans anciennes metadonnees terminales", () => {
  const existing = {
    status: "archived",
    sourceStale: true,
    createdAt: "created",
    archivedAt: "old-archive",
    archivedBy: "old-user",
    completedAt: "old-completion"
  };
  const lifecycle = preserveImportedTaskLifecycle(existing);
  assert.equal(lifecycle.status, "open");
  assert.equal(lifecycle.createdAt, "created");
  assert.equal(Object.hasOwn(lifecycle, "archivedAt"), false);
  assert.equal(Object.hasOwn(lifecycle, "archivedBy"), false);
  assert.equal(Object.hasOwn(lifecycle, "completedAt"), false);
  assert.deepEqual(importedTaskTerminalMetadataFieldsToClear(existing), [
    "completedAt",
    "completedBy",
    "ignoredAt",
    "ignoredBy",
    "archivedAt",
    "archivedBy"
  ]);
});

test("une archive humaine reste terminale meme quand la source revient", () => {
  const lifecycle = preserveImportedTaskLifecycle({
    status: "archived",
    sourceStale: false,
    createdAt: "created",
    archivedAt: "human-archive",
    archivedBy: "coach"
  });

  assert.equal(lifecycle.status, "archived");
  assert.equal(lifecycle.archivedAt, "human-archive");
  assert.equal(lifecycle.archivedBy, "coach");
  assert.deepEqual(importedTaskTerminalMetadataFieldsToClear({
    status: "archived",
    sourceStale: false
  }), []);
});

test("une tache existante sans coachId exact n'est jamais adoptee", () => {
  ["", "15928"].forEach((coachId) => {
    const existingById = new Map([[`wrong-${coachId || "blank"}`, { ...baseTask, coachId, status: "done" }]]);
    const resolved = createImportedTaskResolver({ coachId: "15935", existingById }).resolve(baseTask);
    assert.notEqual(resolved.id, `wrong-${coachId || "blank"}`);
    assert.equal(resolved.matchMethod, "new_canonical");
  });
});

test("les taches manuelles ne sont jamais adoptees", () => {
  const existingById = new Map([["manual", {
    ...baseTask,
    source: "firebase_app_manual",
    sourceType: "TASKS_CURRENT",
    linkedFromManual: true,
    status: "done"
  }]]);
  const resolved = createImportedTaskResolver({ coachId: "15935", existingById }).resolve(baseTask);
  assert.notEqual(resolved.id, "manual");
  assert.equal(resolved.matchMethod, "new_canonical");
});

test("seuls les orphelins TASKS_Current exacts du coach sont cibles", () => {
  const existingById = new Map([
    ["orphan", { coachId: "15935", source: TASKS_CURRENT_SOURCE, type: "validation", clientId: "", clientName: "", status: "open" }],
    ["valid", { coachId: "15935", source: TASKS_CURRENT_SOURCE, type: "validation", clientId: "client-1", clientName: "Client", status: "open" }],
    ["manual", { coachId: "15935", source: "firebase_app_manual", sourceType: "tasks_current", type: "validation", clientId: "", clientName: "", status: "open" }],
    ["other", { coachId: "15928", source: TASKS_CURRENT_SOURCE, type: "validation", clientId: "", clientName: "", status: "open" }],
    ["closed", { coachId: "15935", source: TASKS_CURRENT_SOURCE, type: "validation", clientId: "", clientName: "", status: "done" }]
  ]);

  assert.deepEqual(
    collectVerifiedOrphanTasksCurrentRecords({ existingById, coachId: "15935" }).map((record) => record.id),
    ["orphan"]
  );
});
