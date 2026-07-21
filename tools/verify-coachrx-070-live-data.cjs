const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const APP_VERSION = "20260721-coachrx-extension-070";
const ANNOUNCEMENT_ID = "release_20260721_coachrx_070";
const PORTFOLIO_REQUEST_ID = "coachrx_070_generalization_20260721";
const RELEASE_AT = Date.parse("2026-07-21T18:13:55.352Z");
const PORTFOLIO_SOURCE = "firebase_firestore_sync_request_all";
const OFFICIAL_COACHES = Object.freeze([
  { id: "15935", name: "Marc-Andre Menard" },
  { id: "15928", name: "Iheb Yahyaoui" },
  { id: "17242", name: "Camille Proulx" },
  { id: "15902", name: "David Olivier" },
  { id: "15893", name: "Gabriel Mayer Bedard" },
  { id: "15937", name: "Hugo Lelievre" },
  { id: "15936", name: "Raphael Samson" }
]);

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: safeError(error) }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const accessToken = await firebaseAccess();
  const [setupDocument, announcementDocument, coaches, clients, statuses, portfolioRuns, pipelineDocuments] = await Promise.all([
    getDocument(accessToken, "system/coachrxExtensionSetup"),
    getDocument(accessToken, `announcements/${ANNOUNCEMENT_ID}`),
    listCollection(accessToken, "coaches"),
    listCollection(accessToken, "clients"),
    listCollection(accessToken, "coachSyncStatus"),
    queryDocumentsByStringField(accessToken, "syncRuns", "triggeredByEventId", PORTFOLIO_REQUEST_ID),
    Promise.all(OFFICIAL_COACHES.map((coach) => getDocument(
      accessToken,
      `coachSyncStatus/${coach.id}/pipelines/dashboard_full`,
      true
    )))
  ]);

  const setup = decodeDocument(setupDocument);
  const announcement = decodeDocument(announcementDocument);
  assert.ok(String(setup.syncSecret || "").length >= 16, "Dashboard sync secret is missing.");
  assert.ok(String(setup.webAppUrl || "").startsWith("https://script.google.com/"), "Dashboard Apps Script URL is missing.");
  assert.equal(announcement.status, "published");
  assert.equal(announcement.audience, "all");
  assert.equal(announcement.versionTag, APP_VERSION);

  const coachById = new Map(coaches.map((document) => {
    const data = decodeDocument(document);
    return [String(data.id || documentId(document)), data];
  }));
  const statusById = new Map(statuses.map((document) => [documentId(document), decodeDocument(document)]));
  const clientRows = clients.map(decodeDocument);
  const latestPortfolioRunDocument = newestDocument(portfolioRuns);
  assert.ok(latestPortfolioRunDocument, "No full portfolio synchronization run is available.");
  const latestPortfolioRun = decodeDocument(latestPortfolioRunDocument);
  const latestPortfolioRunAt = timestampText(
    latestPortfolioRun.finishedAt
    || latestPortfolioRun.completedAt
    || latestPortfolioRun.updatedAt
    || latestPortfolioRun.createdAt
  );
  const latestPortfolioRunStatus = String(latestPortfolioRun.status || "")
    || (timestampText(latestPortfolioRun.finishedAt || latestPortfolioRun.completedAt) ? "done" : "unknown");
  const latestPortfolioResults = Array.isArray(latestPortfolioRun.results) ? latestPortfolioRun.results : [];
  const latestRosterResultByCoachId = new Map(latestPortfolioResults.map((result) => [String(result?.coachId || ""), result]));
  const pipelineDocumentByCoachId = new Map(OFFICIAL_COACHES.map((coach, index) => [
    coach.id,
    pipelineDocuments[index] ? decodeDocument(pipelineDocuments[index]) : null
  ]));
  const report = OFFICIAL_COACHES.map((coach) => {
    const configured = coachById.get(coach.id) || {};
    const sync = statusById.get(coach.id) || {};
    const owned = clientRows.filter((client) => String(client.coachId || client.coachRxId || "") === coach.id);
    const selectable = owned.filter((client) => client.clientSelectable !== false && !["removed", "archived"].includes(String(client.status || "").toLowerCase()));
    const manual = owned.filter((client) => ["firebase_app_manual", "manual", "dashboard_manual"].includes(String(client.source || "")) || client.linkedFromManual === true);
    const coachRxIdentified = owned.filter((client) => String(client.sourceClientId || "").trim());
    const needsReview = owned.filter((client) => String(client.ownershipStatus || "") === "needs_review");
    const selectableNeedsReview = needsReview.filter((client) => client.clientSelectable !== false);
    const latestRosterResult = latestRosterResultByCoachId.get(coach.id) || {};
    const rosterDiagnostics = latestRosterResult?.diagnostics?.coachRxRoster || {};
    const pipelineDocument = pipelineDocumentByCoachId.get(coach.id);
    const latestClientUpdatedFromSheetsAt = latestTimestamp(owned.map((client) => client.updatedFromSheetsAt));
    const updatedAfterRelease = owned.filter((client) => Date.parse(timestampText(client.updatedFromSheetsAt)) >= RELEASE_AT);
    const sourceBreakdown = clientSourceBreakdown(owned);
    return {
      coachId: coach.id,
      configured: Boolean(configured.id || configured.coachRxId || configured.name),
      active: configured.active !== false,
      clients: owned.length,
      selectableClients: selectable.length,
      coachRxIdentifiedClients: coachRxIdentified.length,
      manualOrLinkedClients: manual.length,
      ownershipNeedsReview: needsReview.length,
      selectableOwnershipNeedsReview: selectableNeedsReview.length,
      syncStatusPresent: Boolean(Object.keys(sync).length),
      syncStatus: String(sync.status || ""),
      syncWarningCount: numberValue(sync.warningCount),
      clientsImported: numberValue(sync.clientsImported),
      lastSyncAt: timestampText(sync.syncedAt || sync.updatedAt || sync.createdAt),
      telemetry: {
        schema: pipelineDocument ? "pipeline_v1" : "legacy_flat",
        dashboardFullPipelinePresent: Boolean(pipelineDocument),
        observedPipeline: observedPipeline(sync),
        portfolioStatusComparable: observedPipeline(sync) === "dashboard_full"
      },
      latestClientUpdatedFromSheetsAt,
      clientDocsUpdatedAfterRelease: updatedAfterRelease.length,
      sourceBreakdown,
      latestRosterEvidence: {
        runAt: latestPortfolioRunAt,
        clientSyncEnabled: rosterDiagnostics.clientSyncEnabled === true,
        globalVerified: rosterDiagnostics.globalVerified === true,
        coachVerified: rosterDiagnostics.coachVerified === true,
        acceptedRows: numberValue(rosterDiagnostics.acceptedRows),
        rejectedRows: numberValue(rosterDiagnostics.rejectedRows),
        legacyRowsIgnored: numberValue(rosterDiagnostics.legacyRowsIgnored),
        sourceCoachRxRows: numberValue(latestRosterResult?.diagnostics?.sourceRowsAvailable?.coachRx),
        matchedCoachRxRows: numberValue(latestRosterResult?.diagnostics?.matchedRows?.coachRx),
        ownershipProofBlocked: !(rosterDiagnostics.clientSyncEnabled === true)
      },
      warningCodes: deriveWarningCodes(latestRosterResult?.diagnostics || {})
    };
  });

  assert.equal(report.filter((item) => item.configured && item.active).length, 7, "The active coach directory is incomplete.");
  assert.equal(report.filter((item) => item.syncStatusPresent).length, 7, "A coach sync status is missing.");
  assert.equal(report.filter((item) => item.clients > 0).length, 7, "At least one official coach has no Firestore clients.");
  assert.equal(latestPortfolioRunStatus, "done", "Latest full portfolio synchronization did not complete.");
  assert.equal(latestPortfolioResults.length, 7, "Latest full portfolio synchronization does not contain seven results.");
  assert.equal(report.every((item) => item.latestRosterEvidence.globalVerified), true, "Global roster proof failed.");
  assert.equal(report.every((item) => item.latestRosterEvidence.coachVerified), true, "A coach roster proof failed.");
  assert.equal(report.every((item) => item.latestRosterEvidence.clientSyncEnabled), true, "A coach client synchronization was blocked.");
  assert.equal(report.every((item) => item.latestRosterEvidence.acceptedRows > 0), true, "A coach roster contains no accepted rows.");
  assert.equal(report.every((item) => item.latestRosterEvidence.rejectedRows === 0), true, "A coach roster contains rejected rows.");
  assert.equal(report.every((item) => item.selectableOwnershipNeedsReview === 0), true, "A quarantined ownership record is selectable.");
  assert.equal(latestPortfolioRun.source, PORTFOLIO_SOURCE, "Latest portfolio synchronization source mismatch.");

  console.log(JSON.stringify({
    ok: true,
    projectId: PROJECT_ID,
    appVersion: APP_VERSION,
    extensionSetup: {
      syncSecretConfigured: true,
      webAppUrlConfigured: true,
      valuesPrinted: false
    },
    announcement: {
      documentId: ANNOUNCEMENT_ID,
      published: true,
      audience: "all",
      versionTag: APP_VERSION
    },
    latestPortfolioRun: {
      present: true,
      source: PORTFOLIO_SOURCE,
      status: latestPortfolioRunStatus,
      runAt: latestPortfolioRunAt,
      afterRelease: Date.parse(latestPortfolioRunAt) >= RELEASE_AT,
      coaches: latestPortfolioResults.length,
      clientsImported: latestPortfolioResults.reduce((sum, result) => sum + numberValue(result.clientsImported), 0),
      warningCount: Array.isArray(latestPortfolioRun.warnings) ? latestPortfolioRun.warnings.length : 0
    },
    totals: {
      officialCoaches: 7,
      firestoreCoachDocuments: coaches.length,
      firestoreClientDocuments: clients.length,
      coachesWithClients: report.filter((item) => item.clients > 0).length,
      coachesWithSyncStatus: report.filter((item) => item.syncStatusPresent).length,
      ownershipNeedsReview: report.reduce((sum, item) => sum + item.ownershipNeedsReview, 0),
      coachesUpdatedAfterRelease: report.filter((item) => item.clientDocsUpdatedAfterRelease > 0).length,
      allPortfoliosUpdatedAfterRelease: report.every((item) => item.clientDocsUpdatedAfterRelease > 0),
      pipelineTelemetryCoaches: report.filter((item) => item.telemetry.dashboardFullPipelinePresent).length,
      legacyFlatTelemetryCoaches: report.filter((item) => item.telemetry.schema === "legacy_flat").length,
      warningReasonCounts: countWarningCodes(report)
    },
    coaches: report
  }, null, 2));
}

function newestDocument(documents) {
  return [...documents].sort((left, right) => {
    const leftData = decodeDocument(left);
    const rightData = decodeDocument(right);
    const leftAt = Date.parse(timestampText(leftData.finishedAt || leftData.completedAt || leftData.updatedAt || leftData.createdAt)) || 0;
    const rightAt = Date.parse(timestampText(rightData.finishedAt || rightData.completedAt || rightData.updatedAt || rightData.createdAt)) || 0;
    return rightAt - leftAt;
  })[0] || null;
}

async function firebaseAccess() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const firebaseRoot = path.join(home, ".cache", "cfsb-dashboard-tools", "firebase-tools-clean", "node_modules", "firebase-tools");
  const authPath = path.join(firebaseRoot, "lib", "auth.js");
  const apiPath = path.join(firebaseRoot, "lib", "apiv2.js");
  assert.equal(fs.existsSync(authPath), true, "Firebase CLI auth module unavailable.");
  const auth = require(authPath);
  const api = require(apiPath);
  const account = auth.getGlobalDefaultAccount();
  assert.ok(account?.tokens?.refresh_token, "Firebase CLI account is not authenticated.");
  auth.setRefreshToken(account.tokens.refresh_token);
  const accessToken = await api.getAccessToken();
  assert.ok(accessToken, "Firebase access token unavailable.");
  return accessToken;
}

async function getDocument(accessToken, relativePath, allowNotFound = false) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${relativePath}`;
  return requestJson(url, accessToken, { allowNotFound });
}

async function listCollection(accessToken, collection) {
  const documents = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "300" });
    if (pageToken) query.set("pageToken", pageToken);
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}?${query}`;
    const page = await requestJson(url, accessToken);
    documents.push(...(page.documents || []));
    pageToken = String(page.nextPageToken || "");
  } while (pageToken);
  return documents;
}

async function queryDocumentsByStringField(accessToken, collectionId, fieldPath, value) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const rows = await requestJson(url, accessToken, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: "EQUAL",
            value: { stringValue: value }
          }
        },
      }
    })
  });
  return rows.map((row) => row.document).filter(Boolean);
}

async function requestJson(url, accessToken, options = {}) {
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
  if (!response.ok) throw new Error(`Firestore read refused (${response.status}): ${safeApiDetail(text)}`);
  return text ? JSON.parse(text) : {};
}

function decodeDocument(document) {
  return Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, decodeValue(value)]));
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

function documentId(document) {
  return String(document?.name || "").split("/").pop() || "";
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function timestampText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && Number.isFinite(Number(value._seconds))) {
    return new Date(Number(value._seconds) * 1000).toISOString();
  }
  return "";
}

function latestTimestamp(values) {
  const timestamps = values
    .map(timestampText)
    .map((value) => ({ value, time: Date.parse(value || "") }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((left, right) => right.time - left.time);
  return timestamps[0]?.value || "";
}

function clientSourceBreakdown(clients) {
  const summary = {
    googleSheetsCoachRxBrowser: 0,
    googleSheetsCoreClients: 0,
    dashboardManual: 0,
    other: 0
  };
  clients.forEach((client) => {
    const source = String(client.source || "");
    if (source === "google_sheets_coachrx_browser") summary.googleSheetsCoachRxBrowser += 1;
    else if (source === "google_sheets_core_clients") summary.googleSheetsCoreClients += 1;
    else if (["firebase_app_manual", "manual", "dashboard_manual"].includes(source) || client.linkedFromManual === true) summary.dashboardManual += 1;
    else summary.other += 1;
  });
  return summary;
}

function observedPipeline(sync) {
  const source = String(sync.source || "").toLowerCase();
  if (source.includes("questionnaire")) return "questionnaire";
  if (source.includes("coachrx")) return "coachrx";
  if (source.includes("sync_request") || source.includes("sync_sheets") || source.includes("dashboard_sync")) return "dashboard_full";
  return "other";
}

function deriveWarningCodes(diagnostics) {
  const codes = [];
  const available = diagnostics.sourceRowsAvailable || {};
  const matched = diagnostics.matchedRows || {};
  const imported = diagnostics.importedClients || {};
  const ownership = imported.ownership || {};
  const importedRebookings = diagnostics.importedRebookings || {};
  const quarantined = numberValue(ownership.conflicts) + numberValue(ownership.needsReview) + numberValue(ownership.staffExcluded);
  if (quarantined) codes.push("ownership_quarantine");
  if (numberValue(imported.missingPhone)) codes.push("imported_clients_missing_phone");
  if (numberValue(available.coachRx) > 0 && numberValue(matched.coachRx) === 0) codes.push("coachrx_rows_unmatched");
  if (numberValue(available.coreClients) > 0 && numberValue(matched.coreClients) === 0) codes.push("core_rows_unmatched");
  if (numberValue(available.checkups) > 0 && numberValue(matched.checkups) === 0) codes.push("checkup_rows_unmatched");
  if (numberValue(available.rebookings) > 0 && numberValue(matched.rebookings) === 0) codes.push("rebooking_rows_unmatched");
  if (numberValue(importedRebookings.missingClientId)) codes.push("rebooking_missing_client_link");
  if (numberValue(importedRebookings.sourceRowsMatched) > 0 && numberValue(importedRebookings.sourceRowsWithPhone) === 0) codes.push("rebooking_phone_missing");
  return codes;
}

function countWarningCodes(report) {
  const counts = {};
  report.flatMap((item) => item.warningCodes).forEach((code) => {
    counts[code] = numberValue(counts[code]) + 1;
  });
  return counts;
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
