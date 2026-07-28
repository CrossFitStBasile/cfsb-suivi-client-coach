#!/usr/bin/env node

import crypto from "node:crypto";

const baseUrl = process.env.DASHBOARD_LIVE_URL
  || "https://cfsb-dashboard-coach-aa9a4.web.app";
const destination = "/downloads/coachrx-sync-extension-0.7.0-live.zip";
const assets = [
  [
    "/questionnaire/",
    "46e22478c85f4eec3696f51a6d314a685201c41158f9ba424c940b1f78f6267b",
    true
  ],
  [
    "/questionnaire/check-in/",
    "feff985ae07c4a8e6019f154499f601d5a0716c4fd18932d3d9e321fe962f1ce",
    true
  ],
  [
    "/questionnaire/evaluation-habitudes-vie/",
    "951286cca30d0af2396c9c8b17a298ed865a016a9e179eef4f41a42a9ba9f951",
    true
  ],
  [
    "/questionnaire/questionnaire-form.js",
    "c42ba1917c96ef43e647fd72597f85ac08310f59b0b9774e40eb70b37147baf1",
    true
  ],
  [
    "/questionnaire/questionnaire-submission.js",
    "cd363b7dd3d5b1fe452c21e1d2f53ca838cbe49c2469e226ed09993ca1bc1b4b",
    true
  ],
  [
    destination,
    "6d365bfa818c8a3b793e8a5825638380b4e4b2d0dd0cfd6d9d16a150e11d2326",
    false
  ]
];
const redirectSources = [
  "/downloads/coachrx-sync-extension-0.6.2-dashboard-signals.zip",
  "/downloads/coachrx-sync-extension-0.6.3-dashboard-signals.zip",
  "/downloads/coachrx-sync-extension-0.6.4-dashboard-signals.zip",
  "/downloads/coachrx-sync-extension-0.6.5-identity-guard.zip",
  "/downloads/coachrx-sync-extension-0.6.6-identity-contact-guard.zip",
  "/downloads/coachrx-sync-extension-0.6.7-route-guard.zip",
  "/downloads/coachrx-sync-extension-0.6.8-main-world-api.zip",
  "/downloads/coachrx-sync-extension-0.6.10-live.zip"
];

const checks = [];

for (const [pathname, expectedHash, normalizeText] of assets) {
  const response = await fetch(new URL(pathname, baseUrl), {
    redirect: "manual",
    headers: { "Cache-Control": "no-cache" }
  });
  const raw = Buffer.from(await response.arrayBuffer());
  const value = normalizeText
    ? Buffer.from(raw.toString("utf8").replaceAll("\r\n", "\n"), "utf8")
    : raw;
  const actualHash = sha256(value);
  checks.push({
    name: `asset ${pathname}`,
    passed: response.status === 200 && actualHash === expectedHash,
    status: response.status,
    expectedHash,
    actualHash
  });
}

for (const pathname of redirectSources) {
  const response = await fetch(new URL(pathname, baseUrl), {
    redirect: "manual",
    headers: { "Cache-Control": "no-cache" }
  });
  const location = response.headers.get("location") || "";
  let locationPath = location;
  try {
    locationPath = new URL(location, baseUrl).pathname;
  } catch {
    // The failed parse remains visible in the result and fails closed.
  }
  checks.push({
    name: `redirect ${pathname}`,
    passed: response.status === 302 && locationPath === destination,
    status: response.status,
    expectedLocation: destination,
    actualLocation: locationPath
  });
}

const failures = checks.filter((check) => !check.passed);
console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks
}, null, 2));

if (failures.length) process.exit(1);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
