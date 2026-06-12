const CONFIG_URL = "../data/roadmap-config.json";
const DEFAULT_ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA/exec";
const IS_LOCAL_PREVIEW = ["", "localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const STORAGE_KEYS = {
  settings: "cfsb-roadmap-settings",
  submissions: "cfsb-roadmap-submissions",
  ownerNotes: "cfsb-roadmap-owner-notes",
  ownerAccess: "cfsb-roadmap-owner-access"
};
const OWNER_PIN_HASH = "2c0e6aedc46934b8f4c0eff7cb21be678c5a35449ea3374b15f3a2f65259c3d7";

const state = {
  config: null,
  submissions: [],
  selectedId: "",
  ownerNotes: {},
  lastSyncAt: "",
  settings: {
    endpointUrl: IS_LOCAL_PREVIEW ? "" : DEFAULT_ENDPOINT_URL
  }
};
let dashboardStarted = false;

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
  $("#endpointInput").value = state.settings.endpointUrl || "";
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEYS.submissions, JSON.stringify(state.submissions));
  localStorage.setItem(STORAGE_KEYS.ownerNotes, JSON.stringify(state.ownerNotes));
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

function questionIndex() {
  const index = {};
  state.config.modules.forEach((module) => {
    const questions = module.groups?.length
      ? module.groups.flatMap((group) => group.questions || [])
      : module.questions || [];

    questions.forEach((question) => {
      index[question.id] = { ...question, moduleTitle: module.title };
    });
  });
  return index;
}

function renderList() {
  const list = $("#submissionList");
  const count = $("#submissionCount");
  count.textContent = state.submissions.length
    ? `${state.submissions.length} soumission(s).`
    : "Aucune soumission.";

  list.innerHTML = state.submissions.map((submission) => {
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

function mergeServerSubmissions(serverSubmissions = []) {
  const byId = new Map();

  state.submissions.forEach((submission) => {
    const id = submission.serverSubmissionId || submission.id;
    if (id) byId.set(id, submission);
  });

  serverSubmissions.forEach((submission) => {
    const id = submission.serverSubmissionId || submission.id;
    if (!id) return;
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

function fetchJsonp(url, timeoutMs = 15000) {
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
    script.src = `${url}${separator}action=list_roadmap_submissions&project=roadmap-trimestrielle-cfsb&limit=200&callback=${encodeURIComponent(callbackName)}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("Impossible de rejoindre Apps Script."));
    };
    document.head.appendChild(script);
  });
}

async function syncServerSubmissions({ silent = false } = {}) {
  if (!state.settings.endpointUrl) {
    setSyncStatus("Mode local: ajoute l'URL Apps Script pour synchroniser Google Sheets.");
    return;
  }

  if (!silent) setSyncStatus("Synchronisation avec Google Sheets en cours...");
  const result = await fetchJsonp(state.settings.endpointUrl);
  if (!result.ok) {
    throw new Error(result.error || "Synchronisation refusee par Apps Script.");
  }

  mergeServerSubmissions(result.submissions || []);
  state.lastSyncAt = result.syncedAt || new Date().toISOString();
  saveLocalData();
  renderList();
  renderDetail();

  const date = new Date(state.lastSyncAt).toLocaleString("fr-CA");
  setSyncStatus(`${result.count || 0} soumission(s) chargee(s) depuis Google Sheets. Derniere sync: ${date}.`, "success");
}

function renderDetail() {
  const area = $("#detailArea");
  const submission = state.submissions.find((item) => item.id === state.selectedId);
  if (!submission) {
    area.innerHTML = '<div class="notice">Selectionne une soumission a gauche.</div>';
    return;
  }

  const role = roleById(submission.selectedRoleId);
  const answers = submission.answers || {};
  const notes = state.ownerNotes[submission.id] || {};
  const aspiration = answers.coach_aspiration_select || "none";
  const pathway = state.config.pathways.find((item) => item.id === aspiration);

  area.innerHTML = `
    <section class="section">
      <div class="section-header">
        <h2>${escapeHtml(answers.employee_name || "Sans nom")}</h2>
        <p>${escapeHtml(role?.label || submission.selectedRoleLabel || "Role inconnu")} - ${escapeHtml(submission.quarter || "")}</p>
      </div>
      <div class="section-body">
        <div class="metrics">
          <div class="metric"><strong>${escapeHtml(role?.level || "")}</strong><span>Niveau / famille</span></div>
          <div class="metric"><strong>${escapeHtml(pathway?.label || "Aucune aspiration")}</strong><span>Trajectoire declaree</span></div>
          <div class="metric"><strong>${escapeHtml(recommendMeetingFormat(submission, notes))}</strong><span>Suggestion initiale</span></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h2>Notes owners</h2>
        <p>Ces notes restent dans la couche owners. Elles ne sont pas destinees a etre montrees telles quelles a l'employe.</p>
      </div>
      <div class="section-body">
        ${renderOwnerFields(notes)}
        <div class="notice" id="ownerSyncStatus">
          ${escapeHtml(state.settings.endpointUrl ? "Les notes seront sauvegardees localement et envoyees a Apps Script." : "Mode local: les notes restent dans ce navigateur.")}
        </div>
        <div class="actions">
          <button class="button secondary" id="exportButton" type="button">Exporter JSON</button>
          <button class="button warn" id="archiveButton" type="button">Archiver soumission</button>
          <button class="button" id="saveNotesButton" type="button">Sauvegarder notes</button>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h2>Reponses employe</h2>
        <p>Lecture brute, groupee par question. Le dashboard web final pourra ensuite ajouter filtres et resumes.</p>
      </div>
      <div class="section-body">
        ${renderResponsesTable(submission)}
      </div>
    </section>
  `;

  $("#saveNotesButton").addEventListener("click", () => saveNotes(submission));
  $("#exportButton").addEventListener("click", () => exportSelected(submission));
  $("#archiveButton").addEventListener("click", () => archiveSelectedSubmission(submission));
}

function renderOwnerFields(notes) {
  return state.config.ownerFields.map((field) => {
    const value = notes[field.id] || "";
    if (field.type === "single_choice") {
      return `
        <label class="field">
          <span>${escapeHtml(field.label)}</span>
          <select data-owner-field="${escapeHtml(field.id)}">
            <option value="">Choisir</option>
            ${(field.options || []).map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>
        </label>
      `;
    }
    return `
      <label class="field">
        <span>${escapeHtml(field.label)}</span>
        <textarea data-owner-field="${escapeHtml(field.id)}">${escapeHtml(value)}</textarea>
      </label>
    `;
  }).join("");
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

async function saveNotes(submission) {
  const notes = {};
  $$("[data-owner-field]").forEach((field) => {
    notes[field.dataset.ownerField] = field.value;
  });
  state.ownerNotes[submission.id] = notes;
  saveLocalData();

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
  const status = $("#ownerSyncStatus");
  if (status) {
    status.className = `notice ${type}`;
    status.textContent = message;
  }
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
  if (!confirm(`Archiver ${name}? La ligne restera dans Google Sheets, mais elle sera cachee du dashboard owners.`)) return;

  const previousSubmissions = [...state.submissions];
  const previousSelectedId = state.selectedId;
  const previousNotes = { ...state.ownerNotes };

  state.submissions = state.submissions.filter((item) => item.id !== submission.id && item.serverSubmissionId !== submissionId);
  delete state.ownerNotes[submission.id];
  delete state.ownerNotes[submissionId];
  state.selectedId = state.submissions[0]?.id || "";
  saveLocalData();
  renderList();
  renderDetail();
  setSyncStatus("Soumission archivee localement. Envoi de l'action a Apps Script...", "success");

  try {
    await syncArchiveAction(submissionId, name);
    setSyncStatus("Soumission archivee. Elle restera disponible dans Google Sheets au besoin.", "success");
    window.setTimeout(() => {
      syncServerSubmissions({ silent: true }).catch((error) => {
        setSyncStatus(`Archive sauvegardee, mais resynchronisation echouee: ${error.message}`, "error");
      });
    }, 800);
  } catch (error) {
    state.submissions = previousSubmissions;
    state.selectedId = previousSelectedId;
    state.ownerNotes = previousNotes;
    saveLocalData();
    renderList();
    renderDetail();
    setSyncStatus(`Archivage annule: ${error.message}`, "error");
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
    ownerNotes: state.ownerNotes[submission.id] || {}
  };
  navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
  alert("JSON copie dans le presse-papiers.");
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
    $("#syncButton").addEventListener("click", async () => {
      try {
        await syncServerSubmissions();
      } catch (error) {
        setSyncStatus(`Synchronisation echouee: ${error.message}`, "error");
      }
    });
    $("#clearLocalButton").addEventListener("click", clearLocal);
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
