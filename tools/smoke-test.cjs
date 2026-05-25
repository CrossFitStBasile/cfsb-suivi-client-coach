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
  await page.getByRole("button", { name: /Coach Communaute/i }).click();
  await page.locator('[data-question-id="employee_name"]').waitFor({ state: "visible" });

  await page.locator('[data-question-id="employee_name"]').fill("Michael Test");
  await page.locator('[data-question-id="employee_email"]').fill("michael@example.com");
  await page.locator('[data-question-id="selected_role_confirmation"]').selectOption("Oui");
  await page.getByText("Projet CFSB actuel").waitFor({ timeout: 5000 });
  await page.getByText("Le CFSB Edge").waitFor({ timeout: 5000 });
  await page.getByRole("link", { name: /Relire Vision & Mission 2025-2026/i }).waitFor({ timeout: 5000 });
  await page.locator('[data-question-id="why_joined_and_stays"]').fill("Je veux tester le systeme.");
  await page.locator('[data-question-id="most_aligned_moment"]').fill("Quand le formulaire s'adapte au role.");
  await page.locator('[name="coach_comm_bienveillance_accueil_score"][value="3"]').check();
  await page.locator('[name="coach_comm_bienveillance_inclusion_score"][value="3"]').check();
  await page.locator('[name="coach_comm_professionalism_preparation_score"][value="3"]').check();
  await page.locator('[name="coach_comm_professionalism_standards_score"][value="3"]').check();
  await page.locator('[name="coach_comm_courage_signal_score"][value="3"]').check();
  await page.locator('[name="coach_comm_courage_feedback_score"][value="3"]').check();
  await page.locator('[name="coach_comm_team_communication_score"][value="3"]').check();
  await page.locator('[name="coach_comm_team_community_score"][value="3"]').check();
  await page.locator('[data-question-id="gwc_gets_it"]').selectOption("Oui");
  await page.locator('[data-question-id="gwc_wants_it"]').selectOption("Oui");
  await page.locator('[data-question-id="gwc_capacity"]').selectOption("Oui");
  await page.getByText("tu evalues le soutien que CFSB").waitFor({ timeout: 5000 });
  await page.locator('[data-question-id="lever_mentorship"]').selectOption("Adequat");
  await page.locator('[data-question-id="lever_team"]').selectOption("Adequat");
  await page.locator('[data-question-id="lever_systems"]').selectOption("Adequat");
  await page.locator('[data-question-id="lever_priority"]').selectOption("Mentorat");
  await page.locator('[data-question-id="lever_improvement"]').fill("Clarifier les attentes de mentorat.");
  await page.locator('[data-question-id="next_objectives"]').fill("Tester le prototype complet.");
  await page.locator('[name="coach_aspiration_select"][value="path_communaute_to_developpement"]').check();
  await page.locator('[data-question-id="coach_aspiration_why"]').fill("Explorer les Fondations.");

  const preSubmitValue = await page.locator('[data-question-id="employee_name"]').inputValue();
  if (preSubmitValue !== "Michael Test") {
    throw new Error(`Smoke test setup failed. employee_name=${preSubmitValue}`);
  }

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

  await page.goto("http://127.0.0.1:8765/web/owners.html", { waitUntil: "networkidle" });
  await page.getByText("Michael Test").waitFor();
  await page.getByRole("button", { name: /Michael Test/i }).click();
  await page.getByText(/Explorer Coach Developpement/i).waitFor();
  await page.locator('[data-owner-field="owner_reviewer"]').selectOption("Gabriel");
  await page.locator('[data-owner-field="owner_priority_topics"]').fill("Clarifier les prochaines etapes.");
  await page.getByRole("button", { name: /Sauvegarder notes/i }).click();
  await page.getByText(/Notes sauvegardees localement/i).waitFor({ timeout: 5000 });

    console.log("smoke-test=ok");
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

run().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
