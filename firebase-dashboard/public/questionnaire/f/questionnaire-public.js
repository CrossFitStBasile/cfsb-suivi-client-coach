const API_PATH = "/api/questionnaires";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_SECTIONS = 50;
const MAX_FIELDS = 250;
const MAX_OPTIONS = 100;
const PRIVACY_POLICY_URL = "https://crossfitstbasilelegrand.com/privacy/";
const PENDING_RESPONSE_STORAGE_PREFIX = "cfsb:questionnaire:pending:";
const RESPONSE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SUPPORTED_TYPES = new Set([
  "info",
  "short_text",
  "long_text",
  "yes_no",
  "single_choice",
  "multi_choice",
  "number",
  "scale",
  "date"
]);

const elements = {
  loading: document.getElementById("loadingState"),
  error: document.getElementById("errorState"),
  errorTitle: document.getElementById("errorTitle"),
  errorMessage: document.getElementById("errorMessage"),
  inactive: document.getElementById("inactiveState"),
  view: document.getElementById("questionnaireView"),
  success: document.getElementById("successState"),
  successTitle: document.getElementById("successTitle"),
  successMessage: document.getElementById("successMessage"),
  canonicalLink: document.getElementById("canonicalLink"),
  title: document.getElementById("questionnaireTitle"),
  description: document.getElementById("questionnaireDescription"),
  progressWrap: document.getElementById("progressWrap"),
  progressText: document.getElementById("progressText"),
  progressSection: document.getElementById("progressSection"),
  progressBar: document.getElementById("progressBar"),
  form: document.getElementById("questionnaireForm"),
  pages: document.getElementById("formPages"),
  errorBox: document.getElementById("formError"),
  actions: document.getElementById("formActions"),
  previous: document.getElementById("previousButton"),
  next: document.getElementById("nextButton"),
  submit: document.getElementById("submitButton"),
  retry: document.getElementById("retryButton"),
  honeypot: document.getElementById("companyWebsite")
};

const state = {
  slug: "",
  canonicalPath: "",
  definition: null,
  stepMode: true,
  includeReview: true,
  pages: [],
  currentPage: 0,
  fields: new Map(),
  identity: {},
  responseId: "",
  submitting: false
};

class PublicQuestionnaireError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "PublicQuestionnaireError";
    this.code = code || "UNKNOWN_ERROR";
    this.status = Number(options.status || 0);
    this.details = options.details || null;
    this.inactive = Boolean(options.inactive);
  }
}

function createElement(tagName, className = "", text = "") {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
  return node;
}

function cleanText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function normalizedType(value) {
  const aliases = {
    information: "info",
    informational: "info",
    text: "short_text",
    textarea: "long_text",
    boolean: "yes_no",
    choice: "single_choice",
    radio: "single_choice",
    checkbox: "multi_choice",
    checkboxes: "multi_choice"
  };
  const type = cleanText(value).toLowerCase();
  return aliases[type] || type;
}

function makeDomId(prefix, index) {
  return `${prefix}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

function extractSlug() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const questionnaireIndex = parts.lastIndexOf("questionnaire");
  if (
    questionnaireIndex < 0 ||
    parts[questionnaireIndex + 1] !== "f" ||
    !parts[questionnaireIndex + 2] ||
    parts.length !== questionnaireIndex + 3
  ) {
    throw new PublicQuestionnaireError(
      "INVALID_FORM_LINK",
      "Ce lien de questionnaire est incomplet.",
      { inactive: true }
    );
  }

  let slug = "";
  try {
    slug = decodeURIComponent(parts[questionnaireIndex + 2]).toLowerCase();
  } catch {
    throw new PublicQuestionnaireError(
      "INVALID_FORM_LINK",
      "Ce lien de questionnaire n’est pas valide.",
      { inactive: true }
    );
  }

  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) {
    throw new PublicQuestionnaireError(
      "INVALID_FORM_LINK",
      "Ce lien de questionnaire n’est pas valide.",
      { inactive: true }
    );
  }
  return slug;
}

function prepareCanonicalLocation(slug) {
  const path = `/questionnaire/f/${encodeURIComponent(slug)}`;
  elements.canonicalLink.href = `${window.location.origin}${path}`;
  state.canonicalPath = path;

  // Les paramètres de requête ne servent jamais à identifier ou préremplir un membre.
  if (window.location.pathname !== path || window.location.search || window.location.hash) {
    window.history.replaceState(null, "", path);
  }
}

function apiUrl(slug) {
  const url = new URL(API_PATH, window.location.origin);
  url.searchParams.set("slug", slug);
  return url.toString();
}

function errorFromPayload(payload, status) {
  const source = payload?.error && typeof payload.error === "object" ? payload.error : payload;
  const code = cleanText(source?.code, `HTTP_${status || 0}`);
  const message = cleanText(source?.message, "La demande n’a pas pu être traitée.");
  const inactiveCodes = new Set([
    "QUESTIONNAIRE_INACTIVE",
    "QUESTIONNAIRE_ARCHIVED",
    "QUESTIONNAIRE_NOT_FOUND",
    "QUESTIONNAIRE_NOT_PUBLISHED",
    "FORM_INACTIVE",
    "FORM_ARCHIVED",
    "FORM_NOT_FOUND",
    "NOT_FOUND",
    "INACTIVE"
  ]);
  return new PublicQuestionnaireError(code, message, {
    status,
    details: source?.details,
    inactive: status === 404 || status === 410 || inactiveCodes.has(code)
  });
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      }
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new PublicQuestionnaireError(
        "REQUEST_TIMEOUT",
        "La connexion prend trop de temps. Réessaie dans un instant."
      );
    }
    throw new PublicQuestionnaireError(
      "NETWORK_ERROR",
      "Impossible de joindre le serveur. Vérifie ta connexion et réessaie."
    );
  } finally {
    window.clearTimeout(timeoutId);
  }

  const rawBody = await response.text();
  let payload = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new PublicQuestionnaireError(
        "INVALID_SERVER_RESPONSE",
        "Le serveur a retourné une réponse illisible.",
        { status: response.status }
      );
    }
  }

  if (!response.ok || payload?.ok === false) {
    throw errorFromPayload(payload, response.status);
  }
  if (!payload || typeof payload !== "object") {
    throw new PublicQuestionnaireError(
      "MISSING_SERVER_ACKNOWLEDGEMENT",
      "Le serveur n’a pas confirmé la demande.",
      { status: response.status }
    );
  }
  return payload;
}

function normalizeOption(rawOption, index) {
  if (rawOption && typeof rawOption === "object" && !Array.isArray(rawOption)) {
    const rawValue = Object.hasOwn(rawOption, "value") ? rawOption.value : rawOption.id;
    const value = rawValue === undefined ? cleanText(rawOption.label, String(index + 1)) : rawValue;
    return {
      value,
      label: cleanText(rawOption.label, String(value)),
      description: cleanText(rawOption.description || rawOption.helpText),
      feedback: rawOption.feedback || rawOption.education || rawOption.benchmark || null
    };
  }
  return {
    value: rawOption,
    label: String(rawOption ?? ""),
    description: "",
    feedback: null
  };
}

function defaultScaleOptions(validation) {
  let minimum = safeInteger(validation?.min, 1);
  let maximum = safeInteger(validation?.max, 5);
  if (maximum < minimum) [minimum, maximum] = [maximum, minimum];
  if (maximum - minimum > 10) maximum = minimum + 10;
  return Array.from({ length: maximum - minimum + 1 }, (_, index) => {
    const value = minimum + index;
    return { value, label: String(value), description: "", feedback: null };
  });
}

function normalizeField(rawField, fieldIndex) {
  if (!rawField || typeof rawField !== "object") {
    throw new PublicQuestionnaireError("INVALID_DEFINITION", "Une question du formulaire est invalide.");
  }
  const id = cleanText(rawField.id || rawField.fieldId || rawField.name);
  const type = normalizedType(rawField.type);
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(id)) {
    throw new PublicQuestionnaireError("INVALID_DEFINITION", "Une question n’a pas d’identifiant valide.");
  }
  if (!SUPPORTED_TYPES.has(type)) {
    throw new PublicQuestionnaireError(
      "UNSUPPORTED_FIELD_TYPE",
      `Le type de question « ${type || "inconnu"} » n’est pas pris en charge.`
    );
  }

  const validation = rawField.validation && typeof rawField.validation === "object"
    ? rawField.validation
    : {};
  let options = Array.isArray(rawField.options)
    ? rawField.options.slice(0, MAX_OPTIONS).map(normalizeOption)
    : [];
  if (type === "yes_no" && options.length === 0) {
    options = [
      { value: true, label: "Oui", description: "", feedback: null },
      { value: false, label: "Non", description: "", feedback: null }
    ];
  }
  if (type === "scale" && options.length === 0) options = defaultScaleOptions(validation);
  if (["yes_no", "single_choice", "multi_choice", "scale"].includes(type) && options.length === 0) {
    throw new PublicQuestionnaireError("INVALID_DEFINITION", "Une question à choix n’a aucune option.");
  }

  return {
    id,
    domId: makeDomId("question", fieldIndex),
    type,
    label: cleanText(rawField.label || rawField.title),
    required: Boolean(rawField.required),
    helpText: cleanText(rawField.helpText || rawField.help || rawField.description),
    placeholder: cleanText(rawField.placeholder),
    content: cleanText(rawField.content || rawField.text || rawField.body),
    options,
    validation,
    visibleWhen: rawField.visibleWhen || rawField.condition || null,
    allowManualReveal: rawField.allowManualReveal === true,
    feedback: rawField.feedback || rawField.education || rawField.benchmark || null
  };
}

function normalizeDefinition(payload) {
  if (payload?.ok === false) throw errorFromPayload(payload, 200);
  const raw = payload?.questionnaire || payload?.definition || payload?.form || payload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PublicQuestionnaireError("INVALID_DEFINITION", "La définition du questionnaire est absente.");
  }

  const status = cleanText(raw.status).toLowerCase();
  if (
    raw.active === false ||
    raw.isActive === false ||
    ["inactive", "archived", "disabled", "draft"].includes(status)
  ) {
    throw new PublicQuestionnaireError(
      "QUESTIONNAIRE_INACTIVE",
      "Ce questionnaire n’accepte plus de réponses.",
      { inactive: true }
    );
  }

  const returnedSlug = cleanText(raw.slug).toLowerCase();
  if (!returnedSlug || returnedSlug !== state.slug) {
    throw new PublicQuestionnaireError(
      "DEFINITION_SLUG_MISMATCH",
      "Le serveur n’a pas retourné le bon questionnaire."
    );
  }
  if (raw.version === undefined || raw.version === null || raw.version === "") {
    throw new PublicQuestionnaireError(
      "UNVERSIONED_DEFINITION",
      "Cette version du questionnaire n’est pas publiable."
    );
  }
  const returnedCanonicalPath = cleanText(raw.canonicalPath, state.canonicalPath);
  if (returnedCanonicalPath !== state.canonicalPath) {
    throw new PublicQuestionnaireError(
      "CANONICAL_PATH_MISMATCH",
      "L’adresse canonique du questionnaire ne correspond pas au lien ouvert."
    );
  }

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  if (rawSections.length === 0 || rawSections.length > MAX_SECTIONS) {
    throw new PublicQuestionnaireError(
      "INVALID_DEFINITION",
      "Le questionnaire ne contient pas un nombre valide de sections."
    );
  }

  let fieldIndex = 0;
  const fieldIds = new Set();
  const sections = rawSections.map((rawSection, sectionIndex) => {
    const rawFields = Array.isArray(rawSection?.fields)
      ? rawSection.fields
      : Array.isArray(rawSection?.questions)
        ? rawSection.questions
        : [];
    const fields = rawFields.map((rawField) => {
      const field = normalizeField(rawField, fieldIndex++);
      if (fieldIds.has(field.id)) {
        throw new PublicQuestionnaireError(
          "DUPLICATE_FIELD_ID",
          `La question « ${field.id} » apparaît plus d’une fois.`
        );
      }
      fieldIds.add(field.id);
      return field;
    });
    return {
      id: cleanText(rawSection?.id, `section-${sectionIndex + 1}`),
      title: cleanText(rawSection?.title, `Section ${sectionIndex + 1}`),
      description: cleanText(rawSection?.description || rawSection?.intro),
      fields
    };
  });

  if (fieldIndex === 0 || fieldIndex > MAX_FIELDS) {
    throw new PublicQuestionnaireError(
      "INVALID_DEFINITION",
      "Le questionnaire ne contient pas un nombre valide de questions."
    );
  }

  const rawMode = cleanText(
    raw.presentation?.mode || raw.displayMode || raw.formMode || raw.layout || raw.mode,
    "steps"
  ).toLowerCase();
  const onePageModes = new Set(["one_page", "one-page", "onepage", "single", "all"]);
  const identityPolicy = raw.identity && typeof raw.identity === "object"
    ? raw.identity
    : {};

  return {
    schemaVersion: cleanText(raw.schemaVersion, "questionnaire-studio/v1"),
    slug: returnedSlug,
    title: cleanText(raw.title, "Questionnaire"),
    description: cleanText(raw.description || raw.intro),
    version: raw.version,
    versionHash: cleanText(raw.versionHash),
    canonicalPath: returnedCanonicalPath,
    identity: {
      phoneRequired: true,
      nameRequired: identityPolicy.nameRequired !== false,
      emailRequired: identityPolicy.emailRequired === true
    },
    sections,
    stepMode: !onePageModes.has(rawMode),
    includeReview: raw.presentation?.review !== false && raw.review !== false,
    submitLabel: cleanText(raw.settings?.submitLabel, "Envoyer mes réponses"),
    confirmationTitle: cleanText(
      raw.confirmation?.title || raw.successMessage?.title,
      "Merci d’avoir pris le temps."
    ),
    confirmationMessage: cleanText(
      raw.confirmation?.message || raw.successMessage?.message || raw.successMessage,
      "Ta réponse a bien été transmise à l’équipe CFSB."
    )
  };
}

function appendQuestionLabel(container, field, inputId = "") {
  const label = createElement(inputId ? "label" : "legend", inputId ? "field-label" : "question-label");
  if (inputId) label.htmlFor = inputId;
  label.append(document.createTextNode(field.label || "Question"));
  if (field.required) {
    const mark = createElement("span", "required-mark", " *");
    mark.setAttribute("aria-hidden", "true");
    label.append(mark);
  } else {
    label.append(createElement("span", "optional-mark", " (optionnel)"));
  }
  container.append(label);
}

function appendHelp(container, field) {
  if (!field.helpText) return "";
  const id = `${field.domId}-help`;
  const help = createElement("p", "field-help", field.helpText);
  help.id = id;
  container.append(help);
  return id;
}

function applyTextValidation(input, field, isLongText = false) {
  const maximumDefault = isLongText ? 10_000 : 500;
  const maximum = Math.min(
    Math.max(safeInteger(field.validation.maxLength, maximumDefault), 1),
    25_000
  );
  const minimum = Math.max(safeInteger(field.validation.minLength, 0), 0);
  input.maxLength = maximum;
  if (minimum > 0 && minimum <= maximum) input.minLength = minimum;
}

function createTextField(field, multiline = false) {
  const container = createElement("div", "field");
  const inputId = `${field.domId}-input`;
  appendQuestionLabel(container, field, inputId);
  const helpId = appendHelp(container, field);
  const input = createElement(multiline ? "textarea" : "input", multiline ? "textarea" : "input");
  input.id = inputId;
  input.name = `answer_${field.domId}`;
  if (!multiline) input.type = "text";
  input.placeholder = field.placeholder;
  input.required = field.required;
  if (helpId) input.setAttribute("aria-describedby", helpId);
  applyTextValidation(input, field, multiline);
  container.append(input);
  return { container, inputs: [input] };
}

function createNumberOrDateField(field) {
  const container = createElement("div", "field");
  const inputId = `${field.domId}-input`;
  appendQuestionLabel(container, field, inputId);
  const helpId = appendHelp(container, field);
  const input = createElement("input", "input");
  input.id = inputId;
  input.name = `answer_${field.domId}`;
  input.type = field.type === "date" ? "date" : "number";
  input.placeholder = field.placeholder;
  input.required = field.required;
  if (helpId) input.setAttribute("aria-describedby", helpId);
  for (const attribute of ["min", "max", "step"]) {
    if (field.validation[attribute] !== undefined && field.validation[attribute] !== null) {
      input.setAttribute(attribute, String(field.validation[attribute]));
    }
  }
  container.append(input);
  return { container, inputs: [input] };
}

function optionInputValue(field, optionIndex) {
  return `${field.domId}-option-${optionIndex}`;
}

function createChoiceField(field) {
  const container = createElement("fieldset", "field");
  appendQuestionLabel(container, field);
  const helpId = appendHelp(container, field);
  const choices = createElement("div", "choice-grid");
  if (field.type === "scale") choices.classList.add("scale-grid");
  if (field.type === "multi_choice") choices.classList.add("multi-grid");
  if (helpId) choices.setAttribute("aria-describedby", helpId);

  const isMultiple = field.type === "multi_choice";
  const inputs = field.options.map((option, optionIndex) => {
    const label = createElement("label", "choice");
    const input = document.createElement("input");
    input.type = isMultiple ? "checkbox" : "radio";
    input.name = `answer_${field.domId}`;
    input.value = optionInputValue(field, optionIndex);
    input.dataset.optionIndex = String(optionIndex);
    if (!isMultiple) input.required = field.required;

    const content = createElement("span", "choice-content");
    const text = option.description ? `${option.label} — ${option.description}` : option.label;
    content.textContent = text;
    label.append(input, content);
    choices.append(label);
    return input;
  });

  container.append(choices);
  return { container, inputs };
}

function createInformationField(field) {
  const container = createElement("aside", "field information-card");
  container.setAttribute("role", "note");
  if (field.label) container.append(createElement("h3", "", field.label));
  const content = createElement("p", "", field.content || field.helpText);
  container.append(content);
  return { container, inputs: [] };
}

function createField(field, section) {
  let rendered;
  if (field.type === "info") rendered = createInformationField(field);
  else if (field.type === "short_text") rendered = createTextField(field, false);
  else if (field.type === "long_text") rendered = createTextField(field, true);
  else if (field.type === "number" || field.type === "date") rendered = createNumberOrDateField(field);
  else rendered = createChoiceField(field);

  const feedback = createElement("div", "field-feedback");
  feedback.id = `${field.domId}-feedback`;
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  feedback.hidden = true;
  rendered.container.append(feedback);
  rendered.inputs.forEach((input) => {
    const describedBy = [input.getAttribute("aria-describedby"), feedback.id].filter(Boolean).join(" ");
    input.setAttribute("aria-describedby", describedBy);
  });

  const record = {
    ...rendered,
    field,
    sectionId: section.id,
    sectionTitle: section.title,
    feedback,
    visible: true,
    manuallyRevealed: false,
    revealButton: null
  };
  if (field.allowManualReveal && field.visibleWhen) {
    const revealButton = createElement(
      "button",
      "button button-secondary manual-reveal-button",
      field.type === "long_text"
        ? "Ajouter un commentaire ou une précision"
        : "Ajouter cette réponse"
    );
    revealButton.type = "button";
    revealButton.addEventListener("click", () => {
      record.manuallyRevealed = true;
      updateConditionalFields();
      const firstInput = record.inputs[0];
      firstInput?.focus({ preventScroll: false });
    });
    record.revealButton = revealButton;
  }
  state.fields.set(field.id, record);
  return record;
}

function createPageTitle(text) {
  const title = createElement("h2", "", text);
  title.tabIndex = -1;
  return title;
}

function createIdentityPage() {
  const page = createElement("section", "form-page");
  page.dataset.pageKind = "identity";
  const heading = createElement("div", "page-heading");
  heading.append(
    createPageTitle("Avant de commencer"),
    createElement(
      "p",
      "",
      "Ces renseignements servent à relier ta réponse à la bonne fiche membre. Tu n’as pas à sélectionner ton coach."
    )
  );
  const privacyNotice = createPrivacyNotice();
  const fields = createElement("div", "fields identity-fields");

  const identityDefinitions = [
    {
      key: "name",
      label: "Ton nom complet",
      type: "text",
      autocomplete: "name",
      placeholder: "Prénom Nom",
      required: state.definition.identity.nameRequired,
      help: ""
    },
    {
      key: "email",
      label: "Ton courriel",
      type: "email",
      autocomplete: "email",
      placeholder: "prenom@exemple.com",
      required: state.definition.identity.emailRequired,
      help: ""
    },
    {
      key: "phone",
      label: "Ton numéro de téléphone",
      type: "tel",
      autocomplete: "tel",
      placeholder: "450 555-1234",
      required: state.definition.identity.phoneRequired,
      help: "Il sert de preuve de rapprochement avec ta fiche CFSB."
    }
  ];

  for (const definition of identityDefinitions) {
    const wrapper = createElement("div", "field");
    const inputId = `identity-${definition.key}`;
    const label = createElement("label", "field-label", definition.label);
    label.htmlFor = inputId;
    if (definition.required) {
      const mark = createElement("span", "required-mark", " *");
      mark.setAttribute("aria-hidden", "true");
      label.append(mark);
    } else {
      label.append(createElement("span", "optional-mark", " (optionnel)"));
    }
    wrapper.append(label);
    let helpId = "";
    if (definition.help) {
      helpId = `${inputId}-help`;
      const help = createElement("p", "field-help", definition.help);
      help.id = helpId;
      wrapper.append(help);
    }
    const input = createElement("input", "input");
    input.id = inputId;
    input.name = `identity_${definition.key}`;
    input.type = definition.type;
    input.autocomplete = definition.autocomplete;
    input.placeholder = definition.placeholder;
    input.required = definition.required;
    input.maxLength = definition.key === "name" ? 160 : definition.key === "email" ? 254 : 40;
    if (definition.key === "phone") input.inputMode = "tel";
    if (helpId) input.setAttribute("aria-describedby", helpId);
    wrapper.append(input);
    fields.append(wrapper);
    state.identity[definition.key] = input;
  }

  page.append(heading, privacyNotice, fields);
  return {
    kind: "identity",
    title: "Identification",
    node: page
  };
}

function createPrivacyNotice() {
  const notice = createElement("aside", "privacy-notice");
  notice.setAttribute("role", "note");
  notice.setAttribute("aria-labelledby", "privacyNoticeTitle");

  const title = createElement("h3", "", "Confidentialité");
  title.id = "privacyNoticeTitle";
  const purpose = createElement(
    "p",
    "",
    "CrossFit St-Basile recueille ton nom, tes coordonnées et tes réponses afin de relier ce questionnaire à ta fiche membre et de permettre à ton entraîneur ainsi qu’aux personnes autorisées de l’équipe CFSB de faire ton suivi."
  );
  const rights = createElement("p");
  const policyLink = createElement("a", "", "politique de confidentialité");
  policyLink.href = PRIVACY_POLICY_URL;
  policyLink.target = "_blank";
  policyLink.rel = "noopener noreferrer";
  policyLink.setAttribute(
    "aria-label",
    "Politique de confidentialité (ouvre un nouvel onglet)"
  );
  rights.append(
    document.createTextNode("Consulte notre "),
    policyLink,
    document.createTextNode(
      " pour savoir comment tes renseignements sont traités. Pour demander l’accès à tes renseignements, leur rectification ou poser une question sur leur utilisation, utilise les coordonnées qui y sont indiquées."
    )
  );
  notice.append(title, purpose, rights);
  return notice;
}

function createSectionPage(section) {
  const page = createElement("section", "form-page");
  page.dataset.pageKind = "section";
  page.dataset.sectionId = section.id;
  const heading = createElement("div", "page-heading");
  heading.append(createPageTitle(section.title));
  if (section.description) heading.append(createElement("p", "", section.description));
  const fieldsRoot = createElement("div", "fields");
  for (const field of section.fields) {
    const record = createField(field, section);
    if (record.revealButton) fieldsRoot.append(record.revealButton);
    fieldsRoot.append(record.container);
  }
  page.append(heading, fieldsRoot);
  return {
    kind: "section",
    title: section.title,
    section,
    node: page
  };
}

function createReviewPage() {
  const page = createElement("section", "form-page");
  page.dataset.pageKind = "review";
  const heading = createElement("div", "page-heading");
  heading.append(
    createPageTitle("Vérifie tes réponses"),
    createElement("p", "", "Tu peux revenir en arrière avant l’envoi.")
  );
  const review = createElement("div", "review-list");
  review.id = "reviewList";
  page.append(heading, review);
  return {
    kind: "review",
    title: "Vérification",
    node: page,
    review
  };
}

function renderDefinition(definition) {
  state.definition = definition;
  state.stepMode = definition.stepMode;
  state.includeReview = definition.includeReview;
  state.currentPage = 0;
  state.fields.clear();
  state.identity = {};
  state.pages = [];
  elements.pages.replaceChildren();
  elements.title.textContent = definition.title;
  elements.description.textContent = definition.description;
  elements.description.hidden = !definition.description;
  elements.submit.textContent = definition.submitLabel;
  document.title = `${definition.title} | CFSB`;

  const identityPage = createIdentityPage();
  state.pages.push(identityPage);
  elements.pages.append(identityPage.node);

  for (const section of definition.sections) {
    const page = createSectionPage(section);
    state.pages.push(page);
    elements.pages.append(page.node);
  }

  if (state.stepMode && state.includeReview) {
    const reviewPage = createReviewPage();
    state.pages.push(reviewPage);
    elements.pages.append(reviewPage.node);
  }

  elements.view.classList.toggle("is-step-mode", state.stepMode);
  elements.view.classList.toggle("is-one-page", !state.stepMode);
  elements.progressWrap.hidden = !state.stepMode;
  elements.loading.hidden = true;
  elements.error.hidden = true;
  elements.inactive.hidden = true;
  elements.success.hidden = true;
  elements.view.hidden = false;
  elements.actions.hidden = false;

  bindFieldEvents();
  updateConditionalFields();
  updateNavigation();
}

function rawInputAnswer(record) {
  const { field, inputs } = record;
  if (field.type === "info") return undefined;
  if (field.type === "multi_choice") {
    return inputs
      .filter((input) => input.checked)
      .map((input) => field.options[Number(input.dataset.optionIndex)]?.value)
      .filter((value) => value !== undefined);
  }
  if (["yes_no", "single_choice", "scale"].includes(field.type)) {
    const input = inputs.find((candidate) => candidate.checked);
    if (!input) return undefined;
    return field.options[Number(input.dataset.optionIndex)]?.value;
  }
  const rawValue = inputs[0]?.value?.trim?.() ?? "";
  if (!rawValue) return undefined;
  if (field.type === "number") {
    const number = Number(rawValue);
    return Number.isFinite(number) ? number : undefined;
  }
  return rawValue;
}

function hasAnswer(answer) {
  if (Array.isArray(answer)) return answer.length > 0;
  return answer !== undefined && answer !== null && answer !== "";
}

function answersForConditions() {
  const answers = {};
  for (const [fieldId, record] of state.fields) {
    if (record.visible) answers[fieldId] = rawInputAnswer(record);
  }
  return answers;
}

function comparable(value) {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return value;
  return value;
}

function valuesEqual(left, right) {
  if (Array.isArray(left)) return left.some((item) => valuesEqual(item, right));
  if (Array.isArray(right)) return right.some((item) => valuesEqual(left, item));
  const leftNumber = typeof left === "number" ? left : Number.NaN;
  const rightNumber = typeof right === "number" ? right : Number.NaN;
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
  return comparable(left) === comparable(right);
}

function numericCompare(answer, expected, operator) {
  const left = Number(answer);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (operator === "lt") return left < right;
  if (operator === "lte") return left <= right;
  if (operator === "gt") return left > right;
  return left >= right;
}

function matchesClause(clause, answers) {
  if (!clause || typeof clause !== "object") return false;
  const fieldId = cleanText(clause.fieldId || clause.field || clause.questionId);
  const operator = cleanText(clause.operator || clause.op, "equals").toLowerCase();
  const answer = answers[fieldId];
  const expected = clause.value;

  if (operator === "is_answered") return hasAnswer(answer);
  if (operator === "is_not_answered") return !hasAnswer(answer);
  if (operator === "equals") return valuesEqual(answer, expected);
  if (operator === "not_equals") return hasAnswer(answer) && !valuesEqual(answer, expected);
  if (operator === "in") {
    const allowed = Array.isArray(expected) ? expected : [expected];
    return allowed.some((value) => valuesEqual(answer, value));
  }
  if (operator === "not_in") {
    const blocked = Array.isArray(expected) ? expected : [expected];
    return hasAnswer(answer) && !blocked.some((value) => valuesEqual(answer, value));
  }
  if (operator === "contains") {
    if (Array.isArray(answer)) return answer.some((value) => valuesEqual(value, expected));
    return String(answer ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  }
  if (["lt", "lte", "gt", "gte"].includes(operator)) return numericCompare(answer, expected, operator);
  return false;
}

function matchesCondition(condition, answers) {
  if (!condition) return true;
  if (Array.isArray(condition)) return condition.every((clause) => matchesClause(clause, answers));
  if (Array.isArray(condition.all)) {
    return condition.all.every((clause) => matchesClause(clause, answers));
  }
  if (Array.isArray(condition.any)) {
    return condition.any.some((clause) => matchesClause(clause, answers));
  }
  if (condition.fieldId || condition.field || condition.questionId) {
    return matchesClause(condition, answers);
  }
  return true;
}

function clearRecord(record) {
  for (const input of record.inputs) {
    if (input.type === "radio" || input.type === "checkbox") input.checked = false;
    else input.value = "";
    input.setCustomValidity("");
  }
  record.feedback.hidden = true;
  record.feedback.replaceChildren();
}

function updateConditionalFields() {
  // Deux passes supplémentaires couvrent les dépendances simples en cascade.
  for (let pass = 0; pass < 3; pass += 1) {
    const answers = answersForConditions();
    let changed = false;
    for (const record of state.fields.values()) {
      const conditionMatches = matchesCondition(record.field.visibleWhen, answers);
      const shouldShow = conditionMatches || (
        record.field.allowManualReveal &&
        record.manuallyRevealed
      );
      if (record.revealButton) {
        record.revealButton.hidden = conditionMatches || record.manuallyRevealed;
      }
      if (record.visible !== shouldShow) {
        if (!shouldShow) clearRecord(record);
        record.visible = shouldShow;
        record.container.hidden = !shouldShow;
        record.inputs.forEach((input) => {
          input.disabled = !shouldShow;
        });
        changed = true;
      }
    }
    if (!changed) break;
  }
  updateAllFeedback();
}

function normalizedFeedbackItem(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    return { title: "", message: raw, tone: "info", sourceLabel: "", sourceUrl: "" };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const message = cleanText(raw.message || raw.content || raw.text || raw.description || raw.body);
  if (!message) return null;
  let sourceUrl = cleanText(raw.sourceUrl);
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== "https:") sourceUrl = "";
      else sourceUrl = parsed.toString();
    } catch {
      sourceUrl = "";
    }
  }
  const rawTone = cleanText(raw.tone || raw.level || raw.status, "info").toLowerCase();
  return {
    title: cleanText(raw.title || raw.label),
    message,
    tone: rawTone === "problematic" ? "problem" : rawTone,
    sourceLabel: sourceUrl ? cleanText(raw.sourceLabel, "Voir la source") : "",
    sourceUrl
  };
}

function feedbackRuleMatches(rule, answer) {
  if (!rule || typeof rule !== "object") return false;
  const condition = rule.when || rule.condition;
  if (condition && typeof condition === "object") {
    const operator = cleanText(condition.operator || condition.op, "equals");
    return matchesClause(
      {
        fieldId: "__current",
        operator,
        value: Object.hasOwn(condition, "value") ? condition.value : condition.equals
      },
      { __current: answer }
    );
  }
  if (Object.hasOwn(rule, "value")) return valuesEqual(answer, rule.value);
  if (Object.hasOwn(rule, "equals")) return valuesEqual(answer, rule.equals);
  if (Array.isArray(rule.values)) return rule.values.some((value) => valuesEqual(answer, value));
  const numericAnswer = Number(answer);
  if (Number.isFinite(numericAnswer)) {
    if (
      rule.min !== undefined &&
      (
        numericAnswer < Number(rule.min) ||
        (numericAnswer === Number(rule.min) && rule.includeMin === false)
      )
    ) {
      return false;
    }
    if (
      rule.max !== undefined &&
      (
        numericAnswer > Number(rule.max) ||
        (numericAnswer === Number(rule.max) && rule.includeMax === false)
      )
    ) {
      return false;
    }
    if (rule.min !== undefined || rule.max !== undefined) return true;
  }
  return Boolean(rule.default);
}

function feedbackFor(record, answer) {
  if (!hasAnswer(answer)) return null;
  const selectedOptions = record.field.options.filter((option) => {
    if (Array.isArray(answer)) return answer.some((value) => valuesEqual(value, option.value));
    return valuesEqual(answer, option.value);
  });
  for (const option of selectedOptions) {
    const item = normalizedFeedbackItem(option.feedback);
    if (item) return item;
  }

  const feedback = record.field.feedback;
  if (!feedback) return null;
  if (typeof feedback === "string") return normalizedFeedbackItem(feedback);
  if (Array.isArray(feedback)) {
    const match = feedback.find((rule) => feedbackRuleMatches(rule, answer));
    return normalizedFeedbackItem(match);
  }
  if (typeof feedback !== "object") return null;

  if (feedback.kind === "numeric_bands" && Array.isArray(feedback.bands)) {
    const match = feedback.bands.find((band) => feedbackRuleMatches(band, answer));
    return normalizedFeedbackItem(match);
  }

  if (feedback.kind === "choice_map" && Array.isArray(feedback.choices)) {
    const values = Array.isArray(answer) ? answer : [answer];
    const match = feedback.choices.find((choice) =>
      values.some((value) => valuesEqual(value, choice.value))
    );
    return normalizedFeedbackItem(match);
  }

  if (feedback.byValue && typeof feedback.byValue === "object") {
    const values = Array.isArray(answer) ? answer : [answer];
    for (const value of values) {
      const item = normalizedFeedbackItem(feedback.byValue[String(value)]);
      if (item) return item;
    }
  }

  const rules = Array.isArray(feedback.rules)
    ? feedback.rules
    : Array.isArray(feedback.ranges)
      ? feedback.ranges
      : [];
  const match = rules.find((rule) => feedbackRuleMatches(rule, answer));
  if (match) return normalizedFeedbackItem(match);

  return normalizedFeedbackItem(feedback.default || feedback);
}

function updateFeedback(record) {
  if (!record.visible || record.field.type === "info") {
    record.feedback.hidden = true;
    return;
  }
  const feedback = feedbackFor(record, rawInputAnswer(record));
  if (!feedback) {
    record.feedback.hidden = true;
    record.feedback.replaceChildren();
    return;
  }
  record.feedback.replaceChildren();
  if (feedback.title) record.feedback.append(createElement("strong", "", feedback.title));
  record.feedback.append(createElement("p", "", feedback.message));
  if (feedback.sourceUrl) {
    const source = createElement(
      "a",
      "field-feedback-source",
      feedback.sourceLabel || "Voir la source"
    );
    source.href = feedback.sourceUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    record.feedback.append(source);
  }
  record.feedback.dataset.tone = feedback.tone;
  record.feedback.hidden = false;
}

function updateAllFeedback() {
  for (const record of state.fields.values()) updateFeedback(record);
}

function bindFieldEvents() {
  for (const record of state.fields.values()) {
    for (const input of record.inputs) {
      const handler = () => {
        input.setCustomValidity("");
        hideFormError();
        updateConditionalFields();
      };
      input.addEventListener("input", handler);
      input.addEventListener("change", handler);
    }
  }
  for (const input of Object.values(state.identity)) {
    input.addEventListener("input", () => {
      input.setCustomValidity("");
      hideFormError();
    });
  }
}

function normalizedPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function visibleRecordsForPage(page) {
  if (page.kind !== "section") return [];
  return page.section.fields
    .map((field) => state.fields.get(field.id))
    .filter((record) => record?.visible);
}

function validateRecord(record) {
  const answer = rawInputAnswer(record);
  record.inputs.forEach((input) => input.setCustomValidity(""));
  if (record.field.required && !hasAnswer(answer)) {
    const firstInput = record.inputs[0];
    if (firstInput) firstInput.setCustomValidity("Réponds à cette question avant de continuer.");
    return firstInput || record.container;
  }

  if (record.field.type === "multi_choice" && hasAnswer(answer)) {
    const minimum = Math.max(safeInteger(record.field.validation.minSelections, 0), 0);
    const maximum = Math.max(
      safeInteger(record.field.validation.maxSelections, record.field.options.length),
      1
    );
    if (answer.length < minimum || answer.length > maximum) {
      const firstInput = record.inputs[0];
      const message = answer.length < minimum
        ? `Choisis au moins ${minimum} réponses.`
        : `Choisis au maximum ${maximum} réponses.`;
      firstInput?.setCustomValidity(message);
      return firstInput || record.container;
    }
  }

  for (const input of record.inputs) {
    if (!input.checkValidity()) return input;
  }
  return null;
}

function validateIdentity() {
  const phone = state.identity.phone;
  phone.setCustomValidity("");
  if (normalizedPhone(phone.value).length !== 10) {
    phone.setCustomValidity("Entre un numéro de téléphone à 10 chiffres.");
  }
  for (const input of Object.values(state.identity)) {
    if (!input.checkValidity()) return input;
  }
  return null;
}

function focusInvalid(invalid) {
  showFormError("Vérifie les champs indiqués avant de continuer.");
  if (typeof invalid.reportValidity === "function") invalid.reportValidity();
  invalid.focus?.({ preventScroll: true });
  invalid.scrollIntoView?.({ behavior: "smooth", block: "center" });
}

function validatePage(page) {
  let invalid = null;
  if (page.kind === "identity") invalid = validateIdentity();
  if (page.kind === "section") {
    for (const record of visibleRecordsForPage(page)) {
      invalid = validateRecord(record);
      if (invalid) break;
    }
  }
  if (invalid) {
    focusInvalid(invalid);
    return false;
  }
  hideFormError();
  return true;
}

function validateAll() {
  const invalidIdentity = validateIdentity();
  if (invalidIdentity) {
    if (state.stepMode) goToPage(0);
    focusInvalid(invalidIdentity);
    return false;
  }
  for (let pageIndex = 0; pageIndex < state.pages.length; pageIndex += 1) {
    const page = state.pages[pageIndex];
    if (page.kind !== "section") continue;
    for (const record of visibleRecordsForPage(page)) {
      const invalid = validateRecord(record);
      if (invalid) {
        if (state.stepMode) goToPage(pageIndex);
        focusInvalid(invalid);
        return false;
      }
    }
  }
  hideFormError();
  return true;
}

function displayAnswer(record, answer) {
  if (!hasAnswer(answer)) return "Sans réponse";
  if (["yes_no", "single_choice", "multi_choice", "scale"].includes(record.field.type)) {
    const values = Array.isArray(answer) ? answer : [answer];
    return values
      .map((value) => record.field.options.find((option) => valuesEqual(option.value, value))?.label || String(value))
      .join(", ");
  }
  return String(answer);
}

function appendReviewRow(sectionNode, label, value) {
  const row = createElement("div", "review-row");
  row.append(
    createElement("span", "review-key", label),
    createElement("span", "review-value", value || "Sans réponse")
  );
  sectionNode.append(row);
}

function renderReview() {
  const reviewPage = state.pages.find((page) => page.kind === "review");
  if (!reviewPage) return;
  reviewPage.review.replaceChildren();

  const identitySection = createElement("section", "review-section");
  identitySection.append(createElement("h3", "", "Identification"));
  appendReviewRow(identitySection, "Nom", state.identity.name.value.trim());
  if (state.identity.email.value.trim()) {
    appendReviewRow(identitySection, "Courriel", state.identity.email.value.trim());
  }
  appendReviewRow(identitySection, "Téléphone", state.identity.phone.value.trim());
  const identityEdit = createElement("button", "review-edit", "Modifier");
  identityEdit.type = "button";
  identityEdit.setAttribute("aria-label", "Modifier l’identification");
  identityEdit.addEventListener("click", () => goToPage(0));
  identitySection.append(identityEdit);
  reviewPage.review.append(identitySection);

  for (const [pageIndex, page] of state.pages.entries()) {
    if (page.kind !== "section") continue;
    const sectionNode = createElement("section", "review-section");
    sectionNode.append(createElement("h3", "", page.title));
    let rowCount = 0;
    for (const record of visibleRecordsForPage(page)) {
      if (record.field.type === "info") continue;
      const answer = rawInputAnswer(record);
      if (!hasAnswer(answer) && !record.field.required) continue;
      appendReviewRow(sectionNode, record.field.label || "Question", displayAnswer(record, answer));
      rowCount += 1;
    }
    if (rowCount === 0) sectionNode.append(createElement("p", "field-help", "Aucune réponse dans cette section."));
    const edit = createElement("button", "review-edit", "Modifier");
    edit.type = "button";
    edit.setAttribute("aria-label", `Modifier la section ${page.title}`);
    edit.addEventListener("click", () => goToPage(pageIndex));
    sectionNode.append(edit);
    reviewPage.review.append(sectionNode);
  }
}

function updateNavigation() {
  if (!state.stepMode) {
    state.pages.forEach((page) => page.node.classList.add("is-active"));
    elements.previous.hidden = true;
    elements.next.hidden = true;
    elements.submit.hidden = false;
    return;
  }

  state.pages.forEach((page, index) => {
    page.node.classList.toggle("is-active", index === state.currentPage);
  });
  const page = state.pages[state.currentPage];
  const isLast = state.currentPage === state.pages.length - 1;
  const isReview = page?.kind === "review";
  if (isReview) renderReview();
  elements.progressText.textContent = `Étape ${state.currentPage + 1} sur ${state.pages.length}`;
  elements.progressSection.textContent = page?.title || "";
  elements.progressBar.style.width = `${((state.currentPage + 1) / state.pages.length) * 100}%`;
  elements.previous.hidden = state.currentPage === 0;
  elements.next.hidden = isLast;
  elements.submit.hidden = !isLast;
}

function goToPage(pageIndex) {
  state.currentPage = Math.max(0, Math.min(pageIndex, state.pages.length - 1));
  hideFormError();
  updateNavigation();
  elements.view.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => {
    state.pages[state.currentPage]?.node.querySelector("h2")?.focus?.();
  }, 0);
}

function showFormError(message) {
  elements.errorBox.textContent = message;
  elements.errorBox.hidden = false;
}

function hideFormError() {
  elements.errorBox.hidden = true;
  elements.errorBox.textContent = "";
}

function createResponseId() {
  if (window.crypto?.randomUUID) return `questionnaire-${window.crypto.randomUUID()}`;
  const random = Math.random().toString(36).slice(2);
  return `questionnaire-${Date.now()}-${random}`;
}

function pendingResponseStorageKey(slug, version) {
  return (
    PENDING_RESPONSE_STORAGE_PREFIX
    + `${encodeURIComponent(String(slug))}:${encodeURIComponent(String(version))}`
  );
}

function pendingResponseStorage() {
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

function loadOrCreateResponseId(slug, version) {
  const storage = pendingResponseStorage();
  const storageKey = pendingResponseStorageKey(slug, version);
  if (storage) {
    try {
      const storedResponseId = String(storage.getItem(storageKey) || "").trim();
      if (RESPONSE_ID_PATTERN.test(storedResponseId)) return storedResponseId;
    } catch {
      // Le formulaire reste utilisable lorsque le stockage du navigateur est bloqué.
    }
  }

  const responseId = createResponseId();
  if (storage) {
    try {
      storage.setItem(storageKey, responseId);
    } catch {
      // La clé demeure au moins stable en mémoire pour cette page.
    }
  }
  return responseId;
}

function clearPendingResponseId(slug, version, responseId) {
  const storage = pendingResponseStorage();
  if (!storage) return;
  const storageKey = pendingResponseStorageKey(slug, version);
  try {
    if (storage.getItem(storageKey) === responseId) {
      storage.removeItem(storageKey);
    }
  } catch {
    // L’accusé durable est valide même si le navigateur refuse le nettoyage local.
  }
}

function submissionAnswers() {
  const answers = {};
  for (const [fieldId, record] of state.fields) {
    if (!record.visible || record.field.type === "info") continue;
    const answer = rawInputAnswer(record);
    if (hasAnswer(answer)) answers[fieldId] = answer;
  }
  return answers;
}

function buildSubmission() {
  const identity = {
    phone: state.identity.phone.value.trim(),
    name: state.identity.name.value.trim()
  };
  const email = state.identity.email.value.trim();
  if (email) identity.email = email;

  const meta = {
    sourceUrl: state.definition.canonicalPath,
    definitionVersion: state.definition.version
  };
  if (state.definition.versionHash) meta.versionHash = state.definition.versionHash;

  return {
    companyWebsite: elements.honeypot.value,
    idempotencyKey: state.responseId,
    identity,
    answers: submissionAnswers(),
    meta
  };
}

function submissionErrorMessage(error) {
  const code = cleanText(error?.code).toUpperCase();
  if (code.includes("IDENTITY") || code.includes("PHONE")) {
    return "Le numéro de téléphone ne permet pas de relier la réponse. Vérifie-le et réessaie.";
  }
  if (code.includes("VERSION") || code.includes("HASH") || code.includes("PUBLISHED")) {
    return "Le questionnaire a été mis à jour. Recharge la page avant de répondre.";
  }
  if (code.includes("IDEMPOTENCY") || code.includes("REPLAY")) {
    return "Une réponse liée à cette tentative semble déjà avoir été reçue, mais son contenu ne correspond plus. Ne l’envoie pas de nouveau; communique avec l’équipe CFSB pour la faire vérifier.";
  }
  if (code.includes("VALIDATION") || code.includes("ANSWER") || code.includes("FIELD")) {
    return "Certaines réponses ne sont pas valides. Vérifie le formulaire et réessaie.";
  }
  return error?.message || "L’envoi n’a pas fonctionné. Vérifie ta connexion et réessaie.";
}

function showSuccess() {
  elements.view.hidden = true;
  elements.actions.hidden = true;
  elements.error.hidden = true;
  elements.inactive.hidden = true;
  elements.successTitle.textContent = state.definition.confirmationTitle;
  elements.successMessage.textContent = state.definition.confirmationMessage;
  elements.success.hidden = false;
  elements.success.focus?.();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function hasDurableSubmissionAcknowledgement(acknowledgement) {
  const response = acknowledgement?.response;
  return (
    acknowledgement?.ok === true &&
    response !== null &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    response.stored === true &&
    typeof response.idempotencyKey === "string" &&
    response.idempotencyKey === state.responseId &&
    typeof response.responseId === "string" &&
    response.responseId.trim().length > 0 &&
    typeof response.duplicate === "boolean" &&
    typeof response.receivedAt === "string" &&
    response.receivedAt.trim().length > 0
  );
}

async function submitQuestionnaire() {
  if (state.submitting || !validateAll()) return;

  // Le piège ne peut jamais produire un écran de succès sans accusé durable.
  if (elements.honeypot.value) {
    showFormError("L’envoi n’a pas pu être confirmé. Actualise la page et réessaie.");
    return;
  }

  state.submitting = true;
  elements.submit.disabled = true;
  elements.submit.textContent = "Envoi en cours…";
  hideFormError();

  try {
    const payload = buildSubmission();
    const acknowledgement = await requestJson(apiUrl(state.slug), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!hasDurableSubmissionAcknowledgement(acknowledgement)) {
      throw new PublicQuestionnaireError(
        "MISSING_SERVER_ACKNOWLEDGEMENT",
        "Le serveur n’a pas confirmé l’enregistrement de la réponse."
      );
    }
    clearPendingResponseId(
      state.slug,
      state.definition.version,
      state.responseId
    );
    showSuccess();
  } catch (error) {
    showFormError(submissionErrorMessage(error));
    elements.errorBox.focus({ preventScroll: true });
    elements.errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
    elements.submit.disabled = false;
    elements.submit.textContent = state.definition.submitLabel;
    state.submitting = false;
  }
}

function hideAllStates() {
  elements.loading.hidden = true;
  elements.error.hidden = true;
  elements.inactive.hidden = true;
  elements.view.hidden = true;
  elements.success.hidden = true;
  elements.actions.hidden = true;
}

function showLoadError(error) {
  hideAllStates();
  if (error?.inactive) {
    elements.inactive.hidden = false;
    elements.inactive.focus?.();
    return;
  }
  elements.errorTitle.textContent = "Le questionnaire n’a pas pu être chargé.";
  elements.errorMessage.textContent =
    error?.message || "Vérifie ta connexion, puis réessaie.";
  elements.error.hidden = false;
  elements.error.focus?.();
}

async function loadQuestionnaire() {
  hideAllStates();
  elements.loading.hidden = false;
  try {
    state.slug = extractSlug();
    prepareCanonicalLocation(state.slug);
    const payload = await requestJson(apiUrl(state.slug), { method: "GET" });
    const definition = normalizeDefinition(payload);
    state.responseId = loadOrCreateResponseId(state.slug, definition.version);
    renderDefinition(definition);
  } catch (error) {
    showLoadError(error);
  }
}

elements.next.addEventListener("click", () => {
  const page = state.pages[state.currentPage];
  if (!page || !validatePage(page)) return;
  goToPage(state.currentPage + 1);
});

elements.previous.addEventListener("click", () => {
  goToPage(state.currentPage - 1);
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuestionnaire();
});

elements.retry.addEventListener("click", loadQuestionnaire);

loadQuestionnaire();
