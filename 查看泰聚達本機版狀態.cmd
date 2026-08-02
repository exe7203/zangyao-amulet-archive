@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 泰聚達本機版狀態
node scripts\local-site.mjs status
echo.
pause
