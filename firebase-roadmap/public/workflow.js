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
