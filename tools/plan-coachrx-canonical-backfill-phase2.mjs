#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function clean(value) {
  return String(value ?? "").trim();
}

function isCanonical(data = {}) {
  return Number(data.contractVersion) === 1
    && Boolean(clean(data.internalClientId))
    && ["dashboard_manual", "coachrx_import", "legacy_migrated"].includes(clean(data.originSystem));
}

function sourceLooksCoachRx(data = {}) {
  return clean(data.sourceIdentitySystem).toLowerCase() === "coachrx"
    || clean(data.sourceSystem).toLowerCase() === "coachrx"
    || /coachrx/i.test(clean(data.source || data.directSourceType || data.membershipSource));
}

function stableCoachRxSourceId(data = {}) {
  const canonicalId = clean(data.coachRxLink?.sourceClientId);
  if (canonicalId) return canonicalId;
  if (!sourceLooksCoachRx(data)) return "";
  return clean(data.sourceClientId || data.clientId);
}

function coachBucket() {
  return {
    total: 0,
    canonical: 0,
    dashboardOnly: 0,
    legacyCoachRxWithStableId: 0,
    coachRxMissingStableId: 0,
    needsReview: 0
  };
}

function identityClaimSet(snapshot = {}) {
  const claims = Array.isArray(snapshot.externalIdentityClaims)
    ? snapshot.externalIdentityClaims
    : [];
  return new Set(claims
    .map((entry) => entry?.data || entry || {})
    .filter((claim) => clean(claim.system).toLowerCase() === "coachrx")
    .map((claim) => clean(claim.externalId))
    .filter(Boolean));
}

/**
 * Read-only aggregate migration plan. External IDs are used only as in-memory
 * grouping keys and are never returned. No client document ID or PII is emitted.
 */
export function planCoachRxCanonicalBackfill(snapshot = {}) {
  const documents = Array.isArray(snapshot.documents) ? snapshot.documents : [];
  const claims = identityClaimSet(snapshot);
  const sourceGroups = new Map();
  const byCoach = new Map();
  const summary = {
    canonical: {
      total: 0,
      dashboardOnly: 0,
      verifiedActiveCoachRx: 0,
      verifiedNotInLatestRoster: 0,
      candidateCoachRx: 0,
      invalidContractShape: 0
    },
    legacy: {
      total: 0,
      coachRxLike: 0,
      withStableCoachRxSourceId: 0,
      withoutStableCoachRxSourceId: 0,
      readyForCanonicalMigration: 0,
      stableIdNeedsOwnershipReview: 0,
      activeCoachRxClaimsWithoutStableId: 0,
      activeDashboardOnlyCandidatesWithoutStableId: 0,
      historicalOrInactiveWithoutStableId: 0,
      needsReviewBeforePilot: 0
    },
    claims: {
      snapshotProvided: Array.isArray(snapshot.externalIdentityClaims),
      canonicalCoachRxLinks: 0,
      canonicalLinksNeedingClaim: 0
    }
  };

  for (const document of documents) {
    const data = document?.data || {};
    const canonical = isCanonical(data);
    const coachId = clean(data.dashboardResponsibleCoachId || data.coachId) || "unassigned";
    const bucket = byCoach.get(coachId) || coachBucket();
    bucket.total += 1;
    const sourceId = stableCoachRxSourceId(data);
    if (sourceId) {
      const count = sourceGroups.get(sourceId) || 0;
      sourceGroups.set(sourceId, count + 1);
    }

    if (canonical) {
      bucket.canonical += 1;
      summary.canonical.total += 1;
      const linkStatus = clean(data.coachRxLink?.linkStatus);
      const rosterStatus = clean(data.coachRxLink?.rosterStatus);
      if (!data.coachRxLink) {
        summary.canonical.dashboardOnly += 1;
        bucket.dashboardOnly += 1;
      } else if (!sourceId || !["candidate", "verified"].includes(linkStatus)) {
        summary.canonical.invalidContractShape += 1;
        bucket.needsReview += 1;
      } else if (linkStatus === "candidate") {
        summary.canonical.candidateCoachRx += 1;
        bucket.needsReview += 1;
      } else if (rosterStatus === "active") {
        summary.canonical.verifiedActiveCoachRx += 1;
      } else if (rosterStatus === "not_in_latest_roster") {
        summary.canonical.verifiedNotInLatestRoster += 1;
      }
      if (sourceId) {
        summary.claims.canonicalCoachRxLinks += 1;
        if (summary.claims.snapshotProvided && !claims.has(sourceId)) {
          summary.claims.canonicalLinksNeedingClaim += 1;
        }
      }
    } else {
      summary.legacy.total += 1;
      if (sourceLooksCoachRx(data)) {
        summary.legacy.coachRxLike += 1;
        if (sourceId) {
          summary.legacy.withStableCoachRxSourceId += 1;
          bucket.legacyCoachRxWithStableId += 1;
          const ownershipConfirmed = clean(data.ownershipStatus) === "confirmed"
            && clean(data.entityType) === "member"
            && data.clientSelectable === true
            && coachId !== "unassigned";
          if (ownershipConfirmed) summary.legacy.readyForCanonicalMigration += 1;
          else {
            summary.legacy.stableIdNeedsOwnershipReview += 1;
            bucket.needsReview += 1;
          }
        } else {
          summary.legacy.withoutStableCoachRxSourceId += 1;
          const activeConfirmed = clean(data.status) === "active"
            && clean(data.ownershipStatus) === "confirmed"
            && data.clientSelectable === true;
          if (activeConfirmed && clean(data.sourceIdentitySystem).toLowerCase() === "coachrx") {
            summary.legacy.activeCoachRxClaimsWithoutStableId += 1;
            summary.legacy.needsReviewBeforePilot += 1;
            bucket.coachRxMissingStableId += 1;
            bucket.needsReview += 1;
          } else if (activeConfirmed) {
            summary.legacy.activeDashboardOnlyCandidatesWithoutStableId += 1;
            bucket.dashboardOnly += 1;
          } else {
            summary.legacy.historicalOrInactiveWithoutStableId += 1;
          }
        }
      }
    }
    byCoach.set(coachId, bucket);
  }

  const duplicateGroups = [...sourceGroups.values()].filter((count) => count > 1);
  const duplicateDocuments = duplicateGroups.reduce((sum, count) => sum + count, 0);
  const conflicts = {
    duplicateCoachRxSourceIdGroups: duplicateGroups.length,
    documentsInDuplicateGroups: duplicateDocuments
  };
  const unresolved = summary.canonical.candidateCoachRx
    + summary.canonical.invalidContractShape
    + summary.legacy.withStableCoachRxSourceId
    + summary.legacy.activeCoachRxClaimsWithoutStableId
    + duplicateDocuments;

  return {
    schema: "cfsb-coachrx-canonical-backfill-plan/v2",
    mode: "read_only_aggregate_dry_run",
    sourceCollection: clean(snapshot.collection) || "clients",
    snapshotDocumentCount: documents.length,
    ...summary,
    conflicts,
    byCoach: Object.fromEntries([...byCoach.entries()].sort(([left], [right]) => left.localeCompare(right))),
    rolloutGate: {
      unresolvedRecords: unresolved,
      pendingStableIdMigrations: summary.legacy.withStableCoachRxSourceId,
      activeIdentityReviews: summary.legacy.activeCoachRxClaimsWithoutStableId
        + summary.canonical.candidateCoachRx
        + summary.canonical.invalidContractShape,
      canEnableCanonicalContractMode: unresolved === 0
        && (!summary.claims.snapshotProvided || summary.claims.canonicalLinksNeedingClaim === 0),
      requiredBeforeActivation: [
        "backfill_external_identity_claims_transactionally",
        "resolve_duplicate_coachrx_source_ids",
        "review_coachrx_rows_without_stable_id",
        "run_seven_coach_canary"
      ]
    },
    privacy: {
      aggregateOnly: true,
      containsDocumentIds: false,
      containsExternalIds: false,
      containsNames: false,
      containsPhones: false,
      containsEmails: false
    },
    liveWritesPerformed: 0
  };
}

function parseInputArgument(argv) {
  const index = argv.indexOf("--input");
  if (index === -1 || !argv[index + 1]) {
    throw new Error("Usage: node tools/plan-coachrx-canonical-backfill-phase2.mjs --input <firestore-clients.json>");
  }
  return argv[index + 1];
}

async function main() {
  const inputPath = parseInputArgument(process.argv.slice(2));
  const inputBuffer = await readFile(inputPath);
  const snapshot = JSON.parse(inputBuffer.toString("utf8"));
  const report = planCoachRxCanonicalBackfill(snapshot);
  report.inputSha256 = createHash("sha256").update(inputBuffer).digest("hex").toUpperCase();
  report.generatedAt = new Date().toISOString();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
