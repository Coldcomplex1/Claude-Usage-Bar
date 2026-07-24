// background.js — keyboard shortcut + toolbar-icon badge.
//
// Badge: mirrors the highest of the three usage windows (session / all models /
// Opus) onto the extension icon, colored the same as the in-page bar, so the
// user can read their usage at a glance without opening the popup or a claude.ai
// tab. It reflects the latest numbers stored by the content script or popup
// (cub_last); when the bar is turned off (cub_enabled === false) it clears too.
//
// The content script reacts to the cub_enabled storage change to show/hide the bar.

var TOGGLE_KEY = "cub_enabled";
var LAST_KEY = "cub_last";

// Thresholds/colors match the in-page bar in content.css: blue < 30%,
// Claude orange 30–80%, red > 80%.
var BADGE_LOW = "#378add", BADGE_MID = "#d85a30", BADGE_HIGH = "#e2564d";
function badgeColor(pct){ return pct > 80 ? BADGE_HIGH : pct >= 30 ? BADGE_MID : BADGE_LOW; }

// Highest utilization across the windows we have data for (0–100), or null.
function peakPct(data){
  if (!data) return null;
  var peak = null;
  ["session", "allModels", "opus"].forEach(function (k){
    var m = data[k];
    if (m && m.available && m.pct != null){
      var p = Math.round(m.pct);
      if (peak == null || p > peak) peak = p;
    }
  });
  return peak;
}

function clearBadge(){ chrome.action.setBadgeText({ text: "" }); }

function renderBadge(enabled, data){
  if (enabled === false) return clearBadge();
  var pct = peakPct(data);
  if (pct == null) return clearBadge();
  pct = Math.max(0, Math.min(100, pct));
  chrome.action.setBadgeText({ text: String(pct) });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor(pct) });
  // Guarded: setBadgeTextColor is Chrome 110+; older Chromium forks fall back
  // to auto-contrast, which is still legible on these backgrounds.
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: "#ffffff" });
}

function refreshBadge(){
  chrome.storage.local.get([TOGGLE_KEY, LAST_KEY], function (o){
    renderBadge(o[TOGGLE_KEY] !== false, o[LAST_KEY]);
  });
}

chrome.commands.onCommand.addListener(function (command) {
  if (command !== "toggle-bar") return;
  chrome.storage.local.get([TOGGLE_KEY], function (o) {
    var currentlyOn = o[TOGGLE_KEY] !== false; // default on
    chrome.storage.local.set({ [TOGGLE_KEY]: !currentlyOn });
  });
});

// New usage numbers (from the content script or popup) or a master-toggle flip
// both wake the service worker here and repaint the badge.
chrome.storage.onChanged.addListener(function (changes, area){
  if (area !== "local") return;
  if (changes[LAST_KEY] || changes[TOGGLE_KEY]) refreshBadge();
});

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);

// And whenever the service worker first spins up with data already in storage.
refreshBadge();
