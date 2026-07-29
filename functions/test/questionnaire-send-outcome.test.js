"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const questionnaireSendSafety = require("../questionnaire-send-safety");

const source = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");
const DELETE_FIELD = Symbol("delete_field");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Fonction introuvable: ${name}`);
  const open = source.indexOf("{", source.indexOf(") {", start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Fonction incomplète: ${name}`);
}

function snapshot(value) {
  return {
    exists: value !== undefined,
    data: () => (value === undefined ? undefined : structuredClone(value))
  };
}

function applyPatch(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE_FIELD) delete target[key];
    else target[key] = value;
  }
}

function harness({ send, schedule }) {
  const state = {
    send: structuredClone(send),
    schedule: structuredClone(schedule)
  };
  const sendRef = { id: "send-one", kind: "send" };
  const scheduleRef = { id: "schedule-one", kind: "schedule" };
  const db = {
    collection(name) {
      assert.equal(name, "questionnaireSchedules");
      return {
        doc(id) {
          assert.equal(id, "schedule-one");
          return scheduleRef;
        }
      };
    },
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(ref) {
          return snapshot(state[ref.kind]);
        },
        update(ref, patch) {
          writes.push({ kind: "update", ref, patch });
        },
        set(ref, patch, options = {}) {
          writes.push({ kind: options.merge ? "merge" : "set", ref, patch });
        }
      };
      const result = await callback(transaction);
      for (const write of writes) {
        if (write.kind === "set") state[write.ref.kind] = {};
        if (!state[write.ref.kind]) state[write.ref.kind] = {};
        applyPatch(state[write.ref.kind], write.patch);
      }
      return result;
    }
  };
  const sandbox = {
    admin: {
      firestore: {
        FieldValue: {
          delete: () => DELETE_FIELD,
          serverTimestamp: () => "SERVER_TIMESTAMP"
        }
      }
    },
    cleanString: (value) => String(value ?? "").trim(),
    db,
    nextQuestionnaireScheduleDate: (frequency, from) =>
      frequency === "once" ? "" : `NEXT:${frequency}:${from}`,
    questionnaireSendSafety,
    structuredClone
  };
  vm.runInNewContext(
    `async ${extractFunction("markSend")}
     globalThis.markSendForTest = markSend;`,
    sandbox,
    { filename: "mark-send-under-test.js" }
  );
  return {
    markSend: (patch) => sandbox.markSendForTest(sendRef, patch),
    state
  };
}

function baseSend(overrides = {}) {
  return {
    status: "pending",
    deliveryStatus: "ghl_pending",
    externalEffectState: "started",
    questionnaireScheduleId: "schedule-one",
    clientId: "member-one",
    questionnaireType: "studio:check_in",
    formId: "check_in_express",
    scheduleFrequency: "every_2_weeks",
    scheduledFor: "2026-07-29",
    claimExpiresAt: "LEASE",
    ...overrides
  };
}

function baseSchedule(overrides = {}) {
  return {
    status: "active",
    nextSendAt: "2026-07-29",
    lastQueuedSendId: "send-one",
    pendingSendId: "send-one",
    pendingScheduledFor: "2026-07-29",
    clientId: "member-one",
    questionnaireType: "studio:check_in",
    formId: "check_in_express",
    frequency: "every_2_weeks",
    ...overrides
  };
}

test("une erreur GHL met la planification en pause sans avancer la date", async () => {
  const { markSend, state } = harness({
    send: baseSend(),
    schedule: baseSchedule()
  });
  await markSend({
    status: "error",
    deliveryStatus: "ghl_effect_uncertain",
    externalEffectState: "uncertain",
    errorMessage: "Vérification requise"
  });
  assert.equal(state.schedule.status, "paused");
  assert.equal(state.schedule.nextSendAt, "2026-07-29");
  assert.equal(state.schedule.deliveryState, "uncertain");
  assert.equal(state.schedule.lastFailedSendId, "send-one");
  assert.equal(state.schedule.pendingSendId, "");
  assert.equal(state.send.claimExpiresAt, undefined);
});

test("seule une preuve GHL réussie avance la prochaine date", async () => {
  const { markSend, state } = harness({
    send: baseSend(),
    schedule: baseSchedule()
  });
  await markSend({
    status: "sent",
    deliveryStatus: "tag_added",
    externalEffectState: "completed"
  });
  assert.equal(state.schedule.status, "active");
  assert.equal(
    state.schedule.nextSendAt,
    "NEXT:every_2_weeks:2026-07-29"
  );
  assert.equal(state.schedule.deliveryState, "sent");
  assert.equal(state.schedule.lastSuccessfulSendId, "send-one");
  assert.equal(state.schedule.lastError, "");
});

test("une pause manuelle prise pendant l'envoi reste en vigueur après le succès", async () => {
  const { markSend, state } = harness({
    send: baseSend(),
    schedule: baseSchedule({ status: "paused" })
  });
  await markSend({
    status: "sent",
    deliveryStatus: "tag_added",
    externalEffectState: "completed"
  });
  assert.equal(state.schedule.status, "paused");
  assert.equal(
    state.schedule.nextSendAt,
    "NEXT:every_2_weeks:2026-07-29"
  );
});

test("une preuve de succès terminale ne peut pas être rétrogradée", async () => {
  const { markSend, state } = harness({
    send: baseSend({
      status: "sent",
      deliveryStatus: "tag_added",
      externalEffectState: "completed"
    }),
    schedule: baseSchedule({ nextSendAt: "2026-08-12" })
  });
  assert.equal(await markSend({
    status: "error",
    deliveryStatus: "ghl_error",
    errorMessage: "Erreur tardive"
  }), false);
  assert.equal(state.send.status, "sent");
  assert.equal(state.send.deliveryStatus, "tag_added");
  assert.equal(state.schedule.status, "active");
  assert.equal(state.schedule.nextSendAt, "2026-08-12");
});

test("un envoi qui ne possède plus la planification ne la modifie pas", async () => {
  const { markSend, state } = harness({
    send: baseSend(),
    schedule: baseSchedule({ lastQueuedSendId: "newer-send" })
  });
  await markSend({
    status: "sent",
    deliveryStatus: "tag_added",
    externalEffectState: "completed"
  });
  assert.equal(state.send.status, "sent");
  assert.equal(state.schedule.nextSendAt, "2026-07-29");
  assert.equal(state.schedule.pendingSendId, "send-one");
  assert.equal(state.schedule.deliveryState, undefined);
});
