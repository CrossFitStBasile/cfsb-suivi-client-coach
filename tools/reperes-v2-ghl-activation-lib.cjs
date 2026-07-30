"use strict";

const release = require("./reperes-v2-release-lib.cjs");

const RELEASE_COMMIT = "9d6c0a9f300f78c5a6e6d22a1d34c436df455f1f";
const RELEASE_VERSION = "20260729-questionnaire-studio-stabilized";
const SOURCE_PUBLISH_ACTOR_UID = "system:reperes-v2-sealed-release";
const SYSTEM_ACTOR_UID = "system:reperes-v2-ghl-certification";
const VERIFICATION_NOTE =
  "2026-07-29 - 2/2 canaris internes; reinscription confirmee; courriels recus; URL v2 ouverte; tag retire automatiquement; 2 reponses distinctes retrouvees.";
const DELIVERY_AUDIT_ID =
  "reperes_cfsb_v2_NB4xhuqLECIv_delivery_enabled_20260729";
const MODES = Object.freeze(["preview", "execute", "verify"]);
const SHA_40_PATTERN = /^[a-f0-9]{40}$/;
const SHA_64_PATTERN = /^[a-f0-9]{64}$/;

const DELIVERY_PROOF_RESET = Object.freeze({
  deliveryReady: false,
  deliveryVerifiedAt: null,
  deliveryVerifiedByUid: "",
  deliveryVerifiedByEmail: "",
  deliveryVerificationNote: "",
  deliveryVerifiedVersionId: "",
  deliveryVerifiedVersionHash: "",
  deliveryVerifiedGhlTag: "",
  deliveryVerifiedPublicUrl: ""
});

function fail(code) {
  throw new release.ReperesV2ReleaseError(code);
}

function clean(value) {
  return String(value ?? "").trim();
}

function validTimestamp(value) {
  const text = clean(value);
  return text.endsWith("Z") && Number.isFinite(new Date(text).getTime());
}

function assertReleaseCommit(value) {
  const commit = clean(value).toLowerCase();
  if (!SHA_40_PATTERN.test(commit)) fail("release_commit_invalid");
  if (commit !== RELEASE_COMMIT) fail("release_commit_mismatch");
  return commit;
}

function assertPlanHash(value, code = "activation_plan_hash_invalid") {
  const hash = clean(value).toLowerCase();
  if (!SHA_64_PATTERN.test(hash)) fail(code);
  return hash;
}

function parseArgs(argv = []) {
  let releaseCommit = "";
  let mode = "";
  for (const raw of argv) {
    const argument = clean(raw);
    if (argument.startsWith("--release-commit=")) {
      if (releaseCommit) fail("release_commit_repeated");
      releaseCommit = assertReleaseCommit(
        argument.slice("--release-commit=".length)
      );
      continue;
    }
    if (argument.startsWith("--") && MODES.includes(argument.slice(2))) {
      if (mode) fail("mode_repeated");
      mode = argument.slice(2);
      continue;
    }
    fail("argument_unknown");
  }
  if (!releaseCommit) fail("release_commit_missing");
  if (!mode) fail("mode_missing");
  return Object.freeze({ releaseCommit, mode });
}

function verifyExecutionAuthority(options, planHash, env = process.env) {
  const releaseCommit = assertReleaseCommit(options?.releaseCommit);
  const mode = clean(options?.mode);
  if (mode !== "execute") {
    return Object.freeze({ authorized: false, readOnly: true });
  }
  if (
    clean(env.CFSB_REPERES_V2_GHL_ACTIVATION_GO).toLowerCase()
    !== releaseCommit
  ) {
    fail("activation_go_missing");
  }
  const expectedPlanHash = assertPlanHash(
    env.CFSB_REPERES_V2_GHL_ACTIVATION_PLAN_HASH,
    "activation_plan_hash_missing"
  );
  if (expectedPlanHash !== assertPlanHash(planHash)) {
    fail("activation_plan_hash_mismatch");
  }
  return Object.freeze({ authorized: true, readOnly: false });
}

function documentNames(candidate = release.buildCandidate()) {
  const base = release.documentNames(candidate);
  const root =
    `projects/${release.PROJECT_ID}/databases/${release.DATABASE_ID}/documents`;
  return Object.freeze({
    ...base,
    deliveryAudit:
      `${root}/questionnaireStudioAudit/${DELIVERY_AUDIT_ID}`
  });
}

function assertDocument(doc, expectedName, code) {
  if (
    !doc
    || typeof doc !== "object"
    || Array.isArray(doc)
    || doc.name !== expectedName
    || !validTimestamp(doc.updateTime)
    || !doc.value
    || typeof doc.value !== "object"
    || Array.isArray(doc.value)
  ) {
    fail(code);
  }
  return doc;
}

function assertExactShape(value, expectedKeys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (release.stableJson(actual) !== release.stableJson(expected)) fail(code);
}

function validateInitialState(
  state,
  candidate = release.buildCandidate(),
  { releaseCommit = RELEASE_COMMIT } = {}
) {
  const sealedCommit = assertReleaseCommit(releaseCommit);
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    fail("activation_initial_state_invalid");
  }
  release.validatePostState(state, candidate, {
    releaseCommit: sealedCommit
  });
  if (state.rollbackAudit !== null && state.rollbackAudit !== undefined) {
    fail("activation_rollback_audit_present");
  }
  if (state.deliveryAudit !== null && state.deliveryAudit !== undefined) {
    fail("activation_audit_already_exists");
  }
  return Object.freeze({
    versionId: release.V2_VERSION_ID,
    versionHash: candidate.definition.versionHash,
    ghlTag: candidate.definition.ghlTag,
    publicUrl: candidate.publicUrl,
    deliveryReady: false
  });
}

function requestTime(fieldPath) {
  return { fieldPath, setToServerValue: "REQUEST_TIME" };
}

function patchWrite(name, value, updateTime, transforms = []) {
  return {
    update: { name, fields: release.encodeFirestoreFields(value) },
    updateMask: { fieldPaths: Object.keys(value).sort() },
    currentDocument: { updateTime: clean(updateTime) },
    ...(transforms.length ? { updateTransforms: transforms } : {})
  };
}

function createWrite(name, value, transforms = []) {
  return {
    update: { name, fields: release.encodeFirestoreFields(value) },
    currentDocument: { exists: false },
    ...(transforms.length ? { updateTransforms: transforms } : {})
  };
}

function deleteAbsentWrite(name) {
  return {
    delete: clean(name),
    currentDocument: { exists: false }
  };
}

function observedSource(doc, expectedName, code) {
  const source = assertDocument(doc, expectedName, code);
  return Object.freeze({
    name: source.name,
    documentHash: release.sha256Hex(release.stableJson(source.value)),
    updateTime: source.updateTime
  });
}

function validateRestWritePlan(writes) {
  if (!Array.isArray(writes) || writes.length !== 9) {
    fail("activation_rest_write_plan_invalid");
  }
  for (const write of writes) {
    if (!write || typeof write !== "object" || Array.isArray(write)) {
      fail("activation_rest_write_plan_invalid");
    }
    const allowedKeys = new Set([
      "update",
      "delete",
      "updateMask",
      "updateTransforms",
      "currentDocument"
    ]);
    if (
      Object.keys(write).some((key) => !allowedKeys.has(key))
      || Object.hasOwn(write, "verify")
    ) {
      fail("activation_rest_write_operation_invalid");
    }
    const operationCount =
      Number(Boolean(write.update)) + Number(Boolean(write.delete));
    if (
      operationCount !== 1
      || !write.currentDocument
      || typeof write.currentDocument !== "object"
      || Array.isArray(write.currentDocument)
    ) {
      fail("activation_rest_write_operation_invalid");
    }
    if (write.update) {
      if (
        typeof write.update.name !== "string"
        || !write.update.name
        || !write.update.fields
        || typeof write.update.fields !== "object"
        || Array.isArray(write.update.fields)
        || (
          Object.hasOwn(write.currentDocument, "updateTime")
          === Object.hasOwn(write.currentDocument, "exists")
        )
      ) {
        fail("activation_rest_update_invalid");
      }
    }
    if (write.delete) {
      if (
        typeof write.delete !== "string"
        || !write.delete
        || release.stableJson(write.currentDocument) !== release.stableJson({
          exists: false
        })
        || Object.hasOwn(write, "updateMask")
        || Object.hasOwn(write, "updateTransforms")
      ) {
        fail("activation_rest_delete_guard_invalid");
      }
    }
  }
  return Object.freeze({ operations: writes.length });
}

function activationValues(state, candidate, releaseCommit) {
  const form = state.form.value;
  const catalog = state.catalog.value;
  const formPatch = {
    deliveryReady: true,
    deliveryVerifiedByUid: SYSTEM_ACTOR_UID,
    deliveryVerifiedByEmail: "",
    deliveryVerificationNote: VERIFICATION_NOTE,
    deliveryVerifiedVersionId: release.V2_VERSION_ID,
    deliveryVerifiedVersionHash: candidate.definition.versionHash,
    deliveryVerifiedGhlTag: candidate.definition.ghlTag,
    deliveryVerifiedPublicUrl: candidate.publicUrl,
    updatedByUid: SYSTEM_ACTOR_UID
  };
  const catalogPatch = { deliveryReady: true };
  const audit = {
    action: "questionnaire.delivery_enabled",
    formId: release.FORM_ID,
    actorUid: SYSTEM_ACTOR_UID,
    actorEmail: "",
    ghlTag: candidate.definition.ghlTag,
    publicUrl: candidate.publicUrl,
    versionId: release.V2_VERSION_ID,
    versionHash: candidate.definition.versionHash,
    verificationNote: VERIFICATION_NOTE,
    releaseCommit,
    sealedActivation: true,
    publicationAuditId: release.PUBLISH_AUDIT_ID,
    sourceFormUpdateTime: state.form.updateTime,
    sourceFormDocumentHash:
      release.sha256Hex(release.stableJson(form)),
    sourceFormUpdatedAt: form.updatedAt,
    sourceCatalogUpdateTime: state.catalog.updateTime,
    sourceCatalogDocumentHash:
      release.sha256Hex(release.stableJson(catalog)),
    sourceCatalogUpdatedAt: catalog.updatedAt
  };
  return Object.freeze({ formPatch, catalogPatch, audit });
}

function buildActivationPlan(
  state,
  candidate = release.buildCandidate(),
  { releaseCommit = RELEASE_COMMIT } = {}
) {
  const sealedCommit = assertReleaseCommit(releaseCommit);
  validateInitialState(state, candidate, { releaseCommit: sealedCommit });
  const names = documentNames(candidate);
  const values = activationValues(state, candidate, sealedCommit);
  const observedSources = [
    observedSource(state.form, names.form, "activation_form_source_invalid"),
    observedSource(
      state.catalog,
      names.catalog,
      "activation_catalog_source_invalid"
    ),
    observedSource(state.slug, names.slug, "activation_slug_source_invalid"),
    observedSource(state.v1, names.v1, "activation_v1_source_invalid"),
    observedSource(state.v2, names.v2, "activation_v2_source_invalid"),
    observedSource(state.tag, names.tag, "activation_tag_source_invalid"),
    observedSource(
      state.publishAudit,
      names.publishAudit,
      "activation_publication_audit_source_invalid"
    )
  ];
  const writes = [
    patchWrite(
      names.v1,
      { versionHash: state.v1.value.versionHash },
      state.v1.updateTime
    ),
    patchWrite(
      names.v2,
      { versionHash: state.v2.value.versionHash },
      state.v2.updateTime
    ),
    patchWrite(
      names.form,
      values.formPatch,
      state.form.updateTime,
      [requestTime("deliveryVerifiedAt"), requestTime("updatedAt")]
    ),
    patchWrite(
      names.catalog,
      values.catalogPatch,
      state.catalog.updateTime,
      [requestTime("updatedAt")]
    ),
    patchWrite(
      names.slug,
      { versionId: state.slug.value.versionId },
      state.slug.updateTime
    ),
    patchWrite(
      names.tag,
      { status: state.tag.value.status },
      state.tag.updateTime
    ),
    patchWrite(
      names.publishAudit,
      { versionHash: state.publishAudit.value.versionHash },
      state.publishAudit.updateTime
    ),
    deleteAbsentWrite(names.rollbackAudit),
    createWrite(
      names.deliveryAudit,
      values.audit,
      [requestTime("createdAt")]
    )
  ];
  validateRestWritePlan(writes);
  const core = {
    operation: "activate_reperes_v2_ghl_delivery",
    projectId: release.PROJECT_ID,
    databaseId: release.DATABASE_ID,
    formId: release.FORM_ID,
    releaseCommit: sealedCommit,
    releaseVersion: RELEASE_VERSION,
    versionId: release.V2_VERSION_ID,
    versionHash: candidate.definition.versionHash,
    ghlTag: candidate.definition.ghlTag,
    publicUrl: candidate.publicUrl,
    actorUid: SYSTEM_ACTOR_UID,
    verificationNote: VERIFICATION_NOTE,
    deliveryAuditId: DELIVERY_AUDIT_ID,
    intendedMutationDocuments: [
      names.form,
      names.catalog,
      names.deliveryAudit
    ],
    guardedDocuments: [
      names.v1,
      names.v2,
      names.slug,
      names.tag,
      names.publishAudit,
      names.rollbackAudit
    ],
    expectedAbsentDocuments: [names.rollbackAudit, names.deliveryAudit],
    observedSources,
    writes
  };
  return Object.freeze({
    ...core,
    planHash: release.sha256Hex(release.stableJson(core))
  });
}

function validateAudit(
  auditDocInput,
  candidate,
  names,
  releaseCommit
) {
  const auditDoc = assertDocument(
    auditDocInput,
    names.deliveryAudit,
    "activation_audit_missing"
  );
  const audit = auditDoc.value;
  const staticExpected = {
    action: "questionnaire.delivery_enabled",
    formId: release.FORM_ID,
    actorUid: SYSTEM_ACTOR_UID,
    actorEmail: "",
    ghlTag: candidate.definition.ghlTag,
    publicUrl: candidate.publicUrl,
    versionId: release.V2_VERSION_ID,
    versionHash: candidate.definition.versionHash,
    verificationNote: VERIFICATION_NOTE,
    releaseCommit,
    sealedActivation: true,
    publicationAuditId: release.PUBLISH_AUDIT_ID
  };
  const sourceKeys = [
    "sourceFormUpdateTime",
    "sourceFormDocumentHash",
    "sourceFormUpdatedAt",
    "sourceCatalogUpdateTime",
    "sourceCatalogDocumentHash",
    "sourceCatalogUpdatedAt"
  ];
  assertExactShape(
    audit,
    [...Object.keys(staticExpected), ...sourceKeys, "createdAt"],
    "activation_audit_shape_invalid"
  );
  for (const [key, expected] of Object.entries(staticExpected)) {
    if (release.stableJson(audit[key]) !== release.stableJson(expected)) {
      fail("activation_audit_invalid");
    }
  }
  if (
    !validTimestamp(audit.createdAt)
    || !validTimestamp(audit.sourceFormUpdateTime)
    || !validTimestamp(audit.sourceFormUpdatedAt)
    || !validTimestamp(audit.sourceCatalogUpdateTime)
    || !validTimestamp(audit.sourceCatalogUpdatedAt)
    || !SHA_64_PATTERN.test(clean(audit.sourceFormDocumentHash))
    || !SHA_64_PATTERN.test(clean(audit.sourceCatalogDocumentHash))
  ) {
    fail("activation_audit_source_evidence_invalid");
  }
  return Object.freeze({ doc: auditDoc, value: audit });
}

function validateActivatedState(
  state,
  candidate = release.buildCandidate(),
  { releaseCommit = RELEASE_COMMIT } = {}
) {
  const sealedCommit = assertReleaseCommit(releaseCommit);
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    fail("activation_post_state_invalid");
  }
  if (state.rollbackAudit !== null && state.rollbackAudit !== undefined) {
    fail("activation_rollback_audit_present");
  }
  const names = documentNames(candidate);
  const formDoc = assertDocument(
    state.form,
    names.form,
    "activation_form_document_invalid"
  );
  const catalogDoc = assertDocument(
    state.catalog,
    names.catalog,
    "activation_catalog_document_invalid"
  );
  const auditResult = validateAudit(
    state.deliveryAudit,
    candidate,
    names,
    sealedCommit
  );
  const audit = auditResult.value;

  const normalized = structuredClone(state);
  normalized.form.value = {
    ...formDoc.value,
    ...DELIVERY_PROOF_RESET,
    updatedAt: audit.sourceFormUpdatedAt,
    updatedByUid: SOURCE_PUBLISH_ACTOR_UID
  };
  normalized.form.updateTime = audit.sourceFormUpdateTime;
  normalized.catalog.value = {
    ...catalogDoc.value,
    deliveryReady: false,
    updatedAt: audit.sourceCatalogUpdatedAt
  };
  normalized.catalog.updateTime = audit.sourceCatalogUpdateTime;
  normalized.deliveryAudit = null;

  release.validatePostState(normalized, candidate, {
    releaseCommit: sealedCommit
  });
  if (
    release.sha256Hex(release.stableJson(normalized.form.value))
      !== audit.sourceFormDocumentHash
    || release.sha256Hex(release.stableJson(normalized.catalog.value))
      !== audit.sourceCatalogDocumentHash
  ) {
    fail("activation_source_hash_mismatch");
  }

  const activationTime = formDoc.value.deliveryVerifiedAt;
  if (
    !validTimestamp(activationTime)
    || formDoc.value.updatedAt !== activationTime
    || catalogDoc.value.updatedAt !== activationTime
    || audit.createdAt !== activationTime
    || formDoc.updateTime !== catalogDoc.updateTime
    || formDoc.updateTime !== auditResult.doc.updateTime
    || audit.sourceFormUpdateTime === formDoc.updateTime
    || audit.sourceCatalogUpdateTime === catalogDoc.updateTime
  ) {
    fail("activation_atomic_timestamp_mismatch");
  }

  const expectedForm = {
    ...normalized.form.value,
    deliveryReady: true,
    deliveryVerifiedAt: activationTime,
    deliveryVerifiedByUid: SYSTEM_ACTOR_UID,
    deliveryVerifiedByEmail: "",
    deliveryVerificationNote: VERIFICATION_NOTE,
    deliveryVerifiedVersionId: release.V2_VERSION_ID,
    deliveryVerifiedVersionHash: candidate.definition.versionHash,
    deliveryVerifiedGhlTag: candidate.definition.ghlTag,
    deliveryVerifiedPublicUrl: candidate.publicUrl,
    updatedAt: activationTime,
    updatedByUid: SYSTEM_ACTOR_UID
  };
  const expectedCatalog = {
    ...normalized.catalog.value,
    deliveryReady: true,
    updatedAt: activationTime
  };
  if (
    release.stableJson(formDoc.value) !== release.stableJson(expectedForm)
    || release.stableJson(catalogDoc.value)
      !== release.stableJson(expectedCatalog)
  ) {
    fail("activation_delivery_proof_mismatch");
  }

  return Object.freeze({
    versionId: release.V2_VERSION_ID,
    versionHash: candidate.definition.versionHash,
    ghlTag: candidate.definition.ghlTag,
    publicUrl: candidate.publicUrl,
    actorUid: SYSTEM_ACTOR_UID,
    verificationNote: VERIFICATION_NOTE,
    deliveryReady: true,
    deliveryAuditId: DELIVERY_AUDIT_ID,
    activatedAt: activationTime
  });
}

function validateTransitionUnchanged(initial, activated, candidate = release.buildCandidate()) {
  const names = documentNames(candidate);
  for (const key of ["v1", "v2", "slug", "tag", "publishAudit"]) {
    const before = assertDocument(
      initial[key],
      names[key],
      `activation_${key}_initial_invalid`
    );
    const after = assertDocument(
      activated[key],
      names[key],
      `activation_${key}_post_invalid`
    );
    if (
      before.updateTime !== after.updateTime
      || release.stableJson(before.value) !== release.stableJson(after.value)
    ) {
      fail(`activation_${key}_was_modified`);
    }
  }
  return Object.freeze({ unchangedDocuments: 5 });
}

function safeErrorCode(error) {
  if (error instanceof release.ReperesV2ReleaseError) return error.code;
  return "unexpected_error";
}

module.exports = {
  DELIVERY_AUDIT_ID,
  MODES,
  RELEASE_COMMIT,
  RELEASE_VERSION,
  SYSTEM_ACTOR_UID,
  VERIFICATION_NOTE,
  buildActivationPlan,
  documentNames,
  parseArgs,
  safeErrorCode,
  validateActivatedState,
  validateInitialState,
  validateTransitionUnchanged,
  validateRestWritePlan,
  verifyExecutionAuthority
};
