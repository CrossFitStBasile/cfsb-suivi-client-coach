# Canari manuel — CoachRx Sync 0.6.10

Statut: prêt; chargement manuel de l'extension requis avant le premier test signé

## Artefact exact

- dossier canari prêt sur le poste de Michael:
  `C:\Users\micha\Downloads\coachrx-sync-extension-0.6.10-live`;
- version du manifeste: `0.6.10`;
- contenu: 10 fichiers, tous conformes au manifeste de release;
- ZIP source SHA-256:
  `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D`;
- rollback intact:
  `C:\Users\micha\Downloads\coachrx-sync-extension-0.6.9-live`, copie exacte de
  la 0.6.9 scellée.

Ne charger aucun ancien dossier 0.6.2 ou 0.6.3. Le dossier téléchargé nommé
`coachrx-sync-extension-0.6.3-dashboard-signals` contient en réalité un
manifeste 0.6.7 et ne doit pas servir au canari.

## Geste manuel requis dans Chrome

L'automatisation sécurisée ne peut pas ouvrir `chrome://extensions`. Michael
doit donc effectuer cette séquence sur le poste déjà connecté à CoachRx:

1. avoir le secret de sync disponible depuis sa source autorisée, sans le
   copier dans un fichier, Codex, Drive ou un message;
2. ouvrir `chrome://extensions`;
3. désactiver l'ancienne extension CFSB CoachRx Sync, sans la supprimer;
4. activer le mode développeur;
5. choisir « Charger l'extension non empaquetée »;
6. sélectionner exactement
   `C:\Users\micha\Downloads\coachrx-sync-extension-0.6.10-live`;
7. confirmer visuellement la version 0.6.10;
8. ouvrir sa configuration, remettre le secret local si nécessaire, charger
   les coachs, sélectionner le coach canari et enregistrer.

Le nouveau dossier peut recevoir un nouvel identifiant d'extension Chrome; son
stockage peut donc être vide même si la 0.6.9 était configurée. Le secret est
enregistré par l'extension dans `chrome.storage.sync` et peut suivre le compte
Chrome; il ne faut donc pas le décrire comme strictement local. Le saisir
directement depuis la source autorisée et ne jamais le transmettre pour
contourner cette étape.

## Avant toute écriture

1. commencer par le plus petit portefeuille disponible;
2. ouvrir uniquement `/team/{coachId}/clients` pour le coach sélectionné;
3. noter les compteurs visibles `Active`, `Archived` et `Total Clients`;
4. cliquer seulement « Tester CoachRx »;
5. ne pas utiliser « Scan avancé CoachRx »;
6. arrêter si l'identité du coach, la route ou un compteur diffère.

Texte de test attendu:

```text
CoachRx repond.
Mode: coachrx-page-api
Coach ID: {id exact}
Clients actifs valides: X/X
Clients archives ignores: Y
Fiches API totales: X+Y
Compteur de reference: onglet Active
Identites stables: X/X
```

Repères historiques à reconfirmer, jamais à forcer:

- Marc-André `15935`: 21 actifs, 31 archivés, 52 fiches API;
- Iheb `15928`: 42 actifs, 0 archivé, 42 fiches API.

Si les valeurs visibles ont changé légitimement, consigner les nouvelles
valeurs avant de synchroniser. Une différence inexpliquée est un arrêt.

## Premier passage

Après un test en lecture seule entièrement conforme, cliquer une seule fois
« Mettre à jour CoachRx ». Le popup doit passer par `Lecture`, `Envoi`, puis
`Termine` et afficher le coach attendu et `Clients recus: X`.

Le badge `Termine` ne constitue pas le verdict final. Il prouve seulement que
le popup a reçu un HTTP 2xx avec `result.ok`. Les fallbacks actuels peuvent
afficher le nombre local ou un onglet par défaut si le backend omet ces champs.

Avant tout deuxième clic ou coach suivant, vérifier:

- réponse Apps Script JSON explicite avec `ok: true`, compteur `X` et
  `sourceSheet` présent, vérifiée côté Apps Script ou Firestore par l'opérateur;
- lot frais de `X` actifs dans `SRC_CoachRx_Browser_All`, sans archive envoyée,
  doublon ou identité présente sous deux coachs;
- run Firestore frais pour `coachrx_clients`, sans erreur ni conflit, avec
  `recordsReceived = X`;
- même total dans le pipeline CoachRx;
- même portefeuille dans le Dashboard;
- aucun client Dashboard seulement rendu obsolète;
- aucun `dashboardResponsibleCoachId` déplacé;
- aucune fiche inter-coachs et aucune fausse mission créée.

Ne pas ouvrir DevTools ou partager le payload réseau pour vérifier le JSON: la
requête peut contenir le secret. Conserver seulement les agrégats non sensibles
et le `runId` observés côté serveur.

## Répétition et verdict

Répéter une seule fois le même coach après la vérification complète du premier
passage. Exiger zéro nouvelle fiche, zéro doublon et zéro dérive de
responsabilité. `recordsWritten` peut compter des mises à jour; l'idempotence se
juge sur les identités et l'état avant/après, pas sur ce compteur seul.

Ensuite seulement: Marc-André, Iheb, puis les quatre autres coachs, un à la
fois. La diffusion générale reste bloquée jusqu'à la réconciliation des sept
portefeuilles.

## Arrêt et rollback

Arrêter sans deuxième clic si un compteur, une identité, un run, une
responsabilité ou une projection diverge. Ne supprimer, fusionner ou réassigner
aucune fiche manuellement. Conserver le `runId`, le dernier roster valide, la
0.6.8 publique et la 0.6.9 désactivée comme preuves et points de retour.
