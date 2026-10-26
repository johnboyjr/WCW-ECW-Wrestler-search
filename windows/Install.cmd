@echo off
rem Installs WCW Match Search Engine for the current user (no admin rights needed) and adds
rem Start menu and desktop shortcuts. Run it from inside the unzipped folder.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
