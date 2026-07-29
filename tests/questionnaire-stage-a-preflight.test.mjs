import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const preflight = require(join(
  root,
  "tools",
  "questionnaire-stage-a-preflight-lib.cjs"
));
const livePreflight = require(join(
  root,
  "tools",
  "preflight-questionnaire-stage-a-live.cjs"
));
const sealedWorktree = require(join(
  root,
  "tools",
  "verify-sealed-questionnaire-release-worktree.cjs"
));

function document({
  name =
    "projects/cfsb-dashboard-coach-aa9a4/databases/(default)/documents/"
      + "questionnaireSchedules/safe",
  status,
  nextSendAt,
  extraFields = {}
} = {}) {
  const fields = { ...extraFields };
  if (status !== undefined) fields.status = { stringValue: status };
  if (nextSendAt !== undefined) fields.nextSendAt = { stringValue: nextSendAt };
  return { name, fields };
}

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload)
  };
}

test("empty and future schedules pass without inventing due work", () => {
  assert.deepEqual(
    preflight.summarizeSchedules([], "2026-07-28"),
    {
      documents: 0,
      active: 0,
      activeDue: 0,
      activeFuture: 0,
      activeInvalidDate: 0,
      invalidStatus: 0,
      inactive: 0
    }
  );
  assert.deepEqual(
    preflight.summarizeSchedules([
      document({ status: "active", nextSendAt: "2026-07-29" })
    ], "2026-07-28"),
    {
      documents: 1,
      active: 1,
      activeDue: 0,
      activeFuture: 1,
      activeInvalidDate: 0,
      invalidStatus: 0,
      inactive: 0
    }
  );
});

test("paused overdue schedules stay inactive", () => {
  const summary = preflight.summarizeSchedules([
    document({ status: "paused", nextSendAt: "2026-06-01" })
  ], "2026-07-28");
  assert.equal(summary.activeDue, 0);
  assert.equal(summary.active, 0);
  assert.equal(summary.inactive, 1);
});

test("an active schedule due today blocks even without type or formId", () => {
  const summary = preflight.summarizeSchedules([
    document({
      status: "active",
      nextSendAt: "2026-07-28",
      extraFields: {
        questionnaireType: { stringValue: "" },
        formId: { stringValue: "" }
      }
    })
  ], "2026-07-28");
  assert.equal(summary.activeDue, 1);
  assert.equal(summary.activeFuture, 0);
});

test("active missing, malformed and impossible dates fail closed", () => {
  const summary = preflight.summarizeSchedules([
    document({ status: "active" }),
    document({ status: "active", nextSendAt: "July 28" }),
    document({ status: "active", nextSendAt: "2026-02-30" })
  ], "2026-07-28");
  assert.equal(summary.active, 3);
  assert.equal(summary.activeInvalidDate, 3);
  assert.equal(summary.activeDue, 0);
});

test("missing, mistyped and unknown statuses fail closed", () => {
  const missing = document({ nextSendAt: "2026-07-28" });
  const mistyped = document({ nextSendAt: "2026-07-28" });
  mistyped.fields.status = { integerValue: "1" };
  const summary = preflight.summarizeSchedules([
    missing,
    mistyped,
    document({ status: "archived", nextSendAt: "2026-07-28" })
  ], "2026-07-28");
  assert.equal(summary.invalidStatus, 3);
  assert.equal(summary.inactive, 0);
  assert.equal(summary.active, 0);
});

test("pagination reads every page with a field mask and never mutates Firestore", async () => {
  const calls = [];
  const pages = [
    {
      documents: [
        document({
          name:
            "projects/cfsb-dashboard-coach-aa9a4/databases/(default)/documents/"
              + "questionnaireSchedules/contains-private-client-name",
          status: "paused",
          nextSendAt: "2026-06-01",
          extraFields: {
            clientName: { stringValue: "Private Client" },
            clientPhoneNormalized: { stringValue: "4505550101" }
          }
        })
      ],
      nextPageToken: "page-two"
    },
    {
      documents: [
        document({ status: "active", nextSendAt: "2026-08-01" })
      ]
    }
  ];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(pages[calls.length - 1]);
  };

  const result = await preflight.listQuestionnaireScheduleDocuments({
    fetchImpl,
    accessToken: "test-access-token",
    projectId: "cfsb-dashboard-coach-aa9a4"
  });

  assert.equal(result.pages, 2);
  assert.equal(result.documents.length, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-access-token");
  assert.equal(calls[0].url.origin, "https://firestore.googleapis.com");
  assert.equal(
    calls[0].url.pathname,
    "/v1/projects/cfsb-dashboard-coach-aa9a4/databases/(default)/documents/"
      + "questionnaireSchedules"
  );
  assert.equal(calls[1].url.searchParams.get("pageToken"), "page-two");
  assert.deepEqual(
    calls[0].url.searchParams.getAll("mask.fieldPaths"),
    ["status", "nextSendAt"]
  );
  assert.deepEqual(
    preflight.FIRESTORE_FIELD_PATHS,
    ["status", "nextSendAt"]
  );

  const safeOutput = JSON.stringify(
    preflight.summarizeSchedules(result.documents, "2026-07-28")
  );
  assert.doesNotMatch(safeOutput, /Private Client|4505550101|private-client-name/);
});

test("network, HTTP and repeated pagination failures stop the preflight", async () => {
  await assert.rejects(
    preflight.listQuestionnaireScheduleDocuments({
      accessToken: "test-access-token",
      fetchImpl: async () => {
        throw new Error("network unavailable");
      }
    }),
    /network unavailable/
  );
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(
      preflight.listQuestionnaireScheduleDocuments({
        accessToken: "test-access-token",
        fetchImpl: async () => jsonResponse(
          { private: "must not be surfaced" },
          { ok: false, status }
        )
      }),
      new RegExp(`HTTP ${status}`)
    );
  }

  await assert.rejects(
    preflight.listQuestionnaireScheduleDocuments({
      accessToken: "test-access-token",
      fetchImpl: async () => jsonResponse({
        documents: [],
        nextPageToken: "same-token"
      })
    }),
    /repeated pagination token/
  );
  await assert.rejects(
    preflight.listQuestionnaireScheduleDocuments({
      accessToken: "test-access-token",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => "{invalid"
      })
    }),
    /invalid documents JSON/
  );
});

test("invalid and duplicate Firestore resource names fail closed", async () => {
  await assert.rejects(
    preflight.listQuestionnaireScheduleDocuments({
      accessToken: "test-access-token",
      fetchImpl: async () => jsonResponse({
        documents: [
          document({
            name:
              "projects/another-project/databases/(default)/documents/"
                + "questionnaireSchedules/wrong"
          })
        ]
      })
    }),
    /invalid document resource name/
  );

  const duplicate = document({ status: "paused", nextSendAt: "2026-07-28" });
  await assert.rejects(
    preflight.listQuestionnaireScheduleDocuments({
      accessToken: "test-access-token",
      fetchImpl: async () => jsonResponse({
        documents: [duplicate, duplicate]
      })
    }),
    /duplicate document resource name/
  );
});

test("body timeout, oversized payload, document cap and total deadline fail closed", async () => {
  await assert.rejects(
    preflight.listQuestionnaireScheduleDocuments({
      accessToken: "test-access-token",
      timeoutMs: 5,
      fetchImpl: async (_url, options) => ({
        ok: true,
        status: 200,
        text: async () => new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true }
          );
        })
      })
    }),
    /unreadable documents body/
  );

  await assert.rejects(
    preflight.listQuestionnaireScheduleDocuments({
      accessToken: "test-access-token",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => "x".repeat(5 * 1024 * 1024 + 1)
      })
    }),
    /response exceeded the safety limit/
  );

  await assert.rejects(
    preflight.listQuestionnaireScheduleDocuments({
      accessToken: "test-access-token",
      maxDocuments: 1,
      fetchImpl: async () => jsonResponse({
        documents: [
          document({ name: document().name.replace("/safe", "/one") }),
          document({ name: document().name.replace("/safe", "/two") })
        ]
      })
    }),
    /document count exceeded the safety limit/
  );

  await assert.rejects(
    preflight.listQuestionnaireScheduleDocuments({
      accessToken: "test-access-token",
      totalTimeoutMs: 1,
      fetchImpl: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return jsonResponse({ documents: [], nextPageToken: "later" });
      }
    }),
    /total time limit/
  );
});

test("the exact questionnaire schedule index must be uniquely READY", () => {
  const expected = {
    name:
      "projects/cfsb-dashboard-coach-aa9a4/databases/(default)/collectionGroups/"
        + "questionnaireSchedules/indexes/exact-index",
    queryScope: "COLLECTION",
    state: "READY",
    fields: [
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "nextSendAt", order: "ASCENDING" },
      { fieldPath: "__name__", order: "ASCENDING" }
    ]
  };
  assert.equal(preflight.isQuestionnaireScheduleIndex(expected), true);
  assert.equal(
    preflight.isQuestionnaireScheduleIndex({
      ...expected,
      fields: expected.fields.slice(0, 2)
    }),
    false,
    "the REST response must include the generated __name__ suffix"
  );
  assert.deepEqual(
    preflight.summarizeQuestionnaireScheduleIndexes([expected]),
    { indexes: 1, matching: 1, ready: 1, building: 0, failed: 0 }
  );
  assert.deepEqual(
    preflight.summarizeQuestionnaireScheduleIndexes([
      { ...expected, state: "CREATING" },
      { ...expected, state: "NEEDS_REPAIR" },
      {
        ...expected,
        fields: [
          { fieldPath: "nextSendAt", order: "ASCENDING" },
          { fieldPath: "status", order: "ASCENDING" }
        ]
      }
    ]),
    { indexes: 3, matching: 2, ready: 0, building: 1, failed: 1 }
  );
  assert.equal(
    preflight.isQuestionnaireScheduleIndex({
      ...expected,
      apiScope: "MONGODB_COMPATIBLE_API"
    }),
    false
  );
  assert.equal(
    preflight.isQuestionnaireScheduleIndex({
      ...expected,
      apiScope: "ANY_API",
      density: "SPARSE_ALL",
      multikey: false,
      shardCount: 0,
      unique: false
    }),
    true,
    "explicit Standard Edition defaults remain an exact match"
  );
  for (const variant of [
    { unique: true },
    { unique: null },
    { multikey: true },
    { multikey: null },
    { shardCount: 1 },
    { shardCount: null },
    { density: "DENSITY_UNSPECIFIED" },
    { density: "SPARSE_ANY" },
    { density: "DENSE" },
    { searchIndexOptions: {} },
    { searchIndexOptions: null }
  ]) {
    assert.equal(
      preflight.isQuestionnaireScheduleIndex({
        ...expected,
        ...variant
      }),
      false,
      `advanced index variant must not match: ${Object.keys(variant)[0]}`
    );
  }
  assert.equal(
    preflight.isQuestionnaireScheduleIndex({
      ...expected,
      fields: [
        {
          fieldPath: "status",
          order: "ASCENDING",
          vectorConfig: { dimension: 2 }
        },
        ...expected.fields.slice(1)
      ]
    }),
    false,
    "field-level index variants must not match the exact directional index"
  );
  assert.equal(
    preflight.isQuestionnaireScheduleIndex({
      ...expected,
      name:
        "projects/cfsb-dashboard-coach-aa9a4/databases/(default)/collectionGroups/"
          + "anotherCollection/indexes/exact-index"
    }),
    false,
    "an identical index from another collection group must not match"
  );
  assert.equal(
    preflight.isQuestionnaireScheduleIndex({
      ...expected,
      fields: [
        { fieldPath: "__name__", order: "ASCENDING" },
        ...expected.fields.slice(0, 2)
      ]
    }),
    false
  );
});

test("index pagination is read-only and fails on malformed responses", async () => {
  const urls = [];
  const result = await preflight.listQuestionnaireScheduleIndexes({
    accessToken: "test-access-token",
    fetchImpl: async (url, options) => {
      urls.push({ url, options });
      return {
        ...jsonResponse(
          urls.length === 1
            ? { indexes: [], nextPageToken: "next-index-page" }
            : { indexes: [] }
        )
      };
    }
  });
  assert.equal(result.pages, 2);
  assert.equal(urls[0].options.method, "GET");
  assert.equal(urls[0].options.body, undefined);
  assert.equal(urls[0].url.origin, "https://firestore.googleapis.com");
  assert.equal(
    urls[0].url.pathname,
    "/v1/projects/cfsb-dashboard-coach-aa9a4/databases/(default)/"
      + "collectionGroups/questionnaireSchedules/indexes"
  );
  assert.equal(
    urls[0].url.searchParams.get("pageSize"),
    "0",
    "Firestore Admin live accepts only the server-default index page size"
  );
  assert.equal(urls[1].url.searchParams.get("pageToken"), "next-index-page");

  await assert.rejects(
    preflight.listQuestionnaireScheduleIndexes({
      accessToken: "test-access-token",
      pageSize: 100,
      fetchImpl: async () => jsonResponse({ indexes: [] })
    }),
    /API-supported value 0/
  );

  await assert.rejects(
    preflight.listQuestionnaireScheduleIndexes({
      accessToken: "test-access-token",
      fetchImpl: async () => jsonResponse({ indexes: "not-an-array" })
    }),
    /invalid indexes collection/
  );
});

test("the scheduler safety window blocks six hours before and ten minutes after 07:15", () => {
  assert.equal(
    preflight.schedulerWindowState(
      new Date("2026-07-28T10:00:00.000Z")
    ).blocked,
    true,
    "06:00 Toronto is inside the protected pre-run window"
  );
  assert.equal(
    preflight.schedulerWindowState(
      new Date("2026-07-28T11:20:00.000Z")
    ).blocked,
    true,
    "07:20 Toronto is inside the protected post-run window"
  );
  assert.equal(
    preflight.schedulerWindowState(
      new Date("2026-07-28T14:00:00.000Z")
    ).blocked,
    false,
    "10:00 Toronto is outside the protected window"
  );
  assert.equal(
    preflight.schedulerWindowState(
      new Date("2026-07-28T05:15:00.000Z")
    ).blocked,
    true,
    "01:15 Toronto is exactly six hours before the run"
  );
  assert.equal(
    preflight.schedulerWindowState(
      new Date("2026-07-28T05:14:00.000Z")
    ).blocked,
    false,
    "01:14 Toronto is outside the six-hour boundary"
  );
  assert.equal(
    preflight.schedulerWindowState(
      new Date("2026-07-28T11:25:00.000Z")
    ).blocked,
    true,
    "07:25 Toronto is exactly ten minutes after the run"
  );
  assert.equal(
    preflight.schedulerWindowState(
      new Date("2026-07-28T11:26:00.000Z")
    ).blocked,
    false,
    "07:26 Toronto is outside the post-run boundary"
  );
  assert.throws(
    () => preflight.schedulerWindowState(
      new Date("2026-07-28T14:00:00.000Z"),
      { beforeMinutes: 359, afterMinutes: 10 }
    ),
    /beforeMinutes/
  );
  assert.throws(
    () => preflight.schedulerWindowState(
      new Date("2026-07-28T14:00:00.000Z"),
      { beforeMinutes: 360, afterMinutes: 9 }
    ),
    /afterMinutes/
  );
});

test("A4 protects through the next Toronto scheduler date", () => {
  const beforeRun = new Date("2026-07-28T10:00:00.000Z");
  const afterRun = new Date("2026-07-28T14:00:00.000Z");
  assert.equal(preflight.schedulerHorizonDate(beforeRun), "2026-07-28");
  assert.equal(preflight.schedulerHorizonDate(afterRun), "2026-07-29");
  assert.equal(
    preflight.schedulerHorizonDate(new Date("2026-11-01T12:14:00.000Z")),
    "2026-11-01",
    "DST fallback day still resolves 07:14 Toronto correctly"
  );
  assert.equal(
    preflight.schedulerHorizonDate(new Date("2026-11-01T12:16:00.000Z")),
    "2026-11-02",
    "DST fallback day advances after 07:15 Toronto"
  );

  const tomorrowSchedule = document({
    status: "active",
    nextSendAt: "2026-07-29"
  });
  assert.equal(
    preflight.summarizeSchedules(
      [tomorrowSchedule],
      preflight.schedulerHorizonDate(afterRun)
    ).activeDue,
    1,
    "a schedule due at the next 07:15 must block index release"
  );
});

test("requiring index READY automatically enforces the horizon and window", () => {
  const readyIndex = {
    name:
      "projects/cfsb-dashboard-coach-aa9a4/databases/(default)/collectionGroups/"
        + "questionnaireSchedules/indexes/exact-index",
    queryScope: "COLLECTION",
    state: "READY",
    fields: [
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "nextSendAt", order: "ASCENDING" },
      { fieldPath: "__name__", order: "ASCENDING" }
    ]
  };
  const options = livePreflight.parseArguments(["--require-index-ready"]);
  const insideWindow = livePreflight.evaluateLiveState({
    documents: [],
    pages: 1,
    indexes: [readyIndex],
    checkedAt: new Date("2026-07-28T10:00:00.000Z"),
    options
  });
  assert.equal(insideWindow.blockedByIndex, false);
  assert.equal(insideWindow.blockedByWindow, true);
  assert.equal(insideWindow.output.ok, false);

  const nextSchedulerBacklog = livePreflight.evaluateLiveState({
    documents: [
      document({ status: "active", nextSendAt: "2026-07-29" })
    ],
    pages: 1,
    indexes: [readyIndex],
    checkedAt: new Date("2026-07-28T14:00:00.000Z"),
    options
  });
  assert.equal(
    nextSchedulerBacklog.output.protectionThroughDateToronto,
    "2026-07-29"
  );
  assert.equal(nextSchedulerBacklog.blockedBySchedules, true);
  assert.equal(nextSchedulerBacklog.output.ok, false);

  const conflictingIndex = {
    ...readyIndex,
    name: readyIndex.name.replace("exact-index", "conflicting-index"),
    unique: true
  };
  const indexConflict = livePreflight.evaluateLiveState({
    documents: [],
    pages: 1,
    indexes: [readyIndex, conflictingIndex],
    checkedAt: new Date("2026-07-28T14:00:00.000Z"),
    options
  });
  assert.equal(indexConflict.output.scheduleIndex.indexes, 2);
  assert.equal(indexConflict.output.scheduleIndex.matching, 1);
  assert.equal(indexConflict.blockedByIndex, true);
  assert.equal(indexConflict.output.ok, false);
});

test("the complete live decision blocks unsafe state without exposing member data", () => {
  const options = livePreflight.parseArguments([
    "--protect-through-next-scheduler",
    "--require-index-ready"
  ]);
  const privateDocument = document({
    name:
      "projects/cfsb-dashboard-coach-aa9a4/databases/(default)/documents/"
        + "questionnaireSchedules/private-member-id",
    status: "active",
    nextSendAt: "2026-07-29",
    extraFields: {
      clientName: { stringValue: "Private Member" },
      clientPhoneNormalized: { stringValue: "4505550101" }
    }
  });
  const evaluation = livePreflight.evaluateLiveState({
    documents: [privateDocument],
    pages: 1,
    indexes: [],
    checkedAt: new Date("2026-07-28T14:00:00.000Z"),
    options
  });
  assert.equal(evaluation.output.ok, false);
  assert.equal(evaluation.blockedBySchedules, true);
  assert.equal(evaluation.blockedByIndex, true);
  assert.equal("scheduleSnapshotSha256" in evaluation.output, false);
  const serialized = JSON.stringify(evaluation.output);
  assert.doesNotMatch(
    serialized,
    /Private Member|4505550101|private-member-id/
  );
});

test("the live decision blocks when a read crosses into the scheduler window", () => {
  const evaluation = livePreflight.evaluateLiveState({
    documents: [],
    pages: 1,
    indexes: null,
    startedAt: new Date("2026-07-28T05:14:00.000Z"),
    checkedAt: new Date("2026-07-28T05:15:00.000Z"),
    options: livePreflight.parseArguments([
      "--require-safe-scheduler-window"
    ])
  });
  assert.equal(evaluation.output.ok, false);
  assert.equal(evaluation.blockedByWindow, true);
  assert.equal(evaluation.output.schedulerWindow.startedBlocked, false);
  assert.equal(evaluation.output.schedulerWindow.completedBlocked, true);
});

test("authentication failures are sanitized and unsupported bypasses are rejected", () => {
  const sensitive =
    "invalid token ya29.secret for private@example.com; login --reauth";
  const reason = livePreflight.safeFailureReason(new Error(sensitive));
  assert.match(reason, /authentication/i);
  assert.doesNotMatch(reason, /ya29|private@example\.com|secret/);
  assert.throws(
    () => livePreflight.parseArguments(["--force"]),
    /unsupported preflight argument/
  );
  assert.throws(
    () => livePreflight.parseArguments([
      "--require-safe-scheduler-window",
      "--scheduler-window-before-minutes=0"
    ]),
    /unsupported preflight argument/
  );
  const indexReadyOptions = livePreflight.parseArguments([
    "--require-index-ready"
  ]);
  assert.equal(indexReadyOptions.requireIndexReady, true);
  assert.equal(indexReadyOptions.requireSafeWindow, true);
  assert.equal(indexReadyOptions.protectThroughNextScheduler, true);
  const childEnvironment = livePreflight.childEnvironmentWithoutSecrets({
    Path: "C:\\safe",
    firebase_token: "secret-firebase-token",
    Ghl_Private_Token: "secret-ghl-token",
    DASHBOARD_import_TOKEN: "secret-import-token"
  });
  assert.equal(childEnvironment.Path, "C:\\safe");
  assert.deepEqual(Object.keys(childEnvironment), ["Path"]);
  assert.equal(childEnvironment.FIREBASE_TOKEN, undefined);
  assert.equal(childEnvironment.firebase_token, undefined);
  assert.equal(childEnvironment.Ghl_Private_Token, undefined);
  assert.equal(childEnvironment.DASHBOARD_import_TOKEN, undefined);
});

test("sealed worktree proof accepts only the exact clean commit", () => {
  const commit = "a".repeat(40);
  const calls = [];
  const spawnImpl = (_command, args) => {
    calls.push(args);
    const operation = args.join(" ");
    if (operation === "rev-parse --show-toplevel") {
      return { status: 0, stdout: `${root}\n` };
    }
    if (operation === "rev-parse --verify HEAD^{commit}") {
      return { status: 0, stdout: `${commit}\n` };
    }
    if (operation === "status --porcelain=v1 --untracked-files=all") {
      return { status: 0, stdout: "" };
    }
    return { status: 1, stdout: "" };
  };

  assert.deepEqual(
    sealedWorktree.verifySealedWorktree({
      expectedCommit: commit,
      rootDir: root,
      spawnImpl
    }),
    {
      ok: true,
      check: "sealed_questionnaire_release_worktree",
      commit,
      worktreeClean: true
    }
  );
  assert.deepEqual(calls, [
    ["rev-parse", "--show-toplevel"],
    ["rev-parse", "--verify", "HEAD^{commit}"],
    ["status", "--porcelain=v1", "--untracked-files=all"]
  ]);
});

test("sealed worktree proof fails closed on Git errors or dirty state", () => {
  const commit = "b".repeat(40);
  const spawnWith = ({ headStatus = 0, statusStatus = 0, statusOutput = "" }) =>
    (_command, args) => {
      const operation = args.join(" ");
      if (operation === "rev-parse --show-toplevel") {
        return { status: 0, stdout: `${root}\n` };
      }
      if (operation === "rev-parse --verify HEAD^{commit}") {
        return { status: headStatus, stdout: `${commit}\n` };
      }
      if (operation === "status --porcelain=v1 --untracked-files=all") {
        return {
          status: statusStatus,
          stdout: statusOutput,
          error: statusStatus === 0 ? undefined : new Error("git failed")
        };
      }
      return { status: 1, stdout: "" };
    };

  assert.equal(
    sealedWorktree.verifySealedWorktree({
      expectedCommit: "not-a-sha",
      rootDir: root,
      spawnImpl: spawnWith({})
    }).error,
    "expected_commit_invalid"
  );
  assert.equal(
    sealedWorktree.verifySealedWorktree({
      expectedCommit: commit,
      rootDir: root,
      spawnImpl: spawnWith({ headStatus: 1 })
    }).error,
    "git_head_unavailable"
  );
  assert.equal(
    sealedWorktree.verifySealedWorktree({
      expectedCommit: commit,
      rootDir: root,
      spawnImpl: spawnWith({ statusStatus: 1 })
    }).error,
    "git_status_unavailable"
  );

  const privateFilename = "private-member-phone-4505550101.txt";
  const dirty = sealedWorktree.verifySealedWorktree({
    expectedCommit: commit,
    rootDir: root,
    spawnImpl: spawnWith({
      statusOutput: `?? ${privateFilename}\n M another-private-file.txt\n`
    })
  });
  assert.deepEqual(dirty, {
    ok: false,
    check: "sealed_questionnaire_release_worktree",
    error: "worktree_not_clean",
    changedEntries: 2
  });
  assert.doesNotMatch(JSON.stringify(dirty), /private-member|4505550101/);
});
