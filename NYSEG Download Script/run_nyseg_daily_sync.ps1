$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python -ErrorAction Stop).Source
$logDirectory = Join-Path $projectRoot 'SunRun Data'
$logPath = Join-Path $logDirectory 'nyseg-daily-sync.log'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

"[$(Get-Date -Format s)] Starting NYSEG 7:30 AM workflow" | Set-Content -Path $logPath -Encoding utf8

# The scheduled attempt runs immediately.  If it fails, retry at 20, 40, and
# 60 minutes after the original start.  A successful retry ends the workflow
# so validation, Firebase updates, email, and housekeeping run only once.
$maximumAttempts = 4
$retryDelaySeconds = 20 * 60
$lastExitCode = 1

for ($attempt = 1; $attempt -le $maximumAttempts; $attempt++) {
    if ($attempt -eq 1) {
        "Attempt $attempt/${maximumAttempts}: Running the proven NYSEG_File_Download_Test.py download" | Add-Content -Path $logPath -Encoding utf8
    }
    else {
        "[$(Get-Date -Format s)] Retry $attempt/${maximumAttempts}: running after $($retryDelaySeconds / 60) minutes" | Add-Content -Path $logPath -Encoding utf8
    }

    $attemptStartedAt = Get-Date
    & $python (Join-Path $PSScriptRoot 'run_nyseg_daily_sync.py') --log-path $logPath
    $lastExitCode = $LASTEXITCODE
    if ($lastExitCode -eq 0) {
        try {
            $status = Get-Content -LiteralPath (Join-Path $logDirectory 'nyseg-daily-sync-status.json') -Raw | ConvertFrom-Json
            $history = Get-Content -LiteralPath (Join-Path $projectRoot 'JSON\Daily_NYSEG_Load_History.json') -Raw | ConvertFrom-Json
            $completedAt = [datetimeoffset]::Parse($status.completed_at)
            $today = Get-Date -Format 'yyyy-MM-dd'
            $historyRecord = $history.records | Where-Object { $_.date -eq $today -and $_.status -eq 'Success' } | Select-Object -First 1
            if ($status.status -ne 'success' -or $status.operation -ne 'sync' -or $completedAt.LocalDateTime -lt $attemptStartedAt -or -not $historyRecord) {
                throw 'No completed sync status and matching daily history record were written for this attempt.'
            }
        }
        catch {
            "[$(Get-Date -Format s)] Runner exited 0 without a verified completed sync: $($_.Exception.Message)" | Add-Content -Path $logPath -Encoding utf8
            $lastExitCode = 1
        }
    }
    if ($lastExitCode -eq 0) {
        "[$(Get-Date -Format s)] NYSEG 7:30 AM workflow completed successfully on attempt $attempt/${maximumAttempts}" | Add-Content -Path $logPath -Encoding utf8
        exit 0
    }

    "[$(Get-Date -Format s)] Attempt $attempt/${maximumAttempts} failed with exit code $lastExitCode" | Add-Content -Path $logPath -Encoding utf8
    if ($attempt -lt $maximumAttempts) {
        "[$(Get-Date -Format s)] Waiting 20 minutes before the next automated retry" | Add-Content -Path $logPath -Encoding utf8
        Start-Sleep -Seconds $retryDelaySeconds
    }
}

"[$(Get-Date -Format s)] NYSEG 7:30 AM workflow failed after $maximumAttempts attempts over one hour" | Add-Content -Path $logPath -Encoding utf8
exit $lastExitCode
