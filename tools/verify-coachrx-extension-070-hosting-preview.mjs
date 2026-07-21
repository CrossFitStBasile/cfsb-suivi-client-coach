import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewRoot = path.join(repoRoot, "releases", "dashboard-hosting", "2026-07-21-extension-070-preview");
const publicRoot = path.join(previewRoot, "source");
const manifest = JSON.parse(fs.readFileSync(path.join(previewRoot, "preview-manifest.json"), "utf8"));

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}

function listFiles(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(current, entry.name);
      return entry.isDirectory()
        ? listFiles(root, full)
        : [path.relative(root, full).split(path.sep).join("/")];
    })
    .sort((left, right) => left.localeCompare(right));
}

assert.equal(manifest.status, "approved_for_live_distribution");
assert.equal(manifest.extension?.version, "0.7.0");
assert.equal(manifest.extension?.protocol, "integrated-v1");
assert.equal(manifest.extension?.coachScope, "server-configured-active-coaches");
const expectedFiles = Object.keys(manifest.files || {}).sort((left, right) => left.localeCompare(right));
const actualFiles = listFiles(publicRoot);
assert.deepEqual(actualFiles, expectedFiles, "Preview file set differs from the sealed manifest.");
for (const [relativePath, expectedHash] of Object.entries(manifest.files || {})) {
  const file = path.join(publicRoot, ...relativePath.split("/"));
  assert.equal(fs.existsSync(file), true, `Preview file missing: ${relativePath}`);
  assert.equal(sha256(file), String(expectedHash).toUpperCase(), `Preview hash mismatch: ${relativePath}`);
}

const app = fs.readFileSync(path.join(publicRoot, "app.js"), "utf8");
const index = fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
const guide = fs.readFileSync(path.join(publicRoot, "downloads", "dashboard-coach-guide-equipe.html"), "utf8");
assert.match(app, /const APP_VERSION = "20260721-coachrx-extension-070";/);
assert.match(app, /const COACHRX_EXTENSION_VERSION = "0\.7\.0";/);
assert.match(app, /coachrx-sync-extension-0\.7\.0-live\.zip/);
assert.match(app, /Valider sans ecrire/);
assert.doesNotMatch(app, /const COACHRX_EXTENSION_VERSION = "0\.6\.8";/);
assert.equal((index.match(/20260721-coachrx-extension-070/g) || []).length, 2);
assert.match(guide, /Valider sans ecrire/);
assert.match(guide, /Importer le roster valide dans le dashboard/);

const artifact = path.join(publicRoot, "downloads", manifest.extension.artifact);
assert.equal(sha256(artifact), String(manifest.extension.sha256).toUpperCase());

console.log(JSON.stringify({
  ok: true,
  status: manifest.status,
  files: expectedFiles.length,
  appVersion: manifest.appVersion,
  extension: manifest.extension
}, null, 2));
