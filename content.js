// content.js — slim usage bar under the composer. Session + All models are
// user-toggleable; Opus shows automatically only if the account has it.
// Each metric is a grid row so the bar, the % and the reset line up in columns.
// Colors: blue < 30%, Claude orange 30-80%, red > 80%.

(function () {
  var TOGGLE_KEY = "cub_enabled";
  var LAST_KEY = "cub_last";
  var SHOW_KEY = "cub_show";
  var POLL_MS = 60000;
  var PLACE_MS = 800;

  var barEl = null, enabled = true, lastData = null, pollTimer = null, placeTimer = null;
  var show = { session: true, allModels: true };

  var SEGS = [
    { key: "session",   label: "Session",    sub: "5h", opus: false, tip: "Current rolling 5-hour session" },
    { key: "allModels", label: "All models", sub: "7d", opus: false, tip: "Weekly usage, across all models" },
    { key: "opus",      label: "Opus",       sub: "7d", opus: true,  tip: "Weekly Opus allowance" }
  ];

  function segHtml(s){
    return '<div class="cub-seg" role="img" data-seg="'+s.key+'" title="'+s.tip+'">'+
      '<span class="cub-label"><span class="cub-name">'+s.label+'</span> <span class="cub-sub">'+s.sub+'</span></span>'+
      '<span class="cub-track"><span class="cub-fill"></span></span>'+
      '<span class="cub-val">\u2013</span>'+
      '<span class="cub-reset"></span>'+
    '</div>';
  }

  function buildBar(){
    var bar = document.createElement("div");
    bar.id = "cub-bar"; bar.className = "cub-bar";
    bar.innerHTML = SEGS.map(segHtml).join("");
    return bar;
  }

  function colorClass(p){ return p > 80 ? "cub-high" : p >= 30 ? "cub-mid" : "cub-low"; }

  function fillSeg(node, d, label){
    var val = node.querySelector(".cub-val");
    var fill = node.querySelector(".cub-fill");
    var reset = node.querySelector(".cub-reset");
    if (!d || !d.available || d.pct == null){
      val.textContent = "\u2013"; fill.style.width = "0%"; fill.className = "cub-fill"; reset.textContent = "";
      node.setAttribute("aria-label", label + ": no data");
      return;
    }
    var pct = Math.max(0, Math.min(100, Math.round(d.pct)));
    var r = pct > 0 ? CUB.fmtReset(d.resetAt) : "";
    val.textContent = pct + "%";
    fill.style.width = pct + "%";
    fill.className = "cub-fill " + colorClass(pct);
    reset.textContent = r;
    node.setAttribute("aria-label", label + ": " + pct + "% used" + (r ? ", resets in " + r : ""));
  }

  function applyAndRender(){
    if (!barEl) return;
    var any = false;
    SEGS.forEach(function(s){
      var node = barEl.querySelector('[data-seg="'+s.key+'"]');
      if (!node) return;
      var d = lastData ? lastData[s.key] : null;
      var canShow = s.opus ? !!(d && d.available) : (show[s.key] !== false);
      node.hidden = !canShow;
      if (canShow){ any = true; fillSeg(node, d, s.label); }
    });
    barEl.style.display = any ? "" : "none";
  }

  function markError(){
    if (!barEl) return;
    SEGS.forEach(function(s){
      var node = barEl.querySelector('[data-seg="'+s.key+'"]');
      if (node && !node.hidden) node.querySelector(".cub-val").textContent = "!";
    });
  }

  // The Claude Code web app (/code) is a separate React surface with no stable
  // chat composer; injecting under it gets torn out on every re-render, which is
  // what caused the bar to flicker on and off. Detect it so we can pin instead.
  function isCodeRoute(){
    var p = location.pathname;
    return p === "/code" || p.indexOf("/code/") === 0;
  }

  function findComposer(){
    var editor = document.querySelector('div[contenteditable="true"]');
    if (!editor) return null;
    var node = editor;
    for (var i=0; i<6 && node.parentElement; i++){
      node = node.parentElement;
      if (node.getBoundingClientRect().width >= 320) return node;
    }
    return editor.parentElement;
  }

  function ensurePlaced(){
    if (!enabled){ if (barEl && barEl.isConnected) barEl.remove(); return; }
    if (!barEl) barEl = buildBar();
    // On /code, pin the bar to the viewport once and leave it: attaching under
    // the composer there loses a placement war with React and flickers.
    if (isCodeRoute()){
      if (!barEl.classList.contains("cub-fixed")) barEl.classList.add("cub-fixed");
      if (barEl.parentElement !== document.body) document.body.appendChild(barEl);
      applyAndRender();
      return;
    }
    var composer = findComposer();
    if (composer && composer.parentElement){
      var correct = barEl.parentElement === composer.parentElement && barEl.previousElementSibling === composer;
      if (!correct){ composer.insertAdjacentElement("afterend", barEl); barEl.classList.remove("cub-fixed"); }
    } else if (!barEl.isConnected){
      barEl.classList.add("cub-fixed"); document.body.appendChild(barEl);
    }
    applyAndRender();
  }

  async function refresh(){
    if (!enabled) return;
    try {
      var data = await CUB.getUsage();
      lastData = data;
      chrome.storage.local.set({ [LAST_KEY]: data });
      applyAndRender();
    } catch (e) { markError(); }
  }

  function startPolling(){
    stopPolling();
    refresh();
    pollTimer = setInterval(function(){ if (document.visibilityState === "visible") refresh(); }, POLL_MS);
  }
  function stopPolling(){ if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  function enable(){ enabled = true; ensurePlaced(); startPolling(); }
  function disable(){ enabled = false; stopPolling(); if (barEl && barEl.isConnected) barEl.remove(); }

  chrome.storage.onChanged.addListener(function (changes, area){
    if (area !== "local") return;
    if (changes[TOGGLE_KEY]) { changes[TOGGLE_KEY].newValue === false ? disable() : enable(); }
    if (changes[LAST_KEY] && changes[LAST_KEY].newValue){ lastData = changes[LAST_KEY].newValue; if (enabled) applyAndRender(); }
    if (changes[SHOW_KEY] && changes[SHOW_KEY].newValue){ show = Object.assign({ session:true, allModels:true }, changes[SHOW_KEY].newValue); if (enabled) applyAndRender(); }
  });

  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "visible" && enabled) refresh();
  });

  chrome.storage.local.get([TOGGLE_KEY, LAST_KEY, SHOW_KEY], function (o){
    if (o[LAST_KEY]) lastData = o[LAST_KEY];
    if (o[SHOW_KEY]) show = Object.assign(show, o[SHOW_KEY]);
    enabled = o[TOGGLE_KEY] !== false;
    placeTimer = setInterval(ensurePlaced, PLACE_MS);
    if (enabled) startPolling();
  });
})();
