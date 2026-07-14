import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const teamPortalSource = readFileSync(new URL("../public/portal.js", import.meta.url), "utf8");
const coachSource = readFileSync(new URL("../../firebase-dashboard/public/app.js", import.meta.url), "utf8");
const contractSource = readFileSync(new URL("../../PORTAL_CONTRACT.md", import.meta.url), "utf8");

function objectConstant(source, name) {
  const match = source.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  assert.ok(match, `${name} should exist`);
  return JSON.parse(match[1]);
}

test("both dashboards use the same versioned portal contract", () => {
  assert.match(teamPortalSource, /const PORTAL_CONTRACT_VERSION = "cfsb-portal-v1"/);
  assert.match(coachSource, /const PORTAL_CONTRACT_VERSION = "cfsb-portal-v1"/);
  assert.match(contractSource, /contrat courant est `cfsb-portal-v1`/);
});

test("coach and team member mappings stay symmetrical", () => {
  const coachByMember = objectConstant(teamPortalSource, "COACH_ID_BY_MEMBER");
  const memberByCoach = objectConstant(coachSource, "TEAM_MEMBER_BY_COACH_ID");
  const inverted = Object.fromEntries(Object.entries(coachByMember).map(([memberId, coachId]) => [coachId, memberId]));
  assert.deepEqual(memberByCoach, inverted);
});

test("each frontend initializes only its own Firebase project", () => {
  assert.doesNotMatch(coachSource, /projectId:\s*["']cfsb-roadmap-trimestrielle["']/);
  assert.doesNotMatch(teamPortalSource, /projectId:\s*["']cfsb-dashboard-coach-aa9a4["']/);
  assert.match(coachSource, /projectId:\s*"cfsb-dashboard-coach-aa9a4"/);
  assert.match(teamPortalSource, /import \{ firebaseConfig \} from "\.\/firebase-config\.js"/);
});

test("cross-dashboard navigation is done through explicit deep links", () => {
  assert.match(teamPortalSource, /COACH_DASHBOARD_URL/);
  assert.match(coachSource, /TEAM_PORTAL_URL/);
  assert.match(contractSource, /Un parametre d'URL ne donne aucun droit/);
});

test("coach dashboard keeps the authenticated tab header helpers", () => {
  assert.match(coachSource, /function tabTitle\(\)/);
  assert.match(coachSource, /function tabDescription\(\)/);
  assert.match(coachSource, /<h2>\$\{tabTitle\(\)\}<\/h2>/);
  assert.match(coachSource, /<p>\$\{tabDescription\(\)\}<\/p>/);
});
