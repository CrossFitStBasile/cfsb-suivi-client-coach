"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const INDEX_SOURCE = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
const CONTRACT_SOURCE = fs.readFileSync(path.join(__dirname, "..", "client-contract.js"), "utf8");

test("les nouveaux contrats n'ecrivent pas externalIdentities", () => {
  assert.equal(CONTRACT_SOURCE.includes("externalIdentities"), false);
  const createStart = INDEX_SOURCE.indexOf("exports.createDashboardClient");
  const createEnd = INDEX_SOURCE.indexOf("exports.assignDashboardResponsible", createStart);
  const createSource = INDEX_SOURCE.slice(createStart, createEnd);
  assert.equal(createSource.includes("externalIdentities"), false);
  assert.match(createSource, /status:\s*"active"/);
  assert.match(createSource, /source:\s*"dashboard_manual"/);
  assert.match(createSource, /entityType:\s*"member"/);
  assert.match(createSource, /ownershipStatus:\s*"confirmed"/);
  assert.match(createSource, /clientSelectable:\s*true/);

  const payloadStart = createSource.indexOf("const payload = {");
  const payloadEnd = createSource.indexOf("const commandResult", payloadStart);
  const clientPayloadSource = createSource.slice(payloadStart, payloadEnd);
  assert.equal(/\bcoachId\s*:/.test(clientPayloadSource), false);
  assert.equal(/\bcoachRxId\s*:/.test(clientPayloadSource), false);
});

test("les parcours questionnaire sont fail-closed sans URL PII", () => {
  assert.equal(INDEX_SOURCE.includes("questionnaireUrl: buildQuestionnaireUrl"), false);
  const builderStart = INDEX_SOURCE.indexOf("function buildQuestionnaireUrl");
  const builderEnd = INDEX_SOURCE.indexOf("function phoneSearchCandidates", builderStart);
  const builderSource = INDEX_SOURCE.slice(builderStart, builderEnd);
  for (const piiParameter of ["phone", "client_name", "client_email", "coach_name"]) {
    assert.equal(builderSource.includes(`searchParams.set(\"${piiParameter}\"`), false);
  }
  assert.match(builderSource, /SECURE_QUESTIONNAIRE_LINK_ERROR/);
  assert.ok((INDEX_SOURCE.match(/deliveryStatus:\s*SECURE_QUESTIONNAIRE_LINK_ERROR/g) || []).length >= 3);
});

test("la creation reserve le signal telephone dans la meme transaction", () => {
  const createStart = INDEX_SOURCE.indexOf("exports.createDashboardClient");
  const createEnd = INDEX_SOURCE.indexOf("exports.assignDashboardResponsible", createStart);
  const createSource = INDEX_SOURCE.slice(createStart, createEnd);
  assert.match(createSource, /transaction\.get\(contactSignalRef\)/);
  assert.match(createSource, /transaction\.create\(contactSignalRef/);
  assert.equal(createSource.includes("contact_signal_same_coach"), false);
});

test("les sync legacy ne marquent jamais une identite canonique Dashboard comme stale", () => {
  assert.match(INDEX_SOURCE, /protectedSources:\s*new Set\(\["firebase_app_manual", "manual", "dashboard_manual"\]\)/);
  const guardStart = INDEX_SOURCE.indexOf("function clientCanonicalIdentityProtectedFromLegacyStale");
  const guardEnd = INDEX_SOURCE.indexOf("async function markStaleImportedRecords", guardStart);
  const guardSource = INDEX_SOURCE.slice(guardStart, guardEnd);
  assert.match(guardSource, /isCanonicalContractRecord/);
  const canonicalStart = INDEX_SOURCE.indexOf("function isCanonicalContractRecord");
  const canonicalEnd = INDEX_SOURCE.indexOf("function indexClientMatch", canonicalStart);
  const canonicalSource = INDEX_SOURCE.slice(canonicalStart, canonicalEnd);
  assert.match(canonicalSource, /"dashboard_manual"/);
  assert.match(canonicalSource, /"coachrx_import"/);
  assert.match(canonicalSource, /"legacy_migrated"/);
  const staleWriterStart = INDEX_SOURCE.indexOf("async function markStaleImportedRecords");
  const staleWriterEnd = INDEX_SOURCE.indexOf("function buildTaskRecords", staleWriterStart);
  assert.match(
    INDEX_SOURCE.slice(staleWriterStart, staleWriterEnd),
    /collectionName === "clients" && clientCanonicalIdentityProtectedFromLegacyStale/
  );
});

test("les trois writers legacy refusent toute fiche contractuelle canonique", () => {
  assert.match(INDEX_SOURCE, /function isCanonicalContractRecord/);
  const writerRanges = [
    ["function buildClientRecords", "function assessCoachRxPortfolioClient"],
    ["function buildGhlContactEnrichmentRecords", "function createClientMatchIndex"],
    ["function buildClientEnrichmentRecords", "function collectStaleImportedDocs"]
  ];
  for (const [startMarker, endMarker] of writerRanges) {
    const start = INDEX_SOURCE.indexOf(startMarker);
    const end = INDEX_SOURCE.indexOf(endMarker, start);
    assert.match(INDEX_SOURCE.slice(start, end), /isCanonicalContractRecord/);
  }
  assert.match(INDEX_SOURCE, /canonical_contract_writer_required/);
  assert.match(INDEX_SOURCE, /ecriture legacy bloquee/);

  const matcherStart = INDEX_SOURCE.indexOf("function findClientMatch");
  const matcherEnd = INDEX_SOURCE.indexOf("function buildClientEnrichmentRecords", matcherStart);
  const matcherSource = INDEX_SOURCE.slice(matcherStart, matcherEnd);
  assert.ok(matcherSource.indexOf("index.bySource.get(sourceKey)") < matcherSource.indexOf("index.byPhone.get(phone)"));
});

test("les commandes client restent bornees aux sept coachs pilotes", () => {
  const start = INDEX_SOURCE.indexOf("async function requireActiveClientCoach");
  const end = INDEX_SOURCE.indexOf("function requiredClientDisplayName", start);
  const helperSource = INDEX_SOURCE.slice(start, end);
  assert.match(helperSource, /isPilotCoachId\(canonicalId\)/);
  assert.match(helperSource, /failed-precondition/);
});

test("la proposition CoachRx est une commande admin idempotente qui reserve un claim candidat", () => {
  const start = INDEX_SOURCE.indexOf("exports.proposeCoachRxLink");
  const end = INDEX_SOURCE.indexOf("exports.confirmCoachRxLink", start);
  const source = INDEX_SOURCE.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(source, /requireAdminProfile\(request\)/);
  assert.match(source, /requireActiveClientCoach\(data\.coachRxOwnerId\)/);
  assert.match(source, /command:\s*"proposeCoachRxLink"/);
  assert.match(source, /type:\s*"propose_coachrx_link"/);
  assert.match(source, /idempotencyKey/);

  const runnerStart = INDEX_SOURCE.indexOf("async function runAdminClientContractTransition");
  const runnerEnd = INDEX_SOURCE.indexOf("function clientCommandHttpsError", runnerStart);
  const runner = INDEX_SOURCE.slice(runnerStart, runnerEnd);
  assert.match(runner, /resolveExternalIdentityClaim/);
  assert.match(runner, /"propose_coachrx_link", "confirm_coachrx_link"/);
  assert.match(runner, /status:\s*nextContract\.coachRxLink\.linkStatus === "verified" \? "active" : "candidate"/);
  assert.match(runner, /transaction\.create\(receiptRef/);
});

test("le writer CoachRx canonique est explicitement gate et transactionnel", () => {
  const contextStart = INDEX_SOURCE.indexOf("async function resolveValidatedImportContext");
  const contextEnd = INDEX_SOURCE.indexOf("function firstUsefulValue", contextStart);
  const context = INDEX_SOURCE.slice(contextStart, contextEnd);
  assert.match(context, /Number\(payload\.clientContractVersion\) === 1/);
  assert.match(context, /canonicalContractMode\)\.toLowerCase\(\) === "phase2"/);
  assert.match(context, /requireCanonicalClientContractActivation\(coach\.id\)/);

  const importStart = INDEX_SOURCE.indexOf("async function processCanonicalCoachRxRosterImport");
  const importEnd = INDEX_SOURCE.indexOf("async function processDirectClientImport", importStart);
  const canonicalImport = INDEX_SOURCE.slice(importStart, importEnd);
  assert.match(canonicalImport, /sourceRunId:\s*ownershipContext\?\.sourceRunId/);
  assert.equal(canonicalImport.includes("ownershipContext?.sourceRunId || runId"), false);

  const activationStart = INDEX_SOURCE.indexOf("async function requireCanonicalClientContractActivation");
  const activationEnd = INDEX_SOURCE.indexOf("function clientOwnershipLockMessage", activationStart);
  const activation = INDEX_SOURCE.slice(activationStart, activationEnd);
  assert.match(activation, /systemConfig\/clientContractPhase2/);
  assert.match(activation, /data\.backfillCompleted === true/);
  assert.match(activation, /data\.claimsVerified === true/);
  assert.match(activation, /allowedCoachIds\.includes/);

  const writerStart = INDEX_SOURCE.indexOf("async function writeCanonicalCoachRxActiveObservation");
  const writerEnd = INDEX_SOURCE.indexOf("async function markCanonicalCoachRxRosterAbsences", writerStart);
  const writer = INDEX_SOURCE.slice(writerStart, writerEnd);
  assert.match(writer, /db\.runTransaction/);
  assert.match(writer, /externalIdentityClaimRef\("coachrx", sourceClientId\)/);
  assert.match(writer, /resolveExternalIdentityClaim/);
  assert.match(writer, /propose_coachrx_link/);
  assert.match(writer, /createCoachRxImportedClientContract/);
  assert.ok(
    (writer.match(/assertClientDocumentIdentity\(current, clientRef\.id\)/g) || []).length >= 2
  );
  assert.match(writer, /error\.code === "client_document_identity_mismatch"/);
  assert.match(writer, /sourceObservations/);
  assert.match(writer, /pending_identity_confirmation/);
  assert.equal(writer.includes("findClientMatch"), false);
  assert.equal(writer.includes("clientNameFromRow(row) ==="), false);

  const receiptStart = INDEX_SOURCE.indexOf("async function registerCoachRxRosterEnvelope");
  const receiptEnd = INDEX_SOURCE.indexOf("function canonicalCoachRxClientPayload", receiptStart);
  const receipt = INDEX_SOURCE.slice(receiptStart, receiptEnd);
  assert.match(receipt, /db\.runTransaction/);
  assert.match(receipt, /resolveCoachRxRosterReceipt/);
  assert.match(receipt, /fingerprint/);
});

test("les absences CoachRx exigent un roster complet horodate et ne suppriment jamais la fiche", () => {
  const start = INDEX_SOURCE.indexOf("async function markCanonicalCoachRxRosterAbsences");
  const end = INDEX_SOURCE.indexOf("async function processCanonicalCoachRxRosterImport", start);
  const source = INDEX_SOURCE.slice(start, end);
  assert.match(source, /if \(!envelope\.complete\)/);
  assert.match(source, /rosterStatus:\s*"not_in_latest_roster"/);
  assert.match(source, /rosterComplete:\s*true/);
  assert.match(source, /status:\s*"inactive"/);
  assert.equal(/transaction\.(?:delete|remove)/.test(source), false);
});

test("les statuts de pipeline sont separes sans perdre la compatibilite coachSyncStatus", () => {
  const firstStart = INDEX_SOURCE.indexOf("async function writeCoachSyncStatus");
  const firstEnd = INDEX_SOURCE.indexOf("function compactSyncDiagnostics", firstStart);
  const directStart = INDEX_SOURCE.indexOf("async function writeDirectCoachSyncStatus");
  const directEnd = INDEX_SOURCE.indexOf("function summarizeDirectImportResult", directStart);
  for (const source of [
    INDEX_SOURCE.slice(firstStart, firstEnd),
    INDEX_SOURCE.slice(directStart, directEnd)
  ]) {
    assert.match(source, /collection\("pipelines"\)\.doc\(pipeline\)/);
    assert.match(source, /buildLegacyCoachStatusPatch/);
    assert.match(source, /buildPipelineStatusData/);
  }
});
