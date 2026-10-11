/**
 * Smoke parseurs adaptateurs (sans réseau enseigne).
 */
import { extractJsonArrayAfterKey, extractJsonObjectsWithKey } from '../src/adapters/http.js';

const html = `
<script>
var x = {"lstProduits":[{"iIdProduit":"2612","sLibelleLigne1":"Lait","iQuantitePanier":2,"nrPVUnitaireTTC":1.15}],"lstProduitsLight":[{"iIdProduit":"2612","iQtePanier":2}],"sTotalAPayer":"2,30 €"};
Utilitaires.widget.initOptions('p', {"objContenu":{"lstElements":[{"objElement":{"iIdProduit":"99","sLibelleLigne1":"Café","nrPVUnitaireTTC":3.5,"iQteDisponible":4}}]}});
</script>`;

const cart = extractJsonArrayAfterKey(html, 'lstProduits');
if (!cart || cart.length !== 1 || cart[0].iIdProduit !== '2612') {
  console.error('FAIL lstProduits', cart);
  process.exit(1);
}

const products = extractJsonObjectsWithKey(html, 'iIdProduit', 10);
if (!products.some((p) => String(p.iIdProduit) === '99')) {
  console.error('FAIL products', products);
  process.exit(1);
}

console.log('smoke-adapters OK');
