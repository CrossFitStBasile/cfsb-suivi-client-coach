"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const functionsSource = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
const appSource = fs.readFileSync(
  path.join(root, "firebase-dashboard/public/app.js"),
  "utf8"
);
const serviceSource = fs.readFileSync(
  path.join(root, "functions/questionnaire-service.js"),
  "utf8"
);
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Fonction introuvable: ${name}`);
  const parameterEnd = source.indexOf(") {", start);
  const open = source.indexOf("{", parameterEnd);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Fonction incomplète: ${name}`);
}

function loadGhlMatcher() {
  const sandbox = {
    cleanString: (value) => String(value ?? "").trim()
  };
  vm.runInNewContext(`
    ${extractFunction(functionsSource, "normalizePhone")}
    ${extractFunction(functionsSource, "ghlContactPhones")}
    ${extractFunction(functionsSource, "exactGhlContactsByPhone")}
    ${extractFunction(functionsSource, "exactGhlContactByPhone")}
    globalThis.exact = exactGhlContactByPhone;
  `, sandbox, { filename: "questionnaire-ghl-matcher.js" });
  return sandbox.exact;
}

function loadGhlPhoneSearch(ghlFetch) {
  const sandbox = {
    cleanString: (value) => String(value ?? "").trim(),
    ghlFetch,
    URL
  };
  vm.runInNewContext(`
    const GHL_API_BASE = "https://services.leadconnectorhq.com";
    ${extractFunction(functionsSource, "normalizePhone")}
    ${extractFunction(functionsSource, "validQuestionnairePhone")}
    ${extractFunction(functionsSource, "phoneSearchCandidates")}
    ${extractFunction(functionsSource, "ghlContactPhones")}
    ${extractFunction(functionsSource, "exactGhlContactsByPhone")}
    async ${extractFunction(functionsSource, "findGhlContactByPhone")}
    globalThis.search = findGhlContactByPhone;
  `, sandbox, { filename: "questionnaire-ghl-search.js" });
  return sandbox.search;
}

function loadScheduleFrequencyGuard() {
  const sandbox = {
    cleanString: (value) => String(value ?? "").trim()
  };
  vm.runInNewContext(`
    ${extractFunction(functionsSource, "questionnaireScheduleAllowedFrequencies")}
    ${extractFunction(functionsSource, "questionnaireScheduleFrequencyIsAllowed")}
    globalThis.isAllowed = questionnaireScheduleFrequencyIsAllowed;
  `, sandbox, { filename: "questionnaire-schedule-frequency.js" });
  return sandbox.isAllowed;
}

test("le matching GHL exige un seul identifiant unique pour le téléphone", () => {
  const exact = loadGhlMatcher();
  const repeatedSameContact = exact([
    { id: "contact-a", phone: "+1 450 555-0188" },
    { id: "contact-a", phoneNumber: "4505550188" }
  ], "4505550188");
  assert.equal(repeatedSameContact.id, "contact-a");

  assert.equal(exact([
    { id: "contact-a", phone: "4505550188" },
    { id: "contact-b", phone: "+1 450 555-0188" }
  ], "4505550188"), null);
});

test("une recherche GHL partiellement échouée ne peut pas prouver l'unicité", async () => {
  let listCalls = 0;
  const search = loadGhlPhoneSearch(async (_token, url) => {
    if (url.pathname.endsWith("/contacts/search/duplicate")) {
      const error = new Error("aucun doublon");
      error.status = 404;
      throw error;
    }
    listCalls += 1;
    if (listCalls === 2) {
      const error = new Error("limite GHL");
      error.status = 429;
      throw error;
    }
    return {
      contacts: [{ id: "contact-a", phone: "+1 450 555-0188" }]
    };
  });

  await assert.rejects(
    search({
      token: "secret",
      locationId: "location",
      phoneNormalized: "4505550188"
    }),
    (error) => error?.status === 429
  );
});

test("la recherche GHL est bornée à quatre appels parallèles et huit secondes par requête", async () => {
  let calls = 0;
  const search = loadGhlPhoneSearch(async (_token, url) => {
    calls += 1;
    if (url.pathname.endsWith("/contacts/search/duplicate")) {
      assert.equal(url.searchParams.get("locationId"), "location");
      assert.match(url.searchParams.get("number") || "", /^(?:\d{10}|\+1\d{10})$/);
      assert.equal(url.searchParams.has("phone"), false);
      const error = new Error("aucun doublon");
      error.status = 404;
      throw error;
    }
    assert.equal(url.searchParams.get("limit"), "100");
    return { contacts: [] };
  });
  assert.equal(await search({
    token: "secret",
    locationId: "location",
    phoneNormalized: "4505550188"
  }), null);
  assert.equal(calls, 4);
  assert.match(functionsSource, /GHL_REQUEST_TIMEOUT_MS = 8 \* 1000/);
  assert.match(
    extractFunction(functionsSource, "ghlFetch"),
    /AbortSignal\.timeout\(GHL_REQUEST_TIMEOUT_MS\)/
  );
});

test("un téléphone incomplet ne déclenche aucune recherche GHL", async () => {
  let calls = 0;
  const search = loadGhlPhoneSearch(async () => {
    calls += 1;
    return { contacts: [] };
  });
  assert.equal(await search({
    token: "secret",
    locationId: "location",
    phoneNormalized: "5550188"
  }), null);
  assert.equal(calls, 0);
});

test("un formulaire Studio explicite absent ne peut pas retomber sur le bilan global", () => {
  const resolver = extractFunction(functionsSource, "resolveQuestionnaireConfig");
  assert.match(resolver, /cleanFormId\s*\|\|/);
  assert.match(resolver, /hasOwnProperty\.call\(QUESTIONNAIRE_TYPES,\s*requestedType\)/);
  assert.match(resolver, /Ce questionnaire est introuvable ou n'est plus publié/);
});

test("la file Firestore lie l'auteur à l'utilisateur et borne les mises à jour coach", () => {
  assert.match(rulesSource, /request\.resource\.data\.requestedByUid == request\.auth\.uid/);
  assert.match(rulesSource, /request\.resource\.data\.source == 'dashboard_questionnaire_send_click'/);
  assert.match(rulesSource, /function coachCancelsQuestionnaireSend\(\)/);
  assert.match(rulesSource, /function coachMarksQuestionnaireFollowupCreated\(\)/);
  assert.match(rulesSource, /coachMarksQuestionnaireFollowupCreated\(\)/);
  assert.match(rulesSource, /transfersRelatedDocumentToPilotCoach\(\)/);
  const followup = extractFunction(appSource, "createQuestionnaireFollowupTask");
  assert.match(followup, /questionnaire_followup_\$\{/);
  assert.match(followup, /const batch = writeBatch\(db\)/);
  assert.match(followup, /followupTaskId: taskId/);
  assert.match(followup, /await batch\.commit\(\)/);
  assert.match(
    extractFunction(appSource, "linkQuestionnaireResponseToClient"),
    /internalClientId:\s*String\(client\.internalClientId \|\| client\.id\)/
  );
});

test("les horaires coach lient leur auteur et bornent création, édition et pause", () => {
  const createRule = extractFunction(rulesSource, "createsQuestionnaireScheduleRequest");
  const editRule = extractFunction(rulesSource, "coachEditsQuestionnaireSchedule");
  const toggleRule = extractFunction(rulesSource, "coachTogglesQuestionnaireSchedule");
  const scheduleUi = extractFunction(appSource, "saveQuestionnaireSchedule");
  const scheduleMatch = rulesSource.slice(
    rulesSource.indexOf("match /questionnaireSchedules/{scheduleId}"),
    rulesSource.indexOf("match /questionnaireForms/{formId}")
  );

  assert.match(createRule, /requestedByUid == request\.auth\.uid/);
  assert.match(createRule, /requestedByEmail == request\.auth\.token\.email/);
  assert.match(createRule, /source == 'dashboard_questionnaire_schedule'/);
  assert.match(createRule, /keys\(\)\.hasOnly\(/);

  [
    "coachId",
    "coachRxId",
    "coachName",
    "clientId",
    "clientName",
    "clientPhoneNormalized",
    "questionnaireType",
    "questionnaireLabel",
    "formId",
    "formVersionId",
    "ghlTag",
    "questionnaireUrl",
    "frequency",
    "nextSendAt",
    "status",
    "note",
    "requestedByUid",
    "requestedByEmail",
    "createdAt",
    "updatedAt",
    "source"
  ].forEach((field) => {
    assert.match(scheduleUi, new RegExp(`\\b${field}\\s*:`), `champ UI absent: ${field}`);
    assert.match(createRule, new RegExp(`'${field}'`), `champ refusé à la création: ${field}`);
  });

  assert.match(editRule, /clientId == resource\.data\.clientId/);
  assert.match(editRule, /questionnaireType == resource\.data\.questionnaireType/);
  assert.match(editRule, /requestedByUid == request\.auth\.uid/);
  assert.match(editRule, /requestedByEmail == request\.auth\.token\.email/);
  assert.doesNotMatch(editRule, /'clientId'/);
  assert.doesNotMatch(editRule, /'questionnaireType'/);

  assert.match(toggleRule, /'status'/);
  assert.match(toggleRule, /'statusChangedAt'/);
  assert.match(toggleRule, /'updatedAt'/);
  assert.doesNotMatch(toggleRule, /requestedByUid/);

  assert.match(scheduleMatch, /isAdmin\(\) \|\| createsQuestionnaireScheduleRequest\(\)/);
  assert.match(scheduleMatch, /coachEditsQuestionnaireSchedule\(\)/);
  assert.match(scheduleMatch, /coachTogglesQuestionnaireSchedule\(\)/);
  assert.match(scheduleMatch, /transfersRelatedDocumentToPilotCoach\(\)/);
});

test("les règles gardent les anciennes planifications et imposent la cadence Studio", () => {
  const frequencyRule = extractFunction(
    rulesSource,
    "questionnaireScheduleFrequencyMatchesQuestionnaire"
  );
  const studioRule = extractFunction(
    rulesSource,
    "questionnaireScheduleMatchesPublishedStudioForm"
  );
  const catalogRule = extractFunction(
    rulesSource,
    "questionnaireCatalogReferenceIsValid"
  );
  const deliveryRule = extractFunction(
    rulesSource,
    "questionnaireCatalogDeliveryIsReady"
  );
  const valuesRule = extractFunction(
    rulesSource,
    "questionnaireScheduleValuesAreValid"
  );

  assert.match(
    frequencyRule,
    /questionnaireLegacyTypeIsKnown\(\)[\s\S]*!request\.resource\.data\.keys\(\)\.hasAny\(\['formId'\]\)[\s\S]*questionnaireScheduleFrequencyIsKnown\(\)/
  );
  assert.match(studioRule, /data\.status == 'published'/);
  assert.match(studioRule, /questionnaireCatalogDeliveryIsReady\(\)/);
  assert.match(catalogRule, /\^\[A-Za-z0-9_-\]\{8,80\}\$/);
  assert.match(deliveryRule, /data\.deliveryReady == true/);
  assert.match(studioRule, /data\.settings\.kind == 'check_in'/);
  assert.match(studioRule, /data\.settings\.kind == 'quarterly'/);
  assert.match(valuesRule, /questionnaireScheduleFrequencyMatchesQuestionnaire\(\)/);
});

test("le cron refuse aussi les cadences incompatibles", () => {
  const isAllowed = loadScheduleFrequencyGuard();
  // Les planifications du Dashboard actuellement en ligne n'ont pas de
  // formId. Elles doivent continuer de fonctionner durant le déploiement.
  assert.equal(isAllowed({
    type: "habitudes_quotidiennes",
    settings: { kind: "check_in" }
  }, "monthly"), true);
  assert.equal(isAllowed({
    type: "suivi_global",
    settings: { kind: "quarterly" }
  }, "every_4_weeks"), true);

  // Dès qu'une planification est enregistrée par l'interface Studio, son
  // formId active le contrat 2/4 semaines ou trimestriel.
  assert.equal(isAllowed({
    type: "habitudes_quotidiennes",
    formId: "form_checkin",
    settings: { kind: "check_in" }
  }, "every_2_weeks"), true);
  assert.equal(isAllowed({
    type: "habitudes_quotidiennes",
    formId: "form_checkin",
    settings: { kind: "check_in" }
  }, "monthly"), false);
  assert.equal(isAllowed({
    type: "suivi_global",
    formId: "form_quarterly",
    settings: { kind: "quarterly" }
  }, "quarterly"), true);
  assert.equal(isAllowed({
    type: "suivi_global",
    formId: "form_quarterly",
    settings: { kind: "quarterly" }
  }, "every_4_weeks"), false);
  assert.equal(isAllowed({
    type: "studio:form_checkin",
    formId: "form_checkin",
    settings: { kind: "check_in" }
  }, "every_4_weeks"), true);
});

test("un payload legacy ne bascule jamais implicitement vers une URL Studio", () => {
  const resolver = extractFunction(functionsSource, "resolveQuestionnaireConfig");
  assert.doesNotMatch(resolver, /\.where\("legacyType"/);
  assert.match(resolver, /if \(cleanFormId\)/);
  assert.match(
    functionsSource,
    /usesLegacyScheduleBridge[\s\S]*schedule\.clientPhoneNormalized[\s\S]*clientPhone\(client\)/
  );
});

test("la première version publique est persistée avant d'être servie", () => {
  const loader = extractFunction(serviceSource, "loadPublishedBySlug");
  assert.match(loader, /await persistInitialEntry\(initial/);
  assert.doesNotMatch(loader, /fallback:\s*true/);
  assert.match(loader, /QUESTIONNAIRE_STATE_INCOMPLETE/);
});

test("les prototypes exécutables sont archivés hors du répertoire Hosting", () => {
  [
    "firebase-dashboard/public/questionnaire/legacy-bilan-v1.html",
    "firebase-dashboard/public/questionnaire/check-in/legacy-v1.html",
    "firebase-dashboard/public/questionnaire/evaluation-habitudes-vie/legacy-v1.html"
  ].forEach((relativePath) => {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, relativePath);
  });
  const reconciliationPath = path.join(
    root,
    "firebase-dashboard",
    "QUESTIONNAIRE_RECONCILIATION_20260728.md"
  );
  assert.equal(fs.existsSync(reconciliationPath), true, reconciliationPath);
  const reconciliation = fs.readFileSync(reconciliationPath, "utf8");
  assert.match(reconciliation, /hotfix-worktree-pre-reconcile-20260728\.zip/);
  assert.match(
    reconciliation,
    /C7AECF3B123131F2553018AB76FCFDBB747426C1EAE9EC1C8103538D2619E581/
  );
});
