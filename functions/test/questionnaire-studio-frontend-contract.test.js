"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {
  INITIAL_DRAFTS,
  normalizeDraft,
  stableJson
} = require("../questionnaire-studio");
const studioSourcePath = path.resolve(
  __dirname,
  "../../firebase-dashboard/public/questionnaire-studio.js"
);
const studioSource = fs.readFileSync(studioSourcePath, "utf8");

function loadStudioPureFunctions() {
  let source = studioSource;
  source = source.replace(
    /^import\s*\{[\s\S]*?\}\s*from\s*"https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+";\s*/u,
    ""
  );
  source = source.replace(
    "export function mountQuestionnaireStudio",
    "function mountQuestionnaireStudio"
  );
  source += "\nmodule.exports = { normalizeForm, serializeDraft, defaultFeedbackForQuestion, feedbackValidationErrors };\n";
  const sandbox = {
    console,
    crypto: crypto.webcrypto,
    module: { exports: {} },
    URL
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox, {
    filename: "questionnaire-studio.js"
  });
  return sandbox.module.exports;
}

test("le Studio relit et réécrit les quatre brouillons sans perte de contrat", () => {
  const { normalizeForm, serializeDraft } = loadStudioPureFunctions();
  for (const [key, draft] of Object.entries(INITIAL_DRAFTS)) {
    const studioDraft = normalizeForm({
      formId: `form_${key}`,
      status: "draft",
      draftRevision: 3,
      draft
    });
    const serializedAcrossRealm = JSON.parse(JSON.stringify(
      serializeDraft(studioDraft)
    ));
    const normalizedAgain = normalizeDraft(serializedAcrossRealm);
    assert.equal(
      stableJson(normalizedAgain),
      stableJson(draft),
      `${key} doit conserver champs, conditions, feedback et règles`
    );
  }
});

test("les métadonnées d'identité et d'URL produites par le Studio restent sûres", () => {
  const { normalizeForm, serializeDraft } = loadStudioPureFunctions();
  const studioDraft = normalizeForm({
    formId: "form_check_in",
    draft: INITIAL_DRAFTS.checkIn
  });
  const serialized = JSON.parse(JSON.stringify(serializeDraft(studioDraft)));
  assert.deepEqual(serialized.identity, {
    phoneRequired: true,
    nameRequired: true,
    emailRequired: false
  });
  assert.equal(serialized.slug, "check-in-express");
  assert.equal(serialized.slug.includes("?"), false);
  assert.equal(serialized.slug.includes("#"), false);
  assert.equal(serialized.sections.every((section) =>
    section.fields.every((field) => /^[a-z][a-z0-9_]{0,63}$/.test(field.id))
  ), true);
});

test("le Studio distingue publication, changements non publiés et livraison GHL vérifiée", () => {
  const { normalizeForm } = loadStudioPureFunctions();
  const form = normalizeForm({
    formId: "check_in_express",
    status: "published",
    activeVersion: "1",
    deliveryReady: true,
    hasUnpublishedChanges: true,
    deliveryVerifiedByEmail: "info@crossfitstbasilelegrand.com",
    draft: INITIAL_DRAFTS.checkIn
  });
  assert.equal(form.deliveryReady, true);
  assert.equal(form.hasUnpublishedChanges, true);
  assert.equal(form.deliveryVerifiedByEmail, "info@crossfitstbasilelegrand.com");
  assert.match(studioSource, /setQuestionnaireDeliveryReady/);
  assert.match(studioSource, /Publie d’abord la version exacte à vérifier dans GHL/);
  assert.match(studioSource, /sans nom ni donnée client/);
});

test("l'éditeur visuel valide les bandes et les sources éducatives", () => {
  const {
    defaultFeedbackForQuestion,
    feedbackValidationErrors
  } = loadStudioPureFunctions();
  const question = {
    id: "sleep_hours",
    type: "number",
    label: "Combien d'heures dors-tu?",
    min: 0,
    max: 24
  };
  const feedback = defaultFeedbackForQuestion(question);
  assert.equal(feedback.kind, "numeric_bands");
  assert.equal(feedback.bands.length, 1);

  feedback.bands[0] = {
    ...feedback.bands[0],
    min: 0,
    max: 6,
    includeMin: true,
    includeMax: false,
    level: "problematic",
    label: "À améliorer",
    message: "Le sommeil peut limiter la récupération.",
    sourceLabel: "Santé publique du Canada",
    sourceUrl: "https://www.canada.ca/"
  };
  feedback.bands.push({
    id: "repere_sleep_ok",
    min: 6,
    max: 9,
    includeMin: true,
    includeMax: true,
    level: "good",
    label: "Bon repère",
    message: "Cette durée se rapproche du repère général."
  });
  question.feedback = feedback;

  assert.deepEqual(
    JSON.parse(JSON.stringify(feedbackValidationErrors(question))),
    []
  );
  feedback.bands[1].min = 5;
  assert.match(
    feedbackValidationErrors(question).join(" "),
    /se chevauchent/u
  );
  feedback.bands[1].min = 6;
  feedback.bands[0].sourceUrl = "http://example.com/";
  assert.match(
    feedbackValidationErrors(question).join(" "),
    /HTTPS/u
  );
});
