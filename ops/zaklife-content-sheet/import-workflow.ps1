$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$workflow = Join-Path $root "zaklife-content-sheet-sync.workflow.json"
$intakeWorkflow = Join-Path $root "zaklife-content-intake.workflow.json"

if (!(Test-Path -LiteralPath $workflow)) {
  throw "Workflow file not found: $workflow"
}
if (!(Test-Path -LiteralPath $intakeWorkflow)) {
  throw "Workflow file not found: $intakeWorkflow"
}

Write-Host "Importing ZakLife Content Sheet workflow into n8n..."
n8n import:workflow --input $workflow
Write-Host "Importing ZakLife Content Agent Intake workflow into n8n..."
n8n import:workflow --input $intakeWorkflow
Write-Host "Done. Run start-content-sheet-relay.ps1, then open n8n at http://127.0.0.1:5678, test and publish both ZakLife content workflows."
