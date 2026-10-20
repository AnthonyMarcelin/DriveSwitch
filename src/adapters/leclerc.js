import { AdapterError } from './errors.js';
import {
  extractJsonArrayAfterKey,
  extractJsonObjectsWithKey,
  sleep,
  storeFetchText,
} from './http.js';
import { makeCart, normalizeLine, parseCapacity } from './helpers.js';
import { Endpoints } from './selectors.js';

/**
 * Adaptateur E.Leclerc Drive — session navigateur (cookies + DataDome OK).
 * Sources : endpoints ASP.NET magasin (search HTML + panier.aspx).
 *
 * @type {import('../shared/types.js').StoreAdapter}
 */
export const leclercAdapter = {
  id: 'leclerc',
  label: 'E.Leclerc Drive',
  hostPatterns: [Endpoints.leclerc.hostRe],

  detect(location = globalThis.location) {
    return this.hostPatterns.some((re) => re.test(location.hostname));
  },

  async readCart() {
    const ctx = resolveLeclercContext();
    const html = await storeFetchText(
      `${ctx.origin}${Endpoints.leclerc.searchPath(ctx.magasinBase, '')}`,
    );
    assertNotSessionExpired(html);
    const rows = extractJsonArrayAfterKey(html, 'lstProduits') ?? [];
    if (!rows.length) {
      // Panier vide possible — distinguer d’un parse raté
      const light = extractJsonArrayAfterKey(html, 'lstProduitsLight');
      if (light && light.length === 0) {
        return makeCart('leclerc', this.label, [], false);
      }
      if (!light) {
        throw new AdapterError(
          'Panier Leclerc introuvable dans la page. Ouvrez une page du drive déjà choisi (URL …/magasin-XXXXX-…/).',
          { code: 'PARSE' },
        );
      }
    }

    const lines = rows
      .map((raw, index) => mapLeclercProduct(/** @type {Record<string, unknown>} */ (raw), index))
      .filter((l) => l.quantity > 0);

    return makeCart('leclerc', this.label, lines, false);
  },

  async searchProduct(query) {
    const ctx = resolveLeclercContext();
    const q = [query.ean, query.brand, query.name].filter(Boolean).join(' ').trim();
    if (!q) return [];

    const html = await storeFetchText(
      `${ctx.origin}${Endpoints.leclerc.searchPath(ctx.magasinBase, q)}`,
    );
    assertNotSessionExpired(html);
    const objs = extractJsonObjectsWithKey(html, 'iIdProduit', 30);
    return objs
      .map((obj) => toCandidate(obj, ctx))
      .filter((c) => c.id);
  },

  async addToCart(product, quantity) {
    const ctx = resolveLeclercContext();
    const productId = product.ref || product.id;
    if (!productId || String(productId).startsWith('leclerc-stub')) {
      return { ok: false, error: 'Produit Leclerc sans iIdProduit valide.' };
    }

    await sleep(350 + Math.floor(Math.random() * 250));

    const payload = {
      eTypeAction: 1,
      iIdProduit: String(productId),
      iQuantite: Math.max(1, Number(quantity) || 1),
      sNoPointLivraison: ctx.storeId,
    };

    const body = new URLSearchParams({ d: JSON.stringify(payload) });
    const url = `${ctx.origin}${Endpoints.leclerc.cartPostPath(ctx.magasinBase)}`;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json, text/javascript, */*; q=0.01',
        },
        body,
      });
    } catch (cause) {
      return { ok: false, error: `Réseau Leclerc: ${String(cause)}` };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: `Ajout Leclerc HTTP ${res.status}${res.status === 403 ? ' (DataDome ?) — ralentissez / rechargez le site' : ''}`,
      };
    }

    const text = await res.text();
    try {
      const events = JSON.parse(text);
      if (!Array.isArray(events)) {
        return { ok: false, error: 'Réponse panier Leclerc inattendue.' };
      }
      const panierEvent = events.find(
        (e) => typeof e?.sIdUnique === 'string' && String(e.sIdUnique).startsWith('Panier'),
      );
      if (!panierEvent) {
        return { ok: false, error: 'Ajout Leclerc sans confirmation Panier{store}.' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Réponse panier Leclerc non JSON.' };
    }
  },
};

function resolveLeclercContext() {
  const { origin, pathname, href } = location;
  let match = pathname.match(Endpoints.leclerc.magasinPathRe);
  if (!match) {
    const link = document.querySelector('a[href*="/magasin-"]');
    const hrefAttr = link?.getAttribute('href') || '';
    match = hrefAttr.match(Endpoints.leclerc.magasinPathRe);
  }
  if (!match) {
    throw new AdapterError(
      `Drive Leclerc non détecté dans l’URL (${href}). Ouvrez le catalogue du magasin (chemin /magasin-XXXXX-XXXXX/).`,
      { code: 'NO_STORE' },
    );
  }
  const storeId = match[1];
  const magasinBase = `/magasin-${storeId}-${storeId}`;
  return { origin, storeId, magasinBase };
}

/** @param {string} html */
function assertNotSessionExpired(html) {
  if (/session expirée|votre session a expiré/i.test(html)) {
    throw new AdapterError(
      'Session Leclerc expirée. Rechargez le drive dans l’onglet puis réessayez.',
      { code: 'AUTH' },
    );
  }
}

/**
 * @param {Record<string, unknown>} raw
 * @param {number} index
 */
function mapLeclercProduct(raw, index) {
  const name = [raw.sLibelleLigne1, raw.sLibelleLigne2].filter(Boolean).join(' ').trim() || 'Produit';
  const qty = Number(raw.iQuantitePanier ?? raw.iQtePanier ?? 1) || 1;
  const price = Number(raw.nrPVUnitaireTTC);
  const id = String(raw.iIdProduit ?? `line-${index}`);
  return normalizeLine(
    {
      id: `leclerc-${id}`,
      ref: String(raw.iIdProduit ?? ''),
      name,
      quantity: qty,
      unit: 'pièce',
      price: Number.isFinite(price) ? price : undefined,
      imageUrl: typeof raw.sUrlVignetteProduit === 'string' ? raw.sUrlVignetteProduit : undefined,
      ...parseCapacity(name),
    },
    index,
  );
}

/**
 * @param {Record<string, unknown>} obj
 * @param {{ storeId: string }} ctx
 * @returns {import('../shared/types.js').ProductCandidate}
 */
function toCandidate(obj, ctx) {
  const id = String(obj.iIdProduit ?? '');
  const name = [obj.sLibelleLigne1, obj.sLibelleLigne2].filter(Boolean).join(' ').trim() || id;
  const price = Number(obj.nrPVUnitaireTTC);
  const available = Number(obj.iQteDisponible ?? 1) > 0;
  return {
    id,
    ref: id,
    name: available ? name : `${name} (indisponible)`,
    price: Number.isFinite(price) ? price : undefined,
    imageUrl: typeof obj.sUrlVignetteProduit === 'string' ? obj.sUrlVignetteProduit : undefined,
    ...parseCapacity(name),
    // contexte magasin courant
    basketServiceId: ctx.storeId,
    stub: false,
  };
}
