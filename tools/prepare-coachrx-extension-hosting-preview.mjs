import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const liveSnapshotRoot = path.join(repoRoot, "releases", "dashboard-hosting", "2026-07-19T000445Z");
const liveSource = path.join(liveSnapshotRoot, "source");
const extensionReleaseRoot = path.join(repoRoot, "releases", "coachrx-extension", "v0.6.10");
const extensionManifestPath = path.join(extensionReleaseRoot, "release-manifest.json");
const previewRoot = path.join(repoRoot, "releases", "dashboard-hosting", "2026-07-19-extension-0610-preview");
const previewSource = path.join(previewRoot, "source");
const previewManifestPath = path.join(previewRoot, "preview-manifest.json");
const artifactName = "coachrx-sync-extension-0.6.10-live.zip";
const artifactSource = path.join(extensionReleaseRoot, artifactName);

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}

function listFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(root, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    })
    .sort((a, b) => a.localeCompare(b));
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  assert.notEqual(first, -1, `${label}: expected source text is missing.`);
  assert.equal(source.indexOf(before, first + before.length), -1, `${label}: source text is not unique.`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

assert.equal(fs.existsSync(previewRoot), false, `Refusing to overwrite existing preview: ${previewRoot}`);
assert.equal(fs.existsSync(liveSource), true, "The sealed live Hosting source is missing.");
assert.equal(fs.existsSync(extensionManifestPath), true, "The 0.6.10 release manifest is missing.");
assert.equal(fs.existsSync(artifactSource), true, "The 0.6.10 ZIP is missing.");

const liveManifest = JSON.parse(fs.readFileSync(path.join(liveSnapshotRoot, "manifest.json"), "utf8"));
const liveHashManifestPath = path.join(liveSnapshotRoot, liveManifest.files.hashManifest);
assert.equal(
  sha256(liveHashManifestPath),
  String(liveManifest.files.hashManifestSha256).toUpperCase(),
  "The sealed Hosting hash manifest does not match its provenance record."
);
const liveFileHashes = Object.fromEntries(
  fs.readFileSync(liveHashManifestPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([0-9a-f]{64})  (.+)$/i);
      assert.ok(match, `Invalid Hosting hash line: ${line}`);
      return [match[2], match[1].toUpperCase()];
    })
);
assert.equal(Object.keys(liveFileHashes).length, Number(liveManifest.files.count));
for (const [relativePath, expectedHash] of Object.entries(liveFileHashes)) {
  const sourceFile = path.join(liveSource, ...relativePath.split("/"));
  assert.equal(fs.existsSync(sourceFile), true, `Live snapshot file missing: ${relativePath}`);
  assert.equal(sha256(sourceFile), String(expectedHash).toUpperCase(), `Live snapshot hash mismatch: ${relativePath}`);
}

const extensionManifest = JSON.parse(fs.readFileSync(extensionManifestPath, "utf8"));
assert.equal(extensionManifest.release, "0.6.10");
assert.equal(extensionManifest.artifact?.file, artifactName);
assert.equal(sha256(artifactSource), String(extensionManifest.artifact?.sha256 || "").toUpperCase());

fs.mkdirSync(previewRoot, { recursive: false });
fs.cpSync(liveSource, previewSource, { recursive: true, errorOnExist: true });
fs.copyFileSync(artifactSource, path.join(previewSource, "downloads", artifactName));

const appPath = path.join(previewSource, "app.js");
let appSource = fs.readFileSync(appPath, "utf8");
appSource = replaceExactlyOnce(
  appSource,
  'const COACHRX_EXTENSION_VERSION = "0.6.8";',
  'const COACHRX_EXTENSION_VERSION = "0.6.10";',
  "extension version"
);
appSource = replaceExactlyOnce(
  appSource,
  'const COACHRX_EXTENSION_PUBLIC_DOWNLOAD = "./downloads/coachrx-sync-extension-0.6.8-main-world-api.zip";',
  `const COACHRX_EXTENSION_PUBLIC_DOWNLOAD = "./downloads/${artifactName}";`,
  "extension download"
);
fs.writeFileSync(appPath, appSource, "utf8");

const files = Object.fromEntries(listFiles(previewSource).map((file) => [
  path.relative(previewSource, file).split(path.sep).join("/"),
  sha256(file)
]));
const previewManifest = {
  schemaVersion: 1,
  status: "preview_candidate_not_approved_for_live_distribution",
  baseHostingSnapshot: "2026-07-19T000445Z",
  baseHostingSourceFiles: Object.keys(liveFileHashes).length,
  extension: {
    version: "0.6.10",
    artifact: artifactName,
    sha256: extensionManifest.artifact.sha256
  },
  files
};
fs.writeFileSync(previewManifestPath, `${JSON.stringify(previewManifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  previewRoot,
  publicRoot: previewSource,
  files: Object.keys(files).length,
  extension: previewManifest.extension
}, null, 2));
