# Dashboard Equipe CFSB - Firebase

Ce dossier contient le Dashboard Equipe et le portail membre du projet Firebase distinct:

`cfsb-roadmap-trimestrielle`

Le Dashboard Equipe est l'environnement actif. Les anciens liens GitHub Pages et le formulaire Roadmap autonome ont ete archives le 12 aout 2026.

## Etat

- Projet Firebase: cree.
- Application Web: creee.
- Facturation: non liee pendant la phase preparatoire.
- Firestore: base Standard gratuite active en region `nam5`.
- Regles et index: deployes.
- Authentication: connexion Google active; deux profils owners actifs.
- Hosting: Dashboard Equipe, portail membre et projection de revenus deployes.
- Donnees reelles: Firestore est la source operationnelle du Dashboard Equipe.

## Fonctions du Dashboard Equipe

- zone `Pilotage` privee pour Michael et Gabriel avec reunion hebdomadaire, scorecard, priorites 90 jours et liste d'enjeux;
- provenance Drive visible pour chaque indicateur et statut `Cible a valider` lorsqu'aucun seuil officiel n'existe;
- vue `Strategie` sourcee depuis le document officiel Vision/Mission et le SWOT CFSB 2026, avec couverture documentee, statut de validation, SWOT et sources cliquables;
- registre de decisions owner-only qui conserve le choix, sa raison, son impact et son etat historique;
- conversion d'un indicateur hors cible ou d'une priorite a risque en enjeu, puis d'un enjeu en action dans la liste `A faire` existante;
- brouillons et historique des rencontres hebdomadaires, sans melanger ces rituels avec les rencontres 1:1 des membres;
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
- onglet `Rencontres` dans chaque dossier avec brouillons sauvegardes automatiquement, canevas 1:1 CFSB, finalisation explicite et historique prive pour Michael et Gabriel;
- creation facultative d'une action owner a partir du soutien promis pendant une rencontre;
- lien prive configurable vers le document Roadmap Google Drive de chaque membre, sans importer son contenu dans Firebase;
- outil protege de projection des revenus pour les coachs, avec scenarios nommes et sauvegardes dans leur dossier;
- portail membre `Mon parcours CFSB` avec mandat de carriere, historique des roadmaps, etapes de parcours, comptes rendus explicitement partages et outils personnels;
- activation progressive du portail par courriel Google depuis le dossier membre, sans exposer les notes owners ni les rencontres brutes;
- lien profond vers le Dashboard Coach uniquement par identifiant stable, sans lecture ni ecriture dans son projet Firestore;
- ancien Laboratoire revenus GitHub archive; le module Firebase est l'acces actif;
- separation de l'equipe active et des dossiers archives, avec archivage et restauration sans perte d'historique;
- ligne du temps `Parcours CFSB` avec objectifs, echeances, responsables, progression et notes d'evolution datees;
- conversion d'une prochaine action de roadmap en etape de parcours, sans double saisie;
- module owner-only `Developpement equipe` pour creer des programmes d'onboarding, de formation continue ou d'evaluation sans precharger de contenu non valide;
- publication versionnee des programmes: une nouvelle version conserve les anciennes assignations et rend la version precedente historique;
- assignation d'une version publiee a un membre, progression par etape, pause, reprise, historique et preuve Drive facultative ou obligatoire selon l'etape;
- acces au suivi de developpement depuis le dossier longitudinal de chaque membre;
- import owner-only des resultats Working Genius officiels, lien vers le rapport, profil par membre et carte des Geniuses de l'equipe;
- aucun questionnaire Working Genius reproduit dans le dashboard et aucune inference lorsque les resultats manquent;
- association ou reassignation manuelle d'une soumission au bon membre;
- historique consultable, corbeille reversible et suppression definitive confirmee;
- conservation des anciennes notes owners dans un bloc historique;
- impression du dossier de rencontre et affichage de la version du formulaire;
- formulaires modaux proteges contre les rafraichissements Firestore pendant une saisie, avec fermeture par `Echap` et focus clavier contenu;
- journal `Activite` reliant chaque changement au dossier, a la roadmap, a l'action, a la rencontre, au parcours ou a la projection concernee;
- etat de sante owner avec consignation et resolution des erreurs du navigateur;
- sauvegarde JSON owner en un clic couvrant toutes les collections connues et les evenements imbriques, avec manifeste, dates portables et empreinte SHA-256;
- aucune restauration massive depuis l'interface afin d'eviter une ecriture destructive accidentelle;
- controle de coherence actionnable pour les roadmaps non associees, les liens Drive absents, les cibles Pilotage a cadrer et la provenance des soumissions;
- formulaire Roadmap autonome retire des fichiers publies; les employes passent par `Mon parcours CFSB`;
- controle de coherence dirige vers le portail membre plutot que vers l'ancien pilote formulaire;
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

## Parcours employe actif

- URL: `https://cfsb-roadmap-trimestrielle.web.app/portal`
- Une connexion Google associee a un profil membre actif ou a une invitation valide est requise.
- Le membre voit uniquement son dossier, son historique Roadmap et les contenus explicitement partages.
- L'ancien formulaire autonome n'est plus publie. Sa route `/formulaire` doit rester absente.

## Configuration Web

La configuration Firebase Web est publique par conception et se trouve dans `public/firebase-config.js`. Les secrets Google Chat, Apps Script et autres integrations serveur ne doivent jamais etre ajoutes ici.

## Portail CFSB modulaire

Le Dashboard Equipe reste proprietaire des membres, roadmaps, rencontres, parcours et projections. Le Dashboard Coach reste proprietaire des clients et des operations de coaching. Le contrat entre les deux applications est documente dans `../PORTAL_CONTRACT.md`.

- Portail membre: `https://cfsb-roadmap-trimestrielle.web.app/portal`
- Liaison locale: `teamMemberId`
- Liaison vers Coach: `memberPortalProfiles/{teamMemberId}.coachDashboardId`
- Aucun parametre d'URL ne remplace les regles Firestore.
- Les deux applications se testent et se deploient separement.

Un owner active le portail dans le dossier d'un membre avec son courriel Google. A la premiere connexion, l'invitation cree un profil membre limite a ce seul dossier. Les notes owners, les brouillons et les rencontres completes restent invisibles; seul un document de `memberSharedSummaries` devient consultable.

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

## Configuration initiale du Pilotage

La configuration sourcee du trimestre se trouve dans `config/pilotage-initial-2026-q3.json`. Le chargeur verifie chaque identifiant et cree seulement les documents absents; une metrique deja modifiee dans le dashboard n'est jamais ecrasee.

Verifier sans ecrire:

```powershell
pnpm run pilotage:seed:dry-run
```

Creer uniquement les documents manquants:

```powershell
pnpm run pilotage:seed
```

La configuration initiale reprend `METRIQUE CFSB` et `TEAM LEADERSHIP CFSB ORGANISER 2026`. Les feuilles `RECUP` et `Archive` ne servent pas de source courante.

## Suivi operationnel

1. Maintenir les profils owners de Michael et Gabriel.
2. Maintenir un profil membre actif ou une invitation valide pour chaque employe qui utilise le portail.
3. Tester les actions owners, rencontres 1:1, liens Drive, projections, statuts, archives, membres d'equipe et parcours de carriere avant chaque deploiement.
4. Utiliser un export source explicite pour toute reprise d'importation; le cache GitHub archive ne peut plus servir de source.

## Garde-fous

- Ne pas changer `.firebaserc` a la racine du depot: il appartient au dashboard coach.
- Toujours executer les commandes Firebase Roadmap depuis `firebase-roadmap/`.
- Ne pas deployer de Cloud Functions avant la validation Blaze.
- Ne pas republier les fichiers historiques `formulaire.*` ni les anciennes pages GitHub Roadmap.
