/**
 * Endpoints / motifs centralisés — à ajuster si un site redesign.
 * Les adaptateurs ne doivent pas hardcoder d’autres URLs sans passer ici.
 */
export const Endpoints = Object.freeze({
  leclerc: {
    searchPath: (magasinBase, q) =>
      `${magasinBase}/recherche.aspx?TexteRecherche=${encodeURIComponent(q ?? '')}`,
    cartPostPath: (magasinBase) => `${magasinBase}/panier.aspx?op=1`,
    magasinPathRe: /\/magasin-(\d+)(?:-\d+)?(?:-[^/]+)?/i,
    hostRe: /leclercdrive\.fr$/i,
  },
  carrefour: {
    cart: '/api/cart',
    search: '/s',
    productsByGtin: '/products',
    hostRe: /carrefour\.fr$/i,
  },
  auchan: {
    cart: '/cart',
    cartUpdate: '/cart/update',
    search: '/recherche',
    userInfo: '/auth/user-info',
    productPathRe: /\/pr-([A-Z0-9]+)/i,
    hostRe: /auchan\.fr$/i,
  },
});

/** Sélecteurs DOM de secours (si API HTML / SPA). */
export const Dom = Object.freeze({
  auchan: {
    productArticles: 'article[class*="product"], article.product-thumbnail, article',
    productLink: 'a[href*="/pr-"]',
    nameStrong: 'p strong',
    price: '[class*="price"]',
    outOfStock: '.outOfStock, [class*="outOfStock"]',
  },
  carrefour: {
    productCard: '[data-testid="product-card"], article[data-product-ean]',
  },
  leclerc: {},
});
