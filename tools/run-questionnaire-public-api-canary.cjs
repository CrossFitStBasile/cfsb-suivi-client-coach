"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  PROJECT_ID,
  REGION,
  PUBLIC_API_URL,
  A2_FUNCTION_IDS,
  EXPECTED_INITIAL_FORMS,
  PublicApiCanaryError,
  parseArgs,
  verifyExecutionAuthority,
  stableJson,
  sha256,
  syntheticIdentityForCommit,
  expectedResponseId,
  validateInitialDefinitions,
  validateInitialCatalogState,
  buildSubmission,
  changedSubmission,
  validateAcknowledgement,
  validateIdempotencyConflict,
  validateStoredResponse,
  validateStoredDocumentStability,
  decodeFirestoreFields,
  validateFunctionRevisions,
  buildRevisionReceipt,
  refreshRevisionReceipt,
  verifyRevisionReceipt,
  revisionReceiptPath,
  safeResultError
} = require("./questionnaire-public-api-canary-lib.cjs");

const ROOT = path.resolve(__dirname, "..");
const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`;
const CLOUD_FUNCTIONS_BASE =
  `https://cloudfunctions.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}`;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_500_000;
const USER_AGENT = "cfsb-questionnaire-a2-canary/1";
const CLIENT_PHONE_FIELDS = Object.freeze([
  "phoneNormalized",
  "clientPhoneNormalized",
  "client_phone_normalized"
]);
const RESPONSE_FIELD_MASK = Object.freeze([
  "formId",
  "formVersionId",
  "formVersion",
  "schemaHash",
  "answers",
  "routingStatus",
  "routingCandidateCount",
  "coachId",
  "processingStatus",
  "coachActionType",
  "clientId",
  "internalClientId",
  "clientNameEntered",
  "clientPhoneNormalized",
  "idempotencyKey",
  "idempotencyScope",
  "submissionFingerprint",
  "sourceUrl",
  "source",
  "submittedAtIso",
  "createdAtIso",
  "ghlContactId",
  "sourceClientId",
  "coachRxClientId",
  "dashboardOwnerCoachId"
]);
const FORM_STATE_FIELD_MASK = Object.freeze([
  "formId",
  "slug",
  "status",
  "deliveryReady",
  "activeVersion",
  "activeVersionId",
  "activeVersionHash",
  "publicPath",
  "hasUnpublishedChanges"
]);
const CATALOG_STATE_FIELD_MASK = Object.freeze([
  "formId",
  "slug",
  "status",
  "deliveryReady",
  "activeVersion",
  "activeVersionId",
  "activeVersionHash",
  "publicPath"
]);

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    check: "questionnaire_public_api_canary",
    error: safeResultError(error)
  }, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  verifySealedCandidate(options.releaseCommit);
  verifyExecutionAuthority(options);

  if (options.mode === "preview") {
    printResult({
      ok: true,
      check: "questionnaire_public_api_canary",
      mode: "preview",
      readOnly: true,
      stop: true,
      next: "record_revision_required",
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      formsPlanned: EXPECTED_INITIAL_FORMS.length,
      functionRevisionsPlanned: A2_FUNCTION_IDS.length,
      clientIdentityFieldsPlanned: CLIENT_PHONE_FIELDS.length,
      externalWrites: 0,
      piiPrinted: false
    });
    return;
  }

  const accessToken = await firebaseAccessToken();
  const liveBefore = await readLiveFunctionRevisions(accessToken);

  if (options.mode === "record-revision") {
    const receiptState = recordOrRefreshRevisionReceipt(
      options.releaseCommit,
      liveBefore
    );
    printResult({
      ok: true,
      check: "questionnaire_public_api_canary",
      mode: "record-revision",
      readOnlyExternal: true,
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      functionRevisionsVerified: A2_FUNCTION_IDS.length,
      allTrafficOnLatestRevision: true,
      sourceProvenanceVerified: true,
      localReceiptVerified: true,
      localReceiptRefreshed: receiptState.refreshed,
      externalWrites: 0,
      piiPrinted: false
    });
    return;
  }

  if (!["execute", "recover"].includes(options.mode)) {
    throw new PublicApiCanaryError("mode_unknown");
  }

  const receipt = readRevisionReceipt(options.releaseCommit);
  verifyRevisionReceipt(receipt, options.releaseCommit, liveBefore);
  const result = await executeCanary({
    accessToken,
    releaseCommit: options.releaseCommit,
    liveBefore,
    receipt,
    recoveryMode: options.mode === "recover"
  });
  printResult(result);
}

function printResult(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function verifySealedCandidate(releaseCommit) {
  const verifier = path.join(
    ROOT,
    "tools",
    "verify-sealed-questionnaire-release-worktree.cjs"
  );
  const result = spawnSync(process.execPath, [verifier, releaseCommit], {
    cwd: ROOT,
    env: sanitizedChildEnv(),
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 300_000,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new PublicApiCanaryError("sealed_candidate_invalid");
  }
}

function sanitizedChildEnv() {
  const next = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/token|secret|credential|password|private[_-]?key/i.test(key)) continue;
    next[key] = value;
  }
  return next;
}

function firebaseToolsRoot() {
  const profile = String(process.env.USERPROFILE || "").trim();
  const candidates = [
    process.env.CFSB_FIREBASE_TOOLS_ROOT,
    profile
      ? path.join(
        profile,
        ".cache",
        "cfsb-dashboard-tools",
        "firebase-tools-clean",
        "node_modules",
        "firebase-tools"
      )
      : ""
  ].filter(Boolean);
  const root = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "lib", "auth.js"))
    && fs.existsSync(path.join(candidate, "lib", "apiv2.js"))
  );
  if (!root) throw new PublicApiCanaryError("firebase_tools_unavailable");
  return root;
}

async function firebaseAccessToken() {
  const root = firebaseToolsRoot();
  const auth = require(path.join(root, "lib", "auth.js"));
  const api = require(path.join(root, "lib", "apiv2.js"));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new PublicApiCanaryError("firebase_auth_unavailable");
  }
  auth.setRefreshToken(account.tokens.refresh_token);
  try {
    const accessToken = await api.getAccessToken();
    if (typeof accessToken !== "string" || !accessToken) {
      throw new PublicApiCanaryError("firebase_auth_unavailable");
    }
    return accessToken;
  } catch (_) {
    throw new PublicApiCanaryError("firebase_auth_unavailable");
  }
}

async function requestJson(url, {
  method = "GET",
  accessToken = "",
  body,
  allowedStatuses = [200]
} = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      redirect: "error",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (_) {
    throw new PublicApiCanaryError("request_failed");
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new PublicApiCanaryError("response_too_large");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new PublicApiCanaryError("response_too_large");
  }
  if (!allowedStatuses.includes(response.status)) {
    throw new PublicApiCanaryError("http_status_unexpected");
  }
  const contentType = String(response.headers.get("content-type") || "");
  if (!/^application\/json(?:;|$)/i.test(contentType)) {
    throw new PublicApiCanaryError("response_content_type_invalid");
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_) {
    throw new PublicApiCanaryError("response_json_invalid");
  }
  return Object.freeze({ status: response.status, payload });
}

async function readLiveFunctionRevisions(accessToken) {
  const entries = [];
  for (const functionId of A2_FUNCTION_IDS) {
    const expectedName =
      `projects/${PROJECT_ID}/locations/${REGION}/functions/${functionId}`;
    const { payload } = await requestJson(
      `${CLOUD_FUNCTIONS_BASE}/functions/${encodeURIComponent(functionId)}`,
      { accessToken }
    );
    const sourceProvenance = payload.buildConfig?.sourceProvenance;
    if (
      !sourceProvenance
      || typeof sourceProvenance !== "object"
      || Array.isArray(sourceProvenance)
      || Object.keys(sourceProvenance).length === 0
    ) {
      throw new PublicApiCanaryError("function_revision_invalid");
    }
    entries.push({
      functionId,
      name: String(payload.name || ""),
      state: String(payload.state || ""),
      environment: String(payload.environment || ""),
      allTrafficOnLatestRevision:
        payload.serviceConfig?.allTrafficOnLatestRevision === true,
      revision: String(payload.serviceConfig?.revision || ""),
      updateTime: String(payload.updateTime || ""),
      build: String(payload.buildConfig?.build || ""),
      service: String(payload.serviceConfig?.service || ""),
      sourceProvenanceHash: sha256(stableJson(sourceProvenance))
    });
    if (entries.at(-1).name !== expectedName) {
      throw new PublicApiCanaryError("function_revision_invalid");
    }
  }
  return validateFunctionRevisions(entries);
}

function receiptFile(releaseCommit) {
  return revisionReceiptPath(process.env.LOCALAPPDATA, releaseCommit);
}

function assertReceiptEnvelope(receipt) {
  if (
    !receipt
    || typeof receipt !== "object"
    || Array.isArray(receipt)
    || stableJson(Object.keys(receipt).sort())
      !== stableJson([
        "functions",
        "projectId",
        "recordedAt",
        "region",
        "releaseCommit",
        "version"
      ].sort())
  ) {
    throw new PublicApiCanaryError("revision_receipt_invalid");
  }
}

function recordOrRefreshRevisionReceipt(releaseCommit, liveFunctions) {
  const filename = receiptFile(releaseCommit);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const now = new Date().toISOString();
  let refreshed = false;
  let receipt;
  if (fs.existsSync(filename)) {
    const existing = readRevisionReceipt(releaseCommit);
    receipt = refreshRevisionReceipt(
      existing,
      releaseCommit,
      liveFunctions,
      now
    );
    refreshed = true;
  } else {
    receipt = buildRevisionReceipt(releaseCommit, liveFunctions, now);
  }
  try {
    fs.writeFileSync(filename, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: "utf8"
    });
  } catch (_) {
    throw new PublicApiCanaryError("revision_receipt_write_failed");
  }
  const confirmed = readRevisionReceipt(releaseCommit);
  if (stableJson(confirmed) !== stableJson(receipt)) {
    throw new PublicApiCanaryError("revision_receipt_write_failed");
  }
  assertReceiptEnvelope(confirmed);
  verifyRevisionReceipt(
    confirmed,
    releaseCommit,
    liveFunctions
  );
  return Object.freeze({ refreshed, receipt: confirmed });
}

function readRevisionReceipt(releaseCommit) {
  let value;
  try {
    value = fs.readFileSync(receiptFile(releaseCommit), "utf8");
  } catch (_) {
    throw new PublicApiCanaryError("revision_receipt_missing");
  }
  let receipt;
  try {
    receipt = JSON.parse(value);
  } catch (_) {
    throw new PublicApiCanaryError("revision_receipt_invalid");
  }
  assertReceiptEnvelope(receipt);
  return receipt;
}

async function getInitialDefinitions() {
  const entries = [];
  for (const expected of EXPECTED_INITIAL_FORMS) {
    const { payload } = await requestJson(
      `${PUBLIC_API_URL}?slug=${encodeURIComponent(expected.slug)}`
    );
    entries.push({ slug: expected.slug, payload });
  }
  return validateInitialDefinitions(entries);
}

function firestoreDocumentUrl(collectionId, documentId, fieldMask = []) {
  const mask = fieldMask
    .map((fieldPath) => `mask.fieldPaths=${encodeURIComponent(fieldPath)}`)
    .join("&");
  const base = `${FIRESTORE_BASE}/documents/${encodeURIComponent(collectionId)}/`
    + encodeURIComponent(documentId);
  return mask ? `${base}?${mask}` : base;
}

async function getFirestoreDocument(accessToken, collectionId, documentId, {
  fieldMask = [],
  allowNotFound = false
} = {}) {
  const result = await requestJson(
    firestoreDocumentUrl(collectionId, documentId, fieldMask),
    {
      accessToken,
      allowedStatuses: allowNotFound ? [200, 404] : [200]
    }
  );
  if (result.status === 404) return null;
  const expectedName =
    `projects/${PROJECT_ID}/databases/(default)/documents/`
    + `${collectionId}/${documentId}`;
  if (
    result.payload?.name !== expectedName
    || !result.payload.fields
    || typeof result.payload.fields !== "object"
    || !Number.isFinite(new Date(String(result.payload.createTime || "")).getTime())
    || !Number.isFinite(new Date(String(result.payload.updateTime || "")).getTime())
  ) {
    throw new PublicApiCanaryError("firestore_document_invalid");
  }
  return Object.freeze({
    name: expectedName,
    createTime: String(result.payload.createTime),
    updateTime: String(result.payload.updateTime),
    documentHash: sha256(stableJson(result.payload.fields)),
    value: decodeFirestoreFields(result.payload.fields)
  });
}

async function getInitialCatalogState(accessToken) {
  const entries = [];
  for (const expected of EXPECTED_INITIAL_FORMS) {
    const [form, catalog] = await Promise.all([
      getFirestoreDocument(
        accessToken,
        "questionnaireForms",
        expected.formId,
        { fieldMask: FORM_STATE_FIELD_MASK }
      ),
      getFirestoreDocument(
        accessToken,
        "questionnaireCatalog",
        expected.formId,
        { fieldMask: CATALOG_STATE_FIELD_MASK }
      )
    ]);
    entries.push({
      formId: expected.formId,
      form: form.value,
      catalog: catalog.value
    });
  }
  return validateInitialCatalogState(entries);
}

async function queryClientMatches(accessToken, phoneNormalized) {
  const documentNames = new Set();
  for (const fieldPath of CLIENT_PHONE_FIELDS) {
    const { payload } = await requestJson(
      `${FIRESTORE_BASE}/documents:runQuery`,
      {
        method: "POST",
        accessToken,
        body: {
          structuredQuery: {
            select: { fields: [{ fieldPath }] },
            from: [{ collectionId: "clients" }],
            where: {
              fieldFilter: {
                field: { fieldPath },
                op: "EQUAL",
                value: { stringValue: phoneNormalized }
              }
            },
            limit: 2
          }
        }
      }
    );
    if (!Array.isArray(payload)) {
      throw new PublicApiCanaryError("client_match_query_invalid");
    }
    for (const row of payload) {
      if (!row?.document) continue;
      const name = String(row.document.name || "");
      if (
        !name.startsWith(
          `projects/${PROJECT_ID}/databases/(default)/documents/clients/`
        )
      ) {
        throw new PublicApiCanaryError("client_match_query_invalid");
      }
      documentNames.add(name);
    }
  }
  return documentNames.size;
}

function responseDocumentUrl(responseId) {
  return firestoreDocumentUrl(
    "questionnaireResponses",
    responseId,
    RESPONSE_FIELD_MASK
  );
}

async function getResponseDocument(accessToken, responseId, {
  allowNotFound = false
} = {}) {
  const allowedStatuses = allowNotFound ? [200, 404] : [200];
  const result = await requestJson(responseDocumentUrl(responseId), {
    accessToken,
    allowedStatuses
  });
  if (result.status === 404) return null;
  const expectedName =
    `projects/${PROJECT_ID}/databases/(default)/documents/`
    + `questionnaireResponses/${responseId}`;
  if (
    result.payload?.name !== expectedName
    || !result.payload.fields
    || typeof result.payload.fields !== "object"
    || !Number.isFinite(new Date(String(result.payload.createTime || "")).getTime())
    || !Number.isFinite(new Date(String(result.payload.updateTime || "")).getTime())
  ) {
    throw new PublicApiCanaryError("stored_response_document_invalid");
  }
  return Object.freeze({
    name: expectedName,
    createTime: String(result.payload.createTime),
    updateTime: String(result.payload.updateTime),
    documentHash: sha256(stableJson(result.payload.fields)),
    value: decodeFirestoreFields(result.payload.fields)
  });
}

async function postSubmission(slug, submission, allowedStatuses) {
  return requestJson(
    `${PUBLIC_API_URL}?slug=${encodeURIComponent(slug)}`,
    {
      method: "POST",
      body: submission,
      allowedStatuses
    }
  );
}

async function executeCanary({
  accessToken,
  releaseCommit,
  liveBefore,
  receipt,
  recoveryMode = false
}) {
  const definitions = await getInitialDefinitions();
  const catalogBefore = await getInitialCatalogState(accessToken);
  const catalogStateBefore = stableJson([...catalogBefore.values()]);
  const checkInDefinition = definitions.get("check-in-express");
  const submission = buildSubmission(checkInDefinition, releaseCommit);
  const responseId = expectedResponseId({
    slug: checkInDefinition.slug,
    version: checkInDefinition.version,
    idempotencyKey: submission.idempotencyKey
  });
  const syntheticIdentity = syntheticIdentityForCommit(releaseCommit);

  const clientMatchesBefore = await queryClientMatches(
    accessToken,
    syntheticIdentity.phone
  );
  if (clientMatchesBefore !== 0) {
    throw new PublicApiCanaryError("synthetic_identity_matches_client");
  }
  const existing = await getResponseDocument(accessToken, responseId, {
    allowNotFound: true
  });

  let firstAckReceivedAt = "";
  let storedFirst = null;
  let firstEvidence = null;
  let initialCreateRecovered = false;
  let acknowledgementsVerified = 0;
  let publicPostAttempts = 0;
  let responseDocumentsCreated = 0;

  if (recoveryMode) {
    if (!existing) {
      throw new PublicApiCanaryError("canary_response_missing_for_recovery");
    }
    firstAckReceivedAt = String(existing.value.submittedAtIso || "");
    storedFirst = existing;
    firstEvidence = validateStoredResponse(existing.value, {
      definition: checkInDefinition,
      submission,
      responseId,
      receivedAt: firstAckReceivedAt
    });
    initialCreateRecovered = true;
  } else {
    if (existing) {
      throw new PublicApiCanaryError("canary_response_already_exists_use_recover");
    }
    const firstStartedAt = Date.now();
    const first = await postSubmission(
      checkInDefinition.slug,
      submission,
      [200]
    );
    publicPostAttempts += 1;
    const firstAck = validateAcknowledgement(first.payload, {
      idempotencyKey: submission.idempotencyKey,
      responseId,
      duplicate: false,
      earliestMs: firstStartedAt
    });
    acknowledgementsVerified += 1;
    firstAckReceivedAt = firstAck.receivedAt;
    storedFirst = await getResponseDocument(accessToken, responseId);
    firstEvidence = validateStoredResponse(storedFirst.value, {
      definition: checkInDefinition,
      submission,
      responseId,
      receivedAt: firstAckReceivedAt
    });
    responseDocumentsCreated = 1;
  }

  const clientMatchesAfterFirst = await queryClientMatches(
    accessToken,
    syntheticIdentity.phone
  );
  if (clientMatchesAfterFirst !== 0) {
    throw new PublicApiCanaryError("synthetic_identity_matches_client");
  }

  const replayStartedAt = Date.now();
  const replay = await postSubmission(
    checkInDefinition.slug,
    submission,
    [200]
  );
  publicPostAttempts += 1;
  validateAcknowledgement(replay.payload, {
    idempotencyKey: submission.idempotencyKey,
    responseId,
    duplicate: true,
    earliestMs: replayStartedAt,
    nowMs: Date.now()
  });
  acknowledgementsVerified += 1;
  const storedReplay = await getResponseDocument(accessToken, responseId);
  const replayEvidence = validateStoredResponse(storedReplay.value, {
    definition: checkInDefinition,
    submission,
    responseId,
    receivedAt: firstAckReceivedAt
  });
  validateStoredDocumentStability(storedFirst, storedReplay);
  if (replayEvidence.invariantHash !== firstEvidence.invariantHash) {
    throw new PublicApiCanaryError("idempotent_replay_mutated_response");
  }

  const changed = await postSubmission(
    checkInDefinition.slug,
    changedSubmission(submission),
    [409]
  );
  publicPostAttempts += 1;
  validateIdempotencyConflict(changed.status, changed.payload);
  const storedConflict = await getResponseDocument(accessToken, responseId);
  const conflictEvidence = validateStoredResponse(storedConflict.value, {
    definition: checkInDefinition,
    submission,
    responseId,
    receivedAt: firstAckReceivedAt
  });
  validateStoredDocumentStability(
    storedFirst,
    storedConflict,
    "idempotency_conflict_mutated_response"
  );
  if (conflictEvidence.invariantHash !== firstEvidence.invariantHash) {
    throw new PublicApiCanaryError("idempotency_conflict_mutated_response");
  }

  const clientMatchesAfter = await queryClientMatches(
    accessToken,
    syntheticIdentity.phone
  );
  if (clientMatchesAfter !== 0) {
    throw new PublicApiCanaryError("synthetic_identity_matches_client");
  }
  const catalogAfter = await getInitialCatalogState(accessToken);
  if (stableJson([...catalogAfter.values()]) !== catalogStateBefore) {
    throw new PublicApiCanaryError("initial_catalog_changed_during_canary");
  }

  const liveAfter = await readLiveFunctionRevisions(accessToken);
  verifyRevisionReceipt(receipt, releaseCommit, liveAfter);
  if (stableJson(liveAfter) !== stableJson(liveBefore)) {
    throw new PublicApiCanaryError("function_revision_changed_during_canary");
  }

  return {
    ok: true,
    check: "questionnaire_public_api_canary",
    mode: recoveryMode ? "recover" : "execute",
    projectId: PROJECT_ID,
    releaseCommit,
    sealedCandidateVerified: true,
    releaseGoVerified: true,
    coachNoticeVerified: true,
    rulesCanaryProofVerified: true,
    revisionReceiptVerified: true,
    formsVerified: EXPECTED_INITIAL_FORMS.length,
    formDocumentsVerified: EXPECTED_INITIAL_FORMS.length,
    catalogDocumentsVerified: EXPECTED_INITIAL_FORMS.length,
    deliveryReadyFalseVerified: EXPECTED_INITIAL_FORMS.length,
    catalogStable: true,
    functionRevisionsVerified: A2_FUNCTION_IDS.length,
    acknowledgementsVerified,
    idempotencyConflictsRejected: 1,
    responseDocumentsVerified: 1,
    clientMatchesBefore,
    clientMatchesAfter,
    memberLinksDetected: 0,
    revisionStable: true,
    responseInvariantStable: true,
    responseCreateTimeStable: true,
    responseUpdateTimeStable: true,
    responseIdVerified: true,
    initialCreateRecovered,
    publicPostAttempts,
    responseDocumentsCreated,
    rateLimitWritesExpected: publicPostAttempts,
    externalWritesAtLeast: publicPostAttempts + responseDocumentsCreated,
    initialFormBootstrapPossible: true,
    retainedCanaryEvidence: true,
    piiPrinted: false
  };
}
