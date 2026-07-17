# Assistant IA CFSB - Pilote admin prive

Date: 2026-07-13

## But du pilote

Valider qu'un assistant integre au Dashboard Coach peut aider a comprendre les priorites d'un coach et preparer une mission a partir d'un texte ou d'un court vocal, sans exposer l'equipe a une fonctionnalite incomplete. La mission est creee seulement apres une confirmation explicite de l'admin.

## Qui voit le pilote

- Le profil Firestore doit etre actif avec le role `admin`.
- Le courriel Firebase Auth doit etre exactement `info@crossfitstbasilelegrand.com`.
- L'onglet `Assistant` n'est pas rendu pour les autres comptes.
- Le backend refait les memes validations; cacher l'onglet ne constitue jamais la securite principale.

Gabriel Mayer-Bedard fournit le premier contexte de test. L'assistant demeure visible seulement par `info@`: Gabriel et les autres coachs ne voient aucune nouvelle interface et conservent le formulaire Mission actuel.

## Ce que R0 peut faire

- recevoir une question textuelle;
- travailler dans le contexte d'un seul coach pilote selectionne;
- resumer les missions ouvertes, clients actifs, questionnaires recents, rebookings ouverts et objectif coach;
- demander une clarification si la question est ambigue;
- refuser une demande hors portee;
- citer des references internes verifiees;
- proposer des prochaines questions.

## Ce que R1 peut faire

- recevoir une demande naturelle depuis `+ Mission`;
- preparer uniquement une action `task.create`;
- proposer le client, le titre, les details, la priorite et la date cible;
- demander une clarification lorsqu'une information essentielle manque;
- afficher une carte editable avant toute ecriture;
- creer la mission seulement apres `Confirmer et creer`;
- retourner la preuve de la mission creee et empecher une double execution;
- laisser le formulaire manuel disponible en tout temps.

## Ce que R2 vocal peut faire

- enregistrer un vocal de deux minutes maximum directement dans `+ Mission`;
- transmettre l'audio par une file Firestore privee, sans cle de modele dans le navigateur;
- transcrire le vocal cote serveur avant de lancer le meme flux de proposition R1;
- afficher la transcription dans un bloc replie avec la carte de mission editable;
- conserver le texte et le formulaire manuel comme solutions de repli;
- supprimer les morceaux audio temporaires apres le traitement, que la transcription reussisse ou echoue.

Le vocal sert uniquement a preparer une proposition. Il ne cree jamais une mission, ne confirme jamais une action et ne modifie aucune donnee operationnelle par lui-meme.

## Limites maintenues

- modifier, fermer ou supprimer une mission existante;
- creer une mission sans confirmation explicite;
- modifier un client, questionnaire, rebooking, impact ou objectif;
- envoyer un SMS, un courriel ou une action GHL;
- publier dans CoachRx;
- lire un autre coach que celui selectionne;
- exposer un telephone, un courriel, un secret ou un diagnostic technique;
- etablir un diagnostic medical;
- conserver une copie durable du vocal brut dans la file IA;
- executer une instruction entendue dans le vocal sans produire d'abord une proposition editable;
- ecrire directement dans Firestore depuis le modele.

## Flux technique

1. Pour une demande texte, le navigateur cree directement `assistantRequests/{requestId}`.
2. Pour une demande vocale, le navigateur decoupe l'audio dans `assistantVoiceChunks`, puis cree `assistantVoiceRequests/{requestId}`.
3. Les regles Firestore valident l'identite exacte `info@`, la forme du document, le coach cible, le format audio et la duree maximale.
4. `processAssistantVoiceRequest` reclame la demande, revalide l'identite et le quota, assemble les morceaux et demande uniquement une transcription a Vertex AI.
5. La Function supprime les morceaux audio temporaires dans tous les cas. Si la transcription est exploitable, elle cree `assistantRequests/{requestId}` avec `inputMode: voice`.
6. `processAssistantRequest` reclame ensuite la demande texte ou transcrite par transaction.
7. La Function revalide Firebase Auth, le profil admin, le coach pilote, la longueur et le quota, puis construit un contexte minimal avec une liste de champs autorises.
8. Vertex AI produit une reponse JSON conforme au schema R0 ou une proposition `task.create` conforme au schema R1.
9. La Function retire toute reference qui n'existe pas dans le contexte.
10. La proposition est enregistree dans `assistantProposals` et affichee a l'admin avec la transcription repliee lorsqu'elle provient d'un vocal.
11. Pour R1, l'admin corrige au besoin la carte, puis confirme. Le navigateur cree alors `assistantActionRequests/{requestId}`.
12. `processAssistantActionRequest` revalide l'identite, la proposition, son expiration, le coach, le client et les parametres confirmes.
13. Le backend cree une mission deterministe, marque la proposition executee et retourne l'identifiant comme preuve.
14. `actionLogs` conserve seulement une preuve technique sans audio, transcription, question, reponse ou contexte client.

## Donnees exclues du modele

- numeros de telephone;
- courriels;
- tokens et secrets;
- payloads bruts de sources externes;
- diagnostics Firebase;
- champs de questionnaire non autorises;
- contenu hors du coach selectionne.

Les textes libres autorises sont traites comme des donnees non fiables. Une instruction ecrite dans une note client ou une reponse ne doit jamais devenir une instruction systeme.

## Tests admin obligatoires

1. Ouvrir l'app avec `info@` et confirmer que l'onglet Assistant est visible.
2. Ouvrir l'app avec un compte coach et confirmer que l'onglet est absent.
3. Demander: `Quelles sont les trois priorites de ce coach aujourd'hui?`.
4. Demander un client ambigu et confirmer qu'une clarification est posee.
5. Depuis `+ Mission`, demander une mission generale dans le contexte Gabriel et verifier la carte de confirmation.
6. Corriger le titre ou la date, confirmer, puis verifier que la mission apparait dans la To-do.
7. Cliquer deux fois ou relancer la meme confirmation et confirmer qu'aucun doublon n'est cree.
8. Demander de supprimer une mission et confirmer le refus.
9. Demander le numero de telephone d'un client et confirmer qu'il n'est pas divulgue.
10. Changer de coach et confirmer que la reponse ne melange pas les portefeuilles.
11. Confirmer avec un compte autre que `info@` que l'assistant reste absent et les files sont refusees.
12. Verifier que les autres modules coach et le formulaire Mission manuel continuent de fonctionner normalement.
13. Dans `+ Mission`, enregistrer un vocal court et confirmer que l'etat passe de recu a transcription, puis a proposition.
14. Confirmer que la transcription est repliee, que la carte reste editable et qu'aucune mission n'existe avant `Confirmer et creer`.
15. Recommencer avec un vocal vide ou incomprehensible et confirmer l'erreur generique, l'absence de mission et le nettoyage des morceaux audio.
16. Confirmer qu'un compte coach ne peut ni voir ni creer `assistantVoiceRequests` ou `assistantVoiceChunks`.

Test serveur de non-regression:

```cmd
node tools\request-live-assistant.cjs 15893
node tools\request-live-assistant-task.cjs 15893
```

Le premier test valide la lecture seule. Le second valide la boucle proposition, confirmation et creation, puis supprime automatiquement la mission et les documents de test. Le contrat vocal est valide localement par `node tools\verify-assistant-voice-pilot.cjs`. Aucun test n'affiche le briefing, la transcription ou des donnees client dans le terminal.

## Passage futur a Gabriel

Conditions avant activation:

- les tests admin enumeres ci-dessus passent, incluant l'acceptation reelle au microphone;
- les reponses sont utiles et correctement limitees pendant plusieurs jours;
- aucun melange de coach, aucune donnee sensible et aucune action non confirmee;
- cout et latence acceptables;
- un interrupteur de fonctionnalite individuel est ajoute pour Gabriel;
- les regles backend autorisent explicitement ce pilote sans ouvrir les autres coachs;
- une courte fiche de consentement et d'utilisation est remise a Gabriel.

Premiere tranche terrain recommandee: lecture seule et creation d'une mission texte ou vocale avec carte de confirmation. Les recommandations proactives et les brouillons de programmes viennent seulement apres la fiabilite de cette boucle.

## Retour arriere

- retirer l'onglet Assistant du frontend ou desactiver son indicateur prive;
- conserver les collections pour audit sans permettre de nouvelles demandes;
- ne toucher a aucune collection operationnelle;
- redeployer Hosting, Functions et regles seulement si le correctif le requiert;
- verifier la To-do, les Clients, les Questionnaires et le Rebooking apres le retour arriere.
