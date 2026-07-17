# Migration Google-only - Dashboard Coach CFSB

Date de reference: 2026-07-15

## Contexte

Le Dashboard Coach doit fonctionner sans dependance permanente a GitHub. Le code, les deploiements, les donnees operationnelles et la documentation doivent etre gouvernes par l'organisation Google de CFSB.

Cette migration ne doit pas interrompre le travail quotidien des coachs. GitHub reste temporairement une copie de retour arriere jusqu'a ce que le nouveau depot Google et le pipeline de deploiement soient valides.

## Architecture cible retenue

- Google Workspace Drive: documentation, procedures, guides et materiel de formation.
- Google Cloud Storage prive a Montreal: instantanes sources controles, manifestes SHA-256 et historique par versions d'objets.
- Cloud Build: validation et deploiement controles depuis les instantanes sources prives.
- Firebase Hosting: dashboard et formulaires publics.
- Firestore: donnees operationnelles du dashboard.
- Firebase Functions: traitements serveur et integrations.
- Firebase Authentication: acces des coachs et administrateurs.
- Cloud Storage: fichiers applicatifs autorises.
- Secret Manager: secrets techniques. Aucun secret dans le depot, Hosting ou Drive partage.
- Cloud Logging et Audit Logs: traces d'administration et d'execution.

## Decisions prises

1. Secure Source Manager a ete ecarte pour cette phase: son tarif actuel est de 1 000 USD par mois par instance, disproportionne pour CFSB.
2. La cible source Google de la phase courante est le bucket prive et versionne `cfsb-dashboard-source-129233025317` dans `northamerica-northeast1` (Montreal).
3. Les instantanes sources sont verifies avant televersement et Cloud Build doit pouvoir les valider sans GitHub.
4. Le projet Firebase est un enfant confirme de l'organisation Google Cloud liee au Workspace `crossfitstbasilelegrand.com`.
5. Les formulaires publics sont servis par Firebase Hosting sous `/questionnaire/`.
6. Les reponses continuent d'etre transmises au traitement Apps Script Google actuel pendant la premiere bascule.
7. GitHub ne sera retire qu'apres validation de deux instantanes Google, d'un deploiement Google de production et d'un retour arriere Firebase repete.
8. Les donnees client, jetons, secrets GHL et secrets Apps Script ne doivent jamais entrer dans les instantanes sources ou dans Firebase Hosting.

## Liens GHL des questionnaires Firebase

Les workflows GHL utilisent des URL fixes sans champs de fusion `{{contact...}}`. Le client saisit son nom, son telephone et son coach directement dans le formulaire; cela evite les liens invalides ou tronques dans GHL.

- `dashboardcoach` - Globale check: `https://cfsb-dashboard-coach-aa9a4.web.app/questionnaire/`
- `suiviregulier` - Check-in: `https://cfsb-dashboard-coach-aa9a4.web.app/questionnaire/check-in/`
- `evaluationnutrition` - Evaluation habitudes de vie: `https://cfsb-dashboard-coach-aa9a4.web.app/questionnaire/evaluation-habitudes-vie/`

Procedure GHL:

1. Remplacer uniquement l'URL dans les etapes SMS et courriel du workflow concerne.
2. Ne pas ajouter `client_name`, `client_email`, `phone` ou d'autres variables de contact a l'URL.
3. Publier le workflow.
4. Tester avec un contact interne, puis confirmer que la reponse apparait dans le bon dossier coach du dashboard.

## Etat actuel audite

- Projet Firebase configure localement: `cfsb-dashboard-coach-aa9a4`.
- Hosting principal: `firebase-dashboard/public`.
- Depot Git actuel: `CrossFitStBasile/cfsb-suivi-client-coach` sur GitHub.
- Le repertoire de travail contient de nombreuses modifications et de nombreux fichiers non suivis. Ils ne doivent pas etre ecrases ni pousses sans inventaire et controle de secrets.
- La session Firebase CLI locale est authentifiee avec `info@crossfitstbasilelegrand.com`.
- Le projet appartient a l'organisation Google Cloud `crossfitstbasilelegrand.com`.
- Cloud Build et Cloud Storage sont actifs; la facturation Google Cloud est liee.
- Le bucket prive `cfsb-dashboard-source-129233025317` a ete cree a Montreal avec versionnement, acces uniforme et prevention d'acces public forcee.
- La dependance active au formulaire GitHub Pages a ete remplacee et deployee sur Firebase Hosting.
- Le questionnaire Firebase est disponible sous `/questionnaire/` et sa configuration publique sous `/questionnaire/coaches.json`; les deux routes repondent en production.
- La suite Firebase comprend aussi `/questionnaire/check-in/` et `/questionnaire/evaluation-habitudes-vie/`; leurs reponses conservent le payload complet dans le contrat Apps Script existant.
- Trois instantanes complets et verifies ont ete televerses dans le coffre prive avec leurs manifestes SHA-256.
- Cloud Build a valide les instantanes directement depuis Google Cloud Storage, sans lire GitHub.
- Le compte de service de deploiement dedie est `dashboard-deployer@cfsb-dashboard-coach-aa9a4.iam.gserviceaccount.com`; aucune cle privee n'a ete exportee.
- Ce compte a publie avec succes un canal de previsualisation, puis le Hosting de production.
- Un instantane a ete restaure dans un repertoire propre: 146 fichiers verifies, aucun fichier manquant et aucune empreinte divergente.

## Preuves de migration Google

- Instantane: `20260715T184035Z`.
- Objet prive: `snapshots/2026/07/15/cfsb-dashboard-20260715T184035Z.source-snapshot.tar.gz`.
- Empreinte SHA-256: `4ab08c854d86a3a228430ca1d5ad93e9173da47e6914da648a21c972678f0409`.
- Generation Cloud Storage: `1784140979214805`.
- Validation Cloud Build: `19d4d9bd-b9a8-4399-9d35-136186ac0c53` - succes.
- Contrats executes: syntaxe et dependances du dashboard, controle Google-only, installation et lint des Functions.
- L'objet porte les metadonnees `validation=success` et l'identifiant du build pour assurer la tracabilite.
- Deuxieme instantane: `20260715T191130Z`, 146 fichiers, SHA-256 `18308add530c8c5853ea1685a61aebf9736e43dea6f1c4278e7d4b15f36dc4c8`.
- Deuxieme validation Cloud Build: `c95c7af9-5706-4ffa-b20f-752e07847c28` - succes.
- Troisieme instantane: `20260715T192707Z`, 147 fichiers, SHA-256 `4921e79b58c226d53e22a3cc7ceb98ee9fad37dd4664b36cc4e448431c705bdd`.
- Generation Cloud Storage du troisieme instantane: `1784143732508329`.
- Deploiement de previsualisation Cloud Build: `52274fe8-5a5e-4c48-b82b-1b2a7b41a340` - succes.
- Canal valide: `google-only`; 20 fichiers et 211 321 octets, identiques au lot de production controle.
- Test de restauration: 146 fichiers du manifeste relus, 0 manquant, 0 divergence SHA-256, contrat Google-only 7/7.
- Deploiement Hosting de production Cloud Build: `e36078a3-e63f-4c3e-8fbe-a0c83929b9da` - succes.
- Publication live: release `1784144440166000`, creee et finalisee par le compte de service dedie.
- Verification post-deploiement: live strict 9/9, contrat Google-only 7/7, questionnaire et registre public HTTP 200.
- Les metadonnees du troisieme objet conservent les identifiants des builds, la validation de restauration et la release live.
- Instantane de cloture: `20260715T195434Z`, 148 fichiers avec manifeste, SHA-256 `275319388fcbbdbb97fca984d701a7f4628630dc7b1c234e0583c1da5cf58b9d`.
- Generation Cloud Storage de cloture: `1784145436825705`.
- Validation Cloud Build de cloture: `bbb56d5a-0a05-4777-8428-f07d8bca02f4` - succes sous le compte de service dedie.
- Cet instantane contient aussi `cloudbuild.google-only-live.yaml`, la procedure de production reproductible et les preuves documentaires consolidees.

## Phase 1 - Bascule d'hebergement du formulaire

Changements prepares:

- copie du formulaire dans `firebase-dashboard/public/questionnaire/index.html`;
- copie du registre public des coachs dans `firebase-dashboard/public/questionnaire/coaches.json`;
- URL du formulaire changee dans `firebase-dashboard/public/app.js`;
- URL du formulaire changee dans `functions/index.js`;
- controle local ajoute dans `tools/verify-google-only-readiness.cjs`.

Validation requise avant retrait de GitHub Pages:

1. Reauthentifier Firebase CLI avec le compte `info@crossfitstbasilelegrand.com`.
2. Deployer Hosting et Functions.
3. Ouvrir `/questionnaire/` sur les domaines `web.app` et `firebaseapp.com`.
4. Soumettre un questionnaire de test sans donnee client reelle.
5. Confirmer la reception Apps Script, l'import Firestore et la lecture dans le dashboard.
6. Tester un envoi GHL pour chacun des trois types de questionnaire.
7. Conserver GitHub Pages en retour arriere pendant la fenetre de validation.

## Phase 2 - Source privee Google a faible cout

1. Produire un inventaire propre du repertoire local et exclure journaux, caches, sauvegardes, donnees operationnelles et secrets.
2. Generer un instantane `tar.gz` avec manifeste de fichiers et empreintes SHA-256.
3. Televerser l'instantane dans le bucket prive versionne de Montreal.
4. Executer `cloudbuild.google-only.yaml` a partir de cet instantane.
5. Configurer un compte de service de deploiement a privileges minimaux.
6. Valider un deploiement Firebase controle depuis Cloud Build.
7. Conserver le depot Git local pour les branches et revues pendant cette phase; ne pas synchroniser `.git` dans Drive.
8. Evaluer plus tard un vrai serveur Git Google si le besoin de collaboration justifie son cout.

Etat: les etapes 1 a 6 sont completees pour Firebase Hosting. Le fichier `cloudbuild.google-only-live.yaml` rend le deploiement manuel reproductible depuis un instantane prive. Les Functions, regles et index restent sur le chemin de deploiement existant jusqu'a une phase controlee distincte.

## Phase 3 - Retrait de GitHub

1. Confirmer que deux instantanes consecutifs et au moins un deploiement partent du pipeline Google. Complete pour Hosting.
2. Repeter un retour arriere Firebase Hosting vers une version anterieure, puis remettre la version courante.
3. Desactiver GitHub Actions et GitHub Pages.
4. Archiver le depot GitHub en lecture seule pendant la periode de securite convenue.
5. Exporter les preuves necessaires, puis supprimer le depot GitHub si Michael confirme le retrait definitif.
6. Retirer les anciennes URL et mentions GitHub des documents actifs.

## Blocages et risques

- Ne pas migrer un repertoire sale sans controle: l'etat local contient l'application la plus recente, mais aussi beaucoup de fichiers historiques.
- Ne pas supprimer GitHub avant que le coffre source Google contienne une copie complete, verifiee et restaurable.
- Ne pas supposer que le projet Firebase est automatiquement sous l'organisation Workspace.
- Verifier les regions Firestore, Storage et Functions avant de formuler une promesse de residence des donnees.
- La protection Google ne remplace pas les regles IAM, Firestore, App Check, la retention et les obligations CFSB comme responsable des donnees.

## Prochaine action

1. Etendre le pipeline Google aux Functions, regles Firestore/Storage et index, dans une fenetre de changement distincte.
2. Repeter le retour arriere Firebase Hosting vers une version anterieure, puis remettre la version courante.
3. Observer le live et le questionnaire pendant la fenetre de securite convenue.
4. Garder GitHub intact comme retour arriere jusqu'a la validation complete du pipeline backend et a l'autorisation explicite de Michael.
