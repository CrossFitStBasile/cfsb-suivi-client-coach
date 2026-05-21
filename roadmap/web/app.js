const CONFIG_URL = "../data/roadmap-config.json";
const DEFAULT_ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA/exec";
const IS_LOCAL_PREVIEW = ["", "localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const STORAGE_KEYS = {
  settings: "cfsb-roadmap-settings",
  submissions: "cfsb-roadmap-submissions",
  draft: "cfsb-roadmap-draft"
};

const state = {
  config: null,
  selectedRoleId: "",
  answers: {},
  settings: {
    endpointUrl: IS_LOCAL_PREVIEW ? "" : DEFAULT_ENDPOINT_URL,
    quarter: "2026-Q2"
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

function loadSettings() {
  const stored = localStorage.getItem(STORAGE_KEYS.settings);
  if (stored) {
    state.settings = { ...state.settings, ...JSON.parse(stored) };
  }
  if (!IS_LOCAL_PREVIEW && !state.settings.endpointUrl) {
    state.settings.endpointUrl = DEFAULT_ENDPOINT_URL;
  }
  $("#endpointInput").placeholder = DEFAULT_ENDPOINT_URL;
  $("#endpointInput").value = state.settings.endpointUrl || "";
  $("#quarterInput").value = state.settings.quarter || "2026-Q2";
}

function saveSettings() {
  state.settings.endpointUrl = $("#endpointInput").value.trim();
  state.settings.quarter = $("#quarterInput").value.trim() || "2026-Q2";
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  closeSettings();
}

async function loadConfig() {
  const response = await fetch(CONFIG_URL);
  if (!response.ok) {
    throw new Error(`Configuration introuvable (${response.status})`);
  }
  state.config = await response.json();
}

function roleById(roleId) {
  return state.config.roles.find((role) => role.id === roleId);
}

function moduleById(moduleId) {
  return state.config.modules.find((module) => module.id === moduleId);
}

function scaleById(scaleId) {
  return state.config.scales[scaleId];
}

function availablePathways(roleId) {
  return state.config.pathways.filter((pathway) => pathway.fromRoleIds.includes(roleId));
}

function renderRoles() {
  const roleList = $("#roleList");
  roleList.innerHTML = state.config.roles.map((role) => `
    <button class="role-button${role.id === state.selectedRoleId ? " active" : ""}" type="button" data-role-id="${escapeHtml(role.id)}">
      <strong>${escapeHtml(role.label)}</strong>
      <span>${escapeHtml(role.description)}</span>
    </button>
  `).join("");

  $$(".role-button", roleList).forEach((button) => {
    button.addEventListener("click", () => selectRole(button.dataset.roleId));
  });
}

function selectRole(roleId) {
  state.selectedRoleId = roleId;
  state.answers = {};
  renderRoles();
  renderForm();
  $("#formDot").classList.add("done");
  localStorage.removeItem(STORAGE_KEYS.draft);
}

function renderForm() {
  const role = roleById(state.selectedRoleId);
  const sections = $("#sections");
  const actions = $("#formActions");
  const notice = $("#formNotice");
  const resources = $("#roleResources");

  if (!role) {
    sections.innerHTML = "";
    resources.innerHTML = "";
    actions.hidden = true;
    notice.hidden = false;
    notice.textContent = "Choisis un role pour generer le formulaire.";
    return;
  }

  notice.hidden = false;
  notice.textContent = `Formulaire genere pour: ${role.label}.`;
  resources.innerHTML = renderRoleResources(role);
  actions.hidden = false;

  sections.innerHTML = role.moduleIds
    .map((moduleId) => moduleById(moduleId))
    .filter(Boolean)
    .map((module) => renderModule(module, role))
    .join("");

  bindFields();
  refreshConditionalFields();
}

function renderRoleResources(role) {
  const resources = role.resources || [];
  if (!resources.length) return "";

  return `
    <section class="resource-card">
      <div>
        <strong>Avant de repondre</strong>
        <span>Tu peux relire la description de ton role si tu veux te referer aux attentes officielles.</span>
      </div>
      <div class="resource-links">
        ${resources.map((resource) => `
          <a class="button secondary" href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(resource.label)}
          </a>
        `).join("")}
      </div>
    </section>
  `;
}

function renderModule(module, role) {
  return `
    <section class="section" data-module-id="${escapeHtml(module.id)}">
      <div class="section-header">
        <h2>${escapeHtml(module.title)}</h2>
        <p>${escapeHtml(module.intro || "")}</p>
      </div>
      <div class="section-body">
        ${module.questions.map((question) => renderQuestion(question, role)).join("")}
      </div>
    </section>
  `;
}

function renderQuestion(question, role) {
  const required = question.required ? '<span class="required">*</span>' : "";
  const conditional = JSON.stringify({
    showIf: question.showIf || null,
    showIfMax: question.showIfMax || null,
    showIfPathway: question.showIfPathway || false
  }).replaceAll('"', "&quot;");

  return `
    <div class="field" data-field-id="${escapeHtml(question.id)}" data-conditional="${conditional}">
      <label>${escapeHtml(question.label)} ${required}</label>
      ${renderInput(question, role)}
    </div>
  `;
}

function renderInput(question, role) {
  if (question.type === "long_text") {
    return `<textarea data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}></textarea>`;
  }

  if (question.type === "short_text" || question.type === "email") {
    const type = question.type === "email" ? "email" : "text";
    return `<input class="input" type="${type}" data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}>`;
  }

  if (question.type === "single_choice") {
    return `
      <select data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}>
        <option value="">Choisir</option>
        ${(question.options || []).map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
      </select>
    `;
  }

  if (question.type === "scale") {
    const scale = scaleById(question.scaleId);
    const values = [];
    for (let value = scale.min; value <= scale.max; value += 1) values.push(value);
    return `
      <div class="scale-row" role="radiogroup">
        ${values.map((value) => `
          <label class="scale-option${question.rubric ? " detailed" : ""}">
            <input type="radio" name="${escapeHtml(question.id)}" value="${value}" data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}>
            <span>
              <strong>${value}${scale.labels[String(value)] ? ` - ${escapeHtml(scale.labels[String(value)])}` : ""}</strong>
              ${question.rubric?.[String(value)] ? `<em>${escapeHtml(question.rubric[String(value)])}</em>` : ""}
            </span>
          </label>
        `).join("")}
      </div>
    `;
  }

  if (question.type === "pathway_choice") {
    const pathways = availablePathways(role.id);
    return `
      <div class="choice-row" role="radiogroup">
        ${pathways.map((pathway) => `
          <label class="choice-option">
            <input type="radio" name="${escapeHtml(question.id)}" value="${escapeHtml(pathway.id)}" data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}>
            <span><strong>${escapeHtml(pathway.label)}</strong><br>${escapeHtml(pathway.summary)}</span>
          </label>
        `).join("")}
      </div>
      <div id="pathwayPreview" class="pathway-card" hidden></div>
    `;
  }

  return `<input class="input" type="text" data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}>`;
}

function bindFields() {
  $$("[data-question-id]").forEach((field) => {
    field.addEventListener("input", handleFieldChange);
    field.addEventListener("change", handleFieldChange);
  });
}

function handleFieldChange(event) {
  const input = event.target;
  const questionId = input.dataset.questionId;
  if (!questionId) return;

  if (input.type === "radio") {
    if (!input.checked) return;
    state.answers[questionId] = input.value;
  } else {
    state.answers[questionId] = input.value;
  }

  if (questionId === "coach_aspiration_select") {
    renderPathwayPreview(input.value);
  }

  refreshConditionalFields();
}

function renderPathwayPreview(pathwayId) {
  const preview = $("#pathwayPreview");
  if (!preview) return;

  const pathway = state.config.pathways.find((item) => item.id === pathwayId);
  if (!pathway || pathway.id === "none") {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }

  preview.hidden = false;
  preview.innerHTML = `
    <h3>${escapeHtml(pathway.label)}</h3>
    <p>${escapeHtml(pathway.summary)}</p>
    ${(pathway.expectations || []).length ? `<ul>${pathway.expectations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
  `;
}

function refreshConditionalFields() {
  $$(".field").forEach((field) => {
    const raw = field.dataset.conditional;
    if (!raw) return;
    const conditional = JSON.parse(raw.replaceAll("&quot;", '"'));
    let visible = true;

    if (conditional.showIf) {
      const answer = state.answers[conditional.showIf.questionId];
      visible = conditional.showIf.notEquals ? answer !== conditional.showIf.notEquals : answer === conditional.showIf.equals;
    }

    if (conditional.showIfMax) {
      const answer = Number(state.answers[conditional.showIfMax.questionId]);
      visible = Number.isFinite(answer) && answer <= Number(conditional.showIfMax.max);
    }

    if (conditional.showIfPathway) {
      const answer = state.answers.coach_aspiration_select;
      visible = Boolean(answer && answer !== "none");
    }

    field.classList.toggle("hidden", !visible);
    $$("[required]", field).forEach((input) => {
      input.disabled = !visible;
    });
  });
}

function buildPayload(status = "submitted") {
  const role = roleById(state.selectedRoleId);
  return {
    project: state.config.meta.project,
    configVersion: state.config.meta.version,
    status,
    quarter: state.settings.quarter,
    submittedAt: new Date().toISOString(),
    selectedRoleId: role?.id || "",
    selectedRoleLabel: role?.label || "",
    answers: { ...state.answers }
  };
}

function readCurrentFormValues() {
  $$("[data-question-id]").forEach((input) => {
    if (input.disabled) return;
    const questionId = input.dataset.questionId;
    if (input.type === "radio") {
      if (input.checked) state.answers[questionId] = input.value;
      return;
    }
    state.answers[questionId] = input.value;
  });
}

function saveDraft() {
  readCurrentFormValues();
  const payload = buildPayload("draft");
  localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(payload));
  showNotice("Brouillon sauvegarde dans ce navigateur.", "success");
}

function saveLocalSubmission(payload, id = crypto.randomUUID()) {
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.submissions) || "[]");
  existing.unshift({ id, ...payload });
  localStorage.setItem(STORAGE_KEYS.submissions, JSON.stringify(existing));
}

async function submitPayload(payload) {
  if (!state.settings.endpointUrl) {
    saveLocalSubmission(payload);
    return { localOnly: true };
  }

  const response = await fetch(state.settings.endpointUrl, {
    method: "POST",
    mode: "no-cors",
    credentials: "include",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  if (response.type === "opaque") {
    return { ok: true, opaque: true };
  }

  if (!response.ok) {
    throw new Error(`Erreur endpoint (${response.status})`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : { ok: true };
}

async function handleSubmit(event) {
  event.preventDefault();
  readCurrentFormValues();

  if (!event.target.reportValidity()) return;

  const payload = buildPayload("submitted");
  try {
    const result = await submitPayload(payload);
    if (!result.localOnly) {
      const localPayload = result.submissionId ? { ...payload, serverSubmissionId: result.submissionId } : payload;
      saveLocalSubmission(localPayload, result.submissionId || undefined);
    }
    $("#submitDot").classList.add("done");
    event.target.reset();
    state.answers = {};
    refreshConditionalFields();
    showPayload(payload, state.settings.endpointUrl ? "Soumission envoyee et copie locale conservee." : "Soumission conservee localement pour test.");
  } catch (error) {
    showNotice(error.message, "error");
  }
}

function showNotice(message, type = "") {
  const notice = $("#formNotice");
  notice.hidden = false;
  notice.className = `notice ${type}`.trim();
  notice.textContent = message;
}

function showPayload(payload, message) {
  const notice = $("#formNotice");
  notice.hidden = false;
  notice.className = "notice success";
  notice.innerHTML = `${escapeHtml(message)}<pre class="payload-preview">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
}

function openSettings() {
  $("#settingsModal").classList.add("open");
  $("#endpointInput").focus();
}

function closeSettings() {
  $("#settingsModal").classList.remove("open");
}

async function init() {
  loadSettings();
  $("#settingsButton").addEventListener("click", openSettings);
  $("#closeSettingsButton").addEventListener("click", closeSettings);
  $("#saveSettingsButton").addEventListener("click", saveSettings);
  $("#saveDraftButton").addEventListener("click", saveDraft);
  $("#roadmapForm").addEventListener("submit", handleSubmit);

  try {
    await loadConfig();
    renderRoles();
  } catch (error) {
    showNotice(error.message, "error");
  }
}

init();
