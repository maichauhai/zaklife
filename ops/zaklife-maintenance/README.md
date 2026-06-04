# ZakLife Maintenance

Local maintenance scripts for the production workflow.

## Scripts

- `scripts/backup_firebase.py`: backs up selected Firebase RTDB paths to local JSON.
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
