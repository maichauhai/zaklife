#!/usr/bin/env python3
import argparse
import json
import mimetypes
import os
import tempfile
import urllib.parse
import urllib.request
import re
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MONSTEA_ROOT = ROOT.parent
CALENDAR_PATH = ROOT / "content-calendar.json"
LOG_PATH = ROOT / "logs" / "post-log.jsonl"
CREDENTIAL_PATH = MONSTEA_ROOT / "credentials" / "facebook.json"
FIREBASE_DB_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
FIREBASE_CALENDAR_PATH = "zaklife/content-calendar"
FIREBASE_LOG_PATH = "zaklife/content-log"
LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
MAX_LATE_MINUTES = int(os.environ.get("MONSTEA_MAX_LATE_MINUTES", "30"))
LOCK_PATH = ROOT / "logs" / "post_due.lock"
LOCK_STALE_SECONDS = 10 * 60


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def load_json(path, default):
    if not path.exists():
        return default
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return default
    return json.loads(text)


def write_json(path, data):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def fb_url(path):
    path = path.strip("/")
    return f"{FIREBASE_DB_URL}/{path}.json"


def firebase_request(method, path, data=None):
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(fb_url(path), data=body, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json; charset=utf-8")
    with urllib.request.urlopen(req, timeout=45) as res:
        text = res.read().decode("utf-8")
        return json.loads(text) if text else None


def firebase_get(path, default=None):
    data = firebase_request("GET", path)
    return default if data is None else data


def firebase_patch(path, data):
    return firebase_request("PATCH", path, data)


def firebase_post(path, data):
    return firebase_request("POST", path, data)


def log_event(event):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    event = {"time": now_iso(), **event}
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")
    try:
        firebase_post(FIREBASE_LOG_PATH, event)
    except Exception:
        pass


def parse_dt(value):
    if not value:
        return None
    value = value.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=LOCAL_TZ)
    return dt


def scheduled_dt(post):
    scheduled = post.get("scheduled_at")
    if not scheduled:
        date = post.get("scheduledDate") or post.get("date")
        time = post.get("scheduledTime") or post.get("time") or "09:00"
        scheduled = f"{date}T{time}:00" if date else ""
    return parse_dt(scheduled)


def acquire_lock():
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        if LOCK_PATH.exists() and datetime.now().timestamp() - LOCK_PATH.stat().st_mtime > LOCK_STALE_SECONDS:
            LOCK_PATH.unlink()
        fd = os.open(str(LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode("utf-8"))
        return fd
    except FileExistsError:
        return None


def release_lock(fd):
    try:
        os.close(fd)
    except OSError:
        pass
    try:
        LOCK_PATH.unlink()
    except FileNotFoundError:
        pass


def resolve_photo(photo_path):
    """If photo_path is a URL, download to a temp file and return the temp path.
    Otherwise return the original path (backward compatible)."""
    if not photo_path:
        return None, False
    photo_path = photo_path.strip()
    
    # Handle Google Drive shareable links
    match = re.search(r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)', photo_path)
    if match:
        photo_path = f"https://drive.google.com/uc?export=download&id={match.group(1)}"

    if photo_path.lower().startswith(("http://", "https://")):
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
        tmp.close()
        try:
            # Add user agent to prevent 403 Forbidden from some services (like Google Drive)
            req = urllib.request.Request(photo_path, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as res:
                content_type = res.headers.get("Content-Type", "")
                data = res.read()
                if content_type and "image/" not in content_type and "application/octet-stream" not in content_type:
                    raise ValueError(f"Photo URL did not return an image: {content_type}")
                if data.lstrip().lower().startswith(b"<!doctype html") or data.lstrip().lower().startswith(b"<html"):
                    raise ValueError("Photo URL returned an HTML page instead of an image")
                with open(tmp.name, 'wb') as f:
                    f.write(data)
        except Exception:
            os.unlink(tmp.name)
            raise
        return tmp.name, True
    return photo_path, False


def is_due(post, now):
    if post.get("status") != "approved":
        return False
    scheduled = scheduled_dt(post)
    if not scheduled:
        return False
    return scheduled <= now


def is_too_late(post, now):
    scheduled = scheduled_dt(post)
    if not scheduled or MAX_LATE_MINUTES < 0:
        return False
    return now - scheduled > timedelta(minutes=MAX_LATE_MINUTES)


def api_base(creds):
    version = creds.get("api_version") or "v21.0"
    return f"https://graph.facebook.com/{version}"


def is_public_url(value):
    return value.lower().startswith(("http://", "https://"))


def is_local_media_path(value):
    return bool(re.match(r"^[a-zA-Z]:[\\/].+\.(png|jpe?g|webp|gif)$", value.strip(), re.IGNORECASE))


def clean_message(value):
    lines = []
    for line in (value or "").replace("\r\n", "\n").split("\n"):
        if is_local_media_path(line.strip()):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def post_form(url, fields):
    data = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=45) as res:
        return json.loads(res.read().decode("utf-8"))


def post_multipart(url, fields, file_field, file_path):
    boundary = f"----monstea{int(datetime.now().timestamp() * 1000)}"
    body = bytearray()

    def add_field(name, value):
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")

    for key, value in fields.items():
        add_field(key, value)

    mime = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(f'Content-Disposition: form-data; name="{file_field}"; filename="{file_path.name}"\r\n'.encode())
    body.extend(f"Content-Type: {mime}\r\n\r\n".encode())
    body.extend(file_path.read_bytes())
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())

    req = urllib.request.Request(url, data=bytes(body), method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    with urllib.request.urlopen(req, timeout=90) as res:
        return json.loads(res.read().decode("utf-8"))


def publish_to_facebook(creds, post):
    page_id = creds["page_id"]
    token = creds["page_access_token"]
    base = api_base(creds)
    message = clean_message(post.get("message") or "")
    link = (post.get("link") or "").strip()
    public_link = link if is_public_url(link) else ""
    photo_ref = (post.get("image_url") or post.get("photo_url") or post.get("photo_path") or "").strip()

    if not message and not public_link and not photo_ref:
        raise ValueError("Post is empty")

    temp_path = None
    try:
        if photo_ref:
            caption = message
            if public_link:
                caption = (caption + "\n\n" + public_link).strip()

            resolved, is_temp = resolve_photo(photo_ref)
            if is_temp:
                temp_path = resolved

            path = Path(resolved)
            if not path.is_absolute():
                path = ROOT / resolved
            if not path.exists():
                raise FileNotFoundError(f"Photo not found: {path}")
            return post_multipart(
                f"{base}/{page_id}/photos",
                {"access_token": token, "caption": caption, "published": "true"},
                "source",
                path,
            )

        fields = {"access_token": token}
        if message:
            fields["message"] = message
        if public_link:
            fields["link"] = public_link
        return post_form(f"{base}/{page_id}/feed", fields)
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass

def load_calendar(source):
    if source in ("firebase", "auto"):
        try:
            data = firebase_get(FIREBASE_CALENDAR_PATH, {})
            if isinstance(data, dict) and data:
                return "firebase", list(data.values())
            if source == "firebase":
                return "firebase", []
        except Exception as exc:
            if source == "firebase":
                raise
            log_event({"level": "warning", "event": "firebase_read_failed", "error": str(exc)})
    data = load_json(CALENDAR_PATH, [])
    return "json", data if isinstance(data, list) else list(data.values())


def update_post(source, post_id, patch, items=None):
    if source == "firebase":
        firebase_patch(f"{FIREBASE_CALENDAR_PATH}/{post_id}", patch)
        return
    if items is None:
        return
    for item in items:
        if item.get("id") == post_id:
            item.update(patch)
            break
    write_json(CALENDAR_PATH, items)


def process(source="firebase", dry_run=False, post_id=None):
    lock_fd = acquire_lock()
    if lock_fd is None:
        log_event({"level": "info", "event": "post_due_locked", "source": source})
        return {"posted": 0, "locked": True, "message": "Another due-post run is active", "source": source}

    try:
        creds = load_json(CREDENTIAL_PATH, {})
        if not creds.get("page_access_token") or not creds.get("page_id"):
            raise RuntimeError(f"Missing page_access_token/page_id in {CREDENTIAL_PATH}")

        actual_source, items = load_calendar(source)
        now = datetime.now(LOCAL_TZ)
        if post_id:
            due_items = [p for p in items if p.get("id") == post_id and p.get("status") == "approved"]
        else:
            due_items = [p for p in items if is_due(p, now)]

        if not due_items:
            log_event({"level": "info", "event": "no_due_posts", "source": actual_source})
            return {"posted": 0, "message": "No due approved posts", "source": actual_source}

        posted = 0
        failed = 0
        skipped_late = 0
        for post in due_items:
            pid = post.get("id")
            if not pid:
                continue

            if not post_id and is_too_late(post, now):
                skipped_late += 1
                scheduled = scheduled_dt(post)
                patch = {
                    "status": "missed",
                    "missed_at": now_iso(),
                    "last_error": f"Missed scheduled window by more than {MAX_LATE_MINUTES} minutes",
                }
                if not dry_run:
                    update_post(actual_source, pid, patch, items)
                log_event({
                    "level": "warning",
                    "event": "post_missed_late",
                    "post_id": pid,
                    "scheduled_at": scheduled.isoformat() if scheduled else "",
                    "max_late_minutes": MAX_LATE_MINUTES,
                    "source": actual_source,
                    "dry_run": dry_run,
                })
                continue

            if dry_run:
                posted += 1
                log_event({"level": "info", "event": "dry_run", "post_id": pid, "source": actual_source})
                continue

            update_post(actual_source, pid, {"last_attempt_at": now_iso(), "attempt_count": int(post.get("attempt_count") or 0) + 1}, items)
            try:
                result = publish_to_facebook(creds, post)
                patch = {
                    "posted_at": now_iso(),
                    "facebook_post_id": result.get("post_id") or result.get("id"),
                    "last_error": None,
                }
                patch["status"] = "posted"
                update_post(actual_source, pid, patch, items)
                posted += 1
                log_event({"level": "info", "event": "posted", "post_id": pid, "facebook_post_id": patch.get("facebook_post_id"), "source": actual_source})
            except Exception as exc:
                failed += 1
                update_post(actual_source, pid, {"last_error": str(exc), "status": "failed"}, items)
                log_event({"level": "error", "event": "post_failed", "post_id": pid, "error": str(exc), "source": actual_source})
        return {"posted": posted, "failed": failed, "skipped_late": skipped_late, "dry_run": dry_run, "source": actual_source}
    finally:
        release_lock(lock_fd)


def main():
    parser = argparse.ArgumentParser(description="Post approved due Monstea Facebook posts.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--post-id")
    parser.add_argument("--source", choices=["firebase", "json", "auto"], default="firebase")
    parser.add_argument("--firebase", action="store_true", help="Shortcut for --source firebase")
    args = parser.parse_args()
    source = "firebase" if args.firebase else args.source
    print(json.dumps(process(source=source, dry_run=args.dry_run, post_id=args.post_id), ensure_ascii=False))


if __name__ == "__main__":
    main()
