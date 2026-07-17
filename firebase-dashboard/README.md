# Dashboard Coach CFSB - Firebase V1

Cette version est la migration Firebase du prototype Apps Script / Google Sheets.

## Objectif

Creer une app coach rapide, privee et fiable:

- connexion Google par coach;
- donnees dans Firestore;
- actions coach instantanees;
- questionnaire client-coach dans une inbox claire;
- rebooking integre;
- Google Sheets garde comme source/import/export, mais pas comme moteur interactif quotidien.

## Etat actuel

Cette base contient:

- configuration Firebase Web du projet `cfsb-dashboard-coach-aa9a4`;
- app front-end statique V1;
- regles Firestore fermees par defaut sauf utilisateurs actifs;
- modele de donnees cible;
- architecture de synchronisation et filet de securite;
- donnees de depart pour les coachs reels;
- import des reponses questionnaire depuis `Responses` et `Test_Responses`;
- import des rebookings depuis `SRC_Rebookings_SemiPrive` et des taches rebooking detectees dans `TASKS_Current`;
- import des check-ups CSM depuis `SRC_CSM_FormulaireCheckup` et, si disponible, le Sheet CSM externe;
- import des alumni et impacts depuis les onglets administratifs du Sheet dashboard;
- synchronisation automatique Firestore toutes les 6 heures via `scheduledDashboardSync`, en plus du bouton admin manuel;
- historique court des actions de rebooking directement dans les cartes;
- pilote Assistant IA prive, visible uniquement par `info@crossfitstbasilelegrand.com`: lecture R0, creation de mission R1 apres confirmation et saisie vocale R2;
- structure prete pour Firebase Hosting.

La V1 Firebase remplace le prototype lent Apps Script pour l'interface quotidienne: les clics, les fiches clients, les to-do, les questionnaires, le rebooking, les impacts et les alumni vivent maintenant dans Firestore.

Les actions qui exigent un secret serveur restent volontairement non exposees dans le front-end. L'envoi SMS GoHighLevel du questionnaire passe par la Cloud Function `sendQuestionnaire`, qui utilise le secret Firebase `GHL_PRIVATE_TOKEN` pour ajouter le tag GHL `dashboardcoach` sans publier de token dans l'application.

Le pilote IA suit la meme regle: le navigateur ne contient aucune cle de modele. Il cree une demande privee dans Firestore; une Function verifie de nouveau l'identite admin, construit un contexte minimal et appelle Vertex AI cote serveur. Une demande generale reste en lecture seule. Depuis `+ Mission`, l'admin peut ecrire ou dicter sa demande. Le vocal est transporte temporairement par morceaux prives, transcrit cote serveur, puis supprime. L'IA prepare une proposition `task.create`, mais seul le backend peut creer la mission apres une confirmation explicite et une seconde validation des droits. Voir `ASSISTANT_ADMIN_PILOT.md`.

## Documents de reference

- `DATA_MODEL.md` : collections Firestore et champs cibles.
- `DATA_SYNC_ARCHITECTURE.md` : role de Firebase, Google Sheets, Apps Script, CoachRx, GHL et rebooking pendant la transition.
- `SOURCE_OF_TRUTH_AUDIT.md` : audit des sources actuellement branchees et des risques de donnees incompletes.
- `DATA_OPERATING_PLAN.md` : decision operationnelle sur ou vivent les donnees, qui les modifie et comment elles se synchronisent.
- `DATA_INGESTION_PLAN.md` : plan technique des imports directs vers Firestore, par source vivante.
- `DATA_SOURCE_ACTIVATION_MATRIX.md` : ordre d'activation des sources, preuves de pret, blocages et rollbacks.
- `SOURCE_REGISTRY.json` : registre machine-readable des sources, domaines, contrats d'ingestion, blocages et rollbacks.
- `APPS_SCRIPT_FIREBASE_BRIDGE.md` : contrat technique pour envoyer des donnees Apps Script directement dans Firestore via Cloud Function securisee.
- `apps-script/dashboard-import-bridge-template.gs` : template a copier dans les Apps Script prives pour pousser CoachRx, CSM, GHL, questionnaires, rebooking ou check-ups vers Firestore.
- `DEPLOY_RUNBOOK.md` : procedure de publication Firebase et commandes Windows fiables.
- `PILOT_VALIDATION_CHECKLIST.md` : preuves a obtenir pour declarer la version pilote utilisable.
- `PILOT_HANDOFF.md` : etat courant, blocage de publication, tests post-deploiement et prochaine passe recommandee.

## Premiere activation

1. Publier les regles Firestore dans `firestore.rules`.
2. Publier l'app sur Firebase Hosting.
3. Ouvrir l'app et se connecter avec Google.
4. Copier le UID affiche dans l'ecran "Acces en attente".
5. Dans Firestore, creer manuellement `users/{uid}`:

```json
{
  "active": true,
  "role": "admin",
  "coachId": "admin",
  "displayName": "Michael Grondin",
  "email": "ton-email-google"
}
```

6. Dans l'app, ouvrir `Guide` puis utiliser `Reparer liste coachs` si la liste officielle des coachs pilotes n'est pas encore chargee.
7. Lancer `Synchroniser tous les coachs` pour importer les donnees reelles disponibles dans les sources.
8. Apres deploiement complet des Functions, la sync automatique aux 6 heures garde Firestore a jour. Le bouton manuel reste utile pour forcer une mise a jour avant une rencontre ou pour diagnostiquer un coach vide.

## Acces coachs pilotes

Le registre local de reference est `PILOT_COACH_ACCESS.json`. Les doublons necessaires dans `app.js`, `functions/index.js` et `firestore.rules` doivent rester alignes avec ce fichier avant chaque publication.

Les coachs pilotes peuvent s'auto-activer avec leur courriel Google officiel, sans creation manuelle de document `users/{uid}` par Michael. Les regles Firestore autorisent seulement les paires courriel/CoachRx ID suivantes avec `role: "coach"` et `source: "firebase_self_provision_pilot"`:

- Marc-Andre Menard `15935` - `marcandremenard89@gmail.com`
- Iheb Yahyaoui `15928` - `ihebya73@gmail.com`
- Camille Proulx `17242` - `camproulxx@gmail.com`
- David Olivier `15902` - `davidolivier1997@gmail.com`
- Hugo Lelievre `15937` - `hugolelievre34@gmail.com`
- Raphael Samson `15936` - `raphael.samson@usherbrooke.ca`

Gabriel/Michael utilisent `info@crossfitstbasilelegrand.com` comme acces admin/coproprietaire. Cet acces reste volontairement separe de l'auto-activation coach.

## Deploiement

Depuis la racine du repo, utiliser de preference les scripts Windows:

1. `firebase-login-dashboard.cmd` : reconnecte la CLI Firebase si l'authentification a expire.
2. `verify-dashboard-before-deploy.cmd` : valide la syntaxe front-end/back-end, les helpers d'import et la couverture des regles Firestore.
3. `deploy-hosting-dashboard.cmd` : publie seulement l'interface.
4. `deploy-dashboard-complet.cmd` : valide localement, puis publie l'interface, les Functions, les regles Firestore et les index.

Voir aussi `DEPLOY_RUNBOOK.md` pour la procedure detaillee et les commandes `cmd` a utiliser.

Le deploiement complet est requis quand on modifie l'envoi questionnaire, les regles Firestore, les index ou les synchronisations backend. Le deploiement hosting seul suffit pour les changements visuels.

Si Firebase refuse la publication avec une erreur d'authentification, lancer d'abord `firebase-login-dashboard.cmd`, puis relancer le script de deploiement voulu.

URL de production Firebase:

```text
https://cfsb-dashboard-coach-aa9a4.web.app
```

## Verification apres publication

Une publication ne suffit pas a remplir le dashboard. Apres un deploiement complet:

1. Ouvrir `https://cfsb-dashboard-coach-aa9a4.web.app`.
2. Selectionner le compte admin.
3. Ouvrir `Guide`.
4. Cliquer `Synchroniser tous les coachs`.
5. Valider au minimum Marc-Andre et Iheb dans `Clients`, `To-do`, `Questionnaires` et `Rebooking`.
6. Si un coach reste vide, lire le diagnostic de synchronisation dans `Guide` avant de modifier l'interface.

Le selecteur coach doit rester limite aux coachs reels avec CoachRx ID:

- Marc-Andre Menard `15935`
- Iheb Yahyaoui `15928`
- Camille Proulx `17242`
- David Olivier `15902`
- Gabriel Mayer Bedard `15893`
- Hugo Lelievre `15937`
- Raphael Samson `15936`

Si les clients n'apparaissent pas apres `Synchroniser tous les coachs`, le probleme a verifier est habituellement l'un de ces points:

- les sources Google Sheets n'ont pas encore ete importees dans Firestore;
- la Function planifiee `scheduledDashboardSync` n'a pas encore roule depuis le dernier changement de source;
- le nom du coach dans la source ne correspond pas aux alias connus;
- le CoachRx ID n'est pas present dans la source;
- les lignes matchent le coach, mais la colonne nom client n'est pas lisible;
- le coach a des clients dans CoachRx, mais pas encore dans les sources de sync lues par Firebase.

## Verification locale des imports

Avant un deploiement complet, le test suivant valide les helpers de matching sans appeler Firebase:

```powershell
cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
.\verify-dashboard-before-deploy.cmd
```

Ce test couvre:

- un client Iheb venant de `CORE_Clients`;
- un identifiant stable avec `Client Key`;
- deux rebookings semi-prive avec statuts `OUVERT` et `REBOOKE`;
- un check-up CSM qui matche Gabriel avec seulement le prenom;
- la normalisation des statuts alumni et impacts.

## Limites connues V1

- L'envoi reel du questionnaire via GoHighLevel est branche par Cloud Function, mais doit rester sous observation avec le journal `questionnaireSends`.
- Les reponses questionnaire sont importees depuis le Sheet externe, matchees en priorite par telephone normalise, puis affichees dans l'inbox coach.
- Les taches questionnaire sont creees seulement pour les statuts jaune/orange/rouge non lus/non archives.
- Les imports CoachRx/Kilo/CSM sont en transition: clients, taches, questionnaires, rebookings, check-ups, alumni et impacts peuvent maintenant etre importes vers Firestore, mais les anciens Sheets restent le filet de securite.
- Les donnees historiques reelles doivent etre importees progressivement par coach apres validation du modele.
- Aucun snapshot public contenant des donnees client ne doit etre ajoute dans `firebase-dashboard/public`.

## Pourquoi ne pas utiliser `npm install firebase` tout de suite?

La V1 utilise les imports officiels CDN de Firebase:

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
```

Ca evite de bloquer sur Node/npm local pendant qu'on valide l'architecture. On pourra passer a Vite/React + `npm install firebase` quand la structure de donnees sera stable.
