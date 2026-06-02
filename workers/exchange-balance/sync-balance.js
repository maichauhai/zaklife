const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

loadEnv(path.join(__dirname, ".env"));

const cfg = {
  firebaseUrl: env("FIREBASE_DATABASE_URL"),
  firebaseAuth: env("FIREBASE_AUTH"),
  walletPath: env("WALLET_PATH", "zaklife/wallet/balances/current"),
  usdtVndRate: Number(env("USDT_VND_RATE", "0")) || 0,
  intervalSeconds: Math.max(60, Number(env("SYNC_INTERVAL_SECONDS", "300")) || 300),
  binance: {
    enabled: boolEnv("ENABLE_BINANCE", true),
    apiKey: env("BINANCE_API_KEY"),
    apiSecret: env("BINANCE_API_SECRET"),
    baseUrl: trimSlash(env("BINANCE_BASE_URL", "https://api.binance.com"))
  },
  okx: {
    enabled: boolEnv("ENABLE_OKX", false),
    apiKey: env("OKX_API_KEY"),
    apiSecret: env("OKX_API_SECRET"),
    passphrase: env("OKX_API_PASSPHRASE"),
    baseUrl: trimSlash(env("OKX_BASE_URL", "https://www.okx.com"))
  }
};

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function hmacHex(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function hmacBase64(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64");
}

function positiveAsset(asset, free, locked) {
  const freeNum = Number(free) || 0;
  const lockedNum = Number(locked) || 0;
  const total = freeNum + lockedNum;
  if (total <= 0) return null;
  return { asset, free: freeNum, locked: lockedNum, total };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    const detail = json?.msg || json?.message || json?.code || text.slice(0, 160);
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  return json;
}

async function fetchBinanceBalance() {
  const { apiKey, apiSecret, baseUrl } = cfg.binance;
  if (!apiKey || !apiSecret) throw new Error("Missing BINANCE_API_KEY or BINANCE_API_SECRET");
  const query = `timestamp=${Date.now()}&recvWindow=5000`;
  const signature = hmacHex(apiSecret, query);
  const json = await fetchJson(`${baseUrl}/api/v3/account?${query}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey }
  });
  const assets = (json.balances || [])
    .map(row => positiveAsset(row.asset, row.free, row.locked))
    .filter(Boolean)
    .sort((a, b) => b.total - a.total);
  const usdt = assets.find(row => row.asset === "USDT")?.total || 0;
  return {
    status: "ok",
    usdt,
    totalUsdt: usdt,
    assets,
    updatedAt: new Date().toISOString()
  };
}

async function fetchOkxBalance() {
  const { apiKey, apiSecret, passphrase, baseUrl } = cfg.okx;
  if (!apiKey || !apiSecret || !passphrase) throw new Error("Missing OKX_API_KEY, OKX_API_SECRET or OKX_API_PASSPHRASE");
  const requestPath = "/api/v5/account/balance";
  const timestamp = new Date().toISOString();
  const sign = hmacBase64(apiSecret, `${timestamp}GET${requestPath}`);
  const json = await fetchJson(`${baseUrl}${requestPath}`, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase
    }
  });
  if (json.code && json.code !== "0") throw new Error(`${json.code}: ${json.msg || "OKX error"}`);
  const details = json.data?.[0]?.details || [];
  const assets = details
    .map(row => positiveAsset(row.ccy, row.availBal ?? row.cashBal, Math.max((Number(row.eq) || 0) - (Number(row.availBal ?? row.cashBal) || 0), 0)))
    .filter(Boolean)
    .sort((a, b) => b.total - a.total);
  const usdt = assets.find(row => row.asset === "USDT")?.total || 0;
  return {
    status: "ok",
    usdt,
    totalUsdt: usdt,
    assets,
    updatedAt: new Date().toISOString()
  };
}

async function writeFirebase(snapshot) {
  if (!cfg.firebaseUrl) throw new Error("Missing FIREBASE_DATABASE_URL");
  const dbPath = cfg.walletPath.replace(/^\/+|\/+$/g, "");
  const auth = cfg.firebaseAuth ? `?auth=${encodeURIComponent(cfg.firebaseAuth)}` : "";
  await fetchJson(`${trimSlash(cfg.firebaseUrl)}/${dbPath}.json${auth}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot)
  });
}

async function syncOnce() {
  const exchanges = {};
  const errors = [];

  if (cfg.binance.enabled) {
    try {
      exchanges.binance = await fetchBinanceBalance();
    } catch (error) {
      exchanges.binance = { status: "error", usdt: 0, totalUsdt: 0, assets: [], updatedAt: new Date().toISOString() };
      errors.push({ exchange: "binance", message: error.message });
    }
  }

  if (cfg.okx.enabled) {
    try {
      exchanges.okx = await fetchOkxBalance();
    } catch (error) {
      exchanges.okx = { status: "error", usdt: 0, totalUsdt: 0, assets: [], updatedAt: new Date().toISOString() };
      errors.push({ exchange: "okx", message: error.message });
    }
  }

  const totalUsdt = Object.values(exchanges).reduce((sum, row) => sum + (Number(row.totalUsdt) || 0), 0);
  const snapshot = {
    updatedAt: new Date().toISOString(),
    source: "vps-exchange-balance-worker",
    totalUsdt,
    totalVnd: cfg.usdtVndRate ? Math.round(totalUsdt * cfg.usdtVndRate) : 0,
    quote: { usdtVndRate: cfg.usdtVndRate, source: cfg.usdtVndRate ? "env" : "unset" },
    exchanges,
    errors
  };

  await writeFirebase(snapshot);
  console.log(`[${snapshot.updatedAt}] synced ${totalUsdt.toFixed(4)} USDT (${errors.length} errors)`);
  if (errors.length) console.log(JSON.stringify(errors, null, 2));
}

async function main() {
  await syncOnce();
  if (!process.argv.includes("--loop")) return;
  setInterval(() => syncOnce().catch(error => console.error(`[sync-error] ${error.message}`)), cfg.intervalSeconds * 1000);
}

main().catch(error => {
  console.error(`[fatal] ${error.message}`);
  process.exit(1);
});
