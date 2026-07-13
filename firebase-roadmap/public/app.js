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
const MEETING_OPTIONS = ["Gabriel seul", "Michael seul", "Gabriel + Michael", "A determiner"];

const state = {
  user: null,
  profile: null,
  submissions: [],
  ownerNotes: {},
  teamMembers: [],
  departments: [],
  forms: {},
  view: "active",
  selectedId: "",
  editingMemberId: "",
  filters: { search: "", role: "all", status: "all" },
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
        ${renderFilters()}
        ${renderTabs()}
        ${state.view === "team" ? renderTeamView() : `
          <section class="pipeline">
            ${metric(counts.to_read, "A lire", "green")}
            ${metric(counts.meeting_planned, "Rencontre planifiee", "blue")}
            ${metric(counts.meeting_done, "Rencontre faite", "")}
            ${metric(counts.action_required, "Action requise", "red")}
            ${metric(counts.ready_to_archive, "Pret a archiver", "amber")}
            ${metric(counts.archived, "Archives", "")}
          </section>
          ${renderSubmissionWorkspace()}
        `}
      </main>
    </div>
  `;
  bindAppEvents();
  refreshIcons();
}

function renderFilters() {
  const roles = [...new Set(state.submissions.map((item) => item.selectedRoleLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b));
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
      <label class="field">Statut
        <select id="statusFilter">
          <option value="all">Tous les statuts</option>
          ${STATUS_OPTIONS.map(([id, label]) => `<option value="${id}" ${state.filters.status === id ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
    </section>
  `;
}

function renderTabs() {
  const activeCount = state.submissions.filter((item) => item.status !== "archived").length;
  const archiveCount = state.submissions.filter((item) => item.status === "archived").length;
  return `
    <nav class="view-tabs" aria-label="Vues Roadmap">
      <button class="tab-button ${state.view === "active" ? "active" : ""}" data-view="active" type="button">Actifs (${activeCount})</button>
      <button class="tab-button ${state.view === "archive" ? "active" : ""}" data-view="archive" type="button">Archives (${archiveCount})</button>
      <button class="tab-button ${state.view === "team" ? "active" : ""}" data-view="team" type="button">Equipe (${state.teamMembers.length})</button>
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
  return `
    <div class="workspace">
      <section class="panel responses">
        <header class="submission-header">
          <div>
            <h2>${escapeHtml(selected.employeeName || selected.answers?.employee_name || "Sans nom")}</h2>
            <p>${escapeHtml(selected.selectedRoleLabel || "Role inconnu")} · ${escapeHtml(selected.cycleId || "Sans trimestre")} · ${formatDate(selected.submittedAt)}</p>
          </div>
          <label class="field">Soumission
            <select id="submissionSelect">
              ${submissions.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === selected.id ? "selected" : ""}>${escapeHtml(submissionLabel(item))}</option>`).join("")}
            </select>
          </label>
        </header>
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
  return `
    <aside class="panel notes-panel">
      <h2>Notes owners</h2>
      <p>Ce bloc reste visible pendant la lecture de la rencontre.</p>
      <label class="field">Statut
        <select id="ownerStatus">
          ${STATUS_OPTIONS.filter(([id]) => id !== "archived").map(([id, label]) => `<option value="${id}" ${(notes.ownerStatus || submission.status || "to_read") === id ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
      <label class="field">Owner responsable
        <select id="ownerReviewer">
          <option value="">Choisir</option>
          ${OWNER_OPTIONS.map((name) => `<option value="${name}" ${(notes.reviewerName || "") === name ? "selected" : ""}>${name}</option>`).join("")}
        </select>
      </label>
      <label class="field">Format
        <select id="meetingFormat">
          <option value="">Choisir</option>
          ${MEETING_OPTIONS.map((name) => `<option value="${name}" ${(notes.meetingFormat || "") === name ? "selected" : ""}>${name}</option>`).join("")}
        </select>
      </label>
      <label class="field">Note de rencontre
        <textarea id="ownerMainNote" placeholder="Constats, decisions, engagements et prochaine action...">${escapeHtml(notes.followupNotes || "")}</textarea>
      </label>
      <div class="notes-actions">
        <button class="button primary" id="saveNotesButton" type="button"><i data-lucide="save"></i> Enregistrer</button>
        ${isArchived
          ? `<button class="button" id="restoreButton" type="button"><i data-lucide="rotate-ccw"></i> Restaurer</button>`
          : `<button class="button danger" id="archiveButton" type="button"><i data-lucide="archive"></i> Archiver</button>`}
      </div>
      <div class="save-status" id="saveStatus">${notes.sourceUpdatedAt ? `Derniere note: ${formatDate(notes.sourceUpdatedAt)}` : ""}</div>
      ${renderLegacyNotes(notes)}
    </aside>
  `;
}

function renderLegacyNotes(notes) {
  const fields = [
    ["Sujets prioritaires", notes.priorityTopics],
    ["Questions", notes.questions],
    ["Performance", notes.performance],
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
  const editing = state.teamMembers.find((item) => item.id === state.editingMemberId) || null;
  return `
    <div class="team-layout">
      <section class="panel team-columns">
        ${state.departments.map((department) => {
          const members = state.teamMembers.filter((member) => member.departmentId === department.id);
          return `
            <article class="department ${escapeAttr(department.className || department.id)}">
              <h3>${escapeHtml(department.label)}</h3>
              ${members.length ? members.map((member) => `
                <button class="member-row ${member.active === false ? "inactive" : ""}" data-edit-member="${escapeAttr(member.id)}" type="button">
                  <strong>${escapeHtml(member.name || "Sans nom")}</strong>
                  <span>${escapeHtml(member.displayTitle || "Role a preciser")}</span>
                </button>
              `).join("") : `<p class="empty-state">Aucun membre</p>`}
            </article>
          `;
        }).join("")}
      </section>
      <form class="panel member-form" id="memberForm">
        <h2>${editing ? "Modifier le membre" : "Ajouter un membre"}</h2>
        <input type="hidden" name="memberId" value="${escapeAttr(editing?.id || "")}">
        <label class="field">Nom<input name="name" required value="${escapeAttr(editing?.name || "")}"></label>
        <label class="field">Departement
          <select name="departmentId" required>
            ${state.departments.map((department) => `<option value="${escapeAttr(department.id)}" ${editing?.departmentId === department.id ? "selected" : ""}>${escapeHtml(department.label)}</option>`).join("")}
          </select>
        </label>
        <label class="field">Titre affiche<input name="displayTitle" required value="${escapeAttr(editing?.displayTitle || "")}"></label>
        <label class="field">Roles du formulaire<input name="roleIds" value="${escapeAttr((editing?.roleIds || []).join(", "))}" placeholder="coach_professionnel"></label>
        <label class="field">Ordre<input name="sortOrder" type="number" min="0" step="1" value="${escapeAttr(editing?.sortOrder ?? 100)}"></label>
        <label class="checkbox-line"><input name="active" type="checkbox" ${editing?.active === false ? "" : "checked"}> Membre actif</label>
        <div class="notes-actions">
          <button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer</button>
          ${editing ? `<button class="button" id="cancelMemberEdit" type="button">Annuler</button>` : ""}
        </div>
      </form>
    </div>
  `;
}

function bindAppEvents() {
  document.querySelector("#logoutButton")?.addEventListener("click", () => signOut(auth));
  document.querySelector("#reloadButton")?.addEventListener("click", () => window.location.reload());
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.view;
    state.filters.status = "all";
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
  document.querySelector("#statusFilter")?.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    ensureSelection();
    renderApp();
  });
  document.querySelector("#submissionSelect")?.addEventListener("change", (event) => {
    state.selectedId = event.target.value;
    renderApp();
  });
  document.querySelector("#saveNotesButton")?.addEventListener("click", saveOwnerNotes);
  document.querySelector("#archiveButton")?.addEventListener("click", archiveSelected);
  document.querySelector("#restoreButton")?.addEventListener("click", restoreSelected);
  document.querySelectorAll("[data-edit-member]").forEach((button) => button.addEventListener("click", () => {
    state.editingMemberId = button.dataset.editMember;
    renderApp();
  }));
  document.querySelector("#cancelMemberEdit")?.addEventListener("click", () => {
    state.editingMemberId = "";
    renderApp();
  });
  document.querySelector("#memberForm")?.addEventListener("submit", saveTeamMember);
}

async function saveOwnerNotes() {
  const submission = selectedSubmission();
  if (!submission || state.busy) return;
  state.busy = true;
  setSaveStatus("Enregistrement en cours...");
  const ownerStatus = document.querySelector("#ownerStatus")?.value || submission.status || "to_read";
  const payload = {
    submissionId: submission.id,
    reviewerName: document.querySelector("#ownerReviewer")?.value || "",
    ownerStatus,
    meetingFormat: document.querySelector("#meetingFormat")?.value || "",
    followupNotes: document.querySelector("#ownerMainNote")?.value || "",
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid
  };
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "ownerNotes", submission.id), payload, { merge: true });
    batch.update(doc(db, "roadmapSubmissions", submission.id), { status: ownerStatus, updatedAt: serverTimestamp() });
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
    showToast("Roadmap restauree dans les actifs.");
  } catch (error) {
    showToast(`Restauration impossible: ${friendlyError(error)}`);
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
  const memberId = String(data.get("memberId") || "").trim() || slug(name);
  if (!name || !memberId) return;
  state.busy = true;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "teamMembers", memberId), {
      name,
      normalizedName: slug(name),
      departmentId: String(data.get("departmentId") || "support"),
      displayTitle: String(data.get("displayTitle") || "").trim(),
      roleIds: String(data.get("roleIds") || "").split(/[,;]+/).map((item) => item.trim()).filter(Boolean),
      sortOrder: Number(data.get("sortOrder") || 100),
      active: data.get("active") === "on",
      updatedAt: serverTimestamp(),
      updatedByUid: state.user.uid
    }, { merge: true });
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

function auditPayload(action, entityId) {
  return {
    action,
    entityType: action.startsWith("team_") ? "teamMember" : "roadmapSubmission",
    entityId,
    actorUid: state.user.uid,
    actorName: state.profile.displayName || state.user.displayName || "Owner",
    createdAt: serverTimestamp(),
    source: "firebase_owner_dashboard"
  };
}

function filteredSubmissions() {
  const search = normalize(state.filters.search);
  return state.submissions.filter((submission) => {
    if (state.view === "active" && submission.status === "archived") return false;
    if (state.view === "archive" && submission.status !== "archived") return false;
    if (state.filters.role !== "all" && submission.selectedRoleLabel !== state.filters.role) return false;
    if (state.filters.status !== "all" && submission.status !== state.filters.status) return false;
    if (!search) return true;
    return normalize([
      submission.employeeName,
      submission.answers?.employee_name,
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
    const status = item.status || "to_read";
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

function metric(value, label, tone) {
  return `<div class="metric ${tone}"><strong>${value || 0}</strong><span>${escapeHtml(label)}</span></div>`;
}

function submissionLabel(item) {
  const name = item.employeeName || item.answers?.employee_name || "Sans nom";
  return `${name} · ${item.selectedRoleLabel || "Role"} · ${item.cycleId || ""}`;
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
