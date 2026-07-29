"use strict";

const DEFAULT_PROJECT_ID = "cfsb-dashboard-coach-aa9a4";
const DEFAULT_COLLECTION_ID = "questionnaireSchedules";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_INDEX_PAGE_SIZE = 0;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_TOTAL_TIMEOUT_MS = 120000;
const DEFAULT_MAX_PAGES = 1000;
const DEFAULT_MAX_DOCUMENTS = 10000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FIRESTORE_FIELD_PATHS = Object.freeze([
  "status",
  "nextSendAt"
]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readFirestoreString(document, fieldName) {
  const value = document?.fields?.[fieldName];
  if (!value) return { present: false, valid: false, value: "" };
  if (typeof value.stringValue !== "string") {
    return { present: true, valid: false, value: "" };
  }
  return { present: true, valid: true, value: value.stringValue };
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

function summarizeSchedules(documents, today) {
  if (!Array.isArray(documents)) {
    throw new TypeError("documents must be an array");
  }
  if (!isValidIsoDate(today)) {
    throw new TypeError("today must be a valid YYYY-MM-DD date");
  }

  const summary = {
    documents: documents.length,
    active: 0,
    activeDue: 0,
    activeFuture: 0,
    activeInvalidDate: 0,
    invalidStatus: 0,
    inactive: 0
  };

  for (const document of documents) {
    const status = readFirestoreString(document, "status");
    if (!status.valid || !["active", "paused"].includes(status.value)) {
      summary.invalidStatus += 1;
      continue;
    }
    if (status.value === "paused") {
      summary.inactive += 1;
      continue;
    }

    summary.active += 1;
    const nextSendAt = readFirestoreString(document, "nextSendAt");
    if (!nextSendAt.valid || !isValidIsoDate(nextSendAt.value)) {
      summary.activeInvalidDate += 1;
      continue;
    }
    if (nextSendAt.value <= today) {
      summary.activeDue += 1;
    } else {
      summary.activeFuture += 1;
    }
  }

  return Object.freeze(summary);
}

function buildListDocumentsUrl({
  projectId = DEFAULT_PROJECT_ID,
  collectionId = DEFAULT_COLLECTION_ID,
  pageSize = DEFAULT_PAGE_SIZE,
  pageToken = ""
} = {}) {
  if (!/^[a-z0-9][a-z0-9-]{4,62}$/.test(projectId)) {
    throw new TypeError("projectId is invalid");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(collectionId)) {
    throw new TypeError("collectionId is invalid");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new TypeError("pageSize must be between 1 and 1000");
  }

  const encodedProject = encodeURIComponent(projectId);
  const encodedCollection = encodeURIComponent(collectionId);
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${encodedProject}`
      + `/databases/(default)/documents/${encodedCollection}`
  );
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("orderBy", "__name__");
  for (const fieldPath of FIRESTORE_FIELD_PATHS) {
    url.searchParams.append("mask.fieldPaths", fieldPath);
  }
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url;
}

async function fetchSchedulePage({
  fetchImpl = globalThis.fetch,
  accessToken,
  projectId = DEFAULT_PROJECT_ID,
  collectionId = DEFAULT_COLLECTION_ID,
  pageSize = DEFAULT_PAGE_SIZE,
  pageToken = "",
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }
  if (typeof accessToken !== "string" || !accessToken) {
    throw new TypeError("accessToken is required");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("timeoutMs must be a positive integer");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      buildListDocumentsUrl({
        projectId,
        collectionId,
        pageSize,
        pageToken
      }),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        redirect: "error",
        signal: controller.signal
      }
    );

    if (!response || typeof response.ok !== "boolean") {
      throw new Error("Firestore returned an invalid response");
    }
    if (!response.ok) {
      throw new Error(
        `Firestore read failed with HTTP ${response.status || "unknown"}`
      );
    }

    const payload = await boundedResponseJson(response, "documents");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Firestore returned an invalid payload");
    }
    if (payload.documents !== undefined && !Array.isArray(payload.documents)) {
      throw new Error("Firestore returned an invalid documents collection");
    }
    if (
      payload.nextPageToken !== undefined
      && typeof payload.nextPageToken !== "string"
    ) {
      throw new Error("Firestore returned an invalid pagination token");
    }

    return {
      documents: payload.documents || [],
      nextPageToken: payload.nextPageToken || ""
    };
  } finally {
    clearTimeout(timer);
  }
}

async function listQuestionnaireScheduleDocuments({
  fetchImpl = globalThis.fetch,
  accessToken,
  projectId = DEFAULT_PROJECT_ID,
  collectionId = DEFAULT_COLLECTION_ID,
  pageSize = DEFAULT_PAGE_SIZE,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
  maxPages = DEFAULT_MAX_PAGES,
  maxDocuments = DEFAULT_MAX_DOCUMENTS
} = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new TypeError("maxPages must be a positive integer");
  }
  if (!Number.isInteger(maxDocuments) || maxDocuments < 1) {
    throw new TypeError("maxDocuments must be a positive integer");
  }
  if (!Number.isInteger(totalTimeoutMs) || totalTimeoutMs < 1) {
    throw new TypeError("totalTimeoutMs must be a positive integer");
  }

  const documents = [];
  const seenTokens = new Set();
  const seenDocumentNames = new Set();
  const documentPrefix =
    `projects/${projectId}/databases/(default)/documents/${collectionId}/`;
  let pageToken = "";
  let pages = 0;
  const deadlineAt = Date.now() + totalTimeoutMs;

  do {
    if (pages >= maxPages) {
      throw new Error("Firestore pagination exceeded the safety limit");
    }
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new Error("Firestore pagination exceeded the total time limit");
    }
    const page = await fetchSchedulePage({
      fetchImpl,
      accessToken,
      projectId,
      collectionId,
      pageSize,
      pageToken,
      timeoutMs: Math.min(timeoutMs, remainingMs)
    });
    pages += 1;
    for (const document of page.documents) {
      const documentName = document?.name;
      const documentId = typeof documentName === "string"
        && documentName.startsWith(documentPrefix)
        ? documentName.slice(documentPrefix.length)
        : "";
      if (!documentId || documentId.includes("/")) {
        throw new Error("Firestore returned an invalid document resource name");
      }
      if (seenDocumentNames.has(documentName)) {
        throw new Error("Firestore returned a duplicate document resource name");
      }
      seenDocumentNames.add(documentName);
      documents.push(document);
      if (documents.length > maxDocuments) {
        throw new Error("Firestore document count exceeded the safety limit");
      }
    }
    pageToken = page.nextPageToken;
    if (pageToken) {
      if (seenTokens.has(pageToken)) {
        throw new Error("Firestore returned a repeated pagination token");
      }
      seenTokens.add(pageToken);
    }
  } while (pageToken);

  return { documents, pages };
}

function buildListIndexesUrl({
  projectId = DEFAULT_PROJECT_ID,
  collectionId = DEFAULT_COLLECTION_ID,
  pageSize = DEFAULT_INDEX_PAGE_SIZE,
  pageToken = ""
} = {}) {
  if (!/^[a-z0-9][a-z0-9-]{4,62}$/.test(projectId)) {
    throw new TypeError("projectId is invalid");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(collectionId)) {
    throw new TypeError("collectionId is invalid");
  }
  if (pageSize !== DEFAULT_INDEX_PAGE_SIZE) {
    throw new TypeError("index pageSize must use the API-supported value 0");
  }

  const encodedProject = encodeURIComponent(projectId);
  const encodedCollection = encodeURIComponent(collectionId);
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${encodedProject}`
      + `/databases/(default)/collectionGroups/${encodedCollection}/indexes`
  );
  url.searchParams.set("pageSize", String(pageSize));
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url;
}

async function fetchIndexPage({
  fetchImpl = globalThis.fetch,
  accessToken,
  projectId = DEFAULT_PROJECT_ID,
  collectionId = DEFAULT_COLLECTION_ID,
  pageSize = DEFAULT_INDEX_PAGE_SIZE,
  pageToken = "",
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }
  if (typeof accessToken !== "string" || !accessToken) {
    throw new TypeError("accessToken is required");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("timeoutMs must be a positive integer");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      buildListIndexesUrl({
        projectId,
        collectionId,
        pageSize,
        pageToken
      }),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        redirect: "error",
        signal: controller.signal
      }
    );

    if (!response || typeof response.ok !== "boolean") {
      throw new Error("Firestore returned an invalid index response");
    }
    if (!response.ok) {
      throw new Error(
        `Firestore index read failed with HTTP ${response.status || "unknown"}`
      );
    }

    const payload = await boundedResponseJson(response, "indexes");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Firestore returned an invalid index payload");
    }
    if (payload.indexes !== undefined && !Array.isArray(payload.indexes)) {
      throw new Error("Firestore returned an invalid indexes collection");
    }
    if (
      payload.nextPageToken !== undefined
      && typeof payload.nextPageToken !== "string"
    ) {
      throw new Error("Firestore returned an invalid index pagination token");
    }

    return {
      indexes: payload.indexes || [],
      nextPageToken: payload.nextPageToken || ""
    };
  } finally {
    clearTimeout(timer);
  }
}

async function listQuestionnaireScheduleIndexes({
  fetchImpl = globalThis.fetch,
  accessToken,
  projectId = DEFAULT_PROJECT_ID,
  collectionId = DEFAULT_COLLECTION_ID,
  pageSize = DEFAULT_INDEX_PAGE_SIZE,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
  maxPages = DEFAULT_MAX_PAGES
} = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new TypeError("maxPages must be a positive integer");
  }
  if (!Number.isInteger(totalTimeoutMs) || totalTimeoutMs < 1) {
    throw new TypeError("totalTimeoutMs must be a positive integer");
  }

  const indexes = [];
  const seenTokens = new Set();
  let pageToken = "";
  let pages = 0;
  const deadlineAt = Date.now() + totalTimeoutMs;

  do {
    if (pages >= maxPages) {
      throw new Error("Firestore index pagination exceeded the safety limit");
    }
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new Error("Firestore index pagination exceeded the total time limit");
    }
    const page = await fetchIndexPage({
      fetchImpl,
      accessToken,
      projectId,
      collectionId,
      pageSize,
      pageToken,
      timeoutMs: Math.min(timeoutMs, remainingMs)
    });
    pages += 1;
    indexes.push(...page.indexes);
    pageToken = page.nextPageToken;
    if (pageToken) {
      if (seenTokens.has(pageToken)) {
        throw new Error("Firestore returned a repeated index pagination token");
      }
      seenTokens.add(pageToken);
    }
  } while (pageToken);

  return { indexes, pages };
}

function isQuestionnaireScheduleIndex(
  index,
  {
    projectId = DEFAULT_PROJECT_ID,
    collectionId = DEFAULT_COLLECTION_ID
  } = {}
) {
  const namePrefix =
    `projects/${projectId}/databases/(default)/collectionGroups/`
      + `${collectionId}/indexes/`;
  const indexId = typeof index?.name === "string"
    && index.name.startsWith(namePrefix)
    ? index.name.slice(namePrefix.length)
    : "";
  const hasOwn = (fieldName) =>
    Object.prototype.hasOwnProperty.call(index || {}, fieldName);
  if (
    !index
    || !indexId
    || indexId.includes("/")
    || index.queryScope !== "COLLECTION"
    || (
      index.apiScope !== undefined
      && index.apiScope !== "ANY_API"
    )
    || (hasOwn("density") && index.density !== "SPARSE_ALL")
    || (hasOwn("multikey") && index.multikey !== false)
    || (hasOwn("shardCount") && index.shardCount !== 0)
    || (hasOwn("unique") && index.unique !== false)
    || hasOwn("searchIndexOptions")
    || !Array.isArray(index.fields)
  ) {
    return false;
  }
  if (index.fields.length !== 3) return false;
  if (
    index.fields.some(
      (field) =>
        !field
        || Object.keys(field).sort().join(",") !== "fieldPath,order"
    )
  ) {
    return false;
  }
  if (
    index.fields[0]?.fieldPath !== "status"
    || index.fields[0]?.order !== "ASCENDING"
    || index.fields[1]?.fieldPath !== "nextSendAt"
    || index.fields[1]?.order !== "ASCENDING"
  ) {
    return false;
  }
  return index.fields[2]?.fieldPath === "__name__"
    && index.fields[2]?.order === "ASCENDING";
}

function summarizeQuestionnaireScheduleIndexes(indexes, options = {}) {
  if (!Array.isArray(indexes)) {
    throw new TypeError("indexes must be an array");
  }
  const matching = indexes.filter(
    (index) => isQuestionnaireScheduleIndex(index, options)
  );
  return Object.freeze({
    indexes: indexes.length,
    matching: matching.length,
    ready: matching.filter((index) => index.state === "READY").length,
    building: matching.filter((index) => index.state === "CREATING").length,
    failed: matching.filter(
      (index) => !["READY", "CREATING"].includes(index.state)
    ).length
  });
}

async function boundedResponseJson(response, resourceLabel) {
  if (typeof response.text !== "function") {
    throw new Error(`Firestore returned an invalid ${resourceLabel} body`);
  }
  let body;
  try {
    body = await response.text();
  } catch {
    throw new Error(`Firestore returned an unreadable ${resourceLabel} body`);
  }
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error(`Firestore ${resourceLabel} response exceeded the safety limit`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Firestore returned invalid ${resourceLabel} JSON`);
  }
}

function torontoClock(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("now must be a valid Date");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    today: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function addIsoDays(value, days) {
  if (!isValidIsoDate(value) || !Number.isInteger(days)) {
    throw new TypeError("addIsoDays requires an ISO date and integer days");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function schedulerHorizonDate(now = new Date()) {
  const clock = torontoClock(now);
  const currentMinute = clock.hour * 60 + clock.minute;
  const runMinute = 7 * 60 + 15;
  return currentMinute < runMinute
    ? clock.today
    : addIsoDays(clock.today, 1);
}

function schedulerWindowState(
  now = new Date(),
  { beforeMinutes = 360, afterMinutes = 10 } = {}
) {
  if (!Number.isInteger(beforeMinutes) || beforeMinutes < 360 || beforeMinutes >= 1440) {
    throw new TypeError("beforeMinutes must be between 360 and 1439");
  }
  if (!Number.isInteger(afterMinutes) || afterMinutes < 10 || afterMinutes >= 1440) {
    throw new TypeError("afterMinutes must be between 10 and 1439");
  }

  const clock = torontoClock(now);
  const currentMinute = clock.hour * 60 + clock.minute;
  const runMinute = 7 * 60 + 15;
  const minutesUntilRun = (runMinute - currentMinute + 1440) % 1440;
  const minutesSinceRun = (currentMinute - runMinute + 1440) % 1440;
  return Object.freeze({
    blocked:
      minutesUntilRun <= beforeMinutes
      || minutesSinceRun <= afterMinutes,
    beforeMinutes,
    afterMinutes,
    minutesUntilRun,
    minutesSinceRun
  });
}

module.exports = {
  DEFAULT_COLLECTION_ID,
  DEFAULT_INDEX_PAGE_SIZE,
  DEFAULT_MAX_DOCUMENTS,
  DEFAULT_MAX_PAGES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PROJECT_ID,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOTAL_TIMEOUT_MS,
  FIRESTORE_FIELD_PATHS,
  addIsoDays,
  buildListIndexesUrl,
  buildListDocumentsUrl,
  fetchIndexPage,
  fetchSchedulePage,
  isValidIsoDate,
  isQuestionnaireScheduleIndex,
  listQuestionnaireScheduleIndexes,
  listQuestionnaireScheduleDocuments,
  readFirestoreString,
  schedulerWindowState,
  schedulerHorizonDate,
  summarizeQuestionnaireScheduleIndexes,
  summarizeSchedules,
  torontoClock
};
