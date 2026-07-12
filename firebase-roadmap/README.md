# Roadmap CFSB - environnement Firebase parallele

Ce dossier prepare la migration de Roadmap vers le projet Firebase distinct:

`cfsb-roadmap-trimestrielle`

Il ne remplace pas la production GitHub Pages + Apps Script. Aucun deploiement public ne doit etre fait avant la recette de Michael et Gabriel.

## Etat

- Projet Firebase: cree.
- Application Web: creee.
- Facturation: non liee pendant la phase preparatoire.
- Firestore: base Standard gratuite active en region `nam5`.
- Regles et index: deployes.
- Hosting: non deploye.
- Donnees reelles: copie de migration importee; la Google Sheet reste la production officielle.

## Configuration Web

La configuration Firebase Web est publique par conception et se trouve dans `public/firebase-config.js`. Les secrets Google Chat, Apps Script et autres integrations serveur ne doivent jamais etre ajoutes ici.

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

## Prochaine activation

1. Configurer Firebase Authentication pour Michael et Gabriel.
2. Construire et tester le dashboard owners avant le formulaire employe.
3. Valider les regles avec les comptes owners reels.
4. Refaire un export/import de copie juste avant la recette.
5. Garder la Google Sheet et GitHub Pages comme production jusqu'a l'approbation finale.

## Garde-fous

- Ne pas changer `.firebaserc` a la racine du depot: il appartient au dashboard coach.
- Toujours executer les commandes Firebase Roadmap depuis `firebase-roadmap/`.
- Ne pas deployer de Cloud Functions avant la validation Blaze.
- Ne pas modifier les URLs Roadmap actuelles pendant la phase de test.
