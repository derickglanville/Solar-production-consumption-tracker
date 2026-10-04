$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python -ErrorAction Stop).Source
$logDirectory = Join-Path $env:LOCALAPPDATA 'SolarEnergyTracker'
$logPath = Join-Path $logDirectory 'nyseg-daily-sync.log'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

"[$(Get-Date -Format s)] Starting NYSEG daily sync" | Add-Content -Path $logPath
& $python (Join-Path $PSScriptRoot 'run_nyseg_daily_sync.py') *>> $logPath
if ($LASTEXITCODE -ne 0) {
    "[$(Get-Date -Format s)] NYSEG daily sync failed with exit code $LASTEXITCODE" | Add-Content -Path $logPath
    exit $LASTEXITCODE
}
"[$(Get-Date -Format s)] NYSEG daily sync completed" | Add-Content -Path $logPath
