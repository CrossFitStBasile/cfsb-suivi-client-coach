# Bob Operator source handoff - Dashboard Coach CFSB

Derniere mise a jour: 2026-06-09

## Context

Le Dashboard Coach Firebase lit Firestore comme base operationnelle. Plusieurs sources vivantes existent deja dans Google Workspace, Apps Script, CoachRx, CSM, le questionnaire client-coach, le rebooking legacy et GoHighLevel.

Ce document sert de handoff a Bob Operator quand Michael approuve explicitement une inspection ou une modification live d'un script prive. Il ne remplace pas `SOURCE_ACTIVATION_STATUS.json`; il le rend executable source par source.

## Objective

Brancher les sources vivantes vers Firestore sans ajouter de Google Sheet intermediaire inutile, sans exposer de secret et sans casser les outils qui fonctionnent deja.

Flux vise:

```text
Source vivante privee -> preview Apps Script/Bob -> ingestDashboardSource -> Firestore -> Dashboard Coach
```

## Source of Truth

Avant toute action live, lire:

- `firebase-dashboard/SOURCE_ACTIVATION_STATUS.json`
- `firebase-dashboard/SOURCE_REGISTRY.json`
- `firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json`
- `firebase-dashboard/SOURCE_PAYLOAD_PLAYBOOK.md`
- `firebase-dashboard/APPS_SCRIPT_FIREBASE_BRIDGE.md`
- `firebase-dashboard/apps-script/dashboard-import-bridge-template.gs`
- `functions/index.js`
- `C:\Users\micha\Documents\Codex\Bob Operator\automation-registry.csv`

Ne jamais copier dans un document ou dans `firebase-dashboard/public`:

- `token.json`;
- `oauth-client.json`;
- token GHL;
- URL Apps Script avec parametre `token=`;
- `.env`;
- secret Firebase ou bearer token.

## Shared Bob procedure

1. Confirmer que Michael a autorise l'action live.
2. Ouvrir le script source dans Google Apps Script ou via Bob Operator.
3. Verifier que le script possede ou peut produire les donnees vivantes sans passer par un Sheet obligatoire.
4. Ajouter ou adapter le pont depuis `dashboard-import-bridge-template.gs`.
5. Configurer `DASHBOARD_IMPORT_TOKEN` dans les Script Properties du script prive.
6. Construire un payload minimal avec le bon `sourceType`, `coachId` ou `coachRxId`, et 1 a 3 lignes.
7. Lancer `previewDashboardImportPayload_`.
8. Comparer les cles avec `SOURCE_PAYLOAD_CONTRACTS.json`.
9. Ne lancer `pushDashboardSourceToFirebase_` que pour un seul coach pilote, apres approbation.
10. Verifier `sourceImportRuns`, `coachSyncStatus` et l'onglet dashboard concerne.
11. Documenter le resultat et le rollback.

## Work packages

### 1. CoachRx clients

- SourceType: `coachrx_clients`
- Bob registry reference: `AUTO-004`
- Source connue: ancien dashboard coach / extension CoachRx Sync.
- Script reference: `1SeGMN1w7iqn_7ETcmg5qwY6wIys4GZy5GbJHWasg6bToThcxrucYfOLk`
- Sheet historique: `18-S_a5L6fXYZXtcgHBlCKpcygmnr5Ekj_WM5358KZ7E`
- But: pousser le portefeuille client et le contexte CoachRx vers Firestore sans creer de fausses To-do programme.
- Preview minimal: un coach pilote, 1 a 3 clients, colonnes client/telephone/courriel/membership/contexte si disponibles.
- Preuve de succes: `Clients` affiche le portefeuille attendu; aucune To-do programme n'est creee a partir de valeurs ambigues.
- Rollback: desactiver le pont direct et ignorer le lot direct si le matching est mauvais.

### 2. Client directory / CSM / Kilo

- SourceType: `client_directory`
- Bob registry reference: `AUTO-002`
- Source connue: CSM et repertoire client admin.
- Script reference: `1pQ9ecmaVvulUauVMqNKNqQMDX0CDhOaQuolCIm4U_7n87hrMuuklxyLB`
- Script menu lie: `1upjaGrsWIxwsVz_Ht--CjNNeo3zC4uSlAfdRgMCdevwog1FV7Q-_MbIL`
- Sheet source: `1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw`
- But: enrichir les clients avec telephone, courriel, membership et contexte admin.
- Preview minimal: un coach pilote avec au moins un client sans telephone dans Firestore.
- Garde-fous: une valeur vide ne remplace jamais une valeur utile; fin membership et recurrence Kilo restent manuelles; aucun transfert coach automatique.
- Preuve de succes: le compteur `Sans telephone` baisse et `Envoyer questionnaire` devient disponible pour les clients enrichis.
- Rollback: couper le pont et corriger les mauvais matches dans la fiche client ou le registre admin.

### 3. GHL contacts

- SourceType: `ghl_contacts`
- Bob registry reference: aucune automation dediee dashboard pour l'instant; peut passer par une Function Firebase ou un script prive autorise.
- Source connue: GoHighLevel, cote serveur seulement.
- But: enrichir les clients existants avec `ghlContactId`, telephone confirme et courriel, puis soutenir l'envoi questionnaire.
- Preview minimal: 1 a 3 telephones connus, incluant un contact qui doit matcher exactement.
- Garde-fous: match exact du telephone normalise; aucun appel GHL depuis le navigateur; aucun client cree orphelin; aucun stale, archive, suppression ou transfert coach.
- Preuve de succes: un telephone connu matche exactement un contact GHL et les erreurs sont visibles dans `sourceImportRuns` ou `questionnaireSends`.
- Rollback: desactiver l'enrichissement GHL et garder les erreurs questionnaire explicites.

### 4. Questionnaire client-coach

- SourceType: `questionnaire_responses`
- Bob registry reference: `AUTO-009`
- Source connue: endpoint questionnaire client-coach.
- Script reference: `1RzTyLvUdw6NdVI2vsDoi7a2bjWGAZDXml94QYG4TCs9wF5KJdKm3HFBa`
- Sheet source: `11QO5GOQGHCpT8_nLEgKHqjFFsZ4emPwZEt2Vlu3WRJo`
- But: alimenter l'inbox questionnaire coach par telephone normalise, coach, triage et action suggeree.
- Preview minimal: une reponse test rouge/orange/jaune/vert pour un coach pilote.
- Garde-fous: contenu de reponse immutable; lire par cle de champ; champs inconnus dans `Autres reponses`; aucune fausse relance ou To-do pour un questionnaire non envoye.
- Preuve de succes: la reponse apparait dans `Reponses a lire` ou `A valider`, et le coach peut faire `Lu` ou `Creer mission + lu`.
- Rollback: revenir temporairement a la lecture Sheet `Responses` / `Test_Responses`.

### 5. Check-ups CSM

- SourceType: `checkups`
- Bob registry reference: `AUTO-002`
- Source connue: formulaire/sheet CSM.
- Script reference: `1pQ9ecmaVvulUauVMqNKNqQMDX0CDhOaQuolCIm4U_7n87hrMuuklxyLB`
- Sheet source: `1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw`
- But: alimenter Performance et l'historique client avec les check-ups par periode.
- Preview minimal: un coach pilote et une plage recente.
- Garde-fous: les check-ups ne modifient pas les champs manuels client et ne creent pas de To-do par defaut.
- Preuve de succes: Performance compte les check-ups selon la periode choisie; la fiche client montre le dernier check-up pertinent.
- Rollback: garder le CSM comme registre admin et desactiver le pont direct.

### 6. Rebooking legacy

- SourceType: `rebooking`
- Bob registry reference: `AUTO-003`
- Source connue: app Apps Script rebooking active.
- Script reference: `1OsXzGrmJacMYHMIEcTM3dTK-UvaA01bDf0F90HkFNt29XYgK2iHkyBlE`
- Sheet source: `1s7shtrkL0gs1DO0LbzkbabZteidGnYLhVou6KliHXVU`
- But: comparer Firebase avec l'app rebooking legacy avant toute migration de writeback.
- Preview minimal: un coach pilote en lecture seule, avec dossiers ouverts, a clarifier, 24h+ et a suivre.
- Garde-fous: ne pas publier d'URL tokenisee; ne pas rouvrir un dossier `gere`, `rebooke` ou `absence coach`; garder `Reouvrir` et l'historique.
- Preuve de succes: Firebase et l'app legacy affichent les memes comptes ouverts pour le coach pilote.
- Rollback: garder l'app legacy comme source active et desactiver tout write direct Firebase.

## Evidence note template

Pour chaque activation, creer une note de preuve locale ou dans le handoff du projet:

```text
Date:
SourceType:
Bob registry reference:
Coach pilote:
Preview rows:
Preview keys:
Write effectue: oui/non
sourceImportRuns:
coachSyncStatus:
Onglet dashboard valide:
Ecarts:
Decision: continuer / corriger / rollback
```

## Next Actions

1. Ne pas modifier les scripts live tant que Michael n'a pas donne l'autorisation explicite.
2. Si Michael autorise Bob, commencer par `AUTO-009` ou `AUTO-002` selon la priorite produit du moment.
3. Toujours faire un preview avant un write.
4. Limiter le premier write a un seul coach pilote.
5. Refaire `verify-dashboard-before-deploy.cmd` apres chaque changement local du contrat ou de la documentation.

