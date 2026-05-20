# Dashboard Coach CFSB - GitHub Pages

Interface statique pilote pour remplacer l'interface Apps Script du dashboard coach.

## URL prevue

Quand GitHub Pages publie ce dossier:

`https://crossfitstbasile.github.io/cfsb-suivi-client-coach/dashboard/`

## Architecture de transition

- GitHub Pages: interface coach.
- GitHub Pages JSON snapshots: source de lecture principale pour eviter les blocages Chrome/Apps Script.
- Apps Script Dashboard Coach: backend JSONP temporaire pour generer les snapshots et tenter les actions live.
- Google Sheet Dashboard Coach CFSB: base de donnees.
- Extension CoachRx: continue d'envoyer les donnees dans le backend actuel.

## Endpoint utilise

Par defaut:

`https://script.google.com/macros/s/AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ/exec`

L'app appelle:

`?api=coach-app&action=getData&callback=...`

Les actions coach passent aussi par ce endpoint pendant le pilote.

## Snapshots GitHub

Les fichiers sous `dashboard/data/` sont lus directement par l'app. Ils permettent au dashboard de s'ouvrir meme si le navigateur du coach bloque Apps Script.

Regeneration locale:

```bash
node dashboard/scripts/refresh-dashboard-snapshots.mjs
```

Regeneration publiee:

- GitHub Actions lance le workflow `Refresh dashboard snapshots` aux 30 minutes.
- Le workflow peut aussi etre lance manuellement.
- Les snapshots sont committes dans le repo et servis par GitHub Pages.

## Diagnostic rapide

Si le dashboard affiche `Impossible de rejoindre le backend`:

1. Cliquer `Reessayer endpoint officiel`.
2. Si le message revient, cliquer `Ouvrir diagnostic backend`.
3. Si la page diagnostic affiche du texte qui commence par `cb(`, le backend Apps Script repond et le probleme vient probablement d'un cache navigateur.
4. Si la page diagnostic affiche une erreur Google, il faudra redeployer ou remplacer le backend Apps Script par un backend dedie.

L'app corrige automatiquement les anciennes URLs Apps Script contenant `/u/3/` et remet le deploiement officiel si un vieux endpoint est garde dans le navigateur.
Les appels ajoutent aussi `authuser=0` pour eviter que Chrome choisisse automatiquement un autre compte Google.

## Notes de securite

- Aucun secret GHL ne doit etre stocke dans cette app.
- Si `COACH_APP_PIN` est configure dans Apps Script, le PIN peut etre entre dans la configuration locale du navigateur.
- Cette version utilise JSONP pour contourner les limites CORS d'Apps Script avec GitHub Pages.
- Pour la production, il faudra idealement remplacer JSONP par un backend moderne avec authentification coach.
