/* FrescoKart customer app. Plain JavaScript, no build step.
   The menu comes from menu.js (made by build_site.py from the website), orders go to the same server as the website.
   Screens are hash routes (#/kit/mathi), so the browser back button works and links can be shared. */
(function () {
  "use strict";

  var VERSION = "1.0.0";
  var WA = "918157863503";
  var AREAS = ["Kakkanad", "Edappally", "Fort Kochi", "Panampilly Nagar", "MG Road", "Kacheripady", "Palarivattom", "Vyttila", "Thevara", "Marine Drive", "Tripunithura"];
  var ELSE = "Somewhere else in Kochi";
  var ETA_MIN = 45;
  var FINAL = { delivered: 1, cancelled: 1 };

  var M = window.FK_MENU || { fish: [], kits: [] };
  var kits = M.kits, fish = M.fish, kitById = {}, fishById = {};
  kits.forEach(function (k) { kitById[k.id] = k; k.hero = "/img/dish-" + k.id + ".webp"; k.flat = "/img/kit-" + k.id + ".webp"; });
  fish.forEach(function (f) { fishById[f.k] = f; f.img = "/img/" + f.k + ".webp"; });

  // How each fish can be cut. The first choice is the default.
  var CUTS = {
    karimeen: ["Cleaned and scored", "Curry cut", "Fry cut"],
    seer: ["Curry cut", "Fry slices", "Whole, cleaned"],
    sardine: ["Cleaned, whole", "Cleaned, head off"],
    mackerel: ["Curry cut", "Cleaned, whole", "Fry cut"],
    pomfret: ["Cleaned, whole", "Curry cut", "Fry cut"],
    prawns: ["Cleaned and deveined", "Shell on, deveined"],
    crab: ["Cleaned, halved", "Cleaned, whole"],
    squid: ["Rings", "Cleaned, whole"],
    tuna: ["Curry cut", "Steaks", "Cubes"]
  };
  function cutsOf(id) { return CUTS[id] || ["Curry cut", "Fry cut", "Whole, cleaned"]; }

  var CATS = [
    { id: "all", t: "All kits", img: "/img/hero-crate.webp", f: function () { return true; } },
    { id: "curry", t: "Curry", img: "/img/dish-karimeencurry.webp", f: function (k) { return k.id === "karimeencurry" || k.id === "ayala"; } },
    { id: "fry", t: "Roast and fry", img: "/img/dish-mathi.webp", f: function (k) { return ["chemmeen", "mathi", "koonthal"].indexOf(k.id) > -1; } },
    { id: "karimeen", t: "Karimeen", img: "/img/dish-pollichathu.webp", f: function (k) { return k.fish === "Karimeen"; } },
    { id: "shell", t: "Shellfish", img: "/img/dish-chemmeen.webp", f: function (k) { return k.id === "chemmeen" || k.id === "koonthal"; } },
    { id: "u600", t: "Under ₹600", img: "/img/dish-ayala.webp", f: function (k) { return k.p2 <= 600; } }
  ];
  var CHIPS = [
    { id: "off", t: "Offers", f: function (k) { return k.d > 0; } },
    { id: "q30", t: "Ready in 30 min", f: function (k) { return k.min <= 30; } },
    { id: "hot", t: "Hot and spicy", f: function (k) { return k.spice === "Hot"; } },
    { id: "mild", t: "Medium spice", f: function (k) { return k.spice === "Medium"; } }
  ];
  var FCHIPS = [
    { id: "off", t: "Offers", f: function (i) { return i.d > 0; } },
    { id: "u500", t: "Under ₹500/kg", f: function (i) { return i.p <= 500; } },
    { id: "fry", t: "Good for frying", f: function (i) { return ["karimeen", "sardine", "mackerel", "pomfret", "squid", "prawns"].indexOf(i.k) > -1; } },
    { id: "shell", t: "Shellfish", f: function (i) { return ["prawns", "crab", "squid"].indexOf(i.k) > -1; } }
  ];
  var RIDER = ["Call when you arrive", "Don’t ring the bell", "Leave with security", "Leave at the door"];
  var STEPS = [
    ["new", "Order placed", "We have your order"],
    ["confirmed", "Confirmed", "We checked it on WhatsApp"],
    ["preparing", "Packing", "Cut, packed and chilled"],
    ["out for delivery", "On the way", "Your rider is coming"],
    ["delivered", "Delivered", "Enjoy your meal"]
  ];

  /* ---------- small helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
  function kgs(q) { return (q % 1 ? q.toFixed(1) : String(q)) + " kg"; }
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function clock(d) { return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?(am|pm)$/i, function (m) { return " " + m.trim().toUpperCase(); }); }
  function day(d) {
    var t = new Date(), y = new Date(Date.now() - 864e5);
    if (d.toDateString() === t.toDateString()) return "Today";
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }
  function waLink(text) { return "https://wa.me/" + WA + "?text=" + encodeURIComponent(text); }
  function validPhone(v) {
    var d = String(v || "").replace(/\D/g, "");
    if (d.length === 12 && d.indexOf("91") === 0) d = d.slice(2); else if (d.length === 11 && d.charAt(0) === "0") d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : "";
  }

  /* ---------- icons (one-colour line icons) ---------- */
  function ic(name, size, sw) {
    var P = {
      back: '<path d="M15 6l-6 6 6 6"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', chev: '<path d="M9 6l6 6-6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
      bag: '<path d="M5 8h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8zM9 8V6a3 3 0 0 1 6 0v2"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
      clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>', minus: '<path d="M5 12h14"/>', plus: '<path d="M12 5v14M5 12h14"/>',
      home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>', orders: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
      pot: '<path d="M4 11h16v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM2 11h20M9 7c0-1.5 1-2 1-3M14 7c0-1.5 1-2 1-3"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6 8-6s7 1.5 8 6"/>',
      fish: '<path d="M3 12c3-5 9-6 13-2l5-3v10l-5-3c-4 4-10 3-13-2z"/>', leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7"/>',
      jar: '<path d="M8 3h8v3l2 3v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9l2-3zM8 11h8M8 15h8"/>', box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
      snow: '<path d="M12 2v20M4.9 6l14.2 12M19.1 6L4.9 18"/>', truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
      wa: '<path d="M4 20l1.4-4.2A8 8 0 1 1 8.2 18.6z"/><path d="M9 9.5c.3 2 1.8 3.8 4.3 4.6l1.2-1.2 1.7.8-.4 1.6c-3.6.4-7.3-3-7.4-6.8l1.6-.4.8 1.7z"/>',
      check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
      shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
      tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.3"/>', share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
      edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.5"/>',
      doc: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/>', phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
      download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', note: '<path d="M4 5h16v11H8l-4 4z"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
      timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4M9 2h6"/>'
    };
    return '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || "") + "</svg>";
  }
  var NONVEG = '<svg class="nonveg" viewBox="0 0 16 16" role="img" aria-label="Non-vegetarian"><rect x="1" y="1" width="14" height="14" rx="2" fill="#fff" stroke="#8A3B12" stroke-width="1.5"/><path d="M8 4.5l3.2 6H4.8z" fill="#8A3B12"/></svg>';

  /* ---------- state ---------- */
  var basket = load("fk-app-basket", {});        // { "k:mathi:2": 1, "f:seer:0": 1.5 }
  var profile = load("fk-app-profile", {});      // { name, phone, area, house, landmark }
  var orders = load("fk-app-orders", []);        // newest first
  var ui = { cat: "all", chips: {}, fchips: {}, sv: {}, cut: {}, kg: {}, rider: {}, note: "", q: "", agree: false, banner: 0 };
  var API = { on: false, checked: false };
  var UTM = (function () {
    var o = load("fk-utm", null);
    try {
      var p = new URLSearchParams(location.search), n = {};
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) { var v = p.get(k); if (v) n[k] = v.slice(0, 80); });
      if (document.referrer) { var h = document.referrer.split("/")[2]; if (h && h !== location.host) n.ref = h.slice(0, 80); }
      if (Object.keys(n).length) { o = n; save("fk-utm", n); }
    } catch (e) { }
    return o || {};
  })();
  var installPrompt = null, popKey = "", focusId = "";

  /* ---------- add to home screen ----------
     Android Chrome and desktop browsers fire beforeinstallprompt, so one tap installs.
     iPhone and iPad never ask, so we show the two Safari steps instead. */
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function isInstalled() {
    try { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; }
  }
  function canInstall() { return !isInstalled() && (!!installPrompt || isIOS); }
  function installSnoozed() { var t = load("fk-install-hide", 0); return !!t && Date.now() - t < 14 * 864e5; }
  function installCard() {
    if (!canInstall() || installSnoozed()) return "";
    return '<div class="install"><img src="/app/icon-192.png" alt="" width="40" height="40"><span class="t"><b>Get the FrescoKart app</b><span>Add it to your home screen. Free, opens in one tap.</span></span>' +
      '<button class="add sm" type="button" data-act="install" aria-label="Add FrescoKart to your home screen">ADD</button><button class="iconbtn x" type="button" data-act="hideinstall" aria-label="Not now">' + ic("close", 18, 2.2) + "</button></div>";
  }
  function iosSheet() {
    $("#layer").innerHTML = '<div class="sheetwrap" data-act="closelayer"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ios-h" data-act="noop"><div class="grab" aria-hidden="true"></div><div style="padding:0 20px">' +
      '<div style="display:flex;align-items:center;gap:12px"><img src="/app/icon-192.png" alt="" width="48" height="48" style="border-radius:12px"><h2 id="ios-h" class="h2">Add FrescoKart to your home screen</h2></div>' +
      '<ol class="howto"><li><span class="n">1</span><span>Tap the <b>Share</b> button ' + ic("share", 18, 2.2) + ' in Safari’s toolbar.</span></li>' +
      '<li><span class="n">2</span><span>Scroll down and tap <b>Add to Home Screen</b>.</span></li>' +
      '<li><span class="n">3</span><span>Tap <b>Add</b>. FrescoKart now opens from your home screen, like an app.</span></li></ol>' +
      '<button class="cta green" type="button" data-act="closelayer">Got it</button></div></div></div>';
    var b = $("#layer .cta"); if (b) b.focus();
  }

  function saveBasket() { save("fk-app-basket", basket); }
  function saveProfile() { save("fk-app-profile", profile); }
  function saveOrders() { save("fk-app-orders", orders.slice(0, 30)); }

  /* ---------- prices and basket lines ---------- */
  function kitBase(k, sv) { return sv === 4 ? k.p4 : k.p2; }
  function kitNow(k, sv) { return kitBase(k, sv) * (1 - k.d / 100); }
  function fishNow(f) { return f.p * (1 - f.d / 100); }
  function line(key, q) {
    var p = key.split(":");
    if (p[0] === "k") {
      var k = kitById[p[1]]; if (!k) return null;
      var sv = +p[2];
      return { key: key, kind: "k", id: k.id, sv: sv, q: q, name: k.n, img: k.hero, label: q + (q > 1 ? " kits" : " kit"), qtyN: String(q),
        total: kitNow(k, sv) * q, was: kitBase(k, sv) * q, detail: "Serves " + sv };
    }
    var f = fishById[p[1]]; if (!f) return null;
    var cut = cutsOf(f.k)[+p[2]] || cutsOf(f.k)[0];
    return { key: key, kind: "f", id: f.k, cut: cut, q: q, name: f.n, img: f.img, label: kgs(q), qtyN: kgs(q),
      total: fishNow(f) * q, was: f.p * q, detail: cut + " · " + inr(fishNow(f)) + "/kg" };
  }
  function lines() {
    return Object.keys(basket).map(function (k) { return line(k, basket[k]); }).filter(Boolean);
  }
  function totals() {
    var t = 0, w = 0, n = 0;
    lines().forEach(function (l) { t += l.total; w += l.was; n++; });
    return { pay: Math.round(t), mrp: Math.round(w), saved: Math.round(w) - Math.round(t), n: n };
  }
  function qtyOf(key) { return basket[key] || 0; }
  function bump(key, dir) {
    var kit = key.charAt(0) === "k", step = kit ? 1 : 0.5, max = kit ? 9 : 10, n = basket[key] || 0;
    if (dir === "add") n = kit ? 1 : (n || 1);
    else if (dir === "inc") n = Math.min(max, n + step);
    else if (dir === "dec") n = Math.round((n - step) * 10) / 10;
    if (dir === "inc" && n === max && (basket[key] || 0) === max) toast(kit ? "You can add up to 9 of one kit." : "You can add up to 10 kg of one fish.");
    if (n <= 0) delete basket[key]; else basket[key] = n;
    popKey = key;
    saveBasket();
  }

  /* ---------- server ---------- */
  function apiPost(path, body) {
    return fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-FK": "1" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "server" }; }).then(function (j) { j.status = r.status; return j; }); });
  }
  function checkServer() {
    return fetch("/api/health", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { API.on = !!(j && j.ok); }).catch(function () { API.on = false; })
      .then(function () { API.checked = true; });
  }
  var voted = {};
  function voteArea(a) {
    if (!API.on || voted[a] || a === ELSE) return; voted[a] = 1;
    apiPost("/api/area-votes", { area: a, utm: UTM }).catch(function () { });
  }
  function refreshOrder(o) {
    if (!o || !o.t || FINAL[o.status]) return Promise.resolve(false);
    return fetch("/api/order?id=" + o.id + "&t=" + encodeURIComponent(o.t), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.ok && j.status && j.status !== o.status) { o.status = j.status; o.seen = Date.now(); saveOrders(); return true; }
        return false;
      }).catch(function () { return false; });
  }

  /* ---------- WhatsApp messages ---------- */
  function orderText(ls, extra) {
    var tot = 0, body = ls.map(function (l) { tot += l.total; return "• " + l.name + " (" + l.detail + "), " + l.label + ", " + inr(l.total); }).join("\n");
    return body + "\nTotal with offers: " + inr(tot) + (extra || "");
  }

  /* ---------- router ---------- */
  var routes = [
    [/^\/?$/, home, "home"], [/^\/kit\/([\w-]+)$/, kitPage], [/^\/fish$/, fishList], [/^\/fish\/([\w-]+)$/, fishPage],
    [/^\/search$/, searchPage], [/^\/basket$/, basketPage], [/^\/checkout$/, checkoutPage], [/^\/area$/, areaPage],
    [/^\/order\/(\d+)$/, trackPage], [/^\/orders$/, ordersPage, "orders"], [/^\/kitchen$/, kitchenPage, "kitchen"],
    [/^\/cook\/([\w-]+)$/, cookPage], [/^\/account$/, accountPage, "account"], [/^\/profile$/, profilePage]
  ];
  var cur = { path: null, q: {} }, scrollMemo = {}, navKind = "pop", timers = [], depth = 0;

  function parse() {
    var h = location.hash.replace(/^#/, "") || "/", i = h.indexOf("?"), q = {};
    var path = i > -1 ? h.slice(0, i) : h;
    if (i > -1) h.slice(i + 1).split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); });
    return { path: path, q: q };
  }
  function go(hash, replace) {
    if (location.hash === hash) { render(); return; }
    navKind = replace ? "replace" : "push";
    if (replace) location.replace(hash); else location.hash = hash;
  }
  function back(fallback) {
    if (depth > 0) history.back();
    else go(fallback || "#/", true);
  }
  function keepScroll() {
    var m = {};
    document.querySelectorAll("#view [data-keep]").forEach(function (el) { m[el.getAttribute("data-keep")] = [el.scrollTop, el.scrollLeft]; });
    return m;
  }
  function putScroll(m) {
    if (!m) return;
    document.querySelectorAll("#view [data-keep]").forEach(function (el) {
      var v = m[el.getAttribute("data-keep")]; if (v) { el.scrollTop = v[0]; el.scrollLeft = v[1]; }
    });
  }
  function render(same) {
    var r = parse(), match = null, args = null, tab = null;
    for (var i = 0; i < routes.length; i++) { var m = r.path.match(routes[i][0]); if (m) { match = routes[i][1]; args = m.slice(1); tab = routes[i][2] || null; break; } }
    if (!match) { go("#/", true); return; }
    var key = location.hash || "#/", sameRoute = cur.key === key;  // each cook step is its own screen
    var memo = sameRoute ? keepScroll() : null;
    if (!sameRoute && cur.key) scrollMemo[cur.key] = keepScroll();
    var active = document.activeElement, fid = focusId || (active && active.getAttribute && active.getAttribute("data-fid"));
    timers.forEach(clearInterval); timers = [];  // after() starts them again
    if (!sameRoute) closeLayer();
    if (wake && r.path.indexOf("/cook/") !== 0) { try { wake.release(); } catch (e) { } wake = null; }
    cur = { key: key, path: r.path, q: r.q, args: args, fn: match };
    var out = match.apply(null, args.concat([r.q]));
    var view = $("#view");
    view.innerHTML = out.html;
    document.title = out.title ? out.title + " · FrescoKart" : "FrescoKart";
    // tab bar and floating basket bar
    var tabs = $("#tabs");
    tabs.hidden = !tab;
    if (tab) tabs.innerHTML = tabBar(tab);
    var t = totals(), fl = $("#float"), bar = fl.querySelector(".bagbar");
    if (!(out.bag && t.n)) fl.innerHTML = "";
    else if (!bar) fl.innerHTML = bagBar(t, !tab);  // slides in only when it first appears
    else { var tmp = document.createElement("div"); tmp.innerHTML = bagBar(t, !tab); bar.className = tmp.firstChild.className; bar.innerHTML = tmp.firstChild.innerHTML; }
    // scroll: keep on re-render, restore on back, top on new pages
    if (sameRoute) putScroll(memo);
    else if (navKind === "pop") putScroll(scrollMemo[key]);
    navKind = "pop";
    if (out.after) out.after();
    if (fid) { var f = document.querySelector('[data-fid="' + fid + '"]'); if (f && (sameRoute || focusId)) f.focus({ preventScroll: true }); }
    focusId = ""; popKey = "";
    if (!sameRoute && !fid) { var h1 = view.querySelector("h1"); if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); } }
  }
  function refresh() { render(true); }

  // depth = how many app screens are behind this one, so the back button never leaves the app
  window.addEventListener("hashchange", function () {
    if (navKind === "push") depth++;
    else if (navKind === "pop") depth = (history.state && history.state.d) || 0;
    if (navKind !== "pop") { try { history.replaceState({ d: depth }, ""); } catch (e) { } }
    render();
  });

  /* ---------- shared pieces ---------- */
  function tabBar(on) {
    function t(id, href, label, icon) {
      return '<a href="' + href + '"' + (on === id ? ' aria-current="page"' : "") + '><span>' + ic(icon, 22, on === id ? 2.1 : 1.9) + "</span>" + label + "</a>";
    }
    return t("home", "#/", "Home", "home") + t("orders", "#/orders", "Orders", "orders") + t("kitchen", "#/kitchen", "Kitchen", "pot") + t("account", "#/account", "Account", "user");
  }
  function bagBar(t, low) {
    return '<a class="bagbar' + (low ? " low" : "") + '" href="#/basket"><span class="l"><b>' + t.n + (t.n === 1 ? " item" : " items") + " · " + inr(t.pay) + "</b><small>" +
      (t.saved > 0 ? "You save " + inr(t.saved) : "Free delivery") + '</small></span><span class="r">View basket' + ic("chev", 18, 2.4) + "</span></a>";
  }
  function appBar(title, sub, end, backTo) {
    return '<header class="appbar"><button class="iconbtn" type="button" data-act="back"' + (backTo ? ' data-to="' + backTo + '"' : "") + ' aria-label="Back">' + ic("back", 22, 2.2) + "</button>" +
      "<h1>" + esc(title) + (sub ? '<span class="sub">' + esc(sub) + "</span>" : "") + "</h1>" + (end ? '<div class="end">' + end + "</div>" : "") + "</header>";
  }
  function tabHead(title, sub) {
    return '<header class="appbar" style="padding-left:16px"><h1>' + esc(title) + (sub ? '<span class="sub">' + esc(sub) + "</span>" : "") + "</h1></header>";
  }
  // ADD button or stepper for one basket line
  function ctl(key, name, cls) {
    var n = qtyOf(key);
    if (!n) return '<button class="add ' + (cls || "") + '" type="button" data-act="add" data-key="' + key + '" data-fid="add:' + key + '" aria-label="Add ' + esc(name) + ' to basket">ADD<i aria-hidden="true">+</i></button>';
    var l = line(key, n);
    return '<div class="step ' + (cls || "") + (popKey === key ? " pop" : "") + '" role="group" aria-label="Quantity of ' + esc(name) + '">' +
      '<button type="button" data-act="dec" data-key="' + key + '" data-fid="dec:' + key + '" aria-label="One less ' + esc(name) + '">' + ic("minus", 18, 2.6) + "</button>" +
      '<span aria-live="polite">' + (l.kind === "k" ? n : kgs(n)) + "</span>" +
      '<button type="button" data-act="inc" data-key="' + key + '" data-fid="inc:' + key + '" aria-label="One more ' + esc(name) + '">' + ic("plus", 18, 2.6) + "</button></div>";
  }
  function kitKey(k) { return "k:" + k.id + ":" + (ui.sv[k.id] || 2); }
  function offLine(k) { return k.d ? "Flat " + k.d + "% off" : ""; }

  /* ================= HOME ================= */
  function home() {
    var t = totals(), area = profile.area;
    var cat = CATS.filter(function (c) { return c.id === ui.cat; })[0] || CATS[0];
    var list = kits.filter(cat.f).filter(function (k) { return CHIPS.every(function (c) { return !ui.chips[c.id] || c.f(k); }); });
    var quick = kits.filter(function (k) { return k.min <= 30; });
    var best = kits.slice().sort(function (a, b) { return b.d - a.d; })[0];
    var last = orders[0];

    var h = '<div class="screen"><div class="scroll" data-keep="home"><h1 class="sr">FrescoKart</h1>';
    h += '<header class="homehead"><div class="top">' +
      '<button class="where" type="button" data-act="goarea" aria-label="Delivery area: ' + esc(area || "not chosen") + '. Change">' +
      "<b>" + ic("pin", 20, 2.3).replace('stroke="currentColor"', 'stroke="#A8E63D"') + "<span>" + esc(area ? (area === ELSE ? "Choose your area" : area) : "Choose your area") + "</span>" + ic("down", 16, 2.6) + "</b>" +
      "<small>" + (area && area !== ELSE ? "Free delivery · about 45 min" : "We deliver across central Kochi") + "</small></button>" +
      '<a class="bagbtn" href="#/basket" aria-label="Basket, ' + t.n + ' items">' + ic("bag", 22, 1.9) + (t.n ? '<span class="badge">' + t.n + "</span>" : "") + "</a></div>" +
      '<a class="search" href="#/search">' + ic("search", 20, 2.2).replace('stroke="currentColor"', 'stroke="#006B48"') + '<span>Search “karimeen pollichathu”</span></a>' +
      '<div class="fresh"><span class="livedot" aria-hidden="true"></span><span>Today’s fish was bought at the harbour this morning</span></div></header>';

    h += installCard();

    // categories
    h += '<section class="sec" aria-labelledby="cat-h"><h2 id="cat-h" class="h2" style="padding:0 16px 12px">What are you cooking tonight?</h2><div class="rail" data-keep="cats" style="padding-top:4px">';
    CATS.forEach(function (c) {
      h += '<button class="cat" type="button" data-act="cat" data-id="' + c.id + '" aria-pressed="' + (ui.cat === c.id) + '"><span class="pic"><img src="' + c.img + '" alt="" loading="lazy"></span><span class="lbl">' + esc(c.t) + "</span></button>";
    });
    h += "</div></section>";

    // order again
    if (last && last.items && last.items.length) {
      var li = last.items[0], more = last.items.length - 1;
      h += '<section class="sec" style="padding-top:20px" aria-labelledby="again-h"><h2 id="again-h" class="h2" style="padding:0 16px 12px">Order again</h2><div class="rail" data-keep="again">' +
        '<div class="card shadow" style="flex:0 0 300px;display:flex;align-items:center;gap:12px;padding:12px"><img src="' + esc(li.img) + '" alt="" style="width:60px;height:60px;border-radius:14px;object-fit:cover">' +
        '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><b style="font:700 14px/1.25 var(--body)" class="clamp2">' + esc(li.name) + (more ? " + " + more + " more" : "") + "</b>" +
        '<span class="muted" style="font:500 12px/1.3 var(--body)">' + esc(day(new Date(last.at))) + " · " + inr(last.total) + '</span></div><button class="add sm" type="button" data-act="reorder" data-id="' + last.id + '">REPEAT</button></div></div></section>';
    }

    // banners
    h += '<div style="padding-top:20px"><div class="rail snap" data-keep="banners" data-banners style="padding-bottom:0">';
    if (best && best.d) h += '<a class="banner" href="#/kit/' + best.id + '" style="background:var(--orange)"><span class="txt"><span class="kick">TODAY’S OFFER</span><span class="big">Flat ' + best.d + "% off<br>" + esc(best.s) + '</span><span class="pill">Order now' + ic("chev", 14, 2.6) + '</span></span><img src="' + best.hero + '" alt=""></a>';
    h += '<a class="banner" href="#/fish" style="background:var(--green-d)"><span class="txt"><span class="kick" style="color:var(--lime)">FRESH FISH</span><span class="big">Bought this<br>morning</span><span class="pill" style="background:var(--lime)">Shop by the kilo' + ic("chev", 14, 2.6) + '</span></span><img src="/img/hero-crate.webp" alt="" style="object-position:30% 40%"></a>';
    h += '<a class="banner" href="#/kitchen" style="background:var(--sea)"><span class="txt"><span class="kick">COOK ALONG</span><span class="big">Every step,<br>with timers</span><span class="pill">Open kitchen' + ic("chev", 14, 2.6) + '</span></span><img src="/img/stage-kitchen.webp" alt=""></a>';
    h += '</div><div class="dots" aria-hidden="true"><i class="on"></i><i></i>' + (best && best.d ? "<i></i>" : "") + "</div></div>";

    // quick rail
    h += '<section class="sec" aria-labelledby="quick-h"><div class="sechead"><div><h2 id="quick-h" class="h2">On the table in 30 minutes</h2><span class="muted">Quick kits for a weeknight</span></div></div><div class="rail" data-keep="quick">';
    quick.forEach(function (k) {
      var key = "k:" + k.id + ":2";
      h += '<div class="qcard"><a class="ph" href="#/kit/' + k.id + '" aria-label="' + esc(k.n) + '"><img src="' + k.hero + '" alt="" loading="lazy">' +
        (k.d ? '<span class="scrim"></span><span class="offtag">' + k.d + "% OFF</span>" : "") + "</a>" +
        '<div class="bd"><a class="nm clamp2" href="#/kit/' + k.id + '">' + esc(k.n) + '</a><span class="mt">' + k.min + " min · serves 2</span>" +
        '<span class="pr"><span class="price">' + inr(kitNow(k, 2)) + "</span>" + (k.d ? '<span class="was">' + inr(k.p2) + "</span>" : "") + "</span>" +
        '<div class="ctl">' + ctl(key, k.n, "full") + "</div></div></div>";
    });
    h += "</div></section>";

    // filters + all kits
    h += '<div class="filterbar"><div class="chips" data-keep="chips">';
    CHIPS.forEach(function (c) { h += '<button class="chip" type="button" data-act="chip" data-id="' + c.id + '" aria-pressed="' + !!ui.chips[c.id] + '">' + esc(c.t) + "</button>"; });
    h += '</div></div><section id="all-kits" aria-labelledby="list-h"><div class="kits"><h2 id="list-h" class="h2" style="margin-bottom:-6px">' +
      (list.length === kits.length ? "All " + kits.length + " kits" : list.length + (list.length === 1 ? " kit" : " kits") + " for you") + "</h2>";
    list.forEach(function (k) {
      var key = kitKey(k), sv = ui.sv[k.id] || 2;
      h += '<article class="kcard"><a class="ph" href="#/kit/' + k.id + '" aria-label="' + esc(k.n) + '"><img src="' + k.hero + '" alt="" loading="lazy">' +
        '<span class="timepill">' + ic("clock", 13, 2.4).replace('stroke="currentColor"', 'stroke="#006B48"') + k.min + " min</span>" +
        (k.d ? '<span class="scrim"></span><span class="offbig"><b>' + k.d + '% OFF</b><small>Save ' + inr(kitBase(k, sv) - kitNow(k, sv)) + " on this kit</small></span>" : "") + "</a>" +
        '<div class="bd"><a class="nm" href="#/kit/' + k.id + '"><b>' + NONVEG + "<span>" + esc(k.n) + '</span></b><span class="ml" lang="ml">' + esc(k.m) + '</span><span class="mt">' + esc(k.fish) + ", veg and masalas · " + esc(k.spice) + " spice</span></a>" +
        '<div class="buy"><span style="display:flex;flex-direction:column;gap:2px"><span style="display:flex;align-items:baseline;gap:8px"><span class="price">' + inr(kitNow(k, sv)) + "</span>" + (k.d ? '<span class="was">' + inr(kitBase(k, sv)) + "</span>" : "") +
        '</span><span class="muted" style="font:500 12px/16px var(--body)">Serves ' + sv + "</span></span>" + ctl(key, k.n) + "</div></div></article>";
    });
    if (!list.length) h += '<div class="empty card" style="border:1px dashed #CBD3CE"><span class="ic">' + ic("fish", 28, 1.9) + "</span><b>No kits match these filters</b><p>Try fewer filters, or see everything we have tonight.</p>" +
      '<button class="cta ghost" type="button" data-act="clearfilters" style="width:auto;padding:0 20px;height:48px">Clear filters</button></div>';
    h += "</div></section>";

    // fish rail
    h += '<section class="sec" aria-labelledby="catch-h"><div class="sechead"><div><h2 id="catch-h" class="h2">Today’s catch, by the kilo</h2><span class="muted">Cleaned and cut the way you ask</span></div>' +
      '<a class="linkbtn" href="#/fish">See all' + ic("chev", 16, 2.4) + '</a></div><div class="rail" data-keep="fishrail">';
    fish.forEach(function (f) { h += fishCard(f); });
    h += "</div></section>";

    h += '<footer class="foot"><img src="/img/symbol-colour.svg" alt="" width="34" height="33"><span class="brand">Fresco<span>Kart</span></span>' +
      "<p>Fresh fish kits, live in Kochi.<br>Bought at the harbour, cut and packed the same day.</p></footer>";
    h += '<div style="height:' + (t.n ? 96 : 16) + 'px"></div></div></div>';
    return {
      html: h, bag: true, after: function () {
        var rail = $("[data-banners]"); if (!rail) return;
        var dots = document.querySelectorAll(".dots i");
        function upd() { var i = Math.round(rail.scrollLeft / 322); dots.forEach(function (d, j) { d.classList.toggle("on", i === j); }); }
        rail.addEventListener("scroll", upd, { passive: true }); upd();
      }
    };
  }
  function fishCard(f, cls) {
    return '<a class="fcard' + (cls ? " " + cls : "") + '" href="#/fish/' + f.k + '"><div class="ph"><img src="' + f.img + '" alt="" loading="lazy">' +
      (f.d ? '<span class="offchip">' + f.d + "% OFF</span>" : "") + '</div><div class="bd"><div class="nm">' + esc(f.n) + '</div><div class="ml" lang="ml">' + esc(f.l) + " · " + esc(f.m) + "</div>" +
      '<div class="pr"><span class="price">' + inr(fishNow(f)) + '</span><span class="muted" style="font:500 12px/1 var(--body)">/kg</span>' + (f.d ? '<span class="was" style="margin-left:4px">' + inr(f.p) + "</span>" : "") + "</div></div></a>";
  }

  /* ================= KIT ================= */
  function kitPage(id) {
    var k = kitById[id]; if (!k) return notFound("We couldn’t find that kit.");
    var sv = ui.sv[k.id] || 2, key = "k:" + k.id + ":" + sv, n = qtyOf(key), col = sv === 4 ? 1 : 2;
    var groups = [["fish", "Fish", "fish"], ["veg", "Vegetables", "leaf"], ["masala", "Masalas", "jar"], ["extra", "Also in the pack", "box"]];
    var h = '<div class="screen"><div class="scroll" data-keep="kit">';
    h += '<div class="hero"><img src="' + k.hero + '" alt="' + esc(k.s) + ', a serving suggestion"><div class="bar">' +
      '<button class="iconbtn onphoto" type="button" data-act="back" aria-label="Back">' + ic("back", 22, 2.2) + "</button>" +
      (navigator.share ? '<button class="iconbtn onphoto" type="button" data-act="share" data-id="' + k.id + '" aria-label="Share this kit">' + ic("share", 20, 2) + "</button>" : "") +
      '</div><span class="tag">Serving suggestion</span></div>';
    h += '<div class="sheetbody"><h1 class="ptitle">' + NONVEG + "<span>" + esc(k.n) + '</span></h1><div class="ml pml" lang="ml">' + esc(k.m) + "</div>" +
      '<div class="facts"><span class="fact">' + ic("clock", 14, 2.2) + k.min + ' min to cook</span><span class="fact">' + esc(k.spice) + ' spice</span><span class="fact">' + ic("snow", 14, 2.2) + "Packed chilled</span></div>" +
      '<div class="seg" role="group" aria-label="How many people" style="margin-top:16px"><button type="button" data-act="sv" data-id="' + k.id + '" data-sv="2" aria-pressed="' + (sv === 2) + '">Serves 2</button><button type="button" data-act="sv" data-id="' + k.id + '" data-sv="4" aria-pressed="' + (sv === 4) + '">Serves 4</button></div>' +
      '<div class="pprice"><span class="price">' + inr(kitNow(k, sv)) + "</span>" + (k.d ? '<span class="was">' + inr(kitBase(k, sv)) + '</span><span class="save">You save ' + inr(kitBase(k, sv) - kitNow(k, sv)) + "</span>" : "") + "</div>" +
      '<div class="muted" style="font:500 13px/1.4 var(--body);margin-top:4px">Fish, cut vegetables and measured masalas for ' + sv + " people</div></div>";
    h += '<section class="block" aria-labelledby="in-h"><h2 id="in-h" class="h2">What’s inside</h2><div class="inside">';
    groups.forEach(function (g) {
      var rows = k.inside[g[0]]; if (!rows || !rows.length) return;
      h += '<div class="grp"><div class="gt">' + ic(g[2], 18, 2) + g[1] + "</div><ul>" + rows.map(function (r) { var p = r.split("|"); return "<li><span>" + esc(p[0]) + "</span><span>" + esc(p[col]) + "</span></li>"; }).join("") + "</ul></div>";
    });
    h += '</div><div class="need">' + ic("info", 18, 2) + "<span><b>You’ll need:</b> " + esc(k.need) + "</span></div>";
    h += '<img src="' + k.flat + '" alt="Everything in the ' + esc(k.n) + ', laid out" loading="lazy" style="width:100%;margin-top:12px;border-radius:16px;aspect-ratio:4/3;object-fit:cover;background:var(--green-t)"></section>';
    h += '<section class="block" aria-labelledby="st-h"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px"><h2 id="st-h" class="h2">How to cook it</h2><span class="muted" style="font:600 13px/1 var(--body)">' + k.steps.length + " steps</span></div><ol class=\"steps\">";
    k.steps.forEach(function (s, i) { var p = s.split("|"); h += '<li><span class="n">' + (i + 1) + "</span><p>" + esc(p[0]) + (+p[1] ? "<small>About " + p[1] + " min</small>" : "") + "</p></li>"; });
    h += '</ol><a class="cta ghost" href="#/cook/' + k.id + "?s=" + sv + '" style="margin-top:8px">' + ic("pot", 20, 2) + "Cook along, step by step</a></section>";
    h += trustRow() + '<div style="height:24px"></div></div>';
    h += '<div class="buybar">';
    if (n) h += ctl(key, k.n) + '<a class="cta green" href="#/basket" style="flex:1">View basket' + ic("chev", 18, 2.4) + "</a>";
    else h += '<div class="sum"><b>' + inr(kitNow(k, sv)) + "</b><small>Serves " + sv + " · free delivery</small></div>" +
      '<button class="cta" type="button" data-act="add" data-key="' + key + '" data-fid="add:' + key + '" style="flex:0 0 auto">Add to basket</button>';
    h += "</div></div>";
    return { html: h, title: k.n };
  }
  function trustRow() {
    return '<div class="trust"><div>' + ic("fish", 22, 1.9) + "Bought at the harbour this morning</div><div>" + ic("snow", 22, 1.9) + "Packed chilled, in ice</div><div>" + ic("truck", 22, 1.9) + "At your door in about 45 min</div></div>";
  }

  /* ================= FISH ================= */
  function fishList() {
    var list = fish.filter(function (i) { return FCHIPS.every(function (c) { return !ui.fchips[c.id] || c.f(i); }); });
    var h = '<div class="screen">' + appBar("Fresh fish", "Bought at the harbour this morning") +
      '<div style="flex:0 0 auto;padding:10px 0;border-bottom:1px solid var(--line2)"><div class="chips" data-keep="fchips">';
    FCHIPS.forEach(function (c) { h += '<button class="chip" type="button" data-act="fchip" data-id="' + c.id + '" aria-pressed="' + !!ui.fchips[c.id] + '">' + esc(c.t) + "</button>"; });
    h += '</div></div><div class="scroll" data-keep="fish"><div class="fgrid">';
    list.forEach(function (f) { h += fishCard(f); });
    h += "</div>" + (list.length ? "" : '<div class="empty"><span class="ic">' + ic("fish", 28, 1.9) + '</span><b>Nothing matches</b><p>Try fewer filters.</p></div>') +
      '<p class="muted" style="margin:0;padding:0 16px 16px;font:500 12px/1.5 var(--body)">Prices are per kg. We confirm the final weight and price on WhatsApp before we send your order.</p><div style="height:' + (totals().n ? 96 : 16) + 'px"></div></div></div>';
    return { html: h, title: "Fresh fish", bag: true };
  }
  function fishPage(id) {
    var f = fishById[id]; if (!f) return notFound("We couldn’t find that fish.");
    var cuts = cutsOf(f.k), ci = ui.cut[f.k] || 0, kg = ui.kg[f.k] || 1, key = "f:" + f.k + ":" + ci, inBag = qtyOf(key);
    var h = '<div class="screen"><div class="scroll" data-keep="fishp">';
    h += '<div class="hero" style="height:260px;background:' + esc(f.c) + '"><img src="' + f.img + '" alt="' + esc(f.n) + '"><div class="bar"><button class="iconbtn onphoto" type="button" data-act="back" aria-label="Back">' + ic("back", 22, 2.2) + "</button></div></div>";
    h += '<div class="sheetbody"><h1 class="ptitle">' + NONVEG + "<span>" + esc(f.n) + '</span></h1><div class="pml"><span>' + esc(f.l) + '</span> · <span class="ml" lang="ml">' + esc(f.m) + "</span></div>" +
      '<div class="pprice"><span class="price">' + inr(fishNow(f)) + '</span><span class="muted" style="font:500 14px/1 var(--body)">per kg</span>' + (f.d ? '<span class="was">' + inr(f.p) + '</span><span class="save">' + f.d + "% off</span>" : "") + "</div></div>";
    h += '<section class="block" aria-labelledby="cut-h"><h2 id="cut-h" class="h2">How should we cut it?</h2><div class="choice" role="group" aria-labelledby="cut-h">';
    cuts.forEach(function (c, i) { h += '<button class="chip" type="button" data-act="cut" data-id="' + f.k + '" data-i="' + i + '" aria-pressed="' + (i === ci) + '">' + esc(c) + "</button>"; });
    h += '</div></section><section class="block" aria-labelledby="kg-h"><h2 id="kg-h" class="h2">How much?</h2><div class="weight"><div class="t"><b>' + kgs(kg) + "</b><span>" + inr(fishNow(f) * kg) + " for " + kgs(kg) + "</span></div>" +
      '<div class="step" role="group" aria-label="Weight"><button type="button" data-act="kg" data-id="' + f.k + '" data-d="-0.5" data-fid="kgdec" aria-label="Half a kilo less"' + (kg <= 0.5 ? " disabled" : "") + ">" + ic("minus", 18, 2.6) + '</button><span aria-live="polite">' + kgs(kg) + '</span><button type="button" data-act="kg" data-id="' + f.k + '" data-d="0.5" data-fid="kginc" aria-label="Half a kilo more">' + ic("plus", 18, 2.6) + "</button></div></div>" +
      '<p class="muted" style="margin:10px 0 0;font:500 12px/1.5 var(--body)">We weigh the fish before cleaning and confirm the final weight and price on WhatsApp before we send it.</p></section>';
    h += trustRow() + '<div style="height:24px"></div></div><div class="buybar">';
    if (inBag && inBag === kg) h += '<div class="sum"><b>In your basket</b><small>' + kgs(inBag) + " · " + esc(cuts[ci]) + '</small></div><a class="cta green" href="#/basket">View basket' + ic("chev", 18, 2.4) + "</a>";
    else h += '<div class="sum"><b>' + inr(fishNow(f) * kg) + "</b><small>" + kgs(kg) + " · " + esc(cuts[ci]) + '</small></div><button class="cta" type="button" data-act="addfish" data-id="' + f.k + '">' + (inBag ? "Update basket" : "Add to basket") + "</button>";
    h += "</div></div>";
    return { html: h, title: f.n };
  }

  /* ================= SEARCH ================= */
  function searchPage() {
    var h = '<div class="screen"><div class="sbar"><button class="iconbtn" type="button" data-act="back" aria-label="Back">' + ic("back", 22, 2.2) + "</button>" +
      '<label class="sinput">' + ic("search", 20, 2.2) + '<span class="sr">Search dishes and fish</span><input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Search dishes and fish" value="' + esc(ui.q) + '"></label></div>' +
      '<div class="scroll" data-keep="search"><div id="sres">' + searchResults(ui.q) + "</div></div></div>";
    return {
      html: h, title: "Search", bag: true, after: function () {
        var q = $("#q"); if (!q) return;
        q.addEventListener("input", function () { ui.q = q.value; $("#sres").innerHTML = searchResults(q.value); });
        setTimeout(function () { q.focus(); }, 60);
      }
    };
  }
  function searchResults(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) {
      var pops = ["Karimeen", "Prawns", "Mathi", "Curry", "Squid", "Seer fish"];
      return '<div style="padding:20px 16px 0"><h2 class="h2" style="margin-bottom:12px">Popular right now</h2><div class="choice">' +
        pops.map(function (p) { return '<button class="chip" type="button" data-act="q" data-q="' + esc(p) + '">' + ic("search", 14, 2.2) + esc(p) + "</button>"; }).join("") +
        '</div></div><div style="padding:24px 16px 0"><h2 class="h2" style="margin-bottom:4px">All kits</h2>' + kits.map(resKit).join("") + "</div>";
    }
    var ks = kits.filter(function (k) { return (k.n + " " + k.s + " " + k.fish + " " + k.m + " " + k.spice).toLowerCase().indexOf(q) > -1; });
    var fs = fish.filter(function (f) { return (f.n + " " + f.l + " " + f.m).toLowerCase().indexOf(q) > -1; });
    if (!ks.length && !fs.length) return '<div class="empty"><span class="ic">' + ic("search", 28, 2) + "</span><b>No match for “" + esc(q) + '”</b><p>Try a dish like “pollichathu” or a fish like “ayala”. We add new kits often.</p>' +
      '<a class="cta ghost" style="width:auto;padding:0 20px;height:48px" href="' + waLink("Hi FrescoKart! Do you have " + q + "?") + '" target="_blank" rel="noopener">' + ic("wa", 18, 1.9) + "Ask us on WhatsApp</a></div>";
    var h = '<div style="padding:8px 16px 16px">';
    if (ks.length) h += '<h2 class="h2" style="margin:12px 0 4px">Kits</h2>' + ks.map(resKit).join("");
    if (fs.length) h += '<h2 class="h2" style="margin:20px 0 4px">Fresh fish</h2>' + fs.map(function (f) {
      return '<a class="res" href="#/fish/' + f.k + '"><img src="' + f.img + '" alt=""><span class="t"><b>' + esc(f.n) + "</b><span>" + esc(f.l) + " · " + inr(fishNow(f)) + '/kg</span></span><span class="chev">' + ic("chev", 20, 2) + "</span></a>";
    }).join("");
    return h + "</div>";
  }
  function resKit(k) {
    var key = "k:" + k.id + ":2";
    return '<div class="res"><a href="#/kit/' + k.id + '"><img src="' + k.hero + '" alt=""></a><a class="t" href="#/kit/' + k.id + '"><b>' + esc(k.n) + "</b><span>" + inr(kitNow(k, 2)) + " · serves 2 · " + k.min + " min</span></a>" + ctl(key, k.n) + "</div>";
  }

  /* ================= BASKET ================= */
  function billHTML(t) {
    return '<section class="bill" aria-labelledby="bill-h"><h2 id="bill-h" class="h3" style="margin-bottom:2px">Bill details</h2>' +
      '<div class="ln"><span>Item total</span><span>' + inr(t.mrp) + "</span></div>" +
      (t.saved > 0 ? '<div class="ln ok"><span>Offers</span><b>−' + inr(t.saved) + "</b></div>" : "") +
      '<div class="ln ok"><span>Delivery</span><b>FREE</b></div><hr><div class="ln tot"><span>To pay</span><span>' + inr(t.pay) + "</span></div></section>";
  }
  function basketPage() {
    var ls = lines(), t = totals(), area = profile.area && profile.area !== ELSE ? profile.area : "";
    var h = '<div class="screen grey">' + appBar("Basket", t.n ? t.n + (t.n === 1 ? " item" : " items") + (area ? " · " + area : "") : "");
    if (!t.n) {
      h += '<div class="scroll"><div class="empty" style="padding-top:72px"><span class="ic">' + ic("bag", 30, 1.8) + "</span><b>Your basket is empty</b><p>Add a kit for tonight’s dinner, or fresh fish cut the way you like.</p>" +
        '<a class="cta" href="#/" style="width:auto;padding:0 24px;margin-top:8px">Browse kits</a></div></div></div>';
      return { html: h, title: "Basket" };
    }
    h += '<div class="scroll" data-keep="basket">';
    if (t.saved > 0) h += '<div class="strip"><span>' + ic("tag", 16, 2.2) + inr(t.saved) + " saved on this order</span><span>" + ic("truck", 16, 2) + "Free delivery</span></div>";
    h += '<section class="items" aria-label="Items">';
    ls.forEach(function (l) {
      h += '<div class="item"><img src="' + l.img + '" alt=""><div class="t"><b class="clamp2">' + esc(l.name) + "</b>" +
        (l.kind === "k" ? '<button class="meta" type="button" data-act="flipsv" data-key="' + l.key + '" aria-label="Serves ' + l.sv + ', tap to change">Serves ' + l.sv + ic("down", 14, 2.4) + "</button>"
          : '<span class="meta">' + esc(l.cut) + "</span>") +
        '</div><div class="r">' + ctl(l.key, l.name, "sm") + '<span class="price">' + inr(l.total) + "</span>" + (l.was > l.total + 0.5 ? '<span class="was">' + inr(l.was) + "</span>" : "") + "</div></div>";
    });
    h += '<a class="addmore" href="#/">' + ic("plus", 18, 2.4) + "Add more items</a></section>";
    var more = kits.filter(function (k) { return !qtyOf("k:" + k.id + ":2") && !qtyOf("k:" + k.id + ":4"); });
    if (more.length) {
      h += '<section aria-labelledby="more-h" style="padding-top:20px"><h2 id="more-h" class="h2" style="padding:0 16px 12px">Complete your meal</h2><div class="rail" data-keep="more">';
      more.forEach(function (k) {
        h += '<div class="mcard"><a href="#/kit/' + k.id + '"><img src="' + k.hero + '" alt="" loading="lazy"></a><div class="bd"><a class="nm clamp2" href="#/kit/' + k.id + '">' + esc(k.n) + '</a><div class="ft"><span class="price">' + inr(kitNow(k, 2)) + "</span>" + ctl("k:" + k.id + ":2", k.n) + "</div></div></div>";
      });
      h += "</div></section>";
    }
    h += '<label class="note">' + ic("note", 20, 1.9) + '<span class="sr">Note for the kitchen</span><input id="knote" maxlength="80" placeholder="Note for the kitchen, like “less spicy”" value="' + esc(ui.note) + '"></label>';
    h += billHTML(t);
    h += '<p class="muted" style="margin:12px 16px 0;font:500 12px/1.5 var(--body)">Pay on delivery, by cash or UPI. We confirm availability and the final price on WhatsApp before we send your order.</p><div style="height:20px"></div></div>';
    h += '<div class="paybar"><div class="addr">' + ic("pin", 18, 2) + (area ? "<span>Delivering to <b>" + esc(area) + "</b></span>" : "<span>Choose where we deliver</span>") +
      '<a class="linkbtn" href="#/area?next=basket">' + (area ? "Change" : "Choose") + "</a></div>" +
      '<button class="cta split" type="button" data-act="continue"><span class="tot"><b>' + inr(t.pay) + '</b><small>TOTAL</small></span><span class="go">Continue' + ic("chev", 18, 2.4) + "</span></button></div></div>";
    return {
      html: h, title: "Basket", after: function () {
        var n = $("#knote"); if (n) n.addEventListener("input", function () { ui.note = n.value; });
      }
    };
  }

  /* ================= CHECKOUT ================= */
  var ck = { err: {}, sending: false, msg: "" };
  function checkoutPage() {
    var t = totals(), area = profile.area && profile.area !== ELSE ? profile.area : "";
    if (!t.n) { setTimeout(function () { go("#/basket", true); }); return { html: "" }; }
    if (!area) { setTimeout(function () { go("#/area?next=checkout", true); }); return { html: "" }; }
    var eta = new Date(Date.now() + ETA_MIN * 60000), e = ck.err;
    function fld(id, label, val, attrs, err) {
      return '<div class="field' + (err ? " bad" : "") + '"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(val || "") + '" ' + attrs + ">" + (err ? '<span class="err">' + esc(err) + "</span>" : "") + "</div>";
    }
    var h = '<div class="screen grey">' + appBar("Checkout", "Pay on delivery") + '<div class="scroll" data-keep="checkout">';
    if (ck.msg) h += '<div class="alert" role="alert">' + esc(ck.msg) + "</div>";
    h += '<section class="group" aria-labelledby="to-h"><div class="gh"><h2 id="to-h" class="h3">Deliver to</h2></div>' +
      '<div class="row" style="min-height:52px"><span class="tile" style="background:var(--green-t);color:var(--green)">' + ic("pin", 20, 2) + '</span><span class="t"><b>' + esc(area) + "</b><span>Kochi · free delivery</span></span>" +
      '<a class="linkbtn" href="#/area?next=checkout">Change</a></div><div class="form" style="padding-top:12px">' +
      fld("c-house", "House or flat, and street", profile.house, 'autocomplete="street-address" maxlength="120" placeholder="Flat 4B, Sea Breeze Apartments, Pipeline Road"', e.house) +
      fld("c-land", "Landmark <span class=\"muted\" style=\"font-weight:500\">(optional)</span>", profile.landmark, 'maxlength="60" placeholder="Near the Lulu Mall back gate"') + "</div></section>";
    h += '<section class="group" aria-labelledby="me-h"><div class="gh"><h2 id="me-h" class="h3">Your details</h2></div><div class="form" style="padding-top:8px">' +
      fld("c-name", "Name", profile.name, 'autocomplete="name" maxlength="60" placeholder="Your name"', e.name) +
      '<div class="field' + (e.phone ? " bad" : "") + '"><label for="c-phone">Mobile number</label><div class="phone"><span>+91</span><input id="c-phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" placeholder="98765 43210" value="' + esc(profile.phone || "") + '"></div>' +
      (e.phone ? '<span class="err">' + esc(e.phone) + "</span>" : '<span class="muted" style="font:500 12px/1.3 var(--body)">We send order updates to this number on WhatsApp.</span>') + "</div></div></section>";
    h += '<section class="group" aria-labelledby="when-h"><div class="gh"><h2 id="when-h" class="h3">Delivery time</h2></div><div class="row" style="padding-bottom:4px"><span class="tile" style="background:var(--green-t);color:var(--green)">' + ic("clock", 20, 2) +
      '</span><span class="t"><b>Now, in about 45 min</b><span>Arrives by about ' + clock(eta) + '</span></span><span style="color:var(--green)">' + ic("check", 22, 2.4) + "</span></div>" +
      '<div style="padding:8px 0 16px"><div style="padding:0 16px 10px;font:600 13px/1 var(--body);color:var(--ink2)">Instructions for the rider</div><div class="chips" data-keep="rider">' +
      RIDER.map(function (r, i) { return '<button class="chip" type="button" data-act="rider" data-i="' + i + '" aria-pressed="' + !!ui.rider[i] + '">' + esc(r) + "</button>"; }).join("") + "</div></div></section>";
    h += '<section class="group" aria-labelledby="pay-h"><div class="gh"><h2 id="pay-h" class="h3">Payment</h2></div><div class="row" style="min-height:64px"><span class="tile">' + ic("cash", 20, 1.9) +
      '</span><span class="t"><b>Pay on delivery</b><span>Cash or UPI to the rider</span></span><span style="color:var(--green)">' + ic("check", 22, 2.4) + "</span></div></section>";
    h += billHTML(t);
    h += '<label class="check card' + (e.agree ? " bad" : "") + '" style="margin:12px 16px 0"><input id="c-agree" type="checkbox"' + (ui.agree ? " checked" : "") + '><span>FrescoKart may message or call me on this number about this order. <a href="/privacy.html" target="_blank" rel="noopener" style="color:var(--green);font-weight:700">Privacy notice</a></span></label>';
    h += '<input id="c-hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">';
    h += '<div style="height:20px"></div></div><div class="paybar">' +
      '<button class="cta split" type="button" data-act="place"' + (ck.sending ? " disabled" : "") + '><span class="tot"><b>' + inr(t.pay) + '</b><small>PAY ON DELIVERY</small></span><span class="go">' +
      (ck.sending ? "Placing…" : API.on || !API.checked ? "Place order" + ic("chev", 18, 2.4) : "Send on WhatsApp" + ic("chev", 18, 2.4)) + "</span></button></div></div>";
    return {
      html: h, title: "Checkout", after: function () {
        [["c-house", "house"], ["c-land", "landmark"], ["c-name", "name"], ["c-phone", "phone"]].forEach(function (p) {
          var el = document.getElementById(p[0]); if (el) el.addEventListener("input", function () { profile[p[1]] = el.value; saveProfile(); });
        });
        var a = $("#c-agree"); if (a) a.addEventListener("change", function () { ui.agree = a.checked; });
        ck.msg = "";
      }
    };
  }
  function placeOrder() {
    if (ck.sending) return;
    var e = {}, phone = validPhone(profile.phone);
    if (!String(profile.house || "").trim()) e.house = "Add your house or flat, and street.";
    if (!String(profile.name || "").trim()) e.name = "Add your name, so the rider knows who to ask for.";
    if (!phone) e.phone = "Enter a 10-digit mobile number.";
    if (!ui.agree) e.agree = true;
    ck.err = e;
    if (Object.keys(e).length) {
      ck.msg = e.agree && Object.keys(e).length === 1 ? "Please tick the box so we can contact you about this order." : "Please check the highlighted details.";
      refresh();
      var first = e.house ? "c-house" : e.name ? "c-name" : e.phone ? "c-phone" : "c-agree";
      var el = document.getElementById(first); if (el) { el.focus(); el.scrollIntoView({ block: "center" }); }
      return;
    }
    var ls = lines(), t = totals(), area = profile.area;
    var address = String(profile.house).trim() + (String(profile.landmark || "").trim() ? ", near " + String(profile.landmark).trim() : "");
    var notes = RIDER.filter(function (r, i) { return ui.rider[i]; }).concat(ui.note.trim() ? ["Kitchen: " + ui.note.trim()] : []).join(". ");
    var items = ls.map(function (l) {
      var tt = Math.round(l.total * 100) / 100;
      return l.kind === "k" ? { type: "kit", id: l.id, name: kitById[l.id].n, serves: l.sv, qty: l.q, total: tt } : { type: "fish", id: l.id, name: l.name + " (" + l.cut.toLowerCase() + ")", qty: l.q, total: tt };
    });
    function waText(ref) {
      return (ref ? "Hi FrescoKart! I just placed order " + ref + " in the app:\n" : "Hi FrescoKart! I’d like to order:\n") + orderText(ls,
        "\nName: " + profile.name.trim() + "\nArea: " + area + "\nAddress: " + address + (notes ? "\nNote: " + notes : "") + "\nPay on delivery.") + (ref ? "\nPlease confirm my order." : "\nPlease confirm availability and my delivery time.");
    }
    if (!navigator.onLine) { ck.msg = "You are offline. Connect to the internet and try again."; refresh(); return; }
    if (API.checked && !API.on) { window.open(waLink(waText()), "_blank", "noopener"); return; }
    ck.sending = true; refresh();
    profile.phone = phone; saveProfile();
    apiPost("/api/preorders", { name: profile.name, phone: phone, area: area, address: address, notes: notes, items: items, consent: true, hp: ($("#c-hp") || {}).value || "", utm: UTM })
      .then(function (j) {
        ck.sending = false;
        if (!j || !j.ok) {
          if (j && j.error === "phone") ck.err = { phone: j.message };
          ck.msg = (j && j.message) || "Something went wrong. Please try again, or send your order on WhatsApp.";
          if (j && j.error === "no_database") { API.on = false; }
          refresh(); return;
        }
        var o = { id: j.id, ref: j.ref, t: j.token || "", at: new Date().toISOString(), status: "new", total: t.pay, saved: t.saved, area: area, address: address, notes: notes, wa: waText(j.ref),
          items: ls.map(function (l) { return { key: l.key, q: l.q, name: l.name, img: l.img, label: l.label, detail: l.detail, total: Math.round(l.total) }; }) };
        orders = orders.filter(function (x) { return x.id !== o.id; }); orders.unshift(o); saveOrders();
        basket = {}; saveBasket(); ui.note = ""; ui.rider = {}; ck.err = {};
        go("#/order/" + o.id + "?new=1", true);
      })
      .catch(function () { ck.sending = false; ck.msg = "We couldn’t reach FrescoKart. Check your internet and try again."; refresh(); });
  }

  /* ================= AREA ================= */
  var lead = { open: false, msg: "", ok: false, sending: false };
  function areaPage(q) {
    var h = '<div class="screen grey">' + appBar("Where should we deliver?", "We deliver across central Kochi") + '<div class="scroll" data-keep="area">';
    h += '<section class="group" aria-label="Areas">';
    AREAS.forEach(function (a) {
      var on = profile.area === a;
      h += '<button class="area" type="button" data-act="setarea" data-a="' + esc(a) + '" aria-pressed="' + on + '"><span class="tile">' + ic("pin", 18, 2) + "</span>" + esc(a) + (on ? '<span class="tick">' + ic("check", 22, 2.4) + "</span>" : "") + "</button>";
    });
    h += '</section><section class="group" aria-labelledby="else-h"><button class="area" type="button" data-act="elsearea" aria-expanded="' + lead.open + '"><span class="tile">' + ic("help", 18, 2) + '</span><span id="else-h">Somewhere else in Kochi</span><span class="tick" style="color:var(--muted)">' + ic(lead.open ? "down" : "chev", 20, 2) + "</span></button>";
    if (lead.open) {
      h += '<div class="form" style="padding-top:0"><p class="muted" style="margin:0;font:500 13px/1.5 var(--body)">We are not in your area yet. Leave your number and we will message you on WhatsApp when we are.</p>' +
        '<div class="field"><label for="l-phone">Mobile number</label><div class="phone"><span>+91</span><input id="l-phone" type="tel" inputmode="numeric" maxlength="14" placeholder="98765 43210" value="' + esc(profile.phone || "") + '"></div></div>' +
        '<label class="check" style="padding:0"><input id="l-agree" type="checkbox"><span>FrescoKart may message me on WhatsApp when it delivers to my area.</span></label>' +
        (lead.msg ? '<div class="' + (lead.ok ? "save" : "alert") + '" role="status" style="margin:0;height:auto;padding:10px 12px;line-height:1.45">' + esc(lead.msg) + "</div>" : "") +
        '<button class="cta green" type="button" data-act="lead"' + (lead.sending ? " disabled" : "") + ">" + (lead.sending ? "Sending…" : "Tell me when you deliver here") + "</button></div>";
    }
    h += '</section><div style="height:24px"></div></div></div>';
    return { html: h, title: "Delivery area" };
  }

  /* ================= TRACKING ================= */
  function statusIndex(s) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i][0] === s) return i; return 0; }
  function trackPage(id, q) {
    var o = orders.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!o) return notFound("This order is not on this phone. Orders show on the phone they were placed from.");
    var si = statusIndex(o.status), off = o.status === "cancelled", done = o.status === "delivered";
    var placed = new Date(o.at), eta = new Date(placed.getTime() + ETA_MIN * 60000);
    var head = off ? ["ORDER " + o.ref, "Order cancelled", "If this is a surprise, message us on WhatsApp and we will sort it out."]
      : done ? ["ORDER " + o.ref, "Delivered. Enjoy!", "Cook along with step-by-step help and timers in the Kitchen tab."]
        : [["ORDER " + o.ref, q.new ? "Order placed!" : "Order placed", "We’ll confirm it on WhatsApp in a few minutes."],
          ["ORDER " + o.ref, "Order confirmed", "We’re picking the fish for your order."],
          ["ORDER " + o.ref, "Packing your order", "Cut, packed and chilled in ice."],
          ["ORDER " + o.ref, "On the way", "Your rider is coming with your order."]][si];
    var h = '<div class="screen grey"><div class="scroll" data-keep="track">';
    h += '<header class="track' + (off ? " off" : done ? " done" : "") + '"><div class="topline"><button class="iconbtn" type="button" data-act="back" data-to="#/orders" aria-label="Back">' + ic("back", 22, 2.2) + "</button>" +
      '<button class="iconbtn" type="button" data-act="poll" aria-label="Check for updates">' + ic("refresh", 20, 2.2) + "</button></div>" +
      (q.new && si === 0 && !off ? '<div class="okbig" aria-hidden="true">' + ic("check", 32, 3) + "</div>" : "") +
      '<div class="kick" style="margin-top:' + (q.new && si === 0 ? 16 : 0) + 'px">' + esc(head[0]) + "</div><h1>" + esc(head[1]) + "</h1><p>" + esc(head[2]) + "</p>" +
      (!off && !done ? '<div class="eta">' + ic("clock", 16, 2.4) + "Expected by " + clock(eta) + "</div>" : "") + '<div style="height:12px"></div></header>';
    if (!off) {
      h += '<section class="timeline" aria-label="Order progress">';
      STEPS.forEach(function (s, i) {
        var cls = i < si || done ? "done" : i === si ? "now" : "";
        h += '<div class="tl ' + cls + '"><span class="dot">' + (cls ? ic("check", 16, 3) : "") + "</span><div><b>" + s[1] + "</b><span>" + (i === 0 ? "at " + clock(placed) : s[2]) + "</span></div></div>";
      });
      h += "</section>";
    }
    h += '<section class="group"><a class="row" href="' + waLink(o.wa || "Hi FrescoKart! About my order " + o.ref + ".") + '" target="_blank" rel="noopener"><span class="tile" style="background:#E7F7EC;color:#0F7A3E">' + ic("wa", 20, 1.9) +
      '</span><span class="t"><b>' + (si === 0 && !off ? "Confirm on WhatsApp" : "Message us on WhatsApp") + "</b><span>" + (si === 0 && !off ? "Speeds up your order" : "About this order") + '</span></span><span class="chev">' + ic("chev", 20, 2) + "</span></a>" +
      (done ? '<a class="row" href="#/kitchen"><span class="tile">' + ic("pot", 20, 1.9) + '</span><span class="t"><b>Cook along</b><span>Step by step, with timers</span></span><span class="chev">' + ic("chev", 20, 2) + "</span></a>" : "") +
      (canInstall() && !done && !off ? '<button class="row" type="button" data-act="install" style="width:100%;text-align:left"><span class="tile">' + ic("download", 20, 1.9) + '</span><span class="t"><b>Add FrescoKart to your home screen</b><span>Check this order in one tap</span></span><span class="chev">' + ic("chev", 20, 2) + "</span></button>" : "") + "</section>";
    h += '<section class="group" aria-labelledby="sum-h"><div class="gh"><h2 id="sum-h" class="h3">Your order</h2><span class="muted" style="font:500 12px/1 var(--body)">' + esc(day(placed)) + ", " + clock(placed) + "</span></div>" +
      o.items.map(function (l) {
        return '<div class="row" style="min-height:64px"><img src="' + esc(l.img) + '" alt="" style="width:40px;height:40px;border-radius:10px;object-fit:cover"><span class="t"><b>' + esc(l.name) + "</b><span>" + esc(l.detail) + " · " + esc(l.label) + '</span></span><span class="price" style="font-size:15px">' + inr(l.total) + "</span></div>";
      }).join("") +
      '<div class="row" style="border-top:1px dashed #CBD3CE"><span class="t"><b>To pay</b><span>Pay on delivery, cash or UPI' + (o.saved > 0 ? " · you saved " + inr(o.saved) : "") + '</span></span><span class="price" style="font-size:17px">' + inr(o.total) + "</span></div></section>";
    h += '<section class="group"><div class="row" style="min-height:72px;align-items:flex-start;padding-top:14px;padding-bottom:14px"><span class="tile">' + ic("pin", 20, 1.9) + '</span><span class="t"><b>' + esc(o.area) + "</b><span>" + esc(o.address) + "</span></span></div></section>";
    h += '<p class="muted" style="margin:16px 16px 0;font:500 12px/1.5 var(--body);text-align:center">This page updates by itself while it is open.</p><div style="height:24px"></div></div></div>';
    return {
      html: h, title: "Order " + o.ref, after: function () {
        if (FINAL[o.status] || !o.t) return;
        var tick = function () { if (document.visibilityState === "visible") refreshOrder(o).then(function (ch) { if (ch && cur.path === "/order/" + o.id) refresh(); }); };
        timers.push(setInterval(tick, 30000));
        if (!o.seen || Date.now() - o.seen > 20000) setTimeout(tick, 600);
      }
    };
  }

  /* ================= ORDERS ================= */
  function statusChip(s) {
    var map = { "new": ["Placed", "live"], confirmed: ["Confirmed", "live"], preparing: ["Packing", "live"], "out for delivery": ["On the way", "live"], delivered: ["Delivered", ""], cancelled: ["Cancelled", "bad"] };
    var m = map[s] || ["Placed", "live"];
    return '<span class="status ' + m[1] + '">' + (m[1] === "live" ? '<span class="livedot" style="width:6px;height:6px" aria-hidden="true"></span>' : "") + m[0] + "</span>";
  }
  function ordersPage() {
    var h = '<div class="screen grey">' + tabHead("Your orders", orders.length ? "On this phone" : "") + '<div class="scroll" data-keep="orders">';
    if (!orders.length) {
      h += '<div class="empty" style="padding-top:72px"><span class="ic">' + ic("orders", 30, 1.8) + "</span><b>No orders yet</b><p>Your orders and their live status will show here.</p><a class=\"cta\" href=\"#/\" style=\"width:auto;padding:0 24px;margin-top:8px\">Start shopping</a></div>";
    }
    orders.forEach(function (o) {
      var d = new Date(o.at), first = o.items[0] || {};
      h += '<article class="ocard"><a class="top" href="#/order/' + o.id + '"><img src="' + esc(first.img) + '" alt=""><span class="t"><b>' + esc(o.ref) + "</b><span>" + esc(day(d)) + ", " + clock(d) + "</span></span>" + statusChip(o.status) + "</a>" +
        '<div class="lines">' + o.items.map(function (l) { return esc(l.name) + " × " + esc(l.label); }).join(", ") + "</div>" +
        '<div class="ft"><span class="price">' + inr(o.total) + '</span><span style="display:flex;gap:8px">' +
        (FINAL[o.status] ? "" : '<a class="add sm" href="#/order/' + o.id + '" style="display:inline-flex;align-items:center">TRACK</a>') +
        '<button class="add sm" type="button" data-act="reorder" data-id="' + o.id + '">REPEAT</button></span></div></article>';
    });
    h += '<div style="height:24px"></div></div></div>';
    return {
      html: h, title: "Your orders", after: function () {
        if (!API.on) return;
        var open = orders.filter(function (o) { return !FINAL[o.status] && o.t; }).slice(0, 5);
        if (!open.length) return;
        Promise.all(open.map(refreshOrder)).then(function (r) { if (r.some(Boolean) && cur.path === "/orders") refresh(); });
      }
    };
  }

  /* ================= KITCHEN AND COOK MODE ================= */
  function kitchenPage() {
    var mine = [];
    orders.forEach(function (o) { o.items.forEach(function (l) { var p = (l.key || "").split(":"); if (p[0] === "k" && kitById[p[1]] && mine.indexOf(p[1]) < 0) mine.push(p[1]); }); });
    function row(k) {
      return '<a class="row" href="#/cook/' + k.id + '" style="min-height:76px"><img src="' + k.hero + '" alt="" style="width:52px;height:52px;border-radius:12px;object-fit:cover" loading="lazy"><span class="t"><b>' + esc(k.s) + "</b><span>" + k.steps.length + " steps · " + k.min + " min · " + esc(k.spice) + ' spice</span></span><span class="chev">' + ic("chev", 20, 2) + "</span></a>";
    }
    var h = '<div class="screen grey">' + tabHead("Kitchen", "Cook along, one step at a time") + '<div class="scroll" data-keep="kitchen">';
    h += '<div class="card" style="margin:12px 16px 0;padding:16px;display:flex;gap:14px;align-items:center;background:var(--green-d);color:#fff"><span style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,.12);color:var(--lime)">' + ic("timer", 26, 2) +
      '</span><span style="display:flex;flex-direction:column;gap:4px"><b style="font:700 15px/1.3 var(--body)">Big steps, built-in timers</b><span style="font:500 13px/1.4 var(--body);color:#CFE8DA">Your screen stays on while you cook.</span></span></div>';
    if (mine.length) h += '<h2 class="h2" style="padding:24px 16px 0">From your orders</h2><section class="group">' + mine.map(function (id) { return row(kitById[id]); }).join("") + "</section>";
    h += '<h2 class="h2" style="padding:24px 16px 0">All recipes</h2><section class="group">' + kits.map(row).join("") + '</section><div style="height:24px"></div></div></div>';
    return { html: h, title: "Kitchen" };
  }
  var cookTimer = { end: 0, step: -1, id: "" }, wake = null;
  function cookPage(id, q) {
    var k = kitById[id]; if (!k) return notFound("We couldn’t find that recipe.");
    var sv = q.s === "4" ? 4 : 2, n = k.steps.length, i = Math.max(0, Math.min(n + 1, +(q.i || 0))), col = sv === 4 ? 1 : 2;
    var base = "#/cook/" + k.id + "?s=" + sv + "&i=";
    var h = '<div class="screen cook"><header class="appbar"><button class="iconbtn" type="button" data-act="back" data-to="#/kitchen" aria-label="Close cook mode">' + ic("close", 22, 2.2) + "</button><h1>" + esc(k.s) + '<span class="sub" style="color:#CFE8DA">Serves ' + sv + "</span></h1></header>";
    h += '<div class="prog" aria-hidden="true">' + Array.apply(null, Array(n + 1)).map(function (_, j) { return '<i class="' + (j <= i ? "on" : "") + '"></i>'; }).join("") + "</div><div class=\"body\">";
    if (i === 0) {
      h += '<div class="kick">BEFORE YOU START</div><p class="say">Lay out everything from the pack.</p><ul class="checklist">';
      ["fish", "veg", "masala", "extra"].forEach(function (g) { (k.inside[g] || []).forEach(function (r) { var p = r.split("|"); h += '<li><label><input type="checkbox"><span>' + esc(p[0]) + "</span><small>" + esc(p[col]) + "</small></label></li>"; }); });
      h += '</ul><p style="margin:20px 0 0;font:500 14px/1.5 var(--body);color:#CFE8DA">You’ll also need: ' + esc(k.need) + ".</p>";
    } else if (i <= n) {
      var p = k.steps[i - 1].split("|"), mins = +p[1] || 0, running = cookTimer.id === k.id && cookTimer.step === i && cookTimer.end > Date.now();
      h += '<div class="kick">STEP ' + i + " OF " + n + '</div><p class="say">' + esc(p[0]) + "</p>";
      if (mins) h += '<div class="timer"><div><div style="font:600 12px/1 var(--body);color:#CFE8DA;margin-bottom:8px">' + (running ? "Timer running" : "Timer") + '</div><b id="tleft">' + (running ? fmtLeft(cookTimer.end - Date.now()) : mins + ":00") + "</b></div>" +
        (running ? '<button class="stop" type="button" data-act="timer" data-m="0">Stop</button>' : '<button type="button" data-act="timer" data-id="' + k.id + '" data-step="' + i + '" data-m="' + mins + '">Start ' + mins + " min</button>") + "</div>";
    } else {
      h += '<div style="display:flex;flex-direction:column;align-items:flex-start;gap:16px;padding-top:24px"><div class="okbig">' + ic("check", 32, 3) + '</div><div class="kick">ALL DONE</div><p class="say" style="margin:0">Enjoy your ' + esc(k.s.toLowerCase()) + ".</p>" +
        '<p style="margin:0;font:500 15px/1.5 var(--body);color:#CFE8DA">Loved it? Order the kit again in two taps.</p><button class="cta lime" type="button" data-act="add" data-key="k:' + k.id + ":" + sv + '" style="background:var(--lime);color:var(--ink)">Add this kit to basket</button></div>';
    }
    h += "</div>";
    if (i <= n) h += '<div class="nav">' + (i > 0 ? '<a class="cta ghost" href="' + base + (i - 1) + '">Back</a>' : '<a class="cta ghost" href="#/kit/' + k.id + '">Kit</a>') +
      '<a class="cta lime" href="' + base + (i + 1) + '">' + (i === 0 ? "Start cooking" : i === n ? "Finish" : "Next step") + ic("chev", 18, 2.4) + "</a></div>";
    else h += '<div class="nav" style="grid-template-columns:1fr"><a class="cta ghost" href="#/kitchen">Back to kitchen</a></div>';
    h += "</div>";
    return {
      html: h, title: "Cook " + k.s, after: function () {
        keepAwake();
        if (cookTimer.end > Date.now()) timers.push(setInterval(function () {
          var el = $("#tleft"), left = cookTimer.end - Date.now();
          if (left <= 0) { cookTimer.end = 0; ring(); refresh(); return; }
          if (el) el.textContent = fmtLeft(left);
        }, 500));
      }
    };
  }
  function fmtLeft(ms) { var s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function ring() {
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) { }
    try {
      var A = window.AudioContext || window.webkitAudioContext, ctx = new A();
      [0, 0.35, 0.7].forEach(function (t) { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3); });
    } catch (e) { }
    toast("Time’s up! On to the next step.");
  }
  function keepAwake() {
    try { if ("wakeLock" in navigator && !wake) navigator.wakeLock.request("screen").then(function (w) { wake = w; w.addEventListener("release", function () { wake = null; }); }).catch(function () { }); } catch (e) { }
  }

  /* ================= ACCOUNT ================= */
  function accountPage() {
    var name = String(profile.name || "").trim(), ph = validPhone(profile.phone);
    var h = '<div class="screen grey">' + tabHead("Account") + '<div class="scroll" data-keep="account">';
    h += '<a class="card" href="#/profile" style="display:flex;align-items:center;gap:14px;margin:12px 16px 0;padding:16px"><span style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;background:var(--green);color:#fff;font:800 20px/1 var(--display)">' +
      (name ? esc(name.charAt(0).toUpperCase()) : ic("user", 24, 2)) + '</span><span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><b style="font:700 17px/1.3 var(--body)">' + esc(name || "Add your details") + '</b><span class="muted" style="font:500 13px/1.3 var(--body)">' +
      (ph ? "+91 " + ph.slice(0, 5) + " " + ph.slice(5) : "So checkout is one tap next time") + '</span></span><span class="chev">' + ic("edit", 20, 2) + "</span></a>";
    function row(href, icon, t, s, ext) { return '<a class="row" href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + '><span class="tile">' + ic(icon, 20, 1.9) + '</span><span class="t"><b>' + t + "</b>" + (s ? "<span>" + s + "</span>" : "") + '</span><span class="chev">' + ic("chev", 20, 2) + "</span></a>"; }
    h += '<section class="group">' + row("#/area", "pin", "Delivery area", esc(profile.area && profile.area !== ELSE ? profile.area : "Not chosen yet")) + row("#/orders", "orders", "Your orders", orders.length ? orders.length + " on this phone" : "None yet") + row("#/kitchen", "pot", "Kitchen", "Cook along with timers") + "</section>";
    h += '<section class="group">' + row(waLink("Hi FrescoKart! I need help."), "wa", "Help on WhatsApp", "+91 81578 63503", true) + row("/privacy.html", "shield", "Privacy notice", "", true) +
      (canInstall() ? '<button class="row" type="button" data-act="install" style="width:100%;text-align:left"><span class="tile">' + ic("download", 20, 1.9) + '</span><span class="t"><b>Add to home screen</b><span>Opens in one tap, like an app</span></span><span class="chev">' + ic("chev", 20, 2) + "</span></button>" : "") + "</section>";
    h += '<footer class="foot"><img src="/img/symbol-colour.svg" alt="" width="30" height="29"><span class="brand">Fresco<span>Kart</span></span><p>Fresh fish kits, live in Kochi.</p><span class="mono">VERSION ' + VERSION + "</span></footer></div></div>";
    return { html: h, title: "Account" };
  }
  function profilePage() {
    var h = '<div class="screen grey">' + appBar("Your details", "Saved on this phone only") + '<div class="scroll"><section class="group"><div class="form">' +
      '<div class="field"><label for="p-name">Name</label><input id="p-name" autocomplete="name" maxlength="60" value="' + esc(profile.name || "") + '"></div>' +
      '<div class="field"><label for="p-phone">Mobile number</label><div class="phone"><span>+91</span><input id="p-phone" type="tel" inputmode="numeric" maxlength="14" value="' + esc(profile.phone || "") + '"></div></div>' +
      '<div class="field"><label for="p-house">House or flat, and street</label><input id="p-house" autocomplete="street-address" maxlength="120" value="' + esc(profile.house || "") + '"></div>' +
      '<div class="field"><label for="p-land">Landmark</label><input id="p-land" maxlength="60" value="' + esc(profile.landmark || "") + '"></div>' +
      '</div></section><p class="muted" style="margin:12px 16px 0;font:500 12px/1.5 var(--body)">We only use these to deliver your orders. They stay on this phone until you place an order.</p></div>' +
      '<div class="paybar"><button class="cta green" type="button" data-act="saveprofile">Save</button></div></div>';
    return { html: h, title: "Your details" };
  }

  function notFound(msg) {
    return { html: '<div class="screen">' + appBar("") + '<div class="scroll"><div class="empty" style="padding-top:72px"><span class="ic">' + ic("fish", 30, 1.8) + "</span><b>Not found</b><p>" + esc(msg) + '</p><a class="cta" href="#/" style="width:auto;padding:0 24px">Go home</a></div></div></div>' };
  }

  /* ---------- layer: toast ---------- */
  var toastT = 0;
  function toast(msg) {
    var l = $("#layer"); clearTimeout(toastT);
    l.innerHTML = '<div class="toast" role="status">' + ic("check", 18, 2.6) + "<span>" + esc(msg) + "</span></div>";
    toastT = setTimeout(function () { l.innerHTML = ""; }, 2600);
  }
  function closeLayer() { clearTimeout(toastT); var l = $("#layer"); if (l) l.innerHTML = ""; }

  /* ---------- actions ---------- */
  var A = {
    back: function (el) { back(el.getAttribute("data-to")); },
    add: function (el) {
      var k = el.dataset.key; bump(k, "add"); focusId = "inc:" + k; refresh();
      if (cur.path.indexOf("/cook/") === 0) toast("Added to your basket");
    },
    inc: function (el) { bump(el.dataset.key, "inc"); refresh(); },
    dec: function (el) { var k = el.dataset.key; bump(k, "dec"); if (!qtyOf(k)) focusId = "add:" + k; refresh(); },
    cat: function (el) { ui.cat = el.dataset.id; refresh(); var s = $("#all-kits"); if (s && ui.cat !== "all") s.scrollIntoView({ behavior: "smooth", block: "start" }); },
    chip: function (el) { var id = el.dataset.id; ui.chips[id] = !ui.chips[id]; refresh(); },
    fchip: function (el) { var id = el.dataset.id; ui.fchips[id] = !ui.fchips[id]; refresh(); },
    clearfilters: function () { ui.chips = {}; ui.cat = "all"; refresh(); },
    sv: function (el) { ui.sv[el.dataset.id] = +el.dataset.sv; refresh(); },
    flipsv: function (el) {
      var p = el.dataset.key.split(":"), to = p[2] === "2" ? 4 : 2, nk = "k:" + p[1] + ":" + to;
      basket[nk] = Math.min(9, (basket[nk] || 0) + basket[el.dataset.key]); delete basket[el.dataset.key];
      saveBasket(); popKey = nk; refresh();
    },
    cut: function (el) { ui.cut[el.dataset.id] = +el.dataset.i; refresh(); },
    kg: function (el) { var id = el.dataset.id; ui.kg[id] = Math.max(0.5, Math.min(10, (ui.kg[id] || 1) + +el.dataset.d)); refresh(); },
    addfish: function (el) {
      var f = fishById[el.dataset.id], ci = ui.cut[f.k] || 0, kg = ui.kg[f.k] || 1, key = "f:" + f.k + ":" + ci, had = qtyOf(key);
      basket[key] = kg; saveBasket(); refresh(); toast(had ? "Basket updated: " + f.n + ", " + kgs(kg) : f.n + " added to your basket");
    },
    q: function (el) { var q = $("#q"); ui.q = el.dataset.q; if (q) { q.value = ui.q; q.dispatchEvent(new Event("input")); } },
    goarea: function () { go("#/area?next=home"); },
    setarea: function (el) {
      profile.area = el.dataset.a; saveProfile(); voteArea(profile.area); lead.open = false;
      var next = cur.q.next;
      if (next === "checkout") go("#/checkout", true); else back(next === "basket" ? "#/basket" : "#/");
    },
    elsearea: function () { lead.open = !lead.open; lead.msg = ""; refresh(); if (lead.open) setTimeout(function () { var p = $("#l-phone"); if (p) p.focus(); }, 50); },
    lead: function () {
      var ph = validPhone(($("#l-phone") || {}).value), ok = ($("#l-agree") || {}).checked;
      if (!ph) { lead.msg = "Enter a 10-digit mobile number."; lead.ok = false; refresh(); return; }
      if (!ok) { lead.msg = "Please tick the box so we can message you."; lead.ok = false; refresh(); return; }
      if (!API.on) { window.open(waLink("Hi FrescoKart! Please tell me when you deliver to my area. My number is " + ph + "."), "_blank", "noopener"); return; }
      lead.sending = true; refresh();
      apiPost("/api/leads", { phone: ph, area: ELSE, consent: true, hp: "", utm: UTM }).then(function (j) {
        lead.sending = false; lead.ok = !!(j && j.ok);
        lead.msg = lead.ok ? (j.already ? "You are already on the list. Thank you!" : "Thank you! We will message you when we deliver to your area.") : (j && j.message) || "Something went wrong. Please try again.";
        refresh();
      }).catch(function () { lead.sending = false; lead.ok = false; lead.msg = "We couldn’t reach FrescoKart. Please try again."; refresh(); });
    },
    "continue": function () { var a = profile.area && profile.area !== ELSE; go(a ? "#/checkout" : "#/area?next=checkout"); },
    rider: function (el) { var i = el.dataset.i; ui.rider[i] = !ui.rider[i]; refresh(); },
    place: placeOrder,
    poll: function () {
      var o = orders.filter(function (x) { return "/order/" + x.id === cur.path; })[0];
      if (!o) return;
      if (FINAL[o.status]) { toast("This order is " + o.status + "."); return; }
      refreshOrder(o).then(function (ch) { if (ch) refresh(); else toast("No change yet. We’ll keep checking."); });
    },
    reorder: function (el) {
      var o = orders.filter(function (x) { return String(x.id) === el.dataset.id; })[0]; if (!o) return;
      var n = 0;
      o.items.forEach(function (l) { if (l.key && line(l.key, l.q)) { basket[l.key] = l.q; n++; } });
      saveBasket();
      if (n) go("#/basket"); else toast("Those items are not on the menu right now.");
    },
    timer: function (el) {
      var m = +el.dataset.m;
      if (!m) { cookTimer.end = 0; refresh(); return; }
      cookTimer = { end: Date.now() + m * 60000, step: +el.dataset.step, id: el.dataset.id }; refresh();
    },
    share: function (el) {
      var k = kitById[el.dataset.id];
      try { navigator.share({ title: k.n, text: k.n + " from FrescoKart: fish, cut vegetables and masalas in one chilled pack.", url: location.origin + "/app/#/kit/" + k.id }).catch(function () { }); } catch (e) { }
    },
    install: function () {
      if (installPrompt) {
        var p = installPrompt; installPrompt = null;  // the browser lets each prompt be shown once
        p.prompt();
        p.userChoice.then(function (c) { if (c && c.outcome === "dismissed") save("fk-install-hide", Date.now()); refresh(); }).catch(function () { refresh(); });
        return;
      }
      if (isIOS) iosSheet();
    },
    hideinstall: function () { save("fk-install-hide", Date.now()); refresh(); },
    closelayer: function () { closeLayer(); },
    noop: function () { },
    saveprofile: function () {
      var ph = ($("#p-phone") || {}).value || "";
      if (ph && !validPhone(ph)) { toast("That mobile number doesn’t look right."); return; }
      profile.name = ($("#p-name") || {}).value || ""; profile.phone = ph; profile.house = ($("#p-house") || {}).value || ""; profile.landmark = ($("#p-land") || {}).value || "";
      saveProfile(); toast("Saved"); back("#/account");
    }
  };

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (el && !el.disabled) { e.preventDefault(); var f = A[el.getAttribute("data-act")]; if (f) f(el, e); return; }
    var a = e.target.closest("a[href^='#']");
    if (a) navKind = "push";
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.id === "q") e.target.blur();
    if (e.key === "Escape" && $("#layer .sheetwrap")) closeLayer();
  });
  window.addEventListener("appinstalled", function () {
    installPrompt = null; save("fk-install-hide", Date.now()); refresh(); toast("FrescoKart is on your home screen");
  });
  window.addEventListener("online", function () { $("#net").hidden = true; checkServer(); });
  window.addEventListener("offline", function () { $("#net").hidden = false; });
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); installPrompt = e;
    if (cur.path === "/" || cur.path === "/account" || (cur.path || "").indexOf("/order/") === 0) refresh();
  });
  window.addEventListener("storage", function (e) {
    if (e.key === "fk-app-basket") { basket = load("fk-app-basket", {}); refresh(); }
  });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && cur.path && cur.path.indexOf("/cook/") === 0) { wake = null; keepAwake(); } });

  /* ---------- start ---------- */
  $("#net").hidden = navigator.onLine !== false;
  depth = (history.state && history.state.d) || 0;
  try { if (!history.state) history.replaceState({ d: 0 }, ""); } catch (e) { }
  // drop basket lines for things no longer on the menu
  Object.keys(basket).forEach(function (k) { if (!line(k, basket[k])) delete basket[k]; }); saveBasket();
  render();
  checkServer().then(function () { if (cur.path === "/checkout") refresh(); });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(function () { }); });
  }
})();
