#!/usr/bin/env python3
"""
ZakLife Reminder Bot — Runs on Nana VPS
Checks Firebase for ZakLife data and sends Discord reminders.

Schedule (crontab):
  0 23 * * * python3 /path/to/zaklife_reminder.py --check sleep
  0 22 * * * python3 /path/to/zaklife_reminder.py --check journal
  30 23 * * * python3 /path/to/zaklife_reminder.py --check gratitude
  0 20 * * * python3 /path/to/zaklife_reminder.py --check habits
"""
import json, sys, os, argparse, requests
from datetime import datetime, timedelta

# ═══ CONFIG ═══
FIREBASE_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
DISCORD_WEBHOOK = os.environ.get("ZAKLIFE_DISCORD_WEBHOOK", "")
DISCORD_BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
CHANNEL_ID = "1488859753420689560"
GUILD_ID = "881909918926532709"

def get_firebase(path):
    """Read data from Firebase"""
    r = requests.get(f"{FIREBASE_URL}/zaklife/{path}.json", timeout=10)
    return r.json() if r.status_code == 200 else None

def set_firebase(path, data):
    """Write data to Firebase"""
    r = requests.put(f"{FIREBASE_URL}/zaklife/{path}.json", json=data, timeout=10)
    return r.status_code == 200

def send_discord(message):
    """Send message to Discord channel via bot token"""
    if DISCORD_BOT_TOKEN:
        headers = {"Authorization": f"Bot {DISCORD_BOT_TOKEN}", "Content-Type": "application/json"}
        r = requests.post(
            f"https://discord.com/api/v10/channels/{CHANNEL_ID}/messages",
            headers=headers,
            json={"content": message},
            timeout=10
        )
        print(f"Discord sent: {r.status_code}")
        return r.status_code == 200
    elif DISCORD_WEBHOOK:
        r = requests.post(DISCORD_WEBHOOK, json={"content": message}, timeout=10)
        return r.status_code in [200, 204]
    else:
        print(f"[DRY RUN] {message}")
        return True

def send_nana_message(text, msg_type="reminder"):
    """Write a message to Firebase for ZakLife to display"""
    key = datetime.now().strftime("%Y%m%d%H%M%S")
    msg = {
        "text": text,
        "type": msg_type,  # reminder, praise, analysis, chat
        "timestamp": datetime.now().isoformat()
    }
    set_firebase(f"nana_messages/{key}", msg)
    print(f"Nana message saved: {text}")

def today_str():
    return datetime.now().strftime("%Y-%m-%d")

def check_sleep():
    """Check if sleep score was logged today"""
    data = get_firebase("data")
    if not data or "entries" not in data:
        return
    entry = data["entries"].get(today_str())
    if not entry or not entry.get("sleep"):
        msg = "😴 Anh ơi, ghi lại giấc ngủ đêm qua đi nha! Ngủ ngon không?"
        send_discord(f"⏰ **ZakLife Reminder**\n{msg}")
        send_nana_message(msg)
    else:
        print(f"Sleep already logged: {entry['sleep']}/10")

def check_journal():
    """Check if journal was written today"""
    data = get_firebase("data")
    if not data or "entries" not in data:
        send_discord("⏰ **ZakLife Reminder**\n📝 Anh ơi hôm nay chưa ghi nhật ký tâm lý nè! Hôm nay cảm thấy sao?")
        send_nana_message("📝 Anh chưa ghi nhật ký tâm lý hôm nay. Dù chỉ vài dòng cũng giúp anh hiểu bản thân hơn đó!", "reminder")
        return
    entry = data["entries"].get(today_str())
    if not entry or not entry.get("text"):
        msg = "📝 Anh chưa ghi nhật ký tâm lý hôm nay. Dù chỉ vài dòng cũng được nha!"
        send_discord(f"⏰ **ZakLife Reminder**\n{msg}")
        send_nana_message(msg)
    else:
        print(f"Journal already logged: {len(entry['text'])} chars")

def check_gratitude():
    """Check if gratitude was filled today"""
    data = get_firebase("data")
    if not data or "entries" not in data:
        return
    entry = data["entries"].get(today_str())
    if not entry or not entry.get("gratitude") or len(entry["gratitude"]) == 0:
        msg = "🙏 Anh ơi, 3 điều biết ơn hôm nay là gì nè? Biết ơn giúp tâm trạng tốt hơn đó!"
        send_discord(f"⏰ **ZakLife Reminder**\n{msg}")
        send_nana_message(msg)
    else:
        print(f"Gratitude logged: {len(entry['gratitude'])} items")

def check_habits():
    """Check fish feeding, plant watering (every 2 days), laundry cycles"""
    data = get_firebase("data")
    if not data:
        return
    
    habit_log = data.get("habitLog", {})
    habits = data.get("habits", [])
    today = today_str()
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    reminders = []
    praises = []
    
    for h in habits:
        hid = str(h["id"])
        cycle = h.get("cycle")
        
        if cycle:
            # Cycle-based habits (laundry)
            last_done = None
            for d in sorted(habit_log.keys(), reverse=True):
                if habit_log[d].get(hid) or habit_log[d].get(int(hid) if hid.isdigit() else hid):
                    last_done = d
                    break
            if last_done:
                days_since = (datetime.now() - datetime.strptime(last_done, "%Y-%m-%d")).days
                if days_since >= cycle:
                    reminders.append(f"{h['icon']} {h['name']} — đã {days_since} ngày rồi (chu kỳ {cycle} ngày)")
            else:
                reminders.append(f"{h['icon']} {h['name']} — chưa bao giờ check, nên làm đi anh!")
        else:
            # Daily-ish habits (fish, plants = 2 days)
            today_done = habit_log.get(today, {}).get(hid) or habit_log.get(today, {}).get(int(hid) if hid.isdigit() else hid)
            yesterday_done = habit_log.get(yesterday, {}).get(hid) or habit_log.get(yesterday, {}).get(int(hid) if hid.isdigit() else hid)
            
            if today_done:
                praises.append(f"{h['icon']} {h['name']}")
            elif not yesterday_done:
                # 2 days without doing it
                reminders.append(f"{h['icon']} {h['name']} — 2 ngày chưa làm rồi nha!")
    
    if reminders:
        msg = "⏰ **ZakLife Habit Check**\n" + "\n".join(reminders)
        send_discord(msg)
        nana_text = "Nana nhắc anh:\n" + "\n".join(reminders)
        send_nana_message(nana_text, "reminder")
    
    if praises:
        praise_msg = f"🎉 Tốt lắm! Hôm nay anh đã: {', '.join(praises)}"
        send_nana_message(praise_msg, "praise")
    
    if not reminders and not praises:
        print("No habit reminders needed")

def weekly_analysis():
    """Weekly mood analysis"""
    data = get_firebase("data")
    if not data or "entries" not in data:
        return
    
    entries = data["entries"]
    week_moods = []
    for i in range(7):
        d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        if d in entries and "mood" in entries[d]:
            week_moods.append(entries[d]["mood"])
    
    if len(week_moods) < 3:
        return
    
    avg = sum(week_moods) / len(week_moods)
    logged = len(week_moods)
    
    if avg >= 7:
        emoji, feel = "😊", "rất tốt"
    elif avg >= 5:
        emoji, feel = "🙂", "ổn"
    elif avg >= 3:
        emoji, feel = "😔", "hơi thấp"
    else:
        emoji, feel = "😢", "đáng lo"
    
    msg = f"📊 **Phân tích tuần qua:**\n{emoji} Mood trung bình: **{avg:.1f}/10** ({feel})\n📝 Đã ghi nhật ký: **{logged}/7** ngày"
    send_discord(msg)
    send_nana_message(f"Tuần qua mood trung bình {avg:.1f}/10 ({feel}), ghi nhật ký {logged}/7 ngày. {'Giữ vững nha anh! 💪' if avg >= 5 else 'Anh có muốn chia sẻ gì không? Nana luôn ở đây 💜'}", "analysis")


def cleanup_old_messages():
    """Keep only last 10 Nana messages"""
    msgs = get_firebase("nana_messages")
    if not msgs or len(msgs) <= 10:
        return
    sorted_keys = sorted(msgs.keys())
    for key in sorted_keys[:-10]:
        set_firebase(f"nana_messages/{key}", None)
    print(f"Cleaned {len(sorted_keys) - 10} old messages")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ZakLife Reminder Bot")
    parser.add_argument("--check", choices=["sleep", "journal", "gratitude", "habits", "weekly", "cleanup", "test"],
                       required=True, help="What to check")
    args = parser.parse_args()
    
    print(f"[{datetime.now().isoformat()}] Running check: {args.check}")
    
    if args.check == "sleep": check_sleep()
    elif args.check == "journal": check_journal()
    elif args.check == "gratitude": check_gratitude()
    elif args.check == "habits": check_habits()
    elif args.check == "weekly": weekly_analysis()
    elif args.check == "cleanup": cleanup_old_messages()
    elif args.check == "test":
        send_nana_message("Xin chào anh! 🌟 Nana đã kết nối thành công với ZakLife. Từ nay Nana sẽ nhắc anh ghi nhật ký, cho cá ăn và tưới cây nhé! 💜", "chat")
        send_discord("✅ **ZakLife Reminder Bot** đã kết nối thành công! Nana sẽ nhắc anh mỗi ngày 💜")
        print("Test message sent!")
