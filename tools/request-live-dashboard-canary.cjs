"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const {
  DEFAULT_DATABASE,
  DEFAULT_PROJECT_ID,
  clean,
  decodeFields,
  documentId,
  firestoreBase,
  getAccessToken,
  listCollection
} = require("./client-ownership-repair-lib.cjs");

const TARGET_COACH_ID = "15935";
const TARGET_SCOPE = "coach";
const TARGET_SOURCE = "codex_postdeploy_canary";
const SYNC_REQUEST_COLLECTION = "syncRequests";
const OWNERSHIP_LOCK_PATH = "systemLocks/clientOwnershipSync";
const REGION = "us-central1";
const REQUIRED_FUNCTION_NAMES = Object.freeze([
  "processSyncRequest",
  "syncDashboardFromSheets",
  "scheduledDashboardSync",
  "scheduledQuestionnaireResponseSync",
  "ingestDashboardSource"
]);
const EXPECTED_CLIENTS_IMPORTED = 20;
const MIN_TASKS_IMPORTED = 19;
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 360000;
const REQUEST_FIELD_NAMES = Object.freeze([
  "coachId",
  "scope",
  "status",
  "requestedByUid",
  "requestedByEmail",
  "createdAt",
  "updatedAt",
  "source"
]);
const PENDING_STATUSES = new Set(["queued", "running"]);

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = { execute: false, help: false, releaseManifest: "", selfTest: false };
  let manifestSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--execute") {
      args.execute = true;
      continue;
    }
    if (token === "--self-test") {
      args.selfTest = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--release-manifest") {
      if (manifestSeen || !argv[index + 1] || argv[index + 1].startsWith("--")) {
        throw new Error("--release-manifest exige un seul fichier explicite.");
      }
      args.releaseManifest = argv[++index];
      manifestSeen = true;
      continue;
    }
    if (token.startsWith("--release-manifest=")) {
      if (manifestSeen) throw new Error("--release-manifest ne peut etre fourni qu'une fois.");
      args.releaseManifest = token.slice("--release-manifest=".length);
      manifestSeen = true;
      continue;
    }
    throw new Error("Argument non reconnu; seuls --release-manifest, --execute, --self-test et --help sont permis.");
  }
  if (args.execute && args.selfTest) throw new Error("--execute et --self-test sont incompatibles.");
  return args;
}

function normalizeFunctionRevision(functionName, value) {
  const revision = clean(value).toLowerCase();
  const prefix = clean(functionName).toLowerCase();
  if (!revision.startsWith(`${prefix}-`) || !/^[a-z0-9-]+-[0-9]{5}-[a-z0-9]{3,20}$/.test(revision)) {
    throw new Error("Le manifeste contient une revision Cloud Run invalide.");
  }
  return revision;
}

function normalizeReleaseManifest(manifest = {}) {
  const revisions = manifest.functions;
  if (!revisions || typeof revisions !== "object" || Array.isArray(revisions)) {
    throw new Error("Le manifeste de release ne contient pas les revisions Functions attendues.");
  }
  const actualNames = Object.keys(revisions).sort();
  const expectedNames = [...REQUIRED_FUNCTION_NAMES].sort();
  assert.deepEqual(actualNames, expectedNames, "Le manifeste doit contenir exactement les cinq Functions ciblees.");
  return Object.fromEntries(REQUIRED_FUNCTION_NAMES.map((name) => [
    name,
    normalizeFunctionRevision(name, revisions[name])
  ]));
}

function loadReleaseManifest(filePath) {
  const manifestPath = clean(filePath);
  if (!manifestPath) throw new Error("--release-manifest est requis.");
  try {
    return normalizeReleaseManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
  } catch (error) {
    if (/manifeste|revision|cinq Functions/.test(clean(error?.message))) throw error;
    throw new Error("Le manifeste de release est absent ou invalide.");
  }
}

function releaseKey(expectedRevisions) {
  const normalized = normalizeReleaseManifest({ functions: expectedRevisions });
  const fingerprint = REQUIRED_FUNCTION_NAMES
    .map((name) => `${name}:${normalized[name]}`)
    .join("\n");
  return crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 24);
}

function deterministicRequestId(key) {
  const normalized = clean(key).toLowerCase();
  if (!/^[a-f0-9]{24}$/.test(normalized)) throw new Error("Cle de release canari invalide.");
  return `dashboard_canary_${TARGET_COACH_ID}_${normalized}`;
}

function decodedDocument(document) {
  if (!document?.name) return null;
  return {
    id: documentId(document.name),
    data: decodeFields(document.fields || {})
  };
}

function requestTimestamp(data = {}) {
  const values = [data.finishedAt, data.updatedAt, data.createdAt]
    .map((value) => Date.parse(clean(value)))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

function historicalAdminSeed(documents = [], targetRequest = null) {
  const target = decodedDocument(targetRequest);
  if (target?.data?.requestedByUid && target.data.requestedByEmail) {
    return {
      uid: clean(target.data.requestedByUid),
      email: clean(target.data.requestedByEmail)
    };
  }

  const candidates = documents
    .map(decodedDocument)
    .filter(Boolean)
    .filter(({ data }) => (
      clean(data.coachId) === TARGET_COACH_ID
      && clean(data.scope) === TARGET_SCOPE
      && clean(data.status).toLowerCase() === "done"
      && Array.isArray(data.resultCoachIds)
      && data.resultCoachIds.length === 1
      && clean(data.resultCoachIds[0]) === TARGET_COACH_ID
      && clean(data.requestedByUid)
      && clean(data.requestedByEmail)
    ))
    .sort((left, right) => requestTimestamp(right.data) - requestTimestamp(left.data));
  if (!candidates.length) {
    throw new Error("Aucune identite admin provenant d'un canari Marc termine n'est reutilisable.");
  }
  return {
    uid: clean(candidates[0].data.requestedByUid),
    email: clean(candidates[0].data.requestedByEmail)
  };
}

function ownershipLockIsActive(data = {}, nowMs = Date.now()) {
  if (data.active !== true) return false;
  const expiresAt = Date.parse(clean(data.expiresAt));
  return !Number.isFinite(expiresAt) || expiresAt > nowMs;
}

function pendingRequestSummary(documents = [], targetRequestId = "") {
  const pending = documents
    .map(decodedDocument)
    .filter(Boolean)
    .filter(({ data }) => PENDING_STATUSES.has(clean(data.status).toLowerCase()));
  const targetPending = pending.filter(({ id }) => id === targetRequestId);
  const otherPending = pending.filter(({ id }) => id !== targetRequestId);
  return {
    total: pending.length,
    targetPending: targetPending.length,
    otherPending: otherPending.length
  };
}

function buildRequestFields(adminIdentity, timestamp = new Date().toISOString()) {
  const uid = clean(adminIdentity?.uid);
  const email = clean(adminIdentity?.email).toLowerCase();
  if (!uid || !email) throw new Error("Identite admin valide requise pour construire la demande.");
  const fields = {
    coachId: { stringValue: TARGET_COACH_ID },
    scope: { stringValue: TARGET_SCOPE },
    status: { stringValue: "queued" },
    requestedByUid: { stringValue: uid },
    requestedByEmail: { stringValue: email },
    createdAt: { timestampValue: timestamp },
    updatedAt: { timestampValue: timestamp },
    source: { stringValue: TARGET_SOURCE }
  };
  assert.deepEqual(Object.keys(fields), REQUEST_FIELD_NAMES);
  return fields;
}

function safeStatus(value) {
  const normalized = clean(value).toLowerCase();
  return ["queued", "running", "done", "error"].includes(normalized) ? normalized : "unknown";
}

function validateDoneRequest(data = {}) {
  const resultCoachIds = Array.isArray(data.resultCoachIds) ? data.resultCoachIds.map(clean) : [];
  if (clean(data.coachId) !== TARGET_COACH_ID || clean(data.scope) !== TARGET_SCOPE) {
    throw new Error("La demande terminee ne correspond pas au canari Marc attendu.");
  }
  if (clean(data.stage) !== "completed") {
    throw new Error("La demande est done sans stage completed.");
  }
  if (resultCoachIds.length !== 1 || resultCoachIds[0] !== TARGET_COACH_ID) {
    throw new Error("Le resultat du canari ne contient pas exactement le coach cible.");
  }
  const summary = Object.fromEntries([
    "coaches",
    "clientsImported",
    "clientsMissingPhone",
    "tasksImported",
    "rebookingsImported",
    "checkupsImported",
    "questionnaireResponsesImported",
    "warnings"
  ].map((field) => {
    const value = Number(data.resultSummary?.[field]);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Compteur canari invalide: ${field}.`);
    }
    return [field, value];
  }));
  if (summary.coaches !== 1) {
    throw new Error("Le canari doit traiter exactement un coach.");
  }
  if (summary.clientsImported !== EXPECTED_CLIENTS_IMPORTED) {
    throw new Error(`Le canari doit reconstruire exactement ${EXPECTED_CLIENTS_IMPORTED} clients Marc.`);
  }
  if (summary.clientsMissingPhone > summary.clientsImported) {
    throw new Error("Le nombre de clients sans telephone depasse le portefeuille importe.");
  }
  if (summary.tasksImported < MIN_TASKS_IMPORTED) {
    throw new Error(`Le canari doit reconstruire au moins ${MIN_TASKS_IMPORTED} taches.`);
  }
  return summary;
}

function safeTerminalResult({ requestId, releaseId, document, action }) {
  const decoded = decodedDocument(document);
  const status = safeStatus(decoded?.data?.status);
  if (status === "error") {
    throw new Error("Le canari existant est termine en erreur; aucun nouvel essai automatique n'est permis.");
  }
  if (status !== "done") throw new Error("Le canari n'est pas dans un etat terminal reconnu.");
  return {
    ok: true,
    mode: "execute",
    mutated: ["created_and_polled", "resumed_existing_no_post"].includes(action),
    action,
    coachId: TARGET_COACH_ID,
    releaseKey: releaseId,
    requestId,
    status,
    stage: "completed",
    result: validateDoneRequest(decoded.data)
  };
}

async function fetchJson(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = {};
  }
  return { response, body };
}

async function getDocumentOrNull(token, documentPath) {
  const encodedPath = clean(documentPath).split("/").map(encodeURIComponent).join("/");
  const { response, body } = await fetchJson(
    token,
    `${firestoreBase(DEFAULT_PROJECT_ID, DEFAULT_DATABASE)}/${encodedPath}`
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Lecture Firestore refusee (${response.status}).`);
  return body;
}

async function readLiveFunctionRevision(token, functionName) {
  const functionPath = `projects/${DEFAULT_PROJECT_ID}/locations/${REGION}/functions/${functionName}`;
  const { response, body } = await fetchJson(
    token,
    `https://cloudfunctions.googleapis.com/v2/${functionPath}`
  );
  if (!response.ok) throw new Error(`Lecture d'une revision Functions refusee (${response.status}).`);
  const revision = clean(body.serviceConfig?.revision).toLowerCase();
  if (!revision) throw new Error("Une revision live Functions est absente.");
  return revision;
}

async function validateAdminProfile(token, seed) {
  const uid = clean(seed?.uid);
  const expectedEmail = clean(seed?.email).toLowerCase();
  if (!uid || !expectedEmail) throw new Error("Identite admin historique incomplete.");
  const document = await getDocumentOrNull(token, `users/${uid}`);
  if (!document) throw new Error("Le profil admin historique n'existe plus.");
  const data = decodeFields(document.fields || {});
  const profileEmail = clean(data.email).toLowerCase();
  if (data.active !== true || clean(data.role).toLowerCase() !== "admin") {
    throw new Error("Le profil historique n'est plus un admin actif.");
  }
  if (!profileEmail || profileEmail !== expectedEmail) {
    throw new Error("Le courriel du profil admin ne correspond plus a la demande historique.");
  }
  return { uid, email: profileEmail };
}

async function runPreflight(token, { requestId, expectedRevisions }) {
  const [liveRevisionEntries, requestDocuments, targetRequest, ownershipLockDocument] = await Promise.all([
    Promise.all(REQUIRED_FUNCTION_NAMES.map(async (name) => [
      name,
      await readLiveFunctionRevision(token, name)
    ])),
    listCollection(token, {
      projectId: DEFAULT_PROJECT_ID,
      database: DEFAULT_DATABASE,
      collection: SYNC_REQUEST_COLLECTION
    }),
    getDocumentOrNull(token, `${SYNC_REQUEST_COLLECTION}/${requestId}`),
    getDocumentOrNull(token, OWNERSHIP_LOCK_PATH)
  ]);
  const liveRevisions = Object.fromEntries(liveRevisionEntries);
  const mismatchedFunctions = REQUIRED_FUNCTION_NAMES.filter((name) => (
    liveRevisions[name] !== expectedRevisions[name]
  ));
  if (mismatchedFunctions.length) {
    throw new Error("Les cinq revisions Functions live ne correspondent pas au manifeste de release.");
  }

  const ownershipLock = ownershipLockDocument
    ? decodeFields(ownershipLockDocument.fields || {})
    : {};
  if (ownershipLockIsActive(ownershipLock)) {
    throw new Error("Le verrou de reparation d'appartenance est actif; canari refuse.");
  }

  const pending = pendingRequestSummary(requestDocuments, requestId);
  // Reprendre le meme document deterministe n'est pas un second sync. Toute
  // autre demande queued/running bloque le canari.
  if (pending.otherPending > 0) {
    throw new Error(`Canari refuse: ${pending.otherPending} autre demande de sync est queued/running.`);
  }

  const seed = historicalAdminSeed(requestDocuments, targetRequest);
  const adminIdentity = await validateAdminProfile(token, seed);
  return {
    adminIdentity,
    liveFunctionsValidated: REQUIRED_FUNCTION_NAMES.length,
    ownershipLockActive: false,
    pending,
    requestDocuments,
    targetRequest
  };
}

async function createRequestOnce(token, { requestId, fields }) {
  const url = new URL(`${firestoreBase(DEFAULT_PROJECT_ID, DEFAULT_DATABASE)}/${SYNC_REQUEST_COLLECTION}`);
  url.searchParams.set("documentId", requestId);
  try {
    const { response, body } = await fetchJson(token, url.toString(), {
      method: "POST",
      body: JSON.stringify({ fields })
    });
    if (response.ok) return { document: body, created: true };
    if (response.status === 409) {
      const existing = await getDocumentOrNull(token, `${SYNC_REQUEST_COLLECTION}/${requestId}`);
      if (existing) return { document: existing, created: false };
    }
    throw new Error(`Creation Firestore refusee (${response.status}); aucun second POST ne sera tente.`);
  } catch (error) {
    const existing = await getDocumentOrNull(token, `${SYNC_REQUEST_COLLECTION}/${requestId}`).catch(() => null);
    if (existing) return { document: existing, created: false };
    throw new Error("Etat de creation incertain; aucun second POST ne sera tente automatiquement.");
  }
}

async function pollRequest(token, { requestId, releaseId, action }) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const document = await getDocumentOrNull(token, `${SYNC_REQUEST_COLLECTION}/${requestId}`);
    if (!document) throw new Error("La demande deterministe a disparu pendant le polling.");
    const status = safeStatus(decodeFields(document.fields || {}).status);
    if (status === "done" || status === "error") {
      return safeTerminalResult({ requestId, releaseId, document, action });
    }
    if (!PENDING_STATUSES.has(status)) {
      throw new Error("La demande est dans un etat non reconnu; aucun nouvel essai ne sera lance.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Le canari n'est pas termine dans la fenetre de verification; ne pas relancer automatiquement.");
}

function dryRunResult({ requestId, releaseId, preflight }) {
  const existing = decodedDocument(preflight.targetRequest);
  const existingStatus = existing ? safeStatus(existing.data.status) : "absent";
  return {
    ok: true,
    mode: "dry-run",
    mutated: false,
    coachId: TARGET_COACH_ID,
    releaseKey: releaseId,
    requestId,
    preflight: {
      liveRevisionsMatched: true,
      liveFunctionsValidated: preflight.liveFunctionsValidated,
      activeAdminValidated: true,
      ownershipLockActive: false,
      pendingRequests: preflight.pending.total,
      otherPendingRequests: preflight.pending.otherPending,
      existingRequest: Boolean(existing),
      existingStatus
    },
    action: existing
      ? (PENDING_STATUSES.has(existingStatus) ? "would_poll_existing" : "existing_request_no_post")
      : "would_create_once_then_poll",
    requestFieldNames: [...REQUEST_FIELD_NAMES]
  };
}

function printHelp() {
  process.stdout.write([
    "Usage:",
    "  node tools/request-live-dashboard-canary.cjs --release-manifest C:\\chemin\\release-functions.json",
    "  node tools/request-live-dashboard-canary.cjs --release-manifest C:\\chemin\\release-functions.json --execute",
    "  node tools/request-live-dashboard-canary.cjs --self-test",
    "",
    "Sans --execute, le programme fait seulement les lectures de preflight."
  ].join("\n") + "\n");
}

function runSelfTest() {
  const expectedRevisions = Object.fromEntries(REQUIRED_FUNCTION_NAMES.map((name) => [
    name,
    `${name.toLowerCase()}-12345-abc`
  ]));
  const releaseId = releaseKey(expectedRevisions);
  const requestId = deterministicRequestId(releaseId);
  assert.match(requestId, /^dashboard_canary_15935_[a-f0-9]{24}$/);
  assert.deepEqual(parseCliArgs(["--release-manifest", "release.json"]), {
    execute: false,
    help: false,
    releaseManifest: "release.json",
    selfTest: false
  });
  assert.deepEqual(parseCliArgs(["--release-manifest=release.json", "--execute"]), {
    execute: true,
    help: false,
    releaseManifest: "release.json",
    selfTest: false
  });
  assert.throws(() => parseCliArgs(["--execute=yes"]), /Argument non reconnu/);
  assert.equal(Object.keys(normalizeReleaseManifest({ functions: expectedRevisions })).length, 5);
  assert.throws(() => normalizeReleaseManifest({
    functions: { processSyncRequest: "processsyncrequest-12345-abc" }
  }), /cinq Functions/);

  const fields = buildRequestFields(
    { uid: "offline-admin", email: "offline@example.test" },
    "2026-07-20T00:00:00.000Z"
  );
  assert.deepEqual(Object.keys(fields), REQUEST_FIELD_NAMES);
  assert.equal(Object.keys(fields).length, 8);
  assert.equal(fields.coachId.stringValue, TARGET_COACH_ID);
  assert.equal(fields.scope.stringValue, TARGET_SCOPE);

  assert.equal(ownershipLockIsActive({ active: false }), false);
  assert.equal(ownershipLockIsActive({ active: true }), true);
  assert.equal(ownershipLockIsActive({ active: true, expiresAt: "2020-01-01T00:00:00.000Z" }, Date.parse("2026-01-01T00:00:00.000Z")), false);

  const fixture = (id, status) => ({
    name: `${firestoreBase()}/${SYNC_REQUEST_COLLECTION}/${id}`,
    fields: { status: { stringValue: status } }
  });
  assert.deepEqual(pendingRequestSummary([
    fixture(requestId, "running"),
    fixture("other", "done")
  ], requestId), { total: 1, targetPending: 1, otherPending: 0 });
  assert.deepEqual(pendingRequestSummary([
    fixture(requestId, "running"),
    fixture("other", "queued")
  ], requestId), { total: 2, targetPending: 1, otherPending: 1 });

  const historical = {
    name: `${firestoreBase()}/${SYNC_REQUEST_COLLECTION}/historical`,
    fields: {
      coachId: { stringValue: TARGET_COACH_ID },
      scope: { stringValue: TARGET_SCOPE },
      status: { stringValue: "done" },
      resultCoachIds: { arrayValue: { values: [{ stringValue: TARGET_COACH_ID }] } },
      requestedByUid: { stringValue: "offline-admin" },
      requestedByEmail: { stringValue: "offline@example.test" },
      finishedAt: { timestampValue: "2026-07-20T00:00:00.000Z" }
    }
  };
  assert.deepEqual(historicalAdminSeed([historical]), {
    uid: "offline-admin",
    email: "offline@example.test"
  });

  const safe = dryRunResult({
    requestId,
    releaseId,
    preflight: {
      targetRequest: null,
      pending: { total: 0, targetPending: 0, otherPending: 0 },
      liveFunctionsValidated: 5
    }
  });
  const serialized = JSON.stringify(safe);
  assert.equal(serialized.includes("offline-admin"), false);
  assert.equal(serialized.includes("offline@example.test"), false);
  const healthyDone = {
    coachId: TARGET_COACH_ID,
    scope: TARGET_SCOPE,
    stage: "completed",
    resultCoachIds: [TARGET_COACH_ID],
    resultSummary: {
      coaches: 1,
      clientsImported: EXPECTED_CLIENTS_IMPORTED,
      clientsMissingPhone: 1,
      tasksImported: MIN_TASKS_IMPORTED,
      rebookingsImported: 4,
      checkupsImported: 167,
      questionnaireResponsesImported: 0,
      warnings: 7
    }
  };
  assert.equal(validateDoneRequest(healthyDone).clientsImported, EXPECTED_CLIENTS_IMPORTED);
  assert.throws(() => validateDoneRequest({
    ...healthyDone,
    resultSummary: { ...healthyDone.resultSummary, clientsImported: 0 }
  }), /exactement 20 clients/);
  assert.throws(() => validateDoneRequest({
    ...healthyDone,
    resultSummary: { ...healthyDone.resultSummary, tasksImported: -99 }
  }), /Compteur canari invalide/);
  assert.throws(() => validateDoneRequest({
    ...healthyDone,
    resultSummary: { ...healthyDone.resultSummary, warnings: "invalide" }
  }), /Compteur canari invalide/);
  return { ok: true, mode: "self-test", checks: 22, networkUsed: false, mutated: false };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
    return;
  }

  const expectedRevisions = loadReleaseManifest(args.releaseManifest);
  const releaseId = releaseKey(expectedRevisions);
  const requestId = deterministicRequestId(releaseId);
  let token;
  try {
    token = await getAccessToken();
  } catch (_) {
    throw new Error("Authentification Firebase CLI indisponible; execute firebase login --reauth avant le dry-run.");
  }
  let preflight = await runPreflight(token, { requestId, expectedRevisions });

  if (!args.execute) {
    process.stdout.write(`${JSON.stringify(dryRunResult({ requestId, releaseId, preflight }), null, 2)}\n`);
    return;
  }

  if (preflight.targetRequest) {
    const status = safeStatus(decodeFields(preflight.targetRequest.fields || {}).status);
    if (status === "done" || status === "error") {
      process.stdout.write(`${JSON.stringify(safeTerminalResult({
        requestId,
        releaseId,
        document: preflight.targetRequest,
        action: "existing_terminal_no_post"
      }), null, 2)}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(await pollRequest(token, {
      requestId,
      releaseId,
      action: "resumed_existing_no_post"
    }), null, 2)}\n`);
    return;
  }

  // Refaire les controles immediatement avant l'unique POST reduit la fenetre
  // de course avec un bouton admin ou une autre execution operateur.
  preflight = await runPreflight(token, { requestId, expectedRevisions });
  if (preflight.targetRequest) {
    process.stdout.write(`${JSON.stringify(await pollRequest(token, {
      requestId,
      releaseId,
      action: "resumed_existing_no_post"
    }), null, 2)}\n`);
    return;
  }

  const fields = buildRequestFields(preflight.adminIdentity);
  const creation = await createRequestOnce(token, { requestId, fields });
  process.stdout.write(`${JSON.stringify(await pollRequest(token, {
    requestId,
    releaseId,
    action: creation.created ? "created_and_polled" : "resumed_existing_no_post"
  }), null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${clean(error?.message || error || "Canari interrompu.").slice(0, 500)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_FUNCTION_NAMES,
  REQUEST_FIELD_NAMES,
  TARGET_COACH_ID,
  buildRequestFields,
  deterministicRequestId,
  dryRunResult,
  historicalAdminSeed,
  loadReleaseManifest,
  normalizeFunctionRevision,
  normalizeReleaseManifest,
  ownershipLockIsActive,
  parseCliArgs,
  pendingRequestSummary,
  releaseKey,
  runSelfTest,
  safeTerminalResult,
  validateDoneRequest
};
