@echo off
title BLOODFALL Online Host Server
cd /d "%~dp0"
echo ========================================================
echo   BLOODFALL 온라인 멀티플레이어 서버 실행 중...
echo   (네트워크 외부/공개 접속 허용: 0.0.0.0:8080)
echo ========================================================
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m server.main --host 0.0.0.0 --port 8080 --open-browser
) else (
  python -m server.main --host 0.0.0.0 --port 8080 --open-browser
)
if errorlevel 1 (
  echo Python 3 실행 오류가 발생했습니다. 파이썬 설치 여부를 확인하세요.
  pause
)
