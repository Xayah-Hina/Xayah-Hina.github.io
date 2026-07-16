@echo off
setlocal
cd /d "%~dp0"

set "LOCAL_URL=http://localhost:8765/#journal"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE%" (
  start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 700; Start-Process -FilePath '%EDGE%' -ArgumentList '%LOCAL_URL%'"
) else (
  echo Microsoft Edge was not found. Open %LOCAL_URL% manually.
)

echo Writing local editor: %LOCAL_URL%
echo Press Ctrl+C to stop the server.
py "%~dp0serve-local.py" --auto-push
