const baseUrl = (process.env.ROADMAP_LIVE_URL || "https://cfsb-roadmap-trimestrielle.web.app").replace(/\/$/, "");

const checks = [
  ["/", ["Dashboard Equipe CFSB", "./app.js"]],
  ["/app.js", ["renderActivityView", "teamMeetings", "teamMemberPrivate", "renderMeetingEditor", "renderPilotageView"]],
  ["/workflow.js", ["entityVersionToken", "hasVersionConflict"]],
  ["/pilotage.js", ["startOfWeekIso", "metricStatus", "pilotageSummary"]],
  ["/styles.css", [".activity-list", ".meeting-editor", ".pilotage-shell", "[hidden]"]],
  ["/revenue.html", ["Projection de revenus", "scenarioMemberSelect", "./revenue.js"]],
  ["/revenue.js", ["REVENUE_MODEL_VERSION", "saveScenario", "revenueScenarios"]],
  ["/revenue.css", [".scenario-panel", ".revenue-table", ".revenue-metrics"]],
  ["/portal", ["Mon parcours CFSB", "./portal.js"]],
  ["/portal.js", ["cfsb-portal-v1", "memberCareerPlans", "memberSharedSummaries"]],
  ["/portal.css", [".portal-shell", ".mandate-layout", ".roadmap-list"]]
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

if (process.env.SKIP_COACH_LIVE === "1") {
  console.log("Coach live smoke test skipped by SKIP_COACH_LIVE=1");
} else {
  const coachBaseUrl = (process.env.COACH_LIVE_URL || "https://cfsb-dashboard-coach-aa9a4.web.app").replace(/\/$/, "");
  const coachChecks = [
    ["/", ["Dashboard Coach", "./app.js"]],
    ["/app.js", ["cfsb-portal-v1", "TEAM_PORTAL_URL", "teamMemberId"]],
    ["/styles.css", [".portal-link", ".side-footer"]]
  ];

  for (const [path, markers] of coachChecks) {
    const response = await fetch(`${coachBaseUrl}${path}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Coach ${path} returned HTTP ${response.status}`);
    const body = await response.text();
    for (const marker of markers) {
      if (!body.includes(marker)) throw new Error(`Coach ${path} is missing ${marker}`);
    }
    console.log(`OK coach ${path} (${body.length} bytes)`);
  }

  console.log(`Coach live smoke test passed: ${coachBaseUrl}`);
}
