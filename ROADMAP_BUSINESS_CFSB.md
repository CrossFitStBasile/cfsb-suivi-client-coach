# Roadmap Business CFSB

Project: Roadmap Business CFSB
Created: 2026-07-15
Last updated: 2026-07-15
Primary owner: Michael Grondin et Gabriel Mayer Bedard
Status: Phase 1 en implementation
Source of truth: Dashboard Equipe Firebase (`cfsb-roadmap-trimestrielle`)

## 1. Context

Le Dashboard Equipe regroupe deja les roadmaps trimestrielles, les dossiers des membres, les rencontres individuelles, les actions de gestion et les parcours de carriere. CFSB veut maintenant en faire un outil de pilotage d'entreprise inspire des principes EOS, adapte a ses propres pratiques et capable d'evoluer sans fusionner le Dashboard Coach et le Dashboard Equipe.

## 2. Objective

Creer un Roadmap Business CFSB qui permet a Michael et Gabriel de piloter les priorites, les indicateurs, les enjeux et les rencontres hebdomadaires, puis d'ajouter progressivement les outils de gestion des personnes, de formation et de sante organisationnelle.

## 3. Source Of Truth

- Dashboard Equipe Firebase: donnees operationnelles et interface proprietaire.
- Google Drive CFSB: documents officiels, checklists validees, fiches de poste et rapports Working Genius.
- Dashboard Coach Firebase: systeme independant pour la gestion des clients et les operations des coachs.
- Ninety: reference fonctionnelle temporaire; aucune dependance de production.

## 4. Current State

- Le Dashboard Equipe est en production et reserve aux comptes owner/admin.
- Le moteur d'actions `managementTasks` est deja utilise et doit rester la liste unique des suivis de gestion.
- Les rencontres individuelles des membres sont conservees dans `teamMeetings`.
- Les outils de pilotage hebdomadaire, de scorecard, de priorites 90 jours et d'enjeux n'existent pas encore.
- Les acces Head Coach et membres seront definis dans une phase ulterieure.

## 5. Decisions Made

| Date | Decision | Reason | Impact | Decided by |
| --- | --- | --- | --- | --- |
| 2026-07-15 | Garder les Dashboard Equipe et Coach independants | Permettre des mises a jour sans conflits | Deux applications Firebase et un contrat de liens stable | Michael |
| 2026-07-15 | Reserver la phase 1 a Michael et Gabriel | Stabiliser les outils avant de partager | Toutes les nouvelles collections sont owner-only | Michael |
| 2026-07-15 | Reutiliser `managementTasks` pour les suivis | Eviter deux listes de taches concurrentes | Les enjeux peuvent creer une action liee dans la vue A faire | Michael et Codex |
| 2026-07-15 | Separer les rencontres de pilotage des rencontres 1:1 | Les objectifs et participants sont differents | Nouvelle collection `pilotageMeetings` | Michael et Codex |
| 2026-07-15 | Importer les resultats Working Genius sans recreer le test | Respecter l'outil officiel et ses resultats | Profil et lien vers le rapport seulement | Michael et Codex |

## 6. Phased Plan

### Phase 1 - Zone Pilotage owner

Objective: soutenir la rencontre hebdomadaire de Michael et Gabriel.

Deliverables:

- Scorecard hebdomadaire avec cibles et signaux hors cible.
- Priorites 90 jours avec responsable, progression et statut.
- Liste d'enjeux priorisee avec resolution et conversion en action.
- Compte rendu hebdomadaire structure, brouillon et finalisation.
- Journal d'activite et regles Firestore owner-only.

Completion criteria: les quatre outils fonctionnent en temps reel sur ordinateur et mobile, sans modifier les donnees du Dashboard Coach.

### Phase 2 - Strategie et sante organisationnelle

Objective: centraliser les elements durables de l'entreprise.

Deliverables:

- Vision, mission, valeurs, niche et cibles a long terme.
- SWOT CFSB et registre des decisions.
- People Analyzer adapte aux valeurs CFSB.
- Profils Working Genius importes et carte d'equipe partageable.

Completion criteria: Michael et Gabriel valident le modele, les champs et la visibilite de chaque outil.

### Phase 3 - Systeme Head Coach

Objective: soutenir l'encadrement, l'onboarding, les evaluations et la formation continue.

Deliverables:

- Checklists d'integration versionnees.
- Progression par membre et preuves de completion.
- Evaluations et suivis de formation.
- Acces Head Coach limite aux donnees operationnelles autorisees.

Completion criteria: Gabriel valide la checklist officielle et les permissions avant tout partage.

### Phase 4 - Portail membre enrichi

Objective: offrir a chaque membre une vue utile de son parcours sans exposer les notes de gestion.

Deliverables:

- Mandat de carriere, reconnaissance et prochaines etapes partagees.
- Comptes rendus approuves.
- Liens vers les documents Drive et outils pertinents.
- Ponts explicites vers le Dashboard Coach pour les coachs professionnels.

Completion criteria: matrice d'acces approuvee et test pilote avec un petit groupe.

## 7. Deliverables

| Deliverable | Type | Owner | Status | Link |
| --- | --- | --- | --- | --- |
| Zone Pilotage owner | Application Firebase | Codex | En cours | `firebase-roadmap/public/app.js` |
| Modele de donnees Pilotage | Documentation | Codex | En cours | `firebase-roadmap/DATA_MODEL.md` |
| Plan directeur | Documentation | Michael et Codex | Actif | `ROADMAP_BUSINESS_CFSB.md` |
| Checklist onboarding officielle | Google Drive | Gabriel | A fournir | A confirmer |
| Matrice d'acces future | Documentation | Michael et Gabriel | A definir | A confirmer |

## 8. Owners

| Role | Person | Responsibility |
| --- | --- | --- |
| Proprietaire produit | Michael | Priorites, validation UX et decisions d'affaires |
| Proprietaire operations | Gabriel | Rituels de gestion, Head Coach et contenu des checklists |
| Implementation | Codex | Architecture, code, tests, documentation et deploiement |

## 9. Risks And Unknowns

| Risk or unknown | Impact | Mitigation |
| --- | --- | --- |
| Trop d'outils ajoutes en meme temps | Adoption faible | Livrer par phases avec une vue principale claire |
| Indicateurs inventes ou mal definis | Mauvaises decisions | Commencer vide et laisser les owners saisir les vrais indicateurs |
| Acces trop larges | Exposition de notes internes | Collections owner-only et matrice d'acces avant la phase Head Coach |
| Donnees dupliquees entre les dashboards | Incoherences | Conserver des applications independantes et des liens explicites |
| Reproduction excessive d'un outil tiers | Dette et risque de copie | S'inspirer des workflows, pas de l'identite ni du contenu proprietaire |

## 10. Next Actions

| Priority | Action | Owner | Due date | Status |
| --- | --- | --- | --- | --- |
| P1 | Livrer et tester la Zone Pilotage owner | Codex | 2026-07-15 | En cours |
| P1 | Choisir les premiers indicateurs et priorites 90 jours | Michael et Gabriel | A confirmer | A faire |
| P2 | Faire valider la checklist onboarding | Gabriel | A confirmer | A faire |
| P2 | Definir la visibilite du People Analyzer | Michael et Gabriel | A confirmer | A faire |
| P3 | Exporter les resultats Working Genius a integrer | Michael et Gabriel | A confirmer | A faire |

## 11. Follow-up Log

| Date | Update | Done by | Next action |
| --- | --- | --- | --- |
| 2026-07-15 | Architecture modulaire et perimetre owner-only confirmes | Michael et Codex | Implementer la Zone Pilotage |

