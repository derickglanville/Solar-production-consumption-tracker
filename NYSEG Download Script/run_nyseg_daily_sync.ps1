$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python -ErrorAction Stop).Source
$logDirectory = Join-Path $projectRoot 'SunRun Data'
$logPath = Join-Path $logDirectory 'nyseg-daily-sync.log'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

"[$(Get-Date -Format s)] Starting NYSEG 7:30 AM workflow" | Set-Content -Path $logPath -Encoding utf8
"Step 1/2: Running the proven NYSEG_File_Download_Test.py download" | Add-Content -Path $logPath -Encoding utf8
& $python (Join-Path $PSScriptRoot 'run_nyseg_daily_sync.py') --log-path $logPath
if ($LASTEXITCODE -ne 0) {
    "[$(Get-Date -Format s)] NYSEG 7:30 AM workflow failed with exit code $LASTEXITCODE" | Add-Content -Path $logPath -Encoding utf8
    exit $LASTEXITCODE
}
"[$(Get-Date -Format s)] NYSEG 7:30 AM workflow completed" | Add-Content -Path $logPath -Encoding utf8
