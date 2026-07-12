import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const firebaseRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(firebaseRoot, "..");
const configPath = path.join(repoRoot, "roadmap", "data", "roadmap-config.json");
const snapshotPath = path.join(repoRoot, "roadmap", "data", "roadmap-submissions-cache.json");
const sourceExportPath = process.env.ROADMAP_SOURCE_EXPORT
  ? path.resolve(process.env.ROADMAP_SOURCE_EXPORT)
  : "";
const outputPath = path.join(firebaseRoot, "tmp", "roadmap-import-bundle.json");

const [config, sourcePayload] = await Promise.all([
  readJson(configPath),
  readJson(sourceExportPath || snapshotPath)
]);

validateConfig(config);
const source = sourceExportPath
  ? normalizeSheetExport(sourcePayload)
  : normalizePublicSnapshot(sourcePayload);
validateSource(source);

const defaultFormVersion = String(config.meta?.version || "unknown");
const cycleIds = [...new Set(source.submissions.map((submission) => submission.quarter).filter(Boolean))];
const questionnaireDocument = {
  project: config.meta?.project || "roadmap-trimestrielle-cfsb",
  version: defaultFormVersion,
  active: true,
  config,
  configHash: sha256(config)
};

const roadmapSubmissions = {};
const ownerNotes = {};
for (const submission of source.submissions) {
  const sourceId = submission.serverSubmissionId || submission.id;
  const employeeName = submission.answers?.employee_name || submission.employeeName || "Sans nom";
  const formVersion = String(submission.configVersion || defaultFormVersion);
  roadmapSubmissions[sourceId] = {
    authorUid: "legacy-apps-script",
    sourceSubmissionId: sourceId,
    clientSubmissionId: submission.clientSubmissionId || "",
    resumedFromSubmissionId: submission.resumedFromSubmissionId || "",
    teamMemberId: slug(employeeName),
    employeeName,
    employeeEmail: submission.answers?.employee_email || submission.employeeEmail || "",
    cycleId: submission.quarter || "unknown-cycle",
    formVersion,
    formConfigHash: questionnaireDocument.configHash,
    selectedRoleId: submission.selectedRoleId || "",
    selectedRoleLabel: submission.selectedRoleLabel || "",
    answers: submission.answers || {},
    completion: submission.completion || null,
    status: submission.archivedAt ? "archived" : normalizeStatus(submission.ownerNotes?.owner_status),
    source: "apps_script_import",
    submittedAt: submission.submittedAt || null,
    archivedAt: submission.archivedAt || null,
    importMeta: {
      sourceKind: source.kind,
      sourceExportedAt: source.exportedAt || null,
      sourceProject: "roadmap-trimestrielle-cfsb"
    }
  };

  if (submission.ownerNotes && Object.keys(submission.ownerNotes).length) {
    ownerNotes[sourceId] = {
      submissionId: sourceId,
      reviewerName: submission.ownerNotes.owner_reviewer || "",
      ownerStatus: normalizeStatus(submission.ownerNotes.owner_status),
      meetingFormat: submission.ownerNotes.owner_meeting_format || "",
      peopleValues: submission.ownerNotes.owner_people_values || "",
      gwc: submission.ownerNotes.owner_gwc || "",
      performance: submission.ownerNotes.owner_performance || "",
      priorityTopics: submission.ownerNotes.owner_priority_topics || "",
      questions: submission.ownerNotes.owner_questions || "",
      directionCommitments: submission.ownerNotes.owner_direction_commitments || "",
      followupNotes: submission.ownerNotes.owner_followup_notes || "",
      sourceUpdatedAt: submission.ownerNotes.updated_at || submission.ownerNotes.updatedAt || null,
      legacy: submission.ownerNotes
    };
  }
}

const collections = {
  roadmapForms: {
    [safeId(defaultFormVersion)]: questionnaireDocument
  },
  roadmapCycles: Object.fromEntries(cycleIds.map((cycleId) => [cycleId, {
    label: cycleId,
    status: "closed",
    public: false,
    formVersion: defaultFormVersion
  }])),
  roadmapSubmissions,
  ownerNotes,
  orgDepartments: source.orgDepartments,
  teamMembers: source.teamMembers,
  auditLogs: source.auditLogs
};

const bundle = {
  metadata: {
    generatedAt: new Date().toISOString(),
    sourceKind: source.kind,
    sourceExportedAt: source.exportedAt || null,
    sourceSubmissionCount: source.submissions.length,
    formVersion: defaultFormVersion,
    configHash: questionnaireDocument.configHash,
    idempotencyKey: sha256({
      sourceKind: source.kind,
      sourceExportedAt: source.exportedAt || null,
      submissionIds: Object.keys(collections.roadmapSubmissions).sort(),
      formVersion: defaultFormVersion
    })
  },
  collections
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  outputPath,
  sourceKind: source.kind,
  sourceExportedAt: source.exportedAt || null,
  formVersion: defaultFormVersion,
  submissions: Object.keys(collections.roadmapSubmissions).length,
  active: Object.values(collections.roadmapSubmissions).filter((item) => item.status !== "archived").length,
  archived: Object.values(collections.roadmapSubmissions).filter((item) => item.status === "archived").length,
  ownerNotes: Object.keys(collections.ownerNotes).length,
  teamMembers: Object.keys(collections.teamMembers).length,
  auditLogs: Object.keys(collections.auditLogs).length,
  cycles: Object.keys(collections.roadmapCycles),
  idempotencyKey: bundle.metadata.idempotencyKey
}, null, 2));

function normalizePublicSnapshot(snapshot) {
  if (!Array.isArray(snapshot?.submissions)) {
    throw new Error("Snapshot Roadmap invalide: submissions[] manquant.");
  }
  return {
    kind: "github_active_snapshot",
    exportedAt: snapshot.snapshotGeneratedAt || null,
    submissions: snapshot.submissions,
    orgDepartments: {},
    teamMembers: {},
    auditLogs: {}
  };
}

function normalizeSheetExport(payload) {
  const tabs = payload?.tabs || {};
  const submissionRows = tabs.Submissions?.records || [];
  const responseRows = tabs.Responses?.records || [];
  const ownerRows = tabs.Owner_Assessments?.records || [];
  const actionRows = tabs.Submission_Admin_Actions?.records || [];
  const logRows = tabs.Submission_Log?.records || [];
  const teamRows = tabs.Team_Members?.records || [];
  const aspirationRows = tabs.Coach_Aspirations?.records || [];

  if (!submissionRows.length) throw new Error("Export Google Sheets sans onglet Submissions exploitable.");

  const answersBySubmission = new Map();
  responseRows.forEach((row) => {
    if (!row.submission_id || !row.question_id) return;
    const answers = answersBySubmission.get(row.submission_id) || {};
    answers[row.question_id] = row.answer ?? "";
    answersBySubmission.set(row.submission_id, answers);
  });

  const latestOwnerBySubmission = latestBySubmission(ownerRows, "submission_id");
  const latestArchiveBySubmission = latestBySubmission(
    actionRows.filter((row) => row.action === "archived"),
    "submission_id"
  );
  const latestAspirationBySubmission = latestBySubmission(aspirationRows, "submission_id");

  const submissions = submissionRows.map((row) => {
    const sourceId = row.submission_id;
    const raw = parseJsonObject(row.raw_json);
    const ownerRow = latestOwnerBySubmission.get(sourceId) || {};
    const ownerRaw = parseJsonObject(ownerRow.raw_json);
    const archiveRow = latestArchiveBySubmission.get(sourceId);
    const aspiration = latestAspirationBySubmission.get(sourceId) || null;
    return {
      id: sourceId,
      serverSubmissionId: sourceId,
      clientSubmissionId: row.client_submission_id || raw.clientSubmissionId || "",
      resumedFromSubmissionId: row.resumed_from_submission_id || raw.resumeSubmissionId || "",
      submittedAt: row.submitted_at || raw.submittedAt || null,
      quarter: row.quarter || raw.quarter || "",
      configVersion: row.config_version || raw.configVersion || "",
      employeeName: row.employee_name || raw.answers?.employee_name || "",
      employeeEmail: row.employee_email || raw.answers?.employee_email || "",
      selectedRoleId: row.selected_role_id || raw.selectedRoleId || "",
      selectedRoleLabel: row.selected_role_label || raw.selectedRoleLabel || "",
      answers: {
        ...(raw.answers || {}),
        ...(answersBySubmission.get(sourceId) || {})
      },
      ownerNotes: ownerNoteFromRows(ownerRow, ownerRaw),
      aspiration,
      archivedAt: archiveRow?.updated_at || null
    };
  });

  const departmentOrder = {
    direction: 10,
    operations: 20,
    coaching: 30,
    support: 40
  };
  const orgDepartments = {};
  const teamMembers = {};
  teamRows.forEach((row) => {
    if (!row.member_id) return;
    const raw = parseJsonObject(row.raw_json);
    const departmentId = row.department_id || raw.departmentId || "support";
    if (!orgDepartments[departmentId]) {
      orgDepartments[departmentId] = {
        label: row.department_label || titleCase(departmentId),
        className: departmentId,
        sortOrder: departmentOrder[departmentId] || 999,
        active: true
      };
    }
    teamMembers[row.member_id] = {
      name: row.name || raw.name || "",
      normalizedName: slug(row.name || raw.name || row.member_id),
      departmentId,
      displayTitle: row.display_title || raw.displayTitle || "",
      roleIds: splitList(row.role_ids || raw.roleIds),
      sortOrder: Number(row.sort_order || raw.sortOrder || 999),
      active: toBoolean(row.active ?? raw.active),
      sourceUpdatedAt: row.updated_at || raw.updatedAt || null,
      source: "apps_script_import"
    };
  });

  const auditLogs = {};
  logRows.forEach((row) => {
    const id = `legacy-log-${row._sheetRow || "x"}-${sha256(row).slice(0, 12)}`;
    auditLogs[id] = {
      action: row.event_type || "legacy_event",
      entityType: "roadmapSubmission",
      entityId: row.submission_id || "",
      status: row.status || "",
      message: row.message || "",
      details: parseJsonObject(row.raw_json),
      sourceCreatedAt: row.timestamp || null,
      source: "apps_script_import"
    };
  });

  return {
    kind: "google_sheets_full_export",
    exportedAt: payload.metadata?.exportedAt || null,
    submissions,
    orgDepartments,
    teamMembers,
    auditLogs
  };
}

function ownerNoteFromRows(row, raw) {
  if (!row || !Object.keys(row).length) return {};
  const rawNotes = raw.ownerNotes || raw;
  return {
    owner_reviewer: row.owner_reviewer || rawNotes.owner_reviewer || "",
    owner_people_values: row.owner_people_values || rawNotes.owner_people_values || "",
    owner_gwc: row.owner_gwc || rawNotes.owner_gwc || "",
    owner_performance: row.owner_performance || rawNotes.owner_performance || "",
    owner_priority_topics: row.owner_priority_topics || rawNotes.owner_priority_topics || "",
    owner_questions: row.owner_questions || rawNotes.owner_questions || "",
    owner_meeting_format: row.owner_meeting_format || rawNotes.owner_meeting_format || "",
    owner_direction_commitments: row.owner_direction_commitments || rawNotes.owner_direction_commitments || "",
    owner_followup_notes: row.owner_followup_notes || rawNotes.owner_followup_notes || "",
    owner_status: rawNotes.owner_status || "to_read",
    updated_at: row.updated_at || rawNotes.updatedAt || null
  };
}

function latestBySubmission(rows, idField) {
  const result = new Map();
  rows.forEach((row) => {
    const id = row[idField];
    if (id) result.set(id, row);
  });
  return result;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function validateConfig(value) {
  if (!value?.meta || !Array.isArray(value.roles) || !Array.isArray(value.modules)) {
    throw new Error("Configuration Roadmap invalide.");
  }
}

function validateSource(value) {
  const ids = new Set();
  value.submissions.forEach((submission, index) => {
    const id = submission?.serverSubmissionId || submission?.id;
    if (!id) throw new Error(`Soumission #${index + 1} sans identifiant.`);
    if (ids.has(id)) throw new Error(`Identifiant de soumission duplique: ${id}`);
    if (!submission.answers || typeof submission.answers !== "object") {
      throw new Error(`Soumission ${id} sans reponses.`);
    }
    ids.add(id);
  });
}

function parseJsonObject(value) {
  if (!value || typeof value === "object") return value && !Array.isArray(value) ? value : {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function slug(value) {
  return String(value || "sans-nom")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sans-nom";
}

function normalizeStatus(value) {
  const aliases = {
    planned: "meeting_planned",
    done: "meeting_done",
    action: "action_required",
    archived: "ready_to_archive"
  };
  const normalized = aliases[value] || value || "to_read";
  const allowed = new Set([
    "to_read",
    "meeting_planned",
    "meeting_done",
    "action_required",
    "ready_to_archive",
    "archived"
  ]);
  return allowed.has(normalized) ? normalized : "to_read";
}

function splitList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "").split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  return !["false", "0", "no", "non", "inactive"].includes(String(value || "").trim().toLowerCase());
}

function titleCase(value) {
  const text = String(value || "").replace(/[_-]+/g, " ");
  return text ? text[0].toUpperCase() + text.slice(1) : "Equipe";
}
