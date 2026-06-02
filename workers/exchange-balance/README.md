# ZakLife Exchange Balance Worker

Worker này chạy trên VPS, gọi API read-only của Binance/OKX và ghi snapshot vào Firebase:

`zaklife/wallet/balances/current`

ZakLife frontend chỉ đọc path này. Không đặt API key trong browser, Firebase public config, Vault, hoặc file JS frontend.

## Việc cần làm trước

1. Revoke mọi API key đã từng bị dán vào chat/log.
2. Tạo API key mới với quyền read-only.
3. Tắt quyền trade và withdraw.
4. Bật IP whitelist theo IP VPS nếu sàn hỗ trợ.
5. Với OKX cần đủ 3 phần: API key, API secret, passphrase.

## Cài trên VPS

```bash
cd /path/to/zaklife/workers/exchange-balance
cp .env.example .env
nano .env
node sync-balance.js
```

Chạy vòng lặp mỗi 5 phút:

```bash
node sync-balance.js --loop
```

Hoặc dùng cron:

```bash
*/5 * * * * cd /path/to/zaklife/workers/exchange-balance && node sync-balance.js >> balance.log 2>&1
```

## Field quan trọng trong `.env`

```bash
FIREBASE_DATABASE_URL=https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app
WALLET_PATH=zaklife/wallet/balances/current

ENABLE_BINANCE=true
BINANCE_API_KEY=...
BINANCE_API_SECRET=...

ENABLE_OKX=false
OKX_API_KEY=...
OKX_API_SECRET=...
OKX_API_PASSPHRASE=...

USDT_VND_RATE=25000
SYNC_INTERVAL_SECONDS=300
```

Nếu Firebase rules yêu cầu token, đặt thêm `FIREBASE_AUTH`.

## Ghi chú thuế

Dữ liệu balance chỉ hỗ trợ đối soát. Để làm báo cáo thuế nghiêm túc thường cần thêm lịch sử nạp/rút, giao dịch, chuyển đổi, phí và sao kê chính thức từ sàn.
