// usage.js — shared helpers for Claude's internal usage endpoint.
// Loaded by both the content script (same-origin on claude.ai) and the popup.
//
// Endpoints (undocumented, can change):
//   GET /api/organizations -> [{ uuid, name, capabilities:[...] }, ...]
//   GET /api/organizations/{uuid}/usage
//       -> { five_hour:{utilization:0-100,resets_at}, seven_day:{...}, seven_day_opus:{...} }
//
// Key fix vs v1: an account can belong to several orgs; we probe each org's
// usage and lock onto the one with real data/activity, and let the user override.

var CUB = (function () {
  var AUTO_KEY = "cub_org";          // {id,name,ts} auto-detected
  var MANUAL_KEY = "cub_org_manual"; // user-chosen uuid (string) — wins over auto
  var ORG_TTL_MS = 6 * 60 * 60 * 1000;
  var API = "https://claude.ai/api";

  function sget(k){ return new Promise(function(r){ chrome.storage.local.get(k, r); }); }
  function sset(o){ return new Promise(function(r){ chrome.storage.local.set(o, r); }); }
  function sdel(k){ return new Promise(function(r){ chrome.storage.local.remove(k, r); }); }

  async function fetchJson(url){
    var res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    if (res.status === 401 || res.status === 403){ var a=new Error("AUTH"); a.code="AUTH"; a.status=res.status; throw a; }
    if (!res.ok){ var h=new Error("HTTP_"+res.status); h.code="HTTP"; h.status=res.status; throw h; }
    return res.json();
  }

  function avail(b){ return b && typeof b==="object" && b.utilization != null; }
  function maxUtil(u){
    var vals = [u && u.five_hour, u && u.seven_day, u && u.seven_day_opus]
      .map(function(b){ return avail(b) ? Number(b.utilization) : -1; });
    return Math.max.apply(null, vals.concat(-1));
  }

  async function listOrgs(){
    var orgs = await fetchJson(API + "/organizations");
    if (!Array.isArray(orgs) || !orgs.length){ var e=new Error("NO_ORGS"); e.code="NO_ORGS"; throw e; }
    return orgs;
  }

  // Fetch usage for every org. Returns rich rows for the popup AND the best pick.
  async function scanOrgs(){
    var orgs = await listOrgs();
    var rows = [];
    var best = null, bestScore = -2;
    for (var i=0;i<orgs.length;i++){
      var o = orgs[i];
      var row = { uuid:o.uuid, name:o.name || "(unnamed)", ok:false, raw:null, error:null };
      try {
        var u = await fetchJson(API + "/organizations/" + o.uuid + "/usage");
        row.ok = true; row.raw = u;
        var has = avail(u.five_hour) || avail(u.seven_day) || avail(u.seven_day_opus);
        var mu = maxUtil(u);
        var score = (has ? 1000 : 0) + (mu >= 0 ? mu : 0);
        if (score > bestScore){ bestScore = score; best = { id:o.uuid, name:row.name, usage:u }; }
      } catch (e) { row.error = e.code || "ERR"; }
      rows.push(row);
    }
    if (!best){
      var chat = orgs.find(function(o){ return Array.isArray(o.capabilities) && o.capabilities.indexOf("chat")!==-1; }) || orgs[0];
      best = { id: chat.uuid, name: chat.name || "", usage: null };
    }
    await sset({ cub_scan: { rows: rows, at: Date.now() } });
    return { rows: rows, best: best };
  }

  async function resolveOrg(){
    var st = await sget([AUTO_KEY, MANUAL_KEY]);
    if (st[MANUAL_KEY]){
      var nm = (st[AUTO_KEY] && st[AUTO_KEY].id === st[MANUAL_KEY]) ? st[AUTO_KEY].name : "";
      return { id: st[MANUAL_KEY], name: nm, manual: true };
    }
    if (st[AUTO_KEY] && st[AUTO_KEY].id && (Date.now() - st[AUTO_KEY].ts) < ORG_TTL_MS){
      return { id: st[AUTO_KEY].id, name: st[AUTO_KEY].name };
    }
    var scan = await scanOrgs();
    await sset({ [AUTO_KEY]: { id: scan.best.id, name: scan.best.name, ts: Date.now() } });
    return { id: scan.best.id, name: scan.best.name, prefetched: scan.best.usage };
  }

  function normalize(b){
    if (!avail(b)) return { available:false, pct:null, resetAt:null };
    var resetAt = b.resets_at != null ? b.resets_at : (b.reset_at != null ? b.reset_at : null);
    return { available:true, pct:Number(b.utilization), resetAt:resetAt };
  }

  function toResult(data, org){
    return {
      session:   normalize(data.five_hour),
      allModels: normalize(data.seven_day),
      opus:      normalize(data.seven_day_opus),
      orgName: org.name || "", orgId: org.id, fetchedAt: Date.now()
    };
  }

  async function getUsage(){
    var org = await resolveOrg();
    var data = org.prefetched || null;
    if (!data){
      try { data = await fetchJson(API + "/organizations/" + org.id + "/usage"); }
      catch (e){
        if (e.code === "HTTP" && (e.status === 404 || e.status === 403)){
          await sdel([AUTO_KEY]);                 // stale auto pick → rescan
          var scan = await scanOrgs();
          org = { id: scan.best.id, name: scan.best.name };
          await sset({ [AUTO_KEY]: { id: org.id, name: org.name, ts: Date.now() } });
          data = scan.best.usage || await fetchJson(API + "/organizations/" + org.id + "/usage");
        } else throw e;
      }
    }
    try { console.debug("[Claude Usage Bar] org", org.id, org.name, "raw", data); } catch (e) {}
    await sset({ cub_debug: { orgName: org.name, orgId: org.id, raw: data, at: Date.now() } });
    return toResult(data, org);
  }

  async function setManualOrg(id){ await sset({ [MANUAL_KEY]: id || null }); await sdel([AUTO_KEY]); }
  async function clearOrg(){ await sdel([AUTO_KEY, MANUAL_KEY, "cub_scan"]); }

  function fmtReset(iso){
    if (!iso) return "";
    var t = new Date(iso).getTime(); if (isNaN(t)) return "";
    var ms = t - Date.now(); if (ms <= 0) return "now";
    var h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000);
    if (h >= 24){ var d=Math.floor(h/24); return d+"d "+(h%24)+"h"; }
    if (h > 0) return h+"h "+m+"m";
    return m+"m";
  }

  return { getUsage:getUsage, scanOrgs:scanOrgs, setManualOrg:setManualOrg, clearOrg:clearOrg, fmtReset:fmtReset };
})();
