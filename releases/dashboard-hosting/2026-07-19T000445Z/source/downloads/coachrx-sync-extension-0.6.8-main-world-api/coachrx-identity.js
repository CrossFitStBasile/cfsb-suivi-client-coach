(function attachCoachRxIdentity(scope) {
  "use strict";

  const ID_PATHS = [
    ["id", ["id"]],
    ["client_id", ["client_id"]],
    ["clientId", ["clientId"]],
    ["uuid", ["uuid"]],
    ["client.id", ["client", "id"]],
    ["client.client_id", ["client", "client_id"]],
    ["client.clientId", ["client", "clientId"]],
    ["client.uuid", ["client", "uuid"]],
    ["client.user.id", ["client", "user", "id"]],
    ["client.user.user_id", ["client", "user", "user_id"]],
    ["client.user.uuid", ["client", "user", "uuid"]],
    ["client.athlete.id", ["client", "athlete", "id"]],
    ["client.athlete.uuid", ["client", "athlete", "uuid"]],
    ["client.member.id", ["client", "member", "id"]],
    ["client.member.uuid", ["client", "member", "uuid"]],
    ["user.id", ["user", "id"]],
    ["user.user_id", ["user", "user_id"]],
    ["user.uuid", ["user", "uuid"]],
    ["athlete.id", ["athlete", "id"]],
    ["athlete.athlete_id", ["athlete", "athlete_id"]],
    ["athlete.uuid", ["athlete", "uuid"]],
    ["member.id", ["member", "id"]],
    ["member.member_id", ["member", "member_id"]],
    ["member.uuid", ["member", "uuid"]],
    ["contact.id", ["contact", "id"]],
    ["contact.contact_id", ["contact", "contact_id"]]
  ];

  const SLUG_PATHS = [
    ["slug", ["slug"]],
    ["client_slug", ["client_slug"]],
    ["client.slug", ["client", "slug"]],
    ["client.user.slug", ["client", "user", "slug"]],
    ["client.athlete.slug", ["client", "athlete", "slug"]],
    ["client.member.slug", ["client", "member", "slug"]],
    ["user.slug", ["user", "slug"]],
    ["athlete.slug", ["athlete", "slug"]],
    ["member.slug", ["member", "slug"]]
  ];

  const URL_PATHS = [
    ["url", ["url"]],
    ["profile_url", ["profile_url"]],
    ["client.url", ["client", "url"]],
    ["client.profile_url", ["client", "profile_url"]],
    ["client.user.url", ["client", "user", "url"]],
    ["client.athlete.url", ["client", "athlete", "url"]],
    ["client.member.url", ["client", "member", "url"]],
    ["user.url", ["user", "url"]],
    ["athlete.url", ["athlete", "url"]],
    ["member.url", ["member", "url"]]
  ];

  // CoachRx remains the source of portfolio ownership. Contact fields are
  // carried only as matching evidence for the private reconciliation flow.
  const PHONE_PATHS = [
    ["phone", ["phone"]],
    ["phone_number", ["phone_number"]],
    ["phoneNumber", ["phoneNumber"]],
    ["mobile", ["mobile"]],
    ["mobile_phone", ["mobile_phone"]],
    ["mobilePhone", ["mobilePhone"]],
    ["cell", ["cell"]],
    ["telephone", ["telephone"]],
    ["contact.phone", ["contact", "phone"]],
    ["contact.mobile", ["contact", "mobile"]],
    ["client.phone", ["client", "phone"]],
    ["client.phone_number", ["client", "phone_number"]],
    ["client.mobile", ["client", "mobile"]],
    ["client.contact.phone", ["client", "contact", "phone"]],
    ["client.user.phone", ["client", "user", "phone"]],
    ["client.user.mobile", ["client", "user", "mobile"]],
    ["user.phone", ["user", "phone"]],
    ["user.phone_number", ["user", "phone_number"]],
    ["user.mobile", ["user", "mobile"]],
    ["athlete.phone", ["athlete", "phone"]],
    ["athlete.mobile", ["athlete", "mobile"]],
    ["member.phone", ["member", "phone"]],
    ["member.mobile", ["member", "mobile"]]
  ];

  const EMAIL_PATHS = [
    ["email", ["email"]],
    ["email_address", ["email_address"]],
    ["emailAddress", ["emailAddress"]],
    ["contact.email", ["contact", "email"]],
    ["client.email", ["client", "email"]],
    ["client.email_address", ["client", "email_address"]],
    ["client.contact.email", ["client", "contact", "email"]],
    ["client.user.email", ["client", "user", "email"]],
    ["user.email", ["user", "email"]],
    ["user.email_address", ["user", "email_address"]],
    ["athlete.email", ["athlete", "email"]],
    ["member.email", ["member", "email"]]
  ];

  function text(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function readPath(value, path) {
    return path.reduce((current, key) => (
      current && typeof current === "object" ? current[key] : undefined
    ), value);
  }

  function normalizeId(value) {
    const candidate = text(value);
    const lowered = candidate.toLowerCase();
    if (!candidate || candidate.length > 180 || /\s/.test(candidate)) return "";
    if (["undefined", "null", "[object object]", "n/a", "not set"].includes(lowered)) return "";
    return candidate;
  }

  function normalizeSlug(value) {
    let candidate = text(value);
    if (!candidate) return "";

    try {
      if (/^https?:\/\//i.test(candidate)) {
        const url = new URL(candidate);
        candidate = url.pathname;
      }
    } catch {
      return "";
    }

    const pathMatch = candidate.match(/\/clients\/([^/?#]+)/i);
    if (pathMatch) candidate = pathMatch[1];
    candidate = decodeURIComponent(candidate).replace(/^\/+|\/+$/g, "");
    const lowered = candidate.toLowerCase();
    if (!candidate || candidate.length > 180) return "";
    if (["clients", "client", "new", "index", "undefined", "null", "not-set"].includes(lowered)) return "";
    return /^[a-z0-9][a-z0-9._-]{1,179}$/i.test(candidate) ? candidate : "";
  }

  function contactScalar(value, kind, depth = 0) {
    if (depth > 3 || value === undefined || value === null) return "";
    if (Array.isArray(value)) {
      for (const item of value) {
        const candidate = contactScalar(item, kind, depth + 1);
        if (candidate) return candidate;
      }
      return "";
    }
    if (typeof value === "object") {
      const keys = kind === "phone"
        ? ["normalized", "e164", "international", "formatted", "number", "phone", "phone_number", "mobile", "cell", "telephone", "value", "raw"]
        : ["email", "email_address", "address", "value", "raw"];
      for (const key of keys) {
        const candidate = contactScalar(value[key], kind, depth + 1);
        if (candidate) return candidate;
      }
      return "";
    }
    const candidate = text(value);
    if (kind === "phone") {
      const digits = candidate.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 18 ? candidate : "";
    }
    if (kind === "email") {
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate) && candidate.length <= 254 ? candidate : "";
    }
    return "";
  }

  function resolveContactField(client, paths, kind) {
    for (const [source, path] of paths) {
      const value = contactScalar(readPath(client, path), kind);
      if (value) return { value, source };
    }
    return { value: "", source: "" };
  }

  function resolveContact(client) {
    const phone = resolveContactField(client, PHONE_PATHS, "phone");
    const email = resolveContactField(client, EMAIL_PATHS, "email");
    return {
      phone: phone.value,
      phoneSource: phone.source,
      email: email.value,
      emailSource: email.source
    };
  }

  function resolve(client) {
    for (const [source, path] of ID_PATHS) {
      const value = normalizeId(readPath(client, path));
      if (value) return { value: `id:${value}`, kind: "id", source };
    }

    for (const [source, path] of SLUG_PATHS) {
      const value = normalizeSlug(readPath(client, path));
      if (value) return { value: `slug:${value}`, kind: "slug", source };
    }

    for (const [source, path] of URL_PATHS) {
      const value = normalizeSlug(readPath(client, path));
      if (value) return { value: `slug:${value}`, kind: "url_slug", source };
    }

    return { value: "", kind: "", source: "" };
  }

  function summarize(clients) {
    const bySource = {};
    const byKind = {};
    const phoneBySource = {};
    const emailBySource = {};
    let identifiedCount = 0;
    let missingCount = 0;
    let withPhoneCount = 0;
    let withEmailCount = 0;

    (clients || []).forEach((client) => {
      const identity = resolve(client);
      const contact = resolveContact(client);
      if (!identity.value) {
        missingCount += 1;
      } else {
        identifiedCount += 1;
        bySource[identity.source] = (bySource[identity.source] || 0) + 1;
        byKind[identity.kind] = (byKind[identity.kind] || 0) + 1;
      }
      if (contact.phone) {
        withPhoneCount += 1;
        phoneBySource[contact.phoneSource] = (phoneBySource[contact.phoneSource] || 0) + 1;
      }
      if (contact.email) {
        withEmailCount += 1;
        emailBySource[contact.emailSource] = (emailBySource[contact.emailSource] || 0) + 1;
      }
    });

    return {
      totalCount: Array.isArray(clients) ? clients.length : 0,
      identifiedCount,
      missingCount,
      bySource,
      byKind,
      withPhoneCount,
      withEmailCount,
      phoneBySource,
      emailBySource
    };
  }

  scope.CFSBCoachRxIdentity = { resolve, resolveContact, summarize };
})(globalThis);
