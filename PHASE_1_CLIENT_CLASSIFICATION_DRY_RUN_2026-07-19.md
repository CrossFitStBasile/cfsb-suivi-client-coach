# Phase 1 — Classification agrégée des clients sans identité CoachRx stable

Projet: Dashboard Coach CFSB / CoachRx
Date: 2026-07-19
Mode: lecture seule, agrégats uniquement
Source: snapshot privé Firestore scellé en Phase 0
Empreinte du fichier `firestore-clients.json`: `F24C47AC89B772ED568E2BCE00E3BA9E1B73A602FCFC25BEA0D3644A36556C85`
Écritures live effectuées: **0**

## Objectif

Requalifier correctement les fiches actives sans `sourceClientId`. L'absence d'un ID CoachRx n'est pas une anomalie lorsqu'une personne a été créée dans le Dashboard pour un service CFSB et peut n'avoir aucun compte CoachRx.

Le script reproductible est `tools/classify-client-lifecycle-phase1.mjs`. Sa sortie exclut les identifiants de documents, noms, téléphones et courriels.

## Résultat

| Classification | Nombre | Interprétation | Action ultérieure |
| --- | ---: | --- | --- |
| Candidat « Dashboard seulement » | 9 | Absence de lien CoachRx légitime | Attribuer une identité interne immuable; préserver le responsable Dashboard; confirmer le lien GHL si pertinent |
| Fiche prétendument CoachRx sans ID client stable | 3 | Provenance CoachRx non démontrée | Rechercher un ID CoachRx vérifié ou reclassifier comme « Dashboard seulement »; aucune fusion automatique |
| **Total à examiner** | **12** | Fiches actives, sélectionnables et à appartenance confirmée dans le modèle historique | Aucun changement avant la migration contrôlée |

### Répartition agrégée

| Responsable historique | Dashboard seulement | Revendication CoachRx sans ID stable | Total |
| --- | ---: | ---: | ---: |
| David (`15902`) | 1 | 0 | 1 |
| Marc-André (`15935`) | 0 | 2 | 2 |
| Raphaël (`15936`) | 1 | 1 | 2 |
| Hugo (`15937`) | 5 | 0 | 5 |
| Camille (`17242`) | 2 | 0 | 2 |
| **Total** | **9** | **3** | **12** |

### Signaux disponibles, sans les utiliser comme identité canonique

| Signal historique | Dashboard seulement | Revendication CoachRx | Total |
| --- | ---: | ---: | ---: |
| Téléphone normalisé | 9 | 2 | 11 |
| `ghlContactId` présent | 7 | 2 | 9 |
| Enrichissement CSM présent | 7 | 2 | 9 |
| Champ historique `coachRxId` présent | — | — | 12 |

Le champ historique `coachRxId` des douze fiches contient un identifiant de coach dans ce modèle. Il ne constitue donc pas une preuve d'identité client CoachRx.

## Décisions appliquées au dry-run

1. Un client « Dashboard seulement » est un client valide de premier rang.
2. Son identité interne ne dépend jamais de son coach, de son nom ou de son téléphone.
3. Son lien GHL est optionnel et distinct de son identité interne.
4. Son absence d'un roster CoachRx ne peut ni le rendre stale, ni le supprimer, ni le transférer.
5. S'il rejoint CoachRx plus tard, un lien CoachRx est ajouté à la même fiche après rapprochement contrôlé.
6. Nom ou téléphone seuls ne déclenchent jamais une fusion automatique.
7. Les trois revendications CoachRx non prouvées demeurent en révision jusqu'à preuve ou reclassification.

## Limites

- Ce rapport ne modifie aucune fiche.
- Il ne décide pas individuellement du sort des trois cas CoachRx non prouvés.
- Il ne crée pas les identités internes finales des neuf clients Dashboard.
- Le rapprochement GHL et CoachRx détaillé appartient au dry-run de migration, puis à une exécution séparément autorisée.

## Reproduction

```powershell
node tools/classify-client-lifecycle-phase1.mjs --input <chemin-prive-vers-firestore-clients.json>
node --test tests/phase1-client-classifier.test.mjs
```
