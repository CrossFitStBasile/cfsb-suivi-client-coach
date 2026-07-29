#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const DATABASE_ID = "(default)";
const COLLECTION_GROUP = "questionnaireRateLimits";
const FIELD_ID = "expiresAt";
const RELEASE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_BODY_BYTES = 500_000;
const FIELD_NAME =
  `projects/${PROJECT_ID}/databases/${DATABASE_ID}/collectionGroups/`
    + `${COLLECTION_GROUP}/fields/${FIELD_ID}`;

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      check: "questionnaire_rate_limit_ttl",
      error: safeError(error)
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  verifySealedCandidate(options.releaseCommit);
  const accessToken = await firebaseAccessToken();
  const before = await readTtlState(accessToken);
  let operationName = "";
  let externalWrites = 0;

  if (options.mode === "enable") {
    verifyEnableAuthority(options.releaseCommit);
    if (before.state === "NEEDS_REPAIR") {
      throw new Error("ttl_needs_repair");
    }
    if (!["ACTIVE", "CREATING"].includes(before.state)) {
      operationName = await enableTtl(accessToken);
      externalWrites = 1;
    }
  }

  const after = options.mode === "enable" && externalWrites === 1
    ? await readTtlState(accessToken)
    : before;
  if (
    options.mode === "enable"
    && externalWrites === 1
    && !["CREATING", "ACTIVE"].includes(after.state)
  ) {
    throw new Error("ttl_activation_not_observed");
  }
  if (options.mode === "verify" && after.state !== "ACTIVE") {
    throw new Error("ttl_not_active");
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    check: "questionnaire_rate_limit_ttl",
    mode: options.mode,
    projectId: PROJECT_ID,
    releaseCommit: options.releaseCommit,
    collectionGroup: COLLECTION_GROUP,
    field: FIELD_ID,
    beforeState: before.state,
    afterState: after.state,
    active: after.state === "ACTIVE",
    operationName,
    externalWrites
  }, null, 2)}\n`);
}

function parseArgs(args) {
  let releaseCommit = "";
  let mode = "";
  for (const argument of args) {
    if (argument.startsWith("--release-commit=")) {
      if (releaseCommit) throw new Error("release_commit_repeated");
      releaseCommit = argument
        .slice("--release-commit=".length)
        .trim()
        .toLowerCase();
      continue;
    }
    if (["--preview", "--enable", "--verify"].includes(argument)) {
      if (mode) throw new Error("mode_repeated");
      mode = argument.slice(2);
      continue;
    }
    throw new Error("argument_unknown");
  }
  if (!RELEASE_COMMIT_PATTERN.test(releaseCommit)) {
    throw new Error("release_commit_invalid");
  }
  if (!["preview", "enable", "verify"].includes(mode)) {
    throw new Error("mode_missing");
  }
  return Object.freeze({ releaseCommit, mode });
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

function fieldUrl() {
  return `https://firestore.googleapis.com/v1/${FIELD_NAME}`;
}

async function responseJson(response) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("response_too_large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new Error("response_too_large");
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error("response_invalid");
  }
}

function normalizeTtlState(field, status) {
  if (status === 404) return Object.freeze({ exists: false, state: "ABSENT" });
  if (field?.name !== FIELD_NAME) throw new Error("ttl_field_target_mismatch");
  const ttl = field.ttlConfig;
  if (ttl === undefined) {
    return Object.freeze({ exists: true, state: "ABSENT" });
  }
  const state = String(ttl?.state || "STATE_UNSPECIFIED");
  if (
    !["STATE_UNSPECIFIED", "CREATING", "ACTIVE", "NEEDS_REPAIR"]
      .includes(state)
  ) {
    throw new Error("ttl_state_unknown");
  }
  return Object.freeze({ exists: true, state });
}

async function readTtlState(accessToken) {
  const response = await fetch(fieldUrl(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (![200, 404].includes(response.status)) {
    throw new Error(`http_${response.status}`);
  }
  const value = await responseJson(response);
  return normalizeTtlState(value, response.status);
}

function verifyEnableAuthority(releaseCommit) {
  const go = String(
    process.env.CFSB_QUESTIONNAIRE_TTL_GO || ""
  ).trim().toLowerCase();
  if (go !== releaseCommit) throw new Error("ttl_go_missing");
}

async function enableTtl(accessToken) {
  const url = new URL(fieldUrl());
  url.searchParams.set("updateMask", "ttlConfig");
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: FIELD_NAME,
      ttlConfig: {}
    }),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  const operation = await responseJson(response);
  const operationName = String(operation?.name || "");
  if (!/^projects\/[^/]+\/databases\/[^/]+\/operations\/[^/]+$/.test(
    operationName
  )) {
    throw new Error("ttl_operation_invalid");
  }
  if (operation?.error) throw new Error("ttl_operation_failed");
  return operationName;
}

function safeError(error) {
  const code = String(error?.message || "");
  return /^[a-z0-9_]+$/.test(code) ? code : "unexpected_error";
}

module.exports = {
  COLLECTION_GROUP,
  DATABASE_ID,
  FIELD_ID,
  FIELD_NAME,
  PROJECT_ID,
  enableTtl,
  fieldUrl,
  normalizeTtlState,
  parseArgs,
  readTtlState,
  verifyEnableAuthority
};
