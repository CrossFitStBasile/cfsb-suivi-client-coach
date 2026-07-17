const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const templatePath = path.join(root, "firebase-dashboard/apps-script/dashboard-import-bridge-template.gs");
const source = fs.readFileSync(templatePath, "utf8");

const sandbox = {
  console,
  PropertiesService: {
    getScriptProperties() {
      throw new Error("PropertiesService must not be called by previewDashboardImportPayload_.");
    }
  },
  Session: {
    getActiveUser() {
      return {
        getEmail() {
          return "preview@example.com";
        }
      };
    }
  },
  UrlFetchApp: {
    fetch() {
      throw new Error("UrlFetchApp must not be called by previewDashboardImportPayload_.");
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.previewDashboardImportPayload_ = previewDashboardImportPayload_;`, sandbox, {
  filename: templatePath
});

const expectedSourceTypes = [
  "coachrx_clients",
  "client_directory",
  "ghl_contacts",
  "questionnaire_responses",
  "rebooking",
  "checkups"
];

function runPreview(payload) {
  return sandbox.previewDashboardImportPayload_(payload);
}

function fails(payload, needle) {
  try {
    runPreview(payload);
    return false;
  } catch (error) {
    return String(error && error.message).includes(needle);
  }
}

const sourceTypeResults = expectedSourceTypes.map((sourceType) => {
  const result = runPreview({
    sourceType,
    coachRxId: "15935",
    coachName: "Marc-Andre Menard",
    records: [
      {
        Client: "Client Test",
        Phone: "514-555-1234",
        Email: "client@example.com"
      }
    ]
  });

  return result.ok
    && result.mode === "preview_only_no_firebase_write"
    && result.sourceType === sourceType
    && result.coachRxId === "15935"
    && result.recordsReceived === 1
    && Array.isArray(result.sampleKeys)
    && result.sampleKeys.length === 1
    && result.sampleKeys[0].includes("Client");
});

const checks = [
  {
    name: "preview accepts every supported sourceType",
    passed: sourceTypeResults.every(Boolean),
    detail: "Le mode preview doit accepter toutes les sources supportees sans appel Firebase."
  },
  {
    name: "preview rejects unsupported sourceType",
    passed: fails({ sourceType: "unknown", coachRxId: "15935", records: [{ Client: "X" }] }, "sourceType non supporte"),
    detail: "Une source inconnue doit bloquer avant tout appel HTTP."
  },
  {
    name: "preview rejects missing coach identity",
    passed: fails({ sourceType: "coachrx_clients", records: [{ Client: "X" }] }, "Identite coach manquante"),
    detail: "Chaque import doit pouvoir etre rattache a un coach avant ecriture."
  },
  {
    name: "preview rejects empty records",
    passed: fails({ sourceType: "coachrx_clients", coachRxId: "15935", records: [] }, "Aucune ligne"),
    detail: "Un import vide doit etre detecte localement."
  },
  {
    name: "preview accepts rows/data aliases",
    passed: runPreview({ sourceType: "client_directory", coachRxId: "15935", rows: [{ Client: "Rows" }] }).recordsReceived === 1
      && runPreview({ sourceType: "client_directory", coachRxId: "15935", data: [{ Client: "Data" }] }).recordsReceived === 1,
    detail: "Le template doit tolerer records, rows et data comme noms de lot."
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
process.exit(report.ok ? 0 : 1);
