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

Champs dans `answers` :

```text
client_name_entered
client_email_entered
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
