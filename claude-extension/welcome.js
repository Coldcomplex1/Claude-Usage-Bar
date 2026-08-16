// welcome.js: the first-run setup box, opened in a tab by background.js the
// moment the extension is installed (and again from Settings -> "Run setup
// again"). It asks the two questions a new install used to answer silently:
// which design, and whether the toolbar icon carries the number.
//
// Choices apply the instant they are clicked, the same way the Settings page
// works: content.js repaints every open claude.ai tab off the cub_design change
// and background.js repaints the badge off cub_badge, so there is nothing to
// save and no way to end up looking at a stale preview.
//
// Picking a design is what marks setup done (cub_setup). Closing this tab
// without picking deliberately leaves it pending, so content.js can ask once
// more, in the page, where the designs can be seen for real.
var DESIGN_KEY = "cub_design";
var BADGE_KEY = "cub_badge";
var SETUP_KEY = "cub_setup";
var DEFAULT_BADGE = { enabled: false, source: "session" };

function markDone(){
  chrome.storage.local.set({ [SETUP_KEY]: { done: true, at: Date.now() } });
}

// Enabled only once a design is picked: the whole point of this box is that
// nothing gets chosen on the user's behalf.
function setCta(picked){
  var cta = document.getElementById("done");
  cta.disabled = !picked;
  cta.textContent = picked ? "Done" : "Pick a design to continue";
}

// Blank on a first run, so the question is a real one. Re-running setup from
// Settings starts from what is already stored instead.
function load(){
  chrome.storage.local.get([DESIGN_KEY, BADGE_KEY, SETUP_KEY], function(o){
    var done = !!(o[SETUP_KEY] && o[SETUP_KEY].done);
    var picked = done && (o[DESIGN_KEY] === "1" || o[DESIGN_KEY] === "2");
    if (picked){
      document.querySelectorAll('input[name="design"]').forEach(function(r){
        r.checked = r.value === o[DESIGN_KEY];
      });
    }
    var b = Object.assign({}, DEFAULT_BADGE, o[BADGE_KEY] || {});
    document.getElementById("badge-enabled").checked = b.enabled;
    setCta(picked);
  });
}

function saveBadge(patch){
  chrome.storage.local.get([BADGE_KEY], function(o){
    var b = Object.assign({}, DEFAULT_BADGE, o[BADGE_KEY] || {}, patch);
    chrome.storage.local.set({ [BADGE_KEY]: b });
  });
}

function finish(){
  document.getElementById("setup").hidden = true;
  document.getElementById("finished").hidden = false;
  chrome.storage.local.get([BADGE_KEY], function(o){
    var b = Object.assign({}, DEFAULT_BADGE, o[BADGE_KEY] || {});
    document.getElementById("finished-sub").textContent = b.enabled
      ? "Open claude.ai and your usage will be there, on the page and on the toolbar icon."
      : "Open claude.ai and your usage will be there.";
  });
}

document.addEventListener("DOMContentLoaded", function(){
  load();

  document.querySelectorAll('input[name="design"]').forEach(function(r){
    r.addEventListener("change", function(){
      if (!r.checked) return;
      chrome.storage.local.set({ [DESIGN_KEY]: r.value });
      markDone();          // the design is the answer we asked for
      setCta(true);
    });
  });

  document.getElementById("badge-enabled").addEventListener("change", function(e){
    saveBadge({ enabled: e.target.checked });
  });

  document.getElementById("done").addEventListener("click", finish);

  document.getElementById("settings").addEventListener("click", function(){
    chrome.runtime.openOptionsPage();
  });
});
