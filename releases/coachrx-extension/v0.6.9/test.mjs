import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const manifest = JSON.parse(fs.readFileSync(new URL("./source/manifest.json", import.meta.url), "utf8"));
assert.equal(manifest.version, "0.6.9");

const popupPath = new URL("./source/popup.js", import.meta.url);
const source = fs.readFileSync(popupPath, "utf8");
assert.match(source, /const EXTENSION_VERSION = "0\.6\.9";/);
assert.match(source, /const ENDPOINT_ROUTE_RELEASE = "20260718-v75";/);

const functionStart = source.indexOf("async function fetchCoachRxRawDataInMainWorld");
const functionEnd = source.indexOf("\nasync function extractCoachRxAdvancedScanFromActiveTab", functionStart);
assert.notEqual(functionStart, -1, "The extraction function must exist.");
assert.notEqual(functionEnd, -1, "The extraction function boundary must be detectable.");

const functionSource = source.slice(functionStart, functionEnd);

function client(index, state) {
  return { id: `client-${index}`, name: `Client Test ${index}`, state };
}

async function runExtraction({ activeCount, archivedCount, displayedActive, displayedArchived, extraStates = [] }) {
  const clients = [
    ...Array.from({ length: activeCount }, (_, index) => client(index + 1, "active")),
    ...Array.from({ length: archivedCount }, (_, index) => client(activeCount + index + 1, "archived")),
    ...extraStates.map((state, index) => client(activeCount + archivedCount + index + 1, state))
  ];
  const bodyText = [
    String(displayedActive),
    "TOTAL CLIENTS",
    "65%",
    "COMPLIANCE",
    `Active ${displayedActive}`,
    `Archived ${displayedArchived}`
  ].join("\n");
  const elementTexts = [
    `${displayedActive}\nTOTAL CLIENTS`,
    "65%\nCOMPLIANCE",
    `Active\n${displayedActive}`,
    `Archived\n${displayedArchived}`
  ];
  let requestHeaders = null;
  const sandbox = {
    window: {
      location: { href: "https://dashboard.coachrx.app/team/15935/clients" },
      localStorage: { getItem: (key) => key === "token" ? "synthetic-session-token" : null }
    },
    document: {
      body: { innerText: bodyText },
      querySelectorAll: () => elementTexts.map((innerText) => ({ innerText, textContent: innerText }))
    },
    fetch: async () => {
      requestHeaders = { Authorization: "Bearer synthetic-session-token" };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ clients })
      };
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${functionSource}\nglobalThis.extract = fetchCoachRxRawDataInMainWorld;`, sandbox);
  const result = await sandbox.extract("15935");
  return { result, requestHeaders };
}

const valid = await runExtraction({ activeCount: 21, archivedCount: 31, displayedActive: 21, displayedArchived: 31 });
assert.equal(valid.result.ok, true);
assert.equal(valid.result.clients.length, 21);
assert.equal(valid.result.expectedClientCount, 21);
assert.equal(valid.result.archivedClientCount, 31);
assert.equal(valid.result.rawClientCount, 52);
assert.equal(valid.requestHeaders.Authorization, "Bearer synthetic-session-token");
assert.equal(JSON.stringify(valid.result).includes("synthetic-session-token"), false);

const activeMismatch = await runExtraction({ activeCount: 20, archivedCount: 31, displayedActive: 21, displayedArchived: 31 });
assert.equal(activeMismatch.result.ok, false);
assert.match(activeMismatch.result.error, /Extraction active incomplete/);

const archivedMismatch = await runExtraction({ activeCount: 21, archivedCount: 30, displayedActive: 21, displayedArchived: 31 });
assert.equal(archivedMismatch.result.ok, false);
assert.match(archivedMismatch.result.error, /Extraction archivee incomplete/);

const unknownState = await runExtraction({
  activeCount: 21,
  archivedCount: 30,
  displayedActive: 21,
  displayedArchived: 31,
  extraStates: [""]
});
assert.equal(unknownState.result.ok, false);
assert.match(unknownState.result.error, /Etat CoachRx non reconnu/);

console.log("OK: CoachRx extension 0.6.9 provenance and 4 extraction scenarios verified.");
