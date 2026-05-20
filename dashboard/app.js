const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ/exec";

const state = {
  apiUrl: localStorage.getItem("cfsbCoachApiUrl") || DEFAULT_API_URL,
  appPin: localStorage.getItem("cfsbCoachAppPin") || "",
  activeView: "today",
  activeCoach: localStorage.getItem("cfsbCoachName") || "",
  data: null
};

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

document.getElementById("refreshBtn").addEventListener("click", () => loadData(true));
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
  loadData(true);
});

loadData(false);

function saveSettings() {
  state.apiUrl = document.getElementById("apiUrlInput").value.trim() || DEFAULT_API_URL;
  state.appPin = document.getElementById("appPinInput").value.trim();
  localStorage.setItem("cfsbCoachApiUrl", state.apiUrl);
  localStorage.setItem("cfsbCoachAppPin", state.appPin);
  els.settingsPanel.classList.add("hidden");
  showToast("Configuration enregistree.");
  loadData(false);
}

async function loadData(rebuild) {
  els.content.innerHTML = '<div class="empty">Chargement du dashboard...</div>';
  try {
    const response = await callApi(rebuild ? "rebuild" : "getData", {});
    state.data = response.result;
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
  return new Promise((resolve, reject) => {
    const callback = "__cfsbCoachCb" + Date.now() + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const params = new URLSearchParams({
      api: "coach-app",
      action,
      callback,
      coach: state.activeCoach || "",
      appPin: state.appPin || ""
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
      reject(new Error("Impossible de rejoindre le backend."));
    };
    script.src = state.apiUrl + "?" + params.toString();
    document.body.appendChild(script);
  });
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
  els.sourceLine.textContent = `${data.activeCoach || "Coach"} | Dashboard: ${data.dashboardUpdatedAt || "-"} | App: ${data.generatedAt || "-"}`;

  if (state.activeView === "clients") return renderClients(data.clients || []);
  if (state.activeView === "retention") return renderRetention(data.v3 || {});
  if (state.activeView === "alumni") return renderAlumni(data.v3 || {});
  if (state.activeView === "impacts") return renderImpacts(data.v3 || {});

  const tasks = filterTasks(data.tasks || []);
  if (!tasks.length) {
    els.content.className = "content";
    els.content.innerHTML = '<div class="empty">Aucune action ici.</div>';
    return;
  }
  els.content.className = "content";
  els.content.innerHTML = tasks.map(taskCard).join("");
  els.content.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => updateTask(button.dataset.taskId, button.dataset.row, button.dataset.status));
  });
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

function taskCard(task) {
  const info = task.clientInfo || {};
  const facts = [
    info.activePackage && `<b>Membership:</b> ${escapeHtml(info.activePackage)}`,
    info.holdStatus && `<b>Hold:</b> ${escapeHtml(info.holdStatus)}`,
    info.serviceEnd && `<b>Fin:</b> ${escapeHtml(info.serviceEnd)}`,
    info.riskLevel && info.riskLevel !== "Stable" && `<b>Risque:</b> ${escapeHtml(info.riskLevel)}`,
    info.rebookingTotal && `<b>Rebooking:</b> ${escapeHtml(info.rebookingTotal)}`
  ].filter(Boolean);
  return `
    <article class="card ${String(task.priority || "").toLowerCase()}">
      <div class="card-head">
        <div>
          <div class="client">${escapeHtml(task.client || "Client inconnu")}</div>
          <div class="action">${escapeHtml(task.action || "")}</div>
          <div class="why">${escapeHtml(task.why || "")}</div>
        </div>
        <span class="tag">${escapeHtml(task.priority || "")}</span>
      </div>
      <div class="meta">
        ${task.type ? `<span class="tag">${escapeHtml(task.type)}</span>` : ""}
        ${task.due ? `<span class="tag warn">${escapeHtml(task.due)}</span>` : ""}
        ${task.sourceValidity ? `<span class="tag">${escapeHtml(task.sourceValidity)}</span>` : ""}
      </div>
      ${facts.length ? `<div class="facts">${facts.map((fact) => `<span class="fact">${fact}</span>`).join("")}</div>` : ""}
      <div class="card-actions">
        <button data-task-id="${escapeAttr(task.taskId || "")}" data-row="${escapeAttr(task.rowNumber || "")}" data-status="En cours">Commence</button>
        <button data-task-id="${escapeAttr(task.taskId || "")}" data-row="${escapeAttr(task.rowNumber || "")}" data-status="Ignore">Masquer</button>
        <button class="done" data-task-id="${escapeAttr(task.taskId || "")}" data-row="${escapeAttr(task.rowNumber || "")}" data-status="Fait">Termine</button>
      </div>
    </article>`;
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
  els.content.innerHTML = `<div class="error">${escapeHtml(error.message || String(error))}</div>`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.style.display = "block";
  window.clearTimeout(window.__toastTimer);
  window.__toastTimer = window.setTimeout(() => {
    els.toast.style.display = "none";
  }, 2600);
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
