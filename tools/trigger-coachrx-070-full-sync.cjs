const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const REQUEST_ID = "coachrx_070_generalization_20260721";
const RELEASE_MARKER = "coachrx-extension-0.7.0-generalization";
const OFFICIAL_COACH_IDS = Object.freeze(["15935", "15928", "17242", "15902", "15893", "15937", "15936"]);
const OFFICIAL_COACH_COUNT = OFFICIAL_COACH_IDS.length;
const execute = process.argv.includes("--execute");
const waitForCompletion = process.argv.includes("--wait");

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    operation: execute ? "execute" : "preflight",
    requestId: REQUEST_ID,
    error: safeError(error)
  }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const { accessToken, actorEmail } = await firebaseAccess();
  const [adminProfile, ownershipLock, queuedRequests, runningRequests] = await Promise.all([
    findActorAdminProfile(accessToken, actorEmail),
    getDocument(accessToken, "systemLocks/clientOwnershipSync", true),
    queryDocuments(accessToken, "syncRequests", {
      fieldFilter: {
        field: { fieldPath: "status" },
        op: "EQUAL",
        value: stringField("queued")
      }
    }),
    queryDocuments(accessToken, "syncRequests", {
      fieldFilter: {
        field: { fieldPath: "status" },
        op: "EQUAL",
        value: stringField("running")
      }
    })
  ]);

  assert.equal(adminProfile.active, true, "Firebase actor is not an active dashboard administrator.");
  assert.equal(adminProfile.role, "admin", "Firebase actor is not a dashboard administrator.");
  assert.equal(ownershipLockActive(ownershipLock), false, "Client ownership synchronization lock is active.");

  const observedActiveRequests = [...queuedRequests, ...runningRequests]
    .filter((document) => documentId(document) !== REQUEST_ID);
  const conflictingRequests = observedActiveRequests.filter(requestIsRecentlyActive);
  if (!execute && conflictingRequests.length) {
    console.log(JSON.stringify({
      ok: false,
      operation: "preflight",
      projectId: PROJECT_ID,
      requestId: REQUEST_ID,
      actorAdminConfirmed: true,
      ownershipLockActive: false,
      blockedByActiveSyncRequests: conflictingRequests.map(sanitizeActiveRequest),
      writes: 0
    }, null, 2));
    return;
  }
  assert.equal(conflictingRequests.length, 0, "Another dashboard synchronization request is active.");

  const existing = await getDocument(accessToken, `syncRequests/${REQUEST_ID}`, true);
  if (!execute) {
    console.log(JSON.stringify({
      ok: true,
      operation: "preflight",
      projectId: PROJECT_ID,
      requestId: REQUEST_ID,
      actorAdminConfirmed: true,
      ownershipLockActive: false,
      otherActiveSyncRequests: 0,
      staleNonBlockingSyncRequests: observedActiveRequests.length,
      existingRequestStatus: existing ? stringValue(existing, "status") : "",
      intendedScope: "all",
      intendedCoachCount: OFFICIAL_COACH_COUNT,
      writes: 0
    }, null, 2));
    return;
  }

  let requestDocument = existing;
  if (!requestDocument) {
    const now = new Date().toISOString();
    requestDocument = await createDocument(accessToken, "syncRequests", REQUEST_ID, {
      coachId: stringField(""),
      scope: stringField("all"),
      requestType: stringField("sheets_sync"),
      status: stringField("queued"),
      requestedByUid: stringField(adminProfile.uid),
      requestedByEmail: stringField(actorEmail),
      source: stringField("firebase_app_sync_request"),
      releaseMarker: stringField(RELEASE_MARKER),
      createdAt: timestampField(now),
      updatedAt: timestampField(now)
    });
  }
  assertRequestContract(requestDocument, adminProfile, actorEmail);

  if (waitForCompletion) {
    requestDocument = await waitForTerminalRequest(accessToken, requestDocument);
    assertRequestContract(requestDocument, adminProfile, actorEmail);
  }

  const status = stringValue(requestDocument, "status");
  const summary = decodeValue(requestDocument?.fields?.resultSummary || {});
  const coachIds = decodeValue(requestDocument?.fields?.resultCoachIds || {});
  if (waitForCompletion) {
    assert.equal(status, "done", `Full synchronization ended with status ${status || "missing"}.`);
    assertOfficialCoachIds(coachIds);
    assert.equal(Number(summary.coaches || 0), OFFICIAL_COACH_COUNT, "Full synchronization summary did not report seven coaches.");
  }

  console.log(JSON.stringify({
    ok: true,
    operation: "execute",
    projectId: PROJECT_ID,
    requestId: REQUEST_ID,
    created: !existing,
    status,
    stage: stringValue(requestDocument, "stage"),
    coachCount: Array.isArray(coachIds) ? coachIds.length : 0,
    resultSummary: sanitizeSummary(summary),
    actorAdminConfirmed: true,
    ownershipLockActive: false,
    writes: existing ? 0 : 1
  }, null, 2));
}

async function firebaseAccess() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const firebaseRoot = path.join(home, ".cache", "cfsb-dashboard-tools", "firebase-tools-clean", "node_modules", "firebase-tools");
  const authPath = path.join(firebaseRoot, "lib", "auth.js");
  const apiPath = path.join(firebaseRoot, "lib", "apiv2.js");
  assert.equal(fs.existsSync(authPath), true, "Firebase CLI auth module unavailable.");
  assert.equal(fs.existsSync(apiPath), true, "Firebase CLI API module unavailable.");
  const auth = require(authPath);
  const api = require(apiPath);
  const account = auth.getGlobalDefaultAccount();
  assert.ok(account?.tokens?.refresh_token, "Firebase CLI account is not authenticated.");
  auth.setRefreshToken(account.tokens.refresh_token);
  const accessToken = await api.getAccessToken();
  const actorEmail = String(account?.user?.email || "").trim().toLowerCase();
  assert.ok(accessToken, "Firebase access token unavailable.");
  assert.ok(actorEmail, "Firebase actor email unavailable.");
  return { accessToken, actorEmail };
}

async function findActorAdminProfile(accessToken, actorEmail) {
  const users = await listCollection(accessToken, "users");
  const matches = users.map((document) => ({
    uid: documentId(document),
    email: stringValue(document, "email").trim().toLowerCase(),
    active: booleanValue(document, "active"),
    role: stringValue(document, "role")
  })).filter((profile) => profile.email === actorEmail && profile.active && profile.role === "admin");
  assert.ok(matches.length >= 1, "No active dashboard admin matches the Firebase actor.");
  if (matches.length === 1) return matches[0];

  const requestHistoryByProfile = await Promise.all(matches.map((profile) => queryDocuments(accessToken, "syncRequests", {
    fieldFilter: {
      field: { fieldPath: "requestedByUid" },
      op: "EQUAL",
      value: stringField(profile.uid)
    }
  })));
  const ranked = matches.map((profile, index) => {
    const latestRequestAt = requestHistoryByProfile[index]
      .map((document) => Date.parse(timestampValue(document, "updatedAt") || timestampValue(document, "createdAt") || "") || 0)
      .reduce((latest, value) => Math.max(latest, value), 0);
    return { profile, latestRequestAt };
  }).sort((left, right) => right.latestRequestAt - left.latestRequestAt);
  assert.ok(ranked[0].latestRequestAt > 0, "Duplicate admin profiles cannot be resolved from prior sync history.");
  assert.ok(ranked.length === 1 || ranked[0].latestRequestAt > ranked[1].latestRequestAt, "Duplicate admin profiles are tied in prior sync history.");
  return ranked[0].profile;
}

function ownershipLockActive(document) {
  if (!document || !booleanValue(document, "active")) return false;
  const expiresAt = timestampValue(document, "expiresAt");
  const expiresAtMs = Date.parse(expiresAt || "");
  return !Number.isFinite(expiresAtMs) || expiresAtMs > Date.now();
}

function assertRequestContract(document, adminProfile, actorEmail) {
  assert.ok(document, "Synchronization request document is missing.");
  assert.equal(documentId(document), REQUEST_ID, "Synchronization request document ID mismatch.");
  assert.equal(stringValue(document, "coachId"), "", "Synchronization request must target all coaches.");
  assert.equal(stringValue(document, "scope"), "all", "Synchronization request scope mismatch.");
  assert.equal(stringValue(document, "requestType"), "sheets_sync", "Synchronization request type mismatch.");
  assert.equal(stringValue(document, "source"), "firebase_app_sync_request", "Synchronization request source mismatch.");
  assert.equal(stringValue(document, "releaseMarker"), RELEASE_MARKER, "Synchronization request release marker mismatch.");
  assert.equal(stringValue(document, "requestedByUid"), adminProfile.uid, "Synchronization request admin UID mismatch.");
  assert.equal(stringValue(document, "requestedByEmail").trim().toLowerCase(), actorEmail, "Synchronization request admin email mismatch.");
}

function assertOfficialCoachIds(value) {
  assert.ok(Array.isArray(value), "Full synchronization coach IDs are missing.");
  assert.equal(value.length, OFFICIAL_COACH_COUNT, "Full synchronization did not report seven coaches.");
  assert.equal(new Set(value.map(String)).size, OFFICIAL_COACH_COUNT, "Full synchronization reported duplicate coach IDs.");
  assert.deepEqual(
    value.map(String).sort(),
    [...OFFICIAL_COACH_IDS].sort(),
    "Full synchronization coach ID set differs from the official roster."
  );
}

async function waitForTerminalRequest(accessToken, initialDocument) {
  let current = initialDocument;
  const deadline = Date.now() + (8 * 60 * 1000);
  while (Date.now() < deadline) {
    const status = stringValue(current, "status");
    if (["done", "error", "failed"].includes(status)) return current;
    await new Promise((resolve) => setTimeout(resolve, 3000));
    current = await getDocument(accessToken, `syncRequests/${REQUEST_ID}`);
  }
  throw new Error("Full synchronization did not reach a terminal state within eight minutes.");
}

async function getDocument(accessToken, relativePath, allowNotFound = false) {
  const url = documentsUrl(relativePath);
  return firestoreRequest(url, accessToken, { allowNotFound });
}

async function listCollection(accessToken, collection) {
  const documents = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "300" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await firestoreRequest(`${documentsUrl(collection)}?${query}`, accessToken);
    documents.push(...(page.documents || []));
    pageToken = String(page.nextPageToken || "");
  } while (pageToken);
  return documents;
}

async function queryDocuments(accessToken, collectionId, where) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const rows = await firestoreRequest(url, accessToken, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where,
        limit: 100
      }
    })
  });
  return rows.map((row) => row.document).filter(Boolean);
}

async function createDocument(accessToken, collection, documentIdValue, fields) {
  const url = `${documentsUrl(collection)}?documentId=${encodeURIComponent(documentIdValue)}`;
  return firestoreRequest(url, accessToken, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
}

async function firestoreRequest(url, accessToken, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: options.body
  });
  if (options.allowNotFound && response.status === 404) return null;
  const text = await response.text();
  if (!response.ok) throw new Error(`Firestore request refused (${response.status}): ${safeApiDetail(text)}`);
  return text ? JSON.parse(text) : {};
}

function documentsUrl(relativePath) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${relativePath}`;
}

function documentId(document) {
  return String(document?.name || "").split("/").pop() || "";
}

function stringValue(document, field) {
  return String(document?.fields?.[field]?.stringValue || "");
}

function booleanValue(document, field) {
  return document?.fields?.[field]?.booleanValue === true;
}

function timestampValue(document, field) {
  return String(document?.fields?.[field]?.timestampValue || "");
}

function stringField(value) {
  return { stringValue: String(value || "") };
}

function timestampField(value) {
  return { timestampValue: value };
}

function decodeValue(value = {}) {
  if (Object.hasOwn(value, "stringValue")) return value.stringValue;
  if (Object.hasOwn(value, "booleanValue")) return value.booleanValue;
  if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if (Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
  if (Object.hasOwn(value, "nullValue")) return null;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeValue);
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, decodeValue(entry)]));
  return "";
}

function sanitizeSummary(summary = {}) {
  return {
    coaches: Number(summary.coaches || 0),
    clientsImported: Number(summary.clientsImported || 0),
    clientsMissingPhone: Number(summary.clientsMissingPhone || 0),
    tasksImported: Number(summary.tasksImported || 0),
    questionnaireResponsesImported: Number(summary.questionnaireResponsesImported || 0),
    rebookingsImported: Number(summary.rebookingsImported || 0),
    checkupsImported: Number(summary.checkupsImported || 0),
    impactsImported: Number(summary.impactsImported || 0),
    warnings: Number(summary.warnings || 0)
  };
}

function sanitizeActiveRequest(document) {
  return {
    requestId: documentId(document),
    status: stringValue(document, "status"),
    stage: stringValue(document, "stage"),
    scope: stringValue(document, "scope"),
    source: stringValue(document, "source"),
    createdAt: timestampValue(document, "createdAt"),
    updatedAt: timestampValue(document, "updatedAt")
  };
}

function requestIsRecentlyActive(document) {
  const observedAt = Date.parse(
    timestampValue(document, "updatedAt")
    || timestampValue(document, "createdAt")
    || ""
  );
  return Number.isFinite(observedAt) && observedAt >= Date.now() - (30 * 60 * 1000);
}

function safeApiDetail(value) {
  const text = String(value || "");
  try {
    const parsed = JSON.parse(text);
    return String(parsed?.error?.message || parsed?.error?.status || "Firestore error").slice(0, 240);
  } catch (_) {
    return text.slice(0, 240);
  }
}

function safeError(error) {
  return String(error?.message || error || "Unexpected error")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[REDACTED_ACCESS_TOKEN]")
    .replace(/1\/\/[A-Za-z0-9._-]+/g, "[REDACTED_REFRESH_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .slice(0, 500);
}
