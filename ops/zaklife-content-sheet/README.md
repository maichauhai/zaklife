# ZakLife Content Sheet Sync

Pull content drafts from Google Sheet and import them into ZakLife Content Calendar.

Default sheet:

```text
https://docs.google.com/spreadsheets/d/1A1-QfM_hk-5_uGiZLrVu2c7ZcJetdqqCH-lfan430bU/edit?gid=453629334
```

## Required Google Sheet headers

Use a tab named `Content` and keep these headers on row 1:

```csv
id,title,caption,image_url,thumb_url,scheduled_date,scheduled_time,status,platform,content_type,notes
```

Minimum useful row:

```csv
monstea-2026-06-07-01,Combo chien cuoi tuan,"Caption o day",https://drive.google.com/file/d/FILE_ID/view,2026-06-07,17:45,ready,facebook,post,""
```

## Status rule

- The content agent writes rows to Google Sheet.
- Rows with `status=ready` are imported into ZakLife as `draft`.
- Anh reviews and edits directly in ZakLife.
- n8n does not overwrite a post that was already imported.
- To import again, use a new `id` or delete the old post in ZakLife first.

## Cleanup rule

Every sync deletes ZakLife posts with:

```text
status = posted
posted_at older than 7 days
```

If `posted_at` is missing, the script falls back to `updated_at` or `scheduled_at`.

## Google Sheet sharing

For the no-credential mode, set the Sheet sharing to:

```text
Anyone with the link -> Viewer
```

If the Sheet is private, use a Google Sheets credential inside n8n instead of this public CSV script.

## Manual test

```powershell
python .\ops\zaklife-content-sheet\scripts\sync_content_sheet.py --dry-run
```

Offline sample test:

```powershell
python .\ops\zaklife-content-sheet\scripts\sync_content_sheet.py --input-csv C:\path\to\sample.csv --dry-run --offline
```

## n8n

Start local relay:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\zaklife-content-sheet\start-content-sheet-relay.ps1
```

Import:

```powershell
n8n import:workflow --input .\ops\zaklife-content-sheet\zaklife-content-sheet-sync.workflow.json
```

Or run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\zaklife-content-sheet\import-workflow.ps1
```

Then open n8n, check the workflow, and activate it.

## Content agent intake

The relay also accepts content JSON and appends it to the Google Sheet with the
local service account:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8788/append?dry_run=1" -Method POST -ContentType "application/json" -Body '{"id":"test","title":"Test","caption":"Draft","scheduled_date":"2026-06-07","scheduled_time":"17:45","status":"ready"}'
```

Import `zaklife-content-intake.workflow.json` to expose an n8n webhook that
forwards agent JSON to this relay.

Codex Content agents can send approved JSON to n8n with:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\zaklife-content-sheet\send-content-to-n8n.ps1 -Json '{"id":"monstea-2026-06-07-1745-01","title":"Combo chiều nay","caption":"Caption bài đăng...","image_url":"","thumb_url":"","scheduled_date":"2026-06-07","scheduled_time":"17:45","status":"ready","platform":"facebook","content_type":"post","notes":"Cần ảnh món phù hợp"}'
```

While testing the webhook in n8n, add `-Test` to send to `/webhook-test/...`.
