import { AdapterError, assertOk } from './errors.js';

const DEFAULT_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'X-Requested-With': 'XMLHttpRequest',
};

/**
 * fetch same-origin / enseigne avec cookies de session du navigateur.
 * @param {string} url
 * @param {RequestInit & { expectJson?: boolean }} [opts]
 */
export async function storeFetch(url, opts = {}) {
  const { expectJson = true, headers, ...rest } = opts;
  let res;
  try {
    res = await fetch(url, {
      credentials: 'include',
      ...rest,
      headers: {
        ...DEFAULT_HEADERS,
        ...(headers || {}),
      },
    });
  } catch (cause) {
    throw new AdapterError(`Réseau inaccessible (${url})`, { code: 'NETWORK', cause });
  }
  await assertOk(res, url);
  if (!expectJson) return res.text();
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new AdapterError(`Réponse JSON invalide pour ${url}`, { code: 'PARSE', cause });
  }
}

/**
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<string>}
 */
export async function storeFetchText(url, opts = {}) {
  return /** @type {Promise<string>} */ (
    storeFetch(url, {
      ...opts,
      expectJson: false,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json',
        ...(opts.headers || {}),
      },
    })
  );
}

/**
 * Pause courte pour éviter le rate-limit / DataDome (Leclerc).
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Extrait le premier tableau JSON équilibré après une clé `"key":`.
 * @param {string} html
 * @param {string} key
 * @returns {unknown[] | null}
 */
export function extractJsonArrayAfterKey(html, key) {
  const needle = `"${key}"`;
  let from = 0;
  while (from < html.length) {
    const idx = html.indexOf(needle, from);
    if (idx < 0) return null;
    let i = idx + needle.length;
    while (i < html.length && /[\s:]/.test(html[i])) i += 1;
    if (html[i] !== '[') {
      from = idx + 1;
      continue;
    }
    const arr = extractBalanced(html, i, '[', ']');
    if (arr) {
      try {
        return JSON.parse(arr);
      } catch {
        from = idx + 1;
        continue;
      }
    }
    from = idx + 1;
  }
  return null;
}

/**
 * Objets JSON contenant une clé donnée (ex. iIdProduit).
 * @param {string} html
 * @param {string} key
 * @param {number} [limit]
 * @returns {Record<string, unknown>[]}
 */
export function extractJsonObjectsWithKey(html, key, limit = 40) {
  const needle = `"${key}"`;
  /** @type {Record<string, unknown>[]} */
  const out = [];
  const seen = new Set();
  let from = 0;
  while (from < html.length && out.length < limit) {
    const idx = html.indexOf(needle, from);
    if (idx < 0) break;
    // Remonter au `{` le plus proche plausible
    let start = idx;
    while (start > 0 && html[start] !== '{') start -= 1;
    if (html[start] !== '{') {
      from = idx + 1;
      continue;
    }
    const raw = extractBalanced(html, start, '{', '}');
    from = idx + needle.length;
    if (!raw) continue;
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object' || !(key in obj)) continue;
      const id = String(obj[key]);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(obj);
    } catch {
      /* ignore malformed slice */
    }
  }
  return out;
}

/**
 * @param {string} text
 * @param {number} openIdx
 * @param {string} open
 * @param {string} close
 */
function extractBalanced(text, openIdx, open, close) {
  if (text[openIdx] !== open) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}
