import assert from "node:assert/strict";
import test from "node:test";

import { planCoachRxCanonicalBackfill } from "../tools/plan-coachrx-canonical-backfill-phase2.mjs";

function document(id, data) {
  return { id, data };
}

test("le dry-run separe identites canoniques, migrations legacy et conflits", () => {
  const report = planCoachRxCanonicalBackfill({
    collection: "clients",
    documents: [
      document("secret-doc-1", {
        contractVersion: 1,
        internalClientId: "018f7b68-8aa0-70f0-8a33-8f214b5ce90e",
        originSystem: "dashboard_manual",
        dashboardResponsibleCoachId: "15935",
        coachRxLink: null
      }),
      document("secret-doc-2", {
        contractVersion: 1,
        internalClientId: "018f7b68-8aa0-70f0-8a33-8f214b5cef00",
        originSystem: "coachrx_import",
        dashboardResponsibleCoachId: "15935",
        coachRxLink: {
          sourceClientId: "coachrx-secret-1",
          linkStatus: "verified",
          rosterStatus: "active"
        }
      }),
      document("secret-doc-3", {
        source: "direct_coachrx_extension",
        sourceIdentitySystem: "coachrx",
        sourceClientId: "coachrx-secret-2",
        ownershipStatus: "confirmed",
        entityType: "member",
        clientSelectable: true,
        coachId: "15928"
      }),
      document("secret-doc-4", {
        source: "direct_coachrx_extension",
        sourceIdentitySystem: "coachrx",
        sourceClientId: "coachrx-secret-2",
        ownershipStatus: "confirmed",
        entityType: "member",
        clientSelectable: true,
        coachId: "15928"
      }),
      document("secret-doc-5", {
        source: "direct_coachrx_extension",
        sourceIdentitySystem: "coachrx",
        coachId: "15936"
      })
    ]
  });

  assert.equal(report.canonical.total, 2);
  assert.equal(report.canonical.dashboardOnly, 1);
  assert.equal(report.legacy.coachRxLike, 3);
  assert.equal(report.legacy.withStableCoachRxSourceId, 2);
  assert.equal(report.legacy.withoutStableCoachRxSourceId, 1);
  assert.equal(report.legacy.historicalOrInactiveWithoutStableId, 1);
  assert.equal(report.conflicts.duplicateCoachRxSourceIdGroups, 1);
  assert.equal(report.rolloutGate.canEnableCanonicalContractMode, false);
  assert.equal(report.liveWritesPerformed, 0);
});

test("le rapport agrege ne contient aucune PII, aucun id document ou externe", () => {
  const report = planCoachRxCanonicalBackfill({
    documents: [document("document-ultra-secret", {
      name: "Nom Ultra Secret",
      email: "secret@example.test",
      phoneNormalized: "5145559999",
      source: "coachrx_visible_snapshot",
      sourceIdentitySystem: "coachrx",
      sourceClientId: "coachrx-external-ultra-secret",
      coachId: "15935"
    })]
  });
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /Nom Ultra Secret/);
  assert.doesNotMatch(serialized, /secret@example\.test/);
  assert.doesNotMatch(serialized, /5145559999/);
  assert.doesNotMatch(serialized, /document-ultra-secret/);
  assert.doesNotMatch(serialized, /coachrx-external-ultra-secret/);
  assert.equal(report.privacy.aggregateOnly, true);
});
