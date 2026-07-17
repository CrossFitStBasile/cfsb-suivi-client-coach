"use strict";

const {
  PILOT_COACHES,
  clean,
  contentHash,
  decodeFields,
  identityFromClient,
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
const ROSTER_FORMAT = "cfsb-client-ownership-rosters/v1";
const REFERENCE_FORMAT = "cfsb-client-ownership-reference/v1";
const COMPLETE_SCOPE = "complete_active_roster";

function assertRosterSource(rosterSource) {
  if (!rosterSource || rosterSource.format !== ROSTER_FORMAT) {
    throw new Error("Source roster privee: format invalide.");
  }
  if (rosterSource.verified !== true) {
    throw new Error("Source roster privee: verified=true requis.");
  }
  const source = rosterSource.source || {};
  ["system", "documentId", "generatedAt", "validatedBy", "validatedAt"].forEach((field) => {
    if (!clean(source[field])) throw new Error(`Source roster privee: source.${field} requis.`);
  });
  if (!Array.isArray(rosterSource.rosters) || !rosterSource.rosters.length) {
    throw new Error("Source roster privee: rosters non vide requis.");
  }
}

function backupClients(backup) {
  if (!Array.isArray(backup.collections?.clients)) {
    throw new Error("Backup: collection clients absente.");
  }
  if (backup.collections.clients.length !== Number(backup.collectionCounts?.clients)) {
    throw new Error("Backup: compte clients incoherent.");
  }
  if (sha256(backup.collections.clients) !== backup.collectionSha256?.clients) {
    throw new Error("Backup: hash clients incoherent.");
  }
  return backup.collections.clients.map((raw) => {
    const data = decodeFields(raw.fields || {});
    const identity = identityFromClient(data);
    const explicitSystem = normalize(data.sourceIdentitySystem || data.sourceSystem);
    const sourceSignals = [data.source, data.directSourceType, data.lastDirectEnrichmentSource]
      .map(normalize)
      .filter(Boolean);
    const inferredSystem = explicitSystem
      || (sourceSignals.some((signal) => signal.includes("coachrx")) ? "coachrx" : "")
      || (sourceSignals.some((signal) => signal.includes("ghl") || signal.includes("gohighlevel")) ? "ghl" : "")
      || (sourceSignals.some((signal) => signal.includes("clientdirectory") || signal.includes("coreclients")) ? "client_directory" : "");
    return { data, identity: { ...identity, sourceSystem: inferredSystem || identity.sourceSystem } };
  });
}

function sourceKey(sourceSystem, sourceClientId) {
  const system = normalize(sourceSystem);
  const clientId = clean(sourceClientId);
  return system && clientId ? `source:${system}:${clientId}` : "";
}

function phoneKey(phone) {
  const normalized = normalizePhone(phone);
  return normalized ? `phone:${normalized}` : "";
}

function matchFromKey(key) {
  if (key.startsWith("phone:")) return { phone: key.slice("phone:".length) };
  const [, sourceSystem, ...idParts] = key.split(":");
  return { sourceSystem, sourceClientId: idParts.join(":") };
}

function exactStaffReason(entry, matches = []) {
  const entryIdentity = {
    sourceSystem: normalize(entry.sourceSystem),
    sourceClientId: clean(entry.sourceClientId),
    phone: normalizePhone(entry.phone),
    name: clean(entry.name),
    normalizedName: normalize(entry.name)
  };
  if (staffCoach(entryIdentity, entry)) return "staff_exact";
  if (staffNameCandidate(entryIdentity)) return "staff_name_candidate";
  for (const client of matches) {
    if (staffCoach(client.identity, client.data)) return "staff_exact";
    if (staffNameCandidate(client.identity)) return "staff_name_candidate";
  }
  return "";
}

function selectNameBridgeKey(matches) {
  const sourceKeys = [...new Set(matches.map((client) => sourceKey(
    client.identity.sourceSystem,
    client.identity.sourceClientId
  )).filter(Boolean))].sort();
  const coachRxKeys = sourceKeys.filter((key) => key.startsWith("source:coachrx:"));
  const phoneKeys = [...new Set(matches.map((client) => phoneKey(client.identity.phone)).filter(Boolean))].sort();
  if (coachRxKeys.length === 1) return coachRxKeys[0];
  if (sourceKeys.length === 1) return sourceKeys[0];
  if (phoneKeys.length === 1) return phoneKeys[0];
  return "";
}

function resolveRosterEntry(entry, clients, allowNameBridge) {
  const directKey = sourceKey(entry.sourceSystem, entry.sourceClientId);
  if (directKey) {
    const matches = clients.filter((client) => sourceKey(
      client.identity.sourceSystem,
      client.identity.sourceClientId
    ) === directKey);
    if (matches.length) {
      const staffReason = exactStaffReason(entry, matches);
      if (staffReason) return { reason: staffReason };
      return { key: directKey, match: matchFromKey(directKey), method: "direct_backup_identity" };
    }
    if (!allowNameBridge) return { reason: "direct_identity_absent_from_backup" };
  }

  if (!allowNameBridge) return { reason: "name_bridge_not_allowed" };
  const normalizedName = normalize(entry.name);
  if (!normalizedName) return { reason: "strong_identity_missing" };
  const matches = clients.filter((client) => client.identity.normalizedName === normalizedName);
  if (!matches.length) return { reason: "name_absent_from_backup" };
  const staffReason = exactStaffReason(entry, matches);
  if (staffReason) return { reason: staffReason };
  const key = selectNameBridgeKey(matches);
  if (!key) return { reason: "name_bridge_ambiguous_or_weak" };
  return { key, match: matchFromKey(key), method: "exact_name_to_unique_strong_identity" };
}

function buildReference({ backup, rosterSource, allowNameBridge = false }) {
  verifyHashedArtifact(backup, BACKUP_FORMAT, "Backup");
  assertRosterSource(rosterSource);
  const clients = backupClients(backup);
  const rosterSourceSha256 = sha256(rosterSource);
  const coachIds = new Set(PILOT_COACHES.map((coach) => coach.id));
  const completeRosterCoachIds = new Set();
  const ownerByKey = new Map();
  const outputByOwnerAndKey = new Map();
  const reports = [];

  rosterSource.rosters.forEach((roster, rosterIndex) => {
    const ownerCoachId = clean(roster.ownerCoachId);
    const scope = clean(roster.scope);
    if (!coachIds.has(ownerCoachId)) {
      throw new Error(`Roster ${rosterIndex + 1}: ownerCoachId pilote invalide.`);
    }
    if (!scope) throw new Error(`Roster ${rosterIndex + 1}: scope requis.`);
    if (!Array.isArray(roster.entries) || !roster.entries.length) {
      throw new Error(`Roster ${rosterIndex + 1}: entries non vide requis.`);
    }

    const skippedByReason = {};
    let resolvedCount = 0;
    roster.entries.forEach((entry, entryIndex) => {
      const result = resolveRosterEntry(entry || {}, clients, allowNameBridge);
      if (!result.key) {
        skippedByReason[result.reason] = Number(skippedByReason[result.reason] || 0) + 1;
        return;
      }
      const previousOwner = ownerByKey.get(result.key);
      if (previousOwner && previousOwner !== ownerCoachId) {
        skippedByReason.conflicting_roster_owner = Number(skippedByReason.conflicting_roster_owner || 0) + 1;
        return;
      }
      ownerByKey.set(result.key, ownerCoachId);
      resolvedCount += 1;
      const dedupeKey = `${ownerCoachId}|${result.key}`;
      if (!outputByOwnerAndKey.has(dedupeKey)) {
        outputByOwnerAndKey.set(dedupeKey, {
          ownerCoachId,
          match: result.match,
          entityType: clean(entry.entityType || "member"),
          validated: true,
          evidence: `roster:${rosterSourceSha256}:r${rosterIndex + 1}:e${entryIndex + 1}:${result.method}`
        });
      }
    });

    const skippedCount = roster.entries.length - resolvedCount;
    if (scope === COMPLETE_SCOPE) {
      if (skippedCount) {
        const reasons = Object.entries(skippedByReason)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([reason, count]) => `${reason}=${count}`)
          .join(", ");
        throw new Error(`Roster complet ${rosterIndex + 1}: couverture ${resolvedCount}/${roster.entries.length}; ${reasons}.`);
      }
      completeRosterCoachIds.add(ownerCoachId);
    }
    reports.push({
      rosterIndex: rosterIndex + 1,
      scope,
      inputCount: roster.entries.length,
      resolvedCount,
      skippedCount,
      skippedByReason: Object.fromEntries(Object.entries(skippedByReason).sort(([a], [b]) => a.localeCompare(b)))
    });
  });

  const entries = [...outputByOwnerAndKey.values()].sort((a, b) => {
    const ownerOrder = a.ownerCoachId.localeCompare(b.ownerCoachId);
    return ownerOrder || JSON.stringify(a.match).localeCompare(JSON.stringify(b.match));
  });
  if (!entries.length) throw new Error("Reference refusee: aucune identite forte resolue.");
  const reference = {
    format: REFERENCE_FORMAT,
    verified: true,
    projectId: backup.projectId,
    generatedAt: new Date().toISOString(),
    source: {
      ...rosterSource.source,
      sourceFormat: rosterSource.format,
      rosterSourceSha256
    },
    completeRosterCoachIds: [...completeRosterCoachIds].sort(),
    resolutionReport: {
      containsClientNames: false,
      inputCount: reports.reduce((total, report) => total + report.inputCount, 0),
      resolvedCount: reports.reduce((total, report) => total + report.resolvedCount, 0),
      skippedCount: reports.reduce((total, report) => total + report.skippedCount, 0),
      outputEntryCount: entries.length,
      rosters: reports
    },
    entries
  };
  reference.contentSha256 = contentHash(reference);
  return reference;
}

function main() {
  const args = parseArgs();
  if (!args.backup || !args.roster || !args.output) {
    throw new Error("Usage: --backup <backup prive> --roster <source roster privee> --output <reference privee> [--allow-name-bridge]");
  }
  const backup = readJsonPrivate(args.backup);
  const rosterSource = readJsonPrivate(args.roster);
  const reference = buildReference({
    backup,
    rosterSource,
    allowNameBridge: args["allow-name-bridge"] === true
  });
  const output = writeJsonPrivate(args.output, reference);
  process.stdout.write(`${JSON.stringify({
    output,
    referenceSha256: reference.contentSha256,
    completeRosterCoachIds: reference.completeRosterCoachIds,
    resolutionReport: reference.resolutionReport
  }, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Reference ownership refusee: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { buildReference };
