@echo off
setlocal
title Open NEXUS in Android Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required first.
  pause
  exit /b 1
)

call npm install
if errorlevel 1 pause & exit /b 1

if not exist "android\gradlew.bat" (
  call npx cap add android
  if errorlevel 1 pause & exit /b 1
)

call npx cap sync android
if errorlevel 1 pause & exit /b 1

call npx cap open android
