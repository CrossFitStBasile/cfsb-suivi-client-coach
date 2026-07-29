import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ttl = require(
  path.join(root, "tools", "manage-questionnaire-rate-limit-ttl.cjs")
);
const source = fs.readFileSync(
  path.join(root, "tools", "manage-questionnaire-rate-limit-ttl.cjs"),
  "utf8"
);
const COMMIT = "d".repeat(40);

test("la cible TTL est figée à questionnaireRateLimits.expiresAt", () => {
  assert.equal(ttl.COLLECTION_GROUP, "questionnaireRateLimits");
  assert.equal(ttl.FIELD_ID, "expiresAt");
  assert.equal(
    ttl.FIELD_NAME,
    "projects/cfsb-dashboard-coach-aa9a4/databases/(default)"
      + "/collectionGroups/questionnaireRateLimits/fields/expiresAt"
  );
  assert.ok(!source.includes("questionnaireResponses"));
});

test("seuls preview, enable et verify sont acceptés avec le SHA scellé", () => {
  assert.deepEqual(
    ttl.parseArgs([`--release-commit=${COMMIT}`, "--preview"]),
    { releaseCommit: COMMIT, mode: "preview" }
  );
  assert.deepEqual(
    ttl.parseArgs([`--release-commit=${COMMIT}`, "--enable"]),
    { releaseCommit: COMMIT, mode: "enable" }
  );
  assert.deepEqual(
    ttl.parseArgs([`--release-commit=${COMMIT}`, "--verify"]),
    { releaseCommit: COMMIT, mode: "verify" }
  );
  assert.throws(
    () => ttl.parseArgs([`--release-commit=${COMMIT}`, "--disable"]),
    /argument_unknown/
  );
});

test("les états TTL absents, en création, actifs et à réparer sont explicites", () => {
  assert.deepEqual(ttl.normalizeTtlState({}, 404), {
    exists: false,
    state: "ABSENT"
  });
  assert.deepEqual(ttl.normalizeTtlState({ name: ttl.FIELD_NAME }, 200), {
    exists: true,
    state: "ABSENT"
  });
  for (const state of [
    "STATE_UNSPECIFIED",
    "CREATING",
    "ACTIVE",
    "NEEDS_REPAIR"
  ]) {
    assert.deepEqual(
      ttl.normalizeTtlState({
        name: ttl.FIELD_NAME,
        ttlConfig: { state }
      }, 200),
      { exists: true, state }
    );
  }
});

test("l'activation exige un GO égal au SHA", () => {
  const previous = process.env.CFSB_QUESTIONNAIRE_TTL_GO;
  try {
    delete process.env.CFSB_QUESTIONNAIRE_TTL_GO;
    assert.throws(() => ttl.verifyEnableAuthority(COMMIT), /ttl_go_missing/);
    process.env.CFSB_QUESTIONNAIRE_TTL_GO = COMMIT;
    assert.doesNotThrow(() => ttl.verifyEnableAuthority(COMMIT));
  } finally {
    if (previous === undefined) {
      delete process.env.CFSB_QUESTIONNAIRE_TTL_GO;
    } else {
      process.env.CFSB_QUESTIONNAIRE_TTL_GO = previous;
    }
  }
});

test("le PATCH TTL ne peut modifier que ttlConfig sur la cible figée", async () => {
  const previousFetch = globalThis.fetch;
  let observed;
  try {
    globalThis.fetch = async (url, options) => {
      observed = { url: String(url), options };
      return {
        ok: true,
        status: 200,
        headers: { get: () => "100" },
        text: async () => JSON.stringify({
          name:
            "projects/cfsb-dashboard-coach-aa9a4/databases/(default)"
              + "/operations/ttl-operation"
        })
      };
    };
    const operation = await ttl.enableTtl("synthetic-access-token");
    assert.match(operation, /operations\/ttl-operation$/);
    const url = new URL(observed.url);
    assert.equal(url.searchParams.get("updateMask"), "ttlConfig");
    assert.equal(observed.options.method, "PATCH");
    assert.deepEqual(JSON.parse(observed.options.body), {
      name: ttl.FIELD_NAME,
      ttlConfig: {}
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("le runner ne contient aucun chemin de désactivation ou de wildcard", () => {
  assert.match(source, /verifySealedCandidate\(options\.releaseCommit\)/);
  assert.match(source, /CFSB_QUESTIONNAIRE_TTL_GO/);
  assert.ok(!source.includes("--disable"));
  assert.ok(!source.includes("collectionGroups/*"));
  assert.ok(!source.includes("fields/*"));
});
