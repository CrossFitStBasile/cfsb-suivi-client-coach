# Playbook payloads sources -> Firebase - Dashboard Coach CFSB

Derniere mise a jour: 2026-06-08

## Objectif

Ce playbook transforme la strategie de source de verite en gestes concrets pour Bob Operator, Apps Script ou une extension CoachRx.

Le principe reste:

```text
Source vivante -> preview Apps Script -> Cloud Function securisee -> Firestore -> Dashboard
```

Google Sheets peut rester un backup/audit, mais il ne doit pas etre ajoute comme passage obligatoire quand le script possede deja la donnee vivante.

## Contrat machine-readable

Le contrat verifiable est:

```text
firebase-dashboard/SOURCE_PAYLOAD_CONTRACTS.json
```

Les exemples non sensibles a copier dans un script prive avant un preview sont:

```text
firebase-dashboard/SOURCE_PAYLOAD_SAMPLES.json
```

Il doit rester aligne avec:

- `firebase-dashboard/SOURCE_REGISTRY.json`
- `firebase-dashboard/DATA_INGESTION_PLAN.md`
- `firebase-dashboard/DATA_SOURCE_ACTIVATION_MATRIX.md`
- `firebase-dashboard/apps-script/dashboard-import-bridge-template.gs`
- `firebase-dashboard/apps-script/dashboard-live-source-adapters.gs`
- `functions/index.js`

Les payloads d'exemple ne sont pas des donnees client. Ils servent seulement a verifier le format, les cles attendues, les signaux de preview et les interdits de merge avant de brancher une source vivante.

## Etape obligatoire avant tout write

Dans le script source, lancer d'abord un preview:

```javascript
previewDashboardImportPayload_({
  sourceType: 'coachrx_clients',
  coachRxId: '15935',
  coachName: 'Marc-Andre Menard',
  records: rows.slice(0, 3)
});
```

Ce preview doit confirmer:

- le bon `sourceType`;
- le bon coach;
- un nombre de lignes attendu;
- les cles detectees dans `sampleKeys`.

Si le preview est faux, ne pas appeler `pushDashboardSourceToFirebase_`.

## Adaptateurs Apps Script pour scripts vivants

Quand un script a deja les lignes extraites en memoire, utiliser les adaptateurs:

```text
firebase-dashboard/apps-script/dashboard-live-source-adapters.gs
```

Fonctions disponibles:

- `previewCoachRxClientsForDashboard_` / `pushCoachRxClientsForDashboard_`
- `previewClientDirectoryForDashboard_` / `pushClientDirectoryForDashboard_`
- `previewGhlContactsForDashboard_` / `pushGhlContactsForDashboard_`
- `previewQuestionnaireResponsesForDashboard_` / `pushQuestionnaireResponsesForDashboard_`
- `previewCheckupsForDashboard_` / `pushCheckupsForDashboard_`
- `previewRebookingsForDashboard_` / `pushRebookingsForDashboard_`

Exemple:

```javascript
function previewCoachRxIheb_(rows) {
  return previewCoachRxClientsForDashboard_('15928', rows.slice(0, 3));
}
```

Ces helpers evitent de recreer un Sheet intermediaire quand ce n'est pas necessaire. Ils n'ecrivent rien par eux-memes en mode preview et passent ensuite par `pushDashboardSourceToFirebase_`, donc le meme secret serveur et le meme journal `sourceImportRuns` s'appliquent.

## Ordre d'activation

1. CoachRx clients (`coachrx_clients`)
2. Repertoire client / telephones (`client_directory`)
3. GHL contacts (`ghl_contacts`) cote serveur seulement
4. Questionnaire (`questionnaire_responses`)
5. Check-ups CSM (`checkups`)
6. Rebooking (`rebooking`) seulement apres comparaison avec l'app legacy

## CoachRx clients

But: alimenter le portefeuille client et le contexte programme.

Payload minimal:

```javascript
{
  sourceType: 'coachrx_clients',
  coachRxId: '15935',
  coachName: 'Marc-Andre Menard',
  records: [
    {
      Client: 'Nom Client',
      Phone: '514-555-1234',
      Email: 'client@example.com',
      'Active package': 'Semi-Prive',
      'Program': 'Programme actuel',
      'Exercise due': '2026-06-10'
    }
  ]
}
```

Regle: CoachRx peut etre un snapshot complet et marquer stale seulement les anciens imports CoachRx de la meme famille. Les champs manuels restent proteges.

Preuve de succes:

- `sourceImportRuns` contient le lot;
- `coachSyncStatus` affiche le dernier import;
- l'onglet Clients du coach contient les bons noms;
- les To-do ne se remplissent pas de faux programmes futurs.

## Repertoire client / telephones

But: enrichir telephone, courriel, membership et contexte admin/Kilo/CSM.

Payload minimal:

```javascript
{
  sourceType: 'client_directory',
  coachRxId: '15935',
  records: [
    {
      Client: 'Nom Client',
      Phone: '514-555-1234',
      Email: 'client@example.com',
      Membership: 'Semi-Prive'
    }
  ]
}
```

Regle: une valeur vide ne remplace jamais une valeur utile. La fin membership et la recurrence Kilo restent manuelles dans le dashboard.

Preuve de succes:

- le compteur `Sans telephone` baisse;
- les envois questionnaire deviennent disponibles pour les clients enrichis;
- les champs manuels ne changent pas apres import.

## GHL contacts

But: confirmer ou enrichir les telephones/contactId par source serveur.

GHL ne doit jamais etre appele depuis le navigateur. Le payload doit venir d'une Cloud Function ou d'un Apps Script prive.

Payload minimal:

```javascript
{
  sourceType: 'ghl_contacts',
  coachRxId: '15935',
  records: [
    {
      phone: '514-555-1234',
      contactId: 'ghl_contact_id',
      email: 'client@example.com',
      name: 'Nom Client'
    }
  ]
}
```

Regle: GHL enrichit seulement. Il ne supprime pas, ne perime pas et ne transfere pas de client.

Preuve de succes:

- le matching se fait par telephone exact;
- aucun document n'est marque stale par GHL;
- les erreurs GHL restent visibles dans le journal.

## Questionnaire

But: envoyer les reponses dans l'inbox questionnaire sans dependre de l'ordre des colonnes.

Payload minimal:

```javascript
{
  sourceType: 'questionnaire_responses',
  coachName: 'Marc-Andre Menard',
  records: [
    {
      response_id: 'resp_123',
      submitted_at: '2026-06-08T15:00:00Z',
      client_phone_normalized: '5145551234',
      triage_status: 'orange',
      coach_action_type: 'discussion_structuree',
      open_note: 'Note client'
    }
  ]
}
```

Regle: le telephone normalise est la cle principale. Une reponse non matchee va dans `A valider`. Le contenu de la reponse reste immutable; le coach peut marquer lu ou creer une mission.

Preuve de succes:

- `Reponses a lire` affiche les nouvelles reponses;
- les couleurs rouge/orange/jaune/vert servent de signaux visuels;
- aucune fausse relance n'est creee pour un questionnaire non envoye.

## Check-ups CSM

But: alimenter Performance et l'historique client.

Payload minimal:

```javascript
{
  sourceType: 'checkups',
  coachName: 'Marc-Andre Menard',
  records: [
    {
      Client: 'Nom Client',
      Phone: '514-555-1234',
      'Dernier check-up': '2026-06-08',
      Notes: 'Resume du check-up',
      Assiduite: 'Bonne'
    }
  ]
}
```

Regle: lecture seulement pour performance/historique. Ne modifie pas les champs manuels client.

Preuve de succes:

- Performance compte les check-ups dans la periode choisie;
- la fiche client affiche l'historique pertinent.

## Rebooking

But: migrer progressivement l'information de rebooking sans casser l'app Apps Script actuelle.

Payload minimal:

```javascript
{
  sourceType: 'rebooking',
  coachName: 'Marc-Andre Menard',
  records: [
    {
      'Event ID': 'event_123',
      Client: 'Nom Client',
      Phone: '514-555-1234',
      'Debut RDV': '2026-06-10 10:30',
      Service: 'Semi-Prive',
      Statut: 'OUVERT'
    }
  ]
}
```

Regle: rebooking direct attend l'audit avec l'app legacy. Un item gere/rebooke/absence coach ne revient pas ouvert par reimport.

Preuve de succes:

- Firebase et l'app legacy comptent les memes dossiers ouverts pour le coach;
- `Reouvrir` fonctionne;
- absence coach garde la raison et la plage;
- aucune URL Apps Script tokenisee n'est publiee.

## Checklist avant activation d'une source

1. Le `sourceType` existe dans `SOURCE_PAYLOAD_CONTRACTS.json`.
2. Le format est compare a `SOURCE_PAYLOAD_SAMPLES.json`.
3. Le preview reussit sur 1 a 3 lignes.
4. Le secret `DASHBOARD_IMPORT_TOKEN` est dans Firebase Secret Manager.
5. Le meme secret est dans les Script Properties du script prive.
6. Le rollback est documente.
7. Le premier write touche un seul coach pilote.
8. `sourceImportRuns` et `coachSyncStatus` confirment l'import.
9. Le dashboard affiche la meme realite que la source vivante.
