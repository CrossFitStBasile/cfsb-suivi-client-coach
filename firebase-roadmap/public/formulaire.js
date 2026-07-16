import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import {
  completionForRole,
  currentCycleId,
  draftDocumentId,
  hasMeaningfulAnswers,
  matchingTeamMember,
  newerDraft,
  normalizeEmail,
  sha256Json,
  timestampMillis
} from "./form-model.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const CONFIG_URL = "./roadmap-config.json";
const params = new URLSearchParams(window.location.search);
const CYCLE_ID = params.get("cycle") || currentCycleId();
const STORAGE_KEYS = {
  draft: `cfsb-roadmap-firebase-draft:${CYCLE_ID}`
};
const AUTOSAVE_DELAY_MS = 1000;
const ORG_DEPARTMENTS = [
  { id: "direction", label: "Direction", className: "owners", sortOrder: 10 },
  { id: "operations", label: "Operations", className: "operations", sortOrder: 20 },
  { id: "coaching", label: "Coaching", className: "coaching", sortOrder: 30 },
  { id: "support", label: "Communaute et support", className: "support", sortOrder: 40 }
];
const DEFAULT_TEAM_MEMBERS = [
  { memberId: "michael-grondin", name: "Michael Grondin", departmentId: "direction", displayTitle: "Proprietaire - Ventes, marketing, vision", sortOrder: 10, active: true },
  { memberId: "gabriel-mayer-bedard", name: "Gabriel Mayer Bedard", departmentId: "direction", displayTitle: "Proprietaire - Operations, finances, RH, integration", sortOrder: 20, active: true },
  { memberId: "caroline-martineau", name: "Caroline Martineau", departmentId: "operations", displayTitle: "Chef d'equipe, coordination, ventes", sortOrder: 10, active: true },
  { memberId: "tiffany-bolduc-brossier", name: "Tiffany Bolduc-Brossier", departmentId: "operations", displayTitle: "Conciliation de la paie", sortOrder: 20, active: true },
  { memberId: "hugo-lelievre", name: "Hugo Lelievre", departmentId: "coaching", displayTitle: "Coach en chef, formateur", sortOrder: 10, active: true },
  { memberId: "marc-andre-menard", name: "Marc-Andre Menard", departmentId: "coaching", displayTitle: "Coach professionnel", sortOrder: 20, active: true },
  { memberId: "raphael-samson", name: "Raphael Samson", departmentId: "coaching", displayTitle: "Coach professionnel", sortOrder: 30, active: true },
  { memberId: "camille-proulx", name: "Camille Proulx", departmentId: "coaching", displayTitle: "Coach professionnel", sortOrder: 40, active: true },
  { memberId: "david-olivier", name: "David Olivier", departmentId: "coaching", displayTitle: "Coach professionnel", sortOrder: 50, active: true },
  { memberId: "iheb-yahyaoui", name: "Iheb Yahyaoui", departmentId: "coaching", displayTitle: "Coach professionnel", sortOrder: 60, active: true },
  { memberId: "roxanne-vincent", name: "Roxanne Vincent", departmentId: "coaching", displayTitle: "Coach developpement", sortOrder: 70, active: true },
  { memberId: "nathan-goupil", name: "Nathan Goupil", departmentId: "coaching", displayTitle: "Coach developpement", sortOrder: 80, active: true },
  { memberId: "chloe-willis", name: "Chloe Willis", departmentId: "coaching", displayTitle: "Coach developpement", sortOrder: 90, active: true },
  { memberId: "serge-thibault", name: "Serge Thibault", departmentId: "coaching", displayTitle: "Coach communaute", sortOrder: 100, active: true },
  { memberId: "kim-theriault", name: "Kim Theriault", departmentId: "coaching", displayTitle: "Coach communaute", sortOrder: 110, active: true },
  { memberId: "jean-sylvain-cote", name: "Jean-Sylvain Cote", departmentId: "coaching", displayTitle: "Coach communaute", sortOrder: 120, active: true },
  { memberId: "karolina-milewska", name: "Karolina Milewska", departmentId: "support", displayTitle: "Gestionnaire Club Social", sortOrder: 10, active: true },
  { memberId: "lysanne-gosselin", name: "Lysanne Gosselin", departmentId: "support", displayTitle: "Entretien menager", sortOrder: 20, active: true },
  { memberId: "michel-jasen-mallet", name: "Michel Jasen Mallet", departmentId: "support", displayTitle: "Entretien menager", sortOrder: 30, active: true },
  { memberId: "valerie-savard", name: "Valerie Savard", departmentId: "support", displayTitle: "Equipe CFSB", sortOrder: 40, active: true }
];

const state = {
  config: null,
  configHash: "",
  teamMembers: DEFAULT_TEAM_MEMBERS,
  teamDepartments: ORG_DEPARTMENTS,
  selectedRoleId: "",
  answers: {},
  clientSubmissionId: "",
  cycleId: CYCLE_ID,
  user: null,
  access: null,
  cloudDraftExists: false,
  cloudDraftId: "",
  submitted: false,
  autosaveTimer: null,
  isSaving: false,
  isSubmitting: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadConfig() {
  const response = await fetch(CONFIG_URL);
  if (!response.ok) {
    throw new Error(`Configuration introuvable (${response.status})`);
  }
  state.config = await response.json();
  state.configHash = await sha256Json(state.config);
}

async function loadTeamMembers() {
  try {
    const [memberSnapshot, departmentSnapshot] = await Promise.all([
      getDocs(query(collection(db, "teamMembers"), where("active", "==", true))),
      getDocs(collection(db, "orgDepartments"))
    ]);
    state.teamMembers = memberSnapshot.docs.map((item) => ({ id: item.id, memberId: item.id, ...item.data() }));
    state.teamDepartments = departmentSnapshot.docs.length
      ? departmentSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      : ORG_DEPARTMENTS;
  } catch {
    state.teamMembers = DEFAULT_TEAM_MEMBERS;
    state.teamDepartments = ORG_DEPARTMENTS;
  }
}

function renderOrgChart() {
  const grid = $("#orgGrid");
  if (!grid) return;

  const departments = [...state.teamDepartments].sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));
  const members = [...state.teamMembers]
    .filter((member) => member.active !== false)
    .sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999) || String(a.name || "").localeCompare(String(b.name || "")));

  grid.innerHTML = departments.map((department) => {
    const departmentMembers = members.filter((member) => member.departmentId === department.id);
    return `
      <article class="org-column ${escapeHtml(department.className || department.id)}">
        <h3>${escapeHtml(department.label)}</h3>
        <ul>
          ${departmentMembers.length ? departmentMembers.map((member) => `
            <li><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.displayTitle || roleLabelsForMember(member))}</span></li>
          `).join("") : '<li><strong>Aucun membre actif</strong><span>A completer dans le dashboard owners.</span></li>'}
        </ul>
      </article>
    `;
  }).join("");
}

function roleLabelsForMember(member) {
  const roleIds = member.roleIds || [];
  return roleIds
    .map((roleId) => state.config?.roles?.find((role) => role.id === roleId)?.label || roleId)
    .filter(Boolean)
    .join(", ");
}

function roleById(roleId) {
  return state.config.roles.find((role) => role.id === roleId);
}

function moduleById(moduleId) {
  return state.config.modules.find((module) => module.id === moduleId);
}

function scaleById(scaleId) {
  return state.config.scales[scaleId];
}

function availablePathways(roleId) {
  return state.config.pathways.filter((pathway) => pathway.fromRoleIds.includes(roleId));
}

function renderRoles() {
  const roleList = $("#roleList");
  roleList.innerHTML = state.config.roles.map((role) => `
    <button class="role-button${role.id === state.selectedRoleId ? " active" : ""}" type="button" data-role-id="${escapeHtml(role.id)}">
      <strong>${escapeHtml(role.label)}</strong>
      <span>${escapeHtml(role.description)}</span>
    </button>
  `).join("");

  $$(".role-button", roleList).forEach((button) => {
    button.addEventListener("click", () => selectRole(button.dataset.roleId));
  });
}

function selectRole(roleId) {
  if (state.selectedRoleId && roleId !== state.selectedRoleId && hasMeaningfulAnswers(state.answers)) {
    const shouldContinue = confirm("Changer de role va recommencer le brouillon actuel. Continuer?");
    if (!shouldContinue) return;
  }
  state.selectedRoleId = roleId;
  state.answers = {};
  state.clientSubmissionId = state.user ? draftDocumentId(state.user.uid, state.cycleId) : createClientSubmissionId();
  state.submitted = false;
  renderRoles();
  renderForm();
  $("#roleDot").classList.add("done");
  $("#formDot").classList.add("done");
  localStorage.removeItem(STORAGE_KEYS.draft);
  updateDraftStatus("");
  saveDraft({ silent: true }).catch(() => {});
}

function renderForm() {
  const role = roleById(state.selectedRoleId);
  const sections = $("#sections");
  const actions = $("#formActions");
  const notice = $("#formNotice");
  const resources = $("#roleResources");

  if (!role) {
    sections.innerHTML = "";
    resources.innerHTML = "";
    actions.hidden = true;
    notice.hidden = false;
    notice.textContent = "Choisis un role pour generer le formulaire.";
    return;
  }

  notice.hidden = false;
  notice.textContent = `Formulaire genere pour: ${role.label}.`;
  resources.innerHTML = renderRoleResources(role);
  actions.hidden = false;

  sections.innerHTML = role.moduleIds
    .map((moduleId) => moduleById(moduleId))
    .filter(Boolean)
    .map((module) => renderModule(module, role))
    .join("");

  bindFields();
  refreshConditionalFields();
}

function renderRoleResources(role) {
  const resources = role.resources || [];
  if (!resources.length) return "";

  return `
    <section class="resource-card">
      <div>
        <strong>Avant de repondre</strong>
        <span>Tu peux relire la description de ton role si tu veux te referer aux attentes officielles.</span>
      </div>
      <div class="resource-links">
        ${resources.map((resource) => `
          <a class="button secondary" href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(resource.label)}
          </a>
        `).join("")}
      </div>
    </section>
  `;
}

function renderModule(module, role) {
  return `
    <section class="section" data-module-id="${escapeHtml(module.id)}">
      <div class="section-header">
        <h2>${escapeHtml(module.title)}</h2>
        <p>${escapeHtml(module.intro || "")}</p>
      </div>
      <div class="section-body">
        ${renderModuleBody(module, role)}
      </div>
    </section>
  `;
}

function renderModuleBody(module, role) {
  if (module.groups?.length) {
    let questionNumber = 0;
    return module.groups.map((group) => {
      const questions = group.questions || [];
      const numberedCount = questions.filter(isNumberedQuestion).length;
      return `
        <details class="question-group" open>
          <summary>
            <strong>${escapeHtml(group.title)}</strong>
            ${numberedCount ? `<small class="question-count">${numberedCount} question${numberedCount > 1 ? "s" : ""}</small>` : ""}
            ${group.intro ? `<span>${escapeHtml(group.intro)}</span>` : ""}
          </summary>
          <div class="question-group-body">
            ${questions.map((question) => {
              const number = isNumberedQuestion(question) ? ++questionNumber : null;
              return renderQuestion(question, role, number);
            }).join("")}
          </div>
        </details>
      `;
    }).join("");
  }

  let questionNumber = 0;
  return (module.questions || []).map((question) => {
    const number = isNumberedQuestion(question) ? ++questionNumber : null;
    return renderQuestion(question, role, number);
  }).join("");
}

function isNumberedQuestion(question) {
  return question.type === "scale";
}

function renderQuestion(question, role, questionNumber = null) {
  if (question.type === "info") {
    return renderInfoBlock(question);
  }

  const required = question.required ? '<span class="required">*</span>' : "";
  const label = questionNumber ? `Q${questionNumber}. ${question.label}` : question.label;
  const conditional = JSON.stringify({
    showIf: question.showIf || null,
    showIfMax: question.showIfMax || null,
    showIfIn: question.showIfIn || null,
    showIfPathway: question.showIfPathway || false
  }).replaceAll('"', "&quot;");

  return `
    <div class="field" data-field-id="${escapeHtml(question.id)}" data-conditional="${conditional}">
      <label>${escapeHtml(label)} ${required}</label>
      ${renderInput(question, role)}
    </div>
  `;
}

function renderInfoBlock(question) {
  const body = Array.isArray(question.body) ? question.body : [question.body].filter(Boolean);
  const links = question.links || [];

  return `
    <div class="info-block" data-info-id="${escapeHtml(question.id)}">
      ${question.title ? `<h3>${escapeHtml(question.title)}</h3>` : ""}
      ${body.length ? `<ul>${body.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${links.length ? `
        <div class="info-links">
          ${links.map((link) => `
            <a class="button secondary" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(link.label)}
            </a>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderInput(question, role) {
  if (question.type === "long_text") {
    return `<textarea data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}></textarea>`;
  }

  if (question.type === "short_text" || question.type === "email") {
    const type = question.type === "email" ? "email" : "text";
    return `<input class="input" type="${type}" data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}>`;
  }

  if (question.type === "single_choice") {
    return `
      <select data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}>
        <option value="">Choisir</option>
        ${(question.options || []).map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
      </select>
    `;
  }

  if (question.type === "multi_choice") {
    return `
      <div class="choice-row">
        ${(question.options || []).map((option) => `
          <label class="choice-option">
            <input type="checkbox" name="${escapeHtml(question.id)}" value="${escapeHtml(option)}" data-question-id="${escapeHtml(question.id)}">
            <span>${escapeHtml(option)}</span>
          </label>
        `).join("")}
      </div>
    `;
  }

  if (question.type === "scale") {
    const scale = scaleById(question.scaleId);
    const values = [];
    for (let value = scale.min; value <= scale.max; value += 1) values.push(value);
    return `
      <div class="scale-row" role="radiogroup">
        ${values.map((value) => `
          <label class="scale-option${question.rubric ? " detailed" : ""}">
            <input type="radio" name="${escapeHtml(question.id)}" value="${value}" data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}>
            <span>
              <strong>${value}${scale.labels[String(value)] ? ` - ${escapeHtml(scale.labels[String(value)])}` : ""}</strong>
              ${question.rubric?.[String(value)] ? `<em>${escapeHtml(question.rubric[String(value)])}</em>` : ""}
            </span>
          </label>
        `).join("")}
      </div>
    `;
  }

  if (question.type === "pathway_choice") {
    const pathways = availablePathways(role.id);
    return `
      <div class="choice-row" role="radiogroup">
        ${pathways.map((pathway) => `
          <label class="choice-option">
            <input type="radio" name="${escapeHtml(question.id)}" value="${escapeHtml(pathway.id)}" data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}>
            <span><strong>${escapeHtml(pathway.label)}</strong><br>${escapeHtml(pathway.summary)}</span>
          </label>
        `).join("")}
      </div>
      <div id="pathwayPreview" class="pathway-card" hidden></div>
    `;
  }

  return `<input class="input" type="text" data-question-id="${escapeHtml(question.id)}" ${question.required ? "required" : ""}>`;
}

function bindFields() {
  $$("[data-question-id]").forEach((field) => {
    field.addEventListener("input", handleFieldChange);
    field.addEventListener("change", handleFieldChange);
  });
}

function handleFieldChange(event) {
  const input = event.target;
  const questionId = input.dataset.questionId;
  if (!questionId) return;

  if (input.type === "radio") {
    if (!input.checked) return;
    state.answers[questionId] = input.value;
  } else if (input.type === "checkbox") {
    state.answers[questionId] = $$(`input[type="checkbox"][name="${CSS.escape(input.name)}"]:checked`)
      .map((checkbox) => checkbox.value)
      .join(", ");
  } else {
    state.answers[questionId] = input.value;
  }

  if (questionId === "coach_aspiration_select") {
    renderPathwayPreview(input.value);
  }

  refreshConditionalFields();
  scheduleAutosave();
}

function createClientSubmissionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `roadmap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function updateDraftStatus(message) {
  const status = $("#draftStatus");
  if (!status) return;
  status.textContent = message || "";
}

function scheduleAutosave() {
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = window.setTimeout(() => {
    saveDraft({ silent: true }).catch(() => {});
  }, AUTOSAVE_DELAY_MS);
}

function readLocalDraft() {
  const raw = localStorage.getItem(STORAGE_KEYS.draft);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEYS.draft);
    return null;
  }
}

function applyDraft(draft, message) {
  if (!draft.selectedRoleId || !draft.answers) return;
  state.selectedRoleId = draft.selectedRoleId;
  state.answers = { ...(draft.answers || {}) };
  state.clientSubmissionId = draft.clientSubmissionId || createClientSubmissionId();
  renderRoles();
  renderForm();
  populateFormValues();
  refreshConditionalFields();
  renderPathwayPreview(state.answers.coach_aspiration_select);
  $("#roleDot").classList.add("done");
  $("#formDot").classList.add("done");
  showNotice(message, "success");
}

function populateFormValues() {
  $$("[data-question-id]").forEach((input) => {
    const questionId = input.dataset.questionId;
    const value = state.answers[questionId];
    if (value === undefined || value === null) return;

    if (input.type === "radio") {
      input.checked = String(input.value) === String(value);
      return;
    }

    if (input.type === "checkbox") {
      const selected = Array.isArray(value)
        ? value.map(String)
        : String(value).split(",").map((item) => item.trim());
      input.checked = selected.includes(input.value);
      return;
    }

    input.value = value;
  });
}

async function signIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === "auth/popup-closed-by-user") return null;
    throw error;
  }
  return auth.currentUser;
}

async function resolveAccess(user) {
  if (!user) return null;
  const profileSnapshot = await getDoc(doc(db, "users", user.uid));
  const profile = profileSnapshot.exists() ? profileSnapshot.data() : null;
  if (profile?.active === true && ["owner", "admin", "member"].includes(profile.role)) {
    return {
      allowed: true,
      kind: profile.role,
      teamMemberId: profile.teamMemberId || "",
      profile
    };
  }

  const invitationSnapshot = await getDocs(query(
    collection(db, "portalInvitations"),
    where("email", "==", user.email || ""),
    where("active", "==", true)
  ));
  const invitation = invitationSnapshot.docs[0];
  return invitation ? {
    allowed: true,
    kind: "invited_member",
    teamMemberId: invitation.id,
    invitation: invitation.data()
  } : { allowed: false, kind: "unauthorized", teamMemberId: "" };
}

async function restoreCloudDraft() {
  if (!state.user || !state.access?.allowed) return;
  state.cloudDraftId = draftDocumentId(state.user.uid, state.cycleId);
  const snapshot = await getDoc(doc(db, "roadmapDrafts", state.cloudDraftId));
  state.cloudDraftExists = snapshot.exists();
  const cloudDraft = snapshot.exists() ? snapshot.data() : null;
  if (cloudDraft?.status === "submitted") {
    state.submitted = true;
    showSubmittedState(cloudDraft.clientSubmissionId || "");
    return;
  }

  const storedLocalDraft = readLocalDraft();
  const localBelongsToAnotherUser = storedLocalDraft?.localAuthorUid && storedLocalDraft.localAuthorUid !== state.user.uid;
  const localDraft = localBelongsToAnotherUser ? null : storedLocalDraft;
  if (localBelongsToAnotherUser) {
    localStorage.removeItem(STORAGE_KEYS.draft);
    state.selectedRoleId = "";
    state.answers = {};
    state.clientSubmissionId = state.cloudDraftId;
    renderRoles();
    renderForm();
    $("#roleDot").classList.remove("done");
    $("#formDot").classList.remove("done");
  }
  const latest = newerDraft(localDraft, cloudDraft);
  if (!latest?.selectedRoleId) {
    state.clientSubmissionId = state.cloudDraftId;
    return;
  }
  const fromCloud = latest === cloudDraft;
  applyDraft(latest, fromCloud
    ? "Brouillon Firebase restaure. Tu peux reprendre exactement ou tu etais."
    : "Brouillon de cet appareil restaure et pret a etre synchronise.");
  state.clientSubmissionId = state.cloudDraftId;
  if (!fromCloud) await saveDraft({ silent: true });
}

async function handleAuthState(user) {
  state.user = user;
  state.access = null;
  const authButton = $("#authButton");
  if (!user) {
    $("#authState").textContent = "Non connecte";
    authButton.textContent = "Se connecter";
    updateCloudState("Brouillon conserve sur cet appareil.", "local");
    return;
  }

  $("#authState").textContent = user.email || "Compte Google";
  authButton.textContent = "Se deconnecter";
  try {
    state.access = await resolveAccess(user);
    if (!state.access?.allowed) {
      updateCloudState("Compte non autorise pour le pilote.", "error");
      showNotice("Ce compte n'est pas encore relie a un dossier CFSB. Demande a Michael ou Gabriel de valider ton acces.", "error");
      return;
    }
    updateCloudState("Connexion Firebase etablie.", "synced");
    await restoreCloudDraft();
  } catch (error) {
    updateCloudState("Connexion etablie, mais la reprise nuage a echoue.", "error");
    showNotice(readableError(error), "error");
  }
}

function renderPathwayPreview(pathwayId) {
  const preview = $("#pathwayPreview");
  if (!preview) return;

  const pathway = state.config.pathways.find((item) => item.id === pathwayId);
  if (!pathway || pathway.id === "none") {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }

  preview.hidden = false;
  preview.innerHTML = `
    <h3>${escapeHtml(pathway.label)}</h3>
    <p>${escapeHtml(pathway.summary)}</p>
    ${(pathway.expectations || []).length ? `<ul>${pathway.expectations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
  `;
}

function refreshConditionalFields() {
  $$(".field").forEach((field) => {
    const raw = field.dataset.conditional;
    if (!raw) return;
    const conditional = JSON.parse(raw.replaceAll("&quot;", '"'));
    let visible = true;

    if (conditional.showIf) {
      const answer = state.answers[conditional.showIf.questionId];
      visible = conditional.showIf.notEquals ? answer !== conditional.showIf.notEquals : answer === conditional.showIf.equals;
    }

    if (conditional.showIfMax) {
      const answer = Number(state.answers[conditional.showIfMax.questionId]);
      visible = Number.isFinite(answer) && answer <= Number(conditional.showIfMax.max);
    }

    if (conditional.showIfIn) {
      const answer = state.answers[conditional.showIfIn.questionId];
      visible = (conditional.showIfIn.values || []).includes(answer);
    }

    if (conditional.showIfPathway) {
      const answer = state.answers.coach_aspiration_select;
      visible = Boolean(answer && answer !== "none");
    }

    field.classList.toggle("hidden", !visible);
    $$("[required]", field).forEach((input) => {
      input.disabled = !visible;
    });
  });
}

function buildPayload() {
  const role = roleById(state.selectedRoleId);
  if (!state.clientSubmissionId) state.clientSubmissionId = createClientSubmissionId();
  const matchedMember = matchingTeamMember(state.teamMembers, {
    name: state.answers.employee_name,
    email: state.answers.employee_email
  });
  const accessMemberId = ["member", "invited_member"].includes(state.access?.kind)
    ? state.access.teamMemberId
    : "";
  return {
    project: state.config.meta.project,
    clientSubmissionId: state.clientSubmissionId,
    sourceSubmissionId: "",
    teamMemberId: accessMemberId || matchedMember?.id || matchedMember?.memberId || "",
    cycleId: state.cycleId,
    formVersion: String(state.config.meta.version),
    formConfigHash: state.configHash,
    selectedRoleId: role?.id || "",
    selectedRoleLabel: role?.label || "",
    employeeName: String(state.answers.employee_name || "").trim(),
    employeeEmail: normalizeEmail(state.answers.employee_email),
    answers: { ...state.answers },
    completion: completionForRole(state.config, state.selectedRoleId, state.answers)
  };
}

function readCurrentFormValues() {
  $$("[data-question-id]").forEach((input) => {
    if (input.disabled) return;
    const questionId = input.dataset.questionId;
    if (input.type === "radio") {
      if (input.checked) state.answers[questionId] = input.value;
      return;
    }
    if (input.type === "checkbox") {
      state.answers[questionId] = $$(`input[type="checkbox"][name="${CSS.escape(input.name)}"]:checked`)
        .map((checkbox) => checkbox.value)
        .join(", ");
      return;
    }
    state.answers[questionId] = input.value;
  });
}

function saveLocalDraft() {
  if (!state.selectedRoleId) return null;
  readCurrentFormValues();
  const payload = {
    ...buildPayload(),
    status: "draft",
    savedAt: new Date().toISOString(),
    localAuthorUid: state.user?.uid || ""
  };
  localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(payload));
  return payload;
}

async function saveDraft(options = {}) {
  const silent = options && options.silent === true;
  const payload = saveLocalDraft();
  if (!payload) return null;
  const savedLabel = new Date().toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  updateDraftStatus(`Brouillon sauvegarde a ${savedLabel}.`);

  if (!state.user || !state.access?.allowed) {
    updateCloudState("Brouillon conserve sur cet appareil.", "local");
    if (!silent) showNotice("Brouillon sauvegarde sur cet appareil. Connecte-toi pour le synchroniser.", "success");
    return payload;
  }

  state.isSaving = true;
  updateCloudState("Synchronisation du brouillon...", "saving");
  state.cloudDraftId = state.cloudDraftId || draftDocumentId(state.user.uid, state.cycleId);
  const draftRef = doc(db, "roadmapDrafts", state.cloudDraftId);
  try {
    if (!state.cloudDraftExists) {
      const existingDraft = await getDoc(draftRef);
      state.cloudDraftExists = existingDraft.exists();
      if (existingDraft.data()?.status === "submitted") {
        state.submitted = true;
        showSubmittedState(existingDraft.data().clientSubmissionId || state.clientSubmissionId, true);
        return existingDraft.data();
      }
    }
    const cloudPayload = {
      ...payload,
      authorUid: state.user.uid,
      status: "draft",
      updatedAt: serverTimestamp()
    };
    delete cloudPayload.savedAt;
    delete cloudPayload.localAuthorUid;
    if (!state.cloudDraftExists) cloudPayload.createdAt = serverTimestamp();
    await setDoc(draftRef, cloudPayload, { merge: true });
    state.cloudDraftExists = true;
    updateCloudState(`Brouillon synchronise a ${savedLabel}.`, "synced");
    if (!silent) showNotice("Brouillon sauvegarde dans Firebase. Tu peux le reprendre sur un autre appareil.", "success");
    return payload;
  } catch (error) {
    updateCloudState("Brouillon local conserve; synchronisation a reprendre.", "error");
    if (!silent) showNotice(readableError(error), "error");
    throw error;
  } finally {
    state.isSaving = false;
  }
}

async function ensureAuthorizedUser() {
  const user = state.user || await signIn();
  if (!user) return null;
  state.user = user;
  state.access = state.access || await resolveAccess(user);
  if (!state.access?.allowed) {
    throw new Error("Ce compte n'est pas autorise a soumettre une Roadmap CFSB.");
  }
  state.cloudDraftId = state.cloudDraftId || draftDocumentId(user.uid, state.cycleId);
  state.clientSubmissionId = state.cloudDraftId;
  return user;
}

async function submitPayload(payload) {
  const user = await ensureAuthorizedUser();
  if (!user) return null;

  payload.clientSubmissionId = state.clientSubmissionId;
  if (["member", "invited_member"].includes(state.access?.kind)) {
    payload.teamMemberId = state.access.teamMemberId;
  }
  const submissionRef = doc(db, "roadmapSubmissions", payload.clientSubmissionId);
  const existing = await getDoc(submissionRef);
  if (existing.exists()) return { id: existing.id, alreadySubmitted: true };

  await saveDraft({ silent: true });
  if (state.submitted) return { id: payload.clientSubmissionId, alreadySubmitted: true };

  const draftRef = doc(db, "roadmapDrafts", state.cloudDraftId);
  const batch = writeBatch(db);
  batch.set(submissionRef, {
    ...payload,
    authorUid: user.uid,
    status: "to_read",
    source: "firebase",
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.update(draftRef, {
    status: "submitted",
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await batch.commit();
  return { id: submissionRef.id, alreadySubmitted: false };
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.isSubmitting) return;
  readCurrentFormValues();

  if (!event.target.reportValidity()) return;

  const payload = buildPayload();
  try {
    setSubmitInProgress(true);
    const result = await submitPayload(payload);
    if (!result) return;
    $("#submitDot").classList.add("done");
    state.submitted = true;
    localStorage.removeItem(STORAGE_KEYS.draft);
    updateDraftStatus("");
    showSubmittedState(result.id, result.alreadySubmitted);
  } catch (error) {
    showNotice(readableError(error), "error");
  } finally {
    setSubmitInProgress(false);
  }
}

function setSubmitInProgress(isInProgress) {
  const submitButton = $("#submitButton");
  const saveDraftButton = $("#saveDraftButton");
  state.isSubmitting = isInProgress;

  if (submitButton) {
    submitButton.disabled = isInProgress || state.submitted;
    submitButton.textContent = isInProgress ? "Envoi en cours..." : state.submitted ? "Soumis" : "Soumettre";
    submitButton.setAttribute("aria-busy", isInProgress ? "true" : "false");
  }

  if (saveDraftButton) {
    saveDraftButton.disabled = isInProgress || state.submitted;
  }

  if (!isInProgress) {
    if ($("#draftStatus")?.textContent === "Sauvegarde en cours vers la base Roadmap...") {
      updateDraftStatus("");
    }
    return;
  }

  showNotice(
    "Envoi en cours dans Firebase. Garde cette page ouverte jusqu'au message de confirmation.",
    "sending"
  );
  updateDraftStatus("Validation et sauvegarde de la soumission...");
}

function showNotice(message, type = "") {
  const notice = $("#formNotice");
  notice.hidden = false;
  notice.className = `notice ${type}`.trim();
  notice.textContent = message;
}

function updateCloudState(message, tone = "") {
  const element = $("#cloudState");
  element.textContent = message;
  element.className = `firebase-cloud-state ${tone}`.trim();
}

function showSubmittedState(submissionId, alreadySubmitted = false) {
  const message = alreadySubmitted
    ? "Cette Roadmap avait deja ete recue. Aucun doublon n'a ete cree."
    : "Roadmap recue. Michael et Gabriel la verront automatiquement dans leur dashboard.";
  showNotice(`${message} Reference: ${submissionId}.`, "success");
  updateCloudState("Soumission finale enregistree.", "synced");
  $("#submitDot").classList.add("done");
  $$("#roadmapForm input, #roadmapForm select, #roadmapForm textarea, #roadmapForm button").forEach((element) => {
    element.disabled = true;
  });
  $$(".role-button").forEach((element) => {
    element.disabled = true;
  });
}

function readableError(error) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied")) return "Firebase a refuse cette operation. Verifie que ton compte est bien relie a CFSB.";
  if (code.includes("unavailable")) return "Firebase est temporairement indisponible. Ton brouillon reste conserve sur cet appareil.";
  return error?.message || "Une erreur inattendue est survenue.";
}

async function init() {
  state.clientSubmissionId = createClientSubmissionId();
  $("#cycleLabel").textContent = `Roadmap ${state.cycleId}`;
  $("#authButton").addEventListener("click", async () => {
    try {
      if (state.user) await signOut(auth);
      else await signIn();
    } catch (error) {
      showNotice(readableError(error), "error");
    }
  });
  $("#saveDraftButton").addEventListener("click", () => saveDraft());
  $("#roadmapForm").addEventListener("submit", handleSubmit);

  try {
    await loadConfig();
    await loadTeamMembers();
    renderOrgChart();
    renderRoles();
    const localDraft = readLocalDraft();
    if (localDraft?.selectedRoleId) applyDraft(localDraft, "Brouillon de cet appareil restaure.");
    onAuthStateChanged(auth, handleAuthState);
    window.addEventListener("beforeunload", () => {
      if (state.selectedRoleId && Object.keys(state.answers).length && !state.submitted) saveLocalDraft();
    });
  } catch (error) {
    showNotice(readableError(error), "error");
  }
}

init();
