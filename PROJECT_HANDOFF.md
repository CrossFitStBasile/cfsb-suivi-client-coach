Etat publication 2026-06-12: live confirme `20260618-csm-global-enrichment`; Hosting publie et valide; prochaine limite: validation humaine des coachs pilotes et parite Rebooking legacy.

# PROJECT_HANDOFF - Dashboard Coach CFSB

Derniere mise a jour: 2026-07-13

## Etat live le plus recent - Commandes To-do et IA mission vocale privee

- Version live: `20260713-todo-followups-command` sur `https://cfsb-dashboard-coach-aa9a4.web.app`.
- La To-do conserve cinq commandes sur une seule rangee mobile: Actions, Rebooking, Impacts, Check-ups et A lire.
- Urgent a ete retire de cette barre seulement; les missions urgentes restent triees et filtrables dans la To-do.
- A lire compte les reponses questionnaire `to_read/assigned`; le clic ouvre directement Suivi sur la vue A lire avec la recherche reinitialisee.
- Le pilote est visible uniquement pour le compte Firebase Auth exact `info@crossfitstbasilelegrand.com`; aucun compte coach ne voit cette interface.
- Premier contexte d'acceptation: Gabriel Mayer-Bedard, CoachRx `15893`.
- Dans `+ Mission`, l'admin peut parler directement. Le navigateur depose des morceaux audio temporaires dans une file Firestore privee.
- `processAssistantVoiceRequest` assemble et transcrit cote serveur, supprime l'audio brut, puis transmet uniquement la transcription au flux IA existant.
- L'IA prepare une carte editable avec client, titre, details, priorite et date. Elle ne cree jamais la mission elle-meme.
- Une mission est ecrite seulement apres `Confirmer et creer`, puis `processAssistantActionRequest` revalide l'identite, les droits, la proposition et l'idempotence.
- Le formulaire manuel et la demande texte restent disponibles comme solutions de repli.
- Validation technique terminee: pipeline local 33/33, verification live stricte 9/9 et trois Functions IA actives (`processAssistantVoiceRequest`, `processAssistantRequest`, `processAssistantActionRequest`).
- Validation restante: un essai humain au microphone avec `info@` dans le contexte Gabriel, incluant verification de la carte avant confirmation et nettoyage de la mission de test.

Regle de deploiement: ne pas ouvrir cette fonction aux coachs avant une decision explicite de Michael apres l'acceptation terrain.

Ce document sert a transferer le projet Dashboard Coach CFSB dans une nouvelle conversation Codex sans perdre le fil. Il resume les fichiers, les decisions, l'etat actuel, les zones floues et les prochaines priorites.

## Decisions recentes - 2026-06-11

- Questionnaires: l'envoi GHL fonctionne par file Firestore (`questionnaireSends`) et non par appel callable direct, car l'organisation Google bloque les invocations Cloud Run publiques. La reponse test de Michael Grondin a ete recue, importee et classee `to_read` apres sync.
- Reponses questionnaire: une sync planifiee aux 15 minutes importe les nouvelles reponses depuis le Sheet questionnaire vers Firestore. Le prochain niveau serait un push direct Apps Script -> `syncRequests` si on veut du quasi instantane.
- Rebooking: le module doit etre pense comme une liste de **seances payees a remettre**, pas comme un journal d'annulations. La date d'annulation est du contexte; l'action coach est de s'assurer que le client consomme la seance et que l'entraineur ferme le suivi.

## 1. Inventaire des documents et fichiers associes

### Application Firebase actuelle

- `firebase-dashboard/public/index.html`  
  Point d'entree public du dashboard Firebase.
- `firebase-dashboard/public/app.js`  
  Logique frontend principale. Version live actuelle: `20260618-csm-global-enrichment`.
- `firebase-dashboard/public/styles.css`  
  Styles de l'application Firebase.
- `firebase.json`  
  Configuration Firebase Hosting, Functions et rewrites.
- `firestore.rules`  
  Regles de securite Firestore.
- `firestore.indexes.json`  
  Index Firestore requis pour les requetes live.
- `functions/index.js`  
  Backend Firebase Functions: envoi questionnaire, synchronisation, ingestion sources, traitements programmables.
  - `processQuestionnaireSendRequest`: traite les demandes d'envoi questionnaire creees dans `questionnaireSends`, sans appel Cloud Run public.
  - `scheduledQuestionnaireResponseSync`: importe les nouvelles reponses questionnaire aux 15 minutes.
- `functions/package.json`
- `functions/package-lock.json`

### Scripts de deploy et validation

- `firebase-login-dashboard.cmd`  
  Reconnexion Firebase CLI.
- `publier-dashboard-mvp.cmd`  
  Chemin recommande maintenant: prevol auth, deploy Hosting MVP, validation live stricte, audit Firestore.
- `valider-dashboard-equipe.cmd`  
  Controle post-publication: live strict, audit Firestore, rappel validation humaine des 7 coachs pilotes.
- `deploy-dashboard-complet.cmd`  
  Validation locale, deploy Hosting/Functions/Firestore, validation live. A utiliser si Functions, rules ou indexes changent.
- `deploy-hosting-dashboard.cmd`
- `deploy-hosting-api.cmd`
- `verify-dashboard-before-deploy.cmd`
- `verify-dashboard-live.cmd`
- `audit-live-firestore.cmd`
- `tools/verify-dashboard-before-deploy.cjs`
- `tools/verify-dashboard-live.cjs`
- `tools/audit-live-firestore.cjs`
- `tools/verify-dashboard-*.cjs`
- `tools/seed-*.cjs`
- `tools/*source*.cjs`

### Documentation Firebase / data

- `firebase-dashboard/README.md`
- `firebase-dashboard/DATA_MODEL.md`
- `firebase-dashboard/DATA_SYNC_ARCHITECTURE.md`
- `firebase-dashboard/DATA_OPERATING_PLAN.md`
- `firebase-dashboard/DATA_INGESTION_PLAN.md`
- `firebase-dashboard/DATA_SOURCE_ACTIVATION_MATRIX.md`
- `firebase-dashboard/SOURCE_REGISTRY.json`
- `firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json`
- `firebase-dashboard/SOURCE_PAYLOAD_PLAYBOOK.md`
- `firebase-dashboard/SOURCE_PAYLOAD_SAMPLES.json`
- `firebase-dashboard/SOURCE_ACTIVATION_STATUS.json`
- `firebase-dashboard/SOURCE_ACTIVATION_KIT.md`
- `firebase-dashboard/SOURCE_OF_TRUTH_AUDIT.md`
- `firebase-dashboard/SOURCE_CONNECTION_ANALYSIS.md`
- `firebase-dashboard/SOURCE_CONNECTION_ANALYSIS.json`
- `firebase-dashboard/SOURCE_CONNECTION_AUDIT.md`
- `firebase-dashboard/SOURCE_CONNECTION_AUDIT.json`
- `firebase-dashboard/MIGRATION_READINESS.md`
- `firebase-dashboard/FINALIZATION_BOARD.md`
- `firebase-dashboard/NEXT_WORK_QUEUE.md`
- `firebase-dashboard/PILOT_RELEASE_STATUS.md`
- `firebase-dashboard/PILOT_VALIDATION_CHECKLIST.md`
- `firebase-dashboard/PILOT_HANDOFF.md`
- `firebase-dashboard/PILOT_COACH_ACCESS.json`

### Apps Script / sources externes

- `firebase-dashboard/apps-script/dashboard-live-source-adapters.gs`
- `firebase-dashboard/apps-script/dashboard-firestore-sync-request-queue.gs`
- `firebase-dashboard/apps-script/dashboard-import-bridge-template.gs`
- `firebase-dashboard/apps-script/dashboard-csm-firestore-bridge.gs`
- `firebase-dashboard/apps-script/dashboard-csm-daily-firestore-sync.gs`

Decision CSM actuelle:

- CSM est la source de verite pour membership actif, telephone et contexte check-up.
- CSM ne determine pas le portefeuille coach; CoachRx et les actions manuelles restent responsables de cette association.
- La sync CSM -> Firebase est separee du script qui met a jour le document CSM. Le scheduler quotidien appelle seulement le bridge CSM vers `syncRequests`.
- `firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md`
- `firebase-dashboard/COACHRX_EXTENSION_FIRESTORE_BRIDGE.md`
- `firebase-dashboard/BOB_OPERATOR_SOURCE_HANDOFF.md`

### Ancien dashboard / prototype GitHub Pages

- `dashboard/live.html`
- `dashboard/app.js`
- `dashboard/app-*.js`
- `dashboard/styles.css`
- `dashboard/README.md`
- `dashboard/data/index.json`
- `dashboard/MEMOIRE-TACHES-DASHBOARD-COACH-CFSB.md`
- `dashboard/scripts/refresh-dashboard-snapshots.mjs`

### Documents historiques a la racine du workspace

Ces fichiers sont a l'exterieur du repo `generated/github-pages-repo`, dans le dossier parent du projet:

- `ARCHITECTURE-DONNEES-DASHBOARD-COACH-CFSB.md`
- `CONTRAT-INTEGRATION-QUESTIONNAIRE-DASHBOARD-COACH-CFSB.md`
- `directives-dashboard-coachs-cfsb.md`
- `GUIDE-MAJ-COACHRX-DASHBOARD.md`
- `MEMOIRE-TACHES-DASHBOARD-COACH-CFSB.md`
- `PASSATION-VIVANTE-QUESTIONNAIRE-DASHBOARD-CFSB.md`
- `PLAN-TRANSITION-GITHUB-DASHBOARD-COACH-CFSB.md`
- `PROCEDURE-PILOTE-MARC-ANDRE-IHEB.md`
- `QUESTIONNAIRE-DASHBOARD-INBOX-CONTRACT.md`
- `ROADMAP-DASHBOARD-COACH-CFSB.md`
- `run-coachrx-diagnostic.ps1`
- `run-coachrx-login.ps1`
- `run-coachrx-sync-dashboard.ps1`

## 2. Documents essentiels

Ces fichiers doivent etre consideres comme la source de travail principale.

### Code essentiel

- `firebase-dashboard/public/app.js`
- `firebase-dashboard/public/index.html`
- `firebase-dashboard/public/styles.css`
- `functions/index.js`
- `functions/package.json`
- `functions/package-lock.json`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`

### Documentation essentielle

- `firebase-dashboard/README.md`  
  Vue d'ensemble Firebase V1, URL live, commandes et acces coach.
- `firebase-dashboard/DATA_SYNC_ARCHITECTURE.md`  
  Decision centrale: Firestore est la base operationnelle, les sources externes alimentent Firestore.
- `firebase-dashboard/DATA_MODEL.md`  
  Collections Firestore et champs attendus.
- `firebase-dashboard/SOURCE_REGISTRY.json`  
  Registre des sources, contrats, priorites de matching et zones ouvertes.
- `firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json`  
  Contrats attendus pour les payloads d'import.
- `firebase-dashboard/DATA_INGESTION_PLAN.md`  
  Plan technique d'ingestion vers Firestore.
- `firebase-dashboard/DATA_OPERATING_PLAN.md`  
  Mode operationnel cible.
- `firebase-dashboard/DEPLOY_RUNBOOK.md`  
  Procedure de publication et validation.
- `firebase-dashboard/PILOT_COACH_ACCESS.json`  
  Acces pilote des coachs.

### Scripts essentiels

- `deploy-dashboard-complet.cmd`
- `verify-dashboard-before-deploy.cmd`
- `verify-dashboard-live.cmd`
- `audit-live-firestore.cmd`
- `firebase-login-dashboard.cmd`
- `firebase-dashboard/apps-script/dashboard-live-source-adapters.gs`
- `firebase-dashboard/apps-script/dashboard-firestore-sync-request-queue.gs`

## 3. Documents secondaires

Ces documents sont utiles, mais ne doivent pas dicter l'architecture sans verification.

- `firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md`
- `firebase-dashboard/COACHRX_EXTENSION_FIRESTORE_BRIDGE.md`
- `firebase-dashboard/BOB_OPERATOR_SOURCE_HANDOFF.md`
- `firebase-dashboard/PILOT_VALIDATION_CHECKLIST.md`
- `firebase-dashboard/PILOT_HANDOFF.md`
- `firebase-dashboard/FINALIZATION_BOARD.md`
- `firebase-dashboard/MIGRATION_READINESS.md`
- `firebase-dashboard/SOURCE_OF_TRUTH_AUDIT.md`
- `firebase-dashboard/SOURCE_CONNECTION_ANALYSIS.md`
- `firebase-dashboard/SOURCE_CONNECTION_AUDIT.md`
- `firebase-dashboard/SOURCE_PAYLOAD_PLAYBOOK.md`
- `firebase-dashboard/SOURCE_PAYLOAD_SAMPLES.json`
- `firebase-dashboard/QUESTIONNAIRE_APPS_SCRIPT_DEPLOYMENT.json`
- `firebase-dashboard/QUESTIONNAIRE_FIRESTORE_QUEUE_ACTIVATION.json`
- `firebase-dashboard/WEEKEND_WORK_LOG.md`
- `roadmap/*`
- `tests/dashboard_smoke.py`
- les anciens documents a la racine du workspace

## 4. Documents obsoletes ou contradictoires

Ces fichiers peuvent contenir de bonnes idees, mais ils ne representent plus forcement l'etat actuel.

- `firebase-dashboard/PILOT_RELEASE_STATUS.md`  
  Historique seulement. Ne pas l'utiliser comme source de verite courante.
- `firebase-dashboard/NEXT_WORK_QUEUE.md`  
  Backlog historique seulement. Le board courant est `FINALIZATION_BOARD.md`; les livrables MVP sont dans le dossier `outputs` de la conversation du 2026-06-10.
- `README.md` a la racine du repo  
  Melange le prototype questionnaire GitHub Pages original et le dashboard Firebase. Utile pour l'historique, mais pas source de verite.
- `dashboard/app-*.js`, `dashboard/live.html`, `dashboard/data/index.json`  
  Ancien prototype GitHub Pages. Reference UX/fonctionnelle possible, mais ne doit pas etre modifie comme app principale.
- Documents racine de mai 2026: `ROADMAP-*`, `PLAN-TRANSITION-*`, `ARCHITECTURE-*`, `MEMOIRE-*`, `PROCEDURE-*`, etc.  
  Utiles pour comprendre l'intention originale, mais plusieurs decisions ont evolue depuis le passage a Firebase.
- Tout document qui dit que Google Sheets est l'application operationnelle principale.  
  Decision actuelle: Google Sheets peut rester source, backup, audit ou outil de transition, mais Firestore est la base operationnelle du dashboard.

## 5. Etat actuel du projet

Le Dashboard Coach CFSB est maintenant en migration vers Firebase.

URL live:

`https://cfsb-dashboard-coach-aa9a4.web.app`

Etat technique connu:

- Firebase Hosting fonctionne.
- Firebase Auth fonctionne pour le compte admin/pilote.
- Firestore est utilise comme base operationnelle.
- Firebase Functions est deploye.
- Les secrets Firebase requis incluent au minimum:
  - `GHL_PRIVATE_TOKEN`
  - `DASHBOARD_IMPORT_TOKEN`
- Le live actuel sert `20260618-csm-global-enrichment`.
- `valider-dashboard-equipe.cmd` passe techniquement: live strict + audit Firestore live.
- `verify-dashboard-before-deploy.cmd` passe 26/26.
- `tools/verify-dashboard-product-audit.cjs` passe 74/74.
- `tools/verify-dashboard-mvp-readiness.cjs` passe 12/12.
- `verify-dashboard-live.cmd` passe `9/9`.
- Le deploy Hosting MVP a ete publie apres reconnexion Firebase CLI interactive.

Etat fonctionnel connu:

- Le dashboard charge plus vite que l'ancienne version Apps Script.
- La navigation principale existe:
  - To-do
  - Clients
  - Questionnaires
  - Rebooking
  - Performance
  - Alumni
  - Guide
- Les 7 coachs pilotes sont couverts par les validations: Marc-Andre, Iheb, Camille, David, Gabriel, Hugo et Raphael.
- Les imports peuvent creer des clients, taches, rebookings, check-ups et statuts de sync.
- La To-do a ete corrigee pour eviter de creer des fausses taches a partir du simple contexte CoachRx.
- CoachRx doit alimenter le portefeuille client et le contexte programme.
- Une carte To-do programme doit apparaitre seulement si une source d'action existe vraiment:
  - `TASKS_Current`
  - questionnaire
  - rebooking
  - note coach
  - ou un signal explicite CoachRx valide comme programme du/en retard.
- La lecture/matching des clients par variantes de `coachId`, `coachRxId`, `assignedCoachId`, nom de coach et telephone normalise est couverte localement.
- La derniere passe locale cache davantage les diagnostics techniques aux coachs, simplifie les erreurs, reserve l'ID CoachRx a l'admin et reduit le bruit visuel des boutons de cartes.

Problemes / preuves encore manquantes:

- Valider humainement les 7 coachs pilotes dans l'app publiee.
- Confirmer que la To-do vide de Marc-Andre est normale, pas une erreur d'import.
- Valider les actions To-do d'Iheb et les exceptions questionnaire/rebooking restantes.
- Comparer Rebooking Firebase avec l'app Apps Script historique avant d'en faire la source principale.
- Tester un vrai envoi questionnaire GHL avec un client dont le telephone est confirme.

## 6. Decisions importantes deja prises

1. Firestore est la base operationnelle du dashboard.

   Les coachs doivent interagir avec Firebase/Firestore, pas attendre des operations lentes dans Google Sheets.

2. Google Sheets reste utile, mais change de role.

   Sheets peut servir de source externe, backup, zone d'audit ou transition. Il ne doit pas devenir le moteur interactif principal.

3. Apps Script peut continuer en parallele.

   Les scripts actuels restent un filet de securite pendant que Firebase devient fiable.

4. Le telephone normalise est l'identifiant client prioritaire.

   Le nom et le courriel peuvent aider, mais le matching principal doit se faire par telephone.

5. Les champs manuels du coach sont proteges.

   Exemples:
   - fin membership manuelle
   - recurrence prevue dans Kilo
   - risque coach manuel
   - notes/objectifs

   Une sync externe ne doit pas ecraser ces champs.

6. CoachRx ne doit pas generer automatiquement du bruit To-do.

   CoachRx donne le portefeuille et le contexte programme. Une To-do doit apparaitre seulement si une action concrete est identifiee.

7. Les donnees et tokens sensibles ne doivent jamais etre publies dans GitHub Pages ou Firebase Hosting.

   Les tokens GHL, tokens rebooking Apps Script et secrets d'import doivent rester cote serveur ou dans Secret Manager.

8. L'envoi questionnaire GHL doit passer par Firebase Functions.

   Le frontend ne doit jamais contenir le token GHL.

9. Le rebooking existant Apps Script reste reference fonctionnelle.

   Il peut continuer a rouler pendant qu'on reconstruit ou integre le module Firebase.

10. L'UX cible doit etre sobre, orientee action et inspiree de Kilo.

    Couleurs cible:
    - blanc
    - gris
    - noir
    - rouge CFSB pour actions importantes seulement

## 7. Zones encore floues

1. Validation terrain des portefeuilles coachs

   Les validations locales couvrent le matching, mais la preuve MVP exige que les 7 coachs pilotes reconnaissent leur portefeuille dans le live publie.

2. Source definitive des telephones clients

   CSM enrichit deja une partie des telephones et check-ups. GHL peut aider, mais l'integration doit rester serveur/privee. Les telephones restent le meilleur identifiant de matching.

3. CoachRx direct vers Firestore

   L'objectif serait que l'extension ou le script d'extraction envoie directement dans Firestore/Firebase Functions, sans passer par Google Sheets si ce n'est pas necessaire.

4. Gouvernance de `TASKS_Current`

   Il faut clarifier si cette source reste temporaire ou devient un canal officiel de taches.

5. Rebooking

   L'app Apps Script actuelle fonctionne mieux comme reference. Il faut confirmer la source exacte, les statuts, l'historique et la logique "vacances" avant de refaire le module Firebase complet.

6. Questionnaires

   L'envoi GHL et la reception des reponses doivent etre retestes en live. L'inbox separe maintenant:
   - Reponses a lire
   - Envoyer
   - A relancer
   - A valider
   - Archives

7. Acces coachs

   Les coachs doivent pouvoir se connecter avec leur propre courriel. Le compte `info@crossfitstbasilelegrand.com` sert a l'admin/coprop, pas aux coachs au quotidien.

8. Gabriel

   Gabriel est coproprietaire et peut utiliser `info@`, mais il existe aussi un CoachRx ID `15893`. Il faut clarifier s'il doit avoir un acces coach separe ou seulement admin/coprop.

9. Alumni et Performance

   Ces onglets sont importants, mais moins prioritaires que:
   - clients
   - To-do
   - questionnaire
   - source/matching

10. Donnees de clients crees manuellement

   Il faut definir la fusion quand un client cree manuellement dans Firebase apparait plus tard dans CoachRx/GHL.

11. Transfert de coach

   Il faut definir ce qui arrive quand un client change de coach: historique conserve, coachId mis a jour, anciennes taches fermees ou transferees.

## 8. Prochaines etapes prioritaires

### Priorite 0 - Valider le MVP publie avec les coachs

Objectif: confirmer que `20260618-csm-global-enrichment` est assez fiable pour une premiere utilisation interne.

Actions:

1. Confirmer l'app publiee si la session reprend plus tard:
   `valider-dashboard-equipe.cmd`
2. Tester les 7 coachs pilotes dans cet ordre:
   Iheb, Marc-Andre, David, Camille, Gabriel, Hugo, Raphael.
3. Classer les retours selon:
   - No-Go temporaire;
   - Go limite;
   - Post-MVP.

### Priorite 1 - Stabiliser les donnees clients par coach

Objectif: chaque coach voit son vrai portefeuille.

Actions:

1. Lancer une sync tous coachs seulement si le live publie est valide.
2. Verifier Marc-Andre, Iheb, Camille, David, Hugo, Raphael et Gabriel.
3. Comparer:
   - nombre de clients importes
   - nombre de clients visibles
   - champs `coachId`
   - champs `coachRxId`
   - champs `assignedCoachId`
4. Corriger les variantes de schema qui empechent la lecture par coach.
5. Afficher seulement un diagnostic compact et utile si une anomalie existe.

### Priorite 2 - Clarifier To-do

Objectif: la To-do doit montrer seulement les actions concretes a faire.

Actions:

1. Retirer le bruit visuel et les longs diagnostics de la page coach.
2. Garder les diagnostics complets dans Guide/Admin ou un panneau de debug.
3. Separarer clairement:
   - contexte CoachRx
   - vraie tache programme
   - vraie tache questionnaire
   - vraie tache rebooking
   - note coach
4. Verifier contre l'ancienne app Apps Script pour ne pas perdre la logique fonctionnelle.

### Priorite 3 - Source telephone / matching GHL

Objectif: chaque fiche client doit avoir un telephone fiable.

Actions:

1. Utiliser le telephone normalise comme identifiant principal.
2. Ajouter/importer les telephones depuis GHL si possible.
3. Ne pas ecraser les donnees manuelles valides avec du vide.
4. Creer une file "telephone a valider" seulement quand necessaire.

### Priorite 4 - Questionnaire

Objectif: rendre le module utilisable comme inbox coach.

Actions:

1. Retester l'envoi a un vrai numero.
2. Confirmer le retour d'erreur GHL si l'envoi echoue.
3. Lire les reponses par nom de champ, pas par ordre de colonne.
4. Afficher les reponses avec signaux visuels utiles.
5. Ajouter "Lu" et "Creer une mission".
6. Ne creer une To-do questionnaire que lorsqu'une action coach est requise.

### Priorite 5 - Rebooking

Objectif: ramener la logique de l'app Apps Script dans le dashboard sans la briser.

Actions:

1. Comparer l'app Apps Script actuelle et le module Firebase.
2. Identifier la source de donnees rebooking officielle.
3. Reproduire les statuts utiles:
   - Ouvert
   - A clarifier
   - Ouvert 24h+
   - A suivre
   - Gere
   - Rebooke
   - Absence coach
4. Preserver l'historique et le bouton "reouvrir".
5. Garder l'app Apps Script active comme filet de securite pendant la migration.

### Priorite 6 - UX globale

Objectif: chaque element visuel doit avoir une fonction.

Actions:

1. Nettoyer les diagnostics visibles.
2. Garder les messages coach simples.
3. Mettre les details techniques dans Guide/Admin.
4. Standardiser les cartes, boutons, tags et hover.
5. Corriger le menu coach si l'ouverture est irritante.

### Priorite 7 - Acces coachs

Objectif: les coachs utilisent leur propre compte.

Actions:

1. Verifier les emails officiels des coachs.
2. Creer/mettre a jour les documents `users/{uid}` apres premiere connexion.
3. Lier chaque user au bon `coachId`.
4. Confirmer le role:
   - admin
   - coach
   - coproprietaire/admin

## 9. Livrables MVP actifs

Les livrables de validation de l'equipe sont dans:

`C:\Users\micha\Documents\Codex\2026-06-10\je-reprends-le-projet-dashboard-coach\outputs`

Documents actifs:

- `dashboard-coach-mvp-go-nogo-2026-06-11.md`
- `dashboard-coach-mvp-validation-checklist.md`
- `dashboard-coach-validation-terrain.md`
- `dashboard-coach-validation-equipe-template.md`
- `dashboard-coach-kit-lancement-interne.md`
- `dashboard-coach-mvp-completion-audit-2026-06-11.md`
- `dashboard-coach-action-publication-mvp-2026-06-11.md`

Document de sortie remplace:

- `dashboard-coach-checklist-equipe.md` est historique seulement.

## 10. Instructions pour reprendre dans une nouvelle conversation Codex

### Prompt de reprise recommande

Utilise ce prompt dans la nouvelle conversation:

```text
Je reprends le projet Dashboard Coach CFSB. Lis d'abord le fichier PROJECT_HANDOFF.md dans le repo:
C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo\PROJECT_HANDOFF.md

Objectif: rendre le Dashboard Coach CFSB presentable pour une premiere utilisation interne MVP. La version live `20260618-csm-global-enrichment` est publiee et validee techniquement; la prochaine etape est la validation humaine des 7 coachs pilotes.

Avant de coder, fais un court recapitulatif de ce que tu comprends et propose le plan d'action. Ensuite, attends mon go avant de modifier le code.

Contraintes:
- Ne pas publier de secrets ou donnees client dans les assets publics.
- Firestore est la base operationnelle.
- Google Sheets et Apps Script restent sources/backups/transitions.
- Les champs manuels coach ne doivent pas etre ecrases.
- Le telephone normalise est l'identifiant client prioritaire.
- La To-do doit contenir seulement des actions concretes, pas du contexte ambigu.
- Les diagnostics techniques doivent etre caches ou deplaces dans Guide/Admin.
```

### Commandes utiles

Depuis:

`C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo`

Commandes:

```powershell
.\verify-dashboard-before-deploy.cmd
.\firebase-login-dashboard.cmd
.\publier-dashboard-mvp.cmd
.\valider-dashboard-equipe.cmd
.\verify-dashboard-live.cmd
.\audit-live-firestore.cmd
```

Si Firebase demande une reconnexion:

```powershell
.\firebase-login-dashboard.cmd
```

Puis relancer:

```powershell
.\publier-dashboard-mvp.cmd
```

### Tests manuels minimaux apres chaque deploy

1. Ouvrir `https://cfsb-dashboard-coach-aa9a4.web.app`
2. Se connecter.
3. Verifier la liste des coachs.
4. Pour chaque coach pilote:
   - ouvrir Clients
   - verifier que le portefeuille est visible
   - ouvrir To-do
   - verifier que les taches sont plausibles
   - ouvrir Questionnaires
   - verifier que l'inbox est lisible
   - ouvrir Rebooking
   - comparer avec l'app Apps Script si necessaire
5. Verifier que les diagnostics techniques ne polluent pas la vue coach.

## Etat mental du projet

La direction produit est claire:

Le dashboard doit etre l'endroit unique ou un coach voit ce qu'il doit faire aujourd'hui.

Le plus grand risque actuel n'est pas le design. Le plus grand risque est la confusion des sources:

- CoachRx donne le portefeuille et certains signaux de programme.
- CSM donne des clients, telephones et check-ups.
- GHL est probablement la meilleure source pour le telephone/contact.
- Le questionnaire donne du feedback client et des signaux de risque.
- Le rebooking Apps Script a deja une logique fonctionnelle a recuperer.
- Firestore doit unifier tout ca pour que le dashboard soit rapide.

La prochaine conversation doit donc commencer par stabiliser le contrat de donnees avant d'ajouter de nouvelles fonctionnalites.

