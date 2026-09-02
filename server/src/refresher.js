import { db } from './db.js';
import { fillMissingOffers } from './catalog.js';

/**
 * Preco de mercado muda de um dia para o outro, e o comparador so serve se o
 * numero for de agora. Este job reconsulta, de tempo em tempo, os produtos que
 * estao em alguma lista ou carrinho -- e so esses, para nao varrer o catalogo
 * inteiro sem motivo.
 */
export function startRefresher() {
  const hours = Number(process.env.REFRESH_HOURS ?? 12);
  if (!hours || hours <= 0) return;

  async function run() {
    const rows = db
      .prepare(
        `SELECT DISTINCT product_id AS id FROM list_items WHERE product_id IS NOT NULL
         UNION
         SELECT DISTINCT product_id AS id FROM trip_items
          WHERE product_id IS NOT NULL AND trip_id IN (SELECT id FROM trips WHERE status = 'active')`,
      )
      .all();
    if (!rows.length) return;

    let atualizados = 0;
    for (const row of rows) {
      try {
        await fillMissingOffers(row.id, { maxAgeMinutes: hours * 60 });
        atualizados++;
      } catch {
        // Mercado fora do ar nao e motivo para parar os demais produtos.
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    console.log(`[precos] ${atualizados} de ${rows.length} produtos das listas reconsultados`);
  }

  // Um atraso na largada para nao competir com o boot do servidor.
  setTimeout(() => void run(), 30_000).unref();
  setInterval(() => void run(), hours * 3600 * 1000).unref();
}
