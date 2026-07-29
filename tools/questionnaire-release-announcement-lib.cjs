"use strict";

const crypto = require("node:crypto");

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const DATABASE_ID = "(default)";
const CONTROL_COLLECTION = "questionnaireReleaseAnnouncementControls";
const ANNOUNCEMENT_COLLECTION = "announcements";
const SYSTEM_ACTOR_UID = "system:questionnaire-release-announcements";
const SHA_40_PATTERN = /^[a-f0-9]{40}$/;
const SHA_64_PATTERN = /^[a-f0-9]{64}$/;
const MODES = Object.freeze([
  "maintenance-preview",
  "maintenance-execute",
  "maintenance-verify",
  "resume-preview",
  "resume-execute",
  "resume-verify"
]);

class QuestionnaireReleaseAnnouncementError extends Error {
  constructor(code) {
    super(String(code || "questionnaire_release_announcement_error"));
    this.name = "QuestionnaireReleaseAnnouncementError";
    this.code = String(code || "questionnaire_release_announcement_error");
  }
}

function fail(code) {
  throw new QuestionnaireReleaseAnnouncementError(code);
}

function clean(value) {
  return String(value ?? "").trim();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function assertReleaseCommit(value) {
  const releaseCommit = clean(value).toLowerCase();
  if (!SHA_40_PATTERN.test(releaseCommit)) fail("release_commit_invalid");
  return releaseCommit;
}

function assertPlanHash(value, code = "plan_hash_invalid") {
  const planHash = clean(value).toLowerCase();
  if (!SHA_64_PATTERN.test(planHash)) fail(code);
  return planHash;
}

function parseArgs(argv = []) {
  let releaseCommit = "";
  let mode = "";
  for (const raw of argv) {
    const argument = clean(raw);
    if (argument.startsWith("--release-commit=")) {
      if (releaseCommit) fail("release_commit_repeated");
      releaseCommit = assertReleaseCommit(
        argument.slice("--release-commit=".length)
      );
      continue;
    }
    if (argument.startsWith("--") && MODES.includes(argument.slice(2))) {
      if (mode) fail("mode_repeated");
      mode = argument.slice(2);
      continue;
    }
    fail("argument_unknown");
  }
  if (!releaseCommit) fail("release_commit_missing");
  if (!mode) fail("mode_missing");
  return Object.freeze({ releaseCommit, mode });
}

function verifyExecutionAuthority(options, planHash, env = process.env) {
  const releaseCommit = assertReleaseCommit(options?.releaseCommit);
  const mode = clean(options?.mode);
  if (!["maintenance-execute", "resume-execute"].includes(mode)) {
    return Object.freeze({ authorized: false, readOnly: true });
  }

  const isResume = mode === "resume-execute";
  const goName = isResume
    ? "CFSB_QUESTIONNAIRE_RESUME_GO"
    : "CFSB_QUESTIONNAIRE_MAINTENANCE_GO";
  const planName = isResume
    ? "CFSB_QUESTIONNAIRE_RESUME_PLAN_HASH"
    : "CFSB_QUESTIONNAIRE_MAINTENANCE_PLAN_HASH";
  if (clean(env[goName]).toLowerCase() !== releaseCommit) {
    fail(isResume ? "resume_go_missing" : "maintenance_go_missing");
  }
  const expectedPlanHash = assertPlanHash(
    env[planName],
    isResume ? "resume_plan_hash_missing" : "maintenance_plan_hash_missing"
  );
  if (expectedPlanHash !== assertPlanHash(planHash)) {
    fail(isResume
      ? "resume_plan_hash_mismatch"
      : "maintenance_plan_hash_mismatch");
  }
  if (
    isResume
    && clean(env.CFSB_QUESTIONNAIRE_LIVE_PASS_SHA).toLowerCase()
      !== releaseCommit
  ) {
    fail("live_pass_proof_missing");
  }
  return Object.freeze({ authorized: true, readOnly: false });
}

function documentRoot() {
  return `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
}

function releaseIds(releaseCommitInput) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  return Object.freeze({
    controlId: `questionnaire_release_${releaseCommit}`,
    maintenanceId: `questionnaire_maintenance_${releaseCommit}`,
    resumeId: `questionnaire_resume_${releaseCommit}`
  });
}

function documentNames(releaseCommitInput) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  const ids = releaseIds(releaseCommit);
  const root = documentRoot();
  return Object.freeze({
    control: `${root}/${CONTROL_COLLECTION}/${ids.controlId}`,
    maintenance:
      `${root}/${ANNOUNCEMENT_COLLECTION}/${ids.maintenanceId}`,
    resume: `${root}/${ANNOUNCEMENT_COLLECTION}/${ids.resumeId}`
  });
}

function maintenanceAnnouncement(releaseCommitInput) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  return Object.freeze({
    title: "Questionnaires — pause temporaire des envois",
    message:
      "Une maintenance des questionnaires est en cours. N’envoie aucun nouveau questionnaire et ne demande pas aux membres d’en soumettre jusqu’à l’avis de reprise. Les liens existants restent accessibles autant que possible afin de préserver la continuité.",
    items: Object.freeze([
      "N’utilise pas le bouton Envoyer et n’ajoute pas de tag d’envoi GHL pendant la pause.",
      "Ne demande pas à un membre de remplir ou de soumettre un questionnaire avant l’avis de reprise.",
      "Les liens peuvent rester accessibles, mais aucune nouvelle soumission ne doit être sollicitée."
    ]),
    importance: "critical",
    audience: "coaches",
    status: "published",
    versionTag: `questionnaire-maintenance-${releaseCommit.slice(0, 12)}`,
    expiresOn: "",
    releaseCommit,
    announcementKind: "questionnaire_maintenance",
    createdByUid: SYSTEM_ACTOR_UID,
    createdByEmail: ""
  });
}

function resumeAnnouncement(releaseCommitInput) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  return Object.freeze({
    title: "Questionnaires — reprise confirmée",
    message:
      "Une soumission live a été enregistrée et vérifiée pour cette release. Les coachs peuvent recommencer à envoyer des questionnaires et à demander aux membres de les remplir.",
    items: Object.freeze([
      "Les envois manuels et planifiés peuvent reprendre selon les consignes habituelles.",
      "Si une réponse ne se rattache pas au bon membre, utilise la file de validation et avise l’administration."
    ]),
    importance: "important",
    audience: "coaches",
    status: "published",
    versionTag: `questionnaire-resume-${releaseCommit.slice(0, 12)}`,
    expiresOn: "",
    releaseCommit,
    announcementKind: "questionnaire_resume",
    livePassVerified: true,
    livePassReleaseCommit: releaseCommit,
    createdByUid: SYSTEM_ACTOR_UID,
    createdByEmail: ""
  });
}

function controlValue(releaseCommitInput, phase) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  const ids = releaseIds(releaseCommit);
  const resumed = phase === "resume_published";
  if (!resumed && phase !== "maintenance_published") {
    fail("control_phase_invalid");
  }
  return {
    releaseCommit,
    phase,
    maintenanceAnnouncementId: ids.maintenanceId,
    resumeAnnouncementId: ids.resumeId,
    livePassVerified: resumed,
    livePassReleaseCommit: resumed ? releaseCommit : ""
  };
}

function encodeFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("firestore_number_invalid");
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (value && typeof value === "object") {
    return { mapValue: { fields: encodeFirestoreFields(value) } };
  }
  fail("firestore_value_unsupported");
}

function encodeFirestoreFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("firestore_fields_invalid");
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, encodeFirestoreValue(item)])
  );
}

function decodeFirestoreValue(value = {}) {
  if (Object.hasOwn(value, "nullValue")) return null;
  if (Object.hasOwn(value, "booleanValue")) return value.booleanValue === true;
  if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if (Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.hasOwn(value, "timestampValue")) return clean(value.timestampValue);
  if (Object.hasOwn(value, "stringValue")) return clean(value.stringValue);
  if (value.arrayValue) {
    return (value.arrayValue.values || []).map(decodeFirestoreValue);
  }
  if (value.mapValue) {
    return decodeFirestoreFields(value.mapValue.fields || {});
  }
  fail("firestore_value_invalid");
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

function requestTime(fieldPath) {
  return { fieldPath, setToServerValue: "REQUEST_TIME" };
}

function createWrite(name, value, timestampFields = []) {
  return {
    update: { name, fields: encodeFirestoreFields(value) },
    currentDocument: { exists: false },
    ...(timestampFields.length
      ? { updateTransforms: timestampFields.map(requestTime) }
      : {})
  };
}

function patchWrite(name, value, updateTime, timestampFields = []) {
  const observedUpdateTime = clean(updateTime);
  if (!observedUpdateTime) fail("observed_update_time_missing");
  return {
    update: { name, fields: encodeFirestoreFields(value) },
    updateMask: { fieldPaths: Object.keys(value).sort() },
    currentDocument: { updateTime: observedUpdateTime },
    ...(timestampFields.length
      ? { updateTransforms: timestampFields.map(requestTime) }
      : {})
  };
}

function observedState(state, names) {
  return Object.freeze(
    ["control", "maintenance", "resume"].map((key) => {
      const document = state?.[key] || null;
      return Object.freeze({
        key,
        name: names[key],
        exists: Boolean(document),
        updateTime: document ? clean(document.updateTime) : ""
      });
    })
  );
}

function makePlan({
  operation,
  releaseCommit,
  state,
  writes
}) {
  const names = documentNames(releaseCommit);
  const ids = releaseIds(releaseCommit);
  const core = {
    operation,
    releaseCommit: assertReleaseCommit(releaseCommit),
    projectId: PROJECT_ID,
    databaseId: DATABASE_ID,
    ids,
    observed: observedState(state, names),
    writes
  };
  return Object.freeze({
    ...core,
    planHash: sha256Hex(stableJson(core))
  });
}

function assertDocument(document, expectedName, code) {
  if (
    !document
    || typeof document !== "object"
    || Array.isArray(document)
    || document.name !== expectedName
    || !clean(document.updateTime)
    || !document.value
    || typeof document.value !== "object"
    || Array.isArray(document.value)
  ) {
    fail(code);
  }
  return document;
}

function assertEqual(actual, expected, code) {
  if (stableJson(actual) !== stableJson(expected)) fail(code);
}

function assertTimestamp(value, code) {
  if (!Number.isFinite(new Date(clean(value)).getTime())) fail(code);
}

function validateAnnouncementDocument(
  document,
  expectedName,
  expectedAnnouncement,
  { archived = false } = {}
) {
  const value = assertDocument(
    document,
    expectedName,
    archived
      ? "maintenance_announcement_invalid"
      : "announcement_document_invalid"
  ).value;
  for (const [key, expected] of Object.entries(expectedAnnouncement)) {
    assertEqual(
      value[key],
      archived && key === "status" ? "archived" : expected,
      archived
        ? "maintenance_announcement_mismatch"
        : "announcement_document_mismatch"
    );
  }
  assertTimestamp(value.createdAt, "announcement_created_at_invalid");
  assertTimestamp(value.publishedAt, "announcement_published_at_invalid");
  assertTimestamp(value.updatedAt, "announcement_updated_at_invalid");
  if (archived) {
    if (
      value.status !== "archived"
      || value.archivedByUid !== SYSTEM_ACTOR_UID
      || value.archivedByEmail !== ""
    ) {
      fail("maintenance_archive_mismatch");
    }
    assertTimestamp(value.archivedAt, "maintenance_archived_at_invalid");
  } else if (
    value.status !== "published"
    || value.archivedAt
    || value.archivedByUid
    || value.archivedByEmail
  ) {
    fail("published_announcement_state_invalid");
  }
  return value;
}

function validateControlDocument(
  document,
  expectedName,
  releaseCommit,
  phase
) {
  const value = assertDocument(
    document,
    expectedName,
    "announcement_control_invalid"
  ).value;
  const expected = controlValue(releaseCommit, phase);
  for (const [key, expectedValue] of Object.entries(expected)) {
    assertEqual(
      value[key],
      expectedValue,
      "announcement_control_mismatch"
    );
  }
  assertTimestamp(value.createdAt, "announcement_control_created_at_invalid");
  assertTimestamp(value.updatedAt, "announcement_control_updated_at_invalid");
  return value;
}

function validateMaintenancePreState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    fail("maintenance_pre_state_invalid");
  }
  if (state.control) fail("maintenance_control_already_exists");
  if (state.maintenance) fail("maintenance_announcement_already_exists");
  if (state.resume) fail("resume_announcement_already_exists");
}

function validateMaintenanceState(state, releaseCommitInput) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  const names = documentNames(releaseCommit);
  validateControlDocument(
    state?.control,
    names.control,
    releaseCommit,
    "maintenance_published"
  );
  validateAnnouncementDocument(
    state?.maintenance,
    names.maintenance,
    maintenanceAnnouncement(releaseCommit)
  );
  if (state?.resume) fail("resume_announcement_exists_during_maintenance");
  return Object.freeze({
    phase: "maintenance_published",
    maintenancePublished: true,
    resumePublished: false
  });
}

function validateResumePreState(state, releaseCommitInput) {
  validateMaintenanceState(state, releaseCommitInput);
}

function validateResumeState(state, releaseCommitInput) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  const names = documentNames(releaseCommit);
  validateControlDocument(
    state?.control,
    names.control,
    releaseCommit,
    "resume_published"
  );
  validateAnnouncementDocument(
    state?.maintenance,
    names.maintenance,
    maintenanceAnnouncement(releaseCommit),
    { archived: true }
  );
  validateAnnouncementDocument(
    state?.resume,
    names.resume,
    resumeAnnouncement(releaseCommit)
  );
  return Object.freeze({
    phase: "resume_published",
    maintenanceArchived: true,
    resumePublished: true,
    livePassReleaseCommit: releaseCommit
  });
}

function buildMaintenancePlan(state, releaseCommitInput) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  validateMaintenancePreState(state);
  const names = documentNames(releaseCommit);
  const writes = [
    createWrite(
      names.control,
      controlValue(releaseCommit, "maintenance_published"),
      ["createdAt", "updatedAt"]
    ),
    createWrite(
      names.maintenance,
      maintenanceAnnouncement(releaseCommit),
      ["createdAt", "publishedAt", "updatedAt"]
    )
  ];
  return makePlan({
    operation: "publish_maintenance",
    releaseCommit,
    state,
    writes
  });
}

function buildResumePlan(state, releaseCommitInput) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  validateResumePreState(state, releaseCommit);
  const names = documentNames(releaseCommit);
  const writes = [
    patchWrite(
      names.control,
      {
        phase: "resume_published",
        livePassVerified: true,
        livePassReleaseCommit: releaseCommit
      },
      state.control.updateTime,
      ["updatedAt"]
    ),
    patchWrite(
      names.maintenance,
      {
        status: "archived",
        archivedByUid: SYSTEM_ACTOR_UID,
        archivedByEmail: ""
      },
      state.maintenance.updateTime,
      ["archivedAt", "updatedAt"]
    ),
    createWrite(
      names.resume,
      resumeAnnouncement(releaseCommit),
      ["createdAt", "publishedAt", "updatedAt"]
    )
  ];
  return makePlan({
    operation: "publish_resume",
    releaseCommit,
    state,
    writes
  });
}

function safeErrorCode(error) {
  if (error instanceof QuestionnaireReleaseAnnouncementError) {
    return error.code;
  }
  return "unexpected_error";
}

module.exports = {
  ANNOUNCEMENT_COLLECTION,
  CONTROL_COLLECTION,
  DATABASE_ID,
  MODES,
  PROJECT_ID,
  QuestionnaireReleaseAnnouncementError,
  SYSTEM_ACTOR_UID,
  buildMaintenancePlan,
  buildResumePlan,
  decodeFirestoreFields,
  documentNames,
  encodeFirestoreFields,
  maintenanceAnnouncement,
  parseArgs,
  releaseIds,
  resumeAnnouncement,
  safeErrorCode,
  sha256Hex,
  stableJson,
  validateMaintenancePreState,
  validateMaintenanceState,
  validateResumePreState,
  validateResumeState,
  verifyExecutionAuthority
};
