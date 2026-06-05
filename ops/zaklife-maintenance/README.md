# ZakLife Maintenance

Local maintenance scripts for the production workflow.

## Scripts

- `scripts/backup_firebase.py`: backs up selected Firebase RTDB paths to local JSON.
- `scripts/migrate_zaklife_data_v2.py`: generates or applies the non-destructive v2 module-path migration for legacy `zaklife/data`.
- `scripts/monitor_automation.py`: checks automation heartbeat and content post status, then optionally sends Telegram alerts.
- `register-zaklife-maintenance-tasks.ps1`: registers Windows Task Scheduler jobs.

## Default backup location

`C:\Users\<user>\Desktop\ZakBackups`

Override with:

```powershell
$env:ZAKLIFE_BACKUP_DIR="D:\ZakBackups"
```

## Telegram alert configuration

Set these environment variables on the machine that runs the monitor:

```powershell
$env:ZAKLIFE_TELEGRAM_BOT_TOKEN="..."
$env:ZAKLIFE_TELEGRAM_CHAT_ID="..."
```

If they are missing, the monitor still writes heartbeat data to Firebase but does not send external messages.

## Register scheduled tasks

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\zaklife-maintenance\register-zaklife-maintenance-tasks.ps1
```

Created tasks:

- `\ZakLife\ZakLife Firebase Backup`: daily at 03:10.
- `\ZakLife\ZakLife Automation Monitor`: every 15 minutes.

## Data model v2

Schema notes:

```text
docs/schema/DATA_MODEL_V2.md
docs/schema/zaklife-contract.json
```

The v2 migration splits legacy `zaklife/data` into module paths:

- `zaklife/journal/entries`
- `zaklife/habits/definitions`
- `zaklife/habits/logs`
- `zaklife/calendar/notes`
- `zaklife/ideas/items`
- `zaklife/ideas/meta`
- `zaklife/meta`

The migration is non-destructive. It does not delete `zaklife/data`.

Recommended flow:

```powershell
python .\ops\zaklife-maintenance\scripts\backup_firebase.py
python .\ops\zaklife-maintenance\scripts\backup_firebase.py --verify-file "C:\Users\<user>\Desktop\ZakBackups\zaklife-backup-YYYYMMDD-HHMMSS.json"
python .\ops\zaklife-maintenance\scripts\migrate_zaklife_data_v2.py --from-backup "C:\Users\<user>\Desktop\ZakBackups\zaklife-backup-YYYYMMDD-HHMMSS.json" --write-plan "C:\Users\<user>\Desktop\ZakBackups\migration-plan-v2.json"
```

Apply only after the plan counts look correct:

```powershell
python .\ops\zaklife-maintenance\scripts\migrate_zaklife_data_v2.py --from-backup "C:\Users\<user>\Desktop\ZakBackups\zaklife-backup-YYYYMMDD-HHMMSS.json" --apply --yes
```
