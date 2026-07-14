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
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const PORTAL_CONTRACT_VERSION = "cfsb-portal-v1";
const COACH_DASHBOARD_URL = "https://cfsb-dashboard-coach-aa9a4.web.app/";
const INITIAL_MEMBER_ID = new URLSearchParams(window.location.search).get("member") || "";
const OWNER_ROLES = ["owner", "admin"];
const STATUS_LABELS = {
  planned: "Planifiee",
  in_progress: "En cours",
  blocked: "Bloquee",
  completed: "Realisee",
  abandoned: "Abandonnee"
};
const COACH_ID_BY_MEMBER = {
  "marc-andre-menard": "15935",
  "iheb-yahyaoui": "15928",
  "camille-proulx": "17242",
  "david-olivier": "15902",
  "gabriel-mayer-bedard": "15893",
  "hugo-lelievre": "15937",
  "raphael-samson": "15936"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const state = {
  user: null,
  profile: null,
  ownerMode: false,
  ownerRoster: [],
  selectedMemberId: "",
  member: null,
  portalProfile: null,
  careerPlan: null,
  careerPlanVersion: "",
  planDraft: null,
  planDirty: false,
  remotePlanPending: false,
  submissions: [],
  milestones: [],
  careerUpdates: [],
  sharedSummaries: [],
  planEvents: [],
  forms: {},
  tab: "overview",
  loadError: "",
  unsubscribers: []
};

const appRoot = document.querySelector("#app");
const toastRoot = document.querySelector("#toast");
let toastTimer = null;

window.addEventListener("beforeunload", (event) => {
  if (!state.planDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

onAuthStateChanged(auth, async (user) => {
  cleanupSubscriptions();
  resetMemberState();
  state.user = user;
  state.profile = null;
  state.ownerMode = false;
  state.loadError = "";
  if (!user) {
    renderLogin();
    return;
  }
  await loadAccessProfile(user);
});

async function loadAccessProfile(user) {
  try {
    const profileRef = doc(db, "users", user.uid);
    let profileSnapshot = await getDoc(profileRef);
    if (!profileSnapshot.exists()) {
      const invitation = await findInvitation(user.email || "");
      if (!invitation) {
        renderPendingAccess(user);
        return;
      }
      await setDoc(profileRef, {
        active: true,
        role: "member",
        teamMemberId: invitation.teamMemberId,
        invitationId: invitation.id,
        displayName: user.displayName || invitation.memberName || "Membre CFSB",
        email: normalizeEmail(user.email),
        portalContractVersion: PORTAL_CONTRACT_VERSION,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      profileSnapshot = await getDoc(profileRef);
    }

    state.profile = { id: profileSnapshot.id, ...profileSnapshot.data() };
    if (!state.profile.active) {
      renderAccessDenied("Ton acces au portail existe, mais il n'est pas actif.");
      return;
    }

    state.ownerMode = OWNER_ROLES.includes(state.profile.role);
    if (state.ownerMode) {
      await loadOwnerRoster();
    } else if (state.profile.role === "member" && state.profile.teamMemberId) {
      state.selectedMemberId = state.profile.teamMemberId;
    } else {
      renderAccessDenied("Ce compte ne possede pas un profil Portail CFSB valide.");
      return;
    }

    if (!state.selectedMemberId) {
      renderAccessDenied("Aucun dossier membre n'est associe a ce compte.");
      return;
    }
    subscribeMemberData();
  } catch (error) {
    renderAccessDenied(`Impossible de verifier l'acces: ${friendlyError(error)}`);
  }
}

async function findInvitation(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const invitationQuery = query(
    collection(db, "portalInvitations"),
    where("email", "==", normalizedEmail),
    where("active", "==", true),
    limit(1)
  );
  const snapshot = await getDocs(invitationQuery);
  return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function loadOwnerRoster() {
  const snapshot = await getDocs(collection(db, "teamMembers"));
  state.ownerRoster = snapshot.docs
    .map(fromDoc)
    .sort((a, b) => Number(a.active === false) - Number(b.active === false) || String(a.name || "").localeCompare(String(b.name || ""), "fr"));
  if (INITIAL_MEMBER_ID && state.ownerRoster.some((member) => member.id === INITIAL_MEMBER_ID)) {
    state.selectedMemberId = INITIAL_MEMBER_ID;
  } else {
    state.selectedMemberId = state.ownerRoster.find((member) => member.active !== false)?.id || state.ownerRoster[0]?.id || "";
  }
}

function subscribeMemberData() {
  cleanupSubscriptions();
  resetMemberState(false);
  const memberId = state.selectedMemberId;
  renderLoading();

  subscribeDoc("teamMembers", memberId, (value) => {
    state.member = value;
    renderFromData();
  });
  subscribeDoc("memberPortalProfiles", memberId, (value) => {
    state.portalProfile = value;
    renderFromData();
  });
  subscribeDoc("memberCareerPlans", memberId, (value) => {
    if (state.planDirty && document.querySelector("#careerPlanForm")) {
      state.remotePlanPending = true;
      return;
    }
    state.careerPlan = value;
    state.careerPlanVersion = versionToken(value?.updatedAt);
    state.planDraft = null;
    state.remotePlanPending = false;
    renderFromData();
  });

  subscribeQuery(
    query(collection(db, "roadmapSubmissions"), where("teamMemberId", "==", memberId), orderBy("submittedAt", "desc")),
    (items) => { state.submissions = items; renderFromData(); }
  );
  subscribeQuery(
    query(collection(db, "careerMilestones"), where("teamMemberId", "==", memberId)),
    (items) => { state.milestones = items.sort(sortMilestones); renderFromData(); }
  );
  subscribeQuery(
    query(collection(db, "careerUpdates"), where("teamMemberId", "==", memberId)),
    (items) => { state.careerUpdates = items.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)); renderFromData(); }
  );
  subscribeQuery(
    query(collection(db, "memberSharedSummaries"), where("teamMemberId", "==", memberId)),
    (items) => {
      state.sharedSummaries = items.sort((a, b) => dateValue(b.meetingDate) - dateValue(a.meetingDate));
      renderFromData();
    }
  );
  subscribeQuery(
    query(collection(db, "memberCareerPlanEvents"), where("teamMemberId", "==", memberId)),
    (items) => {
      state.planEvents = items.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
      renderFromData();
    }
  );
  state.unsubscribers.push(onSnapshot(collection(db, "roadmapForms"), (snapshot) => {
    state.forms = Object.fromEntries(snapshot.docs.map((item) => [item.data().version || item.id, item.data()]));
    renderFromData();
  }, dataError));
}

function subscribeDoc(collectionName, id, setter) {
  state.unsubscribers.push(onSnapshot(doc(db, collectionName, id), (snapshot) => {
    setter(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  }, dataError));
}

function subscribeQuery(reference, setter) {
  state.unsubscribers.push(onSnapshot(reference, (snapshot) => setter(snapshot.docs.map(fromDoc)), dataError));
}

function cleanupSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function resetMemberState(clearSelection = true) {
  if (clearSelection) state.selectedMemberId = "";
  state.member = null;
  state.portalProfile = null;
  state.careerPlan = null;
  state.careerPlanVersion = "";
  state.planDraft = null;
  state.planDirty = false;
  state.remotePlanPending = false;
  state.submissions = [];
  state.milestones = [];
  state.careerUpdates = [];
  state.sharedSummaries = [];
  state.planEvents = [];
  state.forms = {};
}

function dataError(error) {
  state.loadError = friendlyError(error);
  renderFromData();
}

function renderFromData() {
  if (state.planDirty && state.tab === "mandate" && document.querySelector("#careerPlanForm")) return;
  renderPortal();
}

function renderLogin() {
  appRoot.innerHTML = accessPanel(
    "Portail CFSB",
    "Mon parcours",
    "Connecte-toi avec le compte Google autorise par Michael ou Gabriel.",
    `<button class="button primary" id="loginButton" type="button"><i data-lucide="log-in"></i> Connexion Google</button>`
  );
  document.querySelector("#loginButton")?.addEventListener("click", login);
  refreshIcons();
}

function renderPendingAccess(user) {
  appRoot.innerHTML = accessPanel(
    "Activation requise",
    "Ton espace n'est pas encore ouvert",
    "Ton compte Google est reconnu, mais il n'est associe a aucun dossier membre actif.",
    `<div class="access-detail"><strong>Compte utilise</strong><br>${escapeHtml(user.email || "Sans courriel")}<br><br>Michael ou Gabriel peut inscrire ce courriel dans ton dossier depuis le Dashboard Equipe.</div><button class="button" id="logoutButton" type="button"><i data-lucide="log-out"></i> Changer de compte</button>`
  );
  document.querySelector("#logoutButton")?.addEventListener("click", () => signOut(auth));
  refreshIcons();
}

function renderAccessDenied(message) {
  appRoot.innerHTML = accessPanel(
    "Acces non disponible",
    "Mon parcours CFSB",
    message,
    `<button class="button" id="logoutButton" type="button"><i data-lucide="log-out"></i> Changer de compte</button>`
  );
  document.querySelector("#logoutButton")?.addEventListener("click", () => signOut(auth));
  refreshIcons();
}

function accessPanel(eyebrow, title, message, actions) {
  return `<main class="access-shell"><section class="access-panel"><span class="brand-mark">CF</span><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${actions}</section></main>`;
}

async function login() {
  const button = document.querySelector("#loginButton");
  if (button) button.disabled = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    showToast(`Connexion impossible: ${friendlyError(error)}`, "error");
    if (button) button.disabled = false;
  }
}

function renderLoading() {
  appRoot.innerHTML = accessPanel("Portail CFSB", "Ouverture du dossier", "Chargement des roadmaps et du parcours...", "");
  refreshIcons();
}

function renderPortal() {
  if (!state.user || !state.profile) return;
  if (!state.member) {
    renderLoading();
    return;
  }
  const member = state.member;
  const coachId = coachIdForMember(member);
  const coachUrl = coachId ? `${COACH_DASHBOARD_URL}?coach=${encodeURIComponent(coachId)}` : "";
  appRoot.innerHTML = `
    <div class="portal-shell">
      <header class="portal-topbar">
        <div class="portal-brand"><span class="brand-mark">CF</span><span><strong>Mon parcours CFSB</strong><small>${escapeHtml(member.name || "Membre CFSB")} · ${PORTAL_CONTRACT_VERSION}</small></span></div>
        <div class="top-actions">
          ${coachUrl ? `<a class="tool-link" href="${escapeAttr(coachUrl)}" target="_blank" rel="noopener" title="Ouvrir le Dashboard Coach"><i data-lucide="dumbbell"></i><span>Dashboard Coach</span></a>` : ""}
          ${state.ownerMode ? `<a class="tool-link" href="./?member=${encodeURIComponent(member.id)}" title="Retour au Dashboard Equipe"><i data-lucide="layout-dashboard"></i><span>Dashboard Equipe</span></a>` : ""}
          <button class="button icon-only" id="logoutButton" type="button" title="Deconnexion" aria-label="Deconnexion"><i data-lucide="log-out"></i></button>
        </div>
      </header>
      <main class="portal-main">
        ${state.ownerMode ? renderOwnerPreview() : ""}
        <section class="member-hero">
          <div><p class="eyebrow">${state.ownerMode ? "Apercu du portail membre" : "Ton dossier professionnel"}</p><h1>${escapeHtml(member.name || "Mon parcours")}</h1><p>${escapeHtml(member.displayTitle || "Role a preciser")}${member.careerTarget ? ` · Direction visee: ${escapeHtml(member.careerTarget)}` : ""}</p></div>
          <aside class="hero-status"><small>Priorite actuelle</small><strong>${escapeHtml(planValue("ninetyDayFocus") || "A definir ensemble")}</strong></aside>
        </section>
        <nav class="portal-tabs" aria-label="Sections de Mon parcours">
          ${[["overview", "Vue d'ensemble"], ["mandate", "Mon mandat"], ["roadmaps", `Roadmaps (${state.submissions.length})`], ["career", `Parcours (${activeMilestones().length})`], ["meetings", `Rencontres (${state.sharedSummaries.length})`]].map(([id, label]) => `<button class="${state.tab === id ? "active" : ""}" data-portal-tab="${id}" type="button">${escapeHtml(label)}</button>`).join("")}
        </nav>
        ${state.loadError ? `<div class="access-detail">${escapeHtml(state.loadError)}</div>` : ""}
        <section class="portal-content">${renderActiveTab()}</section>
      </main>
    </div>
  `;
  bindPortalEvents();
  refreshIcons();
}

function renderOwnerPreview() {
  return `
    <aside class="owner-preview">
      <div><strong>Mode apercu owner</strong><small>Tu vois exactement l'espace partage avec le membre. Les notes internes n'apparaissent pas ici.</small></div>
      <label class="field">Membre<select id="ownerMemberSelect">${state.ownerRoster.map((member) => `<option value="${escapeAttr(member.id)}" ${member.id === state.selectedMemberId ? "selected" : ""}>${escapeHtml(member.name || member.id)}${member.active === false ? " · archive" : ""}</option>`).join("")}</select></label>
    </aside>
  `;
}

function renderActiveTab() {
  if (state.tab === "mandate") return renderMandate();
  if (state.tab === "roadmaps") return renderRoadmaps();
  if (state.tab === "career") return renderCareer();
  if (state.tab === "meetings") return renderSharedMeetings();
  return renderOverview();
}

function renderOverview() {
  const nextMilestone = activeMilestones()[0] || null;
  const latestSummary = state.sharedSummaries[0] || null;
  const coachId = coachIdForMember(state.member);
  const documentUrl = safeExternalUrl(state.portalProfile?.roadmapDocumentUrl);
  return `
    <div class="overview-grid">
      <article class="panel wide">
        <div class="focus-block"><small>Mandat des 90 prochains jours</small><h2>${escapeHtml(planValue("ninetyDayFocus") || "Construire le prochain chapitre")}</h2><p class="${planValue("commitments") ? "" : "focus-placeholder"}">${escapeHtml(planValue("commitments") || "Le mandat sera defini avec Michael ou Gabriel dans l'onglet Mon mandat.")}</p></div>
        <div class="metric-strip">
          <div><strong>${state.submissions.length}</strong><small>Roadmaps au dossier</small></div>
          <div><strong>${activeMilestones().length}</strong><small>Etapes actives</small></div>
          <div><strong>${state.sharedSummaries.length}</strong><small>Comptes rendus partages</small></div>
          <div><strong>${completionAverage()}%</strong><small>Completion moyenne</small></div>
        </div>
      </article>
      <article class="panel">
        <div class="section-heading"><div><h2>Prochaine etape</h2><p>Le prochain repere concret dans ton parcours.</p></div><span class="count-badge">${activeMilestones().length}</span></div>
        ${nextMilestone ? `<div class="focus-block"><small>${escapeHtml(STATUS_LABELS[nextMilestone.status] || "A suivre")}</small><h2>${escapeHtml(nextMilestone.title || "Etape")}</h2><p>${escapeHtml(nextMilestone.description || nextMilestone.successCriteria || "")}</p></div>` : emptyState("route", "Aucune etape partagee", "Le mandat peut servir a definir la prochaine cible.")}
      </article>
      <article class="panel">
        <div class="section-heading"><div><h2>Derniere rencontre partagee</h2><p>Seulement le compte rendu choisi par la direction.</p></div></div>
        ${latestSummary ? `<div class="focus-block"><small>${formatDate(latestSummary.meetingDate)}</small><h2>${escapeHtml(latestSummary.headline || "Compte rendu")}</h2><p>${escapeHtml(latestSummary.summary || latestSummary.commitments || "")}</p></div>` : emptyState("lock-keyhole", "Aucun compte rendu partage", "Les notes de gestion demeurent privees.")}
      </article>
      <article class="panel wide">
        <div class="section-heading"><div><h2>Documents et outils</h2><p>Les applications restent independantes, mais les bons raccourcis vivent ici.</p></div></div>
        <div class="resource-list">
          ${documentUrl ? resourceLink(documentUrl, "file-text", "Document Roadmap Drive", "Prendre des notes dans le document partage", true) : resourceUnavailable("file-text", "Document Roadmap Drive", "Le lien n'est pas encore configure par un owner.")}
          ${memberHasRevenueTool(state.member) ? resourceLink(`./revenue.html?member=${encodeURIComponent(state.member.id)}&portal=1`, "calculator", "Projection de revenus", "Construire et sauvegarder tes propres scenarios", false) : ""}
          ${coachId ? resourceLink(`${COACH_DASHBOARD_URL}?coach=${encodeURIComponent(coachId)}`, "dumbbell", "Dashboard Coach", "Clients, suivis et travail operationnel", true) : ""}
        </div>
      </article>
    </div>
  `;
}

function renderMandate() {
  const plan = state.planDraft || state.careerPlan || {};
  return `
    <div class="mandate-layout">
      <article class="panel">
        <div class="section-heading"><div><h2>Mandat de carriere</h2><p>Une direction commune, des engagements concrets et une mesure simple de progression.</p></div></div>
        <form class="mandate-form" id="careerPlanForm">
          <label class="field">Role ou direction visee<input name="roleGoal" value="${escapeAttr(plan.roleGoal || state.member.careerTarget || "")}" placeholder="Ex.: Coach professionnel autonome"></label>
          <label class="field">Vision dans un an<input name="visionOneYear" value="${escapeAttr(plan.visionOneYear || "")}" placeholder="Ce que tu aimerais avoir construit"></label>
          <label class="field field-wide">Priorite des 90 prochains jours<textarea name="ninetyDayFocus" placeholder="Un seul axe prioritaire...">${escapeHtml(plan.ninetyDayFocus || "")}</textarea></label>
          <label class="field field-wide">Tes engagements<textarea name="commitments" placeholder="Les actions que tu prends en charge...">${escapeHtml(plan.commitments || "")}</textarea></label>
          <label class="field">Mesures de reussite<textarea name="successMeasures" placeholder="Comment saurons-nous que ca avance?">${escapeHtml(plan.successMeasures || "")}</textarea></label>
          <label class="field">Soutien attendu<textarea name="supportNeeded" placeholder="Feedback, formation, budget, temps protege...">${escapeHtml(plan.supportNeeded || "")}</textarea></label>
          <label class="field">Competences a developper<textarea name="skillsToDevelop" placeholder="Coaching, vente, programmation, leadership...">${escapeHtml(plan.skillsToDevelop || "")}</textarea></label>
          <label class="field">Formations et certifications<textarea name="certifications" placeholder="CF-L2, specialite, formation interne...">${escapeHtml(plan.certifications || "")}</textarea></label>
          <div class="form-actions"><button class="button primary" type="submit"><i data-lucide="save"></i> Enregistrer le mandat</button><span class="save-status ${state.planDirty ? "dirty" : "saved"}" id="planSaveStatus">${state.planDirty ? "Modifications non enregistrees" : state.careerPlan ? `Mis a jour ${formatRelativeDate(state.careerPlan.updatedAt)}` : "Nouveau mandat"}</span></div>
        </form>
      </article>
      <aside class="panel">
        <div class="section-heading"><div><h3>Historique</h3><p>Chaque sauvegarde laisse une trace.</p></div><span class="count-badge">${state.planEvents.length}</span></div>
        ${state.planEvents.length ? `<div class="history-list">${state.planEvents.slice(0, 12).map((event) => `<article class="history-item"><strong>${escapeHtml(event.summary || "Mandat mis a jour")}</strong><p>${escapeHtml((event.changedFields || []).map(humanize).join(", ") || "Mise a jour generale")}</p><small>${formatDate(event.createdAt)} · ${escapeHtml(event.createdByName || "Membre CFSB")}</small></article>`).join("")}</div>` : emptyState("history", "Aucune mise a jour", "La premiere sauvegarde commencera l'historique.")}
      </aside>
    </div>
  `;
}

function renderRoadmaps() {
  return `
    <article class="panel">
      <div class="section-heading"><div><h2>Mes roadmaps</h2><p>Retrouve les reponses que tu as partagees au fil des trimestres.</p></div><span class="count-badge">${state.submissions.length}</span></div>
      ${state.submissions.length ? `<div class="roadmap-list">${state.submissions.map(renderRoadmapItem).join("")}</div>` : emptyState("clipboard-list", "Aucune roadmap associee", "Le prochain formulaire apparaitra ici lorsqu'il sera relie a ton dossier.")}
    </article>
  `;
}

function renderRoadmapItem(submission) {
  const completion = completionInfo(submission);
  const answers = Object.entries(submission.answers || {}).filter(([, value]) => !isEmpty(value));
  const index = questionIndex(submission);
  return `
    <details class="roadmap-item">
      <summary><span>${formatDate(submission.submittedAt)}</span><strong>${escapeHtml(submission.cycleId || submission.selectedRoleLabel || "Roadmap")}</strong><span class="progress-pill">${completion.percent}%</span><i data-lucide="chevron-down"></i></summary>
      <div class="roadmap-answers">${answers.length ? answers.map(([id, answer]) => `<div class="answer-row"><strong>${escapeHtml(index[id]?.label || humanize(id))}</strong><p>${escapeHtml(formatAnswer(answer))}</p></div>`).join("") : `<p class="focus-placeholder">Aucune reponse lisible dans cette soumission.</p>`}</div>
    </details>
  `;
}

function renderCareer() {
  const milestones = state.milestones.filter((item) => !item.archivedAt);
  return `
    <article class="panel">
      <div class="section-heading"><div><h2>Parcours CFSB</h2><p>Les etapes de role, competence, certification et leadership suivies avec la direction.</p></div><span class="count-badge">${milestones.length}</span></div>
      ${milestones.length ? `<div class="milestone-list">${milestones.map((milestone) => `<article class="milestone-item ${escapeAttr(milestone.status || "planned")}"><span class="milestone-dot"></span><small>${milestone.targetDate ? formatDate(milestone.targetDate) : STATUS_LABELS[milestone.status] || "A suivre"}</small><div class="milestone-main"><strong>${escapeHtml(milestone.title || "Etape")}</strong><small>${escapeHtml(milestone.description || milestone.successCriteria || "")}</small></div><span class="milestone-progress">${clamp(milestone.progress)}%</span></article>`).join("")}</div>` : emptyState("route", "Aucune etape partagee", "Le mandat de carriere peut servir a creer la premiere cible.")}
    </article>
  `;
}

function renderSharedMeetings() {
  return `
    <article class="panel">
      <div class="section-heading"><div><h2>Comptes rendus partages</h2><p>Les decisions et engagements que Michael ou Gabriel ont choisi de rendre visibles.</p></div><span class="count-badge">${state.sharedSummaries.length}</span></div>
      <div class="privacy-note"><i data-lucide="shield-check"></i>Les notes de gestion internes et les brouillons de rencontre ne sont jamais affiches dans cet espace.</div>
      ${state.sharedSummaries.length ? `<div class="summary-list">${state.sharedSummaries.map((summary) => `<article class="summary-item"><div class="summary-meta"><strong>${escapeHtml(summary.headline || "Compte rendu")}</strong><span>${formatDate(summary.meetingDate || summary.publishedAt)} · ${escapeHtml(summary.publishedByName || "Direction CFSB")}</span></div><div class="summary-copy">${summary.summary ? `<div><small>Resume</small><p>${escapeHtml(summary.summary)}</p></div>` : ""}${summary.commitments ? `<div><small>Engagements</small><p>${escapeHtml(summary.commitments)}</p></div>` : ""}${summary.ownerSupport ? `<div><small>Soutien de la direction</small><p>${escapeHtml(summary.ownerSupport)}</p></div>` : ""}</div></article>`).join("")}</div>` : emptyState("messages-square", "Aucun compte rendu partage", "Une rencontre peut rester entierement privee tant qu'aucun resume n'est publie.")}
    </article>
  `;
}

function bindPortalEvents() {
  document.querySelector("#logoutButton")?.addEventListener("click", () => signOut(auth));
  document.querySelectorAll("[data-portal-tab]").forEach((button) => button.addEventListener("click", () => {
    if (state.tab === "mandate" && state.planDirty) capturePlanDraft();
    state.tab = button.dataset.portalTab;
    renderPortal();
  }));
  document.querySelector("#ownerMemberSelect")?.addEventListener("change", (event) => {
    if (state.planDirty && !window.confirm("Changer de membre sans enregistrer les modifications du mandat?")) {
      event.target.value = state.selectedMemberId;
      return;
    }
    state.selectedMemberId = event.target.value;
    state.tab = "overview";
    window.history.replaceState({}, "", `./portal.html?member=${encodeURIComponent(state.selectedMemberId)}`);
    subscribeMemberData();
  });
  document.querySelector("#careerPlanForm")?.addEventListener("input", markPlanDirty);
  document.querySelector("#careerPlanForm")?.addEventListener("submit", saveCareerPlan);
}

function markPlanDirty() {
  state.planDirty = true;
  capturePlanDraft();
  const status = document.querySelector("#planSaveStatus");
  if (status) {
    status.textContent = "Modifications non enregistrees";
    status.className = "save-status dirty";
  }
}

function capturePlanDraft() {
  const form = document.querySelector("#careerPlanForm");
  if (!form) return;
  state.planDraft = planPayloadFromForm(new FormData(form));
}

async function saveCareerPlan(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const draft = planPayloadFromForm(data);
  const changedFields = Object.keys(draft).filter((key) => String(draft[key] || "") !== String(state.careerPlan?.[key] || ""));
  if (!changedFields.length && state.careerPlan) {
    state.planDirty = false;
    state.planDraft = null;
    renderPortal();
    return;
  }
  const saveButton = event.currentTarget.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  setPlanStatus("Enregistrement en cours...", "dirty");
  const planRef = doc(db, "memberCareerPlans", state.selectedMemberId);
  const eventRef = doc(collection(db, "memberCareerPlanEvents"));
  const auditRef = doc(collection(db, "auditLogs"));
  const actor = actorName();
  try {
    await runTransaction(db, async (transaction) => {
      const latest = await transaction.get(planRef);
      const latestVersion = versionToken(latest.data()?.updatedAt);
      if (latest.exists() && latestVersion !== state.careerPlanVersion) throw new Error("plan_conflict");
      const planPayload = {
        ...draft,
        teamMemberId: state.selectedMemberId,
        teamMemberName: state.member.name || "",
        portalContractVersion: PORTAL_CONTRACT_VERSION,
        updatedAt: serverTimestamp(),
        updatedByUid: state.user.uid,
        updatedByName: actor
      };
      if (!latest.exists()) {
        planPayload.createdAt = serverTimestamp();
        planPayload.createdByUid = state.user.uid;
        planPayload.createdByName = actor;
      }
      transaction.set(planRef, planPayload, { merge: true });
      transaction.set(eventRef, {
        teamMemberId: state.selectedMemberId,
        summary: latest.exists() ? "Mandat de carriere mis a jour" : "Mandat de carriere cree",
        changedFields,
        createdAt: serverTimestamp(),
        createdByUid: state.user.uid,
        createdByName: actor
      });
      transaction.set(auditRef, {
        actorUid: state.user.uid,
        actorName: actor,
        action: "member_career_plan_saved",
        entityType: "memberCareerPlan",
        entityId: state.selectedMemberId,
        details: { teamMemberId: state.selectedMemberId, changedFields },
        createdAt: serverTimestamp()
      });
    });
    state.planDirty = false;
    state.planDraft = null;
    state.remotePlanPending = false;
    setPlanStatus("Mandat enregistre", "saved");
    showToast("Mandat de carriere enregistre.");
  } catch (error) {
    if (String(error.message || error).includes("plan_conflict")) {
      setPlanStatus("Une autre mise a jour a ete enregistree. Recharge avant de continuer.", "error");
      showToast("Conflit detecte: le mandat a change dans une autre session.", "error");
    } else {
      setPlanStatus(`Erreur: ${friendlyError(error)}`, "error");
      showToast(`Mandat non enregistre: ${friendlyError(error)}`, "error");
    }
  } finally {
    saveButton.disabled = false;
  }
}

function planPayloadFromForm(data) {
  return {
    roleGoal: String(data.get("roleGoal") || "").trim(),
    visionOneYear: String(data.get("visionOneYear") || "").trim(),
    ninetyDayFocus: String(data.get("ninetyDayFocus") || "").trim(),
    commitments: String(data.get("commitments") || "").trim(),
    successMeasures: String(data.get("successMeasures") || "").trim(),
    supportNeeded: String(data.get("supportNeeded") || "").trim(),
    skillsToDevelop: String(data.get("skillsToDevelop") || "").trim(),
    certifications: String(data.get("certifications") || "").trim()
  };
}

function setPlanStatus(message, tone) {
  const status = document.querySelector("#planSaveStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `save-status ${tone || ""}`;
}

function planValue(key) {
  return (state.planDraft || state.careerPlan || {})[key] || "";
}

function activeMilestones() {
  return state.milestones.filter((item) => !item.archivedAt && ["planned", "in_progress", "blocked"].includes(item.status));
}

function coachIdForMember(member) {
  return String(state.portalProfile?.coachDashboardId || COACH_ID_BY_MEMBER[member?.id] || "");
}

function memberHasRevenueTool(member) {
  const roleText = [member?.departmentId, member?.displayTitle, ...(member?.roleIds || [])]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return ["coach", "coaching", "entraineur"].some((term) => roleText.includes(term));
}

function completionAverage() {
  if (!state.submissions.length) return 0;
  return Math.round(state.submissions.reduce((sum, submission) => sum + completionInfo(submission).percent, 0) / state.submissions.length);
}

function completionInfo(submission) {
  const answers = submission.answers || {};
  const questionIds = Object.keys(questionIndex(submission));
  const candidates = questionIds.length ? questionIds : Object.keys(answers);
  const total = candidates.length || Object.keys(answers).length || 0;
  const answered = candidates.filter((id) => !isEmpty(answers[id])).length;
  const explicit = submission.completion;
  let explicitPercent = null;
  if (typeof explicit === "number") explicitPercent = explicit <= 1 ? explicit * 100 : explicit;
  if (explicit && typeof explicit === "object") explicitPercent = Number(explicit.percent ?? explicit.percentage ?? explicit.ratio * 100);
  const percent = Number.isFinite(explicitPercent) ? clamp(explicitPercent) : total ? Math.round((answered / total) * 100) : 0;
  return { answered, total, percent };
}

function questionIndex(submission) {
  const form = state.forms[submission.formVersion] || Object.values(state.forms)[0];
  const config = form?.config || {};
  const role = (config.roles || []).find((item) => item.id === submission.selectedRoleId);
  const moduleIds = role?.moduleIds || (config.modules || []).map((item) => item.id);
  const result = {};
  (config.modules || []).filter((module) => moduleIds.includes(module.id)).forEach((module) => {
    (module.questions || []).forEach((question) => addQuestionMeta(result, question));
    (module.groups || []).forEach((group) => (group.questions || []).forEach((question) => addQuestionMeta(result, question)));
  });
  return result;
}

function addQuestionMeta(target, question) {
  if (question?.id && question?.label) target[question.id] = { label: question.label };
}

function resourceLink(url, icon, title, description, external) {
  return `<a class="resource-link" href="${escapeAttr(url)}" ${external ? 'target="_blank" rel="noopener"' : ""}><span class="resource-icon"><i data-lucide="${icon}"></i></span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span><i data-lucide="${external ? "external-link" : "arrow-right"}"></i></a>`;
}

function resourceUnavailable(icon, title, description) {
  return `<div class="resource-link"><span class="resource-icon"><i data-lucide="${icon}"></i></span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span><i data-lucide="circle-minus"></i></div>`;
}

function emptyState(icon, title, description) {
  return `<div class="empty-state"><i data-lucide="${icon}"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>`;
}

function sortMilestones(a, b) {
  const rank = { in_progress: 0, blocked: 1, planned: 2, completed: 3, abandoned: 4 };
  return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || dateValue(a.targetDate) - dateValue(b.targetDate);
}

function fromDoc(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function actorName() {
  return state.profile?.displayName || state.user?.displayName || state.user?.email || "Membre CFSB";
}

function versionToken(value) {
  if (!value) return "";
  if (typeof value.toMillis === "function") return String(value.toMillis());
  if (typeof value.seconds === "number") return `${value.seconds}:${value.nanoseconds || 0}`;
  return String(dateValue(value));
}

function dateValue(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`).getTime();
  return new Date(value).getTime() || 0;
}

function formatDate(value) {
  const time = dateValue(value);
  return time ? new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(time)) : "Sans date";
}

function formatRelativeDate(value) {
  const time = dateValue(value);
  if (!time) return "recemment";
  const days = Math.max(0, Math.round((Date.now() - time) / 86400000));
  return days === 0 ? "aujourd'hui" : days === 1 ? "hier" : `il y a ${days} jours`;
}

function formatAnswer(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${humanize(key)}: ${formatAnswer(item)}`).join("\n");
  return String(value ?? "");
}

function humanize(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isEmpty(value) {
  return value == null || value === "" || (Array.isArray(value) && !value.length);
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function friendlyError(error) {
  const message = String(error?.message || error || "Erreur inconnue");
  if (message.includes("permission-denied")) return "Acces refuse par Firebase.";
  if (message.includes("failed-precondition")) return "Un index Firebase est encore en preparation.";
  if (message.includes("network")) return "Connexion reseau indisponible.";
  return message.replace(/^Firebase:\s*/i, "");
}

function showToast(message, tone = "") {
  window.clearTimeout(toastTimer);
  toastRoot.textContent = message;
  toastRoot.className = tone ? `visible ${tone}` : "visible";
  toastTimer = window.setTimeout(() => { toastRoot.className = ""; }, 3400);
}

function refreshIcons() {
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
}
