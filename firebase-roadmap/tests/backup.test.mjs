import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BACKUP_SCHEMA_VERSION,
  OWNER_BACKUP_COLLECTIONS,
  buildOwnerBackup,
  ownerBackupFileName,
  portableBackupValue,
  sha256Hex,
  validateOwnerBackup
} from "../public/backup.js";

test("backup inventory covers every durable owner module", () => {
  for (const collection of [
    "roadmapSubmissions",
    "teamMembers",
    "teamMeetings",
    "developmentPrograms",
    "workingGeniusProfiles",
    "businessStrategy",
    "strategyDecisions",
    "revenueScenarios",
    "auditLogs"
  ]) assert.ok(OWNER_BACKUP_COLLECTIONS.includes(collection), collection);
  assert.equal(new Set(OWNER_BACKUP_COLLECTIONS).size, OWNER_BACKUP_COLLECTIONS.length);
});

test("Firestore-like timestamps and dates become portable ISO strings", () => {
  const value = portableBackupValue({
    date: new Date("2026-07-16T12:00:00Z"),
    timestamp: { seconds: 1784203200, nanoseconds: 0 },
    native: { toDate: () => new Date("2026-07-16T13:00:00Z") }
  });
  assert.equal(value.date, "2026-07-16T12:00:00.000Z");
  assert.equal(value.timestamp, "2026-07-16T12:00:00.000Z");
  assert.equal(value.native, "2026-07-16T13:00:00.000Z");
});

test("backup manifest counts top-level and nested submission events", () => {
  const backup = buildOwnerBackup({
    projectId: "cfsb-roadmap-trimestrielle",
    actor: { uid: "owner", name: "Michael" },
    exportedAt: new Date("2026-07-16T12:00:00Z"),
    collections: { teamMembers: [{ id: "one" }], roadmapSubmissions: [{ id: "submission" }] },
    nested: { roadmapSubmissionEvents: { submission: [{ id: "event" }] } }
  });
  assert.equal(backup.schemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(backup.manifest.totalRecords, 3);
  assert.equal(backup.manifest.nestedCounts.roadmapSubmissionEvents, 1);
  assert.equal(validateOwnerBackup(backup).valid, true);
});

test("checksum and filename are deterministic", async () => {
  assert.equal(await sha256Hex("CFSB"), "3984ec3ffb07ef735f406379309614820dbcbe85f1fe70e8c094c4b172906cb6");
  assert.equal(ownerBackupFileName(new Date("2026-07-16T12:34:56.000Z")), "cfsb-roadmap-backup-2026-07-16T12-34-56-000Z.json");
});

test("owner dashboard exports live collections and nested submission events", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(source, /async function exportOwnerBackup/);
  assert.match(source, /OWNER_BACKUP_COLLECTIONS/);
  assert.match(source, /collection\(db, "roadmapSubmissions", submission\.id, "events"\)/);
  assert.match(source, /integrity: \{ algorithm: "SHA-256", scope: "JSON\.stringify\(payload_without_integrity\)", checksum \}/);
  assert.match(source, /URL\.revokeObjectURL/);
});
