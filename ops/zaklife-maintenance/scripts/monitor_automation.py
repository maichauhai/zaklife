#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

FIREBASE_DB_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
AUTOMATION_PATH = "zaklife/automation"
CONTENT_PATH = "zaklife/content-calendar"
MONITOR_PATH = "zaklife/automation/monitor"
ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / "logs" / "monitor-state.json"


def now():
    return datetime.now(LOCAL_TZ)


def now_iso():
    return now().isoformat(timespec="seconds")


def parse_dt(value):
    if not value:
        return None
    raw = str(value).strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=LOCAL_TZ)
    return dt.astimezone(LOCAL_TZ)


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
    return firebase_request("PATCH", path, data, timeout=20)


def load_state():
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def find_problems(automation, content):
    problems = []
    for key, item in (automation or {}).items():
        if key == "monitor" or not isinstance(item, dict):
            continue
        label = item.get("name") or key
        status = str(item.get("status") or "unknown").lower()
        last_check = parse_dt(item.get("last_check_at") or item.get("updated_at"))
        stale_after = int(item.get("stale_after_minutes") or 20)
        if status == "error" or item.get("last_error"):
            problems.append(f"{label}: lỗi - {item.get('last_error') or status}")
        if not last_check:
            problems.append(f"{label}: chưa có heartbeat")
        elif now() - last_check > timedelta(minutes=stale_after):
            age = round((now() - last_check).total_seconds() / 60)
            problems.append(f"{label}: stale {age} phút")

    posts = list((content or {}).values()) if isinstance(content, dict) else (content or [])
    failed = [p for p in posts if isinstance(p, dict) and p.get("status") == "failed"]
    missed = [p for p in posts if isinstance(p, dict) and p.get("status") == "missed"]
    if failed:
        problems.append(f"Content Calendar: {len(failed)} bài failed")
    if missed:
        problems.append(f"Content Calendar: {len(missed)} bài missed")
    return problems


def telegram_send(text):
    token = os.environ.get("ZAKLIFE_TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("ZAKLIFE_TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return {"sent": False, "reason": "telegram_not_configured"}
    data = urllib.parse.urlencode({"chat_id": chat_id, "text": text, "disable_web_page_preview": "true"}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data, method="POST")
    with urllib.request.urlopen(req, timeout=20) as res:
        return {"sent": True, "response": json.loads(res.read().decode("utf-8"))}


def should_alert(problems, state, cooldown_minutes):
    if not problems:
        return False, ""
    fingerprint = hashlib.sha256("\n".join(sorted(problems)).encode("utf-8")).hexdigest()
    last_sent = parse_dt(state.get("last_sent_at"))
    if state.get("fingerprint") != fingerprint:
        return True, fingerprint
    if not last_sent or now() - last_sent > timedelta(minutes=cooldown_minutes):
        return True, fingerprint
    return False, fingerprint


def run_monitor(dry_run=False, cooldown_minutes=60):
    automation = firebase_get(AUTOMATION_PATH, {})
    content = firebase_get(CONTENT_PATH, {})
    problems = find_problems(automation, content)
    state = load_state()
    alert_due, fingerprint = should_alert(problems, state, cooldown_minutes)
    alert_result = {"sent": False, "reason": "no_problem"}
    if problems and alert_due and not dry_run:
        message = "ZakLife automation alert\n\n" + "\n".join(f"- {p}" for p in problems)
        alert_result = telegram_send(message)
        if alert_result.get("sent"):
            state.update({"fingerprint": fingerprint, "last_sent_at": now_iso()})
            save_state(state)

    status = "warning" if problems else "ok"
    payload = {
        "name": "ZakLife Automation Monitor",
        "description": "Checks automation heartbeat and content posting status",
        "status": status,
        "last_check_at": now_iso(),
        "last_result": "problems_found" if problems else "healthy",
        "updated_at": now_iso(),
        "stale_after_minutes": 30,
        "problem_count": len(problems),
        "problems": problems[:10],
        "alert": alert_result,
        "last_error": None if not problems else "; ".join(problems[:3]),
    }
    if not dry_run:
        firebase_patch(MONITOR_PATH, payload)
    return payload


def main():
    parser = argparse.ArgumentParser(description="Monitor ZakLife automation heartbeats and optional Telegram alerts.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--cooldown-minutes", type=int, default=60)
    args = parser.parse_args()
    print(json.dumps(run_monitor(args.dry_run, args.cooldown_minutes), ensure_ascii=False))


if __name__ == "__main__":
    main()
