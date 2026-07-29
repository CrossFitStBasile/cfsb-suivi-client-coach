"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const safety = require("../questionnaire-send-safety");

const nowMs = new Date("2026-07-29T15:00:00.000Z").getTime();

function timestamp(ms) {
  return {
    toMillis: () => ms
  };
}

test("a queued questionnaire send is claimable and receives a finite lease", () => {
  const send = {
    status: "pending",
    deliveryStatus: "firestore_queue_pending",
    processingAttemptCount: 2
  };
  assert.deepEqual(
    safety.claimDecision({ send, eventId: "event-1", nowMs }),
    { claimable: true, reason: "queued" }
  );
  const serverTimestamp = { server: true };
  const patch = safety.buildClaimPatch({
    send,
    eventId: "event-1",
    nowMs,
    timestampFromMillis: timestamp,
    serverTimestamp
  });
  assert.equal(patch.processingAttemptCount, 3);
  assert.equal(patch.externalEffectState, "not_started");
  assert.equal(
    patch.claimExpiresAt.toMillis(),
    nowMs + safety.CLAIM_TTL_MS
  );
});

test("the same event may resume before the external effect starts", () => {
  const send = {
    status: "pending",
    deliveryStatus: "backend_processing",
    processingEventId: "event-1",
    claimExpiresAt: timestamp(nowMs + 60_000),
    externalEffectState: "not_started"
  };
  assert.deepEqual(
    safety.claimDecision({ send, eventId: "event-1", nowMs }),
    { claimable: true, reason: "same_event_resume" }
  );
  assert.deepEqual(
    safety.claimDecision({ send, eventId: "event-2", nowMs }),
    { claimable: false, reason: "claim_active" }
  );
});

test("an expired pre-effect claim is recoverable by a different event", () => {
  const send = {
    status: "pending",
    deliveryStatus: "backend_processing",
    processingEventId: "event-1",
    claimExpiresAt: timestamp(nowMs - 1),
    externalEffectState: "not_started"
  };
  assert.deepEqual(
    safety.claimDecision({ send, eventId: "recovery-event", nowMs }),
    { claimable: true, reason: "expired_claim_recovery" }
  );
  assert.deepEqual(
    safety.expiredClaimResolution({ send, nowMs }),
    { eligible: true, action: "retry_before_external_effect" }
  );
});

test("an expired started external effect is uncertain and is never replayed", () => {
  const send = {
    status: "pending",
    deliveryStatus: "ghl_pending",
    processingEventId: "event-1",
    claimExpiresAt: timestamp(nowMs - 1),
    externalEffectState: "started"
  };
  assert.deepEqual(
    safety.claimDecision({ send, eventId: "recovery-event", nowMs }),
    { claimable: false, reason: "external_effect_expired_uncertain" }
  );
  assert.deepEqual(
    safety.expiredClaimResolution({ send, nowMs }),
    { eligible: true, action: "mark_uncertain" }
  );
});

test("external GHL effect requires the exact processing event", () => {
  const send = {
    status: "pending",
    deliveryStatus: "ghl_pending",
    processingEventId: "event-1",
    externalEffectState: "not_started"
  };
  assert.equal(
    safety.externalEffectClaimAllowed({
      send,
      eventId: "event-1",
      contactId: "contact-1"
    }),
    true
  );
  assert.equal(
    safety.externalEffectClaimAllowed({
      send,
      eventId: "event-2",
      contactId: "contact-1"
    }),
    false
  );
  assert.equal(
    safety.externalEffectClaimAllowed({
      send: { ...send, externalEffectState: "started" },
      eventId: "event-1",
      contactId: "contact-1"
    }),
    false
  );
});

test("terminal and uncertain sends are never claimable", () => {
  for (const send of [
    { status: "sent", deliveryStatus: "tag_added" },
    { status: "cancelled", deliveryStatus: "cancelled" },
    {
      status: "error",
      deliveryStatus: "ghl_effect_uncertain",
      externalEffectState: "uncertain"
    }
  ]) {
    assert.equal(
      safety.claimDecision({ send, eventId: "event-1", nowMs }).claimable,
      false
    );
  }
});

test("duplicate send retries fail closed for every uncertain GHL marker", () => {
  for (const send of [
    {
      status: "error",
      deliveryStatus: "ghl_effect_uncertain",
      externalEffectState: "not_started"
    },
    {
      status: "error",
      deliveryStatus: "ghl_error",
      externalEffectState: "uncertain"
    },
    {
      status: "sent",
      deliveryStatus: "tag_added",
      externalEffectState: "uncertain"
    }
  ]) {
    assert.equal(
      safety.duplicateSendDisposition(send),
      "effect_uncertain"
    );
  }
});

test("duplicate send retries resume active and completed attempts without replay", () => {
  assert.equal(safety.duplicateSendDisposition({
    status: "pending",
    deliveryStatus: "backend_processing",
    externalEffectState: "not_started"
  }), "active");
  assert.equal(safety.duplicateSendDisposition({
    status: "error",
    deliveryStatus: "ghl_pending",
    externalEffectState: "started"
  }), "active");
  assert.equal(safety.duplicateSendDisposition({
    status: "sent",
    deliveryStatus: "tag_added",
    externalEffectState: "completed"
  }), "completed");
});

test("only an explicitly pre-effect terminal attempt permits a new send id", () => {
  assert.equal(safety.duplicateSendDisposition({
    status: "error",
    deliveryStatus: "contact_not_found",
    externalEffectState: "not_started"
  }), "terminal_pre_effect");
  assert.equal(safety.duplicateSendDisposition({
    status: "cancelled",
    deliveryStatus: "cancelled",
    externalEffectState: "not_started"
  }), "terminal_pre_effect");

  for (const send of [
    { status: "error", deliveryStatus: "contact_not_found" },
    {
      status: "error",
      deliveryStatus: "ghl_effect_uncertain",
      externalEffectState: "not_started"
    },
    {
      status: "error",
      deliveryStatus: "unknown_terminal_state",
      externalEffectState: "unexpected"
    }
  ]) {
    assert.notEqual(
      safety.duplicateSendDisposition(send),
      "terminal_pre_effect"
    );
  }
});
