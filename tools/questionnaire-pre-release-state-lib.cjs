"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const PROJECT_NUMBER = "129233025317";
const REGION = "us-central1";
const SITE_ID = PROJECT_ID;
const LIVE_CHANNEL_ID = "live";
const FIRESTORE_RELEASE_NAME =
  `projects/${PROJECT_ID}/releases/cloud.firestore`;

const A2_FUNCTION_IDS = Object.freeze([
  "archiveQuestionnaireForm",
  "duplicateQuestionnaireForm",
  "listQuestionnaireForms",
  "publishQuestionnaireForm",
  "questionnairePublicApi",
  "saveQuestionnaireDraft",
  "setQuestionnaireDeliveryReady"
]);

const A3_FUNCTION_IDS = Object.freeze([
  "sendQuestionnaire",
  "processQuestionnaireSendRequest",
  "scheduledQuestionnaireSendPlans",
  "syncDashboardFromSheets",
  "scheduledDashboardSync",
  "scheduledQuestionnaireResponseSync",
  "processSyncRequest"
]);

const SNAPSHOT_FUNCTIONS = Object.freeze([
  ...A2_FUNCTION_IDS.map((functionId) => Object.freeze({
    functionId,
    releaseScope: "A2"
  })),
  ...A3_FUNCTION_IDS.map((functionId) => Object.freeze({
    functionId,
    releaseScope: "A3"
  }))
]);

const A3_ADDITIVE_FUNCTION_ID = "scheduledQuestionnaireSendRecovery";
const A3_ADDITIVE_FUNCTION_NAME =
  `projects/${PROJECT_ID}/locations/${REGION}/functions/`
    + A3_ADDITIVE_FUNCTION_ID;
const A3_ADDITIVE_SCHEDULER_JOB_NAME =
  `projects/${PROJECT_ID}/locations/${REGION}/jobs/firebase-schedule-`
    + `${A3_ADDITIVE_FUNCTION_ID}-${REGION}`;
const A3_ADDITIVE_SCHEDULER_URI =
  `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/`
    + A3_ADDITIVE_FUNCTION_ID;

const RECEIPT_VERSION = 2;
const RELEASE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ISO_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const FUNCTION_RESOURCE_PATTERN = new RegExp(
  `^projects/${PROJECT_ID}/locations/${REGION}/functions/([A-Za-z0-9_-]+)$`
);
const BUILD_RESOURCE_PATTERN = new RegExp(
  `^projects/(?:${PROJECT_ID}|${PROJECT_NUMBER})/locations/${REGION}/builds/[A-Za-z0-9_-]+$`
);
const SERVICE_RESOURCE_PATTERN = new RegExp(
  `^projects/(?:${PROJECT_ID}|${PROJECT_NUMBER})/locations/${REGION}/services/([a-z0-9-]+)$`
);
const RULESET_RESOURCE_PATTERN = new RegExp(
  `^projects/${PROJECT_ID}/rulesets/[A-Za-z0-9_-]+$`
);
const HOSTING_VERSION_PATTERN = new RegExp(
  `^(?:projects/(?:-|${PROJECT_ID}|${PROJECT_NUMBER})/)?sites/${SITE_ID}/`
    + "versions/[A-Za-z0-9_-]+$"
);
const HOSTING_CHANNEL_PATTERN = new RegExp(
  `^(?:projects/(?:-|${PROJECT_ID}|${PROJECT_NUMBER})/)?sites/${SITE_ID}/channels/`
    + `${LIVE_CHANNEL_ID}$`
);
const HOSTING_RELEASE_PATTERN = new RegExp(
  `^(?:projects/(?:-|${PROJECT_ID}|${PROJECT_NUMBER})/)?sites/${SITE_ID}/`
    + `(?:channels/${LIVE_CHANNEL_ID}/)?releases/[A-Za-z0-9_-]+$`
);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function stableHash(value) {
  return crypto.createHash("sha256")
    .update(stableJson(value), "utf8")
    .digest("hex");
}

function isIsoTime(value) {
  return typeof value === "string"
    && ISO_TIME_PATTERN.test(value)
    && Number.isFinite(new Date(value).getTime());
}

function parseSealArgs(args) {
  let releaseCommit = "";
  let planHash = "";
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
    if (argument.startsWith("--plan-hash=")) {
      if (planHash) throw new Error("plan_hash_repeated");
      planHash = argument
        .slice("--plan-hash=".length)
        .trim()
        .toLowerCase();
      continue;
    }
    if (
      [
        "--preview",
        "--record",
        "--verify",
        "--verify-receipt",
        "--verify-index-ready"
      ].includes(argument)
    ) {
      if (mode) throw new Error("mode_repeated");
      mode = argument.slice(2);
      continue;
    }
    throw new Error("argument_unknown");
  }
  if (!RELEASE_COMMIT_PATTERN.test(releaseCommit)) {
    throw new Error("release_commit_invalid");
  }
  if (
    ![
      "preview",
      "record",
      "verify",
      "verify-receipt",
      "verify-index-ready"
    ].includes(mode)
  ) {
    throw new Error("mode_missing");
  }
  if (mode !== "preview" && !HASH_PATTERN.test(planHash)) {
    throw new Error("plan_hash_invalid");
  }
  if (mode === "preview" && planHash) {
    throw new Error("plan_hash_not_allowed");
  }
  return Object.freeze({ releaseCommit, planHash, mode });
}

function parseRollbackArgs(args) {
  let releaseCommit = "";
  let planHash = "";
  let mode = "";
  const scopes = new Set();
  for (const argument of args) {
    if (argument.startsWith("--release-commit=")) {
      if (releaseCommit) throw new Error("release_commit_repeated");
      releaseCommit = argument
        .slice("--release-commit=".length)
        .trim()
        .toLowerCase();
      continue;
    }
    if (argument.startsWith("--plan-hash=")) {
      if (planHash) throw new Error("plan_hash_repeated");
      planHash = argument
        .slice("--plan-hash=".length)
        .trim()
        .toLowerCase();
      continue;
    }
    if (argument.startsWith("--scope=")) {
      const scope = argument.slice("--scope=".length).trim().toLowerCase();
      if (!["hosting", "rules", "a2", "a3"].includes(scope)) {
        throw new Error("rollback_scope_invalid");
      }
      scopes.add(scope);
      continue;
    }
    if (["--preview", "--execute", "--verify"].includes(argument)) {
      if (mode) throw new Error("mode_repeated");
      mode = argument.slice(2);
      continue;
    }
    throw new Error("argument_unknown");
  }
  if (!RELEASE_COMMIT_PATTERN.test(releaseCommit)) {
    throw new Error("release_commit_invalid");
  }
  if (!HASH_PATTERN.test(planHash)) throw new Error("plan_hash_invalid");
  if (!["preview", "execute", "verify"].includes(mode)) {
    throw new Error("mode_missing");
  }
  if (scopes.size === 0) throw new Error("rollback_scope_missing");
  return Object.freeze({
    releaseCommit,
    planHash,
    mode,
    scopes: Object.freeze([...scopes].sort())
  });
}

function normalizeResourceName(value) {
  return String(value || "").replace(
    new RegExp(`^projects/(?:-|${PROJECT_ID}|${PROJECT_NUMBER})/`),
    ""
  );
}

function assertExactKeys(value, keys, errorCode) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")
  ) {
    throw new Error(errorCode);
  }
}

function sanitizeHosting(channel, version) {
  const channelName = String(channel?.name || "");
  const release = channel?.release;
  const releaseName = String(release?.name || "");
  const versionName = String(release?.version?.name || version?.name || "");
  if (
    !HOSTING_CHANNEL_PATTERN.test(channelName)
    || !HOSTING_RELEASE_PATTERN.test(releaseName)
    || !HOSTING_VERSION_PATTERN.test(versionName)
    || normalizeResourceName(versionName) !== normalizeResourceName(version?.name)
    || !["DEPLOY", "ROLLBACK"].includes(release?.type)
    || !isIsoTime(release?.releaseTime)
    || version?.status !== "FINALIZED"
    || !isIsoTime(version?.createTime)
    || !isIsoTime(version?.finalizeTime)
    || !/^\d+$/.test(String(version?.fileCount || ""))
    || !/^\d+$/.test(String(version?.versionBytes || ""))
  ) {
    throw new Error("live_hosting_state_invalid");
  }
  return Object.freeze({
    siteId: SITE_ID,
    channelName,
    releaseName,
    releaseType: release.type,
    releaseTime: release.releaseTime,
    versionName,
    versionId: normalizeResourceName(versionName).split("/").at(-1),
    versionStatus: version.status,
    versionCreateTime: version.createTime,
    versionFinalizeTime: version.finalizeTime,
    fileCount: String(version.fileCount),
    versionBytes: String(version.versionBytes),
    configHash: stableHash(version.config || {})
  });
}

function sanitizeRules(release, ruleset) {
  const sourceFiles = ruleset?.source?.files;
  if (
    release?.name !== FIRESTORE_RELEASE_NAME
    || !RULESET_RESOURCE_PATTERN.test(String(release?.rulesetName || ""))
    || release.rulesetName !== ruleset?.name
    || !isIsoTime(release?.createTime)
    || !isIsoTime(release?.updateTime)
    || !isIsoTime(ruleset?.createTime)
    || !Array.isArray(sourceFiles)
    || sourceFiles.length < 1
    || sourceFiles.some(
      (file) =>
        !file
        || typeof file.name !== "string"
        || !file.name
        || typeof file.content !== "string"
        || !file.content
    )
  ) {
    throw new Error("live_firestore_rules_state_invalid");
  }
  return Object.freeze({
    releaseName: release.name,
    releaseCreateTime: release.createTime,
    releaseUpdateTime: release.updateTime,
    rulesetName: release.rulesetName,
    rulesetCreateTime: ruleset.createTime,
    sourceFileCount: sourceFiles.length,
    sourceHash: stableHash(
      sourceFiles.map((file) => ({
        name: file.name,
        content: file.content
      }))
    )
  });
}

function expectedFunctionResource(functionId) {
  return `projects/${PROJECT_ID}/locations/${REGION}/functions/${functionId}`;
}

function sanitizeFunction(
  functionValue,
  cloudRunService,
  cloudRunRevision,
  { functionId, releaseScope }
) {
  const functionName = String(functionValue?.name || "");
  const functionMatch = FUNCTION_RESOURCE_PATTERN.exec(functionName);
  const revision = String(functionValue?.serviceConfig?.revision || "");
  const service = String(functionValue?.serviceConfig?.service || "");
  const serviceMatch = SERVICE_RESOURCE_PATTERN.exec(service);
  const build = String(functionValue?.buildConfig?.build || "");
  const expectedServiceId = functionId.toLowerCase();
  const trafficStatuses = cloudRunService?.trafficStatuses;
  const revisionResource = `${service}/revisions/${revision}`;
  const sameRevision = (value) =>
    value === revision || value === revisionResource;
  const trafficStatus = Array.isArray(trafficStatuses)
    && trafficStatuses.length === 1
    ? trafficStatuses[0]
    : null;
  const exactTraffic =
    trafficStatus !== null
    && Number(trafficStatus.percent) === 100
    && (
      sameRevision(trafficStatus.revision)
      || (
        trafficStatus.type === "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
        && !trafficStatus.revision
        && sameRevision(cloudRunService?.latestReadyRevision)
      )
    );
  const revisionName = String(cloudRunRevision?.name || "");
  const expectedRevisionName = revisionResource;
  const images = Array.isArray(cloudRunRevision?.containers)
    ? cloudRunRevision.containers.map((container) => String(container?.image || ""))
    : [];

  if (
    functionName !== expectedFunctionResource(functionId)
    || functionMatch?.[1] !== functionId
    || functionValue?.state !== "ACTIVE"
    || functionValue?.environment !== "GEN_2"
    || functionValue?.serviceConfig?.allTrafficOnLatestRevision !== true
    || !revision
    || !revision.toLowerCase().startsWith(`${expectedServiceId}-`)
    || !BUILD_RESOURCE_PATTERN.test(build)
    || !SERVICE_RESOURCE_PATTERN.test(service)
    || serviceMatch?.[1] !== expectedServiceId
    || !functionValue?.buildConfig?.sourceProvenance
    || Object.keys(functionValue.buildConfig.sourceProvenance).length === 0
    || !isIsoTime(functionValue?.updateTime)
    || cloudRunService?.name !== service
    || cloudRunService?.reconciling === true
    || String(cloudRunService?.generation || "")
      !== String(cloudRunService?.observedGeneration || "")
    || !sameRevision(cloudRunService?.latestReadyRevision)
    || !sameRevision(cloudRunService?.latestCreatedRevision)
    || cloudRunService?.terminalCondition?.state !== "CONDITION_SUCCEEDED"
    || !exactTraffic
    || revisionName !== expectedRevisionName
    || !isIsoTime(cloudRunRevision?.createTime)
    || images.length < 1
    || images.some((image) => !image)
  ) {
    throw new Error("live_function_revision_invalid");
  }

  return Object.freeze({
    releaseScope,
    functionId,
    functionName,
    functionUpdateTime: functionValue.updateTime,
    build,
    sourceProvenanceHash: stableHash(
      functionValue.buildConfig.sourceProvenance
    ),
    service,
    serviceGeneration: String(cloudRunService.generation),
    serviceRevision: revision,
    revisionName,
    revisionCreateTime: cloudRunRevision.createTime,
    revisionContainerImagesHash: stableHash(images)
  });
}

function sanitizeSchedulerIndex(indexes, {
  summarizeQuestionnaireScheduleIndexes,
  isQuestionnaireScheduleIndex
}) {
  const summary = summarizeQuestionnaireScheduleIndexes(indexes, {
    projectId: PROJECT_ID,
    collectionId: "questionnaireSchedules"
  });
  const matching = indexes.filter((index) =>
    isQuestionnaireScheduleIndex(index, {
      projectId: PROJECT_ID,
      collectionId: "questionnaireSchedules"
    })
  );
  if (
    summary.indexes !== 1
    || summary.matching !== 1
    || summary.ready !== 1
    || summary.building !== 0
    || summary.failed !== 0
    || matching.length !== 1
    || matching[0]?.state !== "READY"
  ) {
    throw new Error("questionnaire_schedule_index_not_uniquely_ready");
  }
  const index = matching[0];
  return Object.freeze({
    name: index.name,
    state: index.state,
    queryScope: index.queryScope,
    fields: index.fields.map((field) => ({
      fieldPath: field.fieldPath,
      order: field.order
    }))
  });
}

function sealA3AdditiveAbsence({
  functionAbsent,
  schedulerJobAbsent
}) {
  if (functionAbsent !== true || schedulerJobAbsent !== true) {
    throw new Error("live_a3_additive_resource_not_absent");
  }
  return Object.freeze({
    functionId: A3_ADDITIVE_FUNCTION_ID,
    functionName: A3_ADDITIVE_FUNCTION_NAME,
    schedulerJobName: A3_ADDITIVE_SCHEDULER_JOB_NAME
  });
}

function validateA3AdditiveLivePair(functionValue, schedulerJob) {
  const expectedServices = new Set(
    [PROJECT_ID, PROJECT_NUMBER].map(
      (project) =>
        `projects/${project}/locations/${REGION}/services/`
          + A3_ADDITIVE_FUNCTION_ID.toLowerCase()
    )
  );
  const functionUri = String(functionValue?.serviceConfig?.uri || "");
  const cloudRunUriPattern = new RegExp(
    `^https://${A3_ADDITIVE_FUNCTION_ID.toLowerCase()}-`
      + "[a-z0-9]+-uc\\.a\\.run\\.app$"
  );
  const serviceAccountEmail = String(
    functionValue?.serviceConfig?.serviceAccountEmail || ""
  );
  const secretKeys = Array.isArray(
    functionValue?.serviceConfig?.secretEnvironmentVariables
  )
    ? functionValue.serviceConfig.secretEnvironmentVariables
        .map((entry) => String(entry?.key || ""))
        .sort()
    : [];
  if (
    functionValue?.name !== A3_ADDITIVE_FUNCTION_NAME
    || functionValue?.environment !== "GEN_2"
    || functionValue?.state !== "ACTIVE"
    || functionValue?.buildConfig?.entryPoint !== A3_ADDITIVE_FUNCTION_ID
    || functionValue?.buildConfig?.runtime !== "nodejs22"
    || !expectedServices.has(functionValue?.serviceConfig?.service)
    || !cloudRunUriPattern.test(functionUri)
    || !serviceAccountEmail
    || Number(functionValue?.serviceConfig?.timeoutSeconds) !== 120
    || functionValue?.serviceConfig?.availableMemory !== "512Mi"
    || stableJson(secretKeys) !== stableJson(["GHL_PRIVATE_TOKEN"])
    || functionValue?.labels?.["deployment-tool"] !== "cli-firebase"
    || functionValue?.labels?.["deployment-scheduled"] !== "true"
    || schedulerJob?.name !== A3_ADDITIVE_SCHEDULER_JOB_NAME
    || schedulerJob?.schedule !== "every 10 minutes"
    || schedulerJob?.timeZone !== "America/Toronto"
    || !["ENABLED", "PAUSED"].includes(schedulerJob?.state)
    || schedulerJob?.attemptDeadline !== "180s"
    || schedulerJob?.retryConfig != null
    || schedulerJob?.httpTarget?.uri !== A3_ADDITIVE_SCHEDULER_URI
    || schedulerJob?.httpTarget?.httpMethod !== "POST"
    || schedulerJob?.httpTarget?.oidcToken?.serviceAccountEmail
      !== serviceAccountEmail
    || schedulerJob?.httpTarget?.oidcToken?.audience
      !== A3_ADDITIVE_SCHEDULER_URI
  ) {
    throw new Error("live_a3_additive_resource_config_invalid");
  }
  return true;
}

function buildState({
  hosting,
  firestoreRules,
  functions,
  schedulerIndex,
  a3AdditiveAbsence
}) {
  if (
    !Array.isArray(functions)
    || functions.length !== SNAPSHOT_FUNCTIONS.length
    || stableJson(
      functions.map(({ functionId, releaseScope }) => ({
        functionId,
        releaseScope
      }))
    ) !== stableJson(
      SNAPSHOT_FUNCTIONS.map(({ functionId, releaseScope }) => ({
        functionId,
        releaseScope
      }))
    )
  ) {
    throw new Error("snapshot_function_set_invalid");
  }
  return Object.freeze({
    hosting,
    firestoreRules,
    functions,
    schedulerIndex,
    a3AdditiveAbsence
  });
}

function validateStateShape(state) {
  assertExactKeys(
    state,
    [
      "hosting",
      "firestoreRules",
      "functions",
      "schedulerIndex",
      "a3AdditiveAbsence"
    ],
    "pre_release_state_shape_invalid"
  );
  assertExactKeys(
    state.hosting,
    [
      "siteId",
      "channelName",
      "releaseName",
      "releaseType",
      "releaseTime",
      "versionName",
      "versionId",
      "versionStatus",
      "versionCreateTime",
      "versionFinalizeTime",
      "fileCount",
      "versionBytes",
      "configHash"
    ],
    "pre_release_hosting_shape_invalid"
  );
  if (
    state.hosting.siteId !== SITE_ID
    || !HOSTING_CHANNEL_PATTERN.test(state.hosting.channelName)
    || !HOSTING_RELEASE_PATTERN.test(state.hosting.releaseName)
    || !HOSTING_VERSION_PATTERN.test(state.hosting.versionName)
    || state.hosting.versionId
      !== normalizeResourceName(state.hosting.versionName).split("/").at(-1)
    || !["DEPLOY", "ROLLBACK"].includes(state.hosting.releaseType)
    || state.hosting.versionStatus !== "FINALIZED"
    || !isIsoTime(state.hosting.releaseTime)
    || !isIsoTime(state.hosting.versionCreateTime)
    || !isIsoTime(state.hosting.versionFinalizeTime)
    || !/^\d+$/.test(state.hosting.fileCount)
    || !/^\d+$/.test(state.hosting.versionBytes)
    || !HASH_PATTERN.test(state.hosting.configHash)
  ) {
    throw new Error("pre_release_hosting_state_invalid");
  }

  assertExactKeys(
    state.firestoreRules,
    [
      "releaseName",
      "releaseCreateTime",
      "releaseUpdateTime",
      "rulesetName",
      "rulesetCreateTime",
      "sourceFileCount",
      "sourceHash"
    ],
    "pre_release_rules_shape_invalid"
  );
  if (
    state.firestoreRules.releaseName !== FIRESTORE_RELEASE_NAME
    || !RULESET_RESOURCE_PATTERN.test(state.firestoreRules.rulesetName)
    || !isIsoTime(state.firestoreRules.releaseCreateTime)
    || !isIsoTime(state.firestoreRules.releaseUpdateTime)
    || !isIsoTime(state.firestoreRules.rulesetCreateTime)
    || !Number.isInteger(state.firestoreRules.sourceFileCount)
    || state.firestoreRules.sourceFileCount < 1
    || !HASH_PATTERN.test(state.firestoreRules.sourceHash)
  ) {
    throw new Error("pre_release_rules_state_invalid");
  }

  if (
    !Array.isArray(state.functions)
    || state.functions.length !== SNAPSHOT_FUNCTIONS.length
  ) {
    throw new Error("pre_release_receipt_function_set_invalid");
  }
  state.functions.forEach((entry, index) => {
    const expected = SNAPSHOT_FUNCTIONS[index];
    assertExactKeys(
      entry,
      [
        "releaseScope",
        "functionId",
        "functionName",
        "functionUpdateTime",
        "build",
        "sourceProvenanceHash",
        "service",
        "serviceGeneration",
        "serviceRevision",
        "revisionName",
        "revisionCreateTime",
        "revisionContainerImagesHash"
      ],
      "pre_release_function_shape_invalid"
    );
    const serviceMatch = SERVICE_RESOURCE_PATTERN.exec(entry.service);
    if (
      entry.functionId !== expected.functionId
      || entry.releaseScope !== expected.releaseScope
      || entry.functionName !== expectedFunctionResource(expected.functionId)
      || !isIsoTime(entry.functionUpdateTime)
      || !BUILD_RESOURCE_PATTERN.test(entry.build)
      || !HASH_PATTERN.test(entry.sourceProvenanceHash)
      || serviceMatch?.[1] !== expected.functionId.toLowerCase()
      || !/^\d+$/.test(entry.serviceGeneration)
      || !entry.serviceRevision.toLowerCase().startsWith(
        `${expected.functionId.toLowerCase()}-`
      )
      || entry.revisionName
        !== `${entry.service}/revisions/${entry.serviceRevision}`
      || !isIsoTime(entry.revisionCreateTime)
      || !HASH_PATTERN.test(entry.revisionContainerImagesHash)
    ) {
      throw new Error("pre_release_function_state_invalid");
    }
  });

  assertExactKeys(
    state.schedulerIndex,
    ["name", "state", "queryScope", "fields"],
    "pre_release_scheduler_index_shape_invalid"
  );
  const expectedIndexPrefix =
    `projects/${PROJECT_ID}/databases/(default)/collectionGroups/`
      + "questionnaireSchedules/indexes/";
  if (
    typeof state.schedulerIndex.name !== "string"
    || !state.schedulerIndex.name.startsWith(expectedIndexPrefix)
    || state.schedulerIndex.name.slice(expectedIndexPrefix.length).includes("/")
    || !state.schedulerIndex.name.slice(expectedIndexPrefix.length)
    || state.schedulerIndex.state !== "READY"
    || state.schedulerIndex.queryScope !== "COLLECTION"
    || stableJson(state.schedulerIndex.fields) !== stableJson([
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "nextSendAt", order: "ASCENDING" },
      { fieldPath: "__name__", order: "ASCENDING" }
    ])
  ) {
    throw new Error("pre_release_scheduler_index_state_invalid");
  }

  assertExactKeys(
    state.a3AdditiveAbsence,
    ["functionId", "functionName", "schedulerJobName"],
    "pre_release_a3_additive_absence_shape_invalid"
  );
  if (
    state.a3AdditiveAbsence.functionId !== A3_ADDITIVE_FUNCTION_ID
    || state.a3AdditiveAbsence.functionName !== A3_ADDITIVE_FUNCTION_NAME
    || state.a3AdditiveAbsence.schedulerJobName
      !== A3_ADDITIVE_SCHEDULER_JOB_NAME
  ) {
    throw new Error("pre_release_a3_additive_absence_invalid");
  }
  return state;
}

function buildReceipt({ releaseCommit, recordedAt, state }) {
  if (!RELEASE_COMMIT_PATTERN.test(String(releaseCommit || ""))) {
    throw new Error("release_commit_invalid");
  }
  if (!isIsoTime(recordedAt)) throw new Error("recorded_at_invalid");
  validateStateShape(state);
  const snapshotHash = stableHash(state);
  const planHash = stableHash({
    version: RECEIPT_VERSION,
    projectId: PROJECT_ID,
    releaseCommit,
    snapshotHash
  });
  return Object.freeze({
    version: RECEIPT_VERSION,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    releaseCommit,
    recordedAt,
    snapshotHash,
    planHash,
    state
  });
}

function validateReceipt(receipt, { releaseCommit, planHash = "" } = {}) {
  assertExactKeys(
    receipt,
    [
      "version",
      "projectId",
      "projectNumber",
      "region",
      "releaseCommit",
      "recordedAt",
      "snapshotHash",
      "planHash",
      "state"
    ],
    "pre_release_receipt_shape_invalid"
  );
  if (
    receipt.version !== RECEIPT_VERSION
    || receipt.projectId !== PROJECT_ID
    || receipt.projectNumber !== PROJECT_NUMBER
    || receipt.region !== REGION
    || receipt.releaseCommit !== releaseCommit
    || !isIsoTime(receipt.recordedAt)
    || !HASH_PATTERN.test(receipt.snapshotHash)
    || !HASH_PATTERN.test(receipt.planHash)
    || stableHash(receipt.state) !== receipt.snapshotHash
  ) {
    throw new Error("pre_release_receipt_invalid");
  }
  validateStateShape(receipt.state);
  const expectedPlanHash = stableHash({
    version: RECEIPT_VERSION,
    projectId: PROJECT_ID,
    releaseCommit,
    snapshotHash: receipt.snapshotHash
  });
  if (
    expectedPlanHash !== receipt.planHash
    || (planHash && receipt.planHash !== planHash)
  ) {
    throw new Error("pre_release_receipt_plan_hash_mismatch");
  }
  return receipt;
}

function receiptDirectory(env = process.env) {
  const explicit = String(
    env.CFSB_QUESTIONNAIRE_ROLLBACK_DIR || ""
  ).trim();
  const base = explicit || path.join(
    String(env.LOCALAPPDATA || "").trim(),
    "CFSB",
    "questionnaire-release"
  );
  if (!base || !path.isAbsolute(base)) {
    throw new Error("rollback_receipt_directory_invalid");
  }
  return path.resolve(base);
}

function receiptPath(releaseCommit, env = process.env) {
  if (!RELEASE_COMMIT_PATTERN.test(String(releaseCommit || ""))) {
    throw new Error("release_commit_invalid");
  }
  return path.join(
    receiptDirectory(env),
    `pre-release-state-${releaseCommit}.receipt.json`
  );
}

function readReceipt(releaseCommit, env = process.env) {
  let receipt;
  try {
    receipt = JSON.parse(
      fs.readFileSync(receiptPath(releaseCommit, env), "utf8")
    );
  } catch (_) {
    throw new Error("pre_release_receipt_missing");
  }
  return validateReceipt(receipt, { releaseCommit });
}

function writeReceipt(receipt, env = process.env) {
  validateReceipt(receipt, {
    releaseCommit: receipt?.releaseCommit,
    planHash: receipt?.planHash
  });
  const target = receiptPath(receipt.releaseCommit, env);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  return target;
}

function functionTargetsForScopes(receipt, scopes) {
  const scopeSet = new Set(scopes);
  return receipt.state.functions.filter((entry) =>
    (scopeSet.has("a2") && entry.releaseScope === "A2")
    || (scopeSet.has("a3") && entry.releaseScope === "A3")
  );
}

function buildRollbackPlan(receipt, scopes) {
  validateReceipt(receipt, {
    releaseCommit: receipt.releaseCommit,
    planHash: receipt.planHash
  });
  const scopeSet = new Set(scopes);
  if (
    scopeSet.size === 0
    || [...scopeSet].some(
      (scope) => !["hosting", "rules", "a2", "a3"].includes(scope)
    )
  ) {
    throw new Error("rollback_scope_invalid");
  }
  const functions = functionTargetsForScopes(receipt, scopes).map((entry) => ({
    functionId: entry.functionId,
    releaseScope: entry.releaseScope,
    service: entry.service,
    revision: entry.serviceRevision,
    revisionName: entry.revisionName,
    revisionContainerImagesHash: entry.revisionContainerImagesHash
  }));
  return Object.freeze({
    projectId: PROJECT_ID,
    region: REGION,
    releaseCommit: receipt.releaseCommit,
    planHash: receipt.planHash,
    scopes: [...scopeSet].sort(),
    hosting: scopeSet.has("hosting")
      ? {
          siteId: SITE_ID,
          channelId: LIVE_CHANNEL_ID,
          versionName: receipt.state.hosting.versionName
        }
      : null,
    firestoreRules: scopeSet.has("rules")
      ? {
          releaseName: receipt.state.firestoreRules.releaseName,
          rulesetName: receipt.state.firestoreRules.rulesetName
        }
      : null,
    functions,
    a3AdditiveRemoval: scopeSet.has("a3")
      ? { ...receipt.state.a3AdditiveAbsence }
      : null
  });
}

function safeError(error) {
  const code = String(error?.message || "");
  return /^[a-z0-9_]+$/.test(code) ? code : "unexpected_error";
}

module.exports = {
  A2_FUNCTION_IDS,
  A3_ADDITIVE_FUNCTION_ID,
  A3_ADDITIVE_FUNCTION_NAME,
  A3_ADDITIVE_SCHEDULER_JOB_NAME,
  A3_ADDITIVE_SCHEDULER_URI,
  A3_FUNCTION_IDS,
  FIRESTORE_RELEASE_NAME,
  LIVE_CHANNEL_ID,
  PROJECT_ID,
  PROJECT_NUMBER,
  RECEIPT_VERSION,
  REGION,
  SITE_ID,
  SNAPSHOT_FUNCTIONS,
  buildReceipt,
  buildRollbackPlan,
  buildState,
  canonicalize,
  functionTargetsForScopes,
  isIsoTime,
  normalizeResourceName,
  parseRollbackArgs,
  parseSealArgs,
  readReceipt,
  receiptDirectory,
  receiptPath,
  safeError,
  sealA3AdditiveAbsence,
  sanitizeFunction,
  sanitizeHosting,
  sanitizeRules,
  sanitizeSchedulerIndex,
  stableHash,
  stableJson,
  validateA3AdditiveLivePair,
  validateStateShape,
  validateReceipt,
  writeReceipt
};
