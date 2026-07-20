import { readQuestionnaireAccessToken } from "./questionnaire-access.mjs";
import {
  resolveQuestionnaireSubmissionEndpoint,
  submitQuestionnaireWithAcknowledgement
} from "./questionnaire-submission.mjs";

const ENDPOINT_URL = resolveQuestionnaireSubmissionEndpoint({
  runtimeEndpoint: window.__CFSB_QUESTIONNAIRE_CONFIG__?.submissionEndpoint,
  metaEndpoint: document.querySelector('meta[name="cfsb-questionnaire-submit-endpoint"]')?.content
});
const SCHEMA_VERSION = "1.1";
const SOURCE = "cfsb-client-coach-questionnaire";
const APP_VERSION = "firebase-questionnaire-suite-v1";
const params = new URLSearchParams(window.location.search);

const FALLBACK_COACHES = [
  { name: "Camille Proulx", id: "17242" },
  { name: "David Olivier", id: "15902" },
  { name: "Gabriel Mayer Bedard", id: "15893" },
  { name: "Hugo Lelievre", id: "15937" },
  { name: "Iheb Yahyaoui", id: "15928" },
  { name: "Marc-Andre Menard", id: "15935" },
  { name: "Raphael Samson", id: "15936" }
];

const COMMON_IDENTITY = {
  title: "Tes informations",
  intro: "Elles servent uniquement à relier cette réponse à ton dossier et à ton coach.",
  identity: true,
  fields: [
    { name: "client_name", label: "Nom complet", type: "text", autocomplete: "name", required: true },
    { name: "client_email", label: "Courriel", type: "email", autocomplete: "email", required: false },
    {
      name: "client_phone",
      label: "Téléphone",
      type: "tel",
      autocomplete: "tel",
      required: true,
      help: "Le téléphone permet de retrouver la bonne fiche client."
    },
    { name: "coach_name", label: "Coach principal", type: "coach", required: true }
  ]
};

const CONFIGS = {
  habitudes_quotidiennes: {
    type: "habitudes_quotidiennes",
    label: "Check-in",
    intro: "Un suivi court pour voir ce qui va bien et choisir la prochaine habitude utile.",
    followupType: "check_in",
    steps: [
      COMMON_IDENTITY,
      {
        title: "Tes repères",
        intro: "Réponds selon ta réalité des derniers jours.",
        fields: [
          {
            name: "habits_priorities",
            label: "Tes priorités sont-elles claires et convenues avec ton coach ?",
            type: "choice",
            required: true,
            options: ["Oui", "En partie", "Non"]
          },
          {
            name: "habits_rhythm",
            label: "Comment décrirais-tu ton rythme quotidien autour du sommeil, de la nutrition et du mouvement ?",
            type: "choice",
            required: true,
            options: ["Stable", "Variable", "Difficile en ce moment"]
          },
          {
            name: "habits_water",
            label: "Quelle quantité d'eau bois-tu habituellement par jour ?",
            type: "choice",
            required: true,
            options: ["Moins de 1 L", "1 à 1,5 L", "1,5 à 2 L", "2 L ou plus"]
          }
        ]
      },
      {
        title: "Tes bases quotidiennes",
        intro: "Choisis la réponse qui ressemble le plus à ta dernière semaine.",
        fields: [
          {
            name: "habits_movement30",
            label: "As-tu bougé au moins 30 minutes par jour ?",
            type: "choice",
            required: true,
            options: ["Souvent", "Parfois", "Rarement"]
          },
          {
            name: "habits_outdoor15",
            label: "Es-tu allé dehors au moins 15 minutes par jour ?",
            type: "choice",
            required: true,
            options: ["Souvent", "Parfois", "Rarement"]
          },
          {
            name: "habits_sleep7",
            label: "As-tu dormi au moins 7 heures par nuit ?",
            type: "choice",
            required: true,
            options: ["Souvent", "Parfois", "Rarement"]
          },
          {
            name: "habits_bowel_daily",
            label: "Ton transit intestinal a-t-il été régulier ?",
            type: "choice",
            required: true,
            options: ["Oui", "Variable", "Non"]
          }
        ]
      },
      {
        title: "Ta prochaine priorité",
        intro: "Aide ton coach à préparer un suivi concret.",
        fields: [
          {
            name: "habits_focus",
            label: "Quel aspect serait le plus utile à améliorer maintenant ?",
            type: "textarea",
            required: true,
            placeholder: "Ex. mieux planifier mes repas, dormir plus régulièrement..."
          },
          {
            name: "habits_priority",
            label: "Quelle base veux-tu prioriser ?",
            type: "select",
            required: true,
            options: ["Sommeil", "Nutrition", "Hydratation", "Mouvement", "Récupération", "Organisation", "Autre"]
          },
          {
            name: "habits_support",
            label: "Quel soutien aimerais-tu recevoir ?",
            type: "choice",
            required: true,
            options: ["Aucun pour l'instant", "Un message", "Une discussion au prochain suivi", "Une discussion rapidement"]
          }
        ]
      }
    ]
  },
  evaluation_habitudes_vie: {
    type: "evaluation_habitudes_vie",
    label: "Évaluation habitudes de vie",
    intro: "Une vue d'ensemble de tes habitudes pour choisir les ajustements qui auront le plus d'impact.",
    followupType: "evaluation_habitudes_vie",
    steps: [
      COMMON_IDENTITY,
      {
        title: "Objectif et contexte",
        intro: "On commence par ce qui compte le plus pour toi.",
        fields: [
          {
            name: "eval_main_goal",
            label: "Quel est ton objectif principal en ce moment ?",
            type: "textarea",
            required: true,
            placeholder: "Décris le changement que tu aimerais observer."
          },
          {
            name: "eval_obstacles",
            label: "Qu'est-ce qui te freine le plus actuellement ?",
            type: "textarea",
            required: true,
            placeholder: "Ex. horaire, énergie, douleurs, organisation..."
          },
          {
            name: "eval_readiness",
            label: "À quel point te sens-tu prêt à changer une habitude ?",
            type: "scale",
            required: true,
            options: ["1", "2", "3", "4", "5"],
            help: "1 = pas prêt, 5 = très prêt"
          }
        ]
      },
      {
        title: "Nutrition et hydratation",
        intro: "Pense à une semaine normale, pas à une semaine parfaite.",
        fields: [
          {
            name: "eval_meals",
            label: "À quelle fréquence manges-tu des repas complets et réguliers ?",
            type: "choice",
            required: true,
            options: ["Presque toujours", "Souvent", "Parfois", "Rarement"]
          },
          {
            name: "eval_protein",
            label: "À quelle fréquence inclus-tu une source de protéines à tes repas ?",
            type: "choice",
            required: true,
            options: ["Presque toujours", "Souvent", "Parfois", "Rarement"]
          },
          {
            name: "eval_fruits_vegetables",
            label: "À quelle fréquence manges-tu des fruits ou des légumes ?",
            type: "choice",
            required: true,
            options: ["À chaque repas", "Deux fois par jour", "Une fois par jour", "Rarement"]
          },
          {
            name: "eval_hydration",
            label: "Comment évalues-tu ton hydratation ?",
            type: "choice",
            required: true,
            options: ["Très bonne", "Bonne", "Variable", "Insuffisante"]
          },
          {
            name: "eval_nutrition_note",
            label: "Y a-t-il un détail nutritionnel que ton coach devrait connaître ?",
            type: "textarea",
            required: false,
            placeholder: "Optionnel"
          }
        ]
      },
      {
        title: "Sommeil et récupération",
        intro: "Ces réponses aident à ajuster le soutien et la charge d'entraînement.",
        fields: [
          {
            name: "eval_sleep",
            label: "Combien d'heures dors-tu en moyenne ?",
            type: "choice",
            required: true,
            options: ["Moins de 6 h", "6 à 7 h", "7 à 8 h", "Plus de 8 h"]
          },
          {
            name: "eval_sleep_quality",
            label: "Comment évalues-tu la qualité de ton sommeil ?",
            type: "scale",
            required: true,
            options: ["1", "2", "3", "4", "5"],
            help: "1 = très mauvaise, 5 = excellente"
          },
          {
            name: "eval_stress",
            label: "Comment évalues-tu ton niveau de stress actuel ?",
            type: "scale",
            required: true,
            options: ["1", "2", "3", "4", "5"],
            help: "1 = très faible, 5 = très élevé"
          },
          {
            name: "eval_recovery_note",
            label: "Qu'est-ce qui aiderait le plus ta récupération ?",
            type: "textarea",
            required: false,
            placeholder: "Optionnel"
          }
        ]
      },
      {
        title: "Énergie, mouvement et confort",
        intro: "Signale ce qui peut influencer tes entraînements ou ton quotidien.",
        fields: [
          {
            name: "eval_energy",
            label: "Comment évalues-tu ton énergie au quotidien ?",
            type: "scale",
            required: true,
            options: ["1", "2", "3", "4", "5"],
            help: "1 = très basse, 5 = excellente"
          },
          {
            name: "eval_movement_outside_training",
            label: "À quelle fréquence bouges-tu en dehors de tes entraînements planifiés ?",
            type: "choice",
            required: true,
            options: ["Tous les jours", "Quelques jours par semaine", "Une fois par semaine", "Rarement"]
          },
          {
            name: "eval_pain",
            label: "As-tu une douleur ou une limitation qui mérite l'attention de ton coach ?",
            type: "choice",
            required: true,
            options: ["Non", "Oui, légère", "Oui, elle limite certaines activités", "Oui, elle affecte mon quotidien"]
          },
          {
            name: "eval_body_note",
            label: "Précise la douleur, la limitation ou tout autre élément pertinent.",
            type: "textarea",
            required: false,
            placeholder: "Optionnel"
          }
        ]
      },
      {
        title: "Plan d'action",
        intro: "Choisis un prochain pas réaliste.",
        fields: [
          {
            name: "eval_next_focus",
            label: "Sur quoi veux-tu concentrer tes efforts en premier ?",
            type: "select",
            required: true,
            options: ["Sommeil", "Nutrition", "Hydratation", "Gestion du stress", "Mouvement", "Récupération", "Organisation", "Autre"]
          },
          {
            name: "eval_commitment",
            label: "Quel engagement concret prends-tu pour la prochaine semaine ?",
            type: "textarea",
            required: true,
            placeholder: "Un geste simple, précis et réaliste."
          },
          {
            name: "eval_contact",
            label: "Quand aimerais-tu en discuter avec ton coach ?",
            type: "choice",
            required: true,
            options: ["Pas nécessaire pour l'instant", "Au prochain suivi", "Cette semaine", "Dès que possible"]
          }
        ]
      }
    ]
  }
};

const type = document.body.dataset.questionnaireType;
const config = CONFIGS[type];
if (!config) throw new Error(`Questionnaire inconnu: ${type}`);

const form = document.getElementById("questionnaireForm");
const stepsRoot = document.getElementById("steps");
const title = document.getElementById("questionnaireTitle");
const intro = document.getElementById("questionnaireIntro");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const stepName = document.getElementById("stepName");
const previousButton = document.getElementById("previousButton");
const nextButton = document.getElementById("nextButton");
const submitButton = document.getElementById("submitButton");
const errorBox = document.getElementById("formError");
const successBox = document.getElementById("formSuccess");
const RESPONSE_ID = window.crypto?.randomUUID?.() || `resp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let currentStep = 0;
let isSubmitting = false;
let coachOptions = [...FALLBACK_COACHES];

title.textContent = config.label;
intro.textContent = config.intro;
document.title = `${config.label} | CFSB`;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fieldMarkup(field) {
  const id = `field-${field.name}`;
  const required = field.required ? "required" : "";
  const requiredLabel = field.required ? "" : " (optionnel)";
  const help = field.help ? `<p class="field-help">${escapeHtml(field.help)}</p>` : "";
  const label = `<label class="field-label" for="${id}">${escapeHtml(field.label)}${requiredLabel}</label>`;

  if (field.type === "textarea") {
    return `<div class="field">${label}${help}<textarea class="textarea" id="${id}" name="${field.name}" placeholder="${escapeHtml(field.placeholder || "")}" ${required}></textarea></div>`;
  }

  if (field.type === "select") {
    return `<div class="field">${label}${help}<select class="select" id="${id}" name="${field.name}" ${required}><option value="">Choisir...</option>${field.options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}</select></div>`;
  }

  if (field.type === "coach") {
    return `<div class="field">${label}${help}<select class="select" id="${id}" name="${field.name}" ${required}><option value="">Choisir...</option>${coachOptions.map((coach) => `<option value="${escapeHtml(coach.name)}" data-coach-id="${escapeHtml(coach.id)}">${escapeHtml(coach.name)}</option>`).join("")}<option value="Je ne suis pas certain">Je ne suis pas certain</option></select></div>`;
  }

  if (field.type === "choice" || field.type === "scale") {
    return `<fieldset class="field"><legend class="question-label">${escapeHtml(field.label)}</legend>${help}<div class="choice-grid">${field.options.map((option) => `<label class="choice"><input type="radio" name="${field.name}" value="${escapeHtml(option)}" ${required}><span>${escapeHtml(option)}</span></label>`).join("")}</div></fieldset>`;
  }

  return `<div class="field">${label}${help}<input class="input" id="${id}" name="${field.name}" type="${escapeHtml(field.type || "text")}" autocomplete="${escapeHtml(field.autocomplete || "off")}" ${required}></div>`;
}

function renderSteps() {
  const questionnaireSteps = [...config.steps, { title: "Vérification", intro: "Relis tes réponses avant de les envoyer.", review: true }];
  stepsRoot.innerHTML = questionnaireSteps.map((step, index) => `
    <section class="form-step" data-step="${index}" aria-labelledby="step-title-${index}">
      <div class="step-heading">
        <h2 id="step-title-${index}">${escapeHtml(step.title)}</h2>
        <p>${escapeHtml(step.intro || "")}</p>
      </div>
      ${step.review ? '<div id="statusPreview" class="status-preview"></div><div id="reviewList" class="review-list"></div>' : `<div class="fields ${step.identity ? "identity-grid" : ""}">${step.fields.map(fieldMarkup).join("")}</div>`}
    </section>
  `).join("");
}

async function loadCoaches() {
  try {
    const response = await fetch("/questionnaire/coaches.json", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    const merged = new Map(coachOptions.map((coach) => [coach.name, coach]));
    (payload.coaches || []).forEach((coach) => {
      const name = coach.coach_name || coach.name || "";
      const id = coach.coach_rx_id || coach.coach_id || "";
      if (name) merged.set(name, { name, id });
    });
    coachOptions = [...merged.values()];
  } catch (error) {
    console.warn("La liste des coachs n'a pas pu être actualisée.", error);
  }
}

function normalizedPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function currentValues() {
  const values = {};
  for (const step of config.steps) {
    for (const field of step.fields) {
      const item = form.elements.namedItem(field.name);
      if (!item) continue;
      if (typeof RadioNodeList !== "undefined" && item instanceof RadioNodeList) values[field.name] = item.value;
      else values[field.name] = String(item.value || "").trim();
    }
  }
  return values;
}

function scoreChoice(value, scores) {
  return scores[value] || 0;
}

function triageFor(values) {
  if (config.type === "habitudes_quotidiennes") {
    if (values.habits_support === "Une discussion rapidement") {
      return { status: "rouge", action: "contact_prioritaire", label: "Contact rapide suggéré" };
    }
    let score = 0;
    score += scoreChoice(values.habits_priorities, { "En partie": 1, "Non": 2 });
    score += scoreChoice(values.habits_rhythm, { "Variable": 1, "Difficile en ce moment": 2 });
    score += scoreChoice(values.habits_water, { "1 à 1,5 L": 1, "Moins de 1 L": 2 });
    ["habits_movement30", "habits_outdoor15", "habits_sleep7"].forEach((key) => {
      score += scoreChoice(values[key], { "Parfois": 1, "Rarement": 2 });
    });
    score += scoreChoice(values.habits_bowel_daily, { "Variable": 1, "Non": 2 });
    if (score >= 7) return { status: "orange", action: "discussion_structuree", label: "Discussion structurée suggérée" };
    if (score >= 3) return { status: "jaune", action: "ajustement_leger", label: "Un ajustement pourrait aider" };
    return { status: "vert", action: "lire_archiver", label: "Aucun signal urgent" };
  }

  if (values.eval_contact === "Dès que possible" || values.eval_pain === "Oui, elle affecte mon quotidien") {
    return { status: "rouge", action: "contact_prioritaire", label: "Contact rapide suggéré" };
  }
  let score = 0;
  const reverseScale = (value) => Math.max(0, 3 - Number(value || 3));
  score += reverseScale(values.eval_readiness);
  score += reverseScale(values.eval_sleep_quality);
  score += Math.max(0, Number(values.eval_stress || 3) - 3);
  score += reverseScale(values.eval_energy);
  [values.eval_meals, values.eval_protein].forEach((value) => {
    score += scoreChoice(value, { "Parfois": 1, "Rarement": 2 });
  });
  score += scoreChoice(values.eval_fruits_vegetables, { "Une fois par jour": 1, "Rarement": 2 });
  score += scoreChoice(values.eval_hydration, { "Variable": 1, "Insuffisante": 2 });
  score += scoreChoice(values.eval_sleep, { "6 à 7 h": 1, "Moins de 6 h": 2 });
  score += scoreChoice(values.eval_movement_outside_training, { "Une fois par semaine": 1, "Rarement": 2 });
  score += scoreChoice(values.eval_pain, { "Oui, légère": 1, "Oui, elle limite certaines activités": 2 });
  if (values.eval_contact === "Cette semaine") score += 2;
  if (score >= 8) return { status: "orange", action: "discussion_structuree", label: "Discussion structurée suggérée" };
  if (score >= 3) return { status: "jaune", action: "ajustement_leger", label: "Un ajustement pourrait aider" };
  return { status: "vert", action: "lire_archiver", label: "Aucun signal urgent" };
}

function fieldLabel(name) {
  for (const step of config.steps) {
    const field = step.fields.find((candidate) => candidate.name === name);
    if (field) return field.label;
  }
  return name;
}

function renderReview() {
  const values = currentValues();
  const triage = triageFor(values);
  const statusPreview = document.getElementById("statusPreview");
  const reviewList = document.getElementById("reviewList");
  statusPreview.innerHTML = `<strong>${escapeHtml(triage.label)}</strong><span>Ton coach recevra les réponses complètes et pourra préparer la prochaine action.</span>`;
  reviewList.innerHTML = config.steps.map((step) => {
    const rows = step.fields
      .map((field) => [field.label, values[field.name]])
      .filter(([, value]) => value)
      .map(([label, value]) => `<div class="review-row"><span class="review-key">${escapeHtml(label)}</span><span class="review-value">${escapeHtml(value)}</span></div>`)
      .join("");
    return `<section class="review-section"><h3>${escapeHtml(step.title)}</h3>${rows || "Aucune réponse."}</section>`;
  }).join("");
}

function visibleSteps() {
  return Array.from(form.querySelectorAll(".form-step"));
}

function updateStep() {
  const steps = visibleSteps();
  steps.forEach((step, index) => step.classList.toggle("is-active", index === currentStep));
  const isReview = currentStep === steps.length - 1;
  if (isReview) renderReview();
  progressText.textContent = `Étape ${currentStep + 1} sur ${steps.length}`;
  stepName.textContent = steps[currentStep]?.querySelector("h2")?.textContent || "";
  progressBar.style.width = `${((currentStep + 1) / steps.length) * 100}%`;
  previousButton.hidden = currentStep === 0;
  nextButton.hidden = isReview;
  submitButton.hidden = !isReview;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function validateCurrentStep() {
  const step = visibleSteps()[currentStep];
  const fields = Array.from(step.querySelectorAll("input, select, textarea"));
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      field.focus();
      return false;
    }
  }
  if (currentStep === 0) {
    const phone = form.elements.namedItem("client_phone")?.value || "";
    if (normalizedPhone(phone).length < 10) {
      showError("Entre un numéro de téléphone valide pour relier la réponse au bon dossier.");
      form.elements.namedItem("client_phone")?.focus();
      return false;
    }
  }
  hideMessages();
  return true;
}

function selectedCoachId() {
  const field = form.elements.namedItem("coach_name");
  return field?.selectedOptions?.[0]?.dataset?.coachId || "";
}

function contactRequest(values) {
  if (config.type === "habitudes_quotidiennes") return values.habits_support || "";
  return values.eval_contact || "";
}

function sourceUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function buildPayload() {
  const values = currentValues();
  const triage = triageFor(values);
  const phoneNormalized = normalizedPhone(values.client_phone);
  const answers = {
    questionnaire_type: config.type,
    questionnaire_label: config.label,
    client_name_entered: values.client_name,
    client_email_entered: values.client_email,
    client_phone_entered: values.client_phone,
    client_phone_normalized: phoneNormalized,
    coach_name_entered: values.coach_name,
    coach_id_entered: selectedCoachId(),
    followup_type: config.followupType
  };
  config.steps.slice(1).forEach((step) => {
    step.fields.forEach((field) => {
      answers[field.name] = values[field.name] || "";
    });
  });

  return {
    source: SOURCE,
    schema_version: SCHEMA_VERSION,
    response_id: RESPONSE_ID,
    submitted_at: new Date().toISOString(),
    questionnaire_type: config.type,
    questionnaire_label: config.label,
    client_name: values.client_name,
    client_email: values.client_email,
    client_phone: values.client_phone,
    client_phone_normalized: phoneNormalized,
    coach_name: values.coach_name,
    coach_id: selectedCoachId(),
    followup_type: config.followupType,
    triage_status: triage.status,
    coach_action_type: triage.action,
    contact_request: contactRequest(values),
    answers,
    triage: {
      status: triage.status,
      coach_action_type: triage.action,
      coach_action_done: false,
      dashboard_sync_status: "pending",
      chat_notification_status: "pending"
    },
    meta: {
      source_app: "cfsb-firebase-questionnaire",
      source_version: APP_VERSION,
      source_url: sourceUrl(),
      questionnaire_type: config.type,
      client_phone_normalized: phoneNormalized,
      coach_name: values.coach_name,
      coach_id: selectedCoachId(),
      user_agent: window.navigator.userAgent
    }
  };
}

function showError(message) {
  successBox.classList.remove("is-visible");
  errorBox.textContent = message;
  errorBox.classList.add("is-visible");
}

function hideMessages() {
  errorBox.classList.remove("is-visible");
  successBox.classList.remove("is-visible");
}

async function submitQuestionnaire() {
  if (isSubmitting) return;
  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "Envoi...";
  hideMessages();

  try {
    const payload = buildPayload();
    const acknowledgement = await submitQuestionnaireWithAcknowledgement({
      endpoint: ENDPOINT_URL,
      accessToken: readQuestionnaireAccessToken(params),
      payload
    });
    successBox.textContent = acknowledgement.message || "Merci. Le serveur a confirmé l'enregistrement de ta réponse.";
    successBox.classList.add("is-visible");
    submitButton.textContent = "Réponse envoyée";
    submitButton.disabled = true;
    previousButton.hidden = true;
  } catch (error) {
    console.error(error);
    showError(error?.message || "L'envoi n'a pas fonctionné. Vérifie ta connexion et réessaie.");
    submitButton.disabled = false;
    submitButton.textContent = "Envoyer mes réponses";
    isSubmitting = false;
  }
}

nextButton.addEventListener("click", () => {
  if (!validateCurrentStep()) return;
  currentStep = Math.min(currentStep + 1, visibleSteps().length - 1);
  updateStep();
});

previousButton.addEventListener("click", () => {
  currentStep = Math.max(0, currentStep - 1);
  updateStep();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuestionnaire();
});

loadCoaches().finally(() => {
  renderSteps();
  updateStep();
});
