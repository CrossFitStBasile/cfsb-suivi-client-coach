const CONFIG_URL = "../data/roadmap-config.json";
const DEFAULT_ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA/exec";
const IS_LOCAL_PREVIEW = ["", "localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const STORAGE_KEYS = {
  settings: "cfsb-roadmap-settings",
  submissions: "cfsb-roadmap-submissions",
  ownerNotes: "cfsb-roadmap-owner-notes",
  ownerAccess: "cfsb-roadmap-owner-access",
  archivedSubmissions: "cfsb-roadmap-archived-submissions",
  teamMembers: "cfsb-roadmap-team-members"
};
const OWNER_PIN_HASH = "2c0e6aedc46934b8f4c0eff7cb21be678c5a35449ea3374b15f3a2f65259c3d7";
const OWNER_STATUSES = [
  ["to_read", "A lire"],
  ["planned", "Rencontre planifiee"],
  ["done", "Rencontre faite"],
  ["action_required", "Action requise"],
  ["archived", "Pret a archiver"]
];
const TEAM_DEPARTMENTS = [
  { id: "direction", label: "Direction", className: "owners", sortOrder: 10 },
  { id: "operations", label: "Operations", className: "operations", sortOrder: 20 },
  { id: "coaching", label: "Coaching", className: "coaching", sortOrder: 30 },
  { id: "support", label: "Communaute et support", className: "support", sortOrder: 40 }
];
const DEFAULT_TEAM_MEMBERS = [
  { memberId: "michael-grondin", name: "Michael Grondin", departmentId: "direction", roleIds: ["owner"], displayTitle: "Proprietaire - Ventes, marketing, vision", sortOrder: 10, active: true },
  { memberId: "gabriel-mayer-bedard", name: "Gabriel Mayer Bedard", departmentId: "direction", roleIds: ["owner"], displayTitle: "Proprietaire - Operations, finances, RH, integration", sortOrder: 20, active: true },
  { memberId: "caroline-martineau", name: "Caroline Martineau", departmentId: "operations", roleIds: ["coordinatrice"], displayTitle: "Chef d'equipe, coordination, ventes", sortOrder: 10, active: true },
  { memberId: "tiffany-bolduc-brossier", name: "Tiffany Bolduc-Brossier", departmentId: "operations", roleIds: ["admin_autre"], displayTitle: "Conciliation de la paie", sortOrder: 20, active: true },
  { memberId: "hugo-lelievre", name: "Hugo Lelievre", departmentId: "coaching", roleIds: ["head_coach"], displayTitle: "Coach en chef, formateur", sortOrder: 10, active: true },
  { memberId: "marc-andre-menard", name: "Marc-Andre Menard", departmentId: "coaching", roleIds: ["coach_professionnel"], displayTitle: "Coach professionnel", sortOrder: 20, active: true },
  { memberId: "raphael-samson", name: "Raphael Samson", departmentId: "coaching", roleIds: ["coach_professionnel"], displayTitle: "Coach professionnel", sortOrder: 30, active: true },
  { memberId: "camille-proulx", name: "Camille Proulx", departmentId: "coaching", roleIds: ["coach_professionnel"], displayTitle: "Coach professionnel", sortOrder: 40, active: true },
  { memberId: "david-olivier", name: "David Olivier", departmentId: "coaching", roleIds: ["coach_professionnel"], displayTitle: "Coach professionnel", sortOrder: 50, active: true },
  { memberId: "iheb-yahyaoui", name: "Iheb Yahyaoui", departmentId: "coaching", roleIds: ["coach_professionnel"], displayTitle: "Coach professionnel", sortOrder: 60, active: true },
  { memberId: "roxanne-vincent", name: "Roxanne Vincent", departmentId: "coaching", roleIds: ["coach_developpement"], displayTitle: "Coach developpement", sortOrder: 70, active: true },
  { memberId: "nathan-goupil", name: "Nathan Goupil", departmentId: "coaching", roleIds: ["coach_developpement"], displayTitle: "Coach developpement", sortOrder: 80, active: true },
  { memberId: "chloe-willis", name: "Chloe Willis", departmentId: "coaching", roleIds: ["coach_developpement"], displayTitle: "Coach developpement", sortOrder: 90, active: true },
  { memberId: "serge-thibault", name: "Serge Thibault", departmentId: "coaching", roleIds: ["coach_communaute"], displayTitle: "Coach communaute", sortOrder: 100, active: true },
  { memberId: "kim-theriault", name: "Kim Theriault", departmentId: "coaching", roleIds: ["coach_communaute"], displayTitle: "Coach communaute", sortOrder: 110, active: true },
  { memberId: "jean-sylvain-cote", name: "Jean-Sylvain Cote", departmentId: "coaching", roleIds: ["coach_communaute"], displayTitle: "Coach communaute", sortOrder: 120, active: true },
  { memberId: "karolina-milewska", name: "Karolina Milewska", departmentId: "support", roleIds: ["engagement_evenements"], displayTitle: "Gestionnaire Club Social", sortOrder: 10, active: true },
  { memberId: "lysanne-gosselin", name: "Lysanne Gosselin", departmentId: "support", roleIds: ["entretien_menager"], displayTitle: "Entretien menager", sortOrder: 20, active: true },
  { memberId: "michel-jasen-mallet", name: "Michel Jasen Mallet", departmentId: "support", roleIds: ["entretien_menager"], displayTitle: "Entretien menager", sortOrder: 30, active: true },
  { memberId: "valerie-savard", name: "Valerie Savard", departmentId: "support", roleIds: ["admin_autre"], displayTitle: "Equipe CFSB", sortOrder: 40, active: true }
];

const state = {
  config: null,
  teamMembers: DEFAULT_TEAM_MEMBERS,
  teamDepartments: TEAM_DEPARTMENTS,
  submissions: [],
  selectedId: "",
  selectedArchiveId: "",
  view: "active",
  ownerNotes: {},
  archivedSubmissions: {},
  filters: {
    search: "",
    role: "all",
    quarter: "all",
    status: "all"
  },
  lastSyncAt: "",
  settings: {
    endpointUrl: IS_LOCAL_PREVIEW ? "" : DEFAULT_ENDPOINT_URL
  }
};
let dashboardStarted = false;
let ownerNotesSyncTimer = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function showOwnerApp() {
  $("#ownerGate").hidden = true;
  $("#ownerApp").hidden = false;
}

function showOwnerGate() {
  $("#ownerGate").hidden = false;
  $("#ownerApp").hidden = true;
  $("#ownerPinInput").focus();
}

async function unlockOwners(event) {
  event.preventDefault();
  const error = $("#ownerGateError");
  error.hidden = true;

  if (!crypto.subtle) {
    error.textContent = "Ce navigateur ne supporte pas la validation du code.";
    error.hidden = false;
    return;
  }

  const enteredHash = await sha256Hex($("#ownerPinInput").value.trim());
  if (enteredHash !== OWNER_PIN_HASH) {
    error.textContent = "Code invalide.";
    error.hidden = false;
    $("#ownerPinInput").select();
    return;
  }

  sessionStorage.setItem(STORAGE_KEYS.ownerAccess, "ok");
  $("#ownerPinInput").value = "";
  await startDashboard();
}

function lockOwners() {
  sessionStorage.removeItem(STORAGE_KEYS.ownerAccess);
  showOwnerGate();
}

function bindOwnerGate() {
  $("#ownerGateForm").addEventListener("submit", unlockOwners);
  $("#lockOwnersButton").addEventListener("click", lockOwners);
}

async function loadConfig() {
  const response = await fetch(CONFIG_URL);
  if (!response.ok) throw new Error("Configuration introuvable.");
  state.config = await response.json();
}

function loadLocalData() {
  const storedSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}");
  state.settings = { ...state.settings, ...storedSettings };
  if (!IS_LOCAL_PREVIEW) {
    state.settings.endpointUrl = DEFAULT_ENDPOINT_URL;
  }
  $("#endpointInput").placeholder = DEFAULT_ENDPOINT_URL;
  state.submissions = JSON.parse(localStorage.getItem(STORAGE_KEYS.submissions) || "[]");
  state.ownerNotes = JSON.parse(localStorage.getItem(STORAGE_KEYS.ownerNotes) || "{}");
  state.archivedSubmissions = JSON.parse(localStorage.getItem(STORAGE_KEYS.archivedSubmissions) || "{}");
  state.teamMembers = JSON.parse(localStorage.getItem(STORAGE_KEYS.teamMembers) || "null") || DEFAULT_TEAM_MEMBERS;
  $("#endpointInput").value = state.settings.endpointUrl || "";
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEYS.submissions, JSON.stringify(state.submissions));
  localStorage.setItem(STORAGE_KEYS.ownerNotes, JSON.stringify(state.ownerNotes));
  localStorage.setItem(STORAGE_KEYS.archivedSubmissions, JSON.stringify(state.archivedSubmissions));
  localStorage.setItem(STORAGE_KEYS.teamMembers, JSON.stringify(state.teamMembers));
}

function setSyncStatus(message, type = "") {
  const status = $("#syncStatus");
  if (!status) return;
  status.textContent = message;
  status.className = type ? `notice ${type}` : "";
}

function saveSettings() {
  state.settings.endpointUrl = IS_LOCAL_PREVIEW ? $("#endpointInput").value.trim() : DEFAULT_ENDPOINT_URL;
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}");
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ ...existing, endpointUrl: state.settings.endpointUrl }));
  closeSettings();
}

function normalizeName(value) {
  return String(value || "Sans nom")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function activeTeamMembers() {
  return (state.teamMembers || []).filter((member) => member.active !== false);
}

function teamDepartmentById(id) {
  return (state.teamDepartments || TEAM_DEPARTMENTS).find((department) => department.id === id)
    || TEAM_DEPARTMENTS[0];
}

function sortedTeamMembers({ includeInactive = false } = {}) {
  return [...(state.teamMembers || [])]
    .filter((member) => includeInactive || member.active !== false)
    .sort((a, b) => {
      const departmentA = teamDepartmentById(a.departmentId)?.sortOrder || 999;
      const departmentB = teamDepartmentById(b.departmentId)?.sortOrder || 999;
      if (departmentA !== departmentB) return departmentA - departmentB;
      return Number(a.sortOrder || 999) - Number(b.sortOrder || 999)
        || String(a.name || "").localeCompare(String(b.name || ""), "fr");
    });
}

function roleLabelsForTeamMember(member) {
  const labels = (member.roleIds || [])
    .map((roleId) => state.config?.roles?.find((role) => role.id === roleId)?.label)
    .filter(Boolean);
  return labels.length ? labels.join(", ") : "Role non lie au formulaire";
}

function makeTeamMemberId(name) {
  return String(name || "membre")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || `membre-${Date.now()}`;
}

function roleById(roleId) {
  return state.config.roles.find((role) => role.id === roleId);
}

function statusLabel(statusId) {
  return OWNER_STATUSES.find(([id]) => id === statusId)?.[1] || "A lire";
}

function activeStatusCounts() {
  const counts = Object.fromEntries(OWNER_STATUSES.map(([id]) => [id, 0]));
  state.submissions.forEach((submission) => {
    const status = ownerStatusFor(submission);
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

function ownerNotesFor(submission) {
  if (!submission) return {};
  const id = submission.serverSubmissionId || submission.id;
  return state.ownerNotes[submission.id] || state.ownerNotes[id] || {};
}

function ownerStatusFor(submission) {
  return ownerNotesFor(submission).owner_status || "to_read";
}

function questionIndex() {
  const index = {};
  state.config.modules.forEach((module) => {
    if (module.groups?.length) {
      module.groups.forEach((group) => {
        (group.questions || []).forEach((question) => {
          index[question.id] = { ...question, moduleId: module.id, moduleTitle: module.title, groupTitle: group.title || "" };
        });
      });
      return;
    }

    (module.questions || []).forEach((question) => {
      index[question.id] = { ...question, moduleId: module.id, moduleTitle: module.title, groupTitle: "" };
    });
  });
  return index;
}

function allModuleQuestionsForRole(roleId) {
  const role = roleById(roleId);
  if (!role) return [];
  return (role.moduleIds || []).flatMap((moduleId) => {
    const module = state.config.modules.find((item) => item.id === moduleId);
    if (!module) return [];
    if (module.groups?.length) {
      return module.groups.flatMap((group) => (group.questions || []).map((question) => ({
        ...question,
        moduleId: module.id,
        moduleTitle: module.title,
        groupTitle: group.title || ""
      })));
    }
    return (module.questions || []).map((question) => ({
      ...question,
      moduleId: module.id,
      moduleTitle: module.title,
      groupTitle: ""
    }));
  });
}

function shouldShowQuestion(question, answers) {
  if (question.showIf?.questionId) {
    const value = answers[question.showIf.questionId];
    if ("equals" in question.showIf && value !== question.showIf.equals) return false;
    if ("notEquals" in question.showIf && value === question.showIf.notEquals) return false;
  }
  if (question.showIfMax?.questionId) {
    const value = Number(answers[question.showIfMax.questionId]);
    if (!Number.isFinite(value) || value > Number(question.showIfMax.max)) return false;
  }
  return true;
}

function filteredSubmissions() {
  const search = state.filters.search.trim().toLowerCase();
  return state.submissions.filter((submission) => {
    const role = roleById(submission.selectedRoleId);
    const status = ownerStatusFor(submission);
    const haystack = [
      submission.answers?.employee_name,
      role?.label,
      submission.selectedRoleLabel,
      submission.quarter,
      statusLabel(status)
    ].join(" ").toLowerCase();

    if (search && !haystack.includes(search)) return false;
    if (state.filters.role !== "all" && submission.selectedRoleId !== state.filters.role) return false;
    if (state.filters.quarter !== "all" && submission.quarter !== state.filters.quarter) return false;
    if (state.filters.status !== "all" && status !== state.filters.status) return false;
    return true;
  });
}

function archivedEntries() {
  return Object.entries(state.archivedSubmissions || {}).map(([id, archive]) => {
    const submission = archive.submission || null;
    const role = submission ? roleById(submission.selectedRoleId) : null;
    const ownerNotes = archive.ownerNotes || (submission ? ownerNotesFor(submission) : {});
    const name = archive.name || submission?.answers?.employee_name || "Sans nom";
    return {
      id,
      archive,
      submission,
      ownerNotes,
      name,
      normalizedName: normalizeName(name),
      roleLabel: role?.label || submission?.selectedRoleLabel || archive.roleLabel || "Role inconnu",
      roleId: submission?.selectedRoleId || archive.roleId || "",
      quarter: submission?.quarter || archive.quarter || "",
      archivedAt: archive.archivedAt || "",
      submittedAt: submission?.submittedAt || archive.submittedAt || ""
    };
  }).sort((a, b) => String(b.archivedAt || b.submittedAt || "").localeCompare(String(a.archivedAt || a.submittedAt || "")));
}

function filteredArchivedEntries() {
  const search = state.filters.search.trim().toLowerCase();
  return archivedEntries().filter((entry) => {
    const status = entry.ownerNotes?.owner_status || "archived";
    const haystack = [
      entry.name,
      entry.roleLabel,
      entry.quarter,
      statusLabel(status)
    ].join(" ").toLowerCase();

    if (search && !haystack.includes(search)) return false;
    if (state.filters.role !== "all" && entry.roleId !== state.filters.role) return false;
    if (state.filters.quarter !== "all" && entry.quarter !== state.filters.quarter) return false;
    if (state.filters.status !== "all" && status !== state.filters.status) return false;
    return true;
  });
}

function ensureSelectedSubmissionVisible() {
  if (state.view !== "active") return [];
  const visible = filteredSubmissions();
  if (!visible.length) {
    state.selectedId = "";
    return visible;
  }
  if (!visible.some((submission) => submission.id === state.selectedId)) {
    state.selectedId = visible[0].id;
  }
  return visible;
}

function ensureSelectedArchiveVisible() {
  if (state.view !== "archive") return [];
  const visible = filteredArchivedEntries();
  if (!visible.length) {
    state.selectedArchiveId = "";
    return visible;
  }
  if (!visible.some((entry) => entry.id === state.selectedArchiveId)) {
    state.selectedArchiveId = visible[0].id;
  }
  return visible;
}

function renderOwnerFilters() {
  const roleFilter = $("#ownerRoleFilter");
  const quarterFilter = $("#ownerQuarterFilter");
  const statusFilter = $("#ownerStatusFilter");
  if (!roleFilter || !quarterFilter || !statusFilter) return;

  const selectedRole = roleFilter.value || state.filters.role;
  const selectedQuarter = quarterFilter.value || state.filters.quarter;
  const selectedStatus = statusFilter.value || state.filters.status;
  const quarters = [...new Set([
    ...state.submissions.map((submission) => submission.quarter).filter(Boolean),
    ...archivedEntries().map((entry) => entry.quarter).filter(Boolean)
  ])].sort().reverse();

  roleFilter.innerHTML = '<option value="all">Tous les roles</option>' + state.config.roles.map((role) => (
    `<option value="${escapeHtml(role.id)}">${escapeHtml(role.label)}</option>`
  )).join("");
  quarterFilter.innerHTML = '<option value="all">Tous les trimestres</option>' + quarters.map((quarter) => (
    `<option value="${escapeHtml(quarter)}">${escapeHtml(quarter)}</option>`
  )).join("");
  statusFilter.innerHTML = '<option value="all">Tous les statuts</option>' + OWNER_STATUSES.map(([id, label]) => (
    `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`
  )).join("");

  state.filters.role = [...roleFilter.options].some((option) => option.value === selectedRole) ? selectedRole : "all";
  state.filters.quarter = [...quarterFilter.options].some((option) => option.value === selectedQuarter) ? selectedQuarter : "all";
  state.filters.status = [...statusFilter.options].some((option) => option.value === selectedStatus) ? selectedStatus : "all";
  roleFilter.value = state.filters.role;
  quarterFilter.value = state.filters.quarter;
  statusFilter.value = state.filters.status;
}

function bindOwnerFilters() {
  const searchInput = $("#ownerSearchInput");
  const roleFilter = $("#ownerRoleFilter");
  const quarterFilter = $("#ownerQuarterFilter");
  const statusFilter = $("#ownerStatusFilter");
  if (!searchInput || !roleFilter || !quarterFilter || !statusFilter) return;

  searchInput.addEventListener("input", () => {
    state.filters.search = searchInput.value;
    renderPipelineBoard();
    renderList();
    renderDetail();
  });
  [roleFilter, quarterFilter, statusFilter].forEach((field) => {
    field.addEventListener("change", () => {
      state.filters.role = roleFilter.value;
      state.filters.quarter = quarterFilter.value;
      state.filters.status = statusFilter.value;
      renderPipelineBoard();
      renderList();
      renderDetail();
    });
  });
}

function renderViewTabs() {
  const activeButton = $("#activeViewButton");
  const archiveButton = $("#archiveViewButton");
  const teamButton = $("#teamViewButton");
  const teamAdminButton = $("#teamAdminViewButton");
  if (!activeButton || !archiveButton || !teamButton || !teamAdminButton) return;
  activeButton.classList.toggle("active", state.view === "active");
  archiveButton.classList.toggle("active", state.view === "archive");
  teamButton.classList.toggle("active", state.view === "team");
  teamAdminButton.classList.toggle("active", state.view === "org");
  const archiveCount = archivedEntries().length;
  archiveButton.textContent = archiveCount ? `Archives (${archiveCount})` : "Archives";
  teamButton.textContent = state.submissions.length ? `Portrait equipe (${state.submissions.length})` : "Portrait equipe";
  teamAdminButton.textContent = `Equipe (${activeTeamMembers().length})`;
  renderPipelineBoard();
}

function bindViewTabs() {
  $("#activeViewButton")?.addEventListener("click", () => {
    state.view = "active";
    renderViewTabs();
    renderList();
    renderDetail();
  });
  $("#archiveViewButton")?.addEventListener("click", () => {
    state.view = "archive";
    renderViewTabs();
    renderList();
    renderDetail();
  });
  $("#teamViewButton")?.addEventListener("click", () => {
    state.view = "team";
    renderViewTabs();
    renderList();
    renderDetail();
  });
  $("#teamAdminViewButton")?.addEventListener("click", () => {
    state.view = "org";
    renderViewTabs();
    renderList();
    renderDetail();
  });
}

function renderList() {
  if (state.view === "team" || state.view === "org") return;
  if (state.view === "archive") {
    ensureSelectedArchiveVisible();
    return;
  }
  const visibleSubmissions = ensureSelectedSubmissionVisible();
  const list = $("#submissionList");
  const count = $("#submissionCount");
  const select = $("#submissionSelect");
  const countText = visibleSubmissions.length
    ? `${visibleSubmissions.length} soumission(s) visible(s).`
    : "Aucune soumission.";
  if (!list || !count) {
    if (select) hydrateSubmissionSelect(select);
    return;
  }
  count.textContent = state.submissions.length
    ? countText
    : "Aucune soumission.";

  list.innerHTML = visibleSubmissions.map((submission) => {
    const role = roleById(submission.selectedRoleId);
    const name = submission.answers?.employee_name || "Sans nom";
    const date = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString("fr-CA") : "Sans date";
    return `
      <button class="submission-card${submission.id === state.selectedId ? " active" : ""}" type="button" data-id="${escapeHtml(submission.id)}">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(role?.label || submission.selectedRoleLabel || "Role inconnu")} - ${escapeHtml(submission.quarter || "")}</span>
        <span>${escapeHtml(date)}</span>
      </button>
    `;
  }).join("");

  $$(".submission-card", list).forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedId = card.dataset.id;
      renderList();
      renderDetail();
    });
  });
}

function renderPipelineBoard() {
  const board = $("#pipelineBoard");
  if (!board) return;
  if (state.view === "org") {
    board.innerHTML = `
      <div class="pipeline-header">
        <div>
          <h2>Charte organisationnelle</h2>
          <p>${activeTeamMembers().length} membre(s) actif(s). Les changements sauvegardes ici alimentent le rappel visible au debut du formulaire employe.</p>
        </div>
        <button class="button secondary" type="button" data-refresh-team>Recharger l'equipe</button>
      </div>
    `;
    $("[data-refresh-team]", board)?.addEventListener("click", async () => {
      try {
        await syncTeamMembers();
      } catch (error) {
        setSyncStatus(`Sync equipe echouee: ${error.message}`, "error");
      }
    });
    return;
  }
  const counts = activeStatusCounts();
  const visibleCount = state.view === "archive" ? filteredArchivedEntries().length : filteredSubmissions().length;
  board.innerHTML = `
    <div class="pipeline-header">
      <div>
        <h2>Pipeline roadmap</h2>
        <p>${escapeHtml(visibleCount)} element(s) visibles avec les filtres actifs.</p>
      </div>
      <button class="button secondary compact" id="resetOwnerFiltersButton" type="button">Reinitialiser filtres</button>
    </div>
    <div class="pipeline-lanes">
      ${OWNER_STATUSES.map(([id, label]) => `
        <button class="pipeline-lane${state.filters.status === id && state.view !== "archive" ? " active" : ""}" type="button" data-pipeline-status="${escapeHtml(id)}">
          <strong>${escapeHtml(String(counts[id] || 0))}</strong>
          <span>${escapeHtml(label)}</span>
        </button>
      `).join("")}
      <button class="pipeline-lane${state.view === "archive" ? " active" : ""}" type="button" data-pipeline-view="archive">
        <strong>${escapeHtml(String(archivedEntries().length))}</strong>
        <span>Archives</span>
      </button>
    </div>
  `;

  $$(".pipeline-lane[data-pipeline-status]", board).forEach((button) => {
    button.addEventListener("click", () => {
      state.view = "active";
      state.filters.status = button.dataset.pipelineStatus || "all";
      const statusFilter = $("#ownerStatusFilter");
      if (statusFilter) statusFilter.value = state.filters.status;
      renderViewTabs();
      renderList();
      renderDetail();
    });
  });
  $("[data-pipeline-view='archive']", board)?.addEventListener("click", () => {
    state.view = "archive";
    renderViewTabs();
    renderList();
    renderDetail();
  });
  $("#resetOwnerFiltersButton")?.addEventListener("click", () => {
    state.filters = { search: "", role: "all", quarter: "all", status: "all" };
    const searchInput = $("#ownerSearchInput");
    if (searchInput) searchInput.value = "";
    renderOwnerFilters();
    renderViewTabs();
    renderList();
    renderDetail();
  });
}

function submissionOptionLabel(submission) {
  const role = roleById(submission.selectedRoleId);
  const name = submission.answers?.employee_name || "Sans nom";
  const roleLabel = role?.label || submission.selectedRoleLabel || "Role inconnu";
  const date = submission.submittedAt ? new Date(submission.submittedAt).toLocaleDateString("fr-CA") : "Sans date";
  return `${name} - ${roleLabel} - ${submission.quarter || ""} - ${date}`;
}

function renderSubmissionPicker() {
  const submissions = filteredSubmissions();
  if (!submissions.length) return "";
  return `
    <label class="field submission-picker">
      <span>Soumission</span>
      <select id="submissionSelect">
        ${submissions.map((submission) => `
          <option value="${escapeHtml(submission.id)}" ${submission.id === state.selectedId ? "selected" : ""}>
            ${escapeHtml(submissionOptionLabel(submission))}
          </option>
        `).join("")}
      </select>
      <small>${submissions.length} soumission(s) visible(s) avec les filtres actifs</small>
    </label>
  `;
}

function hydrateSubmissionSelect(select) {
  select.innerHTML = filteredSubmissions().map((submission) => `
    <option value="${escapeHtml(submission.id)}" ${submission.id === state.selectedId ? "selected" : ""}>
      ${escapeHtml(submissionOptionLabel(submission))}
    </option>
  `).join("");
}

function bindSubmissionPicker() {
  const select = $("#submissionSelect");
  if (!select) return;
  select.addEventListener("change", () => {
    state.selectedId = select.value;
    renderDetail();
  });
}

function archiveGroups(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    const key = entry.normalizedName || entry.id;
    if (!groups.has(key)) {
      groups.set(key, { key, name: entry.name, entries: [] });
    }
    groups.get(key).entries.push(entry);
  });
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function renderArchivesView() {
  const area = $("#detailArea");
  const entries = ensureSelectedArchiveVisible();
  const groups = archiveGroups(entries);
  const selected = entries.find((entry) => entry.id === state.selectedArchiveId);

  if (!entries.length) {
    area.innerHTML = `
      <section class="section">
        <div class="section-header">
          <h2>Archives</h2>
          <p>${archivedEntries().length ? "Aucune archive ne correspond aux filtres actifs." : "Aucune rencontre archivee pour le moment."}</p>
        </div>
        <div class="section-body">
          <div class="notice">Quand une rencontre sera archivee, elle apparaitra ici dans le dossier de la personne.</div>
        </div>
      </section>
    `;
    return;
  }

  area.innerHTML = `
    <section class="section">
      <div class="section-header owner-submission-header">
        <div>
          <h2>Archives / dossiers equipe</h2>
          <p>${entries.length} roadmap archivee(s), regroupee(s) par membre. Les anciennes archives gardent leur contenu meme si le formulaire evolue.</p>
        </div>
      </div>
      <div class="archive-browser">
        <aside class="archive-list" aria-label="Dossiers membres archives">
          ${groups.map((group) => `
            <div class="archive-person">
              <strong>${escapeHtml(group.name)}</strong>
              <span>${group.entries.length} archive(s)</span>
              ${group.entries.map((entry) => `
                <button class="archive-entry${entry.id === state.selectedArchiveId ? " active" : ""}" type="button" data-archive-id="${escapeHtml(entry.id)}">
                  <span>${escapeHtml(entry.quarter || "Sans trimestre")}</span>
                  <small>${escapeHtml(entry.roleLabel)}${entry.archivedAt ? ` - archivee le ${escapeHtml(new Date(entry.archivedAt).toLocaleDateString("fr-CA"))}` : ""}</small>
                </button>
              `).join("")}
            </div>
          `).join("")}
        </aside>
        <div class="archive-detail">
          ${selected ? renderArchivedEntryDetail(selected) : '<div class="notice">Selectionne une archive.</div>'}
        </div>
      </div>
    </section>
  `;

  $$(".archive-entry", area).forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedArchiveId = button.dataset.archiveId;
      renderArchivesView();
    });
  });
  $("#exportArchiveButton")?.addEventListener("click", () => exportArchiveEntry(selected));
}

function roleDistribution(submissions) {
  const counts = new Map();
  submissions.forEach((submission) => {
    const role = roleById(submission.selectedRoleId);
    const label = role?.label || submission.selectedRoleLabel || "Role inconnu";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function teamSignals(submissions) {
  const byModule = new Map();
  const byKeyword = new Map();
  let lowScoreCount = 0;
  let expectedCount = 0;
  let answeredCount = 0;

  submissions.forEach((submission) => {
    const summary = buildOwnerSummary(submission);
    expectedCount += summary.expectedCount;
    answeredCount += summary.answeredCount;
    lowScoreCount += summary.lowScores.length;
    summary.lowScores.forEach(({ question }) => {
      const moduleTitle = question?.moduleTitle || "Question";
      byModule.set(moduleTitle, (byModule.get(moduleTitle) || 0) + 1);
    });
    detectTextSignals(submission).forEach((signal) => {
      byKeyword.set(signal.label, (byKeyword.get(signal.label) || 0) + 1);
    });
  });

  return {
    completion: expectedCount ? Math.round((answeredCount / expectedCount) * 100) : 0,
    lowScoreCount,
    modules: [...byModule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    keywords: [...byKeyword.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  };
}

function renderInsightList(rows, emptyText) {
  if (!rows.length) return `<div class="notice">${escapeHtml(emptyText)}</div>`;
  return `
    <div class="insight-list">
      ${rows.map(([label, count]) => `
        <div class="insight-row">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(String(count))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTeamView() {
  const area = $("#detailArea");
  const active = filteredSubmissions();
  const archived = filteredArchivedEntries();
  const signals = teamSignals(active);
  const statuses = activeStatusCounts();
  const roles = roleDistribution(active);

  area.innerHTML = `
    <section class="section">
      <div class="section-header">
        <h2>Portrait equipe</h2>
        <p>Vue d'ensemble pour preparer les rencontres, reperer les risques et planifier les suivis.</p>
      </div>
      <div class="section-body">
        <div class="metrics">
          <div class="metric"><strong>${escapeHtml(String(active.length))}</strong><span>Roadmaps actifs</span></div>
          <div class="metric"><strong>${escapeHtml(String(archived.length))}</strong><span>Archives visibles</span></div>
          <div class="metric"><strong>${escapeHtml(`${signals.completion}%`)}</strong><span>Completion moyenne</span></div>
          <div class="metric"><strong>${escapeHtml(String(signals.lowScoreCount))}</strong><span>Scores 1-2 detectes</span></div>
        </div>
      </div>
    </section>

    <div class="team-grid">
      <section class="section">
        <div class="section-header">
          <h2>Statuts owners</h2>
          <p>Ce qui reste a traiter dans le trimestre.</p>
        </div>
        <div class="section-body">
          <div class="insight-list">
            ${OWNER_STATUSES.map(([id, label]) => `
              <button class="insight-row" type="button" data-team-status="${escapeHtml(id)}">
                <strong>${escapeHtml(label)}</strong>
                <span>${escapeHtml(String(statuses[id] || 0))}</span>
              </button>
            `).join("")}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>Roles representes</h2>
          <p>Distribution des soumissions actives.</p>
        </div>
        <div class="section-body">
          ${renderInsightList(roles, "Aucun role visible avec les filtres actifs.")}
        </div>
      </section>
    </div>

    <div class="team-grid">
      <section class="section">
        <div class="section-header">
          <h2>Zones a surveiller</h2>
          <p>Modules ou les scores faibles apparaissent le plus souvent.</p>
        </div>
        <div class="section-body">
          ${renderInsightList(signals.modules, "Aucune zone faible detectee pour l'instant.")}
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>Themes recurrents</h2>
          <p>Mots signaux reperes dans les reponses ouvertes.</p>
        </div>
        <div class="section-body">
          ${renderInsightList(signals.keywords, "Aucun theme recurrent detecte pour l'instant.")}
        </div>
      </section>
    </div>
  `;

  $$("[data-team-status]", area).forEach((button) => {
    button.addEventListener("click", () => {
      state.view = "active";
      state.filters.status = button.dataset.teamStatus || "all";
      const statusFilter = $("#ownerStatusFilter");
      if (statusFilter) statusFilter.value = state.filters.status;
      renderViewTabs();
      renderList();
      renderDetail();
    });
  });
}

function renderTeamOrgPreview() {
  const departments = state.teamDepartments || TEAM_DEPARTMENTS;
  const activeMembers = sortedTeamMembers();
  return departments.map((department) => {
    const members = activeMembers.filter((member) => member.departmentId === department.id);
    return `
      <div class="org-column ${escapeHtml(department.className || "")}">
        <h3>${escapeHtml(department.label)}</h3>
        <ul>
          ${members.length ? members.map((member) => `
            <li>
              <strong>${escapeHtml(member.name)}</strong>
              <span>${escapeHtml(member.displayTitle || roleLabelsForTeamMember(member))}</span>
            </li>
          `).join("") : `<li><span>Aucun membre actif.</span></li>`}
        </ul>
      </div>
    `;
  }).join("");
}

function renderTeamMemberForm(member = null) {
  const selectedRoles = new Set(member?.roleIds || []);
  const nextOrder = Math.max(0, ...sortedTeamMembers({ includeInactive: true }).map((item) => Number(item.sortOrder || 0))) + 10;
  return `
    <form class="team-member-form" id="teamMemberForm">
      <input type="hidden" name="memberId" value="${escapeHtml(member?.memberId || "")}">
      <div class="form-grid two">
        <label class="field">
          <span>Nom</span>
          <input name="name" type="text" value="${escapeHtml(member?.name || "")}" placeholder="Nom du membre" required>
        </label>
        <label class="field">
          <span>Departement</span>
          <select name="departmentId" required>
            ${(state.teamDepartments || TEAM_DEPARTMENTS).map((department) => `
              <option value="${escapeHtml(department.id)}" ${member?.departmentId === department.id ? "selected" : ""}>${escapeHtml(department.label)}</option>
            `).join("")}
          </select>
        </label>
      </div>
      <label class="field">
        <span>Titre visible dans la charte</span>
        <input name="displayTitle" type="text" value="${escapeHtml(member?.displayTitle || "")}" placeholder="Ex.: Coach professionnel, Coach en chef, Entretien menager...">
      </label>
      <div class="form-grid two">
        <label class="field">
          <span>Ordre d'affichage</span>
          <input name="sortOrder" type="number" min="0" step="1" value="${escapeHtml(String(member?.sortOrder ?? nextOrder))}">
        </label>
        <label class="field checkbox-field">
          <input name="active" type="checkbox" ${member?.active === false ? "" : "checked"}>
          <span>Membre actif dans l'organigramme</span>
        </label>
      </div>
      <fieldset class="role-checks">
        <legend>Roles lies au formulaire</legend>
        ${state.config.roles.map((role) => `
          <label class="checkbox-row">
            <input name="teamRoleIds" type="checkbox" value="${escapeHtml(role.id)}" ${selectedRoles.has(role.id) ? "checked" : ""}>
            <span>${escapeHtml(role.label)}</span>
          </label>
        `).join("")}
      </fieldset>
      <div class="actions">
        <button class="button" type="submit">Sauvegarder membre</button>
        <button class="button secondary" type="button" data-team-reset>Reinitialiser</button>
      </div>
    </form>
  `;
}

function renderTeamAdminView() {
  const area = $("#detailArea");
  const members = sortedTeamMembers({ includeInactive: true });
  area.innerHTML = `
    <section class="section">
      <div class="section-header owner-submission-header">
        <div>
          <h2>Equipe et organigramme</h2>
          <p>Ajoute, modifie ou desactive les membres. Le formulaire employe reprend cette charte au debut de la roadmap.</p>
        </div>
        <button class="button secondary" type="button" data-team-new>Nouveau membre</button>
      </div>
      <div class="section-body">
        <div class="team-admin-layout">
          <div>
            <h3 class="compact-title">Modifier un membre</h3>
            ${renderTeamMemberForm()}
          </div>
          <div>
            <h3 class="compact-title">Membres</h3>
            <div class="team-member-list">
              ${members.map((member) => `
                <article class="team-member-card${member.active === false ? " inactive" : ""}">
                  <div>
                    <strong>${escapeHtml(member.name)}</strong>
                    <span>${escapeHtml(teamDepartmentById(member.departmentId)?.label || "Departement inconnu")} - ${escapeHtml(member.displayTitle || roleLabelsForTeamMember(member))}</span>
                    <small>${escapeHtml(roleLabelsForTeamMember(member))}</small>
                  </div>
                  <div class="team-member-actions">
                    <button class="button secondary compact" type="button" data-team-edit="${escapeHtml(member.memberId)}">Modifier</button>
                    <button class="button secondary compact" type="button" data-team-toggle="${escapeHtml(member.memberId)}" data-team-active="${member.active === false ? "true" : "false"}">
                      ${member.active === false ? "Reactiver" : "Desactiver"}
                    </button>
                  </div>
                </article>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h2>Apercu charte</h2>
        <p>Voici ce que les membres de l'equipe verront au debut du formulaire.</p>
      </div>
      <div class="section-body">
        <div class="org-grid org-preview">
          ${renderTeamOrgPreview()}
        </div>
      </div>
    </section>
  `;

  bindTeamAdminView();
}

function teamMemberFromForm(form) {
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const existingId = String(data.get("memberId") || "").trim();
  const memberId = existingId || makeTeamMemberId(name);
  return {
    memberId,
    name,
    departmentId: String(data.get("departmentId") || TEAM_DEPARTMENTS[0].id),
    roleIds: data.getAll("teamRoleIds").map(String),
    displayTitle: String(data.get("displayTitle") || "").trim(),
    sortOrder: Number(data.get("sortOrder") || 999),
    active: data.get("active") === "on"
  };
}

function persistTeamMember(member) {
  const existing = state.teamMembers || [];
  state.teamMembers = [
    ...existing.filter((item) => item.memberId !== member.memberId),
    member
  ];
  saveLocalData();
  renderOwnerFilters();
  renderViewTabs();
  if (state.view === "org") renderDetail();
}

async function saveTeamMemberToServer(member) {
  if (!state.settings.endpointUrl) return { ok: true, localOnly: true };
  const response = await fetch(state.settings.endpointUrl, {
    method: "POST",
    mode: "no-cors",
    credentials: "include",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "save_team_member",
      project: "roadmap-trimestrielle-cfsb",
      teamMember: member
    })
  });
  if (response.type === "opaque") return { ok: true, opaque: true };
  return response.json();
}

async function saveTeamMemberFromForm(event) {
  event.preventDefault();
  const member = teamMemberFromForm(event.currentTarget);
  if (!member.name) {
    setSyncStatus("Impossible de sauvegarder un membre sans nom.", "error");
    return;
  }
  persistTeamMember(member);
  setSyncStatus("Membre sauvegarde localement. Sync Google Sheets en cours...");
  try {
    const result = await saveTeamMemberToServer(member);
    if (result?.ok === false) throw new Error(result.error || "Sauvegarde refusee.");
    setSyncStatus(`${member.name} est sauvegarde dans la charte.`, "success");
  } catch (error) {
    setSyncStatus(`Membre garde localement, sync serveur echouee: ${error.message}`, "error");
  }
}

async function toggleTeamMemberActive(memberId, active) {
  const member = (state.teamMembers || []).find((item) => item.memberId === memberId);
  if (!member) return;
  const updated = { ...member, active };
  persistTeamMember(updated);
  try {
    const result = await saveTeamMemberToServer(updated);
    if (result?.ok === false) throw new Error(result.error || "Sauvegarde refusee.");
    setSyncStatus(`${updated.name} est ${active ? "actif" : "desactive"} dans la charte.`, "success");
  } catch (error) {
    setSyncStatus(`Changement garde localement, sync serveur echouee: ${error.message}`, "error");
  }
}

function hydrateTeamForm(member = null) {
  const holder = $("#teamMemberForm")?.parentElement;
  if (!holder) return;
  holder.innerHTML = `<h3 class="compact-title">Modifier un membre</h3>${renderTeamMemberForm(member)}`;
  bindTeamAdminView();
  $("#teamMemberForm")?.querySelector("input[name='name']")?.focus();
}

function bindTeamAdminView() {
  const form = $("#teamMemberForm");
  if (form) form.onsubmit = saveTeamMemberFromForm;
  const resetButton = $("[data-team-reset]");
  if (resetButton) resetButton.onclick = () => hydrateTeamForm();
  const newButton = $("[data-team-new]");
  if (newButton) newButton.onclick = () => hydrateTeamForm();
  $$("[data-team-edit]").forEach((button) => {
    button.onclick = () => {
      const member = (state.teamMembers || []).find((item) => item.memberId === button.dataset.teamEdit);
      hydrateTeamForm(member || null);
    };
  });
  $$("[data-team-toggle]").forEach((button) => {
    button.onclick = () => {
      toggleTeamMemberActive(button.dataset.teamToggle, button.dataset.teamActive === "true");
    };
  });
}

function renderArchivedEntryDetail(entry) {
  const submission = entry.submission;
  if (!submission) {
    return `
      <div class="notice">
        Cette archive vient d'une ancienne version locale qui ne contenait que le marqueur d'archive. Les prochaines archives garderont les reponses completes.
      </div>
    `;
  }

  const summary = buildOwnerSummary(submission);
  return `
    <section class="section archive-inner-section">
      <div class="section-header">
        <h2>${escapeHtml(entry.name)}</h2>
        <p>${escapeHtml(entry.roleLabel)} - ${escapeHtml(entry.quarter || "Sans trimestre")} - formulaire v${escapeHtml(entry.archive.formVersion || "inconnue")}</p>
      </div>
      <div class="section-body">
        <div class="metrics">
          <div class="metric"><strong>${escapeHtml(statusLabel(entry.ownerNotes?.owner_status || "archived"))}</strong><span>Statut final</span></div>
          <div class="metric"><strong>${escapeHtml(entry.archivedAt ? new Date(entry.archivedAt).toLocaleDateString("fr-CA") : "Sans date")}</strong><span>Date archive</span></div>
          <div class="metric"><strong>${escapeHtml(entry.submittedAt ? new Date(entry.submittedAt).toLocaleDateString("fr-CA") : "Sans date")}</strong><span>Date soumission</span></div>
          <div class="metric"><strong>${escapeHtml(entry.ownerNotes?.owner_reviewer || "Non assigne")}</strong><span>Owner</span></div>
        </div>
        ${entry.ownerNotes?.owner_followup_notes ? `
          <div class="archive-note">
            <strong>Note de rencontre</strong>
            <p>${escapeHtml(entry.ownerNotes.owner_followup_notes)}</p>
          </div>
        ` : ""}
        ${renderOwnerSummary(summary)}
        <div class="actions">
          <button class="button secondary" id="exportArchiveButton" type="button">Exporter archive JSON</button>
        </div>
      </div>
    </section>
    <section class="section archive-inner-section">
      <div class="section-header">
        <h2>Reponses archivees</h2>
        <p>Lecture de la soumission telle qu'elle a ete conservee au moment de l'archive.</p>
      </div>
      <div class="section-body">
        ${renderResponseSections(submission)}
      </div>
    </section>
  `;
}

function exportArchiveEntry(entry) {
  if (!entry) return;
  navigator.clipboard?.writeText(JSON.stringify(entry.archive, null, 2));
  alert("Archive JSON copiee dans le presse-papiers.");
}

function submissionKey(submission) {
  return submission?.serverSubmissionId || submission?.id || "";
}

function isArchivedSubmission(submissionOrId) {
  const id = typeof submissionOrId === "string" ? submissionOrId : submissionKey(submissionOrId);
  return Boolean(id && state.archivedSubmissions[id]);
}

function markSubmissionArchived(submissionId, name, submission = null, ownerNotes = {}) {
  if (!submissionId) return;
  state.archivedSubmissions[submissionId] = {
    archivedAt: new Date().toISOString(),
    name: name || "",
    roleId: submission?.selectedRoleId || "",
    roleLabel: roleById(submission?.selectedRoleId)?.label || submission?.selectedRoleLabel || "",
    quarter: submission?.quarter || "",
    submittedAt: submission?.submittedAt || "",
    formVersion: state.config?.meta?.version || "",
    submission,
    ownerNotes: {
      ...ownerNotes,
      owner_status: ownerNotes.owner_status || "archived"
    }
  };
}

function isServerBackedSubmission(submission) {
  return Boolean(submission?.serverSubmissionId || submission?.source === "server");
}

function mergeServerSubmissions(serverSubmissions = [], { replaceServerBacked = true } = {}) {
  const byId = new Map();

  state.submissions.forEach((submission) => {
    const id = submission.serverSubmissionId || submission.id;
    if (replaceServerBacked && isServerBackedSubmission(submission)) return;
    if (id && !isArchivedSubmission(id)) byId.set(id, submission);
  });

  serverSubmissions.forEach((submission) => {
    const id = submission.serverSubmissionId || submission.id;
    if (!id) return;
    if (isArchivedSubmission(id)) return;
    const existing = byId.get(id) || {};
    byId.set(id, {
      ...existing,
      ...submission,
      id,
      serverSubmissionId: submission.serverSubmissionId || id,
      source: "server"
    });

    if (submission.ownerNotes && Object.keys(submission.ownerNotes).length) {
      state.ownerNotes[id] = {
        ...(state.ownerNotes[id] || {}),
        ...submission.ownerNotes
      };
    }
  });

  state.submissions = [...byId.values()].sort((a, b) => {
    return String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""));
  });

  if (!state.selectedId || !state.submissions.some((item) => item.id === state.selectedId)) {
    state.selectedId = state.submissions[0]?.id || "";
  }
}

function fetchJsonp(url, params = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const callbackName = `roadmapOwnersCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Delai depasse pendant la synchronisation."));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    const query = new URLSearchParams({
      action: "list_roadmap_submissions",
      project: "roadmap-trimestrielle-cfsb",
      limit: "200",
      ...params,
      callback: callbackName,
      _: String(Date.now())
    });
    const separator = url.includes("?") ? "&" : "?";
    script.src = `${url}${separator}${query.toString()}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("Impossible de rejoindre Apps Script."));
    };
    document.head.appendChild(script);
  });
}

async function syncTeamMembers({ silent = false } = {}) {
  if (!state.settings.endpointUrl) {
    state.teamMembers = JSON.parse(localStorage.getItem(STORAGE_KEYS.teamMembers) || "null") || DEFAULT_TEAM_MEMBERS;
    state.teamDepartments = TEAM_DEPARTMENTS;
    if (!silent) setSyncStatus("Mode local: l'equipe reste dans ce navigateur.");
    return;
  }

  const result = await fetchJsonp(state.settings.endpointUrl, {
    action: "list_team_members",
    includeInactive: "true"
  }, 60000);

  if (!result.ok) throw new Error(result.error || "Synchronisation equipe refusee par Apps Script.");
  state.teamMembers = result.members || [];
  state.teamDepartments = result.departments?.length ? result.departments : TEAM_DEPARTMENTS;
  saveLocalData();
  renderViewTabs();
  if (state.view === "org") renderDetail();
  if (!silent) setSyncStatus(`${activeTeamMembers().length} membre(s) actif(s) dans la charte.`, "success");
}

function fetchIframeBridge(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    let settled = false;
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Delai depasse pendant la synchronisation iframe."));
    }, timeoutMs);

    function cleanup() {
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", handleMessage);
      iframe.remove();
    }

    function resolvePayload(payload) {
      cleanup();
      resolve(payload || {});
    }

    function handleMessage(event) {
      const data = event.data || {};
      if (data.source !== "cfsb-roadmap-owners-bridge") return;
      resolvePayload(data.payload);
    }

    function tryReadWindowName() {
      if (settled) return;
      try {
        const raw = iframe.contentWindow?.name || "";
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.source !== "cfsb-roadmap-owners-bridge") return;
        resolvePayload(data.payload);
      } catch (error) {
        // Certains navigateurs bloquent la lecture cross-origin; postMessage reste disponible.
      }
    }

    window.addEventListener("message", handleMessage);
    iframe.hidden = true;
    iframe.referrerPolicy = "no-referrer";
    const separator = url.includes("?") ? "&" : "?";
    iframe.src = `${url}${separator}action=roadmap_owners_bridge&project=roadmap-trimestrielle-cfsb&limit=200&_=${Date.now()}`;
    iframe.onerror = () => {
      cleanup();
      reject(new Error("Impossible de rejoindre Apps Script par iframe."));
    };
    iframe.onload = () => {
      tryReadWindowName();
      window.setTimeout(tryReadWindowName, 250);
      window.setTimeout(tryReadWindowName, 1000);
    };
    document.body.appendChild(iframe);
  });
}

async function syncServerSubmissions({ silent = false } = {}) {
  if (!state.settings.endpointUrl) {
    setSyncStatus("Mode local: ajoute l'URL Apps Script pour synchroniser Google Sheets.");
    return;
  }

  if (!silent) setSyncStatus("Synchronisation avec Google Sheets en cours...");
  let result;
  try {
    result = await fetchJsonp(state.settings.endpointUrl);
  } catch (jsonpError) {
    if (!silent) setSyncStatus("Premier mode de sync bloque. Tentative par pont Apps Script...");
    try {
      result = await fetchIframeBridge(state.settings.endpointUrl);
    } catch (bridgeError) {
      throw new Error(`${jsonpError.message} Pont iframe aussi echoue: ${bridgeError.message}`);
    }
  }
  if (!result.ok) {
    throw new Error(result.error || "Synchronisation refusee par Apps Script.");
  }

  mergeServerSubmissions(result.submissions || []);
  state.lastSyncAt = result.syncedAt || new Date().toISOString();
  saveLocalData();
  renderOwnerFilters();
  renderViewTabs();
  renderList();
  renderDetail();

  const date = new Date(state.lastSyncAt).toLocaleString("fr-CA");
  setSyncStatus(`${state.submissions.length} soumission(s) visible(s) depuis Google Sheets. Derniere sync: ${date}.`, "success");
}

async function syncDashboardData({ silent = false } = {}) {
  const [teamResult, submissionsResult] = await Promise.allSettled([
    syncTeamMembers({ silent: true }),
    syncServerSubmissions({ silent })
  ]);

  if (submissionsResult.status === "rejected") throw submissionsResult.reason;
  if (teamResult.status === "rejected") {
    setSyncStatus(`Soumissions synchronisees. Sync equipe echouee: ${teamResult.reason.message}`, "error");
  }
}

function renderDetail() {
  const area = $("#detailArea");
  if (state.view === "org") {
    renderTeamAdminView();
    return;
  }
  if (state.view === "team") {
    renderTeamView();
    return;
  }
  if (state.view === "archive") {
    renderArchivesView();
    return;
  }
  ensureSelectedSubmissionVisible();
  const submission = state.submissions.find((item) => item.id === state.selectedId);
  if (!submission) {
    area.innerHTML = `
      <section class="section">
        <div class="section-header owner-submission-header">
          <div>
            <h2>Soumission</h2>
            <p>${state.submissions.length ? "Aucune soumission ne correspond aux filtres actifs." : "Aucune soumission chargee pour le moment."}</p>
          </div>
          ${renderSubmissionPicker()}
        </div>
      </section>
    `;
    bindSubmissionPicker();
    return;
  }

  const role = roleById(submission.selectedRoleId);
  const answers = submission.answers || {};
  const notes = ownerNotesFor(submission);
  const aspiration = answers.coach_aspiration_select || "none";
  const pathway = state.config.pathways.find((item) => item.id === aspiration);
  const ownerSummary = buildOwnerSummary(submission);
  const prepPlan = buildPreparationPlan(submission, ownerSummary, notes);

  area.innerHTML = `
    <section class="section">
      <div class="section-header owner-submission-header">
        <div>
          <h2>${escapeHtml(answers.employee_name || "Sans nom")}</h2>
          <p>${escapeHtml(role?.label || submission.selectedRoleLabel || "Role inconnu")} - ${escapeHtml(submission.quarter || "")}</p>
        </div>
        ${renderSubmissionPicker()}
      </div>
      <div class="section-body">
        <div class="metrics">
          <div class="metric"><strong>${escapeHtml(role?.level || "")}</strong><span>Niveau / famille</span></div>
          <div class="metric"><strong>${escapeHtml(pathway?.label || "Aucune aspiration")}</strong><span>Trajectoire declaree</span></div>
          <div class="metric"><strong>${escapeHtml(recommendMeetingFormat(submission, notes))}</strong><span>Suggestion initiale</span></div>
          <div class="metric"><strong>${escapeHtml(statusLabel(ownerStatusFor(submission)))}</strong><span>Statut owner</span></div>
        </div>
      </div>
    </section>

    <div class="meeting-grid">
      <section class="section responses-panel">
        <div class="section-header">
          <h2>Resume de rencontre</h2>
          <p>Points a balayer avant de descendre dans les reponses completes.</p>
        </div>
        <div class="section-body">
          ${renderOwnerSummary(ownerSummary)}
          ${renderPreparationPlan(prepPlan)}
          <div class="actions">
            <button class="button secondary" id="copyPrepButton" type="button">Copier preparation</button>
            <button class="button secondary" id="copyRecapButton" type="button">Copier recap rencontre</button>
          </div>
        </div>
      </section>

      <aside class="section sticky-owner-notes">
        <div class="section-header">
          <h2>Notes owners</h2>
          <p>Autosave local pendant la rencontre.</p>
        </div>
        <div class="section-body">
          ${renderOwnerFields(notes)}
          <div class="notice" id="ownerSyncStatus">
            ${escapeHtml(state.settings.endpointUrl ? "Autosave local actif. La sync Apps Script sera tentee apres les modifications." : "Autosave local actif. Mode local: les notes restent dans ce navigateur.")}
          </div>
          <div class="actions owners-actions">
            <button class="button secondary" id="copyResumeLinkButton" type="button">Lien reprise</button>
            <button class="button secondary" id="copyReminderButton" type="button">Message relance</button>
            <button class="button secondary" id="exportButton" type="button">Exporter JSON</button>
            <button class="button warn" id="archiveButton" type="button">Archiver</button>
            <button class="button" id="saveNotesButton" type="button">Sauvegarder</button>
          </div>
        </div>
      </aside>
    </div>

    <section class="section responses-panel">
      <div class="section-header">
        <h2>Reponses employe</h2>
        <p>Lecture groupee par section pour guider la discussion sans perdre le fil.</p>
      </div>
      <div class="section-body">
        ${renderResponseSections(submission)}
      </div>
    </section>
  `;

  $("#saveNotesButton").addEventListener("click", () => saveNotes(submission));
  $("#exportButton").addEventListener("click", () => exportSelected(submission));
  $("#copyPrepButton").addEventListener("click", () => copyMeetingBrief(submission));
  $("#copyRecapButton").addEventListener("click", () => copyMeetingRecap(submission));
  $("#copyResumeLinkButton").addEventListener("click", () => copyResumeLink(submission));
  $("#copyReminderButton").addEventListener("click", () => copyReminderMessage(submission));
  $("#archiveButton").addEventListener("click", () => archiveSelectedSubmission(submission));
  bindSubmissionPicker();
  bindOwnerAutosave(submission);
}

function renderOwnerFields(notes) {
  const reviewer = notes.owner_reviewer || "";
  const status = notes.owner_status || "to_read";
  return `
    <label class="field">
      <span>Statut</span>
      <select data-owner-field="owner_status">
        ${OWNER_STATUSES.map(([id, label]) => `<option value="${escapeHtml(id)}" ${status === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
      </select>
    </label>
    <label class="field">
      <span>Owner responsable</span>
      <select data-owner-field="owner_reviewer">
        <option value="">Choisir</option>
        <option value="Michael" ${reviewer === "Michael" ? "selected" : ""}>Michael</option>
        <option value="Gabriel" ${reviewer === "Gabriel" ? "selected" : ""}>Gabriel</option>
        <option value="Michael + Gabriel" ${reviewer === "Michael + Gabriel" ? "selected" : ""}>Michael + Gabriel</option>
      </select>
    </label>
    <label class="field">
      <span>Format rencontre</span>
      <select data-owner-field="owner_meeting_format">
        ${["", "Gabriel seul", "Michael seul", "Gabriel + Michael", "Rencontre courte", "Rencontre approfondie"].map((option) => `
          <option value="${escapeHtml(option)}" ${notes.owner_meeting_format === option ? "selected" : ""}>${escapeHtml(option || "Choisir")}</option>
        `).join("")}
      </select>
    </label>
    <label class="field">
      <span>Sujets a discuter</span>
      <textarea data-owner-field="owner_priority_topics" placeholder="Themes prioritaires, irritants, points sensibles...">${escapeHtml(notes.owner_priority_topics || "")}</textarea>
    </label>
    <label class="field">
      <span>Questions a poser</span>
      <textarea data-owner-field="owner_questions" placeholder="Questions de clarification pour guider la rencontre...">${escapeHtml(notes.owner_questions || "")}</textarea>
    </label>
    <label class="field">
      <span>Engagements du membre</span>
      <textarea data-owner-field="owner_performance" placeholder="Objectifs, comportements ou actions que la personne prend...">${escapeHtml(notes.owner_performance || "")}</textarea>
    </label>
    <label class="field">
      <span>Engagements direction</span>
      <textarea data-owner-field="owner_direction_commitments" placeholder="Support, clarification, formation ou decision que CFSB prend...">${escapeHtml(notes.owner_direction_commitments || "")}</textarea>
    </label>
    <label class="field">
      <span>Note de rencontre</span>
      <textarea class="owner-main-note" data-owner-field="owner_followup_notes" placeholder="Synthese finale, decisions, prochaine action, suivi au prochain trimestre...">${escapeHtml(notes.owner_followup_notes || "")}</textarea>
    </label>
  `;
}

function textAnswers(submission) {
  return Object.values(submission.answers || {})
    .map((value) => String(value ?? "").toLowerCase())
    .filter(Boolean);
}

function detectTextSignals(submission) {
  const text = textAnswers(submission).join(" ");
  const signals = [
    { label: "Argent / remuneration", patterns: ["argent", "salaire", "pay", "paye", "revenu", "taux", "remuneration"] },
    { label: "Role / clarte", patterns: ["role", "clarte", "flou", "confus", "attente"] },
    { label: "Mentorat / formation", patterns: ["mentor", "formation", "developpement", "apprendre", "feedback"] },
    { label: "Systemes / outils", patterns: ["systeme", "outil", "kilo", "chip", "process", "procedure"] },
    { label: "Horaire / energie", patterns: ["horaire", "temps", "fatigue", "energie", "charge", "disponibilite"] },
    { label: "Clients / membres", patterns: ["client", "membre", "retention", "suivi", "appel"] }
  ];
  return signals.filter((signal) => signal.patterns.some((pattern) => text.includes(pattern)));
}

function buildPreparationPlan(submission, summary, notes = {}) {
  const answers = submission.answers || {};
  const pathway = state.config.pathways.find((item) => item.id === answers.coach_aspiration_select);
  const signals = detectTextSignals(submission);
  const questions = [];

  summary.lowScores.slice(0, 3).forEach(({ question, value }) => {
    questions.push(`Qu'est-ce qui ferait passer "${question?.label || "ce point"}" de ${value} a 3?`);
  });
  if (summary.missingRequired.length) {
    questions.push("Quelles reponses importantes manquent encore et pourquoi?");
  }
  if (pathway && pathway.id !== "none") {
    questions.push(`Qu'est-ce qui serait le prochain pas concret vers ${pathway.label}?`);
  }
  signals.slice(0, 2).forEach((signal) => {
    questions.push(`Qu'est-ce qu'on doit clarifier autour de: ${signal.label}?`);
  });
  if (notes.owner_questions) {
    questions.unshift(...String(notes.owner_questions).split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 3));
  }

  return {
    signals,
    questions: [...new Set(questions)].slice(0, 6),
    ownerTopics: String(notes.owner_priority_topics || "").split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 5),
    memberCommitments: String(notes.owner_performance || "").split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 5),
    directionCommitments: String(notes.owner_direction_commitments || "").split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 5)
  };
}

function renderPreparationPlan(plan) {
  return `
    <div class="prep-panel">
      <div class="prep-block">
        <h3>Questions suggerees</h3>
        ${renderPlainList(plan.questions, "Aucune question prioritaire generee.")}
      </div>
      <div class="prep-block">
        <h3>Signaux a surveiller</h3>
        ${renderPlainList(plan.signals.map((signal) => signal.label), "Aucun signal texte recurrent detecte.")}
      </div>
      <div class="prep-block">
        <h3>Engagements notes</h3>
        ${renderPlainList([...plan.memberCommitments, ...plan.directionCommitments].slice(0, 6), "Aucun engagement structure pour l'instant.")}
      </div>
    </div>
  `;
}

function renderPlainList(items, emptyText) {
  if (!items.length) return `<p class="summary-empty">${escapeHtml(emptyText)}</p>`;
  return `<ul class="plain-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function buildOwnerSummary(submission) {
  const answers = submission.answers || {};
  const qIndex = questionIndex();
  const expectedQuestions = allModuleQuestionsForRole(submission.selectedRoleId)
    .filter((question) => question.type !== "info" && shouldShowQuestion(question, answers));
  const answeredEntries = Object.entries(answers).filter(([, value]) => String(value ?? "").trim() !== "");
  const lowScores = answeredEntries
    .map(([questionId, value]) => ({ question: qIndex[questionId], value }))
    .filter(({ question, value }) => question?.type === "scale" && Number(value) > 0 && Number(value) <= 2)
    .slice(0, 8);
  const strengths = answeredEntries
    .map(([questionId, value]) => ({ question: qIndex[questionId], value }))
    .filter(({ question, value }) => question?.type === "scale" && Number(value) >= 4)
    .slice(0, 5);
  const missingRequired = expectedQuestions
    .filter((question) => question.required && !String(answers[question.id] ?? "").trim())
    .slice(0, 8);
  const shortAnswers = answeredEntries
    .map(([questionId, value]) => ({ question: qIndex[questionId], value: String(value ?? "").trim() }))
    .filter(({ question, value }) => ["long_text", "short_text"].includes(question?.type) && value.length > 0 && value.length < 18)
    .slice(0, 6);

  return {
    answeredCount: answeredEntries.length,
    expectedCount: expectedQuestions.length,
    lowScores,
    strengths,
    missingRequired,
    shortAnswers
  };
}

function renderSummaryList(items, emptyText, renderItem) {
  if (!items.length) return `<p class="summary-empty">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map(renderItem).join("")}</ul>`;
}

function renderOwnerSummary(summary) {
  const completion = summary.expectedCount
    ? Math.min(100, Math.round((summary.answeredCount / summary.expectedCount) * 100))
    : 0;
  return `
    <div class="summary-grid">
      <div class="summary-card">
        <strong>${completion}%</strong>
        <span>Reponses visibles (${summary.answeredCount}/${summary.expectedCount})</span>
      </div>
      <div class="summary-card">
        <strong>${summary.lowScores.length}</strong>
        <span>Scores 1-2 a discuter</span>
      </div>
      <div class="summary-card">
        <strong>${summary.missingRequired.length}</strong>
        <span>Champs requis manquants</span>
      </div>
    </div>

    <div class="summary-columns">
      <div class="summary-block">
        <h3>Points a clarifier</h3>
        ${renderSummaryList(summary.lowScores, "Aucun score faible detecte dans les reponses visibles.", ({ question, value }) => `
          <li><strong>${escapeHtml(question?.moduleTitle || "Question")}</strong><span>${escapeHtml(question?.label || "")} (${escapeHtml(value)})</span></li>
        `)}
      </div>
      <div class="summary-block">
        <h3>Forces declarees</h3>
        ${renderSummaryList(summary.strengths, "Aucun score 4 detecte pour l'instant.", ({ question }) => `
          <li><strong>${escapeHtml(question?.moduleTitle || "Question")}</strong><span>${escapeHtml(question?.label || "")}</span></li>
        `)}
      </div>
      <div class="summary-block">
        <h3>Reponses minces ou manquantes</h3>
        ${renderSummaryList([...summary.missingRequired, ...summary.shortAnswers].slice(0, 8), "Rien de majeur a signaler.", (item) => {
          const question = item.question || item;
          const suffix = item.value ? ` - "${item.value}"` : "";
          return `<li><strong>${escapeHtml(question.moduleTitle || "Question")}</strong><span>${escapeHtml(question.label || "")}${escapeHtml(suffix)}</span></li>`;
        })}
      </div>
    </div>
  `;
}

function answerDisplayValue(question, answer) {
  if (question?.type === "scale" && question.rubric?.[answer]) {
    return `${answer} - ${question.rubric[answer]}`;
  }
  return answer;
}

function renderResponseSections(submission) {
  const qIndex = questionIndex();
  const grouped = new Map();
  Object.entries(submission.answers || {}).forEach(([questionId, answer]) => {
    if (!String(answer ?? "").trim()) return;
    const question = qIndex[questionId] || { label: questionId, moduleTitle: "Systeme", groupTitle: "" };
    const moduleTitle = question.moduleTitle || "Systeme";
    const groupTitle = question.groupTitle || "General";
    if (!grouped.has(moduleTitle)) grouped.set(moduleTitle, new Map());
    const moduleGroups = grouped.get(moduleTitle);
    if (!moduleGroups.has(groupTitle)) moduleGroups.set(groupTitle, []);
    moduleGroups.get(groupTitle).push({ question, answer });
  });

  if (!grouped.size) return '<div class="notice">Aucune reponse a afficher.</div>';

  return [...grouped.entries()].map(([moduleTitle, groups], index) => `
    <details class="response-section" ${index < 2 ? "open" : ""}>
      <summary>
        <strong>${escapeHtml(moduleTitle)}</strong>
        <span>${[...groups.values()].flat().length} reponse(s)</span>
      </summary>
      <div class="response-section-body">
        ${[...groups.entries()].map(([groupTitle, rows]) => `
          <div class="response-group">
            ${groupTitle !== "General" ? `<h3>${escapeHtml(groupTitle)}</h3>` : ""}
            ${rows.map(({ question, answer }) => `
              <article class="response-item">
                <strong>${escapeHtml(question.label || "")}</strong>
                <p>${escapeHtml(answerDisplayValue(question, answer))}</p>
              </article>
            `).join("")}
          </div>
        `).join("")}
      </div>
    </details>
  `).join("");
}

function renderResponsesTable(submission) {
  const qIndex = questionIndex();
  const rows = Object.entries(submission.answers || {}).map(([questionId, answer]) => {
    const question = qIndex[questionId];
    return `
      <tr>
        <td>${escapeHtml(question?.moduleTitle || "Systeme")}</td>
        <td>${escapeHtml(question?.label || questionId)}</td>
        <td>${escapeHtml(answer)}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="response-table">
      <thead><tr><th>Module</th><th>Question</th><th>Reponse</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function recommendMeetingFormat(submission, notes) {
  if (notes.owner_meeting_format) return notes.owner_meeting_format;
  const answers = submission.answers || {};
  const lowScore = Object.entries(answers).some(([key, value]) => {
    if (key.startsWith("gwc_")) {
      return ["Non", "Partiellement"].includes(value);
    }
    if (key.startsWith("lever_")) {
      return ["Ne repond pas a mes besoins", "Partiellement"].includes(value);
    }
    return key.includes("_score") || key.includes("coach_")
      ? Number(value) > 0 && Number(value) <= 2
      : false;
  });
  return lowScore ? "Gabriel + Michael" : "Gabriel seul";
}

function collectOwnerNotes() {
  const notes = {};
  $$("[data-owner-field]").forEach((field) => {
    notes[field.dataset.ownerField] = field.value;
  });
  notes.updatedAt = new Date().toISOString();
  return notes;
}

function saveOwnerNotesLocal(submission, notes) {
  const submissionId = submission.serverSubmissionId || submission.id;
  state.ownerNotes[submission.id] = notes;
  if (submissionId && submissionId !== submission.id) {
    state.ownerNotes[submissionId] = notes;
  }
  saveLocalData();
}

function setOwnerNoteStatus(message, type = "") {
  const status = $("#ownerSyncStatus");
  if (!status) return;
  status.className = type ? `notice ${type}` : "notice";
  status.textContent = message;
}

function scheduleOwnerNotesSync(submission, notes) {
  window.clearTimeout(ownerNotesSyncTimer);
  setOwnerNoteStatus("Notes sauvegardees localement. Sync serveur en attente...", "success");
  ownerNotesSyncTimer = window.setTimeout(async () => {
    try {
      await syncOwnerNotes(submission, notes);
      setOwnerNoteStatus(state.settings.endpointUrl ? "Notes sauvegardees localement et sync Apps Script tentee." : "Notes sauvegardees localement.", "success");
    } catch (error) {
      setOwnerNoteStatus(`Notes locales sauvegardees. Sync Apps Script echouee: ${error.message}`, "error");
    }
  }, 1200);
}

function bindOwnerAutosave(submission) {
  $$("[data-owner-field]").forEach((field) => {
    field.addEventListener("input", () => {
      const notes = collectOwnerNotes();
      saveOwnerNotesLocal(submission, notes);
      scheduleOwnerNotesSync(submission, notes);
    });
    field.addEventListener("change", () => {
      const notes = collectOwnerNotes();
      saveOwnerNotesLocal(submission, notes);
      renderOwnerFilters();
      renderViewTabs();
      renderList();
      if (field.dataset.ownerField === "owner_status") {
        renderDetail();
      }
      scheduleOwnerNotesSync(submission, notes);
    });
  });
}

async function saveNotes(submission) {
  const notes = collectOwnerNotes();
  saveOwnerNotesLocal(submission, notes);

  let message = "Notes sauvegardees localement.";
  let type = "success";
  try {
    await syncOwnerNotes(submission, notes);
    if (state.settings.endpointUrl) {
      message = "Notes sauvegardees localement et envoyees a Apps Script.";
    }
  } catch (error) {
    message = `Notes locales sauvegardees. Sync Apps Script a echoue: ${error.message}`;
    type = "error";
  }

  renderDetail();
  setOwnerNoteStatus(message, type);
}

async function syncOwnerNotes(submission, notes) {
  if (!state.settings.endpointUrl) return;

  const response = await fetch(state.settings.endpointUrl, {
    method: "POST",
    mode: "no-cors",
    credentials: "include",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "save_owner_notes",
      submissionId: submission.serverSubmissionId || submission.id,
      ownerNotes: notes
    })
  });

  if (response.type === "opaque") return;

  if (!response.ok) {
    throw new Error(`Erreur endpoint (${response.status})`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "Erreur inconnue pendant la sauvegarde owners.");
  }
}

async function archiveSelectedSubmission(submission) {
  const name = submission.answers?.employee_name || "cette soumission";
  const submissionId = submission.serverSubmissionId || submission.id;
  const notes = {
    ...ownerNotesFor(submission),
    owner_status: ownerNotesFor(submission).owner_status || "archived"
  };
  if (!submissionId) return;
  if (!confirm(`Archiver ${name}? La rencontre sera retiree des actifs, mais restera consultable dans Archives / dossiers equipe.`)) return;

  markSubmissionArchived(submissionId, name, submission, notes);
  state.submissions = state.submissions.filter((item) => item.id !== submission.id && item.serverSubmissionId !== submissionId);
  delete state.ownerNotes[submission.id];
  delete state.ownerNotes[submissionId];
  state.selectedId = state.submissions[0]?.id || "";
  state.view = "archive";
  state.selectedArchiveId = submissionId;
  saveLocalData();
  renderOwnerFilters();
  renderViewTabs();
  renderList();
  renderDetail();
  setSyncStatus("Soumission archivee localement. Envoi de l'action a Apps Script...", "success");

  try {
    await syncArchiveAction(submissionId, name);
    setSyncStatus("Soumission archivee localement et action envoyee a Apps Script.", "success");
    window.setTimeout(() => {
      syncServerSubmissions({ silent: true }).catch((error) => {
        setSyncStatus(`Archive conservee localement. Resynchronisation echouee: ${error.message}`, "error");
      });
    }, 800);
  } catch (error) {
    setSyncStatus(`Archive conservee localement. Apps Script n'a pas confirme: ${error.message}`, "error");
  }
}

async function syncArchiveAction(submissionId, name) {
  if (!state.settings.endpointUrl) return;

  const response = await fetch(state.settings.endpointUrl, {
    method: "POST",
    mode: "no-cors",
    credentials: "include",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "archive_roadmap_submission",
      submissionId,
      actor: "owners_dashboard",
      reason: `Archive depuis dashboard owners: ${name}`
    })
  });

  if (response.type === "opaque") return;

  if (!response.ok) {
    throw new Error(`Erreur endpoint (${response.status})`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "Erreur inconnue pendant l'archivage.");
  }
}

function exportSelected(submission) {
  const payload = {
    submission,
    ownerNotes: ownerNotesFor(submission)
  };
  navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
  alert("JSON copie dans le presse-papiers.");
}

function meetingTextBlock(title, items) {
  const cleanItems = items.map((item) => String(item || "").trim()).filter(Boolean);
  if (!cleanItems.length) return `${title}\n- Rien a signaler pour l'instant.`;
  return `${title}\n${cleanItems.map((item) => `- ${item}`).join("\n")}`;
}

function meetingBriefText(submission, { recap = false } = {}) {
  const notes = ownerNotesFor(submission);
  const summary = buildOwnerSummary(submission);
  const prep = buildPreparationPlan(submission, summary, notes);
  const role = roleById(submission.selectedRoleId);
  const answers = submission.answers || {};
  const name = answers.employee_name || "Sans nom";
  const header = [
    `Roadmap - ${name}`,
    `${role?.label || submission.selectedRoleLabel || "Role inconnu"} - ${submission.quarter || "Sans trimestre"}`,
    `Statut owner: ${statusLabel(ownerStatusFor(submission))}`,
    `Format suggere: ${notes.owner_meeting_format || recommendMeetingFormat(submission, notes)}`
  ];
  const lowScores = summary.lowScores.map(({ question, value }) => `${question?.label || "Question"} (${value})`).slice(0, 6);
  const strengths = summary.strengths.map(({ question }) => question?.label || "Question").slice(0, 4);

  const blocks = [
    header.join("\n"),
    "",
    meetingTextBlock("Forces a souligner", strengths),
    "",
    meetingTextBlock("Points a clarifier", lowScores),
    "",
    meetingTextBlock("Questions suggerees", prep.questions),
    "",
    meetingTextBlock("Sujets owners notes", prep.ownerTopics)
  ];

  if (recap) {
    blocks.push(
      "",
      meetingTextBlock("Engagements du membre", prep.memberCommitments),
      "",
      meetingTextBlock("Engagements direction", prep.directionCommitments),
      "",
      `Note finale\n${notes.owner_followup_notes || "- A completer."}`
    );
  }

  return blocks.join("\n");
}

async function copyMeetingBrief(submission) {
  const text = meetingBriefText(submission);
  try {
    await navigator.clipboard?.writeText(text);
    setSyncStatus("Preparation de rencontre copiee dans le presse-papiers.", "success");
  } catch (error) {
    window.prompt("Copie la preparation:", text);
  }
}

async function copyMeetingRecap(submission) {
  const text = meetingBriefText(submission, { recap: true });
  try {
    await navigator.clipboard?.writeText(text);
    setSyncStatus("Recap de rencontre copie dans le presse-papiers.", "success");
  } catch (error) {
    window.prompt("Copie le recap:", text);
  }
}

async function copyResumeLink(submission) {
  const submissionId = submission.serverSubmissionId || submission.id;
  if (!submissionId) return;
  const url = new URL("./index.html", window.location.href);
  url.searchParams.set("resume", submissionId);
  try {
    await navigator.clipboard?.writeText(url.toString());
    setSyncStatus("Lien de reprise copie. Le coach pourra rouvrir le formulaire avec ses reponses deja remplies.", "success");
  } catch (error) {
    window.prompt("Copie ce lien de reprise:", url.toString());
  }
}

async function copyReminderMessage(submission) {
  const submissionId = submission.serverSubmissionId || submission.id;
  if (!submissionId) return;
  const url = new URL("./index.html", window.location.href);
  url.searchParams.set("resume", submissionId);
  const firstName = String(submission.answers?.employee_name || "").split(" ")[0] || "";
  const message = `Salut ${firstName},\n\nOn voit que ton formulaire Roadmap n'est pas complet ou qu'il reste quelques reponses a finaliser. Tu peux reprendre exactement ou tu etais avec ce lien:\n${url.toString()}\n\nQuand tu as termine, soumets la version finale et on pourra s'en servir pour preparer notre rencontre. Merci!`;
  try {
    await navigator.clipboard?.writeText(message);
    setSyncStatus("Message de relance copie dans le presse-papiers.", "success");
  } catch (error) {
    window.prompt("Copie ce message de relance:", message);
  }
}

function openImport() {
  $("#importModal").classList.add("open");
  $("#importPayload").focus();
}

function closeImport() {
  $("#importModal").classList.remove("open");
}

function openSettings() {
  $("#settingsModal").classList.add("open");
  $("#endpointInput").focus();
}

function closeSettings() {
  $("#settingsModal").classList.remove("open");
}

function importPayload() {
  try {
    const payload = JSON.parse($("#importPayload").value);
    state.submissions.unshift({
      id: crypto.randomUUID(),
      status: payload.status || "imported",
      submittedAt: payload.submittedAt || new Date().toISOString(),
      ...payload,
      source: payload.source || "imported"
    });
    saveLocalData();
    closeImport();
    renderOwnerFilters();
    renderViewTabs();
    renderList();
  } catch (error) {
    alert(`JSON invalide: ${error.message}`);
  }
}

function clearLocal() {
  if (!confirm("Supprimer les soumissions et notes actives locales de test? Les archives sont conservees.")) return;
  state.submissions = [];
  state.ownerNotes = {};
  saveLocalData();
  state.selectedId = "";
  state.selectedArchiveId = "";
  state.view = "active";
  renderOwnerFilters();
  renderViewTabs();
  renderList();
  renderDetail();
}

async function startDashboard() {
  if (dashboardStarted) {
    showOwnerApp();
    return;
  }
  dashboardStarted = true;

  try {
    showOwnerApp();
    await loadConfig();
    loadLocalData();
    $("#settingsButton").addEventListener("click", openSettings);
    $("#closeSettingsButton").addEventListener("click", closeSettings);
    $("#saveSettingsButton").addEventListener("click", saveSettings);
    $("#importButton").addEventListener("click", openImport);
    $("#closeImportButton").addEventListener("click", closeImport);
    $("#saveImportButton").addEventListener("click", importPayload);
    bindOwnerFilters();
    bindViewTabs();
    $("#syncButton").addEventListener("click", async () => {
      try {
        await syncDashboardData();
      } catch (error) {
        setSyncStatus(`Synchronisation echouee: ${error.message}`, "error");
      }
    });
    $("#clearLocalButton").addEventListener("click", clearLocal);
    renderOwnerFilters();
    renderViewTabs();
    renderList();
    try {
      await syncDashboardData({ silent: true });
    } catch (error) {
      setSyncStatus(`Lecture locale seulement. Sync serveur echouee: ${error.message}`, "error");
    }
  } catch (error) {
    $("#detailArea").innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`;
  }
}

async function init() {
  bindOwnerGate();
  if (sessionStorage.getItem(STORAGE_KEYS.ownerAccess) === "ok") {
    await startDashboard();
    return;
  }
  showOwnerGate();
}

init();
