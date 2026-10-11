/**
 * Types partagés (JSDoc) — contrat stable pour adaptateurs et matching.
 *
 * @typedef {'leclerc' | 'carrefour' | 'auchan' | 'unknown'} StoreId
 *
 * @typedef {Object} CartLine
 * @property {string} id
 * @property {string} name
 * @property {string} [brand]
 * @property {number} quantity
 * @property {string} [unit]
 * @property {number} [price]
 * @property {string} [ean]
 * @property {string} [ref]
 * @property {string} [url]
 * @property {string} [imageUrl]
 * @property {number} [capacityValue]
 * @property {string} [capacityUnit]
 *
 * @typedef {Object} Cart
 * @property {StoreId} storeId
 * @property {string} storeLabel
 * @property {CartLine[]} lines
 * @property {string} [currency]
 * @property {boolean} stub
 *
 * @typedef {Object} ProductCandidate
 * @property {string} id
 * @property {string} name
 * @property {string} [brand]
 * @property {string} [ean]
 * @property {string} [ref]
 * @property {string} [url]
 * @property {number} [price]
 * @property {string} [unit]
 * @property {number} [capacityValue]
 * @property {string} [capacityUnit]
 * @property {boolean} [stub]
 *
 * @typedef {'ean' | 'fuzzy' | 'none'} MatchMethod
 *
 * @typedef {Object} MatchResult
 * @property {CartLine} source
 * @property {ProductCandidate | null} best
 * @property {ProductCandidate[]} alternatives
 * @property {MatchMethod} method
 * @property {number} score
 * @property {'high' | 'review' | 'missing'} confidence
 *
 * @typedef {'pending' | 'accepted' | 'rejected' | 'ignored'} ReviewDecision
 *
 * @typedef {Object} ReviewItem
 * @property {MatchResult} match
 * @property {ReviewDecision} decision
 * @property {ProductCandidate | null} chosen
 *
 * @typedef {Object} TransferState
 * @property {number | null} sourceTabId
 * @property {number | null} targetTabId
 * @property {StoreId | null} sourceStoreId
 * @property {StoreId | null} targetStoreId
 * @property {Cart | null} sourceCart
 * @property {ReviewItem[]} review
 * @property {'idle' | 'reading' | 'matching' | 'review' | 'adding' | 'done' | 'error'} phase
 * @property {string | null} error
 * @property {{ ok: number, failed: number, skipped: number } | null} summary
 *
 * @typedef {Object} StoreAdapter
 * @property {StoreId} id
 * @property {string} label
 * @property {RegExp[]} hostPatterns
 * @property {(location?: Location) => boolean} detect
 * @property {() => Promise<Cart>} readCart
 * @property {(query: { name: string, brand?: string, ean?: string, ref?: string }) => Promise<ProductCandidate[]>} searchProduct
 * @property {(product: ProductCandidate, quantity: number) => Promise<{ ok: boolean, error?: string }>} addToCart
 */

export {};
