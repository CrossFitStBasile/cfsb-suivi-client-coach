"use strict";

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const REGION = "us-central1";
const FUNCTION_ID = "scheduledQuestionnaireSendPlans";
const CANARY_SOURCE = "questionnaire_scheduler_canary";
const TARGET_PREFIX = "system_questionnaire_canary_";
const SCHEDULE_PREFIX = "system_questionnaire_schedule_canary_";
const PROCESS_SEND_PREFIX = "system_questionnaire_process_canary_";
const CONTROL_COLLECTION = "questionnaireSchedulerCanaryControls";
const CONTROL_ID = "release";
const LEGACY_QUESTIONNAIRE_TYPE = "suivi_global";
const LEGACY_GHL_TAG = "dashboardcoach";
const PROCESS_QUESTIONNAIRE_TYPE = "habitudes_quotidiennes";
const PROCESS_GHL_TAG = "suiviregulier";
const EVALUATION_GHL_TAG = "evaluationnutrition";
const HISTORICAL_GHL_TAGS = Object.freeze([
  LEGACY_GHL_TAG,
  PROCESS_GHL_TAG,
  EVALUATION_GHL_TAG
]);
const SYNTHETIC_CONTACT_MARKER_TAG = "cfsb-questionnaire-internal-canary";
const MAX_ARMING_MS = 30 * 60 * 1000;
const CONTROL_NONCE_PATTERN = /^[a-f0-9]{32}$/;
const EXPECTED_SCHEDULER_JOB_NAME =
  `projects/${PROJECT_ID}/locations/${REGION}/jobs/firebase-schedule-${FUNCTION_ID}-${REGION}`;

class CanaryError extends Error {
  constructor(code) {
    super(code);
    this.name = "CanaryError";
    this.code = String(code || "canary_error");
  }
}

function assertReleaseCommit(value) {
  const commit = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new CanaryError("release_commit_invalid");
  return commit;
}

function canaryIds(releaseCommit) {
  const commit = assertReleaseCommit(releaseCommit);
  const suffix = commit.slice(0, 12);
  return Object.freeze({
    targetId: `${TARGET_PREFIX}${suffix}`,
    scheduleId: `${SCHEDULE_PREFIX}${suffix}`
  });
}

function processCanarySendId(releaseCommit) {
  const commit = assertReleaseCommit(releaseCommit);
  return `${PROCESS_SEND_PREFIX}${commit.slice(0, 12)}`;
}

function parseArgs(argv = []) {
  let mode = "preview";
  let releaseCommit = "";
  const seenModes = new Set();
  for (const raw of argv) {
    const arg = String(raw || "");
    if (arg.startsWith("--release-commit=")) {
      if (releaseCommit) throw new CanaryError("release_commit_repeated");
      releaseCommit = assertReleaseCommit(arg.slice("--release-commit=".length));
      continue;
    }
    if ([
      "--preview",
      "--provision-contact",
      "--pin-contact",
      "--execute-process",
      "--execute-empty",
      "--execute-positive",
      "--cleanup"
    ].includes(arg)) {
      seenModes.add(arg);
      mode = arg.slice(2);
      continue;
    }
    throw new CanaryError("argument_unknown");
  }
  if (seenModes.size > 1) throw new CanaryError("mode_conflict");
  if (!releaseCommit) throw new CanaryError("release_commit_missing");
  return Object.freeze({ mode, releaseCommit });
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^\d{10}$/.test(normalized) ? normalized : "";
}

function reservedSyntheticPhone(value) {
  return /^\d{3}55501\d{2}$/.test(normalizePhone(value));
}

function buildContactProvisionClaim({
  releaseCommit,
  locationId,
  phone,
  createdAt
}) {
  const commit = assertReleaseCommit(releaseCommit);
  const cleanLocationId = String(locationId || "").trim();
  const cleanPhone = normalizePhone(phone);
  const createdAtDate = new Date(String(createdAt || ""));
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(cleanLocationId)) {
    throw new CanaryError("provision_claim_location_invalid");
  }
  if (!reservedSyntheticPhone(cleanPhone)) {
    throw new CanaryError("provision_claim_phone_invalid");
  }
  if (
    !Number.isFinite(createdAtDate.getTime())
    || createdAtDate.getTime() > Date.now() + (5 * 60 * 1000)
  ) {
    throw new CanaryError("provision_claim_time_invalid");
  }
  return Object.freeze({
    source: CANARY_SOURCE,
    purpose: "ghl_contact_provision",
    releaseCommit: commit,
    locationId: cleanLocationId,
    phone: cleanPhone,
    createdAt: createdAtDate.toISOString()
  });
}

function validContactProvisionClaim(value, { locationId, phone }) {
  try {
    const normalized = buildContactProvisionClaim({
      releaseCommit: value?.releaseCommit,
      locationId: value?.locationId,
      phone: value?.phone,
      createdAt: value?.createdAt
    });
    return value?.source === CANARY_SOURCE
      && value?.purpose === "ghl_contact_provision"
      && normalized.locationId === String(locationId || "").trim()
      && normalized.phone === normalizePhone(phone);
  } catch (_) {
    return false;
  }
}

async function acquireSharedContactProvisionClaim({
  claim,
  createClaim,
  readClaim
}) {
  if (
    !claim
    || typeof createClaim !== "function"
    || typeof readClaim !== "function"
    || !validContactProvisionClaim(claim, claim)
  ) {
    throw new CanaryError("provision_claim_contract_invalid");
  }
  try {
    const created = await createClaim(claim);
    if (!validContactProvisionClaim(created || claim, claim)) {
      throw new CanaryError("provision_claim_create_response_invalid");
    }
    return Object.freeze({ acquired: true, claim });
  } catch (_) {
    let existing = null;
    try {
      existing = await readClaim();
    } catch (_) {
      throw new CanaryError("provision_claim_unresolved");
    }
    if (!validContactProvisionClaim(existing, claim)) {
      throw new CanaryError("provision_claim_unresolved");
    }
    return Object.freeze({ acquired: false, claim: existing });
  }
}

function parseGhlContactSearchPage(data) {
  const contacts = Array.isArray(data?.contacts) ? data.contacts : null;
  const declaredTotals = [
    data?.meta?.total,
    data?.total,
    data?.count
  ].filter((value) => value !== undefined);
  const totals = declaredTotals.map((value) =>
    typeof value === "number" ? value : Number.NaN
  );
  const rawPagePointers = [data?.meta?.nextPage, data?.nextPage]
    .filter((value) => value !== undefined)
    .map((value) => value === null ? "" : value);
  const rawPageUrls = [data?.meta?.nextPageUrl, data?.nextPageUrl]
    .filter((value) => value !== undefined)
    .map((value) => value === null ? "" : value);
  const pagePointers = rawPagePointers.filter(Boolean);
  const pageUrls = rawPageUrls.filter(Boolean);
  if (
    !contacts
    || totals.length === 0
    || totals.some((value) => !Number.isSafeInteger(value) || value < 0)
    || totals.some((value) => value !== totals[0])
    || totals[0] > 100
    || contacts.length > 100
    || rawPagePointers.some(
      (value) => typeof value !== "string" || value !== value.trim()
    )
    || rawPageUrls.some(
      (value) => typeof value !== "string" || value !== value.trim()
    )
    || new Set(rawPagePointers).size > 1
    || new Set(rawPageUrls).size > 1
    || pageUrls.some((value) => value.length > 2_048)
  ) {
    throw new CanaryError("synthetic_contact_search_incomplete");
  }
  return Object.freeze({
    contacts,
    total: totals[0],
    nextPage: pagePointers[0] || "",
    nextPageUrl: pageUrls[0] || ""
  });
}

function validateGhlContactNextPageUrl(value, {
  searchParams,
  lastContactId
} = {}) {
  const expectedSearchParams = searchParams && typeof searchParams === "object"
    ? Object.fromEntries(
      Object.entries(searchParams).map(([key, item]) => [key, String(item)])
    )
    : null;
  const expectedKeys = expectedSearchParams
    ? Object.keys(expectedSearchParams).sort()
    : [];
  if (
    expectedKeys.join(",") !== "limit,locationId,query"
    || expectedSearchParams.limit !== "100"
    || Object.values(expectedSearchParams).some((item) => !item)
    || !/^[A-Za-z0-9]{20}$/.test(String(lastContactId || ""))
  ) {
    throw new CanaryError("synthetic_contact_search_incomplete");
  }

  const rawUrl = String(value || "");
  if (!rawUrl.startsWith(
    "https://services.leadconnectorhq.com/contacts/?"
  )) {
    throw new CanaryError("synthetic_contact_search_incomplete");
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch (_) {
    throw new CanaryError("synthetic_contact_search_incomplete");
  }
  const entries = [...url.searchParams.entries()];
  const keys = entries.map(([key]) => key);
  const requiredKeys = [
    "limit",
    "locationId",
    "query",
    "startAfter",
    "startAfterId"
  ];
  if (
    url.protocol !== "https:"
    || url.origin !== "https://services.leadconnectorhq.com"
    || url.pathname !== "/contacts/"
    || url.username
    || url.password
    || url.hash
    || entries.length !== requiredKeys.length
    || requiredKeys.some((key) => keys.filter((item) => item === key).length !== 1)
    || keys.some((key) => !requiredKeys.includes(key))
    || Object.entries(expectedSearchParams).some(
      ([key, expected]) => url.searchParams.get(key) !== expected
    )
    || !/^[1-9]\d{12}$/.test(url.searchParams.get("startAfter") || "")
    || url.searchParams.get("startAfterId") !== String(lastContactId)
  ) {
    throw new CanaryError("synthetic_contact_search_incomplete");
  }
  return Object.freeze({
    pathname: "/contacts/",
    searchParams: Object.freeze(Object.fromEntries(entries))
  });
}

function completeGhlContactSearch(data, { terminalPage } = {}) {
  const first = parseGhlContactSearchPage(data);
  const hasTerminalPage = terminalPage !== undefined;
  if (
    first.contacts.length !== first.total
    || first.nextPage
    || Boolean(first.nextPageUrl) !== hasTerminalPage
  ) {
    throw new CanaryError("synthetic_contact_search_incomplete");
  }
  if (hasTerminalPage) {
    const terminal = parseGhlContactSearchPage(terminalPage);
    if (
      terminal.contacts.length !== 0
      || terminal.total !== first.total
      || terminal.nextPage
      || terminal.nextPageUrl
    ) {
      throw new CanaryError("synthetic_contact_search_incomplete");
    }
  }
  return first.contacts;
}

async function collectCompleteGhlContactSearch(data, {
  searchParams,
  fetchTerminalPage
} = {}) {
  const first = parseGhlContactSearchPage(data);
  if (
    first.contacts.length !== first.total
    || first.nextPage
  ) {
    throw new CanaryError("synthetic_contact_search_incomplete");
  }
  const expectedLocationId = String(searchParams?.locationId || "");
  const contactIds = first.contacts.map((contact) => String(contact?.id || ""));
  if (
    !expectedLocationId
    || contactIds.some((id) => !/^[A-Za-z0-9]{20}$/.test(id))
    || new Set(contactIds).size !== contactIds.length
    || first.contacts.some(
      (contact) => String(contact?.locationId || "") !== expectedLocationId
    )
  ) {
    throw new CanaryError("synthetic_contact_search_incomplete");
  }
  if (!first.nextPageUrl) return completeGhlContactSearch(data);
  if (typeof fetchTerminalPage !== "function") {
    throw new CanaryError("synthetic_contact_search_incomplete");
  }
  const lastContactId = String(first.contacts.at(-1)?.id || "");
  const request = validateGhlContactNextPageUrl(first.nextPageUrl, {
    searchParams,
    lastContactId
  });
  const terminalPage = await fetchTerminalPage(request);
  return completeGhlContactSearch(data, { terminalPage });
}

function dashboardClientMatchesSyntheticIdentity(value = {}, {
  documentId = "",
  phone,
  contactId = ""
} = {}) {
  const expectedPhone = normalizePhone(phone);
  const expectedContactId = String(contactId || "").trim();
  if (!expectedPhone) return false;
  const phones = [
    value.phoneNormalized,
    value.clientPhoneNormalized,
    value.client_phone_normalized,
    value.phone,
    value.clientPhone,
    value.telephone,
    value.mobile,
    value.phoneNumber,
    value.phone_number
  ].map(normalizePhone).filter(Boolean);
  const contactIds = [
    documentId,
    value.ghlContactId,
    value.ghl_contact_id,
    value.ghlId,
    value.ghl_id,
    value.contactId,
    value.sourceClientId,
    value.source_client_id,
    value.clientId,
    value.coachRxLink?.sourceClientId
  ].map((entry) => String(entry || "").trim()).filter(Boolean);
  return phones.includes(expectedPhone)
    || (expectedContactId && contactIds.includes(expectedContactId));
}

function contactName(contact = {}) {
  return String(
    contact.contactName
    || contact.fullName
    || contact.name
    || [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    || ""
  ).trim();
}

function contactTags(contact = {}) {
  return (Array.isArray(contact.tags) ? contact.tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean);
}

function historicalGhlTagsAbsent(contact = {}) {
  const tags = contactTags(contact);
  return HISTORICAL_GHL_TAGS.every((tag) => !tags.includes(tag));
}

function explicitSyntheticContact(contact = {}, { requireDnd = true } = {}) {
  const id = String(contact.id || "").trim();
  const name = contactName(contact).toLowerCase();
  const tags = contactTags(contact);
  const syntheticPattern = /(?:^|[^a-z])(canary|test|qa)(?:[^a-z]|$)/i;
  const cfsbPurposeName =
    /(?:cfsb|crossfit[\s_-]*st[\s_-]*basile)/i.test(name)
    && /questionnaire/i.test(name)
    && syntheticPattern.test(name);
  return Boolean(
    /^[A-Za-z0-9_-]{8,80}$/.test(id)
    && cfsbPurposeName
    && tags.some((tag) => syntheticPattern.test(tag))
    && tags.includes(SYNTHETIC_CONTACT_MARKER_TAG)
    && (!requireDnd || contact.dnd === true)
    && reservedSyntheticPhone(contact.phone)
  );
}

function contactConfirmationFingerprint(contact = {}) {
  if (!explicitSyntheticContact(contact)) {
    throw new CanaryError("synthetic_contact_invalid");
  }
  const id = String(contact.id || "").trim();
  const phone = normalizePhone(contact.phone);
  return require("node:crypto")
    .createHash("sha256")
    .update(`${id}\n${phone}\n${SYNTHETIC_CONTACT_MARKER_TAG}`, "utf8")
    .digest("hex");
}

function selectUniqueSyntheticContact(contactSets = [], {
  targetTag = LEGACY_GHL_TAG
} = {}) {
  const cleanTargetTag = String(targetTag || "").trim().toLowerCase();
  if (!cleanTargetTag) throw new CanaryError("synthetic_target_tag_invalid");
  const byId = new Map();
  for (const contacts of contactSets) {
    for (const contact of Array.isArray(contacts) ? contacts : []) {
      const id = String(contact?.id || "").trim();
      if (id) byId.set(id, contact);
    }
  }
  const matches = [...byId.values()].filter(explicitSyntheticContact);
  if (matches.length !== 1) throw new CanaryError("synthetic_contact_not_unique");
  const contact = matches[0];
  if (contactTags(contact).includes(cleanTargetTag)) {
    throw new CanaryError("synthetic_contact_target_tag_already_present");
  }
  return contact;
}

function validArmedUntil(value, nowMs = Date.now()) {
  const date = new Date(String(value || ""));
  const armedUntilMs = date.getTime();
  if (
    !Number.isFinite(armedUntilMs)
    || armedUntilMs <= nowMs
    || armedUntilMs > nowMs + MAX_ARMING_MS
  ) {
    return "";
  }
  return date.toISOString();
}

function buildCanaryTarget({
  releaseCommit,
  armedUntil,
  expectedGhlContactId,
  phoneNormalized
}) {
  const commit = assertReleaseCommit(releaseCommit);
  const cleanArmedUntil = validArmedUntil(armedUntil);
  const contactId = String(expectedGhlContactId || "").trim();
  const phone = normalizePhone(phoneNormalized);
  if (!cleanArmedUntil) throw new CanaryError("armed_until_invalid");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(contactId)) throw new CanaryError("ghl_contact_id_invalid");
  if (!reservedSyntheticPhone(phone)) throw new CanaryError("synthetic_phone_not_reserved");
  return Object.freeze({
    source: CANARY_SOURCE,
    questionnaireCanaryOnly: true,
    entityType: "system",
    ownershipStatus: "canary",
    clientSelectable: false,
    status: "active",
    coachId: "admin",
    canaryReleaseCommit: commit,
    armedUntil: cleanArmedUntil,
    expectedGhlContactId: contactId,
    phoneNormalized: phone,
    name: "CFSB Questionnaire Canary"
  });
}

function buildCanarySchedule({
  releaseCommit,
  armedUntil,
  todayToronto,
  requestedByUid,
  requestedByEmail,
  phoneNormalized
}) {
  const commit = assertReleaseCommit(releaseCommit);
  const ids = canaryIds(commit);
  const cleanArmedUntil = validArmedUntil(armedUntil);
  const date = String(todayToronto || "").trim();
  const uid = String(requestedByUid || "").trim();
  const email = String(requestedByEmail || "").trim().toLowerCase();
  const phone = normalizePhone(phoneNormalized);
  if (!cleanArmedUntil) throw new CanaryError("armed_until_invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new CanaryError("today_toronto_invalid");
  if (!uid || !email) throw new CanaryError("admin_profile_invalid");
  if (!reservedSyntheticPhone(phone)) throw new CanaryError("synthetic_phone_not_reserved");
  return Object.freeze({
    source: CANARY_SOURCE,
    questionnaireCanaryOnly: true,
    canaryReleaseCommit: commit,
    armedUntil: cleanArmedUntil,
    clientId: ids.targetId,
    clientName: "CFSB Questionnaire Canary",
    clientPhoneNormalized: phone,
    coachId: "admin",
    coachRxId: "admin",
    coachName: "Admin",
    questionnaireType: LEGACY_QUESTIONNAIRE_TYPE,
    formId: "",
    frequency: "once",
    nextSendAt: date,
    status: "active",
    requestedByUid: uid,
    requestedByEmail: email
  });
}

function buildProcessCanarySend({
  releaseCommit,
  armedUntil,
  requestedByUid,
  requestedByEmail,
  phoneNormalized
}) {
  const commit = assertReleaseCommit(releaseCommit);
  const ids = canaryIds(commit);
  const cleanArmedUntil = validArmedUntil(armedUntil);
  const uid = String(requestedByUid || "").trim();
  const email = String(requestedByEmail || "").trim().toLowerCase();
  const phone = normalizePhone(phoneNormalized);
  if (!cleanArmedUntil) throw new CanaryError("armed_until_invalid");
  if (!uid || !email) throw new CanaryError("admin_profile_invalid");
  if (!reservedSyntheticPhone(phone)) throw new CanaryError("synthetic_phone_not_reserved");
  return Object.freeze({
    source: "dashboard_questionnaire_scheduled",
    questionnaireCanaryOnly: true,
    questionnaireCanarySource: CANARY_SOURCE,
    questionnaireCanaryMode: "process",
    canaryReleaseCommit: commit,
    armedUntil: cleanArmedUntil,
    clientId: ids.targetId,
    clientName: "CFSB Questionnaire Canary",
    clientPhoneNormalized: phone,
    coachId: "admin",
    coachRxId: "admin",
    coachName: "Admin",
    status: "pending",
    deliveryStatus: "firestore_queue_pending",
    errorMessage: "",
    questionnaireType: PROCESS_QUESTIONNAIRE_TYPE,
    formId: "",
    requestedByUid: uid,
    requestedByEmail: email,
    questionnaireScheduleId: "",
    scheduledFor: ""
  });
}

function buildCanaryControl({
  releaseCommit,
  armedUntil,
  mode,
  nonce
}) {
  const commit = assertReleaseCommit(releaseCommit);
  const cleanArmedUntil = validArmedUntil(armedUntil);
  const cleanMode = String(mode || "").trim();
  if (!cleanArmedUntil) throw new CanaryError("armed_until_invalid");
  if (!["empty", "positive"].includes(cleanMode)) {
    throw new CanaryError("canary_control_mode_invalid");
  }
  const cleanNonce = String(nonce || "").trim().toLowerCase();
  if (!CONTROL_NONCE_PATTERN.test(cleanNonce)) {
    throw new CanaryError("canary_control_nonce_invalid");
  }
  const ids = canaryIds(commit);
  return Object.freeze({
    source: CANARY_SOURCE,
    questionnaireCanaryOnly: true,
    canaryReleaseCommit: commit,
    armedUntil: cleanArmedUntil,
    mode: cleanMode,
    nonce: cleanNonce,
    expectedJobName: EXPECTED_SCHEDULER_JOB_NAME,
    expectedScheduleId: cleanMode === "positive" ? ids.scheduleId : ""
  });
}

function canaryControlOwnedForCleanup(value = {}, releaseCommit, mode, nonce = "") {
  const commit = assertReleaseCommit(releaseCommit);
  const cleanMode = String(mode || "").trim();
  const cleanNonce = String(nonce || value.nonce || "").trim().toLowerCase();
  const ids = canaryIds(commit);
  const armedUntilMs = new Date(String(value.armedUntil || "")).getTime();
  return value.source === CANARY_SOURCE
    && value.questionnaireCanaryOnly === true
    && value.canaryReleaseCommit === commit
    && value.mode === cleanMode
    && CONTROL_NONCE_PATTERN.test(cleanNonce)
    && value.nonce === cleanNonce
    && value.expectedJobName === EXPECTED_SCHEDULER_JOB_NAME
    && value.expectedScheduleId === (cleanMode === "positive" ? ids.scheduleId : "")
    && Number.isFinite(armedUntilMs);
}

function canaryControlActive(
  value = {},
  releaseCommit,
  mode,
  nonce,
  {
    nowMs = Date.now(),
    minimumTtlMs = 0
  } = {}
) {
  if (!canaryControlOwnedForCleanup(value, releaseCommit, mode, nonce)) return false;
  const armedUntilMs = new Date(String(value.armedUntil || "")).getTime();
  return armedUntilMs - nowMs >= Math.max(0, Number(minimumTtlMs) || 0)
    && armedUntilMs <= nowMs + MAX_ARMING_MS;
}

function canaryTargetMatches(value = {}, releaseCommit, nowMs = Date.now()) {
  const commit = assertReleaseCommit(releaseCommit);
  return value.source === CANARY_SOURCE
    && value.questionnaireCanaryOnly === true
    && value.entityType === "system"
    && value.ownershipStatus === "canary"
    && value.clientSelectable === false
    && value.status === "active"
    && value.coachId === "admin"
    && value.canaryReleaseCommit === commit
    && Boolean(validArmedUntil(value.armedUntil, nowMs))
    && /^[A-Za-z0-9_-]{8,80}$/.test(String(value.expectedGhlContactId || ""))
    && reservedSyntheticPhone(value.phoneNormalized);
}

function canaryTargetOwnedForCleanup(value = {}, releaseCommit) {
  const commit = assertReleaseCommit(releaseCommit);
  return value.source === CANARY_SOURCE
    && value.questionnaireCanaryOnly === true
    && value.entityType === "system"
    && value.ownershipStatus === "canary"
    && value.clientSelectable === false
    && ["active", "cancelled"].includes(value.status)
    && value.coachId === "admin"
    && value.canaryReleaseCommit === commit
    && value.name === "CFSB Questionnaire Canary"
    && /^[A-Za-z0-9_-]{8,80}$/.test(String(value.expectedGhlContactId || ""))
    && reservedSyntheticPhone(value.phoneNormalized);
}

function canaryScheduleMatches(value = {}, releaseCommit, todayToronto, nowMs = Date.now()) {
  const commit = assertReleaseCommit(releaseCommit);
  const ids = canaryIds(commit);
  return value.source === CANARY_SOURCE
    && value.questionnaireCanaryOnly === true
    && value.canaryReleaseCommit === commit
    && Boolean(validArmedUntil(value.armedUntil, nowMs))
    && value.clientId === ids.targetId
    && value.coachId === "admin"
    && value.questionnaireType === LEGACY_QUESTIONNAIRE_TYPE
    && value.formId === ""
    && value.frequency === "once"
    && value.nextSendAt === todayToronto
    && value.status === "active"
    && Boolean(value.requestedByUid)
    && Boolean(value.requestedByEmail)
    && reservedSyntheticPhone(value.clientPhoneNormalized);
}

function positiveCanaryAttemptExists(sendValues = [], releaseCommit) {
  const commit = assertReleaseCommit(releaseCommit);
  return (Array.isArray(sendValues) ? sendValues : []).some((value) =>
    value
    && value.source === "dashboard_questionnaire_scheduled"
    && value.questionnaireCanaryOnly === true
    && value.questionnaireCanarySource === CANARY_SOURCE
    && value.questionnaireCanaryMode === "scheduler"
    && value.canaryReleaseCommit === commit
  );
}

function canarySendRequiresDeferredExternalCleanup(value = {}) {
  return !["sent", "error"].includes(String(value.status || ""))
    || String(value.externalEffectState || "") === "started";
}

function canarySendHasUncertainExternalEffect(value = {}) {
  return String(value.status || "") === "error"
    && String(value.externalEffectState || "") === "uncertain";
}

function stringField(value) {
  return { stringValue: String(value || "") };
}

function booleanField(value) {
  return { booleanValue: Boolean(value) };
}

function timestampField(value) {
  return { timestampValue: new Date(value).toISOString() };
}

function encodeFirestoreFields(value = {}) {
  const fields = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "boolean") fields[key] = booleanField(entry);
    else if (["createdAt", "updatedAt"].includes(key)) fields[key] = timestampField(entry);
    else fields[key] = stringField(entry);
  }
  return fields;
}

function decodeFirestoreValue(value = {}) {
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (Object.prototype.hasOwnProperty.call(value, "mapValue")) {
    const decoded = {};
    for (const [key, entry] of Object.entries(value.mapValue?.fields || {})) {
      decoded[key] = decodeFirestoreValue(entry);
    }
    return decoded;
  }
  if (Object.prototype.hasOwnProperty.call(value, "arrayValue")) {
    return (Array.isArray(value.arrayValue?.values) ? value.arrayValue.values : [])
      .map(decodeFirestoreValue);
  }
  return undefined;
}

function decodeFirestoreDocument(document = {}) {
  const decoded = {};
  for (const [key, value] of Object.entries(document.fields || {})) {
    decoded[key] = decodeFirestoreValue(value);
  }
  return decoded;
}

function stableJsonStringify(value) {
  return JSON.stringify(sortJsonKeys(value));
}

function schedulerRunCompletesJobAttempt(run = {}, {
  jobName,
  lastAttemptTime,
  jobStatusCode,
  nowMs = Date.now(),
  maximumCompletionDelayMs = 180_000,
  clockSkewMs = 5_000
} = {}) {
  const attemptNs = rfc3339EpochNanoseconds(lastAttemptTime);
  const syncedNs = rfc3339EpochNanoseconds(run.syncedAt);
  const scheduleTimeNs = rfc3339EpochNanoseconds(
    run.triggeredByScheduleTime
  );
  const fullJobName = String(jobName || "");
  const jobLeaf = fullJobName.split("/").pop();
  const runJobName = String(run.triggeredByJobName || "");
  if (
    Number(jobStatusCode) !== 0
    || run.status !== "success"
    || !jobLeaf
    || ![jobLeaf, fullJobName].includes(runJobName)
    || attemptNs === null
    || syncedNs === null
    || scheduleTimeNs === null
    || !Number.isFinite(nowMs)
    || !Number.isFinite(maximumCompletionDelayMs)
    || maximumCompletionDelayMs <= 0
    || !Number.isFinite(clockSkewMs)
    || clockSkewMs < 0
  ) {
    return false;
  }
  const maximumDelayNs =
    BigInt(Math.trunc(maximumCompletionDelayMs + clockSkewMs)) * 1_000_000n;
  const latestNowNs =
    BigInt(Math.trunc(nowMs + clockSkewMs)) * 1_000_000n;
  return syncedNs >= attemptNs
    && syncedNs <= attemptNs + maximumDelayNs
    && syncedNs <= latestNowNs;
}

function rfc3339EpochNanoseconds(value) {
  const match = String(value || "").match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/
  );
  if (!match) return null;
  const epochMs = Date.parse(`${match[1]}${match[3]}`);
  if (!Number.isFinite(epochMs)) return null;
  const fractionalNs = BigInt((match[2] || "").padEnd(9, "0") || "0");
  return (BigInt(epochMs) * 1_000_000n) + fractionalNs;
}

function selectSchedulerAttemptCompletion(runs = [], options = {}) {
  const candidates = (Array.isArray(runs) ? runs : [])
    .filter((run) => schedulerRunCompletesJobAttempt(run, options));
  if (candidates.length !== 1) {
    throw new CanaryError("scheduler_completion_not_unique");
  }
  const completion = candidates[0];
  const expectedId = String(options.expectedCompletionId || "");
  if (expectedId && String(completion.id || "") !== expectedId) {
    throw new CanaryError("scheduler_completion_id_mismatch");
  }
  return completion;
}

function sortJsonKeys(value) {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJsonKeys(value[key])])
  );
}

function safeResultError(error) {
  return error instanceof CanaryError ? error.code : "unexpected_error";
}

module.exports = {
  PROJECT_ID,
  REGION,
  FUNCTION_ID,
  CANARY_SOURCE,
  TARGET_PREFIX,
  SCHEDULE_PREFIX,
  PROCESS_SEND_PREFIX,
  CONTROL_COLLECTION,
  CONTROL_ID,
  LEGACY_QUESTIONNAIRE_TYPE,
  LEGACY_GHL_TAG,
  PROCESS_QUESTIONNAIRE_TYPE,
  PROCESS_GHL_TAG,
  EVALUATION_GHL_TAG,
  HISTORICAL_GHL_TAGS,
  SYNTHETIC_CONTACT_MARKER_TAG,
  MAX_ARMING_MS,
  CONTROL_NONCE_PATTERN,
  EXPECTED_SCHEDULER_JOB_NAME,
  CanaryError,
  assertReleaseCommit,
  canaryIds,
  processCanarySendId,
  parseArgs,
  normalizePhone,
  reservedSyntheticPhone,
  buildContactProvisionClaim,
  validContactProvisionClaim,
  acquireSharedContactProvisionClaim,
  completeGhlContactSearch,
  validateGhlContactNextPageUrl,
  collectCompleteGhlContactSearch,
  dashboardClientMatchesSyntheticIdentity,
  contactName,
  contactTags,
  historicalGhlTagsAbsent,
  explicitSyntheticContact,
  contactConfirmationFingerprint,
  selectUniqueSyntheticContact,
  validArmedUntil,
  buildCanaryTarget,
  buildCanarySchedule,
  buildProcessCanarySend,
  buildCanaryControl,
  canaryControlOwnedForCleanup,
  canaryControlActive,
  canaryTargetMatches,
  canaryTargetOwnedForCleanup,
  canaryScheduleMatches,
  positiveCanaryAttemptExists,
  canarySendRequiresDeferredExternalCleanup,
  canarySendHasUncertainExternalEffect,
  encodeFirestoreFields,
  decodeFirestoreValue,
  decodeFirestoreDocument,
  stableJsonStringify,
  schedulerRunCompletesJobAttempt,
  selectSchedulerAttemptCompletion,
  safeResultError
};
