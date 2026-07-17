const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "firebase-dashboard", "public");
const firebaseConfigPath = path.join(root, "firebase.json");
const cliConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const projectId = "cfsb-dashboard-coach-aa9a4";
const siteId = "cfsb-dashboard-coach-aa9a4";
const baseUrl = "https://firebasehosting.googleapis.com/v1beta1";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function collectFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .map((name) => {
      const absolutePath = path.join(dir, name);
      const content = fs.readFileSync(absolutePath);
      const gzipped = zlib.gzipSync(content);
      return {
        absolutePath,
        path: `/${name}`,
        hash: sha256Hex(gzipped),
        gzipped
      };
    });
}

function hostingConfigFromFirebaseJson(config) {
  const hosting = config.hosting || {};
  return {
    headers: (hosting.headers || []).map((entry) => ({
      glob: entry.source,
      headers: Object.fromEntries((entry.headers || []).map((header) => [header.key, header.value]))
    })),
    rewrites: (hosting.rewrites || []).map((entry) => ({
      glob: entry.source,
      path: entry.destination
    }))
  };
}

async function request(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { text };
    }
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function uploadFile(accessToken, uploadUrl, hash, gzipped) {
  const response = await fetch(`${uploadUrl}/${hash}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream"
    },
    body: gzipped
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Upload ${hash} failed: ${response.status} ${response.statusText} ${text}`);
  }
}

async function main() {
  const cliConfig = readJson(cliConfigPath);
  const accessToken = cliConfig.tokens && cliConfig.tokens.access_token;
  if (!accessToken) {
    throw new Error(`Aucun access_token Firebase trouve dans ${cliConfigPath}`);
  }

  const firebaseConfig = readJson(firebaseConfigPath);
  const files = collectFiles(publicDir);
  if (!files.some((file) => file.path === "/index.html")) {
    throw new Error("index.html est absent du dossier public Firebase.");
  }

  const version = await request(accessToken, `${baseUrl}/sites/${siteId}/versions`, {
    method: "POST",
    body: JSON.stringify({ config: hostingConfigFromFirebaseJson(firebaseConfig) })
  });

  const populate = await request(accessToken, `${baseUrl}/${version.name}:populateFiles`, {
    method: "POST",
    body: JSON.stringify({
      files: Object.fromEntries(files.map((file) => [file.path, file.hash]))
    })
  });

  const required = new Set(populate.uploadRequiredHashes || []);
  for (const file of files) {
    if (required.has(file.hash)) {
      await uploadFile(accessToken, populate.uploadUrl, file.hash, file.gzipped);
      console.log(`Uploaded ${file.path}`);
    } else {
      console.log(`Reused ${file.path}`);
    }
  }

  await request(accessToken, `${baseUrl}/${version.name}?updateMask=status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "FINALIZED" })
  });

  const release = await request(accessToken, `${baseUrl}/sites/${siteId}/releases?versionName=${encodeURIComponent(version.name)}`, {
    method: "POST",
    body: JSON.stringify({})
  });

  console.log(JSON.stringify({
    ok: true,
    site: siteId,
    version: version.name,
    release: release.name,
    files: files.map((file) => file.path)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
