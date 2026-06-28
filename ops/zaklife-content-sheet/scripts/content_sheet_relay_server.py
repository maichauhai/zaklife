#!/usr/bin/env python3
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import sync_content_sheet
import google_sheet_writer


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
            json_response(self, 200, {"ok": True, "service": "zaklife-content-sheet-relay"})
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
        body_options = body if isinstance(body, dict) else {}
        query = parse_qs(parsed.query)

        if parsed.path not in {"/sync", "/append"}:
            json_response(self, 404, {"ok": False, "error": "Not found"})
            return

        try:
            if parsed.path == "/append":
                dry_run = bool(body_options.get("dry_run") or query.get("dry_run"))
                result = google_sheet_writer.append_posts(body, dry_run=dry_run)
                json_response(self, 200, {"ok": True, **result})
                return

            argv = []
            if body_options.get("dry_run") or query.get("dry_run"):
                argv.append("--dry-run")
            target_status = body_options.get("target_status") or (query.get("target_status") or [""])[0]
            if target_status:
                argv.extend(["--target-status", target_status])

            old_argv = sync_content_sheet.sys.argv
            sync_content_sheet.sys.argv = ["sync_content_sheet.py", *argv]
            try:
                args = sync_content_sheet.parse_args()
            finally:
                sync_content_sheet.sys.argv = old_argv

            result = sync_content_sheet.process(args)
            status = 500 if result.get("status") == "error" else 200
            json_response(self, status, {"ok": status == 200, **result})
        except Exception as exc:
            json_response(self, 500, {"ok": False, "status": "error", "error": str(exc)})


def main():
    parser = argparse.ArgumentParser(description="Local HTTP relay for ZakLife Content Sheet sync.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8788)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), RelayHandler)
    print(f"ZakLife Content Sheet relay listening on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
