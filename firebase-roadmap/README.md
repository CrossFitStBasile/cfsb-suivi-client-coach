# Roadmap CFSB - environnement Firebase parallele

Ce dossier prepare la migration de Roadmap vers le projet Firebase distinct:

`cfsb-roadmap-trimestrielle`

Le Dashboard Equipe est deploye sur Firebase Hosting avec connexion Google owner. Les anciens liens GitHub Pages + Apps Script restent separes tant que leur retrait n'a pas ete approuve.

## Etat

- Projet Firebase: cree.
- Application Web: creee.
- Facturation: non liee pendant la phase preparatoire.
- Firestore: base Standard gratuite active en region `nam5`.
- Regles et index: deployes.
- Authentication: connexion Google active; deux profils owners actifs.
- Hosting: prototype owners deploye pour la recette privee.
- Donnees reelles: copie de migration importee; la Google Sheet reste la production officielle.

## Fonctions du Dashboard Equipe

- vue `A faire` inspiree du Dashboard Coach, avec actions de Michael et Gabriel;
- actions automatiquement projetees depuis les roadmaps a traiter et les etapes de carriere bloquees ou proches de leur echeance;
- actions manuelles avec membre, responsable et priorite, sans imposer un calendrier dans le dashboard;
- modification, fin, annulation et reouverture des actions manuelles, avec historique par membre;
- creation rapide d'une rencontre a prevoir, d'un suivi ou d'une discussion de developpement depuis chaque dossier membre;
- module Roadmaps separe en `En cours`, `Historique` et une corbeille secondaire;
- pipeline cliquable dont les compteurs respectent les filtres par role, trimestre et recherche;
- parcours explicite `A lire` -> `Lue / rencontre a faire` -> `Suivi a faire` ou `Terminee`;
- retour possible de `Lue / rencontre a faire` vers `A lire` lorsqu'une roadmap a ete marquee par erreur;
- seules les roadmaps a lire et les suivis concrets generent une action; la messagerie et la reservation restent dans les outils habituels;
- boutons d'action immediate dans `A faire` et dans chaque roadmap, sans passer par un menu de statuts;
- menus de soumissions enrichis du statut, de la date et de l'heure pour distinguer les doublons;
- fin de rencontre simplifiee: une action de suivi facultative, sans date de rencontre a saisir;
- dossier longitudinal par membre avec vue d'ensemble, actions, roadmaps et parcours;
- ligne du temps `Parcours CFSB` avec objectifs, echeances, responsables, progression et notes d'evolution datees;
- conversion d'une prochaine action de roadmap en etape de parcours, sans double saisie;
- association ou reassignation manuelle d'une soumission au bon membre;
- historique consultable, corbeille reversible et suppression definitive confirmee;
- conservation des anciennes notes owners dans un bloc historique;
- impression du dossier de rencontre et affichage de la version du formulaire;
- formulaires modaux proteges contre les rafraichissements Firestore pendant une saisie, avec fermeture par `Echap` et focus clavier contenu;
- journal `Activite` reliant chaque changement au dossier, a la roadmap, a l'action ou au parcours concerne;
- etat de sante owner avec consignation et resolution des erreurs du navigateur;
- detection des modifications simultanees pour empecher Michael et Gabriel de s'ecraser silencieusement;
- tests de flux unitaires, controle responsive et smoke test de l'URL de production.

## Verification locale

Executer les controles de syntaxe et les tests de flux avant chaque deploiement:

```powershell
npm run check
```

Verifier ensuite les ressources reellement servies par Firebase Hosting:

```powershell
npm run test:live
```

## Configuration Web

La configuration Firebase Web est publique par conception et se trouve dans `public/firebase-config.js`. Les secrets Google Chat, Apps Script et autres integrations serveur ne doivent jamais etre ajoutes ici.

## Preparer un lot d'importation local

Depuis la racine de ce dossier:

```powershell
node scripts/build-import-bundle.mjs
```

Le fichier produit dans `tmp/` n'est pas suivi par Git. Il sert a verifier les identifiants, les versions et les volumes avant toute ecriture Firestore.

Verifier l'import sans ecrire:

```powershell
node scripts/import-bundle-to-firestore.mjs
```

Ecrire la copie dans le projet Firebase isole:

```powershell
node scripts/import-bundle-to-firestore.mjs --apply
```

Les identifiants Firestore sont derives des identifiants Apps Script. Une relance met a jour les memes documents et ne cree pas de doublons.

## Prochaine activation

1. Valider la connexion Google avec les deux comptes owners reels.
2. Comparer les soumissions, notes et archives avec la production actuelle.
3. Tester les actions owners, notes, statuts, archives, membres d'equipe et parcours de carriere.
4. Refaire un export/import de copie juste avant la recette finale.
5. Garder la Google Sheet et GitHub Pages comme production jusqu'a l'approbation finale.

## Garde-fous

- Ne pas changer `.firebaserc` a la racine du depot: il appartient au dashboard coach.
- Toujours executer les commandes Firebase Roadmap depuis `firebase-roadmap/`.
- Ne pas deployer de Cloud Functions avant la validation Blaze.
- Ne pas modifier les URLs Roadmap actuelles pendant la phase de test.
