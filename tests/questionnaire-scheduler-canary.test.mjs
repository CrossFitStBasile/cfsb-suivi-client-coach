import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const lib = require(path.join(root, "tools", "questionnaire-scheduler-canary-lib.cjs"));
const functionsSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const runnerSource = fs.readFileSync(
  path.join(root, "tools", "run-questionnaire-scheduler-canary.cjs"),
  "utf8"
);
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const commit = "a".repeat(40);
const now = Date.now();
const armedUntil = new Date(now + (10 * 60 * 1000)).toISOString();

test("canary CLI modes and release SHA fail closed", () => {
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--execute-empty"]),
    { mode: "execute-empty", releaseCommit: commit }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--execute-positive"]),
    { mode: "execute-positive", releaseCommit: commit }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--execute-process"]),
    { mode: "execute-process", releaseCommit: commit }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--pin-contact"]),
    { mode: "pin-contact", releaseCommit: commit }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--cleanup"]),
    { mode: "cleanup", releaseCommit: commit }
  );
  assert.throws(
    () => lib.parseArgs([`--release-commit=${commit}`, "--execute-empty", "--execute-positive"]),
    /mode_conflict/
  );
  assert.throws(() => lib.parseArgs(["--execute-empty"]), /release_commit_missing/);
  assert.throws(() => lib.parseArgs(["--release-commit=abc"]), /release_commit_invalid/);
  assert.throws(() => lib.parseArgs([`--release-commit=${commit}`, "--force"]), /argument_unknown/);
});

test("deterministic canary IDs depend only on the sealed SHA", () => {
  assert.deepEqual(lib.canaryIds(commit), {
    targetId: `system_questionnaire_canary_${"a".repeat(12)}`,
    scheduleId: `system_questionnaire_schedule_canary_${"a".repeat(12)}`
  });
  assert.notDeepEqual(lib.canaryIds("b".repeat(40)), lib.canaryIds(commit));
  assert.equal(
    lib.processCanarySendId(commit),
    `system_questionnaire_process_canary_${"a".repeat(12)}`
  );
});

test("synthetic GHL contact requires explicit name, tag, unique ID and valid phone", () => {
  const valid = {
    id: "syntheticContact01",
    name: "CFSB Questionnaire Canary",
    phone: "514-555-0100",
    tags: ["qa", lib.SYNTHETIC_CONTACT_MARKER_TAG]
  };
  assert.equal(lib.explicitSyntheticContact(valid), true);
  assert.equal(lib.explicitSyntheticContact({ ...valid, name: "Ordinary Member" }), false);
  assert.equal(lib.explicitSyntheticContact({ ...valid, tags: ["ordinary"] }), false);
  assert.equal(
    lib.explicitSyntheticContact({ ...valid, tags: ["qa", "internal-test"] }),
    false
  );
  assert.equal(lib.explicitSyntheticContact({ ...valid, phone: "555" }), false);
  assert.equal(lib.explicitSyntheticContact({ ...valid, phone: "514-555-2100" }), false);
  assert.match(lib.contactConfirmationFingerprint(valid), /^[a-f0-9]{64}$/);
  assert.equal(lib.selectUniqueSyntheticContact([[valid]]), valid);
  assert.throws(
    () => lib.selectUniqueSyntheticContact([[valid, { ...valid, id: "syntheticContact02" }]]),
    /synthetic_contact_not_unique/
  );
  assert.throws(
    () => lib.selectUniqueSyntheticContact([[{ ...valid, tags: [...valid.tags, "dashboardcoach"] }]]),
    /synthetic_contact_target_tag_already_present/
  );
  assert.throws(
    () => lib.selectUniqueSyntheticContact(
      [[{ ...valid, tags: [...valid.tags, "suiviregulier"] }]],
      { targetTag: "suiviregulier" }
    ),
    /synthetic_contact_target_tag_already_present/
  );
});

test("positive canary fixture is private, non-member, non-selectable and admin-only", () => {
  const target = lib.buildCanaryTarget({
    releaseCommit: commit,
    armedUntil,
    expectedGhlContactId: "syntheticContact01",
    phoneNormalized: "5145550100"
  });
  const schedule = lib.buildCanarySchedule({
    releaseCommit: commit,
    armedUntil,
    todayToronto: "2026-07-28",
    requestedByUid: "adminUid",
    requestedByEmail: "admin@example.invalid",
    phoneNormalized: "5145550100"
  });
  assert.equal(target.entityType, "system");
  assert.equal(target.ownershipStatus, "canary");
  assert.equal(target.clientSelectable, false);
  assert.equal(target.coachId, "admin");
  assert.equal(schedule.coachId, "admin");
  assert.equal(schedule.frequency, "once");
  assert.equal(schedule.formId, "");
  assert.equal(schedule.status, "active");
  assert.equal(schedule.nextSendAt, "2026-07-28");
  assert.equal(lib.canaryTargetMatches(target, commit, now), true);
  assert.equal(lib.canaryTargetMatches({ ...target, entityType: "member" }, commit, now), false);
  assert.throws(
    () => lib.buildCanaryTarget({
      releaseCommit: commit,
      armedUntil,
      expectedGhlContactId: "syntheticContact01",
      phoneNormalized: "5145552100"
    }),
    /synthetic_phone_not_reserved/
  );
  assert.equal(lib.canaryScheduleMatches(schedule, commit, "2026-07-28", now), true);
  assert.equal(lib.canaryScheduleMatches({ ...schedule, coachId: "15935" }, commit, "2026-07-28", now), false);
  const processSend = lib.buildProcessCanarySend({
    releaseCommit: commit,
    armedUntil,
    requestedByUid: "adminUid",
    requestedByEmail: "admin@example.invalid",
    phoneNormalized: "5145550100"
  });
  assert.equal(processSend.questionnaireCanaryMode, "process");
  assert.equal(processSend.questionnaireType, "habitudes_quotidiennes");
  assert.equal(processSend.questionnaireScheduleId, "");
  assert.equal(processSend.coachId, "admin");
  const control = lib.buildCanaryControl({
    releaseCommit: commit,
    armedUntil,
    mode: "positive",
    nonce: "b".repeat(32)
  });
  assert.equal(control.expectedScheduleId, lib.canaryIds(commit).scheduleId);
  assert.equal(control.expectedJobName, lib.EXPECTED_SCHEDULER_JOB_NAME);
  assert.equal(
    lib.canaryControlOwnedForCleanup(control, commit, "positive", "b".repeat(32)),
    true
  );
  assert.equal(
    lib.canaryControlActive(
      control,
      commit,
      "positive",
      "b".repeat(32),
      { nowMs: now, minimumTtlMs: 2 * 60 * 1000 }
    ),
    true
  );
  assert.equal(
    lib.canaryControlActive(
      control,
      commit,
      "positive",
      "c".repeat(32),
      { nowMs: now, minimumTtlMs: 2 * 60 * 1000 }
    ),
    false
  );
});

test("a positive scheduler canary cannot be repeated after Toronto midnight", () => {
  const priorDay = {
    source: "dashboard_questionnaire_scheduled",
    questionnaireCanaryOnly: true,
    questionnaireCanarySource: lib.CANARY_SOURCE,
    questionnaireCanaryMode: "scheduler",
    canaryReleaseCommit: commit,
    scheduledFor: "2026-07-27"
  };
  assert.equal(lib.positiveCanaryAttemptExists([priorDay], commit), true);
  assert.equal(
    lib.positiveCanaryAttemptExists(
      [{ ...priorDay, questionnaireCanaryMode: "process" }],
      commit
    ),
    false
  );
  assert.equal(
    lib.positiveCanaryAttemptExists(
      [{ ...priorDay, canaryReleaseCommit: "b".repeat(40) }],
      commit
    ),
    false
  );
});

test("cleanup defers GHL while an external-effect claim can still be in flight", () => {
  assert.equal(
    lib.canarySendRequiresDeferredExternalCleanup({
      status: "error",
      externalEffectState: "started"
    }),
    true
  );
  assert.equal(
    lib.canarySendRequiresDeferredExternalCleanup({
      status: "sent",
      externalEffectState: "completed"
    }),
    false
  );
  assert.equal(
    lib.canarySendRequiresDeferredExternalCleanup({
      status: "error",
      externalEffectState: "uncertain"
    }),
    false
  );
  assert.equal(
    lib.canarySendHasUncertainExternalEffect({
      status: "error",
      externalEffectState: "uncertain"
    }),
    true
  );
  assert.equal(
    lib.canarySendHasUncertainExternalEffect({
      status: "pending",
      externalEffectState: "uncertain"
    }),
    false
  );
  assert.equal(
    lib.canarySendRequiresDeferredExternalCleanup({ status: "pending" }),
    true
  );
});

test("Firestore encoding keeps scheduler dates and TTL as strings", () => {
  const fields = lib.encodeFirestoreFields({
    nextSendAt: "2026-07-28",
    armedUntil,
    createdAt: "2026-07-28T20:00:00.000Z",
    questionnaireCanaryOnly: true
  });
  assert.equal(fields.nextSendAt.stringValue, "2026-07-28");
  assert.equal(fields.armedUntil.stringValue, armedUntil);
  assert.equal(fields.createdAt.timestampValue, "2026-07-28T20:00:00.000Z");
  assert.equal(fields.questionnaireCanaryOnly.booleanValue, true);
});

test("backend never loosens ordinary member matching for the canary", () => {
  assert.match(
    functionsSource,
    /function clientRecordAvailableForMatching[\s\S]*entityType\) !== "member"[\s\S]*ownershipStatus\) !== "confirmed"[\s\S]*clientSelectable !== true/
  );
  assert.match(
    functionsSource,
    /canaryEnvelope \? "questionnaireCanaryTargets" : "clients"/
  );
  assert.match(
    functionsSource,
    /questionnaireSchedulerCanaryTargetAvailable[\s\S]*entityType\) !== "system"[\s\S]*clientSelectable !== false/
  );
  assert.match(functionsSource, /cleanString\(coachId\) !== "admin"/);
  assert.match(functionsSource, /profile\.role !== "admin"/);
  assert.match(functionsSource, /canary_contact_mismatch/);
  assert.match(functionsSource, /claimQuestionnaireCanaryExternalEffect/);
  assert.match(functionsSource, /transaction\.get\(targetRef\)/);
  assert.match(
    functionsSource,
    /questionnaireSchedulerCanaryExpectedGhlContactId\(target\.expectedGhlContactId\)[\s\S]*!== normalizedContactId/
  );
  assert.match(
    functionsSource,
    /claimQuestionnaireCanaryExternalEffect[\s\S]*questionnaireSchedulerCanarySendAvailable/
  );
  assert.match(
    functionsSource,
    /afterClaim\.externalEffectState[\s\S]*return;/
  );
  assert.match(functionsSource, /questionnaireSchedulerCanaryPhone/);
  assert.match(functionsSource, /externalEffectState: "uncertain"/);
  assert.match(functionsSource, /QUESTIONNAIRE_PROCESS_CANARY_SEND_PREFIX/);
  assert.match(functionsSource, /mode === "process"/);
  assert.match(functionsSource, /questionnaireSchedulerSafety\.controlDecision/);
  assert.match(functionsSource, /canaryNonce: canaryControl\.nonce/);
  assert.match(functionsSource, /queueQuestionnaireScheduleSendAtomically/);
  assert.match(functionsSource, /transaction\.create|queueScheduleSendAtomically/);
  assert.doesNotMatch(functionsSource, /batch\.set\(docSnap\.ref/);
  assert.match(functionsSource, /batch\.update\(docSnap\.ref/);
});

test("canary target is closed to every Dashboard client", () => {
  assert.match(
    rulesSource,
    /match \/questionnaireCanaryTargets\/\{targetId\}[\s\S]*allow read, write: if false;/
  );
  assert.match(
    rulesSource,
    /match \/questionnaireSchedulerCanaryControls\/\{controlId\}[\s\S]*allow read, write: if false;/
  );
});

test("runner preserves only aggregate evidence and exact synthetic cleanup", () => {
  assert.match(runnerSource, /error: safeResultError\(error\)/);
  assert.match(runnerSource, /questionnaireSends: 1/);
  assert.match(runnerSource, /mode: "execute-process"/);
  assert.match(runnerSource, /process_canary_send_terminal_mismatch/);
  assert.match(runnerSource, /createCanaryControl\(context, "empty"\)/);
  assert.match(runnerSource, /createCanaryControl\(context, "positive"\)/);
  assert.match(runnerSource, /currentDocument\.updateTime/);
  assert.doesNotMatch(runnerSource, /currentDocument\.exists/);
  assert.match(runnerSource, /readPinnedContactReceipt/);
  assert.match(runnerSource, /discoverPinnedSyntheticContact/);
  assert.match(runnerSource, /cleanupSyntheticGhlTag/);
  assert.match(runnerSource, /mode: "cleanup"/);
  assert.match(runnerSource, /questionnaireSendsDeleted: 0/);
  assert.match(runnerSource, /CFSB_QUESTIONNAIRE_RECOVERY_GO/);
  assert.match(runnerSource, /firestoreRecoveryComplete: true/);
  assert.match(runnerSource, /ghlCleanupStatus/);
  assert.match(runnerSource, /nonTerminalSendEvidencePreserved/);
  assert.match(runnerSource, /cancelCanaryTargetIfOwned/);
  assert.match(runnerSource, /positiveCanaryAttemptExists/);
  assert.match(runnerSource, /positive_canary_release_already_attempted/);
  assert.match(runnerSource, /process_canary_target_tag_not_observed/);
  assert.match(runnerSource, /positive_canary_target_tag_not_observed/);
  assert.match(runnerSource, /synthetic_contact_matches_dashboard_member/);
  assert.match(runnerSource, /CFSB_QUESTIONNAIRE_CANARY_CONTACT_FINGERPRINT/);
  assert.match(runnerSource, /scheduler_job_changed_before_trigger/);
  assert.match(
    runnerSource,
    /async function triggerSchedulerJob[\s\S]*assertCanaryControlReady\(context, controlProof\)[\s\S]*getAndValidateSchedulerJob\(context\)[\s\S]*assertCanaryControlReady\(context, controlProof\)[\s\S]*cloudscheduler\.googleapis\.com/
  );
  assert.match(runnerSource, /scheduler_attempt_deadline_mismatch/);
  assert.match(runnerSource, /scheduler_job_status_invalid/);
  assert.match(runnerSource, /lastExecutionStatusCode/);
  assert.doesNotMatch(runnerSource, /scheduler_job_status_error/);
  assert.match(runnerSource, /targetUri !== functionUri/);
  assert.match(runnerSource, /minimumTtlMs: MINIMUM_CONTROL_TTL_MS/);
  assert.match(runnerSource, /targetTagObserved: tagCleanup\.tagObserved/);
  assert.doesNotMatch(runnerSource, /targetTagApiConfirmed: true/);
  assert.match(runnerSource, /syntheticFixturesRemoved: true/);
  assert.match(runnerSource, /pauseCanaryScheduleIfOwned/);
  assert.match(runnerSource, /waitForRecoverableCanarySendsToQuiesce/);
  assert.match(runnerSource, /externalEffectQuiescent: true/);
  assert.match(runnerSource, /reconcileUncertainCanaryExternalEffects/);
  assert.match(runnerSource, /externalEffectUncertainAt/);
  assert.match(runnerSource, /UNCERTAIN_EFFECT_SETTLEMENT_MS = 20_000/);
  assert.match(runnerSource, /UNCERTAIN_EFFECT_OBSERVATION_ATTEMPTS = 7/);
  assert.match(runnerSource, /uncertainExternalEffectsReconciled/);
  assert.match(runnerSource, /canary_schedule_cleanup_target_mismatch/);
  assert.doesNotMatch(runnerSource, /console\.log\(.*contact/i);
  assert.doesNotMatch(runnerSource, /process\.stdout\.write\(.*phone/i);
  assert.equal(lib.safeResultError(new Error("private@example.com 5145550100")), "unexpected_error");
});
