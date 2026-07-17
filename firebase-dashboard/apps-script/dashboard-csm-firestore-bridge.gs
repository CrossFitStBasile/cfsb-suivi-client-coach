/**
 * Dashboard Coach CFSB - CSM Sheet -> Firestore queue bridge.
 *
 * Copy into the private CSM "Mise a jour 2" Apps Script only after a planned
 * authorization window. Required extra appsscript.json scope:
 * - https://www.googleapis.com/auth/datastore
 *
 * This bridge is intentionally enrichment-first:
 * - client_enrichment updates only existing Firestore clients.
 * - checkups writes check-up history for the resolved coach.
 * - no GHL token, Firebase token, client snapshot or public URL is stored here.
 */

const DASHBOARD_CSM_FIRESTORE_PROJECT_ID = 'cfsb-dashboard-coach-aa9a4';
const DASHBOARD_CSM_FIRESTORE_DATABASE_ID = '(default)';
const DASHBOARD_CSM_SYNC_REQUEST_COLLECTION = 'syncRequests';
const DASHBOARD_CSM_BRIDGE_VERSION = '20260711-csm-attendance-level-enrichment';

const DASHBOARD_CSM_CLIENT_TABS = ['Cours de groupe', 'Suivi personnel', 'Coach Mac'];
const DASHBOARD_CSM_KILO_ATHLETES_TAB = 'Kilo Raw - Athletes';
const DASHBOARD_CSM_CHECKUP_TAB = 'Formulaire Checkup';
const DASHBOARD_CSM_ATTENDANCE_TAB = 'Low Attendances';
const DASHBOARD_CSM_LEVEL_METHOD_TAB = 'LM';
const DASHBOARD_CSM_ATTENDANCE_WINDOW_DAYS = 30;

const DASHBOARD_CSM_COACHES = [
  { coachRxId: '15935', coachName: 'Marc-Andre Menard', aliases: ['marc-andre', 'marc andre', 'marc-andre menard', 'marc andre menard', 'marc', 'mac'] },
  { coachRxId: '15928', coachName: 'Iheb Yahyaoui', aliases: ['iheb', 'iheb yahyaoui', 'iheb yahiaoui'] },
  { coachRxId: '17242', coachName: 'Camille Proulx', aliases: ['camille', 'camille proulx'] },
  { coachRxId: '15902', coachName: 'David Olivier', aliases: ['david', 'david olivier'] },
  { coachRxId: '15893', coachName: 'Gabriel Mayer Bedard', aliases: ['gabriel', 'gabriel mayer bedard', 'gabriel bedard'] },
  { coachRxId: '15937', coachName: 'Hugo Lelievre', aliases: ['hugo', 'hugo lelievre'] },
  { coachRxId: '15936', coachName: 'Raphael Samson', aliases: ['raph', 'raph s', 'raphael', 'raphael samson'] }
];

function previewDashboardFirebaseCsmBridge() {
  const result = dashboardCsmBuildBridgeResult_(false);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function queueDashboardFirebaseCsmBridge() {
  const result = dashboardCsmBuildBridgeResult_(true);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function queueDashboardFirebaseCsmBridgeAfterMaintenance_() {
  try {
    return queueDashboardFirebaseCsmBridge();
  } catch (error) {
    return {
      ok: false,
      bridgeVersion: DASHBOARD_CSM_BRIDGE_VERSION,
      error: String(error && error.message ? error.message : error),
      fallback: 'Lance previewDashboardFirebaseCsmBridge puis queueDashboardFirebaseCsmBridge apres autorisation Firestore.'
    };
  }
}

function dashboardCsmBuildBridgeResult_(write) {
  const built = dashboardCsmBuildPayloads_();
  const queued = [];
  if (write) {
    built.payloads.forEach(function(payload) {
      queued.push(dashboardCsmQueuePayload_(payload));
    });
  }
  return {
    ok: true,
    mode: write ? 'queued_firestore_sync_requests' : 'preview_only_no_firestore_write',
    bridgeVersion: DASHBOARD_CSM_BRIDGE_VERSION,
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

function dashboardCsmBuildPayloads_() {
  const ss = SpreadsheetApp.openById(CSM_SPREADSHEET_ID);
  const athletesByName = dashboardCsmBuildAthleteIndex_(ss);
  const clientMetrics = dashboardCsmBuildClientMetricIndexes_(ss);
  const byCoach = {};
  DASHBOARD_CSM_COACHES.forEach(function(coach) {
    byCoach[coach.coachRxId] = {
      coachName: coach.coachName,
      clientEnrichmentRows: 0,
      clientRowsWithPhone: 0,
      attendanceRowsMatched: 0,
      levelMethodRowsMatched: 0,
      checkupRows: 0,
      checkupRowsWithPhone: 0,
      sourceTabs: {}
    };
  });

  const clientEnrichmentRows = [];
  const checkupRowsByCoach = dashboardCsmEmptyRowsByCoach_();
  const warnings = [];
  let skippedClientRowsNoCoach = 0;
  let skippedCheckupsNoCoach = 0;

  DASHBOARD_CSM_CLIENT_TABS.forEach(function(tabName) {
    const rows = dashboardCsmReadObjects_(ss, tabName, ['Name', 'Statut']);
    rows.forEach(function(row) {
      const clientName = dashboardCsmGet_(row, ['Name', 'Nom', 'Client']);
      if (!dashboardCsmLooksLikeClientName_(clientName)) return;
      const coach = tabName === 'Coach Mac'
        ? dashboardCsmCoachById_('15935')
        : dashboardCsmResolveCoach_(dashboardCsmGet_(row, ['Coach', 'Responsable', 'Entraineur']));
      if (!coach) {
        skippedClientRowsNoCoach += 1;
      }

      const athlete = athletesByName[dashboardCsmNameKey_(clientName)] || {};
      const sourcePhone = dashboardCsmNormalizePhone_(
        dashboardCsmGet_(row, ['Phone', 'Telephone', 'Téléphone']) || dashboardCsmGet_(athlete, ['Phone'])
      );
      const sourceEmail = dashboardCsmGet_(row, ['Email', 'Courriel']) || dashboardCsmGet_(athlete, ['Email']);
      const attendance = dashboardCsmFindClientMetric_(clientMetrics.attendance, {
        name: clientName,
        phone: sourcePhone,
        email: sourceEmail
      });
      const phone = sourcePhone || dashboardCsmNormalizePhone_(dashboardCsmGet_(attendance, ['Phone', 'Telephone', 'Téléphone']));
      const email = sourceEmail || dashboardCsmGet_(attendance, ['Email', 'Courriel']);
      const levelMethod = dashboardCsmFindClientMetric_(clientMetrics.levelMethod, {
        name: clientName,
        phone: phone,
        email: email
      });
      const record = {
        clientName: clientName,
        phone: phone,
        email: email,
        sourceClientId: dashboardCsmGet_(athlete, ['Athlete ID']),
        membership: dashboardCsmGet_(row, ['Active packages', 'Active package', 'Membership', 'Abonnement'])
          || dashboardCsmGet_(athlete, ['Current packages']),
        memberSince: dashboardCsmGet_(row, ['Member Since']) || dashboardCsmGet_(athlete, ['Member Since']),
        lastCheckup: dashboardCsmGet_(row, ['Dernier Check-up', 'Dernier Checkup', 'Last Checkup']),
        note: dashboardCsmGet_(row, ['Notes importer des formulaires check-ups', 'Notes importees des formulaires check-ups', 'Notes']),
        csmCoachName: coach ? coach.coachName : '',
        csmCoachRxId: coach ? coach.coachRxId : '',
        sourceTab: tabName
      };
      if (attendance) {
        dashboardCsmSetOptionalNumber_(record, 'attendance30Days', dashboardCsmGet_(attendance, ['Total Attendance']));
        dashboardCsmSetOptionalNumber_(record, 'classAttendance30Days', dashboardCsmGet_(attendance, ['Class Attendance']));
        dashboardCsmSetOptionalNumber_(record, 'appointmentAttendance30Days', dashboardCsmGet_(attendance, ['Appointment Attendance']));
        dashboardCsmSetOptionalNumber_(record, 'importedEventAttendance30Days', dashboardCsmGet_(attendance, ['Imported Event Attendance']));
        if (typeof record.attendance30Days !== 'undefined') {
          record.attendanceWindowDays = DASHBOARD_CSM_ATTENDANCE_WINDOW_DAYS;
          record.attendanceSource = 'csm_low_attendances';
        }
      }
      if (levelMethod) {
        const overallLevel = dashboardCsmGet_(levelMethod, ['OVERALL LEVEL', 'Overall Level', 'Level Method']);
        const levelsLogged = dashboardCsmOptionalNumber_(dashboardCsmGet_(levelMethod, ['LEVELS LOGGED', 'Levels Logged']));
        if (overallLevel) {
          record.levelMethodOverall = overallLevel;
          record.levelMethodSource = 'csm_lm';
        }
        if (levelsLogged !== null) record.levelMethodLevelsLogged = levelsLogged;
      }
      clientEnrichmentRows.push(record);
    });
  });

  const clientRowsWithPhone = clientEnrichmentRows.filter(function(row) { return row.phone; }).length;
  const sourceTabs = clientEnrichmentRows.reduce(function(out, row) {
    out[row.sourceTab] = (out[row.sourceTab] || 0) + 1;
    return out;
  }, {});

  const clientRowsByCoach = DASHBOARD_CSM_COACHES.reduce(function(out, coach) {
    out[coach.coachRxId] = clientEnrichmentRows.map(function(row) {
      const copy = {};
      Object.keys(row).forEach(function(key) { copy[key] = row[key]; });
      copy.coachName = coach.coachName;
      copy.coachRxId = coach.coachRxId;
      copy.enrichmentScope = 'all_csm_existing_clients';
      return copy;
    });
    byCoach[coach.coachRxId].clientEnrichmentRows = clientEnrichmentRows.length;
    byCoach[coach.coachRxId].clientRowsWithPhone = clientRowsWithPhone;
    byCoach[coach.coachRxId].attendanceRowsMatched = clientEnrichmentRows.filter(function(row) {
      return typeof row.attendance30Days !== 'undefined';
    }).length;
    byCoach[coach.coachRxId].levelMethodRowsMatched = clientEnrichmentRows.filter(function(row) {
      return Boolean(row.levelMethodOverall);
    }).length;
    byCoach[coach.coachRxId].sourceTabs = sourceTabs;
    return out;
  }, {});

  dashboardCsmReadObjects_(ss, DASHBOARD_CSM_CHECKUP_TAB, ['Nom', 'Date', 'coach']).forEach(function(row) {
    const coach = dashboardCsmResolveCoach_(dashboardCsmGet_(row, ['coach', 'Coach', 'Entraineur']));
    if (!coach) {
      skippedCheckupsNoCoach += 1;
      return;
    }
    const phone = dashboardCsmNormalizePhone_(dashboardCsmGet_(row, ['Téléphone', 'Telephone', 'Phone']));
    checkupRowsByCoach[coach.coachRxId].push({
      clientName: dashboardCsmGet_(row, ['Nom', 'Name', 'Client']),
      checkupAt: dashboardCsmGet_(row, ['Date', 'submitted_at', 'Timestamp']),
      phone: phone,
      summary: dashboardCsmGet_(row, ['Note', 'Notes', 'Commentaire']),
      coachName: coach.coachName,
      coachRxId: coach.coachRxId,
      source_checkup_tab: DASHBOARD_CSM_CHECKUP_TAB
    });
    byCoach[coach.coachRxId].checkupRows += 1;
    if (phone) byCoach[coach.coachRxId].checkupRowsWithPhone += 1;
  });

  if (skippedClientRowsNoCoach) warnings.push(skippedClientRowsNoCoach + ' ligne(s) client CSM sans coach pilote reconnu ont quand meme ete envoyees comme enrichissement global.');
  if (skippedCheckupsNoCoach) warnings.push(skippedCheckupsNoCoach + ' check-up(s) ignore(s) sans coach pilote reconnu.');

  const sourceGeneratedAt = new Date().toISOString();
  const payloads = [];
  DASHBOARD_CSM_COACHES.forEach(function(coach) {
    const clientRecords = clientRowsByCoach[coach.coachRxId];
    if (clientRecords.length) {
      payloads.push(dashboardCsmPayload_('client_enrichment', coach, clientRecords, sourceGeneratedAt));
    }
    const checkupRecords = checkupRowsByCoach[coach.coachRxId];
    if (checkupRecords.length) {
      payloads.push(dashboardCsmPayload_('checkups', coach, checkupRecords, sourceGeneratedAt));
    }
  });

  return {
    payloads: payloads,
    byCoach: byCoach,
    warnings: warnings,
    totals: {
      clientEnrichmentRows: Object.keys(byCoach).reduce(function(sum, id) { return sum + byCoach[id].clientEnrichmentRows; }, 0),
      clientRowsWithPhone: Object.keys(byCoach).reduce(function(sum, id) { return sum + byCoach[id].clientRowsWithPhone; }, 0),
      attendanceMetricRows: clientMetrics.attendanceRows,
      attendanceRowsMatched: Object.keys(byCoach).reduce(function(sum, id) { return sum + byCoach[id].attendanceRowsMatched; }, 0),
      levelMethodMetricRows: clientMetrics.levelMethodRows,
      levelMethodRowsMatched: Object.keys(byCoach).reduce(function(sum, id) { return sum + byCoach[id].levelMethodRowsMatched; }, 0),
      checkupRows: Object.keys(byCoach).reduce(function(sum, id) { return sum + byCoach[id].checkupRows; }, 0),
      checkupRowsWithPhone: Object.keys(byCoach).reduce(function(sum, id) { return sum + byCoach[id].checkupRowsWithPhone; }, 0),
      skippedClientRowsNoCoach: skippedClientRowsNoCoach,
      skippedCheckupsNoCoach: skippedCheckupsNoCoach
    }
  };
}

function dashboardCsmBuildClientMetricIndexes_(ss) {
  const attendanceRows = dashboardCsmReadObjects_(ss, DASHBOARD_CSM_ATTENDANCE_TAB, ['Full Name', 'Total Attendance']);
  const levelMethodRows = dashboardCsmReadObjects_(ss, DASHBOARD_CSM_LEVEL_METHOD_TAB, ['NAME', 'OVERALL LEVEL']);
  return {
    attendance: dashboardCsmBuildClientMetricIndex_(attendanceRows),
    levelMethod: dashboardCsmBuildClientMetricIndex_(levelMethodRows),
    attendanceRows: attendanceRows.length,
    levelMethodRows: levelMethodRows.length
  };
}

function dashboardCsmBuildClientMetricIndex_(rows) {
  const index = { byPhone: {}, byEmail: {}, byName: {} };
  (rows || []).forEach(function(row) {
    dashboardCsmAddUniqueMetric_(index.byPhone, dashboardCsmNormalizePhone_(dashboardCsmGet_(row, ['Phone', 'Telephone', 'Téléphone'])), row);
    dashboardCsmAddUniqueMetric_(index.byEmail, dashboardCsmEmailKey_(dashboardCsmGet_(row, ['Email', 'Courriel'])), row);
    dashboardCsmAddUniqueMetric_(index.byName, dashboardCsmNameKey_(dashboardCsmGet_(row, ['Full Name', 'Name', 'NAME', 'Nom', 'Client'])), row);
  });
  return index;
}

function dashboardCsmAddUniqueMetric_(bucket, key, row) {
  if (!key) return;
  if (!Object.prototype.hasOwnProperty.call(bucket, key)) {
    bucket[key] = row;
    return;
  }
  bucket[key] = null;
}

function dashboardCsmFindClientMetric_(index, identity) {
  if (!index) return null;
  const phone = dashboardCsmNormalizePhone_(identity && identity.phone);
  const email = dashboardCsmEmailKey_(identity && identity.email);
  const name = dashboardCsmNameKey_(identity && identity.name);
  return (phone && index.byPhone[phone])
    || (email && index.byEmail[email])
    || (name && index.byName[name])
    || null;
}

function dashboardCsmSetOptionalNumber_(target, key, value) {
  const number = dashboardCsmOptionalNumber_(value);
  if (number !== null) target[key] = number;
}

function dashboardCsmOptionalNumber_(value) {
  const clean = String(value === null || typeof value === 'undefined' ? '' : value).trim();
  if (!clean) return null;
  const normalized = clean.replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function dashboardCsmEmailKey_(value) {
  return String(value || '').trim().toLowerCase();
}

function dashboardCsmPayload_(sourceType, coach, records, sourceGeneratedAt) {
  return {
    sourceType: sourceType,
    coachRxId: coach.coachRxId,
    coachName: coach.coachName,
    requestedBy: 'csm_apps_script',
    sourceRunId: [
      'csm',
      sourceType,
      coach.coachRxId,
      Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss')
    ].join('-'),
    sourceGeneratedAt: sourceGeneratedAt,
    records: records
  };
}

function dashboardCsmQueuePayload_(payload) {
  const requestId = [
    'csm',
    payload.sourceType,
    payload.coachRxId || 'coach',
    Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd_HHmmss_SSS'),
    Utilities.getUuid().slice(0, 8)
  ].join('_');
  const now = new Date().toISOString();
  const doc = {
    requestType: 'source_import',
    status: 'queued',
    source: 'csm_apps_script_firestore_queue',
    sourceTransport: 'apps_script_firestore_rest',
    queueVersion: DASHBOARD_CSM_BRIDGE_VERSION,
    sourceType: payload.sourceType,
    coachRxId: payload.coachRxId || '',
    coachName: payload.coachName || '',
    records: payload.records || [],
    recordsReceived: (payload.records || []).length,
    requestedBy: payload.requestedBy || 'csm_apps_script',
    sourceRunId: payload.sourceRunId || requestId,
    sourceGeneratedAt: payload.sourceGeneratedAt || now,
    createdAt: now,
    updatedAt: now
  };
  const result = dashboardCsmFirestorePatchDocument_(DASHBOARD_CSM_SYNC_REQUEST_COLLECTION, requestId, doc);
  return {
    ok: true,
    requestId: requestId,
    sourceType: payload.sourceType,
    coachRxId: payload.coachRxId || '',
    recordsReceived: doc.recordsReceived,
    firestoreName: result.name || ''
  };
}

function dashboardCsmFirestorePatchDocument_(collectionPath, docId, data) {
  const url = 'https://firestore.googleapis.com/v1/projects/'
    + encodeURIComponent(DASHBOARD_CSM_FIRESTORE_PROJECT_ID)
    + '/databases/'
    + encodeURIComponent(DASHBOARD_CSM_FIRESTORE_DATABASE_ID)
    + '/documents/'
    + String(collectionPath || '').split('/').map(encodeURIComponent).join('/')
    + '/'
    + encodeURIComponent(String(docId || ''));
  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify({ fields: dashboardCsmFirestoreEncodeMap_(data) })
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  const parsed = text ? JSON.parse(text) : {};
  if (status < 200 || status >= 300) {
    throw new Error('Ecriture Firestore echouee: ' + status + ' ' + text);
  }
  return parsed;
}

function dashboardCsmFirestoreEncodeMap_(data) {
  const fields = {};
  Object.keys(data || {}).forEach(function(key) {
    if (typeof data[key] === 'undefined') return;
    fields[key] = dashboardCsmFirestoreEncodeValue_(data[key]);
  });
  return fields;
}

function dashboardCsmFirestoreEncodeValue_(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(function(item) { return dashboardCsmFirestoreEncodeValue_(item); }) } };
  }
  if (typeof value === 'object') return { mapValue: { fields: dashboardCsmFirestoreEncodeMap_(value) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}

function dashboardCsmBuildAthleteIndex_(ss) {
  const rows = dashboardCsmReadObjects_(ss, DASHBOARD_CSM_KILO_ATHLETES_TAB, ['Athlete ID', 'Phone']);
  return rows.reduce(function(index, row) {
    const name = dashboardCsmGet_(row, ['Name']);
    const key = dashboardCsmNameKey_(name);
    if (key && !index[key]) index[key] = row;
    return index;
  }, {});
}

function dashboardCsmReadObjects_(ss, sheetName, expectedHeaders) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];
  const headerRow = dashboardCsmFindHeaderRow_(values, expectedHeaders || []);
  const headers = values[headerRow].map(function(value) { return String(value || '').trim(); });
  return values.slice(headerRow + 1).map(function(row) {
    const object = { __headerKeys: [], __headers: headers };
    headers.forEach(function(header, index) {
      const key = dashboardCsmHeaderKey_(header);
      if (!key) return;
      object.__headerKeys.push(key);
      if (typeof object[key] === 'undefined') object[key] = row[index] || '';
    });
    return object;
  }).filter(function(row) {
    return row.__headerKeys.some(function(key) { return String(row[key] || '').trim() !== ''; });
  });
}

function dashboardCsmFindHeaderRow_(values, expectedHeaders) {
  const expected = (expectedHeaders || []).map(dashboardCsmHeaderKey_);
  for (var rowIndex = 0; rowIndex < Math.min(values.length, 8); rowIndex += 1) {
    const keys = values[rowIndex].map(dashboardCsmHeaderKey_);
    const hit = expected.some(function(expectedKey) {
      return keys.some(function(key) { return key === expectedKey || key.indexOf(expectedKey) === 0; });
    });
    if (hit) return rowIndex;
  }
  return 0;
}

function dashboardCsmGet_(row, aliases) {
  if (!row) return '';
  const keys = row.__headerKeys || Object.keys(row);
  for (var aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
    const aliasKey = dashboardCsmHeaderKey_(aliases[aliasIndex]);
    if (Object.prototype.hasOwnProperty.call(row, aliasKey) && String(row[aliasKey] || '').trim()) return String(row[aliasKey]).trim();
    const matchedKey = keys.find(function(key) {
      return key === aliasKey || key.indexOf(aliasKey) === 0 || aliasKey.indexOf(key) === 0;
    });
    if (matchedKey && String(row[matchedKey] || '').trim()) return String(row[matchedKey]).trim();
  }
  return '';
}

function dashboardCsmEmptyRowsByCoach_() {
  return DASHBOARD_CSM_COACHES.reduce(function(out, coach) {
    out[coach.coachRxId] = [];
    return out;
  }, {});
}

function dashboardCsmCoachById_(coachRxId) {
  return DASHBOARD_CSM_COACHES.find(function(coach) { return coach.coachRxId === String(coachRxId || ''); }) || null;
}

function dashboardCsmResolveCoach_(value) {
  const candidate = dashboardCsmComparable_(value);
  if (!candidate) return null;
  return DASHBOARD_CSM_COACHES.find(function(coach) {
    return [coach.coachName].concat(coach.aliases || []).some(function(alias) {
      const normalized = dashboardCsmComparable_(alias);
      return normalized && (candidate === normalized || candidate.indexOf(normalized) !== -1 || normalized.indexOf(candidate) !== -1);
    });
  }) || null;
}

function dashboardCsmLooksLikeClientName_(value) {
  const clean = String(value || '').trim();
  const key = dashboardCsmComparable_(clean);
  if (!clean || clean.length < 3) return false;
  if (['clientsactuels', 'name', 'nom', 'na'].indexOf(key) !== -1) return false;
  return true;
}

function dashboardCsmNormalizePhone_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') return digits.slice(1);
  return digits;
}

function dashboardCsmNameKey_(value) {
  return dashboardCsmComparable_(value);
}

function dashboardCsmHeaderKey_(value) {
  return dashboardCsmComparable_(String(value || '').split('\n')[0]);
}

function dashboardCsmComparable_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
