import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cmd = fs.readFileSync(path.join(root, "deploy-hosting-api.cmd"), "utf8");
const hostingCmd = fs.readFileSync(
  path.join(root, "deploy-hosting-dashboard.cmd"),
  "utf8"
);
const googleOnlyLive = fs.readFileSync(
  path.join(root, "cloudbuild.google-only-live.yaml"),
  "utf8"
);
const deployRunbook = fs.readFileSync(
  path.join(root, "firebase-dashboard", "DEPLOY_RUNBOOK.md"),
  "utf8"
);
const runner = fs.readFileSync(
  path.join(root, "tools", "deploy-hosting-api.cjs"),
  "utf8"
);
const require = createRequire(import.meta.url);
const { collectFiles } = require(
  path.join(root, "tools", "deploy-hosting-api.cjs")
);

test("le raccourci Hosting API s'arrête avant Node pendant la release gardée", () => {
  const guard = cmd.indexOf(
    'if exist "%~dp0firebase-dashboard\\QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md" ('
  );
  const nodeCall = cmd.indexOf('"%NODE_EXE%" tools\\deploy-hosting-api.cjs');

  assert.ok(guard >= 0);
  assert.ok(nodeCall > guard);
  assert.match(
    cmd.slice(guard, nodeCall),
    /STOP: la publication Hosting par API est desactivee pour ce candidat/
  );
  assert.match(cmd.slice(guard, nodeCall), /deploy-questionnaire-stage-b\.cmd/);
  assert.match(cmd.slice(guard, nodeCall), /exit \/b 1/);
});

test("le runner direct refuse aussi le garde avant auth ou écriture", () => {
  const main = runner.indexOf("async function main() {");
  const guard = runner.indexOf(
    "if (fs.existsSync(stagedReleaseGuardPath))",
    main
  );
  const authRead = runner.indexOf("const cliConfig = readJson(cliConfigPath)", main);
  const versionCreate = runner.indexOf("const version = await request(", main);

  assert.ok(main >= 0);
  assert.ok(guard > main);
  assert.ok(authRead > guard);
  assert.ok(versionCreate > authRead);
  assert.match(
    runner.slice(guard, authRead),
    /deploy-questionnaire-stage-b\.cmd/
  );
});

test("le collecteur de secours inclut les assets Hosting imbriqués", () => {
  const collectStart = runner.indexOf("function collectFiles(dir) {");
  const configStart = runner.indexOf(
    "function hostingConfigFromFirebaseJson",
    collectStart
  );
  const collect = runner.slice(collectStart, configStart);

  assert.match(collect, /function walk\(currentDir\)/);
  assert.match(collect, /if \(stat\.isDirectory\(\)\)/);
  assert.match(collect, /walk\(absolutePath\)/);
  assert.match(collect, /relativePath\.split\(path\.sep\)\.join\("\/"\)/);
  assert.match(collect, /stat\.isSymbolicLink\(\)/);
  assert.doesNotMatch(collect, /filter\(\(name\).*isFile/);

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "cfsb-hosting-files-")
  );
  try {
    fs.mkdirSync(path.join(tempDir, "questionnaire", "f"), {
      recursive: true
    });
    fs.writeFileSync(path.join(tempDir, "index.html"), "index", "utf8");
    fs.writeFileSync(
      path.join(tempDir, "questionnaire", "f", "app.js"),
      "nested",
      "utf8"
    );
    assert.deepEqual(
      collectFiles(tempDir).map((file) => file.path),
      ["/index.html", "/questionnaire/f/app.js"]
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("le vrai chemin Hosting répète reçu et maintenance autour du dry-run", () => {
  const dryRun = hostingCmd.indexOf(
    'deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only hosting'
  );
  const deploy = hostingCmd.indexOf(
    'deploy --project cfsb-dashboard-coach-aa9a4 --only hosting'
  );
  const receipt =
    '"%NODE_EXE%" "%~dp0tools\\seal-questionnaire-pre-release-state.cjs" '
    + '"--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" '
    + '"--plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%" --verify-receipt';
  const maintenance =
    '"%NODE_EXE%" "%~dp0tools\\manage-questionnaire-release-announcements.cjs" '
    + '"--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" --maintenance-verify';
  const receiptPositions = [
    ...hostingCmd.matchAll(new RegExp(
      receipt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    ))
  ].map((match) => match.index);
  const maintenancePositions = [
    ...hostingCmd.matchAll(new RegExp(
      maintenance.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    ))
  ].map((match) => match.index);

  assert.ok(dryRun >= 0 && deploy > dryRun);
  assert.match(
    hostingCmd.slice(0, receiptPositions[0]),
    /if "%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%"=="" \([\s\S]*exit \/b 1/
  );
  assert.equal(receiptPositions.length, 2);
  assert.equal(maintenancePositions.length, 2);
  assert.ok(receiptPositions[0] < dryRun);
  assert.ok(
    maintenancePositions[0] > receiptPositions[0]
      && maintenancePositions[0] < dryRun
  );
  assert.ok(receiptPositions[1] > dryRun && receiptPositions[1] < deploy);
  assert.ok(maintenancePositions[1] > receiptPositions[1]);
  assert.ok(maintenancePositions[1] < deploy);
  assert.match(
    hostingCmd.slice(receiptPositions[0], maintenancePositions[0]),
    /--verify-receipt[\s\S]*if errorlevel 1 \([\s\S]*exit \/b 1/
  );
  assert.match(
    hostingCmd.slice(maintenancePositions[0], dryRun),
    /--maintenance-verify[\s\S]*if errorlevel 1 \([\s\S]*exit \/b 1/
  );
  assert.match(
    hostingCmd.slice(receiptPositions[1], deploy),
    /--verify-receipt[\s\S]*if errorlevel 1 \([\s\S]*exit \/b 1/
  );
  assert.match(
    hostingCmd.slice(maintenancePositions[1], deploy),
    /--maintenance-verify[\s\S]*if errorlevel 1 \([\s\S]*exit \/b 1/
  );
});

test("Cloud Build live échoue avant Hosting pendant la release gardée", () => {
  const guard = googleOnlyLive.indexOf(
    "if [ -f firebase-dashboard/QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md ]; then"
  );
  const deploy = googleOnlyLive.indexOf(
    "npx --yes firebase-tools@15.19.1 deploy"
  );

  assert.ok(guard >= 0);
  assert.ok(deploy > guard);
  assert.match(
    googleOnlyLive.slice(guard, deploy),
    /deploy-questionnaire-stage-a\.cmd/
  );
  assert.match(
    googleOnlyLive.slice(guard, deploy),
    /deploy-questionnaire-stage-b\.cmd/
  );
  assert.match(googleOnlyLive.slice(guard, deploy), /exit 1/);
  assert.match(
    deployRunbook,
    /`cloudbuild\.google-only-live\.yaml` echoue volontairement/
  );
  assert.match(
    deployRunbook,
    /Stage A \(`rules`, `additive`, `legacy`\), controles A4 read-only et canaris, puis Stage B/
  );
});
