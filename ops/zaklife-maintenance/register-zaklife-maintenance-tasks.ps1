$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackupScript = Join-Path $Root "scripts\backup_firebase.py"
$MonitorScript = Join-Path $Root "scripts\monitor_automation.py"
$Python = (Get-Command python).Source

if (-not (Test-Path $BackupScript)) { throw "Missing backup script: $BackupScript" }
if (-not (Test-Path $MonitorScript)) { throw "Missing monitor script: $MonitorScript" }

$TaskPath = "\ZakLife\"
$BackupTask = "ZakLife Firebase Backup"
$MonitorTask = "ZakLife Automation Monitor"

$BackupAction = New-ScheduledTaskAction -Execute $Python -Argument "`"$BackupScript`""
$BackupTrigger = New-ScheduledTaskTrigger -Daily -At 3:10am
$BackupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName $BackupTask -TaskPath $TaskPath -Action $BackupAction -Trigger $BackupTrigger -Settings $BackupSettings -Description "Backup ZakLife/Monstea Firebase data to local JSON." -Force | Out-Null

$MonitorAction = New-ScheduledTaskAction -Execute $Python -Argument "`"$MonitorScript`""
$MonitorTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$MonitorSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $MonitorTask -TaskPath $TaskPath -Action $MonitorAction -Trigger $MonitorTrigger -Settings $MonitorSettings -Description "Monitor ZakLife automation heartbeat and optional Telegram alert." -Force | Out-Null

Write-Host "Registered:"
Write-Host "- $TaskPath$BackupTask"
Write-Host "- $TaskPath$MonitorTask"
