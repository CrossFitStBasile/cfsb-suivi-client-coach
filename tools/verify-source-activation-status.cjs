const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

const status = readJson("firebase-dashboard/SOURCE_ACTIVATION_STATUS.json");
const registry = readJson("firebase-dashboard/SOURCE_REGISTRY.json");
const contracts = readJson("firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json");
const samples = readJson("firebase-dashboard/SOURCE_PAYLOAD_SAMPLES.json");
const kit = read("firebase-dashboard/SOURCE_ACTIVATION_KIT.md");
const workQueue = read("firebase-dashboard/NEXT_WORK_QUEUE.md");
const validation = read("verify-dashboard-before-deploy.cmd");

const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

function includesAllInsensitive(source, values) {
  const normalized = String(source || "").toLowerCase();
  return values.every((value) => normalized.includes(String(value).toLowerCase()));
}

function hasTargetOverlap(left = [], right = []) {
  return left.some((item) => right.includes(item));
}

const requiredSourceTypes = [
  "coachrx_clients",
  "client_directory",
  "ghl_contacts",
  "questionnaire_responses",
  "checkups",
  "rebooking"
];

const forbiddenFragments = [
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

const sources = Array.isArray(status.sources) ? status.sources : [];
const byType = new Map(sources.map((source) => [source.sourceType, source]));
const workPackages = Array.isArray(status.liveActivationWorkPackages) ? status.liveActivationWorkPackages : [];
const symptomTriage = Array.isArray(status.pilotSymptomTriage) ? status.pilotSymptomTriage : [];
const diagnosticPlaybooks = Array.isArray(status.diagnosticPlaybooks) ? status.diagnosticPlaybooks : [];
const packageById = new Map(workPackages.map((item) => [item.id, item]));
const packageByType = new Map(workPackages.map((item) => [item.sourceType, item]));
const registryTypes = new Set((registry.ingestionContracts || []).map((contract) => contract.sourceType));
const contractList = Array.isArray(contracts.contracts) ? contracts.contracts : [];
const sampleList = Array.isArray(samples.samples) ? samples.samples : [];
const contractTypes = new Set(contractList.map((contract) => contract.sourceType));
const sampleTypes = new Set(sampleList.map((sample) => sample.sourceType));
const contractByType = new Map(contractList.map((contract) => [contract.sourceType, contract]));
const sampleByType = new Map(sampleList.map((sample) => [sample.sourceType, sample]));
const requiredWorkPackages = [
  "coachrx_live_bridge",
  "client_directory_phone_bridge",
  "ghl_private_enrichment",
  "questionnaire_v2_inbox_bridge",
  "checkups_csm_bridge",
  "rebooking_legacy_parity_bridge"
];
const expectedLiveVersion = "20260707-coachrx-extraction-guard";

check(
  "status registry covers required sourceTypes",
  requiredSourceTypes.every((sourceType) => byType.has(sourceType) && registryTypes.has(sourceType) && contractTypes.has(sourceType) && sampleTypes.has(sourceType))
    && sources.every((source) => requiredSourceTypes.includes(source.sourceType)),
  "Le statut doit couvrir exactement les sources directes connues par le registre, les contrats et les samples."
);

check(
  "each source has actionable status metadata",
  sources.every((source) =>
    source.sourceType
      && source.domain
      && source.priority
      && Array.isArray(source.targetCollections)
      && source.targetCollections.length
      && source.currentStatus
      && source.liveSource
      && Array.isArray(source.localEvidence)
      && source.localEvidence.length
      && Array.isArray(source.blockedBy)
      && source.blockedBy.length
      && Array.isArray(source.canDoWithoutMichael)
      && source.canDoWithoutMichael.length
      && Array.isArray(source.needsMichaelOrBob)
      && source.needsMichaelOrBob.length
      && Array.isArray(source.activationEvidenceRequired)
      && source.activationEvidenceRequired.length
      && source.rollback
  ),
  "Chaque source doit exposer etat, preuves, blocages, travail autonome, besoins humains, preuves d'activation et rollback."
);

check(
  "global rules preserve target architecture",
  includesAll(JSON.stringify(status.globalRules || []), [
    "Firestore is the operational database",
    "Google Sheets is allowed as backup",
    "previewDashboardImportPayload_",
    "pushDashboardSourceToFirebase_",
    "No secret",
    "Rebooking legacy remains active"
  ]),
  "Les regles globales doivent resumer l'architecture cible et les garde-fous."
);

check(
  "shared evidence references current implementation",
  includesAll(JSON.stringify(status.sharedEvidenceAlreadyDone || []), [
    "functions/index.js",
    "dashboard-import-bridge-template.gs",
    "SOURCE_PAYLOAD_CONTRACTS.json",
    "SOURCE_PAYLOAD_SAMPLES.json",
    "SOURCE_PAYLOAD_PLAYBOOK.md",
    "SOURCE_ACTIVATION_KIT.md",
    "verify-dashboard-before-deploy.cmd"
  ]),
  "Le statut doit citer les preuves locales qui permettent de continuer sans acces live."
);

const liveAuditStatus = status.currentLiveAuditAttempt?.status;
const liveAuditBlockedByReauth = liveAuditStatus === "blocked_by_firebase_reauth";
const liveAuditOk = liveAuditStatus === "ok";

check(
  "local readiness captures deploy boundary",
  status.localReadiness
    && status.localReadiness.pipeline === "verify-dashboard-before-deploy.cmd"
    && ["24/24", "25/25", "26/26", "27/27"].includes(status.localReadiness.localValidation)
    && status.localReadiness.localVersionReady === expectedLiveVersion
    && status.localReadiness.liveHostingVersionObserved === expectedLiveVersion
    && !String(status.localReadiness.blocker || "").includes("reauth")
    && String(status.localReadiness.liveValidation || "").length > 0
    && String(status.localReadiness.nextHumanCommand || "").includes("Validate live"),
  "Le statut doit documenter clairement local pret, etat live courant et limite/prochaine action de deploy."
);

check(
  "current live audit attempt documents current live access state",
  status.currentLiveAuditAttempt
    && String(status.currentLiveAuditAttempt.attemptedAt || "").startsWith("2026-06-12")
    && status.currentLiveAuditAttempt.command === "audit-live-firestore.cmd --summary"
    && (liveAuditBlockedByReauth || liveAuditOk)
    && (
      liveAuditBlockedByReauth
        ? status.currentLiveAuditAttempt.error === "invalid_rapt"
          && String(status.currentLiveAuditAttempt.meaning || "").includes("recent reauthentication")
          && String(status.currentLiveAuditAttempt.nextHumanCommand || "").includes("firebase-login-dashboard.cmd")
        : status.currentLiveAuditAttempt.error === ""
          && String(status.currentLiveAuditAttempt.meaning || "").includes("Firestore live audit is reachable")
    )
    && (
      liveAuditBlockedByReauth
        ? status.currentLiveAuditAttempt.latestUsableLiveAudit === "lastLiveReadOnlyAudit"
        : status.currentLiveAuditAttempt.latestUsableLiveAudit === "lastPostPublicationAudit"
          && status.lastPostPublicationAudit?.liveHostingVersion === expectedLiveVersion
          && status.lastPostPublicationAudit?.globalDiagnostic?.status === "needs_source_activation"
    ),
  "Le registre doit distinguer l'etat live courant: bloque par reauth ou audit live exploitable."
);

check(
  "local readiness notes explain live access state",
  liveAuditBlockedByReauth
    ? JSON.stringify(status.localReadiness?.notes || []).includes("invalid_rapt")
    : JSON.stringify(status.localReadiness?.notes || []).includes("Live Hosting serves")
      && JSON.stringify(status.localReadiness?.notes || []).includes("Strict live validation passes")
      && JSON.stringify(status.localReadiness?.notes || []).includes("Firestore live audit passes"),
  "Les notes de readiness doivent expliquer l'etat live actuel au lieu de garder un blocage obsolete."
);

check(
  "coachrx status avoids sheet dependency and false tasks",
  includesAll(JSON.stringify(byType.get("coachrx_clients") || {}), [
    "canDoWithoutMichael",
    "CoachRx",
    "Google Sheet",
    "false program tasks"
  ]),
  "CoachRx doit rester activable directement sans forcer un Sheet et sans generer de fausses To-do."
);

check(
  "client directory status protects phones and manual dates",
  includesAll(JSON.stringify(byType.get("client_directory") || {}), [
    "official source for client phone numbers",
    "Sans telephone",
    "Manual membership end",
    "Kilo recurrence"
  ]),
  "Le repertoire client doit clarifier le telephone et proteger les champs manuels."
);

check(
  "GHL status is server-side and non destructive",
  includesAll(JSON.stringify(byType.get("ghl_contacts") || {}), [
    "server-side",
    "browser-side",
    "No client is archived",
    "exactly one GHL contactId"
  ]),
  "GHL doit rester prive, strict par telephone et non destructif."
);

check(
  "questionnaire status protects inbox semantics",
  includesAll(JSON.stringify(byType.get("questionnaire_responses") || {}), [
    "field key",
    "7-day relance",
    "A valider",
    "Creer une mission",
    "No false To-do"
  ]),
  "Le statut questionnaire doit proteger l'inbox et les relances."
);

check(
  "checkups status is read-only for manual client fields",
  includesAll(JSON.stringify(byType.get("checkups") || {}), [
    "Performance",
    "read-only",
    "No manual client fields change",
    "AUTO-002"
  ]),
  "Les check-ups doivent alimenter Performance sans modifier la fiche manuelle."
);

check(
  "rebooking status protects legacy parity",
  includesAll(JSON.stringify(byType.get("rebooking") || {}), [
    "legacy app",
    "parity audit",
    "does not reopen",
    "No tokenized legacy URL"
  ]),
  "Rebooking doit rester derriere un audit de parite avec l'app existante."
);

check(
  "human and autonomous work are separated",
  Array.isArray(status.nextNoInterventionWork)
    && status.nextNoInterventionWork.length >= 3
    && Array.isArray(status.knownHumanActions)
    && status.knownHumanActions.length >= 3
    && JSON.stringify(status.knownHumanActions).includes("Approve Bob Operator"),
  "Le registre doit eviter que Codex tourne en rond quand un acces humain est necessaire."
);

check(
  "live activation work packages are machine readable",
  requiredWorkPackages.every((id) => packageById.has(id))
    && workPackages.every((item) =>
      item.id
        && requiredSourceTypes.includes(item.sourceType)
        && item.objective
        && item.operator
        && Array.isArray(item.blockedUntil)
        && item.blockedUntil.length
        && item.previewLimit
        && item.firstWriteLimit
        && Array.isArray(item.mustProve)
        && item.mustProve.length
        && item.rollback
    ),
  "Chaque source live doit avoir un paquet d'activation JSON exploitable sans relire le Markdown."
);

check(
  "work packages protect pilot writes and legacy systems",
  JSON.stringify(packageById.get("coachrx_live_bridge") || {}).includes("without forcing a Google Sheet intermediary")
    && JSON.stringify(packageById.get("coachrx_live_bridge") || {}).includes("One pilot coach only")
    && JSON.stringify(packageById.get("ghl_private_enrichment") || {}).includes("never the browser")
    && JSON.stringify(packageById.get("ghl_private_enrichment") || {}).includes("No archive")
    && JSON.stringify(packageById.get("questionnaire_v2_inbox_bridge") || {}).includes("content remains immutable")
    && JSON.stringify(packageById.get("rebooking_legacy_parity_bridge") || {}).includes("No writeback until parity is proven")
    && JSON.stringify(packageById.get("rebooking_legacy_parity_bridge") || {}).includes("legacy rebooking app as active source"),
  "Les paquets doivent limiter les premiers writes et proteger GHL, questionnaire et rebooking."
);

check(
  "work packages align with contracts, samples and source registry",
  requiredSourceTypes.every((sourceType) => {
    const source = byType.get(sourceType);
    const contract = contractByType.get(sourceType);
    const sample = sampleByType.get(sourceType);
    const activationPackage = packageByType.get(sourceType);
    return source
      && contract
      && sample
      && activationPackage
      && activationPackage.sourceType === sourceType
      && hasTargetOverlap(source.targetCollections || [], contract.targetCollections || [])
      && hasTargetOverlap(source.targetCollections || [], sample.expectedTargetCollections || []);
  })
    && workPackages.every((activationPackage) => requiredSourceTypes.includes(activationPackage.sourceType)),
  "Chaque paquet live doit pointer vers un sourceType qui a un statut, un contrat et un sample non sensible compatibles."
);

const workPackageEvidenceExpectations = {
  coachrx_clients: ["sourceImportRuns", "coachSyncStatus", "Clients", "false program"],
  client_directory: ["Sans telephone", "Questionnaire send", "Manual"],
  ghl_contacts: ["GHL", "phone", "public assets", "No archive"],
  questionnaire_responses: ["Reponses", "Phone matching", "No false To-do"],
  checkups: ["Performance", "Client history", "No manual"],
  rebooking: ["legacy", "No tokenized", "No writeback"]
};

check(
  "work packages define source-specific proof and rollback boundaries",
  requiredSourceTypes.every((sourceType) => {
    const activationPackage = packageByType.get(sourceType);
    return activationPackage
      && includesAllInsensitive(JSON.stringify(activationPackage), workPackageEvidenceExpectations[sourceType] || [])
      && String(activationPackage.previewLimit || "").length >= 12
      && String(activationPackage.firstWriteLimit || "").length >= 12
      && String(activationPackage.rollback || "").length >= 20;
  }),
  "Chaque paquet doit dire comment prouver l'activation, limiter le premier write et revenir en arriere."
);

const requiredSymptoms = [
  "To-do",
  "missing phone",
  "Questionnaire",
  "Rebooking",
  "access"
];

const requiredDiagnosticPlaybooks = [
  "todo_noise_or_empty",
  "client_missing_phone",
  "questionnaire_send_or_response_missing",
  "rebooking_legacy_mismatch",
  "coach_access_issue"
];

check(
  "pilot symptom triage maps visible coach problems to sources",
  requiredSymptoms.every((needle) =>
    symptomTriage.some((item) => JSON.stringify(item).toLowerCase().includes(needle.toLowerCase()))
  )
    && symptomTriage.length >= 5
    && symptomTriage.every((item) =>
      item.symptom
        && item.likelySource
        && Array.isArray(item.sourceTypesToCheck)
        && item.sourceTypesToCheck.length
        && Array.isArray(item.evidenceToCheck)
        && item.evidenceToCheck.length
        && Array.isArray(item.doNotDo)
        && item.doNotDo.length
        && item.nextAction
    ),
  "Le statut doit transformer les symptomes vus par un coach en source a verifier, preuves, interdits et prochaine action."
);

check(
  "pilot symptom triage protects source truth boundaries",
  JSON.stringify(symptomTriage).includes("Do not create program tasks from ambiguous CoachRx")
    && JSON.stringify(symptomTriage).includes("Do not let questionnaire or rebooking overwrite client phone")
    && JSON.stringify(symptomTriage).includes("Do not count Non envoye as a relance")
    && JSON.stringify(symptomTriage).includes("Do not replace the legacy app before parity is proven")
    && JSON.stringify(symptomTriage).includes("Do not open self-provision to coaches outside the approved pilot list"),
  "La triage map doit bloquer les corrections dangereuses: fausses To-do, telephones ecrases, fausses relances, rebooking premature et acces trop ouverts."
);

check(
  "diagnostic playbooks cover current pilot feedback loops",
  requiredDiagnosticPlaybooks.every((id) => diagnosticPlaybooks.some((playbook) => playbook.id === id))
    && requiredSymptoms.every((needle) =>
      diagnosticPlaybooks.some((playbook) => JSON.stringify(playbook).toLowerCase().includes(needle.toLowerCase()))
    )
    && diagnosticPlaybooks.every((playbook) =>
      playbook.id
        && playbook.symptomFamily
        && playbook.questionToAnswer
        && Array.isArray(playbook.sourcePriority)
        && playbook.sourcePriority.length
        && Array.isArray(playbook.inspectCollections)
        && playbook.inspectCollections.length
        && Array.isArray(playbook.requiredEvidence)
        && playbook.requiredEvidence.length >= 3
        && playbook.safeNextAction
        && playbook.writeAllowedWhen
        && Array.isArray(playbook.doNotDo)
        && playbook.doNotDo.length
    ),
  "Chaque probleme pilote recurrent doit avoir un playbook de diagnostic avant correction UX ou donnees."
);

check(
  "diagnostic playbooks require evidence before writes",
  JSON.stringify(diagnosticPlaybooks).includes("source et le type de chaque To-do")
    && JSON.stringify(diagnosticPlaybooks).includes("source prioritaire")
    && JSON.stringify(diagnosticPlaybooks).includes("envoi est journalise")
    && JSON.stringify(diagnosticPlaybooks).includes("parite")
    && JSON.stringify(diagnosticPlaybooks).includes("liste officielle")
    && JSON.stringify(diagnosticPlaybooks).includes("Ne pas publier d'URL Apps Script tokenisee")
    && JSON.stringify(diagnosticPlaybooks).includes("Ne pas ouvrir l'auto-activation hors liste pilote"),
  "Les playbooks doivent proteger contre les writes prematures, les URLs tokenisees et les acces trop ouverts."
);

check(
  "kit and work queue reference status registry",
  kit.includes("SOURCE_ACTIVATION_STATUS.json")
    && workQueue.includes("SOURCE_ACTIVATION_STATUS.json"),
  "Le kit et la file de travail doivent pointer vers le statut source courant."
);

check(
  "validation pipeline includes status verifier",
  validation.includes("verify-source-activation-status.cjs")
    && /\d+\/\d+/.test(validation),
  "Le pipeline local doit verifier le registre de statut."
);

const publicText = [JSON.stringify(status), kit, workQueue].join("\n");
check(
  "status registry has no tokenized URLs or known secret fragments",
  forbiddenFragments.every((needle) => !publicText.includes(needle)),
  "Le statut ne doit pas exposer de token, URL Apps Script protegee, cle API ou bearer token."
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


