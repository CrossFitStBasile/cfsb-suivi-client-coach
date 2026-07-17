const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "firebase-dashboard", "public");
const port = 0;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const requestedPath = new URL(req.url, "http://127.0.0.1").pathname;
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const target = path.resolve(publicDir, relativePath);

  if (!target.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    const fallback = path.join(publicDir, "index.html");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(fallback));
    return;
  }

  res.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(target)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  res.end(fs.readFileSync(target));
});

server.listen(port, "127.0.0.1", async () => {
  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const [html, appJs, stylesCss, fallback] = await Promise.all([
      fetchText(`${baseUrl}/`),
      fetchText(`${baseUrl}/app.js`),
      fetchText(`${baseUrl}/styles.css`),
      fetchText(`${baseUrl}/route/qui/nexiste/pas`)
    ]);

    const checks = [];
    check(checks, "index html loads app shell", html.status === 200 && html.text.includes('<div id="app"') && html.text.includes("Dashboard Coach"), "index.html doit exposer le conteneur app.");
    check(checks, "index references app js", /src="\.\/app\.js(\?[^"]*)?"/.test(html.text) && appJs.status === 200, "index.html doit charger app.js.");
    check(checks, "index references styles", /href="\.\/styles\.css(?:\?[^\"]*)?"/.test(html.text) && stylesCss.status === 200, "index.html doit charger styles.css, avec ou sans cache-buster.");
    check(checks, "app js contains firebase boot", appJs.text.includes("initializeApp") && appJs.text.includes("getAuth") && appJs.text.includes("getFirestore"), "app.js doit initialiser Firebase Auth et Firestore.");
    check(checks, "styles contains responsive shell", stylesCss.text.includes("@media (max-width: 980px)") && stylesCss.text.includes("@media (max-width: 560px)"), "styles.css doit contenir les garde-fous mobiles.");
    check(checks, "spa fallback returns index", fallback.status === 200 && fallback.text.includes('<div id="app"'), "Les routes inconnues doivent retomber sur index.html.");
    check(checks, "public files avoid obvious secrets", !/GHL_PRIVATE_TOKEN|Bearer\s+[A-Za-z0-9._-]+|token=/i.test(html.text + appJs.text + stylesCss.text), "Les assets publics ne doivent pas contenir de secret evident.");

    const failures = checks.filter((item) => !item.passed);
    const result = {
      ok: failures.length === 0,
      baseUrl,
      passed: checks.length - failures.length,
      total: checks.length,
      failures,
      checks
    };
    console.log(JSON.stringify(result, null, 2));
    server.close(() => process.exit(failures.length ? 1 : 0));
  } catch (error) {
    console.error(error);
    server.close(() => process.exit(1));
  }
});

function check(checks, name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode, text: data });
      });
    }).on("error", reject);
  });
}
