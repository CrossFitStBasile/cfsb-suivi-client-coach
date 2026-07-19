const webAppUrlInput = document.getElementById("webAppUrl");
const syncSecretInput = document.getElementById("syncSecret");
const coachSelect = document.getElementById("coachSelect");
const loadCoachesButton = document.getElementById("loadCoaches");
const saveSettingsButton = document.getElementById("saveSettings");
const syncNowButton = document.getElementById("syncNow");
const openCoachRxButton = document.getElementById("openCoachRx");
const testCoachRxButton = document.getElementById("testCoachRx");
const scanAdvancedButton = document.getElementById("scanAdvanced");
const logBox = document.getElementById("log");
const statusPill = document.getElementById("statusPill");

const EXTENSION_VERSION = "0.6.9";
const MANAGED_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ/exec";
const ENDPOINT_ROUTE_RELEASE = "20260718-v75";

init();

async function init() {
  const storedSettings = await chrome.storage.sync.get(["webAppUrl", "syncSecret", "selectedCoachId", "selectedCoachName", "coachOptions", "endpointRouteRelease"]);
  const settings = await ensureManagedEndpoint(storedSettings);
  webAppUrlInput.value = settings.webAppUrl;
  webAppUrlInput.readOnly = true;
  syncSecretInput.value = settings.syncSecret || "";
  populateCoachSelect(settings.coachOptions || [], settings.selectedCoachId || "");
  loadCoachesButton.addEventListener("click", loadCoaches);
  saveSettingsButton.addEventListener("click", saveSettings);
  syncNowButton.addEventListener("click", syncNow);
  openCoachRxButton.addEventListener("click", openSelectedCoachRx);
  testCoachRxButton.addEventListener("click", testCoachRx);
  scanAdvancedButton.addEventListener("click", scanAdvancedCoachRx);
  if (settings.endpointWasMigrated) {
    setStatus("Route OK");
    writeLog("Route de synchronisation mise a jour. Le secret local est conserve. Choisis le coach, ouvre sa page CoachRx > Clients, puis clique Mettre a jour CoachRx.");
    return;
  }
  writeLog("Choisis le coach, ouvre sa page CoachRx > Clients, puis clique Mettre a jour CoachRx.");
}

function managedWebAppUrl() {
  return MANAGED_WEB_APP_URL;
}

async function ensureManagedEndpoint(settings) {
  const existingUrl = String(settings?.webAppUrl || "").trim();
  const release = String(settings?.endpointRouteRelease || "").trim();
  const endpointWasMigrated = existingUrl !== MANAGED_WEB_APP_URL || release !== ENDPOINT_ROUTE_RELEASE;
  if (endpointWasMigrated) {
    await chrome.storage.sync.set({
      webAppUrl: MANAGED_WEB_APP_URL,
      endpointRouteRelease: ENDPOINT_ROUTE_RELEASE
    });
  }
  return {
    ...settings,
    webAppUrl: MANAGED_WEB_APP_URL,
    endpointWasMigrated
  };
}

async function saveSettings() {
  const selected = getSelectedCoach();
  await chrome.storage.sync.set({
    webAppUrl: managedWebAppUrl(),
    endpointRouteRelease: ENDPOINT_ROUTE_RELEASE,
    syncSecret: syncSecretInput.value,
    selectedCoachId: selected.coachId,
    selectedCoachName: selected.coach
  });
  setStatus("Sauvegarde");
  writeLog("Parametres enregistres.");
}

async function loadCoaches() {
  await runWithUi(async () => {
    const webAppUrl = managedWebAppUrl();
    webAppUrlInput.value = webAppUrl;
    const syncSecret = syncSecretInput.value;
    if (!webAppUrl) throw new Error("Ajoute le Web App URL Apps Script.");
    if (!syncSecret) throw new Error("Ajoute le secret de sync CoachRx.");

    setStatus("Config");
    const response = await fetch(webAppUrl, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: syncSecret,
        source: "cfsb-coachrx-sync-extension-config",
        extensionVersion: EXTENSION_VERSION
      })
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(`Reponse Apps Script non JSON: ${text.slice(0, 250)}`);
    }
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `Apps Script HTTP ${response.status}`);
    }
    const coaches = result.result?.coaches || [];
    if (!coaches.length) throw new Error("Aucun coach actif trouve dans CFG_Coachs.");
    const previous = coachSelect.value;
    populateCoachSelect(coaches, previous);
    const selected = getSelectedCoach();
    await chrome.storage.sync.set({
      webAppUrl,
      endpointRouteRelease: ENDPOINT_ROUTE_RELEASE,
      syncSecret,
      coachOptions: coaches,
      selectedCoachId: selected.coachId,
      selectedCoachName: selected.coach
    });
    setStatus("Coachs OK");
    writeLog(`Liste chargee: ${coaches.length} coach(s). Choisis le coach, puis clique Enregistrer.`);
  });
}

async function testCoachRx() {
  await runWithUi(async () => {
    setStatus("Lecture");
    const data = await extractCoachRxDataFromActiveTab();
    setStatus("CoachRx OK");
    writeLog([
      "CoachRx repond.",
      `Mode: ${data.sourceMode}`,
      `Coach ID: ${data.coachId || "-"}`,
      `Clients actifs valides: ${data.clients.length}/${data.expectedClientCount}`,
      `Clients archives ignores: ${data.archivedClientCount}`,
      `Fiches API totales: ${data.rawClientCount}`,
      `Compteur de reference: ${data.countSource}`,
      `Identites stables: ${data.identityReport?.identifiedCount || 0}/${data.identityReport?.totalCount || data.clients.length}`,
      `Sources identite: ${identitySourceSummary(data.identityReport)}`,
      `Telephones exploitables: ${data.identityReport?.withPhoneCount || 0}/${data.identityReport?.totalCount || data.clients.length}`,
      `Courriels exploitables: ${data.identityReport?.withEmailCount || 0}/${data.identityReport?.totalCount || data.clients.length}`,
      `Programmes a surveiller: ${data.clients.filter((client) => client.programSignal).length}`,
      `Compliance basse: ${data.clients.filter((client) => client.complianceSignal || client.lifestyleSignal).length}`
    ].join("\n"));
  });
}

async function openSelectedCoachRx() {
  const selectedCoach = getSelectedCoach();
  if (!selectedCoach.coachId) {
    writeLog("Choisis un coach avant d'ouvrir CoachRx.");
    return;
  }
  await saveSettings();
  const url = `https://dashboard.coachrx.app/team/${encodeURIComponent(selectedCoach.coachId)}/clients`;
  await chrome.tabs.create({ url });
  setStatus("CoachRx");
  writeLog(`Page CoachRx ouverte pour ${selectedCoach.coach || selectedCoach.coachId}.`);
}

async function syncNow() {
  await runWithUi(async () => {
    const settings = await chrome.storage.sync.get(["webAppUrl", "syncSecret", "selectedCoachId", "selectedCoachName"]);
    const webAppUrl = managedWebAppUrl();
    webAppUrlInput.value = webAppUrl;
    const syncSecret = settings.syncSecret || syncSecretInput.value;
    const selectedCoach = getSelectedCoach();
    const selectedCoachId = selectedCoach.coachId || settings.selectedCoachId || "";
    const coachName = selectedCoach.coach || settings.selectedCoachName || "";
    if (!webAppUrl) throw new Error("Ajoute le Web App URL Apps Script.");
    if (!syncSecret) throw new Error("Ajoute le secret de sync CoachRx.");
    if (!selectedCoachId) throw new Error("Choisis le coach dans la liste deroulante.");

    setStatus("Lecture");
    writeLog("Lecture des clients dans CoachRx...");
    const data = await extractCoachRxDataFromActiveTab();

    const identityReport = data.identityReport || {};
    if (!identityReport.totalCount || identityReport.missingCount > 0
      || identityReport.identifiedCount !== identityReport.totalCount) {
      throw new Error(
        `CoachRx ne fournit pas encore une identite stable pour ${identityReport.missingCount || identityReport.totalCount || 0} fiche(s). `
        + "Clique Tester CoachRx et transmets le resultat a l'admin avant toute synchronisation."
      );
    }

    setStatus("Envoi");
    writeLog([
      `Clients actifs valides: ${data.clients.length}/${data.expectedClientCount}`,
      `Clients archives ignores: ${data.archivedClientCount}`,
      `Fiches API totales: ${data.rawClientCount}`,
      `Coach detecte: ${data.coachId}`,
      `Coach choisi: ${selectedCoachId}`,
      `Mode: ${data.sourceMode}`,
      `Compteur de reference: ${data.countSource}`,
      `Identites stables: ${identityReport.identifiedCount}/${identityReport.totalCount}`,
      `Telephones exploitables: ${identityReport.withPhoneCount || 0}/${identityReport.totalCount}`,
      `Courriels exploitables: ${identityReport.withEmailCount || 0}/${identityReport.totalCount}`,
      "Envoi au Google Sheet..."
    ].join("\n"));
    if (!data.coachId) {
      throw new Error(
        "Coach ID non verifiable dans l URL. Ouvre le coach avec le bouton Ouvrir CoachRx; la page generique /clients ne peut pas etre synchronisee."
      );
    }
    if (String(data.coachId) !== String(selectedCoachId)) {
      throw new Error(`Le coach choisi (${selectedCoachId}) ne correspond pas au CoachRx ID detecte dans l'URL (${data.coachId}). Ouvre la bonne page CoachRx ou choisis le bon coach.`);
    }
    const coachIdForSync = data.coachId;
    if (!sourcePathMatchesCoach(data.sourcePath, data.sourceMode, coachIdForSync)) {
      throw new Error(
        `Source CoachRx non verifiable pour le coach ${coachIdForSync}. Rouvre sa page /team/${coachIdForSync}/clients avant de synchroniser.`
      );
    }

    const response = await fetch(webAppUrl, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: syncSecret,
        source: "cfsb-coachrx-sync-extension",
        extensionVersion: EXTENSION_VERSION,
        extractedAt: new Date().toISOString(),
        coachId: coachIdForSync,
        coachName,
        sourceMode: data.sourceMode,
        sourcePath: data.sourcePath || "",
        expectedClientCount: data.expectedClientCount,
        archivedClientCount: data.archivedClientCount,
        rawClientCount: data.rawClientCount,
        countSource: data.countSource,
        clients: data.clients
      })
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(`Reponse Apps Script non JSON: ${text.slice(0, 250)}`);
    }
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `Apps Script HTTP ${response.status}`);
    }

    setStatus("Termine");
    const payloadResult = result.result || result;
    const rebuild = payloadResult.rebuild || {};
    const rebuildMessage = payloadResult.note
      || (rebuild.rebuilt
        ? `Dashboard reconstruit: ${rebuild.dashboardClients || 0} clients, ${rebuild.todos || 0} taches, ${rebuild.clientsToValidate || 0} validations.`
        : "Source CoachRx mise a jour. Ouvre l'app et clique Mettre a jour si necessaire.");
    writeLog([
      "Sync terminee.",
      `Coach: ${payloadResult.coachName || coachName || data.coachId || "-"}`,
      `Clients recus: ${payloadResult.clients || data.clients.length}`,
      `Onglet source: ${payloadResult.sourceSheet || "SRC_CoachRx_Browser"}`,
      rebuildMessage
    ].join("\n"));
  });
}

async function scanAdvancedCoachRx() {
  await runWithUi(async () => {
    const settings = await chrome.storage.sync.get(["webAppUrl", "syncSecret", "selectedCoachId", "selectedCoachName"]);
    const webAppUrl = managedWebAppUrl();
    webAppUrlInput.value = webAppUrl;
    const syncSecret = settings.syncSecret || syncSecretInput.value;
    const selectedCoach = getSelectedCoach();
    const selectedCoachId = selectedCoach.coachId || settings.selectedCoachId || "";
    const coachName = selectedCoach.coach || settings.selectedCoachName || "";
    if (!webAppUrl) throw new Error("Ajoute le Web App URL Apps Script.");
    if (!syncSecret) throw new Error("Ajoute le secret de sync CoachRx.");
    if (!selectedCoachId) throw new Error("Choisis le coach dans la liste deroulante.");

    setStatus("Scan");
    writeLog("Scan avance de la page CoachRx ouverte...");
    const scan = await extractCoachRxAdvancedScanFromActiveTab();
    if (!scan.coachId) {
      throw new Error(
        "Coach ID non verifiable dans l URL. Le scan de la page generique /clients est refuse."
      );
    }
    if (String(scan.coachId) !== String(selectedCoachId)) {
      throw new Error(`Le coach choisi (${selectedCoachId}) ne correspond pas au CoachRx ID detecte (${scan.coachId}).`);
    }
    if (scan.pageType === "clients_roster" && !new RegExp(`/team/${scan.coachId}/clients(?:[/?#]|$)`, "i").test(scan.url || "")) {
      throw new Error(`La liste clients doit provenir de /team/${scan.coachId}/clients.`);
    }

    setStatus("Envoi");
    const response = await fetch(webAppUrl, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: syncSecret,
        source: "cfsb-coachrx-advanced-scan",
        extensionVersion: EXTENSION_VERSION,
        extractedAt: new Date().toISOString(),
        coachId: scan.coachId,
        coachName,
        scan
      })
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(`Reponse Apps Script non JSON: ${text.slice(0, 250)}`);
    }
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `Apps Script HTTP ${response.status}`);
    }

    setStatus("Scan OK");
    writeLog([
      "Scan avance envoye.",
      `Page: ${scan.pageType}`,
      `URL: ${scan.url}`,
      `Clients/rows detectes: ${scan.visibleClients.length}`,
      `Liens clients detectes: ${scan.clientLinks.length}`,
      `Blocs contexte detectes: ${scan.importantBlocks.length}`,
      `Champs/signaux detectes: ${scan.fieldSignals.length}`,
      `Onglet source: ${result.result?.sourceSheet || "SRC_CoachRx_Advanced_Scans"}`
    ].join("\n"));
  });
}

function sourcePathMatchesCoach(sourcePath, sourceMode, coachId) {
  const path = String(sourcePath || "");
  const escapedCoachId = String(coachId || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escapedCoachId) return false;
  if (sourceMode === "coachrx-page-api") {
    return new RegExp(`/api/v1/coaches/${escapedCoachId}/clients(?:\\.json)?(?:[?#]|$)`, "i").test(path);
  }
  if (sourceMode === "coachrx-visible-page") {
    return new RegExp(`/team/${escapedCoachId}/clients(?:[/?#]|$)`, "i").test(path);
  }
  return false;
}

async function extractCoachRxDataFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || !tab.url.startsWith("https://dashboard.coachrx.app/")) {
    throw new Error("Ouvre un onglet https://dashboard.coachrx.app/ connecte avant de synchroniser.");
  }
  const coachId = coachIdFromCoachRxClientsUrl(tab.url);
  if (!coachId) {
    throw new Error("Ouvre la page Clients du coach vise: https://dashboard.coachrx.app/team/{coachId}/clients.");
  }
  const [{ result: rawApiData }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: fetchCoachRxRawDataInMainWorld,
    args: [coachId]
  });
  if (!rawApiData || !rawApiData.ok) {
    throw new Error(rawApiData?.error || "Lecture API CoachRx impossible dans la session connectee.");
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["coachrx-identity.js"]
  });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fetchCoachRxDataInPage,
    args: [rawApiData]
  });
  if (!result || !result.ok) {
    throw new Error(result?.error || "Lecture CoachRx impossible.");
  }
  return result;
}

function coachIdFromCoachRxClientsUrl(value) {
  const match = String(value || "").match(/^https:\/\/dashboard\.coachrx\.app\/team\/(\d+)\/clients(?:[/?#]|$)/i);
  return match ? match[1] : "";
}

async function fetchCoachRxRawDataInMainWorld(expectedCoachId) {
  try {
    const coachId = String(expectedCoachId || "").trim();
    const urlMatch = window.location.href.match(/^https:\/\/dashboard\.coachrx\.app\/team\/(\d+)\/clients(?:[/?#]|$)/i);
    if (!coachId || !urlMatch || urlMatch[1] !== coachId) {
      throw new Error("La page CoachRx ouverte ne correspond pas au coach selectionne.");
    }

    const token = String(window.localStorage.getItem("token") || "").trim();
    if (!token) {
      throw new Error("Session API CoachRx introuvable. Deconnecte-toi puis reconnecte-toi a CoachRx.");
    }

    const readJson = async (path) => {
      const response = await fetch(path, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        }
      });
      const text = await response.text();
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`CoachRx a retourne du non JSON (${response.status}).`);
      }
      if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(json).slice(0, 220)}`);
      return json;
    };
    const clientsFrom = (data) => Array.isArray(data?.clients)
      ? data.clients
      : Array.isArray(data)
        ? data
        : [];
    const sourcePath = `/api/v1/coaches/${coachId}/clients.json`;
    const data = await readJson(sourcePath);
    const clients = clientsFrom(data);
    if (!clients.length) throw new Error("Aucun client retourne par l API CoachRx.");

    const pageCounts = readVisiblePortfolioCounts();
    if (pageCounts.active !== null && pageCounts.totalMetric !== null
      && pageCounts.active !== pageCounts.totalMetric) {
      throw new Error(
        `Les compteurs actifs CoachRx ne concordent pas: onglet ${pageCounts.active}, carte Total Clients ${pageCounts.totalMetric}.`
      );
    }

    const expectedClientCount = pageCounts.active !== null
      ? pageCounts.active
      : pageCounts.totalMetric;
    const countSource = pageCounts.active !== null ? "onglet Active" : "carte Total Clients";
    if (expectedClientCount === null) {
      throw new Error("Compteur de clients actifs introuvable dans CoachRx; synchronisation bloquee par securite.");
    }

    const classifiedClients = clients.map((client) => ({ client, state: coachRxClientState(client) }));
    const unknownStates = classifiedClients
      .filter(({ state }) => state !== "active" && state !== "archived")
      .map(({ state }) => state || "(vide)");
    if (unknownStates.length) {
      const stateSummary = Array.from(new Set(unknownStates)).slice(0, 5).join(", ");
      throw new Error(
        `Etat CoachRx non reconnu pour ${unknownStates.length} fiche(s): ${stateSummary}. Synchronisation bloquee par securite.`
      );
    }
    const activeClients = classifiedClients
      .filter(({ state }) => state === "active")
      .map(({ client }) => client);
    const archivedClients = classifiedClients
      .filter(({ state }) => state === "archived")
      .map(({ client }) => client);
    if (activeClients.length !== expectedClientCount) {
      throw new Error(
        `Extraction active incomplete: ${activeClients.length} client(s) actif(s) lu(s) sur ${expectedClientCount} affiche(s) par CoachRx.`
      );
    }
    if (pageCounts.archived !== null && archivedClients.length !== pageCounts.archived) {
      throw new Error(
        `Extraction archivee incomplete: ${archivedClients.length} fiche(s) archivee(s) lue(s) sur ${pageCounts.archived} affichee(s) par CoachRx.`
      );
    }
    if (pageCounts.archived !== null
      && clients.length !== expectedClientCount + pageCounts.archived) {
      throw new Error(
        `Extraction globale incomplete: ${clients.length} fiche(s) API sur ${expectedClientCount + pageCounts.archived} attendue(s).`
      );
    }

    return {
      ok: true,
      coachId,
      sourcePath,
      pageCount: 1,
      expectedClientCount,
      archivedClientCount: archivedClients.length,
      rawClientCount: clients.length,
      countSource,
      clients: activeClients
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error && error.message ? error.message : error)
    };
  }

  function coachRxClientState(client) {
    return String(client?.state || "").trim().toLowerCase();
  }

  function readVisiblePortfolioCounts() {
    const bodyText = String(document.body?.innerText || "").replace(/\u00a0/g, " ");
    const result = { active: null, archived: null, totalMetric: null };
    const elements = Array.from(document.querySelectorAll("body *"));
    for (const element of elements) {
      const text = String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      let match = text.match(/^active\s+(\d+)$/i);
      if (match && result.active === null) result.active = Number(match[1]);
      match = text.match(/^archived\s+(\d+)$/i);
      if (match && result.archived === null) result.archived = Number(match[1]);
      match = text.match(/^(\d+)\s+total\s+clients?$/i);
      if (match && result.totalMetric === null) result.totalMetric = Number(match[1]);
      if (result.active !== null && result.archived !== null && result.totalMetric !== null) {
        break;
      }
    }

    if (result.active === null) {
      const match = bodyText.match(/(?:^|\n)\s*active\s+(\d+)\s*(?:\n|$)/i);
      if (match) result.active = Number(match[1]);
    }
    if (result.archived === null) {
      const match = bodyText.match(/(?:^|\n)\s*archived\s+(\d+)\s*(?:\n|$)/i);
      if (match) result.archived = Number(match[1]);
    }
    if (result.totalMetric === null) {
      const match = bodyText.match(/(?:^|\n)\s*(\d+)\s*(?:\n|\s)+total\s+clients?\s*(?:\n|$)/i);
      if (match) result.totalMetric = Number(match[1]);
    }
    return result;
  }
}

async function extractCoachRxAdvancedScanFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || !tab.url.startsWith("https://dashboard.coachrx.app/")) {
    throw new Error("Ouvre un onglet https://dashboard.coachrx.app/ connecte avant de scanner.");
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scanCoachRxAdvancedInPage
  });
  if (!result || !result.ok) {
    throw new Error(result?.error || "Scan CoachRx impossible.");
  }
  return result.scan;
}

function scanCoachRxAdvancedInPage() {
  try {
    const now = new Date().toISOString();
    const url = window.location.href;
    const coachId = findCoachId(url);
    const visibleText = document.body ? document.body.innerText || "" : "";
    const scan = {
      scannedAt: now,
      url,
      title: document.title || "",
      coachId,
      clientSlug: findClientSlug(url),
      pageType: detectPageType(url),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollY: Math.round(window.scrollY || 0)
      },
      clientLinks: extractClientLinks(),
      visibleClients: extractVisibleClientRows(),
      importantBlocks: extractImportantBlocks(),
      fieldSignals: extractFieldSignals(),
      headings: extractTextList("h1, h2, h3", 40),
      buttons: extractTextList("button, [role='button']", 80),
      tableHeaders: extractTextList("th, [role='columnheader']", 80),
      rawTextPreview: compact(visibleText).slice(0, 4000)
    };
    return { ok: true, scan };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }

  function findCoachId(url) {
    const teamMatch = url.match(/\/team\/(\d+)/i);
    if (teamMatch) return teamMatch[1];
    return "";
  }

  function detectPageType(url) {
    if (/\/clients\/?(\?.*)?$/i.test(url) || /\/team\/\d+\/clients\/?(\?.*)?$/i.test(url)) return "clients_roster";
    if (/\/clients\/[^/?#]+/i.test(url)) return "client_detail";
    if (/\/programs/i.test(url)) return "programs";
    if (/\/calendar/i.test(url)) return "calendar";
    return "unknown";
  }

  function findClientSlug(url) {
    const match = url.match(/\/clients\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function extractClientLinks() {
    const byHref = new Map();
    Array.from(document.querySelectorAll("a[href*='/clients/']")).forEach((link) => {
      const href = link.href || "";
      const match = href.match(/\/clients\/(\d+)/i);
      if (!match) return;
      const label = compact(link.innerText || link.getAttribute("aria-label") || link.title || "");
      if (!byHref.has(href)) byHref.set(href, { clientId: match[1], label, href });
    });
    return Array.from(byHref.values()).slice(0, 300);
  }

  function extractVisibleClientRows() {
    const candidates = Array.from(document.querySelectorAll("tbody tr, [role='row'], .rt-tr, .ReactVirtualized__Table__row"))
      .map((row) => compact(row.innerText || ""))
      .filter((text) => text.length > 15)
      .filter((text) => /last consult|not set|invite pending|\d+\s*%|exercise|lifestyle|program/i.test(text));
    return candidates.slice(0, 250).map((text, index) => parseVisibleClientRow(text, index)).filter((row) => row.name || row.rawText);
  }

  function parseVisibleClientRow(text, index) {
    const parts = text.split(/\n+/).map((part) => compact(part)).filter(Boolean);
    const name = parts.find((part) => /^[A-Z][A-Za-z' -]{2,}$/.test(part) && !/^(active|archived|not set|invite pending)$/i.test(part)) || parts[0] || `Row ${index + 1}`;
    const dueLabels = parts.filter((part) => looksLikeDueLabel(part));
    const percents = text.match(/\b\d+\s*%/g) || [];
    const tags = parts.filter((part) => /^(1x|2x|3x|semi|prive|priv|renouv|objectif|fin des|t-shirt|nutrition|marc|andre|andré)/i.test(part)).slice(0, 18);
    return {
      index: index + 1,
      name,
      exerciseDue: dueLabels[0] || "",
      lifestyleDue: dueLabels[1] || "",
      percents: percents.join(" | "),
      tags: tags.join(" | "),
      rawText: text.slice(0, 1200)
    };
  }

  function extractFieldSignals() {
    const labels = extractTextList("label, dt, .label, [class*='label'], [class*='Label']", 120);
    const pills = extractTextList("[class*='tag'], [class*='Tag'], [class*='badge'], [class*='Badge'], [class*='pill'], [class*='Pill']", 160);
    const visible = compact(document.body ? document.body.innerText || "" : "");
    const keywordHits = [
      "Exercise Due", "Lifestyle Due", "Exercise Compliance", "Lifestyle Compliance",
      "Programs", "Workouts", "Last Consultation", "Touchpoints", "Tags",
      "Start Date", "Archive", "Coach", "Status"
    ].filter((keyword) => new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(visible));
    return unique(labels.concat(pills).concat(keywordHits)).slice(0, 250);
  }

  function extractImportantBlocks() {
    const selectors = [
      "main article",
      "main section",
      "article",
      "section",
      "[class*='plan']",
      "[class*='Plan']",
      "[class*='period']",
      "[class*='Period']",
      "[class*='note']",
      "[class*='Note']",
      "[class*='card']",
      "[class*='Card']"
    ];
    const blocks = [];
    Array.from(document.querySelectorAll(selectors.join(","))).forEach((element) => {
      const text = compact(element.innerText || element.textContent || "");
      if (text.length < 120 || text.length > 12000) return;
      if (!/notes?|plan|phase|objectif|priority|priorit|calendar|séance|seance|workout|comments?|periodization|périodisation|periodisation/i.test(text)) return;
      const label = compact((element.querySelector("h1,h2,h3,h4,strong") || {}).innerText || element.getAttribute("aria-label") || element.className || element.tagName);
      blocks.push({ label: String(label).slice(0, 160), text: text.slice(0, 6000) });
    });
    const uniqueBlocks = [];
    const seen = new Set();
    for (const block of blocks) {
      const key = block.text.slice(0, 240).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueBlocks.push(block);
      if (uniqueBlocks.length >= 40) break;
    }
    return uniqueBlocks;
  }

  function extractTextList(selector, limit) {
    return unique(Array.from(document.querySelectorAll(selector))
      .map((element) => compact(element.innerText || element.textContent || element.getAttribute("aria-label") || ""))
      .filter((text) => text && text.length <= 120))
      .slice(0, limit);
  }

  function looksLikeDueLabel(value) {
    const text = compact(value).toLowerCase();
    if (!text || text === "n/a") return false;
    if (/^(not set|invite pending)$/.test(text)) return true;
    if (/^last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(text)) return true;
    if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(text)) return true;
    return /^(sun|mon|tue|wed|thu|fri|sat)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}/.test(text);
  }

  function unique(values) {
    const seen = new Set();
    return values.filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function compact(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
}

async function fetchCoachRxDataInPage(prefetchedApiData) {
  try {
    const identityApi = globalThis.CFSBCoachRxIdentity;
    if (!identityApi || typeof identityApi.resolve !== "function" || typeof identityApi.resolveContact !== "function" || typeof identityApi.summarize !== "function") {
      throw new Error("Module d'identite CoachRx indisponible. Recharge l'extension puis reessaie.");
    }
    const coachId = findCoachId();
    if (!coachId) {
      throw new Error("Coach ID introuvable dans l URL. Va dans CoachRx > Clients pour le coach vise.");
    }
    const apiData = prefetchedApiData || {};
    if (!apiData.ok || String(apiData.coachId || "") !== coachId) {
      throw new Error("La reponse API CoachRx ne correspond pas au coach ouvert.");
    }
    const expectedPath = new RegExp(`/api/v1/coaches/${coachId}/clients(?:\\.json)?(?:[?#]|$)`, "i");
    if (!expectedPath.test(String(apiData.sourcePath || ""))) {
      throw new Error("La route API CoachRx ne correspond pas au coach ouvert.");
    }
    const importableRawClients = (apiData.clients || []).filter((client) => pickClientName(client));
    const clients = normalizeClients(importableRawClients, coachId, apiData.sourcePath || "", identityApi);
    if (!clients.length) throw new Error("Aucun client retourne par CoachRx.");
    if (!Number.isInteger(apiData.expectedClientCount) || apiData.expectedClientCount < 0) {
      throw new Error("Total CoachRx non valide; synchronisation bloquee par securite.");
    }
    if (clients.length !== apiData.expectedClientCount) {
      throw new Error(`Normalisation incomplete: ${clients.length} client(s) exploitable(s) sur ${apiData.expectedClientCount} dans CoachRx.`);
    }
    return {
      ok: true,
      coachId,
      sourceMode: "coachrx-page-api",
      sourcePath: apiData.sourcePath || "",
      expectedClientCount: apiData.expectedClientCount,
      archivedClientCount: apiData.archivedClientCount || 0,
      rawClientCount: apiData.rawClientCount || clients.length,
      countSource: apiData.countSource || "CoachRx",
      clients,
      identityReport: identityApi.summarize(importableRawClients)
    };
  } catch (apiError) {
    return {
      ok: false,
      error: `Lecture API CoachRx requise; le fallback de liste visible est desactive pour proteger l'appartenance coach. ${String(apiError && apiError.message ? apiError.message : apiError)}`
    };
  }

  function findCoachId() {
    const urlMatch = window.location.href.match(/\/team\/(\d+)\/clients/i);
    if (urlMatch) return urlMatch[1];
    return "";
  }

  function normalizeClients(clients, coachId, sourcePath, identityApi) {
    return clients.map((client) => {
      const identity = identityApi.resolve(client);
      const contact = identityApi.resolveContact(client);
      const workoutDue = firstValue(client.workout_due_date, client.exercise_due_date, client.next_workout_due_date);
      const lifestyleDue = firstValue(client.lifestyle_due_date, client.lifestyle_rx_due_date, client.next_lifestyle_due_date);
      const dueDays = daysFromToday(workoutDue);
      const exerciseColor = firstValue(client.exercise_color, client.workout_color, client.exercise_due_color, client.workout_due_color, client.exercise_status_color);
      const exerciseStatus = firstValue(client.exercise_status, client.workout_status, client.exercise_due_status, client.workout_due_status);
      const lifestyleColor = firstValue(client.lifestyle_color, client.lifestyle_due_color, client.lifestyle_status_color);
      const lifestyleStatus = firstValue(client.lifestyle_status, client.lifestyle_due_status);
      const compliance30 = numberOrBlank(client.compliance_30_days);
      const lifestyleCompliance30 = numberOrBlank(client.lifestyle_compliance_30_days);
      const programSignal = buildProgramSignal(dueDays);
      return {
        importedAt: new Date().toISOString(),
        coachId: stringValue(coachId),
        sourcePath: stringValue(sourcePath),
        id: identity.value,
        identityKind: identity.kind,
        identitySource: identity.source,
        phone: contact.phone,
        phoneSource: contact.phoneSource,
        email: contact.email,
        emailSource: contact.emailSource,
        name: pickClientName(client),
        state: stringValue(client.state || client.status || "active"),
        workoutDue,
        exerciseColor,
        exerciseStatus,
        workoutDueDays: dueDays,
        workoutDueLocked: firstValue(client.workout_due_date_locked, client.exercise_due_date_locked),
        compliance7: numberOrBlank(client.compliance_7_days),
        compliance30,
        compliance90: numberOrBlank(client.compliance_90_days),
        lifestyleDue,
        lifestyleColor,
        lifestyleStatus,
        lifestyleCompliance7: numberOrBlank(client.lifestyle_compliance_7_days),
        lifestyleCompliance30,
        lifestyleCompliance90: numberOrBlank(client.lifestyle_compliance_90_days),
        completedWorkouts: firstValue(client.completed_workouts, client.workouts_completed),
        streak: firstValue(client.current_streak_count, client.highest_streak),
        lastConsultation: firstValue(client.last_consultation),
        touchpoints: firstValue(client.touch_points_count),
        tags: normalizeTags(firstValue(client.tags, client.Tags)),
        alert: alertText(client.client_alert),
        programSignal,
        complianceSignal: compliance30 !== "" && compliance30 < 50 ? "Compliance exercice basse" : "",
        lifestyleSignal: lifestyleCompliance30 !== "" && lifestyleCompliance30 < 50 ? "Compliance lifestyle basse" : ""
      };
    }).filter((client) => client.name);
  }

  function pickClientName(client) {
    const candidates = [
      client.name,
      client.full_name,
      client.client_name,
      client.user && client.user.name,
      client.client && client.client.name,
      client.athlete && client.athlete.name,
      [client.first_name, client.last_name].filter(Boolean).join(" "),
      [client.user && client.user.first_name, client.user && client.user.last_name].filter(Boolean).join(" "),
      [client.client && client.client.first_name, client.client && client.client.last_name].filter(Boolean).join(" ")
    ];
    const rejected = new Set(["not set", "invite pending", "active", "archived", "dd"]);
    return candidates
      .map((value) => stringValue(value))
      .find((value) => value && !rejected.has(value.toLowerCase())) || "";
  }

  function extractVisibleClientsFromPage() {
    const rows = Array.from(document.querySelectorAll("tbody tr, [role='row']"))
      .filter((row) => {
        const text = row.innerText.trim();
        return text && /last consult|not set|invite pending|\d+\s*%|last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(text);
      });
    return rows.map((row, index) => visibleRowToClient(row, index)).filter((client) => client.name);
  }

  function visibleRowToClient(row, index) {
    const text = row.innerText.trim();
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const name = pickVisibleClientName(row, lines) || `Client ${index + 1}`;
    const dueItems = visibleDueItems(row, lines);
    const dueValues = dueItems.map((item) => item.label);
    const percentages = text.match(/\b\d+\s*%/g) || [];
    const workoutDue = dueValues[0] || "";
    const lifestyleDue = dueValues[1] || "";
    const exerciseColor = dueItems[0]?.signal || "";
    const lifestyleColor = dueItems[1]?.signal || "";
    const dueDays = daysFromToday(workoutDue);
    const compliance30 = percentNumber(percentages[1] || percentages[0]);
    const lifestyleCompliance30 = percentNumber(percentages[4] || percentages[3]);
    return {
      importedAt: new Date().toISOString(),
      id: "",
      name,
      state: "active",
      workoutDue,
      exerciseColor,
      exerciseStatus: exerciseColor,
      workoutDueDays: dueDays,
      workoutDueLocked: "",
      compliance7: percentNumber(percentages[0]),
      compliance30,
      compliance90: percentNumber(percentages[2]),
      lifestyleDue,
      lifestyleColor,
      lifestyleStatus: lifestyleColor,
      lifestyleCompliance7: percentNumber(percentages[3]),
      lifestyleCompliance30,
      lifestyleCompliance90: percentNumber(percentages[5]),
      completedWorkouts: "",
      streak: "",
      lastConsultation: "",
      touchpoints: "",
      tags: "",
      alert: "",
      programSignal: buildProgramSignal(dueDays),
      complianceSignal: compliance30 !== "" && compliance30 < 50 ? "Compliance exercice basse" : "",
      lifestyleSignal: lifestyleCompliance30 !== "" && lifestyleCompliance30 < 50 ? "Compliance lifestyle basse" : ""
    };
  }

  function pickVisibleClientName(row, lines) {
    const lineName = lines.find(isVisibleClientName);
    if (lineName) return lineName;

    const candidates = [];
    Array.from(row.querySelectorAll("a[href*='/clients/']")).forEach((link) => {
      const linkLines = stringValue(link.innerText || link.textContent).split(/\n+/).map((line) => line.trim()).filter(Boolean);
      candidates.push(...linkLines, link.getAttribute("aria-label"), link.title);
    });
    Array.from(row.querySelectorAll("img[alt], [aria-label], [title]")).forEach((element) => {
      candidates.push(element.getAttribute("alt"), element.getAttribute("aria-label"), element.getAttribute("title"));
    });
    return candidates
      .map((value) => stringValue(value))
      .find(isVisibleClientName) || "";
  }

  function isVisibleClientName(value) {
    const text = stringValue(value);
    if (!text || text.length < 3) return false;
    const compactText = text.replace(/\s+/g, " ").trim();
    const normalized = compactText.toLowerCase();
    if (looksLikeDueLabel(text)) return false;
    if (/^(active|archived|not set|invite pending|last consult|n\/a)$/i.test(compactText)) return false;
    if (/^(edit profile|add to tag|manage tags?|export|search clients and tags|total clients|compliance|consult rate|touchpoints)$/i.test(compactText)) return false;
    if (/^(name|exercise due|lifestyle due|exercise compliance|lifestyle compliance|tags)$/i.test(compactText)) return false;
    if (/last consult|coachrx|dashboard|clients$/i.test(compactText)) return false;
    if (/^(semi|semipriv|semi-priv|priv|prive|privé|renouv|fin des|objectif|t-shirt|nutrition)/i.test(compactText)) return false;
    if (/^\d+$/.test(compactText) || /\d+\s*%/.test(compactText)) return false;
    const lettersOnly = compactText.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (lettersOnly.length < 3) return false;
    if (lettersOnly.length <= 3 && lettersOnly === lettersOnly.toUpperCase()) return false;
    const words = compactText.split(/[\s.-]+/).filter((word) => /[A-Za-zÀ-ÿ]/.test(word));
    if (words.length < 2) return false;
    if (normalized.includes("  ")) return false;
    return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]+$/.test(compactText);
  }

  function visibleDueItems(row, lines) {
    const items = [];
    const seen = new Set();
    Array.from(row.querySelectorAll("*")).forEach((element) => {
      const text = stringValue(element.innerText || element.textContent || element.getAttribute("aria-label") || element.title || "");
      if (!looksLikeDueLabel(text)) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ label: text, signal: signalFromElement(element, text) });
    });
    lines.filter(looksLikeDueLabel).forEach((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ label, signal: signalFromText(label) });
    });
    return items.slice(0, 2);
  }

  function signalFromElement(element, text) {
    const style = window.getComputedStyle ? window.getComputedStyle(element) : {};
    const token = [
      element.className,
      element.getAttribute("aria-label"),
      element.title,
      element.getAttribute("style"),
      style.backgroundColor,
      style.color,
      text
    ].map(stringValue).join(" ").toLowerCase();
    if (/red|danger|error|overdue|late|past|retard|last/.test(token) || rgbLooksLike(token, "red")) return "red";
    if (/yellow|warning|orange|amber|gold|pending|invite/.test(token) || rgbLooksLike(token, "yellow")) return "yellow";
    if (/green|success|ok/.test(token) || rgbLooksLike(token, "green")) return "green";
    return signalFromText(text);
  }

  function signalFromText(text) {
    const value = stringValue(text).toLowerCase();
    if (/last|overdue|retard/.test(value)) return "red";
    if (/invite pending|pending/.test(value)) return "yellow";
    return "";
  }

  function rgbLooksLike(token, color) {
    const matches = [...token.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)];
    return matches.some((match) => {
      const red = Number(match[1]);
      const green = Number(match[2]);
      const blue = Number(match[3]);
      if (color === "red") return red > 170 && green < 140 && blue < 140;
      if (color === "yellow") return red > 170 && green > 120 && green < 230 && blue < 150;
      if (color === "green") return green > 120 && red < 150 && blue < 160;
      return false;
    });
  }

  function buildProgramSignal(dueDays) {
    if (dueDays === "") return "";
    if (dueDays < 0) return "Programme en retard";
    if (dueDays <= 14) return "Programme a preparer";
    return "";
  }

  function daysFromToday(value) {
    if (!value) return "";
    const date = parseDateOnly(value) || parseCoachRxDisplayDate(value);
    if (!date) return "";
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    return Math.round((target - today) / 86400000);
  }

  function parseDateOnly(value) {
    const text = stringValue(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function parseCoachRxDisplayDate(value) {
    const text = stringValue(value).toLowerCase();
    const today = new Date();
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const shortDayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const monthNames = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    if (/^last\s+/.test(text)) {
      const day = dayNames.findIndex((name) => text.includes(name));
      if (day === -1) return null;
      const diff = (today.getDay() - day + 7) % 7 || 7;
      return new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
    }
    const weekday = dayNames.indexOf(text);
    if (weekday !== -1) {
      const diff = (weekday - today.getDay() + 7) % 7;
      return new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
    }
    const absolute = text.match(/^(sun|mon|tue|wed|thu|fri|sat)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/);
    if (absolute) {
      const month = monthNames[absolute[2]];
      const day = Number(absolute[3]);
      const year = today.getFullYear() + (month < today.getMonth() - 6 ? 1 : 0);
      return new Date(year, month, day);
    }
    return null;
  }

  function looksLikeDueLabel(value) {
    const text = stringValue(value).toLowerCase();
    if (!text || text === "n/a") return false;
    if (/^(not set|invite pending)$/.test(text)) return true;
    if (/^last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(text)) return true;
    if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(text)) return true;
    return /^(sun|mon|tue|wed|thu|fri|sat)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}/.test(text);
  }

  function firstValue(...values) {
    return values.find((value) => value !== undefined && value !== null && stringValue(value) !== "") ?? "";
  }

  function numberOrBlank(value) {
    if (value === undefined || value === null || value === "") return "";
    const number = Number(String(value).replace("%", "").trim());
    return Number.isFinite(number) ? number : "";
  }

  function percentNumber(value) {
    const match = stringValue(value).match(/(\d+)/);
    return match ? Number(match[1]) : "";
  }

  function normalizeTags(value) {
    if (Array.isArray(value)) return value.map((tag) => stringValue(tag.name || tag)).filter(Boolean).join(", ");
    return stringValue(value);
  }

  function alertText(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return stringValue(value.message || value.text || value.title);
  }

  function stringValue(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }
}

async function runWithUi(task) {
  setBusy(true);
  try {
    await task();
  } catch (error) {
    setStatus("Erreur");
    writeLog(`Erreur: ${error && error.message ? error.message : error}`);
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy) {
  syncNowButton.disabled = isBusy;
  testCoachRxButton.disabled = isBusy;
  scanAdvancedButton.disabled = isBusy;
  loadCoachesButton.disabled = isBusy;
  saveSettingsButton.disabled = isBusy;
}

function setStatus(text) {
  statusPill.textContent = text;
}

function writeLog(text) {
  logBox.textContent = text;
}

function identitySourceSummary(report) {
  const entries = Object.entries(report?.bySource || {})
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length
    ? entries.map(([source, count]) => `${source}: ${count}`).join(" | ")
    : "aucune identite stable detectee";
}

function populateCoachSelect(coaches, selectedCoachId) {
  coachSelect.innerHTML = "";
  if (!coaches.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Charge la liste des coachs";
    coachSelect.append(option);
    return;
  }
  for (const coach of coaches) {
    const option = document.createElement("option");
    option.value = coach.coachId;
    option.textContent = `${coach.coach} (${coach.coachId})`;
    option.dataset.coach = coach.coach;
    option.dataset.dashboardSheet = coach.dashboardSheet || "";
    coachSelect.append(option);
  }
  if (selectedCoachId && coaches.some((coach) => String(coach.coachId) === String(selectedCoachId))) {
    coachSelect.value = selectedCoachId;
  }
}

function getSelectedCoach() {
  const option = coachSelect.selectedOptions[0];
  return {
    coachId: coachSelect.value || "",
    coach: option?.dataset.coach || ""
  };
}
