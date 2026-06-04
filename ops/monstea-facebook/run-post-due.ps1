$ErrorActionPreference = "Continue"

$N8nRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $N8nRoot "logs"
$PostLog = Join-Path $LogDir "windows-post-due.log"
$Script = Join-Path $N8nRoot "scripts\post_due_facebook.py"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -LiteralPath $PostLog -Value "[$time] Running due-post check"

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) {
    Add-Content -LiteralPath $PostLog -Value "[$time] python command not found"
    exit 1
}

$output = & $python $Script --source firebase 2>&1
$exitCode = $LASTEXITCODE
foreach ($line in $output) {
    Add-Content -LiteralPath $PostLog -Encoding UTF8 -Value $line
}
exit $exitCode
