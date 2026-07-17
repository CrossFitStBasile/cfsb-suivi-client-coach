"use strict";

/*
Workflow obligatoire (tous les artefacts restent hors OneDrive/worktree):
  1. reserve --project ... --repair-id ... --expires-at ... --confirm-project ... --apply
  2. executer un audit complet frais, puis generer le plan avec le meme repairId
  3. bind --plan ... --backup ... + les quatre confirmations de hash --apply
  4. appliquer le plan atomique (qui passe le verrou a phase=applied), verifier, puis unlock --verify-live --apply
Si l'audit ou le plan echoue avant bind, utiliser release avec --confirm-release <repairId>.
Si un drift est detecte apres bind mais avant apply, utiliser abort avec --confirm-abort <repairId>.
*/

const {
  DEFAULT_DATABASE,
  DEFAULT_PROJECT_ID,
  canonicalJson,
  clean,
  decodeFields,
  encodeFields,
  firestoreBase,
  firestoreRequest,
  getAccessToken,
  parseArgs,
  readDocument,
  readJsonPrivate,
  verifyHashedArtifact
} = require("./client-ownership-repair-lib.cjs");

const BACKUP_FORMAT = "cfsb-client-ownership-backup/v1";
const PLAN_FORMAT = "cfsb-client-ownership-plan/v1";
const LOCK_PATH = "systemLocks/clientOwnershipSync";

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function currentLock(token, plan) {
  try {
    const document = await readDocument(token, {
      projectId: plan.projectId,
      database: plan.database,
      documentPath: LOCK_PATH
    });
    const data = decodeFields(document.fields || {});
    return { exists: true, document, data };
  } catch (error) {
    if (/404|not found/i.test(error.message)) return { exists: false, document: null, data: {} };
    throw error;
  }
}

function assertConfirmations(args, plan, backup) {
  if (clean(args["confirm-project"]) !== DEFAULT_PROJECT_ID || plan.projectId !== DEFAULT_PROJECT_ID) {
    throw new Error("--confirm-project exact requis.");
  }
  if (clean(args["repair-id"]) !== plan.repairId) throw new Error("--repair-id ne correspond pas au plan.");
  if (clean(args["plan-sha256"]) !== plan.contentSha256) throw new Error("--plan-sha256 ne correspond pas au plan.");
  if (clean(args["backup-sha256"]) !== backup.contentSha256) throw new Error("--backup-sha256 ne correspond pas au backup.");
}

function assertReservationConfirmation(args, target) {
  if (clean(args["confirm-project"]) !== DEFAULT_PROJECT_ID || target.projectId !== DEFAULT_PROJECT_ID) {
    throw new Error("--confirm-project exact requis.");
  }
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(target.repairId)
    || clean(args["repair-id"]) !== target.repairId) {
    throw new Error("--repair-id exact et valide requis.");
  }
}

function assertFutureExpiration(value) {
  const expiresAt = new Date(clean(value));
  const lifetime = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(expiresAt.getTime()) || lifetime < 10 * 60 * 1000 || lifetime > 6 * 60 * 60 * 1000) {
    throw new Error("--expires-at ISO requis entre 10 minutes et 6 heures dans le futur.");
  }
  return expiresAt.toISOString();
}

async function commitLock(token, target, lock, next) {
  const fields = encodeFields(next);
  if (clean(next.expiresAt)) fields.expiresAt = { timestampValue: clean(next.expiresAt) };
  const write = {
    update: {
      name: lock.document?.name || `${firestoreBase(target.projectId, target.database)}/${LOCK_PATH}`
        .replace("https://firestore.googleapis.com/v1/", ""),
      fields
    },
    currentDocument: lock.exists ? { updateTime: lock.document.updateTime } : { exists: false }
  };
  const result = await firestoreRequest(token, `${firestoreBase(target.projectId, target.database)}:commit`, {
    method: "POST",
    body: JSON.stringify({ writes: [write] })
  });
  if ((result.writeResults || []).length !== 1) throw new Error("Mutation atomique du verrou non confirmee.");
}

async function verifyAppliedPlan(token, plan) {
  let verified = 0;
  for (const group of chunks(plan.operations, 20)) {
    const documents = await Promise.all(group.map((operation) => readDocument(token, {
      projectId: plan.projectId,
      database: plan.database,
      documentPath: operation.documentPath
    })));
    documents.forEach((document, index) => {
      const operation = group[index];
      const data = decodeFields(document.fields || {});
      operation.updateMask.forEach((field) => {
        if (canonicalJson(data[field]) !== canonicalJson(operation.patch[field])) {
          throw new Error(`Verification post-apply echouee: ${operation.documentPath}, champ ${field}.`);
        }
      });
      verified += 1;
    });
  }
  return verified;
}

async function main() {
  const args = parseArgs();
  const requestedAction = clean(args.action || "reserve");
  const action = requestedAction === "lock" ? "bind" : requestedAction;
  if (!["reserve", "release", "bind", "abort", "unlock"].includes(action)) {
    throw new Error("Usage: --action reserve|release|bind|abort|unlock. Ordre sur: reserve -> audit frais -> plan -> bind -> apply -> unlock; abort seulement avant apply.");
  }
  const apply = args.apply === true;

  if (action === "reserve" || action === "release") {
    const target = {
      projectId: clean(args.project || DEFAULT_PROJECT_ID),
      database: clean(args.database || DEFAULT_DATABASE),
      repairId: clean(args["repair-id"])
    };
    const expiresAt = action === "reserve" ? assertFutureExpiration(args["expires-at"]) : "";
    assertReservationConfirmation(args, target);
    const token = await getAccessToken();
    const lock = await currentLock(token, target);
    if (action === "release") {
      if (clean(args["confirm-release"]) !== target.repairId) {
        throw new Error("Release refuse: --confirm-release doit repeter exactement le repairId.");
      }
      if (!lock.exists || lock.data.active !== true || lock.data.phase !== "reserved"
        || lock.data.projectId !== target.projectId || lock.data.repairId !== target.repairId) {
        throw new Error("Release refuse: reservation active du meme projet/repairId requise.");
      }
      const next = {
        ...lock.data,
        active: false,
        phase: "released",
        releasedAt: new Date().toISOString(),
        releaseReason: clean(args.reason || "Audit ou plan interrompu avant bind").slice(0, 240)
      };
      if (!apply) {
        process.stdout.write(`${JSON.stringify({ mode: "dry-run", action, current: lock.data, next }, null, 2)}\n`);
        return;
      }
      await commitLock(token, target, lock, next);
      process.stdout.write(`${JSON.stringify({ mode: "apply", action, repairId: target.repairId }, null, 2)}\n`);
      return;
    }
    const sameReservation = lock.data.active === true
      && lock.data.phase === "reserved"
      && lock.data.projectId === target.projectId
      && lock.data.repairId === target.repairId;
    const lockStillActive = lock.data.active === true
      && Number.isFinite(Date.parse(lock.data.expiresAt))
      && Date.parse(lock.data.expiresAt) > Date.now();
    const replaceableExpiredReservation = lock.data.active === true
      && lock.data.phase === "reserved"
      && !lockStillActive;
    if (lock.data.active === true && !sameReservation && !replaceableExpiredReservation) {
      throw new Error("Un autre verrou ownership est actif; aucune prise de controle automatique.");
    }
    const next = {
      active: true,
      phase: "reserved",
      repairId: target.repairId,
      projectId: target.projectId,
      planContentSha256: "",
      backupContentSha256: "",
      reason: clean(args.reason || "Reservation avant audit ownership frais").slice(0, 240),
      lockedAt: new Date().toISOString(),
      expiresAt,
      unlockRequiresVerifiedPlan: true
    };
    if (!apply) {
      process.stdout.write(`${JSON.stringify({ mode: "dry-run", action, current: lock.data, next }, null, 2)}\n`);
      return;
    }
    await commitLock(token, target, lock, next);
    process.stdout.write(`${JSON.stringify({ mode: "apply", action, repairId: target.repairId, expiresAt }, null, 2)}\n`);
    return;
  }

  if (!args.plan || !args.backup) {
    throw new Error("--plan et --backup prives requis pour bind/unlock.");
  }
  const plan = readJsonPrivate(args.plan);
  const backup = readJsonPrivate(args.backup);
  verifyHashedArtifact(plan, PLAN_FORMAT, "Plan");
  verifyHashedArtifact(backup, BACKUP_FORMAT, "Backup");
  if (plan.backupContentSha256 !== backup.contentSha256) throw new Error("Plan/backup incoherents.");
  if (plan.projectId !== backup.projectId || plan.database !== backup.database) throw new Error("Projet/database incoherent.");
  if (apply) assertConfirmations(args, plan, backup);

  const token = await getAccessToken();
  const lock = await currentLock(token, plan);
  const lockMatches = lock.data.repairId === plan.repairId
    && lock.data.planContentSha256 === plan.contentSha256
    && lock.data.backupContentSha256 === backup.contentSha256;

  if (action === "abort") {
    if (!lock.exists || lock.data.active !== true || lock.data.phase !== "bound" || !lockMatches) {
      throw new Error("Abort refuse: verrou bound actif avec les memes projet, repairId et hashes requis.");
    }
    if (apply && clean(args["confirm-abort"]) !== plan.repairId) {
      throw new Error("Abort refuse: --confirm-abort doit repeter exactement le repairId.");
    }
    const next = {
      ...lock.data,
      active: false,
      phase: "aborted",
      abortedAt: new Date().toISOString(),
      abortReason: clean(args.reason || "Drift detecte apres bind et avant apply").slice(0, 240)
    };
    if (!apply) {
      process.stdout.write(`${JSON.stringify({ mode: "dry-run", action, current: lock.data, next }, null, 2)}\n`);
      return;
    }
    await commitLock(token, plan, lock, next);
    process.stdout.write(`${JSON.stringify({ mode: "apply", action, repairId: plan.repairId }, null, 2)}\n`);
    return;
  }

  if (action === "bind") {
    if (!lock.exists || lock.data.active !== true || lock.data.phase !== "reserved"
      || lock.data.projectId !== plan.projectId || lock.data.repairId !== plan.repairId) {
      throw new Error("Bind refuse: reservation active du meme projet/repairId requise avant l'audit.");
    }
    if (!Number.isFinite(Date.parse(lock.data.expiresAt)) || Date.parse(lock.data.expiresAt) <= Date.now() + 10 * 60 * 1000) {
      throw new Error("Bind refuse: reservation expiree ou moins de 10 minutes restantes.");
    }
    if (!Number.isFinite(Date.parse(backup.generatedAt))
      || !Number.isFinite(Date.parse(lock.data.lockedAt))
      || Date.parse(backup.generatedAt) < Date.parse(lock.data.lockedAt)) {
      throw new Error("Bind refuse: backup.generatedAt doit prouver un audit realise apres la reservation.");
    }
    const next = {
      ...lock.data,
      phase: "bound",
      planContentSha256: plan.contentSha256,
      backupContentSha256: backup.contentSha256,
      boundAt: new Date().toISOString()
    };
    if (!apply) {
      process.stdout.write(`${JSON.stringify({ mode: "dry-run", action, current: lock.data, next }, null, 2)}\n`);
      return;
    }
    await commitLock(token, plan, lock, next);
    process.stdout.write(`${JSON.stringify({ mode: "apply", action, repairId: plan.repairId, expiresAt: next.expiresAt }, null, 2)}\n`);
    return;
  }

  if (!lock.exists || lock.data.active !== true || lock.data.phase !== "applied" || !lockMatches) {
    throw new Error("Unlock refuse: verrou applied actif et hashes/repairId identiques requis.");
  }
  if (args["verify-live"] !== true) {
    throw new Error("Unlock refuse: --verify-live explicite requis.");
  }
  const verifiedOperations = await verifyAppliedPlan(token, plan);
  const next = {
    ...lock.data,
    active: false,
    unlockedAt: new Date().toISOString(),
    unlockVerified: true,
    verifiedOperationCount: verifiedOperations
  };
  if (!apply) {
    process.stdout.write(`${JSON.stringify({ mode: "dry-run", action, verifiedOperations, next }, null, 2)}\n`);
    return;
  }
  await commitLock(token, plan, lock, next);
  process.stdout.write(`${JSON.stringify({ mode: "apply", action, repairId: plan.repairId, verifiedOperations }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Ownership lock interrompu: ${error.message}\n`);
  process.exitCode = 1;
});
