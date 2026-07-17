@echo off
setlocal
cd /d "%~dp0"
set "FIREBASE_EXE=C:\Users\micha\Downloads\firebase-tools-instant-win.exe"

echo.
echo Ouverture de la console Firebase interactive...
echo Dossier dashboard: %cd%
echo.

if not exist "%FIREBASE_EXE%" (
  echo Impossible de trouver:
  echo %FIREBASE_EXE%
  echo.
  echo Reinstalle ou telecharge Firebase CLI, puis relance ce script.
  pause
  exit /b 1
)

start "" "%FIREBASE_EXE%"

echo Quand la fenetre Firebase affiche le prompt ^>, colle ces deux lignes:
echo.
echo cd "%cd%"
echo deploy-dashboard-complet.cmd
echo.
echo Le script de deploy relancera la validation locale puis verifiera le live automatiquement.
pause
exit /b 0
