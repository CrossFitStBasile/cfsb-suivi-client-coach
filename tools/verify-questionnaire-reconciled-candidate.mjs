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
  "functions/questionnaire-studio.js",
  "functions/questionnaire-service.js",
  "tools/questionnaire-stage-a-preflight-lib.cjs",
  "tools/preflight-questionnaire-stage-a-live.cjs",
  "tools/verify-sealed-questionnaire-release-worktree.cjs",
  "tools/verify-questionnaire-live-continuity.mjs"
];

const rootTests = readdirSync(join(root, "tests"))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => `tests/${name}`);

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
