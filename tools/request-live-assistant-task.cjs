const fs = require("fs");
const os = require("os");
const path = require("path");

const projectId = "cfsb-dashboard-coach-aa9a4";
const database = "(default)";
const adminEmail = "info@crossfitstbasilelegrand.com";
const targetCoachId = String(process.argv[2] || "15893").trim();
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(database)}/documents`;
const cliConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function accessToken() {
  const config = JSON.parse(fs.readFileSync(cliConfigPath, "utf8"));
  const tokens = config.tokens || {};
  if (!tokens.access_token || (tokens.expires_at && Date.now() >= Number(tokens.expires_at) - 60000)) {
    throw new Error("Session Firebase CLI expiree. Lance firebase login --reauth, puis relance le test.");
  }
  return tokens.access_token;
}

async function api(token, url, options = {}, allowMissing = false) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (allowMissing && response.status === 404) return null;
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
  if (Object.prototype.hasOwnProperty.call(field, "nullValue")) return null;
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

function todayToronto() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function waitForDocument(token, collection, id, statuses, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const document = await api(token, `${baseUrl}/${collection}/${encodeURIComponent(id)}`, {}, true);
    if (document) {
      const value = decodeFields(document.fields || {});
      if (statuses.includes(value.status)) return value;
      if (value.status === "error") throw new Error(value.errorMessage || `${collection} en erreur.`);
    }
    await sleep(2000);
  }
  throw new Error(`${collection}/${id} n'a pas termine dans la fenetre de verification.`);
}

async function deleteDocument(token, collection, id) {
  if (!id) return;
  await api(token, `${baseUrl}/${collection}/${encodeURIComponent(id)}`, { method: "DELETE" }, true);
}

async function main() {
  const token = accessToken();
  const created = {};
  let result;
  try {
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
    created.requestId = `live_task_admin_${Date.now()}`;
    await api(token, `${baseUrl}/assistantRequests?documentId=${encodeURIComponent(created.requestId)}`, {
      method: "POST",
      body: JSON.stringify({
        fields: {
          userId: { stringValue: adminUser.id },
          userEmail: { stringValue: adminEmail },
          actorCoachId: { stringValue: "admin" },
          targetCoachId: { stringValue: targetCoachId },
          requestKind: { stringValue: "task_create" },
          contextType: { stringValue: "global" },
          contextEntityId: { stringValue: "" },
          inputMode: { stringValue: "text" },
          inputText: { stringValue: "Cree une mission generale de test intitulee Verification IA confirmee, a faire aujourd'hui, priorite normale. Indique dans les details qu'il s'agit d'un test automatique temporaire." },
          status: { stringValue: "queued" },
          source: { stringValue: "assistant_admin_private_pilot" },
          createdAt: { timestampValue: now },
          updatedAt: { timestampValue: now }
        }
      })
    });

    const request = await waitForDocument(token, "assistantRequests", created.requestId, ["proposed"], 150000);
    created.proposalId = String(request.proposalId || "");
    if (!created.proposalId) throw new Error("La demande a termine sans proposition executable.");
    const proposalDoc = await api(token, `${baseUrl}/assistantProposals/${encodeURIComponent(created.proposalId)}`);
    const proposal = decodeFields(proposalDoc.fields || {});
    if (
      proposal.status !== "proposed"
      || proposal.actionType !== "task.create"
      || proposal.confirmationRequired !== true
    ) {
      throw new Error("La proposition live ne demande pas la confirmation task.create attendue.");
    }

    created.actionRequestId = `live_action_admin_${Date.now()}`;
    const actionNow = new Date().toISOString();
    await api(token, `${baseUrl}/assistantActionRequests?documentId=${encodeURIComponent(created.actionRequestId)}`, {
      method: "POST",
      body: JSON.stringify({
        fields: {
          userId: { stringValue: adminUser.id },
          userEmail: { stringValue: adminEmail },
          proposalId: { stringValue: created.proposalId },
          targetCoachId: { stringValue: targetCoachId },
          actionType: { stringValue: "task.create" },
          confirmedParameters: {
            mapValue: {
              fields: {
                clientId: { stringValue: "" },
                title: { stringValue: "[TEST IA] Verification mission confirmee" },
                description: { stringValue: "Mission temporaire creee par le test live de la boucle de confirmation." },
                priority: { stringValue: "P2" },
                dueAt: { stringValue: todayToronto() },
                starred: { booleanValue: false }
              }
            }
          },
          status: { stringValue: "queued" },
          source: { stringValue: "assistant_admin_task_confirmation_pilot" },
          createdAt: { timestampValue: actionNow },
          updatedAt: { timestampValue: actionNow }
        }
      })
    });

    const action = await waitForDocument(token, "assistantActionRequests", created.actionRequestId, ["success"], 90000);
    created.taskId = String(action.resultEntityId || "");
    if (!created.taskId) throw new Error("L'action a termine sans preuve de mission.");
    const taskDoc = await api(token, `${baseUrl}/tasks/${encodeURIComponent(created.taskId)}`);
    const task = decodeFields(taskDoc.fields || {});
    if (
      task.source !== "assistant_admin_confirmed"
      || task.assistantProposalId !== created.proposalId
      || task.title !== "[TEST IA] Verification mission confirmee"
      || task.status !== "open"
    ) {
      throw new Error("La mission live creee ne respecte pas le contrat confirme.");
    }

    result = {
      ok: true,
      targetCoachId,
      proposalStatus: proposal.status,
      actionStatus: action.status,
      taskProof: {
        source: task.source,
        status: task.status,
        priority: task.priority,
        dueAt: task.dueAt
      },
      duplicatePrevented: action.duplicatePrevented === true,
      cleanedUp: true
    };
  } finally {
    await deleteDocument(token, "tasks", created.taskId);
    await deleteDocument(token, "actionLogs", created.proposalId ? `assistant_action_${created.proposalId}` : "");
    await deleteDocument(token, "actionLogs", created.requestId ? `assistant_${created.requestId}` : "");
    await deleteDocument(token, "assistantActionRequests", created.actionRequestId);
    await deleteDocument(token, "assistantProposals", created.proposalId);
    await deleteDocument(token, "assistantRequests", created.requestId);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
