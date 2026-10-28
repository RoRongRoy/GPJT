@echo off
title BLOODFALL Public Online Tunnel (Cloudflare)
cd /d "%~dp0"
echo ========================================================
echo   BLOODFALL 무료 공개 온라인 터널 생성기
echo ========================================================

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
  if not exist "%~dp0cloudflared.exe" (
    echo [1/2] cloudflared 프로그램이 없어 자동으로 다운로드합니다...
    echo (약 50MB 다운로드 중, 잠시만 기다려주세요)
    curl.exe -L -o "%~dp0cloudflared.exe" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
    if errorlevel 1 (
      echo 다운로드 실패! 인터넷 연결을 확인하세요.
      pause
      exit /b 1
    )
    echo 다운로드 완료!
  )
  set "CF_CMD=%~dp0cloudflared.exe"
) else (
  set "CF_CMD=cloudflared"
)

echo.
echo [2/2] 온라인 공개 터널을 시작합니다...
echo.
echo --------------------------------------------------------
echo [중요] 아래 출력되는 주소 중
echo https://xxxx.trycloudflare.com 형태의 주소를 복사해서
echo 친구나 다른 사람들에게 공유하시면 즉시 접속할 수 있습니다!
echo (이 창을 닫으면 외부 접속이 종료됩니다)
echo --------------------------------------------------------
echo.

"%CF_CMD%" tunnel --url http://localhost:8080
pause
