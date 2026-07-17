const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectId = "cfsb-dashboard-coach-aa9a4";
const firebaseResolution = resolveFirebaseBin();
const firebaseBin = firebaseResolution.bin;
const token = process.env.FIREBASE_TOKEN || "";
const requiredSecrets = ["GHL_PRIVATE_TOKEN", "DASHBOARD_IMPORT_TOKEN"];
const hostingOnly = process.argv.includes("--hosting-only");
const firebaseCliTimeoutMs = 90000;

const checks = [];

if (hostingOnly) {
  const args = ["hosting:sites:list", "--project", projectId, "--json"];
  if (token) args.push("--token", token);

  const result = spawnSync(firebaseBin, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: firebaseCliTimeoutMs,
    env: firebaseResolution.env
  });

  const output = sanitize(`${result.stdout || ""}\n${result.stderr || ""}`);
  const authFailed = /Authentication Error|credentials are no longer valid|invalid_rapt|invalid_grant|login --reauth|reauth/i.test(output);
  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
  const hasDashboardSite = output.includes("cfsb-dashboard-coach-aa9a4");
  const passed = result.status === 0 && !authFailed && !timedOut && hasDashboardSite;

  checks.push({
    name: "firebase hosting access",
    passed,
    detail: passed
      ? "Firebase Hosting accessible avec la session Firebase courante."
      : buildHostingFailureDetail(output, timedOut)
  });
} else {
for (const secret of requiredSecrets) {
  const args = ["functions:secrets:describe", secret, "--project", projectId];
  if (token) args.push("--token", token);

  const result = spawnSync(firebaseBin, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: firebaseCliTimeoutMs,
    env: firebaseResolution.env
  });

  const output = sanitize(`${result.stdout || ""}\n${result.stderr || ""}`);
  const authFailed = /Authentication Error|credentials are no longer valid|invalid_rapt|invalid_grant|login --reauth|reauth/i.test(output);
  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
  const passed = result.status === 0 && !authFailed && !timedOut;

  checks.push({
    name: `firebase secret ${secret}`,
    passed,
    detail: passed
      ? "Secret accessible avec la session Firebase courante."
      : buildFailureDetail(secret, output, timedOut)
  });
}
}

const failures = checks.filter((item) => !item.passed);
const result = {
  ok: failures.length === 0,
  mode: hostingOnly ? "hosting-only" : "functions-secrets",
  firebaseBin: firebaseResolution.label,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);

function buildFailureDetail(secret, output, timedOut) {
  if (timedOut) {
    return `Timeout en verifiant ${secret}. La session Firebase est probablement expiree; relancer firebase-login-dashboard.cmd.`;
  }
  if (/Authentication Error|credentials are no longer valid|invalid_rapt|invalid_grant|login --reauth|reauth/i.test(output)) {
    return `Reauth Firebase requise avant deploy complet. Relancer firebase-login-dashboard.cmd, puis deploy-dashboard-complet.cmd.`;
  }
  if (/not found|not exist|404|PERMISSION_DENIED|permission/i.test(output)) {
    return `Secret ${secret} introuvable ou inaccessible. Creer/verifier le secret dans Firebase Secret Manager avant deploy Functions.`;
  }
  return `Impossible de confirmer ${secret}. Sortie Firebase: ${output.slice(0, 500)}`;
}

function buildHostingFailureDetail(output, timedOut) {
  if (timedOut) {
    return "Timeout en verifiant Firebase Hosting. La session Firebase est probablement expiree; relancer firebase-login-dashboard.cmd.";
  }
  if (/Authentication Error|credentials are no longer valid|invalid_rapt|invalid_grant|login --reauth|reauth/i.test(output)) {
    return "Reauth Firebase requise avant deploy Hosting. Relancer firebase-login-dashboard.cmd, puis publier-dashboard-mvp.cmd.";
  }
  if (/PERMISSION_DENIED|permission/i.test(output)) {
    return "La session Firebase actuelle ne semble pas avoir acces au projet Hosting.";
  }
  return `Impossible de confirmer l'acces Hosting. Sortie Firebase: ${output.slice(0, 500)}`;
}

function sanitize(text) {
  return String(text)
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[REDACTED_ACCESS_TOKEN]")
    .replace(/1\/\/[A-Za-z0-9._-]+/g, "[REDACTED_REFRESH_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[REDACTED_JWT]");
}

function resolveFirebaseBin() {
  if (process.env.FIREBASE_BIN) {
    return {
      bin: process.env.FIREBASE_BIN,
      label: process.env.FIREBASE_BIN,
      env: process.env
    };
  }

  const pathCheck = spawnSync("where", ["firebase"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 5000
  });
  if (pathCheck.status === 0) {
    return {
      bin: "firebase",
      label: "firebase",
      env: process.env
    };
  }

  const home = process.env.USERPROFILE || process.env.HOME || "";
  const cacheRoot = path.join(home, ".cache", "cfsb-dashboard-tools");
  const localFirebase = path.join(cacheRoot, "firebase-tools-clean", "node_modules", ".bin", process.platform === "win32" ? "firebase.cmd" : "firebase");
  const nodeRoot = path.join(cacheRoot, "node-v22");
  const nodeDir = firstExistingDirectory(nodeRoot, /^node-v.*-win-x64$/);

  if (fs.existsSync(localFirebase) && nodeDir && fs.existsSync(path.join(nodeDir, process.platform === "win32" ? "node.exe" : "node"))) {
    return {
      bin: localFirebase,
      label: `${localFirebase} avec Node local`,
      env: {
        ...process.env,
        PATH: `${nodeDir}${path.delimiter}${process.env.PATH || ""}`
      }
    };
  }

  return {
    bin: "firebase",
    label: "firebase introuvable; tentative PATH par defaut",
    env: process.env
  };
}

function firstExistingDirectory(root, pattern) {
  if (!fs.existsSync(root)) return "";
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const match = entries.find((entry) => entry.isDirectory() && pattern.test(entry.name));
  return match ? path.join(root, match.name) : "";
}
