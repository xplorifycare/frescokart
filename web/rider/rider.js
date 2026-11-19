/* FrescoKart Rider: the delivery app for the pilot. Go online, take an order, pick up at each shop with its PIN,
   deliver with the customer's code and collect cash or UPI. Talks to /api/m/login and /api/m/rider/*. */
(function () {
  "use strict";
  var h = FK.html, icon = FK.icon;
  var $view = document.getElementById("view"), $tabs = document.getElementById("tabs");
  var S = { token: FK.load("fkr-token", ""), me: null, current: null, offers: [], loaded: false, code: "", busy: false, seenOffers: [] };
  var pollTimer = null;

  function api(path, body) {
    return FK.api(path, { body: body, auth: S.token }).then(function (res) {
      if (res.status === 401 && S.token) logout("Please log in again.");
      return res;
    });
  }
  function logout(msg) {
    S.token = ""; FK.drop("fkr-token"); S.me = null; S.current = null; S.offers = [];
    clearTimeout(pollTimer); FK.keepAwake(false);
    render();
    if (msg) FK.toast(msg, true);
  }
  function typing() { var a = document.activeElement; return a && a.tagName === "INPUT"; }

  function poll() {
    clearTimeout(pollTimer);
    if (!S.token) return Promise.resolve();
    return api("/api/m/rider/jobs").then(function (res) {
      if (res.ok) {
        S.loaded = true;
        var hadJob = !!S.current;
        S.current = res.data.current; S.offers = res.data.offers;
        var fresh = S.offers.filter(function (o) { return S.seenOffers.indexOf(o.id) < 0; });
        if (fresh.length && FK.audioReady()) { FK.chime(true); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
        S.seenOffers = S.offers.map(function (o) { return o.id; }).concat(S.seenOffers).slice(0, 100);
        if (hadJob && !S.current && location.hash === "#/job") location.hash = "#/";
        if (!typing()) render();
      }
      var active = (S.me && S.me.online) || S.current;
      pollTimer = setTimeout(poll, active ? 8000 : 30000);
    });
  }
  function loadMe() { return api("/api/m/rider/me").then(function (res) { if (res.ok) S.me = res.data.rider; }); }

  /* ---------- screens ---------- */
  function loginScreen() {
    $tabs.hidden = true;
    FK.put($view, h`<form class="login" id="lg" novalidate>
      <div class="top"><img src="/img/symbol-white.svg" alt="" width="44" height="42">
        <div class="kicker" style="margin-top:22px;color:var(--lime-t)">FRESCOKART RIDER</div>
        <h1 class="h1" style="margin-top:10px;font-size:30px;line-height:36px">Short trips, fresh food, near home</h1>
        <p class="t14" style="margin:10px 0 0;font-weight:500;color:#CFE8DA">Log in with your mobile number and the PIN FrescoKart gave you.</p></div>
      <div class="panel">
        <label class="field">Mobile number<input class="input" name="phone" type="tel" inputmode="numeric" autocomplete="username" maxlength="14" placeholder="10-digit number" required></label>
        <label class="field">PIN<input class="input" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" placeholder="4 to 6 digits" required></label>
        <p class="err" id="lg-err" role="alert" style="margin:10px 0 0"></p>
        <button class="btn green" style="margin-top:12px">Log in</button>
        <p class="hint" style="margin:12px 0 0;text-align:center">Want to ride with FrescoKart? WhatsApp +91 81578 63503.</p>
      </div></form>`);
    var f = document.getElementById("lg");
    f.onsubmit = function (e) {
      e.preventDefault();
      FK.unlockAudio();
      var err = document.getElementById("lg-err");
      FK.api("/api/m/login", { body: { role: "rider", phone: f.elements.namedItem("phone").value, pin: f.elements.namedItem("pin").value.trim() } }).then(function (res) {
        if (!res.ok) { err.textContent = FK.msg(res); return; }
        S.token = res.data.token; FK.save("fkr-token", S.token);
        loadMe().then(function () { render(); poll(); });
      });
    };
  }

  function drawTabs(active) {
    $tabs.hidden = false;
    FK.put($tabs, h`<a href="#/" ${active === "ride" ? FK.raw('aria-current="page"') : ""}><span>${icon("scooter", 22)}</span>Ride</a>
      <a href="#/today" ${active === "today" ? FK.raw('aria-current="page"') : ""}><span>${icon("cash", 22)}</span>Earnings</a>`);
  }
  function shopsLine(shops) { return shops.map(function (s) { return s.name.replace(/\s*\(demo\)$/, ""); }).join(" → "); }

  function home() {
    drawTabs("ride");
    var me = S.me || { name: "", online: false, today: { trips: 0, pay: 0, cash: 0 } };
    FK.put($view, h`<div class="scroll">
      <header style="padding:calc(14px + var(--safe-t)) 16px 20px;background:var(--green-d);color:#fff">
        <div class="between"><span class="stack"><span class="kicker" style="color:var(--lime-t)">FRESCOKART RIDER</span><b style="margin-top:6px;font:800 20px/26px var(--display)">Hi, ${me.name.replace(/\s*\(demo\)$/, "")}</b></span>
          <img src="/img/symbol-white.svg" alt="" width="30" height="28"></div>
        <button role="switch" aria-checked="${me.online}" data-act="online" style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:64px;margin-top:16px;padding:10px 12px 10px 16px;border-radius:16px;${me.online ? "background:var(--lime);color:var(--ink)" : "background:rgba(255,255,255,.12);color:#fff"};text-align:left">
          <span class="stack"><b style="font:800 18px/22px var(--display)">${me.online ? "You are online" : "You are offline"}</b><span class="t12" style="opacity:.85">${me.online ? "New orders near you will ring" : "Tap to start getting orders"}</span></span>
          <span class="switch" aria-hidden="true" aria-checked="${me.online}" style="${me.online ? "background:var(--green-d)" : ""}"></span></button>
      </header>
      ${FK.install.card({ key: "fkr-install", icon: "/rider/icon-192.png", title: "Install FrescoKart Rider", text: "Opens in one tap and stays logged in. Add it before your shift.", days: 1 })}
      ${FK.audioReady() ? "" : h`<button class="note a" data-act="sound" style="width:calc(100% - 32px);text-align:left">${icon("sound", 20)}<span><b>Tap to turn on the order sound.</b> Keep the app open while you ride.</span></button>`}
      ${S.current ? h`<a class="card" href="#/job" style="display:block;border:1.5px solid var(--green)">
          <div class="between"><span class="kicker" style="color:var(--green-ink)">YOUR ORDER · ${S.current.ref}</span><span class="pill g">${S.current.status === "picked" ? "Deliver" : "Pick up"}</span></div>
          <b class="h3" style="display:block;margin-top:8px">${S.current.status === "picked" ? "Deliver to " + S.current.area : shopsLine(S.current.shops.filter(function (s) { return s.status !== "rejected"; }))}</b>
          <span class="link">Open${icon("next", 16)}</span></a>` : ""}
      ${!S.current && me.online ? h`<div class="sechead"><h2 class="h2">Orders near you</h2>${S.offers.length ? h`<span class="pill o">${S.offers.length} waiting</span>` : ""}</div>
        ${S.offers.length ? S.offers.map(function (o) {
          return h`<section class="card rise">
            <div class="between"><span class="stack"><span class="t12 muted">You earn</span><b style="font:700 30px/34px var(--body);color:var(--green)">${FK.rs(o.rider_pay)}</b></span>
              <span class="pill ${o.pay_mode === "cash" ? "a" : "g"}">${o.pay_mode === "cash" ? "Collect " + FK.rs(o.total) + " cash" : "UPI on delivery"}</span></div>
            <div style="margin-top:10px">${o.shops.map(function (s, i) { return h`<div class="between" style="min-height:40px;border-top:1px solid var(--line2)"><span class="t14">${i + 1}. ${s.name}</span><span class="t12 muted">${s.area} · ${s.status === "ready" ? "packed" : "packing"}</span></div>`; })}
              <div class="between" style="min-height:40px;border-top:1px solid var(--line2)"><span class="t14">${icon("home", 16, ' style="vertical-align:-3px;color:var(--orange)"')} Drop</span><span class="t12 muted">${o.area}</span></div></div>
            <button class="btn lime" data-act="claim" data-id="${o.id}" style="margin-top:12px">Accept ${o.ref}</button></section>`;
        }) : h`<div class="empty"><span class="ring">${icon("bell", 28)}</span><b class="h3">${S.loaded ? "No orders right now" : "Looking for orders"}</b><span class="t13 muted">Stay near the market. New orders ring here.</span></div>`}` : ""}
      ${!me.online && !S.current ? h`<div class="empty"><span class="ring">${icon("scooter", 28)}</span><b class="h3">Go online to get orders</b><span class="t13 muted">Carry the ice bag on every trip. Fish and meat stay cold until the door.</span></div>` : ""}
      <section class="card" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
        <span class="stack"><b style="font:700 22px/28px var(--body)">${FK.rs(me.today.pay)}</b><span class="t12 muted">earned today</span></span>
        <span class="stack"><b style="font:700 22px/28px var(--body)">${me.today.trips}</b><span class="t12 muted">trips</span></span>
        <span class="stack"><b style="font:700 22px/28px var(--body)">${FK.rs(me.today.cash)}</b><span class="t12 muted">cash held</span></span></section>
    </div>`);
  }

  function job() {
    drawTabs("ride");
    var o = S.current;
    if (!o && !S.loaded) { FK.put($view, h`<div class="scroll"><div class="card"><div class="shim" style="height:160px"></div></div></div>`); return; }
    if (!o) { location.hash = "#/"; return; }
    var live = o.shops.filter(function (s) { return s.status !== "rejected"; });
    var picked = live.filter(function (s) { return s.status === "picked"; }).length;
    var allPicked = o.status === "picked";
    FK.put($view, h`<div class="bar dark"><a class="icon-btn" href="#/" aria-label="Back">${icon("back", 22)}</a>
      <h1>${allPicked ? "Deliver " + o.ref : "Pickup " + Math.min(picked + 1, live.length) + " of " + live.length}<small>You earn ${FK.rs(o.rider_pay)} · ${o.pay_mode === "cash" ? "collect cash" : "customer pays by UPI"}</small></h1></div>
      <div class="scroll">
        ${live.map(function (s, i) {
          var done = s.status === "picked", ready = s.status === "ready";
          return h`<section class="card" style="${done ? "opacity:.7" : ""}">
            <div class="between"><span class="stack"><span class="kicker muted">STOP ${i + 1}</span><b class="h3" style="margin-top:4px">${s.name}</b><span class="t13 muted">${s.address || s.area}</span></span>
              <span class="pill ${done ? "n" : ready ? "g" : "a"}">${done ? "Picked up" : ready ? "Packed" : s.status === "new" ? "Confirming" : "Packing"}</span></div>
            ${done ? "" : h`<div class="grid2" style="margin-top:12px"><a class="btn sm line" href="${FK.tel(s.phone)}" style="width:100%">${icon("phone", 18)}Call shop</a><a class="btn sm line" href="${FK.mapLink(s.name.replace(/\s*\(demo\)$/, "") + ", " + (s.address || s.area) + ", Kochi")}" target="_blank" rel="noopener" style="width:100%">${icon("map", 18)}Map</a></div>
              <div class="card dark" style="margin:12px 0 0;display:flex;align-items:center;justify-content:space-between;gap:12px"><span class="stack"><b class="t14">Pickup PIN</b><span class="t12" style="color:#CFE8DA">Show it at the counter</span></span><span style="font:600 28px/1 var(--mono);letter-spacing:.14em;color:var(--lime)">${s.pin}</span></div>
              <div style="margin-top:10px">${s.items.filter(function (it) { return !it.out; }).map(function (it) { return h`<div class="between t13" style="min-height:36px;border-top:1px solid var(--line2)"><span>${it.name}</span><b>${FK.qty(it.unit, it.packed != null ? it.packed : it.qty)}</b></div>`; })}</div>
              <button class="btn ${ready ? "green" : ""}" data-act="picked" data-id="${s.shop_id}" ${ready ? "" : FK.raw("disabled")} style="margin-top:12px">${ready ? "Picked up from this shop" : "Waiting for the shop to pack"}</button>`}
          </section>`;
        })}
        <section class="card" style="${allPicked ? "border:1.5px solid var(--orange)" : "opacity:.85"}">
          <div class="between"><span class="stack"><span class="kicker muted">DROP</span><b class="h3" style="margin-top:4px">${o.name || "Customer"}</b><span class="t13 muted">${o.address}, ${o.area}</span></span>${icon("home", 22, ' style="color:var(--orange)"')}</div>
          ${o.notes ? h`<div class="note a" style="margin:10px 0 0">${icon("alert", 18)}<span>“${o.notes}”</span></div>` : ""}
          <div class="grid2" style="margin-top:12px"><a class="btn sm line" href="${FK.tel(o.phone)}" style="width:100%">${icon("phone", 18)}Call</a><a class="btn sm line" href="${FK.mapLink(o.address + ", " + o.area + ", Kochi")}" target="_blank" rel="noopener" style="width:100%">${icon("map", 18)}Map</a></div>
          <div class="between" style="margin-top:12px;padding:12px 14px;border-radius:12px;background:${o.pay_mode === "cash" ? "var(--orange-t)" : "var(--green-t)"}">
            <span class="t14" style="color:${o.pay_mode === "cash" ? "#7A2604" : "var(--green-ink)"}">${o.pay_mode === "cash" ? "Collect in cash" : "Customer pays by UPI to FrescoKart"}</span><b style="font:800 22px/1 var(--body)">${FK.rs(o.total)}</b></div>
          ${allPicked ? h`<label class="field" style="margin-top:14px">Customer’s 4-digit delivery code<input class="input code" id="code" inputmode="numeric" maxlength="4" autocomplete="one-time-code" value="${S.code}" placeholder="••••"></label>
            <p class="hint" style="margin:6px 0 0">It is on their order screen. It proves the order reached the right person.</p>
            <button class="btn green" data-act="deliver" style="margin-top:12px">Delivered</button>` : h`<p class="hint" style="margin:10px 0 0">Pick up from every shop first.</p>`}
        </section>
        ${picked === 0 ? h`<button class="link pad" data-act="release" style="color:var(--red)">Can’t do this order? Give it back</button>` : ""}
      </div>`);
    var code = document.getElementById("code");
    if (code) code.oninput = function () { S.code = code.value.replace(/\D/g, "").slice(0, 4); if (code.value !== S.code) code.value = S.code; };
  }

  function today() {
    drawTabs("today");
    var t = S.me ? S.me.today : { trips: 0, pay: 0, cash: 0 };
    FK.put($view, h`<div class="bar"><h1 class="lead">Earnings<small>${S.me ? S.me.name : ""}</small></h1></div><div class="scroll">
      <section class="card dark"><div class="kicker" style="color:var(--lime)">TODAY</div>
        <div style="margin-top:10px;font:700 34px/40px var(--body)">${FK.rs(t.pay)}</div><div class="t13" style="color:#CFE8DA">${t.trips} ${t.trips === 1 ? "trip" : "trips"}</div></section>
      <section class="card" style="background:${t.cash ? "var(--amber-t)" : "var(--green-t)"}">
        <div class="between"><span class="stack"><b class="h3" style="color:${t.cash ? "var(--amber-ink)" : "var(--green-ink)"}">${t.cash ? "Cash you are holding" : "No cash to hand over"}</b>
          <span class="t13" style="color:${t.cash ? "var(--amber-ink)" : "var(--green-ink)"}">${t.cash ? "From cash orders. Hand it to FrescoKart by 10 PM tonight." : "Cash orders show here."}</span></span>
          <b style="font:700 20px/26px var(--body)">${FK.rs(t.cash)}</b></div></section>
      <div class="note s">${icon("clock", 20)}<span>Pay goes to your bank every Monday in the pilot. The amounts here are the pilot’s example rates.</span></div>
      <section class="card flush" style="margin-top:12px">
        ${FK.install.possible() ? h`<button class="row" data-act="install" style="width:100%;text-align:left">${icon("box", 20)}<span class="t14">Add this app to the home screen</span>${icon("next", 18)}</button>` : ""}
        <a class="row" href="${FK.tel("+918157863503")}">${icon("phone", 20)}<span class="t14">Call FrescoKart</span>${icon("next", 18)}</a>
        <button class="row" data-act="logout" style="width:100%;text-align:left;color:var(--muted)">${icon("logout", 20)}<span class="t14">Log out of this phone</span><span></span></button></section></div>`);
    loadMe().then(function () { if (location.hash === "#/today" && S.me && (S.me.today.trips !== t.trips || S.me.today.pay !== t.pay)) today(); });
  }

  /* ---------- events ---------- */
  function jobAct(body, okMsg) {
    if (S.busy) return Promise.resolve(false);
    S.busy = true;
    return api("/api/m/rider/job", body).then(function (res) {
      S.busy = false;
      if (!res.ok) { FK.toast(FK.msg(res), true); return false; }
      if (okMsg) FK.toast(okMsg);
      return true;
    });
  }
  document.getElementById("app").addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var a = t.dataset.act, id = Number(t.dataset.id);
    FK.unlockAudio();
    if (a === "install") { FK.install.run("FrescoKart Rider", "/rider/icon-192.png"); return; }
    if (a === "install-later") { FK.install.later(t.dataset.key, Number(t.dataset.days) || 1); render(); return; }
    if (a === "sound") { FK.chime(false); render(); }
    else if (a === "online") {
      var on = !(S.me && S.me.online);
      api("/api/m/rider/online", { online: on }).then(function (res) {
        if (!res.ok) { FK.toast(FK.msg(res), true); return; }
        S.me.online = res.data.online; FK.keepAwake(S.me.online); render(); poll();
      });
    }
    else if (a === "claim") jobAct({ order_id: id, action: "claim" }, "It’s yours. Head to the first shop.").then(function (ok) { poll().then(function () { if (ok && S.current) location.hash = "#/job"; }); });
    else if (a === "picked") jobAct({ order_id: S.current.id, action: "picked", shop_id: id }, "Picked up").then(poll);
    else if (a === "deliver") {
      if (!/^\d{4}$/.test(S.code)) { FK.toast("Enter the 4-digit code from the customer.", true); return; }
      jobAct({ order_id: S.current.id, action: "deliver", code: S.code }, "Delivered. " + FK.rs(S.current.rider_pay) + " added to today.").then(function (ok) {
        if (ok) { S.code = ""; S.current = null; location.hash = "#/"; loadMe().then(render); poll(); }
      });
    }
    else if (a === "release") { if (confirm("Give this order back? Another rider will take it.")) jobAct({ order_id: S.current.id, action: "release" }, "Order given back").then(function () { location.hash = "#/"; poll(); }); }
    else if (a === "logout") { if (confirm("Log out? You will stop getting orders on this phone.")) { api("/api/m/rider/online", { online: false }).then(function () { logout(); }); } }
  });

  function render() {
    if (!S.token) return loginScreen();
    var r = location.hash.replace(/^#\/?/, "");
    if (r === "job") return job();
    if (r === "today") return today();
    return home();
  }
  window.addEventListener("hashchange", function () { render(); var sc = $view.querySelector(".scroll"); if (sc) sc.scrollTop = 0; });
  FK.watchNet();
  FK.registerSW("/rider/sw.js", "/rider/");
  FK.install.onChange = function () { if (S.token && !typing()) render(); };
  if (S.token) loadMe().then(function () { if (S.me && S.me.online) FK.keepAwake(true); render(); poll(); });
  render();
})();
