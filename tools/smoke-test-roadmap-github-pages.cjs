const { chromium } = require("playwright");

const baseUrl = "https://crossfitstbasile.github.io/cfsb-suivi-client-coach/roadmap/";
const endpointUrl = "https://script.google.com/macros/s/AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA/exec";
const resumeTestId = "6ee62837-34fb-43d5-a6ff-f1f859d30bdc";

async function run() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 920 } });
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByText("Charte organisationnelle 2026").waitFor({ timeout: 15000 });
    await page.getByText("Michael Grondin").waitFor({ timeout: 15000 });
    await page.getByText("Gabriel Mayer Bedard").waitFor({ timeout: 15000 });
    await page.getByRole("link", { name: /Dashboard owners/i }).count().then((count) => {
      if (count !== 0) throw new Error("Dashboard owners link should not be visible on employee form.");
    });
    await page.getByRole("button", { name: /Coach Communaute/i }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Coach Communaute/i }).click();
    await page.locator('[data-question-id="employee_name"]').waitFor({ state: "visible" });
    await page.getByRole("link", { name: /Relire la fiche de poste/i }).waitFor({ timeout: 15000 });
    await page.getByText("Projet CFSB actuel").waitFor({ timeout: 15000 });
    await page.getByText("Le CFSB Edge").waitFor({ timeout: 15000 });
    await page.getByRole("link", { name: /Relire Vision & Mission 2025-2026/i }).waitFor({ timeout: 15000 });
    await page.getByText("Valeurs CFSB - comportements Coach Communaute").waitFor({ timeout: 15000 });
    await page.getByText("Je salue systematiquement les membres par leur prenom").waitFor({ timeout: 15000 });
    await page.getByText("Dans 1 an, qu'aimerais-tu avoir construit").waitFor({ timeout: 15000 });
    await page.getByText("tu evalues le soutien que CFSB").waitFor({ timeout: 15000 });
    await page.locator('[data-question-id="gwc_gets_it"]').waitFor({ state: "visible", timeout: 15000 });
    await page.locator('[data-question-id="employee_name"]').fill("Smoke Test Brouillon");
    await page.getByText(/Brouillon sauvegarde a/i).waitFor({ timeout: 5000 });
    const storedDraft = await page.evaluate(() => JSON.parse(localStorage.getItem("cfsb-roadmap-draft") || "{}"));
    if (storedDraft.answers?.employee_name !== "Smoke Test Brouillon" || !storedDraft.clientSubmissionId) {
      throw new Error("Autosaved draft is missing expected employee name or clientSubmissionId.");
    }
    await page.getByRole("button", { name: /Coach Developpement/i }).click();
    await page.getByRole("link", { name: /Relire le suivi Fondations/i }).waitFor({ timeout: 15000 });
    await page.getByText("Valeurs CFSB - comportements Coach Developpement").waitFor({ timeout: 15000 });
    await page.getByText("Cours de groupe - standards de base").waitFor({ timeout: 15000 });
    await page.getByText("Documentation, communication et relais").waitFor({ timeout: 15000 });
    await page.locator("label", { hasText: "Je guide le membre dans Kilo, CHIP, documents" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Coach Professionnel/i }).click();
    await page.getByRole("link", { name: /Relire la fiche de poste/i }).waitFor({ timeout: 15000 });
    await page.getByText("Valeurs CFSB - comportements Coach Professionnel").waitFor({ timeout: 15000 });
    await page.locator("summary", { hasText: "Portefeuille, ventes et realite economique" }).waitFor({ timeout: 15000 });
    await page.locator("label", { hasText: "Je prends ownership de mon portefeuille de clients" }).waitFor({ timeout: 15000 });
    await page.getByText("Relation membre et retention").waitFor({ timeout: 15000 });
    await page.getByText("Cours de groupe - excellence Coach Professionnel").waitFor({ timeout: 15000 });
    await page.locator("label", { hasText: "J'identifie rapidement les problemes prioritaires" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Coordinatrice du centre/i }).click();
    await page.getByText("Valeurs CFSB - comportements Coordinatrice du centre").waitFor({ timeout: 15000 });
    await page.getByText("Parcours membre, Fondations et CSM").waitFor({ timeout: 15000 });
    await page.locator("label", { hasText: "Je garde une vue claire des nouveaux membres" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Head Coach/i }).click();
    await page.getByText("Valeurs CFSB - comportements Head Coach").waitFor({ timeout: 15000 });
    await page.getByText("Observation, feedback et developpement des coachs").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Entretien menager/i }).click();
    await page.getByText("Valeurs CFSB - comportements Entretien menager").waitFor({ timeout: 15000 });
    await page.getByText("Qualite, hygiene et details visibles").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Engagement communautaire et evenements/i }).click();
    await page.getByText("Valeurs CFSB - comportements Engagement communautaire et evenements").waitFor({ timeout: 15000 });
    await page.getByText("J'organise les evenements avec calendrier").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Administration \/ autre role/i }).click();
    await page.getByText("Valeurs CFSB - comportements Administration / autre role").waitFor({ timeout: 15000 });
    await page.getByText("Fiabilite, exactitude et confidentialite").waitFor({ timeout: 15000 });

    await page.getByRole("button", { name: /Parametres/i }).click();
    const endpointValue = await page.locator("#endpointInput").inputValue();
    if (endpointValue !== endpointUrl) {
      throw new Error(`Unexpected endpoint value: ${endpointValue}`);
    }

    const resumePage = await browser.newPage({ viewport: { width: 1360, height: 920 } });
    await resumePage.route("https://script.google.com/**", (route) => route.abort());
    await resumePage.goto(`${baseUrl}web/index.html?resume=${resumeTestId}`, { waitUntil: "networkidle" });
    await resumePage.getByText(/Reprise chargee depuis la copie GitHub/i).waitFor({ timeout: 15000 });
    const resumedName = await resumePage.locator('[data-question-id="employee_name"]').inputValue();
    if (!/Marc-Andr[eé] M[eé]nard/i.test(resumedName)) {
      throw new Error(`Unexpected resumed employee name: ${resumedName}`);
    }
    await resumePage.close();

    await page.goto(`${baseUrl}owners.html`, { waitUntil: "networkidle" });
    await page.getByText("Acces reserve").waitFor({ timeout: 15000 });
    await page.locator("#ownerPinInput").fill("CFSB2026!");
    await page.getByRole("button", { name: /Ouvrir le dashboard/i }).click();
    await page.getByRole("button", { name: /Importer JSON/i }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Synchroniser/i }).waitFor({ timeout: 15000 });
    await page.getByText(/soumission\(s\) (chargee|visible)\(s\) depuis (Google Sheets|le snapshot GitHub)/i).waitFor({ timeout: 30000 });
    await page.locator("#submissionSelect").waitFor({ timeout: 15000 });
    await page.locator("#submissionSelect").selectOption({ label: /Marc-Andr[eé]/i });
    await page.getByText("Resume de rencontre").waitFor({ timeout: 15000 });
    await page.getByText("Note de rencontre").waitFor({ timeout: 15000 });
    await page.getByText("Reponses employe").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Lien reprise/i }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Message relance/i }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /^Archiver$/i }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Parametres/i }).click();
    const ownerEndpointValue = await page.locator("#endpointInput").inputValue();
    if (ownerEndpointValue !== endpointUrl) {
      throw new Error(`Unexpected owners endpoint value: ${ownerEndpointValue}`);
    }

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      ownersUrl: `${baseUrl}owners.html`,
      endpointUrl
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
