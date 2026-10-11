import { firstMatch, makeCart, normalizeLine, parseCapacity } from './helpers.js';

/** @type {import('../shared/types.js').StoreAdapter} */
export const auchanAdapter = {
  id: 'auchan',
  label: 'Auchan Drive',
  hostPatterns: [/auchan\.fr$/i],

  detect(location = globalThis.location) {
    return this.hostPatterns.some((re) => re.test(location.hostname));
  },

  async readCart() {
    firstMatch(document, [
      '[data-testid="basket"]',
      '.basket',
      '[class*="panier"]',
      '#basket',
    ]);

    const demo = [
      normalizeLine(
        {
          name: 'Beurre doux 250g',
          brand: 'Président',
          quantity: 1,
          unit: 'pièce',
          price: 2.55,
          ...parseCapacity('250g'),
        },
        0,
      ),
      normalizeLine(
        {
          name: 'Jus d’orange 1L',
          brand: 'Tropicana',
          quantity: 2,
          unit: 'pièce',
          price: 2.99,
          ean: '3502110009449',
          ...parseCapacity('1L'),
        },
        1,
      ),
    ];

    return makeCart('auchan', this.label, demo, true);
  },

  async searchProduct(query) {
    return [
      {
        id: `auchan-stub-${query.ean ?? query.name}`,
        name: `[Stub Auchan] ${query.name}`,
        brand: query.brand,
        ean: query.ean,
        stub: true,
      },
    ];
  },

  async addToCart(product, quantity) {
    console.info('[DriveSwitch][auchan] addToCart stub', product, quantity);
    return {
      ok: false,
      error: 'addToCart Auchan non branché (stub) — à implémenter après inspection DOM.',
    };
  },
};
