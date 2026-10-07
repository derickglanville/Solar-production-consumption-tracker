$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python -ErrorAction Stop).Source
$logDirectory = Join-Path $projectRoot 'SunRun Data'
$logPath = Join-Path $logDirectory 'nyseg-download-720.log'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

"[$(Get-Date -Format s)] Starting NYSEG 7:20 AM manual-file download" | Set-Content -Path $logPath -Encoding utf8
& $python (Join-Path $PSScriptRoot 'Run_NYSEG_File_Download_Manual.py') --offscreen --channel chrome --retries 1
if ($LASTEXITCODE -ne 0) {
    "[$(Get-Date -Format s)] NYSEG 7:20 AM download failed with exit code $LASTEXITCODE" | Add-Content -Path $logPath -Encoding utf8
    exit $LASTEXITCODE
}
"[$(Get-Date -Format s)] NYSEG 7:20 AM download completed; validated import is scheduled for 7:30 AM" | Add-Content -Path $logPath -Encoding utf8
