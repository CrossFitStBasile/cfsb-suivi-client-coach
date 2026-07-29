import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = require(
  path.join(root, "tools", "questionnaire-pre-release-state-lib.cjs")
);
const rollbackLib = require(
  path.join(root, "tools", "rollback-questionnaire-pre-release-state.cjs")
);
const indexLib = require(
  path.join(root, "tools", "questionnaire-stage-a-preflight-lib.cjs")
);

const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);
const PLAN_HASH = "c".repeat(64);
const TIME = "2026-07-29T20:00:00.000Z";

function hostingFixture() {
  const versionName =
    `sites/${lib.SITE_ID}/versions/pre-release-version`;
  return {
    channel: {
      name: `sites/${lib.SITE_ID}/channels/live`,
      release: {
        name:
          `sites/${lib.SITE_ID}/channels/live/releases/pre-release-release`,
        type: "DEPLOY",
        releaseTime: TIME,
        version: { name: versionName },
        releaseUser: { email: "must-not-enter-receipt@example.test" }
      }
    },
    version: {
      name: versionName,
      status: "FINALIZED",
      createTime: TIME,
      finalizeTime: TIME,
      fileCount: "42",
      versionBytes: "123456",
      config: {
        rewrites: [{ glob: "**", path: "/index.html" }]
      },
      createUser: { email: "must-not-enter-receipt@example.test" }
    }
  };
}

function rulesFixture() {
  const rulesetName = `projects/${lib.PROJECT_ID}/rulesets/ruleset-before`;
  return {
    release: {
      name: lib.FIRESTORE_RELEASE_NAME,
      rulesetName,
      createTime: TIME,
      updateTime: TIME
    },
    ruleset: {
      name: rulesetName,
      createTime: TIME,
      source: {
        files: [
          {
            name: "firestore.rules",
            content:
              "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read: if false; } } }"
          }
        ]
      }
    }
  };
}

function functionFixture(entry, sequence) {
  const serviceId = entry.functionId.toLowerCase();
  const service =
    `projects/${lib.PROJECT_NUMBER}/locations/${lib.REGION}/services/`
      + serviceId;
  const revision = `${serviceId}-0000${sequence}-abc`;
  return {
    functionValue: {
      name:
        `projects/${lib.PROJECT_ID}/locations/${lib.REGION}/functions/`
          + entry.functionId,
      state: "ACTIVE",
      environment: "GEN_2",
      updateTime: TIME,
      buildConfig: {
        build:
          `projects/${lib.PROJECT_NUMBER}/locations/${lib.REGION}/builds/`
            + `build-${sequence}`,
        sourceProvenance: {
          resolvedStorageSource: {
            bucket: "functions-sources",
            object: `source-${sequence}.zip`,
            generation: String(sequence)
          }
        }
      },
      serviceConfig: {
        revision,
        service,
        allTrafficOnLatestRevision: true
      }
    },
    cloudRunService: {
      name: service,
      generation: String(sequence),
      observedGeneration: String(sequence),
      reconciling: false,
      latestReadyRevision: revision,
      latestCreatedRevision: revision,
      terminalCondition: { state: "CONDITION_SUCCEEDED" },
      trafficStatuses: [
        {
          type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST",
          revision,
          percent: 100
        }
      ],
      creator: "must-not-enter-receipt@example.test"
    },
    cloudRunRevision: {
      name: `${service}/revisions/${revision}`,
      createTime: TIME,
      containers: [
        {
          image:
            `us-docker.pkg.dev/${lib.PROJECT_ID}/gcf-artifacts/`
              + `${serviceId}@sha256:${String(sequence).padStart(64, "0")}`,
          env: [
            { name: "MUST_NOT_ENTER_RECEIPT", value: "private-value" }
          ]
        }
      ]
    }
  };
}

function indexFixture(state = "READY") {
  return {
    name:
      `projects/${lib.PROJECT_ID}/databases/(default)/collectionGroups/`
        + "questionnaireSchedules/indexes/exact-index",
    queryScope: "COLLECTION",
    state,
    fields: [
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "nextSendAt", order: "ASCENDING" },
      { fieldPath: "__name__", order: "ASCENDING" }
    ]
  };
}

function stateFixture() {
  const hostingRaw = hostingFixture();
  const rulesRaw = rulesFixture();
  const functions = lib.SNAPSHOT_FUNCTIONS.map((entry, index) => {
    const raw = functionFixture(entry, index + 1);
    return lib.sanitizeFunction(
      raw.functionValue,
      raw.cloudRunService,
      raw.cloudRunRevision,
      entry
    );
  });
  return lib.buildState({
    hosting: lib.sanitizeHosting(
      hostingRaw.channel,
      hostingRaw.version
    ),
    firestoreRules: lib.sanitizeRules(
      rulesRaw.release,
      rulesRaw.ruleset
    ),
    functions,
    schedulerIndex: lib.sanitizeSchedulerIndex([indexFixture()], {
      isQuestionnaireScheduleIndex:
        indexLib.isQuestionnaireScheduleIndex,
      summarizeQuestionnaireScheduleIndexes:
        indexLib.summarizeQuestionnaireScheduleIndexes
    }),
    a3AdditiveAbsence: lib.sealA3AdditiveAbsence({
      functionAbsent: true,
      schedulerJobAbsent: true
    })
  });
}

test("le scellage et la preuve A4 read-only sont liés à un SHA", () => {
  assert.deepEqual(
    lib.parseSealArgs([`--release-commit=${COMMIT_A}`, "--preview"]),
    { releaseCommit: COMMIT_A, planHash: "", mode: "preview" }
  );
  assert.deepEqual(
    lib.parseSealArgs([
      `--release-commit=${COMMIT_A}`,
      `--plan-hash=${PLAN_HASH}`,
      "--record"
    ]),
    { releaseCommit: COMMIT_A, planHash: PLAN_HASH, mode: "record" }
  );
  assert.deepEqual(
    lib.parseSealArgs([
      `--release-commit=${COMMIT_A}`,
      `--plan-hash=${PLAN_HASH}`,
      "--verify"
    ]),
    { releaseCommit: COMMIT_A, planHash: PLAN_HASH, mode: "verify" }
  );
  assert.deepEqual(
    lib.parseSealArgs([
      `--release-commit=${COMMIT_A}`,
      `--plan-hash=${PLAN_HASH}`,
      "--verify-receipt"
    ]),
    {
      releaseCommit: COMMIT_A,
      planHash: PLAN_HASH,
      mode: "verify-receipt"
    }
  );
  assert.deepEqual(
    lib.parseSealArgs([
      `--release-commit=${COMMIT_A}`,
      `--plan-hash=${PLAN_HASH}`,
      "--verify-index-ready"
    ]),
    {
      releaseCommit: COMMIT_A,
      planHash: PLAN_HASH,
      mode: "verify-index-ready"
    }
  );
  assert.throws(
    () => lib.parseSealArgs([`--release-commit=${COMMIT_A}`, "--execute"]),
    /argument_unknown/
  );
  for (const mode of [
    "--record",
    "--verify",
    "--verify-receipt",
    "--verify-index-ready"
  ]) {
    assert.throws(
      () => lib.parseSealArgs([`--release-commit=${COMMIT_A}`, mode]),
      /plan_hash_invalid/
    );
  }
  assert.throws(
    () => lib.parseSealArgs([
      `--release-commit=${COMMIT_A}`,
      `--plan-hash=${PLAN_HASH}`,
      "--preview"
    ]),
    /plan_hash_not_allowed/
  );
});

test("la vérification locale échoue fermée sans reçu durable", (t) => {
  const receiptRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "cfsb-pre-release-receipt-missing-")
  );
  t.after(() => fs.rmSync(receiptRoot, { recursive: true, force: true }));
  assert.throws(
    () => lib.readReceipt(COMMIT_A, {
      CFSB_QUESTIONNAIRE_ROLLBACK_DIR: receiptRoot
    }),
    /pre_release_receipt_missing/
  );
});

test("le snapshot scelle exactement les sept fonctions A2 et les sept A3", () => {
  assert.equal(lib.A2_FUNCTION_IDS.length, 7);
  assert.deepEqual(lib.A3_FUNCTION_IDS, [
    "sendQuestionnaire",
    "processQuestionnaireSendRequest",
    "scheduledQuestionnaireSendPlans",
    "syncDashboardFromSheets",
    "scheduledDashboardSync",
    "scheduledQuestionnaireResponseSync",
    "processSyncRequest"
  ]);
  const receipt = lib.buildReceipt({
    releaseCommit: COMMIT_A,
    recordedAt: TIME,
    state: stateFixture()
  });
  assert.equal(receipt.state.functions.length, 14);
  assert.equal(
    receipt.state.functions.filter((item) => item.releaseScope === "A2")
      .length,
    7
  );
  assert.equal(
    receipt.state.functions.filter(
      (item) => item.releaseScope === "A3"
    ).length,
    7
  );
  assert.deepEqual(receipt.state.a3AdditiveAbsence, {
    functionId: "scheduledQuestionnaireSendRecovery",
    functionName: lib.A3_ADDITIVE_FUNCTION_NAME,
    schedulerJobName: lib.A3_ADDITIVE_SCHEDULER_JOB_NAME
  });
});

test("le snapshot refuse si la Function additive ou son job existe déjà", () => {
  assert.throws(
    () => lib.sealA3AdditiveAbsence({
      functionAbsent: false,
      schedulerJobAbsent: true
    }),
    /live_a3_additive_resource_not_absent/
  );
  assert.throws(
    () => lib.sealA3AdditiveAbsence({
      functionAbsent: true,
      schedulerJobAbsent: false
    }),
    /live_a3_additive_resource_not_absent/
  );
});

test("la suppression A3 n'accepte que la paire Function/job exacte", () => {
  const uri =
    "https://scheduledquestionnairesendrecovery-example-uc.a.run.app";
  const serviceAccountEmail =
    "129233025317-compute@developer.gserviceaccount.com";
  const functionValue = {
    name: lib.A3_ADDITIVE_FUNCTION_NAME,
    environment: "GEN_2",
    state: "ACTIVE",
    buildConfig: {
      entryPoint: lib.A3_ADDITIVE_FUNCTION_ID,
      runtime: "nodejs22"
    },
    serviceConfig: {
      service:
        `projects/${lib.PROJECT_ID}/locations/${lib.REGION}/services/`
          + lib.A3_ADDITIVE_FUNCTION_ID.toLowerCase(),
      uri,
      serviceAccountEmail,
      timeoutSeconds: 120,
      availableMemory: "512Mi",
      secretEnvironmentVariables: [{ key: "GHL_PRIVATE_TOKEN" }]
    },
    labels: {
      "deployment-tool": "cli-firebase",
      "deployment-scheduled": "true"
    }
  };
  const schedulerJob = {
    name: lib.A3_ADDITIVE_SCHEDULER_JOB_NAME,
    schedule: "every 10 minutes",
    timeZone: "America/Toronto",
    state: "ENABLED",
    attemptDeadline: "180s",
    httpTarget: {
      uri: lib.A3_ADDITIVE_SCHEDULER_URI,
      httpMethod: "POST",
      oidcToken: {
        serviceAccountEmail,
        audience: lib.A3_ADDITIVE_SCHEDULER_URI
      }
    }
  };
  assert.equal(
    lib.validateA3AdditiveLivePair(functionValue, schedulerJob),
    true
  );
  assert.throws(
    () => lib.validateA3AdditiveLivePair(
      functionValue,
      { ...schedulerJob, schedule: "every 5 minutes" }
    ),
    /live_a3_additive_resource_config_invalid/
  );
  assert.throws(
    () => lib.validateA3AdditiveLivePair(
      functionValue,
      {
        ...schedulerJob,
        httpTarget: {
          ...schedulerJob.httpTarget,
          uri: "https://foreign.example.test"
        }
      }
    ),
    /live_a3_additive_resource_config_invalid/
  );
});

test("les réponses Cloud Run acceptent le nom de révision court ou pleinement qualifié", () => {
  const entry = lib.SNAPSHOT_FUNCTIONS[0];
  const raw = functionFixture(entry, 9);
  const fullRevision =
    `${raw.functionValue.serviceConfig.service}/revisions/`
      + raw.functionValue.serviceConfig.revision;
  raw.cloudRunService.latestReadyRevision = fullRevision;
  raw.cloudRunService.latestCreatedRevision = fullRevision;
  raw.cloudRunService.trafficStatuses[0].revision = fullRevision;
  assert.doesNotThrow(() =>
    lib.sanitizeFunction(
      raw.functionValue,
      raw.cloudRunService,
      raw.cloudRunRevision,
      entry
    )
  );
});

test("un trafic LATEST sans champ revision se résout par latestReadyRevision", () => {
  const entry = lib.SNAPSHOT_FUNCTIONS[0];
  const raw = functionFixture(entry, 10);
  delete raw.cloudRunService.trafficStatuses[0].revision;
  assert.doesNotThrow(() =>
    lib.sanitizeFunction(
      raw.functionValue,
      raw.cloudRunService,
      raw.cloudRunRevision,
      entry
    )
  );
  raw.cloudRunService.trafficStatuses[0].type =
    "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION";
  assert.throws(
    () => lib.sanitizeFunction(
      raw.functionValue,
      raw.cloudRunService,
      raw.cloudRunRevision,
      entry
    ),
    /live_function_revision_invalid/
  );
});

test("Cloud Run peut omettre reconciling=false sans affaiblir les autres preuves", () => {
  const entry = lib.SNAPSHOT_FUNCTIONS[0];
  const raw = functionFixture(entry, 11);
  delete raw.cloudRunService.reconciling;
  assert.doesNotThrow(() =>
    lib.sanitizeFunction(
      raw.functionValue,
      raw.cloudRunService,
      raw.cloudRunRevision,
      entry
    )
  );
  raw.cloudRunService.reconciling = true;
  assert.throws(
    () => lib.sanitizeFunction(
      raw.functionValue,
      raw.cloudRunService,
      raw.cloudRunRevision,
      entry
    ),
    /live_function_revision_invalid/
  );
});

test("le reçu ne conserve ni courriel, ni environnement, ni source de règles", () => {
  const receipt = lib.buildReceipt({
    releaseCommit: COMMIT_A,
    recordedAt: TIME,
    state: stateFixture()
  });
  const serialized = JSON.stringify(receipt);
  assert.ok(!serialized.includes("@"));
  assert.ok(!serialized.includes("private-value"));
  assert.ok(!serialized.includes("rules_version"));
  assert.match(receipt.state.firestoreRules.sourceHash, /^[a-f0-9]{64}$/);
  assert.match(receipt.state.hosting.configHash, /^[a-f0-9]{64}$/);
});

test("le planHash est lié au SHA et toute altération du reçu est refusée", () => {
  const state = stateFixture();
  const first = lib.buildReceipt({
    releaseCommit: COMMIT_A,
    recordedAt: TIME,
    state
  });
  const second = lib.buildReceipt({
    releaseCommit: COMMIT_B,
    recordedAt: TIME,
    state
  });
  assert.notEqual(first.planHash, second.planHash);
  assert.doesNotThrow(() =>
    lib.validateReceipt(first, {
      releaseCommit: COMMIT_A,
      planHash: first.planHash
    })
  );
  const altered = structuredClone(first);
  altered.state.hosting.fileCount = "99";
  assert.throws(
    () => lib.validateReceipt(altered, { releaseCommit: COMMIT_A }),
    /pre_release_receipt_invalid/
  );
});

test("un reçu recomputé ne peut jamais cibler un autre service ou ruleset", () => {
  const functionRedirect = structuredClone(stateFixture());
  functionRedirect.functions[0].service =
    "projects/another-project/locations/us-central1/services/foreign";
  assert.throws(
    () => lib.buildReceipt({
      releaseCommit: COMMIT_A,
      recordedAt: TIME,
      state: functionRedirect
    }),
    /pre_release_function_state_invalid/
  );

  const rulesRedirect = structuredClone(stateFixture());
  rulesRedirect.firestoreRules.rulesetName =
    "projects/another-project/rulesets/foreign";
  assert.throws(
    () => lib.buildReceipt({
      releaseCommit: COMMIT_A,
      recordedAt: TIME,
      state: rulesRedirect
    }),
    /pre_release_rules_state_invalid/
  );
});

test("le plan de rollback sélectionne uniquement les scopes exacts demandés", () => {
  const receipt = lib.buildReceipt({
    releaseCommit: COMMIT_A,
    recordedAt: TIME,
    state: stateFixture()
  });
  const a2 = lib.buildRollbackPlan(receipt, ["a2", "hosting", "rules"]);
  assert.equal(a2.functions.length, 7);
  assert.ok(a2.hosting);
  assert.ok(a2.firestoreRules);
  assert.ok(a2.functions.every((item) => item.releaseScope === "A2"));

  const a3 = lib.buildRollbackPlan(receipt, ["a3"]);
  assert.equal(a3.functions.length, 7);
  assert.deepEqual(
    a3.functions.map((item) => item.functionId),
    lib.A3_FUNCTION_IDS
  );
  assert.deepEqual(a3.a3AdditiveRemoval, {
    functionId: "scheduledQuestionnaireSendRecovery",
    functionName: lib.A3_ADDITIVE_FUNCTION_NAME,
    schedulerJobName: lib.A3_ADDITIVE_SCHEDULER_JOB_NAME
  });
  assert.equal(a3.hosting, null);
  assert.equal(a3.firestoreRules, null);
});

test("la postcondition trafic exige une révision unique à 100 % et un service stable", () => {
  const receipt = lib.buildReceipt({
    releaseCommit: COMMIT_A,
    recordedAt: TIME,
    state: stateFixture()
  });
  const target = lib.buildRollbackPlan(receipt, ["a3"]).functions[0];
  const service = {
    name: target.service,
    generation: "42",
    observedGeneration: "42",
    terminalCondition: { state: "CONDITION_SUCCEEDED" },
    trafficStatuses: [
      {
        type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
        revision: target.revision,
        percent: 100
      }
    ]
  };
  assert.equal(rollbackLib.exactRevisionTraffic(service, target), true);
  assert.equal(
    rollbackLib.exactRevisionTraffic(
      { ...service, observedGeneration: "41" },
      target
    ),
    false
  );
  assert.equal(
    rollbackLib.exactRevisionTraffic(
      {
        ...service,
        trafficStatuses: [
          service.trafficStatuses[0],
          {
            type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
            revision: "another-revision",
            percent: 0
          }
        ]
      },
      target
    ),
    false
  );
});

test("le rollback exige SHA, planHash et au moins un scope exact", () => {
  const parsed = lib.parseRollbackArgs([
    `--release-commit=${COMMIT_A}`,
    `--plan-hash=${"c".repeat(64)}`,
    "--scope=a3",
    "--scope=hosting",
    "--execute"
  ]);
  assert.deepEqual(parsed.scopes, ["a3", "hosting"]);
  assert.throws(
    () => lib.parseRollbackArgs([
      `--release-commit=${COMMIT_A}`,
      `--plan-hash=${"c".repeat(64)}`,
      "--execute"
    ]),
    /rollback_scope_missing/
  );
  assert.throws(
    () => lib.parseRollbackArgs([
      `--release-commit=${COMMIT_A}`,
      `--plan-hash=${"c".repeat(64)}`,
      "--scope=indexes",
      "--execute"
    ]),
    /rollback_scope_invalid/
  );
  assert.throws(
    () => lib.parseRollbackArgs([
      `--release-commit=${COMMIT_A}`,
      `--plan-hash=${"c".repeat(64)}`,
      "--scope=send",
      "--execute"
    ]),
    /rollback_scope_invalid/
  );
});

test("A4 doit être l'unique index exact READY et ne produit aucun plan de déploiement", () => {
  const exact = lib.sanitizeSchedulerIndex([indexFixture()], {
    isQuestionnaireScheduleIndex:
      indexLib.isQuestionnaireScheduleIndex,
    summarizeQuestionnaireScheduleIndexes:
      indexLib.summarizeQuestionnaireScheduleIndexes
  });
  assert.equal(exact.state, "READY");
  assert.throws(
    () => lib.sanitizeSchedulerIndex([indexFixture("CREATING")], {
      isQuestionnaireScheduleIndex:
        indexLib.isQuestionnaireScheduleIndex,
      summarizeQuestionnaireScheduleIndexes:
        indexLib.summarizeQuestionnaireScheduleIndexes
    }),
    /questionnaire_schedule_index_not_uniquely_ready/
  );
  assert.throws(
    () => lib.sanitizeSchedulerIndex(
      [
        indexFixture(),
        {
          ...indexFixture(),
          name: indexFixture().name.replace("exact-index", "extra-index"),
          fields: [
            { fieldPath: "status", order: "ASCENDING" },
            { fieldPath: "createdAt", order: "DESCENDING" },
            { fieldPath: "__name__", order: "DESCENDING" }
          ]
        }
      ],
      {
        isQuestionnaireScheduleIndex:
          indexLib.isQuestionnaireScheduleIndex,
        summarizeQuestionnaireScheduleIndexes:
          indexLib.summarizeQuestionnaireScheduleIndexes
      }
    ),
    /questionnaire_schedule_index_not_uniquely_ready/
  );
});

test("les runners sont scellés, non bavards et gardent les mutations derrière deux preuves", () => {
  const sealSource = fs.readFileSync(
    path.join(root, "tools", "seal-questionnaire-pre-release-state.cjs"),
    "utf8"
  );
  const rollbackSource = fs.readFileSync(
    path.join(root, "tools", "rollback-questionnaire-pre-release-state.cjs"),
    "utf8"
  );
  assert.match(sealSource, /verifySealedCandidate\(options\.releaseCommit\)/);
  assert.match(sealSource, /externalWrites:\s*0/);
  assert.match(rollbackSource, /CFSB_QUESTIONNAIRE_ROLLBACK_GO/);
  assert.match(rollbackSource, /CFSB_QUESTIONNAIRE_ROLLBACK_PLAN_HASH/);
  assert.match(rollbackSource, /updateMask", "traffic"/);
  assert.match(rollbackSource, /updateMask:\s*"rulesetName"/);
  assert.match(rollbackSource, /versionName/);
  assert.match(
    rollbackSource,
    /"functions:delete",\s+target\.functionId/
  );
  assert.match(rollbackSource, /"--region",\s+lib\.REGION/);
  assert.match(rollbackSource, /"--force"/);
  assert.match(rollbackSource, /verifyRollbackAuthority\(options\)/);
  assert.match(
    rollbackSource,
    /waitForA3AdditiveAbsence\([\s\S]*plan\.a3AdditiveRemoval/
  );
  assert.ok(
    rollbackSource.indexOf("verifyTargetsExist(plan, receipt, accessToken)")
      < rollbackSource.indexOf('options.mode === "execute"')
  );
  assert.ok(
    rollbackSource.indexOf(
      "await verifyFunctionTraffic(a3Targets, accessToken)"
    ) < rollbackSource.indexOf(
      "deleteA3AdditiveFunctionWithFirebaseCli("
    )
  );
});

test("le runbook interdit le redeploy A4 et utilise le snapshot exact pour A3", () => {
  const runbook = fs.readFileSync(
    path.join(
      root,
      "firebase-dashboard",
      "QUESTIONNAIRE_RELEASE_RUNBOOK_20260728.md"
    ),
    "utf8"
  );
  assert.match(
    runbook,
    /A4 — index du Scheduler déjà `READY`, vérification seulement/
  );
  assert.match(
    runbook,
    /Ne lancer ni `deploy-questionnaire-stage-a\.cmd indexes`/
  );
  assert.match(runbook, /--verify-index-ready/);
  assert.match(runbook, /--scope=a3/);
  assert.match(
    runbook,
    /les sept révisions A3 pré-release exactes/
  );
  assert.match(
    runbook,
    /restaure et vérifie d'abord 100 % du trafic des sept services A3/
  );
  assert.match(
    runbook,
    /Function `scheduledQuestionnaireSendRecovery`\s+et son job Cloud Scheduler/
  );
  assert.match(
    runbook,
    /L'archive Git historique reste un secours séparé/
  );
  assert.doesNotMatch(
    runbook,
    /functions:delete scheduledQuestionnaireSendRecovery/
  );
});
