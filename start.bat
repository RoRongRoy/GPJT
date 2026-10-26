@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m server.main --open-browser
) else (
  python -m server.main --open-browser
)
if errorlevel 1 (
  echo Please install Python 3.11 or newer, or check the error above.
  pause
)
