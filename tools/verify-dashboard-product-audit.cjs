const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "firebase-dashboard", "public", "app.js");
const stylesPath = path.join(root, "firebase-dashboard", "public", "styles.css");
const indexPath = path.join(root, "firebase-dashboard", "public", "index.html");
const functionsPath = path.join(root, "functions", "index.js");
const actionsVerifierPath = path.join(root, "tools", "verify-dashboard-actions.cjs");
const deployContractVerifierPath = path.join(root, "tools", "verify-firebase-deploy-contract.cjs");
const firestoreCoverageVerifierPath = path.join(root, "tools", "verify-firestore-coverage.cjs");
const deployScriptsVerifierPath = path.join(root, "tools", "verify-deploy-scripts.cjs");
const hostingSmokeVerifierPath = path.join(root, "tools", "verify-hosting-smoke.cjs");
const auditLiveFirestorePath = path.join(root, "tools", "audit-live-firestore.cjs");
const validationScriptPath = path.join(root, "verify-dashboard-before-deploy.cmd");
const syncArchitecturePath = path.join(root, "firebase-dashboard", "DATA_SYNC_ARCHITECTURE.md");
const dataModelPath = path.join(root, "firebase-dashboard", "DATA_MODEL.md");

const app = fs.readFileSync(appPath, "utf8");
const styles = fs.readFileSync(stylesPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const functions = fs.readFileSync(functionsPath, "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const actionsVerifier = fs.readFileSync(actionsVerifierPath, "utf8");
const deployContractVerifier = fs.readFileSync(deployContractVerifierPath, "utf8");
const firestoreCoverageVerifier = fs.readFileSync(firestoreCoverageVerifierPath, "utf8");
const deployScriptsVerifier = fs.readFileSync(deployScriptsVerifierPath, "utf8");
const hostingSmokeVerifier = fs.readFileSync(hostingSmokeVerifierPath, "utf8");
const auditLiveFirestore = fs.readFileSync(auditLiveFirestorePath, "utf8");
const validationScript = fs.readFileSync(validationScriptPath, "utf8");
const syncArchitecture = fs.readFileSync(syncArchitecturePath, "utf8");
const dataModel = fs.readFileSync(dataModelPath, "utf8");
const clientCardSurface = app.slice(
  app.indexOf("function renderClientCard"),
  app.indexOf("function renderQuestionnaireItemCard")
);
const dashboardStatsSurface = app.slice(
  app.indexOf("function renderDashboardStats"),
  app.indexOf("function openRebookingSessionCount")
);

const checks = [];

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return "";
}

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

function countMatches(source, regex) {
  return [...source.matchAll(regex)].length;
}

check(
  "coachs pilotes reels",
  includesAll(app, ["15935", "15928", "17242", "15902", "15893", "15937", "15936"])
    && countMatches(app, /coachRxId:\s*"15|coachRxId:\s*"17/g) >= 7,
  "Les sept coachs pilotes doivent rester disponibles dans l'app."
);

check(
  "navigation modules",
  includesAll(app, ['["todo", "To-do"]', '["clients", "Clients"]', '["questionnaires", "Questionnaires"]', '["rebooking", "Rebooking"]', '["performance", "Pilotage"]', '["alumni", "Alumni"]', '["training", "Formation continue"]', '["admin", "Admin"]', '["guide", "Guide"]'])
    && app.includes("visibleTabs()"),
  "Tous les onglets de la version pilote doivent exister."
);

check(
  "to-do sans bloc capture rapide",
  app.includes('data-action="openQuickNote"')
    && app.includes("Ajouter une mission")
    && !/Capture rapide|CAPTURE RAPIDE|capture rapide/.test(app),
  "La To-do doit utiliser le bouton Ajouter une mission et ne pas ramener l'ancien bloc capture rapide dans la page."
);

check(
  "selecteur coach stable",
  app.includes('data-action="toggleCoachPicker"')
    && app.includes('data-action="selectCoach"')
    && app.includes('role="listbox"')
    && app.includes('role="option"')
    && app.includes("state.coachPickerOpen = !state.coachPickerOpen")
    && app.includes("subscribeCoachData();")
    && styles.includes(".coach-select:hover")
    && styles.includes(".coach-select:focus")
    && styles.includes(".coach-picker")
    && styles.includes("max-height: min(360px, 46vh)")
    && styles.includes("overscroll-behavior: contain"),
  "Le choix de coach doit etre un picker cliquable en un clic, sans obliger l'utilisateur a garder le clic enfonce."
);

check(
  "ancien selecteur coach retire",
  !app.includes('data-action="selectCoachNative"')
    && !app.includes('<select class="coach-select"')
    && app.includes('class="coach-select"')
    && app.includes('class="coach-picker"'),
  "Le selecteur natif qui forceait parfois un clic maintenu ne doit pas revenir."
);

check(
  "version frontend visible",
  /const APP_VERSION = "2026\d{4}-[^"]+"/.test(app)
    && app.includes("window.__CFSB_DASHBOARD_VERSION = APP_VERSION")
    && app.includes("Version ${escapeHtml(APP_VERSION)}")
    && styles.includes(".app-version"),
  "La version chargee doit etre visible dans l'interface pour diagnostiquer les anciens bundles."
);

check(
  "ecran chargement coach sans jargon technique",
  index.includes("L'application prend plus de temps que prevu a demarrer.")
    && index.includes("vide la session puis reconnecte ton compte")
    && !index.includes("Firebase Auth ne repond pas")
    && !index.includes("DIAGNOSTIC CHARGEMENT")
    && app.includes("La connexion prend plus de temps que prevu")
    && app.includes("un admin pourra verifier le journal technique")
    && app.includes("auth-card-pilot")
    && app.includes("Connexion avec Google")
    && app.includes("Connexion par courriel")
    && app.includes("courriel que Michael a autorise")
    && app.includes("Le mot de passe peut etre reinitialise par courriel.")
    && app.includes("Code acces:")
    && !app.includes("<strong>UID:</strong>")
    && !app.includes("Lecture du profil Firestore trop longue.")
    && !app.includes("Aucun document trouve dans Firestore"),
  "Les ecrans de chargement/acces visibles aux coachs ne doivent pas parler en jargon Firebase/Firestore."
);

check(
  "id CoachRx reserve admin dans le selecteur",
  app.includes("const isAdminView = isInfoAdmin();")
    && app.includes("isAdminView && activeCoach.coachRxId")
    && app.includes("- CoachRx ${activeCoach.coachRxId}")
    && app.includes("isAdminView && coach.coachRxId")
    && app.includes("isAdminView && activeCoach?.coachRxId")
    && !app.includes('${activeCoach?.coachRxId ? `<small>CoachRx'),
  "Le coach ne doit pas voir l'ID CoachRx dans le selecteur normal; l'admin le garde pour diagnostic."
);

check(
  "selection coach equipe",
  app.includes("Coach consulte")
    && app.includes("Consultation equipe")
    && app.includes("${renderCoachSelect()}")
    && app.includes('String(coachId || state.profile?.coachId || "").trim()')
    && rules.includes("function isPilotTeamUser()")
    && rules.includes("function canReadPilotCoachDoc(coachField)")
    && rules.includes("function canCreatePilotCoachDoc(coachField)"),
  "Les coachs pilotes doivent pouvoir consulter et agir dans les comptes des autres coachs pilotes avec un libelle clair."
);

check(
  "sidebar sans chevauchement",
  includesAll(styles, [".side", "display: flex", "flex-direction: column", ".nav", "flex: 1 1 0", "overflow-y: auto", ".side-footer", "flex: 0 0 auto"]),
  "Le menu lateral doit laisser la navigation defiler sans chevaucher le selecteur coach."
);

check(
  "to-do actionnable et source visible",
    app.includes("function taskActionGuidance(task)")
    && app.includes("function taskSourceNote(task)")
    && app.includes("function taskDisplayTitle(task)")
    && app.includes("function taskDisplayDescription(task, fallback)")
    && app.includes("function todoTaskMatchesFilter(task, filter)")
    && (
      app.includes('["validation", "A confirmer", tasks.filter((task) => todoTaskMatchesFilter(task, "validation")).length]')
      || app.includes('["validation", "A confirmer", allTasks.filter((task) => todoTaskMatchesFilter(task, "validation")).length]')
    )
    && app.includes('data-filter="todo"')
    && app.includes('return "Confirmer le statut du client";')
    && app.includes("function isNonActionableLegacyTask(task)")
    && app.includes('cleanDisplayKey(task?.source) !== "coachrx_exercise_due"')
    && app.includes('task?.sourceSignal?.system === "CoachRx"')
    && app.includes('if (task.source === "coachrx_exercise_due") return "CoachRx";')
    && !app.includes("Programme du ou en retard dans CoachRx.")
    && !app.includes("Action importee de TASKS_Current")
    && app.includes("Verifier la seance a remettre dans Rebooking, puis fermer quand le client est rebooke ou que le suivi est regle.")
    && app.includes('return "Tache";')
    && app.includes("source-review")
    && app.includes("isNonActionableLegacyTask(task)")
    && app.includes('state.tab === "todo" ? "" : renderCoachSyncStatus()')
    && !app.includes("${renderTodoImportDiagnostic(tasks)}")
    && !app.includes("sourceReview ?")
    && functions.includes("normalizeImportedTaskTitle")
    && functions.includes("inferImportedTaskType")
    && functions.includes("defaultImportedTaskDescription"),
  "Les To-do doivent rester actionnables avec une source courte visible, sans diagnostic technique dans la vue coach."
);

check(
  "to-do sans diagnostic complet quand clients non lisibles",
  app.includes("renderCoachDataNotice({ compact: true })")
    && app.includes("function renderCoachDataNotice(options = {})")
    && app.includes("data-notice-compact")
    && app.includes("Donnees client a reconnecter.")
    && styles.includes(".data-notice-compact")
    && styles.includes(".data-notice-compact span"),
  "La To-do doit afficher un etat compact si les clients du coach ne sont pas lisibles, pas l'audit technique complet."
);

check(
  "to-do filtre compact et priorites etoilees transversales",
  app.includes('filterSelect("todo", "Afficher", filterOptions)')
    && app.includes('["all", "Toutes les taches", allTasks.length]')
    && !app.includes('["starred", "Etoilees"')
    && app.includes('if (!filter || filter === "all") return true;')
    && app.includes('Number(isStarredTask(b)) - Number(isStarredTask(a))')
    && app.includes('${starred ? "&#9733;" : "&#9734;"}')
    && styles.includes(".todo-view-controls"),
  "Toutes doit inclure les notes coach; le filtre doit rester compact et l'etoile doit classer les missions dans toutes les vues."
);

check(
  "rebooking visible depuis la to-do et transformable en mission",
  app.includes("function openRebookingSessionCount()")
    && app.includes('label: "rebooking"')
    && app.includes('action: "rebooking", filter: "open"')
    && app.includes('data-action="openRebookingMission"')
    && app.includes('type: taskType')
    && app.includes('source: taskSource')
    && functions.includes('taskType === "rebooking"')
    && functions.includes('source: taskSource')
    && functions.includes("Dossier rebooking requis pour cette mission."),
  "La To-do doit compter les seances ouvertes et chaque dossier rebooking doit pouvoir creer une mission liee sans fermer la seance."
);

check(
  "sync concise et issues separees des echecs",
  app.includes("function renderCoachSyncStatus()")
    && app.includes("function syncStatusOutcome(status, request)")
    && app.includes('return "completed_with_warnings";')
    && app.includes('return "failed";')
    && app.includes("Sync terminee · donnees a corriger")
    && app.includes("les donnees ont bien ete importees")
    && app.includes("Synchronisation echouee")
    && app.includes('if (!isInfoAdmin()) return "";')
    && app.includes("Derniere sync")
    && !app.includes("warnings.map(escapeHtml).join")
    && app.includes('state.tab === "todo" ? "" : renderCoachSyncStatus()'),
  "Une sync terminee avec avertissements de donnees ne doit pas etre presentee comme un echec; les diagnostics detailles restent dans Admin/Guide."
);

check(
  "erreurs et portefeuille vide sans bruit technique coach",
  app.includes("function coachSafeErrorMessage(message)")
    && app.includes("function coachErrorContext(message)")
    && app.includes("function coachActionErrorLabel(action)")
    && app.includes('isAdminView ? "Diagnostic Firebase" : "Action a verifier"')
    && app.includes("Le dashboard n'a pas pu completer cette action")
    && app.includes("Action bloquee avec ton acces actuel")
    && app.includes("Creer un client")
    && app.includes("Demande a un admin de verifier dans Guide")
    && app.includes("const isAdminView = isInfoAdmin();")
    && app.includes("Le dashboard ne trouve pas encore de fiche client pour ce coach.")
    && app.includes("La To-do reste vide tant que le portefeuille client n'est pas disponible.")
    && !app.includes("La To-do s'active des que Firestore retourne le portefeuille du coach.")
    && !app.includes("Les donnees Firestore du coach sont en cours de lecture."),
  "La vue coach doit transformer les erreurs et coachs vides en messages simples; les details Firebase/Firestore restent admin."
);

check(
  "to-do exclut les imports stale",
  app.includes(".filter(isOpenTask)")
    && app.includes("task.sourceStale === true")
    && app.includes("isNonActionableLegacyTask(task)")
    && app.includes("task.archivedAt || task.completedAt || task.ignoredAt")
    && app.includes('["open", "waiting"].includes(String(task.status || "").trim())'),
  "La To-do ne doit pas afficher de vieilles taches importees ou deja traitees meme si leur ancien statut etait open."
);

check(
  "aucune donnee pilote publique",
  !/SAMPLE_CLIENTS|seedPilotData|demo-caroline|demo-michael|donnees pilotes/i.test(app + index),
  "La version reelle ne doit plus exposer de faux clients ou boutons de seed demo."
);

check(
  "reparation coachs explicite",
  app.includes("Reparer liste coachs")
    && app.includes("Charger les coachs pilotes")
    && app.includes("window.confirm")
    && app.includes("firebase_official_pilot_list")
    && app.includes("existing.exists() ? existing.data().createdAt : serverTimestamp()"),
  "L'action admin qui restaure les coachs pilotes doit etre explicite, confirmee et ne pas reecrire createdAt."
);

check(
  "auto activation coachs pilotes",
  app.includes("function pilotCoachForEmail(email)")
    && app.includes("firebase_self_provision_pilot")
    && app.includes("Acces coach active")
    && rules.includes("function isPilotCoachSelfProvisionProfile(userId)")
    && rules.includes("function isPilotCoachEmailForCoach(coachField)")
    && rules.includes("'marcandremenard89@gmail.com'")
    && rules.includes("'ihebya73@gmail.com'")
    && rules.includes("'camproulxx@gmail.com'")
    && rules.includes("'davidolivier1997@gmail.com'")
    && rules.includes("'hugolelievre34@gmail.com'")
    && rules.includes("'raphael.samson@usherbrooke.ca'")
    && rules.includes("request.resource.data.role == 'coach'")
    && rules.includes("request.resource.data.coachRxId == request.resource.data.coachId")
    && rules.includes("isAdminBootstrapProfile(userId) || isPilotCoachSelfProvisionProfile(userId)")
    && dataModel.includes("firebase_self_provision_pilot"),
  "Les coachs pilotes doivent pouvoir creer leur propre profil avec leur courriel officiel, sans ouvrir les regles a d'autres coachId."
);

check(
  "questionnaires simplifiees en cinq vues",
  includesAll(app, ["Reponses a lire", "Envoyer", "Envoyes sans reponse", "A valider", "Archives"])
    && !app.includes("A envoyer 3 mois+")
    && !app.includes("Non envoyes")
    && app.includes("questionnaireSendClientOptions")
    && app.includes('phone ? "" : "disabled"')
    && app.includes("client(s) sans telephone sont visibles mais desactives"),
  "L'inbox questionnaire ne doit pas revenir a une liste de tags confuse, et les clients sans telephone ne doivent pas etre selectionnables pour l'envoi."
);

check(
  "envoi questionnaire sans jargon GHL pour coach",
  app.includes("const sendExplanation = isAdminView")
    && app.includes("Le questionnaire sera envoye au client selectionne si son telephone est confirme dans sa fiche.")
    && app.includes("Le dashboard ajoute le tag GHL dashboardcoach")
    && app.includes("${escapeHtml(sendExplanation)}")
    && !app.includes("Le dashboard ajoute le tag GHL dashboardcoach au contact trouve par telephone. Le workflow GHL envoie ensuite le SMS.\n        ${clientsMissingPhone"),
  "La modale d'envoi questionnaire doit parler en action coach; le tag/workflow GHL reste une information admin."
);

check(
  "questionnaires robustes aux nouveaux champs",
  app.includes("questionnaireUnknownAnswers")
    && app.includes("Autres reponses (${unknown.length})")
    && app.includes("other_responses")
    && functions.includes("other_responses")
    && !extractFunction(functions, "questionnaireAnswers").includes(".slice(0, 6)")
    && !extractFunction(app, "questionnaireUnknownAnswers").includes(".slice(")
    && !functions.includes("nouvelle_question_v2"),
  "Le dashboard doit afficher les champs questionnaire inconnus sans dependre d'une colonne precise."
);

check(
  "questionnaires orientes action coach",
  app.includes("questionnairePrioritySummary")
    && app.includes("questionnaire-priority")
    && app.includes("Ce qui demande attention")
    && styles.includes(".questionnaire-signal-panel")
    && includesAll(app, ["Priorite haute", "Discussion a planifier", "Ajustement leger", "Aucun signal urgent"])
    && includesAll(styles, [".questionnaire-priority", "border-left-width: 5px", ".questionnaire-priority.red", ".questionnaire-priority.green"]),
  "Chaque reponse questionnaire doit afficher une priorite coach claire, une raison et une prochaine action avant les details."
);

check(
  "questionnaires filtrables par priorite et transformables en mission",
  app.includes("questionnaireTriage")
    && app.includes('data-filter="questionnaireTriage"')
    && app.includes("applyQuestionnaireTriageFilter")
    && app.includes("createMissionFromQuestionnaireResponse")
    && app.includes("if (!response.clientId)")
    && app.includes("Mission non creee: rattache d'abord la reponse a une fiche client.")
    && app.includes("Creer mission + lu")
    && app.includes('source: "questionnaire_response_mission"')
    && app.includes('logAction("task.created_from_questionnaire_response"')
    && styles.includes(".questionnaire-triage-filter"),
  "Les couleurs questionnaire doivent servir de filtre actionnable, et une reponse doit pouvoir creer une mission coach en meme temps qu'elle est lue."
);

check(
  "questionnaires non matchees hors fausse To-do",
  app.includes("function renderUnmatchedQuestionnaireCard(response)")
    && app.includes("function renderQuestionnaireValidationNotice(unmatched)")
    && app.includes("Une mission coach se cree seulement apres lien client fiable.")
    && app.includes("Client a confirmer")
    && app.includes("openQuestionnaireDetail")
    && app.includes("renderQuestionnaireDetailModal")
    && app.includes("questionnaire-card-compact")
    && app.includes("openQuestionnaireLinkClient")
    && app.includes("renderQuestionnaireLinkClientModal")
    && app.includes("linkQuestionnaireResponseToClient")
    && app.includes("questionnaire_response.client_linked"),
  "Une reponse questionnaire non reliee doit rester dans A valider et pouvoir etre rattachee avant toute mission coach."
);

check(
  "relance questionnaire apres sept jours",
  app.includes("waitingDays >= 7")
    && app.includes("waitingDays < 7")
    && app.includes("En attente")
    && app.includes("Creer relance")
    && app.includes("questionnaireSendHasResponse")
    && app.includes("submittedAt >= sentAt")
    && app.includes("latestSendForClient")
    && app.includes("questionnaireSendDate(b) - questionnaireSendDate(a)"),
  "Une relance doit etre bloquee avant 7 jours apres un vrai envoi sans reponse posterieure, et le dernier envoi doit etre calcule par date."
);

check(
  "fiche client manuelle",
  includesAll(app, ["manualMembershipEndDate", "kiloPlannedRecurrenceEndDate", "riskLevel", "Source et synchronisation", "Telephone"])
    && app.includes("Coordonnees utiles")
    && app.includes("function renderClientSourceDetails(client, identitySummary, syncSummary)")
    && app.includes('if (!isInfoAdmin()) return "";')
    && app.includes("clientIdentitySummary")
    && app.includes("clientSyncSummary")
    && app.includes("Cle principale: telephone")
    && app.includes("Telephone confirme:")
    && app.includes("Telephone a ajouter pour fiabiliser la fiche.")
    && app.includes("Transfert coach"),
  "La fiche client doit garder les champs manuels et la source de matching."
);

check(
  "fiche client comme poste de controle",
  includesAll(app, [
    "function renderClientActivityPanel",
    "function renderClientCommandStrip",
    "function clientPrioritySummary",
    "Priorite client",
    "Telephone a completer",
    "Aucune priorite ouverte",
    "Actions ouvertes",
    "openClientMission",
    "openClientQuestionnaireSend",
    "openClientRebooking",
    "function renderTaskEditModal",
    "function saveTask",
    "manualEditedAt",
    "task.edited",
    "data-action=\"openTaskEdit\"",
    "questionnaireSendClientOptions(clients, selectedClientId)",
    "String(client.id) === String(selectedClientId)"
  ])
    && includesAll(styles, [".client-command-strip", ".client-command-stats", ".client-command-actions", ".client-action-hub", ".client-action-grid", ".mini-action-row", ".secondary.tiny"]),
  "La fiche client doit permettre de voir et agir vite sur missions, questionnaires et rebooking sans quitter le contexte client."
);

check(
  "correction telephone client ciblee",
  includesAll(app, [
    "function renderClientPhoneFixModal",
    "data-form=\"clientPhoneFix\"",
    "openClientPhoneFix",
    "function saveClientPhoneFix",
    "phoneSource: \"dashboard_manual\"",
    "manualPhoneConfirmedAt",
    "phoneUpdatedByEmail",
    "client.phone_updated",
    "function clientPhoneSuggestion",
    "Suggestion CSM/check-up",
    "Suggestion CSM:",
    "source: \"csm_checkups\"",
    "Correction ciblee",
    "Les notes, le membership, le coach et les autres champs manuels restent intacts."
  ]),
  "La fiche client/Admin doit permettre de corriger rapidement un telephone sans ecraser les champs manuels."
);

check(
  "cartes clients scannables",
  includesAll(app, [
    "function clientCardMetaRows",
    "function clientCardPills",
    "function renderClientInfoPills",
    "function clientTrainingSnapshot",
    "function clientLevelMethodClass",
    "openClientTraining",
    "renderClientTrainingModal"
  ])
    && includesAll(styles, [".client-card-compact", ".client-info-pill", ".level-yellow", ".training-rhythm.good"])
    && clientCardSurface.includes('client.riskLevel !== "none"')
    && !clientCardSurface.includes("clientValidationSummary")
    && !clientCardSurface.includes("clientPhone")
    && !clientCardSurface.includes("Risque: Aucun"),
  "Les cartes clients doivent montrer membership, Level Method et rythme reel/cible sans telephone ni statut technique."
);

check(
  "validation portefeuille lisible avec source CoachRx",
  includesAll(app, [
    "clientValidationSummary",
    "coachRxProgramSummary",
    "coachRxPortfolioLabel",
    "Fiche a valider",
    "Portefeuille confirme",
    "Validation portefeuille",
    "CoachRx",
    "Portefeuille CoachRx",
    "CoachRx indique un programme a traiter",
    "Client present dans CoachRx, mais son statut actif/membership doit etre confirme"
  ])
    && includesAll(functions, [
      "assessCoachRxPortfolioClient",
      "coachRxRequiresValidation",
      "coachRxProgramContext",
      "Les signaux programme rouges ou jaunes dans CoachRx creent une mission"
    ]),
  "CoachRx doit rester la source detaillee; les signaux rouges/jaunes creent une mission sans confirmer automatiquement le membership actif."
);

check(
  "deduplication client robuste",
  /phone\s*\?\s*`phone:\$\{phone\}`/.test(app)
    && /sourceClientId\s*\?\s*`source:\$\{sourceClientId\}`/.test(app)
    && /name\s*\?\s*`name:\$\{name\}`/.test(app),
  "Le dedupe local doit privilegier telephone, puis ID source, puis nom."
);

check(
  "fusion import avec clients existants",
  functions.includes("existingClientSnap")
    && functions.includes("createClientMatchIndex")
    && functions.includes("findClientMatch")
    && functions.includes("linkedFromManual")
    && functions.includes("matchedExistingClientBy"),
  "La sync doit fusionner un client manuel/existant avec les imports Sheets/CoachRx au lieu de creer un doublon."
);

check(
  "transfert coach client",
  app.includes('name="coachId"')
    && app.includes("previousCoachId")
    && app.includes("transferredAt")
    && app.includes("transferSource")
    && app.includes("firebase_dashboard_admin")
    && app.includes("transferClientRelatedRecords")
    && includesAll(app, ["tasks", "rebookings", "questionnaireSends", "questionnaireSchedules", "questionnaireResponses", "checkups", "impacts"]),
  "Le coach proprietaire ou l'admin doit pouvoir transferer un client et ses donnees liees sans perdre sa fiche."
);

check(
  "rebooking complet",
  includesAll(app, ["A traiter", "Suivis faits", "Seances rebookees", "Absences coach", "Historique", "Reouvrir", "history: arrayUnion"])
    && includesAll(app, ["Suivi fait", "Seance rebookee", "Ajouter une seance a remettre", "seance(s) a remettre", "Relier fiche client"])
    && !app.includes("choisir Gere, Rebooke ou Absence coach")
    && includesAll(app, ["markRebookingCoachAbsence", "coachAbsenceReason", "statusNote"])
    && includesAll(app, ["Vacances / absence coach", "rebookingAbsenceFlow", "markRebookingAbsenceRange", "absenceStartDate", "absenceEndDate", "rebooking.coach_absence_range"]),
  "Le module rebooking doit garder les statuts, l'historique, la reouverture et un flux vacances/absence."
);

check(
  "rebooking oriente seances a remettre",
  !app.includes('filterButton("rebooking", "to_confirm", "A confirmer"')
    && app.includes("function rebookingHasWeakClientLink")
    && app.includes("Rebooke, ajuste ou ferme selon le suivi reel.")
    && app.includes("function renderRebookingOperationalSummary")
    && app.includes("rebooking-summary-strip")
    && app.includes("Details et historique")
    && app.includes("function completeRebookingWithNote")
    && app.includes("Note optionnelle")
    && styles.includes(".link-title.static-title")
    && styles.includes(".rebooking-card"),
  "Rebooking doit parler en seances a remettre, isoler les liens clients fragiles, rester compact et garder une note de fermeture."
);

check(
  "rebooking carte coach sans surcharge",
  includesAll(app, [
    "const note = rebooking.statusNote || rebooking.note || \"\"",
    "function rebookingCardQuietHint",
    "openRebookingDetail",
    "renderRebookingDetailModal",
    "signaux regroupes."
  ])
    && !app.includes("rebooking-card-meta")
    && !app.includes("Lien a verifier")
    && !app.includes("Verifier le client seulement si le nom semble douteux.")
    && !app.includes("Regroupe ${groupedCount} signaux")
    && !app.includes("${renderRebookingCardGuidance(rebooking)}")
    && !app.includes("renderRebookingDetails(rebooking, detailRows)")
    && !app.includes("Action: s'assurer que le client recupere la seance payee")
    && !app.includes("Historique: ce statut est protege")
    && !app.includes("A faire: rebooker la seance ou confirmer que le suivi est regle."),
  "Les cartes rebooking doivent rester des actions courtes: les explications et diagnostics ne doivent pas se repeter sur chaque item."
);

check(
  "rebooking actions secondaires repliees",
  includesAll(app, [
    "card-action-menu",
    "Autres actions",
    "Marquer remise",
    "Relier fiche client",
    "Absence coach",
    "Details et historique"
  ])
    && includesAll(styles, [".card-action-menu", ".card-action-menu summary", ".rebooking-guidance summary"]),
  "Les cartes rebooking doivent garder les decisions principales visibles et replier les actions secondaires."
);

check(
  "rebooking compact et ajustable",
  includesAll(app, [
    "function adjustRebookingSessions",
    "adjustRebookingSessions",
    "Seances ajustees",
    "rebooking.sessions_adjusted",
    "manualAdjustmentAt",
    "previousSessionsToRebook",
    "Ajuster",
    "rebooking-card-details",
    "Details et historique"
  ])
    && includesAll(styles, [".rebooking-main-line", ".rebooking-card-details", ".compact-note"]),
  "La vue coach doit rester compacte et permettre d'ajuster manuellement le nombre de seances a remettre."
);

check(
  "rebooking reliable a une fiche client",
  includesAll(app, [
    "openRebookingLinkClient",
    "renderRebookingLinkClientModal",
    "rebookingLinkClient",
    "function linkRebookingToClient",
    "Client relie",
    "rebooking.client_linked",
    "manuallyLinkedAt",
    "manuallyLinkedBy",
    'matchMethod: "manual_client"',
    "Relier fiche client"
  ]),
  "Un coach doit pouvoir relier un rebooking fragile a une fiche client sans modifier la source originale."
);

check(
  "rebooking sans etape confirmer client",
  !app.includes("confirmRebookingClient")
    && !app.includes("Confirmer client")
    && !app.includes("rebooking.client_confirmed")
    && !app.includes("Lien a verifier")
    && includesAll(app, [
      "rebookingHasWeakClientLink",
      "Marquer remise",
      "Suivi fait",
      "Ajuster",
      "Relier fiche client"
    ]),
  "Un lien client fragile doit rester un indice, pas une etape de workflow qui bloque le coach."
);

check(
  "diagnostic rebooking source protegee",
  app.includes("function renderRebookingImportDiagnostic(items)")
    && app.includes("isInfoAdmin()")
    && app.includes("function rebookingCoachWarning")
    && app.includes("Fiche client a confirmer")
    && app.includes("<summary>Diagnostic source rebooking</summary>")
    && /isInfoAdmin\(\) \? renderRebookingImportDiagnostic\((items|rawItems)\) : ""/.test(app)
    && app.search(/isInfoAdmin\(\) \? renderRebookingImportDiagnostic\((items|rawItems)\) : ""/) < app.indexOf("function renderRebookingCard")
    && includesAll(app, [
      "Source rebooking",
      "Taches rebooking",
      "Telephones source",
      "A traiter",
      "A confirmer",
      "Non relies client",
      "Statuts proteges",
      "Action recommandee",
      "Voir origine et lien client",
      "Lien client",
      "SRC_Rebookings_SemiPrive",
      "hors fichiers publics"
    ])
    && app.includes("function rebookingCoachNextStep")
    && app.includes("renderRebookingSourceBreakdown")
    && app.includes("renderRebookingDetailModal")
    && includesAll(functions, [
      "function rebookingImportDiagnostics",
      "sourceRowsMatched",
      "sourceRowsWithPhone",
      "sourceRowsWithoutPhone",
      "byMatchMethod",
      "protectedStatusKept",
      "importedRebookings"
    ])
    && includesAll(styles, [".rebooking-diagnostic", ".rebooking-guidance", ".rebooking-source-details"]),
  "Rebooking doit expliquer la source aux admins sans publier les liens Apps Script proteges ni polluer la carte coach."
);

check(
  "rebooking manuel pour seances oubliees",
  includesAll(app, [
    'name="clientName"',
    "Selectionne un client ou entre un nom manuel.",
    'source: "firebase_app_manual"',
    'matchMethod: client ? "manual_client" : "manual_unmatched"',
    "manuel, fiche client",
    "manuel, a confirmer"
  ]),
  "Le coach doit pouvoir ajouter une seance a remettre meme si elle n'existe pas encore dans la source rebooking."
);

check(
  "liens rebooking avec token exclus des assets publics",
  !/script\.google\.com\/macros\/s\/[^"'`\s<>]+[?&]token=/i.test(app + styles + index)
    && !(app + styles + index).includes("AKfycbyEbzQqx2lEoXge3wFvD0wjn0oAplj3fISXE-3jWR-sXHWXJKQ_FyNbbxaiwk6hrB9e5A")
    && app.includes("Les liens Apps Script avec token restent hors fichiers publics.")
    && app.includes("SRC_Rebookings_SemiPrive"),
  "Le dashboard peut diagnostiquer la source rebooking sans publier les URLs Apps Script protegees."
);

check(
  "performance periode globale",
  includesAll(app, ["7 jours", "30 jours", "60 jours", "Ce mois-ci", "Mois dernier", "6 mois", "12 mois"])
    && includesAll(app, ["Clients perdus", "Nouveaux clients", "Check-ups CSM", "Impacts confirmes"])
    && includesAll(app, ["openPerformanceDetail", "performanceDetailData", "renderPerformanceDetailModal"]),
  "Performance doit conserver le filtre global et les quatre axes de pilotage."
);

check(
  "pilotage rencontres coach",
  includesAll(app, [
    "renderPilotageObjectiveBlock",
    "renderPilotageWeeklyScorecard",
    "renderPilotageDiscussionBoard",
    "renderPilotageMeetingNotes",
    "pilotageDiscussionItems",
    "pilotageMeetingNotes",
    "openPilotageItem",
    "openPilotageNote",
    "createMissionFromPilotageItem",
    "Preparer rencontre hebdo",
    "Scorecard - les chiffres qui menent",
    "IDS - Identify, Discuss, Solve",
    "Ajouter un point",
    "Créer mission"
  ])
    && includesAll(styles, [".pilotage-section", ".pilotage-agenda", ".pilotage-scorecard-grid", ".pilotage-template", ".pilotage-item", ".pilotage-note"])
    && dataModel.includes("pilotageDiscussionItems[]")
    && dataModel.includes("pilotageMeetingNotes[]"),
  "Pilotage doit contenir l'objectif, les points a discuter, les notes de rencontre et la conversion en mission."
);

check(
  "performance check-ups par date metier seulement",
  app.includes('periodFiltered(state.data.checkups, "checkupDate", { fallbackCreatedAt: false })')
    && app.includes("fallbackCreatedAt = options.fallbackCreatedAt !== false")
    && app.includes("dateValue(b.checkupDate) - dateValue(a.checkupDate)"),
  "Les check-ups CSM doivent etre filtres par checkupDate, pas par createdAt d'import."
);

check(
  "impacts gerables",
  includesAll(app, ["openImpactForm", "editImpact", "confirmImpact", "cancelImpact", "deleteImpact"])
    && includesAll(app, ["saveImpact", "updateImpactStatus", "impactStatusOptions", "impact.deleted"])
    && app.includes('status !== "deleted"'),
  "Les impacts doivent pouvoir etre ajoutes, modifies, confirmes, annules et retires sans disparaitre sans trace."
);

check(
  "alumni cycle complet",
  includesAll(app, ["editAlumni", "markAlumniToWork", "markAlumniContacted", "markAlumniReactivated", "markAlumniDoNotContact", "archiveAlumni"])
    && includesAll(app, ["saveAlumni", "updateAlumniStatus", "alumniStatusOptions", "alumni.archived", "reactivateAlumniAsClient"])
    && includesAll(app, ["A travailler", "Contactes", "Ne pas contacter", "Reactives", "Archives"]),
  "Alumni doit permettre corriger, classer, revenir en arriere, reactiver et archiver sans passer par Performance."
);

check(
  "alumni pilotable par le coach",
  includesAll(app, ["alumni-summary", "Relances dues", "Missions alumni", "Avec coach"])
    && includesAll(app, ["linked-mini-list", "followupDue", "alumniId"])
    && includesAll(app, ["coachRxId: coach?.coachRxId", "coachName: coach?.name", "lastNameSort: lastNameSort(data.name)"])
    && includesAll(styles, [".alumni-summary", ".alumni-guidance", ".linked-mini-list", ".inline-alert"]),
  "Alumni doit donner au coach une lecture rapide des relances, missions ouvertes et coach responsable, pas seulement une liste brute."
);

check(
  "alumni vers client et transfert coach",
  includesAll(app, ["Ramener dans Clients", "Ramener client", "alumni.reactivated_to_client", "firebase_alumni_reactivated"])
    && includesAll(app, ["transferAlumniRelatedRecords", "firebase_dashboard_coach", "Coach responsable"])
    && rules.includes("function transfersOwnDocumentToPilotCoach()")
    && rules.includes("function transfersRelatedDocumentToPilotCoach()")
    && rules.includes("function isPilotCoachId(coachField)"),
  "Un alumni doit pouvoir redevenir client, et un coach doit pouvoir transferer ses clients/alumni vers un coach pilote."
);

check(
  "client vers alumni depuis fiche client",
  includesAll(app, ["moveClientToAlumni", "Passer en Alumni", "client.moved_to_alumni", "firebase_client_to_alumni"])
    && includesAll(app, ['status: "alumni"', "alumniId", 'sourceClientId: client.id'])
    && app.includes('"alumni", "do_not_contact", "import_stale"'),
  "Un coach doit pouvoir sortir un client actif vers Alumni sans effacer son historique ni le laisser dans le portefeuille actif."
);

check(
  "actions journalisees",
  app.includes('collection(db, "actionLogs")') && countMatches(app, /logAction\s*\(/g) >= 8,
  "Les actions coach importantes doivent rester journalisees."
);

check(
  "actions formulaires filtres onglets modales couverts",
  actionsVerifier.includes("declaredActions")
    && actionsVerifier.includes("declaredForms")
    && actionsVerifier.includes("declaredFilters")
    && actionsVerifier.includes("declaredTabs")
    && actionsVerifier.includes("openedModals")
    && actionsVerifier.includes("missingFormHandlers")
    && actionsVerifier.includes("missingFilterHandler")
    && actionsVerifier.includes("missingRenderedTabs")
    && actionsVerifier.includes("missingRenderedModals"),
  "Le pipeline doit detecter les boutons, formulaires, filtres, onglets ou modales visibles sans gestionnaire ou rendu."
);

check(
  "contrat firebase deployable",
  validationScript.includes("verify-firebase-deploy-contract.cjs")
    && deployContractVerifier.includes("backendExports")
    && deployContractVerifier.includes("frontendCalls")
    && deployContractVerifier.includes("GHL_PRIVATE_TOKEN")
    && deployContractVerifier.includes("scheduledDashboardSync"),
  "Le pipeline doit verifier que Hosting, Functions, Firestore, secrets et appels frontend restent alignes avant publication."
);

check(
  "scripts de publication couverts",
  validationScript.includes("verify-deploy-scripts.cjs")
    && deployScriptsVerifier.includes("complete deploy runs validation first")
    && deployScriptsVerifier.includes("complete deploy covers hosting functions firestore")
    && deployScriptsVerifier.includes("login helpers exist for interactive and ci"),
  "Le pipeline doit proteger les scripts de publication utilises par Michael."
);

check(
  "smoke test hosting local",
  validationScript.includes("verify-hosting-smoke.cjs")
    && hostingSmokeVerifier.includes("spa fallback returns index")
    && hostingSmokeVerifier.includes("app js contains firebase boot")
    && hostingSmokeVerifier.includes("public files avoid obvious secrets"),
  "Le pipeline doit verifier que les assets publics du Hosting se chargent localement avant publication."
);

check(
  "rendu groupe Firestore",
  app.includes("renderQueued")
    && app.includes("function scheduleRender()")
    && app.includes("window.requestAnimationFrame")
    && countMatches(app, /scheduleRender\(\);/g) >= 3,
  "Les abonnements Firestore doivent grouper les rendus pour eviter les reconstructions inutiles."
);

check(
  "sync continuee traçable",
  functions.includes("exports.scheduledDashboardSync = onSchedule")
    && functions.includes('schedule: "every 6 hours"')
    && countMatches(functions, /runDashboardSheetsSync\(/g) >= 3
    && includesAll(functions, ["triggeredBy", "startedAt", "finishedAt", "manual_admin", "scheduled"])
    && includesAll(app, ["syncTriggerLabel", "Declencheur"]),
  "La sync manuelle et planifiee doivent utiliser le meme moteur et journaliser leur declencheur."
);

check(
  "diagnostic synchronisation",
  includesAll(app, ["Synchroniser ce coach", "Sync tous", "Sans telephone", "Audit du lien coach", "Voir entetes detectees"])
    && includesAll(app, ["Donnees possiblement a rafraichir", "Donnees recemment synchronisees"])
    && includesAll(app, ["renderDataQualitySummary", "Qualite des donnees pour ce coach"])
    && !app.includes("Audit du matching coach")
    && !app.includes("Matching par telephone utilisable.")
    && styles.includes(".data-quality-summary")
    && includesAll(functions, ["clientsMissingPhone", "sourceHeaders", "coachSyncStatus", "syncRuns", "CORE_Clients_Manual", "Formulaire Checkup"]),
  "Le dashboard doit expliquer les coachs vides et les imports incomplets."
);

check(
  "diagnostic prochaine action",
  app.includes("function syncNextStep(context)")
    && includesAll(app, [
      "Prochaine action recommandee",
      "les lignes existent mais ne sont pas reconnues",
      "aucune fiche client exploitable",
      "l'envoi questionnaire et le matching GHL dependent du telephone"
    ])
    && styles.includes(".sync-next-step"),
  "Le diagnostic doit traduire les chiffres de sync en prochaine action concrete."
);

check(
  "audit live coach par coach actionnable",
  auditLiveFirestore.includes("function buildCoachDiagnostic")
    && auditLiveFirestore.includes("likelyCauses")
    && auditLiveFirestore.includes("recommendedActions")
    && auditLiveFirestore.includes("missingPhones")
    && auditLiveFirestore.includes("questionnaireProcessing")
    && auditLiveFirestore.includes("rebookingMatchMethods")
    && auditLiveFirestore.includes("TASKS_Current")
    && auditLiveFirestore.includes("Aucun envoi questionnaire journalise")
    && auditLiveFirestore.includes("samplesNeedingReview"),
  "L'audit Firestore live doit produire un diagnostic coach par coach avec causes probables et actions recommandees."
);

check(
  "sources de verite visibles",
  includesAll(app, ["Sources de verite", "Base operationnelle", "Ponts d'import", "Backup / audit / source temporaire", "Telephone et communication", "Contexte local"])
    && includesAll(app, ["Firestore", "Apps Script / Bob", "Google Sheets", "CoachRx", "GoHighLevel", "Manuel coach"])
    && includesAll(app, ["sourceTruthRows", "Lecture du dashboard", "Sources vivantes", "Sheets restants", "Champs manuels", "Conflits", "Registre des sources"])
    && includesAll(styles, [".source-truth-table", ".source-truth-row", "grid-template-columns: minmax(130px, 0.7fr)", ".source-truth-row small"])
    && includesAll(app, ["Activation des sources", "Pret local, attend pont live", "Source telephone a confirmer", "Parite legacy avant write", "preview", "write pilote"]),
  "Le Guide doit expliquer Firestore comme base operationnelle, Sheets comme backup/source temporaire, et la prochaine activation source par source."
);

check(
  "validation pilote dans le guide",
  app.includes("function renderPilotValidation()")
    && app.includes("function renderPilotCoachChecklist()")
    && includesAll(app, [
      "Checklist pilote coach",
      "Pilote terrain",
      "Validation pilote",
      "Etat reel du coach selectionne",
      "Clients actifs",
      "Relances questionnaire",
      "Rebookings ouverts",
      "Parcours de validation recommande",
      "Marc-Andre ou Iheb"
    ])
    && includesAll(app, [
      "questionnaireResponsesToRead",
      "questionnaireSendsWaitingForResponse",
      "pilotValidationBlockers"
    ])
    && styles.includes(".pilot-validation")
    && styles.includes(".pilot-checklist-grid")
    && styles.includes(".pilot-steps"),
  "Le Guide doit donner une boussole de validation pilote avec compteurs reels et parcours de test."
);

check(
  "acceptation terrain 5 etoiles",
  includesAll(app, [
    "function renderPilotAcceptance()",
    "function renderPilotAcceptanceAdmin()",
    "function savePilotAcceptance(data = {})",
    "Validation terrain 5/5",
    "Acceptation terrain 5/5",
    'data-form="pilotAcceptance"',
    'collection(db, "pilotAcceptances")',
    'where("userId", "==", state.user.uid)',
    'checkVoicePlayback',
    'checkManualClient',
    'checkQuestionnaireDelivery',
    'checkHighVolumeRebooking',
    'function isCurrentPilotAcceptance(record)',
    'records.filter(isCurrentPilotAcceptance)',
    'Retest requis'
  ])
    && includesAll(rules, [
      "function validPilotAcceptancePayload()",
      "match /pilotAcceptances/{acceptanceId}",
      "resource.data.userId == request.auth.uid",
      "request.resource.data.coachId == coachId()",
      "request.resource.data.validatedAt == request.time",
      "request.resource.data.checkVoicePlayback is bool",
      "request.resource.data.checkHighVolumeRebooking is bool"
    ])
    && includesAll(auditLiveFirestore, [
      'collectionDocs(token, "pilotAcceptances"',
      "function buildPilotAcceptanceEvidence",
      "terrainAcceptance",
      "terrainTargetVersion",
      "staleRecordCount"
    ])
    && includesAll(styles, [
      ".pilot-acceptance",
      ".pilot-acceptance-checks",
      ".pilot-acceptance-admin-row",
      ".pilot-acceptance-environment"
    ]),
  "Les coachs doivent pouvoir consigner leur validation reelle par appareil, tandis que l'admin voit uniquement le resume prive."
);

check(
  "vue admin supervision equipe",
  app.includes("function renderAdmin()")
    && app.includes("Admin equipe")
    && app.includes("Compte admin: info@crossfitstbasilelegrand.com")
    && app.includes("renderPilotCoachMatrix()")
    && app.includes("renderSyncRequestDiagnostics()")
    && app.includes("renderSourceActivationRoadmap()")
    && app.includes('state.tab === "admin" && isInfoAdmin()'),
  "Le compte info/admin doit avoir une vue de supervision separee pour l'equipe, les sources et les diagnostics."
);

check(
  "admin centre de commande actionnable",
  includesAll(app, ["renderAdminCommandCenter", "Priorites equipe", "adminCoachPriority", "renderAdminPriorityRow", "renderAdminDeepDiagnostics"])
    && includesAll(app, ["Coachs prets", "Bloquants", "Sync recente", "Telephones a completer", "Portefeuille vide", "Voir"])
    && includesAll(styles, [".admin-command-center", ".admin-command-metrics", ".admin-priority-row", ".admin-deep-diagnostics"])
    && app.includes("renderAdminSelectedCoachSummary")
    && app.includes("renderCoachActionPlan()"),
  "Admin doit ouvrir sur les priorites equipe et le coach selectionne, puis garder les diagnostics detailles replis."
);

check(
  "admin file de nettoyage avant pilote",
  includesAll(app, [
    "renderAdminCleanupQueue",
    "Nettoyage avant pilote",
    "Telephones manquants",
    "Rebookings a relier",
    "Questionnaires a valider",
    "openClientPhoneFix",
    "openRebookingLinkClient",
    "uniqueById"
  ])
    && includesAll(styles, [".admin-cleanup-queue", ".admin-cleanup-grid", ".admin-cleanup-column", ".admin-cleanup-item"])
    && app.includes("renderAdminCleanupQueue({ missingPhones, openRebookings, questionnaireToRead, questionnaireToValidate })"),
  "Admin doit avoir une file courte de corrections terrain avant pilote, separee des diagnostics techniques."
);

check(
  "plan action coach dans le guide",
  app.includes("function renderCoachActionPlan()")
    && app.includes("function coachActionPlanItems(")
    && includesAll(app, [
      "Plan d'action du coach selectionne",
      "Ce bloc transforme les diagnostics en choses a verifier ou corriger maintenant.",
      "A corriger avant demo",
      "Audit recommande",
      "TASKS_Current",
      "Aucun envoi journalise",
      "telephone est la cle questionnaire/GHL"
    ])
    && includesAll(styles, [
      ".action-plan-grid",
      ".action-plan-item",
      ".action-plan-item.critical",
      ".action-plan-item.warning"
    ]),
  "Le Guide doit transformer les diagnostics du coach selectionne en actions concretes et lisibles."
);

check(
  "matrice pilotes dans le guide",
  app.includes("function renderPilotCoachMatrix()")
    && app.includes("function pilotCoachMatrixRow(coach, context)")
    && includesAll(app, [
      "Etat des coachs pilotes",
      "Matrice sync",
      "Derniere sync",
      "Sans tel.",
      "Prochaine action",
      "Lancer Sync tous ou Synchroniser ce coach."
    ])
    && includesAll(app, [
      "syncContextForCoach(coach.id)",
      "clientsImported",
      "questionnaireResponsesImported",
      "rebookingsImported",
      "checkupsImported",
      "impactsImported"
    ])
    && styles.includes(".pilot-matrix")
    && styles.includes(".pilot-matrix-scroll")
    && styles.includes(".count-positive"),
  "Le Guide doit permettre de verifier rapidement l'etat de sync des sept coachs pilotes."
);

check(
  "contrat sources et conflits documente",
  includesAll(syncArchitecture, [
    "Contrat de source de verite et conflits",
    "Firestore est la source operationnelle",
    "les champs manuels coach gagnent sur les imports",
    "une valeur vide venant d'une source externe ne remplace jamais",
    "Fin membership",
    "Recurrence prevue dans Kilo",
    "Rebooking",
    "Journal d'action"
  ])
    && includesAll(dataModel, [
      "Firestore est la base operationnelle",
      "Les champs manuels coach gagnent toujours sur les imports",
      "manualMembershipEndDate",
      "kiloPlannedRecurrenceEndDate",
      "Les imports Google Sheets ne doivent pas ecraser un champ utile par une valeur vide"
    ]),
  "Le projet doit documenter quelle source gagne avant de multiplier les syncs."
);

check(
  "contraste et hover",
  styles.includes(".card:hover .link-title") && styles.includes("--hover") && styles.includes("--hover-soft") && styles.includes("var(--red)") && styles.includes("#3f4b58"),
  "Les zones cliquables et textes secondaires doivent rester lisibles."
);

check(
  "actions de cartes moins bruyantes",
  includesAll(styles, [".card-actions .primary", "background: #fff", "border-color: #f0b8ba", ".card-actions .primary:hover", "background: var(--red)"])
    && styles.indexOf(".card-actions .primary") > styles.indexOf(".card-actions"),
  "Les listes de To-do/Rebooking/Questionnaires doivent garder des actions visibles sans transformer chaque carte en gros CTA rouge."
);

check(
  "responsive desktop mobile",
  styles.includes("@media (max-width: 980px)")
    && styles.includes("@media (max-width: 560px)")
    && styles.includes(".shell {\n    grid-template-columns: 220px minmax(0, 1fr);")
    && styles.includes(".side {\n    position: sticky;")
    && styles.includes(".shell {\n    grid-template-columns: 1fr;")
    && styles.includes(".side {\n    display: none;")
    && styles.includes(".mobile-app-header")
    && styles.includes(".mobile-bottom-nav")
    && styles.includes(".main {\n    padding: 22px 16px 58px;")
    && styles.includes(".main {\n    padding: 86px 12px 128px;")
    && styles.includes(".card {\n    grid-template-columns: 1fr;")
    && styles.includes(".modal-actions {\n    display: grid;"),
  "La tablette doit garder une navigation laterale compacte; le telephone utilise l'en-tete et la navigation fixes sans casser cartes, grilles ou modales."
);

check(
  "aucun secret GHL public evident",
  !/GHL_PRIVATE_TOKEN|services\.leadconnectorhq\.com|Bearer\s+[A-Za-z0-9._-]+|token=/i.test(app + styles + index),
  "Les secrets et tokens GHL ne doivent pas etre dans les fichiers publics."
);

check(
  "functions privees GHL",
  functions.includes('defineSecret("GHL_PRIVATE_TOKEN")') && functions.includes("QUESTIONNAIRE_TAG") && functions.includes("dashboardcoach"),
  "L'envoi questionnaire doit rester cote Cloud Function avec secret."
);

check(
  "matching GHL strict par telephone",
  functions.includes("function exactGhlContactByPhone")
    && functions.includes("function ghlContactPhones")
    && functions.includes("exactGhlContactByPhone(contacts, phoneNormalized)")
    && !functions.includes("if (contacts[0]?.id) return contacts[0]"),
  "L'envoi questionnaire ne doit taguer qu'un contact GHL dont le telephone normalise matche exactement."
);

check(
  "envoi questionnaire trace avant appel GHL",
  app.includes('source: "dashboard_questionnaire_send_click"')
    && app.includes('deliveryStatus: "firestore_queue_pending"')
    && app.includes('logAction("questionnaire.send_queued"')
    && app.includes("questionnaireSendActionHint")
    && app.includes("Verifier que le contact existe dans GHL avec exactement ce telephone.")
    && app.includes("secret serveur GHL")
    && functions.includes('document: "questionnaireSends/{sendId}"')
    && functions.includes("processQuestionnaireSendFromQueue")
    && functions.includes('deliveryStatus: "ghl_pending"')
    && functions.includes("request.data?.sendId")
    && functions.includes("Cette tentative questionnaire ne correspond pas au client.")
    && functions.includes("await sendRef.set(baseAttempt, { merge: true })"),
  "Chaque clic d'envoi doit creer une trace Firestore visible, meme si Firebase Functions ou GHL echoue."
);

check(
  "regles transfert coach borne aux pilotes",
  rules.includes("function isPilotCoachId(coachField)")
    && rules.includes("function isPilotTeamUser()")
    && rules.includes("function canReadPilotCoachDoc(coachField)")
    && rules.includes("function canCreatePilotCoachDoc(coachField)")
    && rules.includes("function keepsPilotCoach()")
    && rules.includes("function transfersOwnDocumentToPilotCoach()")
    && rules.includes("function transfersRelatedDocumentToPilotCoach()")
    && countMatches(rules, /transfersRelatedDocumentToPilotCoach/g) >= 7,
  "Un coach peut transferer un document qu'il possede seulement vers un coach pilote connu; les documents lies ont un patch de transfert limite."
);

check(
  "lecture questionnaire permise au coach",
  app.includes('data-action="markResponseRead"')
    && app.includes('patchEntity("questionnaireResponses"')
    && app.includes("readByUid")
    && rules.includes("function coachReadsQuestionnaireResponse()")
    && rules.includes("allow update: if coachReadsQuestionnaireResponse();")
    && rules.includes("request.resource.data.processingStatus == 'read'")
    && rules.includes("'readByEmail'")
    && rules.includes("affectedKeys().hasOnly"),
  "Un coach proprietaire doit pouvoir marquer une reponse questionnaire comme lue sans modifier son contenu."
);

check(
  "liaison questionnaire client bornee",
  app.includes('data-form="questionnaireLinkClient"')
    && app.includes('processingStatus: "to_read"')
    && app.includes("matchedManuallyByEmail")
    && rules.includes("function coachLinksQuestionnaireResponseToClient()")
    && rules.includes("allow update: if coachLinksQuestionnaireResponseToClient();")
    && rules.includes("'manualMatchNote'")
    && rules.includes("request.resource.data.processingStatus == 'to_read'")
    && rules.includes("request.resource.data.clientId != ''"),
  "Un coach pilote doit pouvoir relier une reponse non matchee a un client par patch limite, sans modifier le contenu de la reponse."
);

check(
  "permissions coach pour actions visibles",
  firestoreCoverageVerifier.includes("coach visible actions have matching write rules")
    && firestoreCoverageVerifier.includes("coach action logs append only")
    && includesAll(rules, [
      "match /tasks/{taskId}",
      "match /clients/{clientId}",
      "match /rebookings/{rebookingId}",
      "match /impacts/{impactId}",
      "match /alumni/{alumniId}",
      "match /actionLogs/{logId}"
    ])
    && includesAll(app, [
      "createManualTask",
      "createClient",
      "createRebooking",
      "patchRebooking",
      "saveImpact",
      "saveAlumni",
      "logAction"
    ]),
  "Les boutons visibles du coach doivent pouvoir ecrire leurs donnees Firestore, et le journal d'actions doit rester non modifiable."
);

check(
  "barre de commandes hebdomadaire To-do",
  includesAll(app, [
    "label: \"actions\"",
    "label: \"rebooking\"",
    "label: \"impacts\"",
    "label: \"check-ups\"",
    "label: \"a lire\"",
    "questionnaireResponsesUnread",
    "action: \"questionnaires\", filter: \"to_read\"",
    "weeklyImpacts",
    "weeklyCheckups",
    "function currentWeekFiltered",
    "function renderWeeklyImpactsModal",
    "function renderWeeklyCheckupsModal",
    "Ajouter un impact",
    "Ouvrir le CSM"
  ])
    && includesAll(styles, [
      ".dashboard-stats",
      "grid-template-columns: repeat(5, minmax(0, 1fr))",
      ".weekly-command-toolbar"
    ])
    && !dashboardStatsSurface.includes('label: "urgent"')
    && !dashboardStatsSurface.includes('filter: "urgent"'),
  "Les cinq chiffres du haut doivent etre de vraies commandes compactes vers To-do, Rebooking, Impacts, Check-ups et reponses questionnaire a lire."
);

check(
  "notes coach non regroupees sans client",
  app.includes('function todoClientGroupKey(task)')
    && app.includes('if (!task.clientId) return "";')
    && app.includes('return `id:${task.clientId}`;')
    && !app.includes('return nameKey ? `name:${nameKey}` : "";'),
  "Une note coach sans clientId doit rester individuelle; seuls les dossiers relies a une vraie fiche client peuvent etre regroupes."
);

check(
  "mission rapide sans rebooking et recuperation interactions",
  app.includes('if (!rebooking || typeof rebooking !== "object") return [];')
    && app.includes('const rebookingDetails = rebooking ? rebookingCancellationDateSummary(rebooking, 4) : "";')
    && app.includes("function recoverDashboardRender(error)")
    && app.includes('document.querySelectorAll(".modal-backdrop, .mobile-menu-backdrop")')
    && app.includes("function eventTargetElement(event)")
    && styles.includes("details:not([open]) > div")
    && styles.includes("pointer-events: none"),
  "La mission rapide doit s'ouvrir sans dossier rebooking et une erreur de rendu ne doit jamais bloquer toute l'interface."
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
