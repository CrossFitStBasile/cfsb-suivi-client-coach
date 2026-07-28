"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  INITIAL_DRAFTS,
  publishDraft
} = require("../questionnaire-studio");
const {
  createQuestionnaireService
} = require("../questionnaire-service");

class FakeSnapshot {
  constructor(ref, value) {
    this.ref = ref;
    this.id = ref.id;
    this._value = value;
    this.exists = value !== undefined;
  }

  data() {
    return this.exists ? structuredClone(this._value) : undefined;
  }

  get(field) {
    return this.exists ? this._value[field] : undefined;
  }
}

class FakeDocRef {
  constructor(database, collectionName, id) {
    this.database = database;
    this.collectionName = collectionName;
    this.id = id;
  }

  async get() {
    return new FakeSnapshot(
      this,
      this.database.store.get(this.collectionName)?.get(this.id)
    );
  }
}

class FakeQuery {
  constructor(database, collectionName, field = "", expected = undefined, max = 100) {
    this.database = database;
    this.collectionName = collectionName;
    this.field = field;
    this.expected = expected;
    this.max = max;
  }

  where(field, operator, expected) {
    assert.equal(operator, "==");
    return new FakeQuery(this.database, this.collectionName, field, expected, this.max);
  }

  limit(max) {
    return new FakeQuery(
      this.database,
      this.collectionName,
      this.field,
      this.expected,
      max
    );
  }

  async get() {
    const records = this.database.store.get(this.collectionName) || new Map();
    const docs = [...records.entries()]
      .filter(([, value]) => !this.field || value[this.field] === this.expected)
      .slice(0, this.max)
      .map(([id, value]) =>
        new FakeSnapshot(new FakeDocRef(this.database, this.collectionName, id), value)
      );
    return {
      docs,
      empty: docs.length === 0
    };
  }
}

class FakeCollection extends FakeQuery {
  constructor(database, collectionName) {
    super(database, collectionName);
  }

  doc(id = "") {
    const resolved = id || `auto_${++this.database.nextId}`;
    return new FakeDocRef(this.database, this.collectionName, resolved);
  }
}

class FakeDatabase {
  constructor(seed = {}) {
    this.nextId = 0;
    this.store = new Map(
      Object.entries(seed).map(([collectionName, records]) => [
        collectionName,
        new Map(Object.entries(records).map(([id, value]) => [id, structuredClone(value)]))
      ])
    );
  }

  collection(name) {
    return new FakeCollection(this, name);
  }

  async runTransaction(callback) {
    const transaction = {
      get: (ref) => ref.get(),
      set: (ref, value, options = {}) => {
        const records = this.#records(ref.collectionName);
        const existing = records.get(ref.id) || {};
        records.set(
          ref.id,
          structuredClone(options.merge ? { ...existing, ...value } : value)
        );
      },
      create: (ref, value) => {
        const records = this.#records(ref.collectionName);
        if (records.has(ref.id)) throw new Error(`already exists: ${ref.id}`);
        records.set(ref.id, structuredClone(value));
      },
      update: (ref, value) => {
        const records = this.#records(ref.collectionName);
        if (!records.has(ref.id)) throw new Error(`missing: ${ref.id}`);
        records.set(ref.id, structuredClone({ ...records.get(ref.id), ...value }));
      }
    };
    return callback(transaction);
  }

  records(name) {
    return [...(this.store.get(name) || new Map()).entries()]
      .map(([id, value]) => ({ id, ...structuredClone(value) }));
  }

  #records(name) {
    if (!this.store.has(name)) this.store.set(name, new Map());
    return this.store.get(name);
  }
}

const fakeAdmin = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => "SERVER_TIMESTAMP"
    },
    Timestamp: {
      fromMillis: (millis) => ({ millis })
    }
  }
};

function clientPhone(client) {
  return String(
    client.phoneNormalized ||
    client.clientPhoneNormalized ||
    client.client_phone_normalized ||
    ""
  ).replace(/\D/g, "");
}

function serviceWith(seed) {
  const db = new FakeDatabase(seed);
  const service = createQuestionnaireService({
    db,
    admin: fakeAdmin,
    clientRecordAvailableForMatching: (client) =>
      client.entityType !== "coach" &&
      client.ownershipStatus !== "conflict" &&
      client.clientSelectable === true,
    clientPhone,
    coachDirectory: [
      { id: "coach_1", name: "Coach Un" },
      { id: "coach_2", name: "Coach Deux" }
    ]
  });
  return { db, service };
}

function checkInBody({
  key = "routing-test-0001",
  phone = "450 555-0188",
  negative = false
} = {}) {
  const definition = publishDraft(INITIAL_DRAFTS.checkIn, {
    version: "1",
    publishedAt: "2026-07-23T00:00:00.000Z"
  });
  return {
    idempotencyKey: key,
    identity: {
      name: "Membre Test",
      phone
    },
    answers: {
      plan_still_good: !negative,
      execution_good: true,
      results_present: true
    },
    meta: {
      sourceUrl: definition.canonicalPath,
      definitionVersion: definition.version,
      versionHash: definition.versionHash
    }
  };
}

test("des propriétaires internes divergents restent en conflit fail-closed", async () => {
  const { db, service } = serviceWith({
    clients: {
      client_a: {
        name: "Membre A",
        phoneNormalized: "4505550188",
        coachId: "coach_1",
        dashboardOwnerCoachId: "coach_2",
        internalClientId: "internal_member_a",
        ownershipStatus: "confirmed",
        clientSelectable: true,
        entityType: "member"
      }
    }
  });
  const result = await service.submitPublicForm(
    "check-in-express",
    checkInBody(),
    { ip: "127.0.0.1", userAgent: "test" }
  );
  assert.equal(result.ok, true);
  const [response] = db.records("questionnaireResponses");
  assert.equal(response.routingStatus, "conflict");
  assert.equal(response.clientId, "");
  assert.equal(response.internalClientId, "");
  assert.equal(response.coachId, "questionnaire_review");
  assert.equal(response.processingStatus, "unmatched");
  assert.equal(response.triageStatus, "orange");
  assert.equal(db.records("tasks").length, 0);
});

test("un téléphone unique rattache la réponse au coachId confirmé", async () => {
  const { db, service } = serviceWith({
    clients: {
      client_a: {
        name: "Membre A",
        phoneNormalized: "4505550188",
        coachId: "coach_1",
        dashboardOwnerCoachId: "coach_1",
        internalClientId: "internal_member_a",
        ownershipStatus: "confirmed",
        clientSelectable: true,
        entityType: "member"
      }
    }
  });
  await service.submitPublicForm(
    "check-in-express",
    checkInBody({ key: "routing-test-owner-agrees" }),
    { ip: "127.0.0.11", userAgent: "test" }
  );
  const [response] = db.records("questionnaireResponses");
  assert.equal(response.routingStatus, "matched");
  assert.equal(response.clientId, "client_a");
  assert.equal(response.internalClientId, "internal_member_a");
  assert.equal(response.coachId, "coach_1");
  assert.equal(response.processingStatus, "archived");
  assert.equal(response.triageStatus, "vert");
});

test("la livraison GHL reste fermée jusqu'au canari exact et la preuve reste admin", async () => {
  const { db, service } = serviceWith({});
  const actor = { uid: "admin_uid", email: "info@crossfitstbasilelegrand.com" };
  await service.ensureInitialForms(actor);
  const form = db.records("questionnaireForms")
    .find((item) => item.id === "check_in_express");
  const catalogBefore = db.records("questionnaireCatalog")
    .find((item) => item.id === "check_in_express");
  assert.equal(form.deliveryReady, false);
  assert.equal(catalogBefore.deliveryReady, false);

  await assert.rejects(
    service.setDeliveryReady(actor, {
      formId: form.id,
      ready: true,
      confirmedGhlTag: form.ghlTag,
      confirmedPublicUrl: "https://example.com/mauvais-lien",
      verificationNote: "Canari reçu le 28 juillet."
    }),
    /tag ou l'URL confirmes/i
  );

  const enabled = await service.setDeliveryReady(actor, {
    formId: form.id,
    ready: true,
    confirmedGhlTag: form.ghlTag,
    confirmedPublicUrl: form.publicUrl,
    verificationNote: "Canari interne reçu le 28 juillet."
  });
  assert.equal(enabled.deliveryReady, true);
  assert.equal(enabled.deliveryVerificationNote, "Canari interne reçu le 28 juillet.");
  const catalogAfter = db.records("questionnaireCatalog")
    .find((item) => item.id === "check_in_express");
  assert.equal(catalogAfter.deliveryReady, true);
  assert.equal(Object.hasOwn(catalogAfter, "deliveryVerificationNote"), false);
  assert.equal(Object.hasOwn(catalogAfter, "deliveryVerifiedByEmail"), false);
});

test("un téléphone unique sans propriétaire reste en conflit à valider", async () => {
  const { db, service } = serviceWith({
    clients: {
      client_without_owner: {
        name: "Membre sans propriétaire",
        phoneNormalized: "4505550188",
        ownershipStatus: "confirmed",
        clientSelectable: true,
        entityType: "member"
      }
    }
  });
  await service.submitPublicForm(
    "check-in-express",
    checkInBody({ key: "routing-test-ownerless" }),
    { ip: "127.0.0.10", userAgent: "test" }
  );
  const [response] = db.records("questionnaireResponses");
  assert.equal(response.routingStatus, "conflict");
  assert.equal(response.processingStatus, "unmatched");
  assert.equal(response.coachId, "questionnaire_review");
  assert.equal(response.clientId, "");
  assert.equal(response.routingCandidateCount, 1);
});

test("aucun match reste dans une file de validation sans créer de client", async () => {
  const { db, service } = serviceWith({});
  await service.submitPublicForm(
    "check-in-express",
    checkInBody({ key: "routing-test-0002" }),
    { ip: "127.0.0.2", userAgent: "test" }
  );
  const [response] = db.records("questionnaireResponses");
  assert.equal(response.routingStatus, "unmatched");
  assert.equal(response.processingStatus, "unmatched");
  assert.equal(response.coachId, "questionnaire_review");
  assert.equal(response.clientId, "");
  assert.equal(db.records("clients").length, 0);
});

test("plusieurs candidats produisent un conflit fail-closed", async () => {
  const { db, service } = serviceWith({
    clients: {
      client_a: {
        phoneNormalized: "4505550188",
        coachId: "coach_1",
        ownershipStatus: "confirmed",
        clientSelectable: true,
        entityType: "member"
      },
      client_b: {
        clientPhoneNormalized: "4505550188",
        coachId: "coach_2",
        ownershipStatus: "confirmed",
        clientSelectable: true,
        entityType: "member"
      }
    }
  });
  await service.submitPublicForm(
    "check-in-express",
    checkInBody({ key: "routing-test-0003" }),
    { ip: "127.0.0.3", userAgent: "test" }
  );
  const [response] = db.records("questionnaireResponses");
  assert.equal(response.routingStatus, "conflict");
  assert.equal(response.routingCandidateCount, 2);
  assert.equal(response.clientId, "");
  assert.equal(response.coachId, "questionnaire_review");
});

test("un doublon bloqué empêche aussi le rattachement du candidat sélectionnable", async () => {
  const { db, service } = serviceWith({
    clients: {
      client_selectable: {
        phoneNormalized: "4505550188",
        coachId: "coach_1",
        ownershipStatus: "confirmed",
        clientSelectable: true,
        entityType: "member"
      },
      client_blocked_duplicate: {
        clientPhoneNormalized: "4505550188",
        coachId: "coach_2",
        ownershipStatus: "conflict",
        clientSelectable: false,
        entityType: "member"
      }
    }
  });
  await service.submitPublicForm(
    "check-in-express",
    checkInBody({ key: "routing-test-blocked-duplicate" }),
    { ip: "127.0.0.31", userAgent: "test" }
  );
  const [response] = db.records("questionnaireResponses");
  assert.equal(response.routingStatus, "conflict");
  assert.equal(response.routingCandidateCount, 2);
  assert.equal(response.clientId, "");
  assert.equal(response.internalClientId, "");
  assert.equal(response.coachId, "questionnaire_review");
});

test("un signal actionnable reste une seule réponse à lire, sans tâche dupliquée", async () => {
  const { db, service } = serviceWith({
    clients: {
      client_a: {
        name: "Membre A",
        phoneNormalized: "4505550188",
        coachId: "coach_1",
        ownershipStatus: "confirmed",
        clientSelectable: true,
        entityType: "member"
      }
    }
  });
  await service.submitPublicForm(
    "check-in-express",
    checkInBody({ key: "routing-test-0004", negative: true }),
    { ip: "127.0.0.4", userAgent: "test" }
  );
  const responses = db.records("questionnaireResponses");
  assert.equal(responses.length, 1);
  assert.equal(responses[0].processingStatus, "to_read");
  assert.equal(responses[0].triageStatus, "jaune");
  assert.equal(db.records("tasks").length, 0);
});

test("une reprise identique est idempotente et un contenu différent est refusé", async () => {
  const { db, service } = serviceWith({});
  const body = checkInBody({ key: "routing-test-0005" });
  const first = await service.submitPublicForm(
    "check-in-express",
    body,
    { ip: "127.0.0.5", userAgent: "test" }
  );
  const replay = await service.submitPublicForm(
    "check-in-express",
    body,
    { ip: "127.0.0.5", userAgent: "test" }
  );
  assert.equal(first.response.duplicate, false);
  assert.equal(first.response.stored, true);
  assert.equal(first.response.idempotencyKey, body.idempotencyKey);
  assert.match(first.response.responseId, /^studio_[A-Za-z0-9_-]+$/);
  assert.equal(typeof first.response.receivedAt, "string");
  assert.equal(replay.response.duplicate, true);
  assert.equal(replay.response.stored, true);
  assert.equal(replay.response.idempotencyKey, body.idempotencyKey);
  assert.equal(replay.response.responseId, first.response.responseId);
  assert.equal(db.records("questionnaireResponses").length, 1);

  const changed = checkInBody({
    key: "routing-test-0005",
    negative: true
  });
  await assert.rejects(
    () => service.submitPublicForm(
      "check-in-express",
      changed,
      { ip: "127.0.0.5", userAgent: "test" }
    ),
    (error) => error.code === "IDEMPOTENCY_CONFLICT" && error.status === 409
  );
  assert.equal(db.records("questionnaireResponses").length, 1);
});

test("un client non sélectionnable ou non confirmé ne peut pas être rattaché", async () => {
  for (const [id, client] of Object.entries({
    client_unconfirmed: {
      phoneNormalized: "4505550188",
      coachId: "coach_1",
      ownershipStatus: "pending",
      clientSelectable: true,
      entityType: "member"
    },
    client_blocked: {
      phoneNormalized: "4505550188",
      coachId: "coach_1",
      ownershipStatus: "confirmed",
      clientSelectable: false,
      entityType: "member"
    }
  })) {
    const { db, service } = serviceWith({
      clients: { [id]: client }
    });
    await service.submitPublicForm(
      "check-in-express",
      checkInBody({ key: `routing-test-${id}` }),
      { ip: `127.0.1.${id === "client_unconfirmed" ? "1" : "2"}`, userAgent: "test" }
    );
    const [response] = db.records("questionnaireResponses");
    assert.equal(response.routingStatus, "conflict");
    assert.equal(response.processingStatus, "unmatched");
    assert.equal(response.clientId, "");
    assert.equal(response.internalClientId, "");
    assert.equal(response.coachId, "questionnaire_review");
  }
});

test("deux formulaires publiés ne peuvent pas partager le même tag GHL", async () => {
  const { service } = serviceWith({});
  const actor = { uid: "admin_uid", email: "info@example.test" };
  const firstDraft = structuredClone(INITIAL_DRAFTS.educationalBenchmarks);
  firstDraft.title = "Repères alpha";
  firstDraft.slug = "reperes-alpha";
  firstDraft.ghlTag = "reperes-partage";
  const secondDraft = structuredClone(INITIAL_DRAFTS.educationalBenchmarks);
  secondDraft.title = "Repères beta";
  secondDraft.slug = "reperes-beta";
  secondDraft.ghlTag = "REPERES-PARTAGE";

  await service.saveDraft(actor, {
    formId: "form_reperes_alpha",
    draft: firstDraft
  });
  await service.publishForm(actor, {
    formId: "form_reperes_alpha"
  });
  await service.saveDraft(actor, {
    formId: "form_reperes_beta",
    draft: secondDraft
  });

  await assert.rejects(
    service.publishForm(actor, {
      formId: "form_reperes_beta"
    }),
    (error) => error?.code === "GHL_TAG_ALREADY_USED"
  );
});
