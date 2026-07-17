Etat publication 2026-06-19; mise a jour 2026-07-07: live cible `20260707-coachrx-extraction-guard`; Hosting publie et valide apres deploy; prochaine limite: validation humaine des coachs pilotes et parite Rebooking legacy.

Note mission vocale MVP: publication ciblee sur le bundle live `app.js?v=20260707-coachrx-extraction-guard`. Validation attendue: audit MVP 12/12, validation equipe technique avec `valider-dashboard-equipe.cmd`, verification stable avec `verify-dashboard-live-stable.cmd`, et audit acces coach live. Version precedente de reference: `20260612-rebooking-quiet-cards`.

# Dashboard Coach CFSB - Statut release pilote

Date: 2026-06-11

## Etat courant - 2026-06-12

Audit de reprise du 2026-06-19, apres publication Hosting:

- validation locale: `verify-dashboard-before-deploy.cmd` passe 26/26;
- audit produit automatise: 78/78;
- audit MVP equipe: 12/12;
- validation live stable: `verify-dashboard-live-stable.cmd` passe, le live repond et les assets publics restent propres;
- validation live stricte: `verify-dashboard-live.cmd` passe `9/9`;
- bundle live: `./app.js?v=20260707-coachrx-extraction-guard`;
- `APP_VERSION` live: `20260707-coachrx-extraction-guard`;
- ancienne version live avant cette publication: `20260612-rebooking-quiet-cards`;
- corrections locales pretes: langage coach plus clair, details techniques reserves admin/Guide, Rebooking phase 1 simplifie, questionnaires/rebooking moins bruyants cote coach, messages d'erreur coach sans jargon Firebase/Firestore;
- publication MVP: deploy Hosting effectue apres reauth interactive;
- audit Firestore live: OK;
- validation equipe technique: `valider-dashboard-equipe.cmd` passe;
- prochaine action humaine minimale: valider les 7 coachs pilotes dans l'app publiee.

Conclusion de reprise: le dashboard est en etat de MVP live presentable pour une validation interne accompagnee, mais il doit etre valide humainement avec les 7 coachs pilotes avant d'etre presente comme source d'equipe.

## Etat courant - 2026-06-09

Audit de reprise du 2026-06-09, sans publication ni modification live:

- validation locale: `verify-dashboard-before-deploy.cmd` passe 25/25 apres l'ajout du rapport `MIGRATION_READINESS.md` et du controle d'alignement Bob Operator / sources Google Workspace;
- validation locale cible apres passe acces coachs: syntaxe front-end, audit produit 51/51, registre sources et couverture Firestore valides;
- validation live: le Hosting live repond, mais sert encore l'ancien bundle `20260608-direct-import-bridge`;
- version locale prete: `20260609-coach-picker-stable`;
- acces coachs pilotes localement pret: les coachs avec courriel officiel peuvent s'auto-activer dans `users/{uid}` avec `role: coach`, `coachId`/`coachRxId` verrouilles et `source: firebase_self_provision_pilot`; `info@crossfitstbasilelegrand.com` reste le chemin admin/coproprio;
- blocage publication: la session Firebase CLI exige une reauth recente avant de verifier `GHL_PRIVATE_TOKEN` et `DASHBOARD_IMPORT_TOKEN`;
- garde-fou ajoute: `deploy-dashboard-complet.cmd` lance maintenant `tools/verify-firebase-auth-ready.cjs` avant la validation longue et arrete clairement le deploy si Firebase retourne `invalid_rapt` / reauth requise;
- bundle live: `./app.js?v=20260608-direct-import-bridge`;
- `APP_VERSION`: `20260608-direct-import-bridge`;
- audit Firestore live en lecture seule: bloque actuellement sur `invalid_rapt` tant que la reauth Firebase n'est pas refaite;
- derniere tentative confirmee: `audit-live-firestore.cmd --summary` retourne `invalid_rapt`, donc le dernier audit live exploitable reste celui deja journalise, pas une lecture fraiche;
- dernier sync global observe: `oOej80NxHYB0YTRrhEU9`;
- source du sync: `firebase_function_sync_sheets_scheduled`;
- heure du sync: `2026-06-09T03:53:06.684Z`;
- avertissements de sync: 25.

Lecture live actuelle par coach:

| Coach | Clients actifs | Sans telephone | To-do ouvertes | Reponses questionnaire | Rebookings ouverts | Diagnostic |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Marc-Andre Menard | 12 | 1 | 2 | 9 | 2 | High: telephone manquant, reponses non matchees, rebooking fragile |
| Iheb Yahyaoui | 24 | 5 | 9 | 10 | 17 | High: telephones manquants, To-do `TASKS_Current`, rebooking fragile |
| Camille Proulx | 3 | 0 | 0 | 0 | 0 | Low: pret pour test envoi GHL |
| David Olivier | 8 | 2 | 2 | 2 | 1 | Medium: telephones manquants et reponses a lire |
| Gabriel Mayer Bedard | 3 | 0 | 1 | 5 | 0 | Medium: reponses non matchees/a lire |
| Hugo Lelievre | 14 | 5 | 0 | 1 | 1 | Medium: telephones manquants et rebooking fragile |
| Raphael Samson | 25 | 4 | 0 | 1 | 3 | Medium: telephones manquants et rebooking fragile |

Conclusion de reprise: la plateforme Firebase publiee n'est pas bloquee sur le chargement, mais elle n'a pas encore recu la version locale `20260609-coach-picker-stable`. Le travail restant est double: refaire la reauth Firebase pour publier/valider le live, puis poursuivre le travail de qualite des sources, matching par telephone, validation des To-do issues de `TASKS_Current`, test GHL reel et parite Rebooking avec l'app Apps Script existante.

## Etat precedent - 2026-06-08

La version Firebase Hosting sert maintenant `20260608-direct-import-bridge`. La publication effectuee est un deploy Hosting seulement; les Functions restent a redeployer quand le secret `DASHBOARD_IMPORT_TOKEN` sera cree pour le pont Apps Script -> Firestore.

Preuves verifiees:

- validation locale historique: `verify-dashboard-before-deploy.cmd` passe 21/21;
- audit produit automatise: 49/49;
- validation live: `verify-dashboard-live.cmd` passe 9/9 apres publication Hosting;
- Firestore audit live apres resync: `audit-live-firestore.cmd` passe et produit maintenant un diagnostic coach par coach avec causes probables, actions recommandees et exemples rebooking a verifier;
- bundle live: `./app.js?v=20260608-direct-import-bridge`;
- `APP_VERSION`: `20260608-direct-import-bridge`;
- dernier sync global Firestore observe: `G2qALvTLDtePBMN4EC1A`;
- source du sync: `firebase_firestore_sync_request_all`;
- heure du sync: `2026-06-08T17:23:24.369Z`;
- dernier resync coach cible: Iheb `QPCZMFJMYeXxeNhHZdeY` a `2026-06-08T15:14:33.559Z`;
- derniere sync planifiee observee: `Rr0ThluVxqxNepe5jKRF` a `2026-06-08T15:53:07.850Z`;
- avertissements de sync: 25.

Lecture produit actuelle:

- Marc-Andre et Iheb ont maintenant des donnees live utilisables dans Firestore;
- Iheb affiche encore 9 To-do ouvertes, mais elles viennent de `TASKS_Current`, pas d'une generation automatique CoachRx;
- Gabriel n'a plus de tache questionnaire sans statut apres la resync;
- les diagnostics To-do expliquent maintenant la source des actions visibles;
- les diagnostics Rebooking affichent une action recommandee;
- l'audit Firestore live rafraichit maintenant le token Firebase CLI a partir du `refresh_token`, ce qui evite le blocage `ACCESS_TOKEN_TYPE_UNSUPPORTED` quand l'access token local est expire;
- l'onglet Guide expose un resume de qualite des donnees par coach;
- les reponses questionnaire affichent un panneau de signaux coach et une priorite lisible;
- aucun secret GHL ni token rebooking ne doit etre publie dans les assets publics.

Restant a traiter avant de parler de produit final:

- corriger ou valider les clients sans telephone;
- valider les reponses questionnaire non matchees;
- auditer les 9 To-do Iheb de `TASKS_Current` avec la source Sheets;
- comparer le module Rebooking Firebase avec l'app historique avant de decommissionner l'ancien lien;
- faire un audit UX humain onglet par onglet avec Michael apres cette passe.

## Historique precedent - 2026-06-05

## Verdict courant

La version Firebase publiee la plus recente verifiee sert encore le bundle
`20260605-coach-picker`.

La version locale preparee, mais pas encore publiee parce que la session Firebase CLI doit etre reauthentifiee, est
`20260605-questionnaire-send-audit`.

Verification du 2026-06-05, reprise week-end:

- local: `verify-dashboard-before-deploy.cmd` passe completement;
- live: `verify-dashboard-live.cmd` confirme que Hosting sert encore `./app.js?v=20260605-coach-picker`;
- deploy complet tente avec `deploy-dashboard-complet.cmd`, mais bloque par `Authentication Error: Your credentials are no longer valid`;
- audit Firestore live tente avec `tools/audit-live-firestore.cjs`, mais bloque aussi par l'auth OAuth/Firebase expiree;
- prochaine action humaine minimale: relancer `firebase login --reauth` ou fournir `FIREBASE_TOKEN`, puis relancer `deploy-dashboard-complet.cmd`.

La couche technique principale est maintenant fonctionnelle:

- Firebase Hosting publie le dashboard;
- Firestore Rules et indexes sont deployes;
- Cloud Functions sont deployees;
- l'envoi questionnaire reste cote Function avec secret GHL;
- la synchronisation Google Sheets passe par la file `syncRequests`;
- les API Google Sheets et Drive sont activees pour le projet Firebase;
- `coachSyncStatus` expose maintenant les compteurs essentiels et les diagnostics courts.
- l'import clients filtre les noms parasites CoachRx evidents (`Not set`, jours de semaine, placeholders) et les abreviations/initiales courtes comme `BR`, `KA`, `LTP`, `JFL`;
- l'import clients filtre aussi les lignes CoachRx ou le nom client est exactement le nom du coach et ou aucun telephone n'est fourni, car ces lignes representent souvent le coach lui-meme et non un client actif;
- les anciens imports automatiques absents de la derniere source sont neutralises sans suppression:
  clients en `import_stale`, taches en `archived`.
- la source `SRC_CoachRx_Browser_All` alimente les clients et le contexte, mais ne cree plus automatiquement de To-do programme a partir de valeurs ambigues comme `Last Monday`;
- les titres de test evidents dans `TASKS_Current` sans client associe (`aaaa`, `dfghj`, etc.) sont ignores pour garder la To-do exploitable.
- les tentatives d'envoi questionnaire sont maintenant visibles dans l'onglet Questionnaires; les erreurs comme telephone manquant, contact GHL introuvable ou erreur GHL sont journalisees dans `questionnaireSends` quand la Function peut identifier le client.
- le diagnostic To-do expose maintenant les taches par type/source pour distinguer les vraies actions `TASKS_Current` des anciens faux programmes;
- les reponses questionnaire affichent maintenant des signaux coach colores et explicites: douleur, motivation, satisfaction, objectif, progression, programme, support, note client.
- le rebooking expose un diagnostic de source: lignes `SRC_Rebookings_SemiPrive` disponibles/matchees, rebookings ouverts, non relies client, sans telephone, matching `phone/name/unmatched`, separation `TASKS_Current` vs source rebooking dediee et statuts proteges par Firebase.
- le menu coach est maintenant un bouton explicite avec une liste de coachs cliquable; le deploy `20260605-coach-picker` remplace l'ancien selecteur natif qui pouvait forcer l'utilisateur a garder le clic enfonce selon le navigateur;
- la To-do filtre maintenant les taches `sourceStale`, archivees, completees ou ignorees avant l'affichage, meme si un ancien document Firestore avait encore le statut `open`;
- la version locale `20260605-client-source-truth` durcit encore cette regle: une tache sans statut explicite `open` ou `waiting` ne doit plus apparaitre dans la To-do;
- la version locale `20260605-client-source-truth` reconnait aussi les champs questionnaire V2 `coach_alignment_score` et `goal_change_detail` comme champs connus au lieu de les reléguer en reponses secondaires;
- la version locale `20260605-client-source-truth` clarifie aussi la fiche client: telephone comme cle principale, source actuelle, matching/dedupe, derniere sync, champs manuels et note de transfert coach avec donnees liees;
- la version locale `20260605-questionnaire-send-audit` ajoute une indication d'action dans le journal d'envoi questionnaire: telephone a corriger, contact GHL introuvable, secret GHL manquant, erreur Functions ou validation du workflow `dashboardcoach`;
- la version locale `20260605-questionnaire-send-audit` force aussi le front-end a fermer une tentative locale en erreur si la Function retourne un resultat non-ok sans exception, afin d'eviter les tentatives qui restent visuellement en attente;
- la version locale `20260605-questionnaire-send-audit` corrige la variable CSS de hover du selecteur coach et des options cliquables;
- le diagnostic To-do compare maintenant les actions visibles avec `TASKS_Current`, les taches importees, les taches stale archivees et les sources visibles pour isoler rapidement les faux programmes ou vieux imports;
- les To-do importees depuis `TASKS_Current` affichent une consigne coach et leur source;
- les titres ambigus comme `Decider quoi faire avec ce client CoachRx` sont normalises en `Valider le statut CoachRx du client`.
- les clics `Envoyer questionnaire` creent maintenant une tentative visible dans `questionnaireSends` avant l'appel GHL; si Firebase Functions ou GHL echoue, l'erreur reste visible dans l'inbox au lieu de disparaitre silencieusement.
- l'envoi questionnaire vers GHL exige maintenant un match exact du telephone normalise; le backend ne peut plus prendre le premier contact retourne par une recherche GHL si son telephone ne correspond pas.
- l'onglet Questionnaires a maintenant un resume coach lisible: rouge, orange, jaune, vert, a relancer, non matchees, prets a envoyer et erreurs d'envoi;
- les reponses questionnaire sont triees par priorite coach, les clients prets a envoyer sont classes avant ceux sans telephone, et les cartes indiquent clairement la source client ou le besoin de matching par telephone.
- chaque carte de reponse questionnaire affiche maintenant une priorite coach explicite, la raison principale et la prochaine action recommandee avant les details.

## Preuves locales

- `verify-dashboard-before-deploy.cmd`: 21/21 reussi.
- Audit produit automatise: 45/45.
- Smoke test Hosting local: reussi.
- Aucun secret GHL evident dans les fichiers publics.

## Preuve live actuelle

- `verify-dashboard-live.cmd`: 8/9 reussi contre la version attendue `20260605-questionnaire-send-audit`.
- URL live: `https://cfsb-dashboard-coach-aa9a4.web.app`
- Bundle live verifie: `./app.js?v=20260605-coach-picker`
- Version live: `20260605-coach-picker`
- Ecart live: la version locale prete n'est pas encore servie par Hosting.
- Functions live: `sendQuestionnaire`, `syncDashboardFromSheets`, `scheduledDashboardSync` et `processSyncRequest` deployees apres le durcissement du matching GHL par telephone.

## Changements locaux en attente de publication

- Bundle prepare: `./app.js?v=20260605-questionnaire-send-audit`.
- To-do: les documents `tasks` sans statut explicite ne sont plus consideres ouverts par defaut.
- Questionnaires: `coach_alignment_score`, `goal_change_detail`, `recent_success_type` et `contactRequest` sont mieux visibles dans le resume de reponse.
- Clients: la fiche client montre maintenant la fiabilite de l'identite (`telephone fiable`, `sans telephone`, `identite fragile`), explique la source de synchronisation et permet au coach proprietaire ou a l'admin de transferer le dossier vers un coach pilote avec les donnees liees.
- Audit live: `tools/audit-live-firestore.cjs` expose maintenant les statuts questionnaire, triages, erreurs d'envoi et taches sans statut.
- Publication bloquee pour l'instant par `firebase login --reauth` expire; validation locale complete reussie le 2026-06-05 avec `verify-dashboard-before-deploy.cmd` 13/13 et audit produit 45/45. La validation courante ajoute le registre officiel des sources, le plan d'ingestion, la matrice d'activation des sources et le prevol Apps Script, puis passe maintenant 18/18.
- L'audit live Firestore detecte maintenant explicitement les erreurs `401`, `UNAUTHENTICATED` et `ACCESS_TOKEN_TYPE_UNSUPPORTED`, puis affiche les commandes de reconnexion au lieu de laisser un message brut.

## Sync globale Firebase

Demande globale traitee le 2026-06-05 apres nettoyage To-do, clarification des actions, filtre anti-coach-comme-client et diagnostic rebooking enrichi:

- coachs traites: 7;
- clients actifs importes: 92;
- clients sans telephone normalise: 17;
- taches importees: les anciennes taches sont conservees en historique, mais les taches ouvertes ne viennent plus de CoachRx Browser;
- reponses questionnaire importees: 28;
- rebookings importes: 29;
- check-ups CSM importes: 745;
- impacts importes: 0;
- avertissements: 25.

Controle direct Firestore apres sync:

- Marc-Andre Menard: 12 clients actifs + 10 anciens imports `import_stale`.
- Iheb Yahyaoui: 24 clients actifs + 8 anciens imports `import_stale`.
- Les codes/abreviations CoachRx comme `BR`, `KA`, `LTP`, `JFL`, `JFV`, `RJM`, `JPS`, `MPC` ne restent plus comme clients actifs apres sync.
- Les lignes ou un coach apparait comme son propre client sans telephone, par exemple `Gabriel Mayer Bedard`, ne restent plus comme clients actifs apres sync.
- Les taches absentes de la derniere source ont ete archivees au lieu de rester ouvertes.
- Les taches programme provenant seulement de CoachRx Browser ont ete archivees et ne reviennent pas apres la sync post-deploy.
- Les deux taches de test Marc-Andre (`aaaa`, `dfghj`) ne sont plus ouvertes.

## Etat par coach apres sync globale

| Coach | Clients | Sans telephone | To-do ouvertes | Questionnaires | Rebookings | Check-ups | Etat |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Marc-Andre Menard | 12 actifs | 1 | 0 | 9 | 3 | 167 | Donnees presentes, 10 anciens imports neutralises |
| Iheb Yahyaoui | 24 actifs | 5 | 9 | 10 | 19 | 200 | Donnees presentes, 8 anciens imports neutralises; To-do restante vient de `TASKS_Current` |
| Raphael Samson | 25 actifs | 4 | 0 | 1 | 3 | 82 | Donnees presentes, codes parasites neutralises |
| David Olivier | 8 actifs | 2 | 0 | 2 | 1 | 93 | Donnees presentes, codes parasites neutralises |
| Camille Proulx | 3 actifs | 0 | 0 | 0 | 0 | 33 | Donnees presentes apres nouvel import |
| Gabriel Mayer Bedard | 3 actifs | 0 | 0 | 5 | 0 | 33 | Donnees presentes apres nouvel import, ligne coach-comme-client neutralisee |
| Hugo Lelievre | 14 actifs | 5 | 0 | 1 | 3 | 78 | Donnees presentes apres nouvel import |

Audit live du 2026-06-05 apres redeploiement Functions:

- Marc-Andre, Iheb, Camille, David, Gabriel, Hugo et Raphael ont tous des clients actifs dans Firestore;
- Camille: 3 clients actifs, 0 telephone manquant, 0 To-do ouverte;
- Gabriel: 3 clients actifs, 0 telephone manquant, 0 To-do ouverte;
- Hugo: 14 clients actifs, 5 telephones manquants, 0 To-do ouverte;
- Iheb: 24 clients actifs, 5 telephones manquants, 9 To-do ouvertes, toutes issues de `TASKS_Current`;
- aucune To-do programme ouverte ne vient du snapshot CoachRx Browser.

## Diagnostic source

`SRC_CoachRx_Browser_All` contient maintenant des lignes exploitables pour les sept coachs pilotes. Les nouveaux imports Camille, Gabriel et Hugo alimentent Firestore.

Important: `SRC_CoachRx_Browser_All` est traite comme source client/contexte. Il ne doit pas creer automatiquement des missions programme, parce que les valeurs visibles comme `Last Monday` ont provoque de fausses priorites dans la To-do.

`CORE_Clients` contient actuellement surtout des lignes Iheb dans la plage verifiee. L'onglet `CORE_Clients_Manual` reste la zone d'enrichissement a utiliser pour corriger les telephones, courriels, memberships manuels et clients ajoutes manuellement.

## Prochaines priorites

1. Enrichir les telephones manquants dans `CORE_Clients_Manual` ou une source GHL/Kilo fiable.
2. Faire valider par Michael si les 9 To-do restantes de Iheb dans `TASKS_Current` sont des actions voulues ou si certaines doivent quitter la source.
3. Valider l'envoi questionnaire avec un vrai contact GHL qui a un telephone normalise, puis confirmer que `questionnaireSends` affiche `sent` ou une erreur explicite dans l'onglet Questionnaires.
4. Revenir ensuite au rebooking comme module secondaire a comparer avec l'app Apps Script historique.

## Audit To-do Iheb

Audit Firestore live du 2026-06-05 apres la sync `MgCwauHi8GDwXvEs4WY4`:

- 9 To-do ouvertes;
- 9/9 viennent de `google_sheets_tasks_current`;
- 0 To-do ouverte vient de `SRC_CoachRx_Browser_All`;
- types: 3 rebookings, 4 validations, 2 manuelles.

Details visibles:

- `Rebooker la seance semi-privee`: Brigitte Richard, Anne-Marie Bisaillon, Roxanne Dumas;
- `Valider le statut CoachRx du client`: Natacha Lord, Nicolas Provost, Sophie Marmet, Mathilde Dumas;
- `Verifier la compliance exercice`: Karine Aubriot;
- `Declarer les impacts de la semaine`: tache performance sans client associe.

Decision produit restante: si ces actions ne sont pas voulues, il faut corriger `TASKS_Current`; le backend ne les invente plus.

## Diagnostic Rebooking Iheb

Controle direct Firestore live apres la sync post-deploy:

- 19 rebookings importes;
- 17 ouverts, 2 rebookes;
- 3 viennent de `TASKS_Current`;
- 16 viennent de `SRC_Rebookings_SemiPrive`;
- 10 matches par nom, 9 non matches;
- 0 ligne rebooking source avec telephone;
- 9 rebookings ouverts sans fiche client reliee.

Decision produit restante: les rebookings sans telephone ne peuvent pas etre fiables a 100% par matching nom. Il faut enrichir la source rebooking avec telephone ou accepter une file de validation coach/admin.

Le goal ne doit pas etre marque complete tant que les modules authentifies, surtout questionnaires et rebooking, n'ont pas ete valides avec donnees reelles.


