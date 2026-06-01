const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const ghlPrivateToken = defineSecret("GHL_PRIVATE_TOKEN");

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const GHL_LOCATION_ID = "hWM7E7ZXB88LWDmjezKU";
const QUESTIONNAIRE_TAG = "dashboardcoach";
const QUESTIONNAIRE_URL = "https://crossfitstbasile.github.io/cfsb-suivi-client-coach/";

exports.sendQuestionnaire = onCall(
  {
    region: "us-central1",
    secrets: [ghlPrivateToken],
    timeoutSeconds: 30
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
    const isAdmin = profile.role === "admin";
    if (!isAdmin && profile.coachId !== coachId) {
      throw new HttpsError("permission-denied", "Ce client n'appartient pas a ton dashboard.");
    }

    const phoneNormalized = normalizePhone(client.phoneNormalized || client.phone || client.clientPhoneNormalized);
    if (!phoneNormalized) {
      throw new HttpsError("failed-precondition", "Telephone manquant. L'envoi et le matching se font par telephone.");
    }

    const sendRef = db.collection("questionnaireSends").doc();
    const baseAttempt = {
      coachId,
      clientId,
      clientName: cleanString(client.name),
      clientPhoneNormalized: phoneNormalized,
      status: "pending",
      deliveryStatus: "ghl_pending",
      ghlTag: QUESTIONNAIRE_TAG,
      questionnaireUrl: buildQuestionnaireUrl(phoneNormalized, client.name, client.email, client.coachName),
      requestedByUid: request.auth.uid,
      requestedByEmail: request.auth.token.email || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "firebase_function_send_questionnaire"
    };
    await sendRef.set(baseAttempt);

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

      await addGhlTag({ token, contactId: contact.id, tag: QUESTIONNAIRE_TAG });
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
        message: `Tag ${QUESTIONNAIRE_TAG} ajoute dans GHL. Le workflow devrait envoyer le questionnaire.`
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

async function findGhlContactByPhone({ token, locationId, phoneNormalized }) {
  const phoneCandidates = phoneSearchCandidates(phoneNormalized);
  let lastError = null;

  for (const phone of phoneCandidates) {
    try {
      const duplicateUrl = new URL(`${GHL_API_BASE}/contacts/search/duplicate`);
      duplicateUrl.searchParams.set("locationId", locationId);
      duplicateUrl.searchParams.set("phone", phone);
      const duplicate = await ghlFetch(token, duplicateUrl, { method: "GET" });
      const contact = duplicate?.contact || duplicate?.contacts?.[0] || duplicate;
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
      const exact = contacts.find((contact) => normalizePhone(contact.phone || contact.phoneNumber) === phoneNormalized);
      if (exact?.id) return exact;
      if (contacts[0]?.id) return contacts[0];
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError?.status === 401) throw lastError;
  return null;
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

function buildQuestionnaireUrl(phoneNormalized, clientName, clientEmail, coachName) {
  const url = new URL(QUESTIONNAIRE_URL);
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

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function cleanString(value) {
  return String(value || "").trim();
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
