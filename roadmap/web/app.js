const CONFIG_URL = "../data/roadmap-config.json";
const DEFAULT_ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA/exec";
const IS_LOCAL_PREVIEW = ["", "localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const STORAGE_KEYS = {
  settings: "cfsb-roadmap-settings",
  submissions: "cfsb-roadmap-submissions",
  draft: "cfsb-roadmap-draft"
};
const AUTOSAVE_DELAY_MS = 800;

const state = {
  config: null,
  selectedRoleId: "",
  answers: {},
  clientSubmissionId: "",
  resumeSubmissionId: "",
  autosaveTimer: null,
  isSubmitting: false,
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
  if (!IS_LOCAL_PREVIEW) {
    state.settings.endpointUrl = DEFAULT_ENDPOINT_URL;
  }
  $("#endpointInput").placeholder = DEFAULT_ENDPOINT_URL;
  $("#endpointInput").value = state.settings.endpointUrl || "";
  $("#quarterInput").value = state.settings.quarter || "2026-Q2";
}

function saveSettings() {
  state.settings.endpointUrl = IS_LOCAL_PREVIEW ? $("#endpointInput").value.trim() : DEFAULT_ENDPOINT_URL;
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
  if (state.selectedRoleId && roleId !== state.selectedRoleId && Object.keys(state.answers).length) {
    const shouldContinue = confirm("Changer de role va recommencer le brouillon actuel. Continuer?");
    if (!shouldContinue) return;
  }
  state.selectedRoleId = roleId;
  state.answers = {};
  state.clientSubmissionId = createClientSubmissionId();
  state.resumeSubmissionId = "";
  renderRoles();
  renderForm();
  $("#formDot").classList.add("done");
  localStorage.removeItem(STORAGE_KEYS.draft);
  updateDraftStatus("");
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
        ${renderModuleBody(module, role)}
      </div>
    </section>
  `;
}

function renderModuleBody(module, role) {
  if (module.groups?.length) {
    let questionNumber = 0;
    return module.groups.map((group) => {
      const questions = group.questions || [];
      const numberedCount = questions.filter(isNumberedQuestion).length;
      return `
        <details class="question-group" open>
          <summary>
            <strong>${escapeHtml(group.title)}</strong>
            ${numberedCount ? `<small class="question-count">${numberedCount} question${numberedCount > 1 ? "s" : ""}</small>` : ""}
            ${group.intro ? `<span>${escapeHtml(group.intro)}</span>` : ""}
          </summary>
          <div class="question-group-body">
            ${questions.map((question) => {
              const number = isNumberedQuestion(question) ? ++questionNumber : null;
              return renderQuestion(question, role, number);
            }).join("")}
          </div>
        </details>
      `;
    }).join("");
  }

  let questionNumber = 0;
  return (module.questions || []).map((question) => {
    const number = isNumberedQuestion(question) ? ++questionNumber : null;
    return renderQuestion(question, role, number);
  }).join("");
}

function isNumberedQuestion(question) {
  return question.type === "scale";
}

function renderQuestion(question, role, questionNumber = null) {
  if (question.type === "info") {
    return renderInfoBlock(question);
  }

  const required = question.required ? '<span class="required">*</span>' : "";
  const label = questionNumber ? `Q${questionNumber}. ${question.label}` : question.label;
  const conditional = JSON.stringify({
    showIf: question.showIf || null,
    showIfMax: question.showIfMax || null,
    showIfIn: question.showIfIn || null,
    showIfPathway: question.showIfPathway || false
  }).replaceAll('"', "&quot;");

  return `
    <div class="field" data-field-id="${escapeHtml(question.id)}" data-conditional="${conditional}">
      <label>${escapeHtml(label)} ${required}</label>
      ${renderInput(question, role)}
    </div>
  `;
}

function renderInfoBlock(question) {
  const body = Array.isArray(question.body) ? question.body : [question.body].filter(Boolean);
  const links = question.links || [];

  return `
    <div class="info-block" data-info-id="${escapeHtml(question.id)}">
      ${question.title ? `<h3>${escapeHtml(question.title)}</h3>` : ""}
      ${body.length ? `<ul>${body.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${links.length ? `
        <div class="info-links">
          ${links.map((link) => `
            <a class="button secondary" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(link.label)}
            </a>
          `).join("")}
        </div>
      ` : ""}
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

  if (question.type === "multi_choice") {
    return `
      <div class="choice-row">
        ${(question.options || []).map((option) => `
          <label class="choice-option">
            <input type="checkbox" name="${escapeHtml(question.id)}" value="${escapeHtml(option)}" data-question-id="${escapeHtml(question.id)}">
            <span>${escapeHtml(option)}</span>
          </label>
        `).join("")}
      </div>
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
  } else if (input.type === "checkbox") {
    state.answers[questionId] = $$(`input[type="checkbox"][name="${CSS.escape(input.name)}"]:checked`)
      .map((checkbox) => checkbox.value)
      .join(", ");
  } else {
    state.answers[questionId] = input.value;
  }

  if (questionId === "coach_aspiration_select") {
    renderPathwayPreview(input.value);
  }

  refreshConditionalFields();
  scheduleAutosave();
}

function createClientSubmissionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `roadmap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function updateDraftStatus(message) {
  const status = $("#draftStatus");
  if (!status) return;
  status.textContent = message || "";
}

function scheduleAutosave() {
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = window.setTimeout(() => {
    saveDraft({ silent: true });
  }, AUTOSAVE_DELAY_MS);
}

function restoreDraftIfAvailable() {
  const raw = localStorage.getItem(STORAGE_KEYS.draft);
  if (!raw) return;

  let draft;
  try {
    draft = JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEYS.draft);
    return;
  }

  if (!draft.selectedRoleId || !draft.answers) return;
  const shouldRestore = confirm("Un brouillon Roadmap existe dans ce navigateur. Veux-tu le reprendre?");
  if (!shouldRestore) return;

  state.selectedRoleId = draft.selectedRoleId;
  state.answers = { ...(draft.answers || {}) };
  state.clientSubmissionId = draft.clientSubmissionId || createClientSubmissionId();
  if (draft.quarter) state.settings.quarter = draft.quarter;
  $("#quarterInput").value = state.settings.quarter || "2026-Q2";
  renderRoles();
  renderForm();
  populateFormValues();
  refreshConditionalFields();
  $("#formDot").classList.add("done");
  showNotice("Brouillon restaure dans ce navigateur.", "success");
}

function populateFormValues() {
  $$("[data-question-id]").forEach((input) => {
    const questionId = input.dataset.questionId;
    const value = state.answers[questionId];
    if (value === undefined || value === null) return;

    if (input.type === "radio") {
      input.checked = String(input.value) === String(value);
      return;
    }

    if (input.type === "checkbox") {
      const selected = Array.isArray(value)
        ? value.map(String)
        : String(value).split(",").map((item) => item.trim());
      input.checked = selected.includes(input.value);
      return;
    }

    input.value = value;
  });
}

function fetchJsonp(url, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const callbackName = `roadmapFormCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Delai depasse pendant le chargement."));
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

async function restoreResumeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const resumeSubmissionId = params.get("resume") || params.get("resumeSubmissionId");
  if (!resumeSubmissionId) return false;
  if (!state.settings.endpointUrl) {
    showNotice("Lien de reprise detecte, mais aucun endpoint Apps Script n'est configure.", "error");
    return true;
  }

  showNotice("Chargement de tes reponses precedentes...", "");
  const result = await fetchJsonp(state.settings.endpointUrl, {
    action: "get_roadmap_submission",
    project: state.config.meta.project,
    submissionId: resumeSubmissionId
  });

  if (!result.ok || !result.submission) {
    throw new Error(result.error || "Impossible de charger cette soumission.");
  }

  const submission = result.submission;
  state.resumeSubmissionId = submission.serverSubmissionId || submission.id || resumeSubmissionId;
  state.selectedRoleId = submission.selectedRoleId || "";
  state.answers = { ...(submission.answers || {}) };
  state.clientSubmissionId = createClientSubmissionId();
  if (submission.quarter) state.settings.quarter = submission.quarter;
  $("#quarterInput").value = state.settings.quarter || "2026-Q2";

  renderRoles();
  renderForm();
  populateFormValues();
  refreshConditionalFields();
  $("#formDot").classList.add("done");
  saveDraft({ silent: true });
  showNotice("Reprise chargee. Complete les champs manquants, puis soumets la version finale.", "success");
  return true;
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

    if (conditional.showIfIn) {
      const answer = state.answers[conditional.showIfIn.questionId];
      visible = (conditional.showIfIn.values || []).includes(answer);
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
  if (!state.clientSubmissionId) state.clientSubmissionId = createClientSubmissionId();
  return {
    project: state.config.meta.project,
    clientSubmissionId: state.clientSubmissionId,
    resumeSubmissionId: state.resumeSubmissionId || "",
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
    if (input.type === "checkbox") {
      state.answers[questionId] = $$(`input[type="checkbox"][name="${CSS.escape(input.name)}"]:checked`)
        .map((checkbox) => checkbox.value)
        .join(", ");
      return;
    }
    state.answers[questionId] = input.value;
  });
}

function saveDraft(options = {}) {
  const silent = options && options.silent === true;
  if (!state.selectedRoleId) return;
  readCurrentFormValues();
  const payload = buildPayload("draft");
  localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(payload));
  updateDraftStatus(`Brouillon sauvegarde a ${new Date().toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}.`);
  if (!silent) showNotice("Brouillon sauvegarde dans ce navigateur.", "success");
}

function saveLocalSubmission(payload, id = crypto.randomUUID()) {
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.submissions) || "[]");
  const filtered = existing.filter((submission) => submission.id !== id && submission.clientSubmissionId !== payload.clientSubmissionId);
  filtered.unshift({ id, ...payload });
  localStorage.setItem(STORAGE_KEYS.submissions, JSON.stringify(filtered));
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
  if (state.isSubmitting) return;
  readCurrentFormValues();

  if (!event.target.reportValidity()) return;

  const payload = buildPayload("submitted");
  const submitButton = $("#submitButton");
  try {
    state.isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Envoi...";
    const result = await submitPayload(payload);
    if (!result.localOnly) {
      const localPayload = result.submissionId ? { ...payload, serverSubmissionId: result.submissionId } : payload;
      saveLocalSubmission(localPayload, result.submissionId || payload.clientSubmissionId);
    }
    $("#submitDot").classList.add("done");
    event.target.reset();
    state.answers = {};
    state.clientSubmissionId = createClientSubmissionId();
    state.resumeSubmissionId = "";
    localStorage.removeItem(STORAGE_KEYS.draft);
    updateDraftStatus("");
    refreshConditionalFields();
    showPayload(payload, state.settings.endpointUrl ? "Soumission envoyee et copie locale conservee." : "Soumission conservee localement pour test.");
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    state.isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "Soumettre";
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
  state.clientSubmissionId = createClientSubmissionId();
  loadSettings();
  $("#settingsButton").addEventListener("click", openSettings);
  $("#closeSettingsButton").addEventListener("click", closeSettings);
  $("#saveSettingsButton").addEventListener("click", saveSettings);
  $("#saveDraftButton").addEventListener("click", saveDraft);
  $("#roadmapForm").addEventListener("submit", handleSubmit);

  try {
    await loadConfig();
    renderRoles();
    const resumedFromLink = await restoreResumeFromUrl();
    if (!resumedFromLink) restoreDraftIfAvailable();
    window.addEventListener("beforeunload", () => {
      if (state.selectedRoleId && Object.keys(state.answers).length) saveDraft({ silent: true });
    });
  } catch (error) {
    showNotice(error.message, "error");
  }
}

init();
