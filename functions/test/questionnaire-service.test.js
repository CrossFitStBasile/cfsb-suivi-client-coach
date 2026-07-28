"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  INITIAL_DRAFTS,
  publishDraft
} = require("../questionnaire-studio");
const {
  INITIAL_FORM_META,
  PUBLIC_ORIGIN,
  canonicalPublicUrl,
  publicDefinition,
  responseSchema
} = require("../questionnaire-service");

function published(key) {
  return publishDraft(INITIAL_DRAFTS[key], {
    version: "1",
    publishedAt: "2026-07-23T00:00:00.000Z"
  });
}

test("les formulaires initiaux gardent des identifiants stables et distincts", () => {
  const ids = Object.values(INITIAL_FORM_META).map((item) => item.formId);
  assert.equal(new Set(ids).size, 4);
  assert.equal(INITIAL_FORM_META.quarterly.legacyType, "suivi_global");
  assert.equal(INITIAL_FORM_META.checkIn.legacyType, "habitudes_quotidiennes");
  assert.equal(
    INITIAL_FORM_META.lifestyleAssessment.legacyType,
    "evaluation_habitudes_vie"
  );
  assert.equal(INITIAL_FORM_META.educationalBenchmarks.legacyType, "");
  const studioTags = Object.values(INITIAL_DRAFTS).map((item) => item.ghlTag);
  assert.equal(new Set(studioTags).size, 4);
  assert.equal(studioTags.some((tag) => [
    "dashboardcoach",
    "suiviregulier",
    "evaluationnutrition"
  ].includes(tag)), false);
});

test("l'URL canonique est fixe et refuse toute personnalisation", () => {
  assert.equal(
    canonicalPublicUrl("/questionnaire/f/check-in-express"),
    `${PUBLIC_ORIGIN}/questionnaire/f/check-in-express`
  );
  for (const invalid of [
    "/questionnaire/f/check-in-express?phone=4505550188",
    "/questionnaire/f/check-in-express#client",
    "/questionnaire/check-in/",
    "https://example.com/questionnaire/f/check-in-express"
  ]) {
    assert.throws(() => canonicalPublicUrl(invalid), /chemin public/i);
  }
});

test("la définition publique ne divulgue ni tag GHL ni règles internes", () => {
  const definition = publicDefinition(published("quarterly"));
  assert.equal(Object.hasOwn(definition, "ghlTag"), false);
  assert.equal(Object.hasOwn(definition, "rules"), false);
  assert.equal(Object.hasOwn(definition, "responsePolicy"), false);
  assert.equal(definition.canonicalPath, "/questionnaire/f/bilan-90-jours");
  assert.equal(definition.presentation.mode, "steps");
  assert.equal(definition.presentation.review, true);
});

test("le check-in public est présenté sur une page sans étape de révision", () => {
  const definition = publicDefinition(published("checkIn"));
  assert.deepEqual(definition.presentation, {
    mode: "one_page",
    review: false
  });
});

test("le snapshot de lecture coach reste attaché à la version soumise", () => {
  const snapshot = published("lifestyleAssessment");
  const schema = responseSchema(snapshot);
  assert.equal(schema.version, "1");
  assert.equal(schema.slug, "evaluation-habitudes-vie");
  assert.equal(schema.sections.length, snapshot.sections.length);
  assert.equal(
    schema.sections.flatMap((section) => section.fields).length,
    snapshot.sections.flatMap((section) => section.fields).length
  );
});
