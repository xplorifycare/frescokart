#!/usr/bin/env python3
"""Builds the Kerala place lists behind the /join page from the Department of Posts PIN directory (data.gov.in).

  python build_places.py              fetch the directory (about 500 small requests, 15 minutes or more) and write the files
  python build_places.py raw.json     use a copy you downloaded before (a JSON list of the directory's records)

Writes two files with the same content:
  web/join/data/places.json   what the page loads: districts, PIN areas and every post office place
  server/kerala_places.py     the server's copy, used to check sign-ups and to name each area

How places are grouped: every post office is a place people know ("Thrikkakara", "Edappally North"). Places that share a
PIN code form one area, named after its main post office (head or sub office). Progress and the "which place goes first"
board count by area, so neighbours on the same PIN add up instead of splitting into tiny lists.
"""
import json
import re
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UA = "Mozilla/5.0 (compatible; FrescoKart place-list builder)"  # the site stalls requests with Python's default name
KEY = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b"  # data.gov.in's published sample key (10 rows per call)
URL = ("https://api.data.gov.in/resource/5c2f62fe-5afa-4119-a499-fec9d604d5bd?api-key=%s&format=json&limit=10&offset=%d"
       "&filters%%5Bstatename%%5D=KERALA")

# id, English name, Malayalam name. The directory writes district names in capitals and sometimes spells them differently.
DISTRICTS = [
    ("thiruvananthapuram", "Thiruvananthapuram", "തിരുവനന്തപുരം"), ("kollam", "Kollam", "കൊല്ലം"),
    ("pathanamthitta", "Pathanamthitta", "പത്തനംതിട്ട"), ("alappuzha", "Alappuzha", "ആലപ്പുഴ"),
    ("kottayam", "Kottayam", "കോട്ടയം"), ("idukki", "Idukki", "ഇടുക്കി"), ("ernakulam", "Ernakulam", "എറണാകുളം"),
    ("thrissur", "Thrissur", "തൃശ്ശൂർ"), ("palakkad", "Palakkad", "പാലക്കാട്"), ("malappuram", "Malappuram", "മലപ്പുറം"),
    ("kozhikode", "Kozhikode", "കോഴിക്കോട്"), ("wayanad", "Wayanad", "വയനാട്"), ("kannur", "Kannur", "കണ്ണൂർ"),
    ("kasaragod", "Kasaragod", "കാസർഗോഡ്"),
]
ALIASES = {"trivandrum": "thiruvananthapuram", "quilon": "kollam", "alleppey": "alappuzha", "cochin": "ernakulam",
           "trichur": "thrissur", "palghat": "palakkad", "calicut": "kozhikode", "cannanore": "kannur",
           "kasargod": "kasaragod", "kasaragode": "kasaragod", "wayanadu": "wayanad", "pathanamthitta": "pathanamthitta"}
SUFFIX = re.compile(r"\s+(?:B\.?\s?O|S\.?\s?O|H\.?\s?O|G\.?\s?P\.?\s?O|M\.?\s?D\.?\s?G)\.?$", re.I)


def fetch():
    rows, offset, total = [], 0, None
    while total is None or offset < total:
        for attempt in range(14):  # the site throttles bursts, so wait longer after each failure
            try:
                req = urllib.request.Request(URL % (KEY, offset), headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=40) as r:
                    d = json.loads(r.read().decode("utf-8"))
                if "records" in d:
                    break
            except Exception:
                pass
            time.sleep(min(90, 8 * (attempt + 1)))
        else:
            sys.exit("data.gov.in stopped answering at row %d. Run again later." % offset)
        total = int(d["total"])
        rows += d["records"]
        offset += 10
        if offset % 500 == 0:
            print("  %d / %d" % (min(offset, total), total), flush=True)
        time.sleep(1.2)
    return rows


def district_id(raw):
    key = re.sub(r"[^a-z]", "", str(raw or "").lower())
    for did, name, _ in DISTRICTS:
        if key == re.sub(r"[^a-z]", "", name.lower()):
            return did
    return ALIASES.get(key)


def clean_name(raw):
    name = SUFFIX.sub("", re.sub(r"\s+", " ", str(raw or "")).strip())
    return name[:1].upper() + name[1:] if name else ""


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def build(rows):
    offices, skipped = [], Counter()
    for r in rows:
        pin = str(r.get("pincode") or "").split(".")[0].strip()
        did = district_id(r.get("district"))
        name = clean_name(r.get("officename"))
        if not re.fullmatch(r"6[789]\d{4}", pin):
            skipped["pin"] += 1
            continue
        if not did:
            skipped["district %s" % r.get("district")] += 1
            continue
        if not name:
            skipped["name"] += 1
            continue
        offices.append({"name": name, "pin": pin, "d": did, "type": str(r.get("officetype") or "").upper(),
                        "delivery": str(r.get("delivery") or "").lower().startswith("delivery")})
    by_pin = defaultdict(list)
    for o in offices:
        by_pin[o["pin"]].append(o)
    dindex = {did: i for i, (did, _, _) in enumerate(DISTRICTS)}
    zones = []
    for pin in sorted(by_pin):
        group = by_pin[pin]
        rank = lambda o: (o["type"] not in ("HO", "SO"), not o["delivery"], o["type"] != "SO", o["name"])  # noqa: E731
        main = sorted(group, key=rank)[0]
        district = Counter(o["d"] for o in group).most_common(1)[0][0]
        zones.append({"pin": pin, "name": main["name"], "d": district})
    # one link name per area: its name, unless another area or a district already uses it
    district_ids = {did for did, _, _ in DISTRICTS}
    counts = Counter(slug(z["name"]) for z in zones)
    for z in zones:
        s = slug(z["name"])
        z["slug"] = s if counts[s] == 1 and s not in district_ids else "%s-%s" % (s, z["pin"])
    zindex = {z["pin"]: i for i, z in enumerate(zones)}
    places, seen = [], set()
    for o in sorted(offices, key=lambda o: (o["d"], o["name"].lower(), o["pin"])):
        key = (o["name"].lower(), o["pin"])
        if key in seen:
            continue
        seen.add(key)
        places.append([o["name"], zindex[o["pin"]], dindex[o["d"]]])
    data = {"v": 1, "source": "Department of Posts, All India Pincode Directory (data.gov.in)", "built": time.strftime("%Y-%m-%d"),
            "districts": [[did, name, ml] for did, name, ml in DISTRICTS],
            "zones": [[z["name"], z["pin"], dindex[z["d"]], z["slug"]] for z in zones],
            "places": places}
    return data, skipped


def main():
    if len(sys.argv) > 1:
        rows = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    else:
        print("Fetching the Kerala PIN directory from data.gov.in…")
        rows = fetch()
    data, skipped = build(rows)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    out = ROOT / "web" / "join" / "data" / "places.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    (ROOT / "server" / "kerala_places.py").write_text(
        '"""Kerala districts, PIN areas and post office places for the /join waiting list.\n'
        'Generated by build_places.py from the Department of Posts PIN directory on data.gov.in. Do not edit by hand."""\n'
        "import json\n\nDATA = json.loads(%r)\n" % text, encoding="utf-8")
    print("%d records -> %d places in %d PIN areas, %d districts" % (len(rows), len(data["places"]), len(data["zones"]), len(data["districts"])))
    if skipped:
        print("skipped:", dict(skipped))
    print("wrote", out, "and server/kerala_places.py")


if __name__ == "__main__":
    main()
