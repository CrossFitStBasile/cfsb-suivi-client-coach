const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "app.js"), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Fonction introuvable: ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Fonction incomplete: ${name}`);
}

const functions = [
  "dateValue",
  "normalizePhone",
  "questionnaireResponsePhone",
  "questionnaireSendPhone",
  "questionnaireSendDate",
  "questionnaireSendHasResponse",
  "latestSendForClient"
].map(extractFunction).join("\n\n");

const sandbox = {
  console,
  state: { data: { questionnaireResponses: [] } }
};

vm.runInNewContext(`${functions}
globalThis.__helpers = {
  questionnaireSendHasResponse,
  questionnaireSendPhone,
  questionnaireResponsePhone,
  latestSendForClient
};`, sandbox, { filename: "app-questionnaire-helpers.js" });

const h = sandbox.__helpers;
const send = {
  clientPhoneNormalized: "819-277-1825",
  sentAt: "2026-06-03T12:00:00.000Z"
};

const oldResponse = {
  clientPhoneNormalized: "8192771825",
  submittedAt: "2026-06-01T12:00:00.000Z"
};

const sameMomentResponse = {
  clientPhoneNormalized: "1 (819) 277-1825",
  submittedAt: "2026-06-03T12:00:00.000Z"
};

const laterResponse = {
  phone: "8192771825",
  submittedAt: "2026-06-04T08:00:00.000Z"
};

const otherClientResponse = {
  clientPhoneNormalized: "5145550000",
  submittedAt: "2026-06-04T08:00:00.000Z"
};

const missingDateResponse = {
  clientPhoneNormalized: "8192771825"
};

sandbox.state.data.questionnaireSends = [
  { id: "old-send", clientId: "client-1", sentAt: "2026-05-01T08:00:00.000Z" },
  { id: "other-client", clientId: "client-2", sentAt: "2026-06-10T08:00:00.000Z" },
  { id: "new-send", clientId: "client-1", sentAt: "2026-06-01T08:00:00.000Z" }
];

const results = {
  normalizesSendPhone: h.questionnaireSendPhone(send) === "8192771825",
  normalizesResponsePhone: h.questionnaireResponsePhone(sameMomentResponse) === "8192771825",
  oldResponseDoesNotCloseNewSend: !h.questionnaireSendHasResponse(send, [oldResponse]),
  sameMomentResponseClosesSend: h.questionnaireSendHasResponse(send, [sameMomentResponse]),
  laterResponseClosesSend: h.questionnaireSendHasResponse(send, [laterResponse]),
  otherClientDoesNotCloseSend: !h.questionnaireSendHasResponse(send, [otherClientResponse]),
  missingDateStillCountsAsConservativeMatch: h.questionnaireSendHasResponse(send, [missingDateResponse]),
  missingPhoneDoesNotMatch: !h.questionnaireSendHasResponse({ sentAt: send.sentAt }, [laterResponse]),
  latestSendIgnoresInputOrder: h.latestSendForClient("client-1")?.id === "new-send"
};

const failures = Object.entries(results)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({ ok: failures.length === 0, results, failures }, null, 2));
if (failures.length) process.exit(1);
