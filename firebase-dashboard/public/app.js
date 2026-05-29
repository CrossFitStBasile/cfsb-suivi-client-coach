import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

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
const provider = new GoogleAuthProvider();

const PILOT_COACHES = [
  { id: "15935", coachRxId: "15935", name: "Marc-Andre Menard", active: true },
  { id: "15928", coachRxId: "15928", name: "Iheb Yahyaoui", active: true },
  { id: "17242", coachRxId: "17242", name: "Camille Proulx", active: true },
  { id: "15902", coachRxId: "15902", name: "David Olivier", active: true },
  { id: "15893", coachRxId: "15893", name: "Gabriel Mayer Bedard", active: true },
  { id: "15937", coachRxId: "15937", name: "Hugo Lelievre", active: true },
  { id: "15936", coachRxId: "15936", name: "Raphael Samson", active: true }
];

const SAMPLE_CLIENTS = [
  {
    id: "demo-caroline-gaudreault",
    name: "Caroline Gaudreault",
    phoneNormalized: "5145551081",
    email: "caroline@example.com",
    membershipLabel: "Semi-Prive 1x/sem (60 min)",
    status: "manual",
    riskLevel: "none",
    lastQuestionnaireAt: "2026-03-08",
    notes: "Objectif: force structurale et constance."
  },
  {
    id: "demo-emilie-gervais",
    name: "Emilie Gervais",
    phoneNormalized: "5145551082",
    email: "emilie@example.com",
    membershipLabel: "Semi-Prive 2x/sem (60 min)",
    status: "manual",
    riskLevel: "low",
    kiloPlannedRecurrenceEndDate: "2026-06-21",
    notes: "A surveiller: disponibilites variables."
  },
  {
    id: "demo-michael-grondin",
    name: "Michael Grondin",
    phoneNormalized: "8192771825",
    email: "info@crossfitstbasilelegrand.com",
    membershipLabel: "Client manuel demo",
    status: "manual",
    riskLevel: "none",
    notes: "Client test pour validation des envois."
  },
  {
    id: "demo-julie-corbin",
    name: "Julie Corbin",
    phoneNormalized: "5145551083",
    email: "julie@example.com",
    membershipLabel: "Semi-Prive 1x/sem (60 min)",
    status: "manual",
    riskLevel: "medium",
    manualMembershipEndDate: "2026-07-15",
    notes: "Discussion a prevoir sur la suite."
  }
];

const state = {
  user: null,
  profile: null,
  coaches: [],
  selectedCoachId: "",
  tab: "todo",
  errors: [],
  toast: "",
  busy: false,
  modal: null,
  filter: {
    questionnaire: "to_read",
    rebooking: "open",
    performancePeriod: "30d",
    alumni: "to_work"
  },
  data: {
    tasks: [],
    clients: [],
    questionnaireResponses: [],
    questionnaireSends: [],
    rebookings: [],
    impacts: [],
    alumni: []
  },
  unsubscribers: []
};

const tabs = [
  ["todo", "To-do"],
  ["clients", "Clients"],
  ["questionnaires", "Questionnaires"],
  ["rebooking", "Rebooking"],
  ["performance", "Performance"],
  ["alumni", "Alumni"],
  ["guide", "Guide"]
];

const appRoot = document.querySelector("#app");
const toastRoot = document.querySelector("#toast");

window.addEventListener("error", (event) => {
  pushError(event.message || "Erreur JavaScript inconnue");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason || {};
  pushError(reason.message || reason.code || "Promesse rejetee sans message");
});

onAuthStateChanged(auth, async (user) => {
  cleanupSubscriptions();
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
    profileSnap = await getDoc(profileRef);
  } catch (error) {
    renderPendingAccess(user, `Impossible de lire le profil Firestore. ${error.code || ""} ${error.message || ""}`.trim());
    return;
  }

  if (!profileSnap.exists()) {
    if (isBootstrapAdmin(user)) {
      try {
        await setDoc(profileRef, {
          active: true,
          role: "admin",
          coachId: "admin",
          displayName: user.displayName || "Michael Grondin",
          email: user.email || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: "firebase_bootstrap"
        });
        showToast("Profil admin cree. Rechargement...");
        window.setTimeout(() => window.location.reload(), 900);
      } catch (error) {
        renderPendingAccess(user, `Bootstrap admin impossible. ${error.code || ""} ${error.message || ""}`.trim());
      }
      return;
    }
    renderPendingAccess(user, `Aucun document trouve dans Firestore a users/${user.uid}.`);
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
}

function chooseInitialCoach() {
  if (state.profile.role === "admin") return state.coaches[0]?.id || "";
  return state.profile.coachId || "";
}

function renderLogin() {
  appRoot.innerHTML = `
    <main class="auth-card">
      <div class="brand-kicker">CFSB COACH COMMAND</div>
      <h1>Dashboard Coach</h1>
      <p>Connecte-toi avec ton compte Google autorise pour acceder au dashboard coach.</p>
      <button class="primary" data-action="login">Connexion Google</button>
    </main>
  `;
}

function renderPendingAccess(user, message = "Ton compte Google est reconnu, mais aucun acces dashboard n'est encore configure.") {
  appRoot.innerHTML = `
    <main class="auth-card">
      <div class="brand-kicker">ACCES EN ATTENTE</div>
      <h1>Dashboard Coach</h1>
      <p>${escapeHtml(message)}</p>
      <div class="notice">
        Envoie cette information a Michael pour activer ton acces:<br>
        <strong>Email:</strong> ${escapeHtml(user.email || "")}<br>
        <strong>UID:</strong> ${escapeHtml(user.uid)}<br>
        <strong>Document attendu:</strong> users/${escapeHtml(user.uid)}
      </div>
      <button class="primary" data-action="reload">Verifier a nouveau</button>
      <button class="secondary" data-action="logout">Changer de compte</button>
    </main>
  `;
}

async function loadCoaches() {
  try {
    const snap = await getDocs(query(collection(db, "coaches"), where("active", "==", true)));
    state.coaches = snap.docs
      .map(fromDoc)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  } catch (error) {
    pushError(`Coachs non charges: ${error.code || ""} ${error.message || ""}`.trim(), false);
    state.coaches = [];
  }
}

function subscribeCoachData() {
  cleanupSubscriptions();
  const coachId = state.selectedCoachId;
  if (!coachId) {
    render();
    return;
  }

  subscribeCollection("tasks", coachId, (items) => {
    state.data.tasks = items
      .filter((task) => ["open", "waiting"].includes(task.status || "open"))
      .sort(sortTasks)
      .slice(0, 100);
  });

  subscribeCollection("clients", coachId, (items) => {
    state.data.clients = items
      .filter((client) => ["active", "manual"].includes(client.status || "manual"))
      .sort((a, b) => String(a.lastNameSort || a.name || "").localeCompare(String(b.lastNameSort || b.name || "")));
  });

  subscribeCollection("questionnaireResponses", coachId, (items) => {
    state.data.questionnaireResponses = items
      .sort((a, b) => dateValue(b.submittedAt || b.createdAt) - dateValue(a.submittedAt || a.createdAt));
  });

  subscribeCollection("questionnaireSends", coachId, (items) => {
    state.data.questionnaireSends = items
      .sort((a, b) => dateValue(b.sentAt || b.preparedAt || b.createdAt) - dateValue(a.sentAt || a.preparedAt || a.createdAt));
  });

  subscribeCollection("rebookings", coachId, (items) => {
    state.data.rebookings = items
      .sort((a, b) => dateValue(b.detectedAt || b.createdAt) - dateValue(a.detectedAt || a.createdAt));
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

function subscribeCollection(collectionName, coachId, setter) {
  state.unsubscribers.push(onSnapshot(
    query(collection(db, collectionName), where("coachId", "==", coachId)),
    (snap) => {
      setter(snap.docs.map(fromDoc));
      render();
    },
    (error) => showDataError(collectionName, error)
  ));
}

function render() {
  if (!state.user || !state.profile) return;

  const activeCoach = activeCoachRecord();
  const openTasks = state.data.tasks.filter((task) => task.status === "open").length;
  const urgentTasks = state.data.tasks.filter((task) => task.priority === "P1" && task.status === "open").length;
  const risks = state.data.clients.filter((client) => ["medium", "high"].includes(client.riskLevel)).length;
  const impacts = periodFiltered(state.data.impacts, "impactDate").filter((impact) => impact.status === "confirmed").length;

  appRoot.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="brand">
          <div class="brand-kicker">CFSB COACH COMMAND</div>
          <h1>Dashboard Coach</h1>
          <p>${escapeHtml(activeCoach?.name || "Selectionne un coach")}</p>
        </div>
        <nav class="nav">
          ${tabs.map(([id, label]) => `<button class="${state.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}
        </nav>
        <div class="side-footer">
          ${state.profile.role === "admin" ? renderCoachSelect() : ""}
          <button class="secondary" data-action="logout">Deconnexion</button>
        </div>
      </aside>
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
        <section class="grid-stats">
          <div class="stat"><strong>${openTasks}</strong><span>actions ouvertes</span></div>
          <div class="stat"><strong>${urgentTasks}</strong><span>urgent</span></div>
          <div class="stat"><strong>${risks}</strong><span>risques coach</span></div>
          <div class="stat"><strong>${impacts}</strong><span>impacts periode</span></div>
        </section>
        ${renderErrors()}
        ${renderActiveTab()}
      </main>
      ${state.modal ? renderModal() : ""}
    </div>
  `;
  renderToast();
}

function renderPrimaryAction() {
  if (!state.selectedCoachId && state.profile?.role === "admin") {
    return `<button class="primary" data-action="seedCoaches">Initialiser les coachs</button>`;
  }
  const actions = {
    todo: `<button class="primary" data-action="openQuickNote">Ajouter une note</button>`,
    clients: `<button class="primary" data-action="openClientForm">Ajouter un client</button>`,
    questionnaires: `<button class="primary" data-action="openQuestionnaireSend">Envoyer questionnaire</button>`,
    rebooking: `<button class="primary" data-action="openRebookingForm">Ajouter rebooking</button>`,
    performance: `<button class="primary" data-action="openImpactForm">Ajouter impact</button>`,
    alumni: `<button class="primary" data-action="openAlumniForm">Ajouter alumni</button>`,
    guide: state.profile?.role === "admin" ? `<button class="primary" data-action="seedPilotData">Creer donnees pilotes</button>` : ""
  };
  return actions[state.tab] || "";
}

function renderCoachSelect() {
  if (!state.coaches.length) {
    return `
      <div class="empty small">Aucun coach charge.</div>
      <button class="secondary" data-action="seedCoaches">Creer coachs</button>
    `;
  }
  return `
    <label class="field-label">
      Coach
      <select class="coach-select" data-action="selectCoach">
        ${state.coaches.map((coach) => `
          <option value="${escapeHtml(coach.id)}" ${coach.id === state.selectedCoachId ? "selected" : ""}>
            ${escapeHtml(coach.name || coach.id)}
          </option>
        `).join("")}
      </select>
    </label>
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
  return renderGuide();
}

function renderTodo() {
  const tasks = state.data.tasks.filter((task) => task.status === "open");
  const buckets = [
    ["Urgent", tasks.filter((task) => task.priority === "P1").length],
    ["Programmes", tasks.filter((task) => task.type === "program").length],
    ["Rebookings", tasks.filter((task) => task.type === "rebooking").length],
    ["Questionnaires", tasks.filter((task) => task.type === "questionnaire_followup").length],
    ["Notes coach", tasks.filter((task) => task.type === "coach_note" || task.type === "manual").length]
  ];

  return `
    ${panel("Capture rapide", "Transforme une note de fin de journee en mission concrete.", `
      <form class="quick-form" data-form="quickNote">
        <textarea name="title" required placeholder="Ex.: Contacter Alex pour son dos, relancer Julie pour son objectif, verifier la recurrence Kilo de Caroline"></textarea>
        <div class="form-row">
          <select name="priority">
            <option value="P2">Priorite normale</option>
            <option value="P1">Urgent</option>
            <option value="P3">Faible</option>
          </select>
          <input name="dueAt" type="date" value="${todayIso()}">
          <button class="primary" type="submit">Creer mission</button>
        </div>
      </form>
    `)}
    ${panel("To-do du coach", "Priorise seulement les actions concretes. Clique un nom de client pour voir le contexte.", `
      <div class="bucket-grid">${buckets.map(([label, count]) => `<div class="bucket"><strong>${count}</strong><span>${label}</span></div>`).join("")}</div>
      ${renderCards(tasks, renderTaskCard, "Aucune action ouverte.")}
    `)}
  `;
}

function renderClients() {
  return panel("Portefeuille clients", "Clique un client pour ouvrir sa fiche. Les dates de fin membership et recurrence Kilo sont manuelles.", `
    ${renderCards(state.data.clients, renderClientCard, "Aucun client charge. Ajoute un client ou cree les donnees pilotes depuis Guide.")}
  `);
}

function renderQuestionnaires() {
  const responses = state.data.questionnaireResponses;
  const sends = state.data.questionnaireSends;
  const readable = responses.filter((item) => ["to_read", "unmatched"].includes(item.processingStatus || "to_read"));
  const unmatched = responses.filter((item) => (item.processingStatus || "") === "unmatched");
  const sentWaiting = sends.filter((item) => item.status === "sent" && !item.answeredAt);
  const followups = sentWaiting.filter((item) => daysSince(item.sentAt) >= 7);
  const archived = responses.filter((item) => ["read", "archived", "validated"].includes(item.processingStatus));

  const views = {
    to_read: readable,
    send: state.data.clients,
    followup: followups,
    validate: unmatched,
    archives: archived
  };
  const active = state.filter.questionnaire;
  const items = views[active] || readable;

  return panel("Inbox questionnaires", "Lis les reponses, envoie un questionnaire, ou valide les reponses non reconnues.", `
    <div class="view-tabs">
      ${filterButton("questionnaire", "to_read", "Reponses a lire", readable.length)}
      ${filterButton("questionnaire", "send", "Envoyer", state.data.clients.length)}
      ${filterButton("questionnaire", "followup", "A relancer", followups.length)}
      ${filterButton("questionnaire", "validate", "A valider", unmatched.length)}
      ${filterButton("questionnaire", "archives", "Archives", archived.length)}
    </div>
    ${active === "send"
      ? renderCards(items, renderQuestionnaireSendClientCard, "Aucun client disponible pour envoyer un questionnaire.")
      : active === "followup"
        ? renderCards(items, renderQuestionnaireFollowupCard, "Aucune relance. Une relance apparait seulement 7 jours apres un vrai envoi sans reponse.")
        : renderCards(items, renderQuestionnaireCard, "Aucun element dans cette vue.")}
  `);
}

function renderRebooking() {
  const items = state.data.rebookings;
  const views = {
    open: items.filter((item) => item.status === "open"),
    managed: items.filter((item) => item.status === "managed"),
    rebooked: items.filter((item) => item.status === "rebooked"),
    coach_absence: items.filter((item) => item.status === "coach_absence"),
    history: items.filter((item) => item.status !== "open")
  };
  const active = state.filter.rebooking;
  return panel("Rebooking", "Gere les seances a replacer. L'historique permet de revenir en arriere.", `
    <div class="view-tabs">
      ${filterButton("rebooking", "open", "Ouvert", views.open.length)}
      ${filterButton("rebooking", "managed", "Gere", views.managed.length)}
      ${filterButton("rebooking", "rebooked", "Rebooke", views.rebooked.length)}
      ${filterButton("rebooking", "coach_absence", "Absence coach", views.coach_absence.length)}
      ${filterButton("rebooking", "history", "Historique", views.history.length)}
    </div>
    ${renderCards(views[active] || views.open, renderRebookingCard, "Aucun rebooking dans cette vue.")}
  `);
}

function renderPerformance() {
  const impacts = periodFiltered(state.data.impacts, "impactDate");
  const confirmedImpacts = impacts.filter((impact) => impact.status === "confirmed");
  const activeClients = state.data.clients.filter((client) => client.status !== "removed");
  const newClients = periodFiltered(activeClients, "createdAt");
  const churn = activeClients.filter((client) => client.status === "removed").length;
  return panel("Performance", "Mesure ce qui aide a superviser: churn, nouveaux clients, check-ups CSM et impacts.", `
    <div class="toolbar">
      <label class="field-label compact">
        Periode
        <select class="input" data-action="selectPerformancePeriod">
          ${[
            ["7d", "7 jours"],
            ["30d", "30 jours"],
            ["60d", "60 jours"],
            ["month", "Ce mois-ci"],
            ["last_month", "Mois dernier"],
            ["6m", "6 mois"],
            ["12m", "12 mois"]
          ].map(([value, label]) => `<option value="${value}" ${state.filter.performancePeriod === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="bucket-grid four">
      <div class="bucket"><strong>${churn}</strong><span>Churn</span></div>
      <div class="bucket"><strong>${newClients.length}</strong><span>Nouveaux clients</span></div>
      <div class="bucket"><strong>-</strong><span>Check-ups CSM</span></div>
      <div class="bucket"><strong>${confirmedImpacts.length}</strong><span>Impacts confirmes</span></div>
    </div>
    ${renderCards(impacts, renderImpactCard, "Aucun impact pour cette periode.")}
  `);
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
  return panel("Alumni", "Anciens clients a recontacter. Ce module reste separe de Performance.", `
    <div class="view-tabs">
      ${filterButton("alumni", "to_work", "A travailler", views.to_work.length)}
      ${filterButton("alumni", "contacted", "Contactes", views.contacted.length)}
      ${filterButton("alumni", "do_not_contact", "Ne pas contacter", views.do_not_contact.length)}
      ${filterButton("alumni", "reactivated", "Reactives", views.reactivated.length)}
      ${filterButton("alumni", "archives", "Archives", views.archives.length)}
    </div>
    ${renderCards(views[state.filter.alumni] || views.to_work, renderAlumniCard, "Aucun alumni dans cette vue.")}
  `);
}

function renderGuide() {
  const modules = [
    ["Base Firebase", "Firestore est maintenant le moteur interactif du dashboard. Google Sheets reste utile pour import/export, mais pas pour chaque clic coach."],
    ["Coachs", "Les coachs reels sont pilotes par CoachRx ID. Initialiser coachs cree seulement la liste officielle pilote."],
    ["To-do", "La page quotidienne doit contenir seulement des actions concretes: faire, masquer, relancer ou valider."],
    ["Clients", "La fiche client regroupe les donnees utiles: telephone, membership, dates manuelles, recurrence Kilo, risque coach et notes."],
    ["Questionnaires", "L'inbox lit les reponses et prepare les envois. Le vrai SMS GHL attend une Cloud Function privee."],
    ["Rebooking", "Le module est integre avec statuts et historique. La source automatique pourra etre branchee ensuite."],
    ["Performance", "Impacts, churn, nouveaux clients et check-ups doivent rester separes des alumni et filtres par periode."],
    ["Securite", "Aucun token, lien secret ou donnee client ne doit etre publie dans GitHub Pages."]
  ];
  return panel("Guide & modules", "Etat de migration vers Firebase et actions admin.", `
    <div class="toolbar">
      ${state.profile?.role === "admin" ? `<button class="primary" data-action="seedCoaches">Initialiser coachs</button>` : ""}
      ${state.profile?.role === "admin" && state.selectedCoachId ? `<button class="secondary" data-action="seedPilotData">Creer donnees pilotes coach</button>` : ""}
    </div>
    <div class="cards">
      ${modules.map(([title, text]) => `<article class="card"><div><h4>${title}</h4><p class="meta">${text}</p></div></article>`).join("")}
    </div>
  `);
}

function panel(title, subtitle, content) {
  return `
    <section class="panel">
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

function renderCards(items, renderer, emptyText) {
  if (!items.length) return `<div class="empty">${emptyText}</div>`;
  return `<div class="cards">${items.map(renderer).join("")}</div>`;
}

function renderTaskCard(task) {
  return `
    <article class="card task-card ${task.priority === "P1" ? "urgent" : ""}">
      <div>
        <button class="link-title" data-action="openClient" data-id="${escapeHtml(task.clientId || "")}" ${task.clientId ? "" : "disabled"}>
          ${escapeHtml(task.clientName || task.title || "Tache")}
        </button>
        <h4>${escapeHtml(task.title || "Tache")}</h4>
        <p class="meta">${escapeHtml(task.description || "")}</p>
        <div class="pill-row">
          <span class="pill ${task.priority === "P1" ? "red" : "amber"}">${escapeHtml(task.priority || "P2")}</span>
          <span class="pill">${taskTypeLabel(task.type)}</span>
          ${task.dueAt ? `<span class="pill">${formatDate(task.dueAt)}</span>` : ""}
        </div>
      </div>
      <div class="card-actions">
        ${taskActionButtons(task)}
      </div>
    </article>
  `;
}

function taskActionButtons(task) {
  if (task.type === "rebooking") {
    return `
      <button class="primary" data-action="completeTask" data-id="${escapeHtml(task.id)}">Fait</button>
      <button class="secondary" data-action="ignoreTask" data-id="${escapeHtml(task.id)}">Masquer</button>
    `;
  }
  if (task.type === "questionnaire_followup") {
    return `
      <button class="primary" data-action="completeTask" data-id="${escapeHtml(task.id)}">Relance faite</button>
      <button class="secondary" data-action="ignoreTask" data-id="${escapeHtml(task.id)}">Masquer</button>
    `;
  }
  if (task.type === "validation") {
    return `
      <button class="primary" data-action="completeTask" data-id="${escapeHtml(task.id)}">Valider</button>
      <button class="secondary" data-action="ignoreTask" data-id="${escapeHtml(task.id)}">Masquer</button>
    `;
  }
  return `
    <button class="primary" data-action="completeTask" data-id="${escapeHtml(task.id)}">Fait</button>
    <button class="secondary" data-action="ignoreTask" data-id="${escapeHtml(task.id)}">Masquer</button>
  `;
}

function renderClientCard(client) {
  return `
    <article class="card clickable" data-action="openClient" data-id="${escapeHtml(client.id)}">
      <div>
        <h4>${escapeHtml(client.name || "Client")}</h4>
        <p class="meta">
          ${escapeHtml(client.membershipLabel || "Membership a preciser")}<br>
          Fin membership: ${escapeHtml(client.manualMembershipEndDate || "manuelle a entrer")}<br>
          Recurrence Kilo: ${escapeHtml(client.kiloPlannedRecurrenceEndDate || "manuelle a entrer")}
        </p>
      </div>
      <div class="pill-row right">
        <span class="pill ${riskClass(client.riskLevel)}">Risque: ${riskLabel(client.riskLevel)}</span>
        <span class="pill">${escapeHtml(client.phoneNormalized || "telephone a ajouter")}</span>
      </div>
    </article>
  `;
}

function renderQuestionnaireCard(response) {
  const statusClass = triageClass(response.triageStatus);
  return `
    <article class="card">
      <div>
        <button class="link-title" data-action="openClient" data-id="${escapeHtml(response.clientId || "")}" ${response.clientId ? "" : "disabled"}>
          ${escapeHtml(response.clientName || "Reponse sans client")}
        </button>
        <p class="meta">
          ${escapeHtml(actionLabel(response.coachActionType))}<br>
          Tel: ${escapeHtml(response.clientPhoneNormalized || "non matche")} | Recu: ${formatDate(response.submittedAt || response.createdAt)}
        </p>
        <div class="answer-summary">${renderAnswerSummary(response)}</div>
        <span class="pill ${statusClass}">${escapeHtml(response.triageStatus || "a lire")}</span>
      </div>
      <div class="card-actions">
        <button class="primary" data-action="markResponseRead" data-id="${escapeHtml(response.id)}">Lu</button>
      </div>
    </article>
  `;
}

function renderQuestionnaireSendClientCard(client) {
  const phone = client.phoneNormalized || "";
  const lastSend = latestSendForClient(client.id);
  const lastSendDate = lastSend?.sentAt || lastSend?.preparedAt || lastSend?.createdAt;
  return `
    <article class="card">
      <div>
        <button class="link-title" data-action="openClient" data-id="${escapeHtml(client.id)}">${escapeHtml(client.name || "Client")}</button>
        <p class="meta">
          Telephone: ${escapeHtml(phone || "manquant")}<br>
          Dernier questionnaire: ${escapeHtml(client.lastQuestionnaireAt || "jamais trouve")}
          ${lastSend ? `<br>Dernier envoi: ${formatDate(lastSendDate)} (${questionnaireSendStatusLabel(lastSend.status)})` : ""}
        </p>
      </div>
      <button class="primary" data-action="sendQuestionnaire" data-id="${escapeHtml(client.id)}" ${phone ? "" : "disabled"}>Preparer</button>
    </article>
  `;
}

function renderQuestionnaireFollowupCard(send) {
  return `
    <article class="card">
      <div>
        <h4>${escapeHtml(send.clientName || "Client")}</h4>
        <p class="meta">Envoye le ${formatDate(send.sentAt || send.createdAt)}. Aucune reponse apres ${daysSince(send.sentAt || send.createdAt)} jours.</p>
      </div>
      <div class="card-actions">
        <button class="primary" data-action="createQuestionnaireFollowupTask" data-id="${escapeHtml(send.id)}">Creer relance</button>
        <button class="secondary" data-action="cancelQuestionnaireSend" data-id="${escapeHtml(send.id)}">Archiver</button>
      </div>
    </article>
  `;
}

function renderRebookingCard(rebooking) {
  const isClosed = rebooking.status !== "open";
  return `
    <article class="card">
      <div>
        <button class="link-title" data-action="openClient" data-id="${escapeHtml(rebooking.clientId || "")}" ${rebooking.clientId ? "" : "disabled"}>
          ${escapeHtml(rebooking.clientName || "Client")}
        </button>
        <p class="meta">
          ${escapeHtml(rebooking.sessionsToRebook || "1")} seance(s) a rebooker<br>
          Statut: ${rebookingStatusLabel(rebooking.status)} | Source: ${escapeHtml(rebooking.source || "manuel")}
        </p>
      </div>
      <div class="card-actions">
        ${isClosed
          ? `<button class="secondary" data-action="reopenRebooking" data-id="${escapeHtml(rebooking.id)}">Reouvrir</button>`
          : `
            <button class="primary" data-action="manageRebooking" data-id="${escapeHtml(rebooking.id)}">Gere</button>
            <button class="secondary" data-action="rebookedRebooking" data-id="${escapeHtml(rebooking.id)}">Rebooke</button>
            <button class="secondary" data-action="coachAbsenceRebooking" data-id="${escapeHtml(rebooking.id)}">Absence coach</button>
          `}
      </div>
    </article>
  `;
}

function renderImpactCard(impact) {
  return `
    <article class="card">
      <div>
        <h4>${escapeHtml(impact.clientName || "Impact")}</h4>
        <p class="meta">
          ${escapeHtml(impact.serviceType || "Nouveau revenu")} | ${escapeHtml(impact.amount || "")}<br>
          ${formatDate(impact.impactDate || impact.createdAt)} | Statut: ${escapeHtml(impact.status || "draft")}
        </p>
      </div>
      <div class="card-actions">
        ${impact.status !== "confirmed" ? `<button class="primary" data-action="confirmImpact" data-id="${escapeHtml(impact.id)}">Confirmer</button>` : ""}
        ${impact.status !== "cancelled" ? `<button class="secondary" data-action="cancelImpact" data-id="${escapeHtml(impact.id)}">Annuler</button>` : ""}
      </div>
    </article>
  `;
}

function renderAlumniCard(alumni) {
  return `
    <article class="card">
      <div>
        <h4>${escapeHtml(alumni.name || "Alumni")}</h4>
        <p class="meta">
          ${escapeHtml(alumni.phoneNormalized || "telephone a ajouter")}<br>
          ${escapeHtml(alumni.note || "")}
        </p>
      </div>
      <div class="card-actions">
        <button class="primary" data-action="createAlumniTask" data-id="${escapeHtml(alumni.id)}">Creer mission</button>
        <button class="secondary" data-action="markAlumniContacted" data-id="${escapeHtml(alumni.id)}">Contacte</button>
        <button class="secondary" data-action="markAlumniDoNotContact" data-id="${escapeHtml(alumni.id)}">Ne pas contacter</button>
      </div>
    </article>
  `;
}

function renderModal() {
  if (state.modal.type === "client") return renderClientModal();
  if (state.modal.type === "clientForm") return renderClientFormModal();
  if (state.modal.type === "quickNote") return renderQuickNoteModal();
  if (state.modal.type === "questionnaireSend") return renderQuestionnaireSendModal();
  if (state.modal.type === "rebookingForm") return renderRebookingFormModal();
  if (state.modal.type === "impactForm") return renderImpactFormModal();
  if (state.modal.type === "alumniForm") return renderAlumniFormModal();
  return "";
}

function renderClientModal() {
  const client = state.data.clients.find((item) => item.id === state.modal.id);
  if (!client) return "";
  return modal("Fiche client", `
    <form class="modal-form" data-form="client" data-id="${escapeHtml(client.id)}">
      <div class="detail-grid">
        ${detail("Membership", client.membershipLabel || "A preciser", "Source: import/manuel")}
        ${detail("Fin membership", client.manualMembershipEndDate || "A entrer", "Manuel")}
        ${detail("Recurrence prevue Kilo", client.kiloPlannedRecurrenceEndDate || "A entrer", "Manuel")}
        ${detail("Dernier questionnaire", client.lastQuestionnaireAt || "Jamais trouve", "Reponses questionnaire")}
        ${detail("Risque coach", riskLabel(client.riskLevel), "Manuel")}
        ${detail("Telephone", client.phoneNormalized || "A ajouter", "Source principale de matching")}
      </div>
      <div class="form-grid">
        <label>Nom<input class="input" name="name" value="${escapeAttr(client.name || "")}" required></label>
        <label>Telephone<input class="input" name="phoneNormalized" value="${escapeAttr(client.phoneNormalized || "")}" placeholder="8192771825"></label>
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
      </div>
      <label>Notes / objectifs<textarea class="input" name="notes">${escapeHtml(client.notes || "")}</textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">Enregistrer</button>
        <button class="secondary" type="button" data-action="closeModal">Fermer</button>
      </div>
    </form>
  `);
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
  return modal("Ajouter une note", `
    <form class="modal-form" data-form="quickNote">
      <label>Mission<textarea class="input" name="title" required></textarea></label>
      <div class="form-grid">
        <label>Priorite
          <select class="input" name="priority">
            <option value="P2">Normale</option>
            <option value="P1">Urgente</option>
            <option value="P3">Faible</option>
          </select>
        </label>
        <label>Date<input class="input" type="date" name="dueAt" value="${todayIso()}"></label>
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit">Creer mission</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderQuestionnaireSendModal() {
  return modal("Envoyer un questionnaire", `
    <form class="modal-form" data-form="questionnaireSend">
      <label>Client
        <select class="input" name="clientId" required>
          <option value="">Selectionner...</option>
          ${state.data.clients.map((client) => `<option value="${escapeAttr(client.id)}">${escapeHtml(client.name)} - ${escapeHtml(client.phoneNormalized || "telephone manquant")}</option>`).join("")}
        </select>
      </label>
      <div class="notice compact">
        Cette V1 prepare l'envoi dans Firebase. L'envoi SMS reel doit passer par Cloud Function/GHL pour garder les tokens prives.
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit">Preparer l'envoi</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderRebookingFormModal() {
  return modal("Ajouter un rebooking", `
    <form class="modal-form" data-form="rebookingCreate">
      <div class="form-grid">
        <label>Client
          <select class="input" name="clientId" required>
            <option value="">Selectionner...</option>
            ${state.data.clients.map((client) => `<option value="${escapeAttr(client.id)}">${escapeHtml(client.name)}</option>`).join("")}
          </select>
        </label>
        <label>Seances a rebooker<input class="input" type="number" min="1" name="sessionsToRebook" value="1"></label>
      </div>
      <label>Note<textarea class="input" name="note"></textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">Ajouter</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderImpactFormModal() {
  return modal("Ajouter un impact", `
    <form class="modal-form" data-form="impactCreate">
      <div class="form-grid">
        <label>Client<input class="input" name="clientName" required></label>
        <label>Type de service<input class="input" name="serviceType" placeholder="PT, semi-prive, reference..."></label>
        <label>Montant<input class="input" name="amount" placeholder="$"></label>
        <label>Date<input class="input" type="date" name="impactDate" value="${todayIso()}"></label>
      </div>
      <label>Note<textarea class="input" name="note"></textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">Ajouter impact</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  `);
}

function renderAlumniFormModal() {
  return modal("Ajouter un alumni", `
    <form class="modal-form" data-form="alumniCreate">
      <div class="form-grid">
        <label>Nom<input class="input" name="name" required></label>
        <label>Telephone<input class="input" name="phoneNormalized"></label>
        <label>Courriel<input class="input" name="email"></label>
        <label>Prochaine relance<input class="input" type="date" name="nextFollowupAt"></label>
      </div>
      <label>Note<textarea class="input" name="note"></textarea></label>
      <div class="modal-actions">
        <button class="primary" type="submit">Ajouter alumni</button>
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
          <button class="icon-button" data-action="closeModal" aria-label="Fermer">x</button>
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

document.addEventListener("click", async (event) => {
  const modalSurface = event.target.closest("[data-modal-stop]");
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  if (modalSurface && actionEl.classList.contains("modal-backdrop")) return;
  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;
  const lockAction = shouldLockAction(action);
  if (lockAction && actionEl.dataset.working === "true") return;

  try {
    if (lockAction) beginActionFeedback(actionEl);
    if (action === "login") await signInWithPopup(auth, provider);
    if (action === "logout") await signOut(auth);
    if (action === "reload") window.location.reload();
    if (action === "closeModal") closeModal();
    if (action === "seedCoaches") await seedCoaches();
    if (action === "seedPilotData") await seedPilotData();
    if (action === "openQuickNote") openModal({ type: "quickNote" });
    if (action === "openClientForm") openModal({ type: "clientForm" });
    if (action === "openQuestionnaireSend") openModal({ type: "questionnaireSend" });
    if (action === "openRebookingForm") openModal({ type: "rebookingForm" });
    if (action === "openImpactForm") openModal({ type: "impactForm" });
    if (action === "openAlumniForm") openModal({ type: "alumniForm" });
    if (action === "openClient" && id) openModal({ type: "client", id });
    if (action === "completeTask") await patchEntity("tasks", id, { status: "done", completedAt: serverTimestamp() }, "Tache completee");
    if (action === "ignoreTask") await patchEntity("tasks", id, { status: "ignored", ignoredAt: serverTimestamp() }, "Tache masquee");
    if (action === "markResponseRead") await patchEntity("questionnaireResponses", id, { processingStatus: "read", readAt: serverTimestamp() }, "Reponse archivee");
    if (action === "sendQuestionnaire") await journalQuestionnaireSend(id);
    if (action === "createQuestionnaireFollowupTask") await createQuestionnaireFollowupTask(id);
    if (action === "cancelQuestionnaireSend") await patchEntity("questionnaireSends", id, { status: "cancelled" }, "Envoi archive");
    if (action === "manageRebooking") await patchRebooking(id, "managed", "Rebooking marque gere");
    if (action === "rebookedRebooking") await patchRebooking(id, "rebooked", "Rebooking complete");
    if (action === "coachAbsenceRebooking") await patchRebooking(id, "coach_absence", "Classe absence coach");
    if (action === "reopenRebooking") await patchRebooking(id, "open", "Rebooking rouvert");
    if (action === "confirmImpact") await patchEntity("impacts", id, { status: "confirmed" }, "Impact confirme");
    if (action === "cancelImpact") await patchEntity("impacts", id, { status: "cancelled" }, "Impact annule");
    if (action === "createAlumniTask") await createAlumniTask(id);
    if (action === "markAlumniContacted") await patchEntity("alumni", id, { status: "contacted", lastContactAt: todayIso() }, "Alumni marque contacte");
    if (action === "markAlumniDoNotContact") await patchEntity("alumni", id, { status: "do_not_contact" }, "Alumni classe ne pas contacter");
  } catch (error) {
    pushError(`${action}: ${humanizeFirebaseError(error)}`);
  } finally {
    if (lockAction) endActionFeedback(actionEl);
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const submitButton = form.querySelector("button[type='submit']");
  try {
    beginActionFeedback(submitButton);
    if (form.dataset.form === "quickNote") await createManualTask(data);
    if (form.dataset.form === "client") await saveClient(form.dataset.id, data);
    if (form.dataset.form === "clientCreate") await createClient(data);
    if (form.dataset.form === "questionnaireSend") await journalQuestionnaireSend(data.clientId);
    if (form.dataset.form === "rebookingCreate") await createRebooking(data);
    if (form.dataset.form === "impactCreate") await createImpact(data);
    if (form.dataset.form === "alumniCreate") await createAlumni(data);
  } catch (error) {
    pushError(`${form.dataset.form}: ${humanizeFirebaseError(error)}`);
  } finally {
    endActionFeedback(submitButton);
  }
});

document.addEventListener("change", (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  if (actionEl.dataset.action === "selectCoach") {
    state.selectedCoachId = actionEl.value;
    subscribeCoachData();
    render();
  }
  if (actionEl.dataset.action === "selectPerformancePeriod") {
    state.filter.performancePeriod = actionEl.value;
    render();
  }
});

document.addEventListener("click", (event) => {
  const tabEl = event.target.closest("[data-tab]");
  if (!tabEl) return;
  state.tab = tabEl.dataset.tab;
  render();
});

document.addEventListener("click", (event) => {
  const filterEl = event.target.closest("[data-filter]");
  if (!filterEl) return;
  state.filter[filterEl.dataset.filter] = filterEl.dataset.value;
  render();
});

async function seedCoaches() {
  requireAdmin();
  await Promise.all(PILOT_COACHES.map((coach) => setDoc(doc(db, "coaches", coach.id), {
    ...coach,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_seed"
  }, { merge: true })));
  await loadCoaches();
  state.selectedCoachId = chooseInitialCoach();
  subscribeCoachData();
  showToast("Coachs initialises.");
  render();
}

async function seedPilotData() {
  requireAdmin();
  if (!state.selectedCoachId) throw new Error("Selectionne un coach avant de creer les donnees pilotes.");
  const coachId = state.selectedCoachId;
  await Promise.all(SAMPLE_CLIENTS.map((client) => setDoc(doc(db, "clients", `${coachId}-${client.id}`), {
    ...client,
    coachId,
    source: "firebase_seed",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true })));

  const clientId = `${coachId}-demo-caroline-gaudreault`;
  await setDoc(doc(db, "tasks", `${coachId}-task-program-caroline`), {
    coachId,
    clientId,
    clientName: "Caroline Gaudreault",
    type: "program",
    title: "Preparer le prochain programme",
    description: "Programme a avancer selon la prochaine echeance CoachRx.",
    status: "open",
    priority: "P2",
    priorityRank: 2,
    dueAt: todayIso(),
    source: "firebase_seed",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  await setDoc(doc(db, "rebookings", `${coachId}-rebooking-emilie`), {
    coachId,
    clientId: `${coachId}-demo-emilie-gervais`,
    clientName: "Emilie Gervais",
    sessionsToRebook: 1,
    status: "open",
    detectedAt: todayIso(),
    history: [],
    source: "firebase_seed",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  await setDoc(doc(db, "questionnaireResponses", `${coachId}-questionnaire-michael-demo`), {
    coachId,
    clientId: `${coachId}-demo-michael-grondin`,
    clientName: "Michael Grondin",
    clientPhoneNormalized: "8192771825",
    triageStatus: "vert",
    coachActionType: "lire_le_suivi",
    processingStatus: "to_read",
    submittedAt: new Date().toISOString(),
    answers: {
      general_state: "Tres bien",
      motivation_level: "Tres elevee",
      program_fit: "Tres adapte",
      open_note: "Reponse demo pour valider l'inbox."
    },
    source: "firebase_seed",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  await setDoc(doc(db, "impacts", `${coachId}-impact-demo`), {
    coachId,
    clientName: "Client demo",
    serviceType: "Semi-prive",
    amount: "$0",
    status: "draft",
    impactDate: todayIso(),
    note: "Impact demo a confirmer ou annuler.",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  await setDoc(doc(db, "alumni", `${coachId}-alumni-demo`), {
    coachId,
    name: "Laura Pelletier",
    phoneNormalized: "5145551099",
    status: "to_work",
    note: "Alumni demo a recontacter.",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  showToast("Donnees pilotes creees pour ce coach.");
}

async function createManualTask(data) {
  if (!state.selectedCoachId) return;
  await addDoc(collection(db, "tasks"), {
    coachId: state.selectedCoachId,
    type: "manual",
    title: data.title,
    description: "",
    status: "open",
    priority: data.priority || "P2",
    priorityRank: priorityRank(data.priority || "P2"),
    dueAt: data.dueAt || todayIso(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app_manual"
  });
  closeModal();
  showToast("Mission creee.");
}

async function saveClient(id, data) {
  await updateDoc(doc(db, "clients", id), {
    name: data.name,
    phoneNormalized: normalizePhone(data.phoneNormalized),
    email: data.email || "",
    membershipLabel: data.membershipLabel || "",
    manualMembershipEndDate: data.manualMembershipEndDate || "",
    kiloPlannedRecurrenceEndDate: data.kiloPlannedRecurrenceEndDate || "",
    riskLevel: data.riskLevel || "none",
    riskNote: data.riskNote || "",
    notes: data.notes || "",
    lastNameSort: lastNameSort(data.name),
    updatedAt: serverTimestamp()
  });
  closeModal();
  showToast("Client mis a jour.");
}

async function createClient(data) {
  await addDoc(collection(db, "clients"), {
    coachId: state.selectedCoachId,
    name: data.name,
    phoneNormalized: normalizePhone(data.phoneNormalized),
    email: data.email || "",
    membershipLabel: data.membershipLabel || "",
    manualMembershipEndDate: data.manualMembershipEndDate || "",
    kiloPlannedRecurrenceEndDate: data.kiloPlannedRecurrenceEndDate || "",
    status: "manual",
    riskLevel: "none",
    notes: data.notes || "",
    lastNameSort: lastNameSort(data.name),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app_manual"
  });
  closeModal();
  showToast("Client ajoute.");
}

async function createRebooking(data) {
  const client = state.data.clients.find((item) => item.id === data.clientId);
  await addDoc(collection(db, "rebookings"), {
    coachId: state.selectedCoachId,
    clientId: data.clientId,
    clientName: client?.name || "",
    sessionsToRebook: Number(data.sessionsToRebook || 1),
    status: "open",
    detectedAt: todayIso(),
    note: data.note || "",
    history: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app_manual"
  });
  closeModal();
  showToast("Rebooking ajoute.");
}

async function createImpact(data) {
  await addDoc(collection(db, "impacts"), {
    coachId: state.selectedCoachId,
    clientName: data.clientName,
    serviceType: data.serviceType || "",
    amount: data.amount || "",
    status: "draft",
    impactDate: data.impactDate || todayIso(),
    note: data.note || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app_manual"
  });
  closeModal();
  showToast("Impact ajoute.");
}

async function createAlumni(data) {
  await addDoc(collection(db, "alumni"), {
    coachId: state.selectedCoachId,
    name: data.name,
    phoneNormalized: normalizePhone(data.phoneNormalized),
    email: data.email || "",
    status: "to_work",
    nextFollowupAt: data.nextFollowupAt || "",
    note: data.note || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app_manual"
  });
  closeModal();
  showToast("Alumni ajoute.");
}

async function journalQuestionnaireSend(clientId) {
  const client = state.data.clients.find((item) => item.id === clientId);
  if (!client) throw new Error("Client introuvable.");
  if (!client.phoneNormalized) throw new Error("Telephone manquant. Le matching et l'envoi se font par telephone.");
  await addDoc(collection(db, "questionnaireSends"), {
    coachId: state.selectedCoachId,
    clientId: client.id,
    clientName: client.name || "",
    clientPhoneNormalized: normalizePhone(client.phoneNormalized),
    status: "prepared",
    deliveryStatus: "pending_backend",
    preparedAt: new Date().toISOString(),
    note: "Prepare dans Firebase. Envoi GHL a brancher via Cloud Function.",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app"
  });
  closeModal();
  showToast("Envoi questionnaire prepare. GHL reste a brancher cote serveur.");
}

async function createQuestionnaireFollowupTask(sendId) {
  const send = state.data.questionnaireSends.find((item) => item.id === sendId);
  if (!send) return;
  await addDoc(collection(db, "tasks"), {
    coachId: state.selectedCoachId,
    clientId: send.clientId,
    clientName: send.clientName || "",
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
  await patchEntity("questionnaireSends", sendId, { followupTaskCreatedAt: serverTimestamp() }, "Relance creee");
}

async function createAlumniTask(alumniId) {
  const alumni = state.data.alumni.find((item) => item.id === alumniId);
  if (!alumni) return;
  await addDoc(collection(db, "tasks"), {
    coachId: state.selectedCoachId,
    clientName: alumni.name || "",
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
  showToast("Mission alumni creee.");
}

async function patchEntity(collectionName, id, patch, toast) {
  await updateDoc(doc(db, collectionName, id), { ...patch, updatedAt: serverTimestamp() });
  if (toast) showToast(toast);
}

async function patchRebooking(id, status, toast) {
  await patchEntity("rebookings", id, {
    status,
    [`${status}At`]: serverTimestamp()
  }, toast);
}

function openModal(modal) {
  state.modal = modal;
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

function renderErrors() {
  if (!state.errors.length) return "";
  return `
    <section class="notice error">
      <strong>Diagnostic Firebase</strong>
      ${state.errors.slice(-4).map((message) => `<p>${escapeHtml(message)}</p>`).join("")}
    </section>
  `;
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
    "openQuickNote",
    "openClientForm",
    "openQuestionnaireSend",
    "openRebookingForm",
    "openImpactForm",
    "openAlumniForm",
    "openClient"
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
  if (shouldRender) renderIfReady();
}

function showDataError(section, error) {
  pushError(`${section}: ${humanizeFirebaseError(error)}`);
}

function humanizeFirebaseError(error) {
  const code = error?.code || "erreur";
  const message = error?.message || "";
  if (code === "failed-precondition" && message.includes("indexes")) {
    return "Index Firestore manquant. Publie les indexes avec firebase deploy --only firestore:indexes.";
  }
  if (code === "permission-denied") {
    return "Permission refusee. Verifie ton acces Firestore ou le coach selectionne.";
  }
  if (code === "unavailable") {
    return "Firebase temporairement indisponible. Reessaie dans quelques secondes.";
  }
  return `${code} ${message}`.trim();
}

function filterButton(group, value, label, count) {
  const active = state.filter[group] === value;
  return `<button class="chip ${active ? "active" : ""}" data-filter="${group}" data-value="${value}">${label} <span>${count}</span></button>`;
}

function activeCoachRecord() {
  return state.coaches.find((coach) => coach.id === state.selectedCoachId);
}

function latestSendForClient(clientId) {
  return state.data.questionnaireSends.find((send) => send.clientId === clientId);
}

function sortTasks(a, b) {
  return (a.priorityRank || 9) - (b.priorityRank || 9)
    || dateValue(a.dueAt) - dateValue(b.dueAt)
    || String(a.title || "").localeCompare(String(b.title || ""));
}

function periodFiltered(items, field) {
  const now = new Date();
  const period = state.filter.performancePeriod;
  return items.filter((item) => {
    const value = dateValue(item[field] || item.createdAt);
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

function renderAnswerSummary(response) {
  const answers = response.answers || {};
  const known = [
    ["Etat", answers.general_state],
    ["Motivation", answers.motivation_level],
    ["Objectif", answers.goal_status],
    ["Programme", answers.program_fit],
    ["Douleur", answers.pain_status],
    ["Note", answers.open_note]
  ].filter(([, value]) => value);
  if (!known.length) return "";
  return known.map(([label, value]) => `<span>${label}: ${escapeHtml(value)}</span>`).join("");
}

function fromDoc(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function isBootstrapAdmin(user) {
  return (user.email || "").toLowerCase() === "info@crossfitstbasilelegrand.com";
}

function requireAdmin() {
  if (state.profile?.role !== "admin") throw new Error("Action reservee admin.");
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
    coach_note: "Note coach",
    manual: "Manuel"
  };
  return labels[type] || "Tache";
}

function questionnaireSendStatusLabel(status) {
  const labels = {
    prepared: "prepare",
    sent: "envoye",
    answered: "repondu",
    error: "erreur",
    cancelled: "archive"
  };
  return labels[status] || "prepare";
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
  if (value === "orange" || value === "jaune") return "amber";
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
    managed: "Gere",
    rebooked: "Rebooke",
    coach_absence: "Absence coach",
    archived: "Archive"
  };
  return labels[value] || "Ouvert";
}

function riskOptions(current) {
  return [
    ["none", "Aucun"],
    ["low", "Bas"],
    ["medium", "Moyen"],
    ["high", "Eleve"]
  ].map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("");
}

function priorityRank(priority) {
  if (priority === "P1") return 1;
  if (priority === "P3") return 3;
  return 2;
}

function dateValue(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return new Date(value).getTime() || 0;
}

function formatDate(value) {
  const timestamp = dateValue(value);
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

function daysSince(value) {
  const timestamp = dateValue(value);
  if (!timestamp) return 0;
  return Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
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
