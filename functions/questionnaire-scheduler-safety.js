"use strict";

const CANARY_SOURCE = "questionnaire_scheduler_canary";
const TARGET_PREFIX = "system_questionnaire_canary_";
const SCHEDULE_PREFIX = "system_questionnaire_schedule_canary_";
const GHL_ADD_TAGS_RESPONSE_PROOF = "ghl_add_tags_response_v1";
const EXPECTED_JOB_NAME =
  "projects/cfsb-dashboard-coach-aa9a4/locations/us-central1/jobs/"
  + "firebase-schedule-scheduledQuestionnaireSendPlans-us-central1";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function releaseCommit(value) {
  const commit = clean(value).toLowerCase();
  return /^[a-f0-9]{40}$/.test(commit) ? commit : "";
}

function controlNonce(value) {
  const nonce = clean(value).toLowerCase();
  return /^[a-f0-9]{32}$/.test(nonce) ? nonce : "";
}

function armedUntil(value, nowMs = Date.now()) {
  const date = new Date(clean(value));
  const timestamp = date.getTime();
  if (
    !Number.isFinite(timestamp)
    || timestamp <= nowMs
    || timestamp > nowMs + (30 * 60 * 1000)
  ) {
    return "";
  }
  return date.toISOString();
}

function controlAvailable({
  control = {},
  event = {},
  nowMs = Date.now()
} = {}) {
  const commit = releaseCommit(control.canaryReleaseCommit);
  const cleanArmedUntil = armedUntil(control.armedUntil, nowMs);
  const mode = clean(control.mode);
  const nonce = controlNonce(control.nonce);
  const eventJobName = clean(event?.jobName);
  const jobLeaf = EXPECTED_JOB_NAME.split("/").pop();
  if (!commit || !cleanArmedUntil || !nonce) return null;
  if (clean(control.source) !== CANARY_SOURCE) return null;
  if (control.questionnaireCanaryOnly !== true) return null;
  if (!["empty", "positive"].includes(mode)) return null;
  if (clean(control.expectedJobName) !== EXPECTED_JOB_NAME) return null;
  if (
    eventJobName !== EXPECTED_JOB_NAME
    && eventJobName !== jobLeaf
    && !eventJobName.endsWith(`/jobs/${jobLeaf}`)
  ) {
    return null;
  }
  const expectedScheduleId = clean(control.expectedScheduleId);
  if (mode === "empty" && expectedScheduleId) return null;
  if (
    mode === "positive"
    && expectedScheduleId !== `${SCHEDULE_PREFIX}${commit.slice(0, 12)}`
  ) {
    return null;
  }
  return Object.freeze({
    releaseCommit: commit,
    armedUntil: cleanArmedUntil,
    mode,
    expectedScheduleId,
    nonce
  });
}

function controlAllowsSnapshot({ control = null, docs = [] } = {}) {
  if (!control || !Array.isArray(docs)) return false;
  if (control.mode === "empty") return docs.length === 0;
  if (control.mode !== "positive") return false;
  if (docs.length === 0) return true;
  return docs.length === 1 && clean(docs[0]?.id) === control.expectedScheduleId;
}

function controlDecision({
  exists = false,
  control = {},
  event = {},
  docs = [],
  nowMs = Date.now()
} = {}) {
  if (!exists) {
    return Object.freeze({
      blocked: false,
      reason: "control_absent",
      control: null
    });
  }
  const available = controlAvailable({ control, event, nowMs });
  if (!available) {
    return Object.freeze({
      blocked: true,
      reason: "control_invalid",
      control: null
    });
  }
  if (!controlAllowsSnapshot({ control: available, docs })) {
    return Object.freeze({
      blocked: true,
      reason: "snapshot_mismatch",
      control: available
    });
  }
  return Object.freeze({
    blocked: false,
    reason: "canary_allowed",
    control: available
  });
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^\d{10}$/.test(normalized) ? normalized : "";
}

function validGhlAddTagsReceipt(value, expectedTag) {
  const tag = clean(expectedTag);
  return Boolean(
    tag
    && value
    && typeof value === "object"
    && !Array.isArray(value)
    && value.status === 201
    && value.body
    && typeof value.body === "object"
    && !Array.isArray(value.body)
    && Array.isArray(value.body.tags)
    && value.body.tags.some((entry) => clean(entry) === tag)
  );
}

function scheduleQueueContract(schedule = {}) {
  return JSON.stringify([
    clean(schedule.status),
    clean(schedule.nextSendAt),
    clean(schedule.clientId),
    clean(schedule.clientName),
    normalizePhone(schedule.clientPhoneNormalized),
    clean(schedule.coachId),
    clean(schedule.coachRxId),
    clean(schedule.coachName),
    clean(schedule.questionnaireType),
    clean(schedule.formId),
    clean(schedule.frequency),
    clean(schedule.requestedByUid),
    clean(schedule.requestedByEmail),
    clean(schedule.source),
    schedule.questionnaireCanaryOnly === true,
    clean(schedule.canaryReleaseCommit).toLowerCase(),
    clean(schedule.armedUntil)
  ]);
}

async function queueScheduleSendAtomically({
  db,
  scheduleRef,
  sendRef,
  expectedSchedule = {},
  today = "",
  sendData = {},
  schedulePatch = {}
} = {}) {
  if (!db || typeof db.runTransaction !== "function") {
    throw new TypeError("db.runTransaction is required");
  }
  const expectedContract = scheduleQueueContract(expectedSchedule);
  return db.runTransaction(async (transaction) => {
    const currentScheduleSnap = await transaction.get(scheduleRef);
    if (!currentScheduleSnap.exists) return { queued: false, reason: "schedule_missing" };
    const currentSchedule = currentScheduleSnap.data() || {};
    if (
      clean(currentSchedule.status) !== "active"
      || !/^\d{4}-\d{2}-\d{2}$/.test(clean(currentSchedule.nextSendAt))
      || clean(currentSchedule.nextSendAt) > clean(today)
      || scheduleQueueContract(currentSchedule) !== expectedContract
    ) {
      return { queued: false, reason: "schedule_changed" };
    }
    const currentSendSnap = await transaction.get(sendRef);
    if (currentSendSnap.exists) {
      transaction.set(scheduleRef, schedulePatch, { merge: true });
      return { queued: false, reason: "send_exists" };
    }
    transaction.create(sendRef, sendData);
    transaction.set(scheduleRef, schedulePatch, { merge: true });
    return { queued: true, reason: "created" };
  });
}

function todayTorontoIsoDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

module.exports = {
  CANARY_SOURCE,
  EXPECTED_JOB_NAME,
  GHL_ADD_TAGS_RESPONSE_PROOF,
  SCHEDULE_PREFIX,
  TARGET_PREFIX,
  armedUntil,
  controlAllowsSnapshot,
  controlAvailable,
  controlDecision,
  controlNonce,
  queueScheduleSendAtomically,
  releaseCommit,
  scheduleQueueContract,
  todayTorontoIsoDate,
  validGhlAddTagsReceipt
};
