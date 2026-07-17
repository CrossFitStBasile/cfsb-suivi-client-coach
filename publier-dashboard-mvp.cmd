@echo off
setlocal
cd /d "%~dp0"
echo.
echo Publication MVP du Dashboard Coach CFSB...
echo.
echo Ce script fait le chemin le plus court pour rendre la version locale visible aux coachs:
echo 1. Reconnexion Firebase interactive si necessaire.
echo 2. Publication Hosting.
echo 3. Validation live stricte de la version publiee.
echo 4. Audit Firestore live en lecture seule.
echo.
echo Version locale attendue: 20260618-csm-global-enrichment
echo.

if "%FIREBASE_TOKEN%"=="" if not "%DASHBOARD_SKIP_LOGIN%"=="1" (
  call "%~dp0firebase-login-dashboard.cmd"
  if errorlevel 1 (
    echo.
    echo Arret: reconnexion Firebase incomplete.
    echo.
    echo Dans un terminal non interactif, relance avec:
    echo set DASHBOARD_SKIP_LOGIN=1
    echo publier-dashboard-mvp.cmd
    echo.
    echo Ou genere un token avec firebase-login-ci-token.cmd puis relance avec FIREBASE_TOKEN.
    call :maybe_pause
    exit /b 1
  )
) else (
  echo Reconnexion Firebase sautee: utilisation de la session existante ou de FIREBASE_TOKEN.
)

call "%~dp0deploy-hosting-dashboard.cmd"
if errorlevel 1 (
  echo.
  echo Arret: publication Hosting non confirmee.
  call :maybe_pause
  exit /b 1
)

echo.
echo Audit Firestore live apres publication...
call "%~dp0audit-live-firestore.cmd" --summary
if errorlevel 1 (
  echo.
  echo Le Hosting est publie, mais l'audit Firestore live n'est pas confirme.
  echo Relance audit-live-firestore.cmd apres avoir confirme la session Firebase.
  call :maybe_pause
  exit /b 1
)

echo.
echo MVP publie et audite.
echo.
echo Prochain controle equipe:
echo valider-dashboard-equipe.cmd
echo.
echo Prochain test humain:
echo 1. Ouvrir https://cfsb-dashboard-coach-aa9a4.web.app
echo 2. Verifier la version dans le menu de gauche.
echo 3. Utiliser la checklist et le kit:
echo C:\Users\micha\Documents\Codex\2026-06-10\je-reprends-le-projet-dashboard-coach\outputs\dashboard-coach-mvp-validation-checklist.md
echo C:\Users\micha\Documents\Codex\2026-06-10\je-reprends-le-projet-dashboard-coach\outputs\dashboard-coach-kit-lancement-interne.md
echo.
call :maybe_pause
exit /b 0

:maybe_pause
if "%DASHBOARD_NO_PAUSE%"=="1" exit /b 0
pause
exit /b 0
