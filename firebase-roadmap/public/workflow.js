const HISTORY_STATUSES = new Set(["meeting_done", "ready_to_archive", "archived"]);

const ROADMAP_ACTIONS = {
  to_read: { id: "mark_read", label: "Marquer comme lue", icon: "check" },
  meeting_planned: { id: "meeting_done", label: "Rencontre faite", icon: "circle-check-big" },
  action_required: { id: "followup_done", label: "Suivi fait", icon: "check-check" }
};

export function effectiveWorkflowStatus(value) {
  const status = typeof value === "string" ? value : value?.status || "to_read";
  return status === "message_to_send" ? "meeting_planned" : status;
}

export function submissionBucket(submission) {
  if (submission?.deletedAt) return "trash";
  return HISTORY_STATUSES.has(submission?.status) ? "history" : "queue";
}

export function roadmapCreatesTask(value) {
  return ["to_read", "action_required"].includes(effectiveWorkflowStatus(value));
}

export function roadmapActionDefinition(value) {
  return ROADMAP_ACTIONS[effectiveWorkflowStatus(value)] || null;
}

export function isOpenManagementTask(task) {
  return !["completed", "cancelled"].includes(task?.status);
}

export function isHistoricalManagementTask(task) {
  return ["completed", "cancelled"].includes(task?.status);
}

export function isArchivedTeamMember(member) {
  return member?.active === false || Boolean(member?.archivedAt);
}

export function teamMemberBucket(member) {
  return isArchivedTeamMember(member) ? "archived" : "active";
}

export function isFinalizedTeamMeeting(meeting) {
  return meeting?.status === "finalized";
}

export function teamMeetingBucket(meeting) {
  return isFinalizedTeamMeeting(meeting) ? "history" : "draft";
}

export function entityVersionToken(entity) {
  const value = entity?.updatedAt || entity?.createdAt || entity?.submittedAt;
  if (!value) return "";
  if (typeof value.toMillis === "function") return String(value.toMillis());
  if (typeof value.toDate === "function") return String(value.toDate().getTime());
  if (value instanceof Date) return String(value.getTime());
  const time = Date.parse(value);
  return Number.isNaN(time) ? String(value) : String(time);
}

export function hasVersionConflict(entity, baseline) {
  const current = entityVersionToken(entity);
  return Boolean(baseline && current && baseline !== current);
}
