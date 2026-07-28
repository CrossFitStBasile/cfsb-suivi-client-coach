@echo off
setlocal
cd /d "%~dp0"

echo.
echo Questionnaire Studio - ETAPE A backend par sous-etapes
echo Dossier: %cd%
echo.

if "%~1"=="" goto :usage
set "QUESTIONNAIRE_STAGE=%~1"

if /I not "%CFSB_QUESTIONNAIRE_RELEASE_GO%"=="YES" (
  echo STOP: autorisation explicite manquante.
  echo.
  echo Apres le GO production, lance dans ce terminal:
  echo set CFSB_QUESTIONNAIRE_RELEASE_GO=YES
  echo.
  exit /b 1
)

if /I not "%CFSB_COACH_NOTICE_CONFIRMED%"=="YES" (
  echo STOP: l'avis aux coachs n'est pas confirme.
  echo.
  echo Cette etape touche les regles ou des fonctions en usage et les regles
  echo n'ont pas pu etre executees dans l'emulateur local faute de Java.
  echo Envoie l'avis du runbook, puis confirme dans ce terminal:
  echo set CFSB_COACH_NOTICE_CONFIRMED=YES
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

if /I "%QUESTIONNAIRE_STAGE%"=="rules" (
  set "DEPLOY_ONLY=firestore:rules,firestore:indexes"
  set "NEXT_PROOF=CFSB_QUESTIONNAIRE_RULES_CANARY_OK"
  goto :stage_selected
)

if /I "%QUESTIONNAIRE_STAGE%"=="additive" (
  if /I not "%CFSB_QUESTIONNAIRE_RULES_CANARY_OK%"=="YES" (
    echo STOP: confirme d'abord le Dashboard actuel, les trois liens historiques
    echo et une ecriture historique apres la sous-etape rules:
    echo set CFSB_QUESTIONNAIRE_RULES_CANARY_OK=YES
    exit /b 1
  )
  set "DEPLOY_ONLY=functions:listQuestionnaireForms,functions:saveQuestionnaireDraft,functions:publishQuestionnaireForm,functions:setQuestionnaireDeliveryReady,functions:archiveQuestionnaireForm,functions:duplicateQuestionnaireForm,functions:questionnairePublicApi"
  set "NEXT_PROOF=CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK"
  goto :stage_selected
)

if /I "%QUESTIONNAIRE_STAGE%"=="legacy" (
  if /I not "%CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK%"=="YES" (
    echo STOP: confirme d'abord l'API, le catalogue et une soumission canari
    echo retrouvee par responseId apres la sous-etape additive:
    echo set CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK=YES
    exit /b 1
  )
  set "DEPLOY_ONLY=functions:sendQuestionnaire,functions:processQuestionnaireSendRequest,functions:scheduledQuestionnaireSendPlans"
  set "NEXT_PROOF=CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED"
  goto :stage_selected
)

echo STOP: sous-etape inconnue "%QUESTIONNAIRE_STAGE%".
goto :usage

:stage_selected
set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

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
    echo Firebase CLI: utilisation de la CLI locale cachee avec Node local.
  ) else (
    echo STOP: Firebase CLI introuvable. Lance firebase-login-dashboard.cmd ou
    echo installe la CLI locale avant de reprendre.
    exit /b 1
  )
) else (
  echo Firebase CLI: commande firebase detectee.
)

set "FIREBASE_AUTH_ARGS="
if not "%FIREBASE_TOKEN%"=="" set "FIREBASE_AUTH_ARGS=--token %FIREBASE_TOKEN%"

echo.
echo Prevol Firebase et secrets...
"%NODE_EXE%" "%~dp0tools\verify-firebase-auth-ready.cjs"
if errorlevel 1 (
  echo STOP: authentification ou secrets Firebase non prets.
  exit /b 1
)

echo.
echo Porte Questionnaire Studio...
"%NODE_EXE%" "%~dp0tools\verify-questionnaire-reconciled-candidate.mjs"
if errorlevel 1 exit /b 1

echo.
echo Porte locale complete du Dashboard...
call "%~dp0verify-dashboard-before-deploy.cmd"
if errorlevel 1 (
  echo STOP: validation locale echouee. Aucun deploy Stage A lance.
  exit /b 1
)

set "FUNCTIONS_DISCOVERY_TIMEOUT=120"
set "DRY_RUN_LOG=%~dp0firebase-questionnaire-stage-a-%QUESTIONNAIRE_STAGE%-dry-run.log"
set "DEPLOY_LOG=%~dp0firebase-questionnaire-stage-a-%QUESTIONNAIRE_STAGE%-last.log"

echo.
echo Simulation Firebase de "%DEPLOY_ONLY%"...
call "%FIREBASE_BIN%" deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only "%DEPLOY_ONLY%" %FIREBASE_AUTH_ARGS% > "%DRY_RUN_LOG%" 2>&1
set "DRY_RUN_CODE=%ERRORLEVEL%"
if exist "%DRY_RUN_LOG%" type "%DRY_RUN_LOG%"
if not "%DRY_RUN_CODE%"=="0" (
  echo STOP: dry-run Firebase echoue. Aucun deploy lance.
  exit /b 1
)

echo.
echo Publication de la sous-etape "%QUESTIONNAIRE_STAGE%" seulement...
call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only "%DEPLOY_ONLY%" %FIREBASE_AUTH_ARGS% > "%DEPLOY_LOG%" 2>&1
set "DEPLOY_CODE=%ERRORLEVEL%"
if exist "%DEPLOY_LOG%" type "%DEPLOY_LOG%"
if not "%DEPLOY_CODE%"=="0" goto :deploy_failed
findstr /i /c:"Cannot run login in non-interactive mode" /c:"Authentication Error" /c:"Deploys failed" /c:"There was an error deploying functions" /c:"Error:" "%DEPLOY_LOG%" > nul
if not errorlevel 1 goto :deploy_failed

echo.
echo Sous-etape "%QUESTIONNAIRE_STAGE%" publiee. ARRET HUMAIN OBLIGATOIRE.
echo Execute les canaris correspondants du runbook avant toute sous-etape suivante.
echo Quand les preuves sont conservees, confirme:
echo set %NEXT_PROOF%=YES
echo.
if /I "%QUESTIONNAIRE_STAGE%"=="legacy" (
  echo Ne lance Stage B qu'apres un envoi et une planification historiques
  echo verifies avant/apres, puis un canari du nouveau pipeline.
) else (
  echo Ne lance pas automatiquement la sous-etape suivante.
)
exit /b 0

:deploy_failed
echo.
echo ECHEC STAGE A "%QUESTIONNAIRE_STAGE%". N'EXECUTE PAS l'etape suivante.
echo Journal: %DEPLOY_LOG%
echo Applique le retour arriere correspondant du runbook avant de lever l'avis coach.
exit /b 1

:usage
echo Usage:
echo   deploy-questionnaire-stage-a.cmd rules
echo   deploy-questionnaire-stage-a.cmd additive
echo   deploy-questionnaire-stage-a.cmd legacy
echo.
echo Ordre obligatoire: rules, canari, additive, canari, legacy, canari.
exit /b 1
