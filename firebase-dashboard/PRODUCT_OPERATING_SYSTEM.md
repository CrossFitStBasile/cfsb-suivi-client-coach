# Systeme d'exploitation produit - Dashboard Coach CFSB

Derniere mise a jour: 2026-07-12

## 1. Contexte

Le Dashboard Coach est utilise par les coachs dans leur travail quotidien. Les modules principaux sont en place: To-do, Clients, Questionnaires, Rebooking, Pilotage, Alumni, Accomplissements, Formation continue et Admin.

La priorite n'est plus d'ajouter continuellement des fonctions. Il faut maintenant exploiter le dashboard comme un produit interne fiable, mesurer son utilite, corriger les irritants et automatiser seulement les processus repetitifs confirmes par le terrain.

## 2. Objectif

Maintenir un dashboard stable et utile qui:

- aide les coachs a prendre de bonnes decisions rapidement;
- detecte les problemes de donnees et de synchronisation avant qu'ils bloquent l'equipe;
- mesure l'adoption sans surveiller le contenu prive des coachs;
- identifie les processus repetitifs qui meritent une automatisation;
- publie les changements avec une cadence previsible et un retour arriere possible.

## 3. Source de verite

- Firestore demeure la base operationnelle du dashboard.
- `usageEvents` mesure les ouvertures, modules, appareils et interactions sans copier le texte des notes ou des dossiers clients.
- `actionLogs` est le journal append-only des actions importantes.
- `coachSyncStatus` et `syncRuns` indiquent la fraicheur et la sante des sources.
- `weeklyProductReports` conserve les rapports hebdomadaires prives visibles seulement dans Admin.
- `productReportRequests` permet a l'admin de demander une generation manuelle sans donner de droit d'ecriture direct sur les rapports.
- `assistantRequests` et `assistantProposals` forment un pilote IA prive, en lecture seule et separe des actions operationnelles.
- Ce document est la reference pour la cadence d'exploitation. Les secrets restent dans Firebase, Apps Script Properties ou les gestionnaires d'acces appropries.

## 4. Etat actuel

- collecte d'adoption anonymisee active;
- vue Adoption equipe deja presente dans Admin;
- synchronisation principale planifiee aux 6 heures;
- synchronisation des reponses questionnaire aux 15 minutes;
- annonces de mises a jour disponibles;
- validation locale et verification live automatisees;
- rapport produit hebdomadaire planifie le jeudi a 9 h;
- analyse des categories de missions repetitives sur une fenetre de 28 jours.

## 5. Decisions prises

1. Les coachs ne voient pas les diagnostics techniques dans leur vue normale.
2. Le rapport produit est prive et reserve au compte admin.
3. Aucune note client, description de mission ou reponse de questionnaire n'est copiee dans le rapport.
4. Une repetition n'est pas automatiquement une automatisation. Elle devient un candidat a valider avec les coachs.
5. Les regles metier et priorites CFSB restent deterministes.
6. Une publication fonctionnelle normale passe par une fenetre planifiee; seuls les blocages reels justifient un hotfix immediat.
7. Le pilote Assistant IA R0 est autorise uniquement pour `info@`, en lecture seule. Toute action IA ou ouverture a un coach exige un nouveau go explicite.
8. Les rapports d'exploitation peuvent compter les metadonnees d'usage de l'Assistant, mais ne doivent jamais copier les questions, les reponses ou le contexte client.

## 6. Plan par phases

### Chaque jour

- verifier automatiquement la fraicheur des sources;
- relever les synchronisations en erreur;
- surveiller les actions refusees et les erreurs d'envoi questionnaire;
- ne pas publier une modification simplement parce qu'une idee nouvelle existe.

### Chaque jeudi a 9 h

- generer `weeklyProductReports/weekly_YYYY-MM-DD`;
- compter les coachs actifs, sessions et actions;
- relever les missions en retard, rebookings ages, questionnaires non lus et sources a verifier;
- produire les categories de missions repetees sur 28 jours;
- afficher le rapport dans Admin avec une action `Actualiser` au besoin.

### Toutes les deux semaines

- reserver une fenetre normale de publication;
- choisir au maximum un probleme de fiabilite, une friction UX et une automatisation candidate;
- tester sur mobile et ordinateur;
- publier une annonce concise si le changement modifie le travail des coachs.

### Chaque mois

- faire une revue produit de 30 a 45 minutes avec Michael, le head coach et un ou deux coachs;
- lire le rapport des quatre dernieres semaines;
- valider les motifs repetitifs avec les personnes qui font le travail;
- retirer ou simplifier les fonctions qui ne produisent aucune decision utile.

### Chaque trimestre

- auditer les acces Firebase et les coachs pilotes;
- verifier les sources, sauvegardes et procedures de restauration;
- revoir les regles Firestore, les couts, la retention et les collections devenues inutiles;
- faire un audit mobile, performance et accessibilite;
- mettre a jour la documentation d'onboarding et d'exploitation.

## 7. Livrables

- rapport hebdomadaire prive dans Admin;
- resume par coach: jours actifs, sessions, actions et modules principaux;
- sante operationnelle: missions, rebookings, questionnaires et synchronisations;
- liste de candidats automatisation avec recommandation;
- calendrier de publication et criteres de hotfix;
- test de contrat `tools/verify-product-operations.cjs`.

## 8. Responsables

- Michael: priorisation produit et validation des changements qui modifient le fonctionnement du centre.
- Head coach: validation terrain des irritants et automatisations candidates.
- Coachs: feedback sur le travail reel, sans devoir produire de rapport technique.
- Admin `info@`: lecture du rapport hebdomadaire et verification des anomalies.
- Codex: analyse, correctifs, tests, documentation et preparation des publications apres autorisation.

## 9. Risques et inconnues

- confondre faible adoption et mauvais acces technique;
- automatiser une action qui exige encore un jugement coach;
- compter des imports automatiques comme des actions humaines;
- augmenter les couts Firestore en conservant trop d'evenements;
- publier trop souvent et fatiguer l'equipe;
- utiliser le rapport comme surveillance individuelle plutot que comme outil d'accompagnement.

## 10. Prochaines actions

1. Verifier la generation planifiee le jeudi suivant a 9 h.
2. Observer quatre semaines avant d'automatiser une nouvelle categorie manuelle.
3. Choisir un seul candidat d'automatisation et le tester avec un coach pilote.
4. Definir une politique de retention pour `usageEvents`, `actionLogs` et les rapports apres observation du volume reel.

## 11. Journal de suivi

| Date | Changement | Validation attendue |
| --- | --- | --- |
| 2026-07-12 | Rapport hebdomadaire, sante produit et analyse des repetitions ajoutes | Generation manuelle, puis execution planifiee jeudi 9 h |
| 2026-07-12 | Premier rapport live `weekly_2026-07-12` genere avec succes | Confirmer le prochain rapport automatique jeudi a 9 h |
