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
