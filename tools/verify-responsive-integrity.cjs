const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const styles = fs.readFileSync(
  path.join(root, "firebase-dashboard", "public", "styles.css"),
  "utf8"
);
const app = fs.readFileSync(
  path.join(root, "firebase-dashboard", "public", "app.js"),
  "utf8"
);

function cssBlock(source, marker) {
  const search = marker.startsWith("@") ? marker : `${marker} {`;
  const start = source.indexOf(search);
  if (start < 0) return "";
  const open = source.indexOf("{", start + marker.length);
  if (open < 0) return "";

  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  return "";
}

function zIndex(rule) {
  return Number(rule.match(/z-index:\s*(\d+)/)?.[1] || 0);
}

const mobile = cssBlock(styles, "@media (max-width: 680px)");
const baseBackdrop = cssBlock(styles, ".modal-backdrop");
const mobileBackdrop = cssBlock(mobile, ".modal-backdrop");
const mobileModal = cssBlock(mobile, ".modal");
const mobileDate = cssBlock(mobile, '.modal-form input[type="date"]');
const mobileActions = cssBlock(mobile, ".modal-actions");
const mobileActionChildren = cssBlock(mobile, ".modal-actions > *");
const mobileToast = cssBlock(mobile, ".toast");
const mobileNavigation = cssBlock(mobile, ".mobile-bottom-nav");

const checks = {
  breakpointExtendedTo680: Boolean(mobile)
    && !styles.includes("@media (max-width: 560px)")
    && !app.includes('(max-width: 560px)')
    && (app.match(/\(max-width: 680px\)/g) || []).length >= 2
    && (styles.match(/@media \(max-width: 680px\)/g) || []).length === 1,
  bodyLockedOnlyInsideMobileRule: mobile.includes("html:has(.modal-backdrop)")
    && mobile.includes("body:has(.modal-backdrop)")
    && mobile.includes("overflow: hidden;")
    && !styles.slice(0, styles.indexOf("@media (max-width: 680px)")).includes("body:has(.modal-backdrop)"),
  backdropIsOnlyVerticalScroller: mobileBackdrop.includes("block-size: 100dvh;")
    && mobileBackdrop.includes("overflow-y: auto;")
    && mobileBackdrop.includes("overscroll-behavior: contain;")
    && mobileModal.includes("overflow: visible;")
    && !mobileModal.includes("overflow-y: auto;"),
  modalRespectsSafeAreas: mobileBackdrop.includes("env(safe-area-inset-top, 0px)")
    && mobileBackdrop.includes("env(safe-area-inset-bottom, 0px)"),
  dateCannotExceedModal: mobileDate.includes("inline-size: 100%;")
    && mobileDate.includes("min-inline-size: 0;")
    && mobileDate.includes("max-inline-size: 100%;")
    && mobileDate.includes("overflow: hidden;"),
  actionsStaySingleColumn: mobileActions.includes("grid-template-columns: minmax(0, 1fr);")
    && mobileActions.includes("max-width: 100%;")
    && mobileActionChildren.includes("width: 100%;")
    && mobileActionChildren.includes("min-width: 0;")
    && mobileActionChildren.includes("overflow-wrap: anywhere;"),
  toastClearsNavigationAndSafeArea: mobileToast.includes("env(safe-area-inset-bottom, 0px)")
    && mobileToast.includes("left: 12px;")
    && mobileToast.includes("right: 12px;")
    && zIndex(mobileToast) > zIndex(baseBackdrop)
    && zIndex(mobileToast) > zIndex(mobileNavigation)
};

const failed = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({
  ok: failed.length === 0,
  breakpoint: 680,
  checks,
  failed
}, null, 2));

if (failed.length) process.exit(1);
