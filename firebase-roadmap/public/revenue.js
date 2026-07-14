import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const REVENUE_MODEL_VERSION = "cfsb-compensation-2026-v1";

const LEVELS = [
  {
    id: "formation_interne",
    label: "Palier 0 - formation interne / shadowing",
    description: "Stagiaire ou coach en formation. Beaucoup d'accompagnement et de temps de soutien inclus.",
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
      cifs: 50,
      headCoach: 0,
      csm: 20,
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
      cifs: 50,
      headCoach: 0,
      csm: 20,
      admin: 16.1
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
      cifs: 50,
      headCoach: 30,
      csm: 20,
      admin: 16.1
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
      cifs: 50,
      headCoach: 35,
      csm: 20,
      admin: 16.1
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
      cifs: 50,
      headCoach: 35,
      csm: 20,
      admin: 16.1
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

const SEMI_BUDGET_RATE = 23;
const SEMI_CSM_RATE = 20;

const SEMI_TIERS = [
  {
    id: "part_time",
    label: "Temps partiel",
    rangeLabel: "5-15 SP/sem",
    min: 5,
    max: 15,
    spRate: 21,
    csmHours: 1,
    budgetNote: "= Budget"
  },
  {
    id: "level_1",
    label: "Niveau 1 - Demarrage",
    rangeLabel: "0-24 SP/sem",
    min: 0,
    max: 24,
    spRate: 18,
    csmHours: 7,
    budgetNote: "Investissement"
  },
  {
    id: "level_2",
    label: "Niveau 2 - Croissance",
    rangeLabel: "25-34 SP/sem",
    min: 25,
    max: 34,
    spRate: 20,
    csmHours: 4,
    budgetNote: "<= Budget"
  },
  {
    id: "level_3",
    label: "Niveau 3 - Maturite",
    rangeLabel: "35-44 SP/sem",
    min: 35,
    max: 44,
    spRate: 21.5,
    csmHours: 3,
    budgetNote: "<= Budget"
  },
  {
    id: "level_4",
    label: "Niveau 4 - Senior",
    rangeLabel: "45+ SP/sem",
    min: 45,
    max: Infinity,
    spRate: 22.5,
    csmHours: 1,
    budgetNote: "<= Budget"
  }
];

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
    id: "cifs",
    label: "Programme CIFS",
    type: "Programme CFSB",
    rateKey: "cifs",
    defaultVolume: 4,
    unit: "seances",
    timeMode: "same",
    adminWeight: 0.35,
    note: "Regroupe Legendes, Fit-Teen et FitKid. Meme taux: 50 $ par seance."
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
    defaultVolume: 0,
    unit: "heures",
    timeMode: "same",
    adminWeight: 0,
    note: "Volet CSM paye a 20 $/h selon le modele hybride et les suivis client."
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
    note: "Administration coach payee au taux salle de mouvement: 16,10 $/h."
  }
];

const state = {
  user: null,
  profile: null,
  teamMembers: [],
  scenarios: [],
  selectedMemberId: "",
  currentScenarioId: "",
  scenarioDirty: false,
  levelId: "cfl2",
  targetAnnual: 70000,
  weeks: 51.6,
  adminEfficiency: 3,
  fixedAdminHours: 2,
  semiModel: "hybrid",
  semiTierId: "auto",
  services: {}
};

let calculatorInitialized = false;
let unsubscribeScenarios = null;
let toastTimer = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

onAuthStateChanged(auth, async (user) => {
  if (unsubscribeScenarios) {
    unsubscribeScenarios();
    unsubscribeScenarios = null;
  }
  state.user = user;
  state.profile = null;

  if (!user) {
    showAccessGate("Connecte-toi avec un compte owner pour utiliser les projections.", true);
    return;
  }

  try {
    const profileSnapshot = await getDoc(doc(db, "users", user.uid));
    if (!profileSnapshot.exists()) {
      showAccessGate("Ce compte Google n'a pas d'acces au Dashboard Equipe.", false);
      return;
    }
    state.profile = { id: profileSnapshot.id, ...profileSnapshot.data() };
    if (!state.profile.active || !["owner", "admin"].includes(state.profile.role)) {
      showAccessGate("Ce compte ne possede pas un acces owner actif.", false);
      return;
    }

    await unlockCalculator();
  } catch (error) {
    showAccessGate(`Impossible de verifier l'acces: ${friendlyError(error)}`, false);
  }
});

function showAccessGate(message, canLogin) {
  $("#calculatorShell").hidden = true;
  $("#accessGate").hidden = false;
  $("#accessMessage").textContent = message;
  $("#loginButton").hidden = false;
  $("#loginButton").innerHTML = canLogin
    ? '<i data-lucide="log-in"></i> Connexion Google'
    : '<i data-lucide="log-out"></i> Changer de compte';
  $("#loginButton").onclick = canLogin ? login : () => signOut(auth);
  refreshIcons();
}

async function login() {
  const button = $("#loginButton");
  button.disabled = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    showToast(`Connexion impossible: ${friendlyError(error)}`, "error");
    button.disabled = false;
  }
}

async function unlockCalculator() {
  $("#accessGate").hidden = true;
  $("#calculatorShell").hidden = false;

  if (!calculatorInitialized) {
    init();
    calculatorInitialized = true;
  }

  $("#logoutButton").onclick = () => signOut(auth);
  await loadTeamMembers();
  subscribeScenarios();
  refreshIcons();
}

function refreshIcons() {
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function friendlyError(error) {
  if (!error) return "Erreur inconnue";
  const message = String(error.message || error);
  if (message.includes("permission-denied")) return "Acces refuse par Firebase.";
  if (message.includes("popup-closed")) return "La fenetre de connexion a ete fermee.";
  if (message.includes("network")) return "Connexion reseau indisponible.";
  return message.replace(/^Firebase:\s*/i, "");
}

function showToast(message, tone = "") {
  const toast = $("#toast");
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = tone ? `visible ${tone}` : "visible";
  toastTimer = window.setTimeout(() => {
    toast.className = "";
  }, 3200);
}

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

function renderSemiTiers() {
  $("#semiTierSelect").innerHTML = [
    `<option value="auto" ${state.semiTierId === "auto" ? "selected" : ""}>Auto selon SP/sem</option>`,
    ...SEMI_TIERS.map((tier) => `
      <option value="${tier.id}" ${tier.id === state.semiTierId ? "selected" : ""}>${tier.label} (${tier.rangeLabel})</option>
    `)
  ].join("");
}

function semiTierById(tierId) {
  return SEMI_TIERS.find((tier) => tier.id === tierId) || SEMI_TIERS[2];
}

function autoSemiTier(volume) {
  if (volume >= 45) return semiTierById("level_4");
  if (volume >= 35) return semiTierById("level_3");
  if (volume >= 25) return semiTierById("level_2");
  if (volume >= 5 && volume <= 15) return semiTierById("part_time");
  return semiTierById("level_1");
}

function currentSemiTier(volume) {
  return state.semiTierId === "auto" ? autoSemiTier(volume) : semiTierById(state.semiTierId);
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
  const semiVolume = Number(state.services.semi?.volume) || 0;
  const semiTier = currentSemiTier(semiVolume);
  let semiHybridSummary = null;
  const rows = [];

  SERVICES.forEach((service) => {
    const values = state.services[service.id];
    const volume = Number(values.volume) || 0;
    const isSemiHybrid = service.id === "semi" && state.semiModel === "hybrid";
    const rate = isSemiHybrid ? semiTier.spRate : Number(values.rate) || 0;
    const revenue = volume * rate;
    const floorHours = estimateFloorHours(service, volume, level);
    const adminHours = serviceAdminHours(service, floorHours, level, efficiency);
    const row = {
      ...service,
      volume,
      rate,
      revenue,
      floorHours,
      adminHours,
      autoRate: isSemiHybrid,
      note: isSemiHybrid
        ? `${semiTier.label}: ${formatMoneyPrecise(semiTier.spRate)} par presence + ${semiTier.csmHours} h CSM a ${formatMoneyPrecise(SEMI_CSM_RATE)}. Budget reference: ${formatMoneyPrecise(SEMI_BUDGET_RATE)} par presence.`
        : service.note
    };
    rows.push(row);

    if (isSemiHybrid) {
      const csmRevenue = semiTier.csmHours * SEMI_CSM_RATE;
      const budgetRevenue = volume * SEMI_BUDGET_RATE;
      const hybridRevenue = revenue + csmRevenue;
      semiHybridSummary = {
        tier: semiTier,
        spRevenue: revenue,
        csmRevenue,
        hybridRevenue,
        budgetRevenue,
        weeklyDelta: hybridRevenue - budgetRevenue
      };
      rows.push({
        id: "semiCsm",
        label: "CSM semi-prive hybride",
        type: "CSM paye",
        rateKey: "semiCsm",
        volume: semiTier.csmHours,
        rate: SEMI_CSM_RATE,
        revenue: csmRevenue,
        floorHours: semiTier.csmHours,
        adminHours: 0,
        unit: "heures",
        autoRate: true,
        generated: true,
        note: "Temps protege pour developpement du portefeuille, prospection, check-ups trimestriels et retention."
      });
    }
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
    efficiency,
    semiHybridSummary
  };
}

function renderServices() {
  const scenario = calculateScenario();
  $("#serviceRows").innerHTML = scenario.rows.map((row) => `
    <tr class="${row.volume > 0 ? "active-service-row" : ""}" data-service-id="${row.id}">
      <td>
        <strong>${row.label}</strong>
        <span>${row.note}</span>
      </td>
      <td>${row.type}</td>
      <td>
        <input class="table-input" type="number" min="0" step="0.05" value="${row.rate}" data-service-rate="${row.id}" ${row.autoRate ? "disabled" : ""}>
      </td>
      <td>
        <input class="table-input" type="number" min="0" step="0.25" value="${row.volume}" data-service-volume="${row.id}" ${row.generated ? "disabled" : ""}>
        <span class="unit-note">${row.unit}</span>
      </td>
      <td>${formatNumber(row.floorHours)} h</td>
      <td>${formatNumber(row.adminHours)} h</td>
      <td>${formatMoneyPrecise(row.revenue)}</td>
    </tr>
  `).join("");

  $$("[data-service-rate]").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.disabled) return;
      state.services[input.dataset.serviceRate].rate = Number(input.value) || 0;
      markScenarioDirty();
      renderResults();
    });
  });

  $$("[data-service-volume]").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.disabled) return;
      state.services[input.dataset.serviceVolume].volume = Number(input.value) || 0;
      markScenarioDirty();
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
  $("#efficiencyCard").innerHTML = `
    <strong>${scenario.efficiency.label}</strong>
    <span>${scenario.efficiency.text}</span>
    <small>${scenario.level.description} Semi-prive estime a ${scenario.level.semiClientsPerHour} client(s) par heure.</small>
  `;
  $("#semiModelCard").innerHTML = semiModelText(scenario);
  const metrics = [
    metric("Revenu hebdomadaire", formatCurrency(scenario.weeklyRevenue)),
    metric("Revenu mensuel", formatCurrency(scenario.monthlyRevenue)),
    metric("Revenu annuel", formatCurrency(scenario.annualRevenue), scenario.annualGap >= 0 ? "good" : "warn"),
    metric("Heures terrain estimees", `${formatNumber(scenario.floorHours)} h`),
    metric("Admin incluse estimee", `${formatNumber(scenario.invisibleAdminHours)} h`),
    metric("Heures reelles totales", `${formatNumber(scenario.totalRealHours)} h`),
    metric("Taux terrain moyen", formatMoneyPrecise(scenario.floorHourlyRate)),
    metric("Taux horaire reel", formatMoneyPrecise(scenario.realHourlyRate), scenario.realHourlyRate >= 30 ? "good" : "warn")
  ];
  $("#resultMetrics").innerHTML = metrics.join("");

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

function semiModelText(scenario) {
  if (!scenario.semiHybridSummary) {
    return `
      <strong>Mode standard semi-prive</strong>
      <span>Le semi-prive est calcule avec le taux par client de la grille salariale.</span>
    `;
  }
  const summary = scenario.semiHybridSummary;
  return `
    <strong>${summary.tier.label} (${summary.tier.rangeLabel})</strong>
    <span>${formatMoneyPrecise(summary.tier.spRate)} par presence + ${summary.tier.csmHours} h CSM payees = ${formatMoneyPrecise(summary.hybridRevenue)} / sem.</span>
    <small>Reference budget 23 $: ${formatMoneyPrecise(summary.budgetRevenue)} / sem. Le CSM est inclus dans ce modele.</small>
  `;
}

function roadmapPrompt(scenario) {
  if (scenario.semiHybridSummary && Math.abs(scenario.semiHybridSummary.weeklyDelta) <= 10) {
    return "Le modele semi-prive est quasi neutre; la discussion peut porter sur la qualite des check-ups et de la prospection CSM.";
  }
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

async function loadTeamMembers() {
  const snapshot = await getDocs(collection(db, "teamMembers"));
  state.teamMembers = snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((member) => member.active !== false && memberHasRevenueTool(member))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"));

  const requestedMemberId = new URLSearchParams(window.location.search).get("member") || "";
  if (requestedMemberId && state.teamMembers.some((member) => member.id === requestedMemberId)) {
    state.selectedMemberId = requestedMemberId;
  } else if (!state.teamMembers.some((member) => member.id === state.selectedMemberId)) {
    state.selectedMemberId = state.teamMembers[0]?.id || "";
  }
  renderMemberSelect();
  updateDashboardLink();
}

function memberHasRevenueTool(member) {
  const roleText = [member.departmentId, member.displayTitle, ...(member.roleIds || [])]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return ["coach", "coaching", "entraineur"].some((term) => roleText.includes(term));
}

function renderMemberSelect() {
  const select = $("#scenarioMemberSelect");
  if (!state.teamMembers.length) {
    select.innerHTML = '<option value="">Aucun coach actif</option>';
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = state.teamMembers.map((member) => `
    <option value="${escapeHtml(member.id)}" ${member.id === state.selectedMemberId ? "selected" : ""}>${escapeHtml(member.name || "Sans nom")}</option>
  `).join("");
}

function subscribeScenarios() {
  unsubscribeScenarios = onSnapshot(collection(db, "revenueScenarios"), (snapshot) => {
    state.scenarios = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));
    renderSavedScenarios();
  }, (error) => {
    setScenarioStatus(`Scenarios indisponibles: ${friendlyError(error)}`, "error");
  });
}

function renderSavedScenarios() {
  const select = $("#savedScenarioSelect");
  const scenarios = state.scenarios.filter((scenario) => scenario.teamMemberId === state.selectedMemberId);
  const currentExists = scenarios.some((scenario) => scenario.id === state.currentScenarioId);
  if (!currentExists) state.currentScenarioId = "";
  select.innerHTML = scenarios.length
    ? ['<option value="">Choisir un scenario...</option>', ...scenarios.map((scenario) => `
        <option value="${escapeHtml(scenario.id)}" ${scenario.id === state.currentScenarioId ? "selected" : ""}>${escapeHtml(scenario.scenarioName || "Scenario sans nom")} - ${escapeHtml(formatScenarioDate(scenario.updatedAt))}</option>
      `)].join("")
    : '<option value="">Aucun scenario sauvegarde</option>';
  syncScenarioButtons();
}

function syncScenarioButtons() {
  const selectedId = $("#savedScenarioSelect")?.value || "";
  $("#loadScenarioButton").disabled = !selectedId;
  $("#deleteScenarioButton").disabled = !selectedId;
}

function updateDashboardLink() {
  const link = $("#dashboardBackLink");
  link.href = state.selectedMemberId ? `./?member=${encodeURIComponent(state.selectedMemberId)}` : "./";
}

function scenarioInputs() {
  collectInputs();
  return {
    levelId: state.levelId,
    targetAnnual: finiteNumber(state.targetAnnual),
    weeks: finiteNumber(state.weeks, 51.6),
    adminEfficiency: finiteNumber(state.adminEfficiency, 3),
    fixedAdminHours: finiteNumber(state.fixedAdminHours),
    semiModel: state.semiModel,
    semiTierId: state.semiTierId,
    services: Object.fromEntries(Object.entries(state.services).map(([id, values]) => [id, {
      volume: finiteNumber(values.volume),
      rate: finiteNumber(values.rate)
    }]))
  };
}

function scenarioResults() {
  const scenario = calculateScenario();
  return {
    weeklyRevenue: finiteNumber(scenario.weeklyRevenue),
    monthlyRevenue: finiteNumber(scenario.monthlyRevenue),
    annualRevenue: finiteNumber(scenario.annualRevenue),
    floorHours: finiteNumber(scenario.floorHours),
    includedAdminHours: finiteNumber(scenario.invisibleAdminHours),
    fixedAdminHours: finiteNumber(scenario.fixedAdminHours),
    totalRealHours: finiteNumber(scenario.totalRealHours),
    floorHourlyRate: finiteNumber(scenario.floorHourlyRate),
    realHourlyRate: finiteNumber(scenario.realHourlyRate),
    annualGap: finiteNumber(scenario.annualGap),
    discussionPrompt: roadmapPrompt(scenario)
  };
}

async function saveScenario() {
  const member = state.teamMembers.find((item) => item.id === state.selectedMemberId);
  if (!member) {
    showToast("Selectionne un membre avant d'enregistrer.", "error");
    return;
  }

  const button = $("#saveScenarioButton");
  button.disabled = true;
  setScenarioStatus("Enregistrement en cours...");
  const existing = state.scenarios.find((item) => item.id === state.currentScenarioId);
  const scenarioReference = existing
    ? doc(db, "revenueScenarios", existing.id)
    : doc(collection(db, "revenueScenarios"));
  const scenarioName = $("#scenarioNameInput").value.trim() || defaultScenarioName();
  const payload = {
    authorUid: existing?.authorUid || state.user.uid,
    authorName: existing?.authorName || state.profile.displayName || state.user.displayName || state.user.email || "Owner",
    teamMemberId: member.id,
    teamMemberName: member.name || "",
    scenarioName,
    modelVersion: REVENUE_MODEL_VERSION,
    inputs: scenarioInputs(),
    results: scenarioResults(),
    updatedAt: serverTimestamp(),
    updatedByUid: state.user.uid,
    updatedByName: state.profile.displayName || state.user.displayName || state.user.email || "Owner"
  };
  if (!existing) payload.createdAt = serverTimestamp();

  try {
    await setDoc(scenarioReference, payload, { merge: true });
    state.currentScenarioId = scenarioReference.id;
    state.scenarioDirty = false;
    $("#scenarioNameInput").value = scenarioName;
    setScenarioStatus(`Enregistre pour ${member.name}.`, "saved");
    showToast("Scenario enregistre dans le dossier du membre.");
    await writeAuditLog(existing ? "revenue_scenario_updated" : "revenue_scenario_created", scenarioReference.id, member, scenarioName);
  } catch (error) {
    setScenarioStatus(`Echec: ${friendlyError(error)}`, "error");
    showToast(`Enregistrement impossible: ${friendlyError(error)}`, "error");
  } finally {
    button.disabled = false;
  }
}

function loadSelectedScenario() {
  const scenarioId = $("#savedScenarioSelect").value;
  const scenario = state.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) return;
  applyScenarioInputs(scenario.inputs || {});
  state.currentScenarioId = scenario.id;
  state.scenarioDirty = false;
  $("#scenarioNameInput").value = scenario.scenarioName || "";
  renderAllCalculatorSections();
  renderSavedScenarios();
  setScenarioStatus(`Charge: ${scenario.scenarioName || "Scenario"}`, "saved");
  showToast("Scenario charge.");
}

function applyScenarioInputs(inputs) {
  state.levelId = LEVELS.some((level) => level.id === inputs.levelId) ? inputs.levelId : "cfl2";
  state.targetAnnual = finiteNumber(inputs.targetAnnual, 70000);
  state.weeks = finiteNumber(inputs.weeks, 51.6);
  state.adminEfficiency = Math.min(5, Math.max(1, finiteNumber(inputs.adminEfficiency, 3)));
  state.fixedAdminHours = finiteNumber(inputs.fixedAdminHours, 2);
  state.semiModel = inputs.semiModel === "standard" ? "standard" : "hybrid";
  state.semiTierId = inputs.semiTierId || "auto";
  state.services = {};
  initializeServices();
  Object.entries(inputs.services || {}).forEach(([id, values]) => {
    if (!state.services[id]) return;
    state.services[id] = {
      volume: finiteNumber(values?.volume),
      rate: finiteNumber(values?.rate, state.services[id].rate)
    };
  });
}

async function deleteSelectedScenario() {
  const scenarioId = $("#savedScenarioSelect").value;
  const scenario = state.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) return;
  if (!window.confirm(`Supprimer definitivement le scenario "${scenario.scenarioName || "Sans nom"}"?`)) return;

  const button = $("#deleteScenarioButton");
  button.disabled = true;
  try {
    await deleteDoc(doc(db, "revenueScenarios", scenario.id));
    if (state.currentScenarioId === scenario.id) {
      state.currentScenarioId = "";
      state.scenarioDirty = true;
    }
    setScenarioStatus("Scenario supprime.");
    showToast("Scenario supprime.");
    const member = state.teamMembers.find((item) => item.id === scenario.teamMemberId);
    await writeAuditLog("revenue_scenario_deleted", scenario.id, member, scenario.scenarioName || "");
  } catch (error) {
    showToast(`Suppression impossible: ${friendlyError(error)}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function writeAuditLog(action, entityId, member, scenarioName) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      actorUid: state.user.uid,
      actorName: state.profile.displayName || state.user.displayName || state.user.email || "Owner",
      action,
      entityType: "revenueScenario",
      entityId,
      details: {
        teamMemberId: member?.id || "",
        teamMemberName: member?.name || "",
        scenarioName
      },
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Audit revenu non enregistre", error);
  }
}

function renderAllCalculatorSections() {
  $("#targetAnnualInput").value = state.targetAnnual;
  $("#weeksInput").value = state.weeks;
  $("#adminEfficiencyInput").value = state.adminEfficiency;
  $("#fixedAdminInput").value = state.fixedAdminHours;
  $("#semiModelSelect").value = state.semiModel;
  renderLevels();
  renderSemiTiers();
  renderServices();
  renderResults();
  refreshIcons();
}

function markScenarioDirty() {
  state.scenarioDirty = true;
  setScenarioStatus(state.currentScenarioId ? "Modifications non enregistrees" : "Nouveau scenario non enregistre");
}

function setScenarioStatus(message, tone = "") {
  const status = $("#scenarioStatus");
  status.textContent = message;
  status.className = tone ? `scenario-status ${tone}` : "scenario-status";
}

function defaultScenarioName() {
  return `Projection ${new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" }).format(new Date())}`;
}

function formatScenarioDate(value) {
  const date = dateFromValue(value);
  return date ? new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" }).format(date) : "date inconnue";
}

function dateValue(value) {
  return dateFromValue(value)?.getTime() || 0;
}

function dateFromValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function collectInputs() {
  state.levelId = $("#levelSelect").value;
  state.targetAnnual = Number($("#targetAnnualInput").value) || 0;
  state.weeks = Number($("#weeksInput").value) || 51.6;
  state.adminEfficiency = Number($("#adminEfficiencyInput").value) || 3;
  state.fixedAdminHours = Number($("#fixedAdminInput").value) || 0;
  state.semiModel = $("#semiModelSelect").value;
  state.semiTierId = $("#semiTierSelect").value;
}

function bindControls() {
  $("#levelSelect").addEventListener("change", () => {
    collectInputs();
    applyLevelRates();
    markScenarioDirty();
    renderServices();
    renderResults();
  });
  ["targetAnnualInput", "weeksInput", "adminEfficiencyInput", "fixedAdminInput"].forEach((id) => {
    $(`#${id}`).addEventListener("input", () => {
      collectInputs();
      markScenarioDirty();
      renderServices();
      renderResults();
    });
  });
  ["semiModelSelect", "semiTierSelect"].forEach((id) => {
    $(`#${id}`).addEventListener("change", () => {
      collectInputs();
      markScenarioDirty();
      renderServices();
      renderResults();
    });
  });
  $("#scenarioMemberSelect").addEventListener("change", (event) => {
    state.selectedMemberId = event.target.value;
    state.currentScenarioId = "";
    state.scenarioDirty = true;
    $("#scenarioNameInput").value = "";
    renderSavedScenarios();
    updateDashboardLink();
    setScenarioStatus("Nouveau scenario non enregistre");
  });
  $("#scenarioNameInput").addEventListener("input", markScenarioDirty);
  $("#savedScenarioSelect").addEventListener("change", syncScenarioButtons);
  $("#saveScenarioButton").addEventListener("click", saveScenario);
  $("#loadScenarioButton").addEventListener("click", loadSelectedScenario);
  $("#deleteScenarioButton").addEventListener("click", deleteSelectedScenario);
  $("#resetLabButton").addEventListener("click", resetLab);
  $("#copyRevenueSummaryButton").addEventListener("click", copySummary);
}

function resetLab() {
  state.levelId = "cfl2";
  state.targetAnnual = 70000;
  state.weeks = 51.6;
  state.adminEfficiency = 3;
  state.fixedAdminHours = 2;
  state.semiModel = "hybrid";
  state.semiTierId = "auto";
  state.services = {};
  state.currentScenarioId = "";
  state.scenarioDirty = true;
  initializeServices();
  $("#targetAnnualInput").value = state.targetAnnual;
  $("#weeksInput").value = state.weeks;
  $("#adminEfficiencyInput").value = state.adminEfficiency;
  $("#fixedAdminInput").value = state.fixedAdminHours;
  $("#semiModelSelect").value = state.semiModel;
  renderLevels();
  renderSemiTiers();
  renderServices();
  renderResults();
  $("#scenarioNameInput").value = "";
  renderSavedScenarios();
  setScenarioStatus("Nouveau scenario non enregistre");
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
    `Mode semi-prive: ${state.semiModel === "hybrid" ? "Hybride SP + CSM" : "Standard par client"}`,
    `Objectif annuel: ${formatCurrency(state.targetAnnual)}`,
    "",
    activeRows || "- Aucun service entre.",
    "",
    `Revenu hebdo: ${formatCurrency(scenario.weeklyRevenue)}`,
    `Revenu annuel: ${formatCurrency(scenario.annualRevenue)}`,
    `Heures terrain estimees: ${formatNumber(scenario.floorHours)} h`,
    `Admin incluse estimee: ${formatNumber(scenario.invisibleAdminHours)} h`,
    `Heures reelles totales: ${formatNumber(scenario.totalRealHours)} h`,
    `Taux horaire reel: ${formatMoneyPrecise(scenario.realHourlyRate)}`,
    `Ecart annuel: ${scenario.annualGap >= 0 ? "+" : "-"}${formatCurrency(Math.abs(scenario.annualGap))}`,
    scenario.semiHybridSummary
      ? `Semi-prive hybride: ${scenario.semiHybridSummary.tier.label}, CSM inclus dans le modele`
      : "Semi-prive: mode standard",
    "",
    `Constat: ${roadmapPrompt(scenario)}`
  ].join("\n");
}

async function copySummary() {
  const text = summaryText();
  try {
    await navigator.clipboard.writeText(text);
    $("#copyRevenueSummaryButton").innerHTML = '<i data-lucide="check"></i> Resume copie';
    refreshIcons();
    window.setTimeout(() => {
      $("#copyRevenueSummaryButton").innerHTML = '<i data-lucide="copy"></i> Copier le resume';
      refreshIcons();
    }, 1600);
  } catch (error) {
    window.prompt("Copie le resume:", text);
  }
}

function init() {
  initializeServices();
  renderLevels();
  renderSemiTiers();
  bindControls();
  renderServices();
  renderResults();
  setScenarioStatus("Nouveau scenario non enregistre");
  refreshIcons();
}
