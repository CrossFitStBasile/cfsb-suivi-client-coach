# Migration Firebase - Roadmap trimestrielle CFSB

Project: Roadmap trimestrielle CFSB vers Firebase
Created: 2026-07-12
Last updated: 2026-07-13
Primary owner: Michael Grondin
Status: Preparation parallele - aucune bascule de production
Source of truth: ce document, le dossier `firebase-roadmap/` et la console Firebase du projet `cfsb-roadmap-trimestrielle`

## 1. Context

Roadmap fonctionne actuellement avec une interface GitHub Pages, un backend Apps Script et une Google Sheet. Cette architecture a permis de lancer les roadmaps, mais elle cree des delais et des modes de secours difficiles a expliquer: synchronisation Apps Script, pont iframe, copie GitHub, donnees locales du navigateur et actions manuelles.

Le dashboard coach utilise deja Firebase avec succes. La migration Roadmap doit toutefois rester separee au debut pour proteger le dashboard coach et permettre une validation complete avant toute bascule.

## 2. Objective

Creer une application Roadmap interactive et fiable dans un projet Firebase distinct, avec:

- sauvegarde automatique des brouillons;
- soumissions visibles en temps reel;
- dashboard owners pour Michael et Gabriel;
- notes de rencontre et statut de traitement;
- archives durables par membre et par trimestre;
- gestion de l'equipe et de l'organigramme;
- historique des versions du formulaire;
- Laboratoire revenus coach conserve comme module distinct;
- notifications Google Chat apres une soumission finale;
- possibilite future d'un portail administratif commun avec le dashboard coach.

## 3. Source Of Truth

- Production actuelle: GitHub Pages `roadmap/`, Apps Script Roadmap et Google Sheet Roadmap.
- Configuration du questionnaire: `roadmap/data/roadmap-config.json`.
- Copie active connue: `roadmap/data/roadmap-submissions-cache.json`.
- Nouveau projet Firebase: `cfsb-roadmap-trimestrielle`.
- Preparation locale Firebase: `firebase-roadmap/`.
- Dashboard coach existant, volontairement non modifie: `cfsb-dashboard-coach-aa9a4`.

## 4. Current State

- Le formulaire contient 8 roles, 28 modules et environ 120 questions.
- Les brouillons sont sauvegardes dans le navigateur et peuvent etre repris par un identifiant Apps Script.
- Le dashboard owners gere les soumissions, filtres, notes, statuts, archives, portrait d'equipe et organigramme.
- Les donnees owners utilisent un melange de stockage local et de synchronisation Apps Script.
- La copie GitHub du 2026-07-10 contient 18 soumissions actives.
- Le dashboard coach Firebase est actif avec Auth, Firestore, Hosting et 9 Cloud Functions. La presence de Functions de deuxieme generation et de taches planifiees confirme que ce projet utilise deja la facturation Blaze.
- Le nouveau projet `cfsb-roadmap-trimestrielle` et son application Web ont ete crees sans liaison de facturation.
- La base Firestore Standard a ete creee en region `nam5`; Google la confirme comme base gratuite `freeTier: true`.
- Les regles Firestore et les index initiaux sont deployes. Cloud Functions n'est pas deploye.
- Une copie complete de la Google Sheet a ete importee: 28 soumissions, 18 notes owners, 10 archives, 20 membres et 194 evenements d'audit.
- Une deuxieme importation avec la meme cle a conserve exactement les memes compteurs.
- Google Authentication est active et deux profils owners actifs sont configures.
- Le prototype owners est deploye sur Firebase Hosting pour une recette privee, sans modifier les liens de production.
- Le dashboard owners interactif ajoute un pipeline cliquable, une corbeille reversible, un dossier longitudinal par membre, une reassignation manuelle des soumissions et un compte rendu simplifie.
- Chaque dossier membre comprend maintenant un `Parcours CFSB`: etapes de carriere modifiables, dates cibles, responsables, progression, criteres de reussite et journal d'evolution date.
- Le prototype owners est devenu un `Dashboard Equipe` structure comme le Dashboard Coach: vue `A faire`, dossiers d'equipe et module Roadmaps distinct.
- Les rencontres faites ne surchargent plus la file active. Les actions a lire, planifier, suivre ou archiver alimentent automatiquement la vue quotidienne.
- Michael et Gabriel peuvent aussi creer des actions manuelles, les assigner, les reporter et les terminer.
- Les dossiers membres integrent maintenant des rencontres 1:1 privees: brouillon automatique, canevas mensuel CFSB, note finalisee immutable et historique complet.
- Le document Roadmap Drive demeure externe et est accessible par un lien prive configure dans le dossier owner.
- Le Laboratoire revenus est porte dans Firebase comme outil owner, avec scenarios persistants par coach, sans retirer l'ancien prototype.
- Un formulaire employe Firebase parallele reprend la configuration officielle sans modifier le lien de production. Il combine brouillon local, brouillon Firestore interappareils, connexion Google autorisee et soumission idempotente visible en temps reel.
- Le Dashboard Equipe contient un moteur owner-only de programmes versionnes pour l'onboarding, la formation continue et les evaluations. Aucun contenu de checklist n'est publie tant que Gabriel ne l'a pas valide.
- Les profils Working Genius officiels peuvent etre importes dans les dossiers membres et compares dans une carte d'equipe owner-only; le test lui-meme demeure externe.

## 5. Decisions Made

| Date | Decision | Reason | Impact | Decided by |
| --- | --- | --- | --- | --- |
| 2026-07-12 | Garder Roadmap et Dashboard Coach dans deux projets Firebase distincts | Reduire le risque sur le dashboard coach actif | Migration et regles independantes | Michael + Codex |
| 2026-07-12 | Ne pas changer les liens de production pendant la preparation | Les roadmaps actuelles doivent rester accessibles | Ancien systeme conserve jusqu'a la recette | Michael + Codex |
| 2026-07-12 | Creer d'abord le projet Roadmap sans facturation | Valider l'architecture et les couts avant Blaze | Functions et notifications restent en attente | Michael + Codex |
| 2026-07-12 | Conserver chaque version du formulaire comme document immuable | Les archives restent lisibles sans dupliquer 200 Ko dans chaque soumission | Historique durable avec chargement plus rapide | Codex |
| 2026-07-12 | Utiliser des imports idempotents | Eviter les doublons lors des reprises de migration | Meme identifiant source = meme document cible | Codex |
| 2026-07-12 | Limiter le prototype a deux profils owners actifs | Proteger les donnees pendant la recette | Connexion Google et autorisation Firestore requises | Michael + Codex |
| 2026-07-13 | Garder les notes 1:1 et les liens Drive dans des collections owners privees | Eviter d'exposer des informations de gestion dans l'organigramme public | `teamMeetings` et `teamMemberPrivate` sont reserves aux owners | Michael + Codex |
| 2026-07-13 | Conserver les documents Roadmap dans Drive | Les membres peuvent continuer a y prendre leurs propres notes | Firebase stocke seulement le lien, pas le contenu | Michael + Codex |
| 2026-07-13 | Conserver l'ancien calculateur pendant la validation du module Firebase | Eviter toute perte et permettre la comparaison des resultats | Nouveau module parallele avec scenarios sauvegardes | Michael + Codex |

## 6. Phased Plan

### Phase 0 - Audit et environnement isole

Objective: connaitre l'existant et preparer un projet sans impact production.

Deliverables:

- inventaire des fonctions et donnees;
- projet Firebase Roadmap distinct;
- configuration locale, modele de donnees et regles initiales;
- outil de preparation d'un lot d'importation.

Completion criteria: aucun lien de production modifie, aucun cout Roadmap active, lot d'importation valide localement.

### Phase 1 - Prototype Firebase prive

Objective: reproduire le dashboard owners et l'archivage dans Firebase.

Deliverables:

- connexion Google pour Michael et Gabriel;
- lecture temps reel des soumissions;
- notes owners, statuts, archives et dossiers membres;
- gestion de l'equipe et de l'organigramme;
- parcours professionnel longitudinal par membre;
- import d'une copie des donnees existantes.

Completion criteria: Michael et Gabriel retrouvent les memes informations que dans la production actuelle et peuvent les modifier dans l'environnement de test.

### Phase 2 - Formulaire employe Firebase

Objective: remplacer la sauvegarde locale et Apps Script par un parcours fiable.

Deliverables:

- brouillon automatique;
- reprise apres fermeture;
- soumission idempotente;
- confirmation immediate;
- formulaire adapte au role;
- schema de formulaire versionne.

Completion criteria: tests complets des 8 roles, fermeture/reprise, double-clic et perte de reseau.

### Phase 3 - Automatisations serveur

Objective: ajouter les fonctions qui exigent un backend prive.

Deliverables:

- lien de reprise interappareils securise;
- notification Google Chat;
- journal d'audit;
- export de secours;
- surveillance des erreurs.

Completion criteria: validation de la facturation Blaze, alertes budgetaires actives et secrets stockes dans Secret Manager.

### Phase 4 - Recette et bascule

Objective: remplacer les liens officiels sans perte de donnees.

Deliverables:

- comparaison ancien/nouveau systeme;
- import final;
- plan de retour arriere;
- nouveaux liens;
- ancien systeme en lecture seule pendant une periode definie.

Completion criteria: approbation Michael et Gabriel, aucun ecart de soumission ou d'archive, tests mobiles et desktop reussis.

### Phase 5 - Portail administratif commun

Objective: donner un point d'entree commun aux outils de gestion sans fusionner prematurement les donnees.

Deliverables:

- navigation partagee;
- authentification coherente;
- acces selon le role;
- liens vers Dashboard Coach, Roadmap et Laboratoire revenus.

Completion criteria: portail utile sans dependance forte entre les deux bases Firebase.

## 7. Deliverables

| Deliverable | Type | Owner | Status | Link |
| --- | --- | --- | --- | --- |
| Audit Firebase Dashboard Coach | Audit | Codex | Complete | `cfsb-dashboard-coach-aa9a4` |
| Projet Firebase Roadmap | Infrastructure | Codex | Cree, Firestore gratuit actif | `cfsb-roadmap-trimestrielle` |
| Modele de donnees cible | Documentation | Codex | Prepare | `firebase-roadmap/DATA_MODEL.md` |
| Regles Firestore initiales | Code | Codex | Deployees | `firebase-roadmap/firestore.rules` |
| Lot d'importation local | Outil | Codex | Prepare et importe | `firebase-roadmap/scripts/build-import-bundle.mjs` |
| Dashboard Equipe Firebase | Application | Codex | Deploye pour recette | `https://cfsb-roadmap-trimestrielle.web.app` |
| Formulaire employe Firebase | Application | Codex | Prototype parallele prepare | `https://cfsb-roadmap-trimestrielle.web.app/formulaire` |
| Developpement equipe | Application | Codex | Moteur prepare, donnees metier a fournir | `firebase-roadmap/public/development.js` |
| Working Genius | Application | Codex | Import et carte prepares, rapports a fournir | `firebase-roadmap/public/working-genius.js` |
| Recette | Validation | Michael et Gabriel | A faire | - |

## 8. Owners

| Role | Person | Responsibility |
| --- | --- | --- |
| Proprietaire produit | Michael | Priorites, validation finale, couts et bascule |
| Proprietaire operations | Gabriel | Validation des contenus, roles et experience rencontre |
| Implementation | Codex | Architecture, migration, code, tests et documentation |
| Google Workspace | Bob Operator, au besoin | Apps Script, Google Chat et inventaire des donnees sources |

## 9. Risks And Unknowns

| Risk or unknown | Impact | Mitigation |
| --- | --- | --- |
| Les archives et notes owners ne sont pas toutes dans la copie GitHub | Import incomplet | Ajouter un export complet Apps Script avant l'import final |
| Le formulaire officiel est accessible sans compte obligatoire | Une connexion ajoute une etape au futur parcours Firebase | Brouillon local avant connexion, puis Google Auth limite aux membres actifs, invitations valides et owners pendant le pilote |
| Le webhook Google Chat est un secret | Il ne peut pas etre place dans le navigateur | Secret Manager + Cloud Function apres approbation Blaze |
| Des changements de formulaire surviennent pendant la migration | Archives incoherentes | Versionner la configuration et stocker son snapshot avec chaque soumission |
| Double import ou double soumission | Doublons | Identifiants deterministes et ecritures idempotentes |
| Facturation Firebase | Cout imprevu | Projet separe, quotas, alertes de budget et limites de requetes |

## 10. Next Actions

| Priority | Action | Owner | Due date | Status |
| --- | --- | --- | --- | --- |
| P1 | Activer Google Auth et les deux profils owners | Michael/Codex | Avant prototype owners | Complete |
| P1 | Valider une premiere connexion reelle avec chaque compte owner | Michael/Gabriel | Recette Phase 1 | A valider |
| P1 | Obtenir un export complet des soumissions, archives, notes owners et equipe | Codex/Bob Operator | Avant import pilote | Complete |
| P1 | Construire le prototype owners Firebase | Codex | Phase 1 | Complete |
| P2 | Choisir le parcours de reprise employe | Michael + Gabriel | Avant Phase 2 | A valider |
| P2 | Valider le passage Blaze et les alertes budgetaires | Michael | Avant Phase 3 | A valider |

## 11. Follow-up Log

| Date | Update | Done by | Next action |
| --- | --- | --- | --- |
| 2026-07-12 | Audit du projet coach et creation du projet Roadmap separe | Codex | Preparer Firestore |
| 2026-07-12 | Firestore gratuit cree, regles/index deployes et copie complete importee de facon idempotente | Codex + Bob Operator | Valider les acces Michael/Gabriel et construire le prototype owners |
| 2026-07-12 | Auth Google activee, deux profils owners crees et prototype owners deploye sur Firebase Hosting | Codex | Michael et Gabriel valident leur connexion et les donnees importees |
| 2026-07-13 | Prototype owners enrichi et redeploye: dossiers membres, pipeline interactif, compte rendu simplifie, corbeille et suppression controlee | Codex | Michael et Gabriel valident les actions sur quelques dossiers avant le nettoyage en lot |
| 2026-07-13 | Ajout du Parcours CFSB interactif dans les dossiers membres: etapes, progression, notes datees et lien avec les roadmaps | Codex | Valider le parcours sur un dossier pilote avant de le generaliser a toute l'equipe |
| 2026-07-13 | Refonte du prototype owners en Dashboard Equipe: file d'actions, dossiers membres, roadmaps a traiter, rencontres faites et taches manuelles | Codex | Michael et Gabriel valident l'usage quotidien avant la Phase 2 du formulaire employe |
| 2026-07-13 | Ajout des rencontres 1:1 privees, des liens Drive externes et des projections de revenus persistantes par coach | Codex | Tester le module sur quelques dossiers, puis ajouter progressivement les liens Drive valides |
| 2026-07-15 | Prototype du formulaire employe Firebase prepare en parallele: configuration identique, reprise interappareils et anti-doublon | Codex | Tester les 8 roles dans un cycle pilote avant toute bascule du lien officiel |
| 2026-07-16 | Ajout du moteur de developpement owner-only: programmes versionnes, assignations, progression et preuves | Codex | Gabriel valide le contenu de la premiere checklist avant sa publication |
| 2026-07-16 | Ajout de l'import Working Genius owner-only et de la carte d'equipe sans questionnaire local | Codex | Importer les premiers rapports officiels valides |
