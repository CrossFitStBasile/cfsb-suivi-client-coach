import assert from "node:assert/strict";
import test from "node:test";

import {
  entityVersionToken,
  effectiveWorkflowStatus,
  hasVersionConflict,
  isArchivedTeamMember,
  isHistoricalManagementTask,
  isOpenManagementTask,
  roadmapActionDefinition,
  roadmapCreatesTask,
  submissionBucket,
  teamMemberBucket
} from "../public/workflow.js";

test("legacy message status behaves like a read roadmap", () => {
  assert.equal(effectiveWorkflowStatus("message_to_send"), "meeting_planned");
  assert.equal(roadmapCreatesTask({ status: "message_to_send" }), false);
  assert.deepEqual(roadmapActionDefinition("message_to_send"), {
    id: "meeting_done",
    label: "Rencontre faite",
    icon: "circle-check-big"
  });
});

test("only unread roadmaps and concrete followups create owner tasks", () => {
  assert.equal(roadmapCreatesTask({ status: "to_read" }), true);
  assert.equal(roadmapCreatesTask({ status: "action_required" }), true);
  assert.equal(roadmapCreatesTask({ status: "meeting_planned" }), false);
  assert.equal(roadmapCreatesTask({ status: "meeting_done" }), false);
});

test("roadmaps remain available in queue, history, or trash", () => {
  assert.equal(submissionBucket({ status: "to_read" }), "queue");
  assert.equal(submissionBucket({ status: "meeting_done" }), "history");
  assert.equal(submissionBucket({ status: "archived" }), "history");
  assert.equal(submissionBucket({ status: "to_read", deletedAt: "2026-07-13" }), "trash");
});

test("each active roadmap status has one clear next action", () => {
  assert.equal(roadmapActionDefinition("to_read").id, "mark_read");
  assert.equal(roadmapActionDefinition("meeting_planned").id, "meeting_done");
  assert.equal(roadmapActionDefinition("action_required").id, "followup_done");
  assert.equal(roadmapActionDefinition("meeting_done"), null);
});

test("completed and cancelled manual actions leave the open list but remain historical", () => {
  assert.equal(isOpenManagementTask({ status: "open" }), true);
  assert.equal(isOpenManagementTask({}), true);
  assert.equal(isOpenManagementTask({ status: "completed" }), false);
  assert.equal(isOpenManagementTask({ status: "cancelled" }), false);
  assert.equal(isHistoricalManagementTask({ status: "completed" }), true);
  assert.equal(isHistoricalManagementTask({ status: "cancelled" }), true);
  assert.equal(isHistoricalManagementTask({ status: "open" }), false);
});

test("entity version tokens support Firestore timestamps, dates, and ISO values", () => {
  assert.equal(entityVersionToken({ updatedAt: { toMillis: () => 42 } }), "42");
  assert.equal(entityVersionToken({ updatedAt: new Date("2026-07-13T12:00:00Z") }), "1783944000000");
  assert.equal(
    entityVersionToken({ submittedAt: "2026-07-13T12:00:00Z" }),
    "1783944000000"
  );
});

test("version conflicts only trigger when a loaded entity changed", () => {
  const baseline = entityVersionToken({ updatedAt: "2026-07-13T12:00:00Z" });
  assert.equal(hasVersionConflict({ updatedAt: "2026-07-13T12:00:00Z" }, baseline), false);
  assert.equal(hasVersionConflict({ updatedAt: "2026-07-13T12:05:00Z" }, baseline), true);
  assert.equal(hasVersionConflict({ updatedAt: "2026-07-13T12:05:00Z" }, ""), false);
});

test("team members are separated into active and archived dossiers", () => {
  assert.equal(isArchivedTeamMember({ active: true }), false);
  assert.equal(isArchivedTeamMember({ active: false }), true);
  assert.equal(isArchivedTeamMember({ active: true, archivedAt: "2026-07-13" }), true);
  assert.equal(teamMemberBucket({ active: true }), "active");
  assert.equal(teamMemberBucket({ active: false }), "archived");
});
