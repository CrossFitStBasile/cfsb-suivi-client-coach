/**
 * Dashboard Coach CFSB - Apps Script -> Firebase import bridge.
 *
 * Copy this file into a private Apps Script project, then set Script Properties:
 * - DASHBOARD_IMPORT_TOKEN: same private value as Firebase Secret Manager
 * - DASHBOARD_IMPORT_AUTH_BEARER: optional short-lived IAM bearer/ID token
 *   issued for the authorized caller when the bridge is enabled.
 *
 * Do not paste the token in this file. Do not publish tokenized Apps Script URLs
 * in GitHub Pages or shared documentation.
 *
 * The Firebase Function is not a public HTTP endpoint. The import token is a
 * second lock, not the only lock. A production push also needs an authenticated
 * Google/Firebase transport configured by the project admin.
 */

const CFSB_DASHBOARD_IMPORT_ENDPOINT =
  'https://us-central1-cfsb-dashboard-coach-aa9a4.cloudfunctions.net/ingestDashboardSource';

const CFSB_DASHBOARD_IMPORT_AUTH_MODE = 'iam_required';

const CFSB_DASHBOARD_SOURCE_TYPES = [
  'coachrx_clients',
  'client_directory',
  'client_enrichment',
  'ghl_contacts',
  'questionnaire_responses',
  'rebooking',
  'checkups'
];

function pushDashboardSourceToFirebase_(payload) {
  const preflight = validateDashboardImportPayload_(payload);
  const sourceType = preflight.sourceType;

  const token = PropertiesService.getScriptProperties().getProperty('DASHBOARD_IMPORT_TOKEN');
  if (!token) {
    throw new Error('DASHBOARD_IMPORT_TOKEN manquant dans Script Properties.');
  }

  const authHeader = getDashboardImportAuthorizationHeader_();
  if (!authHeader) {
    throw new Error(
      'Transport Firebase non authentifie. La Function ingestDashboardSource est privee: ' +
      'configure un appel IAM/Cloud Run autorise avant le push de production.'
    );
  }

  const safePayload = payload || {};
  const requestedBy = safePayload.requestedBy
    || (Session.getActiveUser().getEmail ? Session.getActiveUser().getEmail() : '')
    || 'apps_script';

  const body = Object.assign({}, safePayload, {
    sourceType,
    requestedBy,
    records: preflight.records
  });

  const response = UrlFetchApp.fetch(CFSB_DASHBOARD_IMPORT_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: authHeader,
      'X-CFSB-Import-Token': token
    },
    payload: JSON.stringify(body)
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (error) {
    parsed = { raw: text };
  }

  if (status < 200 || status >= 300 || parsed.ok === false) {
    throw new Error('Import Firebase echoue: ' + status + ' ' + text);
  }

  return parsed;
}

function getDashboardImportAuthorizationHeader_() {
  const bearer = PropertiesService.getScriptProperties().getProperty('DASHBOARD_IMPORT_AUTH_BEARER');
  if (!bearer) {
    return '';
  }
  return /^Bearer\s+/i.test(bearer) ? bearer : 'Bearer ' + bearer;
}

function validateDashboardImportPayload_(payload) {
  const safePayload = payload || {};
  const sourceType = String(safePayload.sourceType || safePayload.source || safePayload.kind || '').trim();
  if (CFSB_DASHBOARD_SOURCE_TYPES.indexOf(sourceType) === -1) {
    throw new Error('sourceType non supporte: ' + sourceType);
  }

  const records = Array.isArray(safePayload.records)
    ? safePayload.records
    : Array.isArray(safePayload.rows)
      ? safePayload.rows
      : Array.isArray(safePayload.data)
        ? safePayload.data
        : [];

  if (!records.length) {
    throw new Error('Aucune ligne a importer pour ' + sourceType + '.');
  }

  const hasCoachIdentity = [
    safePayload.coachId,
    safePayload.coachRxId,
    safePayload.teamId,
    safePayload.coachName
  ].some(function(value) {
    return String(value || '').trim();
  });

  if (!hasCoachIdentity) {
    throw new Error('Identite coach manquante: fournir coachId, coachRxId, teamId ou coachName.');
  }

  return {
    ok: true,
    sourceType,
    coachId: String(safePayload.coachId || '').trim(),
    coachRxId: String(safePayload.coachRxId || safePayload.teamId || '').trim(),
    coachName: String(safePayload.coachName || '').trim(),
    records,
    recordsReceived: records.length,
    sampleKeys: records.slice(0, 3).map(function(record) {
      return record && typeof record === 'object' ? Object.keys(record).sort() : [];
    })
  };
}

function previewDashboardImportPayload_(payload) {
  const preflight = validateDashboardImportPayload_(payload);
  return {
    ok: true,
    mode: 'preview_only_no_firebase_write',
    sourceType: preflight.sourceType,
    coachId: preflight.coachId,
    coachRxId: preflight.coachRxId,
    coachName: preflight.coachName,
    recordsReceived: preflight.recordsReceived,
    sampleKeys: preflight.sampleKeys
  };
}

function pushCoachRxClientsToFirebase_(coachRxId, coachName, records) {
  return pushDashboardSourceToFirebase_({
    sourceType: 'coachrx_clients',
    coachRxId,
    coachName,
    records
  });
}

function pushClientDirectoryToFirebase_(coachRxId, coachName, records) {
  return pushDashboardSourceToFirebase_({
    sourceType: 'client_directory',
    coachRxId,
    coachName,
    records
  });
}

function pushClientEnrichmentToFirebase_(coachRxId, coachName, records) {
  return pushDashboardSourceToFirebase_({
    sourceType: 'client_enrichment',
    coachRxId,
    coachName,
    records
  });
}

function pushGhlContactsToFirebase_(coachRxId, coachName, records) {
  return pushDashboardSourceToFirebase_({
    sourceType: 'ghl_contacts',
    coachRxId,
    coachName,
    records
  });
}

function pushQuestionnaireResponsesToFirebase_(coachRxId, coachName, records) {
  return pushDashboardSourceToFirebase_({
    sourceType: 'questionnaire_responses',
    coachRxId,
    coachName,
    records
  });
}

function pushRebookingsToFirebase_(coachRxId, coachName, records) {
  return pushDashboardSourceToFirebase_({
    sourceType: 'rebooking',
    coachRxId,
    coachName,
    records
  });
}

function pushCheckupsToFirebase_(coachRxId, coachName, records) {
  return pushDashboardSourceToFirebase_({
    sourceType: 'checkups',
    coachRxId,
    coachName,
    records
  });
}

function testDashboardImportBridgeConfig_() {
  const token = PropertiesService.getScriptProperties().getProperty('DASHBOARD_IMPORT_TOKEN');
  const authHeader = getDashboardImportAuthorizationHeader_();
  return {
    ok: Boolean(token && authHeader),
    endpoint: CFSB_DASHBOARD_IMPORT_ENDPOINT,
    authMode: CFSB_DASHBOARD_IMPORT_AUTH_MODE,
    hasImportToken: Boolean(token),
    hasAuthenticatedTransport: Boolean(authHeader),
    supportedSourceTypes: CFSB_DASHBOARD_SOURCE_TYPES.slice(),
    preflightHelpers: [
      'validateDashboardImportPayload_',
      'previewDashboardImportPayload_'
    ]
  };
}
