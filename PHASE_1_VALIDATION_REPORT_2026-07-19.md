# Rapport de validation — Phase 1 Dashboard Coach CFSB

Projet: Dashboard Coach CFSB / CoachRx
Date: 2026-07-19
Branche: `feat/dashboard-client-lifecycle-phase1-20260719`
Verdict: **fondation Phase 1 validée localement; NO-GO déploiement et diffusion**

## Résultat

La Phase 1 établit un contrat client unique et sécuritaire sans modifier les données live. Une personne créée dans le Dashboard peut rester sans CoachRx, recevoir des services CFSB, puis être liée plus tard à CoachRx sans changer d'identité. Le parcours inverse conserve aussi la même identité et le même historique.

Les anciens writers CoachRx, GHL et CSM sont désormais interdits d'écriture sur une fiche canonique. Cette garde est volontairement fail-closed: le nouveau writer contractuel sera branché en Phase 2.

## Livrables produits

- contrat d'architecture complet: `docs/architecture/CLIENT_LIFECYCLE_CONTRACT_PHASE1.md`;
- contrat backend pur: `functions/client-contract.js`;
- commandes serveur authentifiées pour créer un client Dashboard, changer son responsable et confirmer les liens externes;
- primitives de jeton questionnaire opaque, signé et expirant;
- frontend questionnaire sans PII dans l'URL, sans `no-cors` et sans faux accusé de succès;
- règles Firestore et Storage cloisonnées par coach;
- harness Firebase Emulator reproductible;
- classificateur agrégé des fiches historiques, sans PII et sans écriture live;
- tests de contrat, sécurité, questionnaire, classification et règles.

## Invariants prouvés

1. `internalClientId` est un UUID généré côté serveur, indépendant du coach, du nom, du téléphone, de GHL et de CoachRx.
2. `originSystem` est immuable.
3. Un client `dashboard_manual` est valide sans lien CoachRx.
4. Le responsable Dashboard et le propriétaire observé dans CoachRx sont deux champs distincts.
5. Un téléphone est seulement un signal: une claim déjà présente exige une révision, même pour le même coach et le même nom.
6. Seule la même clé d'idempotence avec le même payload peut rejouer une création.
7. Les trois writers legacy refusent toute fiche contractuelle canonique.
8. Une absence du roster CoachRx ne rend jamais l'identité canonique stale ou supprimée.
9. Les clients, engagements, envois, planifications, réponses créées et journaux critiques sont server-write.
10. Un coach lit et agit seulement dans son propre périmètre; les commandes Phase 1 sont bornées aux sept coachs pilotes.
11. Une session admin inactive est refusée et une session admin navigateur ne peut pas créer une réponse questionnaire.
12. Les notes vocales Storage sont accessibles seulement dans le chemin du coach correspondant, sans exception navigateur admin.
13. Une URL questionnaire ne contient que `access_token` et `lock_context`.
14. Un succès de soumission exige HTTP OK et un JSON explicite `{ "ok": true }`.

## Dry-run historique

Source: snapshot privé Firestore Phase 0, 313 documents.
Empreinte SHA-256: `F24C47AC89B772ED568E2BCE00E3BA9E1B73A602FCFC25BEA0D3644A36556C85`.

| Classification | Nombre | Traitement |
| --- | ---: | --- |
| Candidats Dashboard seulement | 9 | Conserver comme clients valides; confirmer identité interne et lien GHL au besoin |
| Revendications CoachRx sans ID client stable | 3 | Prouver le lien CoachRx ou reclassifier; aucune fusion automatique |
| Total à examiner | 12 | Aucune mutation avant migration autorisée |

La sortie est agrégée et ne contient ni nom, ni téléphone, ni courriel, ni ID de document. Écritures live: **0**.

## Validation automatisée

| Suite | Résultat |
| --- | --- |
| Backend Functions — contrat, accès, idempotence, writers legacy, jetons | **25/25 réussis** |
| Firestore + Storage Emulator, projet démo isolé | **20/20 réussis** |
| Frontend questionnaire + classificateur | **12/12 réussis** |
| Total ciblé Phase 1 | **57/57 réussis** |
| Vérifications syntaxiques Node | Réussies |
| `git diff --check` | Réussi |

La suite élargie `firebase-roadmap` donne 53/56. Les trois échecs concernent le contrat de navigation Portal absent du snapshot `HEAD` et ne sont pas introduits par la Phase 1. Ils restent une dette séparée du présent changement.

## Pourquoi la branche ne doit pas être déployée

- le frontend client historique écrit encore directement des champs `coachId` et n'appelle pas encore les nouvelles commandes;
- les règles Phase 1 bloqueraient donc certains parcours historiques si elles étaient déployées seules;
- le writer CoachRx canonique, `proposeCoachRxLink` et la transition `rosterStatus` restent à implémenter;
- les claims d'identité externe historiques doivent être backfillées et validées avant activation des commandes de liaison;
- l'endpoint public de résolution/consommation du jeton questionnaire et son idempotence restent à brancher;
- aucune migration, aucun E2E sept coachs et aucun pilote terrain n'ont encore été exécutés sur cette architecture.

## Étape suivante recommandée

Phase 2: brancher l'interface et les pipelines sur le contrat, en double lecture contrôlée, ajouter les tests d'intégration transactionnels, produire un dry-run de migration et maintenir le NO-GO jusqu'à une autorisation distincte.

## Changement live

- Firestore: 0 écriture;
- GHL: 0 écriture;
- Apps Script: 0 modification;
- Firebase deploy: 0;
- Hosting: 0;
- extension distribuée: aucune;
- message ou pop-up entraîneurs: aucun.
