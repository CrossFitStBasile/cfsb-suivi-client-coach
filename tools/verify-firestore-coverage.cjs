const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  path.join(root, "firebase-dashboard", "public", "app.js"),
  path.join(root, "functions", "index.js")
];
const rulesPath = path.join(root, "firestore.rules");
const rules = fs.readFileSync(rulesPath, "utf8");
const appSource = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "app.js"), "utf8");

const staticCollections = new Set();

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  collectMatches(source, /collection\s*\(\s*db\s*,\s*"([^"]+)"/g, staticCollections);
  collectMatches(source, /doc\s*\(\s*db\s*,\s*"([^"]+)"/g, staticCollections);
  collectMatches(source, /db\.collection\s*\(\s*"([^"]+)"/g, staticCollections);
  collectMatches(source, /db\.doc\s*\(\s*[`'"]([^/`'"]+)\//g, staticCollections);
  collectMatches(source, /CLIENT_OWNERSHIP_LOCK_PATH\s*=\s*"([^/"]+)\//g, staticCollections);
}

const ruleCollections = new Set();
collectMatches(rules, /match\s+\/([A-Za-z0-9_]+)\//g, ruleCollections);

const ignored = new Set([
  // Dynamic collection names are verified by their concrete action callers.
  "collectionName",
  // Admin SDK only: browser access intentionally falls through to deny-all.
  "ownershipAuditSnapshots"
]);

const missingRules = [...staticCollections]
  .filter((collection) => !ignored.has(collection))
  .filter((collection) => !ruleCollections.has(collection))
  .sort();

const unusedRules = [...ruleCollections]
  .filter((collection) => !staticCollections.has(collection))
  .filter((collection) => !["databases", "system"].includes(collection))
  .sort();

const securityContracts = [
  {
    name: "coach visible actions have matching write rules",
    passed: [
      { collection: "tasks", writers: ["createManualTask", "completeTask", "ignoreTask"] },
      { collection: "clients", writers: ["createClient", "saveClient"] },
      { collection: "rebookings", writers: ["createRebooking", "patchRebooking"] },
      { collection: "impacts", writers: ["createImpact", "saveImpact", "updateImpactStatus", "deleteImpact"] },
      { collection: "alumni", writers: ["createAlumni", "saveAlumni", "updateAlumniStatus", "archiveAlumni"] },
      { collection: "questionnaireSends", writers: ["createQuestionnaireFollowupTask", "cancelQuestionnaireSend"] }
    ].every(({ collection, writers }) => (
      appSource.includes(`"${collection}"`)
      && writers.every((writer) => appSource.includes(writer))
      && rules.includes("allow create: if canCreatePilotCoachDoc(request.resource.data.coachId);")
      && rules.includes("keepsPilotCoach()")
    )),
    detail: "Les actions coach visibles doivent avoir des regles create/update compatibles avec les documents de leur coach."
  },
  {
    name: "coach action logs append only",
    passed: appSource.includes('addDoc(collection(db, "actionLogs")')
      && rules.includes("match /actionLogs/{logId}")
      && rules.includes("allow create: if canCreatePilotCoachDoc(request.resource.data.coachId);")
      && rules.includes("allow update, delete: if false;"),
    detail: "Les actions coach doivent pouvoir etre journalisees, mais le journal ne doit pas etre modifiable depuis le client."
  },
  {
    name: "adoption analytics are append only",
    passed: appSource.includes('collection(db, "usageEvents")')
      && appSource.includes("renderAdminAdoptionAnalytics")
      && appSource.includes('trackUsageEvent("session_started"')
      && rules.includes("match /usageEvents/{eventId}")
      && rules.includes("allow create: if canCreatePilotCoachDoc(request.resource.data.coachId)")
      && rules.includes("request.resource.data.userId == request.auth.uid")
      && rules.includes("allow update, delete: if false;"),
    detail: "Les evenements d'adoption doivent etre journalises sans contenu client sensible, puis consultes dans Admin sans etre modifiables depuis le client."
  },
  {
    name: "coach can mark questionnaire response read only",
    passed: appSource.includes('data-action="markResponseRead"')
      && appSource.includes('patchEntity("questionnaireResponses"')
      && appSource.includes("readByUid")
      && rules.includes("function coachReadsQuestionnaireResponse()")
      && rules.includes("allow update: if ownershipRepairUnlocked() && coachReadsQuestionnaireResponse();")
      && rules.includes("request.resource.data.processingStatus == 'read'")
      && rules.includes("'readByUid'")
      && rules.includes("'readByEmail'")
      && rules.includes("affectedKeys().hasOnly"),
    detail: "Le coach doit pouvoir archiver une reponse comme lue sans modifier son contenu ni son coachId."
  }
  ,
  {
    name: "coach can transfer owned records to pilot coaches",
    passed: appSource.includes("transferSource = isInfoAdmin() ? \"firebase_dashboard_admin\" : \"firebase_dashboard_coach\"")
      && appSource.includes("transferAlumniRelatedRecords")
      && appSource.includes("reactivateAlumniAsClient")
      && rules.includes("function isPilotCoachId(coachField)")
      && rules.includes("function transfersOwnDocumentToPilotCoach()")
      && rules.includes("function transfersRelatedDocumentToPilotCoach()")
      && /match \/clients\/\{clientId\}[\s\S]{0,700}?allow update: if ownershipRepairUnlocked\(\)[\s\S]{0,300}?transfersOwnDocumentToPilotCoach\(\)[\s\S]{0,200}?ownershipAllowsClientUse\(request\.resource\.data\)/.test(rules)
      && /allow update: if ownershipRepairUnlocked\(\)\s*&& \(isAdmin\(\) \|\| keepsPilotCoach\(\) \|\| transfersRelatedDocumentToPilotCoach\(\)(?: \|\| transfersRebookingDocumentToPilotCoach\(\))?\)\s*&& relatedClientIsSelectable\(request\.resource\.data\);/.test(rules)
      && rules.includes("allow update: if ownershipRepairUnlocked() && transfersRelatedDocumentToPilotCoach();"),
    detail: "Un coach doit pouvoir transferer un dossier qu'il possede vers un coach pilote, avec les documents lies limites au patch de transfert."
  },
  {
    name: "pilot coaches can read and act across pilot team",
    passed: appSource.includes("visibleTabs()")
      && appSource.includes("Coach consulte")
      && appSource.includes("renderCoachSelect()")
      && appSource.includes('return uniqueCriteria([{ field: "coachId", value: String(coachId || state.profile?.coachId || "").trim() }]);')
      && rules.includes("function isPilotTeamUser()")
      && rules.includes("function canReadPilotCoachDoc(coachField)")
      && rules.includes("function canCreatePilotCoachDoc(coachField)")
      && rules.includes("allow read: if canReadPilotCoachDoc(resource.data.coachId);")
      && rules.includes("allow create: if canCreatePilotCoachDoc(request.resource.data.coachId);"),
    detail: "Les coachs pilotes doivent pouvoir consulter et agir sur les dossiers des autres coachs pilotes."
  }
];
const failedSecurityContracts = securityContracts.filter((contract) => !contract.passed);

const result = {
  ok: missingRules.length === 0 && failedSecurityContracts.length === 0,
  staticCollections: [...staticCollections].sort(),
  ruleCollections: [...ruleCollections].sort(),
  missingRules,
  unusedRules,
  securityContracts,
  failedSecurityContracts
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

function collectMatches(source, regex, target) {
  let match;
  while ((match = regex.exec(source))) {
    if (match[1]) target.add(match[1]);
  }
}
