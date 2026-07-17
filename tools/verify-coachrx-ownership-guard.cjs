const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extensionDir = path.join(
  root,
  "firebase-dashboard",
  "public",
  "downloads",
  "coachrx-sync-extension-0.6.4-dashboard-signals"
);
const popupPath = path.join(extensionDir, "popup.js");
const manifestPath = path.join(extensionDir, "manifest.json");
const functionsPath = path.join(root, "functions", "index.js");

const popup = fs.readFileSync(popupPath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const functionsSource = fs.readFileSync(functionsPath, "utf8");

assert.equal(manifest.version, "0.6.4", "La version securisee doit etre 0.6.4.");
assert.match(popup, /if \(!data\.coachId\)/, "Une synchro sans coach URL doit etre refusee.");
assert.match(
  popup,
  /String\(data\.coachId\) !== String\(selectedCoachId\)/,
  "Le coach detecte doit correspondre au coach choisi."
);
assert.match(
  popup,
  /sourcePathMatchesCoach\(data\.sourcePath, data\.sourceMode, coachIdForSync\)/,
  "La provenance API ou visible doit etre validee."
);
assert.match(
  popup,
  /new RegExp\(`\/team\/\$\{escapedCoachId\}\/clients/,
  "La source visible doit etre liee a /team/{coachId}/clients."
);
assert.doesNotMatch(
  popup,
  /const coachIdForSync = data\.coachId \|\| selectedCoachId/,
  "Le coach choisi ne doit jamais remplacer une identite URL absente."
);
assert.doesNotMatch(
  popup,
  /coachId: scan\.coachId \|\| selectedCoachId/,
  "Le scan avance ne doit pas fabriquer un coachId."
);
assert.match(
  popup,
  /normalizeClients\(apiData\.clients \|\| \[\], coachId, apiData\.sourcePath \|\| ""\)/,
  "Chaque ligne API doit heriter de la provenance coach verifiee."
);
assert.match(
  popup,
  /coachId: stringValue\(coachId\)[\s\S]*sourcePath: stringValue\(sourcePath\)/,
  "Les lignes normalisees doivent porter coachId et sourcePath."
);
assert.doesNotMatch(
  popup,
  /const visibleClients = extractVisibleClientsFromPage\(\)/,
  "Le fallback visible generique doit rester desactive."
);
assert.match(
  functionsSource,
  /requireEvidence: sourceType === "coachrx_clients"/,
  "Le backend doit exiger une preuve coach sur chaque ligne CoachRx."
);

console.log("CoachRx ownership guard: 10/10 OK");
