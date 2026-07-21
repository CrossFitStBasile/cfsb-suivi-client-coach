const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const DOCUMENT_ID = "release_20260721_coachrx_070";
const APP_VERSION = "20260721-coachrx-extension-070";
const execute = process.argv.includes("--execute");

const announcement = Object.freeze({
  title: "CoachRx Sync 0.7.0 est disponible",
  message: "Telecharge la nouvelle extension depuis le Guide. Pour chaque mise a jour: choisis ton coach, ouvre sa page Clients, valide sans ecrire, verifie le nombre de clients, puis importe le roster valide.",
  items: Object.freeze([
    "Desactive l'ancienne extension avant d'installer la version 0.7.0.",
    "Utilise uniquement le ZIP officiel disponible dans le Guide.",
    "Si la validation echoue ou affiche le mauvais coach, n'importe rien et avise Michael."
  ]),
  importance: "important",
  audience: "all",
  status: "published",
  versionTag: APP_VERSION,
  expiresOn: ""
});

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    operation: execute ? "publish" : "preview",
    error: safeError(error)
  }, null, 2));
  process.exitCode = 1;
});

async function main() {
  validateAnnouncement(announcement);
  if (!execute) {
    console.log(JSON.stringify({
      ok: true,
      operation: "preview",
      projectId: PROJECT_ID,
      documentId: DOCUMENT_ID,
      announcement,
      writes: 0
    }, null, 2));
    return;
  }

  const { accessToken, actorEmail } = await firebaseAccess();
  const documentUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/announcements/${DOCUMENT_ID}`;
  const existing = await firestoreRequest(documentUrl, accessToken, { allowNotFound: true });
  if (existing) {
    const decoded = decodeDocument(existing);
    assertPublishedDocument(decoded);
    console.log(JSON.stringify({
      ok: true,
      operation: "publish",
      projectId: PROJECT_ID,
      documentId: DOCUMENT_ID,
      alreadyPublished: true,
      verified: true,
      actorAccountConfirmed: Boolean(actorEmail),
      writes: 0
    }, null, 2));
    return;
  }

  const now = new Date().toISOString();
  const createUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/announcements?documentId=${encodeURIComponent(DOCUMENT_ID)}`;
  await firestoreRequest(createUrl, accessToken, {
    method: "POST",
    body: JSON.stringify({
      fields: {
        title: stringField(announcement.title),
        message: stringField(announcement.message),
        items: arrayField(announcement.items),
        importance: stringField(announcement.importance),
        audience: stringField(announcement.audience),
        status: stringField(announcement.status),
        versionTag: stringField(announcement.versionTag),
        expiresOn: stringField(announcement.expiresOn),
        createdByUid: stringField("firebase-cli-release-operator"),
        createdByEmail: stringField(actorEmail),
        createdAt: timestampField(now),
        publishedAt: timestampField(now),
        updatedAt: timestampField(now)
      }
    })
  });

  const confirmed = await firestoreRequest(documentUrl, accessToken);
  assertPublishedDocument(decodeDocument(confirmed));
  console.log(JSON.stringify({
    ok: true,
    operation: "publish",
    projectId: PROJECT_ID,
    documentId: DOCUMENT_ID,
    alreadyPublished: false,
    verified: true,
    actorAccountConfirmed: Boolean(actorEmail),
    writes: 1
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
  assert.ok(accessToken, "Firebase access token unavailable.");
  const actorEmail = String(account?.user?.email || "").trim().toLowerCase();
  assert.ok(actorEmail, "Firebase actor email unavailable.");
  return { accessToken, actorEmail };
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
  if (!response.ok) {
    throw new Error(`Firestore request refused (${response.status}): ${safeApiDetail(text)}`);
  }
  return text ? JSON.parse(text) : {};
}

function validateAnnouncement(value) {
  assert.ok(value.title && value.title.length <= 90);
  assert.ok(value.message && value.message.length <= 360);
  assert.ok(Array.isArray(value.items) && value.items.length <= 3);
  value.items.forEach((item) => assert.ok(item && item.length <= 180));
  assert.ok(["feature", "important", "critical"].includes(value.importance));
  assert.equal(value.audience, "all");
  assert.equal(value.status, "published");
  assert.equal(value.versionTag, APP_VERSION);
}

function assertPublishedDocument(value) {
  assert.equal(value.title, announcement.title);
  assert.equal(value.message, announcement.message);
  assert.deepEqual(value.items, announcement.items);
  assert.equal(value.importance, announcement.importance);
  assert.equal(value.audience, "all");
  assert.equal(value.status, "published");
  assert.equal(value.versionTag, APP_VERSION);
  assert.ok(value.publishedAt);
}

function decodeDocument(document) {
  const fields = document?.fields || {};
  return {
    title: fields.title?.stringValue || "",
    message: fields.message?.stringValue || "",
    items: (fields.items?.arrayValue?.values || []).map((entry) => entry.stringValue || ""),
    importance: fields.importance?.stringValue || "",
    audience: fields.audience?.stringValue || "",
    status: fields.status?.stringValue || "",
    versionTag: fields.versionTag?.stringValue || "",
    expiresOn: fields.expiresOn?.stringValue || "",
    publishedAt: fields.publishedAt?.timestampValue || ""
  };
}

function stringField(value) {
  return { stringValue: String(value || "") };
}

function timestampField(value) {
  return { timestampValue: value };
}

function arrayField(values) {
  return { arrayValue: { values: values.map(stringField) } };
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
