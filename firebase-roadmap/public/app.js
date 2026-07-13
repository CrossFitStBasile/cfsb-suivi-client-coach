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
  getFirestore,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const STATUS_OPTIONS = [
  ["to_read", "A lire"],
  ["message_to_send", "Message a envoyer"],
  ["meeting_planned", "Rencontre a faire"],
  ["action_required", "Suivi a faire"],
  ["meeting_done", "Terminee"],
  ["ready_to_archive", "Terminee"],
  ["archived", "Archivee"]
];
const OWNER_OPTIONS = ["Michael", "Gabriel", "Michael + Gabriel"];
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS);
const WORKFLOW_STATUS_OPTIONS = STATUS_OPTIONS.filter(([id]) => ["to_read", "message_to_send", "meeting_planned", "action_required"].includes(id));
const WORKFLOW_STATUS_IDS = WORKFLOW_STATUS_OPTIONS.map(([id]) => id);
const TASK_PRIORITY_OPTIONS = [
  ["P1", "Urgent"],
  ["P2", "Normal"],
  ["P3", "Faible"]
];
const TASK_FILTER_OPTIONS = [
  ["all", "Toutes"],
  ["urgent", "Priorite haute"],
  ["roadmap", "Roadmaps"],
  ["career", "Parcours"],
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

const state = {
  user: null,
  profile: null,
  submissions: [],
  ownerNotes: {},
  teamMembers: [],
  departments: [],
  forms: {},
  careerMilestones: [],
  careerUpdates: [],
  managementTasks: [],
  view: "todo",
  roadmapView: "queue",
  selectedId: "",
  selectedMemberId: "",
  editingMemberId: "",
  memberProfileSection: "overview",
  careerEditorId: "",
  careerDraft: null,
  roadmapCompletionId: "",
  teamActionMemberId: "",
  showArchivedCareer: false,
  taskFilter: "all",
  taskOwnerFilter: "all",
  teamSearch: "",
  filters: { search: "", role: "all", cycle: "all", status: "all" },
  unsubscribers: [],
  busy: false,
  loadError: ""
};

const appRoot = document.querySelector("#app");
const toastRoot = document.querySelector("#toast");
let toastTimer = null;

onAuthStateChanged(auth, async (user) => {
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

function renderLogin() {
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
        <div class="auth-note">Environnement de test prive. Les roadmaps actuellement utilisees restent dans le systeme officiel pendant la validation.</div>
      </section>
    </main>
  `;
  document.querySelector("#loginButton")?.addEventListener("click", login);
  refreshIcons();
}

function renderAccessDenied(message) {
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
    renderApp();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "ownerNotes"), (snapshot) => {
    state.ownerNotes = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()]));
    renderApp();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "teamMembers"), (snapshot) => {
    state.teamMembers = snapshot.docs.map(fromDoc).sort(sortTeamMembers);
    renderApp();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "orgDepartments"), (snapshot) => {
    state.departments = snapshot.docs.map(fromDoc).sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));
    renderApp();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "roadmapForms"), (snapshot) => {
    state.forms = Object.fromEntries(snapshot.docs.map((item) => [item.data().version || item.id, item.data()]));
    renderApp();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "careerMilestones"), (snapshot) => {
    state.careerMilestones = snapshot.docs.map(fromDoc).sort(sortCareerMilestones);
    renderApp();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "careerUpdates"), (snapshot) => {
    state.careerUpdates = snapshot.docs.map(fromDoc).sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
    renderApp();
  }, dataError));
  state.unsubscribers.push(onSnapshot(collection(db, "managementTasks"), (snapshot) => {
    state.managementTasks = snapshot.docs.map(fromDoc).sort(sortManagementTasks);
    renderApp();
  }, dataError));
}

function cleanupSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function dataError(error) {
  state.loadError = friendlyError(error);
  renderApp();
}

function renderApp() {
  if (!state.user || !state.profile) return;
  const viewMeta = {
    todo: ["Pilotage quotidien", "A faire", "Les prochaines actions de Michael et Gabriel, rassemblees au meme endroit."],
    team: ["Dossiers longitudinaux", state.selectedMemberId ? "Dossier membre" : "Equipe", state.selectedMemberId ? "Roadmaps, actions et evolution de carriere dans un seul dossier." : "Une vue claire de chaque membre et de ce qui demande votre attention."],
    roadmaps: ["Rencontres trimestrielles", "Roadmaps", "Traiter les nouvelles reponses, preparer les rencontres et conserver l'historique."]
  }[state.view] || ["Dashboard Equipe", "Dashboard Equipe", ""];
  appRoot.innerHTML = `
    <div class="team-command-shell">
      ${renderCommandSidebar()}
      <div class="command-main">
        <header class="command-topbar">
          <div class="mobile-brand"><span class="brand-mark">CF</span><strong>Dashboard Equipe</strong></div>
          <div class="top-actions">
            <div class="realtime">Temps reel Firestore</div>
            <button class="button icon-only" id="reloadButton" type="button" title="Recharger les donnees"><i data-lucide="refresh-cw"></i></button>
            <button class="button icon-only" id="logoutButton" type="button" title="Deconnexion"><i data-lucide="log-out"></i></button>
          </div>
        </header>
        <main class="command-content">
          <section class="command-heading">
            <div><p class="eyebrow">${escapeHtml(viewMeta[0])}</p><h1>${escapeHtml(viewMeta[1])}</h1><p>${escapeHtml(viewMeta[2])}</p></div>
            <div class="environment-badge">FIREBASE · TEMPS REEL</div>
          </section>
          ${state.loadError ? `<div class="auth-note">${escapeHtml(state.loadError)}</div>` : ""}
          ${state.view === "todo" ? renderTodoView() : state.view === "team" ? renderTeamView() : renderRoadmapModule()}
        </main>
      </div>
      ${state.careerEditorId ? renderCareerEditor() : ""}
      ${state.roadmapCompletionId ? renderRoadmapCompletionModal() : ""}
      ${state.teamActionMemberId ? renderTeamActionModal() : ""}
    </div>
  `;
  bindAppEvents();
  refreshIcons();
}

function renderCommandSidebar() {
  const openTasks = allOpenManagementTasks().length;
  const queueCount = state.submissions.filter((item) => submissionBucket(item) === "queue").length;
  return `
    <aside class="command-sidebar">
      <div class="command-brand">
        <div class="brand-mark">CF</div>
        <div><strong>Dashboard Equipe</strong><span>CrossFit St-Basile</span></div>
      </div>
      <nav class="command-nav" aria-label="Navigation principale">
        ${commandNavButton("todo", "list-checks", "A faire", openTasks)}
        ${commandNavButton("team", "users-round", "Equipe", state.teamMembers.filter((item) => item.active !== false).length)}
        ${commandNavButton("roadmaps", "clipboard-list", "Roadmaps", queueCount)}
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
        ${metric(counts.message_to_send, "Message a envoyer", "amber", "message_to_send")}
        ${metric(counts.meeting_planned, "Rencontre a faire", "blue", "meeting_planned")}
        ${metric(counts.action_required, "Suivi a faire", "red", "action_required")}
      </section>
    ` : ""}
    ${renderSubmissionWorkspace()}
  `;
}

function roadmapTab(view, label, count, icon = "") {
  return `<button class="tab-button ${state.roadmapView === view ? "active" : ""}" data-roadmap-view="${view}" type="button">${icon ? `<i data-lucide="${icon}"></i>` : ""}${escapeHtml(label)} <span>${count || 0}</span></button>`;
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
            <select name="teamMemberId"><option value="">Aucun membre</option>${state.teamMembers.filter((item) => item.active !== false).map((member) => `<option value="${escapeAttr(member.id)}">${escapeHtml(member.name)}</option>`).join("")}</select>
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

function renderTaskCard(task) {
  const member = task.teamMemberId ? state.teamMembers.find((item) => item.id === task.teamMemberId) : null;
  const sourceLabel = task.sourceType === "roadmap" ? "Roadmap" : task.sourceType === "career" ? "Parcours" : "Action manuelle";
  const sourceIcon = task.sourceType === "roadmap" ? "clipboard-list" : task.sourceType === "career" ? "route" : "check-square";
  const overdue = taskIsOverdue(task);
  return `
    <article class="task-card ${task.priority === "P1" ? "urgent" : ""} ${overdue ? "overdue" : ""}">
      <button class="task-card-main" data-open-task-source="${escapeAttr(task.id)}" type="button">
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
          <button class="button icon-only task-complete" data-complete-task="${escapeAttr(task.id)}" type="button" title="Marquer comme terminee"><i data-lucide="check"></i></button>
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

function submissionBucket(submission) {
  if (isDeleted(submission)) return "trash";
  if (["meeting_done", "ready_to_archive", "archived"].includes(submission.status)) return "history";
  return "queue";
}

function contextualStatusCounts() {
  const counts = Object.fromEntries(WORKFLOW_STATUS_OPTIONS.map(([id]) => [id, 0]));
  state.submissions.forEach((item) => {
    if (submissionBucket(item) !== "queue" || !matchesRoadmapFilters(item, false)) return;
    const status = item.status || "to_read";
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

function matchesRoadmapFilters(submission, includeStatus = true) {
  const search = normalize(state.filters.search);
  if (state.filters.role !== "all" && submission.selectedRoleLabel !== state.filters.role) return false;
  if (state.filters.cycle !== "all" && submission.cycleId !== state.filters.cycle) return false;
  if (includeStatus && state.roadmapView === "queue" && state.filters.status !== "all" && submission.status !== state.filters.status) return false;
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
          ${state.teamMembers.map((item) => `<option value="${escapeAttr(item.id)}" ${member?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}${item.active === false ? " (inactif)" : ""}</option>`).join("")}
        </select>
      </label>
      <div class="roadmap-action-controls">
        ${action ? `<button class="button primary" data-roadmap-action="${action.id}" data-submission-id="${escapeAttr(submission.id)}" type="button">${escapeHtml(action.label)} <i data-lucide="${action.icon}"></i></button>` : ""}
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

function roadmapActionDefinition(status) {
  return {
    to_read: { id: "mark_read", label: "Marquer comme lue", icon: "check" },
    message_to_send: { id: "message_sent", label: "Message envoye", icon: "send" },
    meeting_planned: { id: "meeting_done", label: "Rencontre faite", icon: "circle-check-big" },
    action_required: { id: "followup_done", label: "Suivi fait", icon: "check-check" }
  }[status] || null;
}

function roadmapStepInstruction(submission, notes) {
  if (isDeleted(submission)) return "Restaurer cette roadmap ou la supprimer definitivement.";
  if (submissionBucket(submission) === "history") return "Cette roadmap est terminee et reste consultable dans l'historique.";
  if (submission.status === "message_to_send") return "Envoyer manuellement le message dans Google Chat, puis confirmer ici.";
  if (submission.status === "meeting_planned") return "Faire la rencontre reservee dans votre logiciel habituel.";
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
  const isCreating = state.editingMemberId === "__new__";
  const editing = state.teamMembers.find((item) => item.id === state.editingMemberId) || null;
  const unlinked = unlinkedSubmissions();
  const search = normalize(state.teamSearch);
  const visibleMembers = state.teamMembers.filter((member) => !search || normalize([member.name, member.displayTitle, member.email].join(" ")).includes(search));
  return `
    <section class="panel team-toolbar">
      <div>
        <h2>Dossiers de l'equipe</h2>
        <p>${visibleMembers.length} membre(s) visible(s). Chaque dossier rassemble les actions, roadmaps et le parcours.</p>
      </div>
      <button class="button primary" id="addMemberButton" type="button"><i data-lucide="user-plus"></i> Ajouter un membre</button>
    </section>
    <section class="panel team-search-bar">
      <label class="field"><span class="visually-hidden">Rechercher un membre</span><input id="teamSearchInput" value="${escapeAttr(state.teamSearch)}" placeholder="Rechercher par nom, role ou courriel..."></label>
    </section>
    ${unlinked.length ? `
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
        ${visibleMembers.length ? "" : `<section class="panel empty-state"><i data-lucide="search-x"></i><div>Aucun membre ne correspond a cette recherche.</div></section>`}
      </section>
      ${state.editingMemberId ? renderMemberForm(editing, isCreating) : ""}
    </div>
  `;
}

function renderTeamMemberCard(member) {
  const submissions = submissionsForMember(member).filter((item) => !isDeleted(item));
  const tasks = tasksForMember(member.id);
  const milestones = milestonesForMember(member).filter((item) => ["planned", "in_progress", "blocked"].includes(item.status));
  const latest = submissions[0] || null;
  return `
    <div class="member-card ${member.active === false ? "inactive" : ""}">
      <button class="member-card-main" data-open-member="${escapeAttr(member.id)}" type="button">
        <span class="member-avatar">${escapeHtml(initials(member.name))}</span>
        <span class="member-card-copy">
          <strong>${escapeHtml(member.name || "Sans nom")}</strong>
          <small>${escapeHtml(member.displayTitle || "Role a preciser")}</small>
          <span class="member-card-stats">
            <span class="${tasks.length ? "needs-attention" : ""}">${tasks.length} action(s)</span>
            <span>${submissions.length} roadmap(s)</span>
            <span>${milestones.length} etape(s)</span>
          </span>
          <small>${latest ? `Derniere roadmap: ${formatShortDate(latest.submittedAt)}` : "Aucune roadmap au dossier"}</small>
        </span>
        <i data-lucide="chevron-right"></i>
      </button>
      <button class="member-edit member-action" data-create-member-action="${escapeAttr(member.id)}" type="button" title="Creer une action pour ${escapeAttr(member.name || "ce membre")}"><i data-lucide="plus"></i></button>
    </div>
  `;
}

function renderMemberForm(editing, isCreating = false) {
  return `
    <form class="panel member-form" id="memberForm">
      <h2>${editing ? "Modifier le membre" : "Ajouter un membre"}</h2>
      <input type="hidden" name="memberId" value="${escapeAttr(editing?.id || "")}">
      <label class="field">Nom<input name="name" required value="${escapeAttr(editing?.name || "")}"></label>
      <label class="field">Courriel<input name="email" type="email" value="${escapeAttr(editing?.email || "")}" placeholder="nom@exemple.com"></label>
      <label class="field">Departement
        <select name="departmentId" required>
          ${state.departments.map((department) => `<option value="${escapeAttr(department.id)}" ${editing?.departmentId === department.id ? "selected" : ""}>${escapeHtml(department.label)}</option>`).join("")}
        </select>
      </label>
      <label class="field">Titre affiche<input name="displayTitle" required value="${escapeAttr(editing?.displayTitle || "")}"></label>
      <label class="field">Direction de carriere visee<input name="careerTarget" value="${escapeAttr(editing?.careerTarget || "")}" placeholder="Coach professionnel, leadership, specialite..."></label>
      <label class="field">Roles du formulaire<input name="roleIds" value="${escapeAttr((editing?.roleIds || []).join(", "))}" placeholder="coach_professionnel"></label>
      <label class="field">Autres noms reconnus<input name="aliases" value="${escapeAttr((editing?.aliases || []).join(", "))}" placeholder="Nom sans accent, ancien nom"></label>
      <label class="field">Ordre<input name="sortOrder" type="number" min="0" step="1" value="${escapeAttr(editing?.sortOrder ?? 100)}"></label>
      <label class="checkbox-line"><input name="active" type="checkbox" ${editing?.active === false ? "" : "checked"}> Membre actif</label>
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
  const completedMilestones = milestones.filter((item) => item.status === "completed");
  const nextMilestone = nextCareerMilestone(milestones);
  const tasks = tasksForMember(member.id);
  return `
    <section class="member-profile">
      <header class="panel member-profile-header">
        <div class="member-profile-title">
          <button class="button icon-only" id="backToTeamButton" type="button" title="Retour a l'equipe"><i data-lucide="arrow-left"></i></button>
          <div>
            <p class="eyebrow">Dossier longitudinal</p>
            <h2>${escapeHtml(member.name || "Sans nom")}</h2>
            <p>${escapeHtml(member.displayTitle || "Role a preciser")}${member.careerTarget ? ` · Vise: ${escapeHtml(member.careerTarget)}` : ""}${member.active === false ? " · Membre inactif" : ""}</p>
          </div>
        </div>
        <div class="member-profile-actions">
          <button class="button primary" data-create-member-action="${escapeAttr(member.id)}" type="button"><i data-lucide="plus"></i> Creer une action</button>
          <button class="button" data-edit-member="${escapeAttr(member.id)}" type="button"><i data-lucide="pencil"></i> Modifier</button>
        </div>
      </header>
      <section class="member-metrics">
        ${profileMetric(tasks.length, "Actions ouvertes")}
        ${profileMetric(submissions.length, "Roadmaps")}
        ${profileMetric(activeMilestones.length, "Etapes actives")}
        ${profileMetric(completedMilestones.length, "Etapes realisees")}
      </section>
      <nav class="member-section-tabs" aria-label="Sections du dossier membre">
        <button class="tab-button ${state.memberProfileSection === "overview" ? "active" : ""}" data-member-section="overview" type="button"><i data-lucide="layout-dashboard"></i> Vue d'ensemble</button>
        <button class="tab-button ${state.memberProfileSection === "actions" ? "active" : ""}" data-member-section="actions" type="button"><i data-lucide="list-checks"></i> Actions (${tasks.length})</button>
        <button class="tab-button ${state.memberProfileSection === "roadmaps" ? "active" : ""}" data-member-section="roadmaps" type="button"><i data-lucide="clipboard-list"></i> Roadmaps (${submissions.length})</button>
        <button class="tab-button ${state.memberProfileSection === "career" ? "active" : ""}" data-member-section="career" type="button"><i data-lucide="route"></i> Parcours CFSB (${milestones.length})</button>
      </nav>
      ${state.memberProfileSection === "roadmaps" ? renderRoadmapHistory(submissions) : state.memberProfileSection === "career" ? renderCareerTimeline(member) : state.memberProfileSection === "actions" ? renderMemberActions(member, tasks) : renderMemberOverview(member, submissions, tasks, milestones, nextMilestone)}
    </section>
  `;
}

function renderMemberOverview(member, submissions, tasks, milestones, nextMilestone) {
  const latest = submissions[0] || null;
  const recent = submissions.slice(0, 3);
  const activeMilestones = milestones.filter((item) => ["planned", "in_progress", "blocked"].includes(item.status)).slice(0, 3);
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
      <article class="panel member-overview-panel overview-wide">
        <div class="section-heading"><div><h3>Roadmaps recentes</h3><p>${latest ? `Derniere reception le ${formatShortDate(latest.submittedAt)}.` : "Aucune roadmap recue."}</p></div><button class="inline-link" data-member-section="roadmaps" type="button">Historique complet</button></div>
        ${recent.length ? `<div class="recent-roadmaps">${recent.map((item) => `<button data-open-submission="${escapeAttr(item.id)}" type="button"><span>${statusPill(item.status)}</span><strong>${escapeHtml(item.cycleId || "Sans trimestre")}</strong><small>${formatDate(item.submittedAt)} · ${completionInfo(item).percent}% complete</small><i data-lucide="arrow-right"></i></button>`).join("")}</div>` : `<div class="empty-state compact-empty"><i data-lucide="clipboard-x"></i><div>Aucune roadmap au dossier.</div></div>`}
      </article>
    </section>
  `;
}

function renderMemberActions(member, tasks) {
  return `
    <section class="panel timeline-panel">
      <div class="section-heading"><div><h3>Actions pour ${escapeHtml(member.name)}</h3><p>Actions manuelles et suivis generes par les roadmaps ou le parcours.</p></div></div>
      <div class="task-list member-task-list">${tasks.length ? tasks.map(renderTaskCard).join("") : `<div class="empty-state"><i data-lucide="circle-check-big"></i><div>Aucune action ouverte pour ce membre.</div></div>`}</div>
    </section>
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
      <button class="career-modal-backdrop" data-close-career type="button" aria-label="Fermer"></button>
      <section class="career-editor panel">
        <header class="career-editor-header">
          <div><p class="eyebrow">${escapeHtml(member.name)}</p><h2 id="careerEditorTitle">${milestone ? "Modifier l'etape" : "Nouvelle etape"}</h2></div>
          <button class="button icon-only" data-close-career type="button" title="Fermer"><i data-lucide="x"></i></button>
        </header>
        <div class="career-editor-scroll">
          <form id="careerForm">
            <input type="hidden" name="milestoneId" value="${escapeAttr(milestone?.id || "")}">
            <label class="field field-wide">Titre<input name="title" required value="${escapeAttr(value.title || "")}" placeholder="Ex.: Devenir autonome sur les fondations"></label>
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
      <button class="career-modal-backdrop" data-close-roadmap-completion type="button" aria-label="Fermer"></button>
      <section class="action-editor panel">
        <header class="career-editor-header">
          <div><p class="eyebrow">Roadmap de ${escapeHtml(name)}</p><h2 id="roadmapCompletionTitle">Terminer la rencontre</h2></div>
          <button class="button icon-only" data-close-roadmap-completion type="button" title="Fermer"><i data-lucide="x"></i></button>
        </header>
        <form id="roadmapCompletionForm" class="action-form">
          <div class="action-modal-intro"><i data-lucide="calendar-check"></i><p>La date et la reservation restent dans votre logiciel habituel. Ici, indique seulement s'il reste une action a faire.</p></div>
          <label class="field">Responsable du suivi
            <select name="reviewerName">${OWNER_OPTIONS.map((owner) => `<option value="${escapeAttr(owner)}" ${(notes.reviewerName || "Michael + Gabriel") === owner ? "selected" : ""}>${escapeHtml(owner)}</option>`).join("")}</select>
          </label>
          <label class="field">Action de suivi <span class="field-optional">facultatif</span>
            <textarea name="nextAction" placeholder="Ex.: Valider son plan de suivis clients. Laisse vide si la rencontre est completement terminee.">${escapeHtml(notes.nextAction || "")}</textarea>
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
      <button class="career-modal-backdrop" data-close-team-action type="button" aria-label="Fermer"></button>
      <section class="action-editor panel">
        <header class="career-editor-header">
          <div><p class="eyebrow">${escapeHtml(member.name)}</p><h2 id="teamActionTitle">Creer une action</h2></div>
          <button class="button icon-only" data-close-team-action type="button" title="Fermer"><i data-lucide="x"></i></button>
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
          <label class="field">Action<input name="title" required maxlength="180" value="${escapeAttr(defaultMemberActionTitle("meeting", member.name))}"></label>
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
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    closeCareerEditor(false);
    closeRoadmapCompletion(false);
    closeTeamAction(false);
    state.view = button.dataset.view;
    state.selectedMemberId = "";
    state.editingMemberId = "";
    state.filters.status = "all";
    ensureSelection();
    renderApp();
  }));
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
  document.querySelectorAll("[data-open-task-source]").forEach((button) => button.addEventListener("click", () => openTaskSource(button.dataset.openTaskSource)));
  document.querySelectorAll("[data-roadmap-action]").forEach((button) => button.addEventListener("click", () => handleRoadmapAction(button.dataset.roadmapAction, button.dataset.submissionId)));
  document.querySelector("#printButton")?.addEventListener("click", () => window.print());
  document.querySelector("#restoreButton")?.addEventListener("click", restoreSelected);
  document.querySelector("#trashButton")?.addEventListener("click", moveSelectedToTrash);
  document.querySelector("#restoreTrashButton")?.addEventListener("click", restoreSelectedFromTrash);
  document.querySelector("#deleteForeverButton")?.addEventListener("click", deleteSelectedForever);
  document.querySelector("#memberAssignment")?.addEventListener("change", assignSelectedMember);
  document.querySelectorAll("[data-open-member]").forEach((button) => button.addEventListener("click", () => {
    state.view = "team";
    state.selectedMemberId = button.dataset.openMember;
    state.editingMemberId = "";
    state.memberProfileSection = "overview";
    state.showArchivedCareer = false;
    renderApp();
  }));
  document.querySelectorAll("[data-edit-member]").forEach((button) => button.addEventListener("click", () => {
    state.view = "team";
    state.selectedMemberId = "";
    state.editingMemberId = button.dataset.editMember;
    renderApp();
  }));
  document.querySelectorAll("[data-create-member-action]").forEach((button) => button.addEventListener("click", () => {
    state.teamActionMemberId = button.dataset.createMemberAction;
    renderApp();
  }));
  document.querySelector("#addMemberButton")?.addEventListener("click", () => {
    state.selectedMemberId = "";
    state.editingMemberId = "__new__";
    renderApp();
  });
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
    closeCareerEditor(false);
    renderApp();
  });
  document.querySelectorAll("[data-member-section]").forEach((button) => button.addEventListener("click", () => {
    state.memberProfileSection = button.dataset.memberSection;
    renderApp();
  }));
  document.querySelector("#addCareerMilestone")?.addEventListener("click", () => {
    state.careerEditorId = "__new__";
    state.careerDraft = { status: "planned", category: "skill", progress: 0 };
    renderApp();
  });
  document.querySelectorAll("[data-open-career]").forEach((button) => button.addEventListener("click", () => {
    state.careerEditorId = button.dataset.openCareer;
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
    renderApp();
  });
  document.querySelector("#memberForm")?.addEventListener("submit", saveTeamMember);
  document.querySelectorAll("[data-close-roadmap-completion]").forEach((button) => button.addEventListener("click", () => closeRoadmapCompletion()));
  document.querySelector("#roadmapCompletionForm")?.addEventListener("submit", completeRoadmapMeeting);
  document.querySelectorAll("[data-close-team-action]").forEach((button) => button.addEventListener("click", () => closeTeamAction()));
  document.querySelector("#teamActionForm")?.addEventListener("submit", saveTeamAction);
  document.querySelectorAll('#teamActionForm input[name="taskKind"]').forEach((input) => input.addEventListener("change", updateTeamActionTitle));
}

function closeCareerEditor(shouldRender = true) {
  state.careerEditorId = "";
  state.careerDraft = null;
  if (shouldRender) renderApp();
}

function closeRoadmapCompletion(shouldRender = true) {
  state.roadmapCompletionId = "";
  if (shouldRender) renderApp();
}

function closeTeamAction(shouldRender = true) {
  state.teamActionMemberId = "";
  if (shouldRender) renderApp();
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
  state.editingMemberId = "";
  state.memberProfileSection = "career";
  state.showArchivedCareer = false;
  if (linked) {
    state.careerEditorId = linked.id;
    state.careerDraft = null;
  } else {
    state.careerEditorId = "__new__";
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
    const batch = writeBatch(db);
    batch.set(milestoneRef, payload, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("career_milestone_saved", milestoneRef.id, {
      teamMemberId: member.id,
      status,
      progress
    }));
    await batch.commit();
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
    const batch = writeBatch(db);
    batch.set(updateRef, {
      milestoneId: milestone.id,
      teamMemberId: milestone.teamMemberId,
      note,
      progress,
      statusSnapshot: nextStatus,
      createdAt: serverTimestamp(),
      createdByUid: state.user.uid,
      createdByName: actorName()
    });
    const milestoneUpdate = {
      progress,
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    };
    if (nextStatus === "completed" && !milestone.completedDate) milestoneUpdate.completedDate = todayInputValue();
    batch.update(doc(db, "careerMilestones", milestone.id), milestoneUpdate);
    batch.set(doc(collection(db, "auditLogs")), auditPayload("career_update_added", milestone.id, {
      teamMemberId: milestone.teamMemberId,
      progress,
      status: nextStatus
    }));
    await batch.commit();
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
    const batch = writeBatch(db);
    batch.update(doc(db, "careerMilestones", milestone.id), {
      archivedAt: restoring ? null : serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload(restoring ? "career_milestone_restored" : "career_milestone_archived", milestone.id, {
      teamMemberId: milestone.teamMemberId
    }));
    await batch.commit();
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
    renderApp();
    return;
  }
  const transitions = {
    mark_read: ["message_to_send", "Roadmap lue. Le message Google Chat est maintenant a envoyer."],
    message_sent: ["meeting_planned", "Message envoye. La rencontre peut etre reservee dans votre logiciel habituel."],
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
    const batch = writeBatch(db);
    batch.update(doc(db, "roadmapSubmissions", submission.id), {
      status: nextStatus,
      archivedAt: null,
      updatedAt: serverTimestamp()
    });
    batch.set(doc(db, "ownerNotes", submission.id), {
      submissionId: submission.id,
      ownerStatus: nextStatus,
      reviewerName,
      nextAction,
      meetingCompletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid,
      updatedByName: actorName()
    }, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("roadmap_meeting_completed", submission.id, {
      status: nextStatus,
      hasFollowup: Boolean(nextAction)
    }));
    await batch.commit();
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
      updatedByUid: state.user.uid
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
  state.busy = true;
  try {
    if (!existingId) {
      const existing = await getDoc(doc(db, "teamMembers", memberId));
      if (existing.exists()) throw new Error("Un dossier existe deja pour ce nom. Modifie le membre existant.");
    }
    const batch = writeBatch(db);
    const memberPayload = {
      name,
      normalizedName: slug(name),
      email: String(data.get("email") || "").trim().toLowerCase(),
      departmentId: String(data.get("departmentId") || "support"),
      displayTitle: String(data.get("displayTitle") || "").trim(),
      careerTarget: String(data.get("careerTarget") || "").trim(),
      roleIds: String(data.get("roleIds") || "").split(/[,;]+/).map((item) => item.trim()).filter(Boolean),
      aliases: String(data.get("aliases") || "").split(/[,;]+/).map((item) => item.trim()).filter(Boolean),
      sortOrder: Number(data.get("sortOrder") || 100),
      active: data.get("active") === "on",
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    };
    if (!existingId) memberPayload.createdAt = serverTimestamp();
    batch.set(doc(db, "teamMembers", memberId), memberPayload, { merge: true });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("team_member_saved", memberId));
    await batch.commit();
    state.editingMemberId = "";
    showToast("Membre enregistre.");
  } catch (error) {
    showToast(`Membre non enregistre: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

function allOpenManagementTasks() {
  const manual = state.managementTasks
    .filter((item) => !["completed", "cancelled"].includes(item.status))
    .map((item) => ({ ...item, sourceType: item.sourceType || "manual", persisted: true }));
  return [...manual, ...derivedRoadmapTasks(), ...derivedCareerTasks()].sort(sortManagementTasks);
}

function derivedRoadmapTasks() {
  const titleByStatus = {
    to_read: (name) => `Lire la roadmap de ${name}`,
    message_to_send: (name) => `Envoyer le message a ${name}`,
    meeting_planned: (name) => `Faire la rencontre avec ${name}`,
    action_required: (name) => `Faire le suivi avec ${name}`
  };
  return state.submissions
    .filter((submission) => submissionBucket(submission) === "queue" && WORKFLOW_STATUS_IDS.includes(submission.status || "to_read"))
    .map((submission) => {
      const status = submission.status || "to_read";
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
        description: status === "action_required" ? notes.nextAction || "Un suivi a ete identifie pendant la rencontre." : status === "message_to_send" ? "Envoyer manuellement le message dans Google Chat." : `${STATUS_LABELS[status]} · ${submission.cycleId || "Trimestre a preciser"}`,
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

function filteredManagementTasks() {
  return allOpenManagementTasks().filter((task) => {
    if (state.taskOwnerFilter !== "all" && !normalize(task.ownerName).includes(normalize(state.taskOwnerFilter))) return false;
    if (state.taskFilter === "urgent") return taskIsUrgent(task);
    if (["roadmap", "career"].includes(state.taskFilter)) return task.sourceType === state.taskFilter;
    if (state.taskFilter === "manual") return task.sourceType === "manual";
    return true;
  });
}

function tasksForMember(memberId) {
  return allOpenManagementTasks().filter((task) => task.teamMemberId === memberId);
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
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("management_task_completed", task.id));
    await batch.commit();
    showToast("Action terminee.");
  } catch (error) {
    showToast(`Action non modifiee: ${friendlyError(error)}`);
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
  if (task.sourceType === "roadmap") {
    openSubmission(task.sourceId);
    return;
  }
  if (task.teamMemberId) {
    state.view = "team";
    state.selectedMemberId = task.teamMemberId;
    state.editingMemberId = "";
    state.memberProfileSection = task.sourceType === "career" ? "career" : "actions";
    if (task.sourceType === "career") state.careerEditorId = task.sourceId;
    renderApp();
    return;
  }
  showToast("Cette action n'est pas associee a un dossier membre.");
}

function auditPayload(action, entityId, details = {}) {
  return {
    action,
    entityType: action.startsWith("team_") ? "teamMember" : action.startsWith("career_") ? "careerMilestone" : action.startsWith("management_") ? "managementTask" : "roadmapSubmission",
    entityId,
    actorUid: state.user.uid,
    actorName: actorName(),
    details,
    createdAt: serverTimestamp(),
    source: "firebase_owner_dashboard"
  };
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
  return state.teamMembers.find((member) => {
    const aliases = [member.id, member.normalizedName, member.name, ...(member.aliases || [])].map(slug).filter(Boolean);
    return names.some((name) => aliases.includes(name));
  }) || null;
}

function submissionsForMember(member) {
  return state.submissions.filter((submission) => memberForSubmission(submission)?.id === member.id)
    .sort((a, b) => dateValue(b.submittedAt) - dateValue(a.submittedAt));
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

function careerStatusTone(status) {
  if (status === "in_progress") return "green";
  if (status === "planned") return "blue";
  if (status === "blocked") return "red";
  if (status === "completed") return "complete";
  return "neutral";
}

function statusTone(status) {
  if (status === "to_read") return "green";
  if (status === "message_to_send") return "amber";
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
