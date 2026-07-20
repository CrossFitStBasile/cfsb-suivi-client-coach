import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const releaseRoot = new URL("./", import.meta.url);
const sourceRoot = new URL("./source/", releaseRoot);
const manifest = readJson(new URL("manifest.json", sourceRoot));
const releaseManifest = readJson(new URL("release-manifest.json", releaseRoot));
const popupPath = new URL("popup.js", sourceRoot);
const popupSource = fs.readFileSync(popupPath, "utf8");
const sealed069Source = fs.readFileSync(new URL("../v0.6.9/source/popup.js", releaseRoot), "utf8");
const artifactPath = new URL("coachrx-sync-extension-0.6.10-live.zip", releaseRoot);
const buildSource = fs.readFileSync(new URL("build.ps1", releaseRoot), "utf8");

const managedWebAppUrl = "https://script.google.com/macros/s/AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ/exec";
const expectedZipEntries = [
  "README.md",
  "coachrx-identity.js",
  "icons/icon-128.png",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "manifest.json",
  "popup.css",
  "popup.html",
  "popup.js"
];

assert.equal(manifest.version, "0.6.10");
assert.equal(releaseManifest.release, "0.6.10");
assert.equal(releaseManifest.status, "candidate_not_yet_approved_for_distribution");
assert.match(popupSource, /const EXTENSION_VERSION = "0\.6\.10";/);
assert.match(popupSource, /const ENDPOINT_ROUTE_RELEASE = "20260719-v79";/);
assert.match(popupSource, new RegExp(`const MANAGED_WEB_APP_URL = "${escapeRegex(managedWebAppUrl)}";`));

const expectedPopupSource = sealed069Source
  .replace('const EXTENSION_VERSION = "0.6.9";', 'const EXTENSION_VERSION = "0.6.10";')
  .replace('const ENDPOINT_ROUTE_RELEASE = "20260718-v75";', 'const ENDPOINT_ROUTE_RELEASE = "20260719-v79";');
assert.equal(
  popupSource,
  expectedPopupSource,
  "The 0.6.10 product code must differ from sealed 0.6.9 only by version and route marker."
);

const functionStart = popupSource.indexOf("async function fetchCoachRxRawDataInMainWorld");
const functionEnd = popupSource.indexOf("\nasync function extractCoachRxAdvancedScanFromActiveTab", functionStart);
assert.notEqual(functionStart, -1, "The extraction function must exist.");
assert.notEqual(functionEnd, -1, "The extraction function boundary must be detectable.");
const extractionFunctionSource = popupSource.slice(functionStart, functionEnd);

const urlHelperStart = popupSource.indexOf("function coachIdFromCoachRxClientsUrl");
const urlHelperEnd = popupSource.indexOf("\nasync function fetchCoachRxRawDataInMainWorld", urlHelperStart);
assert.notEqual(urlHelperStart, -1, "The CoachRx URL guard must exist.");
assert.notEqual(urlHelperEnd, -1, "The CoachRx URL guard boundary must be detectable.");
const urlHelperSource = popupSource.slice(urlHelperStart, urlHelperEnd);
const urlSandbox = {};
vm.createContext(urlSandbox);
vm.runInContext(`${urlHelperSource}\nglobalThis.coachIdFromUrl = coachIdFromCoachRxClientsUrl;`, urlSandbox);
assert.equal(urlSandbox.coachIdFromUrl("https://dashboard.coachrx.app/team/15935/clients"), "15935");
assert.equal(urlSandbox.coachIdFromUrl("https://dashboard.coachrx.app/clients"), "");
assert.equal(urlSandbox.coachIdFromUrl("https://dashboard.coachrx.app/team/15935/programs"), "");

function client(index, state) {
  return { id: `client-${index}`, name: `Client Test ${index}`, state };
}

async function runExtraction({
  activeCount,
  archivedCount,
  displayedActive,
  displayedArchived,
  displayedTotal = displayedActive,
  extraStates = [],
  locationUrl = "https://dashboard.coachrx.app/team/15935/clients",
  expectedCoachId = "15935",
  token = "synthetic-session-token"
}) {
  const clients = [
    ...Array.from({ length: activeCount }, (_, index) => client(index + 1, "active")),
    ...Array.from({ length: archivedCount }, (_, index) => client(activeCount + index + 1, "archived")),
    ...extraStates.map((state, index) => client(activeCount + archivedCount + index + 1, state))
  ];
  const bodyText = [
    String(displayedTotal),
    "TOTAL CLIENTS",
    "65%",
    "COMPLIANCE",
    `Active ${displayedActive}`,
    `Archived ${displayedArchived}`
  ].join("\n");
  const elementTexts = [
    `${displayedTotal}\nTOTAL CLIENTS`,
    "65%\nCOMPLIANCE",
    `Active\n${displayedActive}`,
    `Archived\n${displayedArchived}`
  ];
  let requestPath = "";
  let requestHeaders = null;
  let fetchCalls = 0;
  const sandbox = {
    window: {
      location: { href: locationUrl },
      localStorage: { getItem: (key) => key === "token" ? token : null }
    },
    document: {
      body: { innerText: bodyText },
      querySelectorAll: () => elementTexts.map((innerText) => ({ innerText, textContent: innerText }))
    },
    fetch: async (path, options = {}) => {
      fetchCalls += 1;
      requestPath = path;
      requestHeaders = options.headers || {};
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ clients })
      };
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${extractionFunctionSource}\nglobalThis.extract = fetchCoachRxRawDataInMainWorld;`, sandbox);
  const result = await sandbox.extract(expectedCoachId);
  return { result, requestPath, requestHeaders, fetchCalls };
}

const marcAndre = await runExtraction({
  activeCount: 21,
  archivedCount: 31,
  displayedActive: 21,
  displayedArchived: 31
});
assert.equal(marcAndre.result.ok, true);
assert.equal(marcAndre.result.clients.length, 21);
assert.equal(marcAndre.result.expectedClientCount, 21);
assert.equal(marcAndre.result.archivedClientCount, 31);
assert.equal(marcAndre.result.rawClientCount, 52);
assert.equal(marcAndre.result.countSource, "onglet Active");
assert.equal(marcAndre.requestPath, "/api/v1/coaches/15935/clients.json");
assert.equal(marcAndre.requestHeaders.Authorization, "Bearer synthetic-session-token");
assert.equal(JSON.stringify(marcAndre.result).includes("synthetic-session-token"), false);

const iheb = await runExtraction({
  activeCount: 42,
  archivedCount: 0,
  displayedActive: 42,
  displayedArchived: 0,
  locationUrl: "https://dashboard.coachrx.app/team/15928/clients",
  expectedCoachId: "15928"
});
assert.equal(iheb.result.ok, true);
assert.equal(iheb.result.clients.length, 42);
assert.equal(iheb.result.expectedClientCount, 42);
assert.equal(iheb.result.archivedClientCount, 0);

const mismatchedCoach = await runExtraction({
  activeCount: 21,
  archivedCount: 31,
  displayedActive: 21,
  displayedArchived: 31,
  expectedCoachId: "15928"
});
assert.equal(mismatchedCoach.result.ok, false);
assert.match(mismatchedCoach.result.error, /ne correspond pas au coach selectionne/);
assert.equal(mismatchedCoach.fetchCalls, 0);

const genericUrl = await runExtraction({
  activeCount: 21,
  archivedCount: 31,
  displayedActive: 21,
  displayedArchived: 31,
  locationUrl: "https://dashboard.coachrx.app/clients"
});
assert.equal(genericUrl.result.ok, false);
assert.match(genericUrl.result.error, /ne correspond pas au coach selectionne/);
assert.equal(genericUrl.fetchCalls, 0);

const missingToken = await runExtraction({
  activeCount: 21,
  archivedCount: 31,
  displayedActive: 21,
  displayedArchived: 31,
  token: ""
});
assert.equal(missingToken.result.ok, false);
assert.match(missingToken.result.error, /Session API CoachRx introuvable/);
assert.equal(missingToken.fetchCalls, 0);

const activeMismatch = await runExtraction({
  activeCount: 20,
  archivedCount: 31,
  displayedActive: 21,
  displayedArchived: 31
});
assert.equal(activeMismatch.result.ok, false);
assert.match(activeMismatch.result.error, /Extraction active incomplete/);

const archivedMismatch = await runExtraction({
  activeCount: 21,
  archivedCount: 30,
  displayedActive: 21,
  displayedArchived: 31
});
assert.equal(archivedMismatch.result.ok, false);
assert.match(archivedMismatch.result.error, /Extraction archivee incomplete/);

const counterMismatch = await runExtraction({
  activeCount: 21,
  archivedCount: 31,
  displayedActive: 21,
  displayedArchived: 31,
  displayedTotal: 22
});
assert.equal(counterMismatch.result.ok, false);
assert.match(counterMismatch.result.error, /compteurs actifs CoachRx ne concordent pas/);

const unknownState = await runExtraction({
  activeCount: 21,
  archivedCount: 30,
  displayedActive: 21,
  displayedArchived: 31,
  extraStates: [""]
});
assert.equal(unknownState.result.ok, false);
assert.match(unknownState.result.error, /Etat CoachRx non reconnu/);

assert.equal(fs.existsSync(artifactPath), true, "The deterministic 0.6.10 ZIP must exist.");
const artifactBytes = fs.readFileSync(artifactPath);
const artifactHash = sha256(artifactBytes);
assert.equal(artifactHash, releaseManifest.artifact.sha256);
assert.match(buildSource, new RegExp(`\\$expectedHash = "${artifactHash}"`));
assert.deepEqual(zipEntryNames(artifactBytes).sort(), expectedZipEntries.slice().sort());

const declaredSourceFiles = Object.keys(releaseManifest.source.files).sort();
assert.deepEqual(declaredSourceFiles, expectedZipEntries.slice().sort());
for (const relativePath of declaredSourceFiles) {
  const bytes = fs.readFileSync(new URL(relativePath, sourceRoot));
  assert.equal(sha256(bytes), releaseManifest.source.files[relativePath], `Source hash mismatch: ${relativePath}`);
}
assert.equal(releaseManifest.rollback.publicVersion, "0.6.8");
assert.equal(
  releaseManifest.rollback.publicArtifactSha256,
  "38B2FD295894D76D805D64F07928A043ACF1D142E0052F645637FF6EFD8448A9"
);

console.log("OK: CoachRx extension 0.6.10 candidate, 9 extraction/guard scenarios, exact ZIP root, hashes and sealed-0.6.9 delta verified.");

function readJson(url) {
  return JSON.parse(fs.readFileSync(url, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function zipEntryNames(buffer) {
  const minimumEocdSize = 22;
  const maximumCommentSize = 0xffff;
  let eocdOffset = -1;
  for (
    let offset = buffer.length - minimumEocdSize;
    offset >= Math.max(0, buffer.length - minimumEocdSize - maximumCommentSize);
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  assert.notEqual(eocdOffset, -1, "ZIP end-of-central-directory record not found.");
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const names = [];
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(centralOffset), 0x02014b50, "Invalid ZIP central-directory entry.");
    const nameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const nameStart = centralOffset + 46;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength).replaceAll("\\", "/");
    names.push(name);
    centralOffset = nameStart + nameLength + extraLength + commentLength;
  }
  assert.equal(names.length, entryCount);
  assert.equal(names.every((name) => !name.startsWith("/") && !name.startsWith("source/")), true);
  return names;
}
