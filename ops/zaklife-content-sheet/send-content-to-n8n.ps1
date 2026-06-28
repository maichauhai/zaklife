param(
    [string]$Json,
    [string]$File,
    [string]$Webhook = "http://127.0.0.1:5678/webhook/zaklife-content-intake",
    [switch]$Test
)

$ErrorActionPreference = "Stop"

if ($Test) {
    $Webhook = "http://127.0.0.1:5678/webhook-test/zaklife-content-intake"
}

if ($File) {
    if (!(Test-Path -LiteralPath $File)) {
        throw "JSON file not found: $File"
    }
    $Body = Get-Content -Raw -Encoding UTF8 -LiteralPath $File
} elseif ($Json) {
    $Body = $Json
} else {
    $Body = [Console]::In.ReadToEnd()
}

if (!$Body.Trim()) {
    throw "Missing JSON body. Pass -Json, -File, or pipe JSON into this script."
}

$parsed = $Body | ConvertFrom-Json
$normalized = $parsed | ConvertTo-Json -Depth 20 -Compress

$response = Invoke-WebRequest `
    -Uri $Webhook `
    -Method POST `
    -ContentType "application/json; charset=utf-8" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($normalized)) `
    -UseBasicParsing `
    -TimeoutSec 60

Write-Host $response.Content
