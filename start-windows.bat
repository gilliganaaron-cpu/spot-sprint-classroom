@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Spot Sprint requires Node.js. Install the LTS version from https://nodejs.org/
  pause
  exit /b 1
)
start "Spot Sprint Server" cmd /k "node server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
echo Game launched. Keep the 'Spot Sprint Server' window open during the lesson.
