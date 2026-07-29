import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const lib = require("../tools/questionnaire-release-announcement-lib.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runnerSource = fs.readFileSync(
  path.join(root, "tools", "manage-questionnaire-release-announcements.cjs"),
  "utf8"
);
const librarySource = fs.readFileSync(
  path.join(root, "tools", "questionnaire-release-announcement-lib.cjs"),
  "utf8"
);
const runbookSource = fs.readFileSync(
  path.join(
    root,
    "firebase-dashboard",
    "QUESTIONNAIRE_RELEASE_ANNOUNCEMENTS_RUNBOOK.md"
  ),
  "utf8"
);

const COMMIT_A = "1111111111111111111111111111111111111111";
const COMMIT_B = "2222222222222222222222222222222222222222";

function emptyState() {
  return { control: null, maintenance: null, resume: null };
}

function applyPlan(stateInput, plan) {
  const state = structuredClone(stateInput);
  const names = lib.documentNames(plan.releaseCommit);
  const stateKeyByName = new Map(
    Object.entries(names).map(([key, name]) => [name, key])
  );
  let tick = 10;
  for (const write of plan.writes) {
    const name = write.update.name;
    const key = stateKeyByName.get(name);
    assert.ok(key, `unknown plan document: ${name}`);
    const existing = state[key];
    const decoded = lib.decodeFirestoreFields(write.update.fields);
    const value = write.updateMask
      ? { ...(existing?.value || {}), ...decoded }
      : decoded;
    for (const transform of write.updateTransforms || []) {
      value[transform.fieldPath] =
        `2026-07-29T20:${String(tick).padStart(2, "0")}:00.000Z`;
      tick += 1;
    }
    state[key] = {
      name,
      createTime:
        existing?.createTime || "2026-07-29T20:00:00.000Z",
      updateTime:
        `2026-07-29T21:${String(tick).padStart(2, "0")}:00.000Z`,
      value
    };
    tick += 1;
  }
  return state;
}

test("les six modes et les IDs d'annonces sont explicites et liés au SHA complet", () => {
  assert.deepEqual(lib.MODES, [
    "maintenance-preview",
    "maintenance-execute",
    "maintenance-verify",
    "resume-preview",
    "resume-execute",
    "resume-verify"
  ]);
  for (const mode of lib.MODES) {
    assert.deepEqual(
      lib.parseArgs([`--release-commit=${COMMIT_A}`, `--${mode}`]),
      { releaseCommit: COMMIT_A, mode }
    );
  }
  const ids = lib.releaseIds(COMMIT_A);
  assert.equal(ids.controlId, `questionnaire_release_${COMMIT_A}`);
  assert.equal(
    ids.maintenanceId,
    `questionnaire_maintenance_${COMMIT_A}`
  );
  assert.equal(ids.resumeId, `questionnaire_resume_${COMMIT_A}`);
  assert.notDeepEqual(ids, lib.releaseIds(COMMIT_B));
  assert.throws(
    () => lib.parseArgs([`--release-commit=${COMMIT_A}`, "--resume"]),
    /argument_unknown/
  );
});

test("les annonces respectent le contrat coach sans PII ni promesse de coupure des liens", () => {
  const maintenance = lib.maintenanceAnnouncement(COMMIT_A);
  const resume = lib.resumeAnnouncement(COMMIT_A);
  for (const announcement of [maintenance, resume]) {
    assert.equal(announcement.audience, "coaches");
    assert.equal(announcement.status, "published");
    assert.equal(announcement.createdByEmail, "");
    assert.equal(announcement.releaseCommit, COMMIT_A);
    assert.ok(announcement.title.length <= 90);
    assert.ok(announcement.message.length <= 360);
    assert.ok(announcement.items.length <= 3);
    announcement.items.forEach((item) => assert.ok(item.length <= 180));
  }
  assert.match(maintenance.message, /N’envoie aucun nouveau questionnaire/);
  assert.match(
    maintenance.message,
    /ne demande pas aux membres d’en soumettre/
  );
  assert.match(
    maintenance.message,
    /liens existants restent accessibles autant que possible/
  );
  assert.match(resume.message, /soumission live a été enregistrée et vérifiée/);
  assert.match(resume.message, /peuvent recommencer à envoyer/);
  assert.equal(resume.livePassVerified, true);
  assert.equal(resume.livePassReleaseCommit, COMMIT_A);
});

test("le plan maintenance crée atomiquement le contrôle et l'avis, sans rejeu implicite", () => {
  const state = emptyState();
  const plan = lib.buildMaintenancePlan(state, COMMIT_A);
  const names = lib.documentNames(COMMIT_A);
  assert.equal(plan.operation, "publish_maintenance");
  assert.equal(plan.releaseCommit, COMMIT_A);
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);
  assert.equal(plan.writes.length, 2);
  assert.deepEqual(
    plan.observed.map(({ key, exists, updateTime }) => ({
      key,
      exists,
      updateTime
    })),
    [
      { key: "control", exists: false, updateTime: "" },
      { key: "maintenance", exists: false, updateTime: "" },
      { key: "resume", exists: false, updateTime: "" }
    ]
  );
  for (const write of plan.writes) {
    assert.deepEqual(write.currentDocument, { exists: false });
  }
  assert.equal(plan.writes[0].update.name, names.control);
  assert.equal(plan.writes[1].update.name, names.maintenance);

  const published = applyPlan(state, plan);
  assert.deepEqual(lib.validateMaintenanceState(published, COMMIT_A), {
    phase: "maintenance_published",
    maintenancePublished: true,
    resumePublished: false
  });
  assert.throws(
    () => lib.buildMaintenancePlan(published, COMMIT_A),
    /maintenance_control_already_exists/
  );
});

test("le planHash est lié au SHA et aux updateTime observés", () => {
  const planA = lib.buildMaintenancePlan(emptyState(), COMMIT_A);
  const planB = lib.buildMaintenancePlan(emptyState(), COMMIT_B);
  assert.notEqual(
    planA.planHash,
    planB.planHash,
    "un plan identique ne doit jamais être réutilisable sous un autre SHA"
  );

  const maintenanceState = applyPlan(emptyState(), planA);
  const resumePlan = lib.buildResumePlan(maintenanceState, COMMIT_A);
  const changedObservation = structuredClone(maintenanceState);
  changedObservation.control.updateTime = "2026-07-29T23:59:59.000Z";
  const changedPlan = lib.buildResumePlan(changedObservation, COMMIT_A);
  assert.notEqual(
    resumePlan.planHash,
    changedPlan.planHash,
    "toute nouvelle préimage Firestore observée doit changer le plan"
  );
  assert.equal(
    changedPlan.observed.find((item) => item.key === "control").updateTime,
    changedObservation.control.updateTime
  );
});

test("la reprise archive précisément la maintenance et crée l'avis dans le même commit", () => {
  const maintenancePlan = lib.buildMaintenancePlan(emptyState(), COMMIT_A);
  const maintenanceState = applyPlan(emptyState(), maintenancePlan);
  const resumePlan = lib.buildResumePlan(maintenanceState, COMMIT_A);
  const names = lib.documentNames(COMMIT_A);
  assert.equal(resumePlan.operation, "publish_resume");
  assert.equal(resumePlan.writes.length, 3);

  const controlWrite = resumePlan.writes.find(
    (write) => write.update.name === names.control
  );
  const maintenanceWrite = resumePlan.writes.find(
    (write) => write.update.name === names.maintenance
  );
  const resumeWrite = resumePlan.writes.find(
    (write) => write.update.name === names.resume
  );
  assert.equal(
    controlWrite.currentDocument.updateTime,
    maintenanceState.control.updateTime
  );
  assert.equal(
    maintenanceWrite.currentDocument.updateTime,
    maintenanceState.maintenance.updateTime
  );
  assert.deepEqual(resumeWrite.currentDocument, { exists: false });
  assert.equal(
    lib.decodeFirestoreFields(maintenanceWrite.update.fields).status,
    "archived"
  );
  assert.equal(
    lib.decodeFirestoreFields(resumeWrite.update.fields).status,
    "published"
  );

  const resumed = applyPlan(maintenanceState, resumePlan);
  assert.deepEqual(lib.validateResumeState(resumed, COMMIT_A), {
    phase: "resume_published",
    maintenanceArchived: true,
    resumePublished: true,
    livePassReleaseCommit: COMMIT_A
  });
  assert.throws(
    () => lib.buildResumePlan(resumed, COMMIT_A),
    /announcement_control_mismatch/
  );
});

test("la reprise ne peut être autorisée sans GO, planHash et preuve live liés au SHA", () => {
  const maintenancePlan = lib.buildMaintenancePlan(emptyState(), COMMIT_A);
  const maintenanceState = applyPlan(emptyState(), maintenancePlan);
  const resumePlan = lib.buildResumePlan(maintenanceState, COMMIT_A);
  assert.deepEqual(
    lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT_A, mode: "resume-preview" },
      resumePlan.planHash,
      {}
    ),
    { authorized: false, readOnly: true }
  );
  assert.throws(
    () => lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT_A, mode: "resume-execute" },
      resumePlan.planHash,
      {}
    ),
    /resume_go_missing/
  );
  const armedWithoutProof = {
    CFSB_QUESTIONNAIRE_RESUME_GO: COMMIT_A,
    CFSB_QUESTIONNAIRE_RESUME_PLAN_HASH: resumePlan.planHash
  };
  assert.throws(
    () => lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT_A, mode: "resume-execute" },
      resumePlan.planHash,
      armedWithoutProof
    ),
    /live_pass_proof_missing/
  );
  assert.throws(
    () => lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT_A, mode: "resume-execute" },
      resumePlan.planHash,
      {
        ...armedWithoutProof,
        CFSB_QUESTIONNAIRE_LIVE_PASS_SHA: COMMIT_B
      }
    ),
    /live_pass_proof_missing/
  );
  assert.equal(
    lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT_A, mode: "resume-execute" },
      resumePlan.planHash,
      {
        ...armedWithoutProof,
        CFSB_QUESTIONNAIRE_LIVE_PASS_SHA: COMMIT_A
      }
    ).authorized,
    true
  );
});

test("l'autorisation maintenance est distincte et ne requiert aucune fausse preuve live", () => {
  const plan = lib.buildMaintenancePlan(emptyState(), COMMIT_A);
  const validEnv = {
    CFSB_QUESTIONNAIRE_MAINTENANCE_GO: COMMIT_A,
    CFSB_QUESTIONNAIRE_MAINTENANCE_PLAN_HASH: plan.planHash
  };
  assert.equal(
    lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT_A, mode: "maintenance-execute" },
      plan.planHash,
      validEnv
    ).authorized,
    true
  );
  assert.throws(
    () => lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT_A, mode: "maintenance-execute" },
      plan.planHash,
      {
        ...validEnv,
        CFSB_QUESTIONNAIRE_MAINTENANCE_PLAN_HASH: "f".repeat(64)
      }
    ),
    /maintenance_plan_hash_mismatch/
  );
});

test("les vérifications sont fail-closed sur toute dérive et le runner ne divulgue rien", () => {
  const maintenancePlan = lib.buildMaintenancePlan(emptyState(), COMMIT_A);
  const maintenanceState = applyPlan(emptyState(), maintenancePlan);
  const drifted = structuredClone(maintenanceState);
  drifted.maintenance.value.audience = "all";
  assert.throws(
    () => lib.validateMaintenanceState(drifted, COMMIT_A),
    /announcement_document_mismatch/
  );

  assert.ok(
    runnerSource.indexOf("verifySealedCandidate(options.releaseCommit)")
      < runnerSource.indexOf("firebaseAccessToken()")
  );
  assert.match(
    runnerSource,
    /verifyExecutionAuthority\(options, plan\.planHash\)/
  );
  assert.match(runnerSource, /rawDocumentsPrinted: false/);
  assert.doesNotMatch(runnerSource, /JSON\.stringify\(\s*stateBefore/);
  assert.doesNotMatch(
    runnerSource,
    /console\.error\(error\.(?:stack|message)/
  );
  assert.doesNotMatch(
    runnerSource,
    /process\.stdout\.write\([^)]*accessToken/
  );
  assert.doesNotMatch(
    `${runnerSource}\n${librarySource}`,
    /questionnaireResponses|clientPhone|phoneNormalized/
  );
  assert.match(librarySource, /releaseCommit:\s*assertReleaseCommit/);
  assert.match(librarySource, /observed:\s*observedState/);
});

test("le runbook impose la maintenance avant mutation et la preuve live avant reprise", () => {
  for (const mode of lib.MODES) {
    assert.match(runbookSource, new RegExp(`--${mode}`));
  }
  assert.match(
    runbookSource,
    /Ne commencer aucune mutation questionnaires tant que cette vérification/
  );
  assert.match(runbookSource, /CFSB_QUESTIONNAIRE_LIVE_PASS_SHA/);
  assert.match(
    runbookSource,
    /Le simple fait que les tests locaux passent ne constitue pas cette preuve/
  );
  assert.match(runbookSource, /ne\s+pas relancer `--maintenance-execute`/);
  assert.match(runbookSource, /ne pas relancer\s+l’exécution/);
});
