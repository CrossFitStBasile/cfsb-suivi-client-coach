@echo off
setlocal
cd /d "%~dp0"
echo.
echo Validation equipe du Dashboard Coach CFSB...
echo.
echo Ce script ne publie rien. Il confirme seulement si la version live peut etre testee avec les coachs:
echo 1. Validation Hosting live stricte.
echo 2. Audit Firestore live en lecture seule.
echo 3. Rappel du test humain minimal.
echo.

call "%~dp0verify-dashboard-live.cmd"
if errorlevel 1 (
  echo.
  echo Arret: le live ne sert pas encore la bonne version ou les assets publics ne sont pas sains.
  echo Publie d'abord avec publier-dashboard-mvp.cmd.
  call :maybe_pause
  exit /b 1
)

echo.
echo Audit Firestore live...
call "%~dp0audit-live-firestore.cmd" --summary
if errorlevel 1 (
  echo.
  echo Arret: impossible de confirmer les donnees Firestore live.
  echo Reconnecte Firebase avec firebase-login-dashboard.cmd, puis relance ce script.
  call :maybe_pause
  exit /b 1
)

echo.
echo Validation technique live terminee.
echo.
echo Validation humaine minimale avant annonce equipe:
echo 1. Iheb: To-do chargee, actions reelles, portefeuille plausible.
echo 2. Marc-Andre: portefeuille visible meme si To-do vide ou presque.
echo 3. David: Performance/check-ups plausibles sur 7 jours, 30 jours et mois courant.
echo 4. Camille: petit portefeuille et peu d'actions plausibles.
echo 5. Gabriel: questionnaires et suivis plausibles.
echo 6. Hugo: clients sans telephone et rebooking a verifier.
echo 7. Raphael: portefeuille, rebooking et enrichissements plausibles.
echo.
echo Criteres No-Go:
echo - un coach voit clairement le portefeuille d'un autre coach;
echo - une To-do testee est technique ou incomprehensible;
echo - Performance affiche un chiffre absurde sur les periodes testees;
echo - un bouton principal bloque le flux coach.
echo.
echo Checklist terrain:
echo C:\Users\micha\Documents\Codex\2026-06-10\je-reprends-le-projet-dashboard-coach\outputs\dashboard-coach-mvp-validation-checklist.md
echo.
call :maybe_pause
exit /b 0

:maybe_pause
if "%DASHBOARD_NO_PAUSE%"=="1" exit /b 0
pause
exit /b 0
