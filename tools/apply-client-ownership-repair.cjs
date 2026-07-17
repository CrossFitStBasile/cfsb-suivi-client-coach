"use strict";

const {
  DEFAULT_PROJECT_ID,
  OWNERSHIP_COLLECTIONS,
  clean,
  decodeFields,
  encodeFields,
  firestoreBase,
  firestoreRequest,
  getAccessToken,
  parseArgs,
  readDocument,
  readJsonPrivate,
  sha256,
  verifyHashedArtifact
} = require("./client-ownership-repair-lib.cjs");

const BACKUP_FORMAT = "cfsb-client-ownership-backup/v1";
const PLAN_FORMAT = "cfsb-client-ownership-plan/v1";
const LOCK_PATH = "systemLocks/clientOwnershipSync";
const MAX_ATOMIC_WRITES = 400;
const MINIMUM_LOCK_TTL_MS = 5 * 60 * 1000;

function chunk(values, size) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

function backupDocumentMap(backup) {
  const documents = new Map();
  OWNERSHIP_COLLECTIONS.forEach((collection) => {
    (backup.collections?.[collection] || []).forEach((document) => {
      const marker = "/documents/";
      const position = clean(document.name).indexOf(marker);
      const documentPath = position >= 0 ? clean(document.name).slice(position + marker.length) : "";
      if (documentPath) documents.set(documentPath, document);
    });
  });
  return documents;
}

async function readLock(token, projectId, database) {
  try {
    const document = await readDocument(token, {
      projectId,
      database,
      documentPath: LOCK_PATH
    });
    const fields = decodeFields(document.fields || {});
    return {
      exists: true,
      name: clean(document.name),
      updateTime: clean(document.updateTime),
      active: fields.active === true,
      phase: clean(fields.phase),
      projectId: clean(fields.projectId),
      repairId: clean(fields.repairId),
      backupContentSha256: clean(fields.backupContentSha256),
      planContentSha256: clean(fields.planContentSha256),
      expiresAt: clean(fields.expiresAt)
    };
  } catch (error) {
    if (/404|not found/i.test(error.message)) return { exists: false, active: false };
    throw error;
  }
}

function assertApplicableLock(lock, plan, backup, minimumLifetimeMs = 0) {
  if (!lock.exists || !lock.active || lock.phase !== "bound" || !lock.name || !lock.updateTime) {
    throw new Error(`Apply refuse: verrou ${LOCK_PATH} actif avec updateTime requis.`);
  }
  if (lock.projectId !== plan.projectId
    || lock.repairId !== plan.repairId
    || lock.backupContentSha256 !== backup.contentSha256
    || lock.planContentSha256 !== plan.contentSha256) {
    throw new Error("Apply refuse: projet, repairId et hashes du verrou doivent correspondre exactement au plan/backup.");
  }
  const expiresAtMs = Date.parse(lock.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + minimumLifetimeMs) {
    throw new Error("Apply refuse: verrou expire ou trop proche de son expiration.");
  }
}

async function main() {
  const args = parseArgs();
  if (!args.plan || !args.backup) {
    throw new Error("Usage: --plan <json> --backup <json> [--apply avec confirmations fortes]");
  }
  const plan = readJsonPrivate(args.plan);
  const backup = readJsonPrivate(args.backup);
  verifyHashedArtifact(plan, PLAN_FORMAT, "Plan");
  verifyHashedArtifact(backup, BACKUP_FORMAT, "Backup");
  if (plan.projectId !== backup.projectId || plan.database !== backup.database) {
    throw new Error("Plan et backup ne ciblent pas le meme projet/database.");
  }
  if (plan.backupContentSha256 !== backup.contentSha256) {
    throw new Error("Plan et backup ne partagent pas le meme hash de preimage.");
  }
  if (!Array.isArray(plan.operations) || plan.operations.length !== Number(plan.operationCount)) {
    throw new Error("Plan incomplet: operationCount incoherent.");
  }
  if (plan.operations.length + 1 > MAX_ATOMIC_WRITES) {
    throw new Error(`Apply refuse: le commit atomique est limite a ${MAX_ATOMIC_WRITES} writes, verification du verrou incluse.`);
  }
  if (Number(plan.destructiveDeletes) !== 0) throw new Error("Plan refuse: suppression destructive declaree.");
  const backupDocs = backupDocumentMap(backup);
  plan.operations.forEach((operation, index) => {
    const before = backupDocs.get(clean(operation.documentPath));
    if (!before) throw new Error(`Operation ${index + 1}: preimage absente du backup.`);
    if (clean(before.updateTime) !== clean(operation.expectedUpdateTime)) {
      throw new Error(`Operation ${index + 1}: updateTime ne correspond pas au backup.`);
    }
    if (sha256(before.fields || {}) !== clean(operation.beforeFieldsSha256)) {
      throw new Error(`Operation ${index + 1}: hash de preimage ne correspond pas au backup.`);
    }
    if (!operation.patch || !Array.isArray(operation.updateMask) || !operation.updateMask.length) {
      throw new Error(`Operation ${index + 1}: patch/updateMask absent.`);
    }
    if (operation.updateMask.some((field) => !Object.prototype.hasOwnProperty.call(operation.patch, field))) {
      throw new Error(`Operation ${index + 1}: updateMask contient un champ absent du patch.`);
    }
  });

  const apply = args.apply === true;
  if (apply) {
    const confirmations = {
      project: clean(args["confirm-project"]),
      repairId: clean(args["repair-id"]),
      planSha256: clean(args["plan-sha256"]),
      backupSha256: clean(args["backup-sha256"])
    };
    if (confirmations.project !== plan.projectId || confirmations.project !== DEFAULT_PROJECT_ID) {
      throw new Error("--confirm-project doit correspondre exactement au projet CFSB attendu.");
    }
    if (confirmations.repairId !== plan.repairId) throw new Error("--repair-id ne correspond pas au plan.");
    if (confirmations.planSha256 !== plan.contentSha256) throw new Error("--plan-sha256 ne correspond pas au plan.");
    if (confirmations.backupSha256 !== backup.contentSha256) throw new Error("--backup-sha256 ne correspond pas au backup.");
  }

  const token = await getAccessToken();
  const lock = await readLock(token, plan.projectId, plan.database);
  if (apply) {
    assertApplicableLock(lock, plan, backup, MINIMUM_LOCK_TTL_MS);
  }

  const liveDocuments = new Map();
  for (const group of chunk(plan.operations, 20)) {
    const values = await Promise.all(group.map(async (operation) => {
      const document = await readDocument(token, {
        projectId: plan.projectId,
        database: plan.database,
        documentPath: operation.documentPath
      });
      return [operation.documentPath, document];
    }));
    values.forEach(([documentPath, document]) => liveDocuments.set(documentPath, document));
  }
  const drift = [];
  plan.operations.forEach((operation) => {
    const live = liveDocuments.get(operation.documentPath);
    if (clean(live?.updateTime) !== clean(operation.expectedUpdateTime)
      || sha256(live?.fields || {}) !== clean(operation.beforeFieldsSha256)) {
      drift.push(operation.documentPath);
    }
  });
  if (drift.length) {
    throw new Error(`Apply/dry-run refuse: ${drift.length} document(s) ont change depuis le backup. Refais audit + plan.`);
  }

  if (!apply) {
    process.stdout.write(`${JSON.stringify({
      mode: "dry-run",
      projectId: plan.projectId,
      repairId: plan.repairId,
      operationsVerified: plan.operations.length,
      liveDrift: 0,
      lock
    }, null, 2)}\n`);
    return;
  }

  const writes = plan.operations.map((operation) => {
    const live = liveDocuments.get(operation.documentPath);
    return {
      update: {
        name: live.name,
        fields: encodeFields(operation.patch)
      },
      updateMask: { fieldPaths: operation.updateMask },
      currentDocument: { updateTime: operation.expectedUpdateTime }
    };
  });
  const commitLock = await readLock(token, plan.projectId, plan.database);
  assertApplicableLock(commitLock, plan, backup, MINIMUM_LOCK_TTL_MS);
  if (commitLock.updateTime !== lock.updateTime) {
    throw new Error("Apply refuse: le verrou a change pendant la verification des preimages.");
  }
  const appliedAt = new Date().toISOString();
  writes.push({
    update: {
      name: commitLock.name,
      fields: encodeFields({
        phase: "applied",
        appliedAt,
        appliedOperationCount: plan.operations.length
      })
    },
    updateMask: { fieldPaths: ["phase", "appliedAt", "appliedOperationCount"] },
    currentDocument: { updateTime: commitLock.updateTime }
  });
  const result = await firestoreRequest(
    token,
    `${firestoreBase(plan.projectId, plan.database)}:commit`,
    { method: "POST", body: JSON.stringify({ writes }) }
  );
  if ((result.writeResults || []).length !== writes.length) {
    throw new Error("Firestore commit atomique n'a pas confirme toutes les ecritures.");
  }
  process.stdout.write(`${JSON.stringify({
    mode: "apply",
    projectId: plan.projectId,
    repairId: plan.repairId,
    writesApplied: plan.operations.length,
    lockTransitionWrites: 1,
    lockPhase: "applied",
    appliedAt,
    writeResultsConfirmed: (result.writeResults || []).length,
    atomicCommit: true,
    destructiveDeletes: 0,
    backupContentSha256: backup.contentSha256,
    planContentSha256: plan.contentSha256
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Ownership apply interrompu: ${error.message}\n`);
  process.exitCode = 1;
});
