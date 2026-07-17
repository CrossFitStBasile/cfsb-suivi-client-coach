const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const registry = JSON.parse(read("firebase-dashboard/SOURCE_REGISTRY.json"));

const functionsSource = read("functions/index.js");
const appSource = read("firebase-dashboard/public/app.js");
const docs = [
  read("firebase-dashboard/SOURCE_OF_TRUTH_AUDIT.md"),
  read("firebase-dashboard/DATA_OPERATING_PLAN.md"),
  read("firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md"),
  read("firebase-dashboard/DATA_SYNC_ARCHITECTURE.md"),
  read("firebase-dashboard/DATA_MODEL.md")
].join("\n");

const checks = [];
function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

const requiredSystems = [
  "firestore",
  "firebase_functions",
  "google_sheets",
  "apps_script",
  "bob_operator",
  "coachrx",
  "gohighlevel"
];
const requiredAutomations = ["AUTO-002", "AUTO-003", "AUTO-004", "AUTO-009"];
const requiredDomains = [
  "coach_access",
  "client_identity",
  "client_phone",
  "todo",
  "questionnaire_responses",
  "questionnaire_send",
  "rebooking",
  "checkups",
  "performance_impacts",
  "alumni"
];
const publicForbidden = [
  "script.google.com/macros/s/",
  "token=",
  "AIza",
  "kemvp",
  "A5u4j9",
  "YIzLhi",
  "WbmjU",
  "yruoIK"
];

check(
  "registry has operational principle",
  registry.principle?.includes("Firestore est la base operationnelle")
    && registry.principle?.includes("Sheets seulement comme backup/audit"),
  "Le registre doit exprimer la decision centrale du projet."
);

check(
  "registry covers core systems",
  requiredSystems.every((system) => registry.systems?.[system]?.role),
  "Le registre doit couvrir Firebase, Sheets, Apps Script, Bob, CoachRx et GHL."
);

check(
  "registry covers Bob automations",
  requiredAutomations.every((id) => registry.bobAutomations?.some((automation) => automation.id === id)),
  "Les automatisations Bob pertinentes doivent etre rattachees au dashboard."
);

check(
  "registry covers data domains",
  requiredDomains.every((id) => registry.dataDomains?.some((domain) => domain.id === id)),
  "Chaque module du dashboard doit avoir une source et une regle de conflit."
);

check(
  "registry maps domains to Firestore collections",
  registry.dataDomains.every((domain) => Array.isArray(domain.firestoreCollections) && domain.firestoreCollections.length),
  "Chaque domaine doit pointer vers au moins une collection Firestore."
);

const governanceByDomain = new Map((registry.domainGovernance || []).map((item) => [item.domainId, item]));
const phonePolicy = registry.phoneResolutionPolicy || {};
const phoneSourceOrder = (phonePolicy.sourcePriority || []).map((item) => item.source);

check(
  "registry has governance policy for every domain",
  requiredDomains.every((id) => governanceByDomain.has(id))
    && (registry.domainGovernance || []).every((item) => requiredDomains.includes(item.domainId)),
  "Chaque domaine doit avoir une politique d'ecriture et de conflit, sans domaine orphelin."
);

check(
  "governance policies define writers and conflict routing",
  (registry.domainGovernance || []).every((item) =>
    item.primaryWriter
      && Array.isArray(item.allowedSecondaryWriters)
      && item.allowedSecondaryWriters.length
      && item.syncMayOverwrite
      && Array.isArray(item.protectedFields)
      && item.protectedFields.length
      && Array.isArray(item.freshnessEvidence)
      && item.freshnessEvidence.length
      && item.conflictDestination
  ),
  "Chaque politique doit dire qui ecrit, ce qui peut etre ecrase, ce qui est protege, quelle preuve de fraicheur existe et ou vont les conflits."
);

check(
  "governance protects manual fields and no-reopen rules",
  JSON.stringify(registry.domainGovernance || []).includes("manualMembershipEndDate")
    && JSON.stringify(governanceByDomain.get("client_phone") || {}).includes("conflicting phones require validation")
    && JSON.stringify(governanceByDomain.get("todo") || {}).includes("cannot reopen closed")
    && JSON.stringify(governanceByDomain.get("rebooking") || {}).includes("cannot reopen managed")
    && JSON.stringify(governanceByDomain.get("questionnaire_responses") || {}).includes("content is immutable")
    && JSON.stringify(governanceByDomain.get("alumni") || {}).includes("cannot overwrite do_not_contact"),
  "La gouvernance doit proteger les champs manuels, les contenus immutables et les statuts deja traites."
);

check(
  "registry documents no-GHL-stale guardrail",
  registry.dataDomains.some((domain) => domain.id === "client_phone" && /GHL.*jamais.*supprimer|GHL.*jamais.*perimer/i.test(domain.conflictRule || ""))
    && functionsSource.includes('sourceType === "ghl_contacts"')
    && functionsSource.includes("if (!candidateSources.size) return [];"),
  "GHL doit rester un enrichissement partiel et ne pas perimer les clients."
);

check(
  "registry defines phone resolution policy",
  phonePolicy.canonicalField === "phoneNormalized"
    && Array.isArray(phonePolicy.matchingPriority)
    && includesAll(phonePolicy.matchingPriority.join("\n"), ["phoneNormalized", "ghlContactId", "sourceClientId", "normalizedName"])
    && includesAll(phoneSourceOrder.join("\n"), ["dashboard_manual", "gohighlevel", "client_directory", "coachrx_clients", "questionnaire_responses", "rebooking"])
    && phoneSourceOrder.indexOf("gohighlevel") > phoneSourceOrder.indexOf("dashboard_manual")
    && phoneSourceOrder.indexOf("gohighlevel") < phoneSourceOrder.indexOf("client_directory"),
  "Le registre doit encoder l'ordre officiel des sources telephone et garder GHL juste apres la correction manuelle."
);

check(
  "phone policy protects clients from destructive enrichment",
  JSON.stringify(phonePolicy).includes("canClearPhone")
    && (phonePolicy.sourcePriority || []).every((source) => source.canClearPhone === false)
    && JSON.stringify(phonePolicy).includes("ne cree pas de client actif")
    && JSON.stringify(phonePolicy).includes("validation admin")
    && JSON.stringify(phonePolicy).includes("match exact")
    && JSON.stringify(phonePolicy).includes("sourceImportRuns"),
  "La politique telephone doit interdire les effacements, les clients GHL orphelins et les remplacements silencieux."
);

check(
  "registry keeps legacy rebooking safe",
  registry.bobAutomations.some((automation) => automation.id === "AUTO-003" && automation.status === "active_legacy_do_not_break")
    && registry.dataDomains.some((domain) => domain.id === "rebooking" && /Ne pas casser/i.test(domain.conflictRule || "")),
  "Le registre doit proteger l'app rebooking existante pendant la migration."
);

check(
  "registry security excludes public secrets",
  publicForbidden.every((needle) => !JSON.stringify(registry).includes(needle))
    && includesAll(registry.security?.publicAssetsMustNotContain?.join("\n") || "", [
      "GHL private token",
      "DASHBOARD_IMPORT_TOKEN",
      "Apps Script rebooking URLs with token"
    ]),
  "Le registre ne doit contenir aucun secret ou URL tokenisee."
);

check(
  "docs reference source registry",
  docs.includes("SOURCE_REGISTRY.json")
    && docs.includes("registre officiel des sources")
    && docs.includes("domainGovernance")
    && docs.includes("Gouvernance d'ecriture par domaine")
    && (appSource.includes("Sources de verite") || appSource.includes("Source de verite")),
  "Les docs et le Guide doivent pointer vers la logique du registre."
);

const failures = checks.filter((item) => !item.passed);
const report = {
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
