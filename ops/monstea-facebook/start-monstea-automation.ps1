$ErrorActionPreference = "Continue"

$N8nRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $N8nRoot
$LogDir = Join-Path $N8nRoot "logs"
$StartupLog = Join-Path $LogDir "automation-startup.log"
$N8nOutLog = Join-Path $LogDir "n8n-autostart.out.log"
$N8nErrLog = Join-Path $LogDir "n8n-autostart.err.log"
$RelayOutLog = Join-Path $LogDir "relay-autostart.out.log"
$RelayErrLog = Join-Path $LogDir "relay-autostart.err.log"
$RelayScript = Join-Path $N8nRoot "scripts\post_relay_server.py"
$N8nCmd = Join-Path $env:APPDATA "npm\n8n.cmd"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-AutomationLog {
    param([string]$Message)
    $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $StartupLog -Value "[$time] $Message"
}

function Test-LocalUrl {
    param([string]$Url)
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-AutomationLog "Checking Monstea automation services"

if (Test-LocalUrl "http://127.0.0.1:5678/") {
    Write-AutomationLog "n8n already running"
} elseif (Test-Path -LiteralPath $N8nCmd) {
    Write-AutomationLog "Starting n8n"
    $command = "`$env:N8N_SECURE_COOKIE='false'; & '$N8nCmd' start >> '$N8nOutLog' 2>> '$N8nErrLog'"
    Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) -WorkingDirectory $ProjectRoot -WindowStyle Hidden
} else {
    Write-AutomationLog "n8n command not found at $N8nCmd"
}

if (Test-LocalUrl "http://127.0.0.1:8787/health") {
    Write-AutomationLog "Facebook relay already running"
} elseif (Test-Path -LiteralPath $RelayScript) {
    Write-AutomationLog "Starting Facebook relay"
    $python = (Get-Command python -ErrorAction SilentlyContinue).Source
    if ($python) {
        Start-Process -FilePath $python -ArgumentList @($RelayScript) -WorkingDirectory (Join-Path $N8nRoot "scripts") -RedirectStandardOutput $RelayOutLog -RedirectStandardError $RelayErrLog -WindowStyle Hidden
    } else {
        Write-AutomationLog "python command not found"
    }
} else {
    Write-AutomationLog "Relay script not found at $RelayScript"
}

Start-Sleep -Seconds 3
$n8nOk = Test-LocalUrl "http://127.0.0.1:5678/"
$relayOk = Test-LocalUrl "http://127.0.0.1:8787/health"
Write-AutomationLog "Result n8n=$n8nOk relay=$relayOk"

