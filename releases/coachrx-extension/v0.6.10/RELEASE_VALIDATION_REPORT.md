# Rapport de validation — CoachRx Sync 0.6.10

Date: 2026-07-19

Statut: **candidate_not_yet_approved_for_distribution**

Décision de diffusion: **NO-GO jusqu'aux validations CoachRx signées et au contrôle des sept coachs**

## 1. Résultat

Le candidat minimal 0.6.10 est construit et reproductible localement. Il est
strictement dérivé de la source 0.6.9 scellée et ne modifie que:

1. la version d'extension `0.6.9` vers `0.6.10`;
2. le marqueur de route `20260718-v75` vers `20260719-v79`.

L'URL Apps Script gérée reste identique. La logique d'extraction, le Bearer,
les compteurs Active/Archived, l'identité, la normalisation et l'envoi restent
octet pour octet identiques à la 0.6.9 après substitution des deux constantes.
Le test de release vérifie cette propriété directement.

## 2. Provenance et artefact

- source de départ: release scellée `v0.6.9`;
- commit de provenance: `b54fec7fe0d0fb3e30ba8131352fec893e35905a`;
- tag de provenance: `coachrx-extension-v0.6.9-provenance-20260719`;
- artefact candidat: `coachrx-sync-extension-0.6.10-live.zip`;
- taille: `29231` octets;
- SHA-256: `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D`;
- contenu ZIP: dix fichiers approuvés à la racine, sans dossier englobant;
- manifeste Chrome: `0.6.10`;
- marqueur Apps Script: `20260719-v79`;
- production Hosting: inchangée;
- canal Preview isolé: publié et vérifié, sans ajout de domaine Firebase Auth.

Les empreintes individuelles des dix fichiers source sont consignées dans
`release-manifest.json` et vérifiées par `test.mjs`.

## 3. Reproductibilité

Le build a été exécuté avec PowerShell 7.6.3. L'artefact conservé et deux
reconstructions indépendantes ont produit exactement la même empreinte:

| Production | Taille | SHA-256 |
| --- | ---: | --- |
| Artefact candidat | 29231 | `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D` |
| Reconstruction A | 29231 | `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D` |
| Reconstruction B | 29231 | `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D` |

Le script refuse d'écraser un fichier existant, contrôle exactement les dix
entrées source, applique des timestamps fixes et rejette toute empreinte autre
que celle déclarée.

## 4. Tests locaux

Runtime: Node.js 24.14.0.

Résultats:

- syntaxe `popup.js`: réussie;
- syntaxe `coachrx-identity.js`: réussie;
- syntaxe `test.mjs`: réussie;
- test de release: réussi;
- neuf scénarios d'extraction ou de garde: réussis;
- racine ZIP et empreintes: réussies;
- delta exact par rapport à la 0.6.9 scellée: réussi.

Couverture explicite:

1. manifeste 0.6.10 et marqueur v79;
2. URL Apps Script gérée inchangée;
3. Bearer présent dans la requête CoachRx et absent du résultat;
4. Marc-André: 21 actifs, 31 archivés, seulement 21 actifs retournés;
5. Iheb: 42 actifs;
6. refus d'un Coach ID différent de l'URL;
7. refus de la page générique `/clients`;
8. refus d'une session sans jeton;
9. refus d'un roster actif incomplet;
10. refus d'un roster archivé incomplet;
11. refus de compteurs Active/Total contradictoires;
12. refus d'un état client inconnu;
13. liste exacte des dix entrées ZIP;
14. empreinte ZIP et empreintes de chaque source.

## 5. Sécurité et portée

- aucun secret n'a été ajouté à la release;
- aucun jeton CoachRx n'est sauvegardé, retourné ou placé dans l'artefact;
- aucun fichier sous `firebase-dashboard/public` n'a été touché;
- `firebase.json` n'a pas été touché;
- aucun Apps Script, Sheet, Firestore, Function ou canal Hosting `live` n'a été modifié;
- un canal Hosting Preview temporaire a été créé depuis le snapshot live scellé;
- aucun message aux coachs n'a été envoyé et aucune consigne d'installation
  générale n'a été publiée.

## 6. Validations encore obligatoires

Avant diffusion:

1. charger le candidat non empaqueté dans une session CoachRx signée;
2. tester un petit portefeuille, Iheb 42 et Marc-André 21/31;
3. confirmer qu'aucun jeton ne quitte la page CoachRx;
4. sauvegarder puis comparer `SRC_CoachRx_Browser_All` avant et après;
5. exécuter les sept coachs et confirmer les 146 identités du roster courant,
   zéro rejet, zéro doublon et zéro conflit inter-coachs; ce contrôle est
   distinct des 165 identités legacy Firestore repérées par le dry-run de
   migration;
6. confirmer l'idempotence d'un deuxième import identique;
7. réconcilier les identités CoachRx actuelles au bon propriétaire et au bon responsable Dashboard;
8. basculer le canal `live` seulement après le verdict canari;
9. revérifier que le ZIP servi par le canal `live` possède exactement l'empreinte
   déclarée avant toute annonce.

Déjà accompli sur le canal Preview `coachrx-0610-candidate`:

- HTTP `200`, type MIME `application/zip` et taille `29 231` octets;
- SHA-256 reçu identique au candidat: `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D`;
- application publique revérifiée après coup: toujours 0.6.8, sans libellé 0.6.10;
- ZIP public 0.6.8 revérifié au hash scellé `38B2FD295894D76D805D64F07928A043ACF1D142E0052F645637FF6EFD8448A9`.

## 7. Rollback

La release n'étant déployée que sur un canal Preview temporaire, le rollback
actuel consiste à ne pas la distribuer et à laisser expirer ou supprimer ce
canal. Le live reste sur:

- version publique: `0.6.8`;
- ZIP: `coachrx-sync-extension-0.6.8-main-world-api.zip`;
- SHA-256: `38B2FD295894D76D805D64F07928A043ACF1D142E0052F645637FF6EFD8448A9`;
- preuve Hosting: tag `dashboard-hosting-live-20260719T000445Z-provenance`.

La 0.6.10 ne change pas Apps Script; la version 79 demeure donc en place et
ne fait partie d'aucun rollback de cette release.
