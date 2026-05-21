const DEPLOYMENT_ID = "AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ";
const DEFAULT_API_URL = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;
const DEFAULT_AUTHUSER = "0";
const LOCAL_TASK_KEY = "cfsbCoachLocalHiddenTasks";

const state = {
  apiUrl: normalizeApiUrl(localStorage.getItem("cfsbCoachApiUrl") || DEFAULT_API_URL),
  appPin: localStorage.getItem("cfsbCoachAppPin") || "",
  activeView: normalizeView(localStorage.getItem("cfsbCoachView") || "mission"),
  activeMissionFilter: "all",
  activeQuestionnaireFilter: "all",
  activeCoach: localStorage.getItem("cfsbCoachName") || "",
  selectedClientKey: "",
  data: null,
  sourceMode: "Backend prive",
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
});

document.getElementById("refreshBtn").addEventListener("click", () => loadData(false, true));
document.getElementById("systemToggleBtn").addEventListener("click", () => els.systemPanel.classList.toggle("hidden"));
document.getElementById("settingsBtn").addEventListener("click", () => {
  document.getElementById("apiUrlInput").value = state.apiUrl;
  document.getElementById("appPinInput").value = state.appPin;
  els.settingsPanel.classList.toggle("hidden");
});
document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
document.getElementById("addTaskBtn").addEventListener("click", () => {
  els.manualPanel.classList.remove("hidden");
});
document.getElementById("cancelManualBtn").addEventListener("click", () => els.manualPanel.classList.add("hidden"));
document.getElementById("saveManualBtn").addEventListener("click", saveManualTask);
els.coachSelect.addEventListener("change", () => {
  state.activeCoach = els.coachSelect.value;
  localStorage.setItem("cfsbCoachName", state.activeCoach);
  loadData(false, true);
});

loadData(false);

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
  return new Promise((resolve, reject) => {
    const callback = "__cfsbCoachCb" + Date.now() + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const params = new URLSearchParams({
      api: "coach-app",
      action,
      callback,
      coach: state.activeCoach || "",
      appPin: state.appPin || "",
      authuser: DEFAULT_AUTHUSER,
      v: Date.now().toString()
    });
    if (payload && Object.keys(payload).length) params.set("payload", JSON.stringify(payload));
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
      reject(new Error("Impossible de rejoindre le backend. Endpoint tente: " + apiUrl));
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
  const sourceSuffix = " | Source: backend prive";
  els.sourceLine.textContent = `${data.activeCoach || "Coach"} | Dashboard: ${data.dashboardUpdatedAt || "-"} | App: ${data.generatedAt || "-"}${sourceSuffix}`;

  if (state.activeView === "clients") return renderClients(data.clients || []);
  if (state.activeView === "questionnaires") return renderQuestionnaireInbox(data);
  if (state.activeView === "performance") return renderPerformance(data);
  if (state.activeView === "admin") return renderAdmin(data);

  const tasks = filterTasks(data.tasks || []).filter((task) => !state.localHiddenTaskIds.has(task.taskId));
  if (state.activeView === "mission") return renderMission(tasks, data.clients || []);
  renderTaskBoard(tasks, data.clients || []);
}

function renderCoachSelect(data) {
  const coaches = data.coaches || [];
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
          <p>Les donnees client ne sont plus chargees depuis GitHub Pages. Entre le PIN ou le jeton du backend prive dans Systeme > Configuration pour ouvrir le dashboard.</p>
        </div>
      </div>
      <div class="focus-note"><strong>Pourquoi</strong><p>Le questionnaire public peut rester sur GitHub Pages, mais les reponses clients et les fiches coach doivent passer par un backend authentifie.</p></div>
      <div class="actions-row">
        <button class="primary" id="openPrivateSettings">Ouvrir la configuration</button>
      </div>
    </section>
  `;
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
      ${tasks.length ? `<div class="action-list">${tasks.map(taskRow).join("")}</div>` : '<div class="empty">Aucune action ici.</div>'}
    </section>
    ${clientFocusPanel(selectedClient, tasks)}
  `;
  attachTaskControls();
  attachClientSelectors();
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
    info.riskLevel && info.riskLevel !== "Stable" && `Risque: ${info.riskLevel}`
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
      <div class="row-actions">
        <button data-task-id="${escapeAttr(task.taskId || "")}" data-row="${escapeAttr(task.rowNumber || "")}" data-status="En cours">En cours</button>
        <button data-task-id="${escapeAttr(task.taskId || "")}" data-row="${escapeAttr(task.rowNumber || "")}" data-status="Ignore">Masquer</button>
        <button class="done" data-task-id="${escapeAttr(task.taskId || "")}" data-row="${escapeAttr(task.rowNumber || "")}" data-status="Fait">Fait</button>
      </div>
    </article>`;
}

function clientFocusPanel(client, tasks) {
  if (!client) {
    return '<aside class="client-focus"><div class="empty">Selectionne un client.</div></aside>';
  }
  const clientTasks = tasks.filter((task) => task.clientKey === client.clientKey);
  const context = client.context || {};
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
        ${client.program ? focusFact("Programme", client.program) : ""}
        ${client.comp30 ? focusFact("Compliance", client.comp30) : ""}
        ${client.rebookingTotal ? focusFact("Rebooking", client.rebookingTotal) : ""}
        ${client.riskLevel ? focusFact("Risque", client.riskLevel) : ""}
      </div>
      ${client.signal ? `<div class="focus-note"><strong>Signal</strong><p>${escapeHtml(client.signal)}</p></div>` : ""}
      ${context.longTermSummary ? `<div class="focus-note"><strong>Plan CoachRx</strong><p>${escapeHtml(context.longTermSummary).slice(0, 520)}${context.longTermSummary.length > 520 ? "..." : ""}</p></div>` : ""}
      ${context.objectives ? `<div class="focus-note"><strong>Objectifs</strong><p>${escapeHtml(context.objectives)}</p></div>` : ""}
      ${clientTasks.length ? `<div class="focus-note"><strong>Actions liees</strong>${clientTasks.slice(0, 4).map((task) => `<p>${escapeHtml(task.action || "")}</p>`).join("")}</div>` : ""}
    </aside>
  `;
}

function focusFact(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
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

function attachMissionFilters() {
  els.content.querySelectorAll("[data-mission-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeMissionFilter = button.dataset.missionFilter;
      render();
    });
  });
}

function viewLabel(view) {
  const labels = {
    programs: "Programmes",
    rebookings: "Rebookings",
    forms: "Questionnaires",
    validations: "A valider"
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
    alumni: "performance",
    impacts: "performance"
  };
  return map[view] || (["mission", "clients", "questionnaires", "performance", "admin"].includes(view) ? view : "mission");
}

function renderClients(clients) {
  const sortedClients = clients.slice().sort((a, b) => Number(b.openTasks || 0) - Number(a.openTasks || 0));
  if (!state.selectedClientKey && sortedClients[0]) state.selectedClientKey = sortedClients[0].clientKey;
  els.content.className = "content mission-layout";
  els.content.innerHTML = `
    <section class="mission-panel">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Portefeuille client</p>
          <h2>${clients.length} client${clients.length > 1 ? "s" : ""} supervises</h2>
          <p>La liste est triee par nombre d'actions ouvertes pour aider le coach a commencer par les clients qui demandent le plus d'attention.</p>
        </div>
      </div>
      <div class="client-directory">
        ${sortedClients.length ? sortedClients.map(clientDirectoryRow).join("") : '<div class="empty">Aucun client consolide.</div>'}
      </div>
    </section>
    ${clientFocusPanel(getSelectedClient(sortedClients, []), state.data.tasks || [])}
  `;
  attachClientSelectors();
}

function clientDirectoryRow(client) {
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
        ${client.riskLevel ? `<span class="tag bad">${escapeHtml(client.riskLevel)}</span>` : ""}
        ${client.program ? `<span class="tag warn">${escapeHtml(client.program)}</span>` : ""}
      </div>
    </article>`;
}

function renderQuestionnaireInbox(data) {
  const responses = collectQuestionnaireResponses(data);
  const sends = collectQuestionnaireSendLog(data);
  const filtered = filterQuestionnaireResponses(responses);
  const urgent = responses.filter((row) => ["rouge", "orange"].includes(row.triageStatus));
  const unmatched = responses.filter((row) => row.matchStatus === "non_matche");
  const unread = responses.filter((row) => !["lu", "action_completee", "archive"].includes(row.processingStatus));
  els.content.className = "content performance-grid";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Inbox questionnaire</p>
          <h2>Suivis clients recus</h2>
          <p>Cette vue centralise les reponses du questionnaire client-coach. Elle doit rester privee: aucun detail client ne doit etre servi depuis un fichier JSON public.</p>
        </div>
      </div>
      <div class="priority-strip">
        ${priorityTile("Reponses", responses.length, "p4")}
        ${priorityTile("Urgentes", urgent.length, "p1")}
        ${priorityTile("Non matchees", unmatched.length, "p2")}
        ${priorityTile("Non traitees", unread.length, "p3")}
      </div>
      ${questionnaireFilters(responses)}
    </section>
    <section class="mission-panel performance-hero">
      <div class="section-head"><div><p class="eyebrow">A traiter</p><h2>${filtered.length} reponse${filtered.length > 1 ? "s" : ""}</h2></div></div>
      ${filtered.length ? `<div class="questionnaire-list">${filtered.map(questionnaireRow).join("")}</div>` : '<div class="empty">Aucune reponse dans ce filtre.</div>'}
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Non matchees</p><h2>Validation client</h2></div></div>
      ${unmatched.length ? unmatched.slice(0, 8).map((row) => `<article class="compact-row"><strong>${escapeHtml(row.clientName || "Client a valider")}</strong><p>Telephone: ${escapeHtml(row.clientPhoneNormalized || "-")}</p><p>Action: creer ou corriger le lien client dans CORE_Clients.</p></article>`).join("") : '<div class="empty">Toutes les reponses recues sont matchees ou aucune reponse recue.</div>'}
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Relances</p><h2>Envoyes sans reponse</h2></div></div>
      ${sends.length ? sends.slice(0, 8).map((row) => `<article class="compact-row"><strong>${escapeHtml(row.client || row.clientName || "Client")}</strong><p>Envoye: ${escapeHtml(row.sentAt || row.sent_at || "-")} | statut: ${escapeHtml(row.status || "a suivre")}</p><p>${escapeHtml(row.note || row.details || "")}</p></article>`).join("") : '<div class="empty">Journal des formulaires envoyes a connecter au backend.</div>'}
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

function questionnaireFilters(responses) {
  const filters = [
    ["all", "Toutes", responses.length],
    ["unmatched", "Non matchees", responses.filter((row) => row.matchStatus === "non_matche").length],
    ["urgent", "Rouge / orange", responses.filter((row) => ["rouge", "orange"].includes(row.triageStatus)).length],
    ["unread", "Non traitees", responses.filter((row) => !["lu", "action_completee", "archive"].includes(row.processingStatus)).length]
  ];
  return `<div class="mission-filters">${filters.map(([id, label, count]) => `<button class="${state.activeQuestionnaireFilter === id ? "active" : ""}" data-questionnaire-filter="${id}">${escapeHtml(label)} <span>${count}</span></button>`).join("")}</div>`;
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
  const rows = (v3.retention || []).filter((row) => row.riskLevel && row.riskLevel !== "Stable");
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
    ${rows.length ? rows.map((row) => `<article class="compact-row"><strong>${escapeHtml(row.client)} <span class="tag warn">${escapeHtml(row.riskLevel)}</span></strong><p>${escapeHtml(row.riskReasons || "A valider")}</p></article>`).join("") : '<div class="empty">Aucun signal de risque notable.</div>'}`;
}

function renderAlumni(v3) {
  const rows = v3.alumni || [];
  els.content.className = "content";
  els.content.innerHTML = `
    <section class="panel full">
      <h2>Alumni</h2>
      <div class="form-grid">
        <input id="alumniClient" placeholder="Nom alumni">
        <input id="alumniNext" type="date">
        <input id="alumniReason" placeholder="Raison / contexte">
        <textarea id="alumniNotes" class="wide" placeholder="Notes"></textarea>
      </div>
      <div class="actions-row"><button id="saveAlumniBtn" class="primary">Ajouter / mettre a jour</button></div>
    </section>
    ${rows.length ? rows.map((row) => `<article class="compact-row"><strong>${escapeHtml(row.client)}</strong><p>Prochain contact: ${escapeHtml(row.nextContactDue || "A planifier")}</p><p>${escapeHtml(row.notes || "")}</p></article>`).join("") : '<div class="empty">Aucun alumni entre.</div>'}`;
  document.getElementById("saveAlumniBtn").addEventListener("click", saveAlumni);
}

function renderImpacts(v3) {
  const rows = (v3.impacts && v3.impacts.log) || [];
  els.content.className = "content";
  els.content.innerHTML = `
    <section class="panel full">
      <h2>Impacts et upsells</h2>
      <div class="form-grid">
        <input id="impactClient" placeholder="Client / membre / reference">
        <select id="impactType"><option>Evaluation physique</option><option>Semi-prive</option><option>Prive</option><option>Reference fermee</option><option>Alumni reactive</option><option>Autre impact</option></select>
        <input id="impactAmount" placeholder="Montant approx.">
        <input id="impactDate" type="date">
        <textarea id="impactNotes" class="wide" placeholder="Notes"></textarea>
      </div>
      <div class="actions-row"><button id="saveImpactBtn" class="primary">Declarer impact</button></div>
    </section>
    ${rows.length ? rows.slice().reverse().slice(0, 20).map((row) => `<article class="compact-row"><strong>${escapeHtml(row.impactType || "Impact")} ${row.client ? "- " + escapeHtml(row.client) : ""}</strong><p>${escapeHtml(row.impactDate || "")} ${row.amount ? "| " + escapeHtml(row.amount) + "$" : ""}</p><p>${escapeHtml(row.notes || "")}</p></article>`).join("") : '<div class="empty">Aucun impact declare.</div>'}`;
  document.getElementById("saveImpactBtn").addEventListener("click", saveImpact);
}

function renderPerformance(data) {
  const v3 = data.v3 || {};
  const k = v3.kpis || {};
  const riskRows = (v3.retention || []).filter((row) => row.riskLevel && row.riskLevel !== "Stable");
  const alumni = v3.alumni || [];
  const impacts = (v3.impacts && v3.impacts.log) || [];
  els.content.className = "content performance-grid";
  els.content.innerHTML = `
    <section class="mission-panel performance-hero">
      <div class="command-hero">
        <div>
          <p class="eyebrow">Performance coach</p>
          <h2>Retention, impacts et developpement</h2>
          <p>Cette section sert au pilotage hebdomadaire: garder les clients, reactiver les anciens, et documenter les revenus crees par les coachs.</p>
        </div>
      </div>
      <div class="priority-strip">
        ${priorityTile("Retention approx.", `${k.retentionRate || 0}%`, "p4")}
        ${priorityTile("Clients a risque", k.atRisk || 0, "p1")}
        ${priorityTile("Fins 30 jours", k.serviceEnding30 || 0, "p2")}
        ${priorityTile("Impacts semaine", k.impactsWeek || 0, "p3")}
      </div>
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Risques</p><h2>Clients a surveiller</h2></div></div>
      ${riskRows.length ? riskRows.slice(0, 8).map((row) => `<article class="compact-row"><strong>${escapeHtml(row.client)} <span class="tag bad">${escapeHtml(row.riskLevel)}</span></strong><p>${escapeHtml(row.riskReasons || "A valider")}</p></article>`).join("") : '<div class="empty">Aucun signal de risque notable.</div>'}
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Alumni</p><h2>Reactivation</h2></div></div>
      ${alumni.length ? alumni.slice(0, 8).map((row) => `<article class="compact-row"><strong>${escapeHtml(row.client)}</strong><p>Prochain contact: ${escapeHtml(row.nextContactDue || "A planifier")}</p><p>${escapeHtml(row.notes || "")}</p></article>`).join("") : '<div class="empty">Aucun alumni entre.</div>'}
    </section>
    <section class="mission-panel">
      <div class="section-head"><div><p class="eyebrow">Impacts</p><h2>Revenus crees</h2></div></div>
      ${impacts.length ? impacts.slice().reverse().slice(0, 8).map((row) => `<article class="compact-row"><strong>${escapeHtml(row.impactType || "Impact")} ${row.client ? "- " + escapeHtml(row.client) : ""}</strong><p>${escapeHtml(row.impactDate || "")} ${row.amount ? "| " + escapeHtml(row.amount) + "$" : ""}</p><p>${escapeHtml(row.notes || "")}</p></article>`).join("") : '<div class="empty">Aucun impact declare.</div>'}
    </section>
  `;
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

async function updateTask(taskId, rowNumber, status) {
  try {
    await callApi("setTaskStatus", { taskId, rowNumber, status });
    showToast("Statut enregistre.");
    loadData(false);
  } catch (error) {
    if (["Fait", "Ignore"].includes(status) && taskId) {
      state.localHiddenTaskIds.add(taskId);
      writeStoredArray(LOCAL_TASK_KEY, Array.from(state.localHiddenTaskIds));
      showToast("Action masquee localement. Le backend live reste a connecter.");
      render();
      return;
    }
    renderError(error);
  }
}

async function saveManualTask() {
  const title = document.getElementById("manualTitle").value.trim();
  if (!title) return showToast("Ajoute le rappel.");
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

async function saveAlumni() {
  const client = document.getElementById("alumniClient").value.trim();
  if (!client) return showToast("Ajoute le nom de l'alumni.");
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
  await callApi("saveImpact", {
    coach: state.activeCoach,
    client: document.getElementById("impactClient").value,
    impactType: document.getElementById("impactType").value,
    amount: document.getElementById("impactAmount").value,
    impactDate: document.getElementById("impactDate").value,
    notes: document.getElementById("impactNotes").value
  });
  showToast("Impact enregistre.");
  loadData(false);
}

function renderError(error) {
  els.content.className = "content";
  const diagnosticUrl = state.apiUrl + "?authuser=" + DEFAULT_AUTHUSER + "&api=coach-app&action=getData&coach=" + encodeURIComponent(state.activeCoach || "Marc-Andre Menard") + "&callback=cb";
  els.content.innerHTML = `
    <div class="error">
      <p><strong>Connexion backend a verifier.</strong></p>
      <p>${escapeHtml(error.message || String(error))}</p>
      <p class="muted">Si Chrome avait garde une ancienne URL Apps Script, utilise le bouton ci-dessous. Si le diagnostic ouvre du texte qui commence par <code>cb(</code>, le backend fonctionne et il suffit de revenir au dashboard.</p>
      <div class="actions-row" style="justify-content:center">
        <button class="primary" id="retryOfficialBackend">Reessayer endpoint officiel</button>
        <a class="button-link" id="openBackendDiagnostic" href="${escapeAttr(diagnosticUrl)}" target="_blank" rel="noopener">Ouvrir diagnostic backend</a>
      </div>
    </div>`;
  const retry = document.getElementById("retryOfficialBackend");
  if (retry) retry.addEventListener("click", () => {
    state.apiUrl = DEFAULT_API_URL;
    localStorage.setItem("cfsbCoachApiUrl", DEFAULT_API_URL);
    loadData(false);
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.style.display = "block";
  window.clearTimeout(window.__toastTimer);
  window.__toastTimer = window.setTimeout(() => {
    els.toast.style.display = "none";
  }, 2600);
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

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
