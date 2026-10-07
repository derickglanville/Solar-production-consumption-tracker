param(
    [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

$downloadTaskName = 'Solar Energy Tracker - NYSEG Download'
$downloadScript = Join-Path $PSScriptRoot 'run_nyseg_download_720.ps1'
$downloadAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$downloadScript`""
$downloadTrigger = New-ScheduledTaskTrigger -Daily -At 7:20AM
Register-ScheduledTask -TaskName $downloadTaskName -Action $downloadAction -Trigger $downloadTrigger -Principal $principal -Settings $settings -Description 'Runs Run_NYSEG_File_Download.py --headless daily at 7:20 AM to save the NYSEG CSV.' -Force | Out-Null

$importTaskName = 'Solar Energy Tracker - NYSEG Daily Sync'
$importScript = Join-Path $PSScriptRoot 'run_nyseg_daily_sync.ps1'
$importAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$importScript`""
$importTrigger = New-ScheduledTaskTrigger -Daily -At 7:30AM
Register-ScheduledTask -TaskName $importTaskName -Action $importAction -Trigger $importTrigger -Principal $principal -Settings $settings -Description 'Validates and imports NYSEG M01/M02 at 7:30 AM, then records history and sends email.' -Force | Out-Null

Write-Host "Created '$downloadTaskName' for 7:20 AM and '$importTaskName' for 7:30 AM while $currentUser is signed in."
if ($RunNow) {
    Start-ScheduledTask -TaskName $downloadTaskName
    Write-Host 'Started the NYSEG 7:20 AM download task.'
}
