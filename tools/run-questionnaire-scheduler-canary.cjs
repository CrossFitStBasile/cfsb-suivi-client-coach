"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  PROJECT_ID,
  REGION,
  FUNCTION_ID,
  CANARY_SOURCE,
  CONTROL_COLLECTION,
  CONTROL_ID,
  LEGACY_GHL_TAG,
  PROCESS_GHL_TAG,
  HISTORICAL_GHL_TAGS,
  SYNTHETIC_CONTACT_MARKER_TAG,
  EXPECTED_SCHEDULER_JOB_NAME,
  CanaryError,
  canaryIds,
  processCanarySendId,
  parseArgs,
  normalizePhone,
  buildContactProvisionClaim,
  acquireSharedContactProvisionClaim,
  collectCompleteGhlContactSearch,
  dashboardClientMatchesSyntheticIdentity,
  contactTags,
  historicalGhlTagsAbsent,
  explicitSyntheticContact,
  contactConfirmationFingerprint,
  selectUniqueSyntheticContact,
  buildCanaryTarget,
  buildCanarySchedule,
  buildProcessCanarySend,
  buildCanaryControl,
  canaryControlOwnedForCleanup,
  canaryControlActive,
  canaryTargetOwnedForCleanup,
  canaryScheduleMatches,
  positiveCanaryAttemptExists,
  canarySendRequiresDeferredExternalCleanup,
  canarySendHasUncertainExternalEffect,
  encodeFirestoreFields,
  decodeFirestoreDocument,
  stableJsonStringify,
  selectSchedulerAttemptCompletion,
  canaryGhlEffectVerified,
  safeResultError
} = require("./questionnaire-scheduler-canary-lib.cjs");
const {
  isValidIsoDate,
  schedulerHorizonDate
} = require("./questionnaire-stage-a-preflight-lib.cjs");

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`;
const SCHEDULER_BASE = `https://cloudscheduler.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}`;
const FUNCTIONS_BASE = `https://cloudfunctions.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}`;
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_LOCATION_ID = "hWM7E7ZXB88LWDmjezKU";
const GHL_API_VERSION = "2021-07-28";
const SYNTHETIC_CONTACT_NAME = "CFSB Questionnaire Canary";
const SYNTHETIC_CONTACT_PHONE = "5145550100";
const SYNTHETIC_CONTACT_SOURCE = "cfsb_dashboard_questionnaire_canary";
const SYNTHETIC_CONTACT_PROVISION_CLAIM_ID =
  `contact-provision-${SYNTHETIC_CONTACT_PHONE}`;
const REQUEST_TIMEOUT_MS = 15_000;
const POLL_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_BODY_BYTES = 1_500_000;
const MAX_PAGES = 30;
const PAGE_SIZE = 500;
const SYNC_RUN_SOURCE = "firebase_function_questionnaire_schedules";
const EXPECTED_JOB_NAME = EXPECTED_SCHEDULER_JOB_NAME;
const EXPECTED_JOB_SCHEDULE = "every day 07:15";
const EXPECTED_JOB_TIME_ZONE = "America/Toronto";
const EXPECTED_JOB_ATTEMPT_DEADLINE = "180s";
const EXPECTED_SCHEDULER_SERVICE_ACCOUNT =
  "129233025317-compute@developer.gserviceaccount.com";
const EXPECTED_SCHEDULER_TARGET_URI =
  `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${FUNCTION_ID}`;
const MINIMUM_CONTROL_TTL_MS = 2 * 60 * 1000;
const RECOVERY_QUIESCENCE_TIMEOUT_MS = 45_000;
const UNCERTAIN_EFFECT_SETTLEMENT_MS = 20_000;
const UNCERTAIN_EFFECT_OBSERVATION_ATTEMPTS = 7;

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    check: "questionnaire_scheduler_canary",
    error: safeResultError(error)
  }, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  verifySealedCandidate(options.releaseCommit);
  verifyExecutionAuthority(options);
  verifyLiveFunctionReceipt(options);
  const firebase = await firebaseAccess();
  const context = {
    ...options,
    ...firebase
  };

  if (options.mode === "provision-contact") {
    const job = await getAndValidateSchedulerJob(context);
    const provisioned = await provisionSyntheticContact(context);
    printResult({
      ok: true,
      check: "questionnaire_canary_contact_provision",
      mode: "provision-contact",
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      schedulerJob: schedulerJobSummary(job),
      contactCreated: provisioned.created,
      explicitSyntheticContactCount: 1,
      dashboardNonMemberVerified: true,
      exactMarkerTagVerified: true,
      doNotDisturbVerified: true,
      targetTagsAbsent: true,
      contactFingerprint: contactConfirmationFingerprint(provisioned.contact),
      piiPrinted: false,
      sharedProvisionFenceCreated: provisioned.sharedFenceCreated,
      externalWrites:
        (provisioned.sharedFenceCreated ? 1 : 0)
        + (provisioned.created ? 1 : 0)
    });
    return;
  }

  if (options.mode === "pin-contact") {
    const job = await getAndValidateSchedulerJob(context);
    const { contact } = await discoverSyntheticContact(context, {
      requireTargetTagAbsent: true,
      targetTag: LEGACY_GHL_TAG
    });
    await assertContactNotDashboardMember(context, contact);
    if (!historicalGhlTagsAbsent(contact)) {
      throw new CanaryError("synthetic_contact_historical_tag_already_present");
    }
    const fingerprint = contactConfirmationFingerprint(contact);
    if (
      String(process.env.CFSB_QUESTIONNAIRE_CANARY_CONTACT_FINGERPRINT || "")
        .trim()
        .toLowerCase() !== fingerprint
    ) {
      throw new CanaryError("synthetic_contact_confirmation_missing");
    }
    writePinnedContactReceipt(options.releaseCommit, contact);
    printResult({
      ok: true,
      check: "questionnaire_canary_contact_pin",
      mode: "pin-contact",
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      schedulerJob: schedulerJobSummary(job),
      explicitSyntheticContactCount: 1,
      dashboardNonMemberVerified: true,
      exactMarkerTagVerified: true,
      operatorFingerprintConfirmed: true,
      targetTagsAbsent: true,
      localReceiptWritten: true,
      externalWrites: 0
    });
    return;
  }

  if (options.mode === "cleanup") {
    const result = await executeCleanup(context);
    printResult(result);
    return;
  }

  if (options.mode === "execute-process") {
    const preflight = runLivePreflight({ requireIndexReady: false });
    assert.equal(preflight.schedules.activeDue, 0);
    assert.equal(preflight.schedules.activeInvalidDate, 0);
    assert.equal(preflight.schedules.invalidStatus, 0);
    const result = await executeProcessCanary(context);
    printResult(result);
    return;
  }

  const job = await getAndValidateSchedulerJob(context);
  if (options.mode === "preview") {
    const preflight = runLivePreflight({ requireIndexReady: false });
    const token = readGhlSecret(context);
    const contactSets = await searchSyntheticContactSets(token);
    const candidates = contactSets.flat();
    const explicit = candidates.filter((contact) =>
      explicitSyntheticContact(contact)
    );
    if (candidates.length === 0) {
      printResult({
        ok: true,
        check: "questionnaire_scheduler_canary",
        mode: "preview",
        readOnly: true,
        stop: true,
        next: "provision_contact_required",
        projectId: PROJECT_ID,
        releaseCommit: options.releaseCommit,
        schedulerJob: schedulerJobSummary(job),
        schedules: preflight.schedules,
        explicitSyntheticContactCount: 0,
        dashboardNonMemberVerified: false,
        exactMarkerTagVerified: false,
        writes: 0
      });
      return;
    }
    if (candidates.length !== 1 || explicit.length !== 1) {
      throw new CanaryError("synthetic_contact_candidates_not_unique");
    }
    const syntheticContact = selectDiscoveredSyntheticContact(contactSets, {
      requireTargetTagAbsent: false,
      targetTag: LEGACY_GHL_TAG
    });
    await assertContactNotDashboardMember(context, syntheticContact);
    printResult({
      ok: true,
      check: "questionnaire_scheduler_canary",
      mode: "preview",
      readOnly: true,
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      schedulerJob: schedulerJobSummary(job),
      schedules: preflight.schedules,
      explicitSyntheticContactCount: 1,
      dashboardNonMemberVerified: true,
      exactMarkerTagVerified: true,
      contactFingerprint: contactConfirmationFingerprint(syntheticContact),
      writes: 0
    });
    return;
  }

  const preflight = runLivePreflight({ requireIndexReady: true });
  assert.equal(preflight.schedules.activeDue, 0);
  assert.equal(preflight.schedules.activeInvalidDate, 0);
  assert.equal(preflight.schedules.invalidStatus, 0);

  if (options.mode === "execute-empty") {
    const result = await executeEmptyCanary(context, job, preflight);
    printResult(result);
    return;
  }

  if (options.mode === "execute-positive") {
    const result = await executePositiveCanary(context, job, preflight);
    printResult(result);
    return;
  }

  throw new CanaryError("mode_unknown");
}

function printResult(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function verifyExecutionAuthority(options) {
  if (["preview", "pin-contact"].includes(options.mode)) return;
  const commit = options.releaseCommit;
  if (options.mode === "cleanup") {
    if (process.env.CFSB_QUESTIONNAIRE_RECOVERY_GO !== commit) {
      throw new CanaryError("recovery_go_missing");
    }
    return;
  }
  if (process.env.CFSB_QUESTIONNAIRE_RELEASE_GO !== commit) {
    throw new CanaryError("release_go_missing");
  }
  if (process.env.CFSB_COACH_NOTICE_CONFIRMED !== commit) {
    throw new CanaryError("coach_notice_missing");
  }
  if (options.mode === "provision-contact") {
    if (process.env.CFSB_QUESTIONNAIRE_RULES_EMULATOR_OK !== commit) {
      throw new CanaryError("rules_emulator_proof_missing");
    }
    if (process.env.CFSB_QUESTIONNAIRE_PROVISION_CONTACT_GO !== commit) {
      throw new CanaryError("provision_contact_go_missing");
    }
    return;
  }
  if (
    options.mode === "execute-process"
    && process.env.CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK !== commit
  ) {
    throw new CanaryError("additive_canary_proof_missing");
  }
  if (["execute-empty", "execute-positive"].includes(options.mode)) {
    if (process.env.CFSB_QUESTIONNAIRE_LEGACY_CANARY_OK !== commit) {
      throw new CanaryError("legacy_canary_proof_missing");
    }
    if (process.env.CFSB_QUESTIONNAIRE_INDEX_READY_OK !== commit) {
      throw new CanaryError("index_ready_proof_missing");
    }
  }
  if (
    options.mode === "execute-positive"
    && process.env.CFSB_QUESTIONNAIRE_SCHEDULER_EMPTY_CANARY_OK !== commit
  ) {
    throw new CanaryError("empty_canary_proof_missing");
  }
}

function verifyLiveFunctionReceipt(options) {
  if (["preview", "provision-contact", "pin-contact", "cleanup"].includes(options.mode)) return;
  const verifier = path.join(
    process.cwd(),
    "tools",
    "questionnaire-function-revision-receipt.cjs"
  );
  const result = spawnSync(process.execPath, [
    verifier,
    `--release-commit=${options.releaseCommit}`,
    "--verify"
  ], {
    cwd: process.cwd(),
    env: sanitizedChildEnv(),
    encoding: "utf8",
    timeout: 45_000,
    maxBuffer: 300_000,
    windowsHide: true
  });
  if (result.status !== 0) throw new CanaryError("live_function_revision_mismatch");
}

function contactReceiptPath(releaseCommit) {
  const base = String(process.env.LOCALAPPDATA || "").trim();
  if (!base) throw new CanaryError("local_receipt_directory_unavailable");
  return path.join(
    base,
    "CFSB",
    "questionnaire-release",
    `canary-contact-${releaseCommit}.receipt.json`
  );
}

function provisionAttemptReceiptPath() {
  const base = String(process.env.LOCALAPPDATA || "").trim();
  if (!base) throw new CanaryError("local_receipt_directory_unavailable");
  return path.join(
    base,
    "CFSB",
    "questionnaire-release",
    `canary-contact-provision-${SYNTHETIC_CONTACT_PHONE}.attempt.json`
  );
}

function acquireProvisionAttemptFence(releaseCommit) {
  const receiptPath = provisionAttemptReceiptPath();
  const receipt = {
    version: 1,
    releaseCommit,
    locationId: GHL_LOCATION_ID,
    phone: SYNTHETIC_CONTACT_PHONE,
    createdAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  try {
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    return Object.freeze({ acquired: true, receipt });
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw new CanaryError("provision_attempt_receipt_write_failed");
    }
  }

  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  } catch (_) {
    throw new CanaryError("provision_attempt_receipt_invalid");
  }
  const createdAtMs = new Date(String(existing.createdAt || "")).getTime();
  if (
    existing.version !== 1
    || !/^[a-f0-9]{40}$/.test(String(existing.releaseCommit || ""))
    || existing.locationId !== GHL_LOCATION_ID
    || existing.phone !== SYNTHETIC_CONTACT_PHONE
    || !Number.isFinite(createdAtMs)
    || createdAtMs > Date.now() + (5 * 60 * 1000)
  ) {
    throw new CanaryError("provision_attempt_receipt_invalid");
  }
  return Object.freeze({ acquired: false, receipt: existing });
}

function contactIdentityDigest(contact) {
  return contactConfirmationFingerprint(contact);
}

function writePinnedContactReceipt(releaseCommit, contact) {
  const receiptPath = contactReceiptPath(releaseCommit);
  const receipt = {
    version: 2,
    releaseCommit,
    contactId: String(contact?.id || "").trim(),
    identityDigest: contactIdentityDigest(contact),
    markerTag: SYNTHETIC_CONTACT_MARKER_TAG,
    createdAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const temporaryPath = `${receiptPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(receipt)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  fs.renameSync(temporaryPath, receiptPath);
}

function readPinnedContactReceipt(releaseCommit) {
  const receiptPath = contactReceiptPath(releaseCommit);
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  } catch (_) {
    throw new CanaryError("canary_contact_receipt_missing");
  }
  const createdAtMs = new Date(String(receipt.createdAt || "")).getTime();
  if (
    receipt.version !== 2
    || receipt.releaseCommit !== releaseCommit
    || !/^[A-Za-z0-9_-]{8,80}$/.test(String(receipt.contactId || ""))
    || !/^[a-f0-9]{64}$/.test(String(receipt.identityDigest || ""))
    || receipt.markerTag !== SYNTHETIC_CONTACT_MARKER_TAG
    || !Number.isFinite(createdAtMs)
    || createdAtMs > Date.now() + (5 * 60 * 1000)
    || Date.now() - createdAtMs > (24 * 60 * 60 * 1000)
  ) {
    throw new CanaryError("canary_contact_receipt_mismatch");
  }
  return receipt;
}

function assertPinnedContact(releaseCommit, contact) {
  const receipt = readPinnedContactReceipt(releaseCommit);
  if (
    receipt.contactId !== String(contact?.id || "").trim()
    || receipt.identityDigest !== contactIdentityDigest(contact)
  ) {
    throw new CanaryError("canary_contact_receipt_mismatch");
  }
}

function verifySealedCandidate(releaseCommit) {
  const verifier = path.join(process.cwd(), "tools", "verify-sealed-questionnaire-release-worktree.cjs");
  if (!fs.existsSync(verifier)) throw new CanaryError("sealed_verifier_missing");
  const result = spawnSync(process.execPath, [verifier, releaseCommit], {
    cwd: process.cwd(),
    env: sanitizedChildEnv(),
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 300_000,
    windowsHide: true
  });
  if (result.status !== 0) throw new CanaryError("sealed_candidate_invalid");
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
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    process.env.CFSB_FIREBASE_TOOLS_ROOT,
    path.join(home, ".cache", "cfsb-dashboard-tools", "firebase-tools-clean", "node_modules", "firebase-tools")
  ].filter(Boolean);
  const root = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "lib", "auth.js"))
    && fs.existsSync(path.join(candidate, "lib", "apiv2.js"))
  );
  if (!root) throw new CanaryError("firebase_tools_unavailable");
  return root;
}

async function firebaseAccess() {
  const root = firebaseToolsRoot();
  const auth = require(path.join(root, "lib", "auth.js"));
  const api = require(path.join(root, "lib", "apiv2.js"));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new CanaryError("firebase_auth_unavailable");
  auth.setRefreshToken(account.tokens.refresh_token);
  let accessToken;
  try {
    accessToken = await api.getAccessToken();
  } catch (_) {
    throw new CanaryError("firebase_auth_unavailable");
  }
  const actorEmail = String(account?.user?.email || "").trim().toLowerCase();
  if (!accessToken || !actorEmail) throw new CanaryError("firebase_identity_unavailable");
  return { accessToken, actorEmail, firebaseRoot: root };
}

async function limitedJsonRequest(url, {
  accessToken = "",
  method = "GET",
  body,
  headers = {},
  allowNotFound = false,
  redirect = "follow"
} = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (allowNotFound && response.status === 404) return null;
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new CanaryError("response_body_too_large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new CanaryError("response_body_too_large");
  if (!response.ok) throw new CanaryError(`http_${response.status}`);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new CanaryError("response_json_invalid");
  }
}

async function getAndValidateSchedulerJob(context) {
  const [job, liveFunction] = await Promise.all([
    limitedJsonRequest(
      `https://cloudscheduler.googleapis.com/v1/${EXPECTED_JOB_NAME}`,
      { accessToken: context.accessToken }
    ),
    limitedJsonRequest(
      `${FUNCTIONS_BASE}/functions/${FUNCTION_ID}`,
      { accessToken: context.accessToken }
    )
  ]);
  const expectedFunctionName =
    `projects/${PROJECT_ID}/locations/${REGION}/functions/${FUNCTION_ID}`;
  const functionServiceUri = String(liveFunction.serviceConfig?.uri || "").trim();
  let parsedFunctionUri;
  try {
    parsedFunctionUri = new URL(functionServiceUri);
  } catch (_) {
    throw new CanaryError("scheduler_function_uri_invalid");
  }
  if (
    liveFunction.name !== expectedFunctionName
    || liveFunction.state !== "ACTIVE"
    || liveFunction.environment !== "GEN_2"
    || liveFunction.serviceConfig?.allTrafficOnLatestRevision !== true
    || !String(liveFunction.serviceConfig?.revision || "").trim()
    || parsedFunctionUri.protocol !== "https:"
    || !parsedFunctionUri.hostname.endsWith(".a.run.app")
    || parsedFunctionUri.pathname !== "/"
    || parsedFunctionUri.search
    || parsedFunctionUri.hash
  ) {
    throw new CanaryError("scheduler_function_target_invalid");
  }
  if (job.name !== EXPECTED_JOB_NAME) throw new CanaryError("scheduler_job_name_mismatch");
  if (job.state !== "ENABLED") throw new CanaryError("scheduler_job_not_enabled");
  if (job.schedule !== EXPECTED_JOB_SCHEDULE) throw new CanaryError("scheduler_schedule_mismatch");
  if (job.timeZone !== EXPECTED_JOB_TIME_ZONE) throw new CanaryError("scheduler_timezone_mismatch");
  if (job.attemptDeadline !== EXPECTED_JOB_ATTEMPT_DEADLINE) {
    throw new CanaryError("scheduler_attempt_deadline_mismatch");
  }
  if (Number(job.retryConfig?.retryCount || 0) !== 0) throw new CanaryError("scheduler_retries_not_zero");
  if (!["", "0s"].includes(String(job.retryConfig?.maxRetryDuration || ""))) {
    throw new CanaryError("scheduler_retry_duration_not_zero");
  }
  const historicalStatusCode = Number(job.status?.code || 0);
  if (
    !Number.isInteger(historicalStatusCode)
    || historicalStatusCode < 0
    || historicalStatusCode > 16
  ) {
    throw new CanaryError("scheduler_job_status_invalid");
  }
  if (job.httpTarget?.httpMethod !== "POST") throw new CanaryError("scheduler_http_method_mismatch");
  if (job.pubsubTarget || job.appEngineHttpTarget) throw new CanaryError("scheduler_target_type_mismatch");
  const targetUri = String(job.httpTarget?.uri || "").trim();
  if (targetUri !== EXPECTED_SCHEDULER_TARGET_URI) {
    throw new CanaryError("scheduler_target_mismatch");
  }
  const oidc = job.httpTarget?.oidcToken || {};
  if (String(oidc.serviceAccountEmail || "") !== EXPECTED_SCHEDULER_SERVICE_ACCOUNT) {
    throw new CanaryError("scheduler_oidc_service_account_mismatch");
  }
  if (String(oidc.audience || "") !== EXPECTED_SCHEDULER_TARGET_URI) {
    throw new CanaryError("scheduler_oidc_audience_mismatch");
  }
  Object.defineProperty(job, "__validatedFunction", {
    value: Object.freeze({
      serviceUri: functionServiceUri,
      schedulerTargetUri: EXPECTED_SCHEDULER_TARGET_URI,
      revision: String(liveFunction.serviceConfig.revision),
      updateTime: String(liveFunction.updateTime || "")
    }),
    enumerable: false
  });
  return job;
}

function schedulerJobFingerprint(job = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    name: job.name,
    state: job.state,
    schedule: job.schedule,
    timeZone: job.timeZone,
    attemptDeadline: job.attemptDeadline,
    retryConfig: job.retryConfig || {},
    httpTarget: job.httpTarget || {},
    functionServiceUri: job.__validatedFunction?.serviceUri || "",
    schedulerTargetUri: job.__validatedFunction?.schedulerTargetUri || "",
    functionRevision: job.__validatedFunction?.revision || ""
  }), "utf8").digest("hex");
}

function schedulerJobSummary(job) {
  return {
    name: job.name,
    state: job.state,
    schedule: job.schedule,
    timeZone: job.timeZone,
    attemptDeadline: job.attemptDeadline,
    retryCount: Number(job.retryConfig?.retryCount || 0),
    retryDurationSeconds: 0,
    lastExecutionStatusCode: Number(job.status?.code || 0),
    httpMethod: "POST",
    oidcVerified: true,
    targetVerified: true
  };
}

function runLivePreflight({ requireIndexReady }) {
  const script = path.join(process.cwd(), "tools", "preflight-questionnaire-stage-a-live.cjs");
  const args = [
    script,
    "--protect-through-next-scheduler",
    "--require-safe-scheduler-window"
  ];
  if (requireIndexReady) args.push("--require-index-ready");
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: sanitizedChildEnv(),
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 500_000,
    windowsHide: true
  });
  if (result.status !== 0) throw new CanaryError("live_preflight_failed");
  let parsed;
  try {
    parsed = JSON.parse(String(result.stdout || "").trim());
  } catch (_) {
    throw new CanaryError("live_preflight_output_invalid");
  }
  if (parsed?.ok !== true || parsed?.projectId !== PROJECT_ID || parsed?.readOnly !== true) {
    throw new CanaryError("live_preflight_invalid");
  }
  return parsed;
}

async function listDocuments(context, collectionId, fieldPaths = []) {
  const documents = [];
  let pageToken = "";
  const seenPageTokens = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (pageToken) params.set("pageToken", pageToken);
    for (const fieldPath of fieldPaths) params.append("mask.fieldPaths", fieldPath);
    const data = await limitedJsonRequest(
      `${FIRESTORE_BASE}/documents/${encodeURIComponent(collectionId)}?${params}`,
      { accessToken: context.accessToken }
    );
    documents.push(...(Array.isArray(data.documents) ? data.documents : []));
    pageToken = String(data.nextPageToken || "");
    if (!pageToken) return documents;
    if (seenPageTokens.has(pageToken)) {
      throw new CanaryError("firestore_pagination_token_repeated");
    }
    seenPageTokens.add(pageToken);
  }
  throw new CanaryError("firestore_pagination_limit");
}

async function dashboardClientIdentityMatch(context, {
  phone,
  contactId = ""
}) {
  const expectedPhone = normalizePhone(phone);
  const expectedContactId = String(contactId || "").trim();
  if (!expectedPhone) {
    throw new CanaryError("synthetic_contact_identity_invalid");
  }
  const documents = await listDocuments(context, "clients", [
    "phoneNormalized",
    "clientPhoneNormalized",
    "client_phone_normalized",
    "phone",
    "clientPhone",
    "telephone",
    "mobile",
    "phoneNumber",
    "phone_number",
    "ghlContactId",
    "ghl_contact_id",
    "ghlId",
    "ghl_id",
    "contactId",
    "sourceClientId",
    "source_client_id",
    "clientId",
    "coachRxLink.sourceClientId"
  ]);
  const match = documents.some((document) => {
    const value = decodeFirestoreDocument(document);
    return dashboardClientMatchesSyntheticIdentity(value, {
      documentId: documentId(document),
      phone: expectedPhone,
      contactId: expectedContactId
    });
  });
  return match;
}

async function assertReservedPhoneNotDashboardMember(context) {
  if (await dashboardClientIdentityMatch(context, {
    phone: SYNTHETIC_CONTACT_PHONE
  })) {
    throw new CanaryError("synthetic_phone_matches_dashboard_member");
  }
}

async function assertContactNotDashboardMember(context, contact) {
  const expectedPhone = normalizePhone(contact?.phone);
  const expectedContactId = String(contact?.id || "").trim();
  if (!expectedPhone || !expectedContactId) {
    throw new CanaryError("synthetic_contact_identity_invalid");
  }
  if (await dashboardClientIdentityMatch(context, {
    phone: expectedPhone,
    contactId: expectedContactId
  })) {
    throw new CanaryError("synthetic_contact_matches_dashboard_member");
  }
}

async function getDocument(context, collectionId, documentId, { allowNotFound = false, fieldPaths = [] } = {}) {
  const params = new URLSearchParams();
  for (const fieldPath of fieldPaths) params.append("mask.fieldPaths", fieldPath);
  const suffix = params.toString() ? `?${params}` : "";
  return limitedJsonRequest(
    `${FIRESTORE_BASE}/documents/${encodeURIComponent(collectionId)}/${encodeURIComponent(documentId)}${suffix}`,
    { accessToken: context.accessToken, allowNotFound }
  );
}

async function createDocument(context, collectionId, documentId, value) {
  const url = new URL(`${FIRESTORE_BASE}/documents/${encodeURIComponent(collectionId)}`);
  url.searchParams.set("documentId", documentId);
  return limitedJsonRequest(url.toString(), {
    accessToken: context.accessToken,
    method: "POST",
    body: { fields: encodeFirestoreFields(value) }
  });
}

function assertUpdateTime(value) {
  const updateTime = String(value || "");
  if (!Number.isFinite(new Date(updateTime).getTime()) || !updateTime.endsWith("Z")) {
    throw new CanaryError("firestore_update_time_invalid");
  }
  return updateTime;
}

async function patchDocument(context, collectionId, documentId, fields, expectedUpdateTime) {
  const url = new URL(
    `${FIRESTORE_BASE}/documents/${encodeURIComponent(collectionId)}/${encodeURIComponent(documentId)}`
  );
  for (const key of Object.keys(fields)) url.searchParams.append("updateMask.fieldPaths", key);
  url.searchParams.set("currentDocument.updateTime", assertUpdateTime(expectedUpdateTime));
  return limitedJsonRequest(url.toString(), {
    accessToken: context.accessToken,
    method: "PATCH",
    body: { fields: encodeFirestoreFields(fields) }
  });
}

async function deleteDocument(context, collectionId, documentId, expectedUpdateTime) {
  const url = new URL(
    `${FIRESTORE_BASE}/documents/${encodeURIComponent(collectionId)}/${encodeURIComponent(documentId)}`
  );
  url.searchParams.set("currentDocument.updateTime", assertUpdateTime(expectedUpdateTime));
  await limitedJsonRequest(
    url.toString(),
    { accessToken: context.accessToken, method: "DELETE" }
  );
}

function documentId(document = {}) {
  return String(document.name || "").split("/").pop();
}

async function questionnaireSendCount(context) {
  return (await listDocuments(context, "questionnaireSends", ["status"])).length;
}

async function assertScheduleTriggerState(context, {
  expectedCanaryCount,
  todayToronto
}) {
  const documents = await listDocuments(context, "questionnaireSchedules", [
    "status",
    "nextSendAt",
    "source",
    "questionnaireCanaryOnly",
    "canaryReleaseCommit",
    "armedUntil",
    "clientId",
    "clientPhoneNormalized",
    "coachId",
    "questionnaireType",
    "formId",
    "frequency",
    "requestedByUid",
    "requestedByEmail"
  ]);
  const horizon = schedulerHorizonDate(new Date());
  const activeDue = [];
  for (const document of documents) {
    const value = decodeFirestoreDocument(document);
    if (!["active", "paused"].includes(value.status)) {
      throw new CanaryError("schedule_trigger_state_invalid_status");
    }
    if (value.status !== "active") continue;
    if (!isValidIsoDate(value.nextSendAt)) {
      throw new CanaryError("schedule_trigger_state_invalid_date");
    }
    if (value.nextSendAt <= horizon) {
      activeDue.push({ id: documentId(document), value });
    }
  }
  if (activeDue.length !== expectedCanaryCount) {
    throw new CanaryError("schedule_trigger_due_count_mismatch");
  }
  if (expectedCanaryCount === 1) {
    const expectedIds = canaryIds(context.releaseCommit);
    const only = activeDue[0];
    if (
      only.id !== expectedIds.scheduleId
      || !canaryScheduleMatches(
        only.value,
        context.releaseCommit,
        todayToronto,
        Date.now()
      )
    ) {
      throw new CanaryError("schedule_trigger_canary_mismatch");
    }
  }
  return {
    documents: documents.length,
    activeDue: activeDue.length,
    protectionThroughDateToronto: horizon,
    stateDigest: crypto.createHash("sha256")
      .update(stableJsonStringify(
        documents
          .map((document) => ({
            name: document.name,
            updateTime: document.updateTime,
            fields: document.fields
          }))
          .sort((left, right) => String(left.name).localeCompare(String(right.name)))
      ))
      .digest("hex")
  };
}

async function createCanaryControl(context, mode) {
  const existing = await getDocument(context, CONTROL_COLLECTION, CONTROL_ID, {
    allowNotFound: true
  });
  if (existing) throw new CanaryError("canary_control_already_exists");
  const now = new Date();
  const nonce = crypto.randomBytes(16).toString("hex");
  const control = buildCanaryControl({
    releaseCommit: context.releaseCommit,
    armedUntil: new Date(now.getTime() + (20 * 60 * 1000)).toISOString(),
    mode,
    nonce
  });
  const document = await createDocument(context, CONTROL_COLLECTION, CONTROL_ID, {
    ...control,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  });
  return Object.freeze({ mode, nonce, document });
}

async function cleanupCanaryControl(context, mode, nonce) {
  const document = await getDocument(context, CONTROL_COLLECTION, CONTROL_ID);
  const value = decodeFirestoreDocument(document);
  if (!canaryControlOwnedForCleanup(value, context.releaseCommit, mode, nonce)) {
    throw new CanaryError("canary_control_cleanup_target_mismatch");
  }
  await deleteDocument(
    context,
    CONTROL_COLLECTION,
    CONTROL_ID,
    document.updateTime
  );
  const after = await getDocument(context, CONTROL_COLLECTION, CONTROL_ID, {
    allowNotFound: true
  });
  if (after) throw new CanaryError("canary_control_cleanup_incomplete");
}

async function assertCanaryControlReady(context, proof) {
  if (!proof || !["empty", "positive"].includes(proof.mode) || !proof.nonce) {
    throw new CanaryError("canary_control_proof_invalid");
  }
  const document = await getDocument(context, CONTROL_COLLECTION, CONTROL_ID);
  const value = decodeFirestoreDocument(document);
  if (!canaryControlActive(
    value,
    context.releaseCommit,
    proof.mode,
    proof.nonce,
    { nowMs: Date.now(), minimumTtlMs: MINIMUM_CONTROL_TTL_MS }
  )) {
    throw new CanaryError("canary_control_not_ready");
  }
  return value;
}

async function schedulerSyncRuns(context) {
  const documents = await listDocuments(context, "syncRuns", [
    "source",
    "status",
    "dueSchedules",
    "queued",
    "skipped",
    "syncedAt",
    "triggeredByJobName",
    "triggeredByScheduleTime",
    "questionnaireCanaryOnly",
    "questionnaireCanaryMode",
    "canaryReleaseCommit",
    "canaryNonce",
    "canaryBlocked"
  ]);
  return documents
    .map((document) => ({
      id: documentId(document),
      ...decodeFirestoreDocument(document)
    }))
    .filter((run) => run.source === SYNC_RUN_SOURCE);
}

async function triggerSchedulerJob(context, expectedJob, controlProof) {
  await assertCanaryControlReady(context, controlProof);
  const freshJob = await getAndValidateSchedulerJob(context);
  if (
    schedulerJobFingerprint(freshJob) !== schedulerJobFingerprint(expectedJob)
    || String(freshJob.lastAttemptTime || "")
      !== String(expectedJob.lastAttemptTime || "")
    || Number(freshJob.status?.code || 0)
      !== Number(expectedJob.status?.code || 0)
  ) {
    throw new CanaryError("scheduler_job_changed_before_trigger");
  }
  await assertCanaryControlReady(context, controlProof);
  await limitedJsonRequest(
    `https://cloudscheduler.googleapis.com/v1/${freshJob.name}:run`,
    {
      accessToken: context.accessToken,
      method: "POST",
      body: {}
    }
  );
  return freshJob;
}

async function waitForNewSchedulerRun(
  context,
  baselineIds,
  expected,
  job,
  canaryMode,
  canaryNonce
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const runs = await schedulerSyncRuns(context);
    const fresh = runs.filter((run) => !baselineIds.has(run.id));
    if (fresh.length > 1) throw new CanaryError("scheduler_multiple_new_runs");
    if (fresh.length === 1) {
      const run = fresh[0];
      if (
        run.status !== "success"
        || Number(run.dueSchedules) !== expected.dueSchedules
        || Number(run.queued) !== expected.queued
        || Number(run.skipped) !== expected.skipped
        || run.questionnaireCanaryOnly !== true
        || run.questionnaireCanaryMode !== canaryMode
        || run.canaryReleaseCommit !== context.releaseCommit
        || run.canaryNonce !== canaryNonce
        || run.canaryBlocked === true
      ) {
        throw new CanaryError("scheduler_run_counts_mismatch");
      }
      const jobLeaf = job.name.split("/").pop();
      if (
        ![jobLeaf, job.name].includes(String(run.triggeredByJobName || ""))
      ) {
        throw new CanaryError("scheduler_run_job_evidence_missing");
      }
      if (!String(run.triggeredByScheduleTime || "").trim()) {
        throw new CanaryError("scheduler_run_time_evidence_missing");
      }
      return run;
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new CanaryError("scheduler_run_timeout");
}

async function ensureSchedulerQuiescent(context, {
  expectedCompletionId = ""
} = {}) {
  let job = await getAndValidateSchedulerJob(context);
  let runs = await schedulerSyncRuns(context);
  const observedLastAttemptTime = String(job.lastAttemptTime || "");
  for (;;) {
    const lastAttemptMs = new Date(String(job.lastAttemptTime || "")).getTime();
    if (!Number.isFinite(lastAttemptMs)) break;
    const ageMs = Date.now() - lastAttemptMs;
    if (ageMs < -5_000) throw new CanaryError("scheduler_last_attempt_in_future");
    if (ageMs >= 150_000 && !expectedCompletionId) break;
    let matchingCompletion;
    try {
      matchingCompletion = selectSchedulerAttemptCompletion(runs, {
        expectedCompletionId,
        jobName: job.name,
        lastAttemptTime: job.lastAttemptTime,
        jobStatusCode: Number(job.status?.code || 0),
        nowMs: Date.now()
      });
    } catch (_) {
      throw new CanaryError("scheduler_not_quiescent");
    }
    const completionAgeMs =
      Date.now() - new Date(matchingCompletion.syncedAt).getTime();
    if (completionAgeMs >= 5_000) break;
    await delay(Math.max(0, 5_000 - completionAgeMs));
    const [refreshedJob, refreshedRuns] = await Promise.all([
      getAndValidateSchedulerJob(context),
      schedulerSyncRuns(context)
    ]);
    if (
      String(refreshedJob.lastAttemptTime || "") !== observedLastAttemptTime
    ) {
      throw new CanaryError("scheduler_attempt_changed_during_quiescence");
    }
    job = refreshedJob;
    runs = refreshedRuns;
  }
  return {
    job,
    baselineIds: new Set(runs.map((run) => run.id))
  };
}

async function executeEmptyCanary(context, job, preflight) {
  const sendsBefore = await questionnaireSendCount(context);
  const controlProof = await createCanaryControl(context, "empty");
  const before = await assertScheduleTriggerState(context, {
    expectedCanaryCount: 0,
    todayToronto: torontoDate()
  });
  const quiescent = await ensureSchedulerQuiescent(context);
  const immediatelyBefore = await assertScheduleTriggerState(context, {
    expectedCanaryCount: 0,
    todayToronto: torontoDate()
  });
  if (immediatelyBefore.stateDigest !== before.stateDigest) {
    throw new CanaryError("empty_canary_schedule_changed_before_trigger");
  }
  const triggeredJob = await triggerSchedulerJob(context, quiescent.job, controlProof);
  await waitForNewSchedulerRun(context, quiescent.baselineIds, {
    dueSchedules: 0,
    queued: 0,
    skipped: 0
  }, triggeredJob, "empty", controlProof.nonce);
  await delay(3_000);
  const [sendsAfter, after] = await Promise.all([
    questionnaireSendCount(context),
    assertScheduleTriggerState(context, {
      expectedCanaryCount: 0,
      todayToronto: torontoDate()
    })
  ]);
  const postflight = runLivePreflight({ requireIndexReady: true });
  if (sendsAfter !== sendsBefore) throw new CanaryError("empty_canary_send_delta");
  if (
    after.stateDigest !== before.stateDigest
    || JSON.stringify(postflight.schedules) !== JSON.stringify(preflight.schedules)
  ) {
    throw new CanaryError("empty_canary_schedule_delta");
  }
  await cleanupCanaryControl(context, "empty", controlProof.nonce);
  return {
    ok: true,
    check: "questionnaire_scheduler_canary",
    mode: "execute-empty",
    projectId: PROJECT_ID,
    releaseCommit: context.releaseCommit,
    schedulerJob: schedulerJobSummary(triggeredJob),
    dueSchedules: 0,
    queued: 0,
    skipped: 0,
    sendDelta: 0,
    scheduleDelta: 0,
    canaryControlVerified: true,
    syntheticControlRemoved: true,
    writes: {
      syncRuns: 1,
      questionnaireSends: 0,
      questionnaireSchedules: 0,
      syntheticControlsRemoved: 1
    }
  };
}

function readGhlSecret(context) {
  const cli = path.join(context.firebaseRoot, "lib", "bin", "firebase.js");
  if (!fs.existsSync(cli)) throw new CanaryError("firebase_cli_entrypoint_missing");
  const result = spawnSync(process.execPath, [
    cli,
    "functions:secrets:access",
    "GHL_PRIVATE_TOKEN",
    "--project",
    PROJECT_ID
  ], {
    cwd: process.cwd(),
    env: sanitizedChildEnv(),
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 20_000,
    windowsHide: true
  });
  const token = String(result.stdout || "").trim();
  if (result.status !== 0 || !token || token.includes("\n") || token.length > 2_000) {
    throw new CanaryError("ghl_secret_unavailable");
  }
  return token;
}

async function ghlRequest(
  token,
  pathname,
  searchParams = {},
  { allowNotFound = false, redirect = "follow" } = {}
) {
  const url = new URL(`${GHL_BASE}${pathname}`);
  for (const [key, value] of Object.entries(searchParams)) url.searchParams.set(key, value);
  return limitedJsonRequest(url.toString(), {
    allowNotFound,
    redirect,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_API_VERSION
    }
  });
}

async function searchCompleteGhlContacts(token, searchParams) {
  const firstPage = await ghlRequest(token, "/contacts/", searchParams);
  return collectCompleteGhlContactSearch(firstPage, {
    searchParams,
    fetchTerminalPage: ({ pathname, searchParams: terminalSearchParams }) =>
      ghlRequest(token, pathname, terminalSearchParams, { redirect: "error" })
  });
}

async function ghlWriteRequest(token, pathname, method, body) {
  return limitedJsonRequest(`${GHL_BASE}${pathname}`, {
    method,
    body,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_API_VERSION
    }
  });
}

async function cleanupSyntheticGhlTag(token, contact, tag) {
  const contactId = String(contact?.id || "").trim();
  if (!contactId || !tag) throw new CanaryError("synthetic_tag_cleanup_identity_invalid");
  let tagObserved = false;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const before = await ghlRequest(token, `/contacts/${encodeURIComponent(contactId)}`);
    const beforeValue = before.contact || before;
    if (String(beforeValue.id || "") !== contactId) {
      throw new CanaryError("synthetic_tag_cleanup_contact_mismatch");
    }
    const beforeTags = (Array.isArray(beforeValue.tags) ? beforeValue.tags : [])
      .map((value) => String(value || "").trim().toLowerCase());
    if (beforeTags.includes(tag)) {
      tagObserved = true;
    } else if (tagObserved) {
      return {
        addApiAccepted: true,
        tagObserved: true,
        removedBy: "workflow"
      };
    }
    if (attempt < 6) await delay(5_000);
  }
  if (!tagObserved) {
    return {
      addApiAccepted: true,
      tagObserved: false,
      removedBy: "already_absent_after_api_acceptance"
    };
  }
  await ghlWriteRequest(
    token,
    `/contacts/${encodeURIComponent(contactId)}/tags`,
    "DELETE",
    { tags: [tag] }
  );
  const after = await ghlRequest(token, `/contacts/${encodeURIComponent(contactId)}`);
  const afterValue = after.contact || after;
  if (String(afterValue.id || "") !== contactId) {
    throw new CanaryError("synthetic_tag_cleanup_contact_mismatch");
  }
  const afterTags = (Array.isArray(afterValue.tags) ? afterValue.tags : [])
    .map((value) => String(value || "").trim().toLowerCase());
  if (afterTags.includes(tag)) throw new CanaryError("synthetic_tag_cleanup_incomplete");
  return {
    addApiAccepted: true,
    tagObserved: true,
    removedBy: "runner"
  };
}

async function removeSyntheticGhlTagIfPresent(token, contact, tag) {
  const contactId = String(contact?.id || "").trim();
  if (!contactId || !tag) throw new CanaryError("synthetic_tag_cleanup_identity_invalid");
  const before = await ghlRequest(token, `/contacts/${encodeURIComponent(contactId)}`);
  const beforeValue = before.contact || before;
  if (String(beforeValue.id || "") !== contactId) {
    throw new CanaryError("synthetic_tag_cleanup_contact_mismatch");
  }
  const beforeTags = contactTags(beforeValue);
  if (!beforeTags.includes(tag)) {
    return Object.freeze({ tagWasPresent: false, tagRemoved: false });
  }
  await ghlWriteRequest(
    token,
    `/contacts/${encodeURIComponent(contactId)}/tags`,
    "DELETE",
    { tags: [tag] }
  );
  const after = await ghlRequest(token, `/contacts/${encodeURIComponent(contactId)}`);
  const afterValue = after.contact || after;
  if (
    String(afterValue.id || "") !== contactId
    || contactTags(afterValue).includes(tag)
  ) {
    throw new CanaryError("synthetic_tag_cleanup_incomplete");
  }
  return Object.freeze({ tagWasPresent: true, tagRemoved: true });
}

async function discoverSyntheticContact(context, {
  requireTargetTagAbsent,
  targetTag = LEGACY_GHL_TAG
}) {
  const token = readGhlSecret(context);
  const contactSets = await searchSyntheticContactSets(token);
  const contact = selectDiscoveredSyntheticContact(contactSets, {
    requireTargetTagAbsent,
    targetTag
  });
  if (String(contact?.locationId || "").trim() !== GHL_LOCATION_ID) {
    throw new CanaryError("synthetic_contact_location_mismatch");
  }
  return { token, contact };
}

function selectDiscoveredSyntheticContact(contactSets, {
  requireTargetTagAbsent,
  targetTag
}) {
  let contact;
  try {
    contact = selectUniqueSyntheticContact(contactSets, { targetTag });
  } catch (error) {
    if (
      !requireTargetTagAbsent
      && error instanceof CanaryError
      && error.code === "synthetic_contact_target_tag_already_present"
    ) {
      const byId = new Map();
      contactSets.flat().forEach((item) => {
        if (item?.id) byId.set(item.id, item);
      });
      const explicit = [...byId.values()].filter((item) => {
        try {
          selectUniqueSyntheticContact([[{
            ...item,
            tags: (item.tags || []).filter((tag) =>
              String(tag).toLowerCase() !== String(targetTag).toLowerCase()
            )
          }]], { targetTag });
          return true;
        } catch (_) {
          return false;
        }
      });
      if (explicit.length !== 1) throw new CanaryError("synthetic_contact_not_unique");
      contact = explicit[0];
    } else {
      throw error;
    }
  }
  if (String(contact?.locationId || "").trim() !== GHL_LOCATION_ID) {
    throw new CanaryError("synthetic_contact_location_mismatch");
  }
  return contact;
}

async function searchSyntheticContactSets(token) {
  const byId = new Map();
  for (const query of ["canary", "questionnaire test", "dashboard test", "qa"]) {
    const contacts = await searchCompleteGhlContacts(token, {
      locationId: GHL_LOCATION_ID,
      query,
      limit: "100"
    });
    for (const contact of contacts) {
      const id = String(contact?.id || "").trim();
      if (id) byId.set(id, contact);
    }
  }
  const candidateIds = [...byId.values()]
    .filter((contact) => explicitSyntheticContact(contact, { requireDnd: false }))
    .map((contact) => String(contact.id).trim());
  if (candidateIds.length > 5) {
    throw new CanaryError("synthetic_contact_candidate_overflow");
  }
  const hydrated = await Promise.all(candidateIds.map(async (contactId) => {
    const response = await ghlRequest(
      token,
      `/contacts/${encodeURIComponent(contactId)}`
    );
    return response.contact || response;
  }));
  return [hydrated];
}

async function duplicateContactByReservedPhone(token) {
  const data = await ghlRequest(token, "/contacts/search/duplicate", {
    locationId: GHL_LOCATION_ID,
    number: `+1${SYNTHETIC_CONTACT_PHONE}`
  }, { allowNotFound: true });
  if (!data) return null;
  const contact = data?.contact;
  if (!contact?.id) return null;
  const exact = await ghlRequest(
    token,
    `/contacts/${encodeURIComponent(String(contact.id).trim())}`
  );
  return exact.contact || exact;
}

async function searchReservedPhoneMatches(token) {
  const byId = new Map();
  for (const query of [
    SYNTHETIC_CONTACT_PHONE,
    `+1${SYNTHETIC_CONTACT_PHONE}`,
    "514-555-0100"
  ]) {
    const contacts = await searchCompleteGhlContacts(token, {
      locationId: GHL_LOCATION_ID,
      query,
      limit: "100"
    });
    for (const contact of contacts) {
      if (
        contact?.id
        && normalizePhone(contact.phone) === SYNTHETIC_CONTACT_PHONE
      ) {
        byId.set(String(contact.id).trim(), contact);
      }
    }
  }
  return [...byId.values()];
}

async function validateProvisionedSyntheticContact(context, contact) {
  if (
    String(contact?.locationId || "").trim() !== GHL_LOCATION_ID
    || normalizePhone(contact?.phone) !== SYNTHETIC_CONTACT_PHONE
    || !explicitSyntheticContact(contact)
    || !historicalGhlTagsAbsent(contact)
  ) {
    throw new CanaryError("synthetic_contact_provision_validation_failed");
  }
  await assertContactNotDashboardMember(context, contact);
  return contact;
}

async function waitForProvisionedSyntheticContact(context, token, expectedId = "") {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const [duplicate, phoneMatches] = await Promise.all([
      duplicateContactByReservedPhone(token),
      searchReservedPhoneMatches(token)
    ]);
    if (phoneMatches.length > 1) {
      throw new CanaryError("synthetic_phone_not_unique");
    }
    if (duplicate) {
      const valid = await validateProvisionedSyntheticContact(context, duplicate);
      if (expectedId && String(valid.id || "").trim() !== expectedId) {
        throw new CanaryError("synthetic_contact_provision_identity_mismatch");
      }
      if (
        phoneMatches.length !== 1
        || String(phoneMatches[0]?.id || "").trim() !== String(valid.id || "").trim()
      ) {
        if (attempt < 9 && phoneMatches.length === 0) {
          await delay(2_000);
          continue;
        }
        throw new CanaryError("synthetic_phone_lookup_mismatch");
      }
      try {
        const discovered = selectUniqueSyntheticContact(
          await searchSyntheticContactSets(token),
          { targetTag: LEGACY_GHL_TAG }
        );
        if (String(discovered?.id || "").trim() === String(valid.id || "").trim()) {
          return valid;
        }
      } catch (error) {
        if (
          !(error instanceof CanaryError)
          || error.code !== "synthetic_contact_not_unique"
        ) {
          throw error;
        }
      }
    }
    if (attempt < 9) await delay(2_000);
  }
  throw new CanaryError("synthetic_contact_provision_not_observable");
}

async function provisionSyntheticContact(context) {
  const token = readGhlSecret(context);
  await assertReservedPhoneNotDashboardMember(context);
  const [existing, phoneMatches, syntheticContactSets] = await Promise.all([
    duplicateContactByReservedPhone(token),
    searchReservedPhoneMatches(token),
    searchSyntheticContactSets(token)
  ]);
  const syntheticContacts = syntheticContactSets.flat();
  if (syntheticContacts.length > 1) {
    throw new CanaryError("synthetic_contact_not_unique");
  }
  if (phoneMatches.length > 1) {
    throw new CanaryError("synthetic_phone_not_unique");
  }
  if (!existing && phoneMatches.length > 0) {
    throw new CanaryError("synthetic_phone_duplicate_lookup_inconsistent");
  }
  if (existing) {
    if (
      syntheticContacts.length > 0
      && String(syntheticContacts[0]?.id || "").trim()
        !== String(existing.id || "").trim()
    ) {
      throw new CanaryError("synthetic_contact_global_identity_mismatch");
    }
    if (
      phoneMatches.length > 0
      && String(phoneMatches[0]?.id || "").trim() !== String(existing.id || "").trim()
    ) {
      throw new CanaryError("synthetic_phone_lookup_mismatch");
    }
    const contact = await waitForProvisionedSyntheticContact(
      context,
      token,
      String(existing.id || "").trim()
    );
    return {
      created: false,
      sharedFenceCreated: false,
      contact
    };
  }
  if (syntheticContacts.length > 0) {
    throw new CanaryError("synthetic_contact_exists_on_other_reserved_phone");
  }

  await assertReservedPhoneNotDashboardMember(context);
  const [
    duplicateImmediatelyBefore,
    phoneMatchesImmediatelyBefore,
    syntheticContactSetsImmediatelyBefore
  ] =
    await Promise.all([
      duplicateContactByReservedPhone(token),
      searchReservedPhoneMatches(token),
      searchSyntheticContactSets(token)
    ]);
  if (
    duplicateImmediatelyBefore
    || phoneMatchesImmediatelyBefore.length > 0
    || syntheticContactSetsImmediatelyBefore.flat().length > 0
  ) {
    throw new CanaryError("synthetic_phone_collision_before_create");
  }

  const sharedClaim = await acquireCloudProvisionClaim(context);
  if (!sharedClaim.acquired) {
    try {
      const recovered = await waitForProvisionedSyntheticContact(context, token);
      return {
        created: false,
        sharedFenceCreated: false,
        contact: recovered
      };
    } catch (_) {
      throw new CanaryError("synthetic_contact_provision_attempt_unresolved");
    }
  }

  const provisionFence = acquireProvisionAttemptFence(context.releaseCommit);
  if (!provisionFence.acquired) {
    try {
      const recovered = await waitForProvisionedSyntheticContact(context, token);
      return {
        created: false,
        sharedFenceCreated: true,
        contact: recovered
      };
    } catch (_) {
      throw new CanaryError("synthetic_contact_provision_attempt_unresolved");
    }
  }

  let createdId = "";
  try {
    const response = await ghlWriteRequest(token, "/contacts/", "POST", {
      firstName: "CFSB Questionnaire",
      lastName: "Canary",
      name: SYNTHETIC_CONTACT_NAME,
      locationId: GHL_LOCATION_ID,
      phone: `+1${SYNTHETIC_CONTACT_PHONE}`,
      dnd: true,
      tags: [SYNTHETIC_CONTACT_MARKER_TAG, "qa"],
      source: SYNTHETIC_CONTACT_SOURCE
    });
    createdId = String((response.contact || response)?.id || "").trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(createdId)) {
      throw new CanaryError("synthetic_contact_provision_response_invalid");
    }
  } catch (_) {
    try {
      const recovered = await waitForProvisionedSyntheticContact(context, token);
      return {
        created: true,
        sharedFenceCreated: true,
        contact: recovered
      };
    } catch (_) {
      throw new CanaryError("synthetic_contact_provision_attempt_unresolved");
    }
  }

  const contact = await waitForProvisionedSyntheticContact(
    context,
    token,
    createdId
  );
  return {
    created: true,
    sharedFenceCreated: true,
    contact
  };
}

async function acquireCloudProvisionClaim(context) {
  const claim = buildContactProvisionClaim({
    releaseCommit: context.releaseCommit,
    locationId: GHL_LOCATION_ID,
    phone: SYNTHETIC_CONTACT_PHONE,
    createdAt: new Date().toISOString()
  });
  return acquireSharedContactProvisionClaim({
    claim,
    createClaim: async (value) => {
      const created = await createDocument(
        context,
        CONTROL_COLLECTION,
        SYNTHETIC_CONTACT_PROVISION_CLAIM_ID,
        value
      );
      return decodeFirestoreDocument(created);
    },
    readClaim: async () => {
      const existing = await getDocument(
        context,
        CONTROL_COLLECTION,
        SYNTHETIC_CONTACT_PROVISION_CLAIM_ID,
        { allowNotFound: true }
      );
      return existing ? decodeFirestoreDocument(existing) : null;
    }
  });
}

async function discoverPinnedSyntheticContact(context, { targetTag }) {
  const result = await loadPinnedSyntheticContact(context);
  if (
    contactTags(result.contact).includes(String(targetTag || "").trim().toLowerCase())
    || !historicalGhlTagsAbsent(result.contact)
  ) {
    throw new CanaryError("synthetic_contact_target_tag_already_present");
  }
  return result;
}

async function loadPinnedSyntheticContact(context) {
  const token = readGhlSecret(context);
  const receipt = readPinnedContactReceipt(context.releaseCommit);
  const response = await ghlRequest(
    token,
    `/contacts/${encodeURIComponent(receipt.contactId)}`
  );
  const contact = response.contact || response;
  if (
    String(contact?.id || "").trim() !== receipt.contactId
    || String(contact?.locationId || "").trim() !== GHL_LOCATION_ID
    || !explicitSyntheticContact(contact)
  ) {
    throw new CanaryError("pinned_synthetic_contact_invalid");
  }
  assertPinnedContact(context.releaseCommit, contact);
  await assertContactNotDashboardMember(context, contact);
  return { token, contact };
}

async function activeAdminProfile(context) {
  const documents = await listDocuments(context, "users", ["email", "active", "role", "coachId"]);
  const matches = documents
    .map((document) => ({ id: documentId(document), ...decodeFirestoreDocument(document) }))
    .filter((profile) =>
      String(profile.email || "").trim().toLowerCase() === context.actorEmail
      && profile.active === true
      && profile.role === "admin"
    );
  if (matches.length !== 1 || !matches[0].id) throw new CanaryError("active_admin_profile_not_unique");
  return matches[0];
}

function safeSyntheticFixture(value, releaseCommit) {
  return canaryTargetOwnedForCleanup(value, releaseCommit)
    && value.coachId === "admin"
    && value.source === CANARY_SOURCE;
}

async function pauseCanaryScheduleIfOwned(context, ids) {
  const document = await getDocument(context, "questionnaireSchedules", ids.scheduleId, {
    allowNotFound: true
  });
  if (!document) return;
  const value = decodeFirestoreDocument(document);
  if (
    value.source !== CANARY_SOURCE
    || value.questionnaireCanaryOnly !== true
    || value.canaryReleaseCommit !== context.releaseCommit
    || value.clientId !== ids.targetId
    || value.coachId !== "admin"
  ) {
    throw new CanaryError("canary_schedule_cleanup_target_mismatch");
  }
  await patchDocument(context, "questionnaireSchedules", ids.scheduleId, {
    status: "paused",
    updatedAt: new Date().toISOString()
  }, document.updateTime);
}

async function cleanupCanaryFixtures(context, ids) {
  await pauseCanaryScheduleIfOwned(context, ids);
  const schedule = await getDocument(context, "questionnaireSchedules", ids.scheduleId, {
    allowNotFound: true
  });
  if (schedule) {
    const value = decodeFirestoreDocument(schedule);
    if (
      value.source !== CANARY_SOURCE
      || value.questionnaireCanaryOnly !== true
      || value.canaryReleaseCommit !== context.releaseCommit
      || value.clientId !== ids.targetId
      || value.coachId !== "admin"
      || value.status !== "paused"
    ) {
      throw new CanaryError("canary_schedule_cleanup_target_mismatch");
    }
    await deleteDocument(context, "questionnaireSchedules", ids.scheduleId, schedule.updateTime);
  }
  const target = await getDocument(context, "questionnaireCanaryTargets", ids.targetId, {
    allowNotFound: true
  });
  if (target) {
    const value = decodeFirestoreDocument(target);
    if (!safeSyntheticFixture(value, context.releaseCommit)) {
      throw new CanaryError("canary_target_cleanup_target_mismatch");
    }
    await deleteDocument(context, "questionnaireCanaryTargets", ids.targetId, target.updateTime);
  }
  const [scheduleAfter, targetAfter] = await Promise.all([
    getDocument(context, "questionnaireSchedules", ids.scheduleId, { allowNotFound: true }),
    getDocument(context, "questionnaireCanaryTargets", ids.targetId, { allowNotFound: true })
  ]);
  if (scheduleAfter || targetAfter) throw new CanaryError("canary_cleanup_incomplete");
}

async function waitForCanarySend(context, sendId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const document = await getDocument(context, "questionnaireSends", sendId, {
      allowNotFound: true,
      fieldPaths: [
        "status",
        "deliveryStatus",
        "source",
        "questionnaireScheduleId",
        "questionnaireCanaryOnly",
        "questionnaireCanarySource",
        "questionnaireCanaryMode",
        "canaryReleaseCommit",
        "externalEffectState",
        "externalEffectProof",
        "externalEffectEventId",
        "processingEventId",
        "externalEffectStartedAt",
        "externalEffectCompletedAt",
        "externalEffectExpectedGhlContactId",
        "ghlContactId",
        "ghlTag",
        "questionnaireType",
        "sentAt"
      ]
    });
    if (document) {
      const send = decodeFirestoreDocument(document);
      if (["error", "sent"].includes(send.status)) return send;
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new CanaryError("canary_send_timeout");
}

async function deleteCanaryTargetIfOwned(context, targetId) {
  const document = await getDocument(context, "questionnaireCanaryTargets", targetId);
  const value = decodeFirestoreDocument(document);
  if (!safeSyntheticFixture(value, context.releaseCommit)) {
    throw new CanaryError("canary_target_cleanup_target_mismatch");
  }
  await deleteDocument(context, "questionnaireCanaryTargets", targetId, document.updateTime);
  const after = await getDocument(context, "questionnaireCanaryTargets", targetId, {
    allowNotFound: true
  });
  if (after) throw new CanaryError("canary_cleanup_incomplete");
}

function assertRecoverableCanarySend(document, context, ids) {
  const id = documentId(document);
  const value = decodeFirestoreDocument(document);
  const processId = processCanarySendId(context.releaseCommit);
  const schedulerPrefix = `scheduled_${ids.scheduleId}_`;
  const commonOwned = value.source === "dashboard_questionnaire_scheduled"
    && value.questionnaireCanaryOnly === true
    && value.questionnaireCanarySource === CANARY_SOURCE
    && value.canaryReleaseCommit === context.releaseCommit
    && value.clientId === ids.targetId
    && value.coachId === "admin";
  const processOwned = id === processId
    && value.questionnaireCanaryMode === "process"
    && value.questionnaireType === "habitudes_quotidiennes"
    && !value.questionnaireScheduleId;
  const schedulerOwned = id.startsWith(schedulerPrefix)
    && /^scheduled_system_questionnaire_schedule_canary_[a-f0-9]{12}_\d{4}-\d{2}-\d{2}$/.test(id)
    && value.questionnaireCanaryMode === "scheduler"
    && value.questionnaireType === "suivi_global"
    && value.questionnaireScheduleId === ids.scheduleId;
  if (!commonOwned || (!processOwned && !schedulerOwned)) {
    throw new CanaryError("canary_cleanup_send_ownership_mismatch");
  }
  if (!["pending", "queued", "sent", "error"].includes(value.status)) {
    throw new CanaryError("canary_cleanup_send_status_invalid");
  }
  if (
    value.externalEffectState
    && !["started", "completed", "uncertain"].includes(value.externalEffectState)
  ) {
    throw new CanaryError("canary_cleanup_external_effect_state_invalid");
  }
  if (
    canarySendHasUncertainExternalEffect(value)
    && !Number.isFinite(
      new Date(String(value.externalEffectUncertainAt || "")).getTime()
    )
  ) {
    throw new CanaryError("canary_cleanup_uncertain_timestamp_invalid");
  }
  return value;
}

async function recoverableCanarySends(context, ids) {
  const documents = await listDocuments(context, "questionnaireSends", [
    "status",
    "source",
    "clientId",
    "coachId",
    "questionnaireType",
    "questionnaireScheduleId",
    "questionnaireCanaryOnly",
    "questionnaireCanarySource",
    "questionnaireCanaryMode",
    "canaryReleaseCommit",
    "externalEffectState",
    "externalEffectUncertainAt"
  ]);
  const matches = documents.filter((document) =>
    decodeFirestoreDocument(document).canaryReleaseCommit === context.releaseCommit
  );
  if (matches.length > 2) throw new CanaryError("canary_cleanup_send_count_invalid");
  return matches.map((document) => ({
    document,
    value: assertRecoverableCanarySend(document, context, ids)
  }));
}

async function waitForRecoverableCanarySendsToQuiesce(context, ids) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < RECOVERY_QUIESCENCE_TIMEOUT_MS) {
    const sends = await recoverableCanarySends(context, ids);
    if (!sends.some(({ value }) =>
      canarySendRequiresDeferredExternalCleanup(value)
    )) {
      return sends;
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new CanaryError("canary_cleanup_external_effect_in_flight");
}

async function cancelCanaryTargetIfOwned(context, targetId) {
  const document = await getDocument(
    context,
    "questionnaireCanaryTargets",
    targetId,
    { allowNotFound: true }
  );
  if (!document) return null;
  const value = decodeFirestoreDocument(document);
  if (!safeSyntheticFixture(value, context.releaseCommit)) {
    throw new CanaryError("canary_target_cleanup_target_mismatch");
  }
  if (value.status === "active") {
    await patchDocument(context, "questionnaireCanaryTargets", targetId, {
      status: "cancelled",
      updatedAt: new Date().toISOString()
    }, document.updateTime);
  }
  const cancelled = await getDocument(context, "questionnaireCanaryTargets", targetId);
  const cancelledValue = decodeFirestoreDocument(cancelled);
  if (
    !safeSyntheticFixture(cancelledValue, context.releaseCommit)
    || cancelledValue.status !== "cancelled"
  ) {
    throw new CanaryError("canary_target_cancellation_incomplete");
  }
  return cancelledValue;
}

async function loadRecoverySyntheticContact(context, targetValue = null) {
  if (!targetValue) return loadPinnedSyntheticContact(context);
  if (!safeSyntheticFixture(targetValue, context.releaseCommit)) {
    throw new CanaryError("canary_target_cleanup_target_mismatch");
  }
  const token = readGhlSecret(context);
  const contactId = String(targetValue.expectedGhlContactId || "").trim();
  const response = await ghlRequest(
    token,
    `/contacts/${encodeURIComponent(contactId)}`
  );
  const contact = response.contact || response;
  if (
    String(contact?.id || "").trim() !== contactId
    || String(contact?.locationId || "").trim() !== GHL_LOCATION_ID
    || normalizePhone(contact?.phone) !== normalizePhone(targetValue.phoneNormalized)
    || !explicitSyntheticContact(contact)
  ) {
    throw new CanaryError("recovery_synthetic_contact_invalid");
  }
  await assertContactNotDashboardMember(context, contact);
  return { token, contact };
}

async function reconcileUncertainCanaryExternalEffects(
  context,
  targetValue,
  sends
) {
  const uncertain = sends.filter(({ value }) =>
    canarySendHasUncertainExternalEffect(value)
  );
  if (uncertain.length === 0) return null;
  const uncertainTimes = uncertain.map(({ value }) =>
    new Date(String(value.externalEffectUncertainAt || "")).getTime()
  );
  if (uncertainTimes.some((value) => !Number.isFinite(value))) {
    throw new CanaryError("canary_cleanup_uncertain_timestamp_invalid");
  }
  const settleUntil = Math.max(...uncertainTimes) + UNCERTAIN_EFFECT_SETTLEMENT_MS;
  if (settleUntil > Date.now()) {
    await delay(settleUntil - Date.now());
  }
  const pinned = await loadRecoverySyntheticContact(context, targetValue);
  const cleanups = [];
  for (
    let attempt = 0;
    attempt < UNCERTAIN_EFFECT_OBSERVATION_ATTEMPTS;
    attempt += 1
  ) {
    for (const tag of HISTORICAL_GHL_TAGS) {
      cleanups.push(await removeSyntheticGhlTagIfPresent(
        pinned.token,
        pinned.contact,
        tag
      ));
    }
    if (attempt < UNCERTAIN_EFFECT_OBSERVATION_ATTEMPTS - 1) {
      await delay(5_000);
    }
  }
  return Object.freeze({
    dashboardNonMemberVerified: true,
    exactMarkerTagVerified: true,
    syntheticTagsObserved:
      cleanups.filter((entry) => entry.tagWasPresent).length,
    syntheticTagsRemoved:
      cleanups.filter((entry) => entry.tagRemoved).length,
    uncertainExternalEffectsReconciled: uncertain.length
  });
}

async function executeCleanup(context) {
  const ids = canaryIds(context.releaseCommit);
  const [control, schedule, target] = await Promise.all([
    getDocument(context, CONTROL_COLLECTION, CONTROL_ID, { allowNotFound: true }),
    getDocument(context, "questionnaireSchedules", ids.scheduleId, { allowNotFound: true }),
    getDocument(context, "questionnaireCanaryTargets", ids.targetId, { allowNotFound: true })
  ]);

  let originalTargetValue = null;
  if (target) {
    originalTargetValue = decodeFirestoreDocument(target);
    if (!safeSyntheticFixture(originalTargetValue, context.releaseCommit)) {
      throw new CanaryError("canary_target_cleanup_target_mismatch");
    }
  }

  if (schedule) {
    const value = decodeFirestoreDocument(schedule);
    if (
      value.source !== CANARY_SOURCE
      || value.questionnaireCanaryOnly !== true
      || value.canaryReleaseCommit !== context.releaseCommit
      || value.clientId !== ids.targetId
      || value.coachId !== "admin"
    ) {
      throw new CanaryError("canary_schedule_cleanup_target_mismatch");
    }
    await pauseCanaryScheduleIfOwned(context, ids);
  }

  if (target) {
    originalTargetValue = await cancelCanaryTargetIfOwned(context, ids.targetId);
  }

  let controlProof = null;
  if (control) {
    const value = decodeFirestoreDocument(control);
    controlProof = { mode: value.mode, nonce: value.nonce };
    if (!canaryControlOwnedForCleanup(
      value,
      context.releaseCommit,
      controlProof.mode,
      controlProof.nonce
    )) {
      throw new CanaryError("canary_control_cleanup_target_mismatch");
    }
  }

  await recoverableCanarySends(context, ids);
  if (controlProof) {
    await cleanupCanaryControl(
      context,
      controlProof.mode,
      controlProof.nonce
    );
  }
  const sends = await waitForRecoverableCanarySendsToQuiesce(context, ids);
  let ghlCleanupStatus = "not_required";
  let dashboardNonMemberVerified = false;
  let exactMarkerTagVerified = false;
  let syntheticTagsObserved = 0;
  let syntheticTagsRemoved = 0;
  let uncertainExternalEffectsReconciled = 0;
  const nonTerminalSends = sends.filter(({ value }) =>
    canarySendRequiresDeferredExternalCleanup(value)
  ).length;
  if (nonTerminalSends > 0) {
    throw new CanaryError("canary_cleanup_external_effect_in_flight");
  }
  const uncertainReconciliation =
    await reconcileUncertainCanaryExternalEffects(
      context,
      originalTargetValue,
      sends
    );
  if (uncertainReconciliation) {
    ghlCleanupStatus = "complete";
    dashboardNonMemberVerified =
      uncertainReconciliation.dashboardNonMemberVerified;
    exactMarkerTagVerified =
      uncertainReconciliation.exactMarkerTagVerified;
    syntheticTagsObserved =
      uncertainReconciliation.syntheticTagsObserved;
    syntheticTagsRemoved =
      uncertainReconciliation.syntheticTagsRemoved;
    uncertainExternalEffectsReconciled =
      uncertainReconciliation.uncertainExternalEffectsReconciled;
  } else if (sends.length > 0) {
    ghlCleanupStatus = "deferred";
    try {
      const pinned = await loadRecoverySyntheticContact(context, originalTargetValue);
      dashboardNonMemberVerified = true;
      exactMarkerTagVerified = true;
      const tagCleanup = [];
      for (const tag of HISTORICAL_GHL_TAGS) {
        tagCleanup.push(await removeSyntheticGhlTagIfPresent(
          pinned.token,
          pinned.contact,
          tag
        ));
      }
      syntheticTagsObserved =
        tagCleanup.filter((entry) => entry.tagWasPresent).length;
      syntheticTagsRemoved =
        tagCleanup.filter((entry) => entry.tagRemoved).length;
      ghlCleanupStatus = "complete";
    } catch (_) {
      // Firestore recovery is authoritative and must not be rolled back merely
      // because GHL or the optional local contact receipt is unavailable.
    }
  }
  if (schedule || target) {
    await cleanupCanaryFixtures(context, ids);
  }

  const [scheduleAfter, targetAfter, controlAfter] = await Promise.all([
    getDocument(context, "questionnaireSchedules", ids.scheduleId, { allowNotFound: true }),
    getDocument(context, "questionnaireCanaryTargets", ids.targetId, { allowNotFound: true }),
    getDocument(context, CONTROL_COLLECTION, CONTROL_ID, { allowNotFound: true })
  ]);
  if (scheduleAfter || targetAfter || controlAfter) {
    throw new CanaryError("canary_cleanup_incomplete");
  }
  const finalScheduleState = await assertScheduleTriggerState(context, {
    expectedCanaryCount: 0,
    todayToronto: torontoDate()
  });
  const postflight = runLivePreflight({ requireIndexReady: false });
  if (postflight.schedules.activeDue !== 0) {
    throw new CanaryError("canary_postflight_active_due");
  }

  return {
    ok: true,
    check: "questionnaire_canary_cleanup",
    mode: "cleanup",
    projectId: PROJECT_ID,
    releaseCommit: context.releaseCommit,
    firestoreRecoveryComplete: true,
    schedulerReleaseUnblocked: true,
    externalEffectQuiescent: true,
    schedulerCancellationBarrierApplied: Boolean(schedule || target || control),
    sendEvidencePreserved: sends.length,
    nonTerminalSendEvidencePreserved: nonTerminalSends,
    ghlCleanupStatus,
    dashboardNonMemberVerified,
    exactMarkerTagVerified,
    syntheticTagsObserved,
    syntheticTagsRemoved,
    uncertainExternalEffectsReconciled,
    syntheticFixturesRemoved: Boolean(schedule || target),
    syntheticControlRemoved: Boolean(control),
    finalActiveDueSchedules: finalScheduleState.activeDue,
    questionnaireSendsDeleted: 0
  };
}

async function executeProcessCanary(context) {
  const ids = canaryIds(context.releaseCommit);
  const sendId = processCanarySendId(context.releaseCommit);
  const existing = await Promise.all([
    getDocument(context, "questionnaireCanaryTargets", ids.targetId, { allowNotFound: true }),
    getDocument(context, "questionnaireSends", sendId, { allowNotFound: true })
  ]);
  if (existing.some(Boolean)) throw new CanaryError("canary_deterministic_resource_exists");

  const [{ token, contact }, adminProfile] = await Promise.all([
    discoverPinnedSyntheticContact(context, {
      targetTag: PROCESS_GHL_TAG
    }),
    activeAdminProfile(context)
  ]);
  assertPinnedContact(context.releaseCommit, contact);
  const phone = normalizePhone(contact.phone);
  const armedUntil = new Date(Date.now() + (12 * 60 * 1000)).toISOString();
  const target = buildCanaryTarget({
    releaseCommit: context.releaseCommit,
    armedUntil,
    expectedGhlContactId: contact.id,
    phoneNormalized: phone
  });
  const send = buildProcessCanarySend({
    releaseCommit: context.releaseCommit,
    armedUntil,
    requestedByUid: adminProfile.id,
    requestedByEmail: context.actorEmail,
    phoneNormalized: phone
  });
  const sendsBefore = await questionnaireSendCount(context);
  let targetCreated = false;
  let sendCreated = false;

  try {
    const now = new Date().toISOString();
    await createDocument(context, "questionnaireCanaryTargets", ids.targetId, {
      ...target,
      createdAt: now,
      updatedAt: now
    });
    targetCreated = true;
    await createDocument(context, "questionnaireSends", sendId, {
      ...send,
      createdAt: now,
      updatedAt: now
    });
    sendCreated = true;

    const terminal = await waitForCanarySend(context, sendId);
    if (
      terminal.status !== "sent"
      || terminal.deliveryStatus !== "tag_added"
      || terminal.source !== "dashboard_questionnaire_scheduled"
      || terminal.questionnaireCanaryOnly !== true
      || terminal.questionnaireCanarySource !== CANARY_SOURCE
      || terminal.questionnaireCanaryMode !== "process"
      || terminal.canaryReleaseCommit !== context.releaseCommit
      || terminal.externalEffectState !== "completed"
      || terminal.ghlTag !== PROCESS_GHL_TAG
      || terminal.questionnaireType !== "habitudes_quotidiennes"
    ) {
      throw new CanaryError("process_canary_send_terminal_mismatch");
    }

    const tagCleanup = await cleanupSyntheticGhlTag(token, contact, PROCESS_GHL_TAG);

    const sendsAfter = await questionnaireSendCount(context);
    if (sendsAfter !== sendsBefore + 1) throw new CanaryError("process_canary_send_delta");
    await deleteCanaryTargetIfOwned(context, ids.targetId);
    targetCreated = false;
    const postflight = runLivePreflight({ requireIndexReady: false });
    if (postflight.schedules.activeDue !== 0) throw new CanaryError("canary_postflight_active_due");
    if (!canaryGhlEffectVerified(terminal, tagCleanup, {
      expectedTag: PROCESS_GHL_TAG,
      expectedContactId: contact.id
    })) {
      throw new CanaryError("process_canary_target_tag_not_observed");
    }

    return {
      ok: true,
      check: "questionnaire_process_canary",
      mode: "execute-process",
      projectId: PROJECT_ID,
      releaseCommit: context.releaseCommit,
      sendDelta: 1,
      deterministicSendVerified: true,
      externalEffectClaimVerified: true,
      expectedSyntheticContactVerified: true,
      ghlAddApiAccepted: tagCleanup.addApiAccepted,
      ghlAddReceiptVerified: true,
      targetTagObserved: tagCleanup.tagObserved,
      targetTagEffectVerified: true,
      targetTagFinalAbsenceVerified: true,
      targetTagRemovedBy: tagCleanup.removedBy,
      syntheticTargetRemoved: true,
      writes: {
        questionnaireSends: 1,
        syntheticTargetsRemoved: 1
      }
    };
  } catch (error) {
    if (targetCreated && !sendCreated) {
      try {
        await deleteCanaryTargetIfOwned(context, ids.targetId);
      } catch (_) {
        throw new CanaryError("canary_failure_and_cleanup_failed");
      }
    }
    throw error;
  }
}

async function executePositiveCanary(context, job) {
  const ids = canaryIds(context.releaseCommit);
  const todayToronto = torontoDate();
  const sendId = `scheduled_${ids.scheduleId}_${todayToronto}`;
  const [existing, priorCanarySends] = await Promise.all([
    Promise.all([
      getDocument(context, "questionnaireCanaryTargets", ids.targetId, { allowNotFound: true }),
      getDocument(context, "questionnaireSchedules", ids.scheduleId, { allowNotFound: true }),
      getDocument(context, "questionnaireSends", sendId, { allowNotFound: true }),
      getDocument(context, CONTROL_COLLECTION, CONTROL_ID, { allowNotFound: true })
    ]),
    recoverableCanarySends(context, ids)
  ]);
  const priorSendValues = priorCanarySends.map(({ value }) => value);
  if (positiveCanaryAttemptExists(priorSendValues, context.releaseCommit)) {
    throw new CanaryError("positive_canary_release_already_attempted");
  }
  const processEvidence = priorSendValues.filter((value) =>
    value.questionnaireCanaryMode === "process"
  );
  if (
    processEvidence.length !== 1
    || processEvidence[0].status !== "sent"
    || processEvidence[0].externalEffectState !== "completed"
  ) {
    throw new CanaryError("process_canary_evidence_missing");
  }
  if (existing.some(Boolean)) throw new CanaryError("canary_deterministic_resource_exists");

  const [{ token, contact }, adminProfile] = await Promise.all([
    discoverPinnedSyntheticContact(context, {
      targetTag: LEGACY_GHL_TAG
    }),
    activeAdminProfile(context)
  ]);
  assertPinnedContact(context.releaseCommit, contact);
  const phone = normalizePhone(contact.phone);
  const armedUntil = new Date(Date.now() + (12 * 60 * 1000)).toISOString();
  const target = buildCanaryTarget({
    releaseCommit: context.releaseCommit,
    armedUntil,
    expectedGhlContactId: contact.id,
    phoneNormalized: phone
  });
  const schedule = buildCanarySchedule({
    releaseCommit: context.releaseCommit,
    armedUntil,
    todayToronto,
    requestedByUid: adminProfile.id,
    requestedByEmail: context.actorEmail,
    phoneNormalized: phone
  });
  const sendsBefore = await questionnaireSendCount(context);
  let targetCreated = false;
  let scheduleCreated = false;
  let controlCreated = false;
  let controlProof = null;

  try {
    controlProof = await createCanaryControl(context, "positive");
    controlCreated = true;
    await createDocument(context, "questionnaireCanaryTargets", ids.targetId, {
      ...target,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    targetCreated = true;
    await createDocument(context, "questionnaireSchedules", ids.scheduleId, {
      ...schedule,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    scheduleCreated = true;

    const before = await assertScheduleTriggerState(context, {
      expectedCanaryCount: 1,
      todayToronto
    });
    const quiescent = await ensureSchedulerQuiescent(context);
    const immediatelyBefore = await assertScheduleTriggerState(context, {
      expectedCanaryCount: 1,
      todayToronto
    });
    if (immediatelyBefore.stateDigest !== before.stateDigest) {
      throw new CanaryError("positive_canary_schedule_changed_before_trigger");
    }
    const triggeredJob = await triggerSchedulerJob(context, quiescent.job, controlProof);
    const firstRun = await waitForNewSchedulerRun(context, quiescent.baselineIds, {
      dueSchedules: 1,
      queued: 1,
      skipped: 0
    }, triggeredJob, "positive", controlProof.nonce);

    const send = await waitForCanarySend(context, sendId);
    if (
      send.status !== "sent"
      || send.deliveryStatus !== "tag_added"
      || send.source !== "dashboard_questionnaire_scheduled"
      || send.questionnaireScheduleId !== ids.scheduleId
      || send.questionnaireCanaryOnly !== true
      || send.questionnaireCanarySource !== CANARY_SOURCE
      || send.canaryReleaseCommit !== context.releaseCommit
      || send.externalEffectState !== "completed"
      || send.ghlTag !== LEGACY_GHL_TAG
    ) {
      throw new CanaryError("canary_send_terminal_mismatch");
    }

    const tagCleanup = await cleanupSyntheticGhlTag(token, contact, LEGACY_GHL_TAG);

    const scheduleAfter = decodeFirestoreDocument(await getDocument(
      context,
      "questionnaireSchedules",
      ids.scheduleId
    ));
    if (scheduleAfter.status !== "paused" || scheduleAfter.nextSendAt !== "") {
      throw new CanaryError("canary_schedule_not_paused");
    }

    await assertScheduleTriggerState(context, {
      expectedCanaryCount: 0,
      todayToronto
    });
    const replayQuiescent = await ensureSchedulerQuiescent(context, {
      expectedCompletionId: firstRun.id
    });
    await assertScheduleTriggerState(context, {
      expectedCanaryCount: 0,
      todayToronto
    });
    const replayTriggeredJob = await triggerSchedulerJob(
      context,
      replayQuiescent.job,
      controlProof
    );
    await waitForNewSchedulerRun(context, replayQuiescent.baselineIds, {
      dueSchedules: 0,
      queued: 0,
      skipped: 0
    }, replayTriggeredJob, "positive", controlProof.nonce);
    const sendsAfterReplay = await questionnaireSendCount(context);
    if (sendsAfterReplay !== sendsBefore + 1) throw new CanaryError("canary_replay_send_delta");

    await cleanupCanaryFixtures(context, ids);
    targetCreated = false;
    scheduleCreated = false;
    await cleanupCanaryControl(context, "positive", controlProof.nonce);
    controlCreated = false;
    const postflight = runLivePreflight({ requireIndexReady: true });
    if (postflight.schedules.activeDue !== 0) throw new CanaryError("canary_postflight_active_due");
    if (!canaryGhlEffectVerified(send, tagCleanup, {
      expectedTag: LEGACY_GHL_TAG,
      expectedContactId: contact.id
    })) {
      throw new CanaryError("positive_canary_target_tag_not_observed");
    }

    return {
      ok: true,
      check: "questionnaire_scheduler_canary",
      mode: "execute-positive",
      projectId: PROJECT_ID,
      releaseCommit: context.releaseCommit,
      schedulerJob: schedulerJobSummary(triggeredJob),
      firstRun: { dueSchedules: 1, queued: 1, skipped: 0 },
      replayRun: { dueSchedules: 0, queued: 0, skipped: 0 },
      sendDelta: 1,
      deterministicSendVerified: true,
      externalEffectClaimVerified: true,
      expectedSyntheticContactVerified: true,
      ghlAddApiAccepted: tagCleanup.addApiAccepted,
      ghlAddReceiptVerified: true,
      targetTagObserved: tagCleanup.tagObserved,
      targetTagEffectVerified: true,
      targetTagFinalAbsenceVerified: true,
      targetTagRemovedBy: tagCleanup.removedBy,
      canaryControlVerified: true,
      syntheticFixturesRemoved: true,
      syntheticControlRemoved: true,
      writes: {
        syncRuns: 2,
        questionnaireSends: 1,
        syntheticTargetsRemoved: 1,
        syntheticSchedulesRemoved: 1,
        syntheticControlsRemoved: 1
      }
    };
  } catch (error) {
    if (scheduleCreated) {
      try {
        await pauseCanaryScheduleIfOwned(context, ids);
      } catch (_) {
        throw new CanaryError("canary_failure_and_pause_failed");
      }
    } else if (targetCreated) {
      try {
        const document = await getDocument(
          context,
          "questionnaireCanaryTargets",
          ids.targetId
        );
        const value = decodeFirestoreDocument(document);
        if (!safeSyntheticFixture(value, context.releaseCommit)) {
          throw new CanaryError("canary_target_cleanup_target_mismatch");
        }
        await deleteDocument(
          context,
          "questionnaireCanaryTargets",
          ids.targetId,
          document.updateTime
        );
      } catch (_) {
        throw new CanaryError("canary_failure_and_cleanup_failed");
      }
    }
    if (controlCreated) {
      // The short-lived control intentionally remains armed on uncertainty.
      // It expires before the protected Scheduler window and prevents a
      // partially observed canary from processing real schedules.
    }
    throw error;
  }
}

function torontoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EXPECTED_JOB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
