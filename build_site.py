#!/usr/bin/env python3
"""Build web/index.html from frescokart-landing.html.

frescokart-landing.html is the page exactly as it is published as an artifact. This adds what a real
website needs around it (doctype, language, viewport, icon, description) and writes web/index.html,
which server/app.py serves. Run it after every change to frescokart-landing.html:

  python build_site.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "frescokart-landing.html"
OUT = ROOT / "web" / "index.html"

DESCRIPTION = ("Ready-to-cook Kerala fish kits: fresh fish, cut vegetables and measured masalas in one chilled pack, "
               "with the cooking steps in the app. Pre-orders for Kochi.")

HEAD = (
    '<!doctype html>\n<html lang="en">\n'
    '<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    '<meta name="theme-color" content="#006B48">\n'
    '<meta name="description" content="%s">\n'
    '<meta property="og:type" content="website">\n'
    '<meta property="og:title" content="FrescoKart: the whole dish, ready to cook">\n'
    '<meta property="og:description" content="%s">\n'
    '<link rel="icon" href="img/symbol-colour.svg" type="image/svg+xml">\n' % (DESCRIPTION, DESCRIPTION)
)


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(HEAD + SRC.read_text(encoding="utf-8") + "\n</html>\n", encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
