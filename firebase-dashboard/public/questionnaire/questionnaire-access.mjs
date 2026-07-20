const TOKEN_PARAM_NAMES = ["access_token", "token", "t"];
const MIN_OPAQUE_TOKEN_LENGTH = 16;
const MAX_OPAQUE_TOKEN_LENGTH = 4096;

export class QuestionnaireAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "QuestionnaireAccessError";
    this.code = code;
  }
}

export function normalizeOpaqueAccessToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token) {
    throw new QuestionnaireAccessError(
      "missing_access_token",
      "Le lien questionnaire ne contient pas de jeton d'acces serveur."
    );
  }
  if (token.length < MIN_OPAQUE_TOKEN_LENGTH || token.length > MAX_OPAQUE_TOKEN_LENGTH || /\s/.test(token)) {
    throw new QuestionnaireAccessError(
      "invalid_access_token",
      "Le jeton d'acces questionnaire est invalide."
    );
  }
  return token;
}

export function readQuestionnaireAccessToken(searchParams) {
  for (const name of TOKEN_PARAM_NAMES) {
    const value = searchParams?.get?.(name);
    if (value) return normalizeOpaqueAccessToken(value);
  }
  return "";
}

export function buildQuestionnaireAccessUrl({ baseUrl, path = "/questionnaire/", accessToken } = {}) {
  const token = normalizeOpaqueAccessToken(accessToken);
  let url;
  try {
    url = new URL(path, baseUrl);
  } catch (_) {
    throw new QuestionnaireAccessError("invalid_questionnaire_url", "L'URL questionnaire est invalide.");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new QuestionnaireAccessError(
      "insecure_questionnaire_url",
      "L'URL questionnaire doit utiliser HTTPS."
    );
  }

  // Le serveur est le seul emetteur du jeton. Le navigateur ne lui ajoute aucun
  // contexte client: l'identite sera resolue cote serveur pendant la Phase 2.
  url.search = "";
  url.hash = "";
  url.searchParams.set("access_token", token);
  url.searchParams.set("lock_context", "1");
  return url.toString();
}

export const QUESTIONNAIRE_TOKEN_PARAM_NAMES = Object.freeze([...TOKEN_PARAM_NAMES]);
