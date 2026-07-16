import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  completionForRole,
  currentCycleId,
  draftDocumentId,
  hasMeaningfulAnswers,
  matchingTeamMember,
  newerDraft,
  personNameKey,
  roleQuestions
} from "../public/form-model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("cycle and draft identifiers are stable across devices", () => {
  assert.equal(currentCycleId(new Date(2026, 0, 5)), "2026-Q1");
  assert.equal(currentCycleId(new Date(2026, 6, 15)), "2026-Q3");
  assert.equal(draftDocumentId("uid/with spaces", "2026-Q3"), "uid-with-spaces_2026-Q3");
});

test("team members match by email or by name regardless of order", () => {
  const members = [
    { id: "lysanne-gosselin", name: "Lysanne Gosselin", email: "liz_gosselin@hotmail.com" }
  ];
  assert.equal(personNameKey("Gosselin, Lysanne "), personNameKey("Lysanne Gosselin"));
  assert.equal(matchingTeamMember(members, { name: "Gosselin, Lysanne" })?.id, "lysanne-gosselin");
  assert.equal(matchingTeamMember(members, { email: " LIZ_GOSSELIN@HOTMAIL.COM " })?.id, "lysanne-gosselin");
});

test("completion follows the selected role form", () => {
  const config = {
    roles: [{ id: "coach", moduleIds: ["identity", "values"] }],
    modules: [
      { id: "identity", questions: [{ id: "name", type: "short_text" }, { id: "intro", type: "info" }] },
      { id: "values", groups: [{ questions: [{ id: "value_1", type: "scale" }, { id: "value_2", type: "scale" }] }] }
    ]
  };
  assert.deepEqual(completionForRole(config, "coach", { name: "Chloe", value_1: "3" }), {
    answered: 2,
    total: 3,
    percent: 67
  });
});

test("the newest local or Firestore draft wins deterministically", () => {
  const local = { savedAt: "2026-07-15T10:00:00.000Z", selectedRoleId: "local" };
  const cloud = { updatedAt: { toMillis: () => Date.parse("2026-07-15T10:01:00.000Z") }, selectedRoleId: "cloud" };
  assert.equal(newerDraft(local, cloud), cloud);
  assert.equal(newerDraft({ ...local, savedAt: "2026-07-15T10:02:00.000Z" }, cloud)?.selectedRoleId, "local");
});

test("empty rendered controls do not trigger a destructive role-change warning", () => {
  assert.equal(hasMeaningfulAnswers({ name: "", email: "  ", scores: [] }), false);
  assert.equal(hasMeaningfulAnswers({ name: "Chloe", email: "" }), true);
});

test("Firebase form configuration stays byte-for-byte aligned with the production questionnaire", async () => {
  const [source, hosted] = await Promise.all([
    readFile(path.resolve(root, "..", "roadmap", "data", "roadmap-config.json"), "utf8"),
    readFile(path.resolve(root, "public", "roadmap-config.json"), "utf8")
  ]);
  assert.equal(hosted, source);
});

test("all eight employee roles keep their complete, unique question sets", async () => {
  const config = JSON.parse(await readFile(path.resolve(root, "public", "roadmap-config.json"), "utf8"));
  const expected = {
    coach_communaute: [62, 34],
    coach_developpement: [91, 58],
    coach_professionnel: [109, 76],
    head_coach: [78, 55],
    coordinatrice: [80, 57],
    entretien_menager: [43, 32],
    engagement_evenements: [56, 33],
    admin_autre: [37, 25]
  };
  assert.deepEqual(config.roles.map((role) => role.id).sort(), Object.keys(expected).sort());
  for (const role of config.roles) {
    const questions = roleQuestions(config, role.id);
    assert.deepEqual(
      [questions.length, questions.filter((question) => question.required).length],
      expected[role.id],
      role.id
    );
    assert.equal(new Set(questions.map((question) => question.id)).size, questions.length, `${role.id}: duplicate question id`);
  }
});

test("Firestore accepts only authorized native submissions in the owner workflow", async () => {
  const rules = await readFile(path.resolve(root, "firestore.rules"), "utf8");
  assert.match(rules, /function canSubmitRoadmap\(teamMemberId\)/);
  assert.match(rules, /request\.resource\.data\.status == 'to_read'/);
  assert.match(rules, /request\.resource\.data\.source == 'firebase'/);
  assert.match(rules, /request\.resource\.data\.clientSubmissionId == submissionId/);
  assert.doesNotMatch(rules, /roadmapSubmissions[\s\S]{0,500}status == 'submitted'/);
});
