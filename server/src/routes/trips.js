import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { getCart, assertListInHousehold, assertTripInHousehold } from '../households.js';
import { hydrate, matchKey, priceStats } from '../catalog.js';
import { priceFor } from '../snapshot.js';
import { MARKET_BY_KEY } from '../markets/index.js';
import { categoryOrder, categoryLabel } from '../categories.js';
import { publish } from '../realtime.js';

export const tripsRouter = express.Router();
tripsRouter.use(requireAuth);

const round = (n) => Math.round(n * 100) / 100;

function tripItems(tripId) {
  return db
    .prepare(
      `SELECT t.*, u.name AS picked_by_name, u.color AS picked_by_color
         FROM trip_items t
         LEFT JOIN users u ON u.id = t.picked_by
        WHERE t.trip_id = ?`,
    )
    .all(tripId)
    .map((r) => ({
      id: r.id,
      productId: r.product_id,
      name: r.name,
      qty: r.qty,
      unit: r.unit,
      category: r.category,
      categoryLabel: categoryLabel(r.category),
      imageUrl: r.image_url,
      note: r.note,
      picked: !!r.picked,
      unitPrice: r.unit_price,
      pickedQty: r.picked_qty,
      // "expected" e o preco gravado quando a lista foi montada.
      expected: r.expected,
      // O preco que conta: o corrigido a mao, se houver, senao o da lista.
      // Anotar preco no mercado e opcional -- o total ja fecha sem isso.
      price: r.unit_price ?? r.expected,
      corrected: r.unit_price != null,
      subtotal:
        (r.unit_price ?? r.expected) != null ? round((r.unit_price ?? r.expected) * (r.picked_qty ?? r.qty)) : null,
      pickedBy: r.picked_by ? { id: r.picked_by, name: r.picked_by_name, color: r.picked_by_color } : null,
      pickedAt: r.picked_at,
    }))
    .sort(
      (a, b) =>
        Number(a.picked) - Number(b.picked) ||
        categoryOrder(a.category) - categoryOrder(b.category) ||
        a.name.localeCompare(b.name, 'pt-BR'),
    );
}

/**
 * Estado da compra: quanto ja foi gasto, quanto falta e -- a pergunta que
 * importa no meio do corredor -- se ja pegamos tudo.
 */
function tripPayload(trip) {
  const items = tripItems(trip.id);
  const picked = items.filter((i) => i.picked);
  const missing = items.filter((i) => !i.picked);
  const spent = round(picked.reduce((acc, i) => acc + (i.subtotal || 0), 0));
  const remainingEstimate = round(missing.reduce((acc, i) => acc + (i.expected || 0) * i.qty, 0));
  // Itens sem preco nenhum sao os escritos a mao, que nunca tiveram produto
  // vinculado. Nao e pendencia a cobrar: so nao entram na soma.
  const withoutPrice = items.filter((i) => i.price == null).length;

  const byCategory = new Map();
  for (const item of missing) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, { key: item.category, label: item.categoryLabel, items: [] });
    byCategory.get(item.category).items.push(item);
  }

  return {
    id: trip.id,
    listId: trip.list_id,
    listName: trip.list_name,
    market: trip.market,
    marketLabel: trip.market ? MARKET_BY_KEY.get(trip.market)?.label || trip.market : null,
    status: trip.status,
    startedAt: trip.started_at,
    finishedAt: trip.finished_at,
    items,
    progress: {
      total: items.length,
      picked: picked.length,
      missing: missing.length,
      complete: items.length > 0 && missing.length === 0,
      percent: items.length ? Math.round((picked.length / items.length) * 100) : 0,
      withoutPrice,
    },
    missingByCategory: [...byCategory.values()].sort((a, b) => categoryOrder(a.key) - categoryOrder(b.key)),
    spent,
    remainingEstimate,
    estimatedTotal: round(spent + remainingEstimate),
  };
}

/** Comeca a compra: "cheguei no mercado" congela a lista numa ida ao mercado. */
tripsRouter.post('/', async (req, res, next) => {
  try {
    const householdId = req.user.householdId;
    const active = db.prepare("SELECT * FROM trips WHERE household_id = ? AND status = 'active'").get(householdId);
    if (active) return res.status(409).json({ error: 'ja existe uma compra em andamento', trip: tripPayload(active) });

    const market = req.body?.market ? String(req.body.market) : null;
    if (market && !MARKET_BY_KEY.has(market)) return res.status(400).json({ error: 'mercado desconhecido' });

    const list = req.body?.listId
      ? assertListInHousehold(Number(req.body.listId), householdId)
      : getCart(householdId);
    const items = db.prepare('SELECT * FROM list_items WHERE list_id = ?').all(list.id);
    if (!items.length) return res.status(400).json({ error: 'a lista esta vazia' });

    const info = db
      .prepare('INSERT INTO trips (household_id, list_id, list_name, market, started_by) VALUES (?, ?, ?, ?, ?)')
      .run(householdId, list.id, list.name, market, req.user.id);
    const tripId = info.lastInsertRowid;

    // O preco vem do que ficou gravado na montagem da lista -- sem consultar
    // mercado nenhum agora. Isso faz "cheguei no mercado" abrir na hora e
    // funcionar com o sinal ruim que costuma ter dentro da loja.
    const insert = db.prepare(
      `INSERT INTO trip_items (trip_id, list_item_id, product_id, name, qty, unit, category, image_url, note, expected)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of items) {
      const expected = priceFor(item, market) ?? priceStats(matchKey({ name: item.name }))?.last ?? null;
      insert.run(tripId, item.id, item.product_id, item.name, item.qty, item.unit, item.category, item.image_url, item.note, expected);
    }

    const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
    publish(householdId, 'trip', { tripId });
    res.json({ trip: tripPayload(trip) });
  } catch (err) {
    next(err);
  }
});

tripsRouter.get('/active', (req, res) => {
  const trip = db.prepare("SELECT * FROM trips WHERE household_id = ? AND status = 'active'").get(req.user.householdId);
  res.json({ trip: trip ? tripPayload(trip) : null });
});

tripsRouter.get('/', (req, res) => {
  const trips = db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM trip_items ti WHERE ti.trip_id = t.id) AS total_items,
              (SELECT COUNT(*) FROM trip_items ti WHERE ti.trip_id = t.id AND ti.picked = 1) AS picked_items,
              (SELECT COALESCE(SUM(ti.unit_price * COALESCE(ti.picked_qty, ti.qty)), 0)
                 FROM trip_items ti WHERE ti.trip_id = t.id AND ti.picked = 1) AS spent
         FROM trips t
        WHERE t.household_id = ? AND t.status != 'active'
        ORDER BY t.started_at DESC
        LIMIT ?`,
    )
    .all(req.user.householdId, Math.min(Number(req.query.limit) || 30, 100));
  res.json({
    trips: trips.map((t) => ({
      id: t.id,
      listName: t.list_name,
      market: t.market,
      marketLabel: t.market ? MARKET_BY_KEY.get(t.market)?.label || t.market : null,
      status: t.status,
      startedAt: t.started_at,
      finishedAt: t.finished_at,
      totalItems: t.total_items,
      pickedItems: t.picked_items,
      spent: round(t.spent),
    })),
  });
});

tripsRouter.get('/:id', (req, res, next) => {
  try {
    res.json({ trip: tripPayload(assertTripInHousehold(Number(req.params.id), req.user.householdId)) });
  } catch (err) {
    next(err);
  }
});

/** Marcar como pego e anotar o preco da etiqueta. */
tripsRouter.patch('/:id/items/:itemId', (req, res, next) => {
  try {
    const trip = assertTripInHousehold(Number(req.params.id), req.user.householdId);
    if (trip.status !== 'active') return res.status(409).json({ error: 'esta compra ja foi encerrada' });
    const item = db.prepare('SELECT * FROM trip_items WHERE id = ? AND trip_id = ?').get(Number(req.params.itemId), trip.id);
    if (!item) return res.status(404).json({ error: 'item nao encontrado' });

    const body = req.body || {};
    const picked = body.picked !== undefined ? (body.picked ? 1 : 0) : item.picked;
    const unitPrice =
      body.unitPrice !== undefined ? (body.unitPrice === null || body.unitPrice === '' ? null : Number(body.unitPrice)) : item.unit_price;
    const pickedQty =
      body.pickedQty !== undefined ? (body.pickedQty === null || body.pickedQty === '' ? null : Number(body.pickedQty)) : item.picked_qty;

    if (unitPrice != null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      return res.status(400).json({ error: 'preco invalido' });
    }

    db.prepare(
      `UPDATE trip_items
          SET picked = ?, unit_price = ?, picked_qty = ?,
              picked_by = CASE WHEN ? = 1 THEN ? ELSE NULL END,
              picked_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
        WHERE id = ?`,
    ).run(picked, unitPrice, pickedQty, picked, req.user.id, picked, item.id);

    publish(req.user.householdId, 'trip', { tripId: trip.id });
    res.json({ trip: tripPayload(trip) });
  } catch (err) {
    next(err);
  }
});

/** Lembrou de algo no corredor: entra na compra (e depois na lista, se quiser). */
tripsRouter.post('/:id/items', (req, res, next) => {
  try {
    const trip = assertTripInHousehold(Number(req.params.id), req.user.householdId);
    if (trip.status !== 'active') return res.status(409).json({ error: 'esta compra ja foi encerrada' });
    const body = req.body || {};
    let name = String(body.name || '').trim();
    let category = String(body.category || 'outros');
    let unit = String(body.unit || 'un');
    let imageUrl = body.imageUrl || null;
    const productId = body.productId ? Number(body.productId) : null;
    let expected = null;

    if (productId) {
      const product = hydrate(productId);
      if (!product) return res.status(404).json({ error: 'produto nao encontrado' });
      name = name || product.name;
      category = product.category;
      unit = product.unit;
      imageUrl = product.imageUrl;
      expected = (trip.market ? product.offers.find((o) => o.market === trip.market)?.price : null) ?? product.cheapest?.price ?? null;
    }
    if (!name) return res.status(400).json({ error: 'informe o item' });

    db.prepare(
      `INSERT INTO trip_items (trip_id, product_id, name, qty, unit, category, image_url, expected)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(trip.id, productId, name, Math.max(Number(body.qty) || 1, 0.01), unit, category, imageUrl, expected);

    publish(req.user.householdId, 'trip', { tripId: trip.id });
    res.json({ trip: tripPayload(trip) });
  } catch (err) {
    next(err);
  }
});

tripsRouter.delete('/:id/items/:itemId', (req, res, next) => {
  try {
    const trip = assertTripInHousehold(Number(req.params.id), req.user.householdId);
    db.prepare('DELETE FROM trip_items WHERE id = ? AND trip_id = ?').run(Number(req.params.itemId), trip.id);
    publish(req.user.householdId, 'trip', { tripId: trip.id });
    res.json({ trip: tripPayload(trip) });
  } catch (err) {
    next(err);
  }
});

/**
 * Fecha a compra e resolve o que fazer com a lista de origem:
 *  - 'remove-picked' (padrao): sai o que foi comprado, fica o que faltou
 *  - 'clear': limpa a lista inteira
 *  - 'keep': nao mexe na lista
 * Os precos anotados viram historico, que alimenta a estimativa da proxima ida.
 */
tripsRouter.post('/:id/finish', (req, res, next) => {
  try {
    const trip = assertTripInHousehold(Number(req.params.id), req.user.householdId);
    if (trip.status !== 'active') return res.status(409).json({ error: 'esta compra ja foi encerrada' });
    const outcome = ['remove-picked', 'clear', 'keep'].includes(req.body?.outcome) ? req.body.outcome : 'remove-picked';

    const finish = db.transaction(() => {
      const items = db.prepare('SELECT * FROM trip_items WHERE trip_id = ?').all(trip.id);

      for (const item of items) {
        // Guarda o preco corrigido a mao; o da lista ja veio do mercado e nao
        // e informacao nova para o historico.
        if (item.picked && item.unit_price != null) {
          db.prepare(
            `INSERT INTO price_history (product_id, match_key, name, market, unit_price, trip_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).run(item.product_id, matchKey({ name: item.name }), item.name, trip.market, item.unit_price, trip.id);
        }
      }

      if (trip.list_id) {
        if (outcome === 'clear') {
          db.prepare('DELETE FROM list_items WHERE list_id = ?').run(trip.list_id);
        } else if (outcome === 'remove-picked') {
          for (const item of items) {
            if (item.picked && item.list_item_id) db.prepare('DELETE FROM list_items WHERE id = ?').run(item.list_item_id);
          }
        }
        db.prepare("UPDATE lists SET updated_at = datetime('now') WHERE id = ?").run(trip.list_id);
      }

      db.prepare("UPDATE trips SET status = 'done', finished_at = datetime('now') WHERE id = ?").run(trip.id);
    });
    finish();

    const updated = db.prepare('SELECT * FROM trips WHERE id = ?').get(trip.id);
    publish(req.user.householdId, 'trip', { tripId: trip.id, finished: true });
    publish(req.user.householdId, 'cart', { listId: trip.list_id });
    res.json({ trip: tripPayload(updated), outcome });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post('/:id/cancel', (req, res, next) => {
  try {
    const trip = assertTripInHousehold(Number(req.params.id), req.user.householdId);
    db.prepare("UPDATE trips SET status = 'canceled', finished_at = datetime('now') WHERE id = ?").run(trip.id);
    publish(req.user.householdId, 'trip', { tripId: trip.id, finished: true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
