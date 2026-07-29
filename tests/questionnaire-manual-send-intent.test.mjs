import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = await readFile(
  join(root, "firebase-dashboard", "public", "app.js"),
  "utf8"
);

const outcomeStart = app.indexOf("function questionnaireSendAttemptOutcome(");
const bestEffortStart = app.indexOf(
  "function runQuestionnaireSendBestEffort(",
  outcomeStart
);
const journalStart = app.indexOf(
  "async function journalQuestionnaireSend(",
  bestEffortStart
);
assert.ok(outcomeStart >= 0 && bestEffortStart > outcomeStart);
assert.ok(journalStart > bestEffortStart);

const helperWarnings = [];
const helpers = vm.runInNewContext(
  `${app.slice(outcomeStart, journalStart)}
  ({ questionnaireSendAttemptOutcome, runQuestionnaireSendBestEffort });`,
  {
    console: {
      warn: (...args) => helperWarnings.push(args)
    },
    Promise
  }
);
const {
  questionnaireSendAttemptOutcome,
  runQuestionnaireSendBestEffort
} = helpers;

test("manual send categorizes an active durable intent without recreating it", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(questionnaireSendAttemptOutcome({
      status: "pending",
      deliveryStatus: "backend_processing",
      externalEffectState: "not_started"
    }))),
    { kind: "active", reason: "delivery_active" }
  );
});

test("manual send categorizes confirmed success without recreating it", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(questionnaireSendAttemptOutcome({
      status: "sent",
      deliveryStatus: "tag_added",
      externalEffectState: "completed"
    }))),
    { kind: "success", reason: "delivery_confirmed" }
  );
});

test("manual send blocks started, uncertain, and contradictory external effects", () => {
  for (const send of [
    {
      status: "pending",
      deliveryStatus: "ghl_pending",
      externalEffectState: "started"
    },
    {
      status: "error",
      deliveryStatus: "ghl_effect_uncertain",
      externalEffectState: "uncertain"
    },
    {
      status: "error",
      deliveryStatus: "ghl_error",
      externalEffectState: "not_started",
      externalEffectStartedAt: "2026-07-29T12:00:00.000Z"
    },
    {
      status: "sent",
      deliveryStatus: "tag_added",
      externalEffectState: "unrecognized"
    }
  ]) {
    assert.equal(questionnaireSendAttemptOutcome(send).kind, "uncertain");
  }
});

test("manual send permits only an explicit new intent after a terminal pre-effect result", () => {
  for (const send of [
    {
      status: "error",
      deliveryStatus: "client_not_found",
      externalEffectState: "not_started"
    },
    {
      status: "cancelled",
      deliveryStatus: "backend_processing",
      externalEffectState: "not_started"
    }
  ]) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(questionnaireSendAttemptOutcome(send))),
      {
        kind: "terminal_pre_effect",
        reason: "terminal_before_external_effect"
      }
    );
  }
});

test("a rejected action log after the durable commit cannot reject the UI flow", async () => {
  const loggedError = new Error("action log unavailable");
  let observedError = null;
  let uiContinued = false;

  assert.doesNotThrow(() => {
    const result = runQuestionnaireSendBestEffort(
      () => Promise.reject(loggedError),
      (error) => {
        observedError = error;
      }
    );
    assert.equal(result, undefined);
    uiContinued = true;
  });

  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(uiContinued, true);
  assert.equal(observedError, loggedError);
});

test("a synchronous action log failure and its reporter are both contained", () => {
  const warningCountBefore = helperWarnings.length;
  assert.doesNotThrow(() => {
    runQuestionnaireSendBestEffort(
      () => {
        throw new Error("synchronous action log failure");
      },
      () => {
        throw new Error("audit reporter failure");
      }
    );
  });
  assert.equal(helperWarnings.length, warningCountBefore + 1);
});

test("journal keeps uncertain intent keys and requires a second explicit retry confirmation", () => {
  const journalSource = app.slice(
    journalStart,
    app.indexOf("async function saveQuestionnaireSchedule(", journalStart)
  );

  assert.match(
    journalSource,
    /const existingOutcome = questionnaireSendAttemptOutcome\(firstResult\.existing\)/
  );
  assert.match(
    journalSource,
    /if \(existingOutcome\.kind === "uncertain"\)[\s\S]*Vérifie son statut et le contact GHL/
  );
  assert.match(
    journalSource,
    /La tentative précédente s'est terminée avant tout effet externe\.[\s\S]*Créer explicitement une nouvelle tentative/
  );
  assert.match(
    journalSource,
    /saveQuestionnaireSendAttempt\(attemptKey, retrySendId\)[\s\S]*transaction\.get\(attemptRef\)[\s\S]*transaction\.get\(retryRef\)[\s\S]*transaction\.set\(retryRef, attempt\)/
  );
  assert.doesNotMatch(
    journalSource,
    /if \(existingOutcome\.kind === "uncertain"\)[\s\S]{0,500}clearQuestionnaireSendAttempt/
  );

  const createdBranch = journalSource.slice(
    journalSource.indexOf("if (firstResult.created)"),
    journalSource.indexOf(
      "const existingOutcome = questionnaireSendAttemptOutcome(firstResult.existing)"
    )
  );
  const activeBranch = journalSource.slice(
    journalSource.indexOf('if (existingOutcome.kind === "active")'),
    journalSource.indexOf('if (existingOutcome.kind === "uncertain")')
  );
  assert.doesNotMatch(createdBranch, /clearQuestionnaireSendAttempt/);
  assert.doesNotMatch(activeBranch, /clearQuestionnaireSendAttempt/);
});

test("post-commit audit logging is explicitly non-blocking", () => {
  const journalSource = app.slice(
    journalStart,
    app.indexOf("async function saveQuestionnaireSchedule(", journalStart)
  );

  assert.match(
    journalSource,
    /runQuestionnaireSendBestEffort\(\(\) => logAction\([\s\S]*"questionnaire\.send_queued"/
  );
  assert.doesNotMatch(
    journalSource,
    /await logAction\("questionnaire\.send_queued"/
  );
});
