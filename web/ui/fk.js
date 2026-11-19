/* FrescoKart shops pilot: helpers shared by the customer, shop and rider apps. No libraries, no build step. */
(function () {
  "use strict";
  var FK = (window.FK = {});

  /* ---------- safe HTML: FK.html`<b>${name}</b>` escapes every value; FK.raw(s) marks trusted markup ---------- */
  function Raw(s) { this.s = s; }
  FK.raw = function (s) { return new Raw(s == null ? "" : String(s)); };
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  FK.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  function part(v) {
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(part).join("");
    if (v == null) return "";
    return FK.esc(v);  // true and false print as "true" and "false", which aria-checked and friends need
  }
  FK.html = function (strings) {
    var out = strings[0];
    for (var i = 1; i < strings.length; i++) out += part(arguments[i]) + strings[i];
    return new Raw(out);
  };
  FK.put = function (el, raw) { el.innerHTML = raw instanceof Raw ? raw.s : String(raw); };

  /* ---------- storage ---------- */
  FK.load = function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  FK.save = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  FK.drop = function (k) { try { localStorage.removeItem(k); } catch (e) { } };

  /* ---------- API: always resolves to {ok, status, data, offline} ---------- */
  FK.api = function (path, opts) {
    opts = opts || {};
    var headers = { "X-FK": "1" };
    if (opts.body) headers["Content-Type"] = "application/json";
    if (opts.auth) headers["X-FK-Auth"] = opts.auth;
    return fetch(path, { method: opts.body ? "POST" : "GET", headers: headers, cache: "no-store",
      body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok !== false, status: r.status, data: j }; });
      })
      .catch(function () { return { ok: false, status: 0, data: {}, offline: true }; });
  };
  FK.msg = function (res, fallback) {
    if (res.offline) return "No internet. Check your connection and try again.";
    return (res.data && res.data.message) || fallback || "Something went wrong. Please try again.";
  };

  /* ---------- formats ---------- */
  FK.rs = function (n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? "−₹" : "₹") + Math.abs(v).toLocaleString("en-IN");
  };
  var UNIT_WORD = { each: ["", ""], pack: [" pack", " packs"], bunch: [" bunch", " bunches"] };
  FK.qty = function (unit, q) {
    q = Number(q) || 0;
    if (unit === "kg") return q < 1 ? Math.round(q * 1000) + " g" : (Math.round(q * 100) / 100) + " kg";
    var w = UNIT_WORD[unit] || ["", ""];
    return q + (q === 1 ? w[0] : w[1]);
  };
  FK.per = function (unit) { return unit === "kg" ? "/kg" : unit === "each" ? " each" : unit === "pack" ? " a pack" : " a bunch"; };
  FK.clock = function (iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?([ap])m/i, function (m, a) { return " " + a.toUpperCase() + "M"; });
  };
  FK.minsSince = function (iso) { var d = new Date(iso); return isNaN(d) ? 0 : Math.max(0, Math.floor((Date.now() - d) / 60000)); };
  FK.addMins = function (iso, m) { var d = new Date(iso); return isNaN(d) ? "" : new Date(d.getTime() + m * 60000).toISOString(); };
  FK.tel = function (phone) { return "tel:" + String(phone || "").replace(/[^\d+]/g, ""); };
  FK.mapLink = function (q) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q); };

  /* ---------- icons (one 2px line weight, currentColor) ---------- */
  var P = {
    back: '<path d="M15 6l-6 6 6 6"/>', next: '<path d="M9 6l6 6-6 6"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>', receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
    basket: '<path d="M5 9h14l-1.5 10a2 2 0 0 1-2 1.7H8.5a2 2 0 0 1-2-1.7zM9 9l3-5 3 5"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6 8-6s7 1.5 8 6"/>',
    store: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>', scooter: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-7h5l3 7M10 10l-1-3H7M15 10l1-3h3"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>', tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>', cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>', logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/>', map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
    printer: '<path d="M6 9V3h12v6M6 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-2M7 14h10v7H7z"/>', key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
    fish: '<path d="M3 12c3-4.5 8.5-5.5 13-2l4.5-3v10L16 14c-4.5 3.5-10 2.5-13-2z"/><circle cx="7.5" cy="11.2" r=".8" fill="currentColor"/>',
    meat: '<path d="M14.5 4.5a5.5 5.5 0 0 1 2 9.2l-4.6 4.6a2.5 2.5 0 0 1-3.6 0 2.5 2.5 0 0 1-3.5-3.5 2.5 2.5 0 0 1 0-3.6l4.6-4.6a5.5 5.5 0 0 1 5.1-2.1z"/><path d="M14 10a2 2 0 1 0 0-.01"/>',
    veg: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7"/>',
    grocery: '<path d="M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0"/>'
  };
  FK.icon = function (name, size, extra) {
    var s = size || 20, w = s >= 20 ? 2 : 2.2;
    return FK.raw('<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + w +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + (P[name] || "") + "</svg>");
  };
  FK.kindName = { fish: "Fish and seafood", meat: "Meat and chicken", veg: "Vegetables", grocery: "Groceries" };
  FK.thumb = function (item, kind, cls) {
    var out = item && item.in_stock === false ? " out" : "";
    if (item && item.img) return FK.html`<span class="thumb ${cls || ""}${out}"><img src="${item.img}" alt="" loading="lazy"></span>`;
    return FK.html`<span class="thumb k-${kind || "fish"} ${cls || ""}${out}">${FK.icon(kind || "fish", cls === "sm" ? 20 : 28)}</span>`;
  };

  /* ---------- toast ---------- */
  var toastTimer;
  FK.toast = function (text, bad) {
    var host = document.getElementById("app");
    var old = host.querySelector(".toast");
    if (old) old.remove();
    var t = document.createElement("div");
    t.className = "toast" + (bad ? " r" : "");
    t.setAttribute("role", bad ? "alert" : "status");
    FK.put(t, FK.html`${FK.icon(bad ? "alert" : "check", 18)}<span>${text}</span>`);
    host.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2800);
  };

  /* ---------- sheet in #layer ---------- */
  FK.sheet = function (inner, onClose) {
    var layer = document.getElementById("layer");
    var open = layer.querySelector(".sheet");
    if (open) {  // already showing: swap the content only, so the slide-in does not replay under the finger
      FK.put(open, FK.html`<div class="grab" aria-hidden="true"></div>${inner}`);
    } else {
      FK.put(layer, FK.html`<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>${inner}</div>`);
      var first = layer.querySelector(".sheet button, .sheet input");
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 50);
    }
    layer.onclick = function (e) { if (e.target.closest("[data-close]")) { FK.closeSheet(); if (onClose) onClose(); } };
  };
  FK.closeSheet = function () { var l = document.getElementById("layer"); l.innerHTML = ""; l.onclick = null; };

  /* ---------- keep the screen on while the shop or rider app is in use (Chrome on Android supports it) ---------- */
  var lock = null, wantLock = false;
  FK.keepAwake = function (on) {
    wantLock = on;
    if (!("wakeLock" in navigator)) return;
    if (on && !lock) navigator.wakeLock.request("screen").then(function (l) { lock = l; l.addEventListener("release", function () { lock = null; }); }).catch(function () { });
    if (!on && lock) { lock.release(); lock = null; }
  };
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && wantLock) FK.keepAwake(true); });

  /* ---------- the FrescoKart ring: three rising notes, repeated until stopped ---------- */
  var ctx = null, ringTimer = null;
  FK.audioReady = function () { return !!ctx && ctx.state === "running"; };
  FK.unlockAudio = function () {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state !== "running") ctx.resume();
    } catch (e) { }
    return FK.audioReady();
  };
  function note(freq, at, len, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + len + 0.05);
  }
  FK.chime = function (loud) {
    if (!FK.unlockAudio()) return;
    var t = ctx.currentTime + 0.02, v = loud ? 0.9 : 0.5;
    note(659, t, 0.35, v); note(784, t + 0.32, 0.35, v); note(1047, t + 0.64, 0.6, v);
  };
  FK.ring = function (on) {
    clearInterval(ringTimer); ringTimer = null;
    if (!on) return;
    var n = 0;
    FK.chime(false);
    ringTimer = setInterval(function () { n++; FK.chime(n > 2); if (navigator.vibrate) navigator.vibrate([300, 150, 300]); }, 2400);
  };

  /* ---------- add to home screen ----------
     Chrome on Android fires beforeinstallprompt, so one tap installs. iPhone and iPad never ask, so we show the
     Safari steps; other phone browsers get their menu steps. Once installed, the card never shows again. */
  var installPrompt = null;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isPhone = isIOS || /android|mobi/i.test(navigator.userAgent);
  FK.install = {
    onChange: null,
    installed: function () {
      try { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; }
    },
    possible: function () { return !FK.install.installed() && (!!installPrompt || isPhone); },
    snoozed: function (key) { var t = FK.load(key + "-later", 0); return !!t && Date.now() < t; },
    later: function (key, days) { FK.save(key + "-later", Date.now() + days * 864e5); },
    /* a card for the top of a screen: {key, icon, title, text, days}; empty when installed or put off */
    card: function (o) {
      if (!FK.install.possible() || FK.install.snoozed(o.key)) return "";
      return FK.html`<div class="install rise"><img src="${o.icon}" alt="" width="44" height="44">
        <span class="stack"><b class="t14">${o.title}</b><span class="t12 muted">${o.text}</span></span>
        <button class="btn xs green" data-act="install">${installPrompt ? "Install" : "How"}</button>
        <button class="icon-btn" data-act="install-later" data-key="${o.key}" data-days="${o.days || 14}" aria-label="Not now" style="width:36px;height:36px;color:var(--muted)">${FK.icon("close", 18)}</button></div>`;
    },
    run: function (name, icon) {
      if (installPrompt) {
        var p = installPrompt;
        installPrompt = null;
        p.prompt();
        if (p.userChoice) p.userChoice.then(function () { if (FK.install.onChange) FK.install.onChange(); });
        return;
      }
      var steps = isIOS
        ? [FK.html`Tap the <b>Share</b> button ${FK.raw('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M12 15V3M7 8l5-5 5 5M5 12v8h14v-8"/></svg>')} in Safari’s toolbar.`,
           FK.html`Scroll down and tap <b>Add to Home Screen</b>.`, FK.html`Tap <b>Add</b>. ${name} now opens from your home screen, like an app.`]
        : [FK.html`Tap the browser’s menu, the <b>⋮</b> at the top right.`, FK.html`Tap <b>Install app</b> or <b>Add to Home screen</b>.`,
           FK.html`Tap <b>Install</b>. ${name} now opens from your home screen, like an app.`];
      FK.sheet(FK.html`<div class="row" style="grid-template-columns:48px minmax(0,1fr);min-height:0"><img src="${icon}" alt="" width="48" height="48" style="border-radius:12px"><h2 class="h2">Add ${name} to your home screen</h2></div>
        <ol style="margin:16px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px">${steps.map(function (s, i) {
          return FK.html`<li style="display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;align-items:center;font:500 14px/1.45 var(--body)"><span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--green-t);color:var(--green-ink);font:800 13px/1 var(--body)">${i + 1}</span><span>${s}</span></li>`;
        })}</ol>
        <button class="btn green" data-close style="margin-top:18px">Got it</button>`);
    }
  };
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installPrompt = e; if (FK.install.onChange) FK.install.onChange(); });
  window.addEventListener("appinstalled", function () { installPrompt = null; FK.toast("Added to your home screen"); if (FK.install.onChange) FK.install.onChange(); });
  FK.registerSW = function (path, scope) {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    window.addEventListener("load", function () { navigator.serviceWorker.register(path, { scope: scope }).catch(function () { }); });
  };

  /* ---------- online / offline strip ---------- */
  FK.watchNet = function () {
    var el = document.getElementById("net");
    if (!el) return;
    function upd() { el.hidden = navigator.onLine !== false; }
    window.addEventListener("online", upd); window.addEventListener("offline", upd); upd();
  };
})();
