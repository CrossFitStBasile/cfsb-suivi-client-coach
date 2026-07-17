# Checklist d'acceptation terrain 5/5 - Dashboard Coach CFSB

Date de reference: 2026-07-13

Cette checklist prouve que le dashboard est utilisable par l'equipe dans les vraies conditions de travail. Elle complete les controles automatiques; elle ne les remplace pas.

## Etat actuel

- pipeline local: 33/33;
- verification live stricte: 9/9;
- acces pilotes: 7/7, aucun blocage coach;
- pages principales: 25/25 aux largeurs 390, 430, 768, 1280 et 1440 px;
- modales principales: 20/20 aux memes largeurs;
- preuves anonymisees dans `actionLogs`: 8 parcours critiques sur 8;
- test synthetique Alumni/transfert termine et nettoye; les `actionLogs` ont ete conserves;
- suivi prive `Guide > Validation terrain 5/5` publie et verifie pour recueillir les verdicts par compte et environnement; couverture initiale: 0/7;
- candidate `20260714-five-star-terrain-gates`: neuf controles explicites couvrent navigation, mission, dossier client/suivi, inter-coach, CoachRx, lecture vocale, client manuel coach, livraison questionnaire et rebooking volumineux;
- l'interface Admin et `audit-live-firestore.cmd --five-star` agrege uniquement les verdicts de la version courante, sans nom, courriel, telephone, commentaire ou contenu client; toute validation anterieure exige un nouveau test;
- preuves terrain encore requises: acceptation de trois coachs, onboarding autonome, authentification multi-appareils et rebooking a volume eleve.

Le score ne passe a 5/5 que lorsque toutes les cases obligatoires de ce document sont fermees sans incident P0/P1.

## Regles de securite

- Ne jamais utiliser un vrai client pour fabriquer une preuve.
- Les tests destructifs utilisent un client nomme `TEST 5/5 - AAAAMMJJ`, sans telephone, courriel ni note libre.
- Aucun nom, telephone, courriel, audio ou texte client n'est copie dans ce document.
- Les donnees synthetiques sont supprimees a la fin; les `actionLogs` restent intacts comme preuve d'audit.
- Un dossier rebooking reel douteux n'est jamais ferme pour terminer un test.
- Firestore reste la base operationnelle; les champs manuels coach ne sont pas remplaces par une synchronisation.

## 1. Controles avant test

Depuis la racine du depot:

```powershell
.\verify-dashboard-before-deploy.cmd
.\verify-dashboard-live-stable.cmd
.\audit-live-coach-access.cmd
.\audit-live-firestore.cmd --summary
```

Resultat obligatoire:

- [x] pipeline complet sans echec;
- [x] version live exacte, cache `no-store`, fallback SPA et backend confirmes;
- [x] tous les profils pilotes actifs peuvent travailler dans leur portefeuille et celui d'un autre coach pilote;
- [x] aucune erreur JavaScript visible dans la matrice mobile/desktop;
- [ ] aucun incident P0/P1 ouvert au moment de l'acceptation finale.

## 2. Matrice des huit parcours critiques

Les huit parcours ont maintenant une preuve automatique anonymisee. Le test humain confirme surtout la comprehension, la fluidite et la recuperation apres erreur.

| Parcours | Preuve automatique | Validation humaine |
| --- | --- | --- |
| Creer, modifier, etoiler et fermer une mission | OK | [ ] |
| Enregistrer et ecouter une mission vocale | OK pour la sauvegarde; lecture deja observee | [ ] |
| Creer et modifier un client manuel | OK | [ ] |
| Envoyer un questionnaire et lire sa reponse | OK | [ ] |
| Creer une mission depuis une reponse | OK | [ ] |
| Ajouter, ajuster et fermer un rebooking | OK | [ ] |
| Passer un client dans Alumni puis le ramener | OK | [ ] |
| Transferer un client vers un autre coach pilote | OK | [ ] |

Critere commun: aucune erreur generique, aucun gel, aucune obligation de fermer puis rouvrir l'app et un resultat visible immediatement ou avec un etat d'attente explicite.

## 3. Test controle Alumni et transfert

Ce test est execute une seule fois par l'admin dans une courte fenetre annoncee. Il ne touche aucun vrai dossier.

1. [x] Dans le contexte d'un coach pilote convenu, creer `TEST 5/5 - AAAAMMJJ` sans coordonnee.
2. [x] Creer une mission synthetique liee a ce client et verifier sa presence dans la To-do.
3. [x] Passer le client dans `Alumni`; confirmer qu'il quitte Clients et reste trouvable dans Alumni.
4. [x] Utiliser `Ramener dans Clients`; confirmer qu'il redevient actif sans doublon.
5. [x] Transferer le client vers un deuxieme coach pilote depuis la fiche client.
6. [x] Confirmer que le client et sa mission liee apparaissent chez le coach cible et disparaissent du portefeuille source.
7. [ ] Confirmer que l'ancien coach peut toujours consulter et corriger le portefeuille cible selon la regle inter-coachs.
8. [x] Supprimer la mission, la fiche et l'historique Alumni synthetiques avec le nettoyeur a garde-fous.
9. [x] Relancer `audit-live-firestore.cmd --five-star`; les huit parcours ont une preuve automatique.
10. [x] Verifier qu'aucune donnee synthetique ne reste dans Clients, Alumni, To-do ou Rebooking.

## 4. Acceptation rapide par trois coachs

Minimum: Marc-Andre, Iheb et un troisieme coach parmi Camille, David, Gabriel, Hugo ou Raphael.

Chaque validation dure de 5 a 10 minutes dans le propre compte du coach:

Le coach consigne ensuite son resultat dans `Guide > Validation terrain 5/5` sur l'appareil teste. Il ne doit inscrire aucun nom ni detail client. L'admin suit la couverture dans `Admin > Acceptation terrain 5/5`; il ne remplit jamais la fiche a la place du coach.

1. [ ] La To-do indique quoi faire en moins de 30 secondes.
2. [ ] Le coach cree une mission courte, l'etoile puis la ferme.
3. [ ] Il ouvre une fiche client, trouve le rythme d'entrainement et revient a la liste sans perdre sa place.
4. [ ] Il ouvre Suivi et trouve une reponse a lire ou comprend clairement qu'il n'y en a aucune.
5. [ ] Il ouvre Rebooking et comprend le nombre de seances a remettre et l'action principale.
6. [ ] Il change de portefeuille coach, consulte une fiche puis revient a son propre portefeuille.
7. [ ] Il confirme qu'aucun bouton, menu ou retour de navigation n'est bloque.
8. [ ] Il donne une reponse globale: `pret`, `pret avec reserve` ou `bloque`.

Consigner uniquement:

| Validation | Coach 1 | Coach 2 | Coach 3 |
| --- | --- | --- | --- |
| Date | [ ] | [ ] | [ ] |
| Appareil | [ ] | [ ] | [ ] |
| Resultat | [ ] | [ ] | [ ] |
| Commentaire sans donnee client | [ ] | [ ] | [ ] |

La collection privee `pilotAcceptances` devient la preuve operationnelle de ce tableau. Les cases ci-dessus restent ouvertes tant qu'aucune soumission reelle correspondante n'existe.

## 5. Authentification et appareils reels

Tester une session neuve, puis un retour dans une session existante.

| Appareil | Google | Courriel + mot de passe | Navigation installee/PWA |
| --- | --- | --- | --- |
| iPhone, Safari | [ ] | [ ] | [ ] |
| Android, Chrome | [ ] | [ ] | [ ] |
| Ordinateur, Chrome ou Edge | [ ] | [ ] | N/A |

Pour chaque case:

- le coach arrive par defaut dans son propre portefeuille;
- il peut consulter un autre coach pilote;
- il peut revenir a son portefeuille;
- la deconnexion et la reconnexion fonctionnent;
- aucune boucle OAuth ou page blanche ne survient.

## 6. Onboarding autonome et extension CoachRx

Faire executer ce parcours par une personne qui ne connait pas le projet, avec le Guide seulement. Michael n'intervient pas dans les clics.

1. [ ] Ouvrir le dashboard et se connecter.
2. [ ] Trouver le Guide de premiere connexion.
3. [ ] Telecharger et extraire le ZIP CoachRx.
4. [ ] Charger l'extension non empaquetee dans Chrome.
5. [ ] Copier la configuration privee depuis le Guide connecte.
6. [ ] Ouvrir la page Clients du bon coach dans CoachRx.
7. [ ] Lancer la synchronisation et attendre l'etat final.
8. [ ] Comparer uniquement les nombres `clients recus` et `clients visibles` apres le delai de traitement.
9. [ ] Confirmer que la personne peut expliquer quoi faire si CoachRx n'est pas connecte ou si le mauvais coach est ouvert.

Critere: parcours termine en 15 minutes ou moins, sans secret transmis par message et sans soutien technique direct.

## 7. Rebooking a volume eleve

Un dossier reel signale avec environ 80 seances doit etre valide par un responsable terrain avant toute fermeture.

1. [ ] Ouvrir le dossier sans le modifier.
2. [ ] Confirmer que le garde-fou de volume eleve est visible.
3. [ ] Comparer le nombre avec la source historique et le contexte du coach.
4. [ ] Si le nombre est faux, le corriger avec une note de raison; ne pas fermer le dossier.
5. [ ] Si le nombre est vrai, confirmer que les actions `ajuster`, `suivi fait`, `seance remise` et `absence coach` restent utilisables.
6. [ ] Verifier que la carte compacte ne masque ni le nombre ni la date d'annulation utile.

## 8. Verdict 5/5

Le dashboard est accepte 5/5 seulement lorsque:

- [ ] les huit parcours critiques ont une preuve automatique et une validation humaine;
- [ ] trois coachs ont donne `pret` ou une reserve non bloquante documentee;
- [ ] iPhone, Android et ordinateur passent la matrice d'authentification;
- [ ] une personne nouvelle reussit l'onboarding et la synchronisation CoachRx sans aide directe;
- [ ] le dossier rebooking a volume eleve est qualifie;
- [ ] les audits finaux repassent sans P0/P1;
- [ ] les donnees synthetiques sont nettoyees;
- [ ] `FIVE_STAR_ACCEPTANCE.md` et `FINALIZATION_BOARD.md` consignent la date et le verdict.

## Fiche d'incident minimale

Pour tout echec, consigner sans donnee client:

- date et version live;
- appareil et navigateur;
- parcours et action precise;
- resultat attendu et resultat observe;
- severite P0, P1, P2 ou P3;
- cause, correctif et test de non-regression;
- proprietaire et statut.

Les anciens Apps Script et Google Sheets restent disponibles comme filet de securite jusqu'a la fermeture de cette acceptation.
