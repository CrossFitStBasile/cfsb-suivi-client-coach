"use strict";

const { createHash } = require("node:crypto");

const SCHEMA_VERSION = "questionnaire-studio/v1";
const FIELD_TYPES = Object.freeze([
  "short_text",
  "long_text",
  "yes_no",
  "single_choice",
  "multi_choice",
  "number",
  "scale",
  "date",
  "info"
]);
const CONDITION_OPERATORS = Object.freeze([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "contains",
  "lt",
  "lte",
  "gt",
  "gte",
  "is_answered",
  "is_not_answered"
]);
const TRIAGE_LEVELS = Object.freeze(["green", "yellow", "red"]);
const REVIEW_STATUS_BY_LEVEL = Object.freeze({
  green: "archived",
  yellow: "to_read",
  red: "followup_required"
});
const BENCHMARK_LEVELS = new Set([
  "optimal",
  "good",
  "acceptable",
  "problematic",
  "information"
]);
const FIELD_TYPE_SET = new Set(FIELD_TYPES);
const CONDITION_OPERATOR_SET = new Set(CONDITION_OPERATORS);
const TRIAGE_LEVEL_SET = new Set(TRIAGE_LEVELS);
const ID_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const VERSION_PATTERN = /^[0-9]+(?:\.[0-9]+){0,2}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const RESERVED_LEGACY_GHL_TAGS = new Set([
  "dashboardcoach",
  "suiviregulier",
  "evaluationnutrition"
]);
const MAX_SECTIONS = 24;
const MAX_FIELDS_PER_SECTION = 32;
const MAX_FIELDS = 120;
const MAX_RULES = 32;
const MAX_CONDITIONS = 12;
const MAX_DRAFT_BYTES = 256 * 1024;

class QuestionnaireStudioError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "QuestionnaireStudioError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new QuestionnaireStudioError(code, message, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(value, field) {
  if (!isPlainObject(value)) {
    fail("invalid_schema", `${field} doit être un objet simple.`, { field });
  }
  return value;
}

function assertAllowedKeys(value, allowed, field) {
  requirePlainObject(value, field);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    fail("unknown_schema_key", `${field} contient des clés non permises.`, {
      field,
      keys: unexpected.sort()
    });
  }
}

function requireBoolean(value, field, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "boolean") {
    fail("invalid_schema", `${field} doit être un booléen.`, { field });
  }
  return value;
}

function requireFiniteNumber(value, field, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail("invalid_schema", `${field} doit être un nombre fini entre ${min} et ${max}.`, { field });
  }
  return Object.is(value, -0) ? 0 : value;
}

function requireInteger(value, field, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail("invalid_schema", `${field} doit être un entier entre ${min} et ${max}.`, { field });
  }
  return value;
}

function cleanText(value, field, { min = 0, max = 256, collapse = true } = {}) {
  if (typeof value !== "string") {
    fail("invalid_schema", `${field} doit être du texte.`, { field });
  }
  const normalized = collapse
    ? value.trim().replace(/\s+/gu, " ")
    : value.trim();
  if (normalized.length < min || normalized.length > max) {
    fail("invalid_schema", `${field} doit contenir entre ${min} et ${max} caractères.`, { field });
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) {
    fail("invalid_schema", `${field} contient des caractères de contrôle.`, { field });
  }
  return normalized;
}

function optionalText(value, field, options = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  return cleanText(value, field, options);
}

function normalizeId(value, field) {
  const normalized = cleanText(value, field, { min: 1, max: 64 }).toLowerCase();
  if (!ID_PATTERN.test(normalized)) {
    fail("invalid_id", `${field} doit commencer par une lettre et contenir seulement a-z, 0-9 ou _.`, {
      field
    });
  }
  return normalized;
}

function normalizeSlug(value) {
  const raw = cleanText(value, "slug", { min: 1, max: 160 });
  if (/[/?#\\%]/u.test(raw)) {
    fail("invalid_slug", "Le slug ne peut contenir ni chemin, ni paramètre, ni fragment.", { field: "slug" });
  }
  const normalized = raw
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[_\s]+/gu, "-")
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  if (
    normalized.length < 3 ||
    normalized.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(normalized)
  ) {
    fail("invalid_slug", "Le slug normalisé doit contenir de 3 à 80 caractères URL sûrs.", { field: "slug" });
  }
  return normalized;
}

function normalizeTag(value) {
  const normalized = cleanText(value, "ghlTag", { min: 1, max: 80 }).toLowerCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(normalized)) {
    fail("invalid_ghl_tag", "Le tag GHL contient des caractères non permis.", { field: "ghlTag" });
  }
  if (RESERVED_LEGACY_GHL_TAGS.has(normalized)) {
    fail(
      "reserved_ghl_tag",
      "Ce tag GHL est réservé à un questionnaire historique et ne peut pas être réutilisé dans le Studio.",
      { field: "ghlTag", tag: normalized }
    );
  }
  return normalized;
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function canonicalPathForSlug(slugInput) {
  return `/questionnaire/f/${normalizeSlug(slugInput)}`;
}

function normalizeHttpsUrl(value, field) {
  const text = cleanText(value, field, { min: 8, max: 2048, collapse: false });
  let url;
  try {
    url = new URL(text);
  } catch (_error) {
    fail("invalid_url", `${field} doit être une URL valide.`, { field });
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash
  ) {
    fail("invalid_url", `${field} doit être une URL HTTPS sans identifiants ni fragment.`, { field });
  }
  return url.toString();
}

function normalizeDateString(value, field) {
  const normalized = cleanText(value, field, { min: 10, max: 10 });
  if (!DATE_PATTERN.test(normalized)) {
    fail("invalid_schema", `${field} doit être une date AAAA-MM-JJ.`, { field });
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    fail("invalid_schema", `${field} n'est pas une date réelle.`, { field });
  }
  return normalized;
}

function normalizeVersion(value) {
  const version = cleanText(value, "version", { min: 1, max: 32 });
  if (!VERSION_PATTERN.test(version)) {
    fail("invalid_version", "La version doit être numérique, par exemple 1, 1.2 ou 1.2.3.", {
      field: "version"
    });
  }
  return version;
}

function normalizePublishedAt(value) {
  const text = cleanText(value, "publishedAt", { min: 20, max: 40 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== text) {
    fail("invalid_published_at", "publishedAt doit être une date ISO UTC canonique.", {
      field: "publishedAt"
    });
  }
  return text;
}

function normalizeIdentityPolicy(input) {
  if (input === undefined) {
    return {
      phoneRequired: true,
      nameRequired: true,
      emailRequired: false
    };
  }
  assertAllowedKeys(
    input,
    new Set(["phoneRequired", "nameRequired", "emailRequired"]),
    "identity"
  );
  const phoneRequired = requireBoolean(input.phoneRequired, "identity.phoneRequired", true);
  if (!phoneRequired) {
    fail(
      "invalid_identity_policy",
      "Le téléphone doit rester requis pour le rapprochement serveur; il n'est jamais une identité primaire.",
      { field: "identity.phoneRequired" }
    );
  }
  return {
    phoneRequired,
    nameRequired: requireBoolean(input.nameRequired, "identity.nameRequired", true),
    emailRequired: requireBoolean(input.emailRequired, "identity.emailRequired", false)
  };
}

function normalizeSettings(input) {
  if (input === undefined) {
    return {
      kind: "custom",
      estimatedSeconds: 120,
      cadenceDays: [],
      submitLabel: "Envoyer mes réponses",
      successMessage: "Merci. Tes réponses ont bien été reçues."
    };
  }
  assertAllowedKeys(
    input,
    new Set([
      "kind",
      "estimatedSeconds",
      "cadenceDays",
      "submitLabel",
      "successMessage"
    ]),
    "settings"
  );
  const kind = cleanText(input.kind ?? "custom", "settings.kind", { min: 1, max: 32 }).toLowerCase();
  if (!["quarterly", "check_in", "assessment", "education", "custom"].includes(kind)) {
    fail("invalid_settings", "settings.kind est invalide.", { field: "settings.kind" });
  }
  const cadenceInput = input.cadenceDays ?? [];
  if (!Array.isArray(cadenceInput) || cadenceInput.length > 8) {
    fail("invalid_settings", "settings.cadenceDays doit être un tableau d'au plus 8 valeurs.", {
      field: "settings.cadenceDays"
    });
  }
  const cadenceDays = [...new Set(cadenceInput.map((value, index) => requireInteger(
    value,
    `settings.cadenceDays[${index}]`,
    { min: 1, max: 3650 }
  )))].sort((a, b) => a - b);
  return {
    kind,
    estimatedSeconds: requireInteger(
      input.estimatedSeconds ?? 120,
      "settings.estimatedSeconds",
      { min: 10, max: 7200 }
    ),
    cadenceDays,
    submitLabel: cleanText(
      input.submitLabel ?? "Envoyer mes réponses",
      "settings.submitLabel",
      { min: 1, max: 60 }
    ),
    successMessage: cleanText(
      input.successMessage ?? "Merci. Tes réponses ont bien été reçues.",
      "settings.successMessage",
      { min: 1, max: 500, collapse: false }
    )
  };
}

function normalizeOptions(input, fieldPath) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 30) {
    fail("invalid_options", `${fieldPath}.options doit contenir de 2 à 30 choix.`, {
      field: `${fieldPath}.options`
    });
  }
  const seen = new Set();
  return input.map((option, index) => {
    const path = `${fieldPath}.options[${index}]`;
    let normalized;
    if (typeof option === "string") {
      const text = cleanText(option, path, { min: 1, max: 120 });
      normalized = { value: text, label: text };
    } else {
      assertAllowedKeys(option, new Set(["value", "label", "helpText"]), path);
      normalized = {
        value: cleanText(option.value, `${path}.value`, { min: 1, max: 120, collapse: false }),
        label: cleanText(option.label, `${path}.label`, { min: 1, max: 160 })
      };
      const helpText = optionalText(option.helpText, `${path}.helpText`, {
        min: 1,
        max: 500,
        collapse: false
      });
      if (helpText) normalized.helpText = helpText;
    }
    if (seen.has(normalized.value)) {
      fail("duplicate_option", `La valeur d'option ${normalized.value} est dupliquée.`, {
        field: `${fieldPath}.options`,
        value: normalized.value
      });
    }
    seen.add(normalized.value);
    return normalized;
  });
}

function normalizeValidation(type, input, fieldPath, optionCount = 0) {
  const value = input === undefined ? {} : input;
  requirePlainObject(value, `${fieldPath}.validation`);
  let normalized;

  if (type === "short_text" || type === "long_text") {
    assertAllowedKeys(value, new Set(["minLength", "maxLength"]), `${fieldPath}.validation`);
    const defaultMax = type === "short_text" ? 160 : 2000;
    const minLength = requireInteger(value.minLength ?? 0, `${fieldPath}.validation.minLength`, {
      min: 0,
      max: defaultMax
    });
    const maxLength = requireInteger(value.maxLength ?? defaultMax, `${fieldPath}.validation.maxLength`, {
      min: 1,
      max: type === "short_text" ? 500 : 10000
    });
    if (minLength > maxLength) {
      fail("invalid_validation", "minLength ne peut dépasser maxLength.", { field: fieldPath });
    }
    normalized = { minLength, maxLength };
  } else if (type === "number" || type === "scale") {
    const keys = type === "number"
      ? new Set(["min", "max", "step", "integer"])
      : new Set(["min", "max", "step"]);
    assertAllowedKeys(value, keys, `${fieldPath}.validation`);
    const min = requireFiniteNumber(value.min ?? (type === "scale" ? 1 : -1_000_000_000), `${fieldPath}.validation.min`);
    const max = requireFiniteNumber(value.max ?? (type === "scale" ? 5 : 1_000_000_000), `${fieldPath}.validation.max`);
    if (min >= max) {
      fail("invalid_validation", "La borne min doit être plus petite que max.", { field: fieldPath });
    }
    const step = requireFiniteNumber(value.step ?? (type === "scale" ? 1 : 1), `${fieldPath}.validation.step`, {
      min: Number.EPSILON,
      max: 1_000_000_000
    });
    normalized = { min, max, step };
    if (type === "number") {
      normalized.integer = requireBoolean(
        value.integer,
        `${fieldPath}.validation.integer`,
        false
      );
    }
  } else if (type === "multi_choice") {
    assertAllowedKeys(value, new Set(["minSelections", "maxSelections"]), `${fieldPath}.validation`);
    const minSelections = requireInteger(
      value.minSelections ?? 0,
      `${fieldPath}.validation.minSelections`,
      { min: 0, max: optionCount }
    );
    const maxSelections = requireInteger(
      value.maxSelections ?? optionCount,
      `${fieldPath}.validation.maxSelections`,
      { min: 1, max: optionCount }
    );
    if (minSelections > maxSelections) {
      fail("invalid_validation", "minSelections ne peut dépasser maxSelections.", { field: fieldPath });
    }
    normalized = { minSelections, maxSelections };
  } else if (type === "date") {
    assertAllowedKeys(value, new Set(["min", "max"]), `${fieldPath}.validation`);
    normalized = {};
    if (value.min !== undefined) normalized.min = normalizeDateString(value.min, `${fieldPath}.validation.min`);
    if (value.max !== undefined) normalized.max = normalizeDateString(value.max, `${fieldPath}.validation.max`);
    if (normalized.min && normalized.max && normalized.min > normalized.max) {
      fail("invalid_validation", "La date min ne peut dépasser la date max.", { field: fieldPath });
    }
  } else {
    assertAllowedKeys(value, new Set(), `${fieldPath}.validation`);
    normalized = {};
  }

  return normalized;
}

function feedbackSource(input, path) {
  const normalized = {};
  const sourceLabel = optionalText(input.sourceLabel, `${path}.sourceLabel`, { min: 1, max: 160 });
  const sourceUrl = input.sourceUrl === undefined
    ? undefined
    : normalizeHttpsUrl(input.sourceUrl, `${path}.sourceUrl`);
  if ((sourceLabel && !sourceUrl) || (!sourceLabel && sourceUrl)) {
    fail("invalid_feedback", "Une source éducative doit avoir un libellé et une URL.", { field: path });
  }
  if (sourceLabel) {
    normalized.sourceLabel = sourceLabel;
    normalized.sourceUrl = sourceUrl;
  }
  return normalized;
}

function normalizeFeedbackMessage(input, path) {
  const level = cleanText(input.level, `${path}.level`, { min: 1, max: 32 }).toLowerCase();
  if (!BENCHMARK_LEVELS.has(level)) {
    fail("invalid_feedback", `${path}.level est invalide.`, { field: `${path}.level` });
  }
  return {
    id: normalizeId(input.id, `${path}.id`),
    level,
    label: cleanText(input.label, `${path}.label`, { min: 1, max: 100 }),
    message: cleanText(input.message, `${path}.message`, {
      min: 1,
      max: 1200,
      collapse: false
    }),
    ...feedbackSource(input, path)
  };
}

function normalizeFeedback(input, field, fieldPath) {
  if (input === undefined) return undefined;
  assertAllowedKeys(input, new Set(["kind", "bands", "choices"]), `${fieldPath}.feedback`);
  const kind = cleanText(input.kind, `${fieldPath}.feedback.kind`, { min: 1, max: 32 }).toLowerCase();

  if (kind === "numeric_bands") {
    if (!["number", "scale"].includes(field.type)) {
      fail("invalid_feedback", "numeric_bands est réservé aux champs numériques.", { field: fieldPath });
    }
    if (!Array.isArray(input.bands) || input.bands.length < 1 || input.bands.length > 20) {
      fail("invalid_feedback", `${fieldPath}.feedback.bands doit contenir de 1 à 20 bandes.`, {
        field: `${fieldPath}.feedback.bands`
      });
    }
    if (input.choices !== undefined) {
      fail("invalid_feedback", "numeric_bands ne peut contenir choices.", { field: fieldPath });
    }
    const seenIds = new Set();
    const bands = input.bands.map((band, index) => {
      const path = `${fieldPath}.feedback.bands[${index}]`;
      assertAllowedKeys(
        band,
        new Set([
          "id",
          "level",
          "label",
          "message",
          "min",
          "max",
          "includeMin",
          "includeMax",
          "sourceLabel",
          "sourceUrl"
        ]),
        path
      );
      const message = normalizeFeedbackMessage(band, path);
      if (seenIds.has(message.id)) {
        fail("invalid_feedback", `La bande ${message.id} est dupliquée.`, { field: path });
      }
      seenIds.add(message.id);
      const normalized = {
        ...message,
        includeMin: requireBoolean(band.includeMin, `${path}.includeMin`, true),
        includeMax: requireBoolean(band.includeMax, `${path}.includeMax`, false)
      };
      if (band.min !== undefined) normalized.min = requireFiniteNumber(band.min, `${path}.min`);
      if (band.max !== undefined) normalized.max = requireFiniteNumber(band.max, `${path}.max`);
      if (normalized.min === undefined && normalized.max === undefined) {
        fail("invalid_feedback", "Une bande numérique doit avoir au moins une borne.", { field: path });
      }
      if (
        normalized.min !== undefined &&
        normalized.max !== undefined &&
        (
          normalized.min > normalized.max ||
          (
            normalized.min === normalized.max &&
            !(normalized.includeMin && normalized.includeMax)
          )
        )
      ) {
        fail("invalid_feedback", "Les bornes de la bande numérique sont invalides.", { field: path });
      }
      return normalized;
    });

    const ordered = [...bands].sort((left, right) => {
      const leftMin = left.min === undefined ? -Infinity : left.min;
      const rightMin = right.min === undefined ? -Infinity : right.min;
      return leftMin - rightMin;
    });
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const previousMax = previous.max === undefined ? Infinity : previous.max;
      const currentMin = current.min === undefined ? -Infinity : current.min;
      if (
        previousMax > currentMin ||
        (
          previousMax === currentMin &&
          previous.includeMax &&
          current.includeMin
        )
      ) {
        fail("overlapping_feedback", "Les bandes éducatives numériques ne peuvent se chevaucher.", {
          field: `${fieldPath}.feedback.bands`,
          left: previous.id,
          right: current.id
        });
      }
    }
    return { kind, bands };
  }

  if (kind === "choice_map") {
    if (!["single_choice", "yes_no"].includes(field.type)) {
      fail("invalid_feedback", "choice_map est réservé aux choix simples et oui/non.", { field: fieldPath });
    }
    if (!Array.isArray(input.choices) || input.choices.length < 1 || input.choices.length > 30) {
      fail("invalid_feedback", `${fieldPath}.feedback.choices doit contenir de 1 à 30 choix.`, {
        field: `${fieldPath}.feedback.choices`
      });
    }
    if (input.bands !== undefined) {
      fail("invalid_feedback", "choice_map ne peut contenir bands.", { field: fieldPath });
    }
    const allowedValues = field.type === "yes_no"
      ? new Set([true, false])
      : new Set(field.options.map((option) => option.value));
    const seenValues = new Set();
    const choices = input.choices.map((choice, index) => {
      const path = `${fieldPath}.feedback.choices[${index}]`;
      assertAllowedKeys(
        choice,
        new Set([
          "id",
          "value",
          "level",
          "label",
          "message",
          "sourceLabel",
          "sourceUrl"
        ]),
        path
      );
      const value = field.type === "yes_no"
        ? normalizeBooleanAnswer(choice.value, `${path}.value`)
        : cleanText(choice.value, `${path}.value`, { min: 1, max: 120, collapse: false });
      if (!allowedValues.has(value)) {
        fail("invalid_feedback", "La valeur éducative ne correspond à aucun choix du champ.", {
          field: `${path}.value`
        });
      }
      const valueKey = stableJson(value);
      if (seenValues.has(valueKey)) {
        fail("invalid_feedback", "Une valeur éducative est dupliquée.", { field: `${path}.value` });
      }
      seenValues.add(valueKey);
      return {
        ...normalizeFeedbackMessage(choice, path),
        value
      };
    });
    return { kind, choices };
  }

  fail("invalid_feedback", "Le type de rétroaction éducative est invalide.", {
    field: `${fieldPath}.feedback.kind`
  });
}

function normalizeFieldBase(input, fieldPath) {
  assertAllowedKeys(
    input,
    new Set([
      "id",
      "type",
      "label",
      "required",
      "helpText",
      "placeholder",
      "content",
      "options",
      "validation",
      "visibleWhen",
      "allowManualReveal",
      "feedback"
    ]),
    fieldPath
  );
  const id = normalizeId(input.id, `${fieldPath}.id`);
  const type = cleanText(input.type, `${fieldPath}.type`, { min: 1, max: 32 }).toLowerCase();
  if (!FIELD_TYPE_SET.has(type)) {
    fail("invalid_field_type", `Le type de champ ${type} n'est pas pris en charge.`, {
      field: `${fieldPath}.type`,
      fieldId: id
    });
  }
  const required = requireBoolean(input.required, `${fieldPath}.required`, false);
  const normalized = { id, type };

  if (type === "info") {
    if (required) {
      fail("invalid_field", "Un bloc d'information ne peut être requis.", { field: fieldPath });
    }
    normalized.content = cleanText(input.content, `${fieldPath}.content`, {
      min: 1,
      max: 4000,
      collapse: false
    });
    const label = optionalText(input.label, `${fieldPath}.label`, { min: 1, max: 200 });
    if (label) normalized.label = label;
    for (const forbidden of [
      "helpText",
      "placeholder",
      "options",
      "validation",
      "visibleWhen",
      "allowManualReveal",
      "feedback"
    ]) {
      if (input[forbidden] !== undefined) {
        fail("invalid_field", `Un bloc d'information ne peut contenir ${forbidden}.`, {
          field: `${fieldPath}.${forbidden}`
        });
      }
    }
    return normalized;
  }

  normalized.label = cleanText(input.label, `${fieldPath}.label`, { min: 1, max: 240 });
  normalized.required = required;
  const helpText = optionalText(input.helpText, `${fieldPath}.helpText`, {
    min: 1,
    max: 800,
    collapse: false
  });
  const placeholder = optionalText(input.placeholder, `${fieldPath}.placeholder`, {
    min: 1,
    max: 300,
    collapse: false
  });
  if (helpText) normalized.helpText = helpText;
  if (placeholder) {
    if (!["short_text", "long_text", "number"].includes(type)) {
      fail("invalid_field", "placeholder n'est pas permis pour ce type de champ.", {
        field: `${fieldPath}.placeholder`
      });
    }
    normalized.placeholder = placeholder;
  }
  if (input.content !== undefined) {
    fail("invalid_field", "content est réservé aux blocs d'information.", {
      field: `${fieldPath}.content`
    });
  }

  if (["single_choice", "multi_choice"].includes(type)) {
    normalized.options = normalizeOptions(input.options, fieldPath);
  } else if (input.options !== undefined) {
    fail("invalid_options", "options est réservé aux champs de choix.", {
      field: `${fieldPath}.options`
    });
  }
  normalized.validation = normalizeValidation(
    type,
    input.validation,
    fieldPath,
    normalized.options?.length ?? 0
  );
  return normalized;
}

function normalizeScalarForField(field, value, path) {
  if (field.type === "yes_no") return normalizeBooleanAnswer(value, path);
  if (field.type === "number" || field.type === "scale") {
    const number = normalizeNumberAnswer(value, path);
    validateNumericAnswer(field, number, path);
    return number;
  }
  if (field.type === "single_choice") {
    const answer = cleanText(value, path, { min: 1, max: 120, collapse: false });
    if (!field.options.some((option) => option.value === answer)) {
      fail("invalid_condition", "Une condition utilise une option inconnue.", {
        field: path,
        value: answer
      });
    }
    return answer;
  }
  if (field.type === "date") return normalizeDateString(value, path);
  if (field.type === "short_text" || field.type === "long_text") {
    return cleanText(value, path, {
      min: 0,
      max: field.validation.maxLength,
      collapse: false
    });
  }
  fail("invalid_condition", "Ce type de champ ne peut utiliser cette condition.", { field: path });
}

function normalizeConditionGroup(input, availableFields, path) {
  assertAllowedKeys(input, new Set(["all", "any"]), path);
  const hasAll = Object.hasOwn(input, "all");
  const hasAny = Object.hasOwn(input, "any");
  if (hasAll === hasAny) {
    fail("invalid_condition", `${path} doit contenir exactement all ou any.`, { field: path });
  }
  const mode = hasAll ? "all" : "any";
  const clausesInput = input[mode];
  if (!Array.isArray(clausesInput) || clausesInput.length < 1 || clausesInput.length > MAX_CONDITIONS) {
    fail("invalid_condition", `${path}.${mode} doit contenir de 1 à ${MAX_CONDITIONS} conditions.`, {
      field: `${path}.${mode}`
    });
  }
  const clauses = clausesInput.map((clause, index) => {
    const clausePath = `${path}.${mode}[${index}]`;
    assertAllowedKeys(clause, new Set(["fieldId", "operator", "value"]), clausePath);
    const fieldId = normalizeId(clause.fieldId, `${clausePath}.fieldId`);
    const referencedField = availableFields.get(fieldId);
    if (!referencedField || referencedField.type === "info") {
      fail("invalid_condition_reference", `La condition référence un champ indisponible: ${fieldId}.`, {
        field: `${clausePath}.fieldId`,
        fieldId
      });
    }
    const operator = cleanText(clause.operator, `${clausePath}.operator`, {
      min: 1,
      max: 32
    }).toLowerCase();
    if (!CONDITION_OPERATOR_SET.has(operator)) {
      fail("invalid_condition_operator", `L'opérateur ${operator} n'est pas permis.`, {
        field: `${clausePath}.operator`
      });
    }
    const noValue = operator === "is_answered" || operator === "is_not_answered";
    if (noValue) {
      if (Object.hasOwn(clause, "value")) {
        fail("invalid_condition", `${operator} ne prend aucune valeur.`, { field: clausePath });
      }
      return { fieldId, operator };
    }
    if (!Object.hasOwn(clause, "value")) {
      fail("invalid_condition", `${operator} exige une valeur.`, { field: clausePath });
    }
    if (["lt", "lte", "gt", "gte"].includes(operator)) {
      if (!["number", "scale"].includes(referencedField.type)) {
        fail("invalid_condition", `${operator} exige un champ numérique.`, { field: clausePath });
      }
      return {
        fieldId,
        operator,
        value: normalizeScalarForField(referencedField, clause.value, `${clausePath}.value`)
      };
    }
    if (operator === "contains") {
      if (!["multi_choice", "short_text", "long_text"].includes(referencedField.type)) {
        fail("invalid_condition", "contains exige un texte ou un choix multiple.", { field: clausePath });
      }
      if (referencedField.type === "multi_choice") {
        const value = cleanText(clause.value, `${clausePath}.value`, {
          min: 1,
          max: 120,
          collapse: false
        });
        if (!referencedField.options.some((option) => option.value === value)) {
          fail("invalid_condition", "contains utilise une option inconnue.", { field: clausePath });
        }
        return { fieldId, operator, value };
      }
      return {
        fieldId,
        operator,
        value: cleanText(clause.value, `${clausePath}.value`, {
          min: 1,
          max: referencedField.validation.maxLength,
          collapse: false
        })
      };
    }
    if (operator === "equals" || operator === "not_equals") {
      if (referencedField.type === "multi_choice") {
        fail("invalid_condition", "Utilise contains pour un choix multiple.", { field: clausePath });
      }
      return {
        fieldId,
        operator,
        value: normalizeScalarForField(referencedField, clause.value, `${clausePath}.value`)
      };
    }
    if (operator === "in" || operator === "not_in") {
      if (!Array.isArray(clause.value) || clause.value.length < 1 || clause.value.length > 20) {
        fail("invalid_condition", `${operator} exige un tableau de 1 à 20 valeurs.`, {
          field: `${clausePath}.value`
        });
      }
      if (["short_text", "long_text", "date"].includes(referencedField.type)) {
        fail("invalid_condition", `${operator} n'est pas permis pour ce type de champ.`, {
          field: clausePath
        });
      }
      const values = clause.value.map((item, valueIndex) => {
        if (referencedField.type === "multi_choice") {
          const value = cleanText(item, `${clausePath}.value[${valueIndex}]`, {
            min: 1,
            max: 120,
            collapse: false
          });
          if (!referencedField.options.some((option) => option.value === value)) {
            fail("invalid_condition", "La condition utilise une option inconnue.", {
              field: `${clausePath}.value[${valueIndex}]`
            });
          }
          return value;
        }
        return normalizeScalarForField(
          referencedField,
          item,
          `${clausePath}.value[${valueIndex}]`
        );
      });
      return {
        fieldId,
        operator,
        value: [...new Map(values.map((item) => [stableJson(item), item])).values()]
      };
    }
    fail("invalid_condition_operator", `L'opérateur ${operator} n'est pas permis.`, {
      field: clausePath
    });
  });
  return { [mode]: clauses };
}

function normalizeResponsePolicy(input) {
  if (input === undefined) return { defaultLevel: "green", autoArchiveGreen: true };
  assertAllowedKeys(input, new Set(["defaultLevel", "autoArchiveGreen"]), "responsePolicy");
  const defaultLevel = cleanText(
    input.defaultLevel ?? "green",
    "responsePolicy.defaultLevel",
    { min: 1, max: 16 }
  ).toLowerCase();
  if (!TRIAGE_LEVEL_SET.has(defaultLevel)) {
    fail("invalid_response_policy", "responsePolicy.defaultLevel est invalide.", {
      field: "responsePolicy.defaultLevel"
    });
  }
  const autoArchiveGreen = requireBoolean(
    input.autoArchiveGreen,
    "responsePolicy.autoArchiveGreen",
    true
  );
  if (!autoArchiveGreen) {
    fail(
      "invalid_response_policy",
      "Les réponses vertes doivent être archivées automatiquement pour ne pas créer de bruit.",
      { field: "responsePolicy.autoArchiveGreen" }
    );
  }
  return { defaultLevel, autoArchiveGreen };
}

function normalizeDraft(input) {
  assertAllowedKeys(
    input,
    new Set([
      "schemaVersion",
      "status",
      "slug",
      "title",
      "description",
      "ghlTag",
      "identity",
      "settings",
      "sections",
      "rules",
      "responsePolicy"
    ]),
    "draft"
  );
  if (input.schemaVersion !== undefined && input.schemaVersion !== SCHEMA_VERSION) {
    fail("unsupported_schema_version", `La version de schéma ${input.schemaVersion} n'est pas prise en charge.`, {
      field: "schemaVersion"
    });
  }
  if (input.status !== undefined && input.status !== "draft") {
    fail("invalid_draft_status", "Un brouillon doit avoir le statut draft.", { field: "status" });
  }
  if (!Array.isArray(input.sections) || input.sections.length < 1 || input.sections.length > MAX_SECTIONS) {
    fail("invalid_sections", `Le formulaire doit contenir de 1 à ${MAX_SECTIONS} sections.`, {
      field: "sections"
    });
  }

  const sectionIds = new Set();
  const allFieldIds = new Set();
  const availableAnswerFields = new Map();
  let fieldCount = 0;
  const sections = input.sections.map((section, sectionIndex) => {
    const sectionPath = `sections[${sectionIndex}]`;
    assertAllowedKeys(section, new Set(["id", "title", "description", "fields"]), sectionPath);
    const id = normalizeId(section.id, `${sectionPath}.id`);
    if (sectionIds.has(id)) {
      fail("duplicate_section", `La section ${id} est dupliquée.`, {
        field: `${sectionPath}.id`,
        sectionId: id
      });
    }
    sectionIds.add(id);
    if (
      !Array.isArray(section.fields) ||
      section.fields.length < 1 ||
      section.fields.length > MAX_FIELDS_PER_SECTION
    ) {
      fail(
        "invalid_fields",
        `${sectionPath}.fields doit contenir de 1 à ${MAX_FIELDS_PER_SECTION} champs.`,
        { field: `${sectionPath}.fields` }
      );
    }
    const normalizedSection = {
      id,
      title: cleanText(section.title, `${sectionPath}.title`, { min: 1, max: 180 })
    };
    const description = optionalText(section.description, `${sectionPath}.description`, {
      min: 1,
      max: 1000,
      collapse: false
    });
    if (description) normalizedSection.description = description;

    normalizedSection.fields = section.fields.map((fieldInput, fieldIndex) => {
      const fieldPath = `${sectionPath}.fields[${fieldIndex}]`;
      const field = normalizeFieldBase(fieldInput, fieldPath);
      if (allFieldIds.has(field.id)) {
        fail("duplicate_field", `Le champ ${field.id} est dupliqué.`, {
          field: `${fieldPath}.id`,
          fieldId: field.id
        });
      }
      allFieldIds.add(field.id);
      fieldCount += 1;
      if (fieldCount > MAX_FIELDS) {
        fail("too_many_fields", `Un formulaire ne peut dépasser ${MAX_FIELDS} champs.`, {
          field: "sections"
        });
      }

      if (fieldInput.visibleWhen !== undefined) {
        field.visibleWhen = normalizeConditionGroup(
          fieldInput.visibleWhen,
          availableAnswerFields,
          `${fieldPath}.visibleWhen`
        );
      }
      const allowManualReveal = requireBoolean(
        fieldInput.allowManualReveal,
        `${fieldPath}.allowManualReveal`,
        false
      );
      if (allowManualReveal) {
        if (
          !field.visibleWhen ||
          field.required ||
          !["short_text", "long_text"].includes(field.type)
        ) {
          fail(
            "invalid_manual_reveal",
            "allowManualReveal exige un texte optionnel avec une condition de visibilité.",
            { field: `${fieldPath}.allowManualReveal` }
          );
        }
        field.allowManualReveal = true;
      }
      const feedback = normalizeFeedback(fieldInput.feedback, field, fieldPath);
      if (feedback) field.feedback = feedback;
      if (field.type !== "info") availableAnswerFields.set(field.id, field);
      return field;
    });
    return normalizedSection;
  });

  const rulesInput = input.rules ?? [];
  if (!Array.isArray(rulesInput) || rulesInput.length > MAX_RULES) {
    fail("invalid_rules", `rules doit contenir au plus ${MAX_RULES} règles.`, { field: "rules" });
  }
  const ruleIds = new Set();
  const rules = rulesInput.map((rule, index) => {
    const path = `rules[${index}]`;
    assertAllowedKeys(rule, new Set(["id", "when", "level", "reason"]), path);
    const id = normalizeId(rule.id, `${path}.id`);
    if (ruleIds.has(id)) {
      fail("duplicate_rule", `La règle ${id} est dupliquée.`, { field: `${path}.id` });
    }
    ruleIds.add(id);
    const level = cleanText(rule.level, `${path}.level`, { min: 1, max: 16 }).toLowerCase();
    if (!TRIAGE_LEVEL_SET.has(level)) {
      fail("invalid_triage_level", `Le niveau ${level} est invalide.`, {
        field: `${path}.level`
      });
    }
    return {
      id,
      when: normalizeConditionGroup(rule.when, availableAnswerFields, `${path}.when`),
      level,
      reason: cleanText(rule.reason, `${path}.reason`, {
        min: 1,
        max: 300,
        collapse: false
      })
    };
  });

  const normalized = {
    schemaVersion: SCHEMA_VERSION,
    status: "draft",
    slug: normalizeSlug(input.slug),
    title: cleanText(input.title, "title", { min: 1, max: 180 }),
    description: cleanText(input.description, "description", {
      min: 1,
      max: 1200,
      collapse: false
    }),
    ghlTag: normalizeTag(input.ghlTag),
    identity: normalizeIdentityPolicy(input.identity),
    settings: normalizeSettings(input.settings),
    sections,
    rules,
    responsePolicy: normalizeResponsePolicy(input.responsePolicy)
  };
  const serializedBytes = Buffer.byteLength(stableJson(normalized), "utf8");
  if (serializedBytes > MAX_DRAFT_BYTES) {
    fail(
      "schema_too_large",
      `Le formulaire dépasse la limite de ${MAX_DRAFT_BYTES} octets.`,
      {
        field: "questionnaire",
        serializedBytes,
        maxBytes: MAX_DRAFT_BYTES
      }
    );
  }
  return normalized;
}

function publishDraft(input, options = {}) {
  assertAllowedKeys(options, new Set(["version", "publishedAt"]), "publishOptions");
  const draft = normalizeDraft(input);
  const version = normalizeVersion(options.version);
  const publishedAt = normalizePublishedAt(options.publishedAt ?? new Date().toISOString());
  const core = {
    ...draft,
    status: "published",
    version,
    publishedAt,
    canonicalPath: canonicalPathForSlug(draft.slug)
  };
  const snapshot = {
    ...core,
    versionHash: sha256(stableJson(core))
  };
  return deepFreeze(snapshot);
}

function verifyPublishedSnapshot(input) {
  assertAllowedKeys(
    input,
    new Set([
      "schemaVersion",
      "status",
      "slug",
      "title",
      "description",
      "ghlTag",
      "identity",
      "settings",
      "sections",
      "rules",
      "responsePolicy",
      "version",
      "publishedAt",
      "canonicalPath",
      "versionHash"
    ]),
    "snapshot"
  );
  if (input.status !== "published") {
    fail("definition_not_published", "Le questionnaire doit être une version publiée.", {
      field: "status"
    });
  }
  const draft = normalizeDraft({
    schemaVersion: input.schemaVersion,
    status: "draft",
    slug: input.slug,
    title: input.title,
    description: input.description,
    ghlTag: input.ghlTag,
    identity: input.identity,
    settings: input.settings,
    sections: input.sections,
    rules: input.rules,
    responsePolicy: input.responsePolicy
  });
  const core = {
    ...draft,
    status: "published",
    version: normalizeVersion(input.version),
    publishedAt: normalizePublishedAt(input.publishedAt),
    canonicalPath: canonicalPathForSlug(draft.slug)
  };
  if (input.canonicalPath !== core.canonicalPath) {
    fail("invalid_canonical_path", "Le chemin public ne correspond pas au slug publié.", {
      expected: core.canonicalPath
    });
  }
  if (typeof input.versionHash !== "string" || !HASH_PATTERN.test(input.versionHash)) {
    fail("invalid_version_hash", "Le hash de version n'est pas un SHA-256 base64url valide.", {
      field: "versionHash"
    });
  }
  const expectedHash = sha256(stableJson(core));
  if (input.versionHash !== expectedHash) {
    fail("version_hash_mismatch", "La version publiée a été modifiée après publication.", {
      expectedVersionHash: expectedHash
    });
  }
  return deepFreeze({ ...core, versionHash: expectedHash });
}

function isMissing(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

function normalizeBooleanAnswer(value, field) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "oui", "yes"].includes(normalized)) return true;
    if (["false", "non", "no"].includes(normalized)) return false;
  }
  fail("invalid_answer_type", `${field} doit être oui/non.`, { field, expectedType: "boolean" });
}

function normalizeNumberAnswer(value, field) {
  let normalized = value;
  if (typeof normalized === "string" && normalized.trim() !== "") {
    const text = normalized.trim();
    if (!/^-?(?:\d+|\d*\.\d+)$/u.test(text)) {
      fail("invalid_answer_type", `${field} doit être numérique.`, {
        field,
        expectedType: "number"
      });
    }
    normalized = Number(text);
  }
  if (typeof normalized !== "number" || !Number.isFinite(normalized)) {
    fail("invalid_answer_type", `${field} doit être un nombre fini.`, {
      field,
      expectedType: "number"
    });
  }
  return Object.is(normalized, -0) ? 0 : normalized;
}

function validateNumericAnswer(field, value, path) {
  const { min, max, step, integer } = field.validation;
  if (value < min || value > max) {
    fail("answer_out_of_range", `${path} doit être entre ${min} et ${max}.`, {
      fieldId: field.id,
      min,
      max
    });
  }
  if (integer && !Number.isInteger(value)) {
    fail("invalid_answer_step", `${path} doit être un entier.`, { fieldId: field.id });
  }
  const steps = (value - min) / step;
  if (Math.abs(steps - Math.round(steps)) > 1e-8) {
    fail("invalid_answer_step", `${path} ne respecte pas le pas de ${step}.`, {
      fieldId: field.id,
      step
    });
  }
}

function normalizeAnswer(field, value, path = `answers.${field.id}`) {
  if (field.type === "yes_no") return normalizeBooleanAnswer(value, path);
  if (field.type === "number" || field.type === "scale") {
    const number = normalizeNumberAnswer(value, path);
    validateNumericAnswer(field, number, path);
    return number;
  }
  if (field.type === "short_text" || field.type === "long_text") {
    if (typeof value !== "string") {
      fail("invalid_answer_type", `${path} doit être du texte.`, {
        fieldId: field.id,
        expectedType: "string"
      });
    }
    const answer = cleanText(value, path, {
      min: field.validation.minLength,
      max: field.validation.maxLength,
      collapse: false
    });
    if (field.type === "short_text" && /[\r\n]/u.test(answer)) {
      fail("invalid_answer_type", `${path} doit rester sur une seule ligne.`, {
        fieldId: field.id
      });
    }
    return answer;
  }
  if (field.type === "single_choice") {
    if (typeof value !== "string") {
      fail("invalid_answer_type", `${path} doit être un choix.`, {
        fieldId: field.id,
        expectedType: "string"
      });
    }
    const answer = value.trim();
    if (!field.options.some((option) => option.value === answer)) {
      fail("invalid_option", `${path} contient une option inconnue.`, {
        fieldId: field.id,
        value: answer
      });
    }
    return answer;
  }
  if (field.type === "multi_choice") {
    if (!Array.isArray(value)) {
      fail("invalid_answer_type", `${path} doit être un tableau de choix.`, {
        fieldId: field.id,
        expectedType: "array"
      });
    }
    const answers = value.map((item, index) => {
      if (typeof item !== "string") {
        fail("invalid_answer_type", `${path}[${index}] doit être un choix.`, {
          fieldId: field.id
        });
      }
      const answer = item.trim();
      if (!field.options.some((option) => option.value === answer)) {
        fail("invalid_option", `${path}[${index}] contient une option inconnue.`, {
          fieldId: field.id,
          value: answer
        });
      }
      return answer;
    });
    if (new Set(answers).size !== answers.length) {
      fail("duplicate_answer_option", `${path} contient un choix dupliqué.`, {
        fieldId: field.id
      });
    }
    if (
      answers.length < field.validation.minSelections ||
      answers.length > field.validation.maxSelections
    ) {
      fail("answer_selection_count", `${path} contient un nombre de choix invalide.`, {
        fieldId: field.id,
        minSelections: field.validation.minSelections,
        maxSelections: field.validation.maxSelections
      });
    }
    return answers;
  }
  if (field.type === "date") {
    const answer = normalizeDateString(value, path);
    if (
      (field.validation.min && answer < field.validation.min) ||
      (field.validation.max && answer > field.validation.max)
    ) {
      fail("answer_out_of_range", `${path} est hors de la plage permise.`, {
        fieldId: field.id
      });
    }
    return answer;
  }
  fail("invalid_answer_type", `Le champ ${field.id} ne peut recevoir de réponse.`, {
    fieldId: field.id
  });
}

function conditionMatches(clause, answers) {
  const value = answers[clause.fieldId];
  const answered = !isMissing(value);
  if (clause.operator === "is_answered") return answered;
  if (clause.operator === "is_not_answered") return !answered;
  if (!answered) return false;
  if (clause.operator === "equals") return stableJson(value) === stableJson(clause.value);
  if (clause.operator === "not_equals") return stableJson(value) !== stableJson(clause.value);
  if (clause.operator === "contains") {
    return Array.isArray(value)
      ? value.includes(clause.value)
      : String(value).includes(String(clause.value));
  }
  if (clause.operator === "in") {
    return Array.isArray(value)
      ? value.some((item) => clause.value.some((candidate) => stableJson(candidate) === stableJson(item)))
      : clause.value.some((candidate) => stableJson(candidate) === stableJson(value));
  }
  if (clause.operator === "not_in") {
    return Array.isArray(value)
      ? value.every((item) => clause.value.every((candidate) => stableJson(candidate) !== stableJson(item)))
      : clause.value.every((candidate) => stableJson(candidate) !== stableJson(value));
  }
  if (clause.operator === "lt") return value < clause.value;
  if (clause.operator === "lte") return value <= clause.value;
  if (clause.operator === "gt") return value > clause.value;
  if (clause.operator === "gte") return value >= clause.value;
  return false;
}

function conditionGroupMatches(group, answers) {
  const mode = Object.hasOwn(group, "all") ? "all" : "any";
  return mode === "all"
    ? group.all.every((clause) => conditionMatches(clause, answers))
    : group.any.some((clause) => conditionMatches(clause, answers));
}

function orderedFields(definition) {
  return definition.sections.flatMap((section) => section.fields);
}

function evaluateVisibility(input, answersInput = {}) {
  const definition = verifyPublishedSnapshot(input);
  requirePlainObject(answersInput, "answers");
  const knownAnswerFields = new Map(
    orderedFields(definition)
      .filter((field) => field.type !== "info")
      .map((field) => [field.id, field])
  );
  for (const key of Object.keys(answersInput)) {
    if (!knownAnswerFields.has(key)) {
      fail("unknown_answer", `La réponse contient un champ inconnu: ${key}.`, {
        fieldId: key
      });
    }
  }
  const partialAnswers = {};
  const visibleFieldIds = [];
  for (const field of orderedFields(definition)) {
    if (field.type === "info") {
      visibleFieldIds.push(field.id);
      continue;
    }
    const provided = Object.hasOwn(answersInput, field.id) && !isMissing(answersInput[field.id]);
    let visible = !field.visibleWhen || conditionGroupMatches(field.visibleWhen, partialAnswers);
    if (!visible && field.allowManualReveal && provided) visible = true;
    if (visible) visibleFieldIds.push(field.id);
    if (provided) {
      partialAnswers[field.id] = normalizeAnswer(field, answersInput[field.id]);
    }
  }
  return visibleFieldIds;
}

function normalizePhone(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    fail("invalid_identity", "identity.phone doit être un numéro de téléphone.", {
      field: "identity.phone"
    });
  }
  let digits = String(value).replace(/\D/gu, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10 || /^[01]/u.test(digits)) {
    fail("invalid_identity", "identity.phone doit contenir un numéro nord-américain valide à 10 chiffres.", {
      field: "identity.phone"
    });
  }
  return digits;
}

function normalizeEmail(value, field) {
  const email = cleanText(value, field, { min: 3, max: 254, collapse: false }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    fail("invalid_identity", `${field} n'est pas un courriel valide.`, { field });
  }
  return email;
}

function normalizeSubmissionIdentity(input, policy) {
  assertAllowedKeys(input, new Set(["phone", "name", "email"]), "identity");
  const normalized = {
    phoneNormalized: normalizePhone(input.phone)
  };
  const name = optionalText(input.name, "identity.name", { min: 1, max: 120 });
  const email = input.email === undefined || input.email === ""
    ? undefined
    : normalizeEmail(input.email, "identity.email");
  if (policy.nameRequired && !name) {
    fail("required_identity", "identity.name est requis.", { field: "identity.name" });
  }
  if (policy.emailRequired && !email) {
    fail("required_identity", "identity.email est requis.", { field: "identity.email" });
  }
  if (name) normalized.name = name;
  if (email) normalized.email = email;
  return normalized;
}

function normalizeSourceUrl(value, definition) {
  const text = cleanText(value, "meta.sourceUrl", { min: 1, max: 2048, collapse: false });
  if (text.startsWith("/")) {
    if (text !== definition.canonicalPath) {
      fail("submission_version_mismatch", "meta.sourceUrl ne correspond pas au chemin canonique.", {
        field: "meta.sourceUrl"
      });
    }
    return text;
  }
  let url;
  try {
    url = new URL(text);
  } catch (_error) {
    fail("invalid_url", "meta.sourceUrl doit être un chemin canonique ou une URL HTTPS.", {
      field: "meta.sourceUrl"
    });
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== definition.canonicalPath
  ) {
    fail(
      "invalid_canonical_source",
      "meta.sourceUrl doit pointer exactement vers l'URL statique, sans PII, paramètres ni fragment.",
      { field: "meta.sourceUrl" }
    );
  }
  return `${url.origin}${url.pathname}`;
}

function normalizeSubmissionMeta(input, definition) {
  if (input === undefined) return {};
  assertAllowedKeys(input, new Set(["sourceUrl", "definitionVersion", "versionHash"]), "meta");
  const normalized = {};
  if (input.definitionVersion !== undefined) {
    const version = normalizeVersion(input.definitionVersion);
    if (version !== definition.version) {
      fail("submission_version_mismatch", "La version soumise n'est plus la version affichée.", {
        field: "meta.definitionVersion"
      });
    }
    normalized.definitionVersion = version;
  }
  if (input.versionHash !== undefined) {
    const hash = cleanText(input.versionHash, "meta.versionHash", { min: 43, max: 43 });
    if (hash !== definition.versionHash) {
      fail("submission_version_mismatch", "Le hash soumis ne correspond pas au formulaire affiché.", {
        field: "meta.versionHash"
      });
    }
    normalized.versionHash = hash;
  }
  if (input.sourceUrl !== undefined) {
    normalized.sourceUrl = normalizeSourceUrl(input.sourceUrl, definition);
  }
  return normalized;
}

function feedbackForAnswer(field, value) {
  if (!field.feedback || isMissing(value)) return null;
  if (field.feedback.kind === "choice_map") {
    const choice = field.feedback.choices.find(
      (item) => stableJson(item.value) === stableJson(value)
    );
    if (!choice) return null;
    const { value: _value, ...feedback } = choice;
    return { fieldId: field.id, ...feedback };
  }
  const band = field.feedback.bands.find((candidate) => {
    const aboveMin = candidate.min === undefined ||
      value > candidate.min ||
      (candidate.includeMin && value === candidate.min);
    const belowMax = candidate.max === undefined ||
      value < candidate.max ||
      (candidate.includeMax && value === candidate.max);
    return aboveMin && belowMax;
  });
  if (!band) return null;
  const {
    min: _min,
    max: _max,
    includeMin: _includeMin,
    includeMax: _includeMax,
    ...feedback
  } = band;
  return { fieldId: field.id, ...feedback };
}

function evaluateTriage(input, answersInput) {
  const definition = verifyPublishedSnapshot(input);
  requirePlainObject(answersInput, "answers");
  const severity = { green: 0, yellow: 1, red: 2 };
  const matched = definition.rules.filter((rule) => conditionGroupMatches(rule.when, answersInput));
  let level = definition.responsePolicy.defaultLevel;
  for (const rule of matched) {
    if (severity[rule.level] > severity[level]) level = rule.level;
  }
  const strongest = matched.filter((rule) => severity[rule.level] === severity[level]);
  return {
    level,
    reviewStatus: REVIEW_STATUS_BY_LEVEL[level],
    actionable: level !== "green",
    matchedRuleIds: matched.map((rule) => rule.id),
    reasons: strongest.map((rule) => rule.reason)
  };
}

function validateSubmission(snapshotInput, submissionInput) {
  const definition = verifyPublishedSnapshot(snapshotInput);
  assertAllowedKeys(
    submissionInput,
    new Set(["idempotencyKey", "identity", "answers", "meta"]),
    "submission"
  );
  const idempotencyKey = cleanText(
    submissionInput.idempotencyKey,
    "idempotencyKey",
    { min: 8, max: 128, collapse: false }
  );
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    fail(
      "invalid_idempotency_key",
      "idempotencyKey doit être opaque et contenir seulement lettres, chiffres, point, tiret, _ ou :.",
      { field: "idempotencyKey" }
    );
  }
  const identity = normalizeSubmissionIdentity(
    requirePlainObject(submissionInput.identity, "identity"),
    definition.identity
  );
  const answersInput = requirePlainObject(submissionInput.answers, "answers");
  const answerFields = new Map(
    orderedFields(definition)
      .filter((field) => field.type !== "info")
      .map((field) => [field.id, field])
  );
  for (const key of Object.keys(answersInput)) {
    if (!answerFields.has(key)) {
      fail("unknown_answer", `La réponse contient un champ inconnu: ${key}.`, {
        fieldId: key
      });
    }
  }

  const answers = {};
  const visibleFieldIds = [];
  for (const field of orderedFields(definition)) {
    if (field.type === "info") {
      visibleFieldIds.push(field.id);
      continue;
    }
    const supplied = Object.hasOwn(answersInput, field.id);
    const hasValue = supplied && !isMissing(answersInput[field.id]);
    let visible = !field.visibleWhen || conditionGroupMatches(field.visibleWhen, answers);
    if (!visible && field.allowManualReveal && hasValue) visible = true;
    if (!visible) {
      if (hasValue) {
        fail("hidden_field_answer", `Le champ caché ${field.id} ne peut être soumis.`, {
          fieldId: field.id
        });
      }
      continue;
    }
    visibleFieldIds.push(field.id);
    if (!hasValue) {
      if (field.required) {
        fail("required_answer", `Une réponse est requise pour ${field.id}.`, {
          fieldId: field.id
        });
      }
      continue;
    }
    answers[field.id] = normalizeAnswer(field, answersInput[field.id]);
  }

  const triage = evaluateTriage(definition, answers);
  const feedback = orderedFields(definition)
    .filter((field) => Object.hasOwn(answers, field.id))
    .map((field) => feedbackForAnswer(field, answers[field.id]))
    .filter(Boolean);
  const meta = normalizeSubmissionMeta(submissionInput.meta, definition);
  const submissionFingerprint = sha256(stableJson({
    slug: definition.slug,
    version: definition.version,
    versionHash: definition.versionHash,
    identity,
    answers
  }));
  const idempotencyScope = `${definition.slug}:${definition.version}:${idempotencyKey}`;

  return deepFreeze({
    ok: true,
    slug: definition.slug,
    version: definition.version,
    versionHash: definition.versionHash,
    canonicalPath: definition.canonicalPath,
    idempotencyKey,
    idempotencyScope,
    submissionFingerprint,
    identity,
    answers,
    visibleFieldIds,
    feedback,
    triage,
    meta
  });
}

function createIdempotencyRecord(validatedSubmission) {
  requirePlainObject(validatedSubmission, "validatedSubmission");
  if (
    validatedSubmission.ok !== true ||
    typeof validatedSubmission.idempotencyScope !== "string" ||
    typeof validatedSubmission.submissionFingerprint !== "string" ||
    !HASH_PATTERN.test(validatedSubmission.submissionFingerprint)
  ) {
    fail("invalid_idempotency_record", "La soumission validée ne contient pas les preuves d'idempotence.", {
      field: "validatedSubmission"
    });
  }
  return deepFreeze({
    idempotencyScope: validatedSubmission.idempotencyScope,
    submissionFingerprint: validatedSubmission.submissionFingerprint
  });
}

function checkIdempotentReplay(existingInput, validatedSubmission) {
  const candidate = createIdempotencyRecord(validatedSubmission);
  if (existingInput === null || existingInput === undefined) {
    return { duplicate: false, record: candidate };
  }
  assertAllowedKeys(
    existingInput,
    new Set(["idempotencyScope", "submissionFingerprint"]),
    "existingIdempotency"
  );
  if (existingInput.idempotencyScope !== candidate.idempotencyScope) {
    fail("idempotency_scope_mismatch", "La preuve existante n'appartient pas à cette clé.", {
      expected: candidate.idempotencyScope
    });
  }
  if (existingInput.submissionFingerprint !== candidate.submissionFingerprint) {
    fail(
      "idempotency_conflict",
      "La même clé d'idempotence a déjà été utilisée avec un autre contenu.",
      { idempotencyScope: candidate.idempotencyScope }
    );
  }
  return { duplicate: true, record: candidate };
}

const INITIAL_DRAFT_INPUTS = {
  quarterly: {
    slug: "bilan-90-jours",
    title: "Bilan 90 jours",
    description:
      "Un bilan trimestriel pour reconnaître les progrès, vérifier que le plan reste adapté et choisir la prochaine priorité avec ton entraîneur.",
    ghlTag: "cfsb-bilan-90-jours-v1",
    identity: { phoneRequired: true, nameRequired: true, emailRequired: false },
    settings: {
      kind: "quarterly",
      estimatedSeconds: 360,
      cadenceDays: [90],
      submitLabel: "Envoyer mon bilan",
      successMessage:
        "Merci. Ton bilan est enregistré. Ton entraîneur pourra s'en servir pour préparer votre prochaine discussion."
    },
    sections: [
      {
        id: "progression",
        title: "Progression et objectif",
        description: "Pense aux 90 derniers jours et réponds selon ta réalité actuelle.",
        fields: [
          {
            id: "quarterly_intro",
            type: "info",
            label: "À propos de ce bilan",
            content:
              "Il n'y a pas de bonne ou de mauvaise réponse. Le but est de voir rapidement ce qui fonctionne et ce qui mérite un ajustement."
          },
          {
            id: "progression_global",
            type: "scale",
            label: "Depuis le dernier bilan, comment évalues-tu ta progression globale?",
            required: true,
            helpText: "1 = très difficile, 5 = très bien",
            validation: { min: 1, max: 5, step: 1 }
          },
          {
            id: "progression_reason",
            type: "long_text",
            label: "Qu'est-ce qui explique surtout ta réponse?",
            required: false,
            placeholder: "Une situation, un progrès ou une difficulté qui a influencé ton bilan.",
            validation: { minLength: 0, maxLength: 1200 }
          },
          {
            id: "proud_progress",
            type: "long_text",
            label: "Quelle progression ou victoire te rend le plus fier ou la plus fière?",
            required: true,
            placeholder: "Décris une victoire, même petite.",
            validation: { minLength: 2, maxLength: 1200 }
          },
          {
            id: "goal_importance",
            type: "single_choice",
            label: "Ton objectif actuel est-il toujours important pour toi?",
            required: true,
            options: [
              { value: "yes", label: "Oui" },
              { value: "adjust", label: "À ajuster" },
              { value: "unsure", label: "Je ne suis plus certain(e)" }
            ]
          },
          {
            id: "goal_adjustment",
            type: "long_text",
            label: "Qu'aimerais-tu changer ou clarifier dans ton objectif?",
            required: false,
            placeholder: "Écris ce que tu aimerais ajuster.",
            validation: { minLength: 0, maxLength: 1200 },
            visibleWhen: {
              all: [
                { fieldId: "goal_importance", operator: "not_equals", value: "yes" }
              ]
            },
            allowManualReveal: true
          }
        ]
      },
      {
        id: "current_reality",
        title: "Réalité actuelle et accompagnement",
        fields: [
          {
            id: "main_obstacle",
            type: "single_choice",
            label: "Quel est présentement le principal obstacle à ta progression?",
            required: true,
            options: [
              { value: "schedule", label: "Horaire" },
              { value: "energy", label: "Énergie" },
              { value: "motivation", label: "Motivation" },
              { value: "stress", label: "Stress" },
              { value: "sleep", label: "Sommeil" },
              { value: "nutrition", label: "Alimentation" },
              { value: "pain", label: "Douleur ou limitation" },
              { value: "organization", label: "Organisation" },
              { value: "plan_understanding", label: "Compréhension du plan" },
              { value: "none", label: "Rien de majeur" },
              { value: "other", label: "Autre" }
            ]
          },
          {
            id: "program_fit",
            type: "scale",
            label: "Dans quelle mesure ton programme correspond-il à ta réalité actuelle?",
            required: true,
            helpText: "1 = pas du tout, 5 = tout à fait",
            validation: { min: 1, max: 5, step: 1 }
          },
          {
            id: "program_adaptation",
            type: "long_text",
            label: "Qu'est-ce qui devrait être mieux adapté?",
            required: false,
            validation: { minLength: 0, maxLength: 1200 },
            visibleWhen: {
              all: [
                { fieldId: "program_fit", operator: "lte", value: 3 }
              ]
            },
            allowManualReveal: true
          },
          {
            id: "coach_support",
            type: "scale",
            label: "Le soutien et les communications de ton entraîneur répondent-ils à tes besoins?",
            required: true,
            helpText: "1 = pas suffisamment, 5 = tout à fait",
            validation: { min: 1, max: 5, step: 1 }
          }
        ]
      },
      {
        id: "next_steps",
        title: "Prochaine étape et suivi",
        fields: [
          {
            id: "upcoming_change",
            type: "yes_no",
            label: "Prévois-tu un changement important qui pourrait influencer ton entraînement?",
            required: true
          },
          {
            id: "upcoming_change_details",
            type: "long_text",
            label: "Quel changement devrait être pris en compte?",
            required: false,
            validation: { minLength: 0, maxLength: 1200 },
            visibleWhen: {
              all: [
                { fieldId: "upcoming_change", operator: "equals", value: true }
              ]
            },
            allowManualReveal: true
          },
          {
            id: "pain_limitation",
            type: "yes_no",
            label: "Ressens-tu une douleur ou une limitation qui devrait être discutée?",
            required: true
          },
          {
            id: "pain_details",
            type: "long_text",
            label: "Décris brièvement la douleur ou la limitation.",
            required: false,
            helpText: "Ton entraîneur pourra faire un suivi, sans poser de diagnostic.",
            validation: { minLength: 0, maxLength: 1200 },
            visibleWhen: {
              all: [
                { fieldId: "pain_limitation", operator: "equals", value: true }
              ]
            },
            allowManualReveal: true
          },
          {
            id: "next_priority",
            type: "long_text",
            label: "Quelle devrait être ta priorité principale pour les prochains mois?",
            required: true,
            placeholder: "Écris la priorité qui compte le plus pour toi.",
            validation: { minLength: 2, maxLength: 1200 }
          },
          {
            id: "followup_timing",
            type: "single_choice",
            label: "Quand aimerais-tu que ton entraîneur fasse un suivi avec toi?",
            required: true,
            options: [
              { value: "none", label: "Aucun suivi nécessaire" },
              { value: "this_week", label: "Cette semaine" },
              { value: "asap", label: "Dès que possible" }
            ]
          }
        ]
      },
      {
        id: "inbody_reminder",
        title: "Petit rappel InBody",
        fields: [
          {
            id: "inbody_info",
            type: "info",
            label: "Ton InBody est disponible",
            content:
              "Si ça fait un moment que tu n'as pas fait un InBody et que c'est pertinent pour tes objectifs, tu peux passer au bureau pour le faire de façon autonome, puis en discuter avec ton entraîneur. C'est simplement un rappel; aucune prise de rendez-vous n'est créée par ce questionnaire."
          }
        ]
      }
    ],
    rules: [
      {
        id: "progression_difficult",
        when: { all: [{ fieldId: "progression_global", operator: "lte", value: 2 }] },
        level: "yellow",
        reason: "Le membre évalue sa progression globale à 2 sur 5 ou moins."
      },
      {
        id: "goal_needs_adjustment",
        when: { all: [{ fieldId: "goal_importance", operator: "equals", value: "adjust" }] },
        level: "yellow",
        reason: "Le membre souhaite ajuster son objectif."
      },
      {
        id: "goal_uncertain",
        when: { all: [{ fieldId: "goal_importance", operator: "equals", value: "unsure" }] },
        level: "red",
        reason: "Le membre n'est plus certain de l'importance de son objectif."
      },
      {
        id: "program_fit_low",
        when: { all: [{ fieldId: "program_fit", operator: "lte", value: 2 }] },
        level: "yellow",
        reason: "Le programme correspond peu à la réalité actuelle du membre."
      },
      {
        id: "coach_support_low",
        when: { all: [{ fieldId: "coach_support", operator: "lte", value: 2 }] },
        level: "red",
        reason: "Le soutien ou les communications ne répondent pas suffisamment aux besoins."
      },
      {
        id: "upcoming_change_declared",
        when: { all: [{ fieldId: "upcoming_change", operator: "equals", value: true }] },
        level: "yellow",
        reason: "Un changement important pourrait influencer l'entraînement."
      },
      {
        id: "pain_declared",
        when: { all: [{ fieldId: "pain_limitation", operator: "equals", value: true }] },
        level: "red",
        reason: "Le membre signale une douleur ou une limitation à discuter."
      },
      {
        id: "followup_this_week",
        when: { all: [{ fieldId: "followup_timing", operator: "equals", value: "this_week" }] },
        level: "yellow",
        reason: "Le membre aimerait un suivi cette semaine."
      },
      {
        id: "followup_asap",
        when: { all: [{ fieldId: "followup_timing", operator: "equals", value: "asap" }] },
        level: "red",
        reason: "Le membre demande un suivi dès que possible."
      }
    ],
    responsePolicy: { defaultLevel: "green", autoArchiveGreen: true }
  },
  checkIn: {
    slug: "check-in-express",
    title: "Check-in express",
    description:
      "Trois réponses rapides pour confirmer que le plan va dans la bonne direction. Temps visé: 20 à 30 secondes.",
    ghlTag: "cfsb-check-in-express-v1",
    identity: { phoneRequired: true, nameRequired: true, emailRequired: false },
    settings: {
      kind: "check_in",
      estimatedSeconds: 30,
      cadenceDays: [14, 28],
      submitLabel: "Envoyer mon check-in",
      successMessage: "Merci. Ton check-in est enregistré."
    },
    sections: [
      {
        id: "check_in",
        title: "Ton suivi rapide",
        fields: [
          {
            id: "plan_still_good",
            type: "yes_no",
            label: "Le plan mis en place avec ton entraîneur est-il toujours bon pour toi?",
            required: true
          },
          {
            id: "execution_good",
            type: "yes_no",
            label: "L'exécution du plan va-t-elle bien?",
            required: true
          },
          {
            id: "results_present",
            type: "yes_no",
            label: "Les résultats ou les signes de progression sont-ils là?",
            required: true
          },
          {
            id: "check_in_comment",
            type: "long_text",
            label: "Ajoute un commentaire pour aider ton entraîneur",
            required: false,
            placeholder: "Optionnel",
            validation: { minLength: 0, maxLength: 1200 },
            visibleWhen: {
              any: [
                { fieldId: "plan_still_good", operator: "equals", value: false },
                { fieldId: "execution_good", operator: "equals", value: false },
                { fieldId: "results_present", operator: "equals", value: false }
              ]
            },
            allowManualReveal: true
          }
        ]
      }
    ],
    rules: [
      {
        id: "plan_not_good",
        when: { all: [{ fieldId: "plan_still_good", operator: "equals", value: false }] },
        level: "yellow",
        reason: "Le plan ne semble plus adapté."
      },
      {
        id: "execution_not_good",
        when: { all: [{ fieldId: "execution_good", operator: "equals", value: false }] },
        level: "yellow",
        reason: "L'exécution du plan mérite un ajustement."
      },
      {
        id: "results_not_present",
        when: { all: [{ fieldId: "results_present", operator: "equals", value: false }] },
        level: "yellow",
        reason: "Le membre ne voit pas encore de résultat."
      },
      {
        id: "comment_added",
        when: { all: [{ fieldId: "check_in_comment", operator: "is_answered" }] },
        level: "yellow",
        reason: "Le membre a ajouté un commentaire à lire."
      }
    ],
    responsePolicy: { defaultLevel: "green", autoArchiveGreen: true }
  },
  lifestyleAssessment: {
    slug: "evaluation-habitudes-vie",
    title: "Évaluation habitudes de vie",
    description:
      "L'évaluation complète déjà utilisée au centre pour apprendre à connaître la réalité, les objectifs et les habitudes d'un membre.",
    ghlTag: "cfsb-evaluation-habitudes-vie-v1",
    identity: { phoneRequired: true, nameRequired: true, emailRequired: false },
    settings: {
      kind: "assessment",
      estimatedSeconds: 600,
      cadenceDays: [],
      submitLabel: "Envoyer mon évaluation",
      successMessage:
        "Merci. Ton évaluation est enregistrée et aidera ton entraîneur à préparer la prochaine étape."
    },
    sections: [
      {
        id: "goal_context",
        title: "Objectif et contexte",
        description: "On commence par ce qui compte le plus pour toi.",
        fields: [
          {
            id: "eval_main_goal",
            type: "long_text",
            label: "Quel est ton objectif principal en ce moment?",
            required: true,
            placeholder: "Décris le changement que tu aimerais observer.",
            validation: { minLength: 2, maxLength: 2000 }
          },
          {
            id: "eval_obstacles",
            type: "long_text",
            label: "Qu'est-ce qui te freine le plus actuellement?",
            required: true,
            placeholder: "Ex. horaire, énergie, douleurs, organisation...",
            validation: { minLength: 2, maxLength: 2000 }
          },
          {
            id: "eval_readiness",
            type: "scale",
            label: "À quel point te sens-tu prêt à changer une habitude?",
            required: true,
            helpText: "1 = pas prêt, 5 = très prêt",
            validation: { min: 1, max: 5, step: 1 }
          }
        ]
      },
      {
        id: "nutrition_hydration",
        title: "Nutrition et hydratation",
        description: "Pense à une semaine normale, pas à une semaine parfaite.",
        fields: [
          {
            id: "eval_meals",
            type: "single_choice",
            label: "À quelle fréquence manges-tu des repas complets et réguliers?",
            required: true,
            options: [
              { value: "almost_always", label: "Presque toujours" },
              { value: "often", label: "Souvent" },
              { value: "sometimes", label: "Parfois" },
              { value: "rarely", label: "Rarement" }
            ]
          },
          {
            id: "eval_protein",
            type: "single_choice",
            label: "À quelle fréquence inclus-tu une source de protéines à tes repas?",
            required: true,
            options: [
              { value: "almost_always", label: "Presque toujours" },
              { value: "often", label: "Souvent" },
              { value: "sometimes", label: "Parfois" },
              { value: "rarely", label: "Rarement" }
            ]
          },
          {
            id: "eval_fruits_vegetables",
            type: "single_choice",
            label: "À quelle fréquence manges-tu des fruits ou des légumes?",
            required: true,
            options: [
              { value: "every_meal", label: "À chaque repas" },
              { value: "twice_daily", label: "Deux fois par jour" },
              { value: "once_daily", label: "Une fois par jour" },
              { value: "rarely", label: "Rarement" }
            ]
          },
          {
            id: "eval_hydration",
            type: "single_choice",
            label: "Comment évalues-tu ton hydratation?",
            required: true,
            options: [
              { value: "very_good", label: "Très bonne" },
              { value: "good", label: "Bonne" },
              { value: "variable", label: "Variable" },
              { value: "insufficient", label: "Insuffisante" }
            ]
          },
          {
            id: "eval_nutrition_note",
            type: "long_text",
            label: "Y a-t-il un détail nutritionnel que ton entraîneur devrait connaître?",
            required: false,
            placeholder: "Optionnel",
            validation: { minLength: 0, maxLength: 2000 }
          }
        ]
      },
      {
        id: "sleep_recovery",
        title: "Sommeil et récupération",
        description: "Ces réponses aident à ajuster le soutien et la charge d'entraînement.",
        fields: [
          {
            id: "eval_sleep",
            type: "single_choice",
            label: "Combien d'heures dors-tu en moyenne?",
            required: true,
            options: [
              { value: "under_6", label: "Moins de 6 h" },
              { value: "6_to_7", label: "6 à 7 h" },
              { value: "7_to_8", label: "7 à 8 h" },
              { value: "over_8", label: "Plus de 8 h" }
            ]
          },
          {
            id: "eval_sleep_quality",
            type: "scale",
            label: "Comment évalues-tu la qualité de ton sommeil?",
            required: true,
            helpText: "1 = très mauvaise, 5 = excellente",
            validation: { min: 1, max: 5, step: 1 }
          },
          {
            id: "eval_stress",
            type: "scale",
            label: "Comment évalues-tu ton niveau de stress actuel?",
            required: true,
            helpText: "1 = très faible, 5 = très élevé",
            validation: { min: 1, max: 5, step: 1 }
          },
          {
            id: "eval_recovery_note",
            type: "long_text",
            label: "Qu'est-ce qui aiderait le plus ta récupération?",
            required: false,
            placeholder: "Optionnel",
            validation: { minLength: 0, maxLength: 2000 }
          }
        ]
      },
      {
        id: "energy_movement",
        title: "Énergie, mouvement et confort",
        description: "Signale ce qui peut influencer tes entraînements ou ton quotidien.",
        fields: [
          {
            id: "eval_energy",
            type: "scale",
            label: "Comment évalues-tu ton énergie au quotidien?",
            required: true,
            helpText: "1 = très basse, 5 = excellente",
            validation: { min: 1, max: 5, step: 1 }
          },
          {
            id: "eval_movement_outside_training",
            type: "single_choice",
            label: "À quelle fréquence bouges-tu en dehors de tes entraînements planifiés?",
            required: true,
            options: [
              { value: "daily", label: "Tous les jours" },
              { value: "few_days_week", label: "Quelques jours par semaine" },
              { value: "once_week", label: "Une fois par semaine" },
              { value: "rarely", label: "Rarement" }
            ]
          },
          {
            id: "eval_pain",
            type: "single_choice",
            label: "As-tu une douleur ou une limitation qui mérite l'attention de ton entraîneur?",
            required: true,
            options: [
              { value: "none", label: "Non" },
              { value: "mild", label: "Oui, légère" },
              { value: "limits_activity", label: "Oui, elle limite certaines activités" },
              { value: "affects_daily_life", label: "Oui, elle affecte mon quotidien" }
            ]
          },
          {
            id: "eval_body_note",
            type: "long_text",
            label: "Précise la douleur, la limitation ou tout autre élément pertinent.",
            required: false,
            placeholder: "Optionnel",
            validation: { minLength: 0, maxLength: 2000 },
            visibleWhen: {
              any: [
                { fieldId: "eval_pain", operator: "not_equals", value: "none" }
              ]
            },
            allowManualReveal: true
          }
        ]
      },
      {
        id: "action_plan",
        title: "Plan d'action",
        description: "Choisis un prochain pas réaliste.",
        fields: [
          {
            id: "eval_next_focus",
            type: "single_choice",
            label: "Sur quoi veux-tu concentrer tes efforts en premier?",
            required: true,
            options: [
              { value: "sleep", label: "Sommeil" },
              { value: "nutrition", label: "Nutrition" },
              { value: "hydration", label: "Hydratation" },
              { value: "stress", label: "Gestion du stress" },
              { value: "movement", label: "Mouvement" },
              { value: "recovery", label: "Récupération" },
              { value: "organization", label: "Organisation" },
              { value: "other", label: "Autre" }
            ]
          },
          {
            id: "eval_commitment",
            type: "long_text",
            label: "Quel engagement concret prends-tu pour la prochaine semaine?",
            required: true,
            placeholder: "Un geste simple, précis et réaliste.",
            validation: { minLength: 2, maxLength: 2000 }
          },
          {
            id: "eval_contact",
            type: "single_choice",
            label: "Quand aimerais-tu en discuter avec ton entraîneur?",
            required: true,
            options: [
              { value: "not_needed", label: "Pas nécessaire pour l'instant" },
              { value: "next_followup", label: "Au prochain suivi" },
              { value: "this_week", label: "Cette semaine" },
              { value: "asap", label: "Dès que possible" }
            ]
          }
        ]
      }
    ],
    rules: [
      {
        id: "pain_daily_life",
        when: { all: [{ fieldId: "eval_pain", operator: "equals", value: "affects_daily_life" }] },
        level: "red",
        reason: "Une douleur ou limitation affecte le quotidien."
      },
      {
        id: "pain_limits_activity",
        when: { all: [{ fieldId: "eval_pain", operator: "equals", value: "limits_activity" }] },
        level: "yellow",
        reason: "Une douleur ou limitation affecte certaines activités."
      },
      {
        id: "contact_asap",
        when: { all: [{ fieldId: "eval_contact", operator: "equals", value: "asap" }] },
        level: "red",
        reason: "Le membre demande une discussion dès que possible."
      },
      {
        id: "contact_this_week",
        when: { all: [{ fieldId: "eval_contact", operator: "equals", value: "this_week" }] },
        level: "yellow",
        reason: "Le membre souhaite une discussion cette semaine."
      },
      {
        id: "sleep_under_six",
        when: { all: [{ fieldId: "eval_sleep", operator: "equals", value: "under_6" }] },
        level: "yellow",
        reason: "Le sommeil déclaré est inférieur à 6 heures."
      },
      {
        id: "stress_very_high",
        when: { all: [{ fieldId: "eval_stress", operator: "gte", value: 5 }] },
        level: "yellow",
        reason: "Le niveau de stress déclaré est très élevé."
      }
    ],
    responsePolicy: { defaultLevel: "green", autoArchiveGreen: true }
  },
  educationalBenchmarks: {
    slug: "reperes-cfsb",
    title: "Repères CFSB",
    description:
      "Une expérience éducative pour mesurer quelques habitudes concrètes, les comparer à des repères simples et choisir un prochain petit pas. Les catégories sans source externe sont des repères d'accompagnement internes CFSB, pas des normes médicales.",
    ghlTag: "cfsb-reperes-v1",
    identity: { phoneRequired: true, nameRequired: true, emailRequired: false },
    settings: {
      kind: "education",
      estimatedSeconds: 300,
      cadenceDays: [],
      submitLabel: "Voir mes repères",
      successMessage:
        "Merci. Tes repères sont enregistrés. Ils servent à t'éduquer et à préparer une discussion, pas à poser un diagnostic."
    },
    sections: [
      {
        id: "education_intro",
        title: "Comment utiliser ces repères",
        fields: [
          {
            id: "benchmark_disclaimer",
            type: "info",
            label: "Des repères, pas un diagnostic",
            content:
              "Réponds selon une semaine normale. Les niveaux optimal, bon, acceptable et problématique sont des repères éducatifs généraux pour adultes; ils ne remplacent pas un avis médical et doivent être adaptés à ton âge, ta santé, ton horaire et tes objectifs avec ton entraîneur."
          }
        ]
      },
      {
        id: "sleep",
        title: "Sommeil",
        fields: [
          {
            id: "sleep_hours_average",
            type: "number",
            label: "Combien d'heures dors-tu en moyenne par nuit?",
            required: true,
            helpText: "Utilise une moyenne réaliste des 7 derniers jours.",
            validation: { min: 0, max: 14, step: 0.25 },
            feedback: {
              kind: "numeric_bands",
              bands: [
                {
                  id: "sleep_problematic",
                  level: "problematic",
                  label: "Problématique",
                  message:
                    "Moins de 6 heures laisse souvent peu de marge pour récupérer. Cherche d'abord une petite augmentation réaliste et parle-en si la fatigue persiste.",
                  max: 6,
                  includeMax: false,
                  sourceLabel: "Agence de la santé publique du Canada — sommeil des adultes",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/publications/vie-saine/adultes-canadiens-dorment-suffisamment-infographique.html"
                },
                {
                  id: "sleep_acceptable",
                  level: "acceptable",
                  label: "Acceptable, à améliorer",
                  message:
                    "Entre 6 et moins de 7 heures, tu approches le repère général. La prochaine cible utile peut être de stabiliser l'heure du coucher.",
                  min: 6,
                  max: 7,
                  sourceLabel: "Agence de la santé publique du Canada — sommeil des adultes",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/publications/vie-saine/adultes-canadiens-dorment-suffisamment-infographique.html"
                },
                {
                  id: "sleep_optimal",
                  level: "optimal",
                  label: "Repère optimal",
                  message:
                    "De 7 à 9 heures correspond au repère général pour la plupart des adultes de 18 à 64 ans. La régularité et la qualité comptent aussi.",
                  min: 7,
                  max: 9,
                  includeMax: true,
                  sourceLabel: "Agence de la santé publique du Canada — sommeil des adultes",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/publications/vie-saine/adultes-canadiens-dorment-suffisamment-infographique.html"
                },
                {
                  id: "sleep_context",
                  level: "acceptable",
                  label: "À contextualiser",
                  message:
                    "Plus de 9 heures peut être normal selon la personne ou la période. Si tu restes très fatigué malgré ce volume, discutes-en avec un professionnel de la santé.",
                  min: 9,
                  includeMin: false,
                  max: 14,
                  includeMax: true,
                  sourceLabel: "Agence de la santé publique du Canada — sommeil des adultes",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/publications/vie-saine/adultes-canadiens-dorment-suffisamment-infographique.html"
                }
              ]
            }
          },
          {
            id: "sleep_regular_nights",
            type: "number",
            label: "Combien de nuits sur 7 gardes-tu des heures de coucher et de lever assez régulières?",
            required: true,
            helpText:
              "Les catégories ci-dessous sont des repères d'accompagnement internes CFSB pour parler de constance; elles ne constituent pas une norme médicale.",
            validation: { min: 0, max: 7, step: 1, integer: true },
            feedback: {
              kind: "numeric_bands",
              bands: [
                {
                  id: "regularity_problematic",
                  level: "problematic",
                  label: "Très variable",
                  message: "Repère interne CFSB: 0 ou 1 nuit régulière rend la récupération moins prévisible. Commence par stabiliser une seule heure d'ancrage.",
                  min: 0,
                  max: 1,
                  includeMax: true
                },
                {
                  id: "regularity_acceptable",
                  level: "acceptable",
                  label: "En construction",
                  message: "Repère interne CFSB: 2 ou 3 nuits régulières montrent un début de routine. Essaie d'ajouter une nuit stable.",
                  min: 1,
                  includeMin: false,
                  max: 3,
                  includeMax: true
                },
                {
                  id: "regularity_good",
                  level: "good",
                  label: "Bon",
                  message: "Repère interne CFSB: 4 ou 5 nuits régulières donnent déjà une base solide.",
                  min: 3,
                  includeMin: false,
                  max: 5,
                  includeMax: true
                },
                {
                  id: "regularity_optimal",
                  level: "optimal",
                  label: "Optimal",
                  message: "Repère interne CFSB: 6 ou 7 nuits régulières indiquent une routine très stable.",
                  min: 5,
                  includeMin: false,
                  max: 7,
                  includeMax: true
                }
              ]
            }
          }
        ]
      },
      {
        id: "movement",
        title: "Mouvement et temps sédentaire",
        fields: [
          {
            id: "mvpa_minutes_week",
            type: "number",
            label: "Combien de minutes d'activité modérée à élevée fais-tu dans une semaine?",
            required: true,
            helpText:
              "Inclue les entraînements et les autres activités qui accélèrent clairement la respiration.",
            validation: { min: 0, max: 1500, step: 5, integer: true },
            feedback: {
              kind: "numeric_bands",
              bands: [
                {
                  id: "mvpa_problematic",
                  level: "problematic",
                  label: "Très peu actif",
                  message:
                    "Moins de 60 minutes par semaine est loin du repère adulte. Toute augmentation graduelle compte; commence petit.",
                  min: 0,
                  max: 60,
                  sourceLabel: "Agence de la santé publique du Canada — activité physique",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/etre-actif/votre-sante-activite-physique.html"
                },
                {
                  id: "mvpa_acceptable",
                  level: "acceptable",
                  label: "Acceptable, en progression",
                  message:
                    "Entre 60 et 145 minutes, tu construis une base. Le repère général adulte est d'au moins 150 minutes par semaine.",
                  min: 60,
                  max: 150,
                  sourceLabel: "Agence de la santé publique du Canada — activité physique",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/etre-actif/votre-sante-activite-physique.html"
                },
                {
                  id: "mvpa_good",
                  level: "good",
                  label: "Bon",
                  message:
                    "De 150 à moins de 300 minutes atteint le repère général. La constance et une charge récupérable sont prioritaires.",
                  min: 150,
                  max: 300,
                  sourceLabel: "Agence de la santé publique du Canada — activité physique",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/etre-actif/votre-sante-activite-physique.html"
                },
                {
                  id: "mvpa_optimal",
                  level: "optimal",
                  label: "Volume élevé",
                  message:
                    "300 minutes ou plus peut apporter des bénéfices additionnels, mais plus n'est pas toujours mieux. Vérifie que ton énergie et ta récupération suivent.",
                  min: 300,
                  max: 1500,
                  includeMax: true,
                  sourceLabel: "Organisation mondiale de la Santé — activité physique",
                  sourceUrl:
                    "https://www.who.int/initiatives/behealthy/physical-activity"
                }
              ]
            }
          },
          {
            id: "strength_days_week",
            type: "number",
            label: "Combien de jours par semaine fais-tu du renforcement musculaire?",
            required: true,
            validation: { min: 0, max: 7, step: 1, integer: true },
            feedback: {
              kind: "numeric_bands",
              bands: [
                {
                  id: "strength_problematic",
                  level: "problematic",
                  label: "Absent",
                  message: "Aucune séance de renforcement. Une première séance adaptée est déjà un progrès utile.",
                  min: 0,
                  max: 0,
                  includeMax: true,
                  sourceLabel: "Organisation mondiale de la Santé — activité physique",
                  sourceUrl:
                    "https://www.who.int/initiatives/behealthy/physical-activity"
                },
                {
                  id: "strength_acceptable",
                  level: "acceptable",
                  label: "En construction",
                  message: "Une journée par semaine construit une base. Le repère général est au moins deux jours.",
                  min: 0,
                  includeMin: false,
                  max: 1,
                  includeMax: true,
                  sourceLabel: "Organisation mondiale de la Santé — activité physique",
                  sourceUrl:
                    "https://www.who.int/initiatives/behealthy/physical-activity"
                },
                {
                  id: "strength_good",
                  level: "good",
                  label: "Bon",
                  message: "Deux jours par semaine atteignent le repère général de renforcement musculaire.",
                  min: 1,
                  includeMin: false,
                  max: 2,
                  includeMax: true,
                  sourceLabel: "Organisation mondiale de la Santé — activité physique",
                  sourceUrl:
                    "https://www.who.int/initiatives/behealthy/physical-activity"
                },
                {
                  id: "strength_optimal",
                  level: "optimal",
                  label: "Très régulier",
                  message:
                    "Trois jours ou plus donnent beaucoup d'exposition au renforcement. La qualité, la progression et la récupération doivent guider le volume.",
                  min: 2,
                  includeMin: false,
                  max: 7,
                  includeMax: true,
                  sourceLabel: "Organisation mondiale de la Santé — activité physique",
                  sourceUrl:
                    "https://www.who.int/initiatives/behealthy/physical-activity"
                }
              ]
            }
          },
          {
            id: "sedentary_hours_day",
            type: "number",
            label: "Combien d'heures passes-tu assis ou très peu actif dans une journée normale?",
            required: true,
            validation: { min: 0, max: 24, step: 0.5 },
            feedback: {
              kind: "numeric_bands",
              bands: [
                {
                  id: "sedentary_optimal",
                  level: "optimal",
                  label: "Optimal",
                  message: "6 heures ou moins offre une bonne marge sous le repère canadien de 8 heures.",
                  min: 0,
                  max: 6,
                  includeMax: true,
                  sourceLabel: "Directives canadiennes en matière de mouvement sur 24 heures",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/rapports-publications/promotion-sante-prevention-maladies-chroniques-canada-recherche-politiques-pratiques/vol-45-no-1-2025/elaboration-trousse-profitez-maximum-journe-prestataires-soins-primaires.html"
                },
                {
                  id: "sedentary_good",
                  level: "good",
                  label: "Bon",
                  message: "Plus de 6 à 8 heures reste dans le repère général. Continue de briser les longues périodes assises.",
                  min: 6,
                  includeMin: false,
                  max: 8,
                  includeMax: true,
                  sourceLabel: "Directives canadiennes en matière de mouvement sur 24 heures",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/rapports-publications/promotion-sante-prevention-maladies-chroniques-canada-recherche-politiques-pratiques/vol-45-no-1-2025/elaboration-trousse-profitez-maximum-journe-prestataires-soins-primaires.html"
                },
                {
                  id: "sedentary_acceptable",
                  level: "acceptable",
                  label: "À réduire",
                  message: "Plus de 8 à 10 heures dépasse le repère général. De courtes pauses actives sont un premier levier.",
                  min: 8,
                  includeMin: false,
                  max: 10,
                  includeMax: true,
                  sourceLabel: "Directives canadiennes en matière de mouvement sur 24 heures",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/rapports-publications/promotion-sante-prevention-maladies-chroniques-canada-recherche-politiques-pratiques/vol-45-no-1-2025/elaboration-trousse-profitez-maximum-journe-prestataires-soins-primaires.html"
                },
                {
                  id: "sedentary_problematic",
                  level: "problematic",
                  label: "Problématique",
                  message:
                    "Plus de 10 heures indique beaucoup de temps sédentaire. Identifie un moment précis où ajouter du mouvement léger.",
                  min: 10,
                  includeMin: false,
                  max: 24,
                  includeMax: true,
                  sourceLabel: "Directives canadiennes en matière de mouvement sur 24 heures",
                  sourceUrl:
                    "https://www.canada.ca/fr/sante-publique/services/rapports-publications/promotion-sante-prevention-maladies-chroniques-canada-recherche-politiques-pratiques/vol-45-no-1-2025/elaboration-trousse-profitez-maximum-journe-prestataires-soins-primaires.html"
                }
              ]
            }
          }
        ]
      },
      {
        id: "nutrition",
        title: "Nutrition et hydratation",
        fields: [
          {
            id: "complete_meals_day",
            type: "number",
            label: "Combien de repas complets manges-tu dans une journée normale?",
            required: true,
            helpText:
              "Ici, un repas complet contient généralement une source de protéines, des végétaux ou fruits et une source d'énergie adaptée. Les catégories de fréquence sont des repères d'accompagnement internes CFSB, pas une prescription nutritionnelle.",
            validation: { min: 0, max: 8, step: 1, integer: true },
            feedback: {
              kind: "numeric_bands",
              bands: [
                {
                  id: "meals_problematic",
                  level: "problematic",
                  label: "Très peu structuré",
                  message: "Repère interne CFSB: aucun repas complet rend l'alimentation moins prévisible. Commence par en structurer un.",
                  min: 0,
                  max: 0,
                  includeMax: true
                },
                {
                  id: "meals_acceptable",
                  level: "acceptable",
                  label: "Une base",
                  message: "Repère interne CFSB: un repas complet donne un point d'ancrage. Cherche surtout la constance avant la perfection.",
                  min: 0,
                  includeMin: false,
                  max: 1,
                  includeMax: true
                },
                {
                  id: "meals_good",
                  level: "good",
                  label: "Bon",
                  message: "Repère interne CFSB: deux repas complets offrent déjà une structure solide pour beaucoup de gens.",
                  min: 1,
                  includeMin: false,
                  max: 2,
                  includeMax: true
                },
                {
                  id: "meals_optimal",
                  level: "optimal",
                  label: "Très structuré",
                  message:
                    "Repère interne CFSB: trois repas complets ou plus indiquent une structure régulière. Le nombre idéal dépend toutefois de ton horaire et de tes besoins.",
                  min: 2,
                  includeMin: false,
                  max: 8,
                  includeMax: true
                }
              ]
            }
          },
          {
            id: "protein_meals_day",
            type: "number",
            label: "À combien de repas inclus-tu une source de protéines?",
            required: true,
            validation: { min: 0, max: 8, step: 1, integer: true },
            feedback: {
              kind: "numeric_bands",
              bands: [
                {
                  id: "protein_problematic",
                  level: "problematic",
                  label: "Absent",
                  message: "Aucun repas ne contient une source de protéines. Choisis d'abord le repas le plus facile à améliorer.",
                  min: 0,
                  max: 0,
                  includeMax: true,
                  sourceLabel: "Guide alimentaire canadien — aliments protéinés",
                  sourceUrl:
                    "https://guide-alimentaire.canada.ca/fr/recommandations-en-matiere-dalimentation-saine/prenez-habitude-manger-legumes-fruits-grains-entiers-aliments-proteines/"
                },
                {
                  id: "protein_acceptable",
                  level: "acceptable",
                  label: "Une base",
                  message: "Une occasion par jour est un début. La prochaine étape peut être d'en ajouter une seconde.",
                  min: 0,
                  includeMin: false,
                  max: 1,
                  includeMax: true,
                  sourceLabel: "Guide alimentaire canadien — aliments protéinés",
                  sourceUrl:
                    "https://guide-alimentaire.canada.ca/fr/recommandations-en-matiere-dalimentation-saine/prenez-habitude-manger-legumes-fruits-grains-entiers-aliments-proteines/"
                },
                {
                  id: "protein_good",
                  level: "good",
                  label: "Bon",
                  message: "Deux repas avec une source de protéines constituent une bonne base quotidienne.",
                  min: 1,
                  includeMin: false,
                  max: 2,
                  includeMax: true,
                  sourceLabel: "Guide alimentaire canadien — aliments protéinés",
                  sourceUrl:
                    "https://guide-alimentaire.canada.ca/fr/recommandations-en-matiere-dalimentation-saine/prenez-habitude-manger-legumes-fruits-grains-entiers-aliments-proteines/"
                },
                {
                  id: "protein_optimal",
                  level: "optimal",
                  label: "Très régulier",
                  message:
                    "Trois occasions ou plus répartissent bien les sources de protéines. La quantité précise reste individuelle.",
                  min: 2,
                  includeMin: false,
                  max: 8,
                  includeMax: true,
                  sourceLabel: "Guide alimentaire canadien — aliments protéinés",
                  sourceUrl:
                    "https://guide-alimentaire.canada.ca/fr/recommandations-en-matiere-dalimentation-saine/prenez-habitude-manger-legumes-fruits-grains-entiers-aliments-proteines/"
                }
              ]
            }
          },
          {
            id: "half_plate_plants_meals_day",
            type: "number",
            label: "À combien de repas les légumes et fruits occupent-ils environ la moitié de l'assiette?",
            required: true,
            validation: { min: 0, max: 8, step: 1, integer: true },
            feedback: {
              kind: "numeric_bands",
              bands: [
                {
                  id: "plants_problematic",
                  level: "problematic",
                  label: "Absent",
                  message: "Aucun repas n'atteint ce repère. Ajouter un fruit ou un légume à un seul repas est un bon départ.",
                  min: 0,
                  max: 0,
                  includeMax: true,
                  sourceLabel: "Guide alimentaire canadien — proportions de l'assiette",
                  sourceUrl: "https://guide-alimentaire.canada.ca/fr/"
                },
                {
                  id: "plants_acceptable",
                  level: "acceptable",
                  label: "Une occasion",
                  message: "Un repas atteint le repère. Essaie de reproduire ce repas une autre fois dans la journée.",
                  min: 0,
                  includeMin: false,
                  max: 1,
                  includeMax: true,
                  sourceLabel: "Guide alimentaire canadien — proportions de l'assiette",
                  sourceUrl: "https://guide-alimentaire.canada.ca/fr/"
                },
                {
                  id: "plants_good",
                  level: "good",
                  label: "Bon",
                  message: "Deux repas donnent une présence régulière aux légumes et fruits.",
                  min: 1,
                  includeMin: false,
                  max: 2,
                  includeMax: true,
                  sourceLabel: "Guide alimentaire canadien — proportions de l'assiette",
                  sourceUrl: "https://guide-alimentaire.canada.ca/fr/"
                },
                {
                  id: "plants_optimal",
                  level: "optimal",
                  label: "Très régulier",
                  message: "Trois repas ou plus appliquent ce repère de façon très constante.",
                  min: 2,
                  includeMin: false,
                  max: 8,
                  includeMax: true,
                  sourceLabel: "Guide alimentaire canadien — proportions de l'assiette",
                  sourceUrl: "https://guide-alimentaire.canada.ca/fr/"
                }
              ]
            }
          },
          {
            id: "water_liters_day",
            type: "number",
            label: "Environ combien de litres d'eau ou de boissons non sucrées bois-tu par jour?",
            required: true,
            helpText:
              "Cette mesure sert de point de départ. Les besoins varient beaucoup selon la taille, la chaleur, la transpiration, l'alimentation, la grossesse et la santé. Les catégories sont des repères d'accompagnement internes CFSB, pas une prescription d'hydratation.",
            validation: { min: 0, max: 8, step: 0.25 },
            feedback: {
              kind: "numeric_bands",
              bands: [
                {
                  id: "water_low",
                  level: "problematic",
                  label: "Possiblement faible",
                  message:
                    "Repère interne CFSB: moins d'un litre peut être peu pour plusieurs adultes actifs. Observe aussi ta soif, la chaleur et la transpiration; augmente graduellement si approprié.",
                  min: 0,
                  max: 1
                },
                {
                  id: "water_start",
                  level: "acceptable",
                  label: "Point de départ",
                  message:
                    "Repère interne CFSB: entre 1 et moins de 1,5 litre donne une base mesurable. Il n'existe pas une cible unique valable pour tout le monde.",
                  min: 1,
                  max: 1.5
                },
                {
                  id: "water_good",
                  level: "good",
                  label: "Bonne base générale",
                  message:
                    "Repère interne CFSB: entre 1,5 et 2,5 litres est une base courante, mais ton besoin réel dépend de ton contexte et de ton alimentation.",
                  min: 1.5,
                  max: 2.5,
                  includeMax: true
                },
                {
                  id: "water_context",
                  level: "information",
                  label: "À personnaliser",
                  message:
                    "Repère interne CFSB: plus de 2,5 litres peut être pertinent si tu transpires beaucoup, mais ne force pas une quantité arbitraire. Demande un avis professionnel si une condition médicale influence tes liquides.",
                  min: 2.5,
                  includeMin: false,
                  max: 8,
                  includeMax: true
                }
              ]
            }
          }
        ]
      },
      {
        id: "next_step",
        title: "Ton prochain petit pas",
        fields: [
          {
            id: "benchmark_focus",
            type: "single_choice",
            label: "Quel repère aimerais-tu améliorer en premier?",
            required: true,
            options: [
              { value: "sleep", label: "Sommeil" },
              { value: "movement", label: "Mouvement" },
              { value: "sedentary", label: "Temps sédentaire" },
              { value: "meals", label: "Structure des repas" },
              { value: "protein", label: "Sources de protéines" },
              { value: "plants", label: "Légumes et fruits" },
              { value: "hydration", label: "Hydratation" }
            ]
          },
          {
            id: "wants_coach_support",
            type: "yes_no",
            label: "Aimerais-tu en discuter avec ton entraîneur?",
            required: true
          },
          {
            id: "benchmark_comment",
            type: "long_text",
            label: "Qu'aimerais-tu comprendre ou changer?",
            required: false,
            validation: { minLength: 0, maxLength: 1600 },
            visibleWhen: {
              all: [
                { fieldId: "wants_coach_support", operator: "equals", value: true }
              ]
            },
            allowManualReveal: true
          }
        ]
      }
    ],
    rules: [
      {
        id: "sleep_below_six",
        when: { all: [{ fieldId: "sleep_hours_average", operator: "lt", value: 6 }] },
        level: "yellow",
        reason: "Le sommeil moyen déclaré est inférieur à 6 heures."
      },
      {
        id: "movement_below_sixty",
        when: { all: [{ fieldId: "mvpa_minutes_week", operator: "lt", value: 60 }] },
        level: "yellow",
        reason: "Le volume de mouvement modéré à élevé est très bas."
      },
      {
        id: "sedentary_over_ten",
        when: { all: [{ fieldId: "sedentary_hours_day", operator: "gt", value: 10 }] },
        level: "yellow",
        reason: "Le temps sédentaire déclaré dépasse 10 heures par jour."
      },
      {
        id: "no_complete_meal",
        when: { all: [{ fieldId: "complete_meals_day", operator: "equals", value: 0 }] },
        level: "yellow",
        reason: "Aucun repas complet n'est déclaré dans une journée normale."
      },
      {
        id: "support_requested",
        when: { all: [{ fieldId: "wants_coach_support", operator: "equals", value: true }] },
        level: "yellow",
        reason: "Le membre souhaite discuter de ses repères."
      }
    ],
    responsePolicy: { defaultLevel: "green", autoArchiveGreen: true }
  }
};

const INITIAL_DRAFTS = deepFreeze(Object.fromEntries(
  Object.entries(INITIAL_DRAFT_INPUTS).map(([key, draft]) => [key, normalizeDraft(draft)])
));

function createInitialDrafts() {
  return clone(INITIAL_DRAFTS);
}

module.exports = {
  BENCHMARK_LEVELS: Object.freeze([...BENCHMARK_LEVELS]),
  CONDITION_OPERATORS,
  FIELD_TYPES,
  INITIAL_DRAFTS,
  QuestionnaireStudioError,
  RESERVED_LEGACY_GHL_TAGS: Object.freeze([...RESERVED_LEGACY_GHL_TAGS]),
  REVIEW_STATUS_BY_LEVEL,
  SCHEMA_VERSION,
  TRIAGE_LEVELS,
  canonicalPathForSlug,
  checkIdempotentReplay,
  createIdempotencyRecord,
  createInitialDrafts,
  evaluateTriage,
  evaluateVisibility,
  normalizeDraft,
  normalizeSlug,
  publishDraft,
  stableJson,
  validateSubmission,
  verifyPublishedSnapshot
};
