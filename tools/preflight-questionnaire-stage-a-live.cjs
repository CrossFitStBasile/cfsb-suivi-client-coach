#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  DEFAULT_PROJECT_ID,
  listQuestionnaireScheduleIndexes,
  listQuestionnaireScheduleDocuments,
  schedulerHorizonDate,
  schedulerWindowState,
  summarizeQuestionnaireScheduleIndexes,
  summarizeSchedules,
  torontoClock
} = require("./questionnaire-stage-a-preflight-lib.cjs");

const root = path.resolve(__dirname, "..");
const projectId = DEFAULT_PROJECT_ID;

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const startedAt = new Date();
  const accessToken = await firebaseAccessToken();
  const result = await listQuestionnaireScheduleDocuments({
    accessToken,
    projectId
  });
  const indexResult = options.requireIndexReady
    ? await listQuestionnaireScheduleIndexes({ accessToken, projectId })
    : null;
  const checkedAt = new Date();
  const evaluation = evaluateLiveState({
    documents: result.documents,
    pages: result.pages,
    indexes: indexResult?.indexes || null,
    startedAt,
    checkedAt,
    options
  });
  const {
    output,
    blockedBySchedules,
    blockedByWindow,
    blockedByIndex
  } = evaluation;

  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) {
    if (blockedBySchedules) {
      console.error(
        "STOP: un suivi actif est dû dans l'horizon protégé, possède une date "
          + "invalide ou un statut inconnu. "
          + "Aucun index Questionnaire ne doit être publié."
      );
    }
    if (blockedByWindow) {
      console.error(
        "STOP: fenêtre trop proche de l'exécution quotidienne de 07:15 "
          + "(America/Toronto). Reprendre hors de la fenêtre protégée."
      );
    }
    if (blockedByIndex) {
      console.error(
        "STOP: l'index status/nextSendAt n'est pas présent une seule fois "
          + "dans l'état READY. Stage A demeure non vérifiée."
      );
    }
    process.exitCode = 1;
  }
}

function evaluateLiveState({
  documents,
  pages,
  indexes,
  checkedAt,
  startedAt = checkedAt,
  options
}) {
  const clock = torontoClock(checkedAt);
  const protectionThroughDate = options.protectThroughNextScheduler
    ? schedulerHorizonDate(checkedAt)
    : clock.today;
  const schedules = summarizeSchedules(documents, protectionThroughDate);
  const scheduleIndex = indexes
    ? summarizeQuestionnaireScheduleIndexes(indexes)
    : null;
  const schedulerWindowAtStart = options.requireSafeWindow
    ? schedulerWindowState(startedAt)
    : null;
  const schedulerWindowAtEnd = options.requireSafeWindow
    ? schedulerWindowState(checkedAt)
    : null;
  const schedulerWindow = options.requireSafeWindow
    ? Object.freeze({
        ...schedulerWindowAtEnd,
        blocked:
          schedulerWindowAtStart.blocked || schedulerWindowAtEnd.blocked,
        startedBlocked: schedulerWindowAtStart.blocked,
        completedBlocked: schedulerWindowAtEnd.blocked
      })
    : null;
  const blockedBySchedules =
    schedules.activeDue > 0
    || schedules.activeInvalidDate > 0
    || schedules.invalidStatus > 0;
  const blockedByWindow = Boolean(schedulerWindow?.blocked);
  const blockedByIndex =
    options.requireIndexReady
    && (
      !scheduleIndex
      || scheduleIndex.indexes !== 1
      || scheduleIndex.matching !== 1
      || scheduleIndex.ready !== 1
    );
  return {
    output: {
      ok: !blockedBySchedules && !blockedByWindow && !blockedByIndex,
      projectId,
      check: "questionnaire_schedule_live_preflight",
      readOnly: true,
      todayToronto: clock.today,
      protectionThroughDateToronto: protectionThroughDate,
      pages,
      schedules,
      schedulerWindow,
      scheduleIndex
    },
    blockedBySchedules,
    blockedByWindow,
    blockedByIndex
  };
}

function parseArguments(args) {
  const parsed = {
    requireSafeWindow: false,
    requireIndexReady: false,
    protectThroughNextScheduler: false
  };
  for (const argument of args) {
    if (argument === "--require-safe-scheduler-window") {
      parsed.requireSafeWindow = true;
      continue;
    }
    if (argument === "--require-index-ready") {
      parsed.requireIndexReady = true;
      continue;
    }
    if (argument === "--protect-through-next-scheduler") {
      parsed.protectThroughNextScheduler = true;
      continue;
    }
    throw new Error("unsupported preflight argument");
  }
  if (parsed.requireIndexReady) {
    parsed.requireSafeWindow = true;
    parsed.protectThroughNextScheduler = true;
  }
  return parsed;
}

async function firebaseAccessToken() {
  const firebaseToolsRoot = resolveFirebaseToolsRoot();
  const auth = require(path.join(firebaseToolsRoot, "lib", "auth.js"));
  const authGate = require(path.join(firebaseToolsRoot, "lib", "requireAuth.js"));
  const apiv2 = require(path.join(firebaseToolsRoot, "lib", "apiv2.js"));
  const account = auth.getProjectDefaultAccount(root);
  const authOptions = {
    project: projectId,
    projectRoot: root,
    nonInteractive: true
  };

  if (account?.user && account?.tokens?.refresh_token) {
    authOptions.user = account.user;
    authOptions.tokens = account.tokens;
  }
  if (process.env.FIREBASE_TOKEN) {
    authOptions.token = process.env.FIREBASE_TOKEN;
  }
  if (!authOptions.token && !authOptions.tokens?.refresh_token) {
    throw new Error("Firebase CLI login with a refresh token is required");
  }

  await authGate.requireAuth(authOptions, true);
  const accessToken = await apiv2.getAccessToken();
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("firebase authentication did not return a token");
  }
  return accessToken;
}

function resolveFirebaseToolsRoot() {
  const candidates = [];
  if (process.env.CFSB_FIREBASE_TOOLS_ROOT) {
    candidates.push(process.env.CFSB_FIREBASE_TOOLS_ROOT);
  }
  if (process.env.FIREBASE_BIN) {
    candidates.push(firebasePackageFromBin(process.env.FIREBASE_BIN));
  }

  try {
    candidates.push(path.dirname(require.resolve("firebase-tools/package.json")));
  } catch {
    // The repository intentionally does not vendor firebase-tools.
  }

  const userProfile = process.env.USERPROFILE || "";
  if (userProfile) {
    candidates.push(path.join(
      userProfile,
      ".cache",
      "cfsb-dashboard-tools",
      "firebase-tools-clean",
      "node_modules",
      "firebase-tools"
    ));
  }
  const explicitCandidate = firstUsableFirebaseToolsRoot(candidates);
  if (explicitCandidate) return explicitCandidate;

  if (process.platform === "win32") {
    const whereResult = spawnSync("where", ["firebase"], {
      encoding: "utf8",
      env: childEnvironmentWithoutSecrets(),
      timeout: 5000,
      windowsHide: true
    });
    if (whereResult.status === 0) {
      for (const line of String(whereResult.stdout || "").split(/\r?\n/)) {
        if (line.trim()) candidates.push(firebasePackageFromBin(line.trim()));
      }
    }
  }

  const pathCandidate = firstUsableFirebaseToolsRoot(candidates);
  if (pathCandidate) return pathCandidate;
  throw new Error("firebase-tools package is unavailable");
}

function firstUsableFirebaseToolsRoot(candidates) {
  for (const candidate of (candidates || []).filter(Boolean)) {
    const resolved = path.resolve(candidate);
    if (
      fs.existsSync(path.join(resolved, "package.json"))
      && fs.existsSync(path.join(resolved, "lib", "requireAuth.js"))
      && fs.existsSync(path.join(resolved, "lib", "apiv2.js"))
    ) {
      return resolved;
    }
  }
  return "";
}

function childEnvironmentWithoutSecrets(sourceEnvironment = process.env) {
  const environment = { ...sourceEnvironment };
  const secretNames = new Set([
    "FIREBASE_TOKEN",
    "GHL_PRIVATE_TOKEN",
    "DASHBOARD_IMPORT_TOKEN"
  ]);
  for (const variableName of Object.keys(environment)) {
    if (secretNames.has(variableName.toUpperCase())) {
      delete environment[variableName];
    }
  }
  return environment;
}

function firebasePackageFromBin(binPath) {
  if (!binPath) return "";
  const resolved = path.resolve(binPath);
  const parent = path.dirname(resolved);
  if (path.basename(parent).toLowerCase() === ".bin") {
    return path.join(path.dirname(parent), "firebase-tools");
  }
  const marker = `${path.sep}node_modules${path.sep}.bin${path.sep}`;
  const markerIndex = resolved.toLowerCase().indexOf(marker.toLowerCase());
  if (markerIndex >= 0) {
    return path.join(
      resolved.slice(0, markerIndex),
      "node_modules",
      "firebase-tools"
    );
  }
  return "";
}

function safeFailureReason(error) {
  const message = String(error?.message || "");
  if (
    /auth|credential|login|token|invalid_rapt|invalid_grant|reauth/i.test(message)
  ) {
    return "Firebase authentication is unavailable or expired; reauthentication is required.";
  }
  if (/abort|timeout/i.test(message)) {
    return "The read-only Firestore preflight timed out.";
  }
  if (/firebase-tools package/i.test(message)) {
    return "The Firebase CLI package could not be located.";
  }
  if (/HTTP \d+|Firestore/i.test(message)) {
    return "The read-only Firestore request failed.";
  }
  if (/argument/i.test(message)) {
    return "The preflight command arguments are invalid.";
  }
  return "The read-only live preflight failed closed.";
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      projectId,
      check: "questionnaire_schedule_live_preflight",
      error: safeFailureReason(error)
    }, null, 2));
    process.exitCode = 1;
  });
}

module.exports = {
  evaluateLiveState,
  childEnvironmentWithoutSecrets,
  firebasePackageFromBin,
  firstUsableFirebaseToolsRoot,
  main,
  parseArguments,
  safeFailureReason
};
