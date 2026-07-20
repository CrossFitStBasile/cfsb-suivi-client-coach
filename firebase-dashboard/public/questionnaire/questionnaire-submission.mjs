import { normalizeOpaqueAccessToken } from "./questionnaire-access.mjs";

export class QuestionnaireSubmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "QuestionnaireSubmissionError";
    this.code = code;
  }
}

export function resolveQuestionnaireSubmissionEndpoint({ runtimeEndpoint = "", metaEndpoint = "" } = {}) {
  return String(runtimeEndpoint || metaEndpoint || "").trim();
}

function validatedEndpoint(value) {
  const endpoint = String(value || "").trim();
  if (!endpoint) {
    throw new QuestionnaireSubmissionError(
      "endpoint_not_configured",
      "L'envoi securise est en preparation. Aucun endpoint serveur avec accuse de reception n'est configure dans cette branche."
    );
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch (_) {
    throw new QuestionnaireSubmissionError("invalid_endpoint", "L'endpoint questionnaire configure est invalide.");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new QuestionnaireSubmissionError("insecure_endpoint", "L'endpoint questionnaire doit utiliser HTTPS.");
  }
  return url.toString();
}

export async function submitQuestionnaireWithAcknowledgement({
  endpoint,
  accessToken,
  payload,
  fetchImpl = globalThis.fetch
} = {}) {
  const target = validatedEndpoint(endpoint);
  const token = normalizeOpaqueAccessToken(accessToken);
  if (typeof fetchImpl !== "function") {
    throw new QuestionnaireSubmissionError("fetch_unavailable", "Le transport HTTP n'est pas disponible.");
  }

  let response;
  try {
    response = await fetchImpl(target, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      credentials: "omit",
      redirect: "error",
      body: JSON.stringify({ ...payload, access_token: token })
    });
  } catch (error) {
    throw new QuestionnaireSubmissionError(
      "network_error",
      `Le serveur questionnaire n'a pas pu etre joint: ${String(error?.message || error)}`
    );
  }

  if (!response?.ok) {
    throw new QuestionnaireSubmissionError(
      "http_not_ok",
      `Le serveur questionnaire a refuse l'envoi (HTTP ${Number(response?.status || 0)}).`
    );
  }

  let acknowledgement;
  try {
    acknowledgement = await response.json();
  } catch (_) {
    throw new QuestionnaireSubmissionError(
      "invalid_acknowledgement",
      "Le serveur n'a pas retourne un accuse de reception JSON valide."
    );
  }
  if (!acknowledgement || acknowledgement.ok !== true) {
    throw new QuestionnaireSubmissionError(
      "negative_acknowledgement",
      "Le serveur n'a pas confirme l'enregistrement de la reponse."
    );
  }
  return acknowledgement;
}
