const DEPLOYMENT_ID = "AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ";
const DEFAULT_API_URL = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;
const DEFAULT_AUTHUSER = "0";
const LOCAL_TASK_KEY = "cfsbCoachLocalHiddenTasks";
const DEMO_DATA_KEY = "cfsbCoachDemoData";
const DEMO_MODE_KEY = "cfsbCoachDemoMode";
const DEMO_COACH = "Coach Test CFSB";

const state = {
  apiUrl: normalizeApiUrl(localStorage.getItem("cfsbCoachApiUrl") || DEFAULT_API_URL),
  appPin: localStorage.getItem("cfsbCoachAppPin") || "",
  isDemo: localStorage.getItem(DEMO_MODE_KEY) === "true",
  activeView: normalizeView(localStorage.getItem("cfsbCoachView") || "mission"),
  activeMissionFilter: "all",
  activeQuestionnaireFilter: "clients",
  clientSort: localStorage.getItem("cfsbCoachClientSort") || "actions",
  activeCoach: localStorage.getItem("cfsbCoachName") || "",
  selectedClientKey: "",
  editingClientKey: "",
  showManualClientForm: false,
  data: null,
  sourceMode: "Backend prive",
  lastUndo: null,
  localHiddenTaskIds: new Set(readStoredArray(LOCAL_TASK_KEY))
};

if (state.apiUrl !== localStorage.getItem("cfsbCoachApiUrl")) {
  localStorage.setItem("cfsbCoachApiUrl", state.apiUrl);
}

const els = {
  coachSelect: document.getElementById("coachSelect"),
  sourceLine: document.getElementById("sourceLine"),
  content: document.getElementById("content"),
  toast: document.getElementById("toast"),
  settingsPanel: document.getElementById("settingsPanel"),
  manualPanel: document.getElementById("manualPanel"),
  systemPanel: document.getElementById("systemPanel")
};

document.querySelectorAll(".views button").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeView = button.dataset.view;
    localStorage.setItem("cfsbCoachView", state.activeView);
    document.querySelectorAll(".views button").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

document.addEventListener("click", (event) => {
  const questionnaireButton = event.target.closest("[data-questionnaire-filter]");
  if (questionnaireButton) {
    state.activeQuestionnaireFilter = questionnaireButton.dataset.questionnaireFilter || "all";
    render();
  }
  const questionnaireAction = event.target.closest("[data-questionnaire-action]");
  if (questionnaireAction) {
    updateQuestionnaireStatus(
      questionnaireAction.dataset.responseId || "",
      questionnaireAction.dataset.questionnaireAction || "lu"
    );
  }
  const sendQuestionnaireButton = event.target.closest("[data-send-questionnaire]");
  if (sendQuestionnaireButton) {
    sendQuestionnaire(
      sendQuestionnaireButton.dataset.clientKey || "",
      sendQuestionnaireButton.dataset.clientName || "",
      sendQuestionnaireButton.dataset.taskId || ""
    );
  }
  const sendQuestionnaireForResponse = event.target.closest("[data-send-questionnaire-client]");
  if (sendQuestionnaireForResponse) {
    sendQuestionnaire(
      sendQuestionnaireForResponse.dataset.clientKey || "",
      sendQuestionnaireForResponse.dataset.clientName || "",
      sendQuestionnaireForResponse.dataset.taskId || ""
    );
  }
  const rebookingReminderButton = event.target.closest("[data-rebooking-reminder]");
  if (rebookingReminderButton) {
    sendRebookingReminder(
      rebookingReminderButton.dataset.clientKey || "",
      rebookingReminderButton.dataset.clientName || "",
      rebookingReminderButton.dataset.taskId || ""
    );
  }
  const undoButton = event.target.closest("[data-undo-last]");
  if (undoButton) restoreLastUndo();
  const scenarioButton = event.target.closest("[data-scenario-id]");
  if (scenarioButton) {
    demoApplyScenario(scenarioButton.dataset.scenarioId || "");
  }
});

document.getElementById("refreshBtn").addEventListener("click", () => loadData(false, true));
document.getElementById("demoModeBtn").addEventListener("click", startDemoMode);
document.getElementById("resetDemoBtn").addEventListener("click", resetDemoMode);
document.getElementById("systemToggleBtn").addEventListener("click", toggleSystemPanel);
document.getElementById("closeSystemBtn").addEventListener("click", closeSystemPanel);
document.getElementById("settingsBtn").addEventListener("click", () => {
  document.getElementById("apiUrlInput").value = state.apiUrl;
  document.getElementById("appPinInput").value = state.appPin;
  els.systemPanel.classList.remove("hidden");
  els.settingsPanel.classList.toggle("hidden");
});
document.getElementById("closeSettingsBtn").addEventListener("click", () => els.settingsPanel.classList.add("hidden"));
document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
document.getElementById("addTaskBtn").addEventListener("click", () => {
  els.systemPanel.classList.remove("hidden");
  els.manualPanel.classList.remove("hidden");
});
document.getElementById("cancelManualBtn").addEventListener("click", () => els.manualPanel.classList.add("hidden"));
document.getElementById("closeManualPanelBtn").addEventListener("click", () => els.manualPanel.classList.add("hidden"));
document.getElementById("saveManualBtn").addEventListener("click", saveManualTask);
els.coachSelect.addEventListener("change", () => {
  state.activeCoach = els.coachSelect.value;
  localStorage.setItem("cfsbCoachName", state.activeCoach);
  if (state.activeCoach === DEMO_COACH) {
    startDemoMode();
    return;
  }
  state.isDemo = false;
  localStorage.removeItem(DEMO_MODE_KEY);
  loadData(false, true);
});

loadData(false);

function toggleSystemPanel() {
  if (els.systemPanel.classList.contains("hidden")) {
    els.systemPanel.classList.remove("hidden");
    return;
  }
  closeSystemPanel();
}

function closeSystemPanel() {
  els.systemPanel.classList.add("hidden");
  els.settingsPanel.classList.add("hidden");
  els.manualPanel.classList.add("hidden");
}

function startDemoMode() {
  state.isDemo = true;
  state.activeCoach = DEMO_COACH;
  state.selectedClientKey = "";
  state.sourceMode = "Sandbox local";
  localStorage.setItem(DEMO_MODE_KEY, "true");
  localStorage.setItem("cfsbCoachName", DEMO_COACH);
  state.data = loadDemoData();
  closeSystemPanel();
  showToast("Mode demo ouvert. Aucune action reelle ne sera envoyee.");
  render();
}

function resetDemoMode() {
  localStorage.removeItem(DEMO_DATA_KEY);
  state.isDemo = true;
  state.activeCoach = DEMO_COACH;
  state.selectedClientKey = "";
  localStorage.setItem(DEMO_MODE_KEY, "true");
  localStorage.setItem("cfsbCoachName", DEMO_COACH);
  state.data = loadDemoData();
  showToast("Demo remise a zero.");
  render();
}

function saveSettings() {
  state.apiUrl = normalizeApiUrl(document.getElementById("apiUrlInput").value.trim() || DEFAULT_API_URL);
  state.appPin = document.getElementById("appPinInput").value.trim();
  localStorage.setItem("cfsbCoachApiUrl", state.apiUrl);
  localStorage.setItem("cfsbCoachAppPin", state.appPin);
  els.settingsPanel.classList.add("hidden");
  showToast("Configuration enregistree.");
  loadData(false);
}

async function loadData(rebuild, notify) {
  els.content.innerHTML = '<div class="empty">Chargement du dashboard...</div>';
  if (state.isDemo) {
    state.data = loadDemoData();
    state.activeCoach = DEMO_COACH;
    state.sourceMode = "Sandbox local";
    localStorage.setItem("cfsbCoachName", DEMO_COACH);
    render();
    if (notify) showToast("Mode demo recharge.");
    return;
  }
  if (!state.appPin) {
    state.data = null;
    renderPrivateGate();
    return;
  }
  try {
    const response = await callApi(rebuild ? "rebuild" : "getData", {});
    state.data = response.result;
    state.sourceMode = "Backend prive";
    if (!state.activeCoach) {
      state.activeCoach = state.data.activeCoach || "";
      localStorage.setItem("cfsbCoachName", state.activeCoach);
    }
    render();
  } catch (error) {
    renderError(error);
  }
}

function callApi(action, payload) {
  return callApiWithUrl(state.apiUrl, action, payload).catch((error) => {
    const official = normalizeApiUrl(DEFAULT_API_URL);
    if (state.apiUrl !== official) {
      state.apiUrl = official;
      localStorage.setItem("cfsbCoachApiUrl", official);
      showToast("Endpoint backend reinitialise.");
      return callApiWithUrl(official, action, payload);
    }
    throw error;
  });
}

function callApiWithUrl(apiUrl, action, payload) {
  const params = buildApiParams(action, payload);
  return fetch(apiUrl + "?" + params.toString(), {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    redirect: "follow"
  })
    .then((response) => response.text())
    .then((text) => {
      let data;
      try {
        data = JSON.parse(text);
      } catch (_error) {
        throw new Error("Reponse backend illisible. Debut recu: " + text.slice(0, 120));
      }
      if (!data || data.ok === false) throw new Error((data && data.error) || "Erreur inconnue");
      return data;
    })
    .catch((error) => callApiJsonpWithUrl(apiUrl, action, payload)
      .catch(() => {
        throw error;
      }));
}

function buildApiParams(action, payload, callback) {
  const params = new URLSearchParams({
    api: "coach-app",
    action,
    coach: state.activeCoach || "",
    appPin: state.appPin || "",
    v: Date.now().toString()
  });
  if (callback) params.set("callback", callback);
  if (payload && Object.keys(payload).length) params.set("payload", JSON.stringify(payload));
  return params;
}

function callApiJsonpWithUrl(apiUrl, action, payload) {
  return new Promise((resolve, reject) => {
    const callback = "__cfsbCoachCb" + Date.now() + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const params = buildApiParams(action, payload, callback);
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Delai depasse. Verifie le endpoint Apps Script."));
    }, 25000);
    window[callback] = (data) => {
      cleanup();
      if (!data || data.ok === false) reject(new Error((data && data.error) || "Erreur inconnue"));
      else resolve(data);
    };
    function cleanup() {
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
    }
    script.onerror = () => {
      cleanup();
      reject(new Error("Le navigateur a bloque ou n'a pas charge le backend Apps Script. Endpoint tente: " + apiUrl));
    };
    script.referrerPolicy = "no-referrer";
    script.src = apiUrl + "?" + params.toString();
    document.body.appendChild(script);
  });
}

function normalizeApiUrl(url) {
  const value = String(url || "").trim();
  if (!value) return DEFAULT_API_URL;
  const noAccountScopedPath = value.replace(/\/macros\/u\/\d+\/s\//, "/macros/s/");
  if (noAccountScopedPath.indexOf("script.google.com/macros/s/") === -1) return DEFAULT_API_URL;
  if (noAccountScopedPath.indexOf(DEPLOYMENT_ID) === -1) return DEFAULT_API_URL;
  return noAccountScopedPath.split("?")[0];
}

function render() {
  const data = state.data;
  if (!data) return;
  renderCoachSelect(data);
  const kpis = (data.v3 && data.v3.kpis) || {};
  document.getElementById("metricTasks").textContent = data.counts.total || 0;
  document.getElementById("metricUrgent").textContent = data.counts.p1 || 0;
  document.getElementById("metricRisk").textContent = kpis.atRisk || 0;
  document.getElementById("metricImpacts").textContent = kpis.impactsWeek || 0;
  const sourceSuffix = state.isDemo ? " | Source: demo locale, aucune donnee reelle" : " | Source: backend prive";
  els.sourceLine.textContent = `${data.activeCoach || "Coach"} | Dashboard: ${data.dashboardUpdatedAt || "-"} | App: ${data.generatedAt || "-"}${sourceSuffix}`;

  if (state.activeView === "clients") return renderClients(data.clients || []);
  if (state.activeView === "questionnaires") return renderQuestionnaireInbox(data);
  if (state.activeView === "performance") return renderPerformance(data);
  if (state.activeView === "alumni") return renderAlumni((data && data.v3) || {});
  if (state.activeView === "scenarios") return renderScenarios(data);
  if (state.activeView === "admin") return renderAdmin(data);

  const tasks = filterTasks(data.tasks || []).filter((task) => !state.localHiddenTaskIds.has(task.taskId));
  if (state.activeView === "mission") return renderMission(tasks, data.clients || []);
  renderTaskBoard(tasks, data.clients || []);
}

function renderCoachSelect(data) {
  const coaches = [{ coach: DEMO_COACH }].concat((data.coaches || []).filter((coach) => coach.coach !== DEMO_COACH));
  els.coachSelect.innerHTML = coaches.map((coach) => `<option value="${escapeAttr(coach.coach)}">${escapeHtml(coach.coach)}</option>`).join("");
  els.coachSelect.value = state.activeCoach || data.activeCoach || "";
  document.querySelectorAll(".views button").forEach((item) => item.classList.toggle("active", item.dataset.view === state.activeView));
}

function renderPrivateGate() {
  document.getElementById("metricTasks").textContent = "-";
  document.getElementById("metricUrgent").textContent = "-";
  document.getElementById("metricRisk").textContent = "-";
  document.getElementById("metricImpacts").textContent = "-";
  els.coachSelect.innerHTML = '<option>Connexion requise</option>';
  els.sourceLine.textContent = "Mode prive requis. Aucun snapshot client n'est charge depuis GitHub Pages.";
  els.content.className = "content";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero security-panel">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Acces prive</p>
          <h2>Dashboard verrouille</h2>
          <p>Les donnees client ne sont plus chargees depuis GitHub Pages. Entre le PIN configure dans Apps Script pour ouvrir le dashboard.</p>
        </div>
      </div>
      <div class="focus-note"><strong>Connexion</strong><p>Utilise la valeur de la propriete Apps Script <code>COACH_APP_PIN</code>. Le coach pourra etre choisi apres la connexion.</p></div>
      <div class="form-grid compact-form">
        <label>PIN dashboard
          <input id="privatePinInput" type="password" autocomplete="off" placeholder="PIN prive">
        </label>
      </div>
      <div class="actions-row">
        <button class="primary" id="privateLoginBtn">Connexion</button>
        <button id="openDemoModeBtn">Ouvrir demo sandbox</button>
        <button id="openPrivateSettings">Configuration avancee</button>
      </div>
    </section>
  `;
  const pinInput = document.getElementById("privatePinInput");
  const loginButton = document.getElementById("privateLoginBtn");
  if (pinInput) {
    pinInput.value = state.appPin || "";
    pinInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && loginButton) loginButton.click();
    });
  }
  if (loginButton) loginButton.addEventListener("click", () => {
    state.appPin = (pinInput && pinInput.value ? pinInput.value : "").trim();
    localStorage.setItem("cfsbCoachAppPin", state.appPin);
    loadData(false, true);
  });
  const openDemo = document.getElementById("openDemoModeBtn");
  if (openDemo) openDemo.addEventListener("click", startDemoMode);
  const openSettings = document.getElementById("openPrivateSettings");
  if (openSettings) openSettings.addEventListener("click", () => {
    document.getElementById("apiUrlInput").value = state.apiUrl;
    document.getElementById("appPinInput").value = state.appPin;
    els.systemPanel.classList.remove("hidden");
    els.settingsPanel.classList.remove("hidden");
  });
}

function filterTasks(tasks) {
  if (state.activeView === "mission") return tasks.filter((task) => task.priority === "P1" || ["Programme", "Rebooking", "Formulaire", "Validation", "Retention", "Impact", "Suivi client"].includes(task.type));
  const map = { programs: "Programme", rebookings: "Rebooking", forms: "Formulaire", validations: "Validation" };
  return map[state.activeView] ? tasks.filter((task) => task.type === map[state.activeView]) : tasks;
}

function renderMission(tasks, clients) {
  els.content.className = "content mission-layout";
  const urgentTasks = tasks.filter((task) => task.priority === "P1");
  const programTasks = tasks.filter((task) => task.type === "Programme");
  const rebookingTasks = tasks.filter((task) => task.type === "Rebooking");
  const formTasks = tasks.filter((task) => task.type === "Formulaire");
  const visibleTasks = filterMissionTasks(tasks);
  const firstTask = tasks[0];
  if (!state.selectedClientKey && firstTask) state.selectedClientKey = firstTask.clientKey || "";
  const selectedClient = getSelectedClient(clients, visibleTasks.length ? visibleTasks : tasks);

  els.content.innerHTML = `
    <section class="mission-panel">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Mission du jour</p>
          <h2>${tasks.length ? `${tasks.length} action${tasks.length > 1 ? "s" : ""} a traiter` : "Tout est clair"}</h2>
          <p>Priorise les clients qui demandent une action concrete aujourd'hui. Clique un nom pour voir le contexte avant d'agir.</p>
        </div>
        <span class="freshness">${escapeHtml(state.sourceMode)}</span>
      </div>
      ${state.isDemo ? demoBanner() : ""}
      ${quickCapturePanel()}
      <div class="priority-strip">
        ${priorityTile("Urgent", urgentTasks.length, "p1")}
        ${priorityTile("Programmes", programTasks.length, "p2")}
        ${priorityTile("Rebookings", rebookingTasks.length, "p3")}
        ${priorityTile("Questionnaires", formTasks.length, "p4")}
      </div>
      ${missionFilters(tasks)}
      ${visibleTasks.length ? `<div class="action-list">${visibleTasks.slice(0, 18).map(taskRow).join("")}</div>` : '<div class="empty">Aucune action ici.</div>'}
    </section>
    ${clientFocusPanel(selectedClient, tasks)}
  `;
  attachTaskControls();
  attachClientSelectors();
  attachMissionFilters();
  attachQuickCapture();
  attachClientRiskControl();
  attachClientManagementControls();
}

function quickCapturePanel() {
  return `
    <div class="quick-capture">
      <div>
        <p class="eyebrow">Capture rapide</p>
        <strong>Note coach en fin de journee</strong>
        <p>Colle une transcription vocale ou ecris plusieurs suivis. Une ligne = une mission.</p>
      </div>
      <textarea id="quickCaptureText" placeholder="Ex.: Contacter Alex Turcotte pour ses douleurs au dos&#10;Relancer Julie pour son objectif du prochain cycle"></textarea>
      <div class="quick-capture-controls">
        <select id="quickCapturePriority">
          <option value="P2">Priorite normale</option>
          <option value="P1">Urgent</option>
          <option value="P3">Bas</option>
        </select>
        <input id="quickCaptureDue" type="date" value="${escapeAttr(demoDate(0))}">
        <button id="quickCaptureBtn" class="primary" type="button">Creer missions</button>
      </div>
    </div>`;
}

function renderTaskBoard(tasks, clients) {
  if (!state.selectedClientKey && tasks[0]) state.selectedClientKey = tasks[0].clientKey || "";
  const selectedClient = getSelectedClient(clients, tasks);
  els.content.className = "content mission-layout";
  els.content.innerHTML = `
    <section class="mission-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">${escapeHtml(viewLabel(state.activeView))}</p>
          <h2>${tasks.length ? `${tasks.length} action${tasks.length > 1 ? "s" : ""}` : "Rien a traiter"}</h2>
        </div>
      </div>
      ${state.isDemo ? demoBanner() : ""}
      ${tasks.length ? `<div class="action-list">${tasks.map(taskRow).join("")}</div>` : '<div class="empty">Aucune action ici.</div>'}
    </section>
    ${clientFocusPanel(selectedClient, tasks)}
  `;
  attachTaskControls();
  attachClientSelectors();
  attachClientRiskControl();
  attachClientManagementControls();
}

function demoBanner() {
  return `
    <div class="demo-banner">
      <strong>Mode demo sandbox</strong>
      <span>Actions locales instantanees. Aucun SMS, aucun GHL, aucune vraie donnee client.</span>
      <button id="inlineResetDemoBtn" type="button">Reset demo</button>
    </div>
    ${demoActionJournal()}`;
}

function demoActionJournal() {
  if (!state.isDemo || !state.data) return "";
  const rows = (state.data.actionLog || []).slice(0, 3);
  if (!rows.length) return "";
  return `
    <div class="demo-journal">
      <div class="mini-head"><p class="eyebrow">Journal demo</p><strong>Dernieres actions</strong></div>
      ${rows.map((row) => `<p><span>${escapeHtml(row.at || "")}</span>${escapeHtml(row.message || "")}</p>`).join("")}
    </div>`;
}

function priorityTile(label, value, tone) {
  return `<div class="priority-tile ${tone}"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
}

function missionFilters(tasks) {
  const filters = [
    ["all", "Tout", tasks.length],
    ["urgent", "Urgent", tasks.filter((task) => task.priority === "P1").length],
    ["programs", "Programmes", tasks.filter((task) => task.type === "Programme").length],
    ["rebookings", "Rebookings", tasks.filter((task) => task.type === "Rebooking").length],
    ["forms", "Questionnaires", tasks.filter((task) => task.type === "Formulaire").length],
    ["validations", "A valider", tasks.filter((task) => task.type === "Validation").length]
  ];
  return `<div class="mission-filters">${filters.map(([id, label, count]) => `<button class="${state.activeMissionFilter === id ? "active" : ""}" data-mission-filter="${id}">${escapeHtml(label)} <span>${count}</span></button>`).join("")}</div>`;
}

function filterMissionTasks(tasks) {
  const filter = state.activeMissionFilter;
  if (filter === "urgent") return tasks.filter((task) => task.priority === "P1");
  if (filter === "programs") return tasks.filter((task) => task.type === "Programme");
  if (filter === "rebookings") return tasks.filter((task) => task.type === "Rebooking");
  if (filter === "forms") return tasks.filter((task) => task.type === "Formulaire");
  if (filter === "validations") return tasks.filter((task) => task.type === "Validation");
  return tasks;
}

function taskRow(task) {
  const info = task.clientInfo || {};
  const facts = [
    info.activePackage && `Membership: ${info.activePackage}`,
    info.program && `Programme: ${info.program}`,
    info.comp30 && `Compliance: ${info.comp30}`,
    info.rebookingTotal && `Rebooking: ${info.rebookingTotal}`,
    isCoachRisk(info.riskLevel) && `Risque coach: ${info.riskLevel}`
  ].filter(Boolean);
  return `
    <article class="task-row ${String(task.priority || "").toLowerCase()} ${state.selectedClientKey === task.clientKey ? "selected" : ""}" data-client-key="${escapeAttr(task.clientKey || "")}">
      <button class="client-trigger" data-client-key="${escapeAttr(task.clientKey || "")}">
        <span class="priority-dot"></span>
        <span>
          <strong>${escapeHtml(task.client || "Client inconnu")}</strong>
          <small>${escapeHtml(task.action || "")}</small>
        </span>
      </button>
      <div class="task-context">
        <span class="tag">${escapeHtml(task.priority || "")}</span>
        ${task.type ? `<span class="tag">${escapeHtml(task.type)}</span>` : ""}
        ${task.due ? `<span class="tag warn">${escapeHtml(task.due)}</span>` : ""}
        ${facts.slice(0, 2).map((fact) => `<span class="fact">${escapeHtml(fact)}</span>`).join("")}
      </div>
      <p>${escapeHtml(task.why || "")}</p>
      ${taskActionButtons(task)}
    </article>`;
}

function taskActionButtons(task) {
  const baseAttrs = `data-task-id="${escapeAttr(task.taskId || "")}" data-row="${escapeAttr(task.rowNumber || "")}"`;
  const clientAttrs = `data-client-key="${escapeAttr(task.clientKey || "")}" data-client-name="${escapeAttr(task.client || "")}" data-task-id="${escapeAttr(task.taskId || "")}"`;
  const type = normalizeLower(task.type);
  if (type === "rebooking") {
    return `<div class="row-actions">
      <button class="done" data-rebooking-reminder="true" ${clientAttrs}>Envoyer rappel</button>
      <button ${baseAttrs} data-status="Ignore">Masquer</button>
    </div>`;
  }
  if (type === "formulaire") {
    return `<div class="row-actions">
      <button class="done" data-send-questionnaire="true" ${clientAttrs}>Envoyer questionnaire</button>
      <button ${baseAttrs} data-status="Ignore">Masquer</button>
    </div>`;
  }
  if (type === "validation") {
    return `<div class="row-actions">
      <button class="done" ${baseAttrs} data-status="Fait">Valider</button>
      <button ${baseAttrs} data-status="Ignore">Masquer</button>
    </div>`;
  }
  return `<div class="row-actions">
    <button class="done" ${baseAttrs} data-status="Fait">Fait</button>
    <button ${baseAttrs} data-status="Ignore">Masquer</button>
  </div>`;
}

function clientFocusPanel(client, tasks) {
  if (!client) {
    return '<aside class="client-focus"><div class="empty">Selectionne un client.</div></aside>';
  }
  const clientTasks = tasks.filter((task) => task.clientKey === client.clientKey);
  const context = client.context || {};
  const questionnaire = client.latestQuestionnaireResponse || {};
  const questionnaireDate = lastQuestionnaireDate(client, questionnaire);
  const questionnaireAge = questionnaireAgeLabel(client);
  const questionnaireSignal = questionnaireRiskSignal(questionnaire);
  const activeHold = getClientHold(client);
  return `
    <aside class="client-focus">
      <div class="section-head">
        <div>
          <p class="eyebrow">Client en focus</p>
          <h2>${escapeHtml(client.client || "Client")}</h2>
        </div>
        <span class="tag">${client.openTasks || clientTasks.length || 0} action(s)</span>
      </div>
      <div class="focus-facts">
        ${client.activePackage ? focusFact("Membership", client.activePackage) : ""}
        ${focusFact("Fin membership", client.membershipEnd || "Non trouvee")}
        ${client.program ? focusFact("Programme", client.program) : ""}
        ${client.comp30 ? focusFact("Compliance", client.comp30) : ""}
        ${focusFact("Dernieres seances Kilo", client.serviceEnd || "A entrer")}
        ${client.rebookingTotal ? focusFact("Rebooking", client.rebookingTotal) : ""}
        ${focusFact("Risque coach", isCoachRisk(client.riskLevel) ? client.riskLevel : "Aucun")}
        ${questionnaireSignal ? focusFact("Signal questionnaire", questionnaireSignal) : ""}
        ${client.systemSignal ? focusFact("Signal systeme", client.systemSignal) : ""}
        ${focusFact("Dernier questionnaire", questionnaireDate ? `${questionnaireDate}${questionnaireAge ? " | " + questionnaireAge : ""}` : "Jamais trouve")}
        ${client.plannedExitDate ? focusFact("Fin prevue coach", client.plannedExitDate) : ""}
      </div>
      <div class="focus-note service-end-editor" data-client-key="${escapeAttr(client.clientKey || "")}" data-client-name="${escapeAttr(client.client || "")}">
        <strong>Dernieres seances planifiees dans Kilo</strong>
        <p>Entre la derniere date deja mise a l'horaire. Une tache de rebooking apparaitra 30 jours avant.</p>
        <div class="form-grid compact-form">
          <input id="clientServiceEndDate" type="date" value="${escapeAttr(toDateInputValue(client.serviceEnd || ""))}">
          <input id="clientServiceEndNote" class="wide" placeholder="Notes optionnelles">
        </div>
        <div class="actions-row"><button class="primary" id="saveClientServiceEndBtn">Enregistrer date Kilo</button></div>
      </div>
      <div class="focus-note risk-editor" data-client-key="${escapeAttr(client.clientKey || "")}" data-client-name="${escapeAttr(client.client || "")}">
        <strong>Marquer le risque client</strong>
        <p>Cette valeur est une decision coach, pas une deduction automatique du systeme.</p>
        <div class="form-grid compact-form">
          <select id="clientRiskLevel">
            ${["Aucun", "Faible", "Moyen", "Eleve"].map((level) => `<option value="${level}" ${normalizeLower(client.riskLevel) === normalizeLower(level) ? "selected" : ""}>${level}</option>`).join("")}
          </select>
          <input id="clientRiskNote" class="wide" placeholder="Pourquoi ce client est a surveiller?" value="${escapeAttr(client.riskReasons || "")}">
        </div>
        <div class="actions-row"><button class="primary" id="saveClientRiskBtn">Enregistrer risque</button></div>
      </div>
      <div class="focus-note hold-editor" data-client-key="${escapeAttr(client.clientKey || "")}" data-client-name="${escapeAttr(client.client || "")}">
        <strong>Hold client</strong>
        <p>Utilise ceci quand le client reste membre, mais doit etre mis de cote temporairement.</p>
        ${activeHold ? `<p><span class="tag warn">Hold actif</span> Retour: ${escapeHtml(activeHold.expectedReturn || "A confirmer")} | ${escapeHtml(activeHold.reason || "")}</p>` : ""}
        <div class="form-grid compact-form">
          <input id="clientHoldReturn" type="date" value="${escapeAttr(toDateInputValue((activeHold && activeHold.expectedReturn) || ""))}">
          <input id="clientHoldReason" class="wide" placeholder="Raison du hold" value="${escapeAttr((activeHold && activeHold.reason) || "")}">
        </div>
        <div class="actions-row">
          <button class="primary" id="saveClientHoldBtn">Enregistrer hold</button>
          ${activeHold ? `<button id="clearClientHoldBtn">Retirer hold</button>` : ""}
        </div>
      </div>
      ${client.signal ? `<div class="focus-note"><strong>Signal</strong><p>${escapeHtml(client.signal)}</p></div>` : ""}
      ${questionnaire.response_id ? `<div class="focus-note"><strong>Resume questionnaire</strong><p>${escapeHtml(questionnaireDate || "")} | ${escapeHtml(questionnaire.triage_status || "vert")} | ${escapeHtml(questionnaire.coach_action_type || "lire le suivi")}</p><p>${escapeHtml(questionnaire.open_note || questionnaire.program_fit || questionnaire.general_state || "")}</p></div>` : ""}
      ${context.longTermSummary ? `<div class="focus-note"><strong>Plan CoachRx</strong><p>${escapeHtml(context.longTermSummary).slice(0, 520)}${context.longTermSummary.length > 520 ? "..." : ""}</p></div>` : ""}
      ${context.objectives ? `<div class="focus-note"><strong>Objectifs</strong><p>${escapeHtml(context.objectives)}</p></div>` : ""}
      ${clientTasks.length ? `<div class="focus-note"><strong>Actions liees</strong>${clientTasks.slice(0, 4).map((task) => `<p>${escapeHtml(task.action || "")}</p>`).join("")}</div>` : ""}
      <div class="focus-note client-management" data-client-key="${escapeAttr(client.clientKey || "")}" data-client-name="${escapeAttr(client.client || "")}">
        <strong>Gestion client</strong>
        <p>Modifier les infos de test ou classer le client sans le perdre.</p>
        <div class="form-grid compact-form">
          <select id="clientRemoveDestination">
            <option value="alumni">Alumni a reactiver</option>
            <option value="removed">Retire definitivement</option>
            <option value="hold">Sur hold</option>
            <option value="error">Erreur / ne devrait pas etre ici</option>
          </select>
          <input id="clientRemoveNote" class="wide" placeholder="Note de classement optionnelle">
        </div>
        <div class="actions-row">
          <button id="editClientBtn">Modifier</button>
          <button id="removeClientBtn">Classer / retirer</button>
        </div>
      </div>
      ${state.editingClientKey === client.clientKey ? editClientForm(client) : ""}
    </aside>
  `;
}

function getClientHold(client) {
  const holds = (state.data && state.data.v3 && state.data.v3.holds) || [];
  const key = client && client.clientKey;
  const name = normalizeLower(client && client.client);
  return holds.find((row) => (row.clientKey && row.clientKey === key) || normalizeLower(row.client) === name) || null;
}

function questionnaireRiskSignal(questionnaire) {
  if (!questionnaire || !questionnaire.response_id) return "";
  const triage = normalizeLower(questionnaire.triage_status || "");
  if (triage === "rouge") return "Eleve";
  if (triage === "orange") return "Moyen";
  if (triage === "jaune") return "Faible";
  return "";
}

function focusFact(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function isCoachRisk(level) {
  return ["faible", "moyen", "eleve"].includes(normalizeLower(level));
}

function lastQuestionnaireDate(client, questionnaire) {
  return cleanValue(
    (questionnaire && (questionnaire.submitted_at || questionnaire.submittedAt || questionnaire.received_at || questionnaire.receivedAt))
    || (client && client.lastQuestionnaire)
  );
}

function questionnaireAgeLabel(client) {
  const days = Number(client && client.daysSinceQuestionnaire);
  if (!Number.isFinite(days)) return "";
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "1 jour";
  return `${days} jours`;
}

function questionnaireIsStale(client) {
  const days = Number(client && client.daysSinceQuestionnaire);
  return !client.lastQuestionnaire || (Number.isFinite(days) && days > 90);
}

function toDateInputValue(value) {
  const text = cleanValue(value);
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const slash = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  return "";
}

function getSelectedClient(clients, tasks) {
  const fallbackKey = state.selectedClientKey || (tasks[0] && tasks[0].clientKey) || (clients[0] && clients[0].clientKey) || "";
  state.selectedClientKey = fallbackKey;
  return clients.find((client) => client.clientKey === fallbackKey)
    || clientFromTask(tasks.find((task) => task.clientKey === fallbackKey))
    || clients[0]
    || null;
}

function clientFromTask(task) {
  if (!task) return null;
  return {
    clientKey: task.clientKey,
    client: task.client,
    openTasks: 1,
    ...(task.clientInfo || {})
  };
}

function attachTaskControls() {
  const resetButton = document.getElementById("inlineResetDemoBtn");
  if (resetButton) resetButton.addEventListener("click", resetDemoMode);
  els.content.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      updateTask(button.dataset.taskId, button.dataset.row, button.dataset.status);
    });
  });
}

function attachClientSelectors() {
  els.content.querySelectorAll(".client-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedClientKey = button.dataset.clientKey;
      render();
    });
  });
}

function attachClientRiskControl() {
  const button = document.getElementById("saveClientRiskBtn");
  if (button) {
    const editor = els.content.querySelector(".risk-editor");
    button.addEventListener("click", () => {
      saveClientRisk(editor && editor.dataset.clientKey, editor && editor.dataset.clientName);
    });
  }
  const serviceButton = document.getElementById("saveClientServiceEndBtn");
  if (serviceButton) {
    const editor = els.content.querySelector(".service-end-editor");
    serviceButton.addEventListener("click", () => {
      saveClientServiceEnd(editor && editor.dataset.clientKey, editor && editor.dataset.clientName);
    });
  }
  const holdButton = document.getElementById("saveClientHoldBtn");
  if (holdButton) {
    const editor = els.content.querySelector(".hold-editor");
    holdButton.addEventListener("click", () => {
      saveClientHold(editor && editor.dataset.clientKey, editor && editor.dataset.clientName);
    });
  }
  const clearHoldButton = document.getElementById("clearClientHoldBtn");
  if (clearHoldButton) {
    const editor = els.content.querySelector(".hold-editor");
    clearHoldButton.addEventListener("click", () => {
      clearClientHold(editor && editor.dataset.clientKey, editor && editor.dataset.clientName);
    });
  }
  els.content.querySelectorAll("[data-clear-client-hold]").forEach((button) => {
    button.addEventListener("click", () => {
      clearClientHold(button.dataset.clientKey || "", button.dataset.clientName || "");
    });
  });
}

function attachMissionFilters() {
  const resetButton = document.getElementById("inlineResetDemoBtn");
  if (resetButton) resetButton.addEventListener("click", resetDemoMode);
  els.content.querySelectorAll("[data-mission-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeMissionFilter = button.dataset.missionFilter;
      render();
    });
  });
}

function attachQuickCapture() {
  const button = document.getElementById("quickCaptureBtn");
  if (!button) return;
  button.addEventListener("click", saveQuickCapture);
}

function viewLabel(view) {
  const labels = {
    programs: "Programmes",
    rebookings: "Rebookings",
    forms: "Questionnaires",
    validations: "A valider",
    scenarios: "Scenarios"
  };
  return labels[view] || "Actions";
}

function normalizeView(view) {
  const map = {
    today: "mission",
    programs: "mission",
    rebookings: "mission",
    forms: "mission",
    validations: "mission",
    retention: "performance",
    impacts: "performance",
    admin: "mission"
  };
  return map[view] || (["mission", "clients", "questionnaires", "performance", "alumni", "scenarios"].includes(view) ? view : "mission");
}

function renderClients(clients) {
  const sortedClients = sortClients(clients);
  const holds = ((state.data && state.data.v3 && state.data.v3.holds) || []);
  if (!state.selectedClientKey && sortedClients[0]) state.selectedClientKey = sortedClients[0].clientKey;
  els.content.className = "content mission-layout";
  els.content.innerHTML = `
    <section class="mission-panel">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Portefeuille client</p>
          <h2>${clients.length} client${clients.length > 1 ? "s" : ""} supervises</h2>
          <p>Trie les clients selon ce que tu veux traiter: actions, fin de membership, fin des seances Kilo, questionnaires ou risques coach.</p>
        </div>
        <button class="primary" id="toggleManualClientBtn">${state.showManualClientForm ? "Fermer" : "Ajouter client"}</button>
      </div>
      <div class="toolbar client-toolbar">
        <label>Trier par
          <select id="clientSortSelect">
            <option value="actions" ${state.clientSort === "actions" ? "selected" : ""}>Actions ouvertes</option>
            <option value="membershipEnd" ${state.clientSort === "membershipEnd" ? "selected" : ""}>Fin membership</option>
            <option value="serviceEnd" ${state.clientSort === "serviceEnd" ? "selected" : ""}>Fin seances Kilo</option>
            <option value="questionnaire" ${state.clientSort === "questionnaire" ? "selected" : ""}>Dernier questionnaire</option>
            <option value="risk" ${state.clientSort === "risk" ? "selected" : ""}>Risque coach</option>
          </select>
        </label>
      </div>
      ${manualClientForm()}
      ${clientHoldsPanel(holds)}
      <div class="client-directory">
        ${sortedClients.length ? sortedClients.map(clientDirectoryRow).join("") : '<div class="empty">Aucun client consolide.</div>'}
      </div>
    </section>
    ${clientFocusPanel(getSelectedClient(sortedClients, []), state.data.tasks || [])}
  `;
  attachClientSelectors();
  attachClientRiskControl();
  attachManualClientForm();
  attachClientManagementControls();
}

function clientHoldsPanel(holds) {
  if (!holds || !holds.length) return "";
  return `
    <div class="focus-note client-holds-panel">
      <strong>Clients sur hold</strong>
      <p>Les holds vivent dans Clients parce qu'ils modifient le statut temporaire du client, pas la performance du coach.</p>
      <div class="client-directory">
        ${holds.map((row) => {
          const key = row.clientKey || normalizeName(row.client || "");
          return `<article class="compact-row"><strong>${escapeHtml(row.client || "Client")} <span class="tag warn">Hold</span></strong><p>Retour prevu: ${escapeHtml(row.expectedReturn || "A confirmer")}</p><p>${escapeHtml(row.reason || "")}</p><div class="row-actions compact-actions"><button data-clear-client-hold="true" data-client-key="${escapeAttr(key)}" data-client-name="${escapeAttr(row.client || "")}">Retirer hold</button></div></article>`;
        }).join("")}
      </div>
    </div>`;
}

function sortClients(clients) {
  const rows = (clients || []).slice();
  if (state.clientSort === "membershipEnd") {
    return rows.sort((a, b) => sortableDate(a.membershipEnd) - sortableDate(b.membershipEnd));
  }
  if (state.clientSort === "serviceEnd") {
    return rows.sort((a, b) => sortableDate(a.serviceEnd) - sortableDate(b.serviceEnd));
  }
  if (state.clientSort === "questionnaire") {
    return rows.sort((a, b) => Number(b.daysSinceQuestionnaire || 9999) - Number(a.daysSinceQuestionnaire || 9999));
  }
  if (state.clientSort === "risk") {
    return rows.sort((a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel));
  }
  return rows.sort((a, b) => Number(b.openTasks || 0) - Number(a.openTasks || 0));
}

function sortableDate(value) {
  const date = new Date(toDateInputValue(value || "") || "2999-12-31");
  return date.getTime();
}

function riskRank(level) {
  const value = normalizeLower(level);
  if (value === "eleve") return 3;
  if (value === "moyen") return 2;
  if (value === "faible") return 1;
  return 0;
}

function manualClientForm() {
  if (!state.showManualClientForm) return "";
  return `
    <div class="focus-note manual-client-form">
      <strong>Ajouter un client manuel</strong>
      <p>Utilise ceci pour un client test ou un client externe qui doit apparaitre dans le dashboard meme s'il ne sort pas encore de CoachRx/CSM.</p>
      <div class="form-grid compact-form">
        <input id="manualClientName" placeholder="Nom complet">
        <input id="manualClientPhone" placeholder="Telephone">
        <input id="manualClientEmail" placeholder="Courriel">
        <input id="manualClientPackage" placeholder="Membership / service">
        <label>Fin membership
          <input id="manualClientMembershipEnd" type="date">
        </label>
        <input id="manualClientObjective" class="wide" placeholder="Objectif ou note coach">
      </div>
      <div class="actions-row">
        <button class="primary" id="saveManualClientBtn">Ajouter au dashboard</button>
      </div>
    </div>`;
}

function editClientForm(client) {
  if (!client) return "";
  return `
    <div class="focus-note manual-client-form inline-edit-form">
      <strong>Modifier client demo</strong>
      <p>La donnee systeme reste separee. La fin prevue coach sert quand le client t'annonce une intention de quitter plus tot.</p>
      <div class="form-grid compact-form">
        <input id="editClientName" placeholder="Nom complet" value="${escapeAttr(client.client || "")}">
        <input id="editClientPhone" placeholder="Telephone" value="${escapeAttr(client.phone || "")}">
        <input id="editClientEmail" placeholder="Courriel" value="${escapeAttr(client.email || "")}">
        <input id="editClientPackage" placeholder="Membership / service" value="${escapeAttr(client.activePackage || "")}">
        <label>Fin membership systeme
          <input id="editClientMembershipEnd" type="date" value="${escapeAttr(toDateInputValue(client.membershipEnd || ""))}">
        </label>
        <label>Fin prevue coach
          <input id="editClientPlannedExit" type="date" value="${escapeAttr(toDateInputValue(client.plannedExitDate || ""))}">
        </label>
        <input id="editClientObjective" class="wide" placeholder="Objectif ou note coach" value="${escapeAttr(client.objective || "")}">
        <input id="editClientExitNote" class="wide" placeholder="Raison de la fin prevue ou contexte retention" value="${escapeAttr(client.plannedExitNote || "")}">
      </div>
      <div class="actions-row">
        <button class="primary" id="saveEditedClientBtn" data-client-key="${escapeAttr(client.clientKey || "")}">Enregistrer</button>
        <button id="cancelEditClientBtn">Annuler</button>
      </div>
    </div>`;
}

function attachManualClientForm() {
  const toggle = document.getElementById("toggleManualClientBtn");
  if (toggle) toggle.addEventListener("click", () => {
    state.showManualClientForm = !state.showManualClientForm;
    render();
  });
  const saveButton = document.getElementById("saveManualClientBtn");
  if (saveButton) saveButton.addEventListener("click", saveManualClient);
  const sortSelect = document.getElementById("clientSortSelect");
  if (sortSelect) sortSelect.addEventListener("change", () => {
    state.clientSort = sortSelect.value;
    localStorage.setItem("cfsbCoachClientSort", state.clientSort);
    render();
  });
}

function attachClientManagementControls() {
  const editButton = document.getElementById("editClientBtn");
  if (editButton) {
    const editor = els.content.querySelector(".client-management");
    editButton.addEventListener("click", () => {
      state.editingClientKey = editor && editor.dataset.clientKey;
      state.activeView = "clients";
      render();
    });
  }
  const removeButton = document.getElementById("removeClientBtn");
  if (removeButton) {
    const editor = els.content.querySelector(".client-management");
    removeButton.addEventListener("click", () => {
      removeClientFromDashboard(editor && editor.dataset.clientKey, editor && editor.dataset.clientName);
    });
  }
  const saveEditedButton = document.getElementById("saveEditedClientBtn");
  if (saveEditedButton) saveEditedButton.addEventListener("click", () => saveEditedClient(saveEditedButton.dataset.clientKey));
  const cancelEditButton = document.getElementById("cancelEditClientBtn");
  if (cancelEditButton) cancelEditButton.addEventListener("click", () => {
    state.editingClientKey = "";
    render();
  });
}

function clientDirectoryRow(client) {
  const questionnaireLabel = lastQuestionnaireDate(client, client.latestQuestionnaireResponse)
    ? `Dernier questionnaire: ${lastQuestionnaireDate(client, client.latestQuestionnaireResponse)}${questionnaireAgeLabel(client) ? " | " + questionnaireAgeLabel(client) : ""}`
    : "Dernier questionnaire: jamais";
  return `
    <article class="directory-row ${state.selectedClientKey === client.clientKey ? "selected" : ""}">
      <button class="client-trigger" data-client-key="${escapeAttr(client.clientKey || "")}">
        <span class="priority-dot"></span>
        <span>
          <strong>${escapeHtml(client.client || "Client")}</strong>
          <small>${escapeHtml(client.activePackage || client.signal || "Aucun signal majeur")}</small>
        </span>
      </button>
      <div class="task-context">
        <span class="tag">${client.openTasks || 0} action(s)</span>
        ${isCoachRisk(client.riskLevel) ? `<span class="tag bad">Risque ${escapeHtml(client.riskLevel)}</span>` : ""}
        ${client.systemSignal ? `<span class="tag warn">Signal: ${escapeHtml(client.systemSignal)}</span>` : ""}
        <span class="tag ${questionnaireIsStale(client) ? "warn" : "good"}">${escapeHtml(questionnaireLabel)}</span>
        ${client.membershipEnd ? `<span class="tag">Fin membership: ${escapeHtml(client.membershipEnd)}</span>` : ""}
        ${client.plannedExitDate ? `<span class="tag bad">Fin prevue coach: ${escapeHtml(client.plannedExitDate)}</span>` : ""}
        ${client.serviceEnd ? `<span class="tag warn">Fin seances Kilo: ${escapeHtml(client.serviceEnd)}</span>` : ""}
      </div>
    </article>`;
}

function renderQuestionnaireInbox(data) {
  const responses = collectQuestionnaireResponses(data);
  const sends = collectQuestionnaireSendLog(data);
  const clients = data.clients || [];
  const sendableClients = clients.slice().sort((a, b) => cleanValue(a.client).localeCompare(cleanValue(b.client)));
  const staleClients = clients.filter(questionnaireIsStale);
  const pending = sends.filter((row) => !["repondu", "action_completee", "archive", "ignore"].includes(normalizeLower(row.status || row.formStatus || "")));
  const filtered = filterQuestionnaireResponses(responses);
  const urgent = responses.filter((row) => ["rouge", "orange"].includes(row.triageStatus));
  const unmatched = responses.filter((row) => row.matchStatus === "non_matche");
  const unread = responses.filter((row) => !["lu", "action_completee", "archive"].includes(row.processingStatus));
  const primaryListHtml = state.activeQuestionnaireFilter === "clients"
    ? (sendableClients.length ? `<div class="questionnaire-list">${sendableClients.map(questionnaireClientRow).join("")}</div>` : '<div class="empty">Aucun client disponible.</div>')
    : state.activeQuestionnaireFilter === "stale"
      ? (staleClients.length ? `<div class="questionnaire-list">${staleClients.map(questionnaireClientRow).join("")}</div>` : '<div class="empty">Tous les clients ont un questionnaire recent.</div>')
      : state.activeQuestionnaireFilter === "pending"
        ? (pending.length ? pending.map((row) => `<article class="compact-row"><strong>${escapeHtml(row.client || row.clientName || row.client_name || "Client")}</strong><p>Envoye: ${escapeHtml(row.sentAt || row.sent_at || "-")} | statut: ${escapeHtml(row.status || "a suivre")}</p><p>${escapeHtml(row.note || row.details || "")}</p></article>`).join("") : '<div class="empty">Aucun questionnaire en attente.</div>')
        : (filtered.length ? `<div class="questionnaire-list">${filtered.map(questionnaireRow).join("")}</div>` : '<div class="empty">Aucune reponse dans ce filtre.</div>');
  els.content.className = "content performance-grid";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Inbox questionnaire</p>
          <h2>Suivis clients recus</h2>
          <p>Cette vue centralise les reponses et les relances. "Marquer traite" veut dire: le coach a lu la reponse et fait le suivi necessaire, donc elle peut sortir de la liste active.</p>
        </div>
      </div>
      <div class="priority-strip">
        ${priorityTile("Reponses", responses.length, "p4")}
        ${priorityTile("Urgentes", urgent.length, "p1")}
        ${priorityTile("A envoyer 3 mois+", staleClients.length, "p2")}
        ${priorityTile("En attente", pending.length, "p3")}
      </div>
      ${questionnaireFilters(responses, staleClients, pending, clients)}
    </section>
    <section class="mission-panel performance-hero">
      <div class="section-head"><div><p class="eyebrow">A traiter</p><h2>${questionnaireFilterTitle(filtered, staleClients, pending)}</h2></div></div>
      ${primaryListHtml}
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Non matchees</p><h2>Validation client</h2></div></div>
      ${unmatched.length ? unmatched.slice(0, 8).map((row) => `<article class="compact-row"><strong>${escapeHtml(row.clientName || "Client a valider")}</strong><p>Telephone: ${escapeHtml(row.clientPhoneNormalized || "-")}</p><p>Action: creer ou corriger le lien client dans CORE_Clients.</p></article>`).join("") : '<div class="empty">Toutes les reponses recues sont matchees ou aucune reponse recue.</div>'}
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Relances</p><h2>Envoyes sans reponse</h2></div></div>
      ${pending.length ? pending.slice(0, 8).map((row) => `<article class="compact-row"><strong>${escapeHtml(row.client || row.clientName || row.client_name || "Client")}</strong><p>Envoye: ${escapeHtml(row.sentAt || row.sent_at || "-")} | statut: ${escapeHtml(row.status || "a suivre")}</p><p>${escapeHtml(row.note || row.details || "")}</p></article>`).join("") : '<div class="empty">Aucune relance en attente.</div>'}
    </section>
  `;
}

function collectQuestionnaireResponses(data) {
  const candidates = [
    data.questionnaireInbox,
    data.questionnaires,
    data.clientCoachResponses,
    data.responses,
    data.v3 && data.v3.questionnaires,
    data.v3 && data.v3.questionnaireInbox
  ].filter(Array.isArray);
  const rows = candidates.flat();
  if (rows.length) return rows.map(normalizeQuestionnaireResponse);
  return (data.tasks || [])
    .filter((task) => task.type === "Formulaire")
    .map((task) => normalizeQuestionnaireResponse({
      response_id: task.taskId,
      client_name: task.client,
      coach_name: task.coach,
      submitted_at: task.dueDate,
      triage_status: inferTriageFromPriority(task.priority),
      coach_action_type: task.action,
      dashboard_sync_status: task.status || "tache_creee",
      processing_status: "recu",
      source: task.source,
      open_note: task.why
    }));
}

function collectQuestionnaireSendLog(data) {
  const candidates = [
    data.questionnaireSendLog,
    data.formSendLog,
    data.formsSent,
    data.v3 && data.v3.questionnaireSendLog
  ].filter(Array.isArray);
  return candidates.flat();
}

function normalizeQuestionnaireResponse(row) {
  const triageStatus = normalizeLower(row.triage_status || row.triageStatus || inferTriageFromAction(row.coach_action_type || row.coachActionType));
  const matchStatus = normalizeLower(row.match_status || row.matchStatus || row.dashboard_match_status || row.dashboardMatchStatus);
  const processingStatus = normalizeLower(row.processing_status || row.processingStatus || row.dashboard_sync_status || row.dashboardSyncStatus || "recu");
  const clientKey = cleanValue(row.client_key || row.clientKey || row.client_id || row.clientId);
  return {
    responseId: cleanValue(row.response_id || row.responseId || row.id),
    submittedAt: cleanValue(row.submitted_at || row.submittedAt || row.received_at || row.receivedAt),
    receivedAt: cleanValue(row.received_at || row.receivedAt),
    clientName: cleanValue(row.client_name || row.clientName || row.client),
    clientEmail: cleanValue(row.client_email || row.clientEmail),
    clientPhone: cleanValue(row.client_phone || row.clientPhone),
    clientPhoneNormalized: cleanValue(row.client_phone_normalized || row.clientPhoneNormalized),
    coachName: cleanValue(row.coach_name || row.coachName || row.coach),
    followupType: cleanValue(row.followup_type || row.followupType),
    generalState: cleanValue(row.general_state || row.generalState),
    motivationLevel: cleanValue(row.motivation_level || row.motivationLevel),
    goalStatus: cleanValue(row.goal_status || row.goalStatus),
    goalClarityScore: cleanValue(row.goal_clarity_score || row.goalClarityScore),
    programFit: cleanValue(row.program_fit || row.programFit),
    painStatus: cleanValue(row.pain_status || row.painStatus),
    contactRequest: cleanValue(row.contact_request || row.contactRequest),
    openNote: cleanValue(row.open_note || row.openNote || row.note),
    improvementsRequested: cleanValue(row.improvements_requested || row.improvementsRequested),
    finalPosition: cleanValue(row.final_position || row.finalPosition),
    triageStatus: triageStatus || "vert",
    coachActionType: cleanValue(row.coach_action_type || row.coachActionType || actionForTriage(triageStatus)),
    processingStatus,
    matchStatus: matchStatus || (clientKey || cleanValue(row.coach_name || row.coachName) ? "matche" : "non_matche"),
    clientKey
  };
}

function questionnaireFilters(responses, staleClients, pending, clients) {
  const filters = [
    ["clients", "Clients", clients.length],
    ["all", "Toutes", responses.length],
    ["stale", "A envoyer 3 mois+", staleClients.length],
    ["pending", "En attente", pending.length],
    ["urgent", "Rouge / orange", responses.filter((row) => ["rouge", "orange"].includes(row.triageStatus)).length],
    ["unmatched", "Non matchees", responses.filter((row) => row.matchStatus === "non_matche").length],
    ["unread", "Non traitees", responses.filter((row) => !["lu", "action_completee", "archive"].includes(row.processingStatus)).length]
  ];
  return `<div class="mission-filters">${filters.map(([id, label, count]) => `<button class="${state.activeQuestionnaireFilter === id ? "active" : ""}" data-questionnaire-filter="${id}">${escapeHtml(label)} <span>${count}</span></button>`).join("")}</div>`;
}

function questionnaireFilterTitle(filtered, staleClients, pending) {
  if (state.activeQuestionnaireFilter === "clients") return "Liste des clients";
  if (state.activeQuestionnaireFilter === "stale") return `${staleClients.length} questionnaire${staleClients.length > 1 ? "s" : ""} a envoyer`;
  if (state.activeQuestionnaireFilter === "pending") return `${pending.length} en attente`;
  return `${filtered.length} reponse${filtered.length > 1 ? "s" : ""}`;
}

function filterQuestionnaireResponses(responses) {
  const filter = state.activeQuestionnaireFilter;
  if (filter === "unmatched") return responses.filter((row) => row.matchStatus === "non_matche");
  if (filter === "urgent") return responses.filter((row) => ["rouge", "orange"].includes(row.triageStatus));
  if (filter === "unread") return responses.filter((row) => !["lu", "action_completee", "archive"].includes(row.processingStatus));
  return responses;
}

function questionnaireRow(row) {
  const tone = row.triageStatus === "rouge" ? "bad" : row.triageStatus === "orange" || row.triageStatus === "jaune" ? "warn" : "good";
  return `
    <article class="compact-row questionnaire-row">
      <strong>${escapeHtml(row.clientName || "Client a valider")} <span class="tag ${tone}">${escapeHtml(row.triageStatus)}</span></strong>
      <p>${escapeHtml(row.submittedAt || row.receivedAt || "-")} | ${escapeHtml(row.coachName || "Coach a deriver")} | ${escapeHtml(row.matchStatus)}</p>
      <p><strong>Action:</strong> ${escapeHtml(actionForTriage(row.triageStatus, row.coachActionType))}</p>
      <p>${escapeHtml(questionnaireSummary(row))}</p>
      ${row.responseId ? `<div class="row-actions compact-actions">
        <button data-send-questionnaire-client="true" data-client-key="${escapeAttr(row.clientKey || "")}" data-client-name="${escapeAttr(row.clientName || "")}">Envoyer questionnaire</button>
        <button class="done" data-response-id="${escapeAttr(row.responseId)}" data-questionnaire-action="action_completee">Marquer traite</button>
      </div>` : ""}
    </article>
  `;
}

function questionnaireClientRow(client) {
  const date = lastQuestionnaireDate(client, client.latestQuestionnaireResponse);
  const age = questionnaireAgeLabel(client);
  const phone = cleanValue(client.phone);
  const phoneStatus = phone ? `Telephone: ${phone}` : "Telephone requis avant envoi";
  return `
    <article class="compact-row questionnaire-row">
      <strong>${escapeHtml(client.client || "Client")}</strong>
      <p>Dernier questionnaire: ${escapeHtml(date ? `${date}${age ? " | " + age : ""}` : "jamais trouve")}</p>
      <p>${escapeHtml(phoneStatus)} | ${escapeHtml(client.activePackage || client.program || "Aucun contexte additionnel")}</p>
      <div class="row-actions compact-actions">
        <button class="done" data-send-questionnaire="true" data-client-key="${escapeAttr(client.clientKey || "")}" data-client-name="${escapeAttr(client.client || "")}" ${phone ? "" : "disabled"}>Envoyer questionnaire</button>
      </div>
    </article>
  `;
}

function questionnaireSummary(row) {
  return [
    row.generalState && `Etat: ${row.generalState}`,
    row.motivationLevel && `Motivation: ${row.motivationLevel}`,
    row.goalStatus && `Objectif: ${row.goalStatus}`,
    row.programFit && `Programme: ${row.programFit}`,
    row.painStatus && `Douleur: ${row.painStatus}`,
    row.openNote
  ].filter(Boolean).join(" | ") || "Reponse a lire.";
}

function inferTriageFromPriority(priority) {
  if (priority === "P1") return "rouge";
  if (priority === "P2") return "orange";
  return "vert";
}

function inferTriageFromAction(action) {
  const value = normalizeLower(action);
  if (value.includes("contacter") || value.includes("prioritaire")) return "rouge";
  if (value.includes("discussion") || value.includes("planifier")) return "orange";
  if (value.includes("ajustement") || value.includes("valider")) return "jaune";
  return "vert";
}

function actionForTriage(triage, fallback) {
  const value = normalizeLower(triage);
  if (fallback) return fallback;
  if (value === "rouge") return "contacter rapidement";
  if (value === "orange") return "planifier une discussion";
  if (value === "jaune") return "valider les ajustements";
  return "lire le suivi client";
}

function renderRetention(v3) {
  const k = v3.kpis || {};
  const rows = (v3.retention || []).filter((row) => isCoachRisk(row.riskLevel));
  els.content.className = "content";
  els.content.innerHTML = `
    <section class="panel full">
      <h2>Retention et risques</h2>
      <div class="metrics">
        <div><strong>${k.activeClients || 0}</strong><span>clients actifs</span></div>
        <div><strong>${k.retentionRate || 0}%</strong><span>retention approx.</span></div>
        <div><strong>${k.serviceEnding30 || 0}</strong><span>fins dans 30 jours</span></div>
        <div><strong>${k.questionnaireStale || 0}</strong><span>questionnaires a relancer</span></div>
      </div>
    </section>
    ${rows.length ? rows.map((row) => `<article class="compact-row"><strong>${escapeHtml(row.client)} <span class="tag warn">${escapeHtml(row.riskLevel)}</span></strong><p>${escapeHtml(row.riskReasons || "A valider")}</p></article>`).join("") : '<div class="empty">Aucun client marque a risque par le coach.</div>'}`;
}

function renderAlumni(v3) {
  const rows = v3.alumni || [];
  const removed = v3.removedClients || [];
  els.content.className = "content performance-grid";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Alumni</p>
          <h2>Reactivation et triage</h2>
          <p>Une zone separee pour les anciens clients: prioriser les personnes a recontacter, exclure celles qui ne reviendront pas, et creer des missions de reactivation.</p>
        </div>
      </div>
      <div class="priority-strip">
        ${priorityTile("A recontacter", rows.length, "p2")}
        ${priorityTile("Exclus", removed.length, "p3")}
        ${priorityTile("Missions possibles", rows.filter((row) => normalizeLower(row.status || "").includes("prioriser") || normalizeLower(row.status || "").includes("recontacter")).length, "p4")}
      </div>
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Ajouter</p><h2>Nouvel alumni</h2></div></div>
      <div class="form-grid compact-form">
        <input id="alumniClient" placeholder="Nom alumni">
        <input id="alumniNext" type="date">
        <input id="alumniReason" placeholder="Raison / contexte">
        <textarea id="alumniNotes" class="wide" placeholder="Notes pour le prochain contact"></textarea>
      </div>
      <div class="actions-row"><button id="saveAlumniBtn" class="primary">Ajouter alumni</button></div>
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Liste</p><h2>Alumni a travailler</h2></div></div>
      ${rows.length ? rows.map(alumniRow).join("") : '<div class="empty">Aucun alumni entre.</div>'}
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Retires / exclus</p><h2>A ne pas recontacter</h2></div></div>
      ${removed.length ? removed.map(removedAlumniRow).join("") : '<div class="empty">Aucun client exclu pour le moment.</div>'}
    </section>`;
  document.getElementById("saveAlumniBtn").addEventListener("click", saveAlumni);
  els.content.querySelectorAll("[data-create-alumni-task]").forEach((button) => {
    button.addEventListener("click", () => createAlumniTask(button.dataset.client || ""));
  });
  attachAlumniControls();
}

function alumniRow(row) {
  const key = row.clientKey || normalizeName(row.client || "");
  return `
    <article class="compact-row">
      <strong>${escapeHtml(row.client)} <span class="tag">${escapeHtml(row.status || "Alumni")}</span></strong>
      <p>Prochain contact: ${escapeHtml(row.nextContactDue || "A planifier")}</p>
      <p>${escapeHtml(row.notes || "")}</p>
      <div class="row-actions compact-actions">
        <button data-create-alumni-task="true" data-client="${escapeAttr(row.client || "")}">Creer mission</button>
        <button data-update-alumni-status="reactive" data-alumni-key="${escapeAttr(key)}" data-client="${escapeAttr(row.client || "")}">Reactive</button>
        <button data-update-alumni-status="excluded" data-alumni-key="${escapeAttr(key)}" data-client="${escapeAttr(row.client || "")}">Ne pas recontacter</button>
        <button data-delete-alumni="true" data-alumni-key="${escapeAttr(key)}" data-client="${escapeAttr(row.client || "")}">Supprimer</button>
      </div>
    </article>`;
}

function attachAlumniControls() {
  els.content.querySelectorAll("[data-update-alumni-status]").forEach((button) => {
    button.addEventListener("click", () => updateAlumniStatus(button.dataset.alumniKey || "", button.dataset.client || "", button.dataset.updateAlumniStatus || ""));
  });
  els.content.querySelectorAll("[data-delete-alumni]").forEach((button) => {
    button.addEventListener("click", () => deleteAlumni(button.dataset.alumniKey || "", button.dataset.client || ""));
  });
  els.content.querySelectorAll("[data-restore-alumni]").forEach((button) => {
    button.addEventListener("click", () => restoreAlumni(button.dataset.alumniKey || "", button.dataset.client || ""));
  });
}

function removedAlumniRow(row) {
  const key = row.clientKey || normalizeName(row.client || "");
  return `
    <article class="compact-row">
      <strong>${escapeHtml(row.client)} <span class="tag">${escapeHtml(row.status || "Retire")}</span></strong>
      <p>${escapeHtml(row.notes || "")}</p>
      <div class="row-actions compact-actions">
        <button data-restore-alumni="true" data-alumni-key="${escapeAttr(key)}" data-client="${escapeAttr(row.client || "")}">Remettre a travailler</button>
        <button data-delete-alumni="true" data-alumni-key="${escapeAttr(key)}" data-client="${escapeAttr(row.client || "")}">Supprimer</button>
      </div>
    </article>`;
}

function renderScenarios(data) {
  const scenarios = demoScenarios();
  const latestActions = (data.actionLog || []).slice(0, 8);
  els.content.className = "content performance-grid";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Hub operationnel</p>
          <h2>Guide & modules</h2>
          <p>Le dashboard reste le lien stable des coachs. Les modules encore en test restent accessibles par bouton jusqu'a ce que leurs donnees soient assez solides pour etre integrees directement.</p>
        </div>
        <span class="freshness">Lien stable</span>
      </div>
      <div class="goal-grid">
        <article class="compact-row"><strong>Regle simple</strong><p>Si un projet change encore souvent, il reste un module lie. Quand son contrat de donnees est stable, on l'integre au dashboard.</p></article>
        <article class="compact-row"><strong>Ce que le coach utilise ici</strong><p>Mission, Clients, Alumni et Performance restent les zones de travail principales.</p></article>
        <article class="compact-row"><strong>Ce qu'on evite</strong><p>Ne pas donner l'impression qu'une integration est automatique si elle est encore en test.</p></article>
      </div>
    </section>
    <section class="module-grid">
      ${operationalModules().map(moduleCard).join("")}
    </section>
    <section class="mission-panel performance-hero">
      <div class="section-head"><div><p class="eyebrow">Mode test</p><h2>Scenarios coach a tester</h2></div></div>
      <p class="muted">Chaque carte cree ou replace un cas concret dans le mode demo. Ca sert a valider les workflows avant de les brancher a de vrais clients.</p>
      ${state.isDemo ? demoBanner() : '<div class="focus-note"><strong>Mode demo requis</strong><p>Ouvre le coach <code>Coach Test CFSB</code> ou clique Mode demo dans Systeme avant de lancer un scenario.</p></div>'}
      <div class="scenario-map">
        ${scenarios.map((scenario, index) => `<span>${index + 1}. ${escapeHtml(scenario.short)}</span>`).join("")}
      </div>
    </section>
    <section class="scenario-grid performance-hero">
      ${scenarios.map(renderScenarioCard).join("")}
    </section>
    <section class="mission-panel performance-hero">
      <div class="section-head"><div><p class="eyebrow">Validation</p><h2>Ce que tu peux tester apres</h2></div></div>
      <div class="goal-grid">
        <article class="compact-row"><strong>Mission</strong><p>Les taches doivent apparaitre avec les bons boutons: Fait, Masquer, Envoyer rappel ou Envoyer questionnaire.</p></article>
        <article class="compact-row"><strong>Clients</strong><p>La fiche client doit montrer membership, fin systeme, fin prevue coach, derniere date Kilo, risque coach et dernier questionnaire.</p></article>
        <article class="compact-row"><strong>Alumni / Clients / Performance</strong><p>Alumni gere les anciens clients, Clients gere les holds, Performance gere les risques et les impacts.</p></article>
      </div>
    </section>
    <section class="mission-panel performance-hero">
      <div class="section-head"><div><p class="eyebrow">Historique demo</p><h2>Actions observees</h2></div></div>
      ${latestActions.length ? latestActions.map((row) => `<article class="compact-row"><strong>${escapeHtml(row.message || "Action demo")}</strong><p>${escapeHtml(row.at || "")}</p></article>`).join("") : '<div class="empty">Aucune action demo encore. Lance un scenario ou clique un bouton dans Mission.</div>'}
    </section>
  `;
  const resetButton = document.getElementById("inlineResetDemoBtn");
  if (resetButton) resetButton.addEventListener("click", resetDemoMode);
}

function operationalModules() {
  return [
    {
      title: "Questionnaire client",
      status: "En test",
      tone: "warn",
      description: "Interface visuelle client-coach. Pour l'instant, on garde le module externe et on analyse les reponses avant de pousser une integration plus profonde.",
      links: [
        ["Ouvrir le questionnaire", "https://crossfitstbasile.github.io/cfsb-suivi-client-coach/"],
        ["Voir les reponses", "https://docs.google.com/spreadsheets/d/11QO5GOQGHCpT8_nLEgKHqjFFsZ4emPwZEt2Vlu3WRJo/edit"]
      ]
    },
    {
      title: "Rebooking semi-prive",
      status: "Module lie",
      tone: "warn",
      description: "Source utile pour les seances a remettre, mais le matching peut evoluer. On garde un lien direct et on remonte seulement les signaux assez fiables.",
      links: [
        ["Ouvrir le suivi rebooking", "https://docs.google.com/spreadsheets/d/1s7shtrkL0gs1DO0LbzkbabZteidGnYLhVou6KliHXVU/edit"]
      ]
    },
    {
      title: "Rendement hebdo",
      status: "Actif",
      tone: "good",
      description: "Document interne ou les coachs doivent entrer leurs actions, impacts et accomplissements de la semaine.",
      links: [
        ["Ouvrir rendement", "https://docs.google.com/spreadsheets/d/1ZbhqgbvDnT_-qK3JS1FPRqcZ40vHsXks8hs5fJ5J064/edit?gid=1203687517#gid=1203687517"]
      ]
    },
    {
      title: "CoachRx",
      status: "MAJ manuelle",
      tone: "warn",
      description: "Source de travail coach. Les donnees sont poussees par l'extension Chrome; les corrections restent manuelles dans CoachRx.",
      links: [
        ["Ouvrir CoachRx", "https://dashboard.coachrx.app/"]
      ]
    },
    {
      title: "CSM / memberships",
      status: "Source reference",
      tone: "good",
      description: "Source interne pour membership, debut d'abonnement, presence, check-up et informations de retention.",
      links: [
        ["Ouvrir CSM", "https://docs.google.com/spreadsheets/d/1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw/edit"]
      ]
    },
    {
      title: "Kilo",
      status: "A valider",
      tone: "",
      description: "Utile pour horaires, holds et rendez-vous, mais les donnees clients ne sont pas toutes exportables proprement pour l'instant.",
      links: [
        ["Ouvrir Kilo", "https://app.usekilo.com/"]
      ]
    }
  ];
}

function moduleCard(module) {
  return `
    <article class="module-card">
      <div class="module-card-head">
        <h3>${escapeHtml(module.title)}</h3>
        <span class="tag ${escapeAttr(module.tone || "")}">${escapeHtml(module.status)}</span>
      </div>
      <p>${escapeHtml(module.description)}</p>
      <div class="module-links">
        ${module.links.map(([label, url]) => `<a class="button-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`).join("")}
      </div>
    </article>`;
}

function renderScenarioCard(scenario) {
  return `
    <article class="scenario-card">
      <div class="scenario-top">
        <span class="scenario-number">${escapeHtml(scenario.number)}</span>
        <span class="tag ${scenario.tone || ""}">${escapeHtml(scenario.area)}</span>
      </div>
      <h3>${escapeHtml(scenario.title)}</h3>
      <p>${escapeHtml(scenario.description)}</p>
      <ul>
        ${scenario.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join("")}
      </ul>
      <button class="primary" data-scenario-id="${escapeAttr(scenario.id)}">${escapeHtml(scenario.button)}</button>
    </article>`;
}

function demoScenarios() {
  return [
    {
      id: "program",
      number: "01",
      short: "Programme",
      area: "Mission",
      tone: "warn",
      title: "Programme a preparer",
      description: "Replace Julie avec un programme a batir et une date proche.",
      checks: ["Bouton Fait", "Bouton Masquer", "Contexte membership visible"],
      button: "Tester programme"
    },
    {
      id: "rebooking",
      number: "02",
      short: "Rebooking",
      area: "Mission",
      tone: "warn",
      title: "Seances a rebooker",
      description: "Met Emilie a 14 jours de sa derniere seance planifiee.",
      checks: ["Envoyer rappel", "Tache retiree apres envoi", "Relance prevue dans 7 jours"],
      button: "Tester rebooking"
    },
    {
      id: "questionnaire-due",
      number: "03",
      short: "Questionnaire du",
      area: "Mission",
      tone: "warn",
      title: "Aucun questionnaire depuis 3 mois",
      description: "Fait ressortir Mathieu comme client a qui envoyer un suivi.",
      checks: ["Envoyer questionnaire", "Journal d'envoi", "Dernier questionnaire visible"],
      button: "Tester envoi formulaire"
    },
    {
      id: "questionnaire-red",
      number: "04",
      short: "Reponse rouge",
      area: "Questionnaires",
      tone: "bad",
      title: "Questionnaire urgent recu",
      description: "Ajoute une reponse rouge pour Sarah avec douleur et motivation basse.",
      checks: ["Inbox rouge/orange", "Tache contacter", "Marquer traite"],
      button: "Tester reponse rouge"
    },
    {
      id: "membership-end",
      number: "05",
      short: "Fin membership",
      area: "Clients",
      tone: "warn",
      title: "Membership a 30 jours",
      description: "Place Camille avec une fin de membership proche.",
      checks: ["Tri fin membership", "Alerte retention", "Date systeme visible"],
      button: "Tester fin membership"
    },
    {
      id: "planned-exit",
      number: "06",
      short: "Fin coach",
      area: "Clients",
      tone: "bad",
      title: "Fin prevue par le coach",
      description: "Simule un client qui annonce vouloir quitter plus tot que la fin systeme.",
      checks: ["Fin prevue coach", "Tache retention", "Note coach visible"],
      button: "Tester fin prevue"
    },
    {
      id: "hold",
      number: "07",
      short: "Hold",
      area: "Clients",
      tone: "warn",
      title: "Retour de hold bientot",
      description: "Ajoute Benoit sur hold avec un retour a 7 jours.",
      checks: ["Vue Clients", "Rappel avant retour", "Client moins bruyant"],
      button: "Tester hold"
    },
    {
      id: "alumni",
      number: "08",
      short: "Alumni",
      area: "Alumni",
      tone: "good",
      title: "Alumni a reactiver",
      description: "Ajoute Laura dans la liste alumni et cree une mission de recontact.",
      checks: ["Liste Alumni", "Creer mission", "Impact potentiel"],
      button: "Tester alumni"
    },
    {
      id: "impact",
      number: "09",
      short: "Impact",
      area: "Performance",
      tone: "good",
      title: "Impact / upsell",
      description: "Cree une opportunite d'impact liee a Alex et une mission de suivi.",
      checks: ["Impact semaine", "Mission impact", "Journal performance"],
      button: "Tester impact"
    }
  ];
}

function renderImpacts(v3) {
  const rows = (v3.impacts && v3.impacts.log) || [];
  els.content.className = "content";
  els.content.innerHTML = `
    <section class="panel full">
      <h2>Impacts et upsells</h2>
      ${impactForm()}
    </section>
    ${rows.length ? rows.slice().reverse().slice(0, 20).map(impactRow).join("") : '<div class="empty">Aucun impact declare.</div>'}`;
  document.getElementById("saveImpactBtn").addEventListener("click", saveImpact);
  attachImpactControls();
}

function impactForm() {
  return `
    <div class="focus-note">
      <strong>Definition</strong>
      <p>Un impact = nouveau revenu cree par le coach: evaluation vendue, passage vers prive/semi-prive, reference fermee, alumni reactive ou service additionnel.</p>
    </div>
    <div class="form-grid compact-form">
      <input id="impactClient" placeholder="Client / membre / reference">
      <select id="impactType"><option>Evaluation physique</option><option>Semi-prive</option><option>Prive</option><option>Reference fermee</option><option>Alumni reactive</option><option>Service additionnel</option><option>Autre impact</option></select>
      <input id="impactAmount" placeholder="Montant approx.">
      <input id="impactDate" type="date">
      <select id="impactStatus"><option value="Propose">Propose</option><option value="Confirme">Confirme</option><option value="Vendu">Vendu</option><option value="Annule">Annule</option></select>
      <textarea id="impactNotes" class="wide" placeholder="Notes: contexte, prochaine action, source du revenu"></textarea>
    </div>
    <div class="actions-row"><button id="saveImpactBtn" class="primary">Declarer impact</button></div>`;
}

function impactRow(row) {
  const id = row.impactId || normalizeName([row.client, row.impactType, row.impactDate].join("-"));
  const status = cleanValue(row.status || "Propose");
  const statusTone = normalizeLower(status).includes("annule") ? "bad" : (normalizeLower(status).includes("vendu") || normalizeLower(status).includes("confirme") ? "good" : "warn");
  return `
    <article class="compact-row">
      <strong>${escapeHtml(row.impactType || "Impact")} ${row.client ? "- " + escapeHtml(row.client) : ""} <span class="tag ${statusTone}">${escapeHtml(status)}</span></strong>
      <p>${escapeHtml(row.impactDate || "Date a confirmer")} ${row.amount ? "| " + escapeHtml(row.amount) + "$" : ""}</p>
      <p>${escapeHtml(row.notes || "")}</p>
      <div class="row-actions compact-actions">
        <button data-update-impact-status="Confirme" data-impact-id="${escapeAttr(id)}">Confirmer</button>
        <button data-update-impact-status="Annule" data-impact-id="${escapeAttr(id)}">Annuler</button>
        <button data-delete-impact="true" data-impact-id="${escapeAttr(id)}">Supprimer</button>
      </div>
    </article>`;
}

function attachImpactControls() {
  els.content.querySelectorAll("[data-update-impact-status]").forEach((button) => {
    button.addEventListener("click", () => updateImpactStatus(button.dataset.impactId || "", button.dataset.updateImpactStatus || ""));
  });
  els.content.querySelectorAll("[data-delete-impact]").forEach((button) => {
    button.addEventListener("click", () => deleteImpact(button.dataset.impactId || ""));
  });
}

function renderPerformance(data) {
  const v3 = data.v3 || {};
  const k = v3.kpis || {};
  const goals = data.goals || {};
  const riskRows = (v3.retention || []).filter((row) => isCoachRisk(row.riskLevel));
  const questionnaireRiskRows = (data.questionnaireInbox || []).filter((row) => ["rouge", "orange"].includes(normalizeLower(row.triage_status || "")));
  const impacts = (v3.impacts && v3.impacts.log) || [];
  els.content.className = "content performance-grid";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Performance coach</p>
          <h2>Retention et revenus crees</h2>
          <p>Cette section sert au pilotage hebdomadaire: identifier les risques de perte client et documenter les nouveaux revenus crees par les coachs.</p>
        </div>
      </div>
      <div class="priority-strip">
        ${priorityTile("Retention approx.", `${k.retentionRate || 0}%`, "p4")}
        ${priorityTile("Risques coach", k.atRisk || 0, "p1")}
        ${priorityTile("Fins 30 jours", k.serviceEnding30 || 0, "p2")}
        ${priorityTile("Impacts semaine", k.impactsWeek || 0, "p3")}
      </div>
    </section>
    <section class="mission-panel performance-hero">
      <div class="section-head"><div><p class="eyebrow">Objectifs</p><h2>Focus coach</h2></div></div>
      <div class="goal-grid">
        <article class="compact-row"><strong>Semaine</strong><p>${escapeHtml(goals.weeklyGoal || "Aucun objectif de semaine encore.")}</p></article>
        <article class="compact-row"><strong>Trimestre</strong><p>${escapeHtml(goals.quarterlyGoal || "Aucun objectif de trimestre encore.")}</p></article>
        <article class="compact-row"><strong>Rappel hebdo</strong><p>${escapeHtml(goals.weeklyReminder || "Completer la paie et le document de rendement chaque semaine.")}</p></article>
      </div>
      <div class="form-grid compact-form">
        <input id="weeklyGoal" placeholder="Objectif de la semaine" value="${escapeAttr(goals.weeklyGoal || "")}">
        <input id="quarterlyGoal" placeholder="Objectif du trimestre" value="${escapeAttr(goals.quarterlyGoal || "")}">
        <input id="weeklyReminder" class="wide" placeholder="Rappel hebdomadaire" value="${escapeAttr(goals.weeklyReminder || "")}">
        <input id="performanceUrl" class="wide" placeholder="Lien document de rendement" value="${escapeAttr(goals.performanceUrl || "")}">
      </div>
      <div class="actions-row">
        <button id="saveGoalsBtn" class="primary">Enregistrer les objectifs</button>
        ${goals.performanceUrl ? `<a class="button-link" href="${escapeAttr(goals.performanceUrl)}" target="_blank" rel="noopener">Ouvrir rendement</a>` : ""}
      </div>
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Risques coach</p><h2>Clients marques manuellement</h2></div></div>
      ${riskRows.length ? riskRows.slice(0, 8).map((row) => `<article class="compact-row"><strong>${escapeHtml(row.client)} <span class="tag bad">${escapeHtml(row.riskLevel)}</span></strong><p>${escapeHtml(row.riskReasons || "A valider avec le coach")}</p></article>`).join("") : '<div class="empty">Aucun client marque a risque par le coach.</div>'}
      <div class="section-head mini-head"><div><p class="eyebrow">Signaux questionnaire</p><h2>Risques detectes par reponse client</h2></div></div>
      ${questionnaireRiskRows.length ? questionnaireRiskRows.slice(0, 8).map((row) => `<article class="compact-row"><strong>${escapeHtml(row.client_name || row.clientName || "Client non matche")} <span class="tag ${normalizeLower(row.triage_status) === "rouge" ? "bad" : "warn"}">${escapeHtml(row.triage_status || "signal")}</span></strong><p>${escapeHtml(row.open_note || row.pain_status || row.program_fit || "Reponse a analyser")}</p></article>`).join("") : '<div class="empty">Aucun signal rouge/orange provenant du questionnaire.</div>'}
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Impacts</p><h2>Revenus crees</h2></div></div>
      ${impactForm()}
      ${impacts.length ? impacts.slice().reverse().slice(0, 8).map(impactRow).join("") : '<div class="empty">Aucun impact declare.</div>'}
    </section>
  `;
  const saveGoalsButton = document.getElementById("saveGoalsBtn");
  if (saveGoalsButton) saveGoalsButton.addEventListener("click", saveGoals);
  const saveImpactButton = document.getElementById("saveImpactBtn");
  if (saveImpactButton) saveImpactButton.addEventListener("click", saveImpact);
  attachImpactControls();
}

function renderAdmin(data) {
  const counts = data.counts || {};
  els.content.className = "content performance-grid";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero security-panel">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Acces et confidentialite</p>
          <h2>Logins requis avant le deploiement</h2>
          <p>La version publique ne charge plus de donnees client depuis GitHub Pages. Les donnees coach doivent venir d'un backend prive qui valide l'acces avant de retourner les clients, les taches et les reponses questionnaire.</p>
        </div>
      </div>
      <div class="focus-facts security-facts">
        ${focusFact("Statut", "Pilote seulement")}
        ${focusFact("Lecture", "Backend prive")}
        ${focusFact("Ecritures", "Backend protege requis")}
        ${focusFact("Deploiement", "Bloque avant login")}
      </div>
      <div class="focus-note"><strong>Decision obligatoire</strong><p>Avant de donner le lien a tous les coachs, il faut ajouter une vraie couche d'authentification et servir les donnees par coach depuis un backend protege.</p></div>
      <div class="focus-note"><strong>A ne pas faire</strong><p>Un lien GitHub Pages cache, un mot de passe seulement en JavaScript, ou des JSON clients publics ne comptent pas comme securite.</p></div>
    </section>
    <section class="mission-panel performance-hero">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Systeme et mise a jour</p>
          <h2>Etat de la source</h2>
          <p>Les snapshots publics sont desactives. Le dashboard doit lire les donnees depuis le backend Apps Script prive ou le futur backend authentifie.</p>
        </div>
      </div>
      <div class="focus-facts">
        ${focusFact("Coach", data.activeCoach || "-")}
        ${focusFact("Reponses", "Sheet prive backend")}
        ${focusFact("Derniere reconstruction", data.generatedAt || "-")}
        ${focusFact("Clients", counts.clients || 0)}
      </div>
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Procedure</p><h2>Mettre a jour</h2></div></div>
      <div class="focus-note"><strong>CoachRx</strong><p>Le coach utilise encore l'extension pour synchroniser CoachRx. Ensuite, le backend reconstruit les donnees privees du dashboard.</p></div>
      <div class="focus-note"><strong>Questionnaires</strong><p>Le questionnaire GitHub Pages envoie les reponses au Sheet de reception. Le backend dashboard doit matcher par client_phone_normalized avec CORE_Clients et retourner l'inbox privee.</p></div>
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Interface</p><h2>Ce qui reste volontairement discret</h2></div></div>
      <article class="compact-row"><strong>Bouton Systeme</strong><p>La mise a jour, les rappels manuels et la configuration sont retires du flux quotidien pour ne pas distraire le coach.</p></article>
      <article class="compact-row"><strong>Performance separee</strong><p>Retention, turn, alumni et impacts restent dans Performance pour eviter de surcharger la mission du jour.</p></article>
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Prochains chantiers</p><h2>Avant de deployer large</h2></div></div>
      <article class="compact-row"><strong>Login coach</strong><p>Authentifier chaque coach, filtrer ses donnees, et garder un acces admin pour remplacer un coach absent.</p></article>
      <article class="compact-row"><strong>Backend actions</strong><p>Sortir les ecritures de Apps Script pour que Fait, rappels, alumni et impacts soient fiables.</p></article>
      <article class="compact-row"><strong>Inbox questionnaire</strong><p>Retourner questionnaireInbox, questionnaireSendLog et les statuts recu, matche, assigne, lu, action_completee ou erreur.</p></article>
      <article class="compact-row"><strong>Fiche client</strong><p>Ajouter une page detaillee avec historique, notes, objectifs et prochaines actions.</p></article>
    </section>
  `;
}

function loadDemoData() {
  const saved = localStorage.getItem(DEMO_DATA_KEY);
  if (saved) {
    try {
      return rebuildDemoData(JSON.parse(saved));
    } catch (_error) {
      localStorage.removeItem(DEMO_DATA_KEY);
    }
  }
  const fresh = createInitialDemoData();
  saveDemoData(fresh);
  return rebuildDemoData(fresh);
}

function saveDemoData(data) {
  localStorage.setItem(DEMO_DATA_KEY, JSON.stringify(data));
}

function createInitialDemoData() {
  const clients = [
    demoClient("alex-martin", "Alex Martin", "Semi-Prive 2x/sem", -22, 9, "Programme en retard", "62%", 1, "", ""),
    demoClient("camille-roy", "Camille Roy", "Fondation 12 semaines", -49, 35, "Fondation - semaine 8", "88%", 0, "", ""),
    demoClient("julie-simard", "Julie Simard", "Prive 1x/sem", -310, 18, "Programme a preparer", "94%", 0, "", ""),
    demoClient("mathieu-cote", "Mathieu Cote", "Semi-Prive 1x/sem", -180, 126, "Questionnaire a envoyer", "76%", 2, "", ""),
    demoClient("sarah-lavoie", "Sarah Lavoie", "Semi-Prive 2x/sem", -220, 4, "Reponse rouge recue", "38%", 1, "Eleve", "Motivation basse et douleur mentionnee"),
    demoClient("nicolas-gagne", "Nicolas Gagne", "Client externe", -60, 78, "Client externe manuel", "81%", 0, "", ""),
    demoClient("emilie-fortin", "Emilie Fortin", "Semi-Prive 3x/sem", -280, 14, "A rebooker bientot", "91%", 3, "", ""),
    demoClient("benoit-laroche", "Benoit Laroche", "Semi-Prive 1x/sem", -130, 22, "Sur hold", "70%", 0, "", ""),
    demoClient("laura-pelletier", "Laura Pelletier", "Alumni", -500, 210, "Alumni a relancer", "", 0, "", ""),
    demoClient("michael-test", "Michael Test", "Client test", -10, 999, "Test libre", "100%", 0, "", "")
  ];
  clients[0].systemSignal = "Demo: annulations frequentes detectees";
  const tasks = [
    demoTask("task-program-alex", "P1", "Programme", "alex-martin", "Alex Martin", "Preparer le programme en retard", "Programme CoachRx depasse et compliance basse", demoDate(0)),
    demoTask("task-form-sarah", "P1", "Formulaire", "sarah-lavoie", "Sarah Lavoie", "Contacter rapidement", "Questionnaire rouge: douleur + motivation basse", demoDate(0)),
    demoTask("task-rebooking-emilie", "P2", "Rebooking", "emilie-fortin", "Emilie Fortin", "Rebooker les prochaines seances", "Dernieres seances Kilo dans moins de 30 jours", demoDate(5)),
    demoTask("task-form-mathieu", "P2", "Formulaire", "mathieu-cote", "Mathieu Cote", "Envoyer questionnaire", "Aucun questionnaire depuis plus de 3 mois", demoDate(1)),
    demoTask("task-foundation-camille", "P2", "Programme", "camille-roy", "Camille Roy", "Planifier la suite Fondation", "Fin Fondation calculee a 12 semaines", demoDate(15)),
    demoTask("task-hold-benoit", "P3", "Retention", "benoit-laroche", "Benoit Laroche", "Valider retour de hold", "Retour prevu bientot", demoDate(12)),
    demoTask("task-alumni-laura", "P3", "Impact", "laura-pelletier", "Laura Pelletier", "Recontacter alumni", "Opportunite de reactivation", demoDate(3)),
    demoTask("task-validation-nicolas", "P2", "Validation", "nicolas-gagne", "Nicolas Gagne", "Confirmer client externe", "Client absent du CSM mais utile au coach", demoDate(2))
  ];
  const questionnaireInbox = [
    {
      response_id: "demo-response-sarah",
      submitted_at: demoDate(-1),
      client_key: "sarah-lavoie",
      client_name: "Sarah Lavoie",
      client_phone_normalized: "5145550105",
      coach_name: DEMO_COACH,
      triage_status: "rouge",
      coach_action_type: "contacter rapidement",
      dashboard_sync_status: "recu",
      general_state: "Bof",
      motivation_level: "2/10",
      goal_status: "Je me sens loin de mon objectif",
      program_fit: "Trop exigeant cette semaine",
      pain_status: "Douleur epaule droite",
      open_note: "J'aimerais parler au coach avant mon prochain programme."
    },
    {
      response_id: "demo-response-julie",
      submitted_at: demoDate(-6),
      client_key: "julie-simard",
      client_name: "Julie Simard",
      client_phone_normalized: "5145550103",
      coach_name: DEMO_COACH,
      triage_status: "jaune",
      coach_action_type: "valider les ajustements",
      dashboard_sync_status: "recu",
      general_state: "Bien",
      motivation_level: "8/10",
      program_fit: "Bon, mais j'aimerais plus de varietes",
      open_note: "Je veux garder le focus force."
    },
    {
      response_id: "demo-response-unmatched",
      submitted_at: demoDate(-2),
      client_name: "Client mystere",
      client_phone_normalized: "4505559999",
      coach_name: "",
      triage_status: "orange",
      coach_action_type: "planifier une discussion",
      dashboard_sync_status: "recu",
      match_status: "non_matche",
      open_note: "Telephone non reconnu dans CORE_Clients."
    }
  ];
  return {
    activeCoach: DEMO_COACH,
    dashboardUpdatedAt: "Demo locale",
    generatedAt: new Date().toLocaleString("fr-CA"),
    coaches: [{ coach: DEMO_COACH }],
    clients,
    tasks,
    questionnaireInbox,
    questionnaireSendLog: [
      { client: "Mathieu Cote", clientKey: "mathieu-cote", sentAt: demoDate(-8), status: "envoye", note: "Relance demo si pas de reponse." }
    ],
    actionLog: [
      { at: new Date().toLocaleString("fr-CA"), message: "Demo initialisee. Lance un scenario ou clique une action pour alimenter ce journal." }
    ],
    goals: {
      coach: DEMO_COACH,
      weeklyGoal: "Tester le dashboard avec 10 clients fictifs.",
      quarterlyGoal: "Valider les workflows avant Firebase.",
      weeklyReminder: "Noter ce qui est confus ou trop lent.",
      performanceUrl: ""
    },
    v3: {
      holds: [{ clientKey: "benoit-laroche", client: "Benoit Laroche", expectedReturn: demoDate(12), reason: "Voyage / hold temporaire", status: "Sur hold" }],
      alumni: [{ clientKey: "laura-pelletier", client: "Laura Pelletier", nextContactDue: demoDate(3), status: "A recontacter", notes: "Ancienne cliente semi-privee, bonne candidate reactivation." }],
      removedClients: [],
      impacts: {
        log: [{ impactId: "impact-demo-1", client: "Alex Martin", impactType: "Evaluation physique", amount: "99", status: "Demo", impactDate: demoDate(-3), notes: "Impact fictif pour valider la vue performance." }],
        opportunities: []
      }
    }
  };
}

function rebuildDemoData(data) {
  const openTasks = (data.tasks || []).filter((task) => !["fait", "ignore"].includes(normalizeLower(task.status || "")));
  const clients = (data.clients || []).map((client) => {
    const latestQuestionnaire = (data.questionnaireInbox || []).find((row) => cleanValue(row.client_key) === client.clientKey) || null;
    const clientTasks = openTasks.filter((task) => task.clientKey === client.clientKey);
    return Object.assign({}, client, {
      latestQuestionnaireResponse: latestQuestionnaire,
      openTasks: clientTasks.length,
      daysSinceQuestionnaire: latestQuestionnaire ? daysBetween(latestQuestionnaire.submitted_at, demoDate(0)) : client.daysSinceQuestionnaire
    });
  });
  const clientsByKey = new Map(clients.map((client) => [client.clientKey, client]));
  data.clients = clients;
  data.tasks = openTasks.map((task) => Object.assign({}, task, { clientInfo: clientsByKey.get(task.clientKey) || task.clientInfo || {} }));
  data.v3 = Object.assign({ holds: [], alumni: [], removedClients: [], impacts: { log: [], opportunities: [] } }, data.v3 || {});
  data.counts = {
    total: data.tasks.length,
    p1: data.tasks.filter((task) => task.priority === "P1").length,
    p2: data.tasks.filter((task) => task.priority === "P2").length,
    p3: data.tasks.filter((task) => task.priority === "P3").length,
    clients: clients.length
  };
  const serviceEnding30 = clients.filter((client) => {
    const days = daysBetween(demoDate(0), client.serviceEnd);
    return Number.isFinite(days) && days >= 0 && days <= 30;
  }).length;
  const atRisk = clients.filter((client) => isCoachRisk(client.riskLevel)).length;
  data.v3.kpis = {
    clients: clients.length,
    activeClients: clients.filter((client) => normalizeLower(client.activePackage) !== "alumni").length,
    holds: (data.v3.holds || []).length,
    alumni: (data.v3.alumni || []).length,
    atRisk,
    serviceEnding30,
    questionnaireStale: clients.filter(questionnaireIsStale).length,
    impactsWeek: ((data.v3.impacts && data.v3.impacts.log) || []).filter((row) => !normalizeLower(row.status || "").includes("annule")).length,
    retentionRate: 92,
    openTasks: data.tasks.length
  };
  data.v3.retention = clients.map((client) => ({
    clientKey: client.clientKey,
    client: client.client,
    riskLevel: client.riskLevel,
    riskReasons: client.riskReasons,
    serviceEnd: client.serviceEnd,
    segment: normalizeLower(client.activePackage) === "alumni" ? "alumni" : "actif"
  }));
  data.generatedAt = new Date().toLocaleString("fr-CA");
  return data;
}

function demoClient(clientKey, client, activePackage, memberSinceOffset, questionnaireDays, signal, comp30, rebookingTotal, riskLevel, riskReasons) {
  const memberSince = demoDate(memberSinceOffset);
  const isFoundation = normalizeLower(activePackage).includes("fondation");
  return {
    clientKey,
    client,
    coach: DEMO_COACH,
    includeDashboard: "Oui",
    relationStatus: "Actif demo",
    activePackage,
    memberSince,
    membershipEnd: isFoundation ? demoDate(memberSinceOffset + 84) : demoDate(memberSinceOffset + 365),
    plannedExitDate: "",
    plannedExitNote: "",
    attendance30: questionnaireDays < 30 ? "8" : "3",
    lastCheckup: demoDate(-14),
    objective: "Objectif demo: clarifier la prochaine action coach.",
    program: signal,
    signal,
    comp30,
    phone: "514555" + String(1000 + Number(clientKey.length * 7)).slice(-4),
    email: clientKey + "@demo.cfsb",
    rebookingTotal,
    serviceEnd: clientKey === "emilie-fortin" ? demoDate(20) : "",
    riskLevel,
    riskReasons,
    systemSignal: "",
    lastQuestionnaire: questionnaireDays > 365 ? "" : demoDate(-questionnaireDays),
    daysSinceQuestionnaire: questionnaireDays,
    context: {
      longTermSummary: "Plan demo pour valider la fiche client, les taches et les boutons d'action.",
      objectives: "Tester si le coach comprend rapidement quoi faire."
    }
  };
}

function demoTask(taskId, priority, type, clientKey, client, action, why, due) {
  return { taskId, priority, type, clientKey, client, action, why, due, status: "A faire", coach: DEMO_COACH, source: "Demo sandbox" };
}

function demoDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + Number(offsetDays || 0));
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return NaN;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

function mutateDemoData(mutator, message) {
  const data = loadDemoData();
  const before = JSON.stringify(data);
  mutator(data);
  data.actionLog = data.actionLog || [];
  data.actionLog.unshift({
    at: new Date().toLocaleString("fr-CA"),
    message
  });
  data.actionLog = data.actionLog.slice(0, 30);
  const rebuilt = rebuildDemoData(data);
  saveDemoData(rebuilt);
  state.data = rebuilt;
  state.lastUndo = {
    type: "demo",
    snapshot: before,
    message: "Action demo annulee."
  };
  showToast(message, true);
  render();
}

function restoreLastUndo() {
  if (!state.lastUndo) return showToast("Aucune action a annuler.");
  if (state.lastUndo.type === "demo") {
    localStorage.setItem(DEMO_DATA_KEY, state.lastUndo.snapshot);
    state.data = loadDemoData();
    state.lastUndo = null;
    showToast("Action demo annulee.");
    render();
    return;
  }
  if (state.lastUndo.type === "local-hide" && state.lastUndo.taskId) {
    state.localHiddenTaskIds.delete(state.lastUndo.taskId);
    writeStoredArray(LOCAL_TASK_KEY, Array.from(state.localHiddenTaskIds));
    state.lastUndo = null;
    showToast("Tache remise visible.");
    render();
  }
}

function demoSetTaskStatus(taskId, status) {
  mutateDemoData((data) => {
    (data.tasks || []).forEach((task) => {
      if (task.taskId === taskId) task.status = status;
    });
  }, status === "Fait" ? "Tache demo completee." : "Tache masquee en demo.");
}

function demoUpdateQuestionnaireStatus(responseId, status) {
  mutateDemoData((data) => {
    (data.questionnaireInbox || []).forEach((row) => {
      if (row.response_id === responseId) row.dashboard_sync_status = status;
    });
    if (status === "action_completee") {
      data.questionnaireInbox = (data.questionnaireInbox || []).filter((row) => row.response_id !== responseId);
    }
  }, "Questionnaire demo traite.");
}

function demoSendQuestionnaire(client, taskId) {
  mutateDemoData((data) => {
    data.questionnaireSendLog = data.questionnaireSendLog || [];
    data.questionnaireSendLog.push({
      client: client.client,
      clientKey: client.clientKey,
      sentAt: demoDate(0),
      status: "envoye_demo",
      note: "Simulation: aucun SMS envoye."
    });
    if (taskId) {
      (data.tasks || []).forEach((task) => {
        if (task.taskId === taskId) task.status = "Fait";
      });
    }
  }, "Questionnaire demo marque envoye. Aucun SMS envoye.");
}

function demoSendRebookingReminder(client, taskId) {
  mutateDemoData((data) => {
    data.rebookingReminderLog = data.rebookingReminderLog || [];
    data.rebookingReminderLog.push({
      client: client.client,
      clientKey: client.clientKey,
      sentAt: demoDate(0),
      followUpDue: demoDate(7),
      status: "rappel_envoye_demo",
      message: "Simulation: rappel de rebooking envoye."
    });
    if (taskId) {
      (data.tasks || []).forEach((task) => {
        if (task.taskId === taskId) task.status = "Fait";
      });
    }
  }, "Rappel rebooking demo envoye. Suivi dans 7 jours.");
}

function demoSaveServiceEnd(clientKey, clientName, endDate, notes) {
  mutateDemoData((data) => {
    const client = (data.clients || []).find((item) => item.clientKey === clientKey || item.client === clientName);
    if (client) {
      client.serviceEnd = endDate;
      client.serviceEndNotes = notes;
    }
    const days = daysBetween(demoDate(0), endDate);
    if (Number.isFinite(days) && days >= 0 && days <= 30) {
      data.tasks.push(demoTask("task-rebook-" + normalizeName(clientName) + "-" + Date.now(), days <= 14 ? "P1" : "P2", "Rebooking", clientKey || normalizeName(clientName), clientName, "Rebooker les prochaines seances", "Dernieres seances Kilo dans " + days + " jours", endDate));
    }
  }, "Date Kilo demo enregistree.");
}

function demoSaveManualClient(payload) {
  mutateDemoData((data) => {
    const key = normalizeName(payload.client);
    data.clients = (data.clients || []).filter((client) => client.clientKey !== key);
    data.clients.push(Object.assign(demoClient(key, payload.client, payload.activePackage || "Client manuel demo", -1, 999, "Client ajoute manuellement", "", 0, "", ""), {
      phone: payload.phone,
      email: payload.email,
      membershipEnd: payload.membershipEnd,
      objective: payload.objective
    }));
    state.selectedClientKey = key;
    state.showManualClientForm = false;
  }, "Client demo ajoute au dashboard.");
}

function demoSaveEditedClient(clientKey, payload) {
  mutateDemoData((data) => {
    const currentKey = clientKey || normalizeName(payload.client);
    const nextKey = normalizeName(payload.client);
    (data.clients || []).forEach((client) => {
      if (client.clientKey === currentKey) {
        client.clientKey = nextKey;
        client.client = payload.client;
        client.phone = payload.phone;
        client.email = payload.email;
        client.activePackage = payload.activePackage;
        client.membershipEnd = payload.membershipEnd;
        client.plannedExitDate = payload.plannedExitDate;
        client.plannedExitNote = payload.plannedExitNote;
        client.objective = payload.objective;
      }
    });
    (data.tasks || []).forEach((task) => {
      if (task.clientKey === currentKey) {
        task.clientKey = nextKey;
        task.client = payload.client;
      }
    });
    (data.questionnaireInbox || []).forEach((row) => {
      if (cleanValue(row.client_key) === currentKey) {
        row.client_key = nextKey;
        row.client_name = payload.client;
      }
    });
    state.selectedClientKey = nextKey;
    state.editingClientKey = "";
  }, "Client demo modifie.");
}

function demoRemoveClient(clientKey, clientName, destination, note) {
  mutateDemoData((data) => {
    const client = (data.clients || []).find((item) => item.clientKey === clientKey || item.client === clientName) || {};
    data.v3 = Object.assign({ alumni: [], holds: [], removedClients: [] }, data.v3 || {});
    if (destination === "alumni") {
      data.v3.alumni = data.v3.alumni || [];
      data.v3.alumni.push({
        clientKey: clientKey || normalizeName(clientName),
        client: clientName,
        nextContactDue: demoDate(30),
        status: "A prioriser",
        notes: note || "Classe depuis le dashboard client."
      });
    } else if (destination === "hold") {
      data.v3.holds = data.v3.holds || [];
      data.v3.holds.push({
        clientKey: clientKey || normalizeName(clientName),
        client: clientName,
        expectedReturn: "",
        reason: note || "Classe sur hold depuis le dashboard client.",
        status: "Sur hold"
      });
    } else {
      data.v3.removedClients = data.v3.removedClients || [];
      data.v3.removedClients.push({
        clientKey: clientKey || normalizeName(clientName),
        client: clientName,
        status: destination === "error" ? "Erreur / hors liste" : "Retire definitivement",
        notes: note || (client.activePackage ? `Ancien service: ${client.activePackage}` : "")
      });
    }
    data.clients = (data.clients || []).filter((item) => item.clientKey !== clientKey && item.client !== clientName);
    (data.tasks || []).forEach((task) => {
      if (task.clientKey === clientKey || task.client === clientName) task.status = "Ignore";
    });
    state.selectedClientKey = "";
    state.editingClientKey = "";
  }, destination === "alumni" ? "Client classe dans Alumni." : "Client classe et retire du dashboard.");
}

function demoSaveClientRisk(clientKey, clientName, riskLevel, riskNote) {
  mutateDemoData((data) => {
    const client = (data.clients || []).find((item) => item.clientKey === clientKey || item.client === clientName);
    if (client) {
      client.riskLevel = riskLevel;
      client.riskReasons = riskNote;
    }
  }, "Risque demo enregistre.");
}

function demoSaveGoals() {
  mutateDemoData((data) => {
    data.goals = Object.assign({}, data.goals || {}, {
      weeklyGoal: document.getElementById("weeklyGoal").value,
      quarterlyGoal: document.getElementById("quarterlyGoal").value,
      weeklyReminder: document.getElementById("weeklyReminder").value,
      performanceUrl: document.getElementById("performanceUrl").value
    });
  }, "Objectifs demo enregistres.");
}

function demoSaveHold(client) {
  mutateDemoData((data) => {
    data.v3 = data.v3 || {};
    data.v3.holds = data.v3.holds || [];
    const key = normalizeName(client);
    data.v3.holds = data.v3.holds.filter((row) => (row.clientKey || normalizeName(row.client || "")) !== key);
    data.v3.holds.push({
      clientKey: key,
      client,
      expectedReturn: document.getElementById("holdReturn").value,
      reason: document.getElementById("holdReason").value,
      status: "Sur hold demo"
    });
  }, "Hold demo ajoute.");
}

function demoSaveClientHold(clientKey, clientName, expectedReturn, reason) {
  mutateDemoData((data) => {
    data.v3 = data.v3 || {};
    data.v3.holds = data.v3.holds || [];
    const key = clientKey || normalizeName(clientName);
    data.v3.holds = data.v3.holds.filter((row) => (row.clientKey || normalizeName(row.client || "")) !== key);
    data.v3.holds.push({
      clientKey: key,
      client: clientName,
      expectedReturn,
      reason,
      status: "Sur hold demo"
    });
    const client = (data.clients || []).find((item) => item.clientKey === key || item.client === clientName);
    if (client) client.relationStatus = "Sur hold demo";
  }, "Hold client demo enregistre.");
}

function demoClearClientHold(clientKey, clientName) {
  mutateDemoData((data) => {
    data.v3 = data.v3 || {};
    const key = clientKey || normalizeName(clientName);
    data.v3.holds = (data.v3.holds || []).filter((row) => (row.clientKey || normalizeName(row.client || "")) !== key);
    const client = (data.clients || []).find((item) => item.clientKey === key || item.client === clientName);
    if (client) client.relationStatus = "Actif demo";
  }, "Hold client demo retire.");
}

function demoSaveManualTask(title) {
  mutateDemoData((data) => {
    const client = document.getElementById("manualClient").value;
    data.tasks.push(demoTask("task-manual-" + Date.now(), document.getElementById("manualPriority").value, "Suivi client", normalizeName(client), client || "Sans client", title, document.getElementById("manualDetails").value, document.getElementById("manualDue").value));
    els.manualPanel.classList.add("hidden");
  }, "Rappel demo cree.");
}

function demoSaveAlumni(client) {
  mutateDemoData((data) => {
    data.v3 = data.v3 || {};
    data.v3.alumni = data.v3.alumni || [];
    const key = normalizeName(client);
    data.v3.alumni = data.v3.alumni.filter((row) => (row.clientKey || normalizeName(row.client || "")) !== key);
    data.v3.alumni.push({
      clientKey: key,
      client,
      nextContactDue: document.getElementById("alumniNext").value,
      status: "A recontacter",
      reason: document.getElementById("alumniReason").value,
      notes: document.getElementById("alumniNotes").value
    });
  }, "Alumni demo ajoute.");
}

function demoUpdateAlumniStatus(alumniKey, clientName, status) {
  mutateDemoData((data) => {
    data.v3 = data.v3 || {};
    data.v3.alumni = data.v3.alumni || [];
    data.v3.removedClients = data.v3.removedClients || [];
    const key = alumniKey || normalizeName(clientName);
    const row = data.v3.alumni.find((item) => (item.clientKey || normalizeName(item.client || "")) === key) || { clientKey: key, client: clientName };
    if (status === "excluded") {
      data.v3.alumni = data.v3.alumni.filter((item) => (item.clientKey || normalizeName(item.client || "")) !== key);
      data.v3.removedClients.push(Object.assign({}, row, {
        status: "Ne pas recontacter",
        notes: row.notes || "Classe depuis Alumni."
      }));
      return;
    }
    row.status = "Reactive";
    row.notes = row.notes || "Reactive depuis Alumni.";
  }, status === "excluded" ? "Alumni classe a ne pas recontacter." : "Alumni marque reactive.");
}

function demoRestoreAlumni(alumniKey, clientName) {
  mutateDemoData((data) => {
    data.v3 = data.v3 || {};
    data.v3.alumni = data.v3.alumni || [];
    data.v3.removedClients = data.v3.removedClients || [];
    const key = alumniKey || normalizeName(clientName);
    const row = data.v3.removedClients.find((item) => (item.clientKey || normalizeName(item.client || "")) === key) || { clientKey: key, client: clientName };
    data.v3.removedClients = data.v3.removedClients.filter((item) => (item.clientKey || normalizeName(item.client || "")) !== key);
    data.v3.alumni = data.v3.alumni.filter((item) => (item.clientKey || normalizeName(item.client || "")) !== key);
    data.v3.alumni.push(Object.assign({}, row, {
      status: "A recontacter",
      nextContactDue: row.nextContactDue || demoDate(14),
      notes: row.notes || "Remis a travailler depuis les exclus."
    }));
  }, "Alumni remis dans la liste a travailler.");
}

function demoDeleteAlumni(alumniKey, clientName) {
  mutateDemoData((data) => {
    data.v3 = data.v3 || {};
    const key = alumniKey || normalizeName(clientName);
    data.v3.alumni = (data.v3.alumni || []).filter((row) => (row.clientKey || normalizeName(row.client || "")) !== key);
    data.v3.removedClients = (data.v3.removedClients || []).filter((row) => (row.clientKey || normalizeName(row.client || "")) !== key);
  }, "Alumni supprime de la liste demo.");
}

function demoCreateAlumniTask(clientName) {
  mutateDemoData((data) => {
    const key = normalizeName(clientName);
    data.tasks = data.tasks || [];
    data.tasks.push(demoTask("task-alumni-reactivation-" + key + "-" + Date.now(), "P3", "Impact", key, clientName, "Recontacter alumni", "Mission creee depuis la liste alumni", demoDate(3)));
    state.activeView = "mission";
    state.activeMissionFilter = "all";
  }, "Mission alumni demo creee.");
}

function demoSaveImpact() {
  mutateDemoData((data) => {
    data.v3 = data.v3 || {};
    data.v3.impacts = data.v3.impacts || { log: [], opportunities: [] };
    data.v3.impacts.log = data.v3.impacts.log || [];
    const id = "impact-demo-" + Date.now();
    data.v3.impacts.log.push({
      impactId: id,
      client: document.getElementById("impactClient").value,
      impactType: document.getElementById("impactType").value,
      amount: document.getElementById("impactAmount").value,
      status: document.getElementById("impactStatus").value || "Propose",
      impactDate: document.getElementById("impactDate").value || demoDate(0),
      notes: document.getElementById("impactNotes").value
    });
  }, "Impact demo ajoute.");
}

function demoUpdateImpactStatus(impactId, status) {
  mutateDemoData((data) => {
    const rows = data.v3 && data.v3.impacts && data.v3.impacts.log ? data.v3.impacts.log : [];
    rows.forEach((row) => {
      if ((row.impactId || "") === impactId) row.status = status;
    });
  }, status === "Annule" ? "Impact demo annule." : "Impact demo confirme.");
}

function demoDeleteImpact(impactId) {
  mutateDemoData((data) => {
    if (!data.v3 || !data.v3.impacts) return;
    data.v3.impacts.log = (data.v3.impacts.log || []).filter((row) => (row.impactId || "") !== impactId);
  }, "Impact demo supprime.");
}

function demoSaveQuickCapture(note, priority, dueDate) {
  mutateDemoData((data) => {
    const lines = splitQuickCapture(note);
    lines.forEach((line, index) => {
      const client = detectClientFromNote(line, data.clients || []);
      data.tasks = data.tasks || [];
      data.tasks.push(demoTask(
        "task-quick-" + Date.now() + "-" + index,
        priority || "P2",
        "Suivi client",
        client ? client.clientKey : normalizeName(line).slice(0, 40),
        client ? client.client : "A classer",
        line,
        "Cree depuis capture rapide coach.",
        dueDate || demoDate(1)
      ));
    });
    state.activeView = "mission";
    state.activeMissionFilter = "all";
  }, "Capture rapide transformee en mission(s).");
}

function demoApplyScenario(scenarioId) {
  if (!state.isDemo) {
    showToast("Active le mode demo avant de lancer un scenario.");
    return;
  }
  const scenario = demoScenarios().find((item) => item.id === scenarioId);
  if (!scenario) return showToast("Scenario introuvable.");
  mutateDemoData((data) => {
    data.v3 = Object.assign({ holds: [], alumni: [], removedClients: [], impacts: { log: [], opportunities: [] } }, data.v3 || {});
    data.v3.impacts = Object.assign({ log: [], opportunities: [] }, data.v3.impacts || {});
    data.questionnaireInbox = data.questionnaireInbox || [];
    data.questionnaireSendLog = data.questionnaireSendLog || [];
    data.rebookingReminderLog = data.rebookingReminderLog || [];

    if (scenarioId === "program") {
      updateDemoClient(data, "julie-simard", {
        program: "Programme a preparer",
        signal: "Scenario: programme a construire cette semaine.",
        systemSignal: "Programme CoachRx a avancer.",
        membershipEnd: demoDate(55)
      });
      upsertDemoTask(data, demoTask("scenario-program-julie", "P1", "Programme", "julie-simard", "Julie Simard", "Preparer le prochain programme", "Scenario demo: programme a batir avec contexte membership.", demoDate(2)));
      state.activeView = "mission";
      state.activeMissionFilter = "programs";
      state.selectedClientKey = "julie-simard";
    }

    if (scenarioId === "rebooking") {
      updateDemoClient(data, "emilie-fortin", {
        serviceEnd: demoDate(14),
        serviceEndNotes: "Scenario: dernieres seances Kilo planifiees dans 14 jours.",
        rebookingTotal: 3,
        signal: "Scenario: rebooking a activer."
      });
      upsertDemoTask(data, demoTask("scenario-rebooking-emilie", "P1", "Rebooking", "emilie-fortin", "Emilie Fortin", "Envoyer rappel de rebooking", "Scenario demo: dernieres seances dans 14 jours.", demoDate(14)));
      state.activeView = "mission";
      state.activeMissionFilter = "rebookings";
      state.selectedClientKey = "emilie-fortin";
    }

    if (scenarioId === "questionnaire-due") {
      updateDemoClient(data, "mathieu-cote", {
        lastQuestionnaire: demoDate(-125),
        daysSinceQuestionnaire: 125,
        signal: "Scenario: aucun questionnaire recent."
      });
      upsertDemoTask(data, demoTask("scenario-form-mathieu", "P2", "Formulaire", "mathieu-cote", "Mathieu Cote", "Envoyer questionnaire de suivi", "Scenario demo: aucun questionnaire depuis plus de 3 mois.", demoDate(1)));
      state.activeView = "mission";
      state.activeMissionFilter = "forms";
      state.selectedClientKey = "mathieu-cote";
    }

    if (scenarioId === "questionnaire-red") {
      updateDemoClient(data, "sarah-lavoie", {
        riskLevel: "Eleve",
        riskReasons: "Coach a marque le client a risque apres la reponse rouge.",
        signal: "Scenario: reponse questionnaire prioritaire."
      });
      upsertQuestionnaireResponse(data, {
        response_id: "scenario-response-sarah-red",
        submitted_at: demoDate(0),
        client_key: "sarah-lavoie",
        client_name: "Sarah Lavoie",
        client_phone_normalized: "8195550105",
        triage_status: "rouge",
        coach_action_type: "contacter rapidement",
        dashboard_sync_status: "recu",
        general_state: "fatigue elevee",
        motivation_level: "2",
        pain_status: "douleur genou",
        open_note: "Scenario demo: la cliente demande un contact rapide."
      });
      upsertDemoTask(data, demoTask("scenario-form-red-sarah", "P1", "Formulaire", "sarah-lavoie", "Sarah Lavoie", "Contacter rapidement", "Scenario demo: reponse rouge recue.", demoDate(0)));
      state.activeView = "questionnaires";
      state.activeQuestionnaireFilter = "urgent";
      state.selectedClientKey = "sarah-lavoie";
    }

    if (scenarioId === "membership-end") {
      updateDemoClient(data, "camille-roy", {
        membershipEnd: demoDate(25),
        signal: "Scenario: membership dans moins de 30 jours.",
        systemSignal: "Alerte retention: fin membership proche."
      });
      upsertDemoTask(data, demoTask("scenario-membership-camille", "P2", "Retention", "camille-roy", "Camille Roy", "Valider suite du membership", "Scenario demo: fin membership systeme dans 25 jours.", demoDate(10)));
      state.activeView = "clients";
      state.clientSort = "membershipEnd";
      localStorage.setItem("cfsbCoachClientSort", "membershipEnd");
      state.selectedClientKey = "camille-roy";
    }

    if (scenarioId === "planned-exit") {
      updateDemoClient(data, "alex-martin", {
        plannedExitDate: demoDate(21),
        plannedExitNote: "Scenario: le client a mentionne vouloir arreter plus tot.",
        riskLevel: "Moyen",
        riskReasons: "Le coach veut surveiller une intention de depart.",
        signal: "Scenario: fin prevue coach a clarifier."
      });
      upsertDemoTask(data, demoTask("scenario-exit-alex", "P1", "Retention", "alex-martin", "Alex Martin", "Clarifier intention de depart", "Scenario demo: fin prevue coach dans 21 jours.", demoDate(3)));
      state.activeView = "clients";
      state.clientSort = "risk";
      localStorage.setItem("cfsbCoachClientSort", "risk");
      state.selectedClientKey = "alex-martin";
    }

    if (scenarioId === "hold") {
      data.v3.holds = (data.v3.holds || []).filter((row) => row.clientKey !== "benoit-laroche");
      data.v3.holds.push({
        clientKey: "benoit-laroche",
        client: "Benoit Laroche",
        expectedReturn: demoDate(7),
        reason: "Scenario: hold temporaire entre par admin.",
        status: "Sur hold demo"
      });
      updateDemoClient(data, "benoit-laroche", {
        relationStatus: "Sur hold demo",
        signal: "Scenario: retour de hold bientot."
      });
      upsertDemoTask(data, demoTask("scenario-hold-benoit", "P2", "Retention", "benoit-laroche", "Benoit Laroche", "Preparer retour de hold", "Scenario demo: retour prevu dans 7 jours.", demoDate(6)));
      state.activeView = "clients";
      state.selectedClientKey = "benoit-laroche";
    }

    if (scenarioId === "alumni") {
      data.v3.alumni = (data.v3.alumni || []).filter((row) => row.clientKey !== "laura-pelletier");
      data.v3.alumni.push({
        clientKey: "laura-pelletier",
        client: "Laura Pelletier",
        nextContactDue: demoDate(2),
        status: "A recontacter",
        notes: "Scenario: ancienne cliente qui pourrait revenir en semi-prive."
      });
      upsertDemoTask(data, demoTask("scenario-alumni-laura", "P3", "Impact", "laura-pelletier", "Laura Pelletier", "Recontacter alumni", "Scenario demo: opportunite de reactivation.", demoDate(2)));
      state.activeView = "alumni";
      state.selectedClientKey = "laura-pelletier";
    }

    if (scenarioId === "impact") {
      data.v3.impacts.log = (data.v3.impacts.log || []).filter((row) => row.impactId !== "scenario-impact-alex");
      data.v3.impacts.log.push({
        impactId: "scenario-impact-alex",
        client: "Alex Martin",
        impactType: "Evaluation physique",
        amount: "99",
        status: "Scenario demo",
        impactDate: demoDate(0),
        notes: "Scenario: impact cree apres discussion avec le client."
      });
      upsertDemoTask(data, demoTask("scenario-impact-alex", "P2", "Impact", "alex-martin", "Alex Martin", "Faire suivi apres impact", "Scenario demo: upsell ou evaluation physique a conclure.", demoDate(1)));
      state.activeView = "performance";
      state.selectedClientKey = "alex-martin";
    }
  }, `${scenario.title} pret a tester.`);
}

function updateDemoClient(data, clientKey, patch) {
  const client = (data.clients || []).find((item) => item.clientKey === clientKey);
  if (client) Object.assign(client, patch);
}

function upsertDemoTask(data, nextTask) {
  data.tasks = data.tasks || [];
  const index = data.tasks.findIndex((task) => task.taskId === nextTask.taskId);
  if (index >= 0) {
    data.tasks[index] = Object.assign({}, data.tasks[index], nextTask, { status: "" });
    return;
  }
  data.tasks.push(Object.assign({}, nextTask, { status: "" }));
}

function upsertQuestionnaireResponse(data, response) {
  data.questionnaireInbox = data.questionnaireInbox || [];
  const index = data.questionnaireInbox.findIndex((row) => row.response_id === response.response_id);
  if (index >= 0) {
    data.questionnaireInbox[index] = Object.assign({}, data.questionnaireInbox[index], response);
    return;
  }
  data.questionnaireInbox.push(response);
}

function splitQuickCapture(note) {
  return String(note || "")
    .split(/\n|;|(?:\s+-\s+)/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function detectClientFromNote(note, clients) {
  const value = normalizeLower(note);
  return (clients || []).find((client) => {
    const name = normalizeLower(client.client || "");
    if (!name) return false;
    const parts = name.split(/\s+/).filter((part) => part.length > 2);
    return value.includes(name) || parts.some((part) => value.includes(part));
  }) || null;
}

async function updateTask(taskId, rowNumber, status) {
  if (state.isDemo) {
    demoSetTaskStatus(taskId, status);
    return;
  }
  try {
    await callApi("setTaskStatus", { taskId, rowNumber, status });
    showToast("Statut enregistre.");
    loadData(false);
  } catch (error) {
    if (["Fait", "Ignore"].includes(status) && taskId) {
      state.localHiddenTaskIds.add(taskId);
      writeStoredArray(LOCAL_TASK_KEY, Array.from(state.localHiddenTaskIds));
      state.lastUndo = { type: "local-hide", taskId };
      showToast("Action masquee localement. Le backend live reste a connecter.", true);
      render();
      return;
    }
    renderError(error);
  }
}

async function updateQuestionnaireStatus(responseId, status) {
  if (state.isDemo) {
    demoUpdateQuestionnaireStatus(responseId, status);
    return;
  }
  if (!responseId) return showToast("Reponse questionnaire introuvable.");
  try {
    const response = await callApi("updateQuestionnaireStatus", { responseId, status });
    state.data = response.result || state.data;
    showToast(status === "action_completee" ? "Questionnaire marque traite." : "Questionnaire mis a jour.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function sendQuestionnaire(clientKey, clientName, taskId) {
  const clients = (state.data && state.data.clients) || [];
  const client = clients.find((item) => item.clientKey === clientKey)
    || clients.find((item) => normalizeLower(item.client) === normalizeLower(clientName));
  if (!client) return showToast("Client introuvable.");
  if (state.isDemo) {
    demoSendQuestionnaire(client, taskId);
    return;
  }
  const phone = cleanValue(client.phone);
  const phoneDigits = normalizePhoneDigits(phone);
  if (!phoneDigits) {
    showToast("Telephone requis pour envoyer le questionnaire.");
    return;
  }
  const confirmed = window.confirm([
    "Envoyer le questionnaire a ce client?",
    "",
    client.client || clientName || "Client",
    phone,
    "",
    "Le contact sera valide par telephone dans GoHighLevel."
  ].join("\n"));
  if (!confirmed) return;
  showToast("Envoi du questionnaire en cours...");
  try {
    const response = await callApi("sendQuestionnaire", {
      coach: state.activeCoach,
      clientKey: client.clientKey,
      client: client.client,
      phone,
      phoneNormalized: phoneDigits,
      email: "",
      taskId
    });
    if (taskId) await callApi("setTaskStatus", { taskId, status: "Fait" }).catch(() => null);
    state.data = response.result || state.data;
    showToast("Questionnaire envoye. Verifie la reception et le journal d'envoi.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function sendRebookingReminder(clientKey, clientName, taskId) {
  const clients = (state.data && state.data.clients) || [];
  const client = clients.find((item) => item.clientKey === clientKey)
    || clients.find((item) => normalizeLower(item.client) === normalizeLower(clientName));
  if (!client) return showToast("Client introuvable.");
  if (state.isDemo) {
    demoSendRebookingReminder(client, taskId);
    return;
  }
  try {
    const response = await callApi("sendRebookingReminder", {
      coach: state.activeCoach,
      clientKey: client.clientKey,
      client: client.client,
      phone: client.phone,
      email: client.email,
      taskId,
      followUpDays: 7
    });
    if (taskId) await callApi("setTaskStatus", { taskId, status: "Fait" }).catch(() => null);
    state.data = response.result || state.data;
    showToast("Rappel rebooking envoye.");
    render();
  } catch (error) {
    if (taskId) {
      state.localHiddenTaskIds.add(taskId);
      writeStoredArray(LOCAL_TASK_KEY, Array.from(state.localHiddenTaskIds));
      state.lastUndo = { type: "local-hide", taskId };
      showToast("Rappel a brancher au backend. Tache masquee localement pour le test.", true);
      render();
      return;
    }
    renderError(error);
  }
}

async function saveClientServiceEnd(clientKey, clientName) {
  const endDate = document.getElementById("clientServiceEndDate") ? document.getElementById("clientServiceEndDate").value : "";
  const notes = document.getElementById("clientServiceEndNote") ? document.getElementById("clientServiceEndNote").value : "";
  if (!clientName) return showToast("Client introuvable.");
  if (!endDate) return showToast("Ajoute la date des dernieres seances Kilo.");
  if (state.isDemo) {
    demoSaveServiceEnd(clientKey, clientName, endDate, notes);
    return;
  }
  try {
    const response = await callApi("saveServiceEnd", {
      coach: state.activeCoach,
      clientKey,
      client: clientName,
      serviceType: "Seances Kilo planifiees",
      endDate,
      source: "Manuel coach",
      notes,
      status: "Actif"
    });
    state.data = response.result || state.data;
    showToast("Date Kilo enregistree.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function saveManualClient() {
  const payload = {
    client: ((document.getElementById("manualClientName") || {}).value || "").trim(),
    phone: ((document.getElementById("manualClientPhone") || {}).value || "").trim(),
    email: ((document.getElementById("manualClientEmail") || {}).value || "").trim(),
    activePackage: ((document.getElementById("manualClientPackage") || {}).value || "").trim(),
    membershipEnd: ((document.getElementById("manualClientMembershipEnd") || {}).value || "").trim(),
    objective: ((document.getElementById("manualClientObjective") || {}).value || "").trim(),
    coach: state.activeCoach || ""
  };
  if (!payload.client) return showToast("Entre au minimum le nom du client.");
  if (state.isDemo) {
    demoSaveManualClient(payload);
    return;
  }
  try {
    const response = await callApi("saveManualClient", payload);
    state.data = response.result || state.data;
    state.showManualClientForm = false;
    state.selectedClientKey = normalizeName(payload.client);
    showToast("Client ajoute au dashboard.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function saveEditedClient(clientKey) {
  const payload = {
    client: ((document.getElementById("editClientName") || {}).value || "").trim(),
    phone: ((document.getElementById("editClientPhone") || {}).value || "").trim(),
    email: ((document.getElementById("editClientEmail") || {}).value || "").trim(),
    activePackage: ((document.getElementById("editClientPackage") || {}).value || "").trim(),
    membershipEnd: ((document.getElementById("editClientMembershipEnd") || {}).value || "").trim(),
    plannedExitDate: ((document.getElementById("editClientPlannedExit") || {}).value || "").trim(),
    plannedExitNote: ((document.getElementById("editClientExitNote") || {}).value || "").trim(),
    objective: ((document.getElementById("editClientObjective") || {}).value || "").trim(),
    coach: state.activeCoach || ""
  };
  if (!payload.client) return showToast("Entre au minimum le nom du client.");
  if (state.isDemo) {
    demoSaveEditedClient(clientKey, payload);
    return;
  }
  try {
    const response = await callApi("saveManualClient", Object.assign({}, payload, { clientKey }));
    state.data = response.result || state.data;
    state.editingClientKey = "";
    state.selectedClientKey = normalizeName(payload.client);
    showToast("Client mis a jour.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function removeClientFromDashboard(clientKey, clientName) {
  if (!clientName) return showToast("Client introuvable.");
  const destination = ((document.getElementById("clientRemoveDestination") || {}).value || "alumni").trim();
  const note = ((document.getElementById("clientRemoveNote") || {}).value || "").trim();
  if (state.isDemo) {
    demoRemoveClient(clientKey, clientName, destination, note);
    return;
  }
  try {
    const response = await callApi("removeClientFromDashboard", {
      coach: state.activeCoach,
      clientKey,
      client: clientName,
      destination,
      note
    });
    state.data = response.result || state.data;
    state.selectedClientKey = "";
    showToast("Client retire du dashboard.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function createAlumniTask(clientName) {
  if (!clientName) return showToast("Alumni introuvable.");
  if (state.isDemo) {
    demoCreateAlumniTask(clientName);
    return;
  }
  try {
    const response = await callApi("createManualTask", {
      coach: state.activeCoach,
      client: clientName,
      priority: "P3",
      title: "Recontacter alumni",
      details: "Mission creee depuis la liste alumni.",
      createdBy: "GitHub app"
    });
    state.data = response.result || state.data;
    showToast("Mission alumni creee.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function updateAlumniStatus(alumniKey, clientName, status) {
  if (!clientName && !alumniKey) return showToast("Alumni introuvable.");
  if (state.isDemo) {
    demoUpdateAlumniStatus(alumniKey, clientName, status);
    return;
  }
  try {
    const response = await callApi("updateAlumniStatus", {
      coach: state.activeCoach,
      alumniKey,
      client: clientName,
      status
    });
    state.data = response.result || state.data;
    showToast("Alumni mis a jour.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function deleteAlumni(alumniKey, clientName) {
  if (!clientName && !alumniKey) return showToast("Alumni introuvable.");
  if (state.isDemo) {
    demoDeleteAlumni(alumniKey, clientName);
    return;
  }
  try {
    const response = await callApi("deleteAlumni", {
      coach: state.activeCoach,
      alumniKey,
      client: clientName
    });
    state.data = response.result || state.data;
    showToast("Alumni supprime.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function restoreAlumni(alumniKey, clientName) {
  if (!clientName && !alumniKey) return showToast("Alumni introuvable.");
  if (state.isDemo) {
    demoRestoreAlumni(alumniKey, clientName);
    return;
  }
  try {
    const response = await callApi("restoreAlumni", {
      coach: state.activeCoach,
      alumniKey,
      client: clientName
    });
    state.data = response.result || state.data;
    showToast("Alumni remis a travailler.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function saveClientRisk(clientKey, clientName) {
  const riskLevel = document.getElementById("clientRiskLevel") ? document.getElementById("clientRiskLevel").value : "Aucun";
  const riskNote = document.getElementById("clientRiskNote") ? document.getElementById("clientRiskNote").value : "";
  if (!clientName) return showToast("Client introuvable.");
  if (state.isDemo) {
    demoSaveClientRisk(clientKey, clientName, riskLevel, riskNote);
    return;
  }
  try {
    const response = await callApi("saveClientRisk", {
      coach: state.activeCoach,
      clientKey,
      client: clientName,
      riskLevel,
      riskNote,
      updatedBy: "Coach"
    });
    state.data = response.result || state.data;
    showToast("Risque coach enregistre.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function saveGoals() {
  if (state.isDemo) {
    demoSaveGoals();
    return;
  }
  try {
    const response = await callApi("saveGoals", {
      coach: state.activeCoach,
      weeklyGoal: document.getElementById("weeklyGoal").value,
      quarterlyGoal: document.getElementById("quarterlyGoal").value,
      weeklyReminder: document.getElementById("weeklyReminder").value,
      performanceUrl: document.getElementById("performanceUrl").value
    });
    state.data = response.result || state.data;
    showToast("Objectifs enregistres.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function saveHold() {
  const client = document.getElementById("holdClient").value.trim();
  if (!client) return showToast("Ajoute le client sur hold.");
  if (state.isDemo) {
    demoSaveHold(client);
    return;
  }
  try {
    const response = await callApi("saveHold", {
      coach: state.activeCoach,
      client,
      expectedReturn: document.getElementById("holdReturn").value,
      reason: document.getElementById("holdReason").value,
      reminderPreference: document.getElementById("holdReminder").value
    });
    state.data = response.result || state.data;
    showToast("Hold enregistre.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function saveClientHold(clientKey, clientName) {
  const expectedReturn = ((document.getElementById("clientHoldReturn") || {}).value || "").trim();
  const reason = ((document.getElementById("clientHoldReason") || {}).value || "").trim();
  if (!clientName) return showToast("Client introuvable.");
  if (state.isDemo) {
    demoSaveClientHold(clientKey, clientName, expectedReturn, reason);
    return;
  }
  try {
    const response = await callApi("saveHold", {
      coach: state.activeCoach,
      clientKey,
      client: clientName,
      expectedReturn,
      reason,
      reminderPreference: "Rappel 7 jours avant",
      source: "Fiche client"
    });
    state.data = response.result || state.data;
    showToast("Hold client enregistre.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function clearClientHold(clientKey, clientName) {
  if (!clientName && !clientKey) return showToast("Client introuvable.");
  if (state.isDemo) {
    demoClearClientHold(clientKey, clientName);
    return;
  }
  try {
    const response = await callApi("clearHold", {
      coach: state.activeCoach,
      clientKey,
      client: clientName
    });
    state.data = response.result || state.data;
    showToast("Hold client retire.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function saveManualTask() {
  const title = document.getElementById("manualTitle").value.trim();
  if (!title) return showToast("Ajoute le rappel.");
  if (state.isDemo) {
    demoSaveManualTask(title);
    return;
  }
  await callApi("createManualTask", {
    coach: state.activeCoach,
    client: document.getElementById("manualClient").value,
    dueDate: document.getElementById("manualDue").value,
    priority: document.getElementById("manualPriority").value,
    title,
    details: document.getElementById("manualDetails").value,
    createdBy: "GitHub app"
  });
  els.manualPanel.classList.add("hidden");
  showToast("Rappel cree.");
  loadData(false);
}

async function saveQuickCapture() {
  const note = ((document.getElementById("quickCaptureText") || {}).value || "").trim();
  const priority = ((document.getElementById("quickCapturePriority") || {}).value || "P2").trim();
  const dueDate = ((document.getElementById("quickCaptureDue") || {}).value || "").trim();
  if (!note) return showToast("Ajoute une note ou une transcription.");
  if (state.isDemo) {
    demoSaveQuickCapture(note, priority, dueDate);
    return;
  }
  try {
    const response = await callApi("createTasksFromNote", {
      coach: state.activeCoach,
      note,
      priority,
      dueDate,
      source: "Capture rapide coach"
    });
    state.data = response.result || state.data;
    showToast("Capture rapide envoyee au backend.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function saveAlumni() {
  const client = document.getElementById("alumniClient").value.trim();
  if (!client) return showToast("Ajoute le nom de l'alumni.");
  if (state.isDemo) {
    demoSaveAlumni(client);
    return;
  }
  await callApi("saveAlumni", {
    coach: state.activeCoach,
    client,
    reason: document.getElementById("alumniReason").value,
    nextContactDue: document.getElementById("alumniNext").value,
    notes: document.getElementById("alumniNotes").value
  });
  showToast("Alumni enregistre.");
  loadData(false);
}

async function saveImpact() {
  if (state.isDemo) {
    demoSaveImpact();
    return;
  }
  await callApi("saveImpact", {
    coach: state.activeCoach,
    client: document.getElementById("impactClient").value,
    impactType: document.getElementById("impactType").value,
    amount: document.getElementById("impactAmount").value,
    impactDate: document.getElementById("impactDate").value,
    status: document.getElementById("impactStatus").value,
    notes: document.getElementById("impactNotes").value
  });
  showToast("Impact enregistre.");
  loadData(false);
}

async function updateImpactStatus(impactId, status) {
  if (!impactId) return showToast("Impact introuvable.");
  if (state.isDemo) {
    demoUpdateImpactStatus(impactId, status);
    return;
  }
  try {
    const response = await callApi("updateImpactStatus", {
      coach: state.activeCoach,
      impactId,
      status
    });
    state.data = response.result || state.data;
    showToast("Impact mis a jour.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function deleteImpact(impactId) {
  if (!impactId) return showToast("Impact introuvable.");
  if (state.isDemo) {
    demoDeleteImpact(impactId);
    return;
  }
  try {
    const response = await callApi("deleteImpact", {
      coach: state.activeCoach,
      impactId
    });
    state.data = response.result || state.data;
    showToast("Impact supprime.");
    render();
  } catch (error) {
    renderError(error);
  }
}

function renderError(error) {
  els.content.className = "content";
  const diagnosticUrl = state.apiUrl + "?api=coach-app&action=getData&coach=" + encodeURIComponent(state.activeCoach || "Marc-Andre Menard") + "&callback=cb";
  els.content.innerHTML = `
    <div class="error">
      <p><strong>Connexion backend a verifier.</strong></p>
      <p>${escapeHtml(error.message || String(error))}</p>
      <p class="muted">Si le diagnostic ouvre du texte qui commence par <code>cb(</code>, le backend fonctionne. Si le dashboard ne charge toujours pas, le plus probable est un PIN different ou une extension Chrome qui bloque script.google.com.</p>
      <div class="actions-row" style="justify-content:center">
        <button class="primary" id="retryOfficialBackend">Reessayer endpoint officiel</button>
        <button id="resetPrivateLogin">Changer le PIN</button>
        <a class="button-link" id="openBackendDiagnostic" href="${escapeAttr(diagnosticUrl)}" target="_blank" rel="noopener">Ouvrir diagnostic backend</a>
      </div>
    </div>`;
  const retry = document.getElementById("retryOfficialBackend");
  if (retry) retry.addEventListener("click", () => {
    state.apiUrl = DEFAULT_API_URL;
    localStorage.setItem("cfsbCoachApiUrl", DEFAULT_API_URL);
    loadData(false);
  });
  const reset = document.getElementById("resetPrivateLogin");
  if (reset) reset.addEventListener("click", () => {
    state.appPin = "";
    localStorage.removeItem("cfsbCoachAppPin");
    renderPrivateGate();
  });
}

function showToast(message, canUndo) {
  els.toast.innerHTML = `${escapeHtml(message)}${canUndo ? ' <button type="button" data-undo-last="true">Annuler</button>' : ""}`;
  els.toast.style.display = "block";
  window.clearTimeout(window.__toastTimer);
  window.__toastTimer = window.setTimeout(() => {
    els.toast.style.display = "none";
  }, canUndo ? 7000 : 2600);
}

function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_error) {
    return [];
  }
}

function writeStoredArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function cleanValue(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeLower(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeName(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePhoneDigits(value) {
  const digits = cleanValue(value).replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
