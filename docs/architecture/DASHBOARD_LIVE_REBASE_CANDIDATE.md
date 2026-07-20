# Dashboard — rebase reproductible depuis le live scellé

Statut : candidat local, non approuvé pour déploiement.

## Pourquoi ce générateur existe

`firebase-dashboard/public/app.js` correspond à une base plus ancienne (version
0.6.4 de l’extension), alors que le snapshot
`releases/dashboard-hosting/2026-07-19T000445Z/source/app.js` est la copie exacte
du Dashboard live observé avec l’extension 0.6.8. Reprendre directement le
dossier `public` ferait donc disparaître des corrections déjà présentes en
production.

Le générateur `tools/build-dashboard-live-rebase-candidate.mjs` utilise toujours
le snapshot scellé comme préimage. Il vérifie les 76 SHA-256 avant toute copie,
refuse une préimage différente et construit le résultat dans un nouveau dossier.
Il refuse aussi toute sortie dans le snapshot, `firebase-dashboard/public`, le
preview 0.6.10 ou un dossier candidat qui existe déjà.

## Transformations permises

Le périmètre est volontairement fermé :

- `app.js` : version candidate, gateway de commandes client, création canonique,
  transfert de responsabilité Dashboard, lecture coach exclusivement par
  `dashboardResponsibleCoachId`, lectures legacy réservées à l’admin, et parcours
  questionnaire bloqué tant que le serveur n’émet pas de jeton opaque;
- `index.html` : cache-buster de la version candidate;
- cinq fichiers questionnaire : templates Phase 1 sans PII dans l’URL et avec
  soumission exigeant un accusé HTTP JSON positif;
- trois nouveaux modules : gateway client, accès questionnaire et soumission
  questionnaire.

Le transfert de responsabilité choisit le mode à partir de l’état contractuel de
la fiche. Sans `coachRxLink` à la fois `verified` et `active`, il envoie
obligatoirement `dashboard_only`. Avec un lien CoachRx actif vérifié, il choisit
`follow_coachrx` lorsque le responsable Dashboard correspond au
`coachRxOwnerId`, sinon `manual_override`. Un mode fourni explicitement n’est
accepté que s’il respecte ces mêmes invariants; toute combinaison incohérente
est refusée avant l’appel serveur.

Pour un profil coach, le filtre UI n’est jamais utilisé comme frontière de
sécurité. Les neuf collections opérationnelles souscrites — `clients`, `tasks`,
`questionnaireResponses`, `questionnaireSends`, `questionnaireSchedules`,
`rebookings`, `checkups`, `impacts` et `alumni` — sont interrogées uniquement par
`dashboardResponsibleCoachId == sonCoachId`. Aucune requête legacy `coachId`,
`coachRxId`, `assignedCoachId`, `coachName` ou `assignedCoachName` n’est lancée
pour un coach. Seul le parcours admin peut encore effectuer ces lectures
nécessaires à la migration et à la revue des anciennes fiches.

Tous les autres fichiers du live sont copiés octet pour octet. Le candidat
conserve notamment l’extension distribuée 0.6.8; il n’incorpore ni ne modifie le
preview 0.6.10.

## Génération

```powershell
node .\tools\build-dashboard-live-rebase-candidate.mjs `
  --output 'C:\Users\micha\AppData\Local\CFSB-dashboard-phase2\nouveau-candidat' `
  --version '20260719-phase2-live-rebase-candidate-4'
```

Le dossier généré contient `source/`, la configuration Firebase conservée du
snapshot et `candidate-manifest.json`. Le statut du manifeste reste
`candidate_not_approved_for_deployment`.

## Parcours encore bloqués

- modification des champs d’une fiche canonique autre que la responsabilité
  Dashboard : aucune commande serveur contractuelle n’existe encore;
- modification d’une fiche legacy : elle doit d’abord recevoir une identité
  canonique;
- archivage, suppression, réactivation, téléphone et cible d’assiduité : les
  anciens parcours écrivent directement dans `clients` et sont refusés par les
  règles Phase 1;
- transfert des objets historiques reliés (missions, rebookings, réponses) : la
  commande de responsabilité ne les déplace pas automatiquement;
- envoi et planification de questionnaires : bloqués jusqu’à ce qu’un backend
  puisse émettre un jeton opaque, résoudre le client côté serveur et retourner
  un accusé de prise en charge positif;
- lien GHL et lien CoachRx : les commandes existent dans le gateway, mais aucune
  interface utilisateur n’est activée dans ce candidat;
- extension 0.6.10 : hors périmètre de ce générateur et à valider dans son propre
  preview.

Ces blocages sont explicites et fail-closed : aucun succès ne doit être affiché
si le backend ne confirme pas la commande.

## Vérification

```powershell
node --test .\tests\dashboard-live-rebase-candidate.test.mjs
```

Les tests prouvent notamment la conservation octet pour octet des 69 fichiers
live non ciblés, le déterminisme du résultat, le refus d’une préimage altérée et
la protection des destinations interdites.
