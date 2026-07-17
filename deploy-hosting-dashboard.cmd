@echo off
setlocal
cd /d "%~dp0"
echo.
echo Publication du Dashboard Coach sur Firebase...
echo Dossier: %cd%
echo.

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

set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

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
set "FIREBASE_AUTH_ARGS="
if not "%FIREBASE_TOKEN%"=="" (
  set "FIREBASE_AUTH_ARGS=--token %FIREBASE_TOKEN%"
  echo Auth Firebase: FIREBASE_TOKEN detecte.
) else (
  echo Auth Firebase: session interactive Firebase CLI.
)
call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only hosting %FIREBASE_AUTH_ARGS% > "%DEPLOY_LOG%" 2>&1
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
