import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const release = require("../tools/reperes-v2-release-lib.cjs");
const activation = require("../tools/reperes-v2-ghl-activation-lib.cjs");
const studio = require("../functions/questionnaire-studio.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runnerSource = fs.readFileSync(
  path.join(root, "tools", "activate-reperes-v2-ghl.cjs"),
  "utf8"
);
const librarySource = fs.readFileSync(
  path.join(root, "tools", "reperes-v2-ghl-activation-lib.cjs"),
  "utf8"
);
const TEST_V1_PUBLISHED_AT = "2026-07-23T00:00:00.000Z";
const OTHER_COMMIT = "ad6c0a9f300f78c5a6e6d22a1d34c436df455f1f";
const PUBLICATION_TIME = "2026-07-29T19:44:00.000Z";
const ACTIVATION_TIME = "2026-07-29T23:05:00.000Z";

function makeDoc(name, value, suffix) {
  return {
    name,
    createTime: `2026-07-29T18:00:${suffix}.000Z`,
    updateTime: `2026-07-29T18:01:${suffix}.000Z`,
    value: structuredClone(value)
  };
}

function legacyV1Draft() {
  const draft = structuredClone(studio.INITIAL_DRAFTS.educationalBenchmarks);
  draft.description =
    "Une expérience éducative pour mesurer quelques habitudes concrètes, les comparer à des repères simples et choisir un prochain petit pas.";
  const fields = draft.sections.flatMap((section) => section.fields);
  const sleepRegularity = fields.find(
    (field) => field.id === "sleep_regular_nights"
  );
  const completeMeals = fields.find(
    (field) => field.id === "complete_meals_day"
  );
  const water = fields.find((field) => field.id === "water_liters_day");
  assert.ok(sleepRegularity);
  assert.ok(completeMeals);
  assert.ok(water);
  delete sleepRegularity.helpText;
  completeMeals.helpText =
    "Ici, un repas complet contient généralement une source de protéines, des végétaux ou fruits et une source d'énergie adaptée.";
  water.helpText =
    "Cette mesure sert de point de départ. Les besoins varient beaucoup selon la taille, la chaleur, la transpiration, l'alimentation, la grossesse et la santé.";
  for (const field of [sleepRegularity, completeMeals, water]) {
    for (const band of field.feedback.bands) {
      const message = band.message.replace(/^Repère interne CFSB:\s*/u, "");
      band.message = `${message.charAt(0).toUpperCase()}${message.slice(1)}`;
    }
  }
  return studio.normalizeDraft(draft);
}

function testV1Definition() {
  const definition = studio.publishDraft(legacyV1Draft(), {
    version: "1",
    publishedAt: TEST_V1_PUBLISHED_AT
  });
  assert.equal(definition.versionHash, release.EXPECTED_V1_HASH);
  return definition;
}

function makeV1State() {
  const candidate = release.buildCandidate();
  const names = release.documentNames(candidate);
  const definition = testV1Definition();
  const draft = release.draftFromDefinition(definition);
  const fingerprint = release.draftFingerprint(draft);
  const publicUrl = `${release.PUBLIC_ORIGIN}${definition.canonicalPath}`;
  const form = {
    formId: release.FORM_ID,
    legacyType: "",
    shortLabel: "Repères CFSB",
    slug: release.SLUG,
    slugLocked: true,
    title: definition.title,
    description: definition.description,
    ghlTag: definition.ghlTag,
    deliveryReady: true,
    status: "published",
    draft,
    draftRevision: 1,
    draftFingerprint: fingerprint,
    activeDraftFingerprint: fingerprint,
    hasUnpublishedChanges: false,
    versionNumber: 1,
    activeVersion: "1",
    activeVersionId: release.V1_VERSION_ID,
    activeVersionHash: definition.versionHash,
    publicPath: definition.canonicalPath,
    publicUrl,
    publishedAt: "2026-07-23T00:00:01.000Z",
    publishedByUid: "admin-test",
    updatedAt: "2026-07-23T00:00:01.000Z",
    updatedByUid: "admin-test"
  };
  const catalog = {
    formId: release.FORM_ID,
    legacyType: "",
    status: "published",
    label: definition.title,
    title: definition.title,
    shortLabel: "Repères CFSB",
    description: definition.description,
    slug: definition.slug,
    ghlTag: definition.ghlTag,
    publicPath: definition.canonicalPath,
    publicUrl,
    activeVersionId: release.V1_VERSION_ID,
    activeVersion: "1",
    activeVersionHash: definition.versionHash,
    responsePolicy: definition.responsePolicy,
    settings: definition.settings,
    deliveryReady: true,
    updatedAt: "2026-07-23T00:00:01.000Z"
  };
  return {
    form: makeDoc(names.form, form, "01"),
    catalog: makeDoc(names.catalog, catalog, "02"),
    slug: makeDoc(names.slug, {
      slug: release.SLUG,
      formId: release.FORM_ID,
      versionId: release.V1_VERSION_ID,
      version: "1",
      status: "published",
      updatedAt: "2026-07-23T00:00:01.000Z"
    }, "03"),
    v1: makeDoc(names.v1, {
      formId: release.FORM_ID,
      versionId: release.V1_VERSION_ID,
      version: "1",
      definition,
      versionHash: definition.versionHash,
      publishedAt: definition.publishedAt,
      createdAt: "2026-07-23T00:00:01.000Z",
      createdByUid: "admin-test"
    }, "04"),
    v2: null,
    tag: makeDoc(names.tag, {
      normalizedTag: definition.ghlTag.toLowerCase(),
      ghlTag: definition.ghlTag,
      formId: release.FORM_ID,
      status: "reserved",
      updatedAt: "2026-07-23T00:00:01.000Z"
    }, "05"),
    publishAudit: null,
    rollbackAudit: null,
    deliveryAudit: null
  };
}

function applyWriteFields(targetValue, write, requestTime) {
  const decoded = release.decodeFirestoreFields(write.update.fields);
  const value = write.updateMask ? { ...targetValue, ...decoded } : decoded;
  for (const transform of write.updateTransforms || []) {
    if (transform.setToServerValue === "REQUEST_TIME") {
      value[transform.fieldPath] = requestTime;
    }
  }
  return value;
}

function applyPlan(state, plan, requestTime) {
  const next = structuredClone(state);
  const names = activation.documentNames();
  const keyByName = new Map(
    Object.entries(names).map(([key, name]) => [name, key])
  );
  for (const write of plan.writes) {
    if (write.verify) continue;
    if (write.delete) {
      const key = keyByName.get(write.delete);
      assert.ok(key, `document de test inconnu: ${write.delete}`);
      assert.equal(next[key], null);
      continue;
    }
    const name = write.update.name;
    const key = keyByName.get(name);
    assert.ok(key, `document de test inconnu: ${name}`);
    const existing = next[key];
    if ((plan.guardedDocuments || []).includes(name)) {
      assert.ok(existing);
      assert.deepEqual(
        applyWriteFields(existing.value, write, requestTime),
        existing.value,
        `la garde doit être une mise à jour sans changement: ${name}`
      );
      continue;
    }
    next[key] = {
      name,
      createTime: existing?.createTime || requestTime,
      updateTime: requestTime,
      value: applyWriteFields(existing?.value || {}, write, requestTime)
    };
  }
  return next;
}

function makePublishedV2State() {
  const candidate = release.buildCandidate();
  const v1 = makeV1State();
  const plan = release.buildPublicationPlan(v1, candidate, {
    releaseCommit: activation.RELEASE_COMMIT,
    toolingCommit: "5d6c0a9f300f78c5a6e6d22a1d34c436df455f1f"
  });
  return applyPlan(v1, plan, PUBLICATION_TIME);
}

function makeActivatedState() {
  const candidate = release.buildCandidate();
  const initial = makePublishedV2State();
  const plan = activation.buildActivationPlan(initial, candidate, {
    releaseCommit: activation.RELEASE_COMMIT
  });
  return {
    candidate,
    initial,
    plan,
    activated: applyPlan(initial, plan, ACTIVATION_TIME)
  };
}

test("le runner exige le SHA live exact et un mode unique", () => {
  assert.equal(
    activation.RELEASE_COMMIT,
    "9d6c0a9f300f78c5a6e6d22a1d34c436df455f1f"
  );
  for (const mode of activation.MODES) {
    assert.deepEqual(
      activation.parseArgs([
        `--release-commit=${activation.RELEASE_COMMIT}`,
        `--${mode}`
      ]),
      { releaseCommit: activation.RELEASE_COMMIT, mode }
    );
  }
  assert.throws(
    () => activation.parseArgs([
      `--release-commit=${OTHER_COMMIT}`,
      "--preview"
    ]),
    /release_commit_mismatch/
  );
  assert.throws(
    () => activation.parseArgs([
      `--release-commit=${activation.RELEASE_COMMIT}`,
      "--preview",
      "--verify"
    ]),
    /mode_repeated/
  );
  assert.throws(
    () => activation.parseArgs(["--preview"]),
    /release_commit_missing/
  );
});

test("l'exécution exige un GO et le planHash exacts", () => {
  const hash = "a".repeat(64);
  assert.deepEqual(
    activation.verifyExecutionAuthority(
      {
        releaseCommit: activation.RELEASE_COMMIT,
        mode: "preview"
      },
      hash,
      {}
    ),
    { authorized: false, readOnly: true }
  );
  assert.throws(
    () => activation.verifyExecutionAuthority(
      {
        releaseCommit: activation.RELEASE_COMMIT,
        mode: "execute"
      },
      hash,
      {}
    ),
    /activation_go_missing/
  );
  assert.throws(
    () => activation.verifyExecutionAuthority(
      {
        releaseCommit: activation.RELEASE_COMMIT,
        mode: "execute"
      },
      hash,
      {
        CFSB_REPERES_V2_GHL_ACTIVATION_GO: activation.RELEASE_COMMIT,
        CFSB_REPERES_V2_GHL_ACTIVATION_PLAN_HASH: "b".repeat(64)
      }
    ),
    /activation_plan_hash_mismatch/
  );
  assert.equal(
    activation.verifyExecutionAuthority(
      {
        releaseCommit: activation.RELEASE_COMMIT,
        mode: "execute"
      },
      hash,
      {
        CFSB_REPERES_V2_GHL_ACTIVATION_GO: activation.RELEASE_COMMIT,
        CFSB_REPERES_V2_GHL_ACTIVATION_PLAN_HASH: hash
      }
    ).authorized,
    true
  );
});

test("le préflight exige la publication v2 exacte et la livraison fermée", () => {
  const candidate = release.buildCandidate();
  const state = makePublishedV2State();
  assert.deepEqual(
    activation.validateInitialState(state, candidate, {
      releaseCommit: activation.RELEASE_COMMIT
    }),
    {
      versionId: release.V2_VERSION_ID,
      versionHash: release.EXPECTED_V2_HASH,
      ghlTag: candidate.definition.ghlTag,
      publicUrl: candidate.publicUrl,
      deliveryReady: false
    }
  );

  const mutations = [
    (copy) => {
      copy.form.value.deliveryReady = true;
    },
    (copy) => {
      copy.catalog.value.activeVersionHash = "x".repeat(43);
    },
    (copy) => {
      copy.tag.value.ghlTag = "mauvais-tag";
    },
    (copy) => {
      copy.publishAudit.value.action = "questionnaire.changed";
    },
    (copy) => {
      copy.deliveryAudit = makeDoc(
        activation.documentNames(candidate).deliveryAudit,
        { action: "unexpected" },
        "40"
      );
    },
    (copy) => {
      copy.rollbackAudit = makeDoc(
        release.documentNames(candidate).rollbackAudit,
        { action: "unexpected" },
        "41"
      );
    }
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(state);
    mutate(copy);
    assert.throws(
      () => activation.validateInitialState(copy, candidate, {
        releaseCommit: activation.RELEASE_COMMIT
      })
    );
  }
});

test("le plan atomique lie toutes les sources, les preuves et l'audit déterministe", () => {
  const candidate = release.buildCandidate();
  const state = makePublishedV2State();
  const plan = activation.buildActivationPlan(state, candidate, {
    releaseCommit: activation.RELEASE_COMMIT
  });
  const names = activation.documentNames(candidate);
  assert.equal(plan.operation, "activate_reperes_v2_ghl_delivery");
  assert.equal(plan.releaseCommit, activation.RELEASE_COMMIT);
  assert.equal(plan.versionHash, release.EXPECTED_V2_HASH);
  assert.equal(plan.verificationNote, activation.VERIFICATION_NOTE);
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);
  assert.equal(plan.writes.length, 9);
  assert.equal(plan.writes.some((write) => write.verify), false);
  assert.equal(plan.writes.filter((write) => write.update).length, 8);
  assert.equal(plan.writes.filter((write) => write.delete).length, 1);
  assert.deepEqual(
    plan.guardedDocuments,
    [names.v1, names.v2, names.slug, names.tag, names.publishAudit]
      .concat(names.rollbackAudit)
  );
  for (const key of ["form", "catalog"]) {
    const write = plan.writes.find((item) => item.update?.name === names[key]);
    assert.equal(write.currentDocument.updateTime, state[key].updateTime);
  }
  const formWrite = plan.writes.find(
    (write) => write.update?.name === names.form
  );
  const formPatch = release.decodeFirestoreFields(formWrite.update.fields);
  assert.equal(formPatch.deliveryReady, true);
  assert.equal(
    formPatch.deliveryVerifiedVersionHash,
    release.EXPECTED_V2_HASH
  );
  assert.equal(formPatch.deliveryVerificationNote, activation.VERIFICATION_NOTE);
  assert.equal(formPatch.updatedByUid, activation.SYSTEM_ACTOR_UID);
  assert.equal(Object.hasOwn(formPatch, "deliveryVerifiedAt"), false);
  assert.deepEqual(
    formWrite.updateTransforms.map((item) => item.fieldPath),
    ["deliveryVerifiedAt", "updatedAt"]
  );
  const auditWrite = plan.writes.find(
    (write) => write.update?.name === names.deliveryAudit
  );
  assert.deepEqual(auditWrite.currentDocument, { exists: false });
  const audit = release.decodeFirestoreFields(auditWrite.update.fields);
  assert.equal(audit.actorUid, activation.SYSTEM_ACTOR_UID);
  assert.equal(audit.actorEmail, "");
  assert.equal(audit.releaseCommit, activation.RELEASE_COMMIT);
  assert.equal(audit.verificationNote, activation.VERIFICATION_NOTE);
  assert.equal(
    audit.sourceFormDocumentHash,
    release.sha256Hex(release.stableJson(state.form.value))
  );
  assert.equal(
    audit.sourceCatalogDocumentHash,
    release.sha256Hex(release.stableJson(state.catalog.value))
  );
  assert.deepEqual(
    plan.observedSources.map((item) => item.name),
    [
      names.form,
      names.catalog,
      names.slug,
      names.v1,
      names.v2,
      names.tag,
      names.publishAudit
    ]
  );
  const rollbackGuard = plan.writes.find(
    (write) => write.delete === names.rollbackAudit
  );
  assert.deepEqual(rollbackGuard, {
    delete: names.rollbackAudit,
    currentDocument: { exists: false }
  });
  assert.doesNotThrow(() => activation.validateRestWritePlan(plan.writes));
  const unsupported = structuredClone(plan.writes);
  unsupported[0].verify = names.v1;
  assert.throws(
    () => activation.validateRestWritePlan(unsupported),
    /activation_rest_write_operation_invalid/
  );

  const changedObservation = structuredClone(state);
  changedObservation.form.updateTime = "2026-07-29T22:59:00.000Z";
  const changedPlan = activation.buildActivationPlan(
    changedObservation,
    candidate,
    { releaseCommit: activation.RELEASE_COMMIT }
  );
  assert.notEqual(changedPlan.planHash, plan.planHash);
});

test("la post-vérification prouve l'activation exacte et l'atomicité", () => {
  const { candidate, initial, activated } = makeActivatedState();
  assert.deepEqual(
    activation.validateActivatedState(activated, candidate, {
      releaseCommit: activation.RELEASE_COMMIT
    }),
    {
      versionId: release.V2_VERSION_ID,
      versionHash: release.EXPECTED_V2_HASH,
      ghlTag: candidate.definition.ghlTag,
      publicUrl: candidate.publicUrl,
      actorUid: activation.SYSTEM_ACTOR_UID,
      verificationNote: activation.VERIFICATION_NOTE,
      deliveryReady: true,
      deliveryAuditId: activation.DELIVERY_AUDIT_ID,
      activatedAt: ACTIVATION_TIME
    }
  );
  assert.deepEqual(
    activation.validateTransitionUnchanged(initial, activated, candidate),
    { unchangedDocuments: 5 }
  );
  assert.equal(activated.form.value.deliveryVerifiedAt, ACTIVATION_TIME);
  assert.equal(activated.catalog.value.updatedAt, ACTIVATION_TIME);
  assert.equal(activated.deliveryAudit.value.createdAt, ACTIVATION_TIME);
});

test("la post-vérification refuse toute dérive des preuves ou des sources", () => {
  const cases = [
    (copy) => {
      copy.form.value.deliveryVerificationNote = "preuve altérée";
    },
    (copy) => {
      copy.form.value.deliveryVerifiedVersionHash = "x".repeat(43);
    },
    (copy) => {
      copy.form.value.deliveryVerifiedPublicUrl = "https://example.test/";
    },
    (copy) => {
      copy.form.value.title = "Titre altéré";
    },
    (copy) => {
      copy.catalog.value.deliveryReady = false;
    },
    (copy) => {
      copy.deliveryAudit.value.actorUid = "system:autre";
    },
    (copy) => {
      copy.deliveryAudit.value.sourceFormDocumentHash = "a".repeat(64);
    },
    (copy) => {
      copy.deliveryAudit.value.unexpected = true;
    },
    (copy) => {
      copy.catalog.updateTime = "2026-07-29T23:06:00.000Z";
    }
  ];
  for (const mutate of cases) {
    const { candidate, activated } = makeActivatedState();
    mutate(activated);
    assert.throws(
      () => activation.validateActivatedState(activated, candidate, {
        releaseCommit: activation.RELEASE_COMMIT
      })
    );
  }

  const { candidate, initial, activated } = makeActivatedState();
  activated.v2.updateTime = "2026-07-29T23:06:00.000Z";
  assert.throws(
    () => activation.validateTransitionUnchanged(
      initial,
      activated,
      candidate
    ),
    /activation_v2_was_modified/
  );
});

test("le runner reste fail-closed et ne journalise ni état live ni secret", () => {
  assert.match(
    runnerSource,
    /verifyReleaseCommitAvailable\(options\.releaseCommit\)/
  );
  assert.match(
    runnerSource,
    /activation\.verifyExecutionAuthority\(options, plan\.planHash\)/
  );
  assert.match(runnerSource, /options\.mode === "preview"/);
  assert.match(runnerSource, /options\.mode === "execute"/);
  assert.match(runnerSource, /options\.mode === "verify"/);
  assert.match(
    runnerSource,
    /release\.validateCommitWriteResults\(\s*result\.payload,\s*writes\.length/
  );
  assert.match(librarySource, /currentDocument: \{ updateTime:/);
  assert.match(librarySource, /currentDocument: \{ exists: false \}/);
  assert.doesNotMatch(librarySource, /function verifyWrite/);
  assert.match(runnerSource, /activation\.validateRestWritePlan\(writes\)/);
  assert.match(runnerSource, /secretsPrinted: false/);
  assert.match(runnerSource, /piiPrinted: false/);
  assert.doesNotMatch(
    runnerSource,
    /console\.error\(error\.(?:stack|message)/
  );
  assert.doesNotMatch(
    runnerSource,
    /process\.stdout\.write\([^)]*(?:accessToken|stateBefore)/
  );
  assert.doesNotMatch(runnerSource, /JSON\.stringify\(\s*stateBefore/);
});
