import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(
  resolve(root, "deploy-questionnaire-stage-a.cmd"),
  "utf8"
);
const stageBScript = readFileSync(
  resolve(root, "deploy-questionnaire-stage-b.cmd"),
  "utf8"
);
const indexReadyScript = readFileSync(
  resolve(root, "verify-questionnaire-stage-a-index-ready.cmd"),
  "utf8"
);

const dryRunCall =
  'call "%FIREBASE_BIN%" deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only "%DEPLOY_ONLY%" --non-interactive %FIREBASE_AUTH_ARGS% > "%DRY_RUN_LOG%" 2>&1';
const deployCall =
  'call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only "%DEPLOY_ONLY%" --non-interactive %FIREBASE_AUTH_ARGS% > "%DEPLOY_LOG%" 2>&1';
const firstPreflight =
  '"%NODE_EXE%" "%~dp0tools\\preflight-questionnaire-stage-a-live.cjs" %LIVE_PREFLIGHT_ARGS%';
const finalSeal =
  '"%NODE_EXE%" "%~dp0tools\\verify-sealed-questionnaire-release-worktree.cjs" "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"';
const localReceipt =
  '"%NODE_EXE%" "%~dp0tools\\seal-questionnaire-pre-release-state.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" "--plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%" --verify-receipt';
const exactLiveReceipt =
  '"%NODE_EXE%" "%~dp0tools\\seal-questionnaire-pre-release-state.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" "--plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%" --verify';
const maintenanceVerify =
  '"%NODE_EXE%" "%~dp0tools\\manage-questionnaire-release-announcements.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" --maintenance-verify';
const indexGate =
  'if /I "%QUESTIONNAIRE_STAGE%"=="indexes" (';
const authorizationGate =
  'if /I not "%CFSB_QUESTIONNAIRE_RELEASE_GO%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (';

test("indexes fails closed before any release preflight or Firebase command", () => {
  const gate = script.indexOf(indexGate);
  const authorization = script.indexOf(authorizationGate);
  const block = script.slice(gate, authorization);

  assert.ok(gate >= 0, "the explicit indexes refusal must exist");
  assert.ok(
    gate < authorization,
    "indexes must be rejected before release checks can invoke tools"
  );
  assert.match(block, /STOP: le mode indexes est desactive pour ce candidat/);
  assert.match(block, /A4 est\r?\n\s*echo strictement une verification en lecture seule/);
  assert.match(
    block,
    /preflight-questionnaire-stage-a-live\.cjs --protect-through-next-scheduler --require-index-ready --require-safe-scheduler-window/
  );
  assert.match(
    block,
    /seal-questionnaire-pre-release-state\.cjs --release-commit=%%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%% --plan-hash=%%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%% --verify-index-ready/
  );
  assert.match(block, /verify-questionnaire-stage-a-index-ready\.cmd/);
  assert.match(block, /exit \/b 1/);
  assert.doesNotMatch(block, /goto :stage_selected/);
  assert.doesNotMatch(block, /DEPLOY_ONLY=/);
  assert.doesNotMatch(block, /\bfirebase\b/i);
});

test("Stage A has no index deployment target or obsolete review bypass", () => {
  assert.doesNotMatch(script, /firestore:indexes/i);
  assert.doesNotMatch(script, /CFSB_QUESTIONNAIRE_INDEX_DRY_RUN_REVIEWED/);
  assert.doesNotMatch(script, /index-dry-run-/);
  assert.doesNotMatch(script, /:indexes_published/);

  const assignments = (
    script.match(/^\s*set "DEPLOY_ONLY=[^"]+"\r?$/gm) || []
  ).map((line) => line.trim());
  assert.deepEqual(assignments, [
    'set "DEPLOY_ONLY=firestore:rules"',
    'set "DEPLOY_ONLY=functions:listQuestionnaireForms,functions:saveQuestionnaireDraft,functions:publishQuestionnaireForm,functions:setQuestionnaireDeliveryReady,functions:archiveQuestionnaireForm,functions:duplicateQuestionnaireForm,functions:questionnairePublicApi"',
    'set "DEPLOY_ONLY=functions:sendQuestionnaire,functions:processQuestionnaireSendRequest,functions:scheduledQuestionnaireSendRecovery,functions:scheduledQuestionnaireSendPlans,functions:syncDashboardFromSheets,functions:scheduledDashboardSync,functions:scheduledQuestionnaireResponseSync,functions:processSyncRequest"'
  ]);
});

test("only rules, additive and legacy reach the shared deployment path", () => {
  const stages = ["rules", "additive", "legacy"];
  let cursor = script.indexOf(authorizationGate);

  for (const stage of stages) {
    const marker = `if /I "%QUESTIONNAIRE_STAGE%"=="${stage}" (`;
    const position = script.indexOf(marker, cursor);
    assert.ok(position > cursor, `${stage} must remain available in order`);
    const nextBoundary = stage === "legacy"
      ? script.indexOf('echo STOP: sous-etape inconnue', position)
      : script.indexOf(
        `if /I "%QUESTIONNAIRE_STAGE%"=="${
          stages[stages.indexOf(stage) + 1]
        }" (`,
        position
      );
    const block = script.slice(position, nextBoundary);
    assert.match(block, /goto :stage_selected/);
    cursor = position;
  }

  assert.equal(
    script.match(/call "%FIREBASE_BIN%" deploy --project/g)?.length,
    1,
    "the shared mutation call must remain unique"
  );
  assert.equal(
    script.match(/call "%FIREBASE_BIN%" deploy --dry-run/g)?.length,
    1,
    "the shared dry-run call must remain unique"
  );
  assert.ok(script.includes(dryRunCall));
  assert.ok(script.includes(deployCall));
});

test("each mutable stage retains the complete shared preflight chain", () => {
  const dryRun = script.indexOf(dryRunCall);
  const requiredBeforeDryRun = [
    finalSeal,
    localReceipt,
    maintenanceVerify,
    '"%NODE_EXE%" "%~dp0tools\\verify-firebase-auth-ready.cjs"',
    '"%NODE_EXE%" "%~dp0tools\\verify-questionnaire-reconciled-candidate.mjs"',
    firstPreflight,
    'call "%~dp0verify-dashboard-before-deploy.cmd"'
  ];
  let cursor = -1;

  for (const invocation of requiredBeforeDryRun) {
    const position = script.indexOf(invocation, cursor + 1);
    assert.ok(
      position > cursor,
      `missing or out-of-order preflight: ${invocation}`
    );
    cursor = position;
  }

  assert.ok(
    cursor < dryRun,
    "the complete shared preflight chain must finish before the dry-run"
  );
});

test("mutable stages reseal after dry-run and before deploy", () => {
  const dryRun = script.indexOf(dryRunCall);
  const deploy = script.indexOf(deployCall);
  const secondPreflight = script.indexOf(firstPreflight, dryRun);
  const seals = [...script.matchAll(
    /"%NODE_EXE%" "%~dp0tools\\verify-sealed-questionnaire-release-worktree\.cjs" "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"/g
  )].map((match) => match.index);

  assert.equal(seals.length, 2, "the script must retain both seal checks");
  assert.ok(secondPreflight > dryRun && secondPreflight < deploy);
  assert.ok(
    seals.some((position) => position > secondPreflight && position < deploy),
    "the final sealed-worktree check must remain immediately before mutation"
  );
  const maintenancePositions = [...script.matchAll(
    /"%NODE_EXE%" "%~dp0tools\\manage-questionnaire-release-announcements\.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" --maintenance-verify/g
  )].map((match) => match.index);
  assert.equal(
    maintenancePositions.length,
    2,
    "maintenance must be verified before dry-run and again before mutation"
  );
  assert.ok(maintenancePositions[0] < dryRun);
  assert.ok(
    maintenancePositions[1] > secondPreflight
      && maintenancePositions[1] < deploy
  );
  const escapedExactLiveReceipt = exactLiveReceipt.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const exactLiveReceiptMatch = new RegExp(
    `^\\s*${escapedExactLiveReceipt}\\r?$`,
    "m"
  ).exec(script);
  const exactLiveReceiptPosition = exactLiveReceiptMatch?.index ?? -1;
  assert.ok(exactLiveReceiptPosition > maintenancePositions[1]);
  assert.ok(exactLiveReceiptPosition < deploy);
  assert.ok(script.lastIndexOf(localReceipt) > maintenancePositions[1]);
  assert.ok(script.lastIndexOf(localReceipt) < deploy);
});

test("Stage A fails closed without planHash, receipt or live maintenance", () => {
  const dryRun = script.indexOf(dryRunCall);
  const planGate = script.indexOf(
    'if "%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%"=="" ('
  );
  assert.ok(planGate >= 0 && planGate < dryRun);
  assert.match(
    script.slice(planGate, script.indexOf(finalSeal, planGate)),
    /exit \/b 1/
  );

  const firstReceipt = script.indexOf(localReceipt);
  const firstMaintenance = script.indexOf(maintenanceVerify);
  assert.ok(firstReceipt > planGate && firstReceipt < dryRun);
  assert.match(
    script.slice(firstReceipt, firstMaintenance),
    /if errorlevel 1 \([\s\S]*exit \/b 1/
  );
  assert.match(
    script.slice(firstMaintenance, dryRun),
    /if errorlevel 1 \([\s\S]*maintenancePublished[\s\S]*exit \/b 1/
  );
});

test("A4 and Stage B bind their real checks to the same receipt planHash", () => {
  assert.match(
    indexReadyScript,
    /if "%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%"=="" \(/
  );
  assert.match(
    indexReadyScript,
    /seal-questionnaire-pre-release-state\.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" "--plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%" --verify-index-ready/
  );
  assert.doesNotMatch(indexReadyScript, /firebase deploy/i);

  const hostingCall = stageBScript.indexOf(
    'call "%~dp0deploy-hosting-dashboard.cmd"'
  );
  const stageBReceipt = stageBScript.indexOf(localReceipt);
  const stageBMaintenance = stageBScript.indexOf(maintenanceVerify);
  assert.ok(stageBReceipt >= 0 && stageBReceipt < stageBMaintenance);
  assert.ok(stageBMaintenance < hostingCall);
  assert.match(
    stageBScript.slice(stageBMaintenance, hostingCall),
    /if errorlevel 1 \([\s\S]*maintenancePublished[\s\S]*exit \/b 1/
  );
});

test("usage exposes only mutable stages and routes A4 to read-only controls", () => {
  const usage = script.slice(script.indexOf(":usage"));

  assert.match(usage, /deploy-questionnaire-stage-a\.cmd rules/);
  assert.match(usage, /deploy-questionnaire-stage-a\.cmd additive/);
  assert.match(usage, /deploy-questionnaire-stage-a\.cmd legacy/);
  assert.doesNotMatch(usage, /deploy-questionnaire-stage-a\.cmd indexes/);
  assert.match(usage, /controles A4/);
  assert.match(usage, /strictement read-only/);
  assert.match(usage, /mode indexes echoue toujours ferme/);
});
