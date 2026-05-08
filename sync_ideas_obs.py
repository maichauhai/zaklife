"""
Auto Sync: ZakLife Ideas → Obsidian Inbox
Chay: python sync_ideas_obs.py
Tu dong pull ideas tu Firebase va tao file .md trong Obsidian inbox
"""
import json
import urllib.request
import os
import sys
from datetime import datetime

# ─── Config ────────────────────────────────
FIREBASE_URL = "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app"
OBSIDIAN_INBOX = r"c:\Users\pc\.gemini\antigravity\pkm\00 - Inbox"

# ─── Fetch ideas from Firebase ─────────────
def fetch_ideas():
    url = f"{FIREBASE_URL}/zaklife/data/ideas.json"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            return data if data else []
    except Exception as e:
        print(f"❌ Lỗi fetch: {e}")
        return []

def mark_synced(ideas):
    """Mark ideas as synced in Firebase"""
    url = f"{FIREBASE_URL}/zaklife/data/ideas.json"
    data = json.dumps(ideas).encode()
    req = urllib.request.Request(url, data=data, method='PUT')
    req.add_header('Content-Type', 'application/json')
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        print(f"⚠️ Không thể update sync status: {e}")

# ─── Create Obsidian note ──────────────────
def create_obs_note(idea):
    title = idea.get('title', 'Ý tưởng nhanh')
    safe_title = "".join(c if c.isalnum() or c in ' -_' else '' for c in title).strip()
    ts = datetime.fromisoformat(idea['created'].replace('Z', '+00:00'))
    filename = f"{ts.strftime('%Y%m%d_%H%M')} - {safe_title[:50]}.md"
    filepath = os.path.join(OBSIDIAN_INBOX, filename)

    if os.path.exists(filepath):
        print(f"  ⏭️ Đã tồn tại: {filename}")
        return True

    # Build markdown
    tags = idea.get('tags', [])
    links = idea.get('links', [])
    note = idea.get('note', '')
    images = idea.get('images', [])

    md = f"---\n"
    md += f"created: {ts.strftime('%Y-%m-%d %H:%M')}\n"
    md += f"source: ZakLife Ideas\n"
    md += f"type: idea\n"
    if tags:
        md += f"tags: [{', '.join(tags)}]\n"
    md += f"---\n\n"
    md += f"# 💡 {title}\n\n"
    if note:
        md += f"{note}\n\n"
    if links:
        md += "## 🔗 Links\n"
        for l in links:
            md += f"- {l}\n"
        md += "\n"
    if images:
        md += f"## 📷 Ảnh ({len(images)})\n"
        for i, img in enumerate(images):
            # Save image to Obsidian attachments
            img_dir = os.path.join(OBSIDIAN_INBOX, "_attachments")
            os.makedirs(img_dir, exist_ok=True)
            img_name = f"{safe_title[:30]}_{i+1}.jpg"
            img_path = os.path.join(img_dir, img_name)
            if img.startswith('data:'):
                import base64
                img_data = img.split(',')[1]
                with open(img_path, 'wb') as f:
                    f.write(base64.b64decode(img_data))
                md += f"![[_attachments/{img_name}]]\n"
            else:
                md += f"![image]({img})\n"
        md += "\n"

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(md)
    print(f"  ✅ Created: {filename}")
    return True

# ─── Main ──────────────────────────────────
def main():
    print("━" * 45)
    print("💡 ZakLife Ideas → Obsidian Sync")
    print("━" * 45)

    # Ensure inbox exists
    os.makedirs(OBSIDIAN_INBOX, exist_ok=True)

    ideas = fetch_ideas()
    if not ideas:
        print("📭 Không có ý tưởng nào")
        return

    # Filter unsynced
    unsynced = [i for i in ideas if not i.get('synced')]
    print(f"📥 {len(unsynced)} ý tưởng chưa sync / {len(ideas)} tổng")

    if not unsynced:
        print("✅ Tất cả đã sync!")
        return

    synced_count = 0
    for idea in unsynced:
        if create_obs_note(idea):
            idea['synced'] = True
            synced_count += 1

    # Update Firebase
    mark_synced(ideas)
    print(f"\n🎉 Đã sync {synced_count} ý tưởng vào Obsidian!")
    print(f"📁 {OBSIDIAN_INBOX}")

if __name__ == "__main__":
    main()
