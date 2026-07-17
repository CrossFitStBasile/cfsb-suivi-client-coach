# Suivi client-coach - GitHub Pages

Version statique du prototype visuel du questionnaire client-coach.

## But

Publier une expérience client plus proche d'une web app que d'un Google Form standard, afin que les coachs puissent tester le vrai feeling du questionnaire.

## Fichier principal

`index.html`

## Déploiement GitHub Pages

1. Créer un dépôt GitHub, par exemple :

   `cfsb-suivi-client-coach`

2. Ajouter `index.html` et `README.md` à la racine du dépôt.

3. Dans GitHub :

   `Settings > Pages`

4. Choisir :

   - Source : `Deploy from a branch`
   - Branch : `main`
   - Folder : `/root`

5. Attendre que GitHub publie le site.

L'URL ressemblera à :

```text
https://USERNAME.github.io/cfsb-suivi-client-coach/
```

## Note importante

Cette version est d'abord une version de test d'expérience utilisateur. Sans endpoint configuré, elle ne transmet pas encore les réponses au Google Sheet ou au dashboard.

## Mode d'intégration

Le questionnaire prépare déjà un payload normalisé pour le dashboard coach.

En mode test :

```text
https://crossfitstbasile.github.io/cfsb-suivi-client-coach/
```

En mode intégré, ajouter un endpoint URL-encodé :

```text
https://crossfitstbasile.github.io/cfsb-suivi-client-coach/?endpoint=ENDPOINT_URL_ENCODED
```

Paramètres déjà supportés :

```text
endpoint
submission_token
token
phone
client_phone
client_name
client_email
coach_name
lock_context=1
```

Exemple :

```text
https://crossfitstbasile.github.io/cfsb-suivi-client-coach/?submission_token=TOKEN123&endpoint=https%3A%2F%2Fexample.com%2Fendpoint
```

Le POST est envoyé en `text/plain;charset=utf-8` avec `mode: no-cors`, ce qui rend l'intégration plus compatible avec un endpoint Apps Script.

## Payload envoyé

Le payload respecte le contrat dashboard :

```text
source
schema_version
submission_token
response_id
submitted_at
answers
triage
meta
```

Valeurs fixes :

```text
source = cfsb-client-coach-questionnaire
schema_version = 1.0
Content-Type = text/plain;charset=utf-8
```

Le backend doit dériver `client_id`, `client_name`, `coach_id`, `coach_name` et `service_type` à partir de `submission_token`.

## Coachs

Ne pas publier de roster coach dans GitHub Pages.

En production avec GoHighLevel, le lien peut être très simple et contenir seulement le téléphone du contact :

```text
https://crossfitstbasile.github.io/cfsb-suivi-client-coach/?phone={{contact.phone_raw}}
```

Le formulaire utilise un endpoint par défaut et envoie le téléphone dans le payload. Le dashboard pourra ensuite rapprocher la réponse avec `CORE_Clients` par téléphone normalisé.

Si le dashboard envoie lui-même le lien, il peut aussi ajouter `coach_name` et `lock_context=1` pour préremplir puis masquer le champ coach.

Champs dans `answers` :

```text
client_name_entered
client_email_entered
client_phone_entered
coach_name_entered
followup_type
general_state
motivation_level
goal_status
goal_clarity_score
progress_toward_goal
recent_success
current_challenges
upcoming_changes
upcoming_changes_details
program_fit
improvements_requested
pain_status
open_note
final_position
contact_request
```

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

L'envoi du questionnaire ne doit pas etre fait directement depuis le navigateur, parce que le token GoHighLevel ne doit jamais etre publie dans GitHub Pages ou Firebase Hosting.

Le bouton `Envoyer questionnaire` appelle donc la Cloud Function callable:

```text
sendQuestionnaire
```

La Function:

- verifie que l'utilisateur est connecte et actif dans `users/{uid}`;
- verifie que le client appartient au coach selectionne, sauf pour un admin;
- utilise le telephone normalise comme source de matching;
- cherche le contact dans GoHighLevel;
- ajoute le tag `dashboardcoach`;
- journalise chaque tentative dans `questionnaireSends`;
- retourne une erreur claire si le token GHL, le location ID ou le contact sont introuvables.

Secret Firebase requis:

```powershell
firebase functions:secrets:set GHL_PRIVATE_TOKEN
```

Le location ID GoHighLevel du centre est configure dans la Function, parce qu'il n'est pas un secret.

Deploiement frontend seulement, a utiliser pour les ajustements visuels et UX:

```powershell
cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
.\deploy-hosting-dashboard.cmd
```

Validation locale avant deploiement:

```powershell
cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
.\verify-dashboard-before-deploy.cmd
```

Cette validation verifie la syntaxe front-end/back-end, les helpers d'import Google Sheets vers Firestore et la couverture des collections par `firestore.rules`.

Deploiement complet, seulement quand la Cloud Function ou les regles Firestore changent:

```powershell
cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
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
