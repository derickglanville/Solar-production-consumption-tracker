param(
    [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

$importTaskName = 'Solar Energy Tracker - NYSEG Daily Sync'
$importScript = Join-Path $PSScriptRoot 'run_nyseg_daily_sync.ps1'
$importAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$importScript`""
$importTrigger = New-ScheduledTaskTrigger -Daily -At 7:30AM
Register-ScheduledTask -TaskName $importTaskName -Action $importAction -Trigger $importTrigger -Principal $principal -Settings $settings -Description 'At 7:30 AM downloads NYSEG with the proven test script, then validates/imports M01/M02, records history, and sends email.' -Force | Out-Null

@(
    'Solar Energy Tracker - NYSEG Download',
    'NYSEG Daily Usage Download'
) | ForEach-Object {
    Unregister-ScheduledTask -TaskName $_ -Confirm:$false -ErrorAction SilentlyContinue
}
Write-Host "Created '$importTaskName' for the two-step 7:30 AM NYSEG workflow while $currentUser is signed in."
if ($RunNow) {
    Start-ScheduledTask -TaskName $importTaskName
    Write-Host 'Started the NYSEG 7:30 AM workflow.'
}
