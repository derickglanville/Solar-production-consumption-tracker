[CmdletBinding()]
param(
    [datetime]$At = (Get-Date '07:30'),
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$taskName = 'Solar Tracker - Download NYSEG Usage'
$scriptPath = Join-Path $PSScriptRoot 'run_nyseg_download.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Downloads NYSEG interval usage CSV for the Solar Tracker at 7:30 AM.' -Force:$Force
Write-Host "Installed task '$taskName' for $($At.ToShortTimeString())."