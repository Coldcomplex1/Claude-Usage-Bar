// popup.js — usage readout, show-in-bar toggles (Session + All models),
// account switch, hotkey hint. Opus row shows only when the account has it.
var TOGGLE_KEY = "cub_enabled";
var LAST_KEY = "cub_last";
var SHOW_KEY = "cub_show";
var DEFAULT_SHOW = { session: true, allModels: true };

function colorClass(p){ return p==null ? "" : p>80 ? "high" : p>=30 ? "mid" : "low"; }

function rowHtml(label, sub, d){
  var pct = d && d.available && d.pct!=null ? Math.round(d.pct) : null;
  var reset = d && d.resetAt && pct>0 ? CUB.fmtReset(d.resetAt) : "";
  return '<div class="p-row"><div class="p-row-head">'+
    '<span class="p-label">'+label+'</span><span class="p-sub">'+sub+'</span>'+
    '<span class="p-val">'+(pct==null?"–":pct+"%")+'</span></div>'+
    '<div class="p-track"><div class="p-fill '+colorClass(pct)+'" style="width:'+(pct==null?0:pct)+'%"></div></div>'+
    (reset ? '<div class="p-reset">resets '+reset+'</div>' : '')+
  '</div>';
}

function render(data){
  var rows = document.getElementById("rows");
  if (!data){ rows.innerHTML = '<div class="p-empty">No data yet</div>'; return; }
  var html = rowHtml("Session","5h",data.session) + rowHtml("All models","7d",data.allModels);
  if (data.opus && data.opus.available) html += rowHtml("Opus","7d",data.opus);
  rows.innerHTML = html;
  document.getElementById("acct").textContent = "Account: " + (data.orgName || "(unnamed)");
}

function setStatus(t){ document.getElementById("status").textContent = t; }

async function refresh(){
  setStatus("Updating…");
  try {
    var data = await CUB.getUsage();
    chrome.storage.local.set({ [LAST_KEY]: data });
    render(data);
    setStatus("Updated just now");
  } catch (e){
    setStatus(e.code==="AUTH" ? "Log in to claude.ai first"
      : e.code==="NO_ORGS" ? "No account found" : "Couldn't reach Claude");
  }
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
        box.hidden = true; refresh();
      });
    });
  } catch (e){
    box.innerHTML = '<div class="p-empty">'+(e.code==="AUTH"?"Log in to claude.ai first":"Couldn't list accounts")+'</div>';
  }
}

function loadShow(){
  chrome.storage.local.get([SHOW_KEY], function(o){
    var show = Object.assign({}, DEFAULT_SHOW, o[SHOW_KEY] || {});
    document.querySelectorAll("[data-show]").forEach(function(cb){
      cb.checked = show[cb.getAttribute("data-show")] !== false;
    });
  });
}
function wireShow(){
  document.querySelectorAll("[data-show]").forEach(function(cb){
    cb.addEventListener("change", function(){
      chrome.storage.local.get([SHOW_KEY], function(o){
        var show = Object.assign({}, DEFAULT_SHOW, o[SHOW_KEY] || {});
        show[cb.getAttribute("data-show")] = cb.checked;
        chrome.storage.local.set({ [SHOW_KEY]: show });
      });
    });
  });
}

function loadHotkey(){
  try {
    chrome.commands.getAll(function(cmds){
      var c = (cmds || []).find(function(x){ return x.name === "toggle-bar"; });
      document.getElementById("hk").textContent = (c && c.shortcut) ? c.shortcut : "not set";
    });
  } catch (e){ document.getElementById("hk").textContent = "—"; }
}

document.addEventListener("DOMContentLoaded", function(){
  chrome.storage.local.get([TOGGLE_KEY, LAST_KEY], function(o){
    document.getElementById("toggle").checked = o[TOGGLE_KEY] !== false;
    if (o[LAST_KEY]) render(o[LAST_KEY]);
    refresh();
  });
  loadShow(); wireShow(); loadHotkey();
  document.getElementById("toggle").addEventListener("change", function(e){
    chrome.storage.local.set({ [TOGGLE_KEY]: e.target.checked });
  });
  document.getElementById("refresh").addEventListener("click", refresh);
  document.getElementById("switch").addEventListener("click", showScan);
  document.getElementById("hk-edit").addEventListener("click", function(e){
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
});
