const fs = require("fs");
const os = require("os");
const path = require("path");

const projectId = "cfsb-dashboard-coach-aa9a4";
const database = "(default)";
const root = path.resolve(__dirname, "..");
const cliConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const accessRegistryPath = path.join(root, "firebase-dashboard", "PILOT_COACH_ACCESS.json");
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(database)}/documents`;
const firebaseClientId = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const firebaseClientSecret = "j9iVZfS8kkCEFUPaAeJV0sAi";

function readAccessRegistry() {
  const registry = JSON.parse(fs.readFileSync(accessRegistryPath, "utf8"));
  return {
    adminAccounts: registry.adminAccounts || [],
    pilotCoaches: registry.pilotCoaches || []
  };
}

function readFirebaseCliConfig() {
  const config = JSON.parse(fs.readFileSync(cliConfigPath, "utf8"));
  if (!config.tokens?.refresh_token && !config.tokens?.access_token) {
    throw new Error(`Aucun token Firebase CLI trouve dans ${cliConfigPath}`);
  }
  return config;
}

function needsRefresh(tokens = {}) {
  if (!tokens.access_token) return true;
  const expiresAt = Number(tokens.expires_at || 0);
  return Boolean(expiresAt && Date.now() > expiresAt - 120000);
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) throw new Error("Aucun refresh_token Firebase CLI disponible.");
  const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: firebaseClientId,
      client_secret: firebaseClientSecret,
      grant_type: "refresh_token"
    })
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || !data.access_token) {
    throw new Error(`Impossible de rafraichir le token Firebase CLI: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data.access_token;
}

async function readAccessToken() {
  const config = readFirebaseCliConfig();
  if (needsRefresh(config.tokens)) {
    return refreshAccessToken(config.tokens.refresh_token);
  }
  return config.tokens.access_token;
}

function decodeValue(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function docData(document) {
  return {
    id: String(document.name || "").split("/").pop(),
    ...decodeFields(document.fields || {})
  };
}

async function firestoreRequest(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data).slice(0, 800)}`);
  }
  return data;
}

async function queryUsersByEmail(token, email) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: "users" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "email" },
          op: "EQUAL",
          value: { stringValue: email }
        }
      },
      limit: 10
    }
  };
  const data = await firestoreRequest(token, `${baseUrl}:runQuery`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return data.map((entry) => entry.document).filter(Boolean).map(docData);
}

async function queryAuthUsersByEmail(token, email) {
  const data = await firestoreRequest(
    token,
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: "POST",
      body: JSON.stringify({ email: [email] })
    }
  );
  return (data.users || []).map((user) => ({
    uid: user.localId || "",
    email: user.email || "",
    disabled: user.disabled === true,
    providers: (user.providerUserInfo || []).map((provider) => provider.providerId).filter(Boolean),
    lastLoginAt: user.lastLoginAt || "",
    createdAt: user.createdAt || ""
  }));
}

function isProfileReadyForCoach(profile, coach) {
  return Boolean(profile)
    && profile.active === true
    && profile.role === "coach"
    && String(profile.coachId || "") === String(coach.coachId || "")
    && String(profile.coachRxId || profile.coachId || "") === String(coach.coachRxId || coach.coachId || "");
}

function isProfileReadyForAdmin(profile, adminAccount) {
  return Boolean(profile)
    && profile.active === true
    && profile.role === "admin"
    && String(profile.coachId || "") === String(adminAccount.coachId || "admin");
}

function summarizeCoach(coach, profiles, authUsers) {
  const activeAuthUsers = authUsers.filter((user) => !user.disabled);
  const authUids = new Set(activeAuthUsers.map((user) => user.uid));
  const ready = profiles.find((profile) => isProfileReadyForCoach(profile, coach) && authUids.has(profile.id));
  const status = ready ? "OK" : "A_CORRIGER";
  const issues = [];
  const hygieneIssues = [];
  if (!profiles.length) issues.push("profil users introuvable pour ce courriel");
  if (!activeAuthUsers.length) issues.push("compte Firebase Auth actif introuvable pour ce courriel");
  if (activeAuthUsers.length > 1) hygieneIssues.push(`${activeAuthUsers.length} comptes Firebase Auth actifs partagent ce courriel`);
  const orphanProfiles = profiles.filter((profile) => !authUids.has(profile.id));
  if (orphanProfiles.length) hygieneIssues.push(`${orphanProfiles.length} profil(s) Firestore ne correspondent a aucun UID Firebase Auth actif; verifier avant archivage`);
  profiles.forEach((profile) => {
    if (profile.active !== true) issues.push(`profil ${profile.id}: active=${profile.active}`);
    if (profile.role !== "coach") issues.push(`profil ${profile.id}: role=${profile.role || "manquant"}`);
    if (String(profile.coachId || "") !== String(coach.coachId || "")) issues.push(`profil ${profile.id}: coachId=${profile.coachId || "manquant"} attendu=${coach.coachId}`);
    if (String(profile.coachRxId || profile.coachId || "") !== String(coach.coachRxId || coach.coachId || "")) issues.push(`profil ${profile.id}: coachRxId=${profile.coachRxId || "manquant"} attendu=${coach.coachRxId}`);
  });
  return {
    status,
    coach: coach.displayName,
    email: coach.email,
    expectedCoachId: coach.coachId,
    profileCount: profiles.length,
    authUsers,
    profiles: profiles.map(maskProfile),
    issues: [...new Set(issues)],
    hygieneIssues: [...new Set(hygieneIssues)]
  };
}

function summarizeAdmin(adminAccount, profiles, authUsers) {
  const activeAuthUsers = authUsers.filter((user) => !user.disabled);
  const authUids = new Set(activeAuthUsers.map((user) => user.uid));
  const ready = profiles.find((profile) => isProfileReadyForAdmin(profile, adminAccount) && authUids.has(profile.id));
  const issues = [];
  const hygieneIssues = [];
  if (!profiles.length) issues.push("profil admin introuvable pour ce courriel");
  if (!activeAuthUsers.length) issues.push("compte Firebase Auth admin actif introuvable pour ce courriel");
  if (activeAuthUsers.length > 1) hygieneIssues.push(`${activeAuthUsers.length} comptes Firebase Auth admin actifs partagent ce courriel`);
  const orphanProfiles = profiles.filter((profile) => !authUids.has(profile.id));
  if (orphanProfiles.length) hygieneIssues.push(`${orphanProfiles.length} profil(s) admin Firestore ne correspondent a aucun UID Firebase Auth actif; verifier avant archivage`);
  profiles.forEach((profile) => {
    if (profile.active !== true) issues.push(`profil ${profile.id}: active=${profile.active}`);
    if (profile.role !== "admin") issues.push(`profil ${profile.id}: role=${profile.role || "manquant"}`);
    if (String(profile.coachId || "") !== String(adminAccount.coachId || "admin")) issues.push(`profil ${profile.id}: coachId=${profile.coachId || "manquant"} attendu=${adminAccount.coachId || "admin"}`);
  });
  return {
    status: ready ? "OK" : "A_CORRIGER",
    admin: adminAccount.displayName || adminAccount.email,
    email: adminAccount.email,
    expectedCoachId: adminAccount.coachId || "admin",
    profileCount: profiles.length,
    authUsers,
    profiles: profiles.map(maskProfile),
    issues: [...new Set(issues)],
    hygieneIssues: [...new Set(hygieneIssues)]
  };
}

function maskProfile(profile) {
  return {
    uid: profile.id,
    role: profile.role || "",
    active: profile.active === true,
    coachId: profile.coachId || "",
    coachRxId: profile.coachRxId || "",
    source: profile.source || "",
    email: profile.email || ""
  };
}

function authHint(error) {
  const message = String(error?.message || error || "");
  if (!/invalid_rapt|invalid_grant|UNAUTHENTICATED|401/i.test(message)) return "";
  return [
    "Authentification Firebase CLI a rafraichir.",
    "",
    "Execute:",
    "  .\\firebase-login-dashboard.cmd",
    "",
    "Puis relance:",
    "  .\\audit-live-coach-access.cmd"
  ].join("\n");
}

async function main() {
  const registry = readAccessRegistry();
  const token = await readAccessToken();
  const coachRows = [];
  for (const coach of registry.pilotCoaches.filter((coach) => coach.accessMode !== "admin_shared_account")) {
    const profiles = await queryUsersByEmail(token, coach.email);
    const authUsers = await queryAuthUsersByEmail(token, coach.email);
    coachRows.push(summarizeCoach(coach, profiles, authUsers));
  }
  const adminRows = [];
  for (const adminAccount of registry.adminAccounts) {
    const profiles = await queryUsersByEmail(token, adminAccount.email);
    const authUsers = await queryAuthUsersByEmail(token, adminAccount.email);
    adminRows.push(summarizeAdmin(adminAccount, profiles, authUsers));
  }
  const failed = [...coachRows, ...adminRows].filter((row) => row.status !== "OK");
  const hygieneRows = [...coachRows, ...adminRows].filter((row) => row.hygieneIssues.length > 0);
  const result = {
    ok: failed.length === 0,
    checkedAt: new Date().toISOString(),
    projectId,
    summary: {
      ok: coachRows.length + adminRows.length - failed.length,
      toFix: failed.length,
      hygieneWarnings: hygieneRows.length,
      coaches: coachRows.length,
      admins: adminRows.length
    },
    hygiene: {
      status: hygieneRows.length ? "A_VERIFIER_SANS_BLOCAGE" : "OK",
      rule: "Ne jamais desactiver un profil duplique avant d'avoir confirme l'UID de la session Firebase Auth active.",
      profilesToReview: hygieneRows.map((row) => ({
        email: row.email,
        profileCount: row.profileCount,
        authUids: row.authUsers.map((user) => user.uid),
        uids: row.profiles.map((profile) => profile.uid),
        issues: row.hygieneIssues
      }))
    },
    admins: adminRows,
    coaches: coachRows
  };
  console.log(JSON.stringify(result, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  const hint = authHint(error);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
});
