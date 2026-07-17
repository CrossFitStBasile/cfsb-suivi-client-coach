const MAX_TASKS = 40;
const MAX_CLIENTS = 60;
const MAX_QUESTIONNAIRES = 16;
const MAX_REBOOKINGS = 24;

const QUESTIONNAIRE_ANSWER_KEYS = [
  "general_state",
  "motivation_level",
  "goal_status",
  "progress_toward_goal",
  "program_fit",
  "pain_status",
  "current_challenges",
  "support_needed",
  "contact_request",
  "open_note",
  "habits_priority",
  "habits_support",
  "eval_main_goal",
  "eval_obstacles",
  "eval_stress",
  "eval_pain",
  "eval_next_focus",
  "eval_commitment",
  "eval_contact"
];

function cleanText(value, maxLength = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function dateIso(value) {
  if (!value) return "";
  const raw = typeof value?.toDate === "function" ? value.toDate() : value;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? cleanText(value, 40) : date.toISOString();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function recordWithId(record = {}) {
  if (record.data && typeof record.data === "object") {
    return { id: cleanText(record.id, 180), ...record.data };
  }
  return record;
}

function isOpenTask(task = {}) {
  const status = cleanText(task.status, 40).toLowerCase();
  return !["done", "completed", "closed", "ignored", "archived", "deleted"].includes(status);
}

function isActiveClient(client = {}) {
  const status = cleanText(client.status, 40).toLowerCase();
  return !["alumni", "archived", "deleted", "inactive"].includes(status);
}

function questionnaireAnswers(response = {}) {
  const answers = response.answers && typeof response.answers === "object" ? response.answers : {};
  const selected = {};
  QUESTIONNAIRE_ANSWER_KEYS.forEach((key) => {
    const value = answers[key] ?? response[key];
    if (value === undefined || value === null || value === "") return;
    selected[key] = cleanText(Array.isArray(value) ? value.join(", ") : value, 320);
  });
  return selected;
}

function mapTask(raw = {}) {
  const task = recordWithId(raw);
  return {
    ref: `task:${cleanText(task.id, 180)}`,
    id: cleanText(task.id, 180),
    clientId: cleanText(task.clientId, 180),
    clientName: cleanText(task.clientName || task.name, 180),
    title: cleanText(task.title || task.task || task.action, 240),
    description: cleanText(task.description || task.note, 360),
    type: cleanText(task.type || task.taskType || task.category, 80),
    priority: cleanText(task.priority, 20),
    dueAt: dateIso(task.dueAt || task.dueDate || task.targetDate),
    status: cleanText(task.status || "open", 40),
    starred: task.starred === true
  };
}

function mapClient(raw = {}) {
  const client = recordWithId(raw);
  const exerciseContext = client.coachRxProgramContext?.exerciseSignal || {};
  const lifestyleContext = client.coachRxProgramContext?.lifestyleSignal || {};
  return {
    ref: `client:${cleanText(client.id, 180)}`,
    id: cleanText(client.id, 180),
    name: cleanText(client.name || client.clientName, 180),
    status: cleanText(client.status || "active", 40),
    membership: cleanText(client.membershipLabel, 180),
    riskLevel: cleanText(client.riskLevel, 40),
    notes: cleanText(client.notes, 700),
    objective: cleanText(client.objective || client.goal || client.coachObjective, 360),
    attendance30Days: numberOrNull(client.attendance30Days),
    targetSessionsPerWeek: numberOrNull(client.targetSessionsPerWeek),
    levelMethodOverall: cleanText(client.levelMethodOverall, 80),
    exerciseDue: dateIso(client.coachRxExerciseDue || client.coachRxProgramContext?.exerciseDue),
    lifestyleDue: dateIso(client.coachRxLifestyleDue || client.coachRxProgramContext?.lifestyleDue),
    exerciseCompliance: numberOrNull(client.exerciseCompliance || client.coachRxProgramContext?.exerciseCompliance),
    exerciseSignal: cleanText(exerciseContext.label || exerciseContext.status, 80),
    lifestyleSignal: cleanText(lifestyleContext.label || lifestyleContext.status, 80),
    updatedAt: dateIso(client.updatedAt || client.sourceUpdatedAt || client.updatedFromSheetsAt)
  };
}

function mapQuestionnaire(raw = {}) {
  const response = recordWithId(raw);
  return {
    ref: `questionnaire:${cleanText(response.id, 180)}`,
    id: cleanText(response.id, 180),
    clientId: cleanText(response.clientId, 180),
    clientName: cleanText(response.clientName || response.name, 180),
    questionnaireType: cleanText(response.questionnaireType, 80),
    processingStatus: cleanText(response.processingStatus || response.status, 40),
    triageStatus: cleanText(response.triageStatus, 40),
    coachActionType: cleanText(response.coachActionType, 80),
    submittedAt: dateIso(response.submittedAt || response.createdAt),
    answers: questionnaireAnswers(response)
  };
}

function mapRebooking(raw = {}) {
  const rebooking = recordWithId(raw);
  const cancellationDates = Array.isArray(rebooking.cancellationDates)
    ? rebooking.cancellationDates.map(dateIso).filter(Boolean).slice(0, 8)
    : [dateIso(rebooking.cancelledAt || rebooking.cancellationDate)].filter(Boolean);
  return {
    ref: `rebooking:${cleanText(rebooking.id, 180)}`,
    id: cleanText(rebooking.id, 180),
    clientId: cleanText(rebooking.clientId, 180),
    clientName: cleanText(rebooking.clientName || rebooking.name, 180),
    status: cleanText(rebooking.status || "open", 40),
    sessionsToRebook: Math.max(0, numberOrNull(rebooking.sessionsToRebook || rebooking.sessionCount) || 0),
    cancellationDates,
    detectedAt: dateIso(rebooking.detectedAt || rebooking.createdAt),
    note: cleanText(rebooking.note || rebooking.reason, 280)
  };
}

function sortByDateDesc(items, field) {
  return [...items].sort((a, b) => String(b[field] || "").localeCompare(String(a[field] || "")));
}

function buildReadOnlyAssistantContext({
  coach = {},
  tasks = [],
  clients = [],
  questionnaireResponses = [],
  rebookings = [],
  performanceSettings = {},
  now = new Date()
} = {}) {
  const mappedTasks = tasks.map(mapTask).filter((task) => task.id && isOpenTask(task)).slice(0, MAX_TASKS);
  const mappedClients = clients.map(mapClient).filter((client) => client.id && client.name && isActiveClient(client)).slice(0, MAX_CLIENTS);
  const mappedQuestionnaires = sortByDateDesc(questionnaireResponses.map(mapQuestionnaire), "submittedAt")
    .filter((response) => response.id)
    .slice(0, MAX_QUESTIONNAIRES);
  const mappedRebookings = sortByDateDesc(rebookings.map(mapRebooking), "detectedAt")
    .filter((item) => item.id && !["closed", "archived", "deleted"].includes(item.status.toLowerCase()))
    .slice(0, MAX_REBOOKINGS);
  const coachId = cleanText(coach.id || coach.coachId || coach.coachRxId, 80);
  return {
    schemaVersion: 1,
    generatedAt: dateIso(now),
    timezone: "America/Toronto",
    targetCoach: {
      ref: `coach:${coachId}`,
      id: coachId,
      name: cleanText(coach.name || coach.displayName, 180)
    },
    summary: {
      openTasks: mappedTasks.length,
      urgentTasks: mappedTasks.filter((task) => task.priority === "P1").length,
      activeClients: mappedClients.length,
      unreadQuestionnaires: mappedQuestionnaires.filter((response) => response.processingStatus === "to_read").length,
      openRebookings: mappedRebookings.reduce((sum, item) => sum + Math.max(1, item.sessionsToRebook || 1), 0)
    },
    objective: {
      ref: `performance:${coachId}`,
      period: cleanText(performanceSettings.objectivePeriod, 80),
      status: cleanText(performanceSettings.objectiveStatus, 40),
      text: cleanText(performanceSettings.quarterlyObjective, 600)
    },
    tasks: mappedTasks,
    clients: mappedClients,
    questionnaireResponses: mappedQuestionnaires,
    rebookings: mappedRebookings
  };
}

function evidenceCatalog(context = {}) {
  const catalog = new Map();
  const add = (item, entityType, label, sourceDate = "") => {
    if (!item?.ref) return;
    catalog.set(item.ref, {
      ref: item.ref,
      entityType,
      entityId: item.id || context.targetCoach?.id || "",
      label: cleanText(label, 200),
      sourceDate: cleanText(sourceDate, 60)
    });
  };
  add(context.targetCoach, "coach", context.targetCoach?.name || "Coach selectionne", context.generatedAt);
  add(context.objective, "performance", "Objectif coach", context.generatedAt);
  (context.tasks || []).forEach((item) => add(item, "task", item.title || "Mission", item.dueAt));
  (context.clients || []).forEach((item) => add(item, "client", item.name || "Client", item.updatedAt));
  (context.questionnaireResponses || []).forEach((item) => add(item, "questionnaire", `${item.clientName || "Client"} - questionnaire`, item.submittedAt));
  (context.rebookings || []).forEach((item) => add(item, "rebooking", `${item.clientName || "Client"} - rebooking`, item.detectedAt));
  return catalog;
}

function verifiedEvidenceRefs(requestedRefs = [], context = {}) {
  const catalog = evidenceCatalog(context);
  return [...new Set((requestedRefs || []).map((item) => cleanText(item, 240)).filter(Boolean))]
    .map((ref) => catalog.get(ref))
    .filter(Boolean)
    .slice(0, 8);
}

function resolveTaskCreateProposal(output = {}, context = {}, defaultDueAt = "") {
  if (output.intent !== "propose_action" || output.actionType !== "task.create") return null;
  const raw = output.actionParameters && typeof output.actionParameters === "object"
    ? output.actionParameters
    : {};
  const title = cleanText(raw.title, 180);
  if (!title) throw new Error("assistant_task_title_missing");
  const priority = ["P1", "P2", "P3"].includes(raw.priority) ? raw.priority : "P2";
  const requestedDueAt = cleanText(raw.dueAt, 10);
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(requestedDueAt)
    ? requestedDueAt
    : cleanText(defaultDueAt, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) throw new Error("assistant_task_due_date_invalid");

  const clientRef = cleanText(raw.clientRef, 240);
  const client = clientRef
    ? (context.clients || []).find((item) => item.ref === clientRef)
    : null;
  if (clientRef && !client) throw new Error("assistant_task_client_ref_invalid");

  return {
    clientId: client?.id || "",
    clientName: client?.name || "",
    title,
    description: cleanText(raw.description, 1200),
    priority,
    dueAt,
    starred: false
  };
}

module.exports = {
  buildReadOnlyAssistantContext,
  cleanText,
  evidenceCatalog,
  resolveTaskCreateProposal,
  verifiedEvidenceRefs
};
