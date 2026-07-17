Etat publication 2026-07-15: live confirme `20260715-firebase-questionnaire-suite`. Les trois formulaires sont maintenant servis par Firebase Hosting et leurs reponses restent traitees par le pont Apps Script existant.

Version live de reference: `app.js?v=20260715-firebase-questionnaire-suite`.

La version Google-only deplace l'hebergement du questionnaire de GitHub Pages vers Firebase Hosting sans changer son traitement Apps Script. Les routes live `/questionnaire/` et `/questionnaire/coaches.json` ont ete validees. Le Hosting de production a ete publie depuis un instantane Cloud Storage prive par Cloud Build et le compte de service dedie `dashboard-deployer@...`; verification live stricte 9/9 et contrat Google-only 7/7. Un instantane de cloture contenant le pipeline reproductible a ensuite passe Cloud Build (`bbb56d5a-0a05-4777-8428-f07d8bca02f4`). GitHub reste uniquement un retour arriere pendant la migration du backend et du plan de reprise.

La version live remplace la lecture aplatie des questionnaires par une lecture complete, ordonnee selon chaque formulaire et compacte sur mobile. La candidate precedente `20260714-five-star-terrain-gates` reste la reference historique des neuf controles terrain. La publication a passe le pipeline local, la verification live stricte et un controle visuel sur ordinateur et mobile.

Acceptation technique 5/5 en cours: pipeline local 33/33, verification live stricte 9/9, matrice de pages 25/25 et matrice de modales 20/20. Les preuves `actionLogs` confirment maintenant 8 des 8 parcours critiques apres un test synthetique controle Alumni/retour/transfert. Les documents synthetiques ont ete nettoyes; les validations humaines restent ouvertes.

Protocole terrain consolide dans `PILOT_VALIDATION_CHECKLIST.md`: test synthetique reversible Alumni/transfert, acceptation de trois coachs, authentification iPhone/Android/ordinateur, onboarding autonome CoachRx et qualification du rebooking a volume eleve. Aucun de ces jalons humains ne sera declare reussi sans observation reelle.

Suivi d'acceptation live: les coachs pilotes peuvent consigner leur verdict par appareil dans `Guide > Validation terrain 5/5`; l'admin voit l'agregat prive dans Guide/Admin. Aucun popup n'est impose et aucune donnee client n'est stockee. La candidate ajoute les validations mission vocale, client manuel coach, livraison questionnaire et rebooking volumineux aux cinq parcours deja suivis. Une validation n'est comptee que si son `appVersion` correspond exactement a la version courante; les anciennes validations affichent `Retest requis`. Les reponses terrain demeurent ouvertes.

# Dashboard Coach CFSB - Board de finalisation

Date: 2026-07-13

Ce board garde le cap pendant que le dashboard est deja utilise par les coachs. Les prochaines modifications doivent etre traitees comme des changements de production: petites, testees, reversibles et sans casser le flot quotidien.

## Etat live confirme

URL live principale: `https://cfsb-dashboard-coach-aa9a4.web.app`

Version servie:

- `app.js?v=20260715-firebase-questionnaire-suite`
- controle de fraicheur au demarrage, toutes les cinq minutes et au retour dans l'onglet; aucune actualisation automatique pendant le travail du coach
- banniere `Nouvelle version disponible` avec actualisation volontaire seulement lorsque aucune action ou modale n'est en cours
- publication Google-only confirmee le 2026-07-15; lecture des questionnaires structuree par sections, suivi d'acceptation terrain prive et cinq commandes compactes Actions, Rebooking, Impacts, Check-ups et A lire
- source de publication Hosting: instantane prive `20260715T192707Z`, Cloud Build `e36078a3-e63f-4c3e-8fbe-a0c83929b9da`, compte de service dedie, aucune lecture GitHub
- reprise source confirmee: 146 fichiers verifies depuis l'archive privee, 0 manquant et 0 divergence SHA-256
- le compteur A lire utilise les reponses `to_read/assigned`; son clic ouvre directement Suivi sur la vue A lire et reinitialise la recherche
- pilote IA vocal prive `info@`, avec confirmation obligatoire avant la creation d'une mission
- microphone direct dans `+ Mission`: transcription serveur, proposition editable, puis execution volontaire seulement apres confirmation
- verification live stable: 9/9
- commande verification live stable: `cmd /c verify-dashboard-live-stable.cmd`
- assets publics: aucun secret evident
- cache: no-store confirme
- fallback SPA: confirme
- cinq largeurs d'acceptation testees sur To-do, Clients, Questionnaires, Rebooking et Pilotage: 25/25 sans erreur visible ni debordement horizontal
- modales Mission, Client, Questionnaire et Rebooking testees aux cinq largeurs: 20/20, fermeture fiable et reprise de navigation confirmee
- preuve live des parcours via 423 journaux d'actions: 8/8 parcours complets; aucune preuve automatique manquante

Validation locale recente:

- syntaxe frontend: OK
- audit produit: 86/86
- pipeline local confirme: 33/33, incluant le pilote IA admin prive et son transport vocal temporaire
- actions, formulaires, filtres, onglets et modales: OK
- audit live acces coach: OK
- audit live Firestore: OK, mais plusieurs donnees terrain restent a nettoyer
- audit d'acceptation anonymise disponible avec `audit-live-firestore.cmd --five-star`; aucun nom, telephone, courriel ou texte libre n'est expose dans la sortie 5/5
- test synthetique Alumni/retour/transfert termine sans gel; nettoyeur a garde-fous confirme les documents Clients, To-do et Alumni absents tout en preservant `actionLogs`
- messages d'erreur coach: contexte d'action ajoute sans exposer les diagnostics Firebase
- mission rapide mobile: bouton flottant telephone, client optionnel, vocal conserve, etoile coach
- mission vocale: audio depose en morceaux dans une file Firestore privee, assemble par `processVoiceMissionRequest`, puis mission et vocal confirmes ensemble seulement apres la sauvegarde Storage
- lecture vocale: URL preparee avant le clic, compatibilite des anciens vocaux, erreur isolee sans bloquer la navigation et mission fermee retiree immediatement de la To-do
- To-do quotidienne: vue Toutes par defaut, notes coach incluses, filtre compact, etoiles toujours classees en premier, lecture vocale directe et compteur de seances a rebooker cliquable
- rebooking vers mission: chaque dossier ouvert peut creer volontairement une mission liee sans fermer automatiquement la seance a remettre
- modale mission mobile: contenu en une colonne, controles audio compacts et protection contre le debordement horizontal
- PWA legere: manifest ajoute pour installation ecran d'accueil iPhone/Android
- navigation mobile phase 1: header app, barre du bas, menu Plus, menu Compte, sidebar cachee sur telephone
- enrichissement client live: assiduite des 30 derniers jours, moyenne hebdomadaire reelle, cible manuelle protegee et niveau global Level Method depuis le CSM
- UX Clients compacte: cartes centrees sur membership, Level Method colore et rythme reel/cible; telephone, validation et diagnostics retires de la liste coach
- fiche client: priorite et actions ouvertes en premier, rythme modifiable directement, sections action/suivi/entrainement/resume visuellement distinctes
- densite operationnelle: To-do, Suivis et Rebooking utilisent une hierarchie compacte partagee, une seule action principale et un menu Plus pour les commandes secondaires
- preuve Firestore 2026-07-11: 14/14 demandes terminees, 112 fiches actives avec assiduite 30 jours et 80 avec niveau global Level Method
- exploitation continue: rapport prive chaque jeudi a 9 h, sante des sources et workflows, adoption par coach et candidats automatisation sur 28 jours
- premier rapport live genere: `weekly_2026-07-12`; 4/7 coachs actifs, 129 actions mesurees et 5 candidats d'automatisation generiques a observer
- Functions d'exploitation confirmees actives: `scheduledWeeklyProductReport` et `processProductReportRequest`
- Functions IA confirmees actives: `processAssistantVoiceRequest`, `processAssistantRequest` et `processAssistantActionRequest`
- test live lecture seule sur le contexte Gabriel: reponse structuree, references verifiees, aucune action operationnelle
- test live `task.create` sur le contexte Gabriel: proposition confirmee, mission creee avec la source `assistant_admin_confirmed`, preuve relue, puis donnees de test nettoyees
- validation visuelle post-deploiement: Guide/Admin affiche les 7 coachs pilotes, 0/7 verdict au demarrage, aucun debordement horizontal a 390 px ou 1280 px et aucune erreur console

## Pilote IA prive - tranches R0, R1 et R2 live

Objectif: tester la boucle d'assistance dans le vrai dashboard sans modifier le travail quotidien des coachs.

- onglet `Assistant` visible seulement lorsque le profil actif est admin et que le compte Firebase Auth est exactement `info@crossfitstbasilelegrand.com`;
- demandes textuelles et vocales live, limitees a un coach pilote selectionne;
- lecture seule de champs explicitement autorises dans les missions, clients, questionnaires, rebookings et objectif coach;
- aucun telephone, courriel, secret, diagnostic technique ou payload brut n'est envoye au modele;
- R0 demeure en lecture seule pour les demandes generales;
- R1 accepte uniquement `task.create`: le modele prepare une proposition structuree, puis le backend cree la mission seulement apres une confirmation explicite de `info@`;
- R2 ajoute un microphone dans `+ Mission`: l'audio temporaire est transcrit cote serveur, supprime, puis passe dans exactement la meme carte de proposition R1;
- une transcription vocale ne confirme jamais la mission et ne contourne pas la seconde validation backend;
- les autres comptes coach ne voient ni l'interface Assistant ni les files vocales;
- `assistantActionRequests` est privee, revalidee cote serveur et protegee contre les doubles executions;
- le modele produit une reponse structuree et des references verifiables; seules les references reellement presentes dans le contexte sont conservees;
- la Function reclame chaque demande par transaction afin de tolerer les executions Firestore au moins une fois;
- les journaux conservent seulement les metadonnees d'exploitation, jamais la question, le contexte ou la reponse;
- prochaine etape terrain: conserver le pilote `info@` dans le contexte Gabriel Mayer-Bedard et obtenir une acceptation explicite avant toute activation coach.

Le protocole complet se trouve dans `ASSISTANT_ADMIN_PILOT.md`.

## Regle de travail maintenant que l'equipe l'utilise

Priorite: stabiliser sans deranger.

- Ne pas changer brutalement la navigation ou le libelle d'une action utilisee tous les jours.
- Garder les gros diagnostics dans Admin/Guide, pas dans la vue coach normale.
- Faire des corrections par petites passes deployables.
- Verifier le live apres chaque correction importante.
- Ne pas supprimer les anciens outils tant que la parite terrain n'est pas prouvee.
- Ne jamais publier de secret GHL, token Apps Script ou donnee client privee dans `firebase-dashboard/public`.

## Sources de verite produit

- Firestore est la base operationnelle du dashboard.
- CoachRx nourrit le portefeuille coach et les signaux de programmation.
- CSM nourrit les memberships, check-ups et informations de suivi.
- GHL sert aux envois et contacts, mais le matching doit rester strict par telephone normalise.
- Rebooking historique reste la reference terrain tant que Firebase n'a pas prouve la parite.

## Etat terrain au 2026-07-08

Audit Firestore live recent:

- 149 clients actifs
- 9 clients actifs sans telephone
- 74 taches ouvertes
- 11 reponses questionnaire a lire
- 42 rebookings ouverts
- 230 rebookings sans clientId
- 246 rebookings sans telephone source

Acces:

- Marc-Andre: OK
- Iheb: OK
- Camille: OK
- David: OK
- Hugo: OK
- Raphael: OK
- info@ admin: OK
- Gabriel utilise le compte admin partage `info@crossfitstbasilelegrand.com`

## Priorite 1 - Audit production coach

Objectif: confirmer que les coachs peuvent travailler sans etre bloques.

A verifier en live avec au moins Marc-Andre et Iheb:

- creer un client manuel;
- creer une mission;
- fermer une mission;
- modifier une mission;
- ajouter ou lire une note vocale de mission;
- envoyer un questionnaire;
- lire une reponse questionnaire;
- creer une mission depuis une reponse questionnaire;
- ajouter une seance a rebooker;
- fermer un rebooking comme seance remise;
- archiver/deplacer un client vers Alumni;
- ramener un Alumni en client;
- agir dans le dossier d'un autre coach pilote.

Critere de passage: aucune erreur generique `Action non permise` sur une action coach normale.

## Priorite 2 - To-do quotidienne

Objectif: le coach comprend quoi faire en moins de 30 secondes.

Etat actuel:

- To-do regroupe certains items par client ou par programme.
- Les cartes sont plus courtes.
- Les details sont deplaces vers `Autres actions`, `Modifier` ou la fiche client.
- Les badges de source restent visibles mais plus discrets pour reduire le bruit dans les cartes.
- Les compteurs de la prochaine action sont maintenant des filtres cliquables.
- Les libelles d'actions secondaires sont plus clairs: `Autres actions`, `Voir ses actions`, `Voir programmes`.

Encore a surveiller:

- surcharge quand un coach a 15+ programmes en retard;
- doublons de missions par client;
- lisibilite des taches questionnaire;
- risque de rouge visuel trop frequent.

Prochaine passe recommandee:

- garder seulement client + action + echeance + bouton principal;
- transformer les groupes longs en une action de tri;
- eviter de montrer du texte d'origine source si l'action est deja claire.

## Priorite 3 - Clients

Objectif: la fiche client est le poste de controle, sans devenir un mur de donnees.

Etat actuel:

- recherche client utile;
- creation de client manuel;
- transfert coach;
- alumni / retour client;
- suppression avec confirmation;
- actions rapides vers mission, questionnaire, rebooking.
- fiche client phase 2: action principale visible, actions secondaires repliees, suivi actif resume en prochaines actions.
- fiche client phase 2b: libelles plus terrain, sortie Alumni/suppression mieux separees, infos avancees mieux nommees.
- liste clients: badges plus actionnables (`Fiche a valider`, `Ajouter telephone`, `Client manuel`).

Encore a surveiller:

- pop-up client encore dense;
- diagnostics sources trop visibles si le coach n'a pas besoin d'agir;
- membership doit prioriser CSM comme source de verite;
- CoachRx ne doit pas redevenir la source de membership.

Prochaine passe recommandee:

- simplifier la fiche en quatre blocs: priorite, actions rapides, resume client, historique replie;
- rendre les champs CSM plus evidents que les anciens champs CoachRx;
- garder source/matching dans details avances.

## Priorite 4 - Questionnaires

Objectif: transformer une reponse longue en briefing coach clair.

Etat actuel:

- types supportes: Globale check, Check-in, Evaluation habitudes de vie;
- envois GHL fonctionnels;
- planification par frequence;
- reponses recues et lisibles;
- details disponibles.
- vue Envoyer allegee: telephone et etat visibles, historique/plan replies.
- lecture reponse: action coach visible avant les details bruts.
- relances questionnaire: cartes plus courtes avec `X jours sans reponse` comme information principale.
- lecture reponse: boutons simplifies (`Creer mission`, `Marquer lu`, `Archiver sans client`) sans jargon interne.

Encore a surveiller:

- resume de reponse parfois trop peu digere;
- `Derniers envois` peut redevenir du bruit si trop visible;
- multiples reponses d'un meme client doivent etre faciles a comparer;
- lecture mobile des details longs.

Prochaine passe recommandee:

- afficher en premier: attention, raison, prochaine action;
- cacher le detail brut par defaut;
- regrouper les envois recents en historique replie;
- rendre `Planifications` plus proche d'une liste claire par client.

## Priorite 5 - Rebooking

Objectif: aider le coach a remettre les seances payees, pas lire un journal technique.

Etat actuel:

- rebookings regroupes;
- ajout manuel possible;
- fermeture: seance remise, suivi fait, absence coach;
- dates d'annulation importantes a garder visibles;
- actions secondaires repliees.
- cartes clarifiees: `Date(s) annulee(s)` visible et action principale `Marquer remise`.

Risque actuel:

- beaucoup de rebookings historiques sans telephone ou clientId;
- matching par nom encore fragile;
- l'ancien systeme reste la reference jusqu'a preuve de parite.

Prochaine passe recommandee:

- comparer Firebase vs ancien Apps Script pour 1 coach pilote;
- afficher toujours la ou les dates d'annulation utiles;
- garder la carte compacte: client, nombre de seances, dates, bouton principal;
- garder source, matching et historique dans details;
- permettre correction rapide du nombre de seances et suppression des erreurs.

## Priorite 6 - Pilotage

Objectif: devenir la zone de meeting hebdo coach.

Etat actuel:

- objectif coach visible;
- notes de rencontre;
- points a discuter;
- conversion en mission;
- lien vers document CSM.

Prochaine passe recommandee:

- stabiliser le modele: bright spot, scorecard, horaires, programmation, rebooking, nouveaux clients, clients perdus, rendement, IDS;
- rendre les metriques cliquables et utiles;
- eviter que Pilotage ressemble a Performance technique;
- garder les KPI transparents pour le coach.

## Priorite 7 - Admin

Objectif: cockpit d'equipe pour info@, pas page coach.

Etat actuel:

- visible pour admin;
- garde-fou: un coach non-admin ne peut pas rester sur l'onglet Admin par cache/session;
- montre priorites equipe, sources, coachs a valider;
- adoption analytics en place.

Prochaine passe recommandee:

- verifier que les coachs non-admin ne voient pas Admin;
- prioriser les problemes par impact reel;
- ajouter des raccourcis rapides vers le coach concerne;
- garder les diagnostics techniques replies.

## Priorite 8 - Onboarding equipe

Objectif: reduire le support technique manuel.

Etat actuel:

- Guide contient installation extension CoachRx;
- ZIP extension disponible;
- acces Google + courriel/mot de passe;
- page Formation continue existe;
- Accomplissements renvoie vers Drive partage.

Prochaine passe recommandee:

- confirmer que le ZIP affiche toujours la bonne version;
- ajouter une checklist premiere connexion coach;
- ajouter une section depannage extension: mauvais onglet, mauvais secret, session CoachRx non connectee;
- produire une mini presentation equipe.

## Commandes de validation

Avant deploy:

```powershell
cmd /c verify-dashboard-before-deploy.cmd
```

Apres deploy:

```powershell
cmd /c verify-dashboard-live-stable.cmd
cmd /c audit-live-coach-access.cmd
cmd /c audit-live-firestore.cmd
```

Si Firebase CLI doit etre reconnecte:

```powershell
.\firebase-login-dashboard.cmd
```

## Definition de version partageable equipe

Une version est partageable quand:

- chaque coach pilote peut se connecter;
- chaque coach peut faire les actions visibles sans erreur de permission;
- To-do, Clients, Questionnaires et Rebooking ont un parcours complet;
- les diagnostics techniques ne polluent pas la vue coach;
- le mobile permet les actions courantes;
- les anciens outils restent disponibles comme filet de securite;
- le Guide permet a un coach d'installer l'extension et de faire sa premiere sync.
