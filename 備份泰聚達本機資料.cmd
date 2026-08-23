@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 備份泰聚達本機資料
echo 將安全停止本機網站，建立含逐檔 SHA-256 的 v2 備份，驗證後再重新啟動。
echo.
node scripts\local-site.mjs backup
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" (
  echo 備份失敗，請保留這個畫面以便檢查。
) else (
  echo 備份作業結束。
)
pause
exit /b %RESULT%
