import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const lib = require("../tools/reperes-v2-release-lib.cjs");
const studio = require("../functions/questionnaire-studio.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runnerSource = fs.readFileSync(
  path.join(root, "tools", "publish-reperes-v2.cjs"),
  "utf8"
);
const librarySource = fs.readFileSync(
  path.join(root, "tools", "reperes-v2-release-lib.cjs"),
  "utf8"
);
const COMMIT = "8e57fcb624f1244a5f5304badf7d457842a1f8b5";
const OTHER_COMMIT = "9e57fcb624f1244a5f5304badf7d457842a1f8b6";
const TEST_V1_PUBLISHED_AT = "2026-07-23T00:00:00.000Z";

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
  const sleepRegularity = fields.find((field) => field.id === "sleep_regular_nights");
  const completeMeals = fields.find((field) => field.id === "complete_meals_day");
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
  assert.equal(definition.versionHash, lib.EXPECTED_V1_HASH);
  return definition;
}

function makePreState() {
  const candidate = lib.buildCandidate();
  const names = lib.documentNames(candidate);
  const definition = testV1Definition();
  const draft = lib.draftFromDefinition(definition);
  const fingerprint = lib.draftFingerprint(draft);
  const publicUrl = `${lib.PUBLIC_ORIGIN}${definition.canonicalPath}`;
  const form = {
    formId: lib.FORM_ID,
    legacyType: "",
    shortLabel: "Repères CFSB",
    slug: lib.SLUG,
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
    activeVersionId: lib.V1_VERSION_ID,
    activeVersionHash: definition.versionHash,
    publicPath: definition.canonicalPath,
    publicUrl,
    publishedAt: "2026-07-23T00:00:01.000Z",
    publishedByUid: "admin-test",
    updatedAt: "2026-07-23T00:00:01.000Z",
    updatedByUid: "admin-test"
  };
  const catalog = {
    formId: lib.FORM_ID,
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
    activeVersionId: lib.V1_VERSION_ID,
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
      slug: lib.SLUG,
      formId: lib.FORM_ID,
      versionId: lib.V1_VERSION_ID,
      version: "1",
      status: "published",
      updatedAt: "2026-07-23T00:00:01.000Z"
    }, "03"),
    v1: makeDoc(names.v1, {
      formId: lib.FORM_ID,
      versionId: lib.V1_VERSION_ID,
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
      formId: lib.FORM_ID,
      status: "reserved",
      updatedAt: "2026-07-23T00:00:01.000Z"
    }, "05"),
    publishAudit: null,
    rollbackAudit: null
  };
}

function applyWriteFields(targetValue, write) {
  const decoded = lib.decodeFirestoreFields(write.update.fields);
  const value = write.updateMask ? { ...targetValue, ...decoded } : decoded;
  for (const transform of write.updateTransforms || []) {
    if (transform.setToServerValue === "REQUEST_TIME") {
      value[transform.fieldPath] = "2026-07-29T19:44:00.000Z";
    }
  }
  return value;
}

function makePostState(preState, plan) {
  const next = structuredClone(preState);
  const byName = new Map([
    [next.form.name, next.form],
    [next.catalog.name, next.catalog],
    [next.slug.name, next.slug],
    [next.tag.name, next.tag]
  ]);
  let tick = 10;
  for (const write of plan.writes) {
    if (write.verify) continue;
    const name = write.update.name;
    const existing = byName.get(name);
    const doc = {
      name,
      createTime: existing?.createTime || `2026-07-29T19:42:${tick}.000Z`,
      updateTime: `2026-07-29T19:43:${tick}.000Z`,
      value: applyWriteFields(existing?.value || {}, write)
    };
    if (name.endsWith(`/${lib.V2_VERSION_ID}`)) next.v2 = doc;
    else if (name.endsWith(`/${lib.PUBLISH_AUDIT_ID}`)) next.publishAudit = doc;
    else if (name.endsWith(`/${lib.ROLLBACK_AUDIT_ID}`)) next.rollbackAudit = doc;
    else if (existing === next.form) next.form = doc;
    else if (existing === next.catalog) next.catalog = doc;
    else if (existing === next.slug) next.slug = doc;
    else if (existing === next.tag) next.tag = doc;
    byName.set(name, doc);
    tick += 1;
  }
  return next;
}

test("le candidat v2 est déterministe et scellé sur le contenu éducatif courant", () => {
  const candidate = lib.buildCandidate();
  assert.equal(candidate.definition.version, "2");
  assert.equal(candidate.definition.publishedAt, "2026-07-29T19:41:35.000Z");
  assert.equal(candidate.definition.versionHash, lib.EXPECTED_V2_HASH);
  assert.equal(
    candidate.definition.versionHash,
    "NB4xhuqLECIvs2-gZmQZ54ObrnkuRMm4xeaQkX52XPM"
  );
  assert.equal(lib.EXPECTED_V1_HASH, "Cir10OcaFefqzXpmR83Xf598Y1EdWIiTzRClop59KGM");
  assert.match(candidate.draft.description, /repères d'accompagnement internes CFSB/i);
});

test("les modes et le SHA sont explicites et mutuellement exclusifs", () => {
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${COMMIT}`, "--preview"]),
    { releaseCommit: COMMIT, mode: "preview" }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${COMMIT}`, "--execute"]),
    { releaseCommit: COMMIT, mode: "execute" }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${COMMIT}`, "--verify"]),
    { releaseCommit: COMMIT, mode: "verify" }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${COMMIT}`, "--rollback-preview"]),
    { releaseCommit: COMMIT, mode: "rollback-preview" }
  );
  assert.deepEqual(
    lib.parseArgs([`--release-commit=${COMMIT}`, "--rollback-verify"]),
    { releaseCommit: COMMIT, mode: "rollback-verify" }
  );
  assert.throws(
    () => lib.parseArgs([`--release-commit=${COMMIT}`, "--preview", "--execute"]),
    /mode_repeated/
  );
  assert.throws(() => lib.parseArgs(["--preview"]), /release_commit_missing/);
  assert.throws(
    () => lib.parseArgs([`--release-commit=${COMMIT.slice(1)}`, "--preview"]),
    /release_commit_invalid/
  );
});

test("l'exécution exige un GO et le hash du plan liés au SHA scellé", () => {
  const planHash = "a".repeat(64);
  assert.deepEqual(
    lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT, mode: "preview" },
      planHash,
      {}
    ),
    { authorized: false, readOnly: true }
  );
  assert.throws(
    () => lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT, mode: "execute" },
      planHash,
      {}
    ),
    /release_go_missing/
  );
  assert.throws(
    () => lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT, mode: "execute" },
      planHash,
      {
        CFSB_REPERES_V2_RELEASE_GO: COMMIT,
        CFSB_REPERES_V2_PLAN_HASH: "b".repeat(64)
      }
    ),
    /publication_plan_hash_mismatch/
  );
  assert.equal(
    lib.verifyExecutionAuthority(
      { releaseCommit: COMMIT, mode: "execute" },
      planHash,
      {
        CFSB_REPERES_V2_RELEASE_GO: COMMIT,
        CFSB_REPERES_V2_PLAN_HASH: planHash
      }
    ).authorized,
    true
  );
});

test("le préflight exige v1 exact, aucun v2 et aucune dérive des pointeurs", () => {
  const candidate = lib.buildCandidate();
  const state = makePreState();
  assert.doesNotThrow(() => lib.validatePreState(state, candidate));

  const withV2 = structuredClone(state);
  withV2.v2 = makeDoc(
    lib.documentNames(candidate).v2,
    { formId: lib.FORM_ID },
    "09"
  );
  assert.throws(
    () => lib.validatePreState(withV2, candidate),
    /v2_already_exists/
  );

  const drifted = structuredClone(state);
  drifted.form.value.activeVersionHash = "x".repeat(43);
  assert.throws(
    () => lib.validatePreState(drifted, candidate),
    /v1_form_state_mismatch/
  );

  const incoherentPublishedAt = makePreState();
  incoherentPublishedAt.v1.value.publishedAt = "2026-07-24T00:00:00.000Z";
  assert.throws(
    () => lib.validatePreState(incoherentPublishedAt, candidate),
    /version_document_mismatch/
  );
});

test("le plan de publication est lié au SHA, aux sources observées et ne touche jamais v1", () => {
  const candidate = lib.buildCandidate();
  const state = makePreState();
  const plan = lib.buildPublicationPlan(state, candidate, {
    releaseCommit: COMMIT
  });
  const names = lib.documentNames(candidate);
  assert.equal(plan.operation, "publish_v2");
  assert.equal(plan.releaseCommit, COMMIT);
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(plan.observedSources, [{
    name: state.v1.name,
    documentHash: lib.sha256Hex(lib.stableJson(state.v1.value)),
    updateTime: state.v1.updateTime
  }]);
  const otherShaPlan = lib.buildPublicationPlan(state, candidate, {
    releaseCommit: OTHER_COMMIT
  });
  assert.notEqual(otherShaPlan.planHash, plan.planHash);
  assert.equal(plan.writes.length, 7);
  assert.deepEqual(
    plan.writes.filter((write) => write.verify),
    [{
      verify: names.v1,
      currentDocument: { updateTime: state.v1.updateTime }
    }]
  );
  assert.equal(
    plan.writes.some((write) => write.update?.name === names.v1),
    false
  );
  const versionWrite = plan.writes.find((write) => write.update?.name === names.v2);
  assert.deepEqual(versionWrite.currentDocument, { exists: false });
  for (const key of ["form", "catalog", "slug", "tag"]) {
    const write = plan.writes.find((item) => item.update?.name === names[key]);
    assert.equal(write.currentDocument.updateTime, state[key].updateTime);
  }
  const formWrite = plan.writes.find((write) => write.update?.name === names.form);
  const formPatch = lib.decodeFirestoreFields(formWrite.update.fields);
  assert.equal(formPatch.deliveryReady, false);
  assert.equal(formPatch.activeVersion, "2");
  assert.equal(formPatch.activeVersionHash, lib.EXPECTED_V2_HASH);
  const auditWrite = plan.writes.find((write) =>
    write.update?.name === names.publishAudit
  );
  assert.equal(
    lib.decodeFirestoreFields(auditWrite.update.fields).releaseCommit,
    COMMIT
  );
});

test("la vérification post-publication lie v2, les pointeurs et le coupe-circuit", () => {
  const candidate = lib.buildCandidate();
  const pre = makePreState();
  const plan = lib.buildPublicationPlan(pre, candidate, {
    releaseCommit: COMMIT
  });
  const post = makePostState(pre, plan);
  assert.deepEqual(
    lib.validatePostState(post, candidate, { releaseCommit: COMMIT }),
    {
      v1Hash: lib.EXPECTED_V1_HASH,
      v2Hash: lib.EXPECTED_V2_HASH,
      deliveryReady: false
    }
  );

  post.form.value.deliveryReady = true;
  assert.throws(
    () => lib.validatePostState(post, candidate, { releaseCommit: COMMIT }),
    /v2_form_state_mismatch|v2_delivery_gate_not_closed/
  );

  for (const field of lib.DELIVERY_PROOF_FIELDS) {
    const altered = makePostState(pre, plan);
    altered.form.value[field] = field === "deliveryVerifiedAt"
      ? "2026-07-30T00:00:00.000Z"
      : "unexpected";
    assert.throws(
      () => lib.validatePostState(altered, candidate, {
        releaseCommit: COMMIT
      }),
      /v2_delivery_gate_not_closed/,
      `preuve de livraison non remise à zéro: ${field}`
    );
  }
});

test("le rollback restaure v1 atomiquement, garde v2 et laisse la livraison fermée", () => {
  const candidate = lib.buildCandidate();
  const pre = makePreState();
  const publication = lib.buildPublicationPlan(pre, candidate, {
    releaseCommit: COMMIT
  });
  const post = makePostState(pre, publication);
  const rollback = lib.buildRollbackPlan(post, candidate, {
    releaseCommit: COMMIT
  });
  const otherPublication = lib.buildPublicationPlan(pre, candidate, {
    releaseCommit: OTHER_COMMIT
  });
  const otherPost = makePostState(pre, otherPublication);
  const otherRollback = lib.buildRollbackPlan(otherPost, candidate, {
    releaseCommit: OTHER_COMMIT
  });
  const names = lib.documentNames(candidate);
  assert.equal(rollback.operation, "rollback_to_v1");
  assert.equal(rollback.releaseCommit, COMMIT);
  assert.notEqual(otherRollback.planHash, rollback.planHash);
  assert.deepEqual(
    rollback.observedSources.map((item) => item.name),
    [post.v1.name, post.v2.name]
  );
  assert.equal(rollback.writes.length, 7);
  assert.deepEqual(
    rollback.writes
      .filter((write) => write.verify)
      .map((write) => ({
        verify: write.verify,
        updateTime: write.currentDocument.updateTime
      })),
    [
      { verify: names.v1, updateTime: post.v1.updateTime },
      { verify: names.v2, updateTime: post.v2.updateTime }
    ]
  );
  assert.equal(
    rollback.writes.some((write) => write.update?.name === names.v2),
    false
  );
  assert.equal(
    rollback.writes.some((write) => write.update?.name === names.v1),
    false
  );
  const formWrite = rollback.writes.find((write) => write.update?.name === names.form);
  const formPatch = lib.decodeFirestoreFields(formWrite.update.fields);
  assert.equal(formPatch.activeVersion, "1");
  assert.equal(formPatch.activeVersionHash, lib.EXPECTED_V1_HASH);
  assert.equal(formPatch.versionNumber, 2);
  assert.equal(formPatch.deliveryReady, false);

  const rolledBack = makePostState(post, rollback);
  assert.deepEqual(
    lib.validateRollbackState(rolledBack, candidate, {
      releaseCommit: COMMIT
    }),
    {
      activeVersion: "1",
      retainedV2: true,
      deliveryReady: false
    }
  );
  assert.equal(rolledBack.v2.updateTime, post.v2.updateTime);
});

test("le rollback accepte une v2 activée et un brouillon ensuite modifié", () => {
  const candidate = lib.buildCandidate();
  const pre = makePreState();
  const publication = lib.buildPublicationPlan(pre, candidate, {
    releaseCommit: COMMIT
  });
  const active = makePostState(pre, publication);
  const previousDeliveryState = {
    deliveryReady: true,
    deliveryVerifiedAt: "2026-07-30T12:00:00.000Z",
    deliveryVerifiedByUid: "admin-delivery-test",
    deliveryVerifiedByEmail: "admin@example.test",
    deliveryVerificationNote: "Canari GHL v2 reçu et vérifié.",
    deliveryVerifiedVersionId: lib.V2_VERSION_ID,
    deliveryVerifiedVersionHash: lib.EXPECTED_V2_HASH,
    deliveryVerifiedGhlTag: candidate.definition.ghlTag,
    deliveryVerifiedPublicUrl: candidate.publicUrl
  };
  Object.assign(active.form.value, previousDeliveryState);
  active.catalog.value.deliveryReady = true;

  const changedDraft = structuredClone(candidate.draft);
  changedDraft.title = "Repères CFSB — prochain brouillon";
  const normalizedChangedDraft = studio.normalizeDraft(changedDraft);
  active.form.value.draft = normalizedChangedDraft;
  active.form.value.draftRevision += 1;
  active.form.value.draftFingerprint = lib.draftFingerprint(normalizedChangedDraft);
  active.form.value.hasUnpublishedChanges = true;
  active.form.value.title = normalizedChangedDraft.title;
  active.form.value.updatedAt = "2026-07-30T12:05:00.000Z";
  active.form.value.updatedByUid = "admin-draft-test";
  const preservedDraftState = lib.capturePreservedDraftState(
    active.form,
    candidate
  );

  assert.deepEqual(
    lib.validateRollbackSourceState(active, candidate, {
      releaseCommit: COMMIT
    }),
    {
      v1: active.v1.value.definition,
      previousDeliveryState,
      hadUnpublishedChanges: true,
      preservedDraftState
    }
  );

  const rollback = lib.buildRollbackPlan(active, candidate, {
    releaseCommit: COMMIT
  });
  assert.deepEqual(
    rollback.observedSources.map((item) => ({
      name: item.name,
      documentHash: item.documentHash,
      updateTime: item.updateTime
    })),
    [
      {
        name: active.v1.name,
        documentHash: lib.sha256Hex(lib.stableJson(active.v1.value)),
        updateTime: active.v1.updateTime
      },
      {
        name: active.v2.name,
        documentHash: lib.sha256Hex(lib.stableJson(active.v2.value)),
        updateTime: active.v2.updateTime
      }
    ]
  );
  const rollbackAuditWrite = rollback.writes.find((write) =>
    write.update?.name === lib.documentNames(candidate).rollbackAudit
  );
  const rollbackAudit = lib.decodeFirestoreFields(rollbackAuditWrite.update.fields);
  assert.equal(rollbackAudit.releaseCommit, COMMIT);
  assert.deepEqual(rollbackAudit.previousDeliveryState, previousDeliveryState);
  assert.equal(rollbackAudit.retainedVersionHash, lib.EXPECTED_V2_HASH);
  assert.deepEqual(rollbackAudit.preservedDraftState, preservedDraftState);
  assert.deepEqual(
    rollbackAudit.preservedDraftState.draft,
    active.form.value.draft
  );
  assert.equal(
    rollbackAudit.preservedDraftState.sourceFormDocumentHash,
    lib.sha256Hex(lib.stableJson(active.form.value))
  );

  const rolledBack = makePostState(active, rollback);
  assert.deepEqual(
    lib.validateRollbackState(rolledBack, candidate, {
      releaseCommit: COMMIT
    }),
    {
      activeVersion: "1",
      retainedV2: true,
      deliveryReady: false
    }
  );
  assert.equal(rolledBack.form.value.hasUnpublishedChanges, false);
  assert.equal(rolledBack.form.value.deliveryReady, false);
  for (const [field, expected] of Object.entries({
    deliveryVerifiedAt: null,
    deliveryVerifiedByUid: "",
    deliveryVerifiedByEmail: "",
    deliveryVerificationNote: "",
    deliveryVerifiedVersionId: "",
    deliveryVerifiedVersionHash: "",
    deliveryVerifiedGhlTag: "",
    deliveryVerifiedPublicUrl: ""
  })) {
    assert.equal(rolledBack.form.value[field], expected, field);
  }

  const corruptedAudit = structuredClone(rolledBack);
  corruptedAudit.rollbackAudit.value.preservedDraftState.draft.title =
    "Brouillon altéré après le rollback";
  assert.throws(
    () => lib.validateRollbackState(corruptedAudit, candidate, {
      releaseCommit: COMMIT
    }),
    /rollback_preserved_draft_state_invalid/
  );
});

test("la confirmation de commit accepte un WriteResult vide par opération verify", () => {
  const candidate = lib.buildCandidate();
  const state = makePreState();
  const publication = lib.buildPublicationPlan(state, candidate, {
    releaseCommit: COMMIT
  });
  const commitPayloadFor = (plan) => ({
    writeResults: plan.writes.map((write, index) =>
      write.verify
        ? {}
        : {
          updateTime:
            `2026-07-29T20:00:${String(index).padStart(2, "0")}.000Z`
        }
    ),
    commitTime: "2026-07-29T20:01:00.000Z"
  });
  const publicationPayload = commitPayloadFor(publication);
  assert.equal(
    publicationPayload.writeResults.filter((result) => !result.updateTime).length,
    1
  );
  assert.deepEqual(
    lib.validateCommitWriteResults(
      publicationPayload,
      publication.writes.length
    ),
    { operationsConfirmed: 7 }
  );

  const post = makePostState(state, publication);
  const rollback = lib.buildRollbackPlan(post, candidate, {
    releaseCommit: COMMIT
  });
  const rollbackPayload = commitPayloadFor(rollback);
  assert.equal(
    rollbackPayload.writeResults.filter((result) => !result.updateTime).length,
    2
  );
  assert.deepEqual(
    lib.validateCommitWriteResults(
      rollbackPayload,
      rollback.writes.length
    ),
    { operationsConfirmed: 7 }
  );
  assert.throws(
    () => lib.validateCommitWriteResults(
      {
        writeResults: publicationPayload.writeResults.slice(1),
        commitTime: "2026-07-29T20:01:00.000Z"
      },
      publication.writes.length
    ),
    /atomic_commit_confirmation_invalid/
  );
});

test("le runner est fail-closed, scellé et ne journalise ni corps live ni secrets", () => {
  assert.match(runnerSource, /verifySealedCandidate\(options\.releaseCommit\)/);
  assert.match(runnerSource, /verifyExecutionAuthority\(options, plan\.planHash\)/);
  assert.match(runnerSource, /options\.mode === "rollback-verify"/);
  assert.match(librarySource, /currentDocument/);
  assert.match(runnerSource, /validateCommitWriteResults\(result\.payload, writes\.length\)/);
  assert.match(runnerSource, /secretsPrinted: false/);
  assert.match(runnerSource, /piiPrinted: false/);
  assert.doesNotMatch(runnerSource, /console\.error\(error\.(?:stack|message)/);
  assert.doesNotMatch(runnerSource, /process\.stdout\.write\([^)]*accessToken/);
  assert.doesNotMatch(runnerSource, /JSON\.stringify\(\s*stateBefore/);
});
