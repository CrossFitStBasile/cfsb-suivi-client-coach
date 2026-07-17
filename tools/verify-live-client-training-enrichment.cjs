const fs = require("fs");
const os = require("os");
const path = require("path");

const projectId = "cfsb-dashboard-coach-aa9a4";
const database = "(default)";
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(database)}/documents`;
const cliConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const firebaseClientId = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const firebaseClientSecret = "j9iVZfS8kkCEFUPaAeJV0sAi";
const expectedCoachIds = new Set(["15935", "15928", "17242", "15902", "15893", "15937", "15936"]);

function readCliConfig() {
  const config = JSON.parse(fs.readFileSync(cliConfigPath, "utf8"));
  if (!config.tokens?.refresh_token && !config.tokens?.access_token) {
    throw new Error("Connexion Firebase CLI absente.");
  }
  return config;
}

async function refreshAccessToken(refreshToken) {
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
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Impossible de rafraichir la connexion Firebase CLI (${response.status}).`);
  }
  return data.access_token;
}

async function accessToken() {
  const config = readCliConfig();
  const tokens = config.tokens || {};
  const expiresAt = Number(tokens.expires_at || 0);
  if (!tokens.access_token || (expiresAt && Date.now() > expiresAt - 120000)) {
    return refreshAccessToken(tokens.refresh_token);
  }
  return tokens.access_token;
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
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data).slice(0, 500)}`);
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

async function listCollection(token, collectionId) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(`${baseUrl}/${collectionId}`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await request(token, url.toString());
    for (const document of data.documents || []) {
      documents.push(decodeFields(document.fields || {}));
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return documents;
}

function timestampOf(item) {
  return Date.parse(item.finishedAt || item.updatedAt || item.createdAt || "") || 0;
}

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

async function main() {
  const token = await accessToken();
  const [clients, importRuns, syncRequests] = await Promise.all([
    listCollection(token, "clients"),
    listCollection(token, "sourceImportRuns"),
    listCollection(token, "syncRequests")
  ]);

  const activeClients = clients.filter((client) => !["removed", "archived", "alumni", "do_not_contact", "import_stale"].includes(String(client.status || "")));
  const attendanceClients = activeClients.filter((client) => hasNumber(client.attendance30Days));
  const levelClients = activeClients.filter((client) => String(client.levelMethodOverall || "").trim());
  const completeClients = activeClients.filter((client) => hasNumber(client.attendance30Days) && String(client.levelMethodOverall || "").trim());
  const manualTargets = activeClients.filter((client) => hasNumber(client.targetSessionsPerWeek));

  const enrichmentRuns = importRuns
    .filter((run) => run.sourceType === "client_enrichment")
    .sort((a, b) => timestampOf(b) - timestampOf(a));
  const latestByCoach = new Map();
  for (const run of enrichmentRuns) {
    const coachId = String(run.coachId || "");
    if (expectedCoachIds.has(coachId) && !latestByCoach.has(coachId)) latestByCoach.set(coachId, run);
  }
  const latestRuns = [...latestByCoach.values()];
  const finishedLatestRuns = latestRuns.filter((run) => ["done", "warning"].includes(String(run.status || "")));
  const newestRunAt = latestRuns.length
    ? new Date(Math.max(...latestRuns.map(timestampOf))).toISOString()
    : "";
  const latestEnrichmentRequests = syncRequests
    .filter((request) => request.sourceType === "client_enrichment")
    .sort((a, b) => timestampOf(b) - timestampOf(a))
    .slice(0, 14);
  const newestRequestAt = latestEnrichmentRequests.length
    ? new Date(Math.max(...latestEnrichmentRequests.map(timestampOf))).toISOString()
    : "";

  const report = {
    ok: attendanceClients.length > 0 && levelClients.length > 0 && finishedLatestRuns.length === expectedCoachIds.size,
    projectId,
    generatedAt: new Date().toISOString(),
    clients: {
      active: activeClients.length,
      withAttendance30Days: attendanceClients.length,
      withLevelMethod: levelClients.length,
      withBoth: completeClients.length,
      withManualWeeklyTarget: manualTargets.length,
      zeroAttendancePreserved: attendanceClients.filter((client) => client.attendance30Days === 0).length
    },
    latestClientEnrichmentRuns: {
      coachesExpected: expectedCoachIds.size,
      coachesFound: latestRuns.length,
      finished: finishedLatestRuns.length,
      recordsReceived: latestRuns.reduce((sum, run) => sum + Number(run.recordsReceived || 0), 0),
      recordsWritten: latestRuns.reduce((sum, run) => sum + Number(run.recordsWritten || 0), 0),
      newestRunAt,
      statuses: latestRuns.reduce((counts, run) => {
        const status = String(run.status || "unknown");
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {})
    },
    recentClientEnrichmentRequests: {
      count: latestEnrichmentRequests.length,
      newestRequestAt,
      statuses: latestEnrichmentRequests.reduce((counts, request) => {
        const status = String(request.status || "unknown");
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {}),
      errors: latestEnrichmentRequests
        .filter((request) => request.status === "error")
        .map((request) => String(request.errorMessage || "Erreur sans detail").slice(0, 220))
    }
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
