#!/usr/bin/env python3
import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
import textwrap
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MONSTEA_ROOT = ROOT.parent
LOG_PATH = ROOT / "logs" / "reel-log.jsonl"
CREDENTIAL_PATH = MONSTEA_ROOT / "credentials" / "facebook.json"
FIREBASE_DB_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
FIREBASE_CALENDAR_PATH = "zaklife/content-calendar"
FIREBASE_LOG_PATH = "zaklife/content-log"
FIREBASE_AUTOMATION_PATH = "zaklife/automation/monsteaReels"
LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
MAX_LATE_MINUTES = int(os.environ.get("MONSTEA_REEL_MAX_LATE_MINUTES", "240"))
LOCK_PATH = ROOT / "logs" / "post_reels.lock"
LOCK_STALE_SECONDS = 20 * 60


def now_iso():
    return datetime.now(LOCAL_TZ).isoformat(timespec="seconds")


def load_json(path, default):
    if not path.exists():
        return default
    text = path.read_text(encoding="utf-8").strip()
    return json.loads(text) if text else default


def fb_url(path):
    return f"{FIREBASE_DB_URL}/{path.strip('/')}.json"


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


def automation_patch(data):
    payload = {
        "name": "Monstea Facebook Reel Scheduler",
        "description": "Posted content-calendar photos + Drive music -> Facebook Reels",
        "stale_after_minutes": 30,
        "max_late_minutes": MAX_LATE_MINUTES,
        "updated_at": now_iso(),
        **data,
    }
    try:
        firebase_patch(FIREBASE_AUTOMATION_PATH, payload)
    except Exception:
        pass


def parse_dt(value):
    if not value:
        return None
    value = str(value).strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=LOCAL_TZ)
    return dt.astimezone(LOCAL_TZ)


def reel_dt(post):
    date = post.get("reelScheduledDate") or post.get("scheduledDate") or post.get("date")
    time = post.get("reelScheduledTime") or post.get("reel_time") or "19:15"
    return parse_dt(f"{date}T{time}:00+07:00") if date else None


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


def extract_drive_file_id(url):
    raw = str(url or "").strip()
    patterns = [
        r"drive\.google\.com/file/d/([^/]+)",
        r"drive\.google\.com/open\?id=([^&]+)",
        r"drive\.google\.com/uc\?[^#]*id=([^&]+)",
        r"[?&]id=([^&]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, raw, re.I)
        if match:
            return urllib.parse.unquote(match.group(1))
    return ""


def direct_drive_url(url):
    file_id = extract_drive_file_id(url)
    return f"https://drive.google.com/uc?export=download&id={file_id}" if file_id else url


def download_media(url, suffix):
    if not url:
        raise ValueError("Missing media URL")
    media_url = direct_drive_url(url)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.close()
    try:
        req = urllib.request.Request(media_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as res:
            data = res.read()
            if data.lstrip().lower().startswith((b"<!doctype html", b"<html")):
                raise ValueError("Media URL returned an HTML page instead of a file")
            Path(tmp.name).write_bytes(data)
    except Exception:
        os.unlink(tmp.name)
        raise
    return Path(tmp.name)


def api_base(creds):
    version = creds.get("api_version") or "v21.0"
    return f"https://graph.facebook.com/{version}"


def post_form(url, fields):
    data = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read().decode("utf-8"))


def upload_reel_binary(upload_url, token, video_path):
    data = video_path.read_bytes()
    req = urllib.request.Request(upload_url, data=data, method="POST")
    req.add_header("Authorization", f"OAuth {token}")
    req.add_header("offset", "0")
    req.add_header("file_size", str(len(data)))
    req.add_header("Content-Type", "application/octet-stream")
    with urllib.request.urlopen(req, timeout=300) as res:
        text = res.read().decode("utf-8")
        return json.loads(text) if text else {}


def clean_overlay_text(value):
    value = re.sub(r"[^\w\sÀ-ỹà-ỹ?!.:,/-]", "", str(value or ""), flags=re.UNICODE)
    value = re.sub(r"\s+", " ", value).strip(" -•\t\r\n")
    return value[:72]


def default_overlay_text(post):
    explicit = post.get("reelOverlayText") or post.get("reel_overlay_text")
    if explicit:
        return clean_overlay_text(explicit)
    caption = post.get("caption") or post.get("message") or ""
    for line in str(caption).replace("\r\n", "\n").split("\n"):
        text = clean_overlay_text(line)
        if text:
            return text
    return ""


def wrapped_overlay_text(value):
    text = clean_overlay_text(value)
    if not text:
        return ""
    return "\n".join(textwrap.wrap(text, width=18, max_lines=3, placeholder="..."))


def render_reel_video(image_path, audio_path, duration=14, overlay_text=""):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to render Reel video")
    out = Path(tempfile.NamedTemporaryFile(delete=False, suffix=".mp4").name)
    duration = max(8, min(20, int(duration or 14)))
    overlay_file = None
    vf_parts = [
        "scale=1188:2112:force_original_aspect_ratio=increase",
        "crop=1080:1920:x='(iw-1080)/2+((iw-1080)/2)*0.18*sin(t*0.7)':y='(ih-1920)/2+((ih-1920)/2)*0.16*cos(t*0.5)'",
        "fade=t=in:st=0:d=0.35",
        f"fade=t=out:st={max(0, duration - 0.35):.2f}:d=0.35",
    ]
    overlay = wrapped_overlay_text(overlay_text)
    if overlay:
        overlay_file = Path(tempfile.NamedTemporaryFile(delete=False, suffix=".txt").name)
        overlay_file.write_text(overlay, encoding="utf-8")
        vf_parts.append(
            "drawtext="
            "fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
            f"textfile={overlay_file.as_posix()}:"
            "fontcolor=white:fontsize=62:line_spacing=8:"
            "box=1:boxcolor=black@0.46:boxborderw=24:"
            "x=58:y=150"
        )
    vf_parts.append("format=yuv420p")
    vf = ",".join(vf_parts)
    cmd = [
        ffmpeg,
        "-y",
        "-nostdin",
        "-loop",
        "1",
        "-i",
        str(image_path),
        "-i",
        str(audio_path),
        "-t",
        str(duration),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(out),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if overlay_file:
        try:
            overlay_file.unlink()
        except OSError:
            pass
    if result.returncode != 0:
        try:
            out.unlink()
        except OSError:
            pass
        raise RuntimeError((result.stderr or "ffmpeg render failed")[-800:])
    return out


def publish_reel(creds, post):
    page_id = creds["page_id"]
    token = creds["page_access_token"]
    base = api_base(creds)
    image_ref = (post.get("image_url") or post.get("photoUrl") or post.get("photo_url") or post.get("photo_path") or post.get("thumbUrl") or "").strip()
    music_ref = (post.get("musicUrl") or post.get("music_url") or post.get("audio_url") or "").strip()
    if not image_ref:
        raise ValueError("Missing image URL for Reel")
    if not music_ref:
        raise ValueError("Missing musicUrl for Reel")

    image_path = audio_path = video_path = None
    try:
        image_path = download_media(image_ref, ".jpg")
        audio_path = download_media(music_ref, ".mp3")
        video_path = render_reel_video(
            image_path,
            audio_path,
            int(post.get("reelDuration") or post.get("reel_duration") or 14),
            default_overlay_text(post),
        )
        start = post_form(
            f"{base}/{page_id}/video_reels",
            {"access_token": token, "upload_phase": "start"},
        )
        video_id = start.get("video_id")
        upload_url = start.get("upload_url")
        if not video_id or not upload_url:
            raise RuntimeError(f"Facebook did not return reel upload session: {start}")
        upload_reel_binary(upload_url, token, video_path)
        finish = post_form(
            f"{base}/{page_id}/video_reels",
            {
                "access_token": token,
                "upload_phase": "finish",
                "video_id": video_id,
                "video_state": "PUBLISHED",
                "description": post.get("reelCaption") or post.get("reel_caption") or post.get("caption") or post.get("message") or "",
            },
        )
        return {"video_id": video_id, "finish": finish}
    finally:
        for path in (image_path, audio_path, video_path):
            if path:
                try:
                    Path(path).unlink()
                except OSError:
                    pass


def load_calendar(source):
    data = firebase_get(FIREBASE_CALENDAR_PATH, {}) if source == "firebase" else {}
    if isinstance(data, dict):
        return list(data.values())
    return data if isinstance(data, list) else []


def update_post(post_id, patch):
    firebase_patch(f"{FIREBASE_CALENDAR_PATH}/{post_id}", patch)


def is_due_reel(post, now):
    if post.get("status") != "posted":
        return False
    if not (post.get("reelEnabled") or post.get("musicUrl") or post.get("music_url")):
        return False
    if str(post.get("reelStatus") or "ready").lower() in ("posted", "disabled"):
        return False
    scheduled = reel_dt(post)
    if not scheduled:
        return False
    return scheduled <= now


def is_too_late(post, now):
    scheduled = reel_dt(post)
    return bool(scheduled and MAX_LATE_MINUTES >= 0 and now - scheduled > timedelta(minutes=MAX_LATE_MINUTES))


def process(source="firebase", dry_run=False, post_id=None):
    lock_fd = acquire_lock()
    if lock_fd is None:
        log_event({"level": "info", "event": "reel_due_locked", "source": source})
        return {"posted": 0, "locked": True, "message": "Another reel run is active", "source": source}
    try:
        automation_patch({"status": "checking", "last_check_at": now_iso(), "last_result": "checking", "dry_run": dry_run})
        creds = load_json(CREDENTIAL_PATH, {})
        if not creds.get("page_access_token") or not creds.get("page_id"):
            raise RuntimeError(f"Missing page_access_token/page_id in {CREDENTIAL_PATH}")
        now = datetime.now(LOCAL_TZ)
        items = load_calendar(source)
        due_items = [p for p in items if (p.get("id") == post_id if post_id else is_due_reel(p, now))]
        if not due_items:
            automation_patch({"status": "ok", "last_check_at": now_iso(), "last_result": "no_due", "posted": 0, "failed": 0, "last_error": None})
            log_event({"level": "info", "event": "no_due_reels", "source": source})
            return {"posted": 0, "message": "No due reels", "source": source}

        posted = failed = skipped_late = 0
        for post in due_items:
            pid = post.get("id")
            if not pid:
                continue
            if not post_id and is_too_late(post, now):
                skipped_late += 1
                if not dry_run:
                    update_post(pid, {"reelStatus": "missed", "reelLastError": f"Missed Reel window by more than {MAX_LATE_MINUTES} minutes", "reelMissedAt": now_iso()})
                continue
            if dry_run:
                posted += 1
                log_event({"level": "info", "event": "reel_dry_run", "post_id": pid})
                continue
            update_post(pid, {"reelStatus": "posting", "reelLastAttemptAt": now_iso()})
            try:
                result = publish_reel(creds, post)
                update_post(pid, {"reelStatus": "posted", "facebook_reel_id": result.get("video_id"), "reelPostedAt": now_iso(), "reelLastError": None})
                posted += 1
                log_event({"level": "info", "event": "reel_posted", "post_id": pid, "facebook_reel_id": result.get("video_id")})
            except Exception as exc:
                failed += 1
                update_post(pid, {"reelStatus": "failed", "reelLastError": str(exc), "reelFailedAt": now_iso()})
                log_event({"level": "error", "event": "reel_failed", "post_id": pid, "error": str(exc)})
        automation_patch({
            "status": "error" if failed else "ok",
            "last_check_at": now_iso(),
            "last_result": "processed",
            "posted": posted,
            "failed": failed,
            "skipped_late": skipped_late,
            "last_error": f"{failed} reel(s) failed" if failed else None,
        })
        return {"posted": posted, "failed": failed, "skipped_late": skipped_late, "dry_run": dry_run, "source": source}
    except Exception as exc:
        automation_patch({"status": "error", "last_check_at": now_iso(), "last_result": "run_failed", "last_error": str(exc)})
        raise
    finally:
        release_lock(lock_fd)


def main():
    parser = argparse.ArgumentParser(description="Post due Monstea Facebook Reels.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--post-id")
    parser.add_argument("--source", choices=["firebase"], default="firebase")
    args = parser.parse_args()
    print(json.dumps(process(source=args.source, dry_run=args.dry_run, post_id=args.post_id), ensure_ascii=False))


if __name__ == "__main__":
    main()
