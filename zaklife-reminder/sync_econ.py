#!/usr/bin/env python3
"""
ZakLife Economic Calendar Sync
Fetch USD HIGH impact events from FairEconomy (ForexFactory mirror)
→ Convert to VN timezone → Write to Firebase

Cron: Chạy mỗi Chủ nhật 8h sáng VN
0 1 * * 0 cd /home/nana/zaklife-econ && python3 sync_econ.py
"""

import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

# Firebase REST API (no SDK needed)
FIREBASE_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
FIREBASE_PATH = "/zaklife/econ_events.json"

# Timezone
VN_TZ = timezone(timedelta(hours=7))

# API endpoints - fetch this week + next week
URLS = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
]


def fetch_events():
    """Fetch from FairEconomy API, filter USD + HIGH impact"""
    all_events = []
    for url in URLS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ZakLife/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                all_events.extend(data)
        except Exception as e:
            print(f"[WARN] Failed to fetch {url}: {e}")

    # Filter: USD only + High impact only
    filtered = [
        e for e in all_events
        if e.get("country") == "USD" and e.get("impact") == "High"
    ]

    print(f"[INFO] Fetched {len(all_events)} total, {len(filtered)} USD HIGH impact")
    return filtered


def convert_to_vn(events):
    """Convert events to VN timezone, group by date"""
    result = {}

    for e in events:
        try:
            # Parse ISO datetime (e.g. "2026-04-29T14:00:00-04:00")
            dt = datetime.fromisoformat(e["date"])
            dt_vn = dt.astimezone(VN_TZ)

            date_key = dt_vn.strftime("%Y-%m-%d")
            time_vn = dt_vn.strftime("%H:%M")
            title = e["title"]
            forecast = e.get("forecast", "")
            previous = e.get("previous", "")

            # Pick emoji based on event type
            icon = "📊"
            title_lower = title.lower()
            if "federal funds" in title_lower or "fomc" in title_lower:
                icon = "🏦"
            elif "nonfarm" in title_lower or "non-farm" in title_lower:
                icon = "📊"
            elif "cpi" in title_lower:
                icon = "📈"
            elif "pce" in title_lower:
                icon = "💰"
            elif "gdp" in title_lower:
                icon = "🏛️"

            entry = {
                "title": title,
                "icon": icon,
                "time": time_vn,
                "forecast": forecast,
                "previous": previous,
            }

            if date_key not in result:
                result[date_key] = []
            result[date_key].append(entry)

        except Exception as ex:
            print(f"[WARN] Skip event: {e.get('title', '?')} — {ex}")

    return result


def push_to_firebase(events):
    """Merge events into Firebase (PATCH = merge, not overwrite)"""
    url = FIREBASE_URL + FIREBASE_PATH
    payload = json.dumps(events).encode("utf-8")

    req = urllib.request.Request(url, data=payload, method="PATCH")
    req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"[OK] Firebase updated: {len(events)} dates, status {resp.status}")
    except Exception as e:
        print(f"[ERROR] Firebase push failed: {e}")


def main():
    print(f"[START] {datetime.now(VN_TZ).isoformat()}")

    events = fetch_events()
    if not events:
        print("[WARN] No USD HIGH events found")
        return

    vn_events = convert_to_vn(events)

    # Log
    for date, evts in sorted(vn_events.items()):
        for e in evts:
            print(f"  {date} {e['time']} {e['icon']} {e['title']}")

    push_to_firebase(vn_events)
    print(f"[DONE] {datetime.now(VN_TZ).isoformat()}")


if __name__ == "__main__":
    main()
