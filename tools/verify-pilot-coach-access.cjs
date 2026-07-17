const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = {
  app: path.join(root, "firebase-dashboard", "public", "app.js"),
  functions: path.join(root, "functions", "index.js"),
  rules: path.join(root, "firestore.rules"),
  readme: path.join(root, "firebase-dashboard", "README.md"),
  dataModel: path.join(root, "firebase-dashboard", "DATA_MODEL.md"),
  releaseStatus: path.join(root, "firebase-dashboard", "PILOT_RELEASE_STATUS.md"),
  workQueue: path.join(root, "firebase-dashboard", "NEXT_WORK_QUEUE.md"),
  handoff: path.join(root, "firebase-dashboard", "PILOT_HANDOFF.md"),
  accessRegistry: path.join(root, "firebase-dashboard", "PILOT_COACH_ACCESS.json")
};

const text = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")])
);

const accessRegistry = JSON.parse(text.accessRegistry);
const pilotCoaches = accessRegistry.pilotCoaches.map((coach) => ({
  id: coach.coachId,
  coachRxId: coach.coachRxId,
  name: coach.displayName,
  email: coach.email,
  accessMode: coach.accessMode,
  adminShared: coach.accessMode === "admin_shared_account"
}));
const explicitNonPilotEmails = accessRegistry.explicitlyNotPilotAccess || [];

const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

const coachEmails = pilotCoaches.filter((coach) => !coach.adminShared);
const sharedAdmin = pilotCoaches.find((coach) => coach.adminShared);

check(
  "access registry exists with one source of truth",
  accessRegistry.version
    && accessRegistry.principle
    && accessRegistry.adminAccounts?.length >= 1
    && pilotCoaches.length === 7
    && pilotCoaches.every((coach) => coach.id && coach.coachRxId === coach.id && coach.email && coach.accessMode),
  "Le registre PILOT_COACH_ACCESS.json doit decrire les coachs pilotes, le compte admin partage et le principe d'acces."
);

check(
  "pilot list is consistent in frontend and backend",
  pilotCoaches.every((coach) => (
    text.app.includes(`id: "${coach.id}"`)
    && text.functions.includes(`id: "${coach.id}"`)
    && text.app.includes(`coachRxId: "${coach.id}"`)
    && text.functions.includes(`coachRxId: "${coach.id}"`)
  )),
  "Les coachs pilotes doivent avoir le meme CoachRx ID dans le frontend et les Functions."
);

check(
  "official coach emails are present in frontend and backend",
  pilotCoaches.every((coach) => text.app.includes(coach.email) && text.functions.includes(coach.email)),
  "Les courriels officiels Kilo/coach doivent rester alignes dans l'app et le backend."
);

check(
  "shared info account stays admin path",
  Boolean(sharedAdmin)
    && accessRegistry.adminAccounts.some((account) => account.email === sharedAdmin.email && account.role === "admin")
    && text.app.includes(`cleanEmail === "${sharedAdmin.email}"`)
    && text.app.includes("return null;")
    && text.rules.includes(`request.auth.token.email == '${sharedAdmin.email}'`)
    && text.rules.includes("request.resource.data.role == 'admin'")
    && text.rules.includes("request.resource.data.coachId == 'admin'"),
  "Le compte info@ doit rester un acces admin/coproprio, pas un auto-profil coach Gabriel."
);

check(
  "pilot coach self provisioning is locked by email and coach id",
  coachEmails.every((coach) => (
    text.rules.includes(`request.auth.token.email == '${coach.email}' && coachField == '${coach.id}'`)
  ))
    && text.rules.includes("request.resource.data.role == 'coach'")
    && text.rules.includes("request.resource.data.email == request.auth.token.email")
    && text.rules.includes("request.resource.data.coachRxId == request.resource.data.coachId")
    && text.rules.includes("request.resource.data.source == 'firebase_self_provision_pilot'")
    && text.rules.includes("request.resource.data.keys().hasOnly"),
  "Les coachs pilotes doivent pouvoir creer seulement leur propre profil coach verrouille a leur courriel et CoachRx ID."
);

check(
  "self provisioning is documented in handoff docs",
  includesAll(text.readme + text.dataModel + text.releaseStatus + text.workQueue + text.handoff, [
    "PILOT_COACH_ACCESS.json",
    "firebase_self_provision_pilot",
    "auto-activer",
    "info@crossfitstbasilelegrand.com",
    "admin/coproprio"
  ]),
  "Les documents de reprise doivent expliquer le comportement d'acces coach et le cas special info@."
);

check(
  "no unsupported pilot coach email can self provision",
  explicitNonPilotEmails.every((email) => !text.rules.includes(email)),
  "Les autres courriels du staff Kilo ne doivent pas etre ajoutes par accident aux regles d'auto-activation pilote."
);

const failures = checks.filter((item) => !item.passed);
const result = {
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  checks
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
