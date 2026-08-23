@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 還原泰聚達本機資料
echo.
echo [重要] 還原會以指定備份取代本專案的 .local-data。
echo 程式會先驗證 v2 清單、確認網站已停止，並把現有資料另存為可恢復的預還原備份。
echo 必須拖曳或貼上「單一、確切的備份資料夾」；不會自動選最新備份。
echo 舊版 v1 備份因沒有逐檔 SHA-256，只能檢查，不能直接還原。
echo.
set "BACKUP_DIR="
set /p "BACKUP_DIR=要還原的備份資料夾："
set "BACKUP_DIR=%BACKUP_DIR:"=%"
if not defined BACKUP_DIR (
  echo 未指定資料夾，已取消。
  pause
  exit /b 1
)
echo.
choice /C YN /N /M "確定已停止網站，並要從這個確切資料夾還原嗎？[Y/N] "
if errorlevel 2 (
  echo 已取消，沒有修改資料。
  pause
  exit /b 0
)
echo.
node scripts\local-site.mjs restore "%BACKUP_DIR%"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo 還原未完成。請閱讀上方訊息，不要直接啟動網站。
pause
exit /b %RESULT%
