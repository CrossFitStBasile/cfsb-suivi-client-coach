"use strict";

const {
  DEFAULT_PROJECT_ID,
  OWNERSHIP_COLLECTIONS,
  PILOT_COACHES,
  assertPrivateOutputPath,
  clean,
  contentHash,
  decodeFields,
  documentId,
  documentPath,
  identityFromClient,
  identityKeys,
  normalize,
  normalizePhone,
  parseArgs,
  readJsonPrivate,
  sha256,
  staffCoach,
  staffNameCandidate,
  verifyHashedArtifact,
  writeJsonPrivate
} = require("./client-ownership-repair-lib.cjs");

const BACKUP_FORMAT = "cfsb-client-ownership-backup/v1";
const REFERENCE_FORMAT = "cfsb-client-ownership-reference/v1";
const PLAN_FORMAT = "cfsb-client-ownership-plan/v1";
const MAX_ATOMIC_WRITES = 400;

function assertReference(reference) {
  verifyHashedArtifact(reference, REFERENCE_FORMAT, "Reference privee");
  const source = reference.source || {};
  ["system", "documentId", "generatedAt", "validatedBy", "validatedAt"].forEach((field) => {
    if (!clean(source[field])) throw new Error(`Reference privee: source.${field} requis.`);
  });
  if (!Array.isArray(reference.entries) || !reference.entries.length) {
    throw new Error("Reference privee: entries non vide requis.");
  }
  const completeRosterCoachIds = reference.completeRosterCoachIds || reference.scope?.completeRosterCoachIds || [];
  if (!Array.isArray(completeRosterCoachIds)
    || completeRosterCoachIds.some((coachId) => !PILOT_COACHES.some((coach) => coach.id === clean(coachId)))) {
    throw new Error("Reference privee: completeRosterCoachIds doit contenir seulement des coachs pilotes.");
  }
  const ownerByStrongIdentity = new Map();
  reference.entries.forEach((entry, index) => {
    if (entry.validated !== true) throw new Error(`Reference entry ${index + 1}: validated=true requis.`);
    if (!PILOT_COACHES.some((coach) => coach.id === clean(entry.ownerCoachId))) {
      throw new Error(`Reference entry ${index + 1}: ownerCoachId pilote invalide.`);
    }
    const match = entry.match || {};
    const hasNamespacedSourceId = clean(match.sourceClientId) && clean(match.sourceSystem);
    const hasStrong = hasNamespacedSourceId || normalizePhone(match.phone);
    if (!hasStrong) {
      throw new Error(`Reference entry ${index + 1}: telephone ou sourceSystem+sourceClientId requis.`);
    }
    if (!clean(entry.evidence)) throw new Error(`Reference entry ${index + 1}: evidence requise.`);
    const strongKeys = [
      normalizePhone(match.phone) ? `phone:${normalizePhone(match.phone)}` : "",
      hasNamespacedSourceId ? `source:${normalize(match.sourceSystem)}:${clean(match.sourceClientId)}` : ""
    ].filter(Boolean);
    strongKeys.forEach((key) => {
      const previousOwner = ownerByStrongIdentity.get(key);
      if (previousOwner && previousOwner !== clean(entry.ownerCoachId)) {
        throw new Error(`Reference contradictoire: l'identite forte ${key} est assignee a plusieurs ownerCoachId.`);
      }
      ownerByStrongIdentity.set(key, clean(entry.ownerCoachId));
    });
  });
}

function referenceMatchesClient(entry, client) {
  const match = entry.match || {};
  const identity = client.identity;
  if (clean(match.sourceClientId)
    && normalize(match.sourceSystem) === normalize(identity.sourceSystem)
    && clean(match.sourceClientId) === identity.sourceClientId) return true;
  if (normalizePhone(match.phone) && normalizePhone(match.phone) === identity.phone) return true;
  return false;
}

function main() {
  const args = parseArgs();
  if (!args.backup || !args.reference || !args.output) {
    throw new Error("Usage: --backup <json prive> --reference <json prive valide> --output <plan prive> [--repair-id <id>]");
  }
  assertPrivateOutputPath(args.output);
  const backup = readJsonPrivate(args.backup);
  const reference = readJsonPrivate(args.reference);
  verifyHashedArtifact(backup, BACKUP_FORMAT, "Backup");
  assertReference(reference);
  if (backup.projectId !== clean(args.project || DEFAULT_PROJECT_ID)) {
    throw new Error(`Backup projectId inattendu: ${backup.projectId}`);
  }
  OWNERSHIP_COLLECTIONS.forEach((name) => {
    if (!Array.isArray(backup.collections?.[name])) throw new Error(`Backup incomplet: collection ${name} absente.`);
    if (backup.collections[name].length !== Number(backup.collectionCounts?.[name])) {
      throw new Error(`Backup incomplet: compte ${name} incoherent.`);
    }
    if (sha256(backup.collections[name]) !== backup.collectionSha256?.[name]) {
      throw new Error(`Backup incomplet: hash ${name} incoherent.`);
    }
  });

  const repairId = clean(args["repair-id"] || `ownership_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}_${reference.contentSha256.slice(0, 8)}`);
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(repairId)) throw new Error("repair-id invalide.");
  const coachById = new Map(PILOT_COACHES.map((coach) => [coach.id, coach]));
  const completeRosterCoachIds = new Set((reference.completeRosterCoachIds || reference.scope?.completeRosterCoachIds || []).map(clean));
  const clientDocuments = backup.collections.clients;
  const clients = clientDocuments.map((raw) => {
    const data = decodeFields(raw.fields || {});
    return { raw, id: documentId(raw.name), path: documentPath(raw.name), data, identity: identityFromClient(data) };
  });
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const patchByPath = new Map();
  const handledClients = new Set();
  const now = new Date().toISOString();
  const completeRosterExpected = new Map();
  const completeRosterConfirmed = new Map();
  reference.entries.forEach((entry) => {
    const ownerCoachId = clean(entry.ownerCoachId);
    if (!completeRosterCoachIds.has(ownerCoachId)) return;
    completeRosterExpected.set(ownerCoachId, Number(completeRosterExpected.get(ownerCoachId) || 0) + 1);
    if (!completeRosterConfirmed.has(ownerCoachId)) completeRosterConfirmed.set(ownerCoachId, new Set());
  });

  function addPatch(document, patch, reason, evidence = []) {
    const path = document.path || documentPath(document.raw?.name || document.name);
    const raw = document.raw || document;
    const current = patchByPath.get(path) || { raw, patch: {}, reasons: [], evidence: [] };
    current.patch = { ...current.patch, ...patch };
    current.reasons.push(reason);
    current.evidence.push(...evidence);
    patchByPath.set(path, current);
  }

  // Personnel records are never valid mission/questionnaire client targets.
  clients.forEach((client) => {
    const staff = staffCoach(client.identity, client.data);
    const candidate = staff ? null : staffNameCandidate(client.identity);
    if (staff) {
      handledClients.add(client.id);
      addPatch(client, {
        entityType: "staff",
        ownershipStatus: "excluded_staff",
        clientSelectable: false,
        status: "ownership_quarantine",
        ownershipEvidence: [`staff_exact:${staff.id}`],
        ownershipConflictCoachIds: [],
        recommendedAdminAction: "Conserver hors du repertoire clients.",
        ownershipRepairId: repairId,
        ownershipValidatedAt: now
      }, "staff_exact_identity", [`pilotCoach:${staff.id}`]);
    } else if (candidate) {
      handledClients.add(client.id);
      addPatch(client, {
        entityType: "unknown",
        ownershipStatus: "needs_review",
        clientSelectable: false,
        status: "ownership_quarantine",
        ownershipEvidence: [`staff_name_candidate:${candidate.id}`],
        ownershipConflictCoachIds: [],
        recommendedAdminAction: "Confirmer par courriel officiel ou ID CoachRx avant de classer staff.",
        ownershipRepairId: repairId,
        ownershipValidatedAt: now
      }, "staff_name_candidate_needs_review", [`pilotCoachCandidate:${candidate.id}`]);
    }
  });

  // A validated external reference may confirm one existing owner. It never
  // chooses between multiple non-owner copies: those remain quarantined.
  reference.entries.forEach((entry, entryIndex) => {
    const matches = clients.filter((client) => !handledClients.has(client.id) && referenceMatchesClient(entry, client));
    if (!matches.length) {
      if (completeRosterCoachIds.has(clean(entry.ownerCoachId))) {
        throw new Error(`Roster complet ${entry.ownerCoachId}: une entry validee ne correspond a aucun client du backup.`);
      }
      return;
    }
    const ownerCoach = coachById.get(clean(entry.ownerCoachId));
    const ownerMatches = matches.filter((client) => clean(client.data.coachId || client.data.coachRxId) === ownerCoach.id);
    const canonical = ownerMatches.length === 1 ? ownerMatches[0] : matches.length === 1 ? matches[0] : null;
    matches.forEach((client) => handledClients.add(client.id));

    if (!canonical) {
      if (completeRosterCoachIds.has(ownerCoach.id)) {
        throw new Error(`Roster complet ${ownerCoach.id}: aucune fiche canonique unique pour l'entry ${entryIndex + 1}.`);
      }
      matches.forEach((client) => addPatch(client, {
        entityType: "unknown",
        ownershipStatus: "conflict",
        clientSelectable: false,
        status: "ownership_quarantine",
        ownershipConflictCoachIds: [...new Set(matches.map((item) => clean(item.data.coachId || item.data.coachRxId)).filter(Boolean))].sort(),
        ownershipEvidence: [`reference:${reference.contentSha256}`, `entry:${entryIndex + 1}`, "multiple_non_owner_copies"],
        recommendedAdminAction: "Choisir manuellement la fiche canonique; aucune reattribution automatique.",
        ownershipRepairId: repairId,
        ownershipValidatedAt: now
      }, "reference_multiple_non_owner_copies", [entry.evidence]));
      return;
    }

    const previousCoachId = clean(canonical.data.coachId || canonical.data.coachRxId);
    if (completeRosterCoachIds.has(ownerCoach.id)) completeRosterConfirmed.get(ownerCoach.id).add(canonical.id);
    addPatch(canonical, {
      coachId: ownerCoach.id,
      coachRxId: ownerCoach.id,
      coachName: ownerCoach.name,
      previousCoachId: previousCoachId !== ownerCoach.id ? previousCoachId : clean(canonical.data.previousCoachId),
      entityType: clean(entry.entityType || "member"),
      ownershipStatus: "confirmed",
      clientSelectable: true,
      status: ["ownership_quarantine", "import_stale"].includes(clean(canonical.data.status)) ? "active" : clean(canonical.data.status || "active"),
      sourceClientId: clean(entry.match?.sourceClientId || canonical.data.sourceClientId),
      sourceIdentitySystem: normalize(entry.match?.sourceSystem || canonical.identity.sourceSystem),
      ownershipConflictCoachIds: [],
      ownershipEvidence: [`reference:${reference.contentSha256}`, `entry:${entryIndex + 1}`, clean(entry.evidence)],
      recommendedAdminAction: "Appartenance confirmee par la reference privee validee.",
      ownershipRepairId: repairId,
      ownershipValidatedAt: now
    }, previousCoachId === ownerCoach.id ? "reference_confirms_owner" : "reference_transfers_owner", [entry.evidence]);

    matches.filter((client) => client.id !== canonical.id).forEach((client) => addPatch(client, {
      entityType: "unknown",
      ownershipStatus: "conflict",
      clientSelectable: false,
      status: "ownership_quarantine",
      ownershipConflictCoachIds: [ownerCoach.id, clean(client.data.coachId || client.data.coachRxId)].filter(Boolean).sort(),
      ownershipEvidence: [`reference:${reference.contentSha256}`, `entry:${entryIndex + 1}`, `canonicalClientId:${canonical.id}`],
      recommendedAdminAction: "Copie non canonique conservee en quarantaine; aucune suppression automatique.",
      ownershipRepairId: repairId,
      ownershipValidatedAt: now
    }, "reference_duplicate_copy_quarantined", [entry.evidence]));
  });

  completeRosterExpected.forEach((expected, ownerCoachId) => {
    const confirmed = completeRosterConfirmed.get(ownerCoachId)?.size || 0;
    if (confirmed !== expected) {
      throw new Error(`Roster complet ${ownerCoachId}: couverture canonique ${confirmed}/${expected}; plan refuse.`);
    }
  });

  const claims = new Map();
  clients.filter((client) => !handledClients.has(client.id)).forEach((client) => {
    const coachId = clean(client.data.coachId || client.data.coachRxId);
    identityKeys(client.identity).forEach((key) => {
      if (!claims.has(key)) claims.set(key, new Set());
      claims.get(key).add(coachId);
    });
  });
  clients.filter((client) => !handledClients.has(client.id)).forEach((client) => {
    const coachId = clean(client.data.coachId || client.data.coachRxId);
    const conflicts = new Set();
    identityKeys(client.identity).forEach((key) => (claims.get(key) || new Set()).forEach((id) => {
      if (id && id !== coachId) conflicts.add(id);
    }));
    if (conflicts.size) {
      addPatch(client, {
        entityType: "unknown",
        ownershipStatus: "conflict",
        clientSelectable: false,
        status: "ownership_quarantine",
        ownershipConflictCoachIds: [...conflicts].sort(),
        ownershipEvidence: ["backup_cross_coach_identity_collision"],
        recommendedAdminAction: "Fournir une reference externe validee avant toute reattribution.",
        ownershipRepairId: repairId,
        ownershipValidatedAt: now
      }, "unresolved_cross_coach_collision");
    } else if (identityKeys(client.identity).length
      && coachById.has(coachId)
      && !completeRosterCoachIds.has(coachId)) {
      const ownerCoach = coachById.get(coachId);
      addPatch(client, {
        coachId: ownerCoach.id,
        coachRxId: ownerCoach.id,
        coachName: ownerCoach.name,
        entityType: "member",
        ownershipStatus: "confirmed",
        clientSelectable: true,
        status: ["ownership_quarantine", "import_stale"].includes(clean(client.data.status)) ? "active" : clean(client.data.status || "active"),
        ownershipConflictCoachIds: [],
        ownershipEvidence: ["backup_unique_strong_identity_provisional"],
        recommendedAdminAction: "Appartenance provisoire: identite forte unique dans le snapshot, a confirmer par une reference externe.",
        ownershipRepairId: repairId,
        ownershipValidatedAt: now
      }, "unique_strong_identity_provisional");
    } else if (!(client.data.ownershipStatus === "confirmed" && client.data.clientSelectable === true)) {
      addPatch(client, {
        entityType: clean(client.data.entityType || "member"),
        ownershipStatus: "needs_review",
        clientSelectable: false,
        status: "ownership_quarantine",
        ownershipConflictCoachIds: [],
        ownershipEvidence: [completeRosterCoachIds.has(coachId) ? "complete_roster_non_reference" : "backup_unique_but_unproven"],
        recommendedAdminAction: "Fournir une reference externe validee avant activation.",
        ownershipRepairId: repairId,
        ownershipValidatedAt: now
      }, completeRosterCoachIds.has(coachId) ? "complete_roster_non_reference" : "unique_but_unproven");
    }
  });

  const operations = [...patchByPath.entries()].map(([path, item]) => ({
    documentPath: path,
    expectedUpdateTime: clean(item.raw.updateTime),
    beforeFieldsSha256: sha256(item.raw.fields || {}),
    patch: item.patch,
    updateMask: Object.keys(item.patch).sort(),
    reasons: [...new Set(item.reasons)],
    evidence: [...new Set(item.evidence.filter(Boolean))]
  })).sort((a, b) => a.documentPath.localeCompare(b.documentPath));
  if (operations.some((operation) => !operation.expectedUpdateTime || !operation.beforeFieldsSha256 || !operation.updateMask.length)) {
    throw new Error("Plan refuse: une operation n'a pas de precondition forte.");
  }
  if (operations.length + 1 > MAX_ATOMIC_WRITES) {
    throw new Error(`Plan refuse: ${operations.length} mutations client plus le verify du verrou depassent ${MAX_ATOMIC_WRITES} writes atomiques.`);
  }

  const plan = {
    format: PLAN_FORMAT,
    verified: true,
    projectId: backup.projectId,
    database: backup.database,
    repairId,
    generatedAt: now,
    mode: "dry_run_plan_only",
    destructiveDeletes: 0,
    backupContentSha256: backup.contentSha256,
    referenceContentSha256: reference.contentSha256,
    referenceSource: reference.source,
    completeRosterCoachIds: [...completeRosterCoachIds].sort(),
    operationCount: operations.length,
    summary: operations.reduce((summary, operation) => {
      const status = clean(operation.patch.ownershipStatus || "other");
      summary.byOwnershipStatus[status] = Number(summary.byOwnershipStatus[status] || 0) + 1;
      const reason = operation.reasons[0] || "other";
      summary.byPrimaryReason[reason] = Number(summary.byPrimaryReason[reason] || 0) + 1;
      return summary;
    }, { clientOnlyAtomicPlan: true, byOwnershipStatus: {}, byPrimaryReason: {} }),
    operations
  };
  plan.contentSha256 = contentHash(plan);
  const output = writeJsonPrivate(args.output, plan);
  const counts = operations.reduce((map, operation) => {
    const collection = operation.documentPath.split("/")[0];
    map[collection] = Number(map[collection] || 0) + 1;
    return map;
  }, {});
  process.stdout.write(`${JSON.stringify({ repairId, operationCount: operations.length, counts, planSha256: plan.contentSha256, output }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Plan ownership refuse: ${error.message}\n`);
  process.exitCode = 1;
}
