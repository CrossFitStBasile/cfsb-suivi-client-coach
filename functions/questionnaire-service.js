"use strict";

const crypto = require("node:crypto");
const {
  INITIAL_DRAFTS,
  QuestionnaireStudioError,
  checkIdempotentReplay,
  createIdempotencyRecord,
  normalizeDraft,
  normalizeSlug,
  publishDraft,
  stableJson,
  validateSubmission,
  verifyPublishedSnapshot
} = require("./questionnaire-studio");

const PUBLIC_ORIGIN = "https://cfsb-dashboard-coach-aa9a4.web.app";
const INITIAL_PUBLISHED_AT = "2026-07-23T00:00:00.000Z";
const MAX_PUBLIC_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_IP_MAX = 60;
const RATE_LIMIT_FORM_PHONE_MAX = 8;
const FORM_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

const INITIAL_FORM_META = Object.freeze({
  quarterly: {
    formId: "bilan_90_jours",
    legacyType: "suivi_global",
    shortLabel: "Bilan 90 j"
  },
  checkIn: {
    formId: "check_in_express",
    legacyType: "habitudes_quotidiennes",
    shortLabel: "Check-in"
  },
  lifestyleAssessment: {
    formId: "evaluation_habitudes_vie",
    legacyType: "evaluation_habitudes_vie",
    shortLabel: "Evaluation"
  },
  educationalBenchmarks: {
    formId: "reperes_cfsb",
    legacyType: "",
    shortLabel: "Reperes CFSB"
  }
});

class QuestionnaireServiceError extends Error {
  constructor(code, message, { status = 400, details = null } = {}) {
    super(message);
    this.name = "QuestionnaireServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("base64url");
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function canonicalPublicUrl(canonicalPath) {
  const path = cleanString(canonicalPath);
  if (!/^\/questionnaire\/f\/[a-z0-9][a-z0-9-]*$/.test(path)) {
    throw new QuestionnaireServiceError(
      "INVALID_CANONICAL_PATH",
      "Le chemin public du questionnaire est invalide."
    );
  }
  return `${PUBLIC_ORIGIN}${path}`;
}

function serialize(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, serialize(item)])
    );
  }
  return value;
}

function draftFingerprint(draft) {
  return sha256(stableJson(normalizeDraft(draft)));
}

function publishedDefinitionFromDoc(versionData) {
  const definition = versionData?.definition || versionData?.snapshot || versionData;
  return verifyPublishedSnapshot(definition);
}

function publicDefinition(snapshotInput) {
  const snapshot = verifyPublishedSnapshot(snapshotInput);
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
      message: snapshot.settings?.successMessage || "Ta reponse a bien ete recue."
    }
  };
}

function responseSchema(snapshotInput) {
  const snapshot = verifyPublishedSnapshot(snapshotInput);
  return {
    schemaVersion: snapshot.schemaVersion,
    slug: snapshot.slug,
    version: snapshot.version,
    title: snapshot.title,
    label: snapshot.title,
    sections: snapshot.sections.map((section) => ({
      id: section.id,
      title: section.title,
      fields: section.fields.map((field) => ({
        id: field.id,
        type: field.type,
        label: field.label,
        ...(field.options ? { options: field.options } : {})
      }))
    }))
  };
}

function questionnaireTypeFor(formId, legacyType) {
  return cleanString(legacyType) || `studio:${cleanString(formId)}`;
}

function catalogRecord({
  formId,
  legacyType = "",
  shortLabel = "",
  snapshot,
  deliveryReady = false
}) {
  const definition = verifyPublishedSnapshot(snapshot);
  return {
    formId,
    legacyType,
    status: "published",
    label: definition.title,
    title: definition.title,
    shortLabel: shortLabel || definition.title,
    description: definition.description,
    slug: definition.slug,
    ghlTag: definition.ghlTag,
    publicPath: definition.canonicalPath,
    publicUrl: canonicalPublicUrl(definition.canonicalPath),
    activeVersionId: `${formId}_v${definition.version}`,
    activeVersion: definition.version,
    activeVersionHash: definition.versionHash,
    responsePolicy: definition.responsePolicy,
    settings: definition.settings,
    deliveryReady: deliveryReady === true
  };
}

function initialEntryForSlug(slugInput) {
  const slug = normalizeSlug(slugInput);
  for (const [key, draft] of Object.entries(INITIAL_DRAFTS)) {
    if (draft.slug !== slug) continue;
    const meta = INITIAL_FORM_META[key];
    if (!meta) continue;
    return {
      key,
      meta,
      draft,
      snapshot: publishDraft(draft, {
        version: "1",
        publishedAt: INITIAL_PUBLISHED_AT
      })
    };
  }
  return null;
}

function serviceError(error) {
  if (error instanceof QuestionnaireServiceError) return error;
  if (error instanceof QuestionnaireStudioError) {
    const conflictCodes = new Set([
      "idempotency_conflict",
      "version_hash_mismatch",
      "submission_version_mismatch"
    ]);
    return new QuestionnaireServiceError(
      String(error.code || "INVALID_QUESTIONNAIRE").toUpperCase(),
      error.message,
      {
        status: conflictCodes.has(error.code) ? 409 : 400,
        details: error.details || null
      }
    );
  }
  return error;
}

function ensureAdminActor(actor) {
  const uid = cleanString(actor?.uid);
  if (!uid) {
    throw new QuestionnaireServiceError(
      "ADMIN_REQUIRED",
      "Une identite administrateur est requise.",
      { status: 403 }
    );
  }
  return {
    uid,
    email: cleanString(actor?.email)
  };
}

function normalizeFormId(value) {
  const formId = cleanString(value);
  if (!FORM_ID_PATTERN.test(formId)) {
    throw new QuestionnaireServiceError("INVALID_FORM_ID", "L'identifiant du formulaire est invalide.");
  }
  return formId;
}

function normalizedGhlTag(value) {
  return cleanString(value).toLowerCase();
}

function ghlTagReservationId(value) {
  return crypto
    .createHash("sha256")
    .update(normalizedGhlTag(value), "utf8")
    .digest("hex");
}

function createQuestionnaireService({
  db,
  admin,
  clientRecordAvailableForMatching,
  clientPhone,
  coachDirectory = []
}) {
  if (!db || !admin) throw new Error("Firestore Admin est requis.");
  const fieldValue = admin.firestore.FieldValue;

  function auditRef() {
    return db.collection("questionnaireStudioAudit").doc();
  }

  function actorAudit(actor, action, formId, extra = {}) {
    return {
      action,
      formId,
      actorUid: cleanString(actor.uid),
      actorEmail: cleanString(actor.email),
      ...extra,
      createdAt: fieldValue.serverTimestamp()
    };
  }

  async function persistInitialEntry(initial, actor) {
    const { meta, draft, snapshot } = initial;
    const formRef = db.collection("questionnaireForms").doc(meta.formId);
    const versionId = `${meta.formId}_v1`;
    const versionRef = db.collection("questionnaireFormVersions").doc(versionId);
    const slugRef = db.collection("questionnairePublicSlugs").doc(snapshot.slug);
    const catalogRef = db.collection("questionnaireCatalog").doc(meta.formId);
    const tagRef = db.collection("questionnaireGhlTags").doc(
      ghlTagReservationId(snapshot.ghlTag)
    );
    return db.runTransaction(async (transaction) => {
      const [formSnap, slugSnap, tagSnap] = await Promise.all([
        transaction.get(formRef),
        transaction.get(slugRef),
        transaction.get(tagRef)
      ]);
      if (tagSnap.exists && cleanString(tagSnap.get("formId")) !== meta.formId) {
        return "ghl_tag_conflict";
      }
      if (formSnap.exists) {
        transaction.set(tagRef, {
          normalizedTag: normalizedGhlTag(snapshot.ghlTag),
          ghlTag: snapshot.ghlTag,
          formId: meta.formId,
          status: "reserved",
          updatedAt: fieldValue.serverTimestamp()
        });
        return "existing";
      }
      if (slugSnap.exists && cleanString(slugSnap.get("formId")) !== meta.formId) {
        return "slug_conflict";
      }
      const now = fieldValue.serverTimestamp();
      transaction.create(versionRef, {
        formId: meta.formId,
        versionId,
        version: "1",
        definition: snapshot,
        versionHash: snapshot.versionHash,
        publishedAt: snapshot.publishedAt,
        createdAt: now,
        createdByUid: actor.uid
      });
      transaction.create(formRef, {
        formId: meta.formId,
        legacyType: meta.legacyType,
        shortLabel: meta.shortLabel,
        slug: snapshot.slug,
        slugLocked: true,
        title: snapshot.title,
        description: snapshot.description,
        ghlTag: snapshot.ghlTag,
        deliveryReady: false,
        status: "published",
        draft,
        draftRevision: 1,
        draftFingerprint: draftFingerprint(draft),
        activeDraftFingerprint: draftFingerprint(draft),
        hasUnpublishedChanges: false,
        versionNumber: 1,
        activeVersion: "1",
        activeVersionId: versionId,
        activeVersionHash: snapshot.versionHash,
        publicPath: snapshot.canonicalPath,
        publicUrl: canonicalPublicUrl(snapshot.canonicalPath),
        createdAt: now,
        createdByUid: actor.uid,
        updatedAt: now,
        updatedByUid: actor.uid,
        publishedAt: now,
        publishedByUid: actor.uid
      });
      transaction.set(slugRef, {
        slug: snapshot.slug,
        formId: meta.formId,
        versionId,
        version: "1",
        status: "published",
        updatedAt: now
      });
      transaction.set(catalogRef, {
        ...catalogRecord({
          formId: meta.formId,
          legacyType: meta.legacyType,
          shortLabel: meta.shortLabel,
          snapshot,
          deliveryReady: false
        }),
        updatedAt: now
      });
      transaction.set(tagRef, {
        normalizedTag: normalizedGhlTag(snapshot.ghlTag),
        ghlTag: snapshot.ghlTag,
        formId: meta.formId,
        status: "reserved",
        updatedAt: now
      });
      transaction.set(
        auditRef(),
        actorAudit(actor, "questionnaire.initial_published", meta.formId, {
          version: "1",
          slug: snapshot.slug
        })
      );
      return "created";
    });
  }

  async function ensureInitialForms(actorInput) {
    const actor = ensureAdminActor(actorInput);
    const results = [];
    for (const draft of Object.values(INITIAL_DRAFTS)) {
      const initial = initialEntryForSlug(draft.slug);
      if (!initial) continue;
      const outcome = await persistInitialEntry(initial, actor);
      results.push({ formId: initial.meta.formId, status: outcome });
    }
    return results;
  }

  function serializeFormDoc(docSnap) {
    const data = docSnap.data() || {};
    return serialize({
      id: docSnap.id,
      formId: data.formId || docSnap.id,
      ...data
    });
  }

  async function listForms(actorInput, { initialize = true } = {}) {
    const actor = ensureAdminActor(actorInput);
    if (initialize) await ensureInitialForms(actor);
    const snap = await db.collection("questionnaireForms").limit(100).get();
    return snap.docs
      .map(serializeFormDoc)
      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  }

  async function saveDraft(actorInput, input = {}) {
    const actor = ensureAdminActor(actorInput);
    const draft = normalizeDraft(input.draft);
    const requestedId = cleanString(input.formId);
    const formRef = requestedId
      ? db.collection("questionnaireForms").doc(normalizeFormId(requestedId))
      : db.collection("questionnaireForms").doc();
    const expectedRevisionInput = input.expectedDraftRevision ?? input.expectedRevision;
    const expectedRevision = expectedRevisionInput === undefined
      ? null
      : Number(expectedRevisionInput);
    if (
      expectedRevision !== null &&
      (!Number.isInteger(expectedRevision) || expectedRevision < 0)
    ) {
      throw new QuestionnaireServiceError(
        "INVALID_DRAFT_REVISION",
        "La revision attendue du brouillon est invalide.",
        { status: 400 }
      );
    }
    const saved = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(formRef);
      const existing = snap.exists ? snap.data() || {} : {};
      if (existing.status === "archived") {
        throw new QuestionnaireServiceError(
          "FORM_ARCHIVED",
          "Duplique le formulaire archive avant de le modifier.",
          { status: 409 }
        );
      }
      if (existing.slugLocked && cleanString(existing.slug) !== draft.slug) {
        throw new QuestionnaireServiceError(
          "SLUG_IMMUTABLE",
          "Le slug reste fixe apres la premiere publication.",
          { status: 409 }
        );
      }
      const currentRevision = Number(existing.draftRevision || 0);
      if (expectedRevision !== null && expectedRevision !== currentRevision) {
        throw new QuestionnaireServiceError(
          "DRAFT_REVISION_CONFLICT",
          "Le brouillon a ete modifie dans une autre session. Recharge-le avant de continuer.",
          { status: 409 }
        );
      }
      const nextRevision = currentRevision + 1;
      const fingerprint = draftFingerprint(draft);
      const status = existing.status === "published" ? "published" : "draft";
      const now = fieldValue.serverTimestamp();
      transaction.set(formRef, {
        formId: formRef.id,
        legacyType: cleanString(existing.legacyType),
        shortLabel: cleanString(existing.shortLabel || draft.title),
        slug: draft.slug,
        slugLocked: existing.slugLocked === true,
        title: draft.title,
        description: draft.description,
        ghlTag: draft.ghlTag,
        status,
        draft,
        draftRevision: nextRevision,
        draftFingerprint: fingerprint,
        hasUnpublishedChanges: fingerprint !== cleanString(existing.activeDraftFingerprint),
        versionNumber: Number(existing.versionNumber || 0),
        activeVersion: cleanString(existing.activeVersion),
        activeVersionId: cleanString(existing.activeVersionId),
        activeVersionHash: cleanString(existing.activeVersionHash),
        publicPath: cleanString(existing.publicPath || draft.canonicalPath),
        publicUrl: cleanString(existing.publicUrl),
        createdAt: existing.createdAt || now,
        createdByUid: cleanString(existing.createdByUid || actor.uid),
        updatedAt: now,
        updatedByUid: actor.uid
      }, { merge: true });
      transaction.set(
        auditRef(),
        actorAudit(actor, "questionnaire.draft_saved", formRef.id, {
          draftRevision: nextRevision,
          slug: draft.slug
        })
      );
      return { formId: formRef.id, draftRevision: nextRevision };
    });
    const snap = await formRef.get();
    return { ...serializeFormDoc(snap), ...saved };
  }

  async function publishForm(actorInput, input = {}) {
    const actor = ensureAdminActor(actorInput);
    const formId = normalizeFormId(input.formId);
    const formRef = db.collection("questionnaireForms").doc(formId);
    const result = await db.runTransaction(async (transaction) => {
      const formSnap = await transaction.get(formRef);
      if (!formSnap.exists) {
        throw new QuestionnaireServiceError("FORM_NOT_FOUND", "Formulaire introuvable.", { status: 404 });
      }
      const form = formSnap.data() || {};
      if (form.status === "archived") {
        throw new QuestionnaireServiceError("FORM_ARCHIVED", "Le formulaire est archive.", { status: 409 });
      }
      const expectedRevisionInput = input.expectedDraftRevision ?? input.expectedRevision;
      if (expectedRevisionInput !== undefined) {
        const expectedRevision = Number(expectedRevisionInput);
        if (
          !Number.isInteger(expectedRevision) ||
          expectedRevision < 0 ||
          expectedRevision !== Number(form.draftRevision || 0)
        ) {
          throw new QuestionnaireServiceError(
            "DRAFT_REVISION_CONFLICT",
            "Le brouillon a ete modifie dans une autre session. Recharge-le avant de publier.",
            { status: 409 }
          );
        }
      }
      const draft = normalizeDraft(form.draft);
      const fingerprint = draftFingerprint(draft);
      const tagRef = db.collection("questionnaireGhlTags").doc(
        ghlTagReservationId(draft.ghlTag)
      );
      const tagSnap = await transaction.get(tagRef);
      if (tagSnap.exists && cleanString(tagSnap.get("formId")) !== formId) {
        throw new QuestionnaireServiceError(
          "GHL_TAG_ALREADY_USED",
          "Ce tag GHL appartient deja a un autre formulaire.",
          { status: 409 }
        );
      }
      if (
        form.status === "published" &&
        cleanString(form.activeDraftFingerprint) === fingerprint &&
        cleanString(form.activeVersionId)
      ) {
        transaction.set(tagRef, {
          normalizedTag: normalizedGhlTag(draft.ghlTag),
          ghlTag: draft.ghlTag,
          formId,
          status: "reserved",
          updatedAt: fieldValue.serverTimestamp()
        });
        return {
          formId,
          versionId: cleanString(form.activeVersionId),
          version: cleanString(form.activeVersion),
          publicUrl: cleanString(form.publicUrl),
          duplicate: true
        };
      }
      const slugRef = db.collection("questionnairePublicSlugs").doc(draft.slug);
      const slugSnap = await transaction.get(slugRef);
      if (slugSnap.exists && cleanString(slugSnap.get("formId")) !== formId) {
        throw new QuestionnaireServiceError(
          "SLUG_ALREADY_USED",
          "Cette adresse publique appartient deja a un autre formulaire.",
          { status: 409 }
        );
      }
      const versionNumber = Number(form.versionNumber || 0) + 1;
      const version = String(versionNumber);
      const versionId = `${formId}_v${version}`;
      const versionRef = db.collection("questionnaireFormVersions").doc(versionId);
      const versionSnap = await transaction.get(versionRef);
      if (versionSnap.exists) {
        throw new QuestionnaireServiceError(
          "VERSION_ALREADY_EXISTS",
          "Cette version existe deja; recharge le Studio.",
          { status: 409 }
        );
      }
      const snapshot = publishDraft(draft, {
        version,
        publishedAt: new Date().toISOString()
      });
      const now = fieldValue.serverTimestamp();
      const catalog = catalogRecord({
        formId,
        legacyType: cleanString(form.legacyType),
        shortLabel: cleanString(form.shortLabel),
        snapshot,
        // A newly published version stays manually shareable immediately, but
        // automated delivery remains fail-closed until its exact GHL workflow
        // and canonical URL have been verified again.
        deliveryReady: false
      });
      transaction.create(versionRef, {
        formId,
        versionId,
        version,
        definition: snapshot,
        versionHash: snapshot.versionHash,
        publishedAt: snapshot.publishedAt,
        createdAt: now,
        createdByUid: actor.uid
      });
      transaction.set(slugRef, {
        slug: draft.slug,
        formId,
        versionId,
        version,
        status: "published",
        updatedAt: now
      });
      transaction.set(db.collection("questionnaireCatalog").doc(formId), {
        ...catalog,
        updatedAt: now
      });
      transaction.set(tagRef, {
        normalizedTag: normalizedGhlTag(draft.ghlTag),
        ghlTag: draft.ghlTag,
        formId,
        status: "reserved",
        updatedAt: now
      });
      transaction.update(formRef, {
        slug: draft.slug,
        slugLocked: true,
        title: draft.title,
        description: draft.description,
        ghlTag: draft.ghlTag,
        deliveryReady: false,
        deliveryVerifiedAt: null,
        deliveryVerifiedByUid: "",
        deliveryVerifiedByEmail: "",
        deliveryVerificationNote: "",
        deliveryVerifiedVersionId: "",
        deliveryVerifiedVersionHash: "",
        deliveryVerifiedGhlTag: "",
        deliveryVerifiedPublicUrl: "",
        status: "published",
        hasUnpublishedChanges: false,
        activeDraftFingerprint: fingerprint,
        versionNumber,
        activeVersion: version,
        activeVersionId: versionId,
        activeVersionHash: snapshot.versionHash,
        publicPath: snapshot.canonicalPath,
        publicUrl: catalog.publicUrl,
        publishedAt: now,
        publishedByUid: actor.uid,
        updatedAt: now,
        updatedByUid: actor.uid
      });
      transaction.set(
        auditRef(),
        actorAudit(actor, "questionnaire.published", formId, {
          version,
          versionId,
          slug: draft.slug,
          versionHash: snapshot.versionHash
        })
      );
      return {
        formId,
        versionId,
        version,
        publicUrl: catalog.publicUrl,
        duplicate: false
      };
    });
    const snap = await formRef.get();
    return { ...serializeFormDoc(snap), publication: result };
  }

  async function archiveForm(actorInput, input = {}) {
    const actor = ensureAdminActor(actorInput);
    const formId = normalizeFormId(input.formId);
    const formRef = db.collection("questionnaireForms").doc(formId);
    await db.runTransaction(async (transaction) => {
      const formSnap = await transaction.get(formRef);
      if (!formSnap.exists) {
        throw new QuestionnaireServiceError("FORM_NOT_FOUND", "Formulaire introuvable.", { status: 404 });
      }
      const form = formSnap.data() || {};
      if (form.status === "archived") return;
      const slug = normalizeSlug(form.slug);
      const now = fieldValue.serverTimestamp();
      transaction.update(formRef, {
        status: "archived",
        deliveryReady: false,
        deliveryVerifiedAt: null,
        deliveryVerifiedByUid: "",
        deliveryVerifiedByEmail: "",
        deliveryVerificationNote: "",
        deliveryVerifiedVersionId: "",
        deliveryVerifiedVersionHash: "",
        deliveryVerifiedGhlTag: "",
        deliveryVerifiedPublicUrl: "",
        archivedAt: now,
        archivedByUid: actor.uid,
        updatedAt: now,
        updatedByUid: actor.uid
      });
      transaction.set(db.collection("questionnairePublicSlugs").doc(slug), {
        slug,
        formId,
        versionId: cleanString(form.activeVersionId),
        version: cleanString(form.activeVersion),
        status: "archived",
        updatedAt: now
      }, { merge: true });
      transaction.set(db.collection("questionnaireCatalog").doc(formId), {
        formId,
        status: "archived",
        deliveryReady: false,
        updatedAt: now
      }, { merge: true });
      transaction.set(
        auditRef(),
        actorAudit(actor, "questionnaire.archived", formId, { slug })
      );
    });
    return serializeFormDoc(await formRef.get());
  }

  async function setDeliveryReady(actorInput, input = {}) {
    const actor = ensureAdminActor(actorInput);
    const formId = normalizeFormId(input.formId);
    if (typeof input.ready !== "boolean") {
      throw new QuestionnaireServiceError(
        "INVALID_DELIVERY_STATE",
        "L'etat de livraison GHL doit etre explicite.",
        { status: 400 }
      );
    }
    const ready = input.ready;
    const verificationNote = cleanString(input.verificationNote).slice(0, 500);
    const formRef = db.collection("questionnaireForms").doc(formId);
    await db.runTransaction(async (transaction) => {
      const formSnap = await transaction.get(formRef);
      if (!formSnap.exists) {
        throw new QuestionnaireServiceError("FORM_NOT_FOUND", "Formulaire introuvable.", { status: 404 });
      }
      const form = formSnap.data() || {};
      const ghlTag = cleanString(form.ghlTag);
      const publicUrl = cleanString(form.publicUrl);
      const activeVersionId = cleanString(form.activeVersionId);
      const activeVersion = cleanString(form.activeVersion);
      const activeVersionHash = cleanString(form.activeVersionHash);
      if (ready) {
        if (
          form.status !== "published"
          || !activeVersionId
          || !activeVersion
          || !activeVersionHash
          || form.hasUnpublishedChanges === true
        ) {
          throw new QuestionnaireServiceError(
            "FORM_NOT_READY_FOR_DELIVERY",
            "Publie d'abord la version exacte a verifier dans GHL.",
            { status: 409 }
          );
        }
        const versionRef = db.collection("questionnaireFormVersions").doc(activeVersionId);
        const catalogRef = db.collection("questionnaireCatalog").doc(formId);
        const tagRef = db.collection("questionnaireGhlTags").doc(
          ghlTagReservationId(ghlTag)
        );
        const [versionSnap, catalogSnap, tagSnap] = await Promise.all([
          transaction.get(versionRef),
          transaction.get(catalogRef),
          transaction.get(tagRef)
        ]);
        let snapshot;
        try {
          snapshot = versionSnap.exists
            ? publishedDefinitionFromDoc(versionSnap.data() || {})
            : null;
        } catch (_error) {
          snapshot = null;
        }
        const catalog = catalogSnap.exists ? catalogSnap.data() || {} : {};
        const expectedPublicUrl = snapshot
          ? canonicalPublicUrl(snapshot.canonicalPath)
          : "";
        if (
          !snapshot
          || cleanString(versionSnap.get("formId")) !== formId
          || cleanString(versionSnap.get("versionId")) !== activeVersionId
          || cleanString(versionSnap.get("version")) !== activeVersion
          || cleanString(versionSnap.get("versionHash")) !== activeVersionHash
          || snapshot.version !== activeVersion
          || snapshot.versionHash !== activeVersionHash
          || normalizedGhlTag(snapshot.ghlTag) !== normalizedGhlTag(ghlTag)
          || expectedPublicUrl !== publicUrl
          || catalog.status !== "published"
          || cleanString(catalog.activeVersionId) !== activeVersionId
          || cleanString(catalog.activeVersion) !== activeVersion
          || cleanString(catalog.activeVersionHash) !== activeVersionHash
          || normalizedGhlTag(catalog.ghlTag) !== normalizedGhlTag(ghlTag)
          || cleanString(catalog.publicUrl) !== publicUrl
          || !tagSnap.exists
          || cleanString(tagSnap.get("formId")) !== formId
          || normalizedGhlTag(tagSnap.get("normalizedTag")) !== normalizedGhlTag(ghlTag)
          || cleanString(tagSnap.get("status")) !== "reserved"
        ) {
          throw new QuestionnaireServiceError(
            "DELIVERY_PUBLISHED_VERSION_MISMATCH",
            "La version publiée, le catalogue ou la réservation GHL ne concordent pas.",
            { status: 409 }
          );
        }
        if (
          normalizedGhlTag(input.confirmedGhlTag) !== normalizedGhlTag(ghlTag)
          || cleanString(input.confirmedPublicUrl) !== publicUrl
        ) {
          throw new QuestionnaireServiceError(
            "DELIVERY_CONFIRMATION_MISMATCH",
            "Le tag ou l'URL confirmes ne correspondent pas a la version publiee.",
            { status: 409 }
          );
        }
        if (verificationNote.length < 8) {
          throw new QuestionnaireServiceError(
            "DELIVERY_VERIFICATION_NOTE_REQUIRED",
            "Ajoute une courte preuve du canari GHL recu.",
            { status: 400 }
          );
        }
      }
      const now = fieldValue.serverTimestamp();
      const deliveryState = {
        deliveryReady: ready,
        deliveryVerifiedAt: ready ? now : null,
        deliveryVerifiedByUid: ready ? actor.uid : "",
        deliveryVerifiedByEmail: ready ? actor.email : "",
        deliveryVerificationNote: ready ? verificationNote : "",
        deliveryVerifiedVersionId: ready ? activeVersionId : "",
        deliveryVerifiedVersionHash: ready ? activeVersionHash : "",
        deliveryVerifiedGhlTag: ready ? ghlTag : "",
        deliveryVerifiedPublicUrl: ready ? publicUrl : "",
        updatedAt: now
      };
      transaction.update(formRef, {
        ...deliveryState,
        updatedByUid: actor.uid
      });
      transaction.set(
        db.collection("questionnaireCatalog").doc(formId),
        {
          deliveryReady: ready,
          updatedAt: now
        },
        { merge: true }
      );
      transaction.set(
        auditRef(),
        actorAudit(
          actor,
          ready ? "questionnaire.delivery_enabled" : "questionnaire.delivery_disabled",
          formId,
          {
            ghlTag,
            publicUrl,
            versionId: ready ? activeVersionId : "",
            versionHash: ready ? activeVersionHash : "",
            verificationNote: ready ? verificationNote : ""
          }
        )
      );
    });
    return serializeFormDoc(await formRef.get());
  }

  async function nextDuplicateSlug(baseSlug) {
    const base = normalizeSlug(`${baseSlug}-copie`);
    for (let index = 1; index <= 50; index += 1) {
      const candidate = index === 1 ? base : normalizeSlug(`${base}-${index}`);
      const [slugSnap, formSnap] = await Promise.all([
        db.collection("questionnairePublicSlugs").doc(candidate).get(),
        db.collection("questionnaireForms").where("slug", "==", candidate).limit(1).get()
      ]);
      if (!slugSnap.exists && formSnap.empty) return candidate;
    }
    return normalizeSlug(`${base}-${Date.now().toString(36)}`);
  }

  async function duplicateForm(actorInput, input = {}) {
    const actor = ensureAdminActor(actorInput);
    const sourceId = normalizeFormId(input.formId);
    const sourceSnap = await db.collection("questionnaireForms").doc(sourceId).get();
    if (!sourceSnap.exists) {
      throw new QuestionnaireServiceError("FORM_NOT_FOUND", "Formulaire introuvable.", { status: 404 });
    }
    const source = sourceSnap.data() || {};
    const draft = normalizeDraft(source.draft);
    const slug = await nextDuplicateSlug(draft.slug);
    const copy = normalizeDraft({
      ...draft,
      status: "draft",
      slug,
      title: `${draft.title} - copie`,
      ghlTag: normalizeSlug(`${draft.ghlTag}-copie`)
    });
    const saved = await saveDraft(actor, { draft: copy });
    await db.collection("questionnaireStudioAudit").add(
      actorAudit(actor, "questionnaire.duplicated", saved.formId, { sourceFormId: sourceId })
    );
    return saved;
  }

  async function loadPublishedBySlug(slugInput, requestedVersion = "") {
    const slug = normalizeSlug(slugInput);
    const requestedVersionText = cleanString(requestedVersion);
    if (requestedVersionText && !/^[0-9]+(?:\.[0-9]+){0,2}$/.test(requestedVersionText)) {
      throw new QuestionnaireServiceError(
        "INVALID_QUESTIONNAIRE_VERSION",
        "La version du questionnaire est invalide.",
        { status: 400 }
      );
    }
    const slugRef = db.collection("questionnairePublicSlugs").doc(slug);
    let slugSnap = await slugRef.get();
    if (!slugSnap.exists) {
      const initial = initialEntryForSlug(slug);
      if (!initial) {
        throw new QuestionnaireServiceError(
          "QUESTIONNAIRE_NOT_FOUND",
          "Ce questionnaire est introuvable.",
          { status: 404 }
        );
      }
      if (requestedVersionText && requestedVersionText !== "1") {
        throw new QuestionnaireServiceError(
          "QUESTIONNAIRE_VERSION_NOT_FOUND",
          "Cette version du questionnaire est introuvable.",
          { status: 404 }
        );
      }
      const outcome = await persistInitialEntry(initial, {
        uid: "system:questionnaire-public-bootstrap",
        email: ""
      });
      if (outcome === "slug_conflict") {
        throw new QuestionnaireServiceError(
          "QUESTIONNAIRE_SLUG_CONFLICT",
          "Cette adresse de questionnaire est déjà utilisée.",
          { status: 409 }
        );
      }
      slugSnap = await slugRef.get();
      if (!slugSnap.exists) {
        throw new QuestionnaireServiceError(
          "QUESTIONNAIRE_STATE_INCOMPLETE",
          "La publication du questionnaire est incomplète.",
          { status: 503 }
        );
      }
    }
    const slugData = slugSnap.data() || {};
    if (slugData.status === "archived") {
      throw new QuestionnaireServiceError(
        "QUESTIONNAIRE_ARCHIVED",
        "Ce questionnaire n'accepte plus de reponses.",
        { status: 410 }
      );
    }
    if (slugData.status !== "published") {
      throw new QuestionnaireServiceError(
        "QUESTIONNAIRE_NOT_PUBLISHED",
        "Ce questionnaire n'est pas publie.",
        { status: 404 }
      );
    }
    const formId = normalizeFormId(slugData.formId);
    let versionId = cleanString(slugData.versionId);
    if (requestedVersionText) versionId = `${formId}_v${requestedVersionText}`;
    const [formSnap, versionSnap] = await Promise.all([
      db.collection("questionnaireForms").doc(formId).get(),
      db.collection("questionnaireFormVersions").doc(versionId).get()
    ]);
    if (!formSnap.exists || formSnap.get("status") === "archived") {
      throw new QuestionnaireServiceError(
        "QUESTIONNAIRE_ARCHIVED",
        "Ce questionnaire n'accepte plus de reponses.",
        { status: 410 }
      );
    }
    if (!versionSnap.exists) {
      throw new QuestionnaireServiceError(
        "QUESTIONNAIRE_VERSION_NOT_FOUND",
        "Cette version du questionnaire est introuvable.",
        { status: 404 }
      );
    }
    const snapshot = publishedDefinitionFromDoc(versionSnap.data() || {});
    if (snapshot.slug !== slug) {
      throw new QuestionnaireServiceError(
        "QUESTIONNAIRE_SLUG_MISMATCH",
        "La version ne correspond pas a cette adresse publique.",
        { status: 409 }
      );
    }
    return {
      formId,
      legacyType: cleanString(formSnap.get("legacyType")),
      versionId,
      snapshot,
      fallback: false
    };
  }

  async function getPublicForm(slugInput) {
    const loaded = await loadPublishedBySlug(slugInput);
    return {
      ok: true,
      questionnaire: publicDefinition(loaded.snapshot)
    };
  }

  async function enforceRateLimit({
    scope = "",
    subject = "",
    max = 1
  } = {}) {
    const normalizedScope = cleanString(scope).slice(0, 40);
    const normalizedSubject = cleanString(subject).slice(0, 320);
    if (!normalizedScope || !normalizedSubject) {
      throw new QuestionnaireServiceError(
        "RATE_LIMIT_CONTEXT_MISSING",
        "Le contrôle anti-abus ne peut pas être évalué.",
        { status: 500 }
      );
    }
    const bucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
    const rateId = sha256(
      `${normalizedScope}|${normalizedSubject}|${bucket}`
    ).slice(0, 48);
    const rateRef = db.collection("questionnaireRateLimits").doc(rateId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(rateRef);
      const count = Number(snap.get("count") || 0);
      if (count >= Math.max(1, Number(max) || 1)) {
        throw new QuestionnaireServiceError(
          "RATE_LIMITED",
          "Trop de tentatives ont ete recues. Reessaie dans quelques minutes.",
          { status: 429 }
        );
      }
      transaction.set(rateRef, {
        count: count + 1,
        scope: normalizedScope,
        bucket,
        expiresAt: admin.firestore.Timestamp.fromMillis(
          (bucket + 2) * RATE_LIMIT_WINDOW_MS
        ),
        updatedAt: fieldValue.serverTimestamp()
      }, { merge: true });
    });
  }

  async function matchingClients(phoneNormalized) {
    const fields = ["phoneNormalized", "clientPhoneNormalized", "client_phone_normalized"];
    const snaps = await Promise.all(
      fields.map((field) => db.collection("clients").where(field, "==", phoneNormalized).limit(10).get())
    );
    const byId = new Map();
    snaps.forEach((snap) => snap.docs.forEach((docSnap) => byId.set(docSnap.id, docSnap)));
    return [...byId.values()].filter((docSnap) => {
      const data = docSnap.data() || {};
      return cleanString(clientPhone(data)) === phoneNormalized;
    });
  }

  function coachNameFor(client, coachId) {
    return cleanString(client.coachName)
      || cleanString(coachDirectory.find((coach) =>
        cleanString(coach.id) === coachId || cleanString(coach.coachRxId) === coachId
      )?.name);
  }

  function triageData(validated, snapshot) {
    const statusMap = { green: "vert", yellow: "jaune", red: "rouge" };
    const actionMap = {
      green: "lire_archiver",
      yellow: "ajustement_leger",
      red: "contact_prioritaire"
    };
    const fieldMap = new Map(
      snapshot.sections.flatMap((section) => section.fields.map((field) => [field.id, field]))
    );
    const ruleMap = new Map(snapshot.rules.map((rule) => [rule.id, rule]));
    const signals = validated.triage.matchedRuleIds.map((ruleId) => {
      const rule = ruleMap.get(ruleId);
      const clause = rule?.when?.all?.[0] || rule?.when?.any?.[0] || {};
      const field = fieldMap.get(clause.fieldId);
      return {
        ruleId,
        fieldId: cleanString(clause.fieldId),
        label: cleanString(field?.label || "Signal questionnaire"),
        status: statusMap[rule?.level] || statusMap[validated.triage.level],
        reason: cleanString(rule?.reason || "Reponse a verifier."),
        value: validated.answers[clause.fieldId] ?? ""
      };
    });
    return {
      triageStatus: statusMap[validated.triage.level] || "vert",
      coachActionType: actionMap[validated.triage.level] || "lire_archiver",
      processingStatus: validated.triage.level === "green" ? "archived" : "to_read",
      signals
    };
  }

  async function submitPublicForm(slugInput, bodyInput, context = {}) {
    const bodyBytes = Buffer.byteLength(JSON.stringify(bodyInput || {}), "utf8");
    if (bodyBytes > MAX_PUBLIC_BODY_BYTES) {
      throw new QuestionnaireServiceError(
        "PAYLOAD_TOO_LARGE",
        "La reponse depasse la taille permise.",
        { status: 413 }
      );
    }
    const ip = cleanString(context.ip || "unknown").slice(0, 160);
    await enforceRateLimit({
      scope: "ip",
      subject: ip,
      max: RATE_LIMIT_IP_MAX
    });
    if (cleanString(bodyInput?.companyWebsite)) {
      throw new QuestionnaireServiceError(
        "INVALID_SUBMISSION",
        "La réponse ne peut pas être traitée.",
        { status: 400 }
      );
    }
    const sanitizedBody = { ...(bodyInput || {}) };
    delete sanitizedBody.companyWebsite;
    const requestedVersion = cleanString(sanitizedBody?.meta?.definitionVersion);
    const loaded = await loadPublishedBySlug(slugInput, requestedVersion);
    const validated = validateSubmission(loaded.snapshot, sanitizedBody);
    const phoneNormalized = cleanString(validated.identity.phoneNormalized);
    await enforceRateLimit({
      scope: "form_phone",
      subject: `${loaded.snapshot.slug}|${phoneNormalized}`,
      max: RATE_LIMIT_FORM_PHONE_MAX
    });
    const candidates = await matchingClients(phoneNormalized);
    const uniqueCandidateSnap = candidates.length === 1 ? candidates[0] : null;
    const uniqueCandidate = uniqueCandidateSnap?.data() || {};
    const uniqueCandidateIsSelectable = Boolean(
      uniqueCandidateSnap
      && clientRecordAvailableForMatching(uniqueCandidate)
      && cleanString(uniqueCandidate.entityType) === "member"
      && cleanString(uniqueCandidate.ownershipStatus) === "confirmed"
      && uniqueCandidate.clientSelectable === true
    );
    const clientCoachId = uniqueCandidateSnap
      ? cleanString(uniqueCandidate.coachId)
      : "";
    const dashboardOwnerCoachId = uniqueCandidateSnap
      ? cleanString(uniqueCandidate.dashboardOwnerCoachId)
      : "";
    const ownershipSignalsAgree = Boolean(
      clientCoachId
      && (!dashboardOwnerCoachId || dashboardOwnerCoachId === clientCoachId)
    );
    const ownerCoachId = ownershipSignalsAgree ? clientCoachId : "";
    const routingStatus = candidates.length > 1
      ? "conflict"
      : uniqueCandidateIsSelectable && ownerCoachId
        ? "matched"
        : uniqueCandidateSnap
          ? "conflict"
          : "unmatched";
    const matchedSnap = routingStatus === "matched" ? uniqueCandidateSnap : null;
    const matchedClient = matchedSnap?.data() || {};
    const coachId = matchedSnap ? ownerCoachId : "questionnaire_review";
    const triage = triageData(validated, loaded.snapshot);
    const responseId = `studio_${sha256(validated.idempotencyScope).slice(0, 46)}`;
    const responseRef = db.collection("questionnaireResponses").doc(responseId);
    const idempotencyRecord = createIdempotencyRecord(validated);
    const submittedAtIso = new Date().toISOString();
    const definitionSchema = responseSchema(loaded.snapshot);
    const responseData = {
      formId: loaded.formId,
      formVersionId: loaded.versionId,
      formVersion: loaded.snapshot.version,
      schemaHash: loaded.snapshot.versionHash,
      questionnaireType: questionnaireTypeFor(loaded.formId, loaded.legacyType),
      questionnaireLabel: loaded.snapshot.title,
      formSchema: definitionSchema,
      answers: validated.answers,
      educationalFeedback: validated.feedback,
      triageStatus: routingStatus === "matched" ? triage.triageStatus : "orange",
      coachActionType: routingStatus === "matched" ? triage.coachActionType : "validation_identite",
      triageSignals: triage.signals,
      processingStatus: routingStatus === "matched" ? triage.processingStatus : "unmatched",
      routingStatus,
      routingSource: "client_phone_normalized",
      routingCandidateCount: candidates.length,
      coachId,
      coachName: matchedSnap ? coachNameFor(matchedClient, ownerCoachId) : "Questionnaires a valider",
      clientId: matchedSnap?.id || "",
      internalClientId: matchedSnap
        ? cleanString(matchedClient.internalClientId) || matchedSnap.id
        : "",
      clientName: matchedSnap
        ? cleanString(matchedClient.name || validated.identity.name)
        : cleanString(validated.identity.name),
      clientNameEntered: cleanString(validated.identity.name),
      clientEmailEntered: cleanString(validated.identity.email),
      clientPhoneNormalized: phoneNormalized,
      idempotencyKey: validated.idempotencyKey,
      idempotencyScope: idempotencyRecord.idempotencyScope,
      submissionFingerprint: idempotencyRecord.submissionFingerprint,
      sourceUrl: validated.canonicalPath,
      source: "questionnaire_studio_public",
      retentionClass: "member_coaching_questionnaire",
      retentionPolicyStatus: "pending_privacy_owner_approval",
      submittedAtIso,
      createdAtIso: submittedAtIso
    };

    const duplicate = await db.runTransaction(async (transaction) => {
      const existingSnap = await transaction.get(responseRef);
      if (existingSnap.exists) {
        checkIdempotentReplay({
          idempotencyScope: existingSnap.get("idempotencyScope"),
          submissionFingerprint: existingSnap.get("submissionFingerprint")
        }, validated);
        return true;
      }
      transaction.create(responseRef, {
        ...responseData,
        submittedAt: fieldValue.serverTimestamp(),
        createdAt: fieldValue.serverTimestamp(),
        updatedAt: fieldValue.serverTimestamp()
      });
      return false;
    });

    return {
      ok: true,
      response: {
        stored: true,
        idempotencyKey: validated.idempotencyKey,
        responseId,
        duplicate,
        receivedAt: submittedAtIso
      }
    };
  }

  return Object.freeze({
    archiveForm: (...args) => archiveForm(...args).catch((error) => { throw serviceError(error); }),
    duplicateForm: (...args) => duplicateForm(...args).catch((error) => { throw serviceError(error); }),
    ensureInitialForms: (...args) => ensureInitialForms(...args).catch((error) => { throw serviceError(error); }),
    getPublicForm: (...args) => getPublicForm(...args).catch((error) => { throw serviceError(error); }),
    listForms: (...args) => listForms(...args).catch((error) => { throw serviceError(error); }),
    publishForm: (...args) => publishForm(...args).catch((error) => { throw serviceError(error); }),
    saveDraft: (...args) => saveDraft(...args).catch((error) => { throw serviceError(error); }),
    setDeliveryReady: (...args) => setDeliveryReady(...args).catch((error) => { throw serviceError(error); }),
    submitPublicForm: (...args) => submitPublicForm(...args).catch((error) => { throw serviceError(error); })
  });
}

module.exports = {
  INITIAL_FORM_META,
  INITIAL_PUBLISHED_AT,
  PUBLIC_ORIGIN,
  QuestionnaireServiceError,
  canonicalPublicUrl,
  createQuestionnaireService,
  publicDefinition,
  responseSchema,
  serviceError
};
