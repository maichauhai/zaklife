#!/usr/bin/env python3
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import post_due_facebook
try:
    import post_due_reels
except Exception:
    post_due_reels = None


def json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class RelayHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            json_response(self, 200, {"ok": True, "service": "monstea-facebook-relay"})
            return
        json_response(self, 404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length).decode("utf-8") if length else ""
        try:
            body = json.loads(raw_body) if raw_body.strip() else {}
        except json.JSONDecodeError:
            body = {}
        query = parse_qs(parsed.query)
        dry_run = bool(body.get("dry_run") or query.get("dry_run"))

        try:
            if parsed.path == "/post-due":
                result = post_due_facebook.process(source="firebase", dry_run=dry_run)
                json_response(self, 200, {"ok": True, **result})
                return

            if parsed.path == "/post-now":
                post_id = body.get("post_id") or (query.get("post_id") or [""])[0]
                if not post_id:
                    json_response(self, 400, {"ok": False, "error": "Missing post_id"})
                    return
                result = post_due_facebook.process(source="firebase", dry_run=dry_run, post_id=post_id)
                json_response(self, 200, {"ok": True, **result})
                return

            if parsed.path == "/post-due-reels":
                if post_due_reels is None:
                    json_response(self, 500, {"ok": False, "error": "Reel worker is not available"})
                    return
                result = post_due_reels.process(source="firebase", dry_run=dry_run)
                json_response(self, 200, {"ok": True, **result})
                return

            if parsed.path == "/post-reel-now":
                if post_due_reels is None:
                    json_response(self, 500, {"ok": False, "error": "Reel worker is not available"})
                    return
                post_id = body.get("post_id") or (query.get("post_id") or [""])[0]
                if not post_id:
                    json_response(self, 400, {"ok": False, "error": "Missing post_id"})
                    return
                result = post_due_reels.process(source="firebase", dry_run=dry_run, post_id=post_id)
                json_response(self, 200, {"ok": True, **result})
                return

            json_response(self, 404, {"ok": False, "error": "Not found"})
        except Exception as exc:
            json_response(self, 500, {"ok": False, "error": str(exc)})


def main():
    parser = argparse.ArgumentParser(description="Local HTTP relay for Monstea Facebook posting.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), RelayHandler)
    print(f"Monstea Facebook relay listening on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
