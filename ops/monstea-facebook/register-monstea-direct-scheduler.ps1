$ErrorActionPreference = "Stop"

$N8nRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PostScript = Join-Path $N8nRoot "run-post-due.ps1"
$TaskName = "Monstea Facebook Post Due"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PostScript`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Post approved due Monstea Facebook posts directly from Windows Task Scheduler. Uses a lock and max-late guard to avoid duplicate or very late posts." -Force | Out-Null
Write-Host "Registered task: $TaskName"
