import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildQuestionnaireAccessUrl,
  readQuestionnaireAccessToken
} from "../firebase-dashboard/public/questionnaire/questionnaire-access.mjs";
import {
  QuestionnaireSubmissionError,
  submitQuestionnaireWithAcknowledgement
} from "../firebase-dashboard/public/questionnaire/questionnaire-submission.mjs";

const OPAQUE_TOKEN = "v1.opaque-selector-without-pii.1780000000000.server-signature";

test("questionnaire URLs contain only the opaque server token and lock marker", () => {
  const result = buildQuestionnaireAccessUrl({
    baseUrl: "https://dashboard.example.test/questionnaire/?phone=4505551212&client_name=Julie#old",
    path: "/questionnaire/evaluation-habitudes-vie/?email=julie@example.test&coach=Marc",
    accessToken: OPAQUE_TOKEN,
    clientName: "Julie Exemple",
    clientPhone: "4505551212",
    clientEmail: "julie@example.test",
    coachName: "Marc Exemple"
  });
  const url = new URL(result);

  assert.deepEqual([...url.searchParams.keys()], ["access_token", "lock_context"]);
  assert.equal(url.searchParams.get("access_token"), OPAQUE_TOKEN);
  assert.equal(url.searchParams.get("lock_context"), "1");
  assert.equal(url.hash, "");
  assert.doesNotMatch(result, /Julie|4505551212|julie%40|coach=/i);
});

test("future questionnaire pages accept generic token aliases without resolving them client-side", () => {
  for (const alias of ["access_token", "token", "t"]) {
    const params = new URLSearchParams({ [alias]: OPAQUE_TOKEN });
    assert.equal(readQuestionnaireAccessToken(params), OPAQUE_TOKEN);
  }
  assert.equal(readQuestionnaireAccessToken(new URLSearchParams()), "");
  assert.throws(
    () => buildQuestionnaireAccessUrl({ baseUrl: "https://dashboard.example.test", accessToken: "" }),
    (error) => error.code === "missing_access_token"
  );
});

test("dashboard source cannot create PII questionnaire URLs or enqueue browser sends", async () => {
  const source = await readFile(
    new URL("../firebase-dashboard/public/app.js", import.meta.url),
    "utf8"
  );
  const sendFunction = source.slice(
    source.indexOf("async function journalQuestionnaireSend"),
    source.indexOf("async function saveQuestionnaireSchedule")
  );

  assert.doesNotMatch(source, /questionnaireUrlForClient/);
  assert.doesNotMatch(source, /searchParams\.set\(["'](?:phone|client_name|client_email|coach_name|name|email|coach)["']/i);
  assert.doesNotMatch(sendFunction, /addDoc|questionnaireSends/);
  assert.match(sendFunction, /indisponible dans cette branche Phase 1/i);
});

test("submission fails closed before fetch when no ACK endpoint is configured", async () => {
  let fetchCalled = false;
  await assert.rejects(
    submitQuestionnaireWithAcknowledgement({
      endpoint: "",
      accessToken: OPAQUE_TOKEN,
      payload: { answer: "test" },
      fetchImpl: async () => {
        fetchCalled = true;
      }
    }),
    (error) => error instanceof QuestionnaireSubmissionError && error.code === "endpoint_not_configured"
  );
  assert.equal(fetchCalled, false);
});

test("submission succeeds only after an HTTP JSON acknowledgement with ok true", async () => {
  let request;
  const acknowledgement = await submitQuestionnaireWithAcknowledgement({
    endpoint: "https://api.example.test/questionnaire-responses",
    accessToken: OPAQUE_TOKEN,
    payload: { answer: "stable" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, acknowledgementId: "ack_123" };
        }
      };
    }
  });

  assert.equal(acknowledgement.acknowledgementId, "ack_123");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.mode, undefined);
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.options.body), {
    answer: "stable",
    access_token: OPAQUE_TOKEN
  });
});

test("HTTP success without a positive JSON acknowledgement remains a failure", async (t) => {
  await t.test("invalid JSON", async () => {
    await assert.rejects(
      submitQuestionnaireWithAcknowledgement({
        endpoint: "https://api.example.test/questionnaire-responses",
        accessToken: OPAQUE_TOKEN,
        payload: {},
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          async json() {
            throw new SyntaxError("invalid JSON");
          }
        })
      }),
      (error) => error.code === "invalid_acknowledgement"
    );
  });

  await t.test("negative JSON acknowledgement", async () => {
    await assert.rejects(
      submitQuestionnaireWithAcknowledgement({
        endpoint: "https://api.example.test/questionnaire-responses",
        accessToken: OPAQUE_TOKEN,
        payload: {},
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          async json() {
            return { ok: false };
          }
        })
      }),
      (error) => error.code === "negative_acknowledgement"
    );
  });

  await t.test("HTTP error", async () => {
    await assert.rejects(
      submitQuestionnaireWithAcknowledgement({
        endpoint: "https://api.example.test/questionnaire-responses",
        accessToken: OPAQUE_TOKEN,
        payload: {},
        fetchImpl: async () => ({ ok: false, status: 503 })
      }),
      (error) => error.code === "http_not_ok"
    );
  });
});

test("active questionnaire form has no no-cors transport or hard-coded Apps Script endpoint", async () => {
  const relativePaths = [
    "../firebase-dashboard/public/app.js",
    "../firebase-dashboard/public/questionnaire/questionnaire-form.js",
    "../firebase-dashboard/public/questionnaire/index.html",
    "../firebase-dashboard/public/questionnaire/check-in/index.html",
    "../firebase-dashboard/public/questionnaire/evaluation-habitudes-vie/index.html"
  ];
  const sources = await Promise.all(relativePaths.map(async (relativePath) => ({
    relativePath,
    source: await readFile(new URL(relativePath, import.meta.url), "utf8")
  })));

  for (const { relativePath, source } of sources) {
    assert.doesNotMatch(source, /no-cors/i, `${relativePath} ne doit contenir aucun transport opaque`);
    assert.doesNotMatch(source, /script\.google\.com|AKfy/i, `${relativePath} ne doit contenir aucun endpoint historique`);
    assert.doesNotMatch(
      source,
      /searchParams\.set\(["'](?:phone|client_name|client_email|coach_name|name|email|coach)["']/i,
      `${relativePath} ne doit construire aucun parametre PII`
    );
  }

  const formSource = sources.find(({ relativePath }) => relativePath.endsWith("questionnaire-form.js"))?.source || "";
  const rootPage = sources.find(({ relativePath }) => relativePath.endsWith("questionnaire/index.html"))?.source || "";
  assert.match(formSource, /submitQuestionnaireWithAcknowledgement/);
  assert.doesNotMatch(rootPage, /<form|<script/i);
  assert.match(rootPage, /Aucune réponse ne peut être envoyée/i);
});
