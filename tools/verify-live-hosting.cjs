const https = require("https");
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.DASHBOARD_LIVE_URL || "https://cfsb-dashboard-coach-aa9a4.web.app";
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "firebase-dashboard", "public");
const allowVersionMismatch = process.env.DASHBOARD_ALLOW_LIVE_VERSION_MISMATCH === "1";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const expected = readExpectedBundle();
  const root = await fetchText(baseUrl);
  const appPath = matchOne(root.text, /<script[^>]+type="module"[^>]+src="([^"]*app\.js[^"]*)"/i);
  const stylePath = matchOne(root.text, /<link[^>]+rel="stylesheet"[^>]+href="([^"]*styles\.css[^"]*)"/i);

  const [app, styles, fallback] = await Promise.all([
    fetchText(new URL(appPath || "/app.js", baseUrl).toString()),
    fetchText(new URL(stylePath || "/styles.css", baseUrl).toString()),
    fetchText(new URL("/route/diagnostic-live", baseUrl).toString())
  ]);

  const publicBundle = [root.text, app.text, styles.text].join("\n");
  const checks = [];
  check(checks, "live root loads", root.status === 200 && root.text.includes('<div id="app"'), "La racine Hosting doit charger le shell du dashboard.");
  check(checks, "live no-store headers", hasNoStore(root) && hasNoStore(app) && hasNoStore(styles), "Les assets live doivent eviter le cache agressif.");
  check(checks, "live app js referenced", Boolean(appPath) && app.status === 200 && app.text.includes("initializeApp"), "index.html doit servir le bundle Firebase actuel.");
  check(checks, "live styles referenced", Boolean(stylePath) && styles.status === 200 && styles.text.includes("@media"), "index.html doit servir les styles responsives.");
  check(checks, "live firebase project", app.text.includes("cfsb-dashboard-coach-aa9a4"), "Le bundle live doit pointer vers le projet Firebase pilote.");
  check(
    checks,
    "live backend action wiring",
    app.text.includes('collection(db, "questionnaireSends")')
      && app.text.includes('deliveryStatus: "firestore_queue_pending"')
      && app.text.includes('collection(db, "syncRequests")')
      && !app.text.includes('httpsCallable(functions, "syncDashboardFromSheets")'),
    "Le frontend live doit envoyer les questionnaires et la sync par files Firestore."
  );
  check(checks, "live current app version", appPath === expected.appPath && app.text.includes(`APP_VERSION = "${expected.version}"`), `Le live doit servir ${expected.appPath} / ${expected.version}, pas une ancienne version.`);
  check(checks, "live spa fallback", fallback.status === 200 && fallback.text.includes('<div id="app"'), "Les routes inconnues doivent retomber sur index.html.");
  check(checks, "live public assets avoid secrets", !/GHL_PRIVATE_TOKEN|Bearer\s+[A-Za-z0-9._-]+|ghl_private|private_token/i.test(publicBundle), "Les assets publics live ne doivent pas exposer de secret.");

  const failures = checks.filter((item) => !item.passed);
  const onlyVersionMismatch = failures.length === 1 && failures[0].name === "live current app version";
  const staleButHealthy = allowVersionMismatch && onlyVersionMismatch;
  const result = {
    ok: failures.length === 0 || staleButHealthy,
    strictOk: failures.length === 0,
    staleButHealthy,
    mode: allowVersionMismatch ? "stable-live-allowed" : "strict-current-version",
    baseUrl,
    passed: checks.length - failures.length,
    total: checks.length,
    assets: {
      appPath,
      stylePath,
      expectedAppPath: expected.appPath,
      expectedVersion: expected.version,
      rootLength: root.text.length,
      appLength: app.text.length,
      stylesLength: styles.text.length
    },
    failures,
    checks
  };

  console.log(JSON.stringify(result, null, 2));
  if (failures.length && !staleButHealthy) process.exit(1);
}

function readExpectedBundle() {
  const localIndex = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
  const localApp = fs.readFileSync(path.join(publicDir, "app.js"), "utf8");
  return {
    appPath: matchOne(localIndex, /<script[^>]+type="module"[^>]+src="([^"]*app\.js[^"]*)"/i),
    version: matchOne(localApp, /APP_VERSION\s*=\s*"([^"]+)"/)
  };
}

function check(checks, name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function matchOne(text, regex) {
  const match = text.match(regex);
  return match ? match[1] : "";
}

function hasNoStore(response) {
  const header = String(response.headers["cache-control"] || "");
  return /no-store/i.test(header);
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, headers: res.headers, text: data });
        });
      })
      .on("error", reject);
  });
}
