import { after, before, beforeEach, describe, test } from "node:test";
import { readFile } from "node:fs/promises";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes
} from "firebase/storage";

const PROJECT_ID = "demo-cfsb-dashboard-phase1";
const COACH_A = "15935";
const COACH_B = "15928";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_A_2 = "33333333-3333-4333-8333-333333333333";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";

const firestoreRules = await readFile(new URL("../../firestore.rules", import.meta.url), "utf8");
const storageRules = await readFile(new URL("../../storage.rules", import.meta.url), "utf8");

let testEnv;

function clientRecord({
  id,
  coachId,
  name = "Client test",
  originSystem = "dashboard_manual"
}) {
  return {
    contractVersion: 1,
    internalClientId: id,
    originSystem,
    dashboardResponsibleCoachId: coachId,
    coachId,
    responsibilityMode: originSystem === "dashboard_manual" ? "dashboard_only" : "follow_coachrx",
    serviceScopes: ["lifestyle_assessment"],
    name,
    entityType: "member",
    ownershipStatus: "confirmed",
    clientSelectable: true,
    status: "manual",
    updatedAt: Timestamp.fromMillis(1)
  };
}

function taskRecord({ coachId, clientId = "", status = "open" }) {
  return {
    dashboardResponsibleCoachId: coachId,
    coachId,
    clientId,
    title: "Suivi test",
    status,
    updatedAt: Timestamp.fromMillis(1)
  };
}

function questionnaireRecord({ coachId, clientId, status = "queued" }) {
  return {
    dashboardResponsibleCoachId: coachId,
    coachId,
    clientId,
    status,
    updatedAt: Timestamp.fromMillis(1)
  };
}

function context(uid, email) {
  return testEnv.authenticatedContext(uid, { email });
}

function coachAContext() {
  return context("uid-coach-a", "coach-a@example.test");
}

function coachBContext() {
  return context("uid-coach-b", "coach-b@example.test");
}

function adminContext() {
  return context("uid-admin", "info@crossfitstbasilelegrand.com");
}

async function seedFirestore(entries) {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    for (const [path, data] of entries) {
      await setDoc(doc(db, path), data);
    }
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8088,
      rules: firestoreRules
    },
    storage: {
      host: "127.0.0.1",
      port: 9198,
      rules: storageRules
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedFirestore([
    ["users/uid-coach-a", {
      active: true,
      role: "coach",
      coachId: COACH_A,
      email: "coach-a@example.test"
    }],
    ["users/uid-coach-b", {
      active: true,
      role: "coach",
      coachId: COACH_B,
      email: "coach-b@example.test"
    }],
    ["users/uid-admin", {
      active: true,
      role: "admin",
      coachId: "admin",
      email: "info@crossfitstbasilelegrand.com"
    }],
    ["clients/" + CLIENT_A, clientRecord({ id: CLIENT_A, coachId: COACH_A, name: "Client A" })],
    ["clients/" + CLIENT_A_2, clientRecord({ id: CLIENT_A_2, coachId: COACH_A, name: "Client A2" })],
    ["clients/" + CLIENT_B, clientRecord({ id: CLIENT_B, coachId: COACH_B, name: "Client B" })]
  ]);
});

after(async () => {
  await testEnv.cleanup();
});

describe("clients: canonical responsibility and bounded legacy reads", () => {
  test("a coach reads only canonical clients assigned to their profile", async () => {
    const ownDb = coachAContext().firestore();
    const otherDb = coachBContext().firestore();

    await assertSucceeds(getDoc(doc(ownDb, "clients", CLIENT_A)));
    await assertFails(getDoc(doc(otherDb, "clients", CLIENT_A)));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "clients", CLIENT_A)));
  });

  test("canonical collection queries require the responsible-coach predicate", async () => {
    const db = coachAContext().firestore();
    const scoped = query(
      collection(db, "clients"),
      where("dashboardResponsibleCoachId", "==", COACH_A)
    );

    await assertSucceeds(getDocs(scoped));
    await assertFails(getDocs(collection(db, "clients")));
  });

  test("legacy coachId queries cannot expose a canonically transferred client", async () => {
    await seedFirestore([
      ["clients/legacy-query-a", {
        coachId: COACH_A,
        name: "Legacy query A",
        entityType: "member",
        ownershipStatus: "confirmed",
        clientSelectable: true
      }],
      ["clients/canonical-transfer-to-b", {
        coachId: COACH_A,
        dashboardResponsibleCoachId: COACH_B,
        name: "Canonical transfer wins"
      }]
    ]);

    const legacyScoped = query(
      collection(coachAContext().firestore(), "clients"),
      where("coachId", "==", COACH_A)
    );

    // A coachId-only query can also match canonically transferred records whose
    // compatibility mirror is stale. The entire query must fail closed.
    await assertFails(getDocs(legacyScoped));
  });

  test("an admin may read every coach scope", async () => {
    const db = adminContext().firestore();
    await assertSucceeds(getDoc(doc(db, "clients", CLIENT_A)));
    await assertSucceeds(getDoc(doc(db, "clients", CLIENT_B)));
  });

  test("legacy coachId fallback is self-only and loses authority when canonical scope exists", async () => {
    await seedFirestore([
      ["clients/legacy-a", {
        coachId: COACH_A,
        name: "Legacy A",
        entityType: "member",
        ownershipStatus: "confirmed",
        clientSelectable: true
      }],
      ["clients/conflicting-scope", {
        coachId: COACH_A,
        dashboardResponsibleCoachId: COACH_B,
        name: "Canonical wins"
      }]
    ]);

    await assertSucceeds(getDoc(doc(coachAContext().firestore(), "clients", "legacy-a")));
    await assertFails(getDoc(doc(coachBContext().firestore(), "clients", "legacy-a")));
    await assertFails(getDoc(doc(coachAContext().firestore(), "clients", "conflicting-scope")));
    await assertSucceeds(getDoc(doc(coachBContext().firestore(), "clients", "conflicting-scope")));
  });

  test("no browser identity mutation is allowed, including self-scoped coach and admin", async () => {
    const newId = "44444444-4444-4444-8444-444444444444";
    const coachDb = coachAContext().firestore();
    const adminDb = adminContext().firestore();

    await assertFails(setDoc(
      doc(coachDb, "clients", newId),
      clientRecord({ id: newId, coachId: COACH_A })
    ));
    await assertFails(updateDoc(doc(coachDb, "clients", CLIENT_A), { name: "Forged update" }));
    await assertFails(updateDoc(doc(coachDb, "clients", CLIENT_A), {
      dashboardResponsibleCoachId: COACH_B,
      coachId: COACH_B
    }));
    await assertFails(setDoc(
      doc(adminDb, "clients", newId),
      clientRecord({ id: newId, coachId: COACH_A })
    ));
    await assertFails(updateDoc(doc(adminDb, "clients", CLIENT_A), {
      coachRxLink: { sourceClientId: "forged", linkStatus: "verified" }
    }));
    await assertFails(deleteDoc(doc(adminDb, "clients", CLIENT_A)));
  });

  test("engagement history follows its parent client scope and is server-written", async () => {
    await seedFirestore([["clients/" + CLIENT_A + "/engagements/evaluation-1", {
      serviceScope: "lifestyle_assessment",
      status: "completed"
    }]]);

    await assertSucceeds(getDoc(doc(
      coachAContext().firestore(),
      "clients", CLIENT_A, "engagements", "evaluation-1"
    )));
    await assertFails(getDoc(doc(
      coachBContext().firestore(),
      "clients", CLIENT_A, "engagements", "evaluation-1"
    )));
    await assertFails(setDoc(doc(
      coachAContext().firestore(),
      "clients", CLIENT_A, "engagements", "evaluation-2"
    ), { status: "forged" }));
    await assertFails(setDoc(doc(
      adminContext().firestore(),
      "clients", CLIENT_A, "engagements", "evaluation-admin"
    ), { status: "forged" }));
  });
});

describe("operational collections: canonical self scope", () => {
  test("a coach can create and update an own-scoped task linked to an own client", async () => {
    const db = coachAContext().firestore();
    const taskRef = doc(db, "tasks", "task-a");

    await assertSucceeds(setDoc(taskRef, taskRecord({ coachId: COACH_A, clientId: CLIENT_A })));
    await assertSucceeds(updateDoc(taskRef, {
      status: "done",
      updatedAt: Timestamp.fromMillis(2)
    }));
    await assertSucceeds(deleteDoc(taskRef));
  });

  test("a coach cannot choose another coach or link another coach's client", async () => {
    const db = coachAContext().firestore();

    await assertFails(setDoc(
      doc(db, "tasks", "forged-scope"),
      taskRecord({ coachId: COACH_B, clientId: CLIENT_B })
    ));
    await assertFails(setDoc(
      doc(db, "tasks", "forged-link"),
      taskRecord({ coachId: COACH_A, clientId: CLIENT_B })
    ));
  });

  test("a coach cannot transfer a task or write a legacy-only operational record", async () => {
    await seedFirestore([
      ["tasks/task-a", taskRecord({ coachId: COACH_A, clientId: CLIENT_A })],
      ["tasks/legacy-task-a", { coachId: COACH_A, title: "Legacy", status: "open" }]
    ]);
    const db = coachAContext().firestore();

    await assertFails(updateDoc(doc(db, "tasks", "task-a"), {
      dashboardResponsibleCoachId: COACH_B,
      coachId: COACH_B,
      clientId: CLIENT_B
    }));
    await assertSucceeds(getDoc(doc(db, "tasks", "legacy-task-a")));
    await assertFails(updateDoc(doc(db, "tasks", "legacy-task-a"), { status: "done" }));
  });

  test("legacy operational queries cannot expose a canonically transferred task", async () => {
    await seedFirestore([
      ["tasks/legacy-query-a", { coachId: COACH_A, title: "Legacy query", status: "open" }],
      ["tasks/canonical-own-a", taskRecord({ coachId: COACH_A, clientId: CLIENT_A })],
      ["tasks/canonical-transfer-to-b", {
        ...taskRecord({ coachId: COACH_B, clientId: CLIENT_B }),
        coachId: COACH_A
      }]
    ]);

    const legacyScoped = query(
      collection(coachAContext().firestore(), "tasks"),
      where("coachId", "==", COACH_A)
    );

    await assertFails(getDocs(legacyScoped));
    await assertSucceeds(getDocs(query(
      collection(coachAContext().firestore(), "tasks"),
      where("dashboardResponsibleCoachId", "==", COACH_A)
    )));
    await assertSucceeds(getDocs(collection(adminContext().firestore(), "tasks")));
  });

  test("performance settings and sync status are self-only", async () => {
    await seedFirestore([
      ["performanceSettings/" + COACH_A, { coachId: COACH_A, target: 5 }],
      ["performanceSettings/" + COACH_B, { coachId: COACH_B, target: 7 }],
      ["coachSyncStatus/" + COACH_A, { status: "ready" }],
      ["coachSyncStatus/" + COACH_B, { status: "ready" }]
    ]);
    const db = coachAContext().firestore();

    await assertSucceeds(getDoc(doc(db, "performanceSettings", COACH_A)));
    await assertFails(getDoc(doc(db, "performanceSettings", COACH_B)));
    await assertSucceeds(getDoc(doc(db, "coachSyncStatus", COACH_A)));
    await assertFails(getDoc(doc(db, "coachSyncStatus", COACH_B)));
  });

  test("voice queue payloads cannot select another coach", async () => {
    const db = coachAContext().firestore();
    const payload = (selectedCoachId) => ({
      coachId: selectedCoachId,
      taskId: "task-voice",
      userId: "uid-coach-a",
      userEmail: "coach-a@example.test",
      status: "queued",
      chunkCount: 1,
      audioBase64Length: 4,
      mission: {
        coachId: selectedCoachId,
        taskId: "task-voice"
      },
      createdAt: Timestamp.fromMillis(1),
      updatedAt: Timestamp.fromMillis(1)
    });

    await assertSucceeds(setDoc(doc(db, "voiceMissionRequests", "voice-own"), payload(COACH_A)));
    await assertFails(setDoc(doc(db, "voiceMissionRequests", "voice-other"), payload(COACH_B)));
  });
});

describe("questionnaires: read scope and immutable binding", () => {
  test("questionnaire responses are created only by trusted server integrations", async () => {
    await assertFails(setDoc(
      doc(adminContext().firestore(), "questionnaireResponses", "response-admin-create"),
      {
        ...questionnaireRecord({ coachId: COACH_A, clientId: CLIENT_A, status: "to_read" }),
        processingStatus: "to_read"
      }
    ));
  });

  test("questionnaire sends and schedules are server-write only, even for admin", async () => {
    const send = questionnaireRecord({ coachId: COACH_A, clientId: CLIENT_A });

    await assertFails(setDoc(doc(coachAContext().firestore(), "questionnaireSends", "send-coach"), send));
    await assertFails(setDoc(doc(adminContext().firestore(), "questionnaireSends", "send-admin"), send));
    await assertFails(setDoc(doc(coachAContext().firestore(), "questionnaireSchedules", "schedule-coach"), send));
  });

  test("a coach reads only their sends and cannot alter status or binding", async () => {
    await seedFirestore([
      ["questionnaireSends/send-a", questionnaireRecord({ coachId: COACH_A, clientId: CLIENT_A })],
      ["questionnaireSends/send-b", questionnaireRecord({ coachId: COACH_B, clientId: CLIENT_B })]
    ]);

    await assertSucceeds(getDoc(doc(coachAContext().firestore(), "questionnaireSends", "send-a")));
    await assertFails(getDoc(doc(coachAContext().firestore(), "questionnaireSends", "send-b")));
    await assertFails(updateDoc(
      doc(coachAContext().firestore(), "questionnaireSends", "send-a"),
      { status: "sent" }
    ));
  });

  test("a coach may mark an own response read but cannot rebind it", async () => {
    await seedFirestore([["questionnaireResponses/response-a", {
      ...questionnaireRecord({ coachId: COACH_A, clientId: CLIENT_A, status: "to_read" }),
      processingStatus: "to_read"
    }]]);
    const responseRef = doc(coachAContext().firestore(), "questionnaireResponses", "response-a");

    await assertSucceeds(updateDoc(responseRef, {
      processingStatus: "read",
      readAt: Timestamp.fromMillis(2),
      readByUid: "uid-coach-a",
      readByEmail: "coach-a@example.test",
      updatedAt: Timestamp.fromMillis(2)
    }));
    await assertFails(updateDoc(responseRef, {
      clientId: CLIENT_A_2,
      processingStatus: "to_read",
      updatedAt: Timestamp.fromMillis(3)
    }));
  });

  test("admin browser updates cannot change questionnaire identity or responsibility", async () => {
    await seedFirestore([["questionnaireResponses/response-a", {
      ...questionnaireRecord({ coachId: COACH_A, clientId: CLIENT_A, status: "to_read" }),
      processingStatus: "to_read"
    }]]);
    const responseRef = doc(adminContext().firestore(), "questionnaireResponses", "response-a");

    await assertFails(updateDoc(responseRef, { clientId: CLIENT_A_2 }));
    await assertFails(updateDoc(responseRef, {
      dashboardResponsibleCoachId: COACH_B,
      coachId: COACH_B
    }));
    await assertSucceeds(updateDoc(responseRef, { processingStatus: "reviewed" }));
  });

  test("action logs are append-only from trusted server code", async () => {
    const log = {
      dashboardResponsibleCoachId: COACH_A,
      coachId: COACH_A,
      action: "forged.browser.log"
    };
    await assertFails(setDoc(doc(coachAContext().firestore(), "actionLogs", "coach-log"), log));
    await assertFails(setDoc(doc(adminContext().firestore(), "actionLogs", "admin-log"), log));
  });
});

describe("Storage task voice notes: path coach isolation", () => {
  test("a coach can upload, read and delete only inside their own path", async () => {
    const ownStorage = coachAContext().storage();
    const otherStorage = coachBContext().storage();
    const anonymousStorage = testEnv.unauthenticatedContext().storage();
    const path = `taskVoiceNotes/${COACH_A}/task-storage/voice.webm`;
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await assertSucceeds(uploadBytes(ref(ownStorage, path), bytes, { contentType: "audio/webm" }));
    await assertSucceeds(getBytes(ref(ownStorage, path)));
    await assertFails(getBytes(ref(otherStorage, path)));
    await assertFails(getBytes(ref(anonymousStorage, path)));
    await assertFails(deleteObject(ref(otherStorage, path)));
    await assertSucceeds(deleteObject(ref(ownStorage, path)));
  });

  test("cross-coach uploads and non-audio uploads are rejected", async () => {
    const storage = coachAContext().storage();
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await assertFails(uploadBytes(
      ref(storage, `taskVoiceNotes/${COACH_B}/task-storage/cross.webm`),
      bytes,
      { contentType: "audio/webm" }
    ));
    await assertFails(uploadBytes(
      ref(storage, `taskVoiceNotes/${COACH_A}/task-storage/not-audio.txt`),
      bytes,
      { contentType: "text/plain" }
    ));
  });

  test("an admin browser session cannot traverse a coach voice-note path", async () => {
    const storage = adminContext().storage();
    const path = `taskVoiceNotes/${COACH_B}/task-storage/admin.webm`;

    await assertFails(uploadBytes(
      ref(storage, path),
      new Uint8Array([5, 6, 7]),
      { contentType: "audio/webm" }
    ));
  });
});
