@echo off
REM Doppelklick unter Windows: baut .xpi und .zip im Ordner build\
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
echo.
pause
