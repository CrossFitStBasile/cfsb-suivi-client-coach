import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const guardedRunners = [
  "tools/activate-questionnaire-firestore-queue.cjs",
  "tools/deploy-questionnaire-appscript-version.cjs"
];

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function mainBlock(source) {
  const start = source.indexOf("async function main() {");
  assert.notEqual(start, -1, "main() doit exister");
  const nextFunction = source.indexOf("\nfunction ", start);
  const nextAsyncFunction = source.indexOf("\nasync function ", start + 1);
  const candidates = [nextFunction, nextAsyncFunction].filter(
    (position) => position > start
  );
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test("les mutations Apps Script legacy s'arrêtent avant auth, réseau ou sauvegarde", () => {
  for (const relativePath of guardedRunners) {
    const source = read(relativePath);
    const block = mainBlock(source);
    const guard = block.indexOf("fs.existsSync(stagedReleaseGuardPath)");
    const firstWrite = block.indexOf("fsp.mkdir");
    const firstApi = block.indexOf("appsScriptApi(");

    assert.ok(guard >= 0, `${relativePath}: garde staged absent`);
    assert.ok(firstWrite > guard, `${relativePath}: écriture avant le garde`);
    assert.ok(firstApi > guard, `${relativePath}: API avant le garde`);
    assert.match(
      block.slice(guard, Math.min(firstWrite, firstApi)),
      /throw new Error\([\s\S]*Apps Script questionnaire v23 reste immuable/
    );
    assert.match(
      source,
      /QUESTIONNAIRE_STAGED_RELEASE_REQUIRED\.md/
    );
    assert.match(
      source,
      /QUESTIONNAIRE_RELEASE_RUNBOOK_20260728\.md/
    );
  }
});

test("les deux runners refusent réellement le candidat courant sans lire Bob", () => {
  for (const relativePath of guardedRunners) {
    const result = spawnSync(process.execPath, [relativePath], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000
    });
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;

    assert.equal(result.status, 1, `${relativePath}: doit échouer fermé`);
    assert.match(output, /Apps Script questionnaire v23 reste immuable/);
    assert.doesNotMatch(output, /token\.json introuvable|refresh_token|oauth-client/);
  }
});
