const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docs = {
  releaseStatus: path.join(root, "firebase-dashboard", "PILOT_RELEASE_STATUS.md"),
  deployRunbook: path.join(root, "firebase-dashboard", "DEPLOY_RUNBOOK.md"),
  finalizationBoard: path.join(root, "firebase-dashboard", "FINALIZATION_BOARD.md"),
  handoff: path.join(root, "firebase-dashboard", "PILOT_HANDOFF.md"),
  workQueue: path.join(root, "firebase-dashboard", "NEXT_WORK_QUEUE.md")
  , weekendWorkLog: path.join(root, "firebase-dashboard", "WEEKEND_WORK_LOG.md")
  , activationKit: path.join(root, "firebase-dashboard", "SOURCE_ACTIVATION_KIT.md")
  , activationStatus: path.join(root, "firebase-dashboard", "SOURCE_ACTIVATION_STATUS.json")
  , bobHandoff: path.join(root, "firebase-dashboard", "BOB_OPERATOR_SOURCE_HANDOFF.md")
};

const text = Object.fromEntries(
  Object.entries(docs).map(([key, file]) => [key, fs.readFileSync(file, "utf8")])
);
const appJs = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "app.js"), "utf8");
const currentAppVersion = appJs.match(/const APP_VERSION = "([^"]+)"/)?.[1] || "";
const publicAndDocs = [
  ...Object.values(text),
  appJs,
  fs.readFileSync(path.join(root, "firebase-dashboard", "public", "index.html"), "utf8"),
  fs.readFileSync(path.join(root, "firebase-dashboard", "public", "styles.css"), "utf8")
].join("\n");
const liveAuditTool = fs.readFileSync(path.join(root, "tools", "audit-live-firestore.cjs"), "utf8");

const expectedLiveVersion = "20260707-coachrx-extraction-guard";
const protectedRebookingDeploymentId = "AKfycbyEbzQqx2lEoXge3wFvD0wjn0oAplj3fISXE-3jWR-sXHWXJKQ_FyNbbxaiwk6hrB9e5A";
const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

check(
  "release status current versions",
  text.releaseStatus.includes(expectedLiveVersion)
    && text.releaseStatus.includes("Etat publication 2026-06-19")
    && text.releaseStatus.includes("Hosting publie et valide")
    && text.releaseStatus.includes("12/12")
    && text.releaseStatus.includes("publication MVP")
    && text.releaseStatus.includes("bundle live")
    && text.releaseStatus.includes("valider-dashboard-equipe.cmd"),
  "Le statut release doit exposer la version live courante et la validation equipe restante."
);

check(
  "deploy runbook current target",
  includesAll(text.deployRunbook, [
    `app.js?v=${expectedLiveVersion}`,
    `APP_VERSION = ${expectedLiveVersion}`,
    expectedLiveVersion,
    "Etat live courant",
    "firebase login --reauth",
    "valider-dashboard-equipe.cmd",
    "verify-dashboard-live.cmd",
    "deploy-dashboard-complet.cmd"
  ]),
  "Le runbook doit distinguer le live actuel et les chemins de publication/validation."
);

check(
  "finalization board current target",
  includesAll(text.finalizationBoard, [
    "Etat Hosting confirme le 2026-07-19",
    "bundle live porte",
    "publication initiale",
    `app.js?v=${currentAppVersion}`,
    "audit produit: 86/86",
    "audit live acces coach: OK",
    "audit live Firestore: OK",
    "cmd /c verify-dashboard-live-stable.cmd"
  ]),
  "Le board de finalisation doit indiquer clairement l'etat live courant."
);

check(
  "handoff current instructions",
  includesAll(text.handoff, [
    expectedLiveVersion,
    "valider-dashboard-equipe.cmd",
    "validation humaine",
    "audit-live-firestore.cmd"
  ]),
  "Le handoff doit donner la reprise exacte si Michael revient apres une coupure d'acces."
);

check(
  "work queue current next pass",
  includesAll(text.workQueue, [
    expectedLiveVersion,
    "validation humaine des 7 coachs pilotes",
    "valider-dashboard-equipe.cmd",
    "publier-dashboard-mvp.cmd",
    "Audit coach par coach"
  ]),
  "La file de travail doit decrire la prochaine passe produit depuis la version live courante."
);

check(
  "weekend work log is actionable",
  includesAll(text.weekendWorkLog, [
    expectedLiveVersion,
    "Hosting publie et valide",
    "verify-dashboard-before-deploy.cmd",
    "verify-dashboard-live.cmd",
    "valider-dashboard-equipe.cmd",
    "audit-live-firestore.cmd",
    "TASKS_Current",
    "secret serveur GHL"
  ]),
  "Le journal week-end doit permettre de reprendre le projet sans relire toute la conversation."
);

check(
  "source activation kit is current",
  includesAll(text.activationKit, [
    "SOURCE_PAYLOAD_CONTRACTS.json",
    "SOURCE_ACTIVATION_STATUS.json",
    "previewDashboardImportPayload_",
    "pushDashboardSourceToFirebase_",
    "DASHBOARD_IMPORT_TOKEN",
    "Bob Operator",
    "BOB_OPERATOR_SOURCE_HANDOFF.md",
    "sourceImportRuns",
    "coachSyncStatus"
  ]),
  "Le kit d'activation doit permettre de brancher une source sans exposer de secret ni relire toute la conversation."
);

check(
  "source activation status is current",
  includesAll(text.activationStatus, [
    "coachrx_clients",
    "client_directory",
    "ghl_contacts",
    "questionnaire_responses",
    "checkups",
    "rebooking",
    "knownHumanActions",
    "nextNoInterventionWork"
  ]),
  "Le statut source doit separer le travail autonome des blocages d'acces."
);

check(
  "bob source handoff is executable",
  includesAll(text.bobHandoff, [
    "AUTO-002",
    "AUTO-003",
    "AUTO-004",
    "AUTO-009",
    "DASHBOARD_IMPORT_TOKEN",
    "previewDashboardImportPayload_",
    "pushDashboardSourceToFirebase_",
    "sourceImportRuns",
    "coachSyncStatus",
    "Rebooking legacy"
  ]),
  "Le handoff Bob doit transformer les sources Google Workspace en paquets d'activation sans exposer de secret."
);

check(
  "protected rebooking links not in public docs",
  !/script\.google\.com\/macros\/s\/[^"'`\s<>]+[?&]token=/i.test(publicAndDocs)
    && !publicAndDocs.includes(protectedRebookingDeploymentId),
  "Les liens Apps Script rebooking avec tokens doivent rester hors assets publics et hors documentation de reprise."
);

check(
  "live audit has global source diagnostic",
  includesAll(liveAuditTool, [
    "function buildGlobalDiagnostic",
    "SOURCE_ACTIVATION_STATUS.json",
    "function pickTriageItems",
    "symptomTriage",
    "needs_source_activation",
    "client_directory",
    "google_sheets_tasks_current",
    "questionnaires",
    "rebooking",
    "globalDiagnostic"
  ]),
  "L'audit live doit transformer les constats Firestore en priorites sources/actionnables, pas seulement lister les coachs."
);

const failures = checks.filter((item) => !item.passed);
const result = {
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);


