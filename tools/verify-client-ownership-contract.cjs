"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  OWNERSHIP_COLLECTIONS,
  assertPrivateInputPath,
  assertPrivateOutputPath,
  contentHash,
  encodeFields,
  sha256
} = require("./client-ownership-repair-lib.cjs");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "functions", "index.js");
const rulesPath = path.join(root, "firestore.rules");
const plannerPath = path.join(__dirname, "plan-client-ownership-repair.cjs");
const applyPath = path.join(__dirname, "apply-client-ownership-repair.cjs");
const lockPath = path.join(__dirname, "manage-client-ownership-lock.cjs");
const indexSource = fs.readFileSync(indexPath, "utf8");
const rulesSource = fs.readFileSync(rulesPath, "utf8");
const plannerSource = fs.readFileSync(plannerPath, "utf8");
const applySource = fs.readFileSync(applyPath, "utf8");
const lockSource = fs.readFileSync(lockPath, "utf8");
const librarySource = fs.readFileSync(path.join(__dirname, "client-ownership-repair-lib.cjs"), "utf8");

function must(source, expression, label) {
  assert(expression.test(source), `Contrat absent: ${label}`);
}

function firestoreDocument(collection, id, data, version) {
  return {
    name: `projects/cfsb-dashboard-coach-aa9a4/databases/(default)/documents/${collection}/${id}`,
    fields: encodeFields(data),
    createTime: `2026-07-17T00:00:0${version}.000000Z`,
    updateTime: `2026-07-17T01:00:0${version}.000000Z`
  };
}

function buildFixtureArtifacts(directory) {
  const collections = Object.fromEntries(OWNERSHIP_COLLECTIONS.map((name) => [name, []]));
  collections.clients.push(
    firestoreDocument("clients", "marc_reference", { coachId: "15935", coachRxId: "15935", name: "Reference Member", sourceClientId: "external-reference-id", sourceIdentitySystem: "coachrx", status: "active" }, 1),
    firestoreDocument("clients", "iheb_duplicate", { coachId: "15928", coachRxId: "15928", name: "Reference Member", sourceClientId: "external-reference-id", sourceIdentitySystem: "coachrx", status: "active" }, 2),
    firestoreDocument("clients", "marc_collision", { coachId: "15935", name: "Unproven Collision", status: "active" }, 3),
    firestoreDocument("clients", "iheb_collision", { coachId: "15928", name: "Unproven Collision", status: "active" }, 4),
    firestoreDocument("clients", "staff_david", { coachId: "15935", name: "David Olivier", email: "davidolivier1997@gmail.com", status: "active" }, 5),
    firestoreDocument("clients", "staff_name_only", { coachId: "15935", name: "Gabriel Mayer Bedard", status: "active" }, 7),
    firestoreDocument("clients", "coachrx_system_collision", { coachId: "15935", name: "System A", sourceClientId: "same-external-id", sourceIdentitySystem: "coachrx", status: "active" }, 8),
    firestoreDocument("clients", "ghl_system_collision", { coachId: "15928", name: "System B", sourceClientId: "same-external-id", sourceIdentitySystem: "ghl", status: "active" }, 9)
  );
  collections.tasks.push(firestoreDocument("tasks", "linked_duplicate", {
    coachId: "15928",
    clientId: "iheb_duplicate",
    clientName: "Reference Member",
    status: "open"
  }, 6));
  const backup = {
    format: "cfsb-client-ownership-backup/v1",
    verified: true,
    projectId: "cfsb-dashboard-coach-aa9a4",
    database: "(default)",
    generatedAt: "2026-07-17T02:00:00.000Z",
    collectionCounts: Object.fromEntries(OWNERSHIP_COLLECTIONS.map((name) => [name, collections[name].length])),
    collectionSha256: Object.fromEntries(OWNERSHIP_COLLECTIONS.map((name) => [name, sha256(collections[name])])),
    collections
  };
  backup.contentSha256 = contentHash(backup);
  const reference = {
    format: "cfsb-client-ownership-reference/v1",
    verified: true,
    source: {
      system: "Google Sheets",
      documentId: "private-fixture-clients-master",
      generatedAt: "2026-07-17T02:01:00.000Z",
      validatedBy: "contract-test",
      validatedAt: "2026-07-17T02:02:00.000Z"
    },
    entries: [{
      validated: true,
      ownerCoachId: "15935",
      entityType: "member",
      evidence: "Clients_Master validated fixture",
      match: { sourceSystem: "coachrx", sourceClientId: "external-reference-id", name: "Reference Member" }
    }]
  };
  reference.contentSha256 = contentHash(reference);
  const backupPath = path.join(directory, "backup.json");
  const referencePath = path.join(directory, "reference.json");
  const planPath = path.join(directory, "plan.json");
  fs.writeFileSync(backupPath, JSON.stringify(backup));
  fs.writeFileSync(referencePath, JSON.stringify(reference));
  return { backupPath, referencePath, planPath };
}

function main() {
  // Parse without executing Firebase initialization.
  new Function(indexSource);
  new Function(plannerSource);
  new Function(applySource);
  new Function(lockSource);

  assert(!/knownOwnerByCollision|knownOwner|15928\|15935/.test(indexSource), "Aucun proprietaire/couple de collision ne doit etre code en dur.");
  must(indexSource, /resolveValidatedImportContext\(\{ sourceType, payload, records, coaches \}\)/, "resolution validee avant import");
  must(indexSource, /sourcePath doit prouver \/team\/\{coachId\}\/clients/, "preuve URL CoachRx obligatoire");
  must(indexSource, /validateImportRowCoachEvidence/, "validation de chaque ligne");
  must(indexSource, /requireEvidence: sourceType === "coachrx_clients"/, "preuve coach requise pour chaque ligne CoachRx");
  must(indexSource, /requireEvidence && idResolution\.matches\.length === 0 && nameMatches\.size === 0/, "ligne CoachRx sans preuve refusee");
  must(indexSource, /ownershipStatus: "conflict"/, "quarantaine des collisions");
  must(indexSource, /ownershipStatus: "excluded_staff"/, "classification du personnel");
  must(indexSource, /staff_name_candidate:/, "nom de coach seul traite comme candidat");
  must(indexSource, /source:\$\{normalizedSourceSystem\}:\$\{normalizedSourceId\}/, "ID source namespace par systeme");
  must(indexSource, /clientSelectable: false/, "blocage de selection");
  must(indexSource, /CLIENT_OWNERSHIP_LOCK_PATH = "systemLocks\/clientOwnershipSync"/, "verrou anti-sync");
  must(indexSource, /questionnaireOnlyWhileLocked/, "ingestion questionnaire maintenue sous verrou");
  must(indexSource, /source === "firebase_function_questionnaire_response_sync_scheduled"/, "exception limitee au scheduled questionnaire");
  must(indexSource, /scheduledQuestionnaireSendPlans[\s\S]*clientRecordAvailableForMatching\(client\)[\s\S]*status: "paused"[\s\S]*appartenance client a valider/, "planifications questionnaire suspendues pour les clients bloques");
  must(indexSource, /clientRecordAvailableForMatching/, "matching exclut la quarantaine");
  must(indexSource, /cleanString\(data\.entityType\) !== "member"[\s\S]*cleanString\(data\.ownershipStatus\) !== "confirmed"[\s\S]*data\.clientSelectable !== true/, "matching serveur fail-closed apres backfill");
  must(indexSource, /"removed",[\s\S]*"archived",[\s\S]*"alumni",[\s\S]*"do_not_contact",[\s\S]*"import_stale",[\s\S]*"ownership_quarantine",[\s\S]*"deleted"/, "statuts clients inactifs alignes cote serveur");
  ["questionnaireRowBelongsToCoach", "buildQuestionnaireResponseRecords", "expandQuestionnaireRow"].forEach((name) => {
    must(indexSource, new RegExp(`function ${name}\\(`), `parseur questionnaire ${name}`);
  });

  must(rulesSource, /function relatedClientIsSelectable/, "regle relation client selectionnable");
  must(rulesSource, /match \/systemLocks\/\{lockId\}/, "regle admin du verrou");
  must(rulesSource, /clientData\.keys\(\)\.hasAll\(\['clientSelectable', 'entityType', 'ownershipStatus'\]\)/, "selection client fail-closed par champs explicites");
  must(rulesSource, /clientData\.clientSelectable == true[\s\S]*clientData\.entityType == 'member'[\s\S]*clientData\.ownershipStatus == 'confirmed'/, "selection client exige membre confirme");
  must(rulesSource, /function ownershipRepairUnlocked\(\)[\s\S]*expiresAt is timestamp[\s\S]*expiresAt <= request\.time/, "verrou de reparation expire par timestamp Firestore");
  ["tasks", "questionnaireResponses", "questionnaireSends", "questionnaireSchedules", "rebookings", "checkups", "impacts"].forEach((collectionName) => {
    const block = rulesSource.slice(
      rulesSource.indexOf(`match /${collectionName}/`),
      rulesSource.indexOf("\n    match /", rulesSource.indexOf(`match /${collectionName}/`) + 1)
    );
    assert(block.includes("ownershipRepairUnlocked()"), `${collectionName} doit etre gele pendant la reparation ownership.`);
  });
  ["questionnaireSends", "questionnaireSchedules"].forEach((collectionName) => {
    const block = rulesSource.slice(
      rulesSource.indexOf(`match /${collectionName}/`),
      rulesSource.indexOf("\n    match /", rulesSource.indexOf(`match /${collectionName}/`) + 1)
    );
    assert(block.includes("clientIdIsSelectableForCoach"), `${collectionName} exige un clientId confirme.`);
  });
  must(rulesSource, /ownershipStatus in \['conflict', 'needs_review', 'excluded_staff'\]/, "statuts bloques par les regles");
  must(rulesSource, /status in \['removed', 'archived', 'alumni', 'do_not_contact', 'import_stale', 'ownership_quarantine', 'deleted'\]/, "statuts clients inactifs alignes dans les regles");
  must(rulesSource, /function coachMovesClientToAlumni\(\)[\s\S]*ownershipAllowsClientUse\(resource\.data\)[\s\S]*clientSelectable == false[\s\S]*status == 'alumni'[\s\S]*affectedKeys\(\)\.hasOnly/, "transition client vers Alumni bornee");
  must(rulesSource, /isAdmin\(\)[\s\S]*coachMovesClientToAlumni\(\)[\s\S]*ownershipAllowsClientUse\(request\.resource\.data\)/, "mise a jour client autorise la transition Alumni sans ouvrir les mutations inactives");
  must(rulesSource, /coachLinksQuestionnaireResponseToClient[\s\S]*relatedClientIsSelectable\(request\.resource\.data\)/, "liaison questionnaire protegee");
  must(applySource, /currentDocument: \{ updateTime: operation\.expectedUpdateTime \}/, "precondition Firestore updateTime");
  must(applySource, /beforeFieldsSha256/, "precondition hash preimage");
  must(applySource, /systemLocks\/clientOwnershipSync/, "verrou requis par apply");
  must(applySource, /lock\.projectId !== plan\.projectId[\s\S]*lock\.repairId !== plan\.repairId[\s\S]*lock\.backupContentSha256 !== backup\.contentSha256[\s\S]*lock\.planContentSha256 !== plan\.contentSha256/, "egalite stricte du verrou");
  must(applySource, /expiresAtMs <= Date\.now\(\) \+ minimumLifetimeMs/, "expiration du verrou verifiee");
  must(applySource, /lock\.phase !== "bound"/, "apply exige un verrou lie au plan");
  must(applySource, /MINIMUM_LOCK_TTL_MS = 5 \* 60 \* 1000/, "TTL minimal de cinq minutes");
  must(applySource, /name: commitLock\.name[\s\S]*phase: "applied"[\s\S]*fieldPaths: \["phase", "appliedAt", "appliedOperationCount"\][\s\S]*currentDocument: \{ updateTime: commitLock\.updateTime \}/, "transition applied du verrou dans le commit atomique");
  assert(!/verify: commitLock\.name/.test(applySource), "Firestore Write REST ne supporte pas une operation verify; utiliser un update no-op preconditionne.");
  must(applySource, /destructiveDeletes: 0/, "aucune suppression");
  must(applySource, /operations\.length \+ 1 > MAX_ATOMIC_WRITES/, "limite du commit atomique incluant le verify");
  must(applySource, /firestoreBase\(plan\.projectId, plan\.database\)\}:commit/, "commit Firestore atomique");
  assert(!/:batchWrite/.test(applySource), "Apply ne doit jamais utiliser des lots non atomiques.");
  must(lockSource, /--verify-live/, "unlock exige une verification live");
  must(lockSource, /unlockRequiresVerifiedPlan: true/, "verrou declare l'exigence de verification");
  must(lockSource, /currentDocument: lock\.exists \? \{ updateTime: lock\.document\.updateTime \}/, "mutations du verrou preconditionnees");
  must(lockSource, /action === "reserve"[\s\S]*phase: "reserved"/, "reservation avant audit");
  must(lockSource, /action === "bind"[\s\S]*phase: "bound"/, "liaison conditionnelle du plan apres audit");
  must(lockSource, /backup\.generatedAt[\s\S]*lock\.data\.lockedAt[\s\S]*audit realise apres la reservation/, "backup posterieur a la reservation");
  must(lockSource, /action === "release"[\s\S]*confirm-release[\s\S]*phase: "released"/, "liberation forte d'une reservation non liee");
  must(lockSource, /action === "abort"[\s\S]*phase !== "bound"[\s\S]*confirm-abort[\s\S]*phase: "aborted"/, "abandon fort d'un plan lie mais non applique");
  must(lockSource, /lock\.data\.phase !== "applied"[\s\S]*--verify-live/, "unlock reserve a un commit applique et verifie");
  must(lockSource, /lockStillActive[\s\S]*Date\.parse\(lock\.data\.expiresAt\) > Date\.now\(\)[\s\S]*replaceableExpiredReservation/, "reservation expiree remplacable sans ecraser un plan bound ou applied");
  must(librarySource, /fs\.realpathSync\.native\(existingAncestor\)/, "chemin canonique par realpath");
  must(librarySource, /data\.lastDirectEnrichmentSource/, "identite source alignee avec l'enrichissement direct");
  must(librarySource, /isSymbolicLink\(\)/, "liens symboliques et jonctions refuses");
  must(librarySource, /value\.includes\("\/onedrive\/"\)/, "backup refuse sous OneDrive");
  must(librarySource, /fs\.existsSync\(path\.join\(cursor, "\.git"\)\)/, "backup refuse dans un worktree Git");
  must(plannerSource, /Reference contradictoire:[\s\S]*plusieurs ownerCoachId/, "reference multi-owner refusee en preflight");
  must(plannerSource, /Roster complet[\s\S]*couverture canonique/, "couverture totale d'un roster complet");
  assert(!/OWNERSHIP_COLLECTIONS\.filter/.test(plannerSource), "Le plan atomique ne doit pas propager des milliers de documents lies.");
  must(indexSource, /const sourceKey = sourceClientId && sourceSystem \? `\$\{sourceSystem\}:\$\{sourceClientId\}`/, "index source namespace par systeme");
  assert(!/index\.byName/.test(indexSource), "Les mutations client ne doivent pas apparier par nom seul.");
  assert(!/trustedCuratedSource|curated_core/.test(indexSource), "CORE sans identite forte ne doit pas etre confirme implicitement.");

  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cfsb-ownership-contract-"));
  try {
    const fixture = buildFixtureArtifacts(fixtureDirectory);
    const result = childProcess.spawnSync(process.execPath, [
      plannerPath,
      "--backup", fixture.backupPath,
      "--reference", fixture.referencePath,
      "--output", fixture.planPath,
      "--repair-id", "contract_test_repair"
    ], { encoding: "utf8" });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const plan = JSON.parse(fs.readFileSync(fixture.planPath, "utf8"));
    const byPath = new Map(plan.operations.map((operation) => [operation.documentPath, operation]));
    assert.strictEqual(byPath.get("clients/marc_reference").patch.ownershipStatus, "confirmed");
    assert.strictEqual(byPath.get("clients/marc_reference").patch.coachId, "15935");
    assert.strictEqual(byPath.get("clients/iheb_duplicate").patch.ownershipStatus, "conflict");
    assert.strictEqual(byPath.get("clients/iheb_duplicate").patch.clientSelectable, false);
    assert.strictEqual(byPath.get("clients/marc_collision").patch.ownershipStatus, "needs_review");
    assert.strictEqual(byPath.get("clients/iheb_collision").patch.ownershipStatus, "needs_review");
    assert.strictEqual(byPath.get("clients/staff_david").patch.entityType, "staff");
    assert.strictEqual(byPath.get("clients/staff_david").patch.ownershipStatus, "excluded_staff");
    assert.strictEqual(byPath.get("clients/staff_name_only").patch.entityType, "unknown");
    assert.strictEqual(byPath.get("clients/staff_name_only").patch.ownershipStatus, "needs_review");
    assert.strictEqual(byPath.get("clients/coachrx_system_collision").patch.ownershipStatus, "confirmed");
    assert.strictEqual(byPath.get("clients/ghl_system_collision").patch.ownershipStatus, "confirmed");
    assert(!byPath.has("tasks/linked_duplicate"), "Le plan atomique ne propage pas dans les collections liees volumineuses.");
    assert(plan.operations.every((operation) => operation.documentPath.startsWith("clients/")));
    assert.strictEqual(plan.destructiveDeletes, 0);
    assert.strictEqual(plan.backupContentSha256.length, 64);
    assert.strictEqual(plan.referenceContentSha256.length, 64);

    const contradictoryReference = JSON.parse(fs.readFileSync(fixture.referencePath, "utf8"));
    contradictoryReference.entries.push({
      ...contradictoryReference.entries[0],
      ownerCoachId: "15928",
      evidence: "Contradiction volontaire du test"
    });
    contradictoryReference.contentSha256 = contentHash(contradictoryReference);
    const contradictoryPath = path.join(fixtureDirectory, "reference-contradictoire.json");
    fs.writeFileSync(contradictoryPath, JSON.stringify(contradictoryReference));
    const contradictoryResult = childProcess.spawnSync(process.execPath, [
      plannerPath,
      "--backup", fixture.backupPath,
      "--reference", contradictoryPath,
      "--output", path.join(fixtureDirectory, "plan-contradictoire.json"),
      "--repair-id", "contract_test_contradiction"
    ], { encoding: "utf8" });
    assert.notStrictEqual(contradictoryResult.status, 0, "Une identite forte ne peut pas avoir deux owners dans la reference.");
    assert(/Reference contradictoire/.test(contradictoryResult.stderr), contradictoryResult.stderr);

    const incompleteRosterReference = JSON.parse(fs.readFileSync(fixture.referencePath, "utf8"));
    incompleteRosterReference.completeRosterCoachIds = ["15935"];
    incompleteRosterReference.entries.push({
      validated: true,
      ownerCoachId: "15935",
      entityType: "member",
      evidence: "Membre roster complet absent du backup",
      match: { sourceSystem: "coachrx", sourceClientId: "missing-roster-client" }
    });
    incompleteRosterReference.contentSha256 = contentHash(incompleteRosterReference);
    const incompleteRosterPath = path.join(fixtureDirectory, "reference-roster-incomplet.json");
    fs.writeFileSync(incompleteRosterPath, JSON.stringify(incompleteRosterReference));
    const incompleteRosterResult = childProcess.spawnSync(process.execPath, [
      plannerPath,
      "--backup", fixture.backupPath,
      "--reference", incompleteRosterPath,
      "--output", path.join(fixtureDirectory, "plan-roster-incomplet.json"),
      "--repair-id", "contract_test_roster_missing"
    ], { encoding: "utf8" });
    assert.notStrictEqual(incompleteRosterResult.status, 0, "Un roster declare complet exige une couverture canonique totale.");
    assert(/Roster complet/.test(incompleteRosterResult.stderr), incompleteRosterResult.stderr);

    assert.throws(() => assertPrivateOutputPath(path.join(fixtureDirectory, "OneDrive", "plan.json")), /OneDrive/);
    const worktree = path.join(fixtureDirectory, "private-worktree");
    fs.mkdirSync(path.join(worktree, ".git"), { recursive: true });
    const worktreeFile = path.join(worktree, "reference.json");
    fs.writeFileSync(worktreeFile, "{}");
    assert.throws(() => assertPrivateInputPath(worktreeFile), /worktree Git/);
    assert.throws(() => assertPrivateOutputPath(path.join(worktree, "plan.json")), /worktree Git/);

    const canonicalTarget = path.join(fixtureDirectory, "canonical-target");
    const linkedTarget = path.join(fixtureDirectory, "linked-target");
    fs.mkdirSync(canonicalTarget);
    fs.symlinkSync(canonicalTarget, linkedTarget, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => assertPrivateOutputPath(path.join(linkedTarget, "plan.json")), /lien symbolique|jonction/);
  } finally {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  }

  process.stdout.write("Client ownership contract: OK\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(`Client ownership contract: FAIL - ${error.message}\n`);
  process.exitCode = 1;
}
