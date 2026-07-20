import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ClientCommandGatewayError,
  canonicalDashboardCoachId,
  createClientCommandGateway,
  createClientCommandIdempotencyKey,
  isCanonicalClientRecord
} from "../firebase-dashboard/public/client-command-gateway.mjs";

const CLIENT_ID = "3d594650-3436-4d61-9255-42f76a5f1d65";
const FIXED_UUID = "a2b97f86-406a-4810-a84e-2ebf27e8301b";

function acknowledged(payload = {}) {
  return {
    ok: true,
    clientId: CLIENT_ID,
    internalClientId: CLIENT_ID,
    dashboardResponsibleCoachId: "15935",
    responsibilityMode: "dashboard_only",
    reused: false,
    ...payload
  };
}

test("manual Dashboard creation sends only the callable contract and requires a positive ACK", async () => {
  const calls = [];
  const gateway = createClientCommandGateway({
    randomUuid: () => FIXED_UUID,
    invoke: async (commandName, payload) => {
      calls.push({ commandName, payload });
      return acknowledged();
    }
  });

  const response = await gateway.createDashboardClient({
    name: "  Julie   Exemple  ",
    phoneNormalized: "(450) 555-1212",
    email: " JULIE@EXAMPLE.TEST ",
    serviceScopes: ["lifestyle_assessment", "lifestyle_assessment"],
    dashboardResponsibleCoachId: "15935",
    membershipLabel: "doit etre ignore",
    notes: "ne doit jamais traverser implicitement"
  });

  assert.equal(response.ok, true);
  assert.deepEqual(calls, [{
    commandName: "createDashboardClient",
    payload: {
      name: "Julie Exemple",
      phone: "4505551212",
      email: "julie@example.test",
      serviceScopes: ["lifestyle_assessment"],
      dashboardResponsibleCoachId: "15935",
      idempotencyKey: `create_${FIXED_UUID}`
    }
  }]);
  assert.doesNotMatch(JSON.stringify(calls[0]), /membershipLabel|notes/);
});

test("a missing or negative callable acknowledgement never becomes a frontend success", async (t) => {
  for (const [label, response] of [
    ["missing", undefined],
    ["negative", { ok: false }],
    ["incomplete", { ok: true }]
  ]) {
    await t.test(label, async () => {
      const gateway = createClientCommandGateway({ invoke: async () => response });
      await assert.rejects(
        gateway.createDashboardClient({
          name: "Julie Exemple",
          phone: "4505551212",
          dashboardResponsibleCoachId: "15935",
          idempotencyKey: "create_retry_123"
        }),
        (error) => error instanceof ClientCommandGatewayError
          && error.gatewayCode === "invalid-acknowledgement"
      );
    });
  }
});

test("an unavailable callable fails closed with an explicit no-write message", async (t) => {
  await t.test("missing invoker", async () => {
    const gateway = createClientCommandGateway();
    await assert.rejects(
      gateway.createDashboardClient({
        name: "Julie Exemple",
        phone: "4505551212",
        dashboardResponsibleCoachId: "15935"
      }),
      (error) => error.gatewayCode === "backend-unavailable"
        && /Aucune donnee client n'a ete enregistree/i.test(error.message)
    );
  });

  await t.test("Cloud Function unavailable", async () => {
    const gateway = createClientCommandGateway({
      invoke: async () => {
        const error = new Error("not deployed");
        error.code = "functions/not-found";
        throw error;
      }
    });
    await assert.rejects(
      gateway.createDashboardClient({
        name: "Julie Exemple",
        phone: "4505551212",
        dashboardResponsibleCoachId: "15935"
      }),
      (error) => error.gatewayCode === "backend-unavailable"
        && /Aucune donnee client n'a ete enregistree/i.test(error.message)
    );
  });
});

test("admin responsibility changes and external links use explicit server commands", async () => {
  const calls = [];
  const gateway = createClientCommandGateway({
    invoke: async (commandName, payload) => {
      calls.push({ commandName, payload });
      return acknowledged({ dashboardResponsibleCoachId: payload.dashboardResponsibleCoachId || "15935" });
    }
  });

  await gateway.assignDashboardResponsible({
    clientId: CLIENT_ID,
    dashboardResponsibleCoachId: "15937",
    responsibilityMode: "dashboard_only",
    reason: "Transfert confirme par admin",
    idempotencyKey: "assign_retry_123"
  });
  await gateway.linkGhlContact({
    clientId: CLIENT_ID,
    contactId: "ghl_contact_42",
    reason: "Contact verifie dans GHL",
    idempotencyKey: "link_ghl_retry_123"
  });
  await gateway.proposeCoachRxLink({
    clientId: CLIENT_ID,
    sourceClientId: "coachrx_client_88",
    coachRxOwnerId: "15935",
    importRunId: "import_20260719",
    reason: "Correspondance stable observee",
    idempotencyKey: "propose_rx_retry_123"
  });
  await gateway.confirmCoachRxLink({
    clientId: CLIENT_ID,
    expectedSourceClientId: "coachrx_client_88",
    expectedCoachRxOwnerId: "15935",
    responsibilityMode: "manual_override",
    reason: "Lien confirme apres revue",
    idempotencyKey: "confirm_rx_retry_123"
  });

  assert.deepEqual(calls.map(({ commandName }) => commandName), [
    "assignDashboardResponsible",
    "linkGhlContact",
    "proposeCoachRxLink",
    "confirmCoachRxLink"
  ]);
  assert.deepEqual(calls[0].payload, {
    clientId: CLIENT_ID,
    dashboardResponsibleCoachId: "15937",
    responsibilityMode: "dashboard_only",
    reason: "Transfert confirme par admin",
    idempotencyKey: "assign_retry_123"
  });
});

test("canonical-only mutations reject legacy records before invoking the backend", async () => {
  let invoked = false;
  const gateway = createClientCommandGateway({
    invoke: async () => {
      invoked = true;
      return acknowledged();
    }
  });
  await assert.rejects(
    gateway.assignDashboardResponsible({
      clientId: "legacy_15935_julie",
      dashboardResponsibleCoachId: "15937",
      reason: "Transfert admin",
      idempotencyKey: "assign_retry_456"
    }),
    (error) => error.gatewayCode === "legacy-client"
  );
  assert.equal(invoked, false);
});

test("canonical identity and coach helpers prefer the contractual responsibility", () => {
  const canonical = {
    id: CLIENT_ID,
    internalClientId: CLIENT_ID,
    contractVersion: 1,
    dashboardResponsibleCoachId: "15937",
    coachId: "15935",
    coachRxId: "15935"
  };
  assert.equal(isCanonicalClientRecord(canonical), true);
  assert.equal(canonicalDashboardCoachId(canonical), "15937");
  assert.equal(isCanonicalClientRecord({ ...canonical, id: "legacy" }), false);
  assert.equal(canonicalDashboardCoachId({ coachId: "15935" }), "15935");
});

test("idempotency keys are URL-safe and stable when retained by a form", () => {
  const key = createClientCommandIdempotencyKey("create client", () => FIXED_UUID);
  assert.equal(key, `create_client_${FIXED_UUID}`);
  assert.match(key, /^[A-Za-z0-9_-]{8,100}$/);
});

test("all coach-scoped subscriptions are canonical-only for coaches and legacy-capable for admins", async () => {
  const source = await readFile(
    new URL("../firebase-dashboard/public/app.js", import.meta.url),
    "utf8"
  );
  const canonicalCollections = [
    "tasks",
    "clients",
    "questionnaireResponses",
    "questionnaireSends",
    "questionnaireSchedules",
    "rebookings",
    "checkups",
    "impacts",
    "alumni"
  ];
  const subscribedCollections = [...source.matchAll(/subscribeCollection\("([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(subscribedCollections, canonicalCollections);

  const subscriptionSource = source.slice(
    source.indexOf("function subscribeCollection"),
    source.indexOf("function coachRecordById")
  );
  const criteriaStart = subscriptionSource.indexOf("const CANONICAL_COACH_SCOPED_COLLECTIONS");
  const criteriaSource = subscriptionSource.slice(criteriaStart);
  const loadCriteria = (admin) => new Function(
    "isInfoAdmin",
    "state",
    "uniqueCriteria",
    "coachRecordById",
    "uniqueClean",
    "firestoreIdVariants",
    "coachNameValues",
    `${criteriaSource}\nreturn coachSubscriptionCriteria;`
  )(
    () => admin,
    { profile: { coachId: "15935" } },
    (criteria) => criteria,
    (coachId) => ({ id: coachId, coachRxId: coachId, name: "Coach A" }),
    (values) => [...new Set(values.filter((value) => value !== "" && value !== null && value !== undefined))],
    (value) => [String(value)],
    () => ["Coach A"]
  );
  const coachCriteria = loadCriteria(false);
  const adminCriteria = loadCriteria(true);

  assert.match(subscriptionSource, /coachSubscriptionCriteria\(coachId, collectionName\)/);
  for (const collectionName of canonicalCollections) {
    assert.deepEqual(coachCriteria("15935", collectionName), [
      { field: "dashboardResponsibleCoachId", value: "15935" }
    ], `Le coach ne doit lire ${collectionName} que par le champ canonique.`);
    const adminCollectionCriteria = adminCriteria("15935", collectionName);
    assert.equal(adminCollectionCriteria.some((criterion) => criterion.field === "dashboardResponsibleCoachId"), true);
    assert.equal(adminCollectionCriteria.some((criterion) => criterion.field === "coachId" && criterion.optionalLegacy === true), true);
  }
  assert.deepEqual(coachCriteria("15935", "nonCanonicalCollection"), [
    { field: "coachId", value: "15935" }
  ]);
  assert.match(subscriptionSource, /optionalLegacy && permissionDenied/);
  assert.match(subscriptionSource, /if \(canonicalSignal\) return coachIdFromFirestoreIdSignal\(canonicalSignal\)/);
  assert.match(subscriptionSource, /Lecture legacy ignoree/);
});
