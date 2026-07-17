Etat publication 2026-07-07: live cible `20260707-coachrx-extraction-guard`; Hosting a publier et valider; prochaine limite: validation humaine des 7 coachs pilotes et parite Rebooking legacy.

Priorite immediate: publier `20260707-coachrx-extraction-guard`, lancer `valider-dashboard-equipe.cmd`, puis faire un Audit coach par coach. Si publication rapide requise, utiliser `publier-dashboard-mvp.cmd`; pour la publication complete, utiliser `deploy-dashboard-complet.cmd`.

# File de travail - Dashboard Coach Firebase

Derniere mise a jour: 2026-06-11

## Priorite 0 - Etat live courant

- Le live doit servir `app.js?v=20260626-coach-permissions-accomplishments` apres publication.
- `verify-dashboard-live.cmd` passe strictement.
- `valider-dashboard-equipe.cmd` passe techniquement: live strict + audit Firestore live.
- Le deploy Hosting de `20260626-coach-permissions-accomplishments` doit etre valide. La prochaine limite est la validation humaine des 7 coachs pilotes et la parite Rebooking avec l'app historique.
- Le flux questionnaire de bout en bout a ete prouve avec Michael Grondin: envoi GHL `tag_added`, reponse recue, sync puis statut `to_read`.
- Les reponses questionnaire sont maintenant synchronisees automatiquement aux 15 minutes par `scheduledQuestionnaireResponseSync`.
- Le rebooking est clarifie produit: l'objectif n'est pas de lister toutes les annulations, mais de maintenir une liste de seances payees a remettre, avec fermeture par `Seance rebookee`, `Suivi fait` ou `Absence coach`.
- `deploy-dashboard-complet.cmd` arrete maintenant rapidement si Firebase exige une reauth, via `tools/verify-firebase-auth-ready.cjs`, avant de lancer la validation longue.
- La validation locale passe avec `verify-dashboard-before-deploy.cmd` 26/26.
- L'audit produit automatise passe 78/78 apres la clarification langage coach/admin, les garde-fous de bruit visuel, la correction telephone ciblee, Alumni, transfert coach et rebooking compact.
- L'auto-activation coachs pilotes est prete localement: Marc-Andre, Iheb, Camille, David, Hugo et Raphael peuvent creer leur profil Firestore avec leur courriel officiel; Gabriel/Michael utilisent `info@crossfitstbasilelegrand.com` comme acces admin/coproprio.
- Cette auto-activation doit etre reverifiee sur le live `20260626-coach-permissions-accomplishments`.
- Passe locale du 2026-06-09: l'onglet Questionnaires garde les 5 vues principales, ajoute un filtre de priorite utile seulement dans les vues de reponses, et permet de transformer une reponse en mission coach avec `Creer mission + lu`.
- Passe locale du 2026-06-09: le selecteur de coach a ete remis en picker cliquable avec liste visible, hover/focus clair et garde-fou produit. Cette correction n'est pas presumee live tant qu'un deploy n'a pas ete fait.
- Passe locale du 2026-06-09: l'import direct `ghl_contacts` est durci comme enrichissement de clients existants seulement; il ajoute/confirme telephone, email et `ghlContactId`, preserve la source principale, ne cree pas de client orphelin, ne marque jamais stale, et la validation locale passe.
- L'audit Firestore live a passe en lecture seule apres publication MVP.
- Dernier sync global observe: `oOej80NxHYB0YTRrhEU9`, source `firebase_function_sync_sheets_scheduled`, a `2026-06-09T03:53:06.684Z`, avec 25 avertissements.
- Dernier audit live enrichi: `2026-06-09T04:46:00.353Z`. Statut global: `needs_source_activation`.
- Totaux live actuels: 89 clients actifs, 17 sans telephone, 14 To-do ouvertes, 28 reponses questionnaire, 0 envoi questionnaire journalise, 16 reponses non matchees, 29 rebookings, 24 rebookings ouverts, 19 rebookings sans telephone source et 18 sans client relie.
- Les prochaines actions a plus fort levier sont maintenant exposees directement par `audit-live-firestore.cmd --summary`: source telephone client, audit `TASKS_Current`, matching questionnaire par telephone, journal d'envoi GHL, puis parite rebooking legacy.
- Les sept coachs pilotes sont toujours inclus dans la sync planifiee.
- La priorite actuelle n'est plus de prouver que Firebase demarre; c'est de brancher ou confirmer les sources directes, puis de corriger les donnees fragiles qui ressortent dans l'audit.
- `audit-live-firestore.cmd` rafraichit maintenant le token Firebase CLI depuis le `refresh_token` local avant d'appeler Firestore, ce qui reduit les blocages d'audit apres expiration de l'access token.
- Pour une lecture coach par coach sans JSON complet, utiliser `audit-live-firestore.cmd --summary`.
- Prochaine action produit: Audit coach par coach dans l'app live, puis parite rebooking avec l'app historique en comparant les seances a remettre par client.
- Si une correction doit etre publiee, lancer d'abord `firebase-login-dashboard.cmd` si le prevol demande une reauth, puis utiliser `publier-dashboard-mvp.cmd`, `verify-dashboard-live.cmd` et `audit-live-firestore.cmd`.
- Pour publier les Functions incluant `ingestDashboardSource`, creer d'abord le secret Firebase `DASHBOARD_IMPORT_TOKEN`; sinon utiliser seulement `deploy-hosting-dashboard.cmd` pour les correctifs front-end.
- La validation live est maintenant reproductible avec `verify-dashboard-live.cmd`.
- Avant chaque publication, lancer `verify-dashboard-before-deploy.cmd`; il inclut maintenant l'audit produit des exigences pilotes et la validation des scripts de publication.
- Cette verification inclut aussi le test comportemental `verify-questionnaire-followup-logic.cjs` pour proteger les relances questionnaire contre les anciennes reponses.
- Cette verification inclut aussi `verify-dashboard-workflows.cjs` pour proteger le flux vacances Rebooking, les statuts Alumni et le transfert complet des donnees liees lors d'un changement de coach.
- Cette verification inclut aussi une couverture d'import pour les sept coachs pilotes, la deduplication CORE/CoachRx par telephone et le matching questionnaire par telephone.
- Cette verification inclut aussi `verify-deploy-scripts.cjs` pour bloquer un deploy sans validation, un mauvais dossier Hosting ou une perte du chemin `FIREBASE_TOKEN`.
- Cette verification inclut aussi `verify-ingestion-plan.cjs` pour garder le registre des sources, le plan d'ingestion et le backend Firebase alignes.
- Cette verification inclut aussi `verify-source-payload-contracts.cjs` pour garder les formats CoachRx, CSM, GHL, questionnaire, check-ups et rebooking alignes avant tout write Firestore.
- Cette verification inclut aussi `verify-source-activation-kit.cjs` pour garder la procedure d'activation CoachRx, client directory, GHL, questionnaire, check-ups et rebooking executable sans relire toute la conversation.
- Cette verification inclut aussi `verify-source-activation-status.cjs` et `SOURCE_ACTIVATION_STATUS.json` pour separer les preuves deja obtenues, le travail possible sans Michael et les blocages d'acces par source.
- Passe locale du 2026-06-09: `verify-source-activation-status.cjs` verifie maintenant que chaque paquet d'activation live correspond a un statut source, un contrat de payload, un sample non sensible et une collection Firestore cible. Resultat: le registre source passe 21/21 et le pipeline complet repasse 25/25.
- Passe locale du 2026-06-09: `SOURCE_REGISTRY.json` contient maintenant `phoneResolutionPolicy`. Decision: correction manuelle d'abord, GHL ensuite comme meilleure source de confirmation/enrichissement telephone cote serveur, puis repertoire client, puis CoachRx. Questionnaire et Rebooking ne peuvent pas corriger automatiquement un telephone. Le registre source passe 14/14.
- Passe locale du 2026-06-09: `SOURCE_ACTIVATION_STATUS.json` contient maintenant `pilotSymptomTriage`. Les symptomes pilotes comme To-do vide/bruitee, client sans telephone, questionnaire non envoye, rebooking divergent ou acces coach bloque pointent vers la source a verifier, les preuves attendues, les actions interdites et la prochaine action. Le but est d'eviter les micro-corrections UX avant d'avoir identifie la source responsable.
- Passe locale du 2026-06-09: `audit-live-firestore.cmd --summary` est maintenant pret a inclure `globalDiagnostic.symptomTriage`, tire de `SOURCE_ACTIVATION_STATUS.json`, pour relier automatiquement les chiffres live aux symptomes produit et aux sources a verifier.
- Passe locale du 2026-06-09: `SOURCE_ACTIVATION_STATUS.json` contient maintenant `diagnosticPlaybooks` pour les boucles de feedback pilotes: To-do vide/bruitee, clients sans telephone, envoi/reponse questionnaire manquant, rebooking divergent et acces coach. `audit-live-firestore.cmd --summary` peut les exposer dans `globalDiagnostic.diagnosticPlaybooks`.
- Passe locale du 2026-06-09: l'onglet Guide affiche maintenant un resume operationnel des sources de verite: le dashboard lit Firestore, les sources vivantes poussent vers Cloud Functions securisees, les Sheets restent backup/audit/temporaire, les champs manuels sont proteges et les conflits se reglent via `SOURCE_REGISTRY.json`.
- Passe locale du 2026-06-09: ajout de `apps-script/dashboard-live-source-adapters.gs`. Les scripts vivants peuvent maintenant preparer un payload Firebase pour CoachRx, repertoire client, GHL, questionnaire, check-ups ou rebooking sans creer de Sheet intermediaire obligatoire; chaque chemin conserve un preview avant write.
- Passe locale du 2026-06-09: decision produit corrigee. Le pont direct CoachRx -> Firestore est mis en pause pour le pilote rapide. Le chemin actif reste extension CoachRx -> Apps Script/Sheets -> sync Firebase/dashboard.
- Passe locale du 2026-06-09: l'Apps Script ne cree plus automatiquement de To-do Programme/Compliance a partir des signaux CoachRx ambigus. CoachRx sert de contexte client; les vraies actions doivent venir de TASKS_Manual, questionnaire, rebooking ou d'une source d'action explicite.
- Passe live du 2026-06-09: AUTO-009 Questionnaire client-coach V2 a maintenant un push non bloquant vers Firestore par `syncRequests` apres l'ecriture de la reponse. Deployment Apps Script mis a jour en version 11, URL publique inchangee. Prochaine preuve requise: une nouvelle reponse reelle doit apparaitre dans Firestore ou dans la file `A valider`.
- Passe live du 2026-06-09: l'audit Firestore `audit-live-firestore.cmd --summary` repasse. Dernier audit observe: `2026-06-09T20:28:53.565Z`; dernier sync global: `94Cn9f4X1SRbQqubbsnP` a `2026-06-09T15:53:08.906Z`; totaux: 89 clients actifs, 17 sans telephone, 13 To-do ouvertes, 28 reponses questionnaire, 0 envoi questionnaire journalise, 16 reponses non matchees, 29 rebookings, 24 rebookings ouverts.
- Passe locale du 2026-06-09: `verify-source-payload-contracts.cjs` verifie maintenant aussi la syntaxe des adaptateurs Apps Script, les sept coachs pilotes, les paires preview/push et l'ordre obligatoire preview avant write Firebase. Resultat cible: 19/19 pour les contrats payload sources.
- Cette verification inclut aussi `verify-pilot-coach-access.cjs` pour garantir que les courriels officiels, les CoachRx ID, l'auto-activation coach et l'acces admin `info@` restent alignes avant publication.
- Cette verification inclut aussi `verify-migration-readiness.cjs` et `MIGRATION_READINESS.md` pour garder claire la difference entre Firestore comme base operationnelle, Sheets comme backup/audit et les sources directes a activer.
- Cette verification inclut aussi `verify-bob-source-alignment.cjs` pour confirmer que les automations Bob Operator, Sheets et Apps Script cites comme sources du dashboard restent alignes.
- Le handoff detaille pour les scripts prives et sources Google Workspace est dans `BOB_OPERATOR_SOURCE_HANDOFF.md`; il doit rester la reference de travail de Bob avant toute action live.
- Cette verification bloque les appels Windows ambigus a `firebase-tools-instant-win.exe deploy` dans une mauvaise console. Les scripts utilisent `firebase` si disponible; sinon ils peuvent utiliser l'executable local seulement avec `FIREBASE_TOKEN`, ou demander une console Firebase interactive.
- Cette verification inclut aussi `verify-hosting-smoke.cjs` pour charger localement `index.html`, `app.js`, `styles.css`, le fallback SPA et verifier l'absence de secret public evident.
- Confirmer dans Firebase Console que `sendQuestionnaire`, `syncDashboardFromSheets`, `processSyncRequest` et `scheduledDashboardSync` apparaissent dans Firebase Functions.
- Confirmer dans l'app live que `Synchroniser tous les coachs` alimente Firestore et cree un nouveau `syncRuns`.
- Confirmer apres publication qu'un coach pilote peut se connecter avec son propre courriel et voir son dashboard sans que Michael cree manuellement `users/{uid}`.
- Apres chaque correction importante, confirmer que Hosting sert bien `app.js?v=20260626-coach-permissions-accomplishments` ou plus recent, puis lancer `valider-dashboard-equipe.cmd`.
- Les scripts de deploy lancent maintenant `verify-dashboard-live.cmd` apres publication pour bloquer les faux succes ou une ancienne version servie par Firebase.
- Si Codex relance un deploy et recoit `Cannot run login in non-interactive mode`, ne pas investiguer le code: passer par un terminal authentifie ou `FIREBASE_TOKEN`.
- Si `audit-live-firestore.cmd` retourne `invalid_rapt`, Google exige une reauthentification recente du compte Firebase CLI; relancer `firebase-tools-instant-win.exe login --reauth`, puis refaire l'audit.

## Priorite 1 - Donnees coachs

Etat live observe le 2026-06-09:

| Coach | Clients actifs | Sans telephone | To-do ouvertes | Reponses questionnaire | Rebookings ouverts | Prochaine action |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Marc-Andre Menard | 12 | 1 | 2 | 9 | 2 | Valider les 2 To-do questionnaire et matcher les reponses |
| Iheb Yahyaoui | 24 | 5 | 9 | 10 | 17 | Auditer `TASKS_Current`, puis corriger telephones/rebooking |
| Camille Proulx | 3 | 0 | 0 | 0 | 0 | Tester un vrai envoi GHL |
| David Olivier | 8 | 2 | 2 | 2 | 1 | Corriger telephones et lire les reponses |
| Gabriel Mayer Bedard | 3 | 0 | 1 | 5 | 0 | Matcher/classer les reponses questionnaire |
| Hugo Lelievre | 14 | 5 | 0 | 1 | 1 | Corriger telephones et verifier rebooking |
| Raphael Samson | 25 | 4 | 0 | 1 | 3 | Corriger telephones et verifier rebooking |

- Utiliser `DATA_INGESTION_PLAN.md`, `DATA_SOURCE_ACTIVATION_MATRIX.md` et `SOURCE_REGISTRY.json` comme reference avant d'ajouter une nouvelle source.
- Pour un pont Apps Script direct, partir de `apps-script/dashboard-import-bridge-template.gs`.
- Brancher les sources dans cet ordre:
  - CoachRx clients/contexte vers `coachrx_clients`;
  - CSM/Kilo/repertoire client vers `client_directory`;
  - GHL contacts vers `ghl_contacts` seulement cote serveur, comme enrichissement de clients existants seulement;
  - questionnaire vers `questionnaire_responses` est active pour les nouvelles reponses via la file privee `syncRequests`; il reste a valider un vrai parcours client -> Firestore;
  - check-ups CSM vers `checkups`;
  - rebooking vers `rebooking` apres comparaison avec l'app historique.
- Ne pas forcer un Google Sheet intermediaire si le script possede deja la donnee vivante.
- Garder les Sheets comme backup/audit tant que les ponts directs n'ont pas ete valides en production.
- Regle GHL confirmee localement: un import `ghl_contacts` peut ajouter/confirmer telephone, email et `ghlContactId`, mais ne cree pas de client orphelin, ne marque jamais stale, et ne remplace pas la source principale du client.
- Avant d'activer un pont direct, confirmer:
  - `DASHBOARD_IMPORT_TOKEN` dans Firebase Secret Manager;
  - `DASHBOARD_IMPORT_TOKEN` dans Script Properties du script prive;
  - un `sourceType` present dans `SOURCE_REGISTRY.json`;
  - un contrat present dans `SOURCE_PAYLOAD_CONTRACTS.json`;
  - une carte d'activation presente dans `SOURCE_ACTIVATION_KIT.md`;
  - un statut courant dans `SOURCE_ACTIVATION_STATUS.json`;
  - un `previewDashboardImportPayload_` reussi sur 1 a 3 lignes avant tout ecriture Firestore;
  - un rollback documente si la source envoie une donnee incomplete.
- Lancer `Synchroniser tous les coachs` depuis `Guide`.
- Verifier Marc-Andre et Iheb dans `Clients`.
- Confirmer que le selecteur coach natif change de coach en un clic, sans devoir tenir le bouton enfonce.
- Si un coach est vide, lire dans `Guide`:
  - lignes disponibles vs lignes matchees;
  - entetes detectees;
  - alias coach reconnus;
  - exemples de signaux non matches;
  - lignes matchees sans nom client.
- Lire aussi le compteur `Sans telephone`, car ces clients ne pourront pas recevoir le questionnaire via GHL tant que le telephone n'est pas normalise.
- Corriger les alias ou le mapping selon le diagnostic reel.
- Si le test local passe mais qu'un coach reel reste vide apres publication, prioriser les entetes/source Sheets affichees dans `Guide`: le probleme est probablement une source non alimentee, une colonne inconnue ou un export absent plutot qu'un bug de matching general.
- Valider que les champs manuels client ne sont pas ecrases par une nouvelle sync.
- Confirmer apres publication que les exports incomplets n'effacent plus les champs utiles par des valeurs vides.
- Confirmer que la deduplication regroupe d'abord par telephone, ensuite par ID source, puis seulement par nom.
- Confirmer en reel qu'un client ajoute manuellement par un coach se fusionne avec sa fiche CoachRx/Sheets quand il apparait dans les imports, sans perdre ses dates manuelles, notes ou risque coach.

## Priorite 2 - Utilisation coach quotidienne

- Verifier la To-do avec un coach qui a des clients reels.
- Confirmer que `Ajouter une note` remplace bien l'ancien bloc capture rapide.
- Garder le bloc capture rapide retire de la page; l'audit produit le bloque maintenant comme regression.
- Confirmer que chaque tache a seulement des boutons utiles:
  - faire;
  - masquer;
  - relancer;
  - valider;
  - ouvrir fiche client.
- Verifier que chaque action donne un toast ou une confirmation visible.

## Priorite 3 - Clients

- Auditer la fiche client popup avec un vrai dossier.
- Garder seulement les informations utiles:
  - telephone;
  - membership;
  - fin membership manuelle;
  - recurrence Kilo manuelle;
  - risque coach;
  - dernier questionnaire;
  - notes/objectifs.
- Ajouter une indication de source claire pour chaque champ important.
- Confirmer que la fiche affiche clairement la cle de matching:
  - telephone fiable;
  - ID source temporaire;
  - identite fragile si aucun telephone/sourceId.
- Confirmer que le bloc `Source et synchronisation` explique la source principale, le matching/dedupe et la derniere sync sans forcer le coach a lire Firestore.
- Valider le matching client manuel -> client importe CoachRx par telephone.
- Tester le transfert de coach dans la fiche client admin:
  - le client change de coach responsable;
  - les notes, dates manuelles et risque restent en place;
  - les taches, rebookings, questionnaires, check-ups et impacts lies suivent le client;
  - `previousCoachId` et `transferredAt` sont traces.

## Priorite 4 - Questionnaires

- Tester `Envoyer questionnaire` avec un vrai contact GHL.
- Confirmer que l'erreur est explicite si:
  - telephone manquant;
  - contact introuvable;
  - token GHL refuse;
  - GHL retourne une erreur 400/422.
- Confirmer que le journal d'envoi donne aussi l'action suivante: corriger telephone, corriger contact GHL, configurer secret, redeployer Functions ou verifier le workflow `dashboardcoach`.
- Valider qu'une nouvelle reponse questionnaire V2 cree maintenant une demande Firestore `syncRequests` et finit dans `questionnaireResponses` ou `A valider`.
- Importer/backfiller les anciennes reponses recentes dans `questionnaireResponses` seulement apres validation du nouveau flux.
- Verifier que les reponses sont classees dans:
  - reponses a lire;
  - envoyer;
  - envoyes sans reponse;
  - a valider;
  - archives.
- Ne jamais creer de fausse relance pour un client qui n'a pas recu de questionnaire.
- Creer une relance seulement 7 jours apres un vrai envoi sans reponse.
- Avant 7 jours, afficher le questionnaire comme en stand-by, sans bouton de relance actif.

## Priorite 5 - Rebooking

- Comparer la vue Firebase avec l'app rebooking historique.
- Valider les statuts:
  - ouvert;
  - gere;
  - rebooke;
  - absence coach;
  - historique.
- Verifier le bouton `Reouvrir`.
- Tester `Absence coach` avec une note de contexte, puis verifier que la note apparait dans l'historique.
- Tester `Vacances / absence coach` sur une plage de dates:
  - seuls les rebookings ouverts de la plage changent de statut;
  - la raison apparait dans l'historique;
  - le bouton `Reouvrir` permet de corriger une erreur.
- Conserver le lien/app historique comme filet de securite tant que Firebase n'est pas confirme.

## Priorite 5.5 - Alumni

- Tester le cycle complet Alumni:
  - ajouter;
  - modifier;
  - creer mission;
  - contacter;
  - ne pas contacter;
  - remettre a travailler apres une erreur;
  - marquer reactive;
  - archiver.
- Confirmer que Alumni reste separe de Performance.

## Priorite 6 - Performance

- Valider le filtre global de periode:
  - 7 jours;
  - 30 jours;
  - 60 jours;
  - ce mois-ci;
  - mois dernier;
  - 6 mois;
  - 12 mois.
- Confirmer que le filtre affecte:
  - churn;
  - nouveaux clients;
  - check-ups CSM;
  - impacts.
- Tester ajout, modification, confirmation, annulation et retrait d'un impact.
- Confirmer qu'un impact retire disparait de Performance sans perdre le journal d'action.

## Priorite 7 - UX

- Refaire une lecture par onglet avec le principe: chaque element visuel doit avoir un objectif.
- Verifier hover et zones cliquables dans:
  - liste clients;
  - To-do;
  - Questionnaires;
  - Rebooking;
  - Alumni.
- Corriger les textes secondaires trop pales.
- Eviter que le rouge devienne du bruit visuel.
- Confirmer desktop et mobile.

## Priorite 8 - Exploitation continue

- Garder Google Sheets / Apps Script en parallele comme filet de securite.
- Faire de Firestore la base operationnelle du dashboard.
- Documenter la source primaire de chaque flux.
- Journaliser les actions coach dans `actionLogs`.
- Utiliser `syncRuns` et `coachSyncStatus` pour diagnostiquer les imports.
- Ne jamais publier tokens ou donnees client privees dans `firebase-dashboard/public`.


