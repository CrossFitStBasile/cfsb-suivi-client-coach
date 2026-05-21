const CONFIG_URL = "../data/roadmap-config.json";
const DEFAULT_ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA/exec";
const IS_LOCAL_PREVIEW = ["", "localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const STORAGE_KEYS = {
  settings: "cfsb-roadmap-settings",
  submissions: "cfsb-roadmap-submissions",
  ownerNotes: "cfsb-roadmap-owner-notes"
};

const state = {
  config: null,
  submissions: [],
  selectedId: "",
  ownerNotes: {},
  settings: {
    endpointUrl: IS_LOCAL_PREVIEW ? "" : DEFAULT_ENDPOINT_URL
  }
};

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

async function loadConfig() {
  const response = await fetch(CONFIG_URL);
  if (!response.ok) throw new Error("Configuration introuvable.");
  state.config = await response.json();
}

function loadLocalData() {
  const storedSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}");
  state.settings = { ...state.settings, ...storedSettings };
  if (!IS_LOCAL_PREVIEW && !state.settings.endpointUrl) {
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

function saveSettings() {
  state.settings.endpointUrl = $("#endpointInput").value.trim();
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
    module.questions.forEach((question) => {
      index[question.id] = { ...question, moduleTitle: module.title };
    });
  });
  return index;
}

function renderList() {
  const list = $("#submissionList");
  const count = $("#submissionCount");
  count.textContent = state.submissions.length
    ? `${state.submissions.length} soumission(s) locale(s).`
    : "Aucune soumission locale.";

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

async function init() {
  try {
    await loadConfig();
    loadLocalData();
    $("#settingsButton").addEventListener("click", openSettings);
    $("#closeSettingsButton").addEventListener("click", closeSettings);
    $("#saveSettingsButton").addEventListener("click", saveSettings);
    $("#importButton").addEventListener("click", openImport);
    $("#closeImportButton").addEventListener("click", closeImport);
    $("#saveImportButton").addEventListener("click", importPayload);
    $("#clearLocalButton").addEventListener("click", clearLocal);
    renderList();
  } catch (error) {
    $("#detailArea").innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`;
  }
}

init();
