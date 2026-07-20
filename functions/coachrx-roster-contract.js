"use strict";

const crypto = require("crypto");
const { ClientContractError } = require("./client-contract");
const { normalizeExternalIdentityId } = require("./external-identity-claim");

const SOURCE_ID_KEYS = Object.freeze([
  "sourceclientid",
  "clientid",
  "coachrxclientid",
  "idclient",
  "id",
  "athleteid",
  "memberid"
]);
const CLIENT_NAME_KEYS = Object.freeze([
  "clientname",
  "client",
  "name",
  "nom",
  "athlete",
  "member",
  "membre"
]);
const PHONE_KEYS = Object.freeze([
  "clientphonenormalized",
  "phonenormalized",
  "clientphone",
  "phonenumber",
  "phone",
  "telephone",
  "mobile",
  "cell"
]);
const EMAIL_KEYS = Object.freeze(["clientemail", "email", "courriel"]);

const OBSERVATION_FIELDS = Object.freeze({
  workoutDue: ["workoutdue", "exercisedue", "nextworkoutdue"],
  workoutDueDays: ["workoutduedays", "exerciseduedays"],
  exerciseStatus: ["exercisestatus", "workoutstatus"],
  exerciseColor: ["exercisecolor", "workoutcolor"],
  compliance7: ["compliance7", "compliance7days"],
  compliance30: ["compliance30", "compliance30days"],
  compliance90: ["compliance90", "compliance90days"],
  lifestyleDue: ["lifestyledue", "lifestylerxdue"],
  lifestyleStatus: ["lifestylestatus"],
  lifestyleCompliance7: ["lifestylecompliance7", "lifestylecompliance7days"],
  lifestyleCompliance30: ["lifestylecompliance30", "lifestylecompliance30days"],
  lifestyleCompliance90: ["lifestylecompliance90", "lifestylecompliance90days"],
  completedWorkouts: ["completedworkouts", "workoutscompleted"],
  streak: ["streak", "currentstreakcount"],
  lastConsultation: ["lastconsultation"],
  touchpoints: ["touchpoints", "touchpointscount"],
  programSignal: ["programsignal"],
  complianceSignal: ["compliancesignal"],
  lifestyleSignal: ["lifestylesignal"]
});

function fail(code, message, details = {}) {
  throw new ClientContractError(code, message, details);
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function keyOf(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function indexedRecord(record = {}) {
  const indexed = {};
  Object.entries(record || {}).forEach(([key, value]) => {
    const normalized = keyOf(key);
    if (normalized && indexed[normalized] === undefined) indexed[normalized] = value;
  });
  return indexed;
}

function firstValue(record, keys) {
  const indexed = indexedRecord(record);
  for (const key of keys) {
    const value = cleanString(indexed[keyOf(key)]);
    if (value) return value;
  }
  return "";
}

function coachRxSourceClientId(record = {}) {
  const value = firstValue(record, SOURCE_ID_KEYS);
  return value ? normalizeExternalIdentityId(value) : "";
}

function normalizeExpectedCount(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 2500) {
    fail("invalid_roster_count", "Le compteur CoachRx attendu est invalide.");
  }
  return number;
}

function normalizeSourceGeneratedAt(value, nowMillis = Date.now()) {
  const sourceGeneratedAt = cleanString(value);
  const generatedAtMillis = sourceGeneratedAt ? Date.parse(sourceGeneratedAt) : NaN;
  if (!Number.isFinite(generatedAtMillis)) {
    fail("invalid_roster_timestamp", "Le lot CoachRx doit posseder un horodatage source valide.");
  }
  const maxFutureSkewMillis = 10 * 60 * 1000;
  if (generatedAtMillis > nowMillis + maxFutureSkewMillis) {
    fail("future_roster_timestamp", "L'horodatage source CoachRx est trop loin dans le futur.");
  }
  return new Date(generatedAtMillis).toISOString();
}

function normalizedPhoneSignal(record = {}) {
  const digits = firstValue(record, PHONE_KEYS).replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function coachRxContractualRecord(record = {}) {
  return {
    sourceClientId: coachRxSourceClientId(record),
    identityKind: firstValue(record, ["identityKind", "identity_kind"]),
    displayName: firstValue(record, CLIENT_NAME_KEYS).replace(/\s+/g, " "),
    phoneNormalized: normalizedPhoneSignal(record),
    emailNormalized: firstValue(record, EMAIL_KEYS).toLowerCase(),
    observation: buildCoachRxObservation(record)
  };
}

function coachRxRosterRecordsDigest(records = []) {
  const contractualRecords = records
    .map(coachRxContractualRecord)
    .sort((left, right) => left.sourceClientId.localeCompare(right.sourceClientId));
  return crypto.createHash("sha256")
    .update(JSON.stringify(contractualRecords))
    .digest("hex");
}

function resolveCoachRxRosterReceipt(existingReceipt, requestedFingerprint) {
  const fingerprint = cleanString(requestedFingerprint).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    fail("invalid_roster_fingerprint", "Empreinte de roster CoachRx invalide.");
  }
  if (existingReceipt === undefined || existingReceipt === null) {
    return { fingerprint, reused: false };
  }
  const existingFingerprint = cleanString(existingReceipt.fingerprint).toLowerCase();
  if (existingFingerprint !== fingerprint) {
    fail(
      "idempotency_conflict",
      "Ce sourceRunId CoachRx a deja ete utilise avec un roster different."
    );
  }
  return { fingerprint, reused: true };
}

function normalizeCoachRxRosterEnvelope({
  coachRxOwnerId,
  sourcePath,
  sourceRunId,
  sourceGeneratedAt = "",
  expectedClientCount,
  records = []
} = {}) {
  const ownerId = cleanString(coachRxOwnerId);
  if (!/^\d{1,20}$/.test(ownerId)) {
    fail("invalid_coachrx_owner", "Identifiant du coach CoachRx invalide.");
  }
  const path = cleanString(sourcePath);
  const pathMatch = path.match(/\/(?:team|api\/v1\/coaches)\/(\d+)\/clients(?:\.json)?(?:[/?#]|$)/i);
  if (!pathMatch || pathMatch[1] !== ownerId) {
    fail("invalid_roster_source", "La route CoachRx ne prouve pas le coach du roster.");
  }
  if (!Array.isArray(records) || records.length > 2500) {
    fail("invalid_roster_records", "Le roster CoachRx est invalide ou trop volumineux.");
  }
  const runId = cleanString(sourceRunId);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{7,159}$/.test(runId)) {
    fail("invalid_roster_run", "Le lot CoachRx doit posseder un identifiant stable.");
  }
  const ids = records.map((record, index) => {
    const sourceClientId = coachRxSourceClientId(record);
    if (!sourceClientId) {
      fail("missing_stable_coachrx_id", `La ligne ${index + 1} ne possede pas d'identite CoachRx stable.`);
    }
    const identityKind = firstValue(record, ["identityKind", "identity_kind"]);
    if (!["id", "slug", "url_slug"].includes(identityKind)) {
      fail(
        "unverified_coachrx_identity_kind",
        `La ligne ${index + 1} ne prouve pas la nature stable de son identite CoachRx.`
      );
    }
    const displayName = firstValue(record, CLIENT_NAME_KEYS).replace(/\s+/g, " ");
    if (displayName.length < 2 || displayName.length > 160) {
      fail(
        "invalid_coachrx_display_name",
        `La ligne ${index + 1} ne possede pas un nom client exploitable.`
      );
    }
    return sourceClientId;
  });
  if (new Set(ids).size !== ids.length) {
    fail("duplicate_coachrx_id", "Le roster contient une identite CoachRx en double.");
  }
  const expected = normalizeExpectedCount(expectedClientCount);
  const complete = expected !== null && expected > 0 && expected === records.length;
  const normalizedGeneratedAt = normalizeSourceGeneratedAt(sourceGeneratedAt);
  const recordsDigest = coachRxRosterRecordsDigest(records);
  const fingerprint = crypto.createHash("sha256")
    .update(JSON.stringify({
      fingerprintVersion: 2,
      coachRxOwnerId: ownerId,
      sourcePath: path,
      sourceRunId: runId,
      sourceGeneratedAt: normalizedGeneratedAt,
      expectedClientCount: expected,
      observedClientCount: records.length,
      complete,
      recordsDigest
    }))
    .digest("hex");
  return {
    coachRxOwnerId: ownerId,
    sourcePath: path,
    sourceRunId: runId,
    sourceGeneratedAt: normalizedGeneratedAt,
    expectedClientCount: expected,
    observedClientCount: records.length,
    complete,
    recordsDigest,
    fingerprint,
    sourceClientIds: ids
  };
}

function buildCoachRxObservation(record = {}) {
  const observation = {};
  Object.entries(OBSERVATION_FIELDS).forEach(([field, aliases]) => {
    const value = firstValue(record, aliases);
    if (value) observation[field] = value.slice(0, 500);
  });
  return observation;
}

function decideCoachRxIdentityAction({ claim = null, contactSignal = null } = {}) {
  if (claim?.internalClientId) return "observe_claimed_identity";
  if (contactSignal?.internalClientId) return "propose_existing_dashboard_identity";
  return "create_coachrx_identity";
}

module.exports = {
  OBSERVATION_FIELDS,
  buildCoachRxObservation,
  coachRxRosterRecordsDigest,
  coachRxSourceClientId,
  decideCoachRxIdentityAction,
  normalizeCoachRxRosterEnvelope,
  normalizeSourceGeneratedAt,
  resolveCoachRxRosterReceipt
};
