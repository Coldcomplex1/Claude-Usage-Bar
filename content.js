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
  var placeObserver = null, observedParent = null, observedComposer = null, reinserts = [];
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

  // The chat input differs across surfaces (contenteditable on /new & chats, and
  // the Claude Code app on /code). Pick the bottom-most visible input on the page
  // — the composer always sits at the bottom — then walk up to its container so
  // the bar lands inside the composer box, the same on every surface.
  function findComposer(){
    var nodes = document.querySelectorAll('div[contenteditable="true"], p[contenteditable="true"], textarea');
    var editor = null, bestBottom = -Infinity;
    for (var i=0; i<nodes.length; i++){
      var n = nodes[i];
      if (!n.offsetParent && n.getClientRects().length === 0) continue; // hidden
      var r = n.getBoundingClientRect();
      if (r.width < 120 || r.height === 0) continue;                    // tiny/collapsed
      if (r.bottom > bestBottom){ bestBottom = r.bottom; editor = n; }
    }
    if (!editor) return null;
    var node = editor;
    for (var j=0; j<6 && node.parentElement; j++){
      node = node.parentElement;
      if (node.getBoundingClientRect().width >= 320) return node;
    }
    return editor.parentElement;
  }

  function insertInline(composer){
    composer.insertAdjacentElement("afterend", barEl);
    barEl.classList.remove("cub-fixed");
  }

  // Allow bursts of re-insertion but back off if a surface fights us every frame,
  // so we never spin in a tight loop against React (the poll re-acquires instead).
  function reinsertAllowed(){
    var now = Date.now();
    reinserts.push(now);
    while (reinserts.length && now - reinserts[0] > 1000) reinserts.shift();
    return reinserts.length <= 5;
  }

  function stopWatching(){
    if (placeObserver) placeObserver.disconnect();
    placeObserver = null; observedParent = null; observedComposer = null;
  }

  // Watch the composer's parent so that if a re-render detaches the bar we put it
  // back synchronously (before paint) instead of waiting for the 800ms poll —
  // that gap is what made the bar flicker on and off on /code.
  function watchParent(parent, composer){
    if (observedParent === parent && observedComposer === composer) return;
    stopWatching();
    observedParent = parent; observedComposer = composer;
    placeObserver = new MutationObserver(function(){
      if (!enabled || !barEl || barEl.isConnected) return;
      if (!composer.isConnected) return;      // composer replaced → let the poll re-acquire
      if (!reinsertAllowed()) return;         // thrashing → back off
      insertInline(composer);
      applyAndRender();
    });
    placeObserver.observe(parent, { childList: true });
  }

  function ensurePlaced(){
    if (!enabled){ if (barEl && barEl.isConnected) barEl.remove(); return; }
    if (!barEl) barEl = buildBar();
    var composer = findComposer();
    if (composer && composer.parentElement){
      var correct = barEl.parentElement === composer.parentElement && barEl.previousElementSibling === composer;
      if (!correct) insertInline(composer);
      watchParent(composer.parentElement, composer);
    } else {
      stopWatching();
      if (!barEl.isConnected){ barEl.classList.add("cub-fixed"); document.body.appendChild(barEl); }
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
  function disable(){ enabled = false; stopPolling(); stopWatching(); if (barEl && barEl.isConnected) barEl.remove(); }

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
