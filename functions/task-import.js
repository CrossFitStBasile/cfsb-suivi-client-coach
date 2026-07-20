const crypto = require("crypto");

const TASKS_CURRENT_SOURCE = "google_sheets_tasks_current";
const TERMINAL_TASK_STATUSES = new Set(["done", "ignored", "archived"]);
const TERMINAL_TASK_METADATA_FIELDS = Object.freeze([
  "completedAt",
  "completedBy",
  "ignoredAt",
  "ignoredBy",
  "archivedAt",
  "archivedBy"
]);
const MANUAL_TASK_SOURCES = new Set(["firebase_app_manual", "manual", "dashboard_manual"]);
const CLIENT_TARGETED_TASK_TYPES = new Set(["validation", "program", "rebooking", "questionnaire_followup"]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function shortHash(value) {
  return crypto.createHash("sha256").update(clean(value)).digest("hex").slice(0, 24);
}

function importedTaskSemanticFingerprint({
  coachId,
  clientId = "",
  clientName = "",
  type = "",
  title = "",
  description = "",
  priority = "",
  dueAt = "",
  source = TASKS_CURRENT_SOURCE
}) {
  const stableClient = clean(clientId)
    ? `id:${normalized(clientId)}`
    : `name:${normalized(clientName)}`;
  return shortHash(JSON.stringify({
    source: normalized(source),
    coachId: normalized(coachId),
    client: stableClient,
    type: normalized(type),
    title: normalized(title),
    description: normalized(description),
    priority: normalized(priority),
    dueAt: normalized(dueAt)
  }));
}

function importedTaskLineageFingerprint({
  coachId,
  clientId = "",
  clientName = "",
  type = "",
  source = TASKS_CURRENT_SOURCE
}) {
  const stableClient = clean(clientId)
    ? `id:${normalized(clientId)}`
    : `name:${normalized(clientName)}`;
  return shortHash(JSON.stringify({
    source: normalized(source),
    coachId: normalized(coachId),
    client: stableClient,
    type: normalized(type)
  }));
}

function importedTaskIdentity(input) {
  const source = clean(input.source) || TASKS_CURRENT_SOURCE;
  const coachId = clean(input.coachId);
  const explicitSourceEventId = clean(input.sourceEventId);
  const sourceFingerprint = importedTaskSemanticFingerprint({ ...input, source, coachId });
  const sourceLineageFingerprint = importedTaskLineageFingerprint({ ...input, source, coachId });
  const useClientLineage = CLIENT_TARGETED_TASK_TYPES.has(clean(input.type).toLowerCase())
    && Boolean(clean(input.clientId) || clean(input.clientName));
  const sourceEventId = explicitSourceEventId
    || (useClientLineage ? `lineage_${sourceLineageFingerprint}` : `semantic_${sourceFingerprint}`);
  const sourceKey = `${source}:${coachId}:${sourceEventId}`;
  return {
    canonicalId: `${coachId}_sheet_task_${shortHash(sourceKey)}`,
    source,
    sourceEventId,
    sourceKey,
    sourceFingerprint,
    sourceLineageFingerprint,
    identityMethod: explicitSourceEventId
      ? "source_event_id"
      : (useClientLineage ? "client_task_lineage" : "semantic_fingerprint"),
    sourceRowHasEventId: Boolean(explicitSourceEventId)
  };
}

function isTasksCurrentImportedRecord(data = {}) {
  const source = clean(data.source).toLowerCase();
  const sourceKey = clean(data.sourceKey);
  if (data.linkedFromManual === true || MANUAL_TASK_SOURCES.has(source)) return false;
  return source === TASKS_CURRENT_SOURCE
    || sourceKey.startsWith(`${TASKS_CURRENT_SOURCE}:`)
    || clean(data.sourceType).toLowerCase() === "tasks_current";
}

function isTerminalTaskStatus(status) {
  return TERMINAL_TASK_STATUSES.has(clean(status).toLowerCase());
}

function importedTaskTerminalMetadataFieldsToClear(existing = {}) {
  const systemArchivedStale = clean(existing.status).toLowerCase() === "archived"
    && existing.sourceStale === true;
  return systemArchivedStale ? [...TERMINAL_TASK_METADATA_FIELDS] : [];
}

function addToIndex(index, key, value) {
  if (!key) return;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(value);
}

function existingTaskSemanticFingerprint(coachId, data = {}) {
  return clean(data.sourceFingerprint) || importedTaskSemanticFingerprint({
    coachId: clean(data.coachId) || coachId,
    clientId: data.clientId,
    clientName: data.clientName,
    type: data.type,
    title: data.title,
    description: data.description,
    priority: data.priority,
    dueAt: data.dueAt,
    source: clean(data.source) || TASKS_CURRENT_SOURCE
  });
}

function existingTaskLineageFingerprint(coachId, data = {}) {
  return clean(data.sourceLineageFingerprint) || importedTaskLineageFingerprint({
    coachId: clean(data.coachId) || coachId,
    clientId: data.clientId,
    clientName: data.clientName,
    type: data.type,
    source: clean(data.source) || TASKS_CURRENT_SOURCE
  });
}

function createImportedTaskResolver({ coachId, existingById = new Map() }) {
  const bySourceKey = new Map();
  const bySourceEventId = new Map();
  const byFingerprint = new Map();
  const byLineage = new Map();
  const claimedExistingIds = new Set();
  const currentBySourceKey = new Map();
  const conflictedSourceKeys = new Set();
  const diagnostics = {
    sourceRowsSeen: 0,
    sourceRowsWithExplicitEventId: 0,
    sourceRowsUsingSemanticIdentity: 0,
    currentDuplicateRowsSuppressed: 0,
    newCanonicalTasks: 0,
    existingTasksReused: 0,
    existingTerminalTasksPreserved: 0,
    legacySemanticMatches: 0,
    legacyLineageMatches: 0,
    existingDuplicateCandidates: 0,
    currentIdentityCollisions: 0
  };

  existingById.forEach((data = {}, id) => {
    if (!isTasksCurrentImportedRecord(data)) return;
    if (clean(data.coachId) !== clean(coachId)) return;
    const candidate = { id, data };
    addToIndex(bySourceKey, clean(data.sourceKey), candidate);
    const existingEventId = clean(data.sourceEventId);
    if (existingEventId) {
      addToIndex(bySourceEventId, `${clean(data.source) || TASKS_CURRENT_SOURCE}:${clean(data.coachId) || clean(coachId)}:${existingEventId}`, candidate);
    }
    addToIndex(byFingerprint, existingTaskSemanticFingerprint(coachId, data), candidate);
    addToIndex(byLineage, existingTaskLineageFingerprint(coachId, data), candidate);
  });

  function availableCandidates(candidates = []) {
    return candidates.filter((candidate) => !claimedExistingIds.has(candidate.id));
  }

  function resolve(input) {
    diagnostics.sourceRowsSeen += 1;
    const identity = importedTaskIdentity({ ...input, coachId });
    if (identity.sourceRowHasEventId) diagnostics.sourceRowsWithExplicitEventId += 1;
    else diagnostics.sourceRowsUsingSemanticIdentity += 1;

    const current = currentBySourceKey.get(identity.sourceKey);
    if (current) {
      if (conflictedSourceKeys.has(identity.sourceKey)) {
        return { ...current, duplicateSourceRow: false, sourceIdentityCollision: true };
      }
      if (current.identity.sourceFingerprint !== identity.sourceFingerprint) {
        conflictedSourceKeys.add(identity.sourceKey);
        diagnostics.currentIdentityCollisions += 1;
        return { ...current, duplicateSourceRow: false, sourceIdentityCollision: true };
      }
      diagnostics.currentDuplicateRowsSuppressed += 1;
      return { ...current, duplicateSourceRow: true, sourceIdentityCollision: false };
    }

    const fingerprintCandidates = byFingerprint.get(identity.sourceFingerprint) || [];
    const searches = [
      ["source_key", bySourceKey.get(identity.sourceKey) || []],
      ["source_event_id", bySourceEventId.get(identity.sourceKey) || []]
    ];
    if (identity.sourceRowHasEventId) {
      searches.push(["semantic_fingerprint", fingerprintCandidates.filter((candidate) => (
        candidate.data?.sourceRowHasEventId !== true
        && clean(candidate.data?.sourceIdentityMethod) !== "source_event_id"
      ))]);
    } else {
      searches.push(["semantic_fingerprint", fingerprintCandidates]);
      if (identity.identityMethod === "client_task_lineage") {
        searches.push(["client_task_lineage", byLineage.get(identity.sourceLineageFingerprint) || []]);
      }
    }
    let matchMethod = "new_canonical";
    let candidates = [];
    for (const [method, indexedCandidates] of searches) {
      const available = availableCandidates(indexedCandidates);
      if (!available.length) continue;
      matchMethod = method;
      candidates = available;
      break;
    }
    if (candidates.length > 1) {
      diagnostics.existingDuplicateCandidates += candidates.length - 1;
      const collision = {
        id: identity.canonicalId,
        existing: {},
        identity,
        matchMethod,
        duplicateSourceRow: false,
        sourceIdentityCollision: true,
        existingCandidateCollision: true
      };
      conflictedSourceKeys.add(identity.sourceKey);
      currentBySourceKey.set(identity.sourceKey, collision);
      return collision;
    }
    const existing = candidates[0] || null;

    const result = {
      id: existing?.id || identity.canonicalId,
      existing: existing?.data || {},
      identity,
      matchMethod,
      duplicateSourceRow: false,
      sourceIdentityCollision: false
    };
    if (existing) {
      claimedExistingIds.add(existing.id);
      diagnostics.existingTasksReused += 1;
      if (isTerminalTaskStatus(existing.data?.status)) diagnostics.existingTerminalTasksPreserved += 1;
      if (matchMethod === "semantic_fingerprint" && !clean(existing.data?.sourceFingerprint)) {
        diagnostics.legacySemanticMatches += 1;
      }
      if (matchMethod === "client_task_lineage" && !clean(existing.data?.sourceLineageFingerprint)) {
        diagnostics.legacyLineageMatches += 1;
      }
    } else {
      diagnostics.newCanonicalTasks += 1;
    }
    currentBySourceKey.set(identity.sourceKey, result);
    return result;
  }

  function snapshotDiagnostics() {
    return { ...diagnostics };
  }

  return { resolve, snapshotDiagnostics };
}

function preserveImportedTaskLifecycle(existing = {}, fallbackStatus = "open") {
  const status = clean(existing.status).toLowerCase();
  // `archived + sourceStale` is an automatic import lifecycle state, not a
  // human terminal decision. A returning source row must reopen it.
  const systemArchivedStale = importedTaskTerminalMetadataFieldsToClear(existing).length > 0;
  const terminal = isTerminalTaskStatus(status) && !systemArchivedStale;
  const result = {
    status: terminal ? status : fallbackStatus,
    createdAt: existing.createdAt
  };
  if (terminal) {
    TERMINAL_TASK_METADATA_FIELDS.forEach((field) => {
      if (existing[field] !== undefined) result[field] = existing[field];
    });
  }
  return result;
}

function collectVerifiedOrphanTasksCurrentRecords({ existingById = new Map(), coachId = "" } = {}) {
  const expectedCoachId = clean(coachId);
  if (!expectedCoachId) return [];
  const records = [];
  existingById.forEach((data = {}, id) => {
    if (clean(data.coachId) !== expectedCoachId) return;
    if (clean(data.source).toLowerCase() !== TASKS_CURRENT_SOURCE) return;
    if (!isTasksCurrentImportedRecord(data)) return;
    if (!CLIENT_TARGETED_TASK_TYPES.has(clean(data.type).toLowerCase())) return;
    if (clean(data.clientId) || clean(data.clientName)) return;
    if (!["open", "waiting"].includes(clean(data.status).toLowerCase())) return;
    if (data.sourceStale === true || data.linkedFromManual === true) return;
    records.push({ id, data });
  });
  return records;
}

module.exports = {
  TASKS_CURRENT_SOURCE,
  collectVerifiedOrphanTasksCurrentRecords,
  createImportedTaskResolver,
  importedTaskIdentity,
  importedTaskLineageFingerprint,
  importedTaskSemanticFingerprint,
  importedTaskTerminalMetadataFieldsToClear,
  isTasksCurrentImportedRecord,
  isTerminalTaskStatus,
  preserveImportedTaskLifecycle
};
