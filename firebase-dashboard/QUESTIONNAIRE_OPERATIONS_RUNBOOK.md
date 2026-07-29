# Questionnaire Studio — runbook d'exploitation

## Résultat attendu

Un coach peut envoyer ou planifier un questionnaire publié. Le membre reçoit
une URL fixe sans données personnelles, soumet une seule réponse et celle-ci
est reliée à un `internalClientId` unique ou placée dans
`questionnaire_review`.

## Créer et activer un formulaire

1. Créer le brouillon dans Questionnaire Studio.
2. Utiliser un slug et un tag GHL qui ne sont employés par aucun autre
   formulaire. Les tags historiques `dashboardcoach`, `suiviregulier` et
   `evaluationnutrition` sont réservés.
3. Publier la version exacte.
4. Dans GHL, créer un workflow distinct :
   - déclencheur : ajout du tag exact;
   - réinscription permise;
   - courriel avec l'URL publique fixe;
   - SMS seulement si ce canal a été validé;
   - retrait du tag avant la fin.
5. Exécuter le canari avec un contact synthétique contrôlé.
6. Confirmer dans Studio le tag, l'URL, la version et la preuve du canari.
7. Activer `deliveryReady`.

Ne jamais placer un téléphone, un nom, un coach ou un identifiant client dans
l'URL du workflow.

## Arrêt immédiat

1. Dans Studio, désactiver la livraison GHL du formulaire.
2. Confirmer que `deliveryReady=false` apparaît dans le formulaire et dans
   `questionnaireCatalog`.
3. Mettre le workflow GHL en brouillon si un effet externe doit aussi être
   arrêté.
4. Ne pas supprimer le formulaire ni le tag pendant l'incident.

La désactivation est permise même si un brouillon non publié existe. Les
questionnaires historiques et les autres formulaires restent disponibles.

## Diagnostiquer un envoi

Lire `questionnaireSends/{sendId}` :

| État | Signification | Action |
|---|---|---|
| `firestore_queue_pending` | En attente du backend | Attendre le processeur |
| `backend_processing` | Bail actif | Vérifier `claimExpiresAt` |
| `ghl_pending` + `not_started` | Contact validé, effet non commencé | Le reaper peut reprendre |
| `tag_added` + `completed` | Reçu GHL confirmé | Attendre la réponse |
| `ghl_error` | Effet GHL non confirmé | Corriger puis recréer une tentative |
| `ghl_effect_uncertain` | Effet peut avoir eu lieu | Vérifier GHL avant toute reprise |

Ne jamais rejouer automatiquement un état `uncertain`.

## Diagnostiquer une planification

Lire `questionnaireSchedules/{scheduleId}` :

- `deliveryState=queued` : un envoi est en cours;
- `deliveryState=sent` : la prochaine date a été avancée;
- `deliveryState=blocked_delivery` : le formulaire attend sa validation GHL;
- `deliveryState=error` : la planification est en pause;
- `deliveryState=uncertain` : vérifier GHL avant de reprendre.

Une planification `once` terminée exige une nouvelle date avant sa
réactivation. Une republication de formulaire ne détruit pas la planification :
elle reste en attente tant que `deliveryReady=false`.

## Réponse et identité

- Le téléphone est une preuve de rapprochement, jamais l'identité principale.
- Une seule fiche membre sélectionnable et à propriété confirmée peut être
  reliée automatiquement.
- Toute ambiguïté va dans `questionnaire_review`.
- Un lien `matched_manual` est autoritaire et survit aux synchronisations.
- Seul un administrateur peut délier ou remplacer un rapprochement manuel.

## Canaris et données de test

- Utiliser uniquement un contact GHL et une fiche Dashboard synthétiques.
- Marquer chaque document avec les champs canaris prévus par le runner.
- Ne jamais imprimer de nom, téléphone, courriel, ID source ou jeton dans les
  preuves.
- Après conservation des preuves, archiver les réponses synthétiques et les
  retirer des files opérationnelles.

## Confidentialité et conservation

Le formulaire public doit afficher l'avis de collecte et un lien vers la
politique CFSB. Les réponses utilisent la classe de conservation
`member_coaching_questionnaire`.

La durée de conservation des réponses membres doit être approuvée par la
personne responsable de la protection des renseignements personnels avant
toute suppression automatisée. En attendant cette décision, ne jamais
configurer un TTL sur `questionnaireResponses`.

Le TTL peut être utilisé sur `questionnaireRateLimits`, qui ne contient que des
compteurs techniques temporaires.

Après avoir vérifié la cible Firebase/Google Cloud exacte, activer et relire
uniquement ce TTL technique :

```cmd
gcloud firestore fields ttls update expiresAt --collection-group=questionnaireRateLimits --database="(default)" --enable-ttl --project=cfsb-dashboard-coach-aa9a4
gcloud firestore fields ttls list --collection-group=questionnaireRateLimits --database="(default)" --project=cfsb-dashboard-coach-aa9a4
```

Ne jamais substituer `questionnaireResponses` à cette collection dans la
commande.

## Retour arrière

1. Désactiver `deliveryReady` pour les nouveaux formulaires.
2. Mettre en brouillon les workflows GHL concernés.
3. Déployer l'archive Hosting autonome du dernier SHA vert si l'interface est
   en cause.
4. Restaurer les Functions du dernier tag Git vert si le backend est en cause.
5. Rejouer les contrôles de continuité des trois routes historiques.
6. Réactiver un formulaire à la fois après un canari réussi.
