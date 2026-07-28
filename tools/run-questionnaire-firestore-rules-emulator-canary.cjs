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
      await assertFails(setDoc(
        doc(db, "questionnaireCanaryTargets", "target"),
        { source: "questionnaire_scheduler_canary" }
      ));
      await assertFails(setDoc(
        doc(db, "questionnaireSchedulerCanaryControls", "release"),
        { source: "questionnaire_scheduler_canary" }
      ));
    }

    const scheduleRef = doc(
      coach,
      "questionnaireSchedules",
      "legacy-schedule"
    );
    const now = Timestamp.now();
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
      legacyCoachScheduleCreateReadEditPauseResume: true,
      legacyCoachDeleteDenied: true,
      adminDeleteAllowed: true,
      catalogCompatibilityVerified: true,
      externalWrites: 0
    }, null, 2)}\n`);
  } finally {
    await testEnv.cleanup();
  }
}
