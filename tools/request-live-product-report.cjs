const fs = require("fs");
const os = require("os");
const path = require("path");

const projectId = "cfsb-dashboard-coach-aa9a4";
const database = "(default)";
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(database)}/documents`;
const cliConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const firebaseClientId = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const firebaseClientSecret = "j9iVZfS8kkCEFUPaAeJV0sAi";

async function accessToken() {
  const config = JSON.parse(fs.readFileSync(cliConfigPath, "utf8"));
  const tokens = config.tokens || {};
  if (tokens.access_token && (!tokens.expires_at || Date.now() < Number(tokens.expires_at) - 120000)) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) throw new Error("Session Firebase CLI absente. Relancer firebase login --reauth.");
  const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: firebaseClientId,
      client_secret: firebaseClientSecret,
      grant_type: "refresh_token"
    })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Firebase auth ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data.access_token;
}

async function api(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`Firestore ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

function fieldValue(field = {}) {
  if (Object.prototype.hasOwnProperty.call(field, "stringValue")) return field.stringValue;
  if (Object.prototype.hasOwnProperty.call(field, "booleanValue")) return field.booleanValue;
  if (Object.prototype.hasOwnProperty.call(field, "integerValue")) return Number(field.integerValue);
  if (Object.prototype.hasOwnProperty.call(field, "timestampValue")) return field.timestampValue;
  if (field.mapValue?.fields) return decodeFields(field.mapValue.fields);
  if (field.arrayValue?.values) return field.arrayValue.values.map(fieldValue);
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fieldValue(value)]));
}

function docId(document = {}) {
  return String(document.name || "").split("/").pop();
}

async function waitForResult(token, requestId) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const document = await api(token, `${baseUrl}/productReportRequests/${encodeURIComponent(requestId)}`);
    const request = decodeFields(document.fields || {});
    if (request.status === "success") return request;
    if (request.status === "error") throw new Error(request.errorMessage || "Generation du rapport en erreur.");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Le rapport n'a pas termine dans la fenetre de verification.");
}

async function main() {
  const token = await accessToken();
  const users = await api(token, `${baseUrl}/users?pageSize=100`);
  const adminUser = (users.documents || [])
    .map((document) => ({ id: docId(document), ...decodeFields(document.fields || {}) }))
    .find((user) => user.active === true && user.role === "admin");
  if (!adminUser) throw new Error("Profil admin actif introuvable dans users.");
  const requestId = `manual_${Date.now()}`;
  await api(token, `${baseUrl}/productReportRequests?documentId=${encodeURIComponent(requestId)}`, {
    method: "POST",
    body: JSON.stringify({
      fields: {
        status: { stringValue: "queued" },
        requestedByUid: { stringValue: adminUser.id },
        requestedByEmail: { stringValue: String(adminUser.email || "") },
        source: { stringValue: "codex_post_deploy_verification" },
        createdAt: { timestampValue: new Date().toISOString() }
      }
    })
  });
  const request = await waitForResult(token, requestId);
  const report = await api(token, `${baseUrl}/weeklyProductReports/${encodeURIComponent(request.reportId)}`);
  const decoded = decodeFields(report.fields || {});
  console.log(JSON.stringify({
    ok: true,
    requestId,
    reportId: request.reportId,
    reportDate: decoded.reportDate,
    summary: decoded.summary,
    attentionCount: decoded.attentionCount,
    activeCoaches: decoded.adoption?.activeCoaches,
    totalCoaches: decoded.adoption?.totalCoaches,
    automationCandidates: Array.isArray(decoded.automationCandidates) ? decoded.automationCandidates.length : 0
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
