@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 驗證泰聚達本機備份
echo.
echo 這項操作只讀取備份，不會修改備份或目前的 .local-data。
echo 請拖曳或貼上「單一、確切的備份資料夾」；不會自動選最新備份。
echo.
set "BACKUP_DIR="
set /p "BACKUP_DIR=備份資料夾："
set "BACKUP_DIR=%BACKUP_DIR:"=%"
if not defined BACKUP_DIR (
  echo 未指定資料夾，已取消。
  pause
  exit /b 1
)
echo.
node scripts\local-site.mjs backup:verify "%BACKUP_DIR%"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo 驗證失敗；沒有修改任何資料。
pause
exit /b %RESULT%
