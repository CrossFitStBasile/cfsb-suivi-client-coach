#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const backupPath = process.argv[2];
if (!backupPath) {
  console.error("Usage: node tools/analyze-appscript-source-backup.cjs <backup-json>");
  process.exit(1);
}

const focusTerms = {
  coachrx: [/coachrx/i, /buildCoachRx/i, /ImportCoachRx/i, /team\/\d+\/clients/i, /browserRowsForCoach_/i],
  clients: [/buildCoreClientsRows_/i, /buildCoreClientContextRows_/i, /CORE/i, /ManualClients/i, /cleanPhone_/i],
  tasks: [/buildTasksCurrentRows_/i, /buildAutoTodoRows_/i, /applyStoredGeneratedTaskStatuses_/i, /TASKS_Current/i],
  questionnaire: [/buildQuestionnaireInbox_/i, /mirrorResponseToDashboard_/i, /appendResponse_/i, /response_id/i, /triage_status/i],
  ghl: [/addGhlTagToContact_/i, /createGhlContactNote_/i, /findGhlContactByPhone_/i, /dashboardcoach/i],
  rebooking: [/processCancellationForRebookQueue_/i, /markCancellationManaged_/i, /handleCoachReopenAction_/i, /applyAbsenceToOpenCancellations_/i],
  checkups: [/checkup/i, /PriorityCheckup/i, /latestCheckup/i],
  firestoreQueue: [/queueDashboardSourceImport_/i, /syncRequests/i, /source_import/i, /datastore/i]
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

async function main() {
  const raw = await fs.readFile(backupPath, "utf8");
  const backup = JSON.parse(raw);
  const analysis = {
    generatedAt: new Date().toISOString(),
    backupPath,
    sources: backup.sources.map(analyzeSource)
  };
  const repoRoot = path.resolve(__dirname, "..");
  const outputPath = path.join(repoRoot, "firebase-dashboard", "SOURCE_CONNECTION_ANALYSIS.json");
  const mdPath = path.join(repoRoot, "firebase-dashboard", "SOURCE_CONNECTION_ANALYSIS.md");
  await fs.writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, renderMarkdown(analysis), "utf8");
  console.log(JSON.stringify({ outputPath, mdPath, analysis }, null, 2));
}

function analyzeSource(source) {
  const joined = source.files.map((file) => file.source || "").join("\n\n");
  const functions = extractFunctions(joined);
  const focus = {};
  for (const [key, regexes] of Object.entries(focusTerms)) {
    focus[key] = {
      hitCount: regexes.reduce((count, regex) => count + countMatches(joined, regex), 0),
      matchingFunctions: functions
        .filter((fn) => regexes.some((regex) => regex.test(fn.name) || regex.test(fn.body)))
        .map((fn) => fn.name)
        .slice(0, 30)
    };
  }
  return {
    key: source.key,
    label: source.label,
    scriptId: source.scriptId,
    functionCount: functions.length,
    focus,
    recommendedActivation: recommendActivation(source.key, focus),
    safeFirstWriteCandidate: safeFirstWriteCandidate(source.key, focus)
  };
}

function extractFunctions(source) {
  const results = [];
  const regex = /\bfunction\s+([A-Za-z0-9_]+)\s*\(/g;
  let match;
  while ((match = regex.exec(source))) {
    const name = match[1];
    const start = match.index;
    const next = source.slice(regex.lastIndex).search(/\bfunction\s+[A-Za-z0-9_]+\s*\(/);
    const end = next >= 0 ? regex.lastIndex + next : Math.min(source.length, start + 8000);
    results.push({ name, body: source.slice(start, end) });
  }
  return results;
}

function countMatches(source, regex) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const global = new RegExp(regex.source, flags);
  return Array.from(source.matchAll(global)).length;
}

function recommendActivation(key, focus) {
  if (key === "questionnaire_endpoint") {
    return "Ajouter le queue adapter directement apres appendResponse_/mirrorResponseToDashboard_: chaque nouvelle reponse peut alimenter Firestore sans attendre une sync Sheet.";
  }
  if (key === "coach_dashboard_legacy") {
    return "Utiliser comme source de transition CoachRx/clients/tasks, mais isoler la logique de lecture avant de pousser Firestore pour eviter de copier les anciennes taches bruitees.";
  }
  if (key === "csm_bound_menu") {
    return "Activer d'abord comme enrichissement telephone/check-ups/GHL si les fonctions de recherche GHL et check-up sont confirmees.";
  }
  if (key === "rebooking_legacy") {
    return "Garder legacy comme reference; ajouter un miroir Firestore apres les actions gerer/reouvrir/absence, puis comparer les compteurs.";
  }
  if (key === "kilo_metrics") {
    return "Reporter sauf besoin performance; utile pour metrics/churn plus tard.";
  }
  return "Review manuelle avant activation.";
}

function safeFirstWriteCandidate(key, focus) {
  if (key === "questionnaire_endpoint" && focus.questionnaire.hitCount > 0) return true;
  if (key === "csm_bound_menu" && focus.ghl.hitCount > 0 && focus.checkups.hitCount > 0) return true;
  return false;
}

function renderMarkdown(analysis) {
  const lines = [];
  lines.push("# Analyse des points d'integration Apps Script -> Firestore");
  lines.push("");
  lines.push(`Derniere generation: ${analysis.generatedAt}`);
  lines.push("");
  lines.push("Cette analyse ne contient pas de code source. Elle sert a choisir le prochain branchement sans modifier les scripts live.");
  lines.push("");
  lines.push("## Priorites recommandees");
  lines.push("");
  lines.push("1. Questionnaire V2: brancher chaque nouvelle reponse directement vers Firestore, car c'est un flux simple et hautement visible.");
  lines.push("2. CSM / GHL / repertoire client: enrichir les telephones et check-ups pour corriger les clients sans telephone.");
  lines.push("3. CoachRx: isoler les clients/contexte avant de recreer les To-do, parce que l'ancien calcul semble produire du bruit.");
  lines.push("4. Rebooking: garder l'app historique comme source de comparaison, puis mirrorer les actions vers Firestore.");
  lines.push("");
  lines.push("## Sources");
  lines.push("");
  lines.push("| Source | Fonctions | CoachRx | Clients | Taches | Questionnaire | GHL | Rebooking | Checkups | Firestore | Recommandation |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const source of analysis.sources) {
    lines.push(`| ${source.label} | ${source.functionCount} | ${source.focus.coachrx.hitCount} | ${source.focus.clients.hitCount} | ${source.focus.tasks.hitCount} | ${source.focus.questionnaire.hitCount} | ${source.focus.ghl.hitCount} | ${source.focus.rebooking.hitCount} | ${source.focus.checkups.hitCount} | ${source.focus.firestoreQueue.hitCount} | ${source.recommendedActivation} |`);
  }
  lines.push("");
  lines.push("## Fonctions utiles detectees");
  for (const source of analysis.sources) {
    lines.push("");
    lines.push(`### ${source.label}`);
    for (const key of Object.keys(source.focus)) {
      const functions = source.focus[key].matchingFunctions;
      if (!functions.length) continue;
      lines.push(`- ${key}: ${functions.map((name) => `\`${name}\``).join(", ")}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
