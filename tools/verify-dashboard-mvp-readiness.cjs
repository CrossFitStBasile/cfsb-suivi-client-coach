const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const codexRoot = root.split(path.sep).reduce((current, segment, index, segments) => (
  segment.toLowerCase() === "codex" ? segments.slice(0, index + 1).join(path.sep) : current
), "");
const outputsCandidates = [
  path.resolve(root, "..", "..", "..", "..", "2026-06-10", "je-reprends-le-projet-dashboard-coach", "outputs"),
  codexRoot ? path.join(codexRoot, "2026-06-10", "je-reprends-le-projet-dashboard-coach", "outputs") : ""
].filter(Boolean);
const outputsRoot = outputsCandidates.find((candidate) => fs.existsSync(candidate)) || outputsCandidates[0];

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const readOutput = (fileName) => fs.readFileSync(path.join(outputsRoot, fileName), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

const app = read("firebase-dashboard/public/app.js");
const index = read("firebase-dashboard/public/index.html");
const functionsIndex = read("functions/index.js");
const syncHelpersVerifier = read("tools/verify-firebase-sync-helpers.cjs");
const dataModel = read("firebase-dashboard/DATA_MODEL.md");
const dataSyncArchitecture = read("firebase-dashboard/DATA_SYNC_ARCHITECTURE.md");
const sourceRegistry = readJson("firebase-dashboard/SOURCE_REGISTRY.json");
const activationStatus = readJson("firebase-dashboard/SOURCE_ACTIVATION_STATUS.json");
const validationChecklist = readOutput("dashboard-coach-mvp-validation-checklist.md");
const goNoGo = readOutput("dashboard-coach-mvp-go-nogo-2026-06-11.md");
const terrainChecklist = readOutput("dashboard-coach-validation-terrain.md");
const completionAudit = readOutput("dashboard-coach-mvp-completion-audit-2026-06-11.md");

const expectedLiveVersion = (app.match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "";
const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

function sourceContract(sourceType) {
  return (sourceRegistry.ingestionContracts || []).find((item) => item.sourceType === sourceType) || {};
}

function statusSource(sourceType) {
  return (activationStatus.sources || []).find((item) => item.sourceType === sourceType) || {};
}

check(
  "MVP version boundary is explicit",
  Boolean(expectedLiveVersion)
    && app.includes(`APP_VERSION = "${expectedLiveVersion}"`)
    && index.includes(`app.js?v=${expectedLiveVersion}`)
    && goNoGo.includes("Version live actuelle")
    && goNoGo.includes("Go conditionnel")
    && Boolean(activationStatus.localReadiness?.liveHostingVersionObserved)
    && activationStatus.currentLiveAuditAttempt?.status === "ok"
    && goNoGo.includes("Go conditionnel"),
  "Le MVP doit distinguer clairement la version publiee de la validation terrain restante."
);

check(
  "CoachRx remains primary portfolio source",
  includesAll(app, ["PILOT_COACHES", "coachRxId", "mergedCoachOptions", "coachSubscriptionCriteria"])
    && includesAll(JSON.stringify(sourceContract("coachrx_clients")), ["clients", "coachRxId"])
    && includesAll(JSON.stringify(statusSource("coachrx_clients")), ["CoachRx", "false program tasks"])
    && dataSyncArchitecture.includes("CoachRx")
    && dataSyncArchitecture.includes("Firestore"),
  "Les portefeuilles coach doivent rester ancrés sur CoachRx/coachRxId, avec Firestore comme base lue par le dashboard."
);

check(
  "Firestore is operational database and manual fields are protected",
  includesAll(dataModel, ["manualMembershipEndDate", "kiloPlannedRecurrenceEndDate", "riskLevel"])
    && includesAll(JSON.stringify(sourceRegistry), [
      "protectedFields",
      "manualMembershipEndDate",
      "kiloPlannedRecurrenceEndDate",
      "riskLevel"
    ])
    && includesAll(syncHelpersVerifier, [
      "manualMergeMembershipEnd",
      "manualMergeKiloRecurrenceEnd",
      "manualMergeRiskLevel",
      "manualMergeNotes",
      "GHL ne doit pas effacer les notes d'un client manuel."
    ]),
  "Les imports ne doivent jamais ecraser les champs manuels coach/admin."
);

check(
  "To-do contains only concrete actions",
  app.includes("function isOpenTask(task)")
    && app.includes("isNonActionableLegacyTask(task)")
    && app.includes('cleanDisplayKey(task?.source) !== "coachrx_exercise_due"')
    && app.includes('task?.sourceSignal?.system === "CoachRx"')
    && app.includes("Priorise seulement les actions concretes")
    && app.includes("taskActionButtons")
    && app.includes("completeTask")
    && app.includes("ignoreTask")
    && goNoGo.includes("Une To-do demande une action incomprehensible ou non reelle")
    && !app.includes("Programme du ou en retard dans CoachRx."),
  "La To-do doit rester une liste d'actions reelles, pas du contexte CoachRx ambigu."
);

check(
  "CSM checkups feed credible performance periods",
  app.includes('periodFiltered(portfolioCheckups(), "checkupDate", { fallbackCreatedAt: false })')
    && app.includes("checkupDate")
    && includesAll(JSON.stringify(sourceContract("checkups")), ["checkups", "Performance"])
    && includesAll(JSON.stringify(statusSource("checkups")), ["Performance", "read-only", "AUTO-002"])
    && validationChecklist.includes("La Performance filtre les check-ups par `checkupDate`")
    && goNoGo.includes("Performance affiche encore le meme total sur toutes les periodes"),
  "Les check-ups CSM doivent etre filtres par vraie date de check-up, pas par date d'import."
);

check(
  "Coach view hides technical diagnostics",
  app.includes("function coachSafeErrorMessage(message)")
    && app.includes('isAdminView ? "Diagnostic Firebase" : "Action a verifier"')
    && app.includes("Le dashboard ne trouve pas encore de fiche client pour ce coach.")
    && app.includes('if (!isInfoAdmin()) return "";')
    && app.includes("renderClientSourceDetails(client, adminIdentitySummary, syncSummary)")
    && validationChecklist.includes("les messages d'erreur coach cachent le jargon Firebase/Firestore")
    && goNoGo.includes("Des diagnostics techniques reviennent dans la vue coach normale"),
  "La vue coach normale doit rester operationnelle; les diagnostics techniques doivent rester admin/Guide."
);

check(
  "Questionnaires are usable without false tasks",
  app.includes("renderQuestionnaires")
    && app.includes("createMissionFromQuestionnaireResponse")
    && app.includes("renderUnmatchedQuestionnaireCard")
    && app.includes("openQuestionnaireDetail")
    && app.includes("renderQuestionnaireDetailModal")
    && app.includes("openQuestionnaireLinkClient")
    && app.includes("questionnaire-card-compact")
    && app.includes("Une mission coach se cree seulement apres lien client fiable.")
    && includesAll(JSON.stringify(sourceContract("questionnaire_responses")), ["questionnaireResponses", "phone"])
    && includesAll(JSON.stringify(statusSource("questionnaire_responses")), ["A valider", "No false To-do"]),
  "Les questionnaires doivent alimenter lecture/relance/mission sans creer de fausse To-do non matchee."
);

check(
  "Rebooking stays usable but legacy remains the MVP reference",
  app.includes("renderRebooking")
    && app.includes("renderRebookingCardGuidance")
    && app.includes("Suivi fait")
    && app.includes("Seance rebookee")
    && includesAll(JSON.stringify(statusSource("rebooking")), ["legacy app", "parity audit"])
    && validationChecklist.includes("garder l'ancienne app rebooking comme reference")
    && goNoGo.includes("Rebooking doit encore etre compare avec l'ancienne app"),
  "Rebooking peut etre teste dans le dashboard, mais ne doit pas remplacer l'app historique avant parite."
);

check(
  "All MVP modules and field validation paths exist",
  includesAll(app, [
    '["todo", "To-do"]',
    '["clients", "Clients"]',
    '["questionnaires", "Questionnaires"]',
    '["rebooking", "Rebooking"]',
    '["performance", "Pilotage"]',
    '["alumni", "Alumni"]',
    '["guide", "Guide"]',
    "renderClientCard",
    "renderPerformance",
    "renderPilotageDiscussionBoard",
    "renderPilotageMeetingNotes",
    "renderAlumni",
    "renderGuide"
  ])
    && includesAll(terrainChecklist, ["Iheb", "Marc-Andre", "Camille", "Performance", "Rebooking"]),
  "Les modules attendus doivent exister et la validation terrain doit couvrir plusieurs coachs."
);

check(
  "MVP launch gates and post-MVP deferrals are documented",
  includesAll(goNoGo, [
    "Validation terrain minimale avant equipe",
    "No-Go si observe",
    "Peut attendre apres MVP",
    "Presenter ensuite a l'equipe comme pilote interne"
  ])
    && includesAll(validationChecklist, [
      "Bloquants MVP potentiels",
      "Acceptable pour une premiere version interne",
      "Validation rapide a faire avec Michael"
    ]),
  "La passation doit dire quoi tester maintenant, quoi bloquer, et quoi laisser apres le MVP."
);

check(
  "MVP completion remains unproven until live and field evidence exist",
  includesAll(completionAudit, [
    "Etat publication 2026-06-12",
    "audit-live-firestore.cmd --summary",
    "Les portefeuilles d'au moins Iheb, Marc-Andre et Camille sont plausibles en live",
    "Aucune To-do visible dans le test terrain n'est incomprehensible ou technique",
    "Performance n'affiche plus de chiffres absurdes par periode"
  ])
    && /2026\d{4}-[a-z0-9-]+/.test(completionAudit)
    && goNoGo.includes("Audit de completion: `dashboard-coach-mvp-completion-audit-2026-06-11.md`")
    && validationChecklist.includes("Audit de completion: `dashboard-coach-mvp-completion-audit-2026-06-11.md`"),
  "Le MVP doit garder une preuve explicite des conditions restantes avant de declarer le goal complet."
);

check(
  "No public secrets in MVP surfaces",
  !/GHL_PRIVATE_TOKEN|Bearer\s+[A-Za-z0-9._-]+|token=|script\.google\.com\/macros\/s\/[^"'`\s<>]+[?&]/i.test(app + index + goNoGo + validationChecklist + terrainChecklist + completionAudit),
  "Les assets et livrables MVP ne doivent pas publier de secrets ni d'URL Apps Script tokenisee."
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
if (failures.length) process.exit(1);


