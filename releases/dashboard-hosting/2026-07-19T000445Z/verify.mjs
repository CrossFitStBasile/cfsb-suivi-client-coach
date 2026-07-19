import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(root, "source");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const hashLines = fs.readFileSync(path.join(root, "files.sha256"), "utf8").trim().split(/\r?\n/);

assert.equal(hashLines.length, manifest.files.count);

for (const line of hashLines) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/);
  assert.ok(match, `Invalid hash line: ${line}`);
  const [, expected, relative] = match;
  const file = path.join(sourceRoot, ...relative.split("/"));
  assert.equal(fs.existsSync(file), true, `Missing snapshot file: ${relative}`);
  const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  assert.equal(actual, expected, `Hash mismatch: ${relative}`);
}

const firebaseHash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(path.join(root, "firebase.json")))
  .digest("hex")
  .toUpperCase();
assert.equal(firebaseHash, manifest.keyHashes["firebase.json"]);

const live069 = path.join(sourceRoot, "downloads", "coachrx-sync-extension-0.6.9-live.zip");
assert.equal(fs.existsSync(live069), false, "The 0.6.9 package must not appear in the live Hosting snapshot.");

console.log(`OK: ${hashLines.length} Hosting files match the provenance manifest.`);
