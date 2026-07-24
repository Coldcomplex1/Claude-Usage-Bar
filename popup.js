// popup.js: the slim popup. Usage readout, show-in-bar toggles (Session +
// All models), Refresh, and a Settings button. Everything else (master on/off,
// badge, account switch, hotkey) lives on the options page.
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
    if (o[LAST_KEY]) render(o[LAST_KEY]);
    refresh();
  });
  loadShow(); wireShow();
  document.getElementById("refresh").addEventListener("click", refresh);
  document.getElementById("settings").addEventListener("click", function(){
    chrome.runtime.openOptionsPage();
  });
});
