const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

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

    await page.getByRole("button", { name: /Coach Professionnel/i }).click();
    await page.locator('[data-question-id="employee_name"]').waitFor({ state: "visible" });
    await page.getByRole("link", { name: /Relire la fiche de poste/i }).waitFor({ timeout: 5000 });
    await page.getByText("Valeurs CFSB - comportements Coach Professionnel").waitFor({ timeout: 5000 });
    await page.getByText("portefeuille de clients").waitFor({ timeout: 5000 });
    await page.getByText("realite economique").waitFor({ timeout: 5000 });

    await page.locator('[data-question-id="employee_name"]').fill("Coach Pro Test");
    await page.locator('[data-question-id="employee_email"]').fill("coachpro@example.com");
    await page.locator('[data-question-id="selected_role_confirmation"]').selectOption("Oui");
    await page.locator('[data-question-id="why_joined_and_stays"]').fill("Je veux batir une carriere de coach au CFSB.");
    await page.locator('[data-question-id="most_aligned_moment"]').fill("Quand un membre progresse avec un suivi clair.");

    const scoreIds = [
      "coach_pro_bienveillance_relationship_score",
      "coach_pro_bienveillance_memorable_score",
      "coach_pro_professionalism_service_delivery_score",
      "coach_pro_professionalism_results_score",
      "coach_pro_professionalism_admin_score",
      "coach_pro_courage_portfolio_score",
      "coach_pro_courage_sales_score",
      "coach_pro_courage_career_score",
      "coach_pro_team_communication_score",
      "coach_pro_team_development_score"
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
    await page.locator('[data-question-id="lever_priority"]').selectOption("Mentorat");
    await page.locator('[data-question-id="lever_improvement"]').fill("Clarifier les indicateurs hebdomadaires.");
    await page.locator('[data-question-id="next_objectives"]').fill("Structurer mon portefeuille et mes suivis clients.");
    await page.locator('[name="coach_aspiration_select"][value="path_professionnel_to_superstar"]').check();
    await page.locator('[data-question-id="coach_aspiration_why"]').fill("Explorer une niche de specialite.");

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

    console.log("smoke-test-roadmap-coach-pro=ok");
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
