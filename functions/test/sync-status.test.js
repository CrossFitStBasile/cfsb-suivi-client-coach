"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildLegacyCoachStatusPatch,
  buildPipelineStatusData,
  coachSyncPipeline
} = require("../sync-status");

test("les sources sont classees dans des pipelines independants", () => {
  assert.equal(coachSyncPipeline({ sourceType: "coachrx_clients" }), "coachrx");
  assert.equal(coachSyncPipeline({ source: "direct_questionnaire" }), "questionnaire");
  assert.equal(coachSyncPipeline({ source: "firebase_function_questionnaire_response_sync_scheduled" }), "questionnaire");
  assert.equal(coachSyncPipeline({ source: "firebase_firestore_sync_request_coach" }), "dashboard_full");
  assert.equal(coachSyncPipeline({ source: "firebase_firestore_sync_request_all" }), "dashboard_full");
  assert.equal(coachSyncPipeline({ source: "firebase_firestore_sync_request_coach_questionnaire" }), "questionnaire");
});

test("un statut questionnaire ne peut pas ecraser les compteurs portefeuille", () => {
  const portfolio = {
    coachId: "15935",
    clientsImported: 20,
    clientsMissingPhone: 1,
    source: "firebase_firestore_sync_request_coach"
  };
  const questionnairePatch = buildLegacyCoachStatusPatch({
    pipeline: "questionnaire",
    source: "direct_questionnaire",
    result: { coachId: "15935", clientsImported: 0, questionnaireResponsesImported: 6 }
  });
  const merged = { ...portfolio, ...questionnairePatch };

  assert.equal(Object.hasOwn(questionnairePatch, "clientsImported"), false);
  assert.equal(merged.clientsImported, 20);
  assert.equal(merged.clientsMissingPhone, 1);
  assert.equal(merged.questionnaireResponsesImported, 6);
});

test("le sous-document de pipeline conserve ses propres compteurs", () => {
  const data = buildPipelineStatusData({
    pipeline: "questionnaire",
    result: { coachId: "15935", questionnaireResponsesImported: 3 }
  });
  assert.equal(data.pipeline, "questionnaire");
  assert.equal(data.questionnaireResponsesImported, 3);
  assert.equal(data.clientsImported, 0);
});

test("le compte d'avertissements n'est pas plafonne par l'echantillon conserve", () => {
  const data = buildPipelineStatusData({
    pipeline: "dashboard_full",
    result: { warnings: Array.from({ length: 7 }, (_, index) => `warning-${index + 1}`) }
  });

  assert.equal(data.status, "warning");
  assert.equal(data.warningCount, 7);
  assert.equal(data.warnings.length, 5);
});
