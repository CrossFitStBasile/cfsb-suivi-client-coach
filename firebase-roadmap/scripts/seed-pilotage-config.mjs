import { access, readFile, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ID = "cfsb-roadmap-trimestrielle";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const firebaseRoot = path.resolve(scriptDir, "..");
const configPath = path.resolve(process.env.PILOTAGE_CONFIG || path.join(firebaseRoot, "config", "pilotage-initial-2026-q3.json"));
const apply = process.argv.includes("--apply");
const config = JSON.parse(await readFile(configPath, "utf8"));
const documents = flattenCollections(config.collections || {});

validateConfig(config, documents);

const accessToken = await getFirebaseCliAccessToken();
const existing = [];
const missing = [];
for (const item of documents) {
  (await documentExists(item, accessToken) ? existing : missing).push(item);
}

if (!apply) {
  console.log(JSON.stringify({
    ok: true,
    mode: "dry-run",
    projectId: PROJECT_ID,
    configPath,
    idempotencyKey: config.metadata.idempotencyKey,
    total: documents.length,
    toCreate: countByCollection(missing),
    preserved: countByCollection(existing),
    next: "Relancer avec --apply pour creer uniquement les documents manquants."
  }, null, 2));
  process.exit(0);
}

for (const items of chunk(missing, 100)) {
  await firestoreRequest(":commit", accessToken, {
    method: "POST",
    body: {
      writes: items.map((item) => ({
        update: {
          name: documentName(item.collection, item.id),
          fields: encodeFields(item.data)
        },
        currentDocument: { exists: false }
      }))
    }
  });
}

const unverified = [];
for (const item of missing) {
  if (!(await documentExists(item, accessToken))) unverified.push(`${item.collection}/${item.id}`);
}
if (unverified.length) throw new Error(`Chargement incomplet: ${unverified.join(", ")}`);

console.log(JSON.stringify({
  ok: true,
  mode: "apply",
  projectId: PROJECT_ID,
  idempotencyKey: config.metadata.idempotencyKey,
  created: countByCollection(missing),
  preserved: countByCollection(existing)
}, null, 2));

function flattenCollections(collections) {
  return Object.entries(collections).flatMap(([collection, docs]) =>
    Object.entries(docs || {}).map(([id, data]) => ({ collection, id, data }))
  );
}

function validateConfig(value, docs) {
  if (!value?.metadata?.idempotencyKey) throw new Error("Configuration sans cle d'idempotence.");
  if (!docs.length) throw new Error("Configuration sans document.");
  const allowed = new Set(["pilotageMetrics", "pilotageMetricEntries", "pilotageIssues", "pilotageRocks", "pilotageMeetings"]);
  const seen = new Set();
  docs.forEach((item) => {
    if (!allowed.has(item.collection)) throw new Error(`Collection non permise: ${item.collection}`);
    if (!item.id || !item.data || typeof item.data !== "object") throw new Error("Document de configuration invalide.");
    const key = `${item.collection}/${item.id}`;
    if (seen.has(key)) throw new Error(`Document duplique: ${key}`);
    seen.add(key);
  });
}

async function documentExists(item, token) {
  const response = await fetch(documentUrl(item.collection, item.id), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return true;
}

async function firestoreRequest(pathSuffix, token, options = {}) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents${pathSuffix}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data;
}

function documentName(collection, id) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
}

function documentUrl(collection, id) {
  return `https://firestore.googleapis.com/v1/${documentName(collection, id)}`;
}

function encodeFields(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
}

function encodeValue(value) {
  if (value == null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}

async function getFirebaseCliAccessToken() {
  const firebaseToolsRoot = await findFirebaseToolsRoot();
  const require = createRequire(import.meta.url);
  const auth = require(path.join(firebaseToolsRoot, "lib", "auth.js"));
  const apiv2 = require(path.join(firebaseToolsRoot, "lib", "apiv2.js"));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Compte Firebase CLI non authentifie.");
  auth.setRefreshToken(account.tokens.refresh_token);
  return apiv2.getAccessToken();
}

async function findFirebaseToolsRoot() {
  if (process.env.FIREBASE_TOOLS_ROOT) {
    const explicit = path.resolve(process.env.FIREBASE_TOOLS_ROOT);
    await access(path.join(explicit, "lib", "auth.js"), fsConstants.R_OK);
    return explicit;
  }
  const dlxRoot = path.join(process.env.LOCALAPPDATA || "", "pnpm-cache", "dlx");
  for (const entry of await readdir(dlxRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(dlxRoot, entry.name, "pkg", "node_modules", "firebase-tools");
    try {
      await access(path.join(candidate, "lib", "auth.js"), fsConstants.R_OK);
      return candidate;
    } catch {
      // Continue jusqu'au cache Firebase CLI suivant.
    }
  }
  throw new Error("firebase-tools introuvable. Lance d'abord une commande Firebase CLI.");
}

function countByCollection(items) {
  return items.reduce((counts, item) => {
    counts[item.collection] = (counts[item.collection] || 0) + 1;
    return counts;
  }, {});
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
