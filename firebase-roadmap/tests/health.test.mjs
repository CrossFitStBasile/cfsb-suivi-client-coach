import test from "node:test";
import assert from "node:assert/strict";

import {
  dashboardHealthReport,
  hasValidatedTarget,
  latestTimestamp,
  timestampValue
} from "../public/health.js";

test("dashboard health exposes actionable data gaps without inventing targets", () => {
  const linkedMember = { id: "linked", name: "Linked", active: true };
  const missingDocument = { id: "missing-doc", name: "Missing document", active: true };
  const archived = { id: "archived", name: "Archived", active: false, archivedAt: "2026-01-01" };
  const imported = {
    id: "imported",
    source: "apps_script_import",
    submittedAt: "2026-07-10T15:00:00Z",
    importMeta: { sourceExportedAt: "2026-07-10T16:00:00Z" }
  };
  const native = { id: "native", submittedAt: "2026-07-12T15:00:00Z" };

  const report = dashboardHealthReport({
    submissions: [imported, native, { id: "trash", deletedAt: "2026-07-13" }],
    teamMembers: [linkedMember, missingDocument, archived],
    pilotageMetrics: [
      { id: "validated", active: true, targetStatus: "validated", targetValue: 70 },
      { id: "unknown", active: true, targetStatus: "to_validate", targetValue: null }
    ],
    clientErrors: [{ id: "open" }, { id: "closed", resolvedAt: "2026-07-14" }],
    memberForSubmission: (submission) => submission.id === "imported" ? linkedMember : null,
    memberDocumentUrl: (member) => member.id === "linked" ? "https://drive.google.com/example" : "",
    isActiveMember: (member) => member.active !== false
  });

  assert.equal(report.status, "error");
  assert.deepEqual(report.unlinkedSubmissions.map((item) => item.id), ["native"]);
  assert.deepEqual(report.missingDocumentMembers.map((item) => item.id), ["missing-doc"]);
  assert.deepEqual(report.missingTargetMetrics.map((item) => item.id), ["unknown"]);
  assert.equal(report.unresolvedErrors.length, 1);
  assert.equal(report.importedSubmissions.length, 1);
  assert.equal(report.nativeSubmissions.length, 1);
  assert.equal(report.latestSubmissionAt, Date.parse("2026-07-12T15:00:00Z"));
  assert.equal(report.latestImportAt, Date.parse("2026-07-10T16:00:00Z"));
});

test("dashboard health is healthy when every supported control is complete", () => {
  const member = { id: "member", active: true };
  const submission = { id: "submission", submittedAt: "2026-07-12" };
  const report = dashboardHealthReport({
    submissions: [submission],
    teamMembers: [member],
    pilotageMetrics: [{ id: "metric", targetValue: 12, targetStatus: "validated" }],
    memberForSubmission: () => member,
    memberDocumentUrl: () => "https://drive.google.com/example"
  });

  assert.equal(report.status, "healthy");
  assert.equal(report.unlinkedSubmissions.length, 0);
  assert.equal(report.missingDocumentMembers.length, 0);
  assert.equal(report.missingTargetMetrics.length, 0);
});

test("target and timestamp helpers handle nulls and Firestore-like timestamps", () => {
  assert.equal(hasValidatedTarget({ targetStatus: "to_validate", targetValue: 0 }), false);
  assert.equal(hasValidatedTarget({ targetStatus: "validated", targetValue: 0 }), true);
  assert.equal(hasValidatedTarget({ targetStatus: "validated", targetValue: null }), false);
  assert.equal(timestampValue({ toMillis: () => 1234 }), 1234);
  assert.equal(timestampValue({ toDate: () => new Date(5678) }), 5678);
  assert.equal(latestTimestamp([null, "2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z"]), Date.parse("2026-01-03T00:00:00Z"));
});
