const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "styles.css"), "utf8");
const index = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "index.html"), "utf8");
const functions = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

const version = app.match(/const APP_VERSION = "([^"]+)"/)?.[1] || "";
const quickNoteModal = app.slice(
  app.indexOf("function renderQuickNoteModal()"),
  app.indexOf("function renderPilotageItemModal()")
);
const taskActions = app.slice(
  app.indexOf("function taskActionButtons(task)"),
  app.indexOf("function isStarredTask(task)")
);
const checks = {
  callableExported: functions.includes("exports.processVoiceMissionRequest = onDocumentCreated(")
    && functions.includes('document: "voiceMissionRequests/{requestId}"'),
  callableRequiresAuth: functions.includes("Connexion requise pour sauvegarder le vocal."),
  callableChecksPilotAccess: functions.includes("canPilotProfileActOnCoach(profile, coachId)"),
  callableValidatesAudio: functions.includes("VOICE_NOTE_ALLOWED_MIME_TYPES")
    && functions.includes("VOICE_NOTE_MAX_BYTES"),
  callableUsesServerStorage: functions.includes("admin.storage().bucket(VOICE_NOTE_BUCKET_NAME)"),
  callableUsesDeterministicPath: functions.includes("taskVoiceNotes/${coachId}/${taskId}/voice.${extension}"),
  callableWritesReadyTask: functions.includes('voiceNoteStatus: "ready"'),
  callableWritesPlaybackUrl: functions.includes("firebasestorage.googleapis.com/v0/b/")
    && functions.includes("downloadUrl,"),
  callableLogsAttempts: functions.includes('db.collection("voiceMissionAttempts")'),
  frontendUsesCallable: app.includes('doc(db, "voiceMissionChunks"')
    && app.includes('doc(db, "voiceMissionRequests"')
    && !app.includes("httpsCallable"),
  frontendHasServerFlow: app.includes("saveVoiceMissionOnServer(payload, draft, formKey)"),
  frontendDoesNotUploadDirectly: !app.includes("uploadBytes"),
  serverReassemblesChunks: functions.includes('db.collection("voiceMissionChunks")')
    && functions.includes('const audioBase64 = chunks.map(({ data }) => data.data).join("")'),
  queueRulesArePrivate: rules.includes("match /voiceMissionRequests/{requestId}")
    && rules.includes("match /voiceMissionChunks/{chunkId}")
    && rules.includes("request.resource.data.userId == request.auth.uid"),
  frontendHasExplicitStates: app.includes("Preparation et envoi du vocal...")
    && app.includes("Vocal recu. Sauvegarde de la mission...")
    && app.includes("Mission et vocal sauvegardes."),
  frontendHasPreviewButton: app.includes('data-action="playVoicePreview"'),
  voiceRecorderVisibleOnMissionOpen: quickNoteModal.indexOf('renderVoiceRecorderField("quickNote")') >= 0
    && quickNoteModal.indexOf('renderVoiceRecorderField("quickNote")') < quickNoteModal.indexOf('<details class="mission-optional-details">'),
  taskPlaybackIsDirect: taskActions.includes('taskVoicePlaybackButton(task, "\\u25B6 Ecouter", "task-voice-direct")')
    && taskActions.indexOf("${voice}") < taskActions.indexOf("task-more-actions"),
  frontendPrimesExistingVoiceUrls: app.includes("primeTaskVoicePlaybackUrls(state.data.tasks)")
    && app.includes("ensureTaskVoicePlaybackUrl(task)"),
  playbackDoesNotLockWholeUi: app.includes('"playTaskVoice"\n  ].includes(action)'),
  navigationClosesStaleModal: app.includes("if (state.modal) {")
    && app.includes("safeResetVoiceRecorder();")
    && app.includes("state.modal = null;"),
  completedTaskLeavesUiImmediately: app.includes("state.data.tasks = state.data.tasks.filter((item) => item.id !== id)"),
  frontendAvoidsNativeVoiceControls: !/<audio[^>]*controls[^>]*data-voice-/i.test(app),
  mobileDateGridIsSingleColumn: styles.includes(".task-modal-compact .form-grid {")
    && styles.includes("grid-template-columns: minmax(0, 1fr);"),
  modalPreventsHorizontalOverflow: styles.includes("overflow-x: hidden;")
    && styles.includes("max-width: calc(100vw - 16px);"),
  modalStaysAboveMobileNavigation: styles.includes("z-index: 50;"),
  cacheBusterMatchesVersion: Boolean(version)
    && index.includes(`app.js?v=${version}`)
    && index.includes(`styles.css?v=${version}`)
};

const failed = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

console.log(JSON.stringify({
  ok: failed.length === 0,
  version,
  checks,
  failed
}, null, 2));

if (failed.length) process.exit(1);
