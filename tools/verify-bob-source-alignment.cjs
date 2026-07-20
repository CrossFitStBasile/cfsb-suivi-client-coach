const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bobRegistryPath = process.env.BOB_AUTOMATION_REGISTRY
  || "C:\\Users\\micha\\Documents\\Codex\\Bob Operator\\automation-registry.csv";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }

  if (value.length || row.length) {
    row.push(value);
    if (row.some((cell) => cell.length)) rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])));
}

function normalizeLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function readOptional(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function normalizeBobRow(row = {}) {
  let linkedSources = "";
  if (row.fiche) {
    const recordPath = path.resolve(path.dirname(bobRegistryPath), row.fiche);
    const historyPath = path.join(path.dirname(path.dirname(recordPath)), "history", `${row.id}.md`);
    linkedSources = `${readOptional(recordPath)}\n${readOptional(historyPath)}`;
  }

  return {
    name: row.nom || row.nom_canonique || "",
    destination: row.destination || linkedSources,
    scriptSource: row.script_source || row.projets_principaux || linkedSources,
    status: row.statut || ""
  };
}

const checks = [];
function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

if (!fs.existsSync(bobRegistryPath)) {
  check(
    "bob registry available",
    true,
    `Registre Bob introuvable, verification optionnelle ignoree: ${bobRegistryPath}`
  );
} else {
  const bobRows = parseCsv(fs.readFileSync(bobRegistryPath, "utf8"));
  const byId = Object.fromEntries(bobRows.map((row) => [row.id, row]));
  const sourceRegistry = read("firebase-dashboard/SOURCE_REGISTRY.json");
  const sourceAudit = read("firebase-dashboard/SOURCE_OF_TRUTH_AUDIT.md");
  const dataArchitecture = read("firebase-dashboard/DATA_SYNC_ARCHITECTURE.md");
  const migrationReadiness = read("firebase-dashboard/MIGRATION_READINESS.md");
  const bobHandoff = read("firebase-dashboard/BOB_OPERATOR_SOURCE_HANDOFF.md");

  const expected = [
    {
      id: "AUTO-002",
      nameFragment: "Systeme CSM",
      sheetId: "1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw",
      scriptId: "1upjaGrsWIxwsVz_Ht--CjNNeo3zC4uSlAfdRgMCdevwog1FV7Q-_MbIL",
      dashboardSourceTypes: ["client_directory", "checkups"]
    },
    {
      id: "AUTO-003",
      nameFragment: "Suivi semi-prive",
      sheetId: "1s7shtrkL0gs1DO0LbzkbabZteidGnYLhVou6KliHXVU",
      scriptId: "1OsXzGrmJacMYHMIEcTM3dTK-UvaA01bDf0F90HkFNt29XYgK2iHkyBlE",
      dashboardSourceTypes: ["rebooking"]
    },
    {
      id: "AUTO-004",
      nameFragment: "Dashboard coach",
      sheetId: "18-S_a5L6fXYZXtcgHBlCKpcygmnr5Ekj_WM5358KZ7E",
      scriptId: "1SeGMN1w7iqn_7ETcmg5qwY6wIys4GZy5GbJHWasg6bToThcxrucYfOLk",
      dashboardSourceTypes: ["coachrx_clients", "client_directory"]
    },
    {
      id: "AUTO-009",
      nameFragment: "Questionnaire client-coach",
      sheetId: "11QO5GOQGHCpT8_nLEgKHqjFFsZ4emPwZEt2Vlu3WRJo",
      scriptId: "1RzTyLvUdw6NdVI2vsDoi7a2bjWGAZDXml94QYG4TCs9wF5KJdKm3HFBa",
      dashboardSourceTypes: ["questionnaire_responses"]
    }
  ];
  const normalizedById = Object.fromEntries(
    expected.map((item) => [item.id, normalizeBobRow(byId[item.id])])
  );

  check(
    "bob registry contains dashboard automations",
    expected.every((item) => byId[item.id]
      && normalizeLabel(normalizedById[item.id].name).includes(normalizeLabel(item.nameFragment))),
    "Bob doit confirmer les automations qui alimentent ou entourent le dashboard."
  );

  check(
    "dashboard docs preserve bob script and sheet ids",
    expected.every((item) => {
      const row = normalizedById[item.id];
      const combined = `${sourceRegistry}\n${sourceAudit}\n${dataArchitecture}\n${migrationReadiness}`;
      return combined.includes(item.id)
        && combined.includes(item.sheetId)
        && combined.includes(item.scriptId)
        && row.destination.includes(item.sheetId)
        && row.scriptSource.includes(item.scriptId);
    }),
    "Les docs Dashboard doivent citer les memes Sheets et scripts que le registre Bob."
  );

  check(
    "dashboard source types align with bob automations",
    expected.every((item) => item.dashboardSourceTypes.every((sourceType) => sourceRegistry.includes(sourceType))),
    "Chaque automation Bob utile doit avoir un sourceType Dashboard explicite."
  );

  check(
    "bob handoff names live source packages",
    expected.every((item) => {
      const combined = `${bobHandoff}`;
      return combined.includes(item.id)
        && combined.includes(item.sheetId)
        && combined.includes(item.scriptId)
        && item.dashboardSourceTypes.every((sourceType) => combined.includes(sourceType));
    })
      && bobHandoff.includes("DASHBOARD_IMPORT_TOKEN")
      && bobHandoff.includes("previewDashboardImportPayload_")
      && bobHandoff.includes("pushDashboardSourceToFirebase_"),
    "Le handoff Bob doit citer les automations et scripts utiles sans demander de relire tout le registre."
  );

  check(
    "bob states rebooking legacy remains active",
    ["Actif", "PROD"].includes(normalizedById["AUTO-003"].status)
      && sourceAudit.includes("Ne pas casser l'app actuelle")
      && migrationReadiness.includes("Rebooking legacy reste actif"),
    "Le rebooking Apps Script actif doit rester le filet de securite pendant la migration."
  );

  check(
    "bob optional verifier avoids sensitive files",
    !sourceRegistry.includes("token.json")
      && !sourceAudit.includes("oauth-client.json")
      && !dataArchitecture.includes("oauth-client.json"),
    "La verification Bob ne doit pas pousser de secret dans les docs Dashboard."
  );
}

const failures = checks.filter((item) => !item.passed);
const result = {
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  bobRegistryPath,
  failures,
  checks
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
