const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "firebase-dashboard", "public");
const appPath = path.join(publicDir, "app.js");
const stylesPath = path.join(publicDir, "styles.css");
const indexPath = path.join(publicDir, "index.html");
const firebasePath = path.join(root, "firebase.json");
const projectPath = path.join(root, ".firebaserc");

const app = fs.readFileSync(appPath, "utf8");
const styles = fs.readFileSync(stylesPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const firebase = JSON.parse(fs.readFileSync(firebasePath, "utf8"));
const projects = JSON.parse(fs.readFileSync(projectPath, "utf8"));
const version = app.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1] || "";

const checks = {
  officialProject: projects.projects?.default === "cfsb-dashboard-coach-aa9a4",
  officialSite: firebase.hosting?.site === "cfsb-dashboard-coach-aa9a4",
  officialPublicDirectory: firebase.hosting?.public === "firebase-dashboard/public",
  modernBundleSize: fs.statSync(appPath).size > 300000 && fs.statSync(stylesPath).size > 50000,
  modernNavigation: app.includes("mobile-bottom-nav") && app.includes("mobile-app-header"),
  modernWorkflows: app.includes("voiceMissionRequests") && app.includes("questionnaireSchedules"),
  explicitVersion: /^2026\d{4}-[a-z0-9-]+$/.test(version),
  cacheBusterAligned: index.includes(`app.js?v=${version}`) && index.includes(`styles.css?v=${version}`)
};

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ ok: failures.length === 0, version, checks, failures }, null, 2));

if (failures.length) {
  console.error("Publication bloquee: la source ne correspond pas au Dashboard Coach moderne officiel.");
  process.exit(1);
}
