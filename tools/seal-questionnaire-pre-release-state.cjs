#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const lib = require("./questionnaire-pre-release-state-lib.cjs");
const {
  isQuestionnaireScheduleIndex,
  listQuestionnaireScheduleIndexes,
  summarizeQuestionnaireScheduleIndexes
} = require("./questionnaire-stage-a-preflight-lib.cjs");

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      check: "questionnaire_pre_release_state",
      error: lib.safeError(error)
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = lib.parseSealArgs(process.argv.slice(2));
  verifySealedCandidate(options.releaseCommit);
  if (options.mode === "verify-receipt") {
    const receipt = lib.readReceipt(options.releaseCommit);
    lib.validateReceipt(receipt, {
      releaseCommit: options.releaseCommit,
      planHash: options.planHash
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      check: "questionnaire_pre_release_state",
      mode: options.mode,
      projectId: lib.PROJECT_ID,
      releaseCommit: options.releaseCommit,
      planHash: receipt.planHash,
      snapshotHash: receipt.snapshotHash,
      receiptFile: path.basename(lib.receiptPath(options.releaseCommit)),
      localReceipt: true,
      liveStateCompared: false,
      externalReads: 0,
      externalWrites: 0
    }, null, 2)}\n`);
    return;
  }
  const accessToken = await firebaseAccessToken();
  if (options.mode === "verify-index-ready") {
    const receipt = lib.readReceipt(options.releaseCommit);
    lib.validateReceipt(receipt, {
      releaseCommit: options.releaseCommit,
      planHash: options.planHash
    });
    const schedulerIndex = await readSchedulerIndex(accessToken);
    if (
      lib.stableJson(receipt.state.schedulerIndex)
      !== lib.stableJson(schedulerIndex)
    ) {
      throw new Error("pre_release_scheduler_index_changed");
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      check: "questionnaire_pre_release_state",
      mode: options.mode,
      projectId: lib.PROJECT_ID,
      releaseCommit: options.releaseCommit,
      planHash: receipt.planHash,
      snapshotHash: receipt.snapshotHash,
      receiptFile: path.basename(lib.receiptPath(options.releaseCommit)),
      localReceipt: true,
      scheduleIndexReady: true,
      scheduleIndexMatchesPreRelease: true,
      scheduleIndexDeployRequired: false,
      externalWrites: 0
    }, null, 2)}\n`);
    return;
  }
  const state = await readLiveState(accessToken);
  const candidateReceipt = lib.buildReceipt({
    releaseCommit: options.releaseCommit,
    recordedAt: new Date().toISOString(),
    state
  });

  let receipt = candidateReceipt;
  let localReceipt = false;
  let target = lib.receiptPath(options.releaseCommit);
  if (options.mode === "record") {
    if (candidateReceipt.planHash !== options.planHash) {
      throw new Error("pre_release_receipt_plan_hash_mismatch");
    }
    target = lib.writeReceipt(candidateReceipt);
    localReceipt = true;
  } else if (options.mode === "verify") {
    receipt = lib.readReceipt(options.releaseCommit);
    lib.validateReceipt(receipt, {
      releaseCommit: options.releaseCommit,
      planHash: options.planHash
    });
    if (lib.stableJson(receipt.state) !== lib.stableJson(state)) {
      throw new Error("pre_release_live_state_changed");
    }
    localReceipt = true;
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    check: "questionnaire_pre_release_state",
    mode: options.mode,
    projectId: lib.PROJECT_ID,
    releaseCommit: options.releaseCommit,
    planHash: receipt.planHash,
    snapshotHash: receipt.snapshotHash,
    receiptFile: path.basename(target),
    localReceipt,
    hostingVersionSealed: true,
    firestoreRulesetSealed: true,
    a2FunctionRevisionsSealed: lib.A2_FUNCTION_IDS.length,
    a3FunctionRevisionsSealed: lib.A3_FUNCTION_IDS.length,
    a3AdditiveFunctionAbsent: true,
    a3AdditiveSchedulerJobAbsent: true,
    scheduleIndexReady: true,
    scheduleIndexDeployRequired: false,
    externalWrites: 0
  }, null, 2)}\n`);
}

function verifySealedCandidate(releaseCommit) {
  const verifier = path.join(
    process.cwd(),
    "tools",
    "verify-sealed-questionnaire-release-worktree.cjs"
  );
  const result = spawnSync(process.execPath, [verifier, releaseCommit], {
    cwd: process.cwd(),
    env: sanitizedChildEnv(),
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 300_000,
    windowsHide: true
  });
  if (result.status !== 0) throw new Error("sealed_candidate_invalid");
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

function firebaseToolsRoot() {
  const profile = process.env.USERPROFILE || "";
  const candidates = [
    process.env.CFSB_FIREBASE_TOOLS_ROOT,
    path.join(
      profile,
      ".cache",
      "cfsb-dashboard-tools",
      "firebase-tools-clean",
      "node_modules",
      "firebase-tools"
    )
  ].filter(Boolean);
  const root = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "lib", "auth.js"))
    && fs.existsSync(path.join(candidate, "lib", "apiv2.js"))
  );
  if (!root) throw new Error("firebase_tools_unavailable");
  return root;
}

async function firebaseAccessToken() {
  const root = firebaseToolsRoot();
  const auth = require(path.join(root, "lib", "auth.js"));
  const api = require(path.join(root, "lib", "apiv2.js"));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("firebase_auth_unavailable");
  auth.setRefreshToken(account.tokens.refresh_token);
  try {
    const token = await api.getAccessToken();
    if (!token) throw new Error("firebase_auth_unavailable");
    return token;
  } catch (_) {
    throw new Error("firebase_auth_unavailable");
  }
}

async function boundedJson(
  url,
  accessToken,
  { allowNotFound = false } = {}
) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("response_too_large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new Error("response_too_large");
  }
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) throw new Error(`http_${response.status}`);
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error("response_invalid");
  }
}

function hostingResourceUrl(resourceName) {
  const normalized = lib.normalizeResourceName(resourceName);
  if (!normalized.startsWith(`sites/${lib.SITE_ID}/`)) {
    throw new Error("live_hosting_state_invalid");
  }
  return `https://firebasehosting.googleapis.com/v1beta1/${normalized}`;
}

async function readHosting(accessToken) {
  const channel = await boundedJson(
    "https://firebasehosting.googleapis.com/v1beta1/projects/-/sites/"
      + `${lib.SITE_ID}/channels/${lib.LIVE_CHANNEL_ID}`,
    accessToken
  );
  const versionName = channel?.release?.version?.name;
  const version = await boundedJson(
    hostingResourceUrl(versionName),
    accessToken
  );
  return lib.sanitizeHosting(channel, version);
}

async function readRules(accessToken) {
  const release = await boundedJson(
    `https://firebaserules.googleapis.com/v1/${lib.FIRESTORE_RELEASE_NAME}`,
    accessToken
  );
  const rulesetName = String(release?.rulesetName || "");
  if (!rulesetName.startsWith(`projects/${lib.PROJECT_ID}/rulesets/`)) {
    throw new Error("live_firestore_rules_state_invalid");
  }
  const ruleset = await boundedJson(
    `https://firebaserules.googleapis.com/v1/${rulesetName}`,
    accessToken
  );
  return lib.sanitizeRules(release, ruleset);
}

async function readFunction(entry, accessToken) {
  const functionName =
    `projects/${lib.PROJECT_ID}/locations/${lib.REGION}/functions/`
      + entry.functionId;
  const functionValue = await boundedJson(
    `https://cloudfunctions.googleapis.com/v2/${functionName}`,
    accessToken
  );
  const service = String(functionValue?.serviceConfig?.service || "");
  if (!/^projects\/[^/]+\/locations\/[^/]+\/services\/[^/]+$/.test(service)) {
    throw new Error("live_function_revision_invalid");
  }
  const cloudRunService = await boundedJson(
    `https://run.googleapis.com/v2/${service}`,
    accessToken
  );
  const revision = String(functionValue?.serviceConfig?.revision || "");
  const cloudRunRevision = await boundedJson(
    `https://run.googleapis.com/v2/${service}/revisions/${revision}`,
    accessToken
  );
  return lib.sanitizeFunction(
    functionValue,
    cloudRunService,
    cloudRunRevision,
    entry
  );
}

async function readSchedulerIndex(accessToken) {
  const result = await listQuestionnaireScheduleIndexes({
    accessToken,
    projectId: lib.PROJECT_ID,
    collectionId: "questionnaireSchedules"
  });
  return lib.sanitizeSchedulerIndex(result.indexes, {
    isQuestionnaireScheduleIndex,
    summarizeQuestionnaireScheduleIndexes
  });
}

async function readA3AdditiveAbsence(accessToken) {
  const [functionValue, schedulerJob] = await Promise.all([
    boundedJson(
      "https://cloudfunctions.googleapis.com/v2/"
        + lib.A3_ADDITIVE_FUNCTION_NAME,
      accessToken,
      { allowNotFound: true }
    ),
    boundedJson(
      "https://cloudscheduler.googleapis.com/v1/"
        + lib.A3_ADDITIVE_SCHEDULER_JOB_NAME,
      accessToken,
      { allowNotFound: true }
    )
  ]);
  return lib.sealA3AdditiveAbsence({
    functionAbsent: functionValue === null,
    schedulerJobAbsent: schedulerJob === null
  });
}

async function readLiveState(accessToken) {
  const [
    hosting,
    firestoreRules,
    functions,
    schedulerIndex,
    a3AdditiveAbsence
  ] =
    await Promise.all([
      readHosting(accessToken),
      readRules(accessToken),
      Promise.all(
        lib.SNAPSHOT_FUNCTIONS.map((entry) =>
          readFunction(entry, accessToken)
        )
      ),
      readSchedulerIndex(accessToken),
      readA3AdditiveAbsence(accessToken)
    ]);
  return lib.buildState({
    hosting,
    firestoreRules,
    functions,
    schedulerIndex,
    a3AdditiveAbsence
  });
}

module.exports = {
  boundedJson,
  firebaseAccessToken,
  readFunction,
  readA3AdditiveAbsence,
  readHosting,
  readLiveState,
  readRules,
  readSchedulerIndex,
  verifySealedCandidate
};
