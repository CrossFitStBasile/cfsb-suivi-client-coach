const DEPLOYMENT_ID = "AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ";
const DEFAULT_API_URL = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;
const DEFAULT_AUTHUSER = "0";
const STATIC_INDEX_URL = "./data/index.json";
const LOCAL_TASK_KEY = "cfsbCoachLocalHiddenTasks";

const state = {
  apiUrl: normalizeApiUrl(localStorage.getItem("cfsbCoachApiUrl") || DEFAULT_API_URL),
  appPin: localStorage.getItem("cfsbCoachAppPin") || "",
  activeView: "today",
  activeCoach: localStorage.getItem("cfsbCoachName") || "",
  selectedClientKey: "",
  data: null,
  sourceMode: "Snapshot GitHub",
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
  manualPanel: document.getElementById("manualPanel")
};

document.querySelectorAll(".views button").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeView = button.dataset.view;
    document.querySelectorAll(".views button").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

document.getElementById("refreshBtn").addEventListener("click", () => loadData(false, true));
document.getElementById("settingsBtn").addEventListener("click", () => {
  document.getElementById("apiUrlInput").value = state.apiUrl;
  document.getElementById("appPinInput").value = state.appPin;
  els.settingsPanel.classList.toggle("hidden");
});
document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
document.getElementById("addTaskBtn").addEventListener("click", () => els.manualPanel.classList.remove("hidden"));
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
  try {
    if (!rebuild) {
      await loadStaticSnapshot();
      if (notify) showToast("Sauvegarde GitHub chargee.");
      return;
    }
    const response = await callApi(rebuild ? "rebuild" : "getData", {});
    state.data = response.result;
    state.sourceMode = "Live Apps Script";
    if (!state.activeCoach) {
      state.activeCoach = state.data.activeCoach || "";
      localStorage.setItem("cfsbCoachName", state.activeCoach);
    }
    render();
  } catch (error) {
    if (rebuild) {
      try {
        await loadStaticSnapshot();
        showToast("Backend live bloque; sauvegarde GitHub chargee.");
        return;
      } catch (_snapshotError) {
        // The live error is more useful for the user-facing diagnostic.
      }
    }
    renderError(error);
  }
}

async function loadStaticSnapshot() {
  const index = await fetchJson(STATIC_INDEX_URL);
  const coaches = index.coaches || [];
  if (!coaches.length) throw new Error("Aucun coach dans la sauvegarde GitHub.");
  if (!state.activeCoach || !coaches.some((coach) => coach.coach === state.activeCoach)) {
    state.activeCoach = index.defaultCoach || coaches[0].coach;
    localStorage.setItem("cfsbCoachName", state.activeCoach);
  }
  const selectedCoach = coaches.find((coach) => coach.coach === state.activeCoach) || coaches[0];
  const data = await fetchJson(`${selectedCoach.path}?v=${encodeURIComponent(index.generatedAt || Date.now())}`);
  data.coaches = coaches.map((coach) => ({
    coach: coach.coach,
    coachId: coach.coachId || "",
    dashboardSheet: coach.dashboardSheet || "",
    active: "Oui"
  }));
  data.activeCoach = selectedCoach.coach;
  data.snapshot = data.snapshot || {
    generatedAt: index.generatedAt,
    source: "GitHub Pages static snapshot"
  };
  state.data = data;
  state.sourceMode = "Snapshot GitHub";
  render();
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Sauvegarde GitHub non disponible (${response.status}).`);
  return response.json();
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
  const sourceSuffix = state.sourceMode === "Snapshot GitHub"
    ? ` | Source: sauvegarde GitHub ${data.snapshot && data.snapshot.generatedAt ? data.snapshot.generatedAt : ""}`
    : " | Source: live";
  els.sourceLine.textContent = `${data.activeCoach || "Coach"} | Dashboard: ${data.dashboardUpdatedAt || "-"} | App: ${data.generatedAt || "-"}${sourceSuffix}`;

  if (state.activeView === "clients") return renderClients(data.clients || []);
  if (state.activeView === "retention") return renderRetention(data.v3 || {});
  if (state.activeView === "alumni") return renderAlumni(data.v3 || {});
  if (state.activeView === "impacts") return renderImpacts(data.v3 || {});

  const tasks = filterTasks(data.tasks || []).filter((task) => !state.localHiddenTaskIds.has(task.taskId));
  if (state.activeView === "today") return renderMission(tasks, data.clients || []);
  renderTaskBoard(tasks, data.clients || []);
}

function renderCoachSelect(data) {
  const coaches = data.coaches || [];
  els.coachSelect.innerHTML = coaches.map((coach) => `<option value="${escapeAttr(coach.coach)}">${escapeHtml(coach.coach)}</option>`).join("");
  els.coachSelect.value = state.activeCoach || data.activeCoach || "";
}

function filterTasks(tasks) {
  if (state.activeView === "today") return tasks.filter((task) => task.priority === "P1" || ["Programme", "Rebooking", "Formulaire", "Validation", "Retention", "Impact"].includes(task.type));
  const map = { programs: "Programme", rebookings: "Rebooking", forms: "Formulaire", validations: "Validation" };
  return map[state.activeView] ? tasks.filter((task) => task.type === map[state.activeView]) : tasks;
}

function renderMission(tasks, clients) {
  els.content.className = "content mission-layout";
  const urgentTasks = tasks.filter((task) => task.priority === "P1");
  const programTasks = tasks.filter((task) => task.type === "Programme");
  const rebookingTasks = tasks.filter((task) => task.type === "Rebooking");
  const formTasks = tasks.filter((task) => task.type === "Formulaire");
  const firstTask = tasks[0];
  if (!state.selectedClientKey && firstTask) state.selectedClientKey = firstTask.clientKey || "";
  const selectedClient = getSelectedClient(clients, tasks);

  els.content.innerHTML = `
    <section class="mission-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Mission du jour</p>
          <h2>${tasks.length ? `${tasks.length} action${tasks.length > 1 ? "s" : ""} a traiter` : "Aucune action ouverte"}</h2>
        </div>
        <span class="freshness">${escapeHtml(state.sourceMode)}</span>
      </div>
      <div class="priority-strip">
        ${priorityTile("Urgent", urgentTasks.length, "p1")}
        ${priorityTile("Programmes", programTasks.length, "p2")}
        ${priorityTile("Rebookings", rebookingTasks.length, "p3")}
        ${priorityTile("Questionnaires", formTasks.length, "p4")}
      </div>
      ${tasks.length ? `<div class="action-list">${tasks.slice(0, 14).map(taskRow).join("")}</div>` : '<div class="empty">Aucune action ici.</div>'}
    </section>
    ${clientFocusPanel(selectedClient, tasks)}
  `;
  attachTaskControls();
  attachClientSelectors();
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

function viewLabel(view) {
  const labels = {
    programs: "Programmes",
    rebookings: "Rebookings",
    forms: "Questionnaires",
    validations: "A valider"
  };
  return labels[view] || "Actions";
}

function renderClients(clients) {
  els.content.className = "content";
  els.content.innerHTML = clients.length ? clients.map((client) => `
    <article class="card">
      <div class="card-head"><div><div class="client">${escapeHtml(client.client)}</div><div class="why">${escapeHtml(client.signal || client.objective || "")}</div></div><span class="tag">${client.openTasks || 0} action(s)</span></div>
      <div class="facts">
        ${client.activePackage ? `<span class="fact"><b>Membership:</b> ${escapeHtml(client.activePackage)}</span>` : ""}
        ${client.riskLevel && client.riskLevel !== "Stable" ? `<span class="fact"><b>Risque:</b> ${escapeHtml(client.riskLevel)}</span>` : ""}
        ${client.rebookingTotal ? `<span class="fact"><b>Rebooking:</b> ${escapeHtml(client.rebookingTotal)}</span>` : ""}
      </div>
    </article>`).join("") : '<div class="empty">Aucun client consolide.</div>';
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

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
