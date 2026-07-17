@echo off
setlocal
cd /d "%~dp0"
echo.
echo Publication COMPLETE du Dashboard Coach sur Firebase...
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
    echo deploy-dashboard-complet.cmd
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
set "FIREBASE_AUTH_ARGS="
if not "%FIREBASE_TOKEN%"=="" (
  set "FIREBASE_AUTH_ARGS=--token %FIREBASE_TOKEN%"
  echo Auth Firebase: FIREBASE_TOKEN detecte.
) else (
  echo Auth Firebase: session interactive Firebase CLI.
)

echo.
echo Prevol Firebase auth/secrets...
"%NODE_EXE%" "%~dp0tools\verify-firebase-auth-ready.cjs"
if errorlevel 1 (
  echo.
  echo Publication arretee: la session Firebase ou les secrets requis ne sont pas prets.
  echo.
  echo Pour reconnecter:
  echo firebase-login-dashboard.cmd
  echo.
  echo Puis relancer:
  echo deploy-dashboard-complet.cmd
  echo.
  call :maybe_pause
  exit /b 1
)

call "%~dp0verify-dashboard-before-deploy.cmd"
if errorlevel 1 (
  echo.
  echo Publication arretee: validation locale echouee.
  call :maybe_pause
  exit /b 1
)

set "FUNCTIONS_DISCOVERY_TIMEOUT=120"
set "DEPLOY_LOG=%~dp0firebase-deploy-last.log"

echo.
echo Verification finale des secrets Firebase requis...
call "%FIREBASE_BIN%" functions:secrets:describe GHL_PRIVATE_TOKEN --project cfsb-dashboard-coach-aa9a4 %FIREBASE_AUTH_ARGS% > nul 2>&1
if errorlevel 1 (
  set "MISSING_SECRET=GHL_PRIVATE_TOKEN"
  goto :missing_required_secret
)
echo Secret Firebase confirme: GHL_PRIVATE_TOKEN

call "%FIREBASE_BIN%" functions:secrets:describe DASHBOARD_IMPORT_TOKEN --project cfsb-dashboard-coach-aa9a4 %FIREBASE_AUTH_ARGS% > nul 2>&1
if errorlevel 1 (
  set "MISSING_SECRET=DASHBOARD_IMPORT_TOKEN"
  goto :missing_required_secret
)
echo Secret Firebase confirme: DASHBOARD_IMPORT_TOKEN

call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only hosting,functions,firestore:rules,firestore:indexes,storage %FIREBASE_AUTH_ARGS% > "%DEPLOY_LOG%" 2>&1
set "DEPLOY_CODE=%ERRORLEVEL%"
if exist "%DEPLOY_LOG%" (
  type "%DEPLOY_LOG%"
) else (
  echo Journal Firebase introuvable: %DEPLOY_LOG%
)
if not "%DEPLOY_CODE%"=="0" (
  echo.
  echo ECHEC DU DEPLOIEMENT COMPLET.
  echo.
  echo Journal: %DEPLOY_LOG%
  echo.
  echo Si Firebase demande une reconnexion, lance:
  echo firebase login --reauth
  echo.
  echo Pour un deploy non interactif, tu peux aussi definir FIREBASE_TOKEN
  echo dans le terminal avant de relancer ce script.
  echo.
  echo Si le deploy bloque sur les Functions, verifie aussi les permissions
  echo Cloud Build / Cloud Functions dans Google Cloud.
  echo.
  call :maybe_pause
  exit /b 1
)
findstr /i /c:"Cannot run login in non-interactive mode" /c:"Authentication Error" /c:"Deploys failed" /c:"There was an error deploying functions" /c:"Error:" "%DEPLOY_LOG%" > nul
if "%ERRORLEVEL%"=="0" (
  echo.
  echo ECHEC DU DEPLOIEMENT COMPLET.
  echo.
  echo Journal: %DEPLOY_LOG%
  echo.
  echo Si Firebase demande une reconnexion, lance:
  echo firebase login --reauth
  echo.
  echo Pour un deploy non interactif, tu peux aussi definir FIREBASE_TOKEN
  echo dans le terminal avant de relancer ce script.
  echo.
  echo Si le deploy bloque sur les Functions, verifie aussi les permissions
  echo Cloud Build / Cloud Functions dans Google Cloud.
  echo.
  call :maybe_pause
  exit /b 1
)

echo.
echo Validation live apres publication...
call "%~dp0verify-dashboard-live.cmd"
if errorlevel 1 (
  echo.
  echo Le deploy Firebase est termine, mais la validation live ne confirme pas encore la bonne version.
  echo Verifie le journal ci-dessus, puis relance verify-dashboard-live.cmd apres quelques secondes.
  call :maybe_pause
  exit /b 1
)
echo.
echo Termine. Recharge:
echo https://cfsb-dashboard-coach-aa9a4.web.app
echo.
echo Apres publication:
echo 1. Ouvre le dashboard.
echo 2. Va dans Guide.
echo 3. Lance Synchroniser tous les coachs.
echo 4. Valide Marc-Andre et Iheb dans Clients / To-do / Rebooking / Questionnaires / Performance.
echo.
call :maybe_pause
exit /b 0

:maybe_pause
if "%DASHBOARD_NO_PAUSE%"=="1" exit /b 0
pause
exit /b 0

:missing_required_secret
echo.
echo Secret Firebase requis introuvable ou inaccessible: %MISSING_SECRET%
echo.
echo Le deploy complet est arrete avant Functions pour eviter un echec long et confus.
echo.
echo Si le secret n'existe pas, cree-le avec:
echo firebase functions:secrets:set %MISSING_SECRET% --project cfsb-dashboard-coach-aa9a4
echo.
echo Pour DASHBOARD_IMPORT_TOKEN, ajoute ensuite la meme valeur dans les Script Properties Apps Script.
echo Pour GHL_PRIVATE_TOKEN, utilise le token prive GHL existant, sans le coller dans un fichier public.
echo.
echo Pour publier seulement le frontend pendant ce temps, utilise:
echo deploy-hosting-dashboard.cmd
echo.
call :maybe_pause
exit /b 1
