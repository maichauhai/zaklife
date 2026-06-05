#!/usr/bin/env python3
import argparse
import hashlib
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
    "zaklife/meta",
    "zaklife/data",
    "zaklife/data_backups",
    "zaklife/journal/entries",
    "zaklife/habits/definitions",
    "zaklife/habits/logs",
    "zaklife/calendar/notes",
    "zaklife/ideas/items",
    "zaklife/ideas/meta",
    "zaklife/content-calendar",
    "zaklife/tasks",
    "zaklife/quickdock",
    "zaklife/agents",
    "zaklife/automation",
    "zaklife/nana_messages",
    "zaklife/wallet/balances/current",
    "zaklife/vault_encrypted",
]
AUTOMATION_PATH = "zaklife/automation/firebaseBackup"
REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACT_PATH = REPO_ROOT / "docs" / "schema" / "zaklife-contract.json"


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


def canonical_json(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(data):
    return hashlib.sha256(canonical_json(data).encode("utf-8")).hexdigest()


def load_contract_paths():
    try:
        contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    except Exception:
        return DEFAULT_PATHS, None
    paths = contract.get("backupPaths") or DEFAULT_PATHS
    return paths, contract.get("version")


def validate_snapshot(snapshot):
    if not isinstance(snapshot, dict):
        raise ValueError("Backup snapshot must be a JSON object")
    meta = snapshot.get("meta")
    data = snapshot.get("data")
    checksums = snapshot.get("checksums")
    if not isinstance(meta, dict) or not isinstance(data, dict) or not isinstance(checksums, dict):
        raise ValueError("Backup snapshot must contain meta, data, and checksums")
    for path in meta.get("paths", []):
        expected = checksums.get(path)
        actual = sha256_json(data.get(path))
        if expected != actual:
            raise ValueError(f"Checksum mismatch for {path}")
    return True


def read_backup_file(path):
    snapshot = json.loads(Path(path).read_text(encoding="utf-8"))
    validate_snapshot(snapshot)
    return {
        "status": "ok",
        "file": str(path),
        "created_at": snapshot.get("meta", {}).get("created_at"),
        "path_count": len(snapshot.get("meta", {}).get("paths", [])),
        "bytes": Path(path).stat().st_size,
    }


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


def run_backup(paths, backup_dir, keep_days=14, dry_run=False, contract_version=None):
    snapshot = {
        "meta": {
            "created_at": now_iso(),
            "source": FIREBASE_DB_URL,
            "paths": paths,
            "schema_contract_version": contract_version,
            "format": "zaklife-rtdb-backup-v2",
        },
        "data": {},
        "checksums": {},
    }
    for path in paths:
        value = firebase_get(path)
        snapshot["data"][path] = value
        snapshot["checksums"][path] = sha256_json(value)

    encoded = json.dumps(snapshot, ensure_ascii=False, indent=2).encode("utf-8")
    validate_snapshot(snapshot)
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
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_bytes(encoded)
    read_backup_file(tmp)
    tmp.replace(target)
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
    parser.add_argument("--verify-file", help="Verify an existing backup file and exit.")
    args = parser.parse_args()
    if args.verify_file:
        print(json.dumps(read_backup_file(args.verify_file), ensure_ascii=False))
        return
    contract_paths, contract_version = load_contract_paths()
    paths = args.paths or contract_paths
    print(json.dumps(run_backup(paths, Path(args.backup_dir), args.keep_days, args.dry_run, contract_version), ensure_ascii=False))


if __name__ == "__main__":
    main()
