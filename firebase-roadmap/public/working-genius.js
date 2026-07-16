export const WORKING_GENIUS_TYPES = [
  { code: "W", label: "Wonder" },
  { code: "I", label: "Invention" },
  { code: "D", label: "Discernment" },
  { code: "G", label: "Galvanizing" },
  { code: "E", label: "Enablement" },
  { code: "T", label: "Tenacity" }
];

export const WORKING_GENIUS_BUCKETS = [
  ["geniuses", "Geniuses"],
  ["competencies", "Competencies"],
  ["frustrations", "Frustrations"]
];

const VALID_CODES = new Set(WORKING_GENIUS_TYPES.map((type) => type.code));

export function normalizeWorkingGeniusCodes(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim().toUpperCase()).filter((code) => VALID_CODES.has(code)))];
}

export function normalizeWorkingGeniusProfile(profile = {}) {
  return {
    teamMemberId: String(profile.teamMemberId || "").trim(),
    geniuses: normalizeWorkingGeniusCodes(profile.geniuses),
    competencies: normalizeWorkingGeniusCodes(profile.competencies),
    frustrations: normalizeWorkingGeniusCodes(profile.frustrations),
    assessmentDate: String(profile.assessmentDate || "").trim(),
    reportUrl: String(profile.reportUrl || "").trim(),
    sourceLabel: String(profile.sourceLabel || "Rapport officiel Working Genius").trim(),
    sourceType: "official_report",
    notes: String(profile.notes || "").trim()
  };
}

export function workingGeniusProfileStatus(profile = {}) {
  const normalized = normalizeWorkingGeniusProfile(profile);
  const counts = WORKING_GENIUS_BUCKETS.map(([key]) => normalized[key].length);
  const selected = counts.reduce((sum, count) => sum + count, 0);
  if (!selected && !normalized.reportUrl) return "empty";
  const unique = new Set([...normalized.geniuses, ...normalized.competencies, ...normalized.frustrations]);
  return counts.every((count) => count === 2) && unique.size === 6 ? "complete" : "partial";
}

export function validateWorkingGeniusProfile(profile = {}) {
  const normalized = normalizeWorkingGeniusProfile(profile);
  const errors = [];
  if (!normalized.teamMemberId) errors.push("Le membre est requis.");
  for (const [key, label] of WORKING_GENIUS_BUCKETS) {
    if (normalized[key].length > 2) errors.push(`${label}: maximum de deux resultats.`);
  }
  const allCodes = [...normalized.geniuses, ...normalized.competencies, ...normalized.frustrations];
  if (new Set(allCodes).size !== allCodes.length) errors.push("Chaque type Working Genius doit apparaitre dans une seule categorie.");
  if (!allCodes.length && !normalized.reportUrl) errors.push("Ajoute au moins un resultat ou le lien du rapport officiel.");
  if (normalized.reportUrl && !/^https:\/\//i.test(normalized.reportUrl)) errors.push("Le lien du rapport doit commencer par https://.");
  return {
    valid: errors.length === 0,
    errors,
    profile: normalized,
    status: workingGeniusProfileStatus(normalized),
    selected: allCodes.length
  };
}

export function workingGeniusType(code = "") {
  return WORKING_GENIUS_TYPES.find((type) => type.code === String(code).toUpperCase()) || null;
}

export function workingGeniusTeamSummary(members = [], profiles = {}) {
  const activeMembers = members.filter((member) => member && member.id);
  const summary = { total: activeMembers.length, complete: 0, partial: 0, missing: 0 };
  activeMembers.forEach((member) => {
    const status = workingGeniusProfileStatus(profiles[member.id] || {});
    if (status === "complete") summary.complete += 1;
    else if (status === "partial") summary.partial += 1;
    else summary.missing += 1;
  });
  return summary;
}

export function workingGeniusTeamMap(members = [], profiles = {}) {
  return WORKING_GENIUS_TYPES.map((type) => ({
    ...type,
    members: members
      .filter((member) => member?.id && normalizeWorkingGeniusProfile(profiles[member.id] || {}).geniuses.includes(type.code))
      .map((member) => ({ id: member.id, name: member.name || "Membre" }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
  }));
}
