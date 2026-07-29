import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const lib = require(path.join(root, "tools", "questionnaire-scheduler-canary-lib.cjs"));
const functionsSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const runnerSource = fs.readFileSync(
  path.join(root, "tools", "run-questionnaire-scheduler-canary.cjs"),
  "utf8"
);
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const commit = "a".repeat(40);
const now = Date.now();
const armedUntil = new Date(now + (10 * 60 * 1000)).toISOString();

test("canary CLI modes and release SHA fail closed", () => {
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--execute-empty"]),
    { mode: "execute-empty", releaseCommit: commit }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--execute-positive"]),
    { mode: "execute-positive", releaseCommit: commit }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--execute-process"]),
    { mode: "execute-process", releaseCommit: commit }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--provision-contact"]),
    { mode: "provision-contact", releaseCommit: commit }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--pin-contact"]),
    { mode: "pin-contact", releaseCommit: commit }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${commit}`, "--cleanup"]),
    { mode: "cleanup", releaseCommit: commit }
  );
  assert.throws(
    () => lib.parseArgs([`--release-commit=${commit}`, "--execute-empty", "--execute-positive"]),
    /mode_conflict/
  );
  assert.throws(() => lib.parseArgs(["--execute-empty"]), /release_commit_missing/);
  assert.throws(() => lib.parseArgs(["--release-commit=abc"]), /release_commit_invalid/);
  assert.throws(() => lib.parseArgs([`--release-commit=${commit}`, "--force"]), /argument_unknown/);
});

test("deterministic canary IDs depend only on the sealed SHA", () => {
  assert.deepEqual(lib.canaryIds(commit), {
    targetId: `system_questionnaire_canary_${"a".repeat(12)}`,
    scheduleId: `system_questionnaire_schedule_canary_${"a".repeat(12)}`
  });
  assert.notDeepEqual(lib.canaryIds("b".repeat(40)), lib.canaryIds(commit));
  assert.equal(
    lib.processCanarySendId(commit),
    `system_questionnaire_process_canary_${"a".repeat(12)}`
  );
});

test("stable JSON comparison ignores Firestore map key order but preserves arrays", () => {
  const first = {
    name: "schedule",
    fields: {
      status: { stringValue: "paused" },
      nested: {
        mapValue: {
          fields: {
            beta: { integerValue: "2" },
            alpha: { integerValue: "1" }
          }
        }
      },
      values: [{ stringValue: "first" }, { stringValue: "second" }]
    }
  };
  const reordered = {
    fields: {
      values: [{ stringValue: "first" }, { stringValue: "second" }],
      nested: {
        mapValue: {
          fields: {
            alpha: { integerValue: "1" },
            beta: { integerValue: "2" }
          }
        }
      },
      status: { stringValue: "paused" }
    },
    name: "schedule"
  };
  const reversedArray = {
    ...reordered,
    fields: {
      ...reordered.fields,
      values: [{ stringValue: "second" }, { stringValue: "first" }]
    }
  };
  assert.equal(
    lib.stableJsonStringify(first),
    lib.stableJsonStringify(reordered)
  );
  assert.notEqual(
    lib.stableJsonStringify(first),
    lib.stableJsonStringify(reversedArray)
  );
  assert.match(
    runnerSource,
    /\.update\(stableJsonStringify\(\s*documents/
  );
});

test("synthetic GHL contact requires explicit name, tag, unique ID and valid phone", () => {
  const valid = {
    id: "syntheticContact01",
    name: "CFSB Questionnaire Canary",
    phone: "514-555-0100",
    tags: ["qa", lib.SYNTHETIC_CONTACT_MARKER_TAG],
    dnd: true
  };
  assert.equal(lib.explicitSyntheticContact(valid), true);
  assert.equal(lib.explicitSyntheticContact({ ...valid, name: "Ordinary Member" }), false);
  assert.equal(lib.explicitSyntheticContact({ ...valid, tags: ["ordinary"] }), false);
  assert.equal(
    lib.explicitSyntheticContact({ ...valid, tags: ["qa", "internal-test"] }),
    false
  );
  assert.equal(lib.explicitSyntheticContact({ ...valid, phone: "555" }), false);
  assert.equal(lib.explicitSyntheticContact({ ...valid, phone: "514-555-2100" }), false);
  assert.equal(lib.explicitSyntheticContact({ ...valid, dnd: false }), false);
  assert.equal(
    lib.explicitSyntheticContact({ ...valid, dnd: undefined }, { requireDnd: false }),
    true
  );
  for (const tag of [
    lib.LEGACY_GHL_TAG,
    lib.PROCESS_GHL_TAG,
    lib.EVALUATION_GHL_TAG
  ]) {
    assert.equal(lib.historicalGhlTagsAbsent(valid), true);
    assert.equal(
      lib.historicalGhlTagsAbsent({ ...valid, tags: [...valid.tags, tag] }),
      false
    );
  }
  assert.match(lib.contactConfirmationFingerprint(valid), /^[a-f0-9]{64}$/);
  assert.equal(lib.selectUniqueSyntheticContact([[valid]]), valid);
  assert.throws(
    () => lib.selectUniqueSyntheticContact([[valid, { ...valid, id: "syntheticContact02" }]]),
    /synthetic_contact_not_unique/
  );
  assert.throws(
    () => lib.selectUniqueSyntheticContact([[{ ...valid, tags: [...valid.tags, "dashboardcoach"] }]]),
    /synthetic_contact_target_tag_already_present/
  );
  assert.throws(
    () => lib.selectUniqueSyntheticContact(
      [[{ ...valid, tags: [...valid.tags, "suiviregulier"] }]],
      { targetTag: "suiviregulier" }
    ),
    /synthetic_contact_target_tag_already_present/
  );
});

test("shared provision claim permits one creator and makes timeout recovery read-only", async () => {
  const locationId = "locationCanary01";
  const phone = "5145550100";
  const claim = lib.buildContactProvisionClaim({
    releaseCommit: commit,
    locationId,
    phone,
    createdAt: new Date().toISOString()
  });
  let stored = null;
  let createCalls = 0;
  const acquire = () => lib.acquireSharedContactProvisionClaim({
    claim,
    createClaim: async (value) => {
      createCalls += 1;
      if (stored) throw new lib.CanaryError("http_409");
      stored = value;
      return value;
    },
    readClaim: async () => stored
  });
  const concurrent = await Promise.all([acquire(), acquire()]);
  assert.equal(concurrent.filter((value) => value.acquired).length, 1);
  assert.equal(concurrent.filter((value) => !value.acquired).length, 1);
  assert.equal(createCalls, 2);

  let timeoutCreateCalls = 0;
  stored = null;
  const timeoutAfterWrite = await lib.acquireSharedContactProvisionClaim({
    claim,
    createClaim: async (value) => {
      timeoutCreateCalls += 1;
      stored = value;
      throw new lib.CanaryError("http_503");
    },
    readClaim: async () => stored
  });
  assert.equal(timeoutAfterWrite.acquired, false);
  assert.equal(timeoutCreateCalls, 1);

  let noWriteCreateCalls = 0;
  await assert.rejects(
    lib.acquireSharedContactProvisionClaim({
      claim,
      createClaim: async () => {
        noWriteCreateCalls += 1;
        throw new lib.CanaryError("http_503");
      },
      readClaim: async () => null
    }),
    /provision_claim_unresolved/
  );
  assert.equal(noWriteCreateCalls, 1);
});

test("GHL contact search completeness accepts live and documented totals only", () => {
  const contacts = [{ id: "contactOne" }, { id: "contactTwo" }];
  assert.equal(
    lib.completeGhlContactSearch({
      contacts,
      meta: { total: 2, nextPage: "", nextPageUrl: "" }
    }),
    contacts
  );
  assert.equal(
    lib.completeGhlContactSearch({ contacts, count: 2 }),
    contacts
  );
  assert.throws(
    () => lib.completeGhlContactSearch({ contacts, meta: { total: 3 } }),
    /synthetic_contact_search_incomplete/
  );
  assert.throws(
    () => lib.completeGhlContactSearch({ contacts, count: 2, total: 3 }),
    /synthetic_contact_search_incomplete/
  );
  assert.throws(
    () => lib.completeGhlContactSearch({ contacts }),
    /synthetic_contact_search_incomplete/
  );
  assert.throws(
    () => lib.completeGhlContactSearch({
      contacts,
      meta: { total: 2, nextPage: "2" }
    }),
    /synthetic_contact_search_incomplete/
  );
  assert.throws(
    () => lib.completeGhlContactSearch({
      contacts,
      meta: { total: "2", nextPage: "", nextPageUrl: "" }
    }),
    /synthetic_contact_search_incomplete/
  );
  for (const invalidDeclaredTotal of [null, "", "2"]) {
    assert.throws(
      () => lib.completeGhlContactSearch({
        contacts,
        meta: { total: 2, nextPage: "", nextPageUrl: "" },
        count: invalidDeclaredTotal
      }),
      /synthetic_contact_search_incomplete/
    );
  }
  assert.throws(
    () => lib.completeGhlContactSearch({
      contacts,
      meta: { total: 2, nextPage: "", nextPageUrl: "https://example.test" },
      nextPageUrl: ""
    }),
    /synthetic_contact_search_incomplete/
  );
  assert.throws(
    () => lib.completeGhlContactSearch({
      contacts,
      meta: { total: 2, nextPage: "2", nextPageUrl: "" },
      nextPage: ""
    }),
    /synthetic_contact_search_incomplete/
  );
});

test("GHL contact search accepts only one validated empty terminal sentinel", async () => {
  const locationId = "locationFixture";
  const contacts = [
    { id: "AAAAAAAAAAAAAAAAAAAA", locationId },
    { id: "BBBBBBBBBBBBBBBBBBBB", locationId }
  ];
  const searchParams = { locationId, query: "qa", limit: "100" };
  const validNextPageUrl =
    "https://services.leadconnectorhq.com/contacts/"
    + "?locationId=locationFixture&query=qa&limit=100"
    + "&startAfter=1720000000000&startAfterId=BBBBBBBBBBBBBBBBBBBB";
  const firstPage = {
    contacts,
    meta: { total: 2, nextPage: "", nextPageUrl: validNextPageUrl }
  };
  const terminalPage = {
    contacts: [],
    meta: { total: 2, nextPage: "", nextPageUrl: "" }
  };
  let terminalFetches = 0;
  const result = await lib.collectCompleteGhlContactSearch(firstPage, {
    searchParams,
    fetchTerminalPage: async (request) => {
      terminalFetches += 1;
      assert.deepEqual(request, {
        pathname: "/contacts/",
        searchParams: {
          locationId,
          query: "qa",
          limit: "100",
          startAfter: "1720000000000",
          startAfterId: "BBBBBBBBBBBBBBBBBBBB"
        }
      });
      return terminalPage;
    }
  });
  assert.equal(result, contacts);
  assert.equal(terminalFetches, 1);

  let unexpectedFetches = 0;
  assert.equal(
    await lib.collectCompleteGhlContactSearch({
      contacts,
      count: 2
    }, {
      searchParams,
      fetchTerminalPage: async () => {
        unexpectedFetches += 1;
        return terminalPage;
      }
    }),
    contacts
  );
  assert.equal(unexpectedFetches, 0);

  const invalidUrls = [
    validNextPageUrl.replace("https:", "http:"),
    validNextPageUrl.replace(
      "https://services.leadconnectorhq.com",
      "https://user@services.leadconnectorhq.com"
    ),
    validNextPageUrl.replace(
      "https://services.leadconnectorhq.com",
      "https://services.leadconnectorhq.com:443"
    ),
    validNextPageUrl.replace(
      "https://services.leadconnectorhq.com",
      "https://services.leadconnectorhq.com:8443"
    ),
    validNextPageUrl.replace(
      "services.leadconnectorhq.com",
      "services.leadconnectorhq.com.example.test"
    ),
    validNextPageUrl.replace("/contacts/", "/contacts"),
    validNextPageUrl.replace("query=qa", "query=canary"),
    validNextPageUrl.replace("locationId=locationFixture&", ""),
    validNextPageUrl.replace("&limit=100", ""),
    validNextPageUrl.replace("&startAfterId=BBBBBBBBBBBBBBBBBBBB", ""),
    `${validNextPageUrl}&unexpected=true`,
    `${validNextPageUrl}&query=qa`,
    validNextPageUrl.replace("1720000000000", "172000000000"),
    validNextPageUrl.replace(
      "BBBBBBBBBBBBBBBBBBBB",
      "AAAAAAAAAAAAAAAAAAAA"
    ),
    ` ${validNextPageUrl}`,
    `${validNextPageUrl} `,
    `${validNextPageUrl}#fragment`
  ];
  for (const nextPageUrl of invalidUrls) {
    let invalidFetches = 0;
    await assert.rejects(
      lib.collectCompleteGhlContactSearch({
        ...firstPage,
        meta: { ...firstPage.meta, nextPageUrl }
      }, {
        searchParams,
        fetchTerminalPage: async () => {
          invalidFetches += 1;
          return terminalPage;
        }
      }),
      /synthetic_contact_search_incomplete/
    );
    assert.equal(invalidFetches, 0);
  }

  const invalidTerminalPages = [
    {
      contacts: [{ id: "CCCCCCCCCCCCCCCCCCCC", locationId }],
      meta: { total: 2, nextPage: "", nextPageUrl: "" }
    },
    { contacts: [], meta: { total: 3, nextPage: "", nextPageUrl: "" } },
    { contacts: [], meta: { total: 2, nextPage: "3", nextPageUrl: "" } },
    {
      contacts: [],
      meta: { total: 2, nextPage: "", nextPageUrl: validNextPageUrl }
    }
  ];
  for (const invalidTerminalPage of invalidTerminalPages) {
    let invalidTerminalFetches = 0;
    await assert.rejects(
      lib.collectCompleteGhlContactSearch(firstPage, {
        searchParams,
        fetchTerminalPage: async () => {
          invalidTerminalFetches += 1;
          return invalidTerminalPage;
        }
      }),
      /synthetic_contact_search_incomplete/
    );
    assert.equal(invalidTerminalFetches, 1);
  }

  let partialFetches = 0;
  await assert.rejects(
    lib.collectCompleteGhlContactSearch({
      ...firstPage,
      contacts: contacts.slice(0, 1)
    }, {
      searchParams,
      fetchTerminalPage: async () => {
        partialFetches += 1;
        return terminalPage;
      }
    }),
    /synthetic_contact_search_incomplete/
  );
  assert.equal(partialFetches, 0);

  const invalidIdentityPages = [
    {
      ...firstPage,
      contacts: [contacts[0], contacts[0]]
    },
    {
      ...firstPage,
      contacts: [
        contacts[0],
        { ...contacts[1], locationId: "otherLocation" }
      ]
    }
  ];
  for (const invalidIdentityPage of invalidIdentityPages) {
    let invalidIdentityFetches = 0;
    await assert.rejects(
      lib.collectCompleteGhlContactSearch(invalidIdentityPage, {
        searchParams,
        fetchTerminalPage: async () => {
          invalidIdentityFetches += 1;
          return terminalPage;
        }
      }),
      /synthetic_contact_search_incomplete/
    );
    assert.equal(invalidIdentityFetches, 0);
  }

  let failedTerminalFetches = 0;
  await assert.rejects(
    lib.collectCompleteGhlContactSearch(firstPage, {
      searchParams,
      fetchTerminalPage: async () => {
        failedTerminalFetches += 1;
        throw new lib.CanaryError("request_timeout");
      }
    }),
    /request_timeout/
  );
  assert.equal(failedTerminalFetches, 1);
});

test("Dashboard non-member proof covers canonical and legacy identity aliases", () => {
  const identity = {
    phone: "5145550100",
    contactId: "syntheticContact01"
  };
  for (const field of [
    "phoneNormalized",
    "clientPhoneNormalized",
    "client_phone_normalized",
    "phone",
    "clientPhone",
    "telephone",
    "mobile",
    "phoneNumber",
    "phone_number"
  ]) {
    assert.equal(
      lib.dashboardClientMatchesSyntheticIdentity(
        { [field]: "+1 514-555-0100" },
        identity
      ),
      true,
      field
    );
  }
  for (const field of [
    "ghlContactId",
    "ghl_contact_id",
    "ghlId",
    "ghl_id",
    "contactId",
    "sourceClientId",
    "source_client_id",
    "clientId"
  ]) {
    assert.equal(
      lib.dashboardClientMatchesSyntheticIdentity(
        { [field]: "syntheticContact01" },
        identity
      ),
      true,
      field
    );
  }
  assert.equal(
    lib.dashboardClientMatchesSyntheticIdentity(
      { coachRxLink: { sourceClientId: "syntheticContact01" } },
      identity
    ),
    true
  );
  assert.equal(
    lib.dashboardClientMatchesSyntheticIdentity(
      {},
      { ...identity, documentId: "syntheticContact01" }
    ),
    true
  );
  assert.equal(
    lib.dashboardClientMatchesSyntheticIdentity(
      { telephone: "4505550199", clientId: "different" },
      identity
    ),
    false
  );

  const decoded = lib.decodeFirestoreDocument({
    fields: {
      coachRxLink: {
        mapValue: {
          fields: {
            sourceClientId: { stringValue: "syntheticContact01" }
          }
        }
      }
    }
  });
  assert.equal(
    lib.dashboardClientMatchesSyntheticIdentity(decoded, identity),
    true
  );
});

test("positive canary fixture is private, non-member, non-selectable and admin-only", () => {
  const target = lib.buildCanaryTarget({
    releaseCommit: commit,
    armedUntil,
    expectedGhlContactId: "syntheticContact01",
    phoneNormalized: "5145550100"
  });
  const schedule = lib.buildCanarySchedule({
    releaseCommit: commit,
    armedUntil,
    todayToronto: "2026-07-28",
    requestedByUid: "adminUid",
    requestedByEmail: "admin@example.invalid",
    phoneNormalized: "5145550100"
  });
  assert.equal(target.entityType, "system");
  assert.equal(target.ownershipStatus, "canary");
  assert.equal(target.clientSelectable, false);
  assert.equal(target.coachId, "admin");
  assert.equal(schedule.coachId, "admin");
  assert.equal(schedule.frequency, "once");
  assert.equal(schedule.formId, "");
  assert.equal(schedule.status, "active");
  assert.equal(schedule.nextSendAt, "2026-07-28");
  assert.equal(lib.canaryTargetMatches(target, commit, now), true);
  assert.equal(lib.canaryTargetMatches({ ...target, entityType: "member" }, commit, now), false);
  assert.throws(
    () => lib.buildCanaryTarget({
      releaseCommit: commit,
      armedUntil,
      expectedGhlContactId: "syntheticContact01",
      phoneNormalized: "5145552100"
    }),
    /synthetic_phone_not_reserved/
  );
  assert.equal(lib.canaryScheduleMatches(schedule, commit, "2026-07-28", now), true);
  assert.equal(lib.canaryScheduleMatches({ ...schedule, coachId: "15935" }, commit, "2026-07-28", now), false);
  const processSend = lib.buildProcessCanarySend({
    releaseCommit: commit,
    armedUntil,
    requestedByUid: "adminUid",
    requestedByEmail: "admin@example.invalid",
    phoneNormalized: "5145550100"
  });
  assert.equal(processSend.questionnaireCanaryMode, "process");
  assert.equal(processSend.questionnaireType, "habitudes_quotidiennes");
  assert.equal(processSend.questionnaireScheduleId, "");
  assert.equal(processSend.coachId, "admin");
  const control = lib.buildCanaryControl({
    releaseCommit: commit,
    armedUntil,
    mode: "positive",
    nonce: "b".repeat(32)
  });
  assert.equal(control.expectedScheduleId, lib.canaryIds(commit).scheduleId);
  assert.equal(control.expectedJobName, lib.EXPECTED_SCHEDULER_JOB_NAME);
  assert.equal(
    lib.canaryControlOwnedForCleanup(control, commit, "positive", "b".repeat(32)),
    true
  );
  assert.equal(
    lib.canaryControlActive(
      control,
      commit,
      "positive",
      "b".repeat(32),
      { nowMs: now, minimumTtlMs: 2 * 60 * 1000 }
    ),
    true
  );
  assert.equal(
    lib.canaryControlActive(
      control,
      commit,
      "positive",
      "c".repeat(32),
      { nowMs: now, minimumTtlMs: 2 * 60 * 1000 }
    ),
    false
  );
});

test("a positive scheduler canary cannot be repeated after Toronto midnight", () => {
  const priorDay = {
    source: "dashboard_questionnaire_scheduled",
    questionnaireCanaryOnly: true,
    questionnaireCanarySource: lib.CANARY_SOURCE,
    questionnaireCanaryMode: "scheduler",
    canaryReleaseCommit: commit,
    scheduledFor: "2026-07-27"
  };
  assert.equal(lib.positiveCanaryAttemptExists([priorDay], commit), true);
  assert.equal(
    lib.positiveCanaryAttemptExists(
      [{ ...priorDay, questionnaireCanaryMode: "process" }],
      commit
    ),
    false
  );
  assert.equal(
    lib.positiveCanaryAttemptExists(
      [{ ...priorDay, canaryReleaseCommit: "b".repeat(40) }],
      commit
    ),
    false
  );
});

test("cleanup defers GHL while an external-effect claim can still be in flight", () => {
  assert.equal(
    lib.canarySendRequiresDeferredExternalCleanup({
      status: "error",
      externalEffectState: "started"
    }),
    true
  );
  assert.equal(
    lib.canarySendRequiresDeferredExternalCleanup({
      status: "sent",
      externalEffectState: "completed"
    }),
    false
  );
  assert.equal(
    lib.canarySendRequiresDeferredExternalCleanup({
      status: "error",
      externalEffectState: "uncertain"
    }),
    false
  );
  assert.equal(
    lib.canarySendHasUncertainExternalEffect({
      status: "error",
      externalEffectState: "uncertain"
    }),
    true
  );
  assert.equal(
    lib.canarySendHasUncertainExternalEffect({
      status: "pending",
      externalEffectState: "uncertain"
    }),
    false
  );
  assert.equal(
    lib.canarySendRequiresDeferredExternalCleanup({ status: "pending" }),
    true
  );
});

test("Firestore encoding keeps scheduler dates and TTL as strings", () => {
  const fields = lib.encodeFirestoreFields({
    nextSendAt: "2026-07-28",
    armedUntil,
    createdAt: "2026-07-28T20:00:00.000Z",
    questionnaireCanaryOnly: true
  });
  assert.equal(fields.nextSendAt.stringValue, "2026-07-28");
  assert.equal(fields.armedUntil.stringValue, armedUntil);
  assert.equal(fields.createdAt.timestampValue, "2026-07-28T20:00:00.000Z");
  assert.equal(fields.questionnaireCanaryOnly.booleanValue, true);
});

test("backend never loosens ordinary member matching for the canary", () => {
  assert.match(
    functionsSource,
    /function clientRecordAvailableForMatching[\s\S]*entityType\) !== "member"[\s\S]*ownershipStatus\) !== "confirmed"[\s\S]*clientSelectable !== true/
  );
  assert.match(
    functionsSource,
    /canaryEnvelope \? "questionnaireCanaryTargets" : "clients"/
  );
  assert.match(
    functionsSource,
    /questionnaireSchedulerCanaryTargetAvailable[\s\S]*entityType\) !== "system"[\s\S]*clientSelectable !== false/
  );
  assert.match(functionsSource, /cleanString\(coachId\) !== "admin"/);
  assert.match(functionsSource, /profile\.role !== "admin"/);
  assert.match(functionsSource, /canary_contact_mismatch/);
  assert.match(functionsSource, /claimQuestionnaireCanaryExternalEffect/);
  assert.match(functionsSource, /transaction\.get\(targetRef\)/);
  assert.match(
    functionsSource,
    /questionnaireSchedulerCanaryExpectedGhlContactId\(target\.expectedGhlContactId\)[\s\S]*!== normalizedContactId/
  );
  assert.match(
    functionsSource,
    /claimQuestionnaireCanaryExternalEffect[\s\S]*questionnaireSchedulerCanarySendAvailable/
  );
  assert.match(
    functionsSource,
    /afterClaim\.externalEffectState[\s\S]*return;/
  );
  assert.match(functionsSource, /questionnaireSchedulerCanaryPhone/);
  assert.match(functionsSource, /externalEffectState: "uncertain"/);
  assert.match(functionsSource, /QUESTIONNAIRE_PROCESS_CANARY_SEND_PREFIX/);
  assert.match(functionsSource, /mode === "process"/);
  assert.match(functionsSource, /questionnaireSchedulerSafety\.controlDecision/);
  assert.match(functionsSource, /canaryNonce: canaryControl\.nonce/);
  assert.match(functionsSource, /queueQuestionnaireScheduleSendAtomically/);
  assert.match(functionsSource, /transaction\.create|queueScheduleSendAtomically/);
  assert.doesNotMatch(functionsSource, /batch\.set\(docSnap\.ref/);
  assert.match(functionsSource, /batch\.update\(docSnap\.ref/);
});

test("canary target is closed to every Dashboard client", () => {
  assert.match(
    rulesSource,
    /match \/questionnaireCanaryTargets\/\{targetId\}[\s\S]*allow read, write: if false;/
  );
  assert.match(
    rulesSource,
    /match \/questionnaireSchedulerCanaryControls\/\{controlId\}[\s\S]*allow read, write: if false;/
  );
});

test("runner preserves only aggregate evidence and exact synthetic cleanup", () => {
  assert.match(runnerSource, /error: safeResultError\(error\)/);
  assert.match(runnerSource, /questionnaireSends: 1/);
  assert.match(runnerSource, /mode: "execute-process"/);
  assert.match(runnerSource, /process_canary_send_terminal_mismatch/);
  assert.match(runnerSource, /createCanaryControl\(context, "empty"\)/);
  assert.match(runnerSource, /createCanaryControl\(context, "positive"\)/);
  assert.match(runnerSource, /currentDocument\.updateTime/);
  assert.doesNotMatch(runnerSource, /currentDocument\.exists/);
  assert.match(runnerSource, /readPinnedContactReceipt/);
  assert.match(runnerSource, /discoverPinnedSyntheticContact/);
  assert.match(runnerSource, /cleanupSyntheticGhlTag/);
  assert.match(runnerSource, /mode: "cleanup"/);
  assert.match(runnerSource, /questionnaireSendsDeleted: 0/);
  assert.match(runnerSource, /CFSB_QUESTIONNAIRE_RECOVERY_GO/);
  assert.match(runnerSource, /firestoreRecoveryComplete: true/);
  assert.match(runnerSource, /ghlCleanupStatus/);
  assert.match(runnerSource, /nonTerminalSendEvidencePreserved/);
  assert.match(runnerSource, /cancelCanaryTargetIfOwned/);
  assert.match(runnerSource, /positiveCanaryAttemptExists/);
  assert.match(runnerSource, /positive_canary_release_already_attempted/);
  assert.match(runnerSource, /process_canary_target_tag_not_observed/);
  assert.match(runnerSource, /positive_canary_target_tag_not_observed/);
  assert.match(runnerSource, /synthetic_contact_matches_dashboard_member/);
  assert.match(runnerSource, /CFSB_QUESTIONNAIRE_CANARY_CONTACT_FINGERPRINT/);
  assert.match(runnerSource, /CFSB_QUESTIONNAIRE_PROVISION_CONTACT_GO/);
  assert.match(runnerSource, /mode: "provision-contact"/);
  assert.match(runnerSource, /next: "provision_contact_required"/);
  assert.match(runnerSource, /explicitSyntheticContactCount: 0/);
  assert.match(runnerSource, /synthetic_contact_candidates_not_unique/);
  assert.match(runnerSource, /contacts\/search\/duplicate/);
  assert.match(runnerSource, /number: `\+1\$\{SYNTHETIC_CONTACT_PHONE\}`/);
  assert.match(
    runnerSource,
    /duplicateContactByReservedPhone[\s\S]*allowNotFound: true/
  );
  assert.match(runnerSource, /collectCompleteGhlContactSearch/);
  assert.match(
    runnerSource,
    /fetchTerminalPage:[\s\S]*redirect: "error"/
  );
  assert.match(runnerSource, /assertReservedPhoneNotDashboardMember/);
  assert.match(runnerSource, /coachRxLink\.sourceClientId/);
  assert.match(runnerSource, /historicalGhlTagsAbsent/);
  assert.match(runnerSource, /HISTORICAL_GHL_TAGS/);
  assert.match(runnerSource, /searchReservedPhoneMatches/);
  assert.match(runnerSource, /synthetic_phone_collision_before_create/);
  assert.match(runnerSource, /synthetic_phone_not_unique/);
  assert.match(runnerSource, /acquireProvisionAttemptFence/);
  assert.match(runnerSource, /flag: "wx"/);
  assert.match(runnerSource, /provision_attempt_receipt_invalid/);
  assert.match(runnerSource, /synthetic_contact_provision_attempt_unresolved/);
  assert.match(runnerSource, /synthetic_contact_exists_on_other_reserved_phone/);
  assert.match(runnerSource, /acquireCloudProvisionClaim/);
  assert.match(runnerSource, /SYNTHETIC_CONTACT_PROVISION_CLAIM_ID/);
  assert.match(runnerSource, /sharedProvisionFenceCreated/);
  assert.match(
    runnerSource,
    /if \(!provisionFence\.acquired\)[\s\S]*waitForProvisionedSyntheticContact[\s\S]*created: false,[\s\S]*sharedFenceCreated: true,[\s\S]*contact: recovered/
  );
  assert.match(runnerSource, /ghlWriteRequest\(token, "\/contacts\/", "POST"/);
  assert.match(runnerSource, /dnd: true/);
  assert.match(
    runnerSource,
    /externalWrites:[\s\S]*sharedFenceCreated[\s\S]*provisioned\.created/
  );
  assert.doesNotMatch(runnerSource, /contacts\/upsert/);
  assert.match(runnerSource, /scheduler_job_changed_before_trigger/);
  assert.match(
    runnerSource,
    /async function triggerSchedulerJob[\s\S]*assertCanaryControlReady\(context, controlProof\)[\s\S]*getAndValidateSchedulerJob\(context\)[\s\S]*assertCanaryControlReady\(context, controlProof\)[\s\S]*cloudscheduler\.googleapis\.com/
  );
  assert.match(runnerSource, /scheduler_attempt_deadline_mismatch/);
  assert.match(runnerSource, /scheduler_job_status_invalid/);
  assert.match(runnerSource, /lastExecutionStatusCode/);
  assert.doesNotMatch(runnerSource, /scheduler_job_status_error/);
  assert.match(
    runnerSource,
    /EXPECTED_SCHEDULER_TARGET_URI =[\s\S]*cloudfunctions\.net\/\$\{FUNCTION_ID\}/
  );
  assert.match(runnerSource, /targetUri !== EXPECTED_SCHEDULER_TARGET_URI/);
  assert.match(
    runnerSource,
    /String\(oidc\.audience \|\| ""\) !== EXPECTED_SCHEDULER_TARGET_URI/
  );
  assert.match(runnerSource, /\.hostname\.endsWith\("\.a\.run\.app"\)/);
  assert.doesNotMatch(runnerSource, /targetUri !== functionServiceUri/);
  assert.match(runnerSource, /minimumTtlMs: MINIMUM_CONTROL_TTL_MS/);
  assert.match(runnerSource, /targetTagObserved: tagCleanup\.tagObserved/);
  assert.doesNotMatch(runnerSource, /targetTagApiConfirmed: true/);
  assert.match(runnerSource, /syntheticFixturesRemoved: true/);
  assert.match(runnerSource, /pauseCanaryScheduleIfOwned/);
  assert.match(runnerSource, /waitForRecoverableCanarySendsToQuiesce/);
  assert.match(runnerSource, /externalEffectQuiescent: true/);
  assert.match(runnerSource, /reconcileUncertainCanaryExternalEffects/);
  assert.match(runnerSource, /externalEffectUncertainAt/);
  assert.match(runnerSource, /UNCERTAIN_EFFECT_SETTLEMENT_MS = 20_000/);
  assert.match(runnerSource, /UNCERTAIN_EFFECT_OBSERVATION_ATTEMPTS = 7/);
  assert.match(runnerSource, /uncertainExternalEffectsReconciled/);
  assert.match(runnerSource, /canary_schedule_cleanup_target_mismatch/);
  assert.doesNotMatch(runnerSource, /console\.log\(.*contact/i);
  assert.doesNotMatch(runnerSource, /process\.stdout\.write\(.*phone/i);
  assert.equal(lib.safeResultError(new Error("private@example.com 5145550100")), "unexpected_error");
});

test("runner pagination keeps the reviewed Firestore bounds and token guard", () => {
  const pageSize = Number(
    runnerSource.match(/const PAGE_SIZE = (\d+);/)?.[1] || 0
  );
  const maxPages = Number(
    runnerSource.match(/const MAX_PAGES = (\d+);/)?.[1] || 0
  );
  assert.equal(pageSize, 500);
  assert.equal(maxPages, 30);
  assert.match(runnerSource, /const seenPageTokens = new Set\(\);/);
  assert.match(
    runnerSource,
    /throw new CanaryError\("firestore_pagination_token_repeated"\)/
  );
  assert.match(
    runnerSource,
    /throw new CanaryError\("firestore_pagination_limit"\)/
  );
});
