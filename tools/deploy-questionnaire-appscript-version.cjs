#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const bobRoot = path.resolve("C:/Users/micha/Documents/Codex/Bob Operator/bob-operator");
const bobConfigDir = path.join(bobRoot, "config");
const bobGeneratedDir = path.join(bobRoot, "generated");
const tokenPath = path.join(bobConfigDir, "token.json");
const oauthClientPath = path.join(bobConfigDir, "oauth-client.json");
const questionnaireScriptId = "1RzTyLvUdw6NdVI2vsDoi7a2bjWGAZDXml94QYG4TCs9wF5KJdKm3HFBa";

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

async function main() {
  await fsp.mkdir(bobGeneratedDir, { recursive: true });
  const deploymentsBefore = await appsScriptApi(`projects/${questionnaireScriptId}/deployments`);
  const target = pickWebAppDeployment(deploymentsBefore.deployments || []);
  if (!target) {
    throw new Error("Aucun deploiement Web App questionnaire trouve.");
  }

  const version = await appsScriptApi(`projects/${questionnaireScriptId}/versions`, {
    method: "POST",
    body: JSON.stringify({
      description: `Dashboard Firestore queue activation ${new Date().toISOString()}`
    })
  });

  const updated = await appsScriptApi(`projects/${questionnaireScriptId}/deployments/${target.deploymentId}`, {
    method: "PUT",
    body: JSON.stringify({
      deploymentConfig: {
        scriptId: questionnaireScriptId,
        versionNumber: version.versionNumber,
        manifestFileName: "appsscript",
        description: target.description || "Questionnaire client-coach web app"
      }
    })
  });

  const deploymentsAfter = await appsScriptApi(`projects/${questionnaireScriptId}/deployments`);
  const report = {
    scriptId: questionnaireScriptId,
    deployedAt: new Date().toISOString(),
    previousDeploymentId: target.deploymentId,
    previousVersionNumber: target.versionNumber || null,
    newVersionNumber: version.versionNumber,
    updatedDeploymentId: updated.deploymentId || target.deploymentId,
    webAppUrl: extractWebAppUrl(updated) || extractWebAppUrl(target) || "",
    deploymentsCount: (deploymentsAfter.deployments || []).length
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bobReportPath = path.join(bobGeneratedDir, `questionnaire-deployment-${stamp}.json`);
  await fsp.writeFile(bobReportPath, `${JSON.stringify({ report, deploymentsBefore, deploymentsAfter }, null, 2)}\n`, "utf8");
  const repoReportPath = path.join(repoRoot, "firebase-dashboard", "QUESTIONNAIRE_APPS_SCRIPT_DEPLOYMENT.json");
  await fsp.writeFile(repoReportPath, `${JSON.stringify({ report, bobReportPath }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ report, bobReportPath, repoReportPath }, null, 2));
}

function pickWebAppDeployment(deployments) {
  const webApps = deployments
    .map((deployment) => ({
      ...deployment,
      entryPoints: deployment.entryPoints || [],
      versionNumber: deployment.deploymentConfig && deployment.deploymentConfig.versionNumber,
      description: deployment.deploymentConfig && deployment.deploymentConfig.description
    }))
    .filter((deployment) => deployment.entryPoints.some((entry) => entry.entryPointType === "WEB_APP"));
  return webApps.sort((a, b) => Number(b.versionNumber || 0) - Number(a.versionNumber || 0))[0];
}

function extractWebAppUrl(deployment) {
  const entry = (deployment.entryPoints || []).find((item) => item.entryPointType === "WEB_APP");
  return entry && entry.webApp ? entry.webApp.url : "";
}

async function appsScriptApi(pathname, options = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://script.googleapis.com/v1/${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function getAccessToken() {
  if (!fs.existsSync(tokenPath)) throw new Error("Bob Operator token.json introuvable.");
  const token = await readJson(tokenPath);
  const expiresAt = (token.created_at || 0) + (token.expires_in || 0) * 1000 - 60_000;
  if (token.access_token && Date.now() < expiresAt) return token.access_token;
  if (!token.refresh_token) throw new Error("Le jeton Bob n'a pas de refresh_token.");

  const client = await readOAuthClient();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token"
    })
  });
  const refreshed = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(refreshed)}`);
  const nextToken = { ...token, ...refreshed, refresh_token: token.refresh_token, created_at: Date.now() };
  await fsp.writeFile(tokenPath, `${JSON.stringify(nextToken, null, 2)}\n`, "utf8");
  return nextToken.access_token;
}

async function readOAuthClient() {
  if (!fs.existsSync(oauthClientPath)) throw new Error("Bob Operator oauth-client.json introuvable.");
  const raw = await readJson(oauthClientPath);
  const client = raw.installed || raw.web || raw;
  if (!client.client_id || !client.client_secret) {
    throw new Error("oauth-client.json doit contenir client_id et client_secret.");
  }
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}
