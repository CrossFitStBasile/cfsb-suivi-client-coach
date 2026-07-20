"use strict";

const crypto = require("crypto");

const CLIENT_CONTRACT_VERSION = 1;
const CLIENT_ORIGINS = Object.freeze(["dashboard_manual", "coachrx_import", "legacy_migrated"]);
const IDENTITY_STATUSES = Object.freeze(["active", "needs_review", "merge_pending", "merged_alias"]);
const RESPONSIBILITY_MODES = Object.freeze([
  "dashboard_only",
  "follow_coachrx",
  "manual_override"
]);
const COACHRX_LINK_STATUSES = Object.freeze(["candidate", "verified", "conflict", "inactive"]);
const COACHRX_ROSTER_STATUSES = Object.freeze(["active", "not_in_latest_roster", "unknown"]);
const GHL_LINK_STATUSES = Object.freeze(["verified", "needs_review", "conflict", "inactive"]);
const GHL_MATCH_METHODS = Object.freeze(["exact_phone", "admin_confirmed", "migration_verified"]);
const SERVICE_SCOPES = Object.freeze([
  "lifestyle_assessment",
  "nutrition",
  "personal_training",
  "group_training",
  "coachrx_programming",
  "other"
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;

class ClientContractError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ClientContractError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new ClientContractError(code, message, details);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredId(value, fieldName) {
  const clean = cleanString(value);
  if (!clean || !ID_PATTERN.test(clean)) {
    fail("invalid_field", `${fieldName} est invalide.`, { field: fieldName });
  }
  return clean;
}

function optionalId(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  return requiredId(value, fieldName);
}

function normalizeInternalClientId(value) {
  const clean = cleanString(value).toLowerCase();
  if (!UUID_PATTERN.test(clean)) {
    fail("invalid_internal_client_id", "internalClientId doit etre un UUID.", {
      field: "internalClientId"
    });
  }
  return clean;
}

function normalizeServiceScopes(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > SERVICE_SCOPES.length) {
    fail("invalid_service_scopes", "serviceScopes doit contenir au moins un service reconnu.", {
      field: "serviceScopes"
    });
  }
  const scopes = [...new Set(value.map((scope) => cleanString(scope).toLowerCase()))];
  if (scopes.some((scope) => !SERVICE_SCOPES.includes(scope))) {
    fail("invalid_service_scopes", "Un serviceScopes est invalide.", {
      field: "serviceScopes"
    });
  }
  return scopes.sort();
}

function assertAllowedCommandFields(payload, allowedFields, commandName = "commande") {
  if (!isPlainObject(payload)) {
    fail("invalid_command", `${commandName}: donnees invalides.`);
  }
  const allowed = allowedFields instanceof Set ? allowedFields : new Set(allowedFields || []);
  const unexpected = Object.keys(payload).filter((field) => !allowed.has(field));
  if (unexpected.length) {
    fail("forged_fields", `${commandName}: champs non autorises.`, {
      fields: unexpected.sort()
    });
  }
  return payload;
}

function canonicalCommandJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalCommandJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalCommandJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function clientCommandFingerprint(value) {
  return crypto.createHash("sha256").update(canonicalCommandJson(value)).digest("hex");
}

function clientCommandReceiptId({ command, actorUid, idempotencyKey } = {}) {
  const cleanCommand = cleanString(command);
  const cleanActorUid = cleanString(actorUid);
  const cleanKey = cleanString(idempotencyKey);
  if (!cleanCommand || !cleanActorUid || !/^[A-Za-z0-9_-]{8,100}$/.test(cleanKey)) {
    fail("invalid_idempotency", "Parametres d'idempotence invalides.");
  }
  const digest = crypto.createHash("sha256")
    .update(`${cleanCommand}\n${cleanActorUid}\n${cleanKey}`)
    .digest("hex");
  return `client_${digest}`;
}

function resolveClientCommandReceipt(receipt, fingerprint) {
  if (receipt === undefined || receipt === null) return null;
  if (!isPlainObject(receipt) || cleanString(receipt.fingerprint) !== cleanString(fingerprint)) {
    fail(
      "idempotency_conflict",
      "Cette idempotencyKey a deja ete utilisee avec des donnees differentes."
    );
  }
  return { ...(isPlainObject(receipt.result) ? receipt.result : {}), reused: true };
}

function copyServerMetadata(source, target, keys) {
  for (const key of keys) {
    if (source[key] !== undefined) target[key] = source[key];
  }
  return target;
}

function normalizeGhlLink(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) fail("invalid_ghl_link", "ghlLink est invalide.");
  assertAllowedCommandFields(value, [
    "contactId",
    "linkStatus",
    "matchedBy",
    "verifiedAt",
    "verifiedByUid",
    "lastObservedAt"
  ], "ghlLink");
  const linkStatus = cleanString(value.linkStatus);
  if (!GHL_LINK_STATUSES.includes(linkStatus)) {
    fail("invalid_ghl_link", "Le statut du lien GHL est invalide.");
  }
  const matchedBy = cleanString(value.matchedBy);
  if (!GHL_MATCH_METHODS.includes(matchedBy)) {
    fail("invalid_ghl_link", "La methode de liaison GHL est invalide.");
  }
  return copyServerMetadata(value, {
    contactId: requiredId(value.contactId, "ghlLink.contactId"),
    linkStatus,
    matchedBy
  }, ["verifiedAt", "verifiedByUid", "lastObservedAt"]);
}

function normalizeCoachRxLink(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) fail("invalid_coachrx_link", "coachRxLink est invalide.");
  assertAllowedCommandFields(value, [
    "sourceSystem",
    "sourceClientId",
    "linkStatus",
    "rosterStatus",
    "observedAt",
    "importRunId",
    "linkedAt",
    "linkedByUid"
  ], "coachRxLink");
  const sourceSystem = cleanString(value.sourceSystem);
  const linkStatus = cleanString(value.linkStatus);
  const rosterStatus = cleanString(value.rosterStatus);
  if (sourceSystem !== "coachrx") fail("invalid_coachrx_link", "sourceSystem doit etre coachrx.");
  if (!COACHRX_LINK_STATUSES.includes(linkStatus)) {
    fail("invalid_coachrx_link", "Le statut du lien CoachRx est invalide.");
  }
  if (!COACHRX_ROSTER_STATUSES.includes(rosterStatus)) {
    fail("invalid_coachrx_link", "Le statut roster CoachRx est invalide.");
  }
  return copyServerMetadata(value, {
    sourceSystem,
    sourceClientId: requiredId(value.sourceClientId, "coachRxLink.sourceClientId"),
    linkStatus,
    rosterStatus
  }, ["observedAt", "importRunId", "linkedAt", "linkedByUid"]);
}

function hasActiveVerifiedCoachRx(contract) {
  return contract.coachRxLink?.linkStatus === "verified"
    && contract.coachRxLink?.rosterStatus === "active";
}

function validateResponsibility(contract) {
  const activeCoachRx = hasActiveVerifiedCoachRx(contract);
  const traceableCoachRx = contract.coachRxLink
    && ["verified", "inactive"].includes(contract.coachRxLink.linkStatus);
  if (contract.originSystem === "coachrx_import" && !traceableCoachRx) {
    fail("invalid_origin", "Un client coachrx_import doit conserver un lien CoachRx verifie ou inactif.");
  }
  if (activeCoachRx && !contract.coachRxOwnerId) {
    fail("invalid_coachrx_owner", "Un lien CoachRx actif et verifie exige coachRxOwnerId.");
  }
  if (contract.responsibilityMode === "dashboard_only" && activeCoachRx) {
    fail("invalid_responsibility_mode", "dashboard_only interdit un lien CoachRx actif et verifie.");
  }
  if (contract.responsibilityMode === "follow_coachrx") {
    if (!activeCoachRx) {
      fail("invalid_responsibility_mode", "follow_coachrx exige un lien CoachRx actif et verifie.");
    }
    if (contract.coachRxOwnerId !== contract.dashboardResponsibleCoachId) {
      fail(
        "invalid_responsibility_mode",
        "follow_coachrx exige le meme responsable dans CoachRx et le Dashboard."
      );
    }
  }
  if (contract.responsibilityMode === "manual_override" && !activeCoachRx) {
    fail("invalid_responsibility_mode", "manual_override exige un lien CoachRx actif et verifie.");
  }
}

function validateClientContract(record, options = {}) {
  if (!isPlainObject(record)) fail("invalid_client", "Le contrat client doit etre un objet.");
  if (record.contractVersion !== CLIENT_CONTRACT_VERSION) {
    fail("unsupported_contract_version", "Version de contrat client non supportee.");
  }
  const originSystem = cleanString(record.originSystem);
  if (!CLIENT_ORIGINS.includes(originSystem)) fail("invalid_origin", "originSystem est invalide.");
  const identityStatus = cleanString(record.identityStatus);
  if (!IDENTITY_STATUSES.includes(identityStatus)) fail("invalid_identity_status", "identityStatus est invalide.");
  const responsibilityMode = cleanString(record.responsibilityMode);
  if (!RESPONSIBILITY_MODES.includes(responsibilityMode)) {
    fail("invalid_responsibility_mode", "responsibilityMode est invalide.");
  }

  const contract = {
    contractVersion: CLIENT_CONTRACT_VERSION,
    internalClientId: normalizeInternalClientId(record.internalClientId),
    originSystem,
    identityStatus,
    dashboardResponsibleCoachId: requiredId(
      record.dashboardResponsibleCoachId,
      "dashboardResponsibleCoachId"
    ),
    responsibilityMode,
    serviceScopes: normalizeServiceScopes(record.serviceScopes),
    coachRxLink: normalizeCoachRxLink(record.coachRxLink),
    coachRxOwnerId: optionalId(record.coachRxOwnerId, "coachRxOwnerId"),
    ghlLink: normalizeGhlLink(record.ghlLink)
  };
  validateResponsibility(contract);

  if (options.previous) {
    const previous = validateClientContract(options.previous);
    if (previous.internalClientId !== contract.internalClientId) {
      fail("immutable_identity", "internalClientId est immuable.");
    }
    if (previous.originSystem !== contract.originSystem) {
      fail("immutable_origin", "originSystem est immuable.");
    }
  }
  return contract;
}

function createDashboardClientContract({
  internalClientId = crypto.randomUUID(),
  dashboardResponsibleCoachId,
  serviceScopes = ["lifestyle_assessment"]
} = {}) {
  return validateClientContract({
    contractVersion: CLIENT_CONTRACT_VERSION,
    internalClientId,
    originSystem: "dashboard_manual",
    identityStatus: "active",
    dashboardResponsibleCoachId,
    responsibilityMode: "dashboard_only",
    serviceScopes,
    coachRxLink: null,
    coachRxOwnerId: null,
    ghlLink: null
  });
}

function resolveContactSignalClaim(existingClaim, { dashboardResponsibleCoachId, profileFingerprint } = {}) {
  requiredId(dashboardResponsibleCoachId, "dashboardResponsibleCoachId");
  const fingerprint = cleanString(profileFingerprint);
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    fail("invalid_contact_signal", "Empreinte du signal de contact invalide.");
  }
  if (existingClaim === undefined || existingClaim === null) return { decision: "create" };
  fail(
    "contact_signal_conflict",
    "Ce signal de contact correspond deja a une fiche ou a une situation a reviser."
  );
}

function transitionClientContract(currentRecord, transition = {}) {
  const current = validateClientContract(currentRecord);
  if (!isPlainObject(transition)) fail("invalid_transition", "Transition client invalide.");
  const type = cleanString(transition.type);
  const next = {
    ...current,
    serviceScopes: [...current.serviceScopes],
    coachRxLink: current.coachRxLink ? { ...current.coachRxLink } : null,
    ghlLink: current.ghlLink ? { ...current.ghlLink } : null
  };

  if (type === "assign_dashboard_responsible") {
    assertAllowedCommandFields(
      transition,
      ["type", "dashboardResponsibleCoachId", "responsibilityMode"],
      type
    );
    next.dashboardResponsibleCoachId = requiredId(
      transition.dashboardResponsibleCoachId,
      "dashboardResponsibleCoachId"
    );
    if (hasActiveVerifiedCoachRx(next)) {
      const decision = cleanString(transition.responsibilityMode);
      if (!["follow_coachrx", "manual_override"].includes(decision)) {
        fail(
          "invalid_responsibility_mode",
          "Une decision follow_coachrx ou manual_override est requise pour un client CoachRx actif."
        );
      }
      if (decision === "follow_coachrx"
        && next.coachRxOwnerId !== next.dashboardResponsibleCoachId) {
        fail("invalid_responsibility_mode", "follow_coachrx exige une concordance des coachs.");
      }
      next.responsibilityMode = decision;
    } else {
      if (cleanString(transition.responsibilityMode)
        && cleanString(transition.responsibilityMode) !== "dashboard_only") {
        fail("invalid_responsibility_mode", "Sans lien CoachRx actif, le mode doit etre dashboard_only.");
      }
      next.responsibilityMode = "dashboard_only";
    }
  } else if (type === "set_service_scopes") {
    assertAllowedCommandFields(transition, ["type", "serviceScopes"], type);
    next.serviceScopes = normalizeServiceScopes(transition.serviceScopes);
  } else if (type === "link_ghl") {
    assertAllowedCommandFields(transition, ["type", "contactId", "matchedBy"], type);
    const contactId = requiredId(transition.contactId, "contactId");
    if (next.ghlLink && next.ghlLink.contactId !== contactId) {
      fail(
        "external_identity_conflict",
        "Le client est deja lie a un autre contact GHL; une revue explicite est requise."
      );
    }
    next.ghlLink = {
      contactId,
      linkStatus: "verified",
      matchedBy: cleanString(transition.matchedBy) || "admin_confirmed"
    };
  } else if (type === "propose_coachrx_link") {
    assertAllowedCommandFields(
      transition,
      ["type", "sourceClientId", "coachRxOwnerId", "importRunId"],
      type
    );
    const sourceClientId = requiredId(transition.sourceClientId, "sourceClientId");
    if (next.coachRxLink?.linkStatus === "verified") {
      if (next.coachRxLink.sourceClientId !== sourceClientId
        || next.coachRxOwnerId !== cleanString(transition.coachRxOwnerId)) {
        fail("external_identity_conflict", "Le client possede deja un lien CoachRx verifie different.");
      }
      return current;
    }
    next.coachRxLink = {
      sourceSystem: "coachrx",
      sourceClientId,
      linkStatus: "candidate",
      rosterStatus: "active",
      ...(cleanString(transition.importRunId) ? { importRunId: cleanString(transition.importRunId) } : {})
    };
    next.coachRxOwnerId = requiredId(transition.coachRxOwnerId, "coachRxOwnerId");
    next.responsibilityMode = "dashboard_only";
  } else if (type === "confirm_coachrx_link") {
    assertAllowedCommandFields(
      transition,
      ["type", "expectedSourceClientId", "expectedCoachRxOwnerId", "responsibilityMode"],
      type
    );
    if (!next.coachRxLink || !["candidate", "verified"].includes(next.coachRxLink.linkStatus)) {
      fail("invalid_transition", "Aucun lien CoachRx candidat a confirmer.");
    }
    const expectedSourceClientId = requiredId(
      transition.expectedSourceClientId,
      "expectedSourceClientId"
    );
    const expectedCoachRxOwnerId = requiredId(
      transition.expectedCoachRxOwnerId,
      "expectedCoachRxOwnerId"
    );
    if (expectedSourceClientId !== next.coachRxLink.sourceClientId) {
      fail("stale_transition", "Le candidat CoachRx a change; recharge la fiche.");
    }
    if (expectedCoachRxOwnerId !== next.coachRxOwnerId) {
      fail("stale_transition", "Le proprietaire CoachRx observe a change; recharge la fiche.");
    }
    const decision = cleanString(transition.responsibilityMode);
    if (!next.coachRxOwnerId) fail("invalid_coachrx_owner", "coachRxOwnerId verifie est requis.");
    if (!["follow_coachrx", "manual_override"].includes(decision)) {
      fail("invalid_responsibility_mode", "Une decision de responsabilite explicite est requise.");
    }
    if (decision === "follow_coachrx"
      && next.dashboardResponsibleCoachId !== next.coachRxOwnerId) {
      fail("invalid_responsibility_mode", "follow_coachrx exige une concordance des coachs.");
    }
    next.coachRxLink = { ...next.coachRxLink, linkStatus: "verified", rosterStatus: "active" };
    next.responsibilityMode = decision;
  } else {
    fail("invalid_transition", "Type de transition client inconnu.", { type });
  }

  return validateClientContract(next, { previous: current });
}

module.exports = {
  CLIENT_CONTRACT_VERSION,
  CLIENT_ORIGINS,
  IDENTITY_STATUSES,
  RESPONSIBILITY_MODES,
  SERVICE_SCOPES,
  ClientContractError,
  assertAllowedCommandFields,
  clientCommandFingerprint,
  clientCommandReceiptId,
  createDashboardClientContract,
  normalizeInternalClientId,
  normalizeServiceScopes,
  resolveContactSignalClaim,
  resolveClientCommandReceipt,
  transitionClientContract,
  validateClientContract
};
