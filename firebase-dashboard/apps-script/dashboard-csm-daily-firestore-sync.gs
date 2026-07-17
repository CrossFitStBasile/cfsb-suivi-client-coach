/**
 * Dashboard Coach CFSB - CSM -> Firebase daily scheduler.
 *
 * Copy this file into the private CSM Apps Script project alongside
 * dashboard-csm-firestore-bridge.gs. This file does not update the CSM sheet;
 * it only schedules and runs the Firebase enrichment bridge.
 *
 * Required companion file:
 * - dashboard-csm-firestore-bridge.gs
 *
 * Required appsscript.json scope:
 * - https://www.googleapis.com/auth/datastore
 */

const DASHBOARD_CSM_DAILY_SYNC_VERSION = '20260618-csm-daily-firestore-sync';
const DASHBOARD_CSM_DAILY_TRIGGER_HANDLER = 'runDashboardFirebaseCsmDailySync';
const DASHBOARD_CSM_DAILY_TRIGGER_HOUR = 0;
const DASHBOARD_CSM_DAILY_TRIGGER_MINUTE = 5;
const DASHBOARD_CSM_DAILY_TRIGGER_TIMEZONE = 'America/Toronto';

function previewDashboardFirebaseCsmDailySync() {
  dashboardCsmDailyAssertBridge_();
  const result = previewDashboardFirebaseCsmBridge();
  return dashboardCsmDailyWrapResult_('preview', result);
}

function runDashboardFirebaseCsmDailySync() {
  dashboardCsmDailyAssertBridge_();
  const result = queueDashboardFirebaseCsmBridge();
  return dashboardCsmDailyWrapResult_('queued', result);
}

function installDashboardFirebaseCsmDailyTrigger() {
  dashboardCsmDailyAssertBridge_();
  removeDashboardFirebaseCsmDailyTrigger();
  const trigger = ScriptApp.newTrigger(DASHBOARD_CSM_DAILY_TRIGGER_HANDLER)
    .timeBased()
    .atHour(DASHBOARD_CSM_DAILY_TRIGGER_HOUR)
    .nearMinute(DASHBOARD_CSM_DAILY_TRIGGER_MINUTE)
    .everyDays(1)
    .inTimezone(DASHBOARD_CSM_DAILY_TRIGGER_TIMEZONE)
    .create();
  const result = {
    ok: true,
    mode: 'daily_trigger_installed',
    schedulerVersion: DASHBOARD_CSM_DAILY_SYNC_VERSION,
    handler: DASHBOARD_CSM_DAILY_TRIGGER_HANDLER,
    triggerUid: trigger.getUniqueId(),
    schedule: 'Tous les jours vers 00 h 05',
    timezone: DASHBOARD_CSM_DAILY_TRIGGER_TIMEZONE
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function removeDashboardFirebaseCsmDailyTrigger() {
  const removed = [];
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() !== DASHBOARD_CSM_DAILY_TRIGGER_HANDLER) return;
    removed.push(trigger.getUniqueId());
    ScriptApp.deleteTrigger(trigger);
  });
  const result = {
    ok: true,
    mode: 'daily_trigger_removed',
    schedulerVersion: DASHBOARD_CSM_DAILY_SYNC_VERSION,
    handler: DASHBOARD_CSM_DAILY_TRIGGER_HANDLER,
    removedCount: removed.length,
    removedTriggerUids: removed
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function listDashboardFirebaseCsmDailyTriggers() {
  const triggers = ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return trigger.getHandlerFunction() === DASHBOARD_CSM_DAILY_TRIGGER_HANDLER;
    })
    .map(function(trigger) {
      return {
        triggerUid: trigger.getUniqueId(),
        handler: trigger.getHandlerFunction(),
        eventType: String(trigger.getEventType())
      };
    });
  const result = {
    ok: true,
    mode: 'daily_trigger_list',
    schedulerVersion: DASHBOARD_CSM_DAILY_SYNC_VERSION,
    handler: DASHBOARD_CSM_DAILY_TRIGGER_HANDLER,
    triggerCount: triggers.length,
    triggers: triggers
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function dashboardCsmDailyWrapResult_(mode, bridgeResult) {
  const result = {
    ok: Boolean(bridgeResult && bridgeResult.ok),
    mode: mode,
    schedulerVersion: DASHBOARD_CSM_DAILY_SYNC_VERSION,
    bridgeVersion: bridgeResult && bridgeResult.bridgeVersion ? bridgeResult.bridgeVersion : '',
    payloadCount: bridgeResult && bridgeResult.payloadCount ? bridgeResult.payloadCount : 0,
    queuedCount: bridgeResult && bridgeResult.queuedCount ? bridgeResult.queuedCount : 0,
    totals: bridgeResult && bridgeResult.totals ? bridgeResult.totals : {},
    warnings: bridgeResult && bridgeResult.warnings ? bridgeResult.warnings : []
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function dashboardCsmDailyAssertBridge_() {
  if (typeof previewDashboardFirebaseCsmBridge !== 'function'
    || typeof queueDashboardFirebaseCsmBridge !== 'function') {
    throw new Error('Le fichier dashboard-csm-firestore-bridge.gs doit etre installe dans ce projet Apps Script avant le scheduler quotidien.');
  }
}
