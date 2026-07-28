"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const safety = require("../questionnaire-scheduler-safety");

const releaseCommit = "a".repeat(40);
const scheduleId = `${safety.SCHEDULE_PREFIX}${releaseCommit.slice(0, 12)}`;
const future = "2026-07-28T20:20:00.000Z";
const nonce = "b".repeat(32);
const jobEvent = { jobName: safety.EXPECTED_JOB_NAME };

function control(mode, armedUntil = future) {
  return {
    source: safety.CANARY_SOURCE,
    questionnaireCanaryOnly: true,
    canaryReleaseCommit: releaseCommit,
    armedUntil,
    mode,
    nonce,
    expectedJobName: safety.EXPECTED_JOB_NAME,
    expectedScheduleId: mode === "positive" ? scheduleId : ""
  };
}

test("active canary control is exact, short-lived and job-bound", () => {
  const nowMs = new Date("2026-07-28T20:10:00.000Z").getTime();
  const empty = safety.controlAvailable({
    control: control("empty"),
    event: jobEvent,
    nowMs
  });
  assert.equal(empty.mode, "empty");
  assert.equal(empty.nonce, nonce);
  assert.equal(safety.controlAllowsSnapshot({ control: empty, docs: [] }), true);
  assert.equal(
    safety.controlAllowsSnapshot({ control: empty, docs: [{ id: "real_schedule" }] }),
    false
  );

  const positive = safety.controlAvailable({
    control: control("positive"),
    event: jobEvent,
    nowMs
  });
  assert.equal(
    safety.controlAllowsSnapshot({ control: positive, docs: [{ id: scheduleId }] }),
    true
  );
  assert.equal(
    safety.controlAllowsSnapshot({ control: positive, docs: [{ id: "real_schedule" }] }),
    false
  );
  assert.equal(
    safety.controlAvailable({
      control: control("positive"),
      event: { jobName: "another-job" },
      nowMs
    }),
    null
  );
});

test("any existing expired or malformed control blocks instead of falling back to production", () => {
  const nowMs = new Date("2026-07-28T20:10:00.000Z").getTime();
  const expired = control("empty", "2026-07-28T20:09:00.000Z");
  for (const candidate of [
    expired,
    { ...control("empty"), nonce: "" },
    { ...control("empty"), nonce: "ABC" },
    { ...control("empty"), expectedJobName: "wrong" },
    { ...control("empty"), canaryReleaseCommit: "invalid" },
    { ...control("positive"), expectedScheduleId: "wrong" }
  ]) {
    const decision = safety.controlDecision({
      exists: true,
      control: candidate,
      event: jobEvent,
      docs: [],
      nowMs
    });
    assert.deepEqual(decision, {
      blocked: true,
      reason: "control_invalid",
      control: null
    });
  }
  assert.deepEqual(
    safety.controlDecision({
      exists: false,
      control: expired,
      event: jobEvent,
      docs: [],
      nowMs
    }),
    {
      blocked: false,
      reason: "control_absent",
      control: null
    }
  );
});

test("valid control propagates its nonce and blocks a mismatched due snapshot", () => {
  const nowMs = new Date("2026-07-28T20:10:00.000Z").getTime();
  const allowed = safety.controlDecision({
    exists: true,
    control: control("positive"),
    event: jobEvent,
    docs: [{ id: scheduleId }],
    nowMs
  });
  assert.equal(allowed.blocked, false);
  assert.equal(allowed.reason, "canary_allowed");
  assert.equal(allowed.control.nonce, nonce);

  const blocked = safety.controlDecision({
    exists: true,
    control: control("positive"),
    event: jobEvent,
    docs: [{ id: "real_schedule" }],
    nowMs
  });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, "snapshot_mismatch");
  assert.equal(blocked.control.nonce, nonce);
});

function fakeDatabase(initialSchedule, initialSend = null) {
  const state = {
    schedule: { ...initialSchedule },
    send: initialSend ? { ...initialSend } : null
  };
  return {
    state,
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(ref) {
          const value = state[ref.kind];
          return {
            exists: Boolean(value),
            data: () => (value ? { ...value } : undefined)
          };
        },
        create(ref, value) {
          if (state[ref.kind]) throw new Error("already exists");
          writes.push({ kind: "create", ref, value });
        },
        set(ref, value) {
          writes.push({ kind: "set", ref, value });
        }
      };
      const result = await callback(transaction);
      for (const write of writes) {
        if (write.kind === "create") state[write.ref.kind] = { ...write.value };
        if (write.kind === "set") {
          state[write.ref.kind] = { ...(state[write.ref.kind] || {}), ...write.value };
        }
      }
      return result;
    }
  };
}

function schedule() {
  return {
    status: "active",
    nextSendAt: "2026-07-28",
    clientId: "client",
    clientName: "Canary",
    clientPhoneNormalized: "5145550100",
    coachId: "admin",
    coachRxId: "admin",
    coachName: "Admin",
    questionnaireType: "suivi_global",
    formId: "",
    frequency: "once",
    requestedByUid: "adminUid",
    requestedByEmail: "admin@example.invalid",
    source: safety.CANARY_SOURCE,
    questionnaireCanaryOnly: true,
    canaryReleaseCommit: releaseCommit,
    armedUntil: future
  };
}

test("transaction creates a send once and never overwrites terminal evidence", async () => {
  const scheduleRef = { kind: "schedule" };
  const sendRef = { kind: "send" };
  const expectedSchedule = schedule();
  const db = fakeDatabase(expectedSchedule);
  const first = await safety.queueScheduleSendAtomically({
    db,
    scheduleRef,
    sendRef,
    expectedSchedule,
    today: "2026-07-28",
    sendData: { status: "pending", externalEffectState: "" },
    schedulePatch: { status: "paused", nextSendAt: "" }
  });
  assert.deepEqual(first, { queued: true, reason: "created" });
  assert.equal(db.state.send.status, "pending");

  db.state.schedule = { ...expectedSchedule };
  db.state.send = {
    status: "sent",
    deliveryStatus: "tag_added",
    externalEffectState: "completed"
  };
  const terminalBefore = JSON.stringify(db.state.send);
  const second = await safety.queueScheduleSendAtomically({
    db,
    scheduleRef,
    sendRef,
    expectedSchedule,
    today: "2026-07-28",
    sendData: { status: "pending", externalEffectState: "" },
    schedulePatch: { status: "paused", nextSendAt: "" }
  });
  assert.deepEqual(second, { queued: false, reason: "send_exists" });
  assert.equal(JSON.stringify(db.state.send), terminalBefore);
  assert.equal(db.state.schedule.status, "paused");
});

test("Toronto date does not drift to UTC during the evening", () => {
  assert.equal(
    safety.todayTorontoIsoDate(new Date("2026-07-29T02:00:00.000Z")),
    "2026-07-28"
  );
});
