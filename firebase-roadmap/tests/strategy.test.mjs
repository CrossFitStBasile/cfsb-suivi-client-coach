import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  STRATEGY_SOURCE_BASELINE,
  cloneStrategyBaseline,
  sortStrategyDecisions,
  strategyCoverage,
  validateStrategyDecision,
  validateStrategyProfile
} from "../public/strategy.js";

test("the strategy baseline keeps exact Drive provenance and an explicit review status", () => {
  assert.equal(STRATEGY_SOURCE_BASELINE.status, "source_review");
  assert.match(STRATEGY_SOURCE_BASELINE.vision, /Impacter nos membres/);
  assert.match(STRATEGY_SOURCE_BASELINE.mission, /5 piliers/);
  assert.equal(STRATEGY_SOURCE_BASELINE.values.length, 4);
  assert.deepEqual(STRATEGY_SOURCE_BASELINE.sourceDocuments.map((source) => source.url), [
    "https://docs.google.com/document/d/1P29zUceTU56MESq6g12zHkgmL71zNQoNf3yMcwKQk4U/edit",
    "https://drive.google.com/file/d/1d8SopS0PomxP9CejoENkyLlS7DXKESuh/view"
  ]);
});

test("coverage reports missing annual goals without pretending the strategy is validated", () => {
  const coverage = strategyCoverage(cloneStrategyBaseline());
  assert.equal(coverage.total, 14);
  assert.equal(coverage.missing, 1);
  assert.equal(coverage.validated, false);
});

test("validated strategy requires vision, mission and four complete values", () => {
  const invalid = validateStrategyProfile({ status: "validated", title: "CFSB", vision: "", mission: "", values: [] });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 3);
  const valid = validateStrategyProfile({ ...cloneStrategyBaseline(), status: "validated" });
  assert.equal(valid.valid, true);
});

test("decision register requires a dated concrete decision and sorts newest first", () => {
  assert.equal(validateStrategyDecision({ title: "Sujet" }).valid, false);
  assert.equal(validateStrategyDecision({ decisionDate: "2026-07-16", title: "Sujet", decision: "Decision prise" }).valid, true);
  assert.deepEqual(sortStrategyDecisions([
    { id: "old", decisionDate: "2026-01-01" },
    { id: "new", decisionDate: "2026-07-16" }
  ]).map((item) => item.id), ["new", "old"]);
});

test("strategy data stays owner-only and separate from the coach dashboard", async () => {
  const [rules, ownerSource, coachSource] = await Promise.all([
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../../firebase-dashboard/public/app.js", import.meta.url), "utf8")
  ]);
  for (const collection of ["businessStrategy", "strategyDecisions"]) {
    const block = rules.match(new RegExp(`match /${collection}/\\{[^}]+\\} \\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(block, `${collection} rule exists`);
    assert.match(block[1], /if isOwner\(\)/);
    assert.match(ownerSource, new RegExp(`collection\\(db, "${collection}"\\)`));
    assert.doesNotMatch(coachSource, new RegExp(collection));
  }
});

test("strategy edits use Firestore transactions and expose an explicit conflict choice", async () => {
  const ownerSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(ownerSource, /strategyEditorVersion: ""/);
  assert.match(ownerSource, /strategyDecisionEditorVersion: ""/);
  assert.match(ownerSource, /runTransaction\(db, async \(transaction\) => \{/);
  assert.match(ownerSource, /hasVersionConflict\(existing, state\.strategyEditorVersion\)/);
  assert.match(ownerSource, /hasVersionConflict\(existing, state\.strategyDecisionEditorVersion\)/);
  assert.match(ownerSource, /data-resolve-strategy-conflict="reload"/);
  assert.match(ownerSource, /data-resolve-strategy-conflict="overwrite"/);
  assert.match(ownerSource, /Tes changements sont conserves ici/);
});
