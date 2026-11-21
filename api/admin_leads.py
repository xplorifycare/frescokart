"""Vercel function for /admin/leads and /admin/leads/* (vercel.json rewrites them here), the sign-ups dashboard.
All the code is in server/demand.py; this file only says which route it answers."""
import os
import sys
from http.server import BaseHTTPRequestHandler

os.environ.setdefault("VERCEL", "1")  # only Vercel runs the files in api/, so make sure the server knows it
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from server.app import Handler  # noqa: E402


class handler(Handler, BaseHTTPRequestHandler):
    fixed = "/admin/leads"
