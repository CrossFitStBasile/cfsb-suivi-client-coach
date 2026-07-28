# Studio questionnaires — contrat V1

## Résultat produit

Le Dashboard offre quatre expériences distinctes sans remplacer l'historique déjà
visible dans l'inbox coach.

| Expérience | URL publique canonique | Tag GHL initial | Usage |
| --- | --- | --- | --- |
| Bilan 90 jours | `/questionnaire/f/bilan-90-jours` | `cfsb-bilan-90-jours-v1` | Bilan trimestriel, priorités et rappel InBody informatif |
| Check-in express | `/questionnaire/f/check-in-express` | `cfsb-check-in-express-v1` | Trois oui/non, commentaire facultatif, cadence choisie de 14 ou 28 jours |
| Évaluation habitudes de vie | `/questionnaire/f/evaluation-habitudes-vie` | `cfsb-evaluation-habitudes-vie-v1` | Questionnaire complet existant pour apprendre à connaître le membre |
| Repères CFSB | `/questionnaire/f/reperes-cfsb` | `cfsb-reperes-v1` | Questionnaire éducatif quantitatif avec rétroaction et sources |

Les anciennes URL `/questionnaire/`, `/questionnaire/check-in/` et
`/questionnaire/evaluation-habitudes-vie/` restent d'abord sur le pipeline
Apps Script v23 actuellement éprouvé. Elles peuvent donc rester dans les
workflows GHL existants pendant que le nouveau pipeline est validé.

Les trois tags historiques `dashboardcoach`, `suiviregulier` et
`evaluationnutrition` restent réservés aux workflows historiques. Aucun nouveau
formulaire ne réutilise ces déclencheurs.

Leur redirection vers les URL canoniques est une étape ultérieure et distincte.
Elle ne peut être publiée qu'après une soumission réelle confirmée sur chacun des
nouveaux parcours, la preuve du bon rattachement Dashboard et la validation du
rollback Hosting.

## Règles d'identité et de routage

- Le lien public ne contient aucun nom, téléphone, courriel, identifiant client,
  identifiant coach, paramètre ou fragment.
- Le membre saisit son nom et son téléphone dans le formulaire.
- Le backend normalise le téléphone et ne rattache la réponse que si une seule
  fiche membre active, sélectionnable et à ownership confirmé correspond.
- Le téléphone sert uniquement de preuve de rapprochement. La réponse conserve
  l'`internalClientId` immuable de la fiche (`clientId` Firestore pour les fiches
  historiques qui n'ont pas encore ce champ).
- Zéro correspondance reste dans la file admin `unmatched`; plusieurs
  correspondances produisent un conflit fail-closed.
- Le questionnaire ne crée jamais de client et ne change jamais le propriétaire
  Dashboard d'une fiche.
- Une reprise avec la même clé et le même contenu est idempotente. La même clé
  avec un contenu différent est refusée.
- L'interface affiche le succès seulement si le serveur confirme `stored: true`
  et retourne exactement la clé d'idempotence envoyée.

## Bruit coach

- Une réponse verte reconnue est archivée automatiquement.
- Une réponse jaune ou rouge reconnue crée une seule réponse `to_read`.
- Une réponse non reconnue reste dans la file de validation admin.
- Aucune mission To-do n'est créée automatiquement par le nouveau pipeline.
- Le coach peut toujours créer une mission consciemment depuis une réponse à lire.

## Publication et historique

- Un brouillon est modifiable jusqu'à sa publication.
- Chaque publication crée un snapshot de version immuable et met à jour le slug
  public vers cette version.
- Un brouillon est refusé avant écriture s'il dépasse 256 Kio sérialisés; cette
  marge protège les documents Firestore et les snapshots joints aux réponses.
- Une réponse conserve le schéma, le numéro et le hash exacts de la version
  affichée au membre.
- Archiver un formulaire retire sa publication active sans supprimer ses anciennes
  versions ni ses réponses.

## Étape GHL volontairement manuelle

Le Dashboard envoie seulement le tag associé au formulaire. Le workflow GHL
correspondant doit être créé ou vérifié manuellement pour envoyer l'URL publique
fixe. Le logiciel n'injecte aucune donnée du contact dans cette URL.
Chaque tag est réservé à un seul formulaire publié afin d'éviter que deux
workflows envoient des expériences différentes au même déclencheur.

La publication et l'activation GHL sont deux états distincts :

- `published` rend le lien public copiable et testable manuellement;
- `deliveryReady` autorise les envois et planifications automatiques;
- `deliveryReady` reste à `false` tant qu'un administrateur n'a pas enregistré
  dans le Studio la preuve du workflow et de ses canaris;
- les preuves, notes et courriels d'activation restent dans l'espace admin et ne
  sont jamais exposés dans le catalogue lisible par les coachs.

Pour un nouveau formulaire:

1. créer et publier le formulaire dans le Studio;
2. copier son URL publique fixe;
3. créer ou choisir un tag GHL;
4. configurer le workflow GHL qui réagit à ce tag et envoie exactement cette URL;
5. pour un envoi récurrent, autoriser la réinscription dans le workflow et retirer
   le tag déclencheur à la fin du parcours;
6. faire deux tests canaris successifs avec un contact interne pour confirmer que
   le deuxième ajout du tag déclenche bien un nouvel envoi;
7. seulement après ces preuves, activer « Envois GHL » dans le Studio.

## Continuité coach et client

La publication est fractionnée pour éviter une période où un lien accepté ne
pourrait pas enregistrer sa réponse :

1. déployer les nouveaux composants backend, règles et index sans modifier
   Hosting ni les liens utilisés par les coachs;
2. initialiser et vérifier les quatre versions publiées;
3. exécuter un canari de soumission, de rejeu idempotent et de rattachement;
4. publier ensuite le shell Hosting et vérifier les quatre URL;
5. conserver les anciennes pages et Apps Script v23 pendant l'observation;
6. modifier les workflows ou les anciennes URL seulement dans une release
   ultérieure.

Conditions d'arrêt : accusé incomplet, réponse absente, doublon, mauvais client,
mauvais coach, catalogue incomplet, fonction indisponible ou rollback non prêt.
Si une de ces conditions apparaît après qu'un lien a été communiqué, les nouveaux
liens doivent être retirés de la circulation et les coachs doivent recevoir un
avis avant tout nouvel envoi. Aucun avis n'est envoyé automatiquement par le code.

## Couverture du Studio V1

Le Studio visuel couvre les sections, questions, options, champs requis,
conditions simples, triage, duplication, publication et archivage. Il permet
aussi de créer et modifier les repères éducatifs sans toucher au code:

- bandes numériques, bornes inclusives ou exclusives et détection des
  chevauchements;
- rétroactions associées aux réponses oui/non ou à choix simple;
- niveau, libellé, message éducatif et source HTTPS de chaque repère.

Les règles logiques avancées déjà publiées restent conservées sans perte. Leur
structure imbriquée n'est volontairement pas transformée par l'éditeur visuel de
conditions simples.
