import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  activeDevelopmentAssignments,
  canCompleteDevelopmentStep,
  developmentAssignmentProgress,
  developmentProgramSnapshot,
  effectiveDevelopmentAssignmentStatus,
  latestPublishedPrograms,
  nextDevelopmentVersion,
  validateDevelopmentProgram
} from "../public/development.js";

test("program validation never invents or accepts empty checklist content", () => {
  const invalid = validateDevelopmentProgram({ title: "", programType: "onboarding", steps: [] });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 2);

  const valid = validateDevelopmentProgram({
    title: "Integration coach",
    programType: "onboarding",
    steps: [{ id: "welcome", title: "Accueil", category: "Culture" }]
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.steps[0], {
    id: "welcome",
    title: "Accueil",
    description: "",
    category: "Culture",
    required: true,
    evidenceRequired: false,
    sortOrder: 1
  });
});

test("program versions are monotonic and only the latest publication is assignable", () => {
  const programs = [
    { id: "v1", familyId: "coach", title: "Coach", version: 1, status: "superseded" },
    { id: "v2", familyId: "coach", title: "Coach", version: 2, status: "published" },
    { id: "draft", familyId: "coach", title: "Coach", version: 3, status: "draft" },
    { id: "other", familyId: "ops", title: "Operations", version: 1, status: "published" }
  ];
  assert.equal(nextDevelopmentVersion(programs, "coach"), 4);
  assert.deepEqual(latestPublishedPrograms(programs).map((program) => program.id), ["v2", "other"]);
});

test("assignment snapshots preserve the exact published checklist version", () => {
  const snapshot = developmentProgramSnapshot({
    id: "program-v2",
    familyId: "program",
    title: "Programme",
    programType: "training",
    version: 2,
    steps: [{ id: "one", title: "Etape 1" }]
  });
  assert.equal(snapshot.programId, "program-v2");
  assert.equal(snapshot.programVersion, 2);
  assert.equal(snapshot.steps[0].title, "Etape 1");
});

test("assignment progress and status derive from immutable step snapshots", () => {
  const assignment = {
    steps: [
      { id: "one", title: "Un", required: true },
      { id: "two", title: "Deux", required: false }
    ],
    stepStates: { one: { status: "completed" }, two: { status: "in_progress" } }
  };
  assert.deepEqual(developmentAssignmentProgress(assignment), {
    total: 2,
    completed: 1,
    remaining: 1,
    started: 2,
    requiredTotal: 1,
    requiredCompleted: 1,
    percent: 50,
    allDone: false,
    requiredDone: true
  });
  assert.equal(effectiveDevelopmentAssignmentStatus(assignment), "in_progress");
  assignment.stepStates.two.status = "not_applicable";
  assert.equal(effectiveDevelopmentAssignmentStatus(assignment), "completed");
  assignment.status = "in_progress";
  assignment.reopenedAt = "2026-07-16T12:00:00Z";
  assert.equal(effectiveDevelopmentAssignmentStatus(assignment), "in_progress");
  assignment.reopenedAt = null;
  assert.equal(effectiveDevelopmentAssignmentStatus(assignment), "completed");
  assignment.status = "paused";
  assert.equal(effectiveDevelopmentAssignmentStatus(assignment), "paused");
});

test("required evidence blocks completion without a link", () => {
  const step = { evidenceRequired: true };
  assert.equal(canCompleteDevelopmentStep(step, { status: "completed", evidenceUrl: "" }).valid, false);
  assert.equal(canCompleteDevelopmentStep(step, { status: "completed", evidenceUrl: "https://drive.google.com/file" }).valid, true);
  assert.equal(canCompleteDevelopmentStep(step, { status: "in_progress", evidenceUrl: "" }).valid, true);
});

test("active assignment count excludes completed and archived history", () => {
  const assignments = [
    { id: "active", steps: [{ id: "one" }], stepStates: {} },
    { id: "done", steps: [{ id: "one" }], stepStates: { one: { status: "completed" } } },
    { id: "archived", archivedAt: "2026-07-01", steps: [{ id: "one" }], stepStates: {} }
  ];
  assert.deepEqual(activeDevelopmentAssignments(assignments).map((assignment) => assignment.id), ["active"]);
});

test("development collections stay owner-only and separate from the coach dashboard", async () => {
  const [rules, teamSource, coachSource] = await Promise.all([
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../../firebase-dashboard/public/app.js", import.meta.url), "utf8")
  ]);
  for (const collection of ["developmentPrograms", "developmentAssignments"]) {
    const block = rules.match(new RegExp(`match /${collection}/\\{[^}]+\\} \\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(block, `${collection} rule is present`);
    assert.match(block[1], /if isOwner\(\)/);
    assert.match(teamSource, new RegExp(`collection\\(db, "${collection}"\\)`));
    assert.doesNotMatch(coachSource, new RegExp(collection));
  }
  assert.match(rules, /resource\.data\.status == 'published'[\s\S]*request\.resource\.data\.status == 'superseded'/);
  assert.match(rules, /request\.resource\.data\.steps == resource\.data\.steps/);
  assert.match(rules, /allow delete: if false;/);
  assert.match(teamSource, /\["localhost", "127\.0\.0\.1", "::1"\]\.includes\(window\.location\.hostname\) && URL_PARAMS\.get\("preview"\) === "development"/);
  assert.match(teamSource, /if \(state\.previewMode\) return showToast\("Apercu local: aucune progression n'est ecrite\."\)/);
});

test("development program drafts use versioned transactions and keep long local edits on conflict", async () => {
  const teamSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(teamSource, /developmentProgramEditorVersion: ""/);
  assert.match(teamSource, /developmentProgramEditorHadDocument: false/);
  assert.match(teamSource, /hasVersionConflict\(current, state\.developmentProgramEditorVersion\)/);
  assert.match(teamSource, /development-program-locked/);
  assert.match(teamSource, /data-resolve-development-program-conflict="reload"/);
  assert.match(teamSource, /data-resolve-development-program-conflict="overwrite"/);
  assert.match(teamSource, /Ton brouillon local est conserve/);
  assert.match(teamSource, /const deleted = isExisting && !error\.current/);
  assert.match(teamSource, /state\.developmentPrograms = state\.developmentPrograms\.filter/);
  assert.match(teamSource, /Recreer avec mon brouillon/);
  assert.match(teamSource, /async function deleteDevelopmentProgramDraft[\s\S]*?await runTransaction/);
  assert.match(teamSource, /transaction\.delete\(programRef\)/);
  assert.match(teamSource, /intent: "delete", locked: error\.code === "development-program-locked"/);
  assert.match(teamSource, /Supprimer quand meme/);
  assert.match(teamSource, /if \(intent === "delete"\) \{\s+state\.developmentProgramForceSave = false/);
});
