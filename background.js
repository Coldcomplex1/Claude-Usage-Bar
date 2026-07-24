// background.js: keyboard shortcut + toolbar-icon badge.
//
// Badge: mirrors one usage window onto the extension icon, colored the same as
// the in-page bar, so the user can read their usage at a glance without opening
// the popup or a claude.ai tab. Which window (and whether the badge shows at
// all) is configured on the Settings page and stored in cub_badge; the numbers
// come from cub_last, written by the content script and popup. Off by default.
//
// The content script reacts to the cub_enabled storage change to show/hide the bar.

var TOGGLE_KEY = "cub_enabled";
var LAST_KEY = "cub_last";
var BADGE_KEY = "cub_badge";
var DEFAULT_BADGE = { enabled: false, source: "session" };

// Thresholds/colors match the in-page bar in content.css: blue < 30%,
// Claude orange 30–80%, red > 80%.
var BADGE_LOW = "#378add", BADGE_MID = "#d85a30", BADGE_HIGH = "#e2564d";
function badgeColor(pct){ return pct > 80 ? BADGE_HIGH : pct >= 30 ? BADGE_MID : BADGE_LOW; }

function winPct(m){ return (m && m.available && m.pct != null) ? Math.round(m.pct) : null; }

// The % the badge should show for the chosen source, or null if unavailable.
function badgePct(data, source){
  if (!data) return null;
  if (source === "session") return winPct(data.session);
  if (source === "allModels") return winPct(data.allModels);
  // "highest": whichever of session / all-models we have data for.
  var s = winPct(data.session), a = winPct(data.allModels);
  if (s == null) return a;
  if (a == null) return s;
  return Math.max(s, a);
}

function clearBadge(){ chrome.action.setBadgeText({ text: "" }); }

function renderBadge(enabled, badge, data){
  if (enabled === false || !badge.enabled) return clearBadge();
  var pct = badgePct(data, badge.source);
  if (pct == null) return clearBadge();
  pct = Math.max(0, Math.min(100, pct));
  chrome.action.setBadgeText({ text: String(pct) });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor(pct) });
  // Guarded: setBadgeTextColor is Chrome 110+; older Chromium forks fall back
  // to auto-contrast, which is still legible on these backgrounds.
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: "#ffffff" });
}

function refreshBadge(){
  chrome.storage.local.get([TOGGLE_KEY, LAST_KEY, BADGE_KEY], function (o){
    var badge = Object.assign({}, DEFAULT_BADGE, o[BADGE_KEY] || {});
    renderBadge(o[TOGGLE_KEY] !== false, badge, o[LAST_KEY]);
  });
}

chrome.commands.onCommand.addListener(function (command) {
  if (command !== "toggle-bar") return;
  chrome.storage.local.get([TOGGLE_KEY], function (o) {
    var currentlyOn = o[TOGGLE_KEY] !== false; // default on
    chrome.storage.local.set({ [TOGGLE_KEY]: !currentlyOn });
  });
});

// New usage numbers (cub_last), a master-toggle flip, or a badge-settings change
// all wake the service worker here and repaint the badge.
chrome.storage.onChanged.addListener(function (changes, area){
  if (area !== "local") return;
  if (changes[LAST_KEY] || changes[TOGGLE_KEY] || changes[BADGE_KEY]) refreshBadge();
});

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);

// And whenever the service worker first spins up with data already in storage.
refreshBadge();
