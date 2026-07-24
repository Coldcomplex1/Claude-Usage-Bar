// content.js — the in-page usage readout. Two looks, chosen on the Settings
// page and stored in cub_design:
//   Design 1 ("1", default): a slim full-width bar under the composer.
//   Design 2 ("2"): a compact widget tucked into the composer toolbar, between
//                   the "+" button and the model picker.
// Session + All models are user-toggleable; Opus shows automatically only if the
// account has it. Colors: blue < 30%, Claude orange 30-80%, red > 80%.

(function () {
  var TOGGLE_KEY = "cub_enabled";
  var LAST_KEY = "cub_last";
  var SHOW_KEY = "cub_show";
  var DESIGN_KEY = "cub_design";
  var POLL_MS = 60000;
  var PLACE_MS = 800;

  var enabled = true, lastData = null, pollTimer = null, placeTimer = null;
  var show = { session: true, allModels: true };
  var design = "1";

  // session/opus use a bar in Design 1; in Design 2 the weekly windows use a ring.
  var SEGS = [
    { key: "session",   label: "Session",    sub: "5h", opus: false, ring: false, tip: "Current rolling 5-hour session" },
    { key: "allModels", label: "All models", sub: "7d", opus: false, ring: true,  tip: "Weekly usage, across all models" },
    { key: "opus",      label: "Opus",       sub: "7d", opus: true,  ring: true,  tip: "Weekly Opus allowance" }
  ];

  function colorClass(p){ return p > 80 ? "cub-high" : p >= 30 ? "cub-mid" : "cub-low"; }

  // Find the composer input: the bottom-most visible, non-tiny editor on the page
  // (the composer always sits at the bottom). Shared by both designs.
  function findEditor(){
    var nodes = document.querySelectorAll('div[contenteditable="true"], p[contenteditable="true"], textarea');
    var editor = null, bestBottom = -Infinity;
    for (var i=0; i<nodes.length; i++){
      var n = nodes[i];
      if (!n.offsetParent && n.getClientRects().length === 0) continue; // hidden
      var r = n.getBoundingClientRect();
      if (r.width < 120 || r.height === 0) continue;                    // tiny/collapsed
      if (r.bottom > bestBottom){ bestBottom = r.bottom; editor = n; }
    }
    return editor;
  }

  // ===================================================================
  // Design 1: slim full-width bar under the composer.
  // ===================================================================
  var barEl = null;
  var barObserver = null, barObservedParent = null, barObservedComposer = null, barReinserts = [];

  function segHtml(s){
    return '<div class="cub-seg" role="img" data-seg="'+s.key+'" title="'+s.tip+'">'+
      '<span class="cub-label"><span class="cub-name">'+s.label+'</span> <span class="cub-sub">'+s.sub+'</span></span>'+
      '<span class="cub-track"><span class="cub-fill"></span></span>'+
      '<span class="cub-val">–</span>'+
      '<span class="cub-reset"></span>'+
    '</div>';
  }

  function buildBar(){
    var bar = document.createElement("div");
    bar.id = "cub-bar"; bar.className = "cub-bar";
    bar.innerHTML = SEGS.map(segHtml).join("");
    return bar;
  }

  function fillSeg(node, d, label){
    var val = node.querySelector(".cub-val");
    var fill = node.querySelector(".cub-fill");
    var reset = node.querySelector(".cub-reset");
    if (!d || !d.available || d.pct == null){
      val.textContent = "–"; fill.style.width = "0%"; fill.className = "cub-fill"; reset.textContent = "";
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

  function renderBar(){
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

  function markErrorBar(){
    if (!barEl) return;
    SEGS.forEach(function(s){
      var node = barEl.querySelector('[data-seg="'+s.key+'"]');
      if (node && !node.hidden) node.querySelector(".cub-val").textContent = "!";
    });
  }

  // The chat input differs across surfaces (contenteditable on /new & chats, and
  // the Claude Code app on /code). From the bottom-most input, walk up while each
  // parent only wraps the input line (same height). A horizontal row (input beside
  // a send button) never adds height, so we skip past it; we stop at the first
  // composer-width parent that is TALLER — the vertical stack that also holds the
  // toolbar. Inserting the bar after `node` there makes it a full-width row between
  // the input and the toolbar, so it can never land beside/over the input.
  function findComposer(){
    var editor = findEditor();
    if (!editor) return null;
    var node = editor, firstWide = null;
    for (var j=0; j<8; j++){
      var parent = node.parentElement;
      if (!parent) break;
      var pr = parent.getBoundingClientRect();
      if (pr.width >= 320){
        if (!firstWide) firstWide = node;
        if (pr.height > node.getBoundingClientRect().height + 12) return node;
      }
      node = parent;
    }
    return firstWide || editor.parentElement;
  }

  function insertBar(composer){
    composer.insertAdjacentElement("afterend", barEl);
    barEl.classList.remove("cub-fixed");
  }

  // Allow bursts of re-insertion but back off if a surface fights us every frame,
  // so we never spin in a tight loop against React (the poll re-acquires instead).
  function barReinsertAllowed(){
    var now = Date.now();
    barReinserts.push(now);
    while (barReinserts.length && now - barReinserts[0] > 1000) barReinserts.shift();
    return barReinserts.length <= 5;
  }

  function stopBarWatching(){
    if (barObserver) barObserver.disconnect();
    barObserver = null; barObservedParent = null; barObservedComposer = null;
  }

  // Watch the composer's parent so that if a re-render detaches the bar we put it
  // back synchronously (before paint) instead of waiting for the 800ms poll.
  function watchBarParent(parent, composer){
    if (barObservedParent === parent && barObservedComposer === composer) return;
    stopBarWatching();
    barObservedParent = parent; barObservedComposer = composer;
    barObserver = new MutationObserver(function(){
      if (!enabled || design !== "1" || !barEl || barEl.isConnected) return;
      if (!composer.isConnected) return;      // composer replaced → let the poll re-acquire
      if (!barReinsertAllowed()) return;      // thrashing → back off
      insertBar(composer);
      renderBar();
    });
    barObserver.observe(parent, { childList: true });
  }

  function placeBar(){
    if (!barEl) barEl = buildBar();
    var composer = findComposer();
    if (composer && composer.parentElement){
      var correct = barEl.parentElement === composer.parentElement && barEl.previousElementSibling === composer;
      if (!correct) insertBar(composer);
      watchBarParent(composer.parentElement, composer);
    } else {
      stopBarWatching();
      if (!barEl.isConnected){ barEl.classList.add("cub-fixed"); document.body.appendChild(barEl); }
    }
    renderBar();
  }

  // ===================================================================
  // Design 2: compact widget inside the composer toolbar.
  // ===================================================================
  var inlineEl = null;
  var inlineObserver = null, inlineObservedToolbar = null, inlineReinserts = [];
  var inlineLastMissLog = 0;
  var RING_C = 2 * Math.PI * 8; // circumference of the r=8 ring

  function inlineSegHtml(s){
    var indicator = s.ring
      ? '<span class="cub-i-ring">'+
          '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">'+
            '<circle class="cub-i-ring-bg" cx="10" cy="10" r="8"></circle>'+
            '<circle class="cub-i-ring-fill" cx="10" cy="10" r="8"></circle>'+
          '</svg>'+
        '</span>'
      : '<span class="cub-i-bar"><span class="cub-i-fill"></span></span>';
    var val = '<span class="cub-i-val">–</span>';
    // Bar window reads value-then-bar; ring windows read ring-then-value.
    var inner = s.ring ? (indicator + val) : (val + indicator);
    return '<span class="cub-i-seg" role="img" data-seg="'+s.key+'" title="'+s.tip+'">'+ inner +'</span>';
  }

  function buildInline(){
    var el = document.createElement("div");
    el.id = "cub-inline"; el.className = "cub-inline";
    el.innerHTML = SEGS.map(inlineSegHtml).join("");
    return el;
  }

  function fillInlineSeg(node, d, s){
    var val = node.querySelector(".cub-i-val");
    if (!d || !d.available || d.pct == null){
      val.textContent = "–";
      if (s.ring){
        var rf0 = node.querySelector(".cub-i-ring-fill");
        rf0.style.strokeDasharray = RING_C; rf0.style.strokeDashoffset = RING_C; rf0.setAttribute("class", "cub-i-ring-fill");
      } else {
        var f0 = node.querySelector(".cub-i-fill");
        f0.style.width = "0%"; f0.className = "cub-i-fill";
      }
      node.setAttribute("aria-label", s.label + ": no data");
      node.setAttribute("title", s.label + " (" + s.sub + "): no data");
      return;
    }
    var pct = Math.max(0, Math.min(100, Math.round(d.pct)));
    var r = pct > 0 ? CUB.fmtReset(d.resetAt) : "";
    var cc = colorClass(pct);
    val.textContent = pct + "%";
    if (s.ring){
      var rf = node.querySelector(".cub-i-ring-fill");
      rf.style.strokeDasharray = RING_C;
      rf.style.strokeDashoffset = RING_C * (1 - pct / 100);
      rf.setAttribute("class", "cub-i-ring-fill " + cc);
    } else {
      var f = node.querySelector(".cub-i-fill");
      f.style.width = pct + "%";
      f.className = "cub-i-fill " + cc;
    }
    node.setAttribute("aria-label", s.label + ": " + pct + "% used" + (r ? ", resets in " + r : ""));
    node.setAttribute("title", s.label + " (" + s.sub + "): " + pct + "%" + (r ? ", resets in " + r : ""));
  }

  function renderInline(){
    if (!inlineEl) return;
    var any = false;
    SEGS.forEach(function(s){
      var node = inlineEl.querySelector('[data-seg="'+s.key+'"]');
      if (!node) return;
      var d = lastData ? lastData[s.key] : null;
      var canShow = s.opus ? !!(d && d.available) : (show[s.key] !== false);
      node.hidden = !canShow;
      if (canShow){ any = true; fillInlineSeg(node, d, s); }
    });
    inlineEl.style.display = any ? "" : "none";
  }

  function markErrorInline(){
    if (!inlineEl) return;
    SEGS.forEach(function(s){
      var node = inlineEl.querySelector('[data-seg="'+s.key+'"]');
      if (node && !node.hidden) node.querySelector(".cub-i-val").textContent = "!";
    });
  }

  // Find the toolbar's "+" button. We can't assume the toolbar lives in any one
  // specific parent (on /new the empty input sits in a min-height wrapper that is
  // already taller than the text, so the composer's toolbar is a sibling row higher
  // up). So walk up from the editor and, at each composer-width ancestor, look for
  // the bottom-most row of controls sitting in the band just below the input; the
  // innermost match is the composer's own toolbar. Purely geometric, so it survives
  // claude.ai's class/label churn like the bar placement does.
  function findPlusButton(){
    var editor = findEditor();
    if (!editor) return null;
    var er = editor.getBoundingClientRect();
    var node = editor;
    for (var j = 0; j < 10; j++){
      var parent = node.parentElement;
      if (!parent) break;
      if (parent.getBoundingClientRect().width >= 280){
        var plus = toolbarPlusIn(parent, er, editor);
        if (plus) return plus;            // innermost match = the composer toolbar
      }
      node = parent;
    }
    return null;
  }

  // The left-most control of the bottom-most row of toolbar controls in `container`,
  // limited to the band at/just below the input so page/sidebar buttons can't sneak
  // in. Broadened past <button> since claude.ai renders some controls as role=button.
  function toolbarPlusIn(container, er, editor){
    var btns = [];
    container.querySelectorAll('button, [role="button"]').forEach(function(b){
      if (b === editor || b.contains(editor)) return;                 // not the input itself
      if (!b.offsetParent && b.getClientRects().length === 0) return; // hidden
      var r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.height > 64) return;   // button-sized only
      if (r.top < er.top - 8 || r.top > er.bottom + 140) return;      // composer toolbar band
      btns.push({ el: b, r: r });
    });
    if (btns.length < 2) return null;
    var maxBottom = Math.max.apply(null, btns.map(function(x){ return x.r.bottom; }));
    var row = btns.filter(function(x){ return maxBottom - x.r.bottom <= 16; }); // bottom-most row
    if (row.length < 2) return null;
    row.sort(function(a, b){ return a.r.left - b.r.left; });
    return row[0].el; // left-most = the "+"
  }

  function inlineReinsertAllowed(){
    var now = Date.now();
    inlineReinserts.push(now);
    while (inlineReinserts.length && now - inlineReinserts[0] > 1000) inlineReinserts.shift();
    return inlineReinserts.length <= 5;
  }

  function stopInlineWatching(){
    if (inlineObserver) inlineObserver.disconnect();
    inlineObserver = null; inlineObservedToolbar = null;
  }

  // Re-insert the widget after the "+" if a re-render detaches it, mirroring the
  // bar's watcher and its back-off.
  function watchToolbar(parent){
    if (inlineObservedToolbar === parent) return;
    stopInlineWatching();
    inlineObservedToolbar = parent;
    inlineObserver = new MutationObserver(function(){
      if (!enabled || design !== "2" || !inlineEl || inlineEl.isConnected) return;
      if (!parent.isConnected) return;         // toolbar replaced → let the poll re-acquire
      if (!inlineReinsertAllowed()) return;    // thrashing → back off
      var plus = findPlusButton();
      if (plus && plus.parentElement === parent){ plus.insertAdjacentElement("afterend", inlineEl); renderInline(); }
    });
    inlineObserver.observe(parent, { childList: true });
  }

  function placeInline(){
    if (!inlineEl) inlineEl = buildInline();
    var plus = findPlusButton();
    if (plus && plus.parentElement){
      var parent = plus.parentElement;
      var correct = inlineEl.parentElement === parent && inlineEl.previousElementSibling === plus;
      if (!correct) plus.insertAdjacentElement("afterend", inlineEl);
      watchToolbar(parent);
    } else {
      // Inline-only: with no toolbar to sit in, show nothing and retry next tick.
      stopInlineWatching();
      if (inlineEl.isConnected) inlineEl.remove();
      var now = Date.now();
      if (now - inlineLastMissLog > 5000){
        inlineLastMissLog = now;
        try { console.debug("[Claude Usage Bar] Design 2: composer toolbar not found; will retry"); } catch (e) {}
      }
    }
    renderInline();
  }

  // ===================================================================
  // Shared: dispatch by active design, polling, enable/disable.
  // ===================================================================
  function render(){ design === "2" ? renderInline() : renderBar(); }
  function markError(){ design === "2" ? markErrorInline() : markErrorBar(); }

  function removeWidgets(){
    stopBarWatching();
    stopInlineWatching();
    if (barEl && barEl.isConnected) barEl.remove();
    if (inlineEl && inlineEl.isConnected) inlineEl.remove();
  }

  function place(){
    if (!enabled){ removeWidgets(); return; }
    design === "2" ? placeInline() : placeBar();
  }

  function switchDesign(next){
    if (next === design) return;
    removeWidgets();          // tear down the old look (widget + observer)
    design = next;
    if (enabled){ place(); render(); }
  }

  async function refresh(){
    if (!enabled) return;
    try {
      var data = await CUB.getUsage();
      lastData = data;
      chrome.storage.local.set({ [LAST_KEY]: data });
      render();
    } catch (e) { markError(); }
  }

  function startPolling(){
    stopPolling();
    refresh();
    pollTimer = setInterval(function(){ if (document.visibilityState === "visible") refresh(); }, POLL_MS);
  }
  function stopPolling(){ if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  function enable(){ enabled = true; place(); startPolling(); }
  function disable(){ enabled = false; stopPolling(); removeWidgets(); }

  chrome.storage.onChanged.addListener(function (changes, area){
    if (area !== "local") return;
    if (changes[TOGGLE_KEY]) { changes[TOGGLE_KEY].newValue === false ? disable() : enable(); }
    if (changes[LAST_KEY] && changes[LAST_KEY].newValue){ lastData = changes[LAST_KEY].newValue; if (enabled) render(); }
    if (changes[SHOW_KEY] && changes[SHOW_KEY].newValue){ show = Object.assign({ session:true, allModels:true }, changes[SHOW_KEY].newValue); if (enabled) render(); }
    if (changes[DESIGN_KEY]) { switchDesign(changes[DESIGN_KEY].newValue === "2" ? "2" : "1"); }
  });

  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "visible" && enabled) refresh();
  });

  chrome.storage.local.get([TOGGLE_KEY, LAST_KEY, SHOW_KEY, DESIGN_KEY], function (o){
    if (o[LAST_KEY]) lastData = o[LAST_KEY];
    if (o[SHOW_KEY]) show = Object.assign(show, o[SHOW_KEY]);
    design = o[DESIGN_KEY] === "2" ? "2" : "1";
    enabled = o[TOGGLE_KEY] !== false;
    placeTimer = setInterval(place, PLACE_MS);
    if (enabled) startPolling();
  });
})();
