@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 備份泰聚達本機資料
node scripts\local-site.mjs backup
echo.
if errorlevel 1 (
  echo 備份失敗，請保留這個畫面以便檢查。
) else (
  echo 備份作業結束。
)
pause
