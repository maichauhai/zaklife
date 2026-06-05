$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $Root "logs"
$RelayScript = Join-Path $Root "scripts\content_sheet_relay_server.py"
$RelayOutLog = Join-Path $LogDir "content-sheet-relay.out.log"
$RelayErrLog = Join-Path $LogDir "content-sheet-relay.err.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-LocalUrl {
    param([string]$Url)
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (Test-LocalUrl "http://127.0.0.1:8788/health") {
    Write-Host "ZakLife Content Sheet relay already running at http://127.0.0.1:8788"
    exit 0
}

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (!$python) {
    throw "python command not found"
}

Start-Process -FilePath $python `
    -ArgumentList @($RelayScript) `
    -WorkingDirectory (Join-Path $Root "scripts") `
    -RedirectStandardOutput $RelayOutLog `
    -RedirectStandardError $RelayErrLog `
    -WindowStyle Hidden

Start-Sleep -Seconds 2
if (!(Test-LocalUrl "http://127.0.0.1:8788/health")) {
    throw "ZakLife Content Sheet relay did not start. Check logs in $LogDir"
}

Write-Host "ZakLife Content Sheet relay started at http://127.0.0.1:8788"
