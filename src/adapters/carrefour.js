import { AdapterError } from './errors.js';
import { storeFetch } from './http.js';
import { makeCart, normalizeEan, normalizeLine, parseCapacity } from './helpers.js';
import { Endpoints } from './selectors.js';

/**
 * Adaptateur Carrefour — API privée du site (session cookie onglet).
 *
 * @type {import('../shared/types.js').StoreAdapter}
 */
export const carrefourAdapter = {
  id: 'carrefour',
  label: 'Carrefour Drive',
  hostPatterns: [Endpoints.carrefour.hostRe],

  detect(location = globalThis.location) {
    return this.hostPatterns.some((re) => re.test(location.hostname));
  },

  async readCart() {
    const data = await storeFetch(`${location.origin}${Endpoints.carrefour.cart}`);
    const ctx = extractCarrefourBasketContext(data);
    if (!ctx.basketServiceId) {
      throw new AdapterError(
        'Aucun drive / service panier détecté dans /api/cart. Choisissez un magasin Drive sur carrefour.fr puis réessayez.',
        { code: 'NO_STORE' },
      );
    }

    const items = collectCarrefourItems(data);
    const lines = items.map((item, index) => {
      const ean = normalizeEan(item.ean || item.gtin || item.barcode);
      const name = String(item.name || item.label || item.title || 'Produit');
      const qty = Number(item.quantity ?? item.qty ?? item.counter ?? 1) || 1;
      const price = Number(item.price ?? item.unit_price ?? item.unitPrice);
      return normalizeLine(
        {
          id: `carrefour-${ean || item.id || index}`,
          ref: String(item.id || ean || index),
          name,
          brand: item.brand ? String(item.brand) : undefined,
          quantity: qty,
          unit: 'pièce',
          price: Number.isFinite(price) ? price : undefined,
          ean,
          url: item.url ? String(item.url) : undefined,
          imageUrl: item.image || item.image_url,
          ...parseCapacity(name),
        },
        index,
      );
    });

    // Stocker le contexte drive pour addToCart (session courte en mémoire module)
    lastCarrefourContext = ctx;
    return makeCart('carrefour', this.label, lines, false);
  },

  async searchProduct(query) {
    const ctx = lastCarrefourContext || (await warmCarrefourContext());
    const q = [query.ean, query.brand, query.name].filter(Boolean).join(' ').trim();
    if (!q) return [];

    // Priorité EAN via /products si disponible
    if (query.ean && normalizeEan(query.ean)) {
      try {
        const byGtin = await storeFetch(`${location.origin}${Endpoints.carrefour.productsByGtin}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gtins: [normalizeEan(query.ean)],
            facilityServiceId: ctx.basketServiceId,
          }),
        });
        const mapped = mapCarrefourSearchPayload(byGtin, ctx);
        if (mapped.length) return mapped;
      } catch {
        /* fallback search text */
      }
    }

    const url = new URL(`${location.origin}${Endpoints.carrefour.search}`);
    url.searchParams.set('q', q);
    url.searchParams.set('page', '1');
    const data = await storeFetch(url.toString());
    return mapCarrefourSearchPayload(data, ctx);
  },

  async addToCart(product, quantity) {
    const ctx = lastCarrefourContext || (await warmCarrefourContext());
    const ean = normalizeEan(product.ean) || normalizeEan(product.id);
    if (!ean) {
      return {
        ok: false,
        error: 'Ajout Carrefour nécessite un EAN (absent sur ce candidat). Choisissez une alternative avec code-barres.',
      };
    }
    if (!ctx.basketServiceId || !ctx.subBasketType) {
      return {
        ok: false,
        error: 'Contexte Drive manquant (basketServiceId). Sélectionnez un drive sur carrefour.fr.',
      };
    }

    try {
      await storeFetch(`${location.origin}${Endpoints.carrefour.cart}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingRequest: { pageType: 'search', pageId: 'driveswitch' },
          items: [
            {
              ean,
              counter: Math.max(1, Number(quantity) || 1),
              basketServiceId: ctx.basketServiceId,
              subBasketType: ctx.subBasketType,
            },
          ],
        }),
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

/** @type {{ basketServiceId?: string, subBasketType?: string } | null} */
let lastCarrefourContext = null;

async function warmCarrefourContext() {
  const data = await storeFetch(`${location.origin}${Endpoints.carrefour.cart}`);
  const ctx = extractCarrefourBasketContext(data);
  if (!ctx.basketServiceId) {
    throw new AdapterError(
      'Choisissez d’abord un Drive sur carrefour.fr (panier /api/cart sans service).',
      { code: 'NO_STORE' },
    );
  }
  lastCarrefourContext = ctx;
  return ctx;
}

/**
 * @param {unknown} data
 * @returns {{ basketServiceId?: string, subBasketType?: string }}
 */
function extractCarrefourBasketContext(data) {
  const flat = flattenObjects(data);
  /** @type {string | undefined} */
  let basketServiceId;
  /** @type {string | undefined} */
  let subBasketType;

  for (const obj of flat) {
    if (!basketServiceId) {
      const v =
        obj.basketServiceId ||
        obj.basket_service_id ||
        obj.facilityServiceId ||
        obj.facility_service_id ||
        obj.service_id;
      if (typeof v === 'string' && v.includes('-')) basketServiceId = v;
    }
    if (!subBasketType) {
      const t = obj.subBasketType || obj.sub_basket_type || obj.type;
      if (typeof t === 'string' && /drive|clcv|delivery|lex/i.test(t)) {
        subBasketType = t;
      }
    }
  }

  // Défaut Drive click & collect si service trouvé sans type
  if (basketServiceId && !subBasketType) subBasketType = 'drive_clcv';
  return { basketServiceId, subBasketType };
}

/**
 * @param {unknown} data
 * @returns {Record<string, any>[]}
 */
function collectCarrefourItems(data) {
  const items = [];
  const flat = flattenObjects(data);
  for (const obj of flat) {
    const ean = obj.ean || obj.gtin || obj.barcode;
    const name = obj.name || obj.label || obj.title || obj.product_name;
    const qty = obj.quantity ?? obj.qty ?? obj.counter;
    if ((ean || name) && qty != null) {
      // Éviter les objets panier racine
      if (obj.sub_baskets || obj.subBaskets) continue;
      items.push(obj);
    }
  }
  // Dédupliquer par ean+name
  const seen = new Set();
  return items.filter((it) => {
    const key = `${it.ean || ''}|${it.name || it.title || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {unknown} data
 * @param {{ basketServiceId?: string, subBasketType?: string }} ctx
 * @returns {import('../shared/types.js').ProductCandidate[]}
 */
function mapCarrefourSearchPayload(data, ctx) {
  const products = [];
  const flat = flattenObjects(data);
  for (const obj of flat) {
    const ean = normalizeEan(obj.ean || obj.gtin || obj.barcode || obj.id);
    const name = obj.name || obj.label || obj.title || obj.product_name;
    if (!name && !ean) continue;
    // Filtrer bruit (facets, etc.)
    if (obj.facet || obj.facets || obj.pagination) continue;
    if (typeof name === 'string' && name.length < 2) continue;

    const price = Number(obj.price ?? obj.price_float ?? obj.unit_price ?? obj.sellingPrice);
    const id = ean || String(obj.id || obj.slug || name).slice(0, 64);
    products.push({
      id,
      ean: ean || undefined,
      name: String(name || ean),
      brand: obj.brand ? String(obj.brand.name || obj.brand) : undefined,
      price: Number.isFinite(price) ? price : undefined,
      url: obj.url || obj.link || (obj.slug ? `/p/${obj.slug}` : undefined),
      imageUrl: pickImage(obj),
      basketServiceId: ctx.basketServiceId,
      subBasketType: ctx.subBasketType,
      stub: false,
      ...parseCapacity(String(name || '')),
    });
  }

  const seen = new Set();
  return products.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  }).slice(0, 25);
}

/** @param {Record<string, any>} obj */
function pickImage(obj) {
  if (typeof obj.image === 'string') return obj.image;
  if (typeof obj.image_url === 'string') return obj.image_url;
  if (Array.isArray(obj.images) && obj.images[0]) {
    return obj.images[0].url || obj.images[0];
  }
  return undefined;
}

/**
 * Parcourt récursivement un JSON et collecte les objets plats.
 * @param {unknown} node
 * @param {Record<string, any>[]} [acc]
 */
function flattenObjects(node, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const item of node) flattenObjects(item, acc);
    return acc;
  }
  acc.push(/** @type {Record<string, any>} */ (node));
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') flattenObjects(value, acc);
  }
  return acc;
}
