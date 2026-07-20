"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCoachRxObservation,
  coachRxRosterRecordsDigest,
  coachRxSourceClientId,
  decideCoachRxIdentityAction,
  normalizeCoachRxRosterEnvelope,
  normalizeSourceGeneratedAt,
  resolveCoachRxRosterReceipt
} = require("../coachrx-roster-contract");

function row(id, extra = {}) {
  return {
    id,
    identitykind: "id",
    name: `Client ${id}`,
    coachid: "15935",
    sourcepath: "/api/v1/coaches/15935/clients.json",
    ...extra
  };
}

test("un roster complet exige route, compteur, identites stables et uniques", () => {
  const envelope = normalizeCoachRxRosterEnvelope({
    coachRxOwnerId: "15935",
    sourcePath: "/api/v1/coaches/15935/clients.json",
    sourceRunId: "coachrx_run_12345678",
    sourceGeneratedAt: "2026-07-19T12:00:00.000Z",
    expectedClientCount: 2,
    records: [row("client-1"), row("client-2")]
  });
  assert.equal(envelope.complete, true);
  assert.equal(envelope.observedClientCount, 2);
  assert.match(envelope.fingerprint, /^[0-9a-f]{64}$/);
  assert.match(envelope.recordsDigest, /^[0-9a-f]{64}$/);
});

test("le fingerprint change pour tout payload semantiquement different sous le meme sourceRunId", () => {
  const base = {
    coachRxOwnerId: "15935",
    sourcePath: "/api/v1/coaches/15935/clients.json",
    sourceRunId: "coachrx_run_same_12345678",
    sourceGeneratedAt: "2026-07-19T12:00:00.000Z",
    expectedClientCount: 2,
    records: [
      row("client-1", { compliance30: "80" }),
      row("client-2", { workoutDue: "2026-07-31" })
    ]
  };
  const original = normalizeCoachRxRosterEnvelope(base);
  const changedTimestamp = normalizeCoachRxRosterEnvelope({
    ...base,
    sourceGeneratedAt: "2026-07-19T12:01:00.000Z"
  });
  const changedExpectedCount = normalizeCoachRxRosterEnvelope({
    ...base,
    expectedClientCount: 3
  });
  const changedObservation = normalizeCoachRxRosterEnvelope({
    ...base,
    records: [
      row("client-1", { compliance30: "81" }),
      row("client-2", { workoutDue: "2026-07-31" })
    ]
  });
  const changedContact = normalizeCoachRxRosterEnvelope({
    ...base,
    records: [
      row("client-1", { compliance30: "80", phone: "5145550000" }),
      row("client-2", { workoutDue: "2026-07-31" })
    ]
  });

  assert.notEqual(original.fingerprint, changedTimestamp.fingerprint);
  assert.notEqual(original.fingerprint, changedExpectedCount.fingerprint);
  assert.notEqual(original.fingerprint, changedObservation.fingerprint);
  assert.notEqual(original.fingerprint, changedContact.fingerprint);
  assert.notEqual(original.recordsDigest, changedObservation.recordsDigest);
  assert.deepEqual(resolveCoachRxRosterReceipt(null, original.fingerprint), {
    fingerprint: original.fingerprint,
    reused: false
  });
  assert.deepEqual(resolveCoachRxRosterReceipt(
    { fingerprint: original.fingerprint },
    original.fingerprint
  ), {
    fingerprint: original.fingerprint,
    reused: true
  });
  for (const changed of [changedTimestamp, changedExpectedCount, changedObservation, changedContact]) {
    assert.throws(
      () => resolveCoachRxRosterReceipt({ fingerprint: original.fingerprint }, changed.fingerprint),
      (error) => error.code === "idempotency_conflict"
    );
  }
});

test("le digest contractuel est deterministe malgre l'ordre des lignes et des cles", () => {
  const first = row("client-1", { compliance30: "80", phone: "+1 514 555 0000" });
  const second = row("client-2", { workoutDue: "2026-07-31" });
  const reorderedFirst = {
    phone: "5145550000",
    compliance30: "80",
    sourcepath: first.sourcepath,
    coachid: first.coachid,
    name: first.name,
    identitykind: first.identitykind,
    id: first.id
  };
  assert.equal(
    coachRxRosterRecordsDigest([first, second]),
    coachRxRosterRecordsDigest([second, reorderedFirst])
  );
  const common = {
    coachRxOwnerId: "15935",
    sourcePath: "/api/v1/coaches/15935/clients.json",
    sourceRunId: "coachrx_run_order_12345678",
    sourceGeneratedAt: "2026-07-19T12:00:00.000Z",
    expectedClientCount: 2
  };
  assert.equal(
    normalizeCoachRxRosterEnvelope({ ...common, records: [first, second] }).fingerprint,
    normalizeCoachRxRosterEnvelope({ ...common, records: [second, reorderedFirst] }).fingerprint
  );
});

test("un compteur absent garde les observations actives mais interdit la conclusion d'absence", () => {
  const envelope = normalizeCoachRxRosterEnvelope({
    coachRxOwnerId: "15935",
    sourcePath: "/team/15935/clients",
    sourceRunId: "coachrx_run_12345678",
    sourceGeneratedAt: "2026-07-19T12:00:00.000Z",
    records: [row("client-1")]
  });
  assert.equal(envelope.complete, false);
});

test("un lot sans horodatage valide ou trop futur est refuse avant toute mutation", () => {
  const base = {
    coachRxOwnerId: "15935",
    sourcePath: "/team/15935/clients",
    sourceRunId: "coachrx_run_timestamp_12345678",
    expectedClientCount: 1,
    records: [row("client-1")]
  };
  for (const sourceGeneratedAt of [undefined, "", "pas-une-date"]) {
    assert.throws(
      () => normalizeCoachRxRosterEnvelope({ ...base, sourceGeneratedAt }),
      (error) => error.code === "invalid_roster_timestamp"
    );
  }
  const now = Date.parse("2026-07-19T12:00:00.000Z");
  assert.equal(
    normalizeSourceGeneratedAt("2026-07-19T12:10:00.000Z", now),
    "2026-07-19T12:10:00.000Z"
  );
  assert.throws(
    () => normalizeSourceGeneratedAt("2026-07-19T12:10:00.001Z", now),
    (error) => error.code === "future_roster_timestamp"
  );
});

test("une route d'un autre coach est refusee", () => {
  assert.throws(() => normalizeCoachRxRosterEnvelope({
    coachRxOwnerId: "15935",
    sourcePath: "/api/v1/coaches/15928/clients.json",
    sourceRunId: "coachrx_run_12345678",
    sourceGeneratedAt: "2026-07-19T12:00:00.000Z",
    expectedClientCount: 1,
    records: [row("client-1")]
  }), (error) => error.code === "invalid_roster_source");
});

test("une identite stable manquante ou dupliquee bloque le lot", () => {
  assert.throws(() => normalizeCoachRxRosterEnvelope({
    coachRxOwnerId: "15935",
    sourcePath: "/team/15935/clients",
    sourceRunId: "coachrx_run_12345678",
    sourceGeneratedAt: "2026-07-19T12:00:00.000Z",
    records: [{ name: "Sans identite" }]
  }), (error) => error.code === "missing_stable_coachrx_id");
  assert.throws(() => normalizeCoachRxRosterEnvelope({
    coachRxOwnerId: "15935",
    sourcePath: "/team/15935/clients",
    sourceRunId: "coachrx_run_12345678",
    sourceGeneratedAt: "2026-07-19T12:00:00.000Z",
    records: [row("client-1"), row("client-1")]
  }), (error) => error.code === "duplicate_coachrx_id");
});

test("un identifiant sans preuve de provenance stable est refuse", () => {
  assert.throws(() => normalizeCoachRxRosterEnvelope({
    coachRxOwnerId: "15935",
    sourcePath: "/team/15935/clients",
    sourceRunId: "coachrx_run_12345678",
    sourceGeneratedAt: "2026-07-19T12:00:00.000Z",
    records: [{ id: "client-1", name: "Client Un" }]
  }), (error) => error.code === "unverified_coachrx_identity_kind");
});

test("un lot dont un nom client est inutilisable est refuse avant toute ecriture", () => {
  assert.throws(() => normalizeCoachRxRosterEnvelope({
    coachRxOwnerId: "15935",
    sourcePath: "/team/15935/clients",
    sourceRunId: "coachrx_run_12345678",
    sourceGeneratedAt: "2026-07-19T12:00:00.000Z",
    records: [{ id: "client-1", identityKind: "id", name: " " }]
  }), (error) => error.code === "invalid_coachrx_display_name");
});

test("l'observation conserve seulement une liste blanche operationnelle", () => {
  const observation = buildCoachRxObservation({
    workoutDue: "2026-07-31",
    compliance30: "87",
    lifestyleCompliance30: "72",
    name: "Nom prive",
    phone: "5145550000",
    arbitrarySecret: "ne-pas-copier"
  });
  assert.deepEqual(observation, {
    workoutDue: "2026-07-31",
    compliance30: "87",
    lifestyleCompliance30: "72"
  });
});

test("la cible se decide par identite forte avant le signal de contact", () => {
  assert.equal(decideCoachRxIdentityAction({
    claim: { internalClientId: "client-a" },
    contactSignal: { internalClientId: "client-b" }
  }), "observe_claimed_identity");
  assert.equal(decideCoachRxIdentityAction({
    contactSignal: { internalClientId: "client-b" }
  }), "propose_existing_dashboard_identity");
  assert.equal(decideCoachRxIdentityAction(), "create_coachrx_identity");
  assert.equal(coachRxSourceClientId({ "CoachRx Client ID": "abc-123" }), "abc-123");
});
