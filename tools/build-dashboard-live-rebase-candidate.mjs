import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolFile = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(toolFile), "..");
const DEFAULT_SNAPSHOT = path.join(
  defaultRepoRoot,
  "releases",
  "dashboard-hosting",
  "2026-07-19T000445Z"
);
const DEFAULT_CANDIDATE_VERSION = "20260719-phase2-live-rebase-candidate-1";
const EXPECTED_LIVE_APP_SHA256 = "6d472dd5be6f80ce5098384d6d62233d440f93485c5dd346f6bda4ad9216f3ba";
const EXPECTED_LIVE_INDEX_SHA256 = "1af651688cc435435e846a7b228140a855457280172928bfed5a8aba2211baa7";

// These are reviewed Phase 1 fail-closed templates. They are inputs, never
// deployment roots. A changed byte requires an intentional manifest update.
const TEMPLATE_FILES = Object.freeze({
  "client-command-gateway.mjs": {
    source: "firebase-dashboard/public/client-command-gateway.mjs",
    sha256: "f67424c4fe7e588244122c8e7ae35d3666759fcb483871e7902944fa0b0a614e"
  },
  "questionnaire/index.html": {
    source: "firebase-dashboard/public/questionnaire/index.html",
    sha256: "773698e1e4b77c3c723741e197c2a3c32759bcbbbbd44b141744c3bf517c83e5"
  },
  "questionnaire/questionnaire-form.css": {
    source: "firebase-dashboard/public/questionnaire/questionnaire-form.css",
    sha256: "7be8e1a0630ba76c62b94d5eedf845732c81f6e63f6f9ca94278485a132c0c0f"
  },
  "questionnaire/questionnaire-form.js": {
    source: "firebase-dashboard/public/questionnaire/questionnaire-form.js",
    sha256: "945400de477b6499b3242cadca0658cca69cb583fed760601d1899e13ae89e29"
  },
  "questionnaire/questionnaire-access.mjs": {
    source: "firebase-dashboard/public/questionnaire/questionnaire-access.mjs",
    sha256: "c6b6d7b0cca81a109ad4a6308529d17dac96382fe40d367a5029bdbcdf8497ca"
  },
  "questionnaire/questionnaire-submission.mjs": {
    source: "firebase-dashboard/public/questionnaire/questionnaire-submission.mjs",
    sha256: "53b7fb7167942d2e52af45c3ae13a95425dc8c66a2d74240f4b3ab9e85e46f59"
  },
  "questionnaire/check-in/index.html": {
    source: "firebase-dashboard/public/questionnaire/check-in/index.html",
    sha256: "dece2ed5e110b6c8377c469e7120e5e8cb61a436366c8a902945b2cbaaf2a2de"
  },
  "questionnaire/evaluation-habitudes-vie/index.html": {
    source: "firebase-dashboard/public/questionnaire/evaluation-habitudes-vie/index.html",
    sha256: "27fa481e2c3d3f3c9d3c3930c1f5ec4f4ab3cc5f0f48a0cefb964e163009ae34"
  }
});

const EXPECTED_CHANGED_LIVE_FILES = Object.freeze([
  "app.js",
  "index.html",
  "questionnaire/check-in/index.html",
  "questionnaire/evaluation-habitudes-vie/index.html",
  "questionnaire/index.html",
  "questionnaire/questionnaire-form.css",
  "questionnaire/questionnaire-form.js"
]);

const EXPECTED_NEW_FILES = Object.freeze([
  "client-command-gateway.mjs",
  "questionnaire/questionnaire-access.mjs",
  "questionnaire/questionnaire-submission.mjs"
]);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function slash(relativePath) {
  return relativePath.split(path.sep).join("/");
}

async function walkFiles(root, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, absolute));
    else if (entry.isFile()) files.push(slash(path.relative(root, absolute)));
  }
  return files.sort();
}

function parseHashManifest(text) {
  const result = new Map();
  for (const line of text.trim().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match, `Ligne de manifeste SHA-256 invalide: ${line}`);
    assert.equal(result.has(match[2]), false, `Fichier duplique dans le manifeste: ${match[2]}`);
    result.set(match[2], match[1]);
  }
  return result;
}

async function verifySnapshot(snapshotRoot) {
  const sourceRoot = path.join(snapshotRoot, "source");
  const [manifestBytes, hashBytes] = await Promise.all([
    fs.readFile(path.join(snapshotRoot, "manifest.json")),
    fs.readFile(path.join(snapshotRoot, "files.sha256"))
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const expected = parseHashManifest(hashBytes.toString("utf8"));
  assert.equal(manifest.status, "provenance_snapshot_not_approved_for_deployment");
  assert.equal(manifest.files.count, expected.size);
  assert.equal(sha256(hashBytes).toUpperCase(), manifest.files.hashManifestSha256);

  const actualFiles = await walkFiles(sourceRoot);
  assert.deepEqual(actualFiles, [...expected.keys()].sort(), "La liste de fichiers du snapshot live a change.");
  for (const [relative, expectedHash] of expected) {
    const actualHash = sha256(await fs.readFile(path.join(sourceRoot, ...relative.split("/"))));
    assert.equal(actualHash, expectedHash, `Preimage live inattendue: ${relative}`);
  }
  assert.equal(expected.get("app.js"), EXPECTED_LIVE_APP_SHA256);
  assert.equal(expected.get("index.html"), EXPECTED_LIVE_INDEX_SHA256);
  return { manifest, expected, sourceRoot };
}

async function verifyTemplateInputs(repoRoot) {
  const buffers = new Map();
  for (const [destination, template] of Object.entries(TEMPLATE_FILES)) {
    const absolute = path.join(repoRoot, ...template.source.split("/"));
    const bytes = await fs.readFile(absolute);
    assert.equal(sha256(bytes), template.sha256, `Template Phase 1 inattendu: ${template.source}`);
    buffers.set(destination, bytes);
  }
  return buffers;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flexibleLiteralRegex(value) {
  return new RegExp(escapeRegExp(value).replace(/\\\n/g, "\\r?\\n"), "g");
}

function replaceOnce(source, before, after, label) {
  const regex = flexibleLiteralRegex(before);
  const matches = [...source.matchAll(regex)];
  assert.equal(matches.length, 1, `Transformation ${label}: preimage attendue exactement une fois (${matches.length}).`);
  const newline = matches[0][0].includes("\r\n") ? "\r\n" : "\n";
  return source.replace(regex, after.replace(/\n/g, newline));
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Transformation ${label}: debut introuvable.`);
  assert.equal(source.indexOf(startMarker, start + startMarker.length), -1, `Transformation ${label}: debut ambigu.`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Transformation ${label}: fin introuvable.`);
  const newline = source.slice(start, end).includes("\r\n") ? "\r\n" : "\n";
  return source.slice(0, start) + replacement.replace(/\n/g, newline) + source.slice(end);
}

function applyAppTransforms(liveSource, candidateVersion) {
  let source = liveSource;
  source = replaceOnce(source,
    `} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";\nconst COMPATIBLE_AUTH_URL`,
    `} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";\nimport { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-functions.js";\nimport { buildQuestionnaireAccessUrl } from "./questionnaire/questionnaire-access.mjs";\nimport { createClientCommandGateway, isCanonicalClientRecord } from "./client-command-gateway.mjs";\nconst COMPATIBLE_AUTH_URL`,
    "imports contractuels");

  source = replaceOnce(source,
    `const storage = getStorage(firebaseApp);\nconst provider = new GoogleAuthProvider();`,
    `const storage = getStorage(firebaseApp);\nconst functions = getFunctions(firebaseApp, "us-central1");\nconst clientCommandGateway = createClientCommandGateway({\n  invoke: async (commandName, payload) => {\n    const callable = httpsCallable(functions, commandName);\n    const result = await callable(payload);\n    return result?.data;\n  }\n});\nconst provider = new GoogleAuthProvider();`,
    "initialisation gateway");

  source = replaceOnce(source,
    `const APP_VERSION = "20260718-questionnaire-phone-extension-068";`,
    `const APP_VERSION = "${candidateVersion}";`,
    "version candidate");

  source = replaceBetween(source,
    "function subscribeCollection(collectionName, coachId, setter, { rejectedSetter = null } = {}) {",
    "function canonicalCoachId(coach = {}) {",
    `function subscribeCollection(collectionName, coachId, setter, { rejectedSetter = null } = {}) {
  const criteria = coachSubscriptionCriteria(coachId, collectionName);
  const snapshots = new Map();
  const initialized = new Set();
  const apply = () => {
    const merged = new Map();
    const rejected = new Map();
    snapshots.forEach((items) => {
      items.forEach((item) => {
        if (!firestoreItemBelongsToCoach(item, coachId)) {
          if (rejectedSetter) rejected.set(item.id, item);
          return;
        }
        merged.set(item.id, item);
      });
    });
    setter([...merged.values()]);
    if (rejectedSetter) rejectedSetter([...rejected.values()]);
    state.data.loaded[collectionName] = initialized.size >= criteria.length;
    scheduleRender();
  };

  criteria.forEach(({ field, value, optionalLegacy = false }) => {
    const key = \`${"${field}:${value}"}\`;
    state.unsubscribers.push(onSnapshot(
      query(collection(db, collectionName), where(field, "==", value)),
      (snap) => {
        initialized.add(key);
        snapshots.set(key, snap.docs.map(fromDoc));
        apply();
      },
      (error) => {
        initialized.add(key);
        snapshots.set(key, []);
        state.data.loaded[collectionName] = initialized.size >= criteria.length;
        const permissionDenied = ["permission-denied", "firestore/permission-denied"].includes(error?.code);
        if (optionalLegacy && permissionDenied) {
          console.info(\`Lecture legacy ignoree pour ${"${collectionName}/${field}"}; la lecture canonique reste active.\`, error?.code || "erreur");
          apply();
        } else {
          apply();
          showDataError(\`${"${collectionName}/${field}"}\`, error);
        }
      }
    ));
  });
}

`, "double lecture clients");

  source = replaceBetween(source,
    "function resolveFirestoreItemCoachId(item = {}) {",
    "function firestoreItemBelongsToCoach(item = {}, coachId) {",
    `function resolveFirestoreItemCoachId(item = {}) {
  const canonicalSignal = String(item.dashboardResponsibleCoachId || "").trim();
  if (canonicalSignal) return coachIdFromFirestoreIdSignal(canonicalSignal);

  const idSignals = uniqueClean([item.coachId, item.coachRxId, item.assignedCoachId]);
  if (idSignals.length) {
    const resolvedIds = idSignals.map(coachIdFromFirestoreIdSignal);
    if (resolvedIds.some((id) => !id)) return "";
    const uniqueIds = uniqueClean(resolvedIds);
    return uniqueIds.length === 1 ? uniqueIds[0] : "";
  }

  const nameSignals = uniqueClean([item.coachName, item.assignedCoachName]);
  if (!nameSignals.length) return "";
  const resolvedNames = nameSignals.map(coachIdFromFirestoreNameSignal);
  if (resolvedNames.some((id) => !id)) return "";
  const uniqueNames = uniqueClean(resolvedNames);
  return uniqueNames.length === 1 ? uniqueNames[0] : "";
}

`, "priorite responsable canonique");

  source = replaceBetween(source,
    "function coachSubscriptionCriteria(coachId) {",
    "function coachRecordById(coachId) {",
    `const CANONICAL_COACH_SCOPED_COLLECTIONS = new Set([
  "clients",
  "tasks",
  "questionnaireResponses",
  "questionnaireSends",
  "questionnaireSchedules",
  "rebookings",
  "checkups",
  "impacts",
  "alumni"
]);

function coachSubscriptionCriteria(coachId, collectionName = "") {
  const canonicalCoachScoped = CANONICAL_COACH_SCOPED_COLLECTIONS.has(collectionName);
  if (!isInfoAdmin()) {
    const targetCoachId = String(coachId || state.profile?.coachId || "").trim();
    if (canonicalCoachScoped) {
      return uniqueCriteria([
        { field: "dashboardResponsibleCoachId", value: targetCoachId }
      ]);
    }
    return uniqueCriteria([{ field: "coachId", value: targetCoachId }]);
  }
  const coach = coachRecordById(coachId);
  if (!coach) {
    return uniqueCriteria(canonicalCoachScoped
      ? [
          { field: "dashboardResponsibleCoachId", value: coachId },
          { field: "coachId", value: coachId, optionalLegacy: true }
        ]
      : [{ field: "coachId", value: coachId }]);
  }
  const idValues = uniqueClean([coach.id, coach.coachRxId]);
  const idCriteriaValues = uniqueClean(idValues.flatMap(firestoreIdVariants));
  const nameValues = coachNameValues(coach).slice(0, 5);
  return uniqueCriteria([
    ...(canonicalCoachScoped
      ? idCriteriaValues.map((value) => ({ field: "dashboardResponsibleCoachId", value }))
      : []),
    ...idCriteriaValues.map((value) => ({ field: "coachId", value, optionalLegacy: canonicalCoachScoped })),
    ...idCriteriaValues.map((value) => ({ field: "coachRxId", value, optionalLegacy: canonicalCoachScoped })),
    ...idCriteriaValues.map((value) => ({ field: "assignedCoachId", value, optionalLegacy: canonicalCoachScoped })),
    ...nameValues.map((value) => ({ field: "coachName", value, optionalLegacy: canonicalCoachScoped })),
    ...nameValues.map((value) => ({ field: "assignedCoachName", value, optionalLegacy: canonicalCoachScoped }))
  ]);
}

`, "criteres canoniques et legacy controles");

  source = replaceBetween(source,
    "function renderClientFormModal() {",
    "function renderQuickNoteModal() {",
    `function renderClientFormModal() {
  return modal("Ajouter un client Dashboard", \`
    <form class="modal-form" data-form="clientCreate">
      <div class="notice compact">
        La fiche sera creee avec une identite interne unique. Elle peut rester Dashboard/GHL seulement et etre liee a CoachRx plus tard.
      </div>
      <div class="form-grid">
        <label>Nom<input class="input" name="name" minlength="2" required></label>
        <label>Telephone<input class="input" name="phoneNormalized" placeholder="8192771825" required></label>
        <label>Courriel<input class="input" name="email" type="email"></label>
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit">Creer la fiche</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  \`);
}

`, "formulaire creation canonique");

  source = replaceBetween(source,
    "async function saveClient(id, data) {",
    "async function saveClientTrainingTarget(id, data) {",
    `function dashboardTransferResponsibilityMode(client = {}, targetCoachId = "", explicitMode = "") {
  const coachRxLink = client.coachRxLink;
  const hasActiveVerifiedCoachRxLink = coachRxLink?.linkStatus === "verified"
    && coachRxLink?.rosterStatus === "active";
  const requestedMode = String(explicitMode || "").trim();
  const targetId = String(targetCoachId || "").trim();

  if (!hasActiveVerifiedCoachRxLink) {
    if (requestedMode && requestedMode !== "dashboard_only") {
      throw new Error("Sans lien CoachRx actif et verifie, le mode doit rester dashboard_only.");
    }
    return "dashboard_only";
  }

  const coachRxOwnerId = String(client.coachRxOwnerId || "").trim();
  if (!coachRxOwnerId) {
    throw new Error("Le lien CoachRx actif est incomplet: coachRxOwnerId est requis.");
  }
  const mode = requestedMode
    || (coachRxOwnerId === targetId ? "follow_coachrx" : "manual_override");
  if (!["follow_coachrx", "manual_override"].includes(mode)) {
    throw new Error("Un client CoachRx actif exige follow_coachrx ou manual_override.");
  }
  if (mode === "follow_coachrx" && coachRxOwnerId !== targetId) {
    throw new Error("follow_coachrx exige que le responsable Dashboard corresponde au coach CoachRx.");
  }
  return mode;
}

async function saveClient(id, data) {
  const currentClient = requireOperationalClientForCoach(id);
  if (!isCanonicalClientRecord(currentClient)) {
    throw new Error("Cette fiche historique doit etre migree avant toute modification. Aucune donnee n'a ete ecrite.");
  }
  const currentCoachId = String(currentClient.dashboardResponsibleCoachId || currentClient.coachId || state.selectedCoachId || "");
  const requestedCoachId = String(data.coachId || currentCoachId);
  const fields = [
    ["nom", String(data.name || "").trim(), String(currentClient.name || "").trim()],
    ["telephone", normalizePhone(data.phoneNormalized), clientPhone(currentClient)],
    ["courriel", String(data.email || "").trim(), String(currentClient.email || "").trim()],
    ["membership", String(data.membershipLabel || "").trim(), String(currentClient.membershipLabel || "").trim()],
    ["fin membership", data.manualMembershipEndDate || "", currentClient.manualMembershipEndDate || ""],
    ["recurrence", data.kiloPlannedRecurrenceEndDate || "", currentClient.kiloPlannedRecurrenceEndDate || ""],
    ["risque", data.riskLevel || "none", currentClient.riskLevel || "none"],
    ["note risque", String(data.riskNote || "").trim(), String(currentClient.riskNote || "").trim()],
    ["notes", String(data.notes || "").trim(), String(currentClient.notes || "").trim()]
  ];
  const unsupported = fields.filter(([, next, previous]) => next !== previous).map(([label]) => label);
  if (unsupported.length) {
    throw new Error(\`Modification bloquee (${"${unsupported.join(\", \")}"}): aucune commande serveur contractuelle n'existe encore. Aucune donnee n'a ete ecrite.\`);
  }
  if (!requestedCoachId || requestedCoachId === currentCoachId) {
    throw new Error("Aucune modification contractuelle detectee. Aucune donnee n'a ete ecrite.");
  }
  const targetCoach = coachRecordById(requestedCoachId);
  if (!targetCoach?.id) throw new Error("Coach responsable invalide.");
  const responsibilityMode = dashboardTransferResponsibilityMode(
    currentClient,
    targetCoach.id,
    data.responsibilityMode
  );
  const confirmed = window.confirm(\`Transferer la responsabilite Dashboard de ${"${currentClient.name || \"ce client\"}"} a ${"${targetCoach.name || targetCoach.id}"}? Les donnees liees historiques ne seront pas deplacees automatiquement dans ce candidat.\`);
  if (!confirmed) return;
  await clientCommandGateway.assignDashboardResponsible({
    clientId: currentClient.id,
    dashboardResponsibleCoachId: targetCoach.id,
    responsibilityMode,
    reason: "Transfert confirme dans le Dashboard"
  });
  closeModal();
  showToast(\`Responsabilite Dashboard transferee a ${"${targetCoach.name || targetCoach.id}"}.\`);
}

`, "mutation client via gateway");

  source = replaceBetween(source,
    "async function createClient(data) {",
    "async function createRebooking(data) {",
    `async function createClient(data) {
  if (!state.selectedCoachId) throw new Error("Selectionne un coach avant d'ajouter un client.");
  const coach = activeCoachRecord();
  if (!coach?.id) throw new Error("Coach responsable invalide.");
  const result = await clientCommandGateway.createDashboardClient({
    name: data.name,
    phone: data.phoneNormalized,
    email: data.email,
    serviceScopes: ["lifestyle_assessment"],
    dashboardResponsibleCoachId: coach.id
  });
  closeModal();
  showToast(result.reused ? "Fiche client deja creee." : "Client Dashboard ajoute.");
}

`, "creation client via gateway");

  source = replaceBetween(source,
    "function questionnaireUrlForClient(client, type = DEFAULT_QUESTIONNAIRE_TYPE) {",
    "function renderQuestionnaireSendModal() {",
    `function questionnaireUrlForServerToken(accessToken, type = DEFAULT_QUESTIONNAIRE_TYPE) {
  const config = questionnaireTypeConfig(type);
  return buildQuestionnaireAccessUrl({
    baseUrl: QUESTIONNAIRE_BASE_URL,
    path: config.path || "/questionnaire/",
    accessToken
  });
}

`, "URL questionnaire sans PII");

  source = replaceBetween(source,
    "function renderQuestionnaireSendModal() {",
    "function renderQuestionnaireScheduleModal() {",
    `function renderQuestionnaireSendModal() {
  const selectedClientId = state.modal.clientId || "";
  const selectedQuestionnaireType = state.modal.questionnaireType || DEFAULT_QUESTIONNAIRE_TYPE;
  const clients = selectableClientsForCoach();
  const clientsMissingPhone = clients.length - clients.filter(clientPhone).length;
  return modal("Envoyer un questionnaire", \`
    <form class="modal-form" data-form="questionnaireSend">
      <label>Client
        <select class="input" name="clientId" required>
          <option value="">Selectionner...</option>
          ${"${questionnaireSendClientOptions(clients, selectedClientId)}"}
        </select>
      </label>
      <label>Questionnaire
        <select class="input" name="questionnaireType" required>
          ${"${questionnaireTypeOptions(selectedQuestionnaireType)}"}
        </select>
      </label>
      <div class="notice compact warning">
        Envoi bloque dans ce candidat: le serveur ne produit pas encore le jeton opaque avec accuse de reception.
        ${"${clientsMissingPhone ? `<br>${clientsMissingPhone} client(s) sans telephone.` : \"\"}"}
      </div>
      <div class="modal-actions">
        <button class="primary" type="submit" disabled>Envoi securise indisponible</button>
        <button class="secondary" type="button" data-action="closeModal">Annuler</button>
      </div>
    </form>
  \`);
}

`, "UI envoi questionnaire fail closed");

  source = replaceOnce(source,
    `<div class="notice compact">\n        Le serveur verifie les questionnaires dus chaque matin. Si le client repond, la reponse apparaitra dans l'inbox questionnaire comme les envois manuels.\n      </div>`,
    `<div class="notice compact warning">\n        Automatisation bloquee dans ce candidat: le serveur doit d'abord emettre un jeton opaque par envoi.\n      </div>`,
    "avertissement planification");
  source = replaceOnce(source,
    `<button class="primary" type="submit" ${"${phone ? \"\" : \"disabled\"}"}>Enregistrer automatisation</button>`,
    `<button class="primary" type="submit" disabled>Automatisation securisee indisponible</button>`,
    "bouton planification fail closed");

  source = replaceBetween(source,
    "async function journalQuestionnaireSend(clientId, questionnaireType = DEFAULT_QUESTIONNAIRE_TYPE) {",
    "async function saveQuestionnaireSchedule(clientId, data) {",
    `async function journalQuestionnaireSend(clientId, questionnaireType = DEFAULT_QUESTIONNAIRE_TYPE) {
  void clientId;
  void questionnaireType;
  throw new Error("Envoi indisponible dans ce candidat: aucun jeton opaque avec accuse serveur n'est configure. Aucune file n'a ete creee.");
}

`, "envoi questionnaire fail closed");

  source = replaceBetween(source,
    "async function saveQuestionnaireSchedule(clientId, data) {",
    "async function toggleQuestionnaireSchedule(scheduleId) {",
    `async function saveQuestionnaireSchedule(clientId, data) {
  void clientId;
  void data;
  throw new Error("Automatisation indisponible dans ce candidat: le jeton opaque par envoi n'est pas configure. Aucune planification n'a ete creee.");
}

`, "planification questionnaire fail closed");

  return source;
}

function applyIndexTransforms(liveSource, candidateVersion) {
  const oldVersion = "20260718-questionnaire-phone-extension-068";
  const occurrences = liveSource.split(oldVersion).length - 1;
  assert.equal(occurrences, 2, `index.html: deux cache-busters attendus, trouve ${occurrences}.`);
  return liveSource.split(oldVersion).join(candidateVersion);
}

function validateCandidateVersion(value) {
  const version = String(value || "").trim();
  assert.match(version, /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,95}$/, "Version candidate invalide.");
  assert.notEqual(version, "20260718-questionnaire-phone-extension-068", "La version candidate doit etre distincte du live.");
  return version;
}

function isSameOrInside(candidate, protectedPath) {
  const relative = path.relative(protectedPath, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function validateOutputPath(outputRoot, { repoRoot, snapshotRoot }) {
  const resolved = path.resolve(outputRoot);
  const protectedRoots = [
    path.resolve(snapshotRoot),
    path.resolve(repoRoot, "firebase-dashboard", "public"),
    path.resolve(repoRoot, "releases", "coachrx-extension", "v0.6.10")
  ];
  assert.equal(protectedRoots.some((root) => isSameOrInside(resolved, root)), false, "Sortie interdite: snapshot, public ou preview 0.6.10.");
  const normalized = resolved.toLowerCase().replaceAll("\\", "/");
  assert.equal(normalized.includes("2026-07-19-extension-0610-preview"), false, "Le dossier preview 0.6.10 ne peut pas servir de sortie.");
  try {
    await fs.access(resolved);
    assert.fail(`Le dossier candidat existe deja: ${resolved}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return resolved;
}

async function hashTree(root) {
  const result = {};
  for (const relative of await walkFiles(root)) {
    result[relative] = sha256(await fs.readFile(path.join(root, ...relative.split("/"))));
  }
  return result;
}

export async function buildDashboardLiveRebaseCandidate({
  repoRoot = defaultRepoRoot,
  snapshotRoot = DEFAULT_SNAPSHOT,
  outputRoot,
  candidateVersion = DEFAULT_CANDIDATE_VERSION
} = {}) {
  assert.ok(outputRoot, "--output est requis; aucune destination implicite n'est autorisee.");
  repoRoot = path.resolve(repoRoot);
  snapshotRoot = path.resolve(snapshotRoot);
  candidateVersion = validateCandidateVersion(candidateVersion);
  const output = await validateOutputPath(outputRoot, { repoRoot, snapshotRoot });
  const [{ manifest: liveManifest, expected: liveHashes, sourceRoot }, templateBuffers] = await Promise.all([
    verifySnapshot(snapshotRoot),
    verifyTemplateInputs(repoRoot)
  ]);

  const staging = `${output}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.cp(sourceRoot, path.join(staging, "source"), { recursive: true, errorOnExist: true });
    await fs.copyFile(path.join(snapshotRoot, "firebase.json"), path.join(staging, "firebase.json"));

    const candidateSource = path.join(staging, "source");
    const liveApp = await fs.readFile(path.join(candidateSource, "app.js"), "utf8");
    const liveIndex = await fs.readFile(path.join(candidateSource, "index.html"), "utf8");
    await fs.writeFile(path.join(candidateSource, "app.js"), applyAppTransforms(liveApp, candidateVersion), "utf8");
    await fs.writeFile(path.join(candidateSource, "index.html"), applyIndexTransforms(liveIndex, candidateVersion), "utf8");

    for (const [relative, bytes] of templateBuffers) {
      const destination = path.join(candidateSource, ...relative.split("/"));
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, bytes);
    }

    const candidateHashes = await hashTree(candidateSource);
    const changedLiveFiles = [...liveHashes.keys()]
      .filter((relative) => candidateHashes[relative] !== liveHashes.get(relative))
      .sort();
    const newFiles = Object.keys(candidateHashes).filter((relative) => !liveHashes.has(relative)).sort();
    assert.deepEqual(changedLiveFiles, [...EXPECTED_CHANGED_LIVE_FILES], "Le perimetre des fichiers live modifies est inattendu.");
    assert.deepEqual(newFiles, [...EXPECTED_NEW_FILES], "Le perimetre des nouveaux fichiers est inattendu.");

    const candidateManifest = {
      schemaVersion: 1,
      status: "candidate_not_approved_for_deployment",
      candidateVersion,
      generatedAt: new Date().toISOString(),
      baseSnapshot: {
        relativePath: slash(path.relative(repoRoot, snapshotRoot)),
        observedPublicationAt: liveManifest.observedPublicationAt,
        appSha256: EXPECTED_LIVE_APP_SHA256,
        fileCount: liveManifest.files.count
      },
      changedLiveFiles,
      newFiles,
      blockedPaths: [
        "canonical client profile edits other than Dashboard responsibility",
        "legacy client mutations pending canonical migration",
        "client archive/delete/reactivation without server commands",
        "questionnaire send and scheduling until opaque-token server acknowledgement exists"
      ],
      sourceFiles: candidateHashes
    };
    await fs.writeFile(path.join(staging, "candidate-manifest.json"), `${JSON.stringify(candidateManifest, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(staging, "README.md"), [
      "# Dashboard candidate — live rebase",
      "",
      "Generated from the sealed 2026-07-19T00:04:45Z live snapshot.",
      "This directory is a candidate only and is not approved for deployment.",
      "See `candidate-manifest.json` and `docs/architecture/DASHBOARD_LIVE_REBASE_CANDIDATE.md`.",
      ""
    ].join("\n"), "utf8");
    await fs.rename(staging, output);
    return { outputRoot: output, manifest: candidateManifest };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--output", "--snapshot", "--version", "--repo-root"].includes(argument)) {
      throw new Error(`Argument inconnu: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Valeur manquante pour ${argument}`);
    index += 1;
    if (argument === "--output") options.outputRoot = value;
    if (argument === "--snapshot") options.snapshotRoot = value;
    if (argument === "--version") options.candidateVersion = value;
    if (argument === "--repo-root") options.repoRoot = value;
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await buildDashboardLiveRebaseCandidate(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ ok: true, outputRoot: result.outputRoot, candidateVersion: result.manifest.candidateVersion })}\n`);
  } catch (error) {
    process.stderr.write(`REFUS: ${error?.message || error}\n`);
    process.exitCode = 1;
  }
}
