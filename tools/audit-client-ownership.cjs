"use strict";

const {
  DEFAULT_DATABASE,
  DEFAULT_PROJECT_ID,
  OWNERSHIP_COLLECTIONS,
  clean,
  contentHash,
  decodeFields,
  documentId,
  getAccessToken,
  identityFromClient,
  identityKeys,
  listCollection,
  parseArgs,
  sha256,
  staffCoach,
  staffNameCandidate,
  writeJsonPrivate
} = require("./client-ownership-repair-lib.cjs");

async function main() {
  const args = parseArgs();
  const projectId = clean(args.project || DEFAULT_PROJECT_ID);
  const database = clean(args.database || DEFAULT_DATABASE);
  const token = await getAccessToken();
  const collections = {};

  for (const collection of OWNERSHIP_COLLECTIONS) {
    collections[collection] = await listCollection(token, { projectId, database, collection });
  }

  const clients = collections.clients.map((document) => ({
    id: documentId(document.name),
    data: decodeFields(document.fields || {}),
    raw: document
  }));
  const identityClaims = new Map();
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const ownershipStatusCounts = {};
  const coachCounts = {};
  let staffRecords = 0;
  let staffSelectable = 0;
  let staffNameCandidates = 0;

  clients.forEach((client) => {
    const data = client.data;
    const coachId = clean(data.coachId || data.coachRxId || "missing");
    const status = clean(data.ownershipStatus || "unclassified");
    coachCounts[coachId] = Number(coachCounts[coachId] || 0) + 1;
    ownershipStatusCounts[status] = Number(ownershipStatusCounts[status] || 0) + 1;
    const identity = identityFromClient(data);
    identityKeys(identity).forEach((key) => {
      if (!identityClaims.has(key)) identityClaims.set(key, new Set());
      identityClaims.get(key).add(coachId);
    });
    const staff = staffCoach(identity, data);
    if (staff) {
      staffRecords += 1;
      if (data.clientSelectable !== false) staffSelectable += 1;
    }
    if (!staff && staffNameCandidate(identity)) staffNameCandidates += 1;
  });

  const collisionKeys = [...identityClaims.values()].filter((coachIds) => coachIds.size > 1).length;
  const dependentCollections = OWNERSHIP_COLLECTIONS.filter((collection) => !["clients", "alumni"].includes(collection));
  const dependentAudit = {};
  for (const collection of dependentCollections) {
    let linked = 0;
    let missingClient = 0;
    let coachMismatch = 0;
    let linkedToBlockedClient = 0;
    collections[collection].forEach((document) => {
      const data = decodeFields(document.fields || {});
      const clientId = clean(data.clientId);
      if (!clientId) return;
      linked += 1;
      const client = clientById.get(clientId);
      if (!client) {
        missingClient += 1;
        return;
      }
      if (clean(client.data.coachId) !== clean(data.coachId)) coachMismatch += 1;
      if (client.data.clientSelectable === false
        || ["staff", "unknown"].includes(clean(client.data.entityType))
        || ["conflict", "needs_review", "excluded_staff"].includes(clean(client.data.ownershipStatus))) {
        linkedToBlockedClient += 1;
      }
    });
    dependentAudit[collection] = { linked, missingClient, coachMismatch, linkedToBlockedClient };
  }

  const summary = {
    projectId,
    generatedAt: new Date().toISOString(),
    collectionCounts: Object.fromEntries(OWNERSHIP_COLLECTIONS.map((name) => [name, collections[name].length])),
    coachCounts,
    ownershipStatusCounts,
    crossCoachIdentityCollisionKeys: collisionKeys,
    staffRecords,
    staffSelectable,
    staffNameCandidates,
    dependentAudit
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!args.output) return;

  const backup = {
    format: "cfsb-client-ownership-backup/v1",
    verified: true,
    projectId,
    database,
    generatedAt: summary.generatedAt,
    purpose: "Preimage complete avant plan de reparation d'appartenance client",
    collectionCounts: summary.collectionCounts,
    collectionSha256: Object.fromEntries(OWNERSHIP_COLLECTIONS.map((name) => [name, sha256(collections[name])])),
    auditSummary: summary,
    collections
  };
  backup.contentSha256 = contentHash(backup);
  const output = writeJsonPrivate(args.output, backup);
  process.stdout.write(`Backup prive verifie: ${output}\nSHA-256: ${backup.contentSha256}\n`);
}

main().catch((error) => {
  process.stderr.write(`Audit ownership interrompu: ${error.message}\n`);
  process.exitCode = 1;
});
