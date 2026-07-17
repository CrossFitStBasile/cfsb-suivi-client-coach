const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "firebase-dashboard", "public", "app.js");
const app = fs.readFileSync(appPath, "utf8");

function uniqueMatches(regex, source) {
  return [...new Set([...source.matchAll(regex)].map((match) => match[1]))].sort();
}

const declaredActions = uniqueMatches(/data-action="([^"]+)"/g, app);
const clickHandledActions = uniqueMatches(/action\s*===\s*"([^"]+)"/g, app);
const changeHandledActions = uniqueMatches(/dataset\.action\s*===\s*"([^"]+)"/g, app);
const handledActions = [...new Set([...clickHandledActions, ...changeHandledActions])].sort();

const staticForms = uniqueMatches(/data-form="([^"$][^"]*)"/g, app);
const dynamicForms = [...app.matchAll(/data-form="\$\{[^}]*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*\}"/g)]
  .flatMap((match) => [match[1], match[2]]);
const declaredForms = [...new Set([...staticForms, ...dynamicForms])].sort();
const handledForms = uniqueMatches(/form\.dataset\.form\s*===\s*"([^"]+)"/g, app);

const declaredFilters = uniqueMatches(/filterButton\("([^"]+)"/g, app);
const hasGenericFilterHandler = (app.includes('event.target.closest("[data-filter]")')
    || app.includes('targetEl.closest("[data-filter]")'))
  && app.includes("state.filter[filterEl.dataset.filter] = filterEl.dataset.value");

const tabsBlock = app.match(/const tabs = \[([\s\S]*?)\];/);
const declaredTabs = tabsBlock
  ? uniqueMatches(/\[\s*"([^"]+)"\s*,\s*"[^"]+"\s*\]/g, tabsBlock[1])
  : [];
const renderedTabs = uniqueMatches(/state\.tab\s*===\s*"([^"]+)"/g, app);
if (declaredTabs.includes("guide") && app.includes("return renderGuide();")) renderedTabs.push("guide");
renderedTabs.sort();
const hasTabClickHandler = (app.includes('event.target.closest("[data-tab]")')
    || app.includes('targetEl.closest("[data-tab]")'))
  && (app.includes("state.tab = tabEl.dataset.tab") || app.includes("setActiveTab(tabEl.dataset.tab"));

const openedModals = uniqueMatches(/openModal\(\{\s*type:\s*"([^"]+)"/g, app);
const renderedModals = uniqueMatches(/state\.modal\.type\s*===\s*"([^"]+)"/g, app);

const missingHandlers = declaredActions.filter((action) => !handledActions.includes(action));
const missingFormHandlers = declaredForms.filter((form) => !handledForms.includes(form));
const missingFilterHandler = declaredFilters.length > 0 && !hasGenericFilterHandler;
const missingTabHandler = declaredTabs.length > 0 && !hasTabClickHandler;
const missingRenderedTabs = declaredTabs.filter((tab) => !renderedTabs.includes(tab));
const missingRenderedModals = openedModals.filter((modal) => !renderedModals.includes(modal));
const unusedHandlers = handledActions.filter((action) => !declaredActions.includes(action));

const result = {
  ok: missingHandlers.length === 0
    && missingFormHandlers.length === 0
    && !missingFilterHandler
    && !missingTabHandler
    && missingRenderedTabs.length === 0
    && missingRenderedModals.length === 0,
  declaredActions,
  handledActions,
  missingHandlers,
  declaredForms,
  handledForms,
  missingFormHandlers,
  declaredFilters,
  hasGenericFilterHandler,
  missingFilterHandler,
  declaredTabs,
  renderedTabs,
  hasTabClickHandler,
  missingTabHandler,
  missingRenderedTabs,
  openedModals,
  renderedModals,
  missingRenderedModals,
  unusedHandlers
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exit(1);
