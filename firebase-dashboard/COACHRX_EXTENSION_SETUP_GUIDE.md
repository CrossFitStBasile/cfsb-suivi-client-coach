# Guide d'installation - Extension CoachRx Sync

Derniere mise a jour: 2026-06-14

Ce guide explique comment distribuer et utiliser l'extension CoachRx Sync avec le Dashboard Coach CFSB.

Important: ne pas mettre de secret de synchronisation, lien Apps Script tokenise, token GHL ou donnees client dans `firebase-dashboard/public`, dans GitHub Pages/Firebase Hosting, ou dans un document public.

Le ZIP de l'extension peut etre publie s'il ne contient aucun secret. Les valeurs sensibles doivent etre stockees dans Firestore, dans `system/coachrxExtensionSetup`, via le panneau admin du Guide.

## Objectif

L'extension sert a lire les clients visibles dans CoachRx pour un coach, puis a envoyer les donnees utiles vers le pipeline Dashboard:

1. CoachRx
2. Extension CoachRx Sync
3. Apps Script / source existante
4. Synchronisation Firebase / Firestore
5. Dashboard Coach

CoachRx alimente surtout:

- le portefeuille client du coach;
- les signaux programme rouges ou jaunes;
- le contexte exercise/lifestyle;
- certains telephones quand ils sont presents.

CoachRx ne doit pas ecraser les champs manuels du dashboard. Le telephone normalise reste la cle prioritaire pour relier les sources.

## Ce que le coach doit faire

1. Ouvrir le Dashboard Coach.
2. Ouvrir `Guide`.
3. Dans `Extension CoachRx`, cliquer `Telecharger ZIP`.
4. Extraire le ZIP dans un dossier local stable.
5. Ouvrir `chrome://extensions` ou `edge://extensions`.
6. Activer le mode developpeur.
7. Cliquer `Charger l'extension non empaquetee`.
8. Choisir le dossier extrait, pas le ZIP.
9. Epingler l'extension dans la barre du navigateur.
10. Dans le Dashboard, cliquer `Copier URL`, puis coller dans l'extension.
11. Dans le Dashboard, cliquer `Copier secret`, puis coller dans l'extension.
12. Ouvrir `https://dashboard.coachrx.app/`.
13. Se connecter a CoachRx.
14. Ouvrir la page Clients du bon coach.
15. Ouvrir l'extension.
16. Choisir le meme coach que dans le Dashboard Coach.
17. Cliquer `Mettre a jour CoachRx`.
18. Attendre le message `Termine`.
19. Revenir au Dashboard Coach.
20. Ouvrir `Guide`.
21. Cliquer `Synchroniser ce coach` si les donnees ne sont pas encore visibles.

## Verification rapide

Apres une synchronisation reussie:

- le nombre de clients recus dans l'extension doit ressembler au nombre visible dans CoachRx;
- les clients doivent apparaitre dans `Clients`;
- les signaux rouges ou jaunes de CoachRx doivent creer des missions programme dans `To-do`;
- les signaux verts ou ambigus doivent rester du contexte client, pas devenir des missions;
- les telephones manquants doivent etre corriges dans la source la plus fiable avant de tester questionnaire/GHL.

## Installation Chrome / Edge

1. Telecharger le ZIP depuis le Guide du Dashboard Coach.
2. Si c'est un ZIP, l'extraire dans un dossier local.
3. Ouvrir `chrome://extensions` ou `edge://extensions`.
4. Activer le mode developpeur.
5. Cliquer `Charger l'extension non empaquetee`.
6. Choisir le dossier extrait de l'extension, pas le fichier ZIP.
7. Epingler l'extension dans la barre du navigateur.

## Configuration dans l'extension

Dans le Dashboard Coach:

1. Ouvrir `Guide`.
2. Dans `Extension CoachRx`, cliquer `Copier URL`.
3. Coller la valeur dans `Apps Script Web App URL`.
4. Cliquer `Copier secret`.
5. Coller la valeur dans `Secret de sync CoachRx`.
6. Cliquer `Sauvegarder` si l'extension affiche ce bouton, ou simplement lancer un test/sync si la sauvegarde est automatique.

Si les boutons sont desactives, l'admin doit remplir le formulaire `Extension CoachRx - configuration admin` dans le Guide.

## Desinstallation

1. Ouvrir `chrome://extensions` ou `edge://extensions`.
2. Trouver `CFSB CoachRx Sync`.
3. Cliquer `Supprimer`.

## Configuration admin privee

Ces informations ne doivent pas etre commitees dans le repo public:

- URL du Web App Apps Script utilisee par l'extension;
- secret de synchronisation;
- instructions internes pour regenerer le secret;
- notes de version de l'extension si elles contiennent un endpoint prive.

Recommandation:

- enregistrer l'URL Apps Script et le secret dans le panneau admin du Guide;
- garder une copie de secours dans un gestionnaire de mots de passe ou un document Drive restreint aux admins;
- ne jamais les coller dans `app.js`, `styles.css`, `index.html`, le ZIP public, GitHub ou Firebase Hosting;
- changer le secret si un coach quitte l'equipe ou si le secret a ete partage trop largement.

## Panneau admin du Guide

Le formulaire admin stocke:

- lien de telechargement ZIP;
- version extension;
- URL Apps Script Web App;
- secret de synchronisation;
- note d'installation.

Regle importante: si le champ secret est laisse vide lors d'une sauvegarde, le secret deja enregistre est conserve. Cela evite de l'effacer par accident.

## Problemes frequents

### L'extension dit `Erreur`

- verifier que le coach est connecte a CoachRx;
- verifier que la page ouverte est bien la page Clients du bon coach;
- recharger CoachRx;
- relancer l'extension;
- si l'erreur reste, demander a l'admin de verifier la configuration privee.

### Le Dashboard ne change pas

- attendre le message `Termine` dans l'extension;
- ouvrir `Guide`;
- cliquer `Synchroniser ce coach`;
- verifier que le bon coach est selectionne dans le Dashboard;
- comparer le nombre de clients dans CoachRx et dans l'extension.

### Trop de missions apparaissent

Ne pas corriger mission par mission. Verifier plutot:

- si l'extension envoie correctement les couleurs/statuts CoachRx;
- si les signaux verts sont traites comme contexte seulement;
- si une source legacy cree encore des taches non actionnables.

### Un client manque de telephone

CoachRx peut ne pas etre la meilleure source telephone. Verifier plutot:

- GHL;
- CSM/Kilo;
- fiche client manuelle;
- source questionnaire si une reponse existe.

## Regle de securite

Le Guide public peut expliquer comment utiliser l'extension. La configuration sensible doit rester admin seulement.
