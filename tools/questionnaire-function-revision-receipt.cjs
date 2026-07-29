"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const REGION = "us-central1";
const RECEIPT_VERSION = 2;
const FIREBASE_FUNCTIONS_HASH_LABEL = "firebase-functions-hash";
const FUNCTION_IDS = Object.freeze([
  "sendQuestionnaire",
  "processQuestionnaireSendRequest",
  "scheduledQuestionnaireSendRecovery",
  "scheduledQuestionnaireSendPlans",
  "syncDashboardFromSheets",
  "scheduledDashboardSync",
  "scheduledQuestionnaireResponseSync",
  "processSyncRequest"
]);
const EXPECTED_SECRET_KEYS = Object.freeze({
  sendQuestionnaire: Object.freeze([]),
  processQuestionnaireSendRequest: Object.freeze(["GHL_PRIVATE_TOKEN"]),
  scheduledQuestionnaireSendRecovery: Object.freeze(["GHL_PRIVATE_TOKEN"]),
  scheduledQuestionnaireSendPlans: Object.freeze([]),
  syncDashboardFromSheets: Object.freeze(["GHL_PRIVATE_TOKEN"]),
  scheduledDashboardSync: Object.freeze(["GHL_PRIVATE_TOKEN"]),
  scheduledQuestionnaireResponseSync: Object.freeze(["GHL_PRIVATE_TOKEN"]),
  processSyncRequest: Object.freeze(["GHL_PRIVATE_TOKEN"])
});
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_000_000;

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      check: "questionnaire_function_revision_receipt",
      error: safeError(error)
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  verifySealedCandidate(options.releaseCommit);
  const candidate = await buildCandidateContext(options.releaseCommit);
  const accessToken = await firebaseAccessToken();
  const live = await readLiveFunctionRevisions(accessToken, candidate);
  if (options.mode === "record") {
    writeReceipt(options.releaseCommit, candidate, live);
  } else if (options.mode === "verify") {
    verifyReceipt(options.releaseCommit, candidate, live);
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    check: "questionnaire_function_revision_receipt",
    mode: options.mode,
    projectId: PROJECT_ID,
    releaseCommit: options.releaseCommit,
    functionsVerified: FUNCTION_IDS.length,
    allTrafficOnLatestRevision: true,
    sourceProvenanceVerified: true,
    firebaseCandidateHashesVerified: FUNCTION_IDS.length,
    candidateSourceCommitHash: candidate.sourceCommitHash,
    localReceipt: options.mode === "preview" ? false : true,
    externalWrites: 0
  }, null, 2)}\n`);
}

function parseArgs(args) {
  let releaseCommit = "";
  let mode = "";
  for (const argument of args) {
    if (argument.startsWith("--release-commit=")) {
      if (releaseCommit) throw new Error("release_commit_repeated");
      releaseCommit = String(argument.slice("--release-commit=".length)).trim().toLowerCase();
      continue;
    }
    if (["--preview", "--record", "--verify"].includes(argument)) {
      if (mode) throw new Error("mode_repeated");
      mode = argument.slice(2);
      continue;
    }
    throw new Error("argument_unknown");
  }
  if (!/^[a-f0-9]{40}$/.test(releaseCommit)) throw new Error("release_commit_invalid");
  if (!["preview", "record", "verify"].includes(mode)) throw new Error("mode_missing");
  return { releaseCommit, mode };
}

function verifySealedCandidate(releaseCommit) {
  const verifier = path.join(process.cwd(), "tools", "verify-sealed-questionnaire-release-worktree.cjs");
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
    if (/token|secret|credential|password|private[_-]?key/i.test(key)) continue;
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

async function boundedJson(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("response_too_large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new Error("response_too_large");
  if (!response.ok) throw new Error(`http_${response.status}`);
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error("response_invalid");
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function stableHash(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalize(value || {})), "utf8")
    .digest("hex");
}

function sha1(value) {
  return crypto.createHash("sha1").update(String(value), "utf8").digest("hex");
}

function firebaseEnvironmentHash(environmentVariables = {}) {
  return sha1(JSON.stringify(environmentVariables || {}));
}

function firebaseSecretsHash(secretVersions = {}) {
  return sha1(JSON.stringify(secretVersions || {}));
}

function expectedFirebaseFunctionsHash({
  sourceHash,
  environmentVariables = {},
  secretVersions = {}
}) {
  if (!/^[a-f0-9]{40}(?:\.[a-f0-9]{40})?$/.test(String(sourceHash || ""))) {
    throw new Error("candidate_source_hash_invalid");
  }
  return sha1(
    `${sourceHash}`
    + firebaseEnvironmentHash(environmentVariables)
    + firebaseSecretsHash(secretVersions)
  );
}

function expectedSecretVersions(functionId, value) {
  const expectedKeys = EXPECTED_SECRET_KEYS[functionId];
  if (!expectedKeys) throw new Error("candidate_function_unknown");
  const liveSecrets = Array.isArray(value.serviceConfig?.secretEnvironmentVariables)
    ? value.serviceConfig.secretEnvironmentVariables
    : [];
  const byKey = new Map();
  for (const secret of liveSecrets) {
    const key = String(secret?.key || "");
    const name = String(secret?.secret || "");
    const version = String(secret?.version || "");
    if (
      !key
      || key !== name
      || !/^[1-9][0-9]*$/.test(version)
      || byKey.has(key)
    ) {
      throw new Error("live_function_secret_contract_invalid");
    }
    byKey.set(key, version);
  }
  if (
    byKey.size !== expectedKeys.length
    || expectedKeys.some((key) => !byKey.has(key))
  ) {
    throw new Error("live_function_secret_contract_invalid");
  }
  return Object.fromEntries(expectedKeys.map((key) => [key, byKey.get(key)]));
}

function buildLiveRevisionEntry(functionId, value, candidate) {
  const expectedName = `projects/${PROJECT_ID}/locations/${REGION}/functions/${functionId}`;
  const revision = String(value.serviceConfig?.revision || "");
  const updateTime = String(value.updateTime || "");
  const build = String(value.buildConfig?.build || "");
  const service = String(value.serviceConfig?.service || "");
  const firebaseFunctionsHash = String(
    value.labels?.[FIREBASE_FUNCTIONS_HASH_LABEL] || ""
  ).toLowerCase();
  const secretVersions = expectedSecretVersions(functionId, value);
  const expectedHash = expectedFirebaseFunctionsHash({
    sourceHash: candidate.sourceHash,
    environmentVariables: candidate.environmentVariables,
    secretVersions
  });
  if (
    value.name !== expectedName
    || value.state !== "ACTIVE"
    || value.environment !== "GEN_2"
    || value.serviceConfig?.allTrafficOnLatestRevision !== true
    || !revision
    || !revision.toLowerCase().startsWith(functionId.toLowerCase())
    || !Number.isFinite(new Date(updateTime).getTime())
    || !new RegExp(
      `^projects/(?:${PROJECT_ID}|129233025317)/locations/${REGION}/builds/`
    ).test(build)
    || !new RegExp(
      `^projects/(?:${PROJECT_ID}|129233025317)/locations/${REGION}/services/`
    ).test(service)
    || !value.buildConfig?.sourceProvenance
    || Object.keys(value.buildConfig.sourceProvenance).length === 0
  ) {
    throw new Error("live_function_revision_invalid");
  }
  if (!/^[a-f0-9]{40}$/.test(firebaseFunctionsHash)) {
    throw new Error("live_function_firebase_hash_invalid");
  }
  if (firebaseFunctionsHash !== expectedHash) {
    throw new Error("live_function_candidate_hash_mismatch");
  }
  return {
    functionId,
    name: value.name,
    revision,
    updateTime,
    build,
    service,
    firebaseFunctionsHash,
    sourceProvenanceHash: stableHash(value.buildConfig.sourceProvenance),
    releaseCommitBindingHash: stableHash({
      releaseCommit: candidate.releaseCommit,
      sourceCommitHash: candidate.sourceCommitHash,
      functionId,
      revision,
      updateTime,
      firebaseFunctionsHash
    })
  };
}

async function buildCandidateContext(releaseCommit) {
  const root = firebaseToolsRoot();
  const prepareFunctionsUpload = require(path.join(
    root,
    "lib",
    "deploy",
    "functions",
    "prepareFunctionsUpload.js"
  )).prepareFunctionsUpload;
  const loadUserEnvs = require(path.join(root, "lib", "functions", "env.js"))
    .loadUserEnvs;
  const firebaseConfig = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "firebase.json"), "utf8")
  );
  const functionsConfig = firebaseConfig.functions;
  if (
    !functionsConfig
    || Array.isArray(functionsConfig)
    || functionsConfig.source !== "functions"
  ) {
    throw new Error("candidate_functions_config_invalid");
  }
  const sourceDir = path.join(process.cwd(), functionsConfig.source);
  let packaged;
  try {
    packaged = await prepareFunctionsUpload(
      process.cwd(),
      sourceDir,
      {
        ...functionsConfig,
        ...(Array.isArray(functionsConfig.ignore)
          ? { ignore: [...functionsConfig.ignore] }
          : {})
      },
      [],
      undefined,
      { exportType: "zip", executablePaths: [] }
    );
    const sourceHash = String(packaged?.hash || "").toLowerCase();
    if (!/^[a-f0-9]{40}(?:\.[a-f0-9]{40})?$/.test(sourceHash)) {
      throw new Error("candidate_source_hash_invalid");
    }
    const environmentVariables = loadUserEnvs({
      functionsSource: sourceDir,
      configDir: sourceDir,
      projectId: PROJECT_ID,
      isEmulator: false
    });
    const environmentHash = firebaseEnvironmentHash(environmentVariables);
    return Object.freeze({
      releaseCommit,
      sourceHash,
      environmentVariables: Object.freeze({ ...environmentVariables }),
      environmentHash,
      sourceCommitHash: stableHash({
        releaseCommit,
        sourceHash,
        environmentHash
      })
    });
  } finally {
    if (packaged?.pathToSource) {
      try {
        fs.unlinkSync(packaged.pathToSource);
      } catch (_) {
        // The candidate hash is still valid; failure to clean a temp archive
        // must not alter or weaken the live verification result.
      }
    }
  }
}

async function readLiveFunctionRevisions(accessToken, candidate) {
  const entries = [];
  for (const functionId of FUNCTION_IDS) {
    const expectedName = `projects/${PROJECT_ID}/locations/${REGION}/functions/${functionId}`;
    const value = await boundedJson(
      `https://cloudfunctions.googleapis.com/v2/${expectedName}`,
      accessToken
    );
    entries.push(buildLiveRevisionEntry(functionId, value, candidate));
  }
  return entries;
}

function receiptPath(releaseCommit) {
  const base = String(process.env.LOCALAPPDATA || "").trim();
  if (!base) throw new Error("local_receipt_directory_unavailable");
  return path.join(
    base,
    "CFSB",
    "questionnaire-release",
    `function-revisions-${releaseCommit}.receipt.json`
  );
}

function writeReceipt(releaseCommit, candidate, functions) {
  const target = receiptPath(releaseCommit);
  const receipt = {
    version: RECEIPT_VERSION,
    projectId: PROJECT_ID,
    region: REGION,
    releaseCommit,
    candidateSourceHash: candidate.sourceHash,
    candidateEnvironmentHash: candidate.environmentHash,
    candidateSourceCommitHash: candidate.sourceCommitHash,
    recordedAt: new Date().toISOString(),
    functions
  };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
}

function verifyReceipt(releaseCommit, candidate, liveFunctions) {
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(receiptPath(releaseCommit), "utf8"));
  } catch (_) {
    throw new Error("function_revision_receipt_missing");
  }
  const recordedAtMs = new Date(String(receipt.recordedAt || "")).getTime();
  if (
    receipt.version !== RECEIPT_VERSION
    || receipt.projectId !== PROJECT_ID
    || receipt.region !== REGION
    || receipt.releaseCommit !== releaseCommit
    || receipt.candidateSourceHash !== candidate.sourceHash
    || receipt.candidateEnvironmentHash !== candidate.environmentHash
    || receipt.candidateSourceCommitHash !== candidate.sourceCommitHash
    || !Number.isFinite(recordedAtMs)
    || recordedAtMs > Date.now() + (5 * 60 * 1000)
    || !Array.isArray(receipt.functions)
    || JSON.stringify(receipt.functions) !== JSON.stringify(liveFunctions)
  ) {
    throw new Error("function_revision_receipt_mismatch");
  }
}

function safeError(error) {
  const code = String(error?.message || "");
  return /^[a-z0-9_]+$/.test(code) ? code : "unexpected_error";
}

module.exports = {
  EXPECTED_SECRET_KEYS,
  FUNCTION_IDS,
  RECEIPT_VERSION,
  buildCandidateContext,
  buildLiveRevisionEntry,
  expectedFirebaseFunctionsHash,
  firebaseEnvironmentHash,
  firebaseSecretsHash,
  safeError,
  stableHash
};
