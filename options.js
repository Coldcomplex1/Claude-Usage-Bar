// options.js — the Settings page: master on/off, toolbar-badge options,
// account switch, and the hotkey. Shares CUB (usage.js) with the popup.
var TOGGLE_KEY = "cub_enabled";
var LAST_KEY = "cub_last";
var BADGE_KEY = "cub_badge";
var MANUAL_KEY = "cub_org_manual";
var DEFAULT_BADGE = { enabled: false, source: "session" };

// ---- Master on/off -------------------------------------------------------
function loadToggle(){
  chrome.storage.local.get([TOGGLE_KEY], function(o){
    document.getElementById("toggle").checked = o[TOGGLE_KEY] !== false;
  });
}

// ---- Toolbar badge -------------------------------------------------------
function applyBadgeDisabled(enabled){
  document.getElementById("badge-opts").classList.toggle("o-disabled", !enabled);
}
function loadBadge(){
  chrome.storage.local.get([BADGE_KEY], function(o){
    var b = Object.assign({}, DEFAULT_BADGE, o[BADGE_KEY] || {});
    document.getElementById("badge-enabled").checked = b.enabled;
    document.querySelectorAll('input[name="badge-source"]').forEach(function(r){
      r.checked = r.value === b.source;
    });
    applyBadgeDisabled(b.enabled);
  });
}
function saveBadge(patch){
  chrome.storage.local.get([BADGE_KEY], function(o){
    var b = Object.assign({}, DEFAULT_BADGE, o[BADGE_KEY] || {}, patch);
    chrome.storage.local.set({ [BADGE_KEY]: b });
  });
}

// ---- Account -------------------------------------------------------------
function setAcct(name){ document.getElementById("acct").textContent = name || "(unnamed)"; }

function updateAutoVisibility(){
  chrome.storage.local.get([MANUAL_KEY], function(o){
    document.getElementById("auto").hidden = !o[MANUAL_KEY];
  });
}

async function refreshAccount(){
  updateAutoVisibility();
  try {
    var data = await CUB.getUsage();
    chrome.storage.local.set({ [LAST_KEY]: data });
    setAcct(data.orgName);
  } catch (e){ /* keep the cached name we already showed */ }
}

function pctText(b){ return b && b.utilization!=null ? Math.round(Number(b.utilization))+"%" : "–"; }

async function showScan(){
  var box = document.getElementById("scan");
  box.hidden = false;
  box.innerHTML = '<div class="p-empty">Scanning accounts…</div>';
  try {
    var res = await CUB.scanOrgs();
    var html = '<div class="p-scan-hint">Pick the account with your real usage:</div>';
    res.rows.forEach(function(r){
      var detail = r.ok ? ("5h "+pctText(r.raw.five_hour)+" · 7d "+pctText(r.raw.seven_day)) : ("error: "+(r.error||"?"));
      html += '<div class="p-org"><div class="p-org-info"><div class="p-org-name">'+r.name+'</div>'+
        '<div class="p-org-detail">'+detail+'</div></div>'+
        '<button class="p-btn p-use" data-id="'+r.uuid+'">Use</button></div>';
    });
    box.innerHTML = html;
    box.querySelectorAll(".p-use").forEach(function(btn){
      btn.addEventListener("click", async function(){
        await CUB.setManualOrg(btn.getAttribute("data-id"));
        box.hidden = true; refreshAccount();
      });
    });
  } catch (e){
    box.innerHTML = '<div class="p-empty">'+(e.code==="AUTH"?"Log in to claude.ai first":"Couldn't list accounts")+'</div>';
  }
}

// ---- Hotkey --------------------------------------------------------------
function loadHotkey(){
  try {
    chrome.commands.getAll(function(cmds){
      var c = (cmds || []).find(function(x){ return x.name === "toggle-bar"; });
      document.getElementById("hk").textContent = (c && c.shortcut) ? c.shortcut : "not set";
    });
  } catch (e){ document.getElementById("hk").textContent = "—"; }
}

document.addEventListener("DOMContentLoaded", function(){
  loadToggle();
  loadBadge();
  loadHotkey();

  chrome.storage.local.get([LAST_KEY], function(o){
    if (o[LAST_KEY] && o[LAST_KEY].orgName) setAcct(o[LAST_KEY].orgName);
    refreshAccount();
  });

  document.getElementById("toggle").addEventListener("change", function(e){
    chrome.storage.local.set({ [TOGGLE_KEY]: e.target.checked });
  });

  document.getElementById("badge-enabled").addEventListener("change", function(e){
    applyBadgeDisabled(e.target.checked);
    saveBadge({ enabled: e.target.checked });
  });
  document.querySelectorAll('input[name="badge-source"]').forEach(function(r){
    r.addEventListener("change", function(){ if (r.checked) saveBadge({ source: r.value }); });
  });

  document.getElementById("switch").addEventListener("click", showScan);
  document.getElementById("auto").addEventListener("click", async function(){
    await CUB.clearOrg();
    document.getElementById("scan").hidden = true;
    refreshAccount();
  });

  document.getElementById("hk-edit").addEventListener("click", function(e){
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
});
