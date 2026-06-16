const LEVELS = [
  {
    id: "formation_interne",
    label: "Palier 0 - formation interne / shadowing",
    description: "Stagiaire ou coach en formation. Beaucoup d'accompagnement et de temps invisible.",
    adminModifier: 1.25,
    semiClientsPerHour: 2,
    rates: {
      group: 22,
      intro: 22,
      pv60: 30.6,
      pv45: 22.95,
      pv30: 20.9,
      semi: 20.9,
      specialtyClient: 20.9,
      legends: 50,
      fitTeen: 6.8,
      headCoach: 0,
      csm: 16.1,
      admin: 16.1
    }
  },
  {
    id: "cfl1",
    label: "Palier 1 - CF-L1",
    description: "Coach certifie CF-L1. Base cours de groupe et introductions a 25 $/h.",
    adminModifier: 1.1,
    semiClientsPerHour: 2,
    rates: {
      group: 25,
      intro: 25,
      pv60: 30.6,
      pv45: 22.95,
      pv30: 20.9,
      semi: 20.9,
      specialtyClient: 20.9,
      legends: 50,
      fitTeen: 6.8,
      headCoach: 0,
      csm: 20,
      admin: 20
    }
  },
  {
    id: "cfl2",
    label: "Palier 2 - CF-L2 / professionnel reconnu",
    description: "Base coach professionnel actuel: cours a 30 $/h et prive 60 min a 34,20 $/h.",
    adminModifier: 1,
    semiClientsPerHour: 3,
    rates: {
      group: 30,
      intro: 30,
      pv60: 34.2,
      pv45: 25.65,
      pv30: 20.9,
      semi: 20.9,
      specialtyClient: 20.9,
      legends: 50,
      fitTeen: 6.8,
      headCoach: 30,
      csm: 20,
      admin: 21.5
    }
  },
  {
    id: "cfl3",
    label: "Palier 3 - CF-L3 / autonomie avancee",
    description: "Coach avance avec autonomie, programmation et capacite de densifier le semi-prive.",
    adminModifier: 0.9,
    semiClientsPerHour: 4,
    rates: {
      group: 35,
      intro: 35,
      pv60: 34.2,
      pv45: 25.65,
      pv30: 20.9,
      semi: 20.9,
      specialtyClient: 20.9,
      legends: 50,
      fitTeen: 6.8,
      headCoach: 35,
      csm: 20,
      admin: 23
    }
  },
  {
    id: "direction",
    label: "Palier 4 - direction / lead",
    description: "Role de direction ou leadership avec taches administratives plus avancees.",
    adminModifier: 0.8,
    semiClientsPerHour: 4,
    rates: {
      group: 35,
      intro: 35,
      pv60: 34.2,
      pv45: 25.65,
      pv30: 20.9,
      semi: 20.9,
      specialtyClient: 20.9,
      legends: 50,
      fitTeen: 6.8,
      headCoach: 35,
      csm: 20,
      admin: 27.5
    }
  }
];

const EFFICIENCY = {
  1: {
    label: "1/5 - Admin envahissante",
    ratio: 1,
    text: "Environ 1 h admin par 1 h terrain. Le taux reel chute rapidement."
  },
  2: {
    label: "2/5 - Encore lourd",
    ratio: 0.65,
    text: "Environ 1 h admin par 1.5 h terrain. Plusieurs suivis prennent trop de place."
  },
  3: {
    label: "3/5 - Fonctionnel",
    ratio: 0.35,
    text: "Environ 1 h admin par 3 h terrain. Les systemes existent, mais demandent encore de l'attention."
  },
  4: {
    label: "4/5 - Efficace",
    ratio: 0.22,
    text: "Environ 1 h admin par 4.5 h terrain. Les routines protegent le taux horaire reel."
  },
  5: {
    label: "5/5 - Tres efficace",
    ratio: 0.17,
    text: "Environ 1 h admin par 5 a 6 h terrain. Les suivis sont propres, rapides et repetables."
  }
};

const SERVICES = [
  {
    id: "group",
    label: "Cours de groupe",
    type: "Cours",
    rateKey: "group",
    defaultVolume: 8,
    unit: "cours / h",
    timeMode: "same",
    adminWeight: 0.1,
    note: "Grille: cours de groupe selon palier de certification."
  },
  {
    id: "intro",
    label: "Introductions / fondations",
    type: "Integration",
    rateKey: "intro",
    defaultVolume: 2,
    unit: "seances / h",
    timeMode: "same",
    adminWeight: 0.55,
    note: "Meme palier que les cours de groupe dans la grille."
  },
  {
    id: "pv60",
    label: "Prive 60 min",
    type: "Prive",
    rateKey: "pv60",
    defaultVolume: 2,
    unit: "seances",
    timeMode: "same",
    adminWeight: 1,
    note: "30,60 $/h au palier 1; 34,20 $/h avec certification professionnelle reconnue."
  },
  {
    id: "pv45",
    label: "Prive 45 min",
    type: "Prive",
    rateKey: "pv45",
    defaultVolume: 0,
    unit: "seances",
    timeMode: "fixedMinutes",
    minutes: 45,
    adminWeight: 0.9,
    note: "Taux prorate a partir du prive 60 min."
  },
  {
    id: "pv30",
    label: "Prive 30 min",
    type: "Prive",
    rateKey: "pv30",
    defaultVolume: 0,
    unit: "seances",
    timeMode: "fixedMinutes",
    minutes: 30,
    adminWeight: 0.8,
    note: "Minimum conserve selon le tableau de rendement existant."
  },
  {
    id: "semi",
    label: "Semi-prive",
    type: "Client-present",
    rateKey: "semi",
    defaultVolume: 30,
    unit: "clients-seances",
    timeMode: "levelCapacity",
    adminWeight: 0.25,
    note: "20,90 $ par client; capacite: 2, 3 ou 4 clients/h selon palier."
  },
  {
    id: "specialtyClient",
    label: "Cours de specialite",
    type: "Client-present",
    rateKey: "specialtyClient",
    defaultVolume: 0,
    unit: "clients-seances",
    timeMode: "fixedCapacity",
    capacity: 6,
    adminWeight: 0.35,
    note: "20,90 $ par client present, maximum 6 clients par heure."
  },
  {
    id: "legends",
    label: "Programme Legendes",
    type: "Programme CFSB",
    rateKey: "legends",
    defaultVolume: 4,
    unit: "seances",
    timeMode: "same",
    adminWeight: 0.35,
    note: "50 $ par seance, petit groupe de maximum 8 personnes."
  },
  {
    id: "fitTeen",
    label: "Programme Fit-Teen",
    type: "Programme CFSB",
    rateKey: "fitTeen",
    defaultVolume: 0,
    unit: "presences",
    timeMode: "fixedCapacity",
    capacity: 12,
    adminWeight: 0.2,
    note: "6,80 $ par client present, maximum 12 enfants."
  },
  {
    id: "headCoach",
    label: "Entraineur-chef",
    type: "Leadership",
    rateKey: "headCoach",
    defaultVolume: 0,
    unit: "heures",
    timeMode: "same",
    adminWeight: 0.2,
    note: "30 $/h CF-L2 250 h; 35 $/h CF-L3 375 h."
  },
  {
    id: "csm",
    label: "CSM / suivi client",
    type: "Admin payee",
    rateKey: "csm",
    defaultVolume: 4,
    unit: "heures",
    timeMode: "same",
    adminWeight: 0,
    note: "Tache administrative payee, palier 1 dans la grille."
  },
  {
    id: "admin",
    label: "Administration / meetings / formation",
    type: "Admin payee",
    rateKey: "admin",
    defaultVolume: 2,
    unit: "heures",
    timeMode: "same",
    adminWeight: 0,
    note: "Paliers administratifs: 16,10 $ a 30 $/h selon role et niveau."
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
        volume: service.defaultVolume,
        rate: level.rates[service.rateKey] || 0
      };
    }
  });
}

function applyLevelRates() {
  const level = levelById(state.levelId);
  SERVICES.forEach((service) => {
    state.services[service.id].rate = level.rates[service.rateKey] || 0;
  });
}

function renderLevels() {
  $("#levelSelect").innerHTML = LEVELS.map((level) => `
    <option value="${level.id}" ${level.id === state.levelId ? "selected" : ""}>${level.label}</option>
  `).join("");
}

function estimateFloorHours(service, volume, level) {
  if (service.timeMode === "fixedMinutes") return volume * service.minutes / 60;
  if (service.timeMode === "levelCapacity") return volume / Math.max(level.semiClientsPerHour || 1, 1);
  if (service.timeMode === "fixedCapacity") return volume / Math.max(service.capacity || 1, 1);
  return volume;
}

function serviceAdminHours(service, floorHours, level, efficiency) {
  return floorHours * efficiency.ratio * service.adminWeight * level.adminModifier;
}

function calculateScenario() {
  const level = levelById(state.levelId);
  const efficiency = EFFICIENCY[state.adminEfficiency];
  const rows = SERVICES.map((service) => {
    const values = state.services[service.id];
    const volume = Number(values.volume) || 0;
    const rate = Number(values.rate) || 0;
    const revenue = volume * rate;
    const floorHours = estimateFloorHours(service, volume, level);
    const adminHours = serviceAdminHours(service, floorHours, level, efficiency);
    return {
      ...service,
      volume,
      rate,
      revenue,
      floorHours,
      adminHours
    };
  });

  const paidVolume = rows.reduce((sum, row) => sum + row.volume, 0);
  const floorHours = rows.reduce((sum, row) => sum + row.floorHours, 0);
  const invisibleAdminHours = rows.reduce((sum, row) => sum + row.adminHours, 0);
  const fixedAdminHours = Number(state.fixedAdminHours) || 0;
  const totalRealHours = floorHours + invisibleAdminHours + fixedAdminHours;
  const weeklyRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const monthlyRevenue = weeklyRevenue * 4.3;
  const annualRevenue = weeklyRevenue * state.weeks;
  const realHourlyRate = totalRealHours ? weeklyRevenue / totalRealHours : 0;
  const floorHourlyRate = floorHours ? weeklyRevenue / floorHours : 0;
  const targetWeekly = state.weeks ? state.targetAnnual / state.weeks : 0;
  const weeklyGap = weeklyRevenue - targetWeekly;
  const annualGap = annualRevenue - state.targetAnnual;
  const requiredRealHoursAtCurrentRate = realHourlyRate ? targetWeekly / realHourlyRate : 0;

  return {
    rows,
    paidVolume,
    floorHours,
    invisibleAdminHours,
    fixedAdminHours,
    totalRealHours,
    weeklyRevenue,
    monthlyRevenue,
    annualRevenue,
    realHourlyRate,
    floorHourlyRate,
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
        <span>${row.note}</span>
      </td>
      <td>${row.type}</td>
      <td>
        <input class="table-input" type="number" min="0" step="0.05" value="${row.rate}" data-service-rate="${row.id}">
      </td>
      <td>
        <input class="table-input" type="number" min="0" step="0.25" value="${row.volume}" data-service-volume="${row.id}">
        <span class="unit-note">${row.unit}</span>
      </td>
      <td>${formatNumber(row.floorHours)} h</td>
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

  $$("[data-service-volume]").forEach((input) => {
    input.addEventListener("input", () => {
      state.services[input.dataset.serviceVolume].volume = Number(input.value) || 0;
      renderResults();
      renderServices();
    });
  });
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
    <small>${scenario.level.description} Semi-prive estime a ${scenario.level.semiClientsPerHour} client(s) par heure.</small>
  `;
  $("#resultMetrics").innerHTML = [
    metric("Revenu hebdomadaire", formatCurrency(scenario.weeklyRevenue)),
    metric("Revenu mensuel", formatCurrency(scenario.monthlyRevenue)),
    metric("Revenu annuel", formatCurrency(scenario.annualRevenue), scenario.annualGap >= 0 ? "good" : "warn"),
    metric("Heures terrain estimees", `${formatNumber(scenario.floorHours)} h`),
    metric("Admin invisible estimee", `${formatNumber(scenario.invisibleAdminHours)} h`),
    metric("Heures reelles totales", `${formatNumber(scenario.totalRealHours)} h`),
    metric("Taux terrain moyen", formatMoneyPrecise(scenario.floorHourlyRate)),
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
  if (scenario.invisibleAdminHours > scenario.floorHours * 0.5) {
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
    .filter((row) => row.volume > 0)
    .map((row) => `- ${row.label}: ${formatNumber(row.volume)} ${row.unit} x ${formatMoneyPrecise(row.rate)} = ${formatMoneyPrecise(row.revenue)} (${formatNumber(row.floorHours)} h terrain)`)
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
    `Heures terrain estimees: ${formatNumber(scenario.floorHours)} h`,
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
