"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  QuestionnaireTokenError,
  buildQuestionnaireAccessUrl,
  createQuestionnaireAccessToken,
  verifyQuestionnaireAccessToken
} = require("../questionnaire-link");

const SECRET = "test-only-questionnaire-secret-with-32-bytes-minimum";
const NOW = 1_800_000_000_000;

function issue(overrides = {}) {
  return createQuestionnaireAccessToken({
    secret: SECRET,
    sendId: "send_12345678",
    clientId: "018f7b68-8aa0-70f0-8a33-8f214b5ce90e",
    questionnaireType: "evaluation_habitudes_vie",
    ttlSeconds: 600,
    nowMs: NOW,
    randomBytes: () => Buffer.alloc(32, 7),
    ...overrides
  });
}

test("le jeton opaque est lie au sendId/clientId cote serveur", () => {
  const issued = issue();
  const verified = verifyQuestionnaireAccessToken({
    token: issued.token,
    secret: SECRET,
    binding: issued.binding,
    nowMs: NOW + 1
  });

  assert.equal(verified.sendId, "send_12345678");
  assert.equal(verified.clientId, "018f7b68-8aa0-70f0-8a33-8f214b5ce90e");
  assert.equal(verified.questionnaireType, "evaluation_habitudes_vie");
  assert.equal(issued.token.includes(verified.clientId), false);
  assert.equal(issued.token.includes(verified.sendId), false);
});

test("l'URL ne contient aucune PII ni identifiant client", () => {
  const issued = issue();
  const url = buildQuestionnaireAccessUrl({
    baseUrl: "https://cfsb-dashboard-coach-aa9a4.web.app",
    path: "/questionnaire/evaluation-habitudes-vie/",
    token: issued.token
  });
  const parsed = new URL(url);

  assert.deepEqual([...parsed.searchParams.keys()].sort(), ["access_token", "lock_context"]);
  assert.equal(url.includes("Julie"), false);
  assert.equal(url.includes("5145551212"), false);
  assert.equal(url.includes("client_name"), false);
  assert.equal(url.includes("client_email"), false);
  assert.throws(
    () => buildQuestionnaireAccessUrl({
      baseUrl: "https://cfsb-dashboard-coach-aa9a4.web.app",
      path: "https://evil.example/questionnaire/",
      token: issued.token
    }),
    (error) => error.code === "invalid_url"
  );
});

test("un jeton modifie ou expire est refuse", () => {
  const issued = issue();
  const tampered = `${issued.token.slice(0, -1)}x`;
  assert.throws(
    () => verifyQuestionnaireAccessToken({
      token: tampered,
      secret: SECRET,
      binding: issued.binding,
      nowMs: NOW + 1
    }),
    (error) => error instanceof QuestionnaireTokenError
      && ["invalid_signature", "binding_mismatch"].includes(error.code)
  );
  assert.throws(
    () => verifyQuestionnaireAccessToken({
      token: issued.token,
      secret: SECRET,
      binding: issued.binding,
      nowMs: NOW + 600_000
    }),
    (error) => error.code === "expired_token"
  );
});

test("une liaison d'un autre envoi ne valide pas le jeton", () => {
  const first = issue();
  const second = issue({ randomBytes: () => Buffer.alloc(32, 8) });
  assert.throws(
    () => verifyQuestionnaireAccessToken({
      token: first.token,
      secret: SECRET,
      binding: second.binding,
      nowMs: NOW + 1
    }),
    (error) => error.code === "binding_mismatch"
  );
});
