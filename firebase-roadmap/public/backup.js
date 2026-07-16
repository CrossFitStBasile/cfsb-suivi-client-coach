export const BACKUP_SCHEMA_VERSION = "cfsb-roadmap-backup-v1";

export const OWNER_BACKUP_COLLECTIONS = [
  "users",
  "roadmapForms",
  "roadmapCycles",
  "orgDepartments",
  "teamMembers",
  "teamMemberPrivate",
  "memberPortalProfiles",
  "portalInvitations",
  "roadmapDrafts",
  "roadmapSubmissions",
  "ownerNotes",
  "careerMilestones",
  "careerUpdates",
  "memberCareerPlans",
  "memberCareerPlanEvents",
  "memberSharedSummaries",
  "teamMeetings",
  "workingGeniusProfiles",
  "developmentPrograms",
  "developmentAssignments",
  "managementTasks",
  "businessStrategy",
  "strategyDecisions",
  "pilotageMetrics",
  "pilotageMetricEntries",
  "pilotageRocks",
  "pilotageIssues",
  "pilotageMeetings",
  "revenueScenarios",
  "notificationJobs",
  "auditLogs",
  "clientErrors"
];

export function portableBackupValue(value) {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(portableBackupValue);
  if (typeof value === "object") {
    if (Number.isFinite(Number(value.seconds)) && Number.isFinite(Number(value.nanoseconds || 0))) {
      return new Date(Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6)).toISOString();
    }
    return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item !== "undefined" && typeof item !== "function").map(([key, item]) => [key, portableBackupValue(item)]));
  }
  return String(value);
}

export function buildOwnerBackup({ projectId, actor, exportedAt, collections = {}, nested = {} } = {}) {
  const normalizedCollections = Object.fromEntries(OWNER_BACKUP_COLLECTIONS.map((name) => [name, (collections[name] || []).map(portableBackupValue)]));
  const normalizedNested = portableBackupValue(nested);
  const collectionCounts = Object.fromEntries(Object.entries(normalizedCollections).map(([name, docs]) => [name, docs.length]));
  const nestedCounts = Object.fromEntries(Object.entries(normalizedNested).map(([name, groups]) => [name, Object.values(groups || {}).reduce((sum, docs) => sum + (Array.isArray(docs) ? docs.length : 0), 0)]));
  const totalRecords = Object.values(collectionCounts).reduce((sum, count) => sum + count, 0) + Object.values(nestedCounts).reduce((sum, count) => sum + count, 0);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    projectId: String(projectId || ""),
    exportedAt: portableBackupValue(exportedAt || new Date()),
    actor: {
      uid: String(actor?.uid || ""),
      name: String(actor?.name || "Owner"),
      email: String(actor?.email || "")
    },
    manifest: {
      collectionCount: OWNER_BACKUP_COLLECTIONS.length,
      collectionCounts,
      nestedCounts,
      totalRecords
    },
    collections: normalizedCollections,
    nested: normalizedNested
  };
}

export function validateOwnerBackup(backup = {}) {
  const errors = [];
  if (backup.schemaVersion !== BACKUP_SCHEMA_VERSION) errors.push("Version de sauvegarde non reconnue.");
  if (!backup.projectId) errors.push("Projet Firebase absent.");
  if (!backup.exportedAt || Number.isNaN(Date.parse(backup.exportedAt))) errors.push("Date d'export invalide.");
  if (!backup.collections || typeof backup.collections !== "object") errors.push("Collections absentes.");
  for (const name of OWNER_BACKUP_COLLECTIONS) {
    if (!Array.isArray(backup.collections?.[name])) errors.push(`Collection absente: ${name}.`);
  }
  const expected = Object.values(backup.collections || {}).reduce((sum, docs) => sum + (Array.isArray(docs) ? docs.length : 0), 0)
    + Object.values(backup.nested || {}).reduce((sum, groups) => sum + Object.values(groups || {}).reduce((nestedSum, docs) => nestedSum + (Array.isArray(docs) ? docs.length : 0), 0), 0);
  if (backup.manifest?.totalRecords !== expected) errors.push("Le manifeste ne correspond pas au contenu.");
  return { valid: errors.length === 0, errors, totalRecords: expected };
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function ownerBackupFileName(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const stamp = Number.isNaN(date.getTime()) ? "date-inconnue" : date.toISOString().replace(/[:.]/g, "-");
  return `cfsb-roadmap-backup-${stamp}.json`;
}
