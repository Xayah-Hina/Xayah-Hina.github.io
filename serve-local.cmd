@echo off
setlocal
cd /d "%~dp0"

set "LOCAL_URL=http://localhost:8765/#journal"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%CHROME%" (
  start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 700; Start-Process -FilePath '%CHROME%' -ArgumentList '%LOCAL_URL%'"
) else (
  start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 700; Start-Process '%LOCAL_URL%'"
)

echo Writing local editor: %LOCAL_URL%
echo Press Ctrl+C to stop the server.
py "%~dp0serve-local.py"
