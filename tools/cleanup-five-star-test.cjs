const fs = require("fs");
const os = require("os");
const path = require("path");

const projectId = "cfsb-dashboard-coach-aa9a4";
const database = "(default)";
const marker = "TEST 5/5 - 20260713";
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(database)}/documents`;
const cliConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const execute = process.argv.includes("--execute");

const targets = [
  { collection: "clients", id: "15935_test-5-5-20260713" },
  { collection: "tasks", id: "sOgt2kzk4ZDKyBtFuAEN" },
  { collection: "alumni", id: "client_15935_test-5-5-20260713" }
];

function readAccessToken() {
  const config = JSON.parse(fs.readFileSync(cliConfigPath, "utf8"));
  const token = config.tokens?.access_token;
  const expiresAt = Number(config.tokens?.expires_at || 0);
  if (!token || (expiresAt && Date.now() > expiresAt - 60000)) {
    throw new Error("Session Firebase CLI absente ou expiree. Relancer firebase-login-dashboard.cmd.");
  }
  return token;
}

async function request(token, url, options = {}, allowNotFound = false) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  if (allowNotFound && response.status === 404) return null;
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

function targetUrl(target) {
  return `${baseUrl}/${encodeURIComponent(target.collection)}/${encodeURIComponent(target.id)}`;
}

async function main() {
  const token = readAccessToken();
  const inspected = [];

  for (const target of targets) {
    const document = await request(token, targetUrl(target), {}, true);
    if (!document) {
      inspected.push({ ...target, status: "absent", markerVerified: true });
      continue;
    }
    const data = decodeFields(document.fields || {});
    const markerVerified = JSON.stringify(data).includes(marker);
    inspected.push({ ...target, status: "present", markerVerified });
  }

  const unsafe = inspected.filter((target) => target.status === "present" && !target.markerVerified);
  if (unsafe.length) {
    throw new Error(`Nettoyage refuse: marqueur synthetique absent pour ${unsafe.map((target) => `${target.collection}/${target.id}`).join(", ")}.`);
  }

  if (!execute) {
    console.log(JSON.stringify({
      ok: true,
      mode: "dry_run",
      marker,
      targets: inspected,
      next: "Relancer avec --execute pour supprimer uniquement les documents presents et verifies."
    }, null, 2));
    return;
  }

  for (const target of inspected.filter((item) => item.status === "present")) {
    await request(token, targetUrl(target), { method: "DELETE" });
  }

  const remaining = [];
  for (const target of targets) {
    const document = await request(token, targetUrl(target), {}, true);
    if (document) remaining.push(`${target.collection}/${target.id}`);
  }
  if (remaining.length) {
    throw new Error(`Nettoyage incomplet: ${remaining.join(", ")}.`);
  }

  console.log(JSON.stringify({
    ok: true,
    mode: "executed",
    marker,
    deleted: inspected.filter((target) => target.status === "present").map(({ collection, id }) => ({ collection, id })),
    alreadyAbsent: inspected.filter((target) => target.status === "absent").map(({ collection, id }) => ({ collection, id })),
    preserved: ["actionLogs"]
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
