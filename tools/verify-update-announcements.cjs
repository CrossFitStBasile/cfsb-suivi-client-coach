const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "styles.css"), "utf8");
const index = fs.readFileSync(path.join(root, "firebase-dashboard", "public", "index.html"), "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const version = app.match(/const APP_VERSION = "([^"]+)"/)?.[1] || "";

const checks = {
  collectionsSubscribed: app.includes('collection(db, "announcements")')
    && app.includes('collection(db, "announcementAcknowledgements")'),
  popupWaitsForBothSources: app.includes("state.data.loaded.announcements")
    && app.includes("state.data.loaded.announcementAcknowledgements"),
  popupOnlyOncePerSession: app.includes("announcementAutoShownThisSession")
    && app.includes("scheduleUnreadAnnouncementModal"),
  popupCannotBlockDataErrors: app.includes('console.warn("Announcements unavailable"')
    && app.includes('console.warn("Announcement acknowledgements unavailable"'),
  acknowledgementPersistsPerUser: app.includes('doc(db, "announcementAcknowledgements", acknowledgementId)')
    && app.includes('data-action="acknowledgeAnnouncement"'),
  laterDismissalExists: app.includes("announcementDismissedIds")
    && app.includes(">Plus tard</button>"),
  historyRemainsAvailable: app.includes("function renderAnnouncementHistory()")
    && app.includes("Nouveautes du dashboard")
    && app.includes("renderAnnouncementHistory()"),
  adminCanPublishAndArchive: app.includes("function renderAdminAnnouncements()")
    && app.includes('data-action="openAnnouncementForm"')
    && app.includes('data-action="archiveAnnouncement"')
    && app.includes('data-form="announcement"'),
  announcementContentIsEscaped: app.includes('escapeHtml(announcement.title')
    && app.includes('items.map((item) => `<li>${escapeHtml(item)}</li>`)'),
  coachReadsAnnouncements: rules.includes("match /announcements/{announcementId}")
    && rules.includes("allow read: if activeUser();")
    && rules.includes("allow create, update, delete: if isAdmin();"),
  coachOnlyAcknowledgesSelf: rules.includes("match /announcementAcknowledgements/{acknowledgementId}")
    && rules.includes("request.resource.data.userId == request.auth.uid")
    && rules.includes("resource.data.userId == request.auth.uid")
    && rules.includes("allow delete: if false;"),
  mobileLayoutCovered: styles.includes(".announcement-modal")
    && styles.includes(".announcement-history-row")
    && styles.includes("@media (max-width: 700px)"),
  releaseFreshnessChecksCurrentHtml: app.includes("function checkDashboardRelease")
    && app.includes('releaseUrl.searchParams.set("releaseCheck"')
    && app.includes('cache: "no-store"')
    && app.includes("dashboardVersionFromHtml"),
  releaseFreshnessRunsWithoutInterruptingWork: app.includes('window.addEventListener("focus"')
    && app.includes('document.addEventListener("visibilitychange"')
    && app.includes("RELEASE_CHECK_INTERVAL_MS")
    && app.includes('void checkDashboardRelease({ force: true })'),
  releaseBannerIsNonBlocking: app.includes("function renderReleaseUpdateBanner")
    && app.includes('data-action="reloadForUpdate"')
    && app.includes("state.busy || state.modal")
    && app.includes("Termine ou ferme l'action en cours avant d'actualiser."),
  releaseBannerResponsive: styles.includes(".release-update-banner")
    && styles.includes(".release-update-banner button"),
  cacheBusterMatchesVersion: Boolean(version)
    && index.includes(`app.js?v=${version}`)
    && index.includes(`styles.css?v=${version}`)
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const result = { ok: failed.length === 0, version, checks, failed };
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exit(1);
