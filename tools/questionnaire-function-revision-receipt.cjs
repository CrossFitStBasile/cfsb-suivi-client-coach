"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const REGION = "us-central1";
const FUNCTION_IDS = Object.freeze([
  "sendQuestionnaire",
  "processQuestionnaireSendRequest",
  "scheduledQuestionnaireSendPlans"
]);
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_000_000;

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    check: "questionnaire_function_revision_receipt",
    error: safeError(error)
  }, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  verifySealedCandidate(options.releaseCommit);
  const accessToken = await firebaseAccessToken();
  const live = await readLiveFunctionRevisions(accessToken);
  if (options.mode === "record") {
    writeReceipt(options.releaseCommit, live);
  } else if (options.mode === "verify") {
    verifyReceipt(options.releaseCommit, live);
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

async function readLiveFunctionRevisions(accessToken) {
  const entries = [];
  for (const functionId of FUNCTION_IDS) {
    const expectedName = `projects/${PROJECT_ID}/locations/${REGION}/functions/${functionId}`;
    const value = await boundedJson(
      `https://cloudfunctions.googleapis.com/v2/${expectedName}`,
      accessToken
    );
    const revision = String(value.serviceConfig?.revision || "");
    const updateTime = String(value.updateTime || "");
    const build = String(value.buildConfig?.build || "");
    const service = String(value.serviceConfig?.service || "");
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
    entries.push({
      functionId,
      name: value.name,
      revision,
      updateTime,
      build,
      service,
      sourceProvenanceHash: stableHash(value.buildConfig.sourceProvenance)
    });
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

function writeReceipt(releaseCommit, functions) {
  const target = receiptPath(releaseCommit);
  const receipt = {
    version: 1,
    projectId: PROJECT_ID,
    region: REGION,
    releaseCommit,
    recordedAt: new Date().toISOString(),
    functions
  };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
}

function verifyReceipt(releaseCommit, liveFunctions) {
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(receiptPath(releaseCommit), "utf8"));
  } catch (_) {
    throw new Error("function_revision_receipt_missing");
  }
  const recordedAtMs = new Date(String(receipt.recordedAt || "")).getTime();
  if (
    receipt.version !== 1
    || receipt.projectId !== PROJECT_ID
    || receipt.region !== REGION
    || receipt.releaseCommit !== releaseCommit
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
