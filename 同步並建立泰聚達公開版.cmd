@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 同步並建立泰聚達公開版

node scripts\local-site.mjs start
if errorlevel 1 goto failed

call npm.cmd run build:publish
if errorlevel 1 goto failed

node scripts\verify-pages-export.mjs
if errorlevel 1 goto failed

echo.
echo 公開內容快照與 GitHub Pages 靜態檔已建立完成。
echo 請確認內容後，再將 Git 變更推送到 main。
pause
exit /b 0

:failed
echo.
echo 建立失敗，請保留這個畫面以便檢查。
pause
exit /b 1
