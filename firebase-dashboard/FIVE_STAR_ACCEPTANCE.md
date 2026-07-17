# Dashboard Coach CFSB - Acceptation 5/5

Date de reference: 2026-07-13

## Contexte

Le dashboard est utilise en production par les coachs. Le niveau 5/5 ne correspond donc pas a une impression visuelle ou a une liste de fonctionnalites: il signifie que les parcours quotidiens sont fiables, rapides, compris par l'equipe et recuperables apres une erreur, sur mobile comme sur ordinateur.

Toute modification reste petite, testee, reversible et publiee seulement apres validation locale. Aucun diagnostic technique ne doit apparaitre dans la vue coach normale.

## Objectif

Atteindre et maintenir un niveau 5/5 mesurable sans perturber le travail quotidien:

- le coach comprend sa prochaine action en moins de 30 secondes;
- les actions principales fonctionnent sans erreur generique ni redemarrage de l'app;
- les donnees operationnelles sont fraiches et leur qualite est explicable;
- l'app avertit d'une nouvelle version sans interrompre une action en cours;
- un nouveau coach peut se connecter, installer l'extension et accomplir les parcours de base sans soutien direct de Michael;
- l'admin voit les anomalies et leur proprietaire sans exposer ce bruit aux coachs.

## Source de verite

- Firestore: base operationnelle du dashboard.
- CoachRx: portefeuille coach et signaux de programmation.
- CSM: memberships, check-ups, assiduite et Level Method.
- GHL: contacts et envois de questionnaires, relies par telephone normalise.
- `PRODUCT_OPERATING_SYSTEM.md`: exploitation continue et rapports d'adoption.
- `FINALIZATION_BOARD.md`: etat live et file de travail produit.
- audits `audit-live-firestore.cmd` et `audit-live-coach-access.cmd`: preuve terrain.

## Note de depart

Note de depart au 2026-07-13: **4,2 / 5**.

| Dimension | Poids | Note | Constat |
| --- | ---: | ---: | --- |
| Fiabilite et donnees | 30 % | 4,1 | Pipeline et acces sains; qualite telephone/rebooking a nettoyer; onglets ouverts non avertis d'une nouvelle version. |
| Travail quotidien | 25 % | 4,4 | To-do, clients, questionnaires et rebooking sont actionnables; acceptation terrain complete encore requise. |
| Mobile et desktop | 20 % | 4,2 | Navigation mobile et densite operationnelle en place; controle visuel multi-format et recuperation apres erreur a maintenir. |
| Onboarding et soutien | 15 % | 4,2 | Guide, ZIP et connexion multiple en place; test autonome par un nouveau coach a confirmer. |
| Securite et exploitation | 10 % | 4,3 | Acces pilotes 7/7, rapports prives et journaux; hygiene des profils admin et avertissements de sync a clarifier. |

## Conditions obligatoires du 5/5

Le score 5/5 est atteint seulement si **toutes** les conditions suivantes sont vraies. Une moyenne ne peut pas masquer un blocage critique.

### 1. Fiabilite et donnees

- pipeline local complet: 33/33;
- verification live stricte: 9/9;
- audit acces: 7/7, aucun profil coach bloquant;
- aucune erreur JavaScript visible dans les parcours testes;
- une nouvelle version publiee est signalee aux onglets deja ouverts, sans rechargement automatique;
- sync operationnelle recente selon le seuil documente;
- avertissements de donnees separes des echecs de synchronisation;
- clients sans telephone et rebookings non relies ont un proprietaire et une file de correction admin.

### 2. Parcours quotidiens

Les parcours suivants reussissent sur le compte du coach et dans le portefeuille d'un autre coach pilote autorise:

1. creer, modifier, etoiler et fermer une mission;
2. enregistrer puis ecouter une mission vocale;
3. creer et modifier un client manuel;
4. envoyer un questionnaire et lire sa reponse;
5. creer une mission depuis une reponse;
6. ajouter, ajuster et fermer un rebooking;
7. deplacer un client vers Alumni puis le ramener;
8. transferer un client a un autre coach pilote.

Critere: aucune erreur generique, aucun gel de navigation et aucune obligation de fermer puis rouvrir l'app.

### 3. Experience mobile et desktop

- validation aux largeurs 390, 430, 768, 1280 et 1440 px;
- aucun debordement horizontal de page ou de modale;
- navigation principale toujours accessible sans remonter en haut;
- action principale visible et libellee sans ouvrir plus d'un niveau de details;
- To-do comprise en moins de 30 secondes;
- recherche et filtres disponibles sur toute liste longue;
- aucun bouton visuellement actif sans comportement utile;
- diagnostics techniques confines a Admin/Guide.

### 4. Recuperation et soutien

- fermeture fiable des modales par bouton, annulation et retour de navigation;
- une erreur d'envoi ne bloque pas le reste de l'app;
- action en attente visible avec etat clair;
- guide de premiere connexion teste par une personne qui ne connait pas le projet;
- extension CoachRx installee et synchronisee sans intervention technique directe;
- Google et courriel/mot de passe testes sur iPhone, Android et ordinateur.

### 5. Exploitation continue

- rapport produit prive genere chaque jeudi a 9 h;
- sante des sources, adoption et candidats d'automatisation visibles dans Admin;
- revue mensuelle des workflows et revue trimestrielle des acces;
- au moins trois coachs pilotes valident les parcours critiques;
- tout incident P0/P1 a une cause, un correctif, un test de non-regression et une note de suivi.

## Plan par phases

### Phase A - Stabilite mesurable

- ajouter l'avertissement de nouvelle version;
- clarifier les avertissements de sync et les doublons de profils;
- convertir chaque risque live en controle automatique lorsque possible.

### Phase B - Acceptation des parcours

- executer la matrice des huit parcours avec Marc-Andre, Iheb et un troisieme coach;
- verifier propre portefeuille et couverture inter-coach;
- corriger uniquement les echecs reproduits.

### Phase C - Controle visuel multi-format

- capturer et verifier les modules principaux aux cinq largeurs;
- tester les modales mission, client, questionnaire et rebooking;
- corriger les debordements et les commandes sans valeur.

### Phase D - Donnees et exploitation

- reduire les clients actifs sans telephone;
- isoler les rebookings historiques non relies des dossiers actifs;
- qualifier les avertissements de sync;
- confirmer le rapport hebdomadaire et la revue mensuelle.

### Phase E - Validation finale

- obtenir l'acceptation explicite de trois coachs;
- relancer pipeline, audits live et controle de securite publique;
- consigner les preuves ci-dessous;
- passer la note a 5/5 seulement si aucune condition obligatoire n'est ouverte.

## Livrables

- cette grille d'acceptation tenue a jour;
- rapports d'audit live;
- matrice de parcours multi-coachs;
- captures mobile et desktop;
- tests de non-regression;
- journal des incidents et decisions dans `FINALIZATION_BOARD.md`.

## Proprietaires

- Codex: audit, correctifs, tests, documentation et preuve live.
- Michael: arbitrages produit, autorisations externes et acceptation finale.
- Coachs pilotes: validation terrain des parcours et retour d'usage.
- Admin `info@`: hygiene des donnees, acces et supervision.

## Collecte des validations terrain

La version `20260713-pilot-acceptance` ajoute un suivi prive et non bloquant:

- chaque coach pilote ouvre `Guide > Validation terrain 5/5` depuis l'appareil et le mode de connexion reellement testes;
- la fiche enregistre uniquement le verdict, neuf controles terrain, l'environnement technique et un commentaire sans donnee client;
- une validation est propre au compte et a l'environnement courant; un coach ne peut ni lire ni remplir celle d'un autre;
- l'admin `info@` voit dans Guide et Admin la couverture agregee par coach, appareil et controle;
- les preuves automatiques 8/8 et les validations humaines restent deux sources distinctes;
- aucune absence de reponse, reserve ou validation partielle n'est convertie en succes.

La candidate `20260714-five-star-terrain-gates` rend les neuf controles explicites dans la fiche et les agrege dans `audit-live-firestore.cmd --five-star`. Le rapport ne sort ni nom, courriel, telephone, commentaire, contenu client ou autre texte libre. L'interface et l'audit comptent uniquement les validations portant exactement la version courante; une validation anterieure affiche `Retest requis`. Les portes terrain restent ouvertes tant que de vraies soumissions `Pret` ne les couvrent pas.

Ce suivi remplace les confirmations transmises de memoire, mais ne remplace pas l'observation reelle de l'onboarding CoachRx ni la qualification d'un rebooking a volume eleve.

## Risques

- confondre une donnee source incomplete avec un bug applicatif;
- interrompre un coach avec un rechargement automatique;
- nettoyer des archives rebooking sans preuve terrain;
- modifier trop de parcours simultanement;
- declarer 5/5 avant l'acceptation multi-coachs.

## Prochaines actions

1. Obtenir la validation rapide de Marc-Andre, Iheb et un troisieme coach.
2. Completer la matrice d'authentification iPhone, Android et ordinateur.
3. Faire installer et synchroniser l'extension CoachRx par une personne qui ne connait pas le projet.
4. Qualifier le dossier rebooking a volume eleve sans le fermer par commodite.
5. Relancer tous les audits et prononcer le verdict seulement sans P0/P1.

## Journal de suivi

- 2026-07-13: pipeline 33/33, verification live 9/9 et acces 7/7 confirmes.
- 2026-07-13: 151 clients actifs, 10 sans telephone, 63 taches ouvertes, 12 questionnaires a lire et 41 rebookings ouverts observes.
- 2026-07-13: un onglet Chrome laisse ouvert affichait une version precedente malgre un live a jour et servi en `no-store`; controle de fraicheur ajoute a la phase A.
- 2026-07-13: controle de fraicheur publie sous `20260713-release-freshness`; il avertit sans rechargement automatique et bloque l'actualisation pendant une action ou une modale.
- 2026-07-13: verification live stricte et stable repassees apres publication: 9/9, version exacte, en-tetes `no-store`, fallback SPA et controle des secrets publics confirmes.
- 2026-07-13: version `20260713-tablet-header-fit` publiee; le debordement Questionnaires a 768 px est corrige et le garde-fou rebooking signale les dossiers de 10 seances ou plus avant fermeture.
- 2026-07-13: matrice live des cinq pages principales aux cinq largeurs: 25/25, sans erreur visible, modale bloquee ni debordement horizontal.
- 2026-07-13: matrice live des quatre modales principales aux cinq largeurs: 20/20; fermeture par X/Annuler et navigation apres fermeture confirmees.
- 2026-07-13: audit anonymise de 416 `actionLogs`: preuves automatiques completes pour 6/8 parcours critiques. Le retour Alumni vers Clients et le transfert client entre coachs n'ont pas encore de preuve terrain et demeurent des validations controlees a faire.
- 2026-07-13: les conditions humaines restent ouvertes: acceptation explicite par trois coachs, onboarding autonome, authentification reelle iPhone/Android/ordinateur et validation du dossier rebooking a volume eleve.
- 2026-07-13: `PILOT_VALIDATION_CHECKLIST.md` remplace l'ancienne checklist historique par un protocole unique: test synthetique reversible, huit parcours, trois coachs, appareils reels, onboarding CoachRx et rebooking a volume eleve, sans donnee client dans les preuves.
- 2026-07-13: test synthetique live termine: Alumni, retour Clients, transfert vers Iheb et transfert de la mission liee ont reussi sans erreur ni gel. Les trois documents de test ont ete supprimes avec verification exacte; les journaux ont ete conserves.
- 2026-07-13: audit compact `audit-live-firestore.cmd --five-star`: 423 journaux inspectes, 8/8 parcours critiques avec preuve automatique et aucune preuve manquante.
- 2026-07-13: suivi prive `Validation terrain 5/5` publie dans Guide et Admin pour recueillir les verdicts reels par coach et par environnement sans popup force ni donnee client; premieres reponses encore requises.
- 2026-07-13: controles post-deploiement repasses: pipeline 33/33, audit produit 86/86, live 9/9, acces 7/7 et preuves automatiques 8/8.
- 2026-07-13: controle navigateur live: version exacte, 7 coachs visibles dans l'agregat admin, 0/7 verdict terrain initial, aucun debordement horizontal a 390 px ou 1280 px et aucune erreur console.
