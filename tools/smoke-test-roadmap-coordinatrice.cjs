const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");

const rootDir = path.resolve(__dirname, "../roadmap");

async function ensureLocalServer() {
  try {
    const response = await fetch("http://127.0.0.1:8765/web/index.html");
    if (response.ok) return null;
  } catch (error) {
    // Start a temporary server below.
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1:8765");
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "web/index.html";
    const filePath = path.resolve(rootDir, relativePath);
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
    response.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve) => server.listen(8765, "127.0.0.1", resolve));
  return server;
}

async function run() {
  const server = await ensureLocalServer();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 920 } });

    await page.goto("http://127.0.0.1:8765/web/index.html", { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await page.getByRole("button", { name: /Coordinatrice du centre/i }).click();
    await page.locator('[data-question-id="employee_name"]').waitFor({ state: "visible" });
    await page.getByText("Valeurs CFSB - comportements Coordinatrice du centre").waitFor({ timeout: 5000 });
    await page.getByText("Operations et experience centre").waitFor({ timeout: 5000 });
    await page.getByText("Parcours membre, Fondations et CSM").waitFor({ timeout: 5000 });
    await page.getByText("Ventes, conversion et experience prospect").waitFor({ timeout: 5000 });
    await page.getByText("Systemes, donnees et communication direction").waitFor({ timeout: 5000 });
    await page.locator("label", { hasText: "Je garde une vue claire des nouveaux membres" }).waitFor({ timeout: 5000 });

    await page.locator('[data-question-id="employee_name"]').fill("Coordination Test");
    await page.locator('[data-question-id="employee_email"]').fill("coordination@example.com");
    await page.locator('[data-question-id="selected_role_confirmation"]').selectOption("Oui");
    await page.locator('[data-question-id="why_joined_and_stays"]').fill("Je veux rendre le centre plus fluide et humain.");
    await page.locator('[data-question-id="most_aligned_moment"]').fill("Quand un membre est bien pris en charge du premier contact au suivi.");

    const scoreIds = [
      "coord_ops_daily_flow_score",
      "coord_member_welcome_score",
      "coord_frontdesk_ownership_score",
      "coord_issue_detection_score",
      "coord_prioritization_score",
      "coord_foundations_tracking_score",
      "coord_coach_relay_score",
      "coord_retention_followup_score",
      "coord_checkup_execution_score",
      "coord_member_context_notes_score",
      "coord_lead_response_score",
      "coord_needs_discovery_score",
      "coord_offer_clarity_score",
      "coord_sales_followthrough_score",
      "coord_sales_handoff_score",
      "coord_systems_accuracy_score",
      "coord_reporting_signals_score",
      "coord_process_improvement_score",
      "coord_confidentiality_judgment_score",
      "coord_team_communication_score"
    ];
    for (const scoreId of scoreIds) {
      await page.locator(`[name="${scoreId}"][value="3"]`).check();
    }

    await page.locator('[data-question-id="gwc_gets_it"]').selectOption("Oui");
    await page.locator('[data-question-id="gwc_wants_it"]').selectOption("Oui");
    await page.locator('[data-question-id="gwc_capacity"]').selectOption("Oui");
    await page.locator('[data-question-id="lever_mentorship"]').selectOption("Adequat");
    await page.locator('[data-question-id="lever_team"]').selectOption("Adequat");
    await page.locator('[data-question-id="lever_systems"]').selectOption("Adequat");
    await page.locator('[data-question-id="lever_priority"]').selectOption("Systemes");
    await page.locator('[data-question-id="lever_improvement"]').fill("Clarifier les priorites CSM et ventes.");
    await page.locator('[data-question-id="next_objectives"]').fill("Rendre les suivis membres plus visibles et plus constants.");

    await page.getByRole("button", { name: "Soumettre" }).click();
    try {
      await page.getByText(/Soumission conservee localement/i).waitFor({ timeout: 5000 });
    } catch (error) {
      const invalid = await page.evaluate(() => {
        return [...document.querySelectorAll(":invalid")].map((el) => ({
          id: el.dataset.questionId || el.name || el.id,
          value: el.value
        }));
      });
      throw new Error(`Submission did not complete. Invalid fields: ${JSON.stringify(invalid)}`);
    }

    console.log("smoke-test-roadmap-coordinatrice=ok");
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
