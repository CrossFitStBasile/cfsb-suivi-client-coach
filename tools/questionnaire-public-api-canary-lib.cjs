"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const PROJECT_NUMBER = "129233025317";
const REGION = "us-central1";
const PUBLIC_API_FUNCTION_ID = "questionnairePublicApi";
const PUBLIC_API_URL =
  `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${PUBLIC_API_FUNCTION_ID}`;
const RECEIPT_VERSION = 1;
const RECEIPT_MAX_FUNCTION_AGE_MS = 4 * 60 * 60 * 1000;
const RECEIPT_MAX_DEPLOY_SPREAD_MS = 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const A2_FUNCTION_IDS = Object.freeze([
  "archiveQuestionnaireForm",
  "duplicateQuestionnaireForm",
  "listQuestionnaireForms",
  "publishQuestionnaireForm",
  "questionnairePublicApi",
  "saveQuestionnaireDraft",
  "setQuestionnaireDeliveryReady"
]);

const EXPECTED_INITIAL_FORMS = Object.freeze([
  Object.freeze({
    formId: "bilan_90_jours",
    slug: "bilan-90-jours",
    version: "1",
    versionHash: "24SVsZovDAoQnaxSRwL_r2P44-osMwM1RaRowxS0P9U",
    canonicalPath: "/questionnaire/f/bilan-90-jours"
  }),
  Object.freeze({
    formId: "check_in_express",
    slug: "check-in-express",
    version: "1",
    versionHash: "8Qy5V1W0kwVj4VTgFLjtD5CUzpCLgtbblCxm9zgLUS0",
    canonicalPath: "/questionnaire/f/check-in-express",
    fields: Object.freeze([
      Object.freeze({ id: "plan_still_good", type: "yes_no" }),
      Object.freeze({ id: "execution_good", type: "yes_no" }),
      Object.freeze({ id: "results_present", type: "yes_no" }),
      Object.freeze({ id: "check_in_comment", type: "long_text" })
    ])
  }),
  Object.freeze({
    formId: "evaluation_habitudes_vie",
    slug: "evaluation-habitudes-vie",
    version: "1",
    versionHash: "8N-zAfhNXBWAjRZKb0zG2RLi5RKUun5-qyTrZ3iyGoM",
    canonicalPath: "/questionnaire/f/evaluation-habitudes-vie"
  }),
  Object.freeze({
    formId: "reperes_cfsb",
    slug: "reperes-cfsb",
    version: "1",
    versionHash: "Cir10OcaFefqzXpmR83Xf598Y1EdWIiTzRClop59KGM",
    canonicalPath: "/questionnaire/f/reperes-cfsb"
  })
]);

class PublicApiCanaryError extends Error {
  constructor(code) {
    super(String(code || "public_api_canary_error"));
    this.name = "PublicApiCanaryError";
    this.code = String(code || "public_api_canary_error");
  }
}

function fail(code) {
  throw new PublicApiCanaryError(code);
}

function assertReleaseCommit(value) {
  const commit = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) fail("release_commit_invalid");
  return commit;
}

function parseArgs(argv = []) {
  let releaseCommit = "";
  let mode = "";
  for (const raw of argv) {
    const argument = String(raw || "");
    if (argument.startsWith("--release-commit=")) {
      if (releaseCommit) fail("release_commit_repeated");
      releaseCommit = assertReleaseCommit(
        argument.slice("--release-commit=".length)
      );
      continue;
    }
    if (["--preview", "--record-revision", "--execute", "--recover"].includes(argument)) {
      if (mode) fail("mode_repeated");
      mode = argument.slice(2);
      continue;
    }
    fail("argument_unknown");
  }
  if (!releaseCommit) fail("release_commit_missing");
  if (!mode) fail("mode_missing");
  return Object.freeze({ releaseCommit, mode });
}

function verifyExecutionAuthority(options, env = process.env) {
  if (options.mode === "preview") {
    return Object.freeze({ authorized: false, readOnly: true });
  }
  const commit = assertReleaseCommit(options.releaseCommit);
  if (String(env.CFSB_QUESTIONNAIRE_RELEASE_COMMIT || "").toLowerCase() !== commit) {
    fail("release_commit_env_mismatch");
  }
  if (String(env.CFSB_QUESTIONNAIRE_RELEASE_GO || "").toLowerCase() !== commit) {
    fail("release_go_missing");
  }
  if (String(env.CFSB_COACH_NOTICE_CONFIRMED || "").toLowerCase() !== commit) {
    fail("coach_notice_missing");
  }
  if (String(env.CFSB_QUESTIONNAIRE_RULES_CANARY_OK || "").toLowerCase() !== commit) {
    fail("rules_canary_proof_missing");
  }
  if (
    options.mode === "recover"
    && String(env.CFSB_QUESTIONNAIRE_A2_RECOVERY_GO || "").toLowerCase() !== commit
  ) {
    fail("a2_recovery_go_missing");
  }
  return Object.freeze({
    authorized: true,
    readOnly: !["execute", "recover"].includes(options.mode)
  });
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function sha256Base64Url(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("base64url");
}

function syntheticIdentityForCommit(releaseCommit) {
  const commit = assertReleaseCommit(releaseCommit);
  const suffix = Number.parseInt(commit.slice(0, 8), 16) % 100;
  return Object.freeze({
    name: "CFSB API Canary Non-Member",
    phone: `51455501${String(suffix).padStart(2, "0")}`
  });
}

function idempotencyKeyForCommit(releaseCommit) {
  return `cfsb-a2-public-api-${assertReleaseCommit(releaseCommit)}`;
}

function expectedResponseId({ slug, version, idempotencyKey }) {
  const scope = `${String(slug)}:${String(version)}:${String(idempotencyKey)}`;
  return `studio_${sha256Base64Url(scope).slice(0, 46)}`;
}

function expectedSubmissionFingerprint({ definition, submission }) {
  const releaseCommit = String(submission?.idempotencyKey || "")
    .slice("cfsb-a2-public-api-".length);
  const identity = syntheticIdentityForCommit(releaseCommit);
  return sha256Base64Url(stableJson({
    slug: definition?.slug,
    version: definition?.version,
    versionHash: definition?.versionHash,
    identity: {
      phoneNormalized: identity.phone,
      name: identity.name
    },
    answers: submission?.answers
  }));
}

function flattenPublicFields(questionnaire) {
  if (!Array.isArray(questionnaire?.sections)) fail("public_definition_sections_invalid");
  return questionnaire.sections.flatMap((section) => {
    if (!section || !Array.isArray(section.fields)) {
      fail("public_definition_sections_invalid");
    }
    return section.fields.map((field) => ({
      id: String(field?.id || ""),
      type: String(field?.type || "")
    }));
  });
}

function validatePublicDefinition(slugInput, payload) {
  const slug = String(slugInput || "");
  const expected = EXPECTED_INITIAL_FORMS.find((item) => item.slug === slug);
  if (!expected) fail("public_definition_slug_unexpected");
  exactKeys(payload, ["ok", "questionnaire"], "public_definition_envelope_invalid");
  if (payload.ok !== true) fail("public_definition_not_ok");
  const questionnaire = payload.questionnaire;
  if (!questionnaire || typeof questionnaire !== "object" || Array.isArray(questionnaire)) {
    fail("public_definition_invalid");
  }
  if (
    questionnaire.slug !== expected.slug
    || questionnaire.version !== expected.version
    || questionnaire.versionHash !== expected.versionHash
    || questionnaire.canonicalPath !== expected.canonicalPath
    || questionnaire.active !== true
  ) {
    fail("public_definition_candidate_mismatch");
  }
  if (
    stableJson(questionnaire.identity)
    !== stableJson({
      phoneRequired: true,
      nameRequired: true,
      emailRequired: false
    })
  ) {
    fail("public_definition_identity_contract_mismatch");
  }
  if (
    Object.hasOwn(questionnaire, "ghlTag")
    || Object.hasOwn(questionnaire, "rules")
    || Object.hasOwn(questionnaire, "responsePolicy")
  ) {
    fail("public_definition_private_metadata_exposed");
  }
  const fields = flattenPublicFields(questionnaire);
  if (fields.length === 0 || fields.some((field) => !field.id || !field.type)) {
    fail("public_definition_fields_invalid");
  }
  if (expected.fields && stableJson(fields) !== stableJson(expected.fields)) {
    fail("public_definition_checkin_contract_mismatch");
  }
  return Object.freeze({
    slug: expected.slug,
    version: expected.version,
    versionHash: expected.versionHash,
    canonicalPath: expected.canonicalPath,
    fields: Object.freeze(fields)
  });
}

function validateInitialDefinitions(entries) {
  if (!Array.isArray(entries) || entries.length !== EXPECTED_INITIAL_FORMS.length) {
    fail("public_definition_count_mismatch");
  }
  const bySlug = new Map();
  for (const entry of entries) {
    const slug = String(entry?.slug || "");
    if (bySlug.has(slug)) fail("public_definition_duplicate_slug");
    bySlug.set(slug, validatePublicDefinition(slug, entry?.payload));
  }
  for (const expected of EXPECTED_INITIAL_FORMS) {
    if (!bySlug.has(expected.slug)) fail("public_definition_missing");
  }
  return bySlug;
}

function validateInitialCatalogState(entries) {
  if (!Array.isArray(entries) || entries.length !== EXPECTED_INITIAL_FORMS.length) {
    fail("initial_catalog_count_mismatch");
  }
  const byFormId = new Map();
  for (const entry of entries) {
    const formId = String(entry?.formId || "");
    const expected = EXPECTED_INITIAL_FORMS.find((item) => item.formId === formId);
    if (!expected || byFormId.has(formId)) fail("initial_catalog_form_unexpected");
    const form = entry?.form;
    const catalog = entry?.catalog;
    const activeVersionId = `${expected.formId}_v${expected.version}`;
    if (
      !form
      || typeof form !== "object"
      || Array.isArray(form)
      || form.formId !== expected.formId
      || form.slug !== expected.slug
      || form.status !== "published"
      || form.deliveryReady !== false
      || form.activeVersion !== expected.version
      || form.activeVersionId !== activeVersionId
      || form.activeVersionHash !== expected.versionHash
      || form.publicPath !== expected.canonicalPath
      || form.hasUnpublishedChanges !== false
    ) {
      fail("initial_form_state_mismatch");
    }
    if (
      !catalog
      || typeof catalog !== "object"
      || Array.isArray(catalog)
      || catalog.formId !== expected.formId
      || catalog.slug !== expected.slug
      || catalog.status !== "published"
      || catalog.deliveryReady !== false
      || catalog.activeVersion !== expected.version
      || catalog.activeVersionId !== activeVersionId
      || catalog.activeVersionHash !== expected.versionHash
      || catalog.publicPath !== expected.canonicalPath
    ) {
      fail("initial_catalog_state_mismatch");
    }
    byFormId.set(formId, Object.freeze({
      formId,
      slug: expected.slug,
      version: expected.version,
      versionHash: expected.versionHash,
      deliveryReady: false
    }));
  }
  return byFormId;
}

function buildSubmission(checkInDefinition, releaseCommit) {
  if (checkInDefinition?.slug !== "check-in-express") {
    fail("checkin_definition_required");
  }
  const identity = syntheticIdentityForCommit(releaseCommit);
  return Object.freeze({
    idempotencyKey: idempotencyKeyForCommit(releaseCommit),
    identity,
    answers: Object.freeze({
      plan_still_good: true,
      execution_good: true,
      results_present: true
    }),
    meta: Object.freeze({
      sourceUrl: checkInDefinition.canonicalPath,
      definitionVersion: checkInDefinition.version,
      versionHash: checkInDefinition.versionHash
    })
  });
}

function changedSubmission(original) {
  return {
    idempotencyKey: original.idempotencyKey,
    identity: { ...original.identity },
    answers: {
      ...original.answers,
      results_present: false
    },
    meta: { ...original.meta }
  };
}

function validateAcknowledgement(payload, {
  idempotencyKey,
  responseId,
  duplicate,
  earliestMs,
  nowMs = Date.now()
}) {
  exactKeys(payload, ["ok", "response"], "ack_envelope_invalid");
  if (payload.ok !== true) fail("ack_not_ok");
  exactKeys(
    payload.response,
    ["stored", "idempotencyKey", "responseId", "duplicate", "receivedAt"],
    "ack_contract_invalid"
  );
  const response = payload.response;
  const receivedAtMs = new Date(String(response.receivedAt || "")).getTime();
  if (
    response.stored !== true
    || response.idempotencyKey !== idempotencyKey
    || response.responseId !== responseId
    || !/^studio_[A-Za-z0-9_-]{43}$/.test(response.responseId)
    || response.duplicate !== duplicate
    || !Number.isFinite(receivedAtMs)
    || receivedAtMs < Number(earliestMs) - CLOCK_SKEW_MS
    || receivedAtMs > Number(nowMs) + CLOCK_SKEW_MS
  ) {
    fail("ack_contract_invalid");
  }
  return Object.freeze({ receivedAt: new Date(receivedAtMs).toISOString() });
}

function validateIdempotencyConflict(status, payload) {
  if (Number(status) !== 409) fail("idempotency_conflict_status_invalid");
  exactKeys(payload, ["ok", "error"], "idempotency_conflict_envelope_invalid");
  if (payload.ok !== false) fail("idempotency_conflict_envelope_invalid");
  exactKeys(payload.error, ["code", "message"], "idempotency_conflict_envelope_invalid");
  if (
    payload.error.code !== "IDEMPOTENCY_CONFLICT"
    || typeof payload.error.message !== "string"
    || !payload.error.message.trim()
  ) {
    fail("idempotency_conflict_not_proven");
  }
  return true;
}

function validateStoredResponse(value, {
  definition,
  submission,
  responseId,
  receivedAt
}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("stored_response_invalid");
  }
  const identity = syntheticIdentityForCommit(
    submission.idempotencyKey.slice("cfsb-a2-public-api-".length)
  );
  const exactSubmissionFingerprint = expectedSubmissionFingerprint({
    definition,
    submission
  });
  const expectedVersionId = `check_in_express_v${definition.version}`;
  if (
    value.formId !== "check_in_express"
    || value.formVersionId !== expectedVersionId
    || value.formVersion !== definition.version
    || value.schemaHash !== definition.versionHash
    || value.idempotencyKey !== submission.idempotencyKey
    || value.idempotencyScope !==
      `${definition.slug}:${definition.version}:${submission.idempotencyKey}`
    || value.sourceUrl !== definition.canonicalPath
    || value.source !== "questionnaire_studio_public"
    || value.submittedAtIso !== receivedAt
    || value.createdAtIso !== receivedAt
    || value.clientPhoneNormalized !== identity.phone
    || value.clientNameEntered !== identity.name
    || value.routingStatus !== "unmatched"
    || Number(value.routingCandidateCount) !== 0
    || value.coachId !== "questionnaire_review"
    || value.processingStatus !== "unmatched"
    || value.coachActionType !== "validation_identite"
    || value.clientId !== ""
    || value.internalClientId !== ""
    || stableJson(value.answers) !== stableJson(submission.answers)
    || value.submissionFingerprint !== exactSubmissionFingerprint
    || responseId !== expectedResponseId({
      slug: definition.slug,
      version: definition.version,
      idempotencyKey: submission.idempotencyKey
    })
  ) {
    fail("stored_response_contract_mismatch");
  }
  for (const field of [
    "ghlContactId",
    "sourceClientId",
    "coachRxClientId",
    "dashboardOwnerCoachId"
  ]) {
    if (String(value[field] || "").trim()) fail("stored_response_member_link_detected");
  }
  return Object.freeze({
    invariantHash: sha256(stableJson({
      formId: value.formId,
      formVersionId: value.formVersionId,
      schemaHash: value.schemaHash,
      answers: value.answers,
      routingStatus: value.routingStatus,
      routingCandidateCount: Number(value.routingCandidateCount),
      coachId: value.coachId,
      processingStatus: value.processingStatus,
      coachActionType: value.coachActionType,
      clientId: value.clientId,
      internalClientId: value.internalClientId,
      idempotencyScope: value.idempotencyScope,
      submissionFingerprint: value.submissionFingerprint,
      submittedAtIso: value.submittedAtIso
    }))
  });
}

function validateStoredDocumentStability(
  first,
  next,
  mutationCode = "idempotent_replay_mutated_response"
) {
  for (const proof of [first, next]) {
    if (
      !proof
      || typeof proof !== "object"
      || Array.isArray(proof)
      || !Number.isFinite(new Date(String(proof.createTime || "")).getTime())
      || !Number.isFinite(new Date(String(proof.updateTime || "")).getTime())
      || !/^[a-f0-9]{64}$/.test(String(proof.documentHash || ""))
    ) {
      fail("stored_response_document_proof_invalid");
    }
  }
  if (
    first.createTime !== next.createTime
    || first.updateTime !== next.updateTime
    || first.documentHash !== next.documentHash
  ) {
    fail(mutationCode);
  }
  return true;
}

function decodeFirestoreValue(value = {}) {
  if (Object.hasOwn(value, "nullValue")) return null;
  if (Object.hasOwn(value, "stringValue")) return value.stringValue;
  if (Object.hasOwn(value, "booleanValue")) return value.booleanValue;
  if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if (Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
  if (Object.hasOwn(value, "arrayValue")) {
    return (value.arrayValue?.values || []).map(decodeFirestoreValue);
  }
  if (Object.hasOwn(value, "mapValue")) {
    return decodeFirestoreFields(value.mapValue?.fields || {});
  }
  fail("firestore_value_invalid");
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

function validateFunctionRevisions(functions, nowMs = Date.now()) {
  if (!Array.isArray(functions) || functions.length !== A2_FUNCTION_IDS.length) {
    fail("function_revision_count_mismatch");
  }
  const sorted = [...functions].sort((a, b) =>
    String(a?.functionId || "").localeCompare(String(b?.functionId || ""))
  );
  if (
    stableJson(sorted.map((entry) => entry.functionId))
    !== stableJson(A2_FUNCTION_IDS)
  ) {
    fail("function_revision_set_mismatch");
  }
  const updateTimes = [];
  for (const entry of sorted) {
    const functionId = String(entry.functionId || "");
    const expectedName = `projects/${PROJECT_ID}/locations/${REGION}/functions/${functionId}`;
    const updateMs = new Date(String(entry.updateTime || "")).getTime();
    if (
      entry.name !== expectedName
      || entry.state !== "ACTIVE"
      || entry.environment !== "GEN_2"
      || entry.allTrafficOnLatestRevision !== true
      || !String(entry.revision || "").toLowerCase().startsWith(functionId.toLowerCase())
      || !Number.isFinite(updateMs)
      || updateMs > nowMs + CLOCK_SKEW_MS
      || !String(entry.build || "").match(
        new RegExp(
          `^projects/(?:${PROJECT_ID}|${PROJECT_NUMBER})/locations/${REGION}/builds/`
        )
      )
      || !String(entry.service || "").match(
        new RegExp(
          `^projects/(?:${PROJECT_ID}|${PROJECT_NUMBER})/locations/${REGION}/services/`
        )
      )
      || !/^[a-f0-9]{64}$/.test(String(entry.sourceProvenanceHash || ""))
    ) {
      fail("function_revision_invalid");
    }
    updateTimes.push(updateMs);
  }
  if (Math.max(...updateTimes) - Math.min(...updateTimes) > RECEIPT_MAX_DEPLOY_SPREAD_MS) {
    fail("function_revision_deploy_spread_invalid");
  }
  return Object.freeze(sorted.map((entry) => Object.freeze({ ...entry })));
}

function buildRevisionReceipt(releaseCommit, functions, recordedAt = new Date().toISOString()) {
  const commit = assertReleaseCommit(releaseCommit);
  const recordedAtMs = new Date(recordedAt).getTime();
  if (!Number.isFinite(recordedAtMs)) fail("revision_receipt_time_invalid");
  const validated = validateFunctionRevisions(functions, recordedAtMs);
  if (
    validated.some((entry) =>
      recordedAtMs - new Date(entry.updateTime).getTime()
        > RECEIPT_MAX_FUNCTION_AGE_MS
    )
  ) {
    fail("function_revision_not_recent");
  }
  return {
    version: RECEIPT_VERSION,
    projectId: PROJECT_ID,
    region: REGION,
    releaseCommit: commit,
    recordedAt: new Date(recordedAtMs).toISOString(),
    functions: validated
  };
}

function refreshRevisionReceipt(existing, releaseCommit, liveFunctions, recordedAt = new Date().toISOString()) {
  const commit = assertReleaseCommit(releaseCommit);
  const recordedAtMs = new Date(recordedAt).getTime();
  if (!Number.isFinite(recordedAtMs)) fail("revision_receipt_time_invalid");
  const live = validateFunctionRevisions(liveFunctions, recordedAtMs);
  if (
    existing?.version !== RECEIPT_VERSION
    || existing?.projectId !== PROJECT_ID
    || existing?.region !== REGION
    || existing?.releaseCommit !== commit
    || stableJson(existing.functions) !== stableJson(live)
  ) {
    fail("revision_receipt_refresh_mismatch");
  }
  return {
    ...existing,
    recordedAt: new Date(recordedAtMs).toISOString(),
    functions: live
  };
}

function verifyRevisionReceipt(receipt, releaseCommit, liveFunctions, nowMs = Date.now()) {
  const commit = assertReleaseCommit(releaseCommit);
  const live = validateFunctionRevisions(liveFunctions, nowMs);
  const recordedAtMs = new Date(String(receipt?.recordedAt || "")).getTime();
  if (
    receipt?.version !== RECEIPT_VERSION
    || receipt?.projectId !== PROJECT_ID
    || receipt?.region !== REGION
    || receipt?.releaseCommit !== commit
    || !Number.isFinite(recordedAtMs)
    || recordedAtMs > nowMs + CLOCK_SKEW_MS
    || nowMs - recordedAtMs > RECEIPT_MAX_FUNCTION_AGE_MS
    || stableJson(receipt.functions) !== stableJson(live)
  ) {
    fail("revision_receipt_mismatch");
  }
  return true;
}

function revisionReceiptPath(localAppData, releaseCommit) {
  const base = String(localAppData || "").trim();
  if (!base) fail("local_receipt_directory_unavailable");
  return path.join(
    base,
    "CFSB",
    "questionnaire-release",
    `public-api-revisions-${assertReleaseCommit(releaseCommit)}.receipt.json`
  );
}

function safeResultError(error) {
  if (
    error instanceof PublicApiCanaryError
    && /^[a-z0-9_]+$/.test(error.code)
  ) {
    return error.code;
  }
  return "unexpected_error";
}

module.exports = {
  PROJECT_ID,
  PROJECT_NUMBER,
  REGION,
  PUBLIC_API_FUNCTION_ID,
  PUBLIC_API_URL,
  A2_FUNCTION_IDS,
  EXPECTED_INITIAL_FORMS,
  RECEIPT_VERSION,
  PublicApiCanaryError,
  assertReleaseCommit,
  parseArgs,
  verifyExecutionAuthority,
  stableJson,
  sha256,
  syntheticIdentityForCommit,
  idempotencyKeyForCommit,
  expectedResponseId,
  expectedSubmissionFingerprint,
  validatePublicDefinition,
  validateInitialDefinitions,
  validateInitialCatalogState,
  buildSubmission,
  changedSubmission,
  validateAcknowledgement,
  validateIdempotencyConflict,
  validateStoredResponse,
  validateStoredDocumentStability,
  decodeFirestoreValue,
  decodeFirestoreFields,
  validateFunctionRevisions,
  buildRevisionReceipt,
  refreshRevisionReceipt,
  verifyRevisionReceipt,
  revisionReceiptPath,
  safeResultError
};
