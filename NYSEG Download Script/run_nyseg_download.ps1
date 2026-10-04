[CmdletBinding()]
param(
    [switch]$Headed
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'nyseg_download.py'
$candidates = @()
foreach ($commandName in 'python', 'py') {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
}
$python = $null
foreach ($candidate in $candidates | Select-Object -Unique) {
    & $candidate -c 'import playwright' 2>$null
    if ($LASTEXITCODE -eq 0) { $python = $candidate; break }
}
if (-not $python) {
    throw 'Playwright is not installed for python or py. Run: python -m pip install playwright; python -m playwright install chromium'
}
$pythonArguments = @($scriptPath)
if ($Headed) { $pythonArguments += '--headed' }
Write-Host "Using $python"
& $python @pythonArguments
exit $LASTEXITCODE
