import { db } from './db.js';
import { fillMissingOffers } from './catalog.js';
import { unificarCatalogo } from './unificar.js';

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
    const rows = await db
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

  /**
   * Junta o repetido que apareceu desde a ultima vez.
   *
   * A uniao de boot roda uma vez por versao da regra, e isso deixava um furo:
   * mercado que devolve o mesmo produto com o nome escrito de outro jeito cria
   * um produto novo, que ninguem mais junta. Cada volta do refresher passa o
   * pente -- so o que ainda esta visivel, entao a passada e barata quando nao
   * ha nada para juntar.
   */
  async function unir() {
    try {
      const r = await unificarCatalogo();
      if (r.unioes.length) console.log(`[unificar] ${r.unioes.length} repeticoes novas juntadas`);
    } catch (err) {
      console.warn(`[unificar] a passada periodica falhou: ${err.message}`);
    }
  }

  // Um atraso na largada para nao competir com o boot do servidor.
  setTimeout(() => void run().then(unir), 30_000).unref();
  setInterval(() => void run().then(unir), hours * 3600 * 1000).unref();
}
