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

const roles = [
  {
    button: /Head Coach/i,
    name: "Head Coach Test",
    email: "headcoach@example.com",
    title: "Valeurs CFSB - comportements Assistant Head Coach",
    checks: ["Cadre du role Assistant Head Coach", "Programmation, standards et intention technique", "Observation, feedback et developpement des coachs"],
    scores: [
      "head_programming_logic_score",
      "head_stimulus_clarity_score",
      "head_standards_documentation_score",
      "head_scaling_framework_score",
      "head_programming_feedback_loop_score",
      "head_observation_cadence_score",
      "head_feedback_quality_score",
      "head_followup_accountability_score",
      "head_onboarding_coaches_score",
      "head_training_moments_score",
      "head_floor_quality_score",
      "head_feedback_culture_score",
      "head_member_safety_score",
      "head_coach_strengths_score",
      "head_member_feedback_signal_score",
      "head_direction_alignment_score",
      "head_team_communication_score",
      "head_conflict_courage_score",
      "head_ownership_development_score",
      "head_system_building_score"
    ],
    full: true
  },
  {
    button: /Entretien menager/i,
    name: "Entretien Test",
    email: "entretien@example.com",
    title: "Valeurs CFSB - comportements Entretien menager",
    checks: ["Qualite, hygiene et details visibles", "Communication, securite et collaboration"],
    scores: [
      "cleaning_space_quality_score",
      "cleaning_bathroom_locker_score",
      "cleaning_equipment_surfaces_score",
      "cleaning_detail_eye_score",
      "cleaning_reliability_schedule_score",
      "cleaning_checklist_autonomy_score",
      "cleaning_time_management_score",
      "cleaning_supplies_ownership_score",
      "cleaning_safety_signal_score",
      "cleaning_team_communication_score",
      "cleaning_respect_space_score",
      "cleaning_improvement_feedback_score"
    ],
    light: true
  },
  {
    button: /Engagement communautaire et evenements/i,
    name: "Engagement Test",
    email: "engagement@example.com",
    title: "Valeurs CFSB - comportements Engagement communautaire et evenements",
    checks: ["Planification et execution des evenements", "Mise en valeur, contenu et histoires membres", "Developpement professionnel et mesure d impact"],
    scores: [
      "event_planning_structure_score",
      "event_communication_score",
      "event_execution_reliability_score",
      "event_followup_learning_score",
      "community_inclusion_score",
      "community_energy_score",
      "community_member_connection_score",
      "community_values_fit_score",
      "community_story_capture_score",
      "community_authentic_content_score",
      "community_privacy_respect_score",
      "community_recognition_consistency_score",
      "event_team_coordination_score",
      "event_direction_alignment_score",
      "event_initiative_ownership_score",
      "event_impact_judgment_score",
      "event_external_inspiration_score",
      "event_impact_metrics_score"
    ],
    full: true
  },
  {
    button: /Administration \/ autre role/i,
    name: "Admin Test",
    email: "admin@example.com",
    title: "Valeurs CFSB - comportements Administration / autre role",
    checks: ["Clarification du role et priorites", "Fiabilite, exactitude et confidentialite"],
    scores: [
      "admin_role_clarity_score",
      "admin_priority_management_score",
      "admin_reliability_score",
      "admin_accuracy_score",
      "admin_confidentiality_score",
      "admin_collaboration_score",
      "admin_problem_signal_score",
      "admin_process_improvement_score"
    ],
    light: true,
    admin: true
  }
];

async function completeRole(page, role) {
  await page.goto("http://127.0.0.1:8765/web/index.html", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: role.button }).click();
  await page.locator('[data-question-id="employee_name"]').waitFor({ state: "visible" });
  await page.getByText(role.title).waitFor({ timeout: 5000 });
  for (const text of role.checks) {
    await page.getByText(text).waitFor({ timeout: 5000 });
  }

  await page.locator('[data-question-id="employee_name"]').fill(role.name);
  await page.locator('[data-question-id="employee_email"]').fill(role.email);
  await page.locator('[data-question-id="selected_role_confirmation"]').selectOption("Oui");

  const why = page.locator('[data-question-id="why_joined_and_stays"]');
  if (await why.count()) await why.fill("Je veux contribuer au projet CFSB.");
  const aligned = page.locator('[data-question-id="most_aligned_moment"]');
  if (await aligned.count()) await aligned.fill("Quand mon travail aide l'equipe et les membres.");
  if (role.admin) {
    await page.locator('[data-question-id="admin_role_description"]').fill("Support administratif, suivis et aide ponctuelle a l'equipe.");
  }

  for (const scoreId of role.scores) {
    await page.locator(`[name="${scoreId}"][value="3"]`).check();
  }

  await page.locator('[data-question-id="gwc_gets_it"]').selectOption("Oui");
  await page.locator('[data-question-id="gwc_wants_it"]').selectOption("Oui");
  await page.locator('[data-question-id="gwc_capacity"]').selectOption("Oui");

  if (role.full) {
    await page.locator('[data-question-id="lever_mentorship"]').selectOption("Adequat");
    await page.locator('[data-question-id="lever_team"]').selectOption("Adequat");
    await page.locator('[data-question-id="lever_systems"]').selectOption("Adequat");
    await page.locator('[data-question-id="lever_priority"]').selectOption("Systemes");
    await page.locator('[data-question-id="lever_improvement"]').fill("Clarifier les priorites du trimestre.");
    await page.locator('[data-question-id="next_objectives"]').fill("Stabiliser mes priorites et livrer mes engagements.");
  } else {
    await page.locator('[data-question-id="lever_support"]').selectOption("Adequat");
    const next = page.locator('[data-question-id="next_objectives"]');
    if (await next.count()) await next.fill("Maintenir le standard attendu.");
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
    throw new Error(`${role.name} did not submit. Invalid fields: ${JSON.stringify(invalid)}`);
  }
}

async function run() {
  const server = await ensureLocalServer();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 920 } });
    await page.goto("http://127.0.0.1:8765/web/index.html", { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());

    for (const role of roles) {
      await completeRole(page, role);
    }

    console.log("smoke-test-roadmap-remaining-roles=ok");
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
