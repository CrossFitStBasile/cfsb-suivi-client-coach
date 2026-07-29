#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const lib = require("./questionnaire-pre-release-state-lib.cjs");

const REQUEST_TIMEOUT_MS = 25_000;
const OPERATION_TIMEOUT_MS = 10 * 60 * 1000;
const OPERATION_POLL_MS = 2_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      check: "questionnaire_pre_release_rollback",
      error: lib.safeError(error)
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = lib.parseRollbackArgs(process.argv.slice(2));
  verifySealedCandidate(options.releaseCommit);
  const receipt = lib.readReceipt(options.releaseCommit);
  lib.validateReceipt(receipt, {
    releaseCommit: options.releaseCommit,
    planHash: options.planHash
  });
  const plan = lib.buildRollbackPlan(receipt, options.scopes);
  const accessToken = await firebaseAccessToken();

  await verifyTargetsExist(plan, receipt, accessToken);
  let externalWrites = 0;

  if (options.mode === "execute") {
    verifyRollbackAuthority(options);
    // Hosting is restored first so newly published member routes are removed
    // before backend rollback. All scopes remain independently selectable.
    if (plan.hosting) await restoreHosting(plan.hosting, accessToken);
    externalWrites += Number(Boolean(plan.hosting));
    for (const target of plan.functions) {
      await restoreFunctionTraffic(target, accessToken);
      externalWrites += 1;
    }
    if (plan.a3AdditiveRemoval) {
      const a3Targets = plan.functions.filter(
        (target) => target.releaseScope === "A3"
      );
      if (
        a3Targets.length !== lib.A3_FUNCTION_IDS.length
        || !(await verifyFunctionTraffic(a3Targets, accessToken))
      ) {
        throw new Error("rollback_a3_traffic_not_restored");
      }
      const additiveState = await inspectA3AdditiveResources(
        plan.a3AdditiveRemoval,
        accessToken
      );
      if (!additiveState.absent) {
        deleteA3AdditiveFunctionWithFirebaseCli(
          plan.a3AdditiveRemoval,
          options
        );
        externalWrites += 1;
        await waitForA3AdditiveAbsence(
          plan.a3AdditiveRemoval,
          accessToken
        );
      }
    }
    if (plan.firestoreRules) {
      await restoreFirestoreRules(plan.firestoreRules, accessToken);
      externalWrites += 1;
    }
  }

  const verification = await verifyRollbackState(
    plan,
    receipt,
    accessToken
  );
  const fullyRestored = Object.values(verification).every(Boolean);
  if (options.mode === "verify" && !fullyRestored) {
    throw new Error("rollback_verification_failed");
  }
  if (options.mode === "execute" && !fullyRestored) {
    throw new Error("rollback_postcondition_failed");
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    check: "questionnaire_pre_release_rollback",
    mode: options.mode,
    projectId: lib.PROJECT_ID,
    releaseCommit: options.releaseCommit,
    planHash: options.planHash,
    scopes: options.scopes,
    targets: {
      hosting: Boolean(plan.hosting),
      firestoreRules: Boolean(plan.firestoreRules),
      functions: plan.functions.length,
      a3AdditiveRemoval: Boolean(plan.a3AdditiveRemoval)
    },
    verification,
    fullyRestored,
    externalWrites
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
  {
    method = "GET",
    body = undefined,
    allowNotFound = false
  } = {}
) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error("response_invalid");
  }
}

function verifyRollbackAuthority(options) {
  const go = String(
    process.env.CFSB_QUESTIONNAIRE_ROLLBACK_GO || ""
  ).trim().toLowerCase();
  const reviewedPlan = String(
    process.env.CFSB_QUESTIONNAIRE_ROLLBACK_PLAN_HASH || ""
  ).trim().toLowerCase();
  if (go !== options.releaseCommit) throw new Error("rollback_go_missing");
  if (reviewedPlan !== options.planHash) {
    throw new Error("rollback_plan_hash_not_reviewed");
  }
}

function normalizedHostingVersion(value) {
  return lib.normalizeResourceName(value);
}

async function readHostingVersion(versionName, accessToken) {
  const normalized = normalizedHostingVersion(versionName);
  if (!normalized.startsWith(`sites/${lib.SITE_ID}/versions/`)) {
    throw new Error("rollback_hosting_target_invalid");
  }
  return boundedJson(
    `https://firebasehosting.googleapis.com/v1beta1/${normalized}`,
    accessToken
  );
}

async function readRuleset(rulesetName, accessToken) {
  if (!String(rulesetName).startsWith(
    `projects/${lib.PROJECT_ID}/rulesets/`
  )) {
    throw new Error("rollback_rules_target_invalid");
  }
  return boundedJson(
    `https://firebaserules.googleapis.com/v1/${rulesetName}`,
    accessToken
  );
}

async function readCloudRunRevision(target, accessToken) {
  if (
    target.revisionName
      !== `${target.service}/revisions/${target.revision}`
  ) {
    throw new Error("rollback_function_target_invalid");
  }
  return boundedJson(
    `https://run.googleapis.com/v2/${target.revisionName}`,
    accessToken
  );
}

async function inspectA3AdditiveResources(target, accessToken) {
  if (
    target?.functionId !== lib.A3_ADDITIVE_FUNCTION_ID
    || target?.functionName !== lib.A3_ADDITIVE_FUNCTION_NAME
    || target?.schedulerJobName !== lib.A3_ADDITIVE_SCHEDULER_JOB_NAME
  ) {
    throw new Error("rollback_a3_additive_target_invalid");
  }
  const { functionValue, schedulerJob } =
    await readA3AdditiveResources(target, accessToken);
  if (functionValue === null && schedulerJob === null) {
    return Object.freeze({ absent: true });
  }
  if (functionValue === null || schedulerJob === null) {
    throw new Error("rollback_a3_additive_resource_pair_invalid");
  }
  lib.validateA3AdditiveLivePair(functionValue, schedulerJob);
  return Object.freeze({ absent: false });
}

async function readA3AdditiveResources(target, accessToken) {
  const [functionValue, schedulerJob] = await Promise.all([
    boundedJson(
      `https://cloudfunctions.googleapis.com/v2/${target.functionName}`,
      accessToken,
      { allowNotFound: true }
    ),
    boundedJson(
      `https://cloudscheduler.googleapis.com/v1/${target.schedulerJobName}`,
      accessToken,
      { allowNotFound: true }
    )
  ]);
  return { functionValue, schedulerJob };
}

async function verifyTargetsExist(plan, receipt, accessToken) {
  const requests = [];
  if (plan.hosting) {
    requests.push(
      readHostingVersion(plan.hosting.versionName, accessToken).then(
        (version) => {
          if (
            version?.status !== "FINALIZED"
            || lib.stableHash(version?.config || {})
              !== receipt.state.hosting.configHash
            || String(version?.fileCount || "")
              !== receipt.state.hosting.fileCount
            || String(version?.versionBytes || "")
              !== receipt.state.hosting.versionBytes
          ) {
            throw new Error("rollback_hosting_target_changed");
          }
        }
      )
    );
  }
  if (plan.firestoreRules) {
    requests.push(
      readRuleset(plan.firestoreRules.rulesetName, accessToken).then(
        (ruleset) => {
          const files = ruleset?.source?.files;
          if (
            ruleset?.name !== plan.firestoreRules.rulesetName
            || !Array.isArray(files)
            || lib.stableHash(
              files.map((file) => ({
                name: file.name,
                content: file.content
              }))
            ) !== receipt.state.firestoreRules.sourceHash
          ) {
            throw new Error("rollback_rules_target_changed");
          }
        }
      )
    );
  }
  for (const target of plan.functions) {
    requests.push(
      readCloudRunRevision(target, accessToken).then((revision) => {
        const images = Array.isArray(revision?.containers)
          ? revision.containers.map(
              (container) => String(container?.image || "")
            )
          : [];
        if (
          revision?.name !== target.revisionName
          || images.length < 1
          || images.some((image) => !image)
          || lib.stableHash(images) !== target.revisionContainerImagesHash
        ) {
          throw new Error("rollback_function_revision_missing");
        }
      })
    );
  }
  if (plan.a3AdditiveRemoval) {
    requests.push(
      inspectA3AdditiveResources(
        plan.a3AdditiveRemoval,
        accessToken
      )
    );
  }
  await Promise.all(requests);
}

async function restoreHosting(target, accessToken) {
  const url = new URL(
    "https://firebasehosting.googleapis.com/v1beta1/projects/-/sites/"
      + `${target.siteId}/channels/${target.channelId}/releases`
  );
  url.searchParams.set("versionName", target.versionName);
  const value = await boundedJson(url, accessToken, {
    method: "POST",
    body: {
      message: "CFSB Questionnaire rollback vers le snapshot pre-release scelle"
    }
  });
  if (
    normalizedHostingVersion(value?.version?.name)
      !== normalizedHostingVersion(target.versionName)
  ) {
    throw new Error("rollback_hosting_release_invalid");
  }
}

async function restoreFirestoreRules(target, accessToken) {
  const value = await boundedJson(
    `https://firebaserules.googleapis.com/v1/${target.releaseName}`,
    accessToken,
    {
      method: "PATCH",
      body: {
        release: {
          name: target.releaseName,
          rulesetName: target.rulesetName
        },
        updateMask: "rulesetName"
      }
    }
  );
  if (
    value?.name !== target.releaseName
    || value?.rulesetName !== target.rulesetName
  ) {
    throw new Error("rollback_rules_release_invalid");
  }
}

async function restoreFunctionTraffic(target, accessToken) {
  const serviceUrl = `https://run.googleapis.com/v2/${target.service}`;
  const current = await boundedJson(serviceUrl, accessToken);
  if (
    current?.name !== target.service
    || typeof current?.etag !== "string"
    || !current.etag
  ) {
    throw new Error("rollback_function_service_invalid");
  }
  const url = new URL(serviceUrl);
  url.searchParams.set("updateMask", "traffic");
  const operation = await boundedJson(url, accessToken, {
    method: "PATCH",
    body: {
      name: target.service,
      etag: current.etag,
      traffic: [
        {
          type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
          revision: target.revision,
          percent: 100
        }
      ]
    }
  });
  await waitForOperation(operation, accessToken);
}

function deleteA3AdditiveFunctionWithFirebaseCli(target, options) {
  if (
    target?.functionId !== lib.A3_ADDITIVE_FUNCTION_ID
    || target?.functionName !== lib.A3_ADDITIVE_FUNCTION_NAME
    || target?.schedulerJobName !== lib.A3_ADDITIVE_SCHEDULER_JOB_NAME
  ) {
    throw new Error("rollback_a3_additive_target_invalid");
  }
  // Recheck both operator proofs at the destructive boundary. Firebase CLI's
  // functions:delete path is intentional here: for a scheduled gen2 Function
  // it removes both the Function and its exact Cloud Scheduler trigger.
  verifyRollbackAuthority(options);
  const cli = path.join(firebaseToolsRoot(), "lib", "bin", "firebase.js");
  if (!fs.existsSync(cli)) throw new Error("firebase_tools_unavailable");
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "functions:delete",
      target.functionId,
      "--region",
      lib.REGION,
      "--force",
      "--project",
      lib.PROJECT_ID,
      "--non-interactive"
    ],
    {
      cwd: process.cwd(),
      env: sanitizedChildEnv(),
      encoding: "utf8",
      timeout: OPERATION_TIMEOUT_MS,
      maxBuffer: 300_000,
      windowsHide: true
    }
  );
  if (result.status !== 0) {
    throw new Error("rollback_a3_additive_delete_failed");
  }
}

async function waitForA3AdditiveAbsence(target, accessToken) {
  if (
    target?.functionId !== lib.A3_ADDITIVE_FUNCTION_ID
    || target?.functionName !== lib.A3_ADDITIVE_FUNCTION_NAME
    || target?.schedulerJobName !== lib.A3_ADDITIVE_SCHEDULER_JOB_NAME
  ) {
    throw new Error("rollback_a3_additive_target_invalid");
  }
  const deadline = Date.now() + OPERATION_TIMEOUT_MS;
  while (true) {
    const { functionValue, schedulerJob } =
      await readA3AdditiveResources(target, accessToken);
    if (functionValue === null && schedulerJob === null) return true;
    if (Date.now() >= deadline) {
      throw new Error("rollback_a3_additive_delete_timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_MS));
  }
}

async function waitForOperation(operation, accessToken) {
  const name = String(operation?.name || "");
  if (!/^projects\/[^/]+\/locations\/[^/]+\/operations\/[^/]+$/.test(name)) {
    throw new Error("rollback_operation_invalid");
  }
  const deadline = Date.now() + OPERATION_TIMEOUT_MS;
  let value = operation;
  while (value?.done !== true) {
    if (Date.now() >= deadline) throw new Error("rollback_operation_timeout");
    await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_MS));
    value = await boundedJson(
      `https://run.googleapis.com/v2/${name}`,
      accessToken
    );
  }
  if (value?.error) throw new Error("rollback_operation_failed");
  return value;
}

function exactRevisionTraffic(service, target) {
  const revisionResource = `${target.service}/revisions/${target.revision}`;
  return service?.name === target.service
    && service?.reconciling !== true
    && String(service?.generation || "")
      === String(service?.observedGeneration || "")
    && service?.terminalCondition?.state === "CONDITION_SUCCEEDED"
    && Array.isArray(service?.trafficStatuses)
    && service.trafficStatuses.length === 1
    && (
      service.trafficStatuses[0]?.revision === target.revision
      || service.trafficStatuses[0]?.revision === revisionResource
    )
    && Number(service.trafficStatuses[0]?.percent) === 100;
}

async function verifyFunctionTraffic(targets, accessToken) {
  const outcomes = await Promise.all(
    targets.map(async (target) => {
      const service = await boundedJson(
        `https://run.googleapis.com/v2/${target.service}`,
        accessToken
      );
      return exactRevisionTraffic(service, target);
    })
  );
  return outcomes.length === targets.length && outcomes.every(Boolean);
}

async function verifyRollbackState(plan, receipt, accessToken) {
  const verification = {};
  if (plan.hosting) {
    const channel = await boundedJson(
      "https://firebasehosting.googleapis.com/v1beta1/projects/-/sites/"
        + `${plan.hosting.siteId}/channels/${plan.hosting.channelId}`,
      accessToken
    );
    verification.hosting =
      normalizedHostingVersion(channel?.release?.version?.name)
      === normalizedHostingVersion(plan.hosting.versionName);
  }
  if (plan.firestoreRules) {
    const release = await boundedJson(
      `https://firebaserules.googleapis.com/v1/`
        + plan.firestoreRules.releaseName,
      accessToken
    );
    verification.firestoreRules =
      release?.rulesetName === plan.firestoreRules.rulesetName;
  }
  if (plan.functions.length > 0) {
    verification.functions = await verifyFunctionTraffic(
      plan.functions,
      accessToken
    );
  }
  if (plan.a3AdditiveRemoval) {
    const additive = await inspectA3AdditiveResources(
      plan.a3AdditiveRemoval,
      accessToken
    );
    verification.a3AdditiveAbsent = additive.absent;
  }
  // Receipt integrity is rechecked at the end so a local artifact change during
  // the rollback cannot produce a false PASS.
  verification.receipt =
    lib.readReceipt(receipt.releaseCommit).planHash === receipt.planHash;
  return verification;
}

module.exports = {
  exactRevisionTraffic,
  deleteA3AdditiveFunctionWithFirebaseCli,
  inspectA3AdditiveResources,
  restoreFirestoreRules,
  restoreFunctionTraffic,
  restoreHosting,
  verifyRollbackAuthority,
  verifyFunctionTraffic,
  verifyRollbackState,
  verifyTargetsExist,
  waitForA3AdditiveAbsence,
  waitForOperation
};
