@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 泰聚達本機版
node scripts\local-site.mjs start
if errorlevel 1 (
  echo.
  echo 啟動失敗，請保留這個畫面以便檢查。
  pause
)
