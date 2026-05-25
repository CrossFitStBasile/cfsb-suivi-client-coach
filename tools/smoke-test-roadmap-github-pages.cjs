const { chromium } = require("playwright");

const baseUrl = "https://crossfitstbasile.github.io/cfsb-suivi-client-coach/roadmap/";
const endpointUrl = "https://script.google.com/macros/s/AKfycbxnhlehsj_NQU73k3csMQPj0NAm3QSQrpjk0Ar6VYOjXYZO-m9_GSxtmEqYw9y_9DSQEA/exec";

async function run() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 920 } });

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByText("Charte organisationnelle 2026").waitFor({ timeout: 15000 });
    await page.getByText("Michael Grondin").waitFor({ timeout: 15000 });
    await page.getByText("Gabriel Mayer Bedard").waitFor({ timeout: 15000 });
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
    await page.getByRole("button", { name: /Coach Developpement/i }).click();
    await page.getByRole("link", { name: /Relire le suivi Fondations/i }).waitFor({ timeout: 15000 });
    await page.getByText("Valeurs CFSB - comportements Coach Developpement").waitFor({ timeout: 15000 });
    await page.getByText("Kilo, CHIP, les politiques").waitFor({ timeout: 15000 });

    await page.getByRole("button", { name: /Parametres/i }).click();
    const endpointValue = await page.locator("#endpointInput").inputValue();
    if (endpointValue !== endpointUrl) {
      throw new Error(`Unexpected endpoint value: ${endpointValue}`);
    }

    await page.goto(`${baseUrl}owners.html`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Importer JSON/i }).waitFor({ timeout: 15000 });
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
