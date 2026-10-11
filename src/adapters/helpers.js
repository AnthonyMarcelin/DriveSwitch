/**
 * @param {Partial<import('../shared/types.js').CartLine> & { name: string }} partial
 * @param {number} index
 * @returns {import('../shared/types.js').CartLine}
 */
export function normalizeLine(partial, index = 0) {
  return {
    id: partial.id ?? `line-${index}-${slug(partial.name)}`,
    name: partial.name.trim(),
    brand: partial.brand?.trim() || undefined,
    quantity: Number.isFinite(partial.quantity) ? Number(partial.quantity) : 1,
    unit: partial.unit,
    price: partial.price,
    ean: normalizeEan(partial.ean),
    ref: partial.ref,
    url: partial.url,
    imageUrl: partial.imageUrl,
    capacityValue: partial.capacityValue,
    capacityUnit: partial.capacityUnit,
  };
}

/** @param {string} [ean] */
export function normalizeEan(ean) {
  if (!ean) return undefined;
  const digits = String(ean).replace(/\D/g, '');
  if (digits.length === 8 || digits.length === 13) return digits;
  return undefined;
}

/** @param {string} text */
function slug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** @param {string} text */
export function parseCapacity(text) {
  const m = String(text).match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl)\b/i);
  if (!m) return {};
  return {
    capacityValue: Number(m[1].replace(',', '.')),
    capacityUnit: m[2].toLowerCase(),
  };
}

/** @param {ParentNode} root @param {string[]} selectors */
export function firstMatch(root, selectors) {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * @param {import('../shared/types.js').StoreId} storeId
 * @param {string} storeLabel
 * @param {import('../shared/types.js').CartLine[]} lines
 * @param {boolean} stub
 */
export function makeCart(storeId, storeLabel, lines, stub = false) {
  return { storeId, storeLabel, lines, currency: 'EUR', stub };
}
