# DriveSwitch

Extension navigateur (Manifest V3) pour **transférer un panier drive** d’une enseigne française vers une autre, avec **proposition d’équivalents** et **revue manuelle**.

Produit gratuit, sans compte DriveSwitch, **sans stockage d’identifiants** : vous restez connecté vous-même dans deux onglets.

Dépôt : https://github.com/AnthonyMarcelin/DriveSwitch

## Enseignes MVP

| Enseigne | Host | `detect` | `readCart` | `searchProduct` | `addToCart` |
|---|---|---|---|---|---|
| E.Leclerc Drive | `*.leclercdrive.fr` | réel | stub | stub | stub |
| Carrefour | `*.carrefour.fr` | réel | stub | stub | stub |
| Auchan | `*.auchan.fr` | réel | stub | stub | stub |

Les stubs renvoient un panier / des résultats de démo pour exercer le flux UI + matching. Les sélecteurs DOM restent à brancher après inspection sur Mac.

## Prérequis

- Node.js 18+
- Un navigateur : **Safari (prioritaire)**, Chrome, ou Firefox

```bash
cd DriveSwitch
npm install
npm run build
```

Le paquet chargeable est le dossier **`dist/`**.

## Flux utilisateur (2 onglets)

1. Ouvrez l’enseigne **source** (panier rempli) et l’enseigne **cible** (drive déjà choisi), sessions déjà connectées.
2. Ouvrez la popup DriveSwitch.
3. Assignez Source / Cible → **Lire & matcher**.
4. Revue ligne par ligne : accepter / refuser / alternative / ignorer.
5. **Ajouter les acceptés** → résumé (ajouts / échecs / ignorés).

Tant que `addToCart` est stub, les ajouts échouent volontairement avec un message clair.

## Installation — Safari (dev, Mac)

1. Sur votre Mac : `npm install && npm run build`
2. Convertir l’extension :

   ```bash
   xcrun safari-web-extension-converter /chemin/vers/DriveSwitch/dist \
     --project-location ~/Developer/DriveSwitch-Safari \
     --app-name DriveSwitch \
     --bundle-identifier dev.local.DriveSwitch
   ```

3. Ouvrir le projet Xcode généré → Run (cible macOS).
4. Safari → Réglages → **Avancé** → cocher « Afficher le menu Développement ».
5. Développement → **Autoriser les extensions non signées** (session de debug).
6. Safari → Réglages → **Extensions** → activer DriveSwitch.
7. Ouvrir deux onglets enseignes supportées et tester la popup.

## Installation — Chrome

1. `npm run build`
2. Chrome → `chrome://extensions` → Mode développeur
3. **Charger l’extension non empaquetée** → sélectionner `dist/`
4. Épingler DriveSwitch, ouvrir 2 onglets enseignes, lancer la popup

## Installation — Firefox

1. `npm run build`
2. Firefox → `about:debugging#/runtime/this-firefox`
3. **Charger un module complémentaire temporaire** → `dist/manifest.json`

## Architecture

```
src/
  adapters/          Contrat StoreAdapter + Leclerc / Carrefour / Auchan
  matching/          EAN exact puis fuzzy (nom / marque / contenance)
  content/bridge.js  Messages DOM ↔ background
  background/        Orchestration transfert + état court
  popup/             UI sélection onglets + revue + résumé
  shared/            Messages + types JSDoc
scripts/build.mjs    Bundle esbuild → dist/ (IIFE, Safari-friendly)
```

## Limites actuelles (phase 0)

- Lecture / recherche / ajout panier = **stubs**
- Pas de mémoire locale des paires acceptées
- Pas de backend
- Distribution store non préparée

## Confidentialité

- Aucun login / mot de passe stocké ni transmis par l’extension
- Les cookies de session restent ceux du navigateur
