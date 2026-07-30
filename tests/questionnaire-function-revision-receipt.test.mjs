import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const receipt = require("../tools/questionnaire-function-revision-receipt.cjs");

const COMMIT = "a".repeat(40);
const SOURCE_HASH = "b".repeat(40);
const UPDATE_TIME = "2026-07-29T20:00:00.000Z";
const FIREBASE_MANAGED_ENVIRONMENT = Object.freeze({
  FIREBASE_CONFIG:
    '{"projectId":"cfsb-dashboard-coach-aa9a4","storageBucket":"cfsb-dashboard-coach-aa9a4.firebasestorage.app"}',
  GCLOUD_PROJECT: "cfsb-dashboard-coach-aa9a4"
});
const SHARED_BUILD =
  "projects/129233025317/locations/us-central1/builds/shared-build";
const SHARED_PROVENANCE = Object.freeze({
  resolvedStorageSource: {
    bucket: "gcf-v2-sources-129233025317-us-central1",
    object: "shared/function-source.zip",
    generation: "123"
  }
});

function sha1(value) {
  return crypto.createHash("sha1").update(String(value), "utf8").digest("hex");
}

function candidate({ environmentVariables = {} } = {}) {
  const environmentHash = sha1(JSON.stringify(environmentVariables));
  return {
    releaseCommit: COMMIT,
    sourceHash: SOURCE_HASH,
    environmentVariables,
    environmentHash,
    sourceCommitHash: receipt.stableHash({
      releaseCommit: COMMIT,
      sourceHash: SOURCE_HASH,
      environmentHash
    })
  };
}

function liveFunction(functionId, {
  secretVersions = {},
  sourceHash = SOURCE_HASH,
  environmentVariables = {},
  build = SHARED_BUILD,
  provenance = SHARED_PROVENANCE
} = {}) {
  const firebaseFunctionsHash = sha1(
    sourceHash
    + sha1(JSON.stringify(environmentVariables))
    + sha1(JSON.stringify(secretVersions))
  );
  return {
    name:
      `projects/cfsb-dashboard-coach-aa9a4/locations/us-central1/functions/${functionId}`,
    state: "ACTIVE",
    environment: "GEN_2",
    updateTime: UPDATE_TIME,
    labels: {
      "firebase-functions-hash": firebaseFunctionsHash
    },
    buildConfig: {
      build,
      sourceProvenance: provenance
    },
    serviceConfig: {
      revision: `${functionId.toLowerCase()}-00001-abc`,
      service:
        `projects/129233025317/locations/us-central1/services/${functionId}`,
      allTrafficOnLatestRevision: true,
      secretEnvironmentVariables: Object.entries(secretVersions).map(
        ([key, version]) => ({
          key,
          secret: key,
          version
        })
      )
    }
  };
}

test("the A3 receipt covers every deployed function and its exact secret contract", () => {
  assert.deepEqual(
    Object.keys(receipt.EXPECTED_SECRET_KEYS),
    receipt.FUNCTION_IDS
  );
  assert.deepEqual(receipt.EXPECTED_SECRET_KEYS.sendQuestionnaire, []);
  assert.deepEqual(
    receipt.EXPECTED_SECRET_KEYS.processQuestionnaireSendRequest,
    ["GHL_PRIVATE_TOKEN"]
  );
});

test("the Firebase label is derived from candidate source, environment and secret versions", () => {
  const secretVersions = { GHL_PRIVATE_TOKEN: "1" };
  const expected = sha1(
    SOURCE_HASH
    + sha1("{}")
    + sha1(JSON.stringify(secretVersions))
  );
  assert.equal(
    receipt.expectedFirebaseFunctionsHash({
      sourceHash: SOURCE_HASH,
      environmentVariables: {},
      secretVersions
    }),
    expected
  );
});

test("candidate packaging uses the same Firebase CLI source hash contract", async () => {
  const context = await receipt.buildCandidateContext(COMMIT);
  assert.equal(context.releaseCommit, COMMIT);
  assert.match(context.sourceHash, /^[a-f0-9]{40}(?:\.[a-f0-9]{40})?$/);
  assert.deepEqual(
    context.environmentVariables,
    FIREBASE_MANAGED_ENVIRONMENT
  );
  assert.equal(
    context.environmentHash,
    sha1(JSON.stringify(FIREBASE_MANAGED_ENVIRONMENT))
  );
  assert.match(context.environmentHash, /^[a-f0-9]{40}$/);
  assert.match(context.sourceCommitHash, /^[a-f0-9]{64}$/);
});

test("a live revision hash containing both Firebase-managed variables is accepted", () => {
  const context = candidate({
    environmentVariables: FIREBASE_MANAGED_ENVIRONMENT
  });
  const live = liveFunction("sendQuestionnaire", {
    environmentVariables: FIREBASE_MANAGED_ENVIRONMENT
  });

  const entry = receipt.buildLiveRevisionEntry(
    "sendQuestionnaire",
    live,
    context
  );

  assert.equal(
    entry.firebaseFunctionsHash,
    sha1(
      SOURCE_HASH
      + sha1(JSON.stringify(FIREBASE_MANAGED_ENVIRONMENT))
      + sha1("{}")
    )
  );
});

test("a live revision hash missing a Firebase-managed variable fails closed", () => {
  const context = candidate({
    environmentVariables: FIREBASE_MANAGED_ENVIRONMENT
  });
  for (const omittedKey of Object.keys(FIREBASE_MANAGED_ENVIRONMENT)) {
    const environmentVariables = {
      ...FIREBASE_MANAGED_ENVIRONMENT
    };
    delete environmentVariables[omittedKey];
    const liveWithoutManagedVariable = liveFunction("sendQuestionnaire", {
      environmentVariables
    });

    assert.throws(
      () => receipt.buildLiveRevisionEntry(
        "sendQuestionnaire",
        liveWithoutManagedVariable,
        context
      ),
      /live_function_candidate_hash_mismatch/,
      `${omittedKey} must be part of the live Firebase hash`
    );
  }
});

test("a live revision hash with a changed Firebase-managed value fails closed", () => {
  const context = candidate({
    environmentVariables: FIREBASE_MANAGED_ENVIRONMENT
  });
  const changedValues = {
    FIREBASE_CONFIG:
      '{"projectId":"different-project","storageBucket":"different-project.firebasestorage.app"}',
    GCLOUD_PROJECT: "different-project"
  };
  for (const [changedKey, changedValue] of Object.entries(changedValues)) {
    const liveWithChangedManagedVariable = liveFunction("sendQuestionnaire", {
      environmentVariables: {
        ...FIREBASE_MANAGED_ENVIRONMENT,
        [changedKey]: changedValue
      }
    });

    assert.throws(
      () => receipt.buildLiveRevisionEntry(
        "sendQuestionnaire",
        liveWithChangedManagedVariable,
        context
      ),
      /live_function_candidate_hash_mismatch/,
      `${changedKey} must match the candidate Firebase hash exactly`
    );
  }
});

test("shared Cloud Build and source provenance are valid for several candidate functions", () => {
  const context = candidate();
  const callable = receipt.buildLiveRevisionEntry(
    "sendQuestionnaire",
    liveFunction("sendQuestionnaire"),
    context
  );
  const processor = receipt.buildLiveRevisionEntry(
    "processQuestionnaireSendRequest",
    liveFunction("processQuestionnaireSendRequest", {
      secretVersions: { GHL_PRIVATE_TOKEN: "1" }
    }),
    context
  );
  assert.equal(callable.build, processor.build);
  assert.equal(
    callable.sourceProvenanceHash,
    processor.sourceProvenanceHash
  );
  assert.notEqual(
    callable.firebaseFunctionsHash,
    processor.firebaseFunctionsHash
  );
  assert.match(callable.releaseCommitBindingHash, /^[a-f0-9]{64}$/);
  assert.match(processor.releaseCommitBindingHash, /^[a-f0-9]{64}$/);
});

test("a partial or no-op deploy left on an older source hash fails closed", () => {
  assert.throws(
    () => receipt.buildLiveRevisionEntry(
      "sendQuestionnaire",
      liveFunction("sendQuestionnaire", { sourceHash: "c".repeat(40) }),
      candidate()
    ),
    /live_function_candidate_hash_mismatch/
  );
});

test("an unexpected live secret contract fails before a receipt can be recorded", () => {
  assert.throws(
    () => receipt.buildLiveRevisionEntry(
      "sendQuestionnaire",
      liveFunction("sendQuestionnaire", {
        secretVersions: { GHL_PRIVATE_TOKEN: "1" }
      }),
      candidate()
    ),
    /live_function_secret_contract_invalid/
  );
  assert.throws(
    () => receipt.buildLiveRevisionEntry(
      "processQuestionnaireSendRequest",
      liveFunction("processQuestionnaireSendRequest"),
      candidate()
    ),
    /live_function_secret_contract_invalid/
  );
});

test("the per-revision binding changes with the sealed release commit", () => {
  const value = liveFunction("sendQuestionnaire");
  const first = receipt.buildLiveRevisionEntry(
    "sendQuestionnaire",
    value,
    candidate()
  );
  const nextCandidate = {
    ...candidate(),
    releaseCommit: "d".repeat(40),
    sourceCommitHash: receipt.stableHash({
      releaseCommit: "d".repeat(40),
      sourceHash: SOURCE_HASH,
      environmentHash: candidate().environmentHash
    })
  };
  const second = receipt.buildLiveRevisionEntry(
    "sendQuestionnaire",
    value,
    nextCandidate
  );
  assert.notEqual(
    first.releaseCommitBindingHash,
    second.releaseCommitBindingHash
  );
});
