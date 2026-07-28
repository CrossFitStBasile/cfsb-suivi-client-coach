import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(root, "firebase-dashboard", "public");
const firebase = JSON.parse(await readFile(join(root, "firebase.json"), "utf8"));
const durableAppsScriptV23Hash =
  "83ced999450d11391901af1f74b03ce27edf32eaa3894c1ea67b91dbab4828e8";
const durableCoachRxRedirectSources = [
  "/downloads/coachrx-sync-extension-0.6.2-dashboard-signals.zip",
  "/downloads/coachrx-sync-extension-0.6.3-dashboard-signals.zip",
  "/downloads/coachrx-sync-extension-0.6.4-dashboard-signals.zip",
  "/downloads/coachrx-sync-extension-0.6.5-identity-guard.zip",
  "/downloads/coachrx-sync-extension-0.6.6-identity-contact-guard.zip",
  "/downloads/coachrx-sync-extension-0.6.7-route-guard.zip",
  "/downloads/coachrx-sync-extension-0.6.8-main-world-api.zip",
  "/downloads/coachrx-sync-extension-0.6.10-live.zip"
];

const durableLegacyHashes = new Map([
  [
    "questionnaire/index.html",
    "46e22478c85f4eec3696f51a6d314a685201c41158f9ba424c940b1f78f6267b"
  ],
  [
    "questionnaire/check-in/index.html",
    "feff985ae07c4a8e6019f154499f601d5a0716c4fd18932d3d9e321fe962f1ce"
  ],
  [
    "questionnaire/evaluation-habitudes-vie/index.html",
    "951286cca30d0af2396c9c8b17a298ed865a016a9e179eef4f41a42a9ba9f951"
  ],
  [
    "questionnaire/questionnaire-form.js",
    "c42ba1917c96ef43e647fd72597f85ac08310f59b0b9774e40eb70b37147baf1"
  ],
  [
    "questionnaire/questionnaire-submission.js",
    "cd363b7dd3d5b1fe452c21e1d2f53ca838cbe49c2469e226ed09993ca1bc1b4b"
  ]
]);

test("les trois parcours historiques restent fonctionnellement identiques au live durable v23", () => {
  for (const [relativePath, expectedHash] of durableLegacyHashes) {
    const absolutePath = join(publicRoot, ...relativePath.split("/"));
    assert.equal(
      sha256(normalizeLineEndings(readFileSync(absolutePath))),
      expectedHash,
      `${relativePath} ne doit pas être remplacé avant la bascule contrôlée`
    );
  }
  const appsScriptPath = join(root, "apps-script", "auto-009-code.gs");
  assert.ok(
    existsSync(appsScriptPath),
    "la source Apps Script v23 doit rester versionnée"
  );
  assert.equal(
    sha256(normalizeLineEndings(readFileSync(appsScriptPath))),
    durableAppsScriptV23Hash,
    "la source Apps Script v23 doit rester exactement celle du baseline live"
  );
});

test("CoachRx 0.7.0 reste l'unique destination des anciens téléchargements", () => {
  const zipPath = join(
    publicRoot,
    "downloads",
    "coachrx-sync-extension-0.7.0-live.zip"
  );
  assert.equal(
    sha256(readFileSync(zipPath)),
    "6d365bfa818c8a3b793e8a5825638380b4e4b2d0dd0cfd6d9d16a150e11d2326"
  );

  const redirects = firebase.hosting?.redirects || [];
  assert.equal(redirects.length, 8);
  assert.deepEqual(
    redirects.map((redirect) => redirect.source),
    durableCoachRxRedirectSources,
    "aucune source historique CoachRx ne doit être ajoutée, retirée ou substituée"
  );
  for (const redirect of redirects) {
    assert.equal(
      redirect.destination,
      "/downloads/coachrx-sync-extension-0.7.0-live.zip"
    );
    assert.equal(redirect.type, 302);
  }
});

test("les nouvelles routes sont additives et ne capturent pas les URL historiques", () => {
  assert.equal(firebase.hosting?.public, "firebase-dashboard/public");
  assert.deepEqual(
    (firebase.hosting?.rewrites || []).map((rewrite) => rewrite.source),
    ["/api/questionnaires", "/questionnaire/f/**", "**"]
  );
  assert.equal(
    firebase.hosting.rewrites[0]?.function?.functionId,
    "questionnairePublicApi"
  );
  assert.equal(
    firebase.hosting.rewrites[1]?.destination,
    "/questionnaire/f/index.html"
  );
  assert.ok(firebase.functions?.source === "functions");
  assert.ok(firebase.firestore?.rules && firebase.firestore?.indexes);
  assert.ok(firebase.storage?.rules);
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeLineEndings(value) {
  return Buffer.from(value.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
}
