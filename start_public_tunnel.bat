@echo off
title BLOODFALL Public Online Tunnel (Cloudflare)
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 tools/run_tunnel.py
) else (
  python tools/run_tunnel.py
)
if errorlevel 1 (
  echo 실행 중 오류가 발생했습니다.
  pause
)
