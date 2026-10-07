$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python -ErrorAction Stop).Source
$logDirectory = Join-Path $projectRoot 'SunRun Data'
$logPath = Join-Path $logDirectory 'nyseg-daily-sync.log'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

"[$(Get-Date -Format s)] Starting NYSEG Manual Run — NYSEG_File_Download_Test.py only" | Add-Content -Path $logPath -Encoding utf8
& $python (Join-Path $PSScriptRoot 'run_nyseg_daily_sync.py') --download-only --download-no-arguments --download-script (Join-Path $PSScriptRoot 'NYSEG_File_Download_Test.py') --log-path $logPath
if ($LASTEXITCODE -ne 0) {
    "[$(Get-Date -Format s)] NYSEG Manual Run failed with exit code $LASTEXITCODE" | Add-Content -Path $logPath -Encoding utf8
    exit $LASTEXITCODE
}
"[$(Get-Date -Format s)] NYSEG Manual Run completed; only NYSEG_File_Download_Test.py was run" | Add-Content -Path $logPath -Encoding utf8
