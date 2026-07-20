import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildDashboardLiveRebaseCandidate } from "../tools/build-dashboard-live-rebase-candidate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotRoot = path.join(repoRoot, "releases", "dashboard-hosting", "2026-07-19T000445Z");
const liveSourceRoot = path.join(snapshotRoot, "source");
const version = "20260719-phase2-live-rebase-test";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function walk(root, current = root) {
  const files = [];
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return files.sort();
}

async function withTempDirectory(t, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("le candidat part du snapshot live et conserve chaque fichier non cible octet pour octet", async (t) => {
  const temp = await withTempDirectory(t, "cfsb-dashboard-rebase-");
  const outputRoot = path.join(temp, "candidate");
  const result = await buildDashboardLiveRebaseCandidate({ repoRoot, snapshotRoot, outputRoot, candidateVersion: version });
  const candidateSourceRoot = path.join(outputRoot, "source");

  assert.equal(result.manifest.baseSnapshot.appSha256, "6d472dd5be6f80ce5098384d6d62233d440f93485c5dd346f6bda4ad9216f3ba");
  assert.deepEqual(result.manifest.changedLiveFiles, [
    "app.js",
    "index.html",
    "questionnaire/check-in/index.html",
    "questionnaire/evaluation-habitudes-vie/index.html",
    "questionnaire/index.html",
    "questionnaire/questionnaire-form.css",
    "questionnaire/questionnaire-form.js"
  ]);
  assert.deepEqual(result.manifest.newFiles, [
    "client-command-gateway.mjs",
    "questionnaire/questionnaire-access.mjs",
    "questionnaire/questionnaire-submission.mjs"
  ]);

  const liveFiles = await walk(liveSourceRoot);
  assert.equal(liveFiles.length, 76);
  let preserved = 0;
  for (const relative of liveFiles) {
    if (result.manifest.changedLiveFiles.includes(relative)) continue;
    const [liveBytes, candidateBytes] = await Promise.all([
      fs.readFile(path.join(liveSourceRoot, ...relative.split("/"))),
      fs.readFile(path.join(candidateSourceRoot, ...relative.split("/")))
    ]);
    assert.deepEqual(candidateBytes, liveBytes, `Le fichier non cible a change: ${relative}`);
    preserved += 1;
  }
  assert.equal(preserved, 69);
  assert.equal((await walk(candidateSourceRoot)).length, 79);
});

test("le candidat branche le gateway, isole la lecture coach et garde les questionnaires fail-closed sans PII URL", async (t) => {
  const temp = await withTempDirectory(t, "cfsb-dashboard-contract-");
  const outputRoot = path.join(temp, "candidate");
  await buildDashboardLiveRebaseCandidate({ repoRoot, snapshotRoot, outputRoot, candidateVersion: version });

  const app = await fs.readFile(path.join(outputRoot, "source", "app.js"), "utf8");
  assert.match(app, new RegExp(`const APP_VERSION = "${version}"`));
  assert.match(app, /const COACHRX_EXTENSION_VERSION = "0\.6\.8"/);
  assert.match(app, /createClientCommandGateway/);
  assert.match(app, /clientCommandGateway\.createDashboardClient/);
  assert.match(app, /clientCommandGateway\.assignDashboardResponsible/);
  assert.match(app, /dashboardTransferResponsibilityMode/);
  assert.doesNotMatch(app, /responsibilityMode:\s*"manual_override"/);
  const canonicalCollections = [
    "tasks", "clients", "questionnaireResponses", "questionnaireSends",
    "questionnaireSchedules", "rebookings", "checkups", "impacts", "alumni"
  ];
  assert.deepEqual(
    [...app.matchAll(/subscribeCollection\("([^"]+)"/g)].map((match) => match[1]),
    canonicalCollections
  );
  const criteriaStart = app.indexOf("const CANONICAL_COACH_SCOPED_COLLECTIONS");
  const criteriaEnd = app.indexOf("function coachRecordById", criteriaStart);
  const criteriaSource = app.slice(criteriaStart, criteriaEnd);
  const loadCriteria = (admin) => new Function(
    "isInfoAdmin", "state", "uniqueCriteria", "coachRecordById",
    "uniqueClean", "firestoreIdVariants", "coachNameValues",
    `${criteriaSource}\nreturn coachSubscriptionCriteria;`
  )(
    () => admin,
    { profile: { coachId: "15935" } },
    (criteria) => criteria,
    (coachId) => ({ id: coachId, coachRxId: coachId, name: "Coach A" }),
    (values) => [...new Set(values.filter((value) => value !== "" && value !== null && value !== undefined))],
    (value) => [String(value)],
    () => ["Coach A"]
  );
  const coachCriteria = loadCriteria(false);
  const adminCriteria = loadCriteria(true);
  for (const collectionName of canonicalCollections) {
    assert.deepEqual(coachCriteria("15935", collectionName), [
      { field: "dashboardResponsibleCoachId", value: "15935" }
    ]);
    const adminCollectionCriteria = adminCriteria("15935", collectionName);
    assert.equal(adminCollectionCriteria.some((criterion) => criterion.field === "dashboardResponsibleCoachId"), true);
    assert.equal(adminCollectionCriteria.some((criterion) => criterion.field === "coachId" && criterion.optionalLegacy === true), true);
  }
  assert.match(app, /optionalLegacy && permissionDenied/);
  assert.match(app, /function questionnaireUrlForServerToken/);
  assert.doesNotMatch(app, /url\.searchParams\.set\("phone"/);
  assert.doesNotMatch(app, /url\.searchParams\.set\("client_name"/);
  assert.doesNotMatch(app, /url\.searchParams\.set\("client_email"/);
  assert.match(app, /Envoi indisponible dans ce candidat/);
  assert.match(app, /Automatisation indisponible dans ce candidat/);

  const questionnaireForm = await fs.readFile(
    path.join(outputRoot, "source", "questionnaire", "questionnaire-form.js"),
    "utf8"
  );
  assert.match(questionnaireForm, /readQuestionnaireAccessToken/);
  assert.match(questionnaireForm, /submitQuestionnaireWithAcknowledgement/);
  assert.doesNotMatch(questionnaireForm, /no-cors/);
  const unavailablePage = await fs.readFile(
    path.join(outputRoot, "source", "questionnaire", "index.html"),
    "utf8"
  );
  assert.match(unavailablePage, /Aucune réponse ne peut être envoyée/);
});

test("le transfert choisit un mode compatible avec l'etat reel du lien CoachRx", async (t) => {
  const temp = await withTempDirectory(t, "cfsb-dashboard-responsibility-");
  const outputRoot = path.join(temp, "candidate");
  await buildDashboardLiveRebaseCandidate({ repoRoot, snapshotRoot, outputRoot, candidateVersion: version });
  const app = await fs.readFile(path.join(outputRoot, "source", "app.js"), "utf8");
  const start = app.indexOf("function dashboardTransferResponsibilityMode(");
  const end = app.indexOf("async function saveClient(id, data) {", start);
  assert.ok(start >= 0 && end > start, "Helper de mode de responsabilite introuvable.");
  const helperSource = app.slice(start, end);
  const chooseMode = new Function(`${helperSource}\nreturn dashboardTransferResponsibilityMode;`)();

  assert.equal(chooseMode({ coachRxLink: null }, "15937"), "dashboard_only");
  assert.equal(chooseMode({
    coachRxLink: { linkStatus: "candidate", rosterStatus: "active" },
    coachRxOwnerId: "15935"
  }, "15937"), "dashboard_only");
  assert.equal(chooseMode({
    coachRxLink: { linkStatus: "verified", rosterStatus: "not_in_latest_roster" },
    coachRxOwnerId: "15935"
  }, "15937"), "dashboard_only");

  const activeCoachRxClient = {
    coachRxLink: { linkStatus: "verified", rosterStatus: "active" },
    coachRxOwnerId: "15935"
  };
  assert.equal(chooseMode(activeCoachRxClient, "15935"), "follow_coachrx");
  assert.equal(chooseMode(activeCoachRxClient, "15937"), "manual_override");
  assert.equal(chooseMode(activeCoachRxClient, "15937", "manual_override"), "manual_override");
  assert.equal(chooseMode(activeCoachRxClient, "15935", "follow_coachrx"), "follow_coachrx");

  assert.throws(
    () => chooseMode({ coachRxLink: null }, "15937", "manual_override"),
    /doit rester dashboard_only/
  );
  assert.throws(
    () => chooseMode(activeCoachRxClient, "15937", "follow_coachrx"),
    /corresponde au coach CoachRx/
  );
  assert.throws(
    () => chooseMode({ coachRxLink: { linkStatus: "verified", rosterStatus: "active" } }, "15937"),
    /coachRxOwnerId est requis/
  );
});

test("deux generations ont exactement les memes octets source", async (t) => {
  const temp = await withTempDirectory(t, "cfsb-dashboard-determinism-");
  const first = path.join(temp, "first");
  const second = path.join(temp, "second");
  await buildDashboardLiveRebaseCandidate({ repoRoot, snapshotRoot, outputRoot: first, candidateVersion: version });
  await buildDashboardLiveRebaseCandidate({ repoRoot, snapshotRoot, outputRoot: second, candidateVersion: version });
  for (const relative of await walk(path.join(first, "source"))) {
    const [a, b] = await Promise.all([
      fs.readFile(path.join(first, "source", ...relative.split("/"))),
      fs.readFile(path.join(second, "source", ...relative.split("/")))
    ]);
    assert.equal(sha256(a), sha256(b), `Generation non deterministe: ${relative}`);
  }
});

test("une preimage live modifiee est refusee avant de produire un candidat", async (t) => {
  const temp = await withTempDirectory(t, "cfsb-dashboard-preimage-");
  const tamperedSnapshot = path.join(temp, "snapshot");
  const outputRoot = path.join(temp, "candidate");
  await fs.cp(snapshotRoot, tamperedSnapshot, { recursive: true });
  await fs.appendFile(path.join(tamperedSnapshot, "source", "app.js"), "\n// alteration test\n");
  await assert.rejects(
    buildDashboardLiveRebaseCandidate({ repoRoot, snapshotRoot: tamperedSnapshot, outputRoot, candidateVersion: version }),
    /Preimage live inattendue: app\.js/
  );
  await assert.rejects(fs.access(outputRoot), (error) => error?.code === "ENOENT");
});

test("les destinations public, snapshot et preview 0.6.10 sont refusees", async (t) => {
  const destinations = [
    path.join(repoRoot, "firebase-dashboard", "public", "candidate"),
    path.join(snapshotRoot, "candidate"),
    path.join(repoRoot, "releases", "coachrx-extension", "v0.6.10", "candidate"),
    path.join(repoRoot, "tests", "2026-07-19-extension-0610-preview")
  ];
  for (const destination of destinations) {
    await t.test(destination, async () => {
      await assert.rejects(
        buildDashboardLiveRebaseCandidate({ repoRoot, snapshotRoot, outputRoot: destination, candidateVersion: version }),
        /Sortie interdite|preview 0\.6\.10/
      );
    });
  }
});

test("un dossier candidat existant n'est jamais ecrase", async (t) => {
  const temp = await withTempDirectory(t, "cfsb-dashboard-no-overwrite-");
  const outputRoot = path.join(temp, "candidate");
  await fs.mkdir(outputRoot);
  await fs.writeFile(path.join(outputRoot, "preuve.txt"), "a conserver", "utf8");
  await assert.rejects(
    buildDashboardLiveRebaseCandidate({ repoRoot, snapshotRoot, outputRoot, candidateVersion: version }),
    /existe deja/
  );
  assert.equal(await fs.readFile(path.join(outputRoot, "preuve.txt"), "utf8"), "a conserver");
});
