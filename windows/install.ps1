# WCW Match Search Engine installer: copies the app to %LOCALAPPDATA%\Programs\WCW Match Search Engine
# and creates Start menu + desktop shortcuts.
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $env:LOCALAPPDATA 'Programs\WCW Match Search Engine'
$exe = Join-Path $target 'WCW Match Search Engine.exe'

if (-not (Test-Path (Join-Path $source 'WCW Match Search Engine.exe'))) {
  Write-Host 'Run this from inside the unzipped WCW Match Search Engine folder.' -ForegroundColor Red
  exit 1
}
Get-Process 'WCW Match Search Engine' -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "Installing to $target ..."
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force

$shell = New-Object -ComObject WScript.Shell
$shortcuts = @(
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'WCW Match Search Engine.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'WCW Match Search Engine.lnk')
)
foreach ($path in $shortcuts) {
  $link = $shell.CreateShortcut($path)
  $link.TargetPath = $exe
  $link.WorkingDirectory = $target
  $link.IconLocation = (Join-Path $target 'icon.ico') + ',0'
  $link.Description = 'Search every NWA and WCW match'
  $link.Save()
}

$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\WCWMatchSearchEngine'
New-Item -Path $key -Force | Out-Null
Set-ItemProperty $key DisplayName 'WCW Match Search Engine'
Set-ItemProperty $key DisplayVersion '1.2.0'
Set-ItemProperty $key Publisher 'WCW Match Search Engine (unofficial)'
Set-ItemProperty $key DisplayIcon (Join-Path $target 'icon.ico')
Set-ItemProperty $key InstallLocation $target
Set-ItemProperty $key UninstallString ('powershell -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $target 'uninstall.ps1') + '"')
Set-ItemProperty $key NoModify 1
Set-ItemProperty $key NoRepair 1

Write-Host 'Done. Opening WCW Match Search Engine...' -ForegroundColor Green
Start-Process $exe
