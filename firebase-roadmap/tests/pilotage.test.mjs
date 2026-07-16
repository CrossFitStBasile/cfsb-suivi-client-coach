import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  metricStatus,
  metricTargetIsValidated,
  pilotageSummary,
  quarterId,
  shiftQuarterId,
  shiftWeekIso,
  sortPilotageIssues,
  startOfWeekIso,
  targetLabel
} from "../public/pilotage.js";

test("week helpers use Monday and preserve local calendar dates", () => {
  assert.equal(startOfWeekIso("2026-07-15"), "2026-07-13");
  assert.equal(startOfWeekIso("2026-07-19"), "2026-07-13");
  assert.equal(shiftWeekIso("2026-07-13", 1), "2026-07-20");
});

test("quarter helpers navigate across years", () => {
  assert.equal(quarterId("2026-07-15"), "2026-Q3");
  assert.equal(shiftQuarterId("2026-Q4", 1), "2027-Q1");
  assert.equal(shiftQuarterId("2026-Q1", -1), "2025-Q4");
});

test("metric status supports minimum, maximum, exact and range targets", () => {
  assert.equal(metricStatus({ targetDirection: "gte", targetValue: 10 }, { value: 10 }), "on_track");
  assert.equal(metricStatus({ targetDirection: "lte", targetValue: 4 }, { value: 5 }), "off_track");
  assert.equal(metricStatus({ targetDirection: "exact", targetValue: 8 }, { value: 8 }), "on_track");
  assert.equal(metricStatus({ targetDirection: "range", targetValue: 3, targetMax: 5 }, { value: 6 }), "off_track");
  assert.equal(metricStatus({ targetDirection: "gte", targetValue: 1 }, null), "missing");
  assert.equal(metricStatus({ targetDirection: "gte", targetValue: null, targetStatus: "to_validate" }, null), "missing_target");
  assert.equal(metricStatus({ targetDirection: "gte", targetValue: 10, targetStatus: "to_validate" }, { value: 12 }), "missing_target");
  assert.equal(metricTargetIsValidated({ targetValue: 10 }), true);
  assert.equal(metricTargetIsValidated({ targetValue: 10, targetStatus: "to_validate" }), false);
  assert.equal(targetLabel({ targetDirection: "range", targetValue: 3, targetMax: 5, unit: "visites" }), "3 a 5 visites");
  assert.equal(targetLabel({ targetStatus: "to_validate", targetValue: null }), "Cible a valider");
});

test("issues are sorted open first, then by priority", () => {
  const sorted = sortPilotageIssues([
    { id: "done", status: "solved", priority: "P1", createdAt: "2026-07-01" },
    { id: "low", status: "open", priority: "P3", createdAt: "2026-07-01" },
    { id: "high", status: "open", priority: "P1", createdAt: "2026-07-02" }
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["high", "low", "done"]);
});

test("summary uses the selected week and quarter", () => {
  const summary = pilotageSummary({
    metrics: [{ id: "a", active: true, targetValue: 10 }, { id: "b", active: true, targetValue: 5 }],
    entries: [{ metricId: "a", weekStart: "2026-07-13", value: 8 }],
    rocks: [{ quarter: "2026-Q3", status: "off_track" }, { quarter: "2026-Q2", status: "off_track" }],
    issues: [{ status: "open" }, { status: "solved" }],
    tasks: [{ status: "open", sourceType: "pilotage_issue" }, { status: "open", sourceType: "manual" }],
    weekStart: "2026-07-13",
    quarter: "2026-Q3"
  });
  assert.deepEqual(summary, {
    metricCount: 2,
    offTrackMetrics: 1,
    missingMetrics: 1,
    missingTargets: 0,
    offTrackRocks: 1,
    openIssues: 1,
    openActions: 1
  });
});

test("pilotage collections remain owner-only in Firestore rules", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  for (const collection of ["pilotageMetrics", "pilotageMetricEntries", "pilotageRocks", "pilotageIssues", "pilotageMeetings"]) {
    const block = rules.match(new RegExp(`match /${collection}/\\{[^}]+\\} \\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(block, `${collection} rule is present`);
    assert.match(block[1], /if isOwner\(\)/);
  }
});
