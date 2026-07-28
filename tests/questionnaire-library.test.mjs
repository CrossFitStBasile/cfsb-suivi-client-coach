import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(root, "firebase-dashboard", "public");
const app = await readFile(join(publicRoot, "app.js"), "utf8");
const index = await readFile(join(publicRoot, "index.html"), "utf8");
const styles = await readFile(join(publicRoot, "styles.css"), "utf8");

const typePrefix = "const QUESTIONNAIRE_TYPES = ";
const typeStart = app.indexOf(typePrefix);
const typeEnd = app.indexOf(";\nconst QUESTIONNAIRE_READING_SCHEMAS", typeStart);
assert.ok(typeStart >= 0 && typeEnd > typeStart, "QUESTIONNAIRE_TYPES must remain extractable.");
const questionnaireTypes = vm.runInNewContext(
  `(${app.slice(typeStart + typePrefix.length, typeEnd)})`
);

test("the library exposes exactly the three canonical generic questionnaire URLs", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(questionnaireTypes.map((item) => ({
      type: item.type,
      path: item.path
    })))),
    [
      { type: "suivi_global", path: "/questionnaire/" },
      { type: "habitudes_quotidiennes", path: "/questionnaire/check-in/" },
      {
        type: "evaluation_habitudes_vie",
        path: "/questionnaire/evaluation-habitudes-vie/"
      }
    ]
  );
  for (const item of questionnaireTypes) {
    const url = new URL(item.path, "https://cfsb-dashboard-coach-aa9a4.web.app/questionnaire/");
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(url.origin, "https://cfsb-dashboard-coach-aa9a4.web.app");
  }
});

test("the manual library never introduces client personalization or send tracking", () => {
  const libraryStart = app.indexOf("function renderQuestionnaireLibraryModal()");
  const libraryEnd = app.indexOf("function questionnaireUrlForClient", libraryStart);
  assert.ok(libraryStart >= 0 && libraryEnd > libraryStart);
  const librarySource = app.slice(libraryStart, libraryEnd);

  assert.doesNotMatch(
    librarySource,
    /clientId|client_name|client_email|client_phone|questionnaireUrlForClient|questionnaireSends/
  );
  assert.match(librarySource, /copyQuestionnaireLink/);
  assert.match(librarySource, /shareQuestionnaireLink/);
  assert.match(librarySource, /target="_blank"/);
  assert.match(librarySource, /rel="noopener noreferrer"/);
});

test("copy and share actions operate only on the generic URL", () => {
  const actionStart = app.indexOf("async function copyQuestionnaireLink");
  const actionEnd = app.indexOf("function resetVoiceRecorder", actionStart);
  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  const actionSource = app.slice(actionStart, actionEnd);

  assert.match(actionSource, /questionnaireGenericUrl\(type\)/);
  assert.match(actionSource, /navigator\.share/);
  assert.doesNotMatch(
    actionSource,
    /addDoc|setDoc|updateDoc|journalQuestionnaireSend|questionnaireSends|clientId/
  );
});

test("the library is visible, versioned and responsive", () => {
  assert.match(
    app,
    /data-action="openQuestionnaireLibrary" aria-haspopup="dialog">Formulaires a partager<\/button>/
  );
  assert.match(index, /styles\.css\?v=20260728-questionnaire-library/);
  assert.match(index, /app\.js\?v=20260728-questionnaire-library/);
  assert.match(styles, /\.questionnaire-library-grid/);
  assert.match(styles, /\.questionnaire-library-actions/);
  assert.match(styles, /@media \(max-width: 680px\)/);
});

test("dashboard dialogs manage keyboard focus", () => {
  assert.match(app, /aria-labelledby="\$\{escapeAttr\(titleId\)\}"/);
  assert.match(app, /tabindex="-1" data-modal-stop/);
  assert.match(app, /function scheduleModalFocus\(\)/);
  assert.match(app, /function scheduleModalReturnFocus\(descriptor\)/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(app, /event\.key !== "Tab"/);
});

test("the existing one-time coach announcement workflow remains available", () => {
  assert.match(app, /function scheduleUnreadAnnouncementModal\(\)/);
  assert.match(app, /announcementAcknowledged\(announcement\.id\)/);
  assert.match(app, /data-action="acknowledgeAnnouncement"/);
  assert.match(app, /Annonce publiee\. Elle apparaitra une fois pour chaque coach\./);
});
