$ErrorActionPreference = "Stop"

$N8nRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$StartupScript = Join-Path $N8nRoot "start-monstea-automation.ps1"
$TaskName = "Monstea Automation Startup"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartupScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 12)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Start n8n and Monstea Facebook relay when Windows user logs on." -Force | Out-Null
Write-Host "Registered task: $TaskName"

