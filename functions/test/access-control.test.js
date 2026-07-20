"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { canProfileActOnCoach } = require("../access-control");

const allowedCoachIds = new Set(["15935", "15928"]);

test("un coach ne peut agir que sur son propre coachId normalise", () => {
  const profile = { active: true, role: "coach", coachId: " 15935 " };
  assert.equal(canProfileActOnCoach(profile, "15935", { allowedCoachIds }), true);
  assert.equal(canProfileActOnCoach(profile, "15928", { allowedCoachIds }), false);
});

test("deux coachId pilotes distincts ne suffisent jamais a autoriser l'acces", () => {
  const profile = { active: true, role: "coach", coachId: "15935" };
  assert.equal(canProfileActOnCoach(profile, "15928", { allowedCoachIds }), false);
});

test("un profil coach inactif ou non pilote est refuse", () => {
  assert.equal(canProfileActOnCoach(
    { active: false, role: "coach", coachId: "15935" },
    "15935",
    { allowedCoachIds }
  ), false);
  assert.equal(canProfileActOnCoach(
    { active: true, role: "coach", coachId: "99999" },
    "99999",
    { allowedCoachIds }
  ), false);
});

test("l'administration conserve l'acces multi-coachs", () => {
  assert.equal(canProfileActOnCoach({ active: true, role: "admin" }, "15928", { allowedCoachIds }), true);
});

test("un profil administrateur inactif est refuse", () => {
  assert.equal(canProfileActOnCoach({ active: false, role: "admin" }, "15928", { allowedCoachIds }), false);
});
