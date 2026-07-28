@echo off
setlocal
cd /d "%~dp0"

echo.
echo Questionnaire Studio - ETAPE B Hosting additif
echo Dossier: %cd%
echo.

if defined CFSB_NODE_EXE (
  set "NODE_EXE=%CFSB_NODE_EXE%"
) else (
  set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "%NODE_EXE%" set "NODE_EXE=node"

if /I not "%CFSB_QUESTIONNAIRE_INDEX_READY_OK%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: la preuve que l'index est READY manque.
  echo Lance d'abord le controle post-index du runbook, puis:
  echo set CFSB_QUESTIONNAIRE_INDEX_READY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
  exit /b 1
)

if /I not "%CFSB_QUESTIONNAIRE_SCHEDULER_CANARY_OK%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: le canari scheduler apres index n'est pas confirme.
  echo Verifie zero doublon et zero envoi inattendu, puis:
  echo set CFSB_QUESTIONNAIRE_SCHEDULER_CANARY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
  exit /b 1
)

if /I not "%CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: les canaris Stage A ne sont pas confirmes.
  echo.
  echo Confirme d'abord rules, additive, legacy, index READY et scheduler,
  echo puis lance dans ce terminal:
  echo set CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
  echo.
  exit /b 1
)

if /I not "%CFSB_QUESTIONNAIRE_STAGE_B_GO%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: autorisation explicite Stage B manquante.
  echo.
  echo Apres le GO production, lance dans ce terminal:
  echo set CFSB_QUESTIONNAIRE_STAGE_B_GO=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
  echo.
  exit /b 1
)

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

echo.
echo Stage A confirmee. Publication Hosting avec la porte locale complete...
set "DASHBOARD_NO_PAUSE=1"
call "%~dp0deploy-hosting-dashboard.cmd"
if errorlevel 1 (
  echo.
  echo ECHEC STAGE B. Utilise immediatement le rollback Hosting du runbook.
  exit /b 1
)

echo.
echo Verification HTTP exacte des questionnaires historiques et de CoachRx...
"%NODE_EXE%" "%~dp0tools\verify-questionnaire-live-continuity.mjs"
if errorlevel 1 (
  echo.
  echo STOP: la continuite live historique n'est pas confirmee.
  echo Applique immediatement le rollback Hosting du runbook avant la reprise coach.
  exit /b 1
)

echo.
echo Stage B publiee. La mise en service n'est pas encore generalisee.
echo 1. Teste admin et coach.
echo 2. Teste les trois anciennes URL.
echo 3. Teste les quatre nouvelles URL sur ordinateur et mobile.
echo 4. Verifie chaque soumission canari par responseId dans Firestore.
echo 5. Garde deliveryReady=false jusqu'aux deux canaris du workflow GHL dedie.
echo.
exit /b 0
