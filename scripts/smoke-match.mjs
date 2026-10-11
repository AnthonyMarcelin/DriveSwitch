import { matchLine } from '../src/matching/match.js';

const source = {
  id: '1',
  name: 'Lait demi-écrémé 1L',
  brand: 'Lactel',
  quantity: 2,
  ean: '3451790011412',
  capacityValue: 1,
  capacityUnit: 'l',
};

const eanHit = matchLine(source, [
  { id: 'a', name: 'Autre lait', ean: '999' },
  { id: 'b', name: 'Lait Lactel', ean: '3451790011412' },
]);

if (eanHit.method !== 'ean' || eanHit.best?.id !== 'b' || eanHit.confidence !== 'high') {
  console.error('FAIL EAN', eanHit);
  process.exit(1);
}

const fuzzy = matchLine(
  { id: '2', name: 'Pâtes penne 500g', brand: 'Panzani', quantity: 1, capacityValue: 500, capacityUnit: 'g' },
  [
    { id: 'x', name: 'Penne Panzani 500g', brand: 'Panzani', capacityValue: 500, capacityUnit: 'g' },
    { id: 'y', name: 'Riz basmati 1kg', brand: 'Taureau Ailé' },
  ],
);

if (fuzzy.method !== 'fuzzy' || fuzzy.best?.id !== 'x') {
  console.error('FAIL fuzzy', fuzzy);
  process.exit(1);
}

console.log('smoke-match OK');
