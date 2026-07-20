"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  externalIdentityClaimId,
  normalizeExternalIdentityClaim,
  resolveExternalIdentityClaim
} = require("../external-identity-claim");

const CLIENT_A = "018f7b68-8aa0-70f0-8a33-8f214b5ce90e";
const CLIENT_B = "018f7b68-8aa0-70f0-8a33-8f214b5cef00";

function claim(internalClientId = CLIENT_A, status = "candidate") {
  return {
    claimVersion: 1,
    system: "coachrx",
    externalId: "coachrx-client-42",
    internalClientId,
    status
  };
}

test("la cle de reservation externe est deterministe et ne revele pas l'identifiant", () => {
  const first = externalIdentityClaimId("coachrx", "coachrx-client-42");
  const second = externalIdentityClaimId("coachrx", "coachrx-client-42");
  assert.equal(first, second);
  assert.match(first, /^coachrx_[0-9a-f]{64}$/);
  assert.equal(first.includes("client-42"), false);
});

test("une nouvelle proposition reserve le lien comme candidat", () => {
  assert.deepEqual(resolveExternalIdentityClaim(null, claim()), normalizeExternalIdentityClaim(claim()));
});

test("la confirmation promeut atomiquement candidat vers actif", () => {
  assert.equal(resolveExternalIdentityClaim(claim(), claim(CLIENT_A, "active")).status, "active");
});

test("une proposition incoherente ne retrograde jamais une reservation active", () => {
  assert.throws(
    () => resolveExternalIdentityClaim(claim(CLIENT_A, "active"), claim()),
    (error) => error.code === "external_identity_claim_status_conflict"
  );
});

test("deux fiches ne peuvent jamais reserver le meme identifiant CoachRx", () => {
  assert.throws(
    () => resolveExternalIdentityClaim(claim(CLIENT_A, "active"), claim(CLIENT_B, "active")),
    (error) => error.code === "external_identity_claim_conflict"
  );
});

test("une reservation inactive ne peut pas etre silencieusement reassignee", () => {
  assert.throws(
    () => resolveExternalIdentityClaim(claim(CLIENT_A, "inactive"), claim(CLIENT_B, "active")),
    (error) => error.code === "external_identity_claim_conflict"
  );
  assert.equal(resolveExternalIdentityClaim(claim(CLIENT_A, "inactive"), claim(CLIENT_A, "active")).status, "active");
});

test("une reservation corrompue echoue fermee", () => {
  assert.throws(
    () => resolveExternalIdentityClaim(
      { ...claim(), externalId: "autre-id" },
      claim(CLIENT_A, "active")
    ),
    (error) => error.code === "corrupt_external_identity_claim"
  );
});
