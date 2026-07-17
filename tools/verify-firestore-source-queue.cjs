const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const functionsSource = read("functions/index.js");
const queueScript = read("firebase-dashboard/apps-script/dashboard-firestore-sync-request-queue.gs");
const bridgeDoc = read("firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md");
const ingestionPlan = read("firebase-dashboard/DATA_INGESTION_PLAN.md");
const architecture = read("firebase-dashboard/DATA_SYNC_ARCHITECTURE.md");

const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

function syntaxCheckAppsScript(source) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfsb-gs-queue-"));
  const tempFile = path.join(tempDir, "queue.js");
  try {
    fs.writeFileSync(tempFile, source, "utf8");
    childProcess.execFileSync(process.execPath, ["--check", tempFile], {
      cwd: root,
      stdio: "pipe"
    });
    return true;
  } catch (error) {
    return false;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

check(
  "backend routes source_import syncRequests",
  includesAll(functionsSource, [
    "normalizeSyncRequestType",
    "source_import",
    "processQueuedSourceImportRequest",
    "processDirectImport",
    "firestore_sync_request"
  ]),
  "processSyncRequest doit pouvoir traiter une demande source_import deposee dans syncRequests."
);

check(
  "queued import creates source import journal",
  includesAll(functionsSource, [
    "sourceImportRuns",
    "syncRequestId",
    "safeImportSample",
    "summarizeDirectImportResult",
    "writeDirectCoachSyncStatus"
  ]),
  "Un import via queue doit produire les memes preuves qu'un import direct: run, sample, status coach."
);

check(
  "Apps Script queue writes only syncRequests",
  includesAll(queueScript, [
    "queueDashboardSourceImport_",
    "previewDashboardFirestoreQueue_",
    "ScriptApp.getOAuthToken",
    "syncRequests",
    "requestType: 'source_import'",
    "firestorePatchDocument_",
    "CFSB_FIRESTORE_PROJECT_ID"
  ]),
  "Le script Apps Script doit deposer une demande privee dans syncRequests avec OAuth Google."
);

check(
  "Apps Script queue avoids import token and public endpoint",
  !queueScript.includes("DASHBOARD_IMPORT_TOKEN")
    && !queueScript.includes("X-CFSB-Import-Token")
    && !queueScript.includes("cloudfunctions.net/ingestDashboardSource")
    && !queueScript.includes("script.google.com/macros/s/")
    && !/token=|AIza|Bearer\s+[A-Za-z0-9._-]{20,}/i.test(queueScript),
  "Le nouveau transport ne doit pas exposer de token ni appeler l'endpoint HTTP secondaire."
);

check(
  "Apps Script queue syntax is valid JS",
  syntaxCheckAppsScript(queueScript),
  "Le fichier .gs doit rester syntaxiquement valide pour Apps Script."
);

check(
  "docs describe private queue path",
  [bridgeDoc, ingestionPlan, architecture].every((doc) => includesAll(doc, [
    "syncRequests",
    "processSyncRequest",
    "dashboard-firestore-sync-request-queue.gs"
  ])),
  "Les docs principales doivent decrire le chemin Apps Script prive -> syncRequests -> Function."
);

const failures = checks.filter((item) => !item.passed);
const report = {
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
