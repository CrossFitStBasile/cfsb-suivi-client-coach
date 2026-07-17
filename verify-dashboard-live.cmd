@echo off
setlocal
cd /d "%~dp0"
echo.
echo Validation LIVE du Dashboard Coach publie...
echo URL: https://cfsb-dashboard-coach-aa9a4.web.app
echo.

set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

"%NODE_EXE%" "tools\verify-live-hosting.cjs"
if errorlevel 1 goto fail

echo.
echo Validation live reussie.
exit /b 0

:fail
echo.
echo ECHEC DE VALIDATION LIVE. Verifie le deploy Hosting ou les assets publics.
exit /b 1
