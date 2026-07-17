# CoachRx Sync Extension - chemin rapide pilote

Derniere mise a jour: 2026-06-09

Decision actuelle: pour obtenir un dashboard fonctionnel rapidement, le pont direct CoachRx -> Firestore est mis en pause. Le chemin actif a court terme reste l'extension CoachRx existante vers Apps Script/Sheets, puis la synchronisation Firebase/dashboard consomme cette source.

## Etat reel actuel

L'extension CoachRx existante extrait les clients visibles dans CoachRx et envoie le payload a l'Apps Script Web App historique.

Avant cette passe, le chemin etait:

1. CoachRx Sync Extension
2. Apps Script Web App
3. Google Sheets historiques:
   - `SRC_CoachRx_Browser_All`
   - `SRC_CoachRx_Browser`
   - `SRC_CoachRx_Advanced_Scans`
4. Ancien dashboard / reconstructions Sheets

Donc, utiliser l'extension actuelle pouvait aider les Sheets historiques, mais ne garantissait pas une mise a jour immediate du Dashboard Firebase.

## Pont direct Firestore mis en pause

Un pont direct Firestore avait ete prepare localement, mais il n'est pas le chemin prioritaire pour le pilote. Il ne doit pas etre deploye tant que le dashboard n'est pas stable avec les donnees existantes.

Chemin court terme vise:

1. CoachRx Sync Extension
2. Apps Script Web App
3. Google Sheets historiques
4. Synchronisation Firebase/dashboard existante
5. Dashboard Coach Firebase

Objectif: prouver que l'import CoachRx met a jour les clients et ne cree pas de fausses To-do avant d'ajouter un chemin direct.

## Fichiers locaux modifies

- `generated/apps-script-live-dashboard/Code.gs`
  - conserve l'import historique de l'extension CoachRx vers les Sheets source
  - evite les To-do programme/compliance ambigues

- `generated/github-pages-repo/functions/index.js`
  - contient le traitement `sourceType: coachrx_clients`
  - cree une mission seulement si CoachRx envoie un signal actionnable: rouge, jaune, overdue, today ou echeance proche

## Ce que ca veut dire pour Michael

Si Michael utilise l'extension CoachRx aujourd'hui, l'import met surtout a jour l'ancien chemin Sheets.

Apres deploy de la copie Apps Script patchée, la meme action dans l'extension devrait:

- mettre a jour `SRC_CoachRx_Browser_All`;
- reconstruire les donnees utiles du dashboard si le coach est configure;
- creer des missions programme quand les pastilles CoachRx rouges/jaunes sont transmises clairement;
- ne pas creer de fausses missions programme/compliance seulement parce que CoachRx affiche un contexte ambigu.

Colonnes recommandees pour l'extension:

- `Client`
- `CoachRx URL`
- `Membership`
- `Contact Phone Number`
- `Exercise Due`
- `Exercise Color` ou `Exercise Alert`
- `Exercise Status`
- `Lifestyle Due`
- `Lifestyle Color` ou `Lifestyle Alert`
- `Lifestyle Status`

Les couleurs/statuts doivent etre des valeurs simples comme `red`, `yellow`, `green`, `overdue`, `due soon`, `invite pending`, ou la classe CSS brute si l'extension ne peut pas faire mieux.

## Preuve de validation attendue

Premier test recommande:

1. Deployer l'Apps Script live utilise par l'extension.
2. Ouvrir CoachRx pour un seul coach pilote, idealement Marc-Andre ou Iheb.
3. Lancer l'extension CoachRx Sync.
4. Confirmer que la reponse indique la source Sheets et le rebuild attendu.
5. Lancer la synchronisation dashboard/Firebase existante.
6. Verifier dans le dashboard:
   - les clients du coach apparaissent;
   - les pastilles rouges/jaunes CoachRx creent des missions programme;
   - les pastilles vertes ou les contextes ambigus restent dans la fiche client sans fausse mission.

## Limites importantes

CoachRx ne doit pas etre considere comme la source parfaite pour le telephone ou le membership. Pour le telephone, la meilleure source reste GHL ou un repertoire client confirme. CoachRx sert surtout a confirmer le portefeuille coach, le contexte client et les signaux operationnels.

Les taches programme ne doivent pas etre creees a partir d'un signal CoachRx ambigu. Si une importation cree beaucoup de fausses To-do, il faut verifier si l'extension envoie une couleur/statut trop large ou mal mappee avant de l'utiliser avec les coachs.

## Rollback

Si le pont Firestore cree des donnees incorrectes:

1. garder le miroir Sheets historique actif;
2. ne pas activer le pont direct Firestore;
3. traiter CoachRx comme contexte client tant que les sources d'actions explicites ne sont pas confirmees.
