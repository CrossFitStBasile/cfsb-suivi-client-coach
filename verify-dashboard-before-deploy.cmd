@echo off
setlocal
cd /d "%~dp0"
echo.
echo Validation locale du Dashboard Coach avant publication...
echo Dossier: %cd%
echo.

set "NODE_EXE=C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

echo 1/32 Syntaxe backend Firebase Functions...
"%NODE_EXE%" --check "functions\index.js"
if errorlevel 1 goto fail

echo.
echo 2/32 Syntaxe frontend Firebase Dashboard...
"%NODE_EXE%" --check "firebase-dashboard\public\app.js"
if errorlevel 1 goto fail

echo.
echo 2b/35 Provenance du bundle Hosting officiel...
"%NODE_EXE%" "tools\verify-hosting-deploy-provenance.cjs"
if errorlevel 1 goto fail

echo.
echo 3/32 Tests helpers import Firestore...
"%NODE_EXE%" "tools\verify-firebase-sync-helpers.cjs"
if errorlevel 1 goto fail

echo.
echo 4/32 Tests logique relance questionnaire...
"%NODE_EXE%" "tools\verify-questionnaire-followup-logic.cjs"
if errorlevel 1 goto fail

echo.
echo 5/34 Lecture structuree et complete des questionnaires...
"%NODE_EXE%" "tools\verify-questionnaire-reading.cjs"
if errorlevel 1 goto fail

echo.
echo 5/32 Tests workflows dashboard...
"%NODE_EXE%" "tools\verify-dashboard-workflows.cjs"
if errorlevel 1 goto fail

echo.
echo 6/32 Couverture actions, formulaires et filtres UI...
"%NODE_EXE%" "tools\verify-dashboard-actions.cjs"
if errorlevel 1 goto fail

echo.
echo 7/32 Couverture collections Firestore / regles...
"%NODE_EXE%" "tools\verify-firestore-coverage.cjs"
if errorlevel 1 goto fail

echo.
echo 8/32 Contrat pont Apps Script vers Firebase...
"%NODE_EXE%" "tools\verify-direct-import-bridge.cjs"
if errorlevel 1 goto fail

echo.
echo 9/32 File Firestore privee pour sources Apps Script...
"%NODE_EXE%" "tools\verify-firestore-source-queue.cjs"
if errorlevel 1 goto fail

echo.
echo 10/32 Contrat source de verite / donnees...
"%NODE_EXE%" "tools\verify-source-truth-contract.cjs"
if errorlevel 1 goto fail

echo.
echo 11/32 Registre officiel des sources...
"%NODE_EXE%" "tools\verify-source-registry.cjs"
if errorlevel 1 goto fail

echo.
echo 12/32 Plan technique d'ingestion...
"%NODE_EXE%" "tools\verify-ingestion-plan.cjs"
if errorlevel 1 goto fail

echo.
echo 13/32 Matrice d'activation des sources...
"%NODE_EXE%" "tools\verify-source-activation-matrix.cjs"
if errorlevel 1 goto fail

echo.
echo 14/32 Prevol template Apps Script...
"%NODE_EXE%" "tools\verify-apps-script-bridge-preflight.cjs"
if errorlevel 1 goto fail

echo.
echo 15/32 Contrats payload sources...
"%NODE_EXE%" "tools\verify-source-payload-contracts.cjs"
if errorlevel 1 goto fail

echo.
echo 16/32 Kit d'activation source par source...
"%NODE_EXE%" "tools\verify-source-activation-kit.cjs"
if errorlevel 1 goto fail

echo.
echo 17/32 Statut d'activation source par source...
"%NODE_EXE%" "tools\verify-source-activation-status.cjs"
if errorlevel 1 goto fail

echo.
echo 18/32 Acces coachs pilotes...
"%NODE_EXE%" "tools\verify-pilot-coach-access.cjs"
if errorlevel 1 goto fail

echo.
echo 19/32 Readiness migration Firebase...
"%NODE_EXE%" "tools\verify-migration-readiness.cjs"
if errorlevel 1 goto fail

echo.
echo 20/32 Alignement Bob Operator / sources Google Workspace...
"%NODE_EXE%" "tools\verify-bob-source-alignment.cjs"
if errorlevel 1 goto fail

echo.
echo 21/32 Contrat Firebase deployable...
"%NODE_EXE%" "tools\verify-firebase-deploy-contract.cjs"
if errorlevel 1 goto fail

echo.
echo 22/32 Scripts de publication et exploitation...
"%NODE_EXE%" "tools\verify-deploy-scripts.cjs"
if errorlevel 1 goto fail

echo.
echo 23/32 Smoke test Hosting local...
"%NODE_EXE%" "tools\verify-hosting-smoke.cjs"
if errorlevel 1 goto fail

echo.
echo 24/32 Audit produit Dashboard Coach...
"%NODE_EXE%" "tools\verify-dashboard-product-audit.cjs"
if errorlevel 1 goto fail

echo.
echo 25/32 Readiness MVP equipe...
"%NODE_EXE%" "tools\verify-dashboard-mvp-readiness.cjs"
if errorlevel 1 goto fail

echo.
echo 26/32 Contrat mission vocale serveur et modale mobile...
"%NODE_EXE%" "tools\verify-voice-mission-contract.cjs"
if errorlevel 1 goto fail

echo.
echo 27/32 Contrat annonces de mise a jour...
"%NODE_EXE%" "tools\verify-update-announcements.cjs"
if errorlevel 1 goto fail

echo.
echo 28/32 Documentation et handoff alignes...
"%NODE_EXE%" "tools\verify-dashboard-docs-current-state.cjs"
if errorlevel 1 goto fail

echo.
echo 29/32 Enrichissement assiduite et Level Method clients...
"%NODE_EXE%" "tools\verify-client-training-enrichment.cjs"
if errorlevel 1 goto fail

echo.
echo 30/32 Densite operationnelle To-do, Suivis et Rebooking...
"%NODE_EXE%" "tools\verify-operational-density.cjs"
if errorlevel 1 goto fail

echo.
echo 31/32 Exploitation produit, rapport hebdomadaire et automatisations candidates...
"%NODE_EXE%" "tools\verify-product-operations.cjs"
if errorlevel 1 goto fail

echo.
echo 32/33 Assistant IA admin prive, confirmation mission et securite...
"%NODE_EXE%" "tools\verify-assistant-admin-pilot.cjs"
if errorlevel 1 goto fail

echo.
echo 33/33 Mission IA vocale privee, transcription temporaire et confirmation...
"%NODE_EXE%" "tools\verify-assistant-voice-pilot.cjs"
if errorlevel 1 goto fail

echo.
echo 34/35 Formulaires Firebase Check-in et Evaluation habitudes de vie...
"%NODE_EXE%" "tools\verify-firebase-questionnaire-forms.cjs"
if errorlevel 1 goto fail

echo.
echo 35/35 Dependances Google-only et liens formulaires stables...
"%NODE_EXE%" "tools\verify-google-only-readiness.cjs"
if errorlevel 1 goto fail

echo.
echo Validation locale reussie.
exit /b 0

:fail
echo.
echo ECHEC DE VALIDATION. Corrige les erreurs avant de deployer.
exit /b 1


