@echo off
setlocal
cd /d "%~dp0"
echo.
echo Publication Hosting par API Firebase...
echo Dossier: %cd%
echo.

set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" (
  set "NODE_EXE=node"
)

"%NODE_EXE%" tools\deploy-hosting-api.cjs
if errorlevel 1 (
  echo.
  echo ECHEC DE LA PUBLICATION HOSTING PAR API.
  call :maybe_pause
  exit /b 1
)

echo.
echo Validation live apres publication...
call "%~dp0verify-dashboard-live.cmd"
if errorlevel 1 (
  echo.
  echo La publication API est terminee, mais la validation live ne confirme pas encore la bonne version.
  call :maybe_pause
  exit /b 1
)

echo.
echo Termine. Recharge:
echo https://cfsb-dashboard-coach-aa9a4.web.app
echo.
call :maybe_pause
exit /b 0

:maybe_pause
if "%DASHBOARD_NO_PAUSE%"=="1" exit /b 0
pause
exit /b 0
