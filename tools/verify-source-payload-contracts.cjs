const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const registry = JSON.parse(read("firebase-dashboard/SOURCE_REGISTRY.json"));
const contractsFile = JSON.parse(read("firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json"));
const samplesFile = JSON.parse(read("firebase-dashboard/SOURCE_PAYLOAD_SAMPLES.json"));
const playbook = read("firebase-dashboard/SOURCE_PAYLOAD_PLAYBOOK.md");
const bridgeDoc = read("firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md");
const ingestionPlan = read("firebase-dashboard/DATA_INGESTION_PLAN.md");
const activationMatrix = read("firebase-dashboard/DATA_SOURCE_ACTIVATION_MATRIX.md");
const appScriptTemplate = read("firebase-dashboard/apps-script/dashboard-import-bridge-template.gs");
const liveAdapters = read("firebase-dashboard/apps-script/dashboard-live-source-adapters.gs");

const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

function functionBlock(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start === -1) return "";
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function appsScriptSyntaxChecks(source) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfsb-gs-check-"));
  const tempFile = path.join(tempDir, "dashboard-live-source-adapters.js");
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

const requiredSourceTypes = [
  "coachrx_clients",
  "client_directory",
  "ghl_contacts",
  "questionnaire_responses",
  "checkups",
  "rebooking"
];

const requiredPilotCoachIds = [
  "15935",
  "15928",
  "17242",
  "15902",
  "15893",
  "15937",
  "15936"
];

const liveAdapterPairs = [
  {
    sourceType: "coachrx_clients",
    preview: "previewCoachRxClientsForDashboard_",
    push: "pushCoachRxClientsForDashboard_"
  },
  {
    sourceType: "client_directory",
    preview: "previewClientDirectoryForDashboard_",
    push: "pushClientDirectoryForDashboard_"
  },
  {
    sourceType: "ghl_contacts",
    preview: "previewGhlContactsForDashboard_",
    push: "pushGhlContactsForDashboard_"
  },
  {
    sourceType: "questionnaire_responses",
    preview: "previewQuestionnaireResponsesForDashboard_",
    push: "pushQuestionnaireResponsesForDashboard_"
  },
  {
    sourceType: "checkups",
    preview: "previewCheckupsForDashboard_",
    push: "pushCheckupsForDashboard_"
  },
  {
    sourceType: "rebooking",
    preview: "previewRebookingsForDashboard_",
    push: "pushRebookingsForDashboard_"
  }
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

const contracts = Array.isArray(contractsFile.contracts) ? contractsFile.contracts : [];
const contractsByType = new Map(contracts.map((contract) => [contract.sourceType, contract]));
const registrySourceTypes = new Set((registry.ingestionContracts || []).map((contract) => contract.sourceType));
const samples = Array.isArray(samplesFile.samples) ? samplesFile.samples : [];
const samplesByType = new Map(samples.map((sample) => [sample.sourceType, sample]));

check(
  "payload contracts cover registry sourceTypes",
  requiredSourceTypes.every((sourceType) => registrySourceTypes.has(sourceType) && contractsByType.has(sourceType))
    && contracts.every((contract) => requiredSourceTypes.includes(contract.sourceType)),
  "Chaque sourceType du registre doit avoir un contrat payload et aucun sourceType inattendu."
);

check(
  "common envelope is explicit",
  includesAll(JSON.stringify(contractsFile.commonEnvelope || {}), [
    "coachId",
    "coachRxId",
    "teamId",
    "coachName",
    "records",
    "rows",
    "data",
    "sourceType"
  ]),
  "Le contrat doit definir l'enveloppe commune et les alias de lignes acceptes."
);

check(
  "every contract has operational sections",
  contracts.every((contract) =>
    contract.sourceType
      && contract.domain
      && contract.priority
      && Array.isArray(contract.targetCollections)
      && contract.targetCollections.length
      && Array.isArray(contract.minimumRecordFields)
      && contract.minimumRecordFields.length
      && Array.isArray(contract.recommendedRecordFields)
      && contract.recommendedRecordFields.length
      && contract.fieldAliases
      && Object.keys(contract.fieldAliases).length
      && contract.mergeExpectation
      && Array.isArray(contract.preflightChecks)
      && contract.preflightChecks.length
      && Array.isArray(contract.activationEvidence)
      && contract.activationEvidence.length
  ),
  "Chaque contrat doit documenter cible, minimum, alias, merge, prevol et preuve d'activation."
);

check(
  "playbook covers all source families",
  requiredSourceTypes.every((sourceType) => playbook.includes(sourceType))
    && includesAll(playbook, [
      "previewDashboardImportPayload_",
      "pushDashboardSourceToFirebase_",
      "SOURCE_PAYLOAD_SAMPLES.json",
      "Source vivante -> preview Apps Script -> Cloud Function securisee -> Firestore -> Dashboard",
      "Checklist avant activation d'une source"
    ]),
  "Le playbook doit permettre de brancher chaque source sans relire le code."
);

check(
  "payload samples cover every sourceType",
  requiredSourceTypes.every((sourceType) => samplesByType.has(sourceType))
    && samples.every((sample) => requiredSourceTypes.includes(sample.sourceType)),
  "Chaque sourceType doit avoir un payload d'exemple non sensible."
);

check(
  "payload samples match contracts and preview envelope",
  samples.every((sample) => {
    const contract = contractsByType.get(sample.sourceType);
    const payload = sample.samplePayload || {};
    const records = Array.isArray(payload.records) ? payload.records : [];
    const targets = Array.isArray(sample.expectedTargetCollections) ? sample.expectedTargetCollections : [];
    return contract
      && sample.previewOnly === true
      && payload.sourceType === sample.sourceType
      && records.length >= 1
      && targets.length >= 1
      && targets.every((target) => contract.targetCollections.includes(target))
      && Array.isArray(sample.expectedPreviewSignals)
      && sample.expectedPreviewSignals.length >= 3
      && Array.isArray(sample.mustNotDo)
      && sample.mustNotDo.length >= 2;
  }),
  "Les exemples doivent etre comparables au contrat et utilisables en preview sans write."
);

check(
  "payload samples are fictional and safe",
  JSON.stringify(samplesFile).includes("All records are fictional")
    && JSON.stringify(samplesFile).includes("previewDashboardImportPayload_")
    && JSON.stringify(samplesFile).includes("Do not add Apps Script URLs")
    && JSON.stringify(samplesFile).includes("example.test")
    && samples.every((sample) => JSON.stringify(sample).includes("555")),
  "Les exemples doivent etre explicitement fictifs, non sensibles et reserves au preview."
);

check(
  "source docs reference payload contracts",
  includesAll(bridgeDoc, [
    "previewDashboardImportPayload_",
    "preview_only_no_firebase_write"
  ])
    && ingestionPlan.includes("SOURCE_PAYLOAD_CONTRACTS.json")
    && activationMatrix.includes("previewDashboardImportPayload_")
    && playbook.includes("dashboard-live-source-adapters.gs"),
  "Le pont Apps Script, le plan d'ingestion et la matrice doivent pointer vers le contrat payload."
);

check(
  "Apps Script template supports contract preflight",
  appScriptTemplate.includes("validateDashboardImportPayload_")
    && appScriptTemplate.includes("previewDashboardImportPayload_")
    && appScriptTemplate.includes("preview_only_no_firebase_write")
    && requiredSourceTypes.every((sourceType) => appScriptTemplate.includes(`'${sourceType}'`)),
  "Le template Apps Script doit valider localement les sourceType avant ecriture."
);

check(
  "Apps Script live adapters cover direct source pushes",
  liveAdapters.includes("buildDashboardSourcePayload_")
    && liveAdapters.includes("normalizeDashboardRows_")
    && liveAdapters.includes("previewDashboardImportPayload_")
    && liveAdapters.includes("pushDashboardSourceToFirebase_")
    && requiredSourceTypes.every((sourceType) => liveAdapters.includes(`'${sourceType}'`))
    && [
      "previewCoachRxClientsForDashboard_",
      "previewClientDirectoryForDashboard_",
      "previewGhlContactsForDashboard_",
      "previewQuestionnaireResponsesForDashboard_",
      "previewCheckupsForDashboard_",
      "previewRebookingsForDashboard_"
    ].every((needle) => liveAdapters.includes(needle)),
  "Les adaptateurs Apps Script doivent permettre un preview/push direct de chaque source vivante vers Firebase."
);

check(
  "Apps Script live adapters syntax checks",
  appsScriptSyntaxChecks(liveAdapters),
  "Les adaptateurs a coller dans Apps Script doivent rester syntaxiquement valides."
);

check(
  "Apps Script live adapters know all pilot coaches",
  requiredPilotCoachIds.every((coachId) => liveAdapters.includes(`'${coachId}'`))
    && includesAll(liveAdapters, [
      "Marc-Andre Menard",
      "Iheb Yahyaoui",
      "Camille Proulx",
      "David Olivier",
      "Gabriel Mayer Bedard",
      "Hugo Lelievre",
      "Raphael Samson"
    ]),
  "Les adaptateurs doivent pouvoir resoudre les sept coachs pilotes sans table externe."
);

check(
  "Apps Script live adapters enforce preview before push",
  liveAdapterPairs.every((pair) => {
    const previewBlock = functionBlock(liveAdapters, pair.preview);
    const pushBlock = functionBlock(liveAdapters, pair.push);
    const previewPosition = pushBlock.indexOf("previewDashboardImportPayload_(payload)");
    const pushPosition = pushBlock.indexOf("pushDashboardSourceToFirebase_(payload)");
    return liveAdapters.includes(`'${pair.sourceType}'`)
      && previewBlock.includes("previewDashboardImportPayload_")
      && pushBlock.includes(`'${pair.sourceType}'`)
      && previewPosition !== -1
      && pushPosition !== -1
      && previewPosition < pushPosition;
  }),
  "Chaque push de source vivante doit construire un payload, le previsualiser, puis seulement ensuite appeler Firebase."
);

check(
  "Apps Script live adapters normalize key identity fields",
  includesAll(liveAdapters, [
    "phoneNormalized",
    "normalizeDashboardPhone_",
    "replace(/\\D/g, '')",
    "sourceClientId",
    "client_phone_normalized",
    "triageStatus",
    "appointmentAt",
    "checkupAt"
  ]),
  "Les adaptateurs doivent normaliser les champs qui servent au matching client, questionnaire, rebooking et check-up."
);

check(
  "manual client fields are protected",
  contractsByType.get("coachrx_clients")?.mergeExpectation.includes("Ne jamais ecraser les champs manuels")
    && contractsByType.get("client_directory")?.mergeExpectation.includes("fin membership")
    && contractsByType.get("client_directory")?.mergeExpectation.includes("recurrence Kilo")
    && playbook.includes("La fin membership et la recurrence Kilo restent manuelles"),
  "Les imports CoachRx/CSM ne doivent pas recalculer les champs manuels du coach."
);

check(
  "GHL remains server side and non destructive",
  contractsByType.get("ghl_contacts")?.mergeExpectation.includes("GHL ne peut jamais supprimer")
    && playbook.includes("GHL ne doit jamais etre appele depuis le navigateur")
    && playbook.includes("GHL enrichit seulement"),
  "GHL doit rester un enrichissement serveur, jamais une source destructive."
);

check(
  "questionnaire matching is phone-first and action-safe",
  contractsByType.get("questionnaire_responses")?.minimumRecordFields.some((field) => field.includes("phone"))
    && contractsByType.get("questionnaire_responses")?.preflightChecks.some((field) => field.includes("aucune fausse To-do"))
    && playbook.includes("Le contenu de la reponse reste immutable")
    && playbook.includes("creer une mission"),
  "Le questionnaire doit alimenter l'inbox sans creer de fausses taches."
);

check(
  "rebooking legacy migration is guarded",
  contractsByType.get("rebooking")?.mergeExpectation.includes("L'app legacy reste le filet")
    && contractsByType.get("rebooking")?.preflightChecks.some((field) => field.includes("comparaison avec app legacy"))
    && playbook.includes("sans casser l'app Apps Script actuelle")
    && playbook.includes("aucune URL Apps Script tokenisee"),
  "La migration rebooking doit proteger l'app actuelle et ses statuts."
);

const publicText = [
  JSON.stringify(registry),
  JSON.stringify(contractsFile),
  JSON.stringify(samplesFile),
  playbook,
  bridgeDoc,
  ingestionPlan,
  activationMatrix,
  appScriptTemplate,
  liveAdapters
].join("\n");

check(
  "no public tokenized URL or known secret fragments",
  publicForbidden.every((needle) => !publicText.includes(needle) && !appScriptTemplate.includes(needle)),
  "Les contrats, docs et templates publics ne doivent pas contenir de liens tokenises ou secrets."
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
