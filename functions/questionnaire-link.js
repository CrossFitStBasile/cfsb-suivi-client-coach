"use strict";

const crypto = require("crypto");

const TOKEN_VERSION = "v1";
const TOKEN_PATTERN = /^v1\.([A-Za-z0-9_-]{32,128})\.(\d{10,16})\.([A-Za-z0-9_-]{32,128})$/;
const BINDING_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const QUESTIONNAIRE_TYPE_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

class QuestionnaireTokenError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "QuestionnaireTokenError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new QuestionnaireTokenError(code, message);
}

function requiredSecret(secret) {
  const value = typeof secret === "string" ? secret : "";
  if (Buffer.byteLength(value, "utf8") < 32) {
    fail("invalid_secret", "Le secret questionnaire doit contenir au moins 32 octets.");
  }
  return value;
}

function requiredBindingId(value, fieldName) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!BINDING_ID_PATTERN.test(clean)) {
    fail("invalid_binding", `${fieldName} est invalide.`);
  }
  return clean;
}

function requiredQuestionnaireType(value) {
  const clean = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!QUESTIONNAIRE_TYPE_PATTERN.test(clean)) {
    fail("invalid_binding", "questionnaireType est invalide.");
  }
  return clean;
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function tokenDigest(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createQuestionnaireAccessToken({
  secret,
  sendId,
  clientId,
  questionnaireType,
  ttlSeconds = 7 * 24 * 60 * 60,
  nowMs = Date.now(),
  randomBytes = crypto.randomBytes
} = {}) {
  const signingSecret = requiredSecret(secret);
  const cleanSendId = requiredBindingId(sendId, "sendId");
  const cleanClientId = requiredBindingId(clientId, "clientId");
  const cleanQuestionnaireType = requiredQuestionnaireType(questionnaireType);
  const ttl = Number(ttlSeconds);
  if (!Number.isInteger(ttl) || ttl < MIN_TTL_SECONDS || ttl > MAX_TTL_SECONDS) {
    fail("invalid_ttl", "La duree du jeton questionnaire est invalide.");
  }
  if (!Number.isFinite(nowMs) || nowMs < 0) fail("invalid_clock", "Horloge invalide.");

  const selector = randomBytes(32).toString("base64url");
  const expiresAtMs = Math.trunc(nowMs + ttl * 1000);
  const signedValue = `${TOKEN_VERSION}.${selector}.${expiresAtMs}`;
  const token = `${signedValue}.${hmac(signingSecret, signedValue)}`;
  return {
    token,
    binding: {
      tokenDigest: tokenDigest(token),
      sendId: cleanSendId,
      clientId: cleanClientId,
      questionnaireType: cleanQuestionnaireType,
      expiresAtMs
    }
  };
}

function verifyQuestionnaireAccessToken({ token, secret, binding, nowMs = Date.now() } = {}) {
  const signingSecret = requiredSecret(secret);
  const cleanToken = typeof token === "string" ? token.trim() : "";
  const match = TOKEN_PATTERN.exec(cleanToken);
  if (!match) fail("invalid_token", "Jeton questionnaire invalide.");

  const [, selector, expiresRaw, signature] = match;
  const expiresAtMs = Number(expiresRaw);
  const signedValue = `${TOKEN_VERSION}.${selector}.${expiresAtMs}`;
  if (!safeEqual(signature, hmac(signingSecret, signedValue))) {
    fail("invalid_signature", "Signature du jeton questionnaire invalide.");
  }
  if (!Number.isFinite(nowMs) || nowMs < 0) fail("invalid_clock", "Horloge invalide.");
  if (nowMs >= expiresAtMs) fail("expired_token", "Jeton questionnaire expire.");

  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    fail("missing_binding", "Liaison serveur du jeton questionnaire introuvable.");
  }
  const sendId = requiredBindingId(binding.sendId, "binding.sendId");
  const clientId = requiredBindingId(binding.clientId, "binding.clientId");
  const questionnaireType = requiredQuestionnaireType(binding.questionnaireType);
  if (!safeEqual(binding.tokenDigest, tokenDigest(cleanToken))) {
    fail("binding_mismatch", "Le jeton ne correspond pas a sa liaison serveur.");
  }
  if (Number(binding.expiresAtMs) !== expiresAtMs) {
    fail("binding_mismatch", "L'expiration du jeton ne correspond pas a sa liaison serveur.");
  }
  return { sendId, clientId, questionnaireType, expiresAtMs, tokenDigest: tokenDigest(cleanToken) };
}

function buildQuestionnaireAccessUrl({ baseUrl, path = "/questionnaire/", token } = {}) {
  const cleanToken = typeof token === "string" ? token.trim() : "";
  if (!TOKEN_PATTERN.test(cleanToken)) fail("invalid_token", "Jeton questionnaire invalide.");
  let base;
  let url;
  try {
    base = new URL(baseUrl);
    url = new URL(path, base);
  } catch (_) {
    fail("invalid_url", "URL questionnaire invalide.");
  }
  if (base.protocol !== "https:" || url.protocol !== "https:" || url.origin !== base.origin) {
    fail("invalid_url", "L'URL questionnaire doit rester sur l'origine HTTPS configuree.");
  }
  url.search = "";
  url.hash = "";
  url.searchParams.set("access_token", cleanToken);
  url.searchParams.set("lock_context", "1");
  return url.toString();
}

module.exports = {
  MAX_TTL_SECONDS,
  MIN_TTL_SECONDS,
  QuestionnaireTokenError,
  buildQuestionnaireAccessUrl,
  createQuestionnaireAccessToken,
  tokenDigest,
  verifyQuestionnaireAccessToken
};
