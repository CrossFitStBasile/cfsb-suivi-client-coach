# Point stable Dashboard Coach - 2026-07-16

## Version

- Application: `20260715-firebase-questionnaire-suite`
- Hosting: `cfsb-dashboard-coach-aa9a4`
- URL: `https://cfsb-dashboard-coach-aa9a4.web.app`

## Incident restaure

Une ancienne copie du frontend a ete publiee depuis le depot `cfsb-suivi-client-coach-live`. Le live servait un `app.js` de 67 515 octets et un `styles.css` de 11 429 octets au lieu du bundle moderne.

La restauration a publie uniquement Hosting depuis le depot officiel. Firestore, Storage, les Functions et les donnees clients n'ont pas ete modifies par cette restauration.

## Preuves

- validation locale complete: reussie;
- verification Hosting stricte: 9/9;
- `app.js` live: 584 778 octets;
- `styles.css` live: 136 723 octets;
- version et cache-busters alignes;
- aucune dependance GitHub Pages dans les formulaires Firebase.

## Protections ajoutees

- `tools/verify-hosting-deploy-provenance.cjs` bloque un bundle ancien ou provenant d'une mauvaise configuration;
- `firebase.json` execute ce controle avant Hosting;
- l'ancien depot n'a plus de projet Firebase par defaut;
- l'ancien depot execute `tools/block-legacy-coach-hosting-deploy.cjs` et refuse tout deploy Hosting du Dashboard Coach;
- les deploys Roadmap doivent partir du sous-dossier `firebase-roadmap` de leur propre projet.

## Reprise rapide

```cmd
cd /d "C:\Users\micha\Documents\Codex\2026-05-08\j-ai-un-gros-projet-d\generated\github-pages-repo"
cmd /c verify-dashboard-before-deploy.cmd
cmd /c deploy-hosting-dashboard.cmd
cmd /c verify-dashboard-live.cmd
```
