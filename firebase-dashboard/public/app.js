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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const state = {
  user: null,
  profile: null,
  coaches: [],
  selectedCoachId: "",
  tab: "todo",
  data: {
    tasks: [],
    clients: [],
    questionnaireResponses: [],
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

onAuthStateChanged(auth, async (user) => {
  cleanupSubscriptions();
  state.user = user;
  state.profile = null;
  if (!user) {
    renderLogin();
    return;
  }

  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) {
    renderPendingAccess(user);
    return;
  }

  state.profile = { id: profileSnap.id, ...profileSnap.data() };
  if (!state.profile.active) {
    renderPendingAccess(user, "Ton acces existe, mais il n'est pas encore actif.");
    return;
  }

  await loadCoaches();
  state.selectedCoachId = state.profile.role === "admin"
    ? state.coaches[0]?.id || state.profile.coachId
    : state.profile.coachId;
  subscribeCoachData();
  render();
});

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
        <strong>UID:</strong> ${escapeHtml(user.uid)}
      </div>
      <button class="secondary" data-action="logout">Changer de compte</button>
    </main>
  `;
}

async function loadCoaches() {
  const snap = await getDocs(query(collection(db, "coaches"), where("active", "==", true), orderBy("name")));
  state.coaches = snap.docs.map((coachDoc) => ({ id: coachDoc.id, ...coachDoc.data() }));
}

function subscribeCoachData() {
  cleanupSubscriptions();
  const coachId = state.selectedCoachId;
  if (!coachId) {
    render();
    return;
  }

  state.unsubscribers.push(onSnapshot(
    query(collection(db, "tasks"), where("coachId", "==", coachId), where("status", "==", "open"), orderBy("priorityRank"), orderBy("dueAt"), limit(80)),
    (snap) => {
      state.data.tasks = snap.docs.map(fromDoc);
      render();
    }
  ));

  state.unsubscribers.push(onSnapshot(
    query(collection(db, "clients"), where("coachId", "==", coachId), where("status", "in", ["active", "manual"]), orderBy("lastNameSort"), limit(120)),
    (snap) => {
      state.data.clients = snap.docs.map(fromDoc);
      render();
    }
  ));

  state.unsubscribers.push(onSnapshot(
    query(collection(db, "questionnaireResponses"), where("coachId", "==", coachId), where("processingStatus", "in", ["to_read", "unmatched"]), orderBy("submittedAt", "desc"), limit(50)),
    (snap) => {
      state.data.questionnaireResponses = snap.docs.map(fromDoc);
      render();
    }
  ));

  state.unsubscribers.push(onSnapshot(
    query(collection(db, "rebookings"), where("coachId", "==", coachId), where("status", "==", "open"), orderBy("detectedAt", "desc"), limit(80)),
    (snap) => {
      state.data.rebookings = snap.docs.map(fromDoc);
      render();
    }
  ));
}

function render() {
  if (!state.user || !state.profile) return;

  const activeCoach = state.coaches.find((coach) => coach.id === state.selectedCoachId);
  const urgentTasks = state.data.tasks.filter((task) => task.priority === "P1").length;
  const risks = state.data.clients.filter((client) => ["medium", "high"].includes(client.riskLevel)).length;
  const impacts = state.data.impacts.filter((impact) => impact.status === "confirmed").length;

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
          <button class="primary" data-action="createManualTask">Ajouter une note</button>
        </header>
        <section class="grid-stats">
          <div class="stat"><strong>${state.data.tasks.length}</strong><span>actions ouvertes</span></div>
          <div class="stat"><strong>${urgentTasks}</strong><span>urgent</span></div>
          <div class="stat"><strong>${risks}</strong><span>risques coach</span></div>
          <div class="stat"><strong>${impacts}</strong><span>impacts semaine</span></div>
        </section>
        ${renderActiveTab()}
      </main>
    </div>
  `;
}

function renderCoachSelect() {
  return `
    <label>
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
  if (state.tab === "todo") return renderTodo();
  if (state.tab === "clients") return renderClients();
  if (state.tab === "questionnaires") return renderQuestionnaires();
  if (state.tab === "rebooking") return renderRebooking();
  if (state.tab === "performance") return renderPerformance();
  if (state.tab === "alumni") return renderAlumni();
  return renderGuide();
}

function renderTodo() {
  return panel("To-do du coach", "Les actions concretes a faire aujourd'hui.", renderCards(state.data.tasks, renderTaskCard, "Aucune action ouverte."));
}

function renderClients() {
  return panel("Portefeuille clients", "Clique un client pour ouvrir sa fiche detaillee.", renderCards(state.data.clients, renderClientCard, "Aucun client charge."));
}

function renderQuestionnaires() {
  return panel("Inbox questionnaires", "Les reponses clients qui demandent une lecture ou une validation.", renderCards(state.data.questionnaireResponses, renderQuestionnaireCard, "Aucune reponse a traiter."));
}

function renderRebooking() {
  return panel("Rebooking", "Les seances a replacer ou confirmer.", renderCards(state.data.rebookings, renderRebookingCard, "Aucun rebooking ouvert."));
}

function renderPerformance() {
  return panel("Performance", "Churn, nouveaux clients, check-ups et impacts seront branches dans cette vue.", `<div class="empty">Module en cours de migration Firebase.</div>`);
}

function renderAlumni() {
  return panel("Alumni", "Liste d'anciens clients a travailler sans melanger la performance.", `<div class="empty">Module en cours de migration Firebase.</div>`);
}

function renderGuide() {
  return panel("Guide & modules", "Ce que cette V1 Firebase remplace progressivement.", `
    <div class="cards">
      <article class="card"><div><h4>Pourquoi Firebase</h4><p class="meta">Actions rapides, donnees temps reel, connexions coach et backend fiable.</p></div></article>
      <article class="card"><div><h4>Google Sheets reste utile</h4><p class="meta">Sheets devient source/import/export, mais pas le moteur interactif quotidien.</p></div></article>
      <article class="card"><div><h4>GHL et questionnaires</h4><p class="meta">Les actions sensibles passeront par Cloud Functions quand le projet sera sur Blaze.</p></div></article>
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
    <article class="card">
      <div>
        <h4>${escapeHtml(task.title || "Tache")}</h4>
        <p class="meta">${escapeHtml(task.description || "")}</p>
        <span class="pill ${task.priority === "P1" ? "red" : "amber"}">${escapeHtml(task.priority || "P2")}</span>
        <span class="pill">${escapeHtml(task.type || "manual")}</span>
      </div>
      <button class="primary" data-action="completeTask" data-id="${escapeHtml(task.id)}">Fait</button>
    </article>
  `;
}

function renderClientCard(client) {
  return `
    <article class="card clickable" data-action="openClient" data-id="${escapeHtml(client.id)}">
      <div>
        <h4>${escapeHtml(client.name || "Client")}</h4>
        <p class="meta">
          ${escapeHtml(client.membershipLabel || "Membership non defini")}<br>
          Telephone: ${escapeHtml(client.phoneNormalized || "a ajouter")}
        </p>
      </div>
      <span class="pill ${client.riskLevel === "high" ? "red" : client.riskLevel === "medium" ? "amber" : ""}">
        Risque: ${escapeHtml(client.riskLevel || "none")}
      </span>
    </article>
  `;
}

function renderQuestionnaireCard(response) {
  const statusClass = response.triageStatus === "rouge" ? "red" : response.triageStatus === "vert" ? "green" : "amber";
  return `
    <article class="card">
      <div>
        <h4>${escapeHtml(response.clientName || "Reponse sans client")}</h4>
        <p class="meta">
          ${escapeHtml(response.coachActionType || "Lecture requise")}<br>
          Tel: ${escapeHtml(response.clientPhoneNormalized || "non matche")}
        </p>
        <span class="pill ${statusClass}">${escapeHtml(response.triageStatus || "a lire")}</span>
      </div>
      <button class="secondary" data-action="markResponseRead" data-id="${escapeHtml(response.id)}">Lu</button>
    </article>
  `;
}

function renderRebookingCard(rebooking) {
  return `
    <article class="card">
      <div>
        <h4>${escapeHtml(rebooking.clientName || "Client")}</h4>
        <p class="meta">${escapeHtml(rebooking.sessionsToRebook || "1")} seance(s) a rebooker</p>
      </div>
      <button class="primary" data-action="manageRebooking" data-id="${escapeHtml(rebooking.id)}">Gere</button>
    </article>
  `;
}

function tabTitle() {
  return tabs.find(([id]) => id === state.tab)?.[1] || "Dashboard";
}

function tabDescription() {
  const descriptions = {
    todo: "Priorites quotidiennes du coach.",
    clients: "Vue claire des clients actifs et manuels.",
    questionnaires: "Reponses client-coach et suivis a traiter.",
    rebooking: "Seances a replacer sans perdre le fil.",
    performance: "Indicateurs et generation de revenus.",
    alumni: "Anciens clients a recontacter.",
    guide: "Structure et modules du dashboard."
  };
  return descriptions[state.tab] || "";
}

function fromDoc(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function cleanupSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

document.addEventListener("click", async (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === "login") await signInWithPopup(auth, provider);
  if (action === "logout") await signOut(auth);
  if (action === "completeTask") await updateDoc(doc(db, "tasks", actionEl.dataset.id), { status: "done", updatedAt: serverTimestamp() });
  if (action === "markResponseRead") await updateDoc(doc(db, "questionnaireResponses", actionEl.dataset.id), { processingStatus: "read", updatedAt: serverTimestamp() });
  if (action === "manageRebooking") await updateDoc(doc(db, "rebookings", actionEl.dataset.id), { status: "managed", managedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  if (action === "openClient") alert("Fiche client popup: prochaine etape de migration.");
  if (action === "createManualTask") await createManualTask();
});

document.addEventListener("change", (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  if (actionEl.dataset.action === "selectCoach") {
    state.selectedCoachId = actionEl.value;
    subscribeCoachData();
    render();
  }
});

document.addEventListener("click", (event) => {
  const tabEl = event.target.closest("[data-tab]");
  if (!tabEl) return;
  state.tab = tabEl.dataset.tab;
  render();
});

async function createManualTask() {
  if (!state.selectedCoachId) return;
  const title = prompt("Note rapide / mission a ajouter");
  if (!title) return;
  const ref = doc(collection(db, "tasks"));
  await setDoc(ref, {
    coachId: state.selectedCoachId,
    type: "manual",
    title,
    description: "",
    status: "open",
    priority: "P2",
    priorityRank: 2,
    dueAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "firebase_app_manual"
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
