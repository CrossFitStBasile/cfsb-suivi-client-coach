import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-functions.js";

const QUESTION_TYPES = Object.freeze([
  ["information", "Bloc d’information"],
  ["short_text", "Texte court"],
  ["long_text", "Texte long"],
  ["yes_no", "Oui / Non"],
  ["single_choice", "Choix unique"],
  ["multi_choice", "Choix multiples"],
  ["number", "Nombre"],
  ["scale", "Échelle"],
  ["date", "Date"]
]);

const FORM_MODES = Object.freeze([
  ["general", "Formulaire général"],
  ["quarterly", "Bilan 90 jours"],
  ["quick_checkin", "Check-in rapide"],
  ["educational", "Repères éducatifs"]
]);

const BENCHMARK_LEVELS = Object.freeze([
  ["optimal", "Optimal"],
  ["good", "Bon"],
  ["acceptable", "Acceptable"],
  ["problematic", "Problématique"],
  ["information", "Information"]
]);

const STATUS_LABELS = Object.freeze({
  draft: "Brouillon",
  published: "Publié",
  archived: "Archivé"
});

const TRIAGE_OPERATORS = Object.freeze([
  ["equals", "est égal à"],
  ["not_equals", "n’est pas égal à"],
  ["contains", "contient"],
  ["less_than", "est inférieur à"],
  ["greater_than", "est supérieur à"],
  ["answered", "a une réponse"],
  ["not_answered", "n’a pas de réponse"]
]);

const CONDITION_OPERATORS = Object.freeze([
  ["equals", "est égal à"],
  ["not_equals", "n’est pas égal à"],
  ["answered", "a une réponse"],
  ["not_answered", "n’a pas de réponse"]
]);

const CALLABLE_NAMES = Object.freeze({
  list: "listQuestionnaireForms",
  save: "saveQuestionnaireDraft",
  publish: "publishQuestionnaireForm",
  delivery: "setQuestionnaireDeliveryReady",
  archive: "archiveQuestionnaireForm",
  duplicate: "duplicateQuestionnaireForm"
});

const DEFAULT_PUBLIC_PATH = "/questionnaire/f/";
const FORM_STATUS_ORDER = Object.freeze({ draft: 0, published: 1, archived: 2 });
const CORE_SCHEMA_VERSION = "questionnaire-studio/v1";
const CORE_KIND_BY_MODE = Object.freeze({
  general: "custom",
  quarterly: "quarterly",
  quick_checkin: "check_in",
  educational: "education"
});
const MODE_BY_CORE_KIND = Object.freeze({
  custom: "general",
  quarterly: "quarterly",
  check_in: "quick_checkin",
  education: "educational",
  assessment: "educational"
});
const CORE_OPERATOR_BY_UI = Object.freeze({
  answered: "is_answered",
  not_answered: "is_not_answered",
  less_than: "lt",
  greater_than: "gt"
});
const UI_OPERATOR_BY_CORE = Object.freeze({
  is_answered: "answered",
  is_not_answered: "not_answered",
  lt: "less_than",
  gt: "greater_than"
});
const CORE_CONDITION_OPERATORS = new Set([
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
const NO_VALUE_OPERATORS = new Set(["is_answered", "is_not_answered"]);

function makeId(prefix) {
  const safePrefix = text(prefix)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^[^a-z]+/u, "")
    .slice(0, 20) || "item";
  const random = (globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
  return `${safePrefix}_${random}`.slice(0, 64);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value ?? "").trim();
}

function slugify(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

function normalizeUiId(value, prefix) {
  const raw = text(value).toLowerCase();
  if (/^[a-z][a-z0-9_]{0,63}$/u.test(raw)) return raw;
  const safePrefix = text(prefix)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^[^a-z]+/u, "")
    .slice(0, 18) || "item";
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^[^a-z]+/u, "")
    .replace(/_+$/gu, "");
  return (normalized || makeId(safePrefix)).slice(0, 64);
}

function optionValue(label, index) {
  return slugify(label) || `option-${index + 1}`;
}

function defaultValidation(type, optionCount = 0) {
  if (type === "short_text") return { minLength: 0, maxLength: 160 };
  if (type === "long_text") return { minLength: 0, maxLength: 2000 };
  if (type === "number") {
    return { min: -1_000_000_000, max: 1_000_000_000, step: 1, integer: false };
  }
  if (type === "scale") return { min: 1, max: 5, step: 1, integer: true };
  if (type === "multi_choice") {
    return { minSelections: 0, maxSelections: Math.max(1, optionCount) };
  }
  return {};
}

function coreType(type) {
  return type === "information" ? "info" : type;
}

function uiType(type) {
  return type === "info" ? "information" : type;
}

function coreOperator(operator) {
  return CORE_OPERATOR_BY_UI[operator] || operator;
}

function uiOperator(operator) {
  return UI_OPERATOR_BY_CORE[operator] || operator;
}

function defaultDescription(title = "Questionnaire CFSB") {
  return `Réponds à ce ${text(title).toLowerCase() || "questionnaire"} afin de guider ton prochain suivi avec l’équipe CFSB.`;
}

function normalizeOptions(value) {
  if (!Array.isArray(value)) return [];
  const used = new Set();
  return value
    .map((option, index) => {
      const label = text(typeof option === "string" ? option : option?.label ?? option?.value);
      if (!label) return null;
      let candidate = text(typeof option === "object" ? option?.value : "") || optionValue(label, index);
      let suffix = 2;
      while (used.has(candidate)) {
        candidate = `${optionValue(label, index)}-${suffix}`;
        suffix += 1;
      }
      used.add(candidate);
      return {
        value: candidate,
        label,
        ...(text(typeof option === "object" ? option?.helpText : "")
          ? { helpText: text(option.helpText) }
          : {})
      };
    })
    .filter(Boolean);
}

function updateOptionLabels(existing, rawText) {
  const labels = String(rawText ?? "")
    .split(/\r?\n/u)
    .map(text)
    .filter(Boolean);
  const used = new Set();
  return labels.map((label, index) => {
    const prior = existing[index];
    let value = text(prior?.value) || optionValue(label, index);
    let suffix = 2;
    while (used.has(value)) {
      value = `${optionValue(label, index)}-${suffix}`;
      suffix += 1;
    }
    used.add(value);
    return {
      value,
      label,
      ...(text(prior?.helpText) ? { helpText: text(prior.helpText) } : {})
    };
  });
}

function studioType(question = {}) {
  const explicit = uiType(text(question.type || question.questionType));
  if (QUESTION_TYPES.some(([type]) => type === explicit)) return explicit;
  const answerType = text(question.answerType);
  if (answerType === "boolean") return "yes_no";
  if (answerType === "array") return "multi_choice";
  if (answerType === "number") return question.min === 1 && question.max <= 10 ? "scale" : "number";
  if (answerType === "string" && Array.isArray(question.options)) return "single_choice";
  return "short_text";
}

function defaultQuestion(type = "short_text", label = "") {
  const normalizedType = uiType(type);
  const question = {
    id: makeId("question"),
    type: normalizedType,
    label: label || (normalizedType === "information" ? "Information utile" : "Nouvelle question"),
    infoLabel: "",
    required: false,
    help: "",
    placeholder: "",
    options: [],
    validation: defaultValidation(coreType(normalizedType)),
    min: normalizedType === "scale" ? 1 : null,
    max: normalizedType === "scale" ? 5 : null,
    step: 1,
    feedback: null,
    allowManualReveal: false,
    condition: {
      enabled: false,
      questionId: "",
      operator: "equals",
      value: "",
      core: null,
      editable: true,
      touched: false
    },
    triage: {
      enabled: false,
      operator: normalizedType === "yes_no" ? "equals" : "answered",
      value: normalizedType === "yes_no" ? "false" : "",
      priority: "P2",
      label: "Suivi requis",
      sourceRuleId: "",
      editable: true,
      touched: false
    }
  };
  if (["single_choice", "multi_choice"].includes(normalizedType)) {
    question.options = normalizeOptions(["Option 1", "Option 2"]);
    question.validation = defaultValidation(coreType(normalizedType), question.options.length);
  }
  return question;
}

function feedbackKindForType(type) {
  if (["number", "scale"].includes(type)) return "numeric_bands";
  if (["yes_no", "single_choice"].includes(type)) return "choice_map";
  return "";
}

function feedbackChoiceOptions(question) {
  if (question.type === "yes_no") {
    return [
      { value: true, label: "Oui" },
      { value: false, label: "Non" }
    ];
  }
  return normalizeOptions(question.options);
}

function defaultFeedbackItem(value) {
  return {
    id: makeId("repere"),
    ...(value !== undefined ? { value } : {}),
    level: "information",
    label: "",
    message: ""
  };
}

function hasFiniteNumber(value) {
  return value !== undefined
    && value !== null
    && value !== ""
    && Number.isFinite(Number(value));
}

function defaultNumericBand(question, existing = []) {
  const band = {
    ...defaultFeedbackItem(),
    includeMin: true,
    includeMax: false
  };
  const last = existing[existing.length - 1];
  if (last && hasFiniteNumber(last.max)) {
    band.min = Number(last.max);
    band.includeMin = last.includeMax !== true;
    if (hasFiniteNumber(question.max) && Number(question.max) > band.min) {
      band.max = Number(question.max);
      band.includeMax = true;
    }
    return band;
  }
  if (hasFiniteNumber(question.min)) band.min = Number(question.min);
  if (hasFiniteNumber(question.max)) {
    band.max = Number(question.max);
    band.includeMax = true;
  }
  if (band.min === undefined && band.max === undefined) band.min = 0;
  return band;
}

function defaultFeedbackForQuestion(question) {
  const kind = feedbackKindForType(question.type);
  if (kind === "numeric_bands") {
    return {
      kind,
      bands: [defaultNumericBand(question)]
    };
  }
  if (kind === "choice_map") {
    return {
      kind,
      choices: feedbackChoiceOptions(question)
        .map((option) => defaultFeedbackItem(option.value))
    };
  }
  return null;
}

function feedbackItems(question) {
  if (question.feedback?.kind === "numeric_bands") {
    return Array.isArray(question.feedback.bands) ? question.feedback.bands : [];
  }
  if (question.feedback?.kind === "choice_map") {
    return Array.isArray(question.feedback.choices) ? question.feedback.choices : [];
  }
  return [];
}

function simpleConditionFromCore(input, allowedUiOperators) {
  if (!input || typeof input !== "object") return null;
  const mode = Array.isArray(input.all) ? "all" : Array.isArray(input.any) ? "any" : "";
  const clauses = mode ? input[mode] : null;
  if (!mode || clauses.length !== 1 || !clauses[0] || typeof clauses[0] !== "object") return null;
  const clause = clauses[0];
  const operator = uiOperator(text(clause.operator));
  if (!allowedUiOperators.has(operator)) return null;
  return {
    mode,
    questionId: text(clause.fieldId),
    operator,
    value: Object.hasOwn(clause, "value") ? clone(clause.value) : ""
  };
}

function normalizeQuestion(question = {}) {
  const type = studioType(question);
  const coreFieldType = coreType(type);
  const options = normalizeOptions(question.options);
  const validation = question.validation && typeof question.validation === "object"
    ? clone(question.validation)
    : defaultValidation(coreFieldType, options.length);
  const visibleWhen = question.visibleWhen || question.condition?.core || null;
  const simpleCondition = simpleConditionFromCore(
    visibleWhen,
    new Set(CONDITION_OPERATORS.map(([operator]) => operator))
  );
  const normalized = {
    ...defaultQuestion(type),
    ...clone(question),
    id: normalizeUiId(question.id || makeId("question"), "question"),
    type,
    label: text(question.content || question.label || question.title)
      || (type === "information" ? "Information utile" : "Question sans titre"),
    infoLabel: type === "information" ? text(question.label) : "",
    required: type !== "information" && question.required === true,
    help: text(question.helpText ?? question.help),
    placeholder: text(question.placeholder),
    options,
    validation,
    feedback: question.feedback ? clone(question.feedback) : null,
    allowManualReveal: question.allowManualReveal === true
  };
  const validationMin = validation.min ?? question.min;
  const validationMax = validation.max ?? question.max;
  const validationStep = validation.step ?? question.step;
  normalized.min = validationMin !== null
    && validationMin !== ""
    && Number.isFinite(Number(validationMin))
    ? Number(validationMin)
    : normalized.min;
  normalized.max = validationMax !== null
    && validationMax !== ""
    && Number.isFinite(Number(validationMax))
    ? Number(validationMax)
    : normalized.max;
  normalized.step = validationStep !== null
    && validationStep !== ""
    && Number.isFinite(Number(validationStep))
    && Number(validationStep) > 0
    ? Number(validationStep)
    : 1;
  normalized.condition = {
    enabled: visibleWhen
      ? true
      : question.condition?.enabled === true,
    questionId: simpleCondition?.questionId || text(question.condition?.questionId),
    operator: simpleCondition?.operator
      || (CONDITION_OPERATORS.some(([value]) => value === question.condition?.operator)
        ? question.condition.operator
        : "equals"),
    value: simpleCondition
      ? clone(simpleCondition.value)
      : clone(question.condition?.value ?? ""),
    core: visibleWhen ? clone(visibleWhen) : null,
    editable: !visibleWhen || Boolean(simpleCondition),
    touched: question.condition?.touched === true
  };
  normalized.triage = {
    enabled: type !== "information" && question.triage?.enabled === true,
    operator: TRIAGE_OPERATORS.some(([value]) => value === question.triage?.operator)
      ? question.triage.operator
      : "equals",
    value: clone(question.triage?.value ?? (type === "yes_no" ? "false" : "")),
    priority: ["P1", "P2", "P3"].includes(question.triage?.priority)
      ? question.triage.priority
      : "P2",
    label: text(question.triage?.label) || "Suivi requis",
    sourceRuleId: text(question.triage?.sourceRuleId),
    editable: question.triage?.editable !== false,
    touched: question.triage?.touched === true
  };
  return normalized;
}

function normalizeSection(section = {}, index = 0) {
  const fields = Array.isArray(section.fields) ? section.fields : section.questions;
  const questions = Array.isArray(fields)
    ? fields.map(normalizeQuestion)
    : [];
  return {
    id: normalizeUiId(section.id || makeId("section"), "section"),
    title: text(section.title) || `Section ${index + 1}`,
    description: text(section.description),
    questions
  };
}

function schemaSections(raw = {}) {
  const source = raw.draft || raw.form || raw.definition || raw;
  const schema = source.schema || raw.schema || {};
  if (Array.isArray(source.sections)) return source.sections.map(normalizeSection);
  if (Array.isArray(schema.sections)) return schema.sections.map(normalizeSection);
  if (Array.isArray(schema.questions)) {
    return [normalizeSection({
      id: "section-main",
      title: schema.title || source.title || "Questions",
      description: schema.description || "",
      questions: schema.questions
    })];
  }
  return [normalizeSection({
    title: "Questions",
    questions: [defaultQuestion()]
  })];
}

function normalizeStatus(value) {
  const status = text(value).toLowerCase();
  return ["draft", "published", "archived"].includes(status) ? status : "draft";
}

function triagePriority(level) {
  if (level === "red") return "P1";
  if (level === "green") return "P3";
  return "P2";
}

function coreTriageLevel(priority) {
  return priority === "P1" ? "red" : "yellow";
}

function attachEditableRules(sections, rules) {
  const questions = sections.flatMap((section) => section.questions || []);
  const byId = new Map(questions.map((question) => [question.id, question]));
  const claimedFields = new Set();
  const allowed = new Set(TRIAGE_OPERATORS.map(([operator]) => operator));
  for (const rule of rules) {
    const simple = simpleConditionFromCore(rule?.when, allowed);
    if (!simple || claimedFields.has(simple.questionId)) continue;
    const question = byId.get(simple.questionId);
    if (!question || question.type === "information") continue;
    question.triage = {
      enabled: true,
      operator: simple.operator,
      value: clone(simple.value),
      priority: triagePriority(text(rule.level).toLowerCase()),
      label: text(rule.reason) || "Suivi requis",
      sourceRuleId: text(rule.id),
      editable: true,
      touched: false
    };
    claimedFields.add(simple.questionId);
  }
}

function normalizeForm(raw = {}) {
  const source = raw.draft || raw.form || raw.definition || raw;
  const definitionId = text(source.definitionId || raw.definitionId);
  const formId = text(raw.formId || raw.id || source.formId || definitionId);
  const slug = slugify(source.slug || raw.slug || definitionId || source.title) || "questionnaire";
  const delivery = source.delivery || raw.delivery || {};
  const activeVersion = text(
    raw.activeVersion
    || source.activeVersion
    || source.version
    || raw.version
  );
  const publicUrl = text(raw.publicUrl || source.publicUrl);
  const settingsInput = source.settings && typeof source.settings === "object"
    ? source.settings
    : {};
  const settingsKind = ["quarterly", "check_in", "assessment", "education", "custom"].includes(
    text(settingsInput.kind).toLowerCase()
  )
    ? text(settingsInput.kind).toLowerCase()
    : CORE_KIND_BY_MODE[source.mode] || "custom";
  const coreSettings = {
    kind: settingsKind,
    estimatedSeconds: Number.isInteger(Number(settingsInput.estimatedSeconds))
      ? Number(settingsInput.estimatedSeconds)
      : 120,
    cadenceDays: Array.isArray(settingsInput.cadenceDays)
      ? settingsInput.cadenceDays.map(Number).filter(Number.isInteger)
      : [],
    submitLabel: text(settingsInput.submitLabel) || "Envoyer mes réponses",
    successMessage: text(settingsInput.successMessage)
      || "Merci. Tes réponses ont bien été reçues."
  };
  const identityInput = source.identity && typeof source.identity === "object"
    ? source.identity
    : {};
  const coreIdentity = {
    phoneRequired: true,
    nameRequired: true,
    emailRequired: identityInput.emailRequired === true
  };
  const rules = Array.isArray(source.rules) ? clone(source.rules) : [];
  const responseInput = source.responsePolicy && typeof source.responsePolicy === "object"
    ? source.responsePolicy
    : {};
  const defaultLevel = ["green", "yellow", "red"].includes(text(responseInput.defaultLevel).toLowerCase())
    ? text(responseInput.defaultLevel).toLowerCase()
    : "green";
  const sections = schemaSections(raw);
  attachEditableRules(sections, rules);
  const title = text(source.title || source.schema?.title) || "Questionnaire sans titre";
  const revision = Number(raw.draftRevision ?? source.draftRevision ?? raw.revision);
  return {
    formId,
    clientDraftId: text(source.clientDraftId) || makeId("draft"),
    definitionId: definitionId || formId,
    title,
    description: text(source.description || source.schema?.description) || defaultDescription(title),
    slug,
    ghlTag: text(source.ghlTag || delivery.ghlTag) || `questionnaire-${slug}`.slice(0, 80),
    mode: MODE_BY_CORE_KIND[settingsKind]
      || (FORM_MODES.some(([mode]) => mode === source.mode)
      ? source.mode
      : text(source.type) === "suivi_global"
        ? "quarterly"
        : text(source.type) === "habitudes_quotidiennes"
          ? "quick_checkin"
          : text(source.type) === "evaluation_habitudes_vie"
            ? "educational"
            : "general"),
    status: normalizeStatus(raw.status || source.status),
    activeVersion,
    deliveryReady: raw.deliveryReady === true || source.deliveryReady === true,
    hasUnpublishedChanges: raw.hasUnpublishedChanges === true || source.hasUnpublishedChanges === true,
    deliveryVerifiedAt: raw.deliveryVerifiedAt || source.deliveryVerifiedAt || "",
    deliveryVerifiedByEmail: text(raw.deliveryVerifiedByEmail || source.deliveryVerifiedByEmail),
    deliveryVerificationNote: text(raw.deliveryVerificationNote || source.deliveryVerificationNote),
    draftRevision: Number.isInteger(revision) && revision >= 0 ? revision : null,
    slugLocked: raw.slugLocked === true || source.slugLocked === true,
    publicUrl,
    updatedAt: raw.updatedAt || source.updatedAt || "",
    sections,
    coreSettings,
    coreIdentity,
    coreRules: rules,
    coreResponsePolicy: {
      defaultLevel,
      autoArchiveGreen: true
    },
    triagePolicy: {
      normalDisposition: ["auto_archive", "to_read"].includes(source.triagePolicy?.normalDisposition)
        ? source.triagePolicy.normalDisposition
        : defaultLevel === "green" ? "auto_archive" : "to_read",
      actionableDisposition: "followup_required",
      maxActionsPerResponse: 1
    }
  };
}

function newForm(mode = "general", existingForms = []) {
  const modeLabel = FORM_MODES.find(([value]) => value === mode)?.[1] || "Questionnaire";
  const usedSlugs = new Set(existingForms.map((form) => form.slug));
  const baseSlug = slugify(modeLabel) || "questionnaire";
  let slug = baseSlug;
  let suffix = 2;
  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  const firstQuestion = mode === "quick_checkin"
    ? defaultQuestion("yes_no", "Le plan établi avec ton coach est-il toujours adapté?")
    : defaultQuestion();
  if (mode === "quick_checkin") {
    firstQuestion.required = true;
    firstQuestion.triage.enabled = true;
    firstQuestion.triage.operator = "equals";
    firstQuestion.triage.value = "false";
    firstQuestion.triage.touched = true;
  }
  const title = mode === "general" ? "Questionnaire sans titre" : modeLabel;
  return normalizeForm({
    clientDraftId: makeId("draft"),
    title,
    description: defaultDescription(title),
    slug,
    ghlTag: `questionnaire-${slug}`.slice(0, 80),
    mode,
    status: "draft",
    identity: {
      phoneRequired: true,
      nameRequired: true,
      emailRequired: false
    },
    settings: {
      kind: CORE_KIND_BY_MODE[mode] || "custom",
      estimatedSeconds: mode === "quick_checkin" ? 30 : 120,
      cadenceDays: mode === "quarterly" ? [90] : mode === "quick_checkin" ? [14, 28] : [],
      submitLabel: "Envoyer mes réponses",
      successMessage: "Merci. Tes réponses ont bien été reçues."
    },
    sections: [{
      id: makeId("section"),
      title: "Questions",
      description: "",
      questions: [firstQuestion]
    }],
    rules: [],
    responsePolicy: {
      defaultLevel: mode === "quick_checkin" ? "green" : "yellow",
      autoArchiveGreen: true
    }
  });
}

function canonicalBaseUrl(options = {}) {
  const configured = text(options.publicBaseUrl);
  const fallbackOrigin = globalThis.location?.origin && globalThis.location.origin !== "null"
    ? globalThis.location.origin
    : "https://cfsb-dashboard-coach-aa9a4.web.app";
  const url = new URL(configured || DEFAULT_PUBLIC_PATH, fallbackOrigin);
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return url;
}

function canonicalPublicUrl(slug, options = {}) {
  const base = canonicalBaseUrl(options);
  const url = new URL(`${encodeURIComponent(slugify(slug) || "questionnaire")}`, base);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function callableData(result) {
  return result?.data ?? result ?? {};
}

function listPayload(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["forms", "items", "questionnaires", "definitions"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function resultForm(payload) {
  for (const key of ["form", "draft", "questionnaire", "definition"]) {
    if (payload?.[key] && typeof payload[key] === "object") return payload[key];
  }
  return payload && typeof payload === "object" ? payload : null;
}

function setAttributes(element, attributes = {}) {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === "class") element.className = value;
    else if (name === "text") element.textContent = value;
    else if (name === "checked") element.checked = Boolean(value);
    else if (name === "disabled") element.disabled = Boolean(value);
    else if (name === "value") element.value = String(value);
    else if (name.startsWith("data-")) element.setAttribute(name, String(value));
    else element.setAttribute(name, value === true ? "" : String(value));
  }
  return element;
}

function element(tag, attributes, ...children) {
  const node = setAttributes(document.createElement(tag), attributes);
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function field(labelText, control, { hint = "", className = "" } = {}) {
  const label = element("label", { class: `qstudio-field ${className}`.trim() });
  label.append(element("span", { class: "qstudio-field__label", text: labelText }), control);
  if (hint) label.append(element("small", { text: hint }));
  return label;
}

function selectControl(options, attributes = {}) {
  const select = element("select", { class: "qstudio-input", ...attributes });
  for (const [value, label] of options) {
    select.append(element("option", { value, text: label }));
  }
  if (attributes.value !== undefined) select.value = String(attributes.value);
  return select;
}

function button(label, action, attributes = {}) {
  return element("button", {
    type: "button",
    class: attributes.class || "qstudio-button",
    "data-qstudio-action": action,
    ...attributes,
    text: label
  });
}

function flattenQuestions(draft) {
  return (draft?.sections || []).flatMap((section, sectionIndex) =>
    (section.questions || []).map((question, questionIndex) => ({
      sectionIndex,
      questionIndex,
      question
    }))
  );
}

function responseValueForComparison(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "boolean") return value ? "true" : "false";
  return text(value);
}

function evaluateRule(value, operator, expected) {
  const normalized = responseValueForComparison(value);
  const present = Array.isArray(normalized) ? normalized.length > 0 : normalized !== "";
  if (operator === "answered") return present;
  if (operator === "not_answered") return !present;
  if (operator === "contains") {
    return Array.isArray(normalized)
      ? normalized.includes(String(expected))
      : normalized.toLowerCase().includes(text(expected).toLowerCase());
  }
  if (operator === "less_than") return Number(normalized) < Number(expected);
  if (operator === "greater_than") return Number(normalized) > Number(expected);
  if (operator === "not_equals") return Array.isArray(normalized)
    ? !normalized.includes(String(expected))
    : normalized !== String(expected);
  return Array.isArray(normalized)
    ? normalized.includes(String(expected))
    : normalized === String(expected);
}

function isCoreId(value) {
  return /^[a-z][a-z0-9_]{0,63}$/u.test(text(value));
}

function conditionFieldIds(group) {
  if (!group || typeof group !== "object") return [];
  const clauses = Array.isArray(group.all)
    ? group.all
    : Array.isArray(group.any)
      ? group.any
      : [];
  return clauses.map((clause) => text(clause?.fieldId)).filter(Boolean);
}

function fieldHasProtectedCore(draft, fieldId) {
  const question = flattenQuestions(draft)
    .find((entry) => entry.question.id === fieldId)
    ?.question;
  if (question?.feedback || question?.condition?.core) return true;
  if (
    (draft?.coreRules || []).some((rule) => conditionFieldIds(rule?.when).includes(fieldId))
  ) {
    return true;
  }
  return flattenQuestions(draft).some(({ question: candidate }) =>
    candidate.id !== fieldId
    && conditionFieldIds(candidate.condition?.core).includes(fieldId)
  );
}

function questionById(draft, questionId) {
  return flattenQuestions(draft)
    .find(({ question }) => question.id === questionId)
    ?.question || null;
}

function coerceConditionValue(draft, fieldId, value) {
  const source = questionById(draft, fieldId);
  if (!source) return clone(value);
  if (source.type === "yes_no") {
    if (typeof value === "boolean") return value;
    return text(value).toLowerCase() === "true";
  }
  if (["number", "scale"].includes(source.type)) {
    return Number(value);
  }
  if (["single_choice", "multi_choice"].includes(source.type)) {
    const match = source.options.find((option) =>
      option.value === value || option.label === text(value)
    );
    return match?.value || text(value);
  }
  return text(value);
}

function serializeUiCondition(draft, condition, fieldId) {
  if (!condition?.enabled) return null;
  if (!condition.touched && condition.core) return clone(condition.core);
  const operator = coreOperator(condition.operator);
  const clause = {
    fieldId: normalizeUiId(fieldId, "question"),
    operator
  };
  if (!NO_VALUE_OPERATORS.has(operator)) {
    clause.value = coerceConditionValue(draft, fieldId, condition.value);
  }
  const mode = condition.core && Object.hasOwn(condition.core, "any") ? "any" : "all";
  return { [mode]: [clause] };
}

function serializeValidation(question, type, optionCount) {
  const source = question.validation && typeof question.validation === "object"
    ? question.validation
    : {};
  if (type === "short_text" || type === "long_text") {
    const defaultMax = type === "short_text" ? 160 : 2000;
    const minLength = Number.isInteger(Number(source.minLength))
      ? Number(source.minLength)
      : 0;
    const maxLength = Number.isInteger(Number(source.maxLength))
      ? Number(source.maxLength)
      : defaultMax;
    return { minLength, maxLength };
  }
  if (type === "number" || type === "scale") {
    const min = Number.isFinite(Number(question.min))
      ? Number(question.min)
      : type === "scale" ? 1 : -1_000_000_000;
    const max = Number.isFinite(Number(question.max))
      ? Number(question.max)
      : type === "scale" ? 5 : 1_000_000_000;
    const step = Number.isFinite(Number(question.step)) && Number(question.step) > 0
      ? Number(question.step)
      : 1;
    return type === "scale"
      ? { min, max, step }
      : { min, max, step, integer: source.integer === true };
  }
  if (type === "multi_choice") {
    const minSelections = Number.isInteger(Number(source.minSelections))
      ? Math.max(0, Math.min(Number(source.minSelections), optionCount))
      : 0;
    const maxSelections = Number.isInteger(Number(source.maxSelections))
      ? Math.max(1, Math.min(Number(source.maxSelections), optionCount))
      : optionCount;
    return {
      minSelections: Math.min(minSelections, maxSelections),
      maxSelections
    };
  }
  if (type === "date") {
    return {
      ...(text(source.min) ? { min: text(source.min) } : {}),
      ...(text(source.max) ? { max: text(source.max) } : {})
    };
  }
  return {};
}

function serializeField(draft, question) {
  const type = coreType(question.type);
  const id = normalizeUiId(question.id, "question");
  if (type === "info") {
    return {
      id,
      type,
      content: text(question.label),
      ...(text(question.infoLabel) ? { label: text(question.infoLabel) } : {})
    };
  }
  const output = {
    id,
    type,
    label: text(question.label),
    required: question.required === true
  };
  if (text(question.help)) output.helpText = text(question.help);
  if (
    ["short_text", "long_text", "number"].includes(type)
    && text(question.placeholder)
  ) {
    output.placeholder = text(question.placeholder);
  }
  if (["single_choice", "multi_choice"].includes(type)) {
    output.options = normalizeOptions(question.options);
  }
  output.validation = serializeValidation(question, type, output.options?.length || 0);
  const visibleWhen = serializeUiCondition(
    draft,
    question.condition,
    question.condition?.questionId
  );
  if (visibleWhen) output.visibleWhen = visibleWhen;
  if (question.allowManualReveal === true) output.allowManualReveal = true;
  if (question.feedback) output.feedback = clone(question.feedback);
  return output;
}

function mergedRules(draft) {
  const changedRuleIds = new Set(
    flattenQuestions(draft)
      .map(({ question }) => question.triage)
      .filter((triage) => triage?.touched && triage.sourceRuleId)
      .map((triage) => triage.sourceRuleId)
  );
  const output = (Array.isArray(draft.coreRules) ? draft.coreRules : [])
    .filter((rule) => !changedRuleIds.has(rule.id))
    .map(clone);
  const usedIds = new Set(output.map((rule) => rule.id));
  for (const { question } of flattenQuestions(draft)) {
    const triage = question.triage;
    if (!triage?.touched || !triage.enabled || question.type === "information") continue;
    let id = isCoreId(triage.sourceRuleId)
      ? triage.sourceRuleId
      : makeId("rule");
    while (usedIds.has(id)) id = makeId("rule");
    usedIds.add(id);
    output.push({
      id,
      when: serializeUiCondition(draft, {
        ...triage,
        core: null
      }, question.id),
      level: coreTriageLevel(triage.priority),
      reason: text(triage.label) || "Suivi requis"
    });
  }
  return output;
}

function feedbackValueKey(value) {
  if (typeof value === "boolean") return value ? "boolean:true" : "boolean:false";
  return `string:${String(value ?? "")}`;
}

function feedbackValidationErrors(question) {
  if (!question.feedback) return [];
  const errors = [];
  const expectedKind = feedbackKindForType(question.type);
  const prefix = `Repères de « ${question.label || "question sans titre"} »`;
  if (!expectedKind || question.feedback.kind !== expectedKind) {
    return [`${prefix}: le type de rétroaction ne correspond pas au type de question.`];
  }
  const items = feedbackItems(question);
  const maximum = expectedKind === "numeric_bands" ? 20 : 30;
  if (!items.length || items.length > maximum) {
    errors.push(`${prefix}: ajoute de 1 à ${maximum} repères.`);
    return errors;
  }
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const row = `${prefix}, repère ${index + 1}`;
    if (!isCoreId(item.id) || ids.has(item.id)) {
      errors.push(`${row}: l’identifiant interne est invalide ou dupliqué.`);
    }
    ids.add(item.id);
    if (!BENCHMARK_LEVELS.some(([level]) => level === item.level)) {
      errors.push(`${row}: choisis un niveau valide.`);
    }
    if (!text(item.label)) errors.push(`${row}: ajoute un libellé.`);
    if (!text(item.message)) errors.push(`${row}: ajoute le message éducatif.`);
    const sourceLabel = text(item.sourceLabel);
    const sourceUrl = text(item.sourceUrl);
    if (Boolean(sourceLabel) !== Boolean(sourceUrl)) {
      errors.push(`${row}: le libellé et l’URL de source doivent être remplis ensemble.`);
    } else if (sourceUrl) {
      try {
        if (new URL(sourceUrl).protocol !== "https:") throw new Error("https");
      } catch (_error) {
        errors.push(`${row}: la source doit être une URL HTTPS valide.`);
      }
    }
  }

  if (expectedKind === "numeric_bands") {
    const sortable = [];
    for (const [index, band] of items.entries()) {
      const hasMin = hasFiniteNumber(band.min);
      const hasMax = hasFiniteNumber(band.max);
      if (!hasMin && !hasMax) {
        errors.push(`${prefix}, repère ${index + 1}: ajoute au moins une borne.`);
        continue;
      }
      const min = hasMin ? Number(band.min) : -Infinity;
      const max = hasMax ? Number(band.max) : Infinity;
      if (
        min > max
        || (
          min === max
          && !(band.includeMin === true && band.includeMax === true)
        )
      ) {
        errors.push(`${prefix}, repère ${index + 1}: les bornes sont invalides.`);
        continue;
      }
      sortable.push({
        index,
        min,
        max,
        includeMin: band.includeMin !== false,
        includeMax: band.includeMax === true
      });
    }
    sortable.sort((left, right) => left.min - right.min);
    for (let index = 1; index < sortable.length; index += 1) {
      const previous = sortable[index - 1];
      const current = sortable[index];
      if (
        previous.max > current.min
        || (
          previous.max === current.min
          && previous.includeMax
          && current.includeMin
        )
      ) {
        errors.push(
          `${prefix}: les repères ${previous.index + 1} et ${current.index + 1} se chevauchent.`
        );
      }
    }
  } else {
    const allowed = new Set(feedbackChoiceOptions(question).map((option) =>
      feedbackValueKey(option.value)
    ));
    const seen = new Set();
    for (const [index, choice] of items.entries()) {
      const valueKey = feedbackValueKey(choice.value);
      if (!allowed.has(valueKey)) {
        errors.push(`${prefix}, repère ${index + 1}: la réponse associée n’existe plus.`);
      } else if (seen.has(valueKey)) {
        errors.push(`${prefix}: une réponse ne peut avoir deux repères.`);
      }
      seen.add(valueKey);
    }
  }
  return errors;
}

function validationErrors(draft, { forPublish = true } = {}) {
  const errors = [];
  if (!text(draft?.title)) errors.push("Ajoute un titre.");
  if (!text(draft?.description)) errors.push("Ajoute une description.");
  if (!slugify(draft?.slug)) errors.push("Ajoute un identifiant URL.");
  if (!text(draft?.ghlTag)) {
    errors.push("Ajoute le tag GHL qui déclenche le workflow.");
  }
  if (!Array.isArray(draft?.sections) || draft.sections.length === 0) {
    errors.push("Ajoute au moins une section.");
    return errors;
  }
  const questions = flattenQuestions(draft);
  if (questions.length === 0) {
    errors.push("Ajoute au moins une question ou un bloc d’information.");
  }
  const ids = new Set();
  const questionById = new Map();
  for (const section of draft.sections) {
    if (!isCoreId(section.id)) errors.push(`L’identifiant de la section « ${section.title} » est invalide.`);
    if (!text(section.title)) errors.push("Une section est sans titre.");
    if (!Array.isArray(section.questions) || section.questions.length === 0) {
      errors.push(`La section « ${section.title || "sans titre"} » doit contenir au moins un élément.`);
    }
  }
  for (const { question } of questions) {
    if (!isCoreId(question.id)) errors.push("Une question n’a pas un identifiant backend valide.");
    else if (ids.has(question.id)) errors.push(`L’identifiant ${question.id} est utilisé deux fois.`);
    ids.add(question.id);
    questionById.set(question.id, question);
    if (!text(question.label)) errors.push("Une question ou information est sans texte.");
    if (["single_choice", "multi_choice"].includes(question.type) && question.options.length < 2) {
      errors.push(`« ${question.label} » doit avoir au moins deux choix.`);
    }
    if (["number", "scale"].includes(question.type)
      && Number.isFinite(Number(question.min))
      && Number.isFinite(Number(question.max))
      && Number(question.min) >= Number(question.max)) {
      errors.push(`Les bornes de « ${question.label} » sont inversées.`);
    }
    errors.push(...feedbackValidationErrors(question));
  }
  const available = new Set();
  for (const { question } of questions) {
    if (question.condition?.enabled) {
      const references = question.condition.editable === false && question.condition.core
        ? conditionFieldIds(question.condition.core)
        : [question.condition.questionId];
      for (const reference of references) {
        if (!questionById.has(reference)) {
          errors.push(`La condition de « ${question.label} » vise une question introuvable.`);
        } else if (reference === question.id) {
          errors.push(`« ${question.label} » ne peut pas dépendre d’elle-même.`);
        } else if (!available.has(reference)) {
          errors.push(`La condition de « ${question.label} » doit viser une question placée avant elle.`);
        }
      }
    }
    if (question.type !== "information") available.add(question.id);
  }
  return [...new Set(errors)];
}

function serializeDraft(draft) {
  const originalKind = text(draft.coreSettings?.kind);
  const kind = draft.mode === "educational" && originalKind === "assessment"
    ? "assessment"
    : CORE_KIND_BY_MODE[draft.mode] || "custom";
  const settings = {
    kind,
    estimatedSeconds: Number.isInteger(Number(draft.coreSettings?.estimatedSeconds))
      ? Number(draft.coreSettings.estimatedSeconds)
      : 120,
    cadenceDays: Array.isArray(draft.coreSettings?.cadenceDays)
      ? draft.coreSettings.cadenceDays.map(Number).filter(Number.isInteger)
      : [],
    submitLabel: text(draft.coreSettings?.submitLabel) || "Envoyer mes réponses",
    successMessage: text(draft.coreSettings?.successMessage)
      || "Merci. Tes réponses ont bien été reçues."
  };
  const sections = draft.sections.map((section) => ({
    id: normalizeUiId(section.id, "section"),
    title: text(section.title),
    ...(text(section.description) ? { description: text(section.description) } : {}),
    fields: section.questions.map((question) => serializeField(draft, question))
  }));
  const priorDefault = text(draft.coreResponsePolicy?.defaultLevel);
  const defaultLevel = draft.triagePolicy?.normalDisposition === "auto_archive"
    ? "green"
    : ["yellow", "red"].includes(priorDefault)
      ? priorDefault
      : "yellow";
  return {
    schemaVersion: CORE_SCHEMA_VERSION,
    status: "draft",
    slug: slugify(draft.slug),
    title: text(draft.title),
    description: text(draft.description) || defaultDescription(draft.title),
    ghlTag: text(draft.ghlTag).toLowerCase(),
    identity: {
      phoneRequired: true,
      nameRequired: true,
      emailRequired: draft.coreIdentity?.emailRequired === true
    },
    settings,
    sections,
    rules: mergedRules(draft),
    responsePolicy: {
      defaultLevel,
      autoArchiveGreen: true
    }
  };
}

function statusTime(value) {
  if (!value) return "";
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function studioMarkup() {
  return `
    <style>
      .qstudio {
        --qs-ink: #172033;
        --qs-muted: #697386;
        --qs-line: #dde2ea;
        --qs-soft: #f5f7fa;
        --qs-panel: #ffffff;
        --qs-accent: #2f6fed;
        --qs-accent-soft: #eaf1ff;
        --qs-danger: #bd2c2c;
        color: var(--qs-ink);
        font: 400 15px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .qstudio *, .qstudio *::before, .qstudio *::after { box-sizing: border-box; }
      .qstudio button, .qstudio input, .qstudio textarea, .qstudio select { font: inherit; }
      .qstudio-shell { display: grid; grid-template-columns: minmax(250px, 310px) minmax(0, 1fr); min-height: 720px; border: 1px solid var(--qs-line); border-radius: 18px; overflow: hidden; background: var(--qs-soft); }
      .qstudio-library { padding: 18px; border-right: 1px solid var(--qs-line); background: #fbfcfe; }
      .qstudio-brand { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
      .qstudio-brand h2 { margin: 0; font-size: 20px; }
      .qstudio-brand p { margin: 3px 0 0; color: var(--qs-muted); font-size: 13px; }
      .qstudio-create { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-bottom: 14px; }
      .qstudio-filter { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 12px; padding-bottom: 2px; }
      .qstudio-filter button { border: 1px solid var(--qs-line); border-radius: 999px; padding: 6px 10px; background: white; color: var(--qs-muted); white-space: nowrap; cursor: pointer; }
      .qstudio-filter button[aria-pressed="true"] { color: #194da8; border-color: #8bb0f8; background: var(--qs-accent-soft); }
      .qstudio-list { display: grid; gap: 8px; max-height: 585px; overflow-y: auto; padding-right: 3px; }
      .qstudio-library-card { width: 100%; border: 1px solid var(--qs-line); border-radius: 12px; padding: 12px; text-align: left; background: white; cursor: pointer; }
      .qstudio-library-card:hover, .qstudio-library-card:focus-visible { border-color: #8bb0f8; outline: none; box-shadow: 0 0 0 3px rgba(47,111,237,.12); }
      .qstudio-library-card[aria-current="true"] { border-color: var(--qs-accent); background: var(--qs-accent-soft); }
      .qstudio-library-card strong { display: block; margin-bottom: 5px; }
      .qstudio-library-card small { display: flex; justify-content: space-between; gap: 8px; color: var(--qs-muted); }
      .qstudio-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 700; background: #e9edf4; color: #516077; }
      .qstudio-badge--published { background: #e3f6eb; color: #187344; }
      .qstudio-badge--archived { background: #f2e9e9; color: #8f3434; }
      .qstudio-main { min-width: 0; display: flex; flex-direction: column; }
      .qstudio-toolbar { position: sticky; top: 0; z-index: 4; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 18px; border-bottom: 1px solid var(--qs-line); background: rgba(255,255,255,.96); backdrop-filter: blur(8px); }
      .qstudio-toolbar__left, .qstudio-toolbar__right { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
      .qstudio-save-state { color: var(--qs-muted); font-size: 13px; }
      .qstudio-save-state[data-dirty="true"] { color: #9a5a00; font-weight: 700; }
      .qstudio-button { border: 1px solid #cbd3df; border-radius: 9px; padding: 8px 12px; background: white; color: var(--qs-ink); font-weight: 650; cursor: pointer; }
      .qstudio-button:hover:not(:disabled) { background: #f3f6fb; }
      .qstudio-button:focus-visible, .qstudio-input:focus-visible { outline: 3px solid rgba(47,111,237,.2); border-color: var(--qs-accent); }
      .qstudio-button:disabled { opacity: .55; cursor: wait; }
      .qstudio-button--primary { color: white; border-color: var(--qs-accent); background: var(--qs-accent); }
      .qstudio-button--primary:hover:not(:disabled) { background: #245dcc; }
      .qstudio-button--danger { color: var(--qs-danger); }
      .qstudio-button--icon { padding: 6px 9px; min-width: 34px; }
      .qstudio-workspace { padding: 20px; overflow-y: auto; }
      .qstudio-empty { display: grid; place-items: center; min-height: 520px; text-align: center; color: var(--qs-muted); }
      .qstudio-empty h3 { margin: 0 0 6px; color: var(--qs-ink); }
      .qstudio-editor { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 360px); align-items: start; gap: 18px; }
      .qstudio-editor__body { min-width: 0; display: grid; gap: 14px; }
      .qstudio-card { border: 1px solid var(--qs-line); border-radius: 14px; padding: 16px; background: var(--qs-panel); box-shadow: 0 2px 8px rgba(23,32,51,.035); }
      .qstudio-card h3, .qstudio-card h4 { margin: 0; }
      .qstudio-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
      .qstudio-card__head p { margin: 3px 0 0; color: var(--qs-muted); font-size: 13px; }
      .qstudio-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .qstudio-field { display: grid; align-content: start; gap: 6px; min-width: 0; }
      .qstudio-field--wide { grid-column: 1 / -1; }
      .qstudio-field__label { font-size: 13px; font-weight: 700; }
      .qstudio-field small { color: var(--qs-muted); font-size: 12px; }
      .qstudio-input { width: 100%; min-height: 40px; border: 1px solid #cbd3df; border-radius: 8px; padding: 8px 10px; background: white; color: var(--qs-ink); }
      textarea.qstudio-input { resize: vertical; min-height: 74px; }
      .qstudio-url { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
      .qstudio-url code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 9px 10px; border-radius: 8px; background: var(--qs-soft); color: #31517c; }
      .qstudio-section { border-left: 4px solid #8aaef3; }
      .qstudio-section + .qstudio-section { margin-top: 2px; }
      .qstudio-section-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
      .qstudio-question { position: relative; margin-top: 10px; border: 1px solid var(--qs-line); border-radius: 12px; padding: 13px; background: #fcfdff; }
      .qstudio-question__head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(150px, 220px); gap: 10px; align-items: end; }
      .qstudio-question__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #edf0f5; }
      .qstudio-question__advanced { margin-top: 10px; border-top: 1px dashed #d5dbe5; padding-top: 10px; }
      .qstudio-question__advanced summary { cursor: pointer; font-weight: 700; color: #3b5275; }
      .qstudio-question__advanced .qstudio-grid { margin-top: 10px; }
      .qstudio-feedback { margin-top: 10px; border: 1px solid #cddbf2; border-radius: 11px; padding: 11px; background: #f7faff; }
      .qstudio-feedback > summary { cursor: pointer; color: #254f8f; font-weight: 750; }
      .qstudio-feedback__body { display: grid; gap: 10px; margin-top: 11px; }
      .qstudio-feedback__intro { margin: 0; color: var(--qs-muted); font-size: 13px; }
      .qstudio-feedback-row { border: 1px solid #d8e1ef; border-radius: 10px; padding: 11px; background: white; }
      .qstudio-feedback-row__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 9px; }
      .qstudio-feedback-row__head strong { color: #2b4c79; }
      .qstudio-feedback-row .qstudio-grid { margin-top: 0; }
      .qstudio-feedback-row textarea.qstudio-input { min-height: 92px; }
      .qstudio-feedback-source { margin-top: 9px; border-top: 1px dashed #dce3ed; padding-top: 9px; }
      .qstudio-feedback-source > small { display: block; margin-bottom: 7px; color: var(--qs-muted); }
      .qstudio-feedback-add { display: flex; justify-content: flex-start; }
      .qstudio-check { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; font-weight: 650; }
      .qstudio-check input { width: 18px; height: 18px; }
      .qstudio-add-row { display: flex; justify-content: center; margin-top: 12px; }
      .qstudio-preview-wrap { position: sticky; top: 76px; }
      .qstudio-preview-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
      .qstudio-phone { width: min(100%, 360px); min-height: 610px; max-height: calc(100vh - 160px); margin: 0 auto; overflow: auto; border: 9px solid #202634; border-radius: 28px; background: #f5f7fa; box-shadow: 0 10px 30px rgba(23,32,51,.18); }
      .qstudio-phone__screen { padding: 16px 13px 24px; }
      .qstudio-preview-title { padding: 16px; border-radius: 13px; background: linear-gradient(145deg, #17386f, #2f6fed); color: white; }
      .qstudio-preview-title h3 { margin: 0; font-size: 21px; }
      .qstudio-preview-title p { margin: 6px 0 0; opacity: .9; }
      .qstudio-preview-identity, .qstudio-preview-section { margin-top: 12px; border: 1px solid var(--qs-line); border-radius: 12px; padding: 13px; background: white; }
      .qstudio-preview-identity strong, .qstudio-preview-section h4 { display: block; margin: 0 0 5px; }
      .qstudio-preview-identity small, .qstudio-preview-section > p { color: var(--qs-muted); }
      .qstudio-preview-question { display: grid; gap: 6px; margin-top: 13px; }
      .qstudio-preview-question[hidden] { display: none; }
      .qstudio-preview-question label, .qstudio-preview-question legend { font-weight: 700; }
      .qstudio-preview-question fieldset { display: grid; gap: 7px; margin: 0; border: 0; padding: 0; }
      .qstudio-preview-choice { display: flex; align-items: center; gap: 7px; padding: 8px; border: 1px solid var(--qs-line); border-radius: 8px; font-weight: 500 !important; }
      .qstudio-preview-info { margin-top: 13px; border-left: 3px solid #5f8fe9; padding: 10px 11px; background: #edf3ff; white-space: pre-wrap; }
      .qstudio-preview-submit { width: 100%; margin-top: 15px; border: 0; border-radius: 9px; padding: 11px; background: var(--qs-accent); color: white; font-weight: 800; }
      .qstudio-notice { margin-bottom: 14px; border: 1px solid #d2ddf1; border-radius: 10px; padding: 10px 12px; background: #f2f6ff; color: #2d4f81; }
      .qstudio-notice--error { border-color: #efb6b6; background: #fff2f2; color: #8e2525; }
      .qstudio-status { position: fixed; z-index: 10000; right: 20px; bottom: 20px; max-width: min(420px, calc(100vw - 40px)); border-radius: 11px; padding: 11px 14px; background: #172033; color: white; box-shadow: 0 9px 30px rgba(0,0,0,.2); }
      .qstudio-status[hidden] { display: none; }
      .qstudio-loading { opacity: .68; pointer-events: none; }
      .qstudio-mobile-library-toggle { display: none; }
      @media (max-width: 1080px) {
        .qstudio-editor { grid-template-columns: 1fr; }
        .qstudio-preview-wrap { position: static; }
        .qstudio-phone { max-height: none; }
      }
      @media (max-width: 780px) {
        .qstudio-shell { grid-template-columns: 1fr; min-height: 0; }
        .qstudio-library { display: none; border-right: 0; border-bottom: 1px solid var(--qs-line); }
        .qstudio[data-library-open="true"] .qstudio-library { display: block; }
        .qstudio-mobile-library-toggle { display: inline-flex; }
        .qstudio-toolbar { align-items: flex-start; }
        .qstudio-toolbar__right { justify-content: flex-end; }
        .qstudio-workspace { padding: 12px; }
        .qstudio-grid, .qstudio-section-fields, .qstudio-question__head { grid-template-columns: 1fr; }
        .qstudio-card { padding: 13px; }
        .qstudio-url { grid-template-columns: 1fr; }
        .qstudio-phone { width: 100%; border-width: 6px; }
      }
    </style>
    <div class="qstudio-shell">
      <aside class="qstudio-library" aria-label="Bibliothèque des questionnaires">
        <div class="qstudio-brand">
          <div>
            <h2>Studio de questionnaires</h2>
            <p>Créer, publier et réutiliser des formulaires CFSB.</p>
          </div>
        </div>
        <div class="qstudio-create">
          <label class="qstudio-field">
            <span class="qstudio-field__label">Modèle de départ</span>
            <select class="qstudio-input" data-qstudio-new-mode aria-label="Modèle du nouveau questionnaire"></select>
          </label>
          <button type="button" class="qstudio-button qstudio-button--primary" data-qstudio-action="create-form">Créer</button>
        </div>
        <nav class="qstudio-filter" aria-label="Filtrer les questionnaires"></nav>
        <div class="qstudio-list" role="list"></div>
      </aside>
      <main class="qstudio-main">
        <header class="qstudio-toolbar">
          <div class="qstudio-toolbar__left">
            <button type="button" class="qstudio-button qstudio-mobile-library-toggle" data-qstudio-action="toggle-library" aria-expanded="false">Bibliothèque</button>
            <span class="qstudio-save-state" data-qstudio-save-state data-dirty="false">À jour</span>
          </div>
          <div class="qstudio-toolbar__right" data-qstudio-toolbar-actions></div>
        </header>
        <div class="qstudio-workspace">
          <div class="qstudio-notice" data-qstudio-notice hidden></div>
          <div data-qstudio-editor></div>
        </div>
      </main>
    </div>
    <div class="qstudio-status" role="status" aria-live="polite" data-qstudio-status hidden></div>
  `;
}

/**
 * Monte le Studio de questionnaires dans un conteneur du Dashboard.
 *
 * Contrat callable:
 * - listQuestionnaireForms({ initialize: true }) -> { forms: [] }
 * - saveQuestionnaireDraft({ formId?, expectedRevision?, draft }) -> { form }
 * - publishQuestionnaireForm({ formId, expectedRevision? }) -> { form }
 * - archiveQuestionnaireForm({ formId }) -> { form? }
 * - duplicateQuestionnaireForm({ formId }) -> { form }
 */
export function mountQuestionnaireStudio(root, firebaseApp, options = {}) {
  if (!(root instanceof Element)) {
    throw new TypeError("mountQuestionnaireStudio exige un élément racine.");
  }
  if (!firebaseApp) {
    throw new TypeError("mountQuestionnaireStudio exige l’application Firebase.");
  }

  const functions = getFunctions(firebaseApp, options.region || "us-central1");
  const callables = Object.fromEntries(
    Object.entries(CALLABLE_NAMES).map(([key, name]) => [
      key,
      httpsCallable(functions, options.callableNames?.[key] || name)
    ])
  );

  const state = {
    forms: [],
    selectedId: "",
    draft: null,
    filter: "all",
    dirty: false,
    busy: false,
    destroyed: false,
    libraryOpen: false,
    previewAnswers: {},
    previewFrame: 0,
    toastTimer: null
  };

  root.classList.add("qstudio");
  root.dataset.libraryOpen = "false";
  root.innerHTML = studioMarkup();

  const dom = {
    list: root.querySelector(".qstudio-list"),
    filter: root.querySelector(".qstudio-filter"),
    editor: root.querySelector("[data-qstudio-editor]"),
    toolbar: root.querySelector("[data-qstudio-toolbar-actions]"),
    saveState: root.querySelector("[data-qstudio-save-state]"),
    notice: root.querySelector("[data-qstudio-notice]"),
    status: root.querySelector("[data-qstudio-status]"),
    newMode: root.querySelector("[data-qstudio-new-mode]")
  };

  for (const [value, label] of FORM_MODES) {
    dom.newMode.append(element("option", { value, text: label }));
  }

  function showStatus(message, error = false) {
    if (!message || state.destroyed) return;
    globalThis.clearTimeout(state.toastTimer);
    dom.status.textContent = message;
    dom.status.style.background = error ? "#8e2525" : "#172033";
    dom.status.hidden = false;
    state.toastTimer = globalThis.setTimeout(() => {
      if (!state.destroyed) dom.status.hidden = true;
    }, 4200);
  }

  function showNotice(messages = [], error = false) {
    const items = Array.isArray(messages) ? messages.filter(Boolean) : [messages].filter(Boolean);
    if (!items.length) {
      dom.notice.hidden = true;
      dom.notice.replaceChildren();
      return;
    }
    dom.notice.className = `qstudio-notice${error ? " qstudio-notice--error" : ""}`;
    dom.notice.replaceChildren();
    if (items.length === 1) dom.notice.textContent = items[0];
    else {
      const list = element("ul");
      items.forEach((message) => list.append(element("li", { text: message })));
      dom.notice.append(list);
    }
    dom.notice.hidden = false;
    dom.notice.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    root.classList.toggle("qstudio-loading", state.busy);
    root.querySelectorAll("button, input, textarea, select").forEach((control) => {
      if (control.closest(".qstudio-phone")) return;
      control.disabled = state.busy || control.dataset.permanentDisabled === "true";
    });
  }

  function updateDirtyUi() {
    dom.saveState.dataset.dirty = String(state.dirty);
    dom.saveState.textContent = state.dirty ? "Modifications non enregistrées" : "À jour";
    options.onDirtyChange?.(state.dirty);
  }

  function markDirty() {
    if (!state.draft || state.draft.status === "archived") return;
    state.dirty = true;
    if (state.draft.status === "published") state.draft.status = "draft";
    updateDirtyUi();
    renderLibrary();
  }

  function clearDirty() {
    state.dirty = false;
    updateDirtyUi();
  }

  function confirmDiscard() {
    return !state.dirty || globalThis.confirm("Des modifications ne sont pas enregistrées. Les abandonner?");
  }

  function beforeUnload(event) {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function selectedKey(form) {
    return form.formId || form.clientDraftId;
  }

  function formByKey(key) {
    return state.forms.find((form) => selectedKey(form) === key) || null;
  }

  function upsertForm(form) {
    const normalized = normalizeForm(form);
    const key = selectedKey(normalized);
    const index = state.forms.findIndex((candidate) =>
      selectedKey(candidate) === key
      || (normalized.formId && candidate.formId === normalized.formId)
      || (normalized.clientDraftId && candidate.clientDraftId === normalized.clientDraftId)
    );
    if (index >= 0) state.forms.splice(index, 1, normalized);
    else state.forms.unshift(normalized);
    return normalized;
  }

  function renderFilters() {
    dom.filter.replaceChildren();
    const counts = state.forms.reduce((result, form) => {
      result[form.status] = (result[form.status] || 0) + 1;
      return result;
    }, {});
    const filters = [
      ["all", `Tous (${state.forms.length})`],
      ["draft", `Brouillons (${counts.draft || 0})`],
      ["published", `Publiés (${counts.published || 0})`],
      ["archived", `Archivés (${counts.archived || 0})`]
    ];
    for (const [value, label] of filters) {
      dom.filter.append(button(label, "set-filter", {
        "data-filter": value,
        "aria-pressed": String(state.filter === value)
      }));
    }
  }

  function renderLibrary() {
    renderFilters();
    const forms = state.forms
      .filter((form) => state.filter === "all" || form.status === state.filter)
      .sort((a, b) =>
        (FORM_STATUS_ORDER[a.status] ?? 9) - (FORM_STATUS_ORDER[b.status] ?? 9)
        || a.title.localeCompare(b.title, "fr")
      );
    dom.list.replaceChildren();
    if (!forms.length) {
      dom.list.append(element("p", {
        class: "qstudio-save-state",
        text: "Aucun questionnaire dans cette catégorie."
      }));
      return;
    }
    for (const form of forms) {
      const key = selectedKey(form);
      const card = button("", "select-form", {
        class: "qstudio-library-card",
        "data-form-key": key,
        "aria-current": String(state.selectedId === key),
        role: "listitem"
      });
      const title = element("strong", { text: form.title });
      const details = element("small");
      details.append(
        element("span", {
          class: `qstudio-badge qstudio-badge--${form.status}`,
          text: STATUS_LABELS[form.status]
        }),
        element("span", {
          text: form.activeVersion ? `v${form.activeVersion}` : form.slug
        })
      );
      card.append(title, details);
      dom.list.append(card);
    }
  }

  function toolbarActions() {
    dom.toolbar.replaceChildren();
    if (!state.draft) return;
    const archived = state.draft.status === "archived";
    const hasServerId = Boolean(state.draft.formId);
    dom.toolbar.append(
      button("Aperçu mobile", "focus-preview", { "aria-label": "Voir l’aperçu mobile local" }),
      button("Dupliquer", "duplicate-form", { disabled: state.busy }),
      button("Enregistrer", "save-form", {
        class: "qstudio-button qstudio-button--primary",
        disabled: archived || state.busy
      })
    );
    if (!archived) {
      dom.toolbar.append(button(
        state.draft.activeVersion ? "Publier une nouvelle version" : "Publier",
        "publish-form",
        { disabled: state.busy }
      ));
    }
    if (hasServerId && !archived) {
      const deliveryStateCanChange = state.draft.status === "published"
        && Boolean(state.draft.activeVersion)
        && state.draft.hasUnpublishedChanges !== true;
      dom.toolbar.append(button(
        state.draft.deliveryReady ? "Désactiver les envois GHL" : "Activer les envois GHL",
        "toggle-delivery",
        {
          disabled: state.busy || !deliveryStateCanChange,
          title: deliveryStateCanChange
            ? "Nécessite un canari GHL reçu avec le tag et l’URL exacts."
            : "Publie d’abord la version exacte à vérifier dans GHL."
        }
      ));
      dom.toolbar.append(button("Archiver", "archive-form", {
        class: "qstudio-button qstudio-button--danger",
        disabled: state.busy
      }));
    }
  }

  function metadataCard() {
    const card = element("section", { class: "qstudio-card", "aria-labelledby": "qstudio-metadata-title" });
    const head = element("div", { class: "qstudio-card__head" },
      element("div", {},
        element("h3", { id: "qstudio-metadata-title", text: "Identité du formulaire" }),
        element("p", { text: "Le même lien public est utilisé pour tous les membres." })
      ),
      element("span", {
        class: `qstudio-badge qstudio-badge--${state.draft.status}`,
        text: STATUS_LABELS[state.draft.status]
      })
    );
    const grid = element("div", { class: "qstudio-grid" });
    grid.append(
      field("Titre", element("input", {
        class: "qstudio-input",
        type: "text",
        value: state.draft.title,
        maxlength: "140",
        "data-bind": "title",
        required: true
      })),
      field("Mode", selectControl(FORM_MODES, {
        value: state.draft.mode,
        "data-bind": "mode"
      })),
      field("Description", element("textarea", {
        class: "qstudio-input",
        "data-bind": "description",
        maxlength: "1200",
        value: state.draft.description
      }), { className: "qstudio-field--wide" }),
      field("Identifiant URL", element("input", {
        class: "qstudio-input",
        type: "text",
        value: state.draft.slug,
        maxlength: "80",
        inputmode: "url",
        "data-bind": "slug",
        disabled: state.draft.slugLocked,
        "data-permanent-disabled": state.draft.slugLocked ? "true" : undefined
      }), {
        hint: state.draft.slugLocked
          ? "Adresse verrouillée depuis la première publication."
          : "Lettres minuscules, chiffres et tirets. Aucun renseignement client."
      }),
      field("Tag GHL", element("input", {
        class: "qstudio-input",
        type: "text",
        value: state.draft.ghlTag,
        maxlength: "128",
        autocomplete: "off",
        "data-bind": "ghlTag"
      }), {
        hint: "Le workflow GHL associé à ce tag envoie le lien fixe."
      })
    );
    const urlRow = element("div", { class: "qstudio-field qstudio-field--wide", style: "margin-top:12px" },
      element("span", { class: "qstudio-field__label", text: "URL publique canonique" }),
      element("div", { class: "qstudio-url" },
        element("code", {
          "data-qstudio-public-url": "",
          text: canonicalPublicUrl(state.draft.slug, options)
        }),
        button("Copier", "copy-url")
      ),
      element("small", { text: "Cette URL ne contient ni nom, ni téléphone, ni courriel, ni identifiant client." })
    );
    const deliveryNotice = element("div", {
      class: "qstudio-notice",
      style: "margin-top:12px",
      text: state.draft.deliveryReady
        ? `Envoi GHL vérifié et activé${state.draft.deliveryVerifiedByEmail ? ` par ${state.draft.deliveryVerifiedByEmail}` : ""}.`
        : state.draft.hasUnpublishedChanges
          ? "Envoi GHL désactivé : publie les changements, puis refais un canari."
          : "Le lien est partageable manuellement. Les envois et planifications GHL restent désactivés jusqu’à un canari vérifié."
    });
    card.append(head, grid, urlRow, deliveryNotice);
    return card;
  }

  function triageCard() {
    const policy = state.draft.triagePolicy;
    const card = element("section", { class: "qstudio-card", "aria-labelledby": "qstudio-triage-title" });
    const head = element("div", { class: "qstudio-card__head" },
      element("div", {},
        element("h3", { id: "qstudio-triage-title", text: "Règles de traitement" }),
        element("p", { text: "Une réponse peut créer au maximum une action coach." })
      )
    );
    const grid = element("div", { class: "qstudio-grid" });
    grid.append(
      field("Si aucune règle n’est déclenchée", selectControl([
        ["auto_archive", "Archiver automatiquement"],
        ["to_read", "À lire par le coach"]
      ], {
        value: policy.normalDisposition,
        "data-policy-bind": "normalDisposition"
      })),
      field("Si une règle est déclenchée", element("input", {
        class: "qstudio-input",
        value: "Créer une seule action de suivi",
        readonly: true,
        "data-permanent-disabled": "true"
      }))
    );
    card.append(head, grid);
    return card;
  }

  function questionSourceOptions(questionId) {
    const questions = flattenQuestions(state.draft);
    const targetIndex = questions.findIndex(({ question }) => question.id === questionId);
    const available = targetIndex >= 0 ? questions.slice(0, targetIndex) : [];
    return [["", "Choisir une question…"], ...available
      .filter(({ question }) => question.type !== "information")
      .map(({ question }) => [question.id, question.label])];
  }

  function feedbackRowCard(question, item, index) {
    const row = element("section", {
      class: "qstudio-feedback-row",
      "data-feedback-row-index": index,
      "aria-label": `Repère éducatif ${index + 1}`
    });
    row.append(element("div", { class: "qstudio-feedback-row__head" },
      element("strong", { text: `Repère ${index + 1}` }),
      button("Retirer", "delete-feedback-row", {
        class: "qstudio-button qstudio-button--danger",
        "aria-label": `Retirer le repère ${index + 1}`
      })
    ));
    const grid = element("div", { class: "qstudio-grid" });
    if (question.feedback.kind === "numeric_bands") {
      grid.append(
        field("Borne minimale", element("input", {
          class: "qstudio-input",
          type: "number",
          step: "any",
          value: item.min ?? "",
          placeholder: "Aucune",
          "data-feedback-item-bind": "min"
        })),
        field("Borne maximale", element("input", {
          class: "qstudio-input",
          type: "number",
          step: "any",
          value: item.max ?? "",
          placeholder: "Aucune",
          "data-feedback-item-bind": "max"
        })),
        field("", element("span", { class: "qstudio-check" },
          element("input", {
            type: "checkbox",
            checked: item.includeMin !== false,
            "data-feedback-item-bind": "includeMin"
          }),
          element("span", { text: "Inclure la borne minimale" })
        )),
        field("", element("span", { class: "qstudio-check" },
          element("input", {
            type: "checkbox",
            checked: item.includeMax === true,
            "data-feedback-item-bind": "includeMax"
          }),
          element("span", { text: "Inclure la borne maximale" })
        ))
      );
    } else {
      grid.append(field("Réponse associée", selectControl(
        feedbackChoiceOptions(question).map((option) => [
          String(option.value),
          option.label
        ]),
        {
          value: String(item.value),
          "data-feedback-item-bind": "value"
        }
      ), {
        hint: "Chaque réponse peut avoir au plus un repère."
      }));
    }
    grid.append(
      field("Niveau", selectControl(BENCHMARK_LEVELS, {
        value: item.level || "information",
        "data-feedback-item-bind": "level"
      })),
      field("Libellé affiché", element("input", {
        class: "qstudio-input",
        type: "text",
        value: item.label || "",
        maxlength: "100",
        placeholder: "Ex. Bon, À améliorer, Repère optimal",
        "data-feedback-item-bind": "label"
      })),
      field("Message éducatif", element("textarea", {
        class: "qstudio-input",
        value: item.message || "",
        maxlength: "1200",
        placeholder: "Explique ce que cette réponse signifie et la prochaine action utile.",
        "data-feedback-item-bind": "message"
      }), { className: "qstudio-field--wide" })
    );
    const source = element("div", {
      class: "qstudio-feedback-source qstudio-field--wide"
    });
    source.append(
      element("small", {
        text: "Source facultative — le libellé et l’URL doivent être remplis ensemble."
      }),
      element("div", { class: "qstudio-grid" },
        field("Libellé de la source", element("input", {
          class: "qstudio-input",
          type: "text",
          value: item.sourceLabel || "",
          maxlength: "160",
          placeholder: "Ex. Santé publique du Canada",
          "data-feedback-item-bind": "sourceLabel"
        })),
        field("URL HTTPS de la source", element("input", {
          class: "qstudio-input",
          type: "url",
          value: item.sourceUrl || "",
          maxlength: "2048",
          placeholder: "https://…",
          "data-feedback-item-bind": "sourceUrl"
        }))
      )
    );
    row.append(grid, source);
    return row;
  }

  function feedbackEditor(question) {
    const supportedKind = feedbackKindForType(question.type);
    if (!supportedKind) return null;
    const details = element("details", {
      class: "qstudio-feedback",
      ...(question.feedback ? { open: true } : {})
    });
    details.append(element("summary", {
      text: question.feedback
        ? `Repères éducatifs — ${feedbackItems(question).length}`
        : "Repères éducatifs — désactivés"
    }));
    const body = element("div", { class: "qstudio-feedback__body" },
      element("p", {
        class: "qstudio-feedback__intro",
        text: supportedKind === "numeric_bands"
          ? "Crée des intervalles sans chevauchement. Le membre verra le message correspondant à sa valeur."
          : "Associe un message éducatif à chaque réponse que tu veux expliquer."
      }),
      field("", element("span", { class: "qstudio-check" },
        element("input", {
          type: "checkbox",
          checked: Boolean(question.feedback),
          "data-feedback-bind": "enabled"
        }),
        element("span", { text: "Afficher une rétroaction éducative après la réponse" })
      ))
    );
    if (question.feedback) {
      feedbackItems(question).forEach((item, index) => {
        body.append(feedbackRowCard(question, item, index));
      });
      const atLimit = supportedKind === "numeric_bands"
        ? feedbackItems(question).length >= 20
        : feedbackItems(question).length >= feedbackChoiceOptions(question).length;
      body.append(element("div", { class: "qstudio-feedback-add" },
        button("Ajouter un repère", "add-feedback-row", {
          disabled: atLimit,
          "data-permanent-disabled": atLimit ? "true" : undefined
        })
      ));
    }
    details.append(body);
    return details;
  }

  function questionCard(question, sectionIndex, questionIndex) {
    const protectedCore = fieldHasProtectedCore(state.draft, question.id);
    const typeLocked = Boolean(question.feedback) || protectedCore;
    const wrapper = element("article", {
      class: "qstudio-question",
      "data-section-index": sectionIndex,
      "data-question-index": questionIndex
    });
    const head = element("div", { class: "qstudio-question__head" });
    const labelName = question.type === "information" ? "Texte éducatif" : "Question";
    head.append(
      field(labelName, question.type === "information"
        ? element("textarea", {
          class: "qstudio-input",
          value: question.label,
          maxlength: "3000",
          "data-question-bind": "label"
        })
        : element("input", {
          class: "qstudio-input",
          type: "text",
          value: question.label,
          maxlength: "500",
          "data-question-bind": "label"
        })),
      field("Type", selectControl(QUESTION_TYPES, {
        value: question.type,
        "data-question-bind": "type",
        disabled: typeLocked,
        "data-permanent-disabled": typeLocked ? "true" : undefined
      }), {
        hint: typeLocked
          ? "Type verrouillé pour conserver les règles ou la rétroaction existantes."
          : ""
      })
    );
    wrapper.append(head);

    const details = element("div", { class: "qstudio-grid", style: "margin-top:10px" });
    if (question.type !== "information") {
      details.append(field("", element("span", { class: "qstudio-check" },
        element("input", {
          type: "checkbox",
          checked: question.required,
          "data-question-bind": "required"
        }),
        element("span", { text: "Réponse obligatoire" })
      )));
    }
    if (!["information", "yes_no"].includes(question.type)) {
      details.append(field("Texte indicatif", element("input", {
        class: "qstudio-input",
        type: "text",
        value: question.placeholder,
        maxlength: "300",
        "data-question-bind": "placeholder"
      })));
    }
    if (question.type !== "information") {
      details.append(field("Aide affichée au membre", element("input", {
        class: "qstudio-input",
        type: "text",
        value: question.help,
        maxlength: "600",
        "data-question-bind": "help"
      }), { className: "qstudio-field--wide" }));
    }
    if (["single_choice", "multi_choice"].includes(question.type)) {
      const choicesLocked = Boolean(question.feedback) || protectedCore;
      details.append(field("Choix — un par ligne", element("textarea", {
        class: "qstudio-input",
        value: question.options.map((option) => option.label).join("\n"),
        "data-question-bind": "optionsText",
        maxlength: "3000",
        disabled: choicesLocked,
        "data-permanent-disabled": choicesLocked ? "true" : undefined
      }), {
        className: "qstudio-field--wide",
        hint: choicesLocked
          ? "Choix verrouillés pour conserver leurs règles et repères éducatifs."
          : ""
      }));
    }
    if (["number", "scale"].includes(question.type)) {
      details.append(
        field("Minimum", element("input", {
          class: "qstudio-input",
          type: "number",
          value: question.min ?? "",
          "data-question-bind": "min",
          disabled: protectedCore,
          "data-permanent-disabled": protectedCore ? "true" : undefined
        })),
        field("Maximum", element("input", {
          class: "qstudio-input",
          type: "number",
          value: question.max ?? "",
          "data-question-bind": "max",
          disabled: protectedCore,
          "data-permanent-disabled": protectedCore ? "true" : undefined
        })),
        field("Pas", element("input", {
          class: "qstudio-input",
          type: "number",
          min: "0.01",
          step: "any",
          value: question.step || 1,
          "data-question-bind": "step",
          disabled: protectedCore,
          "data-permanent-disabled": protectedCore ? "true" : undefined
        }))
      );
    }
    wrapper.append(details);

    if (question.type !== "information") {
      const advanced = element("details", { class: "qstudio-question__advanced" });
      advanced.append(element("summary", { text: "Condition d’affichage et triage" }));
      const advancedGrid = element("div", { class: "qstudio-grid" });
      const conditionLocked = question.condition.editable === false;
      advancedGrid.append(
        field("", element("span", { class: "qstudio-check" },
          element("input", {
            type: "checkbox",
            checked: question.condition.enabled,
            "data-condition-bind": "enabled",
            disabled: conditionLocked,
            "data-permanent-disabled": conditionLocked ? "true" : undefined
          }),
          element("span", { text: "Afficher seulement si…" })
        )),
        field("Question source", selectControl(questionSourceOptions(question.id), {
          value: question.condition.questionId,
          "data-condition-bind": "questionId",
          disabled: conditionLocked,
          "data-permanent-disabled": conditionLocked ? "true" : undefined
        })),
        field("Opérateur", selectControl(CONDITION_OPERATORS, {
          value: question.condition.operator,
          "data-condition-bind": "operator",
          disabled: conditionLocked,
          "data-permanent-disabled": conditionLocked ? "true" : undefined
        })),
        field("Valeur attendue", element("input", {
          class: "qstudio-input",
          type: "text",
          value: question.condition.value,
          "data-condition-bind": "value",
          disabled: conditionLocked,
          "data-permanent-disabled": conditionLocked ? "true" : undefined
        })),
        field("", element("span", { class: "qstudio-check" },
          element("input", {
            type: "checkbox",
            checked: question.triage.enabled,
            "data-triage-bind": "enabled"
          }),
          element("span", { text: "Cette réponse demande un suivi" })
        )),
        field("Quand la réponse…", selectControl(TRIAGE_OPERATORS, {
          value: question.triage.operator,
          "data-triage-bind": "operator"
        })),
        field("Valeur déclencheuse", element("input", {
          class: "qstudio-input",
          type: "text",
          value: question.triage.value,
          placeholder: question.type === "yes_no" ? "false pour Non" : "",
          "data-triage-bind": "value"
        })),
        field("Priorité", selectControl([
          ["P1", "P1 — rapide"],
          ["P2", "P2 — prochain suivi"],
          ["P3", "P3 — à surveiller"]
        ], {
          value: question.triage.priority,
          "data-triage-bind": "priority"
        })),
        field("Libellé de l’action", element("input", {
          class: "qstudio-input",
          type: "text",
          value: question.triage.label,
          maxlength: "180",
          "data-triage-bind": "label"
        }), { className: "qstudio-field--wide" })
      );
      if (conditionLocked) {
        advancedGrid.append(element("p", {
          class: "qstudio-field qstudio-field--wide",
          text: "Cette condition complexe est conservée telle quelle. Le Studio ne la simplifie pas."
        }));
      }
      advanced.append(advancedGrid);
      wrapper.append(advanced);
    }
    const educationalFeedback = feedbackEditor(question);
    if (educationalFeedback) wrapper.append(educationalFeedback);

    const actions = element("div", { class: "qstudio-question__actions" });
    actions.append(
      button("↑", "move-question-up", {
        class: "qstudio-button qstudio-button--icon",
        title: "Monter la question",
        "aria-label": "Monter la question"
      }),
      button("↓", "move-question-down", {
        class: "qstudio-button qstudio-button--icon",
        title: "Descendre la question",
        "aria-label": "Descendre la question"
      }),
      button("Dupliquer", "duplicate-question"),
      button("Supprimer", "delete-question", { class: "qstudio-button qstudio-button--danger" })
    );
    wrapper.append(actions);
    return wrapper;
  }

  function sectionCard(section, sectionIndex) {
    const card = element("section", {
      class: "qstudio-card qstudio-section",
      "data-section-index": sectionIndex,
      "aria-label": `Section ${sectionIndex + 1}`
    });
    const head = element("div", { class: "qstudio-card__head" },
      element("div", {},
        element("h3", { text: `Section ${sectionIndex + 1}` }),
        element("p", { text: `${section.questions.length} élément(s)` })
      ),
      element("div", { class: "qstudio-toolbar__right" },
        button("↑", "move-section-up", {
          class: "qstudio-button qstudio-button--icon",
          "aria-label": "Monter la section",
          title: "Monter la section"
        }),
        button("↓", "move-section-down", {
          class: "qstudio-button qstudio-button--icon",
          "aria-label": "Descendre la section",
          title: "Descendre la section"
        }),
        button("Dupliquer", "duplicate-section"),
        button("Supprimer", "delete-section", { class: "qstudio-button qstudio-button--danger" })
      )
    );
    const sectionFields = element("div", { class: "qstudio-section-fields" },
      field("Titre de section", element("input", {
        class: "qstudio-input",
        type: "text",
        value: section.title,
        maxlength: "180",
        "data-section-bind": "title"
      })),
      field("Introduction", element("input", {
        class: "qstudio-input",
        type: "text",
        value: section.description,
        maxlength: "800",
        "data-section-bind": "description"
      }))
    );
    const questions = element("div", { class: "qstudio-questions" });
    section.questions.forEach((question, questionIndex) => {
      questions.append(questionCard(question, sectionIndex, questionIndex));
    });
    const addRow = element("div", { class: "qstudio-add-row" },
      button("Ajouter une question ou une information", "add-question", {
        "data-section-index": sectionIndex
      })
    );
    card.append(head, sectionFields, questions, addRow);
    return card;
  }

  function previewInput(question) {
    const name = `preview-${question.id}`;
    if (question.type === "information") {
      return element("div", { class: "qstudio-preview-info", text: question.label });
    }
    const wrapper = element("div", {
      class: "qstudio-preview-question",
      "data-preview-question-id": question.id
    });
    const required = question.required ? " *" : "";
    if (["yes_no", "single_choice", "multi_choice"].includes(question.type)) {
      const fieldset = element("fieldset");
      fieldset.append(element("legend", { text: `${question.label}${required}` }));
      if (question.help) fieldset.append(element("small", { text: question.help }));
      const options = question.type === "yes_no"
        ? [{ value: "true", label: "Oui" }, { value: "false", label: "Non" }]
        : question.options;
      for (const option of options) {
        const selected = question.type === "multi_choice"
          ? Array.isArray(state.previewAnswers[question.id])
            && state.previewAnswers[question.id].includes(option.value)
          : responseValueForComparison(state.previewAnswers[question.id]) === option.value;
        fieldset.append(element("label", { class: "qstudio-preview-choice" },
          element("input", {
            type: question.type === "multi_choice" ? "checkbox" : "radio",
            name,
            value: option.value,
            checked: selected,
            "data-preview-answer": question.id
          }),
          element("span", { text: option.label })
        ));
      }
      wrapper.append(fieldset);
      return wrapper;
    }
    wrapper.append(element("label", { for: name, text: `${question.label}${required}` }));
    if (question.help) wrapper.append(element("small", { text: question.help }));
    if (question.type === "long_text") {
      wrapper.append(element("textarea", {
        id: name,
        class: "qstudio-input",
        placeholder: question.placeholder,
        value: state.previewAnswers[question.id] || "",
        "data-preview-answer": question.id
      }));
    } else {
      const inputType = question.type === "date"
        ? "date"
        : ["number", "scale"].includes(question.type) ? "number" : "text";
      wrapper.append(element("input", {
        id: name,
        class: "qstudio-input",
        type: inputType,
        placeholder: question.placeholder,
        min: ["number", "scale"].includes(question.type) ? question.min : undefined,
        max: ["number", "scale"].includes(question.type) ? question.max : undefined,
        step: ["number", "scale"].includes(question.type) ? question.step : undefined,
        value: state.previewAnswers[question.id] ?? "",
        "data-preview-answer": question.id
      }));
    }
    return wrapper;
  }

  function previewPanel() {
    const wrap = element("aside", {
      class: "qstudio-preview-wrap",
      "data-qstudio-preview": "",
      "aria-label": "Aperçu mobile local"
    });
    const head = element("div", { class: "qstudio-preview-head" },
      element("div", {},
        element("h3", { text: "Aperçu mobile" }),
        element("small", { text: "Local — rien n’est envoyé" })
      )
    );
    const phone = element("div", { class: "qstudio-phone" });
    const screen = element("div", { class: "qstudio-phone__screen" });
    const description = element("p", {
      text: state.draft.description || "",
      hidden: !state.draft.description
    });
    const title = element("div", { class: "qstudio-preview-title" },
      element("h3", { text: state.draft.title || "Questionnaire" }),
      description
    );
    const identity = element("div", { class: "qstudio-preview-identity" },
      element("strong", { text: "Tes informations" }),
      element("small", { text: "Elles servent à relier la réponse à ta fiche CFSB." }),
      element("label", { class: "qstudio-field", style: "margin-top:10px" },
        element("span", { class: "qstudio-field__label", text: "Nom complet *" }),
        element("input", {
          class: "qstudio-input",
          type: "text",
          autocomplete: "name",
          placeholder: "Prénom et nom",
          required: true
        })
      ),
      element("label", { class: "qstudio-field", style: "margin-top:10px" },
        element("span", { class: "qstudio-field__label", text: "Téléphone *" }),
        element("input", {
          class: "qstudio-input",
          type: "tel",
          inputmode: "tel",
          autocomplete: "tel",
          placeholder: "450 555-1234",
          required: true
        })
      ),
      state.draft.coreIdentity?.emailRequired
        ? element("label", { class: "qstudio-field", style: "margin-top:10px" },
          element("span", { class: "qstudio-field__label", text: "Courriel *" }),
          element("input", {
            class: "qstudio-input",
            type: "email",
            autocomplete: "email",
            placeholder: "nom@exemple.com",
            required: true
          })
        )
        : null
    );
    screen.append(title, identity);
    state.draft.sections.forEach((section) => {
      const sectionNode = element("section", { class: "qstudio-preview-section" },
        element("h4", { text: section.title || "Section" }),
        section.description ? element("p", { text: section.description }) : null
      );
      section.questions.forEach((question) => sectionNode.append(previewInput(question)));
      screen.append(sectionNode);
    });
    screen.append(element("button", {
      type: "button",
      class: "qstudio-preview-submit",
      disabled: true,
      text: "Envoyer mes réponses"
    }));
    phone.append(screen);
    wrap.append(head, phone);
    return wrap;
  }

  function renderEditor() {
    toolbarActions();
    dom.editor.replaceChildren();
    if (!state.draft) {
      dom.editor.append(element("div", { class: "qstudio-empty" },
        element("div", {},
          element("h3", { text: "Choisis ou crée un questionnaire" }),
          element("p", { text: "Les brouillons restent modifiables; chaque version publiée est immuable." })
        )
      ));
      return;
    }
    const archived = state.draft.status === "archived";
    const editor = element("div", { class: "qstudio-editor" });
    const body = element("div", { class: "qstudio-editor__body" });
    if (archived) {
      body.append(element("div", {
        class: "qstudio-notice",
        text: "Ce questionnaire est archivé. Duplique-le pour créer une nouvelle version de travail."
      }));
    }
    body.append(metadataCard(), triageCard());
    state.draft.sections.forEach((section, index) => body.append(sectionCard(section, index)));
    body.append(element("div", { class: "qstudio-add-row" },
      button("Ajouter une section", "add-section", { disabled: archived })
    ));
    editor.append(body, previewPanel());
    dom.editor.append(editor);
    if (archived) {
      body.querySelectorAll("input, textarea, select, [data-qstudio-action]:not([data-qstudio-action='copy-url']):not([data-qstudio-action='duplicate-form'])")
        .forEach((control) => {
          control.disabled = true;
          control.dataset.permanentDisabled = "true";
        });
    }
    updatePreviewConditions();
  }

  function schedulePreviewRender() {
    globalThis.cancelAnimationFrame?.(state.previewFrame);
    state.previewFrame = globalThis.requestAnimationFrame(() => {
      state.previewFrame = 0;
      if (!state.draft || state.destroyed) return;
      const current = root.querySelector("[data-qstudio-preview]");
      if (!current) return;
      current.replaceWith(previewPanel());
      updatePreviewConditions();
    });
  }

  function refresh({ editor = true } = {}) {
    renderLibrary();
    if (editor) renderEditor();
  }

  function setSelected(form) {
    state.draft = clone(normalizeForm(form));
    state.selectedId = selectedKey(state.draft);
    state.previewAnswers = {};
    clearDirty();
    showNotice([]);
    refresh();
    state.libraryOpen = false;
    root.dataset.libraryOpen = "false";
    root.querySelector("[data-qstudio-action='toggle-library']")?.setAttribute("aria-expanded", "false");
  }

  function updatePreviewConditions() {
    if (!state.draft) return;
    for (const { question } of flattenQuestions(state.draft)) {
      const node = [...root.querySelectorAll("[data-preview-question-id]")]
        .find((candidate) => candidate.dataset.previewQuestionId === question.id);
      if (!node) continue;
      const condition = question.condition;
      if (condition?.editable === false) {
        node.hidden = false;
        continue;
      }
      node.hidden = Boolean(
        condition?.enabled
        && !evaluateRule(
          state.previewAnswers[condition.questionId],
          condition.operator,
          condition.value
        )
      );
    }
  }

  function readPreviewAnswer(target) {
    const questionId = target.dataset.previewAnswer;
    if (!questionId) return;
    const question = flattenQuestions(state.draft).find((entry) => entry.question.id === questionId)?.question;
    if (!question) return;
    if (question.type === "multi_choice") {
      state.previewAnswers[questionId] = [...root.querySelectorAll("[data-preview-answer]")]
        .filter((input) => input.dataset.previewAnswer === questionId && input.checked)
        .map((input) => input.value);
    } else if (question.type === "yes_no") {
      state.previewAnswers[questionId] = target.checked ? target.value === "true" : null;
    } else if (question.type === "single_choice") {
      state.previewAnswers[questionId] = target.checked ? target.value : "";
    } else {
      state.previewAnswers[questionId] = target.value;
    }
    updatePreviewConditions();
  }

  function locateEditorTarget(target) {
    const questionNode = target.closest("[data-question-index]");
    const sectionNode = target.closest("[data-section-index]");
    const sectionIndex = Number(questionNode?.dataset.sectionIndex ?? sectionNode?.dataset.sectionIndex);
    const questionIndex = questionNode ? Number(questionNode.dataset.questionIndex) : -1;
    return {
      sectionIndex,
      questionIndex,
      section: state.draft?.sections?.[sectionIndex],
      question: questionIndex >= 0 ? state.draft?.sections?.[sectionIndex]?.questions?.[questionIndex] : null
    };
  }

  function inputValue(target) {
    if (target.type === "checkbox") return target.checked;
    if (target.type === "number") return target.value === "" ? null : Number(target.value);
    return target.value;
  }

  function handleBuilderInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement)) return;
    if (target.dataset.previewAnswer) {
      readPreviewAnswer(target);
      return;
    }
    if (!state.draft || state.draft.status === "archived") return;
    const { section, question } = locateEditorTarget(target);
    let rerender = false;
    if (target.dataset.bind) {
      const key = target.dataset.bind;
      state.draft[key] = inputValue(target);
      if (key === "slug") {
        state.draft.slug = target.value;
        const urlNode = root.querySelector("[data-qstudio-public-url]");
        if (urlNode) urlNode.textContent = canonicalPublicUrl(target.value, options);
      }
      rerender = key === "mode";
    } else if (target.dataset.sectionBind && section) {
      section[target.dataset.sectionBind] = inputValue(target);
    } else if (target.dataset.questionBind && question) {
      const key = target.dataset.questionBind;
      if (key === "optionsText") {
        question.options = updateOptionLabels(question.options, target.value);
      } else if (key === "type") {
        if (fieldHasProtectedCore(state.draft, question.id)) {
          showStatus("Ce type est verrouillé pour conserver ses règles et repères.", true);
          renderEditor();
          return;
        }
        const nextType = target.value;
        const replacement = normalizeQuestion({
          ...question,
          type: nextType,
          validation: defaultValidation(coreType(nextType), question.options.length),
          min: nextType === "scale" ? 1 : nextType === "number" ? -1_000_000_000 : null,
          max: nextType === "scale" ? 5 : nextType === "number" ? 1_000_000_000 : null,
          step: 1
        });
        Object.assign(question, replacement);
        rerender = true;
      } else {
        question[key] = inputValue(target);
      }
    } else if (target.dataset.feedbackBind && question) {
      if (target.dataset.feedbackBind !== "enabled") return;
      question.feedback = target.checked
        ? question.feedback || defaultFeedbackForQuestion(question)
        : null;
      rerender = true;
    } else if (target.dataset.feedbackItemBind && question?.feedback) {
      const rowIndex = Number(target.closest("[data-feedback-row-index]")?.dataset.feedbackRowIndex);
      const item = feedbackItems(question)[rowIndex];
      if (!item) return;
      const key = target.dataset.feedbackItemBind;
      if (["min", "max"].includes(key)) {
        if (target.value === "") delete item[key];
        else item[key] = Number(target.value);
      } else if (["sourceLabel", "sourceUrl"].includes(key)) {
        if (!text(target.value)) delete item[key];
        else item[key] = target.value.trim();
      } else if (key === "value" && question.type === "yes_no") {
        item.value = target.value === "true";
      } else {
        item[key] = inputValue(target);
      }
    } else if (target.dataset.conditionBind && question) {
      if (question.condition.editable === false) return;
      question.condition[target.dataset.conditionBind] = inputValue(target);
      question.condition.touched = true;
      rerender = target.dataset.conditionBind === "enabled";
    } else if (target.dataset.triageBind && question) {
      if (question.triage.editable === false) return;
      question.triage[target.dataset.triageBind] = inputValue(target);
      question.triage.touched = true;
      rerender = target.dataset.triageBind === "enabled";
    } else if (target.dataset.policyBind) {
      state.draft.triagePolicy[target.dataset.policyBind] = inputValue(target);
    } else {
      return;
    }
    markDirty();
    if (rerender && event.type === "change") renderEditor();
    else schedulePreviewRender();
  }

  function move(array, from, to) {
    if (!Array.isArray(array) || from < 0 || from >= array.length || to < 0 || to >= array.length) return false;
    const [item] = array.splice(from, 1);
    array.splice(to, 0, item);
    return true;
  }

  function duplicateQuestion(question) {
    const copy = clone(question);
    copy.id = makeId("question");
    copy.label = `${copy.label} — copie`;
    copy.condition = {
      ...copy.condition,
      enabled: false,
      questionId: "",
      core: null,
      editable: true,
      touched: true
    };
    copy.triage = {
      ...copy.triage,
      sourceRuleId: "",
      touched: copy.triage?.enabled === true
    };
    return copy;
  }

  function duplicateSection(section) {
    const copy = clone(section);
    copy.id = makeId("section");
    copy.title = `${copy.title} — copie`;
    copy.questions = copy.questions.map(duplicateQuestion);
    return copy;
  }

  function localDuplicate() {
    const copy = clone(state.draft);
    copy.formId = "";
    copy.definitionId = "";
    copy.clientDraftId = makeId("draft");
    copy.title = `${copy.title} — copie`;
    copy.slug = slugify(`${copy.slug}-copie`);
    copy.status = "draft";
    copy.activeVersion = "";
    copy.draftRevision = null;
    copy.slugLocked = false;
    copy.updatedAt = "";
    copy.sections = clone(copy.sections);
    return copy;
  }

  async function invoke(key, payload) {
    try {
      return callableData(await callables[key](payload));
    } catch (error) {
      const code = text(error?.code).replace(/^functions\//u, "");
      const message = text(error?.message);
      const safeMessage = code === "permission-denied"
        ? "Accès administrateur requis."
        : code === "unauthenticated"
          ? "Reconnecte-toi au Dashboard."
          : code === "aborted" || code === "failed-precondition"
            ? "Le formulaire a changé ailleurs. Recharge la bibliothèque avant de recommencer."
            : message && !/token|phone|telephone|email|contact/i.test(message)
              ? message
              : "L’opération n’a pas été confirmée par le serveur.";
      throw new Error(safeMessage);
    }
  }

  async function loadForms({ preserveSelection = false } = {}) {
    setBusy(true);
    showNotice([]);
    try {
      const payload = await invoke("list", { initialize: true });
      state.forms = listPayload(payload).map(normalizeForm);
      const preferred = preserveSelection ? state.selectedId : text(options.initialFormId);
      const selected = formByKey(preferred)
        || state.forms.find((form) => form.formId === preferred)
        || state.forms[0]
        || null;
      if (selected) setSelected(selected);
      else {
        state.selectedId = "";
        state.draft = null;
        clearDirty();
        refresh();
      }
    } catch (error) {
      showNotice([error.message, "Aucune donnée locale n’a été modifiée."], true);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft({ quiet = false } = {}) {
    if (!state.draft) return null;
    const errors = validationErrors(state.draft, { forPublish: true });
    if (errors.length) {
      showNotice(errors, true);
      throw new Error("Le brouillon contient des éléments à corriger.");
    }
    setBusy(true);
    showNotice([]);
    try {
      const draft = serializeDraft(state.draft);
      const payload = await invoke("save", {
        ...(state.draft.formId ? { formId: state.draft.formId } : {}),
        ...(state.draft.formId
          && Number.isInteger(state.draft.draftRevision)
          && state.draft.draftRevision >= 0
          ? { expectedRevision: state.draft.draftRevision }
          : {}),
        draft
      });
      const returned = resultForm(payload);
      const saved = upsertForm(returned ? {
        ...draft,
        ...returned,
        formId: returned.formId || returned.id || draft.formId,
        clientDraftId: returned.clientDraftId || state.draft.clientDraftId,
        status: returned.status || "draft"
      } : {
        ...state.draft,
        draft
      });
      state.selectedId = selectedKey(saved);
      state.draft = clone(saved);
      clearDirty();
      refresh();
      if (!quiet) showStatus("Brouillon enregistré.");
      return saved;
    } finally {
      setBusy(false);
    }
  }

  async function publishForm() {
    if (!state.draft) return;
    const errors = validationErrors(state.draft, { forPublish: true });
    if (errors.length) {
      showNotice(errors, true);
      return;
    }
    if (!globalThis.confirm("Publier une version immuable de ce questionnaire? Le lien public restera le même.")) return;
    try {
      if (state.dirty || !state.draft.formId) await saveDraft({ quiet: true });
      setBusy(true);
      const payload = await invoke("publish", {
        formId: state.draft.formId,
        ...(Number.isInteger(state.draft.draftRevision) && state.draft.draftRevision >= 0
          ? { expectedRevision: state.draft.draftRevision }
          : {})
      });
      const returned = resultForm(payload) || {
        ...state.draft,
        status: "published",
        activeVersion: payload.activeVersion || payload.version
      };
      const published = upsertForm({
        ...state.draft,
        ...returned,
        status: returned.status || "published",
        publicUrl: returned.publicUrl || canonicalPublicUrl(state.draft.slug, options)
      });
      setSelected(published);
      showStatus(`Version ${published.activeVersion || "publiée"} disponible sur le lien fixe.`);
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function archiveForm() {
    if (!state.draft?.formId) return;
    if (!globalThis.confirm(
      "Archiver ce questionnaire? Son lien Studio cessera d'accepter des réponses, "
      + "il disparaîtra de la bibliothèque et les automatisations liées pourront être suspendues. "
      + "Son historique restera disponible."
    )) return;
    setBusy(true);
    try {
      const payload = await invoke("archive", { formId: state.draft.formId });
      const returned = resultForm(payload);
      const archived = upsertForm({
        ...state.draft,
        ...(returned || {}),
        status: "archived"
      });
      setSelected(archived);
      showStatus("Questionnaire archivé.");
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function duplicateForm() {
    if (!state.draft) return;
    if (!state.draft.formId) {
      const duplicate = upsertForm(localDuplicate());
      setSelected(duplicate);
      markDirty();
      showStatus("Copie locale créée. Enregistre-la pour générer son formulaire.");
      return;
    }
    setBusy(true);
    try {
      const payload = await invoke("duplicate", { formId: state.draft.formId });
      const returned = resultForm(payload);
      if (!returned) throw new Error("Le serveur n’a pas retourné la copie.");
      const duplicate = upsertForm({ ...returned, status: "draft" });
      setSelected(duplicate);
      showStatus("Questionnaire dupliqué avec un nouveau lien.");
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function setDeliveryReady() {
    if (!state.draft?.formId || state.draft.status !== "published") return;
    const ready = state.draft.deliveryReady !== true;
    const publicUrl = canonicalPublicUrl(state.draft.slug, options);
    let verificationNote = "";
    if (ready) {
      const confirmed = globalThis.confirm(
        `Activer les envois automatiques seulement si un canari GHL a été reçu.\n\n`
        + `Tag exact : ${state.draft.ghlTag}\nURL exacte : ${publicUrl}\n\n`
        + "Confirmer que le workflow envoie bien cette URL?"
      );
      if (!confirmed) return;
      verificationNote = text(globalThis.prompt(
        "Courte preuve du canari (date et résultat, sans nom ni donnée client) :",
        ""
      ));
      if (verificationNote.length < 8) {
        showNotice("Ajoute une courte preuve du canari GHL reçu.", true);
        return;
      }
    } else if (!globalThis.confirm(
      "Désactiver les nouveaux envois et les nouvelles planifications GHL pour ce formulaire?"
    )) {
      return;
    }
    setBusy(true);
    try {
      const payload = await invoke("delivery", {
        formId: state.draft.formId,
        ready,
        confirmedGhlTag: ready ? state.draft.ghlTag : "",
        confirmedPublicUrl: ready ? publicUrl : "",
        verificationNote
      });
      const returned = resultForm(payload);
      if (!returned) throw new Error("Le serveur n’a pas confirmé l’état de livraison.");
      const updated = upsertForm({ ...state.draft, ...returned });
      setSelected(updated);
      showStatus(ready
        ? "Envois GHL activés après vérification."
        : "Envois GHL désactivés; le partage manuel reste disponible.");
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function copyPublicUrl() {
    if (!state.draft) return;
    const url = canonicalPublicUrl(state.draft.slug, options);
    try {
      await navigator.clipboard.writeText(url);
      showStatus("Lien fixe copié.");
    } catch (_error) {
      const temporary = element("textarea", { value: url, readonly: true });
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";
      document.body.append(temporary);
      temporary.select();
      document.execCommand("copy");
      temporary.remove();
      showStatus("Lien fixe copié.");
    }
  }

  function handleClick(event) {
    const actionNode = event.target.closest("[data-qstudio-action]");
    if (!actionNode || !root.contains(actionNode) || state.busy) return;
    const action = actionNode.dataset.qstudioAction;
    if (action === "set-filter") {
      state.filter = actionNode.dataset.filter || "all";
      renderLibrary();
      return;
    }
    if (action === "toggle-library") {
      state.libraryOpen = !state.libraryOpen;
      root.dataset.libraryOpen = String(state.libraryOpen);
      actionNode.setAttribute("aria-expanded", String(state.libraryOpen));
      return;
    }
    if (action === "create-form") {
      if (!confirmDiscard()) return;
      const draft = upsertForm(newForm(dom.newMode.value, state.forms));
      setSelected(draft);
      markDirty();
      globalThis.requestAnimationFrame(() => root.querySelector("[data-bind='title']")?.focus());
      return;
    }
    if (action === "select-form") {
      const form = formByKey(actionNode.dataset.formKey);
      if (!form || selectedKey(form) === state.selectedId || !confirmDiscard()) return;
      setSelected(form);
      return;
    }
    if (action === "save-form") {
      saveDraft().catch((error) => showNotice(error.message, true));
      return;
    }
    if (action === "publish-form") {
      publishForm();
      return;
    }
    if (action === "archive-form") {
      archiveForm();
      return;
    }
    if (action === "toggle-delivery") {
      setDeliveryReady();
      return;
    }
    if (action === "duplicate-form") {
      duplicateForm();
      return;
    }
    if (action === "copy-url") {
      copyPublicUrl();
      return;
    }
    if (action === "focus-preview") {
      root.querySelector("[data-qstudio-preview]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!state.draft || state.draft.status === "archived") return;
    const { sectionIndex, questionIndex, section, question } = locateEditorTarget(actionNode);
    let changed = false;
    if (action === "add-section") {
      state.draft.sections.push(normalizeSection({
        title: `Section ${state.draft.sections.length + 1}`,
        questions: [defaultQuestion()]
      }, state.draft.sections.length));
      changed = true;
    } else if (action === "move-section-up") {
      if (section?.questions?.some((item) => fieldHasProtectedCore(state.draft, item.id))) {
        showStatus("Cette section garde des règles existantes et ne peut pas être déplacée.", true);
        return;
      }
      changed = move(state.draft.sections, sectionIndex, sectionIndex - 1);
    } else if (action === "move-section-down") {
      if (section?.questions?.some((item) => fieldHasProtectedCore(state.draft, item.id))) {
        showStatus("Cette section garde des règles existantes et ne peut pas être déplacée.", true);
        return;
      }
      changed = move(state.draft.sections, sectionIndex, sectionIndex + 1);
    } else if (action === "duplicate-section" && section) {
      state.draft.sections.splice(sectionIndex + 1, 0, duplicateSection(section));
      changed = true;
    } else if (action === "delete-section" && section) {
      if (state.draft.sections.length === 1) {
        showStatus("Un questionnaire doit conserver au moins une section.", true);
        return;
      }
      if (section.questions.some((item) => fieldHasProtectedCore(state.draft, item.id))) {
        showStatus("Cette section contient une règle ou une rétroaction à conserver.", true);
        return;
      }
      if (globalThis.confirm(`Supprimer la section « ${section.title} »?`)) {
        state.draft.sections.splice(sectionIndex, 1);
        changed = true;
      }
    } else if (action === "add-question" && section) {
      section.questions.push(defaultQuestion());
      changed = true;
    } else if (action === "add-feedback-row" && question?.feedback) {
      const items = feedbackItems(question);
      if (question.feedback.kind === "numeric_bands") {
        if (items.length >= 20) return;
        items.push(defaultNumericBand(question, items));
        changed = true;
      } else {
        const used = new Set(items.map((item) => feedbackValueKey(item.value)));
        const available = feedbackChoiceOptions(question)
          .find((option) => !used.has(feedbackValueKey(option.value)));
        if (!available) {
          showStatus("Toutes les réponses ont déjà un repère.", true);
          return;
        }
        items.push(defaultFeedbackItem(available.value));
        changed = true;
      }
    } else if (action === "delete-feedback-row" && question?.feedback) {
      const rowIndex = Number(
        actionNode.closest("[data-feedback-row-index]")?.dataset.feedbackRowIndex
      );
      const items = feedbackItems(question);
      if (!Number.isInteger(rowIndex) || !items[rowIndex]) return;
      items.splice(rowIndex, 1);
      if (!items.length) question.feedback = null;
      changed = true;
    } else if (action === "move-question-up" && section) {
      if (fieldHasProtectedCore(state.draft, question.id)) {
        showStatus("Cette question garde des règles existantes et ne peut pas être déplacée.", true);
        return;
      }
      changed = move(section.questions, questionIndex, questionIndex - 1);
    } else if (action === "move-question-down" && section) {
      if (fieldHasProtectedCore(state.draft, question.id)) {
        showStatus("Cette question garde des règles existantes et ne peut pas être déplacée.", true);
        return;
      }
      changed = move(section.questions, questionIndex, questionIndex + 1);
    } else if (action === "duplicate-question" && question) {
      section.questions.splice(questionIndex + 1, 0, duplicateQuestion(question));
      changed = true;
    } else if (action === "delete-question" && question) {
      if (fieldHasProtectedCore(state.draft, question.id)) {
        showStatus("Cette question contient une règle ou une rétroaction à conserver.", true);
        return;
      }
      if (globalThis.confirm(`Supprimer « ${question.label} »?`)) {
        section.questions.splice(questionIndex, 1);
        changed = true;
      }
    }
    if (changed) {
      markDirty();
      renderEditor();
    }
  }

  root.addEventListener("click", handleClick);
  root.addEventListener("input", handleBuilderInput);
  root.addEventListener("change", handleBuilderInput);
  globalThis.addEventListener("beforeunload", beforeUnload);

  const ready = loadForms();

  return Object.freeze({
    ready,
    reload: () => {
      if (!confirmDiscard()) return Promise.resolve(false);
      return loadForms({ preserveSelection: true }).then(() => true);
    },
    getDraft: () => clone(state.draft),
    hasUnsavedChanges: () => state.dirty,
    destroy: () => {
      if (state.destroyed) return;
      state.destroyed = true;
      globalThis.clearTimeout(state.toastTimer);
      globalThis.cancelAnimationFrame?.(state.previewFrame);
      globalThis.removeEventListener("beforeunload", beforeUnload);
      root.removeEventListener("click", handleClick);
      root.removeEventListener("input", handleBuilderInput);
      root.removeEventListener("change", handleBuilderInput);
      root.classList.remove("qstudio");
      root.removeAttribute("data-library-open");
      root.replaceChildren();
    }
  });
}
