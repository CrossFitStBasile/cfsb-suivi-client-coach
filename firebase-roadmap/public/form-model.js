export function currentCycleId(date = new Date()) {
  const month = date.getMonth();
  return `${date.getFullYear()}-Q${Math.floor(month / 3) + 1}`;
}

export function safeDocumentId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export function draftDocumentId(uid, cycleId) {
  return `${safeDocumentId(uid)}_${safeDocumentId(cycleId)}`;
}

export function personNameKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join("|");
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function matchingTeamMember(teamMembers, identity = {}) {
  const email = normalizeEmail(identity.email);
  if (email) {
    const byEmail = teamMembers.find((member) => normalizeEmail(member.email) === email);
    if (byEmail) return byEmail;
  }

  const nameKey = personNameKey(identity.name);
  if (!nameKey) return null;
  return teamMembers.find((member) => {
    const aliases = [member.id, member.name, member.normalizedName, ...(member.aliases || [])];
    return aliases.some((alias) => personNameKey(alias) === nameKey);
  }) || null;
}

export function roleQuestions(config, roleId) {
  const role = (config?.roles || []).find((item) => item.id === roleId);
  if (!role) return [];
  const modules = new Map((config.modules || []).map((module) => [module.id, module]));
  return (role.moduleIds || []).flatMap((moduleId) => {
    const module = modules.get(moduleId);
    if (!module) return [];
    if (module.groups?.length) return module.groups.flatMap((group) => group.questions || []);
    return module.questions || [];
  }).filter((question) => question.type !== "info" && question.id);
}

export function isEmptyAnswer(value) {
  if (Array.isArray(value)) return !value.length;
  return value === undefined || value === null || String(value).trim() === "";
}

export function hasMeaningfulAnswers(answers = {}) {
  return Object.values(answers).some((value) => !isEmptyAnswer(value));
}

export function completionForRole(config, roleId, answers = {}) {
  const questions = roleQuestions(config, roleId);
  const total = questions.length;
  const answered = questions.filter((question) => !isEmptyAnswer(answers[question.id])).length;
  return {
    answered,
    total,
    percent: total ? Math.round((answered / total) * 100) : 0
  };
}

export async function sha256Json(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function newerDraft(localDraft, cloudDraft) {
  if (!localDraft) return cloudDraft || null;
  if (!cloudDraft) return localDraft;
  const localTime = timestampMillis(localDraft.savedAt || localDraft.updatedAt);
  const cloudTime = timestampMillis(cloudDraft.updatedAt || cloudDraft.savedAt);
  return cloudTime > localTime ? cloudDraft : localDraft;
}
