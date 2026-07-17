const fs = require("fs");
const os = require("os");
const path = require("path");

const projectId = "cfsb-dashboard-coach-aa9a4";
const database = "(default)";
const bucket = "cfsb-dashboard-coach-aa9a4.firebasestorage.app";
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
  if (!response.ok || !data.access_token) throw new Error(`Firebase auth: ${response.status} ${JSON.stringify(data)}`);
  return data.access_token;
}

async function api(token, url, options = {}, allow404 = false) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  if (allow404 && response.status === 404) return null;
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data).slice(0, 800)}`);
  return data;
}

function decode(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: encodeFields(value) } };
}

function encodeFields(value = {}) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
}

async function writeDoc(token, collection, id, value) {
  return api(token, `${baseUrl}/${collection}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(value) })
  });
}

async function getDoc(token, collection, id) {
  const data = await api(token, `${baseUrl}/${collection}/${encodeURIComponent(id)}`, {}, true);
  return data ? decodeFields(data.fields || {}) : null;
}

async function deleteDoc(token, collection, id) {
  await api(token, `${baseUrl}/${collection}/${encodeURIComponent(id)}`, { method: "DELETE" }, true);
}

async function runQuery(token, collectionId, fieldPath, value) {
  const data = await api(token, `${baseUrl}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: "EQUAL",
            value: encode(value)
          }
        },
        limit: 100
      }
    })
  });
  return data.map((entry) => entry.document).filter(Boolean);
}

async function findActor(token) {
  const data = await api(token, `${baseUrl}/users?pageSize=100`);
  const users = (data.documents || []).map((document) => ({
    id: document.name.split("/").pop(),
    ...decodeFields(document.fields || {})
  }));
  return users.find((user) => user.active === true && user.role === "admin")
    || users.find((user) => user.active === true && ["15935", "15928"].includes(String(user.coachId || "")));
}

async function cleanup(token, ids, storagePath = "") {
  const chunkDocs = await runQuery(token, "voiceMissionChunks", "requestId", ids.requestId).catch(() => []);
  await Promise.all(chunkDocs.map((document) => api(token, `https://firestore.googleapis.com/v1/${document.name}`, { method: "DELETE" }, true)));
  for (const collection of ["voiceMissionAttempts", "actionLogs"]) {
    const field = collection === "actionLogs" ? "entityId" : "taskId";
    const docs = await runQuery(token, collection, field, ids.taskId).catch(() => []);
    await Promise.all(docs.map((document) => api(token, `https://firestore.googleapis.com/v1/${document.name}`, { method: "DELETE" }, true)));
  }
  await Promise.all([
    deleteDoc(token, "tasks", ids.taskId),
    deleteDoc(token, "voiceMissionRequests", ids.requestId)
  ]);
  if (storagePath) {
    await api(
      token,
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}`,
      { method: "DELETE" },
      true
    ).catch(() => null);
  }
}

async function main() {
  const token = await accessToken();
  const actor = await findActor(token);
  if (!actor) throw new Error("Aucun profil actif admin ou coach pilote pour le test live.");
  const coachId = actor.role === "admin" ? "15935" : String(actor.coachId);
  const stamp = Date.now();
  const ids = {
    taskId: `voicee2e_${stamp}`,
    requestId: `voicee2e_request_${stamp}`
  };
  const audioBase64 = Buffer.from("CFSB voice queue live test", "utf8").toString("base64");
  let storagePath = "";
  let report = null;
  try {
    await writeDoc(token, "voiceMissionChunks", `${ids.requestId}_000`, {
      requestId: ids.requestId,
      coachId,
      userId: actor.id,
      index: 0,
      total: 1,
      data: audioBase64
    });
    await writeDoc(token, "voiceMissionRequests", ids.requestId, {
      coachId,
      taskId: ids.taskId,
      userId: actor.id,
      userEmail: actor.email || "",
      status: "queued",
      chunkCount: 1,
      audioBase64Length: audioBase64.length,
      mission: {
        operation: "create",
        taskId: ids.taskId,
        coachId,
        title: "TEST TECHNIQUE VOCAL",
        description: "Test automatique supprime apres validation.",
        priority: "P3",
        dueAt: new Date().toISOString().slice(0, 10),
        starred: false,
        mimeType: "audio/webm",
        durationSeconds: 1
      }
    });

    const deadline = Date.now() + 120000;
    let request = null;
    while (Date.now() < deadline) {
      request = await getDoc(token, "voiceMissionRequests", ids.requestId);
      if (["success", "error"].includes(request?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!request || request.status !== "success") {
      throw new Error(`Traitement vocal live non confirme: ${JSON.stringify(request || {})}`);
    }
    const task = await getDoc(token, "tasks", ids.taskId);
    storagePath = task?.voiceNote?.storagePath || request?.result?.voiceNote?.storagePath || "";
    if (!task || task.voiceNoteStatus !== "ready" || !storagePath) {
      throw new Error(`Mission vocale incomplete: ${JSON.stringify(task || {})}`);
    }
    const object = await api(
      token,
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}`
    );
    report = {
      ok: true,
      requestStatus: request.status,
      taskVoiceStatus: task.voiceNoteStatus,
      storageObjectPresent: Boolean(object?.name)
    };
  } finally {
    await cleanup(token, ids, storagePath);
  }
  const [taskAfter, requestAfter, chunksAfter, objectAfter] = await Promise.all([
    getDoc(token, "tasks", ids.taskId),
    getDoc(token, "voiceMissionRequests", ids.requestId),
    runQuery(token, "voiceMissionChunks", "requestId", ids.requestId),
    storagePath
      ? api(
        token,
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}`,
        {},
        true
      )
      : null
  ]);
  if (taskAfter || requestAfter || chunksAfter.length || objectAfter) {
    throw new Error("Le test vocal a reussi, mais son nettoyage live est incomplet.");
  }
  console.log(JSON.stringify({ ...report, cleanup: "verified" }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
