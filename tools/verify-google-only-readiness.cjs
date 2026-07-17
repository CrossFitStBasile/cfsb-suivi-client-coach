const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const expectedQuestionnaireUrl = "https://cfsb-dashboard-coach-aa9a4.web.app/questionnaire/";
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
}

const firebaseConfig = JSON.parse(read("firebase.json"));
const frontend = read("firebase-dashboard/public/app.js");
const functions = read("functions/index.js");
const hostedForm = read("firebase-dashboard/public/questionnaire/index.html");
const hostedCheckInForm = read("firebase-dashboard/public/questionnaire/check-in/index.html");
const hostedEvaluationForm = read("firebase-dashboard/public/questionnaire/evaluation-habitudes-vie/index.html");
const hostedQuestionnaireApp = read("firebase-dashboard/public/questionnaire/questionnaire-form.js");
const hostedCoaches = read("firebase-dashboard/public/questionnaire/coaches.json");
const sourceCoaches = read("coaches.json");

check(
  "Firebase Hosting sert le dossier public du dashboard",
  firebaseConfig.hosting?.public === "firebase-dashboard/public",
  firebaseConfig.hosting?.public || "configuration absente"
);
check(
  "Le formulaire Firebase Hosting existe",
  hostedForm.includes('const APP_VERSION = "firebase-hosting-v1-google-only";'),
  "firebase-dashboard/public/questionnaire/index.html"
);
check(
  "Le Check-in Firebase Hosting existe",
  hostedCheckInForm.includes('data-questionnaire-type="habitudes_quotidiennes"'),
  "/questionnaire/check-in/"
);
check(
  "L'evaluation habitudes de vie Firebase Hosting existe",
  hostedEvaluationForm.includes('data-questionnaire-type="evaluation_habitudes_vie"'),
  "/questionnaire/evaluation-habitudes-vie/"
);
check(
  "Le registre public du formulaire est copie sans modification",
  hostedCoaches === sourceCoaches,
  "firebase-dashboard/public/questionnaire/coaches.json"
);
check(
  "Le frontend ouvre le formulaire Firebase",
  frontend.includes(`const QUESTIONNAIRE_BASE_URL = "${expectedQuestionnaireUrl}";`),
  expectedQuestionnaireUrl
);
check(
  "Les Functions generent les liens Firebase",
  functions.includes(`const QUESTIONNAIRE_URL = "${expectedQuestionnaireUrl}";`),
  expectedQuestionnaireUrl
);
check(
  "Aucune URL GitHub Pages active dans le frontend",
  !frontend.includes("crossfitstbasile.github.io"),
  "firebase-dashboard/public/app.js"
);
check(
  "Aucune URL GitHub Pages active dans les Functions",
  !functions.includes("crossfitstbasile.github.io"),
  "functions/index.js"
);
check(
  "Aucune URL GitHub Pages active dans les formulaires",
  ![hostedForm, hostedCheckInForm, hostedEvaluationForm, hostedQuestionnaireApp].join("\n").includes("github.io"),
  "Firebase Hosting uniquement"
);
check(
  "Les liens de formulaire ne dependent pas des variables GHL",
  ![hostedForm, hostedCheckInForm, hostedEvaluationForm, hostedQuestionnaireApp].join("\n").includes("{{contact"),
  "liens fixes"
);

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} - ${item.name}: ${item.detail}`);
}

const failures = checks.filter((item) => !item.ok);
console.log(`\nGoogle-only readiness: ${checks.length - failures.length}/${checks.length}`);
if (failures.length) process.exit(1);
