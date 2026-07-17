const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "app.js"), "utf8");
const functionsSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Fonction introuvable: ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Fonction incomplete: ${name}`);
}

function extractConst(source, name, nextName) {
  const start = source.indexOf(`const ${name} =`);
  const end = source.indexOf(`const ${nextName} =`, start);
  if (start < 0 || end < 0) throw new Error(`Constante introuvable: ${name}`);
  return source.slice(start, end).trim();
}

const schemaSource = extractConst(appSource, "QUESTIONNAIRE_READING_SCHEMAS", "AUTH_REDIRECT_STARTED_KEY");
const sandbox = {};
vm.runInNewContext(`${schemaSource}\nglobalThis.schemas = QUESTIONNAIRE_READING_SCHEMAS;`, sandbox, {
  filename: "questionnaire-reading-schemas.js"
});

const expectedFields = {
  suivi_global: [
    "followup_type", "general_state", "motivation_level", "progress_toward_goal",
    "recent_success_type", "recent_success", "last_30_days_attendance",
    "results_satisfaction_score", "current_challenges", "upcoming_changes",
    "upcoming_changes_details", "goal_status", "goal_clarity_score", "goal_change_detail",
    "coach_alignment_score", "program_fit", "improvements_requested",
    "program_adjustment_detail", "pain_status", "open_note", "pain_detail",
    "final_position", "contact_request", "support_needed"
  ],
  habitudes_quotidiennes: [
    "habits_priorities", "habits_rhythm", "habits_water", "habits_movement30",
    "habits_outdoor15", "habits_sleep7", "habits_bowel_daily", "habits_focus",
    "habits_priority", "habits_support"
  ],
  evaluation_habitudes_vie: [
    "eval_main_goal", "eval_obstacles", "eval_readiness", "eval_meals", "eval_protein",
    "eval_fruits_vegetables", "eval_hydration", "eval_nutrition_note", "eval_sleep",
    "eval_sleep_quality", "eval_stress", "eval_recovery_note", "eval_energy",
    "eval_movement_outside_training", "eval_pain", "eval_body_note", "eval_next_focus",
    "eval_commitment", "eval_contact"
  ]
};

const schemaCoverage = Object.fromEntries(Object.entries(expectedFields).map(([type, keys]) => {
  const actual = new Set((sandbox.schemas[type]?.sections || []).flatMap((section) => section.fields.map(([key]) => key)));
  return [type, keys.every((key) => actual.has(key)) && actual.size === keys.length];
}));

const unknownFunction = extractFunction(appSource, "questionnaireUnknownAnswers");
const unknownSandbox = {
  questionnaireSignalLabel: (key) => key.replace(/_/g, " "),
  keyOf: (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "")
};
vm.runInNewContext(`${unknownFunction}\nglobalThis.readUnknown = questionnaireUnknownAnswers;`, unknownSandbox, {
  filename: "questionnaire-reading-unknown.js"
});

const unknownItems = Array.from({ length: 9 }, (_, index) => ({
  label: `Question supplementaire ${index + 1}`,
  value: `Reponse ${index + 1}`
}));
const unknownResult = unknownSandbox.readUnknown(
  { answers: { known: "Connu", other_responses: unknownItems } },
  { sections: [{ fields: [["known", "Question connue"]] }] }
);

const backendAnswers = extractFunction(functionsSource, "questionnaireAnswers");
const modalRenderer = extractFunction(appSource, "renderQuestionnaireDetailModal");
const structuredRenderer = extractFunction(appSource, "renderQuestionnaireStructuredAnswers");

const results = {
  globalSchemaComplete: schemaCoverage.suivi_global,
  checkinSchemaComplete: schemaCoverage.habitudes_quotidiennes,
  lifestyleSchemaComplete: schemaCoverage.evaluation_habitudes_vie,
  preservesAllUnknownAnswers: unknownResult.length === unknownItems.length,
  noBackendAnswerTruncation: !/\.slice\s*\(\s*0\s*,\s*6\s*\)/.test(backendAnswers),
  backendNormalizesReservedKeys: /reserved\.has\(normalizedKey\)/.test(backendAnswers),
  modalUsesStructuredReading: /renderQuestionnaireStructuredAnswers\(response, highlights\)/.test(modalRenderer),
  modalDoesNotRepeatSignalPanel: !/renderQuestionnaireSignalList\(highlights\)/.test(modalRenderer),
  structuredReadingDoesNotTruncate: !/\.slice\s*\(/.test(structuredRenderer)
};

const failures = Object.entries(results)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({ ok: failures.length === 0, results, failures }, null, 2));
if (failures.length) process.exit(1);
