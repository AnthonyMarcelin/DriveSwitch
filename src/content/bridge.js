import { Msg } from '../shared/messages.js';
import { adapterForHost, detectStore } from '../adapters/registry.js';

const adapter = adapterForHost(location.hostname);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((err) =>
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  return true;
});

/** @param {{ type: string, payload?: Record<string, unknown> }} message */
async function handle(message) {
  switch (message.type) {
    case Msg.PING:
      return { ok: true, pong: true, href: location.href };

    case Msg.DETECT_STORE:
      return { ok: true, ...detectStore(location.hostname) };

    case Msg.READ_CART: {
      if (!adapter) {
        return { ok: false, error: `Aucun adaptateur pour ${location.hostname}` };
      }
      const cart = await adapter.readCart();
      return { ok: true, cart };
    }

    case Msg.SEARCH_PRODUCT: {
      if (!adapter) {
        return { ok: false, error: `Aucun adaptateur pour ${location.hostname}` };
      }
      const query = /** @type {{ name: string, brand?: string, ean?: string, ref?: string }} */ (
        message.payload ?? { name: '' }
      );
      const products = await adapter.searchProduct(query);
      return { ok: true, products };
    }

    case Msg.ADD_TO_CART: {
      if (!adapter) {
        return { ok: false, error: `Aucun adaptateur pour ${location.hostname}` };
      }
      const { product, quantity } = /** @type {{ product: import('../shared/types.js').ProductCandidate, quantity: number }} */ (
        message.payload ?? {}
      );
      if (!product) return { ok: false, error: 'Produit manquant' };
      const result = await adapter.addToCart(product, quantity ?? 1);
      return { ok: result.ok, error: result.error };
    }

    default:
      return { ok: false, error: `Message inconnu: ${message.type}` };
  }
}

console.info(
  `[DriveSwitch] content prêt sur ${location.hostname}`,
  adapter ? `(${adapter.id})` : '(enseigne non supportée)',
);
