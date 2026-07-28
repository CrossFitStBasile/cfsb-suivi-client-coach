@echo off
setlocal
cd /d "%~dp0"

set "FIREBASE_BIN=firebase"
set "FIREBASE_CACHE=%USERPROFILE%\.cache\cfsb-dashboard-tools"
set "FIREBASE_LOCAL_CMD=%FIREBASE_CACHE%\firebase-tools-clean\node_modules\.bin\firebase.cmd"
set "FIREBASE_LOCAL_NODE="
for /d %%D in ("%FIREBASE_CACHE%\node-v22\node-v*-win-x64") do set "FIREBASE_LOCAL_NODE=%%~fD"

where firebase > nul 2>&1
if errorlevel 1 (
  if exist "%FIREBASE_LOCAL_CMD%" if exist "%FIREBASE_LOCAL_NODE%\node.exe" (
    set "PATH=%FIREBASE_LOCAL_NODE%;%PATH%"
    set "FIREBASE_BIN=%FIREBASE_LOCAL_CMD%"
  ) else (
    echo Firebase CLI locale introuvable.
    echo Ouvre C:\Users\micha\Downloads\firebase-tools-instant-win.exe et saisis: login --reauth
    call :maybe_pause
    exit /b 1
  )
)

echo Reconnexion Firebase du Dashboard Coach...
call "%FIREBASE_BIN%" login --reauth
if errorlevel 1 (
  echo ECHEC DE RECONNEXION FIREBASE.
  call :maybe_pause
  exit /b 1
)

echo Connexion Firebase renouvelee.
call :maybe_pause
exit /b 0

:maybe_pause
if "%DASHBOARD_NO_PAUSE%"=="1" exit /b 0
pause
exit /b 0
