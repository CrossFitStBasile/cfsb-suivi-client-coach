# CFSB — Dashboard Coach et questionnaires

Le dépôt contient le Dashboard Coach Firebase, les questionnaires historiques,
le Questionnaire Studio et les fonctions privées qui relient Dashboard,
Firestore et GoHighLevel.

## But

Permettre à l'administration de publier des questionnaires, aux coachs de les
envoyer ou de les planifier et aux membres d'y répondre à partir d'une URL fixe
qui ne contient aucune donnée personnelle.

## Architecture de production actuelle

URL du Dashboard :

```text
https://cfsb-dashboard-coach-aa9a4.web.app
```

Parcours d'envoi :

1. Le coach choisit un questionnaire publié dans le Dashboard.
2. Le navigateur crée une demande dans `questionnaireSends`.
3. `processQuestionnaireSendRequest` valide l'utilisateur, le membre, le
   formulaire, le téléphone exact et le contact GHL unique.
4. La Function ajoute le tag propre au formulaire.
5. Le workflow GHL envoie l'URL canonique puis retire le tag.
6. Le membre saisit lui-même son identité dans le formulaire.
7. `questionnairePublicApi` valide et enregistre la réponse.
8. Le serveur rapproche la réponse avec un seul `internalClientId` admissible;
   toute absence, ambiguïté ou contradiction va dans `questionnaire_review`.

Contrat d'URL :

- aucune URL GHL ne contient le téléphone, le nom, le coach ou un jeton client;
- les paramètres et fragments sont retirés de l'URL canonique;
- chaque formulaire publié possède un chemin fixe
  `/questionnaire/f/<slug>`;
- un formulaire futur nécessite un workflow GHL dédié, avec réinscription
  permise et retrait du tag après l'envoi.

Contrat d'identité :

- `internalClientId` est l'identité Dashboard durable;
- le téléphone sert uniquement de preuve de rapprochement;
- une réponse ne crée jamais automatiquement un membre;
- une décision `matched_manual` reste autoritaire durant les synchronisations;
- le coach propriétaire ne peut changer que par un transfert Dashboard
  explicite et audité.

Les anciennes routes `/questionnaire/`, `/questionnaire/check-in/` et
`/questionnaire/evaluation-habitudes-vie/` demeurent supportées. Les anciens
paramètres GitHub Pages (`phone`, `client_name`, `coach_name`,
`submission_token`, `lock_context`) sont historiques et ne doivent pas être
utilisés pour les questionnaires Studio.

## Tests dashboard

Le dashboard coach a maintenant un smoke test Playwright qui valide le parcours minimal sans toucher aux donnees reelles.

Le test lance un serveur local sur le dossier `dashboard`, ouvre `dashboard/live.html`, active le mode demo, puis verifie:

- chargement du dashboard;
- activation du mode demo;
- ouverture de l'onglet Clients;
- ouverture d'une fiche client;
- edition de la fin membership manuelle;
- retour dans la To-do;
- creation d'une note rapide avec `Ajouter une note`.

Installation locale:

```bash
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
```

Execution:

```bash
python tests/dashboard_smoke.py
```

Le meme test roule aussi dans GitHub Actions sur `main`, `gh-pages` et les pull requests vers `main`.

## Dashboard Coach Firebase

Le dashboard coach prive est dans `firebase-dashboard/public` et se deploie sur Firebase Hosting.

URL cible:

```text
https://cfsb-dashboard-coach-aa9a4.web.app
```

### Backend prive pour l'envoi questionnaire

Le token GoHighLevel ne doit jamais être publié dans Firebase Hosting. Le
bouton `Envoyer` crée donc seulement une demande Firestore. La Function
`processQuestionnaireSendRequest` prend ensuite un bail de traitement, valide
le membre et ajoute le tag GHL exact.

Le processeur :

- protège chaque tentative avec une clé Firestore et un bail expirant;
- récupère une panne survenue avant l'effet GHL;
- ne rejoue jamais automatiquement un effet GHL commencé ou incertain;
- confirme le tag exact dans le reçu GHL;
- avance une planification seulement après cette confirmation;
- place une planification en pause avec une erreur visible si la livraison
  échoue ou demeure incertaine.

`scheduledQuestionnaireSendRecovery` inspecte périodiquement les baux expirés.
La Function historique `sendQuestionnaire` demeure déployée pour compatibilité,
mais le Dashboard courant ne l'appelle plus directement.

Secret Firebase requis:

```powershell
firebase functions:secrets:set GHL_PRIVATE_TOKEN
```

Le location ID GoHighLevel du centre est configure dans la Function, parce qu'il n'est pas un secret.

Deploiement frontend seulement, a utiliser pour les ajustements visuels et UX:

```powershell
cd "<clone-du-depot>"
.\deploy-hosting-dashboard.cmd
```

Validation locale avant deploiement:

```powershell
cd "<clone-du-depot>"
.\verify-dashboard-before-deploy.cmd
```

Cette validation verifie la syntaxe front-end/back-end, les helpers d'import Google Sheets vers Firestore et la couverture des collections par `firestore.rules`.

Deploiement complet, seulement quand la Cloud Function ou les regles Firestore changent:

```powershell
cd "<clone-du-depot>"
.\deploy-dashboard-complet.cmd
```

Si `firebase` n'est pas reconnu dans PowerShell ou `cmd.exe`, ouvrir d'abord `C:\Users\micha\Downloads\firebase-tools-instant-win.exe`, attendre le prompt Firebase, puis coller les deux lignes `cd ...` et `deploy-...cmd`. Ne pas ajouter `deploy` directement apres le `.exe` dans la commande Windows.

Apres un deploiement complet, les donnees ne sont pas automatiquement garanties dans chaque coach. Ouvrir le dashboard, aller dans `Guide`, lancer `Synchroniser tous les coachs`, puis valider Marc-Andre et Iheb dans `Clients`, `To-do`, `Questionnaires` et `Rebooking`.

Si un coach reste vide, verifier d'abord le diagnostic de synchronisation avant de modifier l'interface. Les causes probables sont:

- la source Google Sheets n'a pas encore ete importee dans Firestore;
- la source contient le nom du coach sans CoachRx ID;
- le coach est ecrit avec une variante non reconnue;
- la ligne match le coach, mais le nom client ou le telephone est absent;
- les donnees existent dans l'ancien systeme, mais pas encore dans le flux Firebase.

Si la Function n'est pas encore deployee ou si les secrets ne sont pas configures, le dashboard affiche une erreur au coach au lieu de laisser croire que le SMS est parti.
