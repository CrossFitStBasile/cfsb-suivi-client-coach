# Suivi client-coach - GitHub Pages

Version statique du prototype visuel du questionnaire client-coach.

## But

Publier une expérience client plus proche d'une web app que d'un Google Form standard, afin que les coachs puissent tester le vrai feeling du questionnaire.

## Fichier principal

`index.html`

## Déploiement GitHub Pages

1. Créer un dépôt GitHub, par exemple :

   `cfsb-suivi-client-coach`

2. Ajouter `index.html` et `README.md` à la racine du dépôt.

3. Dans GitHub :

   `Settings > Pages`

4. Choisir :

   - Source : `Deploy from a branch`
   - Branch : `main`
   - Folder : `/root`

5. Attendre que GitHub publie le site.

L'URL ressemblera à :

```text
https://USERNAME.github.io/cfsb-suivi-client-coach/
```

## Note importante

Cette version est d'abord une version de test d'expérience utilisateur. Elle ne remplace pas encore l'intégration finale au Google Sheet ou au dashboard.

Pour brancher la collecte de données, deux options sont recommandées :

1. Soumission cachée vers un Google Form existant, qui écrit dans Google Sheets.
2. Endpoint backend séparé, par exemple Apps Script uniquement comme endpoint, Cloudflare Worker, Netlify Function ou autre service.

