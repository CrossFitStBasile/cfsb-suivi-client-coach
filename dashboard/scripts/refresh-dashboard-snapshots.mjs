import { mkdir, writeFile } from "node:fs/promises";

const DEPLOYMENT_ID = "AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ";
const API_URL = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;
const OUT_DIR = new URL("../data/", import.meta.url);

const COACHES = [
  { coach: "Marc-Andre Menard", slug: "marc-andre-menard" },
  { coach: "Iheb Yahyaoui", slug: "iheb-yahyaoui" }
];

await mkdir(OUT_DIR, { recursive: true });

const generatedAt = new Date().toISOString();
const index = {
  generatedAt,
  defaultCoach: COACHES[0].coach,
  source: "Apps Script snapshot generated for GitHub Pages",
  coaches: COACHES.map((coach) => ({
    coach: coach.coach,
    slug: coach.slug,
    path: `./data/${coach.slug}.json`
  }))
};

for (const coach of COACHES) {
  const result = await fetchCoach(coach.coach);
  result.snapshot = {
    generatedAt,
    source: "GitHub Pages static snapshot",
    refreshMode: "Apps Script fetched outside browser"
  };
  await writeJson(new URL(`${coach.slug}.json`, OUT_DIR), result);
}

await writeJson(new URL("index.json", OUT_DIR), index);

async function fetchCoach(coach) {
  const url = new URL(API_URL);
  url.searchParams.set("authuser", "0");
  url.searchParams.set("api", "coach-app");
  url.searchParams.set("action", "rebuild");
  url.searchParams.set("coach", coach);
  url.searchParams.set("callback", "cb");
  url.searchParams.set("v", Date.now().toString());

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Backend ${response.status} for ${coach}`);
  const text = await response.text();
  const payload = parseJsonp(text);
  if (!payload.ok) throw new Error(payload.error || `Backend error for ${coach}`);
  return payload.result;
}

function parseJsonp(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("cb(") || !trimmed.endsWith(");")) {
    throw new Error(`Unexpected backend response: ${trimmed.slice(0, 120)}`);
  }
  return JSON.parse(trimmed.slice(3, -2));
}

async function writeJson(url, value) {
  await writeFile(url, JSON.stringify(value, null, 2) + "\n", "utf8");
}
