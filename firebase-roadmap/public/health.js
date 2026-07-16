export function dashboardHealthReport({
  submissions = [],
  teamMembers = [],
  pilotageMetrics = [],
  clientErrors = [],
  memberForSubmission = () => null,
  memberDocumentUrl = () => "",
  isActiveMember = defaultIsActiveMember
} = {}) {
  const visibleSubmissions = submissions.filter((submission) => !submission?.deletedAt);
  const importedSubmissions = visibleSubmissions.filter(isImportedSubmission);
  const nativeSubmissions = visibleSubmissions.filter((submission) => !isImportedSubmission(submission));
  const activeMembers = teamMembers.filter(isActiveMember);
  const activeMetrics = pilotageMetrics.filter((metric) => metric?.active !== false);

  const unlinkedSubmissions = visibleSubmissions.filter((submission) => !memberForSubmission(submission));
  const missingDocumentMembers = activeMembers.filter((member) => !String(memberDocumentUrl(member) || "").trim());
  const missingTargetMetrics = activeMetrics.filter((metric) => !hasValidatedTarget(metric));
  const unresolvedErrors = clientErrors.filter((error) => !error?.resolvedAt);

  return {
    unresolvedErrors,
    unlinkedSubmissions,
    missingDocumentMembers,
    missingTargetMetrics,
    importedSubmissions,
    nativeSubmissions,
    latestSubmissionAt: latestTimestamp(visibleSubmissions.map((submission) => submission?.submittedAt)),
    latestImportAt: latestTimestamp(importedSubmissions.map((submission) => submission?.importMeta?.sourceExportedAt)),
    status: unresolvedErrors.length
      ? "error"
      : unlinkedSubmissions.length || missingDocumentMembers.length || missingTargetMetrics.length
        ? "attention"
        : "healthy"
  };
}

export function hasValidatedTarget(metric) {
  if (metric?.targetStatus === "to_validate") return false;
  if (metric?.targetValue == null || metric.targetValue === "") return false;
  return Number.isFinite(Number(metric.targetValue));
}

export function isImportedSubmission(submission) {
  return submission?.source === "apps_script_import"
    || submission?.authorUid === "legacy-apps-script"
    || Boolean(submission?.importMeta?.sourceKind);
}

export function latestTimestamp(values = []) {
  return values.reduce((latest, value) => Math.max(latest, timestampValue(value)), 0);
}

export function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function defaultIsActiveMember(member) {
  return member?.active !== false && !member?.archivedAt && member?.status !== "archived";
}
