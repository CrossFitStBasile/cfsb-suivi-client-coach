#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const repoRoot = path.resolve(__dirname, "..");
const bobRoot = path.resolve("C:/Users/micha/Documents/Codex/Bob Operator/bob-operator");
const bobConfigDir = path.join(bobRoot, "config");
const bobGeneratedDir = path.join(bobRoot, "generated");
const tokenPath = path.join(bobConfigDir, "token.json");
const oauthClientPath = path.join(bobConfigDir, "oauth-client.json");

const sources = [
  {
    key: "coach_dashboard_legacy",
    label: "Ancien dashboard coach / sync historique",
    scriptId: "1SeGMN1w7iqn_7ETcmg5qwY6wIys4GZy5GbJHWasg6bToThcxrucYfOLk",
    expected: ["coachrx", "dashboard", "client", "task"]
  },
  {
    key: "csm_main",
    label: "CSM et metriques - script principal",
    scriptId: "1pQ9ecmaVvulUauVMqNKNqQMDX0CDhOaQuolCIm4U_7n87hrMuuklxyLB",
    expected: ["client", "checkup", "membership", "phone"]
  },
  {
    key: "csm_bound_menu",
    label: "CSM et metriques - menu lie au Sheet",
    scriptId: "1upjaGrsWIxwsVz_Ht--CjNNeo3zC4uSlAfdRgMCdevwog1FV7Q-_MbIL",
    expected: ["client", "checkup", "membership", "phone"]
  },
  {
    key: "questionnaire_endpoint",
    label: "Questionnaire client-coach V2",
    scriptId: "1RzTyLvUdw6NdVI2vsDoi7a2bjWGAZDXml94QYG4TCs9wF5KJdKm3HFBa",
    expected: ["questionnaire", "response", "triage", "phone"]
  },
  {
    key: "rebooking_legacy",
    label: "App rebooking semi-prives",
    scriptId: "1OsXzGrmJacMYHMIEcTM3dTK-UvaA01bDf0F90HkFNt29XYgK2iHkyBlE",
    expected: ["rebooking", "vacances", "historique", "annulation"]
  },
  {
    key: "kilo_metrics",
    label: "Kilo metrics",
    scriptId: "1GlRrhkGoMkgRfsybh0WUILva6ARfHKMfmmHSehEvmwH5rg3jtgn26lAO",
    expected: ["kilo", "staff", "membership", "churn"]
  }
];

const patterns = {
  coachRx: /coach\s*rx|coachrx|team\/\d+\/clients|dashboard\.coachrx/i,
  ghl: /gohighlevel|leadconnector|gymleadmachine|GHL|dashboardcoach/i,
  firestore: /firestore|googleapis\.com\/v1\/projects|datastore/i,
  sheet: /SpreadsheetApp|spreadsheets|Sheet/i,
  webApp: /doGet|doPost|HtmlService|ContentService/i,
  triggers: /ScriptApp\.newTrigger|timeBased|install.*Trigger/i,
  questionnaire: /questionnaire|triage|response_id|client_phone_normalized/i,
  rebooking: /rebook|rebooking|annulation|vacances|absence coach|rdv/i,
  checkups: /check.?up|checkup|suivi/i,
  phone: /phone|telephone|t[eé]l[eé]phone|normalized/i,
  membership: /membership|abonnement|package|recurrence|r[eé]currence/i,
  dashboardQueue: /queueDashboardSourceImport_|syncRequests|requestType:\s*["']source_import/i
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fsp.mkdir(bobGeneratedDir, { recursive: true });

  const backup = {
    generatedAt: new Date().toISOString(),
    note: "Backup local prive. Ne pas publier: contient le code source Apps Script.",
    sources: []
  };
  const summary = {
    generatedAt: backup.generatedAt,
    note: "Resume sans code source et sans secret. Utilisable pour cartographier les connecteurs Dashboard Coach.",
    sources: []
  };

  for (const source of sources) {
    try {
      const project = await appsScriptApi(`projects/${source.scriptId}/content`);
      backup.sources.push({
        key: source.key,
        label: source.label,
        scriptId: source.scriptId,
        fetchedAt: new Date().toISOString(),
        files: (project.files || []).map((file) => ({
          name: file.name,
          type: file.type,
          source: file.source || ""
        }))
      });
      summary.sources.push(summarizeProject(source, project));
    } catch (error) {
      summary.sources.push({
        key: source.key,
        label: source.label,
        scriptId: source.scriptId,
        fetchOk: false,
        error: sanitizeError(error.message)
      });
    }
  }

  const backupPath = path.join(bobGeneratedDir, `dashboard-source-appscript-backup-${stamp}.json`);
  await fsp.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");

  const reportPath = path.join(repoRoot, "firebase-dashboard", "SOURCE_CONNECTION_AUDIT.md");
  await fsp.writeFile(reportPath, renderMarkdown(summary, backupPath), "utf8");

  const jsonSummaryPath = path.join(repoRoot, "firebase-dashboard", "SOURCE_CONNECTION_AUDIT.json");
  await fsp.writeFile(jsonSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ backupPath, reportPath, jsonSummaryPath, summary }, null, 2));
}

function summarizeProject(source, project) {
  const files = project.files || [];
  const codeFiles = files.filter((file) => file.type === "SERVER_JS" || file.type === "HTML");
  const joinedSource = codeFiles.map((file) => file.source || "").join("\n\n");
  const manifest = files.find((file) => file.name === "appsscript" && file.type === "JSON");
  const manifestJson = parseJsonSafe(manifest && manifest.source);
  const functions = Array.from(new Set([...joinedSource.matchAll(/\bfunction\s+([A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]))).sort();
  const flags = Object.fromEntries(
    Object.entries(patterns).map(([key, regex]) => [key, regex.test(joinedSource)])
  );
  const suspectedSourceTypes = inferSourceTypes(flags, joinedSource);
  const missingExpectedSignals = source.expected.filter((signal) => !new RegExp(signal, "i").test(joinedSource));

  return {
    key: source.key,
    label: source.label,
    scriptId: source.scriptId,
    fetchOk: true,
    fileCount: files.length,
    codeFileCount: codeFiles.length,
    codeHash: crypto.createHash("sha256").update(joinedSource).digest("hex"),
    files: files.map((file) => ({
      name: file.name,
      type: file.type,
      length: (file.source || "").length
    })),
    functionCount: functions.length,
    functions: functions.slice(0, 80),
    flags,
    suspectedSourceTypes,
    hasRequiredFirestoreScope: Boolean((manifestJson.oauthScopes || []).includes("https://www.googleapis.com/auth/datastore")),
    manifestScopes: Array.isArray(manifestJson.oauthScopes) ? manifestJson.oauthScopes : [],
    missingExpectedSignals,
    activationReadiness: inferActivationReadiness(flags, manifestJson, joinedSource)
  };
}

function inferSourceTypes(flags, source) {
  const types = [];
  if (flags.coachRx) types.push("coachrx_clients");
  if (flags.phone || flags.membership) types.push("client_directory");
  if (flags.ghl) types.push("ghl_contacts");
  if (flags.questionnaire) types.push("questionnaire_responses");
  if (flags.checkups) types.push("checkups");
  if (flags.rebooking) types.push("rebooking");
  if (/impact|revenue|nouveau client|new client/i.test(source)) types.push("performance_impacts");
  return Array.from(new Set(types));
}

function inferActivationReadiness(flags, manifestJson, source) {
  const hasDatastoreScope = Boolean((manifestJson.oauthScopes || []).includes("https://www.googleapis.com/auth/datastore"));
  if (flags.dashboardQueue && hasDatastoreScope) return "already_has_firestore_queue";
  if (flags.sheet || flags.webApp || flags.coachRx || flags.questionnaire || flags.rebooking || flags.checkups) {
    return hasDatastoreScope ? "ready_for_queue_adapter" : "needs_firestore_scope_and_queue_adapter";
  }
  if (/UrlFetchApp/i.test(source)) return "possible_bridge_point_needs_manual_review";
  return "manual_review_required";
}

function renderMarkdown(summary, backupPath) {
  const lines = [];
  lines.push("# Audit des connexions sources du Dashboard Coach");
  lines.push("");
  lines.push(`Derniere generation: ${summary.generatedAt}`);
  lines.push("");
  lines.push("Ce fichier ne contient pas de code source ni de secret. Le backup complet est conserve localement dans Bob Operator:");
  lines.push("");
  lines.push(`- ${backupPath}`);
  lines.push("");
  lines.push("## Resume executif");
  lines.push("");
  lines.push("| Source | Lecture | Types detectes | Firestore queue | Portee datastore | Action suivante |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const source of summary.sources) {
    const types = (source.suspectedSourceTypes || []).join(", ") || "-";
    const queue = source.flags && source.flags.dashboardQueue ? "oui" : "non";
    const scope = source.hasRequiredFirestoreScope ? "oui" : "non";
    const next = source.fetchOk ? source.activationReadiness : source.error;
    lines.push(`| ${source.label} | ${source.fetchOk ? "ok" : "echec"} | ${types} | ${queue} | ${scope} | ${next} |`);
  }
  lines.push("");
  lines.push("## Details par source");
  for (const source of summary.sources) {
    lines.push("");
    lines.push(`### ${source.label}`);
    lines.push("");
    lines.push(`- Script ID: \`${source.scriptId}\``);
    lines.push(`- Lecture: ${source.fetchOk ? "ok" : "echec"}`);
    if (!source.fetchOk) {
      lines.push(`- Erreur: ${source.error}`);
      continue;
    }
    lines.push(`- Fichiers: ${source.fileCount}`);
    lines.push(`- Fonctions detectees: ${source.functionCount}`);
    lines.push(`- Types probables: ${(source.suspectedSourceTypes || []).join(", ") || "-"}`);
    lines.push(`- Pret pour queue Firestore: ${source.activationReadiness}`);
    lines.push(`- Scope Firestore/datastore: ${source.hasRequiredFirestoreScope ? "present" : "absent"}`);
    lines.push(`- Signaux manquants attendus: ${(source.missingExpectedSignals || []).join(", ") || "aucun"}`);
    lines.push("- Signaux techniques:");
    for (const [key, value] of Object.entries(source.flags || {})) {
      lines.push(`  - ${key}: ${value ? "oui" : "non"}`);
    }
    lines.push("- Fonctions principales detectees:");
    for (const fn of (source.functions || []).slice(0, 30)) {
      lines.push(`  - \`${fn}\``);
    }
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- `already_has_firestore_queue`: le script contient deja le pont direct vers `syncRequests`.");
  lines.push("- `ready_for_queue_adapter`: le script possede deja la portee Firestore et peut recevoir l'adaptateur sans changer la source de donnees.");
  lines.push("- `needs_firestore_scope_and_queue_adapter`: il faut ajouter la portee `https://www.googleapis.com/auth/datastore` et l'adaptateur queue avant d'activer un push Firestore.");
  lines.push("- `manual_review_required`: il faut lire le code source local prive avant de choisir le point d'integration.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function appsScriptApi(pathname, options = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://script.googleapis.com/v1/${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function getAccessToken() {
  if (!fs.existsSync(tokenPath)) throw new Error("Bob Operator token.json introuvable.");
  const token = await readJson(tokenPath);
  const expiresAt = (token.created_at || 0) + (token.expires_in || 0) * 1000 - 60_000;
  if (token.access_token && Date.now() < expiresAt) return token.access_token;
  if (!token.refresh_token) throw new Error("Le jeton Bob n'a pas de refresh_token.");

  const client = await readOAuthClient();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token"
    })
  });
  const refreshed = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(refreshed)}`);
  const nextToken = { ...token, ...refreshed, refresh_token: token.refresh_token, created_at: Date.now() };
  await fsp.writeFile(tokenPath, `${JSON.stringify(nextToken, null, 2)}\n`, "utf8");
  return nextToken.access_token;
}

async function readOAuthClient() {
  if (!fs.existsSync(oauthClientPath)) throw new Error("Bob Operator oauth-client.json introuvable.");
  const raw = await readJson(oauthClientPath);
  const client = raw.installed || raw.web || raw;
  if (!client.client_id || !client.client_secret) {
    throw new Error("oauth-client.json doit contenir client_id et client_secret.");
  }
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function parseJsonSafe(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sanitizeError(message) {
  return String(message || "").replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-token]");
}
