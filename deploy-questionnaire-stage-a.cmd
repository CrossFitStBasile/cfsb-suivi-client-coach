@echo off
setlocal
cd /d "%~dp0"

echo.
echo Questionnaire Studio - ETAPE A backend par sous-etapes
echo Dossier: %cd%
echo.

if defined CFSB_NODE_EXE (
  set "NODE_EXE=%CFSB_NODE_EXE%"
) else (
  set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "%NODE_EXE%" set "NODE_EXE=node"

if "%~1"=="" goto :usage
set "QUESTIONNAIRE_STAGE=%~1"

if /I not "%CFSB_QUESTIONNAIRE_RELEASE_GO%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: autorisation explicite manquante.
  echo.
  echo Apres le GO production, lance dans ce terminal:
  echo set CFSB_QUESTIONNAIRE_RELEASE_GO=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
  echo.
  exit /b 1
)

if /I not "%CFSB_COACH_NOTICE_CONFIRMED%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
  echo STOP: l'avis aux coachs n'est pas confirme.
  echo.
  echo Cette etape touche les regles ou des fonctions en usage.
  echo Envoie l'avis du runbook, puis confirme dans ce terminal:
  echo set CFSB_COACH_NOTICE_CONFIRMED=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
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

if /I "%QUESTIONNAIRE_STAGE%"=="rules" (
  if /I not "%CFSB_QUESTIONNAIRE_RULES_EMULATOR_OK%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
    echo STOP: le canari Firestore Emulator n'est pas confirme pour ce SHA.
    echo Lance run-questionnaire-firestore-rules-emulator-canary.cmd puis:
    echo set CFSB_QUESTIONNAIRE_RULES_EMULATOR_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
    exit /b 1
  )
  set "DEPLOY_ONLY=firestore:rules"
  set "LIVE_PREFLIGHT_ARGS="
  set "NEXT_PROOF=CFSB_QUESTIONNAIRE_RULES_CANARY_OK"
  goto :stage_selected
)

if /I "%QUESTIONNAIRE_STAGE%"=="additive" (
  if /I not "%CFSB_QUESTIONNAIRE_RULES_CANARY_OK%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
    echo STOP: confirme d'abord le Dashboard actuel, les trois liens historiques
    echo et une ecriture historique apres la sous-etape rules:
    echo set CFSB_QUESTIONNAIRE_RULES_CANARY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
    exit /b 1
  )
  set "DEPLOY_ONLY=functions:listQuestionnaireForms,functions:saveQuestionnaireDraft,functions:publishQuestionnaireForm,functions:setQuestionnaireDeliveryReady,functions:archiveQuestionnaireForm,functions:duplicateQuestionnaireForm,functions:questionnairePublicApi"
  set "LIVE_PREFLIGHT_ARGS="
  set "NEXT_PROOF=CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK"
  goto :stage_selected
)

if /I "%QUESTIONNAIRE_STAGE%"=="legacy" (
  if /I not "%CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
    echo STOP: confirme d'abord l'API, le catalogue et une soumission canari
    echo retrouvee par responseId apres la sous-etape additive:
    echo set CFSB_QUESTIONNAIRE_ADDITIVE_CANARY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
    exit /b 1
  )
  set "DEPLOY_ONLY=functions:sendQuestionnaire,functions:processQuestionnaireSendRequest,functions:scheduledQuestionnaireSendPlans"
  set "LIVE_PREFLIGHT_ARGS="
  set "NEXT_PROOF=CFSB_QUESTIONNAIRE_LEGACY_CANARY_OK"
  goto :stage_selected
)

if /I "%QUESTIONNAIRE_STAGE%"=="indexes" (
  if /I not "%CFSB_QUESTIONNAIRE_LEGACY_CANARY_OK%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
    echo STOP: confirme d'abord les canaris des trois fonctions historiques:
    echo set CFSB_QUESTIONNAIRE_LEGACY_CANARY_OK=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
    exit /b 1
  )
  set "DEPLOY_ONLY=firestore:indexes"
  set "LIVE_PREFLIGHT_ARGS=--protect-through-next-scheduler --require-safe-scheduler-window"
  goto :stage_selected
)

echo STOP: sous-etape inconnue "%QUESTIONNAIRE_STAGE%".
goto :usage

:stage_selected
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
echo Prevol live lecture seule des planifications...
"%NODE_EXE%" "%~dp0tools\preflight-questionnaire-stage-a-live.cjs" %LIVE_PREFLIGHT_ARGS%
if errorlevel 1 (
  echo STOP: le prevol live des planifications a echoue ferme.
  echo Aucun deploy Stage A lance.
  exit /b 1
)

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
call "%FIREBASE_BIN%" deploy --dry-run --project cfsb-dashboard-coach-aa9a4 --only "%DEPLOY_ONLY%" --non-interactive %FIREBASE_AUTH_ARGS% > "%DRY_RUN_LOG%" 2>&1
set "DRY_RUN_CODE=%ERRORLEVEL%"
if exist "%DRY_RUN_LOG%" type "%DRY_RUN_LOG%"
if not "%DRY_RUN_CODE%"=="0" (
  echo STOP: dry-run Firebase echoue. Aucun deploy lance.
  exit /b 1
)

if /I "%QUESTIONNAIRE_STAGE%"=="indexes" (
  if "%LOCALAPPDATA%"=="" (
    echo STOP: LOCALAPPDATA est indisponible; impossible de produire le recu
    echo local obligatoire de la premiere passe index.
    exit /b 1
  )
  set "INDEX_REVIEW_RECEIPT=%LOCALAPPDATA%\CFSB\questionnaire-release\index-dry-run-%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%.receipt"
  if not exist "%LOCALAPPDATA%\CFSB\questionnaire-release\index-dry-run-%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%.receipt" (
    if not exist "%LOCALAPPDATA%\CFSB\questionnaire-release" mkdir "%LOCALAPPDATA%\CFSB\questionnaire-release"
    > "%LOCALAPPDATA%\CFSB\questionnaire-release\index-dry-run-%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%.receipt" echo %CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
    if not exist "%LOCALAPPDATA%\CFSB\questionnaire-release\index-dry-run-%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%.receipt" (
      echo STOP: le recu local de premiere passe n'a pas pu etre cree.
      exit /b 1
    )
    echo.
    echo STOP: premiere invocation indexes terminee sans mutation.
    echo Un recu local lie au SHA a ete produit apres le dry-run reussi.
    echo La variable de revue, meme prepositionnee, ne peut jamais contourner
    echo cette premiere invocation.
    echo.
    echo Examine le journal de dry-run:
    echo %DRY_RUN_LOG%
    echo.
    echo Si le delta contient uniquement l'index questionnaireSchedules
    echo attendu, lie ensuite la revue au SHA et relance la commande.
    exit /b 1
  )
  setlocal EnableDelayedExpansion
  set "INDEX_REVIEW_RECEIPT_SHA="
  set /p INDEX_REVIEW_RECEIPT_SHA=<"%LOCALAPPDATA%\CFSB\questionnaire-release\index-dry-run-%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%.receipt"
  if /I not "!INDEX_REVIEW_RECEIPT_SHA!"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
    echo STOP: le recu local de premiere passe ne correspond pas au SHA scelle.
    endlocal
    exit /b 1
  )
  endlocal
  if /I not "%CFSB_QUESTIONNAIRE_INDEX_DRY_RUN_REVIEWED%"=="%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%" (
    echo.
    echo STOP: le recu de premiere passe existe, mais sa revue n'est pas
    echo confirmee pour le SHA scelle. Aucun index n'a ete publie.
    echo.
    echo Examine le journal de dry-run et confirme qu'il propose uniquement
    echo l'ajout de l'index questionnaireSchedules attendu, sans suppression
    echo ni autre changement:
    echo %DRY_RUN_LOG%
    echo.
    echo Si cette revue humaine est concluante, lie la preuve au SHA scelle:
    echo set CFSB_QUESTIONNAIRE_INDEX_DRY_RUN_REVIEWED=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
    echo.
    echo Relance ensuite cette meme commande. La seconde invocation repetera
    echo tous les prevols, le dry-run et la preuve du worktree scelle avant
    echo toute mutation.
    exit /b 1
  )
)

echo.
echo Second prevol live immediatement avant la mutation Stage A...
"%NODE_EXE%" "%~dp0tools\preflight-questionnaire-stage-a-live.cjs" %LIVE_PREFLIGHT_ARGS%
if errorlevel 1 (
  echo STOP: l'etat live a change apres le dry-run.
  echo Aucun deploy Stage A lance.
  exit /b 1
)

echo.
echo Confirmation finale du candidat scelle avant mutation...
"%NODE_EXE%" "%~dp0tools\verify-sealed-questionnaire-release-worktree.cjs" "%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%"
if errorlevel 1 (
  echo STOP: le candidat a change depuis le dry-run. Aucun deploy lance.
  exit /b 1
)

echo.
echo Publication de la sous-etape "%QUESTIONNAIRE_STAGE%" seulement...
call "%FIREBASE_BIN%" deploy --project cfsb-dashboard-coach-aa9a4 --only "%DEPLOY_ONLY%" --non-interactive %FIREBASE_AUTH_ARGS% > "%DEPLOY_LOG%" 2>&1
set "DEPLOY_CODE=%ERRORLEVEL%"
if exist "%DEPLOY_LOG%" type "%DEPLOY_LOG%"
if not "%DEPLOY_CODE%"=="0" goto :deploy_failed
findstr /i /c:"Cannot run login in non-interactive mode" /c:"Authentication Error" /c:"Deploys failed" /c:"There was an error deploying functions" /c:"Error:" "%DEPLOY_LOG%" > nul
if not errorlevel 1 goto :deploy_failed

if /I "%QUESTIONNAIRE_STAGE%"=="legacy" (
  echo.
  echo Enregistrement des revisions live A3 liees au SHA scelle...
  "%NODE_EXE%" "%~dp0tools\questionnaire-function-revision-receipt.cjs" --release-commit=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT% --record
  if errorlevel 1 goto :revision_receipt_failed
)

echo.
echo Sous-etape "%QUESTIONNAIRE_STAGE%" publiee. ARRET HUMAIN OBLIGATOIRE.
echo Execute les canaris correspondants du runbook avant toute sous-etape suivante.
if /I "%QUESTIONNAIRE_STAGE%"=="indexes" goto :indexes_published
echo Quand les preuves sont conservees, confirme:
echo set %NEXT_PROOF%=%CFSB_QUESTIONNAIRE_RELEASE_COMMIT%
echo.
if /I "%QUESTIONNAIRE_STAGE%"=="legacy" (
  echo Ne lance Stage B qu'apres un envoi et une planification historiques
  echo verifies avant/apres, puis un canari du nouveau pipeline.
) else (
  echo Ne lance pas automatiquement la sous-etape suivante.
)
exit /b 0

:indexes_published
echo.
echo La creation de l'index est demandee, mais Stage A N'EST PAS verifiee.
echo Attends l'etat READY, puis relance le controle lecture seule exact:
echo call "%~dp0verify-questionnaire-stage-a-index-ready.cmd"
echo.
echo Ensuite, execute les canaris scheduler du runbook. Ne definis
echo CFSB_QUESTIONNAIRE_STAGE_A_VERIFIED qu'apres les preuves index READY,
echo zero suivi actif du et zero envoi inattendu.
exit /b 0

:deploy_failed
echo.
echo ECHEC STAGE A "%QUESTIONNAIRE_STAGE%". N'EXECUTE PAS l'etape suivante.
echo Journal: %DEPLOY_LOG%
echo Applique le retour arriere correspondant du runbook avant de lever l'avis coach.
exit /b 1

:revision_receipt_failed
echo.
echo STOP: A3 est publiee, mais le recu des revisions live n'a pas pu etre
echo lie au SHA scelle. N'EXECUTE AUCUN canari et ne poursuis pas vers A4.
echo Garde l'avis coach actif et examine les revisions Cloud Functions.
exit /b 1

:usage
echo Usage:
echo   deploy-questionnaire-stage-a.cmd rules
echo   deploy-questionnaire-stage-a.cmd additive
echo   deploy-questionnaire-stage-a.cmd legacy
echo   deploy-questionnaire-stage-a.cmd indexes
echo.
echo Ordre obligatoire:
echo rules, canari, additive, canari, legacy, canari, indexes, READY, canaris.
exit /b 1
