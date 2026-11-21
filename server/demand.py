"""FrescoKart demand test: the /join waiting list for customers, shop owners and delivery riders, all over Kerala.

The public page /join/ asks three things: who you are, where you live (PIN code, or district then place) and your WhatsApp
number. Places come from the Department of Posts directory (server/kerala_places.py, made by build_places.py). Places that
share a PIN code form one area; progress, targets and the "which place goes first" board count by area. Every sign-up
gets a personal share link. Customers can name the nearby shops they buy from, and the admin page ranks those shops.

JSON routes, all under /api/d/ (on Vercel they reach api/demand.py through a rewrite):
  GET  board            counts per area and per district (only totals, never people)
  POST join             {role, district, pin, place, phone, name, consent, lang, ref, src, utm}
  POST more             {id, t, ...answers}   the optional questions after joining
  GET  me?id=&t=        the visitor's own place in the queue and how many people joined with their link
  GET  ref?c=           where the person who shared a link lives, so the page can preselect it
  POST visit            {src}   one count per visitor per day per source, to compare posters and ads
  GET  cron/daily       the evening summary to Telegram (Vercel Cron calls it once a day)
The admin page /admin/leads (same password as /admin) shows everything live, sets targets and WhatsApp group links,
adds leads by hand, imports Meta lead-form CSVs, builds tracked links with QR codes and connects the Telegram alerts.

Settings (environment variables, all optional):
  FK_TG_TOKEN   the Telegram bot token from @BotFather. With it, every sign-up and the daily summary reach your phone.
  FK_TG_CHAT    the chat that gets them. Leave it empty: the admin page finds your chat after you message the bot.
  CRON_SECRET   Vercel sends it with cron calls; when set, other callers cannot trigger the summary.
This module never imports server.app: app.py passes itself in as `core`.
"""
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sys
import threading
from collections import defaultdict
from contextlib import closing
from datetime import datetime, timedelta, timezone

try:
    from .kerala_places import DATA as PLACES
except ImportError:
    from kerala_places import DATA as PLACES

IST = timezone(timedelta(hours=5, minutes=30))
ROLES = ("customer", "shop", "rider")
STATUSES = ("new", "welcomed", "in_group", "prebooked", "not_interested", "spam")
LANGS = ("en", "ml")
BUYS = ("fish", "chicken", "mutton", "beef", "vegetables", "fruits", "groceries", "eggs")
OFTEN = ("daily", "few", "weekly", "sometimes")
KINDS = ("fish", "meat", "veg", "grocery", "other")
TIMES = ("morning", "afternoon", "evening")
VEHICLES = ("scooter", "bike", "none")
YESNO = ("yes", "no")
FIRST_WEEK = ("yes", "maybe", "no")
CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I/L, so a code read aloud is not mistyped
LIMIT_JOIN = int(os.environ.get("FK_D_LIMIT_JOIN", "12"))  # sign-ups per visitor per hour
LIMIT_MORE = int(os.environ.get("FK_D_LIMIT_MORE", "40"))
LIMIT_VISIT = int(os.environ.get("FK_D_LIMIT_VISIT", "120"))
TG_TOKEN = os.environ.get("FK_TG_TOKEN", "").strip()
TG_CHAT_ENV = os.environ.get("FK_TG_CHAT", "").strip()
CRON_SECRET = os.environ.get("CRON_SECRET", "").strip()
GROUP_LINK = re.compile(r"https://(chat\.whatsapp\.com/[A-Za-z0-9]{10,40}|whatsapp\.com/channel/[A-Za-z0-9]{10,40})/?")

# Kerala places, from the generated file
D_IDS = [d[0] for d in PLACES["districts"]]
DISTRICTS = {d[0]: {"name": d[1], "ml": d[2]} for d in PLACES["districts"]}
ZONES = {z[1]: {"name": z[0], "district": D_IDS[z[2]], "slug": z[3]} for z in PLACES["zones"]}
_ZPIN = [z[1] for z in PLACES["zones"]]
PIN_PLACES = defaultdict(dict)       # pin -> {lower name: name}
PLACE_PINS = defaultdict(list)       # (district, lower name) -> [pin]
NAME_PINS = defaultdict(list)        # lower name -> [pin], any district
for _name, _zi, _di in PLACES["places"]:
    _pin = _ZPIN[_zi]
    PIN_PLACES[_pin][_name.lower()] = _name
    PLACE_PINS[(D_IDS[_di], _name.lower())].append(_pin)
    NAME_PINS[_name.lower()].append(_pin)

# Starting targets. Change them on the admin page, not here.
DEFAULTS = {
    "default_target": 100,  # homes an area needs on the list before it counts as ready
    "targets": {},          # a different target for chosen areas: {pin: homes}
    "shop_target": 5,       # shops per area
    "rider_target": 6,      # riders per area
    "groups": {},           # WhatsApp invite links: a PIN, a district id, or "_shop" / "_rider" / "_all"
    "support_wa": "918157863503",
    "tg_chat": "",
}

SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS d_leads(
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, role TEXT NOT NULL,
  name TEXT, phone TEXT NOT NULL, district TEXT, pin TEXT, place TEXT, zone TEXT NOT NULL, zone_name TEXT, flat TEXT,
  lang TEXT, consent INTEGER NOT NULL, code TEXT NOT NULL, referred_by TEXT, src TEXT, utm_json TEXT,
  status TEXT NOT NULL DEFAULT 'new', note TEXT, extra_json TEXT, first_week TEXT, origin TEXT NOT NULL DEFAULT 'page',
  ip_hash TEXT, ua TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS d_leads_phone_role ON d_leads(phone, role);
CREATE UNIQUE INDEX IF NOT EXISTS d_leads_code ON d_leads(code);
CREATE INDEX IF NOT EXISTS d_leads_zone ON d_leads(role, zone);
CREATE INDEX IF NOT EXISTS d_leads_district ON d_leads(district);
CREATE INDEX IF NOT EXISTS d_leads_ref ON d_leads(referred_by);
CREATE TABLE IF NOT EXISTS d_shop_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, lead_id INTEGER NOT NULL, name TEXT NOT NULL,
  name_key TEXT NOT NULL, kind TEXT, area TEXT, district TEXT);
CREATE INDEX IF NOT EXISTS d_sr_lead ON d_shop_requests(lead_id);
CREATE TABLE IF NOT EXISTS d_visits(
  id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, src TEXT NOT NULL, ip_hash TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS d_visits_u ON d_visits(day, src, ip_hash);
CREATE TABLE IF NOT EXISTS d_kv(k TEXT PRIMARY KEY, v TEXT NOT NULL);
"""
SCHEMA_PG = (SCHEMA_SQLITE.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY")
             .replace("lead_id INTEGER", "lead_id BIGINT"))
TABLES = ("d_leads", "d_shop_requests", "d_visits", "d_kv")


# ---------- small helpers ----------

def _bad(code, message):
    return 400, {"ok": False, "error": code, "message": message}


def _token(core, lid):
    """The key a visitor gets back when they join, so only they can add answers or see their own place."""
    return hmac.new(core.secret().encode(), ("lead:%d" % lid).encode(), hashlib.sha256).hexdigest()[:24]


def _token_ok(core, lid, t):
    return isinstance(t, str) and isinstance(lid, int) and 0 < lid < 2 ** 62 and hmac.compare_digest(t.encode(), _token(core, lid).encode())


def _kv_get(c, k):
    r = c.execute("SELECT v FROM d_kv WHERE k=?", (k,)).fetchone()
    return r[0] if r else None


def _kv_set(c, k, v):
    c.execute("INSERT INTO d_kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (k, v))


def settings(c):
    s = json.loads(json.dumps(DEFAULTS))
    try:
        saved = json.loads(_kv_get(c, "settings") or "{}")
    except ValueError:
        saved = {}
    if isinstance(saved, dict):
        s.update({k: v for k, v in saved.items() if k in DEFAULTS})
    return s


def _src(value):
    s = re.sub(r"[^a-z0-9._:-]+", "-", str(value or "").strip().lower()).strip("-")[:60]
    return s or "direct"


def _code(value):
    s = re.sub(r"[^A-Z0-9]", "", str(value or "").upper())
    return s if len(s) == 6 else ""


def _shop_key(name):
    return re.sub(r"[^0-9a-zഀ-ൿ]+", "", name.lower())[:60]


def _pick(value, allowed):
    return value if value in allowed else None


def _pick_list(values, allowed, limit=10):
    out = []
    for v in values if isinstance(values, list) else []:
        if v in allowed and v not in out:
            out.append(v)
    return out[:limit]


def _ist_day(iso):
    try:
        return datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).astimezone(IST).strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        return ""


def _today_ist():
    return datetime.now(IST).strftime("%Y-%m-%d")


def _district_name(did):
    return DISTRICTS[did]["name"] if did in DISTRICTS else ""


def _target(s, role, lead):
    if not lead["pin"]:  # a place we could not match to a PIN area has no target yet
        return None
    if role == "shop":
        return int(s["shop_target"])
    if role == "rider":
        return int(s["rider_target"])
    return int((s.get("targets") or {}).get(lead["pin"]) or s["default_target"])


def _group(s, role, lead):
    g = s.get("groups") or {}
    if role in ("shop", "rider"):
        return g.get("_" + role) or g.get("_all") or ""
    return g.get(lead["pin"] or "") or g.get(lead["district"] or "") or g.get("_all") or ""


def _area_label(lead):
    return lead["zone_name"] or lead["place"] or _district_name(lead["district"]) or "your area"


# ---------- where someone lives ----------

def locate(core, pin, place, district):
    """Turn what the page sent (or a CSV row) into district, PIN, place and the area (zone) it counts toward.
    Returns (dict, None) or (None, error code)."""
    pin = re.sub(r"\D", "", str(pin or ""))[:6]
    place = core.clean(place, 60)
    district = str(district or "").strip().lower()
    if pin:
        z = ZONES.get(pin)
        if not z:
            return None, "pin"
        known = PIN_PLACES.get(pin, {})
        place = known.get(place.lower(), place) or z["name"]
        return {"district": z["district"], "pin": pin, "place": place, "zone": pin, "zone_name": z["name"],
                "typed": place.lower() not in known}, None
    if district not in DISTRICTS:
        return None, "district"
    if len(place) < 2:
        return None, "place"
    pins = PLACE_PINS.get((district, place.lower()))
    if pins:
        p = pins[0]
        return {"district": district, "pin": p, "place": PIN_PLACES[p][place.lower()], "zone": p,
                "zone_name": ZONES[p]["name"], "typed": False}, None
    nice = place[:1].upper() + place[1:]
    return {"district": district, "pin": "", "place": nice, "zone": "t:%s:%s" % (district, place.lower()),
            "zone_name": "%s (%s)" % (nice, _district_name(district)), "typed": True}, None


def locate_text(core, text, district_hint=""):
    """Best guess from free text, for a CSV import or a hand entry: a PIN in it, a known place, or a district name."""
    text = core.clean(text, 80)
    m = re.search(r"\b(6[789]\d{4})\b", text)
    if m and m.group(1) in ZONES:
        return locate(core, m.group(1), "", "")[0]
    low = text.lower()
    hint = str(district_hint or "").lower()
    if hint in DISTRICTS and PLACE_PINS.get((hint, low)):
        return locate(core, "", text, hint)[0]
    pins = NAME_PINS.get(low)
    if pins and len({ZONES[p]["district"] for p in pins}) == 1:
        return locate(core, pins[0], text, "")[0]
    for did, d in DISTRICTS.items():
        if did in re.sub(r"[^a-z]", "", low) or d["name"].lower() in low:
            hint = did
            break
    if hint in DISTRICTS:
        return locate(core, "", text or DISTRICTS[hint]["name"], hint)[0]
    return {"district": "", "pin": "", "place": text or "Not given", "zone": "t::%s" % low, "zone_name": text or "Not given", "typed": True}


def _place(c, lead):
    """Where this lead stands in its area (people of the same role only) and how many have joined there in all."""
    where, args = "role=? AND zone=? AND status!='spam'", (lead["role"], lead["zone"])
    pos = c.execute("SELECT COUNT(*) FROM d_leads WHERE " + where + " AND id<=?", args + (lead["id"],)).fetchone()[0]
    count = c.execute("SELECT COUNT(*) FROM d_leads WHERE " + where, args).fetchone()[0]
    return pos, count


def _rank(c, lead):
    """The area's place in the Kerala race (customers on the list), 1 = most."""
    if not lead["pin"]:
        return None
    mine = c.execute("SELECT COUNT(*) FROM d_leads WHERE role='customer' AND zone=? AND status!='spam'", (lead["zone"],)).fetchone()[0]
    ahead = c.execute("SELECT COUNT(*) FROM (SELECT zone FROM d_leads WHERE role='customer' AND status!='spam' AND pin<>'' "
                      "GROUP BY zone HAVING COUNT(*)>?) t", (mine,)).fetchone()[0]
    return ahead + 1


def _referrals(c, code):
    return c.execute("SELECT COUNT(*) FROM d_leads WHERE referred_by=? AND status!='spam'", (code,)).fetchone()[0]


def _new_code(c):
    for _ in range(20):
        code = "".join(secrets.choice(CODE_CHARS) for _ in range(6))
        if not c.execute("SELECT 1 FROM d_leads WHERE code=?", (code,)).fetchone():
            return code
    raise RuntimeError("could not make a free referral code")


# ---------- Telegram ----------

def _tg_chat(s):
    return TG_CHAT_ENV or str(s.get("tg_chat") or "")


def _tg_call(method, payload, timeout=6):
    import urllib.request
    req = urllib.request.Request("https://api.telegram.org/bot%s/%s" % (TG_TOKEN, method),
                                 data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def tg_send(core, chat, text, wait=False):
    """Send one message to the owner's Telegram. A failure is only logged: the sign-up is already saved."""
    if not TG_TOKEN or not chat:
        return False

    def run():
        try:
            _tg_call("sendMessage", {"chat_id": chat, "text": text, "disable_web_page_preview": True})
            return True
        except Exception as e:
            sys.stderr.write("telegram failed: %s\n" % e)
            return False

    if wait or core.ON_VERCEL:  # a Vercel function can be frozen as soon as it answers, so send before answering
        return run()
    threading.Thread(target=run, daemon=True).start()
    return True


def _alert(core, s, lead, reply, ref_name):
    role = {"customer": "customer", "shop": "SHOP", "rider": "RIDER"}[lead["role"]]
    where = _area_label(lead) + (" %s" % lead["pin"] if lead["pin"] else "")
    if lead["district"]:
        where += ", " + _district_name(lead["district"])
    goal = " (#%d of %d)" % (reply["pos"], reply["target"]) if reply["target"] else " (#%d)" % reply["pos"]
    lines = ["New %s · %s%s" % (role, where, goal), "%s · %s" % (lead["name"] or "no name", lead["phone"])]
    if lead["place"] and lead["place"] != lead["zone_name"]:
        lines[0] += " · place: %s" % lead["place"]
    extra = "from %s" % lead["src"]
    if ref_name:
        extra += " · invited by %s" % ref_name
    lines.append(extra)
    text = "\n".join(lines)
    tg_send(core, _tg_chat(s), text)
    core.notify(text.replace("\n", " | "))


def summary_text(c, s):
    rows = c.execute("SELECT created_at, role, district, zone, zone_name, pin, src, first_week FROM d_leads WHERE status!='spam'").fetchall()
    today = _today_ist()
    t_rows = [r for r in rows if _ist_day(r["created_at"]) == today]
    by = lambda rs, role: sum(1 for r in rs if r["role"] == role)  # noqa: E731
    lines = ["FrescoKart sign-ups, %s" % datetime.now(IST).strftime("%d %b"),
             "Today: %d new (%d customers, %d shops, %d riders)" % (len(t_rows), by(t_rows, "customer"), by(t_rows, "shop"), by(t_rows, "rider")),
             "All time: %d customers, %d shops, %d riders" % (by(rows, "customer"), by(rows, "shop"), by(rows, "rider"))]
    zones = defaultdict(lambda: {"c": 0, "t": 0, "s": 0, "r": 0, "name": "", "pin": ""})
    for r in rows:
        if not r["pin"]:
            continue
        z = zones[r["zone"]]
        z["name"], z["pin"] = r["zone_name"], r["pin"]
        z[{"customer": "c", "shop": "s", "rider": "r"}[r["role"]]] += 1
        z["t"] += r["role"] == "customer" and _ist_day(r["created_at"]) == today
    top = sorted(zones.values(), key=lambda z: -z["c"])[:5]
    if top:
        lines += ["", "Top places:"]
        for z in top:
            target = int((s.get("targets") or {}).get(z["pin"]) or s["default_target"])
            lines.append("%s %s: %d/%d homes (+%d), %d shops, %d riders" % (z["name"], z["pin"], z["c"], target, z["t"], z["s"], z["r"]))
    dist = defaultdict(int)
    for r in rows:
        if r["role"] == "customer" and r["district"]:
            dist[r["district"]] += 1
    if dist:
        lines += ["", "Districts: " + ", ".join("%s %d" % (_district_name(d), n) for d, n in sorted(dist.items(), key=lambda kv: -kv[1])[:6])]
    srcs = defaultdict(int)
    for r in t_rows:
        srcs[r["src"] or "direct"] += 1
    if srcs:
        lines.append("Best sources today: " + ", ".join("%s (%d)" % kv for kv in sorted(srcs.items(), key=lambda kv: -kv[1])[:3]))
    lines.append("Would order in week 1: %d" % sum(1 for r in rows if r["role"] == "customer" and r["first_week"] == "yes"))
    top_shop = c.execute("SELECT name_key, MIN(name) AS name, COUNT(DISTINCT lead_id) AS n FROM d_shop_requests "
                         "GROUP BY name_key ORDER BY n DESC LIMIT 1").fetchone()
    if top_shop and top_shop["n"]:
        lines.append("Most requested shop: %s (%d)" % (top_shop["name"], top_shop["n"]))
    return "\n".join(lines)


# ---------- public routes ----------

def board(core):
    with closing(core.db()) as c:
        s = settings(c)
        zones = {}
        for r in c.execute("SELECT zone, role, COUNT(*) AS n FROM d_leads WHERE status!='spam' AND pin<>'' GROUP BY zone, role"):
            z = zones.setdefault(r["zone"], [r["zone"], 0, 0, 0])
            z[1 + ROLES.index(r["role"])] = r["n"]
        districts = {}
        for r in c.execute("SELECT district, role, COUNT(*) AS n FROM d_leads WHERE status!='spam' AND district<>'' GROUP BY district, role"):
            districts.setdefault(r["district"], [0, 0, 0])[ROLES.index(r["role"])] = r["n"]
    total = {role: sum(v[i] for v in districts.values()) for i, role in enumerate(ROLES)}
    # [pin, name, district, customers, shops, riders] for every area with at least one sign-up
    out = [[pin, ZONES[pin]["name"], ZONES[pin]["district"], c_, sh, ri] for pin, c_, sh, ri in zones.values() if pin in ZONES]
    out.sort(key=lambda z: (-z[3], -(z[4] + z[5])))
    return 200, {"ok": True, "zones": out, "districts": districts, "total": total, "default_target": int(s["default_target"]),
                 "targets": s.get("targets") or {}, "shop_target": int(s["shop_target"]), "rider_target": int(s["rider_target"]),
                 "support_wa": s["support_wa"]}


def _lead_reply(core, c, s, lead, already=False):
    pos, count = _place(c, lead)
    return {"ok": True, "already": already, "id": lead["id"], "t": _token(core, lead["id"]), "code": lead["code"],
            "role": lead["role"], "district": lead["district"] or "", "pin": lead["pin"] or "", "place": lead["place"] or "",
            "zone": lead["zone"], "zone_name": _area_label(lead), "pos": pos, "count": count,
            "target": _target(s, lead["role"], lead), "rank": _rank(c, lead) if lead["role"] == "customer" else None,
            "referrals": _referrals(c, lead["code"]), "group": _group(s, lead["role"], lead), "support_wa": s["support_wa"],
            "extra": json.loads(lead["extra_json"] or "{}"), "first_week": lead["first_week"] or "", "flat": lead["flat"] or ""}


def join(core, d, ip, ua):
    if core.clean(d.get("hp"), 20):  # honeypot field: look successful, store nothing
        return 200, {"ok": True, "already": True}
    role = _pick(d.get("role"), ROLES)
    if not role:
        return _bad("role", "Choose customer, shop owner or rider.")
    phone = core.norm_phone(d.get("phone"))
    if not phone:
        return _bad("phone", "Enter a valid 10-digit mobile number.")
    if d.get("consent") is not True:
        return _bad("consent", "Please tick the box so we can message you.")
    loc, err = locate(core, d.get("pin"), d.get("place"), d.get("district"))
    if err:
        return _bad(err, {"pin": "We could not find this PIN code in Kerala.", "district": "Choose your district.",
                          "place": "Type the name of your place."}[err])
    lang = _pick(d.get("lang"), LANGS) or "en"
    with closing(core.db()) as c:
        s = settings(c)
        if c.execute("SELECT 1 FROM d_leads WHERE phone=? AND role=?", (phone, role)).fetchone():
            # Already on the list. Say so without showing where whoever owns that number lives.
            return 200, {"ok": True, "already": True}
        ref, ref_name = _code(d.get("ref")), ""
        if ref:
            r = c.execute("SELECT name, phone FROM d_leads WHERE code=?", (ref,)).fetchone()
            if not r or r["phone"] == phone:
                ref = ""
            else:
                ref_name = "%s (%s)" % (r["name"] or "someone", ref)
        utm = core.clean_utm(d.get("utm"))
        src = _src(d.get("src") or utm.get("utm_campaign") or utm.get("utm_source") or ("referral" if ref else ""))
        now = core.now_iso()
        try:
            lid = c.insert_id(
                "INSERT INTO d_leads(created_at,updated_at,role,name,phone,district,pin,place,zone,zone_name,lang,consent,code,"
                "referred_by,src,utm_json,status,origin,ip_hash,ua) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (now, now, role, core.clean(d.get("name"), 60), phone, loc["district"], loc["pin"], loc["place"], loc["zone"],
                 loc["zone_name"], lang, 1, _new_code(c), ref or None, src, json.dumps(utm), "new", "page",
                 core.ip_hash(ip), core.clean(ua, 200)))
            c.commit()
        except Exception:  # the same number joined a moment ago from another tab
            c.raw.rollback()
            return 200, {"ok": True, "already": True}
        lead = c.execute("SELECT * FROM d_leads WHERE id=?", (lid,)).fetchone()
        reply = _lead_reply(core, c, s, lead)
    _alert(core, s, lead, reply, ref_name)
    return 200, reply


def more(core, d, ip, ua):
    lid = d.get("id")
    if not _token_ok(core, lid, d.get("t")):
        return 404, {"ok": False, "error": "not_found"}
    with closing(core.db()) as c:
        lead = c.execute("SELECT * FROM d_leads WHERE id=?", (lid,)).fetchone()
        if not lead:
            return 404, {"ok": False, "error": "not_found"}
        try:
            extra = json.loads(lead["extra_json"] or "{}")
        except ValueError:
            extra = {}
        first_week, flat = lead["first_week"], lead["flat"]
        shops = None
        if lead["role"] == "customer":
            extra["buys"] = _pick_list(d.get("buys"), BUYS)
            extra["often"] = _pick(d.get("often"), OFTEN)
            first_week = _pick(d.get("first_week"), FIRST_WEEK) or first_week
            flat = core.clean(d.get("flat"), 80)
            shops = []
            for sh in (d.get("shops") if isinstance(d.get("shops"), list) else [])[:3]:
                if isinstance(sh, dict):
                    name = core.clean(sh.get("name"), 60)
                    if len(name) >= 2 and _shop_key(name):
                        shops.append({"name": name, "kind": _pick(sh.get("kind"), KINDS) or "other"})
            extra["shops"] = shops
        elif lead["role"] == "shop":
            extra["shop_name"] = core.clean(d.get("shop_name"), 80)
            extra["sells"] = _pick_list(d.get("sells"), KINDS)
            extra["delivers"] = _pick(d.get("delivers"), YESNO)
            extra["visit"] = _pick_list(d.get("visit"), TIMES)
        else:
            extra["vehicle"] = _pick(d.get("vehicle"), VEHICLES)
            extra["licence"] = _pick(d.get("licence"), YESNO)
            extra["times"] = _pick_list(d.get("times"), TIMES)
        extra = {k: v for k, v in extra.items() if v not in (None, "", [])}
        c.execute("UPDATE d_leads SET extra_json=?, first_week=?, flat=?, updated_at=? WHERE id=?",
                  (json.dumps(extra, ensure_ascii=False), first_week, flat, core.now_iso(), lid))
        if shops is not None:
            c.execute("DELETE FROM d_shop_requests WHERE lead_id=?", (lid,))
            for sh in shops:
                c.execute("INSERT INTO d_shop_requests(created_at,lead_id,name,name_key,kind,area,district) VALUES(?,?,?,?,?,?,?)",
                          (core.now_iso(), lid, sh["name"], _shop_key(sh["name"]), sh["kind"], _area_label(lead), lead["district"] or ""))
        c.commit()
    return 200, {"ok": True}


def me(core, q):
    try:
        lid = int((q.get("id") or ["0"])[0])
    except ValueError:
        lid = 0
    if not _token_ok(core, lid, (q.get("t") or [""])[0]):
        return 404, {"ok": False, "error": "not_found"}
    with closing(core.db()) as c:
        lead = c.execute("SELECT * FROM d_leads WHERE id=?", (lid,)).fetchone()
        if not lead or lead["status"] == "spam":
            return 404, {"ok": False, "error": "not_found"}
        return 200, _lead_reply(core, c, settings(c), lead, already=True)


def ref_info(core, q):
    code = _code((q.get("c") or [""])[0])
    if not code:
        return 404, {"ok": False, "error": "not_found"}
    with closing(core.db()) as c:
        r = c.execute("SELECT role, district, pin, place FROM d_leads WHERE code=? AND status!='spam'", (code,)).fetchone()
    if not r:
        return 404, {"ok": False, "error": "not_found"}
    return 200, {"ok": True, "role": r["role"], "district": r["district"] or "", "pin": r["pin"] or "", "place": r["place"] or ""}


def visit(core, d, ip, ua):
    with closing(core.db()) as c:
        c.execute("INSERT INTO d_visits(day, src, ip_hash) VALUES(?,?,?) ON CONFLICT DO NOTHING",
                  (_today_ist(), _src(d.get("src")), core.ip_hash(ip)))
        c.commit()
    return 200, {"ok": True}


def cron_daily(core, auth):
    if CRON_SECRET and not hmac.compare_digest((auth or "").encode(), ("Bearer " + CRON_SECRET).encode()):
        return 401, {"ok": False, "error": "auth"}
    with closing(core.db()) as c:
        key = "summary:" + _today_ist()
        if _kv_get(c, key):
            return 200, {"ok": True, "sent": False, "why": "already sent today"}
        s = settings(c)
        text = summary_text(c, s)
        if not tg_send(core, _tg_chat(s), text, wait=True):
            return 200, {"ok": True, "sent": False, "why": "Telegram is not connected or did not answer"}
        _kv_set(c, key, core.now_iso())  # only after a real send, so a failed evening can be retried
        c.commit()
    return 200, {"ok": True, "sent": True}


POSTS = {"join": (join, LIMIT_JOIN), "more": (more, LIMIT_MORE), "visit": (visit, LIMIT_VISIT)}
GETS = ("board", "me", "ref", "cron/daily")


def handle(h, core, method, sub):
    """Entry point from app.py for /api/d/<sub>."""
    q = core.parse_qs(core.urlparse(h.path).query)
    if method in ("GET", "HEAD") and sub in GETS:
        if sub == "board":
            return h.send_json(*board(core))
        if sub == "me":
            return h.send_json(*me(core, q))
        if sub == "ref":
            return h.send_json(*ref_info(core, q))
        return h.send_json(*cron_daily(core, h.headers.get("Authorization")))
    if method == "POST" and sub in POSTS:
        fn, limit = POSTS[sub]
        ip = h.ip()
        if not core.LIMITER.allow(("/api/d/" + sub, ip), limit, 3600):
            return h.send_json(429, {"ok": False, "error": "rate", "message": "Too many tries. Please wait a while."})
        if h.headers.get("X-FK") != "1" or not (h.headers.get("Content-Type") or "").lower().startswith("application/json"):
            return h.send_json(400, {"ok": False, "error": "request"})
        data, err = h.read_json()
        if err or not isinstance(data, dict):
            return h.send_json(400, {"ok": False, "error": err or "json"})
        return h.send_json(*fn(core, data, ip, h.headers.get("User-Agent", "")))
    known = sub in POSTS or sub in GETS
    h.send_json(405 if known else 404, {"ok": False, "error": "method" if known else "not_found"})


# ---------- admin ----------

def _lead_row(r):
    try:
        extra = json.loads(r["extra_json"] or "{}")
    except ValueError:
        extra = {}
    return {"id": r["id"], "created_at": r["created_at"], "role": r["role"], "name": r["name"] or "", "phone": r["phone"],
            "district": r["district"] or "", "district_name": _district_name(r["district"]), "pin": r["pin"] or "",
            "place": r["place"] or "", "zone": r["zone"], "zone_name": r["zone_name"] or "", "flat": r["flat"] or "",
            "lang": r["lang"] or "en", "code": r["code"], "referred_by": r["referred_by"] or "", "src": r["src"] or "direct",
            "status": r["status"], "note": r["note"] or "", "extra": extra, "first_week": r["first_week"] or "", "origin": r["origin"]}


def dashboard(core, f):
    with closing(core.db()) as c:
        s = settings(c)
        rows = [_lead_row(r) for r in c.execute("SELECT * FROM d_leads ORDER BY id DESC").fetchall()]
        visits, visits_today = {}, {}
        for r in c.execute("SELECT src, COUNT(*) AS n FROM d_visits GROUP BY src"):
            visits[r["src"]] = r["n"]
        for r in c.execute("SELECT src, COUNT(*) AS n FROM d_visits WHERE day=? GROUP BY src", (_today_ist(),)):
            visits_today[r["src"]] = r["n"]
        reqs = c.execute("SELECT r.name, r.name_key, r.kind, r.area, r.district, r.lead_id FROM d_shop_requests r "
                         "JOIN d_leads l ON l.id=r.lead_id WHERE l.status!='spam'").fetchall()
        summary_sent = _kv_get(c, "summary:" + _today_ist())
    today = _today_ist()
    for r in rows:
        r["day"] = _ist_day(r["created_at"])
    live = [r for r in rows if r["status"] != "spam"]
    t_live = [r for r in live if r["day"] == today]
    by_code = {r["code"]: r for r in rows}

    def count(rs, **kw):
        return sum(1 for r in rs if all(r[k] == v for k, v in kw.items()))

    kpis = {"today": len(t_live), "today_roles": {role: count(t_live, role=role) for role in ROLES},
            "roles": {role: count(live, role=role) for role in ROLES},
            "status": {st: count(rows, status=st) for st in STATUSES},
            "first_week": {fw: count(live, role="customer", first_week=fw) for fw in FIRST_WEEK},
            "districts_with_leads": len({r["district"] for r in live if r["district"]}),
            "places_with_leads": len({r["zone"] for r in live if r["pin"]})}
    districts = []
    for did in D_IDS:
        rs = [r for r in live if r["district"] == did]
        districts.append({"id": did, "name": DISTRICTS[did]["name"], "customer": count(rs, role="customer"),
                          "shop": count(rs, role="shop"), "rider": count(rs, role="rider"),
                          "today": sum(1 for r in rs if r["day"] == today), "first_week": count(rs, role="customer", first_week="yes"),
                          "places": len({r["zone"] for r in rs if r["pin"]})})
    zones = {}
    for r in live:
        if not r["pin"]:
            continue
        z = zones.setdefault(r["zone"], {"pin": r["pin"], "name": r["zone_name"], "district": r["district_name"], "customer": 0,
                                         "shop": 0, "rider": 0, "today": 0, "first_week": 0, "in_group": 0, "prebooked": 0,
                                         "places": set()})
        z[r["role"]] += 1
        z["today"] += r["day"] == today
        z["first_week"] += r["role"] == "customer" and r["first_week"] == "yes"
        z["in_group"] += r["status"] in ("in_group", "prebooked")
        z["prebooked"] += r["status"] == "prebooked"
        z["places"].add(r["place"])
    for z in zones.values():
        z["target"] = int((s.get("targets") or {}).get(z["pin"]) or s["default_target"])
        z["places"] = sorted(p for p in z["places"] if p and p != z["name"])[:6]
    top_zones = sorted(zones.values(), key=lambda z: (-z["customer"], -(z["shop"] + z["rider"])))[:40]
    typed = {}
    for r in live:
        if not r["pin"]:
            e = typed.setdefault(r["zone"], {"name": r["place"], "district": r["district_name"] or "?", "customer": 0, "shop": 0, "rider": 0})
            e[r["role"]] += 1
    days = []
    for i in range(14, -1, -1):
        d = (datetime.now(IST) - timedelta(days=i)).strftime("%Y-%m-%d")
        days.append({"day": d, **{role: count(live, role=role, day=d) for role in ROLES}})
    srcs = {}
    for r in live:
        e = srcs.setdefault(r["src"], {"src": r["src"], "customer": 0, "shop": 0, "rider": 0, "today": 0})
        e[r["role"]] += 1
        e["today"] += r["day"] == today
    for k in visits:
        srcs.setdefault(k, {"src": k, "customer": 0, "shop": 0, "rider": 0, "today": 0})
    for e in srcs.values():
        e["visits"], e["visits_today"] = visits.get(e["src"], 0), visits_today.get(e["src"], 0)
    shop_keys = {}
    for r in live:
        if r["role"] == "shop" and r["extra"].get("shop_name"):
            shop_keys[_shop_key(r["extra"]["shop_name"])] = r["id"]
    asked = {}
    for q in reqs:
        e = asked.setdefault(q["name_key"], {"key": q["name_key"], "names": {}, "kinds": {}, "areas": {}, "leads": set()})
        for field, val in (("names", q["name"]), ("kinds", q["kind"]), ("areas", q["area"])):
            e[field][val] = e[field].get(val, 0) + 1
        e["leads"].add(q["lead_id"])
    shops = sorted(({"name": max(e["names"], key=e["names"].get), "kind": max(e["kinds"], key=e["kinds"].get),
                     "area": max(e["areas"], key=e["areas"].get), "asked": len(e["leads"]),
                     "signed_up": shop_keys.get(e["key"])} for e in asked.values()), key=lambda x: -x["asked"])[:40]
    refs = defaultdict(int)
    for r in live:
        if r["referred_by"]:
            refs[r["referred_by"]] += 1
    referrers = []
    for code, n in sorted(refs.items(), key=lambda kv: -kv[1])[:15]:
        p = by_code.get(code)
        if p:
            referrers.append({"id": p["id"], "name": p["name"], "phone": p["phone"], "area": p["zone_name"], "role": p["role"], "count": n})
    for r in rows:
        p = by_code.get(r["referred_by"])
        r["ref_name"] = (p["name"] or p["phone"]) if p else ""
        r["referrals"] = refs.get(r["code"], 0)
    sel = rows
    if f.get("role") in ROLES:
        sel = [r for r in sel if r["role"] == f["role"]]
    if f.get("district"):
        sel = [r for r in sel if r["district"] == f["district"]]
    if f.get("zone"):
        sel = [r for r in sel if r["zone"] == f["zone"]]
    if f.get("status") in STATUSES:
        sel = [r for r in sel if r["status"] == f["status"]]
    elif f.get("status") != "all":
        sel = [r for r in sel if r["status"] != "spam"]
    needle = str(f.get("q") or "").strip().lower()
    if needle:
        sel = [r for r in sel if needle in " ".join([r["name"], r["phone"], r["place"], r["zone_name"], r["pin"], r["flat"], r["src"],
                                                      r["note"], json.dumps(r["extra"], ensure_ascii=False)]).lower()]
    try:
        limit = max(20, min(1000, int(f.get("limit") or 200)))
    except (TypeError, ValueError):
        limit = 200
    shown = sel[:limit]
    for r in shown:  # admin only: lets the page build each person's private "my place" link
        r["t"] = _token(core, r["id"])
    return 200, {"ok": True, "now": core.now_iso(), "settings": _public_settings(s), "kpis": kpis, "districts": districts,
                 "zones": top_zones, "typed": sorted(typed.values(), key=lambda x: -(x["customer"] + x["shop"] + x["rider"]))[:25],
                 "days": days, "sources": sorted(srcs.values(), key=lambda e: -(e["customer"] + e["shop"] + e["rider"] + e["visits"] / 1000)),
                 "shops": shops, "referrers": referrers, "leads": shown, "matched": len(sel),
                 "telegram": {"token": bool(TG_TOKEN), "chat": bool(_tg_chat(s)), "summary_sent_today": bool(summary_sent),
                              "cron_secret": bool(CRON_SECRET)}}


def _public_settings(s):
    targets = [{"pin": p, "name": ZONES[p]["name"], "district": _district_name(ZONES[p]["district"]), "target": int(t)}
               for p, t in (s.get("targets") or {}).items() if p in ZONES]
    groups = []
    for k, v in (s.get("groups") or {}).items():
        label = {"_shop": "Shop owners", "_rider": "Riders", "_all": "Everyone else"}.get(k) or \
            (ZONES[k]["name"] + " " + k if k in ZONES else _district_name(k) + " district")
        groups.append({"key": k, "label": label, "link": v})
    return {"default_target": int(s["default_target"]), "targets": targets, "shop_target": int(s["shop_target"]),
            "rider_target": int(s["rider_target"]), "groups": groups, "support_wa": s["support_wa"]}


def _save_settings(core, d):
    def num(v, lo, hi, what):
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError("%s must be a number." % what)
        if not lo <= n <= hi:
            raise ValueError("%s must be between %d and %d." % (what, lo, hi))
        return n
    try:
        default_t = num(d.get("default_target"), 5, 100000, "The usual target")
        shop_t = num(d.get("shop_target"), 1, 1000, "Shops per area")
        rider_t = num(d.get("rider_target"), 1, 1000, "Riders per area")
        targets = {}
        for t in d.get("targets") if isinstance(d.get("targets"), list) else []:
            pin = re.sub(r"\D", "", str(t.get("pin") if isinstance(t, dict) else ""))
            if not pin:
                continue
            if pin not in ZONES:
                raise ValueError("%s is not a Kerala PIN code we know." % pin)
            targets[pin] = num(t.get("target"), 5, 100000, "The target for %s" % pin)
        groups = {}
        for g in d.get("groups") if isinstance(d.get("groups"), list) else []:
            if not isinstance(g, dict):
                continue
            key, link = str(g.get("key") or "").strip().lower(), core.clean(g.get("link"), 120)
            if not key and not link:
                continue
            if key not in ("_shop", "_rider", "_all") and key not in DISTRICTS and key not in ZONES:
                raise ValueError("Group \"%s\": use a PIN code, a district name like ernakulam, or shops / riders / everyone." % key)
            if not GROUP_LINK.fullmatch(link):
                raise ValueError("Group links must look like https://chat.whatsapp.com/... (from Invite via link).")
            groups[key] = link
    except ValueError as e:
        return _bad("settings", str(e))
    wa = re.sub(r"\D", "", str(d.get("support_wa") or ""))
    if len(wa) == 10:
        wa = "91" + wa
    if not re.fullmatch(r"91[6-9]\d{9}", wa):
        return _bad("support_wa", "Enter your WhatsApp number with 10 digits.")
    with closing(core.db()) as c:
        s = settings(c)
        s.update(default_target=default_t, targets=targets, shop_target=shop_t, rider_target=rider_t, groups=groups, support_wa=wa)
        _kv_set(c, "settings", json.dumps(s, ensure_ascii=False))
        c.commit()
    return 200, {"ok": True, "settings": _public_settings(s)}


def _add_lead(c, core, role, phone, name, loc, src, origin, created=None, note=""):
    """Used by the hand-entry form and the CSV import. Returns 'added', 'dup' or 'bad'."""
    phone = core.norm_phone(phone)
    if role not in ROLES or not phone or not loc:
        return "bad"
    if c.execute("SELECT 1 FROM d_leads WHERE phone=? AND role=?", (phone, role)).fetchone():
        return "dup"
    now = core.now_iso()
    c.execute("INSERT INTO d_leads(created_at,updated_at,role,name,phone,district,pin,place,zone,zone_name,lang,consent,code,src,status,"
              "note,origin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              (created or now, now, role, core.clean(name, 60), phone, loc["district"], loc["pin"], loc["place"], loc["zone"],
               loc["zone_name"], "en", 1, _new_code(c), _src(src), "new", core.clean(note, 300), origin))
    return "added"


def _parse_time(value):
    v = str(value or "").strip()
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def admin_api(core, d):
    act = d.get("action")
    if act == "dash":
        return dashboard(core, d.get("filter") if isinstance(d.get("filter"), dict) else {})
    if act in ("status", "note", "delete"):
        lid = d.get("id")
        if type(lid) is not int or not 0 < lid < 2 ** 62:
            return _bad("id", "Unknown lead.")
        with closing(core.db()) as c:
            if act == "status":
                if d.get("status") not in STATUSES:
                    return _bad("status", "Unknown status.")
                n = c.execute("UPDATE d_leads SET status=?, updated_at=? WHERE id=?", (d["status"], core.now_iso(), lid)).rowcount
            elif act == "note":
                n = c.execute("UPDATE d_leads SET note=?, updated_at=? WHERE id=?", (core.clean(d.get("note"), 300), core.now_iso(), lid)).rowcount
            else:  # someone asked to be removed: delete them and the shops they named
                c.execute("DELETE FROM d_shop_requests WHERE lead_id=?", (lid,))
                n = c.execute("DELETE FROM d_leads WHERE id=?", (lid,)).rowcount
            c.commit()
        return (200, {"ok": True}) if n else (404, {"ok": False, "error": "not_found"})
    if act == "add":
        if d.get("pin") or (d.get("district") and d.get("place")):
            loc, err = locate(core, d.get("pin"), d.get("place"), d.get("district"))
            if err:
                return _bad(err, {"pin": "That PIN code is not in Kerala.", "district": "Choose a district.", "place": "Type the place."}[err])
        else:
            loc = locate_text(core, d.get("place") or "", d.get("district"))
        with closing(core.db()) as c:
            res = _add_lead(c, core, d.get("role"), d.get("phone"), d.get("name"), loc, d.get("src") or "manual", "manual", note=d.get("note"))
            c.commit()
        if res == "bad":
            return _bad("phone", "Check the role and the 10-digit number.")
        return 200, {"ok": True, "result": res, "area": loc["zone_name"]}
    if act == "import":
        rows = d.get("rows")
        if not isinstance(rows, list) or len(rows) > 300:
            return _bad("rows", "Send at most 300 rows at a time.")
        role = d.get("role") if d.get("role") in ROLES else "customer"
        out = {"added": 0, "dup": 0, "bad": 0}
        with closing(core.db()) as c:
            for r in rows:
                if not isinstance(r, dict):
                    out["bad"] += 1
                    continue
                loc = locate_text(core, " ".join(str(r.get(k) or "") for k in ("pin", "place")).strip(), r.get("district"))
                res = _add_lead(c, core, role, r.get("phone"), r.get("name"), loc, r.get("src") or d.get("src") or "meta", "import",
                                created=_parse_time(r.get("created")), note=r.get("note"))
                out[res] += 1
            c.commit()
        return 200, {"ok": True, **out}
    if act == "settings":
        return _save_settings(core, d)
    if act == "tg_find":
        if not TG_TOKEN:
            return _bad("token", "Add the FK_TG_TOKEN setting first.")
        try:
            res = _tg_call("getUpdates", {"limit": 20, "timeout": 0})
        except Exception as e:
            return _bad("telegram", "Telegram did not answer: %s" % type(e).__name__)
        chats = [u.get("message", {}).get("chat") for u in res.get("result", []) if u.get("message", {}).get("chat")]
        if not chats:
            return _bad("none", "No message found. Open your bot in Telegram, press Start or send it \"hi\", then try again.")
        chat = chats[-1]
        with closing(core.db()) as c:
            s = settings(c)
            s["tg_chat"] = str(chat["id"])
            _kv_set(c, "settings", json.dumps(s, ensure_ascii=False))
            c.commit()
        who = chat.get("title") or " ".join(x for x in (chat.get("first_name"), chat.get("last_name")) if x) or "your chat"
        tg_send(core, str(chat["id"]), "FrescoKart alerts are on. New sign-ups will appear here.", wait=True)
        return 200, {"ok": True, "chat": who}
    if act in ("tg_test", "summary_now"):
        with closing(core.db()) as c:
            s = settings(c)
            text = "Test from your FrescoKart admin page." if act == "tg_test" else summary_text(c, s)
        if not TG_TOKEN or not _tg_chat(s):
            return _bad("telegram", "Connect Telegram first.")
        if not tg_send(core, _tg_chat(s), text, wait=True):
            return _bad("telegram", "Telegram did not accept the message. Check the bot token.")
        return 200, {"ok": True}
    if act == "qr":
        url = core.clean(d.get("url"), 400)
        if not re.fullmatch(r"https?://[^\s\"'<>]{4,390}", url):
            return _bad("url", "That link does not look right.")
        try:
            import segno
        except ImportError:
            return _bad("qr", "QR codes need the segno package (it is in requirements.txt for Vercel).")
        buf = io.BytesIO()
        segno.make(url, error="m").save(buf, kind="png", scale=12, border=3, dark="#0E1F17")
        return 200, {"ok": True, "png": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")}
    return _bad("action", "Unknown action.")


def export_csv(core):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["id", "joined_ist", "role", "status", "name", "phone", "district", "pin", "place", "area", "flat_or_street",
                "language", "source", "invited_by", "referral_code", "would_order_week_1", "answers", "note", "came_from"])
    with closing(core.db()) as c:
        for r in c.execute("SELECT * FROM d_leads ORDER BY id"):
            row = _lead_row(r)
            cells = [row["id"], core.to_ist(row["created_at"]), row["role"], row["status"], row["name"], row["phone"],
                     row["district_name"], row["pin"], row["place"], row["zone_name"], row["flat"], row["lang"], row["src"],
                     row["referred_by"], row["code"], row["first_week"], json.dumps(row["extra"], ensure_ascii=False), row["note"], row["origin"]]
            w.writerow([core.csv_cell(x) for x in cells])
    return ("﻿" + out.getvalue()).encode("utf-8")


def render_admin(core):
    try:  # the page lives in its own file so this one stays readable
        from .demand_admin import PAGE
    except ImportError:
        from demand_admin import PAGE
    return PAGE.replace("/*STATUSES*/", json.dumps(STATUSES)).replace("/*DISTRICTS*/", json.dumps(PLACES["districts"], ensure_ascii=False))


def admin(h, core, method, sub):
    """Entry point from app.py for /admin/leads/<sub>, after the password check."""
    if sub == "" and method in ("GET", "HEAD"):
        csp = core.ADMIN_CSP.replace("default-src 'none';", "default-src 'none'; img-src data:;")  # QR codes are data: images
        return h.send_bytes(200, "text/html; charset=utf-8", render_admin(core).encode("utf-8"), method == "HEAD", csp=csp)
    if sub == "export.csv" and method in ("GET", "HEAD"):
        name = "frescokart-signups-%s.csv" % _today_ist()
        return h.send_bytes(200, "text/csv; charset=utf-8", export_csv(core), method == "HEAD",
                            extra={"Content-Disposition": 'attachment; filename="%s"' % name})
    if sub == "api" and method == "POST":
        if h.headers.get("X-FK-Admin") != "1":
            return h.send_json(400, {"ok": False, "error": "request"})
        data, err = h.read_json()
        if err or not isinstance(data, dict):
            return h.send_json(413 if err == "size" else 400, {"ok": False, "error": err or "bad_request"})
        return h.send_json(*admin_api(core, data))
    h.send_json(404, {"ok": False, "error": "not_found"})
