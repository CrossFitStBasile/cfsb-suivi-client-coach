const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

const readiness = read("firebase-dashboard/MIGRATION_READINESS.md");
const status = readJson("firebase-dashboard/SOURCE_ACTIVATION_STATUS.json");
const registry = readJson("firebase-dashboard/SOURCE_REGISTRY.json");
const workQueue = read("firebase-dashboard/NEXT_WORK_QUEUE.md");
const releaseStatus = read("firebase-dashboard/PILOT_RELEASE_STATUS.md");
const validation = read("verify-dashboard-before-deploy.cmd");

const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

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

const sourceTypes = [
  "coachrx_clients",
  "client_directory",
  "ghl_contacts",
  "questionnaire_responses",
  "checkups",
  "rebooking"
];
const expectedLiveVersion = "20260707-coachrx-extraction-guard";
const previousLiveVersion = "20260612-rebooking-quiet-cards";
const previousHistoricVersion = "20260611-client-source-admin";

const forbiddenPublicFragments = [
  "script.google.com/macros/s/",
  "token=",
  "kemvp",
  "A5u4j9",
  "YIzLhi",
  "WbmjU",
  "yruoIK",
  "AIza",
  "Bearer "
];

const statusTypes = new Set((status.sources || []).map((source) => source.sourceType));
const registryTypes = new Set((registry.ingestionContracts || []).map((contract) => contract.sourceType));

check(
  "readiness uses CFSB plan shape",
  includesAll(readiness, standardPlanSections),
  "Le document doit rester structurable en handoff CFSB."
);

check(
  "readiness states target architecture",
  includesAll(readiness, [
    "Source vivante privee -> Cloud Function securisee -> Firestore -> Dashboard coach",
    "Firestore est la base operationnelle",
    "Sheets restent backup/audit/source temporaire",
    "GHL reste server-side seulement",
    "CoachRx peut alimenter Firestore directement",
    "Les telephones sont la cle de matching"
  ]),
  "Le document doit clarifier pourquoi Firebase existe et quand Sheets restent utiles."
);

check(
  "readiness maps operational domains",
  [
    "Acces coach",
    "Clients",
    "Telephone client",
    "To-do",
    "Questionnaires",
    "Rebooking",
    "Check-ups",
    "Performance impacts",
    "Alumni"
  ].every((domain) => readiness.includes(domain)),
  "Tous les domaines produit doivent avoir une source de verite lisible."
);

check(
  "readiness records published and previous live versions",
  readiness.includes(expectedLiveVersion)
    && readiness.includes(previousLiveVersion)
    && readiness.includes(previousHistoricVersion)
    && readiness.includes("verify-dashboard-live-stable.cmd")
    && readiness.includes("verify-dashboard-live.cmd")
    && readiness.includes("publier-dashboard-mvp.cmd"),
  "Le document doit eviter de confondre l'ancien live avec le MVP publie."
);

check(
  "readiness uses current local validation count",
  /passe (24|25|26)\/(24|25|26)/.test(readiness)
    && !readiness.includes("passe 23/23")
    && !readiness.includes("passe 22/22"),
  "Le rapport ne doit pas conserver l'ancien compte de validation locale."
);

check(
  "readiness documents access status without redefining success",
  includesAll(readiness, [
    "Si Firebase CLI exige une reauth",
    "Blocage d'acces courant",
    "Avec intervention humaine",
    "Sans intervention humaine"
  ]),
  "Le statut d'acces doit etre explicite sans redeclarer le MVP comme bloque."
);

check(
  "readiness protects manual fields and legacy rebooking",
  includesAll(readiness, [
    "fin membership",
    "recurrence Kilo",
    "risque coach",
    "notes/objectifs",
    "Rebooking legacy reste actif",
    "parite avant remplacement"
  ]),
  "Les champs manuels et l'app rebooking actuelle doivent rester proteges."
);

check(
  "readiness aligns with source status and registry",
  sourceTypes.every((sourceType) => statusTypes.has(sourceType) && registryTypes.has(sourceType))
    && readiness.includes("SOURCE_REGISTRY.json")
    && readiness.includes("SOURCE_ACTIVATION_STATUS.json")
    && readiness.includes("SOURCE_PAYLOAD_CONTRACTS.json"),
  "Le rapport de migration doit pointer vers les artefacts machines."
);

check(
  "status still separates autonomous work from human actions",
  Array.isArray(status.nextNoInterventionWork)
    && status.nextNoInterventionWork.length >= 3
    && Array.isArray(status.knownHumanActions)
    && status.knownHumanActions.length >= 3
    && JSON.stringify(status.knownHumanActions).includes("Approve Bob Operator"),
  "Le statut doit permettre de continuer sans tourner en rond quand un acces manque."
);

check(
  "status records current local/live boundary",
  status.localReadiness
    && ["24/24", "25/25", "26/26", "27/27"].includes(status.localReadiness.localValidation)
    && status.localReadiness.localVersionReady === expectedLiveVersion
    && status.localReadiness.liveHostingVersionObserved === expectedLiveVersion
    && (
      String(status.localReadiness.deploymentBlockedBy || "").includes("firebase_reauth_required")
        || status.currentLiveAuditAttempt?.status === "ok"
    ),
  "Le registre doit garder la preuve que le code local est pret et aligner le live publie avec la preuve source live."
);

check(
  "current state docs mention readiness or same deploy reality",
  workQueue.includes(expectedLiveVersion)
    && releaseStatus.includes(expectedLiveVersion)
    && releaseStatus.includes(previousLiveVersion)
    && releaseStatus.includes("validation equipe technique")
    && releaseStatus.includes("verify-dashboard-live-stable.cmd"),
  "La readiness doit etre coherente avec la file de travail et le statut release."
);

check(
  "validation pipeline includes readiness verifier",
  validation.includes("verify-migration-readiness.cjs")
    && validation.includes("verify-bob-source-alignment.cjs")
    && /\d+\/\d+/.test(validation),
  "Le pipeline doit verifier ce rapport avant publication."
);

check(
  "readiness has no tokenized URLs or known secret fragments",
  forbiddenPublicFragments.every((needle) => !readiness.includes(needle)),
  "Le rapport ne doit pas exposer de secret ou d'URL Apps Script tokenisee."
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
if (!result.ok) process.exit(1);


