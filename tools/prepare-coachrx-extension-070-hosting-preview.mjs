import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const liveSnapshotRoot = path.join(repoRoot, "releases", "dashboard-hosting", "2026-07-19T000445Z");
const liveSource = path.join(liveSnapshotRoot, "source");
const extensionReleaseRoot = path.resolve(repoRoot, "..", "final-artifacts", "coachrx-extension-v0.7.0", "dist", "production-generalized");
const extensionManifestPath = path.join(extensionReleaseRoot, "build-manifest.json");
const previewRoot = path.join(repoRoot, "releases", "dashboard-hosting", "2026-07-21-extension-070-preview");
const previewSource = path.join(previewRoot, "source");
const previewManifestPath = path.join(previewRoot, "preview-manifest.json");
const artifactName = "coachrx-sync-extension-0.7.0-live.zip";
const artifactSource = path.join(extensionReleaseRoot, "coachrx-sync-extension-0.7.0.zip");
const appVersion = "20260721-coachrx-extension-070";

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
assert.equal(fs.existsSync(extensionManifestPath), true, "The 0.7.0 build manifest is missing.");
assert.equal(fs.existsSync(artifactSource), true, "The 0.7.0 ZIP is missing.");

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
assert.equal(extensionManifest.release, "0.7.0");
assert.equal(extensionManifest.protocol, "integrated-v1");
assert.equal(extensionManifest.coachScope, "server-configured-active-coaches");
assert.equal(extensionManifest.replayToolIncluded, false);
assert.equal(extensionManifest.distributionAllowed, true);
assert.equal(sha256(artifactSource), String(extensionManifest.artifact?.sha256 || "").toUpperCase());

fs.mkdirSync(previewRoot, { recursive: false });
fs.cpSync(liveSource, previewSource, { recursive: true, errorOnExist: true });
fs.copyFileSync(artifactSource, path.join(previewSource, "downloads", artifactName));

const appPath = path.join(previewSource, "app.js");
let appSource = fs.readFileSync(appPath, "utf8");
appSource = replaceExactlyOnce(
  appSource,
  'const APP_VERSION = "20260718-questionnaire-phone-extension-068";',
  `const APP_VERSION = "${appVersion}";`,
  "app version"
);
appSource = replaceExactlyOnce(
  appSource,
  'const COACHRX_EXTENSION_VERSION = "0.6.8";',
  'const COACHRX_EXTENSION_VERSION = "0.7.0";',
  "extension version"
);
appSource = replaceExactlyOnce(
  appSource,
  'const COACHRX_EXTENSION_PUBLIC_DOWNLOAD = "./downloads/coachrx-sync-extension-0.6.8-main-world-api.zip";',
  `const COACHRX_EXTENSION_PUBLIC_DOWNLOAD = "./downloads/${artifactName}";`,
  "extension download"
);
appSource = replaceExactlyOnce(
  appSource,
  '["5", "Tester puis synchroniser", "Dans l\'extension, utilise Ouvrir la page CoachRx du coach, puis Tester CoachRx. Synchronise seulement si le mode API et toutes les identites sont valides."]',
  '["5", "Valider puis importer", "Dans l\'extension, ouvre la page CoachRx du coach, clique Valider sans ecrire, verifie le nombre de clients, puis importe exactement ce roster valide."]',
  "guide step 5"
);
appSource = replaceExactlyOnce(
  appSource,
  '"Le test CoachRx doit indiquer coachrx-page-api et des identites stables pour toutes les fiches.",',
  '"La validation sans ecriture doit reussir et confirmer des identites stables pour toutes les fiches.",',
  "guide validation check"
);
appSource = replaceExactlyOnce(
  appSource,
  '["Erreur extension", "Recharge la page CoachRx, reconnecte CoachRx, puis lance Tester CoachRx. Ne synchronise pas si le mode API ou les identites ne sont pas valides."],',
  '["Erreur extension", "Recharge la page CoachRx, reconnecte CoachRx, puis relance Valider sans ecrire. N\'importe rien si cette validation echoue."],',
  "guide troubleshooting"
);
fs.writeFileSync(appPath, appSource, "utf8");

const indexPath = path.join(previewSource, "index.html");
let indexSource = fs.readFileSync(indexPath, "utf8");
indexSource = indexSource.replaceAll("20260718-questionnaire-phone-extension-068", appVersion);
assert.equal((indexSource.match(new RegExp(appVersion, "g")) || []).length, 2, "Index cache-busters were not updated exactly twice.");
fs.writeFileSync(indexPath, indexSource, "utf8");

const guidePath = path.join(previewSource, "downloads", "dashboard-coach-guide-equipe.html");
let guideSource = fs.readFileSync(guidePath, "utf8");
guideSource = replaceExactlyOnce(
  guideSource,
  '<li>Dans le Guide, copie l\'URL Apps Script et le secret, puis colle-les dans l\'extension.</li>',
  '<li>Dans le Guide, copie le secret, puis colle-le dans l\'extension. L\'URL Apps Script est geree automatiquement.</li>',
  "print guide configuration"
);
guideSource = replaceExactlyOnce(
  guideSource,
  '<li>Ouvre la page Clients CoachRx du bon coach et clique <strong>Mettre a jour CoachRx</strong>.</li>',
  '<li>Choisis le coach, ouvre sa page Clients avec le bouton de l\'extension, puis clique <strong>Valider sans ecrire</strong>.</li>\n        <li>Verifie le nombre de clients, puis clique <strong>Importer le roster valide dans le dashboard</strong>.</li>',
  "print guide import flow"
);
guideSource = replaceExactlyOnce(
  guideSource,
  '<li>Le nombre de clients recus doit ressembler a CoachRx.</li>',
  '<li>La validation sans ecriture doit reussir et le nombre de clients doit correspondre a CoachRx.</li>',
  "print guide validation check"
);
fs.writeFileSync(guidePath, guideSource, "utf8");

const files = Object.fromEntries(listFiles(previewSource).map((file) => [
  path.relative(previewSource, file).split(path.sep).join("/"),
  sha256(file)
]));
const previewManifest = {
  schemaVersion: 1,
  status: "approved_for_live_distribution",
  baseHostingSnapshot: "2026-07-19T000445Z",
  baseHostingSourceFiles: Object.keys(liveFileHashes).length,
  appVersion,
  extension: {
    version: "0.7.0",
    protocol: "integrated-v1",
    coachScope: "server-configured-active-coaches",
    artifact: artifactName,
    sha256: extensionManifest.artifact.sha256
  },
  intentionalChanges: ["app.js", "index.html", "downloads/dashboard-coach-guide-equipe.html", `downloads/${artifactName}`],
  files
};
fs.writeFileSync(previewManifestPath, `${JSON.stringify(previewManifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  status: previewManifest.status,
  files: Object.keys(files).length,
  appVersion,
  extension: previewManifest.extension
}, null, 2));
