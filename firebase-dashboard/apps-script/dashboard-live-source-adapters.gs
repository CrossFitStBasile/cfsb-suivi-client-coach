/**
 * Dashboard Coach CFSB - live source adapters.
 *
 * Copy this file next to dashboard-import-bridge-template.gs in a private
 * Apps Script project. These helpers transform rows already available inside
 * a live extractor into Firebase import payloads.
 *
 * Principle:
 * - Preview first with previewDashboardImportPayload_.
 * - Write only after the preview looks correct.
 * - Do not paste secrets, tokenized Apps Script URLs, or client snapshots here.
 * - Do not force a Google Sheet between a live extractor and Firestore when the
 *   extractor already has the rows.
 */

const CFSB_PILOT_COACHES = {
  '15935': { coachRxId: '15935', coachName: 'Marc-Andre Menard' },
  '15928': { coachRxId: '15928', coachName: 'Iheb Yahyaoui' },
  '17242': { coachRxId: '17242', coachName: 'Camille Proulx' },
  '15902': { coachRxId: '15902', coachName: 'David Olivier' },
  '15893': { coachRxId: '15893', coachName: 'Gabriel Mayer Bedard' },
  '15937': { coachRxId: '15937', coachName: 'Hugo Lelievre' },
  '15936': { coachRxId: '15936', coachName: 'Raphael Samson' }
};

const CFSB_SOURCE_FIELD_ALIASES = {
  clientName: ['clientName', 'client_name', 'client', 'Client', 'name', 'Name', 'nom', 'Nom', 'athlete', 'member', 'membre'],
  phone: ['phone', 'Phone', 'telephone', 'Telephone', 'téléphone', 'client_phone_normalized', 'phone_normalized', 'Mobile', 'cell'],
  email: ['email', 'Email', 'courriel', 'Courriel', 'client_email'],
  sourceClientId: ['sourceClientId', 'source_client_id', 'Client ID', 'Athlete ID', 'id', 'ID', 'contactId', 'contact_id'],
  membership: ['membership', 'Membership', 'activePackage', 'Active package', 'Package', 'Abonnement'],
  coachName: ['coachName', 'coach_name', 'coach', 'Coach', 'entraineur', 'trainer'],
  submittedAt: ['submittedAt', 'submitted_at', 'received_at', 'timestamp', 'Timestamp', 'date'],
  triageStatus: ['triageStatus', 'triage_status', 'status', 'Statut', 'couleur'],
  coachActionType: ['coachActionType', 'coach_action_type', 'action', 'Action'],
  openNote: ['openNote', 'open_note', 'note', 'Note', 'commentaire'],
  appointmentAt: ['appointmentAt', 'appointment_at', 'date', 'Date', 'sessionDate', 'rdv'],
  service: ['service', 'Service', 'type', 'Type'],
  checkupAt: ['checkupAt', 'checkup_at', 'submitted_at', 'date', 'Date']
};

function buildDashboardSourcePayload_(sourceType, coachKey, rawRows, options) {
  const coach = resolveDashboardPilotCoach_(coachKey, options);
  const records = normalizeDashboardRows_(rawRows || [], options && options.fieldAliases);
  return {
    sourceType,
    coachRxId: coach.coachRxId,
    coachName: coach.coachName,
    sourceRunId: options && options.sourceRunId ? String(options.sourceRunId) : makeDashboardSourceRunId_(sourceType, coach.coachRxId),
    sourceGeneratedAt: new Date().toISOString(),
    records
  };
}

function previewCoachRxClientsForDashboard_(coachKey, rawRows) {
  return previewDashboardImportPayload_(buildDashboardSourcePayload_('coachrx_clients', coachKey, rawRows));
}

function pushCoachRxClientsForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('coachrx_clients', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return pushDashboardSourceToFirebase_(payload);
}

function previewClientDirectoryForDashboard_(coachKey, rawRows) {
  return previewDashboardImportPayload_(buildDashboardSourcePayload_('client_directory', coachKey, rawRows));
}

function previewClientEnrichmentForDashboard_(coachKey, rawRows) {
  return previewDashboardImportPayload_(buildDashboardSourcePayload_('client_enrichment', coachKey, rawRows));
}

function pushClientDirectoryForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('client_directory', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return pushDashboardSourceToFirebase_(payload);
}

function pushClientEnrichmentForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('client_enrichment', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return pushDashboardSourceToFirebase_(payload);
}

function previewQuestionnaireResponsesForDashboard_(coachKey, rawRows) {
  return previewDashboardImportPayload_(buildDashboardSourcePayload_('questionnaire_responses', coachKey, rawRows));
}

function pushQuestionnaireResponsesForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('questionnaire_responses', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return pushDashboardSourceToFirebase_(payload);
}

function previewCheckupsForDashboard_(coachKey, rawRows) {
  return previewDashboardImportPayload_(buildDashboardSourcePayload_('checkups', coachKey, rawRows));
}

function pushCheckupsForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('checkups', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return pushDashboardSourceToFirebase_(payload);
}

function previewRebookingsForDashboard_(coachKey, rawRows) {
  return previewDashboardImportPayload_(buildDashboardSourcePayload_('rebooking', coachKey, rawRows));
}

function pushRebookingsForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('rebooking', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return pushDashboardSourceToFirebase_(payload);
}

function previewGhlContactsForDashboard_(coachKey, rawRows) {
  return previewDashboardImportPayload_(buildDashboardSourcePayload_('ghl_contacts', coachKey, rawRows));
}

function pushGhlContactsForDashboard_(coachKey, rawRows) {
  const payload = buildDashboardSourcePayload_('ghl_contacts', coachKey, rawRows);
  previewDashboardImportPayload_(payload);
  return pushDashboardSourceToFirebase_(payload);
}

function normalizeDashboardRows_(rawRows, customAliases) {
  const aliases = Object.assign({}, CFSB_SOURCE_FIELD_ALIASES, customAliases || {});
  return rawRows
    .filter(function(row) { return row && typeof row === 'object'; })
    .map(function(row) {
      const record = Object.assign({}, row);
      Object.keys(aliases).forEach(function(targetKey) {
        const value = firstDashboardValue_(row, aliases[targetKey]);
        if (value !== '' && value !== null && typeof value !== 'undefined' && !record[targetKey]) {
          record[targetKey] = value;
        }
      });
      if (record.phone) {
        record.phoneNormalized = normalizeDashboardPhone_(record.phone);
      }
      return record;
    });
}

function firstDashboardValue_(row, keys) {
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== '' && value !== null && typeof value !== 'undefined') return value;
    }
  }
  return '';
}

function normalizeDashboardPhone_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') return digits.slice(1);
  return digits;
}

function resolveDashboardPilotCoach_(coachKey, options) {
  const explicit = options && options.coach ? options.coach : null;
  if (explicit && (explicit.coachRxId || explicit.coachName)) {
    return {
      coachRxId: String(explicit.coachRxId || explicit.coachId || coachKey || '').trim(),
      coachName: String(explicit.coachName || explicit.name || '').trim()
    };
  }

  const normalizedKey = String(coachKey || '').trim();
  const byId = CFSB_PILOT_COACHES[normalizedKey];
  if (byId) return byId;

  const lowerKey = normalizedKey.toLowerCase();
  const matchedId = Object.keys(CFSB_PILOT_COACHES).find(function(id) {
    return CFSB_PILOT_COACHES[id].coachName.toLowerCase() === lowerKey;
  });
  if (matchedId) return CFSB_PILOT_COACHES[matchedId];

  throw new Error('Coach pilote non reconnu pour import dashboard: ' + normalizedKey);
}

function makeDashboardSourceRunId_(sourceType, coachRxId) {
  return [
    sourceType,
    coachRxId || 'unknown-coach',
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss')
  ].join('-');
}
