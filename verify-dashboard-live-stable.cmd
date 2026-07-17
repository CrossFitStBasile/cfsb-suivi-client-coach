@echo off
setlocal
cd /d "%~dp0"
echo.
echo Validation LIVE stable du Dashboard Coach publie...
echo URL: https://cfsb-dashboard-coach-aa9a4.web.app
echo Mode: accepte que le live soit en retard sur la version locale, si le reste est sain.
echo.

set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

set "DASHBOARD_ALLOW_LIVE_VERSION_MISMATCH=1"
"%NODE_EXE%" "tools\verify-live-hosting.cjs"
if errorlevel 1 goto fail

echo.
echo Validation live stable reussie.
exit /b 0

:fail
echo.
echo ECHEC DE VALIDATION LIVE STABLE. Le live a un probleme autre qu'une version en retard.
exit /b 1
