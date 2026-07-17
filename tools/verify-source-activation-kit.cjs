const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const kit = read("firebase-dashboard/SOURCE_ACTIVATION_KIT.md");
const validation = read("verify-dashboard-before-deploy.cmd");
const workQueue = read("firebase-dashboard/NEXT_WORK_QUEUE.md");
const finalizationBoard = read("firebase-dashboard/FINALIZATION_BOARD.md");
const releaseStatus = read("firebase-dashboard/PILOT_RELEASE_STATUS.md");
const deployRunbook = read("firebase-dashboard/DEPLOY_RUNBOOK.md");
const handoff = read("firebase-dashboard/PILOT_HANDOFF.md");
const weekendLog = read("firebase-dashboard/WEEKEND_WORK_LOG.md");

const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

const sourceTypes = [
  "coachrx_clients",
  "client_directory",
  "ghl_contacts",
  "questionnaire_responses",
  "checkups",
  "rebooking"
];

const references = [
  "SOURCE_REGISTRY.json",
    "SOURCE_PAYLOAD_CONTRACTS.json",
    "SOURCE_PAYLOAD_SAMPLES.json",
    "SOURCE_ACTIVATION_STATUS.json",
    "SOURCE_PAYLOAD_PLAYBOOK.md",
  "DATA_INGESTION_PLAN.md",
  "DATA_SOURCE_ACTIVATION_MATRIX.md",
  "APPS_SCRIPT_FIREBASE_BRIDGE.md",
  "dashboard-import-bridge-template.gs",
  "functions/index.js"
];

const standardPlanSections = [
  "## 1. Context",
  "## 2. Objective",
  "## 3. Source of Truth",
  "## 4. Current State",
  "## 5. Decisions Made",
  "## 6. Phased Plan",
  "## 7. Deliverables",
  "## 8. Owners",
  "## 9. Risks and Unknowns",
  "## 10. Next Actions",
  "## 11. Follow-up Log"
];

const forbiddenPublicFragments = [
  "script.google.com/macros/s/",
  "token=",
  "kemvp",
  "A5u4j9",
  "YIzLhi",
  "WbmjU",
  "yruoIK",
  "AIza"
];

check(
  "activation kit uses CFSB plan shape",
  includesAll(kit, standardPlanSections),
  "Le kit doit suivre la structure CFSB standard pour rester utilisable en handoff."
);

check(
  "activation kit references authoritative docs",
  includesAll(kit, references),
  "Le kit doit pointer vers les contrats, le registre, le playbook, le pont Apps Script et le backend."
);

check(
  "activation kit covers all direct sourceTypes",
  sourceTypes.every((sourceType) => kit.includes(sourceType)),
  "Chaque sourceType direct doit avoir une carte d'activation."
);

check(
  "activation kit defines safe preview/write flow",
  includesAll(kit, [
    "previewDashboardImportPayload_",
    "pushDashboardSourceToFirebase_",
    "DASHBOARD_IMPORT_TOKEN",
    "Script Properties",
    "sourceImportRuns",
    "coachSyncStatus",
    "rollback"
  ]),
  "Le kit doit expliquer preview, write, secret, preuves Firestore et retour arriere."
);

check(
  "activation kit protects manual client fields",
  includesAll(kit, [
    "fin membership",
    "recurrence Kilo",
    "risque coach",
    "notes et objectifs",
    "Une valeur vide ne remplace jamais une valeur utile"
  ]),
  "Les imports ne doivent pas ecraser les decisions coach/admin."
);

check(
  "activation kit keeps GHL private and non destructive",
  includesAll(kit, [
    "GHL ne doit jamais etre appele depuis le navigateur",
    "GHL enrichit seulement",
    "match exact du telephone normalise",
    "token GHL dans secret serveur"
  ]),
  "GHL doit rester server-side, phone-first et non destructif."
);

check(
  "activation kit makes questionnaire actionable without false tasks",
  includesAll(kit, [
    "lire par cle de champ",
    "contenu de reponse immutable",
    "aucune fausse To-do",
    "relance seulement apres 7 jours",
    "Creer une mission"
  ]),
  "Le questionnaire doit alimenter l'inbox sans bruit ni fausses relances."
);

check(
  "activation kit protects rebooking legacy",
  includesAll(kit, [
    "app legacy",
    "comparer les compteurs",
    "ne redevient pas ouvert par reimport",
    "Reouvrir",
    "ne pas publier les URLs Apps Script tokenisees"
  ]),
  "Rebooking doit rester compare et reversible avant remplacement."
);

check(
  "activation kit avoids unnecessary Google Sheet dependency for CoachRx",
  includesAll(kit, [
    "sans forcer un Google Sheet",
    "Google Sheets reste un backup",
    "Source vivante -> preview source privee -> Cloud Function securisee -> Firestore -> Dashboard"
  ]),
  "CoachRx direct doit pouvoir pousser vers Firestore sans Sheet intermediaire obligatoire."
);

check(
  "activation kit includes Bob Operator handoff",
  includesAll(kit, [
    "Bob Operator",
    "approbation explicite",
    "script source prive",
    "Secrets interdits",
    "Bob Operator handoff packets"
  ]),
  "Le kit doit dire comment Bob peut aider sans action live non approuvee."
);

check(
  "activation kit defines source handoff packets",
  includesAll(kit, [
    "coachrx_live_bridge",
    "client_directory_phone_bridge",
    "ghl_private_enrichment",
    "questionnaire_v2_inbox_bridge",
    "checkups_csm_bridge",
    "rebooking_legacy_parity_bridge",
    "sourceImportRuns attendu ou observe",
    "coachSyncStatus attendu ou observe"
  ]),
  "Le kit doit donner un paquet de travail verifiable pour chaque source live."
);

check(
  "activation handoff avoids mandatory sheets and limits first writes",
  includesAll(kit, [
    "ne doit pas ajouter de Google Sheet obligatoire",
    "write limite a un seul coach pilote",
    "1 a 3 clients",
    "App legacy reste source active"
  ]),
  "Le handoff doit eviter le detour Sheet inutile, limiter les premiers writes et proteger rebooking."
);

check(
  "validation pipeline includes activation kit verifier",
  validation.includes("verify-source-activation-kit.cjs")
    && /\d+\/\d+/.test(validation),
  "Le pipeline local doit verifier ce kit."
);

const currentDocs = [workQueue, finalizationBoard, releaseStatus, deployRunbook, handoff, weekendLog].join("\n");
check(
  "current docs mention activation kit and validation pipeline",
  currentDocs.includes("SOURCE_ACTIVATION_KIT.md")
    && /2[1-9]\/2[1-9]/.test(currentDocs),
  "Les documents de reprise doivent refletent la validation courante et le kit."
);

check(
  "activation kit has no tokenized URLs or known secret fragments",
  forbiddenPublicFragments.every((needle) => !kit.includes(needle)),
  "Le kit ne doit pas exposer de lien Apps Script tokenise ou secret connu."
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
