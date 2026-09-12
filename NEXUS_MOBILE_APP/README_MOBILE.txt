NEXUS MOBILE APP v0.3
=====================

This is the real mobile-app wrapper for NEXUS using Capacitor 8.

WHAT THIS DOES
- Packages the existing NEXUS dashboard as a native Android/iPhone app.
- Keeps Tasks, Notes, Calendar, Goals, Lists, Money, Projects, Search, themes,
  local storage, backups and Supabase account sync.
- Uses the same NEXUS core as the desktop app.
- Adds phone safe-area spacing for notches and home bars.

ANDROID ON WINDOWS
You need:
1. Node.js 22 or newer.
2. Android Studio 2025.2.1 or newer.
3. Let Android Studio install the Android SDK.

Then double-click:
BUILD_ANDROID_APK.bat

If successful, the folder will contain:
NEXUS-Android-Test.apk

You can copy that APK to an Android phone and install it for testing.

ANDROID STUDIO MODE
Double-click:
OPEN_ANDROID_STUDIO.bat

IPHONE
iPhone builds require a Mac with Xcode 26 or newer.
On the Mac, run:
CREATE_IPHONE_APP_ON_MAC.command

APP CLIP
The App Clip comes after the full iPhone target exists. It is an additional
target inside the iOS/Xcode project, not a standalone replacement for the app.

GITHUB CLOUD BUILD
This project also includes:
.github/workflows/build-android.yml

That workflow builds a test APK on GitHub and uploads it as an artifact.

SUPABASE
The existing NEXUS Supabase settings remain in the app.
Use only the public publishable/anon key. Never embed the service-role/secret key.

APP ID
com.nexus.commandcenter

VERSION
0.3.0
