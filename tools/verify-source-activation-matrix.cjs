const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));

const registry = json("firebase-dashboard/SOURCE_REGISTRY.json");
const matrix = read("firebase-dashboard/DATA_SOURCE_ACTIVATION_MATRIX.md");
const ingestionPlan = read("firebase-dashboard/DATA_INGESTION_PLAN.md");
const bridgeDoc = read("firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md");
const template = read("firebase-dashboard/apps-script/dashboard-import-bridge-template.gs");
const functionsSource = read("functions/index.js");

const expectedTypes = [
  "coachrx_clients",
  "client_directory",
  "ghl_contacts",
  "questionnaire_responses",
  "rebooking",
  "checkups"
];

const forbiddenPublicSecrets = [
  "script.google.com/macros/s/",
  "token=",
  "AIza",
  "kemvp",
  "A5u4j9",
  "YIzLhi",
  "WbmjU",
  "yruoIK"
];

const contractTypes = new Set((registry.ingestionContracts || []).map((contract) => contract.sourceType));

const checks = [
  {
    name: "matrix file declares source principle",
    passed: matrix.includes("Source vivante -> Cloud Function securisee -> Firestore -> Dashboard"),
    detail: "La matrice doit rappeler que Sheets n'est pas un passage obligatoire."
  },
  {
    name: "matrix covers every sourceType",
    passed: expectedTypes.every((sourceType) =>
      contractTypes.has(sourceType)
      && matrix.includes(`\`${sourceType}\``)
      && ingestionPlan.includes(`\`${sourceType}\``)
      && bridgeDoc.includes(`\`${sourceType}\``)
      && template.includes(`'${sourceType}'`)
      && functionsSource.includes(`"${sourceType}"`)
    ),
    detail: "Chaque sourceType attendu doit exister dans le registre, le plan, la doc, le template et le backend."
  },
  {
    name: "matrix names required operational statuses",
    passed: ["pret_backend", "attend_transport_auth", "attend_source", "audit_avant_writeback", "actif_filet"]
      .every((status) => matrix.includes(`\`${status}\``)),
    detail: "La matrice doit distinguer pret, bloque, source a confirmer et filet de securite."
  },
  {
    name: "activation order protects rebooking legacy",
    passed: matrix.indexOf("Activer CoachRx direct") >= 0
      && matrix.indexOf("Reporter le rebooking direct") > matrix.indexOf("Activer CoachRx direct")
      && matrix.includes("Continuer l'app rebooking actuelle"),
    detail: "CoachRx doit passer avant le rebooking direct, et l'app legacy doit rester protegee."
  },
  {
    name: "manual fields protected",
    passed: matrix.includes("fin de membership")
      && matrix.includes("recurrence Kilo")
      && matrix.includes("restent manuelles"),
    detail: "La matrice doit proteger les champs manuels client contre les imports."
  },
  {
    name: "GHL remains non destructive and server side",
    passed: matrix.includes("GHL ne peut jamais supprimer")
      && matrix.includes("GHL seulement cote serveur")
      && matrix.includes("aucun appel GHL dans le navigateur"),
    detail: "GHL doit rester un enrichissement serveur et ne jamais perimer les clients."
  },
  {
    name: "matrix defines evidence of done",
    passed: [
      "sourceImportRuns",
      "coachSyncStatus",
      "previewDashboardImportPayload_",
      "validation locale passe",
      "coach reel"
    ].every((needle) => matrix.includes(needle)),
    detail: "La matrice doit exiger des preuves observables avant de declarer une source branchee."
  },
  {
    name: "no tokenized or secret URL in matrix",
    passed: forbiddenPublicSecrets.every((needle) => !matrix.includes(needle)),
    detail: "La matrice ne doit pas contenir de token, cle API ou URL Apps Script tokenisee."
  }
];

const failures = checks.filter((check) => !check.passed);
const result = {
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
