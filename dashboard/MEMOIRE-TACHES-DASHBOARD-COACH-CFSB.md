# Memoire - Dashboard Coach CFSB

Derniere mise a jour : 2026-05-26

## Etat actuel

- Le dashboard coach est maintenant servi par GitHub Pages, avec donnees privees recues du backend Apps Script via PIN.
- Un mode demo/sandbox local est ajoute pour tester les workflows sans toucher aux vraies donnees, GHL, CoachRx ou CSM.
- Le mode demo a maintenant une sortie explicite `Quitter demo / mode reel`, qui efface le coach test local et recharge le backend prive.
- Le chargement du dashboard utilise maintenant JSONP en premier pour eviter de doubler les appels Apps Script par un fetch CORS, et affiche un message d'attente avec timeout clair.
- Un watchdog independant du reseau sort maintenant l'interface du chargement apres 30 secondes, meme si la requete Apps Script reste pendue.
- Le JS ne plante plus si `live.html` manque un bouton systeme; les evenements de boutons sont maintenant attaches de facon defensive.
- Le mode demo a maintenant des boutons contextuels par type de tache : Programme = Fait/Masquer, Rebooking = Envoyer rappel/Masquer, Questionnaire = Envoyer questionnaire/Masquer, Validation = Valider/Masquer.
- Les actions demo affichent un bouton Annuler dans la confirmation pour revenir en arriere apres un clic accidentel.
- Les clients demo peuvent etre modifies ou retires du dashboard depuis la fiche client.
- Modifier client est maintenant affiche directement dans la fiche client active, pas en haut de la liste.
- Retirer/classer un client demande maintenant une destination : Alumni a reactiver, Retire definitivement, Sur hold, ou Erreur/hors liste.
- Le risque coach doit rester une decision manuelle. Les indices calcules ou inventes en demo doivent etre affiches comme `Signal systeme`.
- Le bouton Systeme ne doit apparaitre qu'en haut a droite pres du choix du coach. Il ne doit pas doubler la navigation principale.
- Alumni est maintenant une section visible dans la navigation principale, separee de Performance.
- Les boutons d'action dans Mission doivent rester alignes et lisibles, meme pour `Envoyer questionnaire`.
- La section `Guide & modules` sert de hub stable : elle explique les modules externes, leur statut et les liens utiles, tout en gardant les scenarios demo.
- Le mode demo affiche maintenant un journal des dernieres actions pour confirmer ce qui vient d'etre fait meme apres la disparition du toast.
- Performance clarifie maintenant les impacts : definition, ajout, statut, confirmation, annulation et suppression en mode demo.
- Alumni permet maintenant de creer une mission, marquer reactive, classer a ne pas recontacter ou supprimer en mode demo.
- Mission contient une capture rapide coach pour transformer une note/transcription en missions.
- Les risques sont separes entre `Risque coach`, `Signal questionnaire` et `Signal systeme`.
- Performance ne doit contenir que les risques/retention et les impacts/revenus. Les alumni vivent dans Alumni et les holds vivent dans Clients.
- Les alumni exclus peuvent maintenant etre remis dans `Alumni a travailler` si le coach a clique par erreur.
- Les holds peuvent maintenant etre ajoutes ou retires directement depuis la fiche client.
- La capture rapide met la date du jour par defaut.
- Decision produit : tant qu'un projet connexe change souvent, il reste un module lie par bouton/lien au lieu d'etre integre trop profondement dans le dashboard.
- Les modules actuellement lies sont : Questionnaire client, Rebooking semi-prive, Rendement hebdo, CoachRx, CSM / memberships et Kilo.
- Le backend Apps Script actif est le deployment `AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ`.
- Les coachs peuvent choisir un coach dans le menu deroulant quand les donnees sont chargees.
- L'extension CoachRx permet de pousser les donnees CoachRx vers le backend.
- Les reponses questionnaire client-coach sont prevues dans une inbox privee et doivent matcher principalement par telephone normalise.
- Integration questionnaire V2 : le backend doit lire `Test_Responses` pour les tests equipe et `Responses` pour les vraies reponses dans le Sheet `Reponses - Suivi client-coach Web App`.
- Les donnees client ne doivent pas etre publiees dans des snapshots JSON publics sur GitHub Pages.
- Clarification 2026-05-26 : la fin de membership ne doit pas etre calculee automatiquement. Elle doit etre entree ou corrigee manuellement, comme la recurrence prevue dans Kilo.
- Les IDs CoachRx pilotes connus sont maintenant documentes dans le module CoachRx : Marc-Andre 15935, Camille 17242, David 15902, Gabriel 15893, Hugo 15937, Raphael 15936, Iheb 15928.
- Les check-ups de performance doivent provenir du CSM, onglet cache `Formulaire Checkup`, colonnes `Nom`, `Date`, `Telephone`, `Note`, `coach`.
- Les liens rebooking coachs connus sont maintenant servis par le backend prive apres PIN, pas par le JavaScript public GitHub Pages : Marc-Andre, Raphael, Hugo, Iheb, Camille et David.
- Correctif UX 2026-05-25 :
  - `Fait` et `Masquer` en mode reel agissent maintenant immediatement dans l'interface, puis synchronisent le backend en arriere-plan.
  - Les compteurs visibles tiennent compte des taches masquees localement, pour que le coach sente que son action a ete prise en compte.
  - Le bouton de rappel rebooking n'est plus presente comme actif en mode reel; il affiche `Rappel a brancher` tant que le workflow GHL correspondant n'est pas confirme.
  - Les petits clics backend retournent maintenant un accuse de reception leger au lieu de reconstruire tout le dashboard.
  - L'envoi questionnaire est mis en pause dans le dashboard reel; il reste disponible seulement en simulation demo.
  - La capture rapide n'affiche plus de champ date : la date du jour est appliquee automatiquement.
  - Les ajouts/modifications de clients et captures rapides sont maintenant optimistes dans l'interface, puis synchronisent Apps Script en arriere-plan.
- Mise a jour integration 2026-05-26 soir :
  - Frontend GitHub Pages `app-52604` publie sur `main` et `gh-pages`.
  - Backend Apps Script redeploye en version 59 sur le meme endpoint officiel.
  - L'extension CoachRx Sync est simplifiee en version 0.6.0 : choix du coach, bouton unique `Mettre a jour CoachRx`, ouverture directe de la page CoachRx du coach, configuration repliee.
  - La liste des coachs pilotes est seedee cote backend pour Marc-Andre, Camille, David, Gabriel, Hugo, Iheb et Raphael.
  - Le bouton questionnaire est reactive cote dashboard pour ajouter le tag GHL `dashboardcoach` via le backend prive.
  - Le rebooking est maintenant actionnable dans le dashboard : `Marquer gere` / `Reouvrir`, avec synchronisation locale et tentative de mise a jour de la source semi-prive.

## Regles de donnees actives

- Fin membership :
  - ne pas deduire automatiquement la fin a partir du debut d'abonnement;
  - utiliser seulement une date entree explicitement ou corrigee manuellement;
  - sinon afficher `A entrer`.
- Fin des seances Kilo :
  - le coach peut entrer manuellement la derniere date deja planifiee;
  - une tache de rebooking doit apparaitre 30 jours avant cette date.
- Risque client :
  - le risque est une decision coach manuelle;
  - niveaux : Aucun, Faible, Moyen, Eleve;
  - ne pas deduire automatiquement le risque seulement parce qu'un questionnaire est vieux.
- Questionnaire :
  - `Marquer traite` signifie que le coach a lu la reponse et fait le suivi necessaire;
  - quand un client est identifiable, l'action `Envoyer questionnaire` doit rester disponible.
  - matching prioritaire par `client_phone_normalized`;
  - `vert` doit nourrir l'historique client sans creer de tache urgente;
  - `jaune` cree une tache d'ajustement leger;
  - `orange` cree une tache de discussion structuree;
  - `rouge` cree une tache prioritaire de contact rapide;
  - les reponses sans client ou coach reconnu doivent apparaitre dans une file a valider.
- Modules externes :
  - un module `Actif` peut etre utilise tel quel;
  - un module `En test` ou `Module lie` reste accessible par bouton, mais ne doit pas etre presente comme une integration complete;
  - chaque module devra avoir un contrat de donnees stable avant d'alimenter automatiquement Mission ou Performance.
- Envoi questionnaire :
  - l'envoi reel utilise le tag GHL `dashboardcoach`;
  - il doit etre teste avec un client interne avant de le laisser aux coachs;
  - en mode reel, les boutons affichent `Questionnaire en pause` et ne doivent envoyer aucun SMS;
  - quand le module sera reactive, le bouton devra demander une confirmation avant tout envoi reel;
  - il devra bloquer l'envoi si le client n'a pas de telephone;
  - l'onglet Questionnaires contient une vue `Clients` pour envoyer le questionnaire a n'importe quel client du dashboard;
  - l'envoi live passera par le backend `sendQuestionnaire`, qui devra ajouter le tag GHL `programme` au contact trouve par telephone.
  - en mode demo, le bouton affiche `Simuler questionnaire` et n'envoie jamais de SMS.

## Priorites immediates avant meeting / test equipe

0. Utiliser le mode demo pour valider le produit
   - Ouvrir `Coach Test CFSB`.
   - Tester les 10 clients fictifs.
   - Cliquer `Fait`, `Masquer`, `Envoyer rappel`, `Envoyer questionnaire`, `Marquer traite`.
   - Tester `Annuler` apres un clic accidentel.
   - Ajouter un client fictif.
   - Modifier un client fictif.
   - Retirer/classer un client fictif du dashboard vers Alumni, Hold, Retire ou Erreur.
   - Ouvrir la section Alumni et creer une mission depuis un alumni.
   - Ouvrir `Guide & modules` et valider que les liens externes sont clairs.
   - Dans `Guide & modules`, lancer les 9 cas demo : Programme, Rebooking, Questionnaire du, Reponse rouge, Fin membership, Fin prevue coach, Hold, Alumni, Impact.
   - Entrer une date Kilo.
   - Marquer un risque.
   - Declarer un impact, le confirmer, l'annuler et le supprimer.
   - Ajouter un alumni, creer une mission, puis le supprimer ou le classer.
   - Remettre un alumni exclu dans la liste a travailler.
   - Mettre un client sur hold depuis Clients, puis retirer le hold.
   - Utiliser la capture rapide pour creer des missions depuis une note de fin de journee.
   - Utiliser `Reset demo` pour revenir au scenario initial.

1. Stabiliser l'interface visible
   - Fermer clairement les panneaux temporaires avec un bouton X.
   - Fermer Configuration et Nouveau rappel quand le panneau Systeme est ferme.
   - Reduire les endroits ou les coachs peuvent rester bloques dans une section technique.

2. Tester l'acces a distance
   - Tester avec Gabriel sur son ordinateur.
   - Tester avec Marc-Andre et Iheb.
   - Verifier que le PIN fonctionne sans devoir ouvrir Apps Script.
   - Verifier que les extensions Chrome ou restrictions navigateur ne bloquent pas `script.google.com`.

3. Tester les actions sans envoyer a de vrais clients par erreur
   - Ajouter Michael comme client manuel.
   - Envoyer un questionnaire seulement a un contact test.
   - Confirmer que la fenetre de validation affiche le bon nom et le bon telephone/courriel avant de cliquer OK.
   - Valider que la reponse arrive dans l'inbox questionnaire.
   - Valider que `Marquer traite` retire la reponse des vues actives.
   - Valider que la date Kilo cree une tache de rebooking au bon moment.

## Deploiement multi-coachs

1. Creer/valider les coachs dans `CFG_Coachs`
   - Nom exact du coach.
   - CoachRx ID.
   - Onglet dashboard si encore necessaire.
   - Statut actif.

2. Pour chaque coach pilote
   - Ouvrir la page CoachRx de son equipe/clientele.
   - Choisir le coach dans l'extension.
   - Synchroniser CoachRx.
   - Verifier que les clients apparaissent dans l'app.
   - Verifier les clients non matches / a valider.

3. Procedure coach a finaliser
   - Comment installer l'extension.
   - Comment entrer le Web App URL et le secret.
   - Comment choisir son coach.
   - Comment cliquer `Synchroniser CoachRx`.
   - Comment utiliser `Mettre a jour` dans l'app.
   - Quoi tester et quoi ne pas tester avec de vrais clients.

## Fonctionnalites a finaliser

1. Fiche client
   - Afficher membership actuel.
   - Afficher debut membership.
   - Afficher fin membership manuelle.
   - Afficher derniere date Kilo planifiee.
   - Afficher dernier questionnaire.
   - Afficher risque coach manuel.
   - Afficher signal systeme separement du risque coach.
   - Afficher objectifs/notes coach.
   - Ajouter historique client plus complet quand disponible.

2. Mission du jour
   - Clarifier les types d'actions : Programme, Rebooking, Questionnaire, Validation, Retention, Impact.
   - S'assurer que les filtres affichent seulement les bonnes taches.
   - Continuer a personnaliser les boutons selon le type de tache, pas avec un trio generique.
   - Prevoir une fonction de reset des tests avant de passer en production.

3. Questionnaires
   - Vue toutes les reponses.
   - Vue non matchees.
   - Vue urgentes rouge/orange.
   - Vue non lues / non traitees.
   - Vue clients sans questionnaire depuis 3 mois.
   - Vue questionnaires envoyes mais non completes.
   - Relance ou tache automatique si pas de reponse apres X jours.

4. Alumni / reactivation
   - Ajouter/classer un alumni plus simplement.
   - Creer une tache de recontact depuis la liste alumni.
   - Archiver les suivis completes.
   - Associer les reactivations aux impacts quand il y a nouveau revenu.

5. Holds
   - Permettre a Caroline/admin d'ajouter un client sur hold.
   - Ajouter date de retour prevue.
   - Ajouter raison du hold.
   - Creer rappel avant la fin du hold.
   - Retirer ou diminuer les taches non pertinentes pendant le hold.

6. Impacts / performance
   - Permettre au coach de declarer un impact.
   - Lier l'impact a un client ou a une reference.
   - Suivre impacts semaine.
   - Suivre revenus approx.
   - Lier au document de rendement interne.

7. Securite / acces
   - Le PIN est acceptable pour le pilote, mais pas ideal pour le deploiement complet.
   - Il faudra une authentification coach plus solide.
   - Prevoir un acces admin pour remplacer un coach malade ou en vacances.
   - Ne jamais publier de donnees client reelles dans GitHub Pages.

## Risques connus

- `Member Since` doit etre valide comme date de debut du membership actuel; si c'est seulement une date historique, la fin calculee sera fausse.
- Les donnees CoachRx disponibles par export officiel restent limitees; l'extension compense une partie du probleme.
- Les actions GHL doivent etre testees avec contacts test avant utilisation terrain.
- Les coachs peuvent confondre `Systeme` avec les vues quotidiennes; garder les outils techniques regroupes et discrets.

## Definition d'une version utilisable

- Un coach peut se connecter avec le PIN.
- Il voit seulement ses clients.
- Il voit ses actions prioritaires du jour.
- Il peut envoyer un questionnaire.
- Il peut traiter une reponse.
- Il peut marquer un client a risque.
- Il peut entrer une date Kilo.
- Il peut ajouter un client manuel/test.
- Il peut mettre a jour CoachRx avec une procedure simple.
- Un admin peut comprendre quoi faire avec les clients a valider.

## Notes techniques recentes

- 2026-05-25, version 52216: le menu des coachs ne depend plus seulement de `data.coaches`.
  L'app deduit aussi les coachs depuis le coach actif, les clients, les taches, les questionnaires,
  les holds, les alumni, les impacts et une liste pilote de coachs connus. Si aucun coach reel
  n'apparait apres cette version, le backend ne renvoie pas encore assez de donnees pour construire
  l'annuaire cote frontend et il faudra corriger Apps Script.
- 2026-05-25, version 52217: l'app utilise maintenant `fetch` en premier pour parler au backend
  Apps Script, puis JSONP seulement en secours. Le backend renvoie maintenant CORS `*`, donc `fetch`
  donne une erreur plus juste, comme PIN invalide, au lieu d'un faux blocage navigateur.
- 2026-05-25, version 52218: les delais frontend passent a 90-100 secondes pour eviter de couper
  Apps Script pendant une reconstruction lente. Les diagnostics separent maintenant le test `api=status`
  et le diagnostic complet avec PIN.
- 2026-05-26, version 52229 / backend v53: le guide ne pointe plus vers le Google Sheet rebooking;
  il ouvre l'app rebooking privee retournee par le backend selon le coach. Les coachs visibles sont
  limites aux CoachRx IDs pilotes confirmes: Marc-Andre, Camille, David, Gabriel, Hugo, Raphael.
  Les reponses questionnaire restent dans l'inbox Questionnaire et ne creent plus de fausses To-do.
- 2026-05-26, version 52230 / backend v54: Iheb Yahyaoui (CoachRx 15928) est reintegre dans
  les listes coachs du dashboard, dans les liens CoachRx, dans le filtre backend et dans la liste
  du questionnaire public. Correction faite apres validation que Iheb a bien un ID CoachRx.
  La seule To-do formulaire prevue est une relance apres questionnaire envoye sans reponse.
