"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  contentHash,
  encodeFields,
  readJsonPrivate,
  sha256,
  writeJsonPrivate
} = require("./client-ownership-repair-lib.cjs");
const { buildReference } = require("./build-client-ownership-reference.cjs");

let passed = 0;
function check(condition, label) {
  if (!condition) throw new Error(`ECHEC: ${label}`);
  passed += 1;
  process.stdout.write(`OK ${passed}: ${label}\n`);
}

function rawClient(id, data) {
  return {
    name: `projects/test/databases/(default)/documents/clients/${id}`,
    fields: encodeFields(data),
    createTime: "2026-07-17T12:00:00.000Z",
    updateTime: "2026-07-17T12:00:00.000Z"
  };
}

function makeBackup(clients) {
  const backup = {
    format: "cfsb-client-ownership-backup/v1",
    verified: true,
    projectId: "cfsb-dashboard-coach-aa9a4",
    database: "(default)",
    generatedAt: "2026-07-17T12:00:00.000Z",
    collectionCounts: { clients: clients.length },
    collectionSha256: { clients: sha256(clients) },
    collections: { clients }
  };
  backup.contentSha256 = contentHash(backup);
  return backup;
}

function makeRoster(rosters) {
  return {
    format: "cfsb-client-ownership-rosters/v1",
    verified: true,
    source: {
      system: "private_test_fixture",
      documentId: "ownership-reference-builder-test",
      generatedAt: "2026-07-17T12:00:00.000Z",
      validatedBy: "automated-fixture",
      validatedAt: "2026-07-17T12:00:00.000Z"
    },
    rosters
  };
}

function throwsMatching(fn, pattern, label) {
  let error = null;
  try { fn(); } catch (caught) { error = caught; }
  check(Boolean(error && pattern.test(error.message)), label);
}

function containsForbiddenClientName(value, forbidden) {
  const serialized = JSON.stringify(value).toLowerCase();
  return forbidden.some((name) => serialized.includes(name.toLowerCase()));
}

function main() {
  const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cfsb-ownership-reference-test-"));
  const clients = [
    rawClient("cross-coach-a", {
      name: "Alpha Unique",
      coachId: "15935",
      source: "coachrx",
      sourceIdentitySystem: "coachrx",
      sourceClientId: "member-101",
      phoneNormalized: "4505550101"
    }),
    rawClient("cross-coach-b", {
      name: "Alpha Unique",
      coachId: "15928",
      source: "coachrx",
      sourceIdentitySystem: "coachrx",
      sourceClientId: "member-101",
      phoneNormalized: "4505550101"
    }),
    rawClient("bridge", {
      name: "Bridge Person",
      coachId: "15928",
      source: "coachrx",
      sourceIdentitySystem: "coachrx",
      sourceClientId: "member-202",
      phoneNormalized: "4505550202"
    }),
    rawClient("historical-bridge", {
      name: "History Bridge",
      coachId: "15928",
      source: "coachrx",
      sourceIdentitySystem: "coachrx",
      sourceClientId: "member-203",
      phoneNormalized: "4505550203"
    }),
    rawClient("homonym-a", {
      name: "Same Person",
      coachId: "15928",
      source: "coachrx",
      sourceIdentitySystem: "coachrx",
      sourceClientId: "member-301",
      phoneNormalized: "4505550301"
    }),
    rawClient("homonym-b", {
      name: "Same Person",
      coachId: "15935",
      source: "coachrx",
      sourceIdentitySystem: "coachrx",
      sourceClientId: "member-302",
      phoneNormalized: "4505550302"
    }),
    rawClient("staff-candidate", {
      name: "Marc Andre Menard",
      coachId: "15928",
      phoneNormalized: "4505550404"
    })
  ];
  const backup = makeBackup(clients);
  const roster = makeRoster([
    {
      ownerCoachId: "15935",
      scope: "complete_active_roster",
      entries: [
        { name: "Alpha Unique", sourceSystem: "coachrx", sourceClientId: "member-101", entityType: "member" },
        { name: "Bridge Person", sourceSystem: "coachrx", sourceClientId: "member-202", entityType: "member" }
      ]
    },
    {
      ownerCoachId: "15928",
      scope: "historical_member_roster",
      entries: [
        { name: "Same Person" },
        { name: "Marc Andre Menard" },
        { name: "History Bridge", sourceSystem: "coachrx", sourceClientId: "external-member-203" }
      ]
    }
  ]);

  const backupPath = path.join(privateRoot, "backup.json");
  const rosterPath = path.join(privateRoot, "roster.json");
  const outputPath = path.join(privateRoot, "reference.json");
  writeJsonPrivate(backupPath, backup);
  writeJsonPrivate(rosterPath, roster);
  const rereadBackup = readJsonPrivate(backupPath);
  const rereadRoster = readJsonPrivate(rosterPath);
  check(rereadBackup.contentSha256 === backup.contentSha256, "les fixtures passent par les lectures/ecritures privees");

  const reference = buildReference({ backup: rereadBackup, rosterSource: rereadRoster, allowNameBridge: true });
  writeJsonPrivate(outputPath, reference);
  const saved = readJsonPrivate(outputPath);
  check(saved.format === "cfsb-client-ownership-reference/v1" && saved.verified === true, "la reference v1 est verifiee");
  check(saved.contentSha256 === contentHash(saved), "le hash de contenu de la reference est valide");
  check(saved.completeRosterCoachIds.length === 1 && saved.completeRosterCoachIds[0] === "15935", "le roster complet produit completeRosterCoachIds");
  const duplicateIdentityEntries = saved.entries.filter((entry) => entry.match?.sourceClientId === "member-101");
  check(duplicateIdentityEntries.length === 1 && duplicateIdentityEntries[0].ownerCoachId === "15935", "les doublons cross-coach de la meme identite sont resolus et dedupliques");
  check(saved.entries.some((entry) => entry.match?.sourceClientId === "member-203"), "le pont de nom exact aboutit a une identite forte namespaced");
  const historicalReport = saved.resolutionReport.rosters[1];
  check(historicalReport.skippedCount === 2
    && historicalReport.skippedByReason.name_bridge_ambiguous_or_weak === 1
    && historicalReport.skippedByReason.staff_name_candidate === 1,
  "les homonymes ambigus et candidats staff sont ignores avec rapport anonymise");
  check(!containsForbiddenClientName(saved, ["Alpha Unique", "Bridge Person", "History Bridge", "Same Person", "Marc Andre Menard"]), "aucun nom de client n'entre dans la reference");
  check(saved.entries.every((entry) => entry.validated === true
    && (entry.match?.phone || (entry.match?.sourceSystem && entry.match?.sourceClientId))
    && !Object.prototype.hasOwnProperty.call(entry, "name")
    && !Object.prototype.hasOwnProperty.call(entry.match || {}, "name")),
  "chaque entry est validee et porte seulement une identite forte");
  check(typeof saved.source.rosterSourceSha256 === "string" && saved.source.rosterSourceSha256.length === 64,
    "la provenance contient le hash du roster source");

  const incomplete = makeRoster([{
    ownerCoachId: "15935",
    scope: "complete_active_roster",
    entries: [{ name: "Missing Person", sourceSystem: "coachrx", sourceClientId: "absent-999" }]
  }]);
  throwsMatching(
    () => buildReference({ backup, rosterSource: incomplete, allowNameBridge: true }),
    /Roster complet 1: couverture 0\/1/,
    "un roster complet incomplet fait echouer la construction"
  );

  const noBridge = makeRoster([{
    ownerCoachId: "15928",
    scope: "historical_member_roster",
    entries: [
      { name: "Alpha Unique", sourceSystem: "coachrx", sourceClientId: "member-101" },
      { name: "Bridge Person" }
    ]
  }]);
  const noBridgeReference = buildReference({ backup, rosterSource: noBridge, allowNameBridge: false });
  check(noBridgeReference.resolutionReport.skippedCount === 1
    && noBridgeReference.resolutionReport.rosters[0].skippedByReason.name_bridge_not_allowed === 1,
  "le pont par nom exige le flag explicite");

  const repoOutput = path.join(__dirname, "forbidden-private-reference.json");
  throwsMatching(
    () => writeJsonPrivate(repoOutput, reference),
    /worktree Git/,
    "un output prive dans le worktree Git est refuse"
  );
  check(!fs.existsSync(repoOutput), "aucun fichier prive n'est cree dans le repo");

  fs.rmSync(privateRoot, { recursive: true, force: true });
  process.stdout.write(`Reference builder: ${passed} controles reussis.\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
