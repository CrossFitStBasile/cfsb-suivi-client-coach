# Diagnostic live agrégé — préparation Phase 2

Projet: Dashboard Coach CFSB / CoachRx
Date locale: 2026-07-19
Mode: lecture seule dans les interfaces déjà authentifiées
Verdict: correctif urgent requis; diffusion générale non sécuritaire dans l'état observé

## Portée

Le contrôle a comparé la page CoachRx et le Dashboard public pour un coach pilote, sans lancer de synchronisation, modifier une fiche, envoyer un questionnaire ou publier une annonce.

La sortie ci-dessous est volontairement agrégée. Elle ne contient aucun nom, téléphone, courriel, identifiant de client ou détail de tâche.

## Faits observés

| Signal | CoachRx | Dashboard public | Écart |
| --- | ---: | ---: | ---: |
| Clients actifs affichés | 21 | 22 | +1 dans le Dashboard |
| Clients archivés affichés | 31 | Non comparé dans ce contrôle | À valider en E2E |
| Groupes de noms affichés plus d'une fois | 0 observé dans le roster actif | 2 | Anomalie de représentation ou doublon legacy |
| Téléphones signalés manquants | Non applicable | 3 | Bloque le parcours GHL/questionnaire |

Autres constats:

- le Dashboard public affiche la version `20260718-questionnaire-phone-extension-068`;
- le téléchargement public sert `coachrx-sync-extension-0.6.8-main-world-api.zip`, SHA-256 `38B2FD295894D76D805D64F07928A043ACF1D142E0052F645637FF6EFD8448A9`;
- cette 0.6.8 interroge CoachRx avec les cookies de page, sans l'en-tête Bearer ajouté et validé dans la 0.6.9 scellée;
- le portefeuille individuel contient 22 éléments, mais le résumé de synchronisation de la même vue affiche `0 clients`;
- la supervision équipe classe les sept portefeuilles comme vides, alors que le portefeuille sélectionné contient 22 éléments;
- les sept synchronisations sont dites récentes, mais zéro validation terrain sur sept est enregistrée;
- des relations historiques sont volontairement retirées des workflows coach et requièrent une réconciliation administrative;
- le statut de synchronisation indique à la fois réussite et données à corriger.

## Diagnostic

Il existe au moins trois problèmes distincts:

1. **Distribution:** Hosting sert encore la 0.6.8; le paquet 0.6.9 scellé n'est pas disponible à sa route attendue.
2. **Extraction:** la 0.6.8 publique ne possède pas l'authentification Bearer de la 0.6.9 scellée. La 0.6.10 doit reprendre exactement l'extracteur 0.6.9 éprouvé, sous un numéro et un marqueur v79 non ambigus.
3. **Projection Dashboard:** les données chargées et les agrégats administratifs n'utilisent pas la même représentation ou la même requête, ce qui produit des compteurs contradictoires.

Le message historique `52 sur 65` provenait d'un build intermédiaire qui portait déjà le numéro 0.6.9. Les 52 correspondaient aux 21 actifs et 31 archives; le 65 était le pourcentage de conformité lu à tort comme compteur. Cette chaîne n'existe pas dans la 0.6.9 scellée. Le marqueur v75/v79 est un défaut de provenance à corriger, mais il n'est pas envoyé au backend et n'explique pas à lui seul la panne runtime.

## Conséquence opérationnelle

Une simple republication de la 0.6.9 ne suffit pas. Elle laisserait le risque de page partielle, de compteur discordant et de nouvelle dérive entre le roster CoachRx et la projection Dashboard.

Le chemin court et sûr est:

1. construire une 0.6.10 à partir de la 0.6.9 scellée;
2. aligner la provenance de route sur v79 sans changer l'URL Apps Script déjà retargetée;
3. conserver l'extraction authentifiée de la 0.6.9 et bloquer toute sortie lorsque les compteurs actifs/archives ne concordent pas;
4. écrire le roster dans une zone de staging puis promouvoir seulement une tranche complète et valide;
5. corriger les doubles lectures et les agrégats Dashboard;
6. tester un petit portefeuille, puis les portefeuilles de 21 et 42 actifs;
7. répéter à l'identique et exiger zéro création ou déplacement inattendu;
8. conserver le snapshot Hosting 0.6.8 et le dernier roster valide comme rollback jusqu'au verdict pilote.

Une pagination différente sera étudiée dans un changement isolé seulement si un E2E live prouve que l'API tronque réellement un portefeuille. Elle n'est pas ajoutée au hotfix sans cette preuve.

## Changement live effectué

- CoachRx: 0;
- Firestore: 0;
- Hosting `live`: 0;
- Hosting Preview: un canal temporaire isolé créé après le diagnostic pour valider le paquet 0.6.10; aucun domaine Firebase Auth ajouté;
- Functions: 0;
- Apps Script: 0;
- GHL: 0;
- extension: aucune installation ni synchronisation;
- communication équipe: 0.

Le canal Preview sert le ZIP 0.6.10 exact (HTTP 200, `application/zip`,
29 231 octets, SHA-256 `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D`).
La production a été revérifiée ensuite et demeure en 0.6.8.
