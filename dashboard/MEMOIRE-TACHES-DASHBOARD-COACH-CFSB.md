# Memoire - Dashboard Coach CFSB

Derniere mise a jour : 2026-05-21

## Priorites immediates

1. Stabiliser le backend Apps Script deploye
   - S'assurer que chaque nouvelle action frontend existe dans le deployment actif.
   - Eviter les erreurs du type `Action API inconnue`.
   - Garder le diagnostic backend clair pour le coach/admin.

2. Rendre la fiche client vraiment utile
   - Afficher le membership actuel.
   - Afficher la date de fin du membership quand elle est disponible dans CSM/Kilo.
   - Afficher la date des dernieres seances deja planifiees dans Kilo.
   - Permettre au coach d'entrer/modifier cette date directement dans la fiche client.
   - Generer une tache de rebooking 30 jours avant cette date.

3. Clarifier les questionnaires
   - Afficher la date du dernier questionnaire dans Clients et Client focus.
   - Ajouter une vue "A envoyer 3 mois+".
   - Ajouter une vue "En attente".
   - Toujours permettre d'envoyer un questionnaire quand un client est identifiable.
   - Expliquer que "Marquer traite" signifie que le coach a lu la reponse et fait le suivi necessaire.

4. Risque client
   - Le risque doit etre marque manuellement par le coach.
   - Niveaux actuels : Aucun, Faible, Moyen, Eleve.
   - Ne pas deduire automatiquement le risque seulement parce qu'un questionnaire est vieux.

5. Alumni et reactivation
   - Rendre l'ajout d'un alumni plus evident.
   - Permettre un prochain contact.
   - Generer une tache quand la date de recontact arrive.

## Points a ameliorer avant utilisation terrain

- Interface encore trop technique pour certains coachs.
- Le bouton Systeme doit rester reserve aux actions moins frequentes.
- Les actions principales doivent etre explicites : envoyer, traiter, rebooker, masquer.
- Il faut tester avec Marc-Andre et Iheb sur de vrais cas, mais avec prudence pour ne pas envoyer de SMS par erreur.
- Il faut ensuite definir le niveau d'authentification final avant de deployer a tous les coachs.

