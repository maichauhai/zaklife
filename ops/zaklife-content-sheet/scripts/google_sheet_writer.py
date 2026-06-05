#!/usr/bin/env python3
import base64
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

DEFAULT_SERVICE_ACCOUNT = r"C:\Users\pc\Desktop\Multiagent\monstea-2446b3c36803.json"
DEFAULT_SHEET_ID = "1A1-QfM_hk-5_uGiZLrVu2c7ZcJetdqqCH-lfan430bU"
DEFAULT_RANGE = "Content!A:K"

HEADERS = [
    "id",
    "title",
    "caption",
    "image_url",
    "thumb_url",
    "scheduled_date",
    "scheduled_time",
    "status",
    "platform",
    "content_type",
    "notes",
]


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def load_key():
    path = Path(os.environ.get("ZAKLIFE_GOOGLE_SERVICE_ACCOUNT_JSON") or DEFAULT_SERVICE_ACCOUNT)
    if not path.exists():
        raise FileNotFoundError(f"Google service account file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def access_token():
    key = load_key()
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claim = {
        "iss": key["client_email"],
        "scope": "https://www.googleapis.com/auth/spreadsheets",
        "aud": key["token_uri"],
        "iat": now,
        "exp": now + 3600,
    }
    signing_input = (
        f"{b64url(json.dumps(header, separators=(',', ':')).encode())}."
        f"{b64url(json.dumps(claim, separators=(',', ':')).encode())}"
    ).encode()
    private_key = serialization.load_pem_private_key(key["private_key"].encode(), password=None)
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    assertion = signing_input.decode() + "." + b64url(signature)
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion,
    }).encode()
    req = urllib.request.Request(key["token_uri"], data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    data = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
    return data["access_token"]


def sheets_request(method, url, token, payload=None):
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if body is not None:
        req.add_header("Content-Type", "application/json; charset=utf-8")
    text = urllib.request.urlopen(req, timeout=45).read().decode("utf-8")
    return json.loads(text) if text else {}


def normalize_post(post):
    if not isinstance(post, dict):
        raise ValueError("Each post must be an object")
    normalized = {key: str(post.get(key) or "").strip() for key in HEADERS}
    if not normalized["id"]:
        raise ValueError("id is required")
    if not normalized["title"] and not normalized["caption"]:
        raise ValueError("title or caption is required")
    if not normalized["scheduled_date"]:
        raise ValueError("scheduled_date is required")
    if not normalized["scheduled_time"]:
        normalized["scheduled_time"] = "09:00"
    if not normalized["status"]:
        normalized["status"] = "ready"
    if not normalized["platform"]:
        normalized["platform"] = "facebook"
    if not normalized["content_type"]:
        normalized["content_type"] = "post"
    return normalized


def extract_posts(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("posts", "items", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
        return [payload]
    raise ValueError("Payload must be an object or an array")


def append_posts(payload, dry_run=False, sheet_id=DEFAULT_SHEET_ID):
    posts = [normalize_post(post) for post in extract_posts(payload)]
    values = [[post[key] for key in HEADERS] for post in posts]
    if dry_run:
        return {"status": "ok", "dry_run": True, "appended": 0, "would_append": len(values), "ids": [p["id"] for p in posts]}
    token = access_token()
    quoted_range = urllib.parse.quote(DEFAULT_RANGE, safe="")
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{quoted_range}:append"
        "?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"
    )
    result = sheets_request("POST", url, token, {"values": values})
    return {
        "status": "ok",
        "dry_run": False,
        "appended": len(values),
        "ids": [p["id"] for p in posts],
        "updates": result.get("updates", {}),
    }
