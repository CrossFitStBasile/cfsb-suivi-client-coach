@echo off
setlocal
cd /d "%~dp0"

if "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"=="" (
  echo STOP: CFSB_QUESTIONNAIRE_RELEASE_COMMIT est manquant.
  exit /b 1
)

set "NODE_RUNTIME=C:\Users\micha\.cache\cfsb-dashboard-tools\node-v22\node-v22.22.3-win-x64"
set "NODE_EXE=%NODE_RUNTIME%\node.exe"
set "JAVA_RUNTIME=C:\Users\micha\.cache\cfsb-dashboard-tools\phase1-firestore-emulator\java\jdk-21.0.11+10-jre"
set "FIREBASE_BIN=C:\Users\micha\.cache\cfsb-dashboard-tools\firebase-tools-clean\node_modules\.bin\firebase.cmd"
set "RULES_TEST_ROOT=%TEMP%\cfsb-questionnaire-rules-test-20260728"

if not exist "%NODE_EXE%" (
  echo STOP: runtime Node du canari de regles introuvable.
  exit /b 1
)
if not exist "%JAVA_RUNTIME%\bin\java.exe" (
  echo STOP: runtime Java du Firestore Emulator introuvable.
  exit /b 1
)
if not exist "%FIREBASE_BIN%" (
  echo STOP: Firebase CLI locale introuvable.
  exit /b 1
)
if not exist "%RULES_TEST_ROOT%\node_modules\@firebase\rules-unit-testing" (
  echo STOP: runtime temporaire @firebase/rules-unit-testing introuvable.
  exit /b 1
)

"%NODE_EXE%" "%~dp0tools\verify-sealed-questionnaire-release-worktree.cjs" "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"
if errorlevel 1 (
  echo STOP: le candidat scelle n'est pas confirme.
  exit /b 1
)

set "PATH=%NODE_RUNTIME%;%JAVA_RUNTIME%\bin;%PATH%"
set "JAVA_HOME=%JAVA_RUNTIME%"
set "CFSB_FIRESTORE_RULES_TEST_MODULE_ROOT=%RULES_TEST_ROOT%"
set "GCLOUD_PROJECT=demo-cfsb-questionnaire-rules"

pushd "%RULES_TEST_ROOT%"
call "%FIREBASE_BIN%" --config "%~dp0firebase.json" emulators:exec --only firestore --project demo-cfsb-questionnaire-rules "%NODE_EXE% %~dp0tools\run-questionnaire-firestore-rules-emulator-canary.cjs"
set "CANARY_CODE=%ERRORLEVEL%"
popd

if not "%CANARY_CODE%"=="0" (
  echo STOP: le canari Firestore Emulator a echoue.
  exit /b 1
)

echo.
echo PASS: regles questionnaire confirmees dans le Firestore Emulator.
echo Lie cette preuve au candidat avant A1:
echo set CFSB_QUESTIONNAIRE_RULES_EMULATOR_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
exit /b 0
