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

    await page.getByRole("button", { name: /Coach Developpement/i }).click();
    await page.locator('[data-question-id="employee_name"]').waitFor({ state: "visible" });
    await page.getByRole("link", { name: /Relire la fiche de poste/i }).waitFor({ timeout: 5000 });
    await page.getByRole("link", { name: /Relire le suivi Fondations/i }).waitFor({ timeout: 5000 });
    await page.getByText("Valeurs CFSB - comportements Coach Developpement").waitFor({ timeout: 5000 });
    await page.getByText("Kilo, CHIP, les politiques").waitFor({ timeout: 5000 });
    await page.getByText("Caroline ou a un autre coach").waitFor({ timeout: 5000 });

    await page.locator('[data-question-id="employee_name"]').fill("Coach Dev Test");
    await page.locator('[data-question-id="employee_email"]').fill("coachdev@example.com");
    await page.locator('[data-question-id="selected_role_confirmation"]').selectOption("Oui");
    await page.locator('[data-question-id="why_joined_and_stays"]').fill("Je veux aider les nouveaux membres a partir du bon pied.");
    await page.locator('[data-question-id="most_aligned_moment"]').fill("Quand une Fondation rend un membre plus confiant.");

    const scoreIds = [
      "coach_dev_bienveillance_first_experience_score",
      "coach_dev_bienveillance_progression_score",
      "coach_dev_professionalism_foundations_admin_score",
      "coach_dev_professionalism_pedagogy_score",
      "coach_dev_professionalism_notes_score",
      "coach_dev_courage_signal_score",
      "coach_dev_courage_services_score",
      "coach_dev_team_handoff_score",
      "coach_dev_team_group_class_score"
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
    await page.locator('[data-question-id="lever_improvement"]').fill("Clarifier le relais avec Caroline.");
    await page.locator('[data-question-id="next_objectives"]').fill("Ameliorer la qualite des notes de Fondations.");
    await page.locator('[name="coach_aspiration_select"][value="path_developpement_to_professionnel"]').check();
    await page.locator('[data-question-id="coach_aspiration_why"]').fill("Explorer la suite vers Coach Professionnel.");

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

    console.log("smoke-test-roadmap-coach-dev=ok");
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
