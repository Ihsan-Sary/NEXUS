@echo off
setlocal
title Build NEXUS Android App
cd /d "%~dp0"

echo.
echo ==========================================
echo          NEXUS ANDROID APP BUILDER
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found.
  echo Install Node.js 22 or newer, then run this file again.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set NODEMAJOR=%%V
if %NODEMAJOR% LSS 22 (
  echo ERROR: NEXUS mobile requires Node.js 22 or newer.
  node --version
  pause
  exit /b 1
)

set "STUDIO_JAVA=C:\Program Files\Android\Android Studio\jbr"
if exist "%STUDIO_JAVA%\bin\java.exe" set "JAVA_HOME=%STUDIO_JAVA%"

set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%" (
  echo ERROR: Android SDK was not found at:
  echo %ANDROID_HOME%
  echo.
  echo Install/open Android Studio first and let it install the Android SDK.
  pause
  exit /b 1
)

echo [1/5] Installing NEXUS mobile tools...
call npm install
if errorlevel 1 goto :fail

if not exist "android\gradlew.bat" (
  echo [2/5] Creating Android app project...
  call npx cap add android
  if errorlevel 1 goto :fail
) else (
  echo [2/5] Android project already exists.
)

echo [3/5] Syncing NEXUS into Android...
call npx cap sync android
if errorlevel 1 goto :fail

echo [4/5] Connecting Android Studio SDK...
powershell.exe -NoProfile -Command "$p=$env:ANDROID_HOME.Replace('\','\\'); Set-Content -Path 'android\local.properties' -Value ('sdk.dir=' + $p)"
if errorlevel 1 goto :fail

echo [5/5] Building test APK...
pushd android
call gradlew.bat assembleDebug
if errorlevel 1 (
  popd
  goto :fail
)
popd

if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
  copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "NEXUS-Android-Test.apk" >nul
  echo.
  echo ==========================================
  echo                 SUCCESS!
  echo ==========================================
  echo.
  echo Your Android app is:
  echo %CD%\NEXUS-Android-Test.apk
  echo.
  explorer.exe /select,"%CD%\NEXUS-Android-Test.apk"
  pause
  exit /b 0
)

echo Build finished, but the APK could not be found.
pause
exit /b 1

:fail
echo.
echo ==========================================
echo              BUILD FAILED
echo ==========================================
echo Send Bob the last part of the error above.
echo.
pause
exit /b 1
