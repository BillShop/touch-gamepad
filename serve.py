"""Serveur de dev statique SANS cache (ThreadingHTTPServer).

Usage :
    python serve.py            # port 8000
    python serve.py 8080       # port au choix

No-cache : force Cache-Control: no-store et neutralise les requêtes conditionnelles,
utile quand les fichiers vivent sur un disque synchronisé (mtime peu fiable).
Multi-thread : sert les imports ES parallèles sans refuser les connexions.
"""
import sys
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _strip_conditionals(self):
        for h in ("If-Modified-Since", "If-None-Match", "If-Range"):
            if h in self.headers:
                del self.headers[h]

    def do_GET(self):
        self._strip_conditionals()
        super().do_GET()

    def do_HEAD(self):
        self._strip_conditionals()
        super().do_HEAD()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_header(self, keyword, value):
        if keyword.lower() == "last-modified":
            return
        super().send_header(keyword, value)


if __name__ == "__main__":
    print(f"No-cache server : http://localhost:{PORT}  (racine : {ROOT})")
    ThreadingHTTPServer(("", PORT), NoCacheHandler).serve_forever()
