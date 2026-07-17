const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { buildWeeklyProductReport } = require("./product-report");
const {
  buildReadOnlyAssistantContext,
  resolveTaskCreateProposal,
  verifiedEvidenceRefs
} = require("./assistant-context");
const { generateReadOnlyAssistantProposal, transcribeAssistantVoice } = require("./assistant-ai");

admin.initializeApp();

const db = admin.firestore();
const ghlPrivateToken = defineSecret("GHL_PRIVATE_TOKEN");
const dashboardImportToken = defineSecret("DASHBOARD_IMPORT_TOKEN");
const VOICE_NOTE_BUCKET_NAME = "cfsb-dashboard-coach-aa9a4.firebasestorage.app";
const VOICE_NOTE_MAX_SECONDS = 120;
const VOICE_NOTE_MAX_BYTES = 8 * 1024 * 1024;
const VOICE_NOTE_ALLOWED_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/webm"
]);
const ASSISTANT_ADMIN_EMAIL = "info@crossfitstbasilelegrand.com";
const ASSISTANT_REQUEST_MAX_CHARS = 1200;
const ASSISTANT_REQUEST_RATE_WINDOW_MS = 5 * 60 * 1000;
const ASSISTANT_REQUEST_RATE_LIMIT = 12;
const ASSISTANT_ACTION_PROPOSAL_TTL_MS = 30 * 60 * 1000;
const ASSISTANT_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const GHL_LOCATION_ID = "hWM7E7ZXB88LWDmjezKU";
const QUESTIONNAIRE_URL = "https://cfsb-dashboard-coach-aa9a4.web.app/questionnaire/";
const DEFAULT_QUESTIONNAIRE_TYPE = "suivi_global";
const QUESTIONNAIRE_TYPES = {
  suivi_global: {
    type: "suivi_global",
    label: "Globale check",
    ghlTag: "dashboardcoach",
    path: "/questionnaire/"
  },
  habitudes_quotidiennes: {
    type: "habitudes_quotidiennes",
    label: "Check-in",
    ghlTag: "suiviregulier",
    path: "/questionnaire/check-in/"
  },
  evaluation_habitudes_vie: {
    type: "evaluation_habitudes_vie",
    label: "Evaluation habitudes de vie",
    ghlTag: "evaluationnutrition",
    path: "/questionnaire/evaluation-habitudes-vie/"
  }
};
const QUESTIONNAIRE_TAG = QUESTIONNAIRE_TYPES[DEFAULT_QUESTIONNAIRE_TYPE].ghlTag;
const DASHBOARD_SHEET_ID = "18-S_a5L6fXYZXtcgHBlCKpcygmnr5Ekj_WM5358KZ7E";
const QUESTIONNAIRE_RESPONSES_SHEET_ID = "11QO5GOQGHCpT8_nLEgKHqjFFsZ4emPwZEt2Vlu3WRJo";
const FIREBASE_SYNC_SERVICE_ACCOUNT = "129233025317-compute@developer.gserviceaccount.com";
const GOOGLE_SHEETS_READ_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly"
];
const SHEET_TABS = {
  coachRxAll: "SRC_CoachRx_Browser_All",
  coachRxLegacy: "SRC_CoachRx_Browser",
  coreClients: "CORE_Clients",
  coreClientsManual: "CORE_Clients_Manual",
  tasks: "TASKS_Current",
  rebookings: "SRC_Rebookings_SemiPrive",
  checkups: "SRC_CSM_FormulaireCheckup",
  alumni: "CORE_Alumni",
  impactLog: "IMPACT_Log",
  impactOpportunities: "IMPACT_Opportunities"
};
const OPTIONAL_DASHBOARD_TABS = new Set([
  SHEET_TABS.coachRxLegacy,
  SHEET_TABS.coreClientsManual,
  SHEET_TABS.rebookings,
  SHEET_TABS.checkups,
  SHEET_TABS.alumni,
  SHEET_TABS.impactLog,
  SHEET_TABS.impactOpportunities
]);
const QUESTIONNAIRE_TABS = {
  responses: "Responses",
  testResponses: "Test_Responses"
};
const CSM_CHECKUP_SHEET_ID = "1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw";
const CSM_CHECKUP_TAB_CANDIDATES = [
  "Form Responses 1",
  "Réponses au formulaire 1",
  "Reponses au formulaire 1",
  "Formulaire Checkup",
  "Responses",
  "Checkups",
  "Check-ups",
  "CSM",
  "CSM Checkups"
];
const PILOT_COACHES = [
  { id: "15935", coachRxId: "15935", name: "Marc-Andre Menard", email: "marcandremenard89@gmail.com", aliases: ["Marc-Andre Menard", "Marc-André Ménard"] },
  { id: "15928", coachRxId: "15928", name: "Iheb Yahyaoui", email: "ihebya73@gmail.com", aliases: ["Iheb Yahyaoui", "Iheb Yahiaoui"] },
  { id: "17242", coachRxId: "17242", name: "Camille Proulx", email: "camproulxx@gmail.com", aliases: ["Camille Proulx"] },
  { id: "15902", coachRxId: "15902", name: "David Olivier", email: "davidolivier1997@gmail.com", aliases: ["David Olivier"] },
  { id: "15893", coachRxId: "15893", name: "Gabriel Mayer Bedard", email: "info@crossfitstbasilelegrand.com", aliases: ["Gabriel Mayer Bedard", "Gabriel Mayer Bédard"] },
  { id: "15937", coachRxId: "15937", name: "Hugo Lelievre", email: "hugolelievre34@gmail.com", aliases: ["Hugo Lelievre", "Hugo Lelièvre"] },
  { id: "15936", coachRxId: "15936", name: "Raphael Samson", email: "raphael.samson@usherbrooke.ca", aliases: ["Raphael Samson", "Raphaël Samson"] }
];

const PILOT_COACH_ALIAS_PATCHES = {
  "15935": ["Marc-Andr\u00e9 M\u00e9nard", "Marc Andre Menard", "Marc-Andre", "Marc-Andr\u00e9"],
  "15928": ["Iheb"],
  "17242": ["Camille"],
  "15893": ["Gabriel Mayer B\u00e9dard", "Gabriel"],
  "15902": ["David"],
  "15937": ["Hugo Leli\u00e8vre", "Hugo"],
  "15936": ["Rapha\u00ebl Samson", "Raph", "Raph s"]
};
PILOT_COACHES.forEach((coach) => {
  coach.aliases = [...new Set([...(coach.aliases || []), ...(PILOT_COACH_ALIAS_PATCHES[coach.id] || [])])];
});

const COACH_ID_ALIASES = [
  "coach id",
  "coach_id",
  "coachrx id",
  "coachrxid",
  "coach rx id",
  "coachrx team id",
  "coach rx team id",
  "coach team id",
  "team id",
  "team_id",
  "id coach",
  "id entraineur",
  "entraineur id",
  "trainer id",
  "owner id",
  "coach id coachrx",
  "team",
  "teamid",
  "coach url",
  "coachrx url",
  "url coachrx",
  "lien coachrx",
  "dashboard url"
];
const COACH_TEXT_ALIASES = [
  "coach",
  "coach name",
  "coach_name",
  "coach email",
  "coach_email",
  "nom coach",
  "nom du coach",
  "coach principal",
  "entraineur",
  "entraineur principal",
  "trainer",
  "assigned coach",
  "coach assigne",
  "coach assigné",
  "assigned trainer",
  "primary coach",
  "owner",
  "staff",
  "staff name",
  "intervenant",
  "coachrx coach",
  "tags",
  "tag",
  "coachrx tags",
  "coach rx tags"
];
const PHONE_ALIASES = [
  "client_phone_normalized",
  "phone normalized",
  "phone_normalized",
  "phone",
  "phone number",
  "phone_number",
  "client phone",
  "client phone number",
  "client_phone_number",
  "client telephone",
  "client telephone number",
  "client tel",
  "telephone",
  "telephone number",
  "telephone_number",
  "tel",
  "mobile",
  "portable",
  "mobile phone",
  "mobile_phone",
  "mobile principal",
  "cell",
  "cell phone",
  "cell_phone",
  "cellulaire",
  "numero telephone",
  "numero de telephone",
  "numero tel",
  "numero cellulaire",
  "no telephone",
  "no tel",
  "telephone principal",
  "telephone mobile",
  "telephone cellulaire",
  "téléphone",
  "téléphone principal",
  "téléphone mobile",
  "téléphone cellulaire",
  "numéro de téléphone",
  "numero de téléphone",
  "client téléphone",
  "contact phone",
  "contact phone number",
  "contact_phone",
  "contact_phone_number",
  "contact telephone",
  "contact téléphone",
  "whatsapp",
  "primary phone",
  "primary_phone",
  "main phone",
  "main_phone",
  "phone cell",
  "telephone_raw",
  "phone_raw",
  "gsm"
];
const CLIENT_NAME_ALIASES = [
  "client name",
  "client_name",
  "client",
  "name",
  "nom",
  "nom client",
  "nom du client",
  "full name",
  "fullname",
  "full_name",
  "nom complet",
  "client full name",
  "contact full name",
  "contact_name",
  "member",
  "member name",
  "member full name",
  "membre",
  "nom membre",
  "athlete",
  "athlete name",
  "athlete full name",
  "contact",
  "contact name",
  "customer",
  "customer name"
];
const CLIENT_FIRST_NAME_ALIASES = [
  "first name",
  "firstname",
  "prenom",
  "prénom",
  "client first name",
  "client_first_name",
  "contact first name"
];
const CLIENT_LAST_NAME_ALIASES = [
  "last name",
  "lastname",
  "nom de famille",
  "client last name",
  "client_last_name",
  "contact last name"
];
const CLIENT_ID_ALIASES = [
  "client key",
  "client id",
  "client_id",
  "coachrx client id",
  "coachrx_client_id",
  "id client",
  "id",
  "contact id",
  "contact_id",
  "ghl contact id",
  "member id",
  "athlete id"
];
const EMAIL_ALIASES = [
  "email",
  "courriel",
  "client email",
  "client_email",
  "contact email",
  "contact_email",
  "courriel client",
  "email address"
];
const COACHRX_SIGNAL_ALIASES = [
  "alert",
  "alerte",
  "color",
  "colour",
  "couleur",
  "coachrx alert",
  "coachrx color",
  "coachrx colour",
  "coachrx severity",
  "signal",
  "severity"
];
const COACHRX_STATE_ALIASES = [
  "state",
  "etat",
  "status",
  "statut",
  "coachrx state",
  "coachrx status"
];
const EXERCISE_SIGNAL_ALIASES = [
  "exercise alert",
  "exercise color",
  "exercise colour",
  "exercise severity",
  "exercise due alert",
  "exercise due color",
  "exercise due colour",
  "exercise chip color",
  "exercise chip class",
  "exercise badge color",
  "exercise badge class",
  "program alert",
  "program color",
  "program colour",
  "program severity",
  "program due alert",
  "program due color",
  "program due colour",
  "program chip color",
  "program chip class",
  "programme alert",
  "programme color",
  "programme colour",
  "programme severity",
  "programme du alert",
  "programme du color",
  "programme du colour"
];
const EXERCISE_STATE_ALIASES = [
  "exercise state",
  "exercise status",
  "exercise due state",
  "exercise due status",
  "program state",
  "program status",
  "program due state",
  "program due status",
  "programme state",
  "programme status",
  "programme du state",
  "programme du status"
];
const LIFESTYLE_SIGNAL_ALIASES = [
  "lifestyle alert",
  "lifestyle color",
  "lifestyle colour",
  "lifestyle severity",
  "lifestyle due alert",
  "lifestyle due color",
  "lifestyle due colour",
  "lifestyle chip color",
  "lifestyle chip class",
  "lifestyle badge color",
  "lifestyle badge class",
  "habitude alert",
  "habitude color",
  "habitude colour"
];
const LIFESTYLE_STATE_ALIASES = [
  "lifestyle state",
  "lifestyle status",
  "lifestyle due state",
  "lifestyle due status",
  "habitude state",
  "habitude status"
];

function voiceMissionMimeType(value) {
  const raw = String(value || "").trim().toLowerCase();
  const base = raw.split(";")[0];
  if (!VOICE_NOTE_ALLOWED_MIME_TYPES.has(base)) {
    throw new HttpsError("invalid-argument", "Format audio non supporte. Reenregistre le vocal sur cet appareil.");
  }
  return raw || base;
}

function voiceMissionExtension(mimeType) {
  const base = String(mimeType || "").split(";")[0];
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/aac") return "aac";
  if (base === "audio/mpeg") return "mp3";
  return "webm";
}

function voiceMissionTaskId(value) {
  const taskId = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(taskId)) {
    throw new HttpsError("invalid-argument", "Identifiant de mission invalide.");
  }
  return taskId;
}

function voiceMissionAudioBuffer(value) {
  const base64 = String(value || "").trim();
  if (!base64 || base64.length > Math.ceil(VOICE_NOTE_MAX_BYTES * 4 / 3) + 8) {
    throw new HttpsError("invalid-argument", "Le vocal est absent ou trop lourd.");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new HttpsError("invalid-argument", "Le contenu du vocal est invalide.");
  }
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > VOICE_NOTE_MAX_BYTES) {
    throw new HttpsError("invalid-argument", "Le vocal est absent ou depasse la limite de 8 Mo.");
  }
  return buffer;
}

async function recordVoiceMissionAttempt(attemptRef, patch) {
  try {
    await attemptRef.set({
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.warn("voice_mission_attempt_log_failed", error?.message || error);
  }
}

async function handleSaveVoiceMission(request) {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Connexion requise pour sauvegarder le vocal.");
    }

    const data = request.data || {};
    const operation = data.operation === "edit" ? "edit" : "create";
    const taskId = voiceMissionTaskId(data.taskId);
    const coachId = cleanString(data.coachId);
    const title = String(data.title || "").trim().slice(0, 240);
    const description = String(data.description || "").trim().slice(0, 3000);
    const priority = ["P1", "P2", "P3"].includes(data.priority) ? data.priority : "P2";
    const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(String(data.dueAt || ""))
      ? String(data.dueAt)
      : new Date().toISOString().slice(0, 10);
    const starred = data.starred === true;
    const clientId = cleanString(data.clientId);
    const requestedClientName = String(data.clientName || "").trim().slice(0, 240);
    const taskType = data.taskType === "rebooking" ? "rebooking" : "manual";
    const taskSource = taskType === "rebooking" ? "firebase_app_rebooking_mission" : "firebase_app_manual";
    const rebookingId = taskType === "rebooking" ? cleanString(data.rebookingId) : "";
    const relatedRebookingIds = taskType === "rebooking" && Array.isArray(data.relatedRebookingIds)
      ? [...new Set(data.relatedRebookingIds.map(cleanString).filter(Boolean))].slice(0, 50)
      : [];
    const durationSeconds = Math.min(
      VOICE_NOTE_MAX_SECONDS,
      Math.max(1, Math.round(Number(data.durationSeconds || 1)))
    );

    if (!coachId || !isPilotCoachId(coachId)) {
      throw new HttpsError("invalid-argument", "Coach cible invalide.");
    }
    if (!title) {
      throw new HttpsError("invalid-argument", "Le titre de la mission est requis.");
    }

    const profileSnap = await db.doc(`users/${request.auth.uid}`).get();
    if (!profileSnap.exists || profileSnap.get("active") !== true) {
      throw new HttpsError("permission-denied", "Acces dashboard non configure.");
    }
    const profile = profileSnap.data() || {};
    if (!canPilotProfileActOnCoach(profile, coachId)) {
      await recordAccessIssue({
        source: "saveVoiceMission",
        uid: request.auth.uid,
        email: request.auth.token?.email,
        actorCoachId: profile.coachId,
        targetCoachId: coachId,
        reason: accessIssueMessage(profile, coachId)
      });
      throw new HttpsError("permission-denied", accessIssueMessage(profile, coachId));
    }

    const taskRef = db.collection("tasks").doc(taskId);
    const taskSnap = await taskRef.get();
    const existingTask = taskSnap.exists ? (taskSnap.data() || {}) : {};
    if (operation === "edit" && !taskSnap.exists) {
      throw new HttpsError("not-found", "Mission introuvable.");
    }
    if (taskSnap.exists && cleanString(existingTask.coachId) !== coachId) {
      throw new HttpsError("permission-denied", "Cette mission appartient a un autre portefeuille coach.");
    }
    if (operation === "create" && existingTask.voiceNote?.storagePath && existingTask.voiceNoteStatus === "ready") {
      return {
        ok: true,
        taskId,
        reused: true,
        voiceNote: existingTask.voiceNote
      };
    }

    let client = null;
    if (clientId) {
      const clientSnap = await db.doc(`clients/${clientId}`).get();
      if (!clientSnap.exists) {
        throw new HttpsError("not-found", "Client introuvable.");
      }
      client = clientSnap.data() || {};
      if (cleanString(client.coachId) !== coachId) {
        throw new HttpsError("failed-precondition", "Le client et la mission ne sont pas dans le meme portefeuille coach.");
      }
    }

    if (operation === "create" && taskType === "rebooking") {
      if (!rebookingId) {
        throw new HttpsError("invalid-argument", "Dossier rebooking requis pour cette mission.");
      }
      const rebookingSnap = await db.collection("rebookings").doc(rebookingId).get();
      if (!rebookingSnap.exists) {
        throw new HttpsError("not-found", "Dossier rebooking introuvable.");
      }
      const rebookingData = rebookingSnap.data() || {};
      const rebookingCoachId = cleanString(rebookingData.coachId || rebookingData.assignedCoachId || rebookingData.coachRxId);
      if (rebookingCoachId && rebookingCoachId !== coachId) {
        throw new HttpsError("permission-denied", "Le rebooking et la mission ne sont pas dans le meme portefeuille coach.");
      }
    }

    const mimeType = voiceMissionMimeType(data.mimeType);
    const audioBuffer = voiceMissionAudioBuffer(data.audioBase64);
    const coachSnap = await db.doc(`coaches/${coachId}`).get();
    const pilotCoach = PILOT_COACHES.find((coach) => coach.id === coachId || coach.coachRxId === coachId);
    const coachName = cleanString(coachSnap.data()?.name || pilotCoach?.name || existingTask.coachName);
    const extension = voiceMissionExtension(mimeType);
    const storagePath = `taskVoiceNotes/${coachId}/${taskId}/voice.${extension}`;
    const bucket = admin.storage().bucket(VOICE_NOTE_BUCKET_NAME);
    const file = bucket.file(storagePath);
    const previousStoragePath = cleanString(existingTask.voiceNote?.storagePath);
    const downloadToken = crypto.randomUUID();
    const attemptRef = db.collection("voiceMissionAttempts").doc();
    let stage = "storage_upload";

    await recordVoiceMissionAttempt(attemptRef, {
      status: "started",
      operation,
      taskId,
      coachId,
      requestedByUid: request.auth.uid,
      requestedByEmail: request.auth.token?.email || "",
      sizeBytes: audioBuffer.length,
      mimeType,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    try {
      await file.save(audioBuffer, {
        resumable: false,
        validation: "md5",
        metadata: {
          contentType: mimeType,
          cacheControl: "private, max-age=0, no-transform",
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            taskId,
            coachId,
            createdByUid: request.auth.uid,
            createdByEmail: request.auth.token?.email || ""
          }
        }
      });

      stage = "firestore_write";
      const createdAtIso = new Date().toISOString();
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
      const voiceNote = {
        storagePath,
        downloadUrl,
        durationSeconds,
        mimeType,
        sizeBytes: audioBuffer.length,
        createdAtIso,
        createdByUid: request.auth.uid,
        createdByEmail: request.auth.token?.email || ""
      };
      const payload = {
        coachId,
        coachRxId: cleanString(coachSnap.data()?.coachRxId || pilotCoach?.coachRxId || coachId),
        coachName,
        title,
        description,
        priority,
        priorityRank: priority === "P1" ? 1 : priority === "P2" ? 2 : 3,
        dueAt,
        starred,
        starredAt: starred ? (existingTask.starredAt || admin.firestore.FieldValue.serverTimestamp()) : null,
        voiceNote,
        voiceNoteStatus: "ready",
        voiceNoteError: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      if (operation === "create") {
        Object.assign(payload, {
          clientId,
          clientName: cleanString(client?.name || requestedClientName),
          type: taskType,
          status: "open",
          source: taskSource,
          rebookingId,
          relatedRebookingIds,
          createdAt: existingTask.createdAt || admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        payload.manualEditedAt = admin.firestore.FieldValue.serverTimestamp();
        payload.manualEditedBy = request.auth.token?.email || "";
      }
      await taskRef.set(payload, { merge: operation === "edit" || taskSnap.exists });

      stage = "cleanup";
      if (previousStoragePath && previousStoragePath !== storagePath) {
        await bucket.file(previousStoragePath).delete().catch((error) => {
          if (Number(error?.code) !== 404) console.warn("old_voice_delete_failed", previousStoragePath, error?.message || error);
        });
      }
      await recordVoiceMissionAttempt(attemptRef, {
        status: "success",
        stage: "complete",
        storagePath,
        finishedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      await db.collection("actionLogs").add({
        action: operation === "edit" ? "task.voice_updated" : "task.voice_created",
        entityType: "tasks",
        entityId: taskId,
        coachId,
        userId: request.auth.uid,
        userEmail: request.auth.token?.email || "",
        userRole: cleanString(profile.role),
        details: {
          durationSeconds,
          sizeBytes: audioBuffer.length,
          operation,
          source: "firebase_function_voice_mission",
          taskType,
          rebookingId
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }).catch((error) => console.warn("voice_action_log_failed", error?.message || error));

      return { ok: true, taskId, voiceNote };
    } catch (error) {
      if (stage === "firestore_write") {
        await file.delete().catch(() => {});
      }
      const errorMessage = cleanString(error?.message || error || "Erreur vocale inconnue.").slice(0, 300);
      await recordVoiceMissionAttempt(attemptRef, {
        status: "error",
        stage,
        errorCode: cleanString(error?.code),
        errorMessage,
        finishedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.error("save_voice_mission_failed", { taskId, coachId, operation, stage, errorMessage });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "Le serveur n'a pas pu sauvegarder le vocal.",
        { attemptId: attemptRef.id, stage }
      );
    }
}

async function deleteVoiceMissionChunkDocs(docs) {
  for (let start = 0; start < docs.length; start += 400) {
    const batch = db.batch();
    docs.slice(start, start + 400).forEach((snapshot) => batch.delete(snapshot.ref));
    await batch.commit().catch((error) => console.warn("voice_chunk_cleanup_failed", error?.message || error));
  }
}

exports.processVoiceMissionRequest = onDocumentCreated(
  {
    document: "voiceMissionRequests/{requestId}",
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "512MiB"
  },
  async (event) => {
    const requestRef = event.data?.ref;
    const requestData = event.data?.data() || {};
    const requestId = cleanString(event.params?.requestId);
    if (!requestRef || !requestId || requestData.status !== "queued") return;

    const userId = cleanString(requestData.userId);
    const userEmail = cleanString(requestData.userEmail);
    const coachId = cleanString(requestData.coachId);
    const taskId = cleanString(requestData.taskId);
    const chunkCount = Number(requestData.chunkCount || 0);
    let chunkDocs = [];

    await requestRef.set({
      status: "processing",
      processingAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    try {
      if (!userId || !coachId || !taskId || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 40) {
        throw new HttpsError("invalid-argument", "Demande vocale incomplete.");
      }
      const chunksSnap = await db.collection("voiceMissionChunks")
        .where("requestId", "==", requestId)
        .get();
      chunkDocs = chunksSnap.docs;
      if (chunkDocs.length !== chunkCount) {
        throw new HttpsError("failed-precondition", `Vocal incomplet: ${chunkDocs.length}/${chunkCount} morceaux recus.`);
      }
      const chunks = chunkDocs
        .map((snapshot) => ({ snapshot, data: snapshot.data() || {} }))
        .sort((left, right) => Number(left.data.index) - Number(right.data.index));
      chunks.forEach(({ data }, index) => {
        if (
          cleanString(data.requestId) !== requestId
          || cleanString(data.coachId) !== coachId
          || cleanString(data.userId) !== userId
          || Number(data.total) !== chunkCount
          || Number(data.index) !== index
          || typeof data.data !== "string"
        ) {
          throw new HttpsError("failed-precondition", "Un morceau du vocal est invalide.");
        }
      });
      const audioBase64 = chunks.map(({ data }) => data.data).join("");
      if (Number(requestData.audioBase64Length || 0) !== audioBase64.length) {
        throw new HttpsError("failed-precondition", "Le vocal recu est incomplet.");
      }

      const result = await handleSaveVoiceMission({
        auth: { uid: userId, token: { email: userEmail } },
        data: {
          ...(requestData.mission || {}),
          coachId,
          taskId,
          audioBase64
        }
      });
      await requestRef.set({
        status: "success",
        result,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      const errorMessage = cleanString(error?.message || error || "Erreur vocale inconnue.").slice(0, 300);
      await requestRef.set({
        status: "error",
        errorCode: cleanString(error?.code || "internal"),
        errorMessage,
        errorStage: cleanString(error?.details?.stage || "queue_processing"),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.error("process_voice_mission_request_failed", { requestId, coachId, taskId, errorMessage });
    } finally {
      await deleteVoiceMissionChunkDocs(chunkDocs);
    }
  }
);

exports.sendQuestionnaire = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [ghlPrivateToken],
    timeoutSeconds: 60
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Connexion Google requise.");
    }

    const clientId = cleanString(request.data?.clientId);
    if (!clientId) {
      throw new HttpsError("invalid-argument", "clientId manquant.");
    }

    const [profileSnap, clientSnap] = await Promise.all([
      db.doc(`users/${request.auth.uid}`).get(),
      db.doc(`clients/${clientId}`).get()
    ]);

    if (!profileSnap.exists || profileSnap.get("active") !== true) {
      throw new HttpsError("permission-denied", "Acces dashboard non configure.");
    }
    if (!clientSnap.exists) {
      throw new HttpsError("not-found", "Client introuvable.");
    }

    const profile = profileSnap.data();
    const client = clientSnap.data();
    const coachId = cleanString(client.coachId);
    const coachSnap = coachId ? await db.doc(`coaches/${coachId}`).get() : null;
    const pilotCoach = PILOT_COACHES.find((coach) => coach.id === coachId || coach.coachRxId === coachId);
    const coachName = cleanString(client.coachName || coachSnap?.data()?.name || pilotCoach?.name || "");
    if (!canPilotProfileActOnCoach(profile, coachId)) {
      const actorCoachId = cleanString(profile.coachId);
      await recordAccessIssue({
        source: "sendQuestionnaire",
        uid: request.auth.uid,
        email: request.auth.token?.email,
        actorCoachId,
        targetCoachId: coachId,
        clientId,
        reason: accessIssueMessage(profile, coachId)
      });
      throw new HttpsError(
        "permission-denied",
        `Acces coach refuse. Acteur=${actorCoachId || "sans coachId"}, cible=${coachId || "sans coachId"}.`
      );
    }

    const phoneNormalized = clientPhone(client);
    const questionnaire = questionnaireConfig(request.data?.questionnaireType);
    const requestedSendId = cleanString(request.data?.sendId);
    const sendRef = requestedSendId && /^[A-Za-z0-9_-]{8,80}$/.test(requestedSendId)
      ? db.collection("questionnaireSends").doc(requestedSendId)
      : db.collection("questionnaireSends").doc();
    const existingSendSnap = await sendRef.get();
    if (existingSendSnap.exists) {
      const existingSend = existingSendSnap.data() || {};
      if (cleanString(existingSend.coachId) !== coachId || cleanString(existingSend.clientId) !== clientId) {
        throw new HttpsError("permission-denied", "Cette tentative questionnaire ne correspond pas au client.");
      }
    }
    const baseAttempt = {
      coachId,
      clientId,
      clientName: cleanString(client.name),
      clientPhoneNormalized: phoneNormalized,
      coachName,
      status: "pending",
      deliveryStatus: "ghl_pending",
      questionnaireType: questionnaire.type,
      questionnaireLabel: questionnaire.label,
      ghlTag: questionnaire.ghlTag,
      questionnaireUrl: buildQuestionnaireUrl(phoneNormalized, client.name, client.email, coachName, questionnaire),
      requestedByUid: request.auth.uid,
      requestedByEmail: request.auth.token.email || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "firebase_function_send_questionnaire"
    };
    await sendRef.set(baseAttempt, { merge: true });

    if (!phoneNormalized) {
      const message = "Telephone manquant. L'envoi et le matching se font par telephone.";
      await markSend(sendRef, {
        status: "error",
        deliveryStatus: "missing_phone",
        errorMessage: message
      });
      return { ok: false, sendId: sendRef.id, status: "error", message };
    }

    const token = cleanString(safeSecretValue(ghlPrivateToken));
    if (!token) {
      const message = "GHL non configure: ajoute GHL_PRIVATE_TOKEN dans Firebase Functions.";
      await markSend(sendRef, {
        status: "error",
        deliveryStatus: "missing_ghl_config",
        errorMessage: message
      });
      return { ok: false, sendId: sendRef.id, status: "error", message };
    }

    try {
      const contact = await findGhlContactByPhone({ token, locationId: GHL_LOCATION_ID, phoneNormalized });
      if (!contact?.id) {
        const message = `Contact GHL introuvable pour le telephone ${phoneNormalized}.`;
        await markSend(sendRef, {
          status: "error",
          deliveryStatus: "contact_not_found",
          errorMessage: message
        });
        return { ok: false, sendId: sendRef.id, status: "error", message };
      }

      await addGhlTag({ token, contactId: contact.id, tag: questionnaire.ghlTag });
      await markSend(sendRef, {
        status: "sent",
        deliveryStatus: "tag_added",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        ghlContactId: contact.id,
        ghlContactName: cleanString(contact.contactName || contact.fullName || contact.name)
      });

      return {
        ok: true,
        sendId: sendRef.id,
        status: "sent",
        message: `Tag ${questionnaire.ghlTag} ajoute dans GHL. Le workflow devrait envoyer ${questionnaire.label}.`
      };
    } catch (error) {
      const message = humanizeGhlError(error);
      await markSend(sendRef, {
        status: "error",
        deliveryStatus: "ghl_error",
        errorMessage: message
      });
      return { ok: false, sendId: sendRef.id, status: "error", message };
    }
  }
);

exports.processQuestionnaireSendRequest = onDocumentCreated(
  {
    region: "us-central1",
    document: "questionnaireSends/{sendId}",
    secrets: [ghlPrivateToken],
    timeoutSeconds: 30
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const send = snap.data() || {};
    const source = cleanString(send.source);
    const status = cleanString(send.status);
    const deliveryStatus = cleanString(send.deliveryStatus);
    if (!["dashboard_questionnaire_send_click", "dashboard_questionnaire_scheduled"].includes(source)) return;
    if (status && status !== "pending" && status !== "queued") return;
    if (deliveryStatus && !["firestore_queue_pending", "firebase_function_pending"].includes(deliveryStatus)) return;

    await processQuestionnaireSendFromQueue({
      sendRef: snap.ref,
      sendId: event.params.sendId,
      send
    });
  }
);

async function processQuestionnaireSendFromQueue({ sendRef, send }) {
  const clientId = cleanString(send.clientId);
  const requestedByUid = cleanString(send.requestedByUid);
  if (!clientId) {
    await markSend(sendRef, {
      status: "error",
      deliveryStatus: "invalid_request",
      errorMessage: "Client manquant pour l'envoi questionnaire."
    });
    return;
  }

  await markSend(sendRef, {
    status: "pending",
    deliveryStatus: "backend_processing",
    processedBy: "processQuestionnaireSendRequest"
  });

  const [clientSnap, profileSnap] = await Promise.all([
    db.doc(`clients/${clientId}`).get(),
    requestedByUid ? db.doc(`users/${requestedByUid}`).get() : Promise.resolve(null)
  ]);

  if (!clientSnap.exists) {
    await markSend(sendRef, {
      status: "error",
      deliveryStatus: "client_not_found",
      errorMessage: "Client introuvable pour l'envoi questionnaire."
    });
    return;
  }

  const client = clientSnap.data() || {};
  const coachId = cleanString(client.coachId);
  const requestedCoachId = cleanString(send.coachId);
  if (requestedCoachId && requestedCoachId !== coachId) {
    await markSend(sendRef, {
      status: "error",
      deliveryStatus: "coach_mismatch",
      errorMessage: "Cette tentative questionnaire ne correspond pas au client."
    });
    return;
  }

  if (!profileSnap?.exists || profileSnap.get("active") !== true) {
    await markSend(sendRef, {
      status: "error",
      deliveryStatus: "requester_not_active",
      errorMessage: "Utilisateur demandeur non actif pour l'envoi questionnaire."
    });
    return;
  }

  const profile = profileSnap.data() || {};
  if (!canPilotProfileActOnCoach(profile, coachId)) {
    await recordAccessIssue({
      source: "processQuestionnaireSendRequest",
      uid: cleanString(send.requestedByUid),
      email: cleanString(send.requestedByEmail),
      actorCoachId: cleanString(profile.coachId),
      targetCoachId: coachId,
      clientId,
      sendId: sendRef.id,
      reason: accessIssueMessage(profile, coachId)
    });
    await markSend(sendRef, {
      status: "error",
      deliveryStatus: "requester_wrong_coach",
      errorMessage: accessIssueMessage(profile, coachId)
    });
    return;
  }

  const coachSnap = coachId ? await db.doc(`coaches/${coachId}`).get() : null;
  const pilotCoach = PILOT_COACHES.find((coach) => coach.id === coachId || coach.coachRxId === coachId);
  const coachName = cleanString(client.coachName || coachSnap?.data()?.name || pilotCoach?.name || "");
  const phoneNormalized = clientPhone(client) || normalizePhone(send.clientPhoneNormalized);
  const questionnaire = questionnaireConfig(send.questionnaireType);

  await sendRef.set({
    coachId,
    clientId,
    clientName: cleanString(client.name || send.clientName),
    clientPhoneNormalized: phoneNormalized,
    coachName,
    status: "pending",
    deliveryStatus: "ghl_pending",
    questionnaireType: questionnaire.type,
    questionnaireLabel: questionnaire.label,
    ghlTag: questionnaire.ghlTag,
    questionnaireUrl: buildQuestionnaireUrl(phoneNormalized, client.name, client.email, coachName, questionnaire),
    processedBy: "processQuestionnaireSendRequest",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  if (!phoneNormalized) {
    const message = "Telephone manquant. L'envoi et le matching se font par telephone.";
    await markSend(sendRef, {
      status: "error",
      deliveryStatus: "missing_phone",
      errorMessage: message
    });
    return;
  }

  const token = cleanString(safeSecretValue(ghlPrivateToken));
  if (!token) {
    const message = "GHL non configure: ajoute GHL_PRIVATE_TOKEN dans Firebase Functions.";
    await markSend(sendRef, {
      status: "error",
      deliveryStatus: "missing_ghl_config",
      errorMessage: message
    });
    return;
  }

  try {
    const contact = await findGhlContactByPhone({ token, locationId: GHL_LOCATION_ID, phoneNormalized });
    if (!contact?.id) {
      const message = `Contact GHL introuvable pour le telephone ${phoneNormalized}.`;
      await markSend(sendRef, {
        status: "error",
        deliveryStatus: "contact_not_found",
        errorMessage: message
      });
      return;
    }

    await addGhlTag({ token, contactId: contact.id, tag: questionnaire.ghlTag });
    await markSend(sendRef, {
      status: "sent",
      deliveryStatus: "tag_added",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      ghlContactId: contact.id,
      ghlContactName: cleanString(contact.contactName || contact.fullName || contact.name)
    });
  } catch (error) {
    await markSend(sendRef, {
      status: "error",
      deliveryStatus: "ghl_error",
      errorMessage: humanizeGhlError(error)
    });
  }
}

exports.syncDashboardFromSheets = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [ghlPrivateToken],
    timeoutSeconds: 120,
    memory: "512MiB"
  },
  async (request) => {
    await requireAdminProfile(request);
    return runDashboardSheetsSync({
      requestedCoachId: cleanString(request.data?.coachId),
      request,
      source: "firebase_function_sync_sheets_manual"
    });
  }
);

exports.scheduledDashboardSync = onSchedule(
  {
    region: "us-central1",
    secrets: [ghlPrivateToken],
    schedule: "every 6 hours",
    timeZone: "America/Toronto",
    timeoutSeconds: 300,
    memory: "1GiB"
  },
  async (event) => {
    await runDashboardSheetsSync({
      request: null,
      source: "firebase_function_sync_sheets_scheduled",
      triggeredByEventId: event?.id || ""
    });
  }
);

exports.scheduledQuestionnaireResponseSync = onSchedule(
  {
    region: "us-central1",
    secrets: [ghlPrivateToken],
    schedule: "every 15 minutes",
    timeZone: "America/Toronto",
    timeoutSeconds: 300,
    memory: "1GiB"
  },
  async (event) => {
    await runDashboardSheetsSync({
      request: null,
      source: "firebase_function_questionnaire_response_sync_scheduled",
      triggeredByEventId: event?.id || ""
    });
  }
);

exports.scheduledQuestionnaireSendPlans = onSchedule(
  {
    region: "us-central1",
    schedule: "every day 07:15",
    timeZone: "America/Toronto",
    timeoutSeconds: 120,
    memory: "512MiB"
  },
  async (event) => {
    const today = todayIsoDate();
    const snap = await db.collection("questionnaireSchedules")
      .where("status", "==", "active")
      .where("nextSendAt", "<=", today)
      .limit(100)
      .get();
    let queued = 0;
    let skipped = 0;
    const batch = db.batch();

    for (const docSnap of snap.docs) {
      const schedule = docSnap.data() || {};
      const clientId = cleanString(schedule.clientId);
      const coachId = cleanString(schedule.coachId);
      if (!clientId || !coachId) {
        skipped += 1;
        batch.set(docSnap.ref, {
          lastError: "Client ou coach manquant pour la planification.",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        continue;
      }

      const sendRef = db.collection("questionnaireSends").doc(`scheduled_${docSnap.id}_${today}`);
      const sendSnap = await sendRef.get();
      if (sendSnap.exists) {
        const nextSendAt = nextQuestionnaireScheduleDate(schedule.frequency, today);
        skipped += 1;
        batch.set(docSnap.ref, {
          nextSendAt,
          status: schedule.frequency === "once" ? "paused" : "active",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        continue;
      }

      const nextSendAt = nextQuestionnaireScheduleDate(schedule.frequency, today);
      const nextStatus = schedule.frequency === "once" ? "paused" : "active";
      const questionnaire = questionnaireConfig(schedule.questionnaireType);
      batch.set(sendRef, {
        coachId,
        coachRxId: cleanString(schedule.coachRxId),
        coachName: cleanString(schedule.coachName),
        clientId,
        clientName: cleanString(schedule.clientName),
        clientPhoneNormalized: normalizePhone(schedule.clientPhoneNormalized),
        status: "pending",
        deliveryStatus: "firestore_queue_pending",
        errorMessage: "",
        questionnaireType: questionnaire.type,
        questionnaireLabel: questionnaire.label,
        ghlTag: questionnaire.ghlTag,
        questionnaireUrl: buildQuestionnaireUrl(
          normalizePhone(schedule.clientPhoneNormalized),
          schedule.clientName,
          "",
          schedule.coachName,
          questionnaire
        ),
        requestedByUid: cleanString(schedule.requestedByUid),
        requestedByEmail: cleanString(schedule.requestedByEmail),
        questionnaireScheduleId: docSnap.id,
        scheduledFor: today,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "dashboard_questionnaire_scheduled"
      });
      batch.set(docSnap.ref, {
        lastQueuedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastQueuedSendId: sendRef.id,
        lastError: "",
        nextSendAt,
        status: nextStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        triggeredByEventId: event?.id || ""
      }, { merge: true });
      queued += 1;
    }

    if (!snap.empty) await batch.commit();
    await db.collection("syncRuns").doc(`questionnaire_schedules_${today}_${Date.now()}`).set({
      source: "firebase_function_questionnaire_schedules",
      status: "success",
      dueSchedules: snap.size,
      queued,
      skipped,
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      triggeredByEventId: event?.id || ""
    });
  }
);

exports.scheduledWeeklyProductReport = onSchedule(
  {
    region: "us-central1",
    schedule: "every thursday 09:00",
    timeZone: "America/Toronto",
    timeoutSeconds: 300,
    memory: "1GiB"
  },
  async (event) => {
    await generateProductOperationsReport({
      source: "firebase_function_product_report_scheduled",
      triggeredByEventId: event?.id || ""
    });
  }
);

exports.processProductReportRequest = onDocumentCreated(
  {
    region: "us-central1",
    document: "productReportRequests/{requestId}",
    timeoutSeconds: 300,
    memory: "1GiB"
  },
  async (event) => {
    const requestId = cleanString(event.params.requestId);
    const requestRef = db.collection("productReportRequests").doc(requestId);
    const payload = event.data?.data() || {};
    try {
      await requireAdminUid(payload.requestedByUid);
      await requestRef.set({
        status: "running",
        startedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      const result = await generateProductOperationsReport({
        source: "firebase_function_product_report_manual",
        triggeredByEventId: event?.id || "",
        requestedByUid: cleanString(payload.requestedByUid),
        requestedByEmail: cleanString(payload.requestedByEmail)
      });
      await requestRef.set({
        status: "success",
        reportId: result.reportId,
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: ""
      }, { merge: true });
    } catch (error) {
      await requestRef.set({
        status: "error",
        errorMessage: cleanString(error?.message || error).slice(0, 500),
        finishedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.error("product_report_request_failed", requestId, error);
    }
  }
);

exports.processAssistantVoiceRequest = onDocumentCreated(
  {
    region: "us-central1",
    document: "assistantVoiceRequests/{requestId}",
    timeoutSeconds: 180,
    memory: "1GiB",
    maxInstances: 2
  },
  async (event) => {
    const requestId = cleanString(event.params.requestId);
    const requestRef = db.collection("assistantVoiceRequests").doc(requestId);
    const payload = event.data?.data() || {};
    const userId = cleanString(payload.userId);
    const requestedEmail = cleanString(payload.userEmail).toLowerCase();
    const targetCoachId = cleanString(payload.targetCoachId);
    const chunkCount = Number(payload.chunkCount || 0);
    let chunkDocs = [];
    let claimed = false;
    try {
      claimed = await db.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(requestRef);
        if (!currentSnap.exists || cleanString(currentSnap.get("status")) !== "queued") return false;
        transaction.set(requestRef, {
          status: "transcribing",
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
      });
      if (!claimed) return;

      await requireAssistantAdminPilot(userId, requestedEmail);
      await enforceAssistantVoiceRateLimit(userId, requestId);
      if (
        cleanString(payload.actorCoachId) !== "admin"
        || cleanString(payload.requestKind) !== "task_create"
        || !isPilotCoachId(targetCoachId)
        || !["global", "client"].includes(cleanString(payload.contextType))
        || cleanString(payload.source) !== "assistant_admin_voice_pilot"
        || !Number.isInteger(chunkCount)
        || chunkCount < 1
        || chunkCount > 40
      ) {
        throw new Error("assistant_voice_request_invalid");
      }
      const contextEntityId = cleanString(payload.contextEntityId);
      if (
        (cleanString(payload.contextType) === "global" && contextEntityId)
        || (cleanString(payload.contextType) === "client" && !contextEntityId)
      ) {
        throw new Error("assistant_voice_context_invalid");
      }
      const durationSeconds = Math.round(Number(payload.durationSeconds || 0));
      if (durationSeconds < 1 || durationSeconds > VOICE_NOTE_MAX_SECONDS) {
        throw new Error("assistant_voice_duration_invalid");
      }
      const mimeType = voiceMissionMimeType(payload.mimeType);
      const chunksSnap = await db.collection("assistantVoiceChunks")
        .where("requestId", "==", requestId)
        .get();
      chunkDocs = chunksSnap.docs;
      if (chunkDocs.length !== chunkCount) {
        throw new Error("assistant_voice_chunks_incomplete");
      }
      const chunks = chunkDocs
        .map((snapshot) => snapshot.data() || {})
        .sort((left, right) => Number(left.index) - Number(right.index));
      chunks.forEach((chunk, index) => {
        if (
          cleanString(chunk.requestId) !== requestId
          || cleanString(chunk.targetCoachId) !== targetCoachId
          || cleanString(chunk.userId) !== userId
          || Number(chunk.total) !== chunkCount
          || Number(chunk.index) !== index
          || typeof chunk.data !== "string"
        ) {
          throw new Error("assistant_voice_chunk_invalid");
        }
      });
      const audioBase64 = chunks.map((chunk) => chunk.data).join("");
      if (Number(payload.audioBase64Length || 0) !== audioBase64.length) {
        throw new Error("assistant_voice_length_mismatch");
      }
      voiceMissionAudioBuffer(audioBase64);

      const transcription = await transcribeAssistantVoice({ audioBase64, mimeType });
      if (transcription.needsRetry || transcription.transcript.length < 3) {
        throw new Error("assistant_voice_retry_required");
      }

      const assistantRequestRef = db.collection("assistantRequests").doc(requestId);
      const batch = db.batch();
      batch.set(assistantRequestRef, {
        userId,
        userEmail: ASSISTANT_ADMIN_EMAIL,
        actorCoachId: "admin",
        targetCoachId,
        requestKind: "task_create",
        contextType: cleanString(payload.contextType),
        contextEntityId,
        inputMode: "voice",
        inputText: transcription.transcript,
        status: "queued",
        source: "assistant_admin_voice_pilot",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      batch.set(requestRef, {
        status: "transcribed",
        assistantRequestId: requestId,
        transcriptCharacters: transcription.transcript.length,
        language: transcription.language,
        modelName: transcription.model,
        promptVersion: transcription.promptVersion,
        latencyMs: transcription.latencyMs,
        usage: transcription.usage,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorCode: "",
        errorMessage: ""
      }, { merge: true });
      batch.set(db.collection("actionLogs").doc(`assistant_voice_${requestId}`), {
        action: "assistant.voice_transcribed",
        entityType: "assistantVoiceRequest",
        entityId: requestId,
        coachId: targetCoachId,
        userId,
        userEmail: ASSISTANT_ADMIN_EMAIL,
        details: {
          durationSeconds,
          transcriptCharacters: transcription.transcript.length,
          promptVersion: transcription.promptVersion,
          modelName: transcription.model,
          latencyMs: transcription.latencyMs,
          totalTokens: transcription.usage.totalTokens,
          audioDeletedAfterProcessing: true
        },
        source: "assistant_admin_voice_pilot",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      await batch.commit();
    } catch (error) {
      const code = cleanString(error?.message || error);
      const retryMessage = code === "assistant_voice_retry_required"
        ? "Le vocal est vide ou difficile a comprendre. Reenregistre-le ou utilise le texte."
        : "Le vocal n'a pas pu etre transcrit. Aucune mission n'a ete creee.";
      await requestRef.set({
        status: "error",
        errorCode: code.startsWith("assistant_voice_") ? code : "assistant_voice_unavailable",
        errorMessage: retryMessage,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.error("assistant_voice_request_failed", requestId, code);
    } finally {
      if (!chunkDocs.length && requestId) {
        try {
          const cleanupSnap = await db.collection("assistantVoiceChunks")
            .where("requestId", "==", requestId)
            .get();
          chunkDocs = cleanupSnap.docs;
        } catch (cleanupError) {
          console.warn("assistant_voice_cleanup_lookup_failed", requestId, cleanupError?.message || cleanupError);
        }
      }
      await deleteVoiceMissionChunkDocs(chunkDocs);
    }
  }
);

exports.processAssistantRequest = onDocumentCreated(
  {
    region: "us-central1",
    document: "assistantRequests/{requestId}",
    timeoutSeconds: 120,
    memory: "1GiB",
    maxInstances: 3
  },
  async (event) => {
    const requestId = cleanString(event.params.requestId);
    const requestRef = db.collection("assistantRequests").doc(requestId);
    const payload = event.data?.data() || {};
    let claimed = false;
    try {
      claimed = await db.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(requestRef);
        if (!currentSnap.exists || cleanString(currentSnap.get("status")) !== "queued") return false;
        transaction.set(requestRef, {
          status: "processing",
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
      });
      if (!claimed) return;

      const userId = cleanString(payload.userId);
      const requestedEmail = cleanString(payload.userEmail).toLowerCase();
      const targetCoachId = cleanString(payload.targetCoachId);
      const requestKind = cleanString(payload.requestKind || "general");
      const inputText = String(payload.inputText || "").trim();
      await requireAssistantAdminPilot(userId, requestedEmail);
      validateAssistantReadOnlyRequest({ payload, targetCoachId, inputText });
      await enforceAssistantRequestRateLimit(userId, requestId);

      const coach = PILOT_COACHES.find((item) => item.id === targetCoachId || item.coachRxId === targetCoachId);
      if (!coach) throw new Error("assistant_target_coach_invalid");
      const [tasks, clients, questionnaireResponses, rebookings, performanceSnap] = await Promise.all([
        loadExistingRecordsByCoach("tasks", coach),
        loadExistingRecordsByCoach("clients", coach),
        loadExistingRecordsByCoach("questionnaireResponses", coach),
        loadExistingRecordsByCoach("rebookings", coach),
        db.collection("performanceSettings").doc(coach.id).get()
      ]);
      const context = buildReadOnlyAssistantContext({
        coach,
        tasks,
        clients,
        questionnaireResponses,
        rebookings,
        performanceSettings: performanceSnap.exists ? performanceSnap.data() : {}
      });
      const contextType = cleanString(payload.contextType || "global");
      const contextEntityId = cleanString(payload.contextEntityId);
      if (contextType === "client") {
        const selectedClient = context.clients.find((item) => item.id === contextEntityId);
        if (!selectedClient) throw new Error("assistant_context_client_invalid");
        context.requestScope = { type: "client", ref: selectedClient.ref, label: selectedClient.name };
      } else {
        context.requestScope = { type: "global", ref: context.targetCoach.ref, label: context.targetCoach.name };
      }
      const generated = await generateReadOnlyAssistantProposal({ question: inputText, context, requestKind });
      const actionParameters = requestKind === "task_create"
        ? resolveTaskCreateProposal(generated.output, context, assistantTodayIso())
        : null;
      if (generated.output.intent === "propose_action" && !actionParameters) {
        throw new Error("assistant_action_proposal_invalid");
      }
      if (generated.output.intent === "propose_action" && requestKind !== "task_create") {
        throw new Error("assistant_action_not_requested");
      }
      const evidenceCandidates = [
        ...generated.output.evidenceRefs,
        actionParameters?.clientId ? `client:${actionParameters.clientId}` : ""
      ].filter(Boolean);
      const evidenceRefs = verifiedEvidenceRefs(evidenceCandidates, context);
      const proposalId = `proposal_${requestId}`;
      const proposalStatus = generated.output.intent === "propose_action"
        ? "proposed"
        : generated.output.intent === "clarify"
        ? "clarification"
        : generated.output.intent === "refuse"
          ? "refused"
          : "answered";
      const isActionProposal = proposalStatus === "proposed";
      const batch = db.batch();
      batch.set(db.collection("assistantProposals").doc(proposalId), {
        requestId,
        userId,
        userEmail: ASSISTANT_ADMIN_EMAIL,
        actorCoachId: "admin",
        targetCoachId: coach.id,
        targetCoachName: coach.name,
        intent: generated.output.intent,
        title: generated.output.title,
        displaySummary: generated.output.displaySummary,
        clarifyingQuestion: generated.output.clarifyingQuestion,
        evidenceRefs,
        suggestedPrompts: generated.output.suggestedPrompts,
        riskLevel: isActionProposal ? "R1" : "R0",
        confirmationRequired: isActionProposal,
        actionType: isActionProposal ? "task.create" : "",
        actionParameters: actionParameters || {},
        modelName: generated.model,
        modelVersion: generated.modelVersion,
        promptVersion: generated.promptVersion,
        status: proposalStatus,
        latencyMs: generated.latencyMs,
        usage: generated.usage,
        contextCounts: context.summary,
        source: isActionProposal ? "assistant_admin_task_confirmation_pilot" : "assistant_admin_readonly_pilot",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + (isActionProposal ? ASSISTANT_ACTION_PROPOSAL_TTL_MS : ASSISTANT_HISTORY_TTL_MS))
      }, { merge: true });
      batch.set(requestRef, {
        status: proposalStatus,
        proposalId,
        intent: generated.output.intent,
        modelName: generated.model,
        promptVersion: generated.promptVersion,
        contextCounts: context.summary,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorCode: "",
        errorMessage: ""
      }, { merge: true });
      batch.set(db.collection("actionLogs").doc(`assistant_${requestId}`), {
        action: isActionProposal ? "assistant.task_proposed" : "assistant.readonly_processed",
        entityType: "assistantRequest",
        entityId: requestId,
        coachId: coach.id,
        userId,
        userEmail: ASSISTANT_ADMIN_EMAIL,
        details: {
          intent: generated.output.intent,
          promptVersion: generated.promptVersion,
          modelName: generated.model,
          latencyMs: generated.latencyMs,
          inputCharacters: inputText.length,
          evidenceCount: evidenceRefs.length,
          totalTokens: generated.usage.totalTokens
        },
        source: isActionProposal ? "assistant_admin_task_confirmation_pilot" : "assistant_admin_readonly_pilot",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      await batch.commit();
    } catch (error) {
      const publicError = assistantPublicError(error);
      await requestRef.set({
        status: "error",
        errorCode: publicError.code,
        errorMessage: publicError.message,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.error("assistant_request_failed", requestId, cleanString(error?.message || error));
    }
  }
);

async function requireAssistantAdminPilot(uid, requestedEmail = "") {
  const cleanUid = cleanString(uid);
  if (!cleanUid) throw new Error("assistant_user_missing");
  const [profileSnap, authUser] = await Promise.all([
    db.doc(`users/${cleanUid}`).get(),
    admin.auth().getUser(cleanUid)
  ]);
  const authEmail = cleanString(authUser.email).toLowerCase();
  const profile = profileSnap.exists ? profileSnap.data() || {} : {};
  if (
    !profileSnap.exists
    || profile.active !== true
    || profile.role !== "admin"
    || authEmail !== ASSISTANT_ADMIN_EMAIL
    || requestedEmail !== ASSISTANT_ADMIN_EMAIL
  ) {
    throw new Error("assistant_admin_pilot_required");
  }
  return profile;
}

function validateAssistantReadOnlyRequest({ payload = {}, targetCoachId = "", inputText = "" } = {}) {
  const allowedKeys = new Set([
    "userId",
    "userEmail",
    "actorCoachId",
    "targetCoachId",
    "requestKind",
    "contextType",
    "contextEntityId",
    "inputMode",
    "inputText",
    "status",
    "source",
    "createdAt",
    "updatedAt"
  ]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) throw new Error("assistant_request_fields_invalid");
  if (cleanString(payload.actorCoachId) !== "admin") throw new Error("assistant_actor_invalid");
  if (!isPilotCoachId(targetCoachId)) throw new Error("assistant_target_coach_invalid");
  const requestKind = cleanString(payload.requestKind || "general");
  if (!["general", "task_create"].includes(requestKind)) throw new Error("assistant_request_kind_invalid");
  const contextType = cleanString(payload.contextType);
  const contextEntityId = cleanString(payload.contextEntityId);
  if (!["global", "client"].includes(contextType)) throw new Error("assistant_context_invalid");
  if (contextType === "global" && contextEntityId) throw new Error("assistant_context_entity_not_allowed");
  if (contextType === "client" && !contextEntityId) throw new Error("assistant_context_client_missing");
  if (requestKind === "general" && contextType !== "global") throw new Error("assistant_general_context_invalid");
  const inputMode = cleanString(payload.inputMode);
  if (!["text", "voice"].includes(inputMode)) throw new Error("assistant_input_mode_invalid");
  if (cleanString(payload.status) !== "queued") throw new Error("assistant_status_invalid");
  const expectedSource = inputMode === "voice"
    ? "assistant_admin_voice_pilot"
    : "assistant_admin_private_pilot";
  if (cleanString(payload.source) !== expectedSource) throw new Error("assistant_source_invalid");
  if (inputText.length < 3 || inputText.length > ASSISTANT_REQUEST_MAX_CHARS) {
    throw new Error("assistant_input_length_invalid");
  }
}

async function enforceAssistantRequestRateLimit(userId, currentRequestId) {
  const snap = await db.collection("assistantRequests").where("userId", "==", userId).limit(40).get();
  const cutoff = Date.now() - ASSISTANT_REQUEST_RATE_WINDOW_MS;
  const recent = snap.docs.filter((docSnap) => {
    if (docSnap.id === currentRequestId) return false;
    const value = docSnap.get("createdAt");
    const timestamp = typeof value?.toMillis === "function" ? value.toMillis() : Date.parse(value || "");
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
  if (recent.length >= ASSISTANT_REQUEST_RATE_LIMIT) throw new Error("assistant_rate_limit");
}

async function enforceAssistantVoiceRateLimit(userId, currentRequestId) {
  const snap = await db.collection("assistantVoiceRequests").where("userId", "==", userId).limit(40).get();
  const cutoff = Date.now() - ASSISTANT_REQUEST_RATE_WINDOW_MS;
  const recent = snap.docs.filter((docSnap) => {
    if (docSnap.id === currentRequestId) return false;
    const value = docSnap.get("createdAt");
    const timestamp = typeof value?.toMillis === "function" ? value.toMillis() : Date.parse(value || "");
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
  if (recent.length >= ASSISTANT_REQUEST_RATE_LIMIT) throw new Error("assistant_rate_limit");
}

function assistantPublicError(error) {
  const code = cleanString(error?.message || error);
  if (code === "assistant_rate_limit") {
    return { code, message: "Trop de demandes rapprochees. Attends quelques minutes avant de reessayer." };
  }
  if (code.includes("permission") || code.includes("admin_pilot") || code.includes("user_missing")) {
    return { code: "assistant_access_denied", message: "Cet assistant est reserve au laboratoire admin prive." };
  }
  if (code.includes("input_") || code.includes("request_") || code.includes("context_") || code.includes("target_")) {
    return { code: "assistant_request_invalid", message: "La demande ne respecte pas le format du pilote prive." };
  }
  return { code: "assistant_temporarily_unavailable", message: "L'assistant est temporairement indisponible. Aucune donnee operationnelle n'a ete modifiee." };
}

exports.processAssistantActionRequest = onDocumentCreated(
  {
    region: "us-central1",
    document: "assistantActionRequests/{actionRequestId}",
    timeoutSeconds: 60,
    memory: "512MiB",
    maxInstances: 3
  },
  async (event) => {
    const actionRequestId = cleanString(event.params.actionRequestId);
    const actionRequestRef = db.collection("assistantActionRequests").doc(actionRequestId);
    const payload = event.data?.data() || {};
    let claimed = false;
    try {
      claimed = await db.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(actionRequestRef);
        if (!currentSnap.exists || cleanString(currentSnap.get("status")) !== "queued") return false;
        transaction.set(actionRequestRef, {
          status: "processing",
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
      });
      if (!claimed) return;

      const userId = cleanString(payload.userId);
      const requestedEmail = cleanString(payload.userEmail).toLowerCase();
      await requireAssistantAdminPilot(userId, requestedEmail);
      validateAssistantActionRequest(payload);

      const proposalId = cleanString(payload.proposalId);
      const proposalRef = db.collection("assistantProposals").doc(proposalId);
      const proposalSnap = await proposalRef.get();
      if (!proposalSnap.exists) throw new Error("assistant_proposal_missing");
      const proposal = proposalSnap.data() || {};
      if (
        cleanString(proposal.userId) !== userId
        || cleanString(proposal.targetCoachId) !== cleanString(payload.targetCoachId)
        || proposal.confirmationRequired !== true
        || cleanString(proposal.actionType) !== "task.create"
        || !["proposed", "executed"].includes(cleanString(proposal.status))
      ) {
        throw new Error("assistant_proposal_mismatch");
      }
      const expiresAtMs = typeof proposal.expiresAt?.toMillis === "function" ? proposal.expiresAt.toMillis() : 0;
      if (!expiresAtMs || expiresAtMs < Date.now()) throw new Error("assistant_proposal_expired");

      const targetCoachId = cleanString(payload.targetCoachId);
      const coach = PILOT_COACHES.find((item) => item.id === targetCoachId || item.coachRxId === targetCoachId);
      if (!coach) throw new Error("assistant_target_coach_invalid");
      const confirmed = sanitizeAssistantTaskParameters(payload.confirmedParameters);
      let clientName = "";
      if (confirmed.clientId) {
        const clients = await loadExistingRecordsByCoach("clients", coach);
        const clientRecord = clients.find((item) => item.id === confirmed.clientId);
        if (!clientRecord) throw new Error("assistant_task_client_not_in_coach");
        clientName = cleanString(clientRecord.data?.name || clientRecord.data?.clientName).slice(0, 180);
      }

      const taskId = assistantTaskId(proposalId);
      const taskRef = db.collection("tasks").doc(taskId);
      const actionLogRef = db.collection("actionLogs").doc(`assistant_action_${proposalId}`);
      await db.runTransaction(async (transaction) => {
        const [currentProposalSnap, taskSnap] = await Promise.all([
          transaction.get(proposalRef),
          transaction.get(taskRef)
        ]);
        if (!currentProposalSnap.exists) throw new Error("assistant_proposal_missing");
        const currentProposal = currentProposalSnap.data() || {};
        if (!["proposed", "executed"].includes(cleanString(currentProposal.status))) {
          throw new Error("assistant_proposal_not_executable");
        }
        if (!taskSnap.exists) {
          transaction.create(taskRef, {
            coachId: coach.id,
            coachRxId: coach.coachRxId,
            coachName: coach.name,
            clientId: confirmed.clientId,
            clientName,
            type: "manual",
            title: confirmed.title,
            description: confirmed.description,
            status: "open",
            priority: confirmed.priority,
            priorityRank: priorityRank(confirmed.priority),
            dueAt: confirmed.dueAt,
            starred: confirmed.starred,
            starredAt: confirmed.starred ? admin.firestore.FieldValue.serverTimestamp() : null,
            voiceNote: null,
            voiceNoteStatus: "none",
            voiceNoteError: null,
            source: "assistant_admin_confirmed",
            assistantProposalId: proposalId,
            assistantActionRequestId: actionRequestId,
            createdByUid: userId,
            createdByEmail: ASSISTANT_ADMIN_EMAIL,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        transaction.set(proposalRef, {
          status: "executed",
          executedTaskId: taskId,
          executedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        transaction.set(actionRequestRef, {
          status: "success",
          resultEntityType: "task",
          resultEntityId: taskId,
          duplicatePrevented: taskSnap.exists,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          errorCode: "",
          errorMessage: ""
        }, { merge: true });
        transaction.set(actionLogRef, {
          action: "assistant.task_created",
          entityType: "task",
          entityId: taskId,
          coachId: coach.id,
          userId,
          userEmail: ASSISTANT_ADMIN_EMAIL,
          details: {
            proposalId,
            actionRequestId,
            clientLinked: Boolean(confirmed.clientId),
            priority: confirmed.priority,
            dueAt: confirmed.dueAt,
            starred: confirmed.starred,
            duplicatePrevented: taskSnap.exists
          },
          source: "assistant_admin_task_confirmation_pilot",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
    } catch (error) {
      const publicError = assistantActionPublicError(error);
      await actionRequestRef.set({
        status: "error",
        errorCode: publicError.code,
        errorMessage: publicError.message,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.error("assistant_action_request_failed", actionRequestId, cleanString(error?.message || error));
    }
  }
);

function validateAssistantActionRequest(payload = {}) {
  const allowedKeys = new Set([
    "userId",
    "userEmail",
    "proposalId",
    "targetCoachId",
    "actionType",
    "confirmedParameters",
    "status",
    "source",
    "createdAt",
    "updatedAt"
  ]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) throw new Error("assistant_action_fields_invalid");
  if (!cleanString(payload.proposalId)) throw new Error("assistant_proposal_missing");
  if (!isPilotCoachId(payload.targetCoachId)) throw new Error("assistant_target_coach_invalid");
  if (cleanString(payload.actionType) !== "task.create") throw new Error("assistant_action_type_invalid");
  if (cleanString(payload.status) !== "queued") throw new Error("assistant_action_status_invalid");
  if (cleanString(payload.source) !== "assistant_admin_task_confirmation_pilot") throw new Error("assistant_action_source_invalid");
}

function sanitizeAssistantTaskParameters(raw = {}) {
  const value = raw && typeof raw === "object" ? raw : {};
  const title = cleanString(value.title).slice(0, 180);
  const description = cleanString(value.description).slice(0, 1200);
  const priority = ["P1", "P2", "P3"].includes(cleanString(value.priority)) ? cleanString(value.priority) : "P2";
  const dueAt = cleanString(value.dueAt).slice(0, 10);
  const clientId = cleanString(value.clientId).slice(0, 180);
  if (!title) throw new Error("assistant_task_title_missing");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) throw new Error("assistant_task_due_date_invalid");
  return {
    clientId,
    title,
    description,
    priority,
    dueAt,
    starred: value.starred === true
  };
}

function assistantTaskId(proposalId) {
  const hash = crypto.createHash("sha256").update(cleanString(proposalId)).digest("hex").slice(0, 24);
  return `assistant_task_${hash}`;
}

function assistantTodayIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function assistantActionPublicError(error) {
  const code = cleanString(error?.message || error);
  if (code.includes("expired")) {
    return { code: "assistant_proposal_expired", message: "Cette proposition a expire. Demande un nouveau brouillon avant de confirmer." };
  }
  if (code.includes("client")) {
    return { code: "assistant_task_client_invalid", message: "Le client confirme n'appartient plus au portefeuille selectionne. Aucune mission n'a ete creee." };
  }
  if (code.includes("permission") || code.includes("admin_pilot") || code.includes("user_missing")) {
    return { code: "assistant_access_denied", message: "Cette action est reservee au laboratoire admin prive." };
  }
  if (code.includes("task_") || code.includes("action_") || code.includes("proposal_")) {
    return { code: "assistant_action_invalid", message: "La confirmation ne respecte pas le contrat securise. Aucune mission n'a ete creee." };
  }
  return { code: "assistant_action_unavailable", message: "La mission n'a pas pu etre creee. Aucune autre donnee operationnelle n'a ete modifiee." };
}

async function generateProductOperationsReport({
  source = "firebase_function_product_report",
  triggeredByEventId = "",
  requestedByUid = "",
  requestedByEmail = ""
} = {}) {
  const now = new Date();
  const [
    usageSnap,
    actionSnap,
    taskSnap,
    rebookingSnap,
    responseSnap,
    sendSnap,
    syncStatusSnap,
    syncRunSnap
  ] = await Promise.all([
    db.collection("usageEvents").orderBy("createdAt", "desc").limit(5000).get(),
    db.collection("actionLogs").orderBy("createdAt", "desc").limit(5000).get(),
    db.collection("tasks").get(),
    db.collection("rebookings").get(),
    db.collection("questionnaireResponses").get(),
    db.collection("questionnaireSends").get(),
    db.collection("coachSyncStatus").get(),
    db.collection("syncRuns").orderBy("createdAt", "desc").limit(100).get()
  ]);
  const report = buildWeeklyProductReport({
    now,
    periodDays: 7,
    automationWindowDays: 28,
    pilotCoaches: PILOT_COACHES,
    usageEvents: productReportDocs(usageSnap),
    actionLogs: productReportDocs(actionSnap),
    tasks: productReportDocs(taskSnap),
    rebookings: productReportDocs(rebookingSnap),
    questionnaireResponses: productReportDocs(responseSnap),
    questionnaireSends: productReportDocs(sendSnap),
    coachSyncStatuses: productReportDocs(syncStatusSnap),
    syncRuns: productReportDocs(syncRunSnap)
  });
  const reportDate = torontoDateKey(now);
  const reportId = `weekly_${reportDate}`;
  await db.collection("weeklyProductReports").doc(reportId).set({
    ...report,
    reportId,
    reportDate,
    source,
    triggeredByEventId: cleanString(triggeredByEventId),
    requestedByUid: cleanString(requestedByUid),
    requestedByEmail: cleanString(requestedByEmail),
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    retentionPolicy: "52_weeks"
  }, { merge: true });
  return { reportId, report };
}

function productReportDocs(snapshot) {
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
}

function torontoDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

exports.processSyncRequest = onDocumentCreated(
  {
    region: "us-central1",
    document: "syncRequests/{requestId}",
    secrets: [ghlPrivateToken],
    timeoutSeconds: 300,
    memory: "1GiB"
  },
  async (event) => {
    const requestId = event.params.requestId;
    const requestRef = db.collection("syncRequests").doc(requestId);
    const payload = event.data?.data() || {};
    const requestedByUid = cleanString(payload.requestedByUid);
    const requestedByEmail = cleanString(payload.requestedByEmail);
    const requestedCoachId = cleanString(payload.coachId);
    const scope = cleanString(payload.scope || (requestedCoachId ? "coach" : "all"));
    const requestType = normalizeSyncRequestType(payload.requestType || payload.type || payload.kind);

    if (requestType === "source_import") {
      await processQueuedSourceImportRequest({ requestId, requestRef, payload });
      return;
    }

    if (!requestedByUid) {
      await requestRef.set({
        status: "error",
        errorMessage: "UID admin manquant dans la demande de synchronisation.",
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return;
    }

    try {
      const profile = await requireAdminUid(requestedByUid);
      await requestRef.set({
        status: "running",
        stage: "sync_dashboard_from_sheets",
        requestedByEmail: requestedByEmail || cleanString(profile.email),
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const result = await runDashboardSheetsSync({
        requestedCoachId,
        request: {
          auth: {
            uid: requestedByUid,
            token: { email: requestedByEmail || cleanString(profile.email) }
          }
        },
        source: scope === "all"
          ? "firebase_firestore_sync_request_all"
          : "firebase_firestore_sync_request_coach",
        triggeredByEventId: requestId
      });

      await requestRef.set({
        status: "done",
        stage: "completed",
        resultSummary: summarizeSyncResult(result),
        resultCoachIds: result.coachIds || [],
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      const message = cleanString(error?.message || error || "Erreur inconnue pendant la demande de synchronisation.");
      console.error("Sync request failed", {
        requestId,
        requestedCoachId,
        requestedByUid,
        scope,
        message,
        stack: error?.stack || ""
      });
      await requestRef.set({
        status: "error",
        stage: "failed",
        errorMessage: message.slice(0, 900),
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  }
);

function normalizeSyncRequestType(value) {
  const normalized = keyOf(value);
  if (["sourceimport", "source_import", "sourcepayload", "directimport"].includes(normalized)) {
    return "source_import";
  }
  if (["sheetssync", "syncsheets", "sheetssynchronization", "dashboard_sync"].includes(normalized)) {
    return "sheets_sync";
  }
  return normalized || "sheets_sync";
}

async function processQueuedSourceImportRequest({ requestId, requestRef, payload }) {
  const sourceType = normalizeImportSourceType(payload.sourceType || payload.source || payload.importSource);
  const records = normalizeImportRecords(payload.records || payload.rows || payload.data || []);
  const requestedBy = cleanString(
    payload.requestedBy
      || payload.requestedByEmail
      || payload.sourceActorEmail
      || payload.operator
      || "apps_script_firestore_queue"
  );
  const runRef = db.collection("sourceImportRuns").doc();
  const startedAt = admin.firestore.Timestamp.now();

  await requestRef.set({
    status: "running",
    stage: "source_import",
    sourceType,
    sourceImportRunId: runRef.id,
    recordsReceived: records.length,
    startedAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await runRef.set({
    sourceType,
    requestedBy,
    status: "running",
    recordsReceived: records.length,
    createdAt: startedAt,
    startedAt,
    importMode: "firestore_sync_request",
    syncRequestId: requestId,
    sample: safeImportSample(records)
  });

  try {
    if (!sourceType) {
      throw new Error("sourceType manquant.");
    }
    if (!records.length) {
      throw new Error("records vide. Aucun import a traiter.");
    }
    if (records.length > 2500) {
      throw new Error("Import trop volumineux. Maximum 2500 lignes par demande.");
    }

    const coaches = await loadCoachDirectory();
    const coach = resolveCoachForImport(payload, records, coaches);
    if (!coach && importSourceRequiresCoach(sourceType)) {
      throw new Error("Coach non reconnu. Fournis coachId, coachRxId, teamId ou coachName.");
    }

    const result = await processDirectImport({
      sourceType,
      records,
      coach,
      runId: runRef.id,
      requestedBy
    });

    await runRef.set({
      ...result,
      status: result.status || "done",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await requestRef.set({
      status: "done",
      stage: "completed",
      sourceType,
      sourceImportRunId: runRef.id,
      resultSummary: summarizeDirectImportResult(result),
      resultCoachIds: result.coachId ? [result.coachId] : [],
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    const message = cleanString(error?.message || error || "Erreur import source inconnue.");
    console.error("Queued source import failed", {
      requestId,
      runId: runRef.id,
      sourceType,
      requestedBy,
      message,
      stack: error?.stack || ""
    });
    await runRef.set({
      status: "error",
      errorMessage: message.slice(0, 900),
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await requestRef.set({
      status: "error",
      stage: "source_import_failed",
      sourceType,
      sourceImportRunId: runRef.id,
      errorMessage: message.slice(0, 900),
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
}

exports.ingestDashboardSource = onRequest(
  {
    region: "us-central1",
    secrets: [dashboardImportToken],
    timeoutSeconds: 120,
    memory: "512MiB"
  },
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "application/json; charset=utf-8");

    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, X-CFSB-Import-Token");
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed", message: "Utilise POST." });
      return;
    }

    const configuredToken = cleanString(safeSecretValue(dashboardImportToken));
    if (!configuredToken) {
      res.status(500).json({
        ok: false,
        error: "missing_import_secret",
        message: "DASHBOARD_IMPORT_TOKEN n'est pas configure dans Firebase Functions."
      });
      return;
    }

    const payload = parseRequestBody(req);
    const providedToken = cleanString(req.get("X-CFSB-Import-Token") || payload.importToken || "");
    if (!providedToken || providedToken !== configuredToken) {
      res.status(401).json({ ok: false, error: "invalid_import_token", message: "Token d'import invalide." });
      return;
    }

    const sourceType = normalizeImportSourceType(payload.sourceType || payload.source || payload.kind);
    const records = normalizeImportRecords(payload.records || payload.rows || payload.data || []);
    const requestedBy = cleanString(payload.requestedBy || payload.operator || payload.sourceActor || "apps_script");
    const runRef = db.collection("sourceImportRuns").doc();
    const startedAt = admin.firestore.Timestamp.now();

    await runRef.set({
      sourceType,
      requestedBy,
      status: "running",
      recordsReceived: records.length,
      createdAt: startedAt,
      startedAt,
      importMode: "direct_cloud_function",
      sample: safeImportSample(records)
    });

    try {
      if (!sourceType) {
        throw new Error("sourceType manquant.");
      }
      if (!records.length) {
        throw new Error("records vide. Aucun import a traiter.");
      }
      if (records.length > 2500) {
        throw new Error("Import trop volumineux. Maximum 2500 lignes par appel.");
      }

      const coaches = await loadCoachDirectory();
      const coach = resolveCoachForImport(payload, records, coaches);
      if (!coach && importSourceRequiresCoach(sourceType)) {
        throw new Error("Coach non reconnu. Fournis coachId, coachRxId, teamId ou coachName.");
      }

      const result = await processDirectImport({
        sourceType,
        records,
        coach,
        runId: runRef.id,
        requestedBy
      });

      await runRef.set({
        ...result,
        status: result.status || "done",
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      res.status(200).json({
        ok: true,
        runId: runRef.id,
        sourceType,
        coachId: coach?.id || "",
        result: summarizeDirectImportResult(result)
      });
    } catch (error) {
      const message = cleanString(error?.message || error || "Erreur import inconnue.");
      await runRef.set({
        status: "error",
        errorMessage: message.slice(0, 900),
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.error("Direct dashboard import failed", {
        runId: runRef.id,
        sourceType,
        requestedBy,
        message,
        stack: error?.stack || ""
      });
      res.status(400).json({ ok: false, runId: runRef.id, error: "direct_import_failed", message });
    }
  }
);

async function runDashboardSheetsSync({
  requestedCoachId = "",
  request = null,
  source = "firebase_function_sync_sheets",
  triggeredByEventId = ""
} = {}) {
  const startedAt = admin.firestore.Timestamp.now();
  const triggeredBy = request?.auth?.uid
    ? "manual_admin"
    : triggeredByEventId
      ? "scheduled"
      : "system";
  const coaches = await loadCoachDirectory();
  const selectedCoachIds = requestedCoachId
    ? [requestedCoachId]
    : coaches.map((coach) => coach.id);
  const selectedCoaches = coaches.filter((coach) => selectedCoachIds.includes(coach.id));

  if (!selectedCoaches.length) {
    throw new HttpsError("invalid-argument", "Aucun coach reconnu pour cette synchronisation.");
  }

  let valuesByTab;
  try {
    valuesByTab = await readDashboardTabs();
  } catch (error) {
    await writeFailedSyncRun({
      startedAt,
      requestedByUid: request?.auth?.uid || "system",
      requestedByEmail: request?.auth?.token?.email || "",
      triggeredBy,
      triggeredByEventId,
      coachIds: selectedCoachIds,
      source,
      error,
      stage: "read_dashboard_tabs"
    });
    throw new HttpsError(
      "failed-precondition",
      `Impossible de lire le Google Sheet dashboard. Partage le Sheet avec le compte de service Firebase puis reessaie. Detail: ${cleanString(error.message).slice(0, 220)}`
    );
  }

  const questionnaireRead = await readQuestionnaireTabsSafely();
  const questionnaireRows = Object.entries(questionnaireRead.valuesByTab)
    .flatMap(([tab, values]) => rowsFromValues(values).map((row) => ({
      ...row,
      [keyOf("source_questionnaire_tab")]: tab
    })));
  const csmRead = await readCsmCheckupTabsSafely();
  const externalCheckupRows = Object.entries(csmRead.valuesByTab)
    .flatMap(([tab, values]) => rowsFromValues(values).map((row) => ({
      ...row,
      [keyOf("source_checkup_tab")]: tab
    })));

  const coreRows = mergeSheetRows(
    rowsFromValues(valuesByTab[SHEET_TABS.coreClients]),
    rowsFromValues(valuesByTab[SHEET_TABS.coreClientsManual])
  );
  const taskRows = rowsFromValues(valuesByTab[SHEET_TABS.tasks]);
  const rebookingRows = rowsFromValues(valuesByTab[SHEET_TABS.rebookings]);
  const dashboardCheckupRows = rowsFromValues(valuesByTab[SHEET_TABS.checkups])
    .map((row) => ({
      ...row,
      [keyOf("source_checkup_tab")]: SHEET_TABS.checkups
    }));
  const checkupRows = mergeSheetRows(dashboardCheckupRows, externalCheckupRows);
  const alumniRows = rowsFromValues(valuesByTab[SHEET_TABS.alumni]);
  const impactRows = mergeSheetRows(
    rowsFromValues(valuesByTab[SHEET_TABS.impactLog]),
    rowsFromValues(valuesByTab[SHEET_TABS.impactOpportunities])
  );
  const browserRows = mergeSheetRows(
    rowsFromValues(valuesByTab[SHEET_TABS.coachRxAll]),
    rowsFromValues(valuesByTab[SHEET_TABS.coachRxLegacy])
  );
  const sourceOverview = sourceRowsOverview({
    coreRows,
    taskRows,
    browserRows,
    questionnaireRows,
    rebookingRows,
    checkupRows,
    alumniRows,
    impactRows
  });

  const results = [];
  for (const coach of selectedCoaches) {
    let result;
    try {
      result = await syncCoachFromRows({
        coach,
        coreRows,
        taskRows,
        browserRows,
        questionnaireRows,
        rebookingRows,
        checkupRows,
        alumniRows,
        impactRows
      });
      await writeCoachSyncStatus({ result, request, source, triggeredBy });
      results.push(result);
    } catch (error) {
      const message = cleanString(error?.message || error || "Erreur inconnue pendant l'import coach.");
      console.error("Dashboard sync coach failed", {
        coachId: coach.id,
        coachName: coach.name,
        source,
        stage: "sync_coach",
        message,
        stack: error?.stack || ""
      });
      await writeFailedSyncRun({
        startedAt,
        requestedByUid: request?.auth?.uid || "system",
        requestedByEmail: request?.auth?.token?.email || "",
        triggeredBy,
        triggeredByEventId,
        coachIds: selectedCoachIds,
        source,
        error,
        stage: `sync_coach_${coach.id}`
      });
      throw new HttpsError(
        "failed-precondition",
        `Synchronisation interrompue pour ${coach.name} (${coach.id}). Detail: ${message.slice(0, 260)}`
      );
    }
  }

  const warnings = [
    ...questionnaireRead.warnings,
    ...csmRead.warnings,
    ...results.flatMap((result) => Array.isArray(result.warnings) ? result.warnings : [])
  ];
  const tabsRead = Object.fromEntries(Object.entries(valuesByTab).map(([tab, values]) => [tab, Math.max(0, values.length - 1)]));
  const questionnaireTabsRead = Object.fromEntries(Object.entries(questionnaireRead.valuesByTab).map(([tab, values]) => [tab, Math.max(0, values.length - 1)]));
  const checkupTabsRead = Object.fromEntries(Object.entries(csmRead.valuesByTab).map(([tab, values]) => [tab, Math.max(0, values.length - 1)]));
  const finishedAt = admin.firestore.Timestamp.now();

  try {
    await db.collection("syncRuns").add({
      requestedByUid: request?.auth?.uid || "system",
      requestedByEmail: request?.auth?.token?.email || "",
      triggeredBy,
      triggeredByEventId,
      coachIds: selectedCoachIds,
      results,
      sourceOverview,
      tabsRead,
      questionnaireTabsRead,
      checkupTabsRead,
      questionnaireWarnings: questionnaireRead.warnings,
      checkupWarnings: csmRead.warnings,
      warnings,
      startedAt,
      finishedAt,
      createdAt: startedAt,
      completedAt: finishedAt,
      source
    });
  } catch (error) {
    const message = cleanString(error?.message || error || "Erreur inconnue pendant l'ecriture syncRuns.");
    console.error("Dashboard sync run write failed", {
      source,
      stage: "write_sync_run",
      message,
      stack: error?.stack || ""
    });
    throw new HttpsError(
      "failed-precondition",
      `La synchronisation a importe les donnees, mais le journal syncRuns n'a pas pu etre ecrit. Detail: ${message.slice(0, 260)}`
    );
  }

  return {
    ok: true,
    coachIds: selectedCoachIds,
    results,
    sourceOverview,
    tabsRead,
    questionnaireTabsRead,
    checkupTabsRead,
    questionnaireWarnings: questionnaireRead.warnings,
    checkupWarnings: csmRead.warnings,
    warnings,
    triggeredBy,
    source,
    message: "Synchronisation Google Sheets vers Firestore terminee."
  };
}

function summarizeSyncResult(result = {}) {
  const results = Array.isArray(result.results) ? result.results : [];
  return {
    coaches: results.length,
    clientsImported: results.reduce((sum, item) => sum + Number(item.clientsImported || 0), 0),
    clientsMissingPhone: results.reduce((sum, item) => sum + Number(item.clientsMissingPhone || 0), 0),
    tasksImported: results.reduce((sum, item) => sum + Number(item.tasksImported || 0), 0),
    questionnaireResponsesImported: results.reduce((sum, item) => sum + Number(item.questionnaireResponsesImported || 0), 0),
    rebookingsImported: results.reduce((sum, item) => sum + Number(item.rebookingsImported || 0), 0),
    checkupsImported: results.reduce((sum, item) => sum + Number(item.checkupsImported || 0), 0),
    impactsImported: results.reduce((sum, item) => sum + Number(item.impactsImported || 0), 0),
    warnings: Array.isArray(result.warnings) ? result.warnings.length : 0
  };
}

async function writeCoachSyncStatus({ result, request, source = "firebase_function_sync_sheets", triggeredBy = "system" }) {
  const warningCount = Array.isArray(result.warnings) ? result.warnings.length : 0;
  await db.collection("coachSyncStatus").doc(result.coachId).set({
    coachId: result.coachId,
    coachName: result.coachName || "",
    status: warningCount ? "warning" : "ok",
    warningCount,
    warnings: Array.isArray(result.warnings) ? result.warnings.slice(0, 5) : [],
    clientsImported: Number(result.clientsImported || result.clientsEnriched || 0),
    clientsEnriched: Number(result.clientsEnriched || 0),
    clientsMissingPhone: Number(result.clientsMissingPhone || result.diagnostics?.importedClients?.missingPhone || 0),
    tasksImported: Number(result.tasksImported || 0),
    questionnaireResponsesImported: Number(result.questionnaireResponsesImported || 0),
    rebookingsImported: Number(result.rebookingsImported || 0),
    checkupsImported: Number(result.checkupsImported || 0),
    impactsImported: Number(result.impactsImported || 0),
    alumniImported: Number(result.alumniImported || 0),
    sourceCoreClients: Number(result.sourceCoreClients || 0),
    sourceCoachRxRows: Number(result.sourceCoachRxRows || 0),
    sourceTaskRows: Number(result.sourceTaskRows || 0),
    sourceQuestionnaireRows: Number(result.sourceQuestionnaireRows || 0),
    diagnostics: compactSyncDiagnostics(result.diagnostics),
    requestedByUid: request?.auth?.uid || "system",
    requestedByEmail: request?.auth?.token?.email || "",
    triggeredBy,
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    source
  }, { merge: true });
}

function compactSyncDiagnostics(diagnostics = {}) {
  return {
    sourceRowsAvailable: diagnostics.sourceRowsAvailable || {},
    matchedRows: diagnostics.matchedRows || {},
    sourcePhoneCoverage: diagnostics.sourcePhoneCoverage || {},
    importedClients: diagnostics.importedClients
      ? {
          total: Number(diagnostics.importedClients.total || 0),
          missingPhone: Number(diagnostics.importedClients.missingPhone || 0),
          missingSourceClientId: Number(diagnostics.importedClients.missingSourceClientId || 0),
          skippedInvalidNameCount: Number(diagnostics.importedClients.skippedInvalidNameCount || 0),
          skippedInvalidNameSamples: Array.isArray(diagnostics.importedClients.skippedInvalidNameSamples)
            ? diagnostics.importedClients.skippedInvalidNameSamples.slice(0, 8)
            : [],
          ghlPhoneEnrichment: diagnostics.importedClients.ghlPhoneEnrichment || {},
          missingPhoneSamples: Array.isArray(diagnostics.importedClients.missingPhoneSamples)
            ? diagnostics.importedClients.missingPhoneSamples.slice(0, 8)
            : []
      }
      : {},
    importedTasks: diagnostics.importedTasks || {},
    importedRebookings: diagnostics.importedRebookings || {},
    staleCleanup: diagnostics.staleCleanup || {},
    matchingAudit: diagnostics.matchingAudit || {}
  };
}

function parseRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeImportSourceType(value) {
  const key = keyOf(value);
  const aliases = {
    coachrx: "coachrx_clients",
    coachrxclient: "coachrx_clients",
    coachrxclients: "coachrx_clients",
    coachrxbrowser: "coachrx_clients",
    coachrxextension: "coachrx_clients",
    clients: "client_directory",
    clientdirectory: "client_directory",
    clientlist: "client_directory",
    clientenrichment: "client_enrichment",
    clientenrichments: "client_enrichment",
    csmenrichment: "client_enrichment",
    csmclientenrichment: "client_enrichment",
    csmclientsenrichment: "client_enrichment",
    ghl: "ghl_contacts",
    ghlcontacts: "ghl_contacts",
    contacts: "ghl_contacts",
    rebooking: "rebooking",
    rebookings: "rebooking",
    semiprive: "rebooking",
    semipriverebooking: "rebooking",
    checkup: "checkups",
    checkups: "checkups",
    csmcheckup: "checkups",
    csmcheckups: "checkups",
    questionnaire: "questionnaire_responses",
    questionnaires: "questionnaire_responses",
    questionnaireresponses: "questionnaire_responses"
  };
  return aliases[key] || key;
}

function normalizeImportRecords(records) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => record && typeof record === "object" && !Array.isArray(record))
    .map((record) => {
      const row = {};
      Object.entries(record).forEach(([key, value]) => {
        const normalized = keyOf(key);
        if (!normalized) return;
        row[normalized] = cleanString(value);
      });
      return row;
    });
}

function importSourceRequiresCoach(sourceType) {
  return [
    "coachrx_clients",
    "client_directory",
    "client_enrichment",
    "ghl_contacts",
    "rebooking",
    "checkups",
    "questionnaire_responses"
  ].includes(sourceType);
}

function resolveCoachForImport(payload = {}, records = [], coaches = []) {
  const explicit = cleanString(payload.coachId || payload.coachRxId || payload.teamId || payload.coachTeamId);
  if (explicit) {
    const match = coaches.find((coach) => valuesMatchCoachId(explicit, coach));
    if (match) return match;
  }

  const text = cleanString(payload.coachName || payload.coach || payload.trainer || payload.owner);
  if (text) {
    const normalizedText = normalizeComparable(text);
    const match = coaches.find((coach) => {
      return coachAliasValues(coach)
        .map(normalizeComparable)
        .filter(Boolean)
        .some((alias) => normalizedText.includes(alias) || alias.includes(normalizedText));
    });
    if (match) return match;
  }

  for (const row of records.slice(0, 25)) {
    const match = coaches.find((coach) => rowBelongsToCoach(row, coach));
    if (match) return match;
  }
  return null;
}

async function processDirectImport({ sourceType, records, coach, runId, requestedBy }) {
  if (sourceType === "coachrx_clients") {
    return processDirectClientImport({
      sourceType,
      sourceLabel: "direct_coachrx_extension",
      coach,
      coreRows: [],
      browserRows: records,
      runId,
      requestedBy
    });
  }
  if (sourceType === "client_directory" || sourceType === "ghl_contacts") {
    return processDirectClientImport({
      sourceType,
      sourceLabel: sourceType === "ghl_contacts" ? "direct_ghl_contacts" : "direct_client_directory",
      coach,
      coreRows: records,
      browserRows: [],
      runId,
      requestedBy
    });
  }
  if (sourceType === "client_enrichment") {
    return processDirectClientEnrichmentImport({ coach, records, runId, requestedBy });
  }
  if (sourceType === "rebooking") {
    return processDirectRebookingImport({ coach, records, runId, requestedBy });
  }
  if (sourceType === "checkups") {
    return processDirectCheckupImport({ coach, records, runId, requestedBy });
  }
  if (sourceType === "questionnaire_responses") {
    return processDirectQuestionnaireImport({ coach, records, runId, requestedBy });
  }
  return {
    status: "received_unprocessed",
    warning: `Source ${sourceType} recue mais pas encore branchee a une collection operationnelle.`,
    recordsReceived: records.length,
    recordsWritten: 0,
    requestedBy
  };
}

async function processDirectClientImport({ sourceType, sourceLabel, coach, coreRows, browserRows, runId, requestedBy }) {
  const existingClients = await loadExistingDocsByCoach("clients", coach);
  const isGhlContacts = sourceType === "ghl_contacts";
  const records = isGhlContacts
    ? buildGhlContactEnrichmentRecords({
        coach,
        rows: coreRows,
        existingById: existingClients
      })
    : buildClientRecords({
        coach,
        coreRows,
        browserRows,
        existingById: existingClients
      });
  const diagnostics = records.__diagnostics || {};
  const written = await writeImportRecords({
    collectionName: "clients",
    records,
    runId,
    sourceLabel,
    preserveRecordSource: isGhlContacts,
    extraData: {
      directSourceType: sourceType,
      lastDirectEnrichmentSource: isGhlContacts ? "direct_ghl_contacts" : "",
      updatedFromDirectImportAt: admin.firestore.FieldValue.serverTimestamp()
    }
  });
  const staleSourceCandidates = directClientStaleCandidateSources(sourceType);
  const staleClients = staleSourceCandidates.size
    ? collectStaleImportedMapDocs({
        existingById: existingClients,
        currentIds: new Set(records.map((record) => record.id)),
        protectedSources: new Set(["firebase_app_manual", "manual", "dashboard_manual"]),
        candidateSources: staleSourceCandidates
      })
    : [];
  const staleMarked = await markStaleImportedRecords({
    collectionName: "clients",
    records: staleClients,
    staleReason: `Absent du dernier snapshot direct ${sourceType}.`
  });
  const missingPhone = records.filter((record) => !clientPhone(record.data)).length;
  const result = {
    status: missingPhone ? "warning" : "done",
    coachId: coach.id,
    coachName: coach.name,
    sourceType,
    recordsReceived: coreRows.length + browserRows.length,
    recordsWritten: written,
    clientsImported: written,
    clientsMissingPhone: missingPhone,
    clientsMarkedStale: staleMarked,
    diagnostics: {
      importedClients: {
        total: records.length,
        missingPhone,
        staleMarked,
        staleCandidateSources: [...staleSourceCandidates],
        skippedInvalidNameCount: Number(diagnostics.skippedInvalidNameCount || 0),
        skippedInvalidNameSamples: Array.isArray(diagnostics.skippedInvalidNameSamples)
          ? diagnostics.skippedInvalidNameSamples.slice(0, 8)
          : [],
        ghlContacts: diagnostics.ghlContacts || null
      }
    },
    warnings: missingPhone ? [`${missingPhone} client(s) importe(s) sans telephone.`] : []
  };
  if (isGhlContacts) {
    const ghl = diagnostics.ghlContacts || {};
    result.status = Number(ghl.matchedExistingClients || 0) ? "done" : "warning";
    result.clientsMissingPhone = 0;
    result.warnings = [];
    if (Number(ghl.rowsWithoutPhone || 0)) {
      result.warnings.push(`${ghl.rowsWithoutPhone} contact(s) GHL ignore(s) sans telephone normalisable.`);
    }
    if (Number(ghl.skippedNoExistingClientMatch || 0)) {
      result.warnings.push(`${ghl.skippedNoExistingClientMatch} contact(s) GHL ignore(s), car aucun client existant ne correspond.`);
    }
    if (!Number(ghl.matchedExistingClients || 0)) {
      result.warnings.push("Aucun client existant n'a ete enrichi par le lot GHL.");
    }
    result.status = result.warnings.length ? "warning" : "done";
  }
  await writeDirectCoachSyncStatus({ result, runId, requestedBy, source: sourceLabel });
  return result;
}

async function processDirectClientEnrichmentImport({ coach, records, runId, requestedBy }) {
  const existingClients = await loadExistingDocsByCoach("clients", coach);
  const enrichmentRecords = buildClientEnrichmentRecords({
    coach,
    rows: records,
    existingById: existingClients
  });
  const diagnostics = enrichmentRecords.__diagnostics || {};
  const written = await writeImportRecords({
    collectionName: "clients",
    records: enrichmentRecords,
    runId,
    sourceLabel: "direct_csm_client_enrichment",
    preserveRecordSource: true,
    extraData: {
      directSourceType: "client_enrichment",
      lastDirectEnrichmentSource: "direct_csm_client_enrichment",
      updatedFromDirectImportAt: admin.firestore.FieldValue.serverTimestamp()
    }
  });
  const unmatched = Number(diagnostics.skippedNoExistingClientMatch || 0);
  const result = {
    status: unmatched ? "warning" : "done",
    coachId: coach.id,
    coachName: coach.name,
    sourceType: "client_enrichment",
    recordsReceived: records.length,
    recordsWritten: written,
    clientsEnriched: written,
    diagnostics: {
      clientEnrichment: diagnostics
    },
    warnings: unmatched ? [`${unmatched} ligne(s) CSM ignoree(s), car aucune fiche client existante ne correspond.`] : []
  };
  await writeDirectCoachSyncStatus({ result, runId, requestedBy, source: "direct_csm_client_enrichment" });
  return result;
}

function directClientStaleCandidateSources(sourceType) {
  if (sourceType === "coachrx_clients") {
    return new Set(["direct_coachrx_extension", "google_sheets_coachrx_browser", "coachrx_visible_snapshot"]);
  }
  if (sourceType === "client_directory") {
    return new Set(["direct_client_directory", "google_sheets_core_clients"]);
  }
  if (sourceType === "ghl_contacts") {
    return new Set();
  }
  // GHL contacts can be partial enrichment batches. Never mark clients stale
  // just because a contact was absent from a GHL lookup/import.
  return new Set();
}

async function processDirectRebookingImport({ coach, records, runId, requestedBy }) {
  const [existingClients, existingRebookings] = await Promise.all([
    loadExistingRecordsByCoach("clients", coach),
    loadExistingDocsByCoach("rebookings", coach)
  ]);
  const rebookings = buildRebookingRecords({
    coach,
    taskRows: [],
    rebookingRows: records,
    clients: existingClients,
    existingById: existingRebookings,
    groupOpenByClientName: true
  }).map((record) => ({
    id: record.id,
    data: {
      ...record.data,
      source: "direct_rebooking_appscript",
      directSourceType: "rebooking"
    }
  }));
  const staleRebookings = collectStaleImportedMapDocs({
    existingById: existingRebookings,
    currentIds: new Set(rebookings.map((record) => record.id)),
    protectedSources: new Set(["firebase_app_manual", "manual", "dashboard_manual"]),
    candidateSources: new Set(["direct_rebooking_appscript"])
  });
  const staleMarked = await markStaleImportedRecords({
    collectionName: "rebookings",
    records: staleRebookings,
    staleReason: "Remplace par un dossier rebooking groupe depuis l'app legacy."
  });
  const written = await writeImportRecords({
    collectionName: "rebookings",
    records: rebookings,
    runId,
    sourceLabel: "direct_rebooking_appscript",
    extraData: { updatedFromDirectImportAt: admin.firestore.FieldValue.serverTimestamp() }
  });
  const unlinked = rebookings.filter((record) => !cleanString(record.data.clientId)).length;
  const result = {
    status: unlinked ? "warning" : "done",
    coachId: coach.id,
    coachName: coach.name,
    sourceType: "rebooking",
    recordsReceived: records.length,
    recordsWritten: written,
    rebookingsImported: written,
    diagnostics: {
      importedRebookings: {
        total: rebookings.length,
        missingClientId: unlinked,
        missingPhone: rebookings.filter((record) => !cleanString(record.data.clientPhoneNormalized)).length,
        groupedOpenRecords: rebookings.filter((record) => Number(record.data.groupedSourceCount || 0) > 1).length,
        staleMarked
      }
    },
    warnings: [
      ...(unlinked ? [`${unlinked} rebooking(s) sans fiche client reliee.`] : []),
      ...(staleMarked ? [`${staleMarked} ancienne(s) ligne(s) rebooking archivee(s) apres regroupement.`] : [])
    ]
  };
  await writeDirectCoachSyncStatus({ result, runId, requestedBy, source: "direct_rebooking_appscript" });
  return result;
}

async function processDirectCheckupImport({ coach, records, runId, requestedBy }) {
  const clients = await loadExistingRecordsByCoach("clients", coach);
  const checkups = buildCheckupRecords({ coach, rows: records, clients, stableIdMode: "row_index" })
    .map((record) => ({
      id: record.id,
      data: {
        ...record.data,
        source: "direct_csm_checkups",
        directSourceType: "checkups"
      }
    }));
  const written = await writeImportRecords({
    collectionName: "checkups",
    records: checkups,
    runId,
    sourceLabel: "direct_csm_checkups",
    extraData: { updatedFromDirectImportAt: admin.firestore.FieldValue.serverTimestamp() }
  });
  const result = {
    status: "done",
    coachId: coach.id,
    coachName: coach.name,
    sourceType: "checkups",
    recordsReceived: records.length,
    recordsWritten: written,
    checkupsImported: written
  };
  await writeDirectCoachSyncStatus({ result, runId, requestedBy, source: "direct_csm_checkups" });
  return result;
}

async function processDirectQuestionnaireImport({ coach, records, runId, requestedBy }) {
  const [clients, existingQuestionnaires] = await Promise.all([
    loadExistingRecordsByCoach("clients", coach),
    loadExistingDocsByCoach("questionnaireResponses", coach)
  ]);
  const responses = buildQuestionnaireResponseRecords({
    coach,
    rows: records,
    clients,
    existingById: existingQuestionnaires
  }).map((record) => ({
    id: record.id,
    data: {
      ...record.data,
      source: "direct_questionnaire",
      directSourceType: "questionnaire_responses"
    }
  }));
  const written = await writeImportRecords({
    collectionName: "questionnaireResponses",
    records: responses,
    runId,
    sourceLabel: "direct_questionnaire",
    extraData: { updatedFromDirectImportAt: admin.firestore.FieldValue.serverTimestamp() }
  });
  const unmatched = responses.filter((record) => cleanString(record.data.processingStatus) === "unmatched").length;
  const result = {
    status: unmatched ? "warning" : "done",
    coachId: coach.id,
    coachName: coach.name,
    sourceType: "questionnaire_responses",
    recordsReceived: records.length,
    recordsWritten: written,
    questionnaireResponsesImported: written,
    warnings: unmatched ? [`${unmatched} reponse(s) questionnaire non matchee(s).`] : []
  };
  await writeDirectCoachSyncStatus({ result, runId, requestedBy, source: "direct_questionnaire" });
  return result;
}

async function writeImportRecords({ collectionName, records, runId, sourceLabel, extraData = {}, preserveRecordSource = false }) {
  const batchLimit = 450;
  let batch = db.batch();
  let ops = 0;
  let written = 0;
  const commitIfNeeded = async (force = false) => {
    if (!ops) return;
    if (!force && ops < batchLimit) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const record of records) {
    if (!record?.id || !record?.data) continue;
    const ref = db.collection(collectionName).doc(record.id);
    const recordSource = preserveRecordSource
      ? cleanString(record.data.source || sourceLabel || "direct_import")
      : cleanString(sourceLabel || record.data.source || "direct_import");
    batch.set(ref, {
      ...record.data,
      ...extraData,
      source: recordSource,
      directImportRunId: runId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    written += 1;
    await commitIfNeeded();
  }
  await commitIfNeeded(true);
  return written;
}

async function queryDocSnapsByCoach(collectionName, coachOrId) {
  const byId = new Map();
  const criteria = coachFirestoreCriteria(coachOrId);
  await Promise.all(criteria.map(async ({ field, value }) => {
    const snap = await db.collection(collectionName).where(field, "==", value).get();
    snap.forEach((docSnap) => byId.set(docSnap.id, docSnap));
  }));
  return [...byId.values()];
}

function docSnapsToMap(docSnaps = []) {
  const map = new Map();
  docSnaps.forEach((docSnap) => map.set(docSnap.id, docSnap.data()));
  return map;
}

function mapToImportRecords(map = new Map()) {
  return [...map.entries()].map(([id, data]) => ({ id, data: data || {} }));
}

function mergeImportRecordLists(...lists) {
  const merged = new Map();
  lists.flat().filter(Boolean).forEach((record) => {
    if (!record?.id) return;
    const existing = merged.get(record.id);
    merged.set(record.id, {
      id: record.id,
      data: {
        ...(existing?.data || {}),
        ...(record.data || {})
      }
    });
  });
  return [...merged.values()];
}

function snapLikeFromDocSnaps(docSnaps = []) {
  return {
    forEach(callback) {
      docSnaps.forEach(callback);
    }
  };
}

async function loadExistingDocsByCoach(collectionName, coachOrId) {
  return docSnapsToMap(await queryDocSnapsByCoach(collectionName, coachOrId));
}

async function loadExistingRecordsByCoach(collectionName, coachOrId) {
  return (await queryDocSnapsByCoach(collectionName, coachOrId))
    .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }));
}

function coachFirestoreCriteria(coachOrId) {
  const coach = typeof coachOrId === "object" && coachOrId
    ? coachOrId
    : PILOT_COACHES.find((item) => valuesMatchCoachId(coachOrId, item));
  const idValues = uniqueFirestoreQueryValues(
    (coach ? [coach.id, coach.coachRxId] : [coachOrId]).flatMap(firestoreIdQueryVariants)
  );
  const nameValues = coach ? coachAliasValues(coach).slice(0, 8) : [];
  return uniqueFirestoreCriteria([
    ...idValues.map((value) => ({ field: "coachId", value })),
    ...idValues.map((value) => ({ field: "coachRxId", value })),
    ...idValues.map((value) => ({ field: "assignedCoachId", value })),
    ...nameValues.map((value) => ({ field: "coachName", value })),
    ...nameValues.map((value) => ({ field: "assignedCoachName", value }))
  ]);
}

function firestoreIdQueryVariants(value) {
  const clean = cleanString(value);
  if (!clean) return [];
  const variants = [clean];
  if (/^\d+$/.test(clean)) variants.push(Number(clean));
  return variants;
}

function uniqueFirestoreQueryValues(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const clean = cleanString(value);
    if (!clean) return false;
    const key = `${typeof value}:${clean}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueFirestoreCriteria(criteria = []) {
  const seen = new Set();
  return criteria.filter(({ field, value }) => {
    const clean = cleanString(value);
    if (!field || !clean) return false;
    const key = `${field}:${typeof value}:${clean}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function writeDirectCoachSyncStatus({ result, runId, requestedBy, source }) {
  if (!result?.coachId) return;
  await db.collection("coachSyncStatus").doc(result.coachId).set({
    coachId: result.coachId,
    coachName: result.coachName || "",
    status: result.status === "warning" ? "warning" : "ok",
    warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
    warnings: Array.isArray(result.warnings) ? result.warnings.slice(0, 5) : [],
    clientsImported: Number(result.clientsImported || result.clientsEnriched || 0),
    clientsEnriched: Number(result.clientsEnriched || 0),
    clientsMissingPhone: Number(result.clientsMissingPhone || result.diagnostics?.importedClients?.missingPhone || 0),
    rebookingsImported: Number(result.rebookingsImported || 0),
    checkupsImported: Number(result.checkupsImported || 0),
    questionnaireResponsesImported: Number(result.questionnaireResponsesImported || 0),
    sourceImportRunId: runId,
    directSourceType: result.sourceType || "",
    diagnostics: result.diagnostics || {},
    requestedByUid: "direct_import",
    requestedByEmail: requestedBy || "",
    triggeredBy: "direct_import",
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    source
  }, { merge: true });
}

function summarizeDirectImportResult(result = {}) {
  return {
    status: result.status || "done",
    recordsReceived: Number(result.recordsReceived || 0),
    recordsWritten: Number(result.recordsWritten || 0),
    clientsImported: Number(result.clientsImported || 0),
    clientsMissingPhone: Number(result.clientsMissingPhone || 0),
    questionnaireResponsesImported: Number(result.questionnaireResponsesImported || 0),
    rebookingsImported: Number(result.rebookingsImported || 0),
    checkupsImported: Number(result.checkupsImported || 0),
    warnings: Array.isArray(result.warnings) ? result.warnings.length : 0
  };
}

function safeImportSample(records = []) {
  return records.slice(0, 5).map((row) => {
    const sample = {};
    [
      "client",
      "clientname",
      "nom",
      "coach",
      "coachname",
      "phone",
      "telephone",
      "clientphonenumber",
      "clientphonenormalized",
      "status",
      "statut",
      "submittedat",
      "date"
    ].forEach((key) => {
      if (row[key]) sample[key] = key.includes("phone") || key.includes("telephone") ? maskPhone(row[key]) : row[key];
    });
    return sample;
  });
}

function maskPhone(value) {
  const digits = normalizePhone(value);
  if (!digits) return "";
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

async function writeFailedSyncRun({
  startedAt,
  requestedByUid = "system",
  requestedByEmail = "",
  triggeredBy = "system",
  triggeredByEventId = "",
  coachIds = [],
  source = "firebase_function_sync_sheets",
  error,
  stage = "unknown"
}) {
  const message = cleanString(error?.message || error || "Erreur de synchronisation inconnue.");
  await db.collection("syncRuns").add({
    requestedByUid,
    requestedByEmail,
    triggeredBy,
    triggeredByEventId,
    coachIds,
    results: [],
    sourceOverview: {},
    tabsRead: {},
    questionnaireTabsRead: {},
    checkupTabsRead: {},
    warnings: [message],
    status: "error",
    source,
    stage,
    errorMessage: message,
    serviceAccountRequired: FIREBASE_SYNC_SERVICE_ACCOUNT,
    startedAt,
    finishedAt: admin.firestore.Timestamp.now()
  });
}

async function requireAdminProfile(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Connexion Google requise.");
  }
  const profileSnap = await db.doc(`users/${request.auth.uid}`).get();
  if (!profileSnap.exists || profileSnap.get("active") !== true || profileSnap.get("role") !== "admin") {
    throw new HttpsError("permission-denied", "Action reservee a l'administration du dashboard.");
  }
  return profileSnap.data();
}

async function requireAdminUid(uid) {
  const cleanUid = cleanString(uid);
  if (!cleanUid) {
    throw new Error("UID admin manquant.");
  }
  const profileSnap = await db.doc(`users/${cleanUid}`).get();
  if (!profileSnap.exists || profileSnap.get("active") !== true || profileSnap.get("role") !== "admin") {
    throw new Error("Action reservee a l'administration du dashboard.");
  }
  return profileSnap.data();
}

function isPilotCoachId(value) {
  const coachId = cleanString(value);
  return PILOT_COACHES.some((coach) => coach.id === coachId || coach.coachRxId === coachId);
}

function canPilotProfileActOnCoach(profile = {}, targetCoachId = "") {
  const coachId = cleanString(targetCoachId);
  if (!coachId) return false;
  if (profile.role === "admin") return true;
  return profile.active === true
    && profile.role === "coach"
    && isPilotCoachId(profile.coachId)
    && isPilotCoachId(coachId);
}

function accessIssueMessage(profile = {}, targetCoachId = "") {
  const actorCoachId = cleanString(profile.coachId);
  const role = cleanString(profile.role);
  const active = profile.active === true ? "actif" : "inactif";
  const target = cleanString(targetCoachId) || "sans coachId";
  return `Acces coach refuse: profil ${role || "sans role"} ${active}, coachId acteur ${actorCoachId || "manquant"}, coach cible ${target}.`;
}

async function recordAccessIssue(issue = {}) {
  try {
    await db.collection("accessIssues").add({
      source: cleanString(issue.source) || "unknown",
      uid: cleanString(issue.uid),
      email: cleanString(issue.email),
      actorCoachId: cleanString(issue.actorCoachId),
      targetCoachId: cleanString(issue.targetCoachId),
      clientId: cleanString(issue.clientId),
      sendId: cleanString(issue.sendId),
      reason: cleanString(issue.reason),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.warn("access_issue_log_failed", error?.message || error);
  }
}

async function getGoogleAccessToken() {
  const scopes = encodeURIComponent(GOOGLE_SHEETS_READ_SCOPES.join(","));
  const response = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=${scopes}`, {
    headers: { "Metadata-Flavor": "Google" }
  });
  if (!response.ok) {
    throw new Error(`Metadata token inaccessible (${response.status}).`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Metadata token absent.");
  }
  return data.access_token;
}

async function readSheetValues({ token, tab, spreadsheetId = DASHBOARD_SHEET_ID }) {
  const range = encodeURIComponent(`'${tab}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 403) {
    const detail = await response.text();
    throw new Error(
      `Acces Google Sheets refuse pour ${spreadsheetId}/${tab}. Compte service attendu: ${FIREBASE_SYNC_SERVICE_ACCOUNT}. Google: ${safeGoogleApiError(detail)}`
    );
  }
  if (response.status === 404) {
    throw new Error(`Onglet Google Sheets introuvable: ${tab}.`);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Lecture Google Sheets impossible (${response.status}): ${detail.slice(0, 180)}`);
  }
  const data = await response.json();
  return data.values || [];
}

function safeGoogleApiError(body) {
  const raw = cleanString(body);
  if (!raw) return "details absents";
  try {
    const parsed = JSON.parse(raw);
    return cleanString(parsed?.error?.message || parsed?.error?.status || raw).slice(0, 260);
  } catch (_) {
    return raw.slice(0, 260);
  }
}

async function readDashboardTabs() {
  const token = await getGoogleAccessToken();
  const entries = await Promise.all(Object.values(SHEET_TABS).map(async (tab) => {
    try {
      const values = await readSheetValues({ token, tab });
      return [tab, values];
    } catch (error) {
      if (OPTIONAL_DASHBOARD_TABS.has(tab)) return [tab, []];
      throw error;
    }
  }));
  return Object.fromEntries(entries);
}

async function readQuestionnaireTabsSafely() {
  const token = await getGoogleAccessToken();
  const warnings = [];
  const entries = await Promise.all(Object.values(QUESTIONNAIRE_TABS).map(async (tab) => {
    try {
      const values = await readSheetValues({
        token,
        tab,
        spreadsheetId: QUESTIONNAIRE_RESPONSES_SHEET_ID
      });
      return [tab, values];
    } catch (error) {
      warnings.push(`${tab}: ${cleanString(error.message).slice(0, 180)}`);
      return [tab, []];
    }
  }));
  return { valuesByTab: Object.fromEntries(entries), warnings };
}

async function readCsmCheckupTabsSafely() {
  const token = await getGoogleAccessToken();
  const warnings = [];
  const valuesByTab = {};
  for (const tab of CSM_CHECKUP_TAB_CANDIDATES) {
    try {
      const values = await readSheetValues({
        token,
        tab,
        spreadsheetId: CSM_CHECKUP_SHEET_ID
      });
      if (Array.isArray(values) && values.length > 1) {
        valuesByTab[tab] = values;
        break;
      }
    } catch (error) {
      if (!/introuvable|404/i.test(cleanString(error.message))) {
        warnings.push(`CSM ${tab}: ${cleanString(error.message).slice(0, 180)}`);
        break;
      }
    }
  }
  if (!Object.keys(valuesByTab).length) {
    warnings.push("CSM checkups: aucun onglet candidat trouve ou aucune ligne lisible. Performance affichera 0 check-up importe.");
  }
  return { valuesByTab, warnings };
}

async function loadCoachDirectory() {
  const byId = new Map(PILOT_COACHES.map((coach) => [coach.id, { ...coach, active: true }]));
  const snap = await db.collection("coaches").get();
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const id = cleanString(data.id || docSnap.id);
    if (!id) return;
    const existing = byId.get(id) || {};
    byId.set(id, {
      id,
      coachRxId: cleanString(data.coachRxId || id),
      name: cleanString(data.name || data.displayName || id),
      email: cleanString(data.email || data.coachEmail || existing.email || ""),
      aliases: [data.name, data.displayName, ...(Array.isArray(data.aliases) ? data.aliases : [])].filter(Boolean),
      active: data.active !== false
    });
  });
  return [...byId.values()].filter((coach) => coach.active !== false);
}

async function syncCoachFromRows({
  coach,
  coreRows,
  taskRows,
  browserRows,
  questionnaireRows = [],
  rebookingRows = [],
  checkupRows = [],
  alumniRows = [],
  impactRows = []
}) {
  const coachCoreRows = coreRows.filter((row) => rowBelongsToCoach(row, coach));
  const coachBrowserRows = browserRows.filter((row) => rowBelongsToCoach(row, coach));
  const coachTaskRows = taskRows.filter((row) => taskRowBelongsToCoach(row, coach));
  const coachRebookingRows = rebookingRows.filter((row) => rowBelongsToCoach(row, coach));
  const coachCheckupRows = checkupRows.filter((row) => rowBelongsToCoach(row, coach));
  const coachAlumniRows = alumniRows.filter((row) => rowBelongsToCoach(row, coach));
  const coachImpactRows = impactRows.filter((row) => rowBelongsToCoach(row, coach));
  const [existingClientDocs, existingTaskDocs, existingQuestionnaireDocs, existingRebookingDocs, existingImpactDocs, existingAlumniDocs] = await Promise.all([
    queryDocSnapsByCoach("clients", coach),
    queryDocSnapsByCoach("tasks", coach),
    queryDocSnapsByCoach("questionnaireResponses", coach),
    queryDocSnapsByCoach("rebookings", coach),
    queryDocSnapsByCoach("impacts", coach),
    queryDocSnapsByCoach("alumni", coach)
  ]);
  const existingClientSnap = snapLikeFromDocSnaps(existingClientDocs);
  const existingTaskSnap = snapLikeFromDocSnaps(existingTaskDocs);
  const existingClients = docSnapsToMap(existingClientDocs);
  let clients = buildClientRecords({
    coach,
    coreRows: coachCoreRows,
    browserRows: coachBrowserRows,
    existingById: existingClients
  });
  const clientImportDiagnostics = clients.__diagnostics || {};
  const ghlPhoneEnrichment = await enrichClientRecordsWithGhlPhones({ clients });
  const clientsForMatching = mergeImportRecordLists(mapToImportRecords(existingClients), clients);
  const coachQuestionnaireRows = questionnaireRows.filter((row) => questionnaireRowBelongsToCoach(row, coach, clientsForMatching));
  const existingQuestionnaires = docSnapsToMap(existingQuestionnaireDocs);
  const existingRebookings = docSnapsToMap(existingRebookingDocs);
  const existingImpacts = docSnapsToMap(existingImpactDocs);
  const existingAlumni = docSnapsToMap(existingAlumniDocs);
  const questionnaireResponses = buildQuestionnaireResponseRecords({
    coach,
    rows: coachQuestionnaireRows,
    clients: clientsForMatching,
    existingById: existingQuestionnaires
  });
  const questionnaireTasks = buildQuestionnaireTaskRecords({ coach, responses: questionnaireResponses });
  const rebookings = buildRebookingRecords({
    coach,
    taskRows: coachTaskRows,
    rebookingRows: coachRebookingRows,
    clients: clientsForMatching,
    existingById: existingRebookings
  });
  const checkups = buildCheckupRecords({ coach, rows: coachCheckupRows, clients: clientsForMatching });
  const impacts = buildImpactRecords({ coach, rows: coachImpactRows, clients: clientsForMatching, existingById: existingImpacts });
  const alumni = buildAlumniRecords({ coach, rows: coachAlumniRows, existingById: existingAlumni });
  const existingTasks = docSnapsToMap(existingTaskDocs);
  const explicitTasks = buildTaskRecords({
    coach,
    taskRows: coachTaskRows,
    clients: clientsForMatching,
    browserRows: coachBrowserRows,
    existingById: existingTasks
  });
  const tasks = [
    ...explicitTasks,
    ...questionnaireTasks
  ];
  const staleClients = collectStaleImportedDocs({
    snap: existingClientSnap,
    currentIds: new Set(clients.map((client) => client.id)),
    protectedSources: new Set(["firebase_app_manual", "manual"])
  });
  const staleTasks = collectStaleImportedDocs({
    snap: existingTaskSnap,
    currentIds: new Set(tasks.map((task) => task.id)),
    protectedSources: new Set(["firebase_app_manual", "manual", "dashboard_manual"])
  });

  const batchLimit = 450;
  let batch = db.batch();
  let ops = 0;
  const commitIfNeeded = async (force = false) => {
    if (!ops) return;
    if (!force && ops < batchLimit) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const client of clients) {
    const ref = db.collection("clients").doc(client.id);
    batch.set(ref, {
      ...client.data,
      updatedFromSheetsAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    await commitIfNeeded();
  }

  for (const task of tasks) {
    const ref = db.collection("tasks").doc(task.id);
    batch.set(ref, {
      ...task.data,
      updatedFromSheetsAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    await commitIfNeeded();
  }

  for (const stale of staleClients) {
    const ref = db.collection("clients").doc(stale.id);
    batch.set(ref, {
      status: "import_stale",
      sourceStale: true,
      staleReason: "Absent de la derniere synchronisation Google Sheets / CoachRx.",
      staleAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    await commitIfNeeded();
  }

  for (const stale of staleTasks) {
    const ref = db.collection("tasks").doc(stale.id);
    batch.set(ref, {
      status: "archived",
      sourceStale: true,
      staleReason: "Tache absente de la derniere synchronisation Google Sheets / CoachRx.",
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    await commitIfNeeded();
  }

  for (const response of questionnaireResponses) {
    const ref = db.collection("questionnaireResponses").doc(response.id);
    batch.set(ref, {
      ...response.data,
      updatedFromSheetsAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    await commitIfNeeded();
  }
  for (const rebooking of rebookings) {
    const ref = db.collection("rebookings").doc(rebooking.id);
    batch.set(ref, {
      ...rebooking.data,
      updatedFromSheetsAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    await commitIfNeeded();
  }
  for (const checkup of checkups) {
    const ref = db.collection("checkups").doc(checkup.id);
    batch.set(ref, {
      ...checkup.data,
      updatedFromSheetsAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    await commitIfNeeded();
  }
  for (const impact of impacts) {
    const ref = db.collection("impacts").doc(impact.id);
    batch.set(ref, {
      ...impact.data,
      updatedFromSheetsAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    await commitIfNeeded();
  }
  for (const alumniRecord of alumni) {
    const ref = db.collection("alumni").doc(alumniRecord.id);
    batch.set(ref, {
      ...alumniRecord.data,
      updatedFromSheetsAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    await commitIfNeeded();
  }
  await commitIfNeeded(true);

  const sourceOverview = sourceRowsOverview({
    coreRows,
    taskRows,
    browserRows,
    questionnaireRows,
    rebookingRows,
    checkupRows,
    alumniRows,
    impactRows
  });
  const matchingAudit = buildCoachMatchingAudit({
    coach,
    coreRows,
    taskRows,
    browserRows,
    questionnaireRows,
    rebookingRows,
    checkupRows,
    alumniRows,
    impactRows
  });
  const diagnostics = {
    sourceRowsAvailable: {
      coreClients: coreRows.length,
      coachRx: browserRows.length,
      tasks: taskRows.length,
      questionnaireRows: questionnaireRows.length,
      rebookings: rebookingRows.length,
      checkups: checkupRows.length,
      alumni: alumniRows.length,
      impacts: impactRows.length
    },
    matchedRows: {
      coreClients: coachCoreRows.length,
      coachRx: coachBrowserRows.length,
      tasks: coachTaskRows.length,
      questionnaireRows: coachQuestionnaireRows.length,
      rebookings: coachRebookingRows.length,
      checkups: coachCheckupRows.length,
      alumni: coachAlumniRows.length,
      impacts: coachImpactRows.length
    },
    sourcePhoneCoverage: {
      coreClients: countRowsWithClientPhone(coachCoreRows),
      coachRx: countRowsWithClientPhone(coachBrowserRows),
      rebookings: countRowsWithClientPhone(coachRebookingRows),
      questionnaireRows: countRowsWithClientPhone(coachQuestionnaireRows),
      checkups: countRowsWithClientPhone(coachCheckupRows),
      alumni: countRowsWithClientPhone(coachAlumniRows)
    },
    importedClients: {
      total: clients.length,
      missingPhone: clients.filter((client) => !clientPhone(client.data)).length,
      skippedInvalidNameCount: Number(clientImportDiagnostics.skippedInvalidNameCount || 0),
      skippedInvalidNameSamples: Array.isArray(clientImportDiagnostics.skippedInvalidNameSamples)
        ? clientImportDiagnostics.skippedInvalidNameSamples.slice(0, 8)
        : [],
      ghlPhoneEnrichment,
      missingSourceClientId: clients.filter((client) => !cleanString(client.data.sourceClientId)).length,
      missingPhoneSamples: clients
        .filter((client) => !clientPhone(client.data))
        .map((client) => ({
          id: client.id,
          name: client.data.name || client.data.clientName || "",
          source: client.data.source || "",
          sourceClientId: client.data.sourceClientId || ""
        }))
        .slice(0, 8)
    },
    importedTasks: taskImportDiagnostics({
      explicitTasks,
      questionnaireTasks,
      taskRows: coachTaskRows,
      sourceTaskRows: taskRows
    }),
    importedRebookings: rebookingImportDiagnostics({
      rebookings,
      taskRows: coachTaskRows,
      rebookingRows: coachRebookingRows,
      sourceRebookingRows: rebookingRows
    }),
    staleCleanup: {
      clientsMarkedStale: staleClients.length,
      tasksArchivedStale: staleTasks.length,
      clientSamples: staleClients.slice(0, 8).map((item) => item.id),
      taskSamples: staleTasks.slice(0, 8).map((item) => item.id)
    },
    sourceSamples: sourceOverview.samples,
    sourceHeaders: sourceOverview.headers,
    matchingAudit
  };
  const warnings = buildSyncWarnings({ coach, clients, diagnostics });

  return {
    coachId: coach.id,
    coachName: coach.name,
    sourceCoreClients: coachCoreRows.length,
    sourceCoachRxRows: coachBrowserRows.length,
    sourceTaskRows: coachTaskRows.length,
    sourceQuestionnaireRows: coachQuestionnaireRows.length,
    clientsImported: clients.length,
    clientsMissingPhone: diagnostics.importedClients.missingPhone,
    tasksImported: tasks.length,
    questionnaireResponsesImported: questionnaireResponses.length,
    questionnaireTasksImported: questionnaireTasks.length,
    rebookingsImported: rebookings.length,
    checkupsImported: checkups.length,
    impactsImported: impacts.length,
    alumniImported: alumni.length,
    diagnostics,
    warnings
  };
}

async function enrichClientRecordsWithGhlPhones({ clients }) {
  const summary = {
    attempted: 0,
    enriched: 0,
    skippedExistingPhone: 0,
    skippedNoName: 0,
    skippedNoToken: 0,
    skippedNoUniqueMatch: 0,
    errors: []
  };
  const token = cleanString(safeSecretValue(ghlPrivateToken));
  if (!token) {
    summary.skippedNoToken = clients.filter((client) => !clientPhone(client.data)).length;
    return summary;
  }

  const seenNames = new Map();
  for (const client of clients) {
    if (clientPhone(client.data)) {
      summary.skippedExistingPhone += 1;
      continue;
    }
    const name = cleanString(client.data.name || client.data.clientName);
    if (!name) {
      summary.skippedNoName += 1;
      continue;
    }
    const nameKey = normalizeComparable(name);
    if (!seenNames.has(nameKey)) seenNames.set(nameKey, []);
    seenNames.get(nameKey).push(client);
  }

  for (const [nameKey, group] of seenNames.entries()) {
    const name = cleanString(group[0]?.data?.name || group[0]?.data?.clientName);
    summary.attempted += group.length;
    try {
      const contact = await findGhlContactByNameExact({ token, locationId: GHL_LOCATION_ID, name, nameKey });
      const phone = normalizePhone(contact?.phone || contact?.phoneNumber || contact?.mobile || "");
      if (!contact?.id || !phone) {
        summary.skippedNoUniqueMatch += group.length;
        continue;
      }
      for (const client of group) {
        client.data.phoneNormalized = phone;
        client.data.clientPhoneNormalized = phone;
        client.data.ghlContactId = contact.id;
        client.data.ghlPhoneEnrichedAt = admin.firestore.FieldValue.serverTimestamp();
        client.data.phoneSource = "ghl_exact_name_match";
        if (!client.data.email) setIfUseful(client.data, "email", contact.email);
        summary.enriched += 1;
      }
    } catch (error) {
      summary.errors.push(`${name}: ${cleanString(error.message).slice(0, 160)}`);
      if (summary.errors.length > 5) summary.errors = summary.errors.slice(0, 5);
    }
  }
  return summary;
}

function buildClientRecords({ coach, coreRows, browserRows, existingById = new Map() }) {
  const clients = new Map();
  const matchIndex = createClientMatchIndex(existingById);
  const diagnostics = {
    skippedInvalidNameCount: 0,
    skippedInvalidNameSamples: [],
    coachRxPortfolio: {
      rowsImported: 0,
      withPhone: 0,
      withSourceClientId: 0,
      needsValidation: 0,
      programContextRows: 0,
      lateProgramSignals: 0,
      samplesToValidate: []
    }
  };
  const addClient = (row, source) => {
    const name = clientNameFromRow(row);
    const sourceClientId = pick(row, CLIENT_ID_ALIASES);
    const phoneRaw = pick(row, [
      "client_phone_normalized",
      "phone normalized",
      "phone_normalized",
      "phone",
      "phone number",
      "client phone",
      "telephone",
      "t\u00e9l\u00e9phone",
      "téléphone",
      "tÃ©lÃ©phone",
      "mobile",
      "mobile phone",
      "cell",
      "cellulaire",
      "numero telephone",
      "num\u00e9ro t\u00e9l\u00e9phone",
      "numéro téléphone",
      "telephone principal",
      "t\u00e9l\u00e9phone principal",
      "téléphone principal",
      "phone_raw"
    ]);
    const phoneNormalized = normalizePhone(phoneRaw || pick(row, PHONE_ALIASES));
    const invalidNameReason = invalidClientNameReason(name)
      || invalidCoachAsClientReason({ name, coach, source, phoneNormalized, sourceClientId });
    if (invalidNameReason) {
      diagnostics.skippedInvalidNameCount += 1;
      if (diagnostics.skippedInvalidNameSamples.length < 12) {
        diagnostics.skippedInvalidNameSamples.push({
          name: cleanString(name),
          source,
          reason: invalidNameReason,
          coachSignal: rowCoachIdValue(row) || rowCoachTextValue(row).slice(0, 80)
        });
      }
      return;
    }
    const email = pick(row, EMAIL_ALIASES);
    const stable = phoneNormalized || sourceClientId || slugify(name);
    if (!stable || !name) return;
    const fallbackId = `${coach.id}_${slugify(stable)}`;
    const matched = findClientMatch(matchIndex, { phoneNormalized, sourceClientId, name });
    const id = matched?.id || fallbackId;
    const existing = clients.get(id)?.data || matched?.data || existingById.get(id) || {};
    const existingPhone = clientPhone(existing);
    const membershipLabel = pick(row, ["membership", "active package", "package", "abonnement", "membership label", "membership type"]);
    const exerciseDue = pick(row, ["exercise due", "programme du", "program due", "programme", "exercise_due"]);
    const lifestyleDue = pick(row, ["lifestyle due", "lifestyle_due"]);
    const exerciseCompliance = pick(row, ["exercise compliance", "exercise_compliance", "compliance"]);
    const exerciseAlert = pick(row, EXERCISE_SIGNAL_ALIASES);
    const exerciseState = pick(row, EXERCISE_STATE_ALIASES);
    const lifestyleAlert = pick(row, LIFESTYLE_SIGNAL_ALIASES);
    const lifestyleState = pick(row, LIFESTYLE_STATE_ALIASES);
    const tags = splitTags(pick(row, ["tags", "tag"]));
    const coachRxAssessment = source === "coachrx"
      ? assessCoachRxPortfolioClient({
          row,
          existing,
          phoneNormalized,
          sourceClientId,
          membershipLabel,
          exerciseDue,
          lifestyleDue,
          exerciseCompliance,
          exerciseAlert,
          exerciseState,
          lifestyleAlert,
          lifestyleState
        })
      : null;

    const importedData = {
      ...existing,
      coachId: coach.id,
      coachRxId: coach.coachRxId,
      coachName: coach.name,
      name: name || existing.name || "",
      lastNameSort: lastNameSort(name || existing.name || ""),
      status: existing.status || "active",
      source: source === "core" ? "google_sheets_core_clients" : "google_sheets_coachrx_browser",
      sourceUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (matched?.id && matched.id !== fallbackId) {
      importedData.matchedExistingClientId = matched.id;
      importedData.matchedExistingClientBy = matched.by;
    }
    if (existing.source === "firebase_app_manual" || existing.linkedFromManual) {
      importedData.linkedFromManual = true;
    }
    setIfUseful(importedData, "sourceClientId", sourceClientId || existing.sourceClientId);
    setIfUseful(importedData, "phoneNormalized", phoneNormalized || existingPhone);
    setIfUseful(importedData, "clientPhoneNormalized", phoneNormalized || existingPhone);
    setIfUseful(importedData, "email", email || existing.email);
    applyMembershipIfTrusted(importedData, {
      membershipLabel,
      incomingSource: source === "core" ? "google_sheets_core_clients" : "google_sheets_coachrx_browser",
      existing
    });
    setIfUseful(importedData, "coachRxExerciseDue", exerciseDue || existing.coachRxExerciseDue);
    setIfUseful(importedData, "coachRxLifestyleDue", lifestyleDue || existing.coachRxLifestyleDue);
    setIfUseful(importedData, "exerciseCompliance", exerciseCompliance || existing.exerciseCompliance);
    if (tags.length || Array.isArray(existing.coachRxTags)) {
      importedData.coachRxTags = tags.length ? tags : existing.coachRxTags || [];
    }
    if (coachRxAssessment) {
      importedData.coachRxPortfolioStatus = coachRxAssessment.portfolioStatus;
      importedData.clientValidationStatus = existing.clientValidationStatus || coachRxAssessment.validationStatus;
      importedData.recommendedAdminAction = existing.recommendedAdminAction || coachRxAssessment.recommendedAdminAction;
      importedData.coachRxRequiresValidation = coachRxAssessment.requiresValidation;
      importedData.coachRxProgramContext = coachRxAssessment.programContext;
      importedData.coachRxValidationReasons = coachRxAssessment.validationReasons;
      diagnostics.coachRxPortfolio.rowsImported += 1;
      if (phoneNormalized || existingPhone) diagnostics.coachRxPortfolio.withPhone += 1;
      if (sourceClientId || existing.sourceClientId) diagnostics.coachRxPortfolio.withSourceClientId += 1;
      if (coachRxAssessment.requiresValidation) {
        diagnostics.coachRxPortfolio.needsValidation += 1;
        if (diagnostics.coachRxPortfolio.samplesToValidate.length < 8) {
          diagnostics.coachRxPortfolio.samplesToValidate.push({
            name,
            reason: coachRxAssessment.validationReasons.join("; "),
            recommendedAdminAction: coachRxAssessment.recommendedAdminAction
          });
        }
      }
      if (coachRxAssessment.programContext.hasProgramContext) diagnostics.coachRxPortfolio.programContextRows += 1;
      if (coachRxAssessment.programContext.exerciseSignal?.actionable) diagnostics.coachRxPortfolio.lateProgramSignals += 1;
    }

    clients.set(id, { id, data: importedData });
    indexClientMatch(matchIndex, id, importedData);
  };

  coreRows.forEach((row) => addClient(row, "core"));
  browserRows.forEach((row) => addClient(row, "coachrx"));
  const records = [...clients.values()];
  records.__diagnostics = diagnostics;
  return records;
}

function assessCoachRxPortfolioClient({
  row,
  existing = {},
  phoneNormalized,
  sourceClientId,
  membershipLabel,
  exerciseDue,
  lifestyleDue,
  exerciseCompliance,
  exerciseAlert,
  exerciseState,
  lifestyleAlert,
  lifestyleState
}) {
  const validationReasons = [];
  const existingPhone = clientPhone(existing);
  const hasPhone = Boolean(phoneNormalized || existingPhone);
  const hasSourceClientId = Boolean(sourceClientId || existing.sourceClientId);
  const hasMembership = Boolean(membershipLabel || existing.membershipLabel);
  const sharedAlert = pick(row, COACHRX_SIGNAL_ALIASES);
  const sharedState = pick(row, COACHRX_STATE_ALIASES);
  const resolvedExerciseAlert = exerciseAlert || sharedAlert;
  const resolvedExerciseState = exerciseState || sharedState;
  const resolvedLifestyleAlert = lifestyleAlert || sharedAlert;
  const resolvedLifestyleState = lifestyleState || sharedState;
  const exerciseSignal = programTaskSignal(exerciseDue, {
    alert: resolvedExerciseAlert,
    state: resolvedExerciseState,
    kind: "exercise"
  });
  const lifestyleSignal = programTaskSignal(lifestyleDue, {
    alert: resolvedLifestyleAlert,
    state: resolvedLifestyleState,
    kind: "lifestyle"
  });
  const hasProgramContext = Boolean(cleanString(exerciseDue) || cleanString(lifestyleDue) || cleanString(exerciseCompliance));

  if (!hasPhone) validationReasons.push("telephone manquant");
  if (!hasSourceClientId) validationReasons.push("ID CoachRx/source manquant");
  if (!hasMembership) validationReasons.push("membership/abonnement non confirme");
  if (hasProgramContext && !exerciseSignal.actionable && !lifestyleSignal.actionable) {
    validationReasons.push("contexte programme CoachRx informatif seulement");
  }

  const requiresValidation = !hasPhone || !hasSourceClientId || !hasMembership;
  const recommendedAdminAction = requiresValidation
    ? "Valider si ce client doit rester actif, etre archive ou deplace dans Alumni."
    : "Portefeuille CoachRx reconnu; aucune validation identite urgente.";

  return {
    portfolioStatus: "present_in_coachrx",
    validationStatus: requiresValidation ? "needs_review" : "ready",
    recommendedAdminAction,
    requiresValidation,
    validationReasons,
    programContext: {
      exerciseDue: cleanString(exerciseDue),
      lifestyleDue: cleanString(lifestyleDue),
      exerciseCompliance: cleanString(exerciseCompliance),
      alert: cleanString(sharedAlert),
      state: cleanString(sharedState),
      exerciseAlert: cleanString(resolvedExerciseAlert),
      exerciseState: cleanString(resolvedExerciseState),
      lifestyleAlert: cleanString(resolvedLifestyleAlert),
      lifestyleState: cleanString(resolvedLifestyleState),
      hasProgramContext,
      exerciseSignal,
      lifestyleSignal,
      note: hasProgramContext
        ? "Les signaux programme rouges ou jaunes dans CoachRx creent une mission; la compliance reste informative dans la fiche client."
        : ""
    }
  };
}

function buildGhlContactEnrichmentRecords({ coach, rows, existingById = new Map() }) {
  const clients = new Map();
  const matchIndex = createClientMatchIndex(existingById);
  const diagnostics = {
    ghlContacts: {
      rowsReceived: Array.isArray(rows) ? rows.length : 0,
      rowsWithoutPhone: 0,
      skippedNoExistingClientMatch: 0,
      matchedExistingClients: 0,
      matchedBy: {
        phone: 0,
        sourceClientId: 0,
        name: 0
      },
      skippedSamples: []
    }
  };

  const addSkippedSample = (row, reason) => {
    if (diagnostics.ghlContacts.skippedSamples.length >= 8) return;
    diagnostics.ghlContacts.skippedSamples.push({
      reason,
      name: cleanString(clientNameFromRow(row)).slice(0, 80),
      phone: maskPhone(pick(row, PHONE_ALIASES)),
      contactId: cleanString(pick(row, CLIENT_ID_ALIASES)).slice(0, 80)
    });
  };

  (rows || []).forEach((row) => {
    const phoneNormalized = normalizePhone(pick(row, PHONE_ALIASES));
    if (!phoneNormalized) {
      diagnostics.ghlContacts.rowsWithoutPhone += 1;
      addSkippedSample(row, "missing_phone");
      return;
    }

    const contactId = pick(row, CLIENT_ID_ALIASES);
    const name = clientNameFromRow(row);
    const email = pick(row, EMAIL_ALIASES);
    const matched = findClientMatch(matchIndex, {
      phoneNormalized,
      sourceClientId: contactId,
      name
    });

    if (!matched?.id) {
      diagnostics.ghlContacts.skippedNoExistingClientMatch += 1;
      addSkippedSample(row, "no_existing_client_match");
      return;
    }

    const existing = clients.get(matched.id)?.data || matched.data || existingById.get(matched.id) || {};
    const importedData = {
      ...existing,
      coachId: coach.id,
      coachRxId: coach.coachRxId,
      coachName: coach.name,
      name: existing.name || name || "",
      lastNameSort: lastNameSort(existing.name || name || ""),
      status: existing.status || "active",
      source: existing.source || "direct_ghl_contacts",
      phoneNormalized,
      clientPhoneNormalized: phoneNormalized,
      phoneSource: "direct_ghl_contacts",
      ghlPhoneEnrichedAt: admin.firestore.FieldValue.serverTimestamp(),
      matchedExistingClientId: matched.id,
      matchedExistingClientBy: matched.by
    };
    setIfUseful(importedData, "ghlContactId", contactId || existing.ghlContactId);
    setIfUseful(importedData, "email", email || existing.email);

    clients.set(matched.id, { id: matched.id, data: importedData });
    indexClientMatch(matchIndex, matched.id, importedData);
    diagnostics.ghlContacts.matchedExistingClients += 1;
    if (diagnostics.ghlContacts.matchedBy[matched.by] !== undefined) {
      diagnostics.ghlContacts.matchedBy[matched.by] += 1;
    }
  });

  const records = [...clients.values()];
  records.__diagnostics = diagnostics;
  return records;
}

function createClientMatchIndex(existingById = new Map()) {
  const index = {
    byPhone: new Map(),
    bySource: new Map(),
    byName: new Map()
  };
  existingById.forEach((data, id) => indexClientMatch(index, id, data));
  return index;
}

function indexClientMatch(index, id, data = {}) {
  const phone = clientPhone(data);
  const sourceClientId = cleanString(data.sourceClientId || data.clientId || data.contactId);
  const name = normalizeComparable(data.name || data.clientName || "");
  if (phone && !index.byPhone.has(phone)) index.byPhone.set(phone, { id, data, by: "phone" });
  if (sourceClientId && !index.bySource.has(sourceClientId)) index.bySource.set(sourceClientId, { id, data, by: "sourceClientId" });
  if (name && !index.byName.has(name)) index.byName.set(name, { id, data, by: "name" });
}

function findClientMatch(index, { phoneNormalized, sourceClientId, name }) {
  const phone = normalizePhone(phoneNormalized);
  const source = cleanString(sourceClientId);
  const normalizedName = normalizeComparable(name);
  return (phone && index.byPhone.get(phone))
    || (source && index.bySource.get(source))
    || (normalizedName && index.byName.get(normalizedName))
    || null;
}

function buildClientEnrichmentRecords({ coach, rows, existingById = new Map() }) {
  const clients = new Map();
  const matchIndex = createClientMatchIndex(existingById);
  const diagnostics = {
    rowsReceived: Array.isArray(rows) ? rows.length : 0,
    rowsWithoutIdentity: 0,
    skippedNoExistingClientMatch: 0,
    matchedExistingClients: 0,
    fieldsApplied: {
      phone: 0,
      email: 0,
      membership: 0,
      lastCheckup: 0,
      notes: 0,
      attendance: 0,
      levelMethod: 0
    },
    matchedBy: {
      phone: 0,
      sourceClientId: 0,
      name: 0
    },
    skippedSamples: []
  };

  const addSkippedSample = (row, reason) => {
    if (diagnostics.skippedSamples.length >= 8) return;
    diagnostics.skippedSamples.push({
      reason,
      name: cleanString(clientNameFromRow(row)).slice(0, 80),
      phone: maskPhone(pick(row, PHONE_ALIASES)),
      sourceClientId: cleanString(pick(row, CLIENT_ID_ALIASES)).slice(0, 80)
    });
  };

  (rows || []).forEach((row) => {
    const phoneNormalized = normalizePhone(pick(row, PHONE_ALIASES));
    const sourceClientId = pick(row, CLIENT_ID_ALIASES);
    const name = clientNameFromRow(row);
    if (!phoneNormalized && !sourceClientId && !name) {
      diagnostics.rowsWithoutIdentity += 1;
      addSkippedSample(row, "missing_identity");
      return;
    }

    const matched = findClientMatch(matchIndex, {
      phoneNormalized,
      sourceClientId,
      name
    });
    if (!matched?.id) {
      diagnostics.skippedNoExistingClientMatch += 1;
      addSkippedSample(row, "no_existing_client_match");
      return;
    }

    const existing = clients.get(matched.id)?.data || matched.data || existingById.get(matched.id) || {};
    const importedData = {
      ...existing,
      coachId: coach.id,
      coachRxId: coach.coachRxId,
      coachName: coach.name,
      name: existing.name || name || "",
      lastNameSort: lastNameSort(existing.name || name || ""),
      status: existing.status || "active",
      source: existing.source || "direct_csm_client_enrichment",
      matchedExistingClientId: matched.id,
      matchedExistingClientBy: matched.by,
      csmEnrichedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const email = pick(row, EMAIL_ALIASES);
    const membershipLabel = pick(row, ["membership", "active package", "active packages", "package", "abonnement", "current packages"]);
    const lastCheckupDate = pick(row, [
      "last checkup",
      "dernier checkup",
      "dernier check-up",
      "date checkup",
      "date check-up",
      "checkup date"
    ]);
    const checkupNotes = pick(row, [
      "notes importees des formulaires check-ups",
      "notes importer des formulaires check-ups",
      "notes formulaire",
      "checkup notes",
      "note"
    ]);
    const attendance30Days = optionalNonNegativeNumber(pick(row, [
      "attendance30Days",
      "attendance 30 days",
      "total attendance",
      "attendance last 30 days"
    ]));
    const attendanceWindowDays = optionalNonNegativeNumber(pick(row, ["attendanceWindowDays", "attendance window days"])) || 30;
    const classAttendance30Days = optionalNonNegativeNumber(pick(row, ["classAttendance30Days", "class attendance 30 days", "class attendance"]));
    const appointmentAttendance30Days = optionalNonNegativeNumber(pick(row, ["appointmentAttendance30Days", "appointment attendance 30 days", "appointment attendance"]));
    const importedEventAttendance30Days = optionalNonNegativeNumber(pick(row, ["importedEventAttendance30Days", "imported event attendance 30 days", "imported event attendance"]));
    const levelMethodOverall = pick(row, ["levelMethodOverall", "level method overall", "overall level", "level method"]);
    const levelMethodLevelsLogged = optionalNonNegativeNumber(pick(row, ["levelMethodLevelsLogged", "level method levels logged", "levels logged"]));

    if (phoneNormalized && !clientPhone(existing)) {
      importedData.phoneNormalized = phoneNormalized;
      importedData.clientPhoneNormalized = phoneNormalized;
      importedData.phoneSource = "direct_csm_client_enrichment";
      diagnostics.fieldsApplied.phone += 1;
    }
    if (email && !cleanString(existing.email)) {
      importedData.email = email;
      diagnostics.fieldsApplied.email += 1;
    }
    if (applyMembershipIfTrusted(importedData, {
      membershipLabel,
      incomingSource: "direct_csm_client_enrichment",
      existing
    })) {
      importedData.membershipLabel = membershipLabel;
      diagnostics.fieldsApplied.membership += 1;
    }
    if (lastCheckupDate && !cleanString(existing.lastCheckupDate)) {
      importedData.lastCheckupDate = lastCheckupDate;
      diagnostics.fieldsApplied.lastCheckup += 1;
    }
    if (checkupNotes && !cleanString(existing.lastCheckupNote)) {
      importedData.lastCheckupNote = checkupNotes;
      diagnostics.fieldsApplied.notes += 1;
    }
    if (attendance30Days !== null) {
      importedData.attendance30Days = attendance30Days;
      importedData.attendanceWindowDays = attendanceWindowDays;
      importedData.attendanceSource = "csm_low_attendances";
      importedData.attendanceImportedAt = admin.firestore.FieldValue.serverTimestamp();
      if (classAttendance30Days !== null) importedData.classAttendance30Days = classAttendance30Days;
      if (appointmentAttendance30Days !== null) importedData.appointmentAttendance30Days = appointmentAttendance30Days;
      if (importedEventAttendance30Days !== null) importedData.importedEventAttendance30Days = importedEventAttendance30Days;
      diagnostics.fieldsApplied.attendance += 1;
    }
    if (levelMethodOverall) {
      importedData.levelMethodOverall = levelMethodOverall;
      importedData.levelMethodSource = "csm_lm";
      importedData.levelMethodImportedAt = admin.firestore.FieldValue.serverTimestamp();
      if (levelMethodLevelsLogged !== null) importedData.levelMethodLevelsLogged = levelMethodLevelsLogged;
      diagnostics.fieldsApplied.levelMethod += 1;
    }

    clients.set(matched.id, { id: matched.id, data: importedData });
    indexClientMatch(matchIndex, matched.id, importedData);
    diagnostics.matchedExistingClients += 1;
    if (diagnostics.matchedBy[matched.by] !== undefined) {
      diagnostics.matchedBy[matched.by] += 1;
    }
  });

  const records = [...clients.values()];
  records.__diagnostics = diagnostics;
  return records;
}

function collectStaleImportedDocs({ snap, currentIds, protectedSources = new Set() }) {
  const stale = [];
  snap.forEach((docSnap) => {
    if (currentIds.has(docSnap.id)) return;
    const data = docSnap.data() || {};
    if (data.linkedFromManual) return;
    if (protectedSources.has(cleanString(data.source))) return;
    if (data.sourceStale === true) return;
    if (["removed", "archived", "alumni", "do_not_contact", "import_stale"].includes(cleanString(data.status))) return;
    if (!isImportedSheetSource(data.source)) return;
    stale.push({ id: docSnap.id, data });
  });
  return stale;
}

function collectStaleImportedMapDocs({
  existingById = new Map(),
  currentIds = new Set(),
  protectedSources = new Set(),
  candidateSources = new Set()
}) {
  if (!candidateSources.size) return [];
  const stale = [];
  existingById.forEach((data = {}, id) => {
    if (currentIds.has(id)) return;
    if (data.linkedFromManual) return;
    const source = cleanString(data.source);
    if (protectedSources.has(source)) return;
    if (candidateSources.size && !candidateSources.has(source)) return;
    if (data.sourceStale === true) return;
    if (["removed", "archived", "alumni", "do_not_contact", "import_stale"].includes(cleanString(data.status))) return;
    if (!isImportedSheetSource(source)) return;
    stale.push({ id, data });
  });
  return stale;
}

async function markStaleImportedRecords({ collectionName, records = [], staleReason }) {
  if (!records.length) return 0;
  const batchLimit = 450;
  let batch = db.batch();
  let ops = 0;
  let written = 0;
  const commitIfNeeded = async (force = false) => {
    if (!ops) return;
    if (!force && ops < batchLimit) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const record of records) {
    if (!record?.id) continue;
    const ref = db.collection(collectionName).doc(record.id);
    batch.set(ref, {
      status: "import_stale",
      sourceStale: true,
      staleReason: staleReason || "Absent de la derniere synchronisation.",
      staleAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    ops += 1;
    written += 1;
    await commitIfNeeded();
  }
  await commitIfNeeded(true);
  return written;
}

function isImportedSheetSource(source) {
  const clean = cleanString(source);
  return clean.startsWith("google_sheets_")
    || clean.startsWith("direct_")
    || clean.startsWith("firebase_function_sync_sheets")
    || clean === "coachrx_visible_snapshot"
    || clean === "coachrx_exercise_due";
}

function buildTaskRecords({ coach, taskRows, clients, browserRows, existingById = new Map() }) {
  const tasks = new Map();
  const clientByName = new Map(clients.map((client) => [normalizeComparable(client.data.name), client]));
  const addTask = ({ key, client, type, title, description, priority, dueAt, source, sourceEventId = "", sourceSignal = {} }) => {
    const id = `${coach.id}_${slugify(key)}`;
    const existing = existingById.get(id) || {};
    const existingClosed = ["done", "ignored", "archived"].includes(existing.status);
    const data = {
      coachId: coach.id,
      coachName: coach.name,
      clientId: client?.id || "",
      clientName: client?.data?.name || "",
      type,
      title,
      description,
      priority,
      priorityRank: priorityRank(priority),
      dueAt: dueAt || "",
      status: existingClosed ? existing.status : "open",
      source,
      sourceEventId: sourceEventId || existing.sourceEventId || "",
      sourceSignal,
      createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp()
    };
    if (existingClosed && existing.completedAt) data.completedAt = existing.completedAt;
    if (existingClosed && existing.ignoredAt) data.ignoredAt = existing.ignoredAt;
    tasks.set(id, { id, data });
  };

  taskRows.forEach((row, index) => {
    const sourceTitle = pick(row, ["title", "titre", "task", "tache", "action", "mission"]);
    const clientName = clientNameFromRow(row);
    const client = clientByName.get(normalizeComparable(clientName));
    const type = inferImportedTaskType(normalizeTaskType(pick(row, ["type", "categorie", "category"])), sourceTitle);
    if (!sourceTitle && !clientName) return;
    if (isObviousJunkTaskTitle(sourceTitle) && !clientName) return;
    const title = normalizeImportedTaskTitle({ title: sourceTitle, type, clientName });
    const description = pick(row, ["description", "details", "note", "raison"]) || defaultImportedTaskDescription({ title, type });
    addTask({
      key: `sheet-task-${pick(row, ["id", "task id"]) || index}-${title}-${clientName}`,
      client,
      type,
      title: title || defaultTaskTitle(type),
      description,
      priority: normalizePriority(pick(row, ["priority", "priorite", "priorité"])) || "P2",
      dueAt: pick(row, ["due", "due date", "date", "echeance", "échéance"]) || "",
      source: "google_sheets_tasks_current"
    });
  });

  clients.forEach((client) => {
    const context = client.data?.coachRxProgramContext || {};
    addCoachRxProgramTask({
      addTask,
      coach,
      client,
      kind: "exercise",
      signal: context.exerciseSignal,
      dueLabel: context.exerciseDue
    });
    addCoachRxProgramTask({
      addTask,
      coach,
      client,
      kind: "lifestyle",
      signal: context.lifestyleSignal,
      dueLabel: context.lifestyleDue
    });
  });

  return [...tasks.values()];
}

function addCoachRxProgramTask({ addTask, coach, client, kind, signal = {}, dueLabel = "" }) {
  if (!signal?.actionable) return;
  const clientName = client?.data?.name || "Client";
  const label = kind === "lifestyle" ? "lifestyle" : "exercice";
  const severity = signal.severity || (signal.isLate ? "red" : "yellow");
  const priority = severity === "red" ? "P1" : "P2";
  const dueText = cleanString(dueLabel || signal.raw || "");
  const action = severity === "red" ? "est en retard" : "arrive a echeance";
  addTask({
    key: `coachrx-program-${kind}-${client?.id || clientName}-${dueText || signal.dueAt || severity}`,
    client,
    type: "program",
    title: `Mettre a jour le programme ${label}`,
    description: `${clientName}: le programme ${label} ${action} dans CoachRx${dueText ? ` (${dueText})` : ""}. Verifier CoachRx, ajuster le suivi au besoin, puis fermer la mission.`,
    priority,
    dueAt: signal.dueAt || todayIsoDate(),
    source: "coachrx_exercise_due",
    sourceEventId: `${coach.id}:${client?.id || slugify(clientName)}:${kind}:${slugify(dueText || signal.dueAt || severity)}`,
    sourceSignal: {
      system: "CoachRx",
      kind,
      severity,
      raw: dueText,
      dueAt: signal.dueAt || "",
      isLate: Boolean(signal.isLate)
    }
  });
}

function inferImportedTaskType(type, title) {
  const clean = keyOf(title);
  if (clean.includes("deciderquoifaireavecceclientcoachrx")) return "validation";
  if (clean.includes("rebookerseance")) return "rebooking";
  if (clean.includes("questionnaire")) return "questionnaire_followup";
  if (clean.includes("programme") || clean.includes("program")) return "program";
  return type || "manual";
}

function normalizeImportedTaskTitle({ title, type }) {
  const raw = cleanString(title);
  const clean = keyOf(raw);
  if (type === "validation" || clean.includes("deciderquoifaireavecceclientcoachrx")) {
    return "Confirmer le statut du client";
  }
  if (type === "rebooking" || clean.includes("rebookerseance")) {
    return "Rebooker la seance semi-privee";
  }
  if (clean.includes("declarerlesimpacts")) {
    return "Declarer les impacts de la semaine";
  }
  if (clean.includes("verifierlacompliance")) {
    return "Verifier la compliance exercice";
  }
  return raw;
}

function defaultImportedTaskDescription({ title, type }) {
  const clean = keyOf(title);
  if (type === "validation") {
    return "Confirmer si ce client doit rester actif, etre masque ou etre reclasse.";
  }
  if (type === "rebooking") {
    return "Verifier la seance a remettre, puis traiter le suivi dans le module Rebooking.";
  }
  if (clean.includes("declarerlesimpacts")) {
    return "Ajouter les nouveaux revenus generes cette semaine dans Performance, puis fermer la tache.";
  }
  if (clean.includes("compliance")) {
    return "Verifier si le client respecte le suivi prevu et creer une action concrete au besoin.";
  }
  return "";
}

function taskImportDiagnostics({ explicitTasks = [], questionnaireTasks = [], taskRows = [], sourceTaskRows = [] }) {
  const all = [...explicitTasks, ...questionnaireTasks].map((task) => task.data || {});
  const byType = {};
  const bySource = {};
  all.forEach((task) => {
    const type = task.type || "unknown";
    const source = task.source || "unknown";
    byType[type] = (byType[type] || 0) + 1;
    bySource[source] = (bySource[source] || 0) + 1;
  });
  return {
    total: all.length,
    explicitTaskRowsMatched: taskRows.length,
    sourceTaskRowsAvailable: sourceTaskRows.length,
    byType,
    bySource,
    programTasksFromExplicitSource: explicitTasks.filter((task) => task.data?.type === "program").length,
    questionnaireTasks: questionnaireTasks.length,
    sampleProgramTasks: explicitTasks
      .filter((task) => task.data?.type === "program")
      .slice(0, 5)
      .map((task) => ({
        title: task.data.title || "",
        clientName: task.data.clientName || "",
        source: task.data.source || ""
      }))
  };
}

function rebookingImportDiagnostics({ rebookings = [], taskRows = [], rebookingRows = [], sourceRebookingRows = [] }) {
  const all = rebookings.map((rebooking) => rebooking.data || {});
  const byStatus = {};
  const bySource = {};
  const byMatchMethod = {};
  all.forEach((rebooking) => {
    const status = rebooking.status || "unknown";
    const source = rebooking.source || "unknown";
    const matchMethod = rebooking.matchMethod || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
    bySource[source] = (bySource[source] || 0) + 1;
    byMatchMethod[matchMethod] = (byMatchMethod[matchMethod] || 0) + 1;
  });
  const closedStatuses = new Set(["managed", "rebooked", "coach_absence", "archived"]);
  const sourceRowsWithPhone = countRowsWithClientPhone(rebookingRows);
  const taskRowsWithPhone = countRowsWithClientPhone(taskRows);
  return {
    total: all.length,
    sourceRowsAvailable: sourceRebookingRows.length,
    sourceRowsMatched: rebookingRows.length,
    taskRowsMatched: taskRows.length,
    sourceRowsWithPhone,
    taskRowsWithPhone,
    sourceRowsWithoutPhone: Math.max(0, rebookingRows.length - sourceRowsWithPhone),
    taskRowsWithoutPhone: Math.max(0, taskRows.length - taskRowsWithPhone),
    byStatus,
    bySource,
    byMatchMethod,
    importedFromDedicatedSource: bySource.google_sheets_rebooking_semiprive || 0,
    importedFromTaskSource: bySource.google_sheets_tasks_current || 0,
    open: byStatus.open || 0,
    treated: all.filter((rebooking) => closedStatuses.has(rebooking.status)).length,
    missingClientId: all.filter((rebooking) => !cleanString(rebooking.clientId)).length,
    openMissingClientId: all.filter((rebooking) =>
      (rebooking.status || "open") === "open" && !cleanString(rebooking.clientId)
    ).length,
    missingPhone: all.filter((rebooking) => !cleanString(rebooking.clientPhoneNormalized)).length,
    protectedStatusKept: all.filter((rebooking) =>
      rebooking.status && rebooking.sourceStatus && rebooking.status !== rebooking.sourceStatus
    ).length,
    sampleOpen: all
      .filter((rebooking) => (rebooking.status || "open") === "open")
      .slice(0, 5)
      .map((rebooking) => ({
        clientName: rebooking.clientName || "",
        clientId: rebooking.clientId || "",
        clientPhoneNormalized: rebooking.clientPhoneNormalized || "",
        sessionsToRebook: rebooking.sessionsToRebook || 1,
        source: rebooking.source || "",
        matchMethod: rebooking.matchMethod || "",
        appointmentAt: rebooking.appointmentAt || "",
        detectedAt: rebooking.detectedAt || ""
      }))
  };
}

function isObviousJunkTaskTitle(value) {
  const raw = cleanString(value);
  if (!raw) return false;
  const clean = keyOf(raw);
  if (!clean) return false;
  if (/^(.)\1{3,}$/.test(clean)) return true;
  return new Set([
    "asdf",
    "asdfg",
    "qwerty",
    "dfghj",
    "test",
    "testing",
    "lorem",
    "loremipsum"
  ]).has(clean);
}

function programTaskSignal(value, options = {}) {
  const raw = cleanString(value);
  const alertText = cleanString(options.alert);
  const stateText = cleanString(options.state);
  const colorSignal = programColorSignal(`${alertText} ${stateText} ${raw}`);
  if (!raw && !colorSignal.actionable) return { actionable: false };
  const comparable = keyOf(raw);
  if (/notset|n\/a|aucun|none|no|jamais/.test(comparable)) return { actionable: false };
  if (colorSignal.actionable) {
    return {
      actionable: true,
      isLate: colorSignal.severity === "red",
      severity: colorSignal.severity,
      raw,
      dueAt: programSignalDueAt(raw)
    };
  }
  if (/overdue|pastdue|retard|enretard|hier|yesterday|last/.test(comparable)) {
    return { actionable: true, isLate: true, severity: "red", raw };
  }
  if (/maintenant|now|today|aujourdhui|aujourd'hui/.test(comparable)) {
    return { actionable: true, isLate: false, severity: "yellow", raw, dueAt: todayIsoDate() };
  }
  const dueDate = parseLooseDueDate(raw);
  if (!dueDate) return { actionable: false };
  const today = startOfDay(new Date());
  const due = startOfDay(dueDate);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (isWeekdayOnlyDueLabel(raw) && diffDays > 2) {
    return {
      actionable: false,
      isLate: false,
      raw,
      dueAt: due.toISOString().slice(0, 10)
    };
  }
  if (diffDays > 7) {
    return {
      actionable: false,
      isLate: false,
      raw,
      dueAt: due.toISOString().slice(0, 10)
    };
  }
  if (diffDays >= 0) {
    return {
      actionable: true,
      isLate: false,
      severity: "yellow",
      raw,
      dueAt: due.toISOString().slice(0, 10)
    };
  }
  return {
    actionable: true,
    isLate: true,
    severity: "red",
    raw,
    dueAt: due.toISOString().slice(0, 10)
  };
}

function programColorSignal(value) {
  const clean = keyOf(value);
  if (!clean) return { actionable: false };
  if (/red|rouge|danger|late|overdue|pastdue|retard|enretard|urgent/.test(clean)) {
    return { actionable: true, severity: "red" };
  }
  if (/yellow|jaune|warning|warn|attention|soon|duesoon|bientot|bientot|proche|orange|amber|gold|pending|invitepending/.test(clean)) {
    return { actionable: true, severity: "yellow" };
  }
  return { actionable: false };
}

function programSignalDueAt(raw) {
  if (/maintenant|now|today|aujourdhui|aujourd'hui/i.test(cleanString(raw))) return todayIsoDate();
  const dueDate = parseLooseDueDate(raw);
  return dueDate ? startOfDay(dueDate).toISOString().slice(0, 10) : "";
}

function parseLooseDueDate(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const weekdayDate = parseWeekdayOnlyDueDate(raw);
  if (weekdayDate) return weekdayDate;
  const normalized = raw
    .replace(/\b(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b\.?,?\s*/i, "")
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
    .trim();
  const months = {
    jan: 0, janvier: 0,
    feb: 1, fev: 1, fevr: 1, fevrier: 1, février: 1,
    mar: 2, mars: 2,
    apr: 3, avr: 3, avril: 3,
    may: 4, mai: 4,
    jun: 5, juin: 5,
    jul: 6, juillet: 6,
    aug: 7, aout: 7, août: 7,
    sep: 8, sept: 8, septembre: 8,
    oct: 9, octobre: 9,
    nov: 10, novembre: 10,
    dec: 11, decembre: 11, décembre: 11
  };
  const match = normalized.match(/\b([A-Za-zÀ-ÿ]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i)
    || normalized.match(/\b(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,9})\.?(?:\s+(\d{4}))?\b/i);
  if (!match) return null;
  const monthToken = Number.isNaN(Number(match[1])) ? match[1] : match[2];
  const dayToken = Number.isNaN(Number(match[1])) ? match[2] : match[1];
  const yearToken = match[3] || new Date().getFullYear();
  const month = months[keyOf(monthToken)];
  const day = Number(dayToken);
  const year = Number(yearToken);
  if (month === undefined || !day || !year) return null;
  const parsed = new Date(year, month, day);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  if (/\b\d{4}\b/.test(normalized) || /^\d{4}-\d{1,2}-\d{1,2}/.test(normalized)) {
    const direct = new Date(normalized);
    if (!Number.isNaN(direct.getTime())) return direct;
  }
  return null;
}

function isWeekdayOnlyDueLabel(value) {
  return /^(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)$/i.test(cleanString(value));
}

function parseWeekdayOnlyDueDate(value) {
  const raw = cleanString(value).toLowerCase();
  const weekdays = {
    sun: 0, sunday: 0,
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6
  };
  if (!(raw in weekdays)) return null;
  const today = startOfDay(new Date());
  const current = today.getDay();
  const target = weekdays[raw];
  const diff = (target - current + 7) % 7;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function todayIsoDate() {
  return startOfDay(new Date()).toISOString().slice(0, 10);
}

function nextQuestionnaireScheduleDate(frequency, fromIso) {
  if (frequency === "once") return "";
  const base = parseIsoDate(fromIso) || startOfDay(new Date());
  if (frequency === "weekly") {
    base.setDate(base.getDate() + 7);
    return base.toISOString().slice(0, 10);
  }
  if (frequency === "every_2_weeks") {
    base.setDate(base.getDate() + 14);
    return base.toISOString().slice(0, 10);
  }
  if (frequency === "every_4_weeks") {
    base.setDate(base.getDate() + 28);
    return base.toISOString().slice(0, 10);
  }
  if (frequency === "quarterly") {
    base.setMonth(base.getMonth() + 3);
    return base.toISOString().slice(0, 10);
  }
  base.setMonth(base.getMonth() + 1);
  return base.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  const clean = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const [year, month, day] = clean.split("-").map(Number);
  return startOfDay(new Date(year, month - 1, day));
}

function protectedManualRebookingLink(existing = {}) {
  return cleanString(existing.clientId) && existing.matchMethod === "manual_client";
}

function resolveRebookingClientLink({ existing = {}, client, clientByPhoneMatch, clientByNameMatch, clientName, phone }) {
  if (protectedManualRebookingLink(existing)) {
    return {
      clientId: existing.clientId || "",
      clientName: existing.clientName || clientName || "Client a valider",
      clientPhoneNormalized: existing.clientPhoneNormalized || "",
      matchMethod: "manual_client"
    };
  }

  return {
    clientId: client?.id || existing.clientId || "",
    clientName: client?.data?.name || clientName || existing.clientName || "Client a valider",
    clientPhoneNormalized: phone || clientPhone(client?.data) || existing.clientPhoneNormalized || "",
    matchMethod: clientByPhoneMatch ? "phone" : clientByNameMatch ? "name" : existing.clientId ? "existing" : "unmatched"
  };
}

function uniqueClientByNameMap(clients = []) {
  const buckets = new Map();
  clients.forEach((client) => {
    const key = normalizeComparable(client?.data?.name);
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(client);
  });
  const unique = new Map();
  buckets.forEach((matches, key) => {
    if (matches.length === 1) unique.set(key, matches[0]);
  });
  return unique;
}

function csvValues(value) {
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
  return cleanString(value)
    .split(",")
    .map(cleanString)
    .filter(Boolean);
}

function rebookingRowSessions(row) {
  return Math.max(1, Number(pick(row, ["sessions to rebook", "sessions", "seances", "séances", "nb seances"]) || 1));
}

function setRowValue(row, key, value) {
  row[keyOf(key)] = value;
}

function groupOpenRebookingRowsByClientName(rows = []) {
  const output = [];
  const groups = new Map();
  rows.forEach((row, index) => {
    const importedStatus = normalizeRebookingStatus(pick(row, ["status", "statut", "etat", "state"])) || "open";
    if (importedStatus !== "open") {
      output.push(row);
      return;
    }

    const clientName = clientNameFromRow(row);
    const nameKey = normalizeComparable(clientName);
    if (!nameKey) {
      output.push(row);
      return;
    }

    const phone = normalizePhone(pick(row, PHONE_ALIASES));
    const groupKey = phone ? `phone:${phone}` : `name:${nameKey}`;
    const sourceId = pick(row, ["event id", "id", "rebooking id", "source id"]);
    const sourceIds = sourceId ? [sourceId] : [];
    const sessions = rebookingRowSessions(row);
    const existing = groups.get(groupKey);

    if (!existing) {
      const groupedRow = { ...row };
      setRowValue(groupedRow, "event id", `group_${slugify(clientName || groupKey)}_${index}`);
      setRowValue(groupedRow, "source event ids", sourceIds.join(","));
      setRowValue(groupedRow, "grouped source count", "1");
      setRowValue(groupedRow, "sessions to rebook", String(sessions));
      groups.set(groupKey, {
        row: groupedRow,
        sourceIds,
        sourceCount: 1,
        sessions
      });
      output.push(groupedRow);
      return;
    }

    existing.sourceCount += 1;
    existing.sessions += sessions;
    if (sourceId) existing.sourceIds.push(sourceId);
    setRowValue(existing.row, "source event ids", [...new Set(existing.sourceIds)].join(","));
    setRowValue(existing.row, "grouped source count", String(existing.sourceCount));
    setRowValue(existing.row, "sessions to rebook", String(existing.sessions));
  });
  return output;
}

function buildRebookingRecords({ coach, taskRows, rebookingRows = [], clients, existingById, groupOpenByClientName = false }) {
  const rebookings = new Map();
  const clientByName = uniqueClientByNameMap(clients);
  const clientByPhone = new Map();
  clients.forEach((client) => {
    const phone = clientPhone(client.data);
    if (phone) clientByPhone.set(phone, client);
  });

  taskRows.forEach((row, index) => {
    if (!rowLooksLikeRebooking(row)) return;
    const clientName = clientNameFromRow(row);
    const phone = normalizePhone(pick(row, PHONE_ALIASES));
    const clientByPhoneMatch = phone && clientByPhone.get(phone);
    const clientByNameMatch = clientByName.get(normalizeComparable(clientName));
    const client = clientByPhoneMatch || clientByNameMatch;
    const detectedAt = pick(row, ["detected_at", "detected at", "date", "due", "due date", "echeance", "échéance"]) || "";
    const sourceId = pick(row, ["id", "task id", "rebooking id", "source id"]);
    const stable = sourceId || `${client?.id || phone || clientName || "rebooking"}-${detectedAt || index}`;
    const id = `${coach.id}_rebooking_${slugify(stable)}`;
    const existing = existingById.get(id) || {};
    const importedStatus = normalizeRebookingStatus(pick(row, ["status", "statut", "etat", "state"])) || "open";
    const protectedStatus = existing.status && existing.status !== "open";
    const clientLink = resolveRebookingClientLink({
      existing,
      client,
      clientByPhoneMatch,
      clientByNameMatch,
      clientName,
      phone
    });

    rebookings.set(id, {
      id,
      data: {
        coachId: coach.id,
        coachName: coach.name,
        clientId: clientLink.clientId,
        clientName: clientLink.clientName,
        clientPhoneNormalized: clientLink.clientPhoneNormalized,
        sessionsToRebook: Number(pick(row, ["sessions to rebook", "sessions", "seances", "séances", "nb seances"]) || existing.sessionsToRebook || 1),
        status: protectedStatus ? existing.status : importedStatus,
        detectedAt: detectedAt || existing.detectedAt || "",
        note: pick(row, ["note", "notes", "details", "description", "raison"]) || existing.note || "",
        sourceStatus: importedStatus,
        source: "google_sheets_tasks_current",
        sourceEventId: sourceId || existing.sourceEventId || "",
        matchMethod: clientLink.matchMethod,
        sourceRowHasPhone: Boolean(phone),
        sourceRowHasEventId: Boolean(sourceId || existing.sourceEventId),
        manuallyLinkedAt: existing.manuallyLinkedAt || "",
        manuallyLinkedBy: existing.manuallyLinkedBy || "",
        manualLinkNote: existing.manualLinkNote || "",
        history: Array.isArray(existing.history) ? existing.history : [],
        createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp()
      }
    });
  });

  const sourceRows = groupOpenByClientName
    ? groupOpenRebookingRowsByClientName(rebookingRows)
    : rebookingRows;

  sourceRows.forEach((row, index) => {
    const clientName = clientNameFromRow(row);
    const phone = normalizePhone(pick(row, PHONE_ALIASES));
    const clientByPhoneMatch = phone && clientByPhone.get(phone);
    const clientByNameMatch = clientByName.get(normalizeComparable(clientName));
    const client = clientByPhoneMatch || clientByNameMatch;
    const detectedAt = pick(row, ["recu a", "recu", "detected_at", "detected at", "date"]) || "";
    const appointmentAt = pick(row, ["debut rdv", "debut", "appointment", "appointment at", "event start", "start"]);
    const service = pick(row, ["service", "type service"]);
    const sourceId = pick(row, ["event id", "id", "rebooking id", "source id"]);
    const groupedSourceIds = csvValues(pick(row, ["source event ids", "event ids", "source ids"]));
    const groupedCount = Number(pick(row, ["grouped source count", "source count", "event count"]) || 0);
    const stable = sourceId || `${client?.id || phone || clientName || "rebooking"}-${appointmentAt || detectedAt || index}`;
    const id = `${coach.id}_rebooking_${slugify(stable)}`;
    const existing = existingById.get(id) || {};
    const importedStatus = normalizeRebookingStatus(pick(row, ["status", "statut", "etat", "state"])) || "open";
    const protectedStatus = existing.status && existing.status !== "open";
    const clientLink = resolveRebookingClientLink({
      existing,
      client,
      clientByPhoneMatch,
      clientByNameMatch,
      clientName,
      phone
    });

    rebookings.set(id, {
      id,
      data: {
        coachId: coach.id,
        coachName: coach.name,
        clientId: clientLink.clientId,
        clientName: clientLink.clientName,
        clientPhoneNormalized: clientLink.clientPhoneNormalized,
        sessionsToRebook: Number(pick(row, ["sessions to rebook", "sessions", "seances", "nb seances"]) || existing.sessionsToRebook || 1),
        status: protectedStatus ? existing.status : importedStatus,
        detectedAt: detectedAt || existing.detectedAt || "",
        appointmentAt: appointmentAt || existing.appointmentAt || "",
        service: service || existing.service || "",
        note: pick(row, ["note", "notes", "details", "description", "raison"]) || existing.note || "",
        sourceStatus: importedStatus,
        source: "google_sheets_rebooking_semiprive",
        sourceEventId: sourceId || existing.sourceEventId || "",
        sourceEventIds: groupedSourceIds.length ? groupedSourceIds : existing.sourceEventIds || [],
        groupedSourceCount: groupedCount || existing.groupedSourceCount || 1,
        sourceRebookEventId: pick(row, ["rebook event id", "rebook id", "rebooking event id"]) || existing.sourceRebookEventId || "",
        sourceNewAppointmentAt: pick(row, ["new appointment", "nouveau rdv", "nouveau rendez vous", "nouveau rendez-vous"]) || existing.sourceNewAppointmentAt || "",
        sourceClosedAt: pick(row, ["closed at", "ferme a", "fermé à", "closed date"]) || existing.sourceClosedAt || "",
        sourceClosedBy: pick(row, ["closed by", "ferme par", "fermé par"]) || existing.sourceClosedBy || "",
        sourceClosureReason: pick(row, ["closure reason", "raison fermeture", "close reason"]) || existing.sourceClosureReason || "",
        sourceClosureNote: pick(row, ["closure note", "note fermeture", "close note"]) || existing.sourceClosureNote || "",
        matchMethod: clientLink.matchMethod,
        sourceRowHasPhone: Boolean(phone),
        sourceRowHasEventId: Boolean(sourceId || existing.sourceEventId),
        manuallyLinkedAt: existing.manuallyLinkedAt || "",
        manuallyLinkedBy: existing.manuallyLinkedBy || "",
        manualLinkNote: existing.manualLinkNote || "",
        history: Array.isArray(existing.history) ? existing.history : [],
        createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp()
      }
    });
  });

  return [...rebookings.values()];
}

function buildCheckupRecords({ coach, rows, clients, stableIdMode = "date" }) {
  const checkups = new Map();
  const clientByPhone = new Map();
  const clientByName = new Map(clients.map((client) => [normalizeComparable(client.data.name), client]));
  clients.forEach((client) => {
    const phone = clientPhone(client.data);
    if (phone) clientByPhone.set(phone, client);
  });

  rows.forEach((row, index) => {
    const phone = normalizePhone(pick(row, PHONE_ALIASES));
    const clientName = clientNameFromRow(row);
    const client = (phone && clientByPhone.get(phone)) || clientByName.get(normalizeComparable(clientName));
    const checkupDate = pick(row, [
      "checkupAt",
      "checkup_at",
      "checkup at",
      "submitted_at",
      "submitted at",
      "timestamp",
      "date",
      "checkup date",
      "date checkup",
      "date check-up",
      "date du checkup",
      "date du check-up"
    ]);
    const sourceId = pick(row, ["id", "response_id", "submission_id"]);
    const stableSuffix = stableIdMode === "row_index" ? index : (checkupDate || index);
    const stable = sourceId || `${client?.id || phone || clientName || coach.id}-${stableSuffix}`;
    const id = `${coach.id}_checkup_${slugify(stable)}`;
    checkups.set(id, {
      id,
      data: {
        coachId: coach.id,
        coachName: coach.name,
        clientId: client?.id || "",
        clientName: client?.data?.name || clientName || "",
        clientPhoneNormalized: phone || clientPhone(client?.data) || "",
        checkupDate: checkupDate || "",
        sourceTab: pick(row, ["source_checkup_tab"]) || "",
        summary: pick(row, ["summary", "resume", "résumé", "note", "notes", "commentaire", "comments"]) || "",
        source: "google_sheets_csm_checkups",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });
  });

  return [...checkups.values()];
}

function buildImpactRecords({ coach, rows, clients, existingById }) {
  const impacts = new Map();
  const clientByName = new Map(clients.map((client) => [normalizeComparable(client.data.name), client]));
  rows.forEach((row, index) => {
    const clientName = clientNameFromRow(row)
      || pick(row, ["client potentiel", "prospect", "nom prospect", "member", "membre"]);
    const client = clientByName.get(normalizeComparable(clientName));
    const impactDate = pick(row, ["impact date", "date impact", "date", "created at", "created_at"]) || "";
    const serviceType = pick(row, ["service", "service type", "type service", "nouveau service", "package", "membership"]) || "";
    const amount = pick(row, ["amount", "montant", "revenu", "revenue", "valeur"]) || "";
    const sourceId = pick(row, ["id", "impact id", "opportunity id", "source id"]) || `${clientName}-${impactDate}-${serviceType}-${index}`;
    const id = `${coach.id}_impact_${slugify(sourceId)}`;
    const existing = existingById.get(id) || {};
    const importedStatus = normalizeImpactStatus(pick(row, ["status", "statut", "etat", "state"])) || existing.status || "draft";
    impacts.set(id, {
      id,
      data: {
        coachId: coach.id,
        coachName: coach.name,
        clientId: client?.id || existing.clientId || "",
        clientName: client?.data?.name || clientName || existing.clientName || "Impact a valider",
        serviceType: serviceType || existing.serviceType || "Nouveau revenu",
        amount: amount || existing.amount || "",
        status: existing.status && existing.status !== "draft" ? existing.status : importedStatus,
        impactDate: impactDate || existing.impactDate || "",
        note: pick(row, ["note", "notes", "details", "description"]) || existing.note || "",
        source: "google_sheets_impacts",
        createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp()
      }
    });
  });
  return [...impacts.values()];
}

function buildAlumniRecords({ coach, rows, existingById }) {
  const alumni = new Map();
  rows.forEach((row, index) => {
    const name = clientNameFromRow(row) || pick(row, ["alumni", "ancien client", "nom alumni"]);
    const phone = normalizePhone(pick(row, PHONE_ALIASES));
    const sourceId = pick(row, ["id", "client key", "client id", "source id"]) || phone || `${name}-${index}`;
    if (!name && !phone) return;
    const id = `${coach.id}_alumni_${slugify(sourceId)}`;
    const existing = existingById.get(id) || {};
    const importedStatus = normalizeAlumniStatus(pick(row, ["status", "statut", "etat", "dashboard status"])) || existing.status || "to_work";
    alumni.set(id, {
      id,
      data: {
        coachId: coach.id,
        coachName: coach.name,
        name: name || existing.name || "Alumni a valider",
        phoneNormalized: phone || existing.phoneNormalized || "",
        email: pick(row, EMAIL_ALIASES) || existing.email || "",
        status: existing.status && existing.status !== "to_work" ? existing.status : importedStatus,
        nextFollowupAt: pick(row, ["next followup", "next followup at", "relance", "prochaine relance"]) || existing.nextFollowupAt || "",
        note: pick(row, ["note", "notes", "details", "description", "raison"]) || existing.note || "",
        source: "google_sheets_alumni",
        createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp()
      }
    });
  });
  return [...alumni.values()];
}

function parseQuestionnaireRawPayload(row) {
  const rawValue = row?.[keyOf("raw_payload_json")]
    ?? row?.[keyOf("raw payload json")]
    ?? row?.[keyOf("payload_json")]
    ?? row?.[keyOf("payload json")]
    ?? "";
  if (!rawValue) return {};
  if (typeof rawValue === "object" && !Array.isArray(rawValue)) return rawValue;

  let parsed = rawValue;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (typeof parsed !== "string") break;
    const text = parsed.trim();
    if (!text || (!text.startsWith("{") && !text.startsWith("["))) return {};
    try {
      parsed = JSON.parse(text);
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function addQuestionnaireObjectFields(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return;
  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "object" && !Array.isArray(value)) return;
    target[keyOf(key)] = value;
  });
}

function expandQuestionnaireRow(row) {
  if (!row || typeof row !== "object") return {};
  const rawPayload = parseQuestionnaireRawPayload(row);
  if (!Object.keys(rawPayload).length) return row;

  const expanded = {};
  addQuestionnaireObjectFields(expanded, rawPayload);
  addQuestionnaireObjectFields(expanded, rawPayload.answers);
  addQuestionnaireObjectFields(expanded, rawPayload.meta);
  addQuestionnaireObjectFields(expanded, rawPayload.triage);

  const setRawField = (key, value) => {
    if (value !== undefined && value !== null && cleanString(value) !== "") {
      expanded[keyOf(key)] = value;
    }
  };
  setRawField("questionnaire_type", rawPayload.questionnaire_type || rawPayload.answers?.questionnaire_type || rawPayload.meta?.questionnaire_type);
  setRawField("questionnaire_label", rawPayload.questionnaire_label || rawPayload.answers?.questionnaire_label);
  setRawField("triage_status", rawPayload.triage_status || rawPayload.triage?.status);
  setRawField("coach_action_type", rawPayload.coach_action_type || rawPayload.triage?.coach_action_type);
  setRawField("contact_request", rawPayload.contact_request || rawPayload.answers?.contact_request);
  setRawField("client_name", rawPayload.client_name || rawPayload.answers?.client_name_entered);
  setRawField("client_email", rawPayload.client_email || rawPayload.answers?.client_email_entered);
  setRawField("client_phone", rawPayload.client_phone || rawPayload.answers?.client_phone_entered || rawPayload.meta?.client_phone);
  setRawField("client_phone_normalized", rawPayload.client_phone_normalized || rawPayload.answers?.client_phone_normalized || rawPayload.meta?.client_phone_normalized);
  setRawField("coach_name", rawPayload.coach_name || rawPayload.answers?.coach_name_entered || rawPayload.meta?.coach_name);
  setRawField("coach_id", rawPayload.coach_id || rawPayload.answers?.coach_id_entered || rawPayload.meta?.coach_id);

  addQuestionnaireObjectFields(expanded, row);
  return expanded;
}

function questionnaireRowBelongsToCoach(row, coach, clients) {
  row = expandQuestionnaireRow(row);
  if (rowBelongsToCoach(row, coach)) return true;
  const phone = questionnairePhone(row);
  if (!phone) return false;
  return clients.some((client) => clientPhone(client.data) === phone);
}

function buildQuestionnaireResponseRecords({ coach, rows, clients, existingById }) {
  const clientByPhone = new Map();
  clients.forEach((client) => {
    const phone = clientPhone(client.data);
    if (phone) clientByPhone.set(phone, client);
  });

  const responses = new Map();
  rows.forEach((row, index) => {
    row = expandQuestionnaireRow(row);
    const phone = questionnairePhone(row);
    const client = phone ? clientByPhone.get(phone) : null;
    const submittedAt = pick(row, [
      "submitted_at",
      "submitted at",
      "submission date",
      "date soumission",
      "date_submission",
      "received_at",
      "received at"
    ]);
    const sourceResponseId = pick(row, [
      "response_id",
      "response id",
      "submission_id",
      "submission id",
      "ghl submission id",
      "id"
    ]);
    const clientName = clientNameFromRow(row)
      || client?.data?.name
      || "Reponse sans client";
    const stable = sourceResponseId || `${phone}-${submittedAt}-${clientName}-${index}`;
    const id = `${coach.id}_q_${slugify(stable)}`;
    const existing = existingById.get(id) || {};
    const triageStatus = normalizeTriageStatus(pick(row, [
      "triage_status",
      "triage status",
      "statut triage",
      "statut",
      "status"
    ]));
    const invalidReason = invalidQuestionnaireResponseReason({ clientName, client });
    const sourceStatus = invalidReason ? "archived" : client ? "to_read" : "unmatched";
    const wasArchivedAsCoachNoise = existing.processingStatus === "archived"
      && cleanString(existing.sourceInvalidReason) === "coach_as_unmatched_client"
      && client;
    const terminal = ["read", "validated"].includes(existing.processingStatus)
      || (existing.processingStatus === "archived" && !wasArchivedAsCoachNoise);
    const processingStatus = terminal ? existing.processingStatus : sourceStatus;
    const answers = questionnaireAnswers(row);

    responses.set(id, {
      id,
      data: {
        coachId: coach.id,
        coachName: coach.name,
        clientId: client?.id || "",
        clientName: client?.data?.name || clientName,
        clientEmail: pick(row, EMAIL_ALIASES) || client?.data?.email || "",
        clientPhoneNormalized: phone,
        sourceResponseId: sourceResponseId || "",
        submittedAt: submittedAt || "",
        receivedAt: pick(row, ["received_at", "received at", "date reception"]) || submittedAt || "",
        followupType: pick(row, ["followup_type", "followup type", "type suivi"]) || "",
        triageStatus,
        coachActionType: pick(row, ["coach_action_type", "coach action type", "action coach"]) || questionnaireActionType(triageStatus),
        contactRequest: pick(row, ["contact_request", "contact request", "demande contact"]) || "",
        answers,
        sourceTab: pick(row, ["source_questionnaire_tab"]) || "",
        source: "google_sheets_questionnaire_responses",
        sourceInvalidReason: invalidReason || "",
        processingStatus,
        createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp()
      }
    });
  });
  return [...responses.values()];
}

function invalidQuestionnaireResponseReason({ clientName, client }) {
  if (client) return "";
  if (isPilotCoachName(clientName)) return "coach_as_unmatched_client";
  return "";
}

function isPilotCoachName(value) {
  const normalized = normalizeComparable(value);
  if (!normalized) return false;
  return PILOT_COACHES.some((coach) =>
    coachAliasValues(coach).some((alias) => normalizeComparable(alias) === normalized)
  );
}

function buildQuestionnaireTaskRecords({ coach, responses }) {
  return responses
    .filter((response) => response.data.clientId)
    .filter((response) => ["rouge", "orange", "jaune"].includes(response.data.triageStatus))
    .filter((response) => !["read", "archived", "validated"].includes(response.data.processingStatus))
    .map((response) => {
      const triage = response.data.triageStatus;
      const labels = {
        rouge: ["Contacter le client rapidement", "P1"],
        orange: ["Planifier une discussion client", "P2"],
        jaune: ["Valider un ajustement client", "P2"]
      };
      const [title, priority] = labels[triage] || labels.jaune;
      const id = `${coach.id}_questionnaire_action_${slugify(response.id)}`;
      return {
        id,
        data: {
          coachId: coach.id,
          coachName: coach.name,
          clientId: response.data.clientId,
          clientName: response.data.clientName,
          type: "questionnaire_followup",
          title,
          description: questionnaireTaskDescription(response.data),
          status: "open",
          priority,
          priorityRank: priorityRank(priority),
          dueAt: "",
          source: "google_sheets_questionnaire_responses",
          sourceResponseId: response.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }
      };
    });
}

function questionnaireTaskDescription(response) {
  const pieces = [
    response.coachActionType ? `Action: ${response.coachActionType}` : "",
    response.answers?.current_challenges ? `Defis: ${response.answers.current_challenges}` : "",
    response.answers?.open_note ? `Note client: ${response.answers.open_note}` : ""
  ].filter(Boolean);
  return pieces.join(" | ") || "Reponse questionnaire a traiter.";
}

function questionnairePhone(row) {
  row = expandQuestionnaireRow(row);
  return normalizePhone(pick(row, [
    "client_phone_normalized",
    "client phone normalized",
    "phone_normalized",
    "phone normalized",
    "client_phone",
    "client phone",
    "telephone",
    "telephone client",
    "phone",
    "mobile",
    "cellulaire",
    "phone_raw",
    "contact_phone"
  ]));
}

function questionnaireAnswers(row) {
  row = expandQuestionnaireRow(row);
  const fields = {
    questionnaire_type: ["questionnaire_type", "questionnaire type", "type questionnaire"],
    questionnaire_label: ["questionnaire_label", "questionnaire label", "nom questionnaire"],
    general_state: ["general_state", "general state", "etat general"],
    motivation_level: ["motivation_level", "motivation level", "motivation"],
    goal_status: ["goal_status", "goal status", "objectif"],
    goal_change_detail: ["goal_change_detail", "goal change detail", "detail changement objectif", "details changement objectif"],
    goal_clarity_score: ["goal_clarity_score", "goal clarity score", "clarte objectif"],
    progress_toward_goal: ["progress_toward_goal", "progress toward goal", "progression"],
    recent_success: ["recent_success", "recent success", "reussite recente"],
    recent_success_type: ["recent_success_type", "recent success type"],
    last_30_days_attendance: ["last_30_days_attendance", "last 30 days attendance", "assiduite 30 jours"],
    results_satisfaction_score: ["results_satisfaction_score", "results satisfaction score", "satisfaction resultats"],
    current_challenges: ["current_challenges", "current challenges", "defis actuels"],
    upcoming_changes: ["upcoming_changes", "upcoming changes", "changements a venir"],
    upcoming_changes_details: ["upcoming_changes_details", "upcoming changes details"],
    program_fit: ["program_fit", "program fit", "programme adapte"],
    program_adjustment_detail: ["program_adjustment_detail", "program adjustment detail"],
    improvements_requested: ["improvements_requested", "improvements requested", "ameliorations souhaitees"],
    pain_status: ["pain_status", "pain status", "douleur"],
    pain_detail: ["pain_detail", "pain detail", "detail douleur"],
    support_needed: ["support_needed", "support needed", "support souhaite"],
    coach_alignment_score: ["coach_alignment_score", "coach alignment score", "alignement coach", "score alignement coach"],
    open_note: ["open_note", "open note", "note ouverte", "note client"],
    final_position: ["final_position", "final position"],
    habits_priorities: ["habits_priorities", "habits priorities", "priorites habitudes", "tes priorites sont elles claires avec ton coach"],
    habits_rhythm: ["habits_rhythm", "habits rhythm", "rythme habitudes", "rythme quotidien"],
    habits_water: ["habits_water", "habits water", "eau", "hydratation quotidienne"],
    habits_movement30: ["habits_movement30", "habits movement30", "mouvement 30", "30 minutes de mouvement"],
    habits_outdoor15: ["habits_outdoor15", "habits outdoor15", "exterieur 15", "dehors 15 minutes"],
    habits_sleep7: ["habits_sleep7", "habits sleep7", "sommeil 7h", "7 heures"],
    habits_bowel_daily: ["habits_bowel_daily", "habits bowel daily", "selle quotidienne"],
    habits_focus: ["habits_focus", "habits focus", "focus habitudes", "sujet pertinent a ameliorer"],
    habits_priority: ["habits_priority", "habits priority", "priorite habitude", "ameliorer en premier"],
    habits_support: ["habits_support", "habits support", "support habitudes", "support coach"],
    eval_main_goal: ["eval_main_goal", "eval main goal", "objectif principal habitudes"],
    eval_obstacles: ["eval_obstacles", "eval obstacles", "obstacles habitudes"],
    eval_readiness: ["eval_readiness", "eval readiness", "pret a changer"],
    eval_meals: ["eval_meals", "eval meals", "repas complets"],
    eval_protein: ["eval_protein", "eval protein", "proteine repas"],
    eval_fruits_vegetables: ["eval_fruits_vegetables", "eval fruits vegetables", "fruits legumes"],
    eval_hydration: ["eval_hydration", "eval hydration", "hydratation"],
    eval_nutrition_note: ["eval_nutrition_note", "eval nutrition note", "note nutrition"],
    eval_sleep: ["eval_sleep", "eval sleep", "heures sommeil"],
    eval_sleep_quality: ["eval_sleep_quality", "eval sleep quality", "qualite sommeil"],
    eval_stress: ["eval_stress", "eval stress", "stress"],
    eval_recovery_note: ["eval_recovery_note", "eval recovery note", "note recuperation"],
    eval_energy: ["eval_energy", "eval energy", "energie"],
    eval_movement_outside_training: ["eval_movement_outside_training", "eval movement outside training", "mouvement hors entrainement"],
    eval_pain: ["eval_pain", "eval pain", "douleur evaluation"],
    eval_body_note: ["eval_body_note", "eval body note", "note corps"],
    eval_next_focus: ["eval_next_focus", "eval next focus", "prochain focus"],
    eval_commitment: ["eval_commitment", "eval commitment", "engagement semaine"],
    eval_contact: ["eval_contact", "eval contact", "contact evaluation"]
  };
  const answers = Object.fromEntries(Object.entries(fields)
    .map(([key, aliases]) => [key, pick(row, aliases)])
    .filter(([, value]) => value));
  const reservedAliases = [
    "id",
    "response_id",
    "submission_id",
    "submitted_at",
    "received_at",
    "client_name",
    "client_email",
    "client_phone_normalized",
    "client_phone",
    "coach_name",
    "coach_id",
    "followup_type",
    "triage_status",
    "coach_action_type",
    "contact_request",
    "source_questionnaire_tab",
    "schema_version",
    "form_version",
    "questionnaire_version",
    "submission_token",
    "source",
    "source_url",
    "raw_payload_json",
    "raw payload json",
    "payload_json",
    "payload json",
    "created_at",
    "updated_at",
    "processed_at",
    "synced_at",
    "dashboard_sync_status",
    "chat_notification_status",
    "coach_action_done",
    "coach_action_note",
    "test_mode",
    "test_feedback",
    "tester_name",
    "tester_email",
    "entered_name",
    "entered_email",
    "entered_phone",
    ...Object.values(fields).flat()
  ].map(keyOf);
  const reserved = new Set(reservedAliases);
  const otherResponses = Object.entries(row)
    .filter(([key, value]) => {
      const normalizedKey = keyOf(key);
      const technicalPrefix = /^(test|tester|meta|internal|debug)/.test(normalizedKey);
      return !reserved.has(normalizedKey) && !technicalPrefix && cleanString(value);
    })
    .map(([key, value]) => ({
      label: key.replace(/_/g, " "),
      value: cleanString(value)
    }));
  if (otherResponses.length) answers.other_responses = otherResponses;
  return answers;
}

function normalizeTriageStatus(value) {
  const clean = keyOf(value);
  if (clean.includes("rouge") || clean.includes("red") || clean.includes("prioritaire")) return "rouge";
  if (clean.includes("orange") || clean.includes("discussion")) return "orange";
  if (clean.includes("jaune") || clean.includes("yellow") || clean.includes("ajust")) return "jaune";
  if (clean.includes("vert") || clean.includes("green") || clean.includes("aucune")) return "vert";
  return "";
}

function questionnaireActionType(triageStatus) {
  const labels = {
    vert: "lire_archiver",
    jaune: "ajustement_leger",
    orange: "discussion_structuree",
    rouge: "contact_prioritaire"
  };
  return labels[triageStatus] || "";
}

async function findGhlContactByPhone({ token, locationId, phoneNormalized }) {
  const phoneCandidates = phoneSearchCandidates(phoneNormalized);
  let lastError = null;

  for (const phone of phoneCandidates) {
    try {
      const duplicateUrl = new URL(`${GHL_API_BASE}/contacts/search/duplicate`);
      duplicateUrl.searchParams.set("locationId", locationId);
      duplicateUrl.searchParams.set("phone", phone);
      const duplicate = await ghlFetch(token, duplicateUrl, { method: "GET" });
      const contact = exactGhlContactByPhone(
        [duplicate?.contact, ...(duplicate?.contacts || []), duplicate],
        phoneNormalized
      );
      if (contact?.id) return contact;
    } catch (error) {
      lastError = error;
    }

    try {
      const contactsUrl = new URL(`${GHL_API_BASE}/contacts/`);
      contactsUrl.searchParams.set("locationId", locationId);
      contactsUrl.searchParams.set("query", phone);
      contactsUrl.searchParams.set("limit", "10");
      const result = await ghlFetch(token, contactsUrl, { method: "GET" });
      const contacts = result?.contacts || result?.data || [];
      const exact = exactGhlContactByPhone(contacts, phoneNormalized);
      if (exact?.id) return exact;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError?.status === 401) throw lastError;
  return null;
}

function exactGhlContactByPhone(contacts, phoneNormalized) {
  const expected = normalizePhone(phoneNormalized);
  if (!expected) return null;
  return (contacts || [])
    .filter(Boolean)
    .find((contact) => contact?.id && ghlContactPhones(contact).includes(expected)) || null;
}

function ghlContactPhones(contact) {
  const directValues = [
    contact?.phone,
    contact?.phoneNumber,
    contact?.mobile,
    contact?.mobilePhone,
    contact?.contactPhone,
    contact?.additionalPhone
  ];
  const customValues = Object.entries(contact || {})
    .filter(([key]) => /phone|mobile|telephone/i.test(key))
    .map(([, value]) => value);
  return [...directValues, ...customValues]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map(normalizePhone)
    .filter(Boolean);
}

async function findGhlContactByNameExact({ token, locationId, name, nameKey }) {
  const cleanedName = cleanString(name);
  if (!cleanedName) return null;
  const expected = nameKey || normalizeComparable(cleanedName);
  const contactsUrl = new URL(`${GHL_API_BASE}/contacts/`);
  contactsUrl.searchParams.set("locationId", locationId);
  contactsUrl.searchParams.set("query", cleanedName);
  contactsUrl.searchParams.set("limit", "10");
  const result = await ghlFetch(token, contactsUrl, { method: "GET" });
  const contacts = result?.contacts || result?.data || [];
  const exactMatches = contacts.filter((contact) => {
    const names = [
      contact.contactName,
      contact.fullName,
      contact.name,
      [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    ].map(normalizeComparable).filter(Boolean);
    return names.includes(expected);
  });
  if (exactMatches.length !== 1) return null;
  return exactMatches[0];
}

async function addGhlTag({ token, contactId, tag }) {
  return ghlFetch(token, `${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags: [tag] })
  });
}

async function ghlFetch(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_API_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const error = new Error(body?.message || body?.error || response.statusText || "Erreur GHL");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function markSend(ref, patch) {
  await ref.update({
    ...patch,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

function questionnaireConfig(type) {
  const clean = cleanString(type);
  return QUESTIONNAIRE_TYPES[clean] || QUESTIONNAIRE_TYPES[DEFAULT_QUESTIONNAIRE_TYPE];
}

function buildQuestionnaireUrl(phoneNormalized, clientName, clientEmail, coachName, questionnaire = null) {
  const config = questionnaire || questionnaireConfig();
  const url = new URL(config.path || "/questionnaire/", QUESTIONNAIRE_URL);
  url.searchParams.set("phone", phoneNormalized);
  if (clientName) url.searchParams.set("client_name", clientName);
  if (clientEmail) url.searchParams.set("client_email", clientEmail);
  if (coachName) url.searchParams.set("coach_name", coachName);
  url.searchParams.set("lock_context", "1");
  return url.toString();
}

function phoneSearchCandidates(phoneNormalized) {
  const digits = normalizePhone(phoneNormalized);
  const candidates = new Set([digits]);
  if (digits.length === 10) {
    candidates.add(`+1${digits}`);
    candidates.add(`1${digits}`);
    candidates.add(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`);
    candidates.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
  }
  return [...candidates];
}

function clientPhone(client) {
  return normalizePhone(
    client?.phoneNormalized
    || client?.clientPhoneNormalized
    || client?.client_phone_normalized
    || client?.phone
    || client?.clientPhone
    || client?.telephone
    || client?.mobile
    || ""
  );
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function cleanString(value) {
  return String(value || "").trim();
}

function optionalNonNegativeNumber(value) {
  const clean = cleanString(value);
  if (!clean) return null;
  const normalized = clean.replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function setIfUseful(target, key, value) {
  const cleaned = cleanString(value);
  if (cleaned) target[key] = cleaned;
}

function membershipSourceRank(source) {
  const normalized = keyOf(source);
  if (!normalized) return 0;
  if (normalized.includes("csm") || normalized.includes("clientenrichment")) return 100;
  if (normalized.includes("dashboardmanual") || normalized.includes("firebaseappmanual")) return 90;
  if (normalized.includes("clientdirectory") || normalized.includes("coreclients")) return 80;
  if (normalized.includes("gohighlevel") || normalized.includes("ghl")) return 70;
  if (normalized.includes("coachrx")) return 20;
  return 10;
}

function existingMembershipSource(existing = {}) {
  return cleanString(existing.membershipSource)
    || cleanString(existing.membershipUpdatedFrom)
    || cleanString(existing.lastDirectEnrichmentSource)
    || cleanString(existing.directSourceType)
    || cleanString(existing.source);
}

function applyMembershipIfTrusted(target, { membershipLabel, incomingSource, existing = {} }) {
  const incomingMembership = cleanString(membershipLabel);
  if (!incomingMembership) return false;

  const currentMembership = cleanString(existing.membershipLabel);
  const currentSource = existingMembershipSource(existing);
  const incomingRank = membershipSourceRank(incomingSource);
  const currentRank = currentMembership ? membershipSourceRank(currentSource) : 0;

  if (currentMembership && incomingRank < currentRank) return false;

  target.membershipLabel = incomingMembership;
  target.membershipSource = cleanString(incomingSource);
  target.membershipUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
  return incomingMembership !== currentMembership || cleanString(existing.membershipSource) !== cleanString(incomingSource);
}

function safeSecretValue(secret) {
  try {
    return secret.value();
  } catch {
    return "";
  }
}

function humanizeGhlError(error) {
  if (error.status === 401) return "GHL refuse le token. Verifie GHL_PRIVATE_TOKEN.";
  if (error.status === 422) return `GHL n'a pas accepte la requete: ${safeBodyMessage(error.body)}`;
  if (error.status === 400) return `Requete GHL invalide: ${safeBodyMessage(error.body)}`;
  return error.message || "Erreur GHL inconnue.";
}

function safeBodyMessage(body) {
  return cleanString(body?.message || body?.error || body?.raw || "details non fournis").slice(0, 240);
}

function rowsFromValues(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const rawHeaders = values[0].map(cleanString);
  const headers = rawHeaders.map((header) => keyOf(header));
  const rows = values.slice(1).map((row) => {
    const out = {};
    headers.forEach((header, index) => {
      if (!header) return;
      out[header] = cleanString(row[index]);
    });
    return out;
  });
  rows.__headerMeta = {
    raw: rawHeaders,
    normalized: headers
  };
  return rows;
}

function mergeSheetRows(...rowSets) {
  const merged = rowSets.flatMap((rows) => Array.isArray(rows) ? rows : []);
  const rawHeaders = [];
  const normalizedHeaders = [];
  rowSets.forEach((rows) => {
    const meta = rows?.__headerMeta || {};
    (Array.isArray(meta.raw) ? meta.raw : []).forEach((header) => {
      const clean = cleanString(header);
      if (clean && !rawHeaders.includes(clean)) rawHeaders.push(clean);
    });
    (Array.isArray(meta.normalized) ? meta.normalized : []).forEach((header) => {
      const clean = keyOf(header);
      if (clean && !normalizedHeaders.includes(clean)) normalizedHeaders.push(clean);
    });
  });
  if (rawHeaders.length || normalizedHeaders.length) {
    merged.__headerMeta = {
      raw: rawHeaders,
      normalized: normalizedHeaders
    };
  }
  return merged;
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const value = row[keyOf(alias)];
    if (value !== undefined && value !== null && cleanString(value) !== "") return cleanString(value);
  }
  return "";
}

function countRowsWithClientPhone(rows = []) {
  return rows.filter((row) => normalizePhone(pick(row, PHONE_ALIASES))).length;
}

function rowBelongsToCoach(row, coach) {
  const rowCoachId = rowCoachIdValue(row);
  if (valuesMatchCoachId(rowCoachId, coach)) return true;
  if (rowContainsCoachIdSignal(row, coach)) return true;
  if (rowContainsCoachNameSignal(row, coach)) return true;
  const candidate = normalizeComparable(rowCoachTextValue(row));
  if (!candidate) return false;
  const aliases = new Set(coachAliasValues(coach).map(normalizeComparable));
  return [...aliases].some((alias) => {
    if (!alias) return false;
    return candidate.includes(alias) || alias.includes(candidate);
  });
}

function taskRowBelongsToCoach(row, coach) {
  const explicitCoachId = rowCoachIdValue(row);
  if (valuesMatchCoachId(explicitCoachId, coach)) return true;
  const coachText = normalizeComparable(rowCoachTextValue(row));
  if (!coachText) return false;
  const aliases = coachAliasValues(coach)
    .map(normalizeComparable)
    .filter((alias) => alias.length >= 3);
  return aliases.some((alias) => coachText.includes(alias) || alias.includes(coachText));
}

function rowCoachIdValue(row) {
  return pick(row, COACH_ID_ALIASES);
}

function rowCoachTextValue(row) {
  return COACH_TEXT_ALIASES
    .map((alias) => pick(row, [alias]))
    .filter(Boolean)
    .join(" ");
}

function valuesMatchCoachId(value, coach) {
  const cleanValue = cleanString(value);
  if (!cleanValue) return false;
  const candidates = coachIdCandidates(coach);
  if (candidates.includes(cleanValue)) return true;
  const digits = cleanValue.replace(/\D/g, "");
  return Boolean(digits && candidates.some((candidate) => candidate.replace(/\D/g, "") === digits));
}

function rowContainsCoachIdSignal(row, coach) {
  const candidates = coachIdCandidates(coach);
  if (!candidates.length) return false;
  const values = Object.values(row || {}).map(cleanString).filter(Boolean);
  return values.some((value) => candidates.some((candidate) => valueContainsCoachId(value, candidate)));
}

function rowContainsCoachNameSignal(row, coach) {
  const aliases = coachAliasValues(coach)
    .map(normalizeComparable)
    .filter((alias) => alias.length >= 8);
  if (!aliases.length) return false;
  const values = Object.values(row || {})
    .map(normalizeComparable)
    .filter((value) => value.length >= 8);
  return values.some((value) => aliases.some((alias) => value.includes(alias) || alias.includes(value)));
}

function valueContainsCoachId(value, coachId) {
  const cleanId = cleanString(coachId);
  if (!cleanId) return false;
  const text = cleanString(value);
  const compact = text.replace(/\s+/g, "");
  if (compact.includes(`/team/${cleanId}/`) || compact.includes(`team/${cleanId}/`)) return true;
  if (compact.includes(`team-${cleanId}`) || compact.includes(`team_${cleanId}`)) return true;
  const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9])${escaped}([^0-9]|$)`).test(text);
}

function coachIdCandidates(coach) {
  return [coach.id, coach.coachRxId].map(cleanString).filter(Boolean);
}

function clientNameFromRow(row) {
  const direct = pick(row, CLIENT_NAME_ALIASES);
  if (direct) return direct;
  const first = pick(row, CLIENT_FIRST_NAME_ALIASES);
  const last = pick(row, CLIENT_LAST_NAME_ALIASES);
  return [first, last].filter(Boolean).join(" ").trim();
}

function invalidClientNameReason(name) {
  const clean = cleanString(name);
  if (!clean) return "missing_name";
  const normalized = normalizeComparable(clean);
  const placeholders = new Set([
    "notset",
    "nondefini",
    "nondéfini",
    "nondisponible",
    "na",
    "n/a",
    "aucun",
    "unknown",
    "inconnu",
    "client",
    "name",
    "nom",
    "editprofile",
    "invitepending",
    "invitationpending",
    "today",
    "tomorrow",
    "yesterday",
    "aujourdhui",
    "demain",
    "hier"
  ].map(normalizeComparable));
  if (placeholders.has(normalized)) return "placeholder_name";
  const weekdays = new Set([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
    "dimanche"
  ]);
  if (weekdays.has(normalized)) return "weekday_in_client_column";
  if (!/[a-zA-ZÀ-ÿ]/.test(clean)) return "no_letters";
  const compactNoSpace = clean.replace(/\s+/g, "");
  const compactLetters = compactNoSpace.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (compactLetters && compactLetters.length === compactNoSpace.length && compactLetters.length <= 3) {
    if (compactLetters.length === 1 || compactLetters === compactLetters.toUpperCase()) {
      return "initials_or_abbreviation";
    }
  }
  return "";
}

function invalidCoachAsClientReason({ name, coach, source, phoneNormalized }) {
  if (source !== "coachrx" && source !== "google_sheets_coachrx_browser") return "";
  if (phoneNormalized) return "";
  if (!normalizeComparable(name) || !normalizeComparable(coach?.name)) return "";
  if (normalizeComparable(name) === normalizeComparable(coach.name)) return "coach_name_without_phone";
  return "";
}

function rowCoachDebugSignal(row) {
  return {
    coachId: rowCoachIdValue(row),
    coachText: rowCoachTextValue(row).slice(0, 160),
    client: clientNameFromRow(row)
  };
}

function sampleCoachSignals(rows, limit = 8) {
  const seen = new Set();
  const samples = [];
  for (const row of rows) {
    const signal = rowCoachDebugSignal(row);
    const key = JSON.stringify(signal);
    if (!signal.coachId && !signal.coachText && !signal.client) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push(signal);
    if (samples.length >= limit) break;
  }
  return samples;
}

function sourceRowsOverview({
  coreRows = [],
  taskRows = [],
  browserRows = [],
  questionnaireRows = [],
  rebookingRows = [],
  checkupRows = [],
  alumniRows = [],
  impactRows = []
}) {
  return {
    totals: {
      coreClients: coreRows.length,
      coachRx: browserRows.length,
      tasks: taskRows.length,
      questionnaireRows: questionnaireRows.length,
      rebookings: rebookingRows.length,
      checkups: checkupRows.length,
      alumni: alumniRows.length,
      impacts: impactRows.length
    },
    headers: {
      coreClients: sourceHeaderSummary(coreRows),
      coachRx: sourceHeaderSummary(browserRows),
      tasks: sourceHeaderSummary(taskRows),
      questionnaireRows: sourceHeaderSummary(questionnaireRows),
      rebookings: sourceHeaderSummary(rebookingRows),
      checkups: sourceHeaderSummary(checkupRows),
      alumni: sourceHeaderSummary(alumniRows),
      impacts: sourceHeaderSummary(impactRows)
    },
    samples: {
      coreClients: sampleCoachSignals(coreRows),
      coachRx: sampleCoachSignals(browserRows),
      tasks: sampleCoachSignals(taskRows),
      questionnaireRows: sampleCoachSignals(questionnaireRows),
      rebookings: sampleCoachSignals(rebookingRows),
      checkups: sampleCoachSignals(checkupRows),
      alumni: sampleCoachSignals(alumniRows),
      impacts: sampleCoachSignals(impactRows)
    }
  };
}

function sourceHeaderSummary(rows) {
  const meta = rows?.__headerMeta || {};
  const normalized = Array.isArray(meta.normalized) ? meta.normalized.filter(Boolean) : [];
  if (normalized.length) {
    return {
      count: normalized.length,
      normalized: normalized.slice(0, 32),
      raw: Array.isArray(meta.raw) ? meta.raw.map(cleanString).filter(Boolean).slice(0, 32) : []
    };
  }
  const first = Array.isArray(rows) && rows.length ? rows[0] : {};
  const keys = Object.keys(first || {}).filter((key) => !key.startsWith("__"));
  return {
    count: keys.length,
    normalized: keys.slice(0, 32),
    raw: []
  };
}

function buildSyncWarnings({ coach, clients, diagnostics }) {
  const warnings = [];
  const matched = diagnostics.matchedRows || {};
  const available = diagnostics.sourceRowsAvailable || {};
  const matchingAudit = diagnostics.matchingAudit || {};
  const missingNames = matchingAudit.matchedRowsMissingClientName || {};
  const missingNameCount = Number(missingNames.coreClients || 0) + Number(missingNames.coachRx || 0);
  if ((available.coreClients || available.coachRx) && !clients.length) {
    warnings.push(`${coach.name}: aucune fiche client importee. Verifie si les colonnes Coach/Tags/CoachRx ID contiennent bien ${coach.id} ou un alias reconnu.`);
  }
  if ((matched.coreClients || matched.coachRx) && !clients.length && missingNameCount) {
    warnings.push(`${coach.name}: ${missingNameCount} ligne(s) matchent ce coach, mais n'ont pas de nom client lisible. Verifie les entetes Nom/Client/Client Name dans les sources.`);
  }
  const missingPhone = Number(diagnostics.importedClients?.missingPhone || 0);
  if (clients.length && missingPhone) {
    warnings.push(`${coach.name}: ${missingPhone}/${clients.length} client(s) importes sans telephone normalise. L'envoi questionnaire et le matching GHL seront limites pour ces clients.`);
    const phoneCoverage = diagnostics.sourcePhoneCoverage || {};
    const sourcePhones = Number(phoneCoverage.coreClients || 0) + Number(phoneCoverage.coachRx || 0);
    if (!sourcePhones) {
      warnings.push(`${coach.name}: les lignes CORE_Clients/CoachRx matchees ne contiennent aucun telephone. Enrichis CORE_Clients_Manual ou branche une source GHL/Kilo avec telephone avant de tester l'envoi questionnaire en masse.`);
    }
  }
  if ((available.coachRx || 0) > 0 && (matched.coachRx || 0) === 0) {
    warnings.push(`${coach.name}: aucune ligne CoachRx matchee, meme si la source CoachRx contient ${available.coachRx} ligne(s).`);
  }
  if ((available.coreClients || 0) > 0 && (matched.coreClients || 0) === 0) {
    warnings.push(`${coach.name}: aucune ligne CORE_Clients matchee. Les clients peuvent exister, mais ne sont pas associes a ce coach dans les colonnes lues.`);
  }
  if ((available.checkups || 0) > 0 && (matched.checkups || 0) === 0) {
    warnings.push(`${coach.name}: aucun check-up CSM matche, meme si la source CSM contient ${available.checkups} ligne(s).`);
  }
  if ((available.rebookings || 0) > 0 && (matched.rebookings || 0) === 0) {
    warnings.push(`${coach.name}: aucun rebooking matche, meme si la source rebooking contient ${available.rebookings} ligne(s).`);
  }
  const importedRebookings = diagnostics.importedRebookings || {};
  if (Number(importedRebookings.total || 0) && Number(importedRebookings.missingClientId || 0)) {
    warnings.push(`${coach.name}: ${importedRebookings.missingClientId}/${importedRebookings.total} rebooking(s) importes ne sont pas relies a une fiche client. Verifie telephone ou nom client dans la source rebooking.`);
  }
  if (Number(importedRebookings.total || 0) && Number(importedRebookings.sourceRowsMatched || 0) && !Number(importedRebookings.sourceRowsWithPhone || 0)) {
    warnings.push(`${coach.name}: les lignes rebooking matchees n'ont pas de telephone. Le matching se fait donc par nom et doit etre valide.`);
  }
  return warnings.slice(0, 8);
}

function buildCoachMatchingAudit({
  coach,
  coreRows = [],
  taskRows = [],
  browserRows = [],
  questionnaireRows = [],
  rebookingRows = [],
  checkupRows = [],
  alumniRows = [],
  impactRows = []
}) {
  return {
    coachId: coach.id,
    coachName: coach.name,
    aliases: coachAliasValues(coach).map(cleanString).filter(Boolean).slice(0, 16),
    unmatchedCoachSignals: {
      coreClients: sampleUnmatchedCoachSignals(coreRows, coach),
      coachRx: sampleUnmatchedCoachSignals(browserRows, coach),
      tasks: sampleUnmatchedCoachSignals(taskRows, coach),
      questionnaireRows: sampleUnmatchedCoachSignals(questionnaireRows, coach),
      rebookings: sampleUnmatchedCoachSignals(rebookingRows, coach),
      checkups: sampleUnmatchedCoachSignals(checkupRows, coach),
      alumni: sampleUnmatchedCoachSignals(alumniRows, coach),
      impacts: sampleUnmatchedCoachSignals(impactRows, coach)
    },
    matchedRowsMissingClientName: {
      coreClients: countMatchedRowsMissingClientName(coreRows, coach),
      coachRx: countMatchedRowsMissingClientName(browserRows, coach)
    },
    matchedRowsMissingClientNameSamples: {
      coreClients: sampleMatchedRowsMissingClientName(coreRows, coach),
      coachRx: sampleMatchedRowsMissingClientName(browserRows, coach)
    }
  };
}

function sampleUnmatchedCoachSignals(rows, coach, limit = 8) {
  const seen = new Set();
  const samples = [];
  for (const row of rows) {
    if (!rowHasCoachSignal(row) || rowBelongsToCoach(row, coach)) continue;
    const signal = rowCoachDebugSignal(row);
    const key = JSON.stringify(signal);
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push(signal);
    if (samples.length >= limit) break;
  }
  return samples;
}

function countMatchedRowsMissingClientName(rows, coach) {
  return rows.filter((row) => rowBelongsToCoach(row, coach) && !clientNameFromRow(row)).length;
}

function sampleMatchedRowsMissingClientName(rows, coach, limit = 6) {
  return rows
    .filter((row) => rowBelongsToCoach(row, coach) && !clientNameFromRow(row))
    .slice(0, limit)
    .map((row) => rowCoachDebugSignal(row));
}

function rowHasCoachSignal(row) {
  return Boolean(rowCoachIdValue(row) || rowCoachTextValue(row));
}

function coachAliasValues(coach) {
  const extrasById = {
    "15935": ["Marc-Andre Menard", "Marc Andre Menard", "Marc-Andr\u00e9 M\u00e9nard", "Marc Andre M\u00e9nard", "Marc-Andre", "Marc Andre", "Marc-Andr\u00e9"],
    "15928": ["Iheb Yahyaoui", "Iheb Yahiaoui", "Iheb"],
    "17242": ["Camille Proulx", "Camille"],
    "15902": ["David Olivier", "David"],
    "15893": ["Gabriel Mayer Bedard", "Gabriel Mayer B\u00e9dard", "Gabriel"],
    "15937": ["Hugo Lelievre", "Hugo Leli\u00e8vre", "Hugo"],
    "15936": ["Raphael Samson", "Rapha\u00ebl Samson", "Raphael", "Rapha\u00ebl"]
  };
  return [
    coach.name,
    coach.id,
    coach.coachRxId,
    ...(Array.isArray(coach.aliases) ? coach.aliases : []),
    ...(extrasById[coach.id] || [])
  ].filter(Boolean);
}

function keyOf(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeComparable(value) {
  return keyOf(value);
}

function slugify(value) {
  const slug = keyOf(value).slice(0, 80);
  return slug || "unknown";
}

function splitTags(value) {
  if (!value) return [];
  return cleanString(value)
    .split(/[;,|]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function lastNameSort(name) {
  const parts = cleanString(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return normalizeComparable(parts[parts.length - 1]);
}

function priorityRank(priority) {
  if (priority === "P1") return 1;
  if (priority === "P2") return 2;
  if (priority === "P3") return 3;
  return 4;
}

function normalizePriority(value) {
  const clean = cleanString(value).toUpperCase();
  if (["P1", "1", "URGENT", "HIGH", "HAUTE"].includes(clean)) return "P1";
  if (["P2", "2", "MOYEN", "MEDIUM", "NORMALE", "NORMAL"].includes(clean)) return "P2";
  if (["P3", "3", "LOW", "BASSE"].includes(clean)) return "P3";
  return "";
}

function normalizeTaskType(value) {
  const clean = keyOf(value);
  if (clean.includes("rebook")) return "rebooking";
  if (clean.includes("question")) return "questionnaire_followup";
  if (clean.includes("valid")) return "validation";
  if (clean.includes("program") || clean.includes("programme")) return "program";
  if (clean.includes("note")) return "coach_note";
  return "manual";
}

function rowLooksLikeRebooking(row) {
  const type = normalizeTaskType(pick(row, ["type", "categorie", "category"]));
  if (type === "rebooking") return true;
  const text = Object.values(row || {}).map(cleanString).filter(Boolean).join(" ");
  return /rebook|booking|seance.+remettre|séance.+remettre|remettre|reprendre|absence coach/i.test(text);
}

function normalizeRebookingStatus(value) {
  const clean = keyOf(value);
  if (!clean) return "";
  if (clean.includes("absence") || clean.includes("vacance")) return "coach_absence";
  if (clean.includes("rebooke") || clean.includes("rebooked") || clean.includes("repris")) return "rebooked";
  if (clean.includes("gere") || clean.includes("managed") || clean.includes("traite")) return "managed";
  if (clean.includes("archive") || clean.includes("ignore") || clean.includes("ferme")) return "archived";
  return "open";
}

function normalizeImpactStatus(value) {
  const clean = keyOf(value);
  if (!clean) return "";
  if (clean.includes("confirm") || clean.includes("complete") || clean.includes("gagne") || clean.includes("won")) return "confirmed";
  if (clean.includes("cancel") || clean.includes("annul") || clean.includes("perdu") || clean.includes("lost")) return "cancelled";
  return "draft";
}

function normalizeAlumniStatus(value) {
  const clean = keyOf(value);
  if (!clean) return "";
  if (clean.includes("nepas") || clean.includes("donot") || clean.includes("exclu")) return "do_not_contact";
  if (clean.includes("reactiv")) return "reactivated";
  if (clean.includes("contact")) return "contacted";
  if (clean.includes("archive") || clean.includes("ignore")) return "archived";
  return "to_work";
}

function defaultTaskTitle(type) {
  const labels = {
    program: "Preparer le prochain programme",
    rebooking: "Rebooker une seance",
    questionnaire_followup: "Relancer questionnaire client",
    validation: "Valider les informations client",
    coach_note: "Note coach a traiter",
    manual: "Tache coach"
  };
  return labels[type] || labels.manual;
}
