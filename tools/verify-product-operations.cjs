const fs = require("fs");
const path = require("path");
const { buildWeeklyProductReport, taskCategory } = require("../functions/product-report");

const root = path.resolve(__dirname, "..");
const functionsSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "index.html"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const operatingPlan = fs.readFileSync(path.join(root, "firebase-dashboard", "PRODUCT_OPERATING_SYSTEM.md"), "utf8");
const appVersion = appSource.match(/const APP_VERSION = "([^"]+)"/)?.[1] || "";

const now = new Date("2026-07-09T13:00:00.000Z");
const recent = (days, hour = 12) => new Date(now.getTime() - days * 86400000 + hour * 1000).toISOString();
const pilotCoaches = [
  { id: "15935", name: "Marc-Andre", email: "marc@example.test" },
  { id: "15928", name: "Iheb", email: "iheb@example.test" }
];

const report = buildWeeklyProductReport({
  now,
  pilotCoaches,
  usageEvents: [
    { actorCoachId: "15935", userRole: "coach", sessionId: "a", tab: "todo", deviceType: "mobile", createdAt: recent(1) },
    { actorCoachId: "15935", userRole: "coach", sessionId: "b", tab: "clients", deviceType: "mobile", createdAt: recent(2) },
    { actorCoachId: "15928", userRole: "coach", sessionId: "c", tab: "todo", deviceType: "desktop", createdAt: recent(1) },
    { actorCoachId: "15935", userRole: "admin", sessionId: "admin", tab: "admin", deviceType: "desktop", createdAt: recent(1) }
  ],
  actionLogs: [
    { userEmail: "marc@example.test", userRole: "coach", action: "task.created", createdAt: recent(1) },
    { userEmail: "marc@example.test", userRole: "coach", action: "task.completed", createdAt: recent(2) },
    { userEmail: "iheb@example.test", userRole: "coach", action: "questionnaire.read", createdAt: recent(1) }
  ],
  tasks: [
    { coachId: "15935", type: "rebooking", title: "Nom client secret 1", status: "open", priority: "P1", dueAt: "2026-07-01", createdAt: recent(3) },
    { coachId: "15935", type: "rebooking", title: "Nom client secret 2", status: "done", createdAt: recent(5) },
    { coachId: "15928", type: "rebooking", title: "Nom client secret 3", status: "open", createdAt: recent(8) },
    { coachId: "15928", type: "program", title: "Programme sensible", status: "open", createdAt: recent(2) }
  ],
  rebookings: [
    { coachId: "15935", status: "open", detectedAt: recent(18) },
    { coachId: "15928", status: "rebooked", detectedAt: recent(4) }
  ],
  questionnaireResponses: [
    { coachId: "15935", processingStatus: "to_read", submittedAt: recent(5) }
  ],
  questionnaireSends: [
    { coachId: "15928", status: "error", errorMessage: "GHL error", createdAt: recent(1) }
  ],
  coachSyncStatuses: [
    { id: "15935", coachId: "15935", status: "ok", syncedAt: recent(0) },
    { id: "15928", coachId: "15928", status: "warning", syncedAt: recent(2) }
  ],
  syncRuns: [
    { status: "error", createdAt: recent(1) },
    { status: "success", createdAt: recent(0) }
  ]
});

const serialized = JSON.stringify(report);
const checks = {
  reportCountsActiveCoaches: report.adoption.activeCoaches === 2,
  reportIgnoresAdminUsage: report.adoption.sessions === 3,
  reportIgnoresAdminDevice: report.adoption.deviceMix.find((item) => item.key === "desktop")?.count === 1,
  reportCountsCoachActions: report.adoption.actions === 3,
  reportFindsStaleOperations: report.operations.staleTasks >= 1 && report.operations.agedRebookings === 1,
  reportFindsQuestionnaireIssues: report.operations.agedUnreadQuestionnaires === 1 && report.operations.questionnaireSendErrors === 1,
  reportFindsSyncIssues: report.syncHealth.staleCoachCount === 1 && report.syncHealth.failedRuns === 1,
  reportFindsRepeatedTasks: report.automationCandidates.some((item) => item.category === "rebooking_followups" && item.count === 3),
  reportDoesNotCopyTaskContent: !serialized.includes("Nom client secret") && !serialized.includes("Programme sensible"),
  categoriesStayDeterministic: taskCategory({ type: "questionnaire_followup" }) === "questionnaire_followups",
  weeklyScheduleExists: functionsSource.includes('exports.scheduledWeeklyProductReport = onSchedule')
    && functionsSource.includes('schedule: "every thursday 09:00"')
    && functionsSource.includes('timeZone: "America/Toronto"'),
  manualQueueExists: functionsSource.includes('exports.processProductReportRequest = onDocumentCreated')
    && functionsSource.includes('document: "productReportRequests/{requestId}"')
    && functionsSource.includes("generateProductOperationsReport"),
  reportsArePrivate: rulesSource.includes("match /weeklyProductReports/{reportId}")
    && rulesSource.includes("match /productReportRequests/{requestId}")
    && rulesSource.includes("allow read: if isAdmin();"),
  adminSurfaceExists: appSource.includes("function renderAdminWeeklyProductReport")
    && appSource.includes('data-action="requestProductReport"')
    && appSource.includes("function subscribeWeeklyProductReports")
    && appSource.includes("function requestProductReport"),
  versionIsAligned: Boolean(appVersion)
    && indexSource.includes(`app.js?v=${appVersion}`)
    && indexSource.includes(`styles.css?v=${appVersion}`),
  operatingCadenceIsDocumented: ["Chaque jour", "Chaque jeudi a 9 h", "Toutes les deux semaines", "Chaque mois", "Chaque trimestre"]
    .every((value) => operatingPlan.includes(value))
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ ok: failed.length === 0, checks, failed, sample: report }, null, 2));
if (failed.length) process.exit(1);
