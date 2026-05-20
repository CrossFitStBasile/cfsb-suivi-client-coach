# Dashboard Coach CFSB - GitHub Pages

Interface statique pilote pour remplacer l'interface Apps Script du dashboard coach.

## URL prevue

Quand GitHub Pages publie ce dossier:

`https://crossfitstbasile.github.io/cfsb-suivi-client-coach/dashboard/`

## Architecture de transition

- GitHub Pages: interface coach.
- Apps Script Dashboard Coach: backend JSONP temporaire.
- Google Sheet Dashboard Coach CFSB: base de donnees.
- Extension CoachRx: continue d'envoyer les donnees dans le backend actuel.

## Endpoint utilise

Par defaut:

`https://script.google.com/macros/s/AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ/exec`

L'app appelle:

`?api=coach-app&action=getData&callback=...`

Les actions coach passent aussi par ce endpoint pendant le pilote.

## Notes de securite

- Aucun secret GHL ne doit etre stocke dans cette app.
- Si `COACH_APP_PIN` est configure dans Apps Script, le PIN peut etre entre dans la configuration locale du navigateur.
- Cette version utilise JSONP pour contourner les limites CORS d'Apps Script avec GitHub Pages.
- Pour la production, il faudra idealement remplacer JSONP par un backend moderne avec authentification coach.
