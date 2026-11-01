"""Vercel function for /api/preorders. All the code is in server/app.py; this file only says which route it answers."""
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from server.app import Handler  # noqa: E402


class handler(Handler, BaseHTTPRequestHandler):
    fixed = "/api/preorders"
