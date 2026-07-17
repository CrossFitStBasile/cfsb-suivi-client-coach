const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
}

const globalForm = read("firebase-dashboard/public/questionnaire/index.html");
const checkInForm = read("firebase-dashboard/public/questionnaire/check-in/index.html");
const evaluationForm = read("firebase-dashboard/public/questionnaire/evaluation-habitudes-vie/index.html");
const sharedForm = read("firebase-dashboard/public/questionnaire/questionnaire-form.js");
const frontend = read("firebase-dashboard/public/app.js");
const functions = read("functions/index.js");
const allPublicQuestionnaireFiles = [globalForm, checkInForm, evaluationForm, sharedForm].join("\n");

check(
  "Le Globale check conserve sa route historique",
  globalForm.includes('const QUESTIONNAIRE_TYPE = "suivi_global";'),
  "/questionnaire/"
);
check(
  "Le Check-in a une route Firebase distincte",
  checkInForm.includes('data-questionnaire-type="habitudes_quotidiennes"'),
  "/questionnaire/check-in/"
);
check(
  "L'evaluation a une route Firebase distincte",
  evaluationForm.includes('data-questionnaire-type="evaluation_habitudes_vie"'),
  "/questionnaire/evaluation-habitudes-vie/"
);
check(
  "Les trois formulaires utilisent le meme endpoint Workspace",
  globalForm.includes("AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA")
    && sharedForm.includes("AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA"),
  "Apps Script CSM existant"
);
check(
  "Aucun lien GHL ne depend de variables contact dans les formulaires",
  !allPublicQuestionnaireFiles.includes("{{contact"),
  "liens fixes sans merge fields"
);
check(
  "Aucune dependance GitHub Pages dans les formulaires",
  !allPublicQuestionnaireFiles.includes("github.io"),
  "Firebase Hosting uniquement"
);

const checkInFields = [
  "habits_priorities",
  "habits_rhythm",
  "habits_water",
  "habits_movement30",
  "habits_outdoor15",
  "habits_sleep7",
  "habits_bowel_daily",
  "habits_focus",
  "habits_priority",
  "habits_support"
];
const evaluationFields = [
  "eval_main_goal",
  "eval_obstacles",
  "eval_readiness",
  "eval_meals",
  "eval_protein",
  "eval_fruits_vegetables",
  "eval_hydration",
  "eval_nutrition_note",
  "eval_sleep",
  "eval_sleep_quality",
  "eval_stress",
  "eval_recovery_note",
  "eval_energy",
  "eval_movement_outside_training",
  "eval_pain",
  "eval_body_note",
  "eval_next_focus",
  "eval_commitment",
  "eval_contact"
];
check(
  "Le contrat Check-in est complet",
  checkInFields.every((field) => sharedForm.includes(`name: "${field}"`)),
  `${checkInFields.length} champs`
);
check(
  "Le contrat Evaluation est complet",
  evaluationFields.every((field) => sharedForm.includes(`name: "${field}"`)),
  `${evaluationFields.length} champs`
);
check(
  "Le dashboard genere les trois routes Firebase",
  frontend.includes('path: "/questionnaire/"')
    && frontend.includes('path: "/questionnaire/check-in/"')
    && frontend.includes('path: "/questionnaire/evaluation-habitudes-vie/"'),
  "frontend"
);
check(
  "Les Functions generent les trois routes Firebase",
  functions.includes('path: "/questionnaire/"')
    && functions.includes('path: "/questionnaire/check-in/"')
    && functions.includes('path: "/questionnaire/evaluation-habitudes-vie/"'),
  "backend"
);
check(
  "L'import Firebase deplie le JSON brut Apps Script",
  functions.includes("function expandQuestionnaireRow(row)")
    && functions.includes("rawPayload.answers")
    && functions.includes("raw_payload_json"),
  "compatibilite sans changement Apps Script"
);

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} - ${item.name}: ${item.detail}`);
}

const failures = checks.filter((item) => !item.ok);
console.log(`\nFirebase questionnaire suite: ${checks.length - failures.length}/${checks.length}`);
if (failures.length) process.exit(1);
