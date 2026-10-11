import { firstMatch, makeCart, normalizeLine, parseCapacity } from './helpers.js';

/** @type {import('../shared/types.js').StoreAdapter} */
export const carrefourAdapter = {
  id: 'carrefour',
  label: 'Carrefour Drive',
  hostPatterns: [/carrefour\.fr$/i],

  detect(location = globalThis.location) {
    return this.hostPatterns.some((re) => re.test(location.hostname));
  },

  async readCart() {
    firstMatch(document, [
      '[data-testid="cart-page"]',
      '[class*="Cart"]',
      '#cart',
      'main[class*="basket"]',
    ]);

    const demo = [
      normalizeLine(
        {
          name: 'Eau minérale 6x1,5L',
          brand: 'Cristaline',
          quantity: 1,
          unit: 'pièce',
          price: 2.1,
          ean: '3274080005003',
          ...parseCapacity('1,5L'),
        },
        0,
      ),
      normalizeLine(
        {
          name: 'Café moulu 250g',
          brand: 'Carte Noire',
          quantity: 1,
          unit: 'pièce',
          price: 3.89,
          ...parseCapacity('250g'),
        },
        1,
      ),
    ];

    return makeCart('carrefour', this.label, demo, true);
  },

  async searchProduct(query) {
    return [
      {
        id: `carrefour-stub-${query.ean ?? query.name}`,
        name: `[Stub Carrefour] ${query.name}`,
        brand: query.brand,
        ean: query.ean,
        stub: true,
      },
    ];
  },

  async addToCart(product, quantity) {
    console.info('[DriveSwitch][carrefour] addToCart stub', product, quantity);
    return {
      ok: false,
      error: 'addToCart Carrefour non branché (stub) — à implémenter après inspection DOM.',
    };
  },
};
