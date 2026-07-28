import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(import.meta.url);
const submission = require(path.join(
  root,
  "firebase-dashboard",
  "public",
  "questionnaire",
  "questionnaire-submission.js"
));
const endpointUrl = "https://script.google.com/macros/s/testDeployment_123456/exec";

test("frontend submission waits for a positive durable receipt", async () => {
  let fetchOptions = null;
  const payload = { response_id: "resp-test-12345678", answers: {} };
  const receipt = await submission.submit({
    endpointUrl,
    payload,
    fetchImpl: async (_url, options) => {
      fetchOptions = options;
      return { type: "opaque" };
    },
    receiptDelaysMs: [0],
    receiptRequest: async (_url, responseId) => ({
      ok: true,
      stored: true,
      response_id: responseId
    })
  });

  assert.equal(receipt.stored, true);
  assert.equal(fetchOptions.method, "POST");
  assert.equal(fetchOptions.mode, "no-cors");
  assert.equal(fetchOptions.headers["Content-Type"], "text/plain;charset=utf-8");
  assert.deepEqual(JSON.parse(fetchOptions.body), payload);
});

test("frontend never reports success without a matching receipt", async () => {
  await assert.rejects(
    submission.submit({
      endpointUrl,
      payload: { response_id: "resp-test-87654321", answers: {} },
      fetchImpl: async () => ({ type: "opaque" }),
      receiptDelaysMs: [0, 0],
      receiptRequest: async () => ({ ok: true, stored: false })
    }),
    /questionnaire_submission_unconfirmed/
  );
});

test("frontend refuses an endpoint that could execute arbitrary JSONP", async () => {
  let called = false;
  await assert.rejects(
    submission.submit({
      endpointUrl: "https://example.com/collect",
      payload: { response_id: "resp-test-87654321", answers: {} },
      fetchImpl: async () => {
        called = true;
      }
    }),
    /questionnaire_endpoint_untrusted/
  );
  assert.equal(called, false);
});

class FakeRange {
  constructor(sheet, row, column, rowCount, columnCount) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  getValues() {
    return Array.from({ length: this.rowCount }, (_, rowOffset) => (
      Array.from({ length: this.columnCount }, (_, columnOffset) => (
        this.sheet.rows[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? ""
      ))
    ));
  }

  getDisplayValues() {
    return this.getValues().map((row) => row.map((value) => String(value ?? "")));
  }

  setValues(values) {
    values.forEach((valuesRow, rowOffset) => {
      const rowIndex = this.row - 1 + rowOffset;
      this.sheet.rows[rowIndex] ||= [];
      valuesRow.forEach((value, columnOffset) => {
        this.sheet.rows[rowIndex][this.column - 1 + columnOffset] = value;
      });
    });
    return this;
  }

  setFontWeight() {
    return this;
  }

  createTextFinder(needle) {
    const range = this;
    let exact = false;
    return {
      matchEntireCell(value) {
        exact = Boolean(value);
        return this;
      },
      findNext() {
        for (let rowOffset = 0; rowOffset < range.rowCount; rowOffset += 1) {
          for (let columnOffset = 0; columnOffset < range.columnCount; columnOffset += 1) {
            const value = String(
              range.sheet.rows[range.row - 1 + rowOffset]?.[range.column - 1 + columnOffset] ?? ""
            );
            const matches = exact ? value === String(needle) : value.includes(String(needle));
            if (matches) {
              return { getRow: () => range.row + rowOffset };
            }
          }
        }
        return null;
      }
    };
  }
}

class FakeSheet {
  constructor(headers) {
    this.rows = [headers.slice()];
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }

  getLastRow() {
    return this.rows.length;
  }

  getLastColumn() {
    return Math.max(0, ...this.rows.map((row) => row.length));
  }

  appendRow(row) {
    this.rows.push(row.slice());
  }

  setFrozenRows() {}

  autoResizeColumns() {}
}

function appsScriptContext() {
  const source = fs.readFileSync(path.join(root, "apps-script", "auto-009-code.gs"), "utf8");
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error
  });
  vm.runInContext(source, context, { filename: "auto-009-code.gs" });
  const headers = vm.runInContext("RESPONSE_HEADERS.slice()", context);
  const sheet = new FakeSheet(headers);
  const spreadsheet = {
    getSheetByName: () => sheet,
    insertSheet: () => sheet
  };
  let flushCount = 0;
  context.SpreadsheetApp = {
    openById: () => spreadsheet,
    flush: () => {
      flushCount += 1;
    }
  };
  context.LockService = {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {}
    })
  };
  return { context, sheet, flushCount: () => flushCount };
}

function payloadFor(schemaVersion) {
  return {
    source: "cfsb-client-coach-questionnaire",
    schema_version: schemaVersion,
    response_id: `resp-schema-${schemaVersion.replace(".", "-")}-1234`,
    submitted_at: "2026-07-27T12:00:00.000Z",
    client_name: "Canari Questionnaire",
    client_phone: "4505550101",
    questionnaire_type: "evaluation_habitudes_vie",
    answers: {},
    triage: { status: "vert", coach_action_type: "aucune_action_urgente" },
    meta: { source_app: "test" }
  };
}

test("Apps Script accepts schemas 1.0, 1.1 and 1.2 and maps current identity fields", () => {
  const { context } = appsScriptContext();
  for (const version of ["1.0", "1.1", "1.2"]) {
    const payload = payloadFor(version);
    assert.doesNotThrow(() => context.validatePayload_(payload));
    const fallback = context.fallbackTokenRecord_(payload);
    const normalized = context.normalizeSubmission_(payload, fallback, new Date());
    assert.equal(normalized.client_name, "Canari Questionnaire");
    assert.equal(normalized.client_phone_normalized, "4505550101");
    assert.equal(normalized.followup_type, "evaluation_habitudes_vie");
  }
  assert.throws(() => context.validatePayload_(payloadFor("2.0")), /Invalid schema_version/);
});

test("Apps Script stores one immutable source row per response_id and serves its receipt", () => {
  const { context, sheet, flushCount } = appsScriptContext();
  const original = {
    response_id: "resp-idempotent-1234",
    submitted_at: "2026-07-27T12:00:00.000Z",
    received_at: "2026-07-27T12:00:01.000Z",
    client_name: "Original"
  };
  const first = context.appendResponse_(original);
  const second = context.appendResponse_({ ...original, client_name: "Overwrite attempt" });

  assert.equal(first.status, "created");
  assert.equal(second.status, "duplicate");
  assert.equal(second.record.client_name, "Original");
  assert.equal(sheet.rows.length, 2);
  assert.equal(flushCount(), 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.questionnaireReceipt_({ response_id: original.response_id }))),
    { ok: true, stored: true, response_id: original.response_id }
  );
});

test("all three hosted questionnaires load the receipt helper and avoid direct success-on-fetch", () => {
  const questionnaireRoot = path.join(root, "firebase-dashboard", "public", "questionnaire");
  const sharedForm = fs.readFileSync(path.join(questionnaireRoot, "questionnaire-form.js"), "utf8");
  const globalForm = fs.readFileSync(path.join(questionnaireRoot, "index.html"), "utf8");
  const checkIn = fs.readFileSync(path.join(questionnaireRoot, "check-in", "index.html"), "utf8");
  const habits = fs.readFileSync(
    path.join(questionnaireRoot, "evaluation-habitudes-vie", "index.html"),
    "utf8"
  );

  assert.match(sharedForm, /CFSBQuestionnaireSubmission\.submit/);
  assert.doesNotMatch(sharedForm, /await fetch\(ENDPOINT_URL/);
  assert.match(globalForm, /CFSBQuestionnaireSubmission\.submit/);
  assert.doesNotMatch(globalForm, /params\.get\("endpoint"\)\s*\|\|/);
  assert.match(checkIn, /questionnaire-submission\.js/);
  assert.match(habits, /questionnaire-submission\.js/);
});
