const CONFIG = {
  source: 'cfsb-client-coach-questionnaire',
  schemaVersion: '1.2',
  supportedSchemaVersions: ['1.0', '1.1', '1.2'],
  responsesSpreadsheetId: '11QO5GOQGHCpT8_nLEgKHqjFFsZ4emPwZEt2Vlu3WRJo',
  responsesSheetName: 'Responses',
  tokensSheetName: 'Submission_Tokens',
  logSheetName: 'Endpoint_Log',
  dashboardSpreadsheetId: '18-S_a5L6fXYZXtcgHBlCKpcygmnr5Ekj_WM5358KZ7E',
  dashboardResponsesSheetName: 'SRC_ClientCoach_Responses'
};

const RESPONSE_HEADERS = [
  'response_id',
  'submitted_at',
  'received_at',
  'source',
  'schema_version',
  'submission_token',
  'client_id',
  'client_name',
  'client_email',
  'client_phone',
  'client_phone_normalized',
  'coach_id',
  'coach_name',
  'service_type',
  'followup_type',
  'general_state',
  'motivation_level',
  'goal_status',
  'goal_clarity_score',
  'progress_toward_goal',
  'recent_success',
  'recent_success_type',
  'last_30_days_attendance',
  'results_satisfaction_score',
  'current_challenges',
  'upcoming_changes',
  'upcoming_changes_details',
  'goal_change_detail',
  'program_fit',
  'program_adjustment_detail',
  'improvements_requested',
  'pain_status',
  'pain_detail',
  'support_needed',
  'open_note',
  'final_position',
  'contact_request',
  'triage_status',
  'coach_action_type',
  'coach_action_done',
  'coach_action_note',
  'dashboard_sync_status',
  'chat_notification_status',
  'meta_source_app',
  'meta_source_version',
  'meta_source_url',
  'raw_payload_json'
];

const DASHBOARD_RESPONSE_HEADERS = RESPONSE_HEADERS.concat(['response_source_tab']);

const TOKEN_HEADERS = [
  'submission_token',
  'status',
  'created_at',
  'expires_at',
  'client_id',
  'client_name',
  'client_email',
  'coach_id',
  'coach_name',
  'service_type',
  'source_system',
  'created_by',
  'used_at',
  'last_response_id',
  'notes'
];

const LOG_HEADERS = [
  'timestamp',
  'level',
  'event',
  'response_id',
  'submission_token',
  'message',
  'details_json'
];

const ROADMAP_CONFIG = {
  project: 'roadmap-trimestrielle-cfsb',
  spreadsheetId: '10tuL80y4XtGlov5PE9wrQTSE7WDBXQ0S42maG10mSZE',
  submissionsSheetName: 'Submissions',
  responsesSheetName: 'Responses',
  coachAspirationsSheetName: 'Coach_Aspirations',
  ownerAssessmentsSheetName: 'Owner_Assessments',
  adminActionsSheetName: 'Submission_Admin_Actions',
  submissionLogSheetName: 'Submission_Log',
  teamMembersSheetName: 'Team_Members'
};

const ROADMAP_CHAT_WEBHOOK_PROPERTY = 'ROADMAP_CHAT_WEBHOOK_URL';
const ROADMAP_OWNER_DASHBOARD_URL = 'https://crossfitstbasile.github.io/cfsb-suivi-client-coach/roadmap/web/owners.html';
const ROADMAP_EMPLOYEE_FORM_URL = 'https://crossfitstbasile.github.io/cfsb-suivi-client-coach/roadmap/web/index.html';

const ROADMAP_HEADERS = {
  Submissions: [
    'submission_id',
    'submitted_at',
    'quarter',
    'status',
    'employee_name',
    'employee_email',
    'selected_role_id',
    'selected_role_label',
    'config_version',
    'raw_json',
    'client_submission_id',
    'resumed_from_submission_id'
  ],
  Responses: [
    'response_id',
    'submission_id',
    'question_id',
    'answer'
  ],
  Coach_Aspirations: [
    'aspiration_id',
    'submission_id',
    'employee_name',
    'current_role_id',
    'aspired_pathway_id',
    'motivation',
    'readiness',
    'perceived_gaps',
    'support_requested',
    'next_step'
  ],
  Owner_Assessments: [
    'owner_assessment_id',
    'submission_id',
    'updated_at',
    'owner_reviewer',
    'owner_people_values',
    'owner_gwc',
    'owner_performance',
    'owner_priority_topics',
    'owner_questions',
    'owner_meeting_format',
    'owner_direction_commitments',
    'owner_followup_notes',
    'raw_json'
  ],
  Submission_Admin_Actions: [
    'action_id',
    'submission_id',
    'action',
    'updated_at',
    'actor',
    'reason',
    'raw_json'
  ],
  Submission_Log: [
    'timestamp',
    'event_type',
    'submission_id',
    'status',
    'message',
    'raw_json'
  ],
  Team_Members: [
    'member_id',
    'name',
    'department_id',
    'department_label',
    'role_ids',
    'display_title',
    'sort_order',
    'active',
    'updated_at',
    'raw_json'
  ]
};

const ROADMAP_TEAM_DEPARTMENTS = [
  { id: 'direction', label: 'Direction', className: 'owners', sortOrder: 10 },
  { id: 'operations', label: 'Operations', className: 'operations', sortOrder: 20 },
  { id: 'coaching', label: 'Coaching', className: 'coaching', sortOrder: 30 },
  { id: 'support', label: 'Communaute et support', className: 'support', sortOrder: 40 }
];

const ROADMAP_DEFAULT_TEAM_MEMBERS = [
  { member_id: 'michael-grondin', name: 'Michael Grondin', department_id: 'direction', role_ids: 'owner', display_title: 'Proprietaire - Ventes, marketing, vision', sort_order: 10 },
  { member_id: 'gabriel-mayer-bedard', name: 'Gabriel Mayer Bedard', department_id: 'direction', role_ids: 'owner', display_title: 'Proprietaire - Operations, finances, RH, integration', sort_order: 20 },
  { member_id: 'caroline-martineau', name: 'Caroline Martineau', department_id: 'operations', role_ids: 'coordinatrice', display_title: 'Chef d equipe, coordination, ventes', sort_order: 10 },
  { member_id: 'tiffany-bolduc-brossier', name: 'Tiffany Bolduc-Brossier', department_id: 'operations', role_ids: 'admin_autre', display_title: 'Conciliation de la paie', sort_order: 20 },
  { member_id: 'hugo-lelievre', name: 'Hugo Lelievre', department_id: 'coaching', role_ids: 'head_coach', display_title: 'Coach en chef, formateur', sort_order: 10 },
  { member_id: 'marc-andre-menard', name: 'Marc-Andre Menard', department_id: 'coaching', role_ids: 'coach_professionnel', display_title: 'Coach professionnel', sort_order: 20 },
  { member_id: 'raphael-samson', name: 'Raphael Samson', department_id: 'coaching', role_ids: 'coach_professionnel', display_title: 'Coach professionnel', sort_order: 30 },
  { member_id: 'camille-proulx', name: 'Camille Proulx', department_id: 'coaching', role_ids: 'coach_professionnel', display_title: 'Coach professionnel', sort_order: 40 },
  { member_id: 'david-olivier', name: 'David Olivier', department_id: 'coaching', role_ids: 'coach_professionnel', display_title: 'Coach professionnel', sort_order: 50 },
  { member_id: 'iheb-yahyaoui', name: 'Iheb Yahyaoui', department_id: 'coaching', role_ids: 'coach_professionnel', display_title: 'Coach professionnel', sort_order: 60 },
  { member_id: 'roxanne-vincent', name: 'Roxanne Vincent', department_id: 'coaching', role_ids: 'coach_developpement', display_title: 'Coach developpement', sort_order: 70 },
  { member_id: 'nathan-goupil', name: 'Nathan Goupil', department_id: 'coaching', role_ids: 'coach_developpement', display_title: 'Coach developpement', sort_order: 80 },
  { member_id: 'chloe-willis', name: 'Chloe Willis', department_id: 'coaching', role_ids: 'coach_developpement', display_title: 'Coach developpement', sort_order: 90 },
  { member_id: 'serge-thibault', name: 'Serge Thibault', department_id: 'coaching', role_ids: 'coach_communaute', display_title: 'Coach communaute', sort_order: 100 },
  { member_id: 'kim-theriault', name: 'Kim Theriault', department_id: 'coaching', role_ids: 'coach_communaute', display_title: 'Coach communaute', sort_order: 110 },
  { member_id: 'jean-sylvain-cote', name: 'Jean-Sylvain Cote', department_id: 'coaching', role_ids: 'coach_communaute', display_title: 'Coach communaute', sort_order: 120 },
  { member_id: 'karolina-milewska', name: 'Karolina Milewska', department_id: 'support', role_ids: 'engagement_evenements', display_title: 'Gestionnaire Club Social', sort_order: 10 },
  { member_id: 'lysanne-gosselin', name: 'Lysanne Gosselin', department_id: 'support', role_ids: 'entretien_menager', display_title: 'Entretien menager', sort_order: 20 },
  { member_id: 'michel-jasen-mallet', name: 'Michel Jasen Mallet', department_id: 'support', role_ids: 'entretien_menager', display_title: 'Entretien menager', sort_order: 30 },
  { member_id: 'valerie-savard', name: 'Valerie Savard', department_id: 'support', role_ids: 'admin_autre', display_title: 'Equipe CFSB', sort_order: 40 }
];

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'questionnaire_receipt') {
    const result = questionnaireReceipt_(params);
    return params.callback ? jsonp_(params.callback, result) : json_(result);
  }

  if (params.action === 'roadmap_owners_bridge') {
    return roadmapOwnersBridge_(params);
  }

  if (params.action === 'list_roadmap_submissions') {
    const result = listRoadmapSubmissions_(params);
    return params.callback ? jsonp_(params.callback, result) : json_(result);
  }

  if (params.action === 'get_roadmap_submission') {
    const result = getRoadmapSubmission_(params);
    return params.callback ? jsonp_(params.callback, result) : json_(result);
  }

  if (params.action === 'list_team_members') {
    const result = listRoadmapTeamMembers_(params);
    return params.callback ? jsonp_(params.callback, result) : json_(result);
  }

  const result = {
    ok: true,
    app: 'CFSB Client Coach Questionnaire Endpoint',
    source: CONFIG.source,
    schema_version: CONFIG.schemaVersion,
    supported_schema_versions: CONFIG.supportedSchemaVersions,
    status: 'ready',
    supported_projects: [CONFIG.source, ROADMAP_CONFIG.project]
  };

  return params.callback ? jsonp_(params.callback, result) : json_(result);
}

function questionnaireReceipt_(params) {
  const responseId = String((params && params.response_id) || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(responseId)) {
    return { ok: true, stored: false };
  }

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.responsesSheetName);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
    return { ok: true, stored: false };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map((header) => String(header || '').trim());
  const responseIdColumn = headers.indexOf('response_id') + 1;
  if (!responseIdColumn) return { ok: true, stored: false };

  const found = sheet
    .getRange(2, responseIdColumn, sheet.getLastRow() - 1, 1)
    .createTextFinder(responseId)
    .matchEntireCell(true)
    .findNext();
  return found
    ? { ok: true, stored: true, response_id: responseId }
    : { ok: true, stored: false };
}

function roadmapOwnersBridge_(params) {
  const result = listRoadmapSubmissions_(params || {});
  const message = JSON.stringify({
    source: 'cfsb-roadmap-owners-bridge',
    payload: result
  });
  const html = [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<script>',
    'var message = ', message, ';',
    'window.name = JSON.stringify(message);',
    'function sendBridgeMessage(){',
    'try { window.parent.postMessage(message, "*"); } catch (error) {}',
    'try { window.top.postMessage(message, "*"); } catch (error) {}',
    '}',
    'sendBridgeMessage();',
    'setTimeout(sendBridgeMessage, 250);',
    'setTimeout(sendBridgeMessage, 1000);',
    '</script>',
    '</body></html>'
  ].join('');

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('CFSB Roadmap Owners Bridge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const receivedAt = new Date();
  let payload;

  try {
    payload = parsePayload_(e);
    if (payload.action === 'save_owner_notes') return saveRoadmapOwnerNotes_(payload, receivedAt);
    if (payload.action === 'archive_roadmap_submission') return archiveRoadmapSubmission_(payload, receivedAt);
    if (payload.action === 'save_team_member') return saveRoadmapTeamMember_(payload, receivedAt);
    if (payload.project === ROADMAP_CONFIG.project) return saveRoadmapSubmission_(payload, receivedAt);

    validatePayload_(payload);

    const tokenRecord = payload.submission_token ? findToken_(payload.submission_token) : fallbackTokenRecord_(payload);
    if (payload.submission_token) validateToken_(tokenRecord, payload);

    const normalized = normalizeSubmission_(payload, tokenRecord, receivedAt);
    const responseWrite = appendResponse_(normalized);
    const storedResponse = responseWrite.record;
    const dashboardMirror = mirrorResponseToDashboardSafely_(storedResponse, CONFIG.responsesSheetName);
    const firestoreQueue = queueQuestionnaireResponseToDashboardSafely_(storedResponse, CONFIG.responsesSheetName);
    if (payload.submission_token) markTokenUsed_(payload.submission_token, storedResponse.response_id, receivedAt);
    log_('INFO', 'submission_received', storedResponse.response_id, payload.submission_token, 'Submission stored.', {
      response_write_status: responseWrite.status,
      triage_status: storedResponse.triage_status,
      client_id: storedResponse.client_id,
      coach_id: storedResponse.coach_id,
      dashboard_mirror_status: dashboardMirror.status,
      firestore_queue_status: firestoreQueue.status,
      firestore_queue_request_id: firestoreQueue.requestId || '',
      dashboard_mirror_error: dashboardMirror.error || '',
      firestore_queue_error: firestoreQueue.error || '',
    });

    return json_({
      ok: true,
      stored: true,
      response_id: storedResponse.response_id,
      response_write_status: responseWrite.status,
      triage_status: storedResponse.triage_status,
      coach_action_type: storedResponse.coach_action_type,
      dashboard_mirror_status: dashboardMirror.status,
      firestore_queue_status: firestoreQueue.status,
      firestore_queue_request_id: firestoreQueue.requestId || ''
    });
  } catch (error) {
    const responseId = payload && payload.response_id ? payload.response_id : '';
    const token = payload && payload.submission_token ? payload.submission_token : '';
    log_('ERROR', 'submission_rejected', responseId, token, error.message, { stack: error.stack || '' });
    return json_({
      ok: false,
      error: error.message
    });
  }
}

function saveRoadmapSubmission_(payload, receivedAt) {
  validateRoadmapPayload_(payload);
  setupRoadmapSheets_();

  const clientSubmissionId = payload.clientSubmissionId || '';
  if (clientSubmissionId) {
    const existing = findRoadmapSubmissionByClientId_(clientSubmissionId);
    if (existing && existing.submission_id) {
      logRoadmap_('DUPLICATE_IGNORED', existing.submission_id, 'ok', 'Duplicate roadmap submission ignored', payload);
      return json_({
        ok: true,
        project: ROADMAP_CONFIG.project,
        submissionId: existing.submission_id,
        duplicate: true,
        message: 'Duplicate roadmap submission ignored'
      });
    }
  }

  const submissionId = Utilities.getUuid();
  const answers = payload.answers || {};
  const employeeName = answers.employee_name || '';
  const employeeEmail = answers.employee_email || '';

  appendObject_(getRoadmapSheet_(ROADMAP_CONFIG.submissionsSheetName), ROADMAP_HEADERS.Submissions, {
    submission_id: submissionId,
    submitted_at: payload.submittedAt || receivedAt.toISOString(),
    quarter: payload.quarter || '',
    status: payload.status || 'submitted',
    employee_name: employeeName,
    employee_email: employeeEmail,
    selected_role_id: payload.selectedRoleId || '',
    selected_role_label: payload.selectedRoleLabel || '',
    config_version: payload.configVersion || '',
    raw_json: JSON.stringify(payload),
    client_submission_id: clientSubmissionId,
    resumed_from_submission_id: payload.resumeSubmissionId || ''
  });

  Object.keys(answers).forEach((questionId) => {
    appendObject_(getRoadmapSheet_(ROADMAP_CONFIG.responsesSheetName), ROADMAP_HEADERS.Responses, {
      response_id: Utilities.getUuid(),
      submission_id: submissionId,
      question_id: questionId,
      answer: normalizeRoadmapAnswer_(answers[questionId])
    });
  });

  if (answers.coach_aspiration_select && answers.coach_aspiration_select !== 'none') {
    appendObject_(getRoadmapSheet_(ROADMAP_CONFIG.coachAspirationsSheetName), ROADMAP_HEADERS.Coach_Aspirations, {
      aspiration_id: Utilities.getUuid(),
      submission_id: submissionId,
      employee_name: employeeName,
      current_role_id: payload.selectedRoleId || '',
      aspired_pathway_id: answers.coach_aspiration_select || '',
      motivation: answers.coach_aspiration_why || '',
      readiness: answers.coach_aspiration_readiness || '',
      perceived_gaps: answers.coach_aspiration_gap || '',
      support_requested: answers.coach_aspiration_support || '',
      next_step: answers.coach_aspiration_next_step || ''
    });
  }

  logRoadmap_('SUBMISSION_CREATED', submissionId, 'ok', 'Roadmap submission saved', payload);

  if (payload.resumeSubmissionId) {
    appendObject_(getRoadmapSheet_(ROADMAP_CONFIG.adminActionsSheetName), ROADMAP_HEADERS.Submission_Admin_Actions, {
      action_id: Utilities.getUuid(),
      submission_id: payload.resumeSubmissionId,
      action: 'archived',
      updated_at: receivedAt.toISOString(),
      actor: 'employee_resume_flow',
      reason: 'Replaced by resumed submission ' + submissionId,
      raw_json: JSON.stringify({
        action: 'archive_replaced_submission',
        oldSubmissionId: payload.resumeSubmissionId,
        newSubmissionId: submissionId
      })
    });
    logRoadmap_('SUBMISSION_REPLACED_BY_RESUME', payload.resumeSubmissionId, 'ok', 'Original submission archived after resume flow', {
      oldSubmissionId: payload.resumeSubmissionId,
      newSubmissionId: submissionId
    });
  }

  notifyRoadmapSubmission_(submissionId, payload);

  return json_({
    ok: true,
    project: ROADMAP_CONFIG.project,
    submissionId,
    message: 'Roadmap submission saved'
  });
}


function configureRoadmapChatWebhook(webhookUrl) {
  const value = String(webhookUrl || '').trim();
  if (value.indexOf('https://chat.googleapis.com/v1/spaces/') !== 0) {
    throw new Error('Invalid Google Chat webhook URL.');
  }
  PropertiesService.getScriptProperties().setProperty(ROADMAP_CHAT_WEBHOOK_PROPERTY, value);
  return {
    ok: true,
    property: ROADMAP_CHAT_WEBHOOK_PROPERTY,
    configuredAt: new Date().toISOString()
  };
}

function testRoadmapChatNotificationSetup() {
  const payload = {
    project: ROADMAP_CONFIG.project,
    selectedRoleId: 'test-roadmap-chat',
    selectedRoleLabel: 'Test notification Roadmap',
    quarter: 'Test',
    submittedAt: new Date().toISOString(),
    answers: {
      employee_name: 'Test Bob Operator',
      employee_email: '',
      roadmap_next_focus: 'Validation de la notification Google Chat.',
      gwc_gets_it: 'Oui',
      gwc_wants_it: 'Oui',
      gwc_capacity: 'Oui'
    }
  };
  return notifyRoadmapSubmission_('test-chat-' + Utilities.getUuid(), payload);
}

function notifyRoadmapSubmission_(submissionId, payload) {
  try {
    const webhookUrl = PropertiesService.getScriptProperties().getProperty(ROADMAP_CHAT_WEBHOOK_PROPERTY);
    if (!webhookUrl) {
      logRoadmap_('ROADMAP_CHAT_SKIPPED', submissionId, 'warning', 'Roadmap Chat webhook not configured', {});
      return { ok: false, skipped: true };
    }

    const answers = (payload && payload.answers) || {};
    const employeeName = String(answers.employee_name || 'Nom non fourni');
    const role = String(payload.selectedRoleLabel || payload.selectedRoleId || 'Role non fourni');
    const quarter = String(payload.quarter || 'Non precise');
    const submittedAt = formatRoadmapChatDate_(payload.submittedAt || new Date().toISOString());
    const summary = buildRoadmapChatSummary_(payload);
    const lines = [
      'Roadmap complete',
      '',
      'Coach: ' + employeeName,
      'Role: ' + role,
      'Trimestre: ' + quarter,
      'Soumis: ' + submittedAt,
      ''
    ];
    if (summary) {
      lines.push('Signaux rapides:');
      lines.push(summary);
    } else {
      lines.push('Signaux rapides: aucun signal automatique majeur detecte.');
    }
    lines.push('');
    lines.push('Dashboard owners: ' + ROADMAP_OWNER_DASHBOARD_URL);
    lines.push('Lien de reprise au besoin: ' + ROADMAP_EMPLOYEE_FORM_URL + '?resume=' + encodeURIComponent(submissionId));

    const response = UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({ text: lines.join(String.fromCharCode(10)) })
    });

    const responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
      throw new Error('Google Chat webhook returned ' + responseCode + ': ' + response.getContentText());
    }

    logRoadmap_('ROADMAP_CHAT_SENT', submissionId, 'ok', 'Roadmap Chat notification sent', {
      employeeName: employeeName,
      role: role,
      quarter: quarter,
      responseCode: responseCode
    });
    return { ok: true, responseCode: responseCode };
  } catch (error) {
    logRoadmap_('ROADMAP_CHAT_ERROR', submissionId, 'error', error.message || String(error), {
      stack: error.stack || ''
    });
    return { ok: false, error: error.message || String(error) };
  }
}

function buildRoadmapChatSummary_(payload) {
  const answers = (payload && payload.answers) || {};
  const bullets = [];
  const lowScores = [];
  const supportFlags = [];
  const projectionKeys = [
    'roadmap_next_focus',
    'next_objectives',
    'one_year_contribution',
    'why_one_year_contribution',
    'coach_revenue_target',
    'coach_aspiration_next_step'
  ];

  Object.keys(answers).forEach(function(questionId) {
    const value = answers[questionId];
    if (value === null || typeof value === 'undefined' || value === '') return;
    const numeric = Number(value);
    if (/(_score|score_|standard)/i.test(questionId) && !Number.isNaN(numeric) && numeric > 0 && numeric <= 2) {
      lowScores.push(readableRoadmapQuestionId_(questionId));
    }

    const normalizedValue = normalizeRoadmapSignalText_(value);
    if (/^(gwc_|leadership_|mentor_|system_|team_)/i.test(questionId)
        && (normalizedValue.indexOf('non') !== -1
          || normalizedValue.indexOf('partiellement') !== -1
          || normalizedValue.indexOf('amelioration') !== -1
          || normalizedValue.indexOf('ne correspond') !== -1)) {
      supportFlags.push(readableRoadmapQuestionId_(questionId) + ': ' + truncateRoadmapText_(roadmapValueLabel_(value), 80));
    }
  });

  if (lowScores.length) {
    bullets.push(lowScores.length + ' reponse(s) cotee(s) 1-2 a discuter. Exemples: ' + lowScores.slice(0, 4).join(', '));
  }
  if (supportFlags.length) {
    bullets.push('GWC / leadership / systemes a clarifier: ' + supportFlags.slice(0, 3).join(' | '));
  }

  projectionKeys.some(function(key) {
    if (!answers[key]) return false;
    bullets.push('Projection / prochain focus: ' + truncateRoadmapText_(roadmapValueLabel_(answers[key]), 220));
    return true;
  });

  if (answers.coach_aspiration_select && answers.coach_aspiration_select !== 'none') {
    bullets.push('Aspirations internes: ' + truncateRoadmapText_(roadmapValueLabel_(answers.coach_aspiration_select), 120));
  }

  return bullets.map(function(item) { return '- ' + item; }).join(String.fromCharCode(10));
}

function formatRoadmapChatDate_(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return Utilities.formatDate(date, 'America/Toronto', 'yyyy-MM-dd HH:mm');
}

function normalizeRoadmapSignalText_(value) {
  return roadmapValueLabel_(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function readableRoadmapQuestionId_(questionId) {
  return String(questionId || '')
    .replace(/^(values_|professionalism_|leadership_|mentor_|system_|team_|gwc_)/i, '')
    .replace(/_score$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 80) || 'Question';
}

function roadmapValueLabel_(value) {
  if (value === null || typeof value === 'undefined') return '';
  if (Array.isArray(value)) return value.map(roadmapValueLabel_).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function truncateRoadmapText_(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const limit = maxLength || 160;
  return text.length > limit ? text.slice(0, limit - 3) + '...' : text;
}

function saveRoadmapOwnerNotes_(payload, receivedAt) {
  if (!payload.submissionId) throw new Error('Missing submissionId for owner notes.');
  setupRoadmapSheets_();
  const notes = payload.ownerNotes || {};

  appendObject_(getRoadmapSheet_(ROADMAP_CONFIG.ownerAssessmentsSheetName), ROADMAP_HEADERS.Owner_Assessments, {
    owner_assessment_id: Utilities.getUuid(),
    submission_id: payload.submissionId,
    updated_at: receivedAt.toISOString(),
    owner_reviewer: notes.owner_reviewer || '',
    owner_people_values: notes.owner_people_values || '',
    owner_gwc: notes.owner_gwc || '',
    owner_performance: notes.owner_performance || '',
    owner_priority_topics: notes.owner_priority_topics || '',
    owner_questions: notes.owner_questions || '',
    owner_meeting_format: notes.owner_meeting_format || '',
    owner_direction_commitments: notes.owner_direction_commitments || '',
    owner_followup_notes: notes.owner_followup_notes || '',
    raw_json: JSON.stringify(payload)
  });

  logRoadmap_('OWNER_NOTES_CREATED', payload.submissionId, 'ok', 'Owner notes saved', payload);

  return json_({
    ok: true,
    project: ROADMAP_CONFIG.project,
    submissionId: payload.submissionId,
    message: 'Owner notes saved'
  });
}

function archiveRoadmapSubmission_(payload, receivedAt) {
  if (!payload.submissionId) throw new Error('Missing submissionId for archive action.');
  setupRoadmapSheets_();

  appendObject_(getRoadmapSheet_(ROADMAP_CONFIG.adminActionsSheetName), ROADMAP_HEADERS.Submission_Admin_Actions, {
    action_id: Utilities.getUuid(),
    submission_id: payload.submissionId,
    action: 'archived',
    updated_at: receivedAt.toISOString(),
    actor: payload.actor || '',
    reason: payload.reason || '',
    raw_json: JSON.stringify(payload)
  });

  logRoadmap_('SUBMISSION_ARCHIVED', payload.submissionId, 'ok', 'Roadmap submission archived', payload);

  return json_({
    ok: true,
    project: ROADMAP_CONFIG.project,
    submissionId: payload.submissionId,
    message: 'Roadmap submission archived'
  });
}

function listRoadmapSubmissions_(params) {
  setupRoadmapSheets_();

  const limit = Math.max(1, Math.min(Number(params.limit || 100), 250));
  const submissions = sheetObjects_(getRoadmapSheet_(ROADMAP_CONFIG.submissionsSheetName), ROADMAP_HEADERS.Submissions);
  const responses = sheetObjects_(getRoadmapSheet_(ROADMAP_CONFIG.responsesSheetName), ROADMAP_HEADERS.Responses);
  const ownerAssessments = sheetObjects_(getRoadmapSheet_(ROADMAP_CONFIG.ownerAssessmentsSheetName), ROADMAP_HEADERS.Owner_Assessments);
  const adminActions = sheetObjects_(getRoadmapSheet_(ROADMAP_CONFIG.adminActionsSheetName), ROADMAP_HEADERS.Submission_Admin_Actions);
  const archivedSubmissionIds = archivedRoadmapSubmissionIds_(adminActions);

  const answersBySubmission = {};
  responses.forEach((row) => {
    const submissionId = row.submission_id || '';
    if (!submissionId) return;
    if (!answersBySubmission[submissionId]) answersBySubmission[submissionId] = {};
    answersBySubmission[submissionId][row.question_id || ''] = row.answer || '';
  });

  const latestOwnerNotesBySubmission = {};
  ownerAssessments.forEach((row) => {
    const submissionId = row.submission_id || '';
    if (!submissionId) return;
    const existing = latestOwnerNotesBySubmission[submissionId];
    if (existing && String(existing.updated_at || '') > String(row.updated_at || '')) return;
    latestOwnerNotesBySubmission[submissionId] = {
      owner_reviewer: row.owner_reviewer || '',
      owner_people_values: row.owner_people_values || '',
      owner_gwc: row.owner_gwc || '',
      owner_performance: row.owner_performance || '',
      owner_priority_topics: row.owner_priority_topics || '',
      owner_questions: row.owner_questions || '',
      owner_meeting_format: row.owner_meeting_format || '',
      owner_direction_commitments: row.owner_direction_commitments || '',
      owner_followup_notes: row.owner_followup_notes || ''
    };
  });

  const items = submissions
    .map((row) => {
      const answers = answersBySubmission[row.submission_id] || {};
      if (!answers.employee_name && row.employee_name) answers.employee_name = row.employee_name;
      if (!answers.employee_email && row.employee_email) answers.employee_email = row.employee_email;

      return {
        id: row.submission_id,
        serverSubmissionId: row.submission_id,
        status: row.status || 'submitted',
        submittedAt: row.submitted_at || '',
        quarter: row.quarter || '',
        selectedRoleId: row.selected_role_id || '',
        selectedRoleLabel: row.selected_role_label || '',
        configVersion: row.config_version || '',
        answers,
        ownerNotes: latestOwnerNotesBySubmission[row.submission_id] || {}
      };
    })
    .filter((item) => item.id)
    .filter((item) => params.includeArchived === 'true' || !archivedSubmissionIds[item.id])
    .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
    .slice(0, limit);

  return {
    ok: true,
    project: ROADMAP_CONFIG.project,
    syncedAt: new Date().toISOString(),
    count: items.length,
    submissions: items
  };
}

function getRoadmapSubmission_(params) {
  setupRoadmapSheets_();
  const submissionId = params && params.submissionId ? String(params.submissionId) : '';
  if (!submissionId) throw new Error('Missing submissionId.');

  const submissions = sheetObjects_(getRoadmapSheet_(ROADMAP_CONFIG.submissionsSheetName), ROADMAP_HEADERS.Submissions);
  const row = submissions.find(function(item) {
    return String(item.submission_id || '') === submissionId;
  });
  if (!row) {
    return {
      ok: false,
      error: 'Submission not found.'
    };
  }

  const responses = sheetObjects_(getRoadmapSheet_(ROADMAP_CONFIG.responsesSheetName), ROADMAP_HEADERS.Responses);
  const answers = {};
  responses.forEach(function(response) {
    if (String(response.submission_id || '') !== submissionId) return;
    answers[response.question_id || ''] = response.answer || '';
  });
  if (!answers.employee_name && row.employee_name) answers.employee_name = row.employee_name;
  if (!answers.employee_email && row.employee_email) answers.employee_email = row.employee_email;

  return {
    ok: true,
    project: ROADMAP_CONFIG.project,
    submission: {
      id: row.submission_id,
      serverSubmissionId: row.submission_id,
      status: row.status || 'submitted',
      submittedAt: row.submitted_at || '',
      quarter: row.quarter || '',
      selectedRoleId: row.selected_role_id || '',
      selectedRoleLabel: row.selected_role_label || '',
      configVersion: row.config_version || '',
      answers: answers
    }
  };
}


function listRoadmapTeamMembers_(params) {
  setupRoadmapSheets_();
  const includeInactive = String((params && params.includeInactive) || '') === 'true';
  const rows = sheetObjects_(getRoadmapSheet_(ROADMAP_CONFIG.teamMembersSheetName), ROADMAP_HEADERS.Team_Members);
  const members = rows
    .map(normalizeRoadmapTeamMemberRow_)
    .filter(function(member) { return includeInactive || member.active; })
    .sort(sortRoadmapTeamMembers_);

  return {
    ok: true,
    project: ROADMAP_CONFIG.project,
    syncedAt: new Date().toISOString(),
    departments: ROADMAP_TEAM_DEPARTMENTS,
    count: members.length,
    members: members
  };
}

function saveRoadmapTeamMember_(payload, receivedAt) {
  setupRoadmapSheets_();
  const input = (payload && payload.teamMember) || {};
  if (!input.name) throw new Error('Missing team member name.');
  if (!input.departmentId && !input.department_id) throw new Error('Missing team member department.');

  const departmentId = String(input.departmentId || input.department_id || '').trim();
  const department = roadmapTeamDepartmentById_(departmentId);
  if (!department) throw new Error('Invalid team member department.');

  const memberId = String(input.memberId || input.member_id || makeRoadmapMemberId_(input.name)).trim();
  const roleIds = Array.isArray(input.roleIds)
    ? input.roleIds.join(',')
    : String(input.roleIds || input.role_ids || '').trim();
  const active = typeof input.active === 'boolean' ? input.active : String(input.active || 'true') !== 'false';
  const record = {
    member_id: memberId,
    name: String(input.name || '').trim(),
    department_id: department.id,
    department_label: department.label,
    role_ids: roleIds,
    display_title: String(input.displayTitle || input.display_title || '').trim(),
    sort_order: Number(input.sortOrder || input.sort_order || 999),
    active: active ? 'TRUE' : 'FALSE',
    updated_at: receivedAt.toISOString(),
    raw_json: JSON.stringify(input)
  };

  upsertRoadmapObjectByKey_(getRoadmapSheet_(ROADMAP_CONFIG.teamMembersSheetName), ROADMAP_HEADERS.Team_Members, 'member_id', memberId, record);
  logRoadmap_('TEAM_MEMBER_SAVED', memberId, 'ok', 'Roadmap team member saved', record);
  return json_({
    ok: true,
    project: ROADMAP_CONFIG.project,
    member: normalizeRoadmapTeamMemberRow_(record),
    message: 'Team member saved'
  });
}

function seedRoadmapTeamMembers_() {
  const sheet = getRoadmapSheet_(ROADMAP_CONFIG.teamMembersSheetName);
  if (sheet.getLastRow() >= 2) return;
  const now = new Date().toISOString();
  ROADMAP_DEFAULT_TEAM_MEMBERS.forEach(function(member) {
    const department = roadmapTeamDepartmentById_(member.department_id) || ROADMAP_TEAM_DEPARTMENTS[0];
    appendObject_(sheet, ROADMAP_HEADERS.Team_Members, {
      member_id: member.member_id,
      name: member.name,
      department_id: department.id,
      department_label: department.label,
      role_ids: member.role_ids || '',
      display_title: member.display_title || '',
      sort_order: member.sort_order || 999,
      active: 'TRUE',
      updated_at: now,
      raw_json: JSON.stringify(member)
    });
  });
}

function normalizeRoadmapTeamMemberRow_(row) {
  const roleText = row.role_ids || '';
  return {
    memberId: row.member_id || '',
    name: row.name || '',
    departmentId: row.department_id || '',
    departmentLabel: row.department_label || (roadmapTeamDepartmentById_(row.department_id || '') || {}).label || '',
    roleIds: String(roleText || '').split(',').map(function(item) { return item.trim(); }).filter(Boolean),
    displayTitle: row.display_title || '',
    sortOrder: Number(row.sort_order || 999),
    active: String(row.active || '').toLowerCase() !== 'false',
    updatedAt: row.updated_at || ''
  };
}

function sortRoadmapTeamMembers_(a, b) {
  const departmentA = roadmapTeamDepartmentById_(a.departmentId) || { sortOrder: 999 };
  const departmentB = roadmapTeamDepartmentById_(b.departmentId) || { sortOrder: 999 };
  if (departmentA.sortOrder !== departmentB.sortOrder) return departmentA.sortOrder - departmentB.sortOrder;
  if (Number(a.sortOrder || 999) !== Number(b.sortOrder || 999)) return Number(a.sortOrder || 999) - Number(b.sortOrder || 999);
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function roadmapTeamDepartmentById_(departmentId) {
  const id = String(departmentId || '').trim();
  for (let index = 0; index < ROADMAP_TEAM_DEPARTMENTS.length; index += 1) {
    if (ROADMAP_TEAM_DEPARTMENTS[index].id === id) return ROADMAP_TEAM_DEPARTMENTS[index];
  }
  return null;
}

function makeRoadmapMemberId_(name) {
  const normalized = String(name || 'membre')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || Utilities.getUuid();
}

function upsertRoadmapObjectByKey_(sheet, headers, keyHeader, keyValue, object) {
  ensureHeaders_(sheet, headers);
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(header) { return String(header || '').trim(); });
  const keyColumn = currentHeaders.indexOf(keyHeader) + 1;
  if (!keyColumn) throw new Error('Missing key column ' + keyHeader + '.');
  const rowValues = currentHeaders.map(function(header) { return object[header] == null ? '' : object[header]; });

  if (sheet.getLastRow() >= 2) {
    const keys = sheet.getRange(2, keyColumn, sheet.getLastRow() - 1, 1).getDisplayValues().map(function(row) { return row[0]; });
    const index = keys.findIndex(function(value) { return String(value || '') === String(keyValue || ''); });
    if (index !== -1) {
      sheet.getRange(index + 2, 1, 1, currentHeaders.length).setValues([rowValues]);
      return;
    }
  }
  sheet.appendRow(rowValues);
}

function validateRoadmapPayload_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Roadmap payload must be an object.');
  if (payload.project !== ROADMAP_CONFIG.project) throw new Error('Invalid roadmap project.');
  if (!payload.selectedRoleId) throw new Error('Missing selectedRoleId.');
  if (!payload.answers || typeof payload.answers !== 'object') throw new Error('Missing answers.');
}

function setupRoadmapSheets_() {
  const ss = SpreadsheetApp.openById(ROADMAP_CONFIG.spreadsheetId);
  ensureSheet_(ss, ROADMAP_CONFIG.submissionsSheetName, ROADMAP_HEADERS.Submissions);
  ensureSheet_(ss, ROADMAP_CONFIG.responsesSheetName, ROADMAP_HEADERS.Responses);
  ensureSheet_(ss, ROADMAP_CONFIG.coachAspirationsSheetName, ROADMAP_HEADERS.Coach_Aspirations);
  ensureSheet_(ss, ROADMAP_CONFIG.ownerAssessmentsSheetName, ROADMAP_HEADERS.Owner_Assessments);
  ensureSheet_(ss, ROADMAP_CONFIG.adminActionsSheetName, ROADMAP_HEADERS.Submission_Admin_Actions);
  ensureSheet_(ss, ROADMAP_CONFIG.submissionLogSheetName, ROADMAP_HEADERS.Submission_Log);
  ensureSheet_(ss, ROADMAP_CONFIG.teamMembersSheetName, ROADMAP_HEADERS.Team_Members);
  seedRoadmapTeamMembers_();
}

function getRoadmapSheet_(name) {
  return ensureSheet_(SpreadsheetApp.openById(ROADMAP_CONFIG.spreadsheetId), name, ROADMAP_HEADERS[name]);
}

function normalizeRoadmapAnswer_(answer) {
  if (answer === null || answer === undefined) return '';
  if (Array.isArray(answer) || typeof answer === 'object') return JSON.stringify(answer);
  return String(answer);
}

function logRoadmap_(eventType, submissionId, status, message, payload) {
  try {
    appendObject_(getRoadmapSheet_(ROADMAP_CONFIG.submissionLogSheetName), ROADMAP_HEADERS.Submission_Log, {
      timestamp: new Date().toISOString(),
      event_type: eventType,
      submission_id: submissionId || '',
      status: status || '',
      message: message || '',
      raw_json: JSON.stringify(payload || {})
    });
  } catch (error) {
    Logger.log(`ROADMAP_LOG_FAILED ${eventType}: ${error.message}`);
  }
}

function findRoadmapSubmissionByClientId_(clientSubmissionId) {
  const sheet = getRoadmapSheet_(ROADMAP_CONFIG.submissionsSheetName);
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map((header) => String(header || '').trim());
  const clientIdIndex = headers.indexOf('client_submission_id');
  if (clientIdIndex === -1) return null;
  const submissionIdIndex = headers.indexOf('submission_id');

  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][clientIdIndex] || '') === String(clientSubmissionId || '')) {
      return {
        submission_id: values[index][submissionIdIndex] || '',
        rowNumber: index + 1
      };
    }
  }

  return null;
}

function archivedRoadmapSubmissionIds_(adminActions) {
  const latest = {};
  adminActions.forEach((row) => {
    const submissionId = row.submission_id || '';
    if (!submissionId) return;
    const existing = latest[submissionId];
    if (existing && String(existing.updated_at || '') > String(row.updated_at || '')) return;
    latest[submissionId] = row;
  });

  const archived = {};
  Object.keys(latest).forEach((submissionId) => {
    if (latest[submissionId].action === 'archived') archived[submissionId] = true;
  });
  return archived;
}

function sheetObjects_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] === null || row[index] === undefined ? '' : String(row[index]);
    });
    return record;
  });
}

function setupQuestionnaireEndpoint() {
  const ss = getSpreadsheet_();
  ensureSheet_(ss, CONFIG.responsesSheetName, RESPONSE_HEADERS);
  ensureSheet_(ss, CONFIG.tokensSheetName, TOKEN_HEADERS);
  ensureSheet_(ss, CONFIG.logSheetName, LOG_HEADERS);
  ensureSheet_(SpreadsheetApp.openById(CONFIG.dashboardSpreadsheetId), CONFIG.dashboardResponsesSheetName, DASHBOARD_RESPONSE_HEADERS);

  const result = {
    ok: true,
    spreadsheetId: CONFIG.responsesSpreadsheetId,
    spreadsheetUrl: ss.getUrl(),
    dashboardSpreadsheetId: CONFIG.dashboardSpreadsheetId,
    sheets: [CONFIG.responsesSheetName, CONFIG.tokensSheetName, CONFIG.logSheetName, CONFIG.dashboardResponsesSheetName]
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function createTestSubmissionToken() {
  const token = `test_${Utilities.getUuid()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ss = getSpreadsheet_();
  const sheet = ensureSheet_(ss, CONFIG.tokensSheetName, TOKEN_HEADERS);
  const record = {
    submission_token: token,
    status: 'active',
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    client_id: 'TEST_CLIENT_001',
    client_name: 'Client Test',
    client_email: 'client.test@example.com',
    coach_id: 'TEST_COACH_001',
    coach_name: 'Coach Test',
    service_type: 'Test interne',
    source_system: 'manual_test',
    created_by: Session.getEffectiveUser().getEmail(),
    used_at: '',
    last_response_id: '',
    notes: 'Token de test cree par setup.'
  };
  appendObject_(sheet, TOKEN_HEADERS, record);
  Logger.log(JSON.stringify(record, null, 2));
  return record;
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing POST body.');
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('Invalid JSON body.');
  }
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Payload must be an object.');
  if (payload.source !== CONFIG.source) throw new Error('Invalid source.');
  if (CONFIG.supportedSchemaVersions.indexOf(String(payload.schema_version || '')) === -1) {
    throw new Error('Invalid schema_version.');
  }
  const answers = payload.answers || {};
  const meta = payload.meta || {};
  const phone = answers.client_phone_entered
    || payload.client_phone
    || payload.client_phone_normalized
    || payload.phone
    || meta.client_phone
    || meta.client_phone_normalized
    || '';
  if (!payload.submission_token && !normalizePhone_(phone)) {
    throw new Error('Missing submission_token or client phone.');
  }
  if (!payload.response_id) throw new Error('Missing response_id.');
  if (!payload.submitted_at) throw new Error('Missing submitted_at.');
  if (!payload.answers || typeof payload.answers !== 'object') throw new Error('Missing answers.');
  if (!payload.triage || typeof payload.triage !== 'object') throw new Error('Missing triage.');
  if (!payload.meta || typeof payload.meta !== 'object') throw new Error('Missing meta.');
}

function findToken_(submissionToken) {
  const ss = getSpreadsheet_();
  const sheet = ensureSheet_(ss, CONFIG.tokensSheetName, TOKEN_HEADERS);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) throw new Error('Submission_Tokens has no active tokens.');

  const headers = values[0];
  const tokenIndex = headers.indexOf('submission_token');
  if (tokenIndex === -1) throw new Error('Submission_Tokens missing submission_token column.');

  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][tokenIndex]) === String(submissionToken)) {
      return rowToObject_(headers, values[i], i + 1);
    }
  }

  throw new Error('Unknown submission_token.');
}

function validateToken_(tokenRecord, payload) {
  const status = String(tokenRecord.status || '').toLowerCase();
  const isIdempotentRetry = status === 'used'
    && String(tokenRecord.last_response_id || '') === String((payload && payload.response_id) || '');
  if (status !== 'active' && !isIdempotentRetry) {
    throw new Error('Submission token is not active.');
  }

  if (!isIdempotentRetry && tokenRecord.expires_at) {
    const expiresAt = new Date(tokenRecord.expires_at);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt < new Date()) {
      throw new Error('Submission token is expired.');
    }
  }
}

function fallbackTokenRecord_(payload) {
  const answers = payload.answers || {};
  return {
    client_id: '',
    client_name: answers.client_name_entered || payload.client_name || '',
    client_email: answers.client_email_entered || payload.client_email || '',
    client_phone: answers.client_phone_entered || payload.client_phone || payload.client_phone_normalized || '',
    coach_id: '',
    coach_name: answers.coach_name_entered || payload.coach_name || '',
    service_type: ''
  };
}

function normalizeSubmission_(payload, tokenRecord, receivedAt) {
  const answers = payload.answers || {};
  const triage = payload.triage || {};
  const meta = payload.meta || {};
  const clientPhone = tokenRecord.client_phone
    || answers.client_phone_entered
    || payload.client_phone
    || payload.client_phone_normalized
    || meta.client_phone
    || meta.client_phone_normalized
    || payload.phone
    || '';

  return {
    response_id: payload.response_id,
    submitted_at: payload.submitted_at,
    received_at: receivedAt.toISOString(),
    source: payload.source,
    schema_version: payload.schema_version,
    submission_token: payload.submission_token,
    client_id: tokenRecord.client_id || '',
    client_name: tokenRecord.client_name || answers.client_name_entered || '',
    client_email: tokenRecord.client_email || answers.client_email_entered || '',
    client_phone: clientPhone,
    client_phone_normalized: normalizePhone_(clientPhone),
    coach_id: tokenRecord.coach_id || '',
    coach_name: tokenRecord.coach_name || answers.coach_name_entered || '',
    service_type: tokenRecord.service_type || '',
    followup_type: answers.followup_type || payload.followup_type || payload.questionnaire_type || '',
    general_state: answers.general_state || '',
    motivation_level: answers.motivation_level || '',
    goal_status: answers.goal_status || '',
    goal_clarity_score: answers.goal_clarity_score || '',
    progress_toward_goal: answers.progress_toward_goal || '',
    recent_success: answers.recent_success || '',
    recent_success_type: answers.recent_success_type || answers.recent_success || '',
    last_30_days_attendance: answers.last_30_days_attendance || '',
    results_satisfaction_score: answers.results_satisfaction_score || '',
    current_challenges: arrayOrText_(answers.current_challenges),
    upcoming_changes: answers.upcoming_changes || '',
    upcoming_changes_details: answers.upcoming_changes_details || '',
    goal_change_detail: answers.goal_change_detail || '',
    program_fit: answers.program_fit || '',
    program_adjustment_detail: answers.program_adjustment_detail || '',
    improvements_requested: arrayOrText_(answers.improvements_requested),
    pain_status: answers.pain_status || '',
    pain_detail: answers.pain_detail || '',
    support_needed: arrayOrText_(answers.support_needed),
    open_note: answers.open_note || '',
    final_position: answers.final_position || '',
    contact_request: answers.contact_request || '',
    triage_status: triage.status || '',
    coach_action_type: triage.coach_action_type || '',
    coach_action_done: triage.coach_action_done === true,
    coach_action_note: triage.coach_action_note || '',
    dashboard_sync_status: triage.dashboard_sync_status || 'pending',
    chat_notification_status: triage.chat_notification_status || 'pending',
    meta_source_app: meta.source_app || '',
    meta_source_version: meta.source_version || '',
    meta_source_url: meta.source_url || '',
    raw_payload_json: JSON.stringify(payload)
  };
}

function appendResponse_(normalized) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Questionnaire storage is busy. Retry with the same response_id.');

  try {
    const ss = getSpreadsheet_();
    const sheet = ensureSheet_(ss, CONFIG.responsesSheetName, RESPONSE_HEADERS);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map((header) => String(header || '').trim());
    const responseIdColumn = headers.indexOf('response_id') + 1;
    if (!responseIdColumn) throw new Error('Responses missing response_id column.');

    if (sheet.getLastRow() >= 2) {
      const found = sheet
        .getRange(2, responseIdColumn, sheet.getLastRow() - 1, 1)
        .createTextFinder(String(normalized.response_id))
        .matchEntireCell(true)
        .findNext();
      if (found) {
        const rowNumber = found.getRow();
        const existing = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
        return {
          status: 'duplicate',
          record: rowToObject_(headers, existing, rowNumber)
        };
      }
    }

    appendObject_(sheet, RESPONSE_HEADERS, normalized);
    SpreadsheetApp.flush();
    return { status: 'created', record: normalized };
  } finally {
    lock.releaseLock();
  }
}

function mirrorResponseToDashboardSafely_(normalized, sourceTab) {
  try {
    mirrorResponseToDashboard_(normalized, sourceTab);
    return { status: 'mirrored' };
  } catch (error) {
    log_('ERROR', 'dashboard_mirror_failed', normalized && normalized.response_id, normalized && normalized.submission_token, error.message, {
      dashboardSpreadsheetId: CONFIG.dashboardSpreadsheetId,
      sourceTab,
      stack: error.stack || ''
    });
    return { status: 'error', error: error.message || String(error) };
  }
}

function mirrorResponseToDashboard_(normalized, sourceTab) {
  if (!normalized || !normalized.response_id) throw new Error('Missing response_id for dashboard mirror.');
  const ss = SpreadsheetApp.openById(CONFIG.dashboardSpreadsheetId);
  const sheet = ensureSheet_(ss, CONFIG.dashboardResponsesSheetName, DASHBOARD_RESPONSE_HEADERS);
  const object = normalizeResponseForDashboard_(normalized, sourceTab);
  upsertObjectByKey_(sheet, 'response_id', object.response_id, object);
}

function backfillDashboardQuestionnaireResponses() {
  const ss = getSpreadsheet_();
  const sourceTabs = [CONFIG.responsesSheetName, 'Test_Responses'];
  let mirrored = 0;
  const errors = [];
  sourceTabs.forEach((sourceTab) => {
    const sheet = ss.getSheetByName(sourceTab);
    if (!sheet || sheet.getLastRow() < 2) return;
    const data = sheet.getDataRange().getDisplayValues();
    const headers = data[0].map((header) => String(header || '').trim());
    data.slice(1).forEach((row) => {
      const object = rowToObject_(headers, row);
      if (!object.response_id) return;
      try {
        mirrorResponseToDashboard_(object, sourceTab);
        mirrored += 1;
      } catch (error) {
        errors.push({
          response_id: object.response_id,
          source_tab: sourceTab,
          error: error.message || String(error)
        });
      }
    });
  });
  const result = {
    ok: errors.length === 0,
    mirrored,
    errors
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function markTokenUsed_(submissionToken, responseId, receivedAt) {
  const ss = getSpreadsheet_();
  const sheet = ensureSheet_(ss, CONFIG.tokensSheetName, TOKEN_HEADERS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const tokenIndex = headers.indexOf('submission_token');
  const statusIndex = headers.indexOf('status');
  const usedAtIndex = headers.indexOf('used_at');
  const responseIdIndex = headers.indexOf('last_response_id');

  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][tokenIndex]) === String(submissionToken)) {
      if (
        statusIndex !== -1
        && String(values[i][statusIndex] || '').toLowerCase() === 'used'
        && responseIdIndex !== -1
        && String(values[i][responseIdIndex] || '') === String(responseId)
      ) {
        return;
      }
      if (statusIndex !== -1) sheet.getRange(i + 1, statusIndex + 1).setValue('used');
      if (usedAtIndex !== -1) sheet.getRange(i + 1, usedAtIndex + 1).setValue(receivedAt.toISOString());
      if (responseIdIndex !== -1) sheet.getRange(i + 1, responseIdIndex + 1).setValue(responseId);
      return;
    }
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.responsesSpreadsheetId);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const width = headers.length;
  const current = sheet.getRange(1, 1, 1, width).getValues()[0];
  const isEmpty = current.every((value) => value === '');

  if (isEmpty) {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
    sheet.getRange(1, 1, 1, width).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, width);
    return;
  }

  const missing = headers.filter((header) => current.indexOf(header) === -1);
  if (missing.length) {
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, current.length + 1, 1, missing.length).setFontWeight('bold');
    sheet.autoResizeColumns(1, current.length + missing.length);
  }
}

function appendObject_(sheet, headers, object) {
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = currentHeaders.map((header) => object[header] == null ? '' : object[header]);
  sheet.appendRow(row);
}

function upsertObjectByKey_(sheet, keyHeader, keyValue, object) {
  ensureHeaders_(sheet, DASHBOARD_RESPONSE_HEADERS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((header) => String(header || '').trim());
  const keyColumn = headers.indexOf(keyHeader) + 1;
  if (!keyColumn) throw new Error(`Missing ${keyHeader} column.`);
  const rowValues = headers.map((header) => object[header] == null ? '' : object[header]);
  if (sheet.getLastRow() >= 2) {
    const keys = sheet.getRange(2, keyColumn, sheet.getLastRow() - 1, 1).getDisplayValues().flat();
    const index = keys.findIndex((value) => String(value || '') === String(keyValue || ''));
    if (index !== -1) {
      const rowNumber = index + 2;
      const existing = rowToObject_(headers, sheet.getRange(rowNumber, 1, 1, headers.length).getDisplayValues()[0]);
      const merged = headers.map((header) => {
        if (header === 'dashboard_sync_status' && existing[header] && existing[header] !== 'pending') return existing[header];
        return object[header] == null || object[header] === '' ? existing[header] || '' : object[header];
      });
      sheet.getRange(rowNumber, 1, 1, headers.length).setValues([merged]);
      return;
    }
  }
  sheet.appendRow(rowValues);
}

function normalizeResponseForDashboard_(input, sourceTab) {
  const object = {};
  DASHBOARD_RESPONSE_HEADERS.forEach((header) => {
    object[header] = input[header] == null ? '' : input[header];
  });
  object.client_phone = object.client_phone || input.client_phone_entered || input.phone || '';
  object.client_phone_normalized = normalizePhone_(object.client_phone_normalized || object.client_phone || input.client_phone_entered || input.phone || '');
  object.client_name = object.client_name || input.client_name_entered || '';
  object.client_email = object.client_email || input.client_email_entered || '';
  object.coach_name = object.coach_name || input.coach_name_entered || '';
  object.dashboard_sync_status = object.dashboard_sync_status || 'pending';
  object.chat_notification_status = object.chat_notification_status || 'pending';
  object.response_source_tab = sourceTab || object.response_source_tab || CONFIG.responsesSheetName;
  return object;
}

function rowToObject_(headers, row, rowNumber) {
  const object = { rowNumber };
  headers.forEach((header, index) => {
    object[header] = row[index];
  });
  return object;
}

function arrayOrText_(value) {
  if (Array.isArray(value)) return value.join(', ');
  return value || '';
}

function normalizePhone_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') return digits.slice(1);
  return digits;
}

function log_(level, event, responseId, submissionToken, message, details) {
  try {
    const ss = getSpreadsheet_();
    const sheet = ensureSheet_(ss, CONFIG.logSheetName, LOG_HEADERS);
    appendObject_(sheet, LOG_HEADERS, {
      timestamp: new Date().toISOString(),
      level,
      event,
      response_id: responseId || '',
      submission_token: submissionToken || '',
      message,
      details_json: JSON.stringify(details || {})
    });
  } catch (error) {
    Logger.log(`LOG_FAILED ${event}: ${error.message}`);
  }
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonp_(callback, value) {
  const safeCallback = String(callback || '').trim();
  if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(safeCallback)) {
    return json_({ ok: false, error: 'Invalid callback.' });
  }

  return ContentService
    .createTextOutput(`${safeCallback}(${JSON.stringify(value)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}



const CFSB_QUESTIONNAIRE_FIRESTORE_QUEUE_VERSION = '20260609-questionnaire-direct-queue';
const CFSB_QUESTIONNAIRE_FIRESTORE_PROJECT_ID = 'cfsb-dashboard-coach-aa9a4';
const CFSB_QUESTIONNAIRE_FIRESTORE_DATABASE_ID = '(default)';
const CFSB_QUESTIONNAIRE_SYNC_REQUEST_COLLECTION = 'syncRequests';

const CFSB_QUESTIONNAIRE_COACH_MAP = {
  'marcandre menard': { coachRxId: '15935', coachName: 'Marc-Andre Menard' },
  'marc-andre menard': { coachRxId: '15935', coachName: 'Marc-Andre Menard' },
  'marc-andré ménard': { coachRxId: '15935', coachName: 'Marc-Andre Menard' },
  'iheb yahyaoui': { coachRxId: '15928', coachName: 'Iheb Yahyaoui' },
  'yeb yahyaoui': { coachRxId: '15928', coachName: 'Iheb Yahyaoui' },
  'camille proulx': { coachRxId: '17242', coachName: 'Camille Proulx' },
  'david olivier': { coachRxId: '15902', coachName: 'David Olivier' },
  'gabriel mayer bedard': { coachRxId: '15893', coachName: 'Gabriel Mayer Bedard' },
  'gabriel mayer bédard': { coachRxId: '15893', coachName: 'Gabriel Mayer Bedard' },
  'hugo lelievre': { coachRxId: '15937', coachName: 'Hugo Lelievre' },
  'hugo lelièvre': { coachRxId: '15937', coachName: 'Hugo Lelievre' },
  'raphael samson': { coachRxId: '15936', coachName: 'Raphael Samson' },
  'raphaël samson': { coachRxId: '15936', coachName: 'Raphael Samson' }
};

function queueQuestionnaireResponseToDashboardSafely_(normalized, sourceTab) {
  try {
    return queueQuestionnaireResponseToDashboard_(normalized, sourceTab);
  } catch (error) {
    try {
      log_('ERROR', 'firestore_queue_failed', normalized && normalized.response_id, normalized && normalized.submission_token, error.message, {
        stack: error.stack || ''
      });
    } catch (logError) {}
    return { status: 'error', error: error.message || String(error) };
  }
}

function queueQuestionnaireResponseToDashboard_(normalized, sourceTab) {
  if (!normalized || !normalized.response_id) throw new Error('Missing response_id for Firestore queue.');
  const record = normalizeResponseForDashboard_(normalized, sourceTab || (CONFIG && CONFIG.responsesSheetName) || 'Responses');
  const coach = resolveQuestionnaireDashboardCoach_(record.coach_name || normalized.coach_name || normalized.coach_id || '');
  const requestId = makeQuestionnaireDashboardRequestId_(record.response_id);
  const now = new Date().toISOString();
  const payload = {
    requestType: 'source_import',
    status: 'queued',
    source: 'questionnaire_apps_script_direct',
    sourceTransport: 'apps_script_firestore_rest',
    queueVersion: CFSB_QUESTIONNAIRE_FIRESTORE_QUEUE_VERSION,
    sourceType: 'questionnaire_responses',
    coachId: coach.coachRxId,
    coachRxId: coach.coachRxId,
    coachName: coach.coachName || record.coach_name || normalized.coach_name || '',
    records: [record],
    recordsReceived: 1,
    requestedBy: 'questionnaire_endpoint',
    requestedByEmail: 'questionnaire_endpoint',
    sourceRunId: 'questionnaire-response-' + String(record.response_id),
    sourceGeneratedAt: String(record.received_at || normalized.received_at || now),
    createdAt: now,
    updatedAt: now
  };
  const firestoreResult = questionnaireFirestorePatchDocument_(CFSB_QUESTIONNAIRE_SYNC_REQUEST_COLLECTION, requestId, payload);
  return {
    status: 'queued',
    requestId: requestId,
    firestoreName: firestoreResult.name || '',
    coachRxId: coach.coachRxId,
    coachName: coach.coachName
  };
}

function resolveQuestionnaireDashboardCoach_(coachKey) {
  const raw = String(coachKey || '').trim();
  const normalized = normalizeQuestionnaireCoachKey_(raw);
  if (CFSB_QUESTIONNAIRE_COACH_MAP[normalized]) return CFSB_QUESTIONNAIRE_COACH_MAP[normalized];
  return { coachRxId: '', coachName: raw };
}

function normalizeQuestionnaireCoachKey_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function questionnaireFirestorePatchDocument_(collectionPath, docId, data) {
  const encodedCollection = String(collectionPath || '').split('/').map(encodeURIComponent).join('/');
  const encodedDocId = encodeURIComponent(String(docId || ''));
  const url = 'https://firestore.googleapis.com/v1/projects/'
    + encodeURIComponent(CFSB_QUESTIONNAIRE_FIRESTORE_PROJECT_ID)
    + '/databases/'
    + encodeURIComponent(CFSB_QUESTIONNAIRE_FIRESTORE_DATABASE_ID)
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
    payload: JSON.stringify({ fields: questionnaireFirestoreEncodeMap_(data) })
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
    throw new Error('Ecriture Firestore syncRequests echouee: ' + status + ' ' + text);
  }
  return parsed;
}

function questionnaireFirestoreEncodeMap_(data) {
  const fields = {};
  Object.keys(data || {}).forEach(function(key) {
    const value = data[key];
    if (typeof value === 'undefined') return;
    fields[key] = questionnaireFirestoreEncodeValue_(value);
  });
  return fields;
}

function questionnaireFirestoreEncodeValue_(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(function(item) { return questionnaireFirestoreEncodeValue_(item); }) } };
  }
  if (typeof value === 'object') return { mapValue: { fields: questionnaireFirestoreEncodeMap_(value) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function makeQuestionnaireDashboardRequestId_(responseId) {
  const cleanResponse = String(responseId || 'response').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  const stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd_HHmmss_SSS');
  return 'questionnaire_responses_' + cleanResponse + '_' + stamp;
}
