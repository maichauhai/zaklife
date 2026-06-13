#!/usr/bin/env python3
import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

FIREBASE_DB_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
FIREBASE_CALENDAR_PATH = "zaklife/content-calendar"
FIREBASE_AUTOMATION_PATH = "zaklife/automation/contentSheetSync"
DEFAULT_SHEET_ID = "1A1-QfM_hk-5_uGiZLrVu2c7ZcJetdqqCH-lfan430bU"
DEFAULT_GID = "453629334"
LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
DEFAULT_IMPORT_STATUSES = {"ready", "sync", "import"}

FIELD_ALIASES = {
    "id": ["id", "post_id", "ma", "ma_bai", "ma_bai_viet"],
    "zaklife_id": ["zaklife_id", "zaklifeid"],
    "title": ["title", "tieu_de", "ten_bai"],
    "caption": ["caption", "noi_dung", "content", "message", "body"],
    "image_url": ["image_url", "photo_url", "photo", "image", "anh", "link_anh", "url_anh"],
    "thumb_url": ["thumb_url", "thumbnail", "thumbnail_url", "anh_thumb"],
    "scheduled_date": ["scheduled_date", "date", "ngay", "ngay_dang"],
    "scheduled_time": ["scheduled_time", "time", "gio", "gio_dang"],
    "status": ["status", "trang_thai"],
    "platform": ["platform", "kenh"],
    "content_type": ["content_type", "type", "loai", "dinh_dang"],
    "notes": ["notes", "note", "ghi_chu"],
    "reel_enabled": ["reel_enabled", "reel", "tao_reel", "create_reel"],
    "music_url": ["music_url", "musicurl", "music", "nhac", "link_nhac", "link_nhac_google_drive"],
    "reel_caption": ["reel_caption", "caption_reel", "reelcaption"],
    "reel_overlay_text": ["reel_overlay_text", "overlay_text", "chu_overlay", "chu_reel"],
    "reel_scheduled_time": ["reel_scheduled_time", "reel_time", "gio_reel", "gio_dang_reel"],
    "reel_status": ["reel_status", "trang_thai_reel"],
    "reel_duration": ["reel_duration", "duration", "thoi_luong_reel"],
}


def clear_proxy_env():
    if os.environ.get("ZAKLIFE_KEEP_PROXY") == "1":
        return
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        os.environ.pop(key, None)


def now_dt():
    return datetime.now(LOCAL_TZ)


def now_iso():
    return now_dt().isoformat(timespec="seconds")


def normalize_key(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def fb_url(path):
    return f"{FIREBASE_DB_URL}/{path.strip('/')}.json"


def firebase_request(method, path, data=None, timeout=45):
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(fb_url(path), data=body, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json; charset=utf-8")
    with urllib.request.urlopen(req, timeout=timeout) as res:
        text = res.read().decode("utf-8")
        return json.loads(text) if text else None


def firebase_get(path, default=None):
    data = firebase_request("GET", path)
    return default if data is None else data


def firebase_patch(path, data):
    return firebase_request("PATCH", path, data)


def firebase_delete(path):
    return firebase_request("DELETE", path)


def sheet_csv_url(sheet_id=DEFAULT_SHEET_ID, gid=DEFAULT_GID):
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"


def fetch_text(url, timeout=45):
    req = urllib.request.Request(url, headers={"User-Agent": "ZakLifeContentSheetSync/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8-sig")


def read_csv_rows(args):
    if args.input_csv:
        text = Path(args.input_csv).read_text(encoding="utf-8-sig")
    else:
        text = fetch_text(args.sheet_csv_url)
        if "<html" in text[:500].lower():
            raise RuntimeError("Google Sheet returned HTML. Share the sheet as 'Anyone with link -> Viewer' or use n8n Google Sheets credentials.")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    rows = []
    for index, raw in enumerate(reader, start=2):
        normalized = {normalize_key(k): (v or "").strip() for k, v in raw.items()}
        normalized["_row_number"] = index
        rows.append(normalized)
    return rows


def get_field(row, name):
    for alias in FIELD_ALIASES.get(name, [name]):
        value = row.get(normalize_key(alias))
        if value:
            return value.strip()
    return ""


def normalize_status(value):
    return normalize_key(value)


def parse_date(value):
    value = str(value or "").strip()
    if not value:
        raise ValueError("scheduled_date is required")
    patterns = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%m/%d/%Y"]
    for pattern in patterns:
        try:
            return datetime.strptime(value, pattern).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"Invalid scheduled_date: {value}")


def parse_time(value):
    value = str(value or "").strip()
    if not value:
        return "09:00"
    try:
        numeric = float(value)
        if 0 <= numeric < 1:
            minutes = round(numeric * 24 * 60)
            return f"{minutes // 60:02d}:{minutes % 60:02d}"
    except ValueError:
        pass
    patterns = ["%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M:%S %p"]
    for pattern in patterns:
        try:
            return datetime.strptime(value.upper(), pattern).strftime("%H:%M")
        except ValueError:
            pass
    match = re.match(r"^(\d{1,2})h(\d{0,2})$", value.lower())
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2) or 0)
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return f"{hour:02d}:{minute:02d}"
    raise ValueError(f"Invalid scheduled_time: {value}")


def parse_bool(value):
    text = normalize_key(value)
    return text in {"1", "true", "yes", "y", "on", "ready", "reel", "tao", "tao_reel", "co"}


def parse_datetime(value):
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=LOCAL_TZ)
        return dt.astimezone(LOCAL_TZ)
    except ValueError:
        return None


def extract_drive_file_id(url):
    raw = str(url or "").strip()
    patterns = [
        r"drive\.google\.com/file/d/([^/]+)",
        r"drive\.google\.com/open\?id=([^&]+)",
        r"drive\.google\.com/uc\?[^#]*id=([^&]+)",
        r"[?&]id=([^&]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, raw, re.IGNORECASE)
        if match:
            return urllib.parse.unquote(match.group(1))
    return ""


def drive_thumb(file_id):
    if not file_id:
        return ""
    return f"https://drive.google.com/thumbnail?id={urllib.parse.quote(file_id)}&sz=w1000"


def safe_id(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9_-]+", "-", text)
    text = text.strip("-_")
    return text[:90] or "post"


def row_hash(row):
    parts = [
        get_field(row, "title"),
        get_field(row, "caption"),
        get_field(row, "image_url"),
        get_field(row, "scheduled_date"),
        get_field(row, "scheduled_time"),
    ]
    digest = hashlib.sha1("\n".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"sheet-{digest}"


def row_source_key(args, row, post_id):
    row_key = get_field(row, "id") or post_id or row_hash(row)
    return f"google-sheet:{args.sheet_id}:{args.gid}:{row_key}"


def existing_keys(existing):
    ids = set()
    source_keys = set()
    for key, post in (existing or {}).items():
        if not isinstance(post, dict):
            continue
        ids.add(str(post.get("id") or key))
        source_key = post.get("sourceKey") or post.get("sheetSourceKey")
        source_obj = post.get("source") if isinstance(post.get("source"), dict) else {}
        source_key = source_key or source_obj.get("key") or source_obj.get("sourceKey")
        if source_key:
            source_keys.add(str(source_key))
    return ids, source_keys


def build_post(args, row):
    title = get_field(row, "title")
    caption = get_field(row, "caption")
    if not title and not caption:
        raise ValueError("title or caption is required")
    scheduled_date = parse_date(get_field(row, "scheduled_date"))
    scheduled_time = parse_time(get_field(row, "scheduled_time"))
    image_url = get_field(row, "image_url")
    drive_file_id = extract_drive_file_id(image_url)
    thumb_url = get_field(row, "thumb_url") or drive_thumb(drive_file_id)
    raw_id = get_field(row, "zaklife_id") or get_field(row, "id") or row_hash(row)
    post_id = safe_id(raw_id)
    source_key = row_source_key(args, row, post_id)
    media_provider = "google_drive" if drive_file_id else ("external_url" if image_url else "")
    media_status = "external_url" if image_url else "empty"
    music_url = get_field(row, "music_url")
    reel_caption = get_field(row, "reel_caption")
    reel_overlay_text = get_field(row, "reel_overlay_text")
    reel_scheduled_time_raw = get_field(row, "reel_scheduled_time")
    reel_scheduled_time = parse_time(reel_scheduled_time_raw) if reel_scheduled_time_raw else "19:15"
    reel_status = normalize_key(get_field(row, "reel_status")) or "ready"
    reel_enabled = (
        parse_bool(get_field(row, "reel_enabled"))
        or bool(music_url or reel_caption or reel_overlay_text)
    ) and reel_status != "disabled"
    try:
        reel_duration = int(float(get_field(row, "reel_duration") or 14))
    except ValueError:
        reel_duration = 14
    now = now_iso()
    return {
        "id": post_id,
        "title": title or caption[:48],
        "caption": caption,
        "message": caption,
        "photoUrl": image_url,
        "photo_path": image_url,
        "image_url": image_url,
        "thumbUrl": thumb_url,
        "driveFileId": drive_file_id,
        "mediaProvider": media_provider,
        "mediaStatus": media_status,
        "deleteOriginalAfterPost": True,
        "scheduledDate": scheduled_date,
        "scheduledTime": scheduled_time,
        "scheduled_at": f"{scheduled_date}T{scheduled_time}:00+07:00",
        "timezone": "Asia/Ho_Chi_Minh",
        "status": args.target_status,
        "platform": get_field(row, "platform") or "facebook",
        "content_type": get_field(row, "content_type") or "post",
        "reelEnabled": reel_enabled,
        "musicUrl": music_url,
        "music_url": music_url,
        "reelCaption": reel_caption,
        "reel_caption": reel_caption,
        "reelOverlayText": reel_overlay_text,
        "reel_overlay_text": reel_overlay_text,
        "reelScheduledTime": reel_scheduled_time,
        "reelStatus": reel_status if reel_enabled else "disabled",
        "reelDuration": reel_duration,
        "sourceNotes": get_field(row, "notes"),
        "sourceStatus": get_field(row, "status"),
        "sourceKey": source_key,
        "source": {
            "type": "google_sheet",
            "sheetId": args.sheet_id,
            "gid": args.gid,
            "rowNumber": row.get("_row_number"),
            "key": source_key,
            "importedAt": now,
        },
        "created_at": now,
        "updated_at": now,
    }


def should_import(args, row):
    status = normalize_status(get_field(row, "status"))
    return status in args.import_statuses


def cleanup_candidates(existing, days):
    threshold = now_dt() - timedelta(days=days)
    out = []
    for key, post in (existing or {}).items():
        if not isinstance(post, dict) or post.get("status") != "posted":
            continue
        marker = post.get("posted_at") or post.get("postedAt") or post.get("updated_at") or post.get("scheduled_at")
        dt = parse_datetime(marker)
        if dt and dt < threshold:
            out.append((key, post.get("id") or key, marker))
    return out


def automation_patch(payload, dry_run=False, offline=False):
    if dry_run or offline:
        return
    base = {
        "name": "ZakLife Content Sheet Sync",
        "description": "Google Sheet Content tab -> ZakLife Content Calendar drafts",
        "stale_after_minutes": 45,
        "updated_at": now_iso(),
    }
    firebase_patch(FIREBASE_AUTOMATION_PATH, {**base, **payload})


def process(args):
    rows = read_csv_rows(args)
    existing = {} if args.offline else firebase_get(FIREBASE_CALENDAR_PATH, {})
    existing = existing if isinstance(existing, dict) else {}
    existing_ids, existing_source_keys = existing_keys(existing)
    result = {
        "status": "ok",
        "rows": len(rows),
        "imported": 0,
        "dry_run": args.dry_run,
        "target_status": args.target_status,
        "skipped_status": 0,
        "skipped_existing": 0,
        "deleted_old_posted": 0,
        "errors": [],
        "posts": [],
    }
    automation_patch({"status": "checking", "last_check_at": now_iso(), "last_result": "checking"}, args.dry_run, args.offline)

    for row in rows:
        if not should_import(args, row):
            result["skipped_status"] += 1
            continue
        try:
            post = build_post(args, row)
            if post["id"] in existing_ids or post["sourceKey"] in existing_source_keys:
                result["skipped_existing"] += 1
                continue
            result["posts"].append({"id": post["id"], "title": post["title"], "scheduled_at": post["scheduled_at"]})
            if not args.dry_run:
                firebase_patch(f"{FIREBASE_CALENDAR_PATH}/{post['id']}", post)
            result["imported"] += 1
            existing_ids.add(post["id"])
            existing_source_keys.add(post["sourceKey"])
        except Exception as exc:
            result["errors"].append({"row": row.get("_row_number"), "error": str(exc)})

    cleanup = cleanup_candidates(existing, args.delete_posted_after_days)
    for key, post_id, marker in cleanup:
        if not args.dry_run:
            firebase_delete(f"{FIREBASE_CALENDAR_PATH}/{key}")
        result["deleted_old_posted"] += 1

    status = "error" if result["errors"] else "ok"
    result["status"] = status
    automation_patch({
        "status": status,
        "last_check_at": now_iso(),
        "last_result": "synced",
        "rows": result["rows"],
        "imported": result["imported"],
        "skipped_status": result["skipped_status"],
        "skipped_existing": result["skipped_existing"],
        "deleted_old_posted": result["deleted_old_posted"],
        "last_error": result["errors"][0]["error"] if result["errors"] else None,
    }, args.dry_run, args.offline)
    return result


def parse_args():
    parser = argparse.ArgumentParser(description="Import Google Sheet Content rows into ZakLife Content Calendar.")
    parser.add_argument("--sheet-id", default=DEFAULT_SHEET_ID)
    parser.add_argument("--gid", default=DEFAULT_GID)
    parser.add_argument("--sheet-csv-url")
    parser.add_argument("--input-csv", help="Read CSV from a local file instead of Google Sheets.")
    parser.add_argument("--target-status", default="draft", choices=["draft", "scheduled", "approved"])
    parser.add_argument("--import-status", action="append", dest="import_statuses", help="Sheet status to import. Can be repeated.")
    parser.add_argument("--delete-posted-after-days", type=int, default=7)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--offline", action="store_true", help="Do not read/write Firebase. Useful with --dry-run and --input-csv.")
    args = parser.parse_args()
    args.import_statuses = {normalize_status(v) for v in (args.import_statuses or DEFAULT_IMPORT_STATUSES)}
    args.sheet_csv_url = args.sheet_csv_url or sheet_csv_url(args.sheet_id, args.gid)
    return args


def main():
    clear_proxy_env()
    args = parse_args()
    try:
        result = process(args)
        print(json.dumps(result, ensure_ascii=False))
        if result.get("errors"):
            sys.exit(2)
    except Exception as exc:
        if not getattr(args, "dry_run", False) and not getattr(args, "offline", False):
            try:
                automation_patch({
                    "status": "error",
                    "last_check_at": now_iso(),
                    "last_result": "failed",
                    "last_error": str(exc),
                })
            except Exception:
                pass
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
