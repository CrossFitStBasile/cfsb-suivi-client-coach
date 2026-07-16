export const DEVELOPMENT_PROGRAM_TYPES = [
  ["onboarding", "Onboarding"],
  ["training", "Formation continue"],
  ["evaluation", "Evaluation"]
];

export const DEVELOPMENT_ASSIGNMENT_STATUSES = [
  ["not_started", "A commencer"],
  ["in_progress", "En cours"],
  ["paused", "En pause"],
  ["completed", "Termine"]
];

export const DEVELOPMENT_STEP_STATUSES = [
  ["pending", "A faire"],
  ["in_progress", "En cours"],
  ["completed", "Terminee"],
  ["not_applicable", "Non applicable"]
];

const PROGRAM_STATUS_ORDER = { published: 0, draft: 1, superseded: 2, archived: 3 };

export function normalizeDevelopmentStep(step = {}, index = 0) {
  return {
    id: String(step.id || `step-${index + 1}`).trim(),
    title: String(step.title || "").trim(),
    description: String(step.description || "").trim(),
    category: String(step.category || "General").trim() || "General",
    required: step.required !== false,
    evidenceRequired: step.evidenceRequired === true,
    sortOrder: Number.isFinite(Number(step.sortOrder)) ? Number(step.sortOrder) : index + 1
  };
}

export function validateDevelopmentProgram(program = {}) {
  const errors = [];
  const title = String(program.title || "").trim();
  const typeIds = new Set(DEVELOPMENT_PROGRAM_TYPES.map(([id]) => id));
  const steps = (program.steps || []).map(normalizeDevelopmentStep);
  if (!title) errors.push("Le titre du programme est requis.");
  if (!typeIds.has(program.programType)) errors.push("Le type de programme est invalide.");
  if (!steps.length) errors.push("Ajoute au moins une etape.");
  if (steps.some((step) => !step.title)) errors.push("Chaque etape doit avoir un titre.");
  if (new Set(steps.map((step) => step.id)).size !== steps.length) errors.push("Chaque etape doit avoir un identifiant unique.");
  return { valid: errors.length === 0, errors, steps };
}

export function nextDevelopmentVersion(programs = [], familyId = "") {
  const versions = programs
    .filter((program) => program.familyId === familyId)
    .map((program) => Number(program.version || 0))
    .filter(Number.isFinite);
  return (versions.length ? Math.max(...versions) : 0) + 1;
}

export function latestPublishedPrograms(programs = []) {
  const latest = new Map();
  programs.filter((program) => program.status === "published").forEach((program) => {
    const current = latest.get(program.familyId);
    if (!current || Number(program.version || 0) > Number(current.version || 0)) latest.set(program.familyId, program);
  });
  return [...latest.values()].sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "fr"));
}

export function sortDevelopmentPrograms(programs = []) {
  return [...programs].sort((a, b) => {
    const status = (PROGRAM_STATUS_ORDER[a.status] ?? 9) - (PROGRAM_STATUS_ORDER[b.status] ?? 9);
    return status || String(a.title || "").localeCompare(String(b.title || ""), "fr") || Number(b.version || 0) - Number(a.version || 0);
  });
}

export function developmentProgramSnapshot(program = {}) {
  return {
    programId: program.id || "",
    familyId: program.familyId || "",
    programTitle: program.title || "Programme",
    programType: program.programType || "training",
    programVersion: Number(program.version || 1),
    steps: (program.steps || []).map(normalizeDevelopmentStep)
  };
}

export function developmentStepState(assignment = {}, stepId = "") {
  return assignment.stepStates?.[stepId] || { status: "pending", note: "", evidenceUrl: "" };
}

export function developmentAssignmentProgress(assignment = {}) {
  const steps = Array.isArray(assignment.steps) ? assignment.steps : [];
  const states = assignment.stepStates || {};
  const doneStatuses = new Set(["completed", "not_applicable"]);
  const completed = steps.filter((step) => doneStatuses.has(states[step.id]?.status)).length;
  const started = steps.filter((step) => ["in_progress", "completed", "not_applicable"].includes(states[step.id]?.status)).length;
  const requiredSteps = steps.filter((step) => step.required !== false);
  const requiredCompleted = requiredSteps.filter((step) => doneStatuses.has(states[step.id]?.status)).length;
  const percent = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  return {
    total: steps.length,
    completed,
    remaining: Math.max(0, steps.length - completed),
    started,
    requiredTotal: requiredSteps.length,
    requiredCompleted,
    percent,
    allDone: Boolean(steps.length) && completed === steps.length,
    requiredDone: requiredCompleted === requiredSteps.length
  };
}

export function effectiveDevelopmentAssignmentStatus(assignment = {}) {
  if (assignment.status === "paused") return "paused";
  if (assignment.status === "in_progress" && assignment.reopenedAt) return "in_progress";
  const progress = developmentAssignmentProgress(assignment);
  if (progress.allDone) return "completed";
  if (progress.started) return "in_progress";
  return "not_started";
}

export function canCompleteDevelopmentStep(step = {}, value = {}) {
  if (value.status !== "completed") return { valid: true, error: "" };
  if (step.evidenceRequired && !String(value.evidenceUrl || "").trim()) {
    return { valid: false, error: "Ajoute le lien de preuve avant de terminer cette etape." };
  }
  return { valid: true, error: "" };
}

export function activeDevelopmentAssignments(assignments = []) {
  return assignments.filter((assignment) => !assignment.archivedAt && effectiveDevelopmentAssignmentStatus(assignment) !== "completed");
}

export function developmentAssignmentsForMember(assignments = [], memberId = "") {
  return assignments
    .filter((assignment) => assignment.teamMemberId === memberId && !assignment.archivedAt)
    .sort((a, b) => {
      const activeA = effectiveDevelopmentAssignmentStatus(a) === "completed" ? 1 : 0;
      const activeB = effectiveDevelopmentAssignmentStatus(b) === "completed" ? 1 : 0;
      return activeA - activeB || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
}
