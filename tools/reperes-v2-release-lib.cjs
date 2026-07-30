"use strict";

const crypto = require("node:crypto");
const {
  INITIAL_DRAFTS,
  normalizeDraft,
  publishDraft,
  verifyPublishedSnapshot
} = require("../functions/questionnaire-studio");

const PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const DATABASE_ID = "(default)";
const FORM_ID = "reperes_cfsb";
const SLUG = "reperes-cfsb";
const PUBLIC_ORIGIN = "https://cfsb-dashboard-coach-aa9a4.web.app";
const V1_VERSION = "1";
const V2_VERSION = "2";
const V1_VERSION_ID = `${FORM_ID}_v${V1_VERSION}`;
const V2_VERSION_ID = `${FORM_ID}_v${V2_VERSION}`;
const EXPECTED_V1_HASH = "Cir10OcaFefqzXpmR83Xf598Y1EdWIiTzRClop59KGM";
const EXPECTED_V2_HASH = "NB4xhuqLECIvs2-gZmQZ54ObrnkuRMm4xeaQkX52XPM";
const V2_PUBLISHED_AT = "2026-07-29T19:41:35.000Z";
const RELEASE_VERSION = "20260729-questionnaire-studio-stabilized";
const SYSTEM_ACTOR_UID = "system:reperes-v2-sealed-release";
const PUBLISH_AUDIT_ID = "reperes_cfsb_v2_NB4xhuqLECIv";
const ROLLBACK_AUDIT_ID = `${PUBLISH_AUDIT_ID}_rollback`;
const DELIVERY_PROOF_DEFAULTS = Object.freeze({
  deliveryVerifiedAt: null,
  deliveryVerifiedByUid: "",
  deliveryVerifiedByEmail: "",
  deliveryVerificationNote: "",
  deliveryVerifiedVersionId: "",
  deliveryVerifiedVersionHash: "",
  deliveryVerifiedGhlTag: "",
  deliveryVerifiedPublicUrl: ""
});
const DELIVERY_PROOF_FIELDS = Object.freeze(Object.keys(DELIVERY_PROOF_DEFAULTS));
const HASH_43_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SHA_40_PATTERN = /^[a-f0-9]{40}$/;
const SHA_64_PATTERN = /^[a-f0-9]{64}$/;
const MODES = Object.freeze([
  "preview",
  "execute",
  "verify",
  "rollback-preview",
  "rollback-execute",
  "rollback-verify"
]);

class ReperesV2ReleaseError extends Error {
  constructor(code) {
    super(String(code || "reperes_v2_release_error"));
    this.name = "ReperesV2ReleaseError";
    this.code = String(code || "reperes_v2_release_error");
  }
}

function fail(code) {
  throw new ReperesV2ReleaseError(code);
}

function clean(value) {
  return String(value ?? "").trim();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function sha256Base64Url(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("base64url");
}

function assertReleaseCommit(value) {
  const commit = clean(value).toLowerCase();
  if (!SHA_40_PATTERN.test(commit)) fail("release_commit_invalid");
  return commit;
}

function assertToolingCommit(value) {
  const commit = clean(value).toLowerCase();
  if (!SHA_40_PATTERN.test(commit)) fail("tooling_commit_invalid");
  return commit;
}

function assertPlanHash(value, code = "plan_hash_invalid") {
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
  if (!["execute", "rollback-execute"].includes(mode)) {
    return Object.freeze({ authorized: false, readOnly: true });
  }
  if (clean(env.CFSB_REPERES_V2_RELEASE_GO).toLowerCase() !== releaseCommit) {
    fail("release_go_missing");
  }
  if (mode === "execute") {
    const expectedPlanHash = assertPlanHash(
      env.CFSB_REPERES_V2_PLAN_HASH,
      "publication_plan_hash_missing"
    );
    if (expectedPlanHash !== assertPlanHash(planHash)) {
      fail("publication_plan_hash_mismatch");
    }
  } else {
    if (clean(env.CFSB_REPERES_V2_ROLLBACK_GO).toLowerCase() !== releaseCommit) {
      fail("rollback_go_missing");
    }
    const expectedPlanHash = assertPlanHash(
      env.CFSB_REPERES_V2_ROLLBACK_PLAN_HASH,
      "rollback_plan_hash_missing"
    );
    if (expectedPlanHash !== assertPlanHash(planHash)) {
      fail("rollback_plan_hash_mismatch");
    }
  }
  return Object.freeze({ authorized: true, readOnly: false });
}

function draftFingerprint(draft) {
  return sha256Base64Url(stableJson(normalizeDraft(draft)));
}

function draftFromDefinition(definitionInput) {
  const definition = verifyPublishedSnapshot(definitionInput);
  return normalizeDraft({
    schemaVersion: definition.schemaVersion,
    status: "draft",
    slug: definition.slug,
    title: definition.title,
    description: definition.description,
    ghlTag: definition.ghlTag,
    identity: definition.identity,
    settings: definition.settings,
    sections: definition.sections,
    rules: definition.rules,
    responsePolicy: definition.responsePolicy
  });
}

function buildCandidate() {
  const draft = normalizeDraft(INITIAL_DRAFTS.educationalBenchmarks);
  const definition = publishDraft(draft, {
    version: V2_VERSION,
    publishedAt: V2_PUBLISHED_AT
  });
  if (
    definition.versionHash !== EXPECTED_V2_HASH
    || definition.slug !== SLUG
    || definition.version !== V2_VERSION
    || definition.canonicalPath !== `/questionnaire/f/${SLUG}`
  ) {
    fail("sealed_v2_candidate_mismatch");
  }
  return Object.freeze({
    draft,
    definition,
    draftFingerprint: draftFingerprint(draft),
    publicUrl: `${PUBLIC_ORIGIN}${definition.canonicalPath}`
  });
}

function ghlTagReservationId(value) {
  return sha256Hex(clean(value).toLowerCase());
}

function documentRoot() {
  return `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
}

function documentNames(candidate = buildCandidate()) {
  const root = documentRoot();
  return Object.freeze({
    form: `${root}/questionnaireForms/${FORM_ID}`,
    catalog: `${root}/questionnaireCatalog/${FORM_ID}`,
    slug: `${root}/questionnairePublicSlugs/${SLUG}`,
    v1: `${root}/questionnaireFormVersions/${V1_VERSION_ID}`,
    v2: `${root}/questionnaireFormVersions/${V2_VERSION_ID}`,
    tag: `${root}/questionnaireGhlTags/${ghlTagReservationId(candidate.draft.ghlTag)}`,
    publishAudit: `${root}/questionnaireStudioAudit/${PUBLISH_AUDIT_ID}`,
    rollbackAudit: `${root}/questionnaireStudioAudit/${ROLLBACK_AUDIT_ID}`
  });
}

function assertDocument(doc, code) {
  if (
    !doc
    || typeof doc !== "object"
    || Array.isArray(doc)
    || !clean(doc.name)
    || !clean(doc.updateTime)
    || !doc.value
    || typeof doc.value !== "object"
    || Array.isArray(doc.value)
  ) {
    fail(code);
  }
  return doc;
}

function assertDocumentName(doc, expectedName, code) {
  assertDocument(doc, code);
  if (doc.name !== expectedName) fail(code);
  return doc;
}

function assertEqual(actual, expected, code) {
  if (stableJson(actual) !== stableJson(expected)) fail(code);
}

function validTimestamp(value) {
  const text = clean(value);
  return text.endsWith("Z") && Number.isFinite(new Date(text).getTime());
}

function assertRecordShape(value, requiredKeys, optionalKeys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const required = new Set(requiredKeys);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (
    [...required].some((key) => !Object.hasOwn(value, key))
    || Object.keys(value).some((key) => !allowed.has(key))
  ) {
    fail(code);
  }
}

function validateVersionDocument(docInput, {
  expectedId,
  expectedVersion,
  expectedHash,
  expectedName
}) {
  const doc = assertDocumentName(docInput, expectedName, "version_document_invalid");
  const value = doc.value;
  let definition;
  try {
    definition = verifyPublishedSnapshot(value.definition);
  } catch (_error) {
    fail("version_definition_invalid");
  }
  if (
    !HASH_43_PATTERN.test(expectedHash)
    || value.formId !== FORM_ID
    || value.versionId !== expectedId
    || value.version !== expectedVersion
    || value.versionHash !== expectedHash
    || definition.version !== expectedVersion
    || definition.versionHash !== expectedHash
    || definition.slug !== SLUG
    || definition.canonicalPath !== `/questionnaire/f/${SLUG}`
    || value.publishedAt !== definition.publishedAt
    || !validTimestamp(value.createdAt)
    || !clean(value.createdByUid)
  ) {
    fail("version_document_mismatch");
  }
  assertRecordShape(
    value,
    [
      "formId",
      "versionId",
      "version",
      "definition",
      "versionHash",
      "publishedAt",
      "createdAt",
      "createdByUid"
    ],
    [],
    "version_document_shape_invalid"
  );
  return definition;
}

function validateTag(docInput, candidate, names) {
  const doc = assertDocumentName(docInput, names.tag, "ghl_tag_reservation_invalid");
  const value = doc.value;
  if (
    value.formId !== FORM_ID
    || clean(value.normalizedTag).toLowerCase() !== candidate.draft.ghlTag.toLowerCase()
    || clean(value.ghlTag).toLowerCase() !== candidate.draft.ghlTag.toLowerCase()
    || value.status !== "reserved"
  ) {
    fail("ghl_tag_reservation_mismatch");
  }
  assertRecordShape(
    value,
    ["normalizedTag", "ghlTag", "formId", "status", "updatedAt"],
    [],
    "ghl_tag_reservation_shape_invalid"
  );
  if (!validTimestamp(value.updatedAt)) fail("ghl_tag_reservation_time_invalid");
}

function validateV1Pointers(state, candidate, expectedV1Hash) {
  const names = documentNames(candidate);
  const definition = validateVersionDocument(state.v1, {
    expectedId: V1_VERSION_ID,
    expectedVersion: V1_VERSION,
    expectedHash: expectedV1Hash,
    expectedName: names.v1
  });
  if (
    definition.ghlTag.toLowerCase() !== candidate.draft.ghlTag.toLowerCase()
    || `${PUBLIC_ORIGIN}${definition.canonicalPath}` !== candidate.publicUrl
  ) {
    fail("v1_v2_routing_contract_mismatch");
  }

  const form = assertDocumentName(state.form, names.form, "form_document_invalid").value;
  const catalog = assertDocumentName(
    state.catalog,
    names.catalog,
    "catalog_document_invalid"
  ).value;
  const slug = assertDocumentName(state.slug, names.slug, "slug_document_invalid").value;
  if (
    form.formId !== FORM_ID
    || form.slug !== SLUG
    || form.status !== "published"
    || form.activeVersion !== V1_VERSION
    || form.activeVersionId !== V1_VERSION_ID
    || form.activeVersionHash !== expectedV1Hash
    || form.versionNumber !== 1
    || form.publicPath !== definition.canonicalPath
    || form.publicUrl !== candidate.publicUrl
    || form.hasUnpublishedChanges !== false
    || !Number.isInteger(form.draftRevision)
    || form.draftRevision < 1
  ) {
    fail("v1_form_state_mismatch");
  }
  const v1Draft = draftFromDefinition(definition);
  const v1Fingerprint = draftFingerprint(v1Draft);
  if (
    stableJson(normalizeDraft(form.draft)) !== stableJson(v1Draft)
    || form.draftFingerprint !== v1Fingerprint
    || form.activeDraftFingerprint !== v1Fingerprint
  ) {
    fail("v1_draft_state_mismatch");
  }
  if (
    catalog.formId !== FORM_ID
    || catalog.slug !== SLUG
    || catalog.status !== "published"
    || catalog.activeVersion !== V1_VERSION
    || catalog.activeVersionId !== V1_VERSION_ID
    || catalog.activeVersionHash !== expectedV1Hash
    || catalog.publicPath !== definition.canonicalPath
    || catalog.publicUrl !== candidate.publicUrl
    || clean(catalog.ghlTag).toLowerCase() !== candidate.draft.ghlTag.toLowerCase()
  ) {
    fail("v1_catalog_state_mismatch");
  }
  if (
    slug.slug !== SLUG
    || slug.formId !== FORM_ID
    || slug.version !== V1_VERSION
    || slug.versionId !== V1_VERSION_ID
    || slug.status !== "published"
  ) {
    fail("v1_slug_state_mismatch");
  }
  validateTag(state.tag, candidate, names);
  return Object.freeze({ definition, draft: v1Draft, fingerprint: v1Fingerprint });
}

function validatePreState(state, candidate = buildCandidate(), {
  expectedV1Hash = EXPECTED_V1_HASH
} = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    fail("pre_state_invalid");
  }
  if (state.v2 !== null && state.v2 !== undefined) fail("v2_already_exists");
  if (state.publishAudit !== null && state.publishAudit !== undefined) {
    fail("publication_audit_already_exists");
  }
  if (state.rollbackAudit !== null && state.rollbackAudit !== undefined) {
    fail("rollback_audit_already_exists");
  }
  return validateV1Pointers(state, candidate, expectedV1Hash);
}

function deliveryProofReset() {
  return {
    deliveryReady: false,
    ...DELIVERY_PROOF_DEFAULTS
  };
}

function deliveryStateFromForm(form) {
  const state = { deliveryReady: form.deliveryReady };
  for (const field of DELIVERY_PROOF_FIELDS) state[field] = form[field];
  return state;
}

function validateDeliveryState(state, candidate, {
  requireReset = false,
  code = "delivery_state_invalid"
} = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) fail(code);
  assertRecordShape(
    state,
    ["deliveryReady", ...DELIVERY_PROOF_FIELDS],
    [],
    code
  );
  if (requireReset || state.deliveryReady === false) {
    assertEqual(state, deliveryProofReset(), code);
    return Object.freeze({ ...state });
  }
  if (state.deliveryReady !== true) fail(code);
  if (
    !validTimestamp(state.deliveryVerifiedAt)
    || !clean(state.deliveryVerifiedByUid)
    || clean(state.deliveryVerificationNote).length < 8
    || state.deliveryVerifiedVersionId !== V2_VERSION_ID
    || state.deliveryVerifiedVersionHash !== candidate.definition.versionHash
    || clean(state.deliveryVerifiedGhlTag).toLowerCase()
      !== candidate.definition.ghlTag.toLowerCase()
    || state.deliveryVerifiedPublicUrl !== candidate.publicUrl
  ) {
    fail(code);
  }
  return Object.freeze({ ...state });
}

function catalogValue({ definition, form, deliveryReady = false }) {
  return {
    formId: FORM_ID,
    legacyType: clean(form.legacyType),
    status: "published",
    label: definition.title,
    title: definition.title,
    shortLabel: clean(form.shortLabel || definition.title),
    description: definition.description,
    slug: definition.slug,
    ghlTag: definition.ghlTag,
    publicPath: definition.canonicalPath,
    publicUrl: `${PUBLIC_ORIGIN}${definition.canonicalPath}`,
    activeVersionId: `${FORM_ID}_v${definition.version}`,
    activeVersion: definition.version,
    activeVersionHash: definition.versionHash,
    responsePolicy: definition.responsePolicy,
    settings: definition.settings,
    deliveryReady: deliveryReady === true
  };
}

function encodeFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("firestore_number_invalid");
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (value && typeof value === "object") {
    return { mapValue: { fields: encodeFirestoreFields(value) } };
  }
  fail("firestore_value_unsupported");
}

function encodeFirestoreFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("firestore_fields_invalid");
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, encodeFirestoreValue(item)])
  );
}

function decodeFirestoreValue(value = {}) {
  if (Object.hasOwn(value, "nullValue")) return null;
  if (Object.hasOwn(value, "booleanValue")) return value.booleanValue === true;
  if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if (Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.hasOwn(value, "timestampValue")) return clean(value.timestampValue);
  if (Object.hasOwn(value, "stringValue")) return clean(value.stringValue);
  if (value.arrayValue) {
    return (value.arrayValue.values || []).map(decodeFirestoreValue);
  }
  if (value.mapValue) return decodeFirestoreFields(value.mapValue.fields || {});
  fail("firestore_value_invalid");
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

function requestTime(fieldPath) {
  return { fieldPath, setToServerValue: "REQUEST_TIME" };
}

function createWrite(name, value, transforms = []) {
  return {
    update: { name, fields: encodeFirestoreFields(value) },
    currentDocument: { exists: false },
    ...(transforms.length ? { updateTransforms: transforms } : {})
  };
}

function replaceWrite(name, value, updateTime, transforms = []) {
  return {
    update: { name, fields: encodeFirestoreFields(value) },
    currentDocument: { updateTime: clean(updateTime) },
    ...(transforms.length ? { updateTransforms: transforms } : {})
  };
}

function patchWrite(name, value, updateTime, transforms = []) {
  return {
    update: { name, fields: encodeFirestoreFields(value) },
    updateMask: { fieldPaths: Object.keys(value).sort() },
    currentDocument: { updateTime: clean(updateTime) },
    ...(transforms.length ? { updateTransforms: transforms } : {})
  };
}

function deleteAbsentWrite(name) {
  return {
    delete: clean(name),
    currentDocument: { exists: false }
  };
}

function validateRestWritePlan(writes) {
  if (!Array.isArray(writes) || writes.length < 1) {
    fail("rest_write_plan_invalid");
  }
  for (const write of writes) {
    if (!write || typeof write !== "object" || Array.isArray(write)) {
      fail("rest_write_plan_invalid");
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
      fail("rest_write_operation_invalid");
    }
    const operationCount =
      Number(Boolean(write.update)) + Number(Boolean(write.delete));
    if (
      operationCount !== 1
      || !write.currentDocument
      || typeof write.currentDocument !== "object"
      || Array.isArray(write.currentDocument)
    ) {
      fail("rest_write_operation_invalid");
    }
    const currentKeys = Object.keys(write.currentDocument);
    const hasUpdateTime = Object.hasOwn(
      write.currentDocument,
      "updateTime"
    );
    const hasExists = Object.hasOwn(write.currentDocument, "exists");
    if (
      hasUpdateTime === hasExists
      || currentKeys.length !== 1
      || (hasUpdateTime && !validTimestamp(write.currentDocument.updateTime))
      || (hasExists && write.currentDocument.exists !== false)
    ) {
      fail("rest_write_precondition_invalid");
    }
    if (write.update) {
      const fields = write.update.fields;
      if (
        stableJson(Object.keys(write.update).sort())
          !== stableJson(["fields", "name"])
        ||
        !clean(write.update.name).startsWith(`${documentRoot()}/`)
        || !fields
        || typeof fields !== "object"
        || Array.isArray(fields)
        || Object.keys(fields).length < 1
      ) {
        fail("rest_update_invalid");
      }
      if (write.updateMask) {
        const paths = write.updateMask.fieldPaths;
        if (
          Object.keys(write.updateMask).length !== 1
          || !Array.isArray(paths)
          || paths.length < 1
          || paths.some((fieldPath) => !clean(fieldPath))
          || new Set(paths).size !== paths.length
          || stableJson(paths) !== stableJson([...paths].sort())
          || paths.some((fieldPath) => !Object.hasOwn(fields, fieldPath))
        ) {
          fail("rest_update_mask_invalid");
        }
      }
      if (write.updateTransforms) {
        if (
          !Array.isArray(write.updateTransforms)
          || write.updateTransforms.length < 1
        ) {
          fail("rest_update_transforms_invalid");
        }
        const transformedFields = [];
        for (const transform of write.updateTransforms) {
          if (
            !transform
            || typeof transform !== "object"
            || Array.isArray(transform)
            || Object.keys(transform).length !== 2
            || !clean(transform.fieldPath)
            || transform.setToServerValue !== "REQUEST_TIME"
          ) {
            fail("rest_update_transforms_invalid");
          }
          transformedFields.push(transform.fieldPath);
        }
        if (new Set(transformedFields).size !== transformedFields.length) {
          fail("rest_update_transforms_invalid");
        }
        if (transformedFields.some((fieldPath) =>
          Object.hasOwn(fields, fieldPath)
        )) {
          fail("rest_update_transforms_invalid");
        }
      }
      continue;
    }
    if (
      !clean(write.delete).startsWith(`${documentRoot()}/`)
      || !hasExists
      || Object.hasOwn(write, "updateMask")
      || Object.hasOwn(write, "updateTransforms")
    ) {
      fail("rest_delete_guard_invalid");
    }
  }
  return Object.freeze({ operations: writes.length });
}

function validateCommitWriteResults(payload, expectedWriteCount) {
  const expected = Number(expectedWriteCount);
  const writeResults = payload?.writeResults;
  if (
    !Number.isInteger(expected)
    || expected < 1
    || !Array.isArray(writeResults)
    || writeResults.length !== expected
    || !validTimestamp(payload?.commitTime)
  ) {
    fail("atomic_commit_confirmation_invalid");
  }
  return Object.freeze({ operationsConfirmed: writeResults.length });
}

function publicationValues(state, candidate, releaseCommit) {
  const form = state.form.value;
  const formPatch = {
    slug: candidate.definition.slug,
    slugLocked: true,
    title: candidate.definition.title,
    description: candidate.definition.description,
    ghlTag: candidate.definition.ghlTag,
    ...deliveryProofReset(),
    status: "published",
    draft: candidate.draft,
    draftRevision: form.draftRevision + 1,
    draftFingerprint: candidate.draftFingerprint,
    hasUnpublishedChanges: false,
    activeDraftFingerprint: candidate.draftFingerprint,
    versionNumber: 2,
    activeVersion: V2_VERSION,
    activeVersionId: V2_VERSION_ID,
    activeVersionHash: candidate.definition.versionHash,
    publicPath: candidate.definition.canonicalPath,
    publicUrl: candidate.publicUrl,
    publishedByUid: SYSTEM_ACTOR_UID,
    updatedByUid: SYSTEM_ACTOR_UID
  };
  const version = {
    formId: FORM_ID,
    versionId: V2_VERSION_ID,
    version: V2_VERSION,
    definition: candidate.definition,
    versionHash: candidate.definition.versionHash,
    publishedAt: candidate.definition.publishedAt,
    createdByUid: SYSTEM_ACTOR_UID
  };
  const catalog = catalogValue({
    definition: candidate.definition,
    form,
    deliveryReady: false
  });
  const slug = {
    slug: SLUG,
    formId: FORM_ID,
    versionId: V2_VERSION_ID,
    version: V2_VERSION,
    status: "published"
  };
  const tag = {
    normalizedTag: candidate.draft.ghlTag.toLowerCase(),
    ghlTag: candidate.draft.ghlTag,
    formId: FORM_ID,
    status: "reserved"
  };
  const audit = {
    action: "questionnaire.published",
    formId: FORM_ID,
    actorUid: SYSTEM_ACTOR_UID,
    actorEmail: "",
    version: V2_VERSION,
    versionId: V2_VERSION_ID,
    slug: SLUG,
    versionHash: candidate.definition.versionHash,
    releaseCommit,
    sealedRelease: true,
    deliveryReady: false
  };
  return Object.freeze({ formPatch, version, catalog, slug, tag, audit });
}

function observedSource(docInput, code) {
  const doc = assertDocument(docInput, code);
  return Object.freeze({
    name: doc.name,
    documentHash: sha256Hex(stableJson(doc.value)),
    updateTime: doc.updateTime
  });
}

function planOperationCounts(plan) {
  validateRestWritePlan(plan?.writes);
  const writes = plan.writes;
  const intended = new Set(plan.intendedMutationDocuments || []);
  const guarded = new Set(plan.guardedDocuments || []);
  const expectedAbsent = new Set(plan.expectedAbsentDocuments || []);
  if (
    intended.size !== (plan.intendedMutationDocuments || []).length
    || guarded.size !== (plan.guardedDocuments || []).length
    || expectedAbsent.size !== (plan.expectedAbsentDocuments || []).length
    || [...intended].some((name) => guarded.has(name))
  ) {
    fail("atomic_plan_roles_invalid");
  }
  let mutations = 0;
  let guards = 0;
  const targets = [];
  for (const write of writes) {
    const name = write.update?.name || write.delete || "";
    targets.push(name);
    if (intended.has(name)) mutations += 1;
    else if (guarded.has(name)) guards += 1;
    else fail("atomic_plan_role_missing");
  }
  for (const name of expectedAbsent) {
    const write = writes.find((candidate) =>
      (candidate.update?.name || candidate.delete) === name
    );
    if (!write || write.currentDocument?.exists !== false) {
      fail("atomic_plan_absence_guard_missing");
    }
  }
  if (
    new Set(targets).size !== targets.length
    || writes.length !== mutations + guards
    || mutations !== intended.size
    || guards !== guarded.size
  ) {
    fail("atomic_plan_operation_shape_invalid");
  }
  return Object.freeze({
    operations: writes.length,
    mutations,
    guards
  });
}

function makePlan(
  operation,
  candidate,
  releaseCommitInput,
  toolingCommitInput,
  observedSources,
  writes,
  {
    intendedMutationDocuments,
    guardedDocuments,
    expectedAbsentDocuments = []
  }
) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  const toolingCommit = assertToolingCommit(toolingCommitInput);
  if (!Array.isArray(observedSources) || observedSources.length < 1) {
    fail("observed_sources_missing");
  }
  const core = {
    operation,
    projectId: PROJECT_ID,
    databaseId: DATABASE_ID,
    formId: FORM_ID,
    releaseCommit,
    toolingCommit,
    expectedV1Hash: EXPECTED_V1_HASH,
    candidateV2Hash: candidate.definition.versionHash,
    observedSources,
    intendedMutationDocuments,
    guardedDocuments,
    expectedAbsentDocuments,
    writes
  };
  const plan = {
    ...core,
    planHash: sha256Hex(stableJson(core))
  };
  planOperationCounts(plan);
  return Object.freeze(plan);
}

function buildPublicationPlan(state, candidate = buildCandidate(), options = {}) {
  validatePreState(state, candidate, options);
  const releaseCommit = assertReleaseCommit(options.releaseCommit);
  const toolingCommit = assertToolingCommit(options.toolingCommit);
  const names = documentNames(candidate);
  const values = publicationValues(state, candidate, releaseCommit);
  const writes = [
    patchWrite(
      names.v1,
      { versionHash: state.v1.value.versionHash },
      state.v1.updateTime
    ),
    deleteAbsentWrite(names.rollbackAudit),
    createWrite(names.v2, values.version, [requestTime("createdAt")]),
    patchWrite(
      names.form,
      values.formPatch,
      state.form.updateTime,
      [requestTime("publishedAt"), requestTime("updatedAt")]
    ),
    replaceWrite(
      names.catalog,
      values.catalog,
      state.catalog.updateTime,
      [requestTime("updatedAt")]
    ),
    replaceWrite(
      names.slug,
      values.slug,
      state.slug.updateTime,
      [requestTime("updatedAt")]
    ),
    patchWrite(
      names.tag,
      values.tag,
      state.tag.updateTime,
      [requestTime("updatedAt")]
    ),
    createWrite(names.publishAudit, values.audit, [requestTime("createdAt")])
  ];
  return makePlan(
    "publish_v2",
    candidate,
    releaseCommit,
    toolingCommit,
    [observedSource(state.v1, "v1_observed_source_invalid")],
    writes,
    {
      intendedMutationDocuments: [
        names.v2,
        names.form,
        names.catalog,
        names.slug,
        names.tag,
        names.publishAudit
      ],
      guardedDocuments: [names.v1, names.rollbackAudit],
      expectedAbsentDocuments: [
        names.v2,
        names.publishAudit,
        names.rollbackAudit
      ]
    }
  );
}

function validateCatalogDocument(docInput, expected, names, code) {
  const value = assertDocumentName(docInput, names.catalog, code).value;
  assertRecordShape(
    value,
    [...Object.keys(expected), "updatedAt"],
    [],
    code
  );
  for (const [key, expectedValue] of Object.entries(expected)) {
    assertEqual(value[key], expectedValue, code);
  }
  if (!validTimestamp(value.updatedAt)) fail(code);
  return value;
}

function validateSlugDocument(docInput, expected, names, code) {
  const value = assertDocumentName(docInput, names.slug, code).value;
  assertRecordShape(
    value,
    ["slug", "formId", "versionId", "version", "status", "updatedAt"],
    [],
    code
  );
  for (const [key, expectedValue] of Object.entries(expected)) {
    assertEqual(value[key], expectedValue, code);
  }
  if (!validTimestamp(value.updatedAt)) fail(code);
  return value;
}

function validatePublicationAudit(state, candidate, names, releaseCommitInput) {
  const releaseCommit = assertReleaseCommit(releaseCommitInput);
  const audit = assertDocumentName(
    state.publishAudit,
    names.publishAudit,
    "publication_audit_missing"
  ).value;
  const expected = {
    action: "questionnaire.published",
    formId: FORM_ID,
    actorUid: SYSTEM_ACTOR_UID,
    actorEmail: "",
    version: V2_VERSION,
    versionId: V2_VERSION_ID,
    slug: SLUG,
    versionHash: candidate.definition.versionHash,
    releaseCommit,
    sealedRelease: true,
    deliveryReady: false
  };
  assertRecordShape(
    audit,
    [...Object.keys(expected), "createdAt"],
    [],
    "publication_audit_shape_invalid"
  );
  for (const [key, expectedValue] of Object.entries(expected)) {
    assertEqual(audit[key], expectedValue, "publication_audit_invalid");
  }
  if (!validTimestamp(audit.createdAt)) fail("publication_audit_time_invalid");
  return audit;
}

function validatePostState(state, candidate = buildCandidate(), {
  expectedV1Hash = EXPECTED_V1_HASH,
  releaseCommit
} = {}) {
  const sealedCommit = assertReleaseCommit(releaseCommit);
  const names = documentNames(candidate);
  validateVersionDocument(state.v1, {
    expectedId: V1_VERSION_ID,
    expectedVersion: V1_VERSION,
    expectedHash: expectedV1Hash,
    expectedName: names.v1
  });
  validateVersionDocument(state.v2, {
    expectedId: V2_VERSION_ID,
    expectedVersion: V2_VERSION,
    expectedHash: candidate.definition.versionHash,
    expectedName: names.v2
  });
  const formDoc = assertDocumentName(state.form, names.form, "form_document_invalid");
  const form = formDoc.value;
  if (
    form.formId !== FORM_ID
    || form.slug !== SLUG
    || form.slugLocked !== true
    || form.title !== candidate.definition.title
    || form.description !== candidate.definition.description
    || clean(form.ghlTag).toLowerCase() !== candidate.definition.ghlTag.toLowerCase()
    || form.status !== "published"
    || form.activeVersion !== V2_VERSION
    || form.activeVersionId !== V2_VERSION_ID
    || form.activeVersionHash !== candidate.definition.versionHash
    || form.versionNumber !== 2
    || form.publicUrl !== candidate.publicUrl
    || form.publicPath !== candidate.definition.canonicalPath
    || form.hasUnpublishedChanges !== false
    || form.deliveryReady !== false
    || form.draftFingerprint !== candidate.draftFingerprint
    || form.activeDraftFingerprint !== candidate.draftFingerprint
    || stableJson(normalizeDraft(form.draft)) !== stableJson(candidate.draft)
    || !Number.isInteger(form.draftRevision)
    || form.draftRevision < 2
    || form.publishedByUid !== SYSTEM_ACTOR_UID
    || form.updatedByUid !== SYSTEM_ACTOR_UID
    || !validTimestamp(form.publishedAt)
    || !validTimestamp(form.updatedAt)
  ) {
    fail("v2_form_state_mismatch");
  }
  validateDeliveryState(deliveryStateFromForm(form), candidate, {
    requireReset: true,
    code: "v2_delivery_gate_not_closed"
  });
  const expectedCatalog = catalogValue({
    definition: candidate.definition,
    form,
    deliveryReady: false
  });
  validateCatalogDocument(
    state.catalog,
    expectedCatalog,
    names,
    "v2_catalog_state_mismatch"
  );
  validateSlugDocument(
    state.slug,
    {
      slug: SLUG,
      formId: FORM_ID,
      versionId: V2_VERSION_ID,
      version: V2_VERSION,
      status: "published"
    },
    names,
    "v2_slug_state_mismatch"
  );
  validateTag(state.tag, candidate, names);
  validatePublicationAudit(state, candidate, names, sealedCommit);
  return Object.freeze({
    v1Hash: expectedV1Hash,
    v2Hash: candidate.definition.versionHash,
    deliveryReady: false
  });
}

function validatePreservedDraftState(snapshot, candidate = buildCandidate(), {
  code = "rollback_preserved_draft_state_invalid"
} = {}) {
  const requiredFields = [
    "draft",
    "draftRevision",
    "draftFingerprint",
    "activeDraftFingerprint",
    "hasUnpublishedChanges",
    "title",
    "description",
    "slug",
    "slugLocked",
    "ghlTag",
    "status",
    "versionNumber",
    "activeVersion",
    "activeVersionId",
    "activeVersionHash",
    "publicPath",
    "publicUrl",
    "publishedAt",
    "publishedByUid",
    "updatedAt",
    "updatedByUid",
    "sourceFormUpdateTime",
    "sourceFormDocumentHash",
    "preservedStateHash"
  ];
  assertRecordShape(snapshot, requiredFields, [], code);

  let normalizedDraft;
  try {
    normalizedDraft = normalizeDraft(snapshot.draft);
  } catch (_error) {
    fail(code);
  }
  const fingerprint = draftFingerprint(normalizedDraft);
  const stateWithoutHash = Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key !== "preservedStateHash")
  );
  if (
    snapshot.draftRevision < 2
    || !Number.isInteger(snapshot.draftRevision)
    || !HASH_43_PATTERN.test(snapshot.draftFingerprint)
    || snapshot.draftFingerprint !== fingerprint
    || snapshot.activeDraftFingerprint !== candidate.draftFingerprint
    || snapshot.hasUnpublishedChanges
      !== (snapshot.draftFingerprint !== snapshot.activeDraftFingerprint)
    || snapshot.title !== normalizedDraft.title
    || snapshot.description !== normalizedDraft.description
    || snapshot.slug !== normalizedDraft.slug
    || clean(snapshot.ghlTag).toLowerCase() !== normalizedDraft.ghlTag.toLowerCase()
    || snapshot.slugLocked !== true
    || snapshot.status !== "published"
    || snapshot.versionNumber !== 2
    || snapshot.activeVersion !== V2_VERSION
    || snapshot.activeVersionId !== V2_VERSION_ID
    || snapshot.activeVersionHash !== candidate.definition.versionHash
    || snapshot.publicPath !== candidate.definition.canonicalPath
    || snapshot.publicUrl !== candidate.publicUrl
    || !validTimestamp(snapshot.publishedAt)
    || !clean(snapshot.publishedByUid)
    || !validTimestamp(snapshot.updatedAt)
    || !clean(snapshot.updatedByUid)
    || !validTimestamp(snapshot.sourceFormUpdateTime)
    || !SHA_64_PATTERN.test(snapshot.sourceFormDocumentHash)
    || !SHA_64_PATTERN.test(snapshot.preservedStateHash)
    || snapshot.preservedStateHash !== sha256Hex(stableJson(stateWithoutHash))
  ) {
    fail(code);
  }
  return Object.freeze(stableValue(snapshot));
}

function capturePreservedDraftState(formDocInput, candidate = buildCandidate()) {
  const names = documentNames(candidate);
  const formDoc = assertDocumentName(
    formDocInput,
    names.form,
    "rollback_source_form_invalid"
  );
  const form = formDoc.value;
  const state = {
    draft: stableValue(form.draft),
    draftRevision: form.draftRevision,
    draftFingerprint: form.draftFingerprint,
    activeDraftFingerprint: form.activeDraftFingerprint,
    hasUnpublishedChanges: form.hasUnpublishedChanges,
    title: form.title,
    description: form.description,
    slug: form.slug,
    slugLocked: form.slugLocked,
    ghlTag: form.ghlTag,
    status: form.status,
    versionNumber: form.versionNumber,
    activeVersion: form.activeVersion,
    activeVersionId: form.activeVersionId,
    activeVersionHash: form.activeVersionHash,
    publicPath: form.publicPath,
    publicUrl: form.publicUrl,
    publishedAt: form.publishedAt,
    publishedByUid: form.publishedByUid,
    updatedAt: form.updatedAt,
    updatedByUid: form.updatedByUid,
    sourceFormUpdateTime: formDoc.updateTime,
    sourceFormDocumentHash: sha256Hex(stableJson(form))
  };
  state.preservedStateHash = sha256Hex(stableJson(state));
  return validatePreservedDraftState(state, candidate);
}

function validateRollbackSourceState(state, candidate = buildCandidate(), {
  expectedV1Hash = EXPECTED_V1_HASH,
  releaseCommit
} = {}) {
  const sealedCommit = assertReleaseCommit(releaseCommit);
  const names = documentNames(candidate);
  const v1 = validateVersionDocument(state.v1, {
    expectedId: V1_VERSION_ID,
    expectedVersion: V1_VERSION,
    expectedHash: expectedV1Hash,
    expectedName: names.v1
  });
  validateVersionDocument(state.v2, {
    expectedId: V2_VERSION_ID,
    expectedVersion: V2_VERSION,
    expectedHash: candidate.definition.versionHash,
    expectedName: names.v2
  });
  const form = assertDocumentName(state.form, names.form, "form_document_invalid").value;
  let currentDraft;
  try {
    currentDraft = normalizeDraft(form.draft);
  } catch (_error) {
    fail("rollback_source_draft_invalid");
  }
  const currentFingerprint = draftFingerprint(currentDraft);
  const hasUnpublishedChanges = currentFingerprint !== candidate.draftFingerprint;
  if (
    form.formId !== FORM_ID
    || form.slug !== SLUG
    || form.slugLocked !== true
    || form.status !== "published"
    || form.activeVersion !== V2_VERSION
    || form.activeVersionId !== V2_VERSION_ID
    || form.activeVersionHash !== candidate.definition.versionHash
    || form.versionNumber !== 2
    || form.publicUrl !== candidate.publicUrl
    || form.publicPath !== candidate.definition.canonicalPath
    || form.activeDraftFingerprint !== candidate.draftFingerprint
    || form.draftFingerprint !== currentFingerprint
    || form.hasUnpublishedChanges !== hasUnpublishedChanges
    || !Number.isInteger(form.draftRevision)
    || form.draftRevision < 2
    || !validTimestamp(form.publishedAt)
    || !validTimestamp(form.updatedAt)
  ) {
    fail("rollback_source_form_mismatch");
  }
  const previousDeliveryState = validateDeliveryState(
    deliveryStateFromForm(form),
    candidate,
    { code: "rollback_source_delivery_state_invalid" }
  );
  const expectedCatalog = catalogValue({
    definition: candidate.definition,
    form,
    deliveryReady: previousDeliveryState.deliveryReady
  });
  validateCatalogDocument(
    state.catalog,
    expectedCatalog,
    names,
    "rollback_source_catalog_mismatch"
  );
  validateSlugDocument(
    state.slug,
    {
      slug: SLUG,
      formId: FORM_ID,
      versionId: V2_VERSION_ID,
      version: V2_VERSION,
      status: "published"
    },
    names,
    "rollback_source_slug_mismatch"
  );
  validateTag(state.tag, candidate, names);
  validatePublicationAudit(state, candidate, names, sealedCommit);
  if (state.rollbackAudit !== null && state.rollbackAudit !== undefined) {
    fail("rollback_audit_already_exists");
  }
  const preservedDraftState = capturePreservedDraftState(state.form, candidate);
  return Object.freeze({
    v1,
    previousDeliveryState,
    hadUnpublishedChanges: hasUnpublishedChanges,
    preservedDraftState
  });
}

function rollbackValues(
  state,
  candidate,
  expectedV1Hash,
  releaseCommit,
  toolingCommit,
  rollbackSource
) {
  const v1 = rollbackSource.v1;
  const draft = draftFromDefinition(v1);
  const fingerprint = draftFingerprint(draft);
  const form = state.form.value;
  const formPatch = {
    slug: v1.slug,
    slugLocked: true,
    title: v1.title,
    description: v1.description,
    ghlTag: v1.ghlTag,
    ...deliveryProofReset(),
    status: "published",
    draft,
    draftRevision: form.draftRevision + 1,
    draftFingerprint: fingerprint,
    hasUnpublishedChanges: false,
    activeDraftFingerprint: fingerprint,
    versionNumber: 2,
    activeVersion: V1_VERSION,
    activeVersionId: V1_VERSION_ID,
    activeVersionHash: expectedV1Hash,
    publicPath: v1.canonicalPath,
    publicUrl: `${PUBLIC_ORIGIN}${v1.canonicalPath}`,
    publishedByUid: SYSTEM_ACTOR_UID,
    updatedByUid: SYSTEM_ACTOR_UID
  };
  return Object.freeze({
    definition: v1,
    draft,
    fingerprint,
    formPatch,
    catalog: catalogValue({ definition: v1, form, deliveryReady: false }),
    slug: {
      slug: SLUG,
      formId: FORM_ID,
      versionId: V1_VERSION_ID,
      version: V1_VERSION,
      status: "published"
    },
    tag: {
      normalizedTag: v1.ghlTag.toLowerCase(),
      ghlTag: v1.ghlTag,
      formId: FORM_ID,
      status: "reserved"
    },
    audit: {
      action: "questionnaire.rollback",
      formId: FORM_ID,
      actorUid: SYSTEM_ACTOR_UID,
      actorEmail: "",
      fromVersion: V2_VERSION,
      fromVersionId: V2_VERSION_ID,
      fromVersionHash: candidate.definition.versionHash,
      toVersion: V1_VERSION,
      toVersionId: V1_VERSION_ID,
      toVersionHash: expectedV1Hash,
      sourceReleaseCommit: releaseCommit,
      toolingCommit,
      sealedRelease: true,
      deliveryReady: false,
      retainedVersionId: V2_VERSION_ID,
      retainedVersionHash: candidate.definition.versionHash,
      previousDeliveryState: rollbackSource.previousDeliveryState,
      preservedDraftState: rollbackSource.preservedDraftState
    }
  });
}

function buildRollbackPlan(state, candidate = buildCandidate(), {
  expectedV1Hash = EXPECTED_V1_HASH,
  releaseCommit,
  toolingCommit
} = {}) {
  const sealedCommit = assertReleaseCommit(releaseCommit);
  const sealedToolingCommit = assertToolingCommit(toolingCommit);
  const rollbackSource = validateRollbackSourceState(state, candidate, {
    expectedV1Hash,
    releaseCommit: sealedCommit
  });
  const names = documentNames(candidate);
  const values = rollbackValues(
    state,
    candidate,
    expectedV1Hash,
    sealedCommit,
    sealedToolingCommit,
    rollbackSource
  );
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
      names.publishAudit,
      { versionHash: state.publishAudit.value.versionHash },
      state.publishAudit.updateTime
    ),
    patchWrite(
      names.form,
      values.formPatch,
      state.form.updateTime,
      [requestTime("publishedAt"), requestTime("updatedAt")]
    ),
    replaceWrite(
      names.catalog,
      values.catalog,
      state.catalog.updateTime,
      [requestTime("updatedAt")]
    ),
    replaceWrite(
      names.slug,
      values.slug,
      state.slug.updateTime,
      [requestTime("updatedAt")]
    ),
    patchWrite(
      names.tag,
      values.tag,
      state.tag.updateTime,
      [requestTime("updatedAt")]
    ),
    createWrite(names.rollbackAudit, values.audit, [requestTime("createdAt")])
  ];
  return makePlan(
    "rollback_to_v1",
    candidate,
    sealedCommit,
    sealedToolingCommit,
    [
      observedSource(state.v1, "v1_observed_source_invalid"),
      observedSource(state.v2, "v2_observed_source_invalid")
    ],
    writes,
    {
      intendedMutationDocuments: [
        names.form,
        names.catalog,
        names.slug,
        names.tag,
        names.rollbackAudit
      ],
      guardedDocuments: [names.v1, names.v2, names.publishAudit],
      expectedAbsentDocuments: [names.rollbackAudit]
    }
  );
}

function validateRollbackState(state, candidate = buildCandidate(), {
  expectedV1Hash = EXPECTED_V1_HASH,
  releaseCommit,
  toolingCommit
} = {}) {
  const sealedCommit = assertReleaseCommit(releaseCommit);
  const sealedToolingCommit = assertToolingCommit(toolingCommit);
  const names = documentNames(candidate);
  const v1 = validateVersionDocument(state.v1, {
    expectedId: V1_VERSION_ID,
    expectedVersion: V1_VERSION,
    expectedHash: expectedV1Hash,
    expectedName: names.v1
  });
  validateVersionDocument(state.v2, {
    expectedId: V2_VERSION_ID,
    expectedVersion: V2_VERSION,
    expectedHash: candidate.definition.versionHash,
    expectedName: names.v2
  });
  const form = assertDocumentName(state.form, names.form, "form_document_invalid").value;
  const draft = draftFromDefinition(v1);
  const fingerprint = draftFingerprint(draft);
  if (
    form.formId !== FORM_ID
    || form.slug !== SLUG
    || form.slugLocked !== true
    || form.title !== v1.title
    || form.description !== v1.description
    || clean(form.ghlTag).toLowerCase() !== v1.ghlTag.toLowerCase()
    || form.status !== "published"
    || form.activeVersion !== V1_VERSION
    || form.activeVersionId !== V1_VERSION_ID
    || form.activeVersionHash !== expectedV1Hash
    || form.versionNumber !== 2
    || form.deliveryReady !== false
    || form.hasUnpublishedChanges !== false
    || form.draftFingerprint !== fingerprint
    || form.activeDraftFingerprint !== fingerprint
    || stableJson(normalizeDraft(form.draft)) !== stableJson(draft)
    || form.publicPath !== v1.canonicalPath
    || form.publicUrl !== `${PUBLIC_ORIGIN}${v1.canonicalPath}`
    || !Number.isInteger(form.draftRevision)
    || form.draftRevision < 3
    || form.publishedByUid !== SYSTEM_ACTOR_UID
    || form.updatedByUid !== SYSTEM_ACTOR_UID
    || !validTimestamp(form.publishedAt)
    || !validTimestamp(form.updatedAt)
  ) {
    fail("rollback_form_state_mismatch");
  }
  validateDeliveryState(deliveryStateFromForm(form), candidate, {
    requireReset: true,
    code: "rollback_delivery_gate_not_closed"
  });
  validateCatalogDocument(
    state.catalog,
    catalogValue({ definition: v1, form, deliveryReady: false }),
    names,
    "rollback_catalog_state_mismatch"
  );
  validateSlugDocument(
    state.slug,
    {
      slug: SLUG,
      formId: FORM_ID,
      versionId: V1_VERSION_ID,
      version: V1_VERSION,
      status: "published"
    },
    names,
    "rollback_slug_state_mismatch"
  );
  validateTag(state.tag, candidate, names);
  validatePublicationAudit(state, candidate, names, sealedCommit);
  const rollbackAudit = assertDocumentName(
    state.rollbackAudit,
    names.rollbackAudit,
    "rollback_audit_missing"
  ).value;
  const expectedRollbackAudit = {
    action: "questionnaire.rollback",
    formId: FORM_ID,
    actorUid: SYSTEM_ACTOR_UID,
    actorEmail: "",
    fromVersion: V2_VERSION,
    fromVersionId: V2_VERSION_ID,
    fromVersionHash: candidate.definition.versionHash,
    toVersion: V1_VERSION,
    toVersionId: V1_VERSION_ID,
    toVersionHash: expectedV1Hash,
    sourceReleaseCommit: sealedCommit,
    toolingCommit: sealedToolingCommit,
    sealedRelease: true,
    deliveryReady: false,
    retainedVersionId: V2_VERSION_ID,
    retainedVersionHash: candidate.definition.versionHash
  };
  assertRecordShape(
    rollbackAudit,
    [
      ...Object.keys(expectedRollbackAudit),
      "previousDeliveryState",
      "preservedDraftState",
      "createdAt"
    ],
    [],
    "rollback_audit_shape_invalid"
  );
  for (const [key, expectedValue] of Object.entries(expectedRollbackAudit)) {
    assertEqual(rollbackAudit[key], expectedValue, "rollback_audit_invalid");
  }
  validateDeliveryState(
    rollbackAudit.previousDeliveryState,
    candidate,
    { code: "rollback_previous_delivery_state_invalid" }
  );
  validatePreservedDraftState(
    rollbackAudit.preservedDraftState,
    candidate,
    { code: "rollback_preserved_draft_state_invalid" }
  );
  if (!validTimestamp(rollbackAudit.createdAt)) fail("rollback_audit_time_invalid");
  return Object.freeze({
    activeVersion: V1_VERSION,
    retainedV2: true,
    deliveryReady: false
  });
}

function safeErrorCode(error) {
  if (error instanceof ReperesV2ReleaseError) return error.code;
  return "unexpected_error";
}

module.exports = {
  DATABASE_ID,
  DELIVERY_PROOF_FIELDS,
  EXPECTED_V1_HASH,
  EXPECTED_V2_HASH,
  FORM_ID,
  MODES,
  PROJECT_ID,
  PUBLISH_AUDIT_ID,
  PUBLIC_ORIGIN,
  RELEASE_VERSION,
  ROLLBACK_AUDIT_ID,
  ReperesV2ReleaseError,
  SLUG,
  V1_VERSION_ID,
  V2_PUBLISHED_AT,
  V2_VERSION_ID,
  buildCandidate,
  buildPublicationPlan,
  buildRollbackPlan,
  capturePreservedDraftState,
  decodeFirestoreFields,
  documentNames,
  draftFingerprint,
  draftFromDefinition,
  encodeFirestoreFields,
  parseArgs,
  planOperationCounts,
  safeErrorCode,
  sha256Hex,
  stableJson,
  validateCommitWriteResults,
  validatePostState,
  validatePreservedDraftState,
  validatePreState,
  validateRollbackSourceState,
  validateRollbackState,
  validateRestWritePlan,
  verifyExecutionAuthority
};
