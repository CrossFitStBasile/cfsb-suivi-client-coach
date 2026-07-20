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
  assert.equal(coachSyncPipeline({ source: "firebase_function_sync_sheets_scheduled" }), "dashboard_full");
});

test("un statut questionnaire ne contient aucun compteur client a ecraser", () => {
  const patch = buildLegacyCoachStatusPatch({
    pipeline: "questionnaire",
    source: "direct_questionnaire",
    result: {
      coachId: "15935",
      clientsImported: 0,
      questionnaireResponsesImported: 4
    }
  });
  assert.equal(Object.hasOwn(patch, "clientsImported"), false);
  assert.equal(Object.hasOwn(patch, "clientsEnriched"), false);
  assert.equal(Object.hasOwn(patch, "clientsMissingPhone"), false);
  assert.equal(patch.questionnaireResponsesImported, 4);
});

test("fusionner le patch questionnaire conserve le dernier total CoachRx", () => {
  const existing = {
    coachId: "15935",
    clientsImported: 22,
    clientsMissingPhone: 1,
    source: "direct_coachrx_extension"
  };
  const questionnairePatch = buildLegacyCoachStatusPatch({
    pipeline: "questionnaire",
    source: "direct_questionnaire",
    result: { coachId: "15935", clientsImported: 0, questionnaireResponsesImported: 6 }
  });
  const merged = { ...existing, ...questionnairePatch };
  assert.equal(merged.clientsImported, 22);
  assert.equal(merged.clientsMissingPhone, 1);
  assert.equal(merged.source, "direct_coachrx_extension");
  assert.equal(merged.questionnaireResponsesImported, 6);
});

test("le pipeline CoachRx demeure proprietaire des compteurs portefeuille legacy", () => {
  const patch = buildLegacyCoachStatusPatch({
    pipeline: "coachrx",
    source: "direct_coachrx_extension",
    result: { coachId: "15935", clientsImported: 22, clientsMissingPhone: 1 }
  });
  assert.equal(patch.clientsImported, 22);
  assert.equal(patch.clientsMissingPhone, 1);
  assert.equal(patch.source, "direct_coachrx_extension");
});

test("chaque sous-document de pipeline conserve ses propres compteurs", () => {
  const data = buildPipelineStatusData({
    pipeline: "questionnaire",
    result: { coachId: "15935", questionnaireResponsesImported: 3 }
  });
  assert.equal(data.pipeline, "questionnaire");
  assert.equal(data.questionnaireResponsesImported, 3);
  assert.equal(data.clientsImported, 0);
});
