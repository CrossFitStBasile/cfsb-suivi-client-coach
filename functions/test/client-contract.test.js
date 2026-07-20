"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ClientContractError,
  assertAllowedCommandFields,
  clientCommandFingerprint,
  clientCommandReceiptId,
  createDashboardClientContract,
  resolveContactSignalClaim,
  resolveClientCommandReceipt,
  transitionClientContract,
  validateClientContract
} = require("../client-contract");

const CLIENT_ID = "018f7b68-8aa0-70f0-8a33-8f214b5ce90e";

test("un client Dashboard seulement est un contrat valide sans CoachRx", () => {
  const client = createDashboardClientContract({
    internalClientId: CLIENT_ID,
    dashboardResponsibleCoachId: "15935",
    serviceScopes: ["lifestyle_assessment"]
  });

  assert.equal(client.originSystem, "dashboard_manual");
  assert.equal(client.responsibilityMode, "dashboard_only");
  assert.equal(client.coachRxLink, null);
  assert.equal(client.coachRxOwnerId, null);
  assert.equal(client.ghlLink, null);
  assert.deepEqual(validateClientContract(client), client);
});

test("un lien CoachRx propose puis confirme conserve l'identite interne", () => {
  const manual = createDashboardClientContract({
    internalClientId: CLIENT_ID,
    dashboardResponsibleCoachId: "15935"
  });
  const proposed = transitionClientContract(manual, {
    type: "propose_coachrx_link",
    sourceClientId: "coachrx-client-42",
    coachRxOwnerId: "15935"
  });
  const confirmed = transitionClientContract(proposed, {
    type: "confirm_coachrx_link",
    expectedSourceClientId: "coachrx-client-42",
    expectedCoachRxOwnerId: "15935",
    responsibilityMode: "follow_coachrx"
  });

  assert.equal(proposed.responsibilityMode, "dashboard_only");
  assert.equal(confirmed.internalClientId, CLIENT_ID);
  assert.equal(confirmed.originSystem, "dashboard_manual");
  assert.equal(confirmed.coachRxLink.linkStatus, "verified");
  assert.equal(confirmed.responsibilityMode, "follow_coachrx");
  assert.deepEqual(transitionClientContract(confirmed, {
    type: "propose_coachrx_link",
    sourceClientId: "coachrx-client-42",
    coachRxOwnerId: "15935"
  }), confirmed);
});

test("un coach Dashboard different du coach CoachRx devient un override explicite", () => {
  const manual = createDashboardClientContract({
    internalClientId: CLIENT_ID,
    dashboardResponsibleCoachId: "15935"
  });
  const proposed = transitionClientContract(manual, {
    type: "propose_coachrx_link",
    sourceClientId: "coachrx-client-42",
    coachRxOwnerId: "15928"
  });
  const confirmed = transitionClientContract(proposed, {
    type: "confirm_coachrx_link",
    expectedSourceClientId: "coachrx-client-42",
    expectedCoachRxOwnerId: "15928",
    responsibilityMode: "manual_override"
  });

  assert.equal(confirmed.responsibilityMode, "manual_override");
  const reassigned = transitionClientContract(confirmed, {
    type: "assign_dashboard_responsible",
    dashboardResponsibleCoachId: "15928",
    responsibilityMode: "follow_coachrx"
  });
  assert.equal(reassigned.responsibilityMode, "follow_coachrx");
});

test("un lien GHL ne peut pas etre remplace silencieusement", () => {
  const manual = createDashboardClientContract({
    internalClientId: CLIENT_ID,
    dashboardResponsibleCoachId: "15935"
  });
  const linked = transitionClientContract(manual, {
    type: "link_ghl",
    contactId: "ghl-contact-123"
  });
  assert.equal(linked.ghlLink.contactId, "ghl-contact-123");
  assert.throws(
    () => transitionClientContract(linked, { type: "link_ghl", contactId: "ghl-contact-999" }),
    (error) => error instanceof ClientContractError && error.code === "external_identity_conflict"
  );
});

test("l'identite et l'origine sont immuables", () => {
  const manual = createDashboardClientContract({
    internalClientId: CLIENT_ID,
    dashboardResponsibleCoachId: "15935"
  });
  assert.throws(
    () => validateClientContract({ ...manual, internalClientId: "018f7b68-8aa0-70f0-8a33-8f214b5cef00" }, { previous: manual }),
    (error) => error.code === "immutable_identity"
  );
  assert.throws(
    () => validateClientContract({ ...manual, originSystem: "coachrx_import" }, { previous: manual }),
    (error) => ["invalid_origin", "immutable_origin"].includes(error.code)
  );
});

test("un client ne dans CoachRx peut quitter le roster sans perdre son identite", () => {
  const inactive = validateClientContract({
    contractVersion: 1,
    internalClientId: CLIENT_ID,
    originSystem: "coachrx_import",
    identityStatus: "active",
    dashboardResponsibleCoachId: "15935",
    responsibilityMode: "dashboard_only",
    serviceScopes: ["coachrx_programming"],
    coachRxLink: {
      sourceSystem: "coachrx",
      sourceClientId: "coachrx-client-42",
      linkStatus: "verified",
      rosterStatus: "not_in_latest_roster"
    },
    coachRxOwnerId: "15935",
    ghlLink: null
  });
  assert.equal(inactive.internalClientId, CLIENT_ID);
  assert.equal(inactive.coachRxLink.rosterStatus, "not_in_latest_roster");
  assert.equal(inactive.responsibilityMode, "dashboard_only");
});

test("les champs forgeables sont refuses au bord de la commande", () => {
  assert.throws(
    () => assertAllowedCommandFields(
      { name: "Julie", coachRxId: "forged", originSystem: "coachrx_import" },
      ["name"],
      "createDashboardClient"
    ),
    (error) => error.code === "forged_fields"
      && error.details.fields.includes("coachRxId")
      && error.details.fields.includes("originSystem")
  );
});

test("un signal telephone libre peut etre reserve", () => {
  const profileFingerprint = "a".repeat(64);
  assert.deepEqual(resolveContactSignalClaim(null, {
    dashboardResponsibleCoachId: "15935",
    profileFingerprint
  }), { decision: "create" });
});

test("tout signal telephone deja reserve exige une revue, meme pour le meme coach et le meme nom", () => {
  assert.throws(
    () => resolveContactSignalClaim({
      internalClientId: CLIENT_ID,
      dashboardResponsibleCoachId: "15935",
      profileFingerprint: "a".repeat(64)
    }, {
      dashboardResponsibleCoachId: "15935",
      profileFingerprint: "a".repeat(64)
    }),
    (error) => error.code === "contact_signal_conflict"
      && !error.message.includes(CLIENT_ID)
      && !error.message.includes("15935")
  );
});

test("une meme idempotencyKey rejoue le resultat seulement pour le meme payload", () => {
  const firstPayload = { name: "Julie", phoneNormalized: "5145551212", serviceScopes: ["lifestyle_assessment"] };
  const fingerprint = clientCommandFingerprint(firstPayload);
  const receiptId = clientCommandReceiptId({
    command: "createDashboardClient",
    actorUid: "firebase-user-123",
    idempotencyKey: "request_12345678"
  });
  assert.match(receiptId, /^client_[0-9a-f]{64}$/);
  assert.deepEqual(resolveClientCommandReceipt({
    fingerprint,
    result: { ok: true, clientId: CLIENT_ID }
  }, fingerprint), { ok: true, clientId: CLIENT_ID, reused: true });

  assert.throws(
    () => resolveClientCommandReceipt({ fingerprint, result: {} }, clientCommandFingerprint({ ...firstPayload, name: "Autre" })),
    (error) => error.code === "idempotency_conflict"
  );
});
