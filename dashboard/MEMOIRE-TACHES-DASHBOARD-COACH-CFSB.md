# Memoire - Dashboard Coach CFSB

Derniere mise a jour : 2026-05-22

## Etat actuel

- Le dashboard coach est maintenant servi par GitHub Pages, avec donnees privees recues du backend Apps Script via PIN.
- Un mode demo/sandbox local est ajoute pour tester les workflows sans toucher aux vraies donnees, GHL, CoachRx ou CSM.
- Le mode demo a maintenant des boutons contextuels par type de tache : Programme = Fait/Masquer, Rebooking = Envoyer rappel/Masquer, Questionnaire = Envoyer questionnaire/Masquer, Validation = Valider/Masquer.
- Les actions demo affichent un bouton Annuler dans la confirmation pour revenir en arriere apres un clic accidentel.
- Les clients demo peuvent etre modifies ou retires du dashboard depuis la fiche client.
- Modifier client est maintenant affiche directement dans la fiche client active, pas en haut de la liste.
- Retirer/classer un client demande maintenant une destination : Alumni a reactiver, Retire definitivement, Sur hold, ou Erreur/hors liste.
- Le risque coach doit rester une decision manuelle. Les indices calcules ou inventes en demo doivent etre affiches comme `Signal systeme`.
- Le bouton Systeme ne doit apparaitre qu'en haut a droite pres du choix du coach. Il ne doit pas doubler la navigation principale.
- Alumni est maintenant une section visible dans la navigation principale, separee de Performance.
- Les boutons d'action dans Mission doivent rester alignes et lisibles, meme pour `Envoyer questionnaire`.
- La section `Scenarios` sert de banc d'essai demo : elle permet de provoquer 9 cas importants sans toucher aux vraies donnees.
- Le backend Apps Script actif est le deployment `AKfycbz1qODx2pCWQ2yHhkse6FBxdyn741cYObW_qGsuox4RmVs7m6WYy3YqFTSti8YcRiGQ`.
- Les coachs peuvent choisir un coach dans le menu deroulant quand les donnees sont chargees.
- L'extension CoachRx permet de pousser les donnees CoachRx vers le backend.
- Les reponses questionnaire client-coach sont prevues dans une inbox privee et doivent matcher principalement par telephone normalise.
- Les donnees client ne doivent pas etre publiees dans des snapshots JSON publics sur GitHub Pages.

## Regles de donnees actives

- Fin membership :
  - utiliser une date de fin explicite si elle existe;
  - sinon, si le membership contient `fondation` ou `foundation`, calculer `Member Since + 12 semaines`;
  - sinon calculer `Member Since + 12 mois`;
  - sinon afficher `Non trouvee`.
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
   - Ouvrir `Scenarios` et lancer les 9 cas : Programme, Rebooking, Questionnaire du, Reponse rouge, Fin membership, Fin prevue coach, Hold, Alumni, Impact.
   - Entrer une date Kilo.
   - Marquer un risque.
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
   - Afficher fin membership calculee.
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
