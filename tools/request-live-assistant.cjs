const fs = require("fs");
const os = require("os");
const path = require("path");

const projectId = "cfsb-dashboard-coach-aa9a4";
const database = "(default)";
const adminEmail = "info@crossfitstbasilelegrand.com";
const targetCoachId = String(process.argv[2] || "15893").trim();
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
  if (!response.ok || !data.access_token) throw new Error(`Firebase auth ${response.status}. Reauth requise.`);
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
  if (Object.prototype.hasOwnProperty.call(field, "doubleValue")) return Number(field.doubleValue);
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
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const document = await api(token, `${baseUrl}/assistantRequests/${encodeURIComponent(requestId)}`);
    const request = decodeFields(document.fields || {});
    if (["answered", "clarification", "refused"].includes(request.status)) return request;
    if (request.status === "error") throw new Error(request.errorMessage || "Assistant en erreur.");
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("La demande Assistant n'a pas termine dans la fenetre de verification.");
}

async function main() {
  const token = await accessToken();
  const authUsers = await api(
    token,
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?maxResults=1000`
  );
  const adminAuthUser = (authUsers.users || [])
    .find((user) => String(user.email || "").toLowerCase() === adminEmail);
  if (!adminAuthUser?.localId) throw new Error("Compte Firebase Auth info@ introuvable.");
  const users = await api(token, `${baseUrl}/users?pageSize=100`);
  const adminUser = (users.documents || [])
    .map((document) => ({ id: docId(document), ...decodeFields(document.fields || {}) }))
    .find((user) => (
      user.id === adminAuthUser.localId
      && user.active === true
      && user.role === "admin"
      && String(user.email || "").toLowerCase() === adminEmail
    ));
  if (!adminUser) throw new Error("Profil admin info@ actif introuvable dans users.");

  const now = new Date().toISOString();
  const requestId = `live_admin_${Date.now()}`;
  await api(token, `${baseUrl}/assistantRequests?documentId=${encodeURIComponent(requestId)}`, {
    method: "POST",
    body: JSON.stringify({
      fields: {
        userId: { stringValue: adminUser.id },
        userEmail: { stringValue: adminEmail },
        actorCoachId: { stringValue: "admin" },
        targetCoachId: { stringValue: targetCoachId },
        requestKind: { stringValue: "general" },
        contextType: { stringValue: "global" },
        contextEntityId: { stringValue: "" },
        inputMode: { stringValue: "text" },
        inputText: { stringValue: "Donne un briefing tres court des priorites operationnelles actuelles de ce coach, avec des references verifiables." },
        status: { stringValue: "queued" },
        source: { stringValue: "assistant_admin_private_pilot" },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now }
      }
    })
  });

  const request = await waitForResult(token, requestId);
  const proposalId = String(request.proposalId || "");
  if (!proposalId) throw new Error("La demande a termine sans proposition.");
  const proposalDoc = await api(token, `${baseUrl}/assistantProposals/${encodeURIComponent(proposalId)}`);
  const proposal = decodeFields(proposalDoc.fields || {});
  console.log(JSON.stringify({
    ok: true,
    requestId,
    proposalId,
    targetCoachId,
    status: request.status,
    intent: proposal.intent,
    modelName: proposal.modelName,
    promptVersion: proposal.promptVersion,
    evidenceCount: Array.isArray(proposal.evidenceRefs) ? proposal.evidenceRefs.length : 0,
    contextCounts: proposal.contextCounts || {},
    latencyMs: proposal.latencyMs || 0
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
