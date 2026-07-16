const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2 };

export function startOfWeekIso(value = new Date()) {
  const date = localDate(value);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return localIso(date);
}

export function shiftWeekIso(weekStart, amount) {
  const date = localDate(weekStart);
  date.setDate(date.getDate() + Number(amount || 0) * 7);
  return startOfWeekIso(date);
}

export function quarterId(value = new Date()) {
  const date = localDate(value);
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

export function shiftQuarterId(value, amount) {
  const match = String(value || "").match(/^(\d{4})-Q([1-4])$/);
  const current = match ? new Date(Number(match[1]), (Number(match[2]) - 1) * 3, 1) : new Date();
  current.setMonth(current.getMonth() + Number(amount || 0) * 3);
  return quarterId(current);
}

export function metricStatus(metric, entry) {
  if (!metricTargetIsValidated(metric)) return "missing_target";
  const value = Number(entry?.value);
  if (!Number.isFinite(value)) return "missing";
  const target = Number(metric?.targetValue);
  const maximum = Number(metric?.targetMax);
  const direction = metric?.targetDirection || "gte";
  if (direction === "lte") return value <= target ? "on_track" : "off_track";
  if (direction === "exact") return value === target ? "on_track" : "off_track";
  if (direction === "range") {
    if (!Number.isFinite(maximum)) return "missing_target";
    return value >= target && value <= maximum ? "on_track" : "off_track";
  }
  return value >= target ? "on_track" : "off_track";
}

export function targetLabel(metric) {
  if (!metricTargetIsValidated(metric)) return "Cible a valider";
  const unit = String(metric?.unit || "").trim();
  const suffix = unit ? ` ${unit}` : "";
  const target = numericLabel(metric?.targetValue);
  if ((metric?.targetDirection || "gte") === "range") {
    return `${target} a ${numericLabel(metric?.targetMax)}${suffix}`;
  }
  const symbol = metric?.targetDirection === "lte" ? "<=" : metric?.targetDirection === "exact" ? "=" : ">=";
  return `${symbol} ${target}${suffix}`;
}

export function metricTargetIsValidated(metric) {
  if (metric?.targetStatus === "to_validate") return false;
  return Number.isFinite(Number(metric?.targetValue));
}

export function sortPilotageIssues(issues) {
  return [...issues].sort((a, b) => {
    const status = Number(a.status === "solved") - Number(b.status === "solved");
    if (status) return status;
    const priority = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (priority) return priority;
    return timestampValue(a.createdAt) - timestampValue(b.createdAt);
  });
}

export function pilotageSummary({ metrics = [], entries = [], rocks = [], issues = [], tasks = [], weekStart, quarter }) {
  const entryMap = new Map(entries.filter((entry) => entry.weekStart === weekStart).map((entry) => [entry.metricId, entry]));
  const activeMetrics = metrics.filter((metric) => metric.active !== false);
  const metricStates = activeMetrics.map((metric) => metricStatus(metric, entryMap.get(metric.id)));
  const quarterRocks = rocks.filter((rock) => rock.archivedAt == null && rock.quarter === quarter);
  return {
    metricCount: activeMetrics.length,
    offTrackMetrics: metricStates.filter((status) => status === "off_track").length,
    missingMetrics: metricStates.filter((status) => status === "missing").length,
    missingTargets: metricStates.filter((status) => status === "missing_target").length,
    offTrackRocks: quarterRocks.filter((rock) => rock.status === "off_track").length,
    openIssues: issues.filter((issue) => issue.status !== "solved").length,
    openActions: tasks.filter((task) => task.status === "open" && (task.sourceType === "pilotage" || task.sourceType === "pilotage_issue")).length
  };
}

function localDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function localIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numericLabel(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number).replace(".", ",") : "?";
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return new Date(value).getTime() || 0;
}
