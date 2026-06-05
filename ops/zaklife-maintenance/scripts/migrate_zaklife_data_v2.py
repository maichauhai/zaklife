#!/usr/bin/env python3
import argparse
import json
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

FIREBASE_DB_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

LEGACY_PATH = "zaklife/data"
META_PATH = "zaklife/meta"
JOURNAL_ENTRIES_PATH = "zaklife/journal/entries"
HABIT_DEFINITIONS_PATH = "zaklife/habits/definitions"
HABIT_LOGS_PATH = "zaklife/habits/logs"
CALENDAR_NOTES_PATH = "zaklife/calendar/notes"
IDEA_ITEMS_PATH = "zaklife/ideas/items"
IDEA_META_PATH = "zaklife/ideas/meta"

MODULE_PATHS = [
    META_PATH,
    JOURNAL_ENTRIES_PATH,
    HABIT_DEFINITIONS_PATH,
    HABIT_LOGS_PATH,
    CALENDAR_NOTES_PATH,
    IDEA_ITEMS_PATH,
    IDEA_META_PATH,
]


def now_iso():
    return datetime.now(LOCAL_TZ).isoformat(timespec="seconds")


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


def firebase_get(path, default=None):
    data = firebase_request("GET", path)
    return default if data is None else data


def firebase_patch(path, data):
    return firebase_request("PATCH", path, data, timeout=45)


def normalize_map(value):
    return value if isinstance(value, dict) else {}


def iter_collection(value):
    if isinstance(value, list):
        for index, item in enumerate(value):
            yield str(index), item
        return
    if not isinstance(value, dict):
        return
    items = value.get("items")
    if isinstance(items, list):
        for index, item in enumerate(items):
            yield str(index), item
        return
    if isinstance(items, dict):
        for key, item in items.items():
            yield str(key), item
        return
    for key, item in value.items():
        yield str(key), item


def to_positive_int(value, fallback=1):
    try:
        return max(1, int(float(value)))
    except (TypeError, ValueError):
        return fallback


def normalize_habit(habit, fallback_id=None):
    if not isinstance(habit, dict):
        return None
    habit_id = str(habit.get("id") or fallback_id or "").strip()
    if not habit_id:
        return None
    cycle_days = habit.get("cycleDays", habit.get("cycle", 1))
    cycle_days = to_positive_int(cycle_days)
    return {
        "id": habit_id,
        "icon": habit.get("icon") or "",
        "name": str(habit.get("name") or "").strip(),
        "cycleDays": cycle_days,
        "updatedAt": habit.get("updatedAt") or now_iso(),
        "schemaVersion": 2,
    }


def normalize_habit_definitions(value):
    out = {}
    for key, habit in iter_collection(value):
        item = normalize_habit(habit, key)
        if item:
            out[item["id"]] = item
    return out


def normalize_ideas(value):
    out = {}
    for key, idea in iter_collection(value):
        if not isinstance(idea, dict):
            continue
        idea_id = str(idea.get("id") or key or "").strip()
        if not idea_id:
            continue
        item = dict(idea)
        item["id"] = idea_id
        item["schemaVersion"] = 2
        out[idea_id] = item
    return out


def convert_legacy_data(legacy):
    legacy = normalize_map(legacy)
    migration_id = "zaklife-data-v2-" + datetime.now(LOCAL_TZ).strftime("%Y%m%d-%H%M%S")
    idea_items = normalize_ideas(legacy.get("ideas"))
    habit_definitions = normalize_habit_definitions(legacy.get("habits"))
    ideas_meta = normalize_map(legacy.get("ideas"))
    next_idea_id = to_positive_int(legacy.get("nextIdeaId", ideas_meta.get("nextIdeaId", ideas_meta.get("nextId"))))
    idea_id_candidates = [int(k) + 1 for k in idea_items.keys() if str(k).isdigit()]
    if idea_id_candidates:
        next_idea_id = max(next_idea_id, *idea_id_candidates)
    patch = {
        META_PATH: {
            "schemaVersion": 2,
            "migrationId": migration_id,
            "migratedAt": now_iso(),
            "legacyPath": LEGACY_PATH,
            "legacyPreserved": True,
        },
        JOURNAL_ENTRIES_PATH: normalize_map(legacy.get("entries", legacy.get("journal"))),
        HABIT_DEFINITIONS_PATH: habit_definitions,
        HABIT_LOGS_PATH: normalize_map(legacy.get("habitLog")),
        CALENDAR_NOTES_PATH: normalize_map(legacy.get("calNotes", legacy.get("calendarNotes"))),
        IDEA_ITEMS_PATH: idea_items,
        IDEA_META_PATH: {
            "nextIdeaId": next_idea_id,
            "schemaVersion": 2,
            "updatedAt": now_iso(),
        },
    }
    return patch


def summarize_patch(patch):
    return {
        "schemaVersion": patch[META_PATH]["schemaVersion"],
        "migrationId": patch[META_PATH]["migrationId"],
        "journalEntries": len(patch[JOURNAL_ENTRIES_PATH]),
        "habitDefinitions": len(patch[HABIT_DEFINITIONS_PATH]),
        "habitLogDays": len(patch[HABIT_LOGS_PATH]),
        "calendarNotes": len(patch[CALENDAR_NOTES_PATH]),
        "ideas": len(patch[IDEA_ITEMS_PATH]),
        "nextIdeaId": patch[IDEA_META_PATH]["nextIdeaId"],
        "targetPaths": MODULE_PATHS,
    }


def load_legacy_from_backup(path):
    snapshot = json.loads(Path(path).read_text(encoding="utf-8"))
    data = snapshot.get("data", snapshot)
    return data.get(LEGACY_PATH) or {}


def load_legacy(args):
    if args.from_backup:
        return load_legacy_from_backup(args.from_backup)
    return firebase_get(LEGACY_PATH, {})


def write_plan(path, patch):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"summary": summarize_patch(patch), "patch": patch}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def apply_patch_to_firebase(patch, force=False):
    meta = firebase_get(META_PATH, {}) or {}
    current_version = int(meta.get("schemaVersion") or 0)
    if current_version >= 2 and not force:
        raise RuntimeError("Remote schemaVersion is already >= 2. Use --force to re-apply.")
    for path in MODULE_PATHS:
        firebase_patch(path, patch[path])


def main():
    parser = argparse.ArgumentParser(description="Dry-run or apply ZakLife data schema v2 migration.")
    parser.add_argument("--from-backup", help="Read legacy zaklife/data from a backup JSON instead of live Firebase.")
    parser.add_argument("--write-plan", help="Write generated migration plan JSON.")
    parser.add_argument("--apply", action="store_true", help="Apply module-path patches to live Firebase.")
    parser.add_argument("--yes", action="store_true", help="Required with --apply.")
    parser.add_argument("--force", action="store_true", help="Allow re-applying when schemaVersion is already >= 2.")
    args = parser.parse_args()

    legacy = load_legacy(args)
    patch = convert_legacy_data(legacy)
    summary = summarize_patch(patch)
    if args.write_plan:
        write_plan(args.write_plan, patch)
        summary["planFile"] = args.write_plan
    if args.apply:
        if not args.yes:
            raise SystemExit("--apply requires --yes")
        apply_patch_to_firebase(patch, force=args.force)
        summary["applied"] = True
    else:
        summary["applied"] = False
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
