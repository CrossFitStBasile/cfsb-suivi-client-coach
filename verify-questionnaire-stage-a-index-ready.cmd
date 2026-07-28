@echo off
setlocal
cd /d "%~dp0"

echo.
echo Questionnaire Studio - controle post-index en lecture seule
echo Dossier: %cd%
echo.

if defined CFSB_NODE_EXE (
  set "NODE_EXE=%CFSB_NODE_EXE%"
) else (
  set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "%NODE_EXE%" set "NODE_EXE=node"

if "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"=="" (
  echo STOP: commit scelle manquant.
  echo Definis CFSB_QUESTIONNAIRE_RELEASE_COMMIT avec le SHA exact du candidat.
  exit /b 1
)
"%NODE_EXE%" "%~dp0tools\verify-sealed-questionnaire-release-worktree.cjs" "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"
if errorlevel 1 (
  echo STOP: impossible de confirmer le commit scelle et le worktree propre.
  exit /b 1
)

"%NODE_EXE%" "%~dp0tools\preflight-questionnaire-stage-a-live.cjs" --protect-through-next-scheduler --require-index-ready --require-safe-scheduler-window
if errorlevel 1 (
  echo.
  echo STOP: l'index n'est pas READY ou l'horizon du prochain Scheduler
  echo contient une planification active dangereuse.
  exit /b 1
)

echo.
echo PASS lecture seule: index READY et horizon protege.
echo Ne definis CFSB_QUESTIONNAIRE_INDEX_READY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% qu'apres avoir aussi
echo verifie zero envoi inattendu. Execute ensuite le canari Scheduler du runbook.
exit /b 0
