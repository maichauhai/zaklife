# Monstea Facebook Auto Post

Note: folder nay la ban source duoc dua vao GitHub de theo doi thay doi. Ban dang chay that tren may hien o:

```text
C:\Users\pc\Desktop\Monstea\n8n
```

Khi sua automation, cap nhat ca ban runtime o tren va ban source trong repo nay.

Bo nay dung n8n de chay dinh ky va dang bai len fanpage Monstea bang Facebook Graph API.

## File quan trong

- `content-calendar.json`: lich bai dang. Chi bai co `status: "approved"` va da toi gio moi duoc dang.
- `scripts/post_due_facebook.py`: script doc lich, goi Facebook API, cap nhat trang thai.
- `logs/post-log.jsonl`: log moi lan workflow chay.
- `monstea-facebook-auto-post.workflow.json`: workflow import vao n8n.
- `monstea-facebook-auto-post.no-execute-command.workflow.json`: workflow thay the cho ban n8n khong ho tro node Execute Command.
- `scripts/post_relay_server.py`: cau noi local de workflow HTTP Relay goi script dang bai.
- `start-monstea-automation.ps1`: tu bat n8n va relay khi mo may.
- `run-post-due.ps1`: chay dang cac bai da den gio ma khong can n8n.
- `../credentials/facebook.json`: credential Facebook, khong dua file nay len GitHub.

## Cach dung

1. Sua `content-calendar.json`.
2. Khi bai san sang dang, doi:

```json
"status": "approved"
```

3. Dat gio dang:

```json
"scheduled_at": "2026-05-21T18:30:00+07:00"
```

4. Neu co anh, dat:

```json
"photo_path": "C:/Users/pc/Desktop/Monstea/n8n/media/ten-anh.jpg"
```

5. Import `monstea-facebook-auto-post.workflow.json` vao n8n.
6. Bam Manual Test de chay thu. Khi on thi Active workflow.

Neu n8n bao loi `Unrecognized node type: n8n-nodes-base.executeCommand`, dung ban HTTP Relay:

1. Chay relay local:

```powershell
python "C:\Users\pc\Desktop\Monstea\n8n\scripts\post_relay_server.py"
```

2. Import workflow:

```text
C:\Users\pc\Desktop\Monstea\n8n\monstea-facebook-auto-post.no-execute-command.workflow.json
```

3. Publish va Active workflow moi.

## Tu bat khi mo may

Chay 1 lan:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\pc\Desktop\Monstea\n8n\register-monstea-startup-task.ps1"
```

Sau do moi lan dang nhap Windows, task `Monstea Automation Startup` se tu bat:

- n8n tai `http://127.0.0.1:5678`
- relay tai `http://127.0.0.1:8787`

Neu can bat thu ngay:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\pc\Desktop\Monstea\n8n\start-monstea-automation.ps1"
```

## Backup scheduler cho bai hen gio

Ngoai schedule trong n8n, co the dung Windows Task Scheduler de goi thang script moi 5 phut:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\pc\Desktop\Monstea\n8n\register-monstea-direct-scheduler.ps1"
```

Script co lock file nen neu n8n va Windows Task cung quet lich thi chi mot ben duoc dang. Script cung co gioi han `MONSTEA_MAX_LATE_MINUTES`, mac dinh 30 phut: neu may/n8n bi tat qua lau, bai qua gio se doi sang `missed` de duyet lai, khong tu dang muon.

Dat gio bai dang nen dung timezone ro rang:

```json
"scheduled_at": "2026-06-04T17:45:00+07:00"
```

## Quy tac anh/link

- Anh de dang dat vao `photo_path`, `photo_url`, hoac `image_url`.
- `link` chi dung cho link public `http://` hoac `https://`.
- Duong dan local nhu `C:/Users/.../anh.png` se bi bo qua, khong ghep vao caption.
- Neu lo dan duong dan local vao noi dung bai, script se tu cat dong do truoc khi dang.

## Test an toan

Chay lenh nay de xem co bai due khong, khong dang that:

```powershell
python "C:\Users\pc\Desktop\Monstea\n8n\scripts\post_due_facebook.py" --dry-run
```

## Nguyen tac an toan

- De mac dinh `draft`, khong auto dang.
- Chi `approved` moi dang.
- Token Facebook nam trong `credentials/facebook.json`, workflow khong chua token.
- Dang thanh cong thi doi status thanh `posted` va luu `facebook_post_id`.
- Dang loi thi giu status `approved`, ghi `last_error` de sua roi chay lai.
