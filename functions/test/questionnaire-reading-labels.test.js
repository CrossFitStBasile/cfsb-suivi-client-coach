"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Fonction introuvable: ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Fonction incomplète: ${name}`);
}

function loadReadingHelpers() {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../firebase-dashboard/public/app.js"),
    "utf8"
  );
  const sandbox = {
    keyOf: (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, ""),
    questionnaireSignalLabel: (key) => String(key || "").replace(/_/g, " ")
  };
  vm.runInNewContext(`
    ${extractFunction(source, "questionnaireRawAnswer")}
    ${extractFunction(source, "questionnaireStudioAnswer")}
    ${extractFunction(source, "questionnaireStudioReadingSchema")}
    globalThis.helpers = {
      questionnaireStudioAnswer,
      questionnaireStudioReadingSchema
    };
  `, sandbox, { filename: "questionnaire-reading-labels.js" });
  return sandbox.helpers;
}

test("la lecture coach traduit les codes, booléens et choix multiples avec le snapshot", () => {
  const helpers = loadReadingHelpers();
  const response = {
    questionnaireLabel: "Repères test",
    answers: {
      sleep: "under_6",
      plan_ok: false,
      priorities: ["sleep", "nutrition"]
    },
    formSchema: {
      title: "Repères test",
      sections: [
        {
          title: "Portrait",
          fields: [
            {
              id: "sleep",
              type: "single_choice",
              label: "Sommeil",
              options: [
                { value: "under_6", label: "Moins de 6 heures" },
                { value: "seven_plus", label: "7 heures ou plus" }
              ]
            },
            {
              id: "plan_ok",
              type: "yes_no",
              label: "Le plan est-il bon?"
            },
            {
              id: "priorities",
              type: "multi_choice",
              label: "Priorités",
              options: [
                { value: "sleep", label: "Sommeil" },
                { value: "nutrition", label: "Nutrition" }
              ]
            },
            {
              id: "reminder",
              type: "info",
              label: "Rappel"
            }
          ]
        }
      ]
    }
  };
  const schema = helpers.questionnaireStudioReadingSchema(response);
  assert.equal(schema.sections[0].fields.length, 3);
  const [sleep, plan, priorities] = schema.sections[0].fields;
  assert.equal(helpers.questionnaireStudioAnswer(response, sleep), "Moins de 6 heures");
  assert.equal(helpers.questionnaireStudioAnswer(response, plan), "Non");
  assert.equal(helpers.questionnaireStudioAnswer(response, priorities), "Sommeil, Nutrition");
});
