const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const registry = JSON.parse(read("firebase-dashboard/SOURCE_REGISTRY.json"));
const plan = read("firebase-dashboard/DATA_INGESTION_PLAN.md");
const bridge = read("firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md");
const functionsSource = read("functions/index.js");
const appScriptTemplate = read("firebase-dashboard/apps-script/dashboard-import-bridge-template.gs");

const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

const requiredContracts = [
  "coachrx_clients_direct",
  "client_directory_direct",
  "ghl_contacts_phone_enrichment",
  "questionnaire_responses_direct",
  "rebooking_direct",
  "csm_checkups_direct"
];

const requiredSourceTypes = [
  "coachrx_clients",
  "client_directory",
  "ghl_contacts",
  "questionnaire_responses",
  "rebooking",
  "checkups"
];

const publicForbidden = [
  "script.google.com/macros/s/",
  "token=",
  "kemvp",
  "A5u4j9",
  "YIzLhi",
  "WbmjU",
  "yruoIK",
  "AIza"
];

const contracts = Array.isArray(registry.ingestionContracts) ? registry.ingestionContracts : [];

check(
  "registry has required ingestion contracts",
  requiredContracts.every((id) => contracts.some((contract) => contract.id === id)),
  "Chaque source vivante doit avoir un contrat d'ingestion unique dans SOURCE_REGISTRY.json."
);

check(
  "contracts use supported source types",
  requiredSourceTypes.every((sourceType) => contracts.some((contract) => contract.sourceType === sourceType))
    && contracts.every((contract) => requiredSourceTypes.includes(contract.sourceType)),
  "Les sourceType du registre doivent correspondre aux familles supportees par le backend."
);

check(
  "contracts include operational fields",
  contracts.every((contract) =>
    contract.id
      && contract.sourceType
      && contract.sourceSystem
      && contract.sourceAutomation
      && Array.isArray(contract.targetCollections)
      && contract.targetCollections.length
      && Array.isArray(contract.requiredCoachFields)
      && contract.requiredCoachFields.length
      && Array.isArray(contract.requiredRecordFields)
      && contract.requiredRecordFields.length
      && Array.isArray(contract.matchingPriority)
      && contract.matchingPriority.length
      && contract.pathPolicy
      && contract.pathPolicy.preferredPath
      && contract.pathPolicy.sheetRole
      && contract.pathPolicy.firstPilot
      && contract.pathPolicy.activationGate
      && contract.pathPolicy.doNotDo
      && contract.mergeRule
      && contract.writePath
      && contract.activationState
      && contract.rollback
  ),
  "Chaque contrat doit documenter source, cible, matching, merge, activation et rollback."
);

check(
  "contracts define explicit source path policy",
  contracts.every((contract) => {
    const policy = contract.pathPolicy || {};
    return /direct|legacy|server|sheet/i.test(policy.preferredPath || "")
      && /backup|audit|legacy|none|source/i.test(policy.sheetRole || "")
      && /pilot|Marc|Michael|coach|row|Responses/i.test(policy.firstPilot || "")
      && policy.activationGate.length >= 20
      && /Do not/i.test(policy.doNotDo || "");
  })
    && contracts.some((contract) => contract.pathPolicy.sheetRole === "backup_audit_only")
    && contracts.some((contract) => contract.pathPolicy.sheetRole === "none_for_private_ghl_payloads")
    && contracts.some((contract) => contract.pathPolicy.preferredPath === "legacy_parallel_then_firestore_parity"),
  "Chaque source doit dire clairement si elle passe direct a Firestore, si le Sheet est seulement backup/audit, ou si le legacy reste temporairement la source."
);

check(
  "ingestion plan covers every contract",
  requiredContracts.every((id) => plan.includes(id))
    && requiredSourceTypes.every((sourceType) => plan.includes(`sourceType=${sourceType}`) || plan.includes(`\`${sourceType}\``))
    && includesAll(plan, ["Politique de chemin par source", "Sheet seulement backup/audit", "Aucun Sheet pour payload prive GHL", "Parite legacy avant migration rebooking"]),
  "DATA_INGESTION_PLAN.md doit expliquer chaque contrat et chaque sourceType."
);

check(
  "backend supports every source type",
  requiredSourceTypes.every((sourceType) => functionsSource.includes(`"${sourceType}"`))
    && functionsSource.includes("exports.ingestDashboardSource")
    && functionsSource.includes("sourceImportRuns")
    && functionsSource.includes("coachSyncStatus"),
  "functions/index.js doit accepter les sources decrites et journaliser chaque import."
);

check(
  "bridge doc matches ingestion plan",
  requiredSourceTypes.every((sourceType) => bridge.includes(sourceType))
    && bridge.includes("ingestDashboardSource")
    && bridge.includes("Script Properties")
    && bridge.includes("DASHBOARD_IMPORT_TOKEN")
    && bridge.includes("n'est pas un endpoint HTTP public")
    && bridge.includes("principal autorise"),
  "APPS_SCRIPT_FIREBASE_BRIDGE.md doit rester compatible avec le plan d'ingestion."
);

check(
  "Apps Script bridge template matches source contracts",
  appScriptTemplate.includes("pushDashboardSourceToFirebase_")
    && appScriptTemplate.includes("validateDashboardImportPayload_")
    && appScriptTemplate.includes("previewDashboardImportPayload_")
    && appScriptTemplate.includes("preview_only_no_firebase_write")
    && appScriptTemplate.includes("DASHBOARD_IMPORT_TOKEN")
    && appScriptTemplate.includes("CFSB_DASHBOARD_IMPORT_AUTH_MODE")
    && appScriptTemplate.includes("Transport Firebase non authentifie")
    && appScriptTemplate.includes("CFSB_DASHBOARD_IMPORT_ENDPOINT")
    && requiredSourceTypes.every((sourceType) => appScriptTemplate.includes(`'${sourceType}'`)),
  "Le template Apps Script doit pouvoir valider chaque sourceType et refuser un push sans transport authentifie."
);

check(
  "GHL is server side and non destructive",
  plan.includes("GHL est probablement la source la plus fiable")
    && plan.includes("cote serveur")
    && plan.includes("GHL ne peut jamais supprimer")
    && contracts.some((contract) =>
      contract.id === "ghl_contacts_phone_enrichment"
        && /enrichissement partiel/i.test(contract.mergeRule)
        && /jamais supprimer/i.test(contract.mergeRule)
    ),
  "GHL doit enrichir les telephones sans pouvoir perimer ou supprimer les clients."
);

check(
  "rebooking legacy is protected",
  plan.includes("Le rebooking est utile, mais il ne doit pas casser l'app Apps Script legacy")
    && plan.includes("AUTO-003")
    && contracts.some((contract) =>
      contract.id === "rebooking_direct"
        && /Ne pas casser/i.test(contract.mergeRule)
        && /app rebooking actuelle/i.test(contract.rollback)
    ),
  "La migration rebooking doit garder l'app actuelle comme filet de securite."
);

check(
  "manual client fields are protected",
  includesAll(plan, [
    "la fin de membership reste manuelle",
    "la recurrence prevue dans Kilo reste manuelle",
    "une valeur vide ne remplace jamais une valeur utile",
    "les champs manuels coach restent proteges"
  ]),
  "Les imports ne doivent pas ecraser les champs manuels de la fiche client."
);

const publicText = [JSON.stringify(registry), plan, bridge].join("\n");
check(
  "no public secret or tokenized URL",
  publicForbidden.every((needle) => !publicText.includes(needle) && !appScriptTemplate.includes(needle)),
  "Le registre et les docs publiques ne doivent pas contenir de token, URL rebooking tokenisee ou cle privee."
);

check(
  "activation states separate ready from blocked",
  contracts.some((contract) => contract.activationState.includes("waiting_for_auth_transport"))
    && contracts.some((contract) => contract.activationState.includes("needs_secure_server_bridge"))
    && contracts.some((contract) => contract.activationState.includes("needs_legacy_source_audit")),
  "Le plan doit distinguer ce qui est pret localement, ce qui attend un transport authentifie et ce qui exige un audit source."
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
