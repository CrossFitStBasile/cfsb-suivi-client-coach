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

const dryRunCall =
  'call "%FIREBASE_BIN%" deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only "%DEPLOY_ONLY%" --non-interactive %FIREBASE_AUTH_ARGS% > "%DRY_RUN_LOG%" 2>&1';
const deployCall =
  'call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only "%DEPLOY_ONLY%" --non-interactive %FIREBASE_AUTH_ARGS% > "%DEPLOY_LOG%" 2>&1';
const proofPredicate =
  'if /I not "%CFSB_QUESTIONNAIRE_INDEX_DRY_RUN_REVIEWED%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (';
const secondPreflight =
  '"%NODE_EXE%" "%~dp0tools\\preflight-questionnaire-stage-a-live.cjs" %LIVE_PREFLIGHT_ARGS%';
const finalSeal =
  '"%NODE_EXE%" "%~dp0tools\\verify-sealed-questionnaire-release-worktree.cjs" "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"';

test("indexes requires a SHA-bound reviewed dry-run in a later invocation", () => {
  const dryRun = script.indexOf(dryRunCall);
  const indexGate = script.indexOf(
    'if /I "%QUESTIONNAIRE_STAGE%"=="indexes" (',
    dryRun
  );
  const proof = script.indexOf(proofPredicate, indexGate);
  const stop = script.indexOf("exit /b 1", proof);
  const secondPreflightPosition = script.indexOf(secondPreflight, proof);
  const deploy = script.indexOf(deployCall);

  assert.ok(dryRun >= 0, "the Firebase dry-run must exist");
  assert.ok(indexGate > dryRun, "the index-only gate must follow the dry-run");
  assert.match(script, /index-dry-run-%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%\.receipt/);
  assert.match(
    script,
    /if not exist "%LOCALAPPDATA%\\CFSB\\questionnaire-release\\index-dry-run-/
  );
  assert.match(script, /premiere invocation indexes terminee sans mutation/);
  assert.match(script, /set \/p INDEX_REVIEW_RECEIPT_SHA=/);
  assert.match(
    script,
    /if \/I not "!INDEX_REVIEW_RECEIPT_SHA!"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"/
  );
  assert.ok(
    script.indexOf("premiere invocation indexes terminee sans mutation", indexGate) < proof,
    "an absent receipt must stop the first invocation before the review variable is considered"
  );
  assert.ok(proof > indexGate, "the proof must be checked only for indexes");
  assert.ok(stop > proof, "the unreviewed first invocation must stop");
  assert.ok(
    stop < secondPreflightPosition,
    "the first invocation must stop before mutation preflights"
  );
  assert.ok(
    secondPreflightPosition < deploy,
    "a reviewed second invocation must rerun the live preflight before deploy"
  );
  assert.match(
    script.slice(proof, stop),
    /set CFSB_QUESTIONNAIRE_INDEX_DRY_RUN_REVIEWED=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%/,
    "the operator instruction must bind the proof to the sealed SHA"
  );
});

test("each invocation traverses the complete shared preflight chain", () => {
  const dryRun = script.indexOf(dryRunCall);
  const requiredBeforeDryRun = [
    finalSeal,
    '"%NODE_EXE%" "%~dp0tools\\verify-firebase-auth-ready.cjs"',
    '"%NODE_EXE%" "%~dp0tools\\verify-questionnaire-reconciled-candidate.mjs"',
    secondPreflight,
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
    "the complete shared preflight chain must finish before every dry-run"
  );
});

test("the reviewed invocation still reseals after its repeated dry-run", () => {
  const dryRun = script.indexOf(dryRunCall);
  const deploy = script.indexOf(deployCall);
  const seals = [...script.matchAll(
    /"%NODE_EXE%" "%~dp0tools\\verify-sealed-questionnaire-release-worktree\.cjs" "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"/g
  )].map((match) => match.index);

  assert.equal(seals.length, 2, "the script must retain both seal checks");
  assert.ok(
    seals.some((position) => position > dryRun && position < deploy),
    "the final sealed-worktree check must remain between dry-run and mutation"
  );
});

test("rules and function stages keep the shared deployment path", () => {
  for (const stage of ["rules", "additive", "legacy"]) {
    const stageStart = script.indexOf(
      `if /I "%QUESTIONNAIRE_STAGE%"=="${stage}" (`
    );
    assert.ok(stageStart >= 0, `${stage} stage must remain available`);
  }

  assert.equal(
    script.match(
      /if \/I "%QUESTIONNAIRE_STAGE%"=="indexes" \(/g
    )?.length,
    2,
    "only index selection and the post-dry-run index gate should be index-specific"
  );
  assert.equal(
    script.match(/call "%FIREBASE_BIN%" deploy --project/g)?.length,
    1,
    "the existing shared mutation call must remain unique"
  );
});
