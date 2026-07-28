@echo off
setlocal
cd /d "%~dp0"

if "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"=="" (
  echo STOP: CFSB_QUESTIONNAIRE_RELEASE_COMMIT est manquant.
  exit /b 1
)

if "%~1"=="" goto :usage

if defined CFSB_NODE_EXE (
  set "NODE_EXE=%CFSB_NODE_EXE%"
) else (
  set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "%NODE_EXE%" set "NODE_EXE=node"

"%NODE_EXE%" "%~dp0tools\run-questionnaire-scheduler-canary.cjs" --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% %*
exit /b %ERRORLEVEL%

:usage
echo Usage:
echo   run-questionnaire-release-canary.cmd --preview
echo   run-questionnaire-release-canary.cmd --provision-contact
echo   run-questionnaire-release-canary.cmd --pin-contact
echo   run-questionnaire-release-canary.cmd --execute-process
echo   run-questionnaire-release-canary.cmd --execute-empty
echo   run-questionnaire-release-canary.cmd --execute-positive
echo   run-questionnaire-release-canary.cmd --cleanup
exit /b 1
