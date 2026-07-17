Etat publication 2026-07-16: live restaure et confirme `20260715-firebase-questionnaire-suite`. Une ancienne copie du frontend, provenant du depot `cfsb-suivi-client-coach-live`, avait remplace Hosting le 16 juillet. Les donnees Firestore et les Functions n'ont pas ete modifiees pendant la restauration. Le depot officiel verifie maintenant sa provenance avant chaque deploy, et l'ancien depot bloque explicitement tout deploy Hosting du Dashboard Coach.

Source de publication officielle unique:

```text
C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo
```

Le controle `tools/verify-hosting-deploy-provenance.cjs` doit passer avant toute publication. Il confirme le projet, le site, le dossier public, la taille du bundle moderne, les fonctions mobiles essentielles et l'alignement du cache-buster. Ne jamais publier le Dashboard Coach depuis `cfsb-suivi-client-coach-live`; ce depot sert maintenant seulement de contexte historique et de projet Roadmap depuis son sous-dossier `firebase-roadmap`.

Etat live confirme: Hosting `app.js?v=20260715-firebase-questionnaire-suite`; frontend `APP_VERSION = 20260715-firebase-questionnaire-suite`. Le pipeline local passe et la verification live stricte passe 9/9. Pour une publication Hosting Google-only, produire un instantane prive, valider `cloudbuild.google-only-preview.yaml`, puis lancer `cloudbuild.google-only-live.yaml`. Pour un changement Functions/regles/indexes, conserver temporairement `deploy-dashboard-complet.cmd` jusqu'a la phase backend Google-only. Si Firebase exige une nouvelle session locale, utiliser `firebase login --reauth`.

## Pipeline Hosting Google-only

Le pipeline valide ne lit pas GitHub et n'utilise aucune cle de compte de service exportee.

1. Generer un instantane avec `tools/new-google-source-snapshot.ps1`.
2. Televerser l'archive et son manifeste dans `cfsb-dashboard-source-129233025317`.
3. Executer `cloudbuild.google-only.yaml` pour les contrats source et Functions.
4. Executer `cloudbuild.google-only-preview.yaml` avec le compte `dashboard-deployer@cfsb-dashboard-coach-aa9a4.iam.gserviceaccount.com`.
5. Verifier la previsualisation, `/questionnaire/` et `/questionnaire/coaches.json`.
6. Executer `cloudbuild.google-only-live.yaml` seulement apres cette validation.
7. Executer `verify-dashboard-live.cmd` apres la publication.

Preuve du 15 juillet 2026: preview `52274fe8-5a5e-4c48-b82b-1b2a7b41a340`, production `e36078a3-e63f-4c3e-8fbe-a0c83929b9da`, restauration 146/146 sans divergence, live 9/9 et Google-only 7/7.

Reference de compatibilite du pipeline historique: l'etat live courant verifie avant les passes du 12 juillet utilisait `app.js?v=20260707-coachrx-extraction-guard` et `APP_VERSION = 20260707-coachrx-extraction-guard`. Cette ligne demeure pour que les controles de reprise distinguent la base stable de la nouvelle cible candidate.

# Dashboard Coach CFSB - Runbook de publication Firebase

Date: 2026-06-11

Ce runbook sert a publier la version Firebase du Dashboard Coach sans refaire les erreurs de terminal deja rencontrees.

## Etat avant publication

Avant de publier, le pipeline local doit passer:

```cmd
cmd /c verify-dashboard-before-deploy.cmd
```

Dernier etat connu: 33/33 reussi, audit produit, audit MVP et contrat IA vocal prive inclus, avec `MIGRATION_READINESS.md` comme carte de migration Firebase et l'alignement sources inclus.

Avant d'activer une source externe directe, suivre aussi `firebase-dashboard/SOURCE_ACTIVATION_KIT.md`.
Verifier son statut courant dans `firebase-dashboard/SOURCE_ACTIVATION_STATUS.json`.

Dernier etat technique: 2026-06-09. La validation locale passe. Le repo peut maintenant utiliser une CLI Firebase locale cachee dans `%USERPROFILE%\.cache\cfsb-dashboard-tools\firebase-tools-clean`, avec un Node local force en tete du `PATH`. L'ancien executable `firebase-tools-instant-win.exe` reste utile pour ouvrir une console interactive, mais il ne doit pas etre utilise comme binaire automatise de deploy.

Etat live courant: Hosting sert `20260713-tablet-header-fit`. `verify-dashboard-live.cmd` passe strictement 9/9 et `audit-live-firestore.cmd --summary` confirme l'audit Firestore ainsi que les preuves anonymisees des huit parcours 5/5. Si Google retourne `invalid_rapt` lors d'une prochaine publication ou lecture Firestore, il faut refaire la reauth.

Correctif mission vocale du 9 juillet 2026: le frontend cible `20260709-voice-firestore-queue-mobile` decoupe l'audio en morceaux et les depose dans `voiceMissionChunks`, puis cree une demande privee dans `voiceMissionRequests`. La Function Firestore `processVoiceMissionRequest` assemble le vocal, valide le coach pilote, sauvegarde l'audio dans Storage, puis ecrit la mission avec `voiceNoteStatus = ready`. Cette architecture evite les endpoints HTTP publics bloques par IAM et empeche une mission vocale partielle. Les demandes sont lisibles seulement par leur auteur ou l'admin; les morceaux sont limites, verifies et supprimes apres traitement. Les regles Storage continuent de lire `users/{uid}` pour la lecture et la suppression depuis l'application; le compte `service-129233025317@firebase-rules.iam.gserviceaccount.com` doit conserver `roles/firebaserules.firestoreServiceAgent`. Le controle local `verify-voice-mission-contract.cjs` couvre la file privee, l'assemblage serveur, la modale mobile compacte et l'absence d'upload Storage direct dans le navigateur.

Exploitation produit du 12 juillet 2026: `scheduledWeeklyProductReport` genere un rapport prive chaque jeudi a 9 h, heure de Toronto. `processProductReportRequest` traite les demandes manuelles creees depuis Admin. Les collections `weeklyProductReports` et `productReportRequests` sont reservees a l'admin; les rapports ne copient aucun texte libre client. Toute modification de cette couche exige un deploy complet Functions + Firestore + Hosting et le controle `tools/verify-product-operations.cjs`.

Pilote IA admin prive, tranche R1 du 13 juillet 2026: `processAssistantRequest` traite les demandes creees uniquement par le compte admin `info@crossfitstbasilelegrand.com`. `processAssistantActionRequest` accepte uniquement une proposition `task.create` non expiree et explicitement confirmee. Le backend revalide l'identite, le coach, le client et les parametres, puis utilise un identifiant de mission deterministe pour eviter les doublons. Avant le deploy, confirmer que l'API Vertex AI est active dans `cfsb-dashboard-coach-aa9a4`. Le runtime utilise l'identite de service Google, jamais une cle publique. Le compte de service Functions doit conserver `roles/aiplatform.user`, `roles/firebaseauth.viewer` et son acces Firestore existant. Executer `tools/verify-assistant-admin-pilot.cjs`, `tools/request-live-assistant.cjs 15893`, puis `tools/request-live-assistant-task.cjs 15893`. Le dernier test cree une mission temporaire, verifie la preuve, puis nettoie tous les documents de test. Les autres comptes coach ne voient pas l'assistant.

Pilote IA vocal prive, tranche R2 live du 13 juillet 2026: `processAssistantVoiceRequest` traite uniquement les vocaux de `info@` depuis `+ Mission`. Les morceaux `assistantVoiceChunks` sont prives, bornes et supprimes apres traitement. La Function produit seulement une transcription, puis alimente le flux R1 existant; aucune mission n'est creee avant la carte de confirmation. Le texte et le formulaire manuel restent disponibles. `tools/verify-assistant-voice-pilot.cjs`, le pipeline local 33/33 et la verification live 9/9 sont confirmes. Un test vocal reel et une mission confirmee ont ete executes dans le contexte Gabriel, relus puis nettoyes. Ne pas activer l'interface pour un compte coach sans une decision produit explicite.

Le deploy complet lance maintenant un prevol rapide:

```cmd
tools\verify-firebase-auth-ready.cjs
```

Ce prevol confirme l'acces aux secrets `GHL_PRIVATE_TOKEN` et `DASHBOARD_IMPORT_TOKEN` avant de lancer la validation longue. Il utilise `firebase` si la commande existe, sinon la CLI locale cachee dans `%USERPROFILE%\.cache\cfsb-dashboard-tools\firebase-tools-clean`. Si la session Firebase est expiree, le deploy s'arrete avec la consigne `firebase-login-dashboard.cmd`.

Le script de deploy complet verifie maintenant les secrets requis avant de lancer Cloud Functions:

- `GHL_PRIVATE_TOKEN`, requis pour l'envoi questionnaire via GHL;
- `DASHBOARD_IMPORT_TOKEN`, requis pour le futur pont direct Apps Script / CoachRx / CSM / GHL vers Firestore.

Si un secret manque, le script s'arrete avant le deploy Functions. C'est voulu: l'echec est plus rapide et explique quoi faire au lieu de laisser Cloud Build echouer plus tard.

## Option A - Publication depuis un terminal deja connecte

Ouvrir un terminal dans ce dossier:

```cmd
cd /d "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
cmd /c publier-dashboard-mvp.cmd
```

`publier-dashboard-mvp.cmd` est le chemin recommande pour publier rapidement le MVP frontend: il lance la reconnexion Firebase, publie Hosting, valide la version live stricte, puis lance `audit-live-firestore.cmd --summary`.

Si le terminal est non interactif ou si Codex doit seulement tester la session existante sans ouvrir le login Google:

```cmd
set DASHBOARD_SKIP_LOGIN=1
cmd /c publier-dashboard-mvp.cmd
```

Ce mode ne remplace pas la reauth. Il sert seulement a verifier si la session Firebase locale est encore valide. Le 2026-06-11, la reauth interactive a ensuite permis de publier `20260612-rebooking-quiet-cards`.

Si un deploy complet est requis parce que `functions/index.js`, `firestore.rules` ou les indexes ont change et doivent absolument etre publies:

```cmd
cd /d "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
cmd /c deploy-dashboard-complet.cmd
```

Si Firebase demande une reconnexion:

```cmd
firebase login --reauth
cmd /c deploy-dashboard-complet.cmd
```

Le script `deploy-dashboard-complet.cmd` est le chemin principal. Le script `deploy-hosting-dashboard.cmd` existe seulement pour publier un correctif front-end sans toucher aux Functions, rules ou indexes. Les deux scripts valident le live apres publication.

Pour le MVP actuel `20260626-coach-permissions-accomplishments`, `publier-dashboard-mvp.cmd` est le raccourci le plus simple parce qu'il orchestre `firebase-login-dashboard.cmd`, `deploy-hosting-dashboard.cmd` et l'audit Firestore live.

Apres une publication reussie, confirmer que le dashboard peut passer en validation equipe:

```cmd
cmd /c valider-dashboard-equipe.cmd
```

Ce script ne publie rien. Il exige `verify-dashboard-live.cmd`, puis `audit-live-firestore.cmd --summary`, et rappelle le test humain minimal des 7 coachs pilotes: Iheb, Marc-Andre, David, Camille, Gabriel, Hugo et Raphael.

Si seul le frontend a change et que `DASHBOARD_IMPORT_TOKEN` n'est pas encore configure, utiliser:

```cmd
cmd /c deploy-hosting-dashboard.cmd
```

Si `firebase` n'est pas reconnu dans PowerShell ou `cmd.exe`, le script tente d'abord la CLI locale cachee:

```text
%USERPROFILE%\.cache\cfsb-dashboard-tools\firebase-tools-clean\node_modules\.bin\firebase.cmd
```

Si cette CLI locale est absente, ne lance pas `firebase-tools-instant-win.exe deploy`. Ouvre plutot:

```text
C:\Users\micha\Downloads\firebase-tools-instant-win.exe
```

Tu peux aussi double-cliquer:

```text
ouvrir-console-firebase.cmd
```

Ce script ouvre la console Firebase et affiche les deux commandes a coller.

Puis, dans le prompt Firebase qui apparait, lance:

```cmd
cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
deploy-dashboard-complet.cmd
```

## Option B - Publication non interactive avec token CI

Generer un token prive:

```cmd
cmd /c firebase-login-ci-token.cmd
```

Puis dans le meme terminal:

```cmd
set FIREBASE_TOKEN=COLLE_LE_TOKEN_ICI
cmd /c deploy-dashboard-complet.cmd
```

Avec `FIREBASE_TOKEN`, les scripts peuvent aussi utiliser la CLI Firebase locale cachee meme si la commande globale `firebase` n'est pas dans le `PATH`.

Ne jamais copier ce token dans un fichier public, GitHub Pages, GitHub, une capture d'ecran ou une conversation.

Regle pratique:

- si `firebase` est reconnu dans le terminal, lancer `deploy-dashboard-complet.cmd`;
- si `firebase` n'est pas reconnu, le script utilise la CLI locale cachee si elle existe;
- si la CLI locale cachee est absente, utiliser la console interactive `firebase-tools-instant-win.exe`;
- si `FIREBASE_TOKEN` est defini, ne jamais l'ecrire dans un fichier ou un document partage.

## Commandes a eviter

Eviter de coller directement des commandes PowerShell du type:

```powershell
& "C:\Users\micha\Downloads\firebase-tools-instant-win.exe" deploy ...
```

Si le terminal affiche `& etait inattendu`, c'est que la commande PowerShell a ete collee dans `cmd.exe`.

Utiliser plutot les scripts `.cmd` ci-dessus.

## Apres publication

Verifier d'abord le Hosting live:

```cmd
cmd /c verify-dashboard-live.cmd
```

Le deploy complet et le deploy Hosting lancent aussi cette verification automatiquement apres publication. Un deploy n'est pas considere pleinement valide tant que le live ne sert pas la version attendue du bundle `app.js`.

Si le deploy n'a pas encore ete refait et que seule la sante live doit etre verifiee sans exiger la nouvelle version locale:

```cmd
cmd /c verify-dashboard-live-stable.cmd
```

Etat attendu apres la prochaine publication de la version locale:

```text
app.js?v=20260626-coach-permissions-accomplishments
APP_VERSION = 20260626-coach-permissions-accomplishments
```

Ouvrir:

```text
https://cfsb-dashboard-coach-aa9a4.web.app
```

Puis verifier:

1. Connexion admin.
2. Liste des coachs.
3. Onglet Guide.
4. `Synchroniser tous les coachs`.
5. `syncRuns` et `coachSyncStatus`.
6. Marc-Andre et Iheb dans `Clients`.
7. To-do.
8. Questionnaires.
9. Rebooking.
10. Performance.
11. Alumni.
12. Dans `Questionnaires`, marquer une reponse comme `Lu` avec un compte coach proprietaire.

## Si la page charge mais reste vide

1. Vider la session depuis l'app.
2. Recharger avec Ctrl+F5.
3. Verifier Firebase Auth.
4. Verifier que le document `users/{uid}` existe dans Firestore.
5. Verifier les erreurs console.

## Si les coachs sont vides apres sync

Lire dans `Guide`:

- derniere sync;
- entetes detectees;
- audit du matching coach;
- clients sans telephone.

Ne pas modifier l'UX avant d'avoir confirme si la source contient vraiment des lignes exploitables pour ce coach.


