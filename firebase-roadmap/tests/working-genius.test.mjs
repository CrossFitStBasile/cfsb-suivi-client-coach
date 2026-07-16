import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  WORKING_GENIUS_TYPES,
  validateWorkingGeniusProfile,
  workingGeniusProfileStatus,
  workingGeniusTeamMap,
  workingGeniusTeamSummary
} from "../public/working-genius.js";

test("the imported model uses the six official result codes without recreating the assessment", () => {
  assert.deepEqual(WORKING_GENIUS_TYPES.map((type) => type.code), ["W", "I", "D", "G", "E", "T"]);
  assert.deepEqual(WORKING_GENIUS_TYPES.map((type) => type.label), ["Wonder", "Invention", "Discernment", "Galvanizing", "Enablement", "Tenacity"]);
});

test("profiles accept partial imports but reject duplicate or oversized categories", () => {
  const partial = validateWorkingGeniusProfile({ teamMemberId: "member", geniuses: ["W"], reportUrl: "https://example.com/report" });
  assert.equal(partial.valid, true);
  assert.equal(partial.status, "partial");

  const duplicate = validateWorkingGeniusProfile({ teamMemberId: "member", geniuses: ["W", "I"], competencies: ["W"] });
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.errors.join(" "), /une seule categorie/);

  const oversized = validateWorkingGeniusProfile({ teamMemberId: "member", geniuses: ["W", "I", "D"] });
  assert.equal(oversized.valid, false);
  assert.match(oversized.errors.join(" "), /maximum de deux/);
});

test("a complete profile contains two unique results in each category", () => {
  const profile = {
    teamMemberId: "member",
    geniuses: ["W", "I"],
    competencies: ["D", "G"],
    frustrations: ["E", "T"]
  };
  assert.equal(validateWorkingGeniusProfile(profile).valid, true);
  assert.equal(workingGeniusProfileStatus(profile), "complete");
});

test("the team map shows only imported geniuses and never infers missing results", () => {
  const members = [{ id: "one", name: "Alex" }, { id: "two", name: "Sam" }, { id: "three", name: "Jo" }];
  const profiles = {
    one: { geniuses: ["W", "I"], competencies: ["D"], frustrations: [] },
    two: { geniuses: ["W", "T"], competencies: [], frustrations: [] }
  };
  const map = workingGeniusTeamMap(members, profiles);
  assert.deepEqual(map.find((item) => item.code === "W").members.map((member) => member.name), ["Alex", "Sam"]);
  assert.deepEqual(map.find((item) => item.code === "D").members, []);
  assert.deepEqual(workingGeniusTeamSummary(members, profiles), { total: 3, complete: 0, partial: 2, missing: 1 });
});

test("Working Genius records stay owner-only and absent from member and coach surfaces", async () => {
  const [rules, ownerSource, portalSource, coachSource] = await Promise.all([
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/portal.js", import.meta.url), "utf8"),
    readFile(new URL("../../firebase-dashboard/public/app.js", import.meta.url), "utf8")
  ]);
  const block = rules.match(/match \/workingGeniusProfiles\/\{memberId\} \{([\s\S]*?)\n    \}/);
  assert.ok(block);
  assert.match(block[1], /allow read: if isOwner\(\)/);
  assert.match(block[1], /sourceType == 'official_report'/);
  assert.match(block[1], /geniuses\.size\(\) <= 2/);
  assert.match(block[1], /!request\.resource\.data\.geniuses\.hasAny\(request\.resource\.data\.competencies\)/);
  assert.match(ownerSource, /collection\(db, "workingGeniusProfiles"\)/);
  assert.doesNotMatch(portalSource, /workingGeniusProfiles/);
  assert.doesNotMatch(coachSource, /workingGeniusProfiles/);
});
