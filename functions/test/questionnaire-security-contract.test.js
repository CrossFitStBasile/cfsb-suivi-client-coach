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
  const createSendRule = extractFunction(rulesSource, "createsQuestionnaireSendRequest");
  assert.match(rulesSource, /request\.resource\.data\.requestedByUid == request\.auth\.uid/);
  assert.match(rulesSource, /request\.resource\.data\.source == 'dashboard_questionnaire_send_click'/);
  assert.match(
    createSendRule,
    /!request\.resource\.data\.keys\(\)\.hasAny\(\['externalEffectState'\]\)/
  );
  assert.match(
    createSendRule,
    /request\.resource\.data\.externalEffectState == 'not_started'/
  );
  assert.match(createSendRule, /'externalEffectState'/);
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

test("le callable historique rejoint la file sécurisée sans effet GHL direct", () => {
  const callableStart = functionsSource.indexOf(
    "exports.sendQuestionnaire = onCall("
  );
  const processorStart = functionsSource.indexOf(
    "exports.processQuestionnaireSendRequest = onDocumentCreated("
  );
  assert.ok(callableStart >= 0);
  assert.ok(processorStart > callableStart);
  const callable = functionsSource.slice(callableStart, processorStart);

  assert.match(callable, /return db\.runTransaction|await db\.runTransaction/);
  assert.match(callable, /transaction\.create\(sendRef, baseAttempt\)/);
  assert.match(callable, /deliveryStatus:\s*"firestore_queue_pending"/);
  assert.match(callable, /externalEffectState:\s*"not_started"/);
  assert.match(callable, /source:\s*"dashboard_questionnaire_send_click"/);
  assert.match(callable, /const requestedSendId = cleanString\(request\.data\?\.sendId\)/);
  assert.match(callable, /sendId stable manquant ou invalide/);
  assert.match(callable, /\.doc\(requestedSendId\)/);
  assert.match(callable, /duplicateSendDisposition\(existingSend\)/);
  const uncertainStart = callable.indexOf('if (disposition === "effect_uncertain")');
  const completedStart = callable.indexOf('if (disposition === "completed")');
  const preEffectStart = callable.indexOf('if (disposition === "terminal_pre_effect")');
  const activeStart = callable.indexOf('if (disposition === "active")');
  assert.ok(uncertainStart >= 0);
  assert.ok(completedStart > uncertainStart);
  assert.ok(preEffectStart > completedStart);
  assert.ok(activeStart > preEffectStart);
  const uncertainBranch = callable.slice(uncertainStart, completedStart);
  const completedBranch = callable.slice(completedStart, preEffectStart);
  const preEffectBranch = callable.slice(preEffectStart, activeStart);
  const activeBranch = callable.slice(activeStart);
  assert.match(uncertainBranch, /retryWithNewSendId:\s*false/);
  assert.match(uncertainBranch, /requiresManualReview:\s*true/);
  assert.doesNotMatch(uncertainBranch, /nouveau sendId|reessayer|nouvelle tentative/i);
  assert.match(completedBranch, /retryWithNewSendId:\s*false/);
  assert.match(preEffectBranch, /retryWithNewSendId:\s*true/);
  assert.match(preEffectBranch, /nouveau sendId/);
  assert.match(activeBranch, /retryWithNewSendId:\s*false/);
  assert.doesNotMatch(activeBranch, /nouveau sendId|reessayer|nouvelle tentative/i);
  assert.doesNotMatch(callable, /\.doc\(\)/);
  assert.doesNotMatch(callable, /addGhlTag\(/);
  assert.doesNotMatch(callable, /findGhlContactByPhone\(/);
  assert.match(callable, /secrets:\s*\[\]/);
  assert.doesNotMatch(callable, /secrets:\s*\[ghlPrivateToken\]/);
});

test("le bouton coach reprend une tentative Firestore stable sans second envoi", () => {
  const send = extractFunction(appSource, "journalQuestionnaireSend");
  const load = extractFunction(appSource, "loadQuestionnaireSendAttempt");
  const save = extractFunction(appSource, "saveQuestionnaireSendAttempt");
  const matches = extractFunction(appSource, "questionnaireSendAttemptMatches");

  assert.match(send, /loadQuestionnaireSendAttempt\(attemptKey\)/);
  assert.match(send, /saveQuestionnaireSendAttempt\(attemptKey, sendId\)/);
  assert.match(send, /await runTransaction\(db/);
  assert.match(send, /transaction\.get\(attemptRef\)/);
  assert.match(send, /transaction\.set\(attemptRef, attempt\)/);
  assert.match(send, /questionnaireSendAttemptMatches\(existingSnap\.data\(\), attempt\)/);
  assert.doesNotMatch(send, /addDoc\(collection\(db,\s*"questionnaireSends"\)/);
  assert.doesNotMatch(
    load,
    /Date\.now\(\)[\s\S]*createdAt|QUESTIONNAIRE_SEND_ATTEMPT_TTL_MS/
  );
  assert.match(send, /questionnaireSendAttemptOutcome\(firstResult\.existing\)/);
  assert.match(send, /existingOutcome\.kind === "uncertain"/);
  assert.match(send, /Créer explicitement une nouvelle tentative d'envoi/);
  assert.match(save, /questionnaireSendAttemptMemory\.set/);
  assert.match(matches, /"requestedByUid"/);
});

test("l'effet GHL est réclamé une seule fois et les baux expirés sont récupérés sans rejeu incertain", () => {
  const processorStart = functionsSource.indexOf(
    "exports.processQuestionnaireSendRequest = onDocumentCreated("
  );
  const recoveryStart = functionsSource.indexOf(
    "async function recoverExpiredQuestionnaireSendClaims("
  );
  assert.ok(processorStart >= 0);
  assert.ok(recoveryStart > processorStart);
  const processor = functionsSource.slice(processorStart, recoveryStart);
  const claim = extractFunction(functionsSource, "claimQuestionnaireExternalEffect");
  const mark = extractFunction(functionsSource, "markSend");

  assert.match(processor, /retry:\s*true/);
  assert.match(processor, /claimQuestionnaireExternalEffect\(sendRef/);
  assert.match(processor, /includeResponseMeta:\s*true/);
  assert.match(processor, /validGhlAddTagsReceipt\(/);
  assert.match(processor, /externalEffectState:\s*"completed"/);
  assert.match(processor, /externalEffectState:\s*"uncertain"/);
  assert.match(claim, /externalEffectState:\s*"started"/);
  assert.match(claim, /externalEffectExpectedGhlContactId/);
  assert.match(functionsSource, /exports\.scheduledQuestionnaireSendRecovery = onSchedule\(/);
  assert.match(functionsSource, /retried_before_external_effect/);
  assert.match(functionsSource, /marked_uncertain/);

  assert.match(mark, /return db\.runTransaction/);
  assert.match(mark, /currentSucceeded && !patchSucceeded/);
  assert.match(mark, /if \(patchSucceeded\)/);
  assert.match(mark, /status:\s*"paused"/);
  assert.match(mark, /nextQuestionnaireScheduleDate\(/);
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
  assert.match(
    valuesRule,
    /status == 'paused'[\s\S]*nextSendAt\.matches\('\^\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}\$'\)/
  );
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

test("la file admin charge et conserve toute revue identitaire explicite", () => {
  const subscription = extractFunction(
    appSource,
    "subscribeQuestionnaireIdentityReviewQueue"
  );
  assert.match(
    subscription,
    /where\("identityMatchReviewRequired",\s*"==",\s*true\)/
  );
  assert.match(subscription, /questionnaireIdentityReviewResponses/);

  const sandbox = {
    state: {
      data: {
        questionnaireIdentityReviewResponses: [{
          id: "matched-manual-review",
          routingStatus: "matched_manual",
          processingStatus: "read",
          identityMatchReviewRequired: true
        }],
        questionnaireReviewResponses: [],
        questionnaireResponses: [{
          id: "ordinary-read",
          routingStatus: "matched",
          processingStatus: "read",
          identityMatchReviewRequired: false
        }]
      }
    },
    isInfoAdmin: () => true,
    uniqueById: (items) => {
      const seen = new Set();
      return items.filter((item) => item?.id && !seen.has(item.id) && seen.add(item.id));
    },
    operationalRecordClientLinkStatus: () => "confirmed"
  };
  vm.runInNewContext(`
    ${extractFunction(appSource, "questionnaireHasUnresolvedSourceResponseConflict")}
    ${extractFunction(appSource, "questionnaireRequiresIdentityReview")}
    ${extractFunction(appSource, "questionnaireResponsesForAdminReview")}
    globalThis.review = questionnaireResponsesForAdminReview();
    globalThis.requiresReview = questionnaireRequiresIdentityReview;
  `, sandbox, { filename: "questionnaire-admin-identity-review.js" });

  assert.deepEqual(
    Array.from(sandbox.review, (item) => item.id),
    ["matched-manual-review"]
  );
  assert.equal(sandbox.requiresReview({
    routingStatus: "matched",
    identityMatchReviewRequired: true
  }), true);
  assert.equal(sandbox.requiresReview({
    sourceResponseConflict: true,
    sourceResponseConflictResolvedAt: "2026-07-29T12:00:00Z"
  }), false);

  const card = extractFunction(appSource, "renderUnmatchedQuestionnaireCard");
  assert.match(card, /Identite a verifier/);
  assert.match(card, /Contenu source en conflit/);
  assert.match(card, /Verifier le lien/);
  const notice = extractFunction(appSource, "renderQuestionnaireValidationNotice");
  assert.match(notice, /conflit d'identite a verifier/);
});

test("l'adjudication admin d'un conflit source exige deux confirmations et journalise les empreintes", () => {
  const link = extractFunction(appSource, "linkQuestionnaireResponseToClient");
  assert.match(link, /questionnaireHasUnresolvedSourceResponseConflict\(response\)/);
  assert.match(link, /adjudicateQuestionnaireSourceConflict\(\{/);
  assert.match(link, /identityMatchReviewRequired:\s*false/);
  assert.match(link, /manualMatchReviewRequired:\s*false/);
  assert.match(link, /identityMatchResolvedAt:\s*reviewedAt/);
  assert.match(link, /manualMatchConflictResolvedAt:\s*reviewedAt/);
  const adjudicate = extractFunction(
    appSource,
    "adjudicateQuestionnaireSourceConflict"
  );
  assert.match(adjudicate, /confirmKeptContent !== "yes"/);
  assert.match(adjudicate, /confirmKeptClient !== "yes"/);
  assert.match(adjudicate, /Une note d'adjudication est obligatoire/);
  assert.match(adjudicate, /runTransaction\(db/);
  assert.match(adjudicate, /questionnaireSourceConflictFingerprintKey\(currentResponse\) !== observedFingerprintKey/);
  assert.match(adjudicate, /sourceResponseConflictResolutionFingerprints:\s*observedFingerprints/);
  assert.match(adjudicate, /sourceResponseConflictContentConfirmed:\s*true/);
  assert.match(adjudicate, /sourceResponseConflictClientConfirmed:\s*true/);
  assert.match(adjudicate, /sourceResponseConflictResolutionHistory:\s*arrayUnion\(resolutionEvent\)/);
  assert.match(adjudicate, /questionnaire_response\.source_content_adjudicated/);

  const stickySource = extractFunction(
    functionsSource,
    "unresolvedHistoricalQuestionnaireIdentityConflict"
  );
  assert.match(stickySource, /identityMatchReviewRequired === true/);
  assert.match(stickySource, /manualMatchReviewRequired === true/);
  const stickyContent = extractFunction(
    functionsSource,
    "unresolvedHistoricalSourceResponseConflict"
  );
  assert.match(stickyContent, /sourceResponseConflict !== true/);
  assert.match(stickyContent, /sourceResponseConflictResolvedAt/);
  const fingerprintMatch = extractFunction(
    functionsSource,
    "questionnaireSourceConflictResolutionMatches"
  );
  assert.match(fingerprintMatch, /sourceResponseConflictResolutionFingerprints/);
  assert.match(fingerprintMatch, /sourceResponseConflictContentConfirmed !== true/);
  assert.match(fingerprintMatch, /sourceResponseConflictClientConfirmed !== true/);
  const build = extractFunction(functionsSource, "buildQuestionnaireResponseRecords");
  assert.match(build, /reopened_source_fingerprints_changed/);
  assert.match(build, /sourceResponseConflictResolvedAt:\s*""/);
});

test("une réponse en revue n'offre aucune action coach et les couches runtime refusent les appels directs", () => {
  const sandbox = {};
  vm.runInNewContext(`
    ${extractFunction(appSource, "questionnaireHasUnresolvedSourceResponseConflict")}
    ${extractFunction(appSource, "questionnaireRequiresIdentityReview")}
    ${extractFunction(appSource, "questionnaireResponseCoachActionsBlocked")}
    ${extractFunction(appSource, "assertQuestionnaireResponseCoachActionable")}
    globalThis.blocked = questionnaireResponseCoachActionsBlocked;
    globalThis.assertActionable = assertQuestionnaireResponseCoachActionable;
  `, sandbox, { filename: "questionnaire-action-quarantine.js" });
  assert.equal(sandbox.blocked({ identityMatchReviewRequired: true }), true);
  assert.equal(sandbox.blocked({
    sourceResponseConflict: true,
    sourceResponseConflictResolvedAt: ""
  }), true);
  assert.equal(sandbox.blocked({
    sourceResponseConflict: true,
    sourceResponseConflictResolvedAt: "2026-07-29T12:00:00Z"
  }), false);
  assert.throws(
    () => sandbox.assertActionable({ manualMatchReviewRequired: true }, "Mission"),
    /revue admin/
  );

  [
    "createMissionFromQuestionnaireResponse",
    "markQuestionnaireResponseRead"
  ].forEach((name) => {
    assert.match(
      extractFunction(appSource, name),
      /assertQuestionnaireResponseCoachActionable/
    );
  });
  [
    "completeQuestionnaireTask",
    "completeTask",
    "ignoreOperationalTask",
    "saveTask"
  ].forEach((name) => {
    assert.match(
      extractFunction(appSource, name),
      /assertQuestionnaireTaskActionable/
    );
  });
  assert.match(
    extractFunction(appSource, "renderQuestionnaireDetailModal"),
    /identityReview && !isInfoAdmin\(\)/
  );
  assert.match(
    extractFunction(appSource, "taskActionButtons"),
    /questionnaireTaskRequiresIdentityReview\(task\)/
  );

  const responseRule = extractFunction(
    rulesSource,
    "questionnaireResponseRequiresIdentityReview"
  );
  assert.match(responseRule, /identityMatchReviewRequired/);
  assert.match(responseRule, /manualMatchReviewRequired/);
  assert.match(responseRule, /sourceResponseConflictResolvedAt/);
  assert.match(
    extractFunction(rulesSource, "coachReadsQuestionnaireResponse"),
    /!questionnaireResponseRequiresIdentityReview\(resource\.data\)/
  );
  assert.match(
    extractFunction(rulesSource, "coachLinksQuestionnaireResponseToClient"),
    /!questionnaireResponseRequiresIdentityReview\(resource\.data\)/
  );
  const taskRules = rulesSource.slice(
    rulesSource.indexOf("match /tasks/{taskId}"),
    rulesSource.indexOf("match /questionnaireResponses/{responseId}")
  );
  assert.match(taskRules, /questionnaireTaskSourceIsActionable\(request\.resource\.data\)/);
  assert.match(taskRules, /questionnaireTaskSourceIsActionable\(resource\.data\)/);
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
