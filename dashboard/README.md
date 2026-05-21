# Dashboard Coach CFSB - GitHub Pages

Interface GitHub Pages du dashboard coach. La page publique ne doit servir que le shell visuel: les donnees client doivent venir d'un backend prive/authentifie.

## URL prevue

Quand GitHub Pages publie ce dossier:

`https://crossfitstbasile.github.io/cfsb-suivi-client-coach/dashboard/`

## Architecture de transition

- GitHub Pages: interface coach publique, sans donnees client embarquees.
- Apps Script Dashboard Coach: backend JSONP temporaire pour retourner les donnees privees apres validation de l'acces.
- Google Sheet Dashboard Coach CFSB: base de donnees.
- Sheet de reception questionnaire: source privee des reponses client-coach.
- Extension CoachRx: continue d'envoyer les donnees dans le backend actuel.

## Endpoint utilise

Par defaut:

`https://script.google.com/macros/s/AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ/exec`

L'app appelle:

`?api=coach-app&action=getData&callback=...`

Les actions coach passent aussi par ce endpoint pendant le pilote.

## Donnees publiques desactivees

Les anciens snapshots JSON publics sont desactives. Les fichiers sous `dashboard/data/` ne doivent contenir aucune donnee client reelle.

La commande suivante ne genere qu'un index public non sensible et supprime les anciens fichiers coach:

```bash
node dashboard/scripts/refresh-dashboard-snapshots.mjs
```

Le workflow GitHub Actions qui regenerait les snapshots a ete retire pour eviter toute republication accidentelle de donnees client.

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
- Pour la production, il faut remplacer ou renforcer JSONP par un backend moderne avec authentification coach.
