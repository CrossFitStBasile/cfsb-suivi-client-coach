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
    echo Firebase CLI introuvable.
    exit /b 1
  )
)

echo Generation interactive d'un token CI Firebase.
echo Ne partage jamais la valeur FIREBASE_TOKEN dans un journal ou un chat.
call "%FIREBASE_BIN%" login:ci
if errorlevel 1 exit /b 1
echo Copie le token dans la variable d'environnement FIREBASE_TOKEN de la session concernee.
call :maybe_pause
exit /b 0

:maybe_pause
if "%DASHBOARD_NO_PAUSE%"=="1" exit /b 0
pause
exit /b 0
