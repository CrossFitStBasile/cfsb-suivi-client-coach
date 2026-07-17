Etat publication 2026-06-19; mise a jour 2026-07-07: live cible `20260707-coachrx-extraction-guard`; Hosting publie et valide apres deploy; prochaine limite: validation humaine des coachs pilotes et parite Rebooking legacy.

Journal mission vocale MVP: valider avant publication avec `verify-dashboard-before-deploy.cmd`, verifier le live avec `verify-dashboard-live.cmd`, puis confirmer l'equipe avec `valider-dashboard-equipe.cmd` et `audit-live-firestore.cmd`. Version cible `20260707-coachrx-extraction-guard`. Les sources `TASKS_Current` et le secret serveur GHL restent traites hors assets publics.

# Dashboard Coach CFSB - Journal week-end

Date: 2026-06-09

## Etat courant - 2026-06-09

- Validation locale: `verify-dashboard-before-deploy.cmd` passe 26/26 apres ajout du rapport `MIGRATION_READINESS.md`, du controle d'alignement sources et de l'audit MVP equipe.
- Audit produit historique: 49/49. Derniere passe locale apres clarification coach/admin, reduction du bruit visuel, telephone client, Alumni, transfert coach et rebooking compact: 78/78.
- Version live apres publication Hosting: `20260707-coachrx-extraction-guard`.
- Validation live actuelle: `verify-dashboard-live.cmd` passe strictement sur `20260707-coachrx-extraction-guard`.
- Audit Firestore live: `audit-live-firestore.cmd --summary` reussi apres publication MVP.
- Validation equipe technique: `valider-dashboard-equipe.cmd` passe.
- Dernier sync global observe: `oOej80NxHYB0YTRrhEU9`, source `firebase_function_sync_sheets_scheduled`, a `2026-06-09T03:53:06.684Z`.
- La sync planifiee inclut les sept coachs pilotes et retourne encore 25 avertissements.
- Le blocage principal restant n'est plus le deploy Hosting; c'est la validation humaine des coachs pilotes et la parite Rebooking legacy. Le secret `DASHBOARD_IMPORT_TOKEN` reste requis pour certains ponts d'import directs.
- Les contrats de payload source -> Firebase sont maintenant documentes et verifies avant publication.
- Le kit d'activation source par source `SOURCE_ACTIVATION_KIT.md` est maintenant documente et verifie avant publication.
- Le statut d'activation source par source `SOURCE_ACTIVATION_STATUS.json` est maintenant documente et verifie avant publication.
- Le secret serveur GHL reste cote Cloud Function; il ne doit pas apparaitre dans les assets publics.
- L'auto-activation des coachs pilotes est publiee et doit etre reverifiee en live: chaque coach officiel peut creer son profil Firestore verrouille a son courriel/CoachRx ID; `info@crossfitstbasilelegrand.com` demeure l'acces admin/coproprio.

Resume donnees live actuel:

- Marc-Andre: 12 clients actifs, 1 sans telephone, 2 To-do ouvertes, 9 reponses questionnaire, 2 rebookings ouverts.
- Iheb: 24 clients actifs, 5 sans telephone, 9 To-do ouvertes, 10 reponses questionnaire, 17 rebookings ouverts.
- Camille: 3 clients actifs, 0 sans telephone, 0 To-do ouverte.
- David: 8 clients actifs, 2 sans telephone, 2 To-do ouvertes.
- Gabriel: 3 clients actifs, 0 sans telephone, 1 To-do ouverte, 5 reponses questionnaire.
- Hugo: 14 clients actifs, 5 sans telephone, 1 rebooking ouvert.
- Raphael: 25 clients actifs, 4 sans telephone, 3 rebookings ouverts.

## Historique precedent - 2026-06-08

## Historique precedent - 2026-06-05

Ce journal resume le travail autonome possible pendant l'absence de Michael. Il se concentre sur ce qui peut avancer sans nouvelle connexion interactive Firebase, Google ou GHL.

## Etat verifie

- Validation locale: `verify-dashboard-before-deploy.cmd` passe 18/18.
- Audit produit: 46/46.
- Version live verifiee: `20260605-coach-picker`.
- Version locale prete: `20260605-questionnaire-send-audit`.
- Ecart principal: la version locale n'est pas encore publiee sur Firebase Hosting.
- Blocage deploy connu: session Firebase CLI expiree ou token absent.

## Ce qui est stabilise localement

- Le selecteur coach est un bouton/liste cliquable, pas un selecteur qui oblige a maintenir le clic.
- La sidebar est protegee contre le chevauchement du menu et de la zone Coach.
- La To-do ne doit plus afficher les anciens imports stale, archives, completes ou ignores.
- CoachRx Browser reste une source client/contexte et ne cree plus de To-do programme automatiquement.
- Les To-do importees viennent de `TASKS_Current` ou d'une source explicite, avec action et source visibles.
- Si `TASKS_Current` importe beaucoup de programmes, l'admin voit maintenant des exemples concrets pour corriger la source.
- Les tentatives d'envoi questionnaire sont journalisees avant l'appel GHL.
- Les erreurs d'envoi questionnaire affichent une action suivante: corriger telephone, verifier contact GHL, configurer secret serveur GHL, verifier workflow `dashboardcoach`, etc.
- L'envoi GHL exige un match exact par telephone normalise.
- Les reponses questionnaire affichent une priorite coach, une raison et une action recommandee.
- Les rebookings exposent un diagnostic de source et de matching sans publier les liens Apps Script avec token.
- Le pipeline verifie que les liens Apps Script rebooking avec token ne se retrouvent pas dans les assets publics ni dans les docs de reprise.
- Les docs principales indiquent maintenant l'ecart live/local et la procedure de reprise.

## Ce qui bloque sans intervention humaine

1. Publier la version locale sur Firebase.

   Commandes:

   ```cmd
   cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
   firebase-login-dashboard.cmd
   deploy-dashboard-complet.cmd
   ```

   Variante non interactive:

   ```cmd
   cd "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
   firebase-login-ci-token.cmd
   set FIREBASE_TOKEN=COLLER_LE_TOKEN_ICI
   deploy-dashboard-complet.cmd
   ```

2. Confirmer l'etat live Firestore avec les donnees reelles.

   Commande:

   ```cmd
   audit-live-firestore.cmd
   ```

   Si l'audit repond `401`, `UNAUTHENTICATED` ou `ACCESS_TOKEN_TYPE_UNSUPPORTED`, il faut refaire la reconnexion Firebase.

3. Tester un vrai envoi questionnaire GHL.

   Preconditions:

   - client avec telephone normalise;
   - contact GHL avec exactement le meme telephone;
   - secret serveur GHL configure;
   - Cloud Function `sendQuestionnaire` publiee;
   - workflow GHL `dashboardcoach` actif.

## Lecture produit actuelle

La priorite immediate n'est pas Rebooking ou Alumni. La priorite est de fiabiliser le noyau:

1. Clients importes et deduplices correctement.
2. To-do qui ne montre que les vraies actions.
3. Questionnaires utilisables: envoi, journal, reponses, matching telephone.
4. Guide qui explique les sources et les prochaines actions.

Rebooking reste utile, mais il depend de sources souvent sans telephone. Tant que la source rebooking n'a pas de telephone, le matching par nom doit rester presente comme fragile et les non matches doivent rester visibles.

## Validation a refaire apres deploy

```cmd
verify-dashboard-live.cmd
audit-live-firestore.cmd
```

Puis dans l'app:

1. Ouvrir `Guide`.
2. Confirmer la version affichee dans la sidebar.
3. Lancer `Synchroniser tous les coachs`.
4. Verifier Marc-Andre, Iheb, Camille, Gabriel et Hugo.
5. Pour Iheb, verifier que les To-do ouvertes viennent bien de `TASKS_Current`.
6. Dans Questionnaires, verifier:
   - `Reponses a lire`;
   - `Envoyer`;
   - `A relancer`;
   - `A valider`;
   - `Archives`;
   - journal d'envoi et erreurs GHL.

## Attention

- Ne pas mettre de token GHL, Firebase ou Apps Script dans `firebase-dashboard/public`.
- Ne pas inventer de donnees client pour remplir l'app.
- Ne pas corriger les donnees source par code si la vraie source contient une erreur; afficher plutot un diagnostic et la prochaine action.


