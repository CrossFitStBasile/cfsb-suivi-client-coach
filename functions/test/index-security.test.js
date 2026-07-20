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
