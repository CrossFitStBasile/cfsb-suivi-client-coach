const DAY_MS = 24 * 60 * 60 * 1000;

function clean(value) {
  return String(value ?? "").trim();
}

function keyOf(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value) {
  const ms = timestampMs(value);
  return ms ? new Date(ms).toISOString().slice(0, 10) : "";
}

function isOpenTask(task = {}) {
  return !["done", "ignored", "archived", "closed", "completed"].includes(keyOf(task.status || "open"));
}

function isOpenRebooking(item = {}) {
  return !["rebooked", "managed", "archived", "ignored", "closed", "coachabsence"].includes(keyOf(item.status || "open"));
}

function isUnreadResponse(response = {}) {
  return ["toread", "unmatched", "pendingreview"].includes(keyOf(response.processingStatus || ""));
}

function isSendError(send = {}) {
  return keyOf(send.status).includes("error")
    || keyOf(send.deliveryStatus).includes("error")
    || Boolean(clean(send.errorMessage));
}

function taskCategory(task = {}) {
  const type = keyOf(task.type);
  const source = keyOf(task.source);
  if (type.includes("program") || source.includes("coachrxprogram")) return "program_updates";
  if (type.includes("rebook") || source.includes("rebook")) return "rebooking_followups";
  if (type.includes("question") || source.includes("questionnaire")) return "questionnaire_followups";
  if (source.includes("rendementreminder")) return "performance_reminders";
  if (source.includes("pilotage")) return "pilotage_followups";
  if (type.includes("note") || source.includes("coachnote")) return "coach_notes";
  if (type.includes("manual") || source.includes("manual")) {
    return clean(task.clientId) ? "manual_client_tasks" : "manual_general_tasks";
  }
  return "other_tasks";
}

const CATEGORY_INFO = {
  program_updates: {
    label: "Mises a jour de programme",
    level: "existing",
    recommendation: "Le signal est deja automatique. Optimiser le regroupement, mais garder la decision au coach."
  },
  rebooking_followups: {
    label: "Suivis rebooking",
    level: "candidate",
    recommendation: "Candidat pour un rappel automatique tant que le dossier reste ouvert."
  },
  questionnaire_followups: {
    label: "Suivis questionnaire",
    level: "candidate",
    recommendation: "Candidat pour une relance planifiee apres un delai sans reponse."
  },
  performance_reminders: {
    label: "Rappels de rendement",
    level: "existing",
    recommendation: "Conserver comme rappel recurrent parametre par le coach."
  },
  pilotage_followups: {
    label: "Suivis de pilotage",
    level: "candidate",
    recommendation: "Proposer la mission depuis la rencontre, toujours avec confirmation humaine."
  },
  coach_notes: {
    label: "Notes coach a traiter",
    level: "observe",
    recommendation: "Observer les motifs recurrents avant d'automatiser une note libre."
  },
  manual_client_tasks: {
    label: "Missions manuelles client",
    level: "observe",
    recommendation: "Chercher les motifs recurrents, puis valider la regle avec les coachs avant automatisation."
  },
  manual_general_tasks: {
    label: "Missions manuelles generales",
    level: "observe",
    recommendation: "Garder manuelles tant qu'un meme besoin n'est pas confirme sur plusieurs cycles."
  },
  other_tasks: {
    label: "Autres missions",
    level: "observe",
    recommendation: "Classifier plus precisement avant toute automatisation."
  }
};

function actorCoachId(record, coachesByEmail, pilotIds) {
  if (keyOf(record.userRole) === "admin") return "";
  const actor = clean(record.actorCoachId);
  if (pilotIds.has(actor)) return actor;
  return coachesByEmail.get(clean(record.userEmail).toLowerCase()) || "";
}

function topEntries(values, limit = 3) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function buildAutomationCandidates(tasks, windowStartMs, pilotIds) {
  const groups = new Map();
  tasks.forEach((task) => {
    if (!pilotIds.has(clean(task.coachId))) return;
    const createdMs = timestampMs(task.createdAt || task.updatedAt);
    if (!createdMs || createdMs < windowStartMs) return;
    const category = taskCategory(task);
    if (!groups.has(category)) groups.set(category, { count: 0, coaches: new Set(), clientLinked: 0, open: 0 });
    const group = groups.get(category);
    group.count += 1;
    group.coaches.add(clean(task.coachId));
    if (clean(task.clientId)) group.clientLinked += 1;
    if (isOpenTask(task)) group.open += 1;
  });
  return [...groups.entries()]
    .filter(([, group]) => group.count >= 3)
    .map(([category, group]) => ({
      category,
      label: CATEGORY_INFO[category]?.label || category,
      level: CATEGORY_INFO[category]?.level || "observe",
      count: group.count,
      coachCount: group.coaches.size,
      clientLinkedCount: group.clientLinked,
      openCount: group.open,
      recommendation: CATEGORY_INFO[category]?.recommendation || "Valider le processus avant automatisation."
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildWeeklyProductReport(input = {}) {
  const nowMs = timestampMs(input.now) || Date.now();
  const periodDays = Math.max(1, Number(input.periodDays || 7));
  const automationWindowDays = Math.max(periodDays, Number(input.automationWindowDays || 28));
  const periodStartMs = nowMs - periodDays * DAY_MS;
  const automationStartMs = nowMs - automationWindowDays * DAY_MS;
  const pilotCoaches = Array.isArray(input.pilotCoaches) ? input.pilotCoaches : [];
  const pilotIds = new Set(pilotCoaches.map((coach) => clean(coach.id || coach.coachRxId)).filter(Boolean));
  const coachesByEmail = new Map(pilotCoaches.map((coach) => [clean(coach.email).toLowerCase(), clean(coach.id || coach.coachRxId)]));
  const usageEvents = (input.usageEvents || []).filter((event) => timestampMs(event.createdAt) >= periodStartMs);
  const actionLogs = (input.actionLogs || []).filter((event) => timestampMs(event.createdAt) >= periodStartMs);
  const tasks = input.tasks || [];
  const rebookings = input.rebookings || [];
  const responses = input.questionnaireResponses || [];
  const sends = input.questionnaireSends || [];
  const syncStatuses = input.coachSyncStatuses || [];
  const syncRuns = (input.syncRuns || []).filter((run) => timestampMs(run.createdAt || run.startedAt || run.syncedAt) >= periodStartMs);

  const coachRows = pilotCoaches.map((coach) => {
    const coachId = clean(coach.id || coach.coachRxId);
    const events = usageEvents.filter((event) => actorCoachId(event, coachesByEmail, pilotIds) === coachId);
    const actions = actionLogs.filter((event) => actorCoachId(event, coachesByEmail, pilotIds) === coachId);
    const activeDays = new Set(events.map((event) => dateKey(event.createdAt)).filter(Boolean)).size;
    const sessions = new Set(events.map((event) => clean(event.sessionId)).filter(Boolean)).size;
    const tabs = topEntries(events.map((event) => clean(event.details?.tab || event.tab)).filter((tab) => tab && tab !== "admin"), 3);
    const devices = topEntries(events.map((event) => clean(event.deviceType)), 3);
    const lastActivityMs = events.reduce((latest, event) => Math.max(latest, timestampMs(event.createdAt)), 0);
    let status = "active";
    if (!events.length) status = "inactive";
    else if (activeDays < 2 && actions.length < 2) status = "light";
    else if (actions.length >= 8 || activeDays >= 3) status = "adopted";
    return {
      coachId,
      coachName: clean(coach.name),
      status,
      activeDays,
      sessions,
      actions: actions.length,
      topModules: tabs,
      devices,
      lastActivityAt: lastActivityMs ? new Date(lastActivityMs).toISOString() : ""
    };
  });
  const coachUsageEvents = usageEvents.filter((event) => Boolean(actorCoachId(event, coachesByEmail, pilotIds)));

  const openTasks = tasks.filter((task) => pilotIds.has(clean(task.coachId)) && isOpenTask(task));
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const staleTaskCutoff = nowMs - 7 * DAY_MS;
  const staleTasks = openTasks.filter((task) => {
    const due = clean(task.dueAt);
    if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) return due < today;
    return timestampMs(task.createdAt) > 0 && timestampMs(task.createdAt) < staleTaskCutoff;
  });
  const openRebookings = rebookings.filter((item) => pilotIds.has(clean(item.coachId || item.assignedCoachId || item.coachRxId)) && isOpenRebooking(item));
  const agedRebookings = openRebookings.filter((item) => {
    const opened = timestampMs(item.detectedAt || item.createdAt || item.appointmentAt);
    return opened > 0 && opened < nowMs - 14 * DAY_MS;
  });
  const unreadResponses = responses.filter((item) => pilotIds.has(clean(item.coachId || item.coachRxId)) && isUnreadResponse(item));
  const agedUnreadResponses = unreadResponses.filter((item) => {
    const submitted = timestampMs(item.submittedAt || item.createdAt);
    return submitted > 0 && submitted < nowMs - 3 * DAY_MS;
  });
  const sendErrors = sends.filter((item) => pilotIds.has(clean(item.coachId || item.coachRxId)) && isSendError(item));
  const staleSyncStatuses = syncStatuses.filter((status) => {
    if (!pilotIds.has(clean(status.coachId || status.coachRxId || status.id))) return false;
    const synced = timestampMs(status.syncedAt || status.updatedAt);
    return !synced || synced < nowMs - DAY_MS || keyOf(status.status) === "warning";
  });
  const syncErrors = syncRuns.filter((run) => keyOf(run.status) === "error");
  const automationCandidates = buildAutomationCandidates(tasks, automationStartMs, pilotIds);
  const activeCoaches = coachRows.filter((row) => row.status !== "inactive").length;
  const totalSessions = coachRows.reduce((sum, row) => sum + row.sessions, 0);
  const totalActions = coachRows.reduce((sum, row) => sum + row.actions, 0);
  const topModules = topEntries(coachUsageEvents.map((event) => clean(event.details?.tab || event.tab)).filter((tab) => tab && tab !== "admin"), 5);
  const deviceMix = topEntries(coachUsageEvents.map((event) => clean(event.deviceType)), 4);
  const attentionCount = staleSyncStatuses.length + syncErrors.length + staleTasks.length + agedRebookings.length + agedUnreadResponses.length + sendErrors.length;

  return {
    schemaVersion: 1,
    periodDays,
    automationWindowDays,
    periodStart: new Date(periodStartMs).toISOString(),
    periodEnd: new Date(nowMs).toISOString(),
    summary: `${activeCoaches}/${pilotCoaches.length} coachs actifs, ${totalActions} actions et ${attentionCount} point(s) a verifier.`,
    adoption: {
      activeCoaches,
      totalCoaches: pilotCoaches.length,
      sessions: totalSessions,
      actions: totalActions,
      topModules,
      deviceMix,
      coachesToSupport: coachRows.filter((row) => ["inactive", "light"].includes(row.status)).map((row) => row.coachId)
    },
    coachRows,
    operations: {
      openTasks: openTasks.length,
      urgentTasks: openTasks.filter((task) => clean(task.priority).toUpperCase() === "P1").length,
      staleTasks: staleTasks.length,
      openRebookings: openRebookings.length,
      agedRebookings: agedRebookings.length,
      unreadQuestionnaires: unreadResponses.length,
      agedUnreadQuestionnaires: agedUnreadResponses.length,
      questionnaireSendErrors: sendErrors.length
    },
    syncHealth: {
      staleCoachCount: staleSyncStatuses.length,
      staleCoachIds: staleSyncStatuses.map((status) => clean(status.coachId || status.coachRxId || status.id)).filter(Boolean),
      failedRuns: syncErrors.length,
      latestRunAt: syncRuns.reduce((latest, run) => {
        const value = timestampMs(run.finishedAt || run.createdAt || run.syncedAt);
        return value > timestampMs(latest) ? new Date(value).toISOString() : latest;
      }, "")
    },
    automationCandidates,
    attentionCount
  };
}

module.exports = {
  buildWeeklyProductReport,
  taskCategory,
  timestampMs
};
