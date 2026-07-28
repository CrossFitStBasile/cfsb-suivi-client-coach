@echo off
setlocal
cd /d "%~dp0"

echo.
echo Questionnaire Studio - ETAPE B Hosting additif
echo Dossier: %cd%
echo.

if /I not "%CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED%"=="YES" (
  echo STOP: les canaris Stage A ne sont pas confirmes.
  echo.
  echo Confirme d'abord les canaris rules, additive et legacy du runbook,
  echo puis lance dans ce terminal:
  echo set CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED=YES
  echo.
  exit /b 1
)

if /I not "%CFSB_QUESTIONNAIRE_STAGE_B_GO%"=="YES" (
  echo STOP: autorisation explicite Stage B manquante.
  echo.
  echo Apres le GO production, lance dans ce terminal:
  echo set CFSB_QUESTIONNAIRE_STAGE_B_GO=YES
  echo.
  exit /b 1
)

if "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"=="" (
  echo STOP: commit scelle manquant.
  echo Definis CFSB_QUESTIONNAIRE_RELEASE_COMMIT avec le SHA exact du candidat.
  exit /b 1
)
for /f %%H in ('git rev-parse HEAD 2^>nul') do set "CURRENT_RELEASE_COMMIT=%%H"
if /I not "%CURRENT_RELEASE_COMMIT%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: HEAD %CURRENT_RELEASE_COMMIT% ne correspond pas au candidat scelle
  echo %CFSB_QUESTIONNAIRE_RELEASE_COMMIT%.
  exit /b 1
)
for /f "delims=" %%S in ('git status --porcelain --untracked-files^=all') do (
  echo STOP: le worktree contient des changements apres le scellement.
  git status --short
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

set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
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
