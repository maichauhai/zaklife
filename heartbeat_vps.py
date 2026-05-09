#!/usr/bin/env python3
"""
Nana + Long Nhi Heartbeat → Firebase zaklife/agents/{name}
Checks if OpenClaw/bots are running, pushes heartbeat.

Deploy to VPS: scp -P 38900 heartbeat_vps.py nana@e1.chiasegpu.vn:/home/nana/
Cron (nana):    */5 * * * * python3 /home/nana/heartbeat_vps.py 2>/dev/null
Cron (Zak):     */5 * * * * python3 /home/Zak/heartbeat_vps.py 2>/dev/null
"""

import json
import urllib.request
import subprocess
import os
import socket
from datetime import datetime, timedelta, timezone

FIREBASE_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
VN_TZ = timezone(timedelta(hours=7))

def check_process(pattern):
    """Check if a process matching pattern is running"""
    try:
        result = subprocess.run(
            ["pgrep", "-f", pattern],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except:
        return False

def get_uptime():
    """Get system uptime"""
    try:
        with open("/proc/uptime", "r") as f:
            seconds = float(f.read().split()[0])
            days = int(seconds // 86400)
            hours = int((seconds % 86400) // 3600)
            if days > 0:
                return f"{days}d"
            return f"{hours}h"
    except:
        return "?"

def get_current_user():
    return os.environ.get("USER", os.environ.get("LOGNAME", "unknown"))

def push_heartbeat(agent_name, status, last_task=None):
    now = datetime.now(VN_TZ)
    payload = {
        "lastSeen": now.strftime("%Y-%m-%dT%H:%M:%S"),
        "status": status,
        "details": {
            "uptime": get_uptime(),
        }
    }
    if last_task:
        payload["lastTask"] = last_task

    url = f"{FIREBASE_URL}/zaklife/agents/{agent_name}.json"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PATCH")
    req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"[{agent_name}] ♥ {now.strftime('%H:%M:%S')} — {status} — {last_task or 'idle'}")
    except Exception as e:
        print(f"[{agent_name}] ✗ Heartbeat failed: {e}")

def main():
    user = get_current_user()

    if user == "nana":
        # Nana: check OpenClaw gateway
        openclaw_running = check_process("openclaw-gateway")
        status = "online" if openclaw_running else "offline"
        
        # Try to detect last task from OpenClaw logs
        last_task = None
        try:
            result = subprocess.run(
                ["journalctl", "--user", "-u", "openclaw-gateway", "-n", "20", "--no-pager", "-q"],
                capture_output=True, text=True, timeout=5
            )
            for line in reversed(result.stdout.splitlines()):
                if "task" in line.lower() or "completed" in line.lower() or "response" in line.lower():
                    # Extract meaningful part
                    last_task = line.strip()[-80:]
                    break
        except:
            pass

        push_heartbeat("nana", status, last_task)

    elif user == "Zak":
        # Long Nhi: check bots
        bots_status = {
            "bang-chien-bot": check_process("bang-chien-bot/index.js"),
            "roster-bot": check_process("roster-bot/index.js"),
            "voice-bot": check_process("voice-bot/index.js"),
        }
        
        running = [k for k, v in bots_status.items() if v]
        total_bots = len(bots_status)
        online_bots = len(running)
        
        if online_bots == total_bots:
            status = "online"
        elif online_bots > 0:
            status = "online"  # partial
        else:
            status = "offline"

        last_task = f"{online_bots}/{total_bots} bots running"
        if running:
            last_task += f" ({', '.join(running)})"

        push_heartbeat("longnhi", status, last_task)

    else:
        print(f"[?] Unknown user: {user}. Expected 'nana' or 'Zak'")

if __name__ == "__main__":
    main()
