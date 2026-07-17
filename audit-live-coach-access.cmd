@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE="
set "FIREBASE_CACHE=%USERPROFILE%\.cache\cfsb-dashboard-tools"
for /d %%D in ("%FIREBASE_CACHE%\node-v22\node-v*-win-x64") do set "NODE_EXE=%%~fD\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
"%NODE_EXE%" tools\audit-live-coach-access.cjs %*
exit /b %ERRORLEVEL%
