param(
    [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$taskName = 'Solar Energy Tracker - NYSEG Daily Sync'
$scriptPath = Join-Path $PSScriptRoot 'run_nyseg_daily_sync.ps1'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At 7:30AM
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Runs Run_NYSEG_File_Download.py daily, imports validated M01/M02 readings to Firebase, and refreshes tracker data.' -Force | Out-Null
Write-Host "Created '$taskName' for every day at 7:30 AM while $currentUser is signed in."
if ($RunNow) {
    Start-ScheduledTask -TaskName $taskName
    Write-Host 'Started the NYSEG daily sync task.'
}
