# Builds the Windows release folder and zip on Windows (no npm or Node needed).
# Usage (PowerShell, in this folder):
#   powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
#   powershell -ExecutionPolicy Bypass -File .\build-windows.ps1 -Database "$env:USERPROFILE\Documents\Wrestling Match Database.wmdb"
#     builds the database file from Wrestling Match Database Builder into the app.
param([string]$ElectronVersion = '44.9.3', [string]$Database = '')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-Location $PSScriptRoot
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$name = "WCW-Match-Search-Engine-Windows-$version"
$out = Join-Path 'dist' $name
$zipName = "electron-v$ElectronVersion-win32-x64.zip"
$cached = Join-Path 'cache' $zipName
New-Item -ItemType Directory -Force -Path dist, cache | Out-Null
if (-not (Test-Path $cached)) {
  Write-Host "Downloading Electron $ElectronVersion (about 150 MB)..."
  Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/v$ElectronVersion/$zipName" -OutFile $cached
}
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
if (Test-Path "dist\$name.zip") { Remove-Item "dist\$name.zip" -Force }
Write-Host 'Unpacking Electron...'
Expand-Archive -Path $cached -DestinationPath $out
Rename-Item (Join-Path $out 'electron.exe') 'WCW Match Search Engine.exe'
Remove-Item (Join-Path $out 'resources\default_app.asar') -ErrorAction SilentlyContinue
Write-Host 'Copying the app...'
$appDir = Join-Path $out 'resources\app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Copy-Item main.js, preload.js, package.json, LICENSE -Destination $appDir
Copy-Item app -Destination $appDir -Recurse
if ($Database) {
  if (-not (Test-Path $Database)) { throw "Can't find $Database" }
  Copy-Item $Database -Destination (Join-Path $appDir 'app\data\2-wiki-database.wmdb')
  Write-Host "Built in the database from $Database" -ForegroundColor Green
}
Copy-Item build\icon.ico -Destination (Join-Path $out 'icon.ico')
Copy-Item windows\Install.cmd, windows\install.ps1, windows\uninstall.ps1, windows\README.txt -Destination $out
Write-Host 'Zipping...'
Compress-Archive -Path $out -DestinationPath "dist\$name.zip"
Write-Host ""
Write-Host "Done:" -ForegroundColor Green
Write-Host "  Run it now:  $out\WCW Match Search Engine.exe"
Write-Host "  Share it:    dist\$name.zip"
