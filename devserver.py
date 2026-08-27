"""Tiny static dev server for the game.

Plain `python -m http.server` lets the browser cache index.html/CSS/JS hard,
which during development shows you a stale build after every edit (ES modules
are especially sticky — a normal reload keeps the old module). This wrapper is
the same server with caching switched off, so a plain F5 always shows the
current files.

    python devserver.py [port]     # default 8842
"""

import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_response(self, *args, **kwargs):
        # Never answer with 304 Not Modified — always send the real file.
        super().send_response(*args, **kwargs)

    def send_header(self, keyword, value):
        # Drop validators so the browser can't do conditional requests.
        if keyword.lower() in ("last-modified", "etag"):
            return
        super().send_header(keyword, value)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8842
    handler = partial(NoCacheHandler, directory=".")
    server = HTTPServer(("127.0.0.1", port), handler)
    print(f"Elemental Chaos dev server: http://localhost:{port}  (no-cache)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
