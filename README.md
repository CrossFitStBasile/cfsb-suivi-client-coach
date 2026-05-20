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

Paramètres optionnels déjà supportés :

```text
client_id
coach_id
endpoint
```

Exemple :

```text
https://crossfitstbasile.github.io/cfsb-suivi-client-coach/?client_id=CLIENT123&coach_id=COACH456&endpoint=https%3A%2F%2Fexample.com%2Fendpoint
```

Le POST est envoyé en `text/plain;charset=utf-8` avec `mode: no-cors`, ce qui rend l'intégration plus compatible avec un endpoint Apps Script.

## Payload attendu

Champs envoyés :

```text
response_id
submitted_at
source_app
source_version
source_url
client_id
client_name
client_email
coach_id
coach_name
service_type
followup_type
general_state
motivation_level
goal_status
goal_clarity_score
program_fit
improvements_requested
pain_status
open_note
final_position
contact_request
triage_status
coach_action_type
coach_action_done
coach_action_note
dashboard_sync_status
chat_notification_status
```
