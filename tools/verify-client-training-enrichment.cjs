const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const bridge = read("firebase-dashboard/apps-script/dashboard-csm-firestore-bridge.gs");
const functions = read("functions/index.js");
const app = read("firebase-dashboard/public/app.js");
const styles = read("firebase-dashboard/public/styles.css");
const index = read("firebase-dashboard/public/index.html");
const rules = read("firestore.rules");
const model = read("firebase-dashboard/DATA_MODEL.md");
const contracts = JSON.parse(read("firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json"));

function sheet(values) {
  return { getDataRange: () => ({ getDisplayValues: () => values }) };
}

const sheets = {
  "Cours de groupe": sheet([
    ["Name", "Statut", "Coach", "Phone", "Email", "Active packages"],
    ["Thierry Cloutier", "Member", "Iheb Yahyaoui", "514-555-0101", "thierry@example.test", "Semi-Prive 1x/sem"]
  ]),
  "Suivi personnel": sheet([
    ["Name", "Statut", "Coach", "Phone", "Email", "Active packages"],
    ["Genevieve Clement", "Member", "Iheb Yahyaoui", "514-555-0102", "genevieve@example.test", "Semi-Prive 1x/sem"]
  ]),
  "Coach Mac": sheet([["Name", "Statut", "Coach"]]),
  "Low Attendances": sheet([
    ["Full Name", "Current Status", "Email", "Phone", "Class Attendance", "Class Reservations", "Appointment Attendance", "Appointment Reservations", "Imported Event Attendance", "Imported Event Reservations", "Total Attendance", "Total Reservations", "Current Packages"],
    ["Thierry Cloutier", "Active", "thierry@example.test", "5145550101", "3", "3", "4", "4", "0", "0", "7", "7", "Semi-Prive"],
    ["Genevieve Clement", "Active", "genevieve@example.test", "5145550102", "0", "0", "0", "0", "0", "0", "0", "0", "Semi-Prive"]
  ]),
  LM: sheet([
    ["NAME", "EMAIL", "OVERALL LEVEL", "LEVELS LOGGED"],
    ["Thierry Cloutier", "thierry@example.test", "YELLOW II", "18"],
    ["Genevieve Clement", "genevieve@example.test", "ORANGE I", "9"]
  ]),
  "Kilo Raw - Athletes": sheet([
    ["Athlete ID", "Name", "Phone", "Email", "Current packages", "Member Since"],
    ["athlete-thierry", "Thierry Cloutier", "5145550101", "thierry@example.test", "Semi-Prive", "2024-01-01"],
    ["athlete-genevieve", "Genevieve Clement", "5145550102", "genevieve@example.test", "Semi-Prive", "2024-01-02"]
  ]),
  "Formulaire Checkup": sheet([["Nom", "Date", "coach"]])
};

const sandbox = {
  console: { log() {} },
  CSM_SPREADSHEET_ID: "test-sheet",
  SpreadsheetApp: {
    openById() {
      return { getSheetByName: (name) => sheets[name] || null };
    }
  },
  Utilities: {
    formatDate: () => "20260711-120000",
    getUuid: () => "00000000-0000-0000-0000-000000000000"
  },
  Number,
  Date,
  Object,
  String,
  Array,
  JSON,
  Math
};
vm.createContext(sandbox);
vm.runInContext(bridge, sandbox, { filename: "dashboard-csm-firestore-bridge.gs" });
const preview = sandbox.previewDashboardFirebaseCsmBridge();
const ihebPayload = preview.queuedCount === 0
  ? sandbox.dashboardCsmBuildPayloads_().payloads.find((payload) => payload.sourceType === "client_enrichment" && payload.coachRxId === "15928")
  : null;
const records = ihebPayload?.records || [];
const thierry = records.find((record) => record.clientName === "Thierry Cloutier") || {};
const genevieve = records.find((record) => record.clientName === "Genevieve Clement") || {};
const version = app.match(/const APP_VERSION = "([^"]+)"/)?.[1] || "";
const clientDirectoryContract = (contracts.contracts || []).find((contract) => contract.sourceType === "client_directory") || {};

const checks = [
  ["bridge version", bridge.includes("20260711-csm-attendance-level-enrichment")],
  ["attendance source tabs", bridge.includes("DASHBOARD_CSM_ATTENDANCE_TAB = 'Low Attendances'") && bridge.includes("DASHBOARD_CSM_LEVEL_METHOD_TAB = 'LM'")],
  ["Thierry attendance total", thierry.attendance30Days === 7 && thierry.attendanceWindowDays === 30],
  ["Thierry attendance components", thierry.classAttendance30Days === 3 && thierry.appointmentAttendance30Days === 4 && thierry.importedEventAttendance30Days === 0],
  ["Thierry Level Method", thierry.levelMethodOverall === "YELLOW II" && thierry.levelMethodLevelsLogged === 18],
  ["zero is not missing", genevieve.attendance30Days === 0 && genevieve.levelMethodOverall === "ORANGE I"],
  ["global enrichment stays portfolio-neutral", records.every((record) => record.coachRxId === "15928" && record.enrichmentScope === "all_csm_existing_clients")],
  ["backend applies snapshots", functions.includes("attendanceImportedAt") && functions.includes("levelMethodImportedAt") && functions.includes("optionalNonNegativeNumber")],
  ["manual target is not imported", !bridge.includes("targetSessionsPerWeek") && functions.includes("...existing")],
  ["client modal exposes target and actual", app.includes("renderClientTrainingRhythm(client)") && app.includes('data-form="clientTrainingTarget"') && app.includes("saveClientTrainingTarget")],
  ["mobile training layout", styles.includes(".client-training-metrics") && styles.includes("grid-template-columns: 1fr 1fr")],
  ["compact client list", app.includes("client-card-compact") && app.includes("renderClientInfoPills(client, { interactiveRhythm: true })")],
  ["technical badges stay out of client list", !app.slice(app.indexOf("function renderClientCard"), app.indexOf("function renderQuestionnaireItemCard")).includes("clientValidationSummary") && !app.slice(app.indexOf("function renderClientCard"), app.indexOf("function renderQuestionnaireItemCard")).includes("clientPhone")],
  ["Level Method keeps accessible colors", app.includes("function clientLevelMethodClass") && styles.includes(".client-info-pill.level-yellow") && styles.includes(".client-info-pill.level-orange") && styles.includes(".client-info-pill.level-blue")],
  ["rhythm opens from client card", app.includes('action: "openClientTraining"') && app.includes('state.modal.type === "clientTraining"') && app.includes("function renderClientTrainingModal")],
  ["client modal sections are distinct", styles.includes(".client-section-action") && styles.includes(".client-section-followup") && styles.includes(".client-section-training") && styles.includes(".client-section-summary")],
  ["coach rules allow same-coach client updates", rules.includes("allow update: if isAdmin() || keepsPilotCoach() || transfersOwnDocumentToPilotCoach();")],
  ["data model documents protected target", model.includes("targetSessionsPerWeek") && model.includes("aucun import externe ne doit le modifier")],
  ["payload contract documents metrics", JSON.stringify(clientDirectoryContract).includes("attendance30Days") && JSON.stringify(clientDirectoryContract).includes("levelMethodOverall")],
  ["cache busters align", Boolean(version) && index.includes(`app.js?v=${version}`) && index.includes(`styles.css?v=${version}`)]
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  sample: {
    thierry: {
      attendance30Days: thierry.attendance30Days,
      levelMethodOverall: thierry.levelMethodOverall
    },
    genevieve: {
      attendance30Days: genevieve.attendance30Days,
      levelMethodOverall: genevieve.levelMethodOverall
    }
  }
}, null, 2));
if (failures.length) process.exit(1);
