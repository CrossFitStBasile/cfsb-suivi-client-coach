const fs = require("fs");
const os = require("os");
const path = require("path");

const projectId = "cfsb-dashboard-coach-aa9a4";
const database = "(default)";
const cliConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const sourceActivationStatusPath = path.join(__dirname, "..", "firebase-dashboard", "SOURCE_ACTIVATION_STATUS.json");
const dashboardAppPath = path.join(__dirname, "..", "firebase-dashboard", "public", "app.js");
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(database)}/documents`;
const firebaseClientId = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const firebaseClientSecret = "j9iVZfS8kkCEFUPaAeJV0sAi";
const terrainTargetVersion = fs.readFileSync(dashboardAppPath, "utf8")
  .match(/const APP_VERSION = "([^"]+)"/)?.[1] || "";

const coaches = [
  { id: "15935", name: "Marc-Andre Menard" },
  { id: "15928", name: "Iheb Yahyaoui" },
  { id: "17242", name: "Camille Proulx" },
  { id: "15902", name: "David Olivier" },
  { id: "15893", name: "Gabriel Mayer Bedard" },
  { id: "15937", name: "Hugo Lelievre" },
  { id: "15936", name: "Raphael Samson" }
];

function readSourceActivationStatus() {
  try {
    return JSON.parse(fs.readFileSync(sourceActivationStatusPath, "utf8"));
  } catch (error) {
    return {
      warning: `Impossible de lire SOURCE_ACTIVATION_STATUS.json: ${error.message}`,
      pilotSymptomTriage: []
    };
  }
}

function readFirebaseCliConfig() {
  const config = JSON.parse(fs.readFileSync(cliConfigPath, "utf8"));
  if (!config.tokens?.refresh_token && !config.tokens?.access_token) {
    throw new Error(`Aucun token Firebase CLI trouve dans ${cliConfigPath}`);
  }
  return config;
}

function needsRefresh(tokens = {}) {
  if (!tokens.access_token) return true;
  const expiresAt = Number(tokens.expires_at || 0);
  if (!expiresAt) return false;
  return Date.now() > expiresAt - 120000;
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) throw new Error("Aucun refresh_token Firebase CLI disponible pour rafraichir l'audit live.");
  const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: firebaseClientId,
      client_secret: firebaseClientSecret,
      grant_type: "refresh_token"
    })
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || !data.access_token) {
    throw new Error(`Impossible de rafraichir le token Firebase CLI: ${response.status} ${response.statusText}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data.access_token;
}

async function readAccessToken() {
  const config = readFirebaseCliConfig();
  if (needsRefresh(config.tokens)) {
    return refreshAccessToken(config.tokens.refresh_token);
  }
  return config.tokens.access_token;
}

function authHint(error) {
  const message = String(error?.message || error || "");
  if (/401|UNAUTHENTICATED|ACCESS_TOKEN_TYPE_UNSUPPORTED|invalid authentication credentials|invalid_grant|invalid_rapt/i.test(message)) {
    return [
      "Authentification Firestore live invalide.",
      message.includes("invalid_rapt")
        ? "Google demande une reauthentification recente du compte avant de redonner un access token Firebase CLI."
        : "",
      "",
      "Actions possibles:",
      "1. Relancer la connexion Firebase interactive:",
      '   C:\\Users\\micha\\Downloads\\firebase-tools-instant-win.exe login --reauth',
      "2. Revenir dans le dossier du projet:",
      '   cd "C:\\Users\\micha\\Documents\\Codex\\2026-05-08\\j-ai-un-gros-projet-d\\generated\\github-pages-repo"',
      "3. Relancer le deploy complet ou l'audit live:",
      "   deploy-dashboard-complet.cmd",
      "   audit-live-firestore.cmd",
      "",
      "Sans cette reconnexion, Codex peut valider localement mais ne peut pas confirmer Firestore live."
    ].join("\n");
  }
  return "";
}

async function request(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data).slice(0, 800)}`);
  }
  return data;
}

function decodeValue(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function docId(docName = "") {
  return docName.split("/").pop();
}

function docData(document) {
  return {
    id: docId(document.name),
    ...decodeFields(document.fields || {})
  };
}

async function queryByCoach(token, collectionId, coachId, limit = 1000) {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: "coachId" },
          op: "EQUAL",
          value: { stringValue: coachId }
        }
      },
      limit
    }
  };
  const data = await request(token, `${baseUrl}:runQuery`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return data.map((entry) => entry.document).filter(Boolean).map(docData);
}

async function getDoc(token, collectionId, id) {
  const response = await fetch(`${baseUrl}/${collectionId}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return null;
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data).slice(0, 800)}`);
  }
  return docData(data);
}

async function latestSyncRuns(token, limit = 5) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: "syncRuns" }],
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      limit
    }
  };
  const data = await request(token, `${baseUrl}:runQuery`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return data.map((entry) => entry.document).filter(Boolean).map(docData);
}

async function latestCollectionDocs(token, collectionId, limit = 2000) {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      limit
    }
  };
  const data = await request(token, `${baseUrl}:runQuery`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return data.map((entry) => entry.document).filter(Boolean).map(docData);
}

async function collectionDocs(token, collectionId, limit = 500) {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      limit
    }
  };
  const data = await request(token, `${baseUrl}:runQuery`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return data.map((entry) => entry.document).filter(Boolean).map(docData);
}

function buildFiveStarWorkflowEvidence(actionLogs = []) {
  const matching = (predicate) => actionLogs.filter(predicate);
  const actionIs = (...actions) => (log) => actions.includes(String(log.action || ""));
  const actionAndStatus = (action, ...statuses) => (log) => (
    String(log.action || "") === action
    && statuses.includes(String(log.details?.status || "").toLowerCase())
  );
  const evidenceFor = (logs) => ({
    count: logs.length,
    coachCoverage: new Set(logs.map((log) => String(log.coachId || "")).filter(Boolean)).size,
    actorCoverage: new Set(logs.map((log) => String(log.userId || "")).filter(Boolean)).size,
    latestAt: logs.map((log) => String(log.createdAt || "")).filter(Boolean).sort().pop() || ""
  });
  const requirement = (key, logs) => ({ key, ...evidenceFor(logs), met: logs.length > 0 });
  const workflow = (id, label, requirements, humanChecks = []) => {
    const missing = requirements.filter((item) => !item.met).map((item) => item.key);
    return {
      id,
      label,
      automatedStatus: missing.length ? "missing_evidence" : "pass",
      requirements,
      missing,
      humanChecks
    };
  };

  const taskCreated = matching(actionIs("task.created"));
  const taskEdited = matching(actionIs("task.edited"));
  const taskStarred = matching(actionIs("task.starred"));
  const taskCompleted = matching(actionAndStatus("tasks.updated", "done", "completed"));
  const voiceSaved = matching(actionIs("task.voice_created", "task.voice_updated"));
  const clientCreated = matching(actionIs("client.created"));
  const clientUpdated = matching(actionIs("client.updated"));
  const questionnaireSent = matching(actionIs("questionnaire.send_queued"));
  const questionnaireRead = matching(actionIs("questionnaire_response.read"));
  const questionnaireTask = matching(actionIs("task.created_from_questionnaire_response"));
  const rebookingCreated = matching(actionIs("rebooking.created"));
  const rebookingAdjusted = matching(actionIs("rebooking.sessions_adjusted"));
  const rebookingClosed = matching((log) => (
    String(log.action || "") === "rebookings.updated"
    && ["rebooked", "managed", "coach_absence"].includes(String(log.details?.status || "").toLowerCase())
  ));
  const movedToAlumni = matching(actionIs("client.moved_to_alumni"));
  const reactivated = matching(actionIs("alumni.reactivated_to_client"));
  const transferredClient = matching((log) => (
    String(log.action || "") === "client.updated"
    && log.details?.transferred === true
  ));

  const workflows = [
    workflow("mission", "Mission: creer, modifier, etoiler et fermer", [
      requirement("create", taskCreated),
      requirement("edit", taskEdited),
      requirement("star", taskStarred),
      requirement("complete", taskCompleted)
    ], ["Confirmer l'absence de gel et la couverture inter-coach avec trois coachs pilotes."]),
    workflow("voice", "Mission vocale: enregistrer puis ecouter", [
      requirement("voice_saved_server_side", voiceSaved)
    ], ["La lecture audio reste une validation humaine; le journal prouve la sauvegarde serveur seulement."]),
    workflow("manual_client", "Client manuel: creer et modifier", [
      requirement("create", clientCreated),
      requirement("edit", clientUpdated)
    ], ["Tester aussi depuis un compte coach non-admin."]),
    workflow("questionnaire", "Questionnaire: envoyer et lire", [
      requirement("send", questionnaireSent),
      requirement("read", questionnaireRead)
    ], ["Confirmer la reception reelle GHL avec un client test autorise."]),
    workflow("questionnaire_task", "Creer une mission depuis une reponse", [
      requirement("create_from_response", questionnaireTask)
    ]),
    workflow("rebooking", "Rebooking: ajouter, ajuster et fermer", [
      requirement("create", rebookingCreated),
      requirement("adjust", rebookingAdjusted),
      requirement("close", rebookingClosed)
    ], ["Valider humainement les dossiers a volume eleve avant fermeture."]),
    workflow("alumni_cycle", "Client vers Alumni puis retour Clients", [
      requirement("move_to_alumni", movedToAlumni),
      requirement("reactivate", reactivated)
    ]),
    workflow("client_transfer", "Transferer un client a un autre coach pilote", [
      requirement("transfer", transferredClient)
    ], ["Confirmer la couverture du dossier par le coach receveur."])
  ];

  return {
    source: "actionLogs",
    recordsInspected: actionLogs.length,
    range: {
      oldestAt: actionLogs.map((log) => String(log.createdAt || "")).filter(Boolean).sort()[0] || "",
      latestAt: actionLogs.map((log) => String(log.createdAt || "")).filter(Boolean).sort().pop() || ""
    },
    automatedPassCount: workflows.filter((item) => item.automatedStatus === "pass").length,
    workflowCount: workflows.length,
    workflows,
    privacy: "Aucun nom, telephone, courriel ou contenu de mission n'est expose dans ce rapport."
  };
}

function buildPilotAcceptanceEvidence(records = []) {
  const checkFields = [
    "checkNavigation",
    "checkMission",
    "checkClientFollowup",
    "checkCrossCoach",
    "checkCoachRx",
    "checkVoicePlayback",
    "checkManualClient",
    "checkQuestionnaireDelivery",
    "checkHighVolumeRebooking"
  ];
  const cleanRecords = records.filter((record) => record && String(record.coachId || "").trim());
  const targetRecords = cleanRecords.filter((record) => String(record.appVersion || "") === terrainTargetVersion);
  const byCoach = new Map();
  cleanRecords.forEach((record) => {
    const coachId = String(record.coachId || "").trim();
    if (!byCoach.has(coachId)) byCoach.set(coachId, []);
    byCoach.get(coachId).push(record);
  });

  const coachRows = [...byCoach.entries()].map(([coachId, coachRecords]) => {
    const targetCoachRecords = coachRecords.filter((record) => String(record.appVersion || "") === terrainTargetVersion);
    const sortedRecords = [...coachRecords].sort((a, b) => (
      String(b.validatedAt || b.updatedAt || "").localeCompare(String(a.validatedAt || a.updatedAt || ""))
    ));
    let status = "pending";
    if (!targetCoachRecords.length && coachRecords.length) status = "stale";
    else if (targetCoachRecords.some((record) => record.status === "blocked")) status = "blocked";
    else if (targetCoachRecords.some((record) => record.status === "ready_with_reservation")) status = "ready_with_reservation";
    else if (targetCoachRecords.some((record) => record.status === "ready")) status = "ready";
    const environments = targetCoachRecords.map((record) => ({
      deviceType: String(record.deviceType || "unknown"),
      platform: String(record.platform || "unknown"),
      browser: String(record.browser || "unknown"),
      authMethod: String(record.authMethod || "unknown"),
      status: String(record.status || "pending")
    }));
    return {
      coachId,
      status,
      submissions: coachRecords.length,
      eligibleSubmissions: targetCoachRecords.length,
      checksCompleted: checkFields.filter((field) => targetCoachRecords.some((record) => record[field] === true)).length,
      latestAt: String(sortedRecords[0]?.validatedAt || sortedRecords[0]?.updatedAt || ""),
      appVersion: String(sortedRecords[0]?.appVersion || ""),
      environments
    };
  }).sort((a, b) => a.coachId.localeCompare(b.coachId));

  const readyRecords = targetRecords.filter((record) => record.status === "ready");
  const readyCoachIds = new Set(readyRecords.map((record) => String(record.coachId || "")).filter(Boolean));
  const reservationCoachCount = coachRows.filter((row) => row.status === "ready_with_reservation").length;
  const blockedCoachCount = coachRows.filter((row) => row.status === "blocked").length;
  const checkCoverage = Object.fromEntries(checkFields.map((field) => [
    field,
    new Set(readyRecords.filter((record) => record[field] === true).map((record) => String(record.coachId || ""))).size
  ]));
  const environmentValues = (field) => [...new Set(readyRecords.map((record) => String(record[field] || "")).filter(Boolean))].sort();
  const environmentCoverage = {
    deviceTypes: environmentValues("deviceType"),
    platforms: environmentValues("platform"),
    browsers: environmentValues("browser"),
    authMethods: environmentValues("authMethod")
  };
  const gate = (id, label, met, evidence) => ({ id, label, met, evidence });
  const gates = [
    gate("three_coach_signoff", "Trois coachs pilotes ont confirme Pret", readyCoachIds.size >= 3, `${readyCoachIds.size}/3 coachs`),
    gate("no_blocked_coach", "Aucun coach n'a declare un blocage actif", blockedCoachCount === 0, `${blockedCoachCount} blocage(s)`),
    gate("no_reservation", "Aucune reserve terrain ne reste ouverte", reservationCoachCount === 0, `${reservationCoachCount} reserve(s)`),
    gate("ios_ready", "Un parcours iOS est confirme Pret", environmentCoverage.platforms.includes("ios"), environmentCoverage.platforms),
    gate("android_ready", "Un parcours Android est confirme Pret", environmentCoverage.platforms.includes("android"), environmentCoverage.platforms),
    gate("desktop_ready", "Un parcours ordinateur est confirme Pret", environmentCoverage.deviceTypes.includes("desktop"), environmentCoverage.deviceTypes),
    gate("cross_coach_coverage", "Trois coachs ont valide la couverture inter-coach", checkCoverage.checkCrossCoach >= 3, `${checkCoverage.checkCrossCoach}/3 coachs`),
    gate("coachrx_onboarding", "L'installation ou synchronisation CoachRx est validee", checkCoverage.checkCoachRx >= 1, `${checkCoverage.checkCoachRx} coach(s)`),
    gate("voice_playback", "Une mission vocale a ete creee et ecoutee", checkCoverage.checkVoicePlayback >= 1, `${checkCoverage.checkVoicePlayback} coach(s)`),
    gate("manual_client_non_admin", "Un coach a cree puis modifie un client manuel", checkCoverage.checkManualClient >= 1, `${checkCoverage.checkManualClient} coach(s)`),
    gate("questionnaire_delivery", "La livraison reelle d'un questionnaire a ete validee", checkCoverage.checkQuestionnaireDelivery >= 1, `${checkCoverage.checkQuestionnaireDelivery} coach(s)`),
    gate("high_volume_rebooking", "Un rebooking de 10 seances ou plus a ete controle", checkCoverage.checkHighVolumeRebooking >= 1, `${checkCoverage.checkHighVolumeRebooking} coach(s)`)
  ];

  return {
    source: "pilotAcceptances",
    recordsInspected: cleanRecords.length,
    targetAppVersion: terrainTargetVersion,
    eligibleRecords: targetRecords.length,
    staleRecordCount: cleanRecords.length - targetRecords.length,
    coachCoverage: new Set(targetRecords.map((record) => String(record.coachId || "")).filter(Boolean)).size,
    requiredReadyCoachCount: 3,
    readyCoachCount: readyCoachIds.size,
    reservationCoachCount,
    blockedCoachCount,
    checkCoverage,
    environmentCoverage,
    coachRows,
    gates,
    missingGates: gates.filter((item) => !item.met).map((item) => item.id),
    terrainReady: gates.every((item) => item.met),
    finalManualGate: "Confirmer qu'aucun incident P0/P1 n'est ouvert au verdict final.",
    privacy: "Aucun nom de coach ou client, courriel, telephone, commentaire ou texte libre n'est expose dans ce rapport."
  };
}

function phoneOf(client) {
  return String(client.phoneNormalized || client.clientPhoneNormalized || client.phone || "").replace(/\D/g, "");
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return `***${digits.slice(-4)}`;
}

function normalizeComparable(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function statusOf(item) {
  return item.status || "(blank)";
}

function groupByStatus(items) {
  return items.reduce((acc, item) => {
    const status = statusOf(item);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function groupByField(items, field, fallback = "(blank)") {
  return items.reduce((acc, item) => {
    const key = String(item[field] || fallback);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function groupByNormalizedField(items, field, fallback = "(blank)") {
  return items.reduce((acc, item) => {
    const key = String(item[field] || fallback).trim().toLowerCase() || fallback;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function ageHours(timestamp) {
  const time = Date.parse(timestamp || "");
  if (!Number.isFinite(time)) return null;
  return Math.round(((Date.now() - time) / 36e5) * 10) / 10;
}

function dateEpoch(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : null;
}

function countByPerformancePeriods(items, field) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const counts = {
    "7d": 0,
    "30d": 0,
    "60d": 0,
    month: 0,
    last_month: 0,
    "6m": 0,
    "12m": 0,
    missingDate: 0
  };
  for (const item of items) {
    const time = dateEpoch(item[field]);
    if (!time) {
      counts.missingDate += 1;
      continue;
    }
    if (now - time <= 7 * 24 * 60 * 60 * 1000) counts["7d"] += 1;
    if (now - time <= 30 * 24 * 60 * 60 * 1000) counts["30d"] += 1;
    if (now - time <= 60 * 24 * 60 * 60 * 1000) counts["60d"] += 1;
    if (time >= startOfMonth && time < startOfNextMonth) counts.month += 1;
    if (time >= startOfLastMonth && time < startOfMonth) counts.last_month += 1;
    if (now - time <= 183 * 24 * 60 * 60 * 1000) counts["6m"] += 1;
    if (now - time <= 365 * 24 * 60 * 60 * 1000) counts["12m"] += 1;
  }
  return counts;
}

function isActiveClient(client) {
  return !["removed", "archived", "alumni", "do_not_contact", "import_stale"].includes(statusOf(client));
}

function isOpenTask(task) {
  if (task.sourceStale === true || task.archivedAt || task.completedAt || task.ignoredAt) return false;
  return ["open", "waiting"].includes(statusOf(task));
}

function isOpenRebooking(rebooking) {
  return ["open", "a_rebooker", "pending", "waiting"].includes(String(rebooking.status || "").trim().toLowerCase());
}

function rebookingPhoneOf(rebooking) {
  return String(
    rebooking.phoneNormalized
      || rebooking.clientPhoneNormalized
      || rebooking.clientPhone
      || rebooking.phone
      || ""
  ).replace(/\D/g, "");
}

function rebookingSessionsOf(rebooking) {
  const sessions = Number(rebooking.sessionsToRebook || rebooking.sessionCount || 1);
  return Number.isFinite(sessions) ? Math.max(1, sessions) : 1;
}

function numberFromGroup(group, keys) {
  return keys.reduce((total, key) => total + Number(group[key] || 0), 0);
}

function buildCoachDiagnostic({ coach, activeClients, missingPhones, openTasks, responses, sends, rebookings, status }) {
  const issues = [];
  const actions = [];
  const questionnaireStatuses = groupByNormalizedField(responses, "processingStatus", "to_read");
  const rebookingMatchMethods = groupByNormalizedField(rebookings, "matchMethod", "sans_methode");
  const unmatchedResponses = numberFromGroup(questionnaireStatuses, ["unmatched", "non_matched", "non_matche"]);
  const toReadResponses = numberFromGroup(questionnaireStatuses, ["to_read", "a_lire"]);
  const erroredSends = sends.filter((send) => send.status === "error" || send.errorMessage || send.errorCode);
  const openRebookings = rebookings.filter(isOpenRebooking);
  const highVolumeOpenRebookings = openRebookings.filter((item) => rebookingSessionsOf(item) >= 10);
  const unmatchedRebookings = rebookings.filter((item) => {
    const method = String(item.matchMethod || item.matchStatus || "").trim().toLowerCase();
    return method === "unmatched" || method === "non_matched" || method === "non_matche" || !item.clientId;
  });
  const rebookingsWithoutPhone = rebookings.filter((item) => !rebookingPhoneOf(item));
  const taskSources = groupByField(openTasks, "source");
  const taskTypes = groupByField(openTasks, "type");

  if (!status) {
    issues.push("Aucune trace de synchronisation coachSyncStatus.");
    actions.push("Lancer Synchroniser ce coach depuis Guide, puis relancer audit-live-firestore.cmd.");
  } else if (ageHours(status.syncedAt) !== null && ageHours(status.syncedAt) > 8) {
    issues.push(`Derniere sync vieille de ${ageHours(status.syncedAt)} h.`);
    actions.push("Relancer la sync avant de conclure sur les donnees visibles.");
  }

  if (activeClients.length === 0) {
    issues.push("Aucun client actif importe.");
    actions.push("Verifier les exports CoachRx/CORE et les alias coach dans les sources Sheets.");
  }

  if (missingPhones.length > 0) {
    issues.push(`${missingPhones.length} client(s) actif(s) sans telephone.`);
    actions.push("Completer les telephones dans la source de verite avant de tester GHL ou le matching questionnaire.");
  }

  if (openTasks.length > 0) {
    const sourceList = Object.entries(taskSources).map(([key, value]) => `${key}: ${value}`).join(", ");
    issues.push(`${openTasks.length} To-do ouverte(s), sources: ${sourceList || "inconnues"}.`);
    if (taskSources.google_sheets_tasks_current) {
      actions.push("Auditer TASKS_Current: ces actions viennent d'une source explicite, pas d'une deduction CoachRx automatique.");
    } else {
      actions.push("Verifier que chaque To-do ouverte a une source et une action coach claire.");
    }
  }

  if (unmatchedResponses > 0) {
    issues.push(`${unmatchedResponses} reponse(s) questionnaire non matchee(s).`);
    actions.push("Valider le telephone normalise des reponses et du client; classer ou fusionner les non matchees.");
  }

  if (toReadResponses > 0) {
    issues.push(`${toReadResponses} reponse(s) questionnaire a lire.`);
    actions.push("Faire lire ces reponses par le coach et confirmer que la priorite/couleur/action sont comprehensibles.");
  }

  if (sends.length === 0) {
    issues.push("Aucun envoi questionnaire journalise pour ce coach.");
    actions.push("Tester un vrai envoi GHL avec un client qui a un telephone present dans GHL.");
  }

  if (erroredSends.length > 0) {
    issues.push(`${erroredSends.length} erreur(s) d'envoi questionnaire.`);
    actions.push("Lire le journal d'envoi: telephone manquant, contact GHL introuvable, secret ou workflow a corriger.");
  }

  if (unmatchedRebookings.length > 0) {
    issues.push(`${unmatchedRebookings.length} rebooking(s) sans client relie ou match fragile.`);
    actions.push("Comparer avec l'app rebooking historique; ajouter telephone/sourceId si le matching par nom est trop fragile.");
  }

  if (rebookingsWithoutPhone.length > 0) {
    issues.push(`${rebookingsWithoutPhone.length} rebooking(s) sans telephone source.`);
    actions.push("Enrichir la source rebooking avec telephone quand possible pour reduire les non matches.");
  }

  if (highVolumeOpenRebookings.length > 0) {
    const examples = highVolumeOpenRebookings
      .sort((a, b) => rebookingSessionsOf(b) - rebookingSessionsOf(a))
      .slice(0, 3)
      .map((item) => `${item.clientName || item.name || item.id}: ${rebookingSessionsOf(item)}`)
      .join(", ");
    issues.push(`${highVolumeOpenRebookings.length} dossier(s) rebooking ouvert(s) ont au moins 10 seances declarees (${examples}).`);
    actions.push("Valider ces volumes avec la source legacy avant de les presenter comme une charge confirmee au coach.");
  }

  if (issues.length === 0) {
    issues.push("Aucun probleme majeur detecte dans l'audit automatise.");
    actions.push("Passer a l'audit humain de l'UX et des libelles dans l'app live.");
  }

  const severity = activeClients.length === 0 || unmatchedResponses > 3 || openTasks.length > 10
    ? "high"
    : missingPhones.length > 0 || unmatchedResponses > 0 || unmatchedRebookings.length > 0 || openTasks.length > 0
      ? "medium"
      : "low";

  return {
    severity,
    summary: `${coach.name}: ${issues[0]}`,
    likelyCauses: issues,
    recommendedActions: [...new Set(actions)],
    focus: {
      missingPhones: missingPhones.slice(0, 6).map((client) => client.name || client.id),
      openTaskSources: taskSources,
      openTaskTypes: taskTypes,
      questionnaireProcessing: questionnaireStatuses,
      rebookingMatchMethods
    }
  };
}

function sumByCoach(coachAudits, selector) {
  return coachAudits.reduce((total, coach) => total + Number(selector(coach) || 0), 0);
}

function sortCoachesBy(coachAudits, selector) {
  return [...coachAudits]
    .map((coach) => ({
      coachId: coach.coachId,
      coachName: coach.coachName,
      value: Number(selector(coach) || 0),
      severity: coach.diagnostic?.severity || "unknown"
    }))
    .filter((coach) => coach.value > 0)
    .sort((a, b) => b.value - a.value || a.coachName.localeCompare(b.coachName))
    .slice(0, 5);
}

function pickTriageItems(symptoms) {
  const status = readSourceActivationStatus();
  const triage = Array.isArray(status.pilotSymptomTriage) ? status.pilotSymptomTriage : [];
  const wanted = new Set(symptoms);
  const matches = triage.filter((item) => {
    const text = JSON.stringify(item).toLowerCase();
    return Array.from(wanted).some((symptom) => text.includes(String(symptom).toLowerCase()));
  });
  return matches.map((item) => ({
    symptom: item.symptom,
    likelySource: item.likelySource,
    sourceTypesToCheck: item.sourceTypesToCheck || [],
    evidenceToCheck: item.evidenceToCheck || [],
    doNotDo: item.doNotDo || [],
    nextAction: item.nextAction || ""
  }));
}

function pickDiagnosticPlaybooks(symptoms) {
  const status = readSourceActivationStatus();
  const playbooks = Array.isArray(status.diagnosticPlaybooks) ? status.diagnosticPlaybooks : [];
  const wanted = new Set(Array.from(symptoms).map((symptom) => String(symptom).toLowerCase()));
  return playbooks
    .filter((playbook) => wanted.has(String(playbook.symptomFamily || "").toLowerCase()))
    .map((playbook) => ({
      id: playbook.id,
      symptomFamily: playbook.symptomFamily,
      questionToAnswer: playbook.questionToAnswer,
      sourcePriority: playbook.sourcePriority || [],
      inspectCollections: playbook.inspectCollections || [],
      requiredEvidence: playbook.requiredEvidence || [],
      safeNextAction: playbook.safeNextAction || "",
      writeAllowedWhen: playbook.writeAllowedWhen || "",
      doNotDo: playbook.doNotDo || []
    }));
}

function buildGlobalDiagnostic(coachAudits, latestSyncRuns) {
  const latestRun = Array.isArray(latestSyncRuns) && latestSyncRuns.length ? latestSyncRuns[0] : null;
  const totals = {
    activeClients: sumByCoach(coachAudits, (coach) => coach.counts.activeClients),
    clientsMissingPhone: sumByCoach(coachAudits, (coach) => coach.counts.clientsMissingPhone),
    openTasks: sumByCoach(coachAudits, (coach) => coach.counts.openTasks),
    questionnaireResponses: sumByCoach(coachAudits, (coach) => coach.counts.questionnaireResponses),
    questionnaireSends: sumByCoach(coachAudits, (coach) => coach.counts.questionnaireSends),
    unmatchedQuestionnaireResponses: sumByCoach(coachAudits, (coach) =>
      numberFromGroup(coach.questionnaire.responseProcessingStatuses || {}, ["unmatched", "non_matched", "non_matche"])
    ),
    toReadQuestionnaireResponses: sumByCoach(coachAudits, (coach) =>
      numberFromGroup(coach.questionnaire.responseProcessingStatuses || {}, ["to_read", "a_lire"])
    ),
    rebookings: sumByCoach(coachAudits, (coach) => coach.counts.rebookings),
    openRebookings: sumByCoach(coachAudits, (coach) => coach.rebooking.openCount),
    rebookingsMissingPhone: sumByCoach(coachAudits, (coach) => coach.rebooking.missingPhone),
    rebookingsMissingClientId: sumByCoach(coachAudits, (coach) => coach.rebooking.missingClientId),
    openRebookingSessions: sumByCoach(coachAudits, (coach) => coach.rebooking.openSessionCount),
    highVolumeOpenRebookings: sumByCoach(coachAudits, (coach) => coach.rebooking.highVolumeOpenCount)
  };
  const taskSources = coachAudits.reduce((acc, coach) => {
    Object.entries(coach.openTaskSources || {}).forEach(([source, count]) => {
      acc[source || "(blank)"] = (acc[source || "(blank)"] || 0) + Number(count || 0);
    });
    return acc;
  }, {});
  const taskTypes = coachAudits.reduce((acc, coach) => {
    Object.entries(coach.openTaskTypes || {}).forEach(([type, count]) => {
      acc[type || "(blank)"] = (acc[type || "(blank)"] || 0) + Number(count || 0);
    });
    return acc;
  }, {});
  const highestRiskCoaches = coachAudits
    .filter((coach) => coach.diagnostic?.severity === "high")
    .map((coach) => ({
      coachId: coach.coachId,
      coachName: coach.coachName,
      summary: coach.diagnostic.summary
    }));
  const nextActions = [];
  const observedSymptoms = new Set();

  if (totals.clientsMissingPhone > 0) {
    observedSymptoms.add("missing phone");
    nextActions.push({
      priority: 1,
      area: "client_directory",
      action: "Brancher ou confirmer la source officielle de telephone client avant de juger Questionnaire/GHL.",
      evidence: `${totals.clientsMissingPhone}/${totals.activeClients} client(s) actif(s) sans telephone.`,
      owner: "Michael/Bob Operator pour acces source; Codex pour validation et mapping."
    });
  }

  if (totals.openTasks > 0 && taskSources.google_sheets_tasks_current) {
    observedSymptoms.add("To-do");
    nextActions.push({
      priority: 2,
      area: "to_do",
      action: "Auditer TASKS_Current comme source d'actions explicites et separer les vraies missions du bruit importé.",
      evidence: `${taskSources.google_sheets_tasks_current} To-do ouverte(s) viennent de google_sheets_tasks_current.`,
      owner: "Codex peut raffiner diagnostics/UX; source live a confirmer avant suppression massive."
    });
  } else if (totals.openTasks > 0) {
    observedSymptoms.add("To-do");
    nextActions.push({
      priority: 2,
      area: "to_do",
      action: "Verifier que chaque To-do ouverte a une source et un bouton d'action coach clair.",
      evidence: `${totals.openTasks} To-do ouverte(s) detectee(s).`,
      owner: "Codex"
    });
  }

  if (totals.unmatchedQuestionnaireResponses > 0 || totals.toReadQuestionnaireResponses > 0) {
    observedSymptoms.add("Questionnaire");
    nextActions.push({
      priority: 3,
      area: "questionnaires",
      action: "Prioriser le matching par telephone et transformer les couleurs en filtres/action lisibles.",
      evidence: `${totals.unmatchedQuestionnaireResponses} non matchee(s), ${totals.toReadQuestionnaireResponses} a lire.`,
      owner: "Codex; GHL/telephone requis pour envois reels fiables."
    });
  }

  if (totals.questionnaireSends === 0) {
    observedSymptoms.add("Questionnaire");
    nextActions.push({
      priority: 4,
      area: "ghl_send",
      action: "Tester l'envoi questionnaire seulement avec un client dont le telephone est confirme dans GHL, puis valider le journal Firestore.",
      evidence: "Aucun envoi questionnaire journalise dans Firestore.",
      owner: "Michael pour test reel; Codex pour journal/erreurs."
    });
  }

  if (totals.rebookingsMissingClientId > 0 || totals.rebookingsMissingPhone > 0) {
    observedSymptoms.add("Rebooking");
    nextActions.push({
      priority: 5,
      area: "rebooking",
      action: "Garder l'app rebooking legacy comme reference et ne migrer qu'apres parite telephone/sourceId.",
      evidence: `${totals.rebookingsMissingClientId} sans clientId, ${totals.rebookingsMissingPhone} sans telephone source.`,
      owner: "Codex pour audit de parite; Bob Operator seulement apres approbation."
    });
  }

  return {
    status: nextActions.length ? "needs_source_activation" : "ready_for_product_ux_audit",
    latestSyncRun: latestRun ? {
      id: latestRun.id,
      source: latestRun.source || "",
      createdAt: latestRun.createdAt || "",
      warningCount: latestRun.warningCount || 0
    } : null,
    totals,
    taskSources,
    taskTypes,
    highestRiskCoaches,
    topMissingPhoneCoaches: sortCoachesBy(coachAudits, (coach) => coach.counts.clientsMissingPhone),
    topOpenTaskCoaches: sortCoachesBy(coachAudits, (coach) => coach.counts.openTasks),
    topRebookingReviewCoaches: sortCoachesBy(coachAudits, (coach) => coach.rebooking.missingClientId + coach.rebooking.missingPhone),
    symptomTriage: pickTriageItems(observedSymptoms),
    diagnosticPlaybooks: pickDiagnosticPlaybooks(observedSymptoms),
    nextActions: nextActions.sort((a, b) => a.priority - b.priority)
  };
}

async function auditCoach(token, coach) {
  const [status, clients, tasks, responses, sends, rebookings, checkups, impacts, alumni] = await Promise.all([
    getDoc(token, "coachSyncStatus", coach.id),
    queryByCoach(token, "clients", coach.id),
    queryByCoach(token, "tasks", coach.id),
    queryByCoach(token, "questionnaireResponses", coach.id),
    queryByCoach(token, "questionnaireSends", coach.id),
    queryByCoach(token, "rebookings", coach.id),
    queryByCoach(token, "checkups", coach.id),
    queryByCoach(token, "impacts", coach.id),
    queryByCoach(token, "alumni", coach.id)
  ]);
  const activeClients = clients.filter(isActiveClient);
  const openTasks = tasks.filter(isOpenTask);
  const missingPhones = activeClients.filter((client) => !phoneOf(client));
  const checkupPhonesByName = checkups.reduce((acc, checkup) => {
    const name = normalizeComparable(checkup.clientName);
    const phone = phoneOf(checkup);
    if (name && phone) {
      if (!acc.has(name)) acc.set(name, new Set());
      acc.get(name).add(phone);
    }
    return acc;
  }, new Map());
  const missingPhoneResolution = missingPhones.slice(0, 20).map((client) => {
    const candidatePhones = [...(checkupPhonesByName.get(normalizeComparable(client.name)) || [])];
    return {
      id: client.id,
      name: client.name || "",
      csmCandidateCount: candidatePhones.length,
      csmCandidatePhonesMasked: candidatePhones.map(maskPhone),
      resolutionStatus: candidatePhones.length === 1 ? "unique_csm_candidate" : candidatePhones.length > 1 ? "multiple_csm_candidates" : "no_csm_candidate"
    };
  });
  const rebookingStatuses = groupByStatus(rebookings);
  const rebookingMatchMethods = groupByNormalizedField(rebookings, "matchMethod", "sans_methode");
  const openRebookings = rebookings.filter(isOpenRebooking);
  const openRebookingItems = [...openRebookings]
    .sort((a, b) => rebookingSessionsOf(b) - rebookingSessionsOf(a))
    .map((item) => ({
      id: item.id,
      clientId: item.clientId || "",
      clientName: item.clientName || item.name || "",
      sessionsToRebook: rebookingSessionsOf(item),
      groupedSourceCount: Number(item.groupedSourceCount || 0),
      sourceEventCount: Array.isArray(item.sourceEventIds) ? item.sourceEventIds.length : 0,
      source: item.source || "",
      matchMethod: item.matchMethod || "",
      detectedAt: item.detectedAt || "",
      appointmentAt: item.appointmentAt || ""
    }));
  const highVolumeOpenItems = openRebookingItems.filter((item) => item.sessionsToRebook >= 10);
  const rebookingsWithoutClient = rebookings.filter((item) => !item.clientId);
  const rebookingsWithoutPhone = rebookings.filter((item) => !rebookingPhoneOf(item));
  const recentResponses = [...responses]
    .sort((a, b) => Date.parse(b.submittedAt || b.receivedAt || b.createdAt || "") - Date.parse(a.submittedAt || a.receivedAt || a.createdAt || ""))
    .slice(0, 8);
  const recentSends = [...sends]
    .sort((a, b) => Date.parse(b.sentAt || b.preparedAt || b.createdAt || "") - Date.parse(a.sentAt || a.preparedAt || a.createdAt || ""))
    .slice(0, 8);
  const audit = {
    coachId: coach.id,
    coachName: coach.name,
    syncStatus: status ? {
      status: status.status || "",
      clientsImported: status.clientsImported || 0,
      warningCount: status.warningCount || 0,
      syncedAt: status.syncedAt || "",
      syncAgeHours: ageHours(status.syncedAt),
      source: status.source || "",
      triggeredBy: status.triggeredBy || ""
    } : null,
    counts: {
      clients: clients.length,
      activeClients: activeClients.length,
      staleClients: clients.length - activeClients.length,
      clientsMissingPhone: missingPhones.length,
      tasks: tasks.length,
      openTasks: openTasks.length,
      archivedTasks: tasks.length - openTasks.length,
      questionnaireResponses: responses.length,
      questionnaireSends: sends.length,
      rebookings: rebookings.length,
      checkups: checkups.length,
      impacts: impacts.length,
      alumni: alumni.length
    },
    performance: {
      checkupsByCheckupDate: countByPerformancePeriods(checkups, "checkupDate")
    },
    clientStatuses: groupByStatus(clients),
    taskStatuses: groupByStatus(tasks),
    blankStatusTasks: tasks.filter((task) => !String(task.status || "").trim()).slice(0, 8).map((task) => ({
      id: task.id,
      title: task.title || "",
      type: task.type || "",
      source: task.source || "",
      clientName: task.clientName || ""
    })),
    openTaskSources: groupByField(openTasks, "source"),
    openTaskTypes: groupByField(openTasks, "type"),
    openTaskSamples: openTasks.slice(0, 10).map((task) => ({
      id: task.id,
      title: task.title || "",
      type: task.type || "",
      clientName: task.clientName || "",
      source: task.source || "",
      description: task.description || ""
    })),
    sampleClients: activeClients.slice(0, 5).map((client) => ({
      id: client.id,
      name: client.name || "",
      phone: phoneOf(client) || "",
      source: client.source || ""
    })),
    sampleMissingPhone: missingPhones.slice(0, 5).map((client) => client.name || client.id),
    missingPhoneResolution,
    rebooking: {
      statuses: rebookingStatuses,
      matchMethods: rebookingMatchMethods,
      openCount: openRebookings.length,
      openSessionCount: openRebookingItems.reduce((sum, item) => sum + item.sessionsToRebook, 0),
      highVolumeOpenCount: highVolumeOpenItems.length,
      openItems: openRebookingItems,
      missingClientId: rebookingsWithoutClient.length,
      missingPhone: rebookingsWithoutPhone.length,
      samplesNeedingReview: rebookings
        .filter((item) => !item.clientId || !rebookingPhoneOf(item) || String(item.matchMethod || "").toLowerCase() === "unmatched")
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          clientName: item.clientName || item.name || "",
          status: item.status || "",
          matchMethod: item.matchMethod || "",
          phone: rebookingPhoneOf(item) || "",
          clientId: item.clientId || ""
        }))
    },
    questionnaire: {
      responseProcessingStatuses: groupByNormalizedField(responses, "processingStatus", "to_read"),
      responseTriageStatuses: groupByNormalizedField(responses, "triageStatus", "sans_statut"),
      responseMatchStatuses: groupByNormalizedField(responses, "matchStatus", "sans_statut"),
      responseActionTypes: groupByNormalizedField(responses, "coachActionType", "sans_action"),
      sendStatuses: groupByNormalizedField(sends, "status", "sans_statut"),
      sendErrors: sends
        .filter((send) => send.status === "error" || send.errorMessage || send.errorCode)
        .slice(0, 8)
        .map((send) => ({
          id: send.id,
          clientName: send.clientName || "",
          phone: phoneOf(send) || "",
          status: send.status || "",
          errorCode: send.errorCode || "",
          errorMessage: send.errorMessage || ""
        })),
      recentResponses: recentResponses.map((response) => ({
        id: response.id,
        clientName: response.clientName || "",
        phone: phoneOf(response) || "",
        triageStatus: response.triageStatus || "",
        coachActionType: response.coachActionType || "",
        processingStatus: response.processingStatus || "",
        matchStatus: response.matchStatus || "",
        submittedAt: response.submittedAt || response.receivedAt || response.createdAt || ""
      })),
      recentSends: recentSends.map((send) => ({
        id: send.id,
        clientName: send.clientName || "",
        phone: phoneOf(send) || "",
        status: send.status || "",
        sentAt: send.sentAt || send.preparedAt || send.createdAt || "",
        errorCode: send.errorCode || ""
      }))
    }
  };
  audit.diagnostic = buildCoachDiagnostic({ coach, activeClients, missingPhones, openTasks, responses, sends, rebookings, status });
  return audit;
}

async function main() {
  const token = await readAccessToken();
  if (process.argv.includes("--five-star")) {
    const [actionLogs, pilotAcceptances] = await Promise.all([
      latestCollectionDocs(token, "actionLogs"),
      collectionDocs(token, "pilotAcceptances", 500)
    ]);
    const evidence = buildFiveStarWorkflowEvidence(actionLogs);
    const terrainAcceptance = buildPilotAcceptanceEvidence(pilotAcceptances);
    const report = {
      ok: evidence.automatedPassCount === evidence.workflowCount,
      automaticOk: evidence.automatedPassCount === evidence.workflowCount,
      terrainReady: terrainAcceptance.terrainReady,
      projectId,
      generatedAt: new Date().toISOString(),
      recordsInspected: evidence.recordsInspected,
      range: evidence.range,
      automatedPassCount: evidence.automatedPassCount,
      workflowCount: evidence.workflowCount,
      workflows: evidence.workflows.map((workflow) => ({
        id: workflow.id,
        label: workflow.label,
        status: workflow.automatedStatus,
        requirements: workflow.requirements.map((item) => ({
          key: item.key,
          met: item.met,
          count: item.count,
          coachCoverage: item.coachCoverage,
          actorCoverage: item.actorCoverage,
          latestAt: item.latestAt
        })),
        missing: workflow.missing,
        humanChecks: workflow.humanChecks
      })),
      missingEvidence: evidence.workflows
        .filter((workflow) => workflow.automatedStatus !== "pass")
        .map((workflow) => ({ id: workflow.id, missing: workflow.missing })),
      humanOnlyChecks: evidence.workflows
        .flatMap((workflow) => workflow.humanChecks.map((check) => ({ workflowId: workflow.id, check }))),
      terrainAcceptance,
      privacy: `${evidence.privacy} ${terrainAcceptance.privacy}`
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  const [syncRuns, actionLogs] = await Promise.all([
    latestSyncRuns(token).catch((error) => ({ error: error.message })),
    latestCollectionDocs(token, "actionLogs").catch((error) => ({ error: error.message }))
  ]);
  const coachAudits = [];
  for (const coach of coaches) {
    coachAudits.push(await auditCoach(token, coach));
  }
  const ok = coachAudits.some((coach) => coach.counts.activeClients > 0)
    && coachAudits.some((coach) => coach.syncStatus)
    && coachAudits.every((coach) => coach.counts.activeClients === 0 || coach.counts.clientsMissingPhone < coach.counts.activeClients);
  const report = {
    ok,
    projectId,
    generatedAt: new Date().toISOString(),
    latestSyncRuns: Array.isArray(syncRuns) ? syncRuns.map((run) => ({
      id: run.id,
      source: run.source || "",
      coachIds: run.coachIds || [],
      createdAt: run.createdAt || "",
      warningCount: Array.isArray(run.warnings) ? run.warnings.length : 0
    })) : syncRuns,
    coaches: coachAudits
  };
  report.globalDiagnostic = buildGlobalDiagnostic(coachAudits, report.latestSyncRuns);
  report.fiveStarWorkflowEvidence = Array.isArray(actionLogs)
    ? buildFiveStarWorkflowEvidence(actionLogs)
    : actionLogs;
  if (process.argv.includes("--summary")) {
    console.log(JSON.stringify({
      ok: report.ok,
      projectId: report.projectId,
      generatedAt: report.generatedAt,
      latestSyncRuns: report.latestSyncRuns,
      globalDiagnostic: report.globalDiagnostic,
      fiveStarWorkflowEvidence: report.fiveStarWorkflowEvidence,
      coaches: coachAudits.map((coach) => ({
        coachId: coach.coachId,
        coachName: coach.coachName,
        syncStatus: coach.syncStatus?.status || "missing",
        counts: {
          activeClients: coach.counts.activeClients,
          clientsMissingPhone: coach.counts.clientsMissingPhone,
          openTasks: coach.counts.openTasks,
          questionnaireResponses: coach.counts.questionnaireResponses,
          questionnaireSends: coach.counts.questionnaireSends,
          rebookings: coach.counts.rebookings,
          openRebookings: coach.rebooking.openCount,
          openRebookingSessions: coach.rebooking.openSessionCount,
          highVolumeOpenRebookings: coach.rebooking.highVolumeOpenCount,
          checkupsByCheckupDate: coach.performance.checkupsByCheckupDate
        },
        diagnostic: {
          severity: coach.diagnostic.severity,
          summary: coach.diagnostic.summary,
          likelyCauses: coach.diagnostic.likelyCauses,
          recommendedActions: coach.diagnostic.recommendedActions
        }
      }))
    }, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  const hint = authHint(error);
  if (hint) {
    console.error(hint);
    console.error("");
  }
  console.error(error.message);
  process.exit(1);
});
