// popup.js: the slim popup. Usage readout, show-in-bar toggles (Session +
// All models), Refresh, and a Settings button. Everything else (master on/off,
// badge, account switch, hotkey) lives on the options page.
var LAST_KEY = "cub_last";
var SHOW_KEY = "cub_show";
var DEFAULT_SHOW = { session: true, allModels: true };
var FRESH_MS = 60000;      // opening the popup on newer numbers than this costs no request

var shown = null;          // what is currently painted, for the "updated" line
var statusTimer = null;

function colorClass(p){ return p==null ? "" : p>80 ? "high" : p>=30 ? "mid" : "low"; }

function rowHtml(label, sub, d){
  var pct = d && d.available && d.pct!=null ? Math.round(d.pct) : null;
  var left = d && d.resetAt && pct>0 ? CUB.fmtReset(d.resetAt) : "";
  var at = left ? CUB.fmtResetAt(d.resetAt) : "";
  var aria = label + ": " + (pct==null ? "no data" : pct + "% used" + (left ? ", resets in " + left : ""));
  return '<div class="p-row" role="progressbar" aria-valuemin="0" aria-valuemax="100"'+
      (pct==null ? "" : ' aria-valuenow="'+pct+'"')+' aria-valuetext="'+aria+'" aria-label="'+aria+'">'+
    '<div class="p-row-head">'+
      '<span class="p-label">'+label+'</span><span class="p-sub">'+sub+'</span>'+
      '<span class="p-val">'+(pct==null?"–":pct+"%")+'</span></div>'+
    '<div class="p-track"><div class="p-fill '+colorClass(pct)+'" style="width:'+(pct==null?0:pct)+'%"></div></div>'+
    (left ? '<div class="p-reset">resets in '+left+(at ? ' · '+at : '')+'</div>' : '')+
  '</div>';
}

function render(data){
  shown = data || null;
  var rows = document.getElementById("rows");
  if (!data){ rows.innerHTML = '<div class="p-empty">No data yet</div>'; return; }
  var html = rowHtml("Session","5h",data.session) + rowHtml("All models","7d",data.allModels);
  if (data.opus && data.opus.available) html += rowHtml("Opus","7d",data.opus);
  rows.innerHTML = html;
}

function setStatus(t){ document.getElementById("status").textContent = t; }

// "Updated 3m ago", kept honest while the popup stays open, so a stale reading
// never looks like a fresh one.
function showAge(){
  if (!shown || !shown.fetchedAt) return setStatus("");
  setStatus("Updated " + CUB.fmtAgo(shown.fetchedAt));
}

function setBusy(on){
  var btn = document.getElementById("refresh");
  btn.disabled = on;
  btn.textContent = on ? "…" : "Refresh";
}

async function refresh(force){
  // The popup used to fire a request on every open. The numbers move slowly and
  // an open tab (or the background alarm) is already refreshing them, so unless
  // the user asks we only go to the network when what we have has gone off.
  if (!force && shown && shown.fetchedAt && Date.now() - shown.fetchedAt < FRESH_MS) return showAge();
  setBusy(true);
  setStatus("Updating…");
  try {
    var data = await CUB.getUsage();
    chrome.storage.local.set({ [LAST_KEY]: data });
    render(data);
    showAge();
  } catch (e){
    setStatus(e.code==="AUTH" ? "Log in to claude.ai first"
      : e.code==="NO_ORGS" ? "No account found" : "Couldn't reach Claude");
  } finally { setBusy(false); }
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

document.addEventListener("DOMContentLoaded", function(){
  chrome.storage.local.get([LAST_KEY], function(o){
    if (o[LAST_KEY]){ render(o[LAST_KEY]); showAge(); }   // paint the cache first, then decide
    refresh(false);
  });
  loadShow(); wireShow();
  statusTimer = setInterval(showAge, 15000);
  // A tab or the alarm refreshing while the popup is open should show up here too.
  chrome.storage.onChanged.addListener(function(changes, area){
    if (area === "local" && changes[LAST_KEY] && changes[LAST_KEY].newValue){
      render(changes[LAST_KEY].newValue); showAge();
    }
  });
  document.getElementById("refresh").addEventListener("click", function(){ refresh(true); });
  document.getElementById("settings").addEventListener("click", function(){
    chrome.runtime.openOptionsPage();
  });
});
