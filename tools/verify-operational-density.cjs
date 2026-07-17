const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "styles.css"), "utf8");
const index = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "index.html"), "utf8");
const version = app.match(/const APP_VERSION = "([^"]+)"/)?.[1] || "";

function section(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  if (from < 0) return "";
  return app.slice(from, to < 0 ? undefined : to);
}

const taskCard = section("function renderTaskCard", "function taskDisplayTitle");
const questionnaireGroup = section("function renderQuestionnaireGroupCard", "function renderQuestionnaireCard");
const questionnaireCard = section("function renderQuestionnaireCard", "function questionnaireCompactSummary");
const rebookingCard = section("function renderRebookingCard", "function rebookingCardActionLine");
const pilotageScorecard = section("function renderPilotageWeeklyScorecard", "function renderPilotageScoreMetric");

const checks = {
  sharedOperationalCards: taskCard.includes("operational-card")
    && questionnaireGroup.includes("operational-card")
    && questionnaireCard.includes("operational-card")
    && rebookingCard.includes("operational-card"),
  oneCompactMetaLine: taskCard.includes("operational-meta-line")
    && questionnaireCard.includes("operational-meta-line")
    && rebookingCard.includes("operational-meta-line"),
  secondaryActionsCollapsed: app.includes("task-more-actions card-action-menu")
    && questionnaireCard.includes("<summary>Plus</summary>")
    && rebookingCard.includes("<summary>Plus</summary>"),
  rebookingMissionRemainsAvailable: rebookingCard.includes('data-action="openRebookingMission"')
    && rebookingCard.includes('data-action="rebookedRebooking"'),
  cancellationDateRemainsVisible: rebookingCard.includes("cancellationLabel")
    && rebookingCard.includes("operational-meta-primary"),
  rebookingVolumeGuard: app.includes("REBOOKING_VOLUME_REVIEW_THRESHOLD = 10")
    && app.includes("function rebookingVolumeNeedsReview")
    && rebookingCard.includes("Volume a verifier")
    && app.includes("Ce volume est inhabituel"),
  pilotageSinglePrimaryAction: pilotageScorecard.includes("Rencontre hebdo coach")
    && !pilotageScorecard.includes('data-action="openPilotageNote"'),
  voicePlaybackRemainsDirect: taskCard.includes("taskVoicePlaybackUrl")
    && app.includes('taskVoicePlaybackButton(task, "\\u25B6 Ecouter", "task-voice-direct")'),
  compactDesktopActions: styles.includes(".card-actions.operational-actions")
    && styles.includes("grid-template-columns: minmax(0, 1fr) auto"),
  compactMobileActions: styles.includes(".rebooking-card .card-actions.operational-actions")
    && styles.includes("flex-wrap: nowrap")
    && styles.includes("min-height: 42px"),
  overflowMenuDoesNotGrowCard: styles.includes("position: absolute")
    && styles.includes("max-width: min(320px, calc(100vw - 32px))"),
  noLegacyPlusSuffix: styles.includes('.operational-actions .task-more-actions > summary::after')
    && styles.includes('content: ""'),
  cacheBusterMatchesVersion: Boolean(version)
    && index.includes(`app.js?v=${version}`)
    && index.includes(`styles.css?v=${version}`)
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ ok: failed.length === 0, version, checks, failed }, null, 2));
if (failed.length) process.exit(1);
