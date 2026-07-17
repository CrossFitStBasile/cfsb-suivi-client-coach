"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const DEFAULT_DATABASE = "(default)";
const FIREBASE_CONFIG = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const FIREBASE_CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";
const PILOT_COACHES = [
  { id: "15935", name: "Marc-Andre Menard", email: "marcandremenard89@gmail.com", aliases: ["Marc-André Ménard", "Marc Andre Menard"] },
  { id: "15928", name: "Iheb Yahyaoui", email: "ihebya73@gmail.com", aliases: ["Iheb Yahiaoui"] },
  { id: "17242", name: "Camille Proulx", email: "camproulxx@gmail.com", aliases: [] },
  { id: "15902", name: "David Olivier", email: "davidolivier1997@gmail.com", aliases: [] },
  { id: "15893", name: "Gabriel Mayer Bedard", email: "info@crossfitstbasilelegrand.com", aliases: ["Gabriel Mayer Bédard"] },
  { id: "15937", name: "Hugo Lelievre", email: "hugolelievre34@gmail.com", aliases: ["Hugo Lelièvre"] },
  { id: "15936", name: "Raphael Samson", email: "raphael.samson@usherbrooke.ca", aliases: ["Raphaël Samson"] }
];
const OWNERSHIP_COLLECTIONS = [
  "clients",
  "tasks",
  "questionnaireResponses",
  "questionnaireSends",
  "questionnaireSchedules",
  "rebookings",
  "checkups",
  "impacts",
  "alumni"
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [rawKey, inline] = token.slice(2).split(/=(.*)/s, 2);
    if (inline !== undefined) args[rawKey] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) args[rawKey] = argv[++index];
    else args[rawKey] = true;
  }
  return args;
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizePhone(value) {
  const digits = clean(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : canonicalJson(value));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function contentHash(document, hashField = "contentSha256") {
  const clone = JSON.parse(JSON.stringify(document));
  delete clone[hashField];
  return sha256(clone);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function assertNoLinkedPathComponents(resolved, existingAncestor) {
  const root = path.parse(resolved).root;
  const relative = path.relative(root, existingAncestor);
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Refus d'un chemin prive traversant un lien symbolique ou une jonction: ${cursor}`);
    }
  }
}

function assertPrivatePath(filePath, { mustExist = false } = {}) {
  const resolved = path.resolve(filePath);
  if (mustExist && !fs.existsSync(resolved)) throw new Error(`Fichier prive introuvable: ${resolved}`);

  let existingAncestor = resolved;
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) throw new Error(`Aucun parent existant pour le chemin prive: ${resolved}`);
    existingAncestor = parent;
  }
  assertNoLinkedPathComponents(resolved, existingAncestor);

  const canonicalAncestor = fs.realpathSync.native(existingAncestor);
  const canonical = path.resolve(canonicalAncestor, path.relative(existingAncestor, resolved));
  const candidates = [resolved, canonical].map((value) => value.replace(/\\/g, "/").toLowerCase());
  if (candidates.some((value) => value.includes("/firebase-dashboard/public/") || value.endsWith("/firebase-dashboard/public"))) {
    throw new Error("Refus d'utiliser des donnees privees sous firebase-dashboard/public.");
  }
  if (candidates.some((value) => value.includes("/onedrive/"))) {
    throw new Error("Refus d'utiliser des donnees privees sous OneDrive. Utilise AppData\\Local\\CFSB-ownership-repair.");
  }

  let cursor = fs.existsSync(canonical) && fs.statSync(canonical).isDirectory()
    ? canonical
    : path.dirname(canonical);
  while (cursor && cursor !== path.dirname(cursor)) {
    if (fs.existsSync(path.join(cursor, ".git"))) {
      throw new Error("Refus d'utiliser des donnees privees dans un worktree Git. Utilise AppData\\Local\\CFSB-ownership-repair.");
    }
    cursor = path.dirname(cursor);
  }
  return canonical;
}

function assertPrivateInputPath(filePath) {
  const canonical = assertPrivatePath(filePath, { mustExist: true });
  if (!fs.statSync(canonical).isFile()) throw new Error(`Le chemin prive doit etre un fichier: ${canonical}`);
  return canonical;
}

function assertPrivateOutputPath(filePath) {
  return assertPrivatePath(filePath, { mustExist: false });
}

function readJsonPrivate(filePath) {
  return JSON.parse(fs.readFileSync(assertPrivateInputPath(filePath), "utf8"));
}

function writeJsonPrivate(filePath, value) {
  const resolved = assertPrivateOutputPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return resolved;
}

function firestoreBase(projectId = DEFAULT_PROJECT_ID, database = DEFAULT_DATABASE) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(database)}/documents`;
}

function tokenExpired(tokens = {}) {
  if (!tokens.access_token) return true;
  const expiresAt = Number(tokens.expires_at || 0);
  return Boolean(expiresAt && Date.now() >= expiresAt - 120000);
}

async function getAccessToken() {
  if (!fs.existsSync(FIREBASE_CONFIG)) {
    throw new Error(`Connexion Firebase CLI absente: ${FIREBASE_CONFIG}`);
  }
  const config = readJson(FIREBASE_CONFIG);
  const tokens = config.tokens || {};
  if (!tokenExpired(tokens)) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error("Jeton Firebase expire et refresh_token absent. Fais firebase login --reauth.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: FIREBASE_CLIENT_ID,
      client_secret: FIREBASE_CLIENT_SECRET
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`Rafraichissement Firebase refuse (${response.status}). Fais firebase login --reauth.`);
  }
  return body.access_token;
}

async function firestoreRequest(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Firestore ${response.status}: ${clean(body?.error?.message || text).slice(0, 500)}`);
  }
  return body;
}

async function listCollection(token, { projectId = DEFAULT_PROJECT_ID, database = DEFAULT_DATABASE, collection }) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(`${firestoreBase(projectId, database)}/${encodeURIComponent(collection)}`);
    url.searchParams.set("pageSize", "300");
    url.searchParams.set("showMissing", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await firestoreRequest(token, url.toString());
    documents.push(...(body.documents || []));
    pageToken = clean(body.nextPageToken);
  } while (pageToken);
  return documents.sort((a, b) => clean(a.name).localeCompare(clean(b.name)));
}

async function readDocument(token, { projectId = DEFAULT_PROJECT_ID, database = DEFAULT_DATABASE, documentPath }) {
  const encodedPath = clean(documentPath).split("/").map(encodeURIComponent).join("/");
  return firestoreRequest(token, `${firestoreBase(projectId, database)}/${encodedPath}`);
}

function decodeValue(value = {}) {
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "bytesValue")) return value.bytesValue;
  if (Object.prototype.hasOwnProperty.call(value, "referenceValue")) return value.referenceValue;
  if (Object.prototype.hasOwnProperty.call(value, "geoPointValue")) return value.geoPointValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeValue);
  if (value.mapValue) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Nombre non fini interdit dans un patch Firestore.");
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value) } };
  throw new Error(`Type Firestore non supporte: ${typeof value}`);
}

function encodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)]));
}

function documentPath(documentName) {
  const marker = "/documents/";
  const index = clean(documentName).indexOf(marker);
  return index >= 0 ? clean(documentName).slice(index + marker.length) : clean(documentName);
}

function documentId(documentName) {
  return documentPath(documentName).split("/").pop();
}

function identityFromClient(data = {}) {
  const explicitSystem = normalize(data.sourceIdentitySystem || data.sourceSystem);
  const sourceSignals = [data.directSourceType, data.source, data.lastDirectEnrichmentSource]
    .map(normalize)
    .filter(Boolean);
  const sourceSystem = explicitSystem
    || (sourceSignals.some((source) => source.includes("coachrx")) ? "coachrx" : "")
    || (sourceSignals.some((source) => source.includes("ghl") || source.includes("gohighlevel")) ? "ghl" : "")
    || (sourceSignals.some((source) => source.includes("clientdirectory") || source.includes("coreclients")) ? "client_directory" : "");
  return {
    sourceClientId: clean(data.sourceClientId || data.clientId || data.contactId),
    sourceSystem,
    phone: normalizePhone(data.phoneNormalized || data.clientPhoneNormalized || data.phone),
    name: clean(data.name || data.clientName),
    normalizedName: normalize(data.name || data.clientName)
  };
}

function identityKeys(identity = {}) {
  return [
    identity.sourceClientId && identity.sourceSystem
      ? `source:${normalize(identity.sourceSystem)}:${clean(identity.sourceClientId)}`
      : "",
    identity.phone ? `phone:${normalizePhone(identity.phone)}` : ""
  ].filter(Boolean);
}

function staffCoach(identity = {}, data = {}) {
  const email = clean(data.email).toLowerCase();
  const sourceId = clean(identity.sourceClientId);
  const sourceSystem = normalize(identity.sourceSystem);
  return PILOT_COACHES.find((coach) => {
    if (email && email === coach.email.toLowerCase()) return true;
    return sourceSystem === "coachrx" && sourceId && sourceId === coach.id;
  }) || null;
}

function staffNameCandidate(identity = {}) {
  const name = normalize(identity.name || identity.normalizedName);
  if (!name) return null;
  return PILOT_COACHES.find((coach) => [coach.name, ...(coach.aliases || [])]
    .some((alias) => normalize(alias) === name)) || null;
}

function verifyHashedArtifact(artifact, format, label) {
  if (!artifact || artifact.format !== format) throw new Error(`${label}: format invalide.`);
  if (artifact.verified !== true) throw new Error(`${label}: verified=true requis.`);
  const actual = contentHash(artifact);
  if (!artifact.contentSha256 || artifact.contentSha256 !== actual) throw new Error(`${label}: hash de contenu invalide.`);
  return actual;
}

module.exports = {
  DEFAULT_DATABASE,
  DEFAULT_PROJECT_ID,
  OWNERSHIP_COLLECTIONS,
  PILOT_COACHES,
  assertPrivateInputPath,
  assertPrivateOutputPath,
  canonicalJson,
  clean,
  contentHash,
  decodeFields,
  documentId,
  documentPath,
  encodeFields,
  firestoreBase,
  firestoreRequest,
  getAccessToken,
  identityFromClient,
  identityKeys,
  listCollection,
  normalize,
  normalizePhone,
  parseArgs,
  readDocument,
  readJson,
  readJsonPrivate,
  sha256,
  staffCoach,
  staffNameCandidate,
  verifyHashedArtifact,
  writeJsonPrivate
};
