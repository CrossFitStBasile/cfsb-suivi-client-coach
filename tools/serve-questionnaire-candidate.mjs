#!/usr/bin/env node

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, normalize, resolve } from "node:path";

const require = createRequire(import.meta.url);
const {
  INITIAL_DRAFTS,
  publishDraft
} = require("../functions/questionnaire-studio.js");

const root = resolve(import.meta.dirname, "..");
const publicRoot = join(root, "firebase-dashboard", "public");
const port = Number(process.argv[2] || 4177);
const publishedAt = "2026-07-28T00:00:00.000Z";
const draftsBySlug = new Map(
  Object.values(INITIAL_DRAFTS).map((draft) => [draft.slug, draft])
);
const received = [];

function publicDefinition(snapshot) {
  const {
    rules: _rules,
    responsePolicy: _responsePolicy,
    ghlTag: _ghlTag,
    ...safe
  } = snapshot;
  const isExpress = snapshot.settings?.kind === "check_in";
  return {
    ...safe,
    active: true,
    presentation: {
      mode: isExpress ? "one_page" : "steps",
      review: !isExpress
    },
    confirmation: {
      title: "Merci d'avoir pris le temps.",
      message: snapshot.settings?.successMessage || "Ta réponse a bien été recue."
    }
  };
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".zip": "application/zip"
};

function json(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256 * 1024) throw new Error("payload_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function staticPath(pathname) {
  if (/^\/questionnaire\/f\/[a-z0-9][a-z0-9-]*\/?$/u.test(pathname)) {
    return join(publicRoot, "questionnaire", "f", "index.html");
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/u, "");
  const candidate = normalize(join(publicRoot, relative));
  if (!candidate.startsWith(publicRoot)) return "";
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return "";
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (url.pathname === "/__submissions") {
    json(response, 200, { ok: true, count: received.length, received });
    return;
  }
  if (url.pathname === "/api/questionnaires") {
    const slug = String(url.searchParams.get("slug") || "").trim();
    const draft = draftsBySlug.get(slug);
    if (!draft) {
      json(response, 404, {
        ok: false,
        error: { code: "QUESTIONNAIRE_NOT_FOUND", message: "Formulaire introuvable." }
      });
      return;
    }
    const snapshot = publishDraft(draft, {
      version: "1",
      publishedAt
    });
    if (request.method === "GET") {
      json(response, 200, {
        ok: true,
        questionnaire: publicDefinition(snapshot)
      });
      return;
    }
    if (request.method === "POST") {
      try {
        const body = await readJson(request);
        const phone = String(body?.identity?.phone || "").replace(/\D/gu, "");
        if (phone.endsWith("0000")) {
          json(response, 200, {
            ok: true,
            response: {
              stored: false,
              idempotencyKey: body?.idempotencyKey || ""
            }
          });
          return;
        }
        const responseId = `local_${String(body?.idempotencyKey || "missing")}`;
        received.push({ slug, responseId, body });
        json(response, 200, {
          ok: true,
          response: {
            stored: true,
            idempotencyKey: body.idempotencyKey,
            responseId,
            duplicate: false,
            receivedAt: new Date().toISOString()
          }
        });
      } catch {
        json(response, 400, {
          ok: false,
          error: { code: "INVALID_JSON", message: "Requête invalide." }
        });
      }
      return;
    }
    response.writeHead(405, { Allow: "GET, POST" });
    response.end();
    return;
  }

  const filePath = staticPath(url.pathname);
  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Questionnaire candidate: http://127.0.0.1:${port}`);
});
