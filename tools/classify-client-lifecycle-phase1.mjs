#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function clean(value) {
  return String(value ?? "").trim();
}

function isActiveConfirmedWithoutStableSource(data = {}) {
  return data.clientSelectable === true
    && clean(data.status) === "active"
    && clean(data.ownershipStatus) === "confirmed"
    && !clean(data.sourceClientId);
}

function lifecycleClassification(data = {}) {
  if (clean(data.sourceIdentitySystem).toLowerCase() === "coachrx") {
    return "coachrx_claim_without_stable_id";
  }
  return "dashboard_only_candidate";
}

function emptyCoachBucket() {
  return {
    total: 0,
    dashboardOnlyCandidates: 0,
    coachRxClaimsWithoutStableId: 0
  };
}

/**
 * Produces an aggregate-only, read-only classification. The returned object
 * deliberately excludes document ids, names, phone numbers and email addresses.
 */
export function classifyClientLifecycleSnapshot(snapshot = {}) {
  const documents = Array.isArray(snapshot.documents) ? snapshot.documents : [];
  const eligible = documents
    .map((document) => document?.data || {})
    .filter(isActiveConfirmedWithoutStableSource);

  const coachBuckets = new Map();
  const classifications = {
    dashboard_only_candidate: 0,
    coachrx_claim_without_stable_id: 0
  };
  const classificationSignals = {
    dashboardOnlyCandidates: { withVerifiedGhlContactId: 0, withNormalizedPhone: 0, withCsmEnrichment: 0 },
    coachRxClaimsWithoutStableId: { withVerifiedGhlContactId: 0, withNormalizedPhone: 0, withCsmEnrichment: 0 }
  };
  const signals = {
    withVerifiedGhlContactId: 0,
    withNormalizedPhone: 0,
    withCsmEnrichment: 0,
    withLegacyCoachRxIdField: 0,
    withStableCoachRxClientId: 0
  };

  for (const data of eligible) {
    const classification = lifecycleClassification(data);
    classifications[classification] += 1;
    const classificationSignalBucket = classification === "dashboard_only_candidate"
      ? classificationSignals.dashboardOnlyCandidates
      : classificationSignals.coachRxClaimsWithoutStableId;

    const coachId = clean(data.dashboardResponsibleCoachId || data.coachId) || "unassigned";
    const bucket = coachBuckets.get(coachId) || emptyCoachBucket();
    bucket.total += 1;
    if (classification === "dashboard_only_candidate") bucket.dashboardOnlyCandidates += 1;
    if (classification === "coachrx_claim_without_stable_id") bucket.coachRxClaimsWithoutStableId += 1;
    coachBuckets.set(coachId, bucket);

    if (clean(data.ghlLink?.contactId || data.ghlContactId || data.externalIdentities?.ghl?.contactId)) {
      signals.withVerifiedGhlContactId += 1;
      classificationSignalBucket.withVerifiedGhlContactId += 1;
    }
    if (clean(data.phoneNormalized || data.clientPhoneNormalized)) {
      signals.withNormalizedPhone += 1;
      classificationSignalBucket.withNormalizedPhone += 1;
    }
    if (clean(data.csmEnrichedAt || data.lastCsmSheetEnrichmentAt)) {
      signals.withCsmEnrichment += 1;
      classificationSignalBucket.withCsmEnrichment += 1;
    }
    if (clean(data.coachRxId)) signals.withLegacyCoachRxIdField += 1;
    if (clean(data.coachRxLink?.sourceClientId || data.externalIdentities?.coachrx?.clientId)) {
      signals.withStableCoachRxClientId += 1;
    }
  }

  const byCoach = Object.fromEntries(
    [...coachBuckets.entries()].sort(([left], [right]) => left.localeCompare(right))
  );

  return {
    schema: "cfsb-client-lifecycle-classification/v1",
    mode: "read_only_aggregate",
    sourceCollection: clean(snapshot.collection) || "clients",
    snapshotDocumentCount: documents.length,
    activeConfirmedWithoutStableSourceId: eligible.length,
    classifications: {
      dashboardOnlyCandidates: classifications.dashboard_only_candidate,
      coachRxClaimsWithoutStableId: classifications.coachrx_claim_without_stable_id
    },
    byCoach,
    signals,
    classificationSignals,
    interpretation: {
      dashboardOnlyCandidate: "Absence normale de lien CoachRx; confirmer l'identite interne et, si pertinent, le lien GHL.",
      coachRxClaimWithoutStableId: "Rechercher une identite CoachRx verifiee ou reclassifier la fiche comme Dashboard seulement.",
      legacyCoachRxIdWarning: "Le champ coachRxId historique designe souvent le coach et ne prouve jamais l'identite CoachRx du client."
    },
    privacy: {
      aggregateOnly: true,
      containsDocumentIds: false,
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
    throw new Error("Usage: node tools/classify-client-lifecycle-phase1.mjs --input <firestore-clients.json>");
  }
  return argv[index + 1];
}

async function main() {
  const inputPath = parseInputArgument(process.argv.slice(2));
  const inputBuffer = await readFile(inputPath);
  const snapshot = JSON.parse(inputBuffer.toString("utf8"));
  const report = classifyClientLifecycleSnapshot(snapshot);
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
