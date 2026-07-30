#!/usr/bin/env node

import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (value) => relative(root, value).replaceAll("\\", "/");

const syntaxTargets = [
  "firebase-dashboard/public/app.js",
  "firebase-dashboard/public/questionnaire-studio.js",
  "firebase-dashboard/public/questionnaire/f/questionnaire-public.js",
  "functions/index.js",
  "functions/questionnaire-scheduler-safety.js",
  "functions/questionnaire-send-safety.js",
  "functions/questionnaire-studio.js",
  "functions/questionnaire-service.js",
  "tools/reperes-v2-release-lib.cjs",
  "tools/publish-reperes-v2.cjs",
  "tools/reperes-v2-ghl-activation-lib.cjs",
  "tools/activate-reperes-v2-ghl.cjs",
  "tools/questionnaire-release-announcement-lib.cjs",
  "tools/manage-questionnaire-release-announcements.cjs",
  "tools/questionnaire-pre-release-state-lib.cjs",
  "tools/seal-questionnaire-pre-release-state.cjs",
  "tools/rollback-questionnaire-pre-release-state.cjs",
  "tools/manage-questionnaire-rate-limit-ttl.cjs",
  "tools/questionnaire-scheduler-canary-lib.cjs",
  "tools/questionnaire-public-api-canary-lib.cjs",
  "tools/questionnaire-function-revision-receipt.cjs",
  "tools/run-questionnaire-firestore-rules-emulator-canary.cjs",
  "tools/run-questionnaire-public-api-canary.cjs",
  "tools/run-questionnaire-scheduler-canary.cjs",
  "tools/questionnaire-stage-a-preflight-lib.cjs",
  "tools/preflight-questionnaire-stage-a-live.cjs",
  "tools/activate-questionnaire-firestore-queue.cjs",
  "tools/deploy-questionnaire-appscript-version.cjs",
  "tools/deploy-hosting-api.cjs",
  "tools/verify-sealed-questionnaire-release-worktree.cjs",
  "tools/verify-questionnaire-live-continuity.mjs"
];

const rootTests = readdirSync(join(root, "tests"))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => `tests/${name}`);

const requiredRootTests = [
  "tests/questionnaire-appscript-mutation-guard.test.mjs",
  "tests/questionnaire-hosting-api-guard.test.mjs",
  "tests/questionnaire-index-two-pass-guard.test.mjs",
  "tests/questionnaire-public-api-canary.test.mjs",
  "tests/questionnaire-scheduler-canary.test.mjs"
];
const missingRequiredRootTests = requiredRootTests.filter(
  (target) => !rootTests.includes(target)
);
if (missingRequiredRootTests.length > 0) {
  console.error(
    "STOP — tests obligatoires absents de la porte locale : "
      + missingRequiredRootTests.join(", ")
  );
  process.exit(1);
}

const functionTests = readdirSync(join(root, "functions", "test"))
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .map((name) => `functions/test/${name}`);

const staticVerifiers = [
  "tools/verify-hosting-deploy-provenance.cjs",
  "tools/verify-firebase-questionnaire-forms.cjs",
  "tools/verify-questionnaire-followup-logic.cjs",
  "tools/verify-questionnaire-reading.cjs",
  "tools/verify-google-only-readiness.cjs",
  "tools/verify-update-announcements.cjs",
  "tools/verify-responsive-integrity.cjs",
  "tools/verify-hosting-smoke.cjs"
];

const steps = [
  ...syntaxTargets.map((target) => ({
    label: `syntaxe ${target}`,
    args: ["--check", target]
  })),
  {
    label: `${rootTests.length} tests de continuité Hosting`,
    args: ["--test", ...rootTests]
  },
  {
    label: `${functionTests.length} tests Functions`,
    args: ["--test", ...functionTests]
  },
  ...staticVerifiers.map((target) => ({
    label: rel(join(root, target)),
    args: [target]
  }))
];

console.log(
  "Porte locale Questionnaire Studio — aucune écriture externe et aucun déploiement."
);

for (const [index, step] of steps.entries()) {
  console.log(`\n[${index + 1}/${steps.length}] ${step.label}`);
  const result = spawnSync(process.execPath, step.args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\nSTOP — échec de la porte locale à l'étape « ${step.label} ».`);
    process.exit(result.status || 1);
  }
}

console.log(
  `\nPASS — ${steps.length} étapes locales réussies; le candidat n'a pas été déployé.`
);
