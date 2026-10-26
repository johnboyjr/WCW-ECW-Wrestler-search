Unzip wcw-match-search-engine-source.zip. You’ll get a folder called wcw-search.
Open PowerShell in that folder. In File Explorer, open wcw-search, click the address bar, type powershell and press Enter.
Run the build script: powershell powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
Wait for it to finish.
The first build downloads the Electron runtime from GitHub, about 150 MB. It’s saved in the cache folder, so later builds skip the download.
The script then copies in the app and the match database and makes the zip.
Find the result:
dist\WCW-Match-Search-Engine-Windows-1.2.0\WCW Match Search Engine.exe runs right away.