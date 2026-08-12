import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.ROADMAP_ARCHIVE_ROOT
  ? path.resolve(process.env.ROADMAP_ARCHIVE_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(repoRoot, relativePath), "utf8");

const archivePage = await read("roadmap/archived.html");
for (const marker of [
  "Cette ancienne Roadmap n’est plus utilisée.",
  "https://cfsb-roadmap-trimestrielle.web.app/portal",
  "https://cfsb-roadmap-trimestrielle.web.app/",
  "https://cfsb-roadmap-trimestrielle.web.app/revenue"
]) {
  assert.ok(archivePage.includes(marker), `Archive page is missing: ${marker}`);
}
assert.ok(!archivePage.includes("<script"), "Archive page must remain script-free.");

for (const relativePath of [
  "roadmap/index.html",
  "roadmap/owners.html",
  "roadmap/web/index.html",
  "roadmap/web/owners.html",
  "roadmap/web/revenue-lab.html"
]) {
  const body = await read(relativePath);
  assert.ok(body.includes("archived.html"), `${relativePath} does not route to the archive notice.`);
  assert.ok(!body.includes("<script"), `${relativePath} still loads executable legacy code.`);
}

for (const relativePath of [
  "roadmap/data/roadmap-submissions-cache.json",
  "roadmap/web/app.js",
  "roadmap/web/owners.js",
  "roadmap/web/revenue-lab.js",
  "roadmap/web/styles.css",
  "firebase-roadmap/public/formulaire.html",
  "firebase-roadmap/public/formulaire.js",
  "firebase-roadmap/public/formulaire.css"
]) {
  await assert.rejects(
    access(path.join(repoRoot, relativePath)),
    undefined,
    `${relativePath} must remain absent from the active branch.`
  );
}

console.log("Roadmap archive smoke test passed.");
