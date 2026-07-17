/**
 * Dashboard Coach CFSB - Apps Script -> Firestore sync request queue.
 *
 * Copy this file into a private Apps Script source extractor when Cloud Run IAM
 * blocks direct HTTP calls to ingestDashboardSource. This transport does not use
 * a public endpoint and does not store Firebase/GHL secrets in Apps Script.
 *
 * Required appsscript.json scopes:
 * - https://www.googleapis.com/auth/datastore
 * - https://www.googleapis.com/auth/script.external_request
 *
 * Flow:
 * Source privee -> previewDashboardImportPayload_ -> queueDashboardSourceImport_
 * -> Firestore syncRequests -> processSyncRequest Function -> operational collections
 */

const CFSB_FIRESTORE_PROJECT_ID = 'cfsb-dashboard-coach-aa9a4';
const CFSB_FIRESTORE_DATABASE_ID = '(default)';
const CFSB_DASHBOARD_SYNC_REQUEST_COLLECTION = 'syncRequests';
const CFSB_DASHBOARD_FIRESTORE_QUEUE_VERSION = '20260609-firestore-source-queue';

function queueDashboardSourceImport_(payload) {
  const preflight = validateDashboardImportPayload_(payload);
  const safePayload = payload || {};
  const requestedBy = safePayload.requestedBy
    || (Session.getActiveUser().getEmail ? Session.getActiveUser().getEmail() : '')
    || 'apps_script';
  const requestId = makeDashboardFirestoreRequestId_(preflight.sourceType, preflight.coachRxId || preflight.coachId);
  const now = new Date().toISOString();

  const requestDoc = {
    requestType: 'source_import',
    status: 'queued',
    source: 'apps_script_firestore_queue',
    sourceTransport: 'apps_script_firestore_rest',
    queueVersion: CFSB_DASHBOARD_FIRESTORE_QUEUE_VERSION,
    sourceType: preflight.sourceType,
    coachId: preflight.coachId || '',
    coachRxId: preflight.coachRxId || '',
    coachName: preflight.coachName || '',
    records: preflight.records,
    recordsReceived: preflight.recordsReceived,
    requestedBy,
    requestedByEmail: requestedBy,
    sourceRunId: String(safePayload.sourceRunId || requestId),
    sourceGeneratedAt: String(safePayload.sourceGeneratedAt || now),
    createdAt: now,
    updatedAt: now
  };

  const result = firestorePatchDocument_(
    CFSB_DASHBOARD_SYNC_REQUEST_COLLECTION,
    requestId,
    requestDoc
  );

  return {
    ok: true,
    mode: 'queued_firestore_sync_request',
    requestId,
    sourceType: preflight.sourceType,
    coachId: preflight.coachId,
    coachRxId: preflight.coachRxId,
    coachName: preflight.coachName,
    recordsReceived: preflight.recordsReceived,
    firestoreName: result.name || ''
  };
}

function previewDashboardFirestoreQueue_(payload) {
  const preflight = validateDashboardImportPayload_(payload);
  return {
    ok: true,
    mode: 'preview_only_no_firestore_write',
    transport: 'apps_script_firestore_rest',
    projectId: CFSB_FIRESTORE_PROJECT_ID,
    collection: CFSB_DASHBOARD_SYNC_REQUEST_COLLECTION,
    sourceType: preflight.sourceType,
    coachId: preflight.coachId,
    coachRxId: preflight.coachRxId,
    coachName: preflight.coachName,
    recordsReceived: preflight.recordsReceived,
    sampleKeys: preflight.sampleKeys
  };
}

function queueCoachRxClientsForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('coachrx_clients', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return queueDashboardSourceImport_(payload);
}

function queueClientDirectoryForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('client_directory', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return queueDashboardSourceImport_(payload);
}

function queueClientEnrichmentForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('client_enrichment', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return queueDashboardSourceImport_(payload);
}

function queueGhlContactsForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('ghl_contacts', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return queueDashboardSourceImport_(payload);
}

function queueQuestionnaireResponsesForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('questionnaire_responses', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return queueDashboardSourceImport_(payload);
}

function queueCheckupsForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('checkups', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return queueDashboardSourceImport_(payload);
}

function queueRebookingsForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('rebooking', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return queueDashboardSourceImport_(payload);
}

function testDashboardFirestoreQueueConfig_() {
  return {
    ok: true,
    projectId: CFSB_FIRESTORE_PROJECT_ID,
    databaseId: CFSB_FIRESTORE_DATABASE_ID,
    collection: CFSB_DASHBOARD_SYNC_REQUEST_COLLECTION,
    queueVersion: CFSB_DASHBOARD_FIRESTORE_QUEUE_VERSION,
    auth: 'ScriptApp.getOAuthToken',
    noDashboardImportTokenRequired: true,
    helpers: [
      'previewDashboardFirestoreQueue_',
      'queueDashboardSourceImport_',
      'queueCoachRxClientsForDashboard_',
      'queueClientDirectoryForDashboard_',
      'queueClientEnrichmentForDashboard_',
      'queueQuestionnaireResponsesForDashboard_'
    ]
  };
}

function firestorePatchDocument_(collectionPath, docId, data) {
  const encodedCollection = String(collectionPath || '').split('/').map(encodeURIComponent).join('/');
  const encodedDocId = encodeURIComponent(String(docId || ''));
  const url = 'https://firestore.googleapis.com/v1/projects/'
    + encodeURIComponent(CFSB_FIRESTORE_PROJECT_ID)
    + '/databases/'
    + encodeURIComponent(CFSB_FIRESTORE_DATABASE_ID)
    + '/documents/'
    + encodedCollection
    + '/'
    + encodedDocId;

  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify({ fields: firestoreEncodeMap_(data) })
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (error) {
    parsed = { raw: text };
  }

  if (status < 200 || status >= 300) {
    throw new Error('Ecriture Firestore echouee: ' + status + ' ' + text);
  }
  return parsed;
}

function firestoreEncodeMap_(data) {
  const fields = {};
  Object.keys(data || {}).forEach(function(key) {
    const value = data[key];
    if (typeof value === 'undefined') return;
    fields[key] = firestoreEncodeValue_(value);
  });
  return fields;
}

function firestoreEncodeValue_(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(function(item) { return firestoreEncodeValue_(item); })
      }
    };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: firestoreEncodeMap_(value) } };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function makeDashboardFirestoreRequestId_(sourceType, coachKey) {
  const cleanSource = String(sourceType || 'source').replace(/[^A-Za-z0-9_-]/g, '_');
  const cleanCoach = String(coachKey || 'coach').replace(/[^A-Za-z0-9_-]/g, '_');
  const stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd_HHmmss_SSS');
  const random = Utilities.getUuid().slice(0, 8);
  return cleanSource + '_' + cleanCoach + '_' + stamp + '_' + random;
}
