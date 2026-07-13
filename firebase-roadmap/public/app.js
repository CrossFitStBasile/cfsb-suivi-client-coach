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
  ["meeting_planned", "Rencontre planifiee"],
  ["meeting_done", "Rencontre faite"],
  ["action_required", "Action requise"],
  ["ready_to_archive", "Pret a archiver"],
  ["archived", "Archive"]
];
const OWNER_OPTIONS = ["Michael", "Gabriel", "Michael + Gabriel"];
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS);
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
  view: "active",
  selectedId: "",
  selectedMemberId: "",
  editingMemberId: "",
  memberProfileSection: "career",
  careerEditorId: "",
  careerDraft: null,
  showArchivedCareer: false,
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
        <h1>Roadmap owners</h1>
        <p>Preparation des rencontres, notes owners, archives et portrait de l'equipe dans le nouvel environnement Firebase.</p>
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
        <h1>Roadmap owners</h1>
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
  const counts = statusCounts();
  appRoot.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand-line">
          <div class="brand-mark">CF</div>
          <div><strong>Roadmap owners</strong><span>${escapeHtml(state.profile.displayName || state.user.displayName || "Owner")}</span></div>
        </div>
        <div class="top-actions">
          <div class="realtime">Temps reel Firestore</div>
          <button class="button icon-only" id="reloadButton" type="button" title="Recharger">
            <i data-lucide="refresh-cw"></i>
          </button>
          <button class="button" id="logoutButton" type="button">
            <i data-lucide="log-out"></i><span>Deconnexion</span>
          </button>
        </div>
      </header>
      <main class="page">
        <section class="page-heading">
          <div>
            <p class="eyebrow">Preparation des rencontres</p>
            <h1>Lire, annoter, preparer.</h1>
            <p>Les nouvelles soumissions apparaissent automatiquement, sans bouton de synchronisation.</p>
          </div>
          <div class="environment-badge">ENVIRONNEMENT FIREBASE TEST</div>
        </section>
        ${state.loadError ? `<div class="auth-note">${escapeHtml(state.loadError)}</div>` : ""}
        ${renderTabs()}
        ${state.view === "team" ? renderTeamView() : `
          ${renderFilters()}
          ${state.view === "trash" ? "" : `
            <section class="pipeline" aria-label="Filtrer le pipeline par statut">
              ${metric(counts.to_read, "A lire", "green", "to_read")}
              ${metric(counts.meeting_planned, "Rencontre planifiee", "blue", "meeting_planned")}
              ${metric(counts.meeting_done, "Rencontre faite", "", "meeting_done")}
              ${metric(counts.action_required, "Action requise", "red", "action_required")}
              ${metric(counts.ready_to_archive, "Pret a archiver", "amber", "ready_to_archive")}
              ${metric(counts.archived, "Archives", "", "archived")}
            </section>
          `}
          ${renderSubmissionWorkspace()}
        `}
      </main>
      ${state.careerEditorId ? renderCareerEditor() : ""}
    </div>
  `;
  bindAppEvents();
  refreshIcons();
}

function renderFilters() {
  const roles = [...new Set(state.submissions.map((item) => item.selectedRoleLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const cycles = [...new Set(state.submissions.map((item) => item.cycleId).filter(Boolean))].sort().reverse();
  return `
    <section class="panel filters">
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
      <label class="field">Statut
        <select id="statusFilter" ${state.view === "trash" ? "disabled" : ""}>
          <option value="all">Tous les statuts</option>
          ${STATUS_OPTIONS.map(([id, label]) => `<option value="${id}" ${state.filters.status === id ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
    </section>
  `;
}

function renderTabs() {
  const visible = state.submissions.filter((item) => !isDeleted(item));
  const activeCount = visible.filter((item) => item.status !== "archived").length;
  const archiveCount = visible.filter((item) => item.status === "archived").length;
  const trashCount = state.submissions.filter(isDeleted).length;
  return `
    <nav class="view-tabs" aria-label="Vues Roadmap">
      <button class="tab-button ${state.view === "active" ? "active" : ""}" data-view="active" type="button">Actifs (${activeCount})</button>
      <button class="tab-button ${state.view === "archive" ? "active" : ""}" data-view="archive" type="button">Archives (${archiveCount})</button>
      <button class="tab-button ${state.view === "team" ? "active" : ""}" data-view="team" type="button">Equipe (${state.teamMembers.length})</button>
      <button class="tab-button ${state.view === "trash" ? "active" : ""}" data-view="trash" type="button"><i data-lucide="trash-2"></i> Corbeille (${trashCount})</button>
    </nav>
  `;
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
                ${submissions.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === selected.id ? "selected" : ""}>${escapeHtml(submissionLabel(item))}</option>`).join("")}
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
        </div>
      </section>
      ${renderNotesPanel(selected, notes)}
    </div>
  `;
}

function renderNotesPanel(submission, notes) {
  const isArchived = submission.status === "archived";
  const inTrash = isDeleted(submission);
  const member = memberForSubmission(submission);
  const mainNote = notes.meetingSummary || notes.followupNotes || "";
  const linkedCareer = state.careerMilestones.find((item) => item.sourceSubmissionId === submission.id && !item.archivedAt) || null;
  return `
    <aside class="panel notes-panel ${inTrash ? "is-trash" : ""}">
      <h2>${inTrash ? "Soumission supprimee" : "Compte rendu"}</h2>
      <p>${inTrash ? "Cette roadmap est masquee des dossiers actifs. Elle peut encore etre restauree." : "Une note simple pour garder la continuite entre les rencontres."}</p>
      ${!isArchived && !inTrash ? `
        <fieldset class="status-fieldset">
          <legend>Etape de suivi</legend>
          <div class="status-switch">
            ${STATUS_OPTIONS.filter(([id]) => id !== "archived").map(([id, label]) => `
              <button class="status-button ${submission.status === id ? "active" : ""}" data-set-status="${id}" type="button">${escapeHtml(label)}</button>
            `).join("")}
          </div>
        </fieldset>
      ` : `<div class="current-state">${statusPill(inTrash ? "deleted" : submission.status)}</div>`}
      <label class="field">Dossier membre
        <select id="memberAssignment" ${inTrash ? "disabled" : ""}>
          <option value="">Non associe</option>
          ${state.teamMembers.map((item) => `<option value="${escapeAttr(item.id)}" ${member?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}${item.active === false ? " (inactif)" : ""}</option>`).join("")}
        </select>
      </label>
      <label class="field">Responsable
        <select id="ownerReviewer">
          <option value="">Choisir</option>
          ${OWNER_OPTIONS.map((name) => `<option value="${name}" ${(notes.reviewerName || "") === name ? "selected" : ""}>${name}</option>`).join("")}
        </select>
      </label>
      <label class="field">Date de rencontre
        <input id="meetingDate" type="date" value="${escapeAttr(dateInputValue(notes.meetingDate))}">
      </label>
      <label class="field">Compte rendu de rencontre
        <textarea id="ownerMainNote" placeholder="Constats, decisions et engagements...">${escapeHtml(mainNote)}</textarea>
      </label>
      <label class="field">Prochaine action
        <textarea class="compact-textarea" id="nextAction" placeholder="Ce qui doit arriver ensuite...">${escapeHtml(notes.nextAction || "")}</textarea>
      </label>
      ${member && notes.nextAction && !inTrash ? `
        <button class="career-convert" id="convertNextActionButton" type="button">
          <i data-lucide="${linkedCareer ? "route" : "git-branch-plus"}"></i>
          <span><strong>${linkedCareer ? "Voir dans Parcours CFSB" : "Ajouter au parcours"}</strong>${linkedCareer ? "Cette action est deja reliee a une etape." : "Transforme la prochaine action en etape suivie."}</span>
        </button>
      ` : ""}
      <label class="field">Date de suivi
        <input id="followupDate" type="date" value="${escapeAttr(dateInputValue(notes.followupDate))}">
      </label>
      <div class="notes-actions">
        ${inTrash ? `
          <button class="button" id="restoreTrashButton" type="button"><i data-lucide="rotate-ccw"></i> Restaurer dans Archives</button>
          <button class="button danger" id="deleteForeverButton" type="button"><i data-lucide="trash-2"></i> Supprimer definitivement</button>
        ` : `
          <button class="button primary" id="saveNotesButton" type="button"><i data-lucide="save"></i> Enregistrer</button>
          ${isArchived ? `
            <button class="button" id="restoreButton" type="button"><i data-lucide="rotate-ccw"></i> Rouvrir</button>
            <button class="button danger" id="trashButton" type="button"><i data-lucide="trash-2"></i> Mettre a la corbeille</button>
          ` : `<button class="button" id="archiveButton" type="button"><i data-lucide="archive"></i> Archiver</button>`}
        `}
      </div>
      <div class="save-status" id="saveStatus">${notes.updatedAt || notes.sourceUpdatedAt ? `Derniere mise a jour: ${formatDate(notes.updatedAt || notes.sourceUpdatedAt)}` : ""}</div>
      ${renderLegacyNotes(notes)}
    </aside>
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
  return `
    <section class="panel team-toolbar">
      <div>
        <h2>Equipe et dossiers Roadmap</h2>
        <p>Clique sur une personne pour voir toute son histoire de rencontres.</p>
      </div>
      <button class="button primary" id="addMemberButton" type="button"><i data-lucide="user-plus"></i> Ajouter un membre</button>
    </section>
    ${unlinked.length ? `
      <button class="data-warning" id="openUnlinkedButton" type="button">
        <i data-lucide="unlink"></i>
        <span><strong>${unlinked.length} roadmap(s) a associer</strong>Un nom ne correspond pas encore a un dossier equipe.</span>
        <i data-lucide="arrow-right"></i>
      </button>
    ` : ""}
    <div class="team-layout ${state.editingMemberId ? "" : "team-layout-wide"}">
      <section class="panel team-columns">
        ${state.departments.map((department) => {
          const members = state.teamMembers.filter((member) => member.departmentId === department.id);
          return `
            <article class="department ${escapeAttr(department.className || department.id)}">
              <h3>${escapeHtml(department.label)}</h3>
              ${members.length ? members.map((member) => `
                <div class="member-record ${member.active === false ? "inactive" : ""}">
                  <button class="member-row" data-open-member="${escapeAttr(member.id)}" type="button">
                    <strong>${escapeHtml(member.name || "Sans nom")}</strong>
                    <span>${escapeHtml(member.displayTitle || "Role a preciser")} · ${submissionsForMember(member).length} roadmap(s)</span>
                  </button>
                  <button class="member-edit" data-edit-member="${escapeAttr(member.id)}" type="button" title="Modifier ${escapeAttr(member.name || "ce membre")}"><i data-lucide="pencil"></i></button>
                </div>
              `).join("") : `<p class="empty-state">Aucun membre</p>`}
            </article>
          `;
        }).join("")}
      </section>
      ${state.editingMemberId ? renderMemberForm(editing, isCreating) : ""}
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
        <button class="button" data-edit-member="${escapeAttr(member.id)}" type="button"><i data-lucide="pencil"></i> Modifier</button>
      </header>
      <section class="member-metrics">
        ${profileMetric(submissions.length, "Roadmaps au dossier")}
        ${profileMetric(activeMilestones.length, "Etapes en cours")}
        ${profileMetric(completedMilestones.length, "Etapes realisees")}
        ${profileMetric(nextMilestone ? formatDateOnly(nextMilestone.targetDate) : "Aucune", "Prochaine echeance")}
      </section>
      <nav class="member-section-tabs" aria-label="Sections du dossier membre">
        <button class="tab-button ${state.memberProfileSection === "career" ? "active" : ""}" data-member-section="career" type="button"><i data-lucide="route"></i> Parcours CFSB (${milestones.length})</button>
        <button class="tab-button ${state.memberProfileSection === "roadmaps" ? "active" : ""}" data-member-section="roadmaps" type="button"><i data-lucide="clipboard-list"></i> Roadmaps (${submissions.length})</button>
      </nav>
      ${state.memberProfileSection === "roadmaps" ? renderRoadmapHistory(submissions) : renderCareerTimeline(member)}
    </section>
  `;
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
  const summary = notes.meetingSummary || notes.followupNotes || "";
  const completion = completionInfo(submission);
  return `
    <button class="timeline-item" data-open-submission="${escapeAttr(submission.id)}" type="button">
      <span class="timeline-date">${formatShortDate(submission.submittedAt)}</span>
      <span class="timeline-main">
        <strong>${escapeHtml(submission.cycleId || "Sans trimestre")} · ${escapeHtml(submission.selectedRoleLabel || "Role inconnu")}</strong>
        <small>${summary ? escapeHtml(truncate(summary, 150)) : "Aucun compte rendu de rencontre"}</small>
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
    state.view = button.dataset.view;
    state.selectedMemberId = "";
    state.editingMemberId = "";
    state.filters.status = "all";
    ensureSelection();
    renderApp();
  }));
  document.querySelectorAll("[data-status-filter]").forEach((button) => button.addEventListener("click", () => {
    const status = button.dataset.statusFilter;
    const nextView = status === "archived" ? "archive" : "active";
    const isSame = state.view === nextView && state.filters.status === status;
    state.view = nextView;
    state.filters.status = isSame ? "all" : status;
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
  document.querySelector("#printButton")?.addEventListener("click", () => window.print());
  document.querySelector("#saveNotesButton")?.addEventListener("click", saveOwnerNotes);
  document.querySelector("#archiveButton")?.addEventListener("click", archiveSelected);
  document.querySelector("#restoreButton")?.addEventListener("click", restoreSelected);
  document.querySelector("#trashButton")?.addEventListener("click", moveSelectedToTrash);
  document.querySelector("#restoreTrashButton")?.addEventListener("click", restoreSelectedFromTrash);
  document.querySelector("#deleteForeverButton")?.addEventListener("click", deleteSelectedForever);
  document.querySelector("#memberAssignment")?.addEventListener("change", assignSelectedMember);
  document.querySelector("#convertNextActionButton")?.addEventListener("click", openCareerFromNextAction);
  document.querySelectorAll("[data-set-status]").forEach((button) => button.addEventListener("click", () => setSelectedStatus(button.dataset.setStatus)));
  document.querySelectorAll("[data-open-member]").forEach((button) => button.addEventListener("click", () => {
    state.view = "team";
    state.selectedMemberId = button.dataset.openMember;
    state.editingMemberId = "";
    state.memberProfileSection = "career";
    state.showArchivedCareer = false;
    renderApp();
  }));
  document.querySelectorAll("[data-edit-member]").forEach((button) => button.addEventListener("click", () => {
    state.view = "team";
    state.selectedMemberId = "";
    state.editingMemberId = button.dataset.editMember;
    renderApp();
  }));
  document.querySelector("#addMemberButton")?.addEventListener("click", () => {
    state.selectedMemberId = "";
    state.editingMemberId = "__new__";
    renderApp();
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
}

function closeCareerEditor(shouldRender = true) {
  state.careerEditorId = "";
  state.careerDraft = null;
  if (shouldRender) renderApp();
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
  setSaveStatus("Association en cours...");
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "roadmapSubmissions", submission.id), {
      teamMemberId: memberId || null,
      teamMemberName: member?.name || null,
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_member_assigned", submission.id, { teamMemberId: memberId || null }));
    await batch.commit();
    setSaveStatus(member ? `Associee au dossier de ${member.name}.` : "Association retiree.", "success");
  } catch (error) {
    setSaveStatus(`Association impossible: ${friendlyError(error)}`, "error");
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
    state.view = "archive";
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
    state.view = "active";
    state.filters.status = "all";
    showToast("Roadmap restauree dans les actifs.");
  } catch (error) {
    showToast(`Restauration impossible: ${friendlyError(error)}`);
  } finally {
    state.busy = false;
  }
}

async function moveSelectedToTrash() {
  const submission = selectedSubmission();
  if (!submission || state.busy || submission.status !== "archived") return;
  const name = submission.employeeName || submission.answers?.employee_name || "cette soumission";
  if (!window.confirm(`Mettre la roadmap de ${name} a la corbeille? Elle pourra encore etre restauree.`)) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "roadmapSubmissions", submission.id), {
      deletedAt: serverTimestamp(),
      deletedByUid: state.user.uid,
      deletedByName: state.profile.displayName || state.user.displayName || "Owner",
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_trashed", submission.id));
    await batch.commit();
    state.view = "trash";
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
      status: "archived",
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(db, "auditLogs")), auditPayload("submission_trash_restored", submission.id));
    await batch.commit();
    state.view = "archive";
    state.filters.status = "all";
    showToast("Roadmap restauree dans Archives.");
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

function auditPayload(action, entityId, details = {}) {
  return {
    action,
    entityType: action.startsWith("team_") ? "teamMember" : action.startsWith("career_") ? "careerMilestone" : "roadmapSubmission",
    entityId,
    actorUid: state.user.uid,
    actorName: actorName(),
    details,
    createdAt: serverTimestamp(),
    source: "firebase_owner_dashboard"
  };
}

function filteredSubmissions() {
  const search = normalize(state.filters.search);
  return state.submissions.filter((submission) => {
    const deleted = isDeleted(submission);
    if (state.view === "trash" && !deleted) return false;
    if (state.view !== "trash" && deleted) return false;
    if (state.view === "active" && submission.status === "archived") return false;
    if (state.view === "archive" && submission.status !== "archived") return false;
    if (state.filters.role !== "all" && submission.selectedRoleLabel !== state.filters.role) return false;
    if (state.filters.cycle !== "all" && submission.cycleId !== state.filters.cycle) return false;
    if (state.view !== "trash" && state.filters.status !== "all" && submission.status !== state.filters.status) return false;
    if (!search) return true;
    return normalize([
      submission.employeeName,
      submission.answers?.employee_name,
      submission.answers?.employee_email,
      submission.selectedRoleLabel,
      submission.cycleId
    ].filter(Boolean).join(" ")).includes(search);
  });
}

function ensureSelection() {
  if (state.view === "team") return;
  const visible = filteredSubmissions();
  if (!visible.some((item) => item.id === state.selectedId)) {
    state.selectedId = visible[0]?.id || "";
  }
}

function openSubmission(submissionId) {
  const submission = state.submissions.find((item) => item.id === submissionId);
  if (!submission) return;
  closeCareerEditor(false);
  state.view = isDeleted(submission) ? "trash" : submission.status === "archived" ? "archive" : "active";
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

function statusCounts() {
  const counts = Object.fromEntries(STATUS_OPTIONS.map(([id]) => [id, 0]));
  state.submissions.forEach((item) => {
    if (isDeleted(item)) return;
    const status = item.status || "to_read";
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

function metric(value, label, tone, status) {
  const view = status === "archived" ? "archive" : "active";
  const active = state.view === view && state.filters.status === status;
  return `<button class="metric ${tone} ${active ? "active" : ""}" data-status-filter="${status}" type="button" aria-pressed="${active}"><strong>${value || 0}</strong><span>${escapeHtml(label)}</span></button>`;
}

function submissionLabel(item) {
  const name = item.employeeName || item.answers?.employee_name || "Sans nom";
  return `${name} · ${item.selectedRoleLabel || "Role"} · ${item.cycleId || ""}`;
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
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
