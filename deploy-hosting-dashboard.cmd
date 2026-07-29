@echo off
setlocal
cd /d "%~dp0"
echo.
echo Publication du Dashboard Coach sur Firebase...
echo Dossier: %cd%
echo.

if defined CFSB_NODE_EXE (
  set "NODE_EXE=%CFSB_NODE_EXE%"
) else (
  set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "%NODE_EXE%" set "NODE_EXE=node"

if exist "%~dp0firebase-dashboard\QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md" if /I not "%CFSB_QUESTIONNAIRE_INDEX_READY_OK%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: la preuve que l'index Questionnaire est READY manque.
  echo Utilise deploy-questionnaire-stage-b.cmd apres le controle post-index.
  call :maybe_pause
  exit /b 1
)
if exist "%~dp0firebase-dashboard\QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md" if /I not "%CFSB_QUESTIONNAIRE_SCHEDULER_CANARY_OK%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: le canari Scheduler apres index n'est pas confirme.
  echo Utilise deploy-questionnaire-stage-b.cmd apres les canaris du runbook.
  call :maybe_pause
  exit /b 1
)
if exist "%~dp0firebase-dashboard\QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md" if /I not "%CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: ce candidat ne peut pas publier Hosting avant le canari backend.
  echo.
  echo Utilise deploy-questionnaire-stage-a.cmd, complete les controles du
  echo runbook, puis lance deploy-questionnaire-stage-b.cmd.
  echo.
  call :maybe_pause
  exit /b 1
)
if exist "%~dp0firebase-dashboard\QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md" if /I not "%CFSB_QUESTIONNAIRE_STAGE_B_GO%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: ce candidat exige aussi un GO Stage B explicite.
  echo.
  echo Utilise deploy-questionnaire-stage-b.cmd apres le canari backend.
  echo.
  call :maybe_pause
  exit /b 1
)
if not exist "%~dp0firebase-dashboard\QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md" goto :questionnaire_guard_complete
if "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"=="" (
  echo STOP: commit Questionnaire Studio scelle manquant.
  call :maybe_pause
  exit /b 1
)
if "%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%"=="" (
  echo STOP: planHash du recu pre-release manquant.
  echo Utilise deploy-questionnaire-stage-b.cmd avec le planHash scelle.
  call :maybe_pause
  exit /b 1
)
"%NODE_EXE%" "%~dp0tools\verify-sealed-questionnaire-release-worktree.cjs" "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"
if errorlevel 1 (
  echo STOP: impossible de confirmer le commit scelle et le worktree propre.
  call :maybe_pause
  exit /b 1
)
echo.
echo Verification du recu pre-release exact avant la porte Hosting...
"%NODE_EXE%" "%~dp0tools\seal-questionnaire-pre-release-state.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" "--plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%" --verify-receipt
if errorlevel 1 (
  echo STOP: recu pre-release absent, invalide ou lie a un autre SHA/planHash.
  call :maybe_pause
  exit /b 1
)
echo.
echo Verification live de l'avis de maintenance avant la porte Hosting...
"%NODE_EXE%" "%~dp0tools\manage-questionnaire-release-announcements.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" --maintenance-verify
if errorlevel 1 (
  echo STOP: maintenancePublished n'est pas confirme live pour ce SHA.
  call :maybe_pause
  exit /b 1
)
:questionnaire_guard_complete

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
  ) else if "%FIREBASE_TOKEN%"=="" (
    echo La commande firebase est introuvable dans ce terminal et FIREBASE_TOKEN n'est pas defini.
    echo.
    echo Chemin automatique recommande:
    echo Installer la CLI locale avec npm dans %FIREBASE_CACHE%.
    echo.
    echo Chemin interactif recommande:
    echo C:\Users\micha\Downloads\firebase-tools-instant-win.exe
    echo.
    echo Quand la console Firebase affiche le prompt ^>, colle:
    echo cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
    echo publier-dashboard-mvp.cmd
    echo.
    echo Chemin non interactif:
    echo 1. Genere un token avec firebase-login-ci-token.cmd dans un terminal ou firebase est reconnu.
    echo 2. Relance ici avec set FIREBASE_TOKEN=TON_TOKEN
    echo.
    call :maybe_pause
    exit /b 1
  ) else (
    echo La commande firebase est introuvable dans ce terminal.
    echo.
    echo La CLI locale attendue est introuvable:
    echo %FIREBASE_LOCAL_CMD%
    echo.
    echo Installe firebase-tools localement ou ouvre la console interactive:
    echo C:\Users\micha\Downloads\firebase-tools-instant-win.exe
    echo.
    call :maybe_pause
    exit /b 1
  )
) else (
  echo Firebase CLI: commande firebase detectee dans ce terminal.
)

echo.
echo Prevol Firebase auth/hosting...
"%NODE_EXE%" "%~dp0tools\verify-firebase-auth-ready.cjs" --hosting-only
if errorlevel 1 (
  echo.
  echo Publication Hosting arretee: la session Firebase n'est pas prete.
  echo.
  echo Pour reconnecter:
  echo firebase-login-dashboard.cmd
  echo.
  echo Puis relancer:
  echo publier-dashboard-mvp.cmd
  echo.
  echo Option Hosting seul:
  echo deploy-hosting-dashboard.cmd
  echo.
  call :maybe_pause
  exit /b 1
)

call "%~dp0verify-dashboard-before-deploy.cmd"
if errorlevel 1 (
  echo.
  echo Publication Hosting arretee: validation locale echouee.
  call :maybe_pause
  exit /b 1
)

set "DEPLOY_LOG=%~dp0firebase-hosting-deploy-last.log"
set "DRY_RUN_LOG=%~dp0firebase-hosting-dry-run-last.log"
set "FIREBASE_AUTH_ARGS="
if not "%FIREBASE_TOKEN%"=="" (
  set "FIREBASE_AUTH_ARGS=--token %FIREBASE_TOKEN%"
  echo Auth Firebase: FIREBASE_TOKEN detecte.
) else (
  echo Auth Firebase: session interactive Firebase CLI.
)
call "%FIREBASE_BIN%" deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only hosting --non-interactive %FIREBASE_AUTH_ARGS% > "%DRY_RUN_LOG%" 2>&1
set "DRY_RUN_CODE=%ERRORLEVEL%"
if exist "%DRY_RUN_LOG%" type "%DRY_RUN_LOG%"
if not "%DRY_RUN_CODE%"=="0" (
  echo.
  echo ECHEC DU DRY-RUN HOSTING. Aucun deploy Hosting lance.
  call :maybe_pause
  exit /b 1
)
if exist "%~dp0firebase-dashboard\QUESTIONNAIRE_STAGED_RELEASE_REQUIRED.md" (
  echo.
  echo Confirmation finale du candidat scelle avant mutation Hosting...
  "%NODE_EXE%" "%~dp0tools\verify-sealed-questionnaire-release-worktree.cjs" "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"
  if errorlevel 1 (
    echo STOP: le candidat a change depuis le dry-run. Aucun deploy Hosting lance.
    call :maybe_pause
    exit /b 1
  )
  echo.
  echo Confirmation finale du recu pre-release exact...
  "%NODE_EXE%" "%~dp0tools\seal-questionnaire-pre-release-state.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" "--plan-hash=%CFSB_QUESTIONNAIRE_PRE_RELEASE_PLAN_HASH%" --verify-receipt
  if errorlevel 1 (
    echo STOP: le recu SHA/planHash a change. Aucun deploy Hosting lance.
    call :maybe_pause
    exit /b 1
  )
  echo.
  echo Confirmation finale de l'avis de maintenance live...
  "%NODE_EXE%" "%~dp0tools\manage-questionnaire-release-announcements.cjs" "--release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" --maintenance-verify
  if errorlevel 1 (
    echo STOP: l'avis de maintenance n'est plus publie. Aucun deploy Hosting lance.
    call :maybe_pause
    exit /b 1
  )
)
call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only hosting --non-interactive %FIREBASE_AUTH_ARGS% > "%DEPLOY_LOG%" 2>&1
set "DEPLOY_CODE=%ERRORLEVEL%"
type "%DEPLOY_LOG%"
if not "%DEPLOY_CODE%"=="0" goto :deploy_failed
findstr /i /c:"Cannot run login in non-interactive mode" /c:"Authentication Error" /c:"Deploys failed" /c:"Error:" "%DEPLOY_LOG%" > nul
if not errorlevel 1 goto :deploy_failed
goto :deploy_success

:deploy_failed
  echo.
  echo ECHEC DU DEPLOIEMENT.
  echo Journal: %DEPLOY_LOG%
  echo.
  echo Si Firebase demande une reconnexion, lance d'abord:
  echo firebase-login-dashboard.cmd
  echo.
  echo Puis relance:
  echo publier-dashboard-mvp.cmd
  echo.
  echo Option Hosting seul:
  echo deploy-hosting-dashboard.cmd
  echo.
  call :maybe_pause
  exit /b 1

:deploy_success
echo.
echo Validation live apres publication...
call "%~dp0verify-dashboard-live.cmd"
if errorlevel 1 (
  echo.
  echo Le deploy Hosting est termine, mais la validation live ne confirme pas encore la bonne version.
  echo Verifie le journal ci-dessus, puis relance verify-dashboard-live.cmd apres quelques secondes.
  call :maybe_pause
  exit /b 1
)
echo.
echo Termine. Si le deploy est complet, recharge:
echo https://cfsb-dashboard-coach-aa9a4.web.app
echo.
call :maybe_pause
exit /b 0

:maybe_pause
if "%DASHBOARD_NO_PAUSE%"=="1" exit /b 0
pause
exit /b 0
