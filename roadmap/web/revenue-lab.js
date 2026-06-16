const LEVELS = [
  {
    id: "formation_interne",
    label: "Formation interne / shadowing",
    description: "Phase d'apprentissage avec taux plus conservateurs et plus de temps invisible.",
    adminModifier: 1.25,
    rates: {
      group: 24,
      pv60: 24,
      pv45: 18,
      pv30: 15,
      intro: 24,
      semi: 18,
      specialty: 30,
      csm: 18,
      other: 15.75
    }
  },
  {
    id: "cfl1",
    label: "CrossFit Level 1",
    description: "Coach autonome sur les bases, encore en construction de vitesse administrative.",
    adminModifier: 1.1,
    rates: {
      group: 27,
      pv60: 30,
      pv45: 22.5,
      pv30: 18,
      intro: 27,
      semi: 18,
      specialty: 40,
      csm: 18,
      other: 15.75
    }
  },
  {
    id: "cfl2",
    label: "CrossFit Level 2",
    description: "Profil standard coach professionnel actuel, base proche du tableau de rendement.",
    adminModifier: 1,
    rates: {
      group: 30,
      pv60: 34.2,
      pv45: 25.65,
      pv30: 20.9,
      intro: 30,
      semi: 20.9,
      specialty: 50,
      csm: 20,
      other: 15.75
    }
  },
  {
    id: "cfl3",
    label: "CrossFit Level 3",
    description: "Coach avance avec plus de valeur par heure et meilleure autonomie de suivi.",
    adminModifier: 0.9,
    rates: {
      group: 34,
      pv60: 40,
      pv45: 30,
      pv30: 24,
      intro: 34,
      semi: 24,
      specialty: 60,
      csm: 22,
      other: 18
    }
  },
  {
    id: "senior_specialiste",
    label: "Senior / specialiste",
    description: "Coach reference ou specialiste avec offre plus forte et meilleure densite economique.",
    adminModifier: 0.8,
    rates: {
      group: 38,
      pv60: 48,
      pv45: 36,
      pv30: 28,
      intro: 38,
      semi: 28,
      specialty: 75,
      csm: 25,
      other: 20
    }
  }
];

const EFFICIENCY = {
  1: {
    label: "1/5 - Admin envahissante",
    ratio: 1,
    text: "Environ 1 h admin par 1 h de service. Le taux reel chute rapidement."
  },
  2: {
    label: "2/5 - Encore lourd",
    ratio: 0.65,
    text: "Environ 1 h admin par 1.5 h de service. Plusieurs suivis prennent trop de place."
  },
  3: {
    label: "3/5 - Fonctionnel",
    ratio: 0.35,
    text: "Environ 1 h admin par 3 h de service. Les systemes existent, mais demandent encore de l'attention."
  },
  4: {
    label: "4/5 - Efficace",
    ratio: 0.22,
    text: "Environ 1 h admin par 4.5 h de service. Les routines protegent le taux horaire reel."
  },
  5: {
    label: "5/5 - Tres efficace",
    ratio: 0.17,
    text: "Environ 1 h admin par 5 a 6 h de service. Les suivis sont propres, rapides et repetables."
  }
};

const SERVICES = [
  {
    id: "group",
    label: "Cours de groupe",
    type: "Classe",
    defaultHours: 8,
    adminWeight: 0.1
  },
  {
    id: "pv60",
    label: "Prive 60 min",
    type: "Service client",
    defaultHours: 2,
    adminWeight: 1
  },
  {
    id: "pv45",
    label: "Prive 45 min",
    type: "Service client",
    defaultHours: 0,
    adminWeight: 0.9
  },
  {
    id: "pv30",
    label: "Prive 30 min",
    type: "Service client",
    defaultHours: 0,
    adminWeight: 0.8
  },
  {
    id: "intro",
    label: "Intro / fondations",
    type: "Integration",
    defaultHours: 2,
    adminWeight: 0.55
  },
  {
    id: "semi",
    label: "Semi-prive",
    type: "Service client",
    defaultHours: 30,
    adminWeight: 0.25
  },
  {
    id: "specialty",
    label: "Specialite / clinique",
    type: "Expertise",
    defaultHours: 4,
    adminWeight: 0.5
  },
  {
    id: "csm",
    label: "CSM / suivi client",
    type: "Admin payee",
    defaultHours: 4,
    adminWeight: 0
  },
  {
    id: "other",
    label: "Meetings / formation / org",
    type: "Admin payee",
    defaultHours: 2,
    adminWeight: 0
  }
];

const state = {
  levelId: "cfl2",
  targetAnnual: 70000,
  weeks: 51.6,
  adminEfficiency: 3,
  fixedAdminHours: 2,
  services: {}
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function formatCurrency(value) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0
  }).format(Number.isFinite(value) ? value : 0);
}

function formatMoneyPrecise(value) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat("fr-CA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number.isFinite(value) ? value : 0);
}

function levelById(levelId) {
  return LEVELS.find((level) => level.id === levelId) || LEVELS[2];
}

function initializeServices(level = levelById(state.levelId)) {
  SERVICES.forEach((service) => {
    if (!state.services[service.id]) {
      state.services[service.id] = {
        hours: service.defaultHours,
        rate: level.rates[service.id] || 0
      };
    }
  });
}

function applyLevelRates() {
  const level = levelById(state.levelId);
  SERVICES.forEach((service) => {
    state.services[service.id].rate = level.rates[service.id] || 0;
  });
}

function renderLevels() {
  $("#levelSelect").innerHTML = LEVELS.map((level) => `
    <option value="${level.id}" ${level.id === state.levelId ? "selected" : ""}>${level.label}</option>
  `).join("");
}

function serviceAdminHours(service, level, efficiency) {
  const values = state.services[service.id];
  const hours = Number(values.hours) || 0;
  return hours * efficiency.ratio * service.adminWeight * level.adminModifier;
}

function calculateScenario() {
  const level = levelById(state.levelId);
  const efficiency = EFFICIENCY[state.adminEfficiency];
  const rows = SERVICES.map((service) => {
    const values = state.services[service.id];
    const hours = Number(values.hours) || 0;
    const rate = Number(values.rate) || 0;
    const revenue = hours * rate;
    const adminHours = serviceAdminHours(service, level, efficiency);
    return {
      ...service,
      hours,
      rate,
      revenue,
      adminHours
    };
  });

  const serviceHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const invisibleAdminHours = rows.reduce((sum, row) => sum + row.adminHours, 0);
  const fixedAdminHours = Number(state.fixedAdminHours) || 0;
  const totalRealHours = serviceHours + invisibleAdminHours + fixedAdminHours;
  const weeklyRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const monthlyRevenue = weeklyRevenue * 4.3;
  const annualRevenue = weeklyRevenue * state.weeks;
  const realHourlyRate = totalRealHours ? weeklyRevenue / totalRealHours : 0;
  const visibleHourlyRate = serviceHours ? weeklyRevenue / serviceHours : 0;
  const targetWeekly = state.weeks ? state.targetAnnual / state.weeks : 0;
  const weeklyGap = weeklyRevenue - targetWeekly;
  const annualGap = annualRevenue - state.targetAnnual;
  const requiredRealHoursAtCurrentRate = realHourlyRate ? targetWeekly / realHourlyRate : 0;

  return {
    rows,
    serviceHours,
    invisibleAdminHours,
    fixedAdminHours,
    totalRealHours,
    weeklyRevenue,
    monthlyRevenue,
    annualRevenue,
    realHourlyRate,
    visibleHourlyRate,
    targetWeekly,
    weeklyGap,
    annualGap,
    requiredRealHoursAtCurrentRate,
    level,
    efficiency
  };
}

function renderServices() {
  const scenario = calculateScenario();
  $("#serviceRows").innerHTML = scenario.rows.map((row) => `
    <tr data-service-id="${row.id}">
      <td>
        <strong>${row.label}</strong>
        <span>${adminExplanation(row)}</span>
      </td>
      <td>${row.type}</td>
      <td>
        <input class="table-input" type="number" min="0" step="0.05" value="${row.rate}" data-service-rate="${row.id}">
      </td>
      <td>
        <input class="table-input" type="number" min="0" step="0.25" value="${row.hours}" data-service-hours="${row.id}">
      </td>
      <td>${formatNumber(row.adminHours)} h</td>
      <td>${formatMoneyPrecise(row.revenue)}</td>
    </tr>
  `).join("");

  $$("[data-service-rate]").forEach((input) => {
    input.addEventListener("input", () => {
      state.services[input.dataset.serviceRate].rate = Number(input.value) || 0;
      renderResults();
    });
  });

  $$("[data-service-hours]").forEach((input) => {
    input.addEventListener("input", () => {
      state.services[input.dataset.serviceHours].hours = Number(input.value) || 0;
      renderResults();
      renderServices();
    });
  });
}

function adminExplanation(row) {
  if (!row.adminWeight) return "Temps deja considere comme admin payee ou non dilue.";
  if (row.adminWeight >= 0.9) return "Admin forte: programmation, notes, messages, ajustements.";
  if (row.adminWeight >= 0.5) return "Admin moderee: preparation, coordination et notes.";
  return "Admin faible: preparation standard et rangement mental.";
}

function metric(label, value, tone = "") {
  return `
    <div class="revenue-metric ${tone}">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `;
}

function renderResults() {
  const scenario = calculateScenario();
  $("#statusAnnual").textContent = formatCurrency(scenario.annualRevenue);
  $("#efficiencyCard").innerHTML = `
    <strong>${scenario.efficiency.label}</strong>
    <span>${scenario.efficiency.text}</span>
  `;
  $("#resultMetrics").innerHTML = [
    metric("Revenu hebdomadaire", formatCurrency(scenario.weeklyRevenue)),
    metric("Revenu mensuel", formatCurrency(scenario.monthlyRevenue)),
    metric("Revenu annuel", formatCurrency(scenario.annualRevenue), scenario.annualGap >= 0 ? "good" : "warn"),
    metric("Heures service visibles", `${formatNumber(scenario.serviceHours)} h`),
    metric("Admin invisible estimee", `${formatNumber(scenario.invisibleAdminHours)} h`),
    metric("Heures reelles totales", `${formatNumber(scenario.totalRealHours)} h`),
    metric("Taux moyen visible", formatMoneyPrecise(scenario.visibleHourlyRate)),
    metric("Taux horaire reel", formatMoneyPrecise(scenario.realHourlyRate), scenario.realHourlyRate >= 30 ? "good" : "warn")
  ].join("");

  const gapText = scenario.annualGap >= 0
    ? `${formatCurrency(scenario.annualGap)} au-dessus de l'objectif annuel.`
    : `${formatCurrency(Math.abs(scenario.annualGap))} sous l'objectif annuel.`;
  const pressure = scenario.requiredRealHoursAtCurrentRate > scenario.totalRealHours
    ? `A ton taux reel actuel, l'objectif demande environ ${formatNumber(scenario.requiredRealHoursAtCurrentRate)} h reelles par semaine.`
    : "Le mix actuel atteint l'objectif avec une charge reelle compatible.";

  $("#realityPanel").innerHTML = `
    <article>
      <strong>Constat financier</strong>
      <p>${gapText} Objectif hebdomadaire: ${formatCurrency(scenario.targetWeekly)}.</p>
    </article>
    <article>
      <strong>Constat temps reel</strong>
      <p>${pressure}</p>
    </article>
    <article>
      <strong>Point de discussion roadmap</strong>
      <p>${roadmapPrompt(scenario)}</p>
    </article>
  `;
}

function roadmapPrompt(scenario) {
  if (scenario.invisibleAdminHours > scenario.serviceHours * 0.5) {
    return "Le levier principal semble etre l'efficacite administrative avant d'ajouter plus de services.";
  }
  if (scenario.annualGap < 0) {
    return "Le coach doit choisir entre augmenter le volume, modifier le mix de services ou developper une offre a plus haute valeur.";
  }
  if (scenario.totalRealHours > 40) {
    return "Le revenu est interessant, mais la charge reelle doit etre surveillee pour rester durable.";
  }
  return "Le scenario semble viable; la discussion peut porter sur les routines qui gardent ce taux reel stable.";
}

function collectInputs() {
  state.levelId = $("#levelSelect").value;
  state.targetAnnual = Number($("#targetAnnualInput").value) || 0;
  state.weeks = Number($("#weeksInput").value) || 51.6;
  state.adminEfficiency = Number($("#adminEfficiencyInput").value) || 3;
  state.fixedAdminHours = Number($("#fixedAdminInput").value) || 0;
}

function bindControls() {
  $("#levelSelect").addEventListener("change", () => {
    collectInputs();
    applyLevelRates();
    renderServices();
    renderResults();
  });
  ["targetAnnualInput", "weeksInput", "adminEfficiencyInput", "fixedAdminInput"].forEach((id) => {
    $(`#${id}`).addEventListener("input", () => {
      collectInputs();
      renderServices();
      renderResults();
    });
  });
  $("#resetLabButton").addEventListener("click", resetLab);
  $("#copyRevenueSummaryButton").addEventListener("click", copySummary);
}

function resetLab() {
  state.levelId = "cfl2";
  state.targetAnnual = 70000;
  state.weeks = 51.6;
  state.adminEfficiency = 3;
  state.fixedAdminHours = 2;
  state.services = {};
  initializeServices();
  $("#targetAnnualInput").value = state.targetAnnual;
  $("#weeksInput").value = state.weeks;
  $("#adminEfficiencyInput").value = state.adminEfficiency;
  $("#fixedAdminInput").value = state.fixedAdminHours;
  renderLevels();
  renderServices();
  renderResults();
}

function summaryText() {
  const scenario = calculateScenario();
  const activeRows = scenario.rows
    .filter((row) => row.hours > 0)
    .map((row) => `- ${row.label}: ${formatNumber(row.hours)} h x ${formatMoneyPrecise(row.rate)} = ${formatMoneyPrecise(row.revenue)}`)
    .join("\n");
  return [
    "Projection revenus coach - CFSB",
    `Niveau: ${scenario.level.label}`,
    `Efficacite administrative: ${scenario.efficiency.label}`,
    `Objectif annuel: ${formatCurrency(state.targetAnnual)}`,
    "",
    activeRows || "- Aucun service entre.",
    "",
    `Revenu hebdo: ${formatCurrency(scenario.weeklyRevenue)}`,
    `Revenu annuel: ${formatCurrency(scenario.annualRevenue)}`,
    `Heures service visibles: ${formatNumber(scenario.serviceHours)} h`,
    `Admin invisible estimee: ${formatNumber(scenario.invisibleAdminHours)} h`,
    `Heures reelles totales: ${formatNumber(scenario.totalRealHours)} h`,
    `Taux horaire reel: ${formatMoneyPrecise(scenario.realHourlyRate)}`,
    `Ecart annuel: ${scenario.annualGap >= 0 ? "+" : "-"}${formatCurrency(Math.abs(scenario.annualGap))}`,
    "",
    `Constat: ${roadmapPrompt(scenario)}`
  ].join("\n");
}

async function copySummary() {
  const text = summaryText();
  try {
    await navigator.clipboard.writeText(text);
    $("#copyRevenueSummaryButton").textContent = "Resume copie";
    window.setTimeout(() => {
      $("#copyRevenueSummaryButton").textContent = "Copier resume";
    }, 1600);
  } catch (error) {
    window.prompt("Copie le resume:", text);
  }
}

function init() {
  initializeServices();
  renderLevels();
  bindControls();
  renderServices();
  renderResults();
}

init();
