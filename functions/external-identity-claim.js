"use strict";

const crypto = require("crypto");
const { ClientContractError, normalizeInternalClientId } = require("./client-contract");

const EXTERNAL_IDENTITY_SYSTEMS = Object.freeze(["coachrx", "ghl"]);
const EXTERNAL_IDENTITY_CLAIM_STATUSES = Object.freeze([
  "candidate",
  "active",
  "inactive",
  "conflict"
]);
const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;

function fail(code, message, details = {}) {
  throw new ClientContractError(code, message, details);
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function normalizeExternalIdentitySystem(value) {
  const system = cleanString(value).toLowerCase();
  if (!EXTERNAL_IDENTITY_SYSTEMS.includes(system)) {
    fail("invalid_external_identity", "Systeme d'identite externe invalide.");
  }
  return system;
}

function normalizeExternalIdentityId(value) {
  const externalId = cleanString(value);
  if (!EXTERNAL_ID_PATTERN.test(externalId)) {
    fail("invalid_external_identity", "Identifiant externe invalide.");
  }
  return externalId;
}

function externalIdentityClaimId(system, externalId) {
  const normalizedSystem = normalizeExternalIdentitySystem(system);
  const normalizedExternalId = normalizeExternalIdentityId(externalId);
  const digest = crypto.createHash("sha256")
    .update(`${normalizedSystem}:${normalizedExternalId}`)
    .digest("hex");
  return `${normalizedSystem}_${digest}`;
}

function normalizeExternalIdentityClaim(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_external_identity_claim", "Reservation d'identite externe invalide.");
  }
  const status = cleanString(value.status).toLowerCase();
  if (!EXTERNAL_IDENTITY_CLAIM_STATUSES.includes(status)) {
    fail("invalid_external_identity_claim", "Statut de reservation externe invalide.");
  }
  return {
    claimVersion: 1,
    system: normalizeExternalIdentitySystem(value.system),
    externalId: normalizeExternalIdentityId(value.externalId),
    internalClientId: normalizeInternalClientId(value.internalClientId),
    status
  };
}

/**
 * Resolves a deterministic external identity reservation. This function is
 * intended to run after reading the claim document in a Firestore transaction.
 * A different internal client always fails closed, including an inactive claim,
 * because external identity history must not be silently reassigned.
 */
function resolveExternalIdentityClaim(existingClaim, requestedClaim) {
  const requested = normalizeExternalIdentityClaim(requestedClaim);
  if (requested.status === "conflict") {
    fail("invalid_external_identity_claim", "Une commande ne peut pas reserver directement un conflit.");
  }
  if (existingClaim === undefined || existingClaim === null) return requested;

  const existing = normalizeExternalIdentityClaim(existingClaim);
  if (existing.system !== requested.system || existing.externalId !== requested.externalId) {
    fail(
      "corrupt_external_identity_claim",
      "La reservation externe existante ne correspond pas a sa cle deterministe."
    );
  }
  if (existing.internalClientId !== requested.internalClientId) {
    fail(
      "external_identity_claim_conflict",
      "Cette identite externe est deja reservee par une autre fiche."
    );
  }
  if (existing.status === "conflict") {
    fail(
      "external_identity_claim_conflict",
      "Cette identite externe est en conflit et exige une resolution administrative."
    );
  }

  // Confirmation promotes candidate/inactive to active. A command asking for
  // candidate while the durable claim is already active indicates inconsistent
  // client state and must fail rather than silently downgrade or mask it.
  if (existing.status === "active" && requested.status !== "active") {
    fail(
      "external_identity_claim_status_conflict",
      "Une reservation externe active ne peut pas redevenir candidate."
    );
  }
  const status = requested.status === "active" ? "active" : requested.status;
  return { ...requested, status };
}

module.exports = {
  EXTERNAL_IDENTITY_CLAIM_STATUSES,
  EXTERNAL_IDENTITY_SYSTEMS,
  externalIdentityClaimId,
  normalizeExternalIdentityClaim,
  normalizeExternalIdentityId,
  normalizeExternalIdentitySystem,
  resolveExternalIdentityClaim
};
