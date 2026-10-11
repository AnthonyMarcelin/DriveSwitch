import { AdapterError } from './errors.js';
import { storeFetch, storeFetchText } from './http.js';
import { makeCart, normalizeLine, parseCapacity } from './helpers.js';
import { Dom, Endpoints } from './selectors.js';

/**
 * Adaptateur Auchan — /cart JSON + /cart/update + recherche HTML.
 * Respecte le contexte drive déjà choisi (offerId / seller sur la fiche produit).
 *
 * @type {import('../shared/types.js').StoreAdapter}
 */
export const auchanAdapter = {
  id: 'auchan',
  label: 'Auchan Drive',
  hostPatterns: [Endpoints.auchan.hostRe],

  detect(location = globalThis.location) {
    return this.hostPatterns.some((re) => re.test(location.hostname));
  },

  async readCart() {
    const data = await storeFetch(`${location.origin}${Endpoints.auchan.cart}`, {
      headers: { Accept: 'application/json' },
    });
    const cart = data?.cart || data;
    if (!cart) {
      throw new AdapterError('Réponse /cart Auchan inattendue.', { code: 'PARSE' });
    }

    const items = Array.isArray(cart.items) ? cart.items : [];
    lastAuchanCartId = cart.id ? String(cart.id) : lastAuchanCartId;

    const lines = items.map((item, index) => {
      const product = item.product || {};
      const name = String(product.name || item.name || 'Produit');
      const brand = product.brand?.name || product.brand;
      const qty = Number(item.desiredQuantity ?? item.offering?.actualQuantity ?? 1) || 1;
      const priceCents = Number(item.offering?.prices?.price?.amount);
      const price = Number.isFinite(priceCents) ? priceCents / 100 : undefined;
      const sku = String(product.id || item.productId || index);
      const image = Array.isArray(product.images)
        ? product.images.sort((a, b) => (a.width || 0) - (b.width || 0))[0]?.url
        : undefined;

      return normalizeLine(
        {
          id: `auchan-${item.id || sku}`,
          ref: String(item.productId || product.id || ''),
          name,
          brand: brand ? String(brand) : undefined,
          quantity: qty,
          unit: 'pièce',
          price,
          imageUrl: image,
          ...parseCapacity(name),
        },
        index,
      );
    });

    return makeCart('auchan', this.label, lines, false);
  },

  async searchProduct(query) {
    const q = [query.ean, query.brand, query.name].filter(Boolean).join(' ').trim();
    if (!q) return [];

    const url = `${location.origin}${Endpoints.auchan.search}?text=${encodeURIComponent(q)}`;
    const html = await storeFetchText(url, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });

    // Parse DOM via DOMParser (content script)
    const doc = new DOMParser().parseFromString(html, 'text/html');
    /** @type {import('../shared/types.js').ProductCandidate[]} */
    const products = [];
    const articles = doc.querySelectorAll(Dom.auchan.productArticles);

    articles.forEach((article, index) => {
      if (products.length >= 25) return;
      const link = article.querySelector(Dom.auchan.productLink) || article.querySelector('a[href]');
      const href = link?.getAttribute('href') || '';
      const skuMatch = href.match(Endpoints.auchan.productPathRe);
      if (!skuMatch && !href.includes('/pr-')) return;

      const sku = skuMatch?.[1] || `auchan-${index}`;
      const strong = article.querySelector(Dom.auchan.nameStrong);
      const name = (strong?.parentElement?.textContent || article.querySelector('p')?.textContent || sku)
        .replace(/\s+/g, ' ')
        .trim();
      const brand = strong?.textContent?.trim();
      const priceText = article.querySelector(Dom.auchan.price)?.textContent || '';
      const priceMatch = priceText.match(/(\d+[.,]\d+)\s*€/);
      const price = priceMatch ? Number(priceMatch[1].replace(',', '.')) : undefined;
      const unavailable =
        article.classList.contains('outOfStock') ||
        Boolean(article.querySelector(Dom.auchan.outOfStock)) ||
        /indisponible|bientôt dispo/i.test(article.textContent || '');

      products.push({
        id: sku,
        ref: sku,
        name: unavailable ? `${name} (indisponible)` : name,
        brand: brand || undefined,
        price,
        url: href.startsWith('http') ? href : `${location.origin}${href}`,
        stub: false,
        ...parseCapacity(name),
      });
    });

    // Fallback regex si DOMParser ne trouve rien (markup changé)
    if (!products.length) {
      const re = /href="(\/[^"]+\/pr-([A-Z0-9]+))"/g;
      let m;
      const seen = new Set();
      while ((m = re.exec(html)) && products.length < 15) {
        if (seen.has(m[2])) continue;
        seen.add(m[2]);
        products.push({
          id: m[2],
          ref: m[2],
          name: m[2],
          url: `${location.origin}${m[1]}`,
          stub: false,
        });
      }
    }

    return products;
  },

  async addToCart(product, quantity) {
    try {
      const cart = await storeFetch(`${location.origin}${Endpoints.auchan.cart}`, {
        headers: { Accept: 'application/json' },
      });
      const cartId = String(cart?.cart?.id || lastAuchanCartId || '');
      if (!cartId) {
        return {
          ok: false,
          error: 'Panier Auchan sans id — sélectionnez un drive / mode de retrait sur auchan.fr.',
        };
      }
      lastAuchanCartId = cartId;

      const sku = product.ref || product.id;
      if (!sku) return { ok: false, error: 'Produit Auchan sans SKU (pr-C…).' };

      const details = await fetchAuchanProductDetails(sku, product.url);
      if (!details.available) {
        return { ok: false, error: `Produit ${sku} indisponible sur ce drive.` };
      }

      // sellerId depuis une ligne existante du panier (même magasin)
      let sellerId = details.sellerId;
      const items = cart?.cart?.items || [];
      if (!sellerId && items[0]?.offer?.context?.seller?.id) {
        sellerId = String(items[0].offer.context.seller.id);
      }

      const consentId = crypto.randomUUID?.() || `ds-${Date.now()}`;
      const body = {
        cartId,
        consentId,
        reservationId: null,
        mbaAvailabilityNeeded: true,
        items: [
          {
            productId: details.productId,
            offerId: details.offerId || '',
            sellerType: details.sellerType || 'GROCERY',
            desiredQuantity: Math.max(1, Number(quantity) || 1),
            desiredType: 'DEFAULT',
            sellerId: sellerId || '',
          },
        ],
      };

      await storeFetch(`${location.origin}${Endpoints.auchan.cartUpdate}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/500|server error/i.test(msg)) {
        return {
          ok: false,
          error: 'Auchan a refusé l’ajout (souvent : drive/mode de retrait non choisi).',
        };
      }
      return { ok: false, error: msg };
    }
  },
};

/** @type {string | null} */
let lastAuchanCartId = null;

/**
 * @param {string} sku
 * @param {string} [knownUrl]
 */
async function fetchAuchanProductDetails(sku, knownUrl) {
  let productUrl = knownUrl;
  if (!productUrl || !productUrl.includes('/pr-')) {
    const searchHtml = await storeFetchText(
      `${location.origin}${Endpoints.auchan.search}?text=${encodeURIComponent(sku)}`,
      { headers: { Accept: 'text/html' } },
    );
    const re = new RegExp(`href="(/[^"]+/pr-${escapeRegExp(sku)})"`, 'i');
    const m = searchHtml.match(re);
    if (!m) {
      throw new AdapterError(`Produit Auchan ${sku} introuvable dans la recherche du drive.`, {
        code: 'NOT_FOUND',
      });
    }
    productUrl = `${location.origin}${m[1]}`;
  } else if (productUrl.startsWith('/')) {
    productUrl = `${location.origin}${productUrl}`;
  }

  const html = await storeFetchText(productUrl, { headers: { Accept: 'text/html' } });
  const productId =
    html.match(/"productId"\s*:\s*"([a-f0-9-]{36})"/i)?.[1] ||
    html.match(/data-product-id="([a-f0-9-]{36})"/i)?.[1];
  if (!productId) {
    throw new AdapterError(`UUID produit introuvable sur ${productUrl}`, { code: 'PARSE' });
  }

  const offerId =
    html.match(new RegExp(`data-current-offer-id="([^"]+)"[^>]*data-id="${productId}"`))?.[1] ||
    html.match(new RegExp(`data-product-id="${productId}"[^>]*data-offer-id="([^"]+)"`))?.[1] ||
    html.match(/data-current-offer-id="([^"]+)"/)?.[1] ||
    '';

  const sellerType =
    html.match(/data-current-seller-type="([^"]+)"/)?.[1] || 'GROCERY';

  const available = !(
    html.includes('product-unavailable__overlay') ||
    html.includes('product-unavailable__message')
  );

  return {
    productId,
    offerId,
    sellerType,
    sellerId: '',
    available,
  };
}

/** @param {string} s */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
