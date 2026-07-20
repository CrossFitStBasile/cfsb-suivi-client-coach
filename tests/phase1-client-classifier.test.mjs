import assert from "node:assert/strict";
import test from "node:test";

import { classifyClientLifecycleSnapshot } from "../tools/classify-client-lifecycle-phase1.mjs";

function document(data) {
  return { id: `sensitive-${Math.random()}`, data };
}

test("classifies Dashboard-only clients separately from unresolved CoachRx claims", () => {
  const snapshot = {
    collection: "clients",
    documents: [
      document({
        name: "Personne Secrete",
        email: "secret@example.test",
        phoneNormalized: "4505550101",
        status: "active",
        clientSelectable: true,
        ownershipStatus: "confirmed",
        coachId: "coach-a",
        membershipSource: "direct_csm_client_enrichment",
        ghlContactId: "ghl-1"
      }),
      document({
        name: "Autre Personne",
        status: "active",
        clientSelectable: true,
        ownershipStatus: "confirmed",
        coachId: "coach-b",
        sourceIdentitySystem: "coachrx",
        coachRxId: "legacy-coach-field"
      }),
      document({
        status: "active",
        clientSelectable: true,
        ownershipStatus: "confirmed",
        coachId: "coach-a",
        sourceClientId: "stable-coachrx-client-id"
      }),
      document({
        status: "import_stale",
        clientSelectable: true,
        ownershipStatus: "confirmed",
        coachId: "coach-a"
      })
    ]
  };

  const report = classifyClientLifecycleSnapshot(snapshot);

  assert.equal(report.activeConfirmedWithoutStableSourceId, 2);
  assert.equal(report.classifications.dashboardOnlyCandidates, 1);
  assert.equal(report.classifications.coachRxClaimsWithoutStableId, 1);
  assert.equal(report.byCoach["coach-a"].dashboardOnlyCandidates, 1);
  assert.equal(report.byCoach["coach-b"].coachRxClaimsWithoutStableId, 1);
  assert.equal(report.signals.withVerifiedGhlContactId, 1);
  assert.equal(report.classificationSignals.dashboardOnlyCandidates.withVerifiedGhlContactId, 1);
  assert.equal(report.classificationSignals.coachRxClaimsWithoutStableId.withVerifiedGhlContactId, 0);
  assert.equal(report.liveWritesPerformed, 0);
});

test("aggregate report never contains client PII or document ids", () => {
  const report = classifyClientLifecycleSnapshot({
    collection: "clients",
    documents: [document({
      name: "Nom Ultra Secret",
      email: "ultra-secret@example.test",
      phoneNormalized: "5145559999",
      status: "active",
      clientSelectable: true,
      ownershipStatus: "confirmed",
      coachId: "coach-a"
    })]
  });
  const serialized = JSON.stringify(report);

  assert.doesNotMatch(serialized, /Nom Ultra Secret/);
  assert.doesNotMatch(serialized, /ultra-secret@example\.test/);
  assert.doesNotMatch(serialized, /5145559999/);
  assert.doesNotMatch(serialized, /sensitive-/);
  assert.equal(report.privacy.aggregateOnly, true);
});
