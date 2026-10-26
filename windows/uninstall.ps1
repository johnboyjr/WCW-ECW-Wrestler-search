# Removes WCW Match Search Engine, its shortcuts and its Settings > Apps entry.
$target = Join-Path $env:LOCALAPPDATA 'Programs\WCW Match Search Engine'
Get-Process 'WCW Match Search Engine' -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'WCW Match Search Engine.lnk') -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'WCW Match Search Engine.lnk') -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\WCWMatchSearchEngine' -Recurse -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'WCW Match Search Engine has been removed.'
