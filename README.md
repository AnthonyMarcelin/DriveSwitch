# DriveSwitch

Extension navigateur (Manifest V3) pour **transférer un panier drive** d’une enseigne française vers une autre, avec **proposition d’équivalents** et **revue manuelle**.

Produit gratuit, sans compte DriveSwitch, **sans stockage d’identifiants** : vous restez connecté vous-même dans deux onglets.

Dépôt : https://github.com/AnthonyMarcelin/DriveSwitch

## Enseignes MVP — réel vs fragile

| Enseigne | Host | Lecture panier | Recherche | Ajout panier | Fragilité |
|---|---|---|---|---|---|
| E.Leclerc Drive | `*.leclercdrive.fr` | HTML magasin (`lstProduits`) | `recherche.aspx` | `POST panier.aspx?op=1` | **DataDome** si trop rapide ; URL doit contenir `/magasin-XXXXX-…/` |
| Carrefour | `*.carrefour.fr` | `GET /api/cart` | `GET /s` (+ EAN via `POST /products`) | `PATCH /api/cart` | Cloudflare / session SSO ; besoin d’un **drive choisi** (`basketServiceId`) |
| Auchan | `*.auchan.fr` | `GET /cart` | HTML `/recherche?text=` | `POST /cart/update` | Drive / mode retrait requis ; parsing HTML fiche produit (offerId) |

Les appels partent **depuis l’onglet** (`credentials: 'include'`) : cookies + anti-bot du navigateur, pas de proxy DriveSwitch.

## Prérequis

- Node.js 18+
- Compte déjà connecté sur les enseignes (dans le navigateur)

```bash
git clone https://github.com/AnthonyMarcelin/DriveSwitch.git
cd DriveSwitch
npm install
npm run build
```

Chargez toujours le dossier **`dist/`**.

## Flux (2 onglets)

1. Onglet **source** : panier rempli, drive actif.
2. Onglet **cible** : **même type de parcours** (drive déjà sélectionné), session connectée.
3. Popup DriveSwitch → Source / Cible → **Lire & matcher**.
4. Revue : accepter / refuser / alternative.
5. **Ajouter les acceptés** → résumé OK / échecs / ignorés.

## Test local — Chrome (recommandé d’abord)

1. `npm run build`
2. `chrome://extensions` → Mode développeur → **Charger l’extension non empaquetée** → `dist/`
3. Ouvrir p.ex. Leclerc (page magasin) + Carrefour (drive choisi), paniers prêts.
4. Épingler DriveSwitch → assigner les onglets → Lire & matcher → accepter 1–2 lignes → Ajouter.
5. Vérifier le panier cible sur le site.

Si erreur rouge dans la popup : lire le message (session, drive non choisi, EAN manquant, HTTP 403…).

## Test local — Safari (Mac)

1. `npm run build`
2. Convertir :

   ```bash
   xcrun safari-web-extension-converter /chemin/vers/DriveSwitch/dist \
     --project-location ~/Developer/DriveSwitch-Safari \
     --app-name DriveSwitch \
     --bundle-identifier dev.local.DriveSwitch
   ```

3. Xcode → Run → activer l’extension (menu Développement → extensions non signées).
4. Même flux 2 onglets que Chrome.

## Firefox

`about:debugging` → module temporaire → `dist/manifest.json`.

## Architecture

```
src/adapters/
  selectors.js   Endpoints / sélecteurs centralisés
  http.js        fetch credentials + parse JSON embarqué
  errors.js      AdapterError → messages UI
  leclerc.js | carrefour.js | auchan.js
src/matching/    ReadEAN puis fuzzy
src/popup/       Revue manuelle
```

## Limites

- Pas de validation E2E connectée depuis le cloud (pas de vos sessions).
- Matching fuzzy imparfait sur MDD.
- Redesign enseigne → adapter `selectors.js` / parseurs.
- Pas de checkout, pas de stockage de mots de passe.

## Confidentialité

Aucun login stocké ni envoyé à un serveur DriveSwitch. Session = cookies du navigateur uniquement.
