#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  DATABASE_ID,
  PROJECT_ID,
  QuestionnaireReleaseAnnouncementError,
  buildMaintenancePlan,
  buildResumePlan,
  decodeFirestoreFields,
  documentNames,
  parseArgs,
  releaseIds,
  safeErrorCode,
  validateMaintenanceState,
  validateResumeState,
  verifyExecutionAuthority
} = require("./questionnaire-release-announcement-lib.cjs");

const ROOT = path.resolve(__dirname, "..");
const FIRESTORE_ROOT =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}`
  + `/databases/${encodeURIComponent(DATABASE_ID)}/documents`;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 512 * 1024;
const USER_AGENT = "cfsb-questionnaire-release-announcements/1";

main().catch((error) => {
  printResult({
    ok: false,
    check: "questionnaire_release_announcements",
    error: safeErrorCode(error),
    secretsPrinted: false,
    piiPrinted: false,
    rawDocumentsPrinted: false
  });
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  verifySealedCandidate(options.releaseCommit);
  const accessToken = await firebaseAccessToken();
  const stateBefore = await readState(accessToken, options.releaseCommit);
  const ids = releaseIds(options.releaseCommit);

  if (options.mode === "maintenance-preview") {
    const plan = buildMaintenancePlan(stateBefore, options.releaseCommit);
    printResult({
      ok: true,
      check: "questionnaire_release_announcements",
      mode: options.mode,
      readOnly: true,
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      announcementIds: ids,
      planHash: plan.planHash,
      observedDocuments: plan.observed.length,
      plannedAtomicWrites: plan.writes.length,
      next:
        "Bind CFSB_QUESTIONNAIRE_MAINTENANCE_GO and "
        + "CFSB_QUESTIONNAIRE_MAINTENANCE_PLAN_HASH, then run "
        + "--maintenance-execute.",
      externalWrites: 0,
      secretsPrinted: false,
      piiPrinted: false,
      rawDocumentsPrinted: false
    });
    return;
  }

  if (options.mode === "maintenance-execute") {
    const plan = buildMaintenancePlan(stateBefore, options.releaseCommit);
    verifyExecutionAuthority(options, plan.planHash);
    const commit = await commitWrites(accessToken, plan.writes);
    const stateAfter = await readState(accessToken, options.releaseCommit);
    validateMaintenanceState(stateAfter, options.releaseCommit);
    printResult({
      ok: true,
      check: "questionnaire_release_announcements",
      mode: options.mode,
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      announcementIds: ids,
      planHash: plan.planHash,
      atomicWritesConfirmed: commit.writeResults,
      atomicCommit: true,
      maintenancePublished: true,
      resumePublished: false,
      secretsPrinted: false,
      piiPrinted: false,
      rawDocumentsPrinted: false
    });
    return;
  }

  if (options.mode === "maintenance-verify") {
    validateMaintenanceState(stateBefore, options.releaseCommit);
    printResult({
      ok: true,
      check: "questionnaire_release_announcements",
      mode: options.mode,
      readOnly: true,
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      announcementIds: ids,
      maintenancePublished: true,
      resumePublished: false,
      externalWrites: 0,
      secretsPrinted: false,
      piiPrinted: false,
      rawDocumentsPrinted: false
    });
    return;
  }

  if (options.mode === "resume-preview") {
    const plan = buildResumePlan(stateBefore, options.releaseCommit);
    printResult({
      ok: true,
      check: "questionnaire_release_announcements",
      mode: options.mode,
      readOnly: true,
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      announcementIds: ids,
      planHash: plan.planHash,
      observedDocuments: plan.observed.length,
      plannedAtomicWrites: plan.writes.length,
      livePassProofRequired:
        "CFSB_QUESTIONNAIRE_LIVE_PASS_SHA must equal releaseCommit.",
      next:
        "Bind CFSB_QUESTIONNAIRE_RESUME_GO, "
        + "CFSB_QUESTIONNAIRE_RESUME_PLAN_HASH and "
        + "CFSB_QUESTIONNAIRE_LIVE_PASS_SHA, then run --resume-execute.",
      externalWrites: 0,
      secretsPrinted: false,
      piiPrinted: false,
      rawDocumentsPrinted: false
    });
    return;
  }

  if (options.mode === "resume-execute") {
    const plan = buildResumePlan(stateBefore, options.releaseCommit);
    verifyExecutionAuthority(options, plan.planHash);
    const commit = await commitWrites(accessToken, plan.writes);
    const stateAfter = await readState(accessToken, options.releaseCommit);
    validateResumeState(stateAfter, options.releaseCommit);
    printResult({
      ok: true,
      check: "questionnaire_release_announcements",
      mode: options.mode,
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      announcementIds: ids,
      planHash: plan.planHash,
      atomicWritesConfirmed: commit.writeResults,
      atomicCommit: true,
      maintenanceArchived: true,
      resumePublished: true,
      livePassReleaseCommit: options.releaseCommit,
      secretsPrinted: false,
      piiPrinted: false,
      rawDocumentsPrinted: false
    });
    return;
  }

  if (options.mode === "resume-verify") {
    validateResumeState(stateBefore, options.releaseCommit);
    printResult({
      ok: true,
      check: "questionnaire_release_announcements",
      mode: options.mode,
      readOnly: true,
      projectId: PROJECT_ID,
      releaseCommit: options.releaseCommit,
      announcementIds: ids,
      maintenanceArchived: true,
      resumePublished: true,
      livePassReleaseCommit: options.releaseCommit,
      externalWrites: 0,
      secretsPrinted: false,
      piiPrinted: false,
      rawDocumentsPrinted: false
    });
    return;
  }

  throw releaseError("mode_unknown");
}

function releaseError(code) {
  return new QuestionnaireReleaseAnnouncementError(code);
}

function printResult(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function sanitizedChildEnv() {
  const next = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/token|secret|credential|password|private[_-]?key/i.test(key)) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

function verifySealedCandidate(releaseCommit) {
  const verifier = path.join(
    ROOT,
    "tools",
    "verify-sealed-questionnaire-release-worktree.cjs"
  );
  if (!fs.existsSync(verifier)) throw releaseError("sealed_verifier_missing");
  const result = spawnSync(process.execPath, [verifier, releaseCommit], {
    cwd: ROOT,
    env: sanitizedChildEnv(),
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 300_000,
    windowsHide: true
  });
  if (result.status !== 0) throw releaseError("sealed_candidate_invalid");
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
  if (!root) throw releaseError("firebase_tools_unavailable");
  return root;
}

async function firebaseAccessToken() {
  const root = firebaseToolsRoot();
  const auth = require(path.join(root, "lib", "auth.js"));
  const api = require(path.join(root, "lib", "apiv2.js"));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw releaseError("firebase_auth_unavailable");
  }
  auth.setRefreshToken(account.tokens.refresh_token);
  try {
    const accessToken = await api.getAccessToken();
    if (typeof accessToken !== "string" || !accessToken) {
      throw releaseError("firebase_auth_unavailable");
    }
    return accessToken;
  } catch (_error) {
    throw releaseError("firebase_auth_unavailable");
  }
}

async function requestJson(url, {
  accessToken,
  method = "GET",
  body,
  allowedStatuses = [200]
}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      redirect: "error",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": USER_AGENT
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (_error) {
    throw releaseError("request_failed");
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw releaseError("response_too_large");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw releaseError("response_too_large");
  }
  if (!allowedStatuses.includes(response.status)) {
    throw releaseError(`http_status_${response.status}`);
  }
  if (!text) return { status: response.status, payload: {} };
  if (!/^application\/json(?:;|$)/i.test(
    response.headers.get("content-type") || ""
  )) {
    throw releaseError("response_content_type_invalid");
  }
  try {
    return { status: response.status, payload: JSON.parse(text) };
  } catch (_error) {
    throw releaseError("response_json_invalid");
  }
}

function documentUrl(documentName) {
  const prefix =
    `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/`;
  if (!documentName.startsWith(prefix)) {
    throw releaseError("document_name_invalid");
  }
  const relative = documentName.slice(prefix.length);
  return `${FIRESTORE_ROOT}/${
    relative.split("/").map(encodeURIComponent).join("/")
  }`;
}

async function readDocument(
  accessToken,
  documentName,
  { allowNotFound = false } = {}
) {
  const result = await requestJson(documentUrl(documentName), {
    accessToken,
    allowedStatuses: allowNotFound ? [200, 404] : [200]
  });
  if (result.status === 404) return null;
  const payload = result.payload;
  if (
    payload?.name !== documentName
    || !payload.fields
    || typeof payload.fields !== "object"
    || !Number.isFinite(new Date(String(payload.updateTime || "")).getTime())
  ) {
    throw releaseError("firestore_document_invalid");
  }
  return Object.freeze({
    name: payload.name,
    createTime: String(payload.createTime || ""),
    updateTime: String(payload.updateTime),
    value: decodeFirestoreFields(payload.fields)
  });
}

async function readState(accessToken, releaseCommit) {
  const names = documentNames(releaseCommit);
  const [control, maintenance, resume] = await Promise.all([
    readDocument(accessToken, names.control, { allowNotFound: true }),
    readDocument(accessToken, names.maintenance, { allowNotFound: true }),
    readDocument(accessToken, names.resume, { allowNotFound: true })
  ]);
  return Object.freeze({ control, maintenance, resume });
}

async function commitWrites(accessToken, writes) {
  const result = await requestJson(`${FIRESTORE_ROOT}:commit`, {
    accessToken,
    method: "POST",
    body: { writes }
  });
  const writeResults = result.payload?.writeResults;
  if (
    !Array.isArray(writeResults)
    || writeResults.length !== writes.length
    || !Number.isFinite(
      new Date(String(result.payload?.commitTime || "")).getTime()
    )
  ) {
    throw releaseError("atomic_commit_confirmation_invalid");
  }
  return Object.freeze({ writeResults: writeResults.length });
}
