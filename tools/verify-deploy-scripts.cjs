const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = {
  firebaseJson: path.join(root, "firebase.json"),
  publishMvp: path.join(root, "publier-dashboard-mvp.cmd"),
  deployComplete: path.join(root, "deploy-dashboard-complet.cmd"),
  deployHosting: path.join(root, "deploy-hosting-dashboard.cmd"),
  googleOnlyLive: path.join(root, "cloudbuild.google-only-live.yaml"),
  questionnaireAppsScriptQueueActivation: path.join(
    root,
    "tools",
    "activate-questionnaire-firestore-queue.cjs"
  ),
  questionnaireAppsScriptVersionDeploy: path.join(
    root,
    "tools",
    "deploy-questionnaire-appscript-version.cjs"
  ),
  deployQuestionnaireStageA: path.join(root, "deploy-questionnaire-stage-a.cmd"),
  deployQuestionnaireStageB: path.join(root, "deploy-questionnaire-stage-b.cmd"),
  runQuestionnaireReleaseCanary: path.join(root, "run-questionnaire-release-canary.cmd"),
  runQuestionnairePublicApiCanary: path.join(
    root,
    "run-questionnaire-public-api-canary.cmd"
  ),
  runQuestionnaireRulesEmulatorCanary: path.join(
    root,
    "run-questionnaire-firestore-rules-emulator-canary.cmd"
  ),
  questionnaireCanaryRunner: path.join(
    root,
    "tools",
    "run-questionnaire-scheduler-canary.cjs"
  ),
  questionnaireCanaryLib: path.join(
    root,
    "tools",
    "questionnaire-scheduler-canary-lib.cjs"
  ),
  questionnairePublicApiCanaryRunner: path.join(
    root,
    "tools",
    "run-questionnaire-public-api-canary.cjs"
  ),
  questionnairePublicApiCanaryLib: path.join(
    root,
    "tools",
    "questionnaire-public-api-canary-lib.cjs"
  ),
  questionnaireRulesEmulatorCanary: path.join(
    root,
    "tools",
    "run-questionnaire-firestore-rules-emulator-canary.cjs"
  ),
  questionnaireFunctionRevisionReceipt: path.join(
    root,
    "tools",
    "questionnaire-function-revision-receipt.cjs"
  ),
  questionnaireSchedulerSafety: path.join(
    root,
    "functions",
    "questionnaire-scheduler-safety.js"
  ),
  verifyQuestionnaireStageAIndexReady: path.join(
    root,
    "verify-questionnaire-stage-a-index-ready.cmd"
  ),
  questionnaireStageAPreflight: path.join(
    root,
    "tools",
    "preflight-questionnaire-stage-a-live.cjs"
  ),
  questionnaireStageAPreflightLib: path.join(
    root,
    "tools",
    "questionnaire-stage-a-preflight-lib.cjs"
  ),
  sealedWorktreeVerifier: path.join(
    root,
    "tools",
    "verify-sealed-questionnaire-release-worktree.cjs"
  ),
  firestoreIndexes: path.join(root, "firestore.indexes.json"),
  questionnaireStagedReleaseGuard: path.join(
    root,
    "firebase-dashboard",
    "QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md"
  ),
  questionnaireReleaseRunbook: path.join(
    root,
    "firebase-dashboard",
    "QUESTIONNAIRE_RELEASE_RUNBOOK_20260728.md"
  ),
  deployRunbook: path.join(
    root,
    "firebase-dashboard",
    "DEPLOY_RUNBOOK.md"
  ),
  questionnaireCandidateGate: path.join(
    root,
    "tools",
    "verify-questionnaire-reconciled-candidate.mjs"
  ),
  openFirebaseConsole: path.join(root, "ouvrir-console-firebase.cmd"),
  login: path.join(root, "firebase-login-dashboard.cmd"),
  loginCi: path.join(root, "firebase-login-ci-token.cmd"),
  validateTeam: path.join(root, "valider-dashboard-equipe.cmd"),
  validation: path.join(root, "verify-dashboard-before-deploy.cmd"),
  liveValidation: path.join(root, "verify-dashboard-live.cmd"),
  liveFirestoreAudit: path.join(root, "audit-live-firestore.cmd"),
  firebaseAuthReady: path.join(root, "tools", "verify-firebase-auth-ready.cjs")
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")])
);

const firebaseConfig = JSON.parse(source.firebaseJson);
const firestoreIndexes = JSON.parse(source.firestoreIndexes);
const questionnaireStageAPreflightLib = require(
  files.questionnaireStageAPreflightLib
);
const checks = [];
const completeDeployCommand = "deploy --project cfsb-dashboard-coach-aa9a4 --only hosting,functions,firestore:rules,firestore:indexes,storage";
const hostingDryRunCommand =
  'call "%FIREBASE_BIN%" deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only hosting --non-interactive %FIREBASE_AUTH_ARGS% > "%DRY_RUN_LOG%" 2>&1';
const hostingDeployCommand =
  'call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only hosting --non-interactive %FIREBASE_AUTH_ARGS% > "%DEPLOY_LOG%" 2>&1';
const googleOnlyLiveDeployCommand =
  "npx --yes firebase-tools@15.19.1 deploy";
const questionnaireAdditiveFunctionTargets = [
  "functions:listQuestionnaireForms",
  "functions:saveQuestionnaireDraft",
  "functions:publishQuestionnaireForm",
  "functions:setQuestionnaireDeliveryReady",
  "functions:archiveQuestionnaireForm",
  "functions:duplicateQuestionnaireForm",
  "functions:questionnairePublicApi"
];
const questionnaireLegacyFunctionTargets = [
  "functions:sendQuestionnaire",
  "functions:processQuestionnaireSendRequest",
  "functions:scheduledQuestionnaireSendRecovery",
  "functions:scheduledQuestionnaireSendPlans",
  "functions:syncDashboardFromSheets",
  "functions:scheduledDashboardSync",
  "functions:scheduledQuestionnaireResponseSync",
  "functions:processSyncRequest"
];
const baselineFirestoreIndexes = [
  {
    collectionGroup: "tasks",
    queryScope: "COLLECTION",
    fields: [
      { fieldPath: "coachId", order: "ASCENDING" },
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "priorityRank", order: "ASCENDING" },
      { fieldPath: "dueAt", order: "ASCENDING" }
    ]
  },
  {
    collectionGroup: "questionnaireResponses",
    queryScope: "COLLECTION",
    fields: [
      { fieldPath: "coachId", order: "ASCENDING" },
      { fieldPath: "processingStatus", order: "ASCENDING" },
      { fieldPath: "submittedAt", order: "DESCENDING" }
    ]
  },
  {
    collectionGroup: "clients",
    queryScope: "COLLECTION",
    fields: [
      { fieldPath: "coachId", order: "ASCENDING" },
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "lastNameSort", order: "ASCENDING" }
    ]
  },
  {
    collectionGroup: "rebookings",
    queryScope: "COLLECTION",
    fields: [
      { fieldPath: "coachId", order: "ASCENDING" },
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "detectedAt", order: "DESCENDING" }
    ]
  }
];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function exactLinePosition(text, line) {
  const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}\\r?$`, "m").exec(text)?.index ?? -1;
}

function appsScriptMutationBlockedBeforeEffects(text) {
  const main = text.indexOf("async function main() {");
  const guard = text.indexOf(
    "fs.existsSync(stagedReleaseGuardPath)",
    main
  );
  const firstLocalWrite = text.indexOf("fsp.mkdir", main);
  const firstExternalApi = text.indexOf("appsScriptApi(", main);
  const guardBlock = guard >= 0
    ? text.slice(guard, Math.min(firstLocalWrite, firstExternalApi))
    : "";
  return main >= 0
    && guard > main
    && firstLocalWrite > guard
    && firstExternalApi > guard
    && guardBlock.includes("throw new Error(")
    && guardBlock.includes("Apps Script questionnaire v23 reste immuable")
    && text.includes("QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md")
    && text.includes("QUESTIONNAIRE_RELEASE_RUNBOOK_20260728.md");
}

function hasShaBoundPredicate(text, variableName) {
  return text.includes(
    `if /I not "%${variableName}%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (`
  );
}

function guardedInvocationCount(text, invocationNeedle) {
  const lines = text.split(/\r?\n/);
  let count = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes(invocationNeedle)) continue;
    if (lines[index + 1]?.trim() !== "if errorlevel 1 (") return -1;
    let cursor = index + 2;
    let exitsNonZero = false;
    while (cursor < lines.length && lines[cursor].trim() !== ")") {
      if (lines[cursor].trim() === "exit /b 1") exitsNonZero = true;
      cursor += 1;
    }
    if (cursor >= lines.length || !exitsNonZero) return -1;
    count += 1;
  }
  return count;
}

function firebaseDeployInvocationLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => /\bdeploy\s+--(?:dry-run|project|only)\b/i.test(line))
    .map((line) => line.trim());
}

function stageBlock(text, stage, nextStage = "") {
  const marker = `if /I "%QUESTIONNAIRE_STAGE%"=="${stage}" (`;
  const start = text.indexOf(marker);
  if (start < 0) return "";
  const endMarker = nextStage
    ? `if /I "%QUESTIONNAIRE_STAGE%"=="${nextStage}" (`
    : "echo STOP: sous-etape inconnue";
  const end = text.indexOf(endMarker, start + marker.length);
  return end < 0 ? "" : text.slice(start, end);
}

const questionnaireStageBlocks = {
  rules: stageBlock(source.deployQuestionnaireStageA, "rules", "additive"),
  additive: stageBlock(source.deployQuestionnaireStageA, "additive", "legacy"),
  legacy: stageBlock(source.deployQuestionnaireStageA, "legacy")
};
const questionnaireIndexRefusalStart =
  source.deployQuestionnaireStageA.indexOf(
    'if /I "%QUESTIONNAIRE_STAGE%"=="indexes" ('
  );
const questionnaireIndexRefusalEnd =
  source.deployQuestionnaireStageA.indexOf(
    'if /I not "%CFSB_QUESTIONNAIRE_RELEASE_GO%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (',
    questionnaireIndexRefusalStart
  );
const questionnaireIndexRefusalBlock =
  questionnaireIndexRefusalStart >= 0 && questionnaireIndexRefusalEnd >= 0
    ? source.deployQuestionnaireStageA.slice(
      questionnaireIndexRefusalStart,
      questionnaireIndexRefusalEnd
    )
    : "";
const expectedStageADeployOnlyAssignments = [
  'set "DEPLOY_ONLY=firestore:rules"',
  `set "DEPLOY_ONLY=${questionnaireAdditiveFunctionTargets.join(",")}"`,
  `set "DEPLOY_ONLY=${questionnaireLegacyFunctionTargets.join(",")}"`
];
const actualStageADeployOnlyAssignments = (
  source.deployQuestionnaireStageA.match(
    /^\s*set "DEPLOY_ONLY=[^"]*"\r?$/gm
  ) || []
).map((line) => line.trim());

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
  "questionnaire gate protects hosting functions and firestore targets",
  firebaseConfig.hosting?.predeploy?.includes(
    "node tools/verify-questionnaire-reconciled-candidate.mjs"
  )
    && firebaseConfig.functions?.predeploy?.includes(
      "node tools/verify-questionnaire-reconciled-candidate.mjs"
    )
    && firebaseConfig.firestore?.predeploy?.includes(
      "node tools/verify-questionnaire-reconciled-candidate.mjs"
    ),
  "La gate Questionnaire Studio doit s'executer pour chaque cible Firebase mutable du candidat."
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
  "questionnaire candidate blocks unsafe aggregate deploys",
  source.deployComplete.includes("QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md")
    && source.deployComplete.includes("deploy-questionnaire-stage-a.cmd")
    && source.deployComplete.includes("deploy-questionnaire-stage-b.cmd")
    && source.deployComplete.indexOf("QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md")
      < source.deployComplete.indexOf(completeDeployCommand)
    && source.deployHosting.includes("QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md")
    && source.deployHosting.includes("CFSB_QUESTIONNAIRE_INDEX_READY_OK")
    && source.deployHosting.includes("CFSB_QUESTIONNAIRE_SCHEDULER_CANARY_OK")
    && source.deployHosting.includes("CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED")
    && source.deployHosting.includes("CFSB_QUESTIONNAIRE_STAGE_B_GO")
    && source.deployHosting.includes("CFSB_QUESTIONNAIRE_RELEASE_COMMIT")
    && source.deployHosting.includes(
      "verify-sealed-questionnaire-release-worktree.cjs"
    )
    && source.deployHosting.indexOf("QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md")
      < source.deployHosting.indexOf(hostingDeployCommand)
    && source.questionnaireStagedReleaseGuard.includes("déploiement groupé")
    && source.questionnaireStagedReleaseGuard.includes("canari backend"),
  "Le candidat questionnaire doit interdire le deploy complet et tout Hosting publie avant son backend canari."
);

const googleOnlyLiveGuard = source.googleOnlyLive.indexOf(
  "if [ -f firebase-dashboard/QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md ]; then"
);
const googleOnlyLiveDeploy =
  source.googleOnlyLive.indexOf(googleOnlyLiveDeployCommand);
const googleOnlyLiveGuardBlock =
  googleOnlyLiveGuard >= 0 && googleOnlyLiveDeploy > googleOnlyLiveGuard
    ? source.googleOnlyLive.slice(googleOnlyLiveGuard, googleOnlyLiveDeploy)
    : "";
check(
  "questionnaire candidate blocks Google-only live Hosting bypass",
  googleOnlyLiveGuard >= 0
    && googleOnlyLiveGuard < googleOnlyLiveDeploy
    && googleOnlyLiveGuardBlock.includes("exit 1")
    && googleOnlyLiveGuardBlock.includes("deploy-questionnaire-stage-a.cmd")
    && googleOnlyLiveGuardBlock.includes("deploy-questionnaire-stage-b.cmd")
    && source.googleOnlyLive.includes(
      "--project cfsb-dashboard-coach-aa9a4"
    )
    && source.deployRunbook.includes(
      "`cloudbuild.google-only-live.yaml` echoue volontairement"
    )
    && source.deployRunbook.includes(
      "`firebase-dashboard/QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md` existe"
    )
    && source.deployRunbook.includes(
      "`deploy-questionnaire-stage-a.cmd rules`"
    )
    && source.deployRunbook.includes(
      "`deploy-questionnaire-stage-b.cmd`"
    ),
  "Cloud Build live doit echouer avant le deploy lorsque le garde existe, et le runbook doit orienter la production vers Stage A/A4/Stage B."
);

check(
  "questionnaire candidate freezes the legacy Apps Script web app",
  appsScriptMutationBlockedBeforeEffects(
    source.questionnaireAppsScriptQueueActivation
  )
    && appsScriptMutationBlockedBeforeEffects(
      source.questionnaireAppsScriptVersionDeploy
    )
    && source.questionnaireCandidateGate.includes(
      "tests/questionnaire-appscript-mutation-guard.test.mjs"
    )
    && source.questionnaireCandidateGate.includes(
      "tools/activate-questionnaire-firestore-queue.cjs"
    )
    && source.questionnaireCandidateGate.includes(
      "tools/deploy-questionnaire-appscript-version.cjs"
    )
    && source.questionnaireReleaseRunbook.includes(
      "Le code et le déploiement de ce Web App restent immuables"
    ),
  "Les deux runners Apps Script historiques doivent s'arrêter avant auth, réseau ou sauvegarde tant que le garde staged existe."
);

check(
  "questionnaire staged scripts split rules and functions while A4 stays read-only",
  includesAll(source.deployQuestionnaireStageA, [
    "CFSB_QUESTIONNAIRE_RELEASE_GO",
    "CFSB_COACH_NOTICE_CONFIRMED",
    "CFSB_QUESTIONNAIRE_RELEASE_COMMIT",
    "verify-sealed-questionnaire-release-worktree.cjs",
    "verify-firebase-auth-ready.cjs",
    "verify-questionnaire-reconciled-candidate.mjs",
    "verify-dashboard-before-deploy.cmd",
    "preflight-questionnaire-stage-a-live.cjs",
    "CFSB_QUESTIONNAIRE_RULES_CANARY_OK",
    "CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK",
    "CFSB_QUESTIONNAIRE_LEGACY_CANARY_OK",
    "--protect-through-next-scheduler",
    "--require-safe-scheduler-window",
    "deploy --dry-run",
    "ARRET HUMAIN OBLIGATOIRE"
  ])
    && /set "DEPLOY_ONLY=firestore:rules"\r?$/m.test(
      questionnaireStageBlocks.rules
    )
    && !questionnaireStageBlocks.rules.includes("firestore:indexes")
    && questionnaireStageBlocks.additive.includes(
      "CFSB_QUESTIONNAIRE_RULES_CANARY_OK"
    )
    && questionnaireStageBlocks.legacy.includes(
      "CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK"
    )
    && questionnaireIndexRefusalBlock.includes(
      "STOP: le mode indexes est desactive pour ce candidat"
    )
    && questionnaireIndexRefusalBlock.includes(
      "preflight-questionnaire-stage-a-live.cjs --protect-through-next-scheduler --require-index-ready --require-safe-scheduler-window"
    )
    && questionnaireIndexRefusalBlock.includes(
      "seal-questionnaire-pre-release-state.cjs --release-commit=%%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%% --plan-hash=%%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%% --verify-index-ready"
    )
    && questionnaireIndexRefusalBlock.includes(
      "verify-questionnaire-stage-a-index-ready.cmd"
    )
    && questionnaireIndexRefusalBlock.includes("exit /b 1")
    && !questionnaireIndexRefusalBlock.includes("goto :stage_selected")
    && !questionnaireIndexRefusalBlock.includes("DEPLOY_ONLY=")
    && !source.deployQuestionnaireStageA.includes("firestore:indexes")
    && !source.deployQuestionnaireStageA.includes(
      "CFSB_QUESTIONNAIRE_INDEX_DRY_RUN_REVIEWED"
    )
    && questionnaireAdditiveFunctionTargets.every((target) =>
      questionnaireStageBlocks.additive.includes(target)
    )
    && questionnaireStageBlocks.additive.includes(
      `set "DEPLOY_ONLY=${questionnaireAdditiveFunctionTargets.join(",")}"`
    )
    && (
      questionnaireStageBlocks.additive.match(
        /^\s*set "DEPLOY_ONLY=[^"]+"\r?$/gm
      ) || []
    ).length === 1
    && questionnaireLegacyFunctionTargets.every((target) =>
      questionnaireStageBlocks.legacy.includes(target)
    )
    && questionnaireStageBlocks.legacy.includes(
      `set "DEPLOY_ONLY=${questionnaireLegacyFunctionTargets.join(",")}"`
    )
    && (
      questionnaireStageBlocks.legacy.match(
        /^\s*set "DEPLOY_ONLY=[^"]+"\r?$/gm
      ) || []
    ).length === 1
    && !/set "DEPLOY_ONLY=[^"]*firestore:rules[^"]*firestore:indexes/m.test(
      source.deployQuestionnaireStageA
    )
    && actualStageADeployOnlyAssignments.sort().join("\n")
      === expectedStageADeployOnlyAssignments.sort().join("\n")
    && includesAll(source.deployQuestionnaireStageB, [
      "CFSB_QUESTIONNAIRE_INDEX_READY_OK",
      "CFSB_QUESTIONNAIRE_SCHEDULER_CANARY_OK",
      "CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED",
      "CFSB_QUESTIONNAIRE_STAGE_B_GO",
      "CFSB_QUESTIONNAIRE_RELEASE_COMMIT",
      "CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH",
      "verify-sealed-questionnaire-release-worktree.cjs",
      "seal-questionnaire-pre-release-state.cjs",
      "--verify-receipt",
      "manage-questionnaire-release-announcements.cjs",
      "--maintenance-verify",
      "deploy-hosting-dashboard.cmd",
      "verify-questionnaire-live-continuity.mjs",
      "deliveryReady=false"
    ])
    && hasShaBoundPredicate(
      source.deployQuestionnaireStageA,
      "CFSB_QUESTIONNAIRE_RELEASE_GO"
    )
    && hasShaBoundPredicate(
      source.deployQuestionnaireStageA,
      "CFSB_COACH_NOTICE_CONFIRMED"
    )
    && hasShaBoundPredicate(
      questionnaireStageBlocks.additive,
      "CFSB_QUESTIONNAIRE_RULES_CANARY_OK"
    )
    && hasShaBoundPredicate(
      questionnaireStageBlocks.legacy,
      "CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK"
    )
    && hasShaBoundPredicate(
      source.deployQuestionnaireStageB,
      "CFSB_QUESTIONNAIRE_INDEX_READY_OK"
    )
    && hasShaBoundPredicate(
      source.deployQuestionnaireStageB,
      "CFSB_QUESTIONNAIRE_SCHEDULER_CANARY_OK"
    )
    && hasShaBoundPredicate(
      source.deployQuestionnaireStageB,
      "CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED"
    )
    && hasShaBoundPredicate(
      source.deployQuestionnaireStageB,
      "CFSB_QUESTIONNAIRE_STAGE_B_GO"
    )
    && hasShaBoundPredicate(
      source.deployHosting,
      "CFSB_QUESTIONNAIRE_INDEX_READY_OK"
    )
    && hasShaBoundPredicate(
      source.deployHosting,
      "CFSB_QUESTIONNAIRE_SCHEDULER_CANARY_OK"
    )
    && hasShaBoundPredicate(
      source.deployHosting,
      "CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED"
    )
    && hasShaBoundPredicate(
      source.deployHosting,
      "CFSB_QUESTIONNAIRE_STAGE_B_GO"
    )
    && source.deployHosting.includes("deploy --dry-run")
    && source.deployHosting.indexOf("deploy --dry-run") < source.deployHosting.indexOf(hostingDeployCommand),
  "Stage A doit isoler rules, additive et legacy; indexes doit échouer fermé et A4 doit rester read-only avant Stage B."
);

const shaBoundReleaseVariables = [
  "CFSB_QUESTIONNAIRE_RELEASE_GO",
  "CFSB_COACH_NOTICE_CONFIRMED",
  "CFSB_QUESTIONNAIRE_RULES_CANARY_OK",
  "CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK",
  "CFSB_QUESTIONNAIRE_LEGACY_CANARY_OK",
  "CFSB_QUESTIONNAIRE_INDEX_READY_OK",
  "CFSB_QUESTIONNAIRE_SCHEDULER_CANARY_OK",
  "CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED",
  "CFSB_QUESTIONNAIRE_STAGE_B_GO"
];
check(
  "questionnaire release authorizations and proofs are bound to the sealed SHA",
  shaBoundReleaseVariables.every((variableName) =>
    source.questionnaireReleaseRunbook.includes(
      `set ${variableName}=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%`
    )
    && !source.questionnaireReleaseRunbook.includes(
      `set ${variableName}=YES`
    )
  )
    && source.questionnaireStagedReleaseGuard.includes("liés au SHA")
    && source.questionnaireStagedReleaseGuard.includes(
      "un nouveau commit invalide"
    ),
  "Un nouveau commit doit invalider les anciens GO, avis coach et canaris."
);

const stageADryRunCall =
  'call "%FIREBASE_BIN%" deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only "%DEPLOY_ONLY%" --non-interactive %FIREBASE_AUTH_ARGS% > "%DRY_RUN_LOG%" 2>&1';
const stageADeployCall =
  'call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only "%DEPLOY_ONLY%" --non-interactive %FIREBASE_AUTH_ARGS% > "%DEPLOY_LOG%" 2>&1';
const stageAPreflightPositions = [
  ...source.deployQuestionnaireStageA.matchAll(
    /^\s*"%NODE_EXE%" "%~dp0tools\\preflight-questionnaire-stage-a-live\.cjs" %LIVE_PREFLIGHT_ARGS%\r?$/gm
  )
].map((match) => match.index);
const stageAFirstPreflight = stageAPreflightPositions[0] ?? -1;
const stageADryRun = source.deployQuestionnaireStageA.indexOf(stageADryRunCall);
const stageASecondPreflight = stageAPreflightPositions[1] ?? -1;
const stageADeploy = source.deployQuestionnaireStageA.indexOf(stageADeployCall);
const stageALocalReceiptInvocation =
  '"%NODE_EXE%" "%~dp0tools\\seal-questionnaire-pre-release-state.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" "--plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%" --verify-receipt';
const stageAExactLiveReceiptInvocation =
  '"%NODE_EXE%" "%~dp0tools\\seal-questionnaire-pre-release-state.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" "--plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%" --verify';
const maintenanceVerifyInvocation =
  '"%NODE_EXE%" "%~dp0tools\\manage-questionnaire-release-announcements.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" --maintenance-verify';
const stageALocalReceiptFirst =
  source.deployQuestionnaireStageA.indexOf(stageALocalReceiptInvocation);
const stageALocalReceiptLast =
  source.deployQuestionnaireStageA.lastIndexOf(stageALocalReceiptInvocation);
const stageALocalReceiptCount =
  source.deployQuestionnaireStageA.split(stageALocalReceiptInvocation).length - 1;
const stageAMaintenanceFirst =
  source.deployQuestionnaireStageA.indexOf(maintenanceVerifyInvocation);
const stageAMaintenanceLast =
  source.deployQuestionnaireStageA.lastIndexOf(maintenanceVerifyInvocation);
const stageAMaintenanceCount =
  source.deployQuestionnaireStageA.split(maintenanceVerifyInvocation).length - 1;
const stageAExactLiveReceipt =
  exactLinePosition(
    source.deployQuestionnaireStageA,
    stageAExactLiveReceiptInvocation
  );

check(
  "questionnaire indexes mode is an unconditional read-only redirect",
  questionnaireIndexRefusalStart >= 0
    && questionnaireIndexRefusalEnd > questionnaireIndexRefusalStart
    && questionnaireIndexRefusalStart
      < source.deployQuestionnaireStageA.indexOf(
        "verify-sealed-questionnaire-release-worktree.cjs"
      )
    && questionnaireIndexRefusalBlock.includes(
      "Aucun dry-run ni deploy d'index n'est autorise par ce script."
    )
    && questionnaireIndexRefusalBlock.includes("exit /b 1")
    && !questionnaireIndexRefusalBlock.includes("firebase")
    && !questionnaireIndexRefusalBlock.includes("DEPLOY_ONLY")
    && !/firestore:indexes/i.test(source.deployQuestionnaireStageA)
    && !/index-dry-run-|INDEX_DRY_RUN_REVIEWED/.test(
      source.deployQuestionnaireStageA
    )
    && source.questionnaireCandidateGate.includes(
      "tests/questionnaire-index-two-pass-guard.test.mjs"
    ),
  "Le mode indexes doit s'arrêter avant toute porte ou commande Firebase et ne proposer que les contrôles A4 read-only."
);

check(
  "questionnaire release canaries are sealed, runnable and documented",
  includesAll(source.runQuestionnaireReleaseCanary, [
    "tools\\run-questionnaire-scheduler-canary.cjs",
    "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%",
    "--pin-contact",
    "--execute-process",
    "--execute-empty",
    "--execute-positive",
    "--cleanup"
  ])
    && includesAll(source.runQuestionnairePublicApiCanary, [
      "tools\\run-questionnaire-public-api-canary.cjs",
      "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%",
      "--record-revision",
      "--execute"
    ])
    && includesAll(source.runQuestionnaireRulesEmulatorCanary, [
      "demo-cfsb-questionnaire-rules",
      "run-questionnaire-firestore-rules-emulator-canary.cjs",
      "verify-sealed-questionnaire-release-worktree.cjs"
    ])
    && includesAll(source.questionnaireCandidateGate, [
      "functions/questionnaire-scheduler-safety.js",
      "tools/questionnaire-public-api-canary-lib.cjs",
      "tools/questionnaire-scheduler-canary-lib.cjs",
      "tools/questionnaire-function-revision-receipt.cjs",
      "tools/run-questionnaire-firestore-rules-emulator-canary.cjs",
      "tools/run-questionnaire-public-api-canary.cjs",
      "tools/run-questionnaire-scheduler-canary.cjs",
      "tests/questionnaire-public-api-canary.test.mjs",
      "tests/questionnaire-scheduler-canary.test.mjs"
    ])
    && includesAll(source.questionnaireCanaryRunner, [
      "CFSB_QUESTIONNAIRE_RELEASE_GO",
      "CFSB_COACH_NOTICE_CONFIRMED",
      "CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK",
      "CFSB_QUESTIONNAIRE_LEGACY_CANARY_OK",
      "CFSB_QUESTIONNAIRE_INDEX_READY_OK",
      "CFSB_QUESTIONNAIRE_SCHEDULER_EMPTY_CANARY_OK",
      "createCanaryControl(context, \"empty\")",
      "createCanaryControl(context, \"positive\")",
      "currentDocument.updateTime",
      "discoverPinnedSyntheticContact",
      "cleanupSyntheticGhlTag",
      "CFSB_QUESTIONNAIRE_CANARY_CONTACT_FINGERPRINT",
      "CFSB_QUESTIONNAIRE_RECOVERY_GO",
      "positive_canary_release_already_attempted",
      "firestoreRecoveryComplete"
    ])
    && includesAll(source.questionnairePublicApiCanaryRunner, [
      "canary_response_already_exists",
      "idempotent_replay_mutated_response",
      "idempotency_conflict_mutated_response",
      "revisionReceiptVerified: true",
      "memberLinksDetected: 0"
    ])
    && includesAll(source.questionnairePublicApiCanaryLib, [
      "CFSB_QUESTIONNAIRE_RULES_CANARY_OK",
      "EXPECTED_INITIAL_FORMS",
      "IDEMPOTENCY_CONFLICT"
    ])
    && includesAll(source.questionnaireRulesEmulatorCanary, [
      "questionnaireCanaryTargets",
      "questionnaireSchedulerCanaryControls",
      "legacyCoachScheduleCreateReadEditPauseResume",
      "externalWrites: 0"
    ])
    && includesAll(source.deployQuestionnaireStageA, [
      "CFSB_QUESTIONNAIRE_RULES_EMULATOR_OK",
      "run-questionnaire-firestore-rules-emulator-canary.cmd"
    ])
    && includesAll(source.deployQuestionnaireStageA, [
      "questionnaire-function-revision-receipt.cjs",
      "--record",
      ":revision_receipt_failed"
    ])
    && includesAll(source.questionnaireCanaryRunner, [
      "verifyLiveFunctionReceipt",
      "--verify",
      "live_function_revision_mismatch"
    ])
    && includesAll(source.questionnaireFunctionRevisionReceipt, [
      "serviceConfig?.revision",
      "buildConfig?.build",
      "sourceProvenanceHash",
      "allTrafficOnLatestRevision",
      "function-revisions-"
    ])
    && !source.questionnaireCanaryRunner.includes("currentDocument.exists")
  && includesAll(source.questionnaireReleaseRunbook, [
      "run-questionnaire-firestore-rules-emulator-canary.cmd",
      "run-questionnaire-public-api-canary.cmd --record-revision",
      "run-questionnaire-public-api-canary.cmd --execute",
      "run-questionnaire-release-canary.cmd --pin-contact",
      "run-questionnaire-release-canary.cmd --execute-process",
      "run-questionnaire-release-canary.cmd --execute-empty",
      "run-questionnaire-release-canary.cmd --execute-positive",
      "run-questionnaire-release-canary.cmd --cleanup"
    ]),
  "Le runner, son test, son module transactionnel, le wrapper et leurs commandes runbook doivent rester dans le candidat scellé."
);

check(
  "questionnaire Stage A runs the live guard before mutation",
  stageAFirstPreflight >= 0
    && stageAFirstPreflight < stageADryRun
    && stageADryRun < stageASecondPreflight
    && stageASecondPreflight < stageADeploy
    && !source.deployQuestionnaireStageA.includes(
      "--scheduler-window-before-minutes="
    )
    && !source.verifyQuestionnaireStageAIndexReady.includes(
      "--scheduler-window-before-minutes="
    )
    && [
      ...firebaseDeployInvocationLines(source.deployQuestionnaireStageA)
    ].sort().join("\n") ===
      [stageADeployCall, stageADryRunCall].sort().join("\n")
    && !source.deployQuestionnaireStageA.includes("--force")
    && includesAll(source.verifyQuestionnaireStageAIndexReady, [
      "CFSB_QUESTIONNAIRE_RELEASE_COMMIT",
      "CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH",
      "verify-sealed-questionnaire-release-worktree.cjs",
      "seal-questionnaire-pre-release-state.cjs",
      "--plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%",
      "--verify-index-ready",
      "preflight-questionnaire-stage-a-live.cjs",
      "--protect-through-next-scheduler",
      "--require-index-ready",
      "--require-safe-scheduler-window"
    ])
    && !source.verifyQuestionnaireStageAIndexReady.includes("firebase deploy")
    && questionnaireIndexRefusalBlock.includes(
      "--protect-through-next-scheduler --require-index-ready --require-safe-scheduler-window"
    )
    && questionnaireIndexRefusalBlock.includes("exit /b 1")
    && !source.deployQuestionnaireStageA.includes("firestore:indexes"),
  "Le prévol read-only doit précéder chaque mutation permise; A4 doit utiliser uniquement le contrôle READY séparé."
);

check(
  "questionnaire mutations require exact receipt planHash and live maintenance",
  source.deployQuestionnaireStageA.includes(
    'if "%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%"=="" ('
  )
    && stageALocalReceiptCount === 2
    && stageALocalReceiptFirst >= 0
    && stageALocalReceiptFirst < stageADryRun
    && stageALocalReceiptLast > stageASecondPreflight
    && stageALocalReceiptLast < stageADeploy
    && stageAMaintenanceCount === 2
    && stageAMaintenanceFirst >= 0
    && stageAMaintenanceFirst < stageADryRun
    && stageAMaintenanceLast > stageASecondPreflight
    && stageAMaintenanceLast < stageADeploy
    && stageAExactLiveReceipt > stageAMaintenanceLast
    && stageAExactLiveReceipt < stageADeploy
    && includesAll(source.deployQuestionnaireStageB, [
      "CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH",
      stageALocalReceiptInvocation,
      maintenanceVerifyInvocation
    ])
    && source.deployQuestionnaireStageB.indexOf(stageALocalReceiptInvocation)
      < source.deployQuestionnaireStageB.indexOf(maintenanceVerifyInvocation)
    && source.deployQuestionnaireStageB.indexOf(maintenanceVerifyInvocation)
      < source.deployQuestionnaireStageB.indexOf(
        'call "%~dp0deploy-hosting-dashboard.cmd"'
      ),
  "Chaque mutation doit relire le recu SHA/planHash et confirmer maintenancePublished; A1 doit aussi comparer tout le snapshot au live juste avant rules."
);

const questionnaireReleaseWrappers = [
  source.deployQuestionnaireStageA,
  source.deployQuestionnaireStageB,
  source.deployHosting,
  source.verifyQuestionnaireStageAIndexReady
];
const sealedInvocation =
  '"%NODE_EXE%" "%~dp0tools\\verify-sealed-questionnaire-release-worktree.cjs" "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"';
const stageASealLast =
  source.deployQuestionnaireStageA.lastIndexOf(sealedInvocation);
const hostingDryRun =
  source.deployHosting.indexOf(hostingDryRunCommand);
const hostingDeploy =
  source.deployHosting.indexOf(hostingDeployCommand);
const hostingSealLast =
  source.deployHosting.lastIndexOf(sealedInvocation);
const hostingPlanHashGuard =
  source.deployHosting.indexOf(
    'if "%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%"=="" ('
  );
const hostingReceiptFirst =
  source.deployHosting.indexOf(stageALocalReceiptInvocation);
const hostingReceiptLast =
  source.deployHosting.lastIndexOf(stageALocalReceiptInvocation);
const hostingMaintenanceFirst =
  source.deployHosting.indexOf(maintenanceVerifyInvocation);
const hostingMaintenanceLast =
  source.deployHosting.lastIndexOf(maintenanceVerifyInvocation);
const hostingPlanHashGuardBlock =
  hostingPlanHashGuard >= 0 && hostingReceiptFirst > hostingPlanHashGuard
    ? source.deployHosting.slice(hostingPlanHashGuard, hostingReceiptFirst)
    : "";
const stageAPreflightInvocation =
  '"%NODE_EXE%" "%~dp0tools\\preflight-questionnaire-stage-a-live.cjs" %LIVE_PREFLIGHT_ARGS%';
const indexReadyPreflightInvocation =
  '"%NODE_EXE%" "%~dp0tools\\preflight-questionnaire-stage-a-live.cjs" --protect-through-next-scheduler --require-index-ready --require-safe-scheduler-window';
check(
  "questionnaire release worktree proof fails closed",
  includesAll(source.sealedWorktreeVerifier, [
    '["rev-parse", "--show-toplevel"]',
    '["rev-parse", "--verify", "HEAD^{commit}"]',
    '["status", "--porcelain=v1", "--untracked-files=all"]',
    "result.status === 0",
    "worktree_not_clean",
    "git_status_unavailable"
  ])
    && questionnaireReleaseWrappers.every((wrapper) =>
      wrapper.includes("verify-sealed-questionnaire-release-worktree.cjs")
      && !wrapper.includes("for /f %%H in ('git rev-parse")
      && !wrapper.includes("git status --porcelain")
    )
    && guardedInvocationCount(
      source.deployQuestionnaireStageA,
      sealedInvocation
    ) === 2
    && guardedInvocationCount(
      source.deployQuestionnaireStageB,
      sealedInvocation
    ) === 1
    && guardedInvocationCount(source.deployHosting, sealedInvocation) === 2
    && guardedInvocationCount(
      source.verifyQuestionnaireStageAIndexReady,
      sealedInvocation
    ) === 1
    && guardedInvocationCount(
      source.deployQuestionnaireStageA,
      stageAPreflightInvocation
    ) === 2
    && guardedInvocationCount(
      source.verifyQuestionnaireStageAIndexReady,
      indexReadyPreflightInvocation
    ) === 1
    && stageADryRun < stageASealLast
    && stageASealLast < stageADeploy
    && hostingDryRun < hostingSealLast
    && hostingSealLast < hostingDeploy,
  "Les wrappers doivent déléguer la preuve HEAD/worktree à un contrôle qui vérifie chaque code de sortie Git."
);

check(
  "questionnaire Hosting repeats exact receipt and maintenance around dry-run",
  hostingPlanHashGuard >= 0
    && hostingPlanHashGuard < hostingReceiptFirst
    && hostingPlanHashGuardBlock.includes("exit /b 1")
    && guardedInvocationCount(
      source.deployHosting,
      stageALocalReceiptInvocation
    ) === 2
    && guardedInvocationCount(
      source.deployHosting,
      maintenanceVerifyInvocation
    ) === 2
    && hostingReceiptFirst < hostingMaintenanceFirst
    && hostingMaintenanceFirst < hostingDryRun
    && hostingDryRun < hostingReceiptLast
    && hostingReceiptLast < hostingMaintenanceLast
    && hostingMaintenanceLast < hostingDeploy,
  "Le chemin Hosting réel doit exiger le planHash et relire reçu SHA/planHash puis maintenancePublished avant le dry-run et juste avant la mutation."
);

const preflightHttpSource =
  `${source.questionnaireStageAPreflight}\n`
  + source.questionnaireStageAPreflightLib;
const preflightHttpMethods = [
  ...preflightHttpSource.matchAll(/method:\s*"([^"]+)"/g)
].map((match) => match[1]);
check(
  "questionnaire live preflight is read-only fail-closed and PII-minimal",
  includesAll(source.questionnaireStageAPreflight, [
    "questionnaire_schedule_live_preflight",
    "listQuestionnaireScheduleDocuments",
    "summarizeSchedules",
    "activeDue",
    "activeInvalidDate",
    "invalidStatus",
    "requireAuth(authOptions, true)",
    "Firebase CLI login with a refresh token is required",
    "--protect-through-next-scheduler",
    "--require-index-ready",
    "process.exitCode = 1"
  ])
    && includesAll(source.questionnaireStageAPreflightLib, [
      '"status"',
      '"nextSendAt"',
      'method: "GET"',
      "nextPageToken",
      "repeated pagination token",
      "pagination exceeded the safety limit",
      "https://firestore.googleapis.com/v1/projects/",
      "/databases/(default)/documents/",
      "/databases/(default)/collectionGroups/",
      'hasOwn("density")',
      'hasOwn("multikey")',
      'hasOwn("shardCount")',
      'hasOwn("unique")',
      'hasOwn("searchIndexOptions")'
    ])
    && JSON.stringify(
      questionnaireStageAPreflightLib.FIRESTORE_FIELD_PATHS
    ) === JSON.stringify([
      "status",
      "nextSendAt"
    ])
    && preflightHttpMethods.length === 2
    && preflightHttpMethods.every((method) => method === "GET")
    && !/documents:commit|batchWrite|setDoc|updateDoc|deleteDoc/.test(
      preflightHttpSource
    )
    && !/method:\s*"(?:POST|PATCH|PUT|DELETE)"/.test(preflightHttpSource)
    && !/--force|--ignore-backlog|--allow-due|BYPASS|IGNORE_BACKLOG/.test(
      preflightHttpSource
    )
    && !/clientId|clientName|clientPhone|requestedByUid|requestedByEmail/.test(
      preflightHttpSource
    )
    && !source.questionnaireStageAPreflight.includes(
      "scheduleSnapshotSha256"
    )
    && !source.questionnaireStageAPreflight.includes(
      "--scheduler-window-before-minutes="
    )
    && source.questionnaireStageAPreflight.indexOf(
      "const startedAt = new Date();"
    ) < source.questionnaireStageAPreflight.indexOf(
      "const result = await listQuestionnaireScheduleDocuments"
    )
    && source.questionnaireStageAPreflight.indexOf(
      "const result = await listQuestionnaireScheduleDocuments"
    ) < source.questionnaireStageAPreflight.indexOf(
      "const checkedAt = new Date();"
    )
    && source.questionnaireStageAPreflight.includes(
      "if (parsed.requireIndexReady)"
    )
    && source.questionnaireStageAPreflight.includes(
      "parsed.requireSafeWindow = true"
    )
    && source.questionnaireStageAPreflight.includes(
      "parsed.protectThroughNextScheduler = true"
    )
    && source.questionnaireStageAPreflight.includes(
      "env: childEnvironmentWithoutSecrets()"
    )
    && source.questionnaireStageAPreflight.includes(
      "variableName.toUpperCase()"
    )
    && source.questionnaireStageAPreflight.includes(
      "scheduleIndex.indexes !== 1"
    )
    && source.questionnaireStageAPreflight.indexOf(
      "const explicitCandidate = firstUsableFirebaseToolsRoot(candidates)"
    ) < source.questionnaireStageAPreflight.indexOf(
      'spawnSync("where", ["firebase"]'
    ),
  "Le prévol doit lire toutes les pages sans endpoint d'écriture, sans bypass et sans sortie membre."
);

const scheduleIndexes = (firestoreIndexes.indexes || []).filter(
  (index) => index.collectionGroup === "questionnaireSchedules"
);
const historicalIndexes = (firestoreIndexes.indexes || []).filter(
  (index) => index.collectionGroup !== "questionnaireSchedules"
);
check(
  "questionnaire schedule composite index is exact and isolated",
  scheduleIndexes.length === 1
    && scheduleIndexes[0].queryScope === "COLLECTION"
    && JSON.stringify(scheduleIndexes[0].fields) === JSON.stringify([
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "nextSendAt", order: "ASCENDING" }
    ])
    && JSON.stringify(historicalIndexes) === JSON.stringify(
      baselineFirestoreIndexes
    )
    && JSON.stringify(firestoreIndexes.fieldOverrides) === "[]"
    && !questionnaireStageBlocks.rules.includes("firestore:indexes")
    && !questionnaireStageBlocks.additive.includes("firestore:indexes")
    && !questionnaireStageBlocks.legacy.includes("firestore:indexes")
    && !source.deployQuestionnaireStageA.includes("firestore:indexes"),
  "Un seul index status/nextSendAt doit exister et aucune sous-étape Stage A ne peut le cibler pour ce candidat."
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
    && source.deployHosting.includes(hostingDryRunCommand)
    && source.deployHosting.includes(hostingDeployCommand)
    && [
      ...firebaseDeployInvocationLines(source.deployHosting)
    ].sort().join("\n") ===
      [hostingDeployCommand, hostingDryRunCommand].sort().join("\n")
    && !source.deployHosting.includes("--force")
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
    "verify-dashboard-docs-current-state.cjs",
    "verify-questionnaire-reconciled-candidate.mjs"
  ])
    && source.validation.includes("DEPENDANCES FUNCTIONS MANQUANTES")
    && source.validation.includes("npm ci --prefix functions"),
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
