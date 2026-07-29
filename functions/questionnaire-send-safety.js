"use strict";

const CLAIM_TTL_MS = 3 * 60 * 1000;
const CLAIMABLE_DELIVERY_STATUSES = new Set([
  "",
  "firestore_queue_pending",
  "firebase_function_pending",
  "backend_processing",
  "ghl_pending"
]);
const TERMINAL_SEND_STATUSES = new Set(["sent", "cancelled"]);
const TERMINAL_DELIVERY_STATUSES = new Set(["tag_added", "cancelled"]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return Number(value.toMillis()) || 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (Number.isFinite(value.seconds)) {
    return (Number(value.seconds) * 1000) + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  }
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function externalEffectState(send = {}) {
  return clean(send.externalEffectState).toLowerCase() || "not_started";
}

function sendIsTerminal(send = {}) {
  return TERMINAL_SEND_STATUSES.has(clean(send.status).toLowerCase())
    || TERMINAL_DELIVERY_STATUSES.has(clean(send.deliveryStatus).toLowerCase())
    || ["completed", "uncertain"].includes(externalEffectState(send));
}

function duplicateSendDisposition(send = {}) {
  const status = clean(send.status).toLowerCase();
  const deliveryStatus = clean(send.deliveryStatus).toLowerCase();
  const explicitEffectState = clean(send.externalEffectState).toLowerCase();
  const effectState = externalEffectState(send);

  // Fail closed when any durable field says the external result is uncertain.
  // A contradictory success marker must not turn an uncertain effect into an
  // invitation to create another send.
  if (effectState === "uncertain" || deliveryStatus === "ghl_effect_uncertain") {
    return "effect_uncertain";
  }
  if (
    status === "sent"
    || deliveryStatus === "tag_added"
    || effectState === "completed"
  ) {
    return "completed";
  }
  if (effectState === "started") {
    return "active";
  }
  if (
    ["", "pending", "queued"].includes(status)
    && CLAIMABLE_DELIVERY_STATUSES.has(deliveryStatus)
    && effectState === "not_started"
  ) {
    return "active";
  }
  if (
    ["error", "cancelled"].includes(status)
    && explicitEffectState === "not_started"
    && !["tag_added", "ghl_effect_uncertain"].includes(deliveryStatus)
  ) {
    return "terminal_pre_effect";
  }
  return "manual_review";
}

function claimDecision({
  send = {},
  eventId = "",
  nowMs = Date.now()
} = {}) {
  const normalizedEventId = clean(eventId);
  const status = clean(send.status).toLowerCase();
  const deliveryStatus = clean(send.deliveryStatus).toLowerCase();
  const effectState = externalEffectState(send);
  const processingEventId = clean(send.processingEventId);
  const claimExpiresAtMs = timestampMillis(send.claimExpiresAt);

  if (!normalizedEventId) return { claimable: false, reason: "event_id_missing" };
  if (sendIsTerminal(send)) return { claimable: false, reason: "send_terminal" };
  if (!["", "pending", "queued"].includes(status)) {
    return { claimable: false, reason: "status_not_claimable" };
  }
  if (!CLAIMABLE_DELIVERY_STATUSES.has(deliveryStatus)) {
    return { claimable: false, reason: "delivery_status_not_claimable" };
  }
  if (effectState === "started") {
    return {
      claimable: false,
      reason: claimExpiresAtMs && claimExpiresAtMs <= Number(nowMs)
        ? "external_effect_expired_uncertain"
        : "external_effect_in_progress"
    };
  }
  if (deliveryStatus === "backend_processing" || deliveryStatus === "ghl_pending") {
    if (processingEventId === normalizedEventId) {
      return { claimable: true, reason: "same_event_resume" };
    }
    if (claimExpiresAtMs > Number(nowMs)) {
      return { claimable: false, reason: "claim_active" };
    }
    return { claimable: true, reason: "expired_claim_recovery" };
  }
  return { claimable: true, reason: "queued" };
}

function buildClaimPatch({
  send = {},
  eventId = "",
  nowMs = Date.now(),
  timestampFromMillis,
  serverTimestamp
} = {}) {
  if (typeof timestampFromMillis !== "function") {
    throw new TypeError("timestampFromMillis is required");
  }
  return {
    status: "pending",
    deliveryStatus: "backend_processing",
    processedBy: "processQuestionnaireSendRequest",
    processingEventId: clean(eventId),
    processingAttemptCount: Math.max(0, Number(send.processingAttemptCount || 0)) + 1,
    processingStartedAt: serverTimestamp,
    claimExpiresAt: timestampFromMillis(Number(nowMs) + CLAIM_TTL_MS),
    externalEffectState: externalEffectState(send),
    updatedAt: serverTimestamp
  };
}

function externalEffectClaimAllowed({
  send = {},
  eventId = "",
  contactId = ""
} = {}) {
  const status = clean(send.status).toLowerCase();
  const deliveryStatus = clean(send.deliveryStatus).toLowerCase();
  return Boolean(
    clean(eventId)
    && clean(contactId)
    && status === "pending"
    && ["backend_processing", "ghl_pending"].includes(deliveryStatus)
    && clean(send.processingEventId) === clean(eventId)
    && externalEffectState(send) === "not_started"
  );
}

function expiredClaimResolution({
  send = {},
  nowMs = Date.now()
} = {}) {
  const claimExpiresAtMs = timestampMillis(send.claimExpiresAt);
  if (!claimExpiresAtMs) return { eligible: false, action: "claim_missing" };
  if (claimExpiresAtMs > Number(nowMs)) return { eligible: false, action: "claim_active" };
  if (sendIsTerminal(send)) return { eligible: false, action: "terminal_cleanup" };
  const effectState = externalEffectState(send);
  if (effectState === "started") {
    return { eligible: true, action: "mark_uncertain" };
  }
  if (effectState === "not_started") {
    return { eligible: true, action: "retry_before_external_effect" };
  }
  return { eligible: true, action: "mark_uncertain" };
}

module.exports = {
  CLAIM_TTL_MS,
  buildClaimPatch,
  claimDecision,
  duplicateSendDisposition,
  expiredClaimResolution,
  externalEffectClaimAllowed,
  externalEffectState,
  sendIsTerminal,
  timestampMillis
};
