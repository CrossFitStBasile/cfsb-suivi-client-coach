/**
 * Dashboard Coach CFSB - legacy rebooking sheet -> Firestore queue bridge.
 *
 * Copy into the private AUTO-003 rebooking Apps Script only after a planned
 * authorization window. Required extra appsscript.json scope:
 * - https://www.googleapis.com/auth/datastore
 *
 * This bridge keeps the legacy app as the live source while Firebase parity is
 * proven. It reads "Annulations ouvertes", groups rows by pilot coach, then
 * queues source_import requests for the Dashboard Cloud Function.
 */

const DASHBOARD_REBOOKING_FIRESTORE_PROJECT_ID = 'cfsb-dashboard-coach-aa9a4';
const DASHBOARD_REBOOKING_FIRESTORE_DATABASE_ID = '(default)';
const DASHBOARD_REBOOKING_SYNC_REQUEST_COLLECTION = 'syncRequests';
const DASHBOARD_REBOOKING_BRIDGE_VERSION = '20260615-rebooking-firestore-bridge';
const DASHBOARD_REBOOKING_SOURCE_SHEET_ID = '1s7shtrkL0gs1DO0LbzkbabZteidGnYLhVou6KliHXVU';
const DASHBOARD_REBOOKING_OPEN_CANCELS_TAB = 'Annulations ouvertes';

const DASHBOARD_REBOOKING_COACHES = [
  { coachRxId: '15935', coachName: 'Marc-Andre Menard', aliases: ['marc-andre menard', 'marc-andre', 'marc andre menard', 'marc andre', 'marc'] },
  { coachRxId: '15928', coachName: 'Iheb Yahyaoui', aliases: ['iheb yahyaoui', 'iheb yahiaoui', 'iheb'] },
  { coachRxId: '17242', coachName: 'Camille Proulx', aliases: ['camille proulx', 'camille'] },
  { coachRxId: '15902', coachName: 'David Olivier', aliases: ['david olivier', 'david'] },
  { coachRxId: '15893', coachName: 'Gabriel Mayer Bedard', aliases: ['gabriel mayer bedard', 'gabriel bedard', 'gabriel'] },
  { coachRxId: '15937', coachName: 'Hugo Lelievre', aliases: ['hugo lelievre', 'hugo'] },
  { coachRxId: '15936', coachName: 'Raphael Samson', aliases: ['raphael samson', 'raph samson', 'raphael', 'raph'] }
];

function previewDashboardFirebaseRebookingBridge() {
  const result = dashboardRebookingBuildBridgeResult_(false, '');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function queueDashboardFirebaseRebookingBridge() {
  const result = dashboardRebookingBuildBridgeResult_(true, '');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function previewDashboardFirebaseRebookingBridgeForCoach(coachKey) {
  const result = dashboardRebookingBuildBridgeResult_(false, coachKey);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function queueDashboardFirebaseRebookingBridgeForCoach(coachKey) {
  const result = dashboardRebookingBuildBridgeResult_(true, coachKey);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function queueDashboardFirebaseRebookingBridgeAfterRun_() {
  try {
    return queueDashboardFirebaseRebookingBridge();
  } catch (error) {
    return {
      ok: false,
      bridgeVersion: DASHBOARD_REBOOKING_BRIDGE_VERSION,
      error: String(error && error.message ? error.message : error),
      fallback: 'Lance previewDashboardFirebaseRebookingBridge puis queueDashboardFirebaseRebookingBridge apres autorisation Firestore.'
    };
  }
}

function dashboardRebookingBuildBridgeResult_(write, coachKey) {
  const built = dashboardRebookingBuildPayloads_(coachKey);
  const queued = [];
  if (write) {
    built.payloads.forEach(function(payload) {
      queued.push(dashboardRebookingQueuePayload_(payload));
    });
  }
  return {
    ok: true,
    mode: write ? 'queued_firestore_sync_requests' : 'preview_only_no_firestore_write',
    bridgeVersion: DASHBOARD_REBOOKING_BRIDGE_VERSION,
    payloadCount: built.payloads.length,
    queuedCount: queued.length,
    totals: built.totals,
    byCoach: built.byCoach,
    warnings: built.warnings,
    queued: queued.map(function(item) {
      return {
        requestId: item.requestId,
        sourceType: item.sourceType,
        coachRxId: item.coachRxId,
        recordsReceived: item.recordsReceived
      };
    })
  };
}

function dashboardRebookingBuildPayloads_(coachKey) {
  const selectedCoach = coachKey ? dashboardRebookingResolveCoach_(coachKey) : null;
  if (coachKey && !selectedCoach) {
    throw new Error('Coach rebooking non reconnu: ' + coachKey);
  }

  const ss = SpreadsheetApp.openById(dashboardRebookingSourceSheetId_());
  const rows = dashboardRebookingReadObjects_(ss, DASHBOARD_REBOOKING_OPEN_CANCELS_TAB, ['Cancellation ID', 'Client', 'Coach', 'Statut']);
  const sourceGeneratedAt = new Date().toISOString();
  const byCoachRows = {};
  const byCoach = {};
  const warnings = [];
  let skippedNoCoach = 0;
  let skippedNoClient = 0;

  DASHBOARD_REBOOKING_COACHES.forEach(function(coach) {
    byCoachRows[coach.coachRxId] = [];
    byCoach[coach.coachRxId] = {
      coachName: coach.coachName,
      sourceRows: 0,
      openRows: 0,
      managedRows: 0,
      rebookedRows: 0,
      coachAbsenceRows: 0,
      archivedRows: 0,
      rowsWithCancellationId: 0,
      rowsWithAppointmentDate: 0
    };
  });

  rows.forEach(function(row) {
    const clientName = dashboardRebookingGet_(row, ['Client', 'Nom', 'Name']);
    if (!clientName) {
      skippedNoClient += 1;
      return;
    }

    const coach = dashboardRebookingResolveCoach_(dashboardRebookingGet_(row, ['Coach', 'Entraineur', 'Trainer']));
    if (!coach) {
      skippedNoCoach += 1;
      return;
    }
    if (selectedCoach && selectedCoach.coachRxId !== coach.coachRxId) return;

    const record = dashboardRebookingBuildRecord_(row, coach);
    byCoachRows[coach.coachRxId].push(record);

    const summary = byCoach[coach.coachRxId];
    summary.sourceRows += 1;
    if (record.status === 'OUVERT') summary.openRows += 1;
    else if (record.status === 'GERE') summary.managedRows += 1;
    else if (record.status === 'REBOOKE') summary.rebookedRows += 1;
    else if (record.status === 'ABSENCE_COACH') summary.coachAbsenceRows += 1;
    else summary.archivedRows += 1;
    if (record['Event ID']) summary.rowsWithCancellationId += 1;
    if (record['Debut RDV']) summary.rowsWithAppointmentDate += 1;
  });

  if (skippedNoCoach) warnings.push(skippedNoCoach + ' ligne(s) ignoree(s) sans coach pilote reconnu.');
  if (skippedNoClient) warnings.push(skippedNoClient + ' ligne(s) ignoree(s) sans client.');

  const payloads = [];
  Object.keys(byCoachRows).forEach(function(coachRxId) {
    const records = byCoachRows[coachRxId];
    if (!records.length) return;
    const coach = dashboardRebookingCoachById_(coachRxId);
    payloads.push({
      sourceType: 'rebooking',
      coachRxId: coach.coachRxId,
      coachName: coach.coachName,
      sourceRunId: 'legacy_rebooking_' + coach.coachRxId + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss'),
      sourceGeneratedAt: sourceGeneratedAt,
      requestedBy: 'apps_script_rebooking_bridge',
      records: records
    });
  });

  return {
    payloads: payloads,
    totals: {
      sourceRows: rows.length,
      payloadRows: payloads.reduce(function(sum, payload) { return sum + payload.records.length; }, 0),
      skippedNoCoach: skippedNoCoach,
      skippedNoClient: skippedNoClient
    },
    byCoach: byCoach,
    warnings: warnings
  };
}

function dashboardRebookingBuildRecord_(row, coach) {
  const cancellationId = dashboardRebookingGet_(row, ['Cancellation ID', 'Event ID', 'ID']);
  const status = dashboardRebookingGet_(row, ['Statut', 'Status']) || 'OUVERT';
  const openNote = dashboardRebookingGet_(row, ['Notes', 'Note']);
  const closureReason = dashboardRebookingGet_(row, ['Raison fermeture', 'Closure reason']);
  const closureNote = dashboardRebookingGet_(row, ['Note fermeture', 'Closure note']);
  const newAppointment = dashboardRebookingGet_(row, ['Nouveau RDV', 'New appointment']);

  return {
    'Event ID': cancellationId,
    'Cancellation ID': cancellationId,
    'Client': dashboardRebookingGet_(row, ['Client', 'Nom', 'Name']),
    'Coach': coach.coachName,
    'coachRxId': coach.coachRxId,
    'Debut RDV': dashboardRebookingGet_(row, ['Debut annule', 'Debut RDV', 'Appointment date']),
    'Service': dashboardRebookingGet_(row, ['Service / classe', 'Service', 'Type']),
    'Statut': status,
    'Recu a': dashboardRebookingGet_(row, ['Ouvert a', 'Recu a', 'Detected at']),
    'sessions to rebook': dashboardRebookingGet_(row, ['Sessions a remettre', 'Sessions', 'Nombre seances']) || '1',
    'note': openNote,
    'source status': status,
    'source': 'legacy_rebooking_annulations_ouvertes',
    'rebook event id': dashboardRebookingGet_(row, ['Rebook event ID']),
    'new appointment': newAppointment,
    'closed at': dashboardRebookingGet_(row, ['Ferme a']),
    'closed by': dashboardRebookingGet_(row, ['Ferme par']),
    'closure reason': closureReason,
    'closure note': closureNote
  };
}

function dashboardRebookingQueuePayload_(payload) {
  const sourceType = String(payload && payload.sourceType || '').trim();
  const coachRxId = String(payload && payload.coachRxId || '').trim();
  const records = Array.isArray(payload && payload.records) ? payload.records : [];
  if (sourceType !== 'rebooking') throw new Error('sourceType rebooking requis.');
  if (!coachRxId) throw new Error('coachRxId manquant.');
  if (!records.length) throw new Error('Aucune ligne rebooking a importer.');

  const requestId = dashboardRebookingRequestId_(sourceType, coachRxId);
  const now = new Date().toISOString();
  const doc = {
    requestType: 'source_import',
    status: 'queued',
    source: 'apps_script_rebooking_firestore_queue',
    sourceTransport: 'apps_script_firestore_rest',
    queueVersion: DASHBOARD_REBOOKING_BRIDGE_VERSION,
    sourceType: sourceType,
    coachRxId: coachRxId,
    coachName: String(payload.coachName || '').trim(),
    records: records,
    recordsReceived: records.length,
    requestedBy: String(payload.requestedBy || 'apps_script_rebooking_bridge'),
    requestedByEmail: String(payload.requestedBy || 'apps_script_rebooking_bridge'),
    sourceRunId: String(payload.sourceRunId || requestId),
    sourceGeneratedAt: String(payload.sourceGeneratedAt || now),
    createdAt: now,
    updatedAt: now
  };

  const result = dashboardRebookingFirestorePatchDocument_(
    DASHBOARD_REBOOKING_SYNC_REQUEST_COLLECTION,
    requestId,
    doc
  );

  return {
    ok: true,
    mode: 'queued_firestore_sync_request',
    requestId: requestId,
    sourceType: sourceType,
    coachRxId: coachRxId,
    coachName: doc.coachName,
    recordsReceived: records.length,
    firestoreName: result.name || ''
  };
}

function dashboardRebookingFirestorePatchDocument_(collectionPath, docId, data) {
  const encodedCollection = String(collectionPath || '').split('/').map(encodeURIComponent).join('/');
  const encodedDocId = encodeURIComponent(String(docId || ''));
  const url = 'https://firestore.googleapis.com/v1/projects/'
    + encodeURIComponent(DASHBOARD_REBOOKING_FIRESTORE_PROJECT_ID)
    + '/databases/'
    + encodeURIComponent(DASHBOARD_REBOOKING_FIRESTORE_DATABASE_ID)
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
    payload: JSON.stringify({ fields: dashboardRebookingFirestoreEncodeMap_(data) })
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

function dashboardRebookingFirestoreEncodeMap_(data) {
  const fields = {};
  Object.keys(data || {}).forEach(function(key) {
    const value = data[key];
    if (typeof value === 'undefined') return;
    fields[key] = dashboardRebookingFirestoreEncodeValue_(value);
  });
  return fields;
}

function dashboardRebookingFirestoreEncodeValue_(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(function(item) { return dashboardRebookingFirestoreEncodeValue_(item); }) } };
  }
  if (typeof value === 'object') return { mapValue: { fields: dashboardRebookingFirestoreEncodeMap_(value) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function dashboardRebookingReadObjects_(ss, sheetName, expectedHeaders) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Onglet introuvable: ' + sheetName);
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  const headerRow = dashboardRebookingFindHeaderRow_(values, expectedHeaders || []);
  if (headerRow === -1) throw new Error('Entetes introuvables dans ' + sheetName);
  const headers = values[headerRow].map(function(header) { return dashboardRebookingHeaderKey_(header); });
  return values.slice(headerRow + 1)
    .filter(function(row) { return row.some(function(cell) { return String(cell || '').trim(); }); })
    .map(function(row) {
      const out = {};
      headers.forEach(function(header, index) {
        if (!header) return;
        out[header] = row[index] instanceof Date ? row[index].toISOString() : String(row[index] || '').trim();
      });
      return out;
    });
}

function dashboardRebookingFindHeaderRow_(values, expectedHeaders) {
  const expected = (expectedHeaders || []).map(dashboardRebookingHeaderKey_);
  for (let rowIndex = 0; rowIndex < Math.min(values.length, 20); rowIndex += 1) {
    const keys = values[rowIndex].map(dashboardRebookingHeaderKey_);
    const matched = expected.filter(function(header) { return keys.indexOf(header) !== -1; }).length;
    if (matched >= Math.min(3, expected.length || 3)) return rowIndex;
  }
  return -1;
}

function dashboardRebookingGet_(row, aliases) {
  for (let index = 0; index < aliases.length; index += 1) {
    const key = dashboardRebookingHeaderKey_(aliases[index]);
    const value = row[key];
    if (value !== '' && value !== null && typeof value !== 'undefined') return String(value).trim();
  }
  return '';
}

function dashboardRebookingResolveCoach_(value) {
  const candidate = dashboardRebookingComparable_(value);
  if (!candidate) return null;
  for (let index = 0; index < DASHBOARD_REBOOKING_COACHES.length; index += 1) {
    const coach = DASHBOARD_REBOOKING_COACHES[index];
    if (candidate === coach.coachRxId) return coach;
    const aliases = [coach.coachName].concat(coach.aliases || []);
    for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
      const normalized = dashboardRebookingComparable_(aliases[aliasIndex]);
      if (candidate === normalized || candidate.indexOf(normalized) !== -1 || normalized.indexOf(candidate) !== -1) {
        return coach;
      }
    }
  }
  return null;
}

function dashboardRebookingCoachById_(coachRxId) {
  return DASHBOARD_REBOOKING_COACHES.filter(function(coach) {
    return coach.coachRxId === String(coachRxId || '').trim();
  })[0] || null;
}

function dashboardRebookingSourceSheetId_() {
  if (typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID) return SPREADSHEET_ID;
  return DASHBOARD_REBOOKING_SOURCE_SHEET_ID;
}

function dashboardRebookingRequestId_(sourceType, coachRxId) {
  return [
    String(sourceType || 'rebooking').replace(/[^A-Za-z0-9_-]/g, '_'),
    String(coachRxId || 'coach').replace(/[^A-Za-z0-9_-]/g, '_'),
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss')
  ].join('_');
}

function dashboardRebookingHeaderKey_(value) {
  return dashboardRebookingComparable_(String(value || '').split('\n')[0]);
}

function dashboardRebookingComparable_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
