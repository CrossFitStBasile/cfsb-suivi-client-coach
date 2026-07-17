Etat publication 2026-07-07: live cible `20260707-coachrx-extraction-guard`; Hosting a publier et valider; prochaine limite: validation humaine des coachs pilotes et parite Rebooking legacy.

Readiness mission vocale MVP: version cible `20260707-coachrx-extraction-guard`; version live precedente de reference `20260612-rebooking-quiet-cards`; version historique precedente `20260611-client-source-admin`. Controle apres publication: `verify-dashboard-live-stable.cmd`, `verify-dashboard-live.cmd`, puis publication rapide possible avec `publier-dashboard-mvp.cmd`.

# Dashboard Coach CFSB - Readiness migration Firebase

Derniere mise a jour: 2026-06-11

## 1. Context

Le Dashboard Coach migre d'un fonctionnement Google Sheets / Apps Script vers une architecture ou Firestore devient la base operationnelle rapide du dashboard. Les Sheets et apps existantes restent utiles comme backup, audit, source temporaire ou filet de securite pendant la transition.

Le besoin produit reste le meme: permettre aux coachs d'utiliser le dashboard comme outil reel, avec des donnees assez fraiches, des actions rapides, une UX claire et des modules To-do, Clients, Questionnaires, Rebooking, Performance et Alumni.

## 2. Objective

Stabiliser la version pilote Firebase sans perdre les systemes deja utiles. Le modele cible est:

Source vivante privee -> Cloud Function securisee -> Firestore -> Dashboard coach

Les Google Sheets ne doivent pas etre obligatoires lorsqu'un script ou une API possede deja la donnee vivante, par exemple CoachRx ou GHL. Ils restent acceptes comme registre historique, backup, audit ou source temporaire tant que le pont direct n'est pas prouve.

## 3. Source of Truth

| Domaine | Source operationnelle cible | Sources temporaires / backup | Regle de decision |
| --- | --- | --- | --- |
| Acces coach | Firebase Auth + `users` / `coaches` | Kilo staff pour verifier courriels | `users/{uid}` gagne pour role et coachId. |
| Clients | Firestore `clients` | CoachRx, CSM/Kilo, CORE_Clients, GHL | Matching phone-first; une valeur vide ne remplace jamais une valeur utile. |
| Telephone client | Firestore `phoneNormalized` | GHL cote serveur, CSM/Kilo, CORE_Clients | GHL peut confirmer/enrichir, jamais archiver ni supprimer. |
| To-do | Firestore `tasks` | `TASKS_Current`, questionnaire, notes coach, rebooking | Seules les actions explicites restent visibles. |
| Questionnaires | Firestore `questionnaireResponses` et `questionnaireSends` | Sheet Responses/Test_Responses | Les reponses sont immutables; les actions coach changent seulement le statut de lecture/suivi. |
| Rebooking | Firestore `rebookings` apres parite | App Apps Script legacy AUTO-003 | Ne pas casser l'app actuelle; pas de writeback sans parite prouvee. |
| Check-ups | Firestore `checkups` | CSM AUTO-002 | Lecture pour Performance et historique; ne modifie pas les champs manuels client. |
| Performance impacts | Firestore `impacts` | historiques Sheets si disponibles | Le dashboard devient source primaire des impacts crees par coach/admin. |
| Alumni | Firestore `alumni` | CORE_Alumni / imports admin | Alumni reste separe de Performance. |

## 4. Current State

- Version live actuelle: `20260626-coach-permissions-accomplishments`.
- Ancienne version live avant publication: `20260612-rebooking-quiet-cards`.
- Ancienne version live observee avant publication: `20260611-client-source-admin`.
- Validation locale: `verify-dashboard-before-deploy.cmd` passe 26/26, l'audit produit passe 78/78 et l'audit MVP passe 12/12.
- Validation live stable: `verify-dashboard-live-stable.cmd` confirme que le live repond et reste sain.
- Validation live stricte: `verify-dashboard-live.cmd` passe 9/9 sur `20260626-coach-permissions-accomplishments`.
- Blocage d'acces courant: aucun apres reauth Firebase CLI interactive. Si Firebase CLI exige une reauth recente (`invalid_rapt`) lors d'une prochaine passe, relancer `firebase-login-dashboard.cmd` avant publication ou audit.
- Audit Firestore live: `audit-live-firestore.cmd --summary` passe apres publication et confirme des donnees utilisables pour la validation terrain.
- Rebooking legacy reste actif et ne doit pas etre remplace sans audit de parite.

## 5. Decisions Made

- Firestore est la base operationnelle du dashboard.
- Les Sheets restent backup/audit/source temporaire, pas une obligation technique si la source peut pousser directement.
- GHL reste server-side seulement; aucun appel GHL depuis le navigateur.
- CoachRx peut alimenter Firestore directement via script/bridge prive sans passer par un Sheet obligatoire.
- Les telephones sont la cle de matching la plus fiable quand ils existent.
- Les champs manuels coach/admin sont proteges: fin membership, recurrence Kilo, risque coach, notes/objectifs.
- Les premieres activations live doivent etre limitees a un coach pilote et precedees d'un preview.

## 6. Phased Plan

Phase A - Local stable:

- garder les validateurs verts;
- maintenir `SOURCE_REGISTRY.json`, `SOURCE_ACTIVATION_STATUS.json`, `SOURCE_PAYLOAD_CONTRACTS.json` et ce document alignes;
- corriger UX et logique qui ne demandent pas d'acces externe.

Phase B - Reauth et deploy:

- reauthentifier Firebase CLI si le prevol le demande;
- lancer `publier-dashboard-mvp.cmd` pour le chemin MVP accompagne;
- verifier `verify-dashboard-live.cmd`;
- verifier que le live sert `app.js?v=20260626-coach-permissions-accomplishments` ou plus recent;
- lancer `valider-dashboard-equipe.cmd` avant de demander la validation humaine des coachs.

Phase C - Activation source par source:

- CoachRx clients en direct;
- repertoire/telephone client;
- GHL contacts cote serveur;
- questionnaire V2 vers Firestore;
- check-ups CSM;
- rebooking seulement apres comparaison avec l'app legacy.

Phase D - Pilotage reel:

- tester Marc-Andre et Iheb;
- ouvrir l'acces aux coachs pilotes avec leur courriel officiel;
- recueillir feedback coach;
- corriger par cycles courts sans casser les donnees.

## 7. Deliverables

- Dashboard Firebase deploye et verifie.
- Registre des sources maintenu.
- Statut d'activation par source lisible.
- Contrats de payload pour chaque source.
- Scripts de validation pre-deploy et live.
- Procedure de rollback par source.
- Journal clair des blocages d'acces.

## 8. Owners

| Zone | Owner principal | Support |
| --- | --- | --- |
| Produit / priorites coach | Michael | Gabriel |
| Firebase / code / validateurs | Codex | Michael pour reauth/acces |
| Apps Script / Google Workspace | Bob Operator apres approbation | Michael |
| GHL / workflows / token | Michael | Codex cote serveur seulement |
| Rebooking legacy | Systeme actuel Apps Script | Codex pour parite, sans casser |

## 9. Risks and Unknowns

- Les donnees live peuvent diverger si un meme domaine est ecrit dans Sheets et Firestore sans regle de source claire.
- Les clients sans telephone reduisent la fiabilite du matching questionnaire, GHL et rebooking.
- `TASKS_Current` peut encore contenir des actions qui ne sont pas de vraies To-do coach.
- L'app rebooking legacy contient une logique deja utile; la reimplementation Firebase doit prouver la parite avant remplacement.
- Les deploys Firebase restent dependants d'une session CLI ou d'un token valide.
- Toute activation GHL ou Apps Script doit eviter les secrets dans les assets publics.

## 10. Next Actions

Sans intervention humaine:

- garder la documentation et les validateurs coherents;
- renforcer les tests anti-ecrasement et phone-first;
- preparer les payload samples non sensibles;
- documenter les chemins de reprise quand Firebase demande une reauth;
- garder les compteurs live coherents avec `valider-dashboard-equipe.cmd`.

Avec intervention humaine:

- approuver l'inspection Bob Operator des scripts sources;
- confirmer la source officielle du telephone client;
- approuver le premier preview/write pour un coach pilote par source.
- valider les 7 coachs pilotes dans l'app publiee.

## 11. Follow-up Log

- 2026-06-09: readiness documentee pour separer source operationnelle, backup/audit, blocages d'acces et sequence d'activation.
- 2026-06-09: la prochaine preuve de progression live reste un deploy qui fait servir `20260609-coach-picker-stable` ou une version plus recente.
- 2026-06-09: validation locale `verify-dashboard-before-deploy.cmd` confirmee a `25/25`; validation live confirmee a `8/9` parce que Hosting sert encore `20260608-direct-import-bridge`; prevol Firebase confirme une reauth requise avant verification des secrets.
- 2026-06-11: version live observee `20260611-client-source-admin`; version locale prete `20260612-client-source-admin`; validation locale `26/26`, audit produit `74/74` et audit MVP `12/12`; verification live stable OK, stricte bloquee seulement par ecart de version; audit Firestore/deploy bloques par reauth Firebase `invalid_rapt`. Tentative publication MVP: login non interactif refuse; `DASHBOARD_SKIP_LOGIN=1` bloque maintenant en prevol rapide `hosting-only` avant validation longue.
- 2026-06-11: apres reauth interactive, `publier-dashboard-mvp.cmd` publie `20260612-rebooking-quiet-cards`; `verify-dashboard-live.cmd` passe 9/9, `audit-live-firestore.cmd --summary` passe et `valider-dashboard-equipe.cmd` confirme le live strict + l'audit Firestore. Prochaine limite: validation humaine des 7 coachs pilotes.
- 2026-06-11: version locale `20260611-coachrx-missions` ajoute les missions automatiques CoachRx pour signaux programme rouges/jaunes et la creation de mission depuis la fiche client.
- 2026-06-11: version locale `20260612-rebooking-quiet-cards` retire le filtre frontend qui cachait encore les nouvelles missions CoachRx avec `sourceSignal`. Validation live a refaire apres publication; la validation terrain doit confirmer Marc-Andre et les autres coachs.
- 2026-06-12: `20260618-csm-global-enrichment` ajoute la correction rapide du telephone client avec suggestion CSM/check-up, est publie sur Hosting, passe `verify-dashboard-live.cmd` 9/9 et `audit-live-firestore.cmd --summary`. Prochaine limite: validation humaine des coachs pilotes et parite Rebooking legacy.
- 2026-06-19: `20260622-onboarding-equipe` simplifie la lecture coach du Rebooking, cache les details source/matching dans le detail, ajoute la suppression d'erreur avec confirmation et garde les actions principales visibles.
- 2026-06-22: `20260626-coach-permissions-accomplishments` applique une passe UX globale: textes de cartes reduits, details repliables, actions secondaires sous Plus, sync resumee et lecture plus sobre des listes longues.



