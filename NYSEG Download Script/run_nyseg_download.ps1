[CmdletBinding()]
param(
    [switch]$Headed
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = (Get-Command py -ErrorAction SilentlyContinue).Source
if (-not $python) { $python = (Get-Command python -ErrorAction Stop).Source }
$args = @((Join-Path $PSScriptRoot 'nyseg_download.py'))
if ($Headed) { $args += '--headed' }
& $python @args
exit $LASTEXITCODE