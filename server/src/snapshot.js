import { db } from './db.js';
import { hydrate } from './catalog.js';

/**
 * O preco que vale numa compra e o do momento em que a lista foi montada --
 * foi com ele que se decidiu a qual mercado ir. Entao ele e gravado no item da
 * lista quando o item entra, e reconfirmado quando o comparador roda (que e,
 * na pratica, a hora de decidir). Dentro do mercado nada disso e consultado de
 * novo: o app le o numero gravado e pronto.
 */
export async function snapshotOf(productId) {
  const product = await hydrate(productId);
  if (!product) return null;
  const prices = {};
  for (const offer of product.offers) {
    if (!offer.available || !(offer.price > 0)) continue;
    if (prices[offer.market] == null || offer.price < prices[offer.market]) prices[offer.market] = offer.price;
  }
  return Object.keys(prices).length ? prices : null;
}

export async function writeSnapshot(listItemId, prices) {
  if (!prices) return;
  await db.prepare("UPDATE list_items SET price_snapshot = ?, snapshot_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(prices),
    listItemId,
  );
}

export function readSnapshot(item) {
  if (!item?.price_snapshot) return null;
  try {
    const parsed = JSON.parse(item.price_snapshot);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** O preco do item para uma ida a um mercado especifico. */
export function priceFor(item, market) {
  const prices = readSnapshot(item);
  if (!prices) return null;
  if (market && prices[market] != null) return prices[market];
  // Sem mercado escolhido (ou o escolhido nao tinha o item na montagem da
  // lista): usa o menor preco gravado, que e o que o comparador mostrou.
  const valores = Object.values(prices).filter((v) => typeof v === 'number' && v > 0);
  return valores.length ? Math.min(...valores) : null;
}

/** Grava o snapshot de todos os itens da lista que tem produto vinculado. */
export async function refreshListSnapshots(listId) {
  const items = await db
    .prepare('SELECT id, product_id FROM list_items WHERE list_id = ? AND product_id IS NOT NULL')
    .all(listId);
  for (const item of items) await writeSnapshot(item.id, await snapshotOf(item.product_id));
  return items.length;
}
