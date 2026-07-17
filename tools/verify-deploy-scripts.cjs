const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = {
  firebaseJson: path.join(root, "firebase.json"),
  publishMvp: path.join(root, "publier-dashboard-mvp.cmd"),
  deployComplete: path.join(root, "deploy-dashboard-complet.cmd"),
  deployHosting: path.join(root, "deploy-hosting-dashboard.cmd"),
  openFirebaseConsole: path.join(root, "ouvrir-console-firebase.cmd"),
  login: path.join(root, "firebase-login-dashboard.cmd"),
  loginCi: path.join(root, "firebase-login-ci-token.cmd"),
  validateTeam: path.join(root, "valider-dashboard-equipe.cmd"),
  validation: path.join(root, "verify-dashboard-before-deploy.cmd"),
  liveValidation: path.join(root, "verify-dashboard-live.cmd")
  , liveFirestoreAudit: path.join(root, "audit-live-firestore.cmd"),
  firebaseAuthReady: path.join(root, "tools", "verify-firebase-auth-ready.cjs")
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")])
);

const firebaseConfig = JSON.parse(source.firebaseJson);
const checks = [];
const completeDeployCommand = "deploy --project cfsb-dashboard-coach-aa9a4 --only hosting,functions,firestore:rules,firestore:indexes,storage";
const hostingDeployCommand = "deploy --project cfsb-dashboard-coach-aa9a4 --only hosting";

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

check(
  "hosting targets firebase dashboard",
  firebaseConfig.hosting?.site === "cfsb-dashboard-coach-aa9a4"
    && firebaseConfig.hosting?.public === "firebase-dashboard/public"
    && firebaseConfig.hosting?.headers?.some((item) =>
      item.source === "**"
      && item.headers?.some((header) => header.key === "Cache-Control" && header.value === "no-store")
    )
    && firebaseConfig.hosting?.rewrites?.some((item) => item.source === "**" && item.destination === "/index.html"),
  "Firebase Hosting doit publier le dashboard Firebase, sans cache agressif, avec rewrite SPA."
);

check(
  "MVP publish wrapper chains login hosting validation and audit",
  source.publishMvp.includes("firebase-login-dashboard.cmd")
    && source.publishMvp.includes("deploy-hosting-dashboard.cmd")
    && source.publishMvp.includes("audit-live-firestore.cmd")
    && source.publishMvp.includes("valider-dashboard-equipe.cmd")
    && source.publishMvp.includes("dashboard-coach-mvp-validation-checklist.md")
    && source.publishMvp.includes("dashboard-coach-kit-lancement-interne.md")
    && source.publishMvp.includes("DASHBOARD_SKIP_LOGIN")
    && source.publishMvp.includes("20260618-csm-global-enrichment")
    && source.publishMvp.indexOf("firebase-login-dashboard.cmd") < source.publishMvp.indexOf("deploy-hosting-dashboard.cmd")
    && source.publishMvp.indexOf("deploy-hosting-dashboard.cmd") < source.publishMvp.indexOf("audit-live-firestore.cmd"),
  "Le raccourci MVP doit enchainer reconnexion, deploy Hosting, validation live via le script Hosting, puis audit Firestore."
);

check(
  "complete deploy runs validation first",
  source.deployComplete.includes('call "%~dp0verify-dashboard-before-deploy.cmd"')
    && source.deployComplete.indexOf('call "%~dp0verify-dashboard-before-deploy.cmd"') < source.deployComplete.indexOf(completeDeployCommand),
  "Le deploy complet doit lancer le pipeline local avant Firebase deploy."
);

check(
  "complete deploy covers hosting functions firestore",
  includesAll(source.deployComplete, [
    completeDeployCommand,
    "FUNCTIONS_DISCOVERY_TIMEOUT",
    "firebase-deploy-last.log",
    "FIREBASE_TOKEN",
    "FIREBASE_AUTH_ARGS"
  ]),
  "Le deploy complet doit publier Hosting, Functions, rules et indexes avec journal et option token."
);

check(
  "deploy scripts resolve firebase cli reliably",
  source.deployComplete.includes("FIREBASE_BIN")
    && source.deployHosting.includes("FIREBASE_BIN")
    && source.deployComplete.includes("FIREBASE_LOCAL_CMD")
    && source.deployHosting.includes("FIREBASE_LOCAL_CMD")
    && source.deployComplete.includes("firebase-tools-clean")
    && source.deployHosting.includes("firebase-tools-clean")
    && source.deployComplete.includes("firebase-tools-instant-win.exe")
    && source.deployHosting.includes("firebase-tools-instant-win.exe")
    && source.deployComplete.includes("FIREBASE_TOKEN n'est pas defini")
    && source.deployHosting.includes("FIREBASE_TOKEN n'est pas defini")
    && source.deployComplete.includes("CLI locale cachee avec Node local")
    && source.deployHosting.includes("CLI locale cachee avec Node local")
    && source.deployComplete.includes("Firebase CLI: commande firebase detectee")
    && source.deployHosting.includes("Firebase CLI: commande firebase detectee")
    && source.deployComplete.includes('call "%FIREBASE_BIN%" deploy')
    && source.deployHosting.includes('call "%FIREBASE_BIN%" deploy')
    && source.deployComplete.includes("where firebase")
    && source.deployHosting.includes("where firebase")
    && source.login.includes("where firebase")
    && source.loginCi.includes("where firebase"),
  "Les scripts doivent utiliser firebase si disponible, sinon l'executable local Firebase CLI connu."
);

check(
  "complete deploy has actionable failure guidance",
  includesAll(source.deployComplete, [
    "ECHEC DU DEPLOIEMENT COMPLET",
    "login --reauth",
    "Cloud Build / Cloud Functions",
    "Synchroniser tous les coachs"
  ]),
  "Un echec de deploy doit dire quoi faire ensuite."
);

check(
  "complete deploy checks required secrets before functions",
  includesAll(source.deployComplete, [
    "verify-firebase-auth-ready.cjs",
    "functions:secrets:describe",
    "GHL_PRIVATE_TOKEN",
    "DASHBOARD_IMPORT_TOKEN",
    "MISSING_SECRET",
    "Script Properties Apps Script",
    "deploy-hosting-dashboard.cmd"
  ])
    && source.deployComplete.indexOf("functions:secrets:describe GHL_PRIVATE_TOKEN") < source.deployComplete.indexOf(completeDeployCommand)
    && source.deployComplete.indexOf("functions:secrets:describe DASHBOARD_IMPORT_TOKEN") < source.deployComplete.indexOf(completeDeployCommand),
  "Le deploy complet doit verifier les secrets requis avant de lancer Functions."
);

check(
  "complete deploy fails fast on expired firebase auth",
  source.deployComplete.includes("Prevol Firebase auth/secrets")
    && source.deployComplete.includes("verify-firebase-auth-ready.cjs")
    && source.deployComplete.indexOf("verify-firebase-auth-ready.cjs") < source.deployComplete.indexOf('call "%~dp0verify-dashboard-before-deploy.cmd"')
    && source.firebaseAuthReady.includes("function resolveFirebaseBin")
    && source.firebaseAuthReady.includes("firebase-tools-clean")
    && source.firebaseAuthReady.includes("node-v22")
    && source.firebaseAuthReady.includes('spawnSync("where", ["firebase"]')
    && source.firebaseAuthReady.includes("login --reauth")
    && source.firebaseAuthReady.includes("invalid_rapt")
    && source.firebaseAuthReady.includes("DASHBOARD_IMPORT_TOKEN")
    && source.firebaseAuthReady.includes("GHL_PRIVATE_TOKEN")
    && source.firebaseAuthReady.includes("--hosting-only")
    && source.firebaseAuthReady.includes("hosting:sites:list")
    && source.firebaseAuthReady.includes("[REDACTED_ACCESS_TOKEN]")
    && source.firebaseAuthReady.includes("[REDACTED_REFRESH_TOKEN]"),
  "Le deploy complet doit detecter une session Firebase expiree avant de lancer la validation longue."
);

check(
  "hosting deploy is limited to hosting",
  source.deployHosting.includes('call "%~dp0verify-dashboard-before-deploy.cmd"')
    && source.deployHosting.includes(hostingDeployCommand)
    && !source.deployHosting.includes("deploy --only functions")
    && source.deployHosting.includes("FIREBASE_TOKEN")
    && source.deployHosting.includes("DASHBOARD_NO_PAUSE")
    && source.deployHosting.includes("Prevol Firebase auth/hosting")
    && source.deployHosting.includes("verify-firebase-auth-ready.cjs")
    && source.deployHosting.includes("--hosting-only")
    && source.deployHosting.includes("publier-dashboard-mvp.cmd")
    && source.deployHosting.includes("Option Hosting seul")
    && source.deployHosting.indexOf("verify-firebase-auth-ready.cjs") < source.deployHosting.indexOf('call "%~dp0verify-dashboard-before-deploy.cmd"')
    && firebaseConfig.hosting?.public === "firebase-dashboard/public",
  "Le script hosting seul ne doit pas tenter de publier Functions, doit verifier l'auth avant la validation longue et doit rester utilisable avec token ou sans pause."
);

check(
  "deploy scripts validate live version after publication",
  source.deployComplete.includes('call "%~dp0verify-dashboard-live.cmd"')
    && source.deployHosting.includes('call "%~dp0verify-dashboard-live.cmd"')
    && source.deployComplete.indexOf(completeDeployCommand) < source.deployComplete.indexOf('call "%~dp0verify-dashboard-live.cmd"')
    && source.deployHosting.indexOf(hostingDeployCommand) < source.deployHosting.indexOf('call "%~dp0verify-dashboard-live.cmd"'),
  "Un deploy reussi doit ensuite verifier que le live sert la version attendue."
);

check(
  "team validation script gates internal rollout",
  source.validateTeam.includes("verify-dashboard-live.cmd")
    && source.validateTeam.includes("audit-live-firestore.cmd")
    && source.validateTeam.includes("--summary")
    && source.validateTeam.includes("Iheb")
    && source.validateTeam.includes("Marc-Andre")
    && source.validateTeam.includes("David")
    && source.validateTeam.includes("Camille")
    && source.validateTeam.includes("Gabriel")
    && source.validateTeam.includes("Hugo")
    && source.validateTeam.includes("Raphael")
    && source.validateTeam.includes("Criteres No-Go")
    && source.validateTeam.includes("dashboard-coach-mvp-validation-checklist.md")
    && source.validateTeam.indexOf("verify-dashboard-live.cmd") < source.validateTeam.indexOf("audit-live-firestore.cmd"),
  "Un script separe doit confirmer le live et l'audit Firestore avant le test humain equipe."
);

check(
  "login helpers exist for interactive and ci",
  source.login.includes("login --reauth")
    && source.loginCi.includes("login:ci")
    && /FIREBASE_TOKEN|token/i.test(source.loginCi),
  "Les chemins de reconnexion interactive et token CI doivent etre documentes par script."
);

check(
  "firebase console helper gives pasteable deploy commands",
  source.openFirebaseConsole.includes("firebase-tools-instant-win.exe")
    && source.openFirebaseConsole.includes("start")
    && source.openFirebaseConsole.includes("deploy-dashboard-complet.cmd")
    && source.openFirebaseConsole.includes("cd \""),
  "Un helper doit ouvrir la console Firebase et afficher les commandes exactes a coller."
);

check(
  "validation includes all custom verifiers",
  includesAll(source.validation, [
    "verify-firebase-sync-helpers.cjs",
    "verify-questionnaire-followup-logic.cjs",
    "verify-dashboard-workflows.cjs",
    "verify-dashboard-actions.cjs",
    "verify-firestore-coverage.cjs",
    "verify-direct-import-bridge.cjs",
    "verify-source-truth-contract.cjs",
    "verify-source-activation-kit.cjs",
    "verify-source-activation-status.cjs",
    "verify-pilot-coach-access.cjs",
    "verify-migration-readiness.cjs",
    "verify-bob-source-alignment.cjs",
    "verify-firebase-deploy-contract.cjs",
    "verify-dashboard-product-audit.cjs",
    "verify-dashboard-mvp-readiness.cjs",
    "verify-dashboard-docs-current-state.cjs"
  ]),
  "Le script de validation doit executer tous les verificateurs critiques."
);

check(
  "live validation script exists",
  source.liveValidation.includes("verify-live-hosting.cjs")
    && fs.existsSync(path.join(root, "tools", "verify-live-hosting.cjs")),
  "Le projet doit avoir un test post-deploiement reutilisable pour le Hosting live."
);

check(
  "live firestore audit uses stable node",
  source.liveFirestoreAudit.includes("cfsb-dashboard-tools")
    && source.liveFirestoreAudit.includes("node-v22")
    && source.liveFirestoreAudit.includes("audit-live-firestore.cjs"),
  "L'audit Firestore live doit preferer le Node local stable pour eviter les erreurs Windows parasites."
);

const failures = checks.filter((item) => !item.passed);
const result = {
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);

