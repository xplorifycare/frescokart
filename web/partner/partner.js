/* FrescoKart Partner: the shop's app for the pilot. Log in with the shop's number and PIN, keep the shop open,
   accept orders when they ring, pack and weigh, and set today's prices. Talks to /api/m/login and /api/m/shop/*. */
(function () {
  "use strict";
  var h = FK.html, icon = FK.icon;
  var $view = document.getElementById("view"), $tabs = document.getElementById("tabs"), $layer = document.getElementById("layer");
  var READY = [10, 15, 20, 30];
  var REASONS = ["An item is out of stock", "Too busy right now", "Closing soon"];

  var S = {
    token: FK.load("fkp-token", ""), shop: null, orders: [], open: false, items: null, edits: {},
    tab: "orders", sub: "new", seen: FK.load("fkp-seen", []), ready: 15, alarmFor: null, pack: {}, loaded: false, busy: false
  };
  var pollTimer = null;

  function api(path, body) {
    return FK.api(path, { body: body, auth: S.token }).then(function (res) {
      if (res.status === 401 && S.token) { logout("Please log in again."); }
      return res;
    });
  }
  function logout(msg) {
    S.token = ""; FK.drop("fkp-token"); S.shop = null; S.orders = []; S.items = null;
    clearTimeout(pollTimer); FK.ring(false); FK.keepAwake(false); $layer.innerHTML = "";
    render();
    if (msg) FK.toast(msg, true);
  }

  /* ---------- polling ---------- */
  function poll() {
    clearTimeout(pollTimer);
    if (!S.token) return;
    api("/api/m/shop/orders").then(function (res) {
      if (res.ok) {
        S.orders = res.data.orders; S.open = res.data.open; S.loaded = true;
        if (S.tab === "orders" && !onPack()) render(); else { drawTabs(); }
        alarm();
      }
      pollTimer = setTimeout(poll, document.visibilityState === "visible" ? 8000 : 15000);
    });
  }
  function loadMe() { return api("/api/m/shop/me").then(function (res) { if (res.ok) { S.shop = res.data.shop; S.open = S.shop.open; } }); }
  function onPack() { return /^#\/pack\//.test(location.hash); }
  function count(st) { return S.orders.filter(function (o) { return o.status === st; }).length; }

  /* ---------- ring + full-screen alert for new orders ---------- */
  function alarm() {
    var fresh = S.orders.filter(function (o) { return o.status === "new" && S.seen.indexOf(o.order_id) < 0; });
    if (!fresh.length) { if (S.alarmFor) { S.alarmFor = null; $layer.innerHTML = ""; } FK.ring(false); return; }
    var o = fresh[fresh.length - 1];
    FK.ring(true);
    if (S.alarmFor === o.order_id) return;
    S.alarmFor = o.order_id;
    drawAlarm(o);
  }
  function drawAlarm(o) {
    FK.put($layer, h`<div class="alarm" role="alertdialog" aria-modal="true" aria-labelledby="al-h">
      <span class="wave"></span><span class="wave" style="animation-delay:.6s"></span><span class="wave" style="animation-delay:1.2s"></span>
      <div class="between" style="position:relative;padding:calc(14px + var(--safe-t)) 16px 0"><span class="kicker" style="color:#FFE3D6">${S.shop ? S.shop.name : ""}</span>
        <button class="btn xs ghost-light" data-act="quiet">${icon("sound", 16)}Quiet</button></div>
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;padding-top:32px;text-align:center">
        <span class="bell">${icon("bell", 44)}</span>
        <h1 id="al-h" style="margin:20px 0 0;font:800 40px/44px var(--display);letter-spacing:-.02em">New order</h1>
        <div style="margin-top:6px;font:700 22px/28px var(--body)">${o.ref} · ${FK.rs(o.subtotal)}</div>
        <div class="t14" style="margin-top:4px;font-weight:500;color:#FFE3D6">${o.items.length} ${o.items.length === 1 ? "item" : "items"} · to ${o.area}</div>
      </div>
      <div style="position:relative;margin:20px 16px 0;padding:4px 14px;border-radius:16px;background:#fff;color:var(--ink)">
        ${o.items.map(function (i) { return h`<div class="between" style="min-height:52px;border-top:1px solid var(--line2)"><span class="stack"><b class="t14">${i.name}</b><span class="t12 muted">${i.cut || ""}</span></span><b style="font:800 17px/1 var(--body)">${FK.qty(i.unit, i.qty)}</b></div>`; })}
      </div>
      <div style="position:relative;margin:16px 16px 0"><div class="t14" id="al-r">Packed in</div>
        <div class="grid4" role="radiogroup" aria-labelledby="al-r" style="margin-top:8px">${READY.map(function (m) { return h`<button class="opt" role="radio" aria-checked="${S.ready === m}" data-act="alarm-ready" data-m="${m}">${m} min</button>`; })}</div></div>
      <div style="position:relative;margin-top:auto;padding:16px 16px calc(16px + var(--safe-b))">
        <button class="btn" data-act="alarm-accept" data-id="${o.order_id}" style="height:64px;border-radius:18px;background:#fff;color:var(--orange-d);font-size:19px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.18)">Accept · ready in ${S.ready} min</button>
        <button class="btn" data-act="alarm-look" data-id="${o.order_id}" style="height:48px;margin-top:6px;color:#FFE3D6;font-size:15px">See it, decide later</button>
      </div></div>`);
  }
  function ack(id) { if (S.seen.indexOf(id) < 0) S.seen.push(id); S.seen = S.seen.slice(-200); FK.save("fkp-seen", S.seen); }

  /* ---------- actions ---------- */
  function act(body, okMsg) {
    if (S.busy) return Promise.resolve(false);
    S.busy = true;
    return api("/api/m/shop/order", body).then(function (res) {
      S.busy = false;
      if (!res.ok) { FK.toast(FK.msg(res), true); return false; }
      if (okMsg) FK.toast(okMsg);
      return true;
    });
  }
  function accept(id) {
    ack(id); S.alarmFor = null; $layer.innerHTML = ""; FK.ring(false);
    act({ order_id: id, action: "accept", ready_mins: S.ready }, "Accepted. Ready in " + S.ready + " min.").then(function () { S.sub = "packing"; poll(); });
  }
  function acceptSheet(id) {
    FK.sheet(h`<h2 class="h2" id="rs-l">When will it be packed?</h2><p class="t13 muted" style="margin:4px 0 12px">The rider is sent to arrive just then.</p>
      <div class="grid4" role="radiogroup" aria-labelledby="rs-l">${READY.map(function (m) { return h`<button class="tile-opt" role="radio" aria-checked="${S.ready === m}" data-m="${m}">${m} min</button>`; })}</div>
      <button class="btn green" data-ok style="margin-top:16px">Accept, ready in ${S.ready} min</button>`);
    $layer.querySelectorAll("[data-m]").forEach(function (b) { b.onclick = function () { S.ready = Number(b.dataset.m); acceptSheet(id); }; });
    $layer.querySelector("[data-ok]").onclick = function () { FK.closeSheet(); accept(id); };
  }
  function rejectSheet(id) {
    var pick = 0;
    function draw() {
      FK.sheet(h`<h2 class="h2" id="rj-l">Why can’t you take it?</h2><p class="t13 muted" style="margin:4px 0 12px">The customer sees this, and gets everything else from the other shops.</p>
        <div role="radiogroup" aria-labelledby="rj-l" style="display:flex;flex-direction:column;gap:8px">${REASONS.map(function (r, i) { return h`<button class="tile-opt" role="radio" aria-checked="${pick === i}" data-i="${i}" style="justify-content:flex-start;padding:0 16px">${r}</button>`; })}</div>
        <button class="btn dark" data-ok style="margin-top:16px">Turn down this order</button>`);
      $layer.querySelectorAll("[data-i]").forEach(function (b) { b.onclick = function () { pick = Number(b.dataset.i); draw(); }; });
      $layer.querySelector("[data-ok]").onclick = function () { FK.closeSheet(); ack(id); act({ order_id: id, action: "reject", reason: REASONS[pick] }, "Order turned down").then(poll); };
    }
    draw();
  }

  /* ---------- screens ---------- */
  function loginScreen() {
    $tabs.hidden = true;
    FK.put($view, h`<form class="login" id="lg" novalidate>
      <div class="top"><img src="/img/symbol-white.svg" alt="" width="44" height="42">
        <div class="kicker" style="margin-top:22px;color:var(--lime-t)">FRESCOKART PARTNER</div>
        <h1 class="h1" style="margin-top:10px;font-size:30px;line-height:36px">Orders from your area, on this phone</h1>
        <p class="t14" style="margin:10px 0 0;font-weight:500;color:#CFE8DA">Log in with the shop’s mobile number and the PIN FrescoKart gave you.</p></div>
      <div class="panel">
        <label class="field">Shop’s mobile number<input class="input" name="phone" type="tel" inputmode="numeric" autocomplete="username" maxlength="14" placeholder="10-digit number" required></label>
        <label class="field">PIN<input class="input" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" placeholder="4 to 6 digits" required></label>
        <p class="err" id="lg-err" role="alert" style="margin:10px 0 0"></p>
        <button class="btn green" style="margin-top:12px">Log in</button>
        <p class="hint" style="margin:12px 0 0;text-align:center">New shop, or forgot the PIN? WhatsApp FrescoKart on +91 81578 63503.</p>
      </div></form>`);
    var f = document.getElementById("lg");
    f.onsubmit = function (e) {
      e.preventDefault();
      var phone = f.elements.namedItem("phone").value, pin = f.elements.namedItem("pin").value.trim(), err = document.getElementById("lg-err");
      FK.unlockAudio();
      FK.api("/api/m/login", { body: { role: "shop", phone: phone, pin: pin } }).then(function (res) {
        if (!res.ok) { err.textContent = FK.msg(res); return; }
        S.token = res.data.token; FK.save("fkp-token", S.token);
        S.loaded = false;
        FK.keepAwake(true);
        loadMe().then(function () { render(); poll(); });
      });
    };
  }

  function drawTabs() {
    var n = count("new");
    $tabs.hidden = false;
    FK.put($tabs, h`<a href="#/" ${S.tab === "orders" ? FK.raw('aria-current="page"') : ""} style="position:relative"><span>${icon("receipt", 22)}</span>Orders${n ? h`<b class="badge">${n}</b>` : ""}</a>
      <a href="#/prices" ${S.tab === "prices" ? FK.raw('aria-current="page"') : ""}><span>${icon("tag", 22)}</span>Prices</a>
      <a href="#/today" ${S.tab === "today" ? FK.raw('aria-current="page"') : ""}><span>${icon("cash", 22)}</span>Today</a>`);
  }
  function header(title) {
    return h`<div class="bar"><h1 class="lead">${title}<small>${S.shop ? S.shop.name : ""}</small></h1>
      <button class="chip green" role="switch" aria-checked="${S.open}" data-act="open" style="gap:8px;height:40px;padding:0 6px 0 12px">
        <span style="font-weight:700;color:${S.open ? "var(--green-ink)" : "var(--muted)"}">${S.open ? "Open" : "Closed"}</span><span class="switch" aria-hidden="true" aria-checked="${S.open}" style="width:44px;height:26px"></span></button></div>`;
  }
  function soundStrip() {
    if (FK.audioReady()) return "";
    return h`<button class="note a" data-act="sound" style="width:calc(100% - 32px);text-align:left">${icon("sound", 20)}<span><b>Tap here to turn on the order ring.</b> Phones block sound until you tap once. Keep this app open, with the screen on.</span></button>`;
  }
  function due(o) {
    if (o.status !== "accepted" || !o.accepted_at) return null;
    var left = Math.round((new Date(FK.addMins(o.accepted_at, o.ready_mins || 15)) - Date.now()) / 60000);
    return left < 0 ? ["r", (-left) + " MIN LATE"] : left <= 2 ? ["a", "READY IN " + left + " MIN"] : ["g", "READY IN " + left + " MIN"];
  }

  function ordersScreen() {
    S.tab = "orders"; drawTabs();
    var lists = { new: [], packing: [], ready: [] };
    S.orders.forEach(function (o) {
      if (o.status === "new") lists.new.push(o);
      else if (o.status === "accepted") lists.packing.push(o);
      else if (o.status === "ready" || o.status === "picked" || o.status === "rejected" || o.status === "cancelled") lists.ready.push(o);
    });
    var list = lists[S.sub];
    FK.put($view, h`${header("Orders")}<div class="scroll">
      ${S.open ? "" : h`<div class="note a">${icon("clock", 20)}<span>Your shop is closed, so customers cannot order. Turn it on when you are ready.</span></div>`}
      ${soundStrip()}
      ${FK.install.card({ key: "fkp-install", icon: "/partner/icon-192.png", title: "Install FrescoKart Partner", text: "Opens in one tap, stays logged in, and fills the screen, so new orders are hard to miss.", days: 1 })}
      <div class="seg" role="tablist" aria-label="Orders" style="margin:12px 16px 0">
        ${[["new", "New"], ["packing", "Packing"], ["ready", "Done"]].map(function (t) { return h`<button role="tab" aria-selected="${S.sub === t[0]}" data-act="sub" data-s="${t[0]}">${t[1]} (${t[0] === "ready" ? lists.ready.filter(function (o) { return o.status === "ready"; }).length : lists[t[0]].length})</button>`; })}
      </div>
      ${!S.loaded ? h`<div class="card"><div class="shim" style="height:90px"></div></div>` : !list.length ? h`<div class="empty"><span class="ring">${icon(S.sub === "new" ? "bell" : "box", 28)}</span><b class="h3">${S.sub === "new" ? "No new orders" : S.sub === "packing" ? "Nothing to pack" : "Nothing yet today"}</b><span class="t13 muted">${S.sub === "new" ? "New orders ring here. Keep the app open." : ""}</span></div>`
        : list.map(function (o) { return orderCard(o); })}
    </div>`);
  }
  function orderCard(o) {
    var d = due(o);
    var head = h`<div class="between"><span class="stack"><b class="h3">${o.ref} · ${FK.rs(o.packed_total != null ? o.packed_total : o.subtotal)}</b>
      <span class="t12 muted">${FK.clock(o.created_at)} · to ${o.area}${o.notes ? " · “" + o.notes + "”" : ""}</span></span>
      ${d ? h`<span class="pill ${d[0]}" style="font-family:var(--mono);font-size:11px">${d[1]}</span>` : o.status === "ready" ? h`<span class="pill g">PIN ${o.pin}</span>` : o.status === "picked" ? h`<span class="pill n">Picked up</span>` : o.status === "rejected" ? h`<span class="pill n">Turned down</span>` : o.status === "cancelled" ? h`<span class="pill r">Cancelled</span>` : ""}</div>`;
    var lines = h`${o.items.map(function (i) { return h`<div class="between" style="min-height:44px;border-top:1px solid var(--line2);${i.out ? "color:var(--muted)" : ""}"><span class="stack"><span class="t14" style="${i.out ? "text-decoration:line-through" : ""}">${i.name}</span><span class="t12 muted">${i.cut || ""}</span></span><b class="t14">${i.packed != null && !i.out ? FK.qty(i.unit, i.packed) : FK.qty(i.unit, i.qty)}</b></div>`; })}`;
    var foot = "";
    if (o.status === "new") foot = h`<div class="grid2" style="grid-template-columns:1fr 2fr;margin-top:12px"><button class="btn line" data-act="reject" data-id="${o.order_id}">Reject</button><button class="btn green" data-act="accept" data-id="${o.order_id}">Accept</button></div>`;
    else if (o.status === "accepted") foot = h`<a class="btn green" href="#/pack/${o.order_id}" style="margin-top:12px">${icon("box", 20)}Pack and weigh</a>`;
    else if (o.status === "ready") foot = h`<div class="note g" style="margin:12px 0 0">${icon("key", 18)}<span>${o.rider ? o.rider + " is coming. " : "Finding a rider. "}Hand it over only when the rider shows PIN <b>${o.pin}</b>.</span></div>`;
    return h`<section class="card ${o.status === "new" ? "rise" : ""}" style="${o.status === "new" ? "border:1.5px solid var(--orange)" : ""}">${head}<div style="margin-top:8px">${lines}</div>${foot}</section>`;
  }

  function packScreen(id) {
    S.tab = "orders"; drawTabs();
    var o = S.orders.filter(function (x) { return x.order_id === id; })[0];
    if (!o) { location.hash = "#/"; return; }
    var P = S.pack[id] || (S.pack[id] = {});
    o.items.forEach(function (i) { if (!P[i.id]) P[i.id] = { packed: i.packed != null ? i.packed : i.qty, out: i.out }; });
    var total = o.items.reduce(function (a, i) { return a + (P[i.id].out ? 0 : Math.round(i.price * (Number(P[i.id].packed) || 0))); }, 0);
    var left = o.items.filter(function (i) { return !P[i.id].done && !P[i.id].out; }).length;
    FK.put($view, h`<div class="bar"><a class="icon-btn" href="#/" aria-label="Back to orders">${icon("back", 22)}</a><h1>Pack ${o.ref}<small>${o.items.length} ${o.items.length === 1 ? "item" : "items"} · to ${o.area}</small></h1></div>
      <div class="scroll">
        <div class="note g">${icon("scooter", 20)}<span>Weigh each item after cleaning and enter what you pack. If you pack less, the customer pays less.</span></div>
        ${o.items.map(function (i) {
          var p = P[i.id], kg = i.unit === "kg";
          return h`<section class="card" style="${p.out ? "opacity:.8" : ""}">
            <div class="between"><span class="stack"><b class="h3">${i.name}</b><span class="t13 muted">${i.cut ? i.cut + " · " : ""}ordered ${FK.qty(i.unit, i.qty)} · ${FK.rs(i.price)}${FK.per(i.unit)}</span></span>
              <button role="checkbox" aria-checked="${!!p.done}" aria-label="${i.name} packed" data-act="done" data-i="${i.id}" ${p.out ? FK.raw("disabled") : ""} style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;${p.done ? "background:var(--green);color:#fff" : "border:2px solid #CBD3CE;color:transparent"}">${icon("check", 22, ' stroke-width="3"')}</button></div>
            ${p.out ? h`<div class="note a" style="margin:12px 0 0">${icon("alert", 18)}<span>Marked “can’t send”. The customer is not charged for it.</span></div>`
              : h`<div class="between" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line2)">
                <span class="t13 muted">${FK.rs(Math.round(i.price * (Number(p.packed) || 0)))}</span>
                <span style="display:flex;align-items:center;gap:6px">
                  <button class="btn xs line" data-act="pk-dec" data-i="${i.id}" aria-label="Less">${icon("minus", 16)}</button>
                  ${kg ? h`<label style="display:flex;align-items:center;height:44px;width:112px;border:1px solid #CBD3CE;border-radius:12px;overflow:hidden"><span class="sr">Packed weight of ${i.name} in kg</span><input data-pk="${i.id}" inputmode="decimal" value="${p.packed}" style="width:100%;min-width:0;height:100%;padding:0 4px 0 12px;border:0;outline:0;font:700 17px/1 var(--body)"><span class="t13 muted" style="padding:0 10px 0 2px">kg</span></label>`
                    : h`<b style="min-width:44px;text-align:center;font:800 17px/1 var(--body)">${p.packed}</b>`}
                  <button class="btn xs line" data-act="pk-inc" data-i="${i.id}" aria-label="More">${icon("plus", 16)}</button>
                </span></div>`}
            <button class="link" data-act="out" data-i="${i.id}" style="color:${p.out ? "var(--green)" : "var(--red)"}">${p.out ? "Undo, I can send it" : "Can’t send this"}</button>
          </section>`;
        })}
        <section class="card"><b class="h3">Before you hand it over</b>
          <ul class="t13" style="margin:8px 0 0;padding-left:18px;color:var(--ink2)"><li>Seal each item in its own bag; fish and meat go in the ice bag.</li><li>Write ${o.ref} on the bag.</li><li>Give it only to a rider who shows the pickup PIN.</li></ul></section>
      </div>
      <div class="foot"><div class="t12 muted" style="text-align:center;margin-bottom:8px">${left ? left + (left === 1 ? " item" : " items") + " left to tick" : "All ticked"}</div>
        <button class="btn green split" data-act="ready" data-id="${id}" ${left ? FK.raw("disabled") : ""}><span>Ready for pickup</span><span>${FK.rs(total)}</span></button></div>`);
    $view.querySelectorAll("[data-pk]").forEach(function (inp) {
      inp.onchange = function () { P[Number(inp.dataset.pk)].packed = inp.value.replace(",", "."); packScreen(id); };
    });
  }

  function pricesScreen() {
    S.tab = "prices"; drawTabs();
    if (!S.items) {
      FK.put($view, h`${header("Today’s prices")}<div class="scroll"><div class="card"><div class="shim" style="height:200px"></div></div></div>`);
      api("/api/m/shop/items").then(function (res) { if (res.ok) { S.items = res.data.items; if (S.tab === "prices") pricesScreen(); } });
      return;
    }
    var n = Object.keys(S.edits).length;
    FK.put($view, h`${header("Today’s prices")}<div class="scroll" style="padding-bottom:110px">
      <p class="t13 muted pad" style="margin:12px 0 0">Set prices each morning. Switch an item off when it sells out, and it disappears from the app.</p>
      <section class="card flush" style="margin-top:10px">
        ${S.items.map(function (it) {
          var e = S.edits[it.id] || {}, price = e.price != null ? e.price : it.price, stock = e.in_stock != null ? e.in_stock : it.in_stock;
          var num = Number(price), warn = stock && num && (num >= it.price * 1.6 || num <= it.price * 0.5);
          return h`<div style="padding:12px 0;border-bottom:1px solid var(--line2)">
            <div class="row" style="grid-template-columns:44px minmax(0,1fr) auto;min-height:0">${FK.thumb(Object.assign({}, it, { in_stock: stock }), S.shop && S.shop.kind, "sm")}
              <span class="stack"><b class="t14">${it.name}</b><span class="t12 ${stock ? "muted" : ""}" style="${stock ? "" : "color:var(--red);font-weight:700"}">${stock ? (it.local || "") + (it.local ? " · " : "") + "now " + FK.rs(it.price) + FK.per(it.unit) : "Sold out, hidden from the app"}</span></span>
              <button class="switch" role="switch" aria-checked="${stock}" aria-label="${it.name} in stock" data-act="stock" data-i="${it.id}"></button></div>
            <div style="display:flex;align-items:center;gap:8px;margin:10px 0 0 54px">
              <button class="btn xs line" data-act="p-dec" data-i="${it.id}" aria-label="₹10 less for ${it.name}" ${stock ? "" : FK.raw("disabled")} style="width:52px;height:44px">−10</button>
              <label style="flex:1;display:flex;align-items:center;height:44px;border:1px solid ${warn ? "#E0A040" : "#CBD3CE"};border-radius:10px;overflow:hidden;background:${stock ? "#fff" : "var(--surface)"}">
                <span style="padding:0 2px 0 12px;font-weight:600;color:var(--muted)">₹</span><span class="sr">Price for ${it.name}</span>
                <input data-price="${it.id}" inputmode="numeric" value="${price}" ${stock ? "" : FK.raw("disabled")} style="width:100%;min-width:0;height:100%;border:0;outline:0;background:transparent;font:700 16px/1 var(--body)">
                <span class="t12 muted" style="padding:0 12px 0 4px">${FK.per(it.unit).trim()}</span></label>
              <button class="btn xs line" data-act="p-inc" data-i="${it.id}" aria-label="₹10 more for ${it.name}" ${stock ? "" : FK.raw("disabled")} style="width:52px;height:44px">+10</button></div>
            ${warn ? h`<div class="note a" style="margin:8px 0 0 54px;padding:8px 10px">${icon("alert", 16)}<span style="flex:1">${FK.rs(num)} is far from ${FK.rs(it.price)}. A typo?</span><button class="btn xs line" data-act="p-undo" data-i="${it.id}">Undo</button></div>` : ""}
          </div>`;
        })}
        <button class="link" data-act="add-item" style="min-height:56px">${icon("plus", 18)}Add an item</button>
      </section></div>
      <div class="foot" style="position:absolute;left:0;right:0;bottom:calc(68px + var(--safe-b))"><button class="btn green" data-act="save" ${n ? "" : FK.raw("disabled")}>${n ? "Save " + n + (n === 1 ? " change" : " changes") : "No changes to save"}</button></div>`);
    $view.querySelectorAll("[data-price]").forEach(function (inp) {
      inp.onchange = function () { edit(Number(inp.dataset.price), { price: inp.value.replace(/[^\d.]/g, "") }); };
    });
  }
  function edit(id, patch) {
    var it = S.items.filter(function (x) { return x.id === id; })[0];
    var e = Object.assign({}, S.edits[id] || {}, patch);
    if (e.price != null && Number(e.price) === it.price) delete e.price;
    if (e.in_stock != null && e.in_stock === it.in_stock) delete e.in_stock;
    if (Object.keys(e).length) S.edits[id] = e; else delete S.edits[id];
    pricesScreen();
  }
  function addItemSheet() {
    FK.sheet(h`<form id="ai"><h2 class="h2">Add an item</h2>
      <label class="field" style="margin-top:12px">Name<input class="input" name="iname" maxlength="60" required placeholder="For example, Anchovy"></label>
      <label class="field">Local name (helps people search)<input class="input" name="local" maxlength="60" placeholder="Netholi"></label>
      <div class="grid2" style="margin-top:12px"><label class="field">Sold by<select class="input" name="unit"><option value="kg">Per kg</option><option value="each">Each</option><option value="pack">Per pack</option><option value="bunch">Per bunch</option></select></label>
      <label class="field">Price (₹)<input class="input" name="price" inputmode="numeric" required></label></div>
      <label class="field">Section<input class="input" name="section" maxlength="40" placeholder="Fish"></label>
      <label class="field">Cuts, separated by commas (optional)<input class="input" name="cuts" maxlength="120" placeholder="Whole, cleaned, Curry cut"></label>
      <button class="btn green" style="margin-top:16px">Add to my shop</button></form>`);
    var f = document.getElementById("ai");
    f.onsubmit = function (e) {
      e.preventDefault();
      var g = function (n) { return f.elements.namedItem(n).value.trim(); };
      api("/api/m/shop/items", { add: { name: g("iname"), local: g("local"), unit: g("unit"), price: Number(g("price")), section: g("section"),
        cuts: g("cuts") ? g("cuts").split(",").map(function (x) { return x.trim(); }).filter(Boolean) : [] } }).then(function (res) {
        if (!res.ok) { FK.toast(FK.msg(res), true); return; }
        FK.closeSheet(); FK.toast("Added. It shows in the app now."); S.items = null; pricesScreen();
      });
    };
  }

  function todayScreen() {
    S.tab = "today"; drawTabs();
    var t = S.shop ? S.shop.today : null;
    FK.put($view, h`${header("Today")}<div class="scroll">
      <section class="card dark"><div class="kicker" style="color:var(--lime)">${new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }).toUpperCase()}</div>
        <div style="margin-top:10px;font:700 34px/40px var(--body)">${t ? FK.rs(t.sales) : "—"}</div>
        <div class="t13" style="color:#CFE8DA">${t ? t.orders + (t.orders === 1 ? " order" : " orders") + " picked up" + (t.rejected ? " · " + t.rejected + " turned down" : "") : ""}</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.14)">
          <div class="sum" style="color:#E2F2E8"><span>FrescoKart fee, ${S.shop ? S.shop.fee_pct : 10}%</span><b style="color:#fff">${t ? "−" + FK.rs(t.fee) : ""}</b></div>
          <div class="sum" style="color:#E2F2E8"><span>Your payout</span><b style="color:#fff">${t ? FK.rs(t.payout) : ""}</b></div></div></section>
      <div class="note s">${icon("clock", 20)}<span>Pilot payouts reach your bank the next morning. Your statement comes on WhatsApp.</span></div>
      <section class="card flush" style="margin-top:12px">
        ${FK.install.possible() ? h`<button class="row" data-act="install" style="width:100%;text-align:left">${icon("box", 20)}<span class="t14">Add this app to the home screen</span>${icon("next", 18)}</button>` : ""}
        <a class="row" href="${FK.tel("+918157863503")}">${icon("phone", 20)}<span class="t14">Call FrescoKart</span>${icon("next", 18)}</a>
        <button class="row" data-act="logout" style="width:100%;text-align:left;color:var(--muted)">${icon("logout", 20)}<span class="t14">Log out of this phone</span><span></span></button>
      </section></div>`);
    loadMe().then(function () { if (S.tab === "today" && location.hash === "#/today") { var t2 = S.shop && S.shop.today; if (t2 && (!t || t2.sales !== t.sales || t2.orders !== t.orders)) todayScreen(); } });
  }

  /* ---------- events ---------- */
  document.getElementById("app").addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var a = t.dataset.act, id = Number(t.dataset.id), iid = Number(t.dataset.i);
    FK.unlockAudio();
    if (a === "install") { FK.install.run("FrescoKart Partner", "/partner/icon-192.png"); return; }
    if (a === "install-later") { FK.install.later(t.dataset.key, Number(t.dataset.days) || 1); render(); return; }
    if (a === "sound") { FK.chime(false); FK.keepAwake(true); render(); }
    else if (a === "open") {
      api("/api/m/shop/open", { open: !S.open }).then(function (res) { if (res.ok) { S.open = res.data.open; FK.toast(S.open ? "Open. Customers can order now." : "Closed. Customers cannot order."); render(); } else FK.toast(FK.msg(res), true); });
    }
    else if (a === "sub") { S.sub = t.dataset.s; render(); }
    else if (a === "accept") acceptSheet(id);
    else if (a === "reject") rejectSheet(id);
    else if (a === "quiet") { FK.ring(false); setTimeout(function () { alarm(); }, 30000); }
    else if (a === "alarm-ready") { S.ready = Number(t.dataset.m); var o = S.orders.filter(function (x) { return x.order_id === S.alarmFor; })[0]; if (o) drawAlarm(o); }
    else if (a === "alarm-accept") accept(id);
    else if (a === "alarm-look") { ack(id); S.alarmFor = null; $layer.innerHTML = ""; FK.ring(false); S.sub = "new"; location.hash = "#/"; render(); alarm(); }
    else if (a === "done" || a === "out" || a === "pk-inc" || a === "pk-dec") {
      var oid = Number(location.hash.split("/")[2]), P = S.pack[oid], o2 = S.orders.filter(function (x) { return x.order_id === oid; })[0];
      var item = o2 && o2.items.filter(function (x) { return x.id === iid; })[0];
      if (!P || !item) return;
      var p = P[iid];
      if (a === "done") p.done = !p.done;
      if (a === "out") { p.out = !p.out; p.done = false; }
      if (a === "pk-inc" || a === "pk-dec") {
        var step = item.unit === "kg" ? 0.05 : 1, v = (Number(p.packed) || 0) + (a === "pk-inc" ? step : -step);
        var max = item.unit === "kg" ? Math.round(item.qty * 1.1 * 100) / 100 : item.qty;
        p.packed = Math.round(Math.min(max, Math.max(item.unit === "kg" ? 0.05 : 1, v)) * 100) / 100;
      }
      packScreen(oid);
    }
    else if (a === "ready") {
      var P2 = S.pack[id], o3 = S.orders.filter(function (x) { return x.order_id === id; })[0];
      if (!P2 || !o3) return;
      var items = o3.items.map(function (i) { return { id: i.id, out: !!P2[i.id].out, packed: Number(P2[i.id].packed) }; });
      act({ order_id: id, action: "ready", items: items }, "Ready. Hand it over when the rider shows PIN " + o3.pin + ".").then(function (ok) {
        if (ok) { delete S.pack[id]; S.sub = "ready"; location.hash = "#/"; poll(); }
      });
    }
    else if (a === "stock") { var it = S.items.filter(function (x) { return x.id === iid; })[0], cur = S.edits[iid] && S.edits[iid].in_stock != null ? S.edits[iid].in_stock : it.in_stock; edit(iid, { in_stock: !cur }); }
    else if (a === "p-inc" || a === "p-dec") { var it2 = S.items.filter(function (x) { return x.id === iid; })[0], pr = S.edits[iid] && S.edits[iid].price != null ? Number(S.edits[iid].price) : it2.price; edit(iid, { price: String(Math.max(1, pr + (a === "p-inc" ? 10 : -10))) }); }
    else if (a === "p-undo") { var e2 = S.edits[iid]; if (e2) { delete e2.price; if (!Object.keys(e2).length) delete S.edits[iid]; } pricesScreen(); }
    else if (a === "add-item") addItemSheet();
    else if (a === "save") {
      var changes = Object.keys(S.edits).map(function (k) { var e3 = S.edits[k], c = { id: Number(k) }; if (e3.price != null) c.price = Number(e3.price); if (e3.in_stock != null) c.in_stock = e3.in_stock; return c; });
      api("/api/m/shop/items", { changes: changes }).then(function (res) {
        if (!res.ok) { FK.toast(FK.msg(res), true); return; }
        S.edits = {}; S.items = null; FK.toast("Saved. Customers see the new prices now."); pricesScreen();
      });
    }
    else if (a === "logout") { if (confirm("Log out? New orders will not ring on this phone.")) logout(); }
  });

  function render() {
    if (!S.token) return loginScreen();
    var r = location.hash.replace(/^#\/?/, "").split("/");
    if (r[0] === "pack") return packScreen(Number(r[1]));
    if (r[0] === "prices") return pricesScreen();
    if (r[0] === "today") return todayScreen();
    return ordersScreen();
  }
  window.addEventListener("hashchange", function () { FK.closeSheet(); render(); var sc = $view.querySelector(".scroll"); if (sc) sc.scrollTop = 0; });
  FK.watchNet();
  FK.registerSW("/partner/sw.js", "/partner/");
  FK.install.onChange = function () { if (S.token && S.tab !== "prices" && !onPack()) render(); };
  if (S.token) { FK.keepAwake(true); loadMe().then(function () { render(); }); poll(); }
  render();
})();
