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
    let identifiedCount = 0;
    let missingCount = 0;

    (clients || []).forEach((client) => {
      const identity = resolve(client);
      if (!identity.value) {
        missingCount += 1;
        return;
      }
      identifiedCount += 1;
      bySource[identity.source] = (bySource[identity.source] || 0) + 1;
      byKind[identity.kind] = (byKind[identity.kind] || 0) + 1;
    });

    return {
      totalCount: Array.isArray(clients) ? clients.length : 0,
      identifiedCount,
      missingCount,
      bySource,
      byKind
    };
  }

  scope.CFSBCoachRxIdentity = { resolve, summarize };
})(globalThis);
