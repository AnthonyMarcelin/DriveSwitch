import { firstMatch, makeCart, normalizeLine, parseCapacity } from './helpers.js';

/** @type {import('../shared/types.js').StoreAdapter} */
export const leclercAdapter = {
  id: 'leclerc',
  label: 'E.Leclerc Drive',
  hostPatterns: [/leclercdrive\.fr$/i],

  detect(location = globalThis.location) {
    return this.hostPatterns.some((re) => re.test(location.hostname));
  },

  async readCart() {
    firstMatch(document, [
      '[data-testid="cart"]',
      '.panier',
      '#panier',
      '[class*="cart"]',
      '[class*="Basket"]',
    ]);

    const demo = [
      normalizeLine(
        {
          name: 'Lait demi-écrémé 1L',
          brand: 'Lactel',
          quantity: 2,
          unit: 'pièce',
          price: 1.15,
          ean: '3451790011412',
          ...parseCapacity('1L'),
        },
        0,
      ),
      normalizeLine(
        {
          name: 'Pâtes penne 500g',
          brand: 'Panzani',
          quantity: 1,
          unit: 'pièce',
          price: 1.49,
          ...parseCapacity('500g'),
        },
        1,
      ),
      normalizeLine(
        {
          name: 'Yaourt nature x8',
          brand: 'Danone',
          quantity: 1,
          unit: 'pièce',
          price: 2.35,
        },
        2,
      ),
    ];

    return makeCart('leclerc', this.label, demo, true);
  },

  async searchProduct(query) {
    const label = query.ean ? `${query.name} (EAN ${query.ean})` : query.name;
    return [
      {
        id: `leclerc-stub-${slugId(query)}`,
        name: `[Stub Leclerc] ${label}`,
        brand: query.brand,
        ean: query.ean,
        stub: true,
      },
    ];
  },

  async addToCart(product, quantity) {
    console.info('[DriveSwitch][leclerc] addToCart stub', product, quantity);
    return {
      ok: false,
      error: 'addToCart Leclerc non branché (stub) — à implémenter après inspection DOM.',
    };
  },
};

/** @param {{ name?: string, ean?: string }} q */
function slugId(q) {
  return `${q.ean ?? 'x'}-${(q.name ?? 'item').slice(0, 24)}`.replace(/\s+/g, '-');
}
