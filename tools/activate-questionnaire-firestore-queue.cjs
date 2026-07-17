#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const bobRoot = path.resolve("C:/Users/micha/Documents/Codex/Bob Operator/bob-operator");
const bobConfigDir = path.join(bobRoot, "config");
const bobGeneratedDir = path.join(bobRoot, "generated");
const tokenPath = path.join(bobConfigDir, "token.json");
const oauthClientPath = path.join(bobConfigDir, "oauth-client.json");

const questionnaireScriptId = "1RzTyLvUdw6NdVI2vsDoi7a2bjWGAZDXml94QYG4TCs9wF5KJdKm3HFBa";
const datastoreScope = "https://www.googleapis.com/auth/datastore";
const externalRequestScope = "https://www.googleapis.com/auth/script.external_request";
const activationMarker = "CFSB_QUESTIONNAIRE_FIRESTORE_QUEUE_VERSION";

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fsp.mkdir(bobGeneratedDir, { recursive: true });

  const project = await appsScriptApi(`projects/${questionnaireScriptId}/content`);
  const backupPath = path.join(bobGeneratedDir, `questionnaire-before-firestore-queue-${stamp}.json`);
  await fsp.writeFile(backupPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

  const files = (project.files || []).map((file) => ({ ...file }));
  const codeFile = files.find((file) => file.name === "Code" && file.type === "SERVER_JS");
  if (!codeFile) throw new Error("Fichier Code.gs introuvable dans le script questionnaire.");

  let changed = false;
  const activationAlreadyPresent = codeFile.source.includes(activationMarker);
  if (!activationAlreadyPresent) {
    codeFile.source = injectFirestoreQueueCall(codeFile.source);
    codeFile.source += `\n\n${firestoreQueueSource()}\n`;
    changed = true;
  }

  const manifestFile = files.find((file) => file.name === "appsscript" && file.type === "JSON");
  if (manifestFile) {
    const manifest = parseJsonSafe(manifestFile.source);
    const scopes = new Set(Array.isArray(manifest.oauthScopes) ? manifest.oauthScopes : []);
    const beforeSize = scopes.size;
    scopes.add(externalRequestScope);
    scopes.add(datastoreScope);
    if (scopes.size !== beforeSize || !Array.isArray(manifest.oauthScopes)) {
      manifest.oauthScopes = Array.from(scopes);
      manifestFile.source = `${JSON.stringify(manifest, null, 2)}\n`;
      changed = true;
    }
  } else {
    files.push({
      name: "appsscript",
      type: "JSON",
      source: `${JSON.stringify({ timeZone: "America/Toronto", oauthScopes: [externalRequestScope, datastoreScope] }, null, 2)}\n`
    });
    changed = true;
  }

  if (changed) {
    await appsScriptApi(`projects/${questionnaireScriptId}/content`, {
      method: "PUT",
      body: JSON.stringify({ files })
    });
  }

  const report = {
    scriptId: questionnaireScriptId,
    changed,
    activationAlreadyPresent,
    backupPath,
    activatedAt: new Date().toISOString(),
    behavior: [
      "Le Sheet Responses continue d'etre ecrit comme avant.",
      "Le miroir dashboard historique continue d'etre tente comme avant.",
      "Une demande Firestore syncRequests est ajoutee en mode non bloquant.",
      "Une erreur Firestore est loggee mais ne bloque pas la soumission client."
    ]
  };
  const reportPath = path.join(repoRoot, "firebase-dashboard", "QUESTIONNAIRE_FIRESTORE_QUEUE_ACTIVATION.json");
  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

function injectFirestoreQueueCall(source) {
  const needle = "const dashboardMirror = mirrorResponseToDashboardSafely_(normalized, CONFIG.responsesSheetName);";
  if (!source.includes(needle)) {
    throw new Error("Point d'insertion introuvable apres mirrorResponseToDashboardSafely_.");
  }
  return source.replace(
    needle,
    `${needle}\n    const firestoreQueue = queueQuestionnaireResponseToDashboardSafely_(normalized, CONFIG.responsesSheetName);`
  ).replace(
    "dashboard_mirror_error: dashboardMirror.error || ''",
    "dashboard_mirror_error: dashboardMirror.error || '',\n      firestore_queue_status: firestoreQueue.status,\n      firestore_queue_error: firestoreQueue.error || '',\n      firestore_queue_request_id: firestoreQueue.requestId || ''"
  ).replace(
    "dashboard_mirror_status: dashboardMirror.status",
    "dashboard_mirror_status: dashboardMirror.status,\n      firestore_queue_status: firestoreQueue.status,\n      firestore_queue_request_id: firestoreQueue.requestId || ''"
  );
}

function firestoreQueueSource() {
  return String.raw`
const CFSB_QUESTIONNAIRE_FIRESTORE_QUEUE_VERSION = '20260609-questionnaire-direct-queue';
const CFSB_QUESTIONNAIRE_FIRESTORE_PROJECT_ID = 'cfsb-dashboard-coach-aa9a4';
const CFSB_QUESTIONNAIRE_FIRESTORE_DATABASE_ID = '(default)';
const CFSB_QUESTIONNAIRE_SYNC_REQUEST_COLLECTION = 'syncRequests';

const CFSB_QUESTIONNAIRE_COACH_MAP = {
  'marcandre menard': { coachRxId: '15935', coachName: 'Marc-Andre Menard' },
  'marc-andre menard': { coachRxId: '15935', coachName: 'Marc-Andre Menard' },
  'marc-andré ménard': { coachRxId: '15935', coachName: 'Marc-Andre Menard' },
  'iheb yahyaoui': { coachRxId: '15928', coachName: 'Iheb Yahyaoui' },
  'yeb yahyaoui': { coachRxId: '15928', coachName: 'Iheb Yahyaoui' },
  'camille proulx': { coachRxId: '17242', coachName: 'Camille Proulx' },
  'david olivier': { coachRxId: '15902', coachName: 'David Olivier' },
  'gabriel mayer bedard': { coachRxId: '15893', coachName: 'Gabriel Mayer Bedard' },
  'gabriel mayer bédard': { coachRxId: '15893', coachName: 'Gabriel Mayer Bedard' },
  'hugo lelievre': { coachRxId: '15937', coachName: 'Hugo Lelievre' },
  'hugo lelièvre': { coachRxId: '15937', coachName: 'Hugo Lelievre' },
  'raphael samson': { coachRxId: '15936', coachName: 'Raphael Samson' },
  'raphaël samson': { coachRxId: '15936', coachName: 'Raphael Samson' }
};

function queueQuestionnaireResponseToDashboardSafely_(normalized, sourceTab) {
  try {
    return queueQuestionnaireResponseToDashboard_(normalized, sourceTab);
  } catch (error) {
    try {
      log_('ERROR', 'firestore_queue_failed', normalized && normalized.response_id, normalized && normalized.submission_token, error.message, {
        stack: error.stack || ''
      });
    } catch (logError) {}
    return { status: 'error', error: error.message || String(error) };
  }
}

function queueQuestionnaireResponseToDashboard_(normalized, sourceTab) {
  if (!normalized || !normalized.response_id) throw new Error('Missing response_id for Firestore queue.');
  const record = normalizeResponseForDashboard_(normalized, sourceTab || (CONFIG && CONFIG.responsesSheetName) || 'Responses');
  const coach = resolveQuestionnaireDashboardCoach_(record.coach_name || normalized.coach_name || normalized.coach_id || '');
  const requestId = makeQuestionnaireDashboardRequestId_(record.response_id);
  const now = new Date().toISOString();
  const payload = {
    requestType: 'source_import',
    status: 'queued',
    source: 'questionnaire_apps_script_direct',
    sourceTransport: 'apps_script_firestore_rest',
    queueVersion: CFSB_QUESTIONNAIRE_FIRESTORE_QUEUE_VERSION,
    sourceType: 'questionnaire_responses',
    coachId: coach.coachRxId,
    coachRxId: coach.coachRxId,
    coachName: coach.coachName || record.coach_name || normalized.coach_name || '',
    records: [record],
    recordsReceived: 1,
    requestedBy: 'questionnaire_endpoint',
    requestedByEmail: 'questionnaire_endpoint',
    sourceRunId: 'questionnaire-response-' + String(record.response_id),
    sourceGeneratedAt: String(record.received_at || normalized.received_at || now),
    createdAt: now,
    updatedAt: now
  };
  const firestoreResult = questionnaireFirestorePatchDocument_(CFSB_QUESTIONNAIRE_SYNC_REQUEST_COLLECTION, requestId, payload);
  return {
    status: 'queued',
    requestId: requestId,
    firestoreName: firestoreResult.name || '',
    coachRxId: coach.coachRxId,
    coachName: coach.coachName
  };
}

function resolveQuestionnaireDashboardCoach_(coachKey) {
  const raw = String(coachKey || '').trim();
  const normalized = normalizeQuestionnaireCoachKey_(raw);
  if (CFSB_QUESTIONNAIRE_COACH_MAP[normalized]) return CFSB_QUESTIONNAIRE_COACH_MAP[normalized];
  return { coachRxId: '', coachName: raw };
}

function normalizeQuestionnaireCoachKey_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function questionnaireFirestorePatchDocument_(collectionPath, docId, data) {
  const encodedCollection = String(collectionPath || '').split('/').map(encodeURIComponent).join('/');
  const encodedDocId = encodeURIComponent(String(docId || ''));
  const url = 'https://firestore.googleapis.com/v1/projects/'
    + encodeURIComponent(CFSB_QUESTIONNAIRE_FIRESTORE_PROJECT_ID)
    + '/databases/'
    + encodeURIComponent(CFSB_QUESTIONNAIRE_FIRESTORE_DATABASE_ID)
    + '/documents/'
    + encodedCollection
    + '/'
    + encodedDocId;

  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify({ fields: questionnaireFirestoreEncodeMap_(data) })
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (error) {
    parsed = { raw: text };
  }
  if (status < 200 || status >= 300) {
    throw new Error('Ecriture Firestore syncRequests echouee: ' + status + ' ' + text);
  }
  return parsed;
}

function questionnaireFirestoreEncodeMap_(data) {
  const fields = {};
  Object.keys(data || {}).forEach(function(key) {
    const value = data[key];
    if (typeof value === 'undefined') return;
    fields[key] = questionnaireFirestoreEncodeValue_(value);
  });
  return fields;
}

function questionnaireFirestoreEncodeValue_(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(function(item) { return questionnaireFirestoreEncodeValue_(item); }) } };
  }
  if (typeof value === 'object') return { mapValue: { fields: questionnaireFirestoreEncodeMap_(value) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function makeQuestionnaireDashboardRequestId_(responseId) {
  const cleanResponse = String(responseId || 'response').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  const stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd_HHmmss_SSS');
  return 'questionnaire_responses_' + cleanResponse + '_' + stamp;
}
`;
}

async function appsScriptApi(pathname, options = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://script.googleapis.com/v1/${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function getAccessToken() {
  if (!fs.existsSync(tokenPath)) throw new Error("Bob Operator token.json introuvable.");
  const token = await readJson(tokenPath);
  const expiresAt = (token.created_at || 0) + (token.expires_in || 0) * 1000 - 60_000;
  if (token.access_token && Date.now() < expiresAt) return token.access_token;
  if (!token.refresh_token) throw new Error("Le jeton Bob n'a pas de refresh_token.");

  const client = await readOAuthClient();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token"
    })
  });
  const refreshed = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(refreshed)}`);
  const nextToken = { ...token, ...refreshed, refresh_token: token.refresh_token, created_at: Date.now() };
  await fsp.writeFile(tokenPath, `${JSON.stringify(nextToken, null, 2)}\n`, "utf8");
  return nextToken.access_token;
}

async function readOAuthClient() {
  if (!fs.existsSync(oauthClientPath)) throw new Error("Bob Operator oauth-client.json introuvable.");
  const raw = await readJson(oauthClientPath);
  const client = raw.installed || raw.web || raw;
  if (!client.client_id || !client.client_secret) {
    throw new Error("oauth-client.json doit contenir client_id et client_secret.");
  }
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function parseJsonSafe(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
