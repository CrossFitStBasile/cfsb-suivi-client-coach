import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import {
  entityVersionToken,
  effectiveWorkflowStatus,
  hasVersionConflict,
  isArchivedTeamMember,
  isHistoricalManagementTask,
  isOpenManagementTask,
  roadmapActionDefinition,
  roadmapCreatesTask,
  submissionBucket,
  teamMemberBucket
} from "./workflow.js";
import {
  metricStatus,
  pilotageSummary,
  quarterId,
  shiftQuarterId,
  shiftWeekIso,
  sortPilotageIssues,
  startOfWeekIso,
  targetLabel
} from "./pilotage.js";
import { dashboardHealthReport } from "./health.js";
import { personNameKey } from "./form-model.js";
import {
  DEVELOPMENT_ASSIGNMENT_STATUSES,
  DEVELOPMENT_PROGRAM_TYPES,
  DEVELOPMENT_STEP_STATUSES,
  activeDevelopmentAssignments,
  canCompleteDevelopmentStep,
  developmentAssignmentProgress,
  developmentAssignmentsForMember,
  developmentProgramSnapshot,
  developmentStepState,
  effectiveDevelopmentAssignmentStatus,
  latestPublishedPrograms,
  nextDevelopmentVersion,
  normalizeDevelopmentStep,
  sortDevelopmentPrograms,
  validateDevelopmentProgram
} from "./development.js";
import {
  WORKING_GENIUS_BUCKETS,
  WORKING_GENIUS_TYPES,
  validateWorkingGeniusProfile,
  workingGeniusProfileStatus,
  workingGeniusTeamMap,
  workingGeniusTeamSummary,
  workingGeniusType
} from "./working-genius.js";
import {
  STRATEGY_DECISION_STATUS_OPTIONS,
  STRATEGY_STATUS_OPTIONS,
  cloneStrategyBaseline,
  normalizeStrategyList,
  sortStrategyDecisions,
  strategyCoverage,
  validateStrategyDecision,
  validateStrategyProfile
} from "./strategy.js";
import {
  OWNER_BACKUP_COLLECTIONS,
  buildOwnerBackup,
  ownerBackupFileName,
  sha256Hex,
  validateOwnerBackup
} from "./backup.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
const URL_PARAMS = new URLSearchParams(window.location.search);
const INITIAL_MEMBER_ID = URL_PARAMS.get("member") || "";
const LOCAL_DEVELOPMENT_PREVIEW = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) && URL_PARAMS.get("preview") === "development";

const STATUS_OPTIONS = [
  ["to_read", "A lire"],
  ["message_to_send", "Lue / rencontre a faire"],
  ["meeting_planned", "Lue / rencontre a faire"],
  ["action_required", "Suivi a faire"],
  ["meeting_done", "Terminee"],
  ["ready_to_archive", "Terminee"],
  ["archived", "Archivee"]
];
const OWNER_OPTIONS = ["Michael", "Gabriel", "Michael + Gabriel"];
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS);
const WORKFLOW_STATUS_OPTIONS = STATUS_OPTIONS.filter(([id]) => ["to_read", "meeting_planned", "action_required"].includes(id));
const TASK_PRIORITY_OPTIONS = [
  ["P1", "Urgent"],
  ["P2", "Normal"],
  ["P3", "Faible"]
];
const TASK_KIND_OPTIONS = [
  ["general", "Action generale"],
  ["meeting", "Prevoir une rencontre"],
  ["followup", "Faire un suivi"],
  ["development", "Parler developpement"]
];
const TASK_STATUS_LABELS = {
  open: "Ouverte",
  completed: "Terminee",
  cancelled: "Annulee"
};
const TASK_FILTER_OPTIONS = [
  ["all", "Toutes"],
  ["urgent", "Priorite haute"],
  ["pilotage", "Pilotage"],
  ["roadmap", "Roadmaps"],
  ["career", "Parcours"],
  ["meeting", "Rencontres 1:1"],
  ["manual", "Manuelles"]
];
const CAREER_STATUS_OPTIONS = [
  ["planned", "Planifiee"],
  ["in_progress", "En cours"],
  ["blocked", "Bloquee"],
  ["completed", "Realisee"],
  ["abandoned", "Abandonnee"]
];
const CAREER_CATEGORY_OPTIONS = [
  ["role", "Evolution de role"],
  ["certification", "Certification"],
  ["skill", "Competence"],
  ["clientele", "Clientele et services"],
  ["income", "Revenus"],
  ["leadership", "Leadership"],
  ["other", "Autre"]
];
const CAREER_OWNER_OPTIONS = ["Membre", "Michael", "Gabriel", "Membre + direction"];
const CAREER_STATUS_LABELS = Object.fromEntries(CAREER_STATUS_OPTIONS);
const CAREER_CATEGORY_LABELS = Object.fromEntries(CAREER_CATEGORY_OPTIONS);
const MEETING_TEMPLATE_VERSION = "cfsb-1on1-v1";
const MEETING_FACILITATORS = ["Gabriel", "Michael"];
const MEETING_COMMITMENT_OPTIONS = [
  ["not_applicable", "Aucun engagement precedent"],
  ["kept", "Tenu"],
  ["partial", "Partiellement tenu"],
  ["not_kept", "Non tenu"]
];
const MEETING_PILLAR_OPTIONS = [
  ["", "Aucun pilier selectionne"],
  ["money", "Argent"],
  ["skill", "Competence"],
  ["relationship", "Relation"],
  ["other", "Autre"]
];
const MEETING_PILLAR_LABELS = Object.fromEntries(MEETING_PILLAR_OPTIONS);
const PORTAL_CONTRACT_VERSION = "cfsb-portal-v1";
const TEAM_PORTAL_PATH = "./portal.html";
const COACH_DASHBOARD_URL = "https://cfsb-dashboard-coach-aa9a4.web.app/";
const COACH_ID_BY_MEMBER = {
  "marc-andre-menard": "15935",
  "iheb-yahyaoui": "15928",
  "camille-proulx": "17242",
  "david-olivier": "15902",
  "gabriel-mayer-bedard": "15893",
  "hugo-lelievre": "15937",
  "raphael-samson": "15936"
};
const PILOTAGE_SECTION_OPTIONS = [
  ["meeting", "Reunion hebdo", "calendar-range"],
  ["strategy", "Strategie", "compass"],
  ["scorecard", "Indicateurs", "chart-no-axes-combined"],
  ["rocks", "Priorites 90 jours", "flag"],
  ["issues", "Enjeux", "list-tree"]
];
const PILOTAGE_METRIC_DIRECTIONS = [
  ["gte", "Au moins"],
  ["lte", "Au plus"],
  ["range", "Entre deux valeurs"],
  ["exact", "Valeur exacte"]
];
const PILOTAGE_ROCK_STATUSES = [
  ["on_track", "Sur la bonne voie"],
  ["off_track", "A risque"],
  ["done", "Terminee"]
];
const PILOTAGE_MEETING_ATTENDEES = ["Michael", "Gabriel"];
const DEVELOPMENT_PROGRAM_TYPE_LABELS = Object.fromEntries(DEVELOPMENT_PROGRAM_TYPES);
const DEVELOPMENT_ASSIGNMENT_STATUS_LABELS = Object.fromEntries(DEVELOPMENT_ASSIGNMENT_STATUSES);
const DEVELOPMENT_STEP_STATUS_LABELS = Object.fromEntries(DEVELOPMENT_STEP_STATUSES);
const WORKING_GENIUS_BUCKET_LABELS = Object.fromEntries(WORKING_GENIUS_BUCKETS);

const state = {
  user: null,
  profile: null,
  submissions: [],
  ownerNotes: {},
  teamMembers: [],
  teamMemberPrivate: {},
  memberPortalProfiles: {},
  portalInvitations: {},
  departments: [],
  forms: {},
  careerMilestones: [],
  careerUpdates: [],
  teamMeetings: [],
  memberSharedSummaries: [],
  managementTasks: [],
  pilotageMetrics: [],
  pilotageMetricEntries: [],
  pilotageRocks: [],
  pilotageIssues: [],
  pilotageMeetings: [],
  businessStrategy: null,
  strategyDecisions: [],
  developmentPrograms: [],
  developmentAssignments: [],
  workingGeniusProfiles: {},
  auditLogs: [],
  clientErrors: [],
  view: INITIAL_MEMBER_ID ? "team" : "todo",
  roadmapView: "queue",
  selectedId: "",
  selectedMemberId: "",
  initialMemberResolved: false,
  editingMemberId: "",
  memberProfileSection: "overview",
  careerEditorId: "",
  careerDraft: null,
  meetingEditorId: "",
  meetingEditorVersion: "",
  meetingSaveState: "saved",
  roadmapCompletionId: "",
  teamActionMemberId: "",
  taskEditorId: "",
  taskEditorVersion: "",
  taskConflict: null,
  taskEditorForceSave: false,
  memberEditorVersion: "",
  careerEditorVersion: "",
  roadmapCompletionVersion: "",
  memberActionView: "open",
  showArchivedCareer: false,
  taskFilter: "all",
  taskOwnerFilter: "all",
  pilotageSection: "meeting",
  pilotageWeek: startOfWeekIso(),
  pilotageQuarter: quarterId(),
  pilotageEditorType: "",
  pilotageEditorId: "",
  strategyView: "overview",
  strategyEditorType: "",
  strategyDecisionEditorId: "",
  developmentSection: "assignments",
  developmentAssignmentView: "active",
  selectedDevelopmentAssignmentId: "",
  developmentProgramEditorId: "",
  developmentProgramDraft: null,
  developmentAssignmentEditorOpen: false,
  developmentAssignmentPrefillMemberId: "",
  developmentStepEditorId: "",
  teamSearch: "",
  teamRosterView: "active",
  teamWorkspaceView: "directory",
  workingGeniusEditorMemberId: "",
  activitySearch: "",
  activityActor: "all",
  activityEntity: "all",
  filters: { search: "", role: "all", cycle: "all", status: "all" },
  unsubscribers: [],
  busy: false,
  loadError: "",
  previewMode: false
};

const appRoot = document.querySelector("#app");
const toastRoot = document.querySelector("#toast");
let toastTimer = null;
let loggingClientError = false;
let meetingAutosaveTimer = null;
let meetingAutosavePromise = null;
document.addEventListener("keydown", handleGlobalKeydown);
window.addEventListener("error", (event) => logClientError(event.error || event.message, "window_error"));
window.addEventListener("unhandledrejection", (event) => logClientError(event.reason, "unhandled_rejection"));

if (LOCAL_DEVELOPMENT_PREVIEW) {
  initializeLocalDevelopmentPreview();
} else onAuthStateChanged(auth, async (user) => {
  cleanupSubscriptions();
  state.user = user;
  state.profile = null;
  state.loadError = "";
  if (!user) {
    renderLogin();
    return;
  }

  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    if (!profileSnap.exists()) {
      renderAccessDenied("Ce compte Google est reconnu, mais aucun acces owner Roadmap n'est configure.");
      return;
    }
    state.profile = { id: profileSnap.id, ...profileSnap.data() };
    if (!state.profile.active || !["owner", "admin"].includes(state.profile.role)) {
      renderAccessDenied("Ce compte ne possede pas un acces owner actif.");
      return;
    }
    subscribeData();
    renderApp();
  } catch (error) {
    renderAccessDenied(`Impossible de verifier l'acces: ${friendlyError(error)}`);
  }
});

function initializeLocalDevelopmentPreview() {
  const steps = [
    { id: "culture", title: "Etape culture", description: "Attente validee et contexte partage.", category: "Culture CFSB", required: true, evidenceRequired: false, sortOrder: 1 },
    { id: "observation", title: "Observation terrain", description: "Observation et feedback documentes.", category: "Coaching", required: true, evidenceRequired: true, sortOrder: 2 },
    { id: "autonomy", title: "Validation autonomie", description: "Le standard est livre sans supervision directe.", category: "Coaching", required: true, evidenceRequired: false, sortOrder: 3 }
  ];
  state.user = { uid: "local-preview", displayName: "Apercu local" };
  state.profile = { role: "owner", active: true, displayName: "Apercu local" };
  state.previewMode = true;
  state.view = "development";
  state.teamMembers = [
    { id: "membre-pilote", name: "Membre pilote", displayTitle: "Role a valider", departmentId: "coaching", active: true },
    { id: "alex-pilote", name: "Alex pilote", displayTitle: "Coach pilote", departmentId: "coaching", active: true },
    { id: "sam-pilote", name: "Sam pilote", displayTitle: "Operations pilote", departmentId: "operations", active: true }
  ];
  state.workingGeniusProfiles = {
    "membre-pilote": { teamMemberId: "membre-pilote", geniuses: ["W", "I"], competencies: ["D", "G"], frustrations: ["E", "T"], status: "complete", assessmentDate: "2026-06-15", reportUrl: "https://example.com/rapport-pilote", sourceType: "official_report", sourceLabel: "Rapport officiel Working Genius" },
    "alex-pilote": { teamMemberId: "alex-pilote", geniuses: ["G", "E"], competencies: ["I"], frustrations: [], status: "partial", assessmentDate: "", reportUrl: "", sourceType: "official_report", sourceLabel: "Rapport officiel Working Genius" }
  };
  state.businessStrategy = cloneStrategyBaseline();
  state.strategyDecisions = [
    { id: "decision-pilote", decisionDate: "2026-07-15", title: "Architecture des dashboards", decision: "Garder le Dashboard Equipe et le Dashboard Coach independants.", rationale: "Permettre des mises a jour sans conflit.", ownerName: "Michael + Gabriel", impact: "Deux applications Firebase et un contrat de liens explicite.", status: "active", createdAt: "2026-07-15T12:00:00Z" }
  ];
  state.developmentPrograms = [
    { id: "programme-v1", familyId: "programme", title: "Programme pilote", description: "Structure de validation avant l'ajout de la checklist officielle.", programType: "onboarding", ownerName: "Gabriel", roleIds: [], version: 1, status: "published", steps },
    { id: "formation-draft", familyId: "formation", title: "Formation continue", description: "Brouillon sans contenu metier officiel.", programType: "training", ownerName: "Gabriel", roleIds: [], version: 1, status: "draft", steps: [{ id: "draft-step", title: "Etape a valider", category: "General", required: true, evidenceRequired: false, sortOrder: 1 }] }
  ];
  state.developmentAssignments = [
    { id: "assignment-active", ...developmentProgramSnapshot(state.developmentPrograms[0]), teamMemberId: "membre-pilote", teamMemberName: "Membre pilote", ownerName: "Gabriel", status: "in_progress", stepStates: { culture: { status: "completed", note: "Validee" }, observation: { status: "in_progress", note: "Observation en cours" } }, createdAt: "2026-07-16T12:00:00Z", updatedAt: "2026-07-16T12:00:00Z" },
    { id: "assignment-completed", ...developmentProgramSnapshot(state.developmentPrograms[0]), teamMemberId: "membre-pilote", teamMemberName: "Membre pilote", ownerName: "Gabriel", status: "completed", stepStates: Object.fromEntries(steps.map((step) => [step.id, { status: "completed" }])), createdAt: "2026-06-01T12:00:00Z", updatedAt: "2026-06-15T12:00:00Z" }
  ];
  ensureDevelopmentSelection();
  renderApp();
}

function renderLogin() {
  document.body.classList.remove("modal-open");
  appRoot.innerHTML = `
    <main class="auth-shell">
      <section class="auth-panel">
        <div class="brand-mark">CF</div>
        <p class="eyebrow">CrossFit St-Basile</p>
        <h1>Dashboard Equipe</h1>
        <p>Actions de gestion, dossiers membres, roadmaps et parcours de carriere dans le nouvel environnement Firebase.</p>
        <button class="button primary" id="loginButton" type="button">
          <i data-lucide="log-in"></i>
          Connexion Google
        </button>
        <div class="auth-note">Acces reserve a Michael et Gabriel.</div>
      </section>
    </main>
  `;
  document.querySelector("#loginButton")?.addEventListener("click", login);
  refreshIcons();
}

function renderAccessDenied(message) {
  document.body.classList.remove("modal-open");
  appRoot.innerHTML = `
    <main class="auth-shell">
      <section class="auth-panel">
        <div class="brand-mark">CF</div>
        <p class="eyebrow">Acces non disponible</p>
        <h1>Dashboard Equipe</h1>
        <p>${escapeHtml(message)}</p>
        <button class="button" id="logoutButton" type="button">
          <i data-lucide="log-out"></i>
          Changer de compte
        </button>
      </section>
    </main>
  `;
  document.querySelector("#logoutButton")?.addEventListener("click", () => signOut(auth));
  refreshIcons();
}

async function login() {
  const button = document.querySelector("#loginButton");
  if (button) button.disabled = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    showToast(`Connexion impossible: ${friendlyError(error)}`);
    if (button) button.disabled = false;
  }
}

function subscribeData() {
  cleanupSubscriptions();
  state.unsubscribers.push(onSnapshot(collection(db, "roadmapSubmissions"), (snapshot) => {
    state.submissions = snapshot.docs.map(fromDoc).sort((a, b) => dateValue(b.submittedAt) - dateValue(a.submittedAt));
    ensureSelection();
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "ownerNotes"), (snapshot) => {
    state.ownerNotes = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()]));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "teamMembers"), (snapshot) => {
    state.teamMembers = snapshot.docs.map(fromDoc).sort(sortTeamMembers);
    if (!state.initialMemberResolved) {
      state.initialMemberResolved = true;
      if (INITIAL_MEMBER_ID && state.teamMembers.some((item) => item.id === INITIAL_MEMBER_ID)) {
        state.view = "team";
        state.selectedMemberId = INITIAL_MEMBER_ID;
        state.teamRosterView = teamMemberBucket(state.teamMembers.find((item) => item.id === INITIAL_MEMBER_ID));
      }
    }
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "teamMemberPrivate"), (snapshot) => {
    state.teamMemberPrivate = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()]));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "workingGeniusProfiles"), (snapshot) => {
    state.workingGeniusProfiles = Object.fromEntries(snapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "memberPortalProfiles"), (snapshot) => {
    state.memberPortalProfiles = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()]));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "portalInvitations"), (snapshot) => {
    state.portalInvitations = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()]));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "orgDepartments"), (snapshot) => {
    state.departments = snapshot.docs.map(fromDoc).sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "roadmapForms"), (snapshot) => {
    state.forms = Object.fromEntries(snapshot.docs.map((item) => [item.data().version || item.id, item.data()]));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "careerMilestones"), (snapshot) => {
    state.careerMilestones = snapshot.docs.map(fromDoc).sort(sortCareerMilestones);
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "careerUpdates"), (snapshot) => {
    state.careerUpdates = snapshot.docs.map(fromDoc).sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "teamMeetings"), (snapshot) => {
    state.teamMeetings = snapshot.docs.map(fromDoc).sort(sortTeamMeetings);
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "memberSharedSummaries"), (snapshot) => {
    state.memberSharedSummaries = snapshot.docs.map(fromDoc).sort((a, b) => dateValue(b.meetingDate || b.publishedAt) - dateValue(a.meetingDate || a.publishedAt));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "managementTasks"), (snapshot) => {
    state.managementTasks = snapshot.docs.map(fromDoc).sort(sortManagementTasks);
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "pilotageMetrics"), (snapshot) => {
    state.pilotageMetrics = snapshot.docs.map(fromDoc).sort(sortPilotageMetrics);
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "pilotageMetricEntries"), (snapshot) => {
    state.pilotageMetricEntries = snapshot.docs.map(fromDoc);
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "pilotageRocks"), (snapshot) => {
    state.pilotageRocks = snapshot.docs.map(fromDoc).sort(sortPilotageRocks);
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "pilotageIssues"), (snapshot) => {
    state.pilotageIssues = sortPilotageIssues(snapshot.docs.map(fromDoc));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "pilotageMeetings"), (snapshot) => {
    state.pilotageMeetings = snapshot.docs.map(fromDoc).sort((a, b) => String(b.weekStart || "").localeCompare(String(a.weekStart || "")));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "businessStrategy"), (snapshot) => {
    state.businessStrategy = snapshot.docs.find((item) => item.id === "current") ? fromDoc(snapshot.docs.find((item) => item.id === "current")) : null;
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "strategyDecisions"), (snapshot) => {
    state.strategyDecisions = sortStrategyDecisions(snapshot.docs.map(fromDoc));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "developmentPrograms"), (snapshot) => {
    state.developmentPrograms = sortDevelopmentPrograms(snapshot.docs.map(fromDoc));
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "developmentAssignments"), (snapshot) => {
    state.developmentAssignments = snapshot.docs.map(fromDoc).sort((a, b) => dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt));
    ensureDevelopmentSelection();
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(250)), (snapshot) => {
    state.auditLogs = snapshot.docs.map(fromDoc);
    renderFromData();
  }, dataError));
  state.unsubscribers.push(onSnapshot(query(collection(db, "clientErrors"), orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
    state.clientErrors = snapshot.docs.map(fromDoc);
    renderFromData();
  }, dataError));
}

function cleanupSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function dataError(error) {
  state.loadError = friendlyError(error);
  logClientError(error, "firestore_subscription");
  renderFromData();
}

function renderFromData() {
  if (hasProtectedEditor()) return;
  renderApp();
}

function renderApp() {
  if (!state.user || !state.profile) return;
  if (state.taskEditorId && !state.managementTasks.some((item) => item.id === state.taskEditorId)) state.taskEditorId = "";
  const viewMeta = {
    pilotage: ["Roadmap Business CFSB", "Zone Pilotage", "La rencontre hebdomadaire, les indicateurs, les priorites et les enjeux de Michael et Gabriel."],
    todo: ["Pilotage quotidien", "A faire", "Les prochaines actions de Michael et Gabriel, rassemblees au meme endroit."],
    team: ["Dossiers longitudinaux", state.selectedMemberId ? "Dossier membre" : "Equipe", state.selectedMemberId ? "Roadmaps, actions et evolution de carriere dans un seul dossier." : "Une vue claire de chaque membre et de ce qui demande votre attention."],
    development: ["Encadrement des membres", "Developpement equipe", "Onboarding, formation continue et evaluations dans des programmes versionnes."],
    roadmaps: ["Rencontres trimestrielles", "Roadmaps", "Traiter les nouvelles reponses, preparer les rencontres et conserver l'historique."],
    activity: ["Tracabilite owner", "Activite", "Voir les changements importants et l'etat de sante du dashboard."]
  }[state.view] || ["Dashboard Equipe", "Dashboard Equipe", ""];
  appRoot.innerHTML = `
    <div class="team-command-shell">
      ${renderCommandSidebar()}
      <div class="command-main">
        <header class="command-topbar">
          <div class="mobile-brand"><span class="brand-mark">CF</span><strong>Dashboard Equipe</strong></div>
          <div class="top-actions">
            <div class="realtime">${state.previewMode ? "Apercu local sans ecriture" : "Temps reel Firestore"}</div>
            <button class="button icon-only" data-export-owner-backup type="button" title="Exporter une sauvegarde JSON" aria-label="Exporter une sauvegarde JSON"><i data-lucide="download"></i></button>
            <button class="button icon-only" id="reloadButton" type="button" title="Recharger les donnees" aria-label="Recharger les donnees"><i data-lucide="refresh-cw"></i></button>
            <button class="button icon-only" id="logoutButton" type="button" title="Deconnexion" aria-label="Deconnexion"><i data-lucide="log-out"></i></button>
          </div>
        </header>
        <main class="command-content">
          <section class="command-heading">
            <div><p class="eyebrow">${escapeHtml(viewMeta[0])}</p><h1>${escapeHtml(viewMeta[1])}</h1><p>${escapeHtml(viewMeta[2])}</p></div>
            <div class="environment-badge">${state.previewMode ? "APERCU LOCAL" : "FIREBASE · TEMPS REEL"}</div>
          </section>
          ${state.loadError ? `<div class="auth-note">${escapeHtml(state.loadError)}</div>` : ""}
          ${state.view === "pilotage" ? renderPilotageView() : state.view === "todo" ? renderTodoView() : state.view === "team" ? renderTeamView() : state.view === "development" ? renderDevelopmentView() : state.view === "roadmaps" ? renderRoadmapModule() : renderActivityView()}
        </main>
      </div>
      ${state.careerEditorId ? renderCareerEditor() : ""}
      ${state.meetingEditorId ? renderMeetingEditor() : ""}
      ${state.roadmapCompletionId ? renderRoadmapCompletionModal() : ""}
      ${state.teamActionMemberId ? renderTeamActionModal() : ""}
      ${state.taskEditorId ? renderTaskEditorModal() : ""}
      ${state.pilotageEditorType ? renderPilotageEditor() : ""}
      ${state.developmentProgramEditorId ? renderDevelopmentProgramEditor() : ""}
      ${state.developmentAssignmentEditorOpen ? renderDevelopmentAssignmentEditor() : ""}
      ${state.developmentStepEditorId ? renderDevelopmentStepEditor() : ""}
      ${state.workingGeniusEditorMemberId ? renderWorkingGeniusEditor() : ""}
      ${state.strategyEditorType ? renderStrategyEditor() : ""}
    </div>
  `;
  bindAppEvents();
  refreshIcons();
  syncModalState();
}

function renderCommandSidebar() {
  const openTasks = allOpenManagementTasks().length;
  const queueCount = state.submissions.filter((item) => submissionBucket(item) === "queue").length;
  const health = currentDataHealthReport();
  const healthAlertCategories = [health.unresolvedErrors, health.unlinkedSubmissions, health.missingDocumentMembers, health.missingTargetMetrics].filter((items) => items.length).length;
  const pilotage = currentPilotageSummary();
  const activeDevelopment = activeDevelopmentAssignments(state.developmentAssignments).length;
  return `
    <aside class="command-sidebar">
      <div class="command-brand">
        <div class="brand-mark">CF</div>
        <div><strong>Dashboard Equipe</strong><span>CrossFit St-Basile</span></div>
      </div>
      <nav class="command-nav" aria-label="Navigation principale">
        ${commandNavButton("pilotage", "gauge", "Pilotage", pilotage.openIssues + pilotage.offTrackRocks + pilotage.offTrackMetrics)}
        ${commandNavButton("todo", "list-checks", "A faire", openTasks)}
        ${commandNavButton("team", "users-round", "Equipe", state.teamMembers.filter((item) => !isArchivedTeamMember(item)).length)}
        ${commandNavButton("development", "graduation-cap", "Developpement", activeDevelopment)}
        ${commandNavButton("roadmaps", "clipboard-list", "Roadmaps", queueCount)}
        ${commandNavButton("activity", "history", "Activite", healthAlertCategories)}
      </nav>
      <div class="command-sidebar-footer">
        <span>${escapeHtml(state.profile.displayName || state.user.displayName || "Owner")}</span>
        <small>Acces owner</small>
      </div>
    </aside>
  `;
}

function commandNavButton(view, icon, label, count) {
  return `
    <button class="command-nav-button ${state.view === view ? "active" : ""}" data-view="${view}" type="button">
      <i data-lucide="${icon}"></i><span>${escapeHtml(label)}</span><strong>${count || 0}</strong>
    </button>
  `;
}

function renderDevelopmentView() {
  const active = activeDevelopmentAssignments(state.developmentAssignments);
  const completed = state.developmentAssignments.filter((assignment) => !assignment.archivedAt && effectiveDevelopmentAssignmentStatus(assignment) === "completed");
  const published = latestPublishedPrograms(state.developmentPrograms);
  const pendingSteps = active.reduce((sum, assignment) => sum + developmentAssignmentProgress(assignment).remaining, 0);
  return `
    <section class="development-toolbar panel">
      <nav class="roadmap-tabs" aria-label="Sections du developpement equipe">
        <button class="tab-button ${state.developmentSection === "assignments" ? "active" : ""}" data-development-section="assignments" type="button"><i data-lucide="list-checks"></i> Suivi <span>${active.length}</span></button>
        <button class="tab-button ${state.developmentSection === "programs" ? "active" : ""}" data-development-section="programs" type="button"><i data-lucide="library-big"></i> Programmes <span>${published.length}</span></button>
      </nav>
      <div class="development-toolbar-actions">
        ${state.developmentSection === "assignments"
          ? `<button class="button primary" id="newDevelopmentAssignment" type="button" ${published.length && state.teamMembers.some((member) => !isArchivedTeamMember(member)) ? "" : "disabled"}><i data-lucide="user-round-plus"></i> Assigner un programme</button>`
          : `<button class="button primary" id="newDevelopmentProgram" type="button"><i data-lucide="plus"></i> Nouveau programme</button>`}
      </div>
    </section>
    <section class="development-metrics">
      ${profileMetric(active.length, "Programmes actifs")}
      ${profileMetric(pendingSteps, "Etapes restantes")}
      ${profileMetric(completed.length, "Programmes termines")}
      ${profileMetric(published.length, "Programmes publies")}
    </section>
    ${state.developmentSection === "programs" ? renderDevelopmentPrograms() : renderDevelopmentAssignments()}
  `;
}

function renderDevelopmentPrograms() {
  const programs = sortDevelopmentPrograms(state.developmentPrograms);
  return `
    <section class="panel development-section-panel">
      <header class="section-heading"><div><h2>Bibliotheque de programmes</h2><p>Les versions publiees restent figees dans chaque assignation.</p></div></header>
      ${programs.length ? `<div class="development-program-grid">${programs.map(renderDevelopmentProgramCard).join("")}</div>` : `
        <div class="empty-state development-empty"><i data-lucide="library-big"></i><div><strong>Aucun programme publie</strong><span>La checklist officielle pourra etre creee ici apres sa validation.</span></div><button class="button primary" id="emptyNewDevelopmentProgram" type="button">Creer le premier programme</button></div>
      `}
    </section>
  `;
}

function renderDevelopmentProgramCard(program) {
  const statusLabel = { draft: "Brouillon", published: "Publie", superseded: "Ancienne version", archived: "Archive" }[program.status] || humanize(program.status);
  const assignments = state.developmentAssignments.filter((assignment) => assignment.programId === program.id).length;
  return `
    <article class="development-program-card ${escapeAttr(program.status || "draft")}">
      <header><span class="development-type-pill ${escapeAttr(program.programType || "training")}">${escapeHtml(DEVELOPMENT_PROGRAM_TYPE_LABELS[program.programType] || "Programme")}</span><span class="development-version">v${Number(program.version || 1)}</span></header>
      <div><h3>${escapeHtml(program.title || "Programme sans titre")}</h3><p>${escapeHtml(program.description || "Aucune description.")}</p></div>
      <dl><div><dt>Etapes</dt><dd>${(program.steps || []).length}</dd></div><div><dt>Assignations</dt><dd>${assignments}</dd></div><div><dt>Etat</dt><dd>${escapeHtml(statusLabel)}</dd></div></dl>
      <footer>
        <button class="button" data-open-development-program="${escapeAttr(program.id)}" type="button"><i data-lucide="${program.status === "draft" ? "pencil" : "eye"}"></i> ${program.status === "draft" ? "Modifier" : "Consulter"}</button>
        ${program.status === "published" ? `<button class="button" data-new-development-version="${escapeAttr(program.id)}" type="button"><i data-lucide="copy-plus"></i> Nouvelle version</button>` : ""}
      </footer>
    </article>
  `;
}

function developmentAssignmentsByView() {
  const completed = state.developmentAssignmentView === "completed";
  return state.developmentAssignments.filter((assignment) => {
    if (assignment.archivedAt) return false;
    return (effectiveDevelopmentAssignmentStatus(assignment) === "completed") === completed;
  });
}

function ensureDevelopmentSelection() {
  if (state.view !== "development" || state.developmentSection !== "assignments") return;
  const visible = developmentAssignmentsByView();
  if (!visible.some((assignment) => assignment.id === state.selectedDevelopmentAssignmentId)) {
    state.selectedDevelopmentAssignmentId = visible[0]?.id || "";
  }
}

function renderDevelopmentAssignments() {
  const assignments = developmentAssignmentsByView();
  const selected = assignments.find((assignment) => assignment.id === state.selectedDevelopmentAssignmentId) || assignments[0] || null;
  return `
    <nav class="development-assignment-tabs" aria-label="Etat des programmes assignes">
      <button class="tab-button ${state.developmentAssignmentView === "active" ? "active" : ""}" data-development-assignment-view="active" type="button">Actifs <span>${activeDevelopmentAssignments(state.developmentAssignments).length}</span></button>
      <button class="tab-button ${state.developmentAssignmentView === "completed" ? "active" : ""}" data-development-assignment-view="completed" type="button">Historique <span>${state.developmentAssignments.filter((assignment) => !assignment.archivedAt && effectiveDevelopmentAssignmentStatus(assignment) === "completed").length}</span></button>
    </nav>
    <section class="development-assignment-layout">
      <aside class="panel development-assignment-list">
        ${assignments.length ? assignments.map((assignment) => renderDevelopmentAssignmentCard(assignment, selected?.id === assignment.id)).join("") : `<div class="empty-state compact-empty"><i data-lucide="${state.developmentAssignmentView === "completed" ? "history" : "user-round-plus"}"></i><div>${state.developmentAssignmentView === "completed" ? "Aucun programme termine." : "Aucun programme actif."}</div></div>`}
      </aside>
      ${selected ? renderDevelopmentAssignmentDetail(selected) : `<section class="panel development-assignment-detail"><div class="empty-state"><i data-lucide="list-checks"></i><div>Selectionne ou assigne un programme.</div></div></section>`}
    </section>
  `;
}

function renderDevelopmentAssignmentCard(assignment, selected) {
  const progress = developmentAssignmentProgress(assignment);
  const status = effectiveDevelopmentAssignmentStatus(assignment);
  const member = state.teamMembers.find((item) => item.id === assignment.teamMemberId);
  return `
    <button class="development-assignment-card ${selected ? "active" : ""}" data-open-development-assignment="${escapeAttr(assignment.id)}" type="button">
      <span class="member-avatar">${escapeHtml(initials(member?.name || assignment.teamMemberName || "M"))}</span>
      <span><strong>${escapeHtml(member?.name || assignment.teamMemberName || "Membre")}</strong><small>${escapeHtml(assignment.programTitle || "Programme")} · v${Number(assignment.programVersion || 1)}</small><span class="development-card-progress"><i style="width:${progress.percent}%"></i></span><small>${progress.completed}/${progress.total} etapes · ${escapeHtml(DEVELOPMENT_ASSIGNMENT_STATUS_LABELS[status] || humanize(status))}</small></span>
      <i data-lucide="chevron-right"></i>
    </button>
  `;
}

function renderDevelopmentAssignmentDetail(assignment) {
  const progress = developmentAssignmentProgress(assignment);
  const status = effectiveDevelopmentAssignmentStatus(assignment);
  const member = state.teamMembers.find((item) => item.id === assignment.teamMemberId);
  const grouped = (assignment.steps || []).reduce((groups, raw, index) => {
    const step = normalizeDevelopmentStep(raw, index);
    const category = step.category || "General";
    if (!groups[category]) groups[category] = [];
    groups[category].push(step);
    return groups;
  }, {});
  return `
    <section class="panel development-assignment-detail">
      <header class="development-detail-header">
        <div><p class="eyebrow">${escapeHtml(DEVELOPMENT_PROGRAM_TYPE_LABELS[assignment.programType] || "Developpement")}</p><h2>${escapeHtml(assignment.programTitle || "Programme")}</h2><p>${escapeHtml(member?.name || assignment.teamMemberName || "Membre")} · Version ${Number(assignment.programVersion || 1)} · Responsable: ${escapeHtml(assignment.ownerName || "Gabriel")}</p></div>
        <span class="development-status-pill ${escapeAttr(status)}">${escapeHtml(DEVELOPMENT_ASSIGNMENT_STATUS_LABELS[status] || humanize(status))}</span>
      </header>
      <section class="development-progress-summary">
        <div><strong>${progress.percent}%</strong><span>${progress.completed} sur ${progress.total} etapes</span></div>
        <span class="development-progress-track"><i style="width:${progress.percent}%"></i></span>
        <div class="development-detail-actions">
          ${status === "paused" ? `<button class="button" data-toggle-development-assignment="resume" type="button"><i data-lucide="play"></i> Reprendre</button>` : status === "completed" ? `<button class="button" data-toggle-development-assignment="reopen" type="button"><i data-lucide="rotate-ccw"></i> Rouvrir</button>` : `<button class="button" data-toggle-development-assignment="pause" type="button"><i data-lucide="pause"></i> Mettre en pause</button>`}
          <button class="button" data-open-development-member="${escapeAttr(assignment.teamMemberId || "")}" type="button"><i data-lucide="user-round"></i> Dossier membre</button>
        </div>
      </section>
      <div class="development-step-groups">
        ${Object.entries(grouped).map(([category, steps]) => `
          <section class="development-step-group"><header><h3>${escapeHtml(category)}</h3><span>${steps.filter((step) => ["completed", "not_applicable"].includes(developmentStepState(assignment, step.id).status)).length}/${steps.length}</span></header>
          <div>${steps.map((step) => renderDevelopmentStepRow(assignment, step)).join("")}</div></section>
        `).join("")}
      </div>
      ${assignment.notes ? `<aside class="development-assignment-note"><strong>Contexte</strong><p>${escapeHtml(assignment.notes)}</p></aside>` : ""}
    </section>
  `;
}

function renderDevelopmentStepRow(assignment, step) {
  const value = developmentStepState(assignment, step.id);
  const done = ["completed", "not_applicable"].includes(value.status);
  const locked = ["paused", "completed"].includes(effectiveDevelopmentAssignmentStatus(assignment));
  return `
    <button class="development-step-row ${done ? "done" : ""}" ${locked ? "disabled" : `data-open-development-step="${escapeAttr(step.id)}"`} type="button">
      <span class="development-step-check"><i data-lucide="${done ? "check" : value.status === "in_progress" ? "loader-circle" : "circle"}"></i></span>
      <span><strong>${escapeHtml(step.title)}</strong>${step.description ? `<small>${escapeHtml(step.description)}</small>` : ""}<em>${step.required ? "Requise" : "Optionnelle"}${step.evidenceRequired ? " · Preuve requise" : ""}</em></span>
      <span class="development-step-status ${escapeAttr(value.status || "pending")}">${escapeHtml(DEVELOPMENT_STEP_STATUS_LABELS[value.status] || "A faire")}</span>
      <i data-lucide="chevron-right"></i>
    </button>
  `;
}

function renderDevelopmentProgramEditor() {
  const draft = state.developmentProgramDraft || developmentProgramDraftFrom(null);
  const existing = state.developmentPrograms.find((program) => program.id === state.developmentProgramEditorId) || null;
  const readOnly = Boolean(existing && existing.status !== "draft");
  const version = draft.version || (draft.familyId ? nextDevelopmentVersion(state.developmentPrograms, draft.familyId) : 1);
  const roleOptions = developmentRoleOptions();
  return `
    <div class="career-modal" role="dialog" aria-modal="true" aria-labelledby="developmentProgramTitle">
      <div class="career-modal-backdrop" data-close-development-program aria-hidden="true"></div>
      <section class="career-editor development-program-editor panel">
        <header class="career-editor-header"><div><p class="eyebrow">Programme versionne</p><h2 id="developmentProgramTitle">${readOnly ? "Consulter le programme" : existing ? "Modifier le brouillon" : "Nouveau programme"}</h2></div><button class="button icon-only" data-close-development-program type="button" aria-label="Fermer"><i data-lucide="x"></i></button></header>
        <div class="career-editor-scroll">
          <form id="developmentProgramForm" class="development-program-form">
            <input type="hidden" name="programId" value="${escapeAttr(existing?.id || "")}">
            <label class="field">Titre<input name="title" required maxlength="140" value="${escapeAttr(draft.title || "")}" ${readOnly ? "disabled" : ""}></label>
            <label class="field">Type<select name="programType" ${readOnly ? "disabled" : ""}>${DEVELOPMENT_PROGRAM_TYPES.map(([id, label]) => `<option value="${id}" ${draft.programType === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
            <label class="field">Responsable par defaut<select name="ownerName" ${readOnly ? "disabled" : ""}>${OWNER_OPTIONS.map((name) => `<option value="${escapeAttr(name)}" ${draft.ownerName === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
            <label class="field">Version<input value="${version}" disabled></label>
            <label class="field field-wide">Description<textarea name="description" ${readOnly ? "disabled" : ""}>${escapeHtml(draft.description || "")}</textarea></label>
            ${roleOptions.length ? `<fieldset class="development-role-options field-wide"><legend>Roles applicables</legend><div>${roleOptions.map((role) => `<label><input name="roleIds" type="checkbox" value="${escapeAttr(role.id)}" ${(draft.roleIds || []).includes(role.id) ? "checked" : ""} ${readOnly ? "disabled" : ""}><span><strong>${escapeHtml(role.label)}</strong><small>${escapeHtml(role.description || role.id)}</small></span></label>`).join("")}</div></fieldset>` : `<label class="field field-wide">Roles applicables<input name="roleIdsText" value="${escapeAttr((draft.roleIds || []).join(", "))}" placeholder="Roles a ajouter apres validation" ${readOnly ? "disabled" : ""}></label>`}
            <section class="development-program-steps field-wide">
              <header><div><h3>Etapes</h3><p>${(draft.steps || []).length} etape(s)</p></div>${readOnly ? "" : `<button class="button" id="addDevelopmentProgramStep" type="button"><i data-lucide="plus"></i> Ajouter une etape</button>`}</header>
              <div>${(draft.steps || []).map((step, index) => renderDevelopmentProgramStepEditor(step, index, readOnly)).join("")}</div>
            </section>
            <footer class="pilotage-editor-actions field-wide">
              ${readOnly && existing?.status === "published" ? `<button class="button primary" data-new-development-version="${escapeAttr(existing.id)}" type="button"><i data-lucide="copy-plus"></i> Creer une nouvelle version</button>` : ""}
              ${!readOnly && existing ? `<button class="button danger push-left" id="deleteDevelopmentProgram" type="button"><i data-lucide="trash-2"></i> Supprimer le brouillon</button>` : ""}
              <button class="button" data-close-development-program type="button">Fermer</button>
              ${readOnly ? "" : `<button class="button" name="intent" value="draft" type="submit"><i data-lucide="save"></i> Sauvegarder</button><button class="button primary" name="intent" value="publish" type="submit"><i data-lucide="badge-check"></i> Publier</button>`}
            </footer>
          </form>
        </div>
      </section>
    </div>
  `;
}

function developmentRoleOptions() {
  const roles = new Map();
  Object.values(state.forms).forEach((form) => {
    (form.config?.roles || []).forEach((role) => {
      if (role?.id && !roles.has(role.id)) roles.set(role.id, role);
    });
  });
  return [...roles.values()].sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id), "fr"));
}

function renderDevelopmentProgramStepEditor(rawStep, index, readOnly) {
  const step = normalizeDevelopmentStep(rawStep, index);
  return `
    <article class="development-program-step" data-development-program-step="${index}">
      <span class="development-step-number">${index + 1}</span>
      <div class="development-step-fields">
        <label class="field">Titre<input name="stepTitle_${index}" required value="${escapeAttr(step.title)}" ${readOnly ? "disabled" : ""}></label>
        <label class="field">Categorie<input name="stepCategory_${index}" value="${escapeAttr(step.category)}" ${readOnly ? "disabled" : ""}></label>
        <label class="field field-wide">Description<textarea name="stepDescription_${index}" ${readOnly ? "disabled" : ""}>${escapeHtml(step.description)}</textarea></label>
        <div class="development-step-options field-wide"><label><input name="stepRequired_${index}" type="checkbox" ${step.required ? "checked" : ""} ${readOnly ? "disabled" : ""}> Etape requise</label><label><input name="stepEvidence_${index}" type="checkbox" ${step.evidenceRequired ? "checked" : ""} ${readOnly ? "disabled" : ""}> Preuve requise</label></div>
      </div>
      ${readOnly ? "" : `<div class="development-step-order"><button class="button icon-only" data-move-development-step="up" data-step-index="${index}" type="button" title="Monter" ${index === 0 ? "disabled" : ""}><i data-lucide="arrow-up"></i></button><button class="button icon-only" data-move-development-step="down" data-step-index="${index}" type="button" title="Descendre" ${index === state.developmentProgramDraft.steps.length - 1 ? "disabled" : ""}><i data-lucide="arrow-down"></i></button><button class="button icon-only danger" data-remove-development-step="${index}" type="button" title="Retirer"><i data-lucide="trash-2"></i></button></div>`}
    </article>
  `;
}

function renderDevelopmentAssignmentEditor() {
  const programs = latestPublishedPrograms(state.developmentPrograms);
  const members = state.teamMembers.filter((member) => !isArchivedTeamMember(member));
  return `
    <div class="career-modal" role="dialog" aria-modal="true" aria-labelledby="developmentAssignmentTitle">
      <div class="career-modal-backdrop" data-close-development-assignment-editor aria-hidden="true"></div>
      <section class="action-editor panel">
        <header class="career-editor-header"><div><p class="eyebrow">Developpement equipe</p><h2 id="developmentAssignmentTitle">Assigner un programme</h2></div><button class="button icon-only" data-close-development-assignment-editor type="button" aria-label="Fermer"><i data-lucide="x"></i></button></header>
        <form id="developmentAssignmentForm" class="action-modal-form">
          <label class="field">Membre<select id="developmentAssignmentMember" name="teamMemberId" required><option value="">Choisir</option>${members.map((member) => `<option value="${escapeAttr(member.id)}" ${state.developmentAssignmentPrefillMemberId === member.id ? "selected" : ""}>${escapeHtml(member.name)} · ${escapeHtml(member.displayTitle || "Role a preciser")}</option>`).join("")}</select></label>
          <label class="field">Programme<select id="developmentAssignmentProgram" name="programId" required><option value="">Choisir</option>${programs.map((program) => `<option value="${escapeAttr(program.id)}" data-role-ids="${escapeAttr((program.roleIds || []).join(","))}">${escapeHtml(program.title)} · v${Number(program.version || 1)}</option>`).join("")}</select></label>
          <label class="field">Responsable<select name="ownerName">${OWNER_OPTIONS.map((name) => `<option value="${escapeAttr(name)}" ${name === "Gabriel" ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
          <label class="field">Contexte<textarea name="notes" placeholder="Contexte particulier pour ce membre..."></textarea></label>
          <footer class="notes-actions"><button class="button" data-close-development-assignment-editor type="button">Annuler</button><button class="button primary" type="submit"><i data-lucide="user-round-plus"></i> Assigner</button></footer>
        </form>
      </section>
    </div>
  `;
}

function renderDevelopmentStepEditor() {
  const assignment = state.developmentAssignments.find((item) => item.id === state.selectedDevelopmentAssignmentId);
  const step = assignment?.steps?.find((item) => item.id === state.developmentStepEditorId);
  if (!assignment || !step) return "";
  const value = developmentStepState(assignment, step.id);
  return `
    <div class="career-modal" role="dialog" aria-modal="true" aria-labelledby="developmentStepTitle">
      <div class="career-modal-backdrop" data-close-development-step aria-hidden="true"></div>
      <section class="action-editor panel">
        <header class="career-editor-header"><div><p class="eyebrow">${escapeHtml(step.category || "Etape")}</p><h2 id="developmentStepTitle">${escapeHtml(step.title)}</h2></div><button class="button icon-only" data-close-development-step type="button" aria-label="Fermer"><i data-lucide="x"></i></button></header>
        <form id="developmentStepForm" class="action-modal-form">
          ${step.description ? `<p class="development-step-description">${escapeHtml(step.description)}</p>` : ""}
          <label class="field">Etat<select name="status">${DEVELOPMENT_STEP_STATUSES.map(([id, label]) => `<option value="${id}" ${value.status === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
          <label class="field">Note<textarea name="note" placeholder="Observation, feedback ou prochaine action...">${escapeHtml(value.note || "")}</textarea></label>
          <label class="field">Lien de preuve ${step.evidenceRequired ? "*" : ""}<input name="evidenceUrl" type="url" value="${escapeAttr(value.evidenceUrl || "")}" placeholder="https://docs.google.com/..."></label>
          <footer class="notes-actions"><button class="button" data-close-development-step type="button">Annuler</button><button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer</button></footer>
        </form>
      </section>
    </div>
  `;
}

function renderRoadmapModule() {
  const bucketCounts = roadmapBucketCounts();
  const counts = contextualStatusCounts();
  return `
    <section class="module-heading">
      <nav class="roadmap-tabs" aria-label="Etapes des roadmaps">
        ${roadmapTab("queue", "En cours", bucketCounts.queue)}
        ${roadmapTab("history", "Historique", bucketCounts.history)}
      </nav>
      <div class="module-actions">
        <button class="button filter-reset-button" id="resetRoadmapFilters" type="button"><i data-lucide="filter-x"></i> Reinitialiser les filtres</button>
        <button class="button roadmap-trash-button ${state.roadmapView === "trash" ? "active" : ""}" data-roadmap-view="trash" type="button" title="Ouvrir la corbeille"><i data-lucide="trash-2"></i><span>Corbeille</span><strong>${bucketCounts.trash}</strong></button>
      </div>
    </section>
    ${renderFilters()}
    ${state.roadmapView === "queue" ? `
      <section class="pipeline roadmap-pipeline" aria-label="Filtrer les roadmaps a traiter par statut">
        ${metric(counts.to_read, "A lire", "green", "to_read")}
        ${metric(counts.meeting_planned, "Lues / rencontre a faire", "blue", "meeting_planned")}
        ${metric(counts.action_required, "Suivi a faire", "red", "action_required")}
      </section>
    ` : ""}
    ${renderSubmissionWorkspace()}
  `;
}

function roadmapTab(view, label, count, icon = "") {
  return `<button class="tab-button ${state.roadmapView === view ? "active" : ""}" data-roadmap-view="${view}" type="button">${icon ? `<i data-lucide="${icon}"></i>` : ""}${escapeHtml(label)} <span>${count || 0}</span></button>`;
}

function renderPilotageView() {
  const summary = currentPilotageSummary();
  return `
    <section class="pilotage-summary" aria-label="Etat du pilotage">
      ${pilotageSummaryCard(summary.offTrackMetrics, "Indicateurs hors cible", "chart-no-axes-combined", summary.offTrackMetrics ? "red" : "green", "scorecard")}
      ${pilotageSummaryCard(summary.missingMetrics, "Indicateurs a saisir", "circle-help", summary.missingMetrics ? "amber" : "green", "scorecard")}
      ${pilotageSummaryCard(summary.missingTargets, "Cibles a cadrer", "circle-dashed", summary.missingTargets ? "amber" : "green", "scorecard")}
      ${pilotageSummaryCard(summary.offTrackRocks, "Priorites a risque", "flag", summary.offTrackRocks ? "red" : "green", "rocks")}
      ${pilotageSummaryCard(summary.openIssues, "Enjeux ouverts", "list-tree", summary.openIssues ? "blue" : "green", "issues")}
      ${pilotageSummaryCard(summary.openActions, "Actions de pilotage", "list-checks", "neutral", "todo")}
    </section>
    <section class="panel pilotage-shell">
      <header class="pilotage-toolbar">
        <nav class="pilotage-tabs" aria-label="Outils de pilotage">
          ${PILOTAGE_SECTION_OPTIONS.map(([id, label, icon]) => pilotageSectionButton(id, label, icon)).join("")}
        </nav>
        <span class="owner-only-badge"><i data-lucide="lock-keyhole"></i> Michael et Gabriel</span>
      </header>
      <div class="pilotage-body">
        ${state.pilotageSection === "strategy" ? renderBusinessStrategy() : state.pilotageSection === "scorecard" ? renderPilotageScorecard() : state.pilotageSection === "rocks" ? renderPilotageRocks() : state.pilotageSection === "issues" ? renderPilotageIssues() : renderPilotageMeeting()}
      </div>
    </section>
  `;
}

function pilotageSummaryCard(value, label, icon, tone, section) {
  return `
    <button class="pilotage-summary-card ${tone}" data-pilotage-jump="${section}" type="button">
      <i data-lucide="${icon}"></i><span><strong>${value || 0}</strong><small>${escapeHtml(label)}</small></span>
    </button>
  `;
}

function pilotageSectionButton(id, label, icon) {
  const count = id === "scorecard"
    ? currentPilotageSummary().offTrackMetrics + currentPilotageSummary().missingMetrics + currentPilotageSummary().missingTargets
    : id === "rocks"
      ? currentPilotageSummary().offTrackRocks
      : id === "issues"
        ? currentPilotageSummary().openIssues
        : id === "strategy"
          ? strategyCoverage(currentStrategyProfile()).missing + (currentStrategyProfile().status === "validated" ? 0 : 1)
        : 0;
  return `<button class="pilotage-tab ${state.pilotageSection === id ? "active" : ""}" data-pilotage-section="${id}" type="button"><i data-lucide="${icon}"></i><span>${escapeHtml(label)}</span>${count ? `<strong>${count}</strong>` : ""}</button>`;
}

function currentStrategyProfile() {
  const source = state.businessStrategy || cloneStrategyBaseline();
  return { ...validateStrategyProfile(source).profile, updatedAt: source.updatedAt || null, createdAt: source.createdAt || null };
}

function renderBusinessStrategy() {
  const profile = currentStrategyProfile();
  const coverage = strategyCoverage(profile);
  const usingBaseline = !state.businessStrategy;
  const statusLabel = Object.fromEntries(STRATEGY_STATUS_OPTIONS)[profile.status] || "A revalider";
  return `
    <header class="pilotage-section-heading strategy-heading">
      <div><p class="eyebrow">Cap durable</p><h2>Strategie CFSB</h2><p>Une vue sourcee de ce qui guide les decisions de Michael et Gabriel.</p></div>
      <div class="pilotage-heading-actions"><button class="button primary" data-open-strategy-editor="profile" type="button"><i data-lucide="${usingBaseline ? "database-zap" : "pencil"}"></i> ${usingBaseline ? "Creer depuis les sources" : "Modifier"}</button></div>
    </header>
    <nav class="strategy-tabs" aria-label="Sections de la strategie">
      <button class="tab-button ${state.strategyView === "overview" ? "active" : ""}" data-strategy-view="overview" type="button"><i data-lucide="compass"></i> Vue d'ensemble</button>
      <button class="tab-button ${state.strategyView === "decisions" ? "active" : ""}" data-strategy-view="decisions" type="button"><i data-lucide="scale"></i> Decisions <span>${state.strategyDecisions.length}</span></button>
    </nav>
    ${state.strategyView === "decisions" ? renderStrategyDecisions() : `
      <section class="strategy-status-bar ${escapeAttr(profile.status)}">
        <span><i data-lucide="${profile.status === "validated" ? "badge-check" : "circle-dashed"}"></i><strong>${escapeHtml(statusLabel)}</strong></span>
        <span><b>${coverage.percent}%</b> de couverture documentee · ${coverage.missing} bloc(s) a completer</span>
        ${usingBaseline ? `<em>Lecture de la base sourcee GitHub. Aucune donnee Firestore n'a encore ete creee.</em>` : profile.updatedAt ? `<em>Derniere mise a jour: ${formatDate(profile.updatedAt)}</em>` : `<em>Revision source: ${escapeHtml(profile.sourceRevision || "a confirmer")}</em>`}
      </section>
      ${profile.sourceNotes ? `<aside class="strategy-source-warning"><i data-lucide="info"></i><p>${escapeHtml(profile.sourceNotes)}</p></aside>` : ""}
      <section class="strategy-foundation-grid">
        ${strategyStatementCard("Vision", profile.vision, "telescope", "vision")}
        ${strategyStatementCard("Mission", profile.mission, "target", "mission")}
      </section>
      <section class="strategy-section-block">
        <header class="section-heading"><div><h3>Valeurs CFSB</h3><p>Les comportements qui encadrent les decisions et les attentes.</p></div></header>
        <div class="strategy-values-grid">${profile.values.map((value, index) => `<article><span>${index + 1}</span><div><h4>${escapeHtml(value.name)}</h4><p>${escapeHtml(value.description)}</p></div></article>`).join("")}</div>
      </section>
      <section class="strategy-position-grid">
        ${strategyTextPanel("Niche", profile.niche, "crosshair")}
        ${strategyTextPanel("Cible a long terme", profile.longTermTarget, "mountain")}
        ${strategyListPanel("Strategies", profile.strategies, "waypoints")}
        ${strategyListPanel("Differenciateurs", profile.differentiators, "sparkles")}
        ${strategyTextPanel("Processus eprouve", profile.provenProcess, "workflow")}
        ${strategyTextPanel("Garantie", profile.guarantee, "shield-check")}
      </section>
      ${renderStrategySwot(profile.swot)}
      <section class="strategy-section-block strategy-annual-focus">
        <header class="section-heading"><div><h3>Focus annuel ${Number(profile.annualFocus.year || new Date().getFullYear())}</h3><p>Les resultats annuels valides doivent servir de pont vers les priorites 90 jours.</p></div></header>
        ${profile.annualFocus.goals.length ? `<ol>${profile.annualFocus.goals.map((goal) => `<li>${escapeHtml(goal)}</li>`).join("")}</ol>` : `<div class="strategy-missing"><i data-lucide="circle-dashed"></i><span><strong>Objectifs annuels a valider</strong><small>Les sources consultees ne fournissent pas une liste actuelle assez fiable pour la precharger.</small></span></div>`}
      </section>
      <section class="strategy-section-block strategy-sources">
        <header class="section-heading"><div><h3>Sources</h3><p>Chaque bloc initial peut etre retrace dans Drive.</p></div></header>
        <div>${profile.sourceDocuments.map((source) => `<a href="${escapeAttr(safeExternalUrl(source.url))}" target="_blank" rel="noopener"><i data-lucide="file-text"></i><span><strong>${escapeHtml(source.label)}</strong><small>${escapeHtml(source.scope || "Source strategie")} · revision ${escapeHtml(source.revisionDate || "a confirmer")}</small></span><i data-lucide="external-link"></i></a>`).join("")}</div>
      </section>
    `}
  `;
}

function strategyStatementCard(label, text, icon, tone) {
  return `<article class="strategy-statement ${tone}"><span><i data-lucide="${icon}"></i></span><div><small>${escapeHtml(label)}</small><blockquote>${text ? escapeHtml(text) : "A completer"}</blockquote></div></article>`;
}

function strategyTextPanel(label, text, icon) {
  return `<article class="strategy-text-panel"><header><i data-lucide="${icon}"></i><h3>${escapeHtml(label)}</h3></header>${text ? `<p>${escapeHtml(text)}</p>` : `<p class="strategy-empty-text">A completer</p>`}</article>`;
}

function strategyListPanel(label, items, icon) {
  return `<article class="strategy-text-panel"><header><i data-lucide="${icon}"></i><h3>${escapeHtml(label)}</h3></header>${items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="strategy-empty-text">A completer</p>`}</article>`;
}

function renderStrategySwot(swot) {
  const groups = [
    ["strengths", "Forces", "trending-up"],
    ["weaknesses", "Faiblesses", "wrench"],
    ["opportunities", "Opportunites", "lightbulb"],
    ["threats", "Menaces", "triangle-alert"]
  ];
  return `
    <section class="strategy-section-block">
      <header class="section-heading"><div><h3>SWOT</h3><p>Photographie sourcee du 6 fevrier 2026, a revalider au besoin.</p></div></header>
      <div class="strategy-swot-grid">${groups.map(([key, label, icon]) => `<article class="${key}"><header><i data-lucide="${icon}"></i><h4>${label}</h4></header>${swot[key].length ? `<ul>${swot[key].map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p>A completer</p>`}</article>`).join("")}</div>
    </section>
  `;
}

function renderStrategyDecisions() {
  const decisions = sortStrategyDecisions(state.strategyDecisions);
  return `
    <section class="strategy-decision-toolbar"><div><h3>Registre de decisions</h3><p>Conserver le choix, sa raison et son impact pour eviter de reprendre la meme discussion.</p></div><button class="button primary" data-open-strategy-editor="decision" type="button"><i data-lucide="plus"></i> Nouvelle decision</button></section>
    ${decisions.length ? `<div class="strategy-decision-list">${decisions.map(renderStrategyDecisionCard).join("")}</div>` : `<div class="empty-state strategy-decision-empty"><i data-lucide="scale"></i><div><strong>Aucune decision enregistree</strong><span>Ajoutez seulement les decisions qui changent le cap, une regle ou une priorite durable.</span></div></div>`}
  `;
}

function renderStrategyDecisionCard(decision) {
  const status = decision.status || "active";
  return `
    <article class="strategy-decision-card ${escapeAttr(status)}">
      <time>${formatDateOnly(decision.decisionDate)}</time>
      <div><span class="strategy-decision-status ${escapeAttr(status)}">${status === "superseded" ? "Remplacee" : "Active"}</span><h3>${escapeHtml(decision.title || "Decision")}</h3><p>${escapeHtml(decision.decision || "")}</p>${decision.rationale ? `<small><strong>Pourquoi:</strong> ${escapeHtml(decision.rationale)}</small>` : ""}${decision.impact ? `<small><strong>Impact:</strong> ${escapeHtml(decision.impact)}</small>` : ""}</div>
      <aside><span>${escapeHtml(decision.ownerName || "Michael + Gabriel")}</span>${decision.sourceUrl ? `<a class="button icon-only" href="${escapeAttr(safeExternalUrl(decision.sourceUrl))}" target="_blank" rel="noopener" title="Ouvrir la source"><i data-lucide="external-link"></i></a>` : ""}<button class="button icon-only" data-edit-strategy-decision="${escapeAttr(decision.id)}" type="button" title="Modifier"><i data-lucide="pencil"></i></button></aside>
    </article>
  `;
}

function renderPilotageMeeting() {
  const meeting = selectedPilotageMeeting();
  const finalized = meeting?.status === "finalized";
  const disabled = finalized ? "disabled" : "";
  const metrics = activePilotageMetrics();
  const entries = pilotageEntriesForWeek();
  const entryMap = new Map(entries.map((entry) => [entry.metricId, entry]));
  const rocks = pilotageRocksForQuarter();
  const issues = openPilotageIssues();
  return `
    <header class="pilotage-section-heading">
      <div><p class="eyebrow">Rituel de gestion</p><h2>Reunion hebdomadaire</h2><p>Une trame commune pour regarder les faits, choisir les priorites et repartir avec des actions claires.</p></div>
      ${renderPilotageWeekControl()}
    </header>
    <form id="pilotageMeetingForm" class="pilotage-meeting-form">
      <div class="meeting-state-bar ${finalized ? "finalized" : "draft"}">
        <span><i data-lucide="${finalized ? "badge-check" : "file-pen-line"}"></i>${finalized ? `Finalisee ${formatDate(meeting.finalizedAt)}` : meeting ? "Brouillon en cours" : "Nouvelle semaine"}</span>
        <small>Participants: ${PILOTAGE_MEETING_ATTENDEES.join(" et ")}</small>
      </div>
      ${pilotageMeetingBlock(1, "Ouverture", "Faits saillants, victoires et nouvelles importantes.", `
        <div class="pilotage-form-grid">
          <label class="field">Victoires et progres<textarea name="wins" ${disabled} placeholder="Ce qui avance bien cette semaine...">${escapeHtml(meeting?.wins || "")}</textarea></label>
          <label class="field">Nouvelles et contexte<textarea name="headlines" ${disabled} placeholder="Informations que l'autre owner doit connaitre...">${escapeHtml(meeting?.headlines || "")}</textarea></label>
        </div>
      `)}
      ${pilotageMeetingBlock(2, "Indicateurs", "Les chiffres servent a reperer une discussion, pas a remplacer le jugement.", metrics.length ? `
        <div class="meeting-review-list">
          ${metrics.map((metric) => renderPilotageMeetingMetric(metric, entryMap.get(metric.id))).join("")}
        </div>
        <label class="field field-wide">Constats sur les indicateurs<textarea name="scorecardNotes" ${disabled} placeholder="Tendances, explications ou questions a revoir...">${escapeHtml(meeting?.scorecardNotes || "")}</textarea></label>
      ` : renderPilotageEmpty("chart-no-axes-combined", "Aucun indicateur configure", "Ajoutez les premiers indicateurs dans l'onglet Indicateurs."))}
      ${pilotageMeetingBlock(3, "Priorites 90 jours", "Confirmer ce qui est sur la bonne voie et ce qui demande une decision.", rocks.length ? `
        <div class="meeting-review-list">${rocks.map(renderPilotageMeetingRock).join("")}</div>
        <label class="field field-wide">Constats sur les priorites<textarea name="rocksNotes" ${disabled} placeholder="Blocages, arbitrages et soutien necessaire...">${escapeHtml(meeting?.rocksNotes || "")}</textarea></label>
      ` : renderPilotageEmpty("flag", "Aucune priorite pour ce trimestre", `Ajoutez une priorite pour ${state.pilotageQuarter}.`))}
      ${pilotageMeetingBlock(4, "Enjeux a resoudre", "Traiter les sujets les plus importants avant d'en ajouter de nouveaux.", issues.length ? `
        <div class="meeting-review-list">${issues.slice(0, 8).map(renderPilotageMeetingIssue).join("")}</div>
        <label class="field field-wide">Decisions et contexte<textarea name="issuesNotes" ${disabled} placeholder="Decisions prises, compromis ou enjeux a poursuivre...">${escapeHtml(meeting?.issuesNotes || "")}</textarea></label>
      ` : renderPilotageEmpty("circle-check-big", "Aucun enjeu ouvert", "La liste est claire pour cette semaine."))}
      ${pilotageMeetingBlock(5, "Conclusion", "Resumer le cap avant de quitter la rencontre.", `
        <div class="pilotage-form-grid conclusion-grid">
          <label class="field">Decisions prises<textarea name="conclusion" ${disabled} placeholder="Ce qui a ete decide...">${escapeHtml(meeting?.conclusion || "")}</textarea></label>
          <label class="field">Focus jusqu'a la prochaine rencontre<textarea name="nextWeekFocus" ${disabled} placeholder="Les quelques resultats a proteger...">${escapeHtml(meeting?.nextWeekFocus || "")}</textarea></label>
          <label class="field compact-field">Qualite de la rencontre (1 a 10)<input name="rating" type="number" min="1" max="10" step="1" value="${escapeAttr(meeting?.rating || "")}" ${disabled}></label>
        </div>
      `)}
      <footer class="pilotage-meeting-actions">
        ${finalized ? `<button class="button" id="reopenPilotageMeeting" type="button"><i data-lucide="rotate-ccw"></i> Rouvrir la rencontre</button>` : `
          <span>Le brouillon peut etre repris par Michael ou Gabriel.</span>
          <button class="button" type="submit"><i data-lucide="save"></i> Enregistrer le brouillon</button>
          <button class="button primary" id="finalizePilotageMeeting" type="button"><i data-lucide="badge-check"></i> Finaliser la rencontre</button>
        `}
      </footer>
    </form>
  `;
}

function pilotageMeetingBlock(number, title, description, content) {
  return `
    <section class="pilotage-meeting-block">
      <header><span>${number}</span><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div></header>
      <div class="pilotage-meeting-block-body">${content}</div>
    </section>
  `;
}

function renderPilotageMeetingMetric(metric, entry) {
  const status = metricStatus(metric, entry);
  const statusMeta = pilotageMetricStatusMeta(status);
  return `
    <article class="meeting-review-row ${status}">
      <span class="review-status-icon"><i data-lucide="${statusMeta.icon}"></i></span>
      <div><strong>${escapeHtml(metric.name)}</strong><small>${status === "missing_target" ? "Cible a valider" : `Cible ${escapeHtml(targetLabel(metric))}`}${entry?.note ? ` · ${escapeHtml(truncate(entry.note, 100))}` : ""}</small></div>
      <b>${entry && Number.isFinite(Number(entry.value)) ? `${formatNumber(entry.value)} ${escapeHtml(metric.unit || "")}` : "A saisir"}</b>
      ${status === "off_track" ? `<button class="button icon-only" data-pilotage-metric-issue="${escapeAttr(metric.id)}" type="button" title="Creer un enjeu" aria-label="Creer un enjeu pour ${escapeAttr(metric.name)}"><i data-lucide="list-plus"></i></button>` : ""}
    </article>
  `;
}

function renderPilotageMeetingRock(rock) {
  const label = Object.fromEntries(PILOTAGE_ROCK_STATUSES)[rock.status] || "A preciser";
  return `
    <article class="meeting-review-row ${rock.status}">
      <span class="review-status-icon"><i data-lucide="${rock.status === "done" ? "circle-check" : rock.status === "off_track" ? "circle-alert" : "circle-dot"}"></i></span>
      <div><strong>${escapeHtml(rock.title)}</strong><small>${escapeHtml(rock.ownerName || "Michael + Gabriel")} · ${escapeHtml(label)}</small></div>
      <b>${clampProgress(rock.progress)}%</b>
      ${rock.status === "off_track" ? `<button class="button icon-only" data-pilotage-rock-issue="${escapeAttr(rock.id)}" type="button" title="Creer un enjeu" aria-label="Creer un enjeu pour ${escapeAttr(rock.title)}"><i data-lucide="list-plus"></i></button>` : ""}
    </article>
  `;
}

function renderPilotageMeetingIssue(issue) {
  return `
    <article class="meeting-review-row issue-row">
      <span class="priority-chip ${escapeAttr(issue.priority || "P2")}">${escapeHtml(issue.priority || "P2")}</span>
      <div><strong>${escapeHtml(issue.title)}</strong><small>${escapeHtml(issue.ownerName || "Michael + Gabriel")}${issue.linkedTaskId ? " · Action creee" : ""}</small></div>
      <button class="button" data-solve-pilotage-issue="${escapeAttr(issue.id)}" type="button"><i data-lucide="check"></i> Resoudre</button>
    </article>
  `;
}

function renderPilotageScorecard() {
  const metrics = activePilotageMetrics();
  const entryMap = new Map(pilotageEntriesForWeek().map((entry) => [entry.metricId, entry]));
  return `
    <header class="pilotage-section-heading">
      <div><p class="eyebrow">Voir les faits</p><h2>Indicateurs hebdomadaires</h2><p>Une petite liste de chiffres utiles, avec une cible claire et un responsable.</p></div>
      <div class="pilotage-heading-actions">${renderPilotageWeekControl()}<button class="button primary" data-open-pilotage-editor="metric" type="button"><i data-lucide="plus"></i> Ajouter un indicateur</button></div>
    </header>
    ${metrics.length ? `
      <form id="pilotageEntriesForm" class="pilotage-scorecard-form">
        <div class="pilotage-table-head"><span>Indicateur</span><span>Cible</span><span>Valeur</span><span>Note</span><span>Etat</span><span></span></div>
        ${metrics.map((metric) => renderPilotageMetricRow(metric, entryMap.get(metric.id))).join("")}
        <footer><span>${metrics.length} indicateur(s) actif(s) pour la semaine du ${formatDateOnly(state.pilotageWeek)}.</span><button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer la semaine</button></footer>
      </form>
    ` : renderPilotageEmpty("chart-no-axes-combined", "Construisez votre scorecard", "Ajoutez uniquement les indicateurs qui aident Michael et Gabriel a prendre une decision chaque semaine.", `<button class="button primary" data-open-pilotage-editor="metric" type="button"><i data-lucide="plus"></i> Premier indicateur</button>`)}
  `;
}

function renderPilotageMetricRow(metric, entry) {
  const status = metricStatus(metric, entry);
  const statusMeta = pilotageMetricStatusMeta(status);
  const sourceUrl = normalizeExternalUrl(metric.sourceUrl);
  return `
    <div class="pilotage-table-row ${status}">
      <div class="pilotage-metric-identity">
        <strong>${escapeHtml(metric.name)}</strong>
        <small>${escapeHtml(metric.category || "General")} · ${escapeHtml(metric.ownerName || "Michael + Gabriel")}</small>
        ${metric.definition ? `<small class="metric-definition">${escapeHtml(metric.definition)}</small>` : ""}
        ${sourceUrl ? `<a class="metric-source-link" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener" title="${escapeAttr(metric.sourceReference || metric.sourceLabel || "Ouvrir la source")}"><i data-lucide="external-link"></i>${escapeHtml(metric.sourceLabel || "Ouvrir la source")}</a>` : ""}
      </div>
      <span>${escapeHtml(targetLabel(metric))}</span>
      <label><span class="visually-hidden">Valeur de ${escapeHtml(metric.name)}</span><input name="metric:${escapeAttr(metric.id)}:value" type="number" step="any" value="${entry && Number.isFinite(Number(entry.value)) ? escapeAttr(entry.value) : ""}" placeholder="--"></label>
      <label><span class="visually-hidden">Note de ${escapeHtml(metric.name)}</span><input name="metric:${escapeAttr(metric.id)}:note" value="${escapeAttr(entry?.note || "")}" maxlength="240" placeholder="Contexte facultatif"></label>
      <span class="pilotage-state ${status}"><i data-lucide="${statusMeta.icon}"></i>${statusMeta.label}</span>
      <button class="button icon-only" data-edit-pilotage-metric="${escapeAttr(metric.id)}" type="button" title="Modifier l'indicateur" aria-label="Modifier ${escapeAttr(metric.name)}"><i data-lucide="pencil"></i></button>
    </div>
  `;
}

function pilotageMetricStatusMeta(status) {
  if (status === "on_track") return { icon: "circle-check", label: "Dans la cible" };
  if (status === "off_track") return { icon: "circle-alert", label: "Hors cible" };
  if (status === "missing_target") return { icon: "circle-dashed", label: "Cible a valider" };
  return { icon: "circle-help", label: "A saisir" };
}

function renderPilotageRocks() {
  const rocks = pilotageRocksForQuarter();
  return `
    <header class="pilotage-section-heading">
      <div><p class="eyebrow">Garder le cap</p><h2>Priorites 90 jours</h2><p>Les quelques resultats qui comptent vraiment ce trimestre.</p></div>
      <div class="pilotage-heading-actions">${renderPilotageQuarterControl()}<button class="button primary" data-open-pilotage-editor="rock" type="button"><i data-lucide="plus"></i> Ajouter une priorite</button></div>
    </header>
    ${rocks.length ? `<div class="pilotage-rock-grid">${rocks.map(renderPilotageRockCard).join("")}</div>` : renderPilotageEmpty("flag", "Aucune priorite pour ce trimestre", `Ajoutez les resultats importants de ${state.pilotageQuarter}, avec un responsable et un critere de succes.`, `<button class="button primary" data-open-pilotage-editor="rock" type="button"><i data-lucide="plus"></i> Premiere priorite</button>`)}
  `;
}

function renderPilotageRockCard(rock) {
  const label = Object.fromEntries(PILOTAGE_ROCK_STATUSES)[rock.status] || "A preciser";
  return `
    <article class="pilotage-rock-card ${escapeAttr(rock.status || "on_track")}">
      <header><span class="pilotage-state ${escapeAttr(rock.status || "on_track")}"><i data-lucide="${rock.status === "done" ? "circle-check" : rock.status === "off_track" ? "circle-alert" : "circle-dot"}"></i>${escapeHtml(label)}</span><button class="button icon-only" data-edit-pilotage-rock="${escapeAttr(rock.id)}" type="button" title="Modifier la priorite" aria-label="Modifier ${escapeAttr(rock.title)}"><i data-lucide="pencil"></i></button></header>
      <h3>${escapeHtml(rock.title)}</h3>
      <p>${escapeHtml(rock.successCriteria || rock.notes || "Critere de succes a preciser.")}</p>
      <div class="rock-meta"><span><i data-lucide="user-round"></i>${escapeHtml(rock.ownerName || "Michael + Gabriel")}</span><span><i data-lucide="calendar"></i>${rock.dueDate ? formatDateOnly(rock.dueDate) : "Sans date imposee"}</span></div>
      <div class="rock-progress"><span style="width:${clampProgress(rock.progress)}%"></span></div>
      <footer><strong>${clampProgress(rock.progress)}%</strong>${rock.status === "off_track" ? `<button class="button" data-pilotage-rock-issue="${escapeAttr(rock.id)}" type="button"><i data-lucide="list-plus"></i> Creer un enjeu</button>` : ""}</footer>
    </article>
  `;
}

function renderPilotageIssues() {
  const open = openPilotageIssues();
  const solved = state.pilotageIssues.filter((issue) => issue.status === "solved");
  return `
    <header class="pilotage-section-heading">
      <div><p class="eyebrow">Identifier, discuter, resoudre</p><h2>Liste des enjeux</h2><p>Une file priorisee pour ne pas perdre les sujets qui demandent une vraie decision.</p></div>
      <button class="button" data-open-pilotage-editor="issue" type="button"><i data-lucide="sliders-horizontal"></i> Ajouter avec details</button>
    </header>
    <form id="pilotageQuickIssueForm" class="pilotage-quick-issue">
      <label class="field"><span class="visually-hidden">Nouvel enjeu</span><input name="title" required maxlength="180" placeholder="Ajouter rapidement un enjeu a discuter..."></label>
      <label class="field compact-field"><span class="visually-hidden">Priorite</span><select name="priority">${TASK_PRIORITY_OPTIONS.map(([id, label]) => `<option value="${id}" ${id === "P2" ? "selected" : ""}>${id} · ${escapeHtml(label)}</option>`).join("")}</select></label>
      <button class="button primary" type="submit"><i data-lucide="plus"></i> Ajouter</button>
    </form>
    <div class="pilotage-issue-list">
      ${open.length ? open.map(renderPilotageIssueCard).join("") : renderPilotageEmpty("circle-check-big", "Aucun enjeu ouvert", "La liste est claire. Les nouveaux sujets peuvent etre ajoutes au fil de la semaine.")}
    </div>
    ${solved.length ? `<details class="pilotage-solved"><summary>${solved.length} enjeu(x) resolu(s)</summary><div>${solved.slice(0, 20).map(renderPilotageIssueCard).join("")}</div></details>` : ""}
  `;
}

function renderPilotageIssueCard(issue) {
  const solved = issue.status === "solved";
  const sourceUrl = normalizeExternalUrl(issue.sourceUrl);
  return `
    <article class="pilotage-issue-card ${solved ? "solved" : ""}">
      <span class="priority-chip ${escapeAttr(issue.priority || "P2")}">${escapeHtml(issue.priority || "P2")}</span>
      <div><h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issue.details || (solved ? issue.resolution || "Enjeu resolu." : "Aucun detail ajoute."))}</p><small>${escapeHtml(issue.ownerName || "Michael + Gabriel")}${issue.sourceLabel ? ` · ${sourceUrl ? `<a class="issue-source-link" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener">Source: ${escapeHtml(issue.sourceLabel)}</a>` : `Source: ${escapeHtml(issue.sourceLabel)}`}` : ""}${solved ? ` · Resolu ${formatDate(issue.solvedAt)}` : ""}</small></div>
      <div class="pilotage-issue-actions">
        <button class="button icon-only" data-edit-pilotage-issue="${escapeAttr(issue.id)}" type="button" title="Modifier l'enjeu" aria-label="Modifier ${escapeAttr(issue.title)}"><i data-lucide="pencil"></i></button>
        ${!solved && !issue.linkedTaskId ? `<button class="button" data-pilotage-issue-task="${escapeAttr(issue.id)}" type="button"><i data-lucide="list-checks"></i> Creer une action</button>` : ""}
        ${!solved ? `<button class="button primary" data-solve-pilotage-issue="${escapeAttr(issue.id)}" type="button"><i data-lucide="check"></i> Resoudre</button>` : ""}
        ${solved ? `<button class="button" data-reopen-pilotage-issue="${escapeAttr(issue.id)}" type="button"><i data-lucide="rotate-ccw"></i> Rouvrir</button>` : ""}
      </div>
    </article>
  `;
}

function renderPilotageWeekControl() {
  return `
    <div class="pilotage-period-control" aria-label="Choisir la semaine">
      <button class="button icon-only" data-shift-pilotage-week="-1" type="button" title="Semaine precedente" aria-label="Semaine precedente"><i data-lucide="chevron-left"></i></button>
      <button class="period-current" data-current-pilotage-week type="button"><small>Semaine du</small><strong>${formatDateOnly(state.pilotageWeek)}</strong></button>
      <button class="button icon-only" data-shift-pilotage-week="1" type="button" title="Semaine suivante" aria-label="Semaine suivante"><i data-lucide="chevron-right"></i></button>
    </div>
  `;
}

function renderPilotageQuarterControl() {
  return `
    <div class="pilotage-period-control" aria-label="Choisir le trimestre">
      <button class="button icon-only" data-shift-pilotage-quarter="-1" type="button" title="Trimestre precedent" aria-label="Trimestre precedent"><i data-lucide="chevron-left"></i></button>
      <button class="period-current" data-current-pilotage-quarter type="button"><small>Trimestre</small><strong>${escapeHtml(state.pilotageQuarter)}</strong></button>
      <button class="button icon-only" data-shift-pilotage-quarter="1" type="button" title="Trimestre suivant" aria-label="Trimestre suivant"><i data-lucide="chevron-right"></i></button>
    </div>
  `;
}

function renderPilotageEmpty(icon, title, description, action = "") {
  return `<div class="pilotage-empty"><i data-lucide="${icon}"></i><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${action}</div></div>`;
}

function renderPilotageEditor() {
  const type = state.pilotageEditorType;
  const item = type === "metric"
    ? state.pilotageMetrics.find((metric) => metric.id === state.pilotageEditorId)
    : type === "rock"
      ? state.pilotageRocks.find((rock) => rock.id === state.pilotageEditorId)
      : state.pilotageIssues.find((issue) => issue.id === state.pilotageEditorId);
  const title = type === "metric" ? `${item ? "Modifier" : "Ajouter"} un indicateur` : type === "rock" ? `${item ? "Modifier" : "Ajouter"} une priorite` : `${item ? "Modifier" : "Ajouter"} un enjeu`;
  return `
    <div class="career-modal pilotage-modal" role="dialog" aria-modal="true" aria-labelledby="pilotageEditorTitle">
      <button class="career-modal-backdrop" data-close-pilotage-editor type="button" aria-label="Fermer"></button>
      <section class="career-editor pilotage-editor">
        <header class="career-editor-header"><div><p class="eyebrow">Zone Pilotage</p><h2 id="pilotageEditorTitle">${escapeHtml(title)}</h2></div><button class="button icon-only" data-close-pilotage-editor type="button" aria-label="Fermer"><i data-lucide="x"></i></button></header>
        ${type === "metric" ? renderPilotageMetricForm(item) : type === "rock" ? renderPilotageRockForm(item) : renderPilotageIssueForm(item)}
      </section>
    </div>
  `;
}

function renderStrategyEditor() {
  if (state.strategyEditorType === "decision") return renderStrategyDecisionEditor();
  const profile = currentStrategyProfile();
  const values = Array.from({ length: 4 }, (_, index) => profile.values[index] || { id: `value-${index + 1}`, name: "", description: "" });
  return `
    <div class="career-modal pilotage-modal" role="dialog" aria-modal="true" aria-labelledby="strategyEditorTitle">
      <button class="career-modal-backdrop" data-close-strategy-editor type="button" aria-label="Fermer"></button>
      <section class="career-editor strategy-editor panel">
        <header class="career-editor-header"><div><p class="eyebrow">Cap durable</p><h2 id="strategyEditorTitle">Modifier la strategie CFSB</h2></div><button class="button icon-only" data-close-strategy-editor type="button" aria-label="Fermer"><i data-lucide="x"></i></button></header>
        <div class="career-editor-scroll">
          <form id="strategyProfileForm" class="strategy-editor-form">
            <section class="strategy-editor-intro"><i data-lucide="database-zap"></i><p>La base initiale vient de Drive. Valider signifie que Michael et Gabriel confirment le contenu actuel, pas seulement qu'une source existe.</p></section>
            <div class="strategy-editor-grid">
              <label class="field">Titre<input name="title" required value="${escapeAttr(profile.title)}"></label>
              <label class="field">Etat<select name="status">${STRATEGY_STATUS_OPTIONS.map(([id, label]) => `<option value="${id}" ${profile.status === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
              <label class="field field-wide">Vision<textarea name="vision" required>${escapeHtml(profile.vision)}</textarea></label>
              <label class="field field-wide">Mission<textarea name="mission" required>${escapeHtml(profile.mission)}</textarea></label>
            </div>
            <section class="strategy-values-editor"><header><h3>Valeurs</h3><p>Conserver quatre valeurs completes avant de valider.</p></header>${values.map((value, index) => `<article><span>${index + 1}</span><input type="hidden" name="valueId_${index}" value="${escapeAttr(value.id)}"><label class="field">Nom<input name="valueName_${index}" required value="${escapeAttr(value.name)}"></label><label class="field">Description<textarea name="valueDescription_${index}" required>${escapeHtml(value.description)}</textarea></label></article>`).join("")}</section>
            <div class="strategy-editor-grid">
              <label class="field field-wide">Niche<textarea name="niche">${escapeHtml(profile.niche)}</textarea></label>
              <label class="field field-wide">Cible a long terme<textarea name="longTermTarget">${escapeHtml(profile.longTermTarget)}</textarea></label>
              <label class="field">Strategies, une par ligne<textarea name="strategies">${escapeHtml(profile.strategies.join("\n"))}</textarea></label>
              <label class="field">Differenciateurs, un par ligne<textarea name="differentiators">${escapeHtml(profile.differentiators.join("\n"))}</textarea></label>
              <label class="field">Processus eprouve<textarea name="provenProcess">${escapeHtml(profile.provenProcess)}</textarea></label>
              <label class="field">Garantie<textarea name="guarantee">${escapeHtml(profile.guarantee)}</textarea></label>
            </div>
            <section class="strategy-swot-editor"><header><h3>SWOT</h3><p>Un element par ligne.</p></header><div>${[["strengths", "Forces"], ["weaknesses", "Faiblesses"], ["opportunities", "Opportunites"], ["threats", "Menaces"]].map(([key, label]) => `<label class="field">${label}<textarea name="swot_${key}">${escapeHtml(profile.swot[key].join("\n"))}</textarea></label>`).join("")}</div></section>
            <div class="strategy-editor-grid strategy-annual-editor">
              <label class="field">Annee<input name="annualYear" type="number" min="2020" max="2100" value="${Number(profile.annualFocus.year || new Date().getFullYear())}"></label>
              <label class="field field-wide">Objectifs annuels, un par ligne<textarea name="annualGoals" placeholder="Laisser vide tant que les objectifs ne sont pas valides.">${escapeHtml(profile.annualFocus.goals.join("\n"))}</textarea></label>
              <label class="field field-wide">Note sur les sources<textarea name="sourceNotes">${escapeHtml(profile.sourceNotes)}</textarea></label>
            </div>
            <footer class="pilotage-editor-actions"><button class="button" data-close-strategy-editor type="button">Annuler</button><button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer</button></footer>
          </form>
        </div>
      </section>
    </div>
  `;
}

function renderStrategyDecisionEditor() {
  const decision = state.strategyDecisions.find((item) => item.id === state.strategyDecisionEditorId) || {};
  return `
    <div class="career-modal pilotage-modal" role="dialog" aria-modal="true" aria-labelledby="strategyDecisionEditorTitle">
      <button class="career-modal-backdrop" data-close-strategy-editor type="button" aria-label="Fermer"></button>
      <section class="action-editor panel">
        <header class="career-editor-header"><div><p class="eyebrow">Registre de decisions</p><h2 id="strategyDecisionEditorTitle">${decision.id ? "Modifier la decision" : "Nouvelle decision"}</h2></div><button class="button icon-only" data-close-strategy-editor type="button" aria-label="Fermer"><i data-lucide="x"></i></button></header>
        <form id="strategyDecisionForm" class="action-modal-form">
          <label class="field">Date<input name="decisionDate" type="date" required value="${escapeAttr(decision.decisionDate || todayInputValue())}"></label>
          <label class="field">Titre<input name="title" required maxlength="160" value="${escapeAttr(decision.title || "")}" autofocus placeholder="Le sujet tranche"></label>
          <label class="field">Decision<textarea name="decision" required placeholder="Ce qui a ete decide, en termes concrets.">${escapeHtml(decision.decision || "")}</textarea></label>
          <label class="field">Pourquoi<textarea name="rationale" placeholder="Les faits et arbitrages qui expliquent le choix.">${escapeHtml(decision.rationale || "")}</textarea></label>
          <label class="field">Impact<textarea name="impact" placeholder="Ce que cette decision change.">${escapeHtml(decision.impact || "")}</textarea></label>
          <label class="field">Responsable<select name="ownerName">${OWNER_OPTIONS.map((owner) => `<option value="${escapeAttr(owner)}" ${(decision.ownerName || "Michael + Gabriel") === owner ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select></label>
          <label class="field">Etat<select name="status">${STRATEGY_DECISION_STATUS_OPTIONS.map(([id, label]) => `<option value="${id}" ${(decision.status || "active") === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
          <label class="field">Lien de source<input name="sourceUrl" type="url" value="${escapeAttr(decision.sourceUrl || "")}" placeholder="https://docs.google.com/..."></label>
          <footer class="notes-actions"><button class="button" data-close-strategy-editor type="button">Annuler</button><button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer</button></footer>
        </form>
      </section>
    </div>
  `;
}

function renderPilotageMetricForm(metric = {}) {
  const targetValidated = metric.targetStatus === "validated" || (metric.targetStatus !== "to_validate" && metric.targetValue !== null && metric.targetValue !== "" && Number.isFinite(Number(metric.targetValue)));
  return `
    <form id="pilotageMetricForm" class="pilotage-editor-form">
      <label class="field field-wide">Nom de l'indicateur<input name="name" required maxlength="120" value="${escapeAttr(metric.name || "")}" autofocus placeholder="Ex.: Membres actifs"></label>
      <label class="field field-wide">Definition<textarea name="definition" maxlength="500" placeholder="Ce que cet indicateur mesure, en une phrase.">${escapeHtml(metric.definition || "")}</textarea></label>
      <label class="field">Categorie<input name="category" maxlength="80" value="${escapeAttr(metric.category || "")}" placeholder="Ventes, retention, operations..."></label>
      <label class="field">Responsable<select name="ownerName">${OWNER_OPTIONS.map((owner) => `<option value="${escapeAttr(owner)}" ${metric.ownerName === owner ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select></label>
      <label class="field">Type de cible<select name="targetDirection">${PILOTAGE_METRIC_DIRECTIONS.map(([id, label]) => `<option value="${id}" ${(metric.targetDirection || "gte") === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
      <label class="field">Cible<input name="targetValue" type="number" step="any" value="${escapeAttr(metric.targetValue ?? "")}" placeholder="Laisser vide si elle reste a cadrer"></label>
      <label class="field">Maximum de la plage<input name="targetMax" type="number" step="any" value="${escapeAttr(metric.targetMax ?? "")}" placeholder="Seulement pour une plage"></label>
      <label class="field">Unite<input name="unit" maxlength="30" value="${escapeAttr(metric.unit || "")}" placeholder="$ , %, membres..."></label>
      <label class="field">Ordre<input name="sortOrder" type="number" min="0" step="1" value="${escapeAttr(metric.sortOrder ?? state.pilotageMetrics.length + 1)}"></label>
      <label class="check-field"><input name="targetValidated" type="checkbox" ${targetValidated ? "checked" : ""}> Cible validee</label>
      <label class="check-field"><input name="active" type="checkbox" ${metric.active !== false ? "checked" : ""}> Indicateur actif</label>
      <label class="field">Nom de la source<input name="sourceLabel" maxlength="100" value="${escapeAttr(metric.sourceLabel || "")}" placeholder="Ex.: METRIQUE CFSB"></label>
      <label class="field">Niveau de confiance<select name="sourceConfidence">${[["high", "Eleve"], ["medium", "Moyen"], ["low", "Faible"]].map(([id, label]) => `<option value="${id}" ${(metric.sourceConfidence || "medium") === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label class="field field-wide">Lien vers la source<input name="sourceUrl" type="url" value="${escapeAttr(metric.sourceUrl || "")}" placeholder="https://docs.google.com/..."></label>
      <label class="field field-wide">Reference exacte<input name="sourceReference" maxlength="180" value="${escapeAttr(metric.sourceReference || "")}" placeholder="Dashboard Hebdo!A13:J80"></label>
      <footer class="pilotage-editor-actions"><button class="button" data-close-pilotage-editor type="button">Annuler</button><button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer</button></footer>
    </form>
  `;
}

function renderPilotageRockForm(rock = {}) {
  return `
    <form id="pilotageRockForm" class="pilotage-editor-form">
      <label class="field field-wide">Priorite 90 jours<input name="title" required maxlength="180" value="${escapeAttr(rock.title || "")}" autofocus placeholder="Un resultat concret a atteindre"></label>
      <label class="field">Trimestre<input name="quarter" required pattern="[0-9]{4}-Q[1-4]" value="${escapeAttr(rock.quarter || state.pilotageQuarter)}"></label>
      <label class="field">Responsable<select name="ownerName">${OWNER_OPTIONS.map((owner) => `<option value="${escapeAttr(owner)}" ${rock.ownerName === owner ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select></label>
      <label class="field">Etat<select name="status">${PILOTAGE_ROCK_STATUSES.map(([id, label]) => `<option value="${id}" ${(rock.status || "on_track") === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
      <label class="field">Progression (%)<input name="progress" type="number" min="0" max="100" step="5" value="${escapeAttr(rock.progress ?? 0)}"></label>
      <label class="field">Date cible facultative<input name="dueDate" type="date" value="${escapeAttr(dateInputValue(rock.dueDate))}"></label>
      <label class="field field-wide">Critere de succes<textarea name="successCriteria" placeholder="Comment saurons-nous que cette priorite est terminee?">${escapeHtml(rock.successCriteria || "")}</textarea></label>
      <label class="field field-wide">Notes<textarea name="notes" placeholder="Contexte, dependances ou risques...">${escapeHtml(rock.notes || "")}</textarea></label>
      <footer class="pilotage-editor-actions"><button class="button" data-close-pilotage-editor type="button">Annuler</button><button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer</button></footer>
    </form>
  `;
}

function renderPilotageIssueForm(issue = {}) {
  return `
    <form id="pilotageIssueForm" class="pilotage-editor-form">
      <label class="field field-wide">Enjeu<input name="title" required maxlength="180" value="${escapeAttr(issue.title || "")}" autofocus placeholder="Le probleme ou la decision a traiter"></label>
      <label class="field">Priorite<select name="priority">${TASK_PRIORITY_OPTIONS.map(([id, label]) => `<option value="${id}" ${(issue.priority || "P2") === id ? "selected" : ""}>${id} · ${escapeHtml(label)}</option>`).join("")}</select></label>
      <label class="field">Responsable<select name="ownerName">${OWNER_OPTIONS.map((owner) => `<option value="${escapeAttr(owner)}" ${issue.ownerName === owner ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select></label>
      <label class="field field-wide">Details<textarea name="details" placeholder="Faits, impacts et question a resoudre...">${escapeHtml(issue.details || "")}</textarea></label>
      ${issue.status === "solved" ? `<label class="field field-wide">Resolution<textarea name="resolution">${escapeHtml(issue.resolution || "")}</textarea></label>` : ""}
      <footer class="pilotage-editor-actions"><button class="button" data-close-pilotage-editor type="button">Annuler</button><button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer</button></footer>
    </form>
  `;
}

function renderTodoView() {
  const allTasks = allOpenManagementTasks();
  const tasks = filteredManagementTasks();
  const urgentCount = allTasks.filter((item) => taskIsUrgent(item)).length;
  const roadmapCount = allTasks.filter((item) => item.sourceType === "roadmap").length;
  const careerCount = allTasks.filter((item) => item.sourceType === "career").length;
  return `
    <section class="todo-stats">
      ${todoStat(allTasks.length, "Actions ouvertes", "all", "list-checks")}
      ${todoStat(urgentCount, "A prioriser", "urgent", "circle-alert", "red")}
      ${todoStat(roadmapCount, "Issues des roadmaps", "roadmap", "clipboard-list", "green")}
      ${todoStat(careerCount, "Parcours a suivre", "career", "route", "blue")}
    </section>
    <div class="todo-layout">
      <section class="todo-main">
        <header class="panel todo-toolbar">
          <div><h2>File d'actions</h2><p>${tasks.length} action(s) visible(s) sur ${allTasks.length}.</p></div>
          <div class="todo-filters">
            <label class="field compact-field">Type
              <select id="taskFilter">${TASK_FILTER_OPTIONS.map(([id, label]) => `<option value="${id}" ${state.taskFilter === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>
            </label>
            <label class="field compact-field">Responsable
              <select id="taskOwnerFilter"><option value="all">Tous</option>${OWNER_OPTIONS.map((owner) => `<option value="${escapeAttr(owner)}" ${state.taskOwnerFilter === owner ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select>
            </label>
          </div>
        </header>
        <div class="task-list">
          ${tasks.length ? tasks.map(renderTaskCard).join("") : `<section class="panel empty-state"><i data-lucide="circle-check-big"></i><div>Aucune action dans cette vue.</div></section>`}
        </div>
      </section>
      <aside class="panel quick-task-panel">
        <div class="quick-task-heading"><i data-lucide="plus"></i><div><h2>Ajouter une action</h2><p>Une action libre, sans calendrier impose.</p></div></div>
        <form id="managementTaskForm" class="quick-task-form">
          <label class="field">Action<input name="title" required maxlength="180" placeholder="Ex.: Confirmer la formation de Chloe"></label>
          <label class="field">Membre concerne
            <select name="teamMemberId"><option value="">Aucun membre</option>${state.teamMembers.filter((item) => !isArchivedTeamMember(item)).map((member) => `<option value="${escapeAttr(member.id)}">${escapeHtml(member.name)}</option>`).join("")}</select>
          </label>
          <div class="quick-task-fields">
            <label class="field">Responsable<select name="ownerName">${OWNER_OPTIONS.map((owner) => `<option value="${escapeAttr(owner)}">${escapeHtml(owner)}</option>`).join("")}</select></label>
            <label class="field">Priorite<select name="priority">${TASK_PRIORITY_OPTIONS.map(([id, label]) => `<option value="${id}" ${id === "P2" ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
          </div>
          <label class="field">Details<textarea name="description" class="compact-textarea" placeholder="Contexte utile pour Michael ou Gabriel"></textarea></label>
          <button class="button primary" type="submit"><i data-lucide="plus"></i> Ajouter a la liste</button>
        </form>
      </aside>
    </div>
  `;
}

function todoStat(value, label, filter, icon, tone = "") {
  return `
    <button class="todo-stat ${tone} ${state.taskFilter === filter ? "active" : ""}" data-task-filter-button="${filter}" type="button">
      <i data-lucide="${icon}"></i><span><strong>${value || 0}</strong><small>${escapeHtml(label)}</small></span>
    </button>
  `;
}

function renderActivityView() {
  const logs = filteredActivityLogs();
  const health = currentDataHealthReport();
  const unresolvedErrors = health.unresolvedErrors;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const changesToday = state.auditLogs.filter((item) => dateValue(item.createdAt) >= dayAgo).length;
  const actorsToday = new Set(state.auditLogs.filter((item) => dateValue(item.createdAt) >= dayAgo).map((item) => item.actorName).filter(Boolean)).size;
  const actors = [...new Set(state.auditLogs.map((item) => item.actorName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return `
    <section class="activity-stats">
      ${activityStat(changesToday, "Changements en 24 h", "activity")}
      ${activityStat(actorsToday, "Owners actifs", "users")}
      ${activityStat(state.auditLogs.length, "Evenements recents", "history")}
      ${activityStat(unresolvedErrors.length, unresolvedErrors.length === 1 ? "Erreur a verifier" : "Erreurs a verifier", unresolvedErrors.length ? "triangle-alert" : "shield-check", unresolvedErrors.length ? "danger" : "healthy")}
    </section>
    <section class="panel activity-health ${unresolvedErrors.length ? "has-errors" : "healthy"}">
      <header class="activity-health-heading">
        <span class="activity-health-icon"><i data-lucide="${unresolvedErrors.length ? "triangle-alert" : "shield-check"}"></i></span>
        <div><h2>${unresolvedErrors.length ? "Une erreur demande votre attention" : "Systeme en bonne sante"}</h2><p>${unresolvedErrors.length ? "Les erreurs techniques non traitees sont visibles ici, sans exposer de donnees sensibles." : "Aucune erreur non resolue n'a ete enregistree par le dashboard."}</p></div>
      </header>
      ${unresolvedErrors.length ? `<div class="health-error-list">${unresolvedErrors.slice(0, 6).map(renderClientError).join("")}</div>` : ""}
    </section>
    ${renderDataHealthPanel(health)}
    ${renderOwnerBackupPanel()}
    <section class="panel activity-toolbar">
      <label class="field activity-search">Recherche
        <input id="activitySearchInput" value="${escapeAttr(state.activitySearch)}" placeholder="Action, membre ou owner...">
      </label>
      <label class="field">Owner
        <select id="activityActorFilter"><option value="all">Tous</option>${actors.map((actor) => `<option value="${escapeAttr(actor)}" ${state.activityActor === actor ? "selected" : ""}>${escapeHtml(actor)}</option>`).join("")}</select>
      </label>
      <label class="field">Element
        <select id="activityEntityFilter">
          ${[["all", "Tous"], ["pilotage", "Pilotage"], ["strategy", "Strategie"], ["development", "Developpement"], ["workingGenius", "Working Genius"], ["systemBackup", "Sauvegardes"], ["roadmapSubmission", "Roadmaps"], ["managementTask", "Actions"], ["teamMember", "Equipe"], ["teamMeeting", "Rencontres"], ["memberCareerPlan", "Mandats"], ["careerMilestone", "Parcours"], ["revenueScenario", "Projections"], ["clientError", "Systeme"]].map(([id, label]) => `<option value="${id}" ${state.activityEntity === id ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
    </section>
    <section class="panel activity-panel">
      <header class="section-heading"><div><h2>Journal des changements</h2><p>${logs.length} evenement(s) visible(s). Clique sur une ligne pour ouvrir l'element concerne.</p></div></header>
      <div class="activity-list">
        ${logs.length ? logs.map(renderActivityRow).join("") : `<div class="empty-state"><i data-lucide="search-x"></i><div>Aucun changement ne correspond a ces filtres.</div></div>`}
      </div>
    </section>
  `;
}

function renderOwnerBackupPanel() {
  return `
    <section class="panel owner-backup-panel">
      <span class="owner-backup-icon"><i data-lucide="archive-restore"></i></span>
      <div><p class="eyebrow">Continuite des donnees</p><h2>Sauvegarde owner</h2><p>Exporte ${OWNER_BACKUP_COLLECTIONS.length} collections Firestore et l'historique imbrique des soumissions dans un fichier JSON verifiable.</p><small>Le fichier contient des notes de gestion privees. Conservez-le dans un emplacement limite a Michael et Gabriel.</small></div>
      <button class="button primary" data-export-owner-backup type="button"><i data-lucide="download"></i> Exporter maintenant</button>
    </section>
  `;
}

function currentDataHealthReport() {
  return dashboardHealthReport({
    submissions: state.submissions,
    teamMembers: state.teamMembers,
    pilotageMetrics: state.pilotageMetrics,
    clientErrors: state.clientErrors,
    memberForSubmission,
    memberDocumentUrl: memberRoadmapDocumentUrl,
    isActiveMember: (member) => !isArchivedTeamMember(member)
  });
}

function renderDataHealthPanel(health) {
  const statusMeta = health.status === "error"
    ? { icon: "shield-alert", title: "Des erreurs techniques sont ouvertes", description: "Corrige les erreurs avant de te fier aux autres signaux." }
    : health.status === "attention"
      ? { icon: "scan-search", title: "Qualite des donnees a completer", description: "Chaque ecart ouvre directement l'endroit ou Michael ou Gabriel peut le traiter." }
      : { icon: "badge-check", title: "Donnees bien reliees", description: "Aucun ecart de configuration connu dans les controles actuels." };
  const submissionMode = health.nativeSubmissions.length ? "Firebase direct" : health.importedSubmissions.length ? "Import Apps Script" : "Aucune donnee";
  const sourceDescription = health.nativeSubmissions.length
    ? `${health.nativeSubmissions.length} soumission(s) recue(s) directement dans Firebase. Derniere: ${formatDate(health.latestSubmissionAt)}.`
    : health.importedSubmissions.length
      ? `${health.importedSubmissions.length} soumission(s) proviennent encore d'Apps Script. Dernier export source: ${formatDate(health.latestImportAt)}.`
      : "Aucune soumission n'est encore disponible dans Firebase.";
  return `
    <section class="panel data-health-panel ${escapeAttr(health.status)}">
      <header class="data-health-heading">
        <span><i data-lucide="${statusMeta.icon}"></i></span>
        <div><p>Controle de coherence</p><h2>${escapeHtml(statusMeta.title)}</h2><small>${escapeHtml(statusMeta.description)}</small></div>
      </header>
      <div class="data-health-grid">
        ${dataHealthCard({
          icon: health.unlinkedSubmissions.length ? "unlink" : "link-2",
          value: health.unlinkedSubmissions.length,
          label: "Roadmaps non associees",
          description: health.unlinkedSubmissions.length ? "Une soumission ne correspond pas encore a un dossier membre." : "Toutes les roadmaps visibles sont reliees a un dossier.",
          tone: health.unlinkedSubmissions.length ? "attention" : "healthy",
          action: health.unlinkedSubmissions.length ? "unlinked" : "",
          actionLabel: "Associer"
        })}
        ${dataHealthCard({
          icon: health.missingDocumentMembers.length ? "file-question" : "file-check-2",
          value: health.missingDocumentMembers.length,
          label: "Liens Drive manquants",
          description: health.missingDocumentMembers.length ? "Dossiers actifs sans raccourci vers leur document Roadmap Drive." : "Chaque dossier actif contient son raccourci Drive.",
          tone: health.missingDocumentMembers.length ? "attention" : "healthy",
          action: health.missingDocumentMembers.length ? "drive" : "",
          actionLabel: "Configurer"
        })}
        ${dataHealthCard({
          icon: health.missingTargetMetrics.length ? "circle-dashed" : "circle-check-big",
          value: health.missingTargetMetrics.length,
          label: "Cibles Pilotage a cadrer",
          description: health.missingTargetMetrics.length ? "Indicateurs conserves sans seuil invente." : "Toutes les cibles actives sont validees.",
          tone: health.missingTargetMetrics.length ? "attention" : "healthy",
          action: health.missingTargetMetrics.length ? "targets" : "",
          actionLabel: "Ouvrir Pilotage"
        })}
        ${dataHealthCard({
          icon: health.nativeSubmissions.length ? "radio-tower" : "database-zap",
          value: submissionMode,
          label: "Canal des soumissions",
          description: sourceDescription,
          tone: health.nativeSubmissions.length ? "healthy" : "information",
          action: health.nativeSubmissions.length ? "roadmaps" : "firebase-form",
          actionLabel: health.nativeSubmissions.length ? "Voir les donnees" : "Tester Firebase"
        })}
      </div>
    </section>
  `;
}

function dataHealthCard({ icon, value, label, description, tone, action, actionLabel }) {
  return `
    <article class="data-health-card ${escapeAttr(tone || "information")}">
      <span class="data-health-card-icon"><i data-lucide="${icon}"></i></span>
      <div><strong>${escapeHtml(value)}</strong><h3>${escapeHtml(label)}</h3><p>${escapeHtml(description)}</p></div>
      ${action ? `<button class="button" data-health-action="${escapeAttr(action)}" type="button">${escapeHtml(actionLabel)} <i data-lucide="arrow-right"></i></button>` : ""}
    </article>
  `;
}

function activityStat(value, label, icon, tone = "") {
  return `<article class="activity-stat ${tone}"><i data-lucide="${icon}"></i><span><strong>${value || 0}</strong><small>${escapeHtml(label)}</small></span></article>`;
}

function renderClientError(error) {
  return `
    <article class="health-error">
      <div><strong>${escapeHtml(error.context || "Erreur du dashboard")}</strong><p>${escapeHtml(truncate(error.message || "Erreur inconnue", 220))}</p><small>${formatDate(error.createdAt)} · ${escapeHtml(error.actorName || "Owner")}</small></div>
      <button class="button" data-resolve-client-error="${escapeAttr(error.id)}" type="button"><i data-lucide="check"></i> Marquer resolue</button>
    </article>
  `;
}

function renderActivityRow(log) {
  const meta = activityActionMeta(log.action);
  const target = activityTargetLabel(log);
  return `
    <button class="activity-row" data-open-audit="${escapeAttr(log.id)}" type="button">
      <span class="activity-row-icon ${escapeAttr(meta.tone)}"><i data-lucide="${meta.icon}"></i></span>
      <span class="activity-row-copy"><strong>${escapeHtml(meta.label)}</strong><small>${escapeHtml(target)}</small></span>
      <span class="activity-row-actor"><strong>${escapeHtml(log.actorName || "Owner")}</strong><small>${formatDate(log.createdAt)}</small></span>
      <i data-lucide="chevron-right"></i>
    </button>
  `;
}

function filteredActivityLogs() {
  const search = normalize(state.activitySearch);
  return state.auditLogs.filter((log) => {
    if (state.activityActor !== "all" && log.actorName !== state.activityActor) return false;
    if (state.activityEntity !== "all" && log.entityType !== state.activityEntity) return false;
    if (!search) return true;
    return normalize([activityActionMeta(log.action).label, activityTargetLabel(log), log.actorName].join(" ")).includes(search);
  });
}

function activityActionMeta(action) {
  const values = {
    management_task_created: ["Action creee", "circle-plus", "blue"],
    management_task_updated: ["Action modifiee", "pencil", "blue"],
    management_task_completed: ["Action terminee", "circle-check-big", "green"],
    management_task_cancelled: ["Action annulee et conservee", "circle-slash-2", "neutral"],
    management_task_reopened: ["Action rouverte", "rotate-ccw", "amber"],
    management_task_postponed: ["Action reportee", "calendar-clock", "amber"],
    team_member_saved: ["Dossier membre enregistre", "user-round-check", "green"],
    team_member_archived: ["Dossier membre archive", "archive", "neutral"],
    team_member_restored: ["Dossier membre restaure", "rotate-ccw", "green"],
    team_meeting_created: ["Brouillon de rencontre cree", "message-square-plus", "blue"],
    team_meeting_finalized: ["Rencontre 1:1 finalisee", "messages-square", "green"],
    team_meeting_draft_deleted: ["Brouillon de rencontre supprime", "trash-2", "neutral"],
    meeting_summary_shared: ["Compte rendu partage avec le membre", "share-2", "green"],
    meeting_summary_updated: ["Compte rendu partage mis a jour", "save", "blue"],
    meeting_summary_withdrawn: ["Compte rendu retire du portail", "eye-off", "neutral"],
    member_career_plan_saved: ["Mandat de carriere mis a jour", "notebook-tabs", "blue"],
    revenue_scenario_created: ["Projection de revenus creee", "calculator", "green"],
    revenue_scenario_updated: ["Projection de revenus modifiee", "calculator", "blue"],
    revenue_scenario_deleted: ["Projection de revenus supprimee", "trash-2", "neutral"],
    career_milestone_saved: ["Etape de parcours enregistree", "route", "blue"],
    career_update_added: ["Note d'evolution ajoutee", "message-square-plus", "green"],
    career_milestone_archived: ["Etape de parcours archivee", "archive", "neutral"],
    career_milestone_restored: ["Etape de parcours restauree", "rotate-ccw", "amber"],
    roadmap_meeting_completed: ["Rencontre roadmap terminee", "calendar-check", "green"],
    submission_workflow_advanced: ["Roadmap avancee", "move-right", "green"],
    submission_status_changed: ["Etape de roadmap modifiee", "refresh-cw", "blue"],
    submission_member_assigned: ["Roadmap associee a un membre", "link", "blue"],
    submission_archived: ["Roadmap archivee", "archive", "neutral"],
    submission_restored: ["Roadmap restauree", "rotate-ccw", "amber"],
    submission_trashed: ["Roadmap placee dans la corbeille", "trash-2", "neutral"],
    submission_trash_restored: ["Roadmap sortie de la corbeille", "rotate-ccw", "amber"],
    submission_deleted_permanently: ["Roadmap supprimee", "trash", "red"],
    owner_notes_saved: ["Notes owner enregistrees", "notebook-pen", "blue"],
    pilotage_metric_created: ["Indicateur cree", "chart-no-axes-combined", "green"],
    pilotage_metric_updated: ["Indicateur modifie", "chart-no-axes-combined", "blue"],
    pilotage_scorecard_saved: ["Scorecard enregistree", "table-properties", "green"],
    pilotage_rock_created: ["Priorite 90 jours creee", "flag", "green"],
    pilotage_rock_updated: ["Priorite 90 jours modifiee", "flag", "blue"],
    pilotage_issue_created: ["Enjeu ajoute", "list-tree", "amber"],
    pilotage_issue_updated: ["Enjeu modifie", "pencil", "blue"],
    pilotage_issue_solved: ["Enjeu resolu", "circle-check-big", "green"],
    pilotage_issue_reopened: ["Enjeu rouvert", "rotate-ccw", "amber"],
    pilotage_meeting_saved: ["Reunion hebdomadaire enregistree", "save", "blue"],
    pilotage_meeting_finalized: ["Reunion hebdomadaire finalisee", "badge-check", "green"],
    pilotage_meeting_reopened: ["Reunion hebdomadaire rouverte", "rotate-ccw", "amber"],
    development_program_created: ["Programme cree", "library-big", "blue"],
    development_program_updated: ["Programme modifie", "pencil", "blue"],
    development_program_published: ["Programme publie", "badge-check", "green"],
    development_program_draft_deleted: ["Brouillon de programme supprime", "trash-2", "neutral"],
    development_assignment_created: ["Programme assigne", "user-round-plus", "green"],
    development_assignment_paused: ["Programme mis en pause", "pause", "amber"],
    development_assignment_resumed: ["Programme repris", "play", "green"],
    development_assignment_reopened: ["Programme rouvert", "rotate-ccw", "amber"],
    development_step_updated: ["Etape de developpement mise a jour", "list-checks", "blue"],
    working_genius_profile_created: ["Profil Working Genius importe", "sparkles", "green"],
    working_genius_profile_updated: ["Profil Working Genius modifie", "pencil", "blue"],
    working_genius_profile_deleted: ["Profil Working Genius supprime", "trash-2", "neutral"],
    business_strategy_created: ["Strategie sourcee creee", "compass", "green"],
    business_strategy_updated: ["Strategie mise a jour", "compass", "blue"],
    business_strategy_validated: ["Strategie validee", "badge-check", "green"],
    strategy_decision_created: ["Decision strategique ajoutee", "scale", "green"],
    strategy_decision_updated: ["Decision strategique modifiee", "scale", "blue"],
    owner_backup_exported: ["Sauvegarde owner exportee", "download", "green"],
    client_error_resolved: ["Erreur technique resolue", "shield-check", "green"]
  };
  const [label, icon, tone] = values[action] || [humanize(action || "changement"), "history", "neutral"];
  return { label, icon, tone };
}

function activityTargetLabel(log) {
  if (log.entityType === "pilotage") return log.details?.title || log.details?.name || log.details?.weekStart || "Zone Pilotage";
  if (log.entityType === "strategy") return log.details?.title || "Strategie CFSB";
  if (log.entityType === "systemBackup") return `${Number(log.details?.totalRecords || 0)} document(s) · ${String(log.details?.checksum || "").slice(0, 10)}...`;
  if (log.entityType === "development") return [log.details?.teamMemberName, log.details?.title, log.details?.stepTitle].filter(Boolean).join(" · ") || "Developpement equipe";
  if (log.entityType === "workingGenius") return log.details?.teamMemberName || state.teamMembers.find((item) => item.id === log.entityId)?.name || "Profil Working Genius";
  if (log.entityType === "clientError") return log.details?.context || "Etat de sante du dashboard";
  if (log.entityType === "teamMember") {
    return state.teamMembers.find((item) => item.id === log.entityId)?.name || "Dossier equipe";
  }
  if (log.entityType === "teamMeeting") {
    return state.teamMembers.find((item) => item.id === log.details?.teamMemberId)?.name || "Rencontre 1:1";
  }
  if (log.entityType === "memberCareerPlan") {
    return state.teamMembers.find((item) => item.id === log.details?.teamMemberId || item.id === log.entityId)?.name || "Mandat de carriere";
  }
  if (log.entityType === "revenueScenario") {
    return [log.details?.teamMemberName, log.details?.scenarioName].filter(Boolean).join(" · ") || "Projection de revenus";
  }
  if (log.entityType === "careerMilestone") {
    const milestone = state.careerMilestones.find((item) => item.id === log.entityId);
    return milestone?.title || state.teamMembers.find((item) => item.id === log.details?.teamMemberId)?.name || "Parcours CFSB";
  }
  if (log.entityType === "managementTask") {
    return state.managementTasks.find((item) => item.id === log.entityId)?.title || "Action de gestion";
  }
  const submission = state.submissions.find((item) => item.id === log.entityId);
  return submission ? `${submission.employeeName || submission.answers?.employee_name || "Membre"} · ${submission.cycleId || "Roadmap"}` : "Roadmap conservee au journal";
}

function renderTaskCard(task) {
  const member = task.teamMemberId ? state.teamMembers.find((item) => item.id === task.teamMemberId) : null;
  const pilotageTask = ["pilotage", "pilotage_issue"].includes(task.sourceType);
  const sourceLabel = task.sourceType === "roadmap" ? "Roadmap" : task.sourceType === "career" ? "Parcours" : task.sourceType === "meeting" ? "Rencontre 1:1" : pilotageTask ? "Pilotage" : "Action manuelle";
  const sourceIcon = task.sourceType === "roadmap" ? "clipboard-list" : task.sourceType === "career" ? "route" : task.sourceType === "meeting" ? "messages-square" : pilotageTask ? "gauge" : "check-square";
  const overdue = taskIsOverdue(task);
  const openAttribute = task.persisted ? `data-edit-task="${escapeAttr(task.id)}"` : `data-open-task-source="${escapeAttr(task.id)}"`;
  return `
    <article class="task-card ${task.priority === "P1" ? "urgent" : ""} ${overdue ? "overdue" : ""}">
      <button class="task-card-main" ${openAttribute} type="button" aria-label="Ouvrir ${escapeAttr(task.title || "cette action")}">
        <span class="task-source"><i data-lucide="${sourceIcon}"></i>${escapeHtml(sourceLabel)}</span>
        <strong>${escapeHtml(task.title || "Action sans titre")}</strong>
        ${task.description ? `<p>${escapeHtml(truncate(task.description, 180))}</p>` : ""}
        <span class="task-meta">
          ${member || task.teamMemberName ? `<span><i data-lucide="user-round"></i>${escapeHtml(member?.name || task.teamMemberName)}</span>` : ""}
          <span><i data-lucide="user-check"></i>${escapeHtml(task.ownerName || "Non assigne")}</span>
          ${task.dueDate ? `<span class="${overdue ? "is-overdue" : ""}"><i data-lucide="calendar"></i>${overdue ? "En retard · " : ""}${formatDateOnly(task.dueDate)}</span>` : ""}
        </span>
      </button>
      <div class="task-card-actions">
        <span class="priority-pill ${String(task.priority || "P2").toLowerCase()}">${escapeHtml(task.priority || "P2")}</span>
        ${task.persisted ? `
          <button class="button icon-only" data-edit-task="${escapeAttr(task.id)}" type="button" title="Modifier l'action" aria-label="Modifier l'action"><i data-lucide="pencil"></i></button>
          <button class="button icon-only task-complete" data-complete-task="${escapeAttr(task.id)}" type="button" title="Marquer comme terminee" aria-label="Marquer comme terminee"><i data-lucide="check"></i></button>
        ` : task.sourceType === "roadmap" ? renderRoadmapTaskActions(task) : `<button class="button task-source-button" data-open-task-source="${escapeAttr(task.id)}" type="button">Ouvrir <i data-lucide="arrow-right"></i></button>`}
      </div>
    </article>
  `;
}

function renderRoadmapTaskActions(task) {
  const action = roadmapActionDefinition(task.sourceStatus);
  return `
    <button class="button task-source-button" data-open-task-source="${escapeAttr(task.id)}" type="button">Ouvrir</button>
    ${action ? `<button class="button primary task-next-button" data-roadmap-action="${action.id}" data-submission-id="${escapeAttr(task.sourceId)}" type="button">${escapeHtml(action.label)} <i data-lucide="${action.icon}"></i></button>` : ""}
  `;
}

function renderFilters() {
  const roles = [...new Set(state.submissions.map((item) => item.selectedRoleLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const cycles = [...new Set(state.submissions.map((item) => item.cycleId).filter(Boolean))].sort().reverse();
  return `
    <section class="panel filters roadmap-filters ${state.roadmapView === "queue" ? "" : "without-status"}">
      <label class="field">Recherche
        <input id="searchInput" value="${escapeAttr(state.filters.search)}" placeholder="Nom, role, trimestre...">
      </label>
      <label class="field">Role
        <select id="roleFilter">
          <option value="all">Tous les roles</option>
          ${roles.map((role) => `<option value="${escapeAttr(role)}" ${state.filters.role === role ? "selected" : ""}>${escapeHtml(role)}</option>`).join("")}
        </select>
      </label>
      <label class="field">Trimestre
        <select id="cycleFilter">
          <option value="all">Tous les trimestres</option>
          ${cycles.map((cycle) => `<option value="${escapeAttr(cycle)}" ${state.filters.cycle === cycle ? "selected" : ""}>${escapeHtml(cycle)}</option>`).join("")}
        </select>
      </label>
      ${state.roadmapView === "queue" ? `<label class="field">Etape
        <select id="statusFilter">
          <option value="all">Toutes les etapes</option>
          ${WORKFLOW_STATUS_OPTIONS.map(([id, label]) => `<option value="${id}" ${state.filters.status === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
        </select>
      </label>` : ""}
    </section>
  `;
}

function renderTabs() {
  return "";
}

function roadmapBucketCounts() {
  return state.submissions.reduce((counts, item) => {
    counts[submissionBucket(item)] += 1;
    return counts;
  }, { queue: 0, history: 0, trash: 0 });
}

function contextualStatusCounts() {
  const counts = Object.fromEntries(WORKFLOW_STATUS_OPTIONS.map(([id]) => [id, 0]));
  state.submissions.forEach((item) => {
    if (submissionBucket(item) !== "queue" || !matchesRoadmapFilters(item, false)) return;
    const status = effectiveWorkflowStatus(item);
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

function matchesRoadmapFilters(submission, includeStatus = true) {
  const search = normalize(state.filters.search);
  if (state.filters.role !== "all" && submission.selectedRoleLabel !== state.filters.role) return false;
  if (state.filters.cycle !== "all" && submission.cycleId !== state.filters.cycle) return false;
  if (includeStatus && state.roadmapView === "queue" && state.filters.status !== "all" && effectiveWorkflowStatus(submission) !== state.filters.status) return false;
  if (!search) return true;
  return normalize([
    submission.employeeName,
    submission.answers?.employee_name,
    submission.answers?.employee_email,
    submission.selectedRoleLabel,
    submission.cycleId
  ].filter(Boolean).join(" ")).includes(search);
}

function renderSubmissionWorkspace() {
  const submissions = filteredSubmissions();
  const selected = submissions.find((item) => item.id === state.selectedId) || submissions[0];
  if (!selected) {
    return `<section class="panel empty-state"><i data-lucide="inbox"></i><div>Aucune soumission ne correspond aux filtres.</div></section>`;
  }
  const notes = state.ownerNotes[selected.id] || {};
  const responseGroups = groupAnswers(selected);
  const member = memberForSubmission(selected);
  const completion = completionInfo(selected);
  return `
    <div class="workspace">
      <section class="panel responses">
        <header class="submission-header">
          <div>
            <h2>${escapeHtml(selected.employeeName || selected.answers?.employee_name || "Sans nom")}</h2>
            <p>${escapeHtml(selected.selectedRoleLabel || "Role inconnu")} · ${escapeHtml(selected.cycleId || "Sans trimestre")} · ${formatDate(selected.submittedAt)}</p>
          </div>
          <div class="submission-picker">
            <label class="field">Soumission
              <select id="submissionSelect">
                ${submissions.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === selected.id ? "selected" : ""}>${escapeHtml(submissionMenuLabel(item))}</option>`).join("")}
              </select>
            </label>
            <button class="button icon-only" id="printButton" type="button" title="Imprimer le dossier"><i data-lucide="printer"></i></button>
          </div>
        </header>
        <div class="submission-meta">
          ${statusPill(selected.status)}
          <span><i data-lucide="check-circle-2"></i>${completion.percent}% complete · ${completion.answered}/${completion.total} reponses</span>
          <span><i data-lucide="file-clock"></i>Version ${escapeHtml(formVersionLabel(selected))}</span>
          ${member ? `<button class="inline-link" data-open-member="${escapeAttr(member.id)}" type="button"><i data-lucide="user-round"></i>Dossier ${escapeHtml(member.name)}</button>` : `<span class="warning-text"><i data-lucide="unlink"></i>Aucun membre associe</span>`}
        </div>
        ${renderRoadmapActionBar(selected, notes, member)}
        <div class="responses-body">
          ${responseGroups.map((group, index) => `
            <details class="response-section" ${index < 2 ? "open" : ""}>
              <summary>${escapeHtml(group.title)} <span>${group.items.length} reponse(s)</span></summary>
              <dl>
                ${group.items.map((item) => `
                  <div class="answer-row">
                    <dt>${escapeHtml(item.label)}</dt>
                    <dd class="${isEmptyAnswer(item.answer) ? "empty" : ""}">${escapeHtml(formatAnswer(item.answer) || "Sans reponse")}</dd>
                  </div>
                `).join("")}
              </dl>
            </details>
          `).join("")}
          ${renderExistingRoadmapNotes(notes)}
        </div>
      </section>
    </div>
  `;
}

function renderRoadmapActionBar(submission, notes, member) {
  const inTrash = isDeleted(submission);
  const bucket = submissionBucket(submission);
  const action = bucket === "queue" ? roadmapActionDefinition(submission.status || "to_read") : null;
  const instruction = roadmapStepInstruction(submission, notes);
  return `
    <section class="roadmap-action-bar ${inTrash ? "is-trash" : ""}">
      <div class="roadmap-next-step">
        <span>Prochaine action</span>
        <strong>${escapeHtml(instruction)}</strong>
      </div>
      <label class="roadmap-member-assignment">Dossier membre
        <select id="memberAssignment" ${inTrash ? "disabled" : ""}>
          <option value="">Non associe</option>
          ${state.teamMembers.map((item) => `<option value="${escapeAttr(item.id)}" ${member?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}${isArchivedTeamMember(item) ? " (archive)" : ""}</option>`).join("")}
        </select>
      </label>
      <div class="roadmap-action-controls">
        ${action ? `<button class="button primary" data-roadmap-action="${action.id}" data-submission-id="${escapeAttr(submission.id)}" type="button">${escapeHtml(action.label)} <i data-lucide="${action.icon}"></i></button>` : ""}
        ${bucket === "queue" && effectiveWorkflowStatus(submission) === "meeting_planned" ? `<button class="button" data-roadmap-action="mark_unread" data-submission-id="${escapeAttr(submission.id)}" type="button"><i data-lucide="undo-2"></i> Marquer non lue</button>` : ""}
        ${bucket === "history" ? `
          <button class="button" id="restoreButton" type="button"><i data-lucide="rotate-ccw"></i> Rouvrir</button>
          <button class="button danger" id="trashButton" type="button"><i data-lucide="trash-2"></i> Corbeille</button>
        ` : ""}
        ${inTrash ? `
          <button class="button" id="restoreTrashButton" type="button"><i data-lucide="rotate-ccw"></i> Restaurer</button>
          <button class="button danger" id="deleteForeverButton" type="button"><i data-lucide="trash-2"></i> Supprimer</button>
        ` : ""}
      </div>
    </section>
  `;
}

function roadmapStepInstruction(submission, notes) {
  if (isDeleted(submission)) return "Restaurer cette roadmap ou la supprimer definitivement.";
  if (submissionBucket(submission) === "history") return "Cette roadmap est terminee et reste consultable dans l'historique.";
  if (["message_to_send", "meeting_planned"].includes(submission.status)) return "Cette roadmap est lue. Reviens ici apres la rencontre.";
  if (submission.status === "action_required") return notes.nextAction || "Completer le suivi convenu pendant la rencontre.";
  return "Lire les reponses et reperer les points a discuter.";
}

function renderExistingRoadmapNotes(notes) {
  const mainNote = notes.meetingSummary || notes.followupNotes || "";
  const hasLegacy = [notes.meetingFormat, notes.priorityTopics, notes.questions, notes.performance, notes.memberCommitments, notes.directionCommitments].some(Boolean);
  if (!mainNote && !notes.nextAction && !hasLegacy) return "";
  return `
    <details class="existing-roadmap-notes">
      <summary>Notes enregistrees precedemment</summary>
      ${mainNote ? `<p><strong>Note</strong><br>${escapeHtml(mainNote)}</p>` : ""}
      ${notes.nextAction ? `<p><strong>Suivi</strong><br>${escapeHtml(notes.nextAction)}</p>` : ""}
      ${renderLegacyNotes(notes)}
    </details>
  `;
}

function renderLegacyNotes(notes) {
  const fields = [
    ["Ancien format", notes.meetingFormat],
    ["Sujets prioritaires", notes.priorityTopics],
    ["Questions", notes.questions],
    ["Performance", notes.performance],
    ["Engagements du membre", notes.memberCommitments],
    ["Engagements direction", notes.directionCommitments]
  ].filter(([, value]) => value);
  if (!fields.length) return "";
  return `
    <details class="legacy-note">
      <summary>Anciennes notes structurees</summary>
      ${fields.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><br>${escapeHtml(value)}</p>`).join("")}
    </details>
  `;
}

function renderTeamView() {
  if (state.selectedMemberId) return renderMemberProfile();
  if (state.teamWorkspaceView === "working_genius") {
    const activeMembers = state.teamMembers.filter((member) => !isArchivedTeamMember(member));
    const summary = workingGeniusTeamSummary(activeMembers, state.workingGeniusProfiles);
    return `
      <section class="panel team-toolbar">
        <div><p class="eyebrow">Sante organisationnelle</p><h2>Carte Working Genius</h2><p>${summary.complete} profil(s) complet(s) sur ${summary.total} membre(s) actif(s).</p></div>
        <div class="team-toolbar-actions"><button class="button" data-team-workspace="directory" type="button"><i data-lucide="users-round"></i> Dossiers equipe</button></div>
      </section>
      ${renderWorkingGeniusTeamMap(activeMembers)}
    `;
  }
  const isCreating = state.editingMemberId === "__new__";
  const editing = state.teamMembers.find((item) => item.id === state.editingMemberId) || null;
  const unlinked = unlinkedSubmissions();
  const search = normalize(state.teamSearch);
  const activeCount = state.teamMembers.filter((member) => teamMemberBucket(member) === "active").length;
  const archivedCount = state.teamMembers.length - activeCount;
  const viewingArchived = state.teamRosterView === "archived";
  const rosterMembers = state.teamMembers.filter((member) => teamMemberBucket(member) === state.teamRosterView);
  const visibleMembers = rosterMembers.filter((member) => !search || normalize([member.name, member.displayTitle, member.email].join(" ")).includes(search));
  return `
    <section class="panel team-toolbar">
      <div>
        <h2>${viewingArchived ? "Dossiers archives" : "Equipe active"}</h2>
        <p>${visibleMembers.length} membre(s) visible(s). ${viewingArchived ? "Les historiques restent complets et restaurables." : "Chaque dossier rassemble les actions, roadmaps et le parcours."}</p>
      </div>
      <div class="team-toolbar-actions">
        <nav class="team-roster-tabs" aria-label="Etat des dossiers equipe">
          <button class="tab-button ${viewingArchived ? "" : "active"}" data-team-roster="active" type="button"><i data-lucide="users-round"></i> Actifs <span>${activeCount}</span></button>
          <button class="tab-button ${viewingArchived ? "active" : ""}" data-team-roster="archived" type="button"><i data-lucide="archive"></i> Archives <span>${archivedCount}</span></button>
        </nav>
        <button class="button" data-team-workspace="working_genius" type="button"><i data-lucide="sparkles"></i> Working Genius</button>
        <button class="button primary" id="addMemberButton" type="button"><i data-lucide="user-plus"></i> Ajouter un membre</button>
      </div>
    </section>
    <section class="panel team-search-bar">
      <label class="field"><span class="visually-hidden">Rechercher un membre</span><input id="teamSearchInput" value="${escapeAttr(state.teamSearch)}" placeholder="Rechercher par nom, role ou courriel..."></label>
    </section>
    ${unlinked.length && !viewingArchived ? `
      <button class="data-warning" id="openUnlinkedButton" type="button">
        <i data-lucide="unlink"></i>
        <span><strong>${unlinked.length} roadmap(s) a associer</strong>Un nom ne correspond pas encore a un dossier equipe.</span>
        <i data-lucide="arrow-right"></i>
      </button>
    ` : ""}
    <div class="team-layout ${state.editingMemberId ? "" : "team-layout-wide"}">
      <section class="team-directory">
        ${state.departments.map((department) => {
          const members = visibleMembers.filter((member) => member.departmentId === department.id);
          if (!members.length) return "";
          return `
            <article class="panel department-group ${escapeAttr(department.className || department.id)}">
              <header><h3>${escapeHtml(department.label)}</h3><span>${members.length}</span></header>
              <div class="department-members">${members.map(renderTeamMemberCard).join("")}</div>
            </article>
          `;
        }).join("")}
        ${visibleMembers.length ? "" : `<section class="panel empty-state"><i data-lucide="${viewingArchived ? "archive" : "search-x"}"></i><div>${viewingArchived && !search ? "Aucun dossier archive." : "Aucun membre ne correspond a cette recherche."}</div></section>`}
      </section>
      ${state.editingMemberId ? renderMemberForm(editing, isCreating) : ""}
    </div>
  `;
}

function renderTeamMemberCard(member) {
  const archived = isArchivedTeamMember(member);
  const submissions = submissionsForMember(member).filter((item) => !isDeleted(item));
  const tasks = tasksForMember(member.id);
  const milestones = milestonesForMember(member).filter((item) => ["planned", "in_progress", "blocked"].includes(item.status));
  const development = developmentAssignmentsForMember(state.developmentAssignments, member.id).filter((assignment) => effectiveDevelopmentAssignmentStatus(assignment) !== "completed");
  const latest = submissions[0] || null;
  const geniusProfile = state.workingGeniusProfiles[member.id] || {};
  const geniusCodes = geniusProfile.geniuses || [];
  return `
    <div class="member-card ${archived ? "inactive" : ""}">
      <button class="member-card-main" data-open-member="${escapeAttr(member.id)}" type="button">
        <span class="member-avatar">${escapeHtml(initials(member.name))}</span>
        <span class="member-card-copy">
          <strong>${escapeHtml(member.name || "Sans nom")}${archived ? `<span class="member-archive-badge">Archive</span>` : ""}</strong>
          <small>${escapeHtml(member.displayTitle || "Role a preciser")}</small>
          <span class="member-card-stats">
            <span class="${tasks.length ? "needs-attention" : ""}">${tasks.length} action(s)</span>
            <span>${submissions.length} roadmap(s)</span>
            <span>${milestones.length} etape(s)</span>
            <span>${development.length} programme(s)</span>
            ${geniusCodes.length ? `<span class="member-genius-mini">WG ${geniusCodes.map((code) => escapeHtml(code)).join(" · ")}</span>` : ""}
          </span>
          <small>${latest ? `Derniere roadmap: ${formatShortDate(latest.submittedAt)}` : "Aucune roadmap au dossier"}</small>
        </span>
        <i data-lucide="chevron-right"></i>
      </button>
      ${archived
        ? `<span class="member-archive-icon" title="Dossier archive"><i data-lucide="archive"></i></span>`
        : `<button class="member-edit member-action" data-create-member-action="${escapeAttr(member.id)}" type="button" title="Creer une action pour ${escapeAttr(member.name || "ce membre")}"><i data-lucide="plus"></i></button>`}
    </div>
  `;
}

function renderWorkingGeniusTeamMap(members) {
  const map = workingGeniusTeamMap(members, state.workingGeniusProfiles);
  const summary = workingGeniusTeamSummary(members, state.workingGeniusProfiles);
  return `
    <section class="working-genius-metrics">
      ${profileMetric(summary.total, "Membres actifs")}
      ${profileMetric(summary.complete, "Profils complets")}
      ${profileMetric(summary.partial, "Profils partiels")}
      ${profileMetric(summary.missing, "A importer")}
    </section>
    <section class="panel working-genius-map-panel">
      <header class="section-heading"><div><h3>Geniuses dans l'equipe</h3><p>Resultats importes des rapports officiels.</p></div></header>
      <div class="working-genius-map-grid">
        ${map.map((type) => `
          <article class="working-genius-map-card genius-${escapeAttr(type.code.toLowerCase())}">
            <header><span>${escapeHtml(type.code)}</span><div><strong>${escapeHtml(type.label)}</strong><small>${type.members.length} membre(s)</small></div></header>
            <div>${type.members.length ? type.members.map((member) => `<button data-open-member-genius="${escapeAttr(member.id)}" type="button"><span class="member-avatar">${escapeHtml(initials(member.name))}</span><strong>${escapeHtml(member.name)}</strong><i data-lucide="chevron-right"></i></button>`).join("") : `<p>Aucun resultat importe.</p>`}</div>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="panel working-genius-roster-panel">
      <header class="section-heading"><div><h3>Profils importes</h3><p>Les trois zones restent privees pour Michael et Gabriel.</p></div></header>
      <div class="working-genius-roster">
        ${members.map((member) => {
          const profile = state.workingGeniusProfiles[member.id] || {};
          const status = workingGeniusProfileStatus(profile);
          return `
            <article class="working-genius-roster-row">
              <button class="working-genius-member" data-open-member-genius="${escapeAttr(member.id)}" type="button"><span class="member-avatar">${escapeHtml(initials(member.name))}</span><span><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.displayTitle || "Role a preciser")}</small></span></button>
              <div class="working-genius-result-group"><small>Geniuses</small>${renderWorkingGeniusChips(profile.geniuses)}</div>
              <div class="working-genius-result-group"><small>Competencies</small>${renderWorkingGeniusChips(profile.competencies)}</div>
              <div class="working-genius-result-group"><small>Frustrations</small>${renderWorkingGeniusChips(profile.frustrations)}</div>
              <span class="working-genius-profile-status ${status}">${status === "complete" ? "Complet" : status === "partial" ? "Partiel" : "A importer"}</span>
              <div class="working-genius-row-actions">${profile.reportUrl ? `<a class="button icon-only" href="${escapeAttr(safeExternalUrl(profile.reportUrl))}" target="_blank" rel="noopener" title="Ouvrir le rapport officiel"><i data-lucide="external-link"></i></a>` : ""}<button class="button icon-only" data-edit-working-genius="${escapeAttr(member.id)}" type="button" title="Modifier les resultats"><i data-lucide="pencil"></i></button></div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderWorkingGeniusChips(codes = []) {
  return codes.length
    ? `<span class="working-genius-chip-list">${codes.map((code) => `<em title="${escapeAttr(workingGeniusType(code)?.label || code)}">${escapeHtml(code)}</em>`).join("")}</span>`
    : `<span class="working-genius-empty-result">Non classe</span>`;
}

function renderMemberForm(editing, isCreating = false) {
  const archived = editing ? isArchivedTeamMember(editing) : false;
  const portalProfile = editing ? state.memberPortalProfiles[editing.id] || {} : {};
  const invitation = editing ? state.portalInvitations[editing.id] || {} : {};
  const coachDashboardId = portalProfile.coachDashboardId || COACH_ID_BY_MEMBER[editing?.id] || "";
  return `
    <form class="panel member-form" id="memberForm">
      <h2>${editing ? "Modifier le membre" : "Ajouter un membre"}</h2>
      <input type="hidden" name="memberId" value="${escapeAttr(editing?.id || "")}">
      <input type="hidden" name="active" value="${archived ? "false" : "true"}">
      <label class="field">Nom<input name="name" required value="${escapeAttr(editing?.name || "")}"></label>
      <label class="field">Courriel<input name="email" type="email" value="${escapeAttr(editing?.email || "")}" placeholder="nom@exemple.com"></label>
      <label class="field">Departement
        <select name="departmentId" required>
          ${state.departments.map((department) => `<option value="${escapeAttr(department.id)}" ${editing?.departmentId === department.id ? "selected" : ""}>${escapeHtml(department.label)}</option>`).join("")}
        </select>
      </label>
      <label class="field">Titre affiche<input name="displayTitle" required value="${escapeAttr(editing?.displayTitle || "")}"></label>
      <label class="field">Direction de carriere visee<input name="careerTarget" value="${escapeAttr(editing?.careerTarget || "")}" placeholder="Coach professionnel, leadership, specialite..."></label>
      <label class="field">Document Roadmap dans Drive<input name="roadmapDocumentUrl" type="url" value="${escapeAttr(editing ? memberRoadmapDocumentUrl(editing) : "")}" placeholder="https://docs.google.com/..."></label>
      <fieldset class="member-portal-settings">
        <legend>Portail CFSB</legend>
        <p>Ces champs relient les applications sans partager leurs bases de donnees.</p>
        <label class="field">Identifiant Dashboard Coach<input name="coachDashboardId" value="${escapeAttr(coachDashboardId)}" placeholder="Ex.: 15935"></label>
        <label class="field">Courriel Google du membre<input name="portalEmail" type="email" value="${escapeAttr(invitation.email || portalProfile.portalEmail || editing?.email || "")}" placeholder="nom@exemple.com"></label>
        <label class="portal-toggle"><input name="portalEnabled" type="checkbox" ${invitation.active ? "checked" : ""}><span><strong>Autoriser Mon parcours CFSB</strong><small>Le membre pourra activer son espace avec ce compte Google.</small></span></label>
      </fieldset>
      <label class="field">Roles du formulaire<input name="roleIds" value="${escapeAttr((editing?.roleIds || []).join(", "))}" placeholder="coach_professionnel"></label>
      <label class="field">Autres noms reconnus<input name="aliases" value="${escapeAttr((editing?.aliases || []).join(", "))}" placeholder="Nom sans accent, ancien nom"></label>
      <label class="field">Ordre<input name="sortOrder" type="number" min="0" step="1" value="${escapeAttr(editing?.sortOrder ?? 100)}"></label>
      <div class="member-form-status ${archived ? "archived" : "active"}"><i data-lucide="${archived ? "archive" : "circle-check-big"}"></i><span><strong>${archived ? "Dossier archive" : "Dossier actif"}</strong><small>${archived ? "Utilise Restaurer dans le dossier pour le remettre dans l'equipe active." : "Utilise Archiver dans le dossier pour le retirer de l'equipe active."}</small></span></div>
      <div class="notes-actions">
        <button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer</button>
        <button class="button" id="cancelMemberEdit" type="button">Annuler</button>
      </div>
      ${isCreating ? `<p class="form-hint">Le dossier sera cree avec un identifiant permanent. Son nom pourra ensuite changer sans briser son historique.</p>` : ""}
    </form>
  `;
}

function renderMemberProfile() {
  const member = state.teamMembers.find((item) => item.id === state.selectedMemberId);
  if (!member) {
    state.selectedMemberId = "";
    return renderTeamView();
  }
  const submissions = submissionsForMember(member).filter((item) => !isDeleted(item));
  const milestones = milestonesForMember(member, true).filter((item) => !item.archivedAt);
  const activeMilestones = milestones.filter((item) => ["in_progress", "blocked"].includes(item.status));
  const nextMilestone = nextCareerMilestone(milestones);
  const tasks = tasksForMember(member.id);
  const meetings = meetingsForMember(member.id);
  const developmentAssignments = developmentAssignmentsForMember(state.developmentAssignments, member.id);
  const workingGeniusProfile = state.workingGeniusProfiles[member.id] || null;
  const archived = isArchivedTeamMember(member);
  return `
    <section class="member-profile">
      <header class="panel member-profile-header">
        <div class="member-profile-title">
          <button class="button icon-only" id="backToTeamButton" type="button" title="Retour a l'equipe"><i data-lucide="arrow-left"></i></button>
          <div>
            <p class="eyebrow">Dossier longitudinal</p>
            <h2>${escapeHtml(member.name || "Sans nom")}</h2>
            <p>${escapeHtml(member.displayTitle || "Role a preciser")}${member.careerTarget ? ` · Vise: ${escapeHtml(member.careerTarget)}` : ""}${archived ? ` · Dossier archive${member.archivedAt ? ` le ${formatShortDate(member.archivedAt)}` : ""}` : ""}</p>
          </div>
        </div>
        <div class="member-profile-actions">
          ${archived ? "" : `<button class="button primary" data-create-member-action="${escapeAttr(member.id)}" type="button"><i data-lucide="plus"></i> Creer une action</button>`}
          <button class="button" data-edit-member="${escapeAttr(member.id)}" type="button"><i data-lucide="pencil"></i> Modifier</button>
          ${archived
            ? `<button class="button" data-restore-member="${escapeAttr(member.id)}" type="button"><i data-lucide="rotate-ccw"></i> Restaurer le dossier</button>`
            : `<button class="button danger" data-archive-member="${escapeAttr(member.id)}" type="button"><i data-lucide="archive"></i> Archiver le dossier</button>`}
        </div>
      </header>
      <section class="member-metrics">
        ${profileMetric(tasks.length, "Actions ouvertes")}
        ${profileMetric(meetings.length, "Rencontres 1:1")}
        ${profileMetric(submissions.length, "Roadmaps")}
        ${profileMetric(developmentAssignments.filter((assignment) => effectiveDevelopmentAssignmentStatus(assignment) !== "completed").length, "Programmes actifs")}
      </section>
      <nav class="member-section-tabs" aria-label="Sections du dossier membre">
        <button class="tab-button ${state.memberProfileSection === "overview" ? "active" : ""}" data-member-section="overview" type="button"><i data-lucide="layout-dashboard"></i> Vue d'ensemble</button>
        <button class="tab-button ${state.memberProfileSection === "actions" ? "active" : ""}" data-member-section="actions" type="button"><i data-lucide="list-checks"></i> Actions (${tasks.length})</button>
        <button class="tab-button ${state.memberProfileSection === "meetings" ? "active" : ""}" data-member-section="meetings" type="button"><i data-lucide="messages-square"></i> Rencontres (${meetings.length})</button>
        <button class="tab-button ${state.memberProfileSection === "roadmaps" ? "active" : ""}" data-member-section="roadmaps" type="button"><i data-lucide="clipboard-list"></i> Roadmaps (${submissions.length})</button>
        <button class="tab-button ${state.memberProfileSection === "career" ? "active" : ""}" data-member-section="career" type="button"><i data-lucide="route"></i> Parcours CFSB (${milestones.length})</button>
        <button class="tab-button ${state.memberProfileSection === "development" ? "active" : ""}" data-member-section="development" type="button"><i data-lucide="graduation-cap"></i> Developpement (${developmentAssignments.length})</button>
        <button class="tab-button ${state.memberProfileSection === "working_genius" ? "active" : ""}" data-member-section="working_genius" type="button"><i data-lucide="sparkles"></i> Working Genius${workingGeniusProfileStatus(workingGeniusProfile || {}) === "complete" ? " · 6/6" : ""}</button>
      </nav>
      ${state.memberProfileSection === "roadmaps" ? renderRoadmapHistory(submissions) : state.memberProfileSection === "career" ? renderCareerTimeline(member) : state.memberProfileSection === "development" ? renderMemberDevelopment(member, developmentAssignments) : state.memberProfileSection === "working_genius" ? renderMemberWorkingGenius(member, workingGeniusProfile) : state.memberProfileSection === "actions" ? renderMemberActions(member, tasks) : state.memberProfileSection === "meetings" ? renderMemberMeetings(member, meetings) : renderMemberOverview(member, submissions, tasks, meetings, milestones, nextMilestone)}
    </section>
  `;
}

function renderMemberDevelopment(member, assignments) {
  return `
    <section class="panel member-development-panel">
      <header class="section-heading"><div><h3>Onboarding, formations et evaluations</h3><p>${assignments.length} programme(s) au dossier.</p></div><button class="button primary" data-assign-development-member="${escapeAttr(member.id)}" type="button" ${latestPublishedPrograms(state.developmentPrograms).length ? "" : "disabled"}><i data-lucide="plus"></i> Assigner</button></header>
      ${assignments.length ? `<div class="member-development-list">${assignments.map((assignment) => {
        const progress = developmentAssignmentProgress(assignment);
        const status = effectiveDevelopmentAssignmentStatus(assignment);
        return `<button data-open-member-development="${escapeAttr(assignment.id)}" type="button"><span class="development-type-pill ${escapeAttr(assignment.programType || "training")}">${escapeHtml(DEVELOPMENT_PROGRAM_TYPE_LABELS[assignment.programType] || "Programme")}</span><span><strong>${escapeHtml(assignment.programTitle || "Programme")}</strong><small>Version ${Number(assignment.programVersion || 1)} · ${escapeHtml(assignment.ownerName || "Gabriel")}</small><i class="development-card-progress"><b style="width:${progress.percent}%"></b></i></span><span><strong>${progress.percent}%</strong><small>${escapeHtml(DEVELOPMENT_ASSIGNMENT_STATUS_LABELS[status] || humanize(status))}</small></span><i data-lucide="arrow-right"></i></button>`;
      }).join("")}</div>` : `<div class="empty-state"><i data-lucide="graduation-cap"></i><div>Aucun programme assigne a ${escapeHtml(member.name)}.</div></div>`}
    </section>
  `;
}

function renderMemberWorkingGenius(member, profile = null) {
  const status = workingGeniusProfileStatus(profile || {});
  return `
    <section class="panel member-working-genius-panel">
      <header class="section-heading"><div><h3>Profil Working Genius</h3><p>Resultats provenant du rapport officiel du membre.</p></div><button class="button primary" data-edit-working-genius="${escapeAttr(member.id)}" type="button"><i data-lucide="${profile ? "pencil" : "plus"}"></i> ${profile ? "Modifier" : "Importer"}</button></header>
      ${profile ? `
        <div class="member-working-genius-status"><span class="working-genius-profile-status ${status}">${status === "complete" ? "Profil complet" : "Profil partiel"}</span>${profile.assessmentDate ? `<span>Evaluation du ${escapeHtml(formatDateOnly(profile.assessmentDate))}</span>` : ""}${profile.reportUrl ? `<a class="inline-link" href="${escapeAttr(safeExternalUrl(profile.reportUrl))}" target="_blank" rel="noopener">Rapport officiel <i data-lucide="external-link"></i></a>` : ""}</div>
        <div class="member-working-genius-groups">
          ${[["geniuses", "Geniuses"], ["competencies", "Competencies"], ["frustrations", "Frustrations"]].map(([key, label]) => `<article class="working-genius-zone ${key}"><small>${label}</small><div>${(profile[key] || []).length ? (profile[key] || []).map((code) => `<span><strong>${escapeHtml(code)}</strong>${escapeHtml(workingGeniusType(code)?.label || code)}</span>`).join("") : `<em>Resultat a importer</em>`}</div></article>`).join("")}
        </div>
        ${profile.notes ? `<aside class="working-genius-notes"><strong>Notes internes</strong><p>${escapeHtml(profile.notes)}</p></aside>` : ""}
      ` : `<div class="empty-state"><i data-lucide="sparkles"></i><div><strong>Aucun resultat importe</strong><span>Le test demeure sur le site officiel; seul son rapport est conserve ici.</span></div><button class="button primary" data-edit-working-genius="${escapeAttr(member.id)}" type="button">Importer le profil</button></div>`}
    </section>
  `;
}

function renderWorkingGeniusEditor() {
  const member = state.teamMembers.find((item) => item.id === state.workingGeniusEditorMemberId);
  if (!member) return "";
  const profile = state.workingGeniusProfiles[member.id] || null;
  const status = workingGeniusProfileStatus(profile || {});
  return `
    <div class="career-modal" role="dialog" aria-modal="true" aria-labelledby="workingGeniusEditorTitle">
      <div class="career-modal-backdrop" data-close-working-genius aria-hidden="true"></div>
      <section class="career-editor working-genius-editor panel">
        <header class="career-editor-header"><div><p class="eyebrow">${escapeHtml(member.name)}</p><h2 id="workingGeniusEditorTitle">Resultats Working Genius</h2></div><button class="button icon-only" data-close-working-genius type="button" aria-label="Fermer"><i data-lucide="x"></i></button></header>
        <div class="career-editor-scroll">
          <form id="workingGeniusForm" class="working-genius-form">
            <div class="working-genius-editor-status"><span class="working-genius-profile-status ${status}">${status === "complete" ? "6 resultats classes" : status === "partial" ? "Profil partiel" : "Nouveau profil"}</span><small>Import du rapport officiel</small></div>
            <section class="working-genius-classification">
              ${WORKING_GENIUS_TYPES.map((type) => {
                const selected = WORKING_GENIUS_BUCKETS.find(([key]) => (profile?.[key] || []).includes(type.code))?.[0] || "";
                return `<label><span class="working-genius-code genius-${escapeAttr(type.code.toLowerCase())}">${escapeHtml(type.code)}</span><span><strong>${escapeHtml(type.label)}</strong><small>Type officiel</small></span><select name="workingGenius_${escapeAttr(type.code)}"><option value="">Non classe</option>${WORKING_GENIUS_BUCKETS.map(([key, label]) => `<option value="${key}" ${selected === key ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>`;
              }).join("")}
            </section>
            <div class="working-genius-source-fields">
              <label class="field">Date de l'evaluation<input name="assessmentDate" type="date" value="${escapeAttr(profile?.assessmentDate || "")}"></label>
              <label class="field">Lien du rapport officiel<input name="reportUrl" type="url" value="${escapeAttr(profile?.reportUrl || "")}" placeholder="https://..."></label>
              <label class="field field-wide">Source<input name="sourceLabel" value="${escapeAttr(profile?.sourceLabel || "Rapport officiel Working Genius")}"></label>
              <label class="field field-wide">Notes internes<textarea name="notes">${escapeHtml(profile?.notes || "")}</textarea></label>
            </div>
            <footer class="pilotage-editor-actions">
              ${profile ? `<button class="button danger push-left" id="deleteWorkingGeniusProfile" type="button"><i data-lucide="trash-2"></i> Supprimer</button>` : ""}
              <button class="button" data-close-working-genius type="button">Fermer</button>
              <button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer</button>
            </footer>
          </form>
        </div>
      </section>
    </div>
  `;
}

function renderMemberOverview(member, submissions, tasks, meetings, milestones, nextMilestone) {
  const latest = submissions[0] || null;
  const recent = submissions.slice(0, 3);
  const latestMeeting = meetings.find((item) => item.status === "finalized") || meetings[0] || null;
  const activeMilestones = milestones.filter((item) => ["planned", "in_progress", "blocked"].includes(item.status)).slice(0, 3);
  const roadmapDocumentUrl = memberRoadmapDocumentUrl(member);
  const portalEnabled = Boolean(state.portalInvitations[member.id]?.active);
  const coachDashboardId = memberCoachDashboardId(member);
  const workingGeniusProfile = state.workingGeniusProfiles[member.id] || null;
  return `
    <section class="member-overview-grid">
      <article class="panel member-overview-panel attention-panel">
        <div class="section-heading"><div><h3>Prochaines actions</h3><p>Ce que Michael et Gabriel doivent faire ensuite.</p></div><button class="inline-link" data-member-section="actions" type="button">Tout voir</button></div>
        ${tasks.length ? `<div class="compact-task-list">${tasks.slice(0, 4).map(renderCompactTask).join("")}</div>` : `<div class="empty-state compact-empty"><i data-lucide="circle-check-big"></i><div>Aucune action ouverte.</div></div>`}
      </article>
      <article class="panel member-overview-panel">
        <div class="section-heading"><div><h3>Parcours actuel</h3><p>Direction de carriere et prochaine cible.</p></div><button class="inline-link" data-member-section="career" type="button">Ouvrir</button></div>
        <div class="member-focus">
          <span class="focus-icon"><i data-lucide="route"></i></span>
          <div><small>Direction visee</small><strong>${escapeHtml(member.careerTarget || "A preciser")}</strong></div>
        </div>
        <div class="member-focus">
          <span class="focus-icon"><i data-lucide="flag"></i></span>
          <div><small>Prochaine etape</small><strong>${escapeHtml(nextMilestone?.title || "Aucune etape planifiee")}</strong>${nextMilestone?.targetDate ? `<span>${formatDateOnly(nextMilestone.targetDate)}</span>` : ""}</div>
        </div>
        ${activeMilestones.length ? `<div class="mini-milestones">${activeMilestones.map((item) => `<button data-open-career="${escapeAttr(item.id)}" type="button">${careerStatusPill(item.status)}<span>${escapeHtml(item.title)}</span><strong>${clampProgress(item.progress)}%</strong></button>`).join("")}</div>` : ""}
      </article>
      <article class="panel member-overview-panel">
        <div class="section-heading"><div><h3>Derniere rencontre 1:1</h3><p>${latestMeeting ? `${formatShortDate(latestMeeting.meetingDate || latestMeeting.createdAt)} · ${escapeHtml(latestMeeting.facilitatorName || "Leader a preciser")}` : "Aucune rencontre enregistree."}</p></div><button class="inline-link" data-member-section="meetings" type="button">Historique</button></div>
        ${latestMeeting ? `
          <button class="meeting-overview-card" data-open-meeting="${escapeAttr(latestMeeting.id)}" type="button">
            <span>${meetingStatusPill(latestMeeting.status)}</span>
            <strong>${escapeHtml(MEETING_PILLAR_LABELS[latestMeeting.pillar] || "Rencontre generale")}</strong>
            <small>${escapeHtml(truncate(latestMeeting.memberCommitment || latestMeeting.leverageAction || latestMeeting.checkIn || "Consulter la note de rencontre.", 170))}</small>
            <i data-lucide="arrow-right"></i>
          </button>
        ` : `<div class="empty-state compact-empty"><i data-lucide="messages-square"></i><div>Commence une premiere rencontre depuis l'onglet Rencontres.</div></div>`}
      </article>
      <article class="panel member-overview-panel">
        <div class="section-heading"><div><h3>Documents et outils</h3><p>Acces rapide pendant une rencontre.</p></div>${roadmapDocumentUrl ? `<a class="inline-link" href="${escapeAttr(safeExternalUrl(roadmapDocumentUrl))}" target="_blank" rel="noopener">Ouvrir Drive</a>` : ""}</div>
        <div class="member-resource-actions">
          <a class="resource-button" href="${TEAM_PORTAL_PATH}?member=${encodeURIComponent(member.id)}"><span><i data-lucide="user-round-cog"></i><strong>Mon parcours CFSB</strong><small>${portalEnabled ? "Acces membre active · ouvrir l'apercu partage" : "Apercu owner · acces membre non active"}</small></span><i data-lucide="arrow-right"></i></a>
          ${coachDashboardId ? `<a class="resource-button" href="${COACH_DASHBOARD_URL}?coach=${encodeURIComponent(coachDashboardId)}" target="_blank" rel="noopener"><span><i data-lucide="dumbbell"></i><strong>Operations coach</strong><small>Ouvrir ses clients et suivis dans le Dashboard Coach</small></span><i data-lucide="external-link"></i></a>` : ""}
          ${roadmapDocumentUrl ? `<a class="resource-button" href="${escapeAttr(safeExternalUrl(roadmapDocumentUrl))}" target="_blank" rel="noopener"><span><i data-lucide="file-text"></i><strong>Document Roadmap</strong><small>Prise de notes partagee dans Google Drive</small></span><i data-lucide="external-link"></i></a>` : `<button class="resource-button muted" data-edit-member="${escapeAttr(member.id)}" type="button"><span><i data-lucide="link"></i><strong>Ajouter le document Drive</strong><small>Le lien n'est pas encore configure.</small></span><i data-lucide="pencil"></i></button>`}
          ${workingGeniusProfile?.reportUrl ? `<a class="resource-button" href="${escapeAttr(safeExternalUrl(workingGeniusProfile.reportUrl))}" target="_blank" rel="noopener"><span><i data-lucide="sparkles"></i><strong>Rapport Working Genius</strong><small>Resultats officiels importes au dossier</small></span><i data-lucide="external-link"></i></a>` : ""}
          ${memberHasRevenueTool(member) ? `<a class="resource-button" href="./revenue.html?member=${encodeURIComponent(member.id)}"><span><i data-lucide="calculator"></i><strong>Projection de revenus</strong><small>Construire et enregistrer un scenario salarial</small></span><i data-lucide="arrow-right"></i></a>` : ""}
        </div>
      </article>
      <article class="panel member-overview-panel overview-wide">
        <div class="section-heading"><div><h3>Roadmaps recentes</h3><p>${latest ? `Derniere reception le ${formatShortDate(latest.submittedAt)}.` : "Aucune roadmap recue."}</p></div><button class="inline-link" data-member-section="roadmaps" type="button">Historique complet</button></div>
        ${recent.length ? `<div class="recent-roadmaps">${recent.map((item) => `<button data-open-submission="${escapeAttr(item.id)}" type="button"><span>${statusPill(item.status)}</span><strong>${escapeHtml(item.cycleId || "Sans trimestre")}</strong><small>${formatDate(item.submittedAt)} · ${completionInfo(item).percent}% complete</small><i data-lucide="arrow-right"></i></button>`).join("")}</div>` : `<div class="empty-state compact-empty"><i data-lucide="clipboard-x"></i><div>Aucune roadmap au dossier.</div></div>`}
      </article>
    </section>
  `;
}

function renderMemberMeetings(member, meetings) {
  const drafts = meetings.filter((item) => item.status !== "finalized");
  const finalized = meetings.filter((item) => item.status === "finalized");
  const archived = isArchivedTeamMember(member);
  return `
    <section class="meeting-history-view">
      <header class="panel meeting-history-header">
        <div>
          <p class="eyebrow">Mentorat individuel</p>
          <h3>Rencontres 1:1</h3>
          <p>Notes privees pour Michael et Gabriel. Les rendez-vous continuent d'etre planifies dans votre logiciel habituel.</p>
        </div>
        ${archived ? `<span class="meeting-archive-note"><i data-lucide="archive"></i>Dossier archive · historique en lecture seule</span>` : `<button class="button primary" id="addTeamMeeting" type="button"><i data-lucide="message-square-plus"></i> Nouvelle rencontre</button>`}
      </header>
      ${drafts.length ? `
        <section class="panel meeting-draft-section">
          <div class="section-heading"><div><h3>Brouillons en cours</h3><p>Continue la prise de notes sans perdre ce qui a deja ete ecrit.</p></div><span class="meeting-count">${drafts.length}</span></div>
          <div class="meeting-card-grid">${drafts.map(renderMeetingCard).join("")}</div>
        </section>
      ` : ""}
      <section class="panel meeting-timeline-panel">
        <div class="section-heading"><div><h3>Historique des rencontres</h3><p>Les notes finalisees sont conservees du plus recent au plus ancien.</p></div><span class="meeting-count">${finalized.length}</span></div>
        ${finalized.length ? `<div class="meeting-timeline">${finalized.map(renderMeetingCard).join("")}</div>` : `<div class="empty-state"><i data-lucide="messages-square"></i><div>Aucune rencontre finalisee dans ce dossier.</div></div>`}
      </section>
    </section>
  `;
}

function renderMeetingCard(meeting) {
  const summary = meeting.memberCommitment || meeting.leverageAction || meeting.pillarNotes || meeting.checkIn || "Aucun resume saisi.";
  return `
    <button class="meeting-card ${meeting.status === "finalized" ? "finalized" : "draft"}" data-open-meeting="${escapeAttr(meeting.id)}" type="button">
      <span class="meeting-card-date"><strong>${formatShortDate(meeting.meetingDate || meeting.createdAt)}</strong><small>${escapeHtml(meeting.facilitatorName || "Leader a preciser")}</small></span>
      <span class="meeting-card-main"><span>${meetingStatusPill(meeting.status)}${meeting.pillar ? `<em>${escapeHtml(MEETING_PILLAR_LABELS[meeting.pillar] || "Autre")}</em>` : ""}</span><strong>${meeting.status === "finalized" ? "Rencontre finalisee" : "Brouillon a poursuivre"}</strong><small>${escapeHtml(truncate(summary, 220))}</small></span>
      <i data-lucide="chevron-right"></i>
    </button>
  `;
}

function renderMeetingEditor() {
  const meeting = state.teamMeetings.find((item) => item.id === state.meetingEditorId);
  const member = state.teamMembers.find((item) => item.id === meeting?.teamMemberId || item.id === state.selectedMemberId);
  if (!meeting || !member) return "";
  const finalized = meeting.status === "finalized";
  const memberArchived = isArchivedTeamMember(member);
  const editable = !finalized && !memberArchived;
  const previous = meetingsForMember(member.id).find((item) => item.id !== meeting.id && item.status === "finalized") || null;
  const submissions = submissionsForMember(member).filter((item) => !isDeleted(item));
  const roadmapDocumentUrl = memberRoadmapDocumentUrl(member);
  const disabled = editable ? "" : "disabled";
  return `
    <div class="career-modal meeting-modal" role="dialog" aria-modal="true" aria-labelledby="meetingEditorTitle">
      <div class="career-modal-backdrop" data-close-meeting aria-hidden="true"></div>
      <section class="meeting-editor panel">
        <header class="career-editor-header meeting-editor-header">
          <div><p class="eyebrow">${escapeHtml(member.name)} · Rencontre 1:1</p><h2 id="meetingEditorTitle">${editable ? "Prise de notes en direct" : "Note de rencontre"}</h2></div>
          <div class="meeting-header-actions">
            ${finalized ? meetingStatusPill("finalized") : memberArchived ? `<span class="meeting-status-pill draft"><i data-lucide="archive"></i>Dossier archive</span>` : `<span class="meeting-save-status ${escapeAttr(state.meetingSaveState)}" id="meetingSaveStatus">${meetingSaveStatusLabel()}</span>`}
            <button class="button icon-only" data-close-meeting type="button" title="Fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
          </div>
        </header>
        <div class="meeting-editor-scroll">
          ${previous ? `
            <aside class="meeting-previous-context">
              <span class="meeting-context-icon"><i data-lucide="history"></i></span>
              <div><strong>Dernier engagement</strong><p>${escapeHtml(previous.memberCommitment || "Aucun engagement note.")}</p>${previous.successMeasure ? `<small>Mesure: ${escapeHtml(previous.successMeasure)}</small>` : ""}</div>
              <button class="inline-link" data-open-meeting="${escapeAttr(previous.id)}" type="button">Relire la rencontre</button>
            </aside>
          ` : ""}
          <form id="meetingForm" class="meeting-form" data-meeting-id="${escapeAttr(meeting.id)}">
            <input type="hidden" name="meetingId" value="${escapeAttr(meeting.id)}">
            <section class="meeting-form-section meeting-form-meta">
              <div class="meeting-section-heading"><span>Prep</span><div><h3>Cadre de la rencontre</h3><p>La date documente l'historique; elle ne planifie aucun rendez-vous.</p></div></div>
              <div class="meeting-form-grid">
                <label class="field">Date de la rencontre<input name="meetingDate" type="date" value="${escapeAttr(dateInputValue(meeting.meetingDate) || todayInputValue())}" ${disabled}></label>
                <label class="field">Leader qui mene<select name="facilitatorName" ${disabled}>${MEETING_FACILITATORS.map((name) => `<option value="${escapeAttr(name)}" ${(meeting.facilitatorName || "Gabriel") === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
                <label class="field field-wide">Roadmap trimestrielle consultee <span class="field-optional">facultatif</span><select name="sourceRoadmapId" ${disabled}><option value="">Aucune</option>${submissions.map((submission) => `<option value="${escapeAttr(submission.id)}" ${meeting.sourceRoadmapId === submission.id ? "selected" : ""}>${escapeHtml(submissionLabel(submission))}</option>`).join("")}</select></label>
              </div>
              ${roadmapDocumentUrl ? `<a class="meeting-drive-link" href="${escapeAttr(safeExternalUrl(roadmapDocumentUrl))}" target="_blank" rel="noopener"><i data-lucide="file-text"></i><span><strong>Ouvrir le document Roadmap de ${escapeHtml(member.name)}</strong><small>Le document Drive demeure separe et peut etre utilise par le coach pendant la rencontre.</small></span><i data-lucide="external-link"></i></a>` : `<button class="meeting-drive-link missing" data-edit-member="${escapeAttr(member.id)}" type="button"><i data-lucide="link"></i><span><strong>Ajouter le lien vers son document Drive</strong><small>Aucun document n'est encore associe a ce dossier.</small></span><i data-lucide="pencil"></i></button>`}
            </section>
            <section class="meeting-form-section">
              <div class="meeting-section-heading"><span>1</span><div><h3>Check-in humain</h3><p>Comment ca va vraiment? Qu'est-ce qui pese ou qui eclaire en ce moment?</p></div></div>
              <label class="field"><span class="visually-hidden">Check-in humain</span><textarea name="checkIn" rows="4" placeholder="Notes sur l'etat humain, l'energie et le contexte..." ${disabled}>${escapeHtml(meeting.checkIn || "")}</textarea></label>
            </section>
            <section class="meeting-form-section">
              <div class="meeting-section-heading"><span>2</span><div><h3>Revue des engagements</h3><p>Reviens sur ce qui avait ete convenu au dernier 1:1.</p></div></div>
              <div class="meeting-form-grid">
                <label class="field">Statut<select name="previousCommitmentStatus" ${disabled}>${MEETING_COMMITMENT_OPTIONS.map(([id, label]) => `<option value="${id}" ${(meeting.previousCommitmentStatus || "not_applicable") === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
                <label class="field field-wide">Ce qui a fonctionne ou bloque<textarea name="previousCommitmentNotes" rows="3" placeholder="Faits, apprentissages et obstacles..." ${disabled}>${escapeHtml(meeting.previousCommitmentNotes || "")}</textarea></label>
              </div>
            </section>
            <section class="meeting-form-section">
              <div class="meeting-section-heading"><span>3</span><div><h3>Un pilier ce mois-ci</h3><p>Choisis un seul angle pour aller en profondeur.</p></div></div>
              <div class="meeting-form-grid">
                <label class="field">Pilier<select name="pillar" ${disabled}>${MEETING_PILLAR_OPTIONS.map(([id, label]) => `<option value="${id}" ${(meeting.pillar || "") === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
                <label class="field field-wide">Observations et reflexions<textarea name="pillarNotes" rows="4" placeholder="Argent, competence ou relation: ce qui merite d'etre travaille maintenant..." ${disabled}>${escapeHtml(meeting.pillarNotes || "")}</textarea></label>
              </div>
            </section>
            <section class="meeting-form-section">
              <div class="meeting-section-heading"><span>4</span><div><h3>Levier principal</h3><p>Quelle action pourrait debloquer le reste?</p></div></div>
              <label class="field"><span class="visually-hidden">Levier principal</span><textarea name="leverageAction" rows="3" placeholder="Une action a haut impact..." ${disabled}>${escapeHtml(meeting.leverageAction || "")}</textarea></label>
            </section>
            <section class="meeting-form-section">
              <div class="meeting-section-heading"><span>5</span><div><h3>Engagement du membre</h3><p>Un engagement concret et une facon claire de constater qu'il est realise.</p></div></div>
              <div class="meeting-form-grid">
                <label class="field field-wide">Engagement<textarea name="memberCommitment" rows="3" placeholder="Sur quoi le membre s'engage..." ${disabled}>${escapeHtml(meeting.memberCommitment || "")}</textarea></label>
                <label class="field field-wide">Comment saura-t-on que c'est fait?<textarea name="successMeasure" rows="2" placeholder="Resultat observable ou mesure simple..." ${disabled}>${escapeHtml(meeting.successMeasure || "")}</textarea></label>
              </div>
            </section>
            <section class="meeting-form-section">
              <div class="meeting-section-heading"><span>6</span><div><h3>Soutien promis par le leader</h3><p>Ce que Michael ou Gabriel fera concretement pour aider.</p></div></div>
              <label class="field"><span class="visually-hidden">Soutien promis</span><textarea name="leaderSupport" rows="3" placeholder="Introduction, budget, feedback, ressource ou autre soutien..." ${disabled}>${escapeHtml(meeting.leaderSupport || "")}</textarea></label>
              ${editable ? `<label class="meeting-task-option"><input name="createSupportTask" type="checkbox" ${meeting.leaderSupport ? "checked" : ""}><span><strong>Ajouter ce soutien dans A faire lors de la finalisation</strong><small>Une action sera creee pour le leader qui mene la rencontre.</small></span></label>` : meeting.supportTaskId ? `<p class="meeting-linked-task"><i data-lucide="list-checks"></i>Le soutien promis a ete ajoute dans A faire.</p>` : ""}
            </section>
            <section class="meeting-form-section">
              <div class="meeting-section-heading"><span>+</span><div><h3>Notes additionnelles</h3><p>Conserve seulement les signaux utiles pour la prochaine conversation.</p></div></div>
              <div class="meeting-form-grid">
                <label class="field field-wide">Notes libres<textarea name="additionalNotes" rows="4" placeholder="Contexte ou detail important..." ${disabled}>${escapeHtml(meeting.additionalNotes || "")}</textarea></label>
                <label class="field field-wide">Signaux a suivre<textarea name="signals" rows="3" placeholder="Element a surveiller sans en faire necessairement une action..." ${disabled}>${escapeHtml(meeting.signals || "")}</textarea></label>
              </div>
            </section>
            <footer class="meeting-form-actions">
              ${!editable ? `<button class="button" data-close-meeting type="button"><i data-lucide="x"></i> Fermer</button><span class="meeting-finalized-meta">${finalized ? `Finalisee ${meeting.finalizedAt ? `le ${formatDate(meeting.finalizedAt)}` : ""} par ${escapeHtml(meeting.finalizedByName || meeting.updatedByName || "un owner")}` : "Dossier archive · restaure le membre pour poursuivre ce brouillon."}</span>` : `
                <button class="button primary" id="finalizeMeetingButton" type="button"><i data-lucide="check-circle-2"></i> Finaliser la rencontre</button>
                <button class="button" id="saveMeetingNowButton" type="button"><i data-lucide="save"></i> Enregistrer maintenant</button>
                <button class="button danger push-right" id="deleteMeetingDraftButton" type="button"><i data-lucide="trash-2"></i> Supprimer le brouillon</button>
              `}
            </footer>
          </form>
          ${finalized ? renderSharedSummaryEditor(meeting, member) : ""}
        </div>
      </section>
    </div>
  `;
}

function renderSharedSummaryEditor(meeting, member) {
  const summary = sharedSummaryForMeeting(meeting.id) || {};
  const published = Boolean(summary.id);
  return `
    <form class="meeting-form shared-summary-form" id="sharedSummaryForm">
      <input type="hidden" name="meetingId" value="${escapeAttr(meeting.id)}">
      <section class="meeting-form-section shared-summary-section">
        <div class="meeting-section-heading"><span><i data-lucide="share-2"></i></span><div><h3>Compte rendu partage avec ${escapeHtml(member.name)}</h3><p>Cette section est separee des notes owners. Seul ce contenu apparaitra dans Mon parcours CFSB.</p></div></div>
        <div class="meeting-form-grid">
          <label class="field field-wide">Titre du compte rendu<input name="headline" value="${escapeAttr(summary.headline || `Rencontre du ${formatShortDate(meeting.meetingDate || meeting.finalizedAt)}`)}" placeholder="Ex.: Priorite des 90 prochains jours"></label>
          <label class="field field-wide">Resume partage<textarea name="summary" rows="4" placeholder="Le contexte et les decisions utiles au membre...">${escapeHtml(summary.summary || "")}</textarea></label>
          <label class="field field-wide">Engagements du membre<textarea name="commitments" rows="3" placeholder="Ce que le membre a choisi de mettre en action...">${escapeHtml(summary.commitments || meeting.memberCommitment || "")}</textarea></label>
          <label class="field field-wide">Soutien de la direction<textarea name="ownerSupport" rows="3" placeholder="Ce que Michael ou Gabriel s'engage a fournir...">${escapeHtml(summary.ownerSupport || meeting.leaderSupport || "")}</textarea></label>
        </div>
        <div class="shared-summary-actions">
          <button class="button primary" type="submit"><i data-lucide="${published ? "save" : "send"}"></i> ${published ? "Mettre a jour" : "Partager le compte rendu"}</button>
          ${published ? `<button class="button danger" id="withdrawSharedSummary" type="button"><i data-lucide="eye-off"></i> Retirer du portail</button><span>Partage ${summary.publishedAt ? formatDate(summary.publishedAt) : "recemment"}</span>` : `<span>Rien n'est visible par le membre avant de cliquer sur Partager.</span>`}
        </div>
      </section>
    </form>
  `;
}

function renderMemberActions(member, tasks) {
  const history = historicalTasksForMember(member.id);
  const showingHistory = state.memberActionView === "history";
  return `
    <section class="panel timeline-panel">
      <div class="section-heading member-action-heading">
        <div><h3>Actions pour ${escapeHtml(member.name)}</h3><p>Le travail ouvert et les actions deja traitees, sans perdre le fil.</p></div>
        <button class="button primary" data-create-member-action="${escapeAttr(member.id)}" type="button"><i data-lucide="plus"></i> Creer une action</button>
      </div>
      <nav class="member-action-tabs" aria-label="Etat des actions">
        <button class="tab-button ${showingHistory ? "" : "active"}" data-member-action-view="open" type="button">Ouvertes <span>${tasks.length}</span></button>
        <button class="tab-button ${showingHistory ? "active" : ""}" data-member-action-view="history" type="button">Historique <span>${history.length}</span></button>
      </nav>
      <div class="task-list member-task-list">
        ${showingHistory
          ? history.length ? history.map(renderHistoricalTaskCard).join("") : `<div class="empty-state"><i data-lucide="history"></i><div>Aucune action terminee ou annulee.</div></div>`
          : tasks.length ? tasks.map(renderTaskCard).join("") : `<div class="empty-state"><i data-lucide="circle-check-big"></i><div>Aucune action ouverte pour ce membre.</div></div>`}
      </div>
    </section>
  `;
}

function renderHistoricalTaskCard(task) {
  const cancelled = task.status === "cancelled";
  const statusLabel = TASK_STATUS_LABELS[task.status] || "Traitee";
  const finishedAt = task.completedAt || task.cancelledAt || task.updatedAt;
  return `
    <article class="task-card task-card-history ${cancelled ? "cancelled" : "completed"}">
      <button class="task-card-main" data-edit-task="${escapeAttr(task.id)}" type="button" aria-label="Consulter ${escapeAttr(task.title || "cette action")}">
        <span class="task-source"><i data-lucide="${cancelled ? "circle-slash-2" : "circle-check-big"}"></i>${escapeHtml(statusLabel)}</span>
        <strong>${escapeHtml(task.title || "Action sans titre")}</strong>
        ${task.description ? `<p>${escapeHtml(truncate(task.description, 180))}</p>` : ""}
        <span class="task-meta">
          <span><i data-lucide="user-check"></i>${escapeHtml(task.ownerName || "Non assigne")}</span>
          <span><i data-lucide="clock-3"></i>${finishedAt ? formatDate(finishedAt) : "Date inconnue"}</span>
        </span>
      </button>
      <div class="task-card-actions">
        <span class="task-status-pill ${cancelled ? "cancelled" : "completed"}">${escapeHtml(statusLabel)}</span>
        <button class="button icon-only" data-reopen-task="${escapeAttr(task.id)}" type="button" title="Rouvrir l'action" aria-label="Rouvrir l'action"><i data-lucide="rotate-ccw"></i></button>
        <button class="button icon-only" data-edit-task="${escapeAttr(task.id)}" type="button" title="Consulter ou modifier" aria-label="Consulter ou modifier"><i data-lucide="pencil"></i></button>
      </div>
    </article>
  `;
}

function renderCompactTask(task) {
  const context = task.dueDate ? formatDateOnly(task.dueDate) : task.sourceType === "roadmap" ? STATUS_LABELS[task.sourceStatus] || "Roadmap" : "Action ouverte";
  return `<button data-open-task-source="${escapeAttr(task.id)}" type="button"><span class="priority-dot ${String(task.priority || "P2").toLowerCase()}"></span><span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(context)}</small></span><i data-lucide="chevron-right"></i></button>`;
}

function renderRoadmapHistory(submissions) {
  const latest = submissions[0] || null;
  return `
    <section class="panel timeline-panel">
      <div class="section-heading">
        <div><h3>Historique des roadmaps</h3><p>Du plus recent au plus ancien.</p></div>
        ${latest ? `<span class="last-roadmap">Derniere: ${formatShortDate(latest.submittedAt)}</span>` : ""}
      </div>
      ${submissions.length ? `<div class="timeline">${submissions.map(renderTimelineItem).join("")}</div>` : `
        <div class="empty-state"><i data-lucide="calendar-x"></i><div>Aucune roadmap associee a ce membre.</div></div>
      `}
    </section>
  `;
}

function renderCareerTimeline(member) {
  const allMilestones = milestonesForMember(member, true);
  const archived = allMilestones.filter((item) => item.archivedAt);
  const milestones = allMilestones.filter((item) => !item.archivedAt);
  const next = nextCareerMilestone(milestones);
  const groups = [
    ["En cours", milestones.filter((item) => ["in_progress", "blocked"].includes(item.status)), "activity"],
    ["A venir", milestones.filter((item) => item.status === "planned"), "calendar-clock"],
    ["Realise", milestones.filter((item) => ["completed", "abandoned"].includes(item.status)), "circle-check-big"]
  ];
  if (state.showArchivedCareer && archived.length) groups.push(["Archive", archived, "archive"]);
  return `
    <section class="career-view">
      <header class="panel career-summary">
        <div>
          <p class="eyebrow">Parcours CFSB</p>
          <h3>${next ? escapeHtml(next.title) : "Aucune prochaine etape planifiee"}</h3>
          <p>${next ? `${CAREER_CATEGORY_LABELS[next.category] || "Etape"}${next.targetDate ? ` · Cible: ${formatDateOnly(next.targetDate)}` : ""}` : "Ajoute une premiere etape pour rendre le plan de developpement visible."}</p>
        </div>
        <div class="career-summary-actions">
          ${archived.length ? `<button class="button" id="toggleArchivedCareer" type="button"><i data-lucide="archive"></i>${state.showArchivedCareer ? "Masquer" : "Afficher"} archivees (${archived.length})</button>` : ""}
          <button class="button primary" id="addCareerMilestone" type="button"><i data-lucide="plus"></i> Ajouter une etape</button>
        </div>
      </header>
      <section class="panel career-timeline-panel">
        <div class="career-now"><span>Aujourd'hui</span></div>
        ${milestones.length || archived.length ? groups.map(([label, items, icon]) => renderCareerGroup(label, items, icon)).join("") : `
          <div class="empty-state"><i data-lucide="route"></i><div>Le parcours de ${escapeHtml(member.name)} ne contient encore aucune etape.</div></div>
        `}
      </section>
    </section>
  `;
}

function renderCareerGroup(label, milestones, icon) {
  if (!milestones.length) return "";
  return `
    <section class="career-group">
      <header><i data-lucide="${icon}"></i><h3>${escapeHtml(label)}</h3><span>${milestones.length}</span></header>
      <div class="career-items">${milestones.map(renderCareerMilestone).join("")}</div>
    </section>
  `;
}

function renderCareerMilestone(milestone) {
  const latestUpdate = careerUpdatesForMilestone(milestone.id)[0] || null;
  const progress = clampProgress(milestone.progress);
  return `
    <button class="career-item ${milestone.status} ${milestone.archivedAt ? "archived" : ""}" data-open-career="${escapeAttr(milestone.id)}" type="button">
      <span class="career-marker"></span>
      <span class="career-item-date">${milestone.targetDate ? formatDateOnly(milestone.targetDate) : "Sans echeance"}</span>
      <span class="career-item-main">
        <span class="career-item-labels"><span class="career-category">${escapeHtml(CAREER_CATEGORY_LABELS[milestone.category] || "Autre")}</span>${careerStatusPill(milestone.status)}</span>
        <strong>${escapeHtml(milestone.title || "Etape sans titre")}</strong>
        <small>${latestUpdate ? escapeHtml(truncate(latestUpdate.note, 150)) : milestone.successCriteria ? escapeHtml(truncate(milestone.successCriteria, 150)) : "Aucune note d'evolution"}</small>
        <span class="career-progress"><span style="width:${progress}%"></span></span>
      </span>
      <span class="career-item-owner">${escapeHtml(milestone.ownerName || "Responsable a definir")}<small>${progress}%</small></span>
      <i data-lucide="chevron-right"></i>
    </button>
  `;
}

function renderCareerEditor() {
  const member = state.teamMembers.find((item) => item.id === state.selectedMemberId);
  if (!member) return "";
  const milestone = state.careerMilestones.find((item) => item.id === state.careerEditorId) || null;
  const value = milestone || state.careerDraft || {};
  const updates = milestone ? careerUpdatesForMilestone(milestone.id) : [];
  const submissions = submissionsForMember(member).filter((item) => !isDeleted(item));
  const progress = clampProgress(value.progress);
  return `
    <div class="career-modal" role="dialog" aria-modal="true" aria-labelledby="careerEditorTitle">
      <div class="career-modal-backdrop" data-close-career aria-hidden="true"></div>
      <section class="career-editor panel">
        <header class="career-editor-header">
          <div><p class="eyebrow">${escapeHtml(member.name)}</p><h2 id="careerEditorTitle">${milestone ? "Modifier l'etape" : "Nouvelle etape"}</h2></div>
          <button class="button icon-only" data-close-career type="button" title="Fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
        </header>
        <div class="career-editor-scroll">
          <form id="careerForm">
            <input type="hidden" name="milestoneId" value="${escapeAttr(milestone?.id || "")}">
            <label class="field field-wide">Titre<input name="title" required value="${escapeAttr(value.title || "")}" placeholder="Ex.: Devenir autonome sur les fondations" autofocus></label>
            <label class="field">Categorie<select name="category">${CAREER_CATEGORY_OPTIONS.map(([id, label]) => `<option value="${id}" ${(value.category || "skill") === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
            <label class="field">Statut<select name="status">${CAREER_STATUS_OPTIONS.map(([id, label]) => `<option value="${id}" ${(value.status || "planned") === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
            <label class="field">Date cible<input name="targetDate" type="date" value="${escapeAttr(dateInputValue(value.targetDate))}"></label>
            <label class="field">Date de realisation<input name="completedDate" type="date" value="${escapeAttr(dateInputValue(value.completedDate))}"></label>
            <label class="field">Responsable<select name="ownerName"><option value="">A determiner</option>${CAREER_OWNER_OPTIONS.map((name) => `<option value="${escapeAttr(name)}" ${value.ownerName === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
            <label class="field">Roadmap d'origine<select name="sourceSubmissionId"><option value="">Aucune</option>${submissions.map((submission) => `<option value="${escapeAttr(submission.id)}" ${value.sourceSubmissionId === submission.id ? "selected" : ""}>${escapeHtml(submissionLabel(submission))}</option>`).join("")}</select></label>
            <label class="field field-wide">Progression <span class="range-value" id="careerProgressValue">${progress}%</span><input id="careerProgress" name="progress" type="range" min="0" max="100" step="5" value="${progress}"></label>
            <label class="field field-wide">Description<textarea class="compact-textarea" name="description" placeholder="Pourquoi cette etape compte et ce qu'elle implique...">${escapeHtml(value.description || "")}</textarea></label>
            <label class="field field-wide">Criteres de reussite<textarea name="successCriteria" placeholder="Comment saura-t-on que l'etape est reussie?">${escapeHtml(value.successCriteria || "")}</textarea></label>
            <div class="career-form-actions field-wide">
              <button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer l'etape</button>
              <button class="button" data-close-career type="button">Annuler</button>
              ${milestone ? `<button class="button danger push-right" id="archiveCareerButton" type="button"><i data-lucide="${milestone.archivedAt ? "rotate-ccw" : "archive"}"></i>${milestone.archivedAt ? "Restaurer" : "Archiver l'etape"}</button>` : ""}
            </div>
          </form>
          ${milestone && !milestone.archivedAt ? `
            <section class="career-update-section">
              <div class="section-heading"><div><h3>Notes d'evolution</h3><p>Chaque ajout reste date dans l'historique.</p></div></div>
              <form id="careerUpdateForm" class="career-update-form">
                <label class="field field-wide">Nouvelle note<textarea name="note" required placeholder="Ce qui a progresse, bloque ou change..."></textarea></label>
                <label class="field">Progression apres cette note<input name="progress" type="number" min="0" max="100" step="5" value="${progress}"></label>
                <button class="button primary" type="submit"><i data-lucide="message-square-plus"></i> Ajouter la note</button>
              </form>
              ${updates.length ? `<div class="career-update-list">${updates.map(renderCareerUpdate).join("")}</div>` : `<p class="form-hint">Aucune note d'evolution pour le moment.</p>`}
            </section>
          ` : ""}
        </div>
      </section>
    </div>
  `;
}

function renderRoadmapCompletionModal() {
  const submission = state.submissions.find((item) => item.id === state.roadmapCompletionId);
  if (!submission) return "";
  const notes = state.ownerNotes[submission.id] || {};
  const name = submission.employeeName || submission.answers?.employee_name || "ce membre";
  return `
    <div class="career-modal action-modal" role="dialog" aria-modal="true" aria-labelledby="roadmapCompletionTitle">
      <div class="career-modal-backdrop" data-close-roadmap-completion aria-hidden="true"></div>
      <section class="action-editor panel">
        <header class="career-editor-header">
          <div><p class="eyebrow">Roadmap de ${escapeHtml(name)}</p><h2 id="roadmapCompletionTitle">Terminer la rencontre</h2></div>
          <button class="button icon-only" data-close-roadmap-completion type="button" title="Fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
        </header>
        <form id="roadmapCompletionForm" class="action-form">
          <div class="action-modal-intro"><i data-lucide="calendar-check"></i><p>La date et la reservation restent dans votre logiciel habituel. Ici, indique seulement s'il reste une action a faire.</p></div>
          <label class="field">Responsable du suivi
            <select name="reviewerName">${OWNER_OPTIONS.map((owner) => `<option value="${escapeAttr(owner)}" ${(notes.reviewerName || "Michael + Gabriel") === owner ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select>
          </label>
          <label class="field">Action de suivi <span class="field-optional">facultatif</span>
            <textarea name="nextAction" placeholder="Ex.: Valider son plan de suivis clients. Laisse vide si la rencontre est completement terminee." autofocus>${escapeHtml(notes.nextAction || "")}</textarea>
          </label>
          <div class="action-form-actions">
            <button class="button primary" type="submit"><i data-lucide="check"></i> Confirmer la rencontre</button>
            <button class="button" data-close-roadmap-completion type="button">Annuler</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderTeamActionModal() {
  const member = state.teamMembers.find((item) => item.id === state.teamActionMemberId);
  if (!member) return "";
  return `
    <div class="career-modal action-modal" role="dialog" aria-modal="true" aria-labelledby="teamActionTitle">
      <div class="career-modal-backdrop" data-close-team-action aria-hidden="true"></div>
      <section class="action-editor panel">
        <header class="career-editor-header">
          <div><p class="eyebrow">${escapeHtml(member.name)}</p><h2 id="teamActionTitle">Creer une action</h2></div>
          <button class="button icon-only" data-close-team-action type="button" title="Fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
        </header>
        <form id="teamActionForm" class="action-form">
          <fieldset class="action-kind-fieldset">
            <legend>Type d'action</legend>
            <div class="action-kind-options">
              <label><input type="radio" name="taskKind" value="meeting" checked><span><i data-lucide="messages-square"></i><strong>Prevoir une rencontre</strong><small>La reservation se fera dans votre logiciel habituel.</small></span></label>
              <label><input type="radio" name="taskKind" value="followup"><span><i data-lucide="list-checks"></i><strong>Faire un suivi</strong><small>Une action concrete pour Michael ou Gabriel.</small></span></label>
              <label><input type="radio" name="taskKind" value="development"><span><i data-lucide="route"></i><strong>Parler developpement</strong><small>Un sujet lie au role ou au parcours CFSB.</small></span></label>
            </div>
          </fieldset>
          <label class="field">Action<input name="title" required maxlength="180" value="${escapeAttr(defaultMemberActionTitle("meeting", member.name))}" autofocus></label>
          <div class="action-form-grid">
            <label class="field">Responsable<select name="ownerName">${OWNER_OPTIONS.map((owner) => `<option value="${escapeAttr(owner)}">${escapeHtml(owner)}</option>`).join("")}</select></label>
            <label class="field">Priorite<select name="priority">${TASK_PRIORITY_OPTIONS.map(([id, label]) => `<option value="${id}" ${id === "P2" ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
          </div>
          <label class="field">Details <span class="field-optional">facultatif</span><textarea class="compact-textarea" name="description" placeholder="Contexte utile pour agir sans rouvrir tout le dossier."></textarea></label>
          <div class="action-form-actions">
            <button class="button primary" type="submit"><i data-lucide="plus"></i> Ajouter a A faire</button>
            <button class="button" data-close-team-action type="button">Annuler</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderTaskEditorModal() {
  const task = state.managementTasks.find((item) => item.id === state.taskEditorId);
  if (!task) return "";
  const value = state.taskConflict?.taskId === task.id ? state.taskConflict.draft : task;
  const status = task.status || "open";
  const isOpen = !["completed", "cancelled"].includes(status);
  const statusLabel = TASK_STATUS_LABELS[status] || "Ouverte";
  return `
    <div class="career-modal action-modal" role="dialog" aria-modal="true" aria-labelledby="taskEditorTitle">
      <div class="career-modal-backdrop" data-close-task-editor aria-hidden="true"></div>
      <section class="action-editor panel">
        <header class="career-editor-header">
          <div><p class="eyebrow">Action ${escapeHtml(statusLabel.toLowerCase())}</p><h2 id="taskEditorTitle">Modifier l'action</h2></div>
          <button class="button icon-only" data-close-task-editor type="button" title="Fermer" aria-label="Fermer"><i data-lucide="x"></i></button>
        </header>
        <form id="taskEditorForm" class="action-form">
          ${state.taskConflict?.taskId === task.id ? `
            <div class="conflict-alert" role="alert">
              <i data-lucide="git-merge"></i>
              <div><strong>Une version plus recente existe</strong><p>${escapeHtml(task.updatedByName || "L'autre owner")} a modifie cette action pendant ton edition. Choisis la version a conserver.</p></div>
              <div class="conflict-actions">
                <button class="button" data-resolve-task-conflict="reload" type="button">Utiliser la version recente</button>
                <button class="button primary" data-resolve-task-conflict="overwrite" type="button">Garder mes changements</button>
              </div>
            </div>
          ` : ""}
          <label class="field">Action<input name="title" required maxlength="180" value="${escapeAttr(value.title || "")}" autofocus></label>
          <div class="action-form-grid">
            <label class="field">Membre concerne
              <select name="teamMemberId">
                <option value="">Aucun membre</option>
                ${state.teamMembers.filter((member) => !isArchivedTeamMember(member) || value.teamMemberId === member.id).map((member) => `<option value="${escapeAttr(member.id)}" ${value.teamMemberId === member.id ? "selected" : ""}>${escapeHtml(member.name)}${isArchivedTeamMember(member) ? " (archive)" : ""}</option>`).join("")}
              </select>
            </label>
            <label class="field">Type
              <select name="taskKind">${TASK_KIND_OPTIONS.map(([id, label]) => `<option value="${id}" ${(value.taskKind || "general") === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>
            </label>
            <label class="field">Responsable
              <select name="ownerName">${OWNER_OPTIONS.map((owner) => `<option value="${escapeAttr(owner)}" ${value.ownerName === owner ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select>
            </label>
            <label class="field">Priorite
              <select name="priority">${TASK_PRIORITY_OPTIONS.map(([id, label]) => `<option value="${id}" ${(value.priority || "P2") === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>
            </label>
          </div>
          <label class="field">Details <span class="field-optional">facultatif</span><textarea class="compact-textarea" name="description" placeholder="Contexte utile pour agir sans rouvrir tout le dossier.">${escapeHtml(value.description || "")}</textarea></label>
          <div class="task-editor-state"><span class="task-status-pill ${escapeAttr(status)}">${escapeHtml(statusLabel)}</span>${task.updatedAt ? `<small>Derniere modification: ${formatDate(task.updatedAt)}</small>` : ""}</div>
          <div class="action-form-actions">
            <button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer</button>
            ${isOpen ? `
              <button class="button" data-complete-task="${escapeAttr(task.id)}" type="button"><i data-lucide="check"></i> Terminer</button>
              <button class="button danger push-right" data-cancel-task="${escapeAttr(task.id)}" type="button" title="Conserver cette action dans l'historique"><i data-lucide="circle-slash-2"></i> Annuler et conserver</button>
            ` : `
              <button class="button" data-reopen-task="${escapeAttr(task.id)}" type="button"><i data-lucide="rotate-ccw"></i> Rouvrir</button>
              <button class="button push-right" data-close-task-editor type="button">Fermer</button>
            `}
          </div>
        </form>
      </section>
    </div>
  `;
}

function defaultMemberActionTitle(kind, memberName) {
  if (kind === "followup") return `Faire un suivi avec ${memberName}`;
  if (kind === "development") return `Discuter du developpement de ${memberName}`;
  return `Prevoir une rencontre avec ${memberName}`;
}

function renderCareerUpdate(update) {
  return `
    <article class="career-update">
      <span class="career-update-dot"></span>
      <div><strong>${formatDate(update.createdAt)}</strong><p>${escapeHtml(update.note || "")}</p><small>${escapeHtml(update.createdByName || "Owner")} · ${clampProgress(update.progress)}%</small></div>
    </article>
  `;
}

function renderTimelineItem(submission) {
  const notes = state.ownerNotes[submission.id] || {};
  const completion = completionInfo(submission);
  return `
    <button class="timeline-item" data-open-submission="${escapeAttr(submission.id)}" type="button">
      <span class="timeline-date">${formatShortDate(submission.submittedAt)}</span>
      <span class="timeline-main">
        <strong>${escapeHtml(submission.cycleId || "Sans trimestre")} · ${escapeHtml(submission.selectedRoleLabel || "Role inconnu")}</strong>
        <small>${notes.nextAction ? `Suivi: ${escapeHtml(truncate(notes.nextAction, 140))}` : escapeHtml(STATUS_LABELS[submission.status] || "Roadmap conservee")}</small>
      </span>
      <span class="timeline-meta">${statusPill(submission.status)}<small>${completion.percent}% complete</small></span>
      <i data-lucide="chevron-right"></i>
    </button>
  `;
}

function bindAppEvents() {
  document.querySelector("#logoutButton")?.addEventListener("click", () => signOut(auth));
  document.querySelector("#reloadButton")?.addEventListener("click", () => window.location.reload());
  document.querySelectorAll("[data-export-owner-backup]").forEach((button) => button.addEventListener("click", exportOwnerBackup));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    closeCareerEditor(false);
    closeMeetingEditor(false, false);
    closeRoadmapCompletion(false);
    closeTeamAction(false);
    closeTaskEditor(false);
    closePilotageEditor(false);
    closeDevelopmentProgramEditor(false);
    closeDevelopmentAssignmentEditor(false);
    closeDevelopmentStepEditor(false);
    closeWorkingGeniusEditor(false);
    closeStrategyEditor(false);
    state.view = button.dataset.view;
    state.selectedMemberId = "";
    state.editingMemberId = "";
    state.filters.status = "all";
    ensureSelection();
    ensureDevelopmentSelection();
    renderApp();
  }));
  document.querySelectorAll("[data-development-section]").forEach((button) => button.addEventListener("click", () => {
    state.developmentSection = button.dataset.developmentSection;
    state.selectedDevelopmentAssignmentId = "";
    ensureDevelopmentSelection();
    renderApp();
  }));
  document.querySelectorAll("[data-development-assignment-view]").forEach((button) => button.addEventListener("click", () => {
    state.developmentAssignmentView = button.dataset.developmentAssignmentView;
    state.selectedDevelopmentAssignmentId = "";
    ensureDevelopmentSelection();
    renderApp();
  }));
  document.querySelectorAll("[data-open-development-assignment]").forEach((button) => button.addEventListener("click", () => {
    state.selectedDevelopmentAssignmentId = button.dataset.openDevelopmentAssignment;
    renderApp();
  }));
  document.querySelectorAll("[data-open-development-program]").forEach((button) => button.addEventListener("click", () => openDevelopmentProgramEditor(button.dataset.openDevelopmentProgram)));
  document.querySelectorAll("[data-new-development-version]").forEach((button) => button.addEventListener("click", () => openDevelopmentProgramVersion(button.dataset.newDevelopmentVersion)));
  document.querySelectorAll("[data-close-development-program]").forEach((button) => button.addEventListener("click", () => closeDevelopmentProgramEditor()));
  document.querySelector("#newDevelopmentProgram")?.addEventListener("click", () => openDevelopmentProgramEditor("__new__"));
  document.querySelector("#emptyNewDevelopmentProgram")?.addEventListener("click", () => openDevelopmentProgramEditor("__new__"));
  document.querySelector("#developmentProgramForm")?.addEventListener("submit", saveDevelopmentProgram);
  document.querySelector("#addDevelopmentProgramStep")?.addEventListener("click", addDevelopmentProgramStep);
  document.querySelectorAll("[data-remove-development-step]").forEach((button) => button.addEventListener("click", () => removeDevelopmentProgramStep(Number(button.dataset.removeDevelopmentStep))));
  document.querySelectorAll("[data-move-development-step]").forEach((button) => button.addEventListener("click", () => moveDevelopmentProgramStep(Number(button.dataset.stepIndex), button.dataset.moveDevelopmentStep)));
  document.querySelector("#deleteDevelopmentProgram")?.addEventListener("click", deleteDevelopmentProgramDraft);
  document.querySelector("#newDevelopmentAssignment")?.addEventListener("click", () => openDevelopmentAssignmentEditor());
  document.querySelectorAll("[data-assign-development-member]").forEach((button) => button.addEventListener("click", () => openDevelopmentAssignmentEditor(button.dataset.assignDevelopmentMember)));
  document.querySelectorAll("[data-close-development-assignment-editor]").forEach((button) => button.addEventListener("click", () => closeDevelopmentAssignmentEditor()));
  document.querySelector("#developmentAssignmentForm")?.addEventListener("submit", saveDevelopmentAssignment);
  document.querySelector("#developmentAssignmentMember")?.addEventListener("change", filterDevelopmentProgramOptions);
  filterDevelopmentProgramOptions();
  document.querySelectorAll("[data-open-development-step]").forEach((button) => button.addEventListener("click", () => {
    state.developmentStepEditorId = button.dataset.openDevelopmentStep;
    renderApp();
  }));
  document.querySelectorAll("[data-close-development-step]").forEach((button) => button.addEventListener("click", () => closeDevelopmentStepEditor()));
  document.querySelector("#developmentStepForm")?.addEventListener("submit", saveDevelopmentStep);
  document.querySelectorAll("[data-toggle-development-assignment]").forEach((button) => button.addEventListener("click", () => toggleDevelopmentAssignment(button.dataset.toggleDevelopmentAssignment)));
  document.querySelectorAll("[data-open-development-member]").forEach((button) => button.addEventListener("click", () => openDevelopmentMember(button.dataset.openDevelopmentMember)));
  document.querySelectorAll("[data-open-member-development]").forEach((button) => button.addEventListener("click", () => openDevelopmentAssignment(button.dataset.openMemberDevelopment)));
  document.querySelectorAll("[data-pilotage-jump]").forEach((button) => button.addEventListener("click", () => {
    const target = button.dataset.pilotageJump;
    if (target === "todo") {
      state.view = "todo";
      state.taskFilter = "pilotage";
    } else {
      state.view = "pilotage";
      state.pilotageSection = target;
    }
    renderApp();
  }));
  document.querySelectorAll("[data-pilotage-section]").forEach((button) => button.addEventListener("click", () => {
    state.pilotageSection = button.dataset.pilotageSection;
    renderApp();
  }));
  document.querySelectorAll("[data-strategy-view]").forEach((button) => button.addEventListener("click", () => {
    state.strategyView = button.dataset.strategyView;
    renderApp();
  }));
  document.querySelectorAll("[data-open-strategy-editor]").forEach((button) => button.addEventListener("click", () => openStrategyEditor(button.dataset.openStrategyEditor)));
  document.querySelectorAll("[data-edit-strategy-decision]").forEach((button) => button.addEventListener("click", () => openStrategyEditor("decision", button.dataset.editStrategyDecision)));
  document.querySelectorAll("[data-close-strategy-editor]").forEach((button) => button.addEventListener("click", () => closeStrategyEditor()));
  document.querySelector("#strategyProfileForm")?.addEventListener("submit", saveStrategyProfile);
  document.querySelector("#strategyDecisionForm")?.addEventListener("submit", saveStrategyDecision);
  document.querySelectorAll("[data-shift-pilotage-week]").forEach((button) => button.addEventListener("click", () => {
    state.pilotageWeek = shiftWeekIso(state.pilotageWeek, Number(button.dataset.shiftPilotageWeek));
    state.pilotageQuarter = quarterId(state.pilotageWeek);
    renderApp();
  }));
  document.querySelector("[data-current-pilotage-week]")?.addEventListener("click", () => {
    state.pilotageWeek = startOfWeekIso();
    state.pilotageQuarter = quarterId();
    renderApp();
  });
  document.querySelectorAll("[data-shift-pilotage-quarter]").forEach((button) => button.addEventListener("click", () => {
    state.pilotageQuarter = shiftQuarterId(state.pilotageQuarter, Number(button.dataset.shiftPilotageQuarter));
    renderApp();
  }));
  document.querySelector("[data-current-pilotage-quarter]")?.addEventListener("click", () => {
    state.pilotageQuarter = quarterId();
    renderApp();
  });
  document.querySelectorAll("[data-open-pilotage-editor]").forEach((button) => button.addEventListener("click", () => openPilotageEditor(button.dataset.openPilotageEditor)));
  document.querySelectorAll("[data-edit-pilotage-metric]").forEach((button) => button.addEventListener("click", () => openPilotageEditor("metric", button.dataset.editPilotageMetric)));
  document.querySelectorAll("[data-edit-pilotage-rock]").forEach((button) => button.addEventListener("click", () => openPilotageEditor("rock", button.dataset.editPilotageRock)));
  document.querySelectorAll("[data-edit-pilotage-issue]").forEach((button) => button.addEventListener("click", () => openPilotageEditor("issue", button.dataset.editPilotageIssue)));
  document.querySelectorAll("[data-close-pilotage-editor]").forEach((button) => button.addEventListener("click", () => closePilotageEditor()));
  document.querySelector("#pilotageMetricForm")?.addEventListener("submit", savePilotageMetric);
  document.querySelector("#pilotageRockForm")?.addEventListener("submit", savePilotageRock);
  document.querySelector("#pilotageIssueForm")?.addEventListener("submit", savePilotageIssue);
  document.querySelector("#pilotageQuickIssueForm")?.addEventListener("submit", savePilotageIssue);
  document.querySelector("#pilotageEntriesForm")?.addEventListener("submit", savePilotageMetricEntries);
  document.querySelector("#pilotageMeetingForm")?.addEventListener("submit", (event) => savePilotageMeeting(event, "draft"));
  document.querySelector("#finalizePilotageMeeting")?.addEventListener("click", (event) => savePilotageMeeting(event, "finalized"));
  document.querySelector("#reopenPilotageMeeting")?.addEventListener("click", reopenPilotageMeeting);
  document.querySelectorAll("[data-solve-pilotage-issue]").forEach((button) => button.addEventListener("click", () => solvePilotageIssue(button.dataset.solvePilotageIssue)));
  document.querySelectorAll("[data-reopen-pilotage-issue]").forEach((button) => button.addEventListener("click", () => reopenPilotageIssue(button.dataset.reopenPilotageIssue)));
  document.querySelectorAll("[data-pilotage-issue-task]").forEach((button) => button.addEventListener("click", () => convertPilotageIssueToTask(button.dataset.pilotageIssueTask)));
  document.querySelectorAll("[data-pilotage-metric-issue]").forEach((button) => button.addEventListener("click", () => createPilotageIssueFromMetric(button.dataset.pilotageMetricIssue)));
  document.querySelectorAll("[data-pilotage-rock-issue]").forEach((button) => button.addEventListener("click", () => createPilotageIssueFromRock(button.dataset.pilotageRockIssue)));
  document.querySelector("#activitySearchInput")?.addEventListener("input", (event) => {
    state.activitySearch = event.target.value;
    const cursor = event.target.selectionStart ?? state.activitySearch.length;
    renderApp();
    const input = document.querySelector("#activitySearchInput");
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  });
  document.querySelector("#activityActorFilter")?.addEventListener("change", (event) => {
    state.activityActor = event.target.value;
    renderApp();
  });
  document.querySelector("#activityEntityFilter")?.addEventListener("change", (event) => {
    state.activityEntity = event.target.value;
    renderApp();
  });
  document.querySelectorAll("[data-open-audit]").forEach((button) => button.addEventListener("click", () => openAuditEntity(button.dataset.openAudit)));
  document.querySelectorAll("[data-resolve-client-error]").forEach((button) => button.addEventListener("click", () => resolveClientError(button.dataset.resolveClientError)));
  document.querySelectorAll("[data-health-action]").forEach((button) => button.addEventListener("click", () => openDataHealthAction(button.dataset.healthAction)));
  document.querySelectorAll("[data-roadmap-view]").forEach((button) => button.addEventListener("click", () => {
    state.roadmapView = button.dataset.roadmapView;
    state.filters.status = "all";
    ensureSelection();
    renderApp();
  }));
  document.querySelector("#resetRoadmapFilters")?.addEventListener("click", () => {
    state.filters = { search: "", role: "all", cycle: "all", status: "all" };
    ensureSelection();
    renderApp();
  });
  document.querySelectorAll("[data-status-filter]").forEach((button) => button.addEventListener("click", () => {
    state.view = "roadmaps";
    state.roadmapView = "queue";
    state.filters.status = button.dataset.statusFilter;
    ensureSelection();
    renderApp();
  }));
  document.querySelector("#searchInput")?.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    const cursor = event.target.selectionStart ?? state.filters.search.length;
    ensureSelection();
    renderApp();
    const searchInput = document.querySelector("#searchInput");
    searchInput?.focus();
    searchInput?.setSelectionRange(cursor, cursor);
  });
  document.querySelector("#roleFilter")?.addEventListener("change", (event) => {
    state.filters.role = event.target.value;
    ensureSelection();
    renderApp();
  });
  document.querySelector("#cycleFilter")?.addEventListener("change", (event) => {
    state.filters.cycle = event.target.value;
    ensureSelection();
    renderApp();
  });
  document.querySelector("#statusFilter")?.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    ensureSelection();
    renderApp();
  });
  document.querySelector("#submissionSelect")?.addEventListener("change", (event) => {
    state.selectedId = event.target.value;
    renderApp();
  });
  document.querySelector("#taskFilter")?.addEventListener("change", (event) => {
    state.taskFilter = event.target.value;
    renderApp();
  });
  document.querySelector("#taskOwnerFilter")?.addEventListener("change", (event) => {
    state.taskOwnerFilter = event.target.value;
    renderApp();
  });
  document.querySelectorAll("[data-task-filter-button]").forEach((button) => button.addEventListener("click", () => {
    state.taskFilter = button.dataset.taskFilterButton;
    renderApp();
  }));
  document.querySelector("#managementTaskForm")?.addEventListener("submit", saveManagementTask);
  document.querySelectorAll("[data-complete-task]").forEach((button) => button.addEventListener("click", () => completeManagementTask(button.dataset.completeTask)));
  document.querySelectorAll("[data-edit-task]").forEach((button) => button.addEventListener("click", () => openTaskEditor(button.dataset.editTask)));
  document.querySelectorAll("[data-reopen-task]").forEach((button) => button.addEventListener("click", () => reopenManagementTask(button.dataset.reopenTask)));
  document.querySelectorAll("[data-cancel-task]").forEach((button) => button.addEventListener("click", () => cancelManagementTask(button.dataset.cancelTask)));
  document.querySelectorAll("[data-open-task-source]").forEach((button) => button.addEventListener("click", () => openTaskSource(button.dataset.openTaskSource)));
  document.querySelectorAll("[data-roadmap-action]").forEach((button) => button.addEventListener("click", () => handleRoadmapAction(button.dataset.roadmapAction, button.dataset.submissionId)));
  document.querySelector("#printButton")?.addEventListener("click", () => window.print());
  document.querySelector("#restoreButton")?.addEventListener("click", restoreSelected);
  document.querySelector("#trashButton")?.addEventListener("click", moveSelectedToTrash);
  document.querySelector("#restoreTrashButton")?.addEventListener("click", restoreSelectedFromTrash);
  document.querySelector("#deleteForeverButton")?.addEventListener("click", deleteSelectedForever);
  document.querySelector("#memberAssignment")?.addEventListener("change", assignSelectedMember);
  document.querySelectorAll("[data-team-roster]").forEach((button) => button.addEventListener("click", () => {
    state.teamRosterView = button.dataset.teamRoster;
    state.selectedMemberId = "";
    state.editingMemberId = "";
    state.memberEditorVersion = "";
    state.teamSearch = "";
    renderApp();
  }));
  document.querySelectorAll("[data-team-workspace]").forEach((button) => button.addEventListener("click", () => {
    state.teamWorkspaceView = button.dataset.teamWorkspace;
    state.selectedMemberId = "";
    state.editingMemberId = "";
    state.teamSearch = "";
    renderApp();
  }));
  document.querySelectorAll("[data-open-member]").forEach((button) => button.addEventListener("click", () => {
    state.view = "team";
    state.teamWorkspaceView = "directory";
    state.selectedMemberId = button.dataset.openMember;
    state.teamRosterView = teamMemberBucket(state.teamMembers.find((item) => item.id === state.selectedMemberId));
    state.editingMemberId = "";
    state.memberProfileSection = "overview";
    state.memberActionView = "open";
    state.showArchivedCareer = false;
    renderApp();
  }));
  document.querySelectorAll("[data-edit-member]").forEach((button) => button.addEventListener("click", () => {
    closeMeetingEditor(false, false);
    state.view = "team";
    state.teamWorkspaceView = "directory";
    state.selectedMemberId = "";
    state.editingMemberId = button.dataset.editMember;
    const member = state.teamMembers.find((item) => item.id === state.editingMemberId);
    state.teamRosterView = teamMemberBucket(member);
    state.memberEditorVersion = entityVersionToken(member);
    renderApp();
  }));
  document.querySelectorAll("[data-create-member-action]").forEach((button) => button.addEventListener("click", () => {
    state.teamActionMemberId = button.dataset.createMemberAction;
    renderApp();
  }));
  document.querySelector("#addMemberButton")?.addEventListener("click", () => {
    state.selectedMemberId = "";
    state.editingMemberId = "__new__";
    state.memberEditorVersion = "";
    state.teamRosterView = "active";
    state.teamWorkspaceView = "directory";
    renderApp();
  });
  document.querySelectorAll("[data-open-member-genius]").forEach((button) => button.addEventListener("click", () => {
    const member = state.teamMembers.find((item) => item.id === button.dataset.openMemberGenius);
    if (!member) return;
    state.view = "team";
    state.teamWorkspaceView = "working_genius";
    state.selectedMemberId = member.id;
    state.teamRosterView = teamMemberBucket(member);
    state.memberProfileSection = "working_genius";
    renderApp();
  }));
  document.querySelectorAll("[data-edit-working-genius]").forEach((button) => button.addEventListener("click", () => openWorkingGeniusEditor(button.dataset.editWorkingGenius)));
  document.querySelectorAll("[data-close-working-genius]").forEach((button) => button.addEventListener("click", () => closeWorkingGeniusEditor()));
  document.querySelector("#workingGeniusForm")?.addEventListener("submit", saveWorkingGeniusProfile);
  document.querySelector("#deleteWorkingGeniusProfile")?.addEventListener("click", deleteWorkingGeniusProfile);
  document.querySelector("#teamSearchInput")?.addEventListener("input", (event) => {
    state.teamSearch = event.target.value;
    const cursor = event.target.selectionStart ?? state.teamSearch.length;
    renderApp();
    const input = document.querySelector("#teamSearchInput");
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  });
  document.querySelector("#backToTeamButton")?.addEventListener("click", () => {
    state.selectedMemberId = "";
    state.memberActionView = "open";
    closeCareerEditor(false);
    renderApp();
  });
  document.querySelectorAll("[data-member-section]").forEach((button) => button.addEventListener("click", () => {
    state.memberProfileSection = button.dataset.memberSection;
    renderApp();
  }));
  document.querySelector("#addTeamMeeting")?.addEventListener("click", createTeamMeeting);
  document.querySelectorAll("[data-open-meeting]").forEach((button) => button.addEventListener("click", () => openMeetingEditor(button.dataset.openMeeting)));
  document.querySelectorAll("[data-close-meeting]").forEach((button) => button.addEventListener("click", () => closeMeetingEditor()));
  document.querySelector("#meetingForm")?.addEventListener("input", scheduleMeetingAutosave);
  document.querySelector("#meetingForm")?.addEventListener("change", scheduleMeetingAutosave);
  document.querySelector("#saveMeetingNowButton")?.addEventListener("click", () => saveMeetingDraft());
  document.querySelector("#finalizeMeetingButton")?.addEventListener("click", finalizeTeamMeeting);
  document.querySelector("#deleteMeetingDraftButton")?.addEventListener("click", deleteMeetingDraft);
  document.querySelector("#sharedSummaryForm")?.addEventListener("submit", saveSharedMeetingSummary);
  document.querySelector("#withdrawSharedSummary")?.addEventListener("click", withdrawSharedMeetingSummary);
  document.querySelectorAll("[data-member-action-view]").forEach((button) => button.addEventListener("click", () => {
    state.memberActionView = button.dataset.memberActionView;
    renderApp();
  }));
  document.querySelector("#addCareerMilestone")?.addEventListener("click", () => {
    state.careerEditorId = "__new__";
    state.careerEditorVersion = "";
    state.careerDraft = { status: "planned", category: "skill", progress: 0 };
    renderApp();
  });
  document.querySelectorAll("[data-open-career]").forEach((button) => button.addEventListener("click", () => {
    state.careerEditorId = button.dataset.openCareer;
    state.careerEditorVersion = entityVersionToken(state.careerMilestones.find((item) => item.id === state.careerEditorId));
    state.careerDraft = null;
    renderApp();
  }));
  document.querySelector("#toggleArchivedCareer")?.addEventListener("click", () => {
    state.showArchivedCareer = !state.showArchivedCareer;
    renderApp();
  });
  document.querySelectorAll("[data-close-career]").forEach((button) => button.addEventListener("click", () => closeCareerEditor()));
  document.querySelector("#careerForm")?.addEventListener("submit", saveCareerMilestone);
  document.querySelector("#careerUpdateForm")?.addEventListener("submit", saveCareerUpdate);
  document.querySelector("#archiveCareerButton")?.addEventListener("click", toggleCareerArchive);
  document.querySelector("#careerProgress")?.addEventListener("input", (event) => {
    const output = document.querySelector("#careerProgressValue");
    if (output) output.textContent = `${event.target.value}%`;
  });
  document.querySelectorAll("[data-open-submission]").forEach((button) => button.addEventListener("click", () => openSubmission(button.dataset.openSubmission)));
  document.querySelector("#openUnlinkedButton")?.addEventListener("click", () => {
    const first = unlinkedSubmissions()[0];
    if (first) openSubmission(first.id);
  });
  document.querySelector("#cancelMemberEdit")?.addEventListener("click", () => {
    state.editingMemberId = "";
    state.memberEditorVersion = "";
    renderApp();
  });
  document.querySelector("#memberForm")?.addEventListener("submit", saveTeamMember);
  document.querySelectorAll("[data-archive-member]").forEach((button) => button.addEventListener("click", () => archiveTeamMember(button.dataset.archiveMember)));
  document.querySelectorAll("[data-restore-member]").forEach((button) => button.addEventListener("click", () => restoreTeamMember(button.dataset.restoreMember)));
  document.querySelectorAll("[data-close-roadmap-completion]").forEach((button) => button.addEventListener("click", () => closeRoadmapCompletion()));
  document.querySelector("#roadmapCompletionForm")?.addEventListener("submit", completeRoadmapMeeting);
  document.querySelectorAll("[data-close-team-action]").forEach((button) => button.addEventListener("click", () => closeTeamAction()));
  document.querySelector("#teamActionForm")?.addEventListener("submit", saveTeamAction);
  document.querySelectorAll('#teamActionForm input[name="taskKind"]').forEach((input) => input.addEventListener("change", updateTeamActionTitle));
  document.querySelectorAll("[data-close-task-editor]").forEach((button) => button.addEventListener("click", () => closeTaskEditor()));
  document.querySelector("#taskEditorForm")?.addEventListener("submit", saveManagementTaskEdit);
  document.querySelectorAll("[data-resolve-task-conflict]").forEach((button) => button.addEventListener("click", () => resolveTaskConflict(button.dataset.resolveTaskConflict)));
}

function openDataHealthAction(action) {
  const health = currentDataHealthReport();
  if (action === "unlinked") {
    const submission = health.unlinkedSubmissions[0];
    if (submission) openSubmission(submission.id);
    return;
  }
  if (action === "drive") {
    const member = health.missingDocumentMembers[0];
    if (!member) return;
    state.view = "team";
    state.teamRosterView = "active";
    state.selectedMemberId = "";
    state.editingMemberId = member.id;
    state.memberEditorVersion = entityVersionToken(member);
    renderApp();
    return;
  }
  if (action === "targets") {
    state.view = "pilotage";
    state.pilotageSection = "scorecard";
    renderApp();
    return;
  }
  if (action === "roadmaps") {
    state.view = "roadmaps";
    state.roadmapView = "history";
    state.filters = { search: "", role: "all", cycle: "all", status: "all" };
    ensureSelection();
    renderApp();
    return;
  }
  if (action === "firebase-form") {
    window.open("./formulaire.html", "_blank", "noopener,noreferrer");
  }
}

async function exportOwnerBackup() {
  if (state.previewMode) return showToast("Apercu local: aucune sauvegarde Firestore n'est exportee.");
  if (state.busy) return;
  const buttons = [...document.querySelectorAll("[data-export-owner-backup]")];
  buttons.forEach((button) => { button.disabled = true; });
  state.busy = true;
  showToast("Preparation de la sauvegarde owner...");
  try {
    const collections = {};
    for (const names of chunkArray(OWNER_BACKUP_COLLECTIONS, 6)) {
      const results = await Promise.all(names.map(async (name) => {
        const snapshot = await getDocs(collection(db, name));
        return [name, snapshot.docs.map(fromDoc)];
      }));
      results.forEach(([name, documents]) => { collections[name] = documents; });
    }
    const roadmapSubmissionEvents = {};
    for (const submissions of chunkArray(collections.roadmapSubmissions || [], 8)) {
      const results = await Promise.all(submissions.map(async (submission) => {
        const snapshot = await getDocs(collection(db, "roadmapSubmissions", submission.id, "events"));
        return [submission.id, snapshot.docs.map(fromDoc)];
      }));
      results.forEach(([submissionId, events]) => {
        if (events.length) roadmapSubmissionEvents[submissionId] = events;
      });
    }
    const exportedAt = new Date();
    const backup = buildOwnerBackup({
      projectId: firebaseConfig.projectId,
      actor: { uid: state.user.uid, name: actorName(), email: state.user.email || "" },
      exportedAt,
      collections,
      nested: { roadmapSubmissionEvents }
    });
    const validation = validateOwnerBackup(backup);
    if (!validation.valid) throw new Error(validation.errors[0]);
    const checksum = await sha256Hex(JSON.stringify(backup));
    const completed = { ...backup, integrity: { algorithm: "SHA-256", scope: "JSON.stringify(payload_without_integrity)", checksum } };
    downloadJsonFile(completed, ownerBackupFileName(exportedAt));
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, "auditLogs")), auditPayload("owner_backup_exported", "owner-backup", { totalRecords: validation.totalRecords, checksum }));
      await batch.commit();
    } catch {
      // The backup stays valid even if its audit event cannot be written.
    }
    showToast(`Sauvegarde prete: ${validation.totalRecords} document(s), empreinte ${checksum.slice(0, 10)}...`);
  } catch (error) {
    showToast(`Sauvegarde non exportee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function downloadJsonFile(value, fileName) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function openPilotageEditor(type, id = "") {
  if (!["metric", "rock", "issue"].includes(type)) return;
  closeCareerEditor(false);
  closeMeetingEditor(false, false);
  closeRoadmapCompletion(false);
  closeTeamAction(false);
  closeTaskEditor(false);
  state.pilotageEditorType = type;
  state.pilotageEditorId = id;
  renderApp();
}

function closePilotageEditor(shouldRender = true) {
  state.pilotageEditorType = "";
  state.pilotageEditorId = "";
  if (shouldRender) renderApp();
}

function openStrategyEditor(type, id = "") {
  if (!["profile", "decision"].includes(type)) return;
  closePilotageEditor(false);
  closeCareerEditor(false);
  closeMeetingEditor(false, false);
  closeTaskEditor(false);
  state.strategyEditorType = type;
  state.strategyDecisionEditorId = type === "decision" ? id : "";
  renderApp();
}

function closeStrategyEditor(shouldRender = true) {
  state.strategyEditorType = "";
  state.strategyDecisionEditorId = "";
  if (shouldRender) renderApp();
}

async function saveStrategyProfile(event) {
  event.preventDefault();
  if (state.previewMode) return showToast("Apercu local: aucune strategie n'est ecrite.");
  if (state.busy) return;
  const data = new FormData(event.currentTarget);
  const current = currentStrategyProfile();
  const values = Array.from({ length: 4 }, (_, index) => ({
    id: String(data.get(`valueId_${index}`) || `value-${index + 1}`),
    name: String(data.get(`valueName_${index}`) || ""),
    description: String(data.get(`valueDescription_${index}`) || "")
  }));
  const validation = validateStrategyProfile({
    id: "current",
    title: String(data.get("title") || "Strategie CFSB"),
    status: String(data.get("status") || "draft"),
    sourceRevision: current.sourceRevision,
    sourceNotes: String(data.get("sourceNotes") || ""),
    sourceDocuments: current.sourceDocuments,
    vision: String(data.get("vision") || ""),
    mission: String(data.get("mission") || ""),
    values,
    niche: String(data.get("niche") || ""),
    longTermTarget: String(data.get("longTermTarget") || ""),
    strategies: normalizeStrategyList(data.get("strategies")),
    differentiators: normalizeStrategyList(data.get("differentiators")),
    provenProcess: String(data.get("provenProcess") || ""),
    guarantee: String(data.get("guarantee") || ""),
    swot: {
      strengths: normalizeStrategyList(data.get("swot_strengths")),
      weaknesses: normalizeStrategyList(data.get("swot_weaknesses")),
      opportunities: normalizeStrategyList(data.get("swot_opportunities")),
      threats: normalizeStrategyList(data.get("swot_threats"))
    },
    annualFocus: {
      year: Number(data.get("annualYear") || new Date().getFullYear()),
      goals: normalizeStrategyList(data.get("annualGoals"))
    }
  });
  if (!validation.valid) return showToast(validation.errors[0]);
  state.busy = true;
  try {
    const existing = state.businessStrategy;
    const payload = {
      ...validation.profile,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    delete payload.id;
    if (!existing) {
      payload.createdAt = serverTimestamp();
      payload.createdByUid = state.user.uid;
      payload.createdByName = actorName();
    }
    const action = validation.profile.status === "validated" && existing?.status !== "validated" ? "business_strategy_validated" : existing ? "business_strategy_updated" : "business_strategy_created";
    const batch = writeBatch(db);
    batch.set(doc(db, "businessStrategy", "current"), payload, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload(action, "current", { status: validation.profile.status, coverage: validation.coverage.percent }));
    await batch.commit();
    closeStrategyEditor(false);
    showToast(validation.profile.status === "validated" ? "Strategie validee et enregistree." : "Strategie enregistree avec son statut de validation.");
    renderApp();
  } catch (error) {
    showToast(`Strategie non enregistree: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function saveStrategyDecision(event) {
  event.preventDefault();
  if (state.previewMode) return showToast("Apercu local: aucune decision n'est ecrite.");
  if (state.busy) return;
  const data = new FormData(event.currentTarget);
  const validation = validateStrategyDecision({
    id: state.strategyDecisionEditorId,
    decisionDate: String(data.get("decisionDate") || ""),
    title: String(data.get("title") || ""),
    decision: String(data.get("decision") || ""),
    rationale: String(data.get("rationale") || ""),
    ownerName: String(data.get("ownerName") || "Michael + Gabriel"),
    impact: String(data.get("impact") || ""),
    status: String(data.get("status") || "active"),
    sourceUrl: String(data.get("sourceUrl") || "")
  });
  if (!validation.valid) return showToast(validation.errors[0]);
  state.busy = true;
  try {
    const existing = state.strategyDecisions.find((item) => item.id === state.strategyDecisionEditorId) || null;
    const reference = existing ? doc(db, "strategyDecisions", existing.id) : doc(collection(db, "strategyDecisions"));
    const payload = {
      ...validation.decision,
      sourceUrl: validation.decision.sourceUrl ? normalizeExternalUrl(validation.decision.sourceUrl) : "",
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    delete payload.id;
    if (!existing) {
      payload.createdAt = serverTimestamp();
      payload.createdByUid = state.user.uid;
      payload.createdByName = actorName();
    }
    const batch = writeBatch(db);
    batch.set(reference, payload, { merge: Boolean(existing) });
    batch.set(doc(collection(db, "auditLogs")), auditPayload(existing ? "strategy_decision_updated" : "strategy_decision_created", reference.id, { title: payload.title, status: payload.status }));
    await batch.commit();
    closeStrategyEditor(false);
    showToast(existing ? "Decision mise a jour." : "Decision ajoutee au registre.");
    renderApp();
  } catch (error) {
    showToast(`Decision non enregistree: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function savePilotageMetric(event) {
  event.preventDefault();
  if (state.busy) return;
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") || "").trim();
  const targetDirection = String(data.get("targetDirection") || "gte");
  const targetValidated = data.get("targetValidated") === "on";
  const targetValueRaw = String(data.get("targetValue") || "").trim();
  const targetValue = targetValueRaw === "" ? null : Number(targetValueRaw);
  const targetMaxValue = String(data.get("targetMax") || "").trim();
  const targetMax = targetMaxValue === "" ? null : Number(targetMaxValue);
  if (!name || (targetValidated && !Number.isFinite(targetValue)) || (targetValidated && targetDirection === "range" && !Number.isFinite(targetMax))) {
    showToast(targetValidated ? "Precise un nom et une cible validee." : "Precise un nom valide.");
    return;
  }
  const sourceUrl = normalizeExternalUrl(data.get("sourceUrl"));
  if (String(data.get("sourceUrl") || "").trim() && !sourceUrl) {
    showToast("Le lien de source doit commencer par http ou https.");
    return;
  }
  const existing = state.pilotageMetrics.find((metric) => metric.id === state.pilotageEditorId);
  const reference = existing ? doc(db, "pilotageMetrics", existing.id) : doc(collection(db, "pilotageMetrics"));
  const payload = {
    name,
    definition: String(data.get("definition") || "").trim(),
    category: String(data.get("category") || "").trim(),
    ownerName: OWNER_OPTIONS.includes(String(data.get("ownerName"))) ? String(data.get("ownerName")) : "Michael + Gabriel",
    targetDirection: PILOTAGE_METRIC_DIRECTIONS.some(([id]) => id === targetDirection) ? targetDirection : "gte",
    targetValue,
    targetMax,
    targetStatus: targetValidated ? "validated" : "to_validate",
    unit: String(data.get("unit") || "").trim(),
    sourceLabel: String(data.get("sourceLabel") || "").trim(),
    sourceUrl,
    sourceReference: String(data.get("sourceReference") || "").trim(),
    sourceConfidence: ["high", "medium", "low"].includes(String(data.get("sourceConfidence"))) ? String(data.get("sourceConfidence")) : "medium",
    sortOrder: Number(data.get("sortOrder")) || 0,
    active: data.get("active") === "on",
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: actorName()
  };
  if (!existing) Object.assign(payload, { createdAt: serverTimestamp(), createdByUid: state.user.uid, createdByName: actorName() });
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(reference, payload, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload(existing ? "pilotage_metric_updated" : "pilotage_metric_created", reference.id, { name }));
    await batch.commit();
    closePilotageEditor(false);
    showToast(existing ? "Indicateur mis a jour." : "Indicateur ajoute.");
    renderApp();
  } catch (error) {
    showToast(`Indicateur non enregistre: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function savePilotageMetricEntries(event) {
  event.preventDefault();
  if (state.busy) return;
  const data = new FormData(event.currentTarget);
  const metrics = activePilotageMetrics();
  state.busy = true;
  try {
    const batch = writeBatch(db);
    let saved = 0;
    let cleared = 0;
    const existingEntries = new Map(pilotageEntriesForWeek().map((entry) => [entry.metricId, entry]));
    metrics.forEach((metric) => {
      const raw = String(data.get(`metric:${metric.id}:value`) || "").trim();
      const note = String(data.get(`metric:${metric.id}:note`) || "").trim();
      const entryId = `${metric.id}_${state.pilotageWeek}`;
      if (!raw && !note) {
        if (existingEntries.has(metric.id)) {
          batch.delete(doc(db, "pilotageMetricEntries", entryId));
          cleared += 1;
        }
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      batch.set(doc(db, "pilotageMetricEntries", entryId), {
        metricId: metric.id,
        metricName: metric.name,
        weekStart: state.pilotageWeek,
        value,
        note,
        updatedAt: serverTimestamp(),
        updatedByUid: state.user.uid,
        updatedByName: actorName()
      }, { merge: true });
      saved += 1;
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("pilotage_scorecard_saved", state.pilotageWeek, { weekStart: state.pilotageWeek, saved, cleared }));
    await batch.commit();
    showToast(`${saved} valeur(s) enregistree(s)${cleared ? `, ${cleared} effacee(s)` : ""} pour cette semaine.`);
    renderApp();
  } catch (error) {
    showToast(`Scorecard non enregistree: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function savePilotageRock(event) {
  event.preventDefault();
  if (state.busy) return;
  const data = new FormData(event.currentTarget);
  const title = String(data.get("title") || "").trim();
  const quarter = String(data.get("quarter") || "").trim();
  if (!title || !/^\d{4}-Q[1-4]$/.test(quarter)) {
    showToast("Precise une priorite et un trimestre valide.");
    return;
  }
  const existing = state.pilotageRocks.find((rock) => rock.id === state.pilotageEditorId);
  const reference = existing ? doc(db, "pilotageRocks", existing.id) : doc(collection(db, "pilotageRocks"));
  const payload = {
    title,
    quarter,
    ownerName: OWNER_OPTIONS.includes(String(data.get("ownerName"))) ? String(data.get("ownerName")) : "Michael + Gabriel",
    status: PILOTAGE_ROCK_STATUSES.some(([id]) => id === data.get("status")) ? String(data.get("status")) : "on_track",
    progress: clampProgress(data.get("progress")),
    dueDate: String(data.get("dueDate") || ""),
    successCriteria: String(data.get("successCriteria") || "").trim(),
    notes: String(data.get("notes") || "").trim(),
    archivedAt: null,
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: actorName()
  };
  if (!existing) Object.assign(payload, { createdAt: serverTimestamp(), createdByUid: state.user.uid, createdByName: actorName() });
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(reference, payload, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload(existing ? "pilotage_rock_updated" : "pilotage_rock_created", reference.id, { title, quarter }));
    await batch.commit();
    state.pilotageQuarter = quarter;
    closePilotageEditor(false);
    showToast(existing ? "Priorite mise a jour." : "Priorite ajoutee.");
    renderApp();
  } catch (error) {
    showToast(`Priorite non enregistree: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function savePilotageIssue(event) {
  event.preventDefault();
  if (state.busy) return;
  const data = new FormData(event.currentTarget);
  const title = String(data.get("title") || "").trim();
  if (!title) return;
  const existing = state.pilotageIssues.find((issue) => issue.id === state.pilotageEditorId);
  const reference = existing ? doc(db, "pilotageIssues", existing.id) : doc(collection(db, "pilotageIssues"));
  const payload = {
    title,
    details: String(data.get("details") || existing?.details || "").trim(),
    priority: TASK_PRIORITY_OPTIONS.some(([id]) => id === data.get("priority")) ? String(data.get("priority")) : "P2",
    ownerName: OWNER_OPTIONS.includes(String(data.get("ownerName"))) ? String(data.get("ownerName")) : existing?.ownerName || "Michael + Gabriel",
    status: existing?.status || "open",
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: actorName()
  };
  if (existing?.status === "solved") payload.resolution = String(data.get("resolution") || existing.resolution || "").trim();
  if (!existing) Object.assign(payload, { createdAt: serverTimestamp(), createdByUid: state.user.uid, createdByName: actorName() });
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(reference, payload, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload(existing ? "pilotage_issue_updated" : "pilotage_issue_created", reference.id, { title }));
    await batch.commit();
    event.currentTarget.reset();
    closePilotageEditor(false);
    state.pilotageSection = "issues";
    showToast(existing ? "Enjeu mis a jour." : "Enjeu ajoute.");
    renderApp();
  } catch (error) {
    showToast(`Enjeu non enregistre: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function solvePilotageIssue(issueId) {
  const issue = state.pilotageIssues.find((item) => item.id === issueId);
  if (!issue || issue.status === "solved" || state.busy) return;
  const resolution = window.prompt("Quelle decision ou resolution voulez-vous conserver?", issue.resolution || "");
  if (resolution == null) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "pilotageIssues", issue.id), {
      status: "solved",
      resolution: resolution.trim(),
      solvedAt: serverTimestamp(),
      solvedByUid: state.user.uid,
      solvedByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("pilotage_issue_solved", issue.id, { title: issue.title }));
    await batch.commit();
    showToast("Enjeu marque comme resolu.");
  } catch (error) {
    showToast(`Enjeu non resolu: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function reopenPilotageIssue(issueId) {
  const issue = state.pilotageIssues.find((item) => item.id === issueId);
  if (!issue || issue.status !== "solved" || state.busy) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "pilotageIssues", issue.id), {
      status: "open",
      solvedAt: null,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("pilotage_issue_reopened", issue.id, { title: issue.title }));
    await batch.commit();
    showToast("Enjeu rouvert.");
  } catch (error) {
    showToast(`Enjeu non rouvert: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function convertPilotageIssueToTask(issueId) {
  const issue = state.pilotageIssues.find((item) => item.id === issueId);
  if (!issue || issue.status === "solved" || issue.linkedTaskId || state.busy) return;
  const taskRef = doc(collection(db, "managementTasks"));
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(taskRef, {
      title: issue.title,
      description: issue.details || `Action issue de la liste des enjeux du pilotage.`,
      teamMemberId: "",
      teamMemberName: "",
      ownerName: issue.ownerName || "Michael + Gabriel",
      priority: issue.priority || "P2",
      status: "open",
      dueDate: "",
      taskKind: "general",
      sourceType: "pilotage_issue",
      sourceId: issue.id,
      createdAt: serverTimestamp(),
      createdByUid: state.user.uid,
      createdByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    });
    batch.update(doc(db, "pilotageIssues", issue.id), { linkedTaskId: taskRef.id, updatedAt: serverTimestamp(), updatedByUid: state.user.uid, updatedByName: actorName() });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("management_task_created", taskRef.id, { sourceType: "pilotage_issue", sourceId: issue.id }));
    await batch.commit();
    showToast("Action ajoutee a la liste A faire.");
  } catch (error) {
    showToast(`Action non creee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function createPilotageIssueFromMetric(metricId) {
  const metric = state.pilotageMetrics.find((item) => item.id === metricId);
  if (!metric) return;
  const existing = openPilotageIssues().find((issue) => issue.sourceType === "metric" && issue.sourceId === metric.id && issue.sourceWeek === state.pilotageWeek);
  if (existing) {
    state.pilotageSection = "issues";
    showToast("Cet indicateur a deja un enjeu ouvert pour cette semaine.");
    renderApp();
    return;
  }
  const entry = pilotageEntriesForWeek().find((item) => item.metricId === metric.id);
  await createPilotageIssue({
    title: `Indicateur hors cible: ${metric.name}`,
    details: `Semaine du ${formatDateOnly(state.pilotageWeek)}. Valeur: ${formatNumber(entry?.value)} ${metric.unit || ""}. Cible: ${targetLabel(metric)}.`,
    ownerName: metric.ownerName || "Michael + Gabriel",
    priority: "P2",
    sourceType: "metric",
    sourceId: metric.id,
    sourceWeek: state.pilotageWeek,
    sourceLabel: metric.name
  });
}

async function createPilotageIssueFromRock(rockId) {
  const rock = state.pilotageRocks.find((item) => item.id === rockId);
  if (!rock) return;
  const existing = openPilotageIssues().find((issue) => issue.sourceType === "rock" && issue.sourceId === rock.id);
  if (existing) {
    state.pilotageSection = "issues";
    showToast("Cette priorite a deja un enjeu ouvert.");
    renderApp();
    return;
  }
  await createPilotageIssue({
    title: `Priorite a risque: ${rock.title}`,
    details: `${rock.quarter}. Progression actuelle: ${clampProgress(rock.progress)}%. ${rock.notes || rock.successCriteria || ""}`.trim(),
    ownerName: rock.ownerName || "Michael + Gabriel",
    priority: "P1",
    sourceType: "rock",
    sourceId: rock.id,
    sourceLabel: rock.title
  });
}

async function createPilotageIssue(payload) {
  if (state.busy) return;
  const reference = doc(collection(db, "pilotageIssues"));
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(reference, {
      ...payload,
      status: "open",
      createdAt: serverTimestamp(),
      createdByUid: state.user.uid,
      createdByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("pilotage_issue_created", reference.id, { title: payload.title, sourceType: payload.sourceType || "manual" }));
    await batch.commit();
    state.pilotageSection = "issues";
    showToast("Enjeu ajoute a la liste.");
    renderApp();
  } catch (error) {
    showToast(`Enjeu non cree: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function savePilotageMeeting(event, status) {
  event.preventDefault?.();
  if (state.busy) return;
  const form = document.querySelector("#pilotageMeetingForm");
  if (!form) return;
  if (status === "finalized" && !window.confirm("Finaliser cette rencontre hebdomadaire? Elle restera consultable et pourra etre rouverte au besoin.")) return;
  const data = new FormData(form);
  const existing = selectedPilotageMeeting();
  const reference = doc(db, "pilotageMeetings", state.pilotageWeek);
  const payload = {
    weekStart: state.pilotageWeek,
    quarter: quarterId(state.pilotageWeek),
    attendees: PILOTAGE_MEETING_ATTENDEES,
    wins: String(data.get("wins") || "").trim(),
    headlines: String(data.get("headlines") || "").trim(),
    scorecardNotes: String(data.get("scorecardNotes") || "").trim(),
    rocksNotes: String(data.get("rocksNotes") || "").trim(),
    issuesNotes: String(data.get("issuesNotes") || "").trim(),
    conclusion: String(data.get("conclusion") || "").trim(),
    nextWeekFocus: String(data.get("nextWeekFocus") || "").trim(),
    rating: String(data.get("rating") || "").trim() ? Math.max(1, Math.min(10, Number(data.get("rating")))) : null,
    status,
    snapshot: currentPilotageSummary(),
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: actorName()
  };
  if (!existing) Object.assign(payload, { createdAt: serverTimestamp(), createdByUid: state.user.uid, createdByName: actorName() });
  if (status === "finalized") Object.assign(payload, { finalizedAt: serverTimestamp(), finalizedByUid: state.user.uid, finalizedByName: actorName() });
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(reference, payload, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload(status === "finalized" ? "pilotage_meeting_finalized" : "pilotage_meeting_saved", reference.id, { weekStart: state.pilotageWeek }));
    await batch.commit();
    showToast(status === "finalized" ? "Rencontre hebdomadaire finalisee." : "Brouillon de rencontre enregistre.");
    renderApp();
  } catch (error) {
    showToast(`Rencontre non enregistree: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function reopenPilotageMeeting() {
  const meeting = selectedPilotageMeeting();
  if (!meeting || meeting.status !== "finalized" || state.busy) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "pilotageMeetings", meeting.id), {
      status: "draft",
      reopenedAt: serverTimestamp(),
      reopenedByUid: state.user.uid,
      reopenedByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("pilotage_meeting_reopened", meeting.id, { weekStart: meeting.weekStart }));
    await batch.commit();
    showToast("Rencontre rouverte en brouillon.");
  } catch (error) {
    showToast(`Rencontre non rouverte: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

function closeCareerEditor(shouldRender = true) {
  state.careerEditorId = "";
  state.careerEditorVersion = "";
  state.careerDraft = null;
  if (shouldRender) renderApp();
}

async function closeMeetingEditor(shouldRender = true, saveBeforeClose = true) {
  window.clearTimeout(meetingAutosaveTimer);
  meetingAutosaveTimer = null;
  if (saveBeforeClose && state.meetingEditorId && document.querySelector("#meetingForm") && meetingIsEditable(state.teamMeetings.find((item) => item.id === state.meetingEditorId))) {
    await saveMeetingDraft({ silent: true });
  }
  state.meetingEditorId = "";
  state.meetingEditorVersion = "";
  state.meetingSaveState = "saved";
  if (shouldRender) renderApp();
}

async function createTeamMeeting() {
  const member = state.teamMembers.find((item) => item.id === state.selectedMemberId);
  if (!member || isArchivedTeamMember(member) || state.busy) return;
  const meetingRef = doc(collection(db, "teamMeetings"));
  const payload = {
    teamMemberId: member.id,
    teamMemberName: member.name,
    meetingType: "one_on_one",
    templateVersion: MEETING_TEMPLATE_VERSION,
    status: "draft",
    meetingDate: todayInputValue(),
    facilitatorName: "Gabriel",
    previousCommitmentStatus: "not_applicable",
    pillar: "",
    createdAt: serverTimestamp(),
    createdByUid: state.user.uid,
    createdByName: actorName(),
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: actorName()
  };
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(meetingRef, payload);
    batch.set(doc(collection(db, "auditLogs")), auditPayload("team_meeting_created", meetingRef.id, { teamMemberId: member.id }));
    await batch.commit();
    const snapshot = await getDoc(meetingRef);
    const meeting = snapshot.exists() ? fromDoc(snapshot) : { id: meetingRef.id, ...payload, createdAt: new Date(), updatedAt: new Date() };
    state.teamMeetings = [meeting, ...state.teamMeetings.filter((item) => item.id !== meeting.id)].sort(sortTeamMeetings);
    state.meetingEditorId = meeting.id;
    state.meetingEditorVersion = entityVersionToken(meeting);
    state.meetingSaveState = "saved";
    renderApp();
  } catch (error) {
    showToast(`Rencontre non creee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function openMeetingEditor(meetingId) {
  if (state.meetingEditorId && state.meetingEditorId !== meetingId) await closeMeetingEditor(false);
  const meeting = state.teamMeetings.find((item) => item.id === meetingId);
  if (!meeting) return;
  const member = state.teamMembers.find((item) => item.id === meeting.teamMemberId);
  if (!member) return showToast("Le dossier membre associe n'est plus disponible.");
  state.view = "team";
  state.selectedMemberId = member.id;
  state.teamRosterView = teamMemberBucket(member);
  state.memberProfileSection = "meetings";
  state.meetingEditorId = meeting.id;
  state.meetingEditorVersion = entityVersionToken(meeting);
  state.meetingSaveState = "saved";
  renderApp();
}

function scheduleMeetingAutosave() {
  const meeting = state.teamMeetings.find((item) => item.id === state.meetingEditorId);
  if (!meetingIsEditable(meeting)) return;
  window.clearTimeout(meetingAutosaveTimer);
  setMeetingSaveState("pending");
  meetingAutosaveTimer = window.setTimeout(() => saveMeetingDraft({ silent: true }), 850);
}

async function saveMeetingDraft(options = {}) {
  if (meetingAutosavePromise) return meetingAutosavePromise;
  meetingAutosavePromise = persistMeetingDraft(options).finally(() => {
    meetingAutosavePromise = null;
  });
  return meetingAutosavePromise;
}

async function persistMeetingDraft({ silent = false } = {}) {
  window.clearTimeout(meetingAutosaveTimer);
  meetingAutosaveTimer = null;
  const meeting = state.teamMeetings.find((item) => item.id === state.meetingEditorId);
  const form = document.querySelector("#meetingForm");
  if (!form || !meetingIsEditable(meeting)) return true;
  const payload = meetingFormPayload(form);
  const reference = doc(db, "teamMeetings", meeting.id);
  setMeetingSaveState("saving");
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("Cette rencontre n'existe plus.");
      const current = snapshot.data();
      if (current.status === "finalized") throw new Error("Cette rencontre a deja ete finalisee.");
      if (hasVersionConflict(current, state.meetingEditorVersion)) throw versionConflictError(current);
      transaction.set(reference, payload, { merge: true });
    });
    const savedSnapshot = await getDoc(reference);
    if (savedSnapshot.exists()) {
      Object.assign(meeting, savedSnapshot.data(), { id: meeting.id });
      state.meetingEditorVersion = entityVersionToken(meeting);
    }
    setMeetingSaveState("saved");
    if (!silent) showToast("Brouillon enregistre.");
    return true;
  } catch (error) {
    if (error.code === "version-conflict") {
      setMeetingSaveState("conflict");
      showToast("Cette note a ete modifiee ailleurs. Ferme-la pour charger la version recente.");
    } else {
      setMeetingSaveState("error");
      if (!silent) showToast(`Brouillon non enregistre: ${friendlyError(error)}`);
    }
    return false;
  }
}

function meetingFormPayload(form) {
  const data = new FormData(form);
  return {
    meetingDate: String(data.get("meetingDate") || todayInputValue()),
    facilitatorName: MEETING_FACILITATORS.includes(String(data.get("facilitatorName"))) ? String(data.get("facilitatorName")) : "Gabriel",
    sourceRoadmapId: String(data.get("sourceRoadmapId") || ""),
    checkIn: String(data.get("checkIn") || "").trim(),
    previousCommitmentStatus: MEETING_COMMITMENT_OPTIONS.some(([id]) => id === data.get("previousCommitmentStatus")) ? String(data.get("previousCommitmentStatus")) : "not_applicable",
    previousCommitmentNotes: String(data.get("previousCommitmentNotes") || "").trim(),
    pillar: MEETING_PILLAR_OPTIONS.some(([id]) => id === data.get("pillar")) ? String(data.get("pillar")) : "",
    pillarNotes: String(data.get("pillarNotes") || "").trim(),
    leverageAction: String(data.get("leverageAction") || "").trim(),
    memberCommitment: String(data.get("memberCommitment") || "").trim(),
    successMeasure: String(data.get("successMeasure") || "").trim(),
    leaderSupport: String(data.get("leaderSupport") || "").trim(),
    additionalNotes: String(data.get("additionalNotes") || "").trim(),
    signals: String(data.get("signals") || "").trim(),
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: actorName()
  };
}

async function finalizeTeamMeeting() {
  const meeting = state.teamMeetings.find((item) => item.id === state.meetingEditorId);
  const member = state.teamMembers.find((item) => item.id === meeting?.teamMemberId);
  const form = document.querySelector("#meetingForm");
  if (!meeting || !member || !form || !meetingIsEditable(meeting) || state.busy) return;
  const confirmed = window.confirm("Finaliser cette rencontre?\n\nLa note deviendra un element permanent en lecture seule dans l'historique du membre.");
  if (!confirmed) return;
  const saved = await saveMeetingDraft({ silent: true });
  if (!saved) return;
  const payload = meetingFormPayload(form);
  const createSupportTask = Boolean(form.elements.createSupportTask?.checked && payload.leaderSupport);
  const meetingRef = doc(db, "teamMeetings", meeting.id);
  const taskRef = createSupportTask ? doc(collection(db, "managementTasks")) : null;
  const auditRef = doc(collection(db, "auditLogs"));
  state.busy = true;
  setMeetingSaveState("saving");
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(meetingRef);
      if (!snapshot.exists()) throw new Error("Cette rencontre n'existe plus.");
      const current = snapshot.data();
      if (current.status === "finalized") throw new Error("Cette rencontre est deja finalisee.");
      if (hasVersionConflict(current, state.meetingEditorVersion)) throw versionConflictError(current);
      const finalPayload = {
        ...payload,
        status: "finalized",
        finalizedAt: serverTimestamp(),
        finalizedByUid: state.user.uid,
        finalizedByName: actorName()
      };
      if (taskRef && !current.supportTaskId) {
        finalPayload.supportTaskId = taskRef.id;
        transaction.set(taskRef, {
          title: `Soutien promis a ${member.name}`,
          description: payload.leaderSupport,
          teamMemberId: member.id,
          teamMemberName: member.name,
          ownerName: payload.facilitatorName,
          priority: "P2",
          status: "open",
          dueDate: "",
          taskKind: "followup",
          sourceType: "meeting",
          sourceMeetingId: meeting.id,
          createdAt: serverTimestamp(),
          createdByUid: state.user.uid,
          createdByName: actorName(),
          updatedAt: serverTimestamp(),
          updatedByUid: state.user.uid,
          updatedByName: actorName()
        });
      }
      transaction.set(meetingRef, finalPayload, { merge: true });
      transaction.set(auditRef, auditPayload("team_meeting_finalized", meeting.id, { teamMemberId: member.id, supportTaskId: taskRef?.id || "" }));
    });
    state.meetingEditorId = "";
    state.meetingEditorVersion = "";
    state.meetingSaveState = "saved";
    showToast(createSupportTask ? "Rencontre finalisee et soutien ajoute a A faire." : "Rencontre finalisee.");
    renderApp();
  } catch (error) {
    setMeetingSaveState(error.code === "version-conflict" ? "conflict" : "error");
    showToast(`Rencontre non finalisee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function deleteMeetingDraft() {
  const meeting = state.teamMeetings.find((item) => item.id === state.meetingEditorId);
  if (!meetingIsEditable(meeting) || state.busy) return;
  if (!window.confirm("Supprimer definitivement ce brouillon de rencontre?")) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "teamMeetings", meeting.id));
    batch.set(doc(collection(db, "auditLogs")), auditPayload("team_meeting_draft_deleted", meeting.id, { teamMemberId: meeting.teamMemberId }));
    await batch.commit();
    state.teamMeetings = state.teamMeetings.filter((item) => item.id !== meeting.id);
    state.meetingEditorId = "";
    state.meetingEditorVersion = "";
    showToast("Brouillon supprime.");
    renderApp();
  } catch (error) {
    showToast(`Brouillon non supprime: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function saveSharedMeetingSummary(event) {
  event.preventDefault();
  if (state.busy) return;
  const meeting = state.teamMeetings.find((item) => item.id === state.meetingEditorId);
  const member = state.teamMembers.find((item) => item.id === meeting?.teamMemberId);
  if (!meeting || meeting.status !== "finalized" || !member) return;
  const data = new FormData(event.currentTarget);
  const headline = String(data.get("headline") || "").trim();
  const summaryText = String(data.get("summary") || "").trim();
  const commitments = String(data.get("commitments") || "").trim();
  const ownerSupport = String(data.get("ownerSupport") || "").trim();
  if (!summaryText && !commitments && !ownerSupport) {
    showToast("Ajoute au moins un resume, un engagement ou un soutien avant de partager.");
    return;
  }
  const existing = sharedSummaryForMeeting(meeting.id);
  const summaryRef = doc(db, "memberSharedSummaries", meeting.id);
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(summaryRef, {
      meetingId: meeting.id,
      teamMemberId: member.id,
      teamMemberName: member.name,
      meetingDate: meeting.meetingDate || meeting.finalizedAt || serverTimestamp(),
      headline: headline || `Rencontre du ${formatShortDate(meeting.meetingDate || meeting.finalizedAt)}`,
      summary: summaryText,
      commitments,
      ownerSupport,
      portalContractVersion: PORTAL_CONTRACT_VERSION,
      publishedAt: existing?.publishedAt || serverTimestamp(),
      publishedByUid: existing?.publishedByUid || state.user.uid,
      publishedByName: existing?.publishedByName || actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    }, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload(existing ? "meeting_summary_updated" : "meeting_summary_shared", meeting.id, { teamMemberId: member.id }));
    await batch.commit();
    const localSummary = {
      id: meeting.id,
      meetingId: meeting.id,
      teamMemberId: member.id,
      teamMemberName: member.name,
      meetingDate: meeting.meetingDate,
      headline,
      summary: summaryText,
      commitments,
      ownerSupport,
      publishedAt: existing?.publishedAt || new Date(),
      publishedByName: existing?.publishedByName || actorName(),
      updatedAt: new Date()
    };
    state.memberSharedSummaries = [localSummary, ...state.memberSharedSummaries.filter((item) => item.id !== meeting.id)];
    showToast(existing ? "Compte rendu partage mis a jour." : "Compte rendu partage avec le membre.");
    renderApp();
  } catch (error) {
    showToast(`Compte rendu non partage: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function withdrawSharedMeetingSummary() {
  const meeting = state.teamMeetings.find((item) => item.id === state.meetingEditorId);
  const summary = sharedSummaryForMeeting(meeting?.id);
  if (!meeting || !summary || state.busy) return;
  if (!window.confirm("Retirer ce compte rendu de Mon parcours CFSB? Les notes owners resteront intactes.")) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "memberSharedSummaries", meeting.id));
    batch.set(doc(collection(db, "auditLogs")), auditPayload("meeting_summary_withdrawn", meeting.id, { teamMemberId: meeting.teamMemberId }));
    await batch.commit();
    state.memberSharedSummaries = state.memberSharedSummaries.filter((item) => item.id !== meeting.id);
    showToast("Compte rendu retire du portail membre.");
    renderApp();
  } catch (error) {
    showToast(`Compte rendu non retire: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

function setMeetingSaveState(value) {
  state.meetingSaveState = value;
  const element = document.querySelector("#meetingSaveStatus");
  if (!element) return;
  element.className = `meeting-save-status ${value}`;
  element.textContent = meetingSaveStatusLabel();
}

function meetingSaveStatusLabel() {
  if (state.meetingSaveState === "pending") return "Modifications a enregistrer";
  if (state.meetingSaveState === "saving") return "Enregistrement...";
  if (state.meetingSaveState === "conflict") return "Version plus recente detectee";
  if (state.meetingSaveState === "error") return "Echec de sauvegarde";
  return "Tout est sauvegarde";
}

function closeRoadmapCompletion(shouldRender = true) {
  state.roadmapCompletionId = "";
  state.roadmapCompletionVersion = "";
  if (shouldRender) renderApp();
}

function closeTeamAction(shouldRender = true) {
  state.teamActionMemberId = "";
  if (shouldRender) renderApp();
}

function openTaskEditor(taskId) {
  const task = state.managementTasks.find((item) => item.id === taskId);
  if (!task) return;
  closeCareerEditor(false);
  closeRoadmapCompletion(false);
  closeTeamAction(false);
  state.taskEditorId = taskId;
  state.taskEditorVersion = entityVersionToken(task);
  state.taskConflict = null;
  state.taskEditorForceSave = false;
  renderApp();
}

function closeTaskEditor(shouldRender = true) {
  state.taskEditorId = "";
  state.taskEditorVersion = "";
  state.taskConflict = null;
  state.taskEditorForceSave = false;
  if (shouldRender) renderApp();
}

function developmentProgramDraftFrom(program, nextVersion = false) {
  const familyId = program?.familyId || crypto.randomUUID();
  return {
    familyId,
    title: program?.title || "",
    description: program?.description || "",
    programType: program?.programType || "onboarding",
    ownerName: program?.ownerName || "Gabriel",
    roleIds: [...(program?.roleIds || [])],
    version: nextVersion ? nextDevelopmentVersion(state.developmentPrograms, familyId) : Number(program?.version || 1),
    status: nextVersion ? "draft" : program?.status || "draft",
    sourceProgramId: nextVersion ? program?.id || "" : "",
    steps: (program?.steps || [{ id: crypto.randomUUID(), title: "", description: "", category: "General", required: true, evidenceRequired: false }]).map((step, index) => ({ ...normalizeDevelopmentStep(step, index) }))
  };
}

function openDevelopmentProgramEditor(programId) {
  closeDevelopmentAssignmentEditor(false);
  closeDevelopmentStepEditor(false);
  const program = programId === "__new__" ? null : state.developmentPrograms.find((item) => item.id === programId) || null;
  state.developmentProgramEditorId = program?.id || "__new__";
  state.developmentProgramDraft = developmentProgramDraftFrom(program);
  renderApp();
}

function openDevelopmentProgramVersion(programId) {
  const program = state.developmentPrograms.find((item) => item.id === programId);
  if (!program || program.status !== "published") return;
  state.developmentProgramEditorId = "__new__";
  state.developmentProgramDraft = developmentProgramDraftFrom(program, true);
  renderApp();
}

function closeDevelopmentProgramEditor(shouldRender = true) {
  state.developmentProgramEditorId = "";
  state.developmentProgramDraft = null;
  if (shouldRender) renderApp();
}

function captureDevelopmentProgramDraft() {
  const form = document.querySelector("#developmentProgramForm");
  if (!form || !state.developmentProgramDraft) return;
  const data = new FormData(form);
  state.developmentProgramDraft.title = String(data.get("title") || "");
  state.developmentProgramDraft.description = String(data.get("description") || "");
  state.developmentProgramDraft.programType = String(data.get("programType") || "onboarding");
  state.developmentProgramDraft.ownerName = String(data.get("ownerName") || "Gabriel");
  const selectedRoles = data.getAll("roleIds").map(String).filter(Boolean);
  state.developmentProgramDraft.roleIds = selectedRoles.length
    ? selectedRoles
    : String(data.get("roleIdsText") || "").split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
  state.developmentProgramDraft.steps = state.developmentProgramDraft.steps.map((step, index) => ({
    ...step,
    title: String(data.get(`stepTitle_${index}`) || ""),
    category: String(data.get(`stepCategory_${index}`) || "General"),
    description: String(data.get(`stepDescription_${index}`) || ""),
    required: data.get(`stepRequired_${index}`) === "on",
    evidenceRequired: data.get(`stepEvidence_${index}`) === "on",
    sortOrder: index + 1
  }));
}

function addDevelopmentProgramStep() {
  captureDevelopmentProgramDraft();
  state.developmentProgramDraft.steps.push({ id: crypto.randomUUID(), title: "", description: "", category: "General", required: true, evidenceRequired: false, sortOrder: state.developmentProgramDraft.steps.length + 1 });
  renderApp();
}

function removeDevelopmentProgramStep(index) {
  captureDevelopmentProgramDraft();
  if (state.developmentProgramDraft.steps.length <= 1) return showToast("Un programme doit conserver au moins une etape.");
  state.developmentProgramDraft.steps.splice(index, 1);
  state.developmentProgramDraft.steps.forEach((step, stepIndex) => { step.sortOrder = stepIndex + 1; });
  renderApp();
}

function moveDevelopmentProgramStep(index, direction) {
  captureDevelopmentProgramDraft();
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= state.developmentProgramDraft.steps.length) return;
  const [step] = state.developmentProgramDraft.steps.splice(index, 1);
  state.developmentProgramDraft.steps.splice(nextIndex, 0, step);
  state.developmentProgramDraft.steps.forEach((item, stepIndex) => { item.sortOrder = stepIndex + 1; });
  renderApp();
}

async function saveDevelopmentProgram(event) {
  event.preventDefault();
  if (state.previewMode) return showToast("Apercu local: aucune donnee n'est ecrite.");
  if (state.busy || !state.developmentProgramDraft) return;
  captureDevelopmentProgramDraft();
  const validation = validateDevelopmentProgram(state.developmentProgramDraft);
  if (!validation.valid) return showToast(validation.errors[0]);
  const intent = event.submitter?.value === "publish" ? "publish" : "draft";
  const existing = state.developmentPrograms.find((program) => program.id === state.developmentProgramEditorId) || null;
  if (existing && existing.status !== "draft") return showToast("Une version publiee ne peut pas etre modifiee.");
  state.busy = true;
  try {
    const programRef = existing ? doc(db, "developmentPrograms", existing.id) : doc(collection(db, "developmentPrograms"));
    const payload = {
      familyId: state.developmentProgramDraft.familyId,
      title: state.developmentProgramDraft.title.trim(),
      description: state.developmentProgramDraft.description.trim(),
      programType: state.developmentProgramDraft.programType,
      ownerName: state.developmentProgramDraft.ownerName,
      roleIds: state.developmentProgramDraft.roleIds,
      version: Number(state.developmentProgramDraft.version || 1),
      status: intent === "publish" ? "published" : "draft",
      sourceProgramId: state.developmentProgramDraft.sourceProgramId || null,
      steps: validation.steps,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    if (!existing) {
      payload.createdAt = serverTimestamp();
      payload.createdByUid = state.user.uid;
      payload.createdByName = actorName();
    }
    if (intent === "publish") {
      payload.publishedAt = serverTimestamp();
      payload.publishedByUid = state.user.uid;
      payload.publishedByName = actorName();
    }
    const batch = writeBatch(db);
    batch.set(programRef, payload, { merge: Boolean(existing) });
    if (intent === "publish") {
      state.developmentPrograms.filter((program) => program.id !== programRef.id && program.familyId === payload.familyId && program.status === "published").forEach((program) => {
        batch.update(doc(db, "developmentPrograms", program.id), { status: "superseded", supersededAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedByUid: state.user.uid, updatedByName: actorName() });
      });
    }
    batch.set(doc(collection(db, "auditLogs")), auditPayload(intent === "publish" ? "development_program_published" : existing ? "development_program_updated" : "development_program_created", programRef.id, { title: payload.title, version: payload.version, programType: payload.programType }));
    await batch.commit();
    closeDevelopmentProgramEditor(false);
    showToast(intent === "publish" ? "Programme publie et pret a etre assigne." : "Brouillon du programme sauvegarde.");
    renderApp();
  } catch (error) {
    showToast(`Programme non enregistre: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function deleteDevelopmentProgramDraft() {
  if (state.previewMode) return showToast("Apercu local: aucune donnee n'est supprimee.");
  const program = state.developmentPrograms.find((item) => item.id === state.developmentProgramEditorId);
  if (!program || program.status !== "draft" || state.busy) return;
  if (!confirm(`Supprimer le brouillon « ${program.title} »?`)) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "developmentPrograms", program.id));
    batch.set(doc(collection(db, "auditLogs")), auditPayload("development_program_draft_deleted", program.id, { title: program.title, version: program.version }));
    await batch.commit();
    closeDevelopmentProgramEditor(false);
    showToast("Brouillon supprime.");
    renderApp();
  } catch (error) {
    showToast(`Brouillon non supprime: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

function openDevelopmentAssignmentEditor(memberId = "") {
  state.developmentAssignmentPrefillMemberId = memberId;
  state.developmentAssignmentEditorOpen = true;
  renderApp();
}

function closeDevelopmentAssignmentEditor(shouldRender = true) {
  state.developmentAssignmentEditorOpen = false;
  state.developmentAssignmentPrefillMemberId = "";
  if (shouldRender) renderApp();
}

function filterDevelopmentProgramOptions() {
  const memberSelect = document.querySelector("#developmentAssignmentMember");
  const programSelect = document.querySelector("#developmentAssignmentProgram");
  if (!memberSelect || !programSelect) return;
  const member = state.teamMembers.find((item) => item.id === memberSelect.value);
  const memberRoles = new Set(member?.roleIds || []);
  [...programSelect.options].forEach((option) => {
    if (!option.value) return;
    const programRoles = String(option.dataset.roleIds || "").split(",").filter(Boolean);
    option.disabled = Boolean(memberRoles.size && programRoles.length && !programRoles.some((roleId) => memberRoles.has(roleId)));
  });
  if (programSelect.selectedOptions[0]?.disabled) programSelect.value = "";
}

async function saveDevelopmentAssignment(event) {
  event.preventDefault();
  if (state.previewMode) return showToast("Apercu local: aucune assignation n'est creee.");
  if (state.busy) return;
  const data = new FormData(event.currentTarget);
  const member = state.teamMembers.find((item) => item.id === data.get("teamMemberId"));
  const program = state.developmentPrograms.find((item) => item.id === data.get("programId") && item.status === "published");
  if (!member || !program) return showToast("Choisis un membre actif et une version publiee.");
  const duplicate = state.developmentAssignments.find((assignment) => assignment.teamMemberId === member.id && assignment.familyId === program.familyId && !assignment.archivedAt && effectiveDevelopmentAssignmentStatus(assignment) !== "completed");
  if (duplicate) return showToast("Ce membre a deja une version active de ce programme.");
  state.busy = true;
  try {
    const assignmentRef = doc(collection(db, "developmentAssignments"));
    const snapshot = developmentProgramSnapshot(program);
    const payload = {
      ...snapshot,
      teamMemberId: member.id,
      teamMemberName: member.name,
      ownerName: String(data.get("ownerName") || program.ownerName || "Gabriel"),
      notes: String(data.get("notes") || "").trim(),
      status: "not_started",
      stepStates: {},
      progress: 0,
      createdAt: serverTimestamp(),
      createdByUid: state.user.uid,
      createdByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    const batch = writeBatch(db);
    batch.set(assignmentRef, payload);
    batch.set(doc(collection(db, "auditLogs")), auditPayload("development_assignment_created", assignmentRef.id, { teamMemberId: member.id, teamMemberName: member.name, title: program.title, version: program.version }));
    await batch.commit();
    state.developmentAssignmentEditorOpen = false;
    state.developmentAssignmentPrefillMemberId = "";
    state.view = "development";
    state.developmentSection = "assignments";
    state.developmentAssignmentView = "active";
    state.selectedDevelopmentAssignmentId = assignmentRef.id;
    showToast("Programme assigne au dossier du membre.");
    renderApp();
  } catch (error) {
    showToast(`Assignation non creee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

function closeDevelopmentStepEditor(shouldRender = true) {
  state.developmentStepEditorId = "";
  if (shouldRender) renderApp();
}

async function saveDevelopmentStep(event) {
  event.preventDefault();
  if (state.previewMode) return showToast("Apercu local: aucune progression n'est ecrite.");
  const assignment = state.developmentAssignments.find((item) => item.id === state.selectedDevelopmentAssignmentId);
  const step = assignment?.steps?.find((item) => item.id === state.developmentStepEditorId);
  if (!assignment || !step || state.busy) return;
  if (effectiveDevelopmentAssignmentStatus(assignment) === "paused") return showToast("Reprends le programme avant de modifier une etape.");
  const data = new FormData(event.currentTarget);
  const value = { status: String(data.get("status") || "pending"), note: String(data.get("note") || "").trim(), evidenceUrl: normalizeExternalUrl(data.get("evidenceUrl")) };
  const validation = canCompleteDevelopmentStep(step, value);
  if (!validation.valid) return showToast(validation.error);
  state.busy = true;
  try {
    const assignmentRef = doc(db, "developmentAssignments", assignment.id);
    const auditRef = doc(collection(db, "auditLogs"));
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(assignmentRef);
      if (!snapshot.exists()) throw new Error("Cette assignation n'existe plus.");
      const current = { id: snapshot.id, ...snapshot.data() };
      const stepStates = { ...(current.stepStates || {}), [step.id]: { ...value, updatedAt: new Date(), updatedByUid: state.user.uid, updatedByName: actorName() } };
      const next = { ...current, stepStates, reopenedAt: null };
      const status = current.status === "paused" ? "paused" : effectiveDevelopmentAssignmentStatus(next);
      const progress = developmentAssignmentProgress(next);
      transaction.update(assignmentRef, {
        stepStates,
        status,
        progress: progress.percent,
        completedSteps: progress.completed,
        totalSteps: progress.total,
        completedAt: status === "completed" ? serverTimestamp() : deleteField(),
        completedByUid: status === "completed" ? state.user.uid : deleteField(),
        completedByName: status === "completed" ? actorName() : deleteField(),
        reopenedAt: deleteField(),
        updatedAt: serverTimestamp(),
        updatedByUid: state.user.uid,
        updatedByName: actorName()
      });
      transaction.set(auditRef, auditPayload("development_step_updated", assignment.id, { teamMemberId: current.teamMemberId, teamMemberName: current.teamMemberName, title: current.programTitle, stepId: step.id, stepTitle: step.title, status }));
    });
    closeDevelopmentStepEditor(false);
    showToast(value.status === "completed" ? "Etape terminee." : "Etape mise a jour.");
    renderApp();
  } catch (error) {
    showToast(`Etape non enregistree: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function toggleDevelopmentAssignment(action) {
  if (state.previewMode) return showToast("Apercu local: aucun etat n'est modifie.");
  const assignment = state.developmentAssignments.find((item) => item.id === state.selectedDevelopmentAssignmentId);
  if (!assignment || state.busy || !["pause", "resume", "reopen"].includes(action)) return;
  const status = action === "pause" ? "paused" : action === "reopen" ? "in_progress" : effectiveDevelopmentAssignmentStatus({ ...assignment, status: "in_progress" });
  state.busy = true;
  try {
    const batch = writeBatch(db);
    const update = {
      status,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    if (action === "reopen") {
      update.completedAt = deleteField();
      update.completedByUid = deleteField();
      update.completedByName = deleteField();
      update.reopenedAt = serverTimestamp();
    }
    batch.update(doc(db, "developmentAssignments", assignment.id), update);
    const auditAction = action === "pause" ? "development_assignment_paused" : action === "reopen" ? "development_assignment_reopened" : "development_assignment_resumed";
    batch.set(doc(collection(db, "auditLogs")), auditPayload(auditAction, assignment.id, { teamMemberId: assignment.teamMemberId, teamMemberName: assignment.teamMemberName, title: assignment.programTitle }));
    await batch.commit();
    showToast(action === "pause" ? "Programme mis en pause." : action === "reopen" ? "Programme rouvert." : "Programme repris.");
    renderApp();
  } catch (error) {
    showToast(`Etat non modifie: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

function openDevelopmentMember(memberId) {
  const member = state.teamMembers.find((item) => item.id === memberId);
  if (!member) return;
  state.view = "team";
  state.selectedMemberId = member.id;
  state.teamRosterView = teamMemberBucket(member);
  state.memberProfileSection = "development";
  renderApp();
}

function openDevelopmentAssignment(assignmentId) {
  const assignment = state.developmentAssignments.find((item) => item.id === assignmentId);
  if (!assignment) return;
  state.view = "development";
  state.developmentSection = "assignments";
  state.developmentAssignmentView = effectiveDevelopmentAssignmentStatus(assignment) === "completed" ? "completed" : "active";
  state.selectedDevelopmentAssignmentId = assignment.id;
  state.selectedMemberId = "";
  renderApp();
}

function openWorkingGeniusEditor(memberId) {
  if (!state.teamMembers.some((member) => member.id === memberId)) return;
  state.workingGeniusEditorMemberId = memberId;
  renderApp();
}

function closeWorkingGeniusEditor(shouldRender = true) {
  state.workingGeniusEditorMemberId = "";
  if (shouldRender) renderApp();
}

async function saveWorkingGeniusProfile(event) {
  event.preventDefault();
  if (state.previewMode) return showToast("Apercu local: aucun profil n'est ecrit.");
  const member = state.teamMembers.find((item) => item.id === state.workingGeniusEditorMemberId);
  if (!member || state.busy) return;
  const data = new FormData(event.currentTarget);
  const resultBuckets = Object.fromEntries(WORKING_GENIUS_BUCKETS.map(([key]) => [key, []]));
  WORKING_GENIUS_TYPES.forEach((type) => {
    const bucket = String(data.get(`workingGenius_${type.code}`) || "");
    if (resultBuckets[bucket]) resultBuckets[bucket].push(type.code);
  });
  const validation = validateWorkingGeniusProfile({
    teamMemberId: member.id,
    ...resultBuckets,
    assessmentDate: String(data.get("assessmentDate") || ""),
    reportUrl: String(data.get("reportUrl") || "").trim(),
    sourceLabel: String(data.get("sourceLabel") || "Rapport officiel Working Genius"),
    notes: String(data.get("notes") || "")
  });
  if (!validation.valid) return showToast(validation.errors[0]);
  state.busy = true;
  try {
    const existing = state.workingGeniusProfiles[member.id] || null;
    const reference = doc(db, "workingGeniusProfiles", member.id);
    const payload = {
      ...validation.profile,
      reportUrl: validation.profile.reportUrl ? normalizeExternalUrl(validation.profile.reportUrl) : "",
      status: validation.status,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    if (!existing) {
      payload.createdAt = serverTimestamp();
      payload.createdByUid = state.user.uid;
      payload.createdByName = actorName();
    }
    const batch = writeBatch(db);
    batch.set(reference, payload, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload(existing ? "working_genius_profile_updated" : "working_genius_profile_created", member.id, { teamMemberId: member.id, teamMemberName: member.name, status: validation.status }));
    await batch.commit();
    closeWorkingGeniusEditor(false);
    showToast(validation.status === "complete" ? "Profil Working Genius complet." : "Profil Working Genius partiel enregistre.");
    renderApp();
  } catch (error) {
    showToast(`Profil non enregistre: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function deleteWorkingGeniusProfile() {
  if (state.previewMode) return showToast("Apercu local: aucun profil n'est supprime.");
  const member = state.teamMembers.find((item) => item.id === state.workingGeniusEditorMemberId);
  if (!member || !state.workingGeniusProfiles[member.id] || state.busy) return;
  if (!confirm(`Supprimer le profil Working Genius de ${member.name}?`)) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "workingGeniusProfiles", member.id));
    batch.set(doc(collection(db, "auditLogs")), auditPayload("working_genius_profile_deleted", member.id, { teamMemberId: member.id, teamMemberName: member.name }));
    await batch.commit();
    closeWorkingGeniusEditor(false);
    showToast("Profil Working Genius supprime.");
    renderApp();
  } catch (error) {
    showToast(`Profil non supprime: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

function hasOpenModal() {
  return Boolean(state.taskEditorId || state.teamActionMemberId || state.roadmapCompletionId || state.careerEditorId || state.meetingEditorId || state.pilotageEditorType || state.strategyEditorType || state.developmentProgramEditorId || state.developmentAssignmentEditorOpen || state.developmentStepEditorId || state.workingGeniusEditorMemberId);
}

function hasProtectedEditor() {
  const activePilotageForm = document.activeElement?.closest?.("#pilotageMeetingForm, #pilotageEntriesForm, #pilotageQuickIssueForm");
  return hasOpenModal() || Boolean(state.editingMemberId) || Boolean(activePilotageForm);
}

function syncModalState() {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].at(-1) || null;
  document.body.classList.toggle("modal-open", Boolean(dialog));
  if (!dialog) return;
  window.requestAnimationFrame(() => {
    const preferred = dialog.querySelector("[autofocus]") || firstFocusable(dialog);
    preferred?.focus();
  });
}

function handleGlobalKeydown(event) {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  const dialog = dialogs.at(-1) || null;
  if (event.key === "Escape" && hasOpenModal()) {
    event.preventDefault();
    if (state.strategyEditorType) closeStrategyEditor();
    else if (state.workingGeniusEditorMemberId) closeWorkingGeniusEditor();
    else if (state.developmentStepEditorId) closeDevelopmentStepEditor();
    else if (state.developmentAssignmentEditorOpen) closeDevelopmentAssignmentEditor();
    else if (state.developmentProgramEditorId) closeDevelopmentProgramEditor();
    else if (state.pilotageEditorType) closePilotageEditor();
    else if (state.taskEditorId) closeTaskEditor();
    else if (state.meetingEditorId) closeMeetingEditor();
    else if (state.teamActionMemberId) closeTeamAction();
    else if (state.roadmapCompletionId) closeRoadmapCompletion();
    else closeCareerEditor();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;
  const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.classList.contains("career-modal-backdrop") && element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function firstFocusable(container) {
  return [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
    .find((element) => !element.classList.contains("career-modal-backdrop") && element.getClientRects().length > 0) || null;
}

function updateTeamActionTitle(event) {
  const member = state.teamMembers.find((item) => item.id === state.teamActionMemberId);
  const titleInput = document.querySelector('#teamActionForm input[name="title"]');
  if (!member || !titleInput) return;
  titleInput.value = defaultMemberActionTitle(event.target.value, member.name);
}

function openCareerFromNextAction() {
  const submission = selectedSubmission();
  if (!submission) return;
  const member = memberForSubmission(submission);
  if (!member) {
    showToast("Associe d'abord cette roadmap a un membre de l'equipe.");
    return;
  }
  const linked = state.careerMilestones.find((item) => item.sourceSubmissionId === submission.id && !item.archivedAt) || null;
  const notes = state.ownerNotes[submission.id] || {};
  state.view = "team";
  state.selectedMemberId = member.id;
  state.teamRosterView = teamMemberBucket(member);
  state.editingMemberId = "";
  state.memberProfileSection = "career";
  state.showArchivedCareer = false;
  if (linked) {
    state.careerEditorId = linked.id;
    state.careerEditorVersion = entityVersionToken(linked);
    state.careerDraft = null;
  } else {
    state.careerEditorId = "__new__";
    state.careerEditorVersion = "";
    state.careerDraft = {
      title: notes.nextAction || "",
      category: "skill",
      status: "planned",
      targetDate: notes.followupDate || "",
      progress: 0,
      sourceSubmissionId: submission.id,
      description: `Prochaine etape issue de la roadmap ${submission.cycleId || "sans trimestre"}.`
    };
  }
  renderApp();
}

async function saveCareerMilestone(event) {
  event.preventDefault();
  if (state.busy) return;
  const member = state.teamMembers.find((item) => item.id === state.selectedMemberId);
  if (!member) return;
  const data = new FormData(event.currentTarget);
  const title = String(data.get("title") || "").trim();
  if (!title) return;
  const existingId = String(data.get("milestoneId") || "").trim();
  const existing = state.careerMilestones.find((item) => item.id === existingId) || null;
  const milestoneRef = existing ? doc(db, "careerMilestones", existing.id) : doc(collection(db, "careerMilestones"));
  const status = CAREER_STATUS_LABELS[String(data.get("status") || "")] ? String(data.get("status")) : "planned";
  const category = CAREER_CATEGORY_LABELS[String(data.get("category") || "")] ? String(data.get("category")) : "other";
  const sourceSubmissionId = String(data.get("sourceSubmissionId") || "").trim();
  const sourceSubmission = state.submissions.find((item) => item.id === sourceSubmissionId) || null;
  const progress = clampProgress(data.get("progress"));
  let completedDate = String(data.get("completedDate") || "").trim();
  if (status === "completed" && !completedDate) completedDate = todayInputValue();
  state.busy = true;
  try {
    const payload = {
      teamMemberId: member.id,
      teamMemberName: member.name,
      title,
      category,
      status,
      targetDate: String(data.get("targetDate") || "").trim(),
      completedDate,
      description: String(data.get("description") || "").trim(),
      successCriteria: String(data.get("successCriteria") || "").trim(),
      ownerName: String(data.get("ownerName") || "").trim(),
      progress,
      sourceSubmissionId: sourceSubmissionId || null,
      sourceLabel: sourceSubmission ? submissionLabel(sourceSubmission) : "",
      archivedAt: existing?.archivedAt || null,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    if (!existing) {
      payload.createdAt = serverTimestamp();
      payload.createdByUid = state.user.uid;
      payload.createdByName = actorName();
    }
    const auditRef = doc(collection(db, "auditLogs"));
    const audit = auditPayload("career_milestone_saved", milestoneRef.id, {
      teamMemberId: member.id,
      status,
      progress
    });
    if (existing) {
      const saved = await runVersionedWrite({
        reference: milestoneRef,
        baseline: state.careerEditorVersion,
        label: "cette etape",
        write(transaction) {
          transaction.set(milestoneRef, payload, { merge: true });
          transaction.set(auditRef, audit);
        }
      });
      if (!saved) {
        closeCareerEditor();
        return;
      }
    } else {
      const batch = writeBatch(db);
      batch.set(milestoneRef, payload, { merge: true });
      batch.set(auditRef, audit);
      await batch.commit();
    }
    closeCareerEditor(false);
    showToast(existing ? "Etape mise a jour." : "Etape ajoutee au parcours.");
    renderApp();
  } catch (error) {
    showToast(`Etape non enregistree: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function saveCareerUpdate(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  const milestone = state.careerMilestones.find((item) => item.id === state.careerEditorId);
  if (!milestone) return;
  const data = new FormData(form);
  const note = String(data.get("note") || "").trim();
  if (!note) return;
  const progress = clampProgress(data.get("progress"));
  let nextStatus = milestone.status || "planned";
  if (progress >= 100 && nextStatus !== "abandoned") nextStatus = "completed";
  else if (progress > 0 && nextStatus === "planned") nextStatus = "in_progress";
  state.busy = true;
  try {
    const updateRef = doc(collection(db, "careerUpdates"));
    const updatePayload = {
      milestoneId: milestone.id,
      teamMemberId: milestone.teamMemberId,
      note,
      progress,
      statusSnapshot: nextStatus,
      createdAt: serverTimestamp(),
      createdByUid: state.user.uid,
      createdByName: actorName()
    };
    const milestoneUpdate = {
      progress,
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    if (nextStatus === "completed" && !milestone.completedDate) milestoneUpdate.completedDate = todayInputValue();
    const milestoneRef = doc(db, "careerMilestones", milestone.id);
    const auditRef = doc(collection(db, "auditLogs"));
    const audit = auditPayload("career_update_added", milestone.id, {
      teamMemberId: milestone.teamMemberId,
      progress,
      status: nextStatus
    });
    const saved = await runVersionedWrite({
      reference: milestoneRef,
      baseline: state.careerEditorVersion,
      label: "cette etape",
      write(transaction) {
        transaction.set(updateRef, updatePayload);
        transaction.update(milestoneRef, milestoneUpdate);
        transaction.set(auditRef, audit);
      }
    });
    if (!saved) {
      closeCareerEditor();
      return;
    }
    Object.assign(milestone, milestoneUpdate, { updatedAt: new Date() });
    state.careerEditorVersion = entityVersionToken(milestone);
    form.reset();
    showToast("Note d'evolution ajoutee.");
  } catch (error) {
    showToast(`Note non enregistree: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function toggleCareerArchive() {
  const milestone = state.careerMilestones.find((item) => item.id === state.careerEditorId);
  if (!milestone || state.busy) return;
  const restoring = Boolean(milestone.archivedAt);
  if (!restoring && !window.confirm(`Archiver l'etape « ${milestone.title || "sans titre"} »?`)) return;
  state.busy = true;
  try {
    const milestoneRef = doc(db, "careerMilestones", milestone.id);
    const auditRef = doc(collection(db, "auditLogs"));
    const milestoneUpdate = {
      archivedAt: restoring ? null : serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    const audit = auditPayload(restoring ? "career_milestone_restored" : "career_milestone_archived", milestone.id, {
      teamMemberId: milestone.teamMemberId
    });
    const saved = await runVersionedWrite({
      reference: milestoneRef,
      baseline: state.careerEditorVersion,
      label: "cette etape",
      write(transaction) {
        transaction.update(milestoneRef, milestoneUpdate);
        transaction.set(auditRef, audit);
      }
    });
    if (!saved) {
      closeCareerEditor();
      return;
    }
    closeCareerEditor(false);
    showToast(restoring ? "Etape restauree." : "Etape archivee.");
    renderApp();
  } catch (error) {
    showToast(`Action impossible: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function saveOwnerNotes() {
  const submission = selectedSubmission();
  if (!submission || state.busy) return;
  state.busy = true;
  setSaveStatus("Enregistrement en cours...");
  const meetingSummary = document.querySelector("#ownerMainNote")?.value || "";
  const payload = {
    submissionId: submission.id,
    reviewerName: document.querySelector("#ownerReviewer")?.value || "",
    ownerStatus: submission.status || "to_read",
    meetingDate: document.querySelector("#meetingDate")?.value || "",
    meetingSummary,
    followupNotes: meetingSummary,
    nextAction: document.querySelector("#nextAction")?.value || "",
    followupDate: document.querySelector("#followupDate")?.value || "",
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: state.profile.displayName || state.user.displayName || "Owner"
  };
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "ownerNotes", submission.id), payload, { merge: true });
    batch.update(doc(db, "roadmapSubmissions", submission.id), { updatedAt: serverTimestamp() });
    const logRef = doc(collection(db, "auditLogs"));
    batch.set(logRef, auditPayload("owner_notes_saved", submission.id));
    await batch.commit();
    setSaveStatus("Note enregistree dans Firebase.", "success");
  } catch (error) {
    setSaveStatus(`Erreur: ${friendlyError(error)}`, "error");
  } finally {
    state.busy = false;
  }
}

async function handleRoadmapAction(action, submissionId) {
  const submission = state.submissions.find((item) => item.id === submissionId);
  if (!submission || state.busy) return;
  if (action === "meeting_done") {
    state.roadmapCompletionId = submission.id;
    state.roadmapCompletionVersion = entityVersionToken(submission);
    renderApp();
    return;
  }
  const transitions = {
    mark_read: ["meeting_planned", "Roadmap marquee comme lue."],
    mark_unread: ["to_read", "Roadmap replacee dans A lire."],
    followup_done: ["meeting_done", "Suivi termine. La roadmap est maintenant dans l'historique."]
  };
  const transition = transitions[action];
  if (!transition) return;
  const [nextStatus, confirmation] = transition;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "roadmapSubmissions", submission.id), {
      status: nextStatus,
      archivedAt: null,
      updatedAt: serverTimestamp()
    });
    const noteUpdate = {
      submissionId: submission.id,
      ownerStatus: nextStatus,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    if (action === "followup_done") noteUpdate.followupCompletedAt = serverTimestamp();
    batch.set(doc(db, "ownerNotes", submission.id), noteUpdate, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_workflow_advanced", submission.id, { action, status: nextStatus }));
    await batch.commit();
    if (state.view === "roadmaps" && nextStatus === "meeting_done") state.roadmapView = "history";
    showToast(confirmation);
    renderApp();
  } catch (error) {
    showToast(`Action impossible: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function completeRoadmapMeeting(event) {
  event.preventDefault();
  const submission = state.submissions.find((item) => item.id === state.roadmapCompletionId);
  if (!submission || state.busy) return;
  const data = new FormData(event.currentTarget);
  const nextAction = String(data.get("nextAction") || "").trim();
  const reviewerName = String(data.get("reviewerName") || "Michael + Gabriel");
  const nextStatus = nextAction ? "action_required" : "meeting_done";
  state.busy = true;
  try {
    const submissionRef = doc(db, "roadmapSubmissions", submission.id);
    const notesRef = doc(db, "ownerNotes", submission.id);
    const auditRef = doc(collection(db, "auditLogs"));
    const submissionUpdate = {
      status: nextStatus,
      archivedAt: null,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    const notesUpdate = {
      submissionId: submission.id,
      ownerStatus: nextStatus,
      reviewerName,
      nextAction,
      meetingCompletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    const audit = auditPayload("roadmap_meeting_completed", submission.id, {
      status: nextStatus,
      hasFollowup: Boolean(nextAction)
    });
    const saved = await runVersionedWrite({
      reference: submissionRef,
      baseline: state.roadmapCompletionVersion,
      label: "cette roadmap",
      write(transaction) {
        transaction.update(submissionRef, submissionUpdate);
        transaction.set(notesRef, notesUpdate, { merge: true });
        transaction.set(auditRef, audit);
      }
    });
    if (!saved) {
      closeRoadmapCompletion();
      return;
    }
    closeRoadmapCompletion(false);
    if (state.view === "roadmaps") state.roadmapView = nextStatus === "meeting_done" ? "history" : "queue";
    showToast(nextAction ? "Rencontre terminee. Le suivi est ajoute a A faire." : "Rencontre terminee. La roadmap est dans l'historique.");
    renderApp();
  } catch (error) {
    showToast(`Rencontre non terminee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function setSelectedStatus(nextStatus) {
  const submission = selectedSubmission();
  if (!submission || state.busy || !STATUS_LABELS[nextStatus] || nextStatus === "archived" || submission.status === nextStatus) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "roadmapSubmissions", submission.id), {
      status: nextStatus,
      archivedAt: null,
      updatedAt: serverTimestamp()
    });
    batch.set(doc(db, "ownerNotes", submission.id), {
      submissionId: submission.id,
      ownerStatus: nextStatus,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    }, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_status_changed", submission.id, { status: nextStatus }));
    await batch.commit();
    showToast(`Statut: ${STATUS_LABELS[nextStatus]}.`);
  } catch (error) {
    showToast(`Statut non modifie: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function assignSelectedMember(event) {
  const submission = selectedSubmission();
  if (!submission || state.busy) return;
  const memberId = event.target.value || "";
  const member = state.teamMembers.find((item) => item.id === memberId) || null;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "roadmapSubmissions", submission.id), {
      teamMemberId: memberId || null,
      teamMemberName: member?.name || null,
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_member_assigned", submission.id, { teamMemberId: memberId || null }));
    await batch.commit();
    showToast(member ? `Roadmap associee au dossier de ${member.name}.` : "Association retiree.");
  } catch (error) {
    showToast(`Association impossible: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function archiveSelected() {
  const submission = selectedSubmission();
  if (!submission || state.busy) return;
  const name = submission.employeeName || submission.answers?.employee_name || "cette soumission";
  if (!window.confirm(`Archiver ${name}? La roadmap restera consultable dans Archives.`)) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "roadmapSubmissions", submission.id), {
      status: "archived",
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.set(doc(db, "ownerNotes", submission.id), {
      submissionId: submission.id,
      ownerStatus: "archived",
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    }, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_archived", submission.id));
    await batch.commit();
    state.view = "roadmaps";
    state.roadmapView = "history";
    state.filters.status = "all";
    showToast("Roadmap archivee.");
  } catch (error) {
    showToast(`Archivage impossible: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function restoreSelected() {
  const submission = selectedSubmission();
  if (!submission || state.busy) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "roadmapSubmissions", submission.id), {
      status: "to_read",
      archivedAt: null,
      updatedAt: serverTimestamp()
    });
    batch.set(doc(db, "ownerNotes", submission.id), {
      submissionId: submission.id,
      ownerStatus: "to_read",
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    }, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_restored", submission.id));
    await batch.commit();
    state.view = "roadmaps";
    state.roadmapView = "queue";
    state.filters.status = "all";
    showToast("Roadmap rouverte dans En cours.");
  } catch (error) {
    showToast(`Restauration impossible: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function moveSelectedToTrash() {
  const submission = selectedSubmission();
  if (!submission || state.busy || submissionBucket(submission) !== "history") return;
  const name = submission.employeeName || submission.answers?.employee_name || "cette soumission";
  if (!window.confirm(`Mettre la roadmap de ${name} a la corbeille? Elle pourra encore etre restauree.`)) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "roadmapSubmissions", submission.id), {
      deletedAt: serverTimestamp(),
      deletedByUid: state.user.uid,
      deletedByName: state.profile.displayName || state.user.displayName || "Owner",
      statusBeforeDelete: submission.status || "meeting_done",
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_trashed", submission.id));
    await batch.commit();
    state.view = "roadmaps";
    state.roadmapView = "trash";
    state.filters.status = "all";
    showToast("Roadmap placee dans la corbeille.");
  } catch (error) {
    showToast(`Suppression impossible: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function restoreSelectedFromTrash() {
  const submission = selectedSubmission();
  if (!submission || state.busy || !isDeleted(submission)) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "roadmapSubmissions", submission.id), {
      deletedAt: null,
      deletedByUid: null,
      deletedByName: null,
      status: ["meeting_done", "ready_to_archive", "archived"].includes(submission.statusBeforeDelete) ? submission.statusBeforeDelete : "meeting_done",
      statusBeforeDelete: null,
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_trash_restored", submission.id));
    await batch.commit();
    state.view = "roadmaps";
    state.roadmapView = "history";
    state.filters.status = "all";
    showToast("Roadmap restauree dans l'historique.");
  } catch (error) {
    showToast(`Restauration impossible: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function deleteSelectedForever() {
  const submission = selectedSubmission();
  if (!submission || state.busy || !isDeleted(submission)) return;
  const confirmation = window.prompt("Cette action est irreversible. Ecris SUPPRIMER pour confirmer.");
  if (confirmation !== "SUPPRIMER") {
    if (confirmation != null) showToast("Suppression annulee: confirmation invalide.");
    return;
  }
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_deleted_permanently", submission.id, {
      cycleId: submission.cycleId || ""
    }));
    batch.delete(doc(db, "ownerNotes", submission.id));
    batch.delete(doc(db, "roadmapSubmissions", submission.id));
    await batch.commit();
    state.selectedId = "";
    showToast("Roadmap supprimee definitivement.");
  } catch (error) {
    showToast(`Suppression definitive impossible: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function saveTeamMember(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const existingId = String(data.get("memberId") || "").trim();
  const memberId = existingId || slug(name);
  if (!name || !memberId) return;
  const existingMember = state.teamMembers.find((item) => item.id === existingId) || null;
  const roadmapDocumentUrl = normalizeExternalUrl(data.get("roadmapDocumentUrl"));
  const coachDashboardId = String(data.get("coachDashboardId") || "").trim();
  const portalEmail = String(data.get("portalEmail") || "").trim().toLowerCase();
  const portalEnabled = data.get("portalEnabled") === "on";
  if (portalEnabled && !portalEmail) {
    showToast("Ajoute le courriel Google du membre avant d'activer le portail.");
    return;
  }
  state.busy = true;
  try {
    if (!existingId) {
      const existing = await getDoc(doc(db, "teamMembers", memberId));
      if (existing.exists()) throw new Error("Un dossier existe deja pour ce nom. Modifie le membre existant.");
    }
    if (portalEnabled) {
      const invitationMatches = await getDocs(query(collection(db, "portalInvitations"), where("email", "==", portalEmail)));
      const conflictingInvitation = invitationMatches.docs.find((item) => item.id !== memberId && item.data().active === true);
      if (conflictingInvitation) throw new Error("Ce courriel est deja associe a un autre portail membre actif.");
    }
    const linkedUsersSnapshot = await getDocs(query(collection(db, "users"), where("teamMemberId", "==", memberId)));
    const linkedUserRefs = linkedUsersSnapshot.docs.map((item) => item.ref);
    const batch = writeBatch(db);
    const memberPayload = {
      name,
      normalizedName: slug(name),
      email: String(data.get("email") || "").trim().toLowerCase(),
      departmentId: String(data.get("departmentId") || "support"),
      displayTitle: String(data.get("displayTitle") || "").trim(),
      careerTarget: String(data.get("careerTarget") || "").trim(),
      roadmapDocumentUrl: deleteField(),
      roleIds: String(data.get("roleIds") || "").split(/[,;]+/).map((item) => item.trim()).filter(Boolean),
      aliases: String(data.get("aliases") || "").split(/[,;]+/).map((item) => item.trim()).filter(Boolean),
      sortOrder: Number(data.get("sortOrder") || 100),
      active: String(data.get("active") || "true") !== "false",
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    if (!existingId) memberPayload.createdAt = serverTimestamp();
    const memberRef = doc(db, "teamMembers", memberId);
    const privateRef = doc(db, "teamMemberPrivate", memberId);
    const portalProfileRef = doc(db, "memberPortalProfiles", memberId);
    const invitationRef = doc(db, "portalInvitations", memberId);
    const privatePayload = {
      roadmapDocumentUrl,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    if (!existingId) privatePayload.createdAt = serverTimestamp();
    const portalProfilePayload = {
      teamMemberId: memberId,
      memberName: name,
      roadmapDocumentUrl,
      coachDashboardId,
      portalEmail,
      portalEnabled,
      portalContractVersion: PORTAL_CONTRACT_VERSION,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    const invitationPayload = {
      teamMemberId: memberId,
      memberName: name,
      email: portalEmail,
      active: portalEnabled && Boolean(portalEmail),
      portalContractVersion: PORTAL_CONTRACT_VERSION,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    if (!existingId) {
      portalProfilePayload.createdAt = serverTimestamp();
      invitationPayload.createdAt = serverTimestamp();
    }
    const auditRef = doc(collection(db, "auditLogs"));
    const audit = auditPayload("team_member_saved", memberId, {
      portalEnabled,
      coachDashboardId,
      portalContractVersion: PORTAL_CONTRACT_VERSION
    });
    if (existingMember) {
      const saved = await runVersionedWrite({
        reference: memberRef,
        baseline: state.memberEditorVersion,
        label: "ce dossier membre",
        write(transaction) {
          transaction.set(memberRef, memberPayload, { merge: true });
          transaction.set(privateRef, privatePayload, { merge: true });
          transaction.set(portalProfileRef, portalProfilePayload, { merge: true });
          transaction.set(invitationRef, invitationPayload, { merge: true });
          linkedUserRefs.forEach((reference) => transaction.update(reference, {
            active: portalEnabled,
            email: portalEmail || deleteField(),
            updatedAt: serverTimestamp()
          }));
          transaction.set(auditRef, audit);
        }
      });
      if (!saved) {
        state.editingMemberId = "";
        state.memberEditorVersion = "";
        renderApp();
        return;
      }
    } else {
      batch.set(memberRef, memberPayload, { merge: true });
      batch.set(privateRef, privatePayload, { merge: true });
      batch.set(portalProfileRef, portalProfilePayload, { merge: true });
      batch.set(invitationRef, invitationPayload, { merge: true });
      batch.set(auditRef, audit);
      await batch.commit();
    }
    state.editingMemberId = "";
    state.memberEditorVersion = "";
    showToast("Membre enregistre.");
    renderApp();
  } catch (error) {
    showToast(`Membre non enregistre: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function archiveTeamMember(memberId) {
  const member = state.teamMembers.find((item) => item.id === memberId);
  if (!member || isArchivedTeamMember(member) || state.busy) return;
  const openTaskCount = tasksForMember(member.id).length;
  const taskMessage = openTaskCount ? `\n\n${openTaskCount} action(s) ouverte(s) resteront dans A faire jusqu'a leur traitement.` : "";
  const confirmed = window.confirm(`Archiver le dossier de ${member.name}?\n\nSes roadmaps, actions et son parcours resteront consultables. Il disparaitra de l'equipe active et de l'organigramme.${taskMessage}`);
  if (!confirmed) return;
  state.busy = true;
  try {
    const memberRef = doc(db, "teamMembers", member.id);
    const invitationRef = doc(db, "portalInvitations", member.id);
    const linkedUsersSnapshot = await getDocs(query(collection(db, "users"), where("teamMemberId", "==", member.id)));
    const auditRef = doc(collection(db, "auditLogs"));
    const memberUpdate = {
      active: false,
      archivedAt: serverTimestamp(),
      archivedByUid: state.user.uid,
      archivedByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    const saved = await runVersionedWrite({
      reference: memberRef,
      baseline: entityVersionToken(member),
      label: "ce dossier membre",
      write(transaction) {
        transaction.update(memberRef, memberUpdate);
        transaction.set(invitationRef, {
          active: false,
          suspendedByArchive: true,
          updatedAt: serverTimestamp(),
          updatedByUid: state.user.uid,
          updatedByName: actorName()
        }, { merge: true });
        linkedUsersSnapshot.docs.forEach((item) => transaction.update(item.ref, {
          active: false,
          updatedAt: serverTimestamp()
        }));
        transaction.set(auditRef, auditPayload("team_member_archived", member.id, { openTaskCount }));
      }
    });
    if (!saved) return;
    Object.assign(member, memberUpdate, { archivedAt: new Date(), updatedAt: new Date() });
    state.teamRosterView = "archived";
    showToast(`Dossier de ${member.name} archive.`);
    renderApp();
  } catch (error) {
    showToast(`Dossier non archive: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function restoreTeamMember(memberId) {
  const member = state.teamMembers.find((item) => item.id === memberId);
  if (!member || !isArchivedTeamMember(member) || state.busy) return;
  state.busy = true;
  try {
    const memberRef = doc(db, "teamMembers", member.id);
    const auditRef = doc(collection(db, "auditLogs"));
    const memberUpdate = {
      active: true,
      archivedAt: null,
      archivedByUid: null,
      archivedByName: null,
      restoredAt: serverTimestamp(),
      restoredByUid: state.user.uid,
      restoredByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    const saved = await runVersionedWrite({
      reference: memberRef,
      baseline: entityVersionToken(member),
      label: "ce dossier membre",
      write(transaction) {
        transaction.update(memberRef, memberUpdate);
        transaction.set(auditRef, auditPayload("team_member_restored", member.id));
      }
    });
    if (!saved) return;
    Object.assign(member, memberUpdate, { updatedAt: new Date() });
    state.teamRosterView = "active";
    showToast(`Dossier de ${member.name} restaure.`);
    renderApp();
  } catch (error) {
    showToast(`Dossier non restaure: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

function allOpenManagementTasks() {
  const manual = state.managementTasks
    .filter(isOpenManagementTask)
    .map((item) => ({ ...item, sourceType: item.sourceType || "manual", persisted: true }));
  return [...manual, ...derivedRoadmapTasks(), ...derivedCareerTasks()].sort(sortManagementTasks);
}

function derivedRoadmapTasks() {
  const titleByStatus = {
    to_read: (name) => `Lire la roadmap de ${name}`,
    action_required: (name) => `Faire le suivi avec ${name}`
  };
  return state.submissions
    .filter((submission) => submissionBucket(submission) === "queue" && roadmapCreatesTask(submission))
    .map((submission) => {
      const status = effectiveWorkflowStatus(submission);
      const notes = state.ownerNotes[submission.id] || {};
      const member = memberForSubmission(submission);
      const name = member?.name || submission.employeeName || submission.answers?.employee_name || "un membre";
      return {
        id: `roadmap:${submission.id}`,
        sourceType: "roadmap",
        sourceId: submission.id,
        sourceStatus: status,
        teamMemberId: member?.id || submission.teamMemberId || "",
        teamMemberName: name,
        title: titleByStatus[status](name),
        description: status === "action_required" ? notes.nextAction || "Un suivi a ete identifie pendant la rencontre." : `${STATUS_LABELS[status]} · ${submission.cycleId || "Trimestre a preciser"}`,
        ownerName: notes.reviewerName || "Michael + Gabriel",
        priority: status === "action_required" ? "P1" : "P2",
        dueDate: "",
        createdAt: submission.submittedAt,
        persisted: false
      };
    });
}

function derivedCareerTasks() {
  const today = startOfLocalDay(new Date()).getTime();
  const horizon = today + 14 * 24 * 60 * 60 * 1000;
  return state.careerMilestones
    .filter((milestone) => {
      if (milestone.archivedAt || !["planned", "in_progress", "blocked"].includes(milestone.status)) return false;
      if (milestone.status === "blocked") return true;
      const target = dateValue(milestone.targetDate);
      return target > 0 && target <= horizon;
    })
    .map((milestone) => {
      const member = state.teamMembers.find((item) => item.id === milestone.teamMemberId);
      const overdue = milestone.targetDate && dateValue(milestone.targetDate) < today;
      return {
        id: `career:${milestone.id}`,
        sourceType: "career",
        sourceId: milestone.id,
        teamMemberId: milestone.teamMemberId || "",
        teamMemberName: member?.name || milestone.teamMemberName || "Membre",
        title: milestone.status === "blocked" ? `Debloquer: ${milestone.title}` : `Suivre l'etape: ${milestone.title}`,
        description: milestone.successCriteria || milestone.description || "Etape du parcours CFSB a revoir.",
        ownerName: OWNER_OPTIONS.includes(milestone.ownerName) ? milestone.ownerName : "Michael + Gabriel",
        priority: milestone.status === "blocked" || overdue ? "P1" : "P2",
        dueDate: milestone.targetDate || "",
        createdAt: milestone.updatedAt || milestone.createdAt,
        persisted: false
      };
    });
}

function currentPilotageSummary() {
  return pilotageSummary({
    metrics: state.pilotageMetrics,
    entries: state.pilotageMetricEntries,
    rocks: state.pilotageRocks,
    issues: state.pilotageIssues,
    tasks: state.managementTasks,
    weekStart: state.pilotageWeek,
    quarter: state.pilotageQuarter
  });
}

function activePilotageMetrics() {
  return state.pilotageMetrics.filter((metric) => metric.active !== false).sort(sortPilotageMetrics);
}

function pilotageEntriesForWeek() {
  return state.pilotageMetricEntries.filter((entry) => entry.weekStart === state.pilotageWeek);
}

function pilotageRocksForQuarter() {
  return state.pilotageRocks.filter((rock) => !rock.archivedAt && rock.quarter === state.pilotageQuarter).sort(sortPilotageRocks);
}

function openPilotageIssues() {
  return sortPilotageIssues(state.pilotageIssues.filter((issue) => issue.status !== "solved"));
}

function selectedPilotageMeeting() {
  return state.pilotageMeetings.find((meeting) => meeting.weekStart === state.pilotageWeek || meeting.id === state.pilotageWeek) || null;
}

function sortPilotageMetrics(a, b) {
  return Number(a.sortOrder || 999) - Number(b.sortOrder || 999) || String(a.name || "").localeCompare(String(b.name || ""));
}

function sortPilotageRocks(a, b) {
  const rank = { off_track: 0, on_track: 1, done: 2 };
  return (rank[a.status] ?? 1) - (rank[b.status] ?? 1) || dateValue(a.dueDate) - dateValue(b.dueDate) || String(a.title || "").localeCompare(String(b.title || ""));
}

function filteredManagementTasks() {
  return allOpenManagementTasks().filter((task) => {
    if (state.taskOwnerFilter !== "all" && !normalize(task.ownerName).includes(normalize(state.taskOwnerFilter))) return false;
    if (state.taskFilter === "urgent") return taskIsUrgent(task);
    if (["roadmap", "career", "meeting"].includes(state.taskFilter)) return task.sourceType === state.taskFilter;
    if (state.taskFilter === "pilotage") return ["pilotage", "pilotage_issue"].includes(task.sourceType);
    if (state.taskFilter === "manual") return task.sourceType === "manual";
    return true;
  });
}

function tasksForMember(memberId) {
  return allOpenManagementTasks().filter((task) => task.teamMemberId === memberId);
}

function historicalTasksForMember(memberId) {
  return state.managementTasks
    .filter((task) => task.teamMemberId === memberId && isHistoricalManagementTask(task))
    .sort((a, b) => dateValue(b.completedAt || b.cancelledAt || b.updatedAt) - dateValue(a.completedAt || a.cancelledAt || a.updatedAt));
}

function taskById(taskId) {
  return allOpenManagementTasks().find((task) => task.id === taskId) || null;
}

function taskIsOverdue(task) {
  if (!task.dueDate) return false;
  return dateValue(task.dueDate) < startOfLocalDay(new Date()).getTime();
}

function taskIsUrgent(task) {
  return task.priority === "P1" || taskIsOverdue(task);
}

function sortManagementTasks(a, b) {
  const urgency = Number(taskIsUrgent(b)) - Number(taskIsUrgent(a));
  if (urgency) return urgency;
  const priorityRank = { P1: 0, P2: 1, P3: 2 };
  const priority = (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
  if (priority) return priority;
  const aDue = a.dueDate ? dateValue(a.dueDate) : Number.MAX_SAFE_INTEGER;
  const bDue = b.dueDate ? dateValue(b.dueDate) : Number.MAX_SAFE_INTEGER;
  return aDue - bDue || dateValue(b.createdAt) - dateValue(a.createdAt);
}

async function saveManagementTask(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  if (!title) return;
  const memberId = String(data.get("teamMemberId") || "");
  const member = state.teamMembers.find((item) => item.id === memberId) || null;
  const taskRef = doc(collection(db, "managementTasks"));
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(taskRef, {
      title,
      description: String(data.get("description") || "").trim(),
      teamMemberId: member?.id || "",
      teamMemberName: member?.name || "",
      ownerName: String(data.get("ownerName") || "Michael + Gabriel"),
      priority: String(data.get("priority") || "P2"),
      status: "open",
      dueDate: "",
      taskKind: "general",
      sourceType: "manual",
      createdAt: serverTimestamp(),
      createdByUid: state.user.uid,
      createdByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("management_task_created", taskRef.id, { teamMemberId: member?.id || "" }));
    await batch.commit();
    form.reset();
    showToast("Action ajoutee a la liste.");
  } catch (error) {
    showToast(`Action non ajoutee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function saveTeamAction(event) {
  event.preventDefault();
  if (state.busy) return;
  const member = state.teamMembers.find((item) => item.id === state.teamActionMemberId);
  if (!member) return;
  const data = new FormData(event.currentTarget);
  const title = String(data.get("title") || "").trim();
  const taskKind = ["meeting", "followup", "development"].includes(String(data.get("taskKind"))) ? String(data.get("taskKind")) : "followup";
  if (!title) return;
  const taskRef = doc(collection(db, "managementTasks"));
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(taskRef, {
      title,
      description: String(data.get("description") || "").trim(),
      teamMemberId: member.id,
      teamMemberName: member.name,
      ownerName: String(data.get("ownerName") || "Michael + Gabriel"),
      priority: String(data.get("priority") || "P2"),
      status: "open",
      dueDate: "",
      taskKind,
      sourceType: "manual",
      createdAt: serverTimestamp(),
      createdByUid: state.user.uid,
      createdByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("management_task_created", taskRef.id, { teamMemberId: member.id, taskKind }));
    await batch.commit();
    closeTeamAction(false);
    showToast("Action ajoutee a A faire.");
    renderApp();
  } catch (error) {
    showToast(`Action non ajoutee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function saveManagementTaskEdit(event) {
  event.preventDefault();
  const task = state.managementTasks.find((item) => item.id === state.taskEditorId);
  if (!task || state.busy) return;
  const data = new FormData(event.currentTarget);
  const title = String(data.get("title") || "").trim();
  if (!title) return;
  const memberId = String(data.get("teamMemberId") || "");
  const member = state.teamMembers.find((item) => item.id === memberId) || null;
  const taskKind = TASK_KIND_OPTIONS.some(([id]) => id === data.get("taskKind")) ? String(data.get("taskKind")) : "general";
  const draft = {
    title,
    description: String(data.get("description") || "").trim(),
    teamMemberId: member?.id || "",
    teamMemberName: member?.name || "",
    ownerName: OWNER_OPTIONS.includes(String(data.get("ownerName"))) ? String(data.get("ownerName")) : "Michael + Gabriel",
    priority: TASK_PRIORITY_OPTIONS.some(([id]) => id === data.get("priority")) ? String(data.get("priority")) : "P2",
    taskKind
  };
  const payload = {
    ...draft,
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: actorName()
  };
  state.busy = true;
  try {
    const taskRef = doc(db, "managementTasks", task.id);
    const auditRef = doc(collection(db, "auditLogs"));
    await runTransaction(db, async (transaction) => {
      const currentSnapshot = await transaction.get(taskRef);
      if (!currentSnapshot.exists()) throw new Error("Cette action n'existe plus.");
      const current = currentSnapshot.data();
      if (!state.taskEditorForceSave && hasVersionConflict(current, state.taskEditorVersion)) throw versionConflictError(current);
      transaction.update(taskRef, payload);
      transaction.set(auditRef, auditPayload("management_task_updated", task.id, {
        teamMemberId: member?.id || "",
        taskKind
      }));
    });
    Object.assign(task, payload, { updatedAt: new Date() });
    closeTaskEditor(false);
    showToast("Action mise a jour.");
    renderApp();
  } catch (error) {
    if (error.code === "version-conflict") {
      Object.assign(task, error.current, { id: task.id });
      state.taskConflict = { taskId: task.id, draft };
      state.taskEditorVersion = entityVersionToken(task);
      state.taskEditorForceSave = false;
      renderApp();
    } else {
      showToast(`Action non enregistree: ${friendlyError(error)}`);
    }
  } finally {
    state.busy = false;
  }
}

function resolveTaskConflict(choice) {
  const task = state.managementTasks.find((item) => item.id === state.taskEditorId);
  if (!task || !state.taskConflict) return;
  if (choice === "reload") {
    state.taskConflict = null;
    state.taskEditorVersion = entityVersionToken(task);
    state.taskEditorForceSave = false;
    showToast("Version recente chargee.");
    renderApp();
    return;
  }
  if (choice === "overwrite") {
    state.taskEditorForceSave = true;
    document.querySelector("#taskEditorForm")?.requestSubmit();
  }
}

async function completeManagementTask(taskId) {
  const task = state.managementTasks.find((item) => item.id === taskId);
  if (!task || state.busy) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "managementTasks", task.id), {
      status: "completed",
      completedAt: serverTimestamp(),
      completedByUid: state.user.uid,
      completedByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("management_task_completed", task.id));
    await batch.commit();
    Object.assign(task, { status: "completed", completedAt: new Date(), updatedAt: new Date() });
    if (state.taskEditorId === task.id) closeTaskEditor(false);
    showToast("Action terminee.");
    renderApp();
  } catch (error) {
    showToast(`Action non modifiee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function cancelManagementTask(taskId) {
  const task = state.managementTasks.find((item) => item.id === taskId);
  if (!task || state.busy) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "managementTasks", task.id), {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledByUid: state.user.uid,
      cancelledByName: actorName(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("management_task_cancelled", task.id));
    await batch.commit();
    Object.assign(task, { status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() });
    if (state.taskEditorId === task.id) closeTaskEditor(false);
    showToast("Action annulee et conservee dans l'historique.");
    renderApp();
  } catch (error) {
    showToast(`Action non annulee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function reopenManagementTask(taskId) {
  const task = state.managementTasks.find((item) => item.id === taskId);
  if (!task || state.busy) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "managementTasks", task.id), {
      status: "open",
      completedAt: null,
      cancelledAt: null,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("management_task_reopened", task.id));
    await batch.commit();
    Object.assign(task, { status: "open", completedAt: null, cancelledAt: null, updatedAt: new Date() });
    if (state.taskEditorId === task.id) closeTaskEditor(false);
    state.memberActionView = "open";
    showToast("Action rouverte et replacee dans A faire.");
    renderApp();
  } catch (error) {
    showToast(`Action non rouverte: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function postponeManagementTask(taskId) {
  const task = state.managementTasks.find((item) => item.id === taskId);
  if (!task || state.busy) return;
  const today = startOfLocalDay(new Date());
  const currentDue = task.dueDate ? new Date(`${dateInputValue(task.dueDate)}T12:00:00`) : today;
  const base = currentDue.getTime() > today.getTime() ? currentDue : today;
  base.setDate(base.getDate() + 7);
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "managementTasks", task.id), { dueDate: localDateInputValue(base), status: "open", updatedAt: serverTimestamp(), updatedByUid: state.user.uid });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("management_task_postponed", task.id, { dueDate: localDateInputValue(base) }));
    await batch.commit();
    showToast("Action reportee de 7 jours.");
  } catch (error) {
    showToast(`Action non reportee: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

function openTaskSource(taskId) {
  const task = taskById(taskId);
  if (!task) return;
  if (task.persisted) {
    openTaskEditor(task.id);
    return;
  }
  if (task.sourceType === "roadmap") {
    openSubmission(task.sourceId);
    return;
  }
  if (task.teamMemberId) {
    const member = state.teamMembers.find((item) => item.id === task.teamMemberId);
    state.view = "team";
    state.selectedMemberId = task.teamMemberId;
    state.teamRosterView = teamMemberBucket(member);
    state.editingMemberId = "";
    state.memberProfileSection = task.sourceType === "career" ? "career" : "actions";
    if (task.sourceType === "career") {
      state.careerEditorId = task.sourceId;
      state.careerEditorVersion = entityVersionToken(state.careerMilestones.find((item) => item.id === task.sourceId));
    }
    renderApp();
    return;
  }
  showToast("Cette action n'est pas associee a un dossier membre.");
}

function auditPayload(action, entityId, details = {}) {
  return {
    action,
    entityType: action.startsWith("pilotage_") ? "pilotage" : action.startsWith("business_strategy_") || action.startsWith("strategy_decision_") ? "strategy" : action.startsWith("owner_backup_") ? "systemBackup" : action.startsWith("development_") ? "development" : action.startsWith("working_genius_") ? "workingGenius" : action.startsWith("team_meeting_") || action.startsWith("meeting_summary_") ? "teamMeeting" : action.startsWith("team_") ? "teamMember" : action.startsWith("member_career_plan_") ? "memberCareerPlan" : action.startsWith("career_") ? "careerMilestone" : action.startsWith("management_") ? "managementTask" : action.startsWith("client_error_") ? "clientError" : "roadmapSubmission",
    entityId,
    actorUid: state.user.uid,
    actorName: actorName(),
    details,
    createdAt: serverTimestamp(),
    source: "firebase_owner_dashboard"
  };
}

async function logClientError(error, context) {
  if (!state.user || !state.profile || loggingClientError) return;
  const message = String(error?.message || error || "Erreur inconnue").slice(0, 1000);
  const stack = String(error?.stack || "").slice(0, 4000);
  loggingClientError = true;
  try {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "clientErrors")), {
      message,
      stack,
      context: String(context || "dashboard").slice(0, 120),
      page: window.location.pathname,
      actorUid: state.user.uid,
      actorName: actorName(),
      resolvedAt: null,
      createdAt: serverTimestamp()
    });
    await batch.commit();
  } catch {
    // Error reporting must never interrupt the owner workflow.
  } finally {
    loggingClientError = false;
  }
}

async function resolveClientError(errorId) {
  const error = state.clientErrors.find((item) => item.id === errorId);
  if (!error || error.resolvedAt || state.busy) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "clientErrors", error.id), {
      resolvedAt: serverTimestamp(),
      resolvedByUid: state.user.uid,
      resolvedByName: actorName()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("client_error_resolved", error.id, { context: error.context || "" }));
    await batch.commit();
    Object.assign(error, { resolvedAt: new Date(), resolvedByName: actorName() });
    showToast("Erreur marquee comme resolue.");
    renderApp();
  } catch (failure) {
    showToast(`Erreur non resolue: ${friendlyError(failure)}`);
  } finally {
    state.busy = false;
  }
}

function openAuditEntity(logId) {
  const log = state.auditLogs.find((item) => item.id === logId);
  if (!log) return;
  if (log.entityType === "pilotage") {
    state.view = "pilotage";
    state.pilotageSection = log.action.includes("metric") || log.action.includes("scorecard") ? "scorecard" : log.action.includes("rock") ? "rocks" : log.action.includes("issue") ? "issues" : "meeting";
    if (log.details?.weekStart) state.pilotageWeek = log.details.weekStart;
    renderApp();
    return;
  }
  if (log.entityType === "strategy") {
    state.view = "pilotage";
    state.pilotageSection = "strategy";
    state.strategyView = log.action.startsWith("strategy_decision_") ? "decisions" : "overview";
    if (log.action.startsWith("strategy_decision_") && state.strategyDecisions.some((item) => item.id === log.entityId)) openStrategyEditor("decision", log.entityId);
    else renderApp();
    return;
  }
  if (log.entityType === "systemBackup") {
    showToast("La sauvegarde a ete telechargee sur l'appareil utilise au moment de l'export.");
    return;
  }
  if (log.entityType === "development") {
    const assignment = state.developmentAssignments.find((item) => item.id === log.entityId);
    if (assignment) openDevelopmentAssignment(assignment.id);
    else {
      state.view = "development";
      state.developmentSection = "programs";
      renderApp();
    }
    return;
  }
  if (log.entityType === "workingGenius") {
    const memberId = log.details?.teamMemberId || log.entityId;
    const member = state.teamMembers.find((item) => item.id === memberId);
    if (!member) return showToast("Ce dossier membre n'est plus disponible.");
    state.view = "team";
    state.teamWorkspaceView = "working_genius";
    state.selectedMemberId = member.id;
    state.teamRosterView = teamMemberBucket(member);
    state.memberProfileSection = "working_genius";
    renderApp();
    return;
  }
  if (log.entityType === "managementTask") {
    if (state.managementTasks.some((item) => item.id === log.entityId)) openTaskEditor(log.entityId);
    else showToast("Cette action n'est plus disponible dans la vue courante.");
    return;
  }
  if (log.entityType === "teamMember") {
    const member = state.teamMembers.find((item) => item.id === log.entityId);
    if (!member) return showToast("Ce dossier membre n'est plus disponible.");
    state.view = "team";
    state.selectedMemberId = log.entityId;
    state.teamRosterView = teamMemberBucket(member);
    state.memberProfileSection = "overview";
    renderApp();
    return;
  }
  if (log.entityType === "teamMeeting") {
    const meeting = state.teamMeetings.find((item) => item.id === log.entityId);
    const memberId = meeting?.teamMemberId || log.details?.teamMemberId;
    if (!meeting || !memberId) return showToast("Cette rencontre n'est plus disponible.");
    state.view = "team";
    state.selectedMemberId = memberId;
    state.teamRosterView = teamMemberBucket(state.teamMembers.find((item) => item.id === memberId));
    state.memberProfileSection = "meetings";
    openMeetingEditor(meeting.id);
    return;
  }
  if (log.entityType === "revenueScenario") {
    const memberId = log.details?.teamMemberId || "";
    window.location.href = memberId ? `./revenue.html?member=${encodeURIComponent(memberId)}` : "./revenue.html";
    return;
  }
  if (log.entityType === "careerMilestone") {
    const milestone = state.careerMilestones.find((item) => item.id === log.entityId);
    const memberId = milestone?.teamMemberId || log.details?.teamMemberId;
    if (!memberId) return showToast("Cette etape n'est plus disponible.");
    state.view = "team";
    state.selectedMemberId = memberId;
    state.teamRosterView = teamMemberBucket(state.teamMembers.find((item) => item.id === memberId));
    state.memberProfileSection = "career";
    if (milestone) {
      state.careerEditorId = milestone.id;
      state.careerEditorVersion = entityVersionToken(milestone);
    }
    renderApp();
    return;
  }
  if (log.entityType === "clientError") {
    showToast("Cette erreur est presentee dans l'etat de sante en haut de la page.");
    return;
  }
  if (state.submissions.some((item) => item.id === log.entityId)) openSubmission(log.entityId);
  else showToast("Cette roadmap n'est plus disponible, mais sa trace reste conservee.");
}

function filteredSubmissions() {
  return state.submissions
    .filter((submission) => submissionBucket(submission) === state.roadmapView && matchesRoadmapFilters(submission))
    .sort((a, b) => dateValue(b.submittedAt) - dateValue(a.submittedAt));
}

function ensureSelection() {
  if (state.view !== "roadmaps") return;
  const visible = filteredSubmissions();
  if (!visible.some((item) => item.id === state.selectedId)) {
    state.selectedId = visible[0]?.id || "";
  }
}

function openSubmission(submissionId) {
  const submission = state.submissions.find((item) => item.id === submissionId);
  if (!submission) return;
  closeCareerEditor(false);
  closeRoadmapCompletion(false);
  closeTeamAction(false);
  closeTaskEditor(false);
  state.view = "roadmaps";
  state.roadmapView = submissionBucket(submission);
  state.selectedMemberId = "";
  state.editingMemberId = "";
  state.filters = { search: "", role: "all", cycle: "all", status: "all" };
  state.selectedId = submission.id;
  renderApp();
}

function selectedSubmission() {
  return state.submissions.find((item) => item.id === state.selectedId) || filteredSubmissions()[0] || null;
}

function groupAnswers(submission) {
  const index = questionIndex(submission);
  const groups = new Map();
  Object.entries(submission.answers || {}).forEach(([id, answer]) => {
    const meta = index[id] || { label: humanize(id), section: "Autres reponses" };
    const items = groups.get(meta.section) || [];
    items.push({ id, answer, label: meta.label });
    groups.set(meta.section, items);
  });
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}

function questionIndex(submission) {
  const form = state.forms[submission.formVersion] || Object.values(state.forms)[0];
  const config = form?.config || {};
  const role = (config.roles || []).find((item) => item.id === submission.selectedRoleId);
  const moduleIds = role?.moduleIds || (config.modules || []).map((item) => item.id);
  const result = {};
  (config.modules || []).filter((module) => moduleIds.includes(module.id)).forEach((module) => {
    (module.questions || []).forEach((question) => addQuestionMeta(result, question, module.title));
    (module.groups || []).forEach((group) => {
      (group.questions || []).forEach((question) => addQuestionMeta(result, question, `${module.title} · ${group.title}`));
    });
  });
  return result;
}

function addQuestionMeta(target, question, section) {
  if (question?.id && question?.label) target[question.id] = { label: question.label, section };
}

function metric(value, label, tone, status) {
  const active = state.view === "roadmaps" && state.roadmapView === "queue" && state.filters.status === status;
  return `<button class="metric ${tone} ${active ? "active" : ""}" data-status-filter="${status}" type="button" aria-pressed="${active}"><strong>${value || 0}</strong><span>${escapeHtml(label)}</span></button>`;
}

function submissionLabel(item) {
  const name = item.employeeName || item.answers?.employee_name || "Sans nom";
  return `${name} · ${item.selectedRoleLabel || "Role"} · ${item.cycleId || ""}`;
}

function submissionMenuLabel(item) {
  const name = item.employeeName || item.answers?.employee_name || "Sans nom";
  const date = item.submittedAt ? formatDate(item.submittedAt) : "Sans date";
  return `${STATUS_LABELS[item.status] || "En cours"} · ${name} · ${date} · ${item.selectedRoleLabel || "Role"}`;
}

function memberForSubmission(submission) {
  const explicitId = String(submission.teamMemberId || "").trim();
  if (explicitId) {
    const exact = state.teamMembers.find((member) => member.id === explicitId);
    if (exact) return exact;
  }
  const submissionEmail = normalizeEmail(submission.answers?.employee_email || submission.employeeEmail);
  if (submissionEmail) {
    const byEmail = state.teamMembers.find((member) => normalizeEmail(member.email) === submissionEmail);
    if (byEmail) return byEmail;
  }
  const names = [submission.employeeName, submission.answers?.employee_name, explicitId].map(slug).filter(Boolean);
  const nameKeys = [submission.employeeName, submission.answers?.employee_name].map(personNameKey).filter(Boolean);
  return state.teamMembers.find((member) => {
    const aliases = [member.id, member.normalizedName, member.name, ...(member.aliases || [])].map(slug).filter(Boolean);
    const aliasNameKeys = [member.name, member.normalizedName, ...(member.aliases || [])].map(personNameKey).filter(Boolean);
    return names.some((name) => aliases.includes(name)) || nameKeys.some((name) => aliasNameKeys.includes(name));
  }) || null;
}

function submissionsForMember(member) {
  return state.submissions.filter((submission) => memberForSubmission(submission)?.id === member.id)
    .sort((a, b) => dateValue(b.submittedAt) - dateValue(a.submittedAt));
}

function meetingsForMember(memberId) {
  return state.teamMeetings.filter((meeting) => meeting.teamMemberId === memberId).sort(sortTeamMeetings);
}

function sharedSummaryForMeeting(meetingId) {
  return state.memberSharedSummaries.find((summary) => summary.meetingId === meetingId || summary.id === meetingId) || null;
}

function meetingIsEditable(meeting) {
  if (!meeting || meeting.status === "finalized") return false;
  const member = state.teamMembers.find((item) => item.id === meeting.teamMemberId);
  return Boolean(member && !isArchivedTeamMember(member));
}

function milestonesForMember(member, includeArchived = false) {
  return state.careerMilestones
    .filter((milestone) => milestone.teamMemberId === member.id && (includeArchived || !milestone.archivedAt))
    .sort(sortCareerMilestones);
}

function careerUpdatesForMilestone(milestoneId) {
  return state.careerUpdates
    .filter((update) => update.milestoneId === milestoneId)
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
}

function sortCareerMilestones(a, b) {
  const archivedDifference = Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt));
  if (archivedDifference) return archivedDifference;
  const rank = { in_progress: 0, blocked: 1, planned: 2, completed: 3, abandoned: 4 };
  const statusDifference = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
  if (statusDifference) return statusDifference;
  if (["completed", "abandoned"].includes(a.status)) {
    return dateValue(b.completedDate || b.updatedAt) - dateValue(a.completedDate || a.updatedAt);
  }
  const aDate = a.targetDate ? dateValue(a.targetDate) : Number.MAX_SAFE_INTEGER;
  const bDate = b.targetDate ? dateValue(b.targetDate) : Number.MAX_SAFE_INTEGER;
  return aDate - bDate || String(a.title || "").localeCompare(String(b.title || ""));
}

function nextCareerMilestone(milestones) {
  const candidates = milestones.filter((item) => !item.archivedAt && ["in_progress", "blocked", "planned"].includes(item.status));
  return candidates.sort((a, b) => {
    const rank = { in_progress: 0, blocked: 1, planned: 2 };
    const statusDifference = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (statusDifference) return statusDifference;
    const aDate = a.targetDate ? dateValue(a.targetDate) : Number.MAX_SAFE_INTEGER;
    const bDate = b.targetDate ? dateValue(b.targetDate) : Number.MAX_SAFE_INTEGER;
    return aDate - bDate;
  })[0] || null;
}

function unlinkedSubmissions() {
  return state.submissions.filter((submission) => !isDeleted(submission) && !memberForSubmission(submission));
}

function completionInfo(submission) {
  const answers = submission.answers || {};
  const questionIds = Object.keys(questionIndex(submission));
  const candidateIds = questionIds.length ? questionIds : Object.keys(answers);
  const total = candidateIds.length || Object.keys(answers).length || 0;
  const answered = candidateIds.filter((id) => !isEmptyAnswer(answers[id])).length;
  const explicit = submission.completion;
  let explicitPercent = null;
  if (typeof explicit === "number") explicitPercent = explicit <= 1 ? explicit * 100 : explicit;
  if (explicit && typeof explicit === "object") explicitPercent = Number(explicit.percent ?? explicit.percentage ?? explicit.ratio * 100);
  const percent = Number.isFinite(explicitPercent)
    ? Math.max(0, Math.min(100, Math.round(explicitPercent)))
    : total ? Math.round((answered / total) * 100) : 0;
  return { answered, total, percent };
}

function statusPill(status) {
  const label = status === "deleted" ? "Corbeille" : STATUS_LABELS[status] || humanize(status || "to_read");
  return `<span class="status-pill ${statusTone(status)}">${escapeHtml(label)}</span>`;
}

function careerStatusPill(status) {
  return `<span class="career-status-pill ${careerStatusTone(status)}">${escapeHtml(CAREER_STATUS_LABELS[status] || "A preciser")}</span>`;
}

function meetingStatusPill(status) {
  const finalized = status === "finalized";
  return `<span class="meeting-status-pill ${finalized ? "finalized" : "draft"}"><i data-lucide="${finalized ? "check-circle-2" : "file-pen-line"}"></i>${finalized ? "Finalisee" : "Brouillon"}</span>`;
}

function careerStatusTone(status) {
  if (status === "in_progress") return "green";
  if (status === "planned") return "blue";
  if (status === "blocked") return "red";
  if (status === "completed") return "complete";
  return "neutral";
}

function statusTone(status) {
  if (status === "to_read") return "green";
  if (status === "message_to_send") return "blue";
  if (status === "meeting_planned") return "blue";
  if (status === "action_required" || status === "deleted") return "red";
  if (status === "ready_to_archive") return "amber";
  return "neutral";
}

function profileMetric(value, label) {
  return `<div class="profile-metric"><strong>${value || 0}</strong><span>${escapeHtml(label)}</span></div>`;
}

function formVersionLabel(submission) {
  const value = String(submission.formVersion || submission.configVersion || "inconnue");
  return value.length > 30 ? `${value.slice(0, 27)}...` : value;
}

function isDeleted(submission) {
  return Boolean(submission?.deletedAt);
}

function dateInputValue(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const time = dateValue(value);
  return time ? new Date(time).toISOString().slice(0, 10) : "";
}

function formatDateOnly(value) {
  if (!value) return "Sans date";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
  }
  const time = dateValue(value);
  return time ? new Date(time).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "Sans date";
}

function todayInputValue() {
  const today = new Date();
  return localDateInputValue(today);
}

function localDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function clampProgress(value) {
  const progress = Number(value);
  return Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
}

function formatShortDate(value) {
  const time = dateValue(value);
  return time ? new Date(time).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "Sans date";
}

function truncate(value, length) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, Math.max(0, length - 3))}...` : text;
}

function initials(value) {
  return String(value || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function fromDoc(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function sortTeamMembers(a, b) {
  return Number(a.sortOrder || 999) - Number(b.sortOrder || 999) || String(a.name || "").localeCompare(String(b.name || ""));
}

function sortTeamMeetings(a, b) {
  return dateValue(b.meetingDate || b.createdAt) - dateValue(a.meetingDate || a.createdAt) || dateValue(b.updatedAt) - dateValue(a.updatedAt);
}

function memberRoadmapDocumentUrl(member) {
  return normalizeExternalUrl(state.memberPortalProfiles[member?.id]?.roadmapDocumentUrl || state.teamMemberPrivate[member?.id]?.roadmapDocumentUrl || member?.roadmapDocumentUrl || "");
}

function memberCoachDashboardId(member) {
  return String(state.memberPortalProfiles[member?.id]?.coachDashboardId || COACH_ID_BY_MEMBER[member?.id] || "").trim();
}

function memberHasRevenueTool(member) {
  const haystack = normalize([member.departmentId, member.displayTitle, ...(member.roleIds || [])].join(" "));
  return haystack.includes("coach") || haystack.includes("coaching") || haystack.includes("entraineur");
}

function normalizeExternalUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function safeExternalUrl(value) {
  return normalizeExternalUrl(value) || "#";
}

function dateValue(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  return new Date(value).getTime() || 0;
}

function formatDate(value) {
  const time = dateValue(value);
  return time ? new Date(time).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "Sans date";
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("fr-CA", { maximumFractionDigits: 2 }) : "--";
}

function formatAnswer(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value ?? "");
}

function isEmptyAnswer(value) {
  return value == null || value === "" || (Array.isArray(value) && !value.length);
}

function setSaveStatus(message, type = "") {
  const status = document.querySelector("#saveStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `save-status ${type}`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toastRoot.textContent = message;
  toastRoot.classList.add("visible");
  toastTimer = window.setTimeout(() => toastRoot.classList.remove("visible"), 3200);
}

function confirmOverwrite(label, updatedByName = "") {
  const owner = updatedByName || "L'autre owner";
  return window.confirm(`${owner} a modifie ${label} pendant ton edition.\n\nOK: conserver tes changements et remplacer la version recente.\nAnnuler: fermer et charger la version recente.`);
}

function versionConflictError(current) {
  const error = new Error("Une version plus recente existe.");
  error.code = "version-conflict";
  error.current = current;
  return error;
}

async function runVersionedWrite({ reference, baseline, label, write }) {
  let forceOverwrite = false;
  while (true) {
    try {
      await runTransaction(db, async (transaction) => {
        const currentSnapshot = await transaction.get(reference);
        if (!currentSnapshot.exists()) throw new Error("Cet element n'existe plus.");
        const current = currentSnapshot.data();
        if (!forceOverwrite && hasVersionConflict(current, baseline)) throw versionConflictError(current);
        write(transaction, current);
      });
      return true;
    } catch (error) {
      if (error.code !== "version-conflict") throw error;
      if (!confirmOverwrite(label, error.current?.updatedByName)) return false;
      forceOverwrite = true;
    }
  }
}

function actorName() {
  return state.profile?.displayName || state.user?.displayName || "Owner";
}

function refreshIcons() {
  window.lucide?.createIcons?.({ attrs: { "stroke-width": 2 } });
}

function friendlyError(error) {
  const code = String(error?.code || "").replace("auth/", "").replace("firestore/", "");
  if (code === "popup-closed-by-user") return "fenetre de connexion fermee";
  if (code === "permission-denied") return "permission refusee par les regles Firebase";
  return error?.message || code || "erreur inconnue";
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function humanize(value) {
  const text = String(value || "").replaceAll("_", " ");
  return text ? text[0].toUpperCase() + text.slice(1) : "Question";
}

function slug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
