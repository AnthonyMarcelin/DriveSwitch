import { leclercAdapter } from './leclerc.js';
import { carrefourAdapter } from './carrefour.js';
import { auchanAdapter } from './auchan.js';

/** @type {import('../shared/types.js').StoreAdapter[]} */
export const adapters = [leclercAdapter, carrefourAdapter, auchanAdapter];

/** @param {string} [hostname] */
export function adapterForHost(hostname = globalThis.location?.hostname ?? '') {
  const host = String(hostname).toLowerCase();
  return adapters.find((a) => a.hostPatterns.some((re) => re.test(host))) ?? null;
}

/** @param {import('../shared/types.js').StoreId} id */
export function adapterById(id) {
  return adapters.find((a) => a.id === id) ?? null;
}

/** @param {string} [hostname] */
export function detectStore(hostname) {
  const adapter = adapterForHost(hostname);
  if (!adapter) {
    return { storeId: 'unknown', storeLabel: 'Inconnu', supported: false };
  }
  return { storeId: adapter.id, storeLabel: adapter.label, supported: true };
}
