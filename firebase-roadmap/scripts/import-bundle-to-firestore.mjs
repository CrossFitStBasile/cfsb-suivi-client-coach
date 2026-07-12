import { access, readFile, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ID = "cfsb-roadmap-trimestrielle";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const firebaseRoot = path.resolve(scriptDir, "..");
const bundlePath = path.resolve(process.env.ROADMAP_IMPORT_BUNDLE || path.join(firebaseRoot, "tmp", "roadmap-import-bundle.json"));
const apply = process.argv.includes("--apply");
const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
const documents = flattenCollections(bundle.collections || {});

validateBundle(bundle, documents);

if (!apply) {
  console.log(JSON.stringify({
    ok: true,
    mode: "dry-run",
    projectId: PROJECT_ID,
    bundlePath,
    idempotencyKey: bundle.metadata.idempotencyKey,
    documents: documents.length,
    collections: countByCollection(documents),
    next: "Relancer avec --apply pour ecrire cette copie dans Firestore."
  }, null, 2));
  process.exit(0);
}

const accessToken = await getFirebaseCliAccessToken();
const chunks = chunk(documents, 100);
let written = 0;
for (const items of chunks) {
  const response = await firestoreRequest(":commit", accessToken, {
    method: "POST",
    body: {
      writes: items.map((item) => ({
        update: {
          name: documentName(item.collection, item.id),
          fields: encodeFields(item.data)
        }
      }))
    }
  });
  written += response.writeResults?.length || 0;
}

if (written !== documents.length) {
  throw new Error(`Import incomplet: ${written}/${documents.length} ecritures confirmees.`);
}

const verifiedCollections = {};
for (const collectionName of Object.keys(bundle.collections || {})) {
  verifiedCollections[collectionName] = await countRemoteDocuments(collectionName, accessToken);
}

console.log(JSON.stringify({
  ok: true,
  mode: "apply",
  projectId: PROJECT_ID,
  idempotencyKey: bundle.metadata.idempotencyKey,
  written,
  verifiedCollections
}, null, 2));

function flattenCollections(collections) {
  const result = [];
  Object.entries(collections).forEach(([collection, docs]) => {
    Object.entries(docs || {}).forEach(([id, data]) => {
      result.push({ collection, id, data });
    });
  });
  return result;
}

function validateBundle(value, docs) {
  if (!value?.metadata?.idempotencyKey) throw new Error("Lot sans cle d'idempotence.");
  if (!docs.length) throw new Error("Lot sans document.");
  const seen = new Set();
  docs.forEach((item) => {
    if (!item.collection || !item.id || !item.data || typeof item.data !== "object") {
      throw new Error("Document d'import invalide.");
    }
    const key = `${item.collection}/${item.id}`;
    if (seen.has(key)) throw new Error(`Document duplique: ${key}`);
    seen.add(key);
  });
}

function countByCollection(docs) {
  return docs.reduce((counts, item) => {
    counts[item.collection] = (counts[item.collection] || 0) + 1;
    return counts;
  }, {});
}

function documentName(collection, id) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
}

function encodeFields(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
}

function encodeValue(value) {
  if (value == null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFields(value) } };
  }
  return { stringValue: String(value) };
}

async function firestoreRequest(pathSuffix, token, options = {}) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents${pathSuffix}`;
  const response = await fetch(url, {
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

async function countRemoteDocuments(collectionName, token) {
  let count = 0;
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "300", "mask.fieldPaths": "__name__" });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${encodeURIComponent(collectionName)}?${query}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
    count += data.documents?.length || 0;
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return count;
}

async function getFirebaseCliAccessToken() {
  const firebaseToolsRoot = await findFirebaseToolsRoot();
  const require = createRequire(import.meta.url);
  const auth = require(path.join(firebaseToolsRoot, "lib", "auth.js"));
  const apiv2 = require(path.join(firebaseToolsRoot, "lib", "apiv2.js"));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error("Compte Firebase CLI non authentifie.");
  }
  auth.setRefreshToken(account.tokens.refresh_token);
  return apiv2.getAccessToken();
}

async function findFirebaseToolsRoot() {
  if (process.env.FIREBASE_TOOLS_ROOT) {
    const explicit = path.resolve(process.env.FIREBASE_TOOLS_ROOT);
    await access(path.join(explicit, "lib", "auth.js"), fsConstants.R_OK);
    return explicit;
  }

  const dlxRoot = path.join(
    process.env.LOCALAPPDATA || "",
    "pnpm-cache",
    "dlx"
  );
  const dlxEntries = await readdir(dlxRoot, { withFileTypes: true });
  for (const dlxEntry of dlxEntries) {
    if (!dlxEntry.isDirectory()) continue;
    const candidate = path.join(dlxRoot, dlxEntry.name, "pkg", "node_modules", "firebase-tools");
    try {
      await access(path.join(candidate, "lib", "auth.js"), fsConstants.R_OK);
      return candidate;
    } catch {
      // Continue vers le prochain cache pnpm dlx.
    }
  }
  throw new Error("firebase-tools introuvable. Lance d'abord une commande Firebase CLI.");
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
