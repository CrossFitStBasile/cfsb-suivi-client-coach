const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const functionsSource = read("functions/index.js");
const rulesSource = read("firestore.rules");
const bridgeDoc = read("firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md");
const dataModel = read("firebase-dashboard/DATA_MODEL.md");
const readme = read("firebase-dashboard/README.md");
const appScriptTemplate = read("firebase-dashboard/apps-script/dashboard-import-bridge-template.gs");
const liveAdapters = read("firebase-dashboard/apps-script/dashboard-live-source-adapters.gs");
const ingestOptionsMatch = functionsSource.match(/exports\.ingestDashboardSource\s*=\s*onRequest\(\s*\{([\s\S]*?)\}\s*,\s*async/);
const ingestOptions = ingestOptionsMatch ? ingestOptionsMatch[1] : "";

const checks = [
  {
    name: "HTTP import function exported",
    passed: /exports\.ingestDashboardSource\s*=\s*onRequest/.test(functionsSource),
    detail: "Le backend doit exposer une Function HTTP pour les imports Apps Script directs."
  },
  {
    name: "HTTP import function is token-gated",
    passed: /exports\.ingestDashboardSource\s*=\s*onRequest/.test(functionsSource)
      && !/invoker:\s*"public"/.test(ingestOptions)
      && bridgeDoc.includes("endpoint HTTP deployable")
      && bridgeDoc.includes("blocage IAM/Cloud Run invoker")
      && bridgeDoc.includes("X-CFSB-Import-Token")
      && bridgeDoc.includes("DASHBOARD_IMPORT_TOKEN"),
    detail: "L'import direct doit rester protege par le secret applicatif et documenter le blocage IAM invoker actuel."
  },
  {
    name: "private import secret declared",
    passed: /defineSecret\("DASHBOARD_IMPORT_TOKEN"\)/.test(functionsSource)
      && /X-CFSB-Import-Token/.test(functionsSource),
    detail: "L'import direct doit etre protege par un secret serveur, jamais par un token public."
  },
  {
    name: "supported source types",
    passed: [
      "coachrx_clients",
      "client_directory",
      "ghl_contacts",
      "rebooking",
      "checkups",
      "questionnaire_responses"
    ].every((sourceType) => functionsSource.includes(sourceType) && bridgeDoc.includes(sourceType)),
    detail: "Le contrat doit couvrir CoachRx, clients, GHL, rebooking, check-ups et questionnaire."
  },
  {
    name: "live source adapters ready",
    passed: [
      "buildDashboardSourcePayload_",
      "previewCoachRxClientsForDashboard_",
      "pushCoachRxClientsForDashboard_",
      "previewClientDirectoryForDashboard_",
      "pushGhlContactsForDashboard_",
      "previewQuestionnaireResponsesForDashboard_",
      "previewCheckupsForDashboard_",
      "previewRebookingsForDashboard_",
      "normalizeDashboardRows_",
      "CFSB_PILOT_COACHES"
    ].every((needle) => liveAdapters.includes(needle))
      && liveAdapters.includes("previewDashboardImportPayload_")
      && liveAdapters.includes("pushDashboardSourceToFirebase_")
      && bridgeDoc.includes("dashboard-live-source-adapters.gs"),
    detail: "Les scripts vivants doivent avoir des adaptateurs Apps Script pour pousser vers Firebase sans Sheet intermediaire obligatoire."
  },
  {
    name: "source import journal protected",
    passed: /match \/sourceImportRuns\/\{sourceImportRunId\}/.test(rulesSource)
      && /allow read: if isAdmin\(\);/.test(rulesSource)
      && /allow create, update, delete: if false;/.test(rulesSource),
    detail: "Le journal d'import doit etre lisible admin seulement et ecrit par le serveur."
  },
  {
    name: "data model documents sourceImportRuns",
    passed: /## `sourceImportRuns\/\{sourceImportRunId\}`/.test(dataModel)
      && dataModel.includes("direct_cloud_function"),
    detail: "Le modele de donnees doit documenter le journal des imports directs."
  },
  {
    name: "reference docs linked",
    passed: readme.includes("APPS_SCRIPT_FIREBASE_BRIDGE.md")
      && bridgeDoc.includes("https://us-central1-cfsb-dashboard-coach-aa9a4.cloudfunctions.net/ingestDashboardSource"),
    detail: "La documentation principale doit pointer vers le contrat Apps Script -> Firebase."
  },
  {
    name: "Apps Script template keeps import token private",
    passed: appScriptTemplate.includes("DASHBOARD_IMPORT_TOKEN")
      && appScriptTemplate.includes("PropertiesService.getScriptProperties()")
      && appScriptTemplate.includes("X-CFSB-Import-Token"),
    detail: "Le template Apps Script doit garder le token dans Script Properties et l'envoyer seulement en header."
  },
  {
    name: "no obvious secret in bridge doc",
    passed: !/AIza|kemvp|A5u4j9|EV9eGV|YIzLhi|WbmjU|yruoIK|Bearer\s+[A-Za-z0-9._-]{20,}/i.test([bridgeDoc, appScriptTemplate, liveAdapters].join("\n")),
    detail: "La doc du pont et les templates Apps Script ne doivent pas contenir de token GHL, Firebase ou rebooking reel."
  }
];

const failures = checks.filter((check) => !check.passed);
const report = {
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
