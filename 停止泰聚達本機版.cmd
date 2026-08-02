@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 停止泰聚達本機版
node scripts\local-site.mjs stop
if errorlevel 1 pause
