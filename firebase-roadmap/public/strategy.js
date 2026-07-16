export const STRATEGY_STATUS_OPTIONS = [
  ["source_review", "Source a revalider"],
  ["draft", "Brouillon owner"],
  ["validated", "Valide par les owners"]
];

export const STRATEGY_DECISION_STATUS_OPTIONS = [
  ["active", "Active"],
  ["superseded", "Remplacee"]
];

export const STRATEGY_SOURCE_BASELINE = {
  id: "current",
  title: "Strategie CFSB",
  status: "source_review",
  sourceRevision: "2026-06-25",
  sourceNotes: "Vision et mission tirees du document officiel 2025-2026. Les autres blocs proviennent du SWOT CFSB 2026 exporte le 6 fevrier 2026 et doivent etre revalides par Michael et Gabriel avant de guider une decision.",
  sourceDocuments: [
    {
      label: "VISION & MISSION 2025-2026 DU CFSB",
      url: "https://docs.google.com/document/d/1P29zUceTU56MESq6g12zHkgmL71zNQoNf3yMcwKQk4U/edit",
      revisionDate: "2026-06-25",
      scope: "Vision et mission"
    },
    {
      label: "SWOT CFSB 2026",
      url: "https://drive.google.com/file/d/1d8SopS0PomxP9CejoENkyLlS7DXKESuh/view",
      revisionDate: "2026-02-06",
      scope: "Valeurs, niche, cibles, strategies et SWOT"
    }
  ],
  vision: "Impacter nos membres afin qu'ils puissent relever des defis et faire face a l'imprevisible.",
  mission: "Coacher nos membres afin qu'ils puissent transformer les 5 piliers de leur vie : manger, dormir, bouger, gerer leur stress et connecter.",
  values: [
    { id: "professionnel", name: "Professionnel", description: "Etre prepare, engage et integre. Offrir un service de qualite, jour apres jour, avec constance et fierte." },
    { id: "bienveillance", name: "Bienveillance", description: "Accueillir chaque personne avec enthousiasme, ecoute et empathie. Offrir un environnement ou chacun se sent soutenu et valorise." },
    { id: "equipe", name: "Equipe", description: "Travailler ensemble, se soutenir mutuellement et celebrer les succes collectifs. Parce qu'on va plus loin ensemble." },
    { id: "courage", name: "Courage", description: "Faire ce qui est juste, meme quand c'est difficile. Sortir de sa zone de confort pour grandir et aider les autres a faire de meme." }
  ],
  niche: "Nous encadrons et eduquons les parents et les professionnels ambitieux.",
  longTermTarget: "500 a 1000 membres ayant accompli un parcours significatif, avec une cible source de 100 personnes par an.",
  strategies: [
    "Encadrer et eduquer les parents et les professionnels ambitieux.",
    "Offrir des services professionnels pour accelerer la progression des clients ambitieux ou debutants.",
    "Creer du contenu educatif axe sur les cinq piliers.",
    "Celebrer les accomplissements et creer des evenements et defis varies lies aux piliers."
  ],
  differentiators: ["Level Method", "Check-up", "Coaching"],
  provenProcess: "NSI -> recommandation -> service -> check-up -> restart",
  guarantee: "Entrainements securitaires, efficaces et progressifs; un membre insatisfait peut mettre fin a son engagement et payer ce qu'il a consomme.",
  swot: {
    strengths: [
      "Recrutement et integration du staff",
      "Service a la clientele",
      "Processus Level Method et check-up",
      "Marche cible large",
      "Formation continue et rythme regulier de rencontres"
    ],
    weaknesses: [
      "Capacite et espace du centre",
      "Chaque personne n'a pas encore un indicateur clair relie aux objectifs",
      "La cible a long terme doit etre clarifiee et communiquee"
    ],
    opportunities: [
      "Promouvoir des services semi-prives avec des modeles de programmation structures"
    ],
    threats: [
      "Retention a long terme du staff si les revenus ne permettent pas une vie professionnelle durable"
    ]
  },
  annualFocus: {
    year: 2026,
    goals: []
  }
};

const STRATEGY_STATUS_IDS = new Set(STRATEGY_STATUS_OPTIONS.map(([id]) => id));
const DECISION_STATUS_IDS = new Set(STRATEGY_DECISION_STATUS_OPTIONS.map(([id]) => id));

export function cloneStrategyBaseline() {
  return JSON.parse(JSON.stringify(STRATEGY_SOURCE_BASELINE));
}

export function normalizeStrategyList(value = []) {
  const items = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  return items.map((item) => String(item || "").trim()).filter(Boolean);
}

export function normalizeStrategyProfile(profile = {}) {
  const baseline = cloneStrategyBaseline();
  return {
    id: String(profile.id || "current"),
    title: String(profile.title || baseline.title).trim(),
    status: STRATEGY_STATUS_IDS.has(profile.status) ? profile.status : "draft",
    sourceRevision: String(profile.sourceRevision || "").trim(),
    sourceNotes: String(profile.sourceNotes || "").trim(),
    sourceDocuments: Array.isArray(profile.sourceDocuments) ? profile.sourceDocuments.map((source) => ({
      label: String(source?.label || "Source Drive").trim(),
      url: String(source?.url || "").trim(),
      revisionDate: String(source?.revisionDate || "").trim(),
      scope: String(source?.scope || "").trim()
    })).filter((source) => source.url) : [],
    vision: String(profile.vision || "").trim(),
    mission: String(profile.mission || "").trim(),
    values: (Array.isArray(profile.values) ? profile.values : []).map((value, index) => ({
      id: String(value?.id || `value-${index + 1}`).trim(),
      name: String(value?.name || "").trim(),
      description: String(value?.description || "").trim()
    })).filter((value) => value.name || value.description),
    niche: String(profile.niche || "").trim(),
    longTermTarget: String(profile.longTermTarget || "").trim(),
    strategies: normalizeStrategyList(profile.strategies),
    differentiators: normalizeStrategyList(profile.differentiators),
    provenProcess: String(profile.provenProcess || "").trim(),
    guarantee: String(profile.guarantee || "").trim(),
    swot: {
      strengths: normalizeStrategyList(profile.swot?.strengths),
      weaknesses: normalizeStrategyList(profile.swot?.weaknesses),
      opportunities: normalizeStrategyList(profile.swot?.opportunities),
      threats: normalizeStrategyList(profile.swot?.threats)
    },
    annualFocus: {
      year: Number(profile.annualFocus?.year || new Date().getFullYear()),
      goals: normalizeStrategyList(profile.annualFocus?.goals)
    }
  };
}

export function strategyCoverage(profile = {}) {
  const value = normalizeStrategyProfile(profile);
  const checks = [
    Boolean(value.vision),
    Boolean(value.mission),
    value.values.length >= 4 && value.values.every((item) => item.name && item.description),
    Boolean(value.niche),
    Boolean(value.longTermTarget),
    value.strategies.length > 0,
    value.differentiators.length > 0,
    Boolean(value.provenProcess),
    Boolean(value.guarantee),
    value.swot.strengths.length > 0,
    value.swot.weaknesses.length > 0,
    value.swot.opportunities.length > 0,
    value.swot.threats.length > 0,
    value.annualFocus.goals.length > 0
  ];
  const documented = checks.filter(Boolean).length;
  return {
    documented,
    total: checks.length,
    missing: checks.length - documented,
    percent: Math.round((documented / checks.length) * 100),
    validated: value.status === "validated"
  };
}

export function validateStrategyProfile(profile = {}) {
  const value = normalizeStrategyProfile(profile);
  const errors = [];
  if (!value.title) errors.push("Le titre est requis.");
  if (!STRATEGY_STATUS_IDS.has(value.status)) errors.push("Le statut est invalide.");
  if (value.status === "validated") {
    if (!value.vision) errors.push("La vision est requise avant validation.");
    if (!value.mission) errors.push("La mission est requise avant validation.");
    if (value.values.length < 4 || value.values.some((item) => !item.name || !item.description)) errors.push("Quatre valeurs completes sont requises avant validation.");
  }
  const badSource = value.sourceDocuments.find((source) => !/^https:\/\//i.test(source.url));
  if (badSource) errors.push("Chaque source doit etre un lien HTTPS.");
  return { valid: errors.length === 0, errors, profile: value, coverage: strategyCoverage(value) };
}

export function normalizeStrategyDecision(decision = {}) {
  return {
    id: String(decision.id || ""),
    decisionDate: String(decision.decisionDate || "").trim(),
    title: String(decision.title || "").trim(),
    decision: String(decision.decision || "").trim(),
    rationale: String(decision.rationale || "").trim(),
    ownerName: String(decision.ownerName || "Michael + Gabriel").trim(),
    impact: String(decision.impact || "").trim(),
    status: DECISION_STATUS_IDS.has(decision.status) ? decision.status : "active",
    sourceUrl: String(decision.sourceUrl || "").trim()
  };
}

export function validateStrategyDecision(decision = {}) {
  const value = normalizeStrategyDecision(decision);
  const errors = [];
  if (!value.decisionDate) errors.push("La date de decision est requise.");
  if (!value.title) errors.push("Le titre est requis.");
  if (!value.decision) errors.push("La decision est requise.");
  if (value.sourceUrl && !/^https:\/\//i.test(value.sourceUrl)) errors.push("Le lien de source doit commencer par https://.");
  return { valid: errors.length === 0, errors, decision: value };
}

export function sortStrategyDecisions(decisions = []) {
  return [...decisions].sort((a, b) => String(b.decisionDate || "").localeCompare(String(a.decisionDate || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}
