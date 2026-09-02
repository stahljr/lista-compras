/**
 * Popula o catalogo com o que se compra de verdade, para o app abrir cheio:
 * as categorias ja tem produto, a busca responde do cache e a comparacao de
 * preco funciona no primeiro uso. Rodar: npm run seed
 */
import { unifiedSearch } from '../catalog.js';
import { TODOS_OS_TERMOS } from '../catalog-terms.js';
import { categoryCounts } from '../catalog.js';

const TERMOS = TODOS_OS_TERMOS;

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apenas = process.argv[2] ? Number(process.argv[2]) : TERMOS.length;
  const termos = TERMOS.slice(0, apenas);
  console.log(`buscando ${termos.length} termos nos quatro mercados…\n`);

  let ok = 0;
  const falhas = new Map();
  for (const [indice, termo] of termos.entries()) {
    try {
      const { products, failed } = await unifiedSearch(termo, { limit: 24 });
      ok += products.length;
      for (const f of failed) falhas.set(f.market, (falhas.get(f.market) || 0) + 1);
      const marca = failed.length ? ` (${failed.map((f) => f.market).join(',')} falhou)` : '';
      console.log(`${String(indice + 1).padStart(3)}/${termos.length}  ${termo.padEnd(26)} ${String(products.length).padStart(3)} produtos${marca}`);
    } catch (err) {
      console.log(`${String(indice + 1).padStart(3)}/${termos.length}  ${termo.padEnd(26)} erro: ${err.message}`);
    }
    // Um respiro entre as buscas para nao martelar os sites dos mercados.
    await pausa(350);
  }

  console.log(`\n${ok} produtos gravados.`);
  if (falhas.size) console.log('mercados que falharam em algum termo:', [...falhas].map(([m, n]) => `${m} (${n}x)`).join(', '));
  console.log('\npor categoria:');
  for (const row of categoryCounts().sort((a, b) => b.total - a.total)) {
    console.log(`  ${row.category.padEnd(12)} ${row.total}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
