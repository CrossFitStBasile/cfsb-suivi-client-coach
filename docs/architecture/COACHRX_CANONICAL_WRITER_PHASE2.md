# Writer canonique CoachRx — Phase 2

Date locale: 2026-07-19

Etat: implémente localement, non déployé, non activé

## Objectif

Cette tranche complète le cycle de liaison CoachRx sans réintroduire une appartenance implicite par nom ou téléphone:

- proposer un lien CoachRx à une fiche Dashboard existante;
- confirmer le lien avec unicité transactionnelle;
- créer une identité canonique pour un client réellement né dans CoachRx;
- enregistrer les observations du roster sans déplacer automatiquement `dashboardResponsibleCoachId`;
- conserver une fiche absente d'un roster complet avec `rosterStatus = not_in_latest_roster`;
- empêcher un job questionnaire de remettre à zéro le compteur CoachRx du coach.

## Commande administrateur

### `proposeCoachRxLink`

Payload:

```json
{
  "clientId": "uuid-interne",
  "sourceClientId": "identite-coachrx-stable",
  "coachRxOwnerId": "15935",
  "importRunId": "lot-optionnel",
  "reason": "motif administratif",
  "idempotencyKey": "cle-requete-stable"
}
```

Réponse:

```json
{
  "ok": true,
  "clientId": "uuid-interne",
  "internalClientId": "uuid-interne",
  "dashboardResponsibleCoachId": "15935",
  "responsibilityMode": "dashboard_only",
  "reused": false
}
```

La commande est réservée à l'admin actif, limitée aux sept coachs pilotes, auditée et idempotente. Elle réserve `externalIdentityClaims/{hash}` au statut `candidate`. Un autre client ne peut réserver le même identifiant, même en concurrence. Un second candidat ne remplace jamais silencieusement le premier.

`confirmCoachRxLink` conserve son contrat Phase 1 et promeut la même réservation au statut `active` dans la transaction de confirmation.

## Writer de roster

Le nouveau writer n'est utilisé que si le payload serveur déclare simultanément:

- `clientContractVersion = 1`;
- `canonicalContractMode = "phase2"`;
- un coach pilote explicite;
- une route `/team/{coachId}/clients` ou `/api/v1/coaches/{coachId}/clients.json` concordante;
- une identité stable par ligne avec `identityKind` dans `id`, `slug` ou `url_slug`;
- un `sourceRunId` stable fourni par la source, sans fallback vers l'identifiant
  éphémère de la requête ou de la file de transport;
- un `sourceGeneratedAt` valide, normalisé en ISO et pas plus de dix minutes
  dans le futur.

Le serveur exige aussi `systemConfig/clientContractPhase2` avec `enabled = true`, `contractVersion = 1`, `backfillCompleted = true`, `claimsVerified = true` et le coach dans `pilotCoachIds`. Le marqueur fourni par le transport ne peut donc pas activer seul le writer.

Sans ces marqueurs, le pipeline actuel reste inchangé. Cette activation explicite évite qu'un déploiement de code transforme immédiatement les données live.

Ordre de décision par ligne:

1. réservation CoachRx exacte existante;
2. signal téléphonique déjà réservé, uniquement pour créer une proposition à confirmer;
3. nouvelle identité `coachrx_import` si aucun candidat n'existe.

Le nom, le courriel et le téléphone ne fusionnent jamais deux identités. Le téléphone ne sert qu'à produire un candidat. Les observations opérationnelles sont écrites sous `clients/{internalClientId}/sourceObservations/coachrx` avec une liste blanche de champs.

## Responsabilité et roster

- `dashboardResponsibleCoachId` n'est jamais recalculé par le roster.
- Un changement de propriétaire CoachRx conserve le responsable Dashboard et transforme la divergence en `manual_override`.
- Un `manual_override` survit aux observations actives suivantes.
- Toute mutation canonique exige un horodatage source valide; un lot absent,
  invalide ou trop futur échoue avant la première transaction client.
- Une absence n'est appliquée que pour un roster complet, non vide et avec compteur exact.
- Une absence passe seulement `coachRxLink.rosterStatus` à `not_in_latest_roster`, place le mode à `dashboard_only` et ferme l'engagement CoachRx déterministe.
- Aucune fiche, note, réponse ou action historique n'est supprimée.
- Une observation plus ancienne que celle déjà stockée est ignorée.

## Statuts de synchronisation séparés

Chaque pipeline écrit désormais son sous-document:

`coachSyncStatus/{coachId}/pipelines/{pipeline}`

Les champs top-level existants sont conservés pour compatibilité. Le patch top-level est borné au pipeline courant. En particulier, un résultat `questionnaire` ne contient jamais `clientsImported`, `clientsEnriched`, `clientsMissingPhone`, `source` ou `syncedAt`; il ne peut donc plus remplacer le dernier total CoachRx par zéro.

## Dry-run du snapshot privé

Source: snapshot Firestore de Phase 0, SHA-256 `F24C47AC89B772ED568E2BCE00E3BA9E1B73A602FCFC25BEA0D3644A36556C85`.

- 313 fiches analysées;
- 0 fiche déjà canonique dans ce snapshot;
- 165 fiches legacy avec identifiant CoachRx stable à migrer;
- 145 de ces fiches ont déjà une appartenance confirmée exploitable;
- 20 identifiants stables exigent une revue d'appartenance avant migration;
- 3 fiches actives revendiquent CoachRx sans identifiant stable et exigent une revue;
- 9 fiches actives sans identifiant stable restent des candidats Dashboard seulement valides;
- 121 fiches historiques ou inactives sans identifiant stable sont différées;
- 0 collision d'identifiant CoachRx détectée dans le snapshot;
- 0 donnée personnelle émise et 0 écriture live.

Le mode canonique demeure donc volontairement désactivé jusqu'au backfill transactionnel et au canari des sept coachs.

## Validation locale

Commandes exécutées avec Node 22:

- tests Functions et contrats;
- tests de dry-run sans PII;
- vérification syntaxique des nouveaux modules et de `functions/index.js`;
- `git diff --check`.

Les tests couvrent notamment l'idempotence, l'absence de fallback du
`sourceRunId`, les claims concurrents, les conflits inter-clients, la survie des
overrides, les timestamps absents/invalides/futurs, les rosters incomplets,
l'absence non destructive, l'ordre des observations et la non-régression du
compteur CoachRx.

Résultat final: **59/59 tests réussis**, syntaxes valides et `git diff --check`
sans erreur (hors avertissements de conversion de fins de ligne).

## Limites et préconditions d'activation

- Aucun déploiement ni écriture live n'a été effectué.
- Le writer canonique reste derrière le marqueur explicite `canonicalContractMode = "phase2"`.
- Il reste également bloqué par défaut tant que la configuration serveur d'activation n'existe pas et ne certifie pas le backfill et les claims.
- Les 165 identifiants stables doivent être migrés et leurs claims créés transactionnellement avant activation.
- Les 3 revendications actives sans identifiant stable doivent être résolues.
- Le snapshot utilisé ne contient pas la collection `externalIdentityClaims`; son backfill doit être vérifié séparément.
- Les transactions Firestore sont couvertes par fonctions pures et assertions de structure; un canari Emulator/terrain avec le transport Apps Script réel reste requis avant production.
- La distribution de l'extension et les messages aux coachs restent hors de cette tranche backend.
