#!/usr/bin/env python3
"""FrescoKart pre-order server.

Serves the landing page from ../web, takes pre-orders, "tell me when you start" sign-ups
and area votes into SQLite, and has a password-protected admin page with CSV export.
Python 3.9+, standard library only (Postgres needs psycopg2, see below).

  python server/app.py                          http://127.0.0.1:8080
  python server/app.py --host 0.0.0.0 --port 8080

The same code runs on Vercel: the files in ../api import Handler from here and keep the data in
Postgres (DATABASE_URL, added by Vercel's Neon integration) instead of the SQLite file.

Settings (environment variables, all optional when running locally):
  FK_ADMIN_PASSWORD   admin password. If unset locally, a random one is saved to data/admin_password.txt.
                      On Vercel it must be set, otherwise the admin page stays closed.
  FK_DATA_DIR         folder for the SQLite database (default: server/data)
  FK_WEB_DIR          folder with the landing page (default: ../web)
  FK_DATABASE_URL     use this Postgres database instead of SQLite (pip install psycopg2-binary).
                      On Vercel, DATABASE_URL and POSTGRES_URL are read as well.
  FK_SECRET           secret behind the daily visitor code. If unset it is kept in data/secret.key
                      (SQLite) or in the database (Postgres)
  FK_TRUST_PROXY=1    read the visitor's IP from X-Forwarded-For (set this behind a reverse proxy; always on for Vercel)
  FK_CORS_ORIGIN      let one other site call the API, for example https://www.example.com
  FK_NOTIFY_WEBHOOK   a URL that receives {"text": "..."} for every new pre-order or sign-up
"""
import argparse
import base64
import csv
import hashlib
import hmac
import html
import io
import json
import os
import random
import re
import secrets
import sqlite3
import sys
import threading
import time
import traceback
import urllib.request
from collections import defaultdict, deque
from contextlib import closing
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent
WEB_DIR = Path(os.environ.get("FK_WEB_DIR") or ROOT.parent / "web").resolve()
DATA_DIR = Path(os.environ.get("FK_DATA_DIR") or ROOT / "data").resolve()
IST = timezone(timedelta(hours=5, minutes=30))

AREAS = ["Kakkanad", "Edappally", "Fort Kochi", "Panampilly Nagar", "MG Road", "Kacheripady",
         "Palarivattom", "Vyttila", "Thevara", "Marine Drive", "Tripunithura", "Somewhere else in Kochi"]
STATUSES = ("new", "confirmed", "delivered", "cancelled", "spam")
MAX_BODY = 32 * 1024
CORS_ORIGIN = os.environ.get("FK_CORS_ORIGIN", "").strip()
ON_VERCEL = bool(os.environ.get("VERCEL"))
TRUST_PROXY = os.environ.get("FK_TRUST_PROXY", "") == "1" or ON_VERCEL
WEBHOOK = os.environ.get("FK_NOTIFY_WEBHOOK", "").strip()
# Locally only FK_DATABASE_URL counts, so a DATABASE_URL meant for another project is never picked up by accident.
DATABASE_URL = next((os.environ[k].strip() for k in (("FK_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING")
                                                      if ON_VERCEL else ("FK_DATABASE_URL",)) if os.environ.get(k, "").strip()), "")
USE_PG = bool(DATABASE_URL)
LIMITS = {"/api/preorders": (int(os.environ.get("FK_LIMIT_PREORDERS", "8")), 3600),
          "/api/leads": (int(os.environ.get("FK_LIMIT_LEADS", "10")), 3600),
          "/api/area-votes": (int(os.environ.get("FK_LIMIT_VOTES", "60")), 3600)}

STATIC_TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8", ".webp": "image/webp", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
    ".ico": "image/x-icon", ".woff2": "font/woff2",
}
PAGE_CSP = ("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
ADMIN_CSP = ("default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; "
             "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS preorders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
  name TEXT, phone TEXT NOT NULL, area TEXT NOT NULL, address TEXT, notes TEXT,
  items_json TEXT NOT NULL, total REAL NOT NULL, consent INTEGER NOT NULL,
  campaign TEXT, utm_json TEXT, ip_hash TEXT, ua TEXT);
CREATE TABLE IF NOT EXISTS leads(
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, phone TEXT NOT NULL, area TEXT NOT NULL,
  consent INTEGER NOT NULL, campaign TEXT, utm_json TEXT, ip_hash TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_area ON leads(phone, area);
CREATE TABLE IF NOT EXISTS area_votes(
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, area TEXT NOT NULL, campaign TEXT, ip_hash TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS votes_area_ip ON area_votes(area, ip_hash);
CREATE INDEX IF NOT EXISTS preorders_created ON preorders(created_at);
"""

# The same tables for Postgres, plus two small ones: kv keeps the visitor-code secret, rate_hits the request limits.
SCHEMA_PG = """
CREATE TABLE IF NOT EXISTS preorders(
  id BIGSERIAL PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
  name TEXT, phone TEXT NOT NULL, area TEXT NOT NULL, address TEXT, notes TEXT,
  items_json TEXT NOT NULL, total DOUBLE PRECISION NOT NULL, consent INTEGER NOT NULL,
  campaign TEXT, utm_json TEXT, ip_hash TEXT, ua TEXT);
CREATE TABLE IF NOT EXISTS leads(
  id BIGSERIAL PRIMARY KEY, created_at TEXT NOT NULL, phone TEXT NOT NULL, area TEXT NOT NULL,
  consent INTEGER NOT NULL, campaign TEXT, utm_json TEXT, ip_hash TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_area ON leads(phone, area);
CREATE TABLE IF NOT EXISTS area_votes(
  id BIGSERIAL PRIMARY KEY, created_at TEXT NOT NULL, area TEXT NOT NULL, campaign TEXT, ip_hash TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS votes_area_ip ON area_votes(area, ip_hash);
CREATE INDEX IF NOT EXISTS preorders_created ON preorders(created_at);
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_hits(k TEXT NOT NULL, ts DOUBLE PRECISION NOT NULL);
CREATE INDEX IF NOT EXISTS rate_hits_k_ts ON rate_hits(k, ts);
"""

SECRET = os.environ.get("FK_SECRET", "").strip()
ADMIN_PW = os.environ.get("FK_ADMIN_PASSWORD", "")


class Limiter:
    def __init__(self):
        self.hits = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key, limit, window):
        now = time.time()
        with self.lock:
            q = self.hits[key]
            while q and q[0] <= now - window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            if len(self.hits) > 5000:
                for k in [k for k, v in self.hits.items() if not v]:
                    del self.hits[k]
            return True


class DbLimiter:
    """Same job as Limiter, but the counts live in the database: on Vercel the next request can land on another instance."""

    def allow(self, key, limit, window):
        name, ip = key
        k = "%s|%s" % (name, ip_hash(ip))  # the daily visitor code, never the IP itself
        now = time.time()
        with closing(db()) as c:
            if random.random() < 0.05:
                c.execute("DELETE FROM rate_hits WHERE ts < ?", (now - 7200,))
            used = c.execute("SELECT COUNT(*) FROM rate_hits WHERE k=? AND ts>=?", (k, now - window)).fetchone()[0]
            if used < limit:
                c.execute("INSERT INTO rate_hits(k, ts) VALUES(?, ?)", (k, now))
            c.commit()
            return used < limit


LIMITER = DbLimiter() if USE_PG else Limiter()


def pg_dsn():
    parts = urlsplit(DATABASE_URL)
    query = "&".join(p for p in parts.query.split("&") if p and p.split("=")[0] != "supa")  # Supabase adds a "supa" option that libpq rejects
    return urlunsplit(parts._replace(query=query))


class Conn:
    """The few calls the server needs, the same for SQLite (a local file) and Postgres (Vercel). Write SQL with ? placeholders."""

    def __init__(self):
        if USE_PG:
            import psycopg2
            import psycopg2.extras
            self.raw = psycopg2.connect(pg_dsn(), connect_timeout=10, cursor_factory=psycopg2.extras.DictCursor)
        else:
            self.raw = sqlite3.connect(DATA_DIR / "frescokart.db", timeout=10)
            self.raw.row_factory = sqlite3.Row

    def execute(self, sql, params=()):
        cur = self.raw.cursor()
        cur.execute(sql.replace("?", "%s") if USE_PG else sql, params)
        return cur

    def insert_id(self, sql, params):
        if USE_PG:
            return self.execute(sql + " RETURNING id", params).fetchone()[0]
        return self.execute(sql, params).lastrowid

    def commit(self):
        self.raw.commit()

    def close(self):
        self.raw.close()


_SCHEMA_READY = False


def init_db():
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    if USE_PG:
        with closing(Conn()) as c:
            c.execute("SELECT pg_advisory_xact_lock(727274)")  # two cold starts creating the tables at once would collide
            c.execute(SCHEMA_PG)
            c.commit()
    else:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with closing(Conn()) as c:
            c.execute("PRAGMA journal_mode=WAL")
            c.raw.executescript(SCHEMA_SQLITE)
            c.commit()
    _SCHEMA_READY = True


def db():
    init_db()
    return Conn()


def load_or_create(path, make):
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    value = make()
    path.write_text(value, encoding="utf-8")
    return value


def secret():
    global SECRET
    if not SECRET:
        if USE_PG:
            with closing(db()) as c:
                c.execute("INSERT INTO kv(k, v) VALUES('secret', ?) ON CONFLICT DO NOTHING", (secrets.token_hex(32),))
                c.commit()
                SECRET = c.execute("SELECT v FROM kv WHERE k='secret'").fetchone()[0]
        else:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            SECRET = load_or_create(DATA_DIR / "secret.key", lambda: secrets.token_hex(32))
    return SECRET


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_ist(iso):
    try:
        dt = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).astimezone(IST)
        return dt.strftime("%d %b %Y, %I:%M %p")
    except (TypeError, ValueError):
        return iso or ""


CTRL = re.compile(r"[\x00-\x1f\x7f]")


def clean(value, limit):
    if value is None:
        return ""
    s = CTRL.sub(" ", str(value))
    return re.sub(r"\s+", " ", s).strip()[:limit]


def norm_phone(value):
    d = re.sub(r"\D", "", str(value or ""))
    if len(d) == 12 and d.startswith("91"):
        d = d[2:]
    elif len(d) == 11 and d.startswith("0"):
        d = d[1:]
    return "+91" + d if re.fullmatch(r"[6-9]\d{9}", d) else None


def clean_area(value):
    a = clean(value, 40)
    return a if a in AREAS else None


def clean_utm(u):
    out = {}
    if isinstance(u, dict):
        for k in ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"):
            v = clean(u.get(k), 80)
            if v:
                out[k] = v
    return out


def campaign_of(utm):
    return utm.get("utm_campaign") or utm.get("utm_source") or "direct"


def ip_hash(ip):
    day = time.strftime("%Y-%m-%d", time.gmtime())
    return hmac.new(secret().encode(), (ip + day).encode(), hashlib.sha256).hexdigest()[:16]


def clean_items(raw):
    if not isinstance(raw, list) or not 1 <= len(raw) <= 20:
        return None
    out, total = [], 0.0
    for it in raw:
        if not isinstance(it, dict) or it.get("type") not in ("kit", "fish"):
            return None
        iid, name = clean(it.get("id"), 40), clean(it.get("name"), 80)
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", iid) or not name:
            return None
        try:
            qty, line = float(it.get("qty")), float(it.get("total"))
        except (TypeError, ValueError):
            return None
        if not 0 < qty <= 20 or not 0 <= line <= 100000:
            return None
        rec = {"type": it["type"], "id": iid, "name": name, "qty": round(qty, 2),
               "unit": "kg" if it["type"] == "fish" else "kit", "total": round(line, 2)}
        if it["type"] == "kit":
            try:
                serves = int(it.get("serves"))
            except (TypeError, ValueError):
                return None
            if serves not in (2, 4):
                return None
            rec["serves"] = serves
        out.append(rec)
        total += line
    return (out, round(total, 2)) if total <= 200000 else None


def items_text(items):
    parts = []
    for it in items:
        q = it["qty"]
        qty = ("%g kg" % q) if it["unit"] == "kg" else ("%g kit%s" % (q, "" if q == 1 else "s"))
        extra = " (serves %s)" % it["serves"] if it.get("serves") else ""
        parts.append("%s%s x %s" % (it["name"], extra, qty))
    return "; ".join(parts)


def notify(text):
    if not WEBHOOK:
        return

    def run():
        try:
            req = urllib.request.Request(WEBHOOK, data=json.dumps({"text": text}).encode("utf-8"),
                                         headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=4 if ON_VERCEL else 8).read()
        except Exception as e:  # the order is already saved, so only log
            sys.stderr.write("webhook failed: %s\n" % e)

    if ON_VERCEL:  # the function can be frozen as soon as the response is sent, so a background thread may never finish
        run()
    else:
        threading.Thread(target=run, daemon=True).start()


def bad(code, message):
    return 400, {"ok": False, "error": code, "message": message}


def handle_preorder(d, ip, ua):
    if clean(d.get("hp"), 20):  # honeypot: look successful, store nothing
        return 200, {"ok": True, "ref": "FK-000000"}
    phone = norm_phone(d.get("phone"))
    if not phone:
        return bad("phone", "Enter a valid 10-digit mobile number.")
    area = clean_area(d.get("area"))
    if not area:
        return bad("area", "Choose your delivery area.")
    if d.get("consent") is not True:
        return bad("consent", "Please tick the box so we can contact you about this pre-order.")
    parsed = clean_items(d.get("items"))
    if not parsed:
        return bad("items", "Your basket looks empty. Add a kit or some fish first.")
    items, total = parsed
    items_json = json.dumps(items, ensure_ascii=False, sort_keys=True)
    utm = clean_utm(d.get("utm"))
    ih = ip_hash(ip)
    with closing(db()) as c:
        dup = c.execute("SELECT id FROM preorders WHERE phone=? AND items_json=? AND area=? AND created_at>=? ORDER BY id DESC LIMIT 1",
                        (phone, items_json, area,
                         (datetime.now(timezone.utc) - timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%SZ"))).fetchone()
        if dup:
            return 200, {"ok": True, "id": dup["id"], "ref": "FK-%06d" % dup["id"], "duplicate": True}
        pid = c.insert_id(
            "INSERT INTO preorders(created_at,status,name,phone,area,address,notes,items_json,total,consent,campaign,utm_json,ip_hash,ua)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (now_iso(), "new", clean(d.get("name"), 60), phone, area, clean(d.get("address"), 200), clean(d.get("notes"), 200),
             items_json, total, 1, campaign_of(utm), json.dumps(utm), ih, clean(ua, 200)))
        c.commit()
    ref = "FK-%06d" % pid
    notify("New pre-order %s: %s, %s, %s. Rs %s. %s" % (ref, clean(d.get("name"), 60) or "no name", phone, area, "%g" % total, items_text(items)))
    return 200, {"ok": True, "id": pid, "ref": ref}


def handle_lead(d, ip, ua):
    if clean(d.get("hp"), 20):
        return 200, {"ok": True, "already": False}
    phone = norm_phone(d.get("phone"))
    if not phone:
        return bad("phone", "Enter a valid 10-digit mobile number.")
    area = clean_area(d.get("area"))
    if not area:
        return bad("area", "Choose your area first.")
    if d.get("consent") is not True:
        return bad("consent", "Please tick the box so we can message you.")
    utm = clean_utm(d.get("utm"))
    ih = ip_hash(ip)
    with closing(db()) as c:
        cur = c.execute("INSERT INTO leads(created_at,phone,area,consent,campaign,utm_json,ip_hash) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
                        (now_iso(), phone, area, 1, campaign_of(utm), json.dumps(utm), ih))
        c.commit()
        fresh = cur.rowcount == 1
    if fresh:
        notify("New area sign-up: %s, %s" % (phone, area))
    return 200, {"ok": True, "already": not fresh}


def handle_vote(d, ip, ua):
    area = clean_area(d.get("area"))
    if not area:
        return bad("area", "Choose your area first.")
    utm = clean_utm(d.get("utm"))
    ih = ip_hash(ip)
    with closing(db()) as c:
        c.execute("INSERT INTO area_votes(created_at,area,campaign,ip_hash) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
                  (now_iso(), area, campaign_of(utm), ih))
        c.commit()
    return 200, {"ok": True}


HANDLERS = {"/api/preorders": handle_preorder, "/api/leads": handle_lead, "/api/area-votes": handle_vote}


def csv_cell(v):
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def export_csv(kind):
    out = io.StringIO()
    w = csv.writer(out)
    with closing(db()) as c:
        if kind == "leads":
            w.writerow(["id", "created_ist", "phone", "area", "campaign"])
            for r in c.execute("SELECT * FROM leads ORDER BY id"):
                w.writerow([r["id"], to_ist(r["created_at"]), csv_cell(r["phone"]), csv_cell(r["area"]), csv_cell(r["campaign"])])
        elif kind == "votes":
            w.writerow(["id", "created_ist", "area", "campaign"])
            for r in c.execute("SELECT * FROM area_votes ORDER BY id"):
                w.writerow([r["id"], to_ist(r["created_at"]), csv_cell(r["area"]), csv_cell(r["campaign"])])
        else:
            w.writerow(["ref", "created_ist", "status", "name", "phone", "area", "address", "notes", "items", "total_rs", "campaign"])
            for r in c.execute("SELECT * FROM preorders ORDER BY id"):
                w.writerow(["FK-%06d" % r["id"], to_ist(r["created_at"]), r["status"], csv_cell(r["name"]), csv_cell(r["phone"]),
                            csv_cell(r["area"]), csv_cell(r["address"]), csv_cell(r["notes"]),
                            csv_cell(items_text(json.loads(r["items_json"]))), "%g" % r["total"], csv_cell(r["campaign"])])
    return ("﻿" + out.getvalue()).encode("utf-8")


ADMIN_CSS = """
:root{--green:#006B48;--ink:#0E1F17;--muted:#5E6B63;--line:#E1E8E3;--bg:#F5F8F5;--orange:#C8380A}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{background:var(--green);color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
header b{font-size:20px;letter-spacing:-.02em}header a{color:#fff;opacity:.9;margin-left:14px;font-size:14px}
main{max-width:1280px;margin:0 auto;padding:24px}
h2{font-size:18px;margin:34px 0 12px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px}
.card b{display:block;font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums}.card span{color:var(--muted);font-size:13px}
.wrap{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:auto}
table{border-collapse:collapse;width:100%;min-width:720px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);background:#FAFCFA;position:sticky;top:0}
tr:last-child td{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums}
.muted{color:var(--muted);font-size:13px}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;background:#E8F3EC;color:var(--green);font-size:12px;font-weight:600}
select{font:inherit;padding:5px 8px;border:1px solid #C9D3CC;border-radius:8px;background:#fff}
select.flash{outline:3px solid #A8E63D}
.wa{display:inline-block;margin-top:4px;color:#0F7A3E;font-weight:600;text-decoration:none}
.empty{padding:22px;color:var(--muted)}
"""

ADMIN_JS = """
document.addEventListener("change",function(e){
  var s=e.target.closest("select[data-id]");if(!s)return;
  fetch("/admin/status",{method:"POST",headers:{"Content-Type":"application/json","X-FK-Admin":"1"},
    body:JSON.stringify({id:+s.dataset.id,status:s.value})})
  .then(function(r){return r.json()}).then(function(j){
    if(!j.ok){alert("Could not save: "+(j.error||"error"));return}
    s.classList.add("flash");setTimeout(function(){s.classList.remove("flash")},900)})
  .catch(function(){alert("Could not reach the server.")});
});
"""


def render_admin():
    esc = html.escape
    with closing(db()) as c:
        pre = c.execute("SELECT * FROM preorders ORDER BY id DESC LIMIT 300").fetchall()
        leads = c.execute("SELECT * FROM leads ORDER BY id DESC LIMIT 200").fetchall()
        n_pre = c.execute("SELECT COUNT(*) FROM preorders WHERE status!='spam'").fetchone()[0]
        n_new = c.execute("SELECT COUNT(*) FROM preorders WHERE status='new'").fetchone()[0]
        value = c.execute("SELECT COALESCE(SUM(total),0) FROM preorders WHERE status NOT IN ('spam','cancelled')").fetchone()[0]
        n_leads = c.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        n_votes = c.execute("SELECT COUNT(*) FROM area_votes").fetchone()[0]
        areas, camps = {}, {}
        for r in c.execute("SELECT area, COUNT(*) AS n FROM area_votes GROUP BY area"):
            areas.setdefault(r["area"], {})["votes"] = r["n"]
        for r in c.execute("SELECT area, COUNT(*) AS n FROM leads GROUP BY area"):
            areas.setdefault(r["area"], {})["leads"] = r["n"]
        for r in c.execute("SELECT area, COUNT(*) AS n, SUM(total) AS v FROM preorders WHERE status!='spam' GROUP BY area"):
            areas.setdefault(r["area"], {}).update(orders=r["n"], value=r["v"] or 0)
        for table, key in (("area_votes", "votes"), ("leads", "leads"), ("preorders", "orders")):
            where = " WHERE status!='spam'" if table == "preorders" else ""
            for r in c.execute("SELECT campaign, COUNT(*) AS n FROM %s%s GROUP BY campaign" % (table, where)):
                camps.setdefault(r["campaign"] or "direct", {})[key] = r["n"]

    def n(d, k):
        return d.get(k, 0) or 0

    area_rows = "".join(
        "<tr><td>%s</td><td class=num>%d</td><td class=num>%d</td><td class=num>%d</td><td class=num>Rs %s</td></tr>"
        % (esc(a), n(v, "votes"), n(v, "leads"), n(v, "orders"), "{:,.0f}".format(n(v, "value")))
        for a, v in sorted(areas.items(), key=lambda kv: -(n(kv[1], "votes") + n(kv[1], "leads") + 3 * n(kv[1], "orders"))))
    camp_rows = "".join(
        "<tr><td>%s</td><td class=num>%d</td><td class=num>%d</td><td class=num>%d</td></tr>"
        % (esc(k), n(v, "votes"), n(v, "leads"), n(v, "orders"))
        for k, v in sorted(camps.items(), key=lambda kv: -(n(kv[1], "votes") + n(kv[1], "leads") + 3 * n(kv[1], "orders"))))

    def wa_link(phone, text):
        return "https://wa.me/%s?text=%s" % (re.sub(r"\D", "", phone), quote(text))

    pre_rows = ""
    for r in pre:
        ref = "FK-%06d" % r["id"]
        opts = "".join('<option%s>%s</option>' % (" selected" if s == r["status"] else "", s) for s in STATUSES)
        msg = "Hi %s, this is FrescoKart about your pre-order %s. We can confirm your kit and a delivery slot. Is that alright?" % (r["name"] or "there", ref)
        extra = " ".join(x for x in (r["address"], r["notes"]) if x)
        pre_rows += ("<tr><td><b>%s</b><br><span class=muted>%s</span></td><td><select data-id=%d>%s</select></td>"
                     "<td>%s<br>%s<br><a class=wa href=\"%s\" target=_blank rel=noopener>WhatsApp</a></td><td>%s</td><td>%s</td>"
                     "<td class=num>Rs %s</td><td>%s<br><span class=muted>%s</span></td></tr>"
                     % (ref, esc(to_ist(r["created_at"])), r["id"], opts, esc(r["name"] or "No name"), esc(r["phone"]),
                        esc(wa_link(r["phone"], msg), quote=True), esc(r["area"]), esc(items_text(json.loads(r["items_json"]))),
                        "{:,.0f}".format(r["total"]), esc(extra), esc(r["campaign"] or "direct")))
    lead_rows = "".join(
        "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % (esc(to_ist(r["created_at"])), esc(r["phone"]), esc(r["area"]), esc(r["campaign"] or "direct"))
        for r in leads)

    numeric = {"Votes", "Sign-ups", "Pre-orders", "Value", "Total"}

    def table(head, rows, empty):
        if not rows:
            return '<div class="wrap"><div class=empty>%s</div></div>' % empty
        heads = "".join("<th%s>%s</th>" % (" class=num" if h in numeric else "", h) for h in head)
        return '<div class="wrap"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (heads, rows)

    return """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>FrescoKart admin</title><style>%s</style>
<header><b>FrescoKart admin</b><span><a href="/admin/export.csv">Pre-orders CSV</a><a href="/admin/export.csv?type=leads">Sign-ups CSV</a><a href="/admin/export.csv?type=votes">Area votes CSV</a><a href="/">View site</a></span></header>
<main>
<div class="cards">
<div class="card"><b>%d</b><span>Pre-orders (%d new)</span></div>
<div class="card"><b>Rs %s</b><span>Pre-order value</span></div>
<div class="card"><b>%d</b><span>Area sign-ups with a number</span></div>
<div class="card"><b>%d</b><span>Area votes</span></div>
</div>
<h2>Demand by area</h2>
%s
<h2>Ads and sources</h2>
%s
<h2>Pre-orders</h2>
%s
<h2>Area sign-ups</h2>
%s
<p class="muted">Times are in IST. Votes count one per visitor per area per day. Pre-order totals are what the visitor's page calculated, so confirm prices by message.</p>
</main><script>%s</script></html>""" % (
        ADMIN_CSS, n_pre, n_new, "{:,.0f}".format(value), n_leads, n_votes,
        table(["Area", "Votes", "Sign-ups", "Pre-orders", "Value"], area_rows, "Nothing yet."),
        table(["Source or campaign", "Votes", "Sign-ups", "Pre-orders"], camp_rows, "Nothing yet."),
        table(["Ref", "Status", "Customer", "Area", "Items", "Total", "Notes and source"], pre_rows, "No pre-orders yet."),
        table(["When", "Phone", "Area", "Source"], lead_rows, "No sign-ups yet."), ADMIN_JS)


class Handler(BaseHTTPRequestHandler):
    server_version = "FrescoKart"
    sys_version = ""
    fixed = None  # the Vercel files in ../api set the one route they answer, whatever path Vercel passes in

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    def ip(self):
        if TRUST_PROXY:
            for name in (("X-Vercel-Forwarded-For", "X-Forwarded-For", "X-Real-IP") if ON_VERCEL else ("X-Forwarded-For",)):
                forwarded = self.headers.get(name, "")
                if forwarded:
                    return forwarded.split(",")[0].strip()
        return self.client_address[0]

    def send_bytes(self, code, ctype, body, head=False, cache="no-store", csp=None, extra=None, api=False):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        if csp:
            self.send_header("Content-Security-Policy", csp)
        if api and CORS_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
            self.send_header("Vary", "Origin")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def send_json(self, code, obj):
        self.send_bytes(code, "application/json; charset=utf-8", json.dumps(obj, ensure_ascii=False).encode("utf-8"), api=True)

    def read_json(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None, "length"
        if n <= 0:
            return None, "empty"
        if n > MAX_BODY:
            return None, "size"
        try:
            return json.loads(self.rfile.read(n).decode("utf-8")), None
        except (UnicodeDecodeError, ValueError):
            return None, "json"

    def do_GET(self):
        self.route("GET")

    def do_HEAD(self):
        self.route("HEAD")

    def do_POST(self):
        self.route("POST")

    def do_OPTIONS(self):
        if not CORS_ORIGIN or not self.path.startswith("/api/"):
            return self.send_json(404, {"ok": False, "error": "not_found"})
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-FK")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def route(self, method):
        try:
            path = self.fixed or urlparse(self.path).path
            if path == "/api/health":
                return self.health()
            if ON_VERCEL and not USE_PG:
                return self.no_database(path)
            if path in HANDLERS:
                return self.api_post(path) if method == "POST" else self.send_json(405, {"ok": False, "error": "method"})
            if path.startswith("/api/"):
                return self.send_json(404, {"ok": False, "error": "not_found"})
            if path == "/admin" or path.startswith("/admin/"):
                return self.admin(method, path)
            if method in ("GET", "HEAD"):
                return self.static(path, method == "HEAD")
            self.send_json(405, {"ok": False, "error": "method"})
        except Exception:
            traceback.print_exc()
            try:
                self.send_json(500, {"ok": False, "error": "server"})
            except Exception:
                pass

    def health(self):
        # The page calls this to decide between "save on the server" and "open WhatsApp". Adding ?deep=1 also tests the database.
        if ON_VERCEL and not USE_PG:
            return self.send_json(503, {"ok": False, "error": "no_database"})
        if "deep" in parse_qs(urlparse(self.path).query):
            try:
                with closing(db()) as c:
                    c.execute("SELECT 1").fetchone()
            except Exception:
                traceback.print_exc()
                return self.send_json(503, {"ok": False, "error": "database"})
            return self.send_json(200, {"ok": True, "db": "postgres" if USE_PG else "sqlite"})
        self.send_json(200, {"ok": True})

    def no_database(self, path):
        if path.startswith("/api/"):
            return self.send_json(503, {"ok": False, "error": "no_database", "message": "Pre-orders are not being saved yet. Please use WhatsApp."})
        self.send_bytes(503, "text/plain; charset=utf-8",
                        b"No database is connected yet. In Vercel, open the project's Storage tab, add a Postgres database, then redeploy.")

    def api_post(self, path):
        ip = self.ip()
        limit, window = LIMITS[path]
        if not LIMITER.allow((path, ip), limit, window):
            return self.send_json(429, {"ok": False, "error": "rate", "message": "Too many requests. Please try again in a while."})
        if self.headers.get("X-FK") != "1" or not (self.headers.get("Content-Type") or "").lower().startswith("application/json"):
            return self.send_json(400, {"ok": False, "error": "request"})
        data, err = self.read_json()
        if err:
            return self.send_json(413 if err == "size" else 400, {"ok": False, "error": err})
        if not isinstance(data, dict):
            return self.send_json(400, {"ok": False, "error": "json"})
        code, payload = HANDLERS[path](data, ip, self.headers.get("User-Agent", ""))
        self.send_json(code, payload)

    def admin_ok(self):
        if not ADMIN_PW:  # never let an empty password in
            self.send_bytes(503, "text/plain; charset=utf-8", b"The admin page is closed until the FK_ADMIN_PASSWORD setting is added.")
            return False
        ip = self.ip()
        header = self.headers.get("Authorization", "")
        if header.startswith("Basic "):
            try:
                user, _, pw = base64.b64decode(header[6:]).decode("utf-8").partition(":")
            except (ValueError, UnicodeDecodeError):
                user, pw = "", ""
            if hmac.compare_digest(user.encode(), b"admin") and hmac.compare_digest(pw.encode(), ADMIN_PW.encode()):
                return True
            if not LIMITER.allow(("admin-fail", ip), 10, 600):
                self.send_bytes(429, "text/plain; charset=utf-8", b"Too many attempts. Try again in a few minutes.")
                return False
        self.send_bytes(401, "text/plain; charset=utf-8", b"Sign in to see the admin page.",
                        extra={"WWW-Authenticate": 'Basic realm="FrescoKart admin", charset="UTF-8"'})
        return False

    def admin(self, method, path):
        if not self.admin_ok():
            return
        if path == "/admin" and method in ("GET", "HEAD"):
            return self.send_bytes(200, "text/html; charset=utf-8", render_admin().encode("utf-8"), method == "HEAD", csp=ADMIN_CSP)
        if path == "/admin/export.csv" and method in ("GET", "HEAD"):
            kind = (parse_qs(urlparse(self.path).query).get("type") or ["preorders"])[0]
            name = {"leads": "area-signups", "votes": "area-votes"}.get(kind, "preorders")
            return self.send_bytes(200, "text/csv; charset=utf-8", export_csv(kind), method == "HEAD",
                                   extra={"Content-Disposition": 'attachment; filename="frescokart-%s.csv"' % name})
        if path == "/admin/status" and method == "POST":
            if self.headers.get("X-FK-Admin") != "1":
                return self.send_json(400, {"ok": False, "error": "request"})
            data, err = self.read_json()
            if (err or not isinstance(data, dict) or data.get("status") not in STATUSES
                    or type(data.get("id")) is not int or not 0 < data["id"] < 2 ** 62):
                return self.send_json(400, {"ok": False, "error": "bad_request"})
            with closing(db()) as c:
                changed = c.execute("UPDATE preorders SET status=? WHERE id=?", (data["status"], data["id"])).rowcount
                c.commit()
            return self.send_json(200 if changed else 404, {"ok": bool(changed)})
        self.send_json(404, {"ok": False, "error": "not_found"})

    def static(self, path, head):
        rel = unquote(path).lstrip("/")
        if not rel or rel.endswith("/"):
            rel += "index.html"
        parts = [p for p in re.split(r"[\\/]", rel) if p]
        if any(p.startswith(".") for p in parts):
            return self.send_bytes(404, "text/plain; charset=utf-8", b"Not found", head)
        try:
            target = (WEB_DIR / rel).resolve()
        except (OSError, ValueError):
            return self.send_bytes(404, "text/plain; charset=utf-8", b"Not found", head)
        ext = target.suffix.lower()
        if (target != WEB_DIR and WEB_DIR not in target.parents) or ext not in STATIC_TYPES or not target.is_file():
            return self.send_bytes(404, "text/plain; charset=utf-8", b"Not found", head)
        self.send_bytes(200, STATIC_TYPES[ext], target.read_bytes(), head,
                        cache="no-cache" if ext == ".html" else "public, max-age=86400",
                        csp=PAGE_CSP if ext == ".html" else None)


def main():
    global WEB_DIR, DATA_DIR, ADMIN_PW
    ap = argparse.ArgumentParser(description="FrescoKart pre-order server")
    ap.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    ap.add_argument("--data-dir", help="folder for the database")
    ap.add_argument("--web-dir", help="folder with the landing page")
    ap.add_argument("--admin-password", help="admin password (prefer the FK_ADMIN_PASSWORD variable)")
    args = ap.parse_args()
    if args.data_dir:
        DATA_DIR = Path(args.data_dir).resolve()
    if args.web_dir:
        WEB_DIR = Path(args.web_dir).resolve()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    init_db()
    secret()
    ADMIN_PW = args.admin_password or os.environ.get("FK_ADMIN_PASSWORD") or ""
    generated = False
    if not ADMIN_PW:
        ADMIN_PW = load_or_create(DATA_DIR / "admin_password.txt", lambda: secrets.token_urlsafe(12))
        generated = True
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    shown = "127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host
    print("FrescoKart server")
    print("  site  : http://%s:%d/" % (shown, args.port))
    print("  admin : http://%s:%d/admin   user: admin" % (shown, args.port))
    print("  web   : %s" % WEB_DIR)
    print("  data  : %s" % ("Postgres (FK_DATABASE_URL)" if USE_PG else DATA_DIR))
    if generated:
        print("  admin password (saved in data/admin_password.txt): %s" % ADMIN_PW)
        print("  Set FK_ADMIN_PASSWORD to choose your own.")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
