import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ENDPOINT_URL =
  "https://script.google.com/macros/s/AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA/exec";
const DEFAULT_PROJECT = "roadmap-trimestrielle-cfsb";

const endpointUrl = process.env.ROADMAP_ENDPOINT_URL || DEFAULT_ENDPOINT_URL;
const project = process.env.ROADMAP_PROJECT || DEFAULT_PROJECT;
const outputPath = path.resolve(process.env.ROADMAP_CACHE_PATH || "roadmap/data/roadmap-submissions-cache.json");
const limit = process.env.ROADMAP_SYNC_LIMIT || "500";
const allowEmptySnapshot = process.env.ROADMAP_ALLOW_EMPTY_SNAPSHOT === "true";

function endpointWithParams() {
  const url = new URL(endpointUrl);
  url.searchParams.set("action", "list_roadmap_submissions");
  url.searchParams.set("project", project);
  url.searchParams.set("limit", limit);
  return url;
}

async function readExistingSnapshot() {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function validatePayload(payload, existingSnapshot) {
  if (!payload || typeof payload !== "object") throw new Error("Apps Script returned an invalid payload.");
  if (!payload.ok) throw new Error(payload.error || "Apps Script returned ok=false.");
  if (payload.project !== project) throw new Error(`Unexpected project: ${payload.project || "(empty)"}.`);
  if (!Array.isArray(payload.submissions)) throw new Error("Apps Script payload is missing submissions[].");

  const existingCount = Array.isArray(existingSnapshot?.submissions) ? existingSnapshot.submissions.length : 0;
  if (!allowEmptySnapshot && payload.submissions.length === 0 && existingCount > 0) {
    throw new Error("Apps Script returned zero active submissions; refusing to overwrite a non-empty cache.");
  }

  payload.submissions.forEach((submission, index) => {
    const id = submission?.serverSubmissionId || submission?.id;
    if (!id) throw new Error(`Submission #${index + 1} is missing an id.`);
    if (!submission.answers || typeof submission.answers !== "object") {
      throw new Error(`Submission ${id} is missing answers.`);
    }
  });
}

function buildSnapshot(payload) {
  const submissions = [...payload.submissions].sort((a, b) => {
    return String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""));
  });

  return {
    ...payload,
    count: submissions.length,
    submissions,
    snapshot: true,
    snapshotGeneratedAt: new Date().toISOString(),
    sourceEndpoint: "Apps Script list_roadmap_submissions active only"
  };
}

const existingSnapshot = await readExistingSnapshot();
const response = await fetch(endpointWithParams(), { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}: ${await response.text()}`);

const payload = await response.json();
validatePayload(payload, existingSnapshot);

const snapshot = buildSnapshot(payload);
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

const names = snapshot.submissions.map((submission) => submission.answers.employee_name || "Sans nom");
console.log(JSON.stringify({
  ok: true,
  outputPath,
  count: snapshot.count,
  syncedAt: snapshot.syncedAt,
  snapshotGeneratedAt: snapshot.snapshotGeneratedAt,
  names
}, null, 2));
