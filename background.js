// background.js — handles the keyboard shortcut to show/hide the bar.
// The content script reacts to the cub_enabled storage change.
chrome.commands.onCommand.addListener(function (command) {
  if (command !== "toggle-bar") return;
  chrome.storage.local.get(["cub_enabled"], function (o) {
    var currentlyOn = o.cub_enabled !== false; // default on
    chrome.storage.local.set({ cub_enabled: !currentlyOn });
  });
});
