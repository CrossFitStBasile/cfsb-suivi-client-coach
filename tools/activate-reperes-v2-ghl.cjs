#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const release = require("./reperes-v2-release-lib.cjs");
const activation = require("./reperes-v2-ghl-activation-lib.cjs");

const ROOT = path.resolve(__dirname, "..");
const FIRESTORE_ROOT =
  `https://firestore.googleapis.com/v1/projects/${release.PROJECT_ID}`
  + `/databases/${encodeURIComponent(release.DATABASE_ID)}/documents`;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "cfsb-reperes-v2-ghl-sealed-activation/1";

main().catch((error) => {
  printResult({
    ok: false,
    check: "reperes_v2_ghl_sealed_activation",
    error: activation.safeErrorCode(error),
    secretsPrinted: false,
    piiPrinted: false
  });
  process.exitCode = 1;
});

async function main() {
  const options = activation.parseArgs(process.argv.slice(2));
  const candidate = release.buildCandidate();
  verifyReleaseCommitAvailable(options.releaseCommit);
  const accessToken = await firebaseAccessToken();
  const stateBefore = await readState(accessToken, candidate);

  if (options.mode === "preview") {
    activation.validateInitialState(stateBefore, candidate, options);
    const plan = activation.buildActivationPlan(
      stateBefore,
      candidate,
      options
    );
    const counts = planOperationCounts(plan);
    printResult({
      ok: true,
      check: "reperes_v2_ghl_sealed_activation",
      mode: "preview",
      readOnly: true,
      projectId: release.PROJECT_ID,
      formId: release.FORM_ID,
      releaseCommit: activation.RELEASE_COMMIT,
      releaseVersion: activation.RELEASE_VERSION,
      versionId: release.V2_VERSION_ID,
      versionHash: candidate.definition.versionHash,
      ghlTag: candidate.definition.ghlTag,
      publicUrl: candidate.publicUrl,
      deliveryReadyBefore: false,
      deliveryReadyAfter: true,
      deliveryAuditId: activation.DELIVERY_AUDIT_ID,
      actorUid: activation.SYSTEM_ACTOR_UID,
      planHash: plan.planHash,
      plannedAtomicOperations: counts.operations,
      plannedDocumentMutations: counts.mutations,
      plannedAtomicGuards: counts.guards,
      next:
        "Bind CFSB_REPERES_V2_GHL_ACTIVATION_GO and "
        + "CFSB_REPERES_V2_GHL_ACTIVATION_PLAN_HASH, then run --execute.",
      externalWrites: 0,
      secretsPrinted: false,
      piiPrinted: false
    });
    return;
  }

  if (options.mode === "execute") {
    activation.validateInitialState(stateBefore, candidate, options);
    const plan = activation.buildActivationPlan(
      stateBefore,
      candidate,
      options
    );
    activation.verifyExecutionAuthority(options, plan.planHash);
    const commit = await commitWrites(accessToken, plan.writes);
    const stateAfter = await readState(accessToken, candidate);
    const verified = activation.validateActivatedState(
      stateAfter,
      candidate,
      options
    );
    const unchanged = activation.validateTransitionUnchanged(
      stateBefore,
      stateAfter,
      candidate
    );
    const counts = planOperationCounts(plan);
    printResult({
      ok: true,
      check: "reperes_v2_ghl_sealed_activation",
      mode: "execute",
      projectId: release.PROJECT_ID,
      formId: release.FORM_ID,
      releaseCommit: activation.RELEASE_COMMIT,
      releaseVersion: activation.RELEASE_VERSION,
      versionId: verified.versionId,
      versionHash: verified.versionHash,
      ghlTag: verified.ghlTag,
      publicUrl: verified.publicUrl,
      deliveryReady: true,
      deliveryAuditId: verified.deliveryAuditId,
      actorUid: verified.actorUid,
      activatedAt: verified.activatedAt,
      planHash: plan.planHash,
      atomicOperationsConfirmed: commit.operationsConfirmed,
      documentMutationsConfirmed: counts.mutations,
      atomicGuardsConfirmed: counts.guards,
      unchangedDocumentsConfirmed: unchanged.unchangedDocuments,
      atomicCommit: true,
      secretsPrinted: false,
      piiPrinted: false
    });
    return;
  }

  if (options.mode === "verify") {
    const verified = activation.validateActivatedState(
      stateBefore,
      candidate,
      options
    );
    printResult({
      ok: true,
      check: "reperes_v2_ghl_sealed_activation",
      mode: "verify",
      readOnly: true,
      projectId: release.PROJECT_ID,
      formId: release.FORM_ID,
      releaseCommit: activation.RELEASE_COMMIT,
      releaseVersion: activation.RELEASE_VERSION,
      versionId: verified.versionId,
      versionHash: verified.versionHash,
      ghlTag: verified.ghlTag,
      publicUrl: verified.publicUrl,
      deliveryReady: true,
      deliveryAuditId: verified.deliveryAuditId,
      actorUid: verified.actorUid,
      activatedAt: verified.activatedAt,
      externalWrites: 0,
      secretsPrinted: false,
      piiPrinted: false
    });
    return;
  }

  throw new release.ReperesV2ReleaseError("mode_unknown");
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

function gitResult(args) {
  return spawnSync("git", args, {
    cwd: ROOT,
    env: sanitizedChildEnv(),
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true
  });
}

function verifyReleaseCommitAvailable(releaseCommit) {
  if (releaseCommit !== activation.RELEASE_COMMIT) {
    throw new release.ReperesV2ReleaseError("release_commit_mismatch");
  }
  const commit = gitResult(["cat-file", "-e", `${releaseCommit}^{commit}`]);
  const ancestor = gitResult([
    "merge-base",
    "--is-ancestor",
    releaseCommit,
    "HEAD"
  ]);
  const app = gitResult([
    "show",
    `${releaseCommit}:firebase-dashboard/public/app.js`
  ]);
  const candidateLib = gitResult([
    "show",
    `${releaseCommit}:tools/reperes-v2-release-lib.cjs`
  ]);
  if (
    commit.status !== 0
    || ancestor.status !== 0
    || app.status !== 0
    || candidateLib.status !== 0
    || !String(app.stdout).includes(
      `const APP_VERSION = "${activation.RELEASE_VERSION}";`
    )
    || !String(candidateLib.stdout).includes(
      `const EXPECTED_V2_HASH = "${release.EXPECTED_V2_HASH}";`
    )
  ) {
    throw new release.ReperesV2ReleaseError(
      "release_commit_contents_mismatch"
    );
  }
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
  if (!root) {
    throw new release.ReperesV2ReleaseError("firebase_tools_unavailable");
  }
  return root;
}

async function firebaseAccessToken() {
  const root = firebaseToolsRoot();
  const auth = require(path.join(root, "lib", "auth.js"));
  const api = require(path.join(root, "lib", "apiv2.js"));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new release.ReperesV2ReleaseError("firebase_auth_unavailable");
  }
  auth.setRefreshToken(account.tokens.refresh_token);
  try {
    const accessToken = await api.getAccessToken();
    if (typeof accessToken !== "string" || !accessToken) {
      throw new release.ReperesV2ReleaseError(
        "firebase_auth_unavailable"
      );
    }
    return accessToken;
  } catch (_error) {
    throw new release.ReperesV2ReleaseError("firebase_auth_unavailable");
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
    throw new release.ReperesV2ReleaseError("request_failed");
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new release.ReperesV2ReleaseError("response_too_large");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new release.ReperesV2ReleaseError("response_too_large");
  }
  if (!allowedStatuses.includes(response.status)) {
    throw new release.ReperesV2ReleaseError(
      `http_status_${response.status}`
    );
  }
  if (!text) return { status: response.status, payload: {} };
  if (
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") || ""
    )
  ) {
    throw new release.ReperesV2ReleaseError(
      "response_content_type_invalid"
    );
  }
  try {
    return { status: response.status, payload: JSON.parse(text) };
  } catch (_error) {
    throw new release.ReperesV2ReleaseError("response_json_invalid");
  }
}

function documentUrl(documentName) {
  const prefix =
    `projects/${release.PROJECT_ID}/databases/${release.DATABASE_ID}/documents/`;
  if (!documentName.startsWith(prefix)) {
    throw new release.ReperesV2ReleaseError("document_name_invalid");
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
    throw new release.ReperesV2ReleaseError(
      "firestore_document_invalid"
    );
  }
  return Object.freeze({
    name: payload.name,
    createTime: String(payload.createTime || ""),
    updateTime: String(payload.updateTime),
    value: release.decodeFirestoreFields(payload.fields)
  });
}

async function readState(accessToken, candidate) {
  const names = activation.documentNames(candidate);
  const keys = [
    "form",
    "catalog",
    "slug",
    "v1",
    "v2",
    "tag",
    "publishAudit",
    "rollbackAudit",
    "deliveryAudit"
  ];
  const optional = new Set(["rollbackAudit", "deliveryAudit"]);
  const entries = await Promise.all(
    keys.map((key) =>
      readDocument(
        accessToken,
        names[key],
        { allowNotFound: optional.has(key) }
      )
    )
  );
  return Object.freeze(Object.fromEntries(
    keys.map((key, index) => [key, entries[index]])
  ));
}

async function commitWrites(accessToken, writes) {
  activation.validateRestWritePlan(writes);
  const result = await requestJson(`${FIRESTORE_ROOT}:commit`, {
    accessToken,
    method: "POST",
    body: { writes }
  });
  return release.validateCommitWriteResults(
    result.payload,
    writes.length
  );
}

function planOperationCounts(plan) {
  const writes = plan?.writes;
  const operations = Array.isArray(writes) ? writes.length : 0;
  const intended = new Set(plan?.intendedMutationDocuments || []);
  const guarded = new Set(plan?.guardedDocuments || []);
  let mutations = 0;
  let guards = 0;
  for (const write of writes || []) {
    const name = write?.update?.name || write?.delete || "";
    if (intended.has(name)) mutations += 1;
    else if (guarded.has(name)) guards += 1;
  }
  if (
    operations !== 9
    || operations !== mutations + guards
    || mutations !== 3
    || guards !== 6
  ) {
    throw new release.ReperesV2ReleaseError(
      "atomic_plan_operation_shape_invalid"
    );
  }
  return Object.freeze({ operations, mutations, guards });
}
