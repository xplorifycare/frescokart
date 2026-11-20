"""FrescoKart marketplace pilot: food from shops near the customer, one basket, one rider.

Three phone web apps use this module:
  /market/   customers browse shops, fill one basket from several shops, pay the rider on delivery and follow the order
  /partner/  shop owners take orders, pack and weigh, and set today's prices
  /rider/    riders go online, take a job, pick up from each shop and deliver with the customer's code

JSON routes, all under /api/m/ (on Vercel they reach api/market.py through a rewrite):
  public  GET catalog, POST orders, GET order?id=&t=, POST order-cancel
  login   POST login {role: "shop" | "rider", phone, pin}
  shop    GET shop/me, GET shop/orders, POST shop/order, POST shop/open, GET shop/items, POST shop/items
  rider   GET rider/me, POST rider/online, GET rider/jobs, POST rider/job
The admin page /admin/market (same password as /admin) adds shops and riders and can follow or cancel any order.

The fees and the rider pay below are pilot examples. Change them with the FK_M_* settings, not in the code.
This module never imports server.app: app.py passes itself in as `core`, so a script run and a Vercel import
share one set of settings.
"""
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import time
from contextlib import closing
from datetime import datetime, timedelta, timezone


def _num(name, default):
    try:
        return float(os.environ.get(name, "") or default)
    except ValueError:
        return float(default)


DELIVERY_FEE = _num("FK_M_DELIVERY_FEE", 30)       # one shop
EXTRA_SHOP_FEE = _num("FK_M_EXTRA_SHOP_FEE", 10)   # each extra shop in the same order
FREE_DELIVERY_OVER = _num("FK_M_FREE_OVER", 1599)  # basket value that makes delivery free
SHOP_FEE_PCT = _num("FK_M_SHOP_FEE_PCT", 10)       # FrescoKart's share of each shop's sales
RIDER_TRIP_PAY = _num("FK_M_RIDER_TRIP", 40)
RIDER_EXTRA_PICKUP = _num("FK_M_RIDER_EXTRA", 10)
AREAS = [a.strip() for a in (os.environ.get("FK_M_AREAS") or "Edappally,Palarivattom,Kaloor").split(",") if a.strip()]
KINDS = ("fish", "meat", "veg", "grocery")
UNITS = ("kg", "each", "pack", "bunch")
READY_MINS = (10, 15, 20, 30)
REJECT_REASONS = ("An item is out of stock", "Too busy right now", "Closing soon")
LIMIT_ORDERS = int(os.environ.get("FK_M_LIMIT_ORDERS", "12"))   # new orders per visitor per hour
LIMIT_STATUS = int(os.environ.get("FK_M_LIMIT_STATUS", "900"))  # live-order checks per visitor per hour
IST = timezone(timedelta(hours=5, minutes=30))
TOKEN_DAYS = 30

SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS m_shops(
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, area TEXT NOT NULL,
  address TEXT, phone TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL, is_open INTEGER NOT NULL DEFAULT 0,
  fee_pct REAL NOT NULL DEFAULT 10, min_order REAL NOT NULL DEFAULT 0, fssai TEXT,
  active INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS m_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL, name TEXT NOT NULL, local_name TEXT, section TEXT,
  unit TEXT NOT NULL, price REAL NOT NULL, in_stock INTEGER NOT NULL DEFAULT 1, cuts TEXT, img TEXT,
  sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT);
CREATE INDEX IF NOT EXISTS m_items_shop ON m_items(shop_id);
CREATE TABLE IF NOT EXISTS m_riders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL, online INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS m_orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL,
  name TEXT, phone TEXT NOT NULL, area TEXT NOT NULL, address TEXT NOT NULL, notes TEXT, pay_mode TEXT NOT NULL,
  subtotal REAL NOT NULL, delivery_fee REAL NOT NULL, total REAL NOT NULL, rider_id INTEGER, rider_pay REAL,
  code TEXT NOT NULL, cancel_reason TEXT, delivered_at TEXT, cash_collected REAL, ip_hash TEXT, ua TEXT,
  demo INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS m_orders_status ON m_orders(status);
CREATE INDEX IF NOT EXISTS m_orders_rider ON m_orders(rider_id);
CREATE TABLE IF NOT EXISTS m_order_shops(
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, shop_id INTEGER NOT NULL, status TEXT NOT NULL,
  ready_mins INTEGER, pin TEXT NOT NULL, subtotal REAL NOT NULL, packed_total REAL, reject_reason TEXT,
  accepted_at TEXT, ready_at TEXT, picked_at TEXT);
CREATE INDEX IF NOT EXISTS m_os_order ON m_order_shops(order_id);
CREATE INDEX IF NOT EXISTS m_os_shop ON m_order_shops(shop_id, status);
CREATE TABLE IF NOT EXISTS m_order_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, shop_id INTEGER NOT NULL, item_id INTEGER,
  name TEXT NOT NULL, local_name TEXT, unit TEXT NOT NULL, qty REAL NOT NULL, price REAL NOT NULL, cut TEXT,
  line REAL NOT NULL, packed_qty REAL, is_out INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS m_oi_order ON m_order_items(order_id);
"""
SCHEMA_PG = SCHEMA_SQLITE.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY").replace(" REAL", " DOUBLE PRECISION")
TABLES = ("m_shops", "m_items", "m_riders", "m_orders", "m_order_shops", "m_order_items")

# Starting items for a new shop, by kind. Shops change prices and add their own items in the partner app.
# Only the fish have photos in web/img; the apps draw a tile for the rest.
STARTER = {
    "fish": [
        ("Seer fish", "Neymeen", "Fish", "kg", 1080, ["Curry cut", "Fry slices", "Whole, cleaned"], "/img/seer.webp"),
        ("Mackerel", "Ayala", "Fish", "kg", 240, ["Whole, cleaned", "Curry cut", "Fry cut"], "/img/mackerel.webp"),
        ("Sardine", "Mathi", "Fish", "kg", 180, ["Whole, cleaned", "Head off"], "/img/sardine.webp"),
        ("Pomfret", "Avoli", "Fish", "kg", 860, ["Whole, cleaned", "Curry cut", "Fry cut"], "/img/pomfret.webp"),
        ("Pearl spot", "Karimeen", "Fish", "kg", 700, ["Whole, cleaned", "Scored for fry"], "/img/karimeen.webp"),
        ("Tuna", "Choora", "Fish", "kg", 320, ["Curry cut", "Steaks"], "/img/tuna.webp"),
        ("Prawns, medium", "Chemmeen", "Prawns and squid", "kg", 520, ["Cleaned and deveined", "Whole"], "/img/prawns.webp"),
        ("Squid", "Koonthal", "Prawns and squid", "kg", 400, ["Rings", "Cleaned, whole"], "/img/squid.webp"),
        ("Crab", "Njandu", "Prawns and squid", "kg", 560, ["Cleaned, halved", "Whole"], "/img/crab.webp"),
    ],
    "meat": [
        ("Chicken, curry cut", "Kozhi", "Chicken", "kg", 260, ["Small pieces", "Large pieces"], None),
        ("Chicken, boneless", "Kozhi", "Chicken", "kg", 380, ["Cubes", "Strips"], None),
        ("Mutton, curry cut", "Aadu", "Mutton", "kg", 900, ["Small pieces", "Large pieces"], None),
        ("Eggs, 12", "Mutta", "Eggs", "pack", 84, [], None),
    ],
    "veg": [
        ("Tomato", "Thakkali", "Vegetables", "kg", 40, [], None),
        ("Shallots", "Cheriya ulli", "Vegetables", "kg", 90, [], None),
        ("Onion", "Savala", "Vegetables", "kg", 45, [], None),
        ("Green chilli, 100 g", "Pacha mulaku", "Vegetables", "pack", 10, [], None),
        ("Ginger, 100 g", "Inji", "Vegetables", "pack", 16, [], None),
        ("Coriander leaves", "Malli ila", "Leaves", "bunch", 10, [], None),
        ("Curry leaves", "Kariveppila", "Leaves", "bunch", 5, [], None),
        ("Coconut", "Thenga", "Fruits and coconut", "each", 45, [], None),
        ("Nendran banana", "Ethappazham", "Fruits and coconut", "kg", 70, [], None),
    ],
    "grocery": [
        ("Matta rice, 5 kg", "Kuthari", "Rice and oil", "pack", 340, [], None),
        ("Coconut oil, 1 litre", "Velichenna", "Rice and oil", "pack", 220, [], None),
        ("Fish masala, 100 g", "Meen masala", "Masalas", "pack", 48, [], None),
        ("Chilli powder, 250 g", "Mulaku podi", "Masalas", "pack", 90, [], None),
        ("Turmeric powder, 100 g", "Manjal podi", "Masalas", "pack", 30, [], None),
        ("Tea powder, 250 g", "Chaya podi", "Everyday", "pack", 130, [], None),
    ],
}

DEMO_SHOPS = [
    ("Sea Pearl Fish Mart (demo)", "fish", "Edappally", "Stall 14, Edappally market", "+919000000001"),
    ("Green Leaf Vegetables (demo)", "veg", "Edappally", "Near the market gate, Edappally", "+919000000002"),
    ("Fresh Cuts Meat and Chicken (demo)", "meat", "Palarivattom", "Palarivattom junction", "+919000000003"),
    ("Mariya Stores (demo)", "grocery", "Kaloor", "Kaloor stadium road", "+919000000004"),
]
DEMO_RIDER = ("Arun (demo)", "+919000000009")
DEMO_PIN = "1234"


# ---------------------------------------------------------------- small helpers

def money(x):
    return round(float(x) + 1e-9, 2)


def rupees(x):
    """Whole rupees, halves rounded up, so nobody hands over paise."""
    return float(int(float(x) + 0.5 + 1e-9))


def pin_hash(pin):
    salt = secrets.token_hex(8)
    return "p1$%s$%s" % (salt, hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), 60000).hex())


def pin_ok(pin, stored):
    try:
        _, salt, digest = (stored or "").split("$")
    except ValueError:
        return False
    return hmac.compare_digest(hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), 60000).hex(), digest)


def valid_pin(pin):
    return isinstance(pin, str) and re.fullmatch(r"\d{4,6}", pin) is not None


def ref_of(oid):
    return "FM-%06d" % oid


def order_token(core, oid):
    return hmac.new(core.secret().encode(), ("morder:%d" % oid).encode(), hashlib.sha256).hexdigest()[:24]


def make_token(core, role, uid, stored_hash):
    exp = int(time.time()) + TOKEN_DAYS * 86400
    body = "%s.%d.%d" % (role, uid, exp)
    # The stored PIN hash is part of the signature, so a new PIN logs out every phone that used the old one.
    sig = hmac.new(core.secret().encode(), (body + "." + stored_hash[-16:]).encode(), hashlib.sha256).hexdigest()[:32]
    return body + "." + sig


def read_token(core, c, token, role):
    parts = (token or "").split(".")
    if len(parts) != 4 or parts[0] != role or not parts[1].isdigit() or not parts[2].isdigit():
        return None
    if int(parts[2]) < time.time():
        return None
    table = "m_shops" if role == "shop" else "m_riders"
    row = c.execute("SELECT * FROM %s WHERE id=? AND active=1" % table, (int(parts[1]),)).fetchone()
    if not row:
        return None
    body = ".".join(parts[:3])
    want = hmac.new(core.secret().encode(), (body + "." + row["pin_hash"][-16:]).encode(), hashlib.sha256).hexdigest()[:32]
    return row if hmac.compare_digest(want.encode(), parts[3].encode()) else None


def today_start_utc():
    start = datetime.now(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    return start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ago_utc(seconds):
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")


def bad(code, message):
    return 400, {"ok": False, "error": code, "message": message}


def delivery_fee_for(subtotal, shop_count):
    if shop_count <= 0:
        return 0.0
    if subtotal >= FREE_DELIVERY_OVER:
        return 0.0
    return money(DELIVERY_FEE + EXTRA_SHOP_FEE * (shop_count - 1))


def qty_ok(unit, qty):
    if unit == "kg":
        return 0.25 <= qty <= 10 and abs(qty * 4 - round(qty * 4)) < 1e-6
    return 1 <= qty <= 20 and abs(qty - round(qty)) < 1e-6


def item_dict(r):
    return {"id": r["id"], "name": r["name"], "local": r["local_name"] or "", "section": r["section"] or "",
            "unit": r["unit"], "price": money(r["price"]), "in_stock": bool(r["in_stock"]),
            "cuts": json.loads(r["cuts"] or "[]"), "img": r["img"] or ""}


def add_items(c, core, shop_id, kind):
    for i, (name, local, section, unit, price, cuts, img) in enumerate(STARTER.get(kind, [])):
        c.execute("INSERT INTO m_items(shop_id,name,local_name,section,unit,price,in_stock,cuts,img,sort,updated_at)"
                  " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (shop_id, name, local, section, unit, price, 1, json.dumps(cuts), img, i, core.now_iso()))


# ---------------------------------------------------------------- order state

def recompute(c, core, oid):
    """Work out the order's status and totals from its shops. Call after any shop or rider change."""
    o = c.execute("SELECT * FROM m_orders WHERE id=?", (oid,)).fetchone()
    if not o or o["status"] in ("delivered", "cancelled"):
        return
    shops = c.execute("SELECT * FROM m_order_shops WHERE order_id=?", (oid,)).fetchall()
    live = [s for s in shops if s["status"] != "rejected"]
    reason = None
    if not live:
        status, reason = "cancelled", "The shops could not take this order"
    elif any(s["status"] == "new" for s in live):
        status = "placed"
    elif all(s["status"] == "picked" for s in live):
        status = "picked"
    elif all(s["status"] in ("ready", "picked") for s in live):
        status = "ready"
    else:
        status = "accepted"
    goods = money(sum(s["packed_total"] if s["packed_total"] is not None else s["subtotal"] for s in live))
    fee = delivery_fee_for(money(sum(s["subtotal"] for s in live)), len(live))
    pay = money(RIDER_TRIP_PAY + RIDER_EXTRA_PICKUP * max(0, len(live) - 1)) if live else 0
    c.execute("UPDATE m_orders SET status=?, cancel_reason=COALESCE(?, cancel_reason), subtotal=?, delivery_fee=?, total=?,"
              " rider_pay=?, updated_at=? WHERE id=?",
              (status, reason, goods, fee, money(goods + fee), pay, core.now_iso(), oid))


def order_detail(c, oid, viewer):
    """The order as one viewer may see it: 'customer', 'rider' or 'admin'."""
    o = c.execute("SELECT * FROM m_orders WHERE id=?", (oid,)).fetchone()
    if not o:
        return None
    shops = c.execute("SELECT os.*, s.name AS shop_name, s.address AS shop_address, s.phone AS shop_phone, s.area AS shop_area,"
                      " s.kind AS shop_kind FROM m_order_shops os JOIN m_shops s ON s.id=os.shop_id WHERE os.order_id=? ORDER BY os.id",
                      (oid,)).fetchall()
    items = c.execute("SELECT * FROM m_order_items WHERE order_id=? ORDER BY id", (oid,)).fetchall()
    rider = None
    if o["rider_id"]:
        r = c.execute("SELECT id, name, phone FROM m_riders WHERE id=?", (o["rider_id"],)).fetchone()
        if r:
            rider = {"name": r["name"], "phone": r["phone"]}
    out_shops = []
    for s in shops:
        lines = []
        for it in items:
            if it["shop_id"] != s["shop_id"]:
                continue
            lines.append({"id": it["id"], "name": it["name"], "local": it["local_name"] or "", "unit": it["unit"],
                          "qty": it["qty"], "price": money(it["price"]), "cut": it["cut"] or "", "line": money(it["line"]),
                          "packed": it["packed_qty"], "out": bool(it["is_out"])})
        entry = {"shop_id": s["shop_id"], "name": s["shop_name"], "kind": s["shop_kind"], "status": s["status"],
                 "ready_mins": s["ready_mins"], "accepted_at": s["accepted_at"], "ready_at": s["ready_at"], "picked_at": s["picked_at"],
                 "subtotal": money(s["subtotal"]), "packed_total": None if s["packed_total"] is None else money(s["packed_total"]),
                 "reject_reason": s["reject_reason"] or "", "items": lines}
        if viewer in ("rider", "admin"):
            entry.update(address=s["shop_address"] or "", area=s["shop_area"], phone=s["shop_phone"], pin=s["pin"])
        out_shops.append(entry)
    d = {"id": oid, "ref": ref_of(oid), "status": o["status"], "created_at": o["created_at"], "updated_at": o["updated_at"],
         "area": o["area"], "pay_mode": o["pay_mode"], "subtotal": money(o["subtotal"]), "delivery_fee": money(o["delivery_fee"]),
         "total": money(o["total"]), "cancel_reason": o["cancel_reason"] or "", "delivered_at": o["delivered_at"],
         "rider": rider, "shops": out_shops}
    if viewer == "customer":
        d.update(code=o["code"], can_cancel=o["status"] == "placed" and not any(s["status"] != "new" for s in shops))
    if viewer in ("rider", "admin"):
        d.update(name=o["name"] or "", phone=o["phone"], address=o["address"], notes=o["notes"] or "", rider_pay=money(o["rider_pay"] or 0))
    if viewer == "admin":
        d.update(code=o["code"], rider_id=o["rider_id"], demo=bool(o["demo"]))
    return d


# ---------------------------------------------------------------- public routes

def catalog(core):
    with closing(core.db()) as c:
        shops = c.execute("SELECT * FROM m_shops WHERE active=1 ORDER BY is_open DESC, id").fetchall()
        items = c.execute("SELECT i.* FROM m_items i JOIN m_shops s ON s.id=i.shop_id WHERE s.active=1 ORDER BY i.shop_id, i.sort, i.id").fetchall()
    by_shop = {}
    for it in items:
        by_shop.setdefault(it["shop_id"], []).append(item_dict(it))
    return 200, {"ok": True, "areas": AREAS,
                 "fees": {"delivery": DELIVERY_FEE, "extra_shop": EXTRA_SHOP_FEE, "free_over": FREE_DELIVERY_OVER},
                 "shops": [{"id": s["id"], "name": s["name"], "kind": s["kind"], "area": s["area"], "address": s["address"] or "",
                            "open": bool(s["is_open"]), "min_order": money(s["min_order"]), "demo": bool(s["demo"]),
                            "items": by_shop.get(s["id"], [])} for s in shops]}


def place_order(core, d, ip, ua):
    if core.clean(d.get("hp"), 20):  # honeypot: look successful, store nothing
        return 200, {"ok": True, "id": 0, "ref": ref_of(0), "token": "", "code": "0000"}
    phone = core.norm_phone(d.get("phone"))
    if not phone:
        return bad("phone", "Enter a valid 10-digit mobile number.")
    area = core.clean(d.get("area"), 40)
    if area not in AREAS:
        return bad("area", "We deliver only in %s for now." % ", ".join(AREAS))
    address = core.clean(d.get("address"), 240)
    if len(address) < 6:
        return bad("address", "Add your house or flat number and the street, so the rider can find you.")
    if d.get("consent") is not True:
        return bad("consent", "Please tick the box so the shop and the rider can contact you about this order.")
    pay_mode = d.get("pay_mode") if d.get("pay_mode") in ("cash", "upi") else None
    if not pay_mode:
        return bad("pay_mode", "Choose cash or UPI to the rider.")
    raw = d.get("items")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 40:
        return bad("items", "Your basket is empty.")
    wanted = []
    for it in raw:
        if not isinstance(it, dict) or type(it.get("item_id")) is not int:
            return bad("items", "Something in your basket is not on the menu any more. Please check it.")
        try:
            qty = float(it.get("qty"))
        except (TypeError, ValueError):
            return bad("items", "Check the amounts in your basket.")
        wanted.append((it["item_id"], qty, core.clean(it.get("cut"), 60)))
    with closing(core.db()) as c:
        ids = sorted({w[0] for w in wanted})
        rows = c.execute("SELECT i.*, s.name AS shop_name, s.is_open, s.active, s.min_order FROM m_items i JOIN m_shops s ON s.id=i.shop_id"
                         " WHERE i.id IN (%s)" % ",".join("?" * len(ids)), tuple(ids)).fetchall()
        found = {r["id"]: r for r in rows}
        groups = {}
        for iid, qty, cut in wanted:
            r = found.get(iid)
            if not r or not r["active"]:
                return bad("items", "Something in your basket is not on the menu any more. Please check it.")
            if not r["is_open"]:
                return bad("closed", "%s has just closed. Remove its items to order from the others." % r["shop_name"])
            if not r["in_stock"]:
                return bad("stock", "%s at %s just sold out. Please remove it." % (r["name"], r["shop_name"]))
            if not qty_ok(r["unit"], qty):
                return bad("items", "Check the amount of %s." % r["name"])
            cuts = json.loads(r["cuts"] or "[]")
            if cuts and cut not in cuts:
                cut = cuts[0]
            if not cuts:
                cut = ""
            groups.setdefault(r["shop_id"], {"name": r["shop_name"], "min": r["min_order"], "lines": []})["lines"].append(
                (r, qty, cut, rupees(r["price"] * qty)))
        for g in groups.values():
            sub = money(sum(line for _, _, _, line in g["lines"]))
            if sub < g["min"]:
                return bad("min_order", "%s takes orders from Rs %g. Add a little more from there." % (g["name"], g["min"]))
            g["subtotal"] = sub
        subtotal = money(sum(g["subtotal"] for g in groups.values()))
        fee = delivery_fee_for(subtotal, len(groups))
        total = money(subtotal + fee)
        recent = c.execute("SELECT id, code FROM m_orders WHERE phone=? AND total=? AND created_at>=? ORDER BY id DESC LIMIT 1",
                           (phone, total, ago_utc(120))).fetchone()
        if recent:  # a double tap or a retry after a lost reply
            return 200, {"ok": True, "id": recent["id"], "ref": ref_of(recent["id"]), "token": order_token(core, recent["id"]),
                         "code": recent["code"], "duplicate": True}
        now = core.now_iso()
        demo = 1 if any("(demo)" in g["name"] for g in groups.values()) else 0
        oid = c.insert_id("INSERT INTO m_orders(created_at,updated_at,status,name,phone,area,address,notes,pay_mode,subtotal,delivery_fee,"
                          "total,rider_pay,code,ip_hash,ua,demo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                          (now, now, "placed", core.clean(d.get("name"), 60), phone, area, address, core.clean(d.get("notes"), 200),
                           pay_mode, subtotal, fee, total, money(RIDER_TRIP_PAY + RIDER_EXTRA_PICKUP * (len(groups) - 1)),
                           "%04d" % (1000 + secrets.randbelow(9000)), core.ip_hash(ip), core.clean(ua, 200), demo))
        for shop_id, g in groups.items():
            c.execute("INSERT INTO m_order_shops(order_id,shop_id,status,pin,subtotal) VALUES(?,?,?,?,?)",
                      (oid, shop_id, "new", "%04d" % (1000 + secrets.randbelow(9000)), g["subtotal"]))
            for r, qty, cut, line in g["lines"]:
                c.execute("INSERT INTO m_order_items(order_id,shop_id,item_id,name,local_name,unit,qty,price,cut,line)"
                          " VALUES(?,?,?,?,?,?,?,?,?,?)", (oid, shop_id, r["id"], r["name"], r["local_name"], r["unit"], qty, r["price"], cut, line))
        code = c.execute("SELECT code FROM m_orders WHERE id=?", (oid,)).fetchone()[0]
        c.commit()
    core.notify("New shop order %s: %s, %s, %s. Rs %g from %s." % (ref_of(oid), core.clean(d.get("name"), 60) or "no name", phone, area,
                                                                    total, ", ".join(g["name"] for g in groups.values())))
    return 200, {"ok": True, "id": oid, "ref": ref_of(oid), "token": order_token(core, oid), "code": code}


def customer_order(core, oid, token):
    if not 0 < oid < 2 ** 62 or not hmac.compare_digest((token or "").encode(), order_token(core, oid).encode()):
        return 404, {"ok": False, "error": "not_found"}
    with closing(core.db()) as c:
        d = order_detail(c, oid, "customer")
    return (200, {"ok": True, "order": d}) if d else (404, {"ok": False, "error": "not_found"})


def customer_cancel(core, d):
    oid = d.get("id") if type(d.get("id")) is int else 0
    if not 0 < oid < 2 ** 62 or not hmac.compare_digest(str(d.get("t") or "").encode(), order_token(core, oid).encode()):
        return 404, {"ok": False, "error": "not_found"}
    with closing(core.db()) as c:
        busy = c.execute("SELECT COUNT(*) FROM m_order_shops WHERE order_id=? AND status!='new'", (oid,)).fetchone()[0]
        n = c.execute("UPDATE m_orders SET status='cancelled', cancel_reason=?, updated_at=? WHERE id=? AND status='placed'",
                      ("You cancelled before the shops started", core.now_iso(), oid)).rowcount if not busy else 0
        if n:
            # its own status, so the shop's "turned down" count only holds orders the shop said no to
            c.execute("UPDATE m_order_shops SET status='cancelled', reject_reason='Customer cancelled' WHERE order_id=? AND status='new'", (oid,))
        c.commit()
    if not n:
        return 409, {"ok": False, "error": "too_late", "message": "A shop has already started on it. Call us to change it."}
    core.notify("Shop order %s was cancelled by the customer." % ref_of(oid))
    return 200, {"ok": True}


def login(core, d):
    role = d.get("role")
    phone = core.norm_phone(d.get("phone"))
    pin = d.get("pin")
    if role not in ("shop", "rider") or not phone or not valid_pin(pin):
        return bad("login", "Enter the mobile number and the PIN FrescoKart gave you.")
    table = "m_shops" if role == "shop" else "m_riders"
    if not core.LIMITER.allow(("m-login-phone", phone), 8, 900):
        return 429, {"ok": False, "error": "rate", "message": "Too many tries. Wait 15 minutes, or call FrescoKart for a new PIN."}
    with closing(core.db()) as c:
        row = c.execute("SELECT * FROM %s WHERE phone=? AND active=1" % table, (phone,)).fetchone()
    if not row or not pin_ok(pin, row["pin_hash"]):
        return 401, {"ok": False, "error": "login", "message": "That number and PIN do not match."}
    return 200, {"ok": True, "token": make_token(core, role, row["id"], row["pin_hash"]), "name": row["name"]}


# ---------------------------------------------------------------- shop routes

def shop_me(c, shop):
    since = today_start_utc()
    rows = c.execute("SELECT os.subtotal, os.packed_total, os.status, o.status AS ostatus FROM m_order_shops os JOIN m_orders o ON o.id=os.order_id"
                     " WHERE os.shop_id=? AND o.created_at>=?", (shop["id"], since)).fetchall()
    done = [r for r in rows if r["status"] == "picked" and r["ostatus"] != "cancelled"]
    sales = money(sum(r["packed_total"] if r["packed_total"] is not None else r["subtotal"] for r in done))
    fee = money(sales * shop["fee_pct"] / 100.0)
    return {"id": shop["id"], "name": shop["name"], "kind": shop["kind"], "area": shop["area"], "open": bool(shop["is_open"]),
            "fee_pct": shop["fee_pct"], "demo": bool(shop["demo"]),
            "today": {"orders": len(done), "sales": sales, "fee": fee, "payout": money(sales - fee),
                      "rejected": sum(1 for r in rows if r["status"] == "rejected")}}


def shop_orders(c, shop):
    since = ago_utc(18 * 3600)
    rows = c.execute("SELECT os.*, o.created_at AS o_created, o.status AS o_status, o.area AS o_area, o.notes AS o_notes, o.rider_id"
                     " FROM m_order_shops os JOIN m_orders o ON o.id=os.order_id WHERE os.shop_id=? AND o.created_at>=?"
                     " ORDER BY o.id DESC LIMIT 80", (shop["id"], since)).fetchall()
    out = []
    for r in rows:
        items = c.execute("SELECT * FROM m_order_items WHERE order_id=? AND shop_id=? ORDER BY id", (r["order_id"], shop["id"])).fetchall()
        rider = None
        if r["rider_id"]:
            rr = c.execute("SELECT name FROM m_riders WHERE id=?", (r["rider_id"],)).fetchone()
            rider = rr["name"] if rr else None
        status = r["status"]
        if r["o_status"] == "cancelled" and status not in ("picked",):
            status = "cancelled"
        out.append({"order_id": r["order_id"], "ref": ref_of(r["order_id"]), "status": status, "created_at": r["o_created"],
                    "accepted_at": r["accepted_at"], "ready_at": r["ready_at"], "picked_at": r["picked_at"], "ready_mins": r["ready_mins"],
                    "pin": r["pin"] if status in ("accepted", "ready", "picked") else "", "area": r["o_area"], "notes": r["o_notes"] or "",
                    "subtotal": money(r["subtotal"]), "packed_total": None if r["packed_total"] is None else money(r["packed_total"]),
                    "rider": rider, "reject_reason": r["reject_reason"] or "",
                    "items": [{"id": i["id"], "name": i["name"], "local": i["local_name"] or "", "unit": i["unit"], "qty": i["qty"],
                               "price": money(i["price"]), "cut": i["cut"] or "", "line": money(i["line"]), "packed": i["packed_qty"],
                               "out": bool(i["is_out"])} for i in items]})
    return out


def shop_pack(c, shop_id, order_id, packs):
    """Save packed amounts. packs: [{id, packed, out}]. Returns an error message or None."""
    items = {i["id"]: i for i in c.execute("SELECT * FROM m_order_items WHERE order_id=? AND shop_id=?", (order_id, shop_id)).fetchall()}
    if not isinstance(packs, list):
        return "Send the packed amounts as a list."
    for p in packs:
        if not isinstance(p, dict) or p.get("id") not in items:
            return "That item is not in this order."
        it = items[p["id"]]
        out = bool(p.get("out"))
        packed = None
        if not out:
            try:
                packed = float(p.get("packed"))
            except (TypeError, ValueError):
                return "Enter the packed amount of %s." % it["name"]
            if it["unit"] == "kg":
                if not 0.05 <= packed <= it["qty"] * 1.1 + 1e-9:
                    return "%s: pack between 50 g and %g kg." % (it["name"], round(it["qty"] * 1.1, 2))
            elif abs(packed - round(packed)) > 1e-6 or not 1 <= packed <= it["qty"]:
                return "%s: pack between 1 and %g." % (it["name"], it["qty"])
        c.execute("UPDATE m_order_items SET packed_qty=?, is_out=? WHERE id=?", (packed, 1 if out else 0, it["id"]))
    rows = c.execute("SELECT * FROM m_order_items WHERE order_id=? AND shop_id=?", (order_id, shop_id)).fetchall()
    total = money(sum(0 if r["is_out"] else rupees(r["price"] * (r["packed_qty"] if r["packed_qty"] is not None else r["qty"])) for r in rows))
    c.execute("UPDATE m_order_shops SET packed_total=? WHERE order_id=? AND shop_id=?", (total, order_id, shop_id))
    return None


def shop_action(core, c, shop, d):
    oid = d.get("order_id") if type(d.get("order_id")) is int else 0
    action = d.get("action")
    row = c.execute("SELECT os.*, o.status AS o_status FROM m_order_shops os JOIN m_orders o ON o.id=os.order_id"
                    " WHERE os.order_id=? AND os.shop_id=?", (oid, shop["id"])).fetchone()
    if not row:
        return 404, {"ok": False, "error": "not_found"}
    if row["o_status"] == "cancelled":
        return 409, {"ok": False, "error": "cancelled", "message": "This order was cancelled."}
    now = core.now_iso()
    if action == "accept":
        mins = d.get("ready_mins")
        if row["status"] != "new":
            return 409, {"ok": False, "error": "state", "message": "This order is already %s." % row["status"]}
        if mins not in READY_MINS:
            return bad("ready_mins", "Choose when it will be packed.")
        c.execute("UPDATE m_order_shops SET status='accepted', ready_mins=?, accepted_at=? WHERE id=?", (mins, now, row["id"]))
    elif action == "reject":
        if row["status"] != "new":
            return 409, {"ok": False, "error": "state", "message": "You have already accepted this order."}
        reason = d.get("reason") if d.get("reason") in REJECT_REASONS else REJECT_REASONS[0]
        c.execute("UPDATE m_order_shops SET status='rejected', reject_reason=? WHERE id=?", (reason, row["id"]))
    elif action in ("pack", "ready"):
        if row["status"] not in ("accepted", "ready"):
            return 409, {"ok": False, "error": "state", "message": "Accept the order first."}
        if d.get("items") is not None:
            err = shop_pack(c, shop["id"], oid, d.get("items"))
            if err:
                return bad("items", err)
        if action == "ready":
            if c.execute("SELECT COUNT(*) FROM m_order_items WHERE order_id=? AND shop_id=? AND is_out=0", (oid, shop["id"])).fetchone()[0] == 0:
                c.execute("UPDATE m_order_shops SET status='rejected', reject_reason='Everything was out of stock' WHERE id=?", (row["id"],))
            else:
                if row["packed_total"] is None and d.get("items") is None:
                    shop_pack(c, shop["id"], oid, [])
                c.execute("UPDATE m_order_shops SET status='ready', ready_at=? WHERE id=?", (now, row["id"]))
    else:
        return bad("action", "Unknown action.")
    recompute(c, core, oid)
    c.commit()
    return 200, {"ok": True}


def shop_items_save(core, c, shop, d):
    changes = d.get("changes") or []
    if not isinstance(changes, list) or len(changes) > 200:
        return bad("changes", "Too many changes at once.")
    mine = {r["id"] for r in c.execute("SELECT id FROM m_items WHERE shop_id=?", (shop["id"],)).fetchall()}
    now = core.now_iso()
    for ch in changes:
        if not isinstance(ch, dict) or ch.get("id") not in mine:
            return bad("item", "That item is not in your shop.")
        if "price" in ch:
            try:
                price = float(ch["price"])
            except (TypeError, ValueError):
                return bad("price", "Prices must be numbers.")
            if not 1 <= price <= 50000:
                return bad("price", "Prices must be between Rs 1 and Rs 50,000.")
            c.execute("UPDATE m_items SET price=?, updated_at=? WHERE id=?", (money(price), now, ch["id"]))
        if "in_stock" in ch:
            c.execute("UPDATE m_items SET in_stock=?, updated_at=? WHERE id=?", (1 if ch["in_stock"] else 0, now, ch["id"]))
    new = d.get("add")
    if isinstance(new, dict):
        name = core.clean(new.get("name"), 60)
        unit = new.get("unit") if new.get("unit") in UNITS else None
        try:
            price = float(new.get("price"))
        except (TypeError, ValueError):
            price = 0
        if not name or not unit or not 1 <= price <= 50000:
            return bad("add", "Give the new item a name, a unit and a price.")
        cuts = [core.clean(x, 40) for x in (new.get("cuts") or []) if core.clean(x, 40)][:6] if isinstance(new.get("cuts"), list) else []
        c.execute("INSERT INTO m_items(shop_id,name,local_name,section,unit,price,in_stock,cuts,img,sort,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (shop["id"], name, core.clean(new.get("local"), 60), core.clean(new.get("section"), 40) or "More",
                   unit, money(price), 1, json.dumps(cuts), None, 999, now))
    c.commit()
    return 200, {"ok": True}


# ---------------------------------------------------------------- rider routes

def rider_me(c, rider):
    since = today_start_utc()
    rows = c.execute("SELECT rider_pay, cash_collected, pay_mode FROM m_orders WHERE rider_id=? AND status='delivered' AND delivered_at>=?",
                     (rider["id"], since)).fetchall()
    return {"id": rider["id"], "name": rider["name"], "online": bool(rider["online"]), "demo": bool(rider["demo"]),
            "today": {"trips": len(rows), "pay": money(sum(r["rider_pay"] or 0 for r in rows)),
                      "cash": money(sum(r["cash_collected"] or 0 for r in rows if r["pay_mode"] == "cash"))}}


def rider_jobs(c, rider):
    cur = c.execute("SELECT id FROM m_orders WHERE rider_id=? AND status IN ('placed','accepted','ready','picked') ORDER BY id LIMIT 1",
                    (rider["id"],)).fetchone()
    current = order_detail(c, cur["id"], "rider") if cur else None
    offers = []
    if rider["online"] and not current:
        for o in c.execute("SELECT id FROM m_orders WHERE rider_id IS NULL AND status IN ('accepted','ready') AND created_at>=?"
                           " ORDER BY id LIMIT 10", (ago_utc(6 * 3600),)).fetchall():
            d = order_detail(c, o["id"], "rider")
            live = [s for s in d["shops"] if s["status"] != "rejected"]
            offers.append({"id": d["id"], "ref": d["ref"], "status": d["status"], "area": d["area"], "rider_pay": d["rider_pay"],
                           "pay_mode": d["pay_mode"], "total": d["total"],
                           "shops": [{"name": s["name"], "area": s["area"], "status": s["status"], "ready_mins": s["ready_mins"],
                                      "accepted_at": s["accepted_at"]} for s in live]})
    return {"current": current, "offers": offers}


def rider_action(core, c, rider, d):
    oid = d.get("order_id") if type(d.get("order_id")) is int else 0
    action = d.get("action")
    now = core.now_iso()
    if action == "claim":
        if not rider["online"]:
            return 409, {"ok": False, "error": "offline", "message": "Go online first."}
        if c.execute("SELECT COUNT(*) FROM m_orders WHERE rider_id=? AND status IN ('placed','accepted','ready','picked')",
                     (rider["id"],)).fetchone()[0]:
            return 409, {"ok": False, "error": "busy", "message": "Finish your current order first."}
        n = c.execute("UPDATE m_orders SET rider_id=?, updated_at=? WHERE id=? AND rider_id IS NULL AND status IN ('accepted','ready')",
                      (rider["id"], now, oid)).rowcount
        c.commit()
        return (200, {"ok": True}) if n else (409, {"ok": False, "error": "taken", "message": "Another rider took this one."})
    o = c.execute("SELECT * FROM m_orders WHERE id=? AND rider_id=?", (oid, rider["id"])).fetchone()
    if not o:
        return 404, {"ok": False, "error": "not_found"}
    if o["status"] in ("delivered", "cancelled"):
        return 409, {"ok": False, "error": "state", "message": "This order is already %s." % o["status"]}
    if action == "picked":
        sid = d.get("shop_id") if type(d.get("shop_id")) is int else 0
        n = c.execute("UPDATE m_order_shops SET status='picked', picked_at=? WHERE order_id=? AND shop_id=? AND status='ready'",
                      (now, oid, sid)).rowcount
        if not n:
            return 409, {"ok": False, "error": "not_ready", "message": "The shop has not marked it ready yet."}
    elif action == "deliver":
        if o["status"] != "picked":
            return 409, {"ok": False, "error": "not_picked", "message": "Pick up from every shop first."}
        if not hmac.compare_digest(str(d.get("code") or "").encode(), o["code"].encode()):
            if not core.LIMITER.allow(("m-code", str(oid)), 6, 900):
                return 429, {"ok": False, "error": "rate", "message": "Too many wrong codes. Call FrescoKart."}
            return 400, {"ok": False, "error": "code", "message": "That code does not match. Ask the customer to read it from their app."}
        c.execute("UPDATE m_orders SET status='delivered', delivered_at=?, cash_collected=?, updated_at=? WHERE id=?",
                  (now, o["total"], now, oid))
        c.commit()
        core.notify("Shop order %s delivered by %s." % (ref_of(oid), rider["name"]))
        return 200, {"ok": True}
    elif action == "release":
        if c.execute("SELECT COUNT(*) FROM m_order_shops WHERE order_id=? AND status='picked'", (oid,)).fetchone()[0]:
            return 409, {"ok": False, "error": "picked", "message": "You already have items from a shop. Call FrescoKart to hand it over."}
        c.execute("UPDATE m_orders SET rider_id=NULL, updated_at=? WHERE id=?", (now, oid))
        c.commit()
        return 200, {"ok": True}
    else:
        return bad("action", "Unknown action.")
    recompute(c, core, oid)
    c.commit()
    return 200, {"ok": True}


# ---------------------------------------------------------------- routing

def handle(h, core, method, route):
    """Called by Handler.route for /api/m/<route>. `h` is the request handler."""
    ip = h.ip()
    try:
        if route == "catalog" and method in ("GET", "HEAD"):
            return h.send_json(*catalog(core))
        if route == "order" and method == "GET":
            q = core.parse_qs(core.urlparse(h.path).query)
            try:
                oid = int((q.get("id") or [""])[0])
            except ValueError:
                oid = 0
            if not core.LIMITER.allow(("m-status", ip), LIMIT_STATUS, 3600):
                return h.send_json(429, {"ok": False, "error": "rate"})
            return h.send_json(*customer_order(core, oid, (q.get("t") or [""])[0]))
        if method != "POST" and route in ("orders", "order-cancel", "login", "shop/order", "shop/open", "rider/online", "rider/job"):
            return h.send_json(405, {"ok": False, "error": "method"})
        if method == "POST":
            if h.headers.get("X-FK") != "1" or not (h.headers.get("Content-Type") or "").lower().startswith("application/json"):
                return h.send_json(400, {"ok": False, "error": "request"})
            data, err = h.read_json()
            if err or not isinstance(data, dict):
                return h.send_json(413 if err == "size" else 400, {"ok": False, "error": err or "json"})
        else:
            data = {}
        if route == "orders":
            if not core.LIMITER.allow(("m-orders", ip), LIMIT_ORDERS, 3600):
                return h.send_json(429, {"ok": False, "error": "rate", "message": "Too many orders from here. Please call us."})
            return h.send_json(*place_order(core, data, ip, h.headers.get("User-Agent", "")))
        if route == "order-cancel":
            return h.send_json(*customer_cancel(core, data))
        if route == "login":
            if not core.LIMITER.allow(("m-login", ip), 20, 900):
                return h.send_json(429, {"ok": False, "error": "rate", "message": "Too many tries. Wait 15 minutes."})
            return h.send_json(*login(core, data))
        role = "shop" if route.startswith("shop/") else "rider" if route.startswith("rider/") else None
        if not role:
            return h.send_json(404, {"ok": False, "error": "not_found"})
        with closing(core.db()) as c:
            who = read_token(core, c, h.headers.get("X-FK-Auth", ""), role)
            if not who:
                return h.send_json(401, {"ok": False, "error": "auth", "message": "Please log in again."})
            if route == "shop/me":
                return h.send_json(200, {"ok": True, "shop": shop_me(c, who)})
            if route == "shop/orders":
                return h.send_json(200, {"ok": True, "orders": shop_orders(c, who), "open": bool(who["is_open"])})
            if route == "shop/order":
                return h.send_json(*shop_action(core, c, who, data))
            if route == "shop/open":
                c.execute("UPDATE m_shops SET is_open=? WHERE id=?", (1 if data.get("open") else 0, who["id"]))
                c.commit()
                return h.send_json(200, {"ok": True, "open": bool(data.get("open"))})
            if route == "shop/items" and method == "GET":
                rows = c.execute("SELECT * FROM m_items WHERE shop_id=? ORDER BY sort, id", (who["id"],)).fetchall()
                return h.send_json(200, {"ok": True, "items": [item_dict(r) for r in rows]})
            if route == "shop/items":
                return h.send_json(*shop_items_save(core, c, who, data))
            if route == "rider/me":
                return h.send_json(200, {"ok": True, "rider": rider_me(c, who)})
            if route == "rider/online":
                c.execute("UPDATE m_riders SET online=? WHERE id=?", (1 if data.get("online") else 0, who["id"]))
                c.commit()
                return h.send_json(200, {"ok": True, "online": bool(data.get("online"))})
            if route == "rider/jobs":
                return h.send_json(200, dict(ok=True, **rider_jobs(c, who)))
            if route == "rider/job":
                return h.send_json(*rider_action(core, c, who, data))
        return h.send_json(404, {"ok": False, "error": "not_found"})
    except Exception:
        core.traceback.print_exc()
        return h.send_json(500, {"ok": False, "error": "server"})


# ---------------------------------------------------------------- admin

PHONE_HELP = "Check the mobile number: 10 digits, starting with 6, 7, 8 or 9 (a +91 in front is fine)."
PIN_HELP = "The PIN must be 4 to 6 digits, numbers only."


def admin_api(core, d):
    action = d.get("action")
    now = core.now_iso()
    with closing(core.db()) as c:
        if action == "add_shop":
            name, kind, area = core.clean(d.get("name"), 80), d.get("kind"), core.clean(d.get("area"), 40)
            phone, pin = core.norm_phone(d.get("phone")), d.get("pin")
            if not name:
                return bad("name", "Give the shop a name.")
            if kind not in KINDS:
                return bad("kind", "Choose what the shop sells.")
            if area not in AREAS:
                return bad("area", "Choose one of the pilot areas: %s." % ", ".join(AREAS))
            if not phone:
                return bad("phone", PHONE_HELP)
            if not valid_pin(pin):
                return bad("pin", PIN_HELP)
            if c.execute("SELECT id FROM m_shops WHERE phone=?", (phone,)).fetchone():
                return bad("phone", "Another shop already uses that number.")
            try:
                fee = float(d.get("fee_pct") if d.get("fee_pct") not in (None, "") else SHOP_FEE_PCT)
                min_order = float(d.get("min_order") or 0)
            except (TypeError, ValueError):
                return bad("fee", "The fee and the minimum order must be numbers.")
            sid = c.insert_id("INSERT INTO m_shops(created_at,name,kind,area,address,phone,pin_hash,is_open,fee_pct,min_order,fssai,active,demo)"
                              " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                              (now, name, kind, area, core.clean(d.get("address"), 160), phone, pin_hash(pin), 0, fee, min_order,
                               core.clean(d.get("fssai"), 20), 1, 0))
            if d.get("starter"):
                add_items(c, core, sid, kind)
        elif action == "add_rider":
            name, phone, pin = core.clean(d.get("name"), 60), core.norm_phone(d.get("phone")), d.get("pin")
            if not name:
                return bad("name", "Give the rider a name.")
            if not phone:
                return bad("phone", PHONE_HELP)
            if not valid_pin(pin):
                return bad("pin", PIN_HELP)
            if c.execute("SELECT id FROM m_riders WHERE phone=?", (phone,)).fetchone():
                return bad("phone", "Another rider already uses that number.")
            c.insert_id("INSERT INTO m_riders(created_at,name,phone,pin_hash,online,active,demo) VALUES(?,?,?,?,?,?,?)",
                        (now, name, phone, pin_hash(pin), 0, 1, 0))
        elif action in ("shop_pin", "rider_pin"):
            if not valid_pin(d.get("pin")) or type(d.get("id")) is not int:
                return bad("pin", PIN_HELP)
            c.execute("UPDATE %s SET pin_hash=? WHERE id=?" % ("m_shops" if action == "shop_pin" else "m_riders"), (pin_hash(d["pin"]), d["id"]))
        elif action in ("shop_active", "rider_active"):
            if type(d.get("id")) is not int:
                return bad("id", "Which one?")
            c.execute("UPDATE %s SET active=? WHERE id=?" % ("m_shops" if action == "shop_active" else "m_riders"), (1 if d.get("on") else 0, d["id"]))
        elif action == "shop_open":
            if type(d.get("id")) is not int:
                return bad("id", "Which shop?")
            c.execute("UPDATE m_shops SET is_open=? WHERE id=?", (1 if d.get("on") else 0, d["id"]))
        elif action == "starter_items":
            s = c.execute("SELECT * FROM m_shops WHERE id=?", (d.get("id") if type(d.get("id")) is int else 0,)).fetchone()
            if not s:
                return bad("id", "Which shop?")
            add_items(c, core, s["id"], s["kind"])
        elif action == "cancel_order":
            oid = d.get("id") if type(d.get("id")) is int else 0
            c.execute("UPDATE m_orders SET status='cancelled', cancel_reason=?, updated_at=? WHERE id=? AND status NOT IN ('delivered','cancelled')",
                      (core.clean(d.get("reason"), 120) or "Cancelled by FrescoKart", now, oid))
        elif action == "assign_rider":
            oid, rid = d.get("id"), d.get("rider_id")
            if type(oid) is not int or not (rid is None or type(rid) is int):
                return bad("id", "Which order and rider?")
            c.execute("UPDATE m_orders SET rider_id=?, updated_at=? WHERE id=? AND status NOT IN ('delivered','cancelled')", (rid, now, oid))
        elif action == "demo_add":
            for name, kind, area, address, phone in DEMO_SHOPS:
                if c.execute("SELECT id FROM m_shops WHERE phone=?", (phone,)).fetchone():
                    continue
                sid = c.insert_id("INSERT INTO m_shops(created_at,name,kind,area,address,phone,pin_hash,is_open,fee_pct,min_order,active,demo)"
                                  " VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                                  (now, name, kind, area, address, phone, pin_hash(DEMO_PIN), 1, SHOP_FEE_PCT, 0, 1, 1))
                add_items(c, core, sid, kind)
            if not c.execute("SELECT id FROM m_riders WHERE phone=?", (DEMO_RIDER[1],)).fetchone():
                c.insert_id("INSERT INTO m_riders(created_at,name,phone,pin_hash,online,active,demo) VALUES(?,?,?,?,?,?,?)",
                            (now, DEMO_RIDER[0], DEMO_RIDER[1], pin_hash(DEMO_PIN), 0, 1, 1))
        elif action == "demo_remove":
            ids = [r["id"] for r in c.execute("SELECT id FROM m_shops WHERE demo=1").fetchall()]
            for sid in ids:
                c.execute("DELETE FROM m_items WHERE shop_id=?", (sid,))
            for r in c.execute("SELECT id FROM m_orders WHERE demo=1").fetchall():
                for t in ("m_order_items", "m_order_shops"):
                    c.execute("DELETE FROM %s WHERE order_id=?" % t, (r["id"],))
                c.execute("DELETE FROM m_orders WHERE id=?", (r["id"],))
            c.execute("DELETE FROM m_shops WHERE demo=1")
            c.execute("DELETE FROM m_riders WHERE demo=1")
        else:
            return bad("action", "Unknown action.")
        c.commit()
    return 200, {"ok": True}


ADMIN_EXTRA_CSS = """
form.row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:10px}
form.row label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}
form.row input,form.row select{font:inherit;padding:7px 9px;border:1px solid #C9D3CC;border-radius:8px;min-width:120px}
button.b{font:inherit;font-weight:700;padding:8px 14px;border:0;border-radius:9px;background:var(--green);color:#fff;cursor:pointer}
button.l{font:inherit;padding:5px 10px;border:1px solid #C9D3CC;border-radius:8px;background:#fff;cursor:pointer}
.tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:700;background:#F3F5F4;color:#4F5D55}
.tag.g{background:#E6F5EC;color:#0B5A36}.tag.a{background:#FFF4E5;color:#7A4A00}.tag.r{background:#FEF3F2;color:#B42318}
.note{background:#FFF4E5;color:#5C3A00;border-radius:12px;padding:12px 14px;margin-top:14px;font-size:14px}
"""

ADMIN_MARKET_JS = """
function post(body){return fetch("/admin/market/api",{method:"POST",headers:{"Content-Type":"application/json","X-FK-Admin":"1"},body:JSON.stringify(body)})
 .then(function(r){return r.json()}).then(function(j){if(!j.ok){alert(j.message||j.error||"Could not save");return}location.reload()})
 .catch(function(){alert("Could not reach the server.")})}
document.addEventListener("submit",function(e){var f=e.target;if(!f.dataset.action)return;e.preventDefault();
 var d={action:f.dataset.action};new FormData(f).forEach(function(v,k){d[k]=v});
 if(f.querySelector("[name=starter]"))d.starter=f.querySelector("[name=starter]").checked;post(d)});
document.addEventListener("click",function(e){var b=e.target.closest("button[data-act]");if(!b)return;
 var d={action:b.dataset.act};if(b.dataset.id)d.id=+b.dataset.id;if(b.dataset.on)d.on=b.dataset.on==="1";
 if(b.dataset.ask){var v=prompt(b.dataset.ask);if(v===null)return;d[b.dataset.field||"pin"]=v}
 if(b.dataset.act==="assign_rider"){var s=document.getElementById("rs"+b.dataset.id);d.rider_id=s.value?+s.value:null}
 if(b.dataset.confirm&&!confirm(b.dataset.confirm))return;post(d)});
setTimeout(function(){if(!document.querySelector("input:focus,select:focus"))location.reload()},30000);
"""


def render_admin(core):
    esc = html.escape
    with closing(core.db()) as c:
        shops = c.execute("SELECT s.*, (SELECT COUNT(*) FROM m_items i WHERE i.shop_id=s.id) AS n_items FROM m_shops s ORDER BY s.id").fetchall()
        riders = c.execute("SELECT * FROM m_riders ORDER BY id").fetchall()
        orders = [order_detail(c, r["id"], "admin") for r in c.execute("SELECT id FROM m_orders ORDER BY id DESC LIMIT 60").fetchall()]
    rider_names = {r["id"]: r["name"] for r in riders}
    tone = {"placed": "a", "accepted": "a", "ready": "a", "picked": "a", "delivered": "g", "cancelled": "r", "new": "a", "rejected": "r"}

    def tag(s):
        return '<span class="tag %s">%s</span>' % (tone.get(s, ""), esc(s))

    order_rows = ""
    for o in orders:
        shops_txt = "<br>".join("%s %s · Rs %s%s" % (esc(s["name"]), tag(s["status"]), "{:,.0f}".format(s["packed_total"] if s["packed_total"] is not None else s["subtotal"]),
                                                      (" · PIN " + esc(s["pin"])) if s["status"] in ("accepted", "ready") else "") for s in o["shops"])
        opts = '<option value="">No rider</option>' + "".join('<option value="%d"%s>%s</option>' % (r["id"], " selected" if r["id"] == o["rider_id"] else "", esc(r["name"])) for r in riders if r["active"])
        live = o["status"] not in ("delivered", "cancelled")
        actions = ('<select id="rs%d">%s</select> <button class=l data-act=assign_rider data-id=%d>Set rider</button> '
                   '<button class=l data-act=cancel_order data-id=%d data-ask="Why cancel? The customer sees this." data-field=reason>Cancel</button>'
                   % (o["id"], opts, o["id"], o["id"])) if live else ""
        order_rows += ("<tr><td><b>%s</b>%s<br><span class=muted>%s</span></td><td>%s<br><span class=muted>%s</span></td><td>%s<br>%s<br><span class=muted>%s · %s</span></td>"
                       "<td>%s</td><td class=num>Rs %s<br><span class=muted>%s</span></td><td>%s<br><span class=muted>code %s</span></td><td>%s</td></tr>"
                       % (o["ref"], " <span class=tag>demo</span>" if o["demo"] else "", esc(core.to_ist(o["created_at"])), tag(o["status"]), esc(o["cancel_reason"]),
                          esc(o["name"] or "No name"), esc(o["phone"]), esc(o["area"]), esc(o["address"]), shops_txt,
                          "{:,.0f}".format(o["total"]), "fee %g, %s" % (o["delivery_fee"], o["pay_mode"]),
                          esc(rider_names.get(o["rider_id"], "No rider yet")), esc(o["code"]), actions))
    shop_rows = "".join(
        "<tr><td><b>%s</b>%s<br><span class=muted>%s · %s</span></td><td>%s<br><span class=muted>%s</span></td><td class=num>%d</td><td>%s</td><td>%s %s %s %s</td></tr>"
        % (esc(s["name"]), " <span class=tag>demo</span>" if s["demo"] else "", esc(s["kind"]), esc(s["area"]), esc(s["phone"]), esc(s["address"] or ""),
           s["n_items"], tag("open" if s["is_open"] else "closed") if s["active"] else tag("off"),
           '<button class=l data-act=shop_open data-id=%d data-on=%s>%s</button>' % (s["id"], "0" if s["is_open"] else "1", "Close" if s["is_open"] else "Open"),
           '<button class=l data-act=shop_pin data-id=%d data-ask="New 4 to 6 digit PIN for this shop">New PIN</button>' % s["id"],
           '<button class=l data-act=starter_items data-id=%d data-confirm="Add the starter items for this kind of shop?">Add starter items</button>' % s["id"],
           '<button class=l data-act=shop_active data-id=%d data-on=%s>%s</button>' % (s["id"], "0" if s["active"] else "1", "Turn off" if s["active"] else "Turn on"))
        for s in shops)
    rider_rows = "".join(
        "<tr><td><b>%s</b>%s</td><td>%s</td><td>%s</td><td>%s %s</td></tr>"
        % (esc(r["name"]), " <span class=tag>demo</span>" if r["demo"] else "", esc(r["phone"]), tag("online" if r["online"] else "offline"),
           '<button class=l data-act=rider_pin data-id=%d data-ask="New 4 to 6 digit PIN for this rider">New PIN</button>' % r["id"],
           '<button class=l data-act=rider_active data-id=%d data-on=%s>%s</button>' % (r["id"], "0" if r["active"] else "1", "Turn off" if r["active"] else "Turn on"))
        for r in riders)
    area_opts = "".join("<option>%s</option>" % esc(a) for a in AREAS)
    kind_opts = "".join('<option value="%s">%s</option>' % (k, {"fish": "Fish", "meat": "Meat and chicken", "veg": "Vegetables", "grocery": "Groceries"}[k]) for k in KINDS)

    def table(head, rows, empty):
        if not rows:
            return '<div class="wrap"><div class=empty>%s</div></div>' % empty
        return '<div class="wrap"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % ("".join("<th>%s</th>" % h for h in head), rows)

    return """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>FrescoKart shops admin</title><style>%s%s</style>
<header><b>FrescoKart shops pilot</b><span><a href="/admin">Kit orders</a><a href="/market/">Customer app</a><a href="/partner/">Shop app</a><a href="/rider/">Rider app</a></span></header>
<main>
<div class="note">Pilot settings: delivery Rs %g for one shop, Rs %g more for each extra shop, free over Rs %g; shop fee %g%%; rider pay Rs %g a trip plus Rs %g for each extra pickup; areas %s. These are examples. Change them with the FK_M_ settings in Vercel.</div>
<h2>Orders</h2>%s
<h2>Shops</h2>%s
<form class="row" data-action="add_shop">
<label>Shop name<input name="name" required></label><label>Kind<select name="kind">%s</select></label><label>Area<select name="area">%s</select></label>
<label>Address<input name="address"></label><label>Owner's mobile<input name="phone" required inputmode="tel"></label><label>PIN for the app<input name="pin" required inputmode="numeric" maxlength="6"></label>
<label>Fee %%<input name="fee_pct" value="%g" inputmode="decimal" style="min-width:60px;width:70px"></label><label>Min. order Rs<input name="min_order" value="0" inputmode="numeric" style="min-width:60px;width:80px"></label>
<label>FSSAI number<input name="fssai"></label><label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="starter" checked style="min-width:0">Add starter items</label>
<button class=b>Add shop</button></form>
<h2>Riders</h2>%s
<form class="row" data-action="add_rider"><label>Name<input name="name" required></label><label>Mobile<input name="phone" required inputmode="tel"></label>
<label>PIN for the app<input name="pin" required inputmode="numeric" maxlength="6"></label><button class=b>Add rider</button></form>
<h2>Demo data</h2>
<p class="muted">Adds four demo shops (marked "demo", PIN %s, mobiles 90000 00001 to 90000 00004) and a demo rider (90000 00009, PIN %s), so you can try the three apps. Remove them before real customers arrive.</p>
<p><button class=l data-act=demo_add>Add demo shops and rider</button> <button class=l data-act=demo_remove data-confirm="Delete every demo shop, demo rider and demo order?">Remove demo data</button></p>
<p class="muted">Times are in IST. The page refreshes every 30 seconds.</p>
</main><script>%s</script></html>""" % (
        core.ADMIN_CSS, ADMIN_EXTRA_CSS, DELIVERY_FEE, EXTRA_SHOP_FEE, FREE_DELIVERY_OVER, SHOP_FEE_PCT, RIDER_TRIP_PAY, RIDER_EXTRA_PICKUP,
        esc(", ".join(AREAS)),
        table(["Order", "Status", "Customer", "Shops", "Total", "Rider", ""], order_rows, "No shop orders yet."),
        table(["Shop", "Owner", "Items", "Status", ""], shop_rows, "No shops yet. Add the first one below."),
        kind_opts, area_opts, SHOP_FEE_PCT,
        table(["Rider", "Mobile", "Status", ""], rider_rows, "No riders yet."),
        DEMO_PIN, DEMO_PIN, ADMIN_MARKET_JS)
