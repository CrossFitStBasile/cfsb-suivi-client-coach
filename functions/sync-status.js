"use strict";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function coachSyncPipeline({ source = "", sourceType = "", questionnaireOnly = false } = {}) {
  const normalizedSource = cleanString(source).toLowerCase();
  const combined = `${cleanString(sourceType)} ${normalizedSource}`.toLowerCase();
  if (questionnaireOnly || combined.includes("questionnaire")) return "questionnaire";
  if ([
    "firebase_firestore_sync_request_coach",
    "firebase_firestore_sync_request_all"
  ].includes(normalizedSource)) return "dashboard_full";
  if (combined.includes("coachrx")) return "coachrx";
  if (combined.includes("rebooking")) return "rebooking";
  if (combined.includes("checkup")) return "checkups";
  if (combined.includes("client_enrichment") || combined.includes("csm_client")) return "client_enrichment";
  if (combined.includes("client_directory") || combined.includes("ghl_contact")) return "client_directory";
  if (combined.includes("sync_sheets") || combined.includes("dashboard_sync")) return "dashboard_full";
  return "other";
}

function numeric(value) {
  return Number(value || 0);
}

function warningsFrom(result = {}) {
  return Array.isArray(result.warnings) ? result.warnings.slice(0, 5) : [];
}

function warningCountFrom(result = {}) {
  return Array.isArray(result.warnings) ? result.warnings.length : 0;
}

function buildPipelineStatusData({ result = {}, pipeline, source = "", runId = "", requestedBy = "" } = {}) {
  const warnings = warningsFrom(result);
  const warningCount = warningCountFrom(result);
  return {
    pipeline,
    coachId: cleanString(result.coachId),
    coachName: cleanString(result.coachName),
    status: result.status === "warning" || warningCount ? "warning" : "ok",
    warningCount,
    warnings,
    clientsImported: numeric(result.clientsImported || result.clientsEnriched),
    clientsEnriched: numeric(result.clientsEnriched),
    clientsMissingPhone: numeric(result.clientsMissingPhone || result.diagnostics?.importedClients?.missingPhone),
    rebookingsImported: numeric(result.rebookingsImported),
    checkupsImported: numeric(result.checkupsImported),
    questionnaireResponsesImported: numeric(result.questionnaireResponsesImported),
    sourceImportRunId: cleanString(runId),
    directSourceType: cleanString(result.sourceType),
    requestedByEmail: cleanString(requestedBy),
    source: cleanString(source)
  };
}

function buildLegacyCoachStatusPatch({ result = {}, pipeline, source = "", runId = "", requestedBy = "" } = {}) {
  const data = buildPipelineStatusData({ result, pipeline, source, runId, requestedBy });
  const common = {
    coachId: data.coachId,
    coachName: data.coachName,
    lastPipeline: pipeline,
    lastPipelineStatus: data.status,
    lastPipelineWarningCount: data.warningCount
  };

  if (["coachrx", "dashboard_full"].includes(pipeline)) {
    return {
      ...common,
      status: data.status,
      warningCount: data.warningCount,
      warnings: data.warnings,
      clientsImported: data.clientsImported,
      clientsEnriched: data.clientsEnriched,
      clientsMissingPhone: data.clientsMissingPhone,
      rebookingsImported: data.rebookingsImported,
      checkupsImported: data.checkupsImported,
      questionnaireResponsesImported: data.questionnaireResponsesImported,
      sourceImportRunId: data.sourceImportRunId,
      directSourceType: data.directSourceType,
      requestedByEmail: data.requestedByEmail,
      source: data.source
    };
  }
  if (pipeline === "questionnaire") {
    return {
      ...common,
      questionnaireStatus: data.status,
      questionnaireWarningCount: data.warningCount,
      questionnaireWarnings: data.warnings,
      questionnaireResponsesImported: data.questionnaireResponsesImported,
      questionnaireSourceImportRunId: data.sourceImportRunId,
      questionnaireSource: data.source
    };
  }
  if (pipeline === "rebooking") {
    return {
      ...common,
      rebookingStatus: data.status,
      rebookingWarningCount: data.warningCount,
      rebookingsImported: data.rebookingsImported,
      rebookingSourceImportRunId: data.sourceImportRunId,
      rebookingSource: data.source
    };
  }
  if (pipeline === "checkups") {
    return {
      ...common,
      checkupStatus: data.status,
      checkupWarningCount: data.warningCount,
      checkupsImported: data.checkupsImported,
      checkupSourceImportRunId: data.sourceImportRunId,
      checkupSource: data.source
    };
  }
  if (["client_directory", "client_enrichment"].includes(pipeline)) {
    return {
      ...common,
      [`${pipeline}Status`]: data.status,
      [`${pipeline}ClientsImported`]: data.clientsImported,
      [`${pipeline}ClientsEnriched`]: data.clientsEnriched,
      [`${pipeline}SourceImportRunId`]: data.sourceImportRunId,
      [`${pipeline}Source`]: data.source
    };
  }
  return common;
}

module.exports = {
  buildLegacyCoachStatusPatch,
  buildPipelineStatusData,
  coachSyncPipeline
};
