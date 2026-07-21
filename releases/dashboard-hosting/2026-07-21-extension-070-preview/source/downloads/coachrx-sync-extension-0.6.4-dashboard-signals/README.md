# CFSB CoachRx Sync Extension

Extension Chrome MV3 pour synchroniser les donnees CoachRx visibles/API vers le dashboard coach CFSB.

Version actuelle: `0.6.4`. L'extension a une icone CFSB/Rx distincte pour eviter de la confondre avec les autres extensions Chrome.
Cette version refuse la page generique `/clients`: le coach doit etre verifiable dans
l'URL `/team/{coachId}/clients`, et la source API ou visible doit correspondre au
coach selectionne. Elle conserve aussi le filtrage qui empeche des boutons comme
`Edit Profile` d'etre importes comme clients.

## Installation locale

1. Ouvrir Chrome.
2. Aller a `chrome://extensions`.
3. Activer `Mode developpeur`.
4. Cliquer `Charger l'extension non empaquetee`.
5. Choisir ce dossier: `coachrx-sync-extension`.

## Utilisation

1. Ouvrir `https://dashboard.coachrx.app/` et se connecter.
2. Choisir le coach dans l'extension et utiliser `Ouvrir CoachRx` pour aller dans
   sa vue `/team/{coachId}/clients`.
3. Cliquer sur l'extension `CFSB CoachRx Sync`.
4. Entrer le `Apps Script Web App URL`.
5. Entrer le `Secret de sync CoachRx`.
6. Cliquer `Charger les coachs`.
7. Choisir le coach dans la liste deroulante.
8. Cliquer `Enregistrer`.
9. Cliquer `Tester CoachRx`, puis `Synchroniser CoachRx`.
10. Pour explorer une page CoachRx plus en profondeur, ouvrir la page voulue puis cliquer `Scan avance CoachRx`.

Le secret doit aussi exister dans les proprietes du Apps Script lie au dashboard:

- propriete: `COACHRX_SYNC_SECRET`
- valeur: le meme secret que celui entre dans l'extension

La liste deroulante vient de l'onglet cache `CFG_Coachs`. Pour ajouter un coach, ajoute une ligne dans cet onglet avec son nom et son `CoachRx ID`.

## Donnees synchronisees

Cette version tente d'abord de lire l'API utilisee par la page CoachRx connectee:

- clients du coach;
- dates `Exercise due` et `Lifestyle due` si disponibles;
- compliance exercice/lifestyle si disponible;
- streak, workouts completed, touchpoints, tags et alerte si disponibles.

Si l'API ne repond pas, elle tente une lecture de secours de la page visible.

## Destination Google Sheet

Le Web App Apps Script met a jour l'onglet technique cache:

- `SRC_CoachRx_Browser_All`: source globale multi-coachs, avec `Coach ID` et `Coach`.
- `SRC_CoachRx_Browser`: copie de compatibilite du dernier coach synchronise, utilisee par le pilote Marc-Andre.
- `SRC_CoachRx_Advanced_Scans`: inventaire cache des pages CoachRx scannees avec le bouton `Scan avance CoachRx`.
- `CFG_Coachs`: configuration des coachs, cachee dans le dashboard.

Pour le pilote Marc-Andre, le dashboard utilise ensuite cette source pour reconstruire automatiquement:

- `To_Do_Coach`
- `Dashboard_Marc_Andre`
- `Formulaires_Fin_Programme`
- `Clients_A_Valider`

## Notes

Le Google Sheet ne peut pas scanner CoachRx lui-meme. L'extension le fait depuis le navigateur connecte de l'utilisateur, puis transmet seulement le resultat structure au Apps Script.

Si CoachRx affiche une URL sans `team/<id>`, l'extension utilise le coach choisi dans la liste deroulante.
