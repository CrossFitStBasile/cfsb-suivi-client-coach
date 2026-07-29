import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const publicSource = await readFile(
  join(
    root,
    "firebase-dashboard",
    "public",
    "questionnaire",
    "f",
    "questionnaire-public.js"
  ),
  "utf8"
);
const publicHtml = await readFile(
  join(
    root,
    "firebase-dashboard",
    "public",
    "questionnaire",
    "f",
    "index.html"
  ),
  "utf8"
);
const firebaseConfig = JSON.parse(
  await readFile(join(root, "firebase.json"), "utf8")
);
const {
  INITIAL_DRAFTS,
  evaluateVisibility,
  publishDraft
} = require("../functions/questionnaire-studio.js");

function durableAcknowledgementGuard(responseId = "submission-browser-0001") {
  const start = publicSource.indexOf(
    "function hasDurableSubmissionAcknowledgement("
  );
  const end = publicSource.indexOf("async function submitQuestionnaire", start);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(
    `(${publicSource.slice(start, end)})`,
    { state: { responseId } }
  );
}

function pendingResponseHelpers(storage, uuids = []) {
  const start = publicSource.indexOf("function createResponseId()");
  const end = publicSource.indexOf("function submissionAnswers()", start);
  assert.ok(start >= 0 && end > start);
  const generated = [...uuids];
  return vm.runInNewContext(
    `(() => {
      ${publicSource.slice(start, end)}
      return {
        pendingResponseStorageKey,
        loadOrCreateResponseId,
        clearPendingResponseId
      };
    })()`,
    {
      window: {
        crypto: {
          randomUUID: () => generated.shift()
        },
        sessionStorage: storage
      },
      PENDING_RESPONSE_STORAGE_PREFIX: "cfsb:questionnaire:pending:",
      RESPONSE_ID_PATTERN: /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
    }
  );
}

class FakeSessionStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("the public form requires the complete durable acknowledgement", () => {
  const responseId = "submission-browser-0001";
  const confirms = durableAcknowledgementGuard(responseId);
  const valid = {
    ok: true,
    response: {
      stored: true,
      idempotencyKey: responseId,
      responseId: "studio_123456789",
      duplicate: false,
      receivedAt: "2026-07-28T15:00:00.000Z"
    }
  };
  assert.equal(confirms(valid), true);

  const mutations = [
    { ...valid, ok: false },
    { ...valid, response: { ...valid.response, stored: false } },
    { ...valid, response: { ...valid.response, idempotencyKey: "another-key" } },
    { ...valid, response: { ...valid.response, responseId: "" } },
    { ...valid, response: { ...valid.response, duplicate: "false" } },
    { ...valid, response: { ...valid.response, receivedAt: "" } }
  ];
  for (const acknowledgement of mutations) {
    assert.equal(confirms(acknowledgement), false);
  }
});

test("the anti-bot field is enforced by both the browser and the public API payload", () => {
  const buildStart = publicSource.indexOf("function buildSubmission()");
  const buildEnd = publicSource.indexOf("function submissionErrorMessage", buildStart);
  const submitStart = publicSource.indexOf("async function submitQuestionnaire()");
  const submitEnd = publicSource.indexOf("async function loadQuestionnaire", submitStart);
  assert.ok(buildStart >= 0 && buildEnd > buildStart);
  assert.ok(submitStart >= 0 && submitEnd > submitStart);

  const buildSource = publicSource.slice(buildStart, buildEnd);
  const submitSource = publicSource.slice(submitStart, submitEnd);
  assert.match(buildSource, /companyWebsite:\s*elements\.honeypot\.value/);
  assert.match(submitSource, /if \(elements\.honeypot\.value\)/);
  assert.ok(
    submitSource.indexOf("if (elements.honeypot.value)")
      < submitSource.indexOf("requestJson(apiUrl(state.slug)"),
    "the browser must stop an obvious bot before the request"
  );
});

test("the pending response key survives reloads and is removed only after its acknowledgement", () => {
  const storage = new FakeSessionStorage();
  const helpers = pendingResponseHelpers(storage, [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222"
  ]);
  const expectedFirst = "questionnaire-11111111-1111-4111-8111-111111111111";
  const expectedSecond = "questionnaire-22222222-2222-4222-8222-222222222222";
  const storageKey = helpers.pendingResponseStorageKey("check-in-express", 1);

  assert.equal(
    helpers.loadOrCreateResponseId("check-in-express", 1),
    expectedFirst
  );
  assert.equal(storage.getItem(storageKey), expectedFirst);
  assert.equal(
    helpers.loadOrCreateResponseId("check-in-express", 1),
    expectedFirst,
    "a reload in the same browser tab must reuse the pending key"
  );

  helpers.clearPendingResponseId("check-in-express", 1, "another-response");
  assert.equal(
    storage.getItem(storageKey),
    expectedFirst,
    "an acknowledgement for another response must not clear the pending key"
  );

  helpers.clearPendingResponseId("check-in-express", 1, expectedFirst);
  assert.equal(storage.getItem(storageKey), null);
  assert.equal(
    helpers.loadOrCreateResponseId("check-in-express", 1),
    expectedSecond,
    "a confirmed response must start a fresh key on the next load"
  );
});

test("the pending response key is scoped by form version and degrades safely when storage is blocked", () => {
  const storage = new FakeSessionStorage();
  const helpers = pendingResponseHelpers(storage, [
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444"
  ]);
  assert.notEqual(
    helpers.pendingResponseStorageKey("check-in-express", 1),
    helpers.pendingResponseStorageKey("check-in-express", 2)
  );
  assert.notEqual(
    helpers.pendingResponseStorageKey("check-in-express", 1),
    helpers.pendingResponseStorageKey("bilan-90-jours", 1)
  );

  const blockedStorage = {
    getItem() {
      throw new Error("storage blocked");
    },
    setItem() {
      throw new Error("storage blocked");
    },
    removeItem() {
      throw new Error("storage blocked");
    }
  };
  const blockedHelpers = pendingResponseHelpers(blockedStorage, [
    "55555555-5555-4555-8555-555555555555"
  ]);
  assert.equal(
    blockedHelpers.loadOrCreateResponseId("check-in-express", 1),
    "questionnaire-55555555-5555-4555-8555-555555555555"
  );
  assert.doesNotThrow(() =>
    blockedHelpers.clearPendingResponseId(
      "check-in-express",
      1,
      "questionnaire-55555555-5555-4555-8555-555555555555"
    )
  );
});

test("the member sees the privacy purpose, policy and access or rectification path before identity fields", () => {
  const start = publicSource.indexOf("function createIdentityPage()");
  const end = publicSource.indexOf("function createSectionPage(", start);
  assert.ok(start >= 0 && end > start);
  const identitySource = publicSource.slice(start, end);

  assert.match(
    publicSource,
    /https:\/\/crossfitstbasilelegrand\.com\/privacy\//
  );
  assert.match(identitySource, /createPrivacyNotice\(\)/);
  assert.match(identitySource, /personnes autorisées de l’équipe CFSB/);
  assert.match(identitySource, /demander l’accès à tes renseignements/);
  assert.match(identitySource, /leur rectification/);
  assert.match(identitySource, /noopener noreferrer/);
  assert.match(identitySource, /ouvre un nouvel onglet/);
  assert.ok(
    identitySource.indexOf("createPrivacyNotice()")
      < identitySource.indexOf("page.append(heading, privacyNotice, fields)"),
    "the notice must be built before the identity fields are appended"
  );
});

test("public form state and step focus targets are accessible after navigation or errors", () => {
  assert.match(
    publicHtml,
    /id="errorState" role="alert" tabindex="-1"/
  );
  assert.match(
    publicHtml,
    /id="inactiveState" role="status" tabindex="-1"/
  );
  assert.match(
    publicHtml,
    /id="successState" role="status" aria-live="polite" tabindex="-1"/
  );
  assert.match(publicSource, /function createPageTitle\(text\)/);
  assert.match(publicSource, /title\.tabIndex = -1/);
  assert.match(publicSource, /elements\.inactive\.focus\?\.\(\)/);
  assert.match(publicSource, /elements\.error\.focus\?\.\(\)/);
  assert.match(publicSource, /Modifier l’identification/);
  assert.match(publicSource, /Modifier la section \$\{page\.title\}/);
});

test("an idempotency conflict does not tell the member to create another submission", () => {
  const start = publicSource.indexOf("function submissionErrorMessage(");
  const end = publicSource.indexOf("function showSuccess(", start);
  assert.ok(start >= 0 && end > start);
  const errorSource = publicSource.slice(start, end);
  assert.match(errorSource, /Ne l’envoie pas de nouveau/);
  assert.doesNotMatch(
    errorSource,
    /IDEMPOTENCY[\s\S]*Recharge la page et réessaie/
  );
});

test("Firebase Hosting hardens only the public Studio route without changing global no-store", () => {
  const rules = firebaseConfig.hosting?.headers || [];
  const globalRule = rules.find((rule) => rule.source === "**");
  const publicFormRule = rules.find(
    (rule) => rule.source === "/questionnaire/f/**"
  );
  assert.deepEqual(globalRule?.headers, [
    { key: "Cache-Control", value: "no-store" }
  ]);
  assert.ok(publicFormRule, "the public Studio route needs dedicated headers");

  const headers = Object.fromEntries(
    publicFormRule.headers.map((header) => [header.key, header.value])
  );
  const directives = Object.fromEntries(
    headers["Content-Security-Policy"]
      .split(";")
      .map((directive) => directive.trim().split(/\s+/, 1)[0])
      .map((name) => [
        name,
        headers["Content-Security-Policy"]
          .split(";")
          .map((directive) => directive.trim())
          .find((directive) => directive.startsWith(`${name} `))
      ])
  );

  assert.equal(directives["script-src"], "script-src 'self'");
  assert.equal(directives["connect-src"], "connect-src 'self'");
  assert.equal(directives["frame-ancestors"], "frame-ancestors 'none'");
  assert.equal(directives["object-src"], "object-src 'none'");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.match(headers["Permissions-Policy"], /camera=\(\)/);
  assert.match(headers["Permissions-Policy"], /microphone=\(\)/);
  assert.match(headers["Permissions-Policy"], /geolocation=\(\)/);
});

test("the public route strips query parameters and fragments instead of using member data", () => {
  const start = publicSource.indexOf("function prepareCanonicalLocation(");
  const end = publicSource.indexOf("function apiUrl(", start);
  assert.ok(start >= 0 && end > start);
  const canonicalSource = publicSource.slice(start, end);
  assert.match(canonicalSource, /const path = `\/questionnaire\/f\/\$\{encodeURIComponent\(slug\)\}`/);
  assert.match(canonicalSource, /window\.location\.search/);
  assert.match(canonicalSource, /window\.location\.hash/);
  assert.match(canonicalSource, /window\.history\.replaceState\(null, "", path\)/);
  assert.doesNotMatch(
    canonicalSource,
    /\b(?:clientId|phone|email|name|coachId)\b/
  );
});

test("the check-in comment appears only after at least one negative answer", () => {
  const definition = publishDraft(INITIAL_DRAFTS.checkIn, {
    version: "1",
    publishedAt: "2026-07-28T00:00:00.000Z"
  });
  const positive = {
    plan_still_good: true,
    execution_good: true,
    results_present: true
  };
  assert.equal(
    evaluateVisibility(definition, positive).includes("check_in_comment"),
    false
  );
  assert.equal(
    evaluateVisibility(definition, {
      ...positive,
      execution_good: false
    }).includes("check_in_comment"),
    true
  );
});
