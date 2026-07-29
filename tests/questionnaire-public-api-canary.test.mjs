import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  PROJECT_ID,
  PROJECT_NUMBER,
  REGION,
  A2_FUNCTION_IDS,
  EXPECTED_INITIAL_FORMS,
  parseArgs,
  verifyExecutionAuthority,
  stableJson,
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
  buildRevisionReceipt,
  refreshRevisionReceipt,
  verifyRevisionReceipt,
  revisionReceiptPath,
  safeResultError
} = require("../tools/questionnaire-public-api-canary-lib.cjs");
const questionnaireStudio = require("../functions/questionnaire-studio.js");

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..");
const RUNNER_SOURCE = fs.readFileSync(
  path.join(ROOT, "tools", "run-questionnaire-public-api-canary.cjs"),
  "utf8"
);
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const OTHER_COMMIT = "89abcdef0123456789abcdef0123456789abcdef";

function assertCanaryError(callback, code) {
  assert.throws(callback, (error) => {
    assert.equal(error?.code, code);
    assert.equal(safeResultError(error), code);
    return true;
  });
}

function publicPayload(expected) {
  const fields = expected.fields
    ? expected.fields.map((field) => ({
      ...field,
      label: field.id,
      required: field.type !== "long_text"
    }))
    : [{ id: `${expected.slug}-field`, type: "yes_no", label: "Question" }];
  return {
    ok: true,
    questionnaire: {
      schemaVersion: 1,
      slug: expected.slug,
      version: expected.version,
      versionHash: expected.versionHash,
      canonicalPath: expected.canonicalPath,
      title: expected.slug,
      active: true,
      identity: {
        phoneRequired: true,
        nameRequired: true,
        emailRequired: false
      },
      settings: { kind: expected.fields ? "check_in" : "assessment" },
      sections: [{
        id: "section",
        title: "Section",
        fields
      }],
      presentation: { mode: "steps", review: true },
      confirmation: { title: "Merci", message: "Reçue" }
    }
  };
}

function initialDefinitionEntries() {
  return EXPECTED_INITIAL_FORMS.map((expected) => ({
    slug: expected.slug,
    payload: publicPayload(expected)
  }));
}

function initialCatalogEntries() {
  return EXPECTED_INITIAL_FORMS.map((expected) => ({
    formId: expected.formId,
    form: {
      formId: expected.formId,
      slug: expected.slug,
      status: "published",
      deliveryReady: expected.deliveryReady,
      activeVersion: expected.version,
      activeVersionId: `${expected.formId}_v${expected.version}`,
      activeVersionHash: expected.versionHash,
      publicPath: expected.canonicalPath,
      hasUnpublishedChanges: false
    },
    catalog: {
      formId: expected.formId,
      slug: expected.slug,
      status: "published",
      deliveryReady: expected.deliveryReady,
      activeVersion: expected.version,
      activeVersionId: `${expected.formId}_v${expected.version}`,
      activeVersionHash: expected.versionHash,
      publicPath: expected.canonicalPath
    }
  }));
}

function revisionFixture(nowMs = Date.now()) {
  return A2_FUNCTION_IDS.map((functionId) => ({
    functionId,
    name: `projects/${PROJECT_ID}/locations/${REGION}/functions/${functionId}`,
    state: "ACTIVE",
    environment: "GEN_2",
    allTrafficOnLatestRevision: true,
    revision: `${functionId.toLowerCase()}-00001-abc`,
    updateTime: new Date(nowMs - 5 * 60 * 1000).toISOString(),
    build:
      `projects/${PROJECT_NUMBER}/locations/${REGION}/builds/${functionId}`,
    service:
      `projects/${PROJECT_ID}/locations/${REGION}/services/${functionId}`,
    sourceProvenanceHash: "a".repeat(64)
  }));
}

function responseFixture({ definition, submission, responseId, receivedAt }) {
  return {
    formId: "check_in_express",
    formVersionId: `check_in_express_v${definition.version}`,
    formVersion: definition.version,
    schemaHash: definition.versionHash,
    answers: { ...submission.answers },
    routingStatus: "unmatched",
    routingCandidateCount: 0,
    coachId: "questionnaire_review",
    processingStatus: "unmatched",
    coachActionType: "validation_identite",
    clientId: "",
    internalClientId: "",
    clientNameEntered: submission.identity.name,
    clientPhoneNormalized: submission.identity.phone,
    idempotencyKey: submission.idempotencyKey,
    idempotencyScope:
      `${definition.slug}:${definition.version}:${submission.idempotencyKey}`,
    submissionFingerprint: expectedSubmissionFingerprint({
      definition,
      submission
    }),
    sourceUrl: definition.canonicalPath,
    source: "questionnaire_studio_public",
    submittedAtIso: receivedAt,
    createdAtIso: receivedAt,
    ghlContactId: "",
    sourceClientId: "",
    coachRxClientId: "",
    dashboardOwnerCoachId: "",
    responseId
  };
}

test("arguments require one explicit mode and one exact 40-character SHA", () => {
  assert.deepEqual(
    parseArgs([`--release-commit=${COMMIT}`, "--preview"]),
    { releaseCommit: COMMIT, mode: "preview" }
  );
  assert.deepEqual(
    parseArgs([`--release-commit=${COMMIT}`, "--record-revision"]),
    { releaseCommit: COMMIT, mode: "record-revision" }
  );
  assert.deepEqual(
    parseArgs([`--release-commit=${COMMIT}`, "--execute"]),
    { releaseCommit: COMMIT, mode: "execute" }
  );
  assert.deepEqual(
    parseArgs([`--release-commit=${COMMIT}`, "--recover"]),
    { releaseCommit: COMMIT, mode: "recover" }
  );
  assertCanaryError(() => parseArgs(["--preview"]), "release_commit_missing");
  assertCanaryError(
    () => parseArgs([`--release-commit=${COMMIT}`]),
    "mode_missing"
  );
  assertCanaryError(
    () => parseArgs([`--release-commit=${COMMIT}`, "--force"]),
    "argument_unknown"
  );
  assertCanaryError(
    () => parseArgs([
      `--release-commit=${COMMIT}`,
      "--preview",
      "--execute"
    ]),
    "mode_repeated"
  );
  assertCanaryError(
    () => parseArgs([`--release-commit=${COMMIT.slice(1)}`, "--preview"]),
    "release_commit_invalid"
  );
});

test("record and execute authority is sealed to GO, notice, rules proof and SHA", () => {
  assert.deepEqual(
    verifyExecutionAuthority({ releaseCommit: COMMIT, mode: "preview" }, {}),
    { authorized: false, readOnly: true }
  );
  const complete = {
    CFSB_QUESTIONNAIRE_RELEASE_COMMIT: COMMIT,
    CFSB_QUESTIONNAIRE_RELEASE_GO: COMMIT,
    CFSB_COACH_NOTICE_CONFIRMED: COMMIT,
    CFSB_QUESTIONNAIRE_RULES_CANARY_OK: COMMIT
  };
  assert.deepEqual(
    verifyExecutionAuthority(
      { releaseCommit: COMMIT, mode: "record-revision" },
      complete
    ),
    { authorized: true, readOnly: true }
  );
  assert.deepEqual(
    verifyExecutionAuthority(
      { releaseCommit: COMMIT, mode: "execute" },
      complete
    ),
    { authorized: true, readOnly: false }
  );
  assertCanaryError(
    () => verifyExecutionAuthority(
      { releaseCommit: COMMIT, mode: "recover" },
      complete
    ),
    "a2_recovery_go_missing"
  );
  assert.deepEqual(
    verifyExecutionAuthority(
      { releaseCommit: COMMIT, mode: "recover" },
      { ...complete, CFSB_QUESTIONNAIRE_A2_RECOVERY_GO: COMMIT }
    ),
    { authorized: true, readOnly: false }
  );
  for (const [missing, code] of [
    ["CFSB_QUESTIONNAIRE_RELEASE_COMMIT", "release_commit_env_mismatch"],
    ["CFSB_QUESTIONNAIRE_RELEASE_GO", "release_go_missing"],
    ["CFSB_COACH_NOTICE_CONFIRMED", "coach_notice_missing"],
    ["CFSB_QUESTIONNAIRE_RULES_CANARY_OK", "rules_canary_proof_missing"]
  ]) {
    const environment = { ...complete };
    delete environment[missing];
    assertCanaryError(
      () => verifyExecutionAuthority(
        { releaseCommit: COMMIT, mode: "execute" },
        environment
      ),
      code
    );
  }
});

test("synthetic identity and idempotency are deterministic, reserved and SHA-bound", () => {
  const identity = syntheticIdentityForCommit(COMMIT);
  assert.equal(identity.name, "CFSB API Canary Non-Member");
  assert.match(identity.phone, /^51455501\d{2}$/);
  assert.equal(
    idempotencyKeyForCommit(COMMIT),
    `cfsb-a2-public-api-${COMMIT}`
  );
  const responseId = expectedResponseId({
    slug: "check-in-express",
    version: "1",
    idempotencyKey: idempotencyKeyForCommit(COMMIT)
  });
  const exactScope =
    `check-in-express:1:${idempotencyKeyForCommit(COMMIT)}`;
  assert.equal(
    responseId,
    `studio_${createHash("sha256").update(exactScope).digest("base64url")}`
  );
  assert.match(responseId, /^studio_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(
    responseId,
    expectedResponseId({
      slug: "check-in-express",
      version: "1",
      idempotencyKey: idempotencyKeyForCommit(OTHER_COMMIT)
    })
  );
  const definitions = validateInitialDefinitions(initialDefinitionEntries());
  const publicDefinition = definitions.get("check-in-express");
  const submission = buildSubmission(publicDefinition, COMMIT);
  const publishedDefinition = questionnaireStudio.publishDraft(
    questionnaireStudio.INITIAL_DRAFTS.checkIn,
    {
      version: "1",
      publishedAt: "2026-07-23T00:00:00.000Z"
    }
  );
  const backendValidated = questionnaireStudio.validateSubmission(
    publishedDefinition,
    submission
  );
  assert.equal(
    expectedSubmissionFingerprint({
      definition: publicDefinition,
      submission
    }),
    backendValidated.submissionFingerprint
  );
});

test("the exact four initial public definitions are required without private metadata", () => {
  const definitions = validateInitialDefinitions(initialDefinitionEntries());
  assert.equal(definitions.size, 4);
  assert.deepEqual(
    [...definitions.keys()].sort(),
    EXPECTED_INITIAL_FORMS.map((entry) => entry.slug).sort()
  );
  assert.deepEqual(
    definitions.get("check-in-express").fields,
    [
      { id: "plan_still_good", type: "yes_no" },
      { id: "execution_good", type: "yes_no" },
      { id: "results_present", type: "yes_no" },
      { id: "check_in_comment", type: "long_text" }
    ]
  );
  const exposed = publicPayload(EXPECTED_INITIAL_FORMS[0]);
  exposed.questionnaire.ghlTag = "private";
  assertCanaryError(
    () => validatePublicDefinition(EXPECTED_INITIAL_FORMS[0].slug, exposed),
    "public_definition_private_metadata_exposed"
  );
  const identityOptional = publicPayload(EXPECTED_INITIAL_FORMS[0]);
  identityOptional.questionnaire.identity.phoneRequired = false;
  assertCanaryError(
    () => validatePublicDefinition(
      EXPECTED_INITIAL_FORMS[0].slug,
      identityOptional
    ),
    "public_definition_identity_contract_mismatch"
  );
  assertCanaryError(
    () => validateInitialDefinitions(initialDefinitionEntries().slice(1)),
    "public_definition_count_mismatch"
  );
});

test("the four form and catalog documents preserve the exact staged delivery state", () => {
  const state = validateInitialCatalogState(initialCatalogEntries());
  assert.equal(state.size, 4);
  assert.deepEqual(
    [...state.keys()].sort(),
    EXPECTED_INITIAL_FORMS.map((entry) => entry.formId).sort()
  );
  const wrongFormState = initialCatalogEntries();
  wrongFormState[0].form.deliveryReady = !EXPECTED_INITIAL_FORMS[0].deliveryReady;
  assertCanaryError(
    () => validateInitialCatalogState(wrongFormState),
    "initial_form_state_mismatch"
  );
  const wrongCatalogState = initialCatalogEntries();
  wrongCatalogState[0].catalog.deliveryReady =
    !EXPECTED_INITIAL_FORMS[0].deliveryReady;
  assertCanaryError(
    () => validateInitialCatalogState(wrongCatalogState),
    "initial_catalog_state_mismatch"
  );
  assertCanaryError(
    () => validateInitialCatalogState(initialCatalogEntries().slice(1)),
    "initial_catalog_count_mismatch"
  );
});

test("the changed replay preserves identity and key and changes only one answer", () => {
  const definitions = validateInitialDefinitions(initialDefinitionEntries());
  const submission = buildSubmission(
    definitions.get("check-in-express"),
    COMMIT
  );
  assert.deepEqual(submission.answers, {
    plan_still_good: true,
    execution_good: true,
    results_present: true
  });
  const changed = changedSubmission(submission);
  assert.equal(changed.idempotencyKey, submission.idempotencyKey);
  assert.deepEqual(changed.identity, submission.identity);
  assert.deepEqual(changed.meta, submission.meta);
  assert.deepEqual(changed.answers, {
    plan_still_good: true,
    execution_good: true,
    results_present: false
  });
});

test("first and duplicate acknowledgements use the strict exact contract", () => {
  const responseId = expectedResponseId({
    slug: "check-in-express",
    version: "1",
    idempotencyKey: idempotencyKeyForCommit(COMMIT)
  });
  const nowMs = Date.parse("2026-07-28T14:00:00.000Z");
  const first = {
    ok: true,
    response: {
      stored: true,
      idempotencyKey: idempotencyKeyForCommit(COMMIT),
      responseId,
      duplicate: false,
      receivedAt: new Date(nowMs).toISOString()
    }
  };
  assert.deepEqual(
    validateAcknowledgement(first, {
      idempotencyKey: idempotencyKeyForCommit(COMMIT),
      responseId,
      duplicate: false,
      earliestMs: nowMs,
      nowMs
    }),
    { receivedAt: new Date(nowMs).toISOString() }
  );
  const duplicate = structuredClone(first);
  duplicate.response.duplicate = true;
  validateAcknowledgement(duplicate, {
    idempotencyKey: idempotencyKeyForCommit(COMMIT),
    responseId,
    duplicate: true,
    earliestMs: nowMs,
    nowMs
  });
  const extra = structuredClone(first);
  extra.response.extra = true;
  assertCanaryError(
    () => validateAcknowledgement(extra, {
      idempotencyKey: idempotencyKeyForCommit(COMMIT),
      responseId,
      duplicate: false,
      earliestMs: nowMs,
      nowMs
    }),
    "ack_contract_invalid"
  );
  const wrongTime = structuredClone(first);
  wrongTime.response.receivedAt = "not-a-time";
  assertCanaryError(
    () => validateAcknowledgement(wrongTime, {
      idempotencyKey: idempotencyKeyForCommit(COMMIT),
      responseId,
      duplicate: false,
      earliestMs: nowMs,
      nowMs
    }),
    "ack_contract_invalid"
  );
});

test("changed body with the same key must return the exact 409 conflict envelope", () => {
  assert.equal(
    validateIdempotencyConflict(409, {
      ok: false,
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        message: "La même clé contient une autre réponse."
      }
    }),
    true
  );
  assertCanaryError(
    () => validateIdempotencyConflict(200, {
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT", message: "Conflit" }
    }),
    "idempotency_conflict_status_invalid"
  );
  assertCanaryError(
    () => validateIdempotencyConflict(409, {
      ok: false,
      error: { code: "OTHER", message: "Conflit" }
    }),
    "idempotency_conflict_not_proven"
  );
});

test("Firestore decoding and stored response evidence prove unmatched, unlinked identity", () => {
  assert.deepEqual(
    decodeFirestoreFields({
      text: { stringValue: "value" },
      count: { integerValue: "2" },
      nested: {
        mapValue: {
          fields: {
            active: { booleanValue: true }
          }
        }
      },
      list: {
        arrayValue: {
          values: [{ stringValue: "a" }, { nullValue: null }]
        }
      }
    }),
    {
      text: "value",
      count: 2,
      nested: { active: true },
      list: ["a", null]
    }
  );
  assertCanaryError(
    () => decodeFirestoreValue({ geoPointValue: {} }),
    "firestore_value_invalid"
  );

  const definitions = validateInitialDefinitions(initialDefinitionEntries());
  const definition = definitions.get("check-in-express");
  const submission = buildSubmission(definition, COMMIT);
  const responseId = expectedResponseId({
    slug: definition.slug,
    version: definition.version,
    idempotencyKey: submission.idempotencyKey
  });
  const receivedAt = "2026-07-28T14:00:00.000Z";
  const value = responseFixture({
    definition,
    submission,
    responseId,
    receivedAt
  });
  const first = validateStoredResponse(value, {
    definition,
    submission,
    responseId,
    receivedAt
  });
  const replay = validateStoredResponse(structuredClone(value), {
    definition,
    submission,
    responseId,
    receivedAt
  });
  assert.match(first.invariantHash, /^[a-f0-9]{64}$/);
  assert.equal(replay.invariantHash, first.invariantHash);
  const documentProof = {
    createTime: receivedAt,
    updateTime: receivedAt,
    documentHash: "c".repeat(64)
  };
  assert.equal(
    validateStoredDocumentStability(documentProof, { ...documentProof }),
    true
  );
  assertCanaryError(
    () => validateStoredDocumentStability(
      documentProof,
      { ...documentProof, updateTime: "2026-07-28T14:00:01.000Z" }
    ),
    "idempotent_replay_mutated_response"
  );
  assertCanaryError(
    () => validateStoredDocumentStability(
      documentProof,
      { ...documentProof, documentHash: "d".repeat(64) },
      "idempotency_conflict_mutated_response"
    ),
    "idempotency_conflict_mutated_response"
  );

  const linked = structuredClone(value);
  linked.ghlContactId = "linked-contact";
  assertCanaryError(
    () => validateStoredResponse(linked, {
      definition,
      submission,
      responseId,
      receivedAt
    }),
    "stored_response_member_link_detected"
  );
  const mutated = structuredClone(value);
  mutated.answers.results_present = false;
  assertCanaryError(
    () => validateStoredResponse(mutated, {
      definition,
      submission,
      responseId,
      receivedAt
    }),
    "stored_response_contract_mismatch"
  );
  const wrongFingerprint = structuredClone(value);
  wrongFingerprint.submissionFingerprint = createHash("sha256")
    .update("wrong")
    .digest("base64url");
  assertCanaryError(
    () => validateStoredResponse(wrongFingerprint, {
      definition,
      submission,
      responseId,
      receivedAt
    }),
    "stored_response_contract_mismatch"
  );
});

test("revision receipt seals exactly seven recent coherent A2 revisions", () => {
  const nowMs = Date.parse("2026-07-28T14:00:00.000Z");
  const functions = revisionFixture(nowMs);
  const receipt = buildRevisionReceipt(
    COMMIT,
    functions,
    new Date(nowMs).toISOString()
  );
  assert.equal(receipt.functions.length, 7);
  assert.deepEqual(
    receipt.functions.map((entry) => entry.functionId),
    A2_FUNCTION_IDS
  );
  assert.equal(
    verifyRevisionReceipt(receipt, COMMIT, functions, nowMs + 60_000),
    true
  );
  const altered = structuredClone(functions);
  altered[0].revision = `${altered[0].functionId.toLowerCase()}-00002-def`;
  assertCanaryError(
    () => verifyRevisionReceipt(receipt, COMMIT, altered, nowMs + 60_000),
    "revision_receipt_mismatch"
  );
  const refreshedAt = nowMs + 5 * 60 * 60 * 1000;
  const refreshed = refreshRevisionReceipt(
    receipt,
    COMMIT,
    functions,
    new Date(refreshedAt).toISOString()
  );
  assert.equal(refreshed.recordedAt, new Date(refreshedAt).toISOString());
  assert.equal(
    verifyRevisionReceipt(refreshed, COMMIT, functions, refreshedAt),
    true
  );
  assertCanaryError(
    () => buildRevisionReceipt(
      COMMIT,
      revisionFixture(nowMs - 5 * 60 * 60 * 1000),
      new Date(nowMs).toISOString()
    ),
    "function_revision_not_recent"
  );
  assertCanaryError(
    () => buildRevisionReceipt(
      COMMIT,
      functions.slice(1),
      new Date(nowMs).toISOString()
    ),
    "function_revision_count_mismatch"
  );
  assertCanaryError(
    () => verifyRevisionReceipt(
      receipt,
      COMMIT,
      functions,
      nowMs + 5 * 60 * 60 * 1000
    ),
    "revision_receipt_mismatch"
  );
  assert.match(
    revisionReceiptPath("C:\\Local", COMMIT),
    new RegExp(`public-api-revisions-${COMMIT}\\.receipt\\.json$`)
  );
});

test("runner is fail-closed, preview-first, aggregate-only and never deletes evidence", () => {
  const previewBranch = RUNNER_SOURCE.indexOf(
    'if (options.mode === "preview")'
  );
  const firstAuthRequest = RUNNER_SOURCE.indexOf(
    "await firebaseAccessToken()"
  );
  assert.ok(previewBranch >= 0);
  assert.ok(firstAuthRequest > previewBranch);
  assert.match(RUNNER_SOURCE, /verifySealedCandidate\(options\.releaseCommit\)/);
  assert.match(RUNNER_SOURCE, /verifyExecutionAuthority\(options\)/);
  assert.match(
    RUNNER_SOURCE,
    /Object\.keys\(sourceProvenance\)\.length === 0/
  );
  assert.match(RUNNER_SOURCE, /clientMatchesBefore/);
  assert.match(RUNNER_SOURCE, /clientMatchesAfterFirst/);
  assert.match(RUNNER_SOURCE, /clientMatchesAfter/);
  assert.match(RUNNER_SOURCE, /canary_response_already_exists_use_recover/);
  assert.match(RUNNER_SOURCE, /canary_response_missing_for_recovery/);
  assert.match(RUNNER_SOURCE, /idempotent_replay_mutated_response/);
  assert.match(RUNNER_SOURCE, /idempotency_conflict_mutated_response/);
  assert.match(RUNNER_SOURCE, /getInitialCatalogState\(accessToken\)/);
  assert.match(RUNNER_SOURCE, /deliveryStatesVerified/);
  assert.match(RUNNER_SOURCE, /deliveryReadyVerified/);
  assert.match(RUNNER_SOURCE, /deliveryClosedVerified/);
  assert.match(RUNNER_SOURCE, /responseUpdateTimeStable:\s*true/);
  assert.match(RUNNER_SOURCE, /refreshRevisionReceipt/);
  assert.equal(
    (RUNNER_SOURCE.match(/await postSubmission\(/g) || []).length,
    3
  );
  assert.equal(
    (RUNNER_SOURCE.match(/await readLiveFunctionRevisions\(/g) || []).length,
    2
  );
  assert.doesNotMatch(RUNNER_SOURCE, /method:\s*["'](?:DELETE|PATCH)["']/);
  assert.doesNotMatch(RUNNER_SOURCE, /console\.(?:log|error)/);
  assert.match(RUNNER_SOURCE, /error:\s*safeResultError\(error\)/);
  assert.match(RUNNER_SOURCE, /revisionReceiptVerified:\s*true/);
  assert.match(
    RUNNER_SOURCE,
    /externalWritesAtLeast:\s*publicPostAttempts \+ responseDocumentsCreated/
  );
  assert.match(RUNNER_SOURCE, /piiPrinted:\s*false/);
  assert.match(RUNNER_SOURCE, /retainedCanaryEvidence:\s*true/);
});
