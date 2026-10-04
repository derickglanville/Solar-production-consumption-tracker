$ErrorActionPreference = 'Stop'

$statusDirectory = Join-Path $env:LOCALAPPDATA 'SolarEnergyTracker'
$marker = Join-Path $statusDirectory 'nyseg-daily-sync-email-enabled'
$python = (Get-Command python -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $statusDirectory | Out-Null
New-Item -ItemType File -Force -Path $marker | Out-Null
& $python (Join-Path $PSScriptRoot 'run_nyseg_daily_sync.py') --test-email
if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
    throw 'The NYSEG test email could not be sent. Email notifications remain disabled.'
}
Write-Host 'NYSEG daily-sync email notifications are enabled and the test email was sent.'
