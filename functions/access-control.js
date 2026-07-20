"use strict";

function normalizeCoachId(value) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function canProfileActOnCoach(profile = {}, targetCoachId = "", options = {}) {
  const target = normalizeCoachId(targetCoachId);
  if (!target) return false;
  if (profile.role === "admin") return profile.active === true;

  const actor = normalizeCoachId(profile.coachId);
  if (profile.active !== true || profile.role !== "coach" || !actor || actor !== target) {
    return false;
  }

  const allowedCoachIds = options.allowedCoachIds;
  if (allowedCoachIds) {
    const allowed = allowedCoachIds instanceof Set
      ? allowedCoachIds
      : new Set(Array.from(allowedCoachIds, normalizeCoachId));
    if (!allowed.has(actor)) return false;
  }
  return true;
}

module.exports = {
  canProfileActOnCoach,
  normalizeCoachId
};
