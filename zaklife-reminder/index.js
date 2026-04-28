/**
 * ZakLife Reminder Bot (Node.js) — Runs on Nana VPS
 * Reads Firebase, sends Discord reminders, writes Nana messages
 * 
 * Usage: node zaklife-reminder.js <check_type>
 * Types: sleep, journal, gratitude, habits, weekly, cleanup, test
 * 
 * Crontab (VPS timezone = UTC+7):
 *   0 16 * * * node ~/zaklife-reminder/index.js sleep      # 23h VN
 *   0 15 * * * node ~/zaklife-reminder/index.js journal     # 22h VN
 *   30 16 * * * node ~/zaklife-reminder/index.js gratitude  # 23h30 VN
 *   0 13 * * * node ~/zaklife-reminder/index.js habits      # 20h VN
 *   0 14 * * 0 node ~/zaklife-reminder/index.js weekly      # CN 21h VN
 *   0 0 * * * node ~/zaklife-reminder/index.js cleanup
 */

const https = require('https');
const http = require('http');

// ═══ CONFIG ═══
const FIREBASE_URL = 'monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const CHANNEL_ID = '1488859753420689560';

// ═══ HELPERS ═══
function todayStr() {
  const d = new Date();
  d.setHours(d.getHours() + 7); // UTC+7
  return d.toISOString().slice(0, 10);
}

function fbGet(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://${FIREBASE_URL}/zaklife/${path}.json`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

function fbSet(path, value) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(value);
    const req = https.request({
      hostname: FIREBASE_URL, path: `/zaklife/${path}.json`,
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendDiscord(message) {
  if (!DISCORD_BOT_TOKEN) { console.log(`[DRY RUN] ${message}`); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ content: message });
    const req = https.request({
      hostname: 'discord.com', path: `/api/v10/channels/${CHANNEL_ID}/messages`,
      method: 'POST', headers: {
        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { console.log(`Discord: ${res.statusCode}`); resolve(); }); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function nanaMsg(text, type = 'reminder') {
  const key = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  await fbSet(`nana_messages/${key}`, {
    text, type, timestamp: new Date(Date.now() + 7 * 3600000).toISOString()
  });
  console.log(`Nana msg: ${text}`);
}

// ═══ CHECKS ═══
async function checkSleep() {
  const data = await fbGet('data');
  const entry = data?.entries?.[todayStr()];
  if (!entry || !entry.sleep) {
    const msg = '😴 Anh ơi, ghi lại giấc ngủ đêm qua đi nha! Ngủ ngon không?';
    await sendDiscord(`⏰ **ZakLife Reminder**\n${msg}`);
    await nanaMsg(msg);
  } else { console.log(`Sleep logged: ${entry.sleep}/10`); }
}

async function checkJournal() {
  const data = await fbGet('data');
  const entry = data?.entries?.[todayStr()];
  if (!entry || !entry.text) {
    const msg = '📝 Anh chưa ghi nhật ký tâm lý hôm nay. Dù chỉ vài dòng cũng được nha!';
    await sendDiscord(`⏰ **ZakLife Reminder**\n${msg}`);
    await nanaMsg(msg);
  } else { console.log(`Journal logged: ${entry.text.length} chars`); }
}

async function checkGratitude() {
  const data = await fbGet('data');
  const entry = data?.entries?.[todayStr()];
  if (!entry || !entry.gratitude || entry.gratitude.length === 0) {
    const msg = '🙏 Anh ơi, 3 điều biết ơn hôm nay là gì nè? Biết ơn giúp tâm trạng tốt hơn đó!';
    await sendDiscord(`⏰ **ZakLife Reminder**\n${msg}`);
    await nanaMsg(msg);
  } else { console.log(`Gratitude: ${entry.gratitude.length} items`); }
}

async function checkHabits() {
  const data = await fbGet('data');
  if (!data) return;
  const habitLog = data.habitLog || {};
  const habits = data.habits || [];
  const today = todayStr();
  const d = new Date(); d.setHours(d.getHours() + 7);
  const yesterday = new Date(d - 86400000).toISOString().slice(0, 10);
  
  const reminders = [], praises = [];
  
  for (const h of habits) {
    const hid = String(h.id);
    if (h.cycle) {
      // Cycle-based (laundry)
      const logs = Object.keys(habitLog).filter(d => habitLog[d]?.[hid] || habitLog[d]?.[h.id]).sort().reverse();
      if (logs.length) {
        const daysSince = Math.floor((Date.now() + 7*3600000 - new Date(logs[0]).getTime()) / 86400000);
        if (daysSince >= h.cycle) reminders.push(`${h.icon} ${h.name} — đã ${daysSince} ngày rồi (chu kỳ ${h.cycle} ngày)`);
      } else {
        reminders.push(`${h.icon} ${h.name} — chưa check lần nào, nên làm đi anh!`);
      }
    } else {
      // Daily-ish (fish, plants = 2 days)
      const todayDone = habitLog[today]?.[hid] || habitLog[today]?.[h.id];
      const yestDone = habitLog[yesterday]?.[hid] || habitLog[yesterday]?.[h.id];
      if (todayDone) { praises.push(`${h.icon} ${h.name}`); }
      else if (!yestDone) { reminders.push(`${h.icon} ${h.name} — 2 ngày chưa làm rồi nha!`); }
    }
  }
  
  if (reminders.length) {
    await sendDiscord(`⏰ **ZakLife Habit Check**\n${reminders.join('\n')}`);
    await nanaMsg(`Nana nhắc anh:\n${reminders.join('\n')}`, 'reminder');
  }
  if (praises.length) {
    await nanaMsg(`Tốt lắm! Hôm nay anh đã: ${praises.join(', ')} 🎉`, 'praise');
  }
  if (!reminders.length && !praises.length) console.log('No habit reminders needed');
}

async function weeklyAnalysis() {
  const data = await fbGet('data');
  if (!data?.entries) return;
  const moods = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() + 7*3600000 - i * 86400000).toISOString().slice(0, 10);
    if (data.entries[d]?.mood) moods.push(data.entries[d].mood);
  }
  if (moods.length < 3) return;
  const avg = (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1);
  const feel = avg >= 7 ? 'rất tốt 😊' : avg >= 5 ? 'ổn 🙂' : avg >= 3 ? 'hơi thấp 😔' : 'đáng lo 😢';
  const msg = `📊 Tuần qua mood trung bình ${avg}/10 (${feel}), ghi nhật ký ${moods.length}/7 ngày. ${avg >= 5 ? 'Giữ vững nha anh! 💪' : 'Anh có muốn chia sẻ gì không? Nana luôn ở đây 💜'}`;
  await sendDiscord(`📊 **Phân tích tuần qua:**\nMood: **${avg}/10** (${feel})\nNhật ký: **${moods.length}/7** ngày`);
  await nanaMsg(msg, 'analysis');
}

async function cleanup() {
  const msgs = await fbGet('nana_messages');
  if (!msgs) return;
  const keys = Object.keys(msgs).sort();
  if (keys.length <= 10) return;
  for (const key of keys.slice(0, -10)) await fbSet(`nana_messages/${key}`, null);
  console.log(`Cleaned ${keys.length - 10} old messages`);
}

async function test() {
  await nanaMsg('Xin chào anh! 🌟 Nana đã kết nối thành công với ZakLife từ VPS. Từ nay Nana sẽ nhắc anh ghi nhật ký, cho cá ăn và tưới cây nhé! 💜', 'chat');
  await sendDiscord('✅ **ZakLife Reminder Bot** đã kết nối từ VPS! Nana sẽ nhắc anh mỗi ngày 💜');
}

// ═══ MAIN ═══
const check = process.argv[2];
if (!check) { console.log('Usage: node index.js <sleep|journal|gratitude|habits|weekly|cleanup|test>'); process.exit(1); }

console.log(`[${new Date().toISOString()}] Running: ${check}`);
const fn = { sleep: checkSleep, journal: checkJournal, gratitude: checkGratitude, habits: checkHabits, weekly: weeklyAnalysis, cleanup, test };
if (fn[check]) fn[check]().then(() => console.log('Done')).catch(e => console.error(e));
else console.log(`Unknown check: ${check}`);
