# Questionnaire Studio — preuves de validation locale

Date : 2026-07-28
Branche : `reconcile/dashboard-production-questionnaires-20260728`
Portée : validation locale seulement; aucune production, donnée réelle, communication coach ou modification GHL.

## Porte automatisée

Commande :

```powershell
& 'C:\Users\micha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools/verify-questionnaire-reconciled-candidate.mjs
```

Résultat final : `PASS — 17 étapes locales réussies; le candidat n'a pas été déployé.`

Preuves incluses :

- syntaxe des sept fichiers JavaScript critiques;
- 20 tests Hosting, continuité, bibliothèque et formulaire public;
- 101 tests Functions, identité, routage, Studio, sécurité et régression;
- provenance Hosting : 8/8;
- formulaires Firebase historiques : 11/11;
- logique de relance et correspondance par formulaire : 13/13;
- lecture coach : 9/9;
- préparation Google/Firebase seulement : 11/11;
- annonces : 17/17;
- intégrité responsive Dashboard : 7/7;
- smoke test Hosting local : 7/7.

La porte est exécutée par le pipeline standard et par les hooks `predeploy` de
Hosting, Functions et Firestore. Les scripts Stage A/Stage B exigent aussi un
commit scellé, un worktree propre, un dry-run et les preuves de canari.

La porte standard complète `verify-dashboard-before-deploy.cmd` passe également
jusqu'à `Validation locale reussie`, après installation exacte de
`functions/package-lock.json` avec Node/npm 22.

Le lockfile a reçu les correctifs non cassants de `body-parser` 1.20.6 et
`websocket-driver` 0.7.5. `npm audit --omit=dev` ne rapporte ensuite aucun niveau
high ou critical; neuf avis modérés transitifs demeurent, et la correction
proposée par npm exigerait un changement cassant de la pile Firebase.

## Continuité des coachs

Les tests confirment :

- les trois parcours historiques sont fonctionnellement identiques au pipeline durable Apps Script v23;
- les trois anciennes URL ne sont ni redirigées ni capturées par la nouvelle route;
- les huit anciens téléchargements CoachRx pointent toujours vers le fichier 0.7.0 exact;
- si le catalogue Studio est absent ou refusé, la bibliothèque garde les trois liens historiques;
- un formulaire publié supplémentaire apparaît sans changement de code;
- un formulaire archivé disparaît de la bibliothèque;
- une réponse d'un formulaire différent ne ferme pas une relance existante.

## Accusé durable et identité

Un écran de succès public exige simultanément :

- `ok === true`;
- `response.stored === true`;
- la même `idempotencyKey`;
- un `responseId` non vide;
- `duplicate` booléen;
- `receivedAt` non vide.

Les tests backend confirment :

- une reprise identique est idempotente;
- la même clé avec un contenu différent est refusée;
- un match unique, membre, sélectionnable, confirmé et possédé peut être lié;
- `clientId` conserve l'identifiant du document;
- `internalClientId` conserve l'identité durable, avec l'identifiant du document comme repli legacy;
- absence, doublon, conflit, fiche non sélectionnable, propriété non confirmée ou propriétaire absent restent en validation;
- aucun de ces cas ne crée ni n'attribue un client.

## Validation interactive mobile

Un serveur local sans écriture externe a servi les quatre définitions et simulé les accusés de l'API.

Résultats :

- Dashboard à 390 × 844 : écran de connexion chargé, aucune erreur ou alerte console;
- quatre formulaires à 360 px : titre rendu, actions visibles et aucun débordement horizontal;
- Check-in à 390 px : trois questions oui/non, commentaire révélé après un « non »;
- accusé incomplet : message d'erreur visible, aucun écran de succès;
- accusé complet : confirmation visible et une seule soumission locale reçue;
- URL contenant `?contact=...&phone=...#client` : immédiatement remplacée par `/questionnaire/f/check-in-express`, sans query ni fragment.

Le serveur local a ensuite été arrêté.

## Continuité HTTP de la production actuelle

Le contrôle GET seulement
`tools/verify-questionnaire-live-continuity.mjs` passe `14/14` :

- cinq assets historiques répondent HTTP 200 avec leurs SHA-256 exacts;
- le ZIP CoachRx 0.7.0 répond HTTP 200 avec son SHA-256 exact;
- les huit anciennes URL CoachRx répondent HTTP 302 vers l'unique ZIP 0.7.0.

Ce contrôle n'écrit aucune donnée et n'a effectué aucun déploiement.

## Contenu verrouillé

La comparaison avec le prototype PDF de neuf pages et les formulaires actuels est protégée par des tests :

- Bilan 90 jours : questions du bilan et rappel InBody informatif, sans rendez-vous ni automatisation;
- Check-in express : exactement trois oui/non, 20–30 secondes, cadences 14 ou 28 jours, commentaire conditionnel;
- Évaluation habitudes de vie : cinq sections et les 19 champs du formulaire live conservés;
- Repères CFSB : niveaux optimal, bon, acceptable et problématique; formulation non diagnostique; sources permises limitées à Santé Canada, Guide alimentaire canadien et OMS.

Une approbation éditoriale humaine demeure recommandée avant une adoption large, particulièrement pour les seuils éducatifs. Elle ne remplace pas les validations techniques.

## Limite connue de la préparation locale

Le poste possède Firebase CLI 15.19.1 et le JAR de l'émulateur Firestore, mais aucun runtime Java. Les règles n'ont donc pas été démarrées dans l'émulateur local. Leur structure et leurs contrats sont couverts par les tests automatisés, mais la première étape d'un futur GO production doit inclure une compilation/validation Firebase des règles avant toute écriture ou publication.
