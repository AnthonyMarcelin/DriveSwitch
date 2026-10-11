const HIGH_EAN = 1;
const HIGH_FUZZY = 0.82;
const REVIEW_FUZZY = 0.45;

/**
 * @param {import('../shared/types.js').CartLine} source
 * @param {import('../shared/types.js').ProductCandidate[]} candidates
 * @returns {import('../shared/types.js').MatchResult}
 */
export function matchLine(source, candidates) {
  if (!candidates?.length) {
    return {
      source,
      best: null,
      alternatives: [],
      method: 'none',
      score: 0,
      confidence: 'missing',
    };
  }

  if (source.ean) {
    const eanHit = candidates.find((c) => c.ean && c.ean === source.ean);
    if (eanHit) {
      return {
        source,
        best: eanHit,
        alternatives: candidates.filter((c) => c !== eanHit).slice(0, 4),
        method: 'ean',
        score: HIGH_EAN,
        confidence: 'high',
      };
    }
  }

  const scored = candidates
    .map((c) => ({ candidate: c, score: fuzzyScore(source, c) }))
    .sort((a, b) => b.score - a.score);

  const bestScore = scored[0]?.score ?? 0;
  const best = bestScore >= REVIEW_FUZZY ? scored[0].candidate : null;
  const alternatives = scored
    .filter((s) => s.candidate !== best)
    .slice(0, 4)
    .map((s) => s.candidate);

  let confidence = 'missing';
  if (best && bestScore >= HIGH_FUZZY) confidence = 'high';
  else if (best) confidence = 'review';

  return {
    source,
    best,
    alternatives,
    method: best ? 'fuzzy' : 'none',
    score: bestScore,
    confidence,
  };
}

/**
 * @param {import('../shared/types.js').CartLine[]} lines
 * @param {(line: import('../shared/types.js').CartLine) => Promise<import('../shared/types.js').ProductCandidate[]>} searchFn
 */
export async function matchCart(lines, searchFn) {
  /** @type {import('../shared/types.js').MatchResult[]} */
  const results = [];
  for (const line of lines) {
    const candidates = await searchFn(line);
    results.push(matchLine(line, candidates));
  }
  return results;
}

/**
 * @param {import('../shared/types.js').CartLine} source
 * @param {import('../shared/types.js').ProductCandidate} candidate
 */
function fuzzyScore(source, candidate) {
  const nameScore = tokenJaccard(source.name, candidate.name);
  const brandScore =
    source.brand && candidate.brand
      ? tokenJaccard(source.brand, candidate.brand)
      : source.brand || candidate.brand
        ? 0.35
        : 0.55;

  let capacityScore = 0.5;
  if (source.capacityValue && candidate.capacityValue && source.capacityUnit && candidate.capacityUnit) {
    const sameUnit = source.capacityUnit === candidate.capacityUnit;
    const ratio =
      Math.min(source.capacityValue, candidate.capacityValue) /
      Math.max(source.capacityValue, candidate.capacityValue);
    capacityScore = sameUnit ? ratio : ratio * 0.6;
  }

  return clamp01(nameScore * 0.6 + brandScore * 0.25 + capacityScore * 0.15);
}

/** @param {string} a @param {string} b */
function tokenJaccard(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** @param {string} text */
function tokens(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/** @param {number} n */
function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}
