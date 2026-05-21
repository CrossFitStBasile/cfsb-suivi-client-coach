import { mkdir, rm, writeFile } from "node:fs/promises";

const OUT_DIR = new URL("../data/", import.meta.url);
await mkdir(OUT_DIR, { recursive: true });

const generatedAt = new Date().toISOString();
const index = {
  generatedAt,
  source: "Public snapshots disabled",
  publicDataDisabled: true,
  reason: "Client data must not be published through GitHub Pages.",
  coaches: []
};

await rm(new URL("marc-andre-menard.json", OUT_DIR), { force: true });
await rm(new URL("iheb-yahyaoui.json", OUT_DIR), { force: true });

await writeJson(new URL("index.json", OUT_DIR), index);
console.log("Public dashboard snapshots are disabled. Wrote safe index only.");

async function writeJson(url, value) {
  await writeFile(url, JSON.stringify(value, null, 2) + "\n", "utf8");
}
