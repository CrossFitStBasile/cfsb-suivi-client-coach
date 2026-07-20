const SERVICE_SCOPES = new Set([
  "lifestyle_assessment",
  "nutrition",
  "personal_training",
  "group_training",
  "coachrx_programming",
  "other"
]);

const RESPONSIBILITY_MODES = new Set([
  "dashboard_only",
  "follow_coachrx",
  "manual_override"
]);

const BACKEND_UNAVAILABLE_CODES = new Set([
  "functions/not-found",
  "functions/unavailable",
  "functions/unimplemented",
  "functions/deadline-exceeded"
]);

export class ClientCommandGatewayError extends Error {
  constructor(gatewayCode, message, { code = "", cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ClientCommandGatewayError";
    this.gatewayCode = gatewayCode;
    this.code = code || `client-command/${gatewayCode}`;
  }
}

function fail(gatewayCode, message) {
  throw new ClientCommandGatewayError(gatewayCode, message);
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value, fieldName, { min = 1, max = 240 } = {}) {
  const result = cleanString(value).replace(/\s+/g, " ");
  if (result.length < min || result.length > max) {
    fail("invalid-command", `${fieldName} est invalide.`);
  }
  return result;
}

function optionalEmail(value) {
  const email = cleanString(value).toLowerCase();
  if (!email) return "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("invalid-command", "Le courriel du client est invalide.");
  }
  return email;
}

function requiredPhone(value) {
  const phone = String(value || "").replace(/\D/g, "");
  if (phone.length < 7 || phone.length > 15) {
    fail("invalid-command", "Un numero de telephone valide est requis.");
  }
  return phone;
}

function requiredId(value, fieldName) {
  const result = cleanString(value);
  if (!result || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/.test(result)) {
    fail("invalid-command", `${fieldName} est invalide.`);
  }
  return result;
}

function requiredClientId(value) {
  const result = cleanString(value).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) {
    fail("legacy-client", "Cette action exige une fiche client canonique.");
  }
  return result;
}

function normalizeServiceScopes(value) {
  const source = Array.isArray(value) && value.length ? value : ["lifestyle_assessment"];
  const result = [...new Set(source.map((scope) => cleanString(scope).toLowerCase()))].sort();
  if (!result.length || result.some((scope) => !SERVICE_SCOPES.has(scope))) {
    fail("invalid-command", "Le service client selectionne est invalide.");
  }
  return result;
}

function responsibilityMode(value, { optional = false } = {}) {
  const result = cleanString(value);
  if (!result && optional) return "";
  if (!RESPONSIBILITY_MODES.has(result)) {
    fail("invalid-command", "Le mode de responsabilite est invalide.");
  }
  return result;
}

export function createClientCommandIdempotencyKey(prefix = "client", randomUuid) {
  const safePrefix = cleanString(prefix).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 24) || "client";
  const uuidFactory = randomUuid
    || globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  const entropy = uuidFactory
    ? String(uuidFactory()).replace(/[^A-Za-z0-9_-]/g, "")
    : `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
  const key = `${safePrefix}_${entropy}`.slice(0, 100);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
    fail("invalid-idempotency", "Impossible de securiser cette commande; recharge le Dashboard.");
  }
  return key;
}

function requiredIdempotencyKey(value, commandName, randomUuid) {
  const result = cleanString(value) || createClientCommandIdempotencyKey(commandName, randomUuid);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(result)) {
    fail("invalid-idempotency", "La cle de reprise de la commande est invalide.");
  }
  return result;
}

function requirePositiveAcknowledgement(commandName, response) {
  if (!response || response.ok !== true) {
    throw new ClientCommandGatewayError(
      "invalid-acknowledgement",
      `Le backend n'a pas confirme la commande ${commandName}. Aucun succes n'est affiche.`,
      { code: "functions/data-loss" }
    );
  }
  const clientId = cleanString(response.clientId || response.internalClientId);
  if (!clientId) {
    throw new ClientCommandGatewayError(
      "invalid-acknowledgement",
      `Le backend a retourne une confirmation incomplete pour ${commandName}.`,
      { code: "functions/data-loss" }
    );
  }
  return { ...response, clientId, internalClientId: cleanString(response.internalClientId) || clientId };
}

function normalizeInvocationError(commandName, error) {
  if (error instanceof ClientCommandGatewayError) return error;
  const rawCode = cleanString(error?.code);
  const rawMessage = cleanString(error?.message);
  if (BACKEND_UNAVAILABLE_CODES.has(rawCode)) {
    return new ClientCommandGatewayError(
      "backend-unavailable",
      `Le backend securise (${commandName}) n'est pas disponible. Aucune donnee client n'a ete enregistree.`,
      { code: rawCode, cause: error }
    );
  }
  return new ClientCommandGatewayError(
    "command-rejected",
    rawMessage || `La commande ${commandName} a ete refusee par le backend.`,
    { code: rawCode || "functions/internal", cause: error }
  );
}

export function isCanonicalClientRecord(client = {}) {
  const documentId = cleanString(client.id).toLowerCase();
  const internalClientId = cleanString(client.internalClientId).toLowerCase();
  return Number(client.contractVersion) === 1
    && Boolean(internalClientId)
    && internalClientId === documentId
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(internalClientId);
}

export function canonicalDashboardCoachId(record = {}) {
  return cleanString(record.dashboardResponsibleCoachId)
    || cleanString(record.coachId)
    || cleanString(record.coachRxId)
    || cleanString(record.assignedCoachId);
}

export function createClientCommandGateway({ invoke, randomUuid } = {}) {
  async function execute(commandName, payload) {
    if (typeof invoke !== "function") {
      throw new ClientCommandGatewayError(
        "backend-unavailable",
        `Le backend securise (${commandName}) n'est pas configure. Aucune donnee client n'a ete enregistree.`,
        { code: "functions/not-found" }
      );
    }
    try {
      const response = await invoke(commandName, payload);
      return requirePositiveAcknowledgement(commandName, response);
    } catch (error) {
      throw normalizeInvocationError(commandName, error);
    }
  }

  return Object.freeze({
    async createDashboardClient(input = {}) {
      const payload = {
        name: requiredText(input.name, "Le nom du client", { min: 2, max: 160 }),
        phone: requiredPhone(input.phone ?? input.phoneNormalized),
        email: optionalEmail(input.email),
        serviceScopes: normalizeServiceScopes(input.serviceScopes),
        dashboardResponsibleCoachId: requiredId(
          input.dashboardResponsibleCoachId,
          "Le coach responsable"
        ),
        idempotencyKey: requiredIdempotencyKey(input.idempotencyKey, "create", randomUuid)
      };
      return execute("createDashboardClient", payload);
    },

    async assignDashboardResponsible(input = {}) {
      const payload = {
        clientId: requiredClientId(input.clientId),
        dashboardResponsibleCoachId: requiredId(
          input.dashboardResponsibleCoachId,
          "Le coach responsable"
        ),
        responsibilityMode: responsibilityMode(input.responsibilityMode, { optional: true }),
        reason: requiredText(input.reason, "Le motif", { min: 3, max: 240 }),
        idempotencyKey: requiredIdempotencyKey(input.idempotencyKey, "assign", randomUuid)
      };
      return execute("assignDashboardResponsible", payload);
    },

    async linkGhlContact(input = {}) {
      const payload = {
        clientId: requiredClientId(input.clientId),
        contactId: requiredId(input.contactId, "Le contact GHL"),
        reason: requiredText(input.reason, "Le motif", { min: 3, max: 240 }),
        idempotencyKey: requiredIdempotencyKey(input.idempotencyKey, "link_ghl", randomUuid)
      };
      return execute("linkGhlContact", payload);
    },

    async proposeCoachRxLink(input = {}) {
      const payload = {
        clientId: requiredClientId(input.clientId),
        sourceClientId: requiredId(input.sourceClientId, "Le client CoachRx"),
        coachRxOwnerId: requiredId(input.coachRxOwnerId, "Le coach CoachRx"),
        reason: requiredText(input.reason, "Le motif", { min: 3, max: 240 }),
        idempotencyKey: requiredIdempotencyKey(input.idempotencyKey, "propose_coachrx", randomUuid)
      };
      const importRunId = cleanString(input.importRunId);
      if (importRunId) payload.importRunId = requiredId(importRunId, "Le lot d'import");
      return execute("proposeCoachRxLink", payload);
    },

    async confirmCoachRxLink(input = {}) {
      const payload = {
        clientId: requiredClientId(input.clientId),
        expectedSourceClientId: requiredId(input.expectedSourceClientId, "Le client CoachRx attendu"),
        expectedCoachRxOwnerId: requiredId(input.expectedCoachRxOwnerId, "Le coach CoachRx attendu"),
        responsibilityMode: responsibilityMode(input.responsibilityMode),
        reason: requiredText(input.reason, "Le motif", { min: 3, max: 240 }),
        idempotencyKey: requiredIdempotencyKey(input.idempotencyKey, "confirm_coachrx", randomUuid)
      };
      return execute("confirmCoachRxLink", payload);
    }
  });
}
