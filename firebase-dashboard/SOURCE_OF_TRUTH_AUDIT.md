# Audit source de verite - Dashboard Coach CFSB

Derniere mise a jour: 2026-06-09

## Conclusion courte

Le dashboard Firebase ne lit pas directement tous les systemes vivants. Il lit Firestore, et Firestore est alimente surtout par un Google Sheet dashboard central, le Sheet de reponses questionnaire et un Sheet CSM check-up externe.

Le risque principal est donc une couche intermediaire incomplete: si les onglets du Sheet dashboard central ne sont pas alimentes par les memes scripts que les outils reels utilises par les coachs, Firebase affiche des donnees techniquement synchronisees mais operationnellement fausses ou incompletes.

Decision mise a jour: un Google Sheet n'est pas obligatoire entre une source et Firestore. Si un Apps Script, une extension CoachRx ou une integration GHL possede deja la donnee vivante, le meilleur chemin cible est un push direct vers Firebase Function securisee, avec le Sheet seulement comme backup ou audit si necessaire.

Audit live du 2026-06-09: Firebase Hosting, Firestore et la sync planifiee fonctionnent. Le probleme restant est surtout la qualite et l'origine des donnees: 17 clients actifs sans telephone, 14 To-do ouvertes dont 9 venant de `TASKS_Current`, 16 reponses questionnaire non matchees, 0 envoi questionnaire journalise et 18 rebookings sans client relie. La prochaine phase doit donc activer les sources fiables, pas seulement corriger l'interface.

## Sources actuellement branchees dans le code

Le registre officiel des sources est maintenu dans `firebase-dashboard/SOURCE_REGISTRY.json`. Ce fichier sert de carte de reference pour relier les sources vivantes, les miroirs temporaires, les collections Firestore, les regles de conflit et les blocages connus. Les sections ci-dessous expliquent le raisonnement, mais le registre est la reference operationnelle a verifier avant d'ajouter un nouveau pont.

### Inventaire Bob Operator confirme

Bob Operator confirme deja les automations Google Workspace pertinentes suivantes. Bob n'est pas une base de donnees; il sert a retrouver, inspecter, modifier et deployer les scripts qui detiennent ou transportent les donnees.

| Automation Bob | Statut | Donnee utile dashboard | Script / systeme | Decision Firebase |
| --- | --- | --- | --- | --- |
| `AUTO-002` Menage CSM hebdomadaire | Preparation | clients CSM, check-ups, telephones, nouveaux membres | Sheet CSM `1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw` + scripts CSM | Brancher les lignes utiles vers `client_directory` et `checkups`; garder le Sheet comme source historique/audit. |
| `AUTO-003` Suivi semi-prives annulations et bookings | Actif | rebookings ouverts, geres, rebookes, absence coach, historique | Apps Script semi-prives `1OsXzGrmJacMYHMIEcTM3dTK-UvaA01bDf0F90HkFNt29XYgK2iHkyBlE` | Ne pas casser l'app actuelle. Ajouter un push direct `rebooking` vers Firebase ou confirmer que `SRC_Rebookings_SemiPrive` est bien le miroir vivant. |
| `AUTO-004` Dashboard coach historique | Pilote GitHub V2 prive | ancien backend dashboard, extension CoachRx, liens rebooking prives | Sheet dashboard `18-S_a5L6fXYZXtcgHBlCKpcygmnr5Ekj_WM5358KZ7E` + Apps Script `1SeGMN1w7iqn_7ETcmg5qwY6wIys4GZy5GbJHWasg6bToThcxrucYfOLk` | Utiliser comme reference de migration, pas comme destination finale. |
| `AUTO-009` Questionnaire client-coach endpoint | Actif pilote | reponses questionnaire, telephone normalise, coach choisi | Sheet reponses `11QO5GOQGHCpT8_nLEgKHqjFFsZ4emPwZEt2Vlu3WRJo` + Apps Script `1RzTyLvUdw6NdVI2vsDoi7a2bjWGAZDXml94QYG4TCs9wF5KJdKm3HFBa` | Alimenter `questionnaire_responses` dans Firestore; conserver le Sheet comme journal historique. |

Point important: les liens tokenises de l'app rebooking ne doivent pas etre copies dans les fichiers publics ou docs partagees. Les IDs de scripts ci-dessus sont acceptables pour l'audit interne.

### 1. Google Sheet dashboard central

ID: `18-S_a5L6fXYZXtcgHBlCKpcygmnr5Ekj_WM5358KZ7E`

Onglets lus:

- `SRC_CoachRx_Browser_All`
- `SRC_CoachRx_Browser`
- `CORE_Clients`
- `CORE_Clients_Manual`
- `TASKS_Current`
- `SRC_Rebookings_SemiPrive`
- `SRC_CSM_FormulaireCheckup`
- `CORE_Alumni`
- `IMPACT_Log`
- `IMPACT_Opportunities`

Role actuel: agregateur principal de donnees pour Firebase.

Risque: cet agregateur peut etre une copie partielle ou une couche generee, pas forcement la source vivante.

Decision: ce Sheet doit etre traite comme un miroir temporaire tant qu'on n'a pas confirme que chaque onglet est alimente par la source vivante correspondante. Il ne doit pas devenir la source permanente par defaut.

### 2. Sheet questionnaire client-coach

ID: `11QO5GOQGHCpT8_nLEgKHqjFFsZ4emPwZEt2Vlu3WRJo`

Onglets lus:

- `Responses`
- `Test_Responses`

Role actuel: source des reponses questionnaire.

Etat observe: les reponses contiennent bien `client_phone` et `client_phone_normalized`. Les problemes viennent surtout du matching avec les clients Firebase/CORE et du coach associe.

### 3. Sheet CSM check-up externe

ID: `1a2j7IFiDmD6svB4p12IIXwcGQRoLrJ_lejhn0dXUtIw`

Onglet lu avec succes:

- `Formulaire Checkup`

Role actuel: source des check-ups pour Performance.

Etat observe: contient `Nom`, `Date`, `Téléphone`, `Note`, `coach`. C'est une bonne source pour les check-ups et certains telephones, mais ce n'est pas forcement une base exhaustive de tous les clients actifs.

### 4. GoHighLevel

Role actuel: envoi questionnaire via ajout du tag `dashboardcoach` par Firebase Function.

Flux actuel:

1. Le coach clique `Envoyer questionnaire`.
2. Firebase cree/journalise une tentative.
3. Firebase cherche le contact GHL par telephone.
4. Firebase ajoute le tag `dashboardcoach`.
5. Le workflow GHL doit envoyer le SMS.

Risque: si le client n'a pas de telephone dans Firebase, ou si le contact GHL n'est pas trouve par telephone, l'envoi echoue.

Role cible possible: enrichissement telephone/courriel et validation contact, via backend prive seulement. GHL ne doit jamais etre appele directement par le navigateur. Si GHL devient la meilleure source telephone, il faut le brancher par Firebase Function ou Apps Script prive, puis ecrire le resultat dans Firestore.

Politique retenue: GHL est la meilleure source pour confirmer un telephone/contact, mais il reste un enrichissement strict. Il peut ajouter ou confirmer un telephone sur une fiche client existante; il ne peut pas creer un client actif orphelin, supprimer un telephone, perimer un client ou remplacer silencieusement un conflit. La politique exacte est encodee dans `SOURCE_REGISTRY.json` sous `phoneResolutionPolicy`.

### 5. Rebooking Apps Script / Sheet historique

Etat actuel: Firebase lit `SRC_Rebookings_SemiPrive` dans le Sheet dashboard central.

Risque majeur: l'app Apps Script de rebooking que les coachs utilisent peut ecrire dans une autre source ou appliquer une logique differente. Si oui, Firebase ne lit pas la vraie source vivante du rebooking.

## Observations terrain

### CoachRx

`SRC_CoachRx_Browser_All` contient des snapshots de l'extension CoachRx, par exemple:

- Coach ID
- Coach
- Source mode
- Source path
- Extension version
- Imported at
- Client
- State
- Exercise due
- Compliance
- Tags
- Alert

Observation: les premieres lignes ne contiennent pas de telephone client. Cette source seule ne suffit donc pas pour GHL, questionnaire ou matching robuste.

### CORE_Clients

`CORE_Clients` contient beaucoup plus de contexte:

- Client
- Coach
- Dashboard status
- Active package
- Membership end date
- Last checkup
- Objective / coach notes
- CoachRx program
- Phone
- Email
- Rebooking totals

Observation: certaines lignes actives ont encore `Phone` vide. Donc meme la source centrale n'est pas toujours suffisante pour l'envoi questionnaire.

### CORE_Clients_Manual

Cette couche existe pour corriger/enrichir:

- telephone;
- courriel;
- membership;
- notes;
- client manuel.

Observation: elle est petite. Elle ne regle pas massivement les telephones manquants.

### TASKS_Current

`TASKS_Current` n'est pas une source brute. C'est deja une couche generee qui melange:

- CoachRx;
- CSM;
- rebooking;
- impacts;
- notes manuelles.

Observation critique: si cette feuille est vieille, incomplete ou generee avec une logique trop agressive, Firebase importe des To-do incorrectes.

### Rebooking

`SRC_Rebookings_SemiPrive` contient:

- Event ID
- Client
- Coach
- Debut RDV
- Service
- Statut
- Recu a
- Source

Observation: cette source ne contient pas de telephone dans les premieres colonnes. Le matching Firebase se fait donc souvent par nom, ce qui est fragile.

## Points de confusion probables

1. Firebase lit un Sheet dashboard central, mais ce Sheet n'est peut-etre pas le meme endroit que les scripts historiques mettent a jour.
2. CoachRx donne le portefeuille et le contexte programme, mais pas toujours les telephones.
3. CSM contient des telephones, mais dans le contexte des check-ups, pas necessairement une liste complete des clients actifs.
4. `TASKS_Current` est une couche generee; ce n'est pas une source primaire.
5. Le rebooking Firebase lit `SRC_Rebookings_SemiPrive`, alors que l'app rebooking actuelle peut avoir sa propre source/logique.
6. Les reponses questionnaire ont souvent le bon telephone, mais ne matchent pas si le client Firebase n'a pas ce telephone ou si le coach choisi ne correspond pas au client.
7. Bob Operator donne acces et capacite d'action sur Google Workspace/Apps Script, mais ce n'est pas une source de donnees; c'est un moyen de brancher ou corriger les sources.

## Source de verite recommandee

| Domaine | Source primaire recommandee | Source Firebase actuelle | Decision recommandee |
| --- | --- | --- | --- |
| Liste clients actifs | CSM/Kilo/CoachRx combine | `CORE_Clients` + CoachRx snapshots | Confirmer quel document CSM/Kilo contient la liste active officielle avec telephones. |
| Telephone client | CSM/Kilo/GHL | `CORE_Clients`, `CORE_Clients_Manual`, GHL enrichissement par nom | Brancher une source telephone fiable; ne pas se fier au CoachRx snapshot seul. |
| Portefeuille coach | CoachRx | `SRC_CoachRx_Browser_All` | Garder comme source de relation coach-client et contexte programme. |
| To-do | Dashboard/Firebase + sources explicites | `TASKS_Current` + questionnaire | Arreter de traiter `TASKS_Current` comme source primaire sans audit; preferer generer les To-do dans Firebase. |
| Questionnaire | Sheet questionnaire, puis Firebase direct cible | `Responses` / `Test_Responses` | OK, mais ameliorer matching telephone + coach et affichage actionnable. |
| Envoi questionnaire | GHL via Firebase Function | `questionnaireSends` + GHL tag | OK en principe; verifier les erreurs et l'absence de journal d'envoi. |
| Rebooking | App/script rebooking vivant | `SRC_Rebookings_SemiPrive` | Verifier que cette tab est vraiment mise a jour par l'app Apps Script actuelle. |
| Check-ups | Sheet CSM check-up | `Formulaire Checkup` + `SRC_CSM_FormulaireCheckup` | OK pour Performance, mais pas une base client exhaustive. |
| Impacts | Dashboard Firebase | `IMPACT_Log` / `IMPACT_Opportunities` | A migrer progressivement vers Firestore comme source primaire. |
| Alumni | Admin/import dashboard | `CORE_Alumni` | Peut rester secondaire pour le pilote. |

## Corrections prioritaires recommandees

1. Auditer le Sheet dashboard central et confirmer s'il est la source vivante ou seulement un miroir.
2. Identifier la vraie source des telephones clients actifs.
3. Relier explicitement la source rebooking Apps Script actuelle a Firebase, ou remplacer `SRC_Rebookings_SemiPrive` par la vraie source.
4. Redefinir `TASKS_Current` comme source temporaire seulement; a terme, generer les To-do dans Firebase avec des regles claires.
5. Ajouter un diagnostic visible par coach indiquant, pour chaque module, la source et la fraicheur.
6. Pour les questionnaires, prioriser le matching par telephone et afficher clairement les non matches.
7. Connecter les scripts qui possedent deja une donnee vivante au pont `ingestDashboardSource`, au lieu de creer de nouveaux Sheets intermediaires.
8. Pour les imports directs de type snapshot client (`coachrx_clients` ou `client_directory`), marquer comme `import_stale` seulement les anciens documents issus de la meme famille d'import et absents du dernier snapshot. Ne jamais faire ce nettoyage avec `ghl_contacts`, car GHL peut envoyer des lots partiels d'enrichissement.

## Decision proposee

Avant d'ajouter beaucoup de nouvelles fonctionnalites, corriger la couche de donnees:

1. Source clients + telephones.
2. Source rebooking vivante.
3. Source To-do fiable.
4. Matching questionnaire.

Ensuite seulement, continuer l'UX et les actions coach.
