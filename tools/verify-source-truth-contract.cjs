const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const files = {
  operatingPlan: "firebase-dashboard/DATA_OPERATING_PLAN.md",
  sourceAudit: "firebase-dashboard/SOURCE_OF_TRUTH_AUDIT.md",
  syncArchitecture: "firebase-dashboard/DATA_SYNC_ARCHITECTURE.md",
  bridge: "firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md",
  dataModel: "firebase-dashboard/DATA_MODEL.md",
  registry: "firebase-dashboard/SOURCE_REGISTRY.json",
  functions: "functions/index.js",
  frontend: "firebase-dashboard/public/app.js"
};

const text = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, read(file)])
);
const docs = [
  text.operatingPlan,
  text.sourceAudit,
  text.syncArchitecture,
  text.bridge,
  text.dataModel
].join("\n");
const registry = JSON.parse(text.registry);

const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function hasAll(source, values) {
  return values.every((value) => source.includes(value));
}

check(
  "Firestore is operational source",
  hasAll(docs, [
    "Firestore doit etre la base operationnelle",
    "Firestore est la source operationnelle du dashboard",
    "Le dashboard continue de lire Firestore seulement"
  ]),
  "Le contrat doit dire clairement que le dashboard lit Firestore comme base de travail."
);

check(
  "Sheets are not mandatory bridge",
  hasAll(docs, [
    "sans passer obligatoirement par un Google Sheet intermediaire",
    "Google Sheet n'est pas obligatoire",
    "backup, audit ou filet de securite"
  ]),
  "Les docs doivent empecher le retour au reflexe: source vivante -> Sheet -> Firestore si le Sheet n'est pas necessaire."
);

check(
  "Direct import function covers live source families",
  [
    "coachrx_clients",
    "client_directory",
    "ghl_contacts",
    "rebooking",
    "checkups",
    "questionnaire_responses"
  ].every((sourceType) => text.functions.includes(sourceType) && text.bridge.includes(sourceType)),
  "La Function d'import direct doit couvrir les familles de sources utiles au pilote."
);

check(
  "Bob is operator, not database",
  hasAll(docs, [
    "Bob Operator peut servir de couche d'execution",
    "Bob n'est pas une source de donnees",
    "connecter les vraies sources a Firebase"
  ]),
  "Bob doit etre documente comme moyen d'action Google Workspace/Apps Script, pas comme nouvelle source de verite."
);

check(
  "GHL remains server side only",
  hasAll(docs, [
    "GHL est probablement la meilleure source externe",
    "cote serveur seulement",
    "jamais depuis GitHub Pages ou le navigateur du coach"
  ])
    && !/ghl[_-]?(private|api)?[_-]?token\s*[:=]\s*["'][^"']+/i.test(text.frontend)
    && !/Bearer\s+[A-Za-z0-9._-]{20,}/i.test(text.frontend),
  "GHL peut enrichir les telephones, mais aucun secret ou appel prive ne doit vivre dans le frontend."
);

check(
  "Manual dashboard fields protected from imports",
  hasAll(docs, [
    "Fin membership manuelle",
    "Recurrence prevue Kilo",
    "Une valeur vide importee ne doit jamais effacer une valeur utile",
    "Les champs manuels coach doivent rester proteges"
  ]),
  "Les imports ne doivent pas ecraser les decisions manuelles coach/admin."
);

check(
  "Rebooking migration keeps legacy app safe",
  hasAll(docs.toLowerCase(), [
    "l'app rebooking existante continue de fonctionner",
    "source rebooking vivante",
    "ne pas supprimer l'historique de l'ancien systeme"
  ]),
  "Le rebooking actuel doit rester filet de securite pendant la migration Firebase."
);

check(
  "Secret blocker is explicit",
  hasAll(docs, [
    "DASHBOARD_IMPORT_TOKEN",
    "Secret Manager",
    "Script Properties"
  ]),
  "L'activation du pont direct doit nommer le secret Firebase et la propriete Apps Script requise."
);

check(
  "Direct import stale rules protect partial GHL imports",
  hasAll(docs, [
    "`coachrx_clients` et `client_directory` peuvent representer un snapshot complet",
    "`ghl_contacts` est un enrichissement partiel",
    "GHL ne doit jamais supprimer, archiver ou perimer un client"
  ])
    && text.functions.includes("directClientStaleCandidateSources")
    && text.functions.includes('sourceType === "ghl_contacts"')
    && text.functions.includes("if (!candidateSources.size) return [];"),
  "Les snapshots complets peuvent perimer leurs propres anciens imports; GHL ne doit jamais le faire."
);

check(
  "Source registry exists and matches source truth contract",
  registry.principle?.includes("Firestore est la base operationnelle")
    && registry.dataDomains?.some((domain) => domain.id === "client_phone" && domain.targetImport?.includes("ghl_contacts"))
    && registry.dataDomains?.some((domain) => domain.id === "rebooking" && domain.temporarySources?.includes("AUTO-003 Apps Script app"))
    && registry.bobAutomations?.some((automation) => automation.id === "AUTO-003" && automation.status === "active_legacy_do_not_break"),
  "Le registre JSON doit encoder les memes decisions que les documents de source de verite."
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
