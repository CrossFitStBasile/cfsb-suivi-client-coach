const DEPLOYMENT_ID = "AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ";
const DEFAULT_API_URL = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;
const DEFAULT_AUTHUSER = "0";
const LOCAL_TASK_KEY = "cfsbCoachLocalHiddenTasks";
const DEMO_DATA_KEY = "cfsbCoachDemoData";
const DEMO_MODE_KEY = "cfsbCoachDemoMode";
const DEMO_COACH = "Coach Test CFSB";
const FALLBACK_COACHES = [
  "Marc-Andre Menard",
  "Camille Proulx",
  "David Olivier",
  "Gabriel Mayer Bedard",
  "Hugo Lelievre",
  "Iheb Yahyaoui",
  "Raphael Samson"
];
const ALLOWED_COACH_KEYS = new Set(FALLBACK_COACHES.map(coachKey));
const COACH_RX_TEAM_LINKS = [
  ["Marc-Andre Menard", "15935", "https://dashboard.coachrx.app/team/15935/clients"],
  ["Camille Proulx", "17242", "https://dashboard.coachrx.app/team/17242/clients"],
  ["David Olivier", "15902", "https://dashboard.coachrx.app/team/15902/clients"],
  ["Gabriel Mayer Bedard", "15893", "https://dashboard.coachrx.app/team/15893/clients"],
  ["Hugo Lelievre", "15937", "https://dashboard.coachrx.app/team/15937/clients"],
  ["Iheb Yahyaoui", "15928", "https://dashboard.coachrx.app/team/15928/clients"],
  ["Raphael Samson", "15936", "https://dashboard.coachrx.app/team/15936/clients"]
];
const FETCH_TIMEOUT_MS = 90000;
const JSONP_TIMEOUT_MS = 90000;
const LOADING_TIMEOUT_MS = 100000;
const QUESTIONNAIRE_LIVE_ENABLED = true;

const state = {
  apiUrl: normalizeApiUrl(localStorage.getItem("cfsbCoachApiUrl") || DEFAULT_API_URL),
  appPin: localStorage.getItem("cfsbCoachAppPin") || "",
  isDemo: localStorage.getItem(DEMO_MODE_KEY) === "true",
  activeView: normalizeView(localStorage.getItem("cfsbCoachView") || "mission"),
  activeMissionFilter: "all",
  activeQuestionnaireFilter: "all",
  performanceRange: localStorage.getItem("cfsbCoachPerformanceRange") || "30",
  clientSort: localStorage.getItem("cfsbCoachClientSort") || "actions",
  activeCoach: localStorage.getItem("cfsbCoachName") || "",
  selectedClientKey: "",
  modalClientKey: "",
  editingClientKey: "",
  showManualClientForm: false,
  data: null,
  sourceMode: "Backend prive",
  lastUndo: null,
  loadingSeq: 0,
  loadingTimer: null,
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
  systemPanel: document.getElementById("systemPanel"),
  clientModal: document.getElementById("clientModal")
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
    if (sendQuestionnaireButton.disabled) return;
    sendQuestionnaire(
      sendQuestionnaireButton.dataset.clientKey || "",
      sendQuestionnaireButton.dataset.clientName || "",
      sendQuestionnaireButton.dataset.taskId || ""
    );
  }
  const sendQuestionnaireForResponse = event.target.closest("[data-send-questionnaire-client]");
  if (sendQuestionnaireForResponse) {
    if (sendQuestionnaireForResponse.disabled) return;
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
  const rebookingStatusButton = event.target.closest("[data-rebooking-status]");
  if (rebookingStatusButton) {
    updateRebookingStatus({
      cancellationId: rebookingStatusButton.dataset.cancellationId || "",
      clientKey: rebookingStatusButton.dataset.clientKey || "",
      client: rebookingStatusButton.dataset.clientName || "",
      status: rebookingStatusButton.dataset.rebookingStatus || "GERE"
    });
  }
  const undoButton = event.target.closest("[data-undo-last]");
  if (undoButton) restoreLastUndo();
  const scenarioButton = event.target.closest("[data-scenario-id]");
  if (scenarioButton) {
    demoApplyScenario(scenarioButton.dataset.scenarioId || "");
  }
  const performanceButton = event.target.closest("[data-performance-range]");
  if (performanceButton) {
    state.performanceRange = performanceButton.dataset.performanceRange || "30";
    localStorage.setItem("cfsbCoachPerformanceRange", state.performanceRange);
    render();
  }
});

document.addEventListener("change", (event) => {
  const performanceSelect = event.target.closest("[data-performance-range-select]");
  if (performanceSelect) {
    state.performanceRange = performanceSelect.value || "30";
    localStorage.setItem("cfsbCoachPerformanceRange", state.performanceRange);
    render();
  }
});

bindClick("refreshBtn", () => loadData(false, true));
bindClick("demoModeBtn", startDemoMode);
bindClick("exitDemoBtn", exitDemoMode);
bindClick("resetDemoBtn", resetDemoMode);
bindClick("systemToggleBtn", toggleSystemPanel);
bindClick("closeSystemBtn", closeSystemPanel);
bindClick("settingsBtn", () => {
  document.getElementById("apiUrlInput").value = state.apiUrl;
  document.getElementById("appPinInput").value = state.appPin;
  els.systemPanel.classList.remove("hidden");
  els.settingsPanel.classList.toggle("hidden");
});
bindClick("closeSettingsBtn", () => els.settingsPanel.classList.add("hidden"));
bindClick("saveSettingsBtn", saveSettings);
bindClick("addTaskBtn", () => {
  els.systemPanel.classList.remove("hidden");
  els.manualPanel.classList.remove("hidden");
});
bindClick("cancelManualBtn", () => els.manualPanel.classList.add("hidden"));
bindClick("closeManualPanelBtn", () => els.manualPanel.classList.add("hidden"));
bindClick("saveManualBtn", saveManualTask);
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

function bindClick(id, handler) {
  const element = document.getElementById(id);
  if (element) element.addEventListener("click", handler);
}

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

function exitDemoMode() {
  state.isDemo = false;
  state.activeCoach = "";
  state.selectedClientKey = "";
  localStorage.removeItem(DEMO_MODE_KEY);
  localStorage.removeItem("cfsbCoachName");
  closeSystemPanel();
  showToast("Mode reel active. Chargement des coachs...");
  loadData(false, true);
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
  const loadId = startLoading(rebuild ? "Reconstruction du dashboard..." : "Connexion au backend prive...");
  if (state.isDemo) {
    state.data = loadDemoData();
    state.activeCoach = DEMO_COACH;
    state.sourceMode = "Sandbox local";
    localStorage.setItem("cfsbCoachName", DEMO_COACH);
    finishLoading(loadId);
    render();
    if (notify) showToast("Mode demo recharge.");
    return;
  }
  if (!state.appPin) {
    state.data = null;
    finishLoading(loadId);
    renderPrivateGate();
    return;
  }
  try {
    const response = await callApi(rebuild ? "rebuild" : "getData", {});
    if (loadId !== state.loadingSeq) return;
    state.data = response.result;
    state.sourceMode = "Backend prive";
    if (!state.activeCoach) {
      state.activeCoach = state.data.activeCoach || "";
      localStorage.setItem("cfsbCoachName", state.activeCoach);
    }
    finishLoading(loadId);
    render();
  } catch (error) {
    if (loadId !== state.loadingSeq) return;
    finishLoading(loadId);
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
  return callApiFetchWithUrl(apiUrl, action, payload)
    .catch((fetchError) => callApiJsonpWithUrl(apiUrl, action, payload)
      .catch(() => {
        throw explainApiError(fetchError);
      }));
}

function explainApiError(error) {
  const message = (error && error.message) || String(error || "");
  const name = (error && error.name) || "";
  if (name === "AbortError" || /aborted|abort/i.test(message)) {
    return new Error("Le backend Apps Script a commence a charger, mais il n'a pas repondu avant 90 secondes. Clique Mettre a jour une fois. Si ca revient, il faut optimiser l'action getData cote Apps Script ou utiliser une source cachee plus legere.");
  }
  return error;
}

function callApiFetchWithUrl(apiUrl, action, payload) {
  const params = buildApiParams(action, payload);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(apiUrl + "?" + params.toString(), {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    redirect: "follow",
    signal: controller.signal
  })
    .finally(() => window.clearTimeout(timer))
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
    });
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
      reject(new Error("Le chargement a depasse 90 secondes. Essaie Mettre a jour; si ca revient souvent, il faudra optimiser le backend Apps Script."));
    }, JSONP_TIMEOUT_MS);
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

function renderLoading(message) {
  els.content.className = "content";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Chargement</p>
          <h2>${escapeHtml(message)}</h2>
          <p>Le dashboard lit les donnees privees dans Apps Script. Le premier chargement peut prendre jusqu'a 90 secondes si Apps Script reconstruit les donnees.</p>
        </div>
        <button class="primary" type="button" onclick="loadData(false, true)">Reessayer</button>
      </div>
    </section>`;
}

function startLoading(message) {
  state.loadingSeq += 1;
  const loadId = state.loadingSeq;
  window.clearTimeout(state.loadingTimer);
  renderLoading(message);
  state.loadingTimer = window.setTimeout(() => {
    if (loadId !== state.loadingSeq) return;
    renderError(new Error("Le backend ne repond pas apres 100 secondes. Tu peux reessayer, verifier le PIN, ou utiliser la demo pendant qu'on optimise Apps Script."));
  }, LOADING_TIMEOUT_MS);
  return loadId;
}

function finishLoading(loadId) {
  if (loadId !== state.loadingSeq) return;
  window.clearTimeout(state.loadingTimer);
  state.loadingTimer = null;
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
  const allVisibleTasks = (data.tasks || [])
    .filter(isActionableTodoTask)
    .filter((task) => !state.localHiddenTaskIds.has(task.taskId));
  document.getElementById("metricTasks").textContent = allVisibleTasks.length || 0;
  document.getElementById("metricUrgent").textContent = allVisibleTasks.filter((task) => task.priority === "P1").length || 0;
  document.getElementById("metricRisk").textContent = kpis.atRisk || 0;
  document.getElementById("metricImpacts").textContent = kpis.impactsWeek || 0;
  const sourceSuffix = state.isDemo ? " | Source: demo locale, aucune donnee reelle" : " | Source: backend prive";
  els.sourceLine.textContent = `${data.activeCoach || "Coach"} | Dashboard: ${data.dashboardUpdatedAt || "-"} | App: ${data.generatedAt || "-"}${sourceSuffix}`;

  if (state.activeView === "clients") return renderClients(data.clients || []);
  if (state.activeView === "rebooking") return renderRebooking(data);
  if (state.activeView === "questionnaires") return renderQuestionnaireInbox(data);
  if (state.activeView === "performance") return renderPerformance(data);
  if (state.activeView === "alumni") return renderAlumni((data && data.v3) || {});
  if (state.activeView === "scenarios") return renderScenarios(data);
  if (state.activeView === "admin") return renderAdmin(data);

  const tasks = filterTasks(allVisibleTasks);
  if (state.activeView === "mission") return renderMission(tasks, data.clients || []);
  renderTaskBoard(tasks, data.clients || []);
}

function refreshClientModalIfOpen() {
  if (!state.modalClientKey) return;
  const client = ((state.data && state.data.clients) || []).find((item) => item.clientKey === state.modalClientKey);
  if (!client) {
    closeClientModal();
    return;
  }
  openClientModal(client.clientKey);
}

function renderCoachSelect(data) {
  const coaches = collectCoachOptions(data);
  const coachNames = coaches.map((coach) => coach.coach);
  const preferredCoach = chooseActiveCoach(coachNames, data);
  els.coachSelect.innerHTML = coaches.map((coach) => `<option value="${escapeAttr(coach.coach)}">${escapeHtml(coach.coach)}</option>`).join("");
  els.coachSelect.value = preferredCoach;
  if (preferredCoach && preferredCoach !== state.activeCoach) {
    state.activeCoach = preferredCoach;
    localStorage.setItem("cfsbCoachName", preferredCoach);
  }
  document.querySelectorAll(".views button").forEach((item) => item.classList.toggle("active", item.dataset.view === state.activeView));
}

function chooseActiveCoach(coachNames, data) {
  const current = cleanValue(state.activeCoach);
  if (current && coachNames.includes(current)) return current;
  const backendActive = cleanValue(data && data.activeCoach);
  if (backendActive && coachNames.includes(backendActive)) return backendActive;
  const firstRealCoach = coachNames.find((coach) => coach !== DEMO_COACH);
  return firstRealCoach || coachNames[0] || "";
}

function collectCoachOptions(data) {
  const coachMap = new Map();
  addCoachOption(coachMap, data && data.activeCoach);
  (Array.isArray(data && data.coaches) ? data.coaches : []).forEach((coach) => {
    addCoachOption(coachMap, coach && (coach.coach || coach.name || coach.coachName || coach.coach_name));
  });
  collectRows(data && data.clients).forEach((client) => {
    addCoachOption(coachMap, client.coach);
    addCoachOption(coachMap, client.coachName);
    addCoachOption(coachMap, client.coach_name);
    addCoachOption(coachMap, client.assignedCoach);
  });
  collectRows(data && data.tasks).forEach((task) => {
    addCoachOption(coachMap, task.coach);
    addCoachOption(coachMap, task.coachName);
    addCoachOption(coachMap, task.coach_name);
  });
  collectRows(data && data.questionnaireInbox, data && data.questionnaires, data && data.responses, data && data.clientCoachResponses).forEach((row) => {
    addCoachOption(coachMap, row.coach);
    addCoachOption(coachMap, row.coachName);
    addCoachOption(coachMap, row.coach_name);
  });
  const v3 = (data && data.v3) || {};
  collectRows(v3.questionnaires, v3.questionnaireInbox, v3.holds, v3.alumni, v3.removedClients, v3.retention).forEach((row) => {
    addCoachOption(coachMap, row.coach);
    addCoachOption(coachMap, row.coachName);
    addCoachOption(coachMap, row.coach_name);
  });
  collectRows(v3.impacts && v3.impacts.log, v3.impacts && v3.impacts.opportunities).forEach((row) => {
    addCoachOption(coachMap, row.coach);
    addCoachOption(coachMap, row.coachName);
    addCoachOption(coachMap, row.coach_name);
  });
  FALLBACK_COACHES.forEach((coach) => addCoachOption(coachMap, coach));

  const realCoaches = Array.from(coachMap.values())
    .filter((coach) => coach !== DEMO_COACH)
    .filter((coach) => ALLOWED_COACH_KEYS.has(coachKey(coach)))
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((coach) => ({ coach }));
  return realCoaches.concat([{ coach: DEMO_COACH }]);
}

function collectRows() {
  return Array.from(arguments).filter(Array.isArray).flat();
}

function addCoachOption(coachMap, value) {
  const coach = cleanValue(value);
  if (!coach || coach === "-" || coach === "Connexion requise") return;
  coachMap.set(coach, coach);
}

function coachKey(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
  if (state.activeView === "mission") return tasks.filter((task) => task.priority === "P1" || ["Programme", "Rebooking", "Formulaire", "Validation", "Retention", "Impact", "Suivi client", "Manuel"].includes(task.type));
  const map = { programs: "Programme", rebookings: "Rebooking", forms: "Formulaire", validations: "Validation" };
  return map[state.activeView] ? tasks.filter((task) => task.type === map[state.activeView]) : tasks;
}

function isActionableTodoTask(task) {
  const text = normalizeLower([
    task && task.type,
    task && task.action,
    task && task.why,
    task && task.due,
    task && task.source
  ].filter(Boolean).join(" "));
  const isQuestionnaireTask = normalizeLower(task && task.type) === "formulaire"
    || text.includes("questionnaire")
    || text.includes("formulaire");
  if (!isQuestionnaireTask) return true;
  if (text.includes("envoyer questionnaire") || text.includes("envoyer le questionnaire") || text.includes("questionnaire fin")) return false;
  const actionText = text;
  return actionText.includes("relancer") || actionText.includes("sans reponse") || actionText.includes("sans réponse");
}

function renderMission(tasks, clients) {
  els.content.className = "content";
  const urgentTasks = tasks.filter((task) => task.priority === "P1");
  const programTasks = tasks.filter((task) => task.type === "Programme");
  const rebookingTasks = tasks.filter((task) => task.type === "Rebooking");
  const formTasks = tasks.filter((task) => task.type === "Formulaire");
  const manualTasks = tasks.filter((task) => ["Manuel", "Suivi client"].includes(task.type));
  const visibleTasks = filterMissionTasks(tasks);
  const firstTask = tasks[0];
  if (!state.selectedClientKey && firstTask) state.selectedClientKey = firstTask.clientKey || "";

  els.content.innerHTML = `
    <section class="mission-panel">
      <div class="command-hero">
        <div>
          <p class="eyebrow">To-do du coach</p>
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
        ${priorityTile("Notes coach", manualTasks.length, "p3")}
      </div>
      ${missionFilters(tasks)}
      ${visibleTasks.length ? `<div class="action-list">${visibleTasks.slice(0, 18).map(taskRow).join("")}</div>` : '<div class="empty">Aucune action ici.</div>'}
    </section>
  `;
  attachTaskControls();
  attachClientSelectors();
  attachMissionFilters();
  attachQuickCapture();
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
        <span class="auto-date">Date du jour automatique</span>
        <button id="quickCaptureBtn" class="primary" type="button">Creer missions</button>
      </div>
    </div>`;
}

function renderTaskBoard(tasks, clients) {
  if (!state.selectedClientKey && tasks[0]) state.selectedClientKey = tasks[0].clientKey || "";
  els.content.className = "content";
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
  `;
  attachTaskControls();
  attachClientSelectors();
}

function demoBanner() {
  return `
    <div class="demo-banner">
      <strong>Mode demo sandbox</strong>
      <span>Actions locales instantanees. Aucun SMS, aucun GHL, aucune vraie donnee client.</span>
      <button id="inlineExitDemoBtn" type="button">Quitter demo</button>
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
    ["validations", "A valider", tasks.filter((task) => task.type === "Validation").length],
    ["manual", "Notes coach", tasks.filter((task) => ["Manuel", "Suivi client"].includes(task.type)).length]
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
  if (filter === "manual") return tasks.filter((task) => ["Manuel", "Suivi client"].includes(task.type));
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
    const rebookingUrl = getCoachRebookingLink(state.activeCoach);
    if (!state.isDemo) {
      return `<div class="row-actions">
        ${rebookingUrl ? `<a class="done button-link" href="${escapeAttr(rebookingUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir rebooking</a>` : `<button class="pending-action" disabled title="Lien rebooking non configure pour ce coach.">Lien a configurer</button>`}
        <button ${baseAttrs} data-status="Ignore">Masquer</button>
      </div>`;
    }
    return `<div class="row-actions">
      <button class="done" data-rebooking-reminder="true" ${clientAttrs}>Simuler rappel</button>
      <button ${baseAttrs} data-status="Ignore">Masquer</button>
    </div>`;
  }
  if (type === "formulaire") {
    return `<div class="row-actions">
      ${questionnaireSendButton(`data-send-questionnaire="true" ${clientAttrs}`)}
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

function getCoachRebookingLink(coachName) {
  const data = state.data || {};
  return cleanValue(data.rebookingUrl || (data.v3 && data.v3.rebookingUrl) || "");
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
        ${focusFact("Fin membership manuel", client.membershipEnd || "A entrer")}
        ${client.program ? focusFact("Programme", client.program) : ""}
        ${client.comp30 ? focusFact("Compliance", client.comp30) : ""}
        ${focusFact("Recurrence prevue dans Kilo", client.serviceEnd || "A entrer")}
        ${client.rebookingTotal ? focusFact("Rebooking", client.rebookingTotal) : ""}
        ${focusFact("Risque coach", isCoachRisk(client.riskLevel) ? client.riskLevel : "Aucun")}
        ${questionnaireSignal ? focusFact("Signal questionnaire", questionnaireSignal) : ""}
        ${client.systemSignal ? focusFact("Signal systeme", client.systemSignal) : ""}
        ${focusFact("Dernier questionnaire", questionnaireDate ? `${questionnaireDate}${questionnaireAge ? " | " + questionnaireAge : ""}` : "Jamais trouve")}
        ${client.plannedExitDate ? focusFact("Fin prevue coach", client.plannedExitDate) : ""}
      </div>
      <div class="focus-note service-end-editor" data-client-key="${escapeAttr(client.clientKey || "")}" data-client-name="${escapeAttr(client.client || "")}">
        <strong>Recurrence prevue dans Kilo</strong>
        <p>Entre la derniere date deja mise a l'horaire selon la recurrence prevue. Une tache de rebooking apparaitra 30 jours avant.</p>
        <div class="form-grid compact-form">
          <input id="clientServiceEndDate" type="date" value="${escapeAttr(toDateInputValue(client.serviceEnd || ""))}">
          <input id="clientServiceEndNote" class="wide" placeholder="Notes optionnelles">
        </div>
        <div class="actions-row"><button class="primary" id="saveClientServiceEndBtn">Enregistrer recurrence Kilo</button></div>
      </div>
      <div class="focus-note membership-end-editor" data-client-key="${escapeAttr(client.clientKey || "")}" data-client-name="${escapeAttr(client.client || "")}">
        <strong>Fin membership manuel</strong>
        <p>A entrer seulement si le coach connait la date dans Kilo ou par discussion client. Le dashboard ne calcule jamais cette date automatiquement.</p>
        <div class="form-grid compact-form">
          <input id="clientMembershipEndDate" type="date" value="${escapeAttr(toDateInputValue(client.membershipEnd || ""))}">
          <input id="clientMembershipEndNote" class="wide" placeholder="Notes optionnelles: contexte retention, intention de depart, renouvellement">
        </div>
        <div class="actions-row"><button class="primary" id="saveClientMembershipEndBtn">Enregistrer fin membership</button></div>
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
      ${client.signal ? `<div class="focus-note"><strong>Signal</strong><p>${escapeHtml(client.signal)}</p></div>` : ""}
      ${questionnaire.response_id ? `<div class="focus-note"><strong>Resume questionnaire</strong><p>${escapeHtml(questionnaireDate || "")} | ${escapeHtml(questionnaire.triage_status || "vert")} | ${escapeHtml(questionnaire.coach_action_type || "lire le suivi")}</p><p>${escapeHtml(questionnaire.open_note || questionnaire.program_fit || questionnaire.general_state || "")}</p></div>` : ""}
      ${context.longTermSummary ? `<div class="focus-note"><strong>Plan CoachRx</strong><p>${escapeHtml(context.longTermSummary).slice(0, 520)}${context.longTermSummary.length > 520 ? "..." : ""}</p></div>` : ""}
      ${context.objectives ? `<div class="focus-note"><strong>Objectifs</strong><p>${escapeHtml(context.objectives)}</p></div>` : ""}
      ${clientTasks.length ? `<div class="focus-note"><strong>Actions liees</strong>${clientTasks.slice(0, 4).map((task) => `<p>${escapeHtml(task.action || "")}</p>`).join("")}</div>` : ""}
      <div class="focus-note client-management" data-client-key="${escapeAttr(client.clientKey || "")}" data-client-name="${escapeAttr(client.client || "")}">
        <strong>Actions client</strong>
        <p>Corriger les informations utiles ou retirer le client de la liste active sans perdre l'historique.</p>
        <div class="form-grid compact-form">
          <select id="clientRemoveDestination">
            <option value="alumni">Deplacer vers Alumni</option>
            <option value="removed">Retirer du dashboard actif</option>
            <option value="error">Erreur de liste</option>
          </select>
          <input id="clientRemoveNote" class="wide" placeholder="Note optionnelle pour expliquer le classement">
        </div>
        <div class="actions-row">
          <button id="editClientBtn">Modifier</button>
          <button id="removeClientBtn">Retirer / classer</button>
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
  const exitButton = document.getElementById("inlineExitDemoBtn");
  if (exitButton) exitButton.addEventListener("click", exitDemoMode);
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
      openClientModal(state.selectedClientKey);
    });
  });
}

function openClientModal(clientKey) {
  const clients = (state.data && state.data.clients) || [];
  const tasks = (state.data && state.data.tasks) || [];
  const client = clients.find((item) => item.clientKey === clientKey)
    || clientFromTask(tasks.find((task) => task.clientKey === clientKey));
  if (!client || !els.clientModal) return;
  state.modalClientKey = client.clientKey;
  els.clientModal.classList.remove("hidden");
  els.clientModal.innerHTML = `
    <div class="modal-backdrop" data-close-client-modal="true"></div>
    <div class="modal-card">
      <button class="close-panel modal-close" type="button" data-close-client-modal="true" aria-label="Fermer la fiche client">X</button>
      ${clientFocusPanel(client, (state.data && state.data.tasks) || [])}
    </div>`;
  attachClientRiskControl();
  attachClientManagementControls();
  els.clientModal.querySelectorAll("[data-close-client-modal]").forEach((element) => {
    element.addEventListener("click", closeClientModal);
  });
}

function closeClientModal() {
  state.modalClientKey = "";
  state.editingClientKey = "";
  if (!els.clientModal) return;
  els.clientModal.classList.add("hidden");
  els.clientModal.innerHTML = "";
}

function attachClientRiskControl() {
  const button = document.getElementById("saveClientRiskBtn");
  if (button) {
    const editor = document.querySelector(".risk-editor");
    button.addEventListener("click", () => {
      saveClientRisk(editor && editor.dataset.clientKey, editor && editor.dataset.clientName);
    });
  }
  const serviceButton = document.getElementById("saveClientServiceEndBtn");
  if (serviceButton) {
    const editor = document.querySelector(".service-end-editor");
    serviceButton.addEventListener("click", () => {
      saveClientServiceEnd(editor && editor.dataset.clientKey, editor && editor.dataset.clientName);
    });
  }
  const membershipButton = document.getElementById("saveClientMembershipEndBtn");
  if (membershipButton) {
    const editor = document.querySelector(".membership-end-editor");
    membershipButton.addEventListener("click", () => {
      saveClientMembershipEnd(editor && editor.dataset.clientKey, editor && editor.dataset.clientName);
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
  const exitButton = document.getElementById("inlineExitDemoBtn");
  if (exitButton) exitButton.addEventListener("click", exitDemoMode);
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
    rebooking: "Rebooking",
    scenarios: "Scenarios"
  };
  return labels[view] || "Actions";
}

function normalizeView(view) {
  const map = {
    today: "mission",
    programs: "mission",
    rebookings: "mission",
    rebooking: "rebooking",
    forms: "mission",
    validations: "mission",
    retention: "performance",
    impacts: "performance",
    admin: "performance"
  };
  return map[view] || (["mission", "clients", "rebooking", "questionnaires", "performance", "alumni", "scenarios"].includes(view) ? view : "mission");
}

function renderClients(clients) {
  const sortedClients = sortClients(clients);
  if (!state.selectedClientKey && sortedClients[0]) state.selectedClientKey = sortedClients[0].clientKey;
  els.content.className = "content";
  els.content.innerHTML = `
    <section class="mission-panel">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Portefeuille client</p>
          <h2>${clients.length} client${clients.length > 1 ? "s" : ""} supervises</h2>
          <p>Trie les clients selon ce que tu veux traiter: actions, fin de membership manuelle, recurrence prevue dans Kilo, questionnaires ou risques coach. Clique un client pour ouvrir sa fiche.</p>
        </div>
        <button class="primary" id="toggleManualClientBtn">${state.showManualClientForm ? "Fermer" : "Ajouter client"}</button>
      </div>
      <div class="toolbar client-toolbar">
        <label>Trier par
          <select id="clientSortSelect">
            <option value="actions" ${state.clientSort === "actions" ? "selected" : ""}>Actions ouvertes</option>
            <option value="membershipEnd" ${state.clientSort === "membershipEnd" ? "selected" : ""}>Fin membership manuel</option>
            <option value="serviceEnd" ${state.clientSort === "serviceEnd" ? "selected" : ""}>Recurrence Kilo</option>
            <option value="questionnaire" ${state.clientSort === "questionnaire" ? "selected" : ""}>Dernier questionnaire</option>
            <option value="risk" ${state.clientSort === "risk" ? "selected" : ""}>Risque coach</option>
          </select>
        </label>
      </div>
      ${manualClientForm()}
      <div class="client-directory">
        ${sortedClients.length ? sortedClients.map(clientDirectoryRow).join("") : '<div class="empty">Aucun client consolide.</div>'}
      </div>
    </section>
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
        <label>Fin membership manuel
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
      <strong>Modifier client</strong>
      <p>La fin de membership est une donnee manuelle. On ne la deduit pas automatiquement du type de membership.</p>
      <div class="form-grid compact-form">
        <input id="editClientName" placeholder="Nom complet" value="${escapeAttr(client.client || "")}">
        <input id="editClientPhone" placeholder="Telephone" value="${escapeAttr(client.phone || "")}">
        <input id="editClientEmail" placeholder="Courriel" value="${escapeAttr(client.email || "")}">
        <input id="editClientPackage" placeholder="Membership / service" value="${escapeAttr(client.activePackage || "")}">
        <label>Fin membership manuel
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
    const editor = document.querySelector(".client-management");
    editButton.addEventListener("click", () => {
      state.editingClientKey = editor && editor.dataset.clientKey;
      state.activeView = "clients";
      if (state.modalClientKey) {
        openClientModal(state.editingClientKey);
        return;
      }
      render();
    });
  }
  const removeButton = document.getElementById("removeClientBtn");
  if (removeButton) {
    const editor = document.querySelector(".client-management");
    removeButton.addEventListener("click", () => {
      removeClientFromDashboard(editor && editor.dataset.clientKey, editor && editor.dataset.clientName);
    });
  }
  const saveEditedButton = document.getElementById("saveEditedClientBtn");
  if (saveEditedButton) saveEditedButton.addEventListener("click", () => saveEditedClient(saveEditedButton.dataset.clientKey));
  const cancelEditButton = document.getElementById("cancelEditClientBtn");
  if (cancelEditButton) cancelEditButton.addEventListener("click", () => {
    state.editingClientKey = "";
    if (state.modalClientKey) {
      openClientModal(state.modalClientKey);
      return;
    }
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
        ${client.membershipEnd ? `<span class="tag">Fin membership manuel: ${escapeHtml(client.membershipEnd)}</span>` : ""}
        ${client.plannedExitDate ? `<span class="tag bad">Fin prevue coach: ${escapeHtml(client.plannedExitDate)}</span>` : ""}
        ${client.serviceEnd ? `<span class="tag warn">Recurrence Kilo: ${escapeHtml(client.serviceEnd)}</span>` : ""}
      </div>
    </article>`;
}

function renderRebooking(data) {
  const rows = collectRebookingRows(data);
  const historyRows = collectRebookingHistoryRows(data);
  const taskRows = ((data && data.tasks) || []).filter((task) => task.type === "Rebooking");
  const allRows = rows.length ? rows : taskRows.map((task) => ({
    client: task.client,
    clientKey: task.clientKey,
    coach: task.coach || data.activeCoach,
    status: "A rebooker",
    count: (task.why || "").match(/\d+/) ? (task.why || "").match(/\d+/)[0] : "",
    service: task.why || task.action,
    date: task.due || "",
    taskId: task.taskId || "",
    source: task.source || "To-do"
  }));
  const openRows = allRows.filter((row) => normalizeLower(row.status || "").indexOf("ferme") === -1 && normalizeLower(row.status || "").indexOf("fait") === -1);
  const rebookingUrl = getCoachRebookingLink(state.activeCoach);
  const rebookingHistoryUrl = rebookingUrl ? addQueryParam(rebookingUrl, "view", "history") : "";
  const rebookingVacationsUrl = rebookingUrl ? addQueryParam(rebookingUrl, "view", "vacations") : "";
  els.content.className = "content performance-grid";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Rebooking</p>
          <h2>${openRows.length} client${openRows.length > 1 ? "s" : ""} a suivre</h2>
          <p>Cette section regroupe les seances a remettre pour le coach selectionne. Le lien externe reste disponible pendant qu'on integre le flux complet dans le dashboard.</p>
        </div>
        <div class="hero-actions">
          ${rebookingUrl ? `<a class="button-link" href="${escapeAttr(rebookingUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir l'app rebooking</a>` : `<span class="freshness">Lien a configurer</span>`}
          ${rebookingHistoryUrl ? `<a class="button-link secondary-link" href="${escapeAttr(rebookingHistoryUrl)}" target="_blank" rel="noopener noreferrer">Historique</a>` : ""}
          ${rebookingVacationsUrl ? `<a class="button-link secondary-link" href="${escapeAttr(rebookingVacationsUrl)}" target="_blank" rel="noopener noreferrer">Vacances</a>` : ""}
        </div>
      </div>
      <div class="priority-strip">
        ${priorityTile("Ouverts", openRows.length, "p3")}
        ${priorityTile("Source To-do", taskRows.length, "p2")}
        ${priorityTile("Clients", new Set(allRows.map((row) => normalizeName(row.client))).size, "p4")}
        ${priorityTile("Historique", historyRows.length, "p1")}
      </div>
    </section>
    <section class="mission-panel performance-hero">
      <div class="section-head"><div><p class="eyebrow">Liste</p><h2>Seances a rebooker</h2></div></div>
      ${allRows.length ? `<div class="questionnaire-list">${allRows.map(rebookingRow).join("")}</div>` : '<div class="empty">Aucun rebooking ouvert pour ce coach.</div>'}
    </section>
    <section class="mission-panel performance-hero">
      <div class="section-head"><div><p class="eyebrow">Historique</p><h2>Dossiers geres ou rebookes</h2></div></div>
      ${historyRows.length ? `<div class="questionnaire-list">${historyRows.slice(0, 20).map(rebookingRow).join("")}</div>` : '<div class="empty">Aucun historique rebooking recent pour ce coach.</div>'}
    </section>
  `;
  attachTaskControls();
  attachClientSelectors();
}

function collectRebookingRows(data) {
  return collectRows(
    data && data.rebookings,
    data && data.v3 && data.v3.rebookings,
    data && data.v3 && data.v3.rebookingRows
  ).filter((row) => coachRowMatchesActive(row)).map((row) => ({
    cancellationId: cleanValue(row.cancellationId || row.cancellation_id || row["Cancellation ID"]),
    client: cleanValue(row.client || row.Client || row.clientName || row["Client"]),
    clientKey: cleanValue(row.clientKey || row.client_key || row["Client Key"] || normalizeName(row.client || row.Client || "")),
    coach: cleanValue(row.coach || row.Coach || row.coachName),
    status: cleanValue(row.status || row.Statut || row["Status"] || "Ouvert"),
    count: cleanValue(row.count || row.total || row["Total"] || row["Total a rebooker"]),
    service: cleanValue(row.service || row.Service || row["Service / classe"] || row.details || row.why),
    date: cleanValue(row.date || row["Debut RDV"] || row["Debut annule"] || row.receivedAt || row["Recu a"]),
    taskId: cleanValue(row.taskId || row["Task ID"]),
    source: cleanValue(row.source || row.Source || "Rebooking")
  })).filter((row) => row.client);
}

function collectRebookingHistoryRows(data) {
  return collectRows(
    data && data.rebookingHistory,
    data && data.v3 && data.v3.rebookingHistory,
    data && data.v3 && data.v3.rebookingHistoryRows
  ).filter((row) => coachRowMatchesActive(row)).map((row) => ({
    cancellationId: cleanValue(row.cancellationId || row.cancellation_id || row["Cancellation ID"] || row["Event ID"]),
    client: cleanValue(row.client || row.Client || row.clientName || row["Client"]),
    clientKey: cleanValue(row.clientKey || row.client_key || row["Client Key"] || normalizeName(row.client || row.Client || "")),
    coach: cleanValue(row.coach || row.Coach || row.coachName),
    status: cleanValue(row.status || row.Statut || row["Status"] || "Gere"),
    count: cleanValue(row.count || row.total || row["Total"] || row["Total a rebooker"]),
    service: cleanValue(row.service || row.Service || row["Service / classe"] || row.details || row.why),
    date: cleanValue(row.date || row["Debut RDV"] || row["Debut annule"] || row.receivedAt || row["Recu a"]),
    closedAt: cleanValue(row.closedAt || row["Ferme a"]),
    closeReason: cleanValue(row.closeReason || row["Raison fermeture"]),
    closeNote: cleanValue(row.closeNote || row["Note fermeture"] || row.Notes),
    taskId: cleanValue(row.taskId || row["Task ID"]),
    source: cleanValue(row.source || row.Source || "Rebooking")
  })).filter((row) => row.client);
}

function addQueryParam(url, key, value) {
  if (!url) return "";
  const separator = url.indexOf("?") === -1 ? "?" : "&";
  const pattern = new RegExp("([?&])" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=[^&]*");
  if (pattern.test(url)) return url.replace(pattern, "$1" + encodeURIComponent(key) + "=" + encodeURIComponent(value));
  return url + separator + encodeURIComponent(key) + "=" + encodeURIComponent(value);
}

function rebookingRow(row) {
  const clientKey = row.clientKey || normalizeName(row.client || "");
  const count = row.count || (row.service && row.service.match(/\d+/) ? row.service.match(/\d+/)[0] : "");
  const isClosed = ["gere", "ferme", "fait"].some((word) => normalizeLower(row.status || "").includes(word));
  return `
    <article class="compact-row rebooking-row">
      <button class="client-trigger inline-client-trigger" data-client-key="${escapeAttr(clientKey)}">
        <span class="priority-dot"></span>
        <span>
          <strong>${escapeHtml(row.client || "Client")}</strong>
          <small>${escapeHtml(row.service || "Seance a remettre")}</small>
        </span>
      </button>
      <p>${count ? `${escapeHtml(count)} seance(s) a remettre | ` : ""}${escapeHtml(row.date || "Date a valider")} | ${escapeHtml(row.status || "Ouvert")}</p>
      ${row.closeReason || row.closedAt || row.closeNote ? `<p class="muted compact-meta">${escapeHtml([row.closeReason, row.closedAt, row.closeNote].filter(Boolean).join(" | "))}</p>` : ""}
      <div class="row-actions compact-actions">
        ${isClosed
          ? `<button data-rebooking-status="OUVERT" data-cancellation-id="${escapeAttr(row.cancellationId || "")}" data-client-key="${escapeAttr(clientKey)}" data-client-name="${escapeAttr(row.client || "")}">Reouvrir</button>`
          : `<button class="done" data-rebooking-status="GERE" data-cancellation-id="${escapeAttr(row.cancellationId || "")}" data-client-key="${escapeAttr(clientKey)}" data-client-name="${escapeAttr(row.client || "")}">Marquer gere</button>`}
        ${row.taskId ? `<button data-task-id="${escapeAttr(row.taskId)}" data-status="Ignore">Masquer</button>` : ""}
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
  const activeResponses = responses.filter((row) => !isQuestionnaireArchived(row));
  const urgent = activeResponses.filter((row) => ["rouge", "orange"].includes(row.triageStatus));
  const unmatched = responses.filter((row) => row.matchStatus === "non_matche");
  const unread = activeResponses.filter((row) => !["lu", "action_completee", "archive"].includes(row.processingStatus));
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
          <p>Cette vue centralise toutes les reponses client. Le bouton "Lu" archive la reponse active apres lecture ou suivi.</p>
        </div>
      </div>
      <div class="priority-strip">
        ${priorityTile("Actives", activeResponses.length, "p4")}
        ${priorityTile("Urgentes", urgent.length, "p1")}
        ${priorityTile("Non lues", unread.length, "p2")}
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
  return [];
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
    goalChangeDetail: cleanValue(row.goal_change_detail || row.goalChangeDetail),
    goalClarityScore: cleanValue(row.goal_clarity_score || row.goalClarityScore),
    progressTowardGoal: cleanValue(row.progress_toward_goal || row.progressTowardGoal),
    recentSuccessType: cleanValue(row.recent_success_type || row.recentSuccessType || row.recent_success || row.recentSuccess),
    last30DaysAttendance: cleanValue(row.last_30_days_attendance || row.last30DaysAttendance),
    resultsSatisfactionScore: cleanValue(row.results_satisfaction_score || row.resultsSatisfactionScore),
    currentChallenges: cleanValue(row.current_challenges || row.currentChallenges),
    programFit: cleanValue(row.program_fit || row.programFit),
    programAdjustmentDetail: cleanValue(row.program_adjustment_detail || row.programAdjustmentDetail),
    painStatus: cleanValue(row.pain_status || row.painStatus),
    painDetail: cleanValue(row.pain_detail || row.painDetail),
    supportNeeded: cleanValue(row.support_needed || row.supportNeeded),
    contactRequest: cleanValue(row.contact_request || row.contactRequest),
    openNote: cleanValue(row.open_note || row.openNote || row.note),
    improvementsRequested: cleanValue(row.improvements_requested || row.improvementsRequested),
    finalPosition: cleanValue(row.final_position || row.finalPosition),
    sourceTab: cleanValue(row.response_source_tab || row.sourceTab || row.source),
    triageStatus: triageStatus || "vert",
    coachActionType: cleanValue(row.coach_action_type || row.coachActionType || actionForTriage(triageStatus)),
    processingStatus,
    matchStatus: matchStatus || (clientKey || cleanValue(row.coach_name || row.coachName) ? "matche" : "non_matche"),
    clientKey
  };
}

function questionnaireFilters(responses, staleClients, pending, clients) {
  const activeResponses = responses.filter((row) => !isQuestionnaireArchived(row));
  const filters = [
    ["all", "Toutes actives", activeResponses.length],
    ["unread", "Non lues", activeResponses.filter((row) => !["lu", "action_completee", "archive"].includes(row.processingStatus)).length],
    ["urgent", "Rouge / orange", activeResponses.filter((row) => ["rouge", "orange"].includes(row.triageStatus)).length],
    ["rouge", "Rouge", activeResponses.filter((row) => row.triageStatus === "rouge").length],
    ["orange", "Orange", activeResponses.filter((row) => row.triageStatus === "orange").length],
    ["jaune", "Jaune", activeResponses.filter((row) => row.triageStatus === "jaune").length],
    ["vert", "Vert", activeResponses.filter((row) => row.triageStatus === "vert").length],
    ["unmatched", "Non matchees", responses.filter((row) => row.matchStatus === "non_matche").length],
    ["clients", "Clients", clients.length],
    ["stale", "A envoyer 3 mois+", staleClients.length],
    ["pending", "En attente", pending.length],
    ["archive", "Archive", responses.filter((row) => ["lu", "action_completee", "archive"].includes(row.processingStatus)).length]
  ];
  return `<div class="mission-filters">${filters.map(([id, label, count]) => `<button class="${state.activeQuestionnaireFilter === id ? "active" : ""}" data-questionnaire-filter="${id}">${escapeHtml(label)} <span>${count}</span></button>`).join("")}</div>`;
}

function questionnaireFilterTitle(filtered, staleClients, pending) {
  if (state.activeQuestionnaireFilter === "clients") return "Liste des clients";
  if (state.activeQuestionnaireFilter === "stale") return `${staleClients.length} questionnaire${staleClients.length > 1 ? "s" : ""} a envoyer`;
  if (state.activeQuestionnaireFilter === "pending") return `${pending.length} en attente`;
  if (state.activeQuestionnaireFilter === "archive") return `${filtered.length} reponse${filtered.length > 1 ? "s" : ""} archivee${filtered.length > 1 ? "s" : ""}`;
  return `${filtered.length} reponse${filtered.length > 1 ? "s" : ""}`;
}

function filterQuestionnaireResponses(responses) {
  const filter = state.activeQuestionnaireFilter;
  if (filter === "unmatched") return responses.filter((row) => row.matchStatus === "non_matche");
  if (filter === "archive") return responses.filter(isQuestionnaireArchived);
  const activeResponses = responses.filter((row) => !isQuestionnaireArchived(row));
  if (filter === "urgent") return activeResponses.filter((row) => ["rouge", "orange"].includes(row.triageStatus));
  if (filter === "unread") return activeResponses.filter((row) => !["lu", "action_completee", "archive"].includes(row.processingStatus));
  if (["rouge", "orange", "jaune", "vert"].includes(filter)) return activeResponses.filter((row) => row.triageStatus === filter);
  return activeResponses;
}

function isQuestionnaireArchived(row) {
  return ["lu", "action_completee", "archive", "ignore"].includes(normalizeLower(row.processingStatus || row.status || ""));
}

function questionnaireRow(row) {
  const tone = row.triageStatus === "rouge" ? "bad" : row.triageStatus === "orange" || row.triageStatus === "jaune" ? "warn" : "good";
  return `
    <article class="compact-row questionnaire-row">
      <strong>${escapeHtml(row.clientName || "Client a valider")} <span class="tag ${tone}">${escapeHtml(row.triageStatus)}</span></strong>
      <p>${escapeHtml(row.submittedAt || row.receivedAt || "-")} | ${escapeHtml(row.coachName || "Coach a deriver")} | ${escapeHtml(row.matchStatus)}${row.sourceTab ? " | " + escapeHtml(row.sourceTab) : ""}</p>
      <p><strong>Action:</strong> ${escapeHtml(actionForTriage(row.triageStatus, row.coachActionType))}</p>
      <p>${escapeHtml(questionnaireSummary(row))}</p>
      ${row.responseId ? `<div class="row-actions compact-actions">
        ${questionnaireSendButton(`data-send-questionnaire-client="true" data-client-key="${escapeAttr(row.clientKey || "")}" data-client-name="${escapeAttr(row.clientName || "")}"`)}
        <button class="done" data-response-id="${escapeAttr(row.responseId)}" data-questionnaire-action="lu">Lu</button>
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
        ${questionnaireSendButton(`data-send-questionnaire="true" data-client-key="${escapeAttr(client.clientKey || "")}" data-client-name="${escapeAttr(client.client || "")}"`, !phone)}
      </div>
    </article>
  `;
}

function questionnaireSendButtonLabel() {
  return state.isDemo ? "Simuler questionnaire" : "Envoyer questionnaire";
}

function questionnaireSendButton(attrs, disabled) {
  const livePaused = !state.isDemo && !QUESTIONNAIRE_LIVE_ENABLED;
  const title = livePaused ? 'title="Module questionnaire en pause pour le pilote. Aucun SMS ne part du dashboard."' : "";
  const classes = state.isDemo || !livePaused ? "done" : "pending-action";
  return `<button class="${classes}" ${attrs} ${disabled || livePaused ? "disabled" : ""} ${title}>${questionnaireSendButtonLabel()}</button>`;
}

function questionnaireSummary(row) {
  return [
    row.generalState && `Etat: ${row.generalState}`,
    row.motivationLevel && `Motivation: ${row.motivationLevel}`,
    row.goalStatus && `Objectif: ${row.goalStatus}`,
    row.progressTowardGoal && `Progres: ${row.progressTowardGoal}`,
    row.resultsSatisfactionScore && `Satisfaction: ${row.resultsSatisfactionScore}`,
    row.programFit && `Programme: ${row.programFit}`,
    row.programAdjustmentDetail && `Ajustement: ${row.programAdjustmentDetail}`,
    row.painStatus && `Douleur: ${row.painStatus}`,
    row.painDetail && `Details douleur: ${row.painDetail}`,
    row.currentChallenges && `Defis: ${row.currentChallenges}`,
    row.supportNeeded && `Soutien: ${row.supportNeeded}`,
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
  const scenarios = demoScenarios().filter((scenario) => scenario.id !== "hold");
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
        <article class="compact-row"><strong>Mission</strong><p>Les taches doivent apparaitre avec les bons boutons. En mode reel, Fait/Masquer est instantane; les rappels rebooking restent clairement indiques comme module a brancher.</p></article>
        <article class="compact-row"><strong>Clients</strong><p>La fiche client doit montrer membership, fin membership manuelle, fin prevue coach, recurrence prevue dans Kilo, risque coach et dernier questionnaire.</p></article>
        <article class="compact-row"><strong>Alumni / Clients / Performance</strong><p>Alumni gere les anciens clients, Clients gere les fiches actives, Performance gere le churn, les risques et les impacts.</p></article>
      </div>
    </section>
    <section class="mission-panel performance-hero">
      <div class="section-head"><div><p class="eyebrow">Historique demo</p><h2>Actions observees</h2></div></div>
      ${latestActions.length ? latestActions.map((row) => `<article class="compact-row"><strong>${escapeHtml(row.message || "Action demo")}</strong><p>${escapeHtml(row.at || "")}</p></article>`).join("") : '<div class="empty">Aucune action demo encore. Lance un scenario ou clique un bouton dans Mission.</div>'}
    </section>
  `;
  const exitButton = document.getElementById("inlineExitDemoBtn");
  if (exitButton) exitButton.addEventListener("click", exitDemoMode);
  const resetButton = document.getElementById("inlineResetDemoBtn");
  if (resetButton) resetButton.addEventListener("click", resetDemoMode);
}

function operationalModules() {
  const activeRebookingUrl = getCoachRebookingLink(state.activeCoach);
  return [
    {
      title: "Questionnaire client",
      status: "En test",
      tone: "warn",
      description: "Interface visuelle client-coach. Les reponses peuvent deja alimenter l'inbox privee; l'envoi direct par bouton reste en pause tant que le formulaire bouge.",
      links: [
        ["Ouvrir le questionnaire", "https://crossfitstbasile.github.io/cfsb-suivi-client-coach/"],
        ["Voir les reponses", "https://docs.google.com/spreadsheets/d/11QO5GOQGHCpT8_nLEgKHqjFFsZ4emPwZEt2Vlu3WRJo/edit"]
      ]
    },
    {
      title: "Rebooking semi-prive",
      status: "Liens coachs actifs",
      tone: "good",
      description: activeRebookingUrl
        ? "Ouvre l'app rebooking du coach selectionne. Le lien Google Sheet brut n'est plus utilise dans ce guide."
        : "Lien app rebooking a configurer pour ce coach. Aucun lien Google Sheet brut n'est affiche ici.",
      links: activeRebookingUrl ? [["Ouvrir mon app rebooking", activeRebookingUrl]] : []
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
      description: "Source de travail coach. Les donnees sont poussees par l'extension Chrome; les corrections restent manuelles dans CoachRx. Choisis le bon coach avant de synchroniser.",
      links: [["Ouvrir CoachRx", "https://dashboard.coachrx.app/"]].concat(COACH_RX_TEAM_LINKS.map((row) => [`${row[0]} (${row[1]})`, row[2]]))
    },
    {
      title: "CSM / memberships",
      status: "Source reference",
      tone: "good",
      description: "Source interne pour membership, debut d'abonnement, presence et check-up. La fin de membership doit rester manuelle si elle n'est pas explicitement disponible.",
      links: [
        ["Ouvrir CSM", "https://docs.google.com/spreadsheets/d/1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw/edit"],
        ["Ouvrir Formulaire Checkup", "https://docs.google.com/spreadsheets/d/1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw/edit?gid=674556841#gid=674556841"]
      ]
    },
    {
      title: "Alumni",
      status: "Import admin",
      tone: "",
      description: "Les coachs devraient fournir leur liste d'anciens clients a l'administration. On importe ensuite en lot pour eviter une saisie manuelle longue et fragile.",
      links: []
    },
    {
      title: "Kilo",
      status: "A valider",
      tone: "",
      description: "Utile pour horaires et rendez-vous, mais les donnees clients ne sont pas toutes exportables proprement pour l'instant.",
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
      short: "Fin membership manuelle",
      area: "Clients",
      tone: "warn",
      title: "Membership a 30 jours",
      description: "Place Camille avec une fin de membership proche.",
      checks: ["Tri fin membership", "Alerte retention", "Date manuelle visible"],
      button: "Tester fin membership"
    },
    {
      id: "planned-exit",
      number: "06",
      short: "Fin coach",
      area: "Clients",
      tone: "bad",
      title: "Fin prevue par le coach",
      description: "Simule un client qui annonce vouloir quitter plus tot que prevu.",
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
  const clients = data.clients || [];
  const rangeDays = performanceRangeDays();
  const rangeLabel = performanceRangeLabel();
  const riskRows = (v3.retention || []).filter((row) => isCoachRisk(row.riskLevel));
  const questionnaireRiskRows = (data.questionnaireInbox || []).filter((row) => ["rouge", "orange"].includes(normalizeLower(row.triage_status || "")));
  const impacts = (v3.impacts && v3.impacts.log) || [];
  const impactsInRange = impacts.filter((row) => dateIsInPerformanceRange(row.impactDate || row.impact_date || row.createdAt || row.created_at));
  const churnRate = performanceChurnRate(k);
  const newClients = countClientsInRange(clients, rangeDays);
  const checkups = countCheckupsInRange(data, rangeDays);
  els.content.className = "content performance-grid";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Performance coach</p>
          <h2>Churn, nouveaux clients et impacts</h2>
          <p>Cette section sert de premiere page: suivre les indicateurs coach, les risques de perte client, les check-ups CSM et les nouveaux revenus crees.</p>
        </div>
        ${performanceRangeButtons()}
      </div>
      <div class="priority-strip">
        ${priorityTile(`Churn ${rangeLabel}`, churnRate, "p1")}
        ${priorityTile(`Nouveaux clients`, newClients, "p4")}
        ${priorityTile(`Check-ups CSM`, checkups, "p3")}
        ${priorityTile(`Impacts`, impactsInRange.length || k.impactsWeek || 0, "p2")}
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

function performanceRangeButtons() {
  const ranges = [
    ["7", "7 jours"],
    ["30", "30 jours"],
    ["60", "60 jours"],
    ["month", "Ce mois-ci"],
    ["lastMonth", "Mois dernier"],
    ["180", "6 mois"],
    ["365", "12 mois"]
  ];
  return `
    <label class="range-select">Periode
      <select data-performance-range-select="true">
        ${ranges.map(([value, label]) => `<option value="${value}" ${state.performanceRange === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
      </select>
    </label>`;
}

function performanceRangeDays() {
  if (state.performanceRange === "month" || state.performanceRange === "lastMonth") return 31;
  const value = Number(state.performanceRange || 30);
  return Number.isFinite(value) && value > 0 ? value : 30;
}

function performanceRangeLabel() {
  const map = { "7": "7j", "30": "30j", "60": "60j", "month": "ce mois-ci", "lastMonth": "mois dernier", "180": "6m", "365": "12m" };
  return map[String(state.performanceRange)] || `${performanceRangeDays()}j`;
}

function performanceChurnRate(kpis) {
  const churn = cleanValue(kpis.churnRate || kpis.churn || kpis.turnRate || kpis.turn);
  if (churn) return churn.includes("%") ? churn : `${churn}%`;
  const retention = Number(cleanValue(kpis.retentionRate || kpis.retention).replace("%", ""));
  if (Number.isFinite(retention) && retention > 0) return `${Math.max(0, 100 - retention).toFixed(1)}%`;
  return "-";
}

function countClientsInRange(clients, rangeDays) {
  return clients.filter((client) => dateIsInPerformanceRange(client.memberSince || client.startDate || client.membershipStart || client.createdAt)).length;
}

function countCheckupsInRange(data, rangeDays) {
  const rows = collectRows(
    data.checkups,
    data.checkupResponses,
    data.csmCheckups,
    data.v3 && data.v3.checkups
  );
  if (rows.length) {
    return rows
      .filter((row) => coachRowMatchesActive(row))
      .filter((row) => dateIsInPerformanceRange(row.date || row.Date || row.submitted_at || row.submittedAt || row.checkupDate || row["Date"])).length;
  }
  return (data.clients || []).filter((client) => dateIsInPerformanceRange(client.lastCheckup || client.lastCheckupDate || client.lastConsultation)).length;
}

function coachRowMatchesActive(row) {
  const coach = cleanValue(row && (row.coach || row.Coach || row.coach_name || row.coachName || row["coach"]));
  if (!coach || !state.activeCoach || state.activeCoach === DEMO_COACH) return true;
  const active = normalizeName(state.activeCoach);
  const rowCoach = normalizeName(coach);
  if (!rowCoach) return true;
  if (rowCoach === active) return true;
  const first = active.split("_")[0];
  return first && rowCoach.indexOf(first) !== -1;
}

function dateIsWithinRange(value, rangeDays) {
  if (!value) return false;
  const days = daysBetween(value, demoDate(0));
  return Number.isFinite(days) && days >= 0 && days <= rangeDays;
}

function dateIsInPerformanceRange(value) {
  if (!value) return false;
  const date = new Date(toDateInputValue(value) || value);
  if (isNaN(date.getTime())) return false;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (state.performanceRange === "month") {
    return target.getFullYear() === startToday.getFullYear() && target.getMonth() === startToday.getMonth();
  }
  if (state.performanceRange === "lastMonth") {
    const lastMonth = new Date(startToday.getFullYear(), startToday.getMonth() - 1, 1);
    return target.getFullYear() === lastMonth.getFullYear() && target.getMonth() === lastMonth.getMonth();
  }
  return dateIsWithinRange(value, performanceRangeDays());
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
      <article class="compact-row"><strong>Performance separee</strong><p>Churn, risques coach et impacts restent dans Performance pour eviter de surcharger le to-do.</p></article>
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
    demoClient("benoit-laroche", "Benoit Laroche", "Semi-Prive 1x/sem", -130, 22, "Client actif", "70%", 0, "", ""),
    demoClient("laura-pelletier", "Laura Pelletier", "Alumni", -500, 210, "Alumni a relancer", "", 0, "", ""),
    demoClient("michael-test", "Michael Test", "Client test", -10, 999, "Test libre", "100%", 0, "", "")
  ];
  clients[0].systemSignal = "Demo: annulations frequentes detectees";
  const tasks = [
    demoTask("task-program-alex", "P1", "Programme", "alex-martin", "Alex Martin", "Preparer le programme en retard", "Programme CoachRx depasse et compliance basse", demoDate(0)),
    demoTask("task-rebooking-emilie", "P2", "Rebooking", "emilie-fortin", "Emilie Fortin", "Rebooker les prochaines seances", "Recurrence prevue dans Kilo a valider dans moins de 30 jours", demoDate(5)),
    demoTask("task-form-mathieu", "P2", "Formulaire", "mathieu-cote", "Mathieu Cote", "Relancer questionnaire sans reponse", "Questionnaire envoye il y a 8 jours, aucune reponse recue", demoDate(0)),
    demoTask("task-foundation-camille", "P2", "Programme", "camille-roy", "Camille Roy", "Planifier la suite Fondation", "Fin membership manuelle a valider", demoDate(15)),
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
      holds: [],
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
  return {
    clientKey,
    client,
    coach: DEMO_COACH,
    includeDashboard: "Oui",
    relationStatus: "Actif demo",
    activePackage,
    memberSince,
    membershipEnd: "",
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
    if (["lu", "action_completee", "archive"].includes(status)) {
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
  }, "Simulation questionnaire: aucun SMS envoye.");
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
      data.tasks.push(demoTask("task-rebook-" + normalizeName(clientName) + "-" + Date.now(), days <= 14 ? "P1" : "P2", "Rebooking", clientKey || normalizeName(clientName), clientName, "Rebooker les prochaines seances", "Recurrence prevue dans Kilo a valider dans " + days + " jours", endDate));
    }
  }, "Recurrence Kilo demo enregistree.");
}

function demoSaveMembershipEnd(clientKey, clientName, endDate, notes) {
  mutateDemoData((data) => {
    const key = clientKey || normalizeName(clientName);
    const client = (data.clients || []).find((item) => item.clientKey === key || item.client === clientName);
    if (client) {
      client.membershipEnd = endDate;
      client.membershipEndNotes = notes;
    }
    const days = daysBetween(demoDate(0), endDate);
    if (Number.isFinite(days) && days >= 0 && days <= 30) {
      data.tasks.push(demoTask("task-membership-" + key + "-" + Date.now(), days <= 14 ? "P1" : "P2", "Retention", key, clientName, "Preparer la suite du membership", "Fin membership manuelle dans " + days + " jours", endDate));
    }
  }, "Fin membership demo enregistree.");
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
        serviceEndNotes: "Scenario: recurrence Kilo a valider dans 14 jours.",
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
        signal: "Scenario: membership manuel dans moins de 30 jours.",
        systemSignal: "Alerte retention: fin membership manuelle proche."
      });
      upsertDemoTask(data, demoTask("scenario-membership-camille", "P2", "Retention", "camille-roy", "Camille Roy", "Valider suite du membership", "Scenario demo: fin membership manuelle dans 25 jours.", demoDate(10)));
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
  if (["Fait", "Ignore"].includes(status) && taskId) {
    state.localHiddenTaskIds.add(taskId);
    writeStoredArray(LOCAL_TASK_KEY, Array.from(state.localHiddenTaskIds));
    state.lastUndo = { type: "local-hide", taskId };
    showToast(
      status === "Fait"
        ? "Action notee. Synchronisation en arriere-plan."
        : "Tache masquee. Synchronisation en arriere-plan.",
      true
    );
    render();
    callApi("setTaskStatus", { taskId, rowNumber, status })
      .then(() => showToast("Action synchronisee."))
      .catch(() => showToast("Action gardee localement. Le backend est lent ou indisponible.", true));
    return;
  }
  try {
    await callApi("setTaskStatus", { taskId, rowNumber, status });
    showToast("Statut enregistre.");
    render();
  } catch (error) {
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
    applyDataResult(response);
    showToast(["lu", "action_completee", "archive"].includes(status) ? "Questionnaire marque lu." : "Questionnaire mis a jour.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function sendQuestionnaire(clientKey, clientName, taskId) {
  if (!state.isDemo && !QUESTIONNAIRE_LIVE_ENABLED) {
    showToast("Envoi questionnaire en pause pour le pilote. Aucun SMS envoye.", true);
    return;
  }
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
    applyDataResult(response);
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
    applyDataResult(response);
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

async function updateRebookingStatus(payload) {
  if (state.isDemo) {
    showToast(payload.status === "OUVERT" ? "Rebooking demo reouvert." : "Rebooking demo marque gere.");
    return;
  }
  const action = payload.status === "OUVERT" ? "reouvrir ce dossier rebooking" : "marquer ce rebooking comme gere";
  if (!window.confirm(`Veux-tu ${action} pour ${payload.client || "ce client"}?`)) return;
  showToast("Mise a jour rebooking...");
  try {
    const response = await callApi("updateRebookingStatus", {
      coach: state.activeCoach,
      cancellationId: payload.cancellationId,
      clientKey: payload.clientKey,
      client: payload.client,
      status: payload.status,
      reason: payload.status === "OUVERT" ? "" : "ENTENTE_PRISE",
      note: "Mis a jour depuis Dashboard Coach"
    });
    applyDataResult(response);
    showToast(payload.status === "OUVERT" ? "Dossier rebooking reouvert." : "Rebooking marque gere.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function saveClientServiceEnd(clientKey, clientName) {
  const endDate = document.getElementById("clientServiceEndDate") ? document.getElementById("clientServiceEndDate").value : "";
  const notes = document.getElementById("clientServiceEndNote") ? document.getElementById("clientServiceEndNote").value : "";
  if (!clientName) return showToast("Client introuvable.");
  if (!endDate) return showToast("Ajoute la date de recurrence prevue dans Kilo.");
  if (state.isDemo) {
    demoSaveServiceEnd(clientKey, clientName, endDate, notes);
    return;
  }
  try {
    const response = await callApi("saveServiceEnd", {
      coach: state.activeCoach,
      clientKey,
      client: clientName,
      serviceType: "Recurrence Kilo",
      endDate,
      source: "Manuel coach",
      notes,
      status: "Actif"
    });
    applyDataResult(response);
    showToast("Recurrence Kilo enregistree.");
    render();
  } catch (error) {
    renderError(error);
  }
}

async function saveClientMembershipEnd(clientKey, clientName) {
  const endDate = document.getElementById("clientMembershipEndDate") ? document.getElementById("clientMembershipEndDate").value : "";
  const notes = document.getElementById("clientMembershipEndNote") ? document.getElementById("clientMembershipEndNote").value : "";
  if (!clientName) return showToast("Client introuvable.");
  if (!endDate) return showToast("Ajoute la fin de membership manuelle.");
  const client = ((state.data && state.data.clients) || []).find((item) => item.clientKey === clientKey || item.client === clientName) || {};
  const payload = {
    clientKey: clientKey || client.clientKey || normalizeName(clientName),
    client: client.client || clientName,
    phone: client.phone || "",
    email: client.email || "",
    activePackage: client.activePackage || "Client manuel",
    membershipEnd: endDate,
    objective: client.objective || "",
    notes,
    coach: state.activeCoach || ""
  };
  if (state.isDemo) {
    demoSaveMembershipEnd(payload.clientKey, payload.client, endDate, notes);
    return;
  }
  state.data = state.data || {};
  state.data.clients = state.data.clients || [];
  const localClient = Object.assign({}, client, payload, {
    signal: client.signal || "Fin membership mise a jour manuellement"
  });
  upsertLocalClient(localClient, clientKey);
  showToast("Fin membership enregistree localement. Synchronisation en arriere-plan.", true);
  render();
  if (state.modalClientKey) openClientModal(localClient.clientKey);
  try {
    const response = await callApi("saveManualClient", payload);
    applyDataResult(response);
    showToast("Fin membership synchronisee.");
    render();
    if (state.modalClientKey) openClientModal(localClient.clientKey);
  } catch (error) {
    showToast("Fin membership gardee localement. Backend lent ou indisponible.", true);
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
  const localClient = optimisticManualClient(payload);
  state.data = state.data || {};
  state.data.clients = state.data.clients || [];
  upsertLocalClient(localClient);
  state.showManualClientForm = false;
  state.selectedClientKey = localClient.clientKey;
  showToast("Client ajoute localement. Synchronisation en arriere-plan.", true);
  render();
  try {
    const response = await callApi("saveManualClient", payload);
    if (response.result && Array.isArray(response.result.clients)) state.data = response.result;
    showToast("Client synchronise.");
    render();
  } catch (error) {
    showToast("Client garde localement. Backend lent ou indisponible.", true);
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
  const localClient = optimisticManualClient(Object.assign({}, payload, { clientKey }));
  state.data = state.data || {};
  state.data.clients = state.data.clients || [];
  upsertLocalClient(localClient, clientKey);
  state.editingClientKey = "";
  state.selectedClientKey = localClient.clientKey;
  showToast("Client mis a jour localement. Synchronisation en arriere-plan.", true);
  render();
  if (state.modalClientKey) openClientModal(localClient.clientKey);
  try {
    const response = await callApi("saveManualClient", Object.assign({}, payload, { clientKey }));
    if (response.result && Array.isArray(response.result.clients)) state.data = response.result;
    showToast("Client synchronise.");
    render();
    if (state.modalClientKey) openClientModal(localClient.clientKey);
  } catch (error) {
    showToast("Modification gardee localement. Backend lent ou indisponible.", true);
  }
}

function optimisticManualClient(payload) {
  const clientKey = cleanValue(payload.clientKey) || normalizeName(payload.client);
  return {
    clientKey,
    client: payload.client,
    coach: payload.coach || state.activeCoach || "",
    phone: payload.phone || "",
    email: payload.email || "",
    activePackage: payload.activePackage || "Client manuel",
    membershipEnd: payload.membershipEnd || "",
    plannedExitDate: payload.plannedExitDate || "",
    objective: payload.objective || "",
    signal: payload.objective || "Client ajoute manuellement",
    source: "Ajout manuel dashboard",
    openTasks: 0,
    context: {}
  };
}

function upsertLocalClient(client, previousKey) {
  const clients = (state.data && state.data.clients) || [];
  const keys = [previousKey, client.clientKey].filter(Boolean);
  const index = clients.findIndex((item) => keys.includes(item.clientKey));
  if (index >= 0) {
    clients[index] = Object.assign({}, clients[index], client);
    return;
  }
  clients.push(client);
}

function applyDataResult(response) {
  const result = response && response.result;
  if (result && (Array.isArray(result.tasks) || Array.isArray(result.clients) || result.v3 || result.summary)) {
    state.data = result;
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
    applyDataResult(response);
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
    applyDataResult(response);
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
    applyDataResult(response);
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
    applyDataResult(response);
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
    applyDataResult(response);
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
    applyDataResult(response);
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
    applyDataResult(response);
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
    applyDataResult(response);
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
    applyDataResult(response);
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
    applyDataResult(response);
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
  const dueDate = demoDate(0);
  if (!note) return showToast("Ajoute une note ou une transcription.");
  if (state.isDemo) {
    demoSaveQuickCapture(note, priority, dueDate);
    return;
  }
  const createdTasks = splitQuickCapture(note).map((line, index) => ({
    taskId: `local_capture_${Date.now()}_${index}`,
    priority,
    type: "Suivi client",
    clientKey: "",
    client: detectClientFromNote(line, (state.data && state.data.clients) || [])?.client || "Note coach",
    action: line,
    title: line,
    why: "Capture rapide coach",
    due: dueDate,
    status: ""
  }));
  if (createdTasks.length) {
    state.data = state.data || {};
    state.data.tasks = (state.data.tasks || []).concat(createdTasks);
    document.getElementById("quickCaptureText").value = "";
    showToast(`${createdTasks.length} mission${createdTasks.length > 1 ? "s" : ""} creee${createdTasks.length > 1 ? "s" : ""} localement. Synchronisation en arriere-plan.`, true);
    state.activeView = "mission";
    state.activeMissionFilter = "manual";
    render();
  }
  try {
    const response = await callApi("createTasksFromNote", {
      coach: state.activeCoach,
      note,
      priority,
      dueDate,
      source: "Capture rapide coach"
    });
    if (response.result && Array.isArray(response.result.tasks)) state.data = response.result;
    showToast("Capture rapide synchronisee.");
    render();
  } catch (error) {
    showToast("Capture gardee localement. Backend lent ou indisponible.", true);
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
    applyDataResult(response);
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
    applyDataResult(response);
    showToast("Impact supprime.");
    render();
  } catch (error) {
    renderError(error);
  }
}

function renderError(error) {
  els.content.className = "content";
  const statusUrl = state.apiUrl + "?api=status";
  const diagnosticUrl = state.apiUrl + "?api=coach-app&action=getData&coach=" + encodeURIComponent(state.activeCoach || "Marc-Andre Menard") + "&appPin=" + encodeURIComponent(state.appPin || "") + "&callback=cb";
  els.content.innerHTML = `
    <div class="error">
      <p><strong>Connexion backend a verifier.</strong></p>
      <p>${escapeHtml(error.message || String(error))}</p>
      <p class="muted">Si le test status affiche du JSON avec <code>"ok":true</code>, Apps Script est vivant. Si le diagnostic complet commence par <code>cb(</code>, le PIN et l'action dashboard repondent aussi.</p>
      <div class="actions-row" style="justify-content:center">
        <button class="primary" id="retryOfficialBackend">Reessayer endpoint officiel</button>
        <button id="resetPrivateLogin">Changer le PIN</button>
        <button id="openDemoFromError">Ouvrir demo</button>
        <a class="button-link" href="${escapeAttr(statusUrl)}" target="_blank" rel="noopener">Tester status backend</a>
        <a class="button-link" id="openBackendDiagnostic" href="${escapeAttr(diagnosticUrl)}" target="_blank" rel="noopener">Diagnostic complet</a>
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
  const demo = document.getElementById("openDemoFromError");
  if (demo) demo.addEventListener("click", startDemoMode);
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
