const CONFIG_URL = "../data/roadmap-config.json";
const SUBMISSIONS_CACHE_URL = "../data/roadmap-submissions-cache.json";
const DEFAULT_ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA/exec";
const IS_LOCAL_PREVIEW = ["", "localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const STORAGE_KEYS = {
  settings: "cfsb-roadmap-settings",
  submissions: "cfsb-roadmap-submissions",
  ownerNotes: "cfsb-roadmap-owner-notes",
  ownerAccess: "cfsb-roadmap-owner-access",
  archivedSubmissions: "cfsb-roadmap-archived-submissions"
};
const OWNER_PIN_HASH = "2c0e6aedc46934b8f4c0eff7cb21be678c5a35449ea3374b15f3a2f65259c3d7";
const OWNER_STATUSES = [
  ["to_read", "A lire"],
  ["planned", "Rencontre planifiee"],
  ["done", "Rencontre faite"],
  ["action_required", "Action requise"],
  ["archived", "Pret a archiver"]
];

const state = {
  config: null,
  submissions: [],
  selectedId: "",
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
  $("#endpointInput").value = state.settings.endpointUrl || "";
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEYS.submissions, JSON.stringify(state.submissions));
  localStorage.setItem(STORAGE_KEYS.ownerNotes, JSON.stringify(state.ownerNotes));
  localStorage.setItem(STORAGE_KEYS.archivedSubmissions, JSON.stringify(state.archivedSubmissions));
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

function roleById(roleId) {
  return state.config.roles.find((role) => role.id === roleId);
}

function statusLabel(statusId) {
  return OWNER_STATUSES.find(([id]) => id === statusId)?.[1] || "A lire";
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

function ensureSelectedSubmissionVisible() {
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

function renderOwnerFilters() {
  const roleFilter = $("#ownerRoleFilter");
  const quarterFilter = $("#ownerQuarterFilter");
  const statusFilter = $("#ownerStatusFilter");
  if (!roleFilter || !quarterFilter || !statusFilter) return;

  const selectedRole = roleFilter.value || state.filters.role;
  const selectedQuarter = quarterFilter.value || state.filters.quarter;
  const selectedStatus = statusFilter.value || state.filters.status;
  const quarters = [...new Set(state.submissions.map((submission) => submission.quarter).filter(Boolean))].sort().reverse();

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
    renderList();
    renderDetail();
  });
  [roleFilter, quarterFilter, statusFilter].forEach((field) => {
    field.addEventListener("change", () => {
      state.filters.role = roleFilter.value;
      state.filters.quarter = quarterFilter.value;
      state.filters.status = statusFilter.value;
      renderList();
      renderDetail();
    });
  });
}

function renderList() {
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

function submissionKey(submission) {
  return submission?.serverSubmissionId || submission?.id || "";
}

function isArchivedSubmission(submissionOrId) {
  const id = typeof submissionOrId === "string" ? submissionOrId : submissionKey(submissionOrId);
  return Boolean(id && state.archivedSubmissions[id]);
}

function markSubmissionArchived(submissionId, name) {
  if (!submissionId) return;
  state.archivedSubmissions[submissionId] = {
    archivedAt: new Date().toISOString(),
    name: name || ""
  };
}

function mergeServerSubmissions(serverSubmissions = []) {
  const byId = new Map();

  state.submissions.forEach((submission) => {
    const id = submission.serverSubmissionId || submission.id;
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

function fetchJsonp(url, timeoutMs = 6000) {
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

    const separator = url.includes("?") ? "&" : "?";
    script.src = `${url}${separator}action=list_roadmap_submissions&project=roadmap-trimestrielle-cfsb&limit=200&callback=${encodeURIComponent(callbackName)}&_=${Date.now()}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("Impossible de rejoindre Apps Script."));
    };
    document.head.appendChild(script);
  });
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

async function fetchStaticSnapshot() {
  const separator = SUBMISSIONS_CACHE_URL.includes("?") ? "&" : "?";
  const response = await fetch(`${SUBMISSIONS_CACHE_URL}${separator}_=${Date.now()}`);
  if (!response.ok) throw new Error(`Snapshot GitHub introuvable (${response.status}).`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "Snapshot GitHub invalide.");
  return payload;
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
      try {
        result = await fetchStaticSnapshot();
        result.liveSyncError = `${jsonpError.message} Pont iframe aussi echoue: ${bridgeError.message}`;
      } catch (snapshotError) {
        throw new Error(`${jsonpError.message} Pont iframe aussi echoue: ${bridgeError.message} Snapshot GitHub aussi echoue: ${snapshotError.message}`);
      }
    }
  }
  if (!result.ok) {
    throw new Error(result.error || "Synchronisation refusee par Apps Script.");
  }

  mergeServerSubmissions(result.submissions || []);
  state.lastSyncAt = result.syncedAt || new Date().toISOString();
  saveLocalData();
  renderOwnerFilters();
  renderList();
  renderDetail();

  const date = new Date(state.lastSyncAt).toLocaleString("fr-CA");
  if (result.snapshot) {
    const snapshotDate = result.snapshotGeneratedAt ? new Date(result.snapshotGeneratedAt).toLocaleString("fr-CA") : date;
    setSyncStatus(`${state.submissions.length} soumission(s) visible(s) depuis le snapshot GitHub du ${snapshotDate}. Sync live bloquee dans ce navigateur.`, "success");
    return;
  }
  setSyncStatus(`${state.submissions.length} soumission(s) visible(s) depuis Google Sheets. Derniere sync: ${date}.`, "success");
}

function renderDetail() {
  const area = $("#detailArea");
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
  $("#copyResumeLinkButton").addEventListener("click", () => copyResumeLink(submission));
  $("#copyReminderButton").addEventListener("click", () => copyReminderMessage(submission));
  $("#archiveButton").addEventListener("click", () => archiveSelectedSubmission(submission));
  bindSubmissionPicker();
  bindOwnerAutosave(submission);
}

function renderOwnerFields(notes) {
  const reviewer = notes.owner_reviewer || "";
  const status = notes.owner_status || "to_read";
  const mainNote = notes.owner_followup_notes || notes.owner_priority_topics || "";
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
      <span>Note de rencontre</span>
      <textarea class="owner-main-note" data-owner-field="owner_followup_notes" placeholder="Points a discuter, decisions, engagements, prochaine action...">${escapeHtml(mainNote)}</textarea>
    </label>
  `;
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
  if (!submissionId) return;
  if (!confirm(`Archiver ${name}? La ligne restera dans Google Sheets, mais elle sera cachee du dashboard owners dans ce navigateur.`)) return;

  markSubmissionArchived(submissionId, name);
  state.submissions = state.submissions.filter((item) => item.id !== submission.id && item.serverSubmissionId !== submissionId);
  delete state.ownerNotes[submission.id];
  delete state.ownerNotes[submissionId];
  state.selectedId = state.submissions[0]?.id || "";
  saveLocalData();
  renderOwnerFilters();
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
      ...payload
    });
    saveLocalData();
    closeImport();
    renderOwnerFilters();
    renderList();
  } catch (error) {
    alert(`JSON invalide: ${error.message}`);
  }
}

function clearLocal() {
  if (!confirm("Supprimer les soumissions et notes locales de test?")) return;
  state.submissions = [];
  state.ownerNotes = {};
  saveLocalData();
  state.selectedId = "";
  renderOwnerFilters();
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
    $("#syncButton").addEventListener("click", async () => {
      try {
        await syncServerSubmissions();
      } catch (error) {
        setSyncStatus(`Synchronisation echouee: ${error.message}`, "error");
      }
    });
    $("#clearLocalButton").addEventListener("click", clearLocal);
    renderOwnerFilters();
    renderList();
    try {
      await syncServerSubmissions({ silent: true });
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
