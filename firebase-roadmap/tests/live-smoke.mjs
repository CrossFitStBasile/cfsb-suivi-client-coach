const baseUrl = (process.env.ROADMAP_LIVE_URL || "https://cfsb-roadmap-trimestrielle.web.app").replace(/\/$/, "");

const checks = [
  ["/", ["Dashboard Equipe CFSB", "./app.js"]],
  ["/app.js", ["renderActivityView", "teamMeetings", "teamMemberPrivate", "renderMeetingEditor"]],
  ["/workflow.js", ["entityVersionToken", "hasVersionConflict"]],
  ["/styles.css", [".activity-list", ".meeting-editor", "[hidden]"]],
  ["/revenue.html", ["Projection de revenus", "scenarioMemberSelect", "./revenue.js"]],
  ["/revenue.js", ["REVENUE_MODEL_VERSION", "saveScenario", "revenueScenarios"]],
  ["/revenue.css", [".scenario-panel", ".revenue-table", ".revenue-metrics"]]
];

for (const [path, markers] of checks) {
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const body = await response.text();
  for (const marker of markers) {
    if (!body.includes(marker)) throw new Error(`${path} is missing ${marker}`);
  }
  console.log(`OK ${path} (${body.length} bytes)`);
}

console.log(`Roadmap live smoke test passed: ${baseUrl}`);
