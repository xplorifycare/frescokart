/* FrescoKart customer app for the shops pilot: browse shops near you, one basket from several shops,
   pay the rider on delivery, follow the order live. Talks to /api/m/*. */
(function () {
  "use strict";
  var h = FK.html, icon = FK.icon;
  var $view = document.getElementById("view"), $float = document.getElementById("float"), $tabs = document.getElementById("tabs");

  var S = {
    cat: null, loadErr: false,
    area: FK.load("fkm-area", ""),
    basket: FK.load("fkm-basket", {}),         // {item_id: {q, cut}}
    profile: FK.load("fkm-profile", {}),       // {name, phone, address}
    orders: FK.load("fkm-orders", []),         // [{id, t, ref, code, at, total, shops, status}]
    kind: "all", q: "", placing: false
  };
  var byId = {};
  var pollTimer = null;

  function saveBasket() { FK.save("fkm-basket", S.basket); }
  function shopOf(id) { return S.cat && S.cat.shops.filter(function (s) { return s.id === id; })[0]; }

  /* ---------- data ---------- */
  function loadCatalog() {
    return FK.api("/api/m/catalog").then(function (res) {
      if (!res.ok) { S.loadErr = true; return; }
      S.loadErr = false;
      S.cat = res.data;
      byId = {};
      S.cat.shops.forEach(function (s) { s.items.forEach(function (it) { byId[it.id] = { item: it, shop: s }; }); });
      if (!S.area || S.cat.areas.indexOf(S.area) < 0) S.area = S.cat.areas[0];
      Object.keys(S.basket).forEach(function (k) { if (!byId[k]) delete S.basket[k]; });
      saveBasket();
    });
  }

  function basketLines() {
    var groups = {};
    Object.keys(S.basket).forEach(function (k) {
      var ref = byId[k];
      if (!ref) return;
      var b = S.basket[k], g = groups[ref.shop.id] || (groups[ref.shop.id] = { shop: ref.shop, lines: [], subtotal: 0 });
      var line = Math.round(ref.item.price * b.q);
      g.lines.push({ item: ref.item, q: b.q, cut: b.cut, line: line });
      g.subtotal += line;
    });
    var list = Object.keys(groups).map(function (k) { return groups[k]; });
    var subtotal = list.reduce(function (a, g) { return a + g.subtotal; }, 0);
    var count = Object.keys(S.basket).filter(function (k) { return byId[k]; }).length;
    var f = S.cat ? S.cat.fees : { delivery: 30, extra_shop: 10, free_over: 1599 };
    var fee = !list.length || subtotal >= f.free_over ? 0 : f.delivery + f.extra_shop * (list.length - 1);
    return { groups: list, subtotal: subtotal, count: count, fee: fee, total: subtotal + fee, freeOver: f.free_over };
  }

  /* ---------- basket changes ---------- */
  function setQty(id, q, cut) {
    var ref = byId[id];
    if (!ref) return;
    if (q <= 0) delete S.basket[id];
    else S.basket[id] = { q: Math.round(q * 100) / 100, cut: cut != null ? cut : (S.basket[id] && S.basket[id].cut) || "" };
    saveBasket();
  }
  function stepFor(unit) { return unit === "kg" ? 0.25 : 1; }

  /* ---------- pieces ---------- */
  function shopThumb(s, cls) {
    if (s.kind === "fish") return h`<span class="thumb ${cls || ""}${s.open ? "" : " out"}"><img src="/img/weighing.webp" alt=""></span>`;
    return h`<span class="thumb k-${s.kind} ${cls || ""}${s.open ? "" : " out"}">${icon(s.kind, cls === "lg" ? 34 : 28)}</span>`;
  }
  function control(it, shop) {
    var b = S.basket[it.id];
    if (!it.in_stock) return h`<button class="add" disabled>SOLD OUT</button>`;
    if (!shop.open) return h`<button class="add" disabled>CLOSED</button>`;
    if (!b) return h`<button class="add" data-act="add" data-id="${it.id}" aria-label="Add ${it.name}">ADD</button>`;
    return h`<span class="stepper" role="group" aria-label="${it.name} amount">
      <button data-act="dec" data-id="${it.id}" aria-label="Less ${it.name}">${icon("minus", 16, ' stroke-width="2.8"')}</button>
      <span aria-live="polite">${FK.qty(it.unit, b.q)}</span>
      <button data-act="inc" data-id="${it.id}" aria-label="More ${it.name}">${icon("plus", 16, ' stroke-width="2.8"')}</button></span>`;
  }
  function itemRow(it, shop, showShop) {
    var b = S.basket[it.id];
    var sub = showShop ? shop.name : (it.cuts.length ? it.cuts.slice(0, 3).join(" · ") : "");
    return h`<div class="row" style="grid-template-columns:64px minmax(0,1fr) auto;padding:12px 0">
      ${FK.thumb(it, shop.kind)}
      <span class="stack">
        <span class="h3" style="font-size:15px;line-height:20px">${it.name}${it.local ? h` <span class="muted" style="font-weight:500">· ${it.local}</span>` : ""}</span>
        ${sub ? h`<span class="t12 muted">${sub}</span>` : ""}
        <span class="t14"><b>${FK.rs(it.price)}</b><span class="muted" style="font-weight:500">${FK.per(it.unit)}</span></span>
        ${b && b.cut ? h`<span class="t12" style="color:var(--green-ink);font-weight:700">${b.cut}</span>` : ""}
      </span>
      ${control(it, shop)}
    </div>`;
  }

  function floatBar() {
    var B = basketLines(), route = location.hash;
    if (!B.count || /basket|checkout|order\//.test(route)) { $float.innerHTML = ""; return; }
    FK.put($float, h`<a href="#/basket" class="rise" style="position:absolute;left:16px;right:16px;bottom:calc(${$tabs.hidden ? 16 : 84}px + var(--safe-b));z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;height:60px;padding:0 8px 0 16px;border-radius:16px;background:var(--green);color:#fff;box-shadow:0 10px 24px rgba(0,107,72,.32)">
      <span class="stack"><span style="font:800 15px/20px var(--body)">${B.count} ${B.count === 1 ? "item" : "items"} · ${FK.rs(B.subtotal)}</span>
      <span class="t12" style="color:#D9F2DD">${B.groups.length === 1 ? "From " + B.groups[0].shop.name : "From " + B.groups.length + " shops, one delivery"}</span></span>
      <span style="display:flex;align-items:center;gap:6px;height:44px;padding:0 14px;border-radius:12px;background:var(--green-d);font:700 15px/1 var(--body)">View basket${icon("next", 18)}</span></a>`);
  }
  function tabs(active) {
    var live = S.orders.filter(function (o) { return ["delivered", "cancelled"].indexOf(o.status) < 0; }).length;
    $tabs.hidden = false;
    FK.put($tabs, h`<a href="#/" ${active === "home" ? FK.raw('aria-current="page"') : ""}><span>${icon("home", 22)}</span>Home</a>
      <a href="#/orders" style="position:relative" ${active === "orders" ? FK.raw('aria-current="page"') : ""}><span>${icon("receipt", 22)}</span>Orders${live ? h`<b class="badge">${live}</b>` : ""}</a>`);
  }

  /* ---------- screens ---------- */
  function home() {
    tabs("home");
    if (!S.cat) {
      FK.put($view, h`<div class="bar green"><h1 class="lead">FrescoKart</h1></div><div class="scroll">
        ${S.loadErr ? h`<div class="empty"><span class="ring">${icon("refresh", 30)}</span><b class="h3">Could not load the shops</b><span class="t13 muted">Check your internet.</span><button class="btn sm green" data-act="reload">Try again</button></div>`
          : h`<div class="pad" style="padding-top:20px">${[1, 2, 3, 4].map(function () { return h`<div class="row" style="grid-template-columns:88px 1fr;padding:12px 0"><span class="shim" style="width:88px;height:88px;border-radius:16px"></span><span class="stack" style="gap:8px"><span class="shim" style="height:14px;width:70%"></span><span class="shim" style="height:12px;width:45%"></span></span></div>`; })}</div>`}</div>`);
      return;
    }
    var kinds = [["all", "All"], ["fish", "Fish"], ["meat", "Meat"], ["veg", "Vegetables"], ["grocery", "Groceries"]];
    var shops = S.cat.shops.filter(function (s) { return S.kind === "all" || s.kind === S.kind; });
    var q = S.q.trim().toLowerCase(), hits = [];
    if (q) S.cat.shops.forEach(function (s) { s.items.forEach(function (it) { if ((it.name + " " + it.local + " " + s.name).toLowerCase().indexOf(q) >= 0) hits.push([it, s]); }); });
    FK.put($view, h`
      <header style="flex:0 0 auto;padding:calc(10px + var(--safe-t)) 16px 16px;background:var(--green);color:#fff;border-radius:0 0 24px 24px">
        <div class="between">
          <button data-act="area" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:48px;color:#fff;text-align:left" aria-label="Delivery area ${S.area}, change">
            <span style="display:flex;align-items:center;gap:6px;font:800 22px/1.1 var(--display);letter-spacing:-.02em">${icon("pin", 20, ' stroke="#A8E63D"')}${S.area}${icon("next", 16, ' style="transform:rotate(90deg)"')}</span>
            <span class="t13" style="color:#D9F2DD">Pay the rider when it arrives</span></button>
          <img src="/img/symbol-white.svg" alt="FrescoKart" width="34" height="32">
        </div>
        <label style="display:flex;align-items:center;gap:10px;height:50px;margin-top:14px;padding:0 14px;border-radius:14px;background:#fff;color:var(--ink);box-shadow:0 6px 16px rgba(0,40,26,.18)">
          ${icon("search", 20, ' style="color:var(--green)"')}<span class="sr">Search</span>
          <input id="q" type="search" value="${S.q}" placeholder="Search fish, chicken, tomato or a shop" autocomplete="off" style="flex:1;min-width:0;height:44px;border:0;outline:0;background:transparent;font:500 15px/1 var(--body)">
        </label>
      </header>
      <div class="scroll white" style="padding-bottom:110px">
        ${q ? h`<div class="pad"><div class="sechead" style="padding:16px 0 4px"><h2 class="h2">${hits.length ? hits.length + " found" : "Nothing found"}</h2></div>
          ${hits.length ? hits.slice(0, 40).map(function (x) { return itemRow(x[0], x[1], true); }) : h`<p class="t13 muted">No shop near you lists “${S.q}” yet. Try a shorter word.</p>`}</div>`
        : h`${FK.install.card({ key: "fkm-install", icon: "/app/icon-192.png", title: "Get the FrescoKart app", text: "Add it to your home screen. Free, opens in one tap.", days: 14 })}
          <div class="rail" role="tablist" aria-label="Show" style="padding-top:16px">${kinds.map(function (k) { return h`<button class="chip" role="tab" aria-selected="${S.kind === k[0]}" data-act="kind" data-k="${k[0]}">${k[1]}</button>`; })}</div>
          <div class="sechead"><h2 class="h2">Shops near you</h2><span class="t12 muted">${shops.filter(function (s) { return s.open; }).length} open now</span></div>
          <div class="pad">${shops.length ? shops.map(function (s) {
            return h`<a href="#/shop/${s.id}" class="row" style="grid-template-columns:88px minmax(0,1fr);padding:12px 0;${s.open ? "" : "opacity:.75"}">
              ${shopThumb(s, "lg")}
              <span class="stack" style="gap:4px"><span class="h3">${s.name}</span>
                <span class="t13 muted">${FK.kindName[s.kind]} · ${s.area}</span>
                <span class="t12" style="font-weight:700;color:${s.open ? "var(--green-ink)" : "var(--amber-2)"}">${s.open ? s.items.filter(function (i) { return i.in_stock; }).length + " items today" : "Closed now"}${s.min_order ? " · min. order " + FK.rs(s.min_order) : ""}</span></span></a>`;
          }) : h`<div class="empty"><span class="ring">${icon("store", 30)}</span><b class="h3">No shops here yet</b><span class="t13 muted">Shops in ${S.area} are joining. Check back soon.</span></div>`}</div>
          <div class="note s" style="margin-top:20px">${icon("scooter", 20)}<span>One rider brings everything together. Fish is weighed at the shop; you pay for what is packed.</span></div>`}
      </div>`);
    var input = document.getElementById("q");
    input.oninput = function () { S.q = input.value; var pos = input.selectionStart; home(); var n = document.getElementById("q"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } };
    floatBar();
  }

  function shopScreen(id) {
    $tabs.hidden = true;
    var s = shopOf(id);
    if (!s) { location.hash = "#/"; return; }
    var sections = [];
    s.items.forEach(function (it) { var sec = it.section || "More"; if (sections.indexOf(sec) < 0) sections.push(sec); });
    FK.put($view, h`<div class="bar"><a class="icon-btn" href="#/" aria-label="Back">${icon("back", 22)}</a>
      <h1>${s.name}<small>${FK.kindName[s.kind]} · ${s.area}</small></h1></div>
      <div class="scroll white" style="padding-bottom:100px">
        ${s.open ? "" : h`<div class="note a">${icon("clock", 20)}<span>This shop is closed now. You can look, and order when it opens.</span></div>`}
        ${s.address ? h`<p class="t13 muted pad" style="margin:12px 0 0">${icon("pin", 14, ' style="vertical-align:-2px"')} ${s.address}${s.min_order ? " · min. order " + FK.rs(s.min_order) : ""}</p>` : ""}
        ${sections.map(function (sec) {
          return h`<div class="sechead"><h2 class="h2">${sec}</h2></div><div class="pad">${s.items.filter(function (it) { return (it.section || "More") === sec; }).map(function (it) { return itemRow(it, s, false); })}</div>`;
        })}
      </div>`);
    floatBar();
  }

  function addSheet(id) {
    var ref = byId[id];
    if (!ref) return;
    var it = ref.item, cur = S.basket[id] || {};
    var pick = { cut: cur.cut || it.cuts[0] || "", q: cur.q || (it.unit === "kg" ? (it.price > 600 ? 0.5 : 1) : 1) };
    function draw() {
      var weights = it.unit === "kg" ? [0.25, 0.5, 1, 1.5, 2] : [1, 2, 3, 4];
      FK.sheet(h`<div class="row" style="grid-template-columns:64px minmax(0,1fr);min-height:0;padding-bottom:12px">${FK.thumb(it, ref.shop.kind)}
          <span class="stack"><span class="h2">${it.name}</span><span class="t13 muted">${it.local ? it.local + " · " : ""}${FK.rs(it.price)}${FK.per(it.unit)} · ${ref.shop.name}</span></span></div>
        ${it.cuts.length ? h`<div class="t14" id="cut-l" style="margin-top:8px">How should they cut it?</div>
          <div class="grid3" role="radiogroup" aria-labelledby="cut-l" style="margin-top:8px">${it.cuts.map(function (c) { return h`<button class="tile-opt" role="radio" aria-checked="${pick.cut === c}" data-cut="${c}">${c}</button>`; })}</div>` : ""}
        <div class="t14" id="w-l" style="margin-top:16px">${it.unit === "kg" ? "How much?" : "How many?"}</div>
        <div class="${it.unit === "kg" ? "grid3" : "grid4"}" role="radiogroup" aria-labelledby="w-l" style="margin-top:8px">${weights.map(function (w) { return h`<button class="tile-opt" role="radio" aria-checked="${pick.q === w}" data-w="${w}">${FK.qty(it.unit, w)}</button>`; })}</div>
        ${it.unit === "kg" ? h`<p class="hint" style="margin:12px 0 0">Weighed before cleaning. If the shop packs a little less, you pay less.</p>` : ""}
        <button class="btn orange split" data-ok style="margin-top:16px"><span>${FK.rs(Math.round(it.price * pick.q))}</span><span>${cur.q ? "Update basket" : "Add to basket"}</span></button>`);
      var layer = document.getElementById("layer");
      layer.querySelectorAll("[data-cut]").forEach(function (b) { b.onclick = function () { pick.cut = b.dataset.cut; draw(); }; });
      layer.querySelectorAll("[data-w]").forEach(function (b) { b.onclick = function () { pick.q = Number(b.dataset.w); draw(); }; });
      layer.querySelector("[data-ok]").onclick = function () { setQty(id, pick.q, pick.cut); FK.closeSheet(); render(); FK.toast(it.name + " added"); };
    }
    draw();
  }

  function basket() {
    $tabs.hidden = true;
    var B = basketLines();
    if (!B.count) {
      FK.put($view, h`<div class="bar"><a class="icon-btn" href="#/" aria-label="Back">${icon("back", 22)}</a><h1>Basket</h1></div>
        <div class="scroll white"><div class="empty"><span class="ring">${icon("basket", 30)}</span><b class="h3">Your basket is empty</b>
        <span class="t13 muted">Add fish, meat or vegetables from shops near you.</span><a class="btn sm green" href="#/">See shops</a></div></div>`);
      floatBar();
      return;
    }
    var closed = B.groups.filter(function (g) { return !g.shop.open; });
    var gap = B.freeOver - B.subtotal;
    FK.put($view, h`<div class="bar"><a class="icon-btn" href="#/" aria-label="Back">${icon("back", 22)}</a>
      <h1>Basket<small>${B.count} ${B.count === 1 ? "item" : "items"} from ${B.groups.length} ${B.groups.length === 1 ? "shop" : "shops"} · one delivery</small></h1></div>
      <div class="scroll">
        <div class="card" style="padding:14px 16px">
          <div class="t13 b">${gap > 0 ? "Add " + FK.rs(gap) + " more for free delivery" : "Free delivery unlocked"}</div>
          <div style="height:6px;margin-top:8px;border-radius:3px;background:var(--line2)"><div style="height:6px;border-radius:3px;background:${gap > 0 ? "var(--orange)" : "var(--green)"};width:${Math.min(100, Math.round(B.subtotal / B.freeOver * 100))}%"></div></div>
        </div>
        ${B.groups.map(function (g) {
          return h`<section class="card" style="padding:4px 16px 8px" aria-label="${g.shop.name}">
            <div class="between" style="padding:10px 0 2px"><span class="stack"><b class="h3">${g.shop.name}</b><span class="t12 muted">${FK.kindName[g.shop.kind]}</span></span><span class="t14">${FK.rs(g.subtotal)}</span></div>
            ${g.shop.open ? "" : h`<div class="note r" style="margin:8px 0">${icon("alert", 18)}<span>Closed now. Remove these items to order the rest.</span></div>`}
            ${g.lines.map(function (l) { return itemRow(l.item, g.shop, false); })}
            ${g.shop.min_order && g.subtotal < g.shop.min_order ? h`<div class="note a" style="margin:4px 0 8px">Add ${FK.rs(g.shop.min_order - g.subtotal)} more from this shop (min. order ${FK.rs(g.shop.min_order)}).</div>` : ""}
          </section>`;
        })}
        <section class="card" aria-label="Bill" style="display:flex;flex-direction:column;gap:10px">
          <b class="h3">Bill</b>
          <div class="sum"><span>Items</span><span>${FK.rs(B.subtotal)}</span></div>
          <div class="sum"><span>Delivery${B.groups.length > 1 ? " from " + B.groups.length + " shops" : ""}</span><span>${B.fee ? FK.rs(B.fee) : "Free"}</span></div>
          <div class="dash"></div>
          <div class="sum total"><span>About</span><span>${FK.rs(B.total)}</span></div>
          <span class="hint">The final amount follows what each shop packs and weighs. The rider tells you before you pay.</span>
        </section>
      </div>
      <div class="foot"><button class="btn orange split" data-act="checkout" ${closed.length ? FK.raw("disabled") : ""}><span>${FK.rs(B.total)}</span><span style="display:flex;align-items:center;gap:6px">Continue${icon("next", 18)}</span></button></div>`);
    floatBar();
  }

  function checkout() {
    $tabs.hidden = true;
    var B = basketLines();
    if (!B.count) { location.hash = "#/basket"; return; }
    var p = S.profile;
    var pay = p.pay || "cash";
    FK.put($view, h`<div class="bar"><a class="icon-btn" href="#/basket" aria-label="Back to basket">${icon("back", 22)}</a><h1>Checkout<small>Pay the rider when it arrives</small></h1></div>
      <form class="scroll" id="co" novalidate>
        <section class="card">
          <b class="h3">Deliver to</b>
          <button type="button" class="chip" data-act="area" style="margin-top:10px">${icon("pin", 16)}${S.area}</button>
          <label class="field" style="margin-top:12px">House or flat, street and a landmark<textarea class="input" name="address" rows="3" maxlength="240" required placeholder="Flat 4B, Sea Breeze Apartments, Pipeline Road, near the water tank">${p.address || ""}</textarea></label>
          <label class="field">Your name<input class="input" name="name" maxlength="60" autocomplete="name" value="${p.name || ""}"></label>
          <label class="field">Mobile number<input class="input" name="phone" type="tel" inputmode="numeric" maxlength="14" autocomplete="tel" required placeholder="10-digit number" value="${p.phone || ""}"></label>
          <label class="field">Note for the shops and the rider (optional)<input class="input" name="notes" maxlength="200" placeholder="For example, call when you arrive" value="${p.notes || ""}"></label>
        </section>
        <section class="card">
          <b class="h3" id="pay-l">Pay the rider with</b>
          <div class="grid2" role="radiogroup" aria-labelledby="pay-l" style="margin-top:10px">
            <button type="button" class="tile-opt" role="radio" aria-checked="${pay === "cash"}" data-pay="cash">Cash</button>
            <button type="button" class="tile-opt" role="radio" aria-checked="${pay === "upi"}" data-pay="upi">UPI on delivery</button>
          </div>
          <p class="hint" style="margin:10px 0 0">Online payment comes later in the pilot. Pay only the amount shown in the app.</p>
        </section>
        <section class="card" style="display:flex;flex-direction:column;gap:10px">
          ${B.groups.map(function (g) { return h`<div class="sum"><span>${g.shop.name}</span><span>${FK.rs(g.subtotal)}</span></div>`; })}
          <div class="sum"><span>Delivery</span><span>${B.fee ? FK.rs(B.fee) : "Free"}</span></div>
          <div class="dash"></div><div class="sum total"><span>About</span><span>${FK.rs(B.total)}</span></div>
        </section>
        <label class="check card" style="padding:14px 16px"><input type="checkbox" name="consent" ${p.consent ? FK.raw("checked") : ""}><span>The shops, the rider and FrescoKart may call or message me about this order.</span></label>
        <p id="co-err" class="err pad" role="alert" style="margin:12px 0 0"></p>
      </form>
      <div class="foot"><button class="btn orange split" data-act="place"><span>${FK.rs(B.total)}</span><span>${S.placing ? "Placing…" : "Place order"}</span></button></div>`);
    $view.querySelectorAll("[data-pay]").forEach(function (b) {
      b.onclick = function () { S.profile.pay = b.dataset.pay; $view.querySelectorAll("[data-pay]").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); }); };
    });
    floatBar();
  }

  function formValues() {
    var f = document.getElementById("co");
    if (!f) return null;
    var el = function (n) { return f.elements.namedItem(n); };  // f.name would be the form's own name, so go through elements
    return { f: f, el: el, d: { name: el("name").value.trim(), phone: el("phone").value.trim(), address: el("address").value.trim(),
      notes: el("notes").value.trim(), consent: el("consent").checked } };
  }
  function keepForm() { var v = formValues(); if (v) { S.profile = Object.assign({}, S.profile, v.d); FK.save("fkm-profile", S.profile); } }

  function place() {
    if (S.placing) return;
    var v = formValues(), err = document.getElementById("co-err");
    if (!v) return;
    var d = v.d, f = { phone: v.el("phone"), address: v.el("address") };
    var pay = S.profile.pay || "cash";
    S.profile = Object.assign({}, S.profile, d, { pay: pay });
    FK.save("fkm-profile", S.profile);
    var digits = d.phone.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
    f.phone.classList.toggle("bad", !/^[6-9]\d{9}$/.test(digits));
    f.address.classList.toggle("bad", d.address.length < 6);
    if (d.address.length < 6) { err.textContent = "Add your house or flat number and street."; f.address.focus(); return; }
    if (!/^[6-9]\d{9}$/.test(digits)) { err.textContent = "Enter a 10-digit mobile number."; f.phone.focus(); return; }
    if (!d.consent) { err.textContent = "Tick the box so the shop and the rider can reach you."; return; }
    err.textContent = "";
    var items = Object.keys(S.basket).filter(function (k) { return byId[k]; }).map(function (k) { return { item_id: Number(k), qty: S.basket[k].q, cut: S.basket[k].cut || "" }; });
    S.placing = true;
    var btn = $view.querySelector("[data-act=place]");
    btn.disabled = true; btn.lastElementChild.textContent = "Placing…";
    FK.api("/api/m/orders", { body: { name: d.name, phone: digits, area: S.area, address: d.address, notes: d.notes, consent: true, pay_mode: pay, items: items } })
      .then(function (res) {
        S.placing = false;
        if (!res.ok) {
          btn.disabled = false; btn.lastElementChild.textContent = "Place order";
          err.textContent = FK.msg(res);
          if (res.data && ["closed", "stock", "items"].indexOf(res.data.error) >= 0) loadCatalog();
          return;
        }
        var o = res.data, B = basketLines();
        S.orders.unshift({ id: o.id, t: o.token, ref: o.ref, code: o.code, at: new Date().toISOString(), total: B.total, status: "placed",
          shops: B.groups.map(function (g) { return g.shop.name; }) });
        S.orders = S.orders.slice(0, 30);
        FK.save("fkm-orders", S.orders);
        S.basket = {}; saveBasket();
        location.hash = "#/order/" + o.id;
      });
  }

  var HEAD = {
    placed: ["Sending to the shops", "Each shop is confirming your items. You can still cancel."],
    accepted: ["Shops are packing", "They weigh and clean each item, then seal it."],
    ready: ["Packed and waiting", "Everything is packed. The rider is on the way to the shops."],
    picked: ["On the way to you", "The rider has everything. Keep your code ready."],
    delivered: ["Delivered", "Thank you for ordering from shops near you."],
    cancelled: ["Order cancelled", ""]
  };
  var SHOP_PILL = { new: ["Confirming", "a"], accepted: ["Packing", "a"], ready: ["Packed", "g"], picked: ["Picked up", "g"], rejected: ["Could not take it", "r"], cancelled: ["Cancelled", "n"] };

  function orderScreen(id) {
    $tabs.hidden = true;
    var mine = S.orders.filter(function (o) { return o.id === id; })[0];
    if (!mine) { location.hash = "#/orders"; return; }
    function draw(o) {
      var head = HEAD[o.status] || HEAD.placed;
      var live = ["delivered", "cancelled"].indexOf(o.status) < 0;
      var packing = o.shops.filter(function (s) { return s.status === "accepted"; });
      var readyBy = packing.map(function (s) { return FK.addMins(s.accepted_at, s.ready_mins || 15); }).sort().pop();
      FK.put($view, h`<div class="scroll" style="padding-bottom:24px">
        <header style="padding:calc(10px + var(--safe-t)) 16px 34px;background:${o.status === "cancelled" ? "var(--ink2)" : "var(--green)"};color:#fff">
          <div class="between" style="margin:0 -10px 4px"><a class="icon-btn" href="#/orders" aria-label="Back">${icon("back", 22)}</a>
            ${live ? h`<button class="icon-btn" data-act="refresh" aria-label="Refresh">${icon("refresh", 20)}</button>` : ""}</div>
          <div class="kicker" style="color:#C5F27A">ORDER ${o.ref}</div>
          <h1 class="h1" style="margin-top:8px;font-size:26px;line-height:32px">${head[0]}</h1>
          <p class="t14" style="margin:6px 0 0;font-weight:500;color:#D9F2DD">${o.status === "cancelled" ? o.cancel_reason : o.status === "accepted" && readyBy ? head[1] + " Ready by about " + FK.clock(readyBy) + "." : head[1]}</p>
        </header>
        ${live && o.status !== "placed" ? h`<section class="card dark" style="position:relative;margin-top:-20px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span class="stack"><b class="h3" style="font-size:15px">Delivery code</b><span class="t12" style="color:#CFE8DA">Tell it to the rider at your door</span></span>
          <span style="font:600 28px/1 var(--mono);letter-spacing:.14em;color:var(--lime)">${o.code}</span></section>` : ""}
        ${o.rider && live ? h`<section class="card" style="display:flex;align-items:center;gap:12px">${FK.raw('<span class="thumb sm" style="border-radius:50%;background:var(--green-t)">')}${icon("scooter", 22)}${FK.raw("</span>")}
          <span class="stack" style="flex:1"><b class="h3" style="font-size:15px">${o.rider.name} is your rider</b><span class="t12 muted">${o.status === "picked" ? "Bringing everything to you" : "Collecting from the shops"}</span></span>
          <a class="btn sm line-green" href="${FK.tel(o.rider.phone)}" style="width:auto">${icon("phone", 18)}Call</a></section>` : ""}
        ${o.can_cancel ? h`<section class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px"><span class="stack"><b class="h3" style="font-size:15px">Changed your mind?</b><span class="t12 muted">Free until a shop starts on it</span></span><button class="btn sm red" data-act="cancel" style="width:auto">Cancel</button></section>` : ""}
        ${o.shops.map(function (s) {
          var pill = SHOP_PILL[s.status] || ["", "n"];
          return h`<section class="card" style="padding:4px 16px 8px">
            <div class="between" style="padding:10px 0 4px"><b class="h3">${s.name}</b><span class="pill ${pill[1]}">${pill[0]}</span></div>
            ${s.status === "rejected" ? h`<p class="t13" style="margin:0 0 6px;color:var(--red)">${s.reject_reason || "This shop could not take the order"}. You are not charged for these items.</p>` : ""}
            ${s.items.map(function (l) {
              var packed = l.packed != null && !l.out, changed = packed && Math.abs(l.packed - l.qty) > 0.001;
              return h`<div class="between" style="min-height:44px;border-top:1px solid var(--line2);${l.out || s.status === "rejected" ? "color:var(--muted)" : ""}">
                <span class="stack"><span class="t14" style="${l.out ? "text-decoration:line-through" : ""}">${l.name}</span>
                <span class="t12 muted">${FK.qty(l.unit, l.qty)}${l.cut ? " · " + l.cut : ""}${changed ? " · packed " + FK.qty(l.unit, l.packed) : ""}${l.out ? " · out of stock, not charged" : ""}</span></span>
                <span class="t14">${l.out || s.status === "rejected" ? "₹0" : FK.rs(packed ? l.price * l.packed : l.line)}</span></div>`;
            })}</section>`;
        })}
        ${o.status !== "cancelled" ? h`<section class="card" style="display:flex;flex-direction:column;gap:10px">
          <div class="sum"><span>Items</span><span>${FK.rs(o.subtotal)}</span></div>
          <div class="sum"><span>Delivery</span><span>${o.delivery_fee ? FK.rs(o.delivery_fee) : "Free"}</span></div>
          <div class="dash"></div>
          <div class="sum total"><span>${o.status === "delivered" ? "Paid to the rider" : "Pay the rider (" + (o.pay_mode === "upi" ? "UPI" : "cash") + ")"}</span><span>${FK.rs(o.total)}</span></div>
          ${o.status !== "delivered" && o.shops.some(function (s) { return s.packed_total == null && s.status !== "rejected"; }) ? h`<span class="hint">This changes if a shop packs a little more or less. It is final once every shop has packed.</span>` : ""}
        </section>` : ""}
        <p class="t12 muted pad" style="margin:16px 0 0">Placed at ${FK.clock(o.created_at)}. Need help? Call FrescoKart on WhatsApp +91 81578 63503.</p>
      </div>`);
    }
    function fetchIt() {
      return FK.api("/api/m/order?id=" + id + "&t=" + encodeURIComponent(mine.t)).then(function (res) {
        if (location.hash !== "#/order/" + id) return;
        if (!res.ok) { if (!$view.innerHTML) FK.put($view, h`<div class="empty"><b class="h3">Could not load this order</b><button class="btn sm green" data-act="refresh">Try again</button></div>`); return; }
        var o = res.data.order;
        mine.status = o.status; mine.total = o.total;
        FK.save("fkm-orders", S.orders);
        draw(o);
        clearTimeout(pollTimer);
        if (["delivered", "cancelled"].indexOf(o.status) < 0) pollTimer = setTimeout(fetchIt, 8000);
      });
    }
    FK.put($view, h`<div class="scroll"><div class="pad" style="padding-top:40px"><div class="shim" style="height:28px;width:60%"></div><div class="shim" style="height:120px;margin-top:20px;border-radius:16px"></div></div></div>`);
    S.refresh = fetchIt;
    fetchIt();
    floatBar();
  }

  function ordersScreen() {
    tabs("orders");
    FK.put($view, h`<div class="bar"><h1 class="lead">Your orders</h1></div><div class="scroll">
      ${FK.install.card({ key: "fkm-install", icon: "/app/icon-192.png", title: "Follow orders in one tap", text: "Add FrescoKart to your home screen.", days: 14 })}
      ${S.orders.length ? S.orders.map(function (o) {
        var tone = o.status === "delivered" ? "g" : o.status === "cancelled" ? "r" : "a";
        var label = { placed: "Confirming", accepted: "Packing", ready: "Packed", picked: "On the way", delivered: "Delivered", cancelled: "Cancelled" }[o.status] || o.status;
        return h`<a class="card" href="#/order/${o.id}" style="display:block">
          <div class="between"><b class="h3">${o.shops.join(" and ")}</b><span class="pill ${tone}">${label}</span></div>
          <div class="between t13 muted" style="margin-top:6px"><span>${o.ref} · ${new Date(o.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${FK.clock(o.at)}</span><span class="t14" style="color:var(--ink)">${FK.rs(o.total)}</span></div></a>`;
      }) : h`<div class="empty"><span class="ring">${icon("receipt", 30)}</span><b class="h3">No orders yet</b><span class="t13 muted">Orders you place on this phone show here.</span><a class="btn sm green" href="#/">See shops</a></div>`}
    </div>`);
    floatBar();
  }

  function areaSheet() {
    if (!S.cat) return;
    FK.sheet(h`<h2 class="h2" id="ar-l">Where should we deliver?</h2><p class="t13 muted" style="margin:4px 0 12px">The pilot covers these areas in Kochi.</p>
      <div role="radiogroup" aria-labelledby="ar-l" style="display:flex;flex-direction:column;gap:8px">${S.cat.areas.map(function (a) { return h`<button class="tile-opt" role="radio" aria-checked="${a === S.area}" data-area="${a}" style="justify-content:flex-start;padding:0 16px">${a}</button>`; })}</div>`);
    document.getElementById("layer").querySelectorAll("[data-area]").forEach(function (b) {
      b.onclick = function () { keepForm(); S.area = b.dataset.area; FK.save("fkm-area", S.area); FK.closeSheet(); render(); };
    });
  }

  /* ---------- events ---------- */
  document.getElementById("app").addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.dataset.act, id = Number(t.dataset.id);
    if (act === "install") { FK.install.run("FrescoKart", "/app/icon-192.png"); return; }
    if (act === "install-later") { FK.install.later(t.dataset.key, Number(t.dataset.days) || 14); render(); return; }
    if (act === "add") { var ref = byId[id]; if (ref && (ref.item.unit === "kg" || ref.item.cuts.length)) addSheet(id); else { setQty(id, 1); render(); } }
    else if (act === "inc") { var it = byId[id].item; if (S.basket[id].q + stepFor(it.unit) <= (it.unit === "kg" ? 10 : 20)) setQty(id, S.basket[id].q + stepFor(it.unit)); render(); }
    else if (act === "dec") { var it2 = byId[id].item; setQty(id, S.basket[id].q - stepFor(it2.unit)); render(); }
    else if (act === "kind") { S.kind = t.dataset.k; render(); }
    else if (act === "area") areaSheet();
    else if (act === "checkout") location.hash = "#/checkout";
    else if (act === "place") place();
    else if (act === "reload") { loadCatalog().then(render); }
    else if (act === "refresh" && S.refresh) S.refresh();
    else if (act === "cancel") {
      var oid = Number(location.hash.split("/")[2]), mine = S.orders.filter(function (o) { return o.id === oid; })[0];
      if (!mine || !confirm("Cancel this order?")) return;
      FK.api("/api/m/order-cancel", { body: { id: oid, t: mine.t } }).then(function (res) {
        FK.toast(res.ok ? "Order cancelled" : FK.msg(res), !res.ok);
        if (S.refresh) S.refresh();
      });
    }
  });

  function render() {
    clearTimeout(pollTimer);
    S.refresh = null;
    FK.closeSheet();
    var r = location.hash.replace(/^#\/?/, "").split("/");
    if (r[0] === "shop" && S.cat) return shopScreen(Number(r[1]));
    if (r[0] === "basket" && S.cat) return basket();
    if (r[0] === "checkout" && S.cat) return checkout();
    if (r[0] === "order") return orderScreen(Number(r[1]));
    if (r[0] === "orders") return ordersScreen();
    return home();
  }
  window.addEventListener("hashchange", function () { render(); var sc = $view.querySelector(".scroll"); if (sc) sc.scrollTop = 0; });
  FK.watchNet();
  FK.registerSW("/market/sw.js", "/market/");
  FK.install.onChange = function () { var a = document.activeElement; if (!/checkout/.test(location.hash) && !(a && a.tagName === "INPUT")) render(); };
  render();
  loadCatalog().then(render);
  setInterval(function () { if (!/order\/|checkout/.test(location.hash) && document.visibilityState === "visible") loadCatalog().then(function () { if (!document.activeElement || document.activeElement.tagName !== "INPUT") render(); }); }, 60000);
})();
