#!/usr/bin/env python3
import argparse
import json
import os
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

FIREBASE_DB_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
DEFAULT_PATHS = [
    "state",
    "zaklife/data",
    "zaklife/content-calendar",
    "zaklife/tasks",
    "zaklife/quickdock",
    "zaklife/automation",
    "zaklife/nana_messages",
    "zaklife/wallet/balances/current",
    "zaklife/vault_encrypted",
]
AUTOMATION_PATH = "zaklife/automation/firebaseBackup"


def now():
    return datetime.now(LOCAL_TZ)


def now_iso():
    return now().isoformat(timespec="seconds")


def fb_url(path):
    return f"{FIREBASE_DB_URL}/{path.strip('/')}.json"


def firebase_request(method, path, data=None, timeout=60):
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(fb_url(path), data=body, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json; charset=utf-8")
    with urllib.request.urlopen(req, timeout=timeout) as res:
        text = res.read().decode("utf-8")
        return json.loads(text) if text else None


def firebase_get(path):
    return firebase_request("GET", path)


def firebase_patch(path, data):
    return firebase_request("PATCH", path, data, timeout=20)


def default_backup_dir():
    configured = os.environ.get("ZAKLIFE_BACKUP_DIR")
    if configured:
        return Path(configured)
    return Path.home() / "Desktop" / "ZakBackups"


def prune_backups(folder, keep_days):
    if keep_days <= 0 or not folder.exists():
        return 0
    cutoff = now() - timedelta(days=keep_days)
    removed = 0
    for file in folder.glob("zaklife-backup-*.json"):
        try:
            stamp = datetime.fromtimestamp(file.stat().st_mtime, LOCAL_TZ)
            if stamp < cutoff:
                file.unlink()
                removed += 1
        except OSError:
            pass
    return removed


def run_backup(paths, backup_dir, keep_days=14, dry_run=False):
    snapshot = {
        "meta": {
            "created_at": now_iso(),
            "source": FIREBASE_DB_URL,
            "paths": paths,
        },
        "data": {},
    }
    for path in paths:
        snapshot["data"][path] = firebase_get(path)

    encoded = json.dumps(snapshot, ensure_ascii=False, indent=2).encode("utf-8")
    result = {
        "status": "ok",
        "created_at": snapshot["meta"]["created_at"],
        "path_count": len(paths),
        "bytes": len(encoded),
        "dry_run": dry_run,
    }
    if dry_run:
        return result

    backup_dir.mkdir(parents=True, exist_ok=True)
    filename = f"zaklife-backup-{now().strftime('%Y%m%d-%H%M%S')}.json"
    target = backup_dir / filename
    target.write_bytes(encoded)
    removed = prune_backups(backup_dir, keep_days)
    result.update({"file": str(target), "removed_old_files": removed})
    firebase_patch(AUTOMATION_PATH, {
        "name": "Firebase Backup",
        "description": "ZakLife and Monstea RTDB JSON backup",
        "status": "ok",
        "last_check_at": now_iso(),
        "last_backup_at": now_iso(),
        "last_result": "backup_written",
        "updated_at": now_iso(),
        "stale_after_minutes": 26 * 60,
        "backup_file": str(target),
        "backup_bytes": len(encoded),
        "last_error": None,
    })
    return result


def main():
    parser = argparse.ArgumentParser(description="Backup ZakLife Firebase RTDB paths to local JSON.")
    parser.add_argument("--backup-dir", default=str(default_backup_dir()))
    parser.add_argument("--keep-days", type=int, default=14)
    parser.add_argument("--path", action="append", dest="paths", help="Firebase path to include. Can be repeated.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    paths = args.paths or DEFAULT_PATHS
    print(json.dumps(run_backup(paths, Path(args.backup_dir), args.keep_days, args.dry_run), ensure_ascii=False))


if __name__ == "__main__":
    main()
