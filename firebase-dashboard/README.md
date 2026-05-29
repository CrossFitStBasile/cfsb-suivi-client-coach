# Dashboard Coach CFSB - Firebase V1

Cette version est la migration Firebase du prototype Apps Script / Google Sheets.

## Objectif

Creer une app coach rapide, privee et fiable:

- connexion Google par coach;
- donnees dans Firestore;
- actions coach instantanees;
- questionnaire client-coach dans une inbox claire;
- rebooking integre;
- Google Sheets garde comme source/import/export, mais pas comme moteur interactif quotidien.

## Etat actuel

Cette base contient:

- configuration Firebase Web du projet `cfsb-dashboard-coach-aa9a4`;
- app front-end statique V1;
- regles Firestore fermees par defaut sauf utilisateurs actifs;
- modele de donnees cible;
- donnees de depart pour les coachs reels;
- structure prete pour Firebase Hosting.

La V1 Firebase remplace le prototype lent Apps Script pour l'interface quotidienne: les clics, les fiches clients, les to-do, les questionnaires, le rebooking, les impacts et les alumni vivent maintenant dans Firestore.

Les actions qui exigent un secret serveur restent volontairement non exposees dans le front-end. L'envoi SMS GoHighLevel du questionnaire est donc prepare/journalise dans Firebase, puis devra etre branche par Cloud Functions pour ajouter le tag GHL `dashboardcoach` sans publier de token.

## Premiere activation

1. Publier les regles Firestore dans `firestore.rules`.
2. Publier l'app sur Firebase Hosting.
3. Ouvrir l'app et se connecter avec Google.
4. Copier le UID affiche dans l'ecran "Acces en attente".
5. Dans Firestore, creer manuellement `users/{uid}`:

```json
{
  "active": true,
  "role": "admin",
  "coachId": "admin",
  "displayName": "Michael Grondin",
  "email": "ton-email-google"
}
```

6. Dans l'app, ouvrir `Guide` puis utiliser `Initialiser coachs` pour creer les coachs pilotes.
7. Selectionner un coach puis utiliser `Creer donnees pilotes` seulement si on veut un environnement de demonstration.

## Deploiement

Depuis la racine du repo:

```powershell
firebase deploy --only hosting,firestore:rules,firestore:indexes
```

URL de production Firebase:

```text
https://cfsb-dashboard-coach-aa9a4.web.app
```

## Limites connues V1

- L'envoi reel du questionnaire via GoHighLevel doit passer par une Cloud Function.
- Les imports CoachRx/Kilo/CSM doivent etre convertis en synchronisations Firestore pour eliminer les delais Apps Script.
- Les donnees historiques reelles doivent etre importees progressivement par coach apres validation du modele.

## Pourquoi ne pas utiliser `npm install firebase` tout de suite?

La V1 utilise les imports officiels CDN de Firebase:

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
```

Ca evite de bloquer sur Node/npm local pendant qu'on valide l'architecture. On pourra passer a Vite/React + `npm install firebase` quand la structure de donnees sera stable.
