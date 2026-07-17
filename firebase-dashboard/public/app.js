import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithRedirect,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";
const COMPATIBLE_AUTH_URL = "https://cfsb-dashboard-coach-aa9a4.firebaseapp.com/?authMode=redirect";

const firebaseConfig = {
  apiKey: "AIzaSyAzE7ta-7plsrvVQIG1IoGpnejRfdg2F-s",
  authDomain: "cfsb-dashboard-coach-aa9a4.firebaseapp.com",
  projectId: "cfsb-dashboard-coach-aa9a4",
  storageBucket: "cfsb-dashboard-coach-aa9a4.firebasestorage.app",
  messagingSenderId: "129233025317",
  appId: "1:129233025317:web:a0926b15532568c87442cc"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
const APP_VERSION = "20260717-client-ownership-integrity";
window.__CFSB_DASHBOARD_VERSION = APP_VERSION;
const RELEASE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const USAGE_SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const USAGE_EVENT_LIMIT = 600;
const VOICE_NOTE_MAX_SECONDS = 120;
const VOICE_NOTE_MAX_BYTES = 8 * 1024 * 1024;
const VOICE_QUEUE_CHUNK_CHARS = 600000;
const VOICE_QUEUE_BATCH_SIZE = 8;
const VOICE_QUEUE_TIMEOUT_MS = 90000;
const ADMIN_EMAIL = "info@crossfitstbasilelegrand.com";
const COACHRX_EXTENSION_VERSION = "0.6.4";
const REBOOKING_VOLUME_REVIEW_THRESHOLD = 10;
const COACHRX_EXTENSION_PUBLIC_DOWNLOAD = "./downloads/coachrx-sync-extension-0.6.4-dashboard-signals.zip";
const TEAM_ONBOARDING_GUIDE_PUBLIC_DOWNLOAD = "./downloads/dashboard-coach-guide-equipe.html";
const PERFORMANCE_RENDEMENT_SHEET_URL = "https://docs.google.com/spreadsheets/u/3/d/1ZbhqgbvDnT_-qK3JS1FPRqcZ40vHsXks8hs5fJ5J064/edit?gid=1203687517#gid=1203687517";
const CSM_PRIORITY_SHEET_URL = "https://docs.google.com/spreadsheets/d/1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw/edit?gid=2049466161#gid=2049466161";
const ACCOMPLISHMENTS_DRIVE_URL = "https://drive.google.com/drive/folders/12xoQUUqo0jpOdG9MARgwZMzA5cynyL45";
const QUESTIONNAIRE_BASE_URL = "https://cfsb-dashboard-coach-aa9a4.web.app/questionnaire/";
const DEFAULT_QUESTIONNAIRE_TYPE = "suivi_global";
const QUESTIONNAIRE_TYPES = [
  {
    type: "suivi_global",
    label: "Globale check",
    shortLabel: "Globale",
    ghlTag: "dashboardcoach",
    path: "/questionnaire/",
    description: "Questionnaire deja actif avec le workflow actuel."
  },
  {
    type: "habitudes_quotidiennes",
    label: "Check-in",
    shortLabel: "Check-in",
    ghlTag: "suiviregulier",
    path: "/questionnaire/check-in/",
    description: "Questionnaire court sur les habitudes de base."
  },
  {
    type: "evaluation_habitudes_vie",
    label: "Evaluation habitudes de vie",
    shortLabel: "Evaluation",
    ghlTag: "evaluationnutrition",
    path: "/questionnaire/evaluation-habitudes-vie/",
    description: "Evaluation plus complete des habitudes de vie."
  }
];
const QUESTIONNAIRE_READING_SCHEMAS = {
  suivi_global: {
    label: "Globale check",
    sections: [
      {
        title: "Depart",
        fields: [
          ["followup_type", "Pourquoi remplis-tu ce formulaire aujourd'hui ?"]
        ]
      },
      {
        title: "Etat",
        fields: [
          ["general_state", "Globalement, comment te sens-tu dans ton entrainement ?"],
          ["motivation_level", "Ton niveau de motivation est presentement :"]
        ]
      },
      {
        title: "Bilan",
        fields: [
          ["progress_toward_goal", "As-tu l'impression de progresser vers ton objectif actuel ?"],
          ["recent_success_type", "Quel est un succes recent dont tu es satisfait ?"],
          ["recent_success", "Si tu veux, precise ton succes ou ce qui rend ca plus difficile a nommer."],
          ["last_30_days_attendance", "Dans les 30 derniers jours, ton assiduite ressemble le plus a :"],
          ["results_satisfaction_score", "Sur 5, a quel point es-tu satisfait de tes resultats recents ?"],
          ["current_challenges", "Qu'est-ce qui te challenge le plus en ce moment ?"],
          ["upcoming_changes", "Prevois-tu des changements prochainement dans ta situation actuelle ?"],
          ["upcoming_changes_details", "Si oui, qu'est-ce que ton coach devrait savoir ?"]
        ]
      },
      {
        title: "Objectif",
        fields: [
          ["goal_status", "Ton objectif principal est-il encore le meme ?"],
          ["goal_clarity_score", "A quel point ton objectif est clair pour toi ?"],
          ["goal_change_detail", "Qu'est-ce qui decrit le mieux le changement d'objectif ?"],
          ["coach_alignment_score", "Sur 5, a quel point tu sens que ton coach comprend ton objectif actuel ?"]
        ]
      },
      {
        title: "Programme",
        fields: [
          ["program_fit", "Comment trouves-tu ton programme actuel ?"],
          ["improvements_requested", "Qu'est-ce qui pourrait etre ameliore ?"],
          ["program_adjustment_detail", "Quel ajustement serait le plus utile en premier ?"]
        ]
      },
      {
        title: "Confort",
        fields: [
          ["pain_status", "As-tu des inconforts, douleurs ou limitations qui affectent ton entrainement ?"],
          ["open_note", "Est-ce qu'il y a quelque chose d'important que tu veux que ton coach sache ?"],
          ["pain_detail", "Qu'est-ce que ton coach devrait faire avec cette information ?"]
        ]
      },
      {
        title: "Envoi",
        fields: [
          ["final_position", "Quelle phrase decrit le mieux ta situation actuelle ?"],
          ["contact_request", "Souhaites-tu que ton coach te contacte directement ?"],
          ["support_needed", "Quel type de support serait le plus utile maintenant ?"]
        ]
      }
    ]
  },
  habitudes_quotidiennes: {
    label: "Check-in",
    sections: [
      {
        title: "Rythme",
        fields: [
          ["habits_priorities", "Tes priorites sont-elles claires avec ton coach ?"],
          ["habits_rhythm", "As-tu un rythme quotidien autour du sommeil, de la nutrition et du mouvement ?"],
          ["habits_water", "Quelle quantite d'eau bois-tu generalement par jour ?"],
          ["habits_movement30", "Fais-tu environ 30 minutes de mouvement par jour ?"],
          ["habits_outdoor15", "Vas-tu dehors au moins 15 minutes par jour ?"],
          ["habits_sleep7", "Dors-tu environ 7 heures ou plus par nuit ?"],
          ["habits_bowel_daily", "Vas-tu a la selle au moins une fois par jour ?"]
        ]
      },
      {
        title: "Priorite",
        fields: [
          ["habits_focus", "Quel sujet serait le plus pertinent a ameliorer ?"],
          ["habits_priority", "Qu'aimerais-tu ameliorer en premier ?"],
          ["habits_support", "Quel type de support aimerais-tu de ton coach ?"]
        ]
      }
    ]
  },
  evaluation_habitudes_vie: {
    label: "Evaluation habitudes de vie",
    sections: [
      {
        title: "Contexte",
        fields: [
          ["eval_main_goal", "Quel est ton objectif principal en ce moment ?"],
          ["eval_obstacles", "Qu'est-ce qui nuit le plus a tes habitudes actuellement ?"],
          ["eval_readiness", "A quel point te sens-tu pret a changer une habitude maintenant ?"]
        ]
      },
      {
        title: "Nutrition",
        fields: [
          ["eval_meals", "Combien de repas complets prends-tu generalement par jour ?"],
          ["eval_protein", "As-tu une source de proteine a la plupart de tes repas ?"],
          ["eval_fruits_vegetables", "Manges-tu des fruits ou legumes chaque jour ?"],
          ["eval_hydration", "Comment est ton hydratation ?"],
          ["eval_nutrition_note", "Y a-t-il quelque chose a savoir sur ton alimentation ?"]
        ]
      },
      {
        title: "Recuperation",
        fields: [
          ["eval_sleep", "Combien d'heures dors-tu en moyenne ?"],
          ["eval_sleep_quality", "Comment est la qualite de ton sommeil ?"],
          ["eval_stress", "Ton stress actuel est plutot :"],
          ["eval_recovery_note", "Qu'est-ce qui aide ou nuit a ta recuperation ?"]
        ]
      },
      {
        title: "Mouvement",
        fields: [
          ["eval_energy", "Ton energie generale est :"],
          ["eval_movement_outside_training", "Bouges-tu les jours sans entrainement ?"],
          ["eval_pain", "As-tu une douleur ou limitation a considerer ?"],
          ["eval_body_note", "Qu'aimerais-tu que ton coach sache sur ton corps ou ton energie ?"]
        ]
      },
      {
        title: "Plan",
        fields: [
          ["eval_next_focus", "Sur quoi veux-tu mettre le focus ?"],
          ["eval_commitment", "Quelle petite action serais-tu pret a essayer cette semaine ?"],
          ["eval_contact", "Souhaites-tu que ton coach te contacte ou en reparle avec toi ?"]
        ]
      }
    ]
  }
};
const AUTH_REDIRECT_STARTED_KEY = "cfsbDashboardGoogleRedirectStarted";
const FIREBASE_SYNC_SERVICE_ACCOUNT = "129233025317-compute@developer.gserviceaccount.com";
const REQUIRED_SHEET_ACCESS = [
  {
    title: "Dashboard Coach CFSB - Pilote Marc-Andre",
    role: "Imports CoachRx, clients, taches, rebooking, alumni et impacts",
    url: "https://docs.google.com/spreadsheets/d/18-S_a5L6fXYZXtcgHBlCKpcygmnr5Ekj_WM5358KZ7E/edit"
  },
  {
    title: "Reponses - Suivi client-coach Web App",
    role: "Reponses questionnaire client-coach",
    url: "https://docs.google.com/spreadsheets/d/11QO5GOQGHCpT8_nLEgKHqjFFsZ4emPwZEt2Vlu3WRJo/edit"
  },
  {
    title: "Suivi CSM : low att., absent et check-up",
    role: "Check-ups CSM pour Performance",
    url: "https://docs.google.com/spreadsheets/d/1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw/edit"
  }
];

const PILOT_COACHES = [
  { id: "15935", coachRxId: "15935", name: "Marc-André Ménard", email: "marcandremenard89@gmail.com", aliases: ["Marc-Andre Menard", "Marc Andre Menard", "Marc-André Ménard"], active: true },
  { id: "15928", coachRxId: "15928", name: "Iheb Yahyaoui", email: "ihebya73@gmail.com", aliases: ["Iheb Yahyaoui", "Iheb Yahiaoui"], active: true },
  { id: "17242", coachRxId: "17242", name: "Camille Proulx", email: "camproulxx@gmail.com", aliases: ["Camille Proulx"], active: true },
  { id: "15902", coachRxId: "15902", name: "David Olivier", email: "davidolivier1997@gmail.com", aliases: ["David Olivier"], active: true },
  { id: "15893", coachRxId: "15893", name: "Gabriel Mayer Bédard", email: "info@crossfitstbasilelegrand.com", aliases: ["Gabriel Mayer Bedard", "Gabriel Mayer Bédard"], active: true },
  { id: "15937", coachRxId: "15937", name: "Hugo Lelièvre", email: "hugolelievre34@gmail.com", aliases: ["Hugo Lelievre", "Hugo Lelièvre"], active: true },
  { id: "15936", coachRxId: "15936", name: "Raphaël Samson", email: "raphael.samson@usherbrooke.ca", aliases: ["Raphael Samson", "Raphaël Samson"], active: true }
];

const state = {
  user: null,
  profile: null,
  coaches: [],
  selectedCoachId: "",
  coachPickerOpen: false,
  mobileMenuOpen: "",
  tab: "todo",
  errors: [],
  toast: "",
  busy: false,
  modal: null,
  announcementDismissedIds: new Set(),
  announcementAutoOpenTimer: null,
  announcementAutoShownThisSession: false,
  releaseCheck: {
    checkedAt: 0,
    checking: false,
    latestVersion: ""
  },
  renderQueued: false,
  rendering: false,
  voicePlayback: {},
  lastSyncResult: null,
  filter: {
    questionnaire: "to_read",
    questionnaireTriage: "all",
    todo: "all",
    todoGroupKey: "",
    rebooking: "open",
    performanceImpact: "all",
    performancePeriod: "30d",
    alumni: "to_work",
    search: {}
  },
  data: {
    tasks: [],
    clients: [],
    rejectedClients: [],
    questionnaireResponses: [],
    questionnaireSends: [],
    questionnaireSchedules: [],
    rebookings: [],
    checkups: [],
    impacts: [],
    alumni: [],
    syncStatus: null,
    syncRuns: [],
    syncRequests: [],
    usageEvents: [],
    weeklyProductReports: [],
    productReportRequests: [],
    assistantVoiceRequests: [],
    assistantRequests: [],
    assistantProposals: [],
    assistantActionRequests: [],
    announcements: [],
    announcementAcknowledgements: [],
    pilotAcceptances: [],
    extensionSetup: null,
    performanceSettings: null,
    loaded: {}
  },
  unsubscribers: []
};

const voiceRecorder = {
  formKey: "",
  mediaRecorder: null,
  stream: null,
  chunks: [],
  blob: null,
  previewUrl: "",
  startedAt: 0,
  durationSeconds: 0,
  timerId: null,
  stopTimerId: null,
  stopPromise: null,
  saveStatus: "",
  saveMessage: "",
  sessionId: 0
};

const tabs = [
  ["todo", "To-do"],
  ["clients", "Clients"],
  ["questionnaires", "Questionnaires"],
  ["rebooking", "Rebooking"],
  ["performance", "Pilotage"],
  ["alumni", "Alumni"],
  ["accomplishments", "Accomplissements"],
  ["training", "Formation continue"],
  ["assistant", "Assistant"],
  ["admin", "Admin"],
  ["guide", "Guide"]
];

const tabDescriptions = {
  todo: "Priorites quotidiennes du coach.",
  clients: "Portefeuille client, donnees manuelles et contexte coach.",
  questionnaires: "Inbox des suivis client-coach et envois de questionnaires.",
  rebooking: "Seances a remettre, statuts et historique.",
  performance: "Objectifs, rencontres, points a discuter et indicateurs coach.",
  alumni: "Anciens clients a classer, reactiver ou exclure.",
  accomplishments: "Photos, videos et preuves de progression client.",
  training: "Developpement coach et ressources internes.",
  assistant: "Laboratoire IA prive en lecture seule.",
  admin: "Vue equipe, sources et supervision des coachs pilotes.",
  guide: "Procedures, modules connectes et limites actuelles."
};

function visibleTabs() {
  return tabs.filter(([id]) => !["admin", "assistant"].includes(id) || isInfoAdmin());
}

function isVisibleTab(tab) {
  return visibleTabs().some(([id]) => id === tab);
}

function normalizeActiveTab() {
  if (isVisibleTab(state.tab)) return;
  state.tab = "todo";
}

const appRoot = document.querySelector("#app");
const toastRoot = document.querySelector("#toast");

window.addEventListener("error", (event) => {
  pushError(event.message || "Erreur JavaScript inconnue");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason || {};
  pushError(reason.message || reason.code || "Promesse rejetee sans message");
});

window.addEventListener("focus", () => {
  void checkDashboardRelease();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void checkDashboardRelease();
});

window.setInterval(() => {
  void checkDashboardRelease();
}, RELEASE_CHECK_INTERVAL_MS);

let authObserverAnswered = false;

window.setTimeout(() => {
  if (!authObserverAnswered && appRoot?.innerText?.includes("Chargement")) {
    renderLoadingIssue("La connexion prend plus de temps que prevu. Recharge la page ou reconnecte ton compte Google.");
  }
}, 7000);

handleAuthRedirectBoot().catch((error) => {
  pushError(`Connexion Google: ${humanizeFirebaseError(error)}`, false);
});

async function handleAuthRedirectBoot() {
  const params = new URLSearchParams(window.location.search);
  const redirectMode = params.get("authMode") === "redirect";
  try {
    const redirectResult = await getRedirectResult(auth);
    if (redirectResult?.user || auth.currentUser) {
      clearAuthRedirectState();
      cleanAuthRedirectUrl();
      return;
    }
  } catch (error) {
    clearAuthRedirectState();
    cleanAuthRedirectUrl();
    pushError(`Connexion Google: ${humanizeFirebaseError(error)}`, false);
    return;
  }

  if (!redirectMode) return;
  if (sessionStorage.getItem(AUTH_REDIRECT_STARTED_KEY)) {
    cleanAuthRedirectUrl();
    return;
  }
  await startGoogleRedirectLogin();
}

async function startGoogleRedirectLogin() {
  sessionStorage.setItem(AUTH_REDIRECT_STARTED_KEY, String(Date.now()));
  try {
    await signInWithRedirect(auth, provider);
  } catch (error) {
    clearAuthRedirectState();
    cleanAuthRedirectUrl();
    throw error;
  }
}

function clearAuthRedirectState() {
  try {
    sessionStorage.removeItem(AUTH_REDIRECT_STARTED_KEY);
  } catch (_) {
    // Ignore storage issues; auth can continue without the loop guard.
  }
}

function cleanAuthRedirectUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("authMode")) return;
  url.searchParams.delete("authMode");
  window.history.replaceState({}, "", url.toString());
}

async function loginWithEmail(data) {
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  if (!email || !password) {
    throw new Error("Entre ton courriel et ton mot de passe.");
  }
  clearAuthRedirectState();
  await signInWithEmailAndPassword(auth, email, password);
}

async function sendPasswordResetFromLogin() {
  const emailInput = document.querySelector('[data-form="emailLogin"] input[name="email"]');
  const email = String(emailInput?.value || "").trim().toLowerCase();
  if (!email) {
    throw new Error("Entre ton courriel avant de demander une reinitialisation.");
  }
  clearAuthRedirectState();
  await sendPasswordResetEmail(auth, email);
  showToast("Courriel de reinitialisation envoye.");
}

onAuthStateChanged(auth, async (user) => {
  authObserverAnswered = true;
  cleanupSubscriptions();
  if (state.announcementAutoOpenTimer) window.clearTimeout(state.announcementAutoOpenTimer);
  state.announcementAutoOpenTimer = null;
  state.announcementDismissedIds = new Set();
  state.announcementAutoShownThisSession = false;
  state.user = user;
  state.profile = null;
  state.errors = [];
  if (!user) {
    renderLogin();
    return;
  }
  await loadProfile(user);
});

async function loadProfile(user) {
  const profileRef = doc(db, "users", user.uid);
  let profileSnap;
  try {
    profileSnap = await withTimeout(
      getDoc(profileRef),
      9000,
      "Lecture du profil trop longue."
    );
  } catch (error) {
    renderPendingAccess(user, "Impossible de confirmer ton acces pour le moment. Recharge la page ou demande a un admin de verifier ton compte.");
    return;
  }

  if (!profileSnap.exists()) {
    if (isBootstrapAdmin(user)) {
      try {
        await withTimeout(setDoc(profileRef, {
          active: true,
          role: "admin",
          coachId: "admin",
          displayName: user.displayName || "Michael Grondin",
          email: user.email || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: "firebase_bootstrap"
        }), 9000, "Creation du profil admin trop longue.");
        showToast("Profil admin cree. Rechargement...");
        window.setTimeout(() => window.location.reload(), 900);
      } catch (error) {
        renderPendingAccess(user, `Bootstrap admin impossible. ${error.code || ""} ${error.message || ""}`.trim());
      }
      return;
    }
    const pilotCoach = pilotCoachForEmail(user.email);
    if (pilotCoach) {
      try {
        await withTimeout(setDoc(profileRef, {
          active: true,
          role: "coach",
          coachId: pilotCoach.id,
          coachRxId: pilotCoach.coachRxId || pilotCoach.id,
          displayName: user.displayName || pilotCoach.name,
          email: user.email || pilotCoach.email || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: "firebase_self_provision_pilot"
        }), 9000, "Creation du profil coach trop longue.");
        showToast(`Acces coach active pour ${pilotCoach.name}.`);
        window.setTimeout(() => window.location.reload(), 700);
      } catch (error) {
        renderPendingAccess(user, `Auto-activation coach impossible. ${error.code || ""} ${error.message || ""}`.trim());
      }
      return;
    }
    renderPendingAccess(user, "Ton compte Google est reconnu, mais ton acces dashboard n'est pas encore active.");
    return;
  }

  state.profile = { id: profileSnap.id, ...profileSnap.data() };
  if (!state.profile.active) {
    renderPendingAccess(user, "Ton acces existe, mais il n'est pas encore actif.");
    return;
  }

  await loadCoaches();
  state.selectedCoachId = chooseInitialCoach();
  subscribeCoachData();
  render();
  void checkDashboardRelease({ force: true });
  void trackUsageEvent("session_started", { source: "auth", tab: state.tab });
}

function dashboardVersionFromHtml(html) {
  const match = String(html || "").match(/(?:\.\/)?app\.js\?v=([^\"'&\s<]+)/i);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch (_) {
    return match[1];
  }
}

async function checkDashboardRelease({ force = false } = {}) {
  const now = Date.now();
  if (state.releaseCheck.checking) return;
  if (!force && now - state.releaseCheck.checkedAt < RELEASE_CHECK_INTERVAL_MS) return;

  state.releaseCheck.checking = true;
  state.releaseCheck.checkedAt = now;
  try {
    const releaseUrl = new URL("./", window.location.href);
    releaseUrl.searchParams.set("releaseCheck", String(now));
    const response = await fetch(releaseUrl.toString(), {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) return;
    const latestVersion = dashboardVersionFromHtml(await response.text());
    const availableVersion = latestVersion && latestVersion !== APP_VERSION ? latestVersion : "";
    if (availableVersion === state.releaseCheck.latestVersion) return;
    state.releaseCheck.latestVersion = availableVersion;
    renderIfReady();
  } catch (error) {
    console.warn("Dashboard release check unavailable", error);
  } finally {
    state.releaseCheck.checking = false;
  }
}

function chooseInitialCoach() {
  if (isInfoAdmin()) return mergedCoachOptions()[0]?.id || "";
  return state.profile.coachId || "";
}

function renderLogin() {
  appRoot.innerHTML = `
    <main class="auth-card auth-card-pilot">
      <div class="brand-kicker">CFSB COACH COMMAND</div>
      <h1>Dashboard Coach</h1>
      <p class="auth-lead">Acces pilote reserve aux coachs autorises de CrossFit St-Basile.</p>
      <div class="auth-action-stack">
        <button class="primary" data-action="loginRedirect">Connexion avec Google</button>
      </div>
      <form class="auth-email-form" data-form="emailLogin">
        <div>
          <strong>Connexion par courriel</strong>
          <span>Pour les coachs qui n'ont pas de compte Google ou qui ont un probleme mobile.</span>
        </div>
        <label>Courriel
          <input class="input" type="email" name="email" autocomplete="email" required>
        </label>
        <label>Mot de passe
          <input class="input" type="password" name="password" autocomplete="current-password" required>
        </label>
        <div class="auth-email-actions">
          <button class="primary" type="submit">Connexion courriel</button>
          <button class="secondary" type="button" data-action="resetPassword">Mot de passe oublie</button>
        </div>
      </form>
      <div class="auth-helper-grid">
        <div>
          <strong>Quel compte utiliser?</strong>
          <span>Utilise le courriel que Michael a autorise pour le pilote.</span>
        </div>
        <div>
          <strong>Sur iPhone</strong>
          <span>Google reste disponible; courriel + mot de passe evite les boucles de navigateur.</span>
        </div>
        <div>
          <strong>Acces refuse?</strong>
          <span>Verifie le courriel utilise ou demande l'activation de ton acces.</span>
        </div>
      </div>
      <p class="auth-footnote">L'acces reste controle par la liste pilote CFSB. Le mot de passe peut etre reinitialise par courriel.</p>
    </main>
  `;
}

function renderLoadingIssue(message) {
  appRoot.innerHTML = `
    <main class="auth-card">
      <div class="brand-kicker">CHARGEMENT</div>
      <h1>Dashboard Coach</h1>
      <p>${escapeHtml(message)}</p>
      <div class="notice">
        L'application attend une reponse de connexion. Essaie d'abord <strong>Verifier a nouveau</strong>.
        Si ca revient souvent, un admin pourra verifier le journal technique.
      </div>
      <button class="primary" data-action="reload">Verifier a nouveau</button>
      <button class="secondary" data-action="logout">Changer de compte</button>
    </main>
  `;
}

function renderPendingAccess(user, message = "Ton compte Google est reconnu, mais aucun acces dashboard n'est encore configure.") {
  appRoot.innerHTML = `
    <main class="auth-card auth-card-pilot">
      <div class="brand-kicker">ACCES A VERIFIER</div>
      <h1>Dashboard Coach</h1>
      <p class="auth-lead">${escapeHtml(message)}</p>
      <div class="notice access-notice">
        <strong>Ce que ca veut dire</strong>
        <span>Tu es connecte a Google, mais ce courriel n'a pas encore un acces actif au pilote Dashboard Coach.</span>
      </div>
      <div class="auth-helper-grid">
        <div>
          <strong>1. Verifie le compte</strong>
          <span>Si Google a choisi ton courriel personnel, change de compte.</span>
        </div>
        <div>
          <strong>2. Demande l'acces</strong>
          <span>Envoie le courriel affiche ci-dessous a Michael.</span>
        </div>
        <div>
          <strong>3. Reviens ici</strong>
          <span>Quand l'acces est active, clique sur Verifier a nouveau.</span>
        </div>
      </div>
      <div class="access-code-card">
        <span>Courriel connecte</span>
        <strong>${escapeHtml(user.email || "")}</strong>
        <small>Code acces: ${escapeHtml(user.uid)}</small>
      </div>
      <div class="auth-action-stack">
        <button class="primary" data-action="reload">Verifier a nouveau</button>
        <button class="secondary" data-action="logout">Changer de compte Google</button>
      </div>
    </main>
  `;
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    })
  ]);
}

async function loadCoaches() {
  try {
    const snap = await withTimeout(
      getDocs(query(collection(db, "coaches"), where("active", "==", true))),
      9000,
      "Lecture de la liste des coachs trop longue."
    );
    state.coaches = snap.docs
      .map(fromDoc)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    if (!state.coaches.length) {
      state.coaches = [...PILOT_COACHES];
      pushError("Aucun coach trouve dans Firestore. Liste pilote affichee en fallback.", false);
    }
  } catch (error) {
    pushError(`Coachs non charges: ${error.code || ""} ${error.message || ""}`.trim(), false);
    state.coaches = [...PILOT_COACHES];
  }
}

function subscribeCoachData() {
  cleanupSubscriptions();
  resetCoachData();
  subscribeAnnouncements();
  subscribeAnnouncementAcknowledgements();
  subscribePilotAcceptances();
  const coachId = state.selectedCoachId;
  if (!coachId) {
    render();
    return;
  }

  if (isInfoAdmin()) {
    subscribeSyncRuns();
    subscribeSyncRequests();
    subscribeUsageEvents();
    subscribeWeeklyProductReports();
    subscribeProductReportRequests();
    subscribeAssistantVoiceRequests();
    subscribeAssistantRequests();
    subscribeAssistantProposals();
    subscribeAssistantActionRequests();
  }
  subscribeCoachRxExtensionSetup();
  subscribePerformanceSettings(coachId);
  subscribeCoachSyncStatus(coachId);

  subscribeCollection("tasks", coachId, (items) => {
    state.data.tasks = items
      .filter(isOpenTaskLifecycle)
      .sort(sortTasks)
      .slice(0, 300);
    primeTaskVoicePlaybackUrls(state.data.tasks);
  });

  subscribeCollection("clients", coachId, (items) => {
    const ownedItems = items.filter((item) => firestoreItemBelongsToCoach(item, coachId));
    state.data.clients = dedupeClients(ownedItems)
      .sort((a, b) => String(a.lastNameSort || a.name || "").localeCompare(String(b.lastNameSort || b.name || "")));
    primeTaskVoicePlaybackUrls(state.data.tasks);
  }, {
    rejectedSetter: isInfoAdmin()
      ? (items) => {
        state.data.rejectedClients = items
          .map((item) => ({ ...item, _ownershipReviewReason: "coach_conflict" }))
          .sort((a, b) => String(a.lastNameSort || a.name || "").localeCompare(String(b.lastNameSort || b.name || "")));
      }
      : null
  });

  subscribeCollection("questionnaireResponses", coachId, (items) => {
    state.data.questionnaireResponses = items
      .sort((a, b) => dateValue(b.submittedAt || b.createdAt) - dateValue(a.submittedAt || a.createdAt));
  });

  subscribeCollection("questionnaireSends", coachId, (items) => {
    state.data.questionnaireSends = items
      .sort((a, b) => dateValue(b.sentAt || b.preparedAt || b.createdAt) - dateValue(a.sentAt || a.preparedAt || a.createdAt));
  });

  subscribeCollection("questionnaireSchedules", coachId, (items) => {
    state.data.questionnaireSchedules = items
      .sort((a, b) =>
        dateValue(a.nextSendAt) - dateValue(b.nextSendAt)
        || String(a.clientName || "").localeCompare(String(b.clientName || ""))
      );
  });

  subscribeCollection("rebookings", coachId, (items) => {
    state.data.rebookings = items
      .sort((a, b) => dateValue(b.detectedAt || b.createdAt) - dateValue(a.detectedAt || a.createdAt));
  });

  subscribeCollection("checkups", coachId, (items) => {
    state.data.checkups = items
      .sort((a, b) =>
        dateValue(b.checkupDate) - dateValue(a.checkupDate)
        || dateValue(b.createdAt) - dateValue(a.createdAt)
      );
  });

  subscribeCollection("impacts", coachId, (items) => {
    state.data.impacts = items
      .sort((a, b) => dateValue(b.impactDate || b.createdAt) - dateValue(a.impactDate || a.createdAt));
  });

  subscribeCollection("alumni", coachId, (items) => {
    state.data.alumni = items
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  });
}

function resetCoachData() {
  stopAllTaskVoicePlayback();
  state.voicePlayback = {};
  state.data.tasks = [];
  state.data.clients = [];
  state.data.rejectedClients = [];
  state.data.questionnaireResponses = [];
  state.data.questionnaireSends = [];
  state.data.questionnaireSchedules = [];
  state.data.rebookings = [];
  state.data.checkups = [];
  state.data.impacts = [];
  state.data.alumni = [];
  state.data.syncStatus = null;
  state.data.syncRequests = [];
  state.data.usageEvents = [];
  state.data.weeklyProductReports = [];
  state.data.productReportRequests = [];
  state.data.assistantVoiceRequests = [];
  state.data.assistantRequests = [];
  state.data.assistantProposals = [];
  state.data.assistantActionRequests = [];
  state.data.announcements = [];
  state.data.announcementAcknowledgements = [];
  state.data.pilotAcceptances = [];
  state.data.loaded = {};
}

function subscribeAnnouncements() {
  state.unsubscribers.push(onSnapshot(
    query(collection(db, "announcements"), limit(50)),
    (snap) => {
      state.data.announcements = snap.docs
        .map(fromDoc)
        .sort((a, b) => dateValue(b.publishedAt || b.createdAt) - dateValue(a.publishedAt || a.createdAt));
      state.data.loaded.announcements = true;
      scheduleRender();
    },
    (error) => {
      console.warn("Announcements unavailable", error);
      state.data.loaded.announcements = true;
      scheduleRender();
    }
  ));
}

function subscribeAnnouncementAcknowledgements() {
  if (!state.user?.uid) return;
  const source = isInfoAdmin()
    ? query(collection(db, "announcementAcknowledgements"), limit(500))
    : query(collection(db, "announcementAcknowledgements"), where("userId", "==", state.user.uid), limit(100));
  state.unsubscribers.push(onSnapshot(
    source,
    (snap) => {
      state.data.announcementAcknowledgements = snap.docs.map(fromDoc);
      state.data.loaded.announcementAcknowledgements = true;
      scheduleRender();
    },
    (error) => {
      console.warn("Announcement acknowledgements unavailable", error);
      state.data.loaded.announcementAcknowledgements = true;
      scheduleRender();
    }
  ));
}

function subscribePilotAcceptances() {
  if (!state.user?.uid) return;
  const source = isInfoAdmin()
    ? query(collection(db, "pilotAcceptances"), limit(200))
    : query(collection(db, "pilotAcceptances"), where("userId", "==", state.user.uid), limit(20));
  state.unsubscribers.push(onSnapshot(
    source,
    (snap) => {
      state.data.pilotAcceptances = snap.docs
        .map(fromDoc)
        .sort((a, b) => dateValue(b.validatedAt || b.updatedAt) - dateValue(a.validatedAt || a.updatedAt));
      state.data.loaded.pilotAcceptances = true;
      scheduleRender();
    },
    (error) => {
      console.warn("Pilot acceptances unavailable", error);
      state.data.loaded.pilotAcceptances = true;
      scheduleRender();
    }
  ));
}

function subscribePerformanceSettings(coachId) {
  state.unsubscribers.push(onSnapshot(
    doc(db, "performanceSettings", coachId),
    (snap) => {
      state.data.performanceSettings = snap.exists() ? fromDoc(snap) : null;
      scheduleRender();
    },
    (error) => showDataError("performanceSettings", error)
  ));
}

function subscribeCoachRxExtensionSetup() {
  state.unsubscribers.push(onSnapshot(
    doc(db, "system", "coachrxExtensionSetup"),
    (snap) => {
      state.data.extensionSetup = snap.exists() ? fromDoc(snap) : null;
      scheduleRender();
    },
    (error) => showDataError("system/coachrxExtensionSetup", error)
  ));
}

function subscribeSyncRuns() {
  state.unsubscribers.push(onSnapshot(
    query(collection(db, "syncRuns"), orderBy("createdAt", "desc"), limit(12)),
    (snap) => {
      state.data.syncRuns = snap.docs.map(fromDoc);
      scheduleRender();
    },
    (error) => showDataError("syncRuns", error)
  ));
}

function subscribeSyncRequests() {
  state.unsubscribers.push(onSnapshot(
    query(collection(db, "syncRequests"), orderBy("createdAt", "desc"), limit(12)),
    (snap) => {
      state.data.syncRequests = snap.docs.map(fromDoc);
      scheduleRender();
    },
    (error) => showDataError("syncRequests", error)
  ));
}

function subscribeUsageEvents() {
  state.unsubscribers.push(onSnapshot(
    query(collection(db, "usageEvents"), orderBy("createdAt", "desc"), limit(USAGE_EVENT_LIMIT)),
    (snap) => {
      state.data.usageEvents = snap.docs.map(fromDoc);
      scheduleRender();
    },
    (error) => showDataError("usageEvents", error)
  ));
}

function subscribeWeeklyProductReports() {
  state.unsubscribers.push(onSnapshot(
    query(collection(db, "weeklyProductReports"), orderBy("generatedAt", "desc"), limit(12)),
    (snap) => {
      state.data.weeklyProductReports = snap.docs.map(fromDoc);
      scheduleRender();
    },
    (error) => showDataError("weeklyProductReports", error)
  ));
}

function subscribeProductReportRequests() {
  state.unsubscribers.push(onSnapshot(
    query(collection(db, "productReportRequests"), orderBy("createdAt", "desc"), limit(8)),
    (snap) => {
      state.data.productReportRequests = snap.docs.map(fromDoc);
      scheduleRender();
    },
    (error) => showDataError("productReportRequests", error)
  ));
}

function subscribeAssistantRequests() {
  if (!state.user?.uid || !isInfoAdmin()) return;
  state.unsubscribers.push(onSnapshot(
    query(collection(db, "assistantRequests"), where("userId", "==", state.user.uid), limit(40)),
    (snap) => {
      state.data.assistantRequests = snap.docs
        .map(fromDoc)
        .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
      state.data.loaded.assistantRequests = true;
      scheduleRender();
    },
    (error) => showDataError("assistantRequests", error)
  ));
}

function subscribeAssistantVoiceRequests() {
  if (!state.user?.uid || !isInfoAdmin()) return;
  state.unsubscribers.push(onSnapshot(
    query(collection(db, "assistantVoiceRequests"), where("userId", "==", state.user.uid), limit(40)),
    (snap) => {
      state.data.assistantVoiceRequests = snap.docs
        .map(fromDoc)
        .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
      state.data.loaded.assistantVoiceRequests = true;
      scheduleRender();
    },
    (error) => showDataError("assistantVoiceRequests", error)
  ));
}

function subscribeAssistantProposals() {
  if (!state.user?.uid || !isInfoAdmin()) return;
  state.unsubscribers.push(onSnapshot(
    query(collection(db, "assistantProposals"), where("userId", "==", state.user.uid), limit(40)),
    (snap) => {
      state.data.assistantProposals = snap.docs
        .map(fromDoc)
        .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
      state.data.loaded.assistantProposals = true;
      scheduleRender();
    },
    (error) => showDataError("assistantProposals", error)
  ));
}

function subscribeAssistantActionRequests() {
  if (!state.user?.uid || !isInfoAdmin()) return;
  state.unsubscribers.push(onSnapshot(
    query(collection(db, "assistantActionRequests"), where("userId", "==", state.user.uid), limit(40)),
    (snap) => {
      state.data.assistantActionRequests = snap.docs
        .map(fromDoc)
        .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
      state.data.loaded.assistantActionRequests = true;
      scheduleRender();
    },
    (error) => showDataError("assistantActionRequests", error)
  ));
}

function subscribeCoachSyncStatus(coachId) {
  state.unsubscribers.push(onSnapshot(
    doc(db, "coachSyncStatus", coachId),
    (snap) => {
      state.data.syncStatus = snap.exists() ? fromDoc(snap) : null;
      scheduleRender();
    },
    (error) => showDataError("coachSyncStatus", error)
  ));
}

function subscribeCollection(collectionName, coachId, setter, { rejectedSetter = null } = {}) {
  const criteria = coachSubscriptionCriteria(coachId);
  const snapshots = new Map();
  const initialized = new Set();
  const apply = () => {
    const merged = new Map();
    const rejected = new Map();
    snapshots.forEach((items) => {
      items.forEach((item) => {
        if (!firestoreItemBelongsToCoach(item, coachId)) {
          if (rejectedSetter) rejected.set(item.id, item);
          return;
        }
        merged.set(item.id, item);
      });
    });
    setter([...merged.values()]);
    if (rejectedSetter) rejectedSetter([...rejected.values()]);
    state.data.loaded[collectionName] = initialized.size >= criteria.length;
    scheduleRender();
  };

  criteria.forEach(({ field, value }) => {
    const key = `${field}:${value}`;
    state.unsubscribers.push(onSnapshot(
      query(collection(db, collectionName), where(field, "==", value)),
      (snap) => {
        initialized.add(key);
        snapshots.set(key, snap.docs.map(fromDoc));
        apply();
      },
      (error) => {
        initialized.add(key);
        state.data.loaded[collectionName] = initialized.size >= criteria.length;
        showDataError(`${collectionName}/${field}`, error);
      }
    ));
  });
}

function canonicalCoachId(coach = {}) {
  return String(coach.id || coach.coachRxId || "").trim();
}

function coachIdFromFirestoreIdSignal(value) {
  const signal = String(value || "").trim();
  if (!signal) return "";
  const matches = mergedCoachOptions()
    .filter((coach) => uniqueClean([coach.id, coach.coachRxId]).some((id) => String(id) === signal))
    .map(canonicalCoachId)
    .filter(Boolean);
  const uniqueMatches = uniqueClean(matches);
  return uniqueMatches.length === 1 ? uniqueMatches[0] : "";
}

function coachIdFromFirestoreNameSignal(value) {
  const signal = normalizeComparable(value);
  if (!signal) return "";
  const matches = mergedCoachOptions()
    .filter((coach) => coachNameValues(coach).some((name) => normalizeComparable(name) === signal))
    .map(canonicalCoachId)
    .filter(Boolean);
  const uniqueMatches = uniqueClean(matches);
  return uniqueMatches.length === 1 ? uniqueMatches[0] : "";
}

function resolveFirestoreItemCoachId(item = {}) {
  const idSignals = uniqueClean([item.coachId, item.coachRxId, item.assignedCoachId]);
  if (idSignals.length) {
    const resolvedIds = idSignals.map(coachIdFromFirestoreIdSignal);
    if (resolvedIds.some((id) => !id)) return "";
    const uniqueIds = uniqueClean(resolvedIds);
    return uniqueIds.length === 1 ? uniqueIds[0] : "";
  }

  const nameSignals = uniqueClean([item.coachName, item.assignedCoachName]);
  if (!nameSignals.length) return "";
  const resolvedNames = nameSignals.map(coachIdFromFirestoreNameSignal);
  if (resolvedNames.some((id) => !id)) return "";
  const uniqueNames = uniqueClean(resolvedNames);
  return uniqueNames.length === 1 ? uniqueNames[0] : "";
}

function firestoreItemBelongsToCoach(item = {}, coachId) {
  const coach = coachRecordById(coachId);
  const targetCoachId = canonicalCoachId(coach || {});
  if (!targetCoachId) return false;
  return resolveFirestoreItemCoachId(item) === targetCoachId;
}

function coachSubscriptionCriteria(coachId) {
  if (!isInfoAdmin()) {
    return uniqueCriteria([{ field: "coachId", value: String(coachId || state.profile?.coachId || "").trim() }]);
  }
  const coach = coachRecordById(coachId);
  if (!coach) return uniqueCriteria([{ field: "coachId", value: coachId }]);
  const idValues = uniqueClean([coach.id, coach.coachRxId]);
  const idCriteriaValues = uniqueClean(idValues.flatMap(firestoreIdVariants));
  const nameValues = coachNameValues(coach).slice(0, 5);
  return uniqueCriteria([
    ...idCriteriaValues.map((value) => ({ field: "coachId", value })),
    ...idCriteriaValues.map((value) => ({ field: "coachRxId", value })),
    ...idCriteriaValues.map((value) => ({ field: "assignedCoachId", value })),
    ...nameValues.map((value) => ({ field: "coachName", value })),
    ...nameValues.map((value) => ({ field: "assignedCoachName", value }))
  ]);
}

function coachRecordById(coachId) {
  if (!coachId) return null;
  return state.coaches.find((coach) => coach.id === coachId || coach.coachRxId === coachId)
    || PILOT_COACHES.find((coach) => coach.id === coachId || coach.coachRxId === coachId)
    || null;
}

function mergedCoachOptions() {
  const byId = new Map();
  [...PILOT_COACHES, ...state.coaches].forEach((coach) => {
    const id = coach.id || coach.coachRxId;
    if (!id) return;
    byId.set(id, { ...(byId.get(id) || {}), ...coach, id });
  });
  const pilotOrder = new Map(PILOT_COACHES.map((coach, index) => [coach.id, index]));
  return [...byId.values()]
    .filter((coach) => coach.active !== false)
    .sort((a, b) => {
      const aOrder = pilotOrder.has(a.id) ? pilotOrder.get(a.id) : 999;
      const bOrder = pilotOrder.has(b.id) ? pilotOrder.get(b.id) : 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function coachNameValues(coach) {
  return uniqueClean([
    coach.name,
    ...(Array.isArray(coach.aliases) ? coach.aliases : []),
    PILOT_COACHES.find((item) => item.id === coach.id || item.coachRxId === coach.coachRxId)?.name,
    ...(PILOT_COACHES.find((item) => item.id === coach.id || item.coachRxId === coach.coachRxId)?.aliases || [])
  ]);
}

function uniqueClean(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function firestoreIdVariants(value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return [];
  const variants = [cleanValue];
  if (/^\d+$/.test(cleanValue)) variants.push(Number(cleanValue));
  return variants;
}

function uniqueCriteria(criteria) {
  const seen = new Set();
  return criteria.filter(({ field, value }) => {
    const cleanValue = String(value || "").trim();
    if (!field || !cleanValue) return false;
    const key = `${field}:${typeof value}:${cleanValue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function render() {
  if (state.rendering) return;
  state.renderQueued = false;
  state.rendering = true;
  try {
    renderDashboard();
  } catch (error) {
    recoverDashboardRender(error);
  } finally {
    document.body?.classList.toggle("modal-open", Boolean(state.modal));
    state.rendering = false;
  }
}

function renderDashboard() {
  state.renderQueued = false;
  if (!state.user || !state.profile) return;
  normalizeActiveTab();

  const activeCoach = activeCoachRecord();
  const openTasks = state.data.tasks.filter(isOpenTask).length;
  const rebookingSessions = openRebookingSessionCount();
  const weeklyImpacts = currentWeekImpacts().length;
  const weeklyCheckups = currentWeekCheckups().length;
  const questionnaireResponsesUnread = questionnaireResponsesToRead().length;
  const showDailyCommand = state.tab === "todo";

  appRoot.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="brand">
          <div class="brand-kicker">CFSB COACH COMMAND</div>
          <h1>Dashboard Coach</h1>
          <p>${escapeHtml(activeCoach?.name || "Selectionne un coach")}</p>
        </div>
        <nav class="nav">
          ${visibleTabs().map(([id, label]) => `<button class="${state.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}
        </nav>
        <label class="mobile-section-picker">
          <span>Section</span>
          <select class="input" data-action="selectTabMobile">
            ${visibleTabs().map(([id, label]) => `<option value="${escapeAttr(id)}" ${state.tab === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
          </select>
        </label>
        <div class="side-footer">
          ${renderCoachSelect()}
          <div class="app-version">Version ${escapeHtml(APP_VERSION)}</div>
          <button class="secondary" data-action="logout">Deconnexion</button>
        </div>
      </aside>
      ${renderMobileAppHeader(activeCoach)}
      <main class="main">
        <header class="topbar">
          <div>
            <h2>${tabTitle()}</h2>
            <p>${tabDescription()}</p>
          </div>
          <div class="top-actions">
            ${renderPrimaryAction()}
          </div>
        </header>
        ${renderReleaseUpdateBanner()}
        ${showDailyCommand ? renderDashboardStats({ openTasks, rebookingSessions, weeklyImpacts, weeklyCheckups, questionnaireResponsesUnread }) : ""}
        ${showDailyCommand ? renderCoachObjectiveHeader() : ""}
        ${state.tab === "todo" ? "" : renderCoachSyncStatus()}
        ${renderErrors()}
        ${renderActiveTab()}
      </main>
      ${state.modal ? renderModal() : ""}
      ${renderMobileQuickMissionButton()}
      ${renderMobileBottomNav()}
      ${renderMobileMenuSheet()}
    </div>
  `;
  renderToast();
  syncAllTaskVoicePlaybackDom();
  scheduleUnreadAnnouncementModal();
}

function renderReleaseUpdateBanner() {
  const latestVersion = state.releaseCheck.latestVersion;
  if (!latestVersion) return "";
  return `
    <section class="notice release-update-banner" role="status" aria-live="polite">
      <div>
        <strong>Nouvelle version disponible</strong>
        <span>Actualise quand ton action en cours est terminee.</span>
      </div>
      <button class="secondary" data-action="reloadForUpdate">Actualiser</button>
    </section>
  `;
}

function recoverDashboardRender(error) {
  const message = String(error?.message || error || "Erreur de rendu inconnue").slice(0, 240);
  const diagnostic = `Rendu interface: ${message}`;
  console.error("Dashboard render failed", error);
  if (!state.errors.includes(diagnostic)) state.errors.push(diagnostic);
  state.modal = null;
  state.mobileMenuOpen = "";
  state.coachPickerOpen = false;
  safeResetVoiceRecorder();
  document.querySelectorAll(".modal-backdrop, .mobile-menu-backdrop").forEach((element) => element.remove());

  const recovery = `
    <section class="notice error interaction-recovery" data-render-recovery>
      <strong>La page a rencontre un probleme d'affichage.</strong>
      <p>Ton action n'a pas ete envoyee. Recharge la page; les autres donnees restent intactes.</p>
      <button class="secondary" type="button" data-action="reload">Recharger</button>
    </section>
  `;
  const main = appRoot.querySelector(".main");
  if (main) {
    main.querySelector("[data-render-recovery]")?.remove();
    main.insertAdjacentHTML("afterbegin", recovery);
  } else {
    appRoot.innerHTML = `<main class="auth-card">${recovery}</main>`;
  }
  renderToast();
}

function renderDashboardStats({ openTasks, rebookingSessions, weeklyImpacts, weeklyCheckups, questionnaireResponsesUnread }) {
  const stats = [
    { label: "actions", value: openTasks, action: "todo", filter: "all" },
    { label: "rebooking", value: rebookingSessions, action: "rebooking", filter: "open" },
    { label: "impacts", value: weeklyImpacts, modal: "weeklyImpacts" },
    { label: "check-ups", value: weeklyCheckups, modal: "weeklyCheckups" },
    { label: "a lire", value: questionnaireResponsesUnread, action: "questionnaires", filter: "to_read" }
  ];
  return `
    <section class="grid-stats dashboard-stats">
      ${stats.map((stat) => {
        const clickable = Boolean(stat.action || stat.modal);
        const attrs = stat.modal
          ? `data-action="openDashboardStat" data-modal-target="${escapeAttr(stat.modal)}"`
          : `data-action="openDashboardStat" data-tab-target="${escapeAttr(stat.action || "todo")}" data-filter-value="${escapeAttr(stat.filter || "")}"`;
        return `
          <button class="stat ${clickable ? "stat-button" : "stat-muted"}" type="button" ${attrs} aria-label="${Number(stat.value || 0)} ${escapeAttr(stat.label)}">
            <strong>${Number(stat.value || 0)}</strong><span>${escapeHtml(stat.label)}</span>
          </button>
        `;
      }).join("")}
    </section>
  `;
}

function openRebookingSessionCount() {
  return groupRebookingsForCoachView(portfolioRebookings())
    .filter((item) => rebookingStatus(item) === "open")
    .reduce((sum, item) => sum + Math.max(1, Number(item.sessionsToRebook || 1)), 0);
}

function currentWeekImpacts() {
  return currentWeekFiltered(portfolioImpacts(), "impactDate")
    .filter((impact) => !["deleted"].includes(impact.status || "draft"));
}

function currentWeekCheckups() {
  return currentWeekFiltered(portfolioCheckups(), "checkupDate", { fallbackCreatedAt: false });
}

function mobilePrimaryTabs() {
  return ["todo", "clients", "questionnaires", "rebooking"];
}

function renderMobileAppHeader(activeCoach) {
  if (!state.selectedCoachId || !state.profile) return "";
  return `
    <header class="mobile-app-header">
      <div>
        <span>${escapeHtml(tabTitle())}</span>
        <strong>${escapeHtml(activeCoach?.name || "Coach")}</strong>
      </div>
      <div class="mobile-header-actions">
        <button class="mobile-quick-mission-fab" type="button" data-action="openQuickNote">+ Mission</button>
        <button class="mobile-profile-button" type="button" data-action="toggleMobileMenu" data-menu="profile" aria-label="Ouvrir le compte">
          ${escapeHtml(coachInitials(activeCoach))}
        </button>
      </div>
    </header>
  `;
}

function renderMobileBottomNav() {
  if (!state.selectedCoachId || !state.profile) return "";
  const visibleIds = new Set(visibleTabs().map(([id]) => id));
  const primaryTabs = mobilePrimaryTabs().filter((id) => visibleIds.has(id));
  const isMoreActive = !primaryTabs.includes(state.tab);
  return `
    <nav class="mobile-bottom-nav" aria-label="Navigation mobile">
      ${primaryTabs.map((id) => mobileNavButton(id, mobileTabLabel(id), state.tab === id)).join("")}
      <button class="${isMoreActive ? "active" : ""}" type="button" data-action="toggleMobileMenu" data-menu="more" aria-label="Autres sections">
        <span>Plus</span>
      </button>
    </nav>
  `;
}

function mobileNavButton(id, label, active) {
  return `
    <button class="${active ? "active" : ""}" type="button" data-tab="${escapeAttr(id)}">
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderMobileMenuSheet() {
  if (!state.mobileMenuOpen) return "";
  const activeCoach = activeCoachRecord();
  const primary = new Set(mobilePrimaryTabs());
  const moreTabs = visibleTabs().filter(([id]) => !primary.has(id));
  return `
    <div class="mobile-menu-backdrop" data-action="closeMobileMenu">
      <section class="mobile-menu-sheet" data-mobile-menu-stop>
        <header>
          <div>
            <span>${state.mobileMenuOpen === "profile" ? "Compte" : "Sections"}</span>
            <strong>${escapeHtml(activeCoach?.name || "Coach")}</strong>
          </div>
          <button class="icon-button" type="button" data-action="closeMobileMenu" aria-label="Fermer">x</button>
        </header>
        ${state.mobileMenuOpen === "profile" ? renderMobileProfilePanel(activeCoach) : renderMobileMorePanel(moreTabs)}
      </section>
    </div>
  `;
}

function renderMobileMorePanel(moreTabs) {
  return `
    <div class="mobile-menu-list">
      ${moreTabs.map(([id, label]) => `
        <button class="${state.tab === id ? "active" : ""}" type="button" data-tab="${escapeAttr(id)}">
          <span>${escapeHtml(label)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderMobileProfilePanel(activeCoach) {
  return `
    <div class="mobile-profile-panel">
      <div class="mobile-profile-summary">
        <span>Connecte</span>
        <strong>${escapeHtml(state.user?.email || "")}</strong>
      </div>
      ${renderCoachSelect("mobile")}
      <div class="app-version">Version ${escapeHtml(APP_VERSION)}</div>
      <button class="secondary" type="button" data-action="logout">Deconnexion</button>
    </div>
  `;
}

function coachInitials(coach) {
  const name = String(coach?.name || state.user?.email || "C").trim();
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : name.slice(0, 2)).toUpperCase();
}

function tabTitleById(id) {
  return tabs.find(([tabId]) => tabId === id)?.[1] || id;
}

function mobileTabLabel(id) {
  const labels = {
    todo: "To-do",
    clients: "Clients",
    questionnaires: "Suivis",
    rebooking: "Rebook"
  };
  return labels[id] || tabTitleById(id);
}

function renderMobileQuickMissionButton() {
  return "";
}

function scheduleRender() {
  if (state.renderQueued) return;
  state.renderQueued = true;
  window.requestAnimationFrame(() => render());
}

function renderPrimaryAction() {
  if (!state.selectedCoachId && isInfoAdmin()) {
    return `<button class="primary" data-action="seedCoaches">Reparer la liste coachs</button>`;
  }
  const actions = {
    todo: `<button class="primary" data-action="openQuickNote">Ajouter une mission</button>`,
    clients: `<button class="primary" data-action="openClientForm">Ajouter un client</button>`,
    questionnaires: `
      <button class="primary" data-action="openQuestionnaireSend">Envoyer maintenant</button>
      <button class="secondary" data-filter="questionnaire" data-value="scheduled">Gerer automatisations</button>
    `,
    rebooking: `<button class="primary" data-action="openRebookingForm">Ajouter seance</button>`,
    performance: `<button class="primary" data-action="openPilotageNote">Preparer rencontre hebdo</button>`,
    alumni: `<button class="primary" data-action="openAlumniForm">Ajouter alumni</button>`,
    accomplishments: `<a class="primary button-link" href="${escapeAttr(ACCOMPLISHMENTS_DRIVE_URL)}" target="_blank" rel="noopener">Ouvrir le dossier du centre</a>`,
    guide: ""
  };
  return actions[state.tab] || "";
}

function tabTitle() {
  return tabs.find(([id]) => id === state.tab)?.[1] || "Dashboard";
}

function tabDescription() {
  return tabDescriptions[state.tab] || "";
}

function renderCoachSelect(context = "sidebar") {
  const coachOptions = mergedCoachOptions();
  if (!coachOptions.length) {
    return `
      <div class="empty small">Aucun coach charge.</div>
      <button class="secondary" data-action="seedCoaches">Charger les coachs pilotes</button>
    `;
  }
  const activeCoach = activeCoachRecord();
  const isAdminView = isInfoAdmin();
  const pickerLabel = isAdminView ? "Coach / Admin" : "Coach consulte";
  const activeLabel = activeCoach
    ? `${activeCoach.name || activeCoach.id}${isAdminView && activeCoach.coachRxId ? ` - CoachRx ${activeCoach.coachRxId}` : ""}`
    : "Selectionner un coach";
  const safeContext = String(context || "sidebar").replace(/[^a-z0-9_-]/gi, "");
  const pickerId = `coachPickerList-${safeContext}`;
  const labelId = `coachPickerLabel-${safeContext}`;
  return `
    <div class="coach-select-wrap">
      <span id="${labelId}">${escapeHtml(pickerLabel)}</span>
      <button
        class="coach-select"
        type="button"
        data-action="toggleCoachPicker"
        aria-haspopup="listbox"
        aria-expanded="${state.coachPickerOpen ? "true" : "false"}"
        aria-controls="${pickerId}"
        aria-labelledby="${labelId}"
      >
        <span>${escapeHtml(activeLabel)}</span>
      </button>
      ${state.coachPickerOpen ? `
        <div class="coach-picker" id="${pickerId}" role="listbox" aria-label="Choisir un coach">
          ${coachOptions.map((coach) => `
            <button
              class="coach-option ${coach.id === state.selectedCoachId ? "active" : ""}"
              type="button"
              data-action="selectCoach"
              data-id="${escapeAttr(coach.id)}"
              role="option"
              aria-selected="${coach.id === state.selectedCoachId ? "true" : "false"}"
            >
              <span>${escapeHtml(coach.name || coach.id)}</span>
              ${isAdminView && coach.coachRxId ? `<small>CoachRx ${escapeHtml(coach.coachRxId)}</small>` : ""}
            </button>
          `).join("")}
        </div>
      ` : ""}
      ${isAdminView && activeCoach?.coachRxId ? `<small>CoachRx ${escapeHtml(activeCoach.coachRxId)}</small>` : ""}
      ${!isAdminView && activeCoach?.id !== state.profile?.coachId ? `<small>Consultation equipe</small>` : ""}
    </div>
  `;
}

function syncStatusOutcome(status, request) {
  if (!status) return request?.status === "error" ? "failed" : "missing";
  const syncedAt = dateValue(status.syncedAt);
  const requestAt = dateValue(request?.updatedAt || request?.finishedAt || request?.startedAt || request?.createdAt);
  const requestIsNewer = Boolean(requestAt && (!syncedAt || requestAt > syncedAt));
  if (requestIsNewer && request?.status === "error") return "failed";
  if (requestIsNewer && ["queued", "running"].includes(request?.status)) return "running";
  if (daysSince(status.syncedAt) >= 2) return "stale";
  if (status.status === "warning" || Number(status.warningCount || 0) > 0) return "completed_with_warnings";
  return "completed";
}

function renderCoachSyncStatus() {
  if (!state.selectedCoachId) return "";
  const status = state.data.syncStatus;
  const pendingRequest = latestSyncRequestForCoach(state.selectedCoachId);
  const outcome = syncStatusOutcome(status, pendingRequest);
  if (!status) {
    if (!isInfoAdmin()) return "";
    const failed = outcome === "failed";
    return `
      <div class="notice compact sync-status ${failed ? "error" : "warning"}">
        <strong>${failed ? "Synchronisation echouee" : "Source non confirmee"}</strong>
        <span>${pendingRequest ? syncRequestSummary(pendingRequest) : "Aucune synchronisation Firebase recente n'est enregistree pour ce coach."}</span>
        ${isInfoAdmin() ? `
          <div class="notice-actions">
            <button class="primary" data-action="syncSheets">Synchroniser ce coach</button>
            <button class="secondary" data-action="syncSheetsAll">Sync tous</button>
          </div>
        ` : ""}
      </div>
    `;
  }
  const isAdminView = isInfoAdmin();
  const failed = outcome === "failed";
  const running = outcome === "running";
  const stale = outcome === "stale";
  const dataWarning = outcome === "completed_with_warnings";
  const warning = failed || stale || dataWarning;
  const coachVisibleWarning = failed || stale;
  const className = isAdminView
    ? (failed ? "notice compact sync-status error" : warning ? "notice compact sync-status warning" : "notice compact sync-status ok")
    : (coachVisibleWarning ? "notice compact sync-status warning" : "notice compact sync-status ok");
  const label = isAdminView
    ? (failed
      ? "Synchronisation echouee"
      : running
        ? "Synchronisation en cours"
        : stale
          ? "Synchronisation a actualiser"
          : dataWarning
            ? "Sync terminee · donnees a corriger"
            : "Sync terminee")
    : "Derniere sync";
  const clientCount = Number(status.clientsImported || status.clientsEnriched || 0);
  const taskCount = Number(status.tasksImported || 0);
  const rebookingCount = Number(status.rebookingsImported || 0);
  const checkupCount = Number(status.checkupsImported || 0);
  if (!isAdminView) {
    const detailText = `${clientCount} clients · ${taskCount} taches · ${rebookingCount} rebookings · ${checkupCount} check-ups`;
    const coachLabel = failed ? "Mise a jour non terminee" : stale ? "Sync a actualiser" : "Derniere sync";
    const coachStatus = failed ? "Reessayer plus tard" : stale ? "A actualiser" : "A jour";
    return `
      <details class="${className} coach-sync-quiet" ${coachVisibleWarning ? "open" : ""}>
        <summary>
          <strong>${coachLabel} · ${formatDateTime(status.syncedAt)}</strong>
          <span>${coachStatus}</span>
        </summary>
        <small>${escapeHtml(detailText)}</small>
      </details>
    `;
  }
  return `
    <div class="${className}">
      <strong>${label} · ${formatDateTime(status.syncedAt)}</strong>
      <span>
        ${clientCount} clients · ${taskCount} taches · ${rebookingCount} rebookings · ${checkupCount} check-ups
      </span>
      ${dataWarning ? `<small>${Number(status.warningCount || 0)} point(s) de qualite a corriger dans Admin; les donnees ont bien ete importees.</small>` : ""}
      ${failed && pendingRequest?.errorMessage ? `<small>${escapeHtml(pendingRequest.errorMessage)}</small>` : ""}
    </div>
  `;
}

function renderCoachObjectiveHeader() {
  if (!state.selectedCoachId) return "";
  const settings = state.data.performanceSettings || {};
  const objective = String(settings.quarterlyObjective || "").trim();
  const period = settings.objectivePeriod || currentQuarterLabel();
  const status = performanceObjectiveStatusLabel(settings.objectiveStatus || "active");
  const reminderEnabled = Boolean(settings.reminderEnabled);
  const nextReminder = settings.nextReminderAt || nextWeekdayIso(settings.reminderWeekday || "monday");
  return `
    <section class="coach-objective-strip ${objective ? "" : "empty"}">
      <div>
        <span>Objectif coach</span>
        <strong>${objective ? escapeHtml(objective) : "Aucun objectif defini"}</strong>
        <small>${escapeHtml(period)} · ${escapeHtml(status)}${reminderEnabled ? ` · rappel ${escapeHtml(formatDate(nextReminder))}` : ""}</small>
      </div>
      <button class="secondary" data-action="openPerformanceObjective">Modifier</button>
    </section>
  `;
}

function renderActiveTab() {
  if (!state.selectedCoachId) return renderGuide();
  if (state.tab === "todo") return renderTodo();
  if (state.tab === "clients") return renderClients();
  if (state.tab === "questionnaires") return renderQuestionnaires();
  if (state.tab === "rebooking") return renderRebooking();
  if (state.tab === "performance") return renderPerformance();
  if (state.tab === "alumni") return renderAlumni();
  if (state.tab === "accomplishments") return renderAccomplishments();
  if (state.tab === "training") return renderTraining();
  if (state.tab === "assistant" && isInfoAdmin()) return renderAssistant();
  if (state.tab === "admin" && isInfoAdmin()) return renderAdmin();
  return renderGuide();
}

function renderTodo() {
  const activeFilter = state.filter.todo || "all";
  const allTasks = state.data.tasks.filter(isOpenTask);
  const activeGroupKey = activeFilter === "group" ? String(state.filter.todoGroupKey || "") : "";
  const tasks = activeGroupKey
    ? allTasks.filter((task) => todoClientGroupKey(task) === activeGroupKey)
    : allTasks;
  const filteredTasks = activeFilter === "group"
    ? tasks
    : tasks.filter((task) => todoTaskMatchesFilter(task, activeFilter));
  const visibleTasks = applySearch(filteredTasks, "todo");
  const filterOptions = [
    ...(activeGroupKey ? [["group", `Actions de ${tasks[0]?.clientName || "ce client"}`, tasks.length]] : []),
    ["all", "Toutes les taches", allTasks.length],
    ["urgent", "Urgent", allTasks.filter((task) => todoTaskMatchesFilter(task, "urgent")).length],
    ["validation", "A confirmer", allTasks.filter((task) => todoTaskMatchesFilter(task, "validation")).length],
    ["program", "Programmes", allTasks.filter((task) => todoTaskMatchesFilter(task, "program")).length],
    ["rebooking", "Rebookings", allTasks.filter((task) => todoTaskMatchesFilter(task, "rebooking")).length],
    ["questionnaire", "Questionnaires", allTasks.filter((task) => todoTaskMatchesFilter(task, "questionnaire")).length],
    ["manual", "Notes coach", allTasks.filter((task) => todoTaskMatchesFilter(task, "manual")).length]
  ].filter(([value, , count]) => value === "all" || count > 0 || value === activeFilter);

  return `
    ${panel("To-do du coach", "Priorise seulement les actions concretes. Une carte = une decision.", `
      ${renderCoachDataNotice({ compact: true })}
      ${renderTodoCommandFocus(allTasks)}
      <div class="todo-view-controls">
        ${filterSelect("todo", "Afficher", filterOptions)}
        ${renderSearchBox("todo", "Rechercher une mission", "Nom client, programme, questionnaire, rebooking...", filteredTasks.length, visibleTasks.length)}
      </div>
      ${renderTodoCards(visibleTasks, activeFilter)}
    `)}
  `;
}

function renderTodoCommandFocus(tasks) {
  if (!tasks.length) return "";
  const nextTask = [...tasks].sort(sortTasks)[0];

  return `
    <section class="todo-command-focus">
      <div>
        <span>Prochaine action</span>
        <strong>${escapeHtml(todoTaskOneLine(nextTask))}</strong>
      </div>
    </section>
  `;
}

function renderTodoCards(tasks, activeFilter) {
  const searchActive = Boolean(searchTerm("todo"));
  if (activeFilter !== "all" || searchActive) {
    return renderCards(tasks, renderTaskCard, searchEmptyMessage("todo", todoFilterEmptyMessage(activeFilter)));
  }

  const clientGroups = todoClientTaskGroups(tasks).filter((group) => group.items.length > 1);
  const groupedTaskIds = new Set(clientGroups.flatMap((group) => group.items.map(todoTaskIdentity)));
  const remainingTasks = tasks.filter((task) => !groupedTaskIds.has(todoTaskIdentity(task)));
  const programTasks = remainingTasks.filter((task) => task.type === "program" && !isStarredTask(task));
  const shouldGroupPrograms = programTasks.length >= 8;
  const groupedProgramIds = new Set(shouldGroupPrograms ? programTasks.map(todoTaskIdentity) : []);

  const entries = [
    ...clientGroups.map((group) => ({ index: group.firstIndex, html: renderTodoClientGroupCard(group) })),
    ...(shouldGroupPrograms ? [{ index: Math.min(...programTasks.map((task) => tasks.indexOf(task))), html: renderTodoProgramGroupCard(programTasks) }] : []),
    ...remainingTasks
      .filter((task) => !groupedProgramIds.has(todoTaskIdentity(task)))
      .map((task) => ({ index: tasks.indexOf(task), html: renderTaskCard(task) }))
  ].sort((a, b) => a.index - b.index);

  const cards = entries.map((entry) => entry.html).join("");
  return cards ? `<div class="cards">${cards}</div>` : renderCards([], renderTaskCard, todoFilterEmptyMessage(activeFilter));
}

function todoClientTaskGroups(tasks) {
  const groups = new Map();
  tasks.forEach((task, index) => {
    const key = todoClientGroupKey(task);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        clientId: task.clientId || "",
        clientName: task.clientName || task.title || "Client",
        firstIndex: index,
        items: []
      });
    }
    const group = groups.get(key);
    group.items.push(task);
    if (task.clientName && (!group.clientName || group.clientName === "Client")) group.clientName = task.clientName;
    if (task.clientId && !group.clientId) group.clientId = task.clientId;
    group.firstIndex = Math.min(group.firstIndex, index);
  });
  return [...groups.values()];
}

function todoClientGroupKey(task) {
  if (!task.clientId) return "";
  return `id:${task.clientId}`;
}

function todoTaskIdentity(task) {
  return task?.id || `${task?.clientId || ""}:${task?.type || ""}:${task?.title || ""}:${task?.dueAt || ""}`;
}

function renderTodoClientGroupCard(group) {
  const sorted = [...group.items].sort(sortTasks);
  const topTask = sorted[0];
  const dueAt = sorted.map((task) => task.dueAt).filter(Boolean).sort((a, b) => dateValue(a) - dateValue(b))[0] || "";
  const urgentCount = sorted.filter((task) => task.priority === "P1").length;
  const starredCount = sorted.filter(isStarredTask).length;
  const typeCounts = todoGroupTypeCounts(sorted);
  const typeLabels = typeCounts.slice(0, 3).map(([label, count]) => `${count} ${label}`).join(" · ");

  return `
    <article class="card operational-card task-card ${urgentCount ? "urgent" : ""} ${starredCount ? "starred" : ""} task-group-card">
      <div class="operational-card-main">
        <button class="link-title" data-action="openClient" data-id="${escapeHtml(group.clientId || "")}" ${group.clientId ? "" : "disabled"}>
          ${escapeHtml(group.clientName || "Client")}
        </button>
        <h4>${Number(group.items.length || 0)} actions regroupees</h4>
        <div class="operational-meta-line">
          <span class="operational-meta-primary">${starredCount ? `&#9733; ${starredCount} · ` : ""}${urgentCount ? `${urgentCount} urgente${urgentCount > 1 ? "s" : ""} · ` : ""}${dueAt ? `Prochaine: ${formatDate(dueAt)}` : "Date a verifier"}</span>
          <span>${typeLabels ? escapeHtml(typeLabels) : escapeHtml(taskDisplayTitle(topTask) || "Mission")}</span>
        </div>
      </div>
      <div class="card-actions operational-actions">
        <button class="primary" data-action="focusTodoClient" data-group-key="${escapeAttr(group.key)}" data-query="${escapeAttr(group.clientName || group.clientId || "")}" type="button">Voir ses actions</button>
      </div>
    </article>
  `;
}

function todoGroupTypeCounts(tasks) {
  const counts = new Map();
  tasks.forEach((task) => {
    const label = taskTypeLabel(task.type) || taskDisplayTitle(task) || "mission";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderTodoProgramGroupCard(programTasks) {
  const sorted = [...programTasks].sort((a, b) => dateValue(a.dueAt) - dateValue(b.dueAt));
  const oldestDue = sorted.find((task) => task.dueAt)?.dueAt || "";
  const previewNames = sorted.slice(0, 5).map((task) => task.clientName || "Client").join(", ");
  const extra = Math.max(0, sorted.length - 5);
  return `
    <article class="card operational-card task-card urgent task-group-card">
      <div class="operational-card-main">
        <h4>Programmes en retard</h4>
        <div class="operational-meta-line">
          <span class="operational-meta-primary">${Number(programTasks.length || 0)} clients${oldestDue ? ` · plus ancien: ${formatDate(oldestDue)}` : ""}</span>
          <span>${escapeHtml(previewNames)}${extra ? ` + ${extra}` : ""}</span>
        </div>
      </div>
      <div class="card-actions operational-actions">
        <button class="primary" data-filter="todo" data-value="program" type="button">Voir programmes</button>
      </div>
    </article>
  `;
}

function renderTodoFilterButton(value, label, count, activeFilter) {
  const active = value === activeFilter;
  return `
    <button class="bucket bucket-button ${active ? "active" : ""}" data-filter="todo" data-value="${escapeAttr(value)}" type="button">
      <strong>${Number(count || 0)}</strong>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function todoTaskMatchesFilter(task, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "group") return true;
  if (filter === "starred") return isStarredTask(task);
  if (filter === "urgent") return task.priority === "P1";
  if (filter === "validation") return task.type === "validation";
  if (filter === "program") return task.type === "program";
  if (filter === "rebooking") return task.type === "rebooking";
  if (filter === "questionnaire") return task.type === "questionnaire_followup";
  if (filter === "manual") return isCoachNoteTask(task);
  return true;
}

function isCoachNoteTask(task) {
  return task?.type === "coach_note" || task?.type === "manual";
}

function todoFilterEmptyMessage(filter) {
  if (!filter || filter === "all") return todoEmptyMessage();
  if (filter === "group") return "Aucune mission pour ce client.";
  return "Aucune mission dans ce filtre.";
}

function renderTodoImportDiagnostic(tasks) {
  if (!isInfoAdmin()) return "";
  const context = syncContextForCoach();
  const importedTasks = context?.selected?.diagnostics?.importedTasks || state.data.syncStatus?.diagnostics?.importedTasks || {};
  const staleCleanup = context?.selected?.diagnostics?.staleCleanup || state.data.syncStatus?.diagnostics?.staleCleanup || {};
  const byType = importedTasks.byType || {};
  const visibleBySource = taskSourceSummary(tasks);
  const programCount = Number(byType.program || 0);
  const visibleProgramSources = tasks
    .filter((task) => task.type === "program")
    .reduce((summary, task) => {
      const source = cleanDisplayKey(task.source || "sans_source");
      summary[source] = Number(summary[source] || 0) + 1;
      return summary;
    }, {});
  const sampleProgramTasks = Array.isArray(importedTasks.sampleProgramTasks) ? importedTasks.sampleProgramTasks.slice(0, 5) : [];
  const tasksImported = Number(context?.selected?.tasksImported ?? state.data.syncStatus?.tasksImported ?? importedTasks.total ?? 0);
  const explicitRows = Number(importedTasks.explicitTaskRowsMatched || 0);
  const sourceRows = Number(importedTasks.sourceTaskRowsAvailable || 0);
  const staleArchived = Number(staleCleanup.tasksArchivedStale || 0);
  const sourceVisible = Number(visibleBySource.google_sheets_tasks_current || 0);
  const manualVisible = Number(visibleBySource.manual || 0) + Number(visibleBySource.dashboard_manual || 0) + Number(visibleBySource.firebase_app_manual || 0);
  const questionnaireVisible = Number(byType.questionnaire_followup || 0);
  const unexplainedVisible = Math.max(0, tasks.length - sourceVisible - manualVisible - questionnaireVisible);
  const needsAttention = programCount >= 10 || unexplainedVisible > 0 || tasks.length > tasksImported + manualVisible + questionnaireVisible;
  if (!programCount && !explicitRows && !sourceRows && !staleArchived && !tasks.length) return "";
  const className = needsAttention ? "notice compact warning" : "notice compact";
  return `
    <div class="${className}">
      <strong>Diagnostic To-do</strong>
      <span>
        ${tasks.length} action(s) visible(s). Source TASKS_Current: ${explicitRows}/${sourceRows} ligne(s) matchee(s),
        ${tasksImported} tache(s) importee(s), ${staleArchived} ancienne(s) tache(s) archivee(s).
      </span>
      <small>
        Visibles par source: ${Object.entries(visibleBySource).map(([source, count]) => `${escapeHtml(source)} ${count}`).join(" | ") || "aucune"}.
        Programmes visibles par source: ${Object.entries(visibleProgramSources).map(([source, count]) => `${escapeHtml(source)} ${count}`).join(" | ") || "aucun"}.
        Questionnaires: ${Number(byType.questionnaire_followup || 0)}.
      </small>
      <div class="todo-source-guidance">
        <strong>Lecture rapide</strong>
        <span>${escapeHtml(todoSourceGuidance({ tasks, sourceVisible, manualVisible, questionnaireVisible, unexplainedVisible, programCount, visibleProgramSources }))}</span>
      </div>
      <div class="todo-source-guidance secondary">
        <strong>Contrat source</strong>
        <span>CoachRx alimente le portefeuille client et le contexte programme. Une carte To-do apparait seulement si une source d'action existe: TASKS_Current, questionnaire, rebooking ou note coach.</span>
      </div>
      ${sampleProgramTasks.length ? `
        <div class="diagnostic-samples">
          <strong>Exemples programmes importes de TASKS_Current</strong>
          ${sampleProgramTasks.map((task) => `
          <span>${escapeHtml(task.title || "Programme")} ${task.clientName ? `- ${escapeHtml(task.clientName)}` : ""}</span>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function todoSourceGuidance({ tasks, sourceVisible, manualVisible, questionnaireVisible, unexplainedVisible, programCount, visibleProgramSources = {} }) {
  if (!tasks.length) return "Aucune action ouverte: le coach peut travailler sans bruit de To-do.";
  if (unexplainedVisible > 0) return `${unexplainedVisible} action(s) visible(s) n'ont pas une source reconnue. A valider avant de conclure que CoachRx cree ces taches.`;
  if (programCount > 0) {
    const sources = Object.entries(visibleProgramSources).map(([source, count]) => `${source} ${count}`).join(", ");
    return `Les taches programme visibles sont des actions, pas seulement des dates CoachRx affichees en contexte.${sources ? ` Sources visibles: ${sources}.` : ""}`;
  }
  if (sourceVisible > 0) return "Les actions importees viennent de TASKS_Current et representent une decision humaine/source, pas une deduction automatique CoachRx brute.";
  if (questionnaireVisible > 0) return "Les actions questionnaire viennent seulement de reponses qui demandent une action coach.";
  if (manualVisible > 0) return "Les actions visibles sont surtout des notes ou suivis crees manuellement dans le dashboard.";
  return "Les actions visibles sont filtrees: seules les taches open/waiting et non archivees restent dans la To-do.";
}

function taskSourceSummary(tasks) {
  return tasks.reduce((summary, task) => {
    const source = cleanDisplayKey(task.source || task.type || "sans_source");
    summary[source] = Number(summary[source] || 0) + 1;
    return summary;
  }, {});
}

function cleanDisplayKey(value) {
  return String(value || "sans_source").trim().replace(/\s+/g, "_").slice(0, 48) || "sans_source";
}

function renderClients() {
  const clients = activeClients();
  const visibleClients = applySearch(clients, "clients");
  return panel("Portefeuille clients", "Cherche un client, ouvre sa fiche, puis pose l'action utile.", `
    ${renderCoachDataNotice()}
    ${renderSearchBox("clients", "Rechercher un client", "Nom, telephone, membership, programme...", clients.length, visibleClients.length)}
    ${renderCards(visibleClients, renderClientCard, searchEmptyMessage("clients", "Aucun client actif charge pour ce coach. Synchronise la source ou ajoute un client manuel."))}
  `);
}

function renderQuestionnaires() {
  const responses = portfolioQuestionnaireResponses();
  const rawReadable = questionnaireResponsesToRead();
  const rawUnmatched = uniqueById([
    ...responses.filter((item) => (item.processingStatus || "") === "unmatched"),
    ...questionnaireResponsesForAdminReview()
  ]);
  const sentWaiting = questionnaireSendsWaitingForResponse();
  const schedules = portfolioQuestionnaireSchedules();
  const activeSchedules = schedules.filter((schedule) => (schedule.status || "active") === "active");
  const rawArchived = responses.filter((item) => ["read", "archived", "validated"].includes(item.processingStatus));
  const recentSends = recentQuestionnaireSends();
  const sendClients = selectableClientsForCoach().sort(sortQuestionnaireSendClients);
  const active = state.filter.questionnaire;
  const triageFilter = "all";
  const triageApplies = false;
  const readable = triageApplies ? applyQuestionnaireTriageFilter(rawReadable, triageFilter) : rawReadable;
  const unmatched = triageApplies ? applyQuestionnaireTriageFilter(rawUnmatched, triageFilter) : rawUnmatched;
  const archived = triageApplies ? applyQuestionnaireTriageFilter(rawArchived, triageFilter) : rawArchived;

  const views = {
    to_read: groupQuestionnaireResponsesForCoach(readable),
    send: sendClients,
    scheduled: schedules,
    followup: sentWaiting.sort((a, b) => questionnaireSendDate(a) - questionnaireSendDate(b)),
    validate: sortQuestionnaireResponsesByPriority(unmatched),
    archives: groupQuestionnaireResponsesForCoach(archived)
  };
  const items = views[active] || readable;
  const visibleItems = applySearch(items, "questionnaires");

  return panel("Questionnaires", "Lis, envoie ou planifie les suivis clients.", `
    ${filterSelect("questionnaire", "Vue suivi", [
      ["to_read", "A lire", rawReadable.length],
      ["send", "Envoyer", sendClients.length],
      ["scheduled", "Automatisations", activeSchedules.length],
      ["followup", "Relances", sentWaiting.length],
      ["validate", "A valider", rawUnmatched.length],
      ["archives", "Archives", rawArchived.length]
    ])}
    ${active === "send" ? renderQuestionnaireSendAudit(recentSends) : ""}
    ${renderSearchBox("questionnaires", "Rechercher dans cette vue", "Nom, telephone, priorite, reponse, planification...", items.length, visibleItems.length)}
    ${active === "send"
      ? renderCards(visibleItems, renderQuestionnaireSendClientCard, searchEmptyMessage("questionnaires", "Aucun client disponible pour envoyer un questionnaire."))
      : active === "scheduled"
        ? renderCards(visibleItems, renderQuestionnaireScheduleCard, searchEmptyMessage("questionnaires", "Aucune automatisation creee. Va dans Envoyer maintenant, puis choisis Gerer automatisation sur un client."))
      : active === "followup"
        ? renderCards(visibleItems, renderQuestionnaireFollowupCard, searchEmptyMessage("questionnaires", "Aucun questionnaire envoye sans reponse."))
        : active === "validate"
          ? `
            ${renderQuestionnaireValidationNotice(rawUnmatched)}
            ${renderCards(visibleItems, renderUnmatchedQuestionnaireCard, searchEmptyMessage("questionnaires", "Aucune reponse a valider."))}
          `
          : renderCards(visibleItems, renderQuestionnaireItemCard, searchEmptyMessage("questionnaires", "Aucun element dans cette vue."))}
  `);
}

function renderQuestionnaireInboxSummary({ readable, sentWaiting, recentSends, sendClients, schedules = [], triageApplies }) {
  const triage = questionnaireTriageCounts(readable);
  const sendReady = sendClients.filter(clientPhone).length;
  const errors = recentSends.filter((send) => send.status === "error").length;
  const isAdminView = isInfoAdmin();
  const triageFilters = triageApplies && readable.length ? `
    <section class="questionnaire-priority-strip" aria-label="Filtrer les reponses par priorite">
      <span>Priorite</span>
      ${questionnaireTriageFilterButton("all", "Toutes", readable.length)}
      ${triage.rouge ? questionnaireTriageFilterButton("rouge", "Contact rapide", triage.rouge) : ""}
      ${triage.orange ? questionnaireTriageFilterButton("orange", "Discussion", triage.orange) : ""}
      ${triage.jaune ? questionnaireTriageFilterButton("jaune", "Ajustement", triage.jaune) : ""}
      ${triage.vert ? questionnaireTriageFilterButton("vert", "Stable", triage.vert) : ""}
    </section>
  ` : "";
  if (!isAdminView) return "";
  return `
    <section class="questionnaire-inbox-summary compact">
      ${diagnosticMetric("A lire", readable.length, null, "reponses clients")}
      ${diagnosticMetric("A relancer", sentWaiting.length, null, "7 jours sans reponse")}
      ${diagnosticMetric("Automatisations", schedules.length, null, "envois recurrents")}
      ${diagnosticMetric("Prets", sendReady, null, "clients avec telephone")}
      ${diagnosticMetric("Erreurs envoi", errors, null, "GHL ou telephone")}
    </section>
    ${triageFilters}
  `;
}

function questionnaireTriageFilterButton(value, label, count) {
  const active = (state.filter.questionnaireTriage || "all") === value;
  const className = `chip triage-${value} ${active ? "active" : ""}`;
  return `<button class="${className}" data-filter="questionnaireTriage" data-value="${value}">${label} <span>${count}</span></button>`;
}

function rebookingVolumeNeedsReview(value) {
  const sessions = Number(value || 0);
  return Number.isFinite(sessions) && sessions >= REBOOKING_VOLUME_REVIEW_THRESHOLD;
}

function renderRebooking() {
  const rawItems = portfolioRebookings();
  const items = groupRebookingsForCoachView(rawItems);
  const openItems = items.filter((item) => item.status === "open");
  const views = {
    open: openItems,
    managed: items.filter((item) => item.status === "managed"),
    rebooked: items.filter((item) => item.status === "rebooked"),
    coach_absence: items.filter((item) => item.status === "coach_absence"),
    history: items.filter((item) => item.status !== "open")
  };
  const active = state.filter.rebooking === "to_confirm" ? "open" : (state.filter.rebooking || "open");
  const activeItems = views[active] || views.open;
  const visibleItems = applySearch(activeItems, "rebooking");
  return panel("Rebooking", "Garde seulement les seances payees qui doivent encore etre remises.", `
    ${renderRebookingCoachFocus(items)}
    <div class="toolbar rebooking-toolbar">
      <button class="primary" data-action="openRebookingForm">Ajouter une seance a remettre</button>
      <button class="secondary" data-action="openRebookingAbsenceFlow">Vacances / absence coach</button>
    </div>
    ${isInfoAdmin() ? renderRebookingImportDiagnostic(rawItems) : ""}
    ${filterSelect("rebooking", "Vue rebooking", [
      ["open", "A traiter", views.open.length],
      ["managed", "Suivis faits", views.managed.length],
      ["rebooked", "Seances rebookees", views.rebooked.length],
      ["coach_absence", "Absences coach", views.coach_absence.length],
      ["history", "Historique", views.history.length]
    ])}
    ${renderSearchBox("rebooking", "Rechercher un rebooking", "Nom client, statut, note, service...", activeItems.length, visibleItems.length)}
    ${renderCards(visibleItems, renderRebookingCard, searchEmptyMessage("rebooking", "Aucune seance a remettre dans cette vue."))}
  `, "rebooking-panel");
}

function groupRebookingsForCoachView(items) {
  const grouped = new Map();
  const output = [];
  items.forEach((item) => {
    const status = rebookingStatus(item);
    const clientKey = rebookingDisplayGroupKey(item);
    if (status !== "open" || !clientKey) {
      output.push({ ...item, relatedRebookingIds: [item.id] });
      return;
    }
    const key = `${item.coachId || state.selectedCoachId}|${status}|${clientKey}`;
    const existing = grouped.get(key);
    if (!existing) {
      const base = {
        ...item,
        status,
        sessionsToRebook: Math.max(1, Number(item.sessionsToRebook || 1)),
        groupedSourceCount: Math.max(1, Number(item.groupedSourceCount || 1)),
        relatedRebookingIds: [item.id],
        relatedRebookingNames: [item.clientName || ""].filter(Boolean),
        sourceEventIds: normalizedRebookingSourceIds(item),
        cancellationDates: rebookingCancellationDates(item),
        clientConfirmedAt: item.clientConfirmedAt || "",
        clientConfirmedBy: item.clientConfirmedBy || "",
        displayNeedsConfirmation: rebookingHasWeakClientLink(item)
      };
      grouped.set(key, base);
      output.push(base);
      return;
    }
    existing.sessionsToRebook += Math.max(1, Number(item.sessionsToRebook || 1));
    existing.groupedSourceCount += Math.max(1, Number(item.groupedSourceCount || 1));
    existing.relatedRebookingIds = uniqueStrings([...(existing.relatedRebookingIds || []), item.id]);
    existing.relatedRebookingNames = uniqueStrings([...(existing.relatedRebookingNames || []), item.clientName || ""]);
    existing.sourceEventIds = uniqueStrings([...(existing.sourceEventIds || []), ...normalizedRebookingSourceIds(item)]);
    existing.cancellationDates = uniqueDateStrings([...(existing.cancellationDates || []), ...rebookingCancellationDates(item)]);
    existing.displayNeedsConfirmation = existing.displayNeedsConfirmation || rebookingHasWeakClientLink(item);
    existing.clientId = existing.clientId || item.clientId || "";
    existing.clientPhoneNormalized = existing.clientPhoneNormalized || item.clientPhoneNormalized || "";
    existing.clientConfirmedAt = existing.clientConfirmedAt || item.clientConfirmedAt || "";
    existing.clientConfirmedBy = existing.clientConfirmedBy || item.clientConfirmedBy || "";
    existing.matchMethod = rebookingGroupMatchMethod(existing.matchMethod, item.matchMethod);
    existing.note = [existing.note, item.note].filter(Boolean)[0] || "";
    existing.statusNote = [existing.statusNote, item.statusNote].filter(Boolean)[0] || "";
  });
  return output;
}

function rebookingDisplayGroupKey(item) {
  const clientId = cleanString(item.clientId);
  if (clientId) return `client:${clientId}`;
  const phone = normalizePhone(item.clientPhoneNormalized || item.clientPhone || item.phone);
  if (phone) return `phone:${phone}`;
  const name = normalizeComparable(item.clientName || item.name || "");
  if (!name || name.length < 4) return "";
  return `name:${name}`;
}

function normalizedRebookingSourceIds(item) {
  return uniqueStrings([
    ...(Array.isArray(item.sourceEventIds) ? item.sourceEventIds : []),
    item.sourceEventId,
    item.sourceRebookEventId,
    item.sourceRowKey,
    item.id
  ]);
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function uniqueDateStrings(values) {
  const unique = uniqueStrings(values);
  return unique.sort((a, b) => dateValue(a) - dateValue(b));
}

function rebookingCancellationDates(rebooking) {
  if (!rebooking || typeof rebooking !== "object") return [];
  return uniqueDateStrings([
    ...(Array.isArray(rebooking.cancellationDates) ? rebooking.cancellationDates : []),
    rebooking.appointmentAt,
    rebooking.cancelledAt,
    rebooking.canceledAt,
    rebooking.cancellationDate,
    rebooking.cancelledDate,
    rebooking.classCancelledAt,
    rebooking.sessionDate
  ]);
}

function rebookingCancellationDateSummary(rebooking, limitCount = 3) {
  const dates = rebookingCancellationDates(rebooking);
  if (!dates.length) return "";
  const visible = dates.slice(0, limitCount).map((date) => formatDate(date));
  const remaining = dates.length - visible.length;
  return `${visible.join(", ")}${remaining > 0 ? ` + ${remaining} autre${remaining > 1 ? "s" : ""}` : ""}`;
}

function rebookingGroupMatchMethod(current, next) {
  const rank = { phone: 1, existing: 2, manual_client: 3, name: 4, manual_unmatched: 5, unmatched: 6, unknown: 7 };
  const a = current || "unknown";
  const b = next || "unknown";
  return (rank[b] || 99) > (rank[a] || 99) ? b : a;
}

function renderRebookingOperationalSummary(items) {
  const openItems = items.filter((item) => (item.status || "open") === "open");
  const sessions = openItems.reduce((sum, item) => sum + Math.max(1, Number(item.sessionsToRebook || 1)), 0);
  const text = sessions
    ? `${sessions} seance${sessions > 1 ? "s" : ""} a remettre. Ferme chaque dossier avec le bon statut.`
    : "Aucune seance a remettre pour ce coach.";
  return `
    <section class="rebooking-summary-strip">
      <strong>File rebooking</strong>
      <span>${escapeHtml(text)}</span>
    </section>
  `;
}

function renderRebookingCoachFocus(items) {
  const openItems = items.filter((item) => (item.status || "open") === "open");
  const sessions = openItems.reduce((sum, item) => sum + Math.max(1, Number(item.sessionsToRebook || 1)), 0);
  const volumeReviewCount = openItems.filter((item) => rebookingVolumeNeedsReview(item.sessionsToRebook)).length;
  const clients = new Set(openItems.map((item) => item.clientId || normalizeComparable(item.clientName)).filter(Boolean)).size;
  const grouped = openItems.filter((item) => Number(item.groupedSourceCount || 0) > 1).length;
  const rebooked = items.filter((item) => item.status === "rebooked").length;
  const managed = items.filter((item) => item.status === "managed").length;
  const absence = items.filter((item) => item.status === "coach_absence").length;
  const nextAction = openItems.length
    ? "Rebooke, fais le suivi, ou classe en absence coach."
    : "Rien a traiter maintenant.";
  return `
    <section class="rebooking-coach-focus" aria-label="Resume rebooking coach">
      <div class="rebooking-focus-main">
        <strong>${escapeHtml(nextAction)}</strong>
        <span>${openItems.length ? `${clients} client(s), ${sessions} seance(s) a remettre${grouped ? `, ${grouped} dossier(s) regroupes` : ""}.` : "Ajoute une seance manuellement si un oubli apparait."}</span>
        ${volumeReviewCount ? `<span class="pill amber">${volumeReviewCount} volume${volumeReviewCount > 1 ? "s" : ""} a verifier</span>` : ""}
      </div>
      <div class="rebooking-focus-metrics">
        <button class="${(state.filter.rebooking || "open") === "open" ? "active" : ""}" data-filter="rebooking" data-value="open">
          <strong>${sessions}</strong>
          <span>seances ouvertes</span>
        </button>
        <button class="${state.filter.rebooking === "history" ? "active" : ""}" data-filter="rebooking" data-value="history">
          <strong>${rebooked + managed + absence}</strong>
          <span>suivis fermes</span>
        </button>
      </div>
    </section>
  `;
}

function renderRebookingWorkloadSummary(items, activeView) {
  if (activeView !== "open" || !items.length) return "";
  const sessions = items.reduce((sum, item) => sum + Math.max(1, Number(item.sessionsToRebook || 1)), 0);
  const clients = new Set(items.map((item) => item.clientId || normalizeComparable(item.clientName)).filter(Boolean)).size;
  return `
    <div class="notice compact rebooking-workload">
      <strong>${sessions} seance(s) a remettre</strong>
      <span>${clients} client(s) concerne(s). Rebooke, ajuste ou ferme selon le suivi reel.</span>
    </div>
  `;
}

function renderRebookingImportDiagnostic(items) {
  const isAdminView = isInfoAdmin();
  const context = syncContextForCoach();
  const imported = context?.selected?.diagnostics?.importedRebookings || {};
  const byStatus = imported.byStatus || {};
  const bySource = imported.bySource || {};
  const byMatchMethod = imported.byMatchMethod || {};
  const samples = Array.isArray(imported.sampleOpen) ? imported.sampleOpen : [];
  const sourceRowsAvailable = Number(imported.sourceRowsAvailable || 0);
  const sourceRowsMatched = Number(imported.sourceRowsMatched || 0);
  const taskRowsMatched = Number(imported.taskRowsMatched || 0);
  const sourceRowsWithPhone = Number(imported.sourceRowsWithPhone || 0);
  const sourceRowsWithoutPhone = Number(imported.sourceRowsWithoutPhone || 0);
  const missingClientId = Number(imported.missingClientId || 0);
  const openMissingClientId = Number(imported.openMissingClientId || 0);
  const missingPhone = Number(imported.missingPhone || 0);
  const protectedStatusKept = Number(imported.protectedStatusKept || 0);
  const open = byStatus.open ?? items.filter((item) => (item.status || "open") === "open").length;
  const treated = Number(imported.treated ?? items.filter((item) => item.status && item.status !== "open").length);
  const needsAttention = missingClientId || sourceRowsWithoutPhone || (sourceRowsAvailable && !sourceRowsMatched);
  const sourceNote = isAdminView
    ? `Source SRC_Rebookings_SemiPrive: ${sourceRowsMatched}/${sourceRowsAvailable} ligne(s) matchee(s). Les liens Apps Script avec token restent hors fichiers publics.`
    : "Les dossiers ci-dessous sont ceux a traiter ou a suivre dans l'historique.";
  const guidance = isAdminView
    ? rebookingNextStep({ sourceRowsAvailable, sourceRowsMatched, sourceRowsWithoutPhone, missingClientId, openMissingClientId, missingPhone })
    : rebookingCoachNextStep({ open, treated, openMissingClientId });
  return `
    <details class="rebooking-diagnostic ${needsAttention ? "warning" : ""}">
      <summary>Diagnostic source rebooking</summary>
      <div class="diagnostic-grid">
        ${diagnosticMetric("A traiter", open, null, "ouverts")}
        ${diagnosticMetric("Traites / historique", treated, null, "suivi fait, rebooke, absence")}
        ${diagnosticMetric("Source rebooking", sourceRowsAvailable, sourceRowsMatched)}
        ${diagnosticMetric("Taches rebooking", taskRowsMatched, null, "depuis TASKS_Current")}
        ${diagnosticMetric("Telephones source", sourceRowsMatched, sourceRowsWithPhone, "lignes source avec telephone")}
        ${diagnosticMetric("Non relies client", missingClientId, null, "telephone/nom a valider")}
        ${diagnosticMetric("Sans telephone", missingPhone, null, "matching moins fiable")}
        ${protectedStatusKept ? diagnosticMetric("Statuts proteges", protectedStatusKept, null, "non rouverts par import") : ""}
      </div>
      <p class="meta">${escapeHtml(sourceNote)}</p>
      ${renderRebookingSourceBreakdown({ bySource, byMatchMethod, samples })}
      <div class="rebooking-guidance">
        <strong>Action recommandee</strong>
        <span>${escapeHtml(guidance)}</span>
      </div>
      ${needsAttention ? `
        <div class="warning-list compact-warning">
          ${sourceRowsAvailable && !sourceRowsMatched ? `<p>Aucune ligne source rebooking ne matche ce coach. Verifier le nom coach ou l'ID CoachRx dans la source.</p>` : ""}
          ${sourceRowsWithoutPhone ? `<p>${sourceRowsWithoutPhone} ligne(s) source matchee(s) n'ont pas de telephone. Le matching depend donc du nom et doit etre valide.</p>` : ""}
          ${missingClientId ? `<p>${missingClientId} rebooking(s), dont ${openMissingClientId} ouvert(s), doivent etre relies a une fiche client pour ouvrir le bon dossier depuis la carte.</p>` : ""}
        </div>
      ` : ""}
    </details>
  `;
}

function rebookingCoachNextStep({ open, treated, openMissingClientId }) {
  if (open > 0) {
    if (openMissingClientId > 0) return "Traite les dossiers ouverts. Si la fiche client n'est pas claire, confirme le client avant de fermer le dossier.";
    return "Traite les dossiers ouverts, puis utilise l'historique ou Reouvrir si une action a ete faite par erreur.";
  }
  if (treated > 0) return "Aucun dossier ouvert. L'historique reste disponible pour verifier ou rouvrir un dossier.";
  return "Aucun rebooking a traiter pour ce coach.";
}

function rebookingNextStep({ sourceRowsAvailable, sourceRowsMatched, sourceRowsWithoutPhone, missingClientId, openMissingClientId, missingPhone }) {
  if (!sourceRowsAvailable) return "Aucune ligne source rebooking detectee pour ce coach. Confirmer que la source est alimentee avant de corriger le dashboard.";
  if (!sourceRowsMatched) return "Des lignes existent, mais aucune ne matche ce coach. Verifier le nom du coach dans la source rebooking ou l'alias associe.";
  if (sourceRowsWithoutPhone) return "Completer les telephones dans la source rebooking pour rendre le matching client fiable.";
  if (openMissingClientId) return `Relier ${openMissingClientId} rebooking(s) ouvert(s) a une fiche client pour que le coach puisse ouvrir le bon dossier.`;
  if (missingClientId || missingPhone) return "Les rebookings sont importes, mais certains liens client restent a valider. Prioriser ceux ouverts.";
  return "Les rebookings sont lisibles: traiter les ouverts, puis utiliser l'historique ou Reouvrir si une action a ete faite par erreur.";
}

function renderRebookingSourceBreakdown({ bySource = {}, byMatchMethod = {}, samples = [] }) {
  const sourceEntries = Object.entries(bySource).filter(([, count]) => Number(count || 0));
  const matchEntries = Object.entries(byMatchMethod).filter(([, count]) => Number(count || 0));
  if (!sourceEntries.length && !matchEntries.length && !samples.length) return "";
  return `
    <details class="rebooking-source-details">
      <summary>Voir origine et lien client</summary>
      <div class="pill-row">
        ${sourceEntries.map(([source, count]) => `<span class="pill">${escapeHtml(sourceLabel(source))}: ${Number(count || 0)}</span>`).join("")}
        ${matchEntries.map(([method, count]) => `<span class="pill ${method === "unmatched" ? "amber" : ""}">Lien ${escapeHtml(rebookingMatchLabel(method))}: ${Number(count || 0)}</span>`).join("")}
      </div>
      ${samples.length ? `
        <div class="rebooking-samples">
          ${samples.slice(0, 4).map((sample) => `
            <span>
              ${escapeHtml(sample.clientName || "Client a valider")}
              · ${escapeHtml(rebookingMatchLabel(sample.matchMethod))}
              · ${escapeHtml(sourceLabel(sample.source))}
              ${sample.appointmentAt || sample.detectedAt ? ` · ${formatDate(sample.appointmentAt || sample.detectedAt)}` : ""}
            </span>
          `).join("")}
        </div>
      ` : ""}
    </details>
  `;
}

function renderPerformance() {
  const settings = state.data.performanceSettings || {};
  const impacts = periodFiltered(portfolioImpacts(), "impactDate")
    .filter((impact) => impact.status !== "deleted");
  const confirmedImpacts = impacts.filter((impact) => impact.status === "confirmed");
  const draftImpacts = impacts.filter((impact) => !impact.status || impact.status === "draft");
  const cancelledImpacts = impacts.filter((impact) => impact.status === "cancelled");
  const checkups = periodFiltered(portfolioCheckups(), "checkupDate", { fallbackCreatedAt: false });
  const newClients = performanceNewClientItems();
  const lostClients = periodFiltered(state.data.clients.filter((client) => clientStatus(client) === "removed"), "updatedAt");
  const impactFilter = state.filter.performanceImpact || "all";
  const visibleImpacts = applyPerformanceImpactFilter(impacts, impactFilter);
  const periodLabel = performancePeriodLabel(state.filter.performancePeriod);
  const scorecard = { periodLabel, lostClients, newClients, checkups, confirmedImpacts, draftImpacts };
  return panel("Pilotage", "Objectifs, rencontres, points a discuter et indicateurs coach.", `
    ${renderPilotageWeeklyScorecard(scorecard)}
    ${renderPilotageObjectiveBlock(settings)}
    ${renderPilotageDiscussionBoard(settings)}
    ${renderPilotageMeetingNotes(settings)}
    <section class="pilotage-section pilotage-indicators">
      <div class="pilotage-section-head">
        <div>
          <h4>Indicateurs</h4>
          <p>Lecture commune des chiffres du coach. Les details restent accessibles au besoin.</p>
        </div>
        <button class="secondary" type="button" data-action="openImpactForm">Ajouter impact</button>
      </div>
      ${renderPerformanceCoachFocus(scorecard)}
      <div class="toolbar performance-toolbar">
        <label class="field-label compact">
          Periode
          <select class="input" data-action="selectPerformancePeriod">
            ${performancePeriodOptions().map(([value, label]) => `<option value="${value}" ${state.filter.performancePeriod === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="view-tabs performance-impact-tabs">
        ${filterButton("performanceImpact", "all", "Tous", impacts.length)}
        ${filterButton("performanceImpact", "draft", "A confirmer", draftImpacts.length)}
        ${filterButton("performanceImpact", "confirmed", "Confirmes", confirmedImpacts.length)}
        ${filterButton("performanceImpact", "cancelled", "Annules", cancelledImpacts.length)}
      </div>
      ${renderCards(visibleImpacts, renderImpactCard, performanceImpactEmptyMessage(impactFilter))}
    </section>
  `, "pilotage-panel");
}

function renderPilotageWeeklyScorecard({ periodLabel, lostClients, newClients, checkups, confirmedImpacts, draftImpacts }) {
  const openRebookings = portfolioRebookings().filter((item) => isOpenRebooking(item));
  const programTasks = state.data.tasks.filter((task) => isOpenTask(task) && isProgramTask(task));
  const questionnaireResponses = portfolioQuestionnaireResponses().filter((item) => item.status === "to_read" || item.processingStatus === "to_read");
  return `
    <section class="pilotage-section pilotage-weekly">
      <div class="pilotage-section-head">
        <div>
          <h4>Rencontre hebdo coach</h4>
          <p>Check-in, scorecard, IDS et actions a transformer en missions.</p>
        </div>
      </div>
      <div class="pilotage-agenda">
        <div class="pilotage-agenda-step">
          <span>1</span>
          <div>
            <strong>Check-in / Bright spots</strong>
            <p>Victoire de la semaine, impacts denombres et energie du coach.</p>
          </div>
        </div>
        <div class="pilotage-agenda-step">
          <span>2</span>
          <div>
            <strong>Scorecard</strong>
            <p>${escapeHtml(periodLabel)} · chiffres qui menent la discussion.</p>
          </div>
        </div>
        <div class="pilotage-agenda-step">
          <span>3</span>
          <div>
            <strong>IDS</strong>
            <p>Identifier, discuter, resoudre. Les vraies actions deviennent des missions.</p>
          </div>
        </div>
      </div>
      <div class="pilotage-scorecard-grid">
        ${renderPilotageScoreMetric("Programmations", programTasks.length, programTasks.length ? "a traiter" : "a jour", "programs")}
        ${renderPilotageScoreMetric("Rebooking", openRebookings.length, "seances ouvertes", "rebooking")}
        ${renderPilotageScoreMetric("Nouveaux clients", newClients.length, "cette periode", "newClients")}
        ${renderPilotageScoreMetric("Clients perdus", lostClients.length, "cette periode", "lostClients")}
        ${renderPilotageScoreMetric("Check-ups CSM", checkups.length, "recus", "checkups")}
        ${renderPilotageScoreMetric("Impacts", confirmedImpacts.length, `${draftImpacts.length} a confirmer`, "impacts")}
        ${renderPilotageScoreMetric("Questionnaires", questionnaireResponses.length, "a lire", "questionnaires")}
        ${renderPilotageScoreMetric("Horaires SP", "A valider", "couverture / conflits")}
      </div>
      ${renderPilotageResourceRow()}
    </section>
  `;
}

function renderPilotageScoreMetric(label, value, detail, metric = "") {
  const content = `
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
  `;
  if (metric) {
    const canOpen = metric === "newClients" || Number(value || 0) > 0;
    return `
      <button class="pilotage-score-metric drilldown" type="button" data-action="openPerformanceDetail" data-id="${escapeAttr(metric)}" ${canOpen ? "" : "disabled"}>
        ${content}
      </button>
    `;
  }
  return `
    <div class="pilotage-score-metric">
      ${content}
    </div>
  `;
}

function renderPilotageResourceRow() {
  return `
    <div class="pilotage-resource-row">
      <span>Ressources meeting</span>
      <a class="secondary button-link" href="${escapeAttr(CSM_PRIORITY_SHEET_URL)}" target="_blank" rel="noopener">Ouvrir document CSM</a>
      <a class="secondary button-link" href="${escapeAttr(PERFORMANCE_RENDEMENT_SHEET_URL)}" target="_blank" rel="noopener">Document rendement</a>
      <button class="secondary" type="button" data-action="openPerformanceNewClientManual">Ajouter nouveau client</button>
    </div>
  `;
}

function isOpenRebooking(rebooking) {
  return !["rebooked", "managed", "coach_absence", "archived", "deleted"].includes(String(rebooking?.status || "open"));
}

function isProgramTask(task) {
  const haystack = [
    task?.type,
    task?.source,
    task?.category,
    task?.title,
    task?.sourceSignal?.kind,
    task?.sourceSignal?.system
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return haystack.includes("program") || haystack.includes("programme") || haystack.includes("coachrx_exercise_due") || haystack.includes("coachrx_lifestyle_due");
}

function renderPilotageObjectiveBlock(settings) {
  const objective = String(settings.quarterlyObjective || "").trim();
  const period = settings.objectivePeriod || currentQuarterLabel();
  const status = performanceObjectiveStatusLabel(settings.objectiveStatus || "active");
  const note = String(settings.objectiveNote || "").trim();
  return `
    <section class="pilotage-section pilotage-objective">
      <div class="pilotage-section-head">
        <div>
          <h4>Objectif actuel</h4>
          <p>${escapeHtml(period)} · ${escapeHtml(status)}</p>
        </div>
        <button class="secondary" type="button" data-action="openPerformanceObjective">Modifier objectif</button>
      </div>
      <div class="pilotage-objective-card ${objective ? "" : "empty"}">
        <strong>${objective ? escapeHtml(objective) : "Aucun objectif defini"}</strong>
        ${note ? `<p>${escapeHtml(note)}</p>` : `<p>Definis le focus de developpement du coach pour guider les rencontres.</p>`}
      </div>
    </section>
  `;
}

function renderPilotageDiscussionBoard(settings) {
  const allItems = pilotageDiscussionItems(settings);
  const openItems = allItems.filter((item) => item.status !== "done" && item.status !== "archived");
  const doneItems = allItems.filter((item) => item.status === "done");
  const visibleItems = applySearch(openItems, "pilotageItems");
  return `
    <section class="pilotage-section">
      <div class="pilotage-section-head">
        <div>
          <h4>A discuter cette semaine</h4>
          <p>Points de rencontre. Transforme seulement les vraies actions en mission.</p>
        </div>
        <button class="primary compact" type="button" data-action="openPilotageItem">Ajouter un point</button>
      </div>
      ${renderSearchBox("pilotageItems", "Rechercher un point", "Client, sujet, objectif...", openItems.length, visibleItems.length)}
      <div class="pilotage-items">
        ${visibleItems.length ? visibleItems.map(renderPilotageItem).join("") : `<div class="empty small">${searchEmptyMessage("pilotageItems", "Aucun point a discuter pour cette semaine.")}</div>`}
      </div>
      ${doneItems.length ? `
        <details class="pilotage-done">
          <summary>Points discutes (${doneItems.length})</summary>
          <div class="pilotage-items compact-list">
            ${doneItems.slice(0, 8).map(renderPilotageItem).join("")}
          </div>
        </details>
      ` : ""}
    </section>
  `;
}

function renderPilotageItem(item) {
  const done = item.status === "done";
  const taskCreated = Boolean(item.taskId);
  return `
    <article class="pilotage-item ${done ? "done" : ""}">
      <div>
        <strong>${escapeHtml(item.title || "Point a discuter")}</strong>
        ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
        <small>
          ${item.createdAt ? `Ajoute ${escapeHtml(formatDate(item.createdAt))}` : "Ajoute au pilotage"}
          ${item.createdByEmail ? ` · ${escapeHtml(item.createdByEmail)}` : ""}
          ${taskCreated ? " · mission creee" : ""}
        </small>
      </div>
      <div class="pilotage-item-actions">
        ${done ? "" : `<button class="secondary tiny" type="button" data-action="completePilotageItem" data-id="${escapeAttr(item.id)}">Discute</button>`}
        ${done || taskCreated ? "" : `<button class="secondary tiny" type="button" data-action="createMissionFromPilotageItem" data-id="${escapeAttr(item.id)}">Créer mission</button>`}
        <button class="secondary tiny" type="button" data-action="deletePilotageItem" data-id="${escapeAttr(item.id)}">Retirer</button>
      </div>
    </article>
  `;
}

function renderPilotageMeetingNotes(settings) {
  const notes = pilotageMeetingNotes(settings);
  const visibleNotes = applySearch(notes, "pilotageNotes");
  return `
    <section class="pilotage-section">
      <div class="pilotage-section-head">
        <div>
          <h4>Notes de rencontre</h4>
          <p>Une note par rencontre, plus recente en haut.</p>
        </div>
        <button class="primary compact" type="button" data-action="openPilotageNote">Ajouter note rencontre</button>
      </div>
      ${renderSearchBox("pilotageNotes", "Rechercher dans les notes", "Client, decision, sujet...", notes.length, visibleNotes.length)}
      <div class="pilotage-notes">
        ${visibleNotes.length ? visibleNotes.map(renderPilotageNote).join("") : `<div class="empty small">${searchEmptyMessage("pilotageNotes", "Aucune note de rencontre pour ce coach.")}</div>`}
      </div>
    </section>
  `;
}

function renderPilotageNote(note) {
  const decisions = String(note.decisions || "").trim();
  const nextActions = String(note.nextActions || "").trim();
  const sections = pilotageNoteStructuredSections(note);
  return `
    <article class="pilotage-note">
      <header>
        <div>
          <strong>${escapeHtml(note.title || "Rencontre coach")}</strong>
          <small>${escapeHtml(formatDate(note.meetingDate || note.createdAt || todayIso()))}${note.duration ? ` · ${escapeHtml(note.duration)}` : ""}${note.createdByEmail ? ` · ${escapeHtml(note.createdByEmail)}` : ""}</small>
        </div>
        <button class="secondary tiny" type="button" data-action="editPilotageNote" data-id="${escapeAttr(note.id)}">Modifier</button>
      </header>
      ${note.notes ? `<p>${escapeHtml(note.notes)}</p>` : ""}
      ${sections.length ? `<div class="pilotage-note-sections">${sections.map(renderPilotageNoteSection).join("")}</div>` : ""}
      ${decisions || nextActions ? `
        <div class="pilotage-note-grid">
          ${decisions ? `<div><span>Decisions</span><p>${escapeHtml(decisions)}</p></div>` : ""}
          ${nextActions ? `<div><span>Prochaines actions</span><p>${escapeHtml(nextActions)}</p></div>` : ""}
        </div>
      ` : ""}
    </article>
  `;
}

function pilotageNoteStructuredSections(note) {
  return [
    ["Bright spot", note.brightSpot],
    ["Impacts", note.impactsCounted],
    ["Horaires SP", note.scheduleNotes],
    ["Programmations", note.programmingNotes],
    ["Cancellation / rebooking", note.rebookingNotes],
    ["Nouveaux clients", note.newClientsNotes],
    ["Clients perdus", note.lostClientsNotes],
    ["Analyse rendement", note.performanceAnalysis],
    ["Resultat net derniere paie", note.netPayResult],
    ["Formation continue", note.trainingNotes],
    ["IDS", note.idsNotes]
  ].map(([label, value]) => [label, String(value || "").trim()]).filter(([, value]) => value);
}

function renderPilotageNoteSection([label, value]) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(value)}</p>
    </div>
  `;
}

function pilotageDiscussionItems(settings = state.data.performanceSettings || {}) {
  return Array.isArray(settings.pilotageDiscussionItems)
    ? settings.pilotageDiscussionItems
        .filter(Boolean)
        .slice()
        .sort((a, b) => {
          if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
          return dateValue(b.createdAt || b.updatedAt) - dateValue(a.createdAt || a.updatedAt);
        })
    : [];
}

function pilotageMeetingNotes(settings = state.data.performanceSettings || {}) {
  return Array.isArray(settings.pilotageMeetingNotes)
    ? settings.pilotageMeetingNotes
        .filter(Boolean)
        .slice()
        .sort((a, b) => dateValue(b.meetingDate || b.createdAt) - dateValue(a.meetingDate || a.createdAt))
    : [];
}

function nextPilotageItemList(itemId, patch = null) {
  const items = pilotageDiscussionItems();
  if (!patch) return items.filter((item) => String(item.id) !== String(itemId));
  return items.map((item) => String(item.id) === String(itemId) ? { ...item, ...patch } : item);
}

function renderPerformanceCoachFocus({ periodLabel, lostClients, newClients, checkups, confirmedImpacts, draftImpacts }) {
  const action = draftImpacts.length
    ? `${draftImpacts.length} impact(s) a confirmer pour fermer la periode proprement.`
    : "Aucun impact en attente: valide surtout que les check-ups et nouveaux clients ont du sens.";
  return `
    <section class="performance-focus">
      <div class="performance-focus-head">
        <div>
          <h4>Lecture rapide</h4>
          <p>${escapeHtml(periodLabel)} · regarde les chiffres, puis ajoute ou confirme les impacts revenus au besoin.</p>
        </div>
        <span class="pill ${draftImpacts.length ? "amber" : "green"}">${draftImpacts.length ? "A confirmer" : "Stable"}</span>
      </div>
      <div class="performance-focus-metrics">
        ${renderPerformanceFocusMetric("Nouveaux clients", newClients.length, "arrivees dans la periode", "newClients")}
        ${renderPerformanceFocusMetric("Check-ups CSM", checkups.length, "volume capte par CSM", "checkups")}
        ${renderPerformanceFocusMetric("Impacts confirmes", confirmedImpacts.length, "revenus/retours valides", "impacts")}
        ${renderPerformanceFocusMetric("Clients perdus", lostClients.length, "clients sortis", "lostClients")}
      </div>
      <div class="performance-document-row">
        <a class="secondary button-link" href="${escapeAttr(CSM_PRIORITY_SHEET_URL)}" target="_blank" rel="noopener">Document CSM</a>
        <a class="secondary button-link" href="${escapeAttr(PERFORMANCE_RENDEMENT_SHEET_URL)}" target="_blank" rel="noopener">Document rendement</a>
        <button class="secondary" type="button" data-action="openPerformanceNewClientManual">Ajouter nouveau client</button>
      </div>
      <div class="performance-next-action">
        <strong>Action suggeree</strong>
        <span>${escapeHtml(action)}</span>
      </div>
    </section>
  `;
}

function performanceObjectiveStatusLabel(status) {
  const labels = {
    active: "actif",
    paused: "en pause",
    achieved: "atteint"
  };
  return labels[status] || "actif";
}

function renderPerformanceFocusMetric(label, value, detail, metric = "") {
  const content = `
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(String(value ?? 0))}</strong>
    <small>${escapeHtml(detail)}</small>
  `;
  if (metric) {
    const canOpen = metric === "newClients" || Number(value || 0) > 0;
    return `
      <button class="performance-focus-metric drilldown" type="button" data-action="openPerformanceDetail" data-id="${escapeAttr(metric)}" ${canOpen ? "" : "disabled"}>
        ${content}
      </button>
    `;
  }
  return `
    <div class="performance-focus-metric">
      ${content}
    </div>
  `;
}

function performancePeriodOptions() {
  return [
    ["7d", "7 jours"],
    ["30d", "30 jours"],
    ["60d", "60 jours"],
    ["month", "Ce mois-ci"],
    ["last_month", "Mois dernier"],
    ["6m", "6 mois"],
    ["12m", "12 mois"]
  ];
}

function performancePeriodLabel(value) {
  const found = performancePeriodOptions().find(([key]) => key === value);
  return found?.[1] || "30 jours";
}

function performanceObjectiveStatusOptions(current) {
  return [
    ["active", "Actif"],
    ["paused", "En pause"],
    ["achieved", "Atteint"]
  ].map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("");
}

function weekdayOptions(current) {
  return [
    ["monday", "Lundi"],
    ["tuesday", "Mardi"],
    ["wednesday", "Mercredi"],
    ["thursday", "Jeudi"],
    ["friday", "Vendredi"],
    ["saturday", "Samedi"],
    ["sunday", "Dimanche"]
  ].map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("");
}

function currentQuarterLabel(date = new Date()) {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `T${quarter} ${date.getFullYear()}`;
}

function performanceReminderTaskId(coachId) {
  return `performance_rendement_${String(coachId || "").trim()}`;
}

function nextWeekdayIso(weekday = "monday", fromDate = new Date()) {
  const weekdayIndex = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };
  const target = weekdayIndex[weekday] ?? 1;
  const date = new Date(fromDate);
  date.setHours(12, 0, 0, 0);
  let delta = target - date.getDay();
  if (delta <= 0) delta += 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

function applyPerformanceImpactFilter(impacts, filter) {
  if (!filter || filter === "all") return impacts;
  return impacts.filter((impact) => (impact.status || "draft") === filter);
}

function performanceImpactEmptyMessage(filter) {
  if (filter === "draft") return "Aucun impact a confirmer pour cette periode.";
  if (filter === "confirmed") return "Aucun impact confirme pour cette periode.";
  if (filter === "cancelled") return "Aucun impact annule pour cette periode.";
  return "Aucun impact pour cette periode.";
}

function renderAlumni() {
  const items = state.data.alumni;
  const views = {
    to_work: items.filter((item) => (item.status || "to_work") === "to_work"),
    contacted: items.filter((item) => item.status === "contacted"),
    do_not_contact: items.filter((item) => item.status === "do_not_contact"),
    reactivated: items.filter((item) => item.status === "reactivated"),
    archives: items.filter((item) => item.status === "archived")
  };
  const activeItems = views[state.filter.alumni] || views.to_work;
  const visibleItems = applySearch(activeItems, "alumni");
  const dueFollowups = items.filter((item) => ["to_work", "contacted"].includes(item.status || "to_work") && dateValue(item.nextFollowupAt) && dateValue(item.nextFollowupAt) <= dateValue(todayIso()));
  const alumniTasks = state.data.tasks.filter(isOpenTask).filter((task) => task.alumniId);
  const transferReady = items.filter((item) => item.coachId && coachRecordById(item.coachId)).length;
  return panel("Alumni", "Anciens clients a recontacter. Ce module reste separe du Pilotage.", `
    <div class="bucket-grid compact alumni-summary">
      <div class="bucket"><strong>${views.to_work.length}</strong><span>A travailler</span></div>
      <div class="bucket"><strong>${dueFollowups.length}</strong><span>Relances dues</span></div>
      <div class="bucket"><strong>${alumniTasks.length}</strong><span>Missions alumni</span></div>
      <div class="bucket"><strong>${transferReady}</strong><span>Avec coach</span></div>
    </div>
    <div class="notice compact alumni-guidance">
      <strong>Cycle alumni</strong>
      <span>Modifie une fiche pour changer le coach responsable. Utilise Ramener client quand l'ancien client reprend un suivi actif.</span>
    </div>
    <div class="view-tabs">
      ${filterButton("alumni", "to_work", "A travailler", views.to_work.length)}
      ${filterButton("alumni", "contacted", "Contactes", views.contacted.length)}
      ${filterButton("alumni", "do_not_contact", "Ne pas contacter", views.do_not_contact.length)}
      ${filterButton("alumni", "reactivated", "Reactives", views.reactivated.length)}
      ${filterButton("alumni", "archives", "Archives", views.archives.length)}
    </div>
    ${renderSearchBox("alumni", "Rechercher un alumni", "Nom, telephone, courriel, note, coach...", activeItems.length, visibleItems.length)}
    ${renderCards(visibleItems, renderAlumniCard, searchEmptyMessage("alumni", "Aucun alumni dans cette vue."))}
  `);
}

function renderTraining() {
  return panel("Formation continue", "Espace en developpement pour les ressources coach.", `
    <section class="training-placeholder training-ready">
      <div>
        <h4>Formation continue</h4>
        <p>Cette zone servira a regrouper les ressources internes, rappels de processus et formations coach.</p>
      </div>
      <span class="pill amber">En construction</span>
    </section>
    <section class="training-resource-grid">
      <article class="training-resource-card">
        <span>Demarrage</span>
        <strong>Guide d'utilisation equipe</strong>
        <p>Procedure courte pour se connecter, verifier sa To-do, utiliser Clients, Questionnaires, Rebooking et CoachRx.</p>
        <a class="secondary button-link" href="${TEAM_ONBOARDING_GUIDE_PUBLIC_DOWNLOAD}" target="_blank" rel="noopener">Ouvrir le guide</a>
      </article>
      <article class="training-resource-card">
        <span>Extension</span>
        <strong>CoachRx Sync</strong>
        <p>Version ${escapeHtml(COACHRX_EXTENSION_VERSION)}. Le mode d'emploi complet est dans Guide. Telecharge le ZIP, extrais-le, puis charge le dossier dans Chrome.</p>
        <a class="secondary button-link" href="${COACHRX_EXTENSION_PUBLIC_DOWNLOAD}" download>Telecharger ZIP</a>
      </article>
      <article class="training-resource-card muted">
        <span>A venir</span>
        <strong>Bibliotheque coach</strong>
        <p>Les formations futures pourront vivre ici: ventes, suivi client, check-ups CSM, rebooking et developpement professionnel.</p>
      </article>
    </section>
    <section class="notice compact">
      <strong>Principe</strong>
      <span>Cette page ne doit pas devenir un mur de documentation. Elle sert de point de depart; les procedures detaillees restent dans Guide.</span>
    </section>
  `);
}

function renderAccomplishments() {
  const today = todayIso();
  const example = `Nom Client - ${today} - accomplissement`;
  return panel("Accomplissements", "Photos, videos et preuves de progression client.", `
    <section class="accomplishments-hero">
      <div>
        <h4>Ajouter un accomplissement client</h4>
        <p>Les medias sont conserves dans le Drive partage CrossFit St-Basile. Sur mobile, ouvre le dossier, touche <strong>+</strong>, puis choisis <strong>Importer</strong>.</p>
      </div>
      <a class="primary button-link" href="${escapeAttr(ACCOMPLISHMENTS_DRIVE_URL)}" target="_blank" rel="noopener">Ajouter dans le Drive du centre</a>
    </section>
    <section class="accomplishments-grid">
      <article class="accomplishments-card">
        <span>1</span>
        <strong>Ouvre le dossier du centre</strong>
        <p>Le bouton mene directement au dossier Accomplissements clients du Drive partage du gym.</p>
      </article>
      <article class="accomplishments-card">
        <span>2</span>
        <strong>Importe depuis ce dossier</strong>
        <p>Utilise <strong>+</strong>, puis <strong>Importer</strong>. N'enregistre pas d'abord le media dans Mon Drive.</p>
      </article>
      <article class="accomplishments-card">
        <span>3</span>
        <strong>Nomme le fichier</strong>
        <p>Format recommande: <code>Client - AAAA-MM-JJ - accomplissement</code>.</p>
      </article>
    </section>
    <section class="notice compact success">
      <strong>Destination verifiee</strong>
      <span>Drive partage CrossFit St-Basile. Les nouveaux medias appartiennent au centre plutot qu'au compte personnel du coach.</span>
    </section>
    <section class="notice compact accomplishments-naming">
      <div>
        <strong>Exemple de nom</strong>
        <span>${escapeHtml(example)}</span>
      </div>
      <button class="secondary" type="button" data-action="copyAccomplishmentName" data-value="${escapeAttr(example)}">Copier exemple</button>
    </section>
  `);
}

function renderAssistant() {
  if (!isInfoAdmin()) return renderGuide();
  const coach = activeCoachRecord();
  const requests = (state.data.assistantRequests || [])
    .filter((item) => item.targetCoachId === state.selectedCoachId)
    .slice(0, 12);
  const pending = requests.some((item) => ["queued", "processing"].includes(cleanString(item.status)));
  const quickPrompts = [
    "Qu'est-ce qui merite mon attention aujourd'hui?",
    "Resume les questionnaires a lire pour ce coach.",
    "Quels clients ont plusieurs actions ouvertes?"
  ];
  return panel("Assistant prive", "Laboratoire IA admin et missions confirmees.", `
    <section class="assistant-pilot-banner">
      <div>
        <span>Acces prive</span>
        <strong>Visible seulement pour info@</strong>
        <p>Contexte limite a ${escapeHtml(coach?.name || "ce coach")}. Les analyses restent en lecture seule; une mission peut etre creee uniquement depuis + Mission, apres ta confirmation.</p>
      </div>
      <span class="pill green">R0 lecture · R1 mission</span>
    </section>
    <form class="assistant-composer" data-form="assistantPrompt">
      <label>
        <span>Demande pour ${escapeHtml(coach?.name || "le coach selectionne")}</span>
        <textarea class="input" name="inputText" maxlength="1200" rows="4" placeholder="Ex.: Qu'est-ce qui merite mon attention aujourd'hui?" required></textarea>
      </label>
      <div class="assistant-composer-footer">
        <small>Les informations techniques, telephones, courriels et secrets ne sont pas envoyes au modele.</small>
        <button class="primary" type="submit" ${pending ? "disabled" : ""}>${pending ? "Analyse en cours..." : "Demander"}</button>
      </div>
    </form>
    <div class="assistant-quick-prompts" aria-label="Demandes suggerees">
      ${quickPrompts.map((prompt) => `<button class="secondary" type="button" data-action="useAssistantPrompt" data-prompt="${escapeAttr(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
    </div>
    <section class="assistant-history">
      <div class="section-heading">
        <div>
          <h4>Essais recents</h4>
          <p>Les reponses restent privees au laboratoire admin.</p>
        </div>
        <span class="pill">${requests.length} essai(s)</span>
      </div>
      ${requests.length
        ? requests.map(renderAssistantRequestCard).join("")
        : `<div class="empty small">Aucune demande pour ${escapeHtml(coach?.name || "ce coach")}.</div>`}
    </section>
  `);
}

function renderAssistantRequestCard(request) {
  const proposal = (state.data.assistantProposals || []).find((item) =>
    item.id === request.proposalId || item.requestId === request.id
  );
  const status = cleanString(request.status || "queued");
  const statusLabels = {
    queued: "En attente",
    processing: "Analyse",
    proposed: "A confirmer",
    answered: "Repondu",
    clarification: "A clarifier",
    refused: "Refuse",
    error: "Erreur"
  };
  const statusClass = status === "error" || status === "refused"
    ? "danger"
    : status === "clarification"
      ? "amber"
      : ["queued", "processing"].includes(status)
        ? "amber"
        : "green";
  return `
    <article class="assistant-request-card ${escapeAttr(status)}">
      <header>
        <div>
          <span>${escapeHtml(formatDateTime(request.createdAt) || "Maintenant")}</span>
          <strong>${escapeHtml(request.inputText || "Demande assistant")}</strong>
        </div>
        <span class="pill ${statusClass}">${escapeHtml(statusLabels[status] || status)}</span>
      </header>
      ${["queued", "processing"].includes(status) ? `<div class="assistant-loading">L'assistant construit un contexte limite et verifie les sources...</div>` : ""}
      ${status === "error" ? `<div class="notice error compact"><strong>Assistant indisponible</strong><span>${escapeHtml(request.errorMessage || "Aucune donnee operationnelle n'a ete modifiee.")}</span></div>` : ""}
      ${proposal ? renderAssistantProposal(proposal) : ""}
    </article>
  `;
}

function renderAssistantProposal(proposal) {
  const question = cleanString(proposal.clarifyingQuestion || "");
  const summary = cleanString(proposal.displaySummary || "");
  const evidence = Array.isArray(proposal.evidenceRefs) ? proposal.evidenceRefs : [];
  const suggested = Array.isArray(proposal.suggestedPrompts) ? proposal.suggestedPrompts : [];
  return `
    <section class="assistant-proposal">
      <h4>${escapeHtml(proposal.title || "Reponse de l'assistant")}</h4>
      ${summary ? `<div class="assistant-answer">${escapeHtml(summary).replace(/\n/g, "<br>")}</div>` : ""}
      ${question ? `<div class="notice compact"><strong>Question necessaire</strong><span>${escapeHtml(question)}</span></div>` : ""}
      ${evidence.length ? `
        <div class="assistant-evidence">
          <span>Sources</span>
          <div>${evidence.map((item) => `<span class="pill">${escapeHtml(item.label || item.entityType || "Source")}${item.sourceDate ? ` · ${escapeHtml(formatDate(item.sourceDate))}` : ""}</span>`).join("")}</div>
        </div>
      ` : ""}
      ${suggested.length ? `
        <div class="assistant-suggestions">
          ${suggested.map((prompt) => `<button class="secondary compact-button" type="button" data-action="useAssistantPrompt" data-prompt="${escapeAttr(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
        </div>
      ` : ""}
      <small class="assistant-model-note">${escapeHtml(proposal.modelName || "Gemini")}${proposal.latencyMs ? ` · ${Math.round(Number(proposal.latencyMs) / 100) / 10} s` : ""}</small>
    </section>
  `;
}

function announcementAudienceMatches(announcement) {
  if (isInfoAdmin()) return true;
  const audience = cleanString(announcement?.audience || "coaches");
  return audience === "all" || audience === "coaches";
}

function announcementIsExpired(announcement) {
  const expiresOn = cleanString(announcement?.expiresOn || "");
  return Boolean(expiresOn && expiresOn < todayIso());
}

function announcementAcknowledged(announcementId) {
  if (!announcementId || !state.user?.uid) return false;
  return state.data.announcementAcknowledgements.some((item) =>
    item.announcementId === announcementId && item.userId === state.user.uid
  );
}

function announcementHistory() {
  return state.data.announcements
    .filter((item) => announcementAudienceMatches(item))
    .filter((item) => item.status === "published" || item.status === "archived")
    .sort((a, b) => dateValue(b.publishedAt || b.createdAt) - dateValue(a.publishedAt || a.createdAt));
}

function nextUnreadAnnouncement() {
  return announcementHistory().find((item) =>
    item.status === "published"
    && !announcementIsExpired(item)
    && !announcementAcknowledged(item.id)
    && !state.announcementDismissedIds.has(item.id)
  ) || null;
}

function scheduleUnreadAnnouncementModal() {
  if (!state.user || !state.profile || state.modal || state.announcementAutoOpenTimer || state.announcementAutoShownThisSession) return;
  if (!state.data.loaded.announcements || !state.data.loaded.announcementAcknowledgements) return;
  const announcement = nextUnreadAnnouncement();
  if (!announcement) return;
  state.announcementAutoOpenTimer = window.setTimeout(() => {
    state.announcementAutoOpenTimer = null;
    if (state.modal || !state.user || announcementAcknowledged(announcement.id)) return;
    state.announcementAutoShownThisSession = true;
    openModal({ type: "announcement", id: announcement.id, source: "login" });
  }, 700);
}

function announcementImportanceLabel(importance) {
  const labels = {
    feature: "Nouveaute",
    important: "Important",
    critical: "Action requise"
  };
  return labels[importance] || labels.feature;
}

function announcementReadCount(announcementId) {
  return new Set(
    state.data.announcementAcknowledgements
      .filter((item) => item.announcementId === announcementId)
      .map((item) => item.userId)
      .filter(Boolean)
  ).size;
}

function renderAnnouncementHistory() {
  const items = announcementHistory().slice(0, 8);
  return `
    <section class="announcement-history">
      <div class="section-heading">
        <div>
          <h4>Nouveautes du dashboard</h4>
          <p>Les changements importants restent accessibles ici apres leur annonce.</p>
        </div>
        <span class="pill ${items.some((item) => !announcementAcknowledged(item.id)) ? "amber" : "green"}">${items.length} annonce(s)</span>
      </div>
      ${items.length ? `
        <div class="announcement-history-list">
          ${items.map((item) => `
            <article class="announcement-history-row">
              <div>
                <span>${escapeHtml(formatDate(item.publishedAt || item.createdAt) || "Mise a jour")}</span>
                <strong>${escapeHtml(item.title || "Nouveaute du dashboard")}</strong>
                <small>${escapeHtml(item.message || "")}</small>
              </div>
              <div class="announcement-history-actions">
                <span class="pill ${announcementAcknowledged(item.id) ? "green" : "amber"}">${announcementAcknowledged(item.id) ? "Lu" : "A lire"}</span>
                <button class="secondary compact-button" type="button" data-action="openAnnouncement" data-id="${escapeAttr(item.id)}">Lire</button>
              </div>
            </article>
          `).join("")}
        </div>
      ` : `<div class="empty small">Aucune annonce publiee pour le moment.</div>`}
    </section>
  `;
}

function renderAdminAnnouncements() {
  const items = [...state.data.announcements]
    .sort((a, b) => dateValue(b.publishedAt || b.createdAt) - dateValue(a.publishedAt || a.createdAt))
    .slice(0, 10);
  return `
    <section class="admin-announcements">
      <div class="admin-command-header">
        <div>
          <h4>Annonces de mise a jour</h4>
          <p>Publie seulement les changements qui modifient vraiment le travail des coachs.</p>
        </div>
        <button class="primary" type="button" data-action="openAnnouncementForm">Nouvelle annonce</button>
      </div>
      ${items.length ? `
        <div class="admin-announcement-list">
          ${items.map((item) => `
            <article class="admin-announcement-row ${escapeAttr(item.status || "published")}">
              <div>
                <span>${escapeHtml(announcementImportanceLabel(item.importance))} · ${escapeHtml(formatDate(item.publishedAt || item.createdAt) || "Aujourd'hui")}</span>
                <strong>${escapeHtml(item.title || "Annonce")}</strong>
                <small>${escapeHtml(item.message || "")}</small>
              </div>
              <div class="admin-announcement-actions">
                <span class="pill ${item.status === "published" ? "green" : "amber"}">${item.status === "published" ? `${announcementReadCount(item.id)} confirmation(s)` : "Archivee"}</span>
                <button class="secondary compact-button" type="button" data-action="openAnnouncement" data-id="${escapeAttr(item.id)}">Voir</button>
                ${item.status === "published" ? `<button class="secondary compact-button" type="button" data-action="archiveAnnouncement" data-id="${escapeAttr(item.id)}">Archiver</button>` : ""}
              </div>
            </article>
          `).join("")}
        </div>
      ` : `<div class="empty small">Aucune annonce. Publie la premiere lorsque la prochaine nouveaute importante est prete.</div>`}
    </section>
  `;
}

function renderAdmin() {
  if (!isInfoAdmin()) return renderGuide();
  const activeCoach = activeCoachRecord();
  const openTasks = state.data.tasks.filter(isOpenTask);
  const questionnaireResponses = portfolioQuestionnaireResponses();
  const questionnaireToRead = questionnaireResponses.filter((response) => response.processingStatus === "to_read");
  const questionnaireToValidate = questionnaireResponses.filter((response) => !response.clientId || response.processingStatus === "unmatched");
  const openRebookings = portfolioRebookings().filter((item) => rebookingStatus(item) === "open");
  const missingPhones = activeClients().filter((client) => !clientPhone(client));
  const blockedRelations = blockedOperationalRecordsByCollection();
  const ownershipReviewClients = uniqueById([
    ...state.data.clients.filter((client) =>
      isActiveClient(client)
      && (clientEntityType(client) !== "member" || clientOwnershipStatus(client) !== "confirmed")
    ),
    ...(state.data.rejectedClients || [])
  ]).sort((a, b) => String(a.lastNameSort || a.name || "").localeCompare(String(b.lastNameSort || b.name || "")));
  return panel("Admin equipe", "Supervision des coachs pilotes, sources et points a corriger.", `
    <div class="toolbar">
      <button class="primary" data-action="syncSheets">Synchroniser ce coach</button>
      <button class="secondary" data-action="syncSheetsAll">Synchroniser tous les coachs</button>
      <button class="secondary" data-action="seedCoaches">Reparer liste coachs</button>
    </div>
    <div class="notice compact">
      <strong>Compte admin: info@crossfitstbasilelegrand.com</strong>
      <span>Cette vue garde les diagnostics, les imports et les prochains branchements hors de la vue coach normale.</span>
    </div>
    ${renderAdminPilotStrip()}
    ${renderAdminAdoptionAnalytics()}
    ${renderPilotAcceptance()}
    ${renderAdminWeeklyProductReport()}
    ${renderAdminAnnouncements()}
    ${renderAdminCommandCenter()}
    ${renderAdminSelectedCoachSummary({ activeCoach, openTasks, questionnaireToRead, openRebookings, missingPhones, ownershipReviewClients, blockedRelations })}
    ${renderAdminCleanupQueue({ missingPhones, openRebookings, questionnaireToRead, questionnaireToValidate, ownershipReviewClients, blockedRelations })}
    ${renderCoachActionPlan()}
    ${renderAdminDeepDiagnostics()}
  `);
}

function renderAdminAdoptionAnalytics() {
  const analytics = adoptionAnalytics(7);
  return `
    <section class="admin-adoption">
      <div class="admin-command-header">
        <div>
          <h4>Adoption equipe</h4>
          <p>Lecture des 7 derniers jours: qui utilise le dashboard, quels modules servent vraiment, et qui accompagner.</p>
        </div>
        <span class="pill ${analytics.activeCoaches >= Math.max(1, PILOT_COACHES.length - 1) ? "green" : analytics.activeCoaches ? "amber" : "red"}">${analytics.activeCoaches}/${PILOT_COACHES.length} actifs</span>
      </div>
      <div class="admin-command-metrics">
        ${adminCommandMetric("Coachs actifs", analytics.activeCoaches, "7 derniers jours")}
        ${adminCommandMetric("Sessions", analytics.sessions, "ouvertures distinctes")}
        ${adminCommandMetric("Actions", analytics.actions, "missions, lectures, suivis")}
        ${adminCommandMetric("Module #1", analytics.topModule?.label || "-", analytics.topModule ? `${analytics.topModule.count} visite(s)` : "pas encore assez de donnees")}
        ${adminCommandMetric("A accompagner", analytics.coachesToSupport.length, "peu ou pas d'usage")}
      </div>
      <div class="admin-adoption-summary">
        <strong>Resume hebdo</strong>
        <span>${escapeHtml(analytics.summary)}</span>
      </div>
      <div class="admin-adoption-grid">
        ${analytics.rows.map(renderAdminAdoptionCoachRow).join("")}
      </div>
    </section>
  `;
}

function renderAdminAdoptionCoachRow(row) {
  return `
    <article class="admin-adoption-row ${escapeAttr(row.level)}">
      <div>
        <strong>${escapeHtml(row.coach.name)}</strong>
        <span>${escapeHtml(row.statusLabel)}</span>
        <small>${escapeHtml(row.recommendation)}</small>
      </div>
      <div class="admin-adoption-stats">
        <span>${row.activeDays} jour(s)</span>
        <span>${row.sessions} session(s)</span>
        <span>${row.actions} action(s)</span>
        <span>${escapeHtml(row.modulesLabel)}</span>
      </div>
    </article>
  `;
}

function adoptionAnalytics(days = 7) {
  const events = usageEventsSince(days);
  const rows = PILOT_COACHES.map((coach) => adoptionCoachRow(coach, events));
  const activeCoaches = rows.filter((row) => row.events.length > 0).length;
  const sessions = new Set(events.map((event) => event.sessionId).filter(Boolean)).size;
  const actions = events.filter((event) => event.eventType === "action_logged").length;
  const topModule = topUsageModule(events);
  const coachesToSupport = rows.filter((row) => row.level !== "ok");
  const mostActive = [...rows].sort((a, b) => b.actions - a.actions || b.activeDays - a.activeDays)[0];
  const inactiveNames = rows.filter((row) => !row.events.length).map((row) => row.coach.name);
  const summaryParts = [];
  if (!events.length) {
    summaryParts.push("Les donnees d'adoption commencent a se remplir a partir de cette version.");
  } else {
    summaryParts.push(`${activeCoaches} coach(s) ont utilise l'app cette semaine.`);
    if (mostActive?.actions) summaryParts.push(`${mostActive.coach.name} a pose le plus d'actions (${mostActive.actions}).`);
    if (topModule) summaryParts.push(`Module le plus consulte: ${topModule.label}.`);
    if (inactiveNames.length) summaryParts.push(`A accompagner: ${inactiveNames.slice(0, 3).join(", ")}${inactiveNames.length > 3 ? "..." : ""}.`);
  }
  return { events, rows, activeCoaches, sessions, actions, topModule, coachesToSupport, summary: summaryParts.join(" ") };
}

function adoptionCoachRow(coach, events) {
  const coachEmail = String(coach.email || "").toLowerCase();
  const coachEvents = events.filter((event) => eventActorCoachId(event) === coach.id || String(event.userEmail || "").toLowerCase() === coachEmail);
  const sessions = new Set(coachEvents.map((event) => event.sessionId).filter(Boolean)).size;
  const activeDays = new Set(coachEvents.map((event) => usageDateKey(event.createdAt)).filter(Boolean)).size;
  const actions = coachEvents.filter((event) => event.eventType === "action_logged").length;
  const tabs = uniqueClean(coachEvents.map((event) => event.details?.tab || event.tab)).filter((tab) => tab && tab !== "admin");
  const lastActivity = coachEvents.map((event) => dateValue(event.createdAt)).filter(Boolean).sort((a, b) => b - a)[0] || 0;
  const modulesLabel = tabs.length ? tabs.slice(0, 3).map(tabLabel).join(", ") : "Aucun module";
  let level = "ok";
  let statusLabel = "Actif";
  let recommendation = `Derniere activite: ${lastActivity ? formatDateTime(lastActivity) : "aucune"}.`;
  if (!coachEvents.length) {
    level = "critical";
    statusLabel = "Aucun usage";
    recommendation = "Prevoir un court suivi: acces, comprehension de la To-do ou habitude d'utilisation.";
  } else if (activeDays < 2 && actions < 2) {
    level = "warning";
    statusLabel = "Usage leger";
    recommendation = "Valider si l'app est claire et si le coach sait quelle action poser chaque jour.";
  } else if (actions >= 8 || activeDays >= 3) {
    statusLabel = "Bien adopte";
    recommendation = "Bon candidat pour donner du feedback terrain et montrer les bons reflexes aux autres.";
  }
  return { coach, events: coachEvents, sessions, activeDays, actions, modulesLabel, level, statusLabel, recommendation };
}

function usageEventsSince(days) {
  const cutoff = Date.now() - Number(days || 7) * 24 * 60 * 60 * 1000;
  return (state.data.usageEvents || []).filter((event) => {
    const timestamp = dateValue(event.createdAt);
    return timestamp && timestamp >= cutoff;
  });
}

function topUsageModule(events) {
  const counts = new Map();
  events.forEach((event) => {
    const tab = cleanString(event.details?.tab || event.tab || "");
    if (!tab || tab === "admin") return;
    counts.set(tab, (counts.get(tab) || 0) + 1);
  });
  const [tab, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return tab ? { tab, count, label: tabLabel(tab) } : null;
}

function eventActorCoachId(event) {
  return cleanString(event.actorCoachId || "");
}

function usageDateKey(value) {
  const timestamp = dateValue(value);
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderAdminWeeklyProductReport() {
  const report = state.data.weeklyProductReports?.[0] || null;
  const latestRequest = state.data.productReportRequests?.[0] || null;
  const requestPending = ["queued", "running"].includes(cleanString(latestRequest?.status));
  if (!report) {
    return `
      <section class="admin-product-report">
        <div class="admin-command-header">
          <div>
            <h4>Rapport hebdomadaire</h4>
            <p>Genere automatiquement chaque jeudi a 9 h. Aucune note client ni contenu sensible n'est copie dans ce rapport.</p>
          </div>
          <button class="secondary tiny" data-action="requestProductReport" ${requestPending ? "disabled" : ""}>${requestPending ? "Generation..." : "Generer maintenant"}</button>
        </div>
        <div class="notice compact"><strong>Premier rapport en attente</strong><span>La collecte d'adoption est active; le premier document apparaitra ici apres la prochaine generation.</span></div>
      </section>
    `;
  }
  const adoption = report.adoption || {};
  const operations = report.operations || {};
  const sync = report.syncHealth || {};
  const coachRows = Array.isArray(report.coachRows) ? report.coachRows : [];
  const candidates = Array.isArray(report.automationCandidates) ? report.automationCandidates : [];
  const attention = Number(report.attentionCount || 0);
  return `
    <section class="admin-product-report">
      <div class="admin-command-header">
        <div>
          <h4>Rapport hebdomadaire</h4>
          <p>${escapeHtml(report.summary || "Lecture de la sante et de l'adoption du dashboard.")}</p>
          <small>${escapeHtml(formatDateTime(report.generatedAt || report.periodEnd))} · prochain rapport jeudi 9 h</small>
        </div>
        <div class="admin-product-report-actions">
          <span class="pill ${attention ? "amber" : "green"}">${attention} a verifier</span>
          <button class="secondary tiny" data-action="requestProductReport" ${requestPending ? "disabled" : ""}>${requestPending ? "Generation..." : "Actualiser"}</button>
        </div>
      </div>
      <div class="admin-command-metrics">
        ${adminCommandMetric("Coachs actifs", `${Number(adoption.activeCoaches || 0)}/${Number(adoption.totalCoaches || PILOT_COACHES.length)}`, "7 derniers jours")}
        ${adminCommandMetric("Sessions", Number(adoption.sessions || 0), "ouvertures distinctes")}
        ${adminCommandMetric("Actions", Number(adoption.actions || 0), "actions journalisees")}
        ${adminCommandMetric("Sync a verifier", Number(sync.staleCoachCount || 0) + Number(sync.failedRuns || 0), "fraicheur ou erreur")}
        ${adminCommandMetric("Automatisations", candidates.length, "candidats sur 28 jours")}
      </div>
      <div class="admin-product-health-grid">
        ${renderAdminProductHealth("Missions ouvertes", operations.openTasks, `${Number(operations.staleTasks || 0)} en retard`, operations.staleTasks)}
        ${renderAdminProductHealth("Rebookings ouverts", operations.openRebookings, `${Number(operations.agedRebookings || 0)} de plus de 14 jours`, operations.agedRebookings)}
        ${renderAdminProductHealth("Questionnaires a lire", operations.unreadQuestionnaires, `${Number(operations.agedUnreadQuestionnaires || 0)} de plus de 3 jours`, operations.agedUnreadQuestionnaires)}
        ${renderAdminProductHealth("Erreurs d'envoi", operations.questionnaireSendErrors, "questionnaires", operations.questionnaireSendErrors)}
      </div>
      <details class="admin-product-details">
        <summary>Voir adoption par coach et automatisations candidates</summary>
        <div class="admin-product-detail-grid">
          <div>
            <h5>Adoption par coach</h5>
            ${coachRows.map(renderAdminProductCoachRow).join("") || '<p class="meta">Aucune donnee coach.</p>'}
          </div>
          <div>
            <h5>Candidats automatisation</h5>
            ${candidates.map(renderAdminAutomationCandidate).join("") || '<p class="meta">Aucun motif repete au seuil de trois missions.</p>'}
          </div>
        </div>
      </details>
    </section>
  `;
}

function renderAdminProductHealth(label, value, detailText, warningValue = 0) {
  const warning = Number(warningValue || 0) > 0;
  return `
    <div class="admin-product-health ${warning ? "warning" : "ok"}">
      <span>${escapeHtml(label)}</span>
      <strong>${Number(value || 0)}</strong>
      <small>${escapeHtml(detailText)}</small>
    </div>
  `;
}

function renderAdminProductCoachRow(row = {}) {
  const modules = Array.isArray(row.topModules) ? row.topModules.map((item) => tabLabel(item.key)).join(", ") : "Aucun module";
  const status = {
    adopted: "Bien adopte",
    active: "Actif",
    light: "Usage leger",
    inactive: "Aucun usage"
  }[row.status] || "A verifier";
  return `
    <div class="admin-product-coach ${escapeAttr(row.status || "light")}">
      <div><strong>${escapeHtml(row.coachName || row.coachId || "Coach")}</strong><small>${escapeHtml(status)} · ${Number(row.activeDays || 0)} jour(s) · ${Number(row.sessions || 0)} session(s)</small></div>
      <div><span>${Number(row.actions || 0)} action(s)</span><small>${escapeHtml(modules)}</small></div>
    </div>
  `;
}

function renderAdminAutomationCandidate(candidate = {}) {
  const levelLabel = candidate.level === "candidate" ? "A tester" : candidate.level === "existing" ? "Deja assiste" : "A observer";
  return `
    <div class="admin-automation-candidate">
      <div><strong>${escapeHtml(candidate.label || candidate.category || "Missions")}</strong><small>${Number(candidate.count || 0)} missions · ${Number(candidate.coachCount || 0)} coach(s)</small></div>
      <span class="pill ${candidate.level === "candidate" ? "amber" : ""}">${escapeHtml(levelLabel)}</span>
      <p>${escapeHtml(candidate.recommendation || "Valider le processus avant automatisation.")}</p>
    </div>
  `;
}

function tabLabel(tab) {
  return tabs.find(([id]) => id === tab)?.[1] || tab;
}

function renderAdminPilotStrip() {
  const selectedCoach = activeCoachRecord();
  const syncedRecently = state.data.syncStatus?.syncedAt && daysSince(state.data.syncStatus.syncedAt) < 2;
  const openTasks = state.data.tasks.filter(isOpenTask);
  const missingPhones = activeClients().filter((client) => !clientPhone(client));
  const openRebookings = portfolioRebookings().filter((item) => rebookingStatus(item) === "open");
  return `
    <section class="admin-pilot-strip">
      <div class="admin-pilot-copy">
        <h4>Pilotage equipe</h4>
        <p>${escapeHtml(selectedCoach?.name || "Choisir un coach")} · valide seulement les points qui peuvent bloquer un coach en vrai.</p>
      </div>
      <div class="admin-pilot-steps">
        ${renderAdminPilotStep("Sync", syncedRecently ? "OK" : "A rafraichir", syncedRecently ? "ok" : "warning")}
        ${renderAdminPilotStep("Telephones", missingPhones.length ? `${missingPhones.length} a corriger` : "OK", missingPhones.length ? "warning" : "ok")}
        ${renderAdminPilotStep("Actions", `${openTasks.length} ouvertes`, openTasks.some((task) => task.priority === "P1") ? "critical" : "ok")}
        ${renderAdminPilotStep("Rebooking", `${openRebookings.length} ouverts`, openRebookings.length ? "warning" : "ok")}
      </div>
    </section>
  `;
}

function renderAdminPilotStep(label, value, level) {
  return `
    <div class="admin-pilot-step ${escapeAttr(level)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderAdminCommandCenter() {
  const rows = PILOT_COACHES.map((coach) => {
    const context = syncContextForCoach(coach.id);
    const row = pilotCoachMatrixRow(coach, context);
    const priority = adminCoachPriority(coach, row, context);
    return { coach, row, context, priority };
  });
  const critical = rows.filter((item) => item.priority.level === "critical").length;
  const warning = rows.filter((item) => item.priority.level === "warning").length;
  const ready = rows.length - critical - warning;
  const needsPhone = rows.reduce((sum, item) => sum + Number(item.row.clientsMissingPhone || 0), 0);
  const recent = rows.filter((item) => item.context && daysSince(syncTimestamp(item.context.run)) < 2).length;
  return `
    <section class="admin-command-center">
      <div class="admin-command-header">
        <div>
          <h4>Priorites equipe</h4>
          <p>Commence par les blocages qui empechent un coach de travailler: sync, telephones, rebooking, questionnaires et surcharge To-do.</p>
        </div>
        <span class="pill ${critical ? "red" : warning ? "amber" : "green"}">${critical ? `${critical} bloquant(s)` : warning ? `${warning} a verifier` : "Pret a valider"}</span>
      </div>
      <div class="admin-command-metrics">
        ${adminCommandMetric("Coachs prets", ready, `${rows.length} pilotes`)}
        ${adminCommandMetric("A verifier", warning, "donnees incompletes")}
        ${adminCommandMetric("Bloquants", critical, "avant demo")}
        ${adminCommandMetric("Sans telephone", needsPhone, "clients actifs")}
        ${adminCommandMetric("Sync recente", recent, "moins de 2 jours")}
      </div>
      <div class="admin-priority-list">
        ${rows
          .sort((a, b) => adminPriorityRank(a.priority.level) - adminPriorityRank(b.priority.level) || Number(b.row.clientsMissingPhone || 0) - Number(a.row.clientsMissingPhone || 0))
          .map(({ coach, row, priority }) => renderAdminPriorityRow(coach, row, priority))
          .join("")}
      </div>
    </section>
  `;
}

function renderAdminSelectedCoachSummary({ activeCoach, openTasks, questionnaireToRead, openRebookings, missingPhones, ownershipReviewClients = [], blockedRelations = [] }) {
  const urgentTasks = openTasks.filter((task) => task.priority === "P1").length;
  const blockedRelationCount = blockedRelations.reduce((sum, item) => sum + Number(item.count || 0), 0);
  return `
    <section class="admin-selected-summary">
      <div class="admin-command-header">
        <div>
          <h4>Coach consulte</h4>
          <p>${escapeHtml(activeCoach?.name || state.selectedCoachId || "-")} · ${state.selectedCoachId ? "donnees chargees dans les onglets" : "aucun coach selectionne"}</p>
        </div>
      </div>
      <div class="admin-command-metrics">
        ${adminCommandMetric("Clients actifs", activeClients().length, `${missingPhones.length} sans telephone`)}
        ${adminCommandMetric("To-do ouvertes", openTasks.length, `${urgentTasks} urgentes`)}
        ${adminCommandMetric("Questionnaires", questionnaireToRead.length, "a lire")}
        ${adminCommandMetric("Rebookings", openRebookings.length, "ouverts")}
        ${adminCommandMetric("Identites", ownershipReviewClients.length, "staff ou a valider")}
        ${adminCommandMetric("Relations bloquees", blockedRelationCount, "retirees des workflows coach")}
        ${adminCommandMetric("Derniere sync", formatDateTime(state.data.syncStatus?.syncedAt) || "Aucune", state.data.syncStatus?.status || "source")}
      </div>
    </section>
  `;
}

function renderAdminCleanupQueue({ missingPhones = [], openRebookings = [], questionnaireToRead = [], questionnaireToValidate = [], ownershipReviewClients = [], blockedRelations = [] }) {
  const rebookingsToLink = openRebookings.filter(rebookingHasWeakClientLink);
  const questionnaireItems = uniqueById([...questionnaireToValidate, ...questionnaireToRead]).slice(0, 6);
  const blockedRelationCount = blockedRelations.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const hasWork = missingPhones.length || rebookingsToLink.length || questionnaireItems.length || ownershipReviewClients.length || blockedRelationCount;
  return `
    <section class="admin-cleanup-queue ${hasWork ? "" : "quiet"}">
      <div class="admin-command-header">
        <div>
          <h4>Nettoyage avant pilote</h4>
          <p>Seulement les corrections qui rendent les workflows fiables pour ce coach.</p>
        </div>
        <span class="pill ${hasWork ? "amber" : "green"}">${hasWork ? "A corriger" : "Stable"}</span>
      </div>
      <div class="admin-cleanup-grid">
        ${renderAdminCleanupColumn({
          title: "Telephones manquants",
          count: missingPhones.length,
          empty: "Aucun client actif sans telephone.",
          items: missingPhones.slice(0, 6).map((client) => ({
            id: client.id,
            title: client.name || "Client sans nom",
            detail: clientPhoneSuggestion(client)?.phone
              ? `Suggestion CSM: ${clientPhoneSuggestion(client).phone}`
              : client.membershipLabel || client.source || "Fiche client",
            action: "openClientPhoneFix",
            actionLabel: "Telephone"
          }))
        })}
        ${renderAdminCleanupColumn({
          title: "Rebookings a relier",
          count: rebookingsToLink.length,
          empty: "Tous les rebookings ouverts ont un lien client exploitable.",
          items: rebookingsToLink.slice(0, 6).map((rebooking) => ({
            id: rebooking.id,
            title: rebooking.clientName || "Client a confirmer",
            detail: `${Math.max(1, Number(rebooking.sessionsToRebook || 1))} seance(s) · ${rebooking.matchMethod ? rebookingMatchLabel(rebooking.matchMethod) : "lien a confirmer"}`,
            action: "openRebookingLinkClient",
            actionLabel: "Relier"
          }))
        })}
        ${renderAdminCleanupColumn({
          title: "Questionnaires a valider",
          count: questionnaireItems.length,
          empty: "Aucune reponse questionnaire a valider pour ce coach.",
          items: questionnaireItems.map((response) => ({
            id: response.id,
            clientId: response.clientId || "",
            title: response.clientName || response.name || "Reponse non reliee",
            detail: `${questionnairePrioritySummary(response).label} · ${formatDate(response.submittedAt || response.createdAt) || "date inconnue"}`,
            action: selectableClientForCoach(response.clientId) ? "openClient" : "openQuestionnaireLinkClient",
            actionLabel: selectableClientForCoach(response.clientId) ? "Client" : "Relier"
          }))
        })}
        ${renderAdminCleanupColumn({
          title: "Identites et appartenance",
          count: ownershipReviewClients.length,
          empty: "Aucune fiche staff, inconnue ou en conflit pour ce coach.",
          items: ownershipReviewClients.slice(0, 6).map((client) => ({
            id: client.id,
            title: client.name || "Fiche sans nom",
            detail: client._ownershipReviewReason === "coach_conflict"
              ? "Signaux de coach en conflit · exclu des actions coach"
              : clientEntityType(client) === "staff"
                ? "Membre du staff · exclu des actions coach"
                : `Type ${clientEntityType(client)} · appartenance ${clientOwnershipStatus(client)}`,
            action: "ownershipReview",
            actionLabel: "A valider"
          }))
        })}
        ${renderAdminCleanupColumn({
          title: "Relations bloquees",
          count: blockedRelationCount,
          empty: "Aucune relation explicite vers une fiche non confirmee.",
          items: blockedRelations.map((item) => ({
            id: `blocked-${item.collectionName}`,
            title: sourceLabel(item.collectionName),
            detail: `${Number(item.count || 0)} element(s) retires des workflows coach; reconciliation admin requise`,
            action: "ownershipReview",
            actionLabel: "Protege"
          }))
        })}
      </div>
    </section>
  `;
}

function renderAdminCleanupColumn({ title, count, empty, items = [] }) {
  return `
    <div class="admin-cleanup-column">
      <div class="admin-cleanup-title">
        <strong>${escapeHtml(title)}</strong>
        <span>${Number(count || 0)}</span>
      </div>
      ${items.length ? `
        <div class="admin-cleanup-list">
          ${items.map(renderAdminCleanupItem).join("")}
        </div>
        ${count > items.length ? `<p class="meta">+ ${Number(count - items.length)} autre(s) element(s) dans ce coach.</p>` : ""}
      ` : `<p class="meta">${escapeHtml(empty)}</p>`}
    </div>
  `;
}

function renderAdminCleanupItem(item) {
  const action = item.action === "openClient"
    ? `<button class="secondary tiny" data-action="openClient" data-id="${escapeAttr(item.clientId || item.id)}">${escapeHtml(item.actionLabel || "Ouvrir")}</button>`
    : item.action === "openClientPhoneFix"
      ? `<button class="secondary tiny" data-action="openClientPhoneFix" data-id="${escapeAttr(item.id)}">${escapeHtml(item.actionLabel || "Telephone")}</button>`
      : item.action === "openRebookingLinkClient"
        ? `<button class="secondary tiny" data-action="openRebookingLinkClient" data-id="${escapeAttr(item.id)}">${escapeHtml(item.actionLabel || "Relier")}</button>`
        : item.action === "openQuestionnaireLinkClient"
          ? `<button class="secondary tiny" data-action="openQuestionnaireLinkClient" data-id="${escapeAttr(item.id)}">${escapeHtml(item.actionLabel || "Relier")}</button>`
        : `<span class="pill amber">${escapeHtml(item.actionLabel || "A valider")}</span>`;
  return `
    <article class="admin-cleanup-item">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.detail || "")}</small>
      </div>
      ${action}
    </article>
  `;
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const id = String(item?.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function renderAdminDeepDiagnostics() {
  return `
    <details class="admin-deep-diagnostics">
      <summary>Diagnostics detailles et sources</summary>
      ${renderPilotCoachMatrix()}
      ${renderSyncRequestDiagnostics()}
      ${renderSyncDiagnostics()}
      ${renderSourceActivationRoadmap()}
    </details>
  `;
}

function adminCommandMetric(label, value, detail) {
  return `
    <div class="admin-command-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value ?? "-"))}</strong>
      <small>${escapeHtml(detail || "")}</small>
    </div>
  `;
}

function adminCoachPriority(coach, row, context) {
  const issues = adminCoachPriorityIssues(row, context);
  if (!context) {
    return {
      level: "critical",
      label: "Synchroniser",
      detail: "Aucune sync trouvee. Lancer Sync tous avant validation.",
      issues
    };
  }
  if (Number(row.clientsImported || 0) <= 0) {
    return {
      level: "critical",
      label: "Portefeuille vide",
      detail: "Verifier CoachRx ID, alias coach ou source clients.",
      issues
    };
  }
  if (issues.some((issue) => issue.level === "critical")) {
    const issue = issues.find((item) => item.level === "critical");
    return {
      level: "critical",
      label: issue.label,
      detail: issue.detail,
      issues
    };
  }
  if (issues.length) {
    const issue = issues[0];
    return {
      level: "warning",
      label: issue.label,
      detail: issue.detail,
      issues
    };
  }
  if (daysSince(syncTimestamp(context.run)) >= 2) {
    return {
      level: "warning",
      label: "Sync a rafraichir",
      detail: "Relancer Sync tous avant une demonstration equipe.",
      issues
    };
  }
  return {
    level: "ok",
    label: "Pret a valider",
    detail: `${coach.name}: portefeuille charge et sync exploitable.`,
    issues
  };
}

function adminCoachPriorityIssues(row, context) {
  const issues = [];
  if (!context) return [{ level: "critical", label: "Sync absente", detail: "Aucune importation connue pour ce coach." }];
  const clients = Number(row.clientsImported || 0);
  const missingPhones = Number(row.clientsMissingPhone || 0);
  const weakRebookings = Number(row.rebookingsMissingClient || 0);
  const openTasks = Number(row.tasksImported || 0);
  const questionnaires = Number(row.questionnaireResponsesImported || 0);
  if (!clients) issues.push({ level: "critical", label: "Portefeuille vide", detail: "Verifier CoachRx ID, alias ou import clients.", count: clients });
  if (missingPhones) issues.push({ level: missingPhones >= 6 ? "critical" : "warning", label: "Telephones a completer", detail: `${missingPhones} client(s) sans telephone: questionnaires et rebooking moins fiables.`, count: missingPhones });
  if (weakRebookings) issues.push({ level: "warning", label: "Rebooking fragile", detail: `${weakRebookings} dossier(s) a relier ou verifier.`, count: weakRebookings });
  if (questionnaires >= 8) issues.push({ level: "warning", label: "Questionnaires a lire", detail: `${questionnaires} reponse(s) importee(s): verifier l'inbox du coach.`, count: questionnaires });
  if (openTasks >= 20) issues.push({ level: "warning", label: "To-do surchargee", detail: `${openTasks} mission(s) ouvertes: verifier si la page quotidienne reste lisible.`, count: openTasks });
  return issues;
}

function renderAdminPriorityRow(coach, row, priority) {
  const issues = Array.isArray(priority.issues) ? priority.issues : [];
  return `
    <article class="admin-priority-row ${escapeAttr(priority.level)}">
      <div>
        <strong>${escapeHtml(coach.name)}</strong>
        <span>${escapeHtml(priority.label)}</span>
        <small>${escapeHtml(priority.detail)}</small>
        ${issues.length ? `
          <div class="admin-impact-tags">
            ${issues.slice(0, 3).map((issue) => `<em class="${escapeAttr(issue.level)}">${escapeHtml(issue.label)}${issue.count ? ` ${Number(issue.count)}` : ""}</em>`).join("")}
          </div>
        ` : ""}
      </div>
      <div class="admin-priority-counts">
        <span>${Number(row.clientsImported || 0)} clients</span>
        <span>${Number(row.tasksImported || 0)} to-do</span>
        <span>${Number(row.rebookingsImported || 0)} rebookings</span>
      </div>
      <button class="secondary tiny" data-action="selectCoach" data-id="${escapeAttr(coach.id)}">Voir</button>
    </article>
  `;
}

function adminPriorityRank(level) {
  const ranks = { critical: 0, warning: 1, ok: 2 };
  return ranks[level] ?? 3;
}

function renderGuide() {
  const modules = [
    ["Base Firebase", "Firestore est maintenant le moteur interactif du dashboard. Google Sheets reste utile pour import/export, mais pas pour chaque clic coach."],
    ["Coachs", "Les coachs reels sont pilotes par CoachRx ID. Reparer la liste coachs restaure seulement la liste officielle pilote."],
    ["To-do", "La page quotidienne doit contenir seulement des actions concretes: faire, masquer, relancer ou valider."],
    ["Clients", "La fiche client regroupe les donnees utiles: telephone, membership, dates manuelles, recurrence Kilo, risque coach et notes."],
    ["Questionnaires", "L'inbox lit les reponses et l'envoi passe par une Cloud Function privee qui ajoute le tag GHL dashboardcoach."],
    ["Rebooking", "Le module importe la source rebooking cote backend, sans exposer les liens Apps Script tokenises. Les statuts traites dans Firebase sont proteges a la reimportation."],
    ["Pilotage", "Impacts, clients perdus, nouveaux clients et check-ups restent separes des alumni et filtres par periode."],
    ["Securite", "Aucun token, lien secret ou donnee client ne doit etre publie dans GitHub Pages."]
  ];
  const sourceMap = [
    ["Firestore", "Base operationnelle", "Actions coach, fiches client, notes, statuts, impacts, historique et journaux."],
    ["Apps Script / Bob", "Ponts d'import", "Scripts existants ou nouveaux connectes a Cloud Functions; Bob sert a inspecter, deployer et journaliser les changements Google Workspace."],
    ["Google Sheets", "Backup / audit / source temporaire", "Encore utiles pour CSM, questionnaire ou reconciliation, mais pas obligatoires quand une source peut pousser directement vers Firestore."],
    ["CoachRx", "Source client/programme", "Clients assignes aux coachs et donnees de suivi importees par extension, Apps Script ou snapshot securise."],
    ["GoHighLevel", "Telephone et communication", "Validation contact, enrichissement telephone et envoi questionnaire cote serveur seulement avec le tag dashboardcoach."],
    ["Manuel coach", "Contexte local", "Fin membership, recurrence Kilo, risque coach, notes et corrections de dossier."]
  ];
  const sourceTruthRows = [
    ["Lecture du dashboard", "Firestore", "Le coach travaille dans Firestore pour obtenir une interface rapide et interactive."],
    ["Sources vivantes", "CoachRx, GHL, questionnaire, rebooking, CSM/Kilo", "Les sources envoient leurs donnees vers Firebase par Cloud Functions securisees, idealement sans passer par un Sheet intermediaire inutile."],
    ["Sheets restants", "Backup, audit, reconciliation ou source temporaire", "Un Sheet reste utile si c'est deja la meilleure source disponible, mais il ne doit pas devenir un doublon permanent sans raison."],
    ["Champs manuels", "Dashboard coach/admin", "Fin membership, recurrence Kilo, risque coach, notes et corrections de telephone sont proteges contre les imports automatiques."],
    ["Conflits", "Registre des sources", "Si deux sources divergent, on suit SOURCE_REGISTRY.json avant de corriger l'interface ou d'ecraser une donnee."]
  ];
  return panel("Guide & modules", "Etat de migration vers Firebase et actions admin.", `
    <div class="toolbar">
      ${isInfoAdmin() ? `<button class="secondary" data-action="seedCoaches">Reparer liste coachs</button>` : ""}
      ${isInfoAdmin() && state.selectedCoachId ? `<button class="primary" data-action="syncSheets">Synchroniser ce coach</button>` : ""}
      ${isInfoAdmin() ? `<button class="secondary" data-action="syncSheetsAll">Synchroniser tous les coachs</button>` : ""}
    </div>
    ${renderAnnouncementHistory()}
    ${renderGuideQuickStart()}
    ${renderFirstConnectionChecklist()}
    ${renderPilotAcceptance()}
    ${renderAccessGuide()}
    ${renderTeamUsageGuideCard()}
    ${renderCoachRxExtensionGuide()}
    ${isInfoAdmin() ? renderCoachActionPlan() : ""}
    ${isInfoAdmin() ? `
      <details class="guide-admin-details">
        <summary>Validation pilote et diagnostics admin</summary>
        ${renderCoachRxExtensionAdminSetup()}
        ${renderPilotCoachChecklist()}
        ${renderPilotValidation()}
        ${renderPilotCoachMatrix()}
        ${renderSheetAccessChecklist()}
        ${renderSourceActivationRoadmap()}
        ${renderSyncRequestDiagnostics()}
        ${renderSyncDiagnostics()}
      </details>
    ` : ""}
    <details class="guide-reference-details" ${isInfoAdmin() ? "" : "open"}>
      <summary>Reference modules et sources</summary>
      ${renderGuideSourceReference(sourceTruthRows, sourceMap, modules)}
    </details>
  `);
}

function renderGuideQuickStart() {
  const isAdmin = isInfoAdmin();
  const steps = isAdmin
    ? [
      ["1", "Choisir un coach", "Utilise le selecteur pour voir exactement ce que le coach verra dans ses modules."],
      ["2", "Valider les workflows", "Regarde To-do, Clients, Questionnaires et Rebooking avant d'inviter plus de monde."],
      ["3", "Garder les diagnostics ici", "Les erreurs, sources et matrices restent dans Guide/Admin, pas dans l'ecran quotidien du coach."]
    ]
    : [
      ["1", "Ouvrir To-do", "Commence par les missions ouvertes, puis ferme ce qui est fait."],
      ["2", "Chercher un client", "Utilise Clients pour ajouter une mission, corriger un telephone ou consulter le contexte."],
      ["3", "Traiter les suivis", "Questionnaires et Rebooking servent a garder les suivis actifs et les seances payees visibles."]
    ];
  return `
    <section class="guide-quickstart">
      <div class="guide-quickstart-head">
        <div>
          <h4>${isAdmin ? "Utiliser le mode admin" : "Utiliser le dashboard aujourd'hui"}</h4>
          <p>${isAdmin ? "Controle rapide avant pilote equipe." : "Le minimum utile pour un coach, sans fouiller dans les sources."}</p>
        </div>
        <span class="pill ${isAdmin ? "amber" : "green"}">${isAdmin ? "Admin" : "Coach"}</span>
      </div>
      <div class="guide-quickstart-grid">
        ${steps.map(([number, title, text]) => `
          <article class="guide-quickstart-step">
            <span>${escapeHtml(number)}</span>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(text)}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderFirstConnectionChecklist() {
  const checklist = [
    ["Connexion", "Connecte-toi avec Google ou courriel + mot de passe, puis confirme que ton nom apparait dans le menu coach."],
    ["To-do", "Ouvre To-do et traite seulement les actions qui sont claires: programme, questionnaire, rebooking ou mission manuelle."],
    ["Clients", "Cherche 2 ou 3 clients que tu connais. Si un telephone ou un membership semble faux, ouvre la fiche avant de corriger."],
    ["Questionnaires", "Teste un envoi seulement avec un client qui a un telephone fiable. Les reponses a lire restent dans l'inbox."],
    ["Rebooking", "Verifie les seances a remettre. Ajoute une seance manuelle si elle manque dans la source."],
    ["CoachRx", "Si tu utilises l'extension, compare le nombre de clients recus avec CoachRx avant de conclure que l'import est bon."]
  ];
  return `
    <section class="onboarding-checklist">
      <div class="guide-quickstart-head">
        <div>
          <h4>Premiere connexion coach</h4>
          <p>Checklist rapide pour confirmer que le coach est pret a utiliser le dashboard sans support technique.</p>
        </div>
        <span class="pill green">Onboarding</span>
      </div>
      <div class="onboarding-check-grid">
        ${checklist.map(([title, detail], index) => `
          <article class="onboarding-check-item">
            <span>${index + 1}</span>
            <div>
              <strong>${escapeHtml(title)}</strong>
              <p>${escapeHtml(detail)}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPilotAcceptance() {
  if (isInfoAdmin()) return renderPilotAcceptanceAdmin();
  if (!state.user?.uid || !PILOT_COACHES.some((coach) => coach.id === state.profile?.coachId)) return "";
  const environment = pilotAcceptanceEnvironment();
  const storedRecord = currentPilotAcceptanceRecord(environment);
  const record = isCurrentPilotAcceptance(storedRecord) ? storedRecord : null;
  const staleRecord = storedRecord && !record ? storedRecord : null;
  const status = record?.status || "ready_with_reservation";
  const updatedLabel = staleRecord
    ? `Un test d'une ancienne version existe (${formatDate(staleRecord.validatedAt || staleRecord.updatedAt)}). Recommence les controles pour la version actuelle.`
    : record?.validatedAt || record?.updatedAt
    ? `Dernier test sur cet environnement: ${formatDateTime(record.validatedAt || record.updatedAt)}.`
    : "Aucun test enregistre sur cet environnement.";
  return `
    <section class="pilot-acceptance">
      <div class="guide-quickstart-head">
        <div>
          <h4>Validation terrain 5/5</h4>
          <p>Confirme ce que tu as reellement teste. Cette validation reste separee des controles techniques automatiques.</p>
        </div>
        <span class="pill ${record?.status === "ready" ? "green" : record?.status === "blocked" ? "red" : "amber"}">${escapeHtml(pilotAcceptanceStatusLabel(record?.status || "pending"))}</span>
      </div>
      <div class="pilot-acceptance-environment">
        <span>${escapeHtml(pilotAcceptanceDeviceLabel(environment.deviceType))}</span>
        <span>${escapeHtml(pilotAcceptancePlatformLabel(environment.platform))}</span>
        <span>${escapeHtml(pilotAcceptanceBrowserLabel(environment.browser))}</span>
        <span>${escapeHtml(pilotAcceptanceAuthLabel(environment.authMethod))}</span>
      </div>
      <form class="pilot-acceptance-form" data-form="pilotAcceptance">
        <div class="pilot-acceptance-checks">
          ${pilotAcceptanceCheck("checkNavigation", "Connexion et navigation", "Les onglets et boutons fonctionnent sans gel.", record)}
          ${pilotAcceptanceCheck("checkMission", "Mission", "Je peux creer, modifier et terminer une mission.", record)}
          ${pilotAcceptanceCheck("checkClientFollowup", "Client et suivi", "J'ai ouvert un client et traite un suivi ou rebooking disponible.", record)}
          ${pilotAcceptanceCheck("checkCrossCoach", "Couverture inter-coach", "J'ai agi dans le portefeuille d'un autre coach pilote.", record)}
          ${pilotAcceptanceCheck("checkCoachRx", "Extension CoachRx", "Je l'ai installee ou synchronisee sans aide technique.", record)}
          ${pilotAcceptanceCheck("checkVoicePlayback", "Mission vocale", "J'ai cree puis ecoute une mission vocale sans gel.", record)}
          ${pilotAcceptanceCheck("checkManualClient", "Client manuel", "J'ai cree puis modifie un client manuel depuis mon compte coach.", record)}
          ${pilotAcceptanceCheck("checkQuestionnaireDelivery", "Livraison questionnaire", "Un questionnaire test autorise a bien ete recu puis retrouve dans Suivis.", record)}
          ${pilotAcceptanceCheck("checkHighVolumeRebooking", "Rebooking volumineux", "J'ai verifie un dossier de 10 seances ou plus sans le fermer par commodite.", record)}
        </div>
        <div class="pilot-acceptance-decision">
          <label>Verdict
            <select class="input" name="status" required>
              <option value="ready" ${status === "ready" ? "selected" : ""}>Pret pour usage quotidien</option>
              <option value="ready_with_reservation" ${status === "ready_with_reservation" ? "selected" : ""}>Pret avec une reserve</option>
              <option value="blocked" ${status === "blocked" ? "selected" : ""}>Bloque</option>
            </select>
          </label>
          <label>Commentaire optionnel
            <textarea class="input" name="note" maxlength="300" placeholder="Decris seulement le blocage ou la reserve. Aucun nom ni detail client.">${escapeHtml(record?.note || "")}</textarea>
          </label>
        </div>
        <div class="pilot-acceptance-footer">
          <small>${escapeHtml(updatedLabel)}</small>
          <button class="primary" type="submit">Enregistrer mon test</button>
        </div>
      </form>
    </section>
  `;
}

function pilotAcceptanceCheck(name, title, detail, record) {
  return `
    <label class="pilot-acceptance-check">
      <input type="checkbox" name="${escapeAttr(name)}" ${record?.[name] ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(detail)}</small>
      </span>
    </label>
  `;
}

function renderPilotAcceptanceAdmin() {
  const records = state.data.pilotAcceptances || [];
  const currentRecords = records.filter(isCurrentPilotAcceptance);
  const rows = PILOT_COACHES.map((coach) => pilotAcceptanceCoachRow(coach, records));
  const validated = rows.filter((row) => row.records.length).length;
  const ready = rows.filter((row) => row.level === "ready").length;
  const blocked = rows.filter((row) => row.level === "blocked").length;
  const deviceCoverage = new Set(currentRecords.map((record) => record.deviceType).filter(Boolean));
  return `
    <section class="pilot-acceptance admin-view">
      <div class="admin-command-header">
        <div>
          <h4>Acceptation terrain 5/5</h4>
          <p>Les preuves automatiques sont a 8/8. Ici, seuls les coachs confirment les appareils et parcours reellement testes.</p>
        </div>
        <span class="pill ${blocked ? "red" : validated >= 3 ? "green" : "amber"}">${validated}/${PILOT_COACHES.length} validations</span>
      </div>
      <div class="pilot-acceptance-metrics">
        <span><strong>${validated}</strong>coach(s) repondu(s)</span>
        <span><strong>${ready}</strong>pret(s)</span>
        <span><strong>${blocked}</strong>bloque(s)</span>
        <span><strong>${deviceCoverage.size}</strong>format(s) teste(s)</span>
      </div>
      <div class="pilot-acceptance-admin-list">
        ${rows.map((row) => `
          <article class="pilot-acceptance-admin-row ${escapeAttr(row.level)}">
            <div>
              <strong>${escapeHtml(row.coach.name)}</strong>
              <span>${escapeHtml(row.statusLabel)}</span>
              <small>${escapeHtml(row.detail)}</small>
            </div>
            <div class="pilot-acceptance-admin-stats">
              <span>${row.checkedCount}/9 controles</span>
              <span>${row.records.length} environnement(s)</span>
              <span>${escapeHtml(row.latestLabel)}</span>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function pilotAcceptanceCoachRow(coach, records) {
  const allCoachRecords = records
    .filter((record) => String(record.coachId || "") === String(coach.id))
    .sort((a, b) => dateValue(b.validatedAt || b.updatedAt) - dateValue(a.validatedAt || a.updatedAt));
  const coachRecords = allCoachRecords.filter(isCurrentPilotAcceptance);
  const staleRecords = allCoachRecords.filter((record) => !isCurrentPilotAcceptance(record));
  const latest = coachRecords[0];
  const latestStale = staleRecords[0];
  const checks = [
    "checkNavigation",
    "checkMission",
    "checkClientFollowup",
    "checkCrossCoach",
    "checkCoachRx",
    "checkVoicePlayback",
    "checkManualClient",
    "checkQuestionnaireDelivery",
    "checkHighVolumeRebooking"
  ];
  const checkedCount = checks.filter((field) => coachRecords.some((record) => record[field] === true)).length;
  let level = "pending";
  let statusLabel = "En attente";
  if (coachRecords.some((record) => record.status === "blocked")) {
    level = "blocked";
    statusLabel = "Blocage declare";
  } else if (coachRecords.some((record) => record.status === "ready_with_reservation")) {
    level = "reservation";
    statusLabel = "Pret avec reserve";
  } else if (coachRecords.some((record) => record.status === "ready")) {
    level = "ready";
    statusLabel = "Pret";
  } else if (staleRecords.length) {
    level = "reservation";
    statusLabel = "Retest requis";
  }
  const environments = uniqueClean(coachRecords.map((record) =>
    `${pilotAcceptanceDeviceLabel(record.deviceType)} / ${pilotAcceptanceAuthLabel(record.authMethod)}`
  ));
  return {
    coach,
    records: coachRecords,
    level,
    statusLabel,
    checkedCount,
    detail: environments.length
      ? environments.join("; ")
      : staleRecords.length
        ? `Validation anterieure detectee; nouveau test requis pour ${APP_VERSION}.`
        : "Aucun test terrain enregistre.",
    latestLabel: latest
      ? formatDate(latest.validatedAt || latest.updatedAt)
      : latestStale
        ? `${formatDate(latestStale.validatedAt || latestStale.updatedAt)} (ancien)`
        : "-"
  };
}

function isCurrentPilotAcceptance(record) {
  return String(record?.appVersion || "") === APP_VERSION;
}

function currentPilotAcceptanceRecord(environment = pilotAcceptanceEnvironment()) {
  const id = pilotAcceptanceRecordId(environment);
  return (state.data.pilotAcceptances || []).find((record) => record.id === id) || null;
}

function pilotAcceptanceRecordId(environment = pilotAcceptanceEnvironment()) {
  const parts = [state.user?.uid || "user", environment.platform, environment.browser, environment.authMethod]
    .map(pilotAcceptanceKeyPart);
  return `accept_${parts.join("_")}`.slice(0, 180);
}

function pilotAcceptanceKeyPart(value) {
  return String(value || "other").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "other";
}

function pilotAcceptanceEnvironment() {
  const userAgent = String(navigator.userAgent || "").toLowerCase();
  const providers = new Set((state.user?.providerData || []).map((item) => item.providerId).filter(Boolean));
  const platform = /iphone|ipad|ipod/.test(userAgent)
    ? "ios"
    : /android/.test(userAgent)
      ? "android"
      : /windows/.test(userAgent)
        ? "windows"
        : /macintosh|mac os/.test(userAgent)
          ? "macos"
          : "other";
  const browser = /edg|edgios|edga/.test(userAgent)
    ? "edge"
    : /crios|chrome/.test(userAgent)
      ? "chrome"
      : /fxios|firefox/.test(userAgent)
        ? "firefox"
        : /safari/.test(userAgent)
          ? "safari"
          : "other";
  const authMethod = providers.has("google.com") && providers.has("password")
    ? "linked"
    : providers.has("google.com")
      ? "google"
      : providers.has("password")
        ? "password"
        : "other";
  return { deviceType: usageDeviceType(), platform, browser, authMethod };
}

function pilotAcceptanceStatusLabel(status) {
  if (status === "ready") return "Pret";
  if (status === "ready_with_reservation") return "Avec reserve";
  if (status === "blocked") return "Bloque";
  return "A valider";
}

function pilotAcceptanceDeviceLabel(value) {
  return ({ mobile: "Mobile", tablet: "Tablette", desktop: "Ordinateur" })[value] || "Appareil";
}

function pilotAcceptancePlatformLabel(value) {
  return ({ ios: "iPhone/iPad", android: "Android", windows: "Windows", macos: "macOS" })[value] || "Plateforme autre";
}

function pilotAcceptanceBrowserLabel(value) {
  return ({ chrome: "Chrome", safari: "Safari", edge: "Edge", firefox: "Firefox" })[value] || "Navigateur autre";
}

function pilotAcceptanceAuthLabel(value) {
  return ({ google: "Google", password: "Courriel + mot de passe", linked: "Compte lie", other: "Connexion autre" })[value] || "Connexion autre";
}

function renderAccessGuide() {
  return `
    <section class="access-guide">
      <div class="guide-quickstart-head">
        <div>
          <h4>Connexion au dashboard</h4>
          <p>Deux chemins sont disponibles. L'acces reste controle par Firebase et la liste des coachs pilotes.</p>
        </div>
        <span class="pill amber">Acces</span>
      </div>
      <div class="access-path-grid">
        <article class="access-path-card">
          <strong>Option 1 - Google</strong>
          <p>Utilise le bouton Google si le coach a un compte Google associe au courriel autorise. C'est le chemin le plus rapide.</p>
          <small>Si Google boucle sur mobile, essayer Safari/Chrome ou utiliser courriel + mot de passe.</small>
        </article>
        <article class="access-path-card">
          <strong>Option 2 - Courriel + mot de passe</strong>
          <p>Utile pour un coach sans compte Google ou si le navigateur bloque la redirection Google.</p>
          <small>L'admin cree le compte dans Firebase Authentication, puis le coach peut reinitialiser son mot de passe.</small>
        </article>
        <article class="access-path-card">
          <strong>Si ca bloque</strong>
          <p>Verifier le bon courriel, vider la session, puis recharger l'app. Si le compte est reconnu mais sans acces, demander a l'admin d'activer le coach pilote.</p>
          <small>Ne pas partager de compte entre coachs: les actions sont journalisees.</small>
        </article>
      </div>
    </section>
  `;
}

function renderTeamUsageGuideCard() {
  return `
    <section class="team-guide-card">
      <div>
        <h4>Guide d'utilisation equipe</h4>
        <p>Une version imprimable est disponible pour presenter le dashboard aux coachs et reduire les questions de demarrage.</p>
      </div>
      <div class="action-row compact">
        <a class="secondary button-link" href="${TEAM_ONBOARDING_GUIDE_PUBLIC_DOWNLOAD}" target="_blank" rel="noopener">Ouvrir</a>
        <a class="secondary button-link" href="${TEAM_ONBOARDING_GUIDE_PUBLIC_DOWNLOAD}" download>Telecharger</a>
      </div>
    </section>
  `;
}

function coachRxExtensionSetup() {
  return state.data.extensionSetup || {};
}

function maskedSecretSummary(value) {
  const text = String(value || "");
  if (!text) return "non configure";
  if (text.length <= 8) return "configure";
  return `${text.slice(0, 3)}...${text.slice(-3)}`;
}

function renderCoachRxExtensionGuide() {
  const isAdmin = isInfoAdmin();
  const coach = activeCoachRecord();
  const setup = coachRxExtensionSetup();
  const downloadUrl = setup.extensionDownloadUrl || COACHRX_EXTENSION_PUBLIC_DOWNLOAD;
  const configured = Boolean(setup.webAppUrl && setup.syncSecret);
  const setupUpdated = setup.updatedAt ? formatDateTime(setup.updatedAt) : "jamais";
  const steps = [
    ["1", "Telecharger le ZIP", "Telecharge le fichier depuis ce Guide. Le ZIP est public et ne contient pas de secret."],
    ["2", "Extraire le dossier", "Clic droit sur le ZIP, Extraire tout, puis garde le dossier extrait dans Documents ou Bureau. Chrome ne peut pas charger le ZIP directement."],
    ["3", "Charger dans Chrome", "Va dans chrome://extensions, active le mode developpeur, clique Charger l'extension non empaquetee, puis selectionne le dossier extrait."],
    ["4", "Configurer", "Ouvre l'extension et colle l'URL Apps Script et le secret de synchronisation fournis ici apres connexion."],
    ["5", "Synchroniser", "Ouvre CoachRx sur la page Clients du bon coach, choisis ce coach dans l'extension, puis clique Mettre a jour CoachRx."]
  ];
  const checks = [
    "Le nombre de clients recus doit ressembler a CoachRx.",
    "Les pastilles rouges ou jaunes CoachRx doivent creer des missions programme.",
    "Les clients verts ou sans signal doivent rester en contexte client, pas devenir des To-do.",
    "Si un telephone manque, corriger la fiche client ou la source interne avant de tester GHL/questionnaire."
  ];
  return `
    <section class="coachrx-extension-guide">
      <div class="guide-quickstart-head">
        <div>
          <h4>Extension CoachRx</h4>
          <p>Procedure standard pour mettre a jour les clients et signaux programme dans Firebase.</p>
        </div>
        <span class="pill green">CoachRx</span>
      </div>
      <div class="coachrx-guide-layout">
        <div class="coachrx-guide-steps">
          ${steps.map(([number, title, text]) => `
            <article class="coachrx-guide-step">
              <span>${escapeHtml(number)}</span>
              <strong>${escapeHtml(title)}</strong>
              <p>${escapeHtml(text)}</p>
            </article>
          `).join("")}
        </div>
        <aside class="coachrx-guide-card">
          <strong>Coach selectionne</strong>
          <p>${escapeHtml(coach?.name || "Aucun coach selectionne")}${coach?.coachRxId ? ` · CoachRx ${escapeHtml(coach.coachRxId)}` : ""}</p>
          <div class="action-row compact">
            <a class="secondary button-link" href="https://dashboard.coachrx.app/" target="_blank" rel="noopener">Ouvrir CoachRx</a>
            ${isAdmin ? `<button class="secondary" data-action="syncSheets">Sync dashboard</button>` : ""}
          </div>
        </aside>
      </div>
      <div class="coachrx-install-grid">
        <article class="coachrx-install-card primary-install">
          <span>Etape 1</span>
          <strong>Telecharger l'extension</strong>
          <p>Version ${escapeHtml(COACHRX_EXTENSION_VERSION)}. Le ZIP ne contient pas de secret. Il contient le dossier de l'extension, son README et ses icones.</p>
          <a class="primary button-link" href="${escapeAttr(downloadUrl)}" download>Telecharger ZIP</a>
        </article>
        <article class="coachrx-install-card">
          <span>Etape 2</span>
          <strong>Extraire, puis charger</strong>
          <p>Extrais le ZIP. Dans <code>chrome://extensions</code>, active le mode developpeur, clique Charger l'extension non empaquetee, puis selectionne le dossier extrait.</p>
        </article>
        <article class="coachrx-install-card">
          <span>Etape 3</span>
          <strong>Copier la configuration</strong>
          <p>${configured ? "Copie les deux valeurs dans l'extension. Le secret reste masque dans le dashboard." : "La configuration doit etre completee par un admin avant installation autonome."}</p>
          <div class="coachrx-copy-grid">
            <button class="secondary" data-action="copyCoachRxSetup" data-key="webAppUrl" ${setup.webAppUrl ? "" : "disabled"}>Copier URL</button>
            <button class="secondary" data-action="copyCoachRxSetup" data-key="syncSecret" ${setup.syncSecret ? "" : "disabled"}>Copier secret</button>
          </div>
          <small>Config: ${configured ? "prete" : "incomplete"} · mise a jour ${escapeHtml(setupUpdated)}</small>
        </article>
      </div>
      <details class="coachrx-guide-details">
        <summary>Checklist apres synchronisation</summary>
        <ul class="plain-list">
          ${checks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </details>
      <details class="coachrx-guide-details">
        <summary>Problemes frequents</summary>
        <div class="diagnostic-grid">
          ${[
            ["ZIP vide ou impossible a charger", "Ne selectionne pas le ZIP dans Chrome. Extrais-le d'abord, puis selectionne le dossier qui contient manifest.json."],
            ["Mauvais coach", "Ouvre la page CoachRx du coach choisi et selectionne le meme coach dans l'extension."],
            ["Aucun changement", "Attends le message Termine, puis relance Synchroniser ce coach dans Guide."],
            ["Erreur extension", "Recharge la page CoachRx, reconnecte CoachRx, puis relance l'extension."],
            ["Donnees incoherentes", "Ne corrige pas fiche par fiche: valide d'abord que la source CoachRx affiche les memes signaux."]
          ].map(([title, detail]) => `
            <div class="diagnostic-metric">
              <span>${escapeHtml(title)}</span>
              <small>${escapeHtml(detail)}</small>
            </div>
          `).join("")}
        </div>
      </details>
    </section>
  `;
}

function renderCoachRxExtensionAdminSetup() {
  const setup = coachRxExtensionSetup();
  const secretState = setup.syncSecret ? `Secret deja enregistre (${maskedSecretSummary(setup.syncSecret)})` : "Aucun secret enregistre";
  const setupUpdated = setup.updatedAt ? formatDateTime(setup.updatedAt) : "jamais";
  const adminItems = [
    ["Fichier extension", `ZIP public sans secret: version ${COACHRX_EXTENSION_VERSION}. Les coachs le telechargent depuis le Guide.`],
    ["URL Apps Script", "Enregistrer ici l'URL Web App utilisee par l'extension. Elle est visible seulement aux utilisateurs actifs connectes."],
    ["Secret de synchronisation", "Enregistrer ici le secret partage. Il n'est pas dans les fichiers publics, mais les coachs actifs peuvent le copier."],
    ["Rotation", "Si le secret circule trop largement, le remplacer cote Apps Script/Firebase, puis redistribuer l'extension configuree."],
    ["Version", `Version dashboard compatible: ${APP_VERSION}. Verifier que l'extension affiche Termine apres chaque import.`]
  ];
  return `
    <section class="coachrx-admin-setup">
      <div class="section-heading">
        <div>
          <h4>Extension CoachRx - configuration admin</h4>
          <p>Les valeurs sensibles restent hors fichiers publics. Cette section indique quoi preparer pour rendre les coachs autonomes.</p>
        </div>
      </div>
      <div class="source-truth-table">
        ${adminItems.map(([label, value]) => `
          <div class="source-truth-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${label === "Secret de synchronisation" ? "Ne jamais publier dans GitHub, Hosting ou capture partagee." : "Procedure pilote equipe."}</small>
          </div>
        `).join("")}
      </div>
      <form class="modal-form coachrx-setup-form" data-form="coachrxExtensionSetup">
        <div class="section-heading">
          <div>
            <h4>Valeurs a fournir aux coachs</h4>
            <p>Ces champs sont stockes dans Firestore. Ne colle pas ces valeurs dans un fichier public ou une capture partagee.</p>
          </div>
          <span class="pill ${setup.syncSecret && setup.webAppUrl ? "green" : "amber"}">${setup.syncSecret && setup.webAppUrl ? "Pret" : "A completer"}</span>
        </div>
        <div class="form-grid">
          <label>
            Lien de telechargement ZIP
            <input class="input" name="extensionDownloadUrl" value="${escapeAttr(setup.extensionDownloadUrl || COACHRX_EXTENSION_PUBLIC_DOWNLOAD)}" autocomplete="off">
          </label>
          <label>
            Version extension
            <input class="input" name="extensionVersion" value="${escapeAttr(setup.extensionVersion || COACHRX_EXTENSION_VERSION)}" autocomplete="off">
          </label>
        </div>
        <label>
          URL Apps Script Web App
          <input class="input" name="webAppUrl" value="${escapeAttr(setup.webAppUrl || "")}" autocomplete="off" placeholder="Coller l'URL Web App Apps Script">
        </label>
        <label>
          Secret de synchronisation
          <input class="input" name="syncSecret" type="password" value="" autocomplete="new-password" placeholder="${escapeAttr(secretState)}">
          <small>Laisse vide pour conserver le secret actuel. Les coachs verront seulement un bouton Copier secret.</small>
        </label>
        <label>
          Note d'installation
          <textarea class="input" name="installNote" placeholder="Ex.: utiliser Chrome, extraire le ZIP avant de charger l'extension.">${escapeHtml(setup.installNote || "")}</textarea>
        </label>
        <div class="modal-actions">
          <span class="setup-status">Derniere mise a jour: ${escapeHtml(setupUpdated)}</span>
          <button class="primary" type="submit">Enregistrer configuration</button>
        </div>
      </form>
      <div class="focus-note">
        <strong>Chemin recommande</strong>
        <p>Le coach telecharge le ZIP ici, l'installe en mode developpeur, puis copie l'URL et le secret depuis le Guide. Rien de sensible n'est code dans les fichiers publics.</p>
      </div>
    </section>
  `;
}

function renderGuideSourceReference(sourceTruthRows, sourceMap, modules) {
  return `
    <div class="source-map">
      <h4>Sources de verite</h4>
      <div class="source-truth-table" aria-label="Resume des sources de verite du dashboard">
        ${sourceTruthRows.map(([scope, truth, decision]) => `
          <div class="source-truth-row">
            <span>${escapeHtml(scope)}</span>
            <strong>${escapeHtml(truth)}</strong>
            <small>${escapeHtml(decision)}</small>
          </div>
        `).join("")}
      </div>
      <div class="diagnostic-grid">
        ${sourceMap.map(([source, role, detail]) => `
          <div class="diagnostic-metric">
            <span>${escapeHtml(source)}</span>
            <strong>${escapeHtml(role)}</strong>
            <small>${escapeHtml(detail)}</small>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="cards">
      ${modules.map(([title, text]) => `<article class="card"><div><h4>${title}</h4><p class="meta">${text}</p></div></article>`).join("")}
    </div>
  `;
}

function renderSourceActivationRoadmap() {
  if (!isInfoAdmin()) return "";
  const sources = [
    ["CoachRx", "Pret local, attend pont live", "Clients et contexte coach. Premier write limite a un coach pilote, sans Sheet obligatoire."],
    ["Repertoire client", "Source telephone a confirmer", "GHL, CSM, Kilo ou repertoire admin doit enrichir les telephones sans ecraser les champs manuels."],
    ["GoHighLevel", "Serveur seulement", "Lien strict par telephone; aucun appel GHL ou token dans le navigateur."],
    ["Questionnaire V2", "Inbox prete, bridge a valider", "Reponses par cle de champ, non matchees a valider, aucune fausse To-do."],
    ["Check-ups CSM", "Pret pour Performance", "Lecture seulement: alimente Performance et historique sans modifier la fiche client."],
    ["Rebooking", "Parite legacy avant write", "Comparer avec l'app actuelle; aucun item marque suivi fait ou seance rebookee ne doit redevenir ouvert."]
  ];
  return `
    <section class="source-activation">
      <div class="section-heading">
        <div>
          <h4>Activation des sources</h4>
          <p>Ordre de branchement vers Firestore. Chaque source doit passer par un preview, un write pilote et une preuve dans le dashboard.</p>
        </div>
      </div>
      <div class="diagnostic-grid">
        ${sources.map(([name, status, detail]) => `
          <div class="diagnostic-metric">
            <span>${escapeHtml(name)}</span>
            <strong>${escapeHtml(status)}</strong>
            <small>${escapeHtml(detail)}</small>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSheetAccessChecklist() {
  if (!isInfoAdmin()) return "";
  const recentSheetAccessError = (state.data.syncRequests || []).some((request) => {
    const message = String(request.errorMessage || "");
    return request.status === "error" && /Google Sheet|Google Sheets|Acces Google Sheets|Partage le Sheet/i.test(message);
  });
  const className = recentSheetAccessError ? "pilot-validation sheet-access warning" : "pilot-validation sheet-access";
  return `
    <section class="${className}">
      <div class="pilot-validation-header">
        <div>
          <h4>Acces aux sources d'import</h4>
          <p>La sync historique lit encore certains Sheets avec le compte serveur. La cible est de pousser les sources vivantes vers Firestore via Apps Script/Bob et Cloud Functions.</p>
        </div>
        <span class="pill ${recentSheetAccessError ? "red" : "amber"}">${recentSheetAccessError ? "Bloquant" : "A confirmer"}</span>
      </div>
      <div class="notice compact">
        <strong>Compte serveur pour les Sheets encore utilises</strong>
        <span>${escapeHtml(FIREBASE_SYNC_SERVICE_ACCOUNT)}</span>
      </div>
      <div class="cards compact-cards">
        ${REQUIRED_SHEET_ACCESS.map((sheet) => `
          <article class="card">
            <div>
              <h4><a href="${escapeAttr(sheet.url)}" target="_blank" rel="noreferrer">${escapeHtml(sheet.title)}</a></h4>
              <p class="meta">${escapeHtml(sheet.role)}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSyncRequestDiagnostics() {
  if (!isInfoAdmin()) return "";
  const requests = (state.data.syncRequests || []).slice(0, 5);
  if (!requests.length) return "";
  return `
    <section class="pilot-validation sync-request-diagnostics">
      <div class="pilot-validation-header">
        <div>
          <h4>Demandes de synchronisation</h4>
          <p>File Firestore utilisee quand Cloud Run bloque les appels HTTP publics.</p>
        </div>
        <span class="pill">${requests.length} recentes</span>
      </div>
      <div class="cards compact-cards">
        ${requests.map((request) => `
          <article class="card">
            <div>
              <h4>${escapeHtml(syncRequestTitle(request))}</h4>
              <p class="meta">${escapeHtml(syncRequestSummary(request))}</p>
              ${request.errorMessage ? `<p class="meta error-text">${escapeHtml(request.errorMessage)}</p>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPilotCoachMatrix() {
  if (!isInfoAdmin()) return "";
  const rows = PILOT_COACHES.map((coach) => {
    const row = pilotCoachMatrixRow(coach, syncContextForCoach(coach.id));
    return `
      <tr>
        <td>
          <strong>${escapeHtml(coach.name)}</strong>
          <small>CoachRx ${escapeHtml(coach.coachRxId || coach.id)}</small>
        </td>
        <td><span class="pill ${row.statusClass}">${escapeHtml(row.statusLabel)}</span></td>
        <td>${escapeHtml(row.syncLabel)}</td>
        <td>${numberCell(row.clientsImported)}</td>
        <td>${numberCell(row.clientsMissingPhone)}</td>
        <td>${numberCell(row.tasksImported)}</td>
        <td>${numberCell(row.questionnaireResponsesImported)}</td>
        <td>${numberCell(row.rebookingsImported)}</td>
        <td>${numberCell(row.checkupsImported)}</td>
        <td>${numberCell(row.impactsImported)}</td>
        <td>${escapeHtml(row.nextStep)}</td>
      </tr>
    `;
  }).join("");
  return `
    <section class="pilot-validation pilot-matrix">
      <div class="pilot-validation-header">
        <div>
          <h4>Etat des coachs pilotes</h4>
          <p>Vue admin pour reperer rapidement les coachs vides, les telephones manquants et les imports a corriger.</p>
        </div>
        <span class="pill">Matrice sync</span>
      </div>
      <div class="pilot-matrix-scroll">
        <table>
          <thead>
            <tr>
              <th>Coach</th>
              <th>Etat</th>
              <th>Derniere sync</th>
              <th>Clients</th>
              <th>Sans tel.</th>
              <th>To-do</th>
              <th>Questionnaires</th>
              <th>Rebookings</th>
              <th>Check-ups</th>
              <th>Impacts</th>
              <th>Prochaine action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function pilotCoachMatrixRow(coach, context) {
  if (!context) {
    return {
      statusClass: "amber",
      statusLabel: "Pas de sync",
      syncLabel: "Aucune",
      clientsImported: 0,
      clientsMissingPhone: 0,
      tasksImported: 0,
      questionnaireResponsesImported: 0,
      rebookingsImported: 0,
      checkupsImported: 0,
      impactsImported: 0,
      nextStep: "Lancer Sync tous ou Synchroniser ce coach."
    };
  }
  const selected = context.selected || {};
  const diagnostics = selected.diagnostics || {};
  const available = diagnostics.sourceRowsAvailable || {};
  const matched = diagnostics.matchedRows || {};
  const importedClients = diagnostics.importedClients || {};
  const importedRebookings = diagnostics.importedRebookings || {};
  const clientsImported = Number(selected.clientsImported || 0);
  const clientsMissingPhone = Number(selected.clientsMissingPhone ?? importedClients.missingPhone ?? 0);
  const sourceRows = Number(available.coreClients || 0) + Number(available.coachRx || 0);
  const matchedRows = Number(matched.coreClients || 0) + Number(matched.coachRx || 0);
  const syncAge = daysSince(syncTimestamp(context.run));
  let statusClass = "green";
  let statusLabel = "Pret";
  if (sourceRows === 0 || matchedRows === 0 || clientsImported === 0) {
    statusClass = "red";
    statusLabel = "Vide";
  } else if (clientsMissingPhone > 0 || syncAge >= 2) {
    statusClass = "amber";
    statusLabel = "A verifier";
  }
  return {
    statusClass,
    statusLabel,
    syncLabel: `${formatDateTime(syncTimestamp(context.run))} (${context.sourceLabel})`,
    clientsImported,
    clientsMissingPhone,
    tasksImported: Number(selected.tasksImported || 0),
    questionnaireResponsesImported: Number(selected.questionnaireResponsesImported || 0),
    rebookingsImported: Number(selected.rebookingsImported || 0),
    rebookingsMissingClient: Number(importedRebookings.openMissingClientId ?? importedRebookings.missingClientId ?? 0),
    checkupsImported: Number(selected.checkupsImported || 0),
    impactsImported: Number(selected.impactsImported || 0),
    nextStep: syncNextStep(context)
  };
}

function numberCell(value) {
  const number = Number(value || 0);
  return `<span class="${number > 0 ? "count-positive" : "count-empty"}">${number}</span>`;
}

function renderPilotCoachChecklist() {
  const coach = activeCoachRecord();
  const coachLabel = coach?.name || "coach selectionne";
  const sections = [
    ["Connexion", "Le coach se connecte, arrive sur son propre compte par defaut, puis peut changer de coach au besoin."],
    ["To-do", "Les missions visibles sont concretes: programme CoachRx rouge/jaune, questionnaire a lire, rebooking ou note manuelle."],
    ["Clients", "La recherche trouve rapidement 3 clients connus; une fiche permet mission, rebooking, questionnaire, alumni ou transfert."],
    ["Questionnaires", "Un envoi test fonctionne, la reponse revient dans A lire, puis peut etre lue ou transformee en mission."],
    ["Rebooking", "La vue montre seulement les seances a remettre; le coach peut fermer, ajuster ou relier sans etape de confirmation inutile."],
    ["Performance", "Les chiffres par periode semblent plausibles et l'objectif trimestriel est visible/modifiable."],
    ["Mobile", "Le coach peut ouvrir le menu, changer de module, rechercher un client et fermer une modale depuis son telephone."]
  ];
  return `
    <section class="pilot-coach-checklist">
      <div class="pilot-validation-header">
        <div>
          <h4>Checklist pilote coach</h4>
          <p>Parcours court pour tester ${escapeHtml(coachLabel)} avant de partager plus largement.</p>
        </div>
        <span class="pill">Pilote terrain</span>
      </div>
      <div class="pilot-checklist-grid">
        ${sections.map(([title, body], index) => `
          <div class="pilot-checklist-item">
            <span>${index + 1}</span>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(body)}</p>
          </div>
        `).join("")}
      </div>
      <div class="notice compact">
        <strong>Retour attendu</strong>
        <span>Bloquant, irritant, ou OK. Une capture annotee suffit pour transformer le test en correctif.</span>
      </div>
    </section>
  `;
}

function renderPilotValidation() {
  const coach = activeCoachRecord();
  const clients = activeClients();
  const missingPhones = clients.filter((client) => !clientPhone(client));
  const openTasks = state.data.tasks.filter(isOpenTask);
  const urgentTasks = openTasks.filter((task) => task.priority === "P1");
  const responsesToRead = questionnaireResponsesToRead();
  const questionnaireFollowups = questionnaireSendsWaitingForResponse();
  const questionnaireResponses = portfolioQuestionnaireResponses();
  const rebookings = portfolioRebookings();
  const unmatchedResponses = questionnaireResponses.filter((item) => (item.processingStatus || "") === "unmatched");
  const openRebookings = rebookings.filter((item) => (item.status || "open") === "open");
  const managedRebookings = rebookings.filter((item) => ["managed", "rebooked", "coach_absence"].includes(item.status));
  const impacts = portfolioImpacts().filter((item) => item.status !== "deleted");
  const syncStatus = state.data.syncStatus;
  const blockers = pilotValidationBlockers({
    coach,
    clients,
    missingPhones,
    syncStatus,
    responsesToRead,
    openRebookings
  });

  return `
    <section class="pilot-validation">
      <div class="pilot-validation-header">
        <div>
          <h4>Validation pilote</h4>
          <p>Etat reel du coach selectionne avant de faire une demo ou une validation avec l'equipe.</p>
        </div>
        <span class="pill ${blockers.length ? "amber" : "green"}">${blockers.length ? "A verifier" : "Pret a tester"}</span>
      </div>
      <div class="diagnostic-grid">
        ${diagnosticMetric("Clients actifs", clients.length, null, "charges dans l'app")}
        ${diagnosticMetric("Sans telephone", missingPhones.length, null, "bloque l'envoi questionnaire")}
        ${diagnosticMetric("To-do ouvertes", openTasks.length, null, `${urgentTasks.length} urgente(s)`)}
        ${diagnosticMetric("Reponses a lire", responsesToRead.length, null, "inbox questionnaire")}
        ${diagnosticMetric("Relances questionnaire", questionnaireFollowups.length, null, "vrai envoi sans reponse")}
        ${diagnosticMetric("Non matchees", unmatchedResponses.length, null, "a valider par telephone")}
        ${diagnosticMetric("Rebookings ouverts", openRebookings.length, null, `${managedRebookings.length} traites/historique`)}
        ${diagnosticMetric("Impacts", impacts.length, null, "brouillon, confirme ou annule")}
      </div>
      ${blockers.length ? `
        <div class="warning-list pilot-warning">
          <strong>Avant de tester</strong>
          ${blockers.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
        </div>
      ` : ""}
      <div class="pilot-steps">
        <strong>Parcours de validation recommande</strong>
        <ol>
          <li>Choisir Marc-Andre ou Iheb, puis verifier que le portefeuille client n'est pas vide.</li>
          <li>Ouvrir une fiche client, confirmer telephone, fin membership manuelle et recurrence Kilo.</li>
          <li>Traiter une To-do ou creer une note coach, puis verifier le retour visuel.</li>
          <li>Envoyer un questionnaire a un client avec telephone, puis suivre Envoyes sans reponse ou Reponses a lire.</li>
          <li>Ouvrir Rebooking, changer un statut, consulter l'historique et tester Reouvrir.</li>
          <li>Ajouter ou modifier un impact dans Performance.</li>
        </ol>
      </div>
    </section>
  `;
}

function renderCoachActionPlan() {
  const coach = activeCoachRecord();
  if (!coach) return "";
  const clients = activeClients();
  const missingPhones = clients.filter((client) => !clientPhone(client));
  const openTasks = state.data.tasks.filter(isOpenTask);
  const taskSources = countBy(openTasks, (task) => task.source || "manual");
  const taskTypes = countBy(openTasks, (task) => task.type || "task");
  const programTasks = openTasks.filter((task) => task.type === "program");
  const importedProgramTasks = programTasks.filter((task) => task.source === "google_sheets_tasks_current");
  const responsesToRead = sortQuestionnaireResponsesByPriority(questionnaireResponsesToRead());
  const unmatchedResponses = portfolioQuestionnaireResponses().filter((item) => (item.processingStatus || "") === "unmatched");
  const waitingSends = questionnaireSendsWaitingForResponse();
  const rebookings = portfolioRebookings();
  const openRebookings = rebookings.filter((item) => (item.status || "open") === "open");
  const weakRebookings = rebookings.filter((item) => !item.clientId || !item.clientPhoneNormalized || item.matchMethod === "name" || item.matchMethod === "unmatched");
  const context = syncContextForCoach();
  const nextSteps = coachActionPlanItems({
    coach,
    clients,
    missingPhones,
    openTasks,
    taskSources,
    taskTypes,
    importedProgramTasks,
    responsesToRead,
    unmatchedResponses,
    waitingSends,
    openRebookings,
    weakRebookings,
    context
  });
  const status = nextSteps.some((item) => item.level === "critical")
    ? ["red", "A corriger avant demo"]
    : nextSteps.some((item) => item.level === "warning")
      ? ["amber", "Audit recommande"]
      : ["green", "Pret a valider"];

  return `
    <section class="pilot-validation action-plan">
      <div class="pilot-validation-header">
        <div>
          <h4>Plan d'action du coach selectionne</h4>
          <p>Ce bloc transforme les diagnostics en choses a verifier ou corriger maintenant.</p>
        </div>
        <span class="pill ${status[0]}">${status[1]}</span>
      </div>
      <div class="action-plan-grid">
        ${nextSteps.map(renderCoachActionPlanItem).join("")}
      </div>
    </section>
  `;
}

function coachActionPlanItems({ clients, missingPhones, openTasks, taskSources, taskTypes, importedProgramTasks, responsesToRead, unmatchedResponses, waitingSends, openRebookings, weakRebookings, context }) {
  const items = [];
  const syncAge = context ? daysSince(syncTimestamp(context.run)) : null;
  const taskSourceSummary = Object.entries(taskSources)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 3)
    .map(([source, count]) => `${sourceLabel(source)}: ${count}`)
    .join(" | ");
  const taskTypeSummary = Object.entries(taskTypes)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 3)
    .map(([type, count]) => `${taskTypeLabel(type)}: ${count}`)
    .join(" | ");

  if (!context) {
    items.push(actionPlanItem("Source", "critical", "Aucune sync confirmee", "Lancer une sync pour savoir si le coach a des donnees disponibles."));
  } else if (syncAge >= 2) {
    items.push(actionPlanItem("Source", "warning", "Sync a rafraichir", `Derniere sync: ${formatDateTime(syncTimestamp(context.run))}. Relancer avant une validation equipe.`));
  } else {
    items.push(actionPlanItem("Source", "ok", "Sync recente", `${formatDateTime(syncTimestamp(context.run))}. Les diagnostics peuvent etre utilises pour auditer ce coach.`));
  }

  if (!clients.length) {
    items.push(actionPlanItem("Clients", "critical", "Portefeuille vide", "Verifier les sources CoachRx/CORE_Clients, l'ID CoachRx et les alias du coach."));
  } else if (missingPhones.length) {
    items.push(actionPlanItem("Clients", "warning", `${missingPhones.length} telephone(s) manquant(s)`, `Completer en priorite: ${sampleNames(missingPhones)}. Le telephone est la cle questionnaire/GHL.`));
  } else {
    items.push(actionPlanItem("Clients", "ok", `${clients.length} clients actifs`, "Les fiches ont un telephone exploitable pour le matching principal."));
  }

  if (importedProgramTasks.length >= 8) {
    items.push(actionPlanItem("To-do", "warning", `${importedProgramTasks.length} programmes importes`, "Comparer avec CoachRx. Ces taches viennent de TASKS_Current; si elles sont fausses, corriger la source plutot que les traiter une par une."));
  } else if (openTasks.length) {
    items.push(actionPlanItem("To-do", "ok", `${openTasks.length} action(s) ouverte(s)`, `${taskTypeSummary || "Actions ouvertes"}. Sources: ${taskSourceSummary || "non precisees"}.`));
  } else {
    items.push(actionPlanItem("To-do", "ok", "Aucune action ouverte", "La page quotidienne est vide pour ce coach."));
  }

  if (unmatchedResponses.length) {
    items.push(actionPlanItem("Questionnaires", "warning", `${unmatchedResponses.length} non matchee(s)`, "Valider par telephone avant de conclure que les reponses n'appartiennent pas au coach."));
  } else if (responsesToRead.length) {
    items.push(actionPlanItem("Questionnaires", "ok", `${responsesToRead.length} reponse(s) a lire`, "Lire les rouges/oranges en premier; les couleurs doivent guider la discussion coach."));
  } else if (!waitingSends.length) {
    items.push(actionPlanItem("Questionnaires", "warning", "Aucun envoi journalise", "Tester un envoi reel avec un client interne avant de presenter cette section comme stable."));
  } else {
    items.push(actionPlanItem("Questionnaires", "ok", `${waitingSends.length} envoi(s) sans reponse`, "Relance seulement apres 7 jours, pas au moment de l'envoi."));
  }

  if (weakRebookings.length) {
    items.push(actionPlanItem("Rebooking", "warning", `${weakRebookings.length} lien(s) fragile(s)`, "Verifier telephone/clientId dans la source rebooking. Prioriser les ouverts."));
  } else if (openRebookings.length) {
    items.push(actionPlanItem("Rebooking", "ok", `${openRebookings.length} ouvert(s)`, "Les statuts peuvent etre traites dans Firebase avec historique et reouverture."));
  } else {
    items.push(actionPlanItem("Rebooking", "ok", "Aucun rebooking ouvert", "Aucune action rebooking visible pour ce coach."));
  }

  return items;
}

function actionPlanItem(title, level, value, detail) {
  return { title, level, value, detail };
}

function renderCoachActionPlanItem(item) {
  return `
    <article class="action-plan-item ${escapeAttr(item.level)}">
      <span>${escapeHtml(item.title)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <p>${escapeHtml(item.detail)}</p>
    </article>
  `;
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = String(keyFn(item) || "non_precise");
    counts[key] = Number(counts[key] || 0) + 1;
    return counts;
  }, {});
}

function sampleNames(items, limit = 4) {
  const names = items.slice(0, limit).map((item) => item.name || item.clientName || "Client sans nom");
  const remaining = Math.max(0, items.length - names.length);
  return `${names.join(", ")}${remaining ? ` +${remaining}` : ""}`;
}

function pilotValidationBlockers({ coach, clients, missingPhones, syncStatus, responsesToRead, openRebookings }) {
  const blockers = [];
  if (!coach) {
    blockers.push("Aucun coach selectionne. Choisir un coach pilote avant de valider les onglets.");
  }
  if (!syncStatus) {
    blockers.push("Aucune sync confirmee pour ce coach. Lancer Synchroniser ce coach ou Synchroniser tous les coachs.");
  } else if (daysSince(syncStatus.syncedAt) >= 2) {
    blockers.push("La derniere sync date de plus de deux jours. Rafraichir avant une demo avec l'equipe.");
  }
  if (!clients.length) {
    blockers.push("Aucun client actif charge. Consulter le diagnostic sync pour savoir si la source est vide ou si le matching coach echoue.");
  }
  if (missingPhones.length) {
    blockers.push(`${missingPhones.length} client(s) actif(s) sans telephone. Le questionnaire et le matching GHL seront incomplets.`);
  }
  if (!responsesToRead.length && !openRebookings.length && clients.length) {
    blockers.push("Les clients sont charges, mais il n'y a pas encore de reponse questionnaire ou de rebooking ouvert a valider.");
  }
  return blockers;
}

function questionnaireResponsesToRead() {
  return portfolioQuestionnaireResponses().filter((item) => {
    const status = item.processingStatus || "to_read";
    return status === "to_read" || status === "assigned";
  });
}

function sortQuestionnaireResponsesByPriority(responses) {
  return [...responses].sort((a, b) => {
    const priority = questionnairePriorityRank(b) - questionnairePriorityRank(a);
    if (priority) return priority;
    return dateValue(b.submittedAt || b.createdAt) - dateValue(a.submittedAt || a.createdAt);
  });
}

function questionnairePriorityRank(response) {
  const ranks = { rouge: 4, orange: 3, jaune: 2, vert: 1 };
  return ranks[String(response?.triageStatus || "").toLowerCase()] || 0;
}

function sortQuestionnaireItemsByPriority(items) {
  return [...items].sort((a, b) => {
    const aResponse = questionnaireRepresentativeResponse(a);
    const bResponse = questionnaireRepresentativeResponse(b);
    const priority = questionnairePriorityRank(bResponse) - questionnairePriorityRank(aResponse);
    if (priority) return priority;
    return dateValue(bResponse.submittedAt || bResponse.createdAt) - dateValue(aResponse.submittedAt || aResponse.createdAt);
  });
}

function groupQuestionnaireResponsesForCoach(responses) {
  const groups = new Map();
  sortQuestionnaireResponsesByPriority(responses).forEach((response) => {
    const key = questionnaireResponseGroupKey(response);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(response);
  });
  return sortQuestionnaireItemsByPriority([...groups.values()].map((items) => {
    if (items.length === 1) return items[0];
    const sorted = sortQuestionnaireResponsesByPriority(items);
    const representative = sorted[0];
    const typeLabels = [...new Set(sorted.map((item) => questionnaireTypeLabel(questionnaireResponseType(item))))];
    return {
      _kind: "questionnaire_response_group",
      id: `questionnaire_group_${questionnaireResponseGroupKey(representative)}`,
      clientId: representative.clientId || "",
      clientName: representative.clientName || representative.name || "Client",
      triageStatus: representative.triageStatus,
      submittedAt: representative.submittedAt || representative.createdAt,
      createdAt: representative.createdAt,
      responses: sorted,
      responseCount: sorted.length,
      typeLabels,
      searchText: [
        representative.clientName,
        representative.name,
        questionnaireResponsePhone(representative),
        typeLabels.join(" "),
        ...sorted.map((item) => searchableText(item))
      ].join(" ")
    };
  }));
}

function questionnaireResponseGroupKey(response) {
  return String(response.clientId || questionnaireResponsePhone(response) || normalizeComparable(response.clientName || response.name) || response.id || "").trim();
}

function questionnaireRepresentativeResponse(item) {
  return item?._kind === "questionnaire_response_group" ? item.responses[0] : item;
}

function questionnaireTriageCounts(responses) {
  return responses.reduce((counts, response) => {
    const status = String(response.triageStatus || "sans_statut").toLowerCase();
    counts[status] = Number(counts[status] || 0) + 1;
    return counts;
  }, { rouge: 0, orange: 0, jaune: 0, vert: 0, sans_statut: 0 });
}

function applyQuestionnaireTriageFilter(responses, filter = "all") {
  if (!filter || filter === "all") return responses;
  return responses.filter((response) => String(response.triageStatus || "").toLowerCase() === filter);
}

function sortQuestionnaireSendClients(a, b) {
  const phoneSort = Number(Boolean(clientPhone(b))) - Number(Boolean(clientPhone(a)));
  if (phoneSort) return phoneSort;
  const aLast = questionnaireSendDate(latestSendForClient(a.id));
  const bLast = questionnaireSendDate(latestSendForClient(b.id));
  if (aLast !== bLast) return aLast - bLast;
  return String(a.name || "").localeCompare(String(b.name || ""));
}

function questionnaireSendsWaitingForResponse() {
  const responses = portfolioQuestionnaireResponses();
  return portfolioQuestionnaireSends().filter((item) => {
    return item.status === "sent" && !item.answeredAt && !questionnaireSendHasResponse(item, responses);
  });
}

function recentQuestionnaireSends() {
  return [...portfolioQuestionnaireSends()]
    .sort((a, b) => dateValue(b.updatedAt || b.sentAt || b.createdAt) - dateValue(a.updatedAt || a.sentAt || a.createdAt))
    .slice(0, 5);
}

function renderSyncDiagnostics() {
  if (!isInfoAdmin()) return "";
  const context = syncContextForCoach();
  if (!context) {
    return `
      <div class="notice compact sync-diagnostics">
        <strong>Diagnostic sync Google Sheets</strong>
        <p>Aucune synchronisation Google Sheets vers Firebase trouvee pour ce coach dans cette session ou dans l'historique Firebase.</p>
        <div class="notice-actions">
          <button class="primary" data-action="syncSheetsAll">Synchroniser tous les coachs</button>
        </div>
      </div>
    `;
  }
  const { run: result, selected, sourceLabel } = context;
  const diagnostics = selected.diagnostics || {};
  const available = diagnostics.sourceRowsAvailable || {};
  const matched = diagnostics.matchedRows || {};
  const importedClients = diagnostics.importedClients || {};
  const importedTasks = diagnostics.importedTasks || {};
  const importedRebookings = diagnostics.importedRebookings || {};
  const staleCleanup = diagnostics.staleCleanup || {};
  const tasksByType = importedTasks.byType || {};
  const rebookingsByStatus = importedRebookings.byStatus || {};
  const ghlPhoneEnrichment = importedClients.ghlPhoneEnrichment || {};
  const headers = diagnostics.sourceHeaders || result.sourceOverview?.headers || {};
  const samples = diagnostics.sourceSamples || result.sourceOverview?.samples || {};
  const matchingAudit = diagnostics.matchingAudit || {};
  const syncAge = daysSince(syncTimestamp(result));
  const warnings = [
    ...(Array.isArray(result.warnings) ? result.warnings : []),
    ...(Array.isArray(selected.warnings) ? selected.warnings : [])
  ];
  return `
    <div class="notice compact sync-diagnostics">
      <div>
        <strong>Diagnostic sync Google Sheets</strong>
        <p>
          Coach: ${escapeHtml(selected.coachName || activeCoachRecord()?.name || state.selectedCoachId || "non selectionne")}
          | Source: ${escapeHtml(sourceLabel)}
          | Declencheur: ${syncTriggerLabel(result.triggeredBy)}
          | ${formatDateTime(syncTimestamp(result))}
          | ${syncAge >= 2 ? `a rafraichir (${syncAge} jours)` : "recent"}
        </p>
      </div>
      <div class="diagnostic-grid">
        ${diagnosticMetric("Clients importes", selected.clientsImported, null, "resultat Firebase")}
        ${diagnosticMetric("Sans telephone", selected.clientsMissingPhone ?? importedClients.missingPhone, null, "impact questionnaire/GHL")}
        ${diagnosticMetric("Tel enrichis GHL", ghlPhoneEnrichment.enriched, ghlPhoneEnrichment.attempted, "match exact par nom")}
        ${diagnosticMetric("GHL non unique", ghlPhoneEnrichment.skippedNoUniqueMatch, null, "a valider manuellement")}
        ${diagnosticMetric("Taches importees", selected.tasksImported, null, "resultat Firebase")}
        ${diagnosticMetric("Taches programme", tasksByType.program || 0, importedTasks.explicitTaskRowsMatched, "programmes / lignes TASKS_Current")}
        ${diagnosticMetric("Taches questionnaire", tasksByType.questionnaire_followup || 0, null, "creees depuis reponses a traiter")}
        ${diagnosticMetric("Taches stale archivees", staleCleanup.tasksArchivedStale || 0, null, "nettoyees par sync")}
        ${diagnosticMetric("Questionnaires importes", selected.questionnaireResponsesImported, null, "resultat Firebase")}
        ${diagnosticMetric("Rebookings importes", selected.rebookingsImported, null, "resultat Firebase")}
        ${diagnosticMetric("Rebookings ouverts", rebookingsByStatus.open || 0, null, "a traiter")}
        ${diagnosticMetric("Rebookings non relies", importedRebookings.missingClientId || 0, null, "client/telephone a valider")}
        ${diagnosticMetric("Check-ups importes", selected.checkupsImported, null, "resultat Firebase")}
        ${diagnosticMetric("Impacts importes", selected.impactsImported, null, "resultat Firebase")}
        ${diagnosticMetric("Alumni importes", selected.alumniImported, null, "resultat Firebase")}
      </div>
      ${renderDataQualitySummary({ selected, diagnostics, importedClients, importedRebookings, staleCleanup, syncAge })}
      <div class="diagnostic-grid">
        ${diagnosticMetric("CORE_Clients", available.coreClients, matched.coreClients)}
        ${diagnosticMetric("CoachRx", available.coachRx, matched.coachRx)}
        ${diagnosticMetric("TASKS_Current", available.tasks, matched.tasks)}
        ${diagnosticMetric("Questionnaires", available.questionnaireRows, matched.questionnaireRows)}
        ${diagnosticMetric("Rebookings", available.rebookings, matched.rebookings)}
        ${diagnosticMetric("Check-ups CSM", available.checkups, matched.checkups)}
        ${diagnosticMetric("Alumni", available.alumni, matched.alumni)}
        ${diagnosticMetric("Impacts", available.impacts, matched.impacts)}
      </div>
      ${warnings.length ? `
        <div class="warning-list">
          <strong>Avertissements</strong>
          ${warnings.slice(0, 6).map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}
        </div>
      ` : ""}
      <div class="sync-next-step">
        <strong>Prochaine action recommandee</strong>
        <p>${escapeHtml(syncNextStep(context))}</p>
      </div>
      ${renderSourceHeaderAudit(headers)}
      ${renderCoachSignalSamples(samples)}
      ${renderMatchingAudit(matchingAudit)}
    </div>
  `;
}

function renderDataQualitySummary({ selected = {}, diagnostics = {}, importedClients = {}, importedRebookings = {}, staleCleanup = {}, syncAge = 0 }) {
  const responses = portfolioQuestionnaireResponses();
  const reviewResponses = questionnaireResponsesForAdminReview();
  const rebookings = portfolioRebookings();
  const blockedRelations = blockedOperationalRecordsByCollection();
  const blockedRelationCount = blockedRelations.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const missingPhone = Number(selected.clientsMissingPhone ?? importedClients.missingPhone ?? 0);
  const unmatchedResponses = uniqueById([
    ...responses.filter((item) => (item.processingStatus || "") === "unmatched"),
    ...reviewResponses
  ]).length;
  const toReadResponses = questionnaireResponsesToRead().length;
  const waitingSends = questionnaireSendsWaitingForResponse().length;
  const unmatchedRebookings = Number(importedRebookings.missingClientId || rebookings.filter((item) => !item.clientId).length || 0);
  const staleTasks = Number(staleCleanup.tasksArchivedStale || 0);
  const sourceRows = diagnostics.sourceRowsAvailable || {};
  const matchedRows = diagnostics.matchedRows || {};
  const cards = [
    dataQualityCard("Telephones", missingPhone ? "warning" : "ok", missingPhone ? `${missingPhone} client(s) a completer` : "OK", missingPhone ? "Bloque ou fragilise questionnaire, GHL et liaison client." : "Lien par telephone utilisable."),
    dataQualityCard("Questionnaires", unmatchedResponses ? "warning" : "ok", `${toReadResponses} a lire / ${unmatchedResponses} a valider`, unmatchedResponses ? "Relier les reponses non reconnues par telephone." : "Les reponses reconnues sont pretes a lire."),
    dataQualityCard("Envois", waitingSends ? "neutral" : "ok", `${waitingSends} sans reponse`, waitingSends ? "Relance seulement apres 7 jours d'attente." : "Aucun envoi en attente de relance."),
    dataQualityCard("Rebooking", unmatchedRebookings ? "warning" : "ok", unmatchedRebookings ? `${unmatchedRebookings} non relies` : "OK", unmatchedRebookings ? "Completer telephone/client dans la source rebooking." : "Les liens client sont exploitables."),
    dataQualityCard("Appartenance", blockedRelationCount ? "warning" : "ok", blockedRelationCount ? `${blockedRelationCount} relation(s) bloquee(s)` : "OK", blockedRelationCount ? "Ces elements sont retires des workflows coach jusqu'a reconciliation admin." : "Aucune relation explicite vers une fiche non confirmee."),
    dataQualityCard("Fraicheur", syncAge >= 2 ? "warning" : "ok", syncAge >= 2 ? "A rafraichir" : "Recent", syncAge >= 2 ? "Relancer Sync tous avant une demo." : "Sync assez recente pour valider."),
    dataQualityCard("Nettoyage", staleTasks ? "neutral" : "ok", `${staleTasks} stale archivee(s)`, staleTasks ? "Anciennes To-do masquees par la sync." : "Aucun vieux bruit detecte.")
  ];
  const totalSourceRows = Object.values(sourceRows).reduce((sum, value) => sum + Number(value || 0), 0);
  const totalMatchedRows = Object.values(matchedRows).reduce((sum, value) => sum + Number(value || 0), 0);
  return `
    <section class="data-quality-summary">
      <div class="data-quality-header">
        <strong>Qualite des donnees pour ce coach</strong>
        <span>${totalMatchedRows}/${totalSourceRows} ligne(s) source matchee(s). Le but est de savoir quoi corriger, pas seulement afficher des chiffres.</span>
      </div>
      <div class="data-quality-grid">${cards.join("")}</div>
    </section>
  `;
}

function dataQualityCard(label, level, value, detail) {
  return `
    <div class="data-quality-card ${escapeAttr(level)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function syncContextForCoach(coachId = state.selectedCoachId) {
  const sessionRun = state.lastSyncResult && syncRunIncludesCoach(state.lastSyncResult, coachId)
    ? state.lastSyncResult
    : null;
  const run = sessionRun || latestSyncRunForCoach(coachId);
  const status = state.data.syncStatus && String(state.data.syncStatus.coachId || state.data.syncStatus.id || "") === String(coachId)
    ? state.data.syncStatus
    : null;
  if (!run && status) {
    const statusRun = {
      ...status,
      results: [status],
      coachIds: [coachId],
      warnings: Array.isArray(status.warnings) ? status.warnings : [],
      finishedAt: status.syncedAt,
      completedAt: status.syncedAt,
      createdAt: status.syncedAt,
      triggeredBy: status.triggeredBy || "system"
    };
    return {
      run: statusRun,
      selected: status,
      sourceLabel: "statut Firebase du coach"
    };
  }
  if (!run) return null;
  const selected = syncRunResultForCoach(run, coachId) || (run.results || [])[0] || {};
  return {
    run,
    selected,
    sourceLabel: sessionRun ? "session actuelle" : "historique Firebase"
  };
}

function latestSyncRunForCoach(coachId) {
  return (state.data.syncRuns || []).find((run) => syncRunIncludesCoach(run, coachId));
}

function latestSyncRequestForCoach(coachId) {
  return (state.data.syncRequests || []).find((request) => syncRequestIncludesCoach(request, coachId));
}

function syncRequestIncludesCoach(request, coachId) {
  if (!request || !coachId) return false;
  return request.scope === "all" || String(request.coachId || "") === String(coachId);
}

function syncRequestTitle(request) {
  const scope = request.scope === "all" ? "Tous les coachs" : `Coach ${request.coachId || "-"}`;
  const statusLabels = {
    queued: "En attente",
    running: "En cours",
    done: "Terminee",
    error: "Erreur"
  };
  return `${statusLabels[request.status] || request.status || "Demande"} - ${scope}`;
}

function syncRequestSummary(request) {
  const status = request.status || "queued";
  if (status === "queued") return `Demande envoyee ${formatDateTime(request.createdAt)}. Le serveur va la traiter automatiquement.`;
  if (status === "running") return `Synchronisation en cours depuis ${formatDateTime(request.startedAt || request.updatedAt || request.createdAt)}.`;
  if (status === "done") {
    const summary = request.resultSummary || {};
    return `Sync terminee: ${Number(summary.clientsImported || summary.clientsEnriched || 0)} clients, ${Number(summary.tasksImported || 0)} taches, ${Number(summary.rebookingsImported || 0)} rebookings, ${Number(summary.checkupsImported || 0)} check-ups.`;
  }
  if (status === "error") return `Erreur sync: ${request.errorMessage || "detail non disponible"}`;
  return `Etat sync: ${status}`;
}

function syncRunIncludesCoach(run, coachId) {
  if (!run || !coachId) return false;
  const id = String(coachId);
  const coachIds = Array.isArray(run.coachIds) ? run.coachIds.map(String) : [];
  const results = Array.isArray(run.results) ? run.results : [];
  return coachIds.includes(id) || results.some((item) => String(item.coachId) === id);
}

function syncRunResultForCoach(run, coachId) {
  return (run.results || []).find((item) => String(item.coachId) === String(coachId));
}

function syncTimestamp(run) {
  return run?.finishedAt || run?.completedAt || run?.syncedAt || run?.createdAt || "";
}

function syncTriggerLabel(value) {
  const labels = {
    manual_admin: "manuel admin",
    scheduled: "automatique",
    system: "systeme"
  };
  return labels[value] || "inconnu";
}

function diagnosticMetric(label, available, matched, helperLabel = "lignes matchees / lignes source") {
  if (matched === null || matched === undefined) {
    return `
      <div class="diagnostic-metric">
        <span>${label}</span>
        <strong>${Number(available || 0)}</strong>
        <small>${helperLabel}</small>
      </div>
    `;
  }
  return `
    <div class="diagnostic-metric">
      <span>${label}</span>
      <strong>${Number(matched || 0)} / ${Number(available || 0)}</strong>
      <small>${helperLabel}</small>
    </div>
  `;
}

function syncNextStep(context) {
  if (!context) {
    return "Lancer Synchroniser tous les coachs pour savoir si les sources Google Sheets contiennent des lignes pour ce coach.";
  }
  const selected = context.selected || {};
  const diagnostics = selected.diagnostics || {};
  const available = diagnostics.sourceRowsAvailable || {};
  const matched = diagnostics.matchedRows || {};
  const importedClients = diagnostics.importedClients || {};
  const sourceRows = Number(available.coreClients || 0) + Number(available.coachRx || 0);
  const matchedRows = Number(matched.coreClients || 0) + Number(matched.coachRx || 0);
  const clientsImported = Number(selected.clientsImported || 0);
  const missingPhone = Number(selected.clientsMissingPhone ?? importedClients.missingPhone ?? 0);
  const syncAge = daysSince(syncTimestamp(context.run));
  if (sourceRows === 0) {
    return "Verifier si CORE_Clients ou l'import CoachRx contient vraiment des lignes pour ce coach, puis relancer Sync tous.";
  }
  if (sourceRows > 0 && matchedRows === 0) {
    return "Verifier le CoachRx ID, le nom du coach et les alias dans les sources; les lignes existent mais ne sont pas reconnues pour ce coach.";
  }
  if (matchedRows > 0 && clientsImported === 0) {
    return "Verifier les entetes Nom/Client/Client ID et Telephone: des lignes matchent le coach, mais aucune fiche client exploitable n'est creee.";
  }
  if (missingPhone > 0) {
    return "Corriger les telephones manquants dans la source ou dans la fiche client; l'envoi questionnaire et le matching GHL dependent du telephone.";
  }
  if (syncAge >= 2) {
    return "Relancer Sync tous avant de valider les donnees avec l'equipe; la derniere synchronisation date de plus de deux jours.";
  }
  return "Valider les onglets Clients, To-do, Questionnaires et Rebooking pour ce coach avec les donnees maintenant synchronisees.";
}

function renderCoachSignalSamples(samples) {
  const entries = Object.entries(samples || {}).filter(([, rows]) => Array.isArray(rows) && rows.length);
  if (!entries.length) return "";
  return `
    <details class="signal-samples">
      <summary>Voir signaux coach detectes dans les sources</summary>
      ${entries.map(([source, rows]) => `
        <div>
          <strong>${escapeHtml(source)}</strong>
          ${rows.slice(0, 5).map((row) => `<p>${escapeHtml(JSON.stringify(row))}</p>`).join("")}
        </div>
      `).join("")}
    </details>
  `;
}

function renderSourceHeaderAudit(headers) {
  const entries = Object.entries(headers || {})
    .filter(([, summary]) => summary && Array.isArray(summary.normalized) && summary.normalized.length);
  if (!entries.length) return "";
  return `
    <details class="signal-samples">
      <summary>Voir entetes detectees dans les sources</summary>
      ${entries.map(([source, summary]) => `
        <div class="audit-source">
          <strong>${escapeHtml(source)} (${Number(summary.count || summary.normalized.length || 0)} colonnes)</strong>
          <p>${summary.normalized.slice(0, 20).map(escapeHtml).join(" | ")}</p>
        </div>
      `).join("")}
    </details>
  `;
}

function renderMatchingAudit(audit) {
  if (!audit || !Object.keys(audit).length) return "";
  const aliases = Array.isArray(audit.aliases) ? audit.aliases.filter(Boolean) : [];
  const unmatchedEntries = Object.entries(audit.unmatchedCoachSignals || {})
    .filter(([, rows]) => Array.isArray(rows) && rows.length);
  const missingCounts = audit.matchedRowsMissingClientName || {};
  const missingSamples = audit.matchedRowsMissingClientNameSamples || {};
  const hasMissingNames = Number(missingCounts.coreClients || 0) || Number(missingCounts.coachRx || 0);
  if (!aliases.length && !unmatchedEntries.length && !hasMissingNames) return "";
  return `
    <details class="signal-samples matching-audit">
      <summary>Audit du lien coach</summary>
      ${aliases.length ? `
        <div>
          <strong>Alias reconnus pour ce coach</strong>
          <p>${aliases.slice(0, 12).map(escapeHtml).join(" | ")}</p>
        </div>
      ` : ""}
      ${hasMissingNames ? `
        <div>
          <strong>Lignes reconnues sans nom client</strong>
          <p>CORE_Clients: ${Number(missingCounts.coreClients || 0)} | CoachRx: ${Number(missingCounts.coachRx || 0)}</p>
          ${renderAuditSamples(missingSamples)}
        </div>
      ` : ""}
      ${unmatchedEntries.length ? `
        <div>
          <strong>Signaux coach detectes mais non reconnus</strong>
          <p class="meta">Utile si les sources utilisent un libelle different de la liste officielle.</p>
          ${unmatchedEntries.map(([source, rows]) => `
            <div class="audit-source">
              <strong>${escapeHtml(source)}</strong>
              ${rows.slice(0, 5).map((row) => `<p>${escapeHtml(JSON.stringify(row))}</p>`).join("")}
            </div>
          `).join("")}
        </div>
      ` : ""}
    </details>
  `;
}

function renderAuditSamples(samplesBySource) {
  const entries = Object.entries(samplesBySource || {}).filter(([, rows]) => Array.isArray(rows) && rows.length);
  if (!entries.length) return "";
  return entries.map(([source, rows]) => `
    <div class="audit-source">
      <strong>${escapeHtml(source)}</strong>
      ${rows.slice(0, 4).map((row) => `<p>${escapeHtml(JSON.stringify(row))}</p>`).join("")}
    </div>
  `).join("");
}

function panel(title, subtitle, content, className = "") {
  return `
    <section class="panel${className ? ` ${escapeAttr(className)}` : ""}">
      <div class="panel-head">
        <div>
          <h3>${title}</h3>
          <p>${subtitle}</p>
        </div>
      </div>
      ${content}
    </section>
  `;
}

function renderSearchBox(scope, label, placeholder, total = 0, shown = 0) {
  const value = searchTerm(scope);
  return `
    <label class="search-box">
      <span>${escapeHtml(label)}</span>
      <input
        class="input"
        type="search"
        data-search="${escapeAttr(scope)}"
        value="${escapeAttr(value)}"
        placeholder="${escapeAttr(placeholder)}"
        autocomplete="off"
        inputmode="search"
      >
      <small>${value ? `${shown}/${total} resultat(s)` : `${total} element(s)`}</small>
    </label>
  `;
}

function searchTerm(scope) {
  return String(state.filter.search?.[scope] || "").trim();
}

function searchEmptyMessage(scope, fallback) {
  const term = searchTerm(scope);
  return term ? `Aucun resultat pour "${escapeHtml(term)}".` : fallback;
}

function applySearch(items, scope) {
  const term = searchTerm(scope);
  if (!term) return items;
  const tokens = normalizeSearchText(term).split(" ").filter(Boolean);
  if (!tokens.length) return items;
  return items.filter((item) => {
    const haystack = normalizeSearchText(searchableText(item));
    return tokens.every((token) => haystack.includes(token));
  });
}

function searchableText(value, depth = 0) {
  if (value == null || depth > 3) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => searchableText(item, depth + 1)).join(" ");
  if (typeof value === "object") {
    return Object.values(value).map((item) => searchableText(item, depth + 1)).join(" ");
  }
  return "";
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function renderCards(items, renderer, emptyText) {
  if (!items.length) return `<div class="empty">${emptyText}</div>`;
  return `<div class="cards">${items.map(renderer).join("")}</div>`;
}

function renderCoachDataNotice(options = {}) {
  if (!state.selectedCoachId) return "";
  if (state.data.clients.length) return "";
  const compact = Boolean(options.compact);
  const isAdminView = isInfoAdmin();
  if (clientsAreLoading()) {
    if (compact) {
      return `
        <div class="notice compact data-notice data-notice-compact data-notice-loading">
          <div>
            <strong>Chargement des clients.</strong>
            <span>La To-do s'active des que le portefeuille du coach est charge.</span>
          </div>
        </div>
      `;
    }
    return `
      <div class="notice compact data-notice data-notice-loading">
        <div>
          <strong>Chargement du portefeuille client.</strong><br>
          Les donnees du coach sont en cours de lecture.
        </div>
      </div>
    `;
  }
  if (!isAdminView) {
    const title = compact ? "Portefeuille a reconnecter." : "Aucun client charge pour ce coach.";
    const detail = compact
      ? "La To-do reste vide tant que le portefeuille client n'est pas disponible."
      : "Le dashboard ne trouve pas encore de fiche client pour ce coach. Demande a un admin de verifier la synchronisation dans Guide.";
    return `
      <div class="notice compact data-notice ${compact ? "data-notice-compact" : ""}">
        <div>
          <strong>${title}</strong>
          <span>${detail}</span>
        </div>
      </div>
    `;
  }
  const context = syncContextForCoach();
  const syncStatus = state.data.syncStatus || {};
  const selected = context?.selected || {};
  const diagnostics = selected.diagnostics || {};
  const available = diagnostics.sourceRowsAvailable || {};
  const matched = diagnostics.matchedRows || {};
  const sourceRows = Number(available.coreClients || 0) + Number(available.coachRx || 0);
  const matchedRows = Number(matched.coreClients || 0) + Number(matched.coachRx || 0);
  const clientsImported = Number(selected.clientsImported || 0);
  const statusClientsImported = Number(syncStatus.clientsImported || 0);
  const syncAge = context ? daysSince(syncTimestamp(context.run)) : 0;
  let explanation = "Aucune synchronisation recente n'a ete trouvee pour ce coach. Lance une sync Google Sheets pour importer ou confirmer la source.";
  if ((clientsImported || statusClientsImported) > 0) {
    explanation = "La derniere sync indique que des clients ont ete importes, mais l'interface n'en lit aucun. Verifie les champs coachId/coachRxId, les regles Firestore et les indexes de lecture.";
  } else if (context && sourceRows > 0 && matchedRows === 0) {
    explanation = "La source contient des lignes, mais aucune ne matche ce coach. Verifie le CoachRx ID, le nom du coach ou les alias dans les sources.";
  } else if (context && matchedRows > 0 && clientsImported === 0) {
    explanation = "Des lignes matchent ce coach, mais aucun client n'a ete cree. Verifie les colonnes nom, telephone ou client id dans les sources.";
  } else if (context && sourceRows === 0) {
    explanation = "La derniere sync n'a trouve aucune ligne client disponible dans CORE_Clients ou CoachRx pour ce coach.";
  }
  if (compact) {
    return `
      <div class="notice compact data-notice data-notice-compact">
        <div>
          <strong>Donnees client a reconnecter.</strong>
          <span>La To-do reste vide tant qu'aucune fiche client n'est lisible pour ce coach.</span>
        </div>
        ${isInfoAdmin() ? `
          <div class="notice-actions">
            <button class="primary" data-action="syncSheets">Synchroniser ce coach</button>
            <button class="secondary" data-action="syncSheetsAll">Sync tous</button>
          </div>
        ` : ""}
      </div>
    `;
  }
  return `
    <div class="notice compact data-notice">
      <div>
        <strong>Aucune donnee client n'est chargee pour ce coach dans Firebase.</strong><br>
        ${escapeHtml(explanation)}
        <div class="data-notice-detail">
          Si ce coach devrait avoir des clients, lance <strong>Sync tous</strong>. Le diagnostic affichera ensuite si les lignes Google Sheets existent mais ne matchent pas le coach.
        </div>
        ${context ? `
          <div class="data-notice-detail">
            Derniere sync: ${formatDateTime(syncTimestamp(context.run))} (${escapeHtml(context.sourceLabel)}).
            ${syncAge >= 2 ? `Donnees possiblement a rafraichir: ${syncAge} jours depuis la derniere sync.` : "Donnees recemment synchronisees."}
          </div>
          <div class="data-notice-detail">
            <strong>Prochaine action:</strong> ${escapeHtml(syncNextStep(context))}
          </div>
          <div class="diagnostic-grid mini">
            ${diagnosticMetric("CORE_Clients", available.coreClients, matched.coreClients)}
            ${diagnosticMetric("CoachRx", available.coachRx, matched.coachRx)}
            ${diagnosticMetric("Clients importes", selected.clientsImported, null, "resultat Firebase")}
            ${statusClientsImported ? diagnosticMetric("Statut sync", statusClientsImported, null, "coachSyncStatus") : ""}
          </div>
          ${renderMatchingAudit(diagnostics.matchingAudit || {})}
        ` : ""}
      </div>
      ${isInfoAdmin() ? `
        <div class="notice-actions">
          <button class="primary" data-action="syncSheets">Synchroniser ce coach</button>
          <button class="secondary" data-action="syncSheetsAll">Sync tous</button>
        </div>
      ` : ""}
    </div>
  `;
}

function todoEmptyMessage() {
  if (clientsAreLoading()) {
    return "Chargement des clients du coach...";
  }
  if (!state.data.clients.length) {
    return "Aucune action ouverte. Les donnees client de ce coach doivent etre reconnectees.";
  }
  return "Aucune action ouverte. Les clients sont charges, mais aucune priorite n'est a traiter maintenant.";
}

function collectionLoaded(collectionName) {
  return Boolean(state.data.loaded?.[collectionName]);
}

function clientsAreLoading() {
  return Boolean(state.selectedCoachId && !collectionLoaded("clients"));
}

function renderTaskCard(task) {
  const title = taskDisplayTitle(task);
  const dueLabel = taskDueLabel(task);
  const sourceNote = taskSourceNote(task);
  const starred = isStarredTask(task);
  const voiceStatusLabel = taskVoiceNoteStatusLabel(task);
  const subjectLabel = task.clientName || (task.clientId ? "Client" : "Mission coach");
  return `
    <article class="card operational-card task-card has-star-control ${task.priority === "P1" ? "urgent" : ""} ${starred ? "starred" : ""} ${taskSourceClass(task)}">
      <div class="operational-card-main">
        <div class="operational-card-heading">
          <button class="link-title" data-action="openClient" data-id="${escapeHtml(task.clientId || "")}" ${task.clientId ? "" : "disabled"}>
            ${escapeHtml(subjectLabel)}
          </button>
          <button
            class="task-star-toggle ${starred ? "active" : ""}"
            data-action="toggleTaskStar"
            data-id="${escapeHtml(task.id)}"
            type="button"
            aria-label="${starred ? "Retirer des etoilees" : "Etoiler la mission"}"
            title="${starred ? "Retirer la priorite" : "Mettre en priorite"}"
          >${starred ? "&#9733;" : "&#9734;"}</button>
        </div>
        <h4>${escapeHtml(title || "Tache")}</h4>
        <div class="operational-meta-line">
          ${dueLabel ? `<span class="operational-meta-primary">${escapeHtml(dueLabel)}</span>` : ""}
          ${sourceNote ? `<span class="decision-source">${escapeHtml(sourceNote)}</span>` : ""}
          ${taskVoiceNote(task) ? `
            <span class="decision-source voice-source">Vocal${voiceNoteDurationLabel(taskVoiceNote(task)) ? ` · ${voiceNoteDurationLabel(taskVoiceNote(task))}` : ""}</span>
          ` : ""}
          ${voiceStatusLabel ? `<span class="decision-source voice-source ${taskVoiceNoteStatus(task)}">${escapeHtml(voiceStatusLabel)}</span>` : ""}
        </div>
        ${taskVoiceNote(task) ? `
          <audio class="voice-player" preload="metadata" data-voice-player="${escapeAttr(task.id)}" ${taskVoicePlaybackUrl(task) ? `src="${escapeAttr(taskVoicePlaybackUrl(task))}"` : ""} hidden></audio>
          <span class="voice-playback-status" data-voice-playback-status="${escapeAttr(task.id)}" hidden></span>
        ` : ""}
      </div>
      <div class="card-actions operational-actions">
        ${taskActionButtons(task)}
      </div>
    </article>
  `;
}

function taskDisplayTitle(task) {
  const title = task.title || "";
  if (isCoachRxProgramTask(task)) {
    return "Mettre a jour le programme";
  }
  if (isQuestionnaireResponseTask(task)) {
    return "Lire le questionnaire";
  }
  if (task.type === "validation" || keyOf(title).includes("validerlestatutcoachrxduclient")) {
    return "Confirmer le statut du client";
  }
  return title;
}

function taskDueLabel(task) {
  if (isCoachRxProgramTask(task)) {
    return task.dueAt ? `Echeance depuis le ${formatDate(task.dueAt)}` : "Echeance a verifier";
  }
  if (isQuestionnaireResponseTask(task)) {
    const responseDate = task.responseSubmittedAt || task.submittedAt || task.dueAt;
    return responseDate ? `Reponse: ${formatDate(responseDate)}` : "Reponse recue";
  }
  if (task.type === "questionnaire_followup") {
    return task.dueAt ? `Relance: ${formatDate(task.dueAt)}` : "Relance a faire";
  }
  if (task.type === "rebooking") return task.dueAt ? `Seance a remettre: ${formatDate(task.dueAt)}` : "Seance a remettre";
  if (task.type === "validation") return "Statut a confirmer";
  return task.dueAt ? `A faire: ${formatDate(task.dueAt)}` : "";
}

function taskDisplayDescription(task, fallback) {
  const description = task.description || "";
  const clean = keyOf(description);
  if (isCoachRxProgramTask(task)) {
    return task.dueAt ? `Echeance depuis le ${formatDate(task.dueAt)}.` : "Date d'echeance a verifier.";
  }
  if (task.type === "validation" || clean.includes("statutcoachrx")) {
    return "Confirmer si ce client doit rester actif, etre masque ou etre reclasse.";
  }
  if (isQuestionnaireResponseTask(task)) {
    const responseDate = task.responseSubmittedAt || task.submittedAt || task.dueAt;
    return responseDate
      ? `Reponse recue le ${formatDate(responseDate)}. Lis, puis marque lu.`
      : "Reponse recue. Lis, puis marque lu.";
  }
  if (task.type === "questionnaire_followup") {
    return task.source === "firebase_questionnaire_followup"
      ? "Questionnaire envoye sans reponse. Relance le client."
      : fallback;
  }
  return description || fallback;
}

function todoTaskOneLine(task) {
  if (!task) return "Aucune mission ouverte";
  const client = task.clientName || "Client";
  if (isCoachRxProgramTask(task)) {
    return `${client}: programme du ${task.dueAt ? formatDate(task.dueAt) : "a verifier"}`;
  }
  if (isQuestionnaireResponseTask(task)) return `${client}: lire le questionnaire`;
  if (task.type === "questionnaire_followup") return `${client}: relancer le questionnaire`;
  if (task.type === "rebooking") return `${client}: seance a remettre`;
  if (task.type === "validation") return `${client}: statut a confirmer`;
  return `${client}: ${taskDisplayTitle(task) || "mission"}`;
}

function taskActionGuidance(task) {
  if (task.source === "google_sheets_tasks_current") {
    return importedTaskActionGuidance(task);
  }
  if (task.type === "rebooking") {
    return "S'assurer que le client recupere la seance payee, puis traiter dans Rebooking ou fermer si le suivi est regle.";
  }
  if (task.type === "questionnaire_followup") {
    return "Relancer le client parce qu'un questionnaire envoye n'a pas encore recu de reponse.";
  }
  if (task.type === "validation") {
    return "Confirmer si ce client doit rester actif, etre masque ou etre reclasse.";
  }
  if (task.type === "program") {
    return "Verifier le signal CoachRx, ajuster le programme ou le suivi, puis marquer la mission faite.";
  }
  if (task.source === "performance_rendement_reminder") {
    return "Ouvrir le document de rendement, completer les suivis requis, puis marquer fait pour reporter le rappel.";
  }
  if (task.title && keyOf(task.title).includes("declarerlesimpacts")) {
    return "Ajouter les nouveaux revenus generes cette semaine dans Pilotage, puis marquer la tache faite.";
  }
  return "Action coach a traiter, puis marquer faite ou masquer si elle n'est pas pertinente.";
}

function importedTaskActionGuidance(task) {
  if (task.type === "rebooking") {
    return "Verifier la seance a remettre dans Rebooking, puis fermer quand le client est rebooke ou que le suivi est regle.";
  }
  if (task.type === "validation") {
    return "Confirmer si ce client doit rester actif, etre masque ou etre reclasse.";
  }
  if (task.type === "program") {
    return "Traiter seulement si cette action correspond encore a la priorite du coach.";
  }
  if (task.title && keyOf(task.title).includes("declarerlesimpacts")) {
    return "Ajouter l'impact reel dans Pilotage, puis marquer la tache faite.";
  }
  return "Verifier que l'action est encore vraie, puis la traiter ou la masquer.";
}

function taskSourceClass(task) {
  if (task.source === "google_sheets_tasks_current") return "source-review";
  return "";
}

function taskSourceReviewNote(task) {
  return "";
}

function taskSourceNote(task) {
  if (task.source === "google_sheets_tasks_current") return "Tache";
  if (isCoachRxProgramTask(task)) return "";
  if (task.source === "coachrx_exercise_due") return "CoachRx";
  if (task.source === "questionnaire_followup") return "Questionnaire";
  if (task.source === "performance_rendement_reminder") return "Pilotage";
  if (task.source === "firebase_app_rebooking_mission") return "Rebooking";
  if (task.source === "quick_note" || task.source === "firebase_app_manual") return "Mission coach";
  return task.source ? "Action" : "";
}

function taskVoiceNote(task) {
  return task?.voiceNote && task.voiceNote.storagePath ? task.voiceNote : null;
}

function taskVoicePlaybackUrl(task) {
  const directUrl = String(task?.voiceNote?.downloadUrl || task?.voiceNote?.playbackUrl || "").trim();
  if (directUrl) return directUrl;
  return String(state.voicePlayback?.[task?.id]?.url || "").trim();
}

function taskVoicePlaybackState(task) {
  if (taskVoicePlaybackUrl(task)) return "ready";
  return String(state.voicePlayback?.[task?.id]?.status || "idle");
}

function taskVoicePlaybackButton(task, label = "Ecouter vocal", extraClass = "") {
  const status = taskVoicePlaybackState(task);
  const buttonLabel = status === "ready"
    ? label
    : status === "error"
      ? "Recharger vocal"
      : "Vocal en chargement";
  return `<button class="secondary ${escapeAttr(extraClass)}" type="button" data-action="playTaskVoice" data-id="${escapeHtml(task.id)}" data-ready-label="${escapeAttr(label)}" data-voice-playback-button="${escapeAttr(task.id)}" ${status === "loading" || status === "idle" ? "disabled" : ""}>${escapeHtml(buttonLabel)}</button>`;
}

function primeTaskVoicePlaybackUrls(tasks = []) {
  tasks.filter((task) => isOpenTask(task) && Boolean(taskVoiceNote(task))).forEach((task) => {
    void ensureTaskVoicePlaybackUrl(task).catch(() => {});
  });
}

function ensureTaskVoicePlaybackUrl(task) {
  if (!task?.id || !taskVoiceNote(task)) return Promise.resolve("");
  const directUrl = String(task.voiceNote.downloadUrl || task.voiceNote.playbackUrl || "").trim();
  if (directUrl) {
    state.voicePlayback[task.id] = { status: "ready", url: directUrl };
    syncTaskVoicePlaybackDom(task.id);
    return Promise.resolve(directUrl);
  }
  const current = state.voicePlayback[task.id];
  if (current?.status === "ready" && current.url) return Promise.resolve(current.url);
  if (current?.status === "loading" && current.promise) return current.promise;

  const promise = getDownloadURL(storageRef(storage, task.voiceNote.storagePath))
    .then((url) => {
      state.voicePlayback[task.id] = { status: "ready", url };
      syncTaskVoicePlaybackDom(task.id);
      return url;
    })
    .catch((error) => {
      state.voicePlayback[task.id] = {
        status: "error",
        url: "",
        message: humanizeFirebaseError(error)
      };
      syncTaskVoicePlaybackDom(task.id);
      console.warn("Voice playback URL unavailable", task.id, error);
      throw error;
    });
  state.voicePlayback[task.id] = { status: "loading", url: "", promise };
  syncTaskVoicePlaybackDom(task.id);
  return promise;
}

function syncAllTaskVoicePlaybackDom() {
  state.data.tasks.filter((task) => isOpenTask(task) && Boolean(taskVoiceNote(task))).forEach((task) => {
    syncTaskVoicePlaybackDom(task.id);
  });
}

function syncTaskVoicePlaybackDom(taskId) {
  if (!taskId) return;
  const task = operationalTaskById(taskId);
  if (!task) return;
  const url = taskVoicePlaybackUrl(task);
  const status = taskVoicePlaybackState(task);
  document.querySelectorAll(`[data-voice-player="${cssEscape(taskId)}"]`).forEach((audioEl) => {
    if (url && audioEl.src !== url) audioEl.src = url;
  });
  document.querySelectorAll(`[data-voice-playback-button="${cssEscape(taskId)}"]`).forEach((button) => {
    button.disabled = status === "loading" || status === "idle";
    button.textContent = status === "ready"
      ? (button.dataset.readyLabel || "Ecouter vocal")
      : status === "error"
        ? "Recharger vocal"
        : "Vocal en chargement";
  });
  document.querySelectorAll(`[data-voice-playback-status="${cssEscape(taskId)}"]`).forEach((statusEl) => {
    statusEl.textContent = status === "error" ? "Vocal indisponible. Reessaie." : "";
    statusEl.hidden = status !== "error";
  });
}

function stopAllTaskVoicePlayback() {
  document.querySelectorAll("[data-voice-player]").forEach((audioEl) => {
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch (error) {
      console.warn("Voice playback stop skipped", error);
    }
  });
}

function taskVoiceNoteStatus(task) {
  const status = String(task?.voiceNoteStatus || "").trim();
  if (taskVoiceNote(task)) return "ready";
  if (status === "uploading" || status === "failed") return status;
  return "";
}

function taskVoiceNoteStatusLabel(task) {
  const status = taskVoiceNoteStatus(task);
  if (status === "uploading") return "Vocal en envoi";
  if (status === "failed") return "Vocal non sauvegarde";
  return "";
}

function voiceNoteDurationLabel(voiceNote) {
  const seconds = Math.max(0, Math.round(Number(voiceNote?.durationSeconds || voiceRecorder.durationSeconds || 0)));
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return minutes ? `${minutes}:${rest}` : `0:${rest}`;
}

function renderVoiceRecorderField(formKey, task = null, options = {}) {
  const isCurrentForm = voiceRecorder.formKey === formKey;
  const hasNewClip = isCurrentForm && Boolean(voiceRecorder.blob);
  const isRecording = isCurrentForm && Boolean(voiceRecorder.mediaRecorder);
  const existingVoiceNote = taskVoiceNote(task);
  const existingVoiceStatus = taskVoiceNoteStatus(task);
  const previewUrl = hasNewClip ? voiceRecorder.previewUrl : "";
  const saveStatus = isCurrentForm ? voiceRecorder.saveStatus : "";
  const saveMessage = isCurrentForm ? voiceRecorder.saveMessage : "";
  const title = cleanString(options.title || "Vocal optionnel");
  const help = cleanString(options.help || "Maximum 2 minutes. Le coach peut aussi rester seulement en texte.");
  const startLabel = cleanString(options.startLabel || "Enregistrer vocal");
  const sectionClass = cleanString(options.sectionClass || "");
  return `
    <section class="voice-note-field ${escapeAttr(sectionClass)}" data-voice-form="${escapeAttr(formKey)}">
      <div class="voice-note-head">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(help)}</p>
        </div>
        <span class="source-badge ${isRecording ? "warning" : hasNewClip || existingVoiceNote ? "good" : ""}" data-voice-status="${escapeAttr(formKey)}">
          ${isRecording ? "Enregistrement..." : hasNewClip ? `Pret (${voiceNoteDurationLabel()})` : existingVoiceNote ? `Vocal attache${voiceNoteDurationLabel(existingVoiceNote) ? ` · ${voiceNoteDurationLabel(existingVoiceNote)}` : ""}` : "Aucun vocal"}
        </span>
      </div>
      <div class="voice-note-actions">
        <button class="${options.primaryStart ? "primary" : "secondary"}" type="button" data-action="startVoiceRecording" data-form-key="${escapeAttr(formKey)}" ${isRecording ? "disabled" : ""}>${escapeHtml(startLabel)}</button>
        <button class="secondary" type="button" data-action="stopVoiceRecording" data-form-key="${escapeAttr(formKey)}" ${isRecording ? "" : "disabled"}>Arreter</button>
        <button class="secondary" type="button" data-action="playVoicePreview" data-form-key="${escapeAttr(formKey)}" ${hasNewClip ? "" : "disabled"}>Ecouter</button>
        <button class="secondary" type="button" data-action="discardVoiceRecording" data-form-key="${escapeAttr(formKey)}" ${hasNewClip ? "" : "disabled"}>Recommencer</button>
      </div>
      <audio class="voice-player" preload="metadata" data-voice-preview="${escapeAttr(formKey)}" ${previewUrl ? `src="${escapeAttr(previewUrl)}"` : ""} hidden></audio>
      <p class="voice-save-status ${escapeAttr(saveStatus)}" data-voice-save-status="${escapeAttr(formKey)}" ${saveMessage ? "" : "hidden"}>
        ${escapeHtml(saveMessage)}
      </p>
      ${existingVoiceNote ? `
        <div class="voice-note-existing">
          <span>Vocal deja attache a cette mission.</span>
          ${taskVoicePlaybackButton(task, "Ecouter", "tiny")}
          <button class="secondary tiny danger" type="button" data-action="deleteTaskVoice" data-id="${escapeHtml(task.id)}">Supprimer vocal</button>
        </div>
        <audio class="voice-player" preload="metadata" data-voice-player="${escapeAttr(task.id)}" ${taskVoicePlaybackUrl(task) ? `src="${escapeAttr(taskVoicePlaybackUrl(task))}"` : ""} hidden></audio>
        <p class="voice-playback-status" data-voice-playback-status="${escapeAttr(task.id)}" hidden></p>
      ` : ""}
      ${!existingVoiceNote && existingVoiceStatus === "uploading" ? `
        <div class="voice-note-existing">
          <span>Vocal en envoi. La mission texte est deja sauvegardee.</span>
        </div>
      ` : ""}
      ${!existingVoiceNote && existingVoiceStatus === "failed" ? `
        <div class="voice-note-existing warning">
          <span>Le dernier vocal n'a pas ete sauvegarde. Tu peux enregistrer un nouveau vocal ou garder la mission texte.</span>
        </div>
      ` : ""}
    </section>
  `;
}

function isCoachRxProgramTask(task) {
  return task?.type === "program" && task?.source === "coachrx_exercise_due";
}

function isQuestionnaireResponseTask(task) {
  return task?.type === "questionnaire_followup" && Boolean(taskQuestionnaireResponseId(task));
}

function taskQuestionnaireResponseId(task) {
  return task?.questionnaireResponseId || task?.sourceResponseId || task?.responseId || "";
}

function taskActionButtons(task) {
  const primary = taskPrimaryActionButton(task);
  const voice = taskVoiceNote(task)
    ? taskVoicePlaybackButton(task, "\u25B6 Ecouter", "task-voice-direct")
    : "";
  const secondary = taskSecondaryActionButtons(task);
  return `
    ${primary}
    ${voice}
    ${secondary.length ? `
      <details class="task-more-actions card-action-menu">
        <summary>Plus</summary>
        <div>
          ${secondary.join("")}
        </div>
      </details>
    ` : ""}
  `;
}

function isStarredTask(task) {
  return task?.starred === true || task?.coachStarred === true || task?.isStarred === true;
}

function taskPrimaryActionButton(task) {
  if (task.type === "rebooking") {
    return `<button class="primary" data-action="completeTask" data-id="${escapeHtml(task.id)}">Fait</button>`;
  }
  if (task.type === "questionnaire_followup") {
    const responseId = taskQuestionnaireResponseId(task);
    if (responseId) {
      return `<button class="primary" data-action="openQuestionnaireDetail" data-id="${escapeHtml(responseId)}">Lire reponse</button>`;
    }
    return `<button class="primary" data-action="completeTask" data-id="${escapeHtml(task.id)}">Relance faite</button>`;
  }
  if (task.type === "validation") {
    return `<button class="primary" data-action="completeTask" data-id="${escapeHtml(task.id)}">Confirmer</button>`;
  }
  return `<button class="primary" data-action="completeTask" data-id="${escapeHtml(task.id)}">Fait</button>`;
}

function taskSecondaryActionButtons(task) {
  const buttons = [];
  if (taskVoiceNoteStatus(task) === "uploading") {
    buttons.push(`<button class="secondary" disabled>Vocal en envoi</button>`);
  }
  if (taskVoiceNoteStatus(task) === "failed") {
    buttons.push(`<button class="secondary" type="button" data-action="openTaskEdit" data-id="${escapeHtml(task.id)}">Reessayer vocal</button>`);
  }
  if (isQuestionnaireResponseTask(task)) {
    const responseId = taskQuestionnaireResponseId(task);
    buttons.push(`<button class="secondary" type="button" data-action="createMissionFromQuestionnaireResponse" data-id="${escapeHtml(responseId)}">Creer mission</button>`);
    buttons.push(`<button class="secondary" type="button" data-action="completeQuestionnaireTask" data-id="${escapeHtml(task.id)}" data-response-id="${escapeHtml(responseId)}">Marquer lu</button>`);
  }
  buttons.push(`<button class="secondary" type="button" data-action="openTaskEdit" data-id="${escapeHtml(task.id)}">Modifier</button>`);
  buttons.push(`<button class="secondary" type="button" data-action="ignoreTask" data-id="${escapeHtml(task.id)}">Masquer</button>`);
  return buttons;
}

function renderClientCard(client) {
  return `
    <article class="card client-card client-card-compact clickable" data-action="openClient" data-id="${escapeAttr(client.id)}">
      <div class="client-card-main">
        <h4>${escapeHtml(client.name || "Client")}</h4>
        ${renderClientInfoPills(client, { interactiveRhythm: true })}
      </div>
    </article>
  `;
}

function clientCardMetaRows(client) {
  return [client.membershipLabel || "Membership a preciser"];
}

function clientCardPills(client) {
  const training = clientTrainingSnapshot(client);
  const levelMethod = training.levelMethod || "A venir";
  const pills = [
    {
      label: `LM ${levelMethod}`,
      className: `level-method ${clientLevelMethodClass(training.levelMethod)}`,
      kind: "level"
    },
    {
      label: training.rhythmLabel,
      className: `training-rhythm ${training.comparisonLevel}`,
      kind: "rhythm",
      action: "openClientTraining"
    }
  ];
  if (client.riskLevel && client.riskLevel !== "none") {
    pills.push({
      label: `Risque: ${riskLabel(client.riskLevel)}`,
      className: `client-risk ${riskClass(client.riskLevel)}`,
      kind: "risk"
    });
  }
  return pills;
}

function renderClientInfoPills(client, options = {}) {
  const interactiveRhythm = options.interactiveRhythm !== false;
  const includeRhythm = options.includeRhythm !== false;
  const membership = clientCardMetaRows(client)[0];
  const pills = clientCardPills(client).filter((pill) => includeRhythm || pill.kind !== "rhythm");
  return `
    <div class="client-card-badges" aria-label="Resume client">
      <span class="client-info-pill membership">${escapeHtml(membership)}</span>
      ${pills.map((pill) => {
        if (pill.action && interactiveRhythm) {
          return `<button class="client-info-pill ${escapeAttr(pill.className)}" type="button" data-action="openClientTraining" data-id="${escapeAttr(client.id)}" aria-label="Voir ou modifier le rythme d'entrainement de ${escapeAttr(client.name || "ce client")}">${escapeHtml(pill.label)}</button>`;
        }
        return `<span class="client-info-pill ${escapeAttr(pill.className)}">${escapeHtml(pill.label)}</span>`;
      }).join("")}
    </div>
  `;
}

function clientTrainingSnapshot(client) {
  const attendance = optionalClientNumber(client.attendance30Days);
  const windowDays = optionalClientNumber(client.attendanceWindowDays) || 30;
  const weeklyActual = attendance === null ? null : attendance * 7 / windowDays;
  const weeklyTarget = optionalClientNumber(client.targetSessionsPerWeek);
  const levelMethod = String(client.levelMethodOverall || "").trim();
  let comparisonLabel = "Definis une cible pour comparer le prevu et le reel.";
  let comparisonLevel = "neutral";
  if (weeklyActual === null) {
    comparisonLabel = "Assiduite indisponible dans le dernier import.";
  } else if (weeklyTarget !== null) {
    const difference = weeklyActual - weeklyTarget;
    comparisonLevel = difference >= -0.05 ? "good" : weeklyActual >= weeklyTarget * 0.75 ? "warning" : "low";
    comparisonLabel = difference >= -0.05
      ? "Cible atteinte sur les 30 derniers jours."
      : `${formatClientDecimal(Math.abs(difference))} seance/sem sous la cible.`;
  }
  let rhythmLabel = "Rythme a importer";
  if (weeklyActual !== null && weeklyTarget === null) {
    rhythmLabel = `Reel ${formatClientDecimal(weeklyActual)}/sem · cible a definir`;
  } else if (weeklyActual !== null && weeklyTarget !== null) {
    rhythmLabel = `Reel ${formatClientDecimal(weeklyActual)} · cible ${formatClientDecimal(weeklyTarget)}/sem`;
  }
  return {
    attendance,
    windowDays,
    weeklyActual,
    weeklyTarget,
    levelMethod,
    comparisonLabel,
    comparisonLevel,
    rhythmLabel
  };
}

function clientLevelMethodClass(value) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return "level-neutral";
  if (normalized.includes("white") || normalized.includes("blanc")) return "level-white";
  if (normalized.includes("yellow") || normalized.includes("jaune")) return "level-yellow";
  if (normalized.includes("orange")) return "level-orange";
  if (normalized.includes("blue") || normalized.includes("bleu")) return "level-blue";
  if (normalized.includes("green") || normalized.includes("vert")) return "level-green";
  if (normalized.includes("red") || normalized.includes("rouge")) return "level-red";
  if (normalized.includes("black") || normalized.includes("noir")) return "level-black";
  if (normalized.includes("purple") || normalized.includes("violet") || normalized.includes("mauve")) return "level-purple";
  return "level-neutral";
}

function renderQuestionnaireItemCard(item) {
  if (item?._kind === "questionnaire_response_group") return renderQuestionnaireGroupCard(item);
  return renderQuestionnaireCard(item);
}

function renderQuestionnaireGroupCard(group) {
  const response = questionnaireRepresentativeResponse(group);
  const statusClass = triageClass(response.triageStatus);
  const highlights = questionnaireHighlights(response);
  const priority = questionnairePrioritySummary(response, highlights);
  const hasClient = Boolean(selectableClientForCoach(group.clientId));
  const latestDate = formatDate(response.submittedAt || response.createdAt) || "date inconnue";
  const typeLabel = group.typeLabels.slice(0, 2).join(" + ");
  const extraTypes = group.typeLabels.length > 2 ? ` +${group.typeLabels.length - 2}` : "";
  const groupMeta = `${typeLabel || "Questionnaire"}${extraTypes} · Derniere reponse: ${latestDate}`;
  return `
    <article class="card operational-card questionnaire-card questionnaire-card-compact questionnaire-group-card ${statusClass}">
      <div class="operational-card-main">
        <button class="link-title" data-action="openClient" data-id="${escapeHtml(group.clientId || "")}" ${hasClient ? "" : "disabled"}>
          ${escapeHtml(group.clientName || "Client")}
        </button>
        <h4>${escapeHtml(`${group.responseCount} reponses a lire`)}</h4>
        <div class="operational-meta-line">
          <span class="operational-meta-primary">${escapeHtml(groupMeta)}</span>
          <span class="pill ${statusClass}">${escapeHtml(priority.label)}</span>
        </div>
      </div>
      <div class="card-actions operational-actions">
        <button class="primary" data-action="openQuestionnaireDetail" data-id="${escapeHtml(response.id)}">Lire</button>
        <details class="card-action-menu">
          <summary>Plus</summary>
          <div>
            ${group.responses.slice(0, 4).map((item) => {
              const itemPriority = questionnairePrioritySummary(item, questionnaireHighlights(item));
              return `
                <button class="secondary questionnaire-group-row" data-action="openQuestionnaireDetail" data-id="${escapeHtml(item.id)}">
                  <span>${escapeHtml(questionnaireTypeLabel(questionnaireResponseType(item)))}</span>
                  <strong>${escapeHtml(itemPriority.label)}</strong>
                  <small>${formatDate(item.submittedAt || item.createdAt) || "date inconnue"}</small>
                </button>
              `;
            }).join("")}
            ${hasClient
              ? `<button class="secondary" data-action="createMissionFromQuestionnaireResponse" data-id="${escapeHtml(response.id)}">Creer mission</button>`
              : `<button class="secondary" data-action="openQuestionnaireLinkClient" data-id="${escapeHtml(response.id)}">Relier client</button>`}
            <button class="secondary" data-action="markResponseRead" data-id="${escapeHtml(response.id)}">Marquer lu</button>
          </div>
        </details>
      </div>
    </article>
  `;
}

function renderQuestionnaireCard(response) {
  const statusClass = triageClass(response.triageStatus);
  const highlights = questionnaireHighlights(response);
  const hasClient = Boolean(selectableClientForCoach(response.clientId));
  const priority = questionnairePrioritySummary(response, highlights);
  const typeLabel = questionnaireTypeLabel(questionnaireResponseType(response));
  const dateLabel = formatDate(response.submittedAt || response.createdAt) || "date inconnue";
  const actionLabel = hasClient ? "Lire la reponse" : "Relier au bon client";
  return `
    <article class="card operational-card questionnaire-card questionnaire-card-compact ${statusClass}">
      <div class="operational-card-main">
        <button class="link-title" data-action="openClient" data-id="${escapeHtml(response.clientId || "")}" ${hasClient ? "" : "disabled"}>
          ${escapeHtml(response.clientName || "Reponse sans client")}
        </button>
        <h4>${escapeHtml(actionLabel)}</h4>
        <div class="operational-meta-line">
          <span class="operational-meta-primary">${escapeHtml(`${typeLabel} · ${dateLabel}`)}</span>
          <span class="pill ${statusClass}">${escapeHtml(priority.label)}</span>
        </div>
      </div>
      <div class="card-actions operational-actions">
        <button class="primary" data-action="openQuestionnaireDetail" data-id="${escapeHtml(response.id)}">Lire</button>
        <details class="card-action-menu">
          <summary>Plus</summary>
          <div>
            ${hasClient
              ? `<button class="secondary" data-action="createMissionFromQuestionnaireResponse" data-id="${escapeHtml(response.id)}">Creer mission</button>`
              : `<button class="secondary" data-action="openQuestionnaireLinkClient" data-id="${escapeHtml(response.id)}">Relier client</button>`}
            <button class="secondary" data-action="markResponseRead" data-id="${escapeHtml(response.id)}">Marquer lu</button>
          </div>
        </details>
      </div>
    </article>
  `;
}

function questionnaireCompactSummary(response, priority, highlights = questionnaireHighlights(response), maxLength = 150) {
  const digest = questionnaireDigest(response, highlights, priority);
  const pieces = [
    digest.summary || priority?.reason,
    digest.nextAction || priority?.nextStep
  ].filter(Boolean);
  return shortText(pieces.join(" · "), maxLength);
}

function shortText(value, maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function renderQuestionnaireValidationNotice(unmatched) {
  if (!unmatched.length) return "";
  const withPhone = unmatched.filter(questionnaireResponsePhone).length;
  return `
    <div class="notice compact questionnaire-validation-notice">
      <strong>Reponses a rattacher</strong>
      <span>
        ${unmatched.length} reponse(s) ne sont pas reliees a une fiche client.
        ${withPhone ? `${withPhone} ont un telephone a comparer.` : "Aucune n'a un telephone deja reconnu dans le portefeuille actif."}
        Une mission coach se cree seulement apres lien client fiable.
      </span>
    </div>
  `;
}

function renderUnmatchedQuestionnaireCard(response) {
  const statusClass = triageClass(response.triageStatus);
  const phone = questionnaireResponsePhone(response);
  const highlights = questionnaireHighlights(response);
  const priority = questionnairePrioritySummary(response, highlights);
  return `
    <article class="card operational-card questionnaire-card questionnaire-card-compact ${statusClass} source-review">
      <div class="operational-card-main">
        <h4>${escapeHtml(response.clientName || "Reponse sans client reconnu")}</h4>
        <div class="operational-meta-line">
          <span class="operational-meta-primary">${escapeHtml(phone ? `Telephone: ${phone}` : "Telephone absent")} · ${formatDate(response.submittedAt || response.createdAt) || "date inconnue"}</span>
          <span class="pill ${statusClass}">${escapeHtml(priority.label)}</span>
          <span class="pill amber">Non reliee</span>
          ${highlights.length ? `<span class="pill amber">${highlights.length} signal(aux)</span>` : ""}
        </div>
      </div>
      <div class="card-actions operational-actions">
        <button class="primary" data-action="openQuestionnaireLinkClient" data-id="${escapeHtml(response.id)}">Relier client</button>
        <details class="card-action-menu">
          <summary>Plus</summary>
          <div>
            <button class="secondary" data-action="openQuestionnaireDetail" data-id="${escapeHtml(response.id)}">Details</button>
            <button class="secondary" data-action="markResponseRead" data-id="${escapeHtml(response.id)}">Archiver</button>
          </div>
        </details>
      </div>
    </article>
  `;
}

function renderQuestionnaireSendClientCard(client) {
  const phone = clientPhone(client);
  const lastSend = latestSendForClient(client.id);
  const lastSendDate = lastSend?.sentAt || lastSend?.preparedAt || lastSend?.createdAt;
  const schedules = schedulesForClient(client.id);
  const canSend = Boolean(phone);
  const adminSourceLine = isInfoAdmin() ? `Origine fiche: ${sourceLabel(client.source)}` : "";
  const lastSendLine = lastSend
    ? `Dernier envoi: ${questionnaireTypeLabel(lastSend.questionnaireType)} · ${formatDate(lastSendDate)} (${questionnaireSendStatusLabel(lastSend.status)})`
    : "Aucun envoi recent";
  const scheduleLine = schedules.length
    ? `Automatisation: ${schedules.map((schedule) => `${questionnaireTypeLabel(schedule.questionnaireType)} ${questionnaireScheduleStatusLabel(schedule)}`).join(" · ")}`
    : "Aucune automatisation active";
  return `
    <article class="card operational-card questionnaire-send-card">
      <div class="operational-card-main">
        <button class="link-title" data-action="openClient" data-id="${escapeHtml(client.id)}">${escapeHtml(client.name || "Client")}</button>
        <p class="questionnaire-card-focus">${escapeHtml(phone ? `Telephone ${phone}` : "Telephone manquant")}</p>
        <div class="pill-row">
          <span class="pill ${canSend ? "green" : "red"}">${escapeHtml(canSend ? "pret a envoyer" : "telephone requis")}</span>
          ${lastSend ? `<span class="pill">dernier ${escapeHtml(formatDate(lastSendDate))}</span>` : ""}
          ${schedules.length ? `<span class="pill">${schedules.length} automatisation${schedules.length > 1 ? "s" : ""}</span>` : ""}
        </div>
        <details class="compact-card-details questionnaire-send-details">
          <summary>Historique et plan</summary>
          <span>${escapeHtml(`Dernier questionnaire: ${client.lastQuestionnaireAt || "jamais trouve"}`)}</span>
          <span>${escapeHtml(lastSendLine)}</span>
          <span>${escapeHtml(scheduleLine)}</span>
          ${adminSourceLine ? `<span>${escapeHtml(adminSourceLine)}</span>` : ""}
        </details>
      </div>
      <div class="card-actions operational-actions">
        ${canSend
          ? `<button class="primary" data-action="openQuestionnaireSend" data-id="${escapeHtml(client.id)}">Envoyer</button>`
          : `<button class="secondary" disabled>Telephone requis</button>`}
        <button class="secondary" data-action="openQuestionnaireSchedule" data-id="${escapeHtml(client.id)}" ${canSend ? "" : "disabled"}>${schedules.length ? "Gerer automatisation" : "Automatiser"}</button>
      </div>
    </article>
  `;
}

function renderQuestionnaireScheduleCard(schedule) {
  const client = selectableClientForCoach(schedule.clientId);
  const hasClient = Boolean(client);
  const phone = schedule.clientPhoneNormalized || clientPhone(client);
  const active = (schedule.status || "active") === "active";
  const nextSend = schedule.nextSendAt || "";
  const overdue = active && dateValue(nextSend) && dateValue(nextSend) <= dateValue(todayIso());
  const questionnaireLabel = questionnaireTypeLabel(schedule.questionnaireType);
  return `
    <article class="card operational-card questionnaire-schedule-card ${active ? "" : "muted-card"}">
      <div>
        <button class="link-title" data-action="openClient" data-id="${escapeHtml(client?.id || "")}" ${hasClient ? "" : "disabled"}>${escapeHtml(schedule.clientName || client?.name || "Client")}</button>
        <p class="questionnaire-card-focus">${escapeHtml(questionnaireLabel)}</p>
        <div class="questionnaire-schedule-summary">
          <div>
            <span>Frequence</span>
            <strong>${escapeHtml(questionnaireScheduleFrequencyLabel(schedule.frequency))}</strong>
          </div>
          <div>
            <span>Prochain envoi</span>
            <strong>${escapeHtml(formatDate(nextSend) || "a choisir")}${overdue ? " · aujourd'hui" : ""}</strong>
          </div>
          <div>
            <span>Statut</span>
            <strong>${escapeHtml(active ? "Actif" : "Pause")}</strong>
          </div>
        </div>
        ${schedule.note ? `<p class="meta">${escapeHtml(shortText(schedule.note, 110))}</p>` : ""}
        <div class="pill-row">
          <span class="pill">${escapeHtml(phone ? "telephone OK" : "telephone requis")}</span>
          ${hasClient ? "" : `<span class="pill amber">Appartenance a valider</span>`}
          ${schedule.lastSentAt ? `<span class="pill">dernier ${escapeHtml(formatDate(schedule.lastSentAt))}</span>` : ""}
          ${schedule.lastError ? `<span class="pill red">Erreur</span>` : ""}
        </div>
      </div>
      <div class="card-actions operational-actions">
        ${hasClient ? `
          <button class="secondary" data-action="openQuestionnaireSchedule" data-id="${escapeHtml(client.id)}" data-questionnaire-type="${escapeAttr(schedule.questionnaireType || DEFAULT_QUESTIONNAIRE_TYPE)}">Modifier</button>
          <button class="secondary" data-action="toggleQuestionnaireSchedule" data-id="${escapeHtml(schedule.id)}">${active ? "Pause" : "Reprendre"}</button>
        ` : `<button class="secondary" disabled>A valider par un admin</button>`}
      </div>
    </article>
  `;
}

function renderQuestionnaireFollowupCard(send) {
  const alreadyCreated = Boolean(send.followupTaskCreatedAt);
  const waitingDays = daysSince(send.sentAt || send.createdAt);
  const canFollowUp = waitingDays >= 7;
  const questionnaireLabel = questionnaireTypeLabel(send.questionnaireType);
  return `
    <article class="card operational-card questionnaire-card questionnaire-card-compact">
      <div class="operational-card-main">
        <h4>${escapeHtml(send.clientName || "Client")}</h4>
        <div class="operational-meta-line">
          <span class="operational-meta-primary">${waitingDays} jour(s) sans reponse · ${escapeHtml(questionnaireLabel)} · ${formatDate(send.sentAt || send.createdAt)}</span>
          ${!canFollowUp ? `<span class="decision-source">Disponible dans ${Math.max(0, 7 - waitingDays)} j</span>` : ""}
        </div>
      </div>
      <div class="card-actions operational-actions">
        ${alreadyCreated
          ? `<button class="secondary" disabled>Relance deja creee</button>`
          : canFollowUp
            ? `<button class="primary" data-action="createQuestionnaireFollowupTask" data-id="${escapeHtml(send.id)}">Creer relance</button>`
            : `<button class="secondary" disabled>En attente</button>`}
        <details class="card-action-menu">
          <summary>Plus</summary>
          <div>
            <button class="secondary" data-action="cancelQuestionnaireSend" data-id="${escapeHtml(send.id)}">Archiver</button>
          </div>
        </details>
      </div>
    </article>
  `;
}

function renderQuestionnaireSignalList(highlights) {
  if (!highlights.length) {
    return "";
  }
  return `
    <details class="questionnaire-detail-answers questionnaire-signal-details">
      <summary>Ce qui demande attention</summary>
      <div class="questionnaire-signal-list">
        ${highlights.map((signal) => `
          <div class="questionnaire-signal ${escapeAttr(signal.level)}">
            <strong>${escapeHtml(signal.label || questionnaireSignalLabel(signal.key))}</strong>
            <span>${escapeHtml(signal.reason || "Reponse a verifier")}</span>
            <small>${escapeHtml(signal.value || "")}</small>
          </div>
        `).join("")}
      </div>
    </details>
  `;
}

function renderQuestionnaireSendAudit(sends) {
  if (!isInfoAdmin()) return "";
  if (!sends.length) return "";
  const latest = sends[0];
  const errorCount = sends.filter((send) => send.status === "error").length;
  const openAttr = errorCount ? "open" : "";
  return `
    <div class="send-audit">
      <details class="send-audit-details" ${openAttr}>
        <summary>
          <span>
            <strong>Journal d'envoi</strong>
            <small>Dernier: ${escapeHtml(latest.clientName || "Client")} · ${escapeHtml(questionnaireTypeLabel(latest.questionnaireType))} · ${formatDateTime(latest.updatedAt || latest.sentAt || latest.createdAt)}</small>
          </span>
          <span class="pill ${errorCount ? "red" : "green"}">${errorCount ? `${errorCount} erreur${errorCount > 1 ? "s" : ""}` : "OK"}</span>
        </summary>
        <div class="send-audit-list">
          ${sends.slice(0, errorCount ? 12 : 8).map((send) => `
            <div class="send-audit-item ${send.status === "error" ? "error" : ""}">
              <span>${escapeHtml(send.clientName || "Client")}</span>
              <strong>${escapeHtml(questionnaireSendStatusLabel(send.status))}</strong>
              <small>${escapeHtml(questionnaireTypeLabel(send.questionnaireType))} · ${escapeHtml(send.errorMessage || send.deliveryStatus || "En attente de reponse")} · ${formatDateTime(send.updatedAt || send.sentAt || send.createdAt)}</small>
              ${send.status === "error" ? `<em>${escapeHtml(questionnaireSendActionHint(send))}</em>` : ""}
            </div>
          `).join("")}
        </div>
      </details>
    </div>
  `;
}

function renderRebookingCard(rebooking) {
  const isClosed = rebooking.status !== "open";
  const sessions = Math.max(1, Number(rebooking.sessionsToRebook || 1));
  const needsVolumeReview = rebookingVolumeNeedsReview(sessions);
  const hasWeakClientLink = rebookingHasWeakClientLink(rebooking);
  const title = rebooking.clientName || "Client a confirmer";
  const statusLabel = rebookingStatusLabel(rebooking.status);
  const note = rebooking.statusNote || rebooking.note || "";
  const clientTitle = rebooking.clientId
    ? `<button class="link-title" data-action="openClient" data-id="${escapeHtml(rebooking.clientId)}">${escapeHtml(title)}</button>`
    : `<h3 class="link-title static-title">${escapeHtml(title)}</h3>`;
  const dueLabel = rebooking.appointmentAt || rebooking.detectedAt
    ? `Depuis le ${formatDate(rebooking.appointmentAt || rebooking.detectedAt)}`
    : "";
  const cancellationSummary = rebookingCancellationDateSummary(rebooking);
  const cancellationLabel = cancellationSummary
    ? `Date${sessions > 1 ? "s" : ""} annulee${sessions > 1 ? "s" : ""}: ${cancellationSummary}`
    : dueLabel;
  return `
    <article class="card operational-card rebooking-card">
      <div class="operational-card-main">
        ${clientTitle}
        <div class="rebooking-main-line">
          <strong>${sessions} seance${sessions > 1 ? "s" : ""} a remettre</strong>
          ${needsVolumeReview ? `<span class="pill amber">Volume a verifier</span>` : ""}
          ${isClosed ? `<span class="pill">${escapeHtml(statusLabel)}</span>` : ""}
        </div>
        ${cancellationLabel ? `<div class="operational-meta-line"><span class="operational-meta-primary">${escapeHtml(cancellationLabel)}</span></div>` : ""}
        ${note ? `<details class="compact-card-details"><summary>Note</summary><span>${escapeHtml(shortText(note, 180))}</span></details>` : ""}
      </div>
      <div class="card-actions operational-actions">
        ${isClosed
          ? `
            <button class="secondary" data-action="reopenRebooking" data-id="${escapeHtml(rebooking.id)}">Reouvrir</button>
            <details class="card-action-menu">
              <summary>Plus</summary>
              <div>
                <button class="secondary" data-action="openRebookingDetail" data-id="${escapeHtml(rebooking.id)}">Details</button>
              </div>
            </details>
          `
          : `
            <button class="primary" data-action="rebookedRebooking" data-id="${escapeHtml(rebooking.id)}">Marquer remise</button>
            <details class="card-action-menu">
              <summary>Plus</summary>
              <div>
                <button class="secondary" data-action="openRebookingMission" data-id="${escapeHtml(rebooking.id)}">Creer mission</button>
                <button class="secondary" data-action="manageRebooking" data-id="${escapeHtml(rebooking.id)}">Suivi fait</button>
                <button class="secondary" data-action="adjustRebookingSessions" data-id="${escapeHtml(rebooking.id)}">Ajuster seances</button>
                <button class="secondary" data-action="openRebookingDetail" data-id="${escapeHtml(rebooking.id)}">Details</button>
              </div>
            </details>
          `}
      </div>
    </article>
  `;
}

function rebookingCardActionLine(rebooking, { isClosed, hasWeakClientLink, sessions }) {
  if (isClosed) return `Dossier ferme: ${rebookingStatusLabel(rebooking.status)}. Reouvrir seulement si une seance reste a remettre.`;
  if (hasWeakClientLink) return "Rebooke la seance si le client est le bon; ajuste ou relie la fiche au besoin.";
  if (sessions > 1) return "Planifie les seances restantes, puis ajuste le nombre si une partie est deja reglee.";
  return "Rebooke la seance ou confirme que le suivi est regle.";
}

function rebookingCardQuietHint(rebooking, { isClosed, hasWeakClientLink, sessions, groupedCount, groupedDocs }) {
  if (isClosed) return "";
  const hints = [];
  if (sessions > 1) hints.push("Ajuster si une partie est deja reglee.");
  if (groupedCount > 1 || groupedDocs > 1) hints.push(`${Math.max(groupedCount, groupedDocs)} signaux regroupes.`);
  return hints.join(" ");
}

function renderRebookingDetails(rebooking, detailRows = []) {
  const history = Array.isArray(rebooking.history) ? rebooking.history.slice(-3).reverse() : [];
  if (!detailRows.length && !history.length) return "";
  return `
    <details class="rebooking-card-details">
      <summary>Details et historique</summary>
      ${detailRows.length ? `<span>${detailRows.map(escapeHtml).join(" | ")}</span>` : ""}
      ${history.length ? renderRebookingHistory(rebooking) : ""}
    </details>
  `;
}

function renderRebookingDetailModal() {
  const rebooking = findRebookingForCoachView(state.modal.id);
  if (!rebooking) return "";
  const sessions = Math.max(1, Number(rebooking.sessionsToRebook || 1));
  const sourceIds = Array.isArray(rebooking.sourceEventIds) ? rebooking.sourceEventIds : [];
  const relatedIds = Array.isArray(rebooking.relatedRebookingIds) ? rebooking.relatedRebookingIds : [rebooking.id];
  const rows = [
    ["Statut", rebookingStatusLabel(rebooking.status)],
    ["Seances restantes", String(sessions)],
    ["Service", rebooking.service || "A confirmer"],
    ["Dates d'annulation", rebookingCancellationDateSummary(rebooking, 12) || "Non precisees"],
    ["Lien client", rebookingMatchLabel(rebooking.matchMethod || (rebooking.clientId ? "existing" : "unmatched"))],
    ["Origine", rebooking.source ? sourceLabel(rebooking.source) : "Manuel"],
    ["Signal source", rebooking.appointmentAt || rebooking.detectedAt ? formatDate(rebooking.appointmentAt || rebooking.detectedAt) : "Non precise"],
    ["Signaux regroupes", Number(rebooking.groupedSourceCount || 1) > 1 ? String(rebooking.groupedSourceCount) : "Non"],
    ["Dossiers fusionnes", relatedIds.length > 1 ? String(relatedIds.length) : "Non"],
    ["Coach", rebooking.coachName || activeCoachRecord()?.name || ""]
  ];
  return modal(`Rebooking - ${escapeHtml(rebooking.clientName || "Client")}`, `
    <div class="rebooking-detail-modal">
      <div class="rebooking-detail-summary">
        <strong>${sessions} seance${sessions > 1 ? "s" : ""} a remettre</strong>
        ${rebookingVolumeNeedsReview(sessions) ? `<span class="pill amber">Volume a verifier avec la source</span>` : ""}
        <span>${escapeHtml(rebookingCardActionLine(rebooking, {
          isClosed: rebooking.status !== "open",
          hasWeakClientLink: rebookingHasWeakClientLink(rebooking),
          sessions
        }))}</span>
      </div>
      <div class="modal-actions rebooking-quick-actions">
        ${rebooking.status === "open" ? `
          <button class="primary" data-action="rebookedRebooking" data-id="${escapeHtml(rebooking.id)}">Marquer remise</button>
          <button class="secondary" data-action="manageRebooking" data-id="${escapeHtml(rebooking.id)}">Suivi fait</button>
          <button class="secondary" data-action="openRebookingMission" data-id="${escapeHtml(rebooking.id)}">Creer mission</button>
          <details class="card-action-menu">
            <summary>Autres actions</summary>
            <button class="secondary" data-action="adjustRebookingSessions" data-id="${escapeHtml(rebooking.id)}">Ajuster seances</button>
            <button class="secondary" data-action="coachAbsenceRebooking" data-id="${escapeHtml(rebooking.id)}">Absence coach</button>
            <button class="secondary" data-action="transferRebookingCoach" data-id="${escapeHtml(rebooking.id)}">Changer coach</button>
            ${rebookingHasWeakClientLink(rebooking) ? `
              <button class="secondary" data-action="openRebookingLinkClient" data-id="${escapeHtml(rebooking.id)}">Relier fiche client</button>
            ` : ""}
            <button class="secondary danger-lite" data-action="deleteRebookingError" data-id="${escapeHtml(rebooking.id)}">Supprimer erreur</button>
          </details>
        ` : `<button class="secondary" data-action="reopenRebooking" data-id="${escapeHtml(rebooking.id)}">Reouvrir</button>`}
      </div>
      <div class="detail-grid compact-detail-grid">
        ${rows.map(([label, value]) => detail(label, value || "-", "")).join("")}
      </div>
      ${rebooking.note || rebooking.statusNote ? `
        <div class="focus-note">
          <strong>Note</strong>
          <p>${escapeHtml(rebooking.statusNote || rebooking.note || "")}</p>
        </div>
      ` : ""}
      ${sourceIds.length ? `
        <details class="rebooking-card-details" open>
          <summary>Signaux regroupes</summary>
          <span>${sourceIds.slice(0, 12).map(escapeHtml).join(" | ")}${sourceIds.length > 12 ? " | ..." : ""}</span>
        </details>
      ` : ""}
      ${relatedIds.length > 1 ? `
        <details class="rebooking-card-details">
          <summary>Dossiers fusionnes dans cette carte</summary>
          <span>${relatedIds.map(escapeHtml).join(" | ")}</span>
        </details>
      ` : ""}
      ${renderRebookingHistory(rebooking)}
      <div class="modal-actions">
        <button class="secondary" type="button" data-action="closeModal">Fermer</button>
      </div>
    </div>
  `);
}

function renderRebookingHistory(rebooking) {
  const history = Array.isArray(rebooking.history) ? rebooking.history.slice(-3).reverse() : [];
  if (!history.length) return "";
  return `
    <div class="mini-history" aria-label="Historique rebooking">
      ${history.map((item) => `
        <span>
          ${escapeHtml(item.label || rebookingStatusLabel(item.status))} - ${formatDate(item.at)}
          ${item.note ? ` | ${escapeHtml(item.note)}` : ""}
        </span>
      `).join("")}
    </div>
  `;
}

function renderImpactCard(impact) {
  const status = impact.status || "draft";
  return `
    <article class="card">
      <div>
        <h4>${escapeHtml(impact.clientName || "Impact")}</h4>
        <p class="meta">
          ${escapeHtml(impact.serviceType || "Nouveau revenu")} | ${escapeHtml(impact.amount || "")}<br>
          ${formatDate(impact.impactDate || impact.createdAt)} | Statut: ${escapeHtml(impactStatusLabel(status))}
          ${impact.note ? `<br>${escapeHtml(impact.note)}` : ""}
        </p>
      </div>
      <div class="card-actions">
        <button class="secondary" data-action="editImpact" data-id="${escapeHtml(impact.id)}">Modifier</button>
        ${status !== "confirmed" ? `<button class="primary" data-action="confirmImpact" data-id="${escapeHtml(impact.id)}">Confirmer</button>` : ""}
        ${status !== "cancelled" ? `<button class="secondary" data-action="cancelImpact" data-id="${escapeHtml(impact.id)}">Annuler</button>` : ""}
        <button class="secondary danger-lite" data-action="deleteImpact" data-id="${escapeHtml(impact.id)}">Supprimer</button>
      </div>
    </article>
  `;
}

function renderRebookingCardGuidance(rebooking) {
  const matchMethod = rebooking.matchMethod || (rebooking.clientId ? "existing" : "unmatched");
  const status = rebooking.status || "open";
  const warning = rebookingHasWeakClientLink(rebooking);
  if (!warning) return "";
  const label = status === "open" ? "Lien client a verifier" : "Lien client fragile";
  return `
    <details class="rebooking-guidance warning compact">
      <summary>${escapeHtml(label)}</summary>
      <small>${escapeHtml(isInfoAdmin() ? rebookingMatchWarning(rebooking, matchMethod) : rebookingCoachWarning(rebooking, matchMethod))}</small>
    </details>
  `;
}

function rebookingHasWeakClientLink(rebooking) {
  if (rebooking?.displayNeedsConfirmation) return true;
  const matchMethod = rebooking?.matchMethod || (rebooking?.clientId ? "existing" : "unmatched");
  return !rebooking?.clientId || !rebooking?.clientPhoneNormalized || ["name", "unmatched"].includes(matchMethod);
}

function findRebookingForCoachView(id) {
  const rebookings = portfolioRebookings();
  const grouped = groupRebookingsForCoachView(rebookings);
  return grouped.find((item) =>
    String(item.id) === String(id) ||
    (Array.isArray(item.relatedRebookingIds) && item.relatedRebookingIds.map(String).includes(String(id)))
  ) || rebookings.find((item) => String(item.id) === String(id));
}

function rebookingActionTargetIds(id, { groupOpen = true } = {}) {
  const rebookings = portfolioRebookings();
  const validIds = new Set(rebookings.map((item) => String(item.id || "")));
  const cleanId = String(id || "").trim();
  if (!cleanId || !validIds.has(cleanId)) return [];
  if (!groupOpen) return [cleanId];
  const rebooking = findRebookingForCoachView(id);
  if (!rebooking) return [];
  if (rebookingStatus(rebooking) !== "open") return validIds.has(String(rebooking.id || "")) ? [String(rebooking.id)] : [];
  const ids = Array.isArray(rebooking.relatedRebookingIds) ? rebooking.relatedRebookingIds : [id];
  return uniqueStrings(ids).filter((targetId) => validIds.has(String(targetId)));
}

function renderAlumniCard(alumni) {
  const status = alumni.status || "to_work";
  const canCreateTask = !["archived", "do_not_contact", "reactivated"].includes(status);
  const openTasks = state.data.tasks
    .filter(isOpenTask)
    .filter((task) => task.alumniId === alumni.id)
    .sort(sortTasks)
    .slice(0, 3);
  const coach = coachRecordById(alumni.coachId);
  const followupDue = dateValue(alumni.nextFollowupAt) && dateValue(alumni.nextFollowupAt) <= dateValue(todayIso());
  return `
    <article class="card">
      <div>
        <h4>${escapeHtml(alumni.name || "Alumni")}</h4>
        <p class="meta">
          ${escapeHtml(alumni.phoneNormalized || "telephone a ajouter")}<br>
          ${alumni.email ? `${escapeHtml(alumni.email)}<br>` : ""}
          Statut: ${escapeHtml(alumniStatusLabel(status))}
          ${alumni.nextFollowupAt ? ` | Relance: ${formatDate(alumni.nextFollowupAt)}` : ""}
          ${followupDue ? ` | <strong class="inline-alert">Due</strong>` : ""}<br>
          Coach: ${escapeHtml(coach?.name || alumni.coachName || alumni.coachId || "a confirmer")}<br>
          ${escapeHtml(alumni.note || "")}
        </p>
        ${openTasks.length ? `
          <div class="linked-mini-list">
            <strong>Missions ouvertes</strong>
            ${openTasks.map((task) => `<span>${escapeHtml(taskDisplayTitle(task) || "Mission")}${task.dueAt ? ` · ${formatDate(task.dueAt)}` : ""}</span>`).join("")}
          </div>
        ` : ""}
      </div>
      <div class="card-actions">
        <button class="secondary" data-action="editAlumni" data-id="${escapeHtml(alumni.id)}">Modifier</button>
        ${canCreateTask ? `<button class="primary" data-action="createAlumniTask" data-id="${escapeHtml(alumni.id)}">Creer mission</button>` : ""}
        ${status !== "to_work" ? `<button class="secondary" data-action="markAlumniToWork" data-id="${escapeHtml(alumni.id)}">A travailler</button>` : ""}
        ${status !== "contacted" ? `<button class="secondary" data-action="markAlumniContacted" data-id="${escapeHtml(alumni.id)}">Contacte</button>` : ""}
        <button class="secondary" data-action="reactivateAlumniAsClient" data-id="${escapeHtml(alumni.id)}">Ramener client</button>
        ${status !== "reactivated" ? `<button class="secondary" data-action="markAlumniReactivated" data-id="${escapeHtml(alumni.id)}">Reactive</button>` : ""}
        ${status !== "do_not_contact" ? `<button class="secondary" data-action="markAlumniDoNotContact" data-id="${escapeHtml(alumni.id)}">Ne pas contacter</button>` : ""}
        ${status !== "archived" ? `<button class="secondary danger-lite" data-action="archiveAlumni" data-id="${escapeHtml(alumni.id)}">Archiver</button>` : ""}
      </div>
    </article>
  `;
}

function renderModal() {
  if (state.modal.type === "announcement") return renderAnnouncementModal();
  if (state.modal.type === "announcementForm") return renderAnnouncementFormModal();
  if (state.modal.type === "client") return renderClientModal();
  if (state.modal.type === "clientTraining") return renderClientTrainingModal();
  if (state.modal.type === "clientForm") return renderClientFormModal();
  if (state.modal.type === "clientPhoneFix") return renderClientPhoneFixModal();
  if (state.modal.type === "quickNote") return renderQuickNoteModal();
  if (state.modal.type === "taskEdit") return renderTaskEditModal();
  if (state.modal.type === "questionnaireSend") return renderQuestionnaireSendModal();
  if (state.modal.type === "questionnaireSchedule") return renderQuestionnaireScheduleModal();
  if (state.modal.type === "questionnaireDetail") return renderQuestionnaireDetailModal();
  if (state.modal.type === "questionnaireLinkClient") return renderQuestionnaireLinkClientModal();
  if (state.modal.type === "rebookingForm") return renderRebookingFormModal();
  if (state.modal.type === "rebookingDetail") return renderRebookingDetailModal();
  if (state.modal.type === "rebookingLinkClient") return renderRebookingLinkClientModal();
  if (state.modal.type === "rebookingAbsenceFlow") return renderRebookingAbsenceModal();
  if (state.modal.type === "performanceDetail") return renderPerformanceDetailModal();
  if (state.modal.type === "weeklyImpacts") return renderWeeklyImpactsModal();
  if (state.modal.type === "weeklyCheckups") return renderWeeklyCheckupsModal();
  if (state.modal.type === "performanceNewClientManual") return renderPerformanceNewClientManualModal();
  if (state.modal.type === "performanceObjective") return renderPerformanceObjectiveModal();
  if (state.modal.type === "pilotageItem") return renderPilotageItemModal();
  if (state.modal.type === "pilotageNote") return renderPilotageNoteModal();
  if (state.modal.type === "pilotageNoteEdit") return renderPilotageNoteModal();
  if (state.modal.type === "impactForm") return renderImpactFormModal();
  if (state.modal.type === "impactEdit") return renderImpactFormModal();
  if (state.modal.type === "alumniForm") return renderAlumniFormModal();
  if (state.modal.type === "alumniEdit") return renderAlumniFormModal();
  return "";
}

function renderAnnouncementModal() {
  const announcement = state.data.announcements.find((item) => item.id === state.modal.id);
  if (!announcement) return modal("Mise a jour du dashboard", `<div class="empty small">Cette annonce n'est plus disponible.</div>`);
  const items = Array.isArray(announcement.items) ? announcement.items.filter(Boolean).slice(0, 3) : [];
  const acknowledged = announcementAcknowledged(announcement.id);
  return modal("Mise a jour du dashboard", `
    <section class="announcement-modal ${escapeAttr(announcement.importance || "feature")}">
      <div class="announcement-modal-kicker">
        <span>${escapeHtml(announcementImportanceLabel(announcement.importance))}</span>
        <small>${escapeHtml(formatDate(announcement.publishedAt || announcement.createdAt) || "Nouvelle version")}</small>
      </div>
      <h4>${escapeHtml(announcement.title || "Nouveaute du dashboard")}</h4>
      <p>${escapeHtml(announcement.message || "")}</p>
      ${items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      <div class="modal-actions announcement-modal-actions">
        ${acknowledged
          ? `<button class="primary" type="button" data-action="closeModal">Fermer</button>`
          : `<button class="primary" type="button" data-action="acknowledgeAnnouncement" data-id="${escapeAttr(announcement.id)}">Compris</button>`}
        ${!acknowledged ? `<button class="secondary" type="button" data-action="closeModal">Plus tard</button>` : ""}
      </div>
    </section>
  `);
}

function renderAnnouncementFormModal() {
  if (!isInfoAdmin()) return "";
  return modal("Publier une mise a jour", `
    <form class="modal-form announcement-form" data-form="announcement">
      <div class="notice compact">
        <strong>Une annonce = un changement important</strong>
        <span>Garde le message court. Il apparaitra une fois apres la connexion, puis restera dans Guide.</span>
      </div>
      <label>Titre<input class="input" name="title" maxlength="90" placeholder="Ex.: Les accomplissements sont maintenant centralises" required></label>
      <label>Resume<textarea class="input" name="message" maxlength="360" rows="3" placeholder="Explique en une phrase ce qui change pour le coach." required></textarea></label>
      <label>Trois points maximum<textarea class="input" name="items" rows="4" placeholder="Un point par ligne\nCe que le coach peut faire\nOu retrouver la fonctionnalite"></textarea></label>
      <div class="form-grid">
        <label>Importance
          <select class="input" name="importance">
            <option value="feature">Nouveaute</option>
            <option value="important">Important</option>
            <option value="critical">Action requise</option>
          </select>
        </label>
        <label>Expiration optionnelle<input class="input" type="date" name="expiresOn"></label>
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit">Publier a l'equipe</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderClientModal() {
  const client = selectableClientForCoach(state.modal.id);
  if (!client) return "";
  const phone = clientPhone(client);
  const isAdminView = isInfoAdmin();
  const identityWarnings = clientIdentityWarnings(client, isAdminView);
  const adminIdentitySummary = clientIdentitySummary(client, true);
  const syncSummary = clientSyncSummary(client);
  const coachId = client.coachId || state.selectedCoachId;
  const coachName = client.coachName || coachRecordById(coachId)?.name || activeCoachRecord()?.name || "A confirmer";
  return modal("Fiche client", `
    <div class="modal-form client-modal-clean">
      <div class="client-modal-intro client-modal-profile">
        <div class="client-modal-identity">
          <strong>${escapeHtml(client.name || "Client sans nom")}</strong>
          <span>Coach: ${escapeHtml(coachName)}</span>
        </div>
        ${renderClientInfoPills(client, { interactiveRhythm: true })}
      </div>
      ${renderClientQuickActions(client)}
      ${renderClientActivityPanel(client)}
      ${renderClientTrainingRhythm(client)}
      ${renderClientSummaryPanel(client)}
      <details class="client-secondary-details">
        <summary>Infos avancees</summary>
        <div class="detail-grid compact">
          ${detail("Fin membership", client.manualMembershipEndDate || "A entrer", "Manuel")}
          ${detail("Recurrence prevue Kilo", client.kiloPlannedRecurrenceEndDate || "A entrer", "Manuel")}
          ${detail("Dernier questionnaire", client.lastQuestionnaireAt || "Jamais trouve", "Reponses questionnaire")}
          ${detail("Validation portefeuille", clientValidationSummary(client)?.label || "Aucune validation requise", "Portefeuille CoachRx")}
        </div>
        ${identityWarnings.length ? `
          <div class="notice compact client-warning">
            <strong>Points a verifier</strong>
            ${identityWarnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}
          </div>
        ` : ""}
      </details>
      <details class="client-secondary-details client-edit-details">
        <summary>Modifier infos client</summary>
        <form class="client-edit-form" data-form="client" data-id="${escapeHtml(client.id)}">
          <div class="form-grid">
            <label>Nom<input class="input" name="name" value="${escapeAttr(client.name || "")}" required></label>
            <label>Telephone<input class="input" name="phoneNormalized" value="${escapeAttr(phone || "")}" placeholder="8192771825"></label>
            <label>Courriel<input class="input" name="email" value="${escapeAttr(client.email || "")}"></label>
            <label>Membership<input class="input" name="membershipLabel" value="${escapeAttr(client.membershipLabel || "")}"></label>
            <label>Fin membership manuelle<input class="input" type="date" name="manualMembershipEndDate" value="${escapeAttr(client.manualMembershipEndDate || "")}"></label>
            <label>Recurrence prevue dans Kilo<input class="input" type="date" name="kiloPlannedRecurrenceEndDate" value="${escapeAttr(client.kiloPlannedRecurrenceEndDate || "")}"></label>
            <label>Risque coach
              <select class="input" name="riskLevel">
                ${riskOptions(client.riskLevel)}
              </select>
            </label>
            <label>Note risque<input class="input" name="riskNote" value="${escapeAttr(client.riskNote || "")}"></label>
            <label>Coach responsable
              <select class="input" name="coachId">
                ${mergedCoachOptions().map((coach) => `
                  <option value="${escapeAttr(coach.id)}" ${String(client.coachId || state.selectedCoachId) === String(coach.id) ? "selected" : ""}>
                    ${escapeHtml(coach.name || coach.id)}
                  </option>
                `).join("")}
              </select>
            </label>
            <div class="field-note admin-transfer-note">
              <strong>Transfert coach</strong>
              <span>Si le coach change, les To-do, rebookings, questionnaires, check-ups et impacts relies a cette fiche suivent le client.</span>
            </div>
          </div>
          <label>Notes / objectifs<textarea class="input" name="notes">${escapeHtml(client.notes || "")}</textarea></label>
          <div class="modal-actions">
            <button class="primary" type="submit">Enregistrer</button>
          </div>
        </form>
      </details>
      ${renderClientSourceDetails(client, adminIdentitySummary, syncSummary)}
      <div class="modal-actions">
        <button class="secondary" type="button" data-action="closeModal">Fermer</button>
      </div>
    </div>
  `);
}

function renderClientCommandStrip(client) {
  const work = clientWorkSummary(client);
  const summary = clientPrioritySummary(client, work);
  return `
    <section class="client-command-strip ${escapeAttr(summary.level)}">
      <div class="client-command-main">
        <span class="eyebrow">A faire maintenant</span>
        <strong>${escapeHtml(summary.title)}</strong>
        <p>${escapeHtml(summary.detail)}</p>
      </div>
      <div class="client-command-stats" aria-label="Resume du suivi client">
        <span><strong>${work.openTasks.length}</strong> missions</span>
        <span><strong>${work.openResponses.length}</strong> reponses</span>
        <span><strong>${work.sessions}</strong> seances</span>
      </div>
    </section>
  `;
}

function renderClientQuickActions(client) {
  const phone = clientPhone(client);
  const work = clientWorkSummary(client);
  const primary = clientPrimaryAction(client, work);
  return `
    <section class="client-control-section client-quick-actions client-section-action">
      <div class="client-section-head">
        <strong>Action utile</strong>
        <span>${escapeHtml(primary.caption)}</span>
      </div>
      <div class="client-primary-action">
        <div>
          <strong>${escapeHtml(primary.title)}</strong>
          <span>${escapeHtml(primary.detail)}</span>
        </div>
        ${primary.button}
      </div>
      <details class="client-more-actions">
        <summary>Autres actions coach</summary>
        <div class="client-quick-action-grid">
          ${phone ? "" : `<button class="secondary" type="button" data-action="openClientPhoneFix" data-id="${escapeHtml(client.id)}">Ajouter telephone</button>`}
          <button class="secondary" type="button" data-action="openClientMission" data-id="${escapeHtml(client.id)}">Creer mission</button>
          <button class="secondary" type="button" data-action="openClientQuestionnaireSend" data-id="${escapeHtml(client.id)}" ${phone ? "" : "disabled"}>Envoyer questionnaire</button>
          <button class="secondary" type="button" data-action="openQuestionnaireSchedule" data-id="${escapeHtml(client.id)}" ${phone ? "" : "disabled"}>Planifier questionnaire</button>
          <button class="secondary" type="button" data-action="openClientRebooking" data-id="${escapeHtml(client.id)}">Ajouter seance</button>
        </div>
      </details>
      <details class="client-danger-actions">
        <summary>Alumni ou suppression</summary>
        <div>
          <button class="secondary danger-lite" type="button" data-action="moveClientToAlumni" data-id="${escapeHtml(client.id)}">Passer en Alumni</button>
          <button class="secondary danger-lite" type="button" data-action="deleteClient" data-id="${escapeHtml(client.id)}">Supprimer faux client</button>
        </div>
        <p>Alumni garde l'historique. Supprimer sert seulement pour un doublon, un test ou une fiche creee par erreur.</p>
      </details>
    </section>
  `;
}

function clientPrimaryAction(client, work = clientWorkSummary(client)) {
  const phone = clientPhone(client);
  if (!phone) {
    return {
      title: "Telephone manquant",
      detail: "A faire avant questionnaire, GHL ou matching fiable.",
      caption: "A completer",
      button: `<button class="primary" type="button" data-action="openClientPhoneFix" data-id="${escapeAttr(client.id)}">Ajouter telephone</button>`
    };
  }
  if (work.sessions > 0 && work.openRebookings[0]?.id) {
    return {
      title: `${work.sessions} seance(s) a remettre`,
      detail: "Confirme la reprise ou ferme le suivi dans Rebooking.",
      caption: "Seance a remettre",
      button: `<button class="primary" type="button" data-action="openRebookingDetail" data-id="${escapeAttr(work.openRebookings[0].id)}">Voir rebooking</button>`
    };
  }
  if (work.openResponses[0]?.id) {
    return {
      title: "Questionnaire a lire",
      detail: "Lis le briefing, puis cree une mission seulement si une action est requise.",
      caption: "Reponse client",
      button: `<button class="primary" type="button" data-action="openQuestionnaireDetail" data-id="${escapeAttr(work.openResponses[0].id)}">Lire reponse</button>`
    };
  }
  if (work.openTasks[0]?.id) {
    return {
      title: taskDisplayTitle(work.openTasks[0]) || "Mission ouverte",
      detail: work.openTasks[0].dueAt ? `Echeance: ${formatDate(work.openTasks[0].dueAt)}` : "Mission active liee a ce client.",
      caption: "Mission ouverte",
      button: `<button class="primary" type="button" data-action="openTaskEdit" data-id="${escapeAttr(work.openTasks[0].id)}">Voir mission</button>`
    };
  }
  return {
    title: "Aucune action ouverte",
    detail: "Ajoute une mission seulement si un vrai suivi doit etre fait.",
    caption: "Pret au besoin",
    button: `<button class="primary" type="button" data-action="openClientMission" data-id="${escapeAttr(client.id)}">Creer mission</button>`
  };
}

function renderClientSummaryPanel(client) {
  const phone = clientPhone(client);
  const coachId = client.coachId || state.selectedCoachId;
  const coachName = client.coachName || coachRecordById(coachId)?.name || activeCoachRecord()?.name || "A confirmer";
  const risk = client.riskLevel && client.riskLevel !== "none"
    ? detail("Risque coach", riskLabel(client.riskLevel), client.riskNote || "A verifier")
    : "";
  return `
    <section class="client-control-section client-section-summary">
      <div class="client-section-head">
        <strong>Resume client</strong>
        <span>Coordonnees utiles</span>
      </div>
      <div class="detail-grid client-primary-details compact">
        ${detail("Membership", client.membershipLabel || "A preciser", membershipSourceLabel(client))}
        ${detail("Coach", coachName, "Responsable actuel")}
        ${detail("Telephone", phone || "A ajouter", phone ? "Contact client" : "A completer")}
        ${risk}
      </div>
    </section>
  `;
}

function renderClientTrainingRhythm(client) {
  const training = clientTrainingSnapshot(client);
  return `
    <section class="client-control-section client-training-rhythm client-section-training ${escapeAttr(training.comparisonLevel)}">
      <div class="client-section-head">
        <strong>Rythme d'entrainement</strong>
        <span>30 derniers jours</span>
      </div>
      <div class="client-training-metrics">
        <div><span>Cible / sem</span><strong>${training.weeklyTarget === null ? "A definir" : formatClientDecimal(training.weeklyTarget)}</strong></div>
        <div><span>Reel / sem</span><strong>${training.weeklyActual === null ? "Indisponible" : formatClientDecimal(training.weeklyActual)}</strong></div>
        <div><span>Seances 30 j</span><strong>${training.attendance === null ? "Indisponible" : formatClientDecimal(training.attendance, 0)}</strong></div>
        <div class="client-level-metric ${escapeAttr(clientLevelMethodClass(training.levelMethod))}"><span>Level Method</span><strong>${escapeHtml(training.levelMethod || "Indisponible")}</strong></div>
      </div>
      <div class="client-training-footer">
        <span>${escapeHtml(training.comparisonLabel)}</span>
        <form class="client-target-form" data-form="clientTrainingTarget" data-id="${escapeAttr(client.id)}">
          <label>Cible
            <input class="input" type="number" name="targetSessionsPerWeek" min="0.5" max="14" step="0.5" value="${training.weeklyTarget === null ? "" : escapeAttr(training.weeklyTarget)}" placeholder="2">
          </label>
          <button class="secondary tiny" type="submit">Enregistrer</button>
        </form>
      </div>
    </section>
  `;
}

function renderClientTrainingModal() {
  const client = selectableClientForCoach(state.modal.id);
  if (!client) return "";
  return modal("Rythme d'entrainement", `
    <div class="modal-form client-training-modal">
      <div class="client-modal-intro client-modal-profile">
        <div class="client-modal-identity">
          <strong>${escapeHtml(client.name || "Client sans nom")}</strong>
          <span>Ajuste la cible sans quitter la liste Clients.</span>
        </div>
        ${renderClientInfoPills(client, { interactiveRhythm: false, includeRhythm: false })}
      </div>
      ${renderClientTrainingRhythm(client)}
      <div class="modal-actions">
        <button class="secondary" type="button" data-action="openClient" data-id="${escapeAttr(client.id)}">Voir fiche complete</button>
        <button class="secondary" type="button" data-action="closeModal">Fermer</button>
      </div>
    </div>
  `);
}

function optionalClientNumber(value) {
  if (value === null || typeof value === "undefined" || String(value).trim() === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function formatClientDecimal(value, maximumFractionDigits = 1) {
  return Number(value).toLocaleString("fr-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
}

function renderClientPhoneFixModal() {
  const client = selectableClientForCoach(state.modal.id);
  if (!client) return "";
  const currentPhone = clientPhone(client);
  const suggestion = clientPhoneSuggestion(client);
  const inputPhone = currentPhone || suggestion?.phone || "";
  return modal("Ajouter telephone client", `
    <form class="modal-form" data-form="clientPhoneFix" data-id="${escapeHtml(client.id)}">
      <div class="client-modal-intro">
        <div>
          <strong>${escapeHtml(client.name || "Client sans nom")}</strong>
          <span>Correction manuelle prioritaire pour Questionnaires, GHL, CSM et Rebooking.</span>
        </div>
        <span class="source-badge warning">${currentPhone ? "Telephone present" : "Telephone requis"}</span>
      </div>
      <div class="notice compact">
        <strong>Correction ciblee</strong>
        <p>Cette action modifie seulement le telephone et sa source de validation. Les notes, le membership, le coach et les autres champs manuels restent intacts.</p>
        ${!currentPhone && suggestion?.phone ? `<p>Suggestion CSM/check-up: ${escapeHtml(suggestion.phone)} (${Number(suggestion.count || 1)} occurrence(s)). Confirme avant d'enregistrer.</p>` : ""}
      </div>
      <div class="form-grid">
        <label>Telephone normalise
          <input class="input" name="phoneNormalized" value="${escapeAttr(inputPhone)}" placeholder="8192771825" inputmode="numeric" required>
        </label>
        <label>Note optionnelle
          <input class="input" name="note" value="${escapeAttr(!currentPhone && suggestion?.phone ? "Suggestion CSM a confirmer" : "")}" placeholder="Ex.: confirme par SMS, GHL, CSM">
        </label>
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit">Enregistrer telephone</button>
        <button class="secondary" type="button" data-action="openClient" data-id="${escapeHtml(client.id)}">Voir fiche complete</button>
        <button class="secondary" type="button" data-action="closeModal">Fermer</button>
      </div>
    </form>
  `);
}

function clientWorkSummary(client) {
  const clientId = client.id;
  const phone = clientPhone(client);
  const openTasks = state.data.tasks
    .filter(isOpenTask)
    .filter((task) => task.clientId === clientId || (phone && normalizePhone(task.clientPhoneNormalized || task.phoneNormalized) === phone))
    .slice()
    .sort(sortTasks);
  const responses = portfolioQuestionnaireResponses()
    .filter((response) => response.clientId === clientId || (phone && normalizePhone(response.phoneNormalized || response.clientPhoneNormalized) === phone))
    .slice()
    .sort((a, b) => dateValue(b.submittedAt || b.createdAt) - dateValue(a.submittedAt || a.createdAt));
  const openResponses = responses.filter((response) => (response.processingStatus || "to_read") === "to_read");
  const openRebookings = portfolioRebookings()
    .filter((item) => rebookingStatus(item) === "open")
    .filter((item) => item.clientId === clientId || (phone && normalizePhone(item.clientPhoneNormalized || item.phoneNormalized) === phone));
  const sessions = openRebookings.reduce((sum, item) => sum + Math.max(1, Number(item.sessionsToRebook || 1)), 0);
  return { openTasks, responses, openResponses, openRebookings, sessions };
}

function clientPhoneSuggestion(client) {
  if (!client || clientPhone(client)) return null;
  const nameKey = normalizeComparable(client.name || client.clientName || "");
  if (!nameKey) return null;
  const candidates = portfolioCheckups()
    .filter((checkup) => normalizeComparable(checkup.clientName || checkup.name || "") === nameKey)
    .map((checkup) => normalizePhone(checkup.clientPhoneNormalized || checkup.phoneNormalized || checkup.phone || ""))
    .filter(Boolean);
  const uniquePhones = [...new Set(candidates)];
  if (uniquePhones.length !== 1) {
    return uniquePhones.length > 1 ? { ambiguous: true, count: uniquePhones.length } : null;
  }
  return {
    phone: uniquePhones[0],
    count: candidates.length,
    source: "csm_checkups"
  };
}

function clientPrioritySummary(client, work = clientWorkSummary(client)) {
  const phone = clientPhone(client);
  const validation = clientValidationSummary(client);
  if (!phone) {
    return {
      level: "warning",
      title: "Telephone a completer",
      detail: "Le telephone fiabilise les questionnaires, GHL, CSM et les liens rebooking."
    };
  }
  if (work.sessions > 0) {
    return {
      level: "urgent",
      title: "Seance a remettre",
      detail: `${work.sessions} seance(s) a remettre. Confirme le suivi dans Rebooking apres l'action.`
    };
  }
  if (work.openResponses.length) {
    return {
      level: "warning",
      title: "Questionnaire a lire",
      detail: `${work.openResponses.length} reponse(s) attendent une lecture ou une mission de suivi.`
    };
  }
  if (work.openTasks.length) {
    return {
      level: "warning",
      title: "Mission ouverte",
      detail: `${work.openTasks.length} mission(s) active(s) sont liees a ce client.`
    };
  }
  if (validation) {
    return {
      level: validation.level || "warning",
      title: validation.label,
      detail: "Confirme si la fiche reste active, passe en Alumni, ou a besoin d'une info manquante."
    };
  }
  return {
    level: "ok",
    title: "Aucune priorite ouverte",
    detail: "La fiche est prete pour une note, une mission, un questionnaire ou un rebooking au besoin."
  };
}

function renderClientActivityPanel(client) {
  const work = clientWorkSummary(client);
  const taskCount = work.openTasks.length;
  const responseCount = work.openResponses.length;
  const openTasks = work.openTasks.slice(0, 4);
  const responses = work.responses;
  const openResponses = work.openResponses.slice(0, 3);
  const openRebookings = work.openRebookings;
  const sessions = work.sessions;
  const nextItems = clientNextActions(client, work).slice(0, 4);
  const hiddenCount = Math.max(0, taskCount + responseCount + openRebookings.length - nextItems.length);
  if (!taskCount && !responseCount && !sessions) {
    return `
      <section class="client-control-section client-action-hub client-action-hub-empty client-section-followup">
        <div class="client-section-head client-action-head">
          <strong>Actions ouvertes</strong>
          <span>Aucune action ouverte</span>
        </div>
        <p class="meta">Aucune mission, reponse questionnaire ou seance a remettre pour ce client.</p>
      </section>
    `;
  }
  return `
    <section class="client-control-section client-action-hub client-section-followup">
      <div class="client-section-head client-action-head">
        <strong>Actions ouvertes</strong>
        <span>${taskCount} mission(s) · ${responseCount} questionnaire(s) · ${sessions} seance(s)</span>
      </div>
      <div class="client-next-action-list">
        ${nextItems.map((item) => `
          <div class="client-next-action-row ${escapeAttr(item.level || "")}">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.meta)}</span>
            </div>
            ${item.button}
          </div>
        `).join("")}
      </div>
      ${hiddenCount ? `<p class="client-action-more-note">+ ${hiddenCount} autre(s) element(s) dans les details.</p>` : ""}
      <details class="client-more-actions client-activity-details">
        <summary>Voir le detail des actions</summary>
        <div class="client-action-grid">
          <div class="client-action-block">
            <h4>Missions</h4>
            ${openTasks.length ? openTasks.map((task) => `
              <div class="mini-action-row">
                <span>${escapeHtml(taskDisplayTitle(task) || "Mission")}</span>
                <small>${escapeHtml(task.priority || "P2")}${task.dueAt ? ` · ${formatDate(task.dueAt)}` : ""}</small>
                <button class="secondary tiny" type="button" data-action="openTaskEdit" data-id="${escapeHtml(task.id)}">Modifier</button>
              </div>
            `).join("") : `<p class="meta">Aucune mission ouverte pour ce client.</p>`}
          </div>
          <div class="client-action-block">
            <h4>Questionnaires</h4>
            ${openResponses.length ? openResponses.map((response) => `
              <div class="mini-action-row">
                <span>${escapeHtml(questionnairePrioritySummary(response).label)}</span>
                <small>${formatDate(response.submittedAt || response.createdAt)}</small>
                <button class="secondary tiny" type="button" data-action="openQuestionnaireDetail" data-id="${escapeHtml(response.id)}">Lire</button>
              </div>
            `).join("") : `<p class="meta">${responses.length ? "Aucune reponse ouverte." : "Aucune reponse recue."}</p>`}
          </div>
          <div class="client-action-block">
            <h4>Rebooking</h4>
            ${openRebookings.length ? `
              <p class="meta">${sessions} seance(s) a remettre dans ${openRebookings.length} dossier(s).</p>
            ` : `<p class="meta">Aucune seance a remettre.</p>`}
            <button class="secondary tiny" type="button" data-action="openClientRebooking" data-id="${escapeHtml(client.id)}">Ajouter</button>
          </div>
        </div>
      </details>
    </section>
  `;
}

function clientNextActions(client, work = clientWorkSummary(client)) {
  const items = [];
  if (work.sessions > 0) {
    const firstRebooking = work.openRebookings[0];
    items.push({
      level: "urgent",
      title: `${work.sessions} seance(s) a remettre`,
      meta: firstRebooking ? (rebookingCancellationDateSummary(firstRebooking, 1) || "Rebooking ouvert") : "Rebooking ouvert",
      button: firstRebooking?.id
        ? `<button class="primary tiny" type="button" data-action="openRebookingDetail" data-id="${escapeAttr(firstRebooking.id)}">Voir</button>`
        : `<button class="secondary tiny" type="button" data-action="openClientRebooking" data-id="${escapeAttr(client.id)}">Ajouter</button>`
    });
  }
  work.openResponses.slice(0, 2).forEach((response) => {
    items.push({
      level: "warning",
      title: `Lire ${questionnaireTypeLabel(questionnaireResponseType(response))}`,
      meta: `Reponse: ${formatDate(response.submittedAt || response.createdAt)}`,
      button: `<button class="primary tiny" type="button" data-action="openQuestionnaireDetail" data-id="${escapeAttr(response.id)}">Lire</button>`
    });
  });
  work.openTasks.slice(0, 3).forEach((task) => {
    items.push({
      level: task.priority === "P1" ? "urgent" : "warning",
      title: taskDisplayTitle(task) || "Mission ouverte",
      meta: task.dueAt ? `Echeance: ${formatDate(task.dueAt)}` : "Mission active",
      button: `<button class="secondary tiny" type="button" data-action="openTaskEdit" data-id="${escapeAttr(task.id)}">Modifier</button>`
    });
  });
  return items;
}

function renderClientFormModal() {
  return modal("Ajouter un client", `
    <form class="modal-form" data-form="clientCreate">
      <div class="form-grid">
        <label>Nom<input class="input" name="name" required></label>
        <label>Telephone<input class="input" name="phoneNormalized" placeholder="8192771825"></label>
        <label>Courriel<input class="input" name="email"></label>
        <label>Membership<input class="input" name="membershipLabel" placeholder="Semi-Prive 1x/sem"></label>
        <label>Fin membership manuelle<input class="input" type="date" name="manualMembershipEndDate"></label>
        <label>Recurrence prevue dans Kilo<input class="input" type="date" name="kiloPlannedRecurrenceEndDate"></label>
      </div>
      <label>Notes / objectifs<textarea class="input" name="notes"></textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">Ajouter</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderQuickNoteModal() {
  const rebooking = state.modal.rebookingId
    ? findRebookingForCoachView(state.modal.rebookingId)
    : null;
  const selectedClientId = state.modal.clientId || rebooking?.clientId || "";
  const client = selectedClientId
    ? selectableClientForCoach(selectedClientId)
    : null;
  const clientOptions = selectableClientsForCoach()
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === selectedClientId ? "selected" : ""}>${escapeHtml(item.name || "Client")}</option>`)
    .join("");
  const sessions = rebooking ? Math.max(1, Number(rebooking.sessionsToRebook || 1)) : 0;
  const titleValue = rebooking
    ? `Rebooker ${sessions} seance${sessions > 1 ? "s" : ""}`
    : client
      ? "Faire un suivi client"
      : "";
  const rebookingDetails = rebooking ? rebookingCancellationDateSummary(rebooking, 4) : "";
  const descriptionValue = rebookingDetails ? `Annulation: ${rebookingDetails}` : "";
  if (isInfoAdmin() && state.modal.composerMode !== "manual") {
    return renderAssistantQuickNoteModal({ rebooking, client, selectedClientId, clientOptions });
  }
  return modal(rebooking ? "Creer une mission rebooking" : client ? "Creer une mission client" : "Ajouter une mission", `
    ${isInfoAdmin() ? `
      <div class="mission-composer-switch">
        <button class="secondary" type="button" data-action="setQuickNoteMode" data-mode="assistant">Utiliser l'assistant</button>
        <span>Formulaire manuel actif</span>
      </div>
    ` : ""}
    <form class="modal-form task-modal-compact" data-form="quickNote">
      ${rebooking ? `
        <div class="notice compact">
          Mission reliee au dossier rebooking de <strong>${escapeHtml(rebooking.clientName || client?.name || "ce client")}</strong>.
        </div>
        <input type="hidden" name="rebookingId" value="${escapeAttr(rebooking.id)}">
      ` : ""}
      ${client ? `
        ${rebooking ? "" : `<div class="notice compact">Mission reliee a <strong>${escapeHtml(client.name || "Client")}</strong>.</div>`}
        <input type="hidden" name="clientId" value="${escapeAttr(client.id)}">
      ` : `
        <label>Client optionnel
          <select class="input" name="clientId">
            <option value="">Aucun client</option>
            ${clientOptions}
          </select>
        </label>
      `}
      <label>Mission<input class="input" name="title" required placeholder="Ex.: Programme a ajuster" value="${escapeAttr(titleValue)}"></label>
      <div class="form-grid">
        <label>Priorite
          <select class="input" name="priority">
            <option value="P2">Normale</option>
            <option value="P1">Urgente</option>
            <option value="P3">Faible</option>
          </select>
        </label>
        <label>Date cible<input class="input" type="date" name="dueAt" value="${todayIso()}"></label>
      </div>
      <label class="checkbox-line"><input type="checkbox" name="starred" value="true"> Etoiler cette mission</label>
      ${renderVoiceRecorderField("quickNote")}
      <details class="mission-optional-details">
        <summary>Details optionnels</summary>
        <label>Details<textarea class="input" name="description" placeholder="Contexte ou prochaine action concrete">${escapeHtml(descriptionValue)}</textarea></label>
      </details>
      <div class="modal-actions">
        <button class="primary" type="submit">Creer mission</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderAssistantQuickNoteModal({ rebooking = null, client = null, selectedClientId = "", clientOptions = "" } = {}) {
  const voiceRequestId = cleanString(state.modal.assistantVoiceRequestId);
  const voiceRequest = voiceRequestId
    ? (state.data.assistantVoiceRequests || []).find((item) => item.id === voiceRequestId)
    : null;
  const requestId = cleanString(state.modal.assistantRequestId);
  const request = requestId
    ? (state.data.assistantRequests || []).find((item) => item.id === requestId)
    : null;
  const proposal = request
    ? (state.data.assistantProposals || []).find((item) => item.id === request.proposalId || item.requestId === request.id)
    : null;
  const actionRequestId = cleanString(state.modal.assistantActionRequestId);
  const actionRequest = actionRequestId
    ? (state.data.assistantActionRequests || []).find((item) => item.id === actionRequestId)
    : proposal
      ? (state.data.assistantActionRequests || []).find((item) => item.proposalId === proposal.id)
      : null;
  const defaultDraft = rebooking
    ? `Cree une mission pour ${rebooking.clientName || client?.name || "ce client"}: rebooker la seance annulee.`
    : client
      ? `Cree une mission pour ${client.name || "ce client"}: `
      : "";
  const draftText = cleanString(state.modal.assistantDraftText || defaultDraft);
  const title = rebooking ? "Mission rebooking avec l'assistant" : client ? "Mission client avec l'assistant" : "Creer une mission avec l'assistant";
  return modal(title, `
    <div class="assistant-mission-shell">
      <div class="mission-composer-switch">
        <strong>Assistant IA</strong>
        <button class="secondary" type="button" data-action="setQuickNoteMode" data-mode="manual">Formulaire manuel</button>
      </div>
      <div class="notice compact assistant-scope-notice">
        <strong>Laboratoire prive info@</strong>
        <span>Coach cible: ${escapeHtml(activeCoachRecord()?.name || state.selectedCoachId)}. L'assistant prepare seulement une mission; rien n'est cree avant ta confirmation.</span>
      </div>
      ${renderAssistantMissionStep({ voiceRequest, request, proposal, actionRequest, client, selectedClientId, clientOptions, draftText })}
    </div>
  `);
}

function renderAssistantMissionStep({ voiceRequest = null, request = null, proposal = null, actionRequest = null, client = null, selectedClientId = "", clientOptions = "", draftText = "" } = {}) {
  if (actionRequest) {
    const status = cleanString(actionRequest.status || "queued");
    if (["queued", "processing"].includes(status)) {
      return `<div class="assistant-mission-progress"><strong>Creation securisee en cours...</strong><span>Le serveur reverifie tes droits, le coach, le client et la proposition.</span></div>`;
    }
    if (status === "success") {
      return `
        <section class="assistant-mission-result success">
          <span class="assistant-step-label">Mission creee</span>
          <strong>${escapeHtml(proposal?.actionParameters?.title || "Mission sauvegardee")}</strong>
          <p>Preuve: mission ${escapeHtml(actionRequest.resultEntityId || "confirmee")} creee dans la To-do de ${escapeHtml(activeCoachRecord()?.name || "ce coach")}.</p>
          <div class="modal-actions">
            <button class="primary" type="button" data-action="openAssistantCreatedTask" data-id="${escapeAttr(actionRequest.resultEntityId || "")}">Voir la mission</button>
            <button class="secondary" type="button" data-action="resetAssistantTaskDraft">Creer une autre mission</button>
            <button class="secondary" type="button" data-action="closeModal">Fermer</button>
          </div>
        </section>
      `;
    }
    return `
      <div class="notice error compact">
        <strong>Mission non creee</strong>
        <span>${escapeHtml(actionRequest.errorMessage || "La confirmation n'a pas pu etre executee.")}</span>
      </div>
      <div class="modal-actions">
        <button class="primary" type="button" data-action="resetAssistantTaskDraft">Recommencer</button>
        <button class="secondary" type="button" data-action="setQuickNoteMode" data-mode="manual">Formulaire manuel</button>
      </div>
    `;
  }

  if (proposal?.status === "proposed" && proposal.actionType === "task.create") {
    const parameters = proposal.actionParameters || {};
    const proposedClientId = cleanString(parameters.clientId || selectedClientId);
    return `
      <form class="modal-form assistant-confirmation-card" data-form="assistantTaskConfirm" data-proposal-id="${escapeAttr(proposal.id)}">
        <div class="assistant-confirmation-head">
          <div>
            <span class="assistant-step-label">A confirmer</span>
            <strong>Voici la mission que je vais creer</strong>
          </div>
          <span class="pill amber">R1</span>
        </div>
        ${request?.inputMode === "voice" && request.inputText ? `
          <details class="assistant-transcript-details">
            <summary>Voir la transcription</summary>
            <p>${escapeHtml(request.inputText)}</p>
          </details>
        ` : ""}
        ${proposal.displaySummary ? `<p class="assistant-confirmation-summary">${escapeHtml(proposal.displaySummary)}</p>` : ""}
        <label>Client
          <select class="input" name="clientId">
            <option value="" ${proposedClientId ? "" : "selected"}>Aucun client · note coach</option>
            ${selectableClientsForCoach()
              .slice()
              .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
              .map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === proposedClientId ? "selected" : ""}>${escapeHtml(item.name || "Client")}</option>`)
              .join("")}
          </select>
        </label>
        <label>Mission<input class="input" name="title" maxlength="180" value="${escapeAttr(parameters.title || "")}" required></label>
        <label>Details<textarea class="input" name="description" maxlength="1200" rows="3">${escapeHtml(parameters.description || "")}</textarea></label>
        <div class="form-grid">
          <label>Priorite
            <select class="input" name="priority">
              ${["P1", "P2", "P3"].map((priority) => `<option value="${priority}" ${parameters.priority === priority ? "selected" : ""}>${priority === "P1" ? "Urgente" : priority === "P2" ? "Normale" : "Faible"}</option>`).join("")}
            </select>
          </label>
          <label>Date cible<input class="input" type="date" name="dueAt" value="${escapeAttr(parameters.dueAt || todayIso())}" required></label>
        </div>
        <label class="checkbox-line"><input type="checkbox" name="starred" value="true" ${parameters.starred ? "checked" : ""}> Etoiler cette mission</label>
        <div class="assistant-consequence">
          <strong>Consequence</strong>
          <span>Une mission ouverte sera ajoutee a la To-do. Aucune fiche client, reponse questionnaire ou autre donnee ne sera modifiee.</span>
        </div>
        <div class="modal-actions">
          <button class="primary" type="submit">Confirmer et creer</button>
          <button class="secondary" type="button" data-action="resetAssistantTaskDraft">Corriger la demande</button>
          <button class="secondary" type="button" data-action="closeModal">Annuler</button>
        </div>
      </form>
    `;
  }

  if (voiceRequest && ["queued", "transcribing"].includes(cleanString(voiceRequest.status))) {
    const isTranscribing = cleanString(voiceRequest.status) === "transcribing";
    return `
      <div class="assistant-mission-progress">
        <strong>${isTranscribing ? "Transcription du vocal..." : "Vocal recu..."}</strong>
        <span>${isTranscribing ? "L'assistant transforme tes mots en mission structurée." : "Le serveur prepare la transcription. Aucune mission n'est encore creee."}</span>
      </div>
    `;
  }

  if (voiceRequest?.status === "transcribed" && !request) {
    return `<div class="assistant-mission-progress"><strong>Vocal transcrit</strong><span>L'assistant structure maintenant la mission avant ta confirmation.</span></div>`;
  }

  if (voiceRequest?.status === "error") {
    return `
      <div class="notice error compact">
        <strong>Vocal a reprendre</strong>
        <span>${escapeHtml(voiceRequest.errorMessage || "Le vocal n'a pas pu etre transcrit. Aucune mission n'a ete creee.")}</span>
      </div>
      <div class="modal-actions">
        <button class="primary" type="button" data-action="resetAssistantTaskDraft">Reenregistrer</button>
        <button class="secondary" type="button" data-action="setQuickNoteMode" data-mode="manual">Formulaire manuel</button>
      </div>
    `;
  }

  if (request && ["queued", "processing"].includes(cleanString(request.status))) {
    return `<div class="assistant-mission-progress"><strong>Preparation de la mission...</strong><span>L'assistant cherche le client exact et structure l'action. Aucune ecriture en cours.</span></div>`;
  }

  if (request?.status === "error") {
    return `
      <div class="notice error compact"><strong>Proposition indisponible</strong><span>${escapeHtml(request.errorMessage || "Aucune mission n'a ete creee.")}</span></div>
      <div class="modal-actions"><button class="primary" type="button" data-action="resetAssistantTaskDraft">Reessayer</button><button class="secondary" type="button" data-action="setQuickNoteMode" data-mode="manual">Formulaire manuel</button></div>
    `;
  }

  if (proposal && ["clarification", "refused"].includes(cleanString(proposal.status))) {
    return `
      <section class="assistant-mission-clarification">
        <span class="assistant-step-label">${proposal.status === "clarification" ? "Precision requise" : "Action non proposee"}</span>
        <strong>${escapeHtml(proposal.clarifyingQuestion || proposal.title || "Precise la mission a creer.")}</strong>
        ${proposal.displaySummary ? `<p>${escapeHtml(proposal.displaySummary)}</p>` : ""}
        <div class="modal-actions"><button class="primary" type="button" data-action="resetAssistantTaskDraft">Reformuler</button><button class="secondary" type="button" data-action="setQuickNoteMode" data-mode="manual">Formulaire manuel</button></div>
      </section>
    `;
  }

  return `
    <form class="modal-form assistant-task-composer" data-form="assistantTaskDraft">
      ${client ? `<input type="hidden" name="clientId" value="${escapeAttr(client.id)}"><div class="assistant-context-chip">Client: <strong>${escapeHtml(client.name || "Client")}</strong></div>` : `
        <label>Client optionnel
          <select class="input" name="clientId">
            <option value="">L'assistant identifiera le client, ou note coach</option>
            ${clientOptions}
          </select>
        </label>
      `}
      ${renderVoiceRecorderField("assistantTaskDraft", null, {
        title: "Dicter la mission",
        help: "Parle naturellement: client, action, contexte, date et priorite. Maximum 2 minutes.",
        startLabel: "Commencer a parler",
        primaryStart: true,
        sectionClass: "assistant-voice-recorder"
      })}
      <div class="assistant-composer-divider"><span>ou ecrire</span></div>
      <label>Qu'est-ce que tu veux te laisser comme mission?
        <textarea class="input" name="inputText" maxlength="1200" rows="3" data-modal-draft="assistantTask" placeholder="Ex.: Cree une mission pour Donald: refaire son programme de force avant vendredi, priorite urgente.">${escapeHtml(draftText)}</textarea>
      </label>
      <div class="assistant-task-examples">
        <span>Tu peux inclure le client, le resultat attendu, la date et la priorite.</span>
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit">Preparer la mission</button>
        <button class="secondary" type="button" data-action="setQuickNoteMode" data-mode="manual">Formulaire manuel</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `;
}

function renderPilotageItemModal() {
  return modal("Ajouter un point a discuter", `
    <form class="modal-form" data-form="pilotageItem">
      <div class="notice compact">
        Un point a discuter n'est pas automatiquement une mission. Cree une mission seulement quand une vraie action doit etre faite apres la rencontre.
      </div>
      <label>Sujet<textarea class="input" name="title" placeholder="Ex.: discuter du client X, clarifier l'objectif, revoir un suivi" required></textarea></label>
      <label>Contexte optionnel<textarea class="input" name="note" placeholder="Pourquoi ce sujet doit etre aborde?"></textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">Ajouter au pilotage</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderPilotageNoteModal() {
  const note = state.modal.type === "pilotageNoteEdit"
    ? pilotageMeetingNotes().find((item) => item.id === state.modal.id)
    : null;
  const isEdit = Boolean(note);
  return modal(isEdit ? "Modifier la note de rencontre" : "Nouvelle note de rencontre", `
    <form class="modal-form" data-form="pilotageNote" ${isEdit ? `data-id="${escapeAttr(note.id)}"` : ""}>
      <div class="form-grid">
        <label>Date de rencontre<input class="input" type="date" name="meetingDate" value="${escapeAttr(note?.meetingDate || todayIso())}" required></label>
        <label>Duree<input class="input" name="duration" value="${escapeAttr(note?.duration || "30 min")}"></label>
      </div>
      <label>Titre<input class="input" name="title" value="${escapeAttr(note?.title || "Rencontre hebdo coach - CFSB")}" required></label>
      <div class="pilotage-template">
        <strong>1. Check-in / Bright spots</strong>
        <label>Bright spot de la semaine<textarea class="input" name="brightSpot" placeholder="Victoire, moment fort, progression observee...">${escapeHtml(note?.brightSpot || "")}</textarea></label>
        <label>Impacts denombres<textarea class="input" name="impactsCounted" placeholder="Impacts revenus, renouvellements, retours clients, opportunites...">${escapeHtml(note?.impactsCounted || "")}</textarea></label>
      </div>
      <div class="pilotage-template">
        <strong>2. Scorecard - les chiffres qui menent</strong>
        <div class="form-grid">
          <label>Horaires SP<textarea class="input" name="scheduleNotes" placeholder="Couverture, conflits, trous, surcharge...">${escapeHtml(note?.scheduleNotes || "")}</textarea></label>
          <label>Programmations<textarea class="input" name="programmingNotes" placeholder="A jour, livre a temps, retards, blocages...">${escapeHtml(note?.programmingNotes || "")}</textarea></label>
          <label>Cancellation / rebooking<textarea class="input" name="rebookingNotes" placeholder="Annulations, reprises, seances encore en banque...">${escapeHtml(note?.rebookingNotes || "")}</textarea></label>
          <label>Nouveaux clients<textarea class="input" name="newClientsNotes" placeholder="# cette periode, qualite de l'integration...">${escapeHtml(note?.newClientsNotes || "")}</textarea></label>
          <label>Clients perdus<textarea class="input" name="lostClientsNotes" placeholder="# et raison principale...">${escapeHtml(note?.lostClientsNotes || "")}</textarea></label>
          <label>Analyse rendement<textarea class="input" name="performanceAnalysis" placeholder="Le chiffre cle, tendance, lecture rapide...">${escapeHtml(note?.performanceAnalysis || "")}</textarea></label>
        </div>
        <label>Resultat net derniere paie<textarea class="input" name="netPayResult" placeholder="Montant net, assez pour bien vivre, sujet a clarifier...">${escapeHtml(note?.netPayResult || "")}</textarea></label>
        <label>Formation continue<textarea class="input" name="trainingNotes" placeholder="Sujet a travailler, ressource a envoyer, competence a developper...">${escapeHtml(note?.trainingNotes || "")}</textarea></label>
      </div>
      <div class="pilotage-template">
        <strong>3. IDS - Identify, Discuss, Solve</strong>
        <label>IDS<textarea class="input" name="idsNotes" placeholder="Identifier le vrai probleme, discuter la cause, noter la solution retenue.">${escapeHtml(note?.idsNotes || "")}</textarea></label>
      </div>
      <label>Notes libres<textarea class="input" name="notes" placeholder="Contexte supplementaire, observation terrain...">${escapeHtml(note?.notes || "")}</textarea></label>
      <label>Decisions<textarea class="input" name="decisions" placeholder="Ce qui a ete decide pendant la rencontre.">${escapeHtml(note?.decisions || "")}</textarea></label>
      <label>Prochaines actions<textarea class="input" name="nextActions" placeholder="Actions a transformer en mission si necessaire.">${escapeHtml(note?.nextActions || "")}</textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">${isEdit ? "Enregistrer" : "Ajouter note"}</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderTaskEditModal() {
  const task = operationalTaskById(state.modal.id);
  if (!task) return "";
  const starred = isStarredTask(task);
  const description = taskDisplayDescription(task, taskActionGuidance(task)) || "";
  const hasVoice = Boolean(taskVoiceNote(task));
  const detailsOpen = description || hasVoice ? "open" : "";
  return modal("Modifier la mission", `
    <form class="modal-form task-modal-compact" data-form="taskEdit" data-id="${escapeHtml(task.id)}">
      <label>Mission<input class="input" name="title" required value="${escapeAttr(taskDisplayTitle(task) || task.title || "")}"></label>
      <div class="form-grid">
        <label>Priorite
          <select class="input" name="priority">
            <option value="P2" ${task.priority === "P2" || !task.priority ? "selected" : ""}>Normale</option>
            <option value="P1" ${task.priority === "P1" ? "selected" : ""}>Urgente</option>
            <option value="P3" ${task.priority === "P3" ? "selected" : ""}>Faible</option>
          </select>
        </label>
        <label>Date cible<input class="input" type="date" name="dueAt" value="${escapeAttr(task.dueAt || todayIso())}"></label>
      </div>
      <label class="checkbox-line"><input type="checkbox" name="starred" value="true" ${starred ? "checked" : ""}> Etoiler cette mission</label>
      <details class="mission-optional-details" ${detailsOpen}>
        <summary>Details ou vocal</summary>
        <label>Details<textarea class="input" name="description" placeholder="Contexte ou prochaine action concrete">${escapeHtml(description)}</textarea></label>
        ${renderVoiceRecorderField("taskEdit", task)}
      </details>
      <div class="modal-actions">
        <button class="primary" type="submit">Enregistrer</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderClientSourceDetails(client, identitySummary, syncSummary) {
  if (!isInfoAdmin()) return "";
  return `
    <details class="source-details">
      <summary>Source et synchronisation</summary>
      <p class="source-explainer">${escapeHtml(syncSummary)}</p>
      <div class="detail-grid compact">
        ${detail("Source", sourceLabel(client.source), "Origine principale")}
        ${detail("ID source", client.sourceClientId || client.id || "Non fourni", "Import/manuel")}
        ${detail("CoachRx", client.coachRxId || "Non fourni", "Coach associe")}
        ${detail("Portefeuille CoachRx", coachRxPortfolioLabel(client.coachRxPortfolioStatus), "Presence dans CoachRx")}
        ${detail("Programme CoachRx", coachRxProgramSummary(client) || "Aucun contexte programme", "Contexte seulement")}
        ${detail("Derniere sync", formatDateTime(client.updatedFromSheetsAt || client.sourceUpdatedAt || client.updatedAt), "Firestore")}
        ${detail("Lien client", client.matchedExistingClientBy || identitySummary.matchMethod, "Fusion / verification")}
        ${detail("Coach responsable", client.coachName || activeCoachRecord()?.name || "A confirmer", "Firestore")}
      </div>
    </details>
  `;
}

function questionnaireTypeConfig(type) {
  return QUESTIONNAIRE_TYPES.find((item) => item.type === type) || QUESTIONNAIRE_TYPES.find((item) => item.type === DEFAULT_QUESTIONNAIRE_TYPE);
}

function questionnaireTypeLabel(type) {
  return questionnaireTypeConfig(type)?.label || "Globale check";
}

function questionnaireTypeOptions(current = DEFAULT_QUESTIONNAIRE_TYPE) {
  return QUESTIONNAIRE_TYPES.map((item) => `
    <option value="${escapeAttr(item.type)}" ${item.type === current ? "selected" : ""}>
      ${escapeHtml(item.label)}
    </option>
  `).join("");
}

function questionnaireUrlForClient(client, type = DEFAULT_QUESTIONNAIRE_TYPE) {
  const config = questionnaireTypeConfig(type);
  const url = new URL(config.path || "/questionnaire/", QUESTIONNAIRE_BASE_URL);
  url.searchParams.set("phone", clientPhone(client));
  if (client.name) url.searchParams.set("client_name", client.name);
  if (client.email) url.searchParams.set("client_email", client.email);
  const coachName = client.coachName || coachRecordById(client.coachId || state.selectedCoachId)?.name || activeCoachRecord()?.name || "";
  if (coachName) url.searchParams.set("coach_name", coachName);
  url.searchParams.set("lock_context", "1");
  return url.toString();
}

function renderQuestionnaireSendModal() {
  const selectedClientId = state.modal.clientId || "";
  const selectedQuestionnaireType = state.modal.questionnaireType || DEFAULT_QUESTIONNAIRE_TYPE;
  const clients = selectableClientsForCoach();
  const clientsWithPhone = clients.filter(clientPhone).length;
  const clientsMissingPhone = clients.length - clientsWithPhone;
  const isAdminView = isInfoAdmin();
  const sendExplanation = isAdminView
    ? "Le dashboard ajoute le tag GHL dashboardcoach ou le tag associe au questionnaire choisi."
    : "Le questionnaire sera envoye au client selectionne si son telephone est confirme dans sa fiche.";
  return modal("Envoyer un questionnaire", `
    <form class="modal-form" data-form="questionnaireSend">
      <label>Client
        <select class="input" name="clientId" required>
          <option value="">Selectionner...</option>
          ${questionnaireSendClientOptions(clients, selectedClientId)}
        </select>
      </label>
      <label>Questionnaire
        <select class="input" name="questionnaireType" required>
          ${questionnaireTypeOptions(selectedQuestionnaireType)}
        </select>
      </label>
      <div class="notice compact">
        ${escapeHtml(sendExplanation)}
        ${clientsMissingPhone ? `<br>${clientsMissingPhone} client(s) sans telephone sont visibles mais desactives.` : ""}
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit" ${clientsWithPhone ? "" : "disabled"}>Envoyer</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderQuestionnaireScheduleModal() {
  const client = selectableClientForCoach(state.modal.clientId);
  if (!client) return "";
  const phone = clientPhone(client);
  const selectedQuestionnaireType = state.modal.questionnaireType || DEFAULT_QUESTIONNAIRE_TYPE;
  const existing = scheduleForClient(client.id, selectedQuestionnaireType) || {};
  const questionnaireType = existing.questionnaireType || selectedQuestionnaireType;
  const frequency = existing.frequency || "monthly";
  const nextSendAt = existing.nextSendAt || todayIso();
  const status = existing.status || "active";
  return modal(existing.id ? "Gerer l'automatisation" : "Creer une automatisation", `
    <form class="modal-form" data-form="questionnaireSchedule" data-client-id="${escapeAttr(client.id)}">
      <div class="client-modal-intro">
        <div>
          <strong>${escapeHtml(client.name || "Client")}</strong>
          <span>${escapeHtml(phone ? `Telephone: ${phone}` : "Telephone requis pour envoyer automatiquement")}</span>
        </div>
        <span class="source-badge ${phone ? "good" : "warning"}">${existing.id ? "Plan existant" : "Nouveau plan"}</span>
      </div>
      <div class="form-grid">
        <label>Questionnaire
          <select class="input" name="questionnaireType" required>
            ${questionnaireTypeOptions(questionnaireType)}
          </select>
        </label>
        <label>Frequence
          <select class="input" name="frequency" required>
            ${questionnaireScheduleFrequencyOptions(frequency)}
          </select>
        </label>
        <label>Prochain envoi
          <input class="input" type="date" name="nextSendAt" value="${escapeAttr(nextSendAt)}" required>
        </label>
        <label>Statut
          <select class="input" name="status">
            <option value="active" ${status === "active" ? "selected" : ""}>Actif</option>
            <option value="paused" ${status === "paused" ? "selected" : ""}>Pause</option>
          </select>
        </label>
        <label>Note optionnelle
          <input class="input" name="note" value="${escapeAttr(existing.note || "")}" placeholder="Ex.: suivi mensuel nutrition">
        </label>
      </div>
      <div class="notice compact">
        Le serveur verifie les questionnaires dus chaque matin. Si le client repond, la reponse apparaitra dans l'inbox questionnaire comme les envois manuels.
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit" ${phone ? "" : "disabled"}>Enregistrer automatisation</button>
        <button class="secondary" type="button" data-action="openClient" data-id="${escapeAttr(client.id)}">Retour client</button>
        <button class="secondary" type="button" data-action="closeModal">Fermer</button>
      </div>
    </form>
  `);
}

function renderQuestionnaireDetailModal() {
  const response = portfolioQuestionnaireResponses().find((item) => item.id === state.modal.id);
  if (!response) return "";
  const statusClass = triageClass(response.triageStatus);
  const phone = questionnaireResponsePhone(response);
  const highlights = questionnaireHighlights(response);
  const priority = questionnairePrioritySummary(response, highlights);
  const digest = questionnaireDigest(response, highlights, priority);
  const hasClient = Boolean(selectableClientForCoach(response.clientId));
  return modal("Lire la reponse questionnaire", `
    <div class="questionnaire-detail-modal">
      <div class="client-modal-intro">
        <div>
          <strong>${escapeHtml(response.clientName || response.name || "Reponse questionnaire")}</strong>
          <span>${escapeHtml(phone ? `Telephone: ${phone}` : "Telephone absent ou non reconnu")}</span>
        </div>
        <span class="source-badge ${escapeAttr(priority.level)}">${escapeHtml(priority.label)}</span>
      </div>
      <div class="questionnaire-response-meta">
        <span>${escapeHtml(digest.typeLabel)}</span>
        <span>Recu ${escapeHtml(formatDate(response.submittedAt || response.createdAt) || "date inconnue")}</span>
        <span>${escapeHtml(hasClient ? "Client reconnu" : "Client a confirmer")}</span>
      </div>
      ${renderQuestionnaireReadingBrief(response, digest, priority)}
      ${renderQuestionnaireCoachActionBar(response, hasClient, priority)}
      ${renderQuestionnaireStructuredAnswers(response, highlights)}
      <div class="modal-actions quiet-actions">
        <button class="secondary" type="button" data-action="closeModal">Fermer</button>
      </div>
    </div>
  `);
}

function renderQuestionnaireCoachActionBar(response, hasClient, priority) {
  const needsMission = hasClient && priority.level !== "green";
  const actionText = !hasClient
    ? "Relie d'abord la reponse au bon client avant de creer une mission."
    : needsMission
      ? "Cree une mission si un suivi concret est necessaire; sinon marque la reponse comme lue."
      : "Aucun signal urgent: archive si le contexte est compris.";
  const primaryButton = !hasClient
    ? `<button class="primary" data-action="openQuestionnaireLinkClient" data-id="${escapeAttr(response.id)}">Relier client</button>`
    : needsMission
      ? `<button class="primary" data-action="createMissionFromQuestionnaireResponse" data-id="${escapeAttr(response.id)}">Creer mission</button>`
      : `<button class="primary" data-action="markResponseRead" data-id="${escapeAttr(response.id)}">Marquer lu</button>`;
  const secondaryButtons = !hasClient
    ? `<button class="secondary" data-action="markResponseRead" data-id="${escapeAttr(response.id)}">Archiver sans client</button>`
    : `
      <button class="secondary" data-action="openClient" data-id="${escapeAttr(response.clientId)}">Ouvrir client</button>
      ${needsMission
        ? `<button class="secondary" data-action="markResponseRead" data-id="${escapeAttr(response.id)}">Marquer lu</button>`
        : `<button class="secondary" data-action="createMissionFromQuestionnaireResponse" data-id="${escapeAttr(response.id)}">Creer mission</button>`}
    `;
  return `
    <section class="questionnaire-coach-action">
      <div>
        <span>Action coach</span>
        <strong>${escapeHtml(needsMission ? "Transformer en mission ou marquer lu" : hasClient ? "Lire puis archiver" : "Client a confirmer")}</strong>
        <p>${escapeHtml(actionText)}</p>
      </div>
      <div class="questionnaire-coach-action-buttons">
        ${primaryButton}
        ${secondaryButtons}
      </div>
    </section>
  `;
}

function renderQuestionnaireReadingBrief(response, digest, priority) {
  return `
    <section class="questionnaire-reading-brief questionnaire-priority ${escapeAttr(priority.level)}">
      <div class="reading-brief-main">
        <span>Lecture rapide</span>
        <strong>${escapeHtml(digest.headline || priority.label)}</strong>
      </div>
      <div class="reading-brief-reason">
        <p>${escapeHtml(digest.summary || priority.reason)}</p>
      </div>
      <div class="reading-brief-action">
        <span>Action suggeree</span>
        <strong>${escapeHtml(digest.nextAction || priority.nextStep)}</strong>
      </div>
    </section>
  `;
}

function questionnaireSendClientOptions(clients = selectableClientsForCoach(), selectedClientId = "") {
  return clients.map((client) => {
    const phone = clientPhone(client);
    return `
      <option value="${escapeAttr(client.id)}" ${String(client.id) === String(selectedClientId) ? "selected" : ""} ${phone ? "" : "disabled"}>
        ${escapeHtml(client.name || "Client")} - ${escapeHtml(phone || "telephone manquant")}
      </option>
    `;
  }).join("");
}

function renderQuestionnaireLinkClientModal() {
  const response = questionnaireResponseForAdminLinking(state.modal.id);
  if (!response) return "";
  const phone = questionnaireResponsePhone(response);
  const suggestedName = normalizeComparable(response.clientName || response.name);
  const sortedClients = [...selectableClientsForCoach()].sort((a, b) => {
    const aPhoneScore = phone && clientPhone(a) === phone ? -2 : 0;
    const bPhoneScore = phone && clientPhone(b) === phone ? -2 : 0;
    const aNameScore = suggestedName && normalizeComparable(a.name) === suggestedName ? -1 : 0;
    const bNameScore = suggestedName && normalizeComparable(b.name) === suggestedName ? -1 : 0;
    return (aPhoneScore + aNameScore) - (bPhoneScore + bNameScore)
      || String(a.lastNameSort || a.name || "").localeCompare(String(b.lastNameSort || b.name || ""));
  });
  return modal("Relier la reponse a un client", `
    <form class="modal-form" data-form="questionnaireLinkClient" data-id="${escapeAttr(response.id)}">
      <p class="meta">
        Reponse a relier: <strong>${escapeHtml(response.clientName || response.name || "Client a confirmer")}</strong>.
        ${phone ? `Telephone reponse: ${escapeHtml(phone)}.` : "Aucun telephone fiable dans la reponse."}
      </p>
      <label>Client du portefeuille
        <select class="input" name="clientId" required>
          <option value="">Choisir un client</option>
          ${sortedClients.map((client) => {
            const clientPhoneValue = clientPhone(client);
            const matchHint = phone && clientPhoneValue === phone ? " - telephone identique" : "";
            return `
              <option value="${escapeAttr(client.id)}" ${String(client.id) === String(response.clientId) ? "selected" : ""}>
                ${escapeHtml(client.name || "Client")} - ${escapeHtml(clientPhoneValue || "telephone manquant")}${escapeHtml(matchHint)}
              </option>
            `;
          }).join("")}
        </select>
      </label>
      <label>Note optionnelle<textarea class="input" name="note" placeholder="Ex.: telephone confirme avec le coach, meme client mal matche dans la source."></textarea></label>
      <div class="notice compact">
        La reponse retournera dans Reponses a lire apres liaison. La mission coach sera creee seulement si le coach choisit Creer mission + lu.
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit">Relier la reponse</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderRebookingFormModal() {
  const selectedClientId = state.modal.clientId || "";
  const clients = selectableClientsForCoach();
  const selectedClient = clients.find((client) => String(client.id) === String(selectedClientId));
  const selectedCoach = activeCoachRecord();
  const selectedCoachId = selectedClient?.coachId || selectedCoach?.id || state.selectedCoachId || "";
  return modal("Ajouter une seance a remettre", `
    <form class="modal-form" data-form="rebookingCreate">
      <div class="form-grid">
        <label>Client du portefeuille
          <select class="input" name="clientId">
            <option value="">Non relie pour l'instant</option>
            ${clients.map((client) => `<option value="${escapeAttr(client.id)}" ${String(client.id) === String(selectedClientId) ? "selected" : ""}>${escapeHtml(client.name)}</option>`).join("")}
          </select>
        </label>
        <label>Seances a remettre<input class="input" type="number" min="1" name="sessionsToRebook" value="1"></label>
      </div>
      <div class="form-grid">
        <label>Coach responsable
          <select class="input" name="coachId">
            <option value="${escapeAttr(selectedCoachId)}" selected>${escapeHtml(selectedCoach?.name || selectedCoachId)}</option>
          </select>
        </label>
        <label>Date de la seance annulee ou a remettre<input class="input" type="date" name="appointmentAt"></label>
      </div>
      <label>Service<input class="input" name="service" placeholder="Ex.: Semi-prive, PT, classe speciale"></label>
      <label>Nom manuel si le client n'est pas dans la liste<input class="input" name="clientName" placeholder="Ex.: client a ajouter / a confirmer"></label>
      <label>Note pour le coach<textarea class="input" name="note" placeholder="Ex.: ancienne seance annulee non reprise, client a relancer, credit a verifier..."></textarea></label>
      <div class="notice compact">
        Ajoute seulement une seance que le coach doit vraiment remettre ou verifier. Les details techniques peuvent rester vides.
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit">Ajouter la seance</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderRebookingLinkClientModal() {
  const rebooking = portfolioRebookings().find((item) => item.id === state.modal.id);
  if (!rebooking) return "";
  const clients = selectableClientsForCoach();
  const suggestedName = normalizeComparable(rebooking.clientName);
  const sortedClients = [...clients].sort((a, b) => {
    const aScore = normalizeComparable(a.name) === suggestedName ? -1 : 0;
    const bScore = normalizeComparable(b.name) === suggestedName ? -1 : 0;
    return aScore - bScore || String(a.lastNameSort || a.name || "").localeCompare(String(b.lastNameSort || b.name || ""));
  });
  return modal("Relier le rebooking a un client", `
    <form class="modal-form" data-form="rebookingLinkClient" data-id="${escapeAttr(rebooking.id)}">
      <p class="meta">
        Dossier a relier: <strong>${escapeHtml(rebooking.clientName || "Client a confirmer")}</strong>.
        Le lien corrige seulement ce rebooking et garde une trace dans son historique.
      </p>
      <label>Client du portefeuille
        <select class="input" name="clientId" required>
          <option value="">Choisir un client</option>
          ${sortedClients.map((client) => `
            <option value="${escapeAttr(client.id)}" ${String(client.id) === String(rebooking.clientId) ? "selected" : ""}>
              ${escapeHtml(client.name || "Client")} - ${escapeHtml(clientPhone(client) || "telephone manquant")}
            </option>
          `).join("")}
        </select>
      </label>
      <label>Note optionnelle<textarea class="input" name="note" placeholder="Ex.: confirme avec le coach, meme client mal matche dans la source."></textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">Relier le client</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderRebookingAbsenceModal() {
  return modal("Vacances / absence coach", `
    <form class="modal-form" data-form="rebookingAbsenceFlow">
      <p class="meta">Marque en absence coach les rebookings ouverts dont la date tombe dans cette plage. Chaque item garde une trace dans son historique.</p>
      <div class="form-grid">
        <label>Debut<input class="input" type="date" name="startDate" value="${todayIso()}" required></label>
        <label>Fin<input class="input" type="date" name="endDate" value="${todayIso()}" required></label>
      </div>
      <label>Raison<textarea class="input" name="reason" placeholder="Ex.: vacances du coach, fermeture exceptionnelle..." required></textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">Appliquer aux rebookings</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderPerformanceDetailModal() {
  const metric = state.modal.metric || state.modal.id || "";
  const data = performanceDetailData(metric);
  return modal(data.title, `
    <div class="modal-form performance-detail-modal">
      <div class="client-modal-intro">
        <div>
          <strong>${escapeHtml(data.countLabel)}</strong>
          <span>${escapeHtml(data.subtitle)}</span>
        </div>
        <span class="source-badge ${data.items.length ? "good" : "neutral"}">${escapeHtml(performancePeriodLabel(state.filter.performancePeriod))}</span>
      </div>
      ${metric === "newClients" ? `
        <div class="performance-detail-actions">
          <button class="primary" type="button" data-action="openPerformanceNewClientManual">Ajouter un nouveau client</button>
          ${data.excludedCount ? `<span>${Number(data.excludedCount)} entree(s) retiree(s) de ce calcul.</span>` : ""}
        </div>
        ${renderPerformanceNewClientExclusions()}
      ` : ""}
      ${data.items.length ? `
        <div class="performance-detail-list">
          ${data.items.map(renderPerformanceDetailItem).join("")}
        </div>
      ` : `
        <div class="empty-state compact">Aucun element pour cette periode.</div>
      `}
    </div>
  `);
}

function renderWeeklyImpactsModal() {
  const impacts = currentWeekImpacts()
    .slice()
    .sort((a, b) => dateValue(b.impactDate || b.createdAt) - dateValue(a.impactDate || a.createdAt));
  const confirmed = impacts.filter((impact) => impact.status === "confirmed").length;
  const toConfirm = impacts.filter((impact) => !impact.status || impact.status === "draft").length;
  return modal("Impacts cette semaine", `
    <div class="modal-form weekly-command-modal">
      <div class="weekly-command-toolbar">
        <div>
          <strong>${impacts.length} impact${impacts.length > 1 ? "s" : ""}</strong>
          <span>${escapeHtml(currentWeekLabel())} · ${confirmed} confirme${confirmed > 1 ? "s" : ""} · ${toConfirm} a confirmer</span>
        </div>
        <button class="primary" type="button" data-action="openImpactForm">Ajouter un impact</button>
      </div>
      ${impacts.length ? `
        <div class="performance-detail-list">
          ${impacts.map(renderWeeklyImpactItem).join("")}
        </div>
      ` : `
        <div class="empty-state compact">Aucun impact inscrit cette semaine.</div>
      `}
    </div>
  `);
}

function renderWeeklyImpactItem(impact) {
  const status = impact.status || "draft";
  const detail = [impact.serviceType || "Impact", impact.amount || "", impactStatusLabel(status)].filter(Boolean).join(" · ");
  return `
    <article class="performance-detail-item">
      <div>
        <strong>${escapeHtml(impact.clientName || "Impact")}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
      <div class="performance-detail-side">
        <small>${escapeHtml(formatDate(impact.impactDate || impact.createdAt))}</small>
        <button class="secondary tiny" type="button" data-action="editImpact" data-id="${escapeAttr(impact.id)}">Modifier</button>
      </div>
    </article>
  `;
}

function renderWeeklyCheckupsModal() {
  const checkups = currentWeekCheckups()
    .slice()
    .sort((a, b) => dateValue(b.checkupDate) - dateValue(a.checkupDate));
  return modal("Check-ups cette semaine", `
    <div class="modal-form weekly-command-modal">
      <div class="weekly-command-toolbar">
        <div>
          <strong>${checkups.length} check-up${checkups.length > 1 ? "s" : ""}</strong>
          <span>${escapeHtml(currentWeekLabel())} · donnees CSM</span>
        </div>
        <a class="secondary button-link" href="${escapeAttr(CSM_PRIORITY_SHEET_URL)}" target="_blank" rel="noopener">Ouvrir le CSM</a>
      </div>
      ${checkups.length ? `
        <div class="performance-detail-list">
          ${checkups.map(renderWeeklyCheckupItem).join("")}
        </div>
      ` : `
        <div class="empty-state compact">Aucun check-up capte cette semaine.</div>
      `}
    </div>
  `);
}

function renderWeeklyCheckupItem(checkup) {
  const clientId = checkup.clientId || "";
  const name = checkup.clientName || checkup.name || checkup.memberName || "Client sans nom";
  const detail = checkup.checkupType || checkup.sourceTab || checkup.sourceLabel || sourceLabel(checkup.source);
  return `
    <article class="performance-detail-item">
      <div>
        ${clientId ? `<button class="link-title" data-action="openClient" data-id="${escapeAttr(clientId)}">${escapeHtml(name)}</button>` : `<strong>${escapeHtml(name)}</strong>`}
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
      </div>
      <div class="performance-detail-side">
        <small>${escapeHtml(formatDate(checkup.checkupDate))}</small>
      </div>
    </article>
  `;
}

function renderPerformanceDetailItem(item) {
  const clientId = item.clientId || "";
  const title = item.name || "Client sans nom";
  const actionId = item.actionId || item.id || clientId;
  let actionButton = "";
  if (item.action === "excludePerformanceNewClient") {
    actionButton = `<button class="secondary tiny" type="button" data-action="excludePerformanceNewClient" data-id="${escapeAttr(actionId)}">Retirer du calcul</button>`;
  }
  if (item.action === "removeManualPerformanceNewClient") {
    actionButton = `<button class="secondary tiny" type="button" data-action="removeManualPerformanceNewClient" data-id="${escapeAttr(actionId)}">Retirer</button>`;
  }
  if (item.action === "openTaskEdit") {
    actionButton = `<button class="secondary tiny" type="button" data-action="openTaskEdit" data-id="${escapeAttr(actionId)}">${escapeHtml(item.actionLabel || "Modifier")}</button>`;
  }
  if (item.action === "openRebookingDetail") {
    actionButton = `<button class="secondary tiny" type="button" data-action="openRebookingDetail" data-id="${escapeAttr(actionId)}">${escapeHtml(item.actionLabel || "Detail")}</button>`;
  }
  if (item.action === "openQuestionnaireDetail") {
    actionButton = `<button class="secondary tiny" type="button" data-action="openQuestionnaireDetail" data-id="${escapeAttr(actionId)}">${escapeHtml(item.actionLabel || "Lire")}</button>`;
  }
  return `
    <article class="performance-detail-item">
      <div>
        ${clientId ? `<button class="link-title" data-action="openClient" data-id="${escapeAttr(clientId)}">${escapeHtml(title)}</button>` : `<strong>${escapeHtml(title)}</strong>`}
        ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
      </div>
      <div class="performance-detail-side">
        ${item.date ? `<small>${escapeHtml(formatDate(item.date))}</small>` : ""}
        ${actionButton}
      </div>
    </article>
  `;
}

function performanceDetailData(metric) {
  const periodLabel = performancePeriodLabel(state.filter.performancePeriod);
  if (metric === "newClients") {
    const items = performanceNewClientItems()
      .sort((a, b) => dateValue(b.date) - dateValue(a.date));
    return performanceDetailPayload(
      "Nouveaux clients",
      `${items.length} client(s)`,
      `${periodLabel} - arrivees dans la periode`,
      items,
      { excludedCount: performanceNewClientExcludedIds().length }
    );
  }
  if (metric === "programs") {
    const items = state.data.tasks
      .filter((task) => isOpenTask(task) && isProgramTask(task))
      .sort((a, b) => dateValue(a.dueAt || a.createdAt) - dateValue(b.dueAt || b.createdAt))
      .map((task) => ({
        id: task.id,
        name: task.clientName || "Client sans nom",
        date: task.dueAt || task.createdAt,
        detail: taskDueLabel(task) || taskDisplayTitle(task) || "Programme a verifier",
        clientId: task.clientId || "",
        action: "openTaskEdit",
        actionId: task.id,
        actionLabel: "Modifier"
      }));
    return performanceDetailPayload("Programmations", `${items.length} mission(s)`, "Programmes CoachRx rouges/jaunes a traiter", items);
  }
  if (metric === "rebooking") {
    const items = portfolioRebookings()
      .filter((item) => isOpenRebooking(item))
      .sort((a, b) => String(a.clientName || "").localeCompare(String(b.clientName || "")))
      .map((rebooking) => {
        const sessions = Math.max(1, Number(rebooking.sessionsToRebook || 1));
        return {
          id: rebooking.id,
          name: rebooking.clientName || "Client a confirmer",
          date: rebooking.updatedAt || rebooking.createdAt || rebooking.detectedAt,
          detail: `${sessions} seance${sessions > 1 ? "s" : ""} a remettre`,
          clientId: rebooking.clientId || "",
          action: "openRebookingDetail",
          actionId: rebooking.id,
          actionLabel: "Ouvrir"
        };
      });
    return performanceDetailPayload("Rebooking", `${items.length} dossier(s)`, "Seances payees a remettre ou a fermer", items);
  }
  if (metric === "questionnaires") {
    const items = portfolioQuestionnaireResponses()
      .filter((response) => response.processingStatus === "to_read" || response.status === "to_read")
      .sort((a, b) => dateValue(b.submittedAt || b.createdAt) - dateValue(a.submittedAt || a.createdAt))
      .map((response) => {
        const summary = questionnairePrioritySummary(response);
        return {
          id: response.id,
          name: response.clientName || response.name || "Reponse questionnaire",
          date: response.submittedAt || response.createdAt,
          detail: `${summary.label} · ${summary.nextStep}`,
          clientId: response.clientId || "",
          action: "openQuestionnaireDetail",
          actionId: response.id,
          actionLabel: "Lire"
        };
      });
    return performanceDetailPayload("Questionnaires", `${items.length} reponse(s)`, "Reponses a lire avant la rencontre", items);
  }
  if (metric === "checkups") {
    const items = periodFiltered(portfolioCheckups(), "checkupDate", { fallbackCreatedAt: false })
      .sort((a, b) => dateValue(b.checkupDate) - dateValue(a.checkupDate))
      .map((checkup) => ({
        name: checkup.clientName || checkup.name || checkup.memberName || "Client sans nom",
        date: checkup.checkupDate,
        detail: checkup.checkupType || checkup.sourceTab || checkup.sourceLabel || sourceLabel(checkup.source),
        clientId: checkup.clientId || ""
      }));
    return performanceDetailPayload("Check-ups CSM", `${items.length} check-up(s)`, `${periodLabel} - noms captes par CSM`, items);
  }
  if (metric === "impacts") {
    const items = periodFiltered(portfolioImpacts(), "impactDate")
      .filter((impact) => impact.status === "confirmed")
      .sort((a, b) => dateValue(b.impactDate) - dateValue(a.impactDate))
      .map((impact) => ({
        name: impact.clientName || impact.title || "Impact confirme",
        date: impact.impactDate,
        detail: impact.amount ? `$${impact.amount}` : (impact.note || impact.type || "Impact confirme"),
        clientId: impact.clientId || ""
      }));
    return performanceDetailPayload("Impacts confirmes", `${items.length} impact(s)`, `${periodLabel} - revenus/retours valides`, items);
  }
  if (metric === "lostClients") {
    const items = periodFiltered(state.data.clients.filter((client) => clientStatus(client) === "removed"), "updatedAt")
      .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt))
      .map((client) => ({
        name: client.name || client.clientName || "Client sans nom",
        date: client.updatedAt,
        detail: client.membershipLabel || client.removedReason || "Client sorti",
        clientId: client.id
      }));
    return performanceDetailPayload("Clients perdus", `${items.length} client(s)`, `${periodLabel} - clients sortis`, items);
  }
  return performanceDetailPayload("Pilotage", "0 element", `${periodLabel}`, []);
}

function performanceDetailPayload(title, countLabel, subtitle, items, extra = {}) {
  return { title, countLabel, subtitle, items, ...extra };
}

function performanceNewClientExcludedIds() {
  const settings = state.data.performanceSettings || {};
  return Array.isArray(settings.newClientExcludedIds) ? settings.newClientExcludedIds.filter(Boolean) : [];
}

function performanceManualNewClients() {
  const settings = state.data.performanceSettings || {};
  return Array.isArray(settings.manualNewClients) ? settings.manualNewClients.filter((item) => item && !item.deletedAt) : [];
}

function performanceNewClientItems() {
  const excluded = new Set(performanceNewClientExcludedIds());
  const imported = periodFiltered(activeClients(), "createdAt")
    .filter((client) => !excluded.has(client.id))
    .map((client) => ({
      id: client.id,
      name: client.name || client.clientName || "Client sans nom",
      date: client.createdAt,
      detail: client.membershipLabel || client.sourceLabel || sourceLabel(client.source),
      clientId: client.id,
      action: "excludePerformanceNewClient",
      actionId: client.id,
      actionLabel: "Retirer du calcul"
    }));
  const manual = periodFiltered(performanceManualNewClients(), "createdAt", { fallbackCreatedAt: false })
    .map((item) => ({
      id: item.id,
      name: item.name || "Nouveau client",
      date: item.createdAt,
      detail: item.note || "Ajout manuel Pilotage",
      clientId: item.clientId || "",
      action: "removeManualPerformanceNewClient",
      actionId: item.id,
      actionLabel: "Retirer"
    }));
  return [...imported, ...manual];
}

function performanceNewClientExcludedItems() {
  const excluded = new Set(performanceNewClientExcludedIds());
  return activeClients()
    .filter((client) => excluded.has(client.id))
    .sort((a, b) => String(a.lastNameSort || a.name || "").localeCompare(String(b.lastNameSort || b.name || "")));
}

function renderPerformanceNewClientExclusions() {
  const excluded = performanceNewClientExcludedItems();
  if (!excluded.length) return "";
  return `
    <details class="performance-exclusion-list">
      <summary>Voir les clients retires du compteur</summary>
      <div>
        ${excluded.map((client) => `
          <article class="performance-detail-item compact">
            <div>
              <strong>${escapeHtml(client.name || "Client sans nom")}</strong>
              <span>${escapeHtml(client.membershipLabel || sourceLabel(client.source))}</span>
            </div>
            <div class="performance-detail-side">
              ${client.createdAt ? `<small>${escapeHtml(formatDate(client.createdAt))}</small>` : ""}
              <button class="secondary tiny" type="button" data-action="restorePerformanceNewClient" data-id="${escapeAttr(client.id)}">Reintegrer</button>
            </div>
          </article>
        `).join("")}
      </div>
    </details>
  `;
}

function renderPerformanceNewClientManualModal() {
  return modal("Ajouter un nouveau client", `
    <form class="modal-form" data-form="performanceNewClientManual">
      <div class="notice compact">
        Ajoute une entree manuelle seulement si le compteur Pilotage doit reconnaitre un vrai nouveau client qui n'est pas bien capte par l'import.
      </div>
      <div class="form-grid">
        <label>Nom du client<input class="input" name="name" required></label>
        <label>Date d'arrivee<input class="input" type="date" name="createdAt" value="${todayIso()}" required></label>
      </div>
      <label>Note optionnelle<textarea class="input" name="note" placeholder="Ex.: client ajoute manuellement pour corriger le compteur du mois."></textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">Ajouter au compteur</button>
        <button class="secondary" type="button" data-action="openPerformanceDetail" data-id="newClients">Retour a la liste</button>
      </div>
    </form>
  `);
}

function renderPerformanceObjectiveModal() {
  const settings = state.data.performanceSettings || {};
  const reminderEnabled = Boolean(settings.reminderEnabled);
  const reminderWeekday = settings.reminderWeekday || "monday";
  return modal("Objectif pilotage", `
    <form class="modal-form" data-form="performanceObjective">
      <label>
        Objectif trimestriel
        <textarea class="input" name="quarterlyObjective" placeholder="Ex.: augmenter la presence aux check-ups, stabiliser les suivis, developper X clients...">${escapeHtml(settings.quarterlyObjective || "")}</textarea>
      </label>
      <div class="form-grid">
        <label>
          Periode
          <input class="input" name="objectivePeriod" value="${escapeAttr(settings.objectivePeriod || currentQuarterLabel())}" placeholder="T2 2026">
        </label>
        <label>
          Statut
          <select class="input" name="objectiveStatus">
            ${performanceObjectiveStatusOptions(settings.objectiveStatus || "active")}
          </select>
        </label>
      </div>
      <label>
        Note courte
        <textarea class="input" name="objectiveNote" placeholder="Contexte ou prochaine action">${escapeHtml(settings.objectiveNote || "")}</textarea>
      </label>
      <div class="performance-reminder-box">
        <label class="checkbox-line">
          <input type="checkbox" name="reminderEnabled" ${reminderEnabled ? "checked" : ""}>
          <span>Me créer un rappel hebdomadaire pour compléter le document de rendement.</span>
        </label>
        <div class="form-grid">
          <label>
            Jour du rappel
            <select class="input" name="reminderWeekday">
              ${weekdayOptions(reminderWeekday)}
            </select>
          </label>
          <label>
            Prochain rappel
            <input class="input" type="date" name="nextReminderAt" value="${escapeAttr(settings.nextReminderAt || nextWeekdayIso(reminderWeekday))}">
          </label>
        </div>
        <small>Quand le coach marque cette mission comme faite, elle est reportee a la semaine suivante.</small>
      </div>
      <div class="focus-note">
        <strong>Document de rendement</strong>
        <p>Le lien reste disponible dans Performance pour remplir le document semestriel sans chercher dans Drive.</p>
        <a class="secondary button-link" href="${escapeAttr(PERFORMANCE_RENDEMENT_SHEET_URL)}" target="_blank" rel="noopener">Ouvrir le document</a>
      </div>
      <div class="modal-actions">
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
        <button class="primary" type="submit">Enregistrer</button>
      </div>
    </form>
  `);
}

function renderImpactFormModal() {
  const impact = state.modal.type === "impactEdit"
    ? portfolioImpacts().find((item) => item.id === state.modal.id)
    : null;
  const isEdit = Boolean(impact);
  return modal(isEdit ? "Modifier l'impact" : "Ajouter un impact", `
    <form class="modal-form" data-form="${isEdit ? "impactEdit" : "impactCreate"}" ${isEdit ? `data-id="${escapeAttr(impact.id)}"` : ""}>
      <div class="form-grid">
        <label>Client<input class="input" name="clientName" value="${escapeAttr(impact?.clientName || "")}" required></label>
        <label>Type de service<input class="input" name="serviceType" value="${escapeAttr(impact?.serviceType || "")}" placeholder="PT, semi-prive, reference..."></label>
        <label>Montant<input class="input" name="amount" value="${escapeAttr(impact?.amount || "")}" placeholder="$"></label>
        <label>Date<input class="input" type="date" name="impactDate" value="${escapeAttr(impact?.impactDate || todayIso())}"></label>
        <label>Statut
          <select class="input" name="status">
            ${impactStatusOptions(impact?.status || "draft")}
          </select>
        </label>
      </div>
      <label>Note<textarea class="input" name="note">${escapeHtml(impact?.note || "")}</textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">${isEdit ? "Enregistrer" : "Ajouter impact"}</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderAlumniFormModal() {
  const alumni = state.modal.type === "alumniEdit"
    ? state.data.alumni.find((item) => item.id === state.modal.id)
    : null;
  const isEdit = Boolean(alumni);
  return modal(isEdit ? "Modifier l'alumni" : "Ajouter un alumni", `
    <form class="modal-form" data-form="${isEdit ? "alumniEdit" : "alumniCreate"}" ${isEdit ? `data-id="${escapeAttr(alumni.id)}"` : ""}>
      <div class="form-grid">
        <label>Nom<input class="input" name="name" value="${escapeAttr(alumni?.name || "")}" required></label>
        <label>Telephone<input class="input" name="phoneNormalized" value="${escapeAttr(alumni?.phoneNormalized || "")}"></label>
        <label>Courriel<input class="input" name="email" value="${escapeAttr(alumni?.email || "")}"></label>
        <label>Prochaine relance<input class="input" type="date" name="nextFollowupAt" value="${escapeAttr(alumni?.nextFollowupAt || "")}"></label>
        <label>Coach responsable
          <select class="input" name="coachId">
            ${mergedCoachOptions().map((coach) => `
              <option value="${escapeAttr(coach.id)}" ${String(alumni?.coachId || state.selectedCoachId) === String(coach.id) ? "selected" : ""}>
                ${escapeHtml(coach.name || coach.id)}
              </option>
            `).join("")}
          </select>
        </label>
        <label>Statut
          <select class="input" name="status">
            ${alumniStatusOptions(alumni?.status || "to_work")}
          </select>
        </label>
      </div>
      <label>Note<textarea class="input" name="note">${escapeHtml(alumni?.note || "")}</textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">${isEdit ? "Enregistrer" : "Ajouter alumni"}</button>
        ${isEdit ? `<button class="secondary" type="button" data-action="reactivateAlumniAsClient" data-id="${escapeHtml(alumni.id)}">Ramener dans Clients</button>` : ""}
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function modal(title, content) {
  return `
    <div class="modal-backdrop" data-action="closeModal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}" data-modal-stop>
        <header class="modal-head">
          <h3>${title}</h3>
          <button class="icon-button" type="button" data-action="closeModal" aria-label="Fermer">x</button>
        </header>
        ${content}
      </section>
    </div>
  `;
}

function detail(label, value, source) {
  return `
    <div class="detail">
      <span>${label}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(source)}</small>
    </div>
  `;
}

function eventTargetElement(event) {
  const target = event?.target;
  if (target instanceof Element) return target;
  return target?.parentElement instanceof Element ? target.parentElement : null;
}

document.addEventListener("click", async (event) => {
  const targetEl = eventTargetElement(event);
  if (!targetEl) return;
  const modalSurface = targetEl.closest("[data-modal-stop]");
  const mobileMenuSurface = targetEl.closest("[data-mobile-menu-stop]");
  const actionEl = targetEl.closest("[data-action]");
  if (!actionEl) return;
  if (modalSurface && actionEl.classList.contains("modal-backdrop")) return;
  if (mobileMenuSurface && actionEl.classList.contains("mobile-menu-backdrop")) return;
  if (actionEl.classList.contains("clickable") && targetEl.closest("details")) return;
  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;
  const lockAction = shouldLockAction(action);
  if (lockAction && actionEl.dataset.working === "true") return;

  try {
    if (lockAction) beginActionFeedback(actionEl);
    if (action === "loginRedirect") {
      if (window.location.hostname !== "cfsb-dashboard-coach-aa9a4.firebaseapp.com") {
        window.location.assign(COMPATIBLE_AUTH_URL);
        return;
      }
      await startGoogleRedirectLogin();
    }
    if (action === "resetPassword") await sendPasswordResetFromLogin();
    if (action === "logout") {
      clearAuthRedirectState();
      await signOut(auth);
    }
    if (action === "reload") window.location.reload();
    if (action === "reloadForUpdate") {
      if (state.busy || state.modal) {
        showToast("Termine ou ferme l'action en cours avant d'actualiser.");
        return;
      }
      window.location.reload();
    }
    if (action === "closeModal") closeModal();
    if (action === "toggleMobileMenu") {
      const menu = actionEl.dataset.menu || "more";
      state.mobileMenuOpen = state.mobileMenuOpen === menu ? "" : menu;
      render();
    }
    if (action === "closeMobileMenu") {
      state.mobileMenuOpen = "";
      render();
    }
    if (action === "toggleCoachPicker") {
      state.coachPickerOpen = !state.coachPickerOpen;
      render();
    }
    if (action === "selectCoach" && id) {
      state.selectedCoachId = id;
      state.coachPickerOpen = false;
      state.mobileMenuOpen = "";
      subscribeCoachData();
      void trackUsageEvent("coach_selected", { selectedCoachId: id, source: "coach_picker" });
      render();
    }
    if (action === "seedCoaches") await seedCoaches();
    if (action === "syncSheets") await syncSheetsFromGoogle();
    if (action === "syncSheetsAll") await syncAllSheetsFromGoogle();
    if (action === "copyCoachRxSetup") await copyCoachRxSetupValue(actionEl.dataset.key);
    if (action === "copyAccomplishmentName") await copyTextValue(actionEl.dataset.value || "");
    if (action === "openAnnouncementForm") openModal({ type: "announcementForm" });
    if (action === "openAnnouncement" && id) openModal({ type: "announcement", id, source: "history" });
    if (action === "acknowledgeAnnouncement" && id) await acknowledgeAnnouncement(id);
    if (action === "archiveAnnouncement" && id) await archiveAnnouncement(id);
    if (action === "requestProductReport") await requestProductReport();
    if (action === "useAssistantPrompt") {
      const textarea = document.querySelector('form[data-form="assistantPrompt"] textarea[name="inputText"]');
      if (textarea) {
        textarea.value = actionEl.dataset.prompt || "";
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }
    if (action === "openDashboardStat") {
      const targetTab = actionEl.dataset.tabTarget || "todo";
      const filterValue = actionEl.dataset.filterValue || "";
      const modalTarget = actionEl.dataset.modalTarget || "";
      if (modalTarget) {
        openModal({ type: modalTarget });
        return;
      }
      if (targetTab === "todo" && filterValue) {
        state.filter.todo = filterValue;
        clearTodoSearchAndGroup();
      }
      if (targetTab === "rebooking" && filterValue) {
        state.filter.rebooking = filterValue;
      }
      if (targetTab === "questionnaires") {
        state.filter.questionnaire = filterValue || "to_read";
        state.filter.questionnaireTriage = "all";
        state.filter.search = {
          ...(state.filter.search || {}),
          questionnaires: ""
        };
      }
      setActiveTab(targetTab, "dashboard_stat");
      if (window.matchMedia("(max-width: 680px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
      render();
    }
    if (action === "openQuickNote") openModal({ type: "quickNote" });
    if (action === "openClientMission" && id) openModal({ type: "quickNote", clientId: id });
    if (action === "openRebookingMission" && id) openModal({ type: "quickNote", rebookingId: id });
    if (action === "setQuickNoteMode") {
      safeResetVoiceRecorder();
      state.modal = {
        ...(state.modal || { type: "quickNote" }),
        composerMode: actionEl.dataset.mode === "manual" ? "manual" : "assistant",
        assistantVoiceRequestId: "",
        assistantRequestId: "",
        assistantActionRequestId: ""
      };
      render();
    }
    if (action === "resetAssistantTaskDraft") {
      safeResetVoiceRecorder();
      state.modal = {
        ...(state.modal || { type: "quickNote" }),
        composerMode: "assistant",
        assistantVoiceRequestId: "",
        assistantRequestId: "",
        assistantActionRequestId: "",
        assistantDraftText: ""
      };
      render();
    }
    if (action === "openAssistantCreatedTask") openAssistantCreatedTask(id);
    if (action === "openTaskEdit" && id) openModal({ type: "taskEdit", id });
    if (action === "toggleTaskStar" && id) await toggleTaskStar(id);
    if (action === "startVoiceRecording") await startVoiceRecording(actionEl.dataset.formKey || "");
    if (action === "stopVoiceRecording") await stopVoiceRecording(actionEl.dataset.formKey || "");
    if (action === "playVoicePreview") await playVoicePreview(actionEl.dataset.formKey || "");
    if (action === "discardVoiceRecording") discardVoiceRecording(actionEl.dataset.formKey || "");
    if (action === "playTaskVoice" && id) await playTaskVoice(id);
    if (action === "deleteTaskVoice" && id) await deleteTaskVoice(id);
    if (action === "openClientQuestionnaireSend" && id) openModal({ type: "questionnaireSend", clientId: id });
    if (action === "openClientRebooking" && id) openModal({ type: "rebookingForm", clientId: id });
    if (action === "openClientForm") openModal({ type: "clientForm" });
    if (action === "openClientPhoneFix" && id) openModal({ type: "clientPhoneFix", id });
    if (action === "openQuestionnaireSend") openModal({ type: "questionnaireSend", clientId: id || "", questionnaireType: actionEl.dataset.questionnaireType || DEFAULT_QUESTIONNAIRE_TYPE });
    if (action === "openQuestionnaireSchedule" && id) openModal({ type: "questionnaireSchedule", clientId: id, questionnaireType: actionEl.dataset.questionnaireType || DEFAULT_QUESTIONNAIRE_TYPE });
    if (action === "openQuestionnaireDetail" && id) openModal({ type: "questionnaireDetail", id });
    if (action === "openQuestionnaireLinkClient" && id) openModal({ type: "questionnaireLinkClient", id });
    if (action === "openRebookingForm") openModal({ type: "rebookingForm" });
    if (action === "openRebookingAbsenceFlow") openModal({ type: "rebookingAbsenceFlow" });
    if (action === "openImpactForm") openModal({ type: "impactForm" });
    if (action === "openPerformanceNewClientManual") openModal({ type: "performanceNewClientManual" });
    if (action === "openPerformanceObjective") openModal({ type: "performanceObjective" });
    if (action === "openPilotageItem") openModal({ type: "pilotageItem" });
    if (action === "openPilotageNote") openModal({ type: "pilotageNote" });
    if (action === "editPilotageNote" && id) openModal({ type: "pilotageNoteEdit", id });
    if (action === "completePilotageItem" && id) await completePilotageItem(id);
    if (action === "deletePilotageItem" && id) await deletePilotageItem(id);
    if (action === "createMissionFromPilotageItem" && id) await createMissionFromPilotageItem(id);
    if (action === "editImpact" && id) openModal({ type: "impactEdit", id });
    if (action === "openAlumniForm") openModal({ type: "alumniForm" });
    if (action === "editAlumni" && id) openModal({ type: "alumniEdit", id });
    if (action === "openClient" && id) openModal({ type: "client", id });
    if (action === "openClientTraining" && id) openModal({ type: "clientTraining", id });
    if (action === "focusTodoClient") {
      const groupKey = actionEl.dataset.groupKey || "";
      state.filter.todo = groupKey ? "group" : "all";
      state.filter.todoGroupKey = groupKey;
      state.filter.search = {
        ...(state.filter.search || {}),
        todo: groupKey ? "" : (actionEl.dataset.query || "")
      };
      render();
    }
    if (action === "moveClientToAlumni" && id) await moveClientToAlumni(id);
    if (action === "deleteClient" && id) await deleteClient(id);
    if (action === "completeTask") await completeTask(id);
    if (action === "completeQuestionnaireTask") await completeQuestionnaireTask(id, actionEl.dataset.responseId || "");
    if (action === "ignoreTask") await ignoreOperationalTask(id);
    if (action === "markResponseRead") await markQuestionnaireResponseRead(id);
    if (action === "createMissionFromQuestionnaireResponse") await createMissionFromQuestionnaireResponse(id);
    if (action === "sendQuestionnaire") await journalQuestionnaireSend(id, actionEl.dataset.questionnaireType || DEFAULT_QUESTIONNAIRE_TYPE);
    if (action === "toggleQuestionnaireSchedule") await toggleQuestionnaireSchedule(id);
    if (action === "createQuestionnaireFollowupTask") await createQuestionnaireFollowupTask(id);
    if (action === "cancelQuestionnaireSend") await cancelQuestionnaireSend(id);
    if (action === "openRebookingDetail" && id) openModal({ type: "rebookingDetail", id });
    if (action === "openPerformanceDetail" && id) openModal({ type: "performanceDetail", metric: id });
    if (action === "excludePerformanceNewClient" && id) await excludePerformanceNewClient(id);
    if (action === "restorePerformanceNewClient" && id) await restorePerformanceNewClient(id);
    if (action === "removeManualPerformanceNewClient" && id) await removeManualPerformanceNewClient(id);
    if (action === "manageRebooking") await completeRebookingWithNote(id, "managed");
    if (action === "rebookedRebooking") await completeRebookingWithNote(id, "rebooked");
    if (action === "adjustRebookingSessions") await adjustRebookingSessions(id);
    if (action === "openRebookingLinkClient" && id) openModal({ type: "rebookingLinkClient", id });
    if (action === "transferRebookingCoach") await transferRebookingCoach(id);
    if (action === "coachAbsenceRebooking") await markRebookingCoachAbsence(id);
    if (action === "deleteRebookingError") await deleteRebookingError(id);
    if (action === "reopenRebooking") await patchRebooking(id, "open", "Rebooking rouvert");
    if (action === "confirmImpact") await updateImpactStatus(id, "confirmed", "Impact confirme");
    if (action === "cancelImpact") await updateImpactStatus(id, "cancelled", "Impact annule");
    if (action === "deleteImpact") await deleteImpact(id);
    if (action === "createAlumniTask") await createAlumniTask(id);
    if (action === "markAlumniToWork") await updateAlumniStatus(id, "to_work", "Alumni remis a travailler");
    if (action === "markAlumniContacted") await patchEntity("alumni", id, { status: "contacted", lastContactAt: todayIso() }, "Alumni marque contacte");
    if (action === "markAlumniReactivated") await updateAlumniStatus(id, "reactivated", "Alumni marque reactive");
    if (action === "reactivateAlumniAsClient") await reactivateAlumniAsClient(id);
    if (action === "markAlumniDoNotContact") await patchEntity("alumni", id, { status: "do_not_contact" }, "Alumni classe ne pas contacter");
    if (action === "archiveAlumni") await archiveAlumni(id);
  } catch (error) {
    pushError(`${action}: ${humanizeFirebaseError(error)}`);
  } finally {
    if (lockAction) endActionFeedback(actionEl);
  }
});

document.addEventListener("submit", async (event) => {
  const targetEl = eventTargetElement(event);
  if (!targetEl) return;
  const form = targetEl.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const submitButton = form.querySelector("button[type='submit']");
  try {
    beginActionFeedback(submitButton);
    if (form.dataset.form === "emailLogin") await loginWithEmail(data);
    if (form.dataset.form === "announcement") await publishAnnouncement(data);
    if (form.dataset.form === "quickNote") await createManualTask(data);
    if (form.dataset.form === "assistantTaskDraft") await createAssistantTaskDraft(data);
    if (form.dataset.form === "assistantTaskConfirm") await confirmAssistantTaskProposal(form.dataset.proposalId, data);
    if (form.dataset.form === "taskEdit") await saveTask(form.dataset.id, data);
    if (form.dataset.form === "client") await saveClient(form.dataset.id, data);
    if (form.dataset.form === "clientTrainingTarget") await saveClientTrainingTarget(form.dataset.id, data);
    if (form.dataset.form === "coachrxExtensionSetup") await saveCoachRxExtensionSetup(data);
    if (form.dataset.form === "clientPhoneFix") await saveClientPhoneFix(form.dataset.id, data);
    if (form.dataset.form === "clientCreate") await createClient(data);
    if (form.dataset.form === "questionnaireSend") await journalQuestionnaireSend(data.clientId, data.questionnaireType);
    if (form.dataset.form === "questionnaireSchedule") await saveQuestionnaireSchedule(form.dataset.clientId, data);
    if (form.dataset.form === "questionnaireLinkClient") await linkQuestionnaireResponseToClient(form.dataset.id, data);
    if (form.dataset.form === "rebookingCreate") await createRebooking(data);
    if (form.dataset.form === "rebookingLinkClient") await linkRebookingToClient(form.dataset.id, data);
    if (form.dataset.form === "rebookingAbsenceFlow") await markRebookingAbsenceRange(data);
    if (form.dataset.form === "performanceObjective") await savePerformanceObjective(data);
    if (form.dataset.form === "performanceNewClientManual") await addManualPerformanceNewClient(data);
    if (form.dataset.form === "pilotageItem") await savePilotageItem(data);
    if (form.dataset.form === "pilotageNote") await savePilotageNote(form.dataset.id, data);
    if (form.dataset.form === "impactCreate") await createImpact(data);
    if (form.dataset.form === "impactEdit") await saveImpact(form.dataset.id, data);
    if (form.dataset.form === "alumniCreate") await createAlumni(data);
    if (form.dataset.form === "alumniEdit") await saveAlumni(form.dataset.id, data);
    if (form.dataset.form === "assistantPrompt") await createAssistantRequest(data);
    if (form.dataset.form === "pilotAcceptance") await savePilotAcceptance(data);
  } catch (error) {
    pushError(`${form.dataset.form}: ${humanizeFirebaseError(error)}`);
  } finally {
    endActionFeedback(submitButton);
  }
});

document.addEventListener("change", (event) => {
  const targetEl = eventTargetElement(event);
  if (!targetEl) return;
  const filterSelectEl = targetEl.closest("[data-filter-select]");
  if (filterSelectEl) {
    state.coachPickerOpen = false;
    state.filter[filterSelectEl.dataset.filterSelect] = filterSelectEl.value;
    if (filterSelectEl.dataset.filterSelect === "todo") clearTodoSearchAndGroup();
    render();
    return;
  }

  const actionEl = targetEl.closest("[data-action]");
  if (!actionEl) return;
  if (actionEl.dataset.action === "selectPerformancePeriod") {
    state.filter.performancePeriod = actionEl.value;
    render();
  }
  if (actionEl.dataset.action === "selectTabMobile") {
    state.coachPickerOpen = false;
    state.mobileMenuOpen = "";
    setActiveTab(actionEl.value, "mobile_select");
    render();
  }
});

document.addEventListener("input", (event) => {
  const targetEl = eventTargetElement(event);
  if (!targetEl) return;
  const modalDraftEl = targetEl.closest("[data-modal-draft]");
  if (modalDraftEl && state.modal) {
    state.modal.assistantDraftText = modalDraftEl.value;
  }
  const searchEl = targetEl.closest("[data-search]");
  if (!searchEl) return;
  const scope = searchEl.dataset.search;
  const cursor = searchEl.selectionStart;
  state.filter.search = {
    ...(state.filter.search || {}),
    [scope]: searchEl.value
  };
  render();
  window.requestAnimationFrame(() => {
    const replacement = document.querySelector(`[data-search="${scope}"]`);
    if (!replacement) return;
    replacement.focus({ preventScroll: true });
    if (typeof cursor === "number" && replacement.setSelectionRange) {
      replacement.setSelectionRange(cursor, cursor);
    }
  });
});

document.addEventListener("click", (event) => {
  const targetEl = eventTargetElement(event);
  if (!targetEl) return;
  if (!state.coachPickerOpen) return;
  if (targetEl.closest(".coach-select-wrap")) return;
  state.coachPickerOpen = false;
  render();
});

document.addEventListener("click", (event) => {
  const targetEl = eventTargetElement(event);
  if (!targetEl) return;
  const tabEl = targetEl.closest("[data-tab]");
  if (!tabEl) return;
  setActiveTab(tabEl.dataset.tab, "sidebar");
  state.mobileMenuOpen = "";
  if (window.matchMedia("(max-width: 680px)").matches) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  render();
});

document.addEventListener("click", (event) => {
  const targetEl = eventTargetElement(event);
  if (!targetEl) return;
  const filterEl = targetEl.closest("[data-filter]");
  if (!filterEl) return;
  state.coachPickerOpen = false;
  state.filter[filterEl.dataset.filter] = filterEl.dataset.value;
  if (filterEl.dataset.filter === "todo") clearTodoSearchAndGroup();
  render();
});

function clearTodoSearchAndGroup() {
  state.filter.todoGroupKey = "";
  state.filter.search = {
    ...(state.filter.search || {}),
    todo: ""
  };
}

function setActiveTab(tab, source = "navigation") {
  const nextTab = String(tab || "").trim();
  if (!isVisibleTab(nextTab)) return;
  if (!nextTab || state.tab === nextTab) return;
  if (state.modal) {
    safeResetVoiceRecorder();
    state.modal = null;
  }
  state.coachPickerOpen = false;
  state.tab = nextTab;
  void trackUsageEvent("tab_viewed", { tab: nextTab, source });
}

async function seedCoaches() {
  requireAdmin();
  const confirmed = window.confirm(
    "Reparer la liste officielle des coachs pilotes?\n\n" +
    "Cette action restaure les coachs et leurs CoachRx ID sans supprimer les donnees deja importees."
  );
  if (!confirmed) return;
  await Promise.all(PILOT_COACHES.map(async (coach) => {
    const coachRef = doc(db, "coaches", coach.id);
    const existing = await getDoc(coachRef);
    const payload = {
      ...coach,
      updatedAt: serverTimestamp(),
      source: "firebase_official_pilot_list",
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp()
    };
    await setDoc(coachRef, payload, { merge: true });
  }));
  await loadCoaches();
  state.selectedCoachId = chooseInitialCoach();
  subscribeCoachData();
  showToast("Liste coachs reparee.");
  render();
}

async function syncSheetsFromGoogle() {
  requireAdmin();
  if (!state.selectedCoachId) throw new Error("Selectionne un coach avant de synchroniser.");
  const coach = activeCoachRecord();
  const confirmed = window.confirm(
    `Synchroniser Google Sheets vers Firebase pour ${coach?.name || state.selectedCoachId}?\n\n` +
    "Les champs manuels deja modifies dans la fiche client seront conserves."
  );
  if (!confirmed) return;
  const requestRef = await createSyncRequest({ coachId: state.selectedCoachId, scope: "coach" });
  showToast(`Demande de sync envoyee pour ${coach?.name || state.selectedCoachId}. Suivi: ${requestRef.id.slice(0, 6)}.`);
  render();
}

async function syncAllSheetsFromGoogle() {
  requireAdmin();
  const confirmed = window.confirm(
    "Synchroniser Google Sheets vers Firebase pour tous les coachs pilotes?\n\n" +
    "C'est l'action a utiliser quand on veut valider Marc-Andre, Iheb et les autres coachs en une seule passe."
  );
  if (!confirmed) return;
  const requestRef = await createSyncRequest({ coachId: "", scope: "all" });
  showToast(`Demande de sync globale envoyee. Suivi: ${requestRef.id.slice(0, 6)}.`);
  render();
}

async function createSyncRequest({ coachId = "", scope = "coach" }) {
  requireAdmin();
  return addDoc(collection(db, "syncRequests"), {
    coachId: coachId || "",
    scope,
    status: "queued",
    requestedByUid: state.user?.uid || "",
    requestedByEmail: state.user?.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app_sync_request"
  });
}

async function requestProductReport() {
  requireAdmin();
  const pending = (state.data.productReportRequests || []).find((request) => ["queued", "running"].includes(cleanString(request.status)));
  if (pending) {
    showToast("Un rapport est deja en cours de generation.");
    return;
  }
  const requestRef = await addDoc(collection(db, "productReportRequests"), {
    status: "queued",
    requestedByUid: state.user?.uid || "",
    requestedByEmail: state.user?.email || "",
    source: "firebase_app_product_report_request",
    createdAt: serverTimestamp()
  });
  void trackUsageEvent("product_report_requested", { source: "admin", value: requestRef.id.slice(0, 12) });
  showToast("Rapport hebdomadaire en generation.");
  render();
}

async function createAssistantRequest(data = {}) {
  requireAdmin();
  if (!isInfoAdmin()) throw new Error("Assistant reserve au laboratoire admin prive.");
  if (!state.selectedCoachId || !coachRecordById(state.selectedCoachId)) {
    throw new Error("Selectionne un coach avant d'interroger l'assistant.");
  }
  const inputText = String(data.inputText || "").replace(/\s+/g, " ").trim();
  if (inputText.length < 3) throw new Error("Ecris une demande plus precise.");
  if (inputText.length > 1200) throw new Error("La demande doit contenir au maximum 1200 caracteres.");
  const pending = (state.data.assistantRequests || []).find((request) =>
    request.targetCoachId === state.selectedCoachId
    && ["queued", "processing"].includes(cleanString(request.status))
  );
  if (pending) throw new Error("Une analyse est deja en cours pour ce coach.");
  const requestRef = await addDoc(collection(db, "assistantRequests"), {
    userId: state.user?.uid || "",
    userEmail: String(state.user?.email || "").trim().toLowerCase(),
    actorCoachId: "admin",
    targetCoachId: state.selectedCoachId,
    requestKind: "general",
    contextType: "global",
    contextEntityId: "",
    inputMode: "text",
    inputText,
    status: "queued",
    source: "assistant_admin_private_pilot",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  void trackUsageEvent("assistant_request_created", {
    source: "assistant_admin_private_pilot",
    value: requestRef.id.slice(0, 12)
  });
  showToast("Demande envoyee a l'assistant prive.");
  render();
}

async function createAssistantTaskDraft(data = {}) {
  requireAdmin();
  if (!isInfoAdmin()) throw new Error("Assistant reserve au laboratoire admin prive.");
  if (!state.modal || state.modal.type !== "quickNote") throw new Error("Rouvre + Mission avant de continuer.");
  if (!state.selectedCoachId || !coachRecordById(state.selectedCoachId)) {
    throw new Error("Selectionne un coach avant de preparer la mission.");
  }
  const voiceDraft = await captureVoiceRecorderDraft("assistantTaskDraft");
  const inputText = String(data.inputText || "").replace(/\s+/g, " ").trim();
  if (!voiceDraft && inputText.length < 3) throw new Error("Dicte ou ecris la mission a creer.");
  if (inputText.length > 1200) throw new Error("La demande doit contenir au maximum 1200 caracteres.");
  const clientId = cleanString(data.clientId || state.modal.clientId || "");
  if (clientId) requireSelectableClientForCoach(clientId);
  const pendingTextRequest = (state.data.assistantRequests || []).find((request) =>
    request.targetCoachId === state.selectedCoachId
    && ["queued", "processing"].includes(cleanString(request.status))
  );
  const pendingVoiceRequest = (state.data.assistantVoiceRequests || []).find((request) =>
    request.targetCoachId === state.selectedCoachId
    && ["queued", "transcribing"].includes(cleanString(request.status))
  );
  if (pendingTextRequest || pendingVoiceRequest) {
    throw new Error("Une proposition est deja en preparation pour ce coach.");
  }
  if (voiceDraft) {
    await createAssistantVoiceTaskDraft({ clientId }, voiceDraft);
    return;
  }
  const requestRef = await addDoc(collection(db, "assistantRequests"), {
    userId: state.user?.uid || "",
    userEmail: String(state.user?.email || "").trim().toLowerCase(),
    actorCoachId: "admin",
    targetCoachId: state.selectedCoachId,
    requestKind: "task_create",
    contextType: clientId ? "client" : "global",
    contextEntityId: clientId,
    inputMode: "text",
    inputText,
    status: "queued",
    source: "assistant_admin_private_pilot",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  state.modal.assistantRequestId = requestRef.id;
  state.modal.assistantActionRequestId = "";
  state.modal.assistantDraftText = inputText;
  state.data.assistantRequests.unshift({
    id: requestRef.id,
    userId: state.user?.uid || "",
    targetCoachId: state.selectedCoachId,
    requestKind: "task_create",
    inputText,
    status: "queued",
    createdAt: new Date()
  });
  void trackUsageEvent("assistant_task_draft_requested", {
    source: "quick_mission",
    value: requestRef.id.slice(0, 12),
    hasClientContext: Boolean(clientId)
  });
  showToast("L'assistant prepare la mission.");
  render();
}

async function createAssistantVoiceTaskDraft({ clientId = "" } = {}, draft) {
  if (!draft?.blob) throw new Error("Enregistre un vocal avant de continuer.");
  if (!state.user?.uid) throw new Error("Reconnecte-toi avant d'envoyer un vocal.");
  if (clientId) requireSelectableClientForCoach(clientId);
  if (draft.blob.size > VOICE_NOTE_MAX_BYTES) {
    throw new Error("Le vocal est trop lourd. Recommence avec un message plus court.");
  }

  const requestId = `assistant_voice_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const chunkRefs = [];
  let requestCreated = false;
  setVoiceSaveStatus("assistantTaskDraft", "sending", "Preparation du vocal pour l'assistant...");
  showToast("Preparation du vocal...");

  try {
    const audioBase64 = await blobToBase64(draft.blob);
    const chunks = [];
    for (let index = 0; index < audioBase64.length; index += VOICE_QUEUE_CHUNK_CHARS) {
      chunks.push(audioBase64.slice(index, index + VOICE_QUEUE_CHUNK_CHARS));
    }
    if (!chunks.length) throw new Error("Le vocal est vide. Reenregistre-le avant de continuer.");
    if (chunks.length > 40) throw new Error("Le vocal est trop lourd. Recommence avec un message plus court.");

    for (let start = 0; start < chunks.length; start += VOICE_QUEUE_BATCH_SIZE) {
      const batch = writeBatch(db);
      chunks.slice(start, start + VOICE_QUEUE_BATCH_SIZE).forEach((chunk, offset) => {
        const index = start + offset;
        const chunkRef = doc(db, "assistantVoiceChunks", `${requestId}_${String(index).padStart(3, "0")}`);
        chunkRefs.push(chunkRef);
        batch.set(chunkRef, {
          requestId,
          targetCoachId: state.selectedCoachId,
          userId: state.user.uid,
          index,
          total: chunks.length,
          data: chunk,
          createdAt: serverTimestamp()
        });
      });
      await batch.commit();
      setVoiceSaveStatus(
        "assistantTaskDraft",
        "sending",
        `Envoi du vocal ${Math.min(start + VOICE_QUEUE_BATCH_SIZE, chunks.length)}/${chunks.length}...`
      );
    }

    const durationSeconds = Math.min(
      VOICE_NOTE_MAX_SECONDS,
      Math.max(1, Math.round(draft.durationSeconds || 1))
    );
    const mimeType = cleanString(draft.mimeType || draft.blob.type || "audio/webm").toLowerCase();
    const requestRef = doc(db, "assistantVoiceRequests", requestId);
    await setDoc(requestRef, {
      userId: state.user.uid,
      userEmail: String(state.user.email || "").trim().toLowerCase(),
      actorCoachId: "admin",
      targetCoachId: state.selectedCoachId,
      requestKind: "task_create",
      contextType: clientId ? "client" : "global",
      contextEntityId: clientId,
      status: "queued",
      chunkCount: chunks.length,
      audioBase64Length: audioBase64.length,
      mimeType,
      durationSeconds,
      source: "assistant_admin_voice_pilot",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    requestCreated = true;

    state.modal.assistantVoiceRequestId = requestId;
    state.modal.assistantRequestId = requestId;
    state.modal.assistantActionRequestId = "";
    state.modal.assistantDraftText = "";
    state.data.assistantVoiceRequests.unshift({
      id: requestId,
      userId: state.user.uid,
      targetCoachId: state.selectedCoachId,
      requestKind: "task_create",
      contextType: clientId ? "client" : "global",
      contextEntityId: clientId,
      status: "queued",
      mimeType,
      durationSeconds,
      createdAt: new Date()
    });
    void trackUsageEvent("assistant_voice_task_requested", {
      source: "quick_mission",
      value: requestId.slice(0, 18),
      hasClientContext: Boolean(clientId),
      durationSeconds
    });
    safeResetVoiceRecorder();
    showToast("Vocal recu. L'assistant prepare la mission.");
    render();
  } catch (error) {
    if (!requestCreated && chunkRefs.length) await deleteVoiceQueueChunks(chunkRefs);
    const message = humanizeFirebaseError(error) || "Le vocal n'a pas pu etre envoye.";
    setVoiceSaveStatus("assistantTaskDraft", "error", message);
    void trackUsageEvent("assistant_voice_task_failed", {
      source: "quick_mission",
      value: requestId.slice(0, 18),
      hasClientContext: Boolean(clientId)
    });
    throw error;
  }
}

async function confirmAssistantTaskProposal(proposalId, data = {}) {
  requireAdmin();
  if (!isInfoAdmin()) throw new Error("Confirmation reservee au laboratoire admin prive.");
  const proposal = (state.data.assistantProposals || []).find((item) => item.id === proposalId);
  if (!proposal || proposal.status !== "proposed" || proposal.actionType !== "task.create") {
    throw new Error("Cette proposition n'est plus disponible. Prepare une nouvelle mission.");
  }
  if (proposal.targetCoachId !== state.selectedCoachId) {
    throw new Error("Le coach selectionne a change. Prepare une nouvelle mission.");
  }
  const clientId = cleanString(data.clientId || "");
  if (clientId) requireSelectableClientForCoach(clientId);
  const title = String(data.title || "").replace(/\s+/g, " ").trim();
  const description = String(data.description || "").replace(/\s+/g, " ").trim();
  const priority = ["P1", "P2", "P3"].includes(data.priority) ? data.priority : "P2";
  const dueAt = cleanString(data.dueAt || todayIso()).slice(0, 10);
  if (!title) throw new Error("Le titre de la mission est requis.");
  if (title.length > 180) throw new Error("Le titre est trop long.");
  if (description.length > 1200) throw new Error("Les details sont trop longs.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) throw new Error("Choisis une date cible valide.");
  const actionRef = await addDoc(collection(db, "assistantActionRequests"), {
    userId: state.user?.uid || "",
    userEmail: String(state.user?.email || "").trim().toLowerCase(),
    proposalId: proposal.id,
    targetCoachId: state.selectedCoachId,
    actionType: "task.create",
    confirmedParameters: {
      clientId,
      title,
      description,
      priority,
      dueAt,
      starred: isChecked(data.starred)
    },
    status: "queued",
    source: "assistant_admin_task_confirmation_pilot",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  state.modal.assistantActionRequestId = actionRef.id;
  state.data.assistantActionRequests.unshift({
    id: actionRef.id,
    userId: state.user?.uid || "",
    proposalId: proposal.id,
    targetCoachId: state.selectedCoachId,
    status: "queued",
    createdAt: new Date()
  });
  void trackUsageEvent("assistant_task_confirmed", {
    source: "quick_mission",
    value: actionRef.id.slice(0, 12),
    hasClientContext: Boolean(clientId),
    priority
  });
  showToast("Confirmation recue. Creation securisee en cours.");
  render();
}

function openAssistantCreatedTask(taskId) {
  const task = operationalTaskById(taskId);
  if (task) {
    openModal({ type: "taskEdit", id: task.id });
    return;
  }
  safeResetVoiceRecorder();
  state.modal = null;
  state.filter.todo = "all";
  clearTodoSearchAndGroup();
  setActiveTab("todo", "assistant_task_result");
  showToast("Mission creee. Elle apparait dans la To-do.");
  render();
}

async function saveCoachRxExtensionSetup(data) {
  requireAdmin();
  const existing = coachRxExtensionSetup();
  const syncSecret = String(data.syncSecret || "").trim();
  const patch = {
    extensionDownloadUrl: String(data.extensionDownloadUrl || COACHRX_EXTENSION_PUBLIC_DOWNLOAD).trim(),
    extensionVersion: String(data.extensionVersion || COACHRX_EXTENSION_VERSION).trim(),
    webAppUrl: String(data.webAppUrl || "").trim(),
    installNote: String(data.installNote || "").trim(),
    updatedAt: serverTimestamp(),
    updatedByUid: state.user?.uid || "",
    updatedByEmail: state.user?.email || ""
  };
  if (syncSecret || !existing.syncSecret) {
    patch.syncSecret = syncSecret;
  }
  await setDoc(doc(db, "system", "coachrxExtensionSetup"), patch, { merge: true });
  showToast("Configuration extension CoachRx enregistree.");
  render();
}

async function copyCoachRxSetupValue(key) {
  const setup = coachRxExtensionSetup();
  const allowed = new Set(["webAppUrl", "syncSecret", "extensionDownloadUrl"]);
  if (!allowed.has(key)) throw new Error("Valeur extension inconnue.");
  const value = String(setup[key] || (key === "extensionDownloadUrl" ? COACHRX_EXTENSION_PUBLIC_DOWNLOAD : "")).trim();
  if (!value) throw new Error("Configuration extension incomplete.");
  try {
    await navigator.clipboard.writeText(value);
    showToast(key === "syncSecret" ? "Secret copie." : "Valeur copiee.");
  } catch (error) {
    window.prompt("Copie cette valeur dans l'extension CoachRx:", value);
  }
}

async function copyTextValue(value) {
  const text = String(value || "").trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Texte copie.");
  } catch (error) {
    window.prompt("Copie ce texte:", text);
  }
}

function resetVoiceRecorder() {
  voiceRecorder.sessionId += 1;
  stopVoiceRecorderTimers();
  if (voiceRecorder.mediaRecorder && voiceRecorder.mediaRecorder.state !== "inactive") {
    try {
      voiceRecorder.mediaRecorder.stop();
    } catch (error) {
      console.warn("Voice recorder stop skipped", error);
    }
  }
  stopVoiceStream();
  if (voiceRecorder.previewUrl) URL.revokeObjectURL(voiceRecorder.previewUrl);
  voiceRecorder.formKey = "";
  voiceRecorder.mediaRecorder = null;
  voiceRecorder.stream = null;
  voiceRecorder.chunks = [];
  voiceRecorder.blob = null;
  voiceRecorder.previewUrl = "";
  voiceRecorder.startedAt = 0;
  voiceRecorder.durationSeconds = 0;
  voiceRecorder.stopPromise = null;
  voiceRecorder.saveStatus = "";
  voiceRecorder.saveMessage = "";
}

function safeResetVoiceRecorder() {
  try {
    resetVoiceRecorder();
  } catch (error) {
    console.warn("Voice recorder reset skipped", error);
    forceClearVoiceRecorder();
  }
}

function forceClearVoiceRecorder() {
  try {
    stopVoiceRecorderTimers();
  } catch (error) {
    console.warn("Voice recorder timer cleanup skipped", error);
  }
  try {
    if (voiceRecorder.stream) {
      voiceRecorder.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (trackError) {
          console.warn("Voice track stop skipped", trackError);
        }
      });
    }
  } catch (error) {
    console.warn("Voice stream cleanup skipped", error);
  }
  try {
    if (voiceRecorder.previewUrl) URL.revokeObjectURL(voiceRecorder.previewUrl);
  } catch (error) {
    console.warn("Voice preview cleanup skipped", error);
  }
  voiceRecorder.formKey = "";
  voiceRecorder.mediaRecorder = null;
  voiceRecorder.stream = null;
  voiceRecorder.chunks = [];
  voiceRecorder.blob = null;
  voiceRecorder.previewUrl = "";
  voiceRecorder.startedAt = 0;
  voiceRecorder.durationSeconds = 0;
  voiceRecorder.stopPromise = null;
  voiceRecorder.saveStatus = "";
  voiceRecorder.saveMessage = "";
}

function stopVoiceRecorderTimers() {
  window.clearInterval(voiceRecorder.timerId);
  window.clearTimeout(voiceRecorder.stopTimerId);
  voiceRecorder.timerId = null;
  voiceRecorder.stopTimerId = null;
}

function stopVoiceStream() {
  if (!voiceRecorder.stream) return;
  voiceRecorder.stream.getTracks().forEach((track) => track.stop());
  voiceRecorder.stream = null;
}

async function startVoiceRecording(formKey) {
  const key = String(formKey || "").trim();
  if (!key) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Ton navigateur ne permet pas l'enregistrement audio dans cette page.");
  }
  safeResetVoiceRecorder();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const supportedTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac"
  ];
  const preferredMimeType = supportedTypes.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  }) || "";
  const recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
  const sessionId = voiceRecorder.sessionId + 1;
  let resolveStop;
  let rejectStop;
  const stopPromise = new Promise((resolve, reject) => {
    resolveStop = resolve;
    rejectStop = reject;
  });
  voiceRecorder.sessionId = sessionId;
  voiceRecorder.formKey = key;
  voiceRecorder.stream = stream;
  voiceRecorder.mediaRecorder = recorder;
  voiceRecorder.chunks = [];
  voiceRecorder.startedAt = Date.now();
  voiceRecorder.durationSeconds = 0;
  voiceRecorder.stopPromise = stopPromise;
  recorder.addEventListener("dataavailable", (event) => {
    if (sessionId !== voiceRecorder.sessionId) return;
    if (event.data?.size) voiceRecorder.chunks.push(event.data);
  });
  recorder.addEventListener("stop", () => {
    if (sessionId !== voiceRecorder.sessionId) {
      resolveStop(null);
      return;
    }
    stopVoiceRecorderTimers();
    stopVoiceStream();
    const durationSeconds = Math.min(
      VOICE_NOTE_MAX_SECONDS,
      Math.max(1, Math.round((Date.now() - voiceRecorder.startedAt) / 1000))
    );
    const blob = new Blob(voiceRecorder.chunks, { type: recorder.mimeType || "audio/webm" });
    voiceRecorder.mediaRecorder = null;
    voiceRecorder.durationSeconds = durationSeconds;
    voiceRecorder.blob = blob;
    if (voiceRecorder.previewUrl) URL.revokeObjectURL(voiceRecorder.previewUrl);
    voiceRecorder.previewUrl = URL.createObjectURL(blob);
    updateVoiceRecorderUi(key);
    resolveStop(blob);
  });
  recorder.addEventListener("error", (event) => {
    if (sessionId !== voiceRecorder.sessionId) return;
    rejectStop(event.error || new Error("L'enregistrement vocal a echoue."));
  });
  recorder.start();
  updateVoiceRecorderUi(key);
  voiceRecorder.timerId = window.setInterval(() => updateVoiceRecorderUi(key), 1000);
  voiceRecorder.stopTimerId = window.setTimeout(() => stopVoiceRecording(key), VOICE_NOTE_MAX_SECONDS * 1000);
}

function stopVoiceRecording(formKey) {
  if (formKey && voiceRecorder.formKey && String(formKey) !== voiceRecorder.formKey) return Promise.resolve(null);
  if (!voiceRecorder.mediaRecorder) return Promise.resolve(voiceRecorder.blob || null);
  if (voiceRecorder.mediaRecorder.state !== "inactive") {
    voiceRecorder.mediaRecorder.stop();
  }
  return voiceRecorder.stopPromise || Promise.resolve(voiceRecorder.blob || null);
}

function discardVoiceRecording(formKey) {
  if (formKey && voiceRecorder.formKey && String(formKey) !== voiceRecorder.formKey) return;
  safeResetVoiceRecorder();
  updateVoiceRecorderUi(formKey || "");
}

async function playVoicePreview(formKey) {
  const key = String(formKey || voiceRecorder.formKey || "").trim();
  if (!key || voiceRecorder.formKey !== key || !voiceRecorder.previewUrl) {
    throw new Error("Aucun apercu vocal disponible.");
  }
  const audioEl = document.querySelector(`[data-voice-preview="${cssEscape(key)}"]`);
  if (!audioEl) throw new Error("Lecteur vocal introuvable.");
  if (!audioEl.paused) {
    audioEl.pause();
    audioEl.currentTime = 0;
    showToast("Lecture arretee.");
    return;
  }
  audioEl.src = voiceRecorder.previewUrl;
  await audioEl.play();
  showToast("Lecture du vocal.");
}

function setVoiceSaveStatus(formKey, status, message) {
  const key = String(formKey || voiceRecorder.formKey || "").trim();
  if (voiceRecorder.formKey === key) {
    voiceRecorder.saveStatus = String(status || "");
    voiceRecorder.saveMessage = String(message || "");
  }
  const statusEl = document.querySelector(`[data-voice-save-status="${cssEscape(key)}"]`);
  if (!statusEl) return;
  statusEl.textContent = String(message || "");
  statusEl.className = `voice-save-status ${String(status || "")}`;
  statusEl.hidden = !message;
}

function updateVoiceRecorderUi(formKey) {
  const key = String(formKey || voiceRecorder.formKey || "").trim();
  if (!key) return;
  const isRecording = Boolean(voiceRecorder.mediaRecorder);
  const elapsed = isRecording
    ? Math.min(VOICE_NOTE_MAX_SECONDS, Math.max(0, Math.round((Date.now() - voiceRecorder.startedAt) / 1000)))
    : voiceRecorder.durationSeconds;
  const statusEl = document.querySelector(`[data-voice-status="${cssEscape(key)}"]`);
  if (statusEl) {
    statusEl.textContent = isRecording
      ? `Enregistrement... ${voiceNoteDurationLabel({ durationSeconds: elapsed })}`
      : voiceRecorder.blob
        ? `Pret (${voiceNoteDurationLabel({ durationSeconds: elapsed })})`
        : "Aucun vocal";
    statusEl.classList.toggle("warning", isRecording);
    statusEl.classList.toggle("good", Boolean(voiceRecorder.blob) && !isRecording);
  }
  const previewEl = document.querySelector(`[data-voice-preview="${cssEscape(key)}"]`);
  if (previewEl && voiceRecorder.previewUrl) {
    previewEl.src = voiceRecorder.previewUrl;
    previewEl.hidden = false;
  }
  document.querySelectorAll(`[data-form="${cssEscape(key)}"] [data-action="startVoiceRecording"]`).forEach((button) => {
    button.disabled = isRecording;
  });
  document.querySelectorAll(`[data-form="${cssEscape(key)}"] [data-action="stopVoiceRecording"]`).forEach((button) => {
    button.disabled = !isRecording;
  });
  document.querySelectorAll(`[data-form="${cssEscape(key)}"] [data-action="playVoicePreview"]`).forEach((button) => {
    button.disabled = !voiceRecorder.blob || isRecording;
  });
  document.querySelectorAll(`[data-form="${cssEscape(key)}"] [data-action="discardVoiceRecording"]`).forEach((button) => {
    button.disabled = !voiceRecorder.blob;
  });
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

async function captureVoiceRecorderDraft(formKey = "") {
  const key = String(formKey || "").trim();
  if (key && voiceRecorder.formKey && voiceRecorder.formKey !== key) return null;
  if (voiceRecorder.mediaRecorder) {
    showToast("Preparation du vocal...");
    await withTimeout(
      stopVoiceRecording(key),
      6000,
      "Le vocal n'a pas fini de se preparer. Arrete l'enregistrement, puis reessaie."
    );
  } else if (voiceRecorder.stopPromise && !voiceRecorder.blob) {
    await withTimeout(
      voiceRecorder.stopPromise,
      6000,
      "Le vocal n'a pas fini de se preparer. Reessaie dans quelques secondes."
    );
  }
  if (!voiceRecorder.blob) return null;
  return {
    blob: voiceRecorder.blob,
    durationSeconds: voiceRecorder.durationSeconds,
    mimeType: voiceRecorder.blob.type || "audio/webm"
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      const base64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
      if (!base64) {
        reject(new Error("Le vocal est vide. Reenregistre-le avant de sauvegarder."));
        return;
      }
      resolve(base64);
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("Le vocal n'a pas pu etre prepare.")));
    reader.readAsDataURL(blob);
  });
}

async function saveVoiceMissionOnServer(payload, draft, formKey) {
  if (!draft?.blob) return null;
  if (draft.blob.size > VOICE_NOTE_MAX_BYTES) {
    throw new Error("Le vocal est trop lourd. Recommence avec un message plus court.");
  }
  if (!state.user?.uid) throw new Error("Reconnecte-toi avant de sauvegarder un vocal.");
  setVoiceSaveStatus(formKey, "sending", "Preparation et envoi du vocal...");
  showToast("Preparation du vocal...");
  void trackUsageEvent("voice_mission_upload_started", {
    action: payload.operation || "create",
    source: formKey,
    coachId: payload.coachId
  });
  const requestId = `voice_${payload.taskId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const chunkRefs = [];
  let requestCreated = false;
  try {
    const audioBase64 = await blobToBase64(draft.blob);
    const chunks = [];
    for (let index = 0; index < audioBase64.length; index += VOICE_QUEUE_CHUNK_CHARS) {
      chunks.push(audioBase64.slice(index, index + VOICE_QUEUE_CHUNK_CHARS));
    }
    if (!chunks.length) throw new Error("Le vocal est vide. Reenregistre-le avant de sauvegarder.");

    for (let start = 0; start < chunks.length; start += VOICE_QUEUE_BATCH_SIZE) {
      const batch = writeBatch(db);
      chunks.slice(start, start + VOICE_QUEUE_BATCH_SIZE).forEach((chunk, offset) => {
        const index = start + offset;
        const chunkRef = doc(db, "voiceMissionChunks", `${requestId}_${String(index).padStart(3, "0")}`);
        chunkRefs.push(chunkRef);
        batch.set(chunkRef, {
          requestId,
          coachId: payload.coachId,
          userId: state.user.uid,
          index,
          total: chunks.length,
          data: chunk,
          createdAt: serverTimestamp()
        });
      });
      await batch.commit();
      setVoiceSaveStatus(
        formKey,
        "sending",
        `Envoi du vocal ${Math.min(start + VOICE_QUEUE_BATCH_SIZE, chunks.length)}/${chunks.length}...`
      );
    }

    const requestRef = doc(db, "voiceMissionRequests", requestId);
    await setDoc(requestRef, {
      coachId: payload.coachId,
      taskId: payload.taskId,
      userId: state.user.uid,
      userEmail: state.user.email || "",
      status: "queued",
      chunkCount: chunks.length,
      audioBase64Length: audioBase64.length,
      mission: {
        ...payload,
        mimeType: draft.mimeType || draft.blob.type || "audio/webm",
        durationSeconds: Math.min(
          VOICE_NOTE_MAX_SECONDS,
          Math.max(1, Math.round(draft.durationSeconds || 1))
        )
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    requestCreated = true;
    setVoiceSaveStatus(formKey, "sending", "Vocal recu. Sauvegarde de la mission...");
    const result = await waitForVoiceMissionRequest(requestRef, formKey);
    if (!result?.ok || !result.voiceNote?.storagePath) {
      throw new Error("Le serveur n'a pas confirme la sauvegarde du vocal.");
    }
    setVoiceSaveStatus(formKey, "success", "Mission et vocal sauvegardes.");
    void trackUsageEvent("voice_mission_upload_succeeded", {
      action: payload.operation || "create",
      source: formKey,
      coachId: payload.coachId
    });
    return result;
  } catch (error) {
    if (!requestCreated && chunkRefs.length) await deleteVoiceQueueChunks(chunkRefs);
    const message = humanizeFirebaseError(error) || "Le vocal n'a pas pu etre sauvegarde.";
    setVoiceSaveStatus(formKey, "error", message);
    void trackUsageEvent("voice_mission_upload_failed", {
      action: payload.operation || "create",
      source: formKey,
      coachId: payload.coachId
    });
    throw error;
  }
}

function waitForVoiceMissionRequest(requestRef, formKey) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      unsubscribe();
      callback(value);
    };
    const timer = window.setTimeout(() => {
      finish(
        reject,
        new Error("Le traitement du vocal prend trop de temps. La demande reste enregistree; verifie la mission dans un moment.")
      );
    }, VOICE_QUEUE_TIMEOUT_MS);
    unsubscribe = onSnapshot(
      requestRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const request = snapshot.data() || {};
        if (request.status === "processing") {
          setVoiceSaveStatus(formKey, "sending", "Sauvegarde du vocal et de la mission...");
          return;
        }
        if (request.status === "success") {
          finish(resolve, request.result || null);
          return;
        }
        if (request.status === "error") {
          const error = new Error(request.errorMessage || "Le serveur n'a pas pu sauvegarder le vocal.");
          error.code = request.errorCode || "voice/queue-error";
          error.details = { stage: request.errorStage || "server" };
          finish(reject, error);
        }
      },
      (error) => finish(reject, error)
    );
  });
}

async function deleteVoiceQueueChunks(chunkRefs) {
  for (let start = 0; start < chunkRefs.length; start += VOICE_QUEUE_BATCH_SIZE) {
    const batch = writeBatch(db);
    chunkRefs.slice(start, start + VOICE_QUEUE_BATCH_SIZE).forEach((chunkRef) => batch.delete(chunkRef));
    await batch.commit().catch((error) => console.warn("Voice queue cleanup skipped", error));
  }
}

async function playTaskVoice(taskId) {
  const task = operationalTaskById(taskId);
  const voiceNote = taskVoiceNote(task);
  if (!voiceNote) {
    showToast("Aucun vocal trouve pour cette mission.");
    return;
  }
  const playbackUrl = taskVoicePlaybackUrl(task);
  if (!playbackUrl) {
    try {
      await ensureTaskVoicePlaybackUrl(task);
      showToast("Vocal pret. Appuie de nouveau pour l'ecouter.");
    } catch (error) {
      showToast("Le vocal n'est pas accessible. Reessaie dans un moment.");
    }
    return;
  }
  const audioEl = document.querySelector(`[data-voice-player="${cssEscape(taskId)}"]`);
  if (audioEl) {
    if (!audioEl.paused) {
      audioEl.pause();
      audioEl.currentTime = 0;
      showToast("Lecture arretee.");
      return;
    }
    if (!audioEl.src) audioEl.src = playbackUrl;
    try {
      const playback = audioEl.play();
      if (playback && typeof playback.then === "function") await playback;
      showToast("Lecture du vocal.");
    } catch (error) {
      console.warn("Voice playback failed", taskId, error);
      const statusEl = document.querySelector(`[data-voice-playback-status="${cssEscape(taskId)}"]`);
      if (statusEl) {
        statusEl.textContent = "Lecture impossible. Appuie de nouveau.";
        statusEl.hidden = false;
      }
      showToast("Lecture impossible. Reessaie une fois.");
    }
    return;
  }
  window.open(playbackUrl, "_blank", "noopener,noreferrer");
}

async function deleteTaskVoice(taskId) {
  const task = operationalTaskById(taskId);
  const voiceNote = taskVoiceNote(task);
  if (!voiceNote) return;
  const confirmed = window.confirm("Supprimer le vocal de cette mission?\n\nLa mission texte restera en place.");
  if (!confirmed) return;
  await patchEntity("tasks", taskId, { voiceNote: null }, "Vocal supprime.");
  await deleteVoiceStoragePath(voiceNote.storagePath);
  await logAction("task.voice_deleted", "tasks", taskId, {
    coachId: task.coachId || state.selectedCoachId,
    hadVoiceNote: true
  });
}

async function deleteVoiceStoragePath(storagePath) {
  if (!storagePath) return;
  try {
    await deleteObject(storageRef(storage, storagePath));
  } catch (error) {
    console.warn("Voice note storage delete skipped", storagePath, error);
  }
}

function isChecked(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

async function createManualTask(data) {
  if (!state.selectedCoachId) return;
  const modalInstanceId = state.modal?.instanceId || "";
  const rebooking = data.rebookingId
    ? findRebookingForCoachView(data.rebookingId)
    : null;
  if (data.rebookingId && !rebooking) throw new Error("Dossier rebooking introuvable.");
  const selectedClientId = String(data.clientId || "").trim();
  const client = selectedClientId
    ? requireSelectableClientForCoach(selectedClientId)
    : null;
  const coach = activeCoachRecord();
  const title = String(data.title || "").trim();
  if (!title) throw new Error("Le titre de la mission est requis.");
  const taskRef = doc(collection(db, "tasks"));
  const starred = isChecked(data.starred);
  const taskType = rebooking ? "rebooking" : "manual";
  const taskSource = rebooking ? "firebase_app_rebooking_mission" : "firebase_app_manual";
  const clientName = client?.name || rebooking?.clientName || "";
  const relatedRebookingIds = rebooking
    ? uniqueStrings([rebooking.id, ...(rebooking.relatedRebookingIds || [])])
    : [];
  const voiceDraft = await captureVoiceRecorderDraft("quickNote");
  if (voiceDraft) {
    await saveVoiceMissionOnServer({
      operation: "create",
      taskId: taskRef.id,
      coachId: state.selectedCoachId,
      clientId: client?.id || "",
      clientName,
      title,
      description: data.description || "",
      priority: data.priority || "P2",
      dueAt: data.dueAt || todayIso(),
      starred,
      taskType,
      source: taskSource,
      rebookingId: rebooking?.id || "",
      relatedRebookingIds
    }, voiceDraft, "quickNote");
    closeModalIfCurrent(modalInstanceId);
    showToast("Mission et vocal sauvegardes.");
    void logAction("task.created", "tasks", taskRef.id, {
      title,
      priority: data.priority || "P2",
      clientId: client?.id || "",
      clientName,
      source: taskSource,
      rebookingId: rebooking?.id || "",
      hasVoiceNote: true,
      starred
    }).catch((error) => console.warn("Task creation log skipped", error));
    return;
  }

  await setDoc(taskRef, {
      coachId: state.selectedCoachId,
      coachRxId: coach?.coachRxId || state.selectedCoachId,
      coachName: coach?.name || "",
      clientId: client?.id || "",
      clientName,
      type: taskType,
      title,
      description: data.description || "",
      status: "open",
      priority: data.priority || "P2",
      priorityRank: priorityRank(data.priority || "P2"),
      dueAt: data.dueAt || todayIso(),
      starred,
      starredAt: starred ? serverTimestamp() : null,
      voiceNote: null,
      voiceNoteStatus: "none",
      voiceNoteError: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      source: taskSource,
      rebookingId: rebooking?.id || "",
      relatedRebookingIds
  });
  closeModalIfCurrent(modalInstanceId);
  showToast("Mission creee.");
  void logAction("task.created", "tasks", taskRef.id, {
    title,
    priority: data.priority || "P2",
    clientId: client?.id || "",
    clientName,
    source: taskSource,
    rebookingId: rebooking?.id || "",
    hasVoiceNote: Boolean(voiceDraft),
    starred
  }).catch((error) => {
    console.warn("Task creation log skipped", error);
  });
}

async function saveTask(id, data) {
  if (!id) throw new Error("Mission introuvable.");
  const modalInstanceId = state.modal?.instanceId || "";
  const task = operationalTaskById(id);
  if (!task) throw new Error("Mission introuvable.");
  const priority = data.priority || task.priority || "P2";
  const title = String(data.title || "").trim();
  if (!title) throw new Error("Le titre de la mission est requis.");
  const previousVoiceNote = taskVoiceNote(task);
  const starred = isChecked(data.starred);
  const voiceDraft = await captureVoiceRecorderDraft("taskEdit");
  if (voiceDraft) {
    await saveVoiceMissionOnServer({
      operation: "edit",
      taskId: id,
      coachId: task.coachId || state.selectedCoachId,
      title,
      description: String(data.description || "").trim(),
      priority,
      dueAt: data.dueAt || task.dueAt || todayIso(),
      starred
    }, voiceDraft, "taskEdit");
    closeModalIfCurrent(modalInstanceId);
    showToast("Mission et vocal sauvegardes.");
    void logAction("task.edited", "tasks", id, {
      title,
      priority,
      dueAt: data.dueAt || task.dueAt || todayIso(),
      clientId: task.clientId || "",
      hasVoiceNote: true,
      starred
    }).catch((error) => console.warn("Task edit log skipped", error));
    return;
  }
  const patch = {
    title: String(data.title || "").trim(),
    description: String(data.description || "").trim(),
    priority,
    priorityRank: priorityRank(priority),
    dueAt: data.dueAt || task.dueAt || todayIso(),
    starred,
    starredAt: starred ? (task.starredAt || serverTimestamp()) : null,
    manualEditedAt: serverTimestamp(),
    manualEditedBy: state.user?.email || ""
  };
  await patchEntity("tasks", id, patch, "Mission mise a jour.");
  closeModalIfCurrent(modalInstanceId);
  void logAction("task.edited", "tasks", id, {
    title: String(data.title || "").trim(),
    priority,
    dueAt: data.dueAt || task.dueAt || todayIso(),
    clientId: task.clientId || "",
    hasVoiceNote: Boolean(voiceDraft || previousVoiceNote),
    starred
  }).catch((error) => {
    console.warn("Task edit log skipped", error);
  });
}

async function toggleTaskStar(id) {
  const task = operationalTaskById(id);
  if (!task) throw new Error("Mission introuvable.");
  const starred = !isStarredTask(task);
  await patchEntity("tasks", id, {
    starred,
    starredAt: starred ? serverTimestamp() : null
  }, starred ? "Mission etoilee." : "Mission retiree des etoilees.");
  await logAction("task.starred", "tasks", id, {
    starred,
    clientId: task.clientId || "",
    title: task.title || taskDisplayTitle(task) || ""
  });
}

async function saveClient(id, data) {
  const phoneNormalized = normalizePhone(data.phoneNormalized);
  const currentClient = requireSelectableClientForCoach(id);
  const requestedCoachId = data.coachId ? String(data.coachId) : String(currentClient.coachId || state.selectedCoachId || "");
  const targetCoach = coachRecordById(requestedCoachId);
  if (!targetCoach?.id) {
    throw new Error("Coach responsable invalide. Selectionne un coach actif avant d'enregistrer.");
  }
  const previousCoachId = String(currentClient.coachId || state.selectedCoachId || "");
  const transferred = Boolean(targetCoach?.id && previousCoachId && targetCoach.id !== previousCoachId);
  if (transferred) {
    const confirmed = window.confirm(`Transferer ${data.name || currentClient.name || "ce client"} a ${targetCoach.name || targetCoach.id}? Ses donnees liees suivront le client.`);
    if (!confirmed) return;
  }
  const patch = {
    name: data.name,
    phoneNormalized,
    clientPhoneNormalized: phoneNormalized,
    email: data.email || "",
    membershipLabel: data.membershipLabel || "",
    membershipSource: data.membershipLabel ? "dashboard_manual" : currentClient.membershipSource || "",
    membershipUpdatedAt: data.membershipLabel ? serverTimestamp() : currentClient.membershipUpdatedAt || "",
    manualMembershipEndDate: data.manualMembershipEndDate || "",
    kiloPlannedRecurrenceEndDate: data.kiloPlannedRecurrenceEndDate || "",
    riskLevel: data.riskLevel || "none",
    riskNote: data.riskNote || "",
    notes: data.notes || "",
    lastNameSort: lastNameSort(data.name),
    updatedAt: serverTimestamp()
  };
  if (targetCoach?.id) {
    patch.coachId = targetCoach.id;
    patch.coachRxId = targetCoach.coachRxId || targetCoach.id;
    patch.coachName = targetCoach.name || "";
  }
  if (transferred) {
    patch.previousCoachId = previousCoachId;
    patch.transferredAt = serverTimestamp();
    patch.transferSource = isInfoAdmin() ? "firebase_dashboard_admin" : "firebase_dashboard_coach";
    patch.ownershipStatus = "confirmed";
    patch.ownershipSource = patch.transferSource;
    patch.ownershipVerifiedAt = serverTimestamp();
    patch.ownershipVerifiedBy = state.user?.email || "";
  }
  await updateDoc(doc(db, "clients", id), patch);
  const relatedTransferCounts = transferred
    ? await transferClientRelatedRecords(id, previousCoachId, targetCoach)
    : {};
  await logAction("client.updated", "clients", id, {
    fields: ["name", "phoneNormalized", "email", "membershipLabel", "manualMembershipEndDate", "kiloPlannedRecurrenceEndDate", "riskLevel", "notes"],
    hasPhone: Boolean(phoneNormalized),
    previousCoachId,
    targetCoachId: targetCoach?.id || previousCoachId,
    transferred,
    relatedTransferCounts: JSON.stringify(relatedTransferCounts)
  });
  closeModal();
  showToast(transferred ? `Client transfere a ${targetCoach.name || targetCoach.id}.` : "Client mis a jour.");
}

async function saveClientTrainingTarget(id, data) {
  const client = requireSelectableClientForCoach(id);
  const raw = String(data.targetSessionsPerWeek || "").trim().replace(",", ".");
  const target = raw ? Number(raw) : null;
  if (target !== null && (!Number.isFinite(target) || target < 0.5 || target > 14)) {
    throw new Error("Entre une cible entre 0,5 et 14 seances par semaine, ou laisse vide.");
  }
  await updateDoc(doc(db, "clients", id), {
    targetSessionsPerWeek: target,
    targetSessionsUpdatedAt: serverTimestamp(),
    targetSessionsUpdatedByUid: state.user?.uid || "",
    targetSessionsUpdatedByEmail: state.user?.email || "",
    updatedAt: serverTimestamp()
  });
  await logAction("client.training_target_updated", "clients", id, {
    clientName: client.name || "",
    targetSessionsPerWeek: target === null ? "" : target
  });
  showToast(target === null ? "Cible d'assiduite retiree." : "Cible d'assiduite enregistree.");
}

async function saveClientPhoneFix(id, data) {
  if (!id) throw new Error("Client introuvable.");
  const currentClient = requireSelectableClientForCoach(id);
  const phoneNormalized = normalizePhone(data.phoneNormalized);
  if (!phoneNormalized || phoneNormalized.length !== 10) {
    throw new Error("Entre un telephone a 10 chiffres, ex.: 8192771825.");
  }
  const note = String(data.note || "").trim();
  const previousPhone = clientPhone(currentClient);
  await updateDoc(doc(db, "clients", id), {
    phoneNormalized,
    clientPhoneNormalized: phoneNormalized,
    phoneSource: "dashboard_manual",
    phoneUpdatedAt: serverTimestamp(),
    phoneUpdatedByUid: state.user?.uid || "",
    phoneUpdatedByEmail: state.user?.email || "",
    manualPhoneConfirmedAt: serverTimestamp(),
    manualPhoneNote: note,
    updatedAt: serverTimestamp()
  });
  await logAction("client.phone_updated", "clients", id, {
    clientName: currentClient.name || "",
    source: "dashboard_manual",
    hadPreviousPhone: Boolean(previousPhone),
    previousPhoneEnding: previousPhone ? previousPhone.slice(-4) : "",
    phoneEnding: phoneNormalized.slice(-4),
    note
  });
  closeModal();
  showToast("Telephone client enregistre.");
}

async function transferClientRelatedRecords(clientId, previousCoachId, targetCoach) {
  const relatedCollections = [
    "tasks",
    "rebookings",
    "questionnaireSends",
    "questionnaireSchedules",
    "questionnaireResponses",
    "checkups",
    "impacts"
  ];
  const counts = {};
  for (const collectionName of relatedCollections) {
    const snap = await getDocs(query(collection(db, collectionName), where("clientId", "==", clientId), where("coachId", "==", previousCoachId)));
    counts[collectionName] = snap.docs.length;
    await Promise.all(snap.docs.map((itemDoc) => updateDoc(itemDoc.ref, {
      coachId: targetCoach.id,
      coachRxId: targetCoach.coachRxId || targetCoach.id,
      coachName: targetCoach.name || "",
      previousCoachId,
      transferredAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })));
  }
  return counts;
}

async function createClient(data) {
  if (!state.selectedCoachId) throw new Error("Selectionne un coach avant d'ajouter un client.");
  const coach = activeCoachRecord();
  if (!coach?.id) throw new Error("Coach responsable invalide.");
  const name = String(data.name || "").trim();
  const phoneNormalized = normalizePhone(data.phoneNormalized);
  if (!name && !phoneNormalized) {
    throw new Error("Ajoute au minimum un nom ou un telephone.");
  }
  const id = stableClientId(state.selectedCoachId, { name, phoneNormalized });
  const ref = doc(db, "clients", id);
  const snapshot = await getDoc(ref);
  const existing = snapshot.exists() ? snapshot.data() : {};
  if (snapshot.exists()) {
    const existingRecord = { id, ...existing };
    const existingIsSelectable = isActiveClient(existingRecord)
      && clientEntityType(existingRecord) === "member"
      && clientOwnershipStatus(existingRecord) === "confirmed"
      && firestoreItemBelongsToCoach(existingRecord, state.selectedCoachId);
    if (!existingIsSelectable) {
      throw new Error("Une fiche existe deja avec cette identite et doit etre validee par un admin.");
    }
  }
  await setDoc(ref, {
    coachId: state.selectedCoachId,
    coachRxId: coach.coachRxId || coach.id,
    coachName: coach.name || "",
    name: name || existing.name || "Client sans nom",
    phoneNormalized: phoneNormalized || clientPhone(existing) || "",
    clientPhoneNormalized: phoneNormalized || clientPhone(existing) || "",
    email: String(data.email || existing.email || "").trim(),
    membershipLabel: String(data.membershipLabel || existing.membershipLabel || "Client manuel").trim(),
    membershipSource: data.membershipLabel ? "dashboard_manual" : existing.membershipSource || "dashboard_manual",
    membershipUpdatedAt: serverTimestamp(),
    manualMembershipEndDate: data.manualMembershipEndDate || existing.manualMembershipEndDate || "",
    kiloPlannedRecurrenceEndDate: data.kiloPlannedRecurrenceEndDate || existing.kiloPlannedRecurrenceEndDate || "",
    status: existing.status || "manual",
    riskLevel: existing.riskLevel || "none",
    riskNote: existing.riskNote || "",
    notes: data.notes || existing.notes || "",
    lastNameSort: lastNameSort(name || existing.name || ""),
    createdAt: existing.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: existing.source || "firebase_app_manual",
    entityType: "member",
    ownershipStatus: "confirmed",
    clientSelectable: true,
    ownershipSource: existing.ownershipSource || "dashboard_manual",
    ownershipVerifiedAt: existing.ownershipVerifiedAt || serverTimestamp(),
    ownershipVerifiedBy: existing.ownershipVerifiedBy || state.user?.email || ""
  }, { merge: true });
  await logAction(snapshot.exists() ? "client.updated" : "client.created", "clients", id, {
    name: name || existing.name || "Client sans nom",
    hasPhone: Boolean(phoneNormalized || clientPhone(existing)),
    source: "manual"
  });
  closeModal();
  showToast(snapshot.exists() ? "Client mis a jour." : "Client ajoute.");
}

async function createRebooking(data) {
  const selectedClientId = String(data.clientId || "").trim();
  const client = selectedClientId ? requireSelectableClientForCoach(selectedClientId) : null;
  const manualName = String(data.clientName || "").trim();
  if (!client && !manualName) throw new Error("Selectionne un client ou entre un nom manuel.");
  const clientName = client?.name || manualName;
  const sessionsToRebook = Math.round(Number(data.sessionsToRebook || 1));
  if (!Number.isFinite(sessionsToRebook) || sessionsToRebook < 1) {
    throw new Error("Entre un nombre de seances valide.");
  }
  if (rebookingVolumeNeedsReview(sessionsToRebook)) {
    const confirmed = window.confirm(
      `${sessionsToRebook} seances seront ajoutees pour ${clientName}.\n\n` +
      "Ce volume est inhabituel. Confirme qu'il correspond bien aux seances reellement a remettre."
    );
    if (!confirmed) {
      showToast("Ajout annule: verifie le nombre de seances.");
      return;
    }
  }
  const targetCoach = activeCoachRecord();
  if (!targetCoach?.id) throw new Error("Coach responsable invalide.");
  if (data.coachId && String(data.coachId) !== String(targetCoach.id)) {
    throw new Error("Le coach responsable doit etre le coach du portefeuille affiche.");
  }
  const ref = await addDoc(collection(db, "rebookings"), {
    coachId: targetCoach?.id || state.selectedCoachId,
    coachRxId: targetCoach?.coachRxId || targetCoach?.id || state.selectedCoachId,
    coachName: targetCoach?.name || "",
    clientId: client?.id || "",
    clientName,
    clientPhoneNormalized: clientPhone(client) || "",
    sessionsToRebook,
    status: "open",
    detectedAt: todayIso(),
    appointmentAt: data.appointmentAt || "",
    service: String(data.service || "").trim(),
    note: data.note || "",
    statusNote: data.note || "",
    history: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app_manual",
    matchMethod: client ? "manual_client" : "manual_unmatched"
  });
  await logAction("rebooking.created", "rebookings", ref.id, {
    clientId: client?.id || "",
    coachId: targetCoach?.id || state.selectedCoachId,
    clientName,
    sessionsToRebook
  });
  closeModal();
  showToast("Rebooking ajoute.");
}

async function savePerformanceObjective(data) {
  if (!state.selectedCoachId) throw new Error("Selectionne un coach avant d'enregistrer l'objectif.");
  const coach = activeCoachRecord();
  const reminderEnabled = data.reminderEnabled === "on";
  const reminderWeekday = data.reminderWeekday || "monday";
  const nextReminderAt = data.nextReminderAt || nextWeekdayIso(reminderWeekday);
  const payload = {
    coachId: state.selectedCoachId,
    coachRxId: coach?.coachRxId || state.selectedCoachId,
    coachName: coach?.name || "",
    quarterlyObjective: String(data.quarterlyObjective || "").trim(),
    objectivePeriod: String(data.objectivePeriod || currentQuarterLabel()).trim(),
    objectiveStatus: data.objectiveStatus || "active",
    objectiveNote: String(data.objectiveNote || "").trim(),
    rendementSheetUrl: PERFORMANCE_RENDEMENT_SHEET_URL,
    reminderEnabled,
    reminderWeekday,
    nextReminderAt,
    reminderTaskId: performanceReminderTaskId(state.selectedCoachId),
    updatedAt: serverTimestamp(),
    updatedByUid: state.user?.uid || "",
    updatedByEmail: state.user?.email || "",
    source: "firebase_app_performance"
  };
  await setDoc(doc(db, "performanceSettings", state.selectedCoachId), payload, { merge: true });
  if (reminderEnabled) {
    await upsertPerformanceReminderTask(payload);
  } else {
    await disablePerformanceReminderTask(state.selectedCoachId);
  }
  await logAction("performance.objective_saved", "performanceSettings", state.selectedCoachId, {
    objectivePeriod: payload.objectivePeriod,
    objectiveStatus: payload.objectiveStatus,
    reminderEnabled,
    nextReminderAt
  });
  closeModal();
  showToast(reminderEnabled ? "Objectif enregistre et rappel active." : "Objectif enregistre.");
}

async function savePerformanceSettingsPatch(patch) {
  if (!state.selectedCoachId) throw new Error("Selectionne un coach avant de modifier Performance.");
  const coach = activeCoachRecord();
  await setDoc(doc(db, "performanceSettings", state.selectedCoachId), {
    coachId: state.selectedCoachId,
    coachRxId: coach?.coachRxId || state.selectedCoachId,
    coachName: coach?.name || "",
    source: "firebase_app_performance",
    updatedAt: serverTimestamp(),
    updatedByUid: state.user?.uid || "",
    updatedByEmail: state.user?.email || "",
    ...patch
  }, { merge: true });
}

async function savePilotageItem(data) {
  const title = String(data.title || "").trim();
  if (!title) throw new Error("Entre le sujet a discuter.");
  const item = {
    id: `pilotage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    note: String(data.note || "").trim(),
    status: "open",
    createdAt: new Date().toISOString(),
    createdByUid: state.user?.uid || "",
    createdByEmail: state.user?.email || "",
    source: "firebase_app_pilotage"
  };
  await savePerformanceSettingsPatch({
    pilotageDiscussionItems: [item, ...pilotageDiscussionItems()]
  });
  await logAction("pilotage.item_created", "performanceSettings", state.selectedCoachId, {
    title: item.title,
    coachId: state.selectedCoachId
  });
  closeModal();
  showToast("Point ajoute au pilotage.");
}

async function completePilotageItem(itemId) {
  const item = pilotageDiscussionItems().find((entry) => String(entry.id) === String(itemId));
  if (!item) throw new Error("Point de pilotage introuvable.");
  await savePerformanceSettingsPatch({
    pilotageDiscussionItems: nextPilotageItemList(itemId, {
      status: "done",
      discussedAt: new Date().toISOString(),
      discussedByEmail: state.user?.email || ""
    })
  });
  await logAction("pilotage.item_discussed", "performanceSettings", state.selectedCoachId, {
    itemId,
    title: item.title,
    coachId: state.selectedCoachId
  });
  showToast("Point marque discute.");
}

async function deletePilotageItem(itemId) {
  const item = pilotageDiscussionItems().find((entry) => String(entry.id) === String(itemId));
  if (!item) throw new Error("Point de pilotage introuvable.");
  const confirmed = window.confirm(`Retirer ce point du pilotage?\n\n${item.title || "Point a discuter"}`);
  if (!confirmed) return;
  await savePerformanceSettingsPatch({
    pilotageDiscussionItems: nextPilotageItemList(itemId)
  });
  await logAction("pilotage.item_removed", "performanceSettings", state.selectedCoachId, {
    itemId,
    title: item.title,
    coachId: state.selectedCoachId
  });
  showToast("Point retire.");
}

async function createMissionFromPilotageItem(itemId) {
  const item = pilotageDiscussionItems().find((entry) => String(entry.id) === String(itemId));
  if (!item) throw new Error("Point de pilotage introuvable.");
  const coach = activeCoachRecord();
  const ref = await addDoc(collection(db, "tasks"), {
    coachId: state.selectedCoachId,
    coachRxId: coach?.coachRxId || state.selectedCoachId,
    coachName: coach?.name || "",
    clientId: "",
    clientName: "Pilotage",
    type: "pilotage",
    title: item.title || "Action issue du pilotage",
    description: item.note || "Action creee depuis un point de rencontre Pilotage.",
    status: "open",
    priority: "P2",
    priorityRank: 2,
    dueAt: todayIso(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "pilotage_discussion_item",
    sourceItemId: item.id || ""
  });
  await savePerformanceSettingsPatch({
    pilotageDiscussionItems: nextPilotageItemList(itemId, {
      status: "done",
      taskId: ref.id,
      taskCreatedAt: new Date().toISOString(),
      taskCreatedByEmail: state.user?.email || ""
    })
  });
  await logAction("pilotage.item_promoted_to_task", "tasks", ref.id, {
    itemId,
    title: item.title,
    coachId: state.selectedCoachId
  });
  showToast("Mission creee depuis Pilotage.");
}

async function savePilotageNote(noteId, data) {
  const title = String(data.title || "").trim() || "Rencontre coach";
  const meetingDate = data.meetingDate || todayIso();
  const current = pilotageMeetingNotes();
  const existing = noteId ? current.find((item) => String(item.id) === String(noteId)) : null;
  const note = {
    ...(existing || {}),
    id: existing?.id || `meeting_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    meetingDate,
    duration: String(data.duration || "").trim(),
    brightSpot: String(data.brightSpot || "").trim(),
    impactsCounted: String(data.impactsCounted || "").trim(),
    scheduleNotes: String(data.scheduleNotes || "").trim(),
    programmingNotes: String(data.programmingNotes || "").trim(),
    rebookingNotes: String(data.rebookingNotes || "").trim(),
    newClientsNotes: String(data.newClientsNotes || "").trim(),
    lostClientsNotes: String(data.lostClientsNotes || "").trim(),
    performanceAnalysis: String(data.performanceAnalysis || "").trim(),
    netPayResult: String(data.netPayResult || "").trim(),
    trainingNotes: String(data.trainingNotes || "").trim(),
    idsNotes: String(data.idsNotes || "").trim(),
    notes: String(data.notes || "").trim(),
    decisions: String(data.decisions || "").trim(),
    nextActions: String(data.nextActions || "").trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    createdByUid: existing?.createdByUid || state.user?.uid || "",
    createdByEmail: existing?.createdByEmail || state.user?.email || "",
    updatedAt: new Date().toISOString(),
    updatedByEmail: state.user?.email || "",
    source: "firebase_app_pilotage"
  };
  const next = existing
    ? current.map((item) => String(item.id) === String(note.id) ? note : item)
    : [note, ...current];
  await savePerformanceSettingsPatch({ pilotageMeetingNotes: next });
  await logAction(existing ? "pilotage.note_updated" : "pilotage.note_created", "performanceSettings", state.selectedCoachId, {
    noteId: note.id,
    title: note.title,
    meetingDate,
    coachId: state.selectedCoachId
  });
  closeModal();
  showToast(existing ? "Note mise a jour." : "Note de rencontre ajoutee.");
}

async function addManualPerformanceNewClient(data) {
  const name = String(data.name || "").trim();
  if (!name) throw new Error("Entre le nom du nouveau client.");
  const current = performanceManualNewClients();
  const item = {
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: data.createdAt || todayIso(),
    note: String(data.note || "").trim(),
    createdByEmail: state.user?.email || "",
    source: "firebase_app_manual_performance"
  };
  await savePerformanceSettingsPatch({
    manualNewClients: [...current, item],
    newClientExcludedIds: performanceNewClientExcludedIds()
  });
  await logAction("performance.new_client_manual_added", "performanceSettings", state.selectedCoachId, {
    clientName: item.name,
    createdAt: item.createdAt,
    note: item.note
  });
  openModal({ type: "performanceDetail", metric: "newClients" });
  showToast("Nouveau client ajoute au compteur.");
}

async function excludePerformanceNewClient(clientId) {
  const client = requireSelectableClientForCoach(clientId);
  const excluded = [...new Set([...performanceNewClientExcludedIds(), client.id])];
  await savePerformanceSettingsPatch({ newClientExcludedIds: excluded });
  await logAction("performance.new_client_excluded", "clients", client.id, {
    clientName: client.name || "",
    coachId: client.coachId || state.selectedCoachId
  });
  showToast("Client retire du compteur nouveaux clients.");
}

async function restorePerformanceNewClient(clientId) {
  const excluded = performanceNewClientExcludedIds().filter((id) => String(id) !== String(clientId));
  await savePerformanceSettingsPatch({ newClientExcludedIds: excluded });
  await logAction("performance.new_client_restored", "clients", clientId, {
    coachId: state.selectedCoachId
  });
  showToast("Client reintegre au compteur.");
}

async function removeManualPerformanceNewClient(itemId) {
  const current = performanceManualNewClients();
  const item = current.find((entry) => String(entry.id) === String(itemId));
  const next = current.filter((entry) => String(entry.id) !== String(itemId));
  await savePerformanceSettingsPatch({ manualNewClients: next });
  await logAction("performance.new_client_manual_removed", "performanceSettings", state.selectedCoachId, {
    itemId,
    clientName: item?.name || ""
  });
  showToast("Entree manuelle retiree du compteur.");
}

async function upsertPerformanceReminderTask(settings) {
  const taskId = performanceReminderTaskId(settings.coachId);
  const taskRef = doc(db, "tasks", taskId);
  const existing = await getDoc(taskRef);
  await setDoc(taskRef, {
    coachId: settings.coachId,
    coachRxId: settings.coachRxId || settings.coachId,
    coachName: settings.coachName || "",
    clientId: "",
    clientName: "Performance",
    type: "performance",
    title: "Completer le document de rendement",
    description: "Ouvrir le document de rendement semestriel, mettre a jour les suivis importants, puis marquer fait pour reporter le rappel.",
    status: "open",
    priority: "P2",
    priorityRank: 2,
    dueAt: settings.nextReminderAt || nextWeekdayIso(settings.reminderWeekday || "monday"),
    source: "performance_rendement_reminder",
    sourceUrl: PERFORMANCE_RENDEMENT_SHEET_URL,
    recurring: "weekly",
    reminderWeekday: settings.reminderWeekday || "monday",
    updatedAt: serverTimestamp(),
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp()
  }, { merge: true });
}

async function disablePerformanceReminderTask(coachId) {
  const taskRef = doc(db, "tasks", performanceReminderTaskId(coachId));
  const snapshot = await getDoc(taskRef);
  if (!snapshot.exists()) return;
  await updateDoc(taskRef, {
    status: "ignored",
    ignoredAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

async function createImpact(data) {
  const ref = await addDoc(collection(db, "impacts"), {
    coachId: state.selectedCoachId,
    clientName: data.clientName,
    serviceType: data.serviceType || "",
    amount: data.amount || "",
    status: data.status || "draft",
    impactDate: data.impactDate || todayIso(),
    note: data.note || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app_manual"
  });
  await logAction("impact.created", "impacts", ref.id, {
    clientName: data.clientName,
    serviceType: data.serviceType || "",
    amount: data.amount || "",
    impactDate: data.impactDate || todayIso()
  });
  closeModal();
  showToast("Impact ajoute.");
}

async function saveImpact(id, data) {
  if (!id) throw new Error("Impact introuvable.");
  if (!portfolioImpacts().some((item) => item.id === id)) throw new Error("Impact introuvable dans le portefeuille confirme.");
  const patch = {
    clientName: data.clientName || "",
    serviceType: data.serviceType || "",
    amount: data.amount || "",
    status: data.status || "draft",
    impactDate: data.impactDate || todayIso(),
    note: data.note || "",
    editedAt: serverTimestamp()
  };
  await patchEntity("impacts", id, patch, "Impact modifie.");
  await logAction("impact.edited", "impacts", id, {
    clientName: patch.clientName,
    serviceType: patch.serviceType,
    amount: patch.amount,
    impactDate: patch.impactDate,
    status: patch.status
  });
  closeModal();
}

async function updateImpactStatus(id, status, toast) {
  if (!id) return;
  if (!portfolioImpacts().some((item) => item.id === id)) throw new Error("Impact introuvable dans le portefeuille confirme.");
  await patchEntity("impacts", id, {
    status,
    statusChangedAt: serverTimestamp()
  }, toast);
  await logAction(`impact.${status}`, "impacts", id, { status });
}

async function deleteImpact(id) {
  if (!id) return;
  const impact = portfolioImpacts().find((item) => item.id === id);
  if (!impact) throw new Error("Impact introuvable dans le portefeuille confirme.");
  const confirmed = window.confirm(`Supprimer l'impact${impact?.clientName ? ` de ${impact.clientName}` : ""}? Il sera retire de Performance, mais l'action restera journalisee.`);
  if (!confirmed) return;
  await patchEntity("impacts", id, {
    status: "deleted",
    deletedAt: serverTimestamp()
  }, "Impact supprime.");
  await logAction("impact.deleted", "impacts", id, {
    clientName: impact?.clientName || "",
    amount: impact?.amount || "",
    impactDate: impact?.impactDate || ""
  });
}

async function createAlumni(data) {
  const coach = activeCoachRecord();
  const ref = await addDoc(collection(db, "alumni"), {
    coachId: state.selectedCoachId,
    coachRxId: coach?.coachRxId || state.selectedCoachId,
    coachName: coach?.name || "",
    name: data.name,
    phoneNormalized: normalizePhone(data.phoneNormalized),
    email: data.email || "",
    status: "to_work",
    nextFollowupAt: data.nextFollowupAt || "",
    note: data.note || "",
    lastNameSort: lastNameSort(data.name),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app_manual"
  });
  await logAction("alumni.created", "alumni", ref.id, {
    name: data.name,
    hasPhone: Boolean(normalizePhone(data.phoneNormalized))
  });
  closeModal();
  showToast("Alumni ajoute.");
}

async function moveClientToAlumni(clientId) {
  if (!clientId) return;
  const client = requireSelectableClientForCoach(clientId);
  const clientName = client.name || "ce client";
  const confirmed = window.confirm(`Mettre ${clientName} dans Alumni? Le client sortira du portefeuille actif, mais restera disponible dans Alumni.`);
  if (!confirmed) return;

  const alumniId = `client_${client.id}`;
  const alumniRef = doc(db, "alumni", alumniId);
  const existingAlumni = await getDoc(alumniRef);
  const existingAlumniData = existingAlumni.exists() ? existingAlumni.data() : {};
  const phone = clientPhone(client);
  const coachId = client.coachId || state.selectedCoachId;
  const batch = writeBatch(db);
  batch.set(alumniRef, {
    coachId,
    coachRxId: client.coachRxId || coachRecordById(coachId)?.coachRxId || coachId,
    coachName: client.coachName || coachRecordById(coachId)?.name || activeCoachRecord()?.name || "",
    name: client.name || "",
    phoneNormalized: phone,
    email: client.email || "",
    status: existingAlumniData.status || "to_work",
    nextFollowupAt: existingAlumniData.nextFollowupAt || "",
    note: existingAlumniData.note || client.notes || client.riskNote || "",
    source: "firebase_client_to_alumni",
    sourceClientId: client.id,
    sourceClientStatus: client.status || "",
    movedToAlumniAt: serverTimestamp(),
    createdAt: existingAlumniData.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  batch.update(doc(db, "clients", client.id), {
    status: "alumni",
    clientSelectable: false,
    alumniId,
    movedToAlumniAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await batch.commit();

  await logAction("client.moved_to_alumni", "clients", client.id, {
    alumniId,
    clientName: client.name || "",
    hasPhone: Boolean(phone)
  });
  closeModal();
  showToast("Client deplace dans Alumni.");
}

async function deleteClient(clientId) {
  if (!clientId) return;
  const client = requireSelectableClientForCoach(clientId);
  const clientName = client.name || "ce client";
  const firstConfirmed = window.confirm(
    `Supprimer la fiche client de ${clientName}?\n\n` +
    "Utilise cette action seulement pour un faux client, un doublon ou une fiche creee par erreur. " +
    "Pour un vrai client qui quitte les services, utilise plutot Passer en Alumni."
  );
  if (!firstConfirmed) return;
  const secondConfirmed = window.confirm(
    `Voulez-vous vraiment supprimer ${clientName}?\n\n` +
    "Cette fiche client sera eliminee de la base de donnees clients et sortira du portefeuille actif. " +
    "Les historiques lies comme les missions, questionnaires, rebookings et journaux d'action ne seront pas effaces automatiquement."
  );
  if (!secondConfirmed) return;

  const coachId = client.coachId || state.selectedCoachId;
  await deleteDoc(doc(db, "clients", client.id));
  await logAction("client.deleted", "clients", client.id, {
    coachId,
    clientName,
    hadPhone: Boolean(clientPhone(client)),
    source: client.source || "",
    reason: "manual_false_or_error_client"
  });
  closeModal();
  showToast("Fiche client supprimee.");
}

async function saveAlumni(id, data) {
  if (!id) throw new Error("Alumni introuvable.");
  const currentAlumni = state.data.alumni.find((item) => item.id === id) || {};
  const requestedCoachId = data.coachId ? String(data.coachId) : String(currentAlumni.coachId || state.selectedCoachId || "");
  const targetCoach = coachRecordById(requestedCoachId);
  if (!targetCoach?.id) {
    throw new Error("Coach responsable invalide. Selectionne un coach actif avant d'enregistrer.");
  }
  const previousCoachId = String(currentAlumni.coachId || state.selectedCoachId || "");
  const transferred = Boolean(targetCoach?.id && previousCoachId && targetCoach.id !== previousCoachId);
  if (transferred) {
    const confirmed = window.confirm(`Transferer ${data.name || currentAlumni.name || "cet alumni"} a ${targetCoach.name || targetCoach.id}? Les missions alumni liees suivront aussi.`);
    if (!confirmed) return;
  }
  const patch = {
    name: data.name || "",
    phoneNormalized: normalizePhone(data.phoneNormalized),
    email: data.email || "",
    status: data.status || "to_work",
    nextFollowupAt: data.nextFollowupAt || "",
    note: data.note || "",
    editedAt: serverTimestamp()
  };
  if (targetCoach?.id) {
    patch.coachId = targetCoach.id;
    patch.coachRxId = targetCoach.coachRxId || targetCoach.id;
    patch.coachName = targetCoach.name || "";
  }
  if (transferred) {
    patch.previousCoachId = previousCoachId;
    patch.transferredAt = serverTimestamp();
    patch.transferSource = isInfoAdmin() ? "firebase_dashboard_admin" : "firebase_dashboard_coach";
  }
  await patchEntity("alumni", id, patch, "Alumni modifie.");
  const relatedTransferCounts = transferred
    ? await transferAlumniRelatedRecords(id, previousCoachId, targetCoach)
    : {};
  await logAction("alumni.edited", "alumni", id, {
    name: patch.name,
    hasPhone: Boolean(patch.phoneNormalized),
    status: patch.status,
    previousCoachId,
    targetCoachId: targetCoach?.id || previousCoachId,
    transferred,
    relatedTransferCounts: JSON.stringify(relatedTransferCounts)
  });
  closeModal();
}

async function transferAlumniRelatedRecords(alumniId, previousCoachId, targetCoach) {
  const snap = await getDocs(query(collection(db, "tasks"), where("alumniId", "==", alumniId), where("coachId", "==", previousCoachId)));
  await Promise.all(snap.docs.map((itemDoc) => updateDoc(itemDoc.ref, {
    coachId: targetCoach.id,
    coachRxId: targetCoach.coachRxId || targetCoach.id,
    coachName: targetCoach.name || "",
    previousCoachId,
    transferredAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })));
  return { tasks: snap.docs.length };
}

async function reactivateAlumniAsClient(alumniId) {
  if (!alumniId) return;
  const alumni = state.data.alumni.find((item) => item.id === alumniId);
  if (!alumni) throw new Error("Alumni introuvable.");
  const coachId = alumni.coachId || state.selectedCoachId;
  const targetCoach = coachRecordById(coachId);
  if (!targetCoach?.id) throw new Error("Coach responsable invalide.");
  const confirmed = window.confirm(`Ramener ${alumni.name || "cet alumni"} dans Clients? Le dossier sortira de la liste Alumni reactivee et redeviendra un client du coach.`);
  if (!confirmed) return;

  let clientId = alumni.sourceClientId || alumni.reactivatedClientId || "";
  let clientRef = clientId ? doc(db, "clients", clientId) : null;
  let existingClient = clientRef ? await getDoc(clientRef) : null;
  if (!existingClient?.exists()) {
    clientId = stableClientId(targetCoach.id, { name: alumni.name || "", phoneNormalized: alumni.phoneNormalized || "" });
    clientRef = doc(db, "clients", clientId);
    existingClient = await getDoc(clientRef);
  }
  const existing = existingClient.exists() ? existingClient.data() : {};
  if (existingClient.exists()) {
    const existingRecord = { id: clientId, ...existing };
    const safeExistingClient = clientEntityType(existingRecord) === "member"
      && clientOwnershipStatus(existingRecord) === "confirmed"
      && firestoreItemBelongsToCoach(existingRecord, targetCoach.id);
    if (!safeExistingClient) {
      throw new Error("La fiche client liee a cet alumni doit etre validee par un admin.");
    }
  }
  await setDoc(clientRef, {
    coachId: targetCoach.id,
    coachRxId: targetCoach.coachRxId || targetCoach.id,
    coachName: targetCoach.name || "",
    name: alumni.name || existing.name || "Client reactive",
    phoneNormalized: normalizePhone(alumni.phoneNormalized) || clientPhone(existing) || "",
    clientPhoneNormalized: normalizePhone(alumni.phoneNormalized) || clientPhone(existing) || "",
    email: alumni.email || existing.email || "",
    membershipLabel: existing.membershipLabel || "Client reactive depuis Alumni",
    manualMembershipEndDate: existing.manualMembershipEndDate || "",
    kiloPlannedRecurrenceEndDate: existing.kiloPlannedRecurrenceEndDate || "",
    riskLevel: existing.riskLevel || "none",
    riskNote: existing.riskNote || "",
    notes: existing.notes || alumni.note || "",
    status: existing.status && existing.status !== "alumni" && existing.status !== "archived" ? existing.status : "manual",
    lastNameSort: lastNameSort(alumni.name || existing.name || ""),
    alumniId,
    reactivatedFromAlumniAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAt: existing.createdAt || serverTimestamp(),
    source: existing.source || "firebase_alumni_reactivated",
    entityType: "member",
    ownershipStatus: "confirmed",
    clientSelectable: true,
    ownershipSource: "dashboard_alumni_reactivation",
    ownershipVerifiedAt: serverTimestamp(),
    ownershipVerifiedBy: state.user?.email || ""
  }, { merge: true });

  await patchEntity("alumni", alumniId, {
    status: "reactivated",
    reactivatedAt: serverTimestamp(),
    reactivatedClientId: clientId,
    updatedAt: serverTimestamp()
  }, "Alumni ramene dans Clients.");
  await logAction("alumni.reactivated_to_client", "alumni", alumniId, {
    clientId,
    alumniName: alumni.name || "",
    hasPhone: Boolean(normalizePhone(alumni.phoneNormalized))
  });
  closeModal();
}

async function journalQuestionnaireSend(clientId, questionnaireType = DEFAULT_QUESTIONNAIRE_TYPE) {
  const client = requireSelectableClientForCoach(clientId);
  const phone = clientPhone(client);
  if (!phone) throw new Error("Telephone manquant. Le matching et l'envoi se font par telephone.");
  const questionnaire = questionnaireTypeConfig(questionnaireType);
  const confirmed = window.confirm(`Envoyer ${questionnaire.label} a ${client.name || "ce client"} (${phone}) via GoHighLevel?`);
  if (!confirmed) {
    await logAction("questionnaire.send_cancelled", "clients", clientId, {
      clientName: client.name || "",
      phone,
      questionnaireType: questionnaire.type
    });
    return;
  }
  const attemptRef = await addDoc(collection(db, "questionnaireSends"), {
    coachId: client.coachId || state.selectedCoachId,
    clientId,
    clientName: client.name || "",
    clientPhoneNormalized: phone,
    coachName: client.coachName || coachRecordById(client.coachId || state.selectedCoachId)?.name || activeCoachRecord()?.name || "",
    status: "pending",
    deliveryStatus: "firestore_queue_pending",
    errorMessage: "",
    questionnaireType: questionnaire.type,
    questionnaireLabel: questionnaire.label,
    ghlTag: questionnaire.ghlTag,
    questionnaireUrl: questionnaireUrlForClient(client, questionnaire.type),
    requestedByUid: state.user?.uid || "",
    requestedByEmail: state.user?.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "dashboard_questionnaire_send_click"
  });
  closeModal();
  await logAction("questionnaire.send_queued", "clients", clientId, {
    clientName: client.name || "",
    phone,
    provider: "ghl",
    questionnaireType: questionnaire.type,
    ghlTag: questionnaire.ghlTag
  });
  showToast(`Envoi ${questionnaire.label} lance. Le statut se mettra a jour automatiquement.`);
}

async function saveQuestionnaireSchedule(clientId, data) {
  const client = requireSelectableClientForCoach(clientId);
  const phone = clientPhone(client);
  if (!phone) throw new Error("Telephone manquant. La planification depend du telephone.");
  const questionnaire = questionnaireTypeConfig(data.questionnaireType);
  const scheduleId = questionnaireScheduleId(client.coachId || state.selectedCoachId, client.id, questionnaire.type);
  const existing = portfolioQuestionnaireSchedules().find((item) => item.id === scheduleId) || {};
  const payload = {
    coachId: client.coachId || state.selectedCoachId,
    coachRxId: client.coachRxId || coachRecordById(client.coachId || state.selectedCoachId)?.coachRxId || "",
    coachName: client.coachName || coachRecordById(client.coachId || state.selectedCoachId)?.name || activeCoachRecord()?.name || "",
    clientId: client.id,
    clientName: client.name || "",
    clientPhoneNormalized: phone,
    questionnaireType: questionnaire.type,
    questionnaireLabel: questionnaire.label,
    ghlTag: questionnaire.ghlTag,
    questionnaireUrl: questionnaireUrlForClient(client, questionnaire.type),
    frequency: sanitizeQuestionnaireScheduleFrequency(data.frequency),
    nextSendAt: data.nextSendAt || todayIso(),
    status: data.status === "paused" ? "paused" : "active",
    note: String(data.note || "").trim(),
    requestedByUid: state.user?.uid || "",
    requestedByEmail: state.user?.email || "",
    updatedAt: serverTimestamp(),
    createdAt: existing.createdAt || serverTimestamp(),
    source: "dashboard_questionnaire_schedule"
  };
  await setDoc(doc(db, "questionnaireSchedules", scheduleId), payload, { merge: true });
  await logAction("questionnaire.schedule_saved", "questionnaireSchedules", scheduleId, {
    clientId: client.id,
    clientName: client.name || "",
    frequency: payload.frequency,
    nextSendAt: payload.nextSendAt,
    status: payload.status,
    questionnaireType: questionnaire.type
  });
  closeModal();
  showToast(`Automatisation ${questionnaire.label} enregistree.`);
}

async function toggleQuestionnaireSchedule(scheduleId) {
  const schedule = portfolioQuestionnaireSchedules().find((item) => item.id === scheduleId);
  if (!schedule) return;
  requireSelectableClientForCoach(schedule.clientId);
  const nextStatus = (schedule.status || "active") === "active" ? "paused" : "active";
  await patchEntity("questionnaireSchedules", scheduleId, {
    status: nextStatus,
    statusChangedAt: serverTimestamp()
  }, nextStatus === "active" ? "Automatisation reprise." : "Automatisation mise en pause.");
}

async function cancelQuestionnaireSend(sendId) {
  const send = portfolioQuestionnaireSends().find((item) => item.id === sendId);
  if (!send) throw new Error("Envoi questionnaire introuvable.");
  requireSelectableClientForCoach(send.clientId);
  await patchEntity("questionnaireSends", sendId, { status: "cancelled" }, "Envoi archive");
}

function callableErrorMessage(error) {
  const code = error?.code ? `${error.code}: ` : "";
  const message = error?.message || error?.details?.message || "Erreur Firebase Functions inconnue.";
  return `${code}${message}`;
}

async function createQuestionnaireFollowupTask(sendId) {
  const send = portfolioQuestionnaireSends().find((item) => item.id === sendId);
  if (!send) return;
  if (send.status !== "sent" || send.answeredAt || questionnaireSendHasResponse(send)) {
    showToast("Relance non creee: ce questionnaire n'est pas en attente de reponse.");
    return;
  }
  const waitingDays = daysSince(send.sentAt || send.createdAt);
  if (waitingDays < 7) {
    showToast(`Relance disponible dans ${Math.max(0, 7 - waitingDays)} jour(s).`);
    return;
  }
  if (send.followupTaskCreatedAt) {
    showToast("Une relance existe deja pour cet envoi.");
    return;
  }
  const client = requireSelectableClientForCoach(send.clientId);
  const ref = await addDoc(collection(db, "tasks"), {
    coachId: state.selectedCoachId,
    clientId: client.id,
    clientName: client.name || send.clientName || "",
    type: "questionnaire_followup",
    title: "Relancer questionnaire client",
    description: "Questionnaire envoye il y a 7 jours ou plus sans reponse.",
    status: "open",
    priority: "P2",
    priorityRank: 2,
    dueAt: todayIso(),
    source: "firebase_questionnaire_followup",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await logAction("task.created", "tasks", ref.id, {
    source: "questionnaire_followup",
    clientId: client.id,
    questionnaireSendId: sendId
  });
  await patchEntity("questionnaireSends", sendId, { followupTaskCreatedAt: serverTimestamp() }, "Relance creee");
}

async function createMissionFromQuestionnaireResponse(responseId) {
  const response = portfolioQuestionnaireResponses().find((item) => item.id === responseId);
  if (!response) return;
  if (!response.clientId) {
    showToast("Mission non creee: rattache d'abord la reponse a une fiche client.");
    return;
  }
  const client = requireSelectableClientForCoach(response.clientId);
  await markQuestionnaireResponseRead(responseId, { silent: true });
  const responseCoachId = state.selectedCoachId;
  const triageStatus = String(response.triageStatus || "").toLowerCase();
  const title = "Lire le questionnaire";
  const submittedAt = response.submittedAt || response.createdAt || todayIso();
  const description = submittedAt
    ? `Reponse recue le ${formatDate(submittedAt)}. Lis le questionnaire, puis ferme la mission.`
    : "Reponse recue. Lis le questionnaire, puis ferme la mission.";
  const ref = await addDoc(collection(db, "tasks"), {
    coachId: responseCoachId,
    clientId: client.id,
    clientName: client.name || response.clientName || "Client a valider",
    type: "questionnaire_followup",
    title,
    description,
    status: "open",
    priority: triageStatus === "rouge" ? "P1" : triageStatus === "orange" ? "P2" : "P3",
    priorityRank: questionnairePriorityRank(response) || 2,
    dueAt: todayIso(),
    source: "questionnaire_response_mission",
    sourceResponseId: responseId,
    questionnaireResponseId: responseId,
    responseSubmittedAt: submittedAt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await logAction("task.created_from_questionnaire_response", "tasks", ref.id, {
    questionnaireResponseId: responseId,
    clientId: client.id,
    triageStatus: response.triageStatus || ""
  });
  showToast("Mission creee et reponse archivee.");
}

async function linkQuestionnaireResponseToClient(responseId, data) {
  requireAdmin();
  const response = questionnaireResponseForAdminLinking(responseId);
  if (!response) throw new Error("Reponse questionnaire introuvable.");
  const client = requireSelectableClientForCoach(data.clientId);
  const note = String(data.note || "").trim();
  await patchEntity("questionnaireResponses", responseId, {
    clientId: client.id,
    clientName: client.name || response.clientName || "",
    clientPhoneNormalized: clientPhone(client) || questionnaireResponsePhone(response) || "",
    processingStatus: "to_read",
    matchedManuallyAt: serverTimestamp(),
    matchedManuallyByUid: state.user?.uid || "",
    matchedManuallyByEmail: state.user?.email || "",
    manualMatchNote: note,
    updatedAt: serverTimestamp()
  }, "Reponse reliee au client.");
  await logAction("questionnaire_response.client_linked", "questionnaireResponses", responseId, {
    clientId: client.id,
    clientName: client.name || "",
    previousClientName: response.clientName || "",
    hadResponsePhone: Boolean(questionnaireResponsePhone(response))
  });
  closeModal();
}

async function markQuestionnaireResponseRead(responseId, options = {}) {
  const response = portfolioQuestionnaireResponses().find((item) => item.id === responseId);
  if (!response) throw new Error("Reponse questionnaire introuvable dans le portefeuille confirme.");
  const responseCoachId = response?.coachId || state.selectedCoachId;
  await patchEntity("questionnaireResponses", responseId, {
    processingStatus: "read",
    readAt: serverTimestamp(),
    readByUid: state.user?.uid || "",
    readByEmail: state.user?.email || ""
  });

  const relatedTasks = await getDocs(query(
    collection(db, "tasks"),
    where("coachId", "==", responseCoachId),
    where("sourceResponseId", "==", responseId)
  ));

  const coachTasks = relatedTasks.docs.filter((taskDoc) => operationalRecordHasSafeClientLink({ id: taskDoc.id, ...taskDoc.data() }));

  await Promise.all(coachTasks.map((taskDoc) => updateDoc(taskDoc.ref, {
    status: "done",
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })));
  await logAction("questionnaire_response.read", "questionnaireResponses", responseId, {
    coachId: responseCoachId,
    linkedTasksClosed: coachTasks.length
  });

  if (!options.silent) {
    showToast(coachTasks.length ? "Reponse archivee et tache liee fermee." : "Reponse archivee.");
  }
}

async function completeQuestionnaireTask(taskId, responseId = "") {
  if (!taskId) return;
  const task = operationalTaskById(taskId);
  if (!task) throw new Error("Mission introuvable dans le portefeuille confirme.");
  const linkedResponseId = responseId || taskQuestionnaireResponseId(task);
  if (linkedResponseId) {
    await markQuestionnaireResponseRead(linkedResponseId, { silent: true });
  }
  await completeTask(taskId, { silent: true });
  showToast("Questionnaire marque lu et mission fermee.");
}

async function createAlumniTask(alumniId) {
  const alumni = state.data.alumni.find((item) => item.id === alumniId);
  if (!alumni) return;
  const coach = coachRecordById(alumni.coachId || state.selectedCoachId) || activeCoachRecord();
  const ref = await addDoc(collection(db, "tasks"), {
    coachId: coach?.id || state.selectedCoachId,
    coachRxId: coach?.coachRxId || coach?.id || state.selectedCoachId,
    coachName: coach?.name || "",
    clientName: alumni.name || "",
    alumniId,
    type: "manual",
    title: `Recontacter alumni: ${alumni.name || "client"}`,
    description: alumni.note || "",
    status: "open",
    priority: "P2",
    priorityRank: 2,
    dueAt: todayIso(),
    source: "firebase_alumni",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await logAction("task.created", "tasks", ref.id, {
    source: "alumni",
    alumniId,
    clientName: alumni.name || ""
  });
  showToast("Mission alumni creee.");
}

async function updateAlumniStatus(id, status, toast) {
  if (!id) return;
  const patch = {
    status,
    statusChangedAt: serverTimestamp()
  };
  if (status === "to_work") patch.returnedToWorkAt = serverTimestamp();
  if (status === "reactivated") patch.reactivatedAt = todayIso();
  await patchEntity("alumni", id, patch, toast);
  await logAction(`alumni.${status}`, "alumni", id, { status });
}

async function completeTask(id, options = {}) {
  if (!id) return;
  const task = operationalTaskById(id);
  if (!task) throw new Error("Mission introuvable dans le portefeuille confirme.");
  if (task?.source === "performance_rendement_reminder" && task.recurring === "weekly") {
    const nextDueAt = nextWeekdayIso(task.reminderWeekday || "monday");
    await patchEntity("tasks", id, {
      status: "open",
      dueAt: nextDueAt,
      lastCompletedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, "Rappel reporte a la semaine prochaine.");
    await setDoc(doc(db, "performanceSettings", task.coachId || state.selectedCoachId), {
      nextReminderAt: nextDueAt,
      reminderTaskId: id,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await logAction("performance.reminder_rescheduled", "tasks", id, {
      nextDueAt,
      reminderWeekday: task.reminderWeekday || "monday"
    });
    return;
  }
  const optimisticTask = task ? { ...task } : null;
  if (optimisticTask) {
    state.data.tasks = state.data.tasks.filter((item) => item.id !== id);
    delete state.voicePlayback[id];
    render();
  }
  try {
    await patchEntity("tasks", id, { status: "done", completedAt: serverTimestamp() }, options.silent ? "" : "Mission fermee");
  } catch (error) {
    if (optimisticTask && !state.data.tasks.some((item) => item.id === id)) {
      state.data.tasks = [...state.data.tasks, optimisticTask]
        .filter(isOpenTaskLifecycle)
        .sort(sortTasks)
        .slice(0, 300);
      primeTaskVoicePlaybackUrls(state.data.tasks);
      render();
    }
    throw error;
  }
}

async function ignoreOperationalTask(id) {
  const task = operationalTaskById(id);
  if (!task) throw new Error("Mission introuvable dans le portefeuille confirme.");
  await patchEntity("tasks", task.id, { status: "ignored", ignoredAt: serverTimestamp() }, "Tache masquee");
}

async function archiveAlumni(id) {
  if (!id) return;
  const alumni = state.data.alumni.find((item) => item.id === id);
  const confirmed = window.confirm(`Archiver ${alumni?.name || "cet alumni"}? Il quittera les listes de travail, mais restera disponible dans Archives.`);
  if (!confirmed) return;
  await patchEntity("alumni", id, {
    status: "archived",
    archivedAt: serverTimestamp()
  }, "Alumni archive.");
  await logAction("alumni.archived", "alumni", id, {
    name: alumni?.name || "",
    phone: alumni?.phoneNormalized || ""
  });
}

async function patchEntity(collectionName, id, patch, toast) {
  await updateDoc(doc(db, collectionName, id), { ...patch, updatedAt: serverTimestamp() });
  await logAction(`${collectionName}.updated`, collectionName, id, {
    fields: Object.keys(patch),
    status: typeof patch.status === "string" ? patch.status : ""
  });
  if (toast) showToast(toast);
}

async function markRebookingCoachAbsence(id) {
  const rebooking = findRebookingForCoachView(id);
  if (!rebooking) throw new Error("Rebooking introuvable dans le portefeuille confirme.");
  const note = window.prompt(
    `Pourquoi classer ${rebooking.clientName || "ce rebooking"} en absence coach?\n\n` +
    "Exemples: vacances du 10 au 17 juin, absence coach, fermeture exceptionnelle."
  );
  if (note === null) return;
  await patchRebooking(id, "coach_absence", "Absence coach enregistree", {
    statusNote: note.trim(),
    coachAbsenceReason: note.trim()
  });
}

async function completeRebookingWithNote(id, status) {
  const rebooking = findRebookingForCoachView(id);
  if (!rebooking) throw new Error("Rebooking introuvable dans le portefeuille confirme.");
  const label = status === "rebooked" ? "seance rebookee" : "suivi fait";
  const promptText = status === "rebooked"
    ? `Note optionnelle pour ${rebooking.clientName || "ce client"}.\n\nEx.: rebooke mardi 18h, confirme par SMS.`
    : `Note optionnelle pour ${rebooking.clientName || "ce client"}.\n\nEx.: client contacte, attend retour, seance deja reprise ailleurs.`;
  const note = window.prompt(promptText, "");
  if (note === null) return;
  await patchRebooking(id, status, status === "rebooked" ? "Seance rebookee." : "Suivi rebooking marque fait.", {
    statusNote: note.trim()
  });
}

async function adjustRebookingSessions(id) {
  const rebooking = findRebookingForCoachView(id);
  if (!rebooking) throw new Error("Rebooking introuvable.");
  const currentSessions = Math.max(1, Number(rebooking.sessionsToRebook || 1));
  const rawCount = window.prompt(
    `Combien de seances restent a remettre pour ${rebooking.clientName || "ce client"}?`,
    String(currentSessions)
  );
  if (rawCount === null) return;
  const nextSessions = Math.max(1, Math.round(Number(rawCount)));
  if (!Number.isFinite(nextSessions)) throw new Error("Nombre de seances invalide.");
  if (nextSessions === currentSessions) {
    showToast("Aucun changement.");
    return;
  }
  if (rebookingVolumeNeedsReview(nextSessions)) {
    const confirmed = window.confirm(
      `${nextSessions} seances resteront ouvertes pour ${rebooking.clientName || "ce client"}.\n\n` +
      "Ce volume est inhabituel. Confirme-le seulement apres verification."
    );
    if (!confirmed) {
      showToast("Ajustement annule.");
      return;
    }
  }
  const note = window.prompt("Note optionnelle pour expliquer l'ajustement.", "");
  if (note === null) return;
  const targetIds = rebookingActionTargetIds(id);
  if (!targetIds.length) throw new Error("Rebooking introuvable dans le portefeuille confirme.");
  const [primaryId, ...duplicateIds] = targetIds;
  await patchEntity("rebookings", primaryId, {
    sessionsToRebook: nextSessions,
    groupedSourceCount: Math.max(1, Number(rebooking.groupedSourceCount || 1)),
    relatedRebookingIds: targetIds,
    manualAdjustmentAt: serverTimestamp(),
    manualAdjustmentNote: note.trim(),
    history: arrayUnion({
      status: rebooking.status || "open",
      label: "Seances ajustees",
      action: "sessions_adjusted",
      at: new Date().toISOString(),
      by: state.user?.email || "",
      previousSessionsToRebook: currentSessions,
      sessionsToRebook: nextSessions,
      note: note.trim()
    })
  }, "Nombre de seances ajuste.");
  if (duplicateIds.length) {
    await Promise.all(duplicateIds.map((duplicateId) => patchRebooking(duplicateId, "managed", "", {
      statusNote: `Fusionne avec ${primaryId}: ${nextSessions} seance(s) restante(s).`,
      note: note.trim(),
      mergedIntoRebookingId: primaryId
    }, { groupOpen: false })));
  }
  await logAction("rebooking.sessions_adjusted", "rebookings", id, {
    clientName: rebooking.clientName || "",
    previousSessionsToRebook: currentSessions,
    sessionsToRebook: nextSessions
  });
}

async function transferRebookingCoach(id) {
  const rebooking = findRebookingForCoachView(id);
  if (!rebooking) throw new Error("Rebooking introuvable.");
  const options = mergedCoachOptions().filter((coach) => String(coach.id) !== String(rebooking.coachId || state.selectedCoachId));
  if (!options.length) throw new Error("Aucun autre coach disponible.");
  const list = options.map((coach, index) => `${index + 1}. ${coach.name || coach.id}`).join("\n");
  const raw = window.prompt(
    `Transferer ${rebooking.clientName || "ce rebooking"} vers quel coach?\n\n${list}\n\nEntre le numero du coach.`,
    "1"
  );
  if (raw === null) return;
  const index = Math.round(Number(raw)) - 1;
  const targetCoach = options[index];
  if (!targetCoach) throw new Error("Coach invalide.");
  const confirmed = window.confirm(`Transferer ce rebooking vers ${targetCoach.name || targetCoach.id}?`);
  if (!confirmed) return;
  const targetIds = rebookingActionTargetIds(id);
  if (!targetIds.length) throw new Error("Rebooking introuvable dans le portefeuille confirme.");
  await Promise.all(targetIds.map((targetId) => patchEntity("rebookings", targetId, {
    coachId: targetCoach.id,
    coachRxId: targetCoach.coachRxId || targetCoach.id,
    coachName: targetCoach.name || "",
    previousCoachId: rebooking.coachId || state.selectedCoachId,
    transferredAt: serverTimestamp(),
    history: arrayUnion({
      status: rebooking.status || "open",
      label: "Coach change",
      action: "coach_transferred",
      at: new Date().toISOString(),
      by: state.user?.email || "",
      previousCoachId: rebooking.coachId || state.selectedCoachId,
      coachId: targetCoach.id,
      coachName: targetCoach.name || ""
    })
  }, "")));
  showToast(targetIds.length > 1 ? `${targetIds.length} rebookings transferes.` : "Rebooking transfere.");
  await logAction("rebooking.coach_transferred", "rebookings", id, {
    clientName: rebooking.clientName || "",
    previousCoachId: rebooking.coachId || state.selectedCoachId,
    coachId: targetCoach.id
  });
}

async function linkRebookingToClient(id, data) {
  const rebooking = findRebookingForCoachView(id);
  if (!rebooking) throw new Error("Rebooking introuvable.");
  const client = requireSelectableClientForCoach(data.clientId);
  const phone = clientPhone(client);
  const note = String(data.note || "").trim();
  const targetIds = rebookingActionTargetIds(id);
  if (!targetIds.length) throw new Error("Rebooking introuvable dans le portefeuille confirme.");
  await Promise.all(targetIds.map((targetId) => patchEntity("rebookings", targetId, {
    clientId: client.id,
    clientName: client.name || rebooking.clientName || "",
    clientPhoneNormalized: phone || "",
    matchMethod: "manual_client",
    manuallyLinkedAt: serverTimestamp(),
    manuallyLinkedBy: state.user?.email || "",
    manualLinkNote: note,
    history: arrayUnion({
      status: rebooking.status || "open",
      label: "Client relie",
      action: "client_linked",
      at: new Date().toISOString(),
      by: state.user?.email || "",
      clientId: client.id,
      clientName: client.name || "",
      phoneNormalized: phone || "",
      note
    })
  }, "")));
  showToast(targetIds.length > 1 ? `${targetIds.length} rebookings relies au client.` : "Client relie au rebooking.");
  await logAction("rebooking.client_linked", "rebookings", id, {
    clientId: client.id,
    clientName: client.name || "",
    hadPhone: Boolean(phone),
    previousClientName: rebooking.clientName || ""
  });
  closeModal();
}

async function deleteRebookingError(id) {
  const rebooking = findRebookingForCoachView(id);
  if (!rebooking) throw new Error("Rebooking introuvable.");
  const sessions = Math.max(1, Number(rebooking.sessionsToRebook || 1));
  const targetIds = rebookingActionTargetIds(id);
  const confirmed = window.confirm(
    `Supprimer ce dossier rebooking comme erreur?\n\n` +
    `${rebooking.clientName || "Client"} - ${sessions} seance${sessions > 1 ? "s" : ""} a remettre.\n\n` +
    "Il sera retire de la liste active, mais garde dans l'historique."
  );
  if (!confirmed) return;
  const note = window.prompt("Note optionnelle pour expliquer la suppression.", "");
  if (note === null) return;
  await patchRebooking(id, "deleted", "Rebooking supprime comme erreur.", {
    statusNote: note.trim() || "Supprime comme erreur.",
    deletedAsError: true,
    deletedBy: state.user?.email || "",
    deletedTargetCount: targetIds.length
  });
  await logAction("rebooking.deleted_error", "rebookings", id, {
    clientName: rebooking.clientName || "",
    sessionsToRebook: sessions,
    targetCount: targetIds.length
  });
  closeModal();
}

async function markRebookingAbsenceRange(data) {
  const start = dateValue(data.startDate);
  const end = dateValue(data.endDate);
  if (!start || !end || end < start) throw new Error("Plage de dates invalide.");
  const endOfDay = new Date(end);
  endOfDay.setHours(23, 59, 59, 999);
  const reason = String(data.reason || "").trim();
  if (!reason) throw new Error("Raison requise.");
  const targets = portfolioRebookings()
    .filter((item) => (item.status || "open") === "open")
    .filter((item) => {
      const eventTime = rebookingEventDate(item);
      return eventTime >= start && eventTime <= endOfDay.getTime();
    });
  if (!targets.length) throw new Error("Aucun rebooking ouvert dans cette plage.");
  const confirmed = window.confirm(`Marquer ${targets.length} rebooking(s) en absence coach pour cette periode?`);
  if (!confirmed) return;
  const note = `${reason} (${data.startDate} au ${data.endDate})`;
  await Promise.all(targets.map((item) => patchRebooking(item.id, "coach_absence", "", {
    coachAbsenceReason: reason,
    absenceStartDate: data.startDate,
    absenceEndDate: data.endDate,
    statusNote: `Absence coach: ${note}`,
    note
  })));
  await logAction("rebooking.coach_absence_range", "rebookings", "range", {
    count: targets.length,
    startDate: data.startDate,
    endDate: data.endDate,
    reason
  });
  closeModal();
  showToast(`${targets.length} rebooking(s) classes absence coach.`);
}

async function patchRebooking(id, status, toast, details = {}, options = {}) {
  const statusNote = String(details.statusNote || details.note || "").trim();
  const targetIds = rebookingActionTargetIds(id, {
    groupOpen: options.groupOpen !== false && status !== "open"
  });
  if (!targetIds.length) throw new Error("Rebooking introuvable dans le portefeuille confirme.");
  const patch = {
    status,
    [`${status}At`]: serverTimestamp(),
    ...details,
    history: arrayUnion({
      status,
      label: rebookingStatusLabel(status),
      at: new Date().toISOString(),
      by: state.user?.email || "",
      note: statusNote
    })
  };
  await Promise.all(targetIds.map((targetId) => patchEntity("rebookings", targetId, patch, "")));
  if (toast) {
    showToast(targetIds.length > 1 ? `${toast} (${targetIds.length} dossiers)` : toast);
  }
}

function rebookingEventDate(rebooking) {
  return dateValue(rebooking.appointmentAt || rebooking.detectedAt || rebooking.createdAt);
}

async function logAction(action, entityType, entityId, details = {}) {
  if (!state.user || !state.profile) return;
  const coachId = details.coachId || state.selectedCoachId || state.profile.coachId || "admin";
  try {
    await addDoc(collection(db, "actionLogs"), {
      action,
      entityType,
      entityId: String(entityId || ""),
      coachId,
      userId: state.user.uid,
      userEmail: state.user.email || "",
      userRole: state.profile.role || "",
      details: compactActionDetails(details),
      createdAt: serverTimestamp()
    });
    void trackUsageEvent("action_logged", { action, entityType, coachId });
  } catch (error) {
    console.warn("Action log skipped", action, error);
  }
}

async function trackUsageEvent(eventType, details = {}) {
  if (!state.user || !state.profile) return;
  const coachId = cleanString(details.coachId || state.selectedCoachId || state.profile.coachId || "");
  if (!coachId || coachId === "admin") return;
  const cleanDetails = compactUsageDetails(details);
  try {
    await addDoc(collection(db, "usageEvents"), {
      eventType: cleanString(eventType).slice(0, 80),
      coachId,
      actorCoachId: cleanString(state.profile.coachId || ""),
      selectedCoachId: cleanString(state.selectedCoachId || ""),
      userId: state.user.uid,
      userEmail: String(state.user.email || "").toLowerCase(),
      userRole: cleanString(state.profile.role || ""),
      tab: cleanString(cleanDetails.tab || state.tab || ""),
      sessionId: USAGE_SESSION_ID,
      appVersion: APP_VERSION,
      deviceType: usageDeviceType(),
      path: String(window.location.pathname || "/").slice(0, 80),
      details: cleanDetails,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Usage event skipped", eventType, error);
  }
}

function compactUsageDetails(details = {}) {
  const allowed = new Set([
    "action",
    "entityType",
    "modalType",
    "source",
    "tab",
    "coachId",
    "selectedCoachId",
    "hasClientContext",
    "questionnaireType",
    "filter",
    "value"
  ]);
  const clean = {};
  Object.entries(details || {}).forEach(([key, value]) => {
    if (!allowed.has(key) || value === undefined || value === null) return;
    if (typeof value === "boolean") {
      clean[key] = value;
      return;
    }
    if (typeof value === "number") {
      clean[key] = value;
      return;
    }
    clean[key] = cleanString(value).slice(0, 120);
  });
  return clean;
}

function usageDeviceType() {
  if (window.matchMedia?.("(max-width: 760px)")?.matches) return "mobile";
  if (window.matchMedia?.("(max-width: 1024px)")?.matches) return "tablet";
  return "desktop";
}

function compactActionDetails(details) {
  const clean = {};
  Object.entries(details || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      clean[key] = value.slice(0, 20).map((item) => String(item).slice(0, 120));
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      clean[key] = value;
      return;
    }
    clean[key] = String(value).slice(0, 240);
  });
  return clean;
}

async function savePilotAcceptance(data = {}) {
  if (!state.user?.uid || !state.profile) throw new Error("Reconnecte-toi avant d'enregistrer le test.");
  if (isInfoAdmin()) throw new Error("La validation terrain doit etre remplie avec un compte coach.");
  const coachId = String(state.profile.coachId || "");
  const coach = PILOT_COACHES.find((item) => item.id === coachId);
  if (!coach) throw new Error("Ce compte n'est pas relie a un coach pilote actif.");
  const status = ["ready", "ready_with_reservation", "blocked"].includes(data.status)
    ? data.status
    : "ready_with_reservation";
  const checks = {
    checkNavigation: data.checkNavigation === "on",
    checkMission: data.checkMission === "on",
    checkClientFollowup: data.checkClientFollowup === "on",
    checkCrossCoach: data.checkCrossCoach === "on",
    checkCoachRx: data.checkCoachRx === "on",
    checkVoicePlayback: data.checkVoicePlayback === "on",
    checkManualClient: data.checkManualClient === "on",
    checkQuestionnaireDelivery: data.checkQuestionnaireDelivery === "on",
    checkHighVolumeRebooking: data.checkHighVolumeRebooking === "on"
  };
  if (status === "ready" && (!checks.checkNavigation || !checks.checkMission || !checks.checkClientFollowup)) {
    throw new Error("Pour confirmer Pret, valide au minimum la navigation, une mission et un dossier client/suivi.");
  }
  const note = cleanString(data.note || "").slice(0, 300);
  if (status !== "ready" && note.length < 3) {
    throw new Error("Ajoute une courte reserve ou le blocage, sans nom ni donnee client.");
  }
  const environment = pilotAcceptanceEnvironment();
  const recordId = pilotAcceptanceRecordId(environment);
  await setDoc(doc(db, "pilotAcceptances", recordId), {
    userId: state.user.uid,
    userEmail: String(state.user.email || ""),
    coachId,
    coachName: coach.name,
    status,
    note,
    ...checks,
    deviceType: environment.deviceType,
    platform: environment.platform,
    browser: environment.browser,
    authMethod: environment.authMethod,
    appVersion: APP_VERSION,
    validatedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await logAction("pilot.acceptance_submitted", "pilotAcceptances", recordId, {
    coachId,
    status,
    deviceType: environment.deviceType,
    platform: environment.platform,
    browser: environment.browser,
    authMethod: environment.authMethod,
    checksCompleted: Object.values(checks).filter(Boolean).length
  });
  void trackUsageEvent("pilot_acceptance_submitted", {
    source: "guide",
    value: status,
    coachId
  });
  showToast("Validation terrain enregistree.");
}

async function publishAnnouncement(data) {
  requireAdmin();
  const title = cleanString(data.title || "").slice(0, 90);
  const message = cleanString(data.message || "").slice(0, 360);
  const items = String(data.items || "")
    .split(/\r?\n/)
    .map((item) => cleanString(item).slice(0, 180))
    .filter(Boolean)
    .slice(0, 3);
  const importance = ["feature", "important", "critical"].includes(data.importance) ? data.importance : "feature";
  const expiresOn = cleanString(data.expiresOn || "");
  if (!title || !message) throw new Error("Ajoute un titre et un resume avant de publier.");
  if (expiresOn && expiresOn < todayIso()) throw new Error("La date d'expiration doit etre aujourd'hui ou plus tard.");
  await addDoc(collection(db, "announcements"), {
    title,
    message,
    items,
    importance,
    audience: "all",
    status: "published",
    versionTag: APP_VERSION,
    expiresOn,
    createdByUid: state.user.uid,
    createdByEmail: String(state.user.email || "").toLowerCase(),
    createdAt: serverTimestamp(),
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  showToast("Annonce publiee. Elle apparaitra une fois pour chaque coach.");
  closeModal();
}

async function acknowledgeAnnouncement(announcementId) {
  const announcement = state.data.announcements.find((item) => item.id === announcementId);
  if (!announcement || !state.user?.uid) throw new Error("Cette annonce n'est plus disponible.");
  const acknowledgementId = `${announcement.id}_${state.user.uid}`;
  const acknowledgementRef = doc(db, "announcementAcknowledgements", acknowledgementId);
  await setDoc(acknowledgementRef, {
    announcementId: announcement.id,
    userId: state.user.uid,
    userEmail: String(state.user.email || "").toLowerCase(),
    appVersion: APP_VERSION,
    acknowledgedAt: serverTimestamp()
  });
  state.announcementDismissedIds.add(announcement.id);
  void trackUsageEvent("announcement_acknowledged", {
    announcementId: announcement.id,
    importance: announcement.importance || "feature"
  });
  showToast("Mise a jour confirmee.");
  closeModal();
}

async function archiveAnnouncement(announcementId) {
  requireAdmin();
  const announcement = state.data.announcements.find((item) => item.id === announcementId);
  if (!announcement) throw new Error("Annonce introuvable.");
  const confirmed = window.confirm(`Archiver l'annonce « ${announcement.title || "Mise a jour"} »?\n\nElle ne s'affichera plus automatiquement, mais restera visible dans l'historique.`);
  if (!confirmed) return;
  await updateDoc(doc(db, "announcements", announcementId), {
    status: "archived",
    archivedAt: serverTimestamp(),
    archivedByUid: state.user.uid,
    archivedByEmail: String(state.user.email || "").toLowerCase(),
    updatedAt: serverTimestamp()
  });
  showToast("Annonce archivee.");
}

function openModal(modal) {
  if (modal?.type === "quickNote" || modal?.type === "taskEdit") {
    safeResetVoiceRecorder();
  }
  state.modal = {
    ...(modal || {}),
    instanceId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  };
  void trackUsageEvent("modal_opened", {
    modalType: modal?.type || "",
    source: state.tab,
    hasClientContext: Boolean(modal?.clientId || modal?.id),
    questionnaireType: modal?.questionnaireType || ""
  });
  render();
}

function closeModal() {
  const closingModal = state.modal;
  try {
    safeResetVoiceRecorder();
  } finally {
    if (closingModal?.type === "announcement" && closingModal.id && !announcementAcknowledged(closingModal.id)) {
      state.announcementDismissedIds.add(closingModal.id);
    }
    state.modal = null;
    render();
  }
}

function closeModalIfCurrent(instanceId) {
  if (!instanceId || state.modal?.instanceId === instanceId) closeModal();
}

function renderErrors() {
  if (!state.errors.length) return "";
  const isAdminView = isInfoAdmin();
  const recentMessages = state.errors.slice(-6);
  const visibleMessages = uniqueBy(recentMessages.map((message) => isAdminView ? message : coachSafeErrorMessage(message)), (message) => message).slice(-4);
  return `
    <section class="notice error">
      <strong>${isAdminView ? "Diagnostic Firebase" : "Action a verifier"}</strong>
      ${visibleMessages.map((message) => `<p>${escapeHtml(message)}</p>`).join("")}
      ${isAdminView && state.errors.length > visibleMessages.length ? `
        <details>
          <summary>Voir le journal complet</summary>
          ${state.errors.slice(-12).map((message) => `<p>${escapeHtml(message)}</p>`).join("")}
        </details>
      ` : ""}
    </section>
  `;
}

function coachSafeErrorMessage(message) {
  const { label, detail } = coachErrorContext(message);
  const text = detail;
  const prefix = label ? `${label}: ` : "";
  if (!text) return `${prefix}Une action n'a pas pu etre completee. Demande a un admin de verifier dans Guide.`;
  if (/connexion google|connecte|unauthenticated/i.test(text)) {
    return `${prefix}La connexion Google doit etre rafraichie avant de continuer.`;
  }
  if (/telephone|t[ée]l/i.test(text)) {
    return `${prefix}${text
      .replace(/GHL/gi, "l'outil d'envoi")
      .replace(/Firebase|Firestore|Cloud Function|backend|syncRuns|functions\/[a-z-]+/gi, "dashboard")
      .slice(0, 220)}`;
  }
  if (/permission|acces|access|denied/i.test(text)) {
    return `${prefix}Action bloquee avec ton acces actuel. Demande a un admin de verifier si ca revient.`;
  }
  if (/uncaught|referenceerror|typeerror|syntaxerror|is not defined|undefined|null/i.test(text)) {
    return `${prefix}La page n'a pas pu completer cette action. Recharge la page; si ca revient, demande a un admin de verifier.`;
  }
  if (/firebase|firestore|cloud function|backend|index|syncRuns|coachSyncStatus|functions\/|failed-precondition|internal|unavailable/i.test(text)) {
    return `${prefix}Le dashboard n'a pas pu completer cette action. Demande a un admin de verifier dans Guide.`;
  }
  return `${prefix}${text.slice(0, 220)}`;
}

function coachErrorContext(message) {
  const raw = String(message || "").trim();
  const match = raw.match(/^([a-zA-Z][\w-]*):\s*(.+)$/);
  if (!match) return { label: "", detail: raw };
  const label = coachActionErrorLabel(match[1]);
  return { label, detail: match[2].trim() };
}

function coachActionErrorLabel(action) {
  const labels = {
    quickNote: "Creer une mission",
    taskEdit: "Modifier la mission",
    completeTask: "Fermer la mission",
    toggleTaskStar: "Etoiler la mission",
    completeQuestionnaireTask: "Fermer la mission questionnaire",
    ignoreTask: "Masquer la mission",
    client: "Modifier le client",
    clientCreate: "Creer un client",
    clientPhoneFix: "Corriger le telephone",
    moveClientToAlumni: "Passer le client en Alumni",
    deleteClient: "Supprimer le faux client",
    questionnaireSend: "Envoyer le questionnaire",
    sendQuestionnaire: "Envoyer le questionnaire",
    questionnaireSchedule: "Planifier le questionnaire",
    markResponseRead: "Marquer la reponse lue",
    createMissionFromQuestionnaireResponse: "Creer une mission depuis la reponse",
    rebookingCreate: "Ajouter une seance a remettre",
    rebookingLinkClient: "Relier le rebooking",
    rebookedRebooking: "Marquer la seance remise",
    manageRebooking: "Marquer le suivi fait",
    adjustRebookingSessions: "Ajuster les seances",
    transferRebookingCoach: "Transferer le rebooking",
    coachAbsenceRebooking: "Marquer absence coach",
    deleteRebookingError: "Supprimer le rebooking",
    alumniCreate: "Creer un alumni",
    alumniEdit: "Modifier l'alumni",
    reactivateAlumniAsClient: "Ramener l'alumni dans Clients",
    performanceObjective: "Modifier l'objectif",
    pilotageItem: "Ajouter un point de pilotage",
    pilotageNote: "Enregistrer la note de rencontre",
    assistantTaskDraft: "Preparer une mission IA",
    assistantTaskConfirm: "Confirmer la mission IA"
  };
  return labels[action] || "";
}

function renderToast() {
  if (!toastRoot) return;
  toastRoot.textContent = state.toast || "";
  toastRoot.className = state.toast ? "toast show" : "toast";
}

function showToast(message) {
  state.toast = message;
  renderToast();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = "";
    renderToast();
  }, 2600);
}

function shouldLockAction(action) {
  return ![
    "closeModal",
    "reload",
    "selectPerformancePeriod",
    "selectTabMobile",
    "openAnnouncement",
    "openAnnouncementForm",
    "openQuickNote",
    "setQuickNoteMode",
    "resetAssistantTaskDraft",
    "openAssistantCreatedTask",
    "openClientForm",
    "openQuestionnaireSend",
    "openQuestionnaireDetail",
    "openRebookingForm",
    "openTaskEdit",
    "openClientQuestionnaireSend",
    "openClientRebooking",
    "openClientPhoneFix",
    "openPerformanceDetail",
    "openPerformanceNewClientManual",
    "openPilotageItem",
    "openPilotageNote",
    "editPilotageNote",
    "openImpactForm",
    "openAlumniForm",
    "openClient",
    "startVoiceRecording",
    "stopVoiceRecording",
    "playVoicePreview",
    "discardVoiceRecording",
    "playTaskVoice"
  ].includes(action);
}

function beginActionFeedback(element) {
  if (!element) return;
  element.dataset.working = "true";
  element.disabled = true;
  showToast("Action en cours...");
}

function endActionFeedback(element) {
  if (!element || !element.isConnected) return;
  element.dataset.working = "false";
  element.disabled = false;
}

function pushError(message, shouldRender = true) {
  const cleanMessage = String(message || "Erreur inconnue").slice(0, 320);
  if (!state.errors.includes(cleanMessage)) state.errors.push(cleanMessage);
  if (shouldRender && !state.rendering) scheduleRender();
}

function showDataError(section, error) {
  pushError(`${section}: ${humanizeFirebaseError(error)}`);
}

function humanizeFirebaseError(error) {
  const code = error?.code || "erreur";
  const message = error?.message || "";
  const details = firebaseErrorDetails(error);
  if (code === "failed-precondition" && message.includes("indexes")) {
    return "Index Firestore manquant. Publie les indexes avec firebase deploy --only firestore:indexes.";
  }
  if (code === "permission-denied") {
    const detail = String(message || details || "").trim();
    return detail
      ? `Permission refusee. ${detail}`.slice(0, 300)
      : "Permission refusee. Verifie ton acces Firestore ou le coach selectionne.";
  }
  if (code === "auth/operation-not-allowed") {
    return "La connexion courriel + mot de passe n'est pas encore activee dans Firebase Authentication.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Courriel ou mot de passe invalide. Verifie le compte ou utilise Mot de passe oublie.";
  }
  if (code === "auth/too-many-requests") {
    return "Trop de tentatives de connexion. Attends quelques minutes ou reinitialise le mot de passe.";
  }
  if (code === "auth/invalid-email") {
    return "Courriel invalide. Verifie l'adresse entree.";
  }
  if (code === "unavailable") {
    return "Firebase temporairement indisponible. Reessaie dans quelques secondes.";
  }
  if (code === "functions/not-found") {
    return "Cloud Function non deployee. Deploie les Functions Firebase.";
  }
  if (code === "functions/permission-denied") {
    return "Permission refusee par la Cloud Function. Verifie l'acces du coach.";
  }
  if (code === "functions/failed-precondition") {
    return message || details || "Configuration requise avant l'action.";
  }
  if (code === "functions/invalid-argument") {
    return message || details || "Le vocal ou la mission contient une valeur invalide.";
  }
  if (code === "functions/not-found") {
    return message || details || "La mission ou le client n'existe plus.";
  }
  if (code === "functions/deadline-exceeded") {
    return "La sauvegarde du vocal a pris trop de temps. Reessaie: le meme identifiant empechera un doublon.";
  }
  if (code === "functions/internal" || code === "internal") {
    const stage = error?.details?.stage ? ` Etape: ${error.details.stage}.` : "";
    return `${details || message || "Erreur interne du backend."}${stage}`.slice(0, 320);
  }
  if (code === "functions/unauthenticated") {
    return "Connexion Google requise pour appeler le backend.";
  }
  return `${code} ${message || details}`.trim();
}

function firebaseErrorDetails(error) {
  const candidates = [
    error?.details?.message,
    error?.customData?.serverResponse,
    error?.message
  ];
  for (const candidate of candidates) {
    const cleaned = String(candidate || "").trim();
    if (cleaned && !/^Firebase: Error \(functions\/internal\)\.?$/i.test(cleaned)) {
      return cleaned.slice(0, 360);
    }
  }
  return "";
}

function filterButton(group, value, label, count) {
  const active = state.filter[group] === value;
  return `<button class="chip ${active ? "active" : ""}" data-filter="${group}" data-value="${value}">${label} <span>${count}</span></button>`;
}

function filterSelect(group, label, options) {
  const values = options.map(([value]) => value);
  const current = state.filter[group] || values[0] || "";
  const active = values.includes(current) ? current : values[0] || "";
  return `
    <label class="view-select-row">
      <span>${escapeHtml(label)}</span>
      <select class="input view-select" data-filter-select="${escapeAttr(group)}">
        ${options.map(([value, optionLabel, count]) => `
          <option value="${escapeAttr(value)}" ${active === value ? "selected" : ""}>
            ${escapeHtml(optionLabel)} (${Number(count || 0)})
          </option>
        `).join("")}
      </select>
    </label>
  `;
}

function clientStatus(client) {
  return client?.status || "manual";
}

function isActiveClient(client) {
  return ![
    "removed",
    "archived",
    "alumni",
    "do_not_contact",
    "import_stale",
    "ownership_quarantine",
    "deleted"
  ].includes(clientStatus(client));
}

function clientEntityType(client = {}) {
  const value = String(client.entityType || "").trim().toLowerCase();
  return ["member", "staff", "unknown"].includes(value) ? value : "unknown";
}

function clientOwnershipStatus(client = {}) {
  const value = String(client.ownershipStatus || "").trim().toLowerCase();
  return ["confirmed", "needs_review", "quarantined"].includes(value) ? value : "needs_review";
}

function clientIsSelectableForCoach(client = {}, coachId = state.selectedCoachId) {
  return client.clientSelectable === true
    && isActiveClient(client)
    && clientEntityType(client) === "member"
    && clientOwnershipStatus(client) === "confirmed"
    && firestoreItemBelongsToCoach(client, coachId);
}

function selectableClientsForCoach(coachId = state.selectedCoachId, clients = state.data.clients) {
  const ownedMembers = clients.filter((client) => clientIsSelectableForCoach(client, coachId));
  return dedupeClients(ownedMembers)
    .sort((a, b) => String(a.lastNameSort || a.name || "").localeCompare(String(b.lastNameSort || b.name || "")));
}

function selectableClientForCoach(clientId, coachId = state.selectedCoachId) {
  const cleanClientId = String(clientId || "").trim();
  if (!cleanClientId) return null;
  return selectableClientsForCoach(coachId)
    .find((client) => String(client.id || "") === cleanClientId)
    || null;
}

function requireSelectableClientForCoach(clientId, coachId = state.selectedCoachId) {
  const client = selectableClientForCoach(clientId, coachId);
  if (!client) {
    throw new Error("Ce client n'est pas un membre confirme du portefeuille actuel.");
  }
  return client;
}

function activeClients() {
  return selectableClientsForCoach();
}

function operationalRecordClientLinkStatus(record = {}, coachId = state.selectedCoachId) {
  const clientId = String(record.clientId || "").trim();
  if (clientId) {
    return selectableClientForCoach(clientId, coachId) ? "confirmed" : "blocked";
  }
  return "unlinked";
}

function operationalRecordHasSafeClientLink(record = {}, coachId = state.selectedCoachId) {
  return operationalRecordClientLinkStatus(record, coachId) !== "blocked";
}

function portfolioOperationalRecords(items = [], coachId = state.selectedCoachId, { allowUnlinked = true } = {}) {
  return items.filter((item) => {
    const linkStatus = operationalRecordClientLinkStatus(item, coachId);
    return linkStatus === "confirmed" || (allowUnlinked && linkStatus === "unlinked");
  });
}

function operationalTaskById(taskId) {
  const cleanTaskId = String(taskId || "").trim();
  if (!cleanTaskId) return null;
  return state.data.tasks.find((item) => String(item.id || "") === cleanTaskId && operationalRecordHasSafeClientLink(item)) || null;
}

function portfolioQuestionnaireResponses() {
  return portfolioOperationalRecords(state.data.questionnaireResponses || [], state.selectedCoachId, { allowUnlinked: false });
}

function questionnaireResponsesForAdminReview() {
  if (!isInfoAdmin()) return [];
  return (state.data.questionnaireResponses || [])
    .filter((item) => operationalRecordClientLinkStatus(item) === "unlinked");
}

function questionnaireResponseForAdminLinking(responseId) {
  if (!isInfoAdmin()) return null;
  const cleanResponseId = String(responseId || "").trim();
  if (!cleanResponseId) return null;
  return uniqueById([
    ...questionnaireResponsesForAdminReview(),
    ...portfolioQuestionnaireResponses().filter((item) => (item.processingStatus || "") === "unmatched")
  ]).find((item) => String(item.id || "") === cleanResponseId) || null;
}

function portfolioQuestionnaireSends() {
  return portfolioOperationalRecords(state.data.questionnaireSends || [], state.selectedCoachId, { allowUnlinked: false });
}

function portfolioQuestionnaireSchedules() {
  return portfolioOperationalRecords(state.data.questionnaireSchedules || [], state.selectedCoachId, { allowUnlinked: false });
}

function portfolioRebookings() {
  return portfolioOperationalRecords(state.data.rebookings || []);
}

function portfolioCheckups() {
  return portfolioOperationalRecords(state.data.checkups || []);
}

function portfolioImpacts() {
  return portfolioOperationalRecords(state.data.impacts || []);
}

function blockedOperationalRecordsByCollection() {
  const collections = {
    tasks: state.data.tasks || [],
    questionnaireResponses: state.data.questionnaireResponses || [],
    questionnaireSends: state.data.questionnaireSends || [],
    questionnaireSchedules: state.data.questionnaireSchedules || [],
    rebookings: state.data.rebookings || [],
    checkups: state.data.checkups || [],
    impacts: state.data.impacts || []
  };
  return Object.entries(collections)
    .map(([collectionName, items]) => ({
      collectionName,
      count: items.filter((item) => {
        const linkStatus = operationalRecordClientLinkStatus(item);
        const requiresConfirmedLink = ["questionnaireResponses", "questionnaireSends", "questionnaireSchedules"].includes(collectionName);
        return linkStatus === "blocked" || (requiresConfirmedLink && linkStatus === "unlinked");
      }).length
    }))
    .filter((item) => item.count > 0);
}

function clientPhone(client) {
  return normalizePhone(
    client?.phoneNormalized
    || client?.clientPhoneNormalized
    || client?.client_phone_normalized
    || client?.phone
    || client?.clientPhone
    || client?.telephone
    || client?.mobile
    || ""
  );
}

function questionnaireResponsePhone(response) {
  return normalizePhone(
    response?.clientPhoneNormalized
    || response?.phoneNormalized
    || response?.client_phone_normalized
    || response?.clientPhone
    || response?.phone
    || ""
  );
}

function questionnaireSendPhone(send) {
  return normalizePhone(
    send?.clientPhoneNormalized
    || send?.phoneNormalized
    || send?.client_phone_normalized
    || send?.clientPhone
    || send?.phone
    || ""
  );
}

function questionnaireSendDate(send) {
  return dateValue(send?.sentAt || send?.preparedAt || send?.createdAt);
}

function questionnaireSendHasResponse(send, responses = portfolioQuestionnaireResponses()) {
  const sendClientId = String(send?.clientId || "").trim();
  if (!sendClientId) return false;
  const sentAt = questionnaireSendDate(send);
  return portfolioOperationalRecords(responses, state.selectedCoachId, { allowUnlinked: false }).some((response) => {
    const responseClientId = String(response?.clientId || "").trim();
    if (!responseClientId || responseClientId !== sendClientId) return false;
    const submittedAt = dateValue(response.submittedAt || response.receivedAt || response.createdAt);
    if (!sentAt || !submittedAt) return true;
    return submittedAt >= sentAt;
  });
}

function dedupeClients(clients) {
  const byIdentity = new Map();
  clients.forEach((client) => {
    const phone = clientPhone(client);
    const sourceClientId = String(client.sourceClientId || client.clientId || client.contactId || "").trim();
    const name = normalizeComparable(client.name || client.clientName || "");
    const key = phone
      ? `phone:${phone}`
      : sourceClientId
        ? `source:${sourceClientId}`
        : name
          ? `name:${name}`
          : `id:${client.id}`;
    const existing = byIdentity.get(key);
    if (!existing || clientRecordRank(client) > clientRecordRank(existing)) {
      byIdentity.set(key, client);
    }
  });
  return [...byIdentity.values()];
}

function clientRecordRank(client) {
  return (isActiveClient(client) ? 100 : 0)
    + (clientPhone(client) ? 20 : 0)
    + (client.sourceClientId ? 12 : 0)
    + (client.membershipLabel ? 10 : 0)
    + (client.manualMembershipEndDate ? 5 : 0)
    + (client.kiloPlannedRecurrenceEndDate ? 5 : 0)
    + (client.riskLevel && client.riskLevel !== "none" ? 3 : 0)
    + (client.source === "manual" ? 2 : 0);
}

function clientValidationSummary(client) {
  if (!client) return null;
  if (client.coachRxRequiresValidation || client.clientValidationStatus === "needs_review") {
    return {
      level: "amber",
      label: "Fiche a valider"
    };
  }
  if (client.clientValidationStatus === "ready" || client.coachRxPortfolioStatus === "present_in_coachrx") {
    return {
      level: "green",
      label: "Portefeuille confirme"
    };
  }
  if (client.source === "firebase_app_manual" || client.source === "manual") {
    return {
      level: "warning",
      label: "Client manuel"
    };
  }
  return null;
}

function coachRxPortfolioLabel(value) {
  if (value === "present_in_coachrx") return "Present dans CoachRx";
  return value || "Non confirme";
}

function coachRxProgramSummary(client) {
  const context = client?.coachRxProgramContext || {};
  const exerciseDue = context.exerciseDue || client?.coachRxExerciseDue;
  const lifestyleDue = context.lifestyleDue || client?.coachRxLifestyleDue;
  const compliance = context.exerciseCompliance || client?.exerciseCompliance;
  const pieces = [];
  if (exerciseDue) pieces.push(`Exercice: ${exerciseDue}`);
  if (lifestyleDue) pieces.push(`Lifestyle: ${lifestyleDue}`);
  if (compliance) pieces.push(`Compliance: ${compliance}`);
  if (!pieces.length) return "";
  return `CoachRx: ${pieces.join(" | ")}`;
}

function clientIdentityWarnings(client, isAdminView = false) {
  const warnings = [];
  const phone = clientPhone(client);
  if (!phone) {
    warnings.push(isAdminView
      ? "Aucun telephone normalise. Le lien avec Questionnaire, GHL et CoachRx sera fragile tant que ce champ reste vide."
      : "Telephone a ajouter pour relier les questionnaires, les suivis et les prochains contacts.");
  }
  if (isAdminView && !client.sourceClientId && client.source !== "firebase_app_manual") {
    warnings.push("Aucun ID source detecte. Le telephone devient la seule cle fiable pour eviter les doublons.");
  }
  if (client.status === "manual" && !phone) {
    warnings.push(isAdminView
      ? "Client manuel sans telephone: si CoachRx l'importe plus tard avec un telephone, il pourrait apparaitre comme une deuxieme fiche."
      : "Client ajoute manuellement: complete le telephone si possible.");
  }
  if (client.coachRxRequiresValidation) {
    warnings.push(client.recommendedAdminAction || "Client present dans CoachRx, mais son statut actif/membership doit etre confirme avant de le traiter comme valide.");
  }
  if (isAdminView && Array.isArray(client.coachRxValidationReasons)) {
    client.coachRxValidationReasons.forEach((reason) => {
      if (reason) warnings.push(`CoachRx: ${reason}.`);
    });
  }
  if (client.coachRxProgramContext?.exerciseSignal?.actionable || client.coachRxProgramContext?.lifestyleSignal?.actionable) {
    warnings.push("CoachRx indique un programme a traiter; une mission devrait apparaitre dans la To-do si le signal est rouge ou jaune.");
  }
  return warnings;
}

function clientIdentitySummary(client, isAdminView = false) {
  const phone = clientPhone(client);
  const sourceClientId = String(client.sourceClientId || client.clientId || client.contactId || "").trim();
  if (phone) {
    return {
      level: "good",
      label: "Telephone fiable",
      primaryKey: isAdminView ? `Cle principale: telephone ${phone}` : `Telephone confirme: ${phone}`,
      matchMethod: "telephone"
    };
  }
  if (sourceClientId) {
    return {
      level: "warning",
      label: "Sans telephone",
      primaryKey: isAdminView ? `Cle temporaire: ID source ${sourceClientId}` : "Telephone a ajouter pour fiabiliser la fiche.",
      matchMethod: "id source"
    };
  }
  return {
    level: "danger",
    label: isAdminView ? "Identite fragile" : "Telephone requis",
    primaryKey: isAdminView ? "Aucune cle forte: ajoute un telephone pour eviter les doublons." : "Ajoute un telephone pour relier cette fiche aux suivis.",
    matchMethod: "nom seulement"
  };
}

function clientSyncSummary(client) {
  const source = sourceLabel(client.source);
  const phone = clientPhone(client);
  const updatedAt = formatDateTime(client.updatedFromSheetsAt || client.sourceUpdatedAt || client.updatedAt);
  const pieces = [`Origine actuelle: ${source}.`];
  if (phone) {
    pieces.push("Le telephone est utilise comme identifiant principal pour lier CoachRx, CSM, Questionnaires et GHL.");
  } else {
    pieces.push("Sans telephone, les liens avec Questionnaire et GHL restent limites et doivent etre valides manuellement.");
  }
  if (client.linkedFromManual || client.matchedExistingClientBy) {
    pieces.push(`Fusion deja detectee: ${client.matchedExistingClientBy || "client manuel lie a l'import"}.`);
  }
  if (client.coachRxPortfolioStatus === "present_in_coachrx") {
    pieces.push("CoachRx confirme la presence dans le portefeuille du coach, mais pas a lui seul un membership actif; la validation vient du telephone, du membership et des sources CSM/GHL.");
  }
  if (client.coachRxRequiresValidation) {
    pieces.push(client.recommendedAdminAction || "Validation requise avant de garder ce client comme actif.");
  }
  if (updatedAt && updatedAt !== "-") {
    pieces.push(`Derniere mise a jour connue: ${updatedAt}.`);
  }
  return pieces.join(" ");
}

function sourceLabel(source) {
  const labels = {
    firebase_app_manual: "Ajout manuel dashboard",
    manual: "Ajout manuel dashboard",
    google_sheets_core_clients: "Google Sheets CORE_Clients",
    google_sheets_coachrx_browser: "Import CoachRx",
    google_sheets_tasks_current: "TASKS_Current",
    google_sheets_questionnaire_responses: "Questionnaire client-coach",
    google_sheets_rebooking_semiprive: "Rebooking semi-prive",
    coachrx_exercise_due: "Signal programme CoachRx",
    direct_coachrx_extension: "Import direct CoachRx",
    direct_client_directory: "Repertoire clients direct",
    direct_ghl_contacts: "GoHighLevel",
    direct_questionnaire: "Questionnaire direct",
    direct_rebooking_appscript: "Rebooking App Script",
    direct_csm_checkups: "Check-ups CSM"
  };
  return labels[source] || source || "Non precisee";
}

function membershipSourceLabel(client = {}) {
  const source = String(client.membershipSource || client.membershipUpdatedFrom || client.lastDirectEnrichmentSource || client.source || "").trim();
  const key = source.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!source) return "Source a valider";
  if (key.includes("csm") || key.includes("clientenrichment")) return "Source: CSM";
  if (key.includes("dashboardmanual") || key.includes("firebaseappmanual")) return "Source: manuel";
  if (key.includes("coreclients") || key.includes("clientdirectory")) return "Source: repertoire client";
  if (key.includes("coachrx")) return "Source: CoachRx a valider";
  if (key.includes("ghl")) return "Source: GHL";
  return `Source: ${sourceLabel(source)}`;
}

function stableClientId(coachId, data) {
  const phone = clientPhone(data);
  const name = slugify(data.name || data.clientName || "client");
  return `${coachId}_${phone || name}`;
}

function activeCoachRecord() {
  return coachRecordById(state.selectedCoachId);
}

function latestSendForClient(clientId) {
  return portfolioQuestionnaireSends()
    .filter((send) => send.clientId === clientId)
    .sort((a, b) => questionnaireSendDate(b) - questionnaireSendDate(a))[0];
}

function schedulesForClient(clientId) {
  return portfolioQuestionnaireSchedules()
    .filter((schedule) => schedule.clientId === clientId)
    .sort((a, b) => questionnaireTypeLabel(a.questionnaireType).localeCompare(questionnaireTypeLabel(b.questionnaireType)));
}

function scheduleForClient(clientId, questionnaireType = "") {
  const schedules = schedulesForClient(clientId);
  if (questionnaireType) {
    const found = schedules.find((schedule) => (schedule.questionnaireType || DEFAULT_QUESTIONNAIRE_TYPE) === questionnaireType);
    if (found) return found;
  }
  return schedules.find((schedule) => (schedule.questionnaireType || DEFAULT_QUESTIONNAIRE_TYPE) === DEFAULT_QUESTIONNAIRE_TYPE) || schedules[0];
}

function questionnaireScheduleId(coachId, clientId, questionnaireType = DEFAULT_QUESTIONNAIRE_TYPE) {
  return `${String(coachId || state.selectedCoachId || "coach").trim()}_${String(clientId || "client").trim()}_${String(questionnaireType || DEFAULT_QUESTIONNAIRE_TYPE).trim()}`.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 140);
}

function sanitizeQuestionnaireScheduleFrequency(value) {
  const clean = String(value || "").trim();
  if (["once", "weekly", "every_2_weeks", "monthly", "every_4_weeks", "quarterly"].includes(clean)) return clean;
  return "monthly";
}

function questionnaireScheduleFrequencyLabel(value) {
  const labels = {
    once: "Une fois",
    weekly: "Chaque semaine",
    every_2_weeks: "Aux 2 semaines",
    monthly: "Mensuel",
    every_4_weeks: "Aux 4 semaines",
    quarterly: "Aux 3 mois"
  };
  return labels[value] || "Mensuel";
}

function questionnaireScheduleFrequencyOptions(current) {
  return ["once", "weekly", "every_2_weeks", "monthly", "every_4_weeks", "quarterly"].map((value) => `
    <option value="${escapeAttr(value)}" ${value === current ? "selected" : ""}>${escapeHtml(questionnaireScheduleFrequencyLabel(value))}</option>
  `).join("");
}

function questionnaireScheduleStatusLabel(schedule) {
  const status = (schedule.status || "active") === "active" ? "actif" : "pause";
  return `${questionnaireScheduleFrequencyLabel(schedule.frequency)} · ${status} · prochain ${formatDate(schedule.nextSendAt)}`;
}

function sortTasks(a, b) {
  return Number(isStarredTask(b)) - Number(isStarredTask(a))
    || (a.priorityRank || 9) - (b.priorityRank || 9)
    || dateValue(a.dueAt) - dateValue(b.dueAt)
    || String(a.title || "").localeCompare(String(b.title || ""));
}

function periodFiltered(items, field, options = {}) {
  const now = new Date();
  const period = state.filter.performancePeriod;
  const fallbackCreatedAt = options.fallbackCreatedAt !== false;
  return items.filter((item) => {
    const value = dateValue(item[field] || (fallbackCreatedAt ? item.createdAt : ""));
    if (!value) return false;
    const date = new Date(value);
    if (period === "month") return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    if (period === "last_month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return date >= start && date < end;
    }
    const days = period === "7d" ? 7 : period === "60d" ? 60 : period === "6m" ? 183 : period === "12m" ? 365 : 30;
    return now - date <= days * 24 * 60 * 60 * 1000;
  });
}

function currentWeekRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function currentWeekFiltered(items, field, options = {}) {
  const { start, end } = currentWeekRange();
  const fallbackCreatedAt = options.fallbackCreatedAt !== false;
  return items.filter((item) => {
    const value = dateValue(item[field] || (fallbackCreatedAt ? item.createdAt : ""));
    return Boolean(value && value >= start.getTime() && value < end.getTime());
  });
}

function currentWeekLabel() {
  const { start, end } = currentWeekRange();
  const lastDay = new Date(end);
  lastDay.setDate(lastDay.getDate() - 1);
  return `${formatDate(start)} au ${formatDate(lastDay)}`;
}

function questionnaireResponseType(response) {
  const raw = response.questionnaireType || questionnaireAnswer(response, "questionnaire_type") || DEFAULT_QUESTIONNAIRE_TYPE;
  return questionnaireTypeConfig(raw)?.type || DEFAULT_QUESTIONNAIRE_TYPE;
}

function questionnaireAnswer(response, key) {
  const answers = response?.answers || {};
  const direct = answers[key];
  if (Array.isArray(direct)) return direct.filter(Boolean).join(", ");
  if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct).trim();
  const other = Array.isArray(answers.other_responses) ? answers.other_responses : [];
  const wanted = new Set([
    keyOf(key),
    keyOf(key.replace(/_/g, " ")),
    keyOf(questionnaireSignalLabel(key))
  ]);
  const found = other.find((item) => wanted.has(keyOf(item?.label || "")));
  return found?.value ? String(found.value).trim() : "";
}

function questionnaireDigest(response, highlights = questionnaireHighlights(response), priority = questionnairePrioritySummary(response, highlights)) {
  const type = questionnaireResponseType(response);
  if (type === "habitudes_quotidiennes") return questionnaireHabitsDigest(response, priority);
  if (type === "evaluation_habitudes_vie") return questionnaireLifestyleDigest(response, priority);
  return questionnaireGlobalDigest(response, highlights, priority);
}

function questionnaireGlobalDigest(response, highlights, priority) {
  const focus = [
    questionnaireAnswer(response, "goal_status") ? `Objectif: ${questionnaireAnswer(response, "goal_status")}` : "",
    questionnaireAnswer(response, "program_fit") ? `Programme: ${questionnaireAnswer(response, "program_fit")}` : "",
    questionnaireAnswer(response, "pain_status") ? `Douleur: ${questionnaireAnswer(response, "pain_status")}` : ""
  ].filter(Boolean).slice(0, 3);
  const cards = [
    { label: "Motivation", value: questionnaireAnswer(response, "motivation_level") },
    { label: "Progression", value: questionnaireAnswer(response, "progress_toward_goal") },
    { label: "Support", value: questionnaireAnswer(response, "support_needed") },
    { label: "Note", value: questionnaireAnswer(response, "open_note") }
  ].filter((item) => item.value).slice(0, 4);
  return {
    typeLabel: questionnaireTypeLabel(response.questionnaireType || questionnaireAnswer(response, "questionnaire_type")),
    headline: questionnaireActionHeadline(response),
    summary: highlights[0]?.reason || priority.reason,
    nextAction: priority.nextStep,
    focus,
    cards
  };
}

function questionnaireHabitsDigest(response, priority) {
  const weak = [];
  const addIf = (condition, text) => { if (condition) weak.push(text); };
  const water = questionnaireAnswer(response, "habits_water");
  addIf(/moins|1 l|je ne sais/i.test(water), "Hydratation a verifier");
  addIf(/variable|non|difficile/i.test(questionnaireAnswer(response, "habits_rhythm")), "Rythme quotidien instable");
  addIf(/quelques|rarement|non/i.test(questionnaireAnswer(response, "habits_movement30")), "Mouvement quotidien a soutenir");
  addIf(/parfois|rarement|non/i.test(questionnaireAnswer(response, "habits_sleep7")), "Sommeil a surveiller");
  addIf(/pas toujours|non/i.test(questionnaireAnswer(response, "habits_bowel_daily")), "Routine digestion a clarifier");
  const priorityText = questionnaireAnswer(response, "habits_priority");
  const support = questionnaireAnswer(response, "habits_support");
  return {
    typeLabel: "Check-in",
    headline: weak.length ? "Habitude a soutenir" : "Habitudes globalement stables",
    summary: weak.length
      ? `${weak.slice(0, 2).join(" · ")}${priorityText ? ` · Priorite client: ${priorityText}` : ""}`
      : (priorityText ? `Priorite client: ${priorityText}` : "Aucun signal majeur dans les habitudes de base."),
    nextAction: /rapid/i.test(support)
      ? "Contacter le client ou traiter rapidement."
      : /prochaine|seance/i.test(support)
        ? "En parler a la prochaine seance."
        : priority.nextStep,
    focus: [questionnaireAnswer(response, "habits_focus"), priorityText, support].filter(Boolean).slice(0, 3),
    cards: [
      { label: "Priorites", value: questionnaireAnswer(response, "habits_priorities") },
      { label: "Rythme", value: questionnaireAnswer(response, "habits_rhythm") },
      { label: "Eau", value: water },
      { label: "Sommeil", value: questionnaireAnswer(response, "habits_sleep7") }
    ].filter((item) => item.value)
  };
}

function questionnaireLifestyleDigest(response, priority) {
  const concerns = [];
  const addIf = (condition, text) => { if (condition) concerns.push(text); };
  addIf(/moins de 5|5 a 6|5 à 6/i.test(questionnaireAnswer(response, "eval_sleep")), "Sommeil limite");
  addIf(/difficile|variable/i.test(questionnaireAnswer(response, "eval_sleep_quality")), "Qualite du sommeil a clarifier");
  addIf(/eleve|élevé|tres|très/i.test(questionnaireAnswer(response, "eval_stress")), "Stress eleve");
  addIf(/importante|legere|légère|oui/i.test(questionnaireAnswer(response, "eval_pain")), "Douleur ou limitation a verifier");
  addIf(/ameliorer|je ne sais|variable|rarement|parfois/i.test([
    questionnaireAnswer(response, "eval_hydration"),
    questionnaireAnswer(response, "eval_protein"),
    questionnaireAnswer(response, "eval_fruits_vegetables")
  ].join(" ")), "Habitudes nutrition a soutenir");
  const commitment = questionnaireAnswer(response, "eval_commitment");
  const contact = questionnaireAnswer(response, "eval_contact");
  return {
    typeLabel: "Evaluation habitudes de vie",
    headline: concerns.length ? "Levier prioritaire a clarifier" : "Portrait habitudes stable",
    summary: concerns.length
      ? `${concerns.slice(0, 2).join(" · ")}${commitment ? ` · Action client: ${commitment}` : ""}`
      : (commitment ? `Action client proposee: ${commitment}` : "Lire le portrait et garder le contexte pour le prochain suivi."),
    nextAction: /rapid/i.test(contact)
      ? "Contacter le client rapidement."
      : /prochaine|seance/i.test(contact)
        ? "Reprendre ce point a la prochaine seance."
        : priority.nextStep,
    focus: [
      questionnaireAnswer(response, "eval_next_focus"),
      questionnaireAnswer(response, "eval_obstacles"),
      questionnaireAnswer(response, "eval_main_goal")
    ].filter(Boolean).slice(0, 3),
    cards: [
      { label: "Objectif", value: questionnaireAnswer(response, "eval_main_goal") },
      { label: "Sommeil", value: questionnaireAnswer(response, "eval_sleep") },
      { label: "Stress", value: questionnaireAnswer(response, "eval_stress") },
      { label: "Action", value: commitment }
    ].filter((item) => item.value)
  };
}

function questionnaireFieldValue(response, key) {
  if (key === "followup_type") return String(response.followupType || questionnaireAnswer(response, key) || "").trim();
  if (key === "contact_request") return String(response.contactRequest || questionnaireAnswer(response, key) || "").trim();
  return questionnaireAnswer(response, key);
}

function questionnaireSignalForField(highlights, key) {
  const aliases = key === "contact_request" ? [key, "contactRequest"] : [key];
  return highlights.find((item) => aliases.includes(item.key));
}

function questionnaireUnknownAnswers(response, schema) {
  const answers = response.answers || {};
  const usedKeys = new Set(schema.sections.flatMap((section) => section.fields.map(([key]) => key)));
  const ignoredKeys = new Set(["questionnaire_type", "questionnaire_label", "other_responses"]);
  const seen = new Set();
  const unknown = [];
  const add = (label, value) => {
    const cleanLabel = String(label || "").trim();
    const cleanValue = Array.isArray(value)
      ? value.filter(Boolean).join(", ")
      : String(value ?? "").trim();
    if (!cleanLabel || !cleanValue) return;
    const signature = `${keyOf(cleanLabel)}::${keyOf(cleanValue)}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    unknown.push({ label: cleanLabel, value: cleanValue });
  };

  Object.entries(answers).forEach(([key, value]) => {
    if (usedKeys.has(key) || ignoredKeys.has(key)) return;
    add(questionnaireSignalLabel(key), value);
  });
  if (Array.isArray(answers.other_responses)) {
    answers.other_responses.forEach((item) => add(item?.label, item?.value));
  }
  return unknown;
}

function renderQuestionnaireResponseRow(question, value, signal) {
  return `
    <div class="questionnaire-response-row ${signal ? `signal ${escapeAttr(signal.level)}` : ""}">
      <div class="questionnaire-response-question">${escapeHtml(question)}</div>
      <div class="questionnaire-response-value">${escapeHtml(value)}</div>
      ${signal ? `<div class="questionnaire-response-signal">${escapeHtml(signal.reason || "Reponse a verifier")}</div>` : ""}
    </div>
  `;
}

function renderQuestionnaireStructuredAnswers(response, highlights = questionnaireHighlights(response)) {
  const schema = QUESTIONNAIRE_READING_SCHEMAS[questionnaireResponseType(response)] || QUESTIONNAIRE_READING_SCHEMAS.suivi_global;
  const sections = schema.sections.map((section) => {
    const rows = section.fields.map(([key, question]) => {
      const value = questionnaireFieldValue(response, key);
      if (!value) return "";
      return renderQuestionnaireResponseRow(question, value, questionnaireSignalForField(highlights, key));
    }).filter(Boolean);
    if (!rows.length) return "";
    return `
      <section class="questionnaire-response-section">
        <h4>${escapeHtml(section.title)}</h4>
        <div class="questionnaire-response-list">${rows.join("")}</div>
      </section>
    `;
  }).filter(Boolean);
  const unknown = questionnaireUnknownAnswers(response, schema);
  const unknownSection = unknown.length ? `
    <details class="questionnaire-response-other">
      <summary>Autres reponses (${unknown.length})</summary>
      <div class="questionnaire-response-list">
        ${unknown.map((item) => renderQuestionnaireResponseRow(item.label, item.value, null)).join("")}
      </div>
    </details>
  ` : "";
  return `
    <section class="questionnaire-response-sheet">
      <header>
        <div>
          <span>Questionnaire rempli</span>
          <h3>${escapeHtml(schema.label)}</h3>
        </div>
        <small>${sections.length} section${sections.length > 1 ? "s" : ""}</small>
      </header>
      ${sections.length ? sections.join("") : '<p class="empty compact">Aucune reponse structuree disponible.</p>'}
      ${unknownSection}
    </section>
  `;
}

function renderAnswerSummary(response, highlights = questionnaireHighlights(response)) {
  return renderQuestionnaireStructuredAnswers(response, highlights);
}

function questionnaireHighlights(response) {
  const answers = response.answers || {};
  const status = response.triageStatus || "";
  const signals = [];
  const add = (key, level, reason, value = answers[key]) => {
    if (!value || signals.some((signal) => signal.key === key)) return;
    signals.push({
      key,
      level,
      label: questionnaireSignalLabel(key),
      reason,
      value: String(value).slice(0, 180)
    });
  };

  const statusLevel = status === "rouge" ? "red" : status === "orange" ? "orange" : status === "jaune" ? "amber" : "green";
  if (status === "rouge") add("triageStatus", "red", "Triage global prioritaire", response.triageStatus);
  if (status === "orange") add("triageStatus", "orange", "Triage global a discuter", response.triageStatus);
  if (status === "jaune") add("triageStatus", "amber", "Triage global a valider", response.triageStatus);

  const fieldRules = [
    ["contactRequest", "red", /oui|yes|contact|appel|rapid|urgent/i, "Le client demande un contact."],
    ["pain_status", "red", /oui|yes|douleur|mal|limitation|bless|injur|aigu/i, "Douleur ou limitation a verifier."],
    ["pain_detail", "red", /douleur|mal|limitation|bless|injur|aigu|dos|epaule|genou/i, "Detail douleur a lire."],
    ["motivation_level", "orange", /bas|basse|faible|low|1|2|difficile|perdu/i, "Motivation fragile."],
    ["results_satisfaction_score", "orange", /1|2|3|insatisf|faible|bas|basse|low/i, "Satisfaction resultats basse."],
    ["coach_alignment_score", "orange", /1|2|3|pas|non|faible|confus|compris/i, "Alignement coach/client a clarifier."],
    ["goal_status", "orange", /change|changé|changer|pas clair|flou|non|nouveau|different/i, "Objectif a clarifier."],
    ["goal_change_detail", "orange", /.+/i, "Detail de changement d'objectif."],
    ["progress_toward_goal", "orange", /lent|pas|non|bloqu|stagne|regress|difficile/i, "Progression a discuter."],
    ["program_fit", "amber", /pas|non|peu|moins|difficile|adapte|ajust|variete|variété/i, "Programme a ajuster ou valider."],
    ["program_adjustment_detail", "amber", /.+/i, "Demande d'ajustement programme."],
    ["support_needed", "amber", /oui|yes|besoin|support|aide|accompagnement/i, "Support demande."],
    ["current_challenges", "amber", /.+/i, "Defi actuel mentionne."],
    ["improvements_requested", "amber", /.+/i, "Amelioration demandee."],
    ["habits_rhythm", "amber", /variable|non|difficile/i, "Rythme quotidien a clarifier."],
    ["habits_water", "amber", /moins|1 l|je ne sais/i, "Hydratation a verifier."],
    ["habits_movement30", "amber", /quelques|rarement|non/i, "Mouvement quotidien a soutenir."],
    ["habits_sleep7", "amber", /parfois|rarement|non/i, "Sommeil a surveiller."],
    ["habits_support", "amber", /seance|séance|rappel|contact|rapid/i, "Support coach souhaite."],
    ["habits_priority", "amber", /.+/i, "Priorite client mentionnee."],
    ["eval_sleep", "orange", /moins de 5|5 a 6|5 à 6/i, "Sommeil limite."],
    ["eval_sleep_quality", "amber", /difficile|variable/i, "Qualite du sommeil a clarifier."],
    ["eval_stress", "orange", /eleve|élevé|tres|très/i, "Stress eleve."],
    ["eval_pain", "orange", /oui|douleur|importante|legere|légère/i, "Douleur ou limitation a verifier."],
    ["eval_hydration", "amber", /ameliorer|je ne sais/i, "Hydratation a soutenir."],
    ["eval_commitment", "amber", /.+/i, "Action proposee par le client."],
    ["eval_contact", "amber", /rapid|prochaine|seance|séance/i, "Moment de suivi souhaite."],
    ["open_note", statusLevel === "green" ? "amber" : statusLevel, /.+/i, "Note ouverte du client."]
  ];

  fieldRules.forEach(([key, level, pattern, reason]) => {
    const value = key === "contactRequest" ? response.contactRequest : questionnaireAnswer(response, key);
    if (!value || !pattern.test(String(value))) return;
    add(key, level, reason, value);
  });

  const lowPatterns = /bas|faible|difficile|douleur|mal|pas|non|perdu|baisse|frustr|inquiet|stress|urgent/i;
  Object.entries(answers).forEach(([key, value]) => {
    if (Array.isArray(value) || signals.some((signal) => signal.key === key)) return;
    if (!lowPatterns.test(String(value || ""))) return;
    add(key, statusLevel === "green" ? "amber" : statusLevel, "Reponse a verifier.", value);
  });
  return signals.slice(0, 5);
}

function questionnairePrioritySummary(response, highlights = questionnaireHighlights(response)) {
  const status = String(response.triageStatus || "").toLowerCase();
  const firstSignal = highlights[0];
  const statusSummaries = {
    rouge: {
      level: "red",
      label: "Priorite haute",
      reason: firstSignal?.reason || "Le triage indique un suivi prioritaire.",
      nextStep: "Contacter le client rapidement et noter le suivi."
    },
    orange: {
      level: "orange",
      label: "Discussion a planifier",
      reason: firstSignal?.reason || "Une discussion structuree semble utile.",
      nextStep: "Planifier 10 a 15 minutes avec le client."
    },
    jaune: {
      level: "amber",
      label: "Ajustement leger",
      reason: firstSignal?.reason || "Un point doit etre valide sans urgence.",
      nextStep: "Traiter a la prochaine seance ou ajouter une note coach."
    },
    vert: {
      level: "green",
      label: "Aucun signal urgent",
      reason: firstSignal?.reason || "La reponse peut surtout enrichir l'historique client.",
      nextStep: "Lire, archiver, puis utiliser le contexte au prochain suivi."
    }
  };
  return statusSummaries[status] || {
    level: firstSignal?.level || "amber",
    label: "A classer",
    reason: firstSignal?.reason || "Le statut questionnaire n'est pas encore clair.",
    nextStep: "Lire la reponse, confirmer le client et choisir l'action coach."
  };
}

function questionnaireSignalLabel(key) {
  const labels = {
    triageStatus: "Priorite",
    contactRequest: "Demande contact",
    pain_status: "Douleur",
    pain_detail: "Detail douleur",
    motivation_level: "Motivation",
    results_satisfaction_score: "Satisfaction",
    coach_alignment_score: "Alignement coach",
    goal_status: "Objectif",
    goal_change_detail: "Detail objectif",
    progress_toward_goal: "Progression",
    program_fit: "Programme",
    program_adjustment_detail: "Ajustement programme",
    support_needed: "Support",
    current_challenges: "Defi",
    improvements_requested: "Amelioration",
    open_note: "Note client",
    questionnaire_type: "Type",
    habits_priorities: "Priorites",
    habits_rhythm: "Rythme",
    habits_water: "Eau",
    habits_movement30: "Mouvement",
    habits_outdoor15: "Exterieur",
    habits_sleep7: "Sommeil",
    habits_bowel_daily: "Digestion",
    habits_focus: "Focus",
    habits_priority: "Priorite client",
    habits_support: "Support",
    eval_main_goal: "Objectif",
    eval_obstacles: "Obstacles",
    eval_readiness: "Pret a changer",
    eval_meals: "Repas",
    eval_protein: "Proteine",
    eval_fruits_vegetables: "Fruits/legumes",
    eval_hydration: "Hydratation",
    eval_sleep: "Sommeil",
    eval_sleep_quality: "Qualite sommeil",
    eval_stress: "Stress",
    eval_energy: "Energie",
    eval_pain: "Douleur",
    eval_next_focus: "Prochain focus",
    eval_commitment: "Engagement",
    eval_contact: "Contact"
  };
  return labels[key] || key.replace(/_/g, " ");
}

function questionnaireActionHeadline(response) {
  const labels = {
    rouge: "Contact rapide recommande",
    orange: "Discussion structuree a planifier",
    jaune: "Ajustement leger a valider",
    vert: "Lecture et archivage"
  };
  return labels[response.triageStatus] || actionLabel(response.coachActionType);
}

function questionnaireActionHint(response) {
  const highlights = questionnaireHighlights(response);
  if (highlights.length) {
    return highlights.map((item) => item.reason).join(" | ");
  }
  const labels = {
    rouge: "Priorite haute: ne pas seulement archiver.",
    orange: "Prevoir un moment clair avec le client.",
    jaune: "Peut souvent etre traite a la prochaine seance.",
    vert: "Aucun signal urgent detecte."
  };
  return labels[response.triageStatus] || "Lire la reponse et confirmer l'action coach.";
}

function fromDoc(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function isBootstrapAdmin(user) {
  return (user.email || "").toLowerCase() === ADMIN_EMAIL;
}

function isInfoAdmin() {
  const email = String(state.user?.email || state.profile?.email || "").trim().toLowerCase();
  return state.profile?.role === "admin" && email === ADMIN_EMAIL;
}

function pilotCoachForEmail(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || cleanEmail === "info@crossfitstbasilelegrand.com") return null;
  return PILOT_COACHES.find((coach) => String(coach.email || "").trim().toLowerCase() === cleanEmail) || null;
}

function requireAdmin() {
  if (!isInfoAdmin()) throw new Error("Action reservee admin.");
}

function cleanupSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function renderIfReady() {
  if (state.user && state.profile) render();
}

function taskTypeLabel(type) {
  const labels = {
    program: "Programme",
    rebooking: "Rebooking",
    questionnaire_followup: "Questionnaire",
    validation: "Validation",
    performance: "Performance",
    coach_note: "Note coach",
    manual: "Manuel"
  };
  return labels[type] || "Tache";
}

function questionnaireSendStatusLabel(status) {
  const labels = {
    prepared: "prepare",
    pending: "en cours",
    sent: "envoye",
    answered: "repondu",
    error: "erreur",
    cancelled: "archive"
  };
  return labels[status] || "prepare";
}

function questionnaireSendActionHint(send) {
  const status = String(send?.status || "").toLowerCase();
  const delivery = String(send?.deliveryStatus || "").toLowerCase();
  if (status === "sent" || delivery === "tag_added") {
    return "SMS declenche par le workflow GHL; attendre la reponse du client.";
  }
  if (delivery === "missing_phone") {
    return "Ajouter un telephone normalise dans la fiche client, puis reessayer.";
  }
  if (delivery === "contact_not_found") {
    return "Verifier que le contact existe dans GHL avec exactement ce telephone.";
  }
  if (delivery === "missing_ghl_config") {
    return "Action admin: configurer le secret serveur GHL dans Firebase Functions.";
  }
  if (delivery === "firestore_queue_pending" || delivery === "backend_processing" || delivery === "ghl_pending") {
    return "Envoi en file; le backend traite la demande et mettra ce statut a jour.";
  }
  if (delivery === "firebase_callable_error") {
    return "Ancienne tentative bloquee par l'appel direct; recreer l'envoi avec la file Firestore.";
  }
  if (delivery === "ghl_error" || delivery === "ghl_rejected") {
    return "Verifier le token GHL, les permissions et le workflow dashboardcoach.";
  }
  if (status === "pending") {
    return "Tentative en cours; verifier le statut dans quelques secondes.";
  }
  if (status === "cancelled") {
    return "Tentative archivee; aucun suivi automatique ne sera cree.";
  }
  return "Utiliser ce journal pour diagnostiquer l'envoi avant de recreer une tentative.";
}

function impactStatusLabel(status) {
  const labels = { draft: "a valider", confirmed: "confirme", cancelled: "annule", deleted: "supprime" };
  return labels[status] || "a valider";
}

function alumniStatusLabel(status) {
  const labels = {
    to_work: "a travailler",
    contacted: "contacte",
    do_not_contact: "ne pas contacter",
    reactivated: "reactive",
    archived: "archive"
  };
  return labels[status] || "a travailler";
}

function riskLabel(value) {
  const labels = { none: "Aucun", low: "Bas", medium: "Moyen", high: "Eleve" };
  return labels[value] || "Aucun";
}

function riskClass(value) {
  if (value === "high") return "red";
  if (value === "medium") return "amber";
  if (value === "low") return "green";
  return "";
}

function triageClass(value) {
  if (value === "rouge") return "red";
  if (value === "orange") return "orange";
  if (value === "jaune") return "amber";
  if (value === "vert") return "green";
  return "";
}

function actionLabel(value) {
  const labels = {
    lire_le_suivi: "Lire le suivi client",
    aucune_action_urgente: "Lire et archiver",
    ajustement_leger: "Valider ajustement leger",
    discussion_structuree: "Planifier discussion structuree",
    contact_prioritaire: "Contacter rapidement"
  };
  return labels[value] || value || "Lecture requise";
}

function rebookingStatusLabel(value) {
  const labels = {
    open: "Ouvert",
    managed: "Suivi fait",
    rebooked: "Seance rebookee",
    coach_absence: "Absence coach",
    archived: "Archive",
    deleted: "Supprime comme erreur"
  };
  return labels[value] || "Ouvert";
}

function rebookingStatus(rebooking) {
  return String(rebooking?.status || "open").trim() || "open";
}

function rebookingMatchLabel(value) {
  const labels = {
    phone: "telephone",
    name: "nom seulement",
    existing: "fiche existante",
    manual_client: "manuel, fiche client",
    manual_name_confirmed: "nom confirme",
    manual_unmatched: "manuel, a confirmer",
    unmatched: "non relie",
    unknown: "inconnu"
  };
  return labels[value] || value || "inconnu";
}

function rebookingCoachWarning(rebooking, matchMethod) {
  if (!rebooking.clientId) {
    return "Fiche client a confirmer: traite la seance ici, puis demande une validation si le client n'est pas clair.";
  }
  if (!rebooking.clientPhoneNormalized || matchMethod === "name") {
    return "Client a confirmer si un doute existe avant de fermer la seance.";
  }
  return "";
}

function rebookingMatchWarning(rebooking, matchMethod) {
  if (!rebooking.clientId) {
    return "Aucune fiche client reliee. Ajoute ou corrige le telephone dans la source pour ouvrir le bon dossier.";
  }
  if (!rebooking.clientPhoneNormalized) {
    return "Aucun telephone normalise sur ce rebooking. Le lien peut dependre du nom seulement.";
  }
  if (matchMethod === "name") {
    return "Lien par nom seulement. A valider si deux clients ont des noms semblables.";
  }
  return "";
}

function riskOptions(current) {
  return [
    ["none", "Aucun"],
    ["low", "Bas"],
    ["medium", "Moyen"],
    ["high", "Eleve"]
  ].map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("");
}

function impactStatusOptions(current) {
  return [
    ["draft", "A valider"],
    ["confirmed", "Confirme"],
    ["cancelled", "Annule"]
  ].map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("");
}

function alumniStatusOptions(current) {
  return [
    ["to_work", "A travailler"],
    ["contacted", "Contacte"],
    ["do_not_contact", "Ne pas contacter"],
    ["reactivated", "Reactive"],
    ["archived", "Archive"]
  ].map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("");
}

function isOpenTask(task) {
  return isOpenTaskLifecycle(task) && operationalRecordHasSafeClientLink(task);
}

function isOpenTaskLifecycle(task) {
  if (!task || task.sourceStale === true) return false;
  if (isNonActionableLegacyTask(task)) return false;
  if (task.archivedAt || task.completedAt || task.ignoredAt) return false;
  return ["open", "waiting"].includes(String(task.status || "").trim());
}

function isNonActionableLegacyTask(task) {
  if (cleanDisplayKey(task?.source) !== "coachrx_exercise_due") return false;
  if (task?.sourceSignal?.system === "CoachRx" || task?.sourceSignal?.severity) return false;
  return !task?.clientId || !task?.title || keyOf(task?.title).includes("programmeduouenretard");
}

function priorityRank(priority) {
  if (priority === "P1") return 1;
  if (priority === "P3") return 3;
  return 2;
}

function dateValue(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [year, month, day] = value.trim().split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  return new Date(value).getTime() || 0;
}

function formatDate(value) {
  const timestamp = dateValue(value);
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value) {
  const timestamp = dateValue(value);
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("fr-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function daysSince(value) {
  const timestamp = dateValue(value);
  if (!timestamp) return 0;
  return Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeComparable(value) {
  return slugify(value).replace(/-/g, " ");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function keyOf(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isUsableCoachRxClient(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return false;
  if (cleanName.toLowerCase() === "not set") return false;
  if (/^[A-Z]{1,4}$/.test(cleanName)) return false;
  const normalized = slugify(cleanName);
  const coachNames = new Set(PILOT_COACHES.map((coach) => slugify(coach.name)));
  if (coachNames.has(normalized)) return false;
  return cleanName.split(/\s+/).length >= 2;
}

function lastNameSort(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(-1)[0] : parts[0] || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
