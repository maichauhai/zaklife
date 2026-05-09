#!/usr/bin/env python3
"""
Kyoko Heartbeat → Firebase zaklife/agents/kyoko
Pushes: lastSeen, status, lastTask, uptime
Run every 5 min via Windows Task Scheduler or cron.

Usage: python heartbeat.py
"""

import json
import urllib.request
import os
import time
from datetime import datetime, timedelta, timezone

FIREBASE_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
AGENT_PATH = "/zaklife/agents/kyoko.json"
VN_TZ = timezone(timedelta(hours=7))

def get_uptime():
    """Get Windows uptime"""
    try:
        import ctypes
        lib = ctypes.windll.kernel32
        tick = lib.GetTickCount64()
        hours = tick // (1000 * 60 * 60)
        if hours >= 24:
            return f"{hours // 24}d {hours % 24}h"
        return f"{hours}h"
    except:
        return "?"

def get_last_task():
    """Read last task from a simple marker file (updated by Kyoko after each task)"""
    marker = os.path.join(os.path.dirname(__file__), ".last_task")
    try:
        if os.path.exists(marker):
            with open(marker, "r", encoding="utf-8") as f:
                return f.read().strip()
    except:
        pass
    return "Idle"

def push_heartbeat():
    now = datetime.now(VN_TZ)
    payload = {
        "lastSeen": now.strftime("%Y-%m-%dT%H:%M:%S"),
        "status": "online",
        "details": {
            "uptime": get_uptime(),
        }
    }

    # Read last task if available
    last_task = get_last_task()
    if last_task != "Idle":
        payload["lastTask"] = last_task

    url = FIREBASE_URL + AGENT_PATH
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PATCH")
    req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"[Kyoko] OK {now.strftime('%H:%M:%S')} - {last_task} (uptime: {payload['details']['uptime']})")
    except Exception as e:
        print(f"[Kyoko] FAIL Heartbeat failed: {e}")

if __name__ == "__main__":
    push_heartbeat()
