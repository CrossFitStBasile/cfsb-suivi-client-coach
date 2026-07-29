"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const ROOT = path.resolve(__dirname, "..");
const MODULE_ROOT = String(
  process.env.CFSB_FIRESTORE_RULES_TEST_MODULE_ROOT || ""
).trim();
if (!MODULE_ROOT) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    check: "questionnaire_firestore_rules_emulator",
    error: "test_runtime_missing"
  }, null, 2)}\n`);
  process.exit(1);
}

const runtimeRequire = createRequire(path.join(MODULE_ROOT, "package.json"));
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = runtimeRequire("@firebase/rules-unit-testing");
const {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc
} = runtimeRequire("firebase/firestore");

main().catch(() => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    check: "questionnaire_firestore_rules_emulator",
    error: "emulator_canary_failed"
  }, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  if (
    process.env.GCLOUD_PROJECT !== "demo-cfsb-questionnaire-rules"
    || !process.env.FIRESTORE_EMULATOR_HOST
  ) {
    throw new Error("emulator_only");
  }
  const rules = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
  const testEnv = await initializeTestEnvironment({
    projectId: "demo-cfsb-questionnaire-rules",
    firestore: { rules }
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users", "admin-user"), {
        active: true,
        role: "admin",
        coachId: "admin"
      });
      await setDoc(doc(db, "users", "coach-user"), {
        active: true,
        role: "coach",
        coachId: "15935"
      });
      await setDoc(doc(db, "clients", "member-one"), {
        coachId: "15935",
        entityType: "member",
        ownershipStatus: "confirmed",
        clientSelectable: true,
        status: "active"
      });
      await setDoc(doc(db, "questionnaireCatalog", "published-form"), {
        status: "published",
        deliveryReady: false
      });
      const responseBase = {
        coachId: "15935",
        clientId: "member-one",
        internalClientId: "member-one",
        clientName: "Membre",
        processingStatus: "to_read",
        sourceResponseConflict: false
      };
      await setDoc(doc(db, "questionnaireResponses", "identity-review"), {
        ...responseBase,
        identityMatchReviewRequired: true
      });
      await setDoc(doc(db, "questionnaireResponses", "source-review"), {
        ...responseBase,
        sourceResponseConflict: true,
        sourceResponseConflictResolvedAt: ""
      });
      await setDoc(doc(db, "questionnaireResponses", "source-resolved"), {
        ...responseBase,
        sourceResponseConflict: true,
        sourceResponseConflictResolvedAt: nowTimestamp()
      });
      await setDoc(doc(db, "questionnaireResponses", "ordinary-response"), {
        ...responseBase
      });
      await setDoc(doc(db, "tasks", "blocked-questionnaire-task"), {
        coachId: "15935",
        clientId: "member-one",
        clientName: "Membre",
        type: "questionnaire_followup",
        sourceResponseId: "identity-review",
        status: "open"
      });
    });

    const admin = testEnv.authenticatedContext("admin-user", {
      email: "admin@example.invalid"
    }).firestore();
    const coach = testEnv.authenticatedContext("coach-user", {
      email: "coach@example.invalid"
    }).firestore();
    const anonymous = testEnv.unauthenticatedContext().firestore();

    for (const db of [anonymous, admin, coach]) {
      await assertFails(getDoc(doc(db, "questionnaireCanaryTargets", "target")));
      await assertFails(
        getDoc(doc(db, "questionnaireSchedulerCanaryControls", "release"))
      );
      await assertFails(
        getDoc(doc(
          db,
          "questionnaireSchedulerCanaryControls",
          "contact-provision-5145550100"
        ))
      );
      await assertFails(setDoc(
        doc(db, "questionnaireCanaryTargets", "target"),
        { source: "questionnaire_scheduler_canary" }
      ));
      await assertFails(setDoc(
        doc(db, "questionnaireSchedulerCanaryControls", "release"),
        { source: "questionnaire_scheduler_canary" }
      ));
      await assertFails(setDoc(
        doc(
          db,
          "questionnaireSchedulerCanaryControls",
          "contact-provision-5145550100"
        ),
        { source: "questionnaire_scheduler_canary" }
      ));
    }

    const scheduleRef = doc(
      coach,
      "questionnaireSchedules",
      "legacy-schedule"
    );
    const now = Timestamp.now();
    const legacySendPayload = {
      coachId: "15935",
      clientId: "member-one",
      clientName: "Membre",
      clientPhoneNormalized: "5145550101",
      coachName: "Coach",
      status: "pending",
      deliveryStatus: "firestore_queue_pending",
      errorMessage: "",
      questionnaireType: "suivi_global",
      questionnaireLabel: "Questionnaire historique",
      requestedByUid: "coach-user",
      requestedByEmail: "coach@example.invalid",
      createdAt: now,
      updatedAt: now,
      source: "dashboard_questionnaire_send_click"
    };
    await assertSucceeds(setDoc(
      doc(coach, "questionnaireSends", "legacy-send-before-hosting"),
      legacySendPayload
    ));
    await assertSucceeds(setDoc(
      doc(coach, "questionnaireSends", "new-send-after-hosting"),
      { ...legacySendPayload, externalEffectState: "not_started" }
    ));
    await assertFails(setDoc(
      doc(coach, "questionnaireSends", "unsafe-send-effect-started"),
      { ...legacySendPayload, externalEffectState: "started" }
    ));
    await assertSucceeds(deleteDoc(
      doc(admin, "questionnaireSends", "legacy-send-before-hosting")
    ));
    await assertSucceeds(deleteDoc(
      doc(admin, "questionnaireSends", "new-send-after-hosting")
    ));

    await assertSucceeds(setDoc(scheduleRef, {
      coachId: "15935",
      coachRxId: "15935",
      coachName: "Coach",
      clientId: "member-one",
      clientName: "Membre",
      clientPhoneNormalized: "5145550101",
      questionnaireType: "suivi_global",
      formId: "",
      frequency: "every_2_weeks",
      nextSendAt: "2026-08-10",
      status: "active",
      requestedByUid: "coach-user",
      requestedByEmail: "coach@example.invalid",
      createdAt: now,
      updatedAt: now,
      source: "dashboard_questionnaire_schedule"
    }));
    if (!(await assertSucceeds(getDoc(scheduleRef))).exists()) {
      throw new Error("legacy_schedule_missing");
    }
    await assertSucceeds(updateDoc(scheduleRef, {
      status: "paused",
      statusChangedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }));
    await assertSucceeds(updateDoc(scheduleRef, {
      status: "active",
      statusChangedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }));
    await assertSucceeds(updateDoc(scheduleRef, {
      note: "Canari local",
      requestedByUid: "coach-user",
      requestedByEmail: "coach@example.invalid",
      updatedAt: Timestamp.now()
    }));
    await assertFails(deleteDoc(scheduleRef));
    await assertSucceeds(deleteDoc(
      doc(admin, "questionnaireSchedules", "legacy-schedule")
    ));

    await assertFails(updateDoc(
      doc(coach, "questionnaireResponses", "identity-review"),
      {
        processingStatus: "read",
        readAt: Timestamp.now(),
        readByUid: "coach-user",
        readByEmail: "coach@example.invalid",
        updatedAt: Timestamp.now()
      }
    ));
    await assertFails(updateDoc(
      doc(coach, "questionnaireResponses", "source-review"),
      {
        processingStatus: "read",
        readAt: Timestamp.now(),
        readByUid: "coach-user",
        readByEmail: "coach@example.invalid",
        updatedAt: Timestamp.now()
      }
    ));
    for (const responseId of ["source-resolved", "ordinary-response"]) {
      await assertSucceeds(updateDoc(
        doc(coach, "questionnaireResponses", responseId),
        {
          processingStatus: "read",
          readAt: Timestamp.now(),
          readByUid: "coach-user",
          readByEmail: "coach@example.invalid",
          updatedAt: Timestamp.now()
        }
      ));
    }
    const linkedTaskPayload = {
      coachId: "15935",
      clientId: "member-one",
      clientName: "Membre",
      type: "questionnaire_followup",
      status: "open"
    };
    await assertFails(setDoc(
      doc(coach, "tasks", "coach-task-blocked"),
      {
        ...linkedTaskPayload,
        questionnaireResponseId: "source-review"
      }
    ));
    await assertSucceeds(setDoc(
      doc(coach, "tasks", "coach-task-resolved"),
      {
        ...linkedTaskPayload,
        questionnaireResponseId: "source-resolved"
      }
    ));
    await assertFails(updateDoc(
      doc(coach, "tasks", "blocked-questionnaire-task"),
      { status: "done" }
    ));
    await assertFails(deleteDoc(
      doc(coach, "tasks", "blocked-questionnaire-task")
    ));
    await assertSucceeds(updateDoc(
      doc(admin, "questionnaireResponses", "identity-review"),
      {
        identityMatchReviewRequired: false,
        identityMatchConflict: false,
        identityMatchConflictReason: ""
      }
    ));
    await assertSucceeds(updateDoc(
      doc(coach, "tasks", "blocked-questionnaire-task"),
      { status: "done" }
    ));
    await assertSucceeds(deleteDoc(
      doc(admin, "tasks", "blocked-questionnaire-task")
    ));
    await assertSucceeds(deleteDoc(
      doc(admin, "tasks", "coach-task-resolved")
    ));

    await assertSucceeds(
      getDoc(doc(coach, "questionnaireCatalog", "published-form"))
    );
    await assertFails(getDoc(doc(coach, "questionnaireForms", "draft-form")));
    await assertSucceeds(
      getDoc(doc(admin, "questionnaireForms", "draft-form"))
    );

    process.stdout.write(`${JSON.stringify({
      ok: true,
      check: "questionnaire_firestore_rules_emulator",
      privateCanaryCollectionsDeniedForAllClients: true,
      legacyAndNewSendPayloadsAcceptedDuringStagedHosting: true,
      unsafeExternalEffectStateDenied: true,
      legacyCoachScheduleCreateReadEditPauseResume: true,
      legacyCoachDeleteDenied: true,
      adminDeleteAllowed: true,
      unresolvedQuestionnaireCoachActionsDenied: true,
      adminIdentityResolutionRemainsAllowed: true,
      resolvedQuestionnaireCoachActionsAllowed: true,
      catalogCompatibilityVerified: true,
      externalWrites: 0
    }, null, 2)}\n`);
  } finally {
    await testEnv.cleanup();
  }
}

function nowTimestamp() {
  return Timestamp.now();
}
