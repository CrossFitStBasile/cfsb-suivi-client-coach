"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  INITIAL_DRAFTS,
  canonicalPathForSlug,
  checkIdempotentReplay,
  createIdempotencyRecord,
  normalizeDraft,
  publishDraft,
  validateSubmission,
  verifyPublishedSnapshot
} = require("../questionnaire-studio");

const PUBLISHED_AT = "2026-07-23T00:00:00.000Z";

function published(key, version = "1") {
  return publishDraft(INITIAL_DRAFTS[key], {
    version,
    publishedAt: PUBLISHED_AT
  });
}

function submission(definition, answers, {
  idempotencyKey = "submission-test-0001",
  phone = "450 555-0188",
  name = "Membre Test"
} = {}) {
  return {
    idempotencyKey,
    identity: { phone, name },
    answers,
    meta: {
      sourceUrl: definition.canonicalPath,
      definitionVersion: definition.version,
      versionHash: definition.versionHash
    }
  };
}

test("les quatre expériences initiales ont un chemin statique sans PII", () => {
  assert.deepEqual(
    Object.keys(INITIAL_DRAFTS).sort(),
    ["checkIn", "educationalBenchmarks", "lifestyleAssessment", "quarterly"].sort()
  );
  for (const draft of Object.values(INITIAL_DRAFTS)) {
    const path = canonicalPathForSlug(draft.slug);
    assert.equal(path, `/questionnaire/f/${draft.slug}`);
    assert.equal(path.includes("?"), false);
    assert.equal(path.includes("#"), false);
    assert.equal(/phone|email|client|coach/i.test(path), false);
  }
});

test("les tags GHL des questionnaires historiques sont réservés au niveau du schéma", () => {
  for (const ghlTag of [
    "dashboardcoach",
    " SUIVIREGULIER ",
    "EvaluationNutrition"
  ]) {
    assert.throws(
      () => normalizeDraft({
        ...INITIAL_DRAFTS.checkIn,
        ghlTag
      }),
      (error) => error?.code === "reserved_ghl_tag"
        && error?.details?.tag === ghlTag.trim().toLowerCase()
    );
  }

  const allowed = normalizeDraft({
    ...INITIAL_DRAFTS.checkIn,
    ghlTag: "dashboardcoach-v2"
  });
  assert.equal(allowed.ghlTag, "dashboardcoach-v2");
});

test("un brouillon trop volumineux échoue avant toute écriture Firestore", () => {
  const optionHelp = "x".repeat(500);
  const sections = Array.from({ length: 24 }, (_, sectionIndex) => ({
    id: `section_${sectionIndex}`,
    title: `Section ${sectionIndex}`,
    fields: Array.from({ length: 5 }, (_, fieldIndex) => {
      const fieldId = `choice_${sectionIndex}_${fieldIndex}`;
      return {
        id: fieldId,
        type: "single_choice",
        label: `Question ${fieldId}`,
        required: false,
        options: Array.from({ length: 30 }, (_, optionIndex) => ({
          value: `option_${optionIndex}`,
          label: `Option ${optionIndex}`,
          helpText: optionHelp
        }))
      };
    })
  }));

  assert.throws(
    () => normalizeDraft({
      ...INITIAL_DRAFTS.quarterly,
      slug: "formulaire-trop-grand",
      title: "Formulaire trop grand",
      description: "Ce brouillon valide structurellement dépasse la taille durable.",
      ghlTag: "cfsb-formulaire-trop-grand-v1",
      sections,
      rules: []
    }),
    (error) => error?.code === "schema_too_large"
      && error?.details?.maxBytes === 256 * 1024
  );
});

test("le bilan 90 jours reprend le prototype et garde le rappel InBody informatif", () => {
  const draft = INITIAL_DRAFTS.quarterly;
  const fields = draft.sections.flatMap((section) => section.fields);
  const ids = new Set(fields.map((field) => field.id));
  for (const id of [
    "progression_global",
    "proud_progress",
    "goal_importance",
    "main_obstacle",
    "program_fit",
    "coach_support",
    "upcoming_change",
    "pain_limitation",
    "next_priority",
    "followup_timing"
  ]) {
    assert.equal(ids.has(id), true, `champ attendu: ${id}`);
  }
  const inBody = fields.find((field) => field.id === "inbody_info");
  assert.equal(inBody.type, "info");
  assert.match(inBody.content, /passer au bureau/i);
  assert.match(inBody.content, /aucune prise de rendez-vous/i);
});

test("le check-in express contient trois validations oui/non et un commentaire conditionnel", () => {
  const draft = INITIAL_DRAFTS.checkIn;
  const fields = draft.sections.flatMap((section) => section.fields);
  assert.equal(fields.filter((field) => field.type === "yes_no").length, 3);
  assert.deepEqual(draft.settings.cadenceDays, [14, 28]);
  assert.equal(draft.settings.estimatedSeconds, 30);
  const comment = fields.find((field) => field.id === "check_in_comment");
  assert.equal(comment.type, "long_text");
  assert.equal(comment.required, false);
  assert.equal(comment.allowManualReveal, true);
});

test("l'évaluation habitudes de vie conserve la structure du formulaire live", () => {
  const draft = INITIAL_DRAFTS.lifestyleAssessment;
  assert.deepEqual(
    draft.sections.map((section) => section.title),
    [
      "Objectif et contexte",
      "Nutrition et hydratation",
      "Sommeil et récupération",
      "Énergie, mouvement et confort",
      "Plan d'action"
    ]
  );
  assert.deepEqual(
    draft.sections.flatMap((section) => section.fields.map((field) => field.id)),
    [
      "eval_main_goal",
      "eval_obstacles",
      "eval_readiness",
      "eval_meals",
      "eval_protein",
      "eval_fruits_vegetables",
      "eval_hydration",
      "eval_nutrition_note",
      "eval_sleep",
      "eval_sleep_quality",
      "eval_stress",
      "eval_recovery_note",
      "eval_energy",
      "eval_movement_outside_training",
      "eval_pain",
      "eval_body_note",
      "eval_next_focus",
      "eval_commitment",
      "eval_contact"
    ]
  );
  assert.match(draft.description, /déjà utilisée au centre/i);
});

test("les repères éducatifs restent non diagnostiques et citent des sources officielles", () => {
  const draft = INITIAL_DRAFTS.educationalBenchmarks;
  const fields = draft.sections.flatMap((section) => section.fields);
  const disclaimer = fields.find((field) => field.id === "benchmark_disclaimer");
  assert.equal(disclaimer.type, "info");
  assert.match(`${disclaimer.label} ${disclaimer.content}`, /pas un diagnostic/i);
  assert.match(disclaimer.content, /ne remplacent pas un avis médical/i);
  assert.match(draft.settings.successMessage, /pas à poser un diagnostic/i);

  const bands = fields.flatMap((field) => field.feedback?.bands || []);
  const levels = new Set(bands.map((band) => band.level));
  for (const level of ["optimal", "good", "acceptable", "problematic"]) {
    assert.equal(levels.has(level), true, `niveau éducatif attendu: ${level}`);
  }
  for (const band of bands.filter((item) => item.sourceUrl)) {
    const source = new URL(band.sourceUrl);
    assert.equal(
      source.hostname === "www.canada.ca"
        || source.hostname === "guide-alimentaire.canada.ca"
        || source.hostname === "www.who.int",
      true,
      `source officielle attendue: ${source.hostname}`
    );
  }
  const unsourcedBands = bands.filter((item) => !item.sourceUrl);
  assert.equal(unsourcedBands.length, 12);
  for (const band of unsourcedBands) {
    assert.match(
      band.message,
      /^Repère interne CFSB:/,
      `repère interne non identifié: ${band.id}`
    );
  }
});

test("une publication est versionnée, immuable et détecte toute altération", () => {
  const snapshot = published("quarterly");
  assert.equal(snapshot.version, "1");
  assert.equal(snapshot.canonicalPath, "/questionnaire/f/bilan-90-jours");
  assert.equal(snapshot.versionHash.length, 43);
  assert.deepEqual(verifyPublishedSnapshot(snapshot), snapshot);

  const tampered = JSON.parse(JSON.stringify(snapshot));
  tampered.title = "Titre modifié";
  assert.throws(
    () => verifyPublishedSnapshot(tampered),
    (error) => error.code === "version_hash_mismatch"
  );
});

test("une URL de brouillon ne peut contenir ni paramètres ni fragment", () => {
  assert.throws(
    () => normalizeDraft({
      ...INITIAL_DRAFTS.checkIn,
      slug: "check-in-express?client=123"
    }),
    (error) => error.code === "invalid_slug"
  );
});

test("un check-in entièrement positif est vert et auto-archivable", () => {
  const definition = published("checkIn");
  const validated = validateSubmission(definition, submission(definition, {
    plan_still_good: true,
    execution_good: true,
    results_present: true
  }));
  assert.equal(validated.triage.level, "green");
  assert.equal(validated.triage.reviewStatus, "archived");
  assert.deepEqual(validated.triage.matchedRuleIds, []);
  assert.equal(validated.identity.phoneNormalized, "4505550188");
});

test("un non ou un commentaire au check-in crée un seul résultat actionnable", () => {
  const definition = published("checkIn");
  const negative = validateSubmission(definition, submission(definition, {
    plan_still_good: true,
    execution_good: false,
    results_present: true,
    check_in_comment: "Mon horaire a changé."
  }, { idempotencyKey: "submission-test-0002" }));
  assert.equal(negative.triage.level, "yellow");
  assert.equal(negative.triage.reviewStatus, "to_read");
  assert.equal(negative.triage.matchedRuleIds.includes("execution_not_good"), true);
  assert.equal(negative.triage.matchedRuleIds.includes("comment_added"), true);
});

test("les réponses inconnues et les métadonnées de version incohérentes sont refusées", () => {
  const definition = published("checkIn");
  assert.throws(
    () => validateSubmission(definition, submission(definition, {
      plan_still_good: true,
      execution_good: true,
      results_present: true,
      injected_field: "non"
    })),
    (error) => error.code === "unknown_answer"
  );

  const wrongVersion = submission(definition, {
    plan_still_good: true,
    execution_good: true,
    results_present: true
  }, { idempotencyKey: "submission-test-0003" });
  wrongVersion.meta.definitionVersion = "99";
  assert.throws(
    () => validateSubmission(definition, wrongVersion),
    (error) => error.code === "submission_version_mismatch"
  );
});

test("la même clé est idempotente seulement pour le même contenu", () => {
  const definition = published("checkIn");
  const first = validateSubmission(definition, submission(definition, {
    plan_still_good: true,
    execution_good: true,
    results_present: true
  }, { idempotencyKey: "submission-test-0004" }));
  const record = createIdempotencyRecord(first);
  assert.equal(checkIdempotentReplay(record, first).duplicate, true);

  const changed = validateSubmission(definition, submission(definition, {
    plan_still_good: false,
    execution_good: true,
    results_present: true
  }, { idempotencyKey: "submission-test-0004" }));
  assert.throws(
    () => checkIdempotentReplay(record, changed),
    (error) => error.code === "idempotency_conflict"
  );
});

test("les repères éducatifs retournent une rétroaction quantitative prudente", () => {
  const definition = published("educationalBenchmarks");
  const answers = {
    sleep_hours_average: 5.5,
    sleep_regular_nights: 2,
    mvpa_minutes_week: 45,
    strength_days_week: 1,
    sedentary_hours_day: 11,
    complete_meals_day: 1,
    protein_meals_day: 1,
    half_plate_plants_meals_day: 1,
    water_liters_day: 1.25,
    benchmark_focus: "sleep",
    wants_coach_support: false
  };
  const validated = validateSubmission(
    definition,
    submission(definition, answers, { idempotencyKey: "submission-test-0005" })
  );
  const sleep = validated.feedback.find((item) => item.fieldId === "sleep_hours_average");
  assert.equal(sleep.level, "problematic");
  assert.match(sleep.message, /récupérer/i);
  assert.match(sleep.sourceUrl, /^https:\/\/www\.canada\.ca\//);
  assert.equal(validated.triage.level, "yellow");
});
