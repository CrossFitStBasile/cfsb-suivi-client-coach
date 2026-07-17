Etat publication 2026-06-19; mise a jour 2026-07-07: live cible `20260707-coachrx-extraction-guard`; Hosting publie et valide apres deploy; prochaine limite: validation humaine des coachs pilotes et parite Rebooking legacy.

Handoff mission vocale MVP: version cible `20260707-coachrx-extraction-guard`. Apres publication, lancer `valider-dashboard-equipe.cmd`, garder la validation humaine des coachs pilotes comme etape terrain, et utiliser `audit-live-firestore.cmd` plus `audit-live-coach-access.cmd` pour confirmer les profils.

# Handoff pilote - Dashboard Coach Firebase

Derniere mise a jour: 2026-06-11

## Etat courant - 2026-06-12

La version Firebase Hosting cible `app.js?v=20260707-coachrx-extraction-guard` et `APP_VERSION = 20260707-coachrx-extraction-guard`.

Etat verifie:

- `verify-dashboard-before-deploy.cmd`: 26/26;
- audit produit automatise: 78/78;
- `verify-dashboard-live.cmd`: 9/9;
- `audit-live-firestore.cmd --summary`: OK;
- `valider-dashboard-equipe.cmd`: OK techniquement;
- cible live: `https://cfsb-dashboard-coach-aa9a4.web.app`.

Fonctionnel confirme le 2026-06-11:

- To-do: missions CoachRx visibles, actions concretes seulement.
- Clients: portefeuilles Marc-Andre, Iheb et Raphael coherents avec CoachRx apres sync.
- Questionnaires: envoi GHL par file Firestore, reponse test Michael Grondin recue puis importee `to_read`.
- Reponses questionnaire: sync automatique aux 15 minutes via `scheduledQuestionnaireResponseSync`.
- Rebooking: a recentrer sur les **seances a remettre**. L'app legacy reste la reference tant que la parite n'est pas prouvee.

Si une nouvelle reprise est requise, relancer d'abord le controle equipe:

```cmd
cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
valider-dashboard-equipe.cmd
```

Prochaine reprise produit:

- faire la validation humaine des 7 coachs pilotes;
- valider les portefeuilles Iheb, Marc-Andre, Camille, David, Gabriel, Hugo et Raphael;
- comparer Rebooking Firebase avec l'app historique avant de retirer le filet de securite, en validant surtout le nombre de seances a remettre par client;
- valider que les libelles coach restent comprehensibles sans afficher de diagnostics techniques dans la vue normale.
- garder `audit-live-firestore.cmd --summary` comme preuve de donnees live si un doute revient.

## Etat courant - 2026-06-09

La version Firebase Hosting sert `app.js?v=20260608-direct-import-bridge` et `APP_VERSION = 20260608-direct-import-bridge`. La version locale prete pour le prochain deploy sert `app.js?v=20260609-coach-picker-stable` et `APP_VERSION = 20260609-coach-picker-stable`. Le deploy precedent est Hosting seulement; le redeploy Functions complet doit confirmer le secret `DASHBOARD_IMPORT_TOKEN`.

Etat verifie:

- `verify-dashboard-before-deploy.cmd`: 25/25;
- audit produit automatise: 51/51;
- `verify-dashboard-live.cmd`: 8/9 actuellement, avec seul echec attendu sur l'ecart de version live/local tant que `20260609-coach-picker-stable` n'est pas publie;
- `audit-live-firestore.cmd --summary`: reussi en lecture seule le 2026-06-09;
- dernier sync global observe: `oOej80NxHYB0YTRrhEU9`;
- source du sync: `firebase_function_sync_sheets_scheduled`;
- heure du sync: `2026-06-09T03:53:06.684Z`;
- avertissements de sync: 25;
- cible live: `https://cfsb-dashboard-coach-aa9a4.web.app`.
- acces coachs pilotes pret localement, non encore prouve live: les courriels officiels des coachs peuvent s'auto-activer comme `role: coach` avec leur CoachRx ID verrouille; le compte `info@crossfitstbasilelegrand.com` reste admin/coproprio.
- derniere passe locale acces/sources: audit produit 51/51, registre sources valide et couverture Firestore valide.

Si une nouvelle publication est requise, utiliser une console Firebase authentifiee ou avec `FIREBASE_TOKEN`, puis lancer:

```cmd
cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
deploy-dashboard-complet.cmd
verify-dashboard-live.cmd
audit-live-firestore.cmd
```

Prochaine reprise produit:

- auditer Marc-Andre et Iheb dans l'app live avec les compteurs actuels;
- verifier les clients sans telephone: Marc-Andre 1, Iheb 5, David 2, Hugo 5, Raphael 4;
- valider les reponses questionnaire non matchees et les reponses a lire;
- verifier les To-do issues de `TASKS_Current` et `google_sheets_questionnaire_responses`;
- comparer Rebooking Firebase avec l'app historique avant d'enlever le filet de securite.
- avant tout nouveau pont direct, verifier `SOURCE_PAYLOAD_CONTRACTS.json`, `SOURCE_PAYLOAD_PLAYBOOK.md`, `SOURCE_ACTIVATION_KIT.md`, `SOURCE_ACTIVATION_STATUS.json` et un preview `previewDashboardImportPayload_`.
- apres deploy, tester au moins un login coach avec courriel officiel pour confirmer l'auto-activation.

## Historique precedent - 2026-06-08

## Historique precedent - 2026-06-05

## Etat actuel

La version Firebase est publiee cote Hosting, mais le live sert encore une ancienne version du frontend. La version locale est prete a publier et validee; la validation fonctionnelle live doit attendre un nouveau deploy depuis une console Firebase authentifiee ou un `FIREBASE_TOKEN` valide.

Validation locale reussie:

- syntaxe `functions/index.js`;
- syntaxe `firebase-dashboard/public/app.js`;
- helpers d'import Firestore;
- matching Iheb dans `CORE_Clients`;
- couverture import locale des 7 coachs pilotes avec matching par nom, alias et URL CoachRx;
- deduplication CORE/CoachRx par telephone normalise;
- fusion des clients manuels/existants avec les imports Sheets/CoachRx;
- matching questionnaire par telephone meme si le nom client saisi differe;
- rebooking ouvert/rebooke;
- check-up Gabriel;
- statuts alumni/impact;
- ecriture `coachSyncStatus`;
- couverture des collections par `firestore.rules`.
- cache-bust front-end mis a jour vers `20260605-questionnaire-send-audit`.
- serveur local verifie: `index.html`, `app.js` et `styles.css` repondent en HTTP 200.
- audit d'entetes Google Sheets ajoute au resultat de sync et verifie par test local.
- test comportemental des workflows Rebooking/Alumni ajoute a `verify-dashboard-before-deploy.cmd`.
- audit produit automatique ajoute a `verify-dashboard-before-deploy.cmd`:
  - coachs pilotes reels;
  - modules principaux;
  - selecteur coach natif;
  - To-do sans ancien bloc capture rapide;
  - aucun seed/demo public;
  - inbox questionnaire en 5 vues;
  - questionnaire robuste aux nouveaux champs;
  - relance questionnaire apres 7 jours;
  - fiche client manuelle;
  - deduplication telephone / ID source / nom;
  - rebooking complet;
  - flux vacances/absence coach en Rebooking;
  - alumni cycle complet;
  - performance par periode;
  - impacts gerables: ajouter, modifier, confirmer, annuler, retirer avec journal;
  - action logs;
  - diagnostics sync;
  - sources de verite visibles dans le Guide;
  - contraste/hover;
  - absence de secret GHL public;
  - envoi questionnaire cote Function.
  - regles transfert coach borne aux pilotes.
  - rendu groupe Firestore pour limiter les reconstructions inutiles de l'interface.
  - lecture questionnaire permise au coach proprietaire sans permettre la modification du contenu.

## Changements importants prets a publier

- Sync manuelle Google Sheets vers Firestore depuis `Guide`.
- Sync automatique `scheduledDashboardSync` toutes les 6 heures.
- Diagnostic par coach via `coachSyncStatus`.
- Journalisation d'actions coach dans `actionLogs`.
- Sidebar plus stable: le menu ne doit plus faire chevaucher `Guide` et `Coach`.
- Selecteur coach natif plus simple et plus fiable: un clic ouvre la liste sans interaction de glisser/maintenir.
- Message `coach vide` plus precis:
  - aucune sync recente;
  - sources lues mais non matchees;
  - lignes matchees sans client exploitable;
  - sync indique des clients importes mais l'interface n'en lit aucun.
- Diagnostic `Guide` enrichi:
  - lignes sources disponibles vs lignes matchees;
  - entetes detectees par source;
  - alias coach reconnus;
  - exemples de signaux non matches.
- Diagnostic telephone ajoute:
  - compteur `Sans telephone`;
  - avertissement quand des clients importes ne peuvent pas etre matches efficacement avec Questionnaire/GHL;
  - couverture telephone par source (`CORE_Clients`, CoachRx, rebookings, questionnaires, check-ups, alumni);
  - exemples de clients importes sans telephone pour savoir quoi corriger dans la source.
- Import Google Sheets durci:
  - les champs utiles ne sont plus ecrases par des valeurs vides provenant d'un export incomplet;
  - les clients importes ont `status: active` par defaut.
- Onglet Questionnaires clarifie:
  - `Envoyes sans reponse` affiche les vrais envois en attente;
  - le modal `Envoyer questionnaire` desactive les clients sans telephone au lieu de laisser le coach declencher une erreur evitable;
  - les champs questionnaire inconnus sont conserves dans `answers.other_responses` et affiches comme `Autre` dans l'inbox;
  - une ancienne reponse questionnaire ne masque plus un nouvel envoi: la reponse doit matcher le telephone et etre soumise apres `sentAt`;
  - le dernier envoi affiche sur une fiche client est calcule par date, sans dependre de l'ordre d'arrivee Firestore;
  - avant 7 jours, la carte reste en stand-by;
  - apres 7 jours, le bouton `Creer relance` devient disponible seulement si aucune reponse recente ne correspond a l'envoi.
  - l'action `Lu` ecrit `processingStatus: read`, `readAt`, `readByUid` et `readByEmail`; les regles Firestore permettent uniquement cette lecture/archivage par le coach proprietaire.
- Fiche client clarifiee:
  - avertissement si le telephone manque;
  - details de source/synchronisation repliables;
  - source, ID source, CoachRx et derniere sync visibles sans encombrer la liste.
- Deduplication client renforcee dans l'interface:
  - telephone normalise;
  - ID source;
  - nom seulement en dernier recours.
- Transfert client admin ajoute:
  - champ `Coach responsable` dans la fiche client;
  - trace `previousCoachId`, `transferredAt` et `transferSource`;
  - transfert des donnees liees par `clientId`: taches, rebookings, envois/reponses questionnaire, check-ups et impacts.
  - refus explicite si le coach responsable cible est invalide.
- Rendu interface optimise:
  - les abonnements Firestore groupent maintenant les reconstructions de page via `requestAnimationFrame`;
  - cela limite les ralentissements quand plusieurs collections se mettent a jour en meme temps.
- Diagnostic de fraicheur de sync ajoute:
  - les blocs `coach vide` et `Diagnostic sync` indiquent maintenant si la derniere synchronisation est recente ou a rafraichir;
  - cela aide a distinguer une source vide d'une source simplement trop vieille.
- Tracabilite de sync renforcee:
  - `syncRuns` enregistre maintenant `triggeredBy`, `triggeredByEventId`, `startedAt` et `finishedAt`;
  - `coachSyncStatus` expose aussi `triggeredBy`;
  - le diagnostic admin affiche si la sync vient du bouton manuel ou de l'automatisation.
- Validation locale renforcee:
  - `verify-dashboard-before-deploy.cmd` execute maintenant un test comportemental sur les relances questionnaire;
  - le test confirme qu'une reponse anterieure a `sentAt` ne ferme pas un nouvel envoi, mais qu'une reponse posterieure le ferme.
  - le test confirme aussi que `latestSendForClient` retourne le plus recent envoi meme si les donnees arrivent dans un ordre melange.
- Matching source renforce avec plus d'alias pour coach, telephone, email et nom client.
- Garde-fou import renforce:
  - le test local simule maintenant les 7 coachs pilotes;
  - les sources peuvent matcher par nom, alias, CoachRx ID ou URL `/team/{id}/clients`;
  - CORE et CoachRx sont regroupes par telephone avant de tomber sur ID source ou nom;
  - un client manuel ou existant retrouve plus tard dans une source importee est fusionne dans sa fiche actuelle;
  - les champs manuels et `linkedFromManual` permettent de garder le contexte coach;
  - une reponse questionnaire peut se rattacher au client par telephone sans dependre du nom/courriel saisi.
- Boutons de donnees pilotes retires de l'app reelle.
- Rebooking permet maintenant un flux `Vacances / absence coach` pour classer en lot les rebookings ouverts d'une plage de dates, avec raison et historique.
- Performance permet maintenant de gerer les impacts: ajout, modification, confirmation, annulation et retrait sans perte de journal d'action.
- Alumni permet maintenant de modifier une fiche, creer une mission, classer contacte/ne pas contacter/reactive, remettre a travailler apres erreur et archiver.
- Le Guide affiche maintenant les sources de verite: Firestore, Google Sheets, CoachRx, GoHighLevel et champs manuels coach.
- Scripts de deploiement corriges pour ne plus afficher un faux succes si Firebase refuse l'authentification.
- `deploy-dashboard-complet.cmd` supporte `DASHBOARD_NO_PAUSE=1` pour les lancements automatises sans bloquer sur `pause`.

## Validation live restante

Le deploiement complet est maintenant reussi. La prochaine etape est la validation fonctionnelle avec donnees reelles:

- ouvrir l'app live;
- se connecter avec le compte admin;
- lancer `Synchroniser tous les coachs`;
- confirmer Marc-Andre et Iheb dans `Clients`;
- tester `Questionnaires`, `Rebooking`, `To-do`, `Performance` et `Alumni`.

Ancien blocage resolu par terminal interactif: Firebase CLI refusait l'authentification en mode non interactif dans Codex:

```text
Cannot run login in non-interactive mode
```

Le script `deploy-dashboard-complet.cmd` detecte maintenant correctement cette erreur et s'arrete avec un echec.

Nouvelle tentative du 2026-06-03 apres les correctifs import/questionnaire: meme blocage d'authentification Firebase dans Codex. La validation locale passe avant l'echec.

Nouvelle tentative du 2026-06-03 apres le selecteur coach natif et la deduplication client: meme blocage d'authentification Firebase CLI non interactive. La validation locale et le serveur statique local passent avant l'echec.

Nouvelle tentative du 2026-06-03 apres l'ajout de l'audit produit automatique: validation locale complete reussie, incluant 15/15 checks produit, puis meme blocage Firebase CLI non interactive.

Nouvelle tentative du 2026-06-03 apres l'ajout du transfert client admin: validation locale complete reussie, incluant 16/16 checks produit, puis meme blocage Firebase CLI non interactive.

Nouvelle tentative du 2026-06-03 apres le durcissement des regles Firestore contre les transferts non-admin: validation locale complete reussie, incluant 17/17 checks produit, serveur statique local OK, puis meme blocage Firebase CLI non interactive.

Validation additionnelle du 2026-06-03 apres l'optimisation du rendu Firestore: validation locale complete reussie, incluant 18/18 checks produit. Aucun nouveau deploy tente parce que le blocage connu reste l'authentification Firebase CLI non interactive.

Validation additionnelle du 2026-06-03 apres le diagnostic de fraicheur de synchronisation: validation locale complete reussie, incluant 18/18 checks produit.

Nouvelle tentative de deploy du 2026-06-03 apres le diagnostic de fraicheur: validation locale complete reussie, incluant 18/18 checks produit, puis meme blocage Firebase CLI non interactive.

Nouvelle tentative de deploy du 2026-06-03 apres le correctif relance questionnaire: validation locale complete reussie, incluant 19/19 checks produit et le test comportemental des relances, puis meme blocage Firebase CLI non interactive.

Validation additionnelle du 2026-06-03 apres la tracabilite de sync manuelle/planifiee: validation locale complete reussie, incluant 19/19 checks produit.

Nouvelle tentative de deploy du 2026-06-03 apres la tracabilite de sync: validation locale complete reussie, incluant 19/19 checks produit, puis meme blocage Firebase CLI non interactive. Le script confirme maintenant qu'aucun `FIREBASE_TOKEN` n'etait defini et propose l'option token CI.

Nouvelle tentative de deploy du 2026-06-03 apres le garde-fou import 7 coachs et la protection To-do sans capture rapide: validation locale complete reussie, incluant 20/20 checks produit, puis meme blocage Firebase CLI non interactive.

Nouvelle tentative de deploy du 2026-06-03 apres la fusion clients existants/imports et la note d'absence coach en Rebooking: validation locale complete reussie, incluant 21/21 checks produit, puis meme blocage Firebase CLI non interactive.

Nouvelle tentative de deploy du 2026-06-03 apres la gestion complete des impacts Performance: validation locale complete reussie, incluant 22/22 checks produit, puis meme blocage Firebase CLI non interactive.

Validation additionnelle du 2026-06-03 apres l'ajout de la carte Sources de verite dans le Guide: validation locale complete reussie, incluant 23/23 checks produit.

Validation additionnelle du 2026-06-03 apres le support des nouveaux champs questionnaire: validation locale complete reussie, incluant 25/25 checks produit. Le test d'import simule une colonne V2 inconnue et confirme qu'elle reste visible dans `other_responses`.

Validation additionnelle du 2026-06-03 apres le cycle complet Alumni: validation locale complete reussie, incluant 25/25 checks produit.

Validation additionnelle du 2026-06-03 apres le flux vacances/absence Rebooking: validation locale complete reussie, incluant 25/25 checks produit. Le check Rebooking couvre maintenant aussi le flux de lot vacances/absence.

Validation additionnelle du 2026-06-03 apres l'ajout du test comportemental workflows: le nouveau test confirme que `Vacances / absence coach` ne cible que les rebookings ouverts dans la plage et que les statuts Alumni `to_work`, `reactivated` et `archived` sont traces.

Validation complete du 2026-06-03 apres integration du test workflow dans `verify-dashboard-before-deploy.cmd`: pipeline local 7/7 reussi. La validation couvre syntaxe backend/frontend, imports Firestore, logique de relance questionnaire, workflows Rebooking/Alumni, couverture Firestore/regles et audit produit 25/25.

Validation complete du 2026-06-03 apres le garde-fou UX du menu lateral: pipeline local 7/7 reussi, audit produit 26/26. Le nouveau check confirme que la navigation laterale peut defiler sans chevaucher le selecteur coach.

Nouvelle tentative de deploy du 2026-06-03 apres le board de finalisation et le garde-fou UX: validation locale complete reussie, incluant audit produit 26/26, puis meme blocage Firebase CLI non interactive (`Cannot run login in non-interactive mode`). Le journal est `firebase-deploy-last.log`.

Validation complete du 2026-06-03 apres l'ajout du garde-fou `verify-dashboard-actions.cjs`: pipeline local 8/8 reussi. Le test confirme que toutes les actions UI declarees avec `data-action`, les formulaires `data-form` et les filtres `data-filter` ont un gestionnaire correspondant. L'audit produit est maintenant a 27/27.

Validation complete du 2026-06-03 apres l'extension du garde-fou UI: pipeline local 8/8 reussi. Le test confirme aussi que les 7 onglets visibles ont un rendu, et que les 10 modales ouvrables ont une branche `renderModal` correspondante.

Validation complete du 2026-06-03 apres l'ajout du contrat Firebase deployable: pipeline local 9/9 reussi, audit produit 28/28. Le nouveau test confirme que Firebase Hosting pointe vers `firebase-dashboard/public`, que les Functions utilisent Node 22, que `sendQuestionnaire`, `syncDashboardFromSheets` et `scheduledDashboardSync` sont exportees, que les appels frontend correspondent aux exports callable, et que l'envoi questionnaire reste protege par `GHL_PRIVATE_TOKEN`.

Validation complete du 2026-06-03 apres le correctif de lecture questionnaire: pipeline local 9/9 reussi, audit produit 29/29. Le nouveau garde-fou confirme qu'un coach proprietaire peut marquer une reponse comme lue sans pouvoir modifier son contenu ni transferer le document vers un autre coach.

Tentative de deploy complet du 2026-06-03 apres validation 9/9 et audit 29/29: echec avant publication, car Firebase CLI refuse l'authentification dans le terminal non interactif Codex avec `Cannot run login in non-interactive mode`. Aucun nouveau deploiement live confirme pour cette passe.

Validation complete du 2026-06-03 apres l'ajout des contrats de permissions coach: pipeline local 9/9 reussi, audit produit 30/30. Le nouveau garde-fou confirme que les actions visibles du coach ont des regles Firestore compatibles avec leurs operations create/update et que `actionLogs` reste append-only.

Validation complete du 2026-06-03 apres l'ajout du diagnostic `Prochaine action recommandee`: pipeline local 9/9 reussi, audit produit 31/31. Le diagnostic de sync ne montre plus seulement des chiffres; il indique maintenant quoi verifier selon le cas: source vide, lignes non reconnues, fiche client non creee, telephone manquant, sync trop vieille ou donnees pretes a valider.

Validation complete du 2026-06-03 apres documentation du contrat de source de verite et durcissement du test workflow de transfert client: pipeline local 9/9 reussi, audit produit 32/32. Le test `verify-dashboard-workflows.cjs` confirme maintenant que les taches, rebookings, envois/reponses questionnaire, check-ups et impacts suivent un client transfere a un autre coach, avec trace `previousCoachId` et `transferredAt`.

Validation complete du 2026-06-03 apres ajout du garde-fou responsive: pipeline local 9/9 reussi, audit produit 33/33. L'audit bloque maintenant les regressions de structure mobile pour la sidebar, les cartes, les grilles et les modales.

Validation complete du 2026-06-03 apres ajout du verificateur `verify-deploy-scripts.cjs`: pipeline local 10/10 reussi, audit produit 34/34. Le pipeline verifie maintenant que les scripts de publication lancent la validation, ciblent `firebase-dashboard/public`, conservent le deploy complet Hosting/Functions/Firestore et gardent les chemins d'auth interactive ou `FIREBASE_TOKEN`.

Validation complete du 2026-06-03 apres ajout du smoke test Hosting local: pipeline local 11/11 reussi, audit produit 35/35. Le pipeline sert localement `firebase-dashboard/public` et verifie que `index.html`, `app.js`, `styles.css`, le fallback SPA et l'absence de secret public evident sont valides avant publication.

Nouvelle tentative de deploy complet du 2026-06-04 apres smoke test Hosting local et verification des scripts: validation locale complete 11/11 reussie, audit produit 35/35, puis echec avant publication parce que Firebase CLI refuse l'authentification non interactive dans Codex avec `Cannot run login in non-interactive mode`. Le code reste pret localement; la reprise doit se faire depuis un terminal interactif authentifie ou avec `FIREBASE_TOKEN`.

Validation additionnelle du 2026-06-04 apres durcissement du script `deploy-hosting-dashboard.cmd`: le deploy Hosting seul supporte maintenant `FIREBASE_TOKEN` et `DASHBOARD_NO_PAUSE`, comme le deploy complet.

Validation additionnelle du 2026-06-04 apres l'erreur Windows `Cannot find module ...\deploy`: les scripts de deploy et de login n'appellent plus `firebase-tools-instant-win.exe` avec `deploy`, `login` ou `login:ci` en argument. Ils exigent maintenant que la vraie commande `firebase` soit disponible dans le terminal, sinon ils affichent la procedure correcte: ouvrir `firebase-tools-instant-win.exe`, attendre le prompt Firebase, puis lancer `deploy-dashboard-complet.cmd`. Le pipeline local reste 11/11 reussi, audit produit 35/35; le verificateur de scripts passe maintenant 8/8.

Deploy complet reussi le 2026-06-04 depuis le terminal Firebase interactif:

- Firestore rules deployees;
- Firestore indexes deployes;
- Functions `sendQuestionnaire` et `syncDashboardFromSheets` mises a jour;
- Hosting release complete;
- URL live: `https://cfsb-dashboard-coach-aa9a4.web.app`.

Validation live Hosting du 2026-06-04:

- page racine HTTP 200;
- `app.js?v=20260603-firebase-pilot-sync` HTTP 200;
- `styles.css` HTTP 200;
- `Cache-Control: no-store`;
- app Firebase detectee dans `app.js`;
- aucun secret GHL evident dans les assets publics.

Note: cette entree est historique. Le live verifie le 2026-06-05 sert maintenant `app.js?v=20260605-coach-picker`, tandis que la version locale attendue est `app.js?v=20260605-questionnaire-send-audit`.

Validation additionnelle du 2026-06-04 apres ajout de `verify-dashboard-live.cmd`: le test post-deploiement live verifie maintenant la racine Hosting, les headers `no-store`, le bundle `app.js`, les styles, le projet Firebase, les callable Functions attendues, le fallback SPA, l'absence de secret public evident et la version exacte du bundle publie.

Validation additionnelle du 2026-06-04 apres ajout de la carte `Validation pilote` dans `Guide`: le pipeline local passe 11/11 et l'audit produit passe maintenant 36/36. Le Guide affiche une boussole de validation pour le coach selectionne: clients actifs, telephones manquants, To-do ouvertes, reponses a lire, relances questionnaire, non matchees, rebookings ouverts et impacts. Le test live Hosting passe toujours 8/8, mais cette nouvelle carte doit etre publiee par un nouveau deploy interactif Firebase avant d'apparaitre sur `https://cfsb-dashboard-coach-aa9a4.web.app`.

Validation additionnelle du 2026-06-04 apres ajout de la matrice `Etat des coachs pilotes` dans `Guide`: le pipeline local passe 11/11 et l'audit produit passe maintenant 37/37. Le Guide affiche maintenant, cote admin, une ligne par coach pilote avec derniere sync, clients, telephones manquants, To-do, questionnaires, rebookings, check-ups, impacts et prochaine action recommandee. Le test live Hosting passe toujours 8/8, mais cette matrice doit etre publiee par un nouveau deploy interactif Firebase avant d'apparaitre sur `https://cfsb-dashboard-coach-aa9a4.web.app`.

Validation additionnelle du 2026-06-04 apres ajout de l'indicateur de version front-end: le pipeline local passe 11/11 et l'audit produit passe maintenant 38/38. Le bas de la barre laterale affiche la version de l'app, ce qui permet de confirmer rapidement si Chrome sert la nouvelle passe apres publication.

Validation additionnelle du 2026-06-04 apres clarification de l'action admin coachs: le bouton `Initialiser coachs` est remplace par `Reparer liste coachs`, demande une confirmation et conserve `createdAt` quand un coach existe deja. Le pipeline local passait 11/11 et l'audit produit passait 39/39. Cette passe est maintenant depassee par `20260605-questionnaire-send-audit`.

Validation live actuelle: le site repond correctement, mais sert encore `app.js?v=20260605-coach-picker`. Il faut donc refaire un deploy Firebase depuis une console Firebase authentifiee ou avec `FIREBASE_TOKEN`, puis relancer `verify-dashboard-live.cmd`.

## Test visuel local

Le rendu local a ete valide avec le navigateur integre Codex via un serveur statique Node:

- `http://127.0.0.1:62741/` repond HTTP 200;
- l'ecran de connexion `Dashboard Coach` charge;
- aucune erreur console bloquante n'a ete detectee pendant le chargement initial;
- le diagnostic de page blanche ne s'affiche pas.

Le rendu authentifie complet doit encore etre valide dans Chrome ou dans l'app live apres publication, parce que l'acces Google/Firebase depend du compte connecte.

## Action requise pour publier la derniere version

Le live actuel sert encore `app.js?v=20260605-coach-picker`. La version locale attendue est `app.js?v=20260605-questionnaire-send-audit`.

Depuis la console Firebase interactive, lancer:

```cmd
cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
deploy-hosting-dashboard.cmd
```

Puis confirmer:

```cmd
verify-dashboard-live.cmd
```

Pour verifier l'etat reel des donnees Firestore apres publication ou apres `Synchroniser tous les coachs`:

```cmd
audit-live-firestore.cmd
```

Le script doit montrer des `syncRuns`, des `coachSyncStatus` et, pour Marc-Andre/Iheb, moins de clients sans telephone apres la sync enrichie.

## Action requise apres publication

1. Ouvrir `https://cfsb-dashboard-coach-aa9a4.web.app`.
2. Se connecter avec le compte admin.
3. Ouvrir `Guide`.
4. Cliquer `Synchroniser tous les coachs`.
5. Valider Marc-Andre, Iheb et un troisieme coach dans les onglets principaux.

## Test immediat apres publication

1. Ouvrir `https://cfsb-dashboard-coach-aa9a4.web.app`.
2. Se connecter avec le compte admin.
3. Ouvrir `Guide`.
4. Cliquer `Synchroniser tous les coachs`.
5. Selectionner Marc-Andre, Iheb, puis un troisieme coach.
6. Verifier:
   - `Clients`;
   - `To-do`;
   - `Questionnaires`;
   - `Rebooking`;
   - `Performance`;
   - `Alumni`.
7. Si un coach est vide, lire le diagnostic dans `Guide` avant de modifier le code.
8. Ouvrir les details `Voir entetes detectees dans les sources` et `Audit du matching coach` si Marc-Andre ou Iheb semblent vides malgre des donnees attendues.
9. Dans `Guide`, surveiller le compteur `Sans telephone`; ces clients doivent etre corriges avant de tester l'envoi questionnaire.

## Points a surveiller

- `scheduledDashboardSync` doit apparaitre dans Firebase Functions apres deploiement complet.
- `CORE_Clients_Manual` fait maintenant partie des sources lues par la sync Firebase. C'est la zone d'enrichissement pour les clients ajoutes/corriges manuellement, surtout les telephones necessaires a GHL et au questionnaire.
- Verification source du 2026-06-04: les lignes Iheb dans `CORE_Clients` existent, mais les colonnes `Phone` et `Email` sont vides pour les premiers clients observes. `SRC_CoachRx_Browser_All` contient les clients visibles CoachRx, mais pas de telephone. Donc un coach peut avoir des clients importes et rester bloque pour l'envoi questionnaire tant que `CORE_Clients_Manual` ou une future source GHL/Kilo n'enrichit pas les telephones.
- Le Sheet CSM externe doit inclure l'onglet `Formulaire Checkup` dans les candidats lus par Firebase; sans cet onglet, Performance peut afficher 0 check-up meme si le document CSM contient des reponses.
- Les anciens Sheets et Apps Script restent le filet de securite pendant la migration.
- Firestore est la base operationnelle du dashboard.
- Les champs manuels client ne doivent pas etre ecrases par une sync:
  - fin membership manuelle;
  - recurrence prevue dans Kilo;
  - risque coach;
  - notes/objectifs.
- Aucun token GHL ou donnees client privees ne doit etre place dans `firebase-dashboard/public`.

## Prochaine grosse passe recommandee

Le board complet est dans `firebase-dashboard/FINALIZATION_BOARD.md`.

1. Publier la version complete.
2. Lancer `Synchroniser tous les coachs`.
3. Comparer Marc-Andre et Iheb avec les sources Google Sheets.
4. Corriger le matching source si un coach a des lignes disponibles mais non matchees.
5. Tester l'envoi questionnaire avec un vrai contact GHL.
6. Tester un rebooking complet:
   - ouvert;
   - gere;
   - rebooke;
   - absence coach;
   - rouvrir.
7. Faire l'audit de la fiche client popup:
   - sections essentielles seulement;
   - source de chaque information;
   - edition rapide des champs manuels.
8. Faire l'audit des onglets un par un avec feedback coach reel.


