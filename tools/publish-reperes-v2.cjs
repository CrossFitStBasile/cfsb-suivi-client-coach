#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  DATABASE_ID,
  EXPECTED_V1_HASH,
  FORM_ID,
  PROJECT_ID,
  RELEASE_VERSION,
  ReperesV2ReleaseError,
  V2_PUBLISHED_AT,
  buildCandidate,
  buildPublicationPlan,
  buildRollbackPlan,
  decodeFirestoreFields,
  documentNames,
  parseArgs,
  planOperationCounts,
  safeErrorCode,
  validateCommitWriteResults,
  validatePostState,
  validatePreState,
  validateRollbackSourceState,
  validateRollbackState,
  validateRestWritePlan,
  verifyExecutionAuthority
} = require("./reperes-v2-release-lib.cjs");

const ROOT = path.resolve(__dirname, "..");
const FIRESTORE_ROOT =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}`
  + `/databases/${encodeURIComponent(DATABASE_ID)}/documents`;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "cfsb-reperes-v2-sealed-release/1";

if (require.main === module) {
  main().catch((error) => {
    printResult({
      ok: false,
      check: "reperes_v2_sealed_release",
      error: safeErrorCode(error),
      secretsPrinted: false,
      piiPrinted: false
    });
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidate = buildCandidate();
  const tooling = verifyToolingContext({
    releaseCommit: options.releaseCommit
  });
  const accessToken = await firebaseAccessToken();
  const stateBefore = await readState(accessToken, candidate);

  if (options.mode === "preview") {
    validatePreState(stateBefore, candidate);
    const plan = buildPublicationPlan(stateBefore, candidate, {
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit
    });
    const counts = planOperationCounts(plan);
    printResult({
      ok: true,
      check: "reperes_v2_sealed_release",
      mode: "preview",
      readOnly: true,
      projectId: PROJECT_ID,
      formId: FORM_ID,
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit,
      expectedV1Hash: EXPECTED_V1_HASH,
      candidateV2Hash: candidate.definition.versionHash,
      candidatePublishedAt: V2_PUBLISHED_AT,
      planHash: plan.planHash,
      plannedAtomicOperations: counts.operations,
      plannedDocumentMutations: counts.mutations,
      plannedAtomicGuards: counts.guards,
      deliveryReadyAfter: false,
      v1MutationWrites: 0,
      v1GuardedByNoOpWrite: true,
      rollbackAuditAbsenceGuarded: true,
      rollbackPrepared: true,
      next: "Bind CFSB_REPERES_V2_RELEASE_GO and CFSB_REPERES_V2_PLAN_HASH, then run --execute.",
      externalWrites: 0,
      secretsPrinted: false,
      piiPrinted: false
    });
    return;
  }

  if (options.mode === "execute") {
    validatePreState(stateBefore, candidate);
    const plan = buildPublicationPlan(stateBefore, candidate, {
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit
    });
    verifyExecutionAuthority(options, plan.planHash);
    const commit = await commitWrites(accessToken, plan.writes);
    const stateAfter = await readState(accessToken, candidate);
    validatePostState(stateAfter, candidate, {
      releaseCommit: options.releaseCommit
    });
    if (stateAfter.v1.updateTime !== stateBefore.v1.updateTime) {
      throw releaseError("v1_document_was_modified");
    }
    if (stateAfter.rollbackAudit !== null) {
      throw releaseError("rollback_audit_was_created_during_publication");
    }
    printResult({
      ok: true,
      check: "reperes_v2_sealed_release",
      mode: "execute",
      projectId: PROJECT_ID,
      formId: FORM_ID,
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit,
      expectedV1Hash: EXPECTED_V1_HASH,
      publishedV2Hash: candidate.definition.versionHash,
      publishedAt: candidate.definition.publishedAt,
      planHash: plan.planHash,
      atomicOperationsConfirmed: commit.operationsConfirmed,
      documentMutationsConfirmed: planOperationCounts(plan).mutations,
      atomicGuardsConfirmed: planOperationCounts(plan).guards,
      atomicCommit: true,
      v1Preserved: true,
      deliveryReady: false,
      rollbackPrepared: true,
      secretsPrinted: false,
      piiPrinted: false
    });
    return;
  }

  if (options.mode === "verify") {
    validatePostState(stateBefore, candidate, {
      releaseCommit: options.releaseCommit
    });
    printResult({
      ok: true,
      check: "reperes_v2_sealed_release",
      mode: "verify",
      readOnly: true,
      projectId: PROJECT_ID,
      formId: FORM_ID,
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit,
      expectedV1Hash: EXPECTED_V1_HASH,
      verifiedV2Hash: candidate.definition.versionHash,
      v1Preserved: true,
      deliveryReady: false,
      externalWrites: 0,
      secretsPrinted: false,
      piiPrinted: false
    });
    return;
  }

  if (options.mode === "rollback-preview") {
    validateRollbackSourceState(stateBefore, candidate, {
      releaseCommit: options.releaseCommit
    });
    const plan = buildRollbackPlan(stateBefore, candidate, {
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit
    });
    const counts = planOperationCounts(plan);
    printResult({
      ok: true,
      check: "reperes_v2_sealed_release",
      mode: "rollback-preview",
      readOnly: true,
      projectId: PROJECT_ID,
      formId: FORM_ID,
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit,
      rollbackPlanHash: plan.planHash,
      plannedAtomicOperations: counts.operations,
      plannedDocumentMutations: counts.mutations,
      plannedAtomicGuards: counts.guards,
      restoredVersion: "1",
      retainedVersion2Evidence: true,
      versionEvidenceGuardedByNoOpWrites: true,
      publicationAuditGuardedByNoOpWrite: true,
      deliveryReadyAfter: false,
      next: "Bind release GO, rollback GO and rollback plan hash, then run --rollback-execute.",
      externalWrites: 0,
      secretsPrinted: false,
      piiPrinted: false
    });
    return;
  }

  if (options.mode === "rollback-execute") {
    validateRollbackSourceState(stateBefore, candidate, {
      releaseCommit: options.releaseCommit
    });
    const plan = buildRollbackPlan(stateBefore, candidate, {
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit
    });
    verifyExecutionAuthority(options, plan.planHash);
    const commit = await commitWrites(accessToken, plan.writes);
    const stateAfter = await readState(accessToken, candidate);
    validateRollbackState(stateAfter, candidate, {
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit
    });
    if (stateAfter.v1.updateTime !== stateBefore.v1.updateTime) {
      throw releaseError("v1_document_was_modified");
    }
    if (stateAfter.v2.updateTime !== stateBefore.v2.updateTime) {
      throw releaseError("v2_evidence_was_modified");
    }
    if (
      stateAfter.publishAudit.updateTime
      !== stateBefore.publishAudit.updateTime
    ) {
      throw releaseError("publication_audit_was_modified");
    }
    printResult({
      ok: true,
      check: "reperes_v2_sealed_release",
      mode: "rollback-execute",
      projectId: PROJECT_ID,
      formId: FORM_ID,
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit,
      rollbackPlanHash: plan.planHash,
      atomicOperationsConfirmed: commit.operationsConfirmed,
      documentMutationsConfirmed: planOperationCounts(plan).mutations,
      atomicGuardsConfirmed: planOperationCounts(plan).guards,
      atomicCommit: true,
      activeVersion: "1",
      retainedVersion2Evidence: true,
      deliveryReady: false,
      secretsPrinted: false,
      piiPrinted: false
    });
    return;
  }

  if (options.mode === "rollback-verify") {
    validateRollbackState(stateBefore, candidate, {
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit
    });
    printResult({
      ok: true,
      check: "reperes_v2_sealed_release",
      mode: "rollback-verify",
      readOnly: true,
      projectId: PROJECT_ID,
      formId: FORM_ID,
      releaseCommit: options.releaseCommit,
      toolingCommit: tooling.toolingCommit,
      activeVersion: "1",
      retainedVersion2Evidence: true,
      deliveryReady: false,
      externalWrites: 0,
      secretsPrinted: false,
      piiPrinted: false
    });
    return;
  }

  throw releaseError("mode_unknown");
}

function releaseError(code) {
  return new ReperesV2ReleaseError(code);
}

function printResult(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function sanitizedChildEnv() {
  const next = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/token|secret|credential|password|private[_-]?key/i.test(key)) continue;
    next[key] = value;
  }
  return next;
}

function gitResult(args, rootDir, spawnImpl) {
  return spawnImpl("git", args, {
    cwd: rootDir,
    env: sanitizedChildEnv(),
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true
  });
}

function samePath(left, right) {
  if (!left || !right) return false;
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function verifyToolingContext({
  releaseCommit,
  rootDir = ROOT,
  spawnImpl = spawnSync
}) {
  const sealedReleaseCommit = String(releaseCommit || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sealedReleaseCommit)) {
    throw releaseError("release_commit_invalid");
  }
  const topLevel = gitResult(
    ["rev-parse", "--show-toplevel"],
    rootDir,
    spawnImpl
  );
  if (
    topLevel.status !== 0
    || !samePath(String(topLevel.stdout || "").trim(), rootDir)
  ) {
    throw releaseError("tooling_git_root_invalid");
  }
  const releaseExists = gitResult(
    ["cat-file", "-e", `${sealedReleaseCommit}^{commit}`],
    rootDir,
    spawnImpl
  );
  if (releaseExists.status !== 0) {
    throw releaseError("release_commit_unavailable");
  }
  const head = gitResult(
    ["rev-parse", "--verify", "HEAD^{commit}"],
    rootDir,
    spawnImpl
  );
  const toolingCommit = String(head.stdout || "").trim().toLowerCase();
  if (head.status !== 0 || !/^[a-f0-9]{40}$/.test(toolingCommit)) {
    throw releaseError("tooling_commit_unavailable");
  }
  const ancestor = gitResult(
    ["merge-base", "--is-ancestor", sealedReleaseCommit, toolingCommit],
    rootDir,
    spawnImpl
  );
  if (ancestor.status !== 0) {
    throw releaseError("release_commit_not_tooling_ancestor");
  }
  const status = gitResult(
    ["status", "--porcelain=v1", "--untracked-files=all"],
    rootDir,
    spawnImpl
  );
  if (status.status !== 0) {
    throw releaseError("tooling_worktree_status_unavailable");
  }
  if (String(status.stdout || "").trim()) {
    throw releaseError("tooling_worktree_not_clean");
  }
  const releaseApp = gitResult(
    ["show", `${sealedReleaseCommit}:firebase-dashboard/public/app.js`],
    rootDir,
    spawnImpl
  );
  const releaseLibrary = gitResult(
    ["show", `${sealedReleaseCommit}:tools/reperes-v2-release-lib.cjs`],
    rootDir,
    spawnImpl
  );
  if (
    releaseApp.status !== 0
    || releaseLibrary.status !== 0
    || !String(releaseApp.stdout || "").includes(
      `const APP_VERSION = "${RELEASE_VERSION}";`
    )
    || !String(releaseLibrary.stdout || "").includes(
      `const EXPECTED_V2_HASH = "${buildCandidate().definition.versionHash}";`
    )
  ) {
    throw releaseError("release_commit_contents_mismatch");
  }
  return Object.freeze({
    releaseCommit: sealedReleaseCommit,
    toolingCommit,
    worktreeClean: true,
    releaseIsAncestor: true
  });
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
  if (declaredLength > MAX_BODY_BYTES) throw releaseError("response_too_large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw releaseError("response_too_large");
  }
  if (!allowedStatuses.includes(response.status)) {
    throw releaseError(`http_status_${response.status}`);
  }
  if (!text) return { status: response.status, payload: {} };
  if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") || "")) {
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
  if (!documentName.startsWith(prefix)) throw releaseError("document_name_invalid");
  const relative = documentName.slice(prefix.length);
  return `${FIRESTORE_ROOT}/${relative.split("/").map(encodeURIComponent).join("/")}`;
}

async function readDocument(accessToken, documentName, { allowNotFound = false } = {}) {
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

async function readState(accessToken, candidate) {
  const names = documentNames(candidate);
  const entries = await Promise.all([
    readDocument(accessToken, names.form),
    readDocument(accessToken, names.catalog),
    readDocument(accessToken, names.slug),
    readDocument(accessToken, names.v1),
    readDocument(accessToken, names.v2, { allowNotFound: true }),
    readDocument(accessToken, names.tag),
    readDocument(accessToken, names.publishAudit, { allowNotFound: true }),
    readDocument(accessToken, names.rollbackAudit, { allowNotFound: true })
  ]);
  return Object.freeze(Object.fromEntries(
    Object.keys(names).map((key, index) => [key, entries[index]])
  ));
}

async function commitWrites(accessToken, writes) {
  validateRestWritePlan(writes);
  const result = await requestJson(`${FIRESTORE_ROOT}:commit`, {
    accessToken,
    method: "POST",
    body: { writes }
  });
  return validateCommitWriteResults(result.payload, writes.length);
}

module.exports = {
  samePath,
  verifyToolingContext
};
