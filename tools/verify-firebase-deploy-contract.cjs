const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const firebaseJsonPath = path.join(root, "firebase.json");
const functionsPackagePath = path.join(root, "functions", "package.json");
const functionsLockPath = path.join(root, "functions", "package-lock.json");
const functionsIndexPath = path.join(root, "functions", "index.js");
const appPath = path.join(root, "firebase-dashboard", "public", "app.js");
const indexesPath = path.join(root, "firestore.indexes.json");
const rulesPath = path.join(root, "firestore.rules");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function check(name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail });
}

function uniqueMatches(regex, source) {
  return [...new Set([...source.matchAll(regex)].map((match) => match[1]))].sort();
}

const checks = [];
const firebaseJson = readJson(firebaseJsonPath);
const functionsPackage = readJson(functionsPackagePath);
const functionsIndex = fs.readFileSync(functionsIndexPath, "utf8");
const app = fs.readFileSync(appPath, "utf8");
const rules = fs.readFileSync(rulesPath, "utf8");
const indexes = readJson(indexesPath);

const backendExports = uniqueMatches(/exports\.([A-Za-z0-9_]+)\s*=/g, functionsIndex);
const frontendCalls = uniqueMatches(/httpsCallable\(functions,\s*"([^"]+)"/g, app);
const ingestOptionsMatch = functionsIndex.match(/exports\.ingestDashboardSource\s*=\s*onRequest\(\s*\{([\s\S]*?)\}\s*,\s*async/);
const ingestOptions = ingestOptionsMatch ? ingestOptionsMatch[1] : "";

check(
  "hosting public directory",
  firebaseJson.hosting?.public === "firebase-dashboard/public",
  "Firebase Hosting doit publier le dossier du dashboard Firebase, pas une ancienne version."
);

check(
  "hosting explicit site",
  firebaseJson.hosting?.site === "cfsb-dashboard-coach-aa9a4",
  "Firebase Hosting doit cibler explicitement le site Firebase pour eviter les erreurs de resolution de cible."
);

check(
  "hosting no-store",
  JSON.stringify(firebaseJson.hosting?.headers || []).includes("no-store"),
  "Le dashboard doit eviter le cache agressif pour ne pas garder une ancienne app.js."
);

check(
  "hosting spa rewrite",
  (firebaseJson.hosting?.rewrites || []).some((rewrite) => rewrite.source === "**" && rewrite.destination === "/index.html"),
  "Les routes du dashboard doivent revenir vers index.html."
);

check(
  "functions source",
  firebaseJson.functions?.source === "functions",
  "Firebase doit deployer le dossier functions."
);

check(
  "firestore rules and indexes",
  firebaseJson.firestore?.rules === "firestore.rules"
    && firebaseJson.firestore?.indexes === "firestore.indexes.json"
    && /match\s+\/clients\/\{[^}]+\}/.test(rules)
    && Array.isArray(indexes.indexes),
  "Les regles et indexes Firestore doivent etre relies au deploy."
);

check(
  "functions node runtime",
  String(functionsPackage.engines?.node || "") === "22",
  "Les Functions doivent rester sur Node 22 pour eviter l'ancien runtime deprecie."
);

check(
  "functions dependencies",
  Boolean(functionsPackage.dependencies?.["firebase-admin"])
    && Boolean(functionsPackage.dependencies?.["firebase-functions"])
    && fs.existsSync(functionsLockPath),
  "Les dependances Functions et package-lock doivent exister pour un deploy reproductible."
);

check(
  "backend exports expected functions",
  ["sendQuestionnaire", "processQuestionnaireSendRequest", "syncDashboardFromSheets", "scheduledDashboardSync", "scheduledQuestionnaireResponseSync", "processSyncRequest"].every((name) => backendExports.includes(name)),
  "Le backend doit exporter l'envoi questionnaire, sa file Firestore, la sync manuelle, la sync planifiee et la file Firestore."
);

check(
  "frontend callable functions mapped",
  frontendCalls.every((name) => backendExports.includes(name)),
  "Les Cloud Functions appelees directement par l'interface doivent exister cote backend."
);

check(
  "sync request queue contract",
  functionsIndex.includes('document: "syncRequests/{requestId}"')
    && app.includes('collection(db, "syncRequests")')
    && rules.includes("match /syncRequests/{syncRequestId}")
    && rules.includes("request.resource.data.status == 'queued'"),
  "La sync admin doit pouvoir passer par une file Firestore quand Cloud Run bloque les appels HTTP publics."
);

check(
  "questionnaire secret contract",
  functionsIndex.includes('defineSecret("GHL_PRIVATE_TOKEN")')
    && /exports\.sendQuestionnaire[\s\S]*secrets:\s*\[ghlPrivateToken\]/.test(functionsIndex)
    && /exports\.processQuestionnaireSendRequest[\s\S]*document:\s*"questionnaireSends\/\{sendId\}"[\s\S]*secrets:\s*\[ghlPrivateToken\]/.test(functionsIndex),
  "L'envoi questionnaire doit utiliser le secret GHL_PRIVATE_TOKEN cote backend."
);

check(
  "direct import token-gated deployable contract",
  /exports\.ingestDashboardSource\s*=\s*onRequest/.test(functionsIndex)
    && !/invoker:\s*"public"/.test(ingestOptions)
    && functionsIndex.includes('defineSecret("DASHBOARD_IMPORT_TOKEN")')
    && functionsIndex.includes("X-CFSB-Import-Token"),
  "L'import direct des sources doit rester deployable dans le projet actuel et garder le token applicatif comme serrure serveur."
);

check(
  "scheduled sync contract",
  /exports\.scheduledDashboardSync\s*=\s*onSchedule\(/.test(functionsIndex)
    && functionsIndex.includes("every 6 hours")
    && functionsIndex.includes("firebase_function_sync_sheets_scheduled"),
  "La sync continue doit rester planifiee et tracable."
);

check(
  "scheduled questionnaire response sync contract",
  /exports\.scheduledQuestionnaireResponseSync\s*=\s*onSchedule\(/.test(functionsIndex)
    && functionsIndex.includes("every 15 minutes")
    && functionsIndex.includes("firebase_function_questionnaire_response_sync_scheduled"),
  "Les reponses questionnaire doivent etre importees automatiquement plus vite que la sync globale."
);

const failures = checks.filter((item) => !item.passed);
const result = {
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  backendExports,
  frontendCalls,
  failures,
  checks
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exit(1);
