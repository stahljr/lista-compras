import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { getGeneralList, assertListInHousehold, assertTripInHousehold } from '../households.js';
import { hydrate, matchKey, priceStats } from '../catalog.js';
import { priceFor } from '../snapshot.js';
import { MARKET_BY_KEY } from '../markets/index.js';
import { categoryOrder, categoryLabel } from '../categories.js';
import { publish } from '../realtime.js';

export const tripsRouter = express.Router();
tripsRouter.use(requireAuth);

const round = (n) => Math.round(n * 100) / 100;

/** As listas que compoem este carrinho. */
function sourceLists(tripId) {
  return db
    .prepare('SELECT list_id AS id, list_name AS name, kind, reusable FROM trip_lists WHERE trip_id = ?')
    .all(tripId)
    .map((l) => ({ id: l.id, name: l.name, kind: l.kind, reusable: !!l.reusable }));
}

/**
 * Joga os itens de uma lista dentro do carrinho. Item repetido em duas listas
 * soma a quantidade em vez de virar duas linhas -- se o arroz esta na lista
 * geral e na do churrasco, e um item de quantidade 2.
 */
const mergeListIntoTrip = db.transaction((trip, list, market) => {
  const items = db.prepare('SELECT * FROM list_items WHERE list_id = ?').all(list.id);
  let added = 0;
  for (const item of items) {
    const existing = item.product_id
      ? db.prepare('SELECT * FROM trip_items WHERE trip_id = ? AND product_id = ?').get(trip.id, item.product_id)
      : db
          .prepare('SELECT * FROM trip_items WHERE trip_id = ? AND product_id IS NULL AND lower(name) = lower(?)')
          .get(trip.id, item.name);
    if (existing) {
      db.prepare('UPDATE trip_items SET qty = qty + ? WHERE id = ?').run(item.qty, existing.id);
      db.prepare('INSERT OR IGNORE INTO trip_item_sources (trip_item_id, list_item_id, list_id) VALUES (?, ?, ?)').run(
        existing.id, item.id, list.id,
      );
      continue;
    }
    const expected = priceFor(item, market) ?? priceStats(matchKey({ name: item.name }))?.last ?? null;
    const info = db
      .prepare(
        `INSERT INTO trip_items (trip_id, list_item_id, product_id, name, qty, unit, category, image_url, note, expected, source_list_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        trip.id, item.id, item.product_id, item.name, item.qty, item.unit, item.category, item.image_url, item.note,
        expected, list.id,
      );
    db.prepare('INSERT INTO trip_item_sources (trip_item_id, list_item_id, list_id) VALUES (?, ?, ?)').run(
      info.lastInsertRowid, item.id, list.id,
    );
    added++;
  }
  db.prepare(
    'INSERT OR IGNORE INTO trip_lists (trip_id, list_id, list_name, kind, reusable) VALUES (?, ?, ?, ?, ?)',
  ).run(trip.id, list.id, list.name, list.kind, list.reusable ? 1 : 0);
  return added;
});

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
    lists: sourceLists(trip.id),
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

/**
 * Monta o carrinho: "cheguei no mercado" pega uma ou mais listas e vira a
 * lista de conferencia da loja. Nao consulta preco nenhum -- usa o que ficou
 * gravado quando as listas foram montadas.
 */
tripsRouter.post('/', (req, res, next) => {
  try {
    const householdId = req.user.householdId;
    const active = db.prepare("SELECT * FROM trips WHERE household_id = ? AND status = 'active'").get(householdId);
    if (active) return res.status(409).json({ error: 'ja existe um carrinho em andamento', trip: tripPayload(active) });

    const market = req.body?.market ? String(req.body.market) : null;
    if (market && !MARKET_BY_KEY.has(market)) return res.status(400).json({ error: 'mercado desconhecido' });

    const pedidas = Array.isArray(req.body?.listIds) && req.body.listIds.length
      ? req.body.listIds.map(Number)
      : [getGeneralList(householdId).id];
    const lists = [...new Set(pedidas)].map((id) => assertListInHousehold(id, householdId));
    const total = lists.reduce(
      (acc, l) => acc + db.prepare('SELECT COUNT(*) AS n FROM list_items WHERE list_id = ?').get(l.id).n,
      0,
    );
    if (!total) return res.status(400).json({ error: 'as listas escolhidas estao vazias' });

    const nome = lists.length === 1 ? lists[0].name : `${lists.length} listas`;
    const info = db
      .prepare('INSERT INTO trips (household_id, list_id, list_name, market, started_by) VALUES (?, ?, ?, ?, ?)')
      .run(householdId, lists[0].id, nome, market, req.user.id);
    const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(info.lastInsertRowid);

    for (const list of lists) mergeListIntoTrip(trip, list, market);

    publish(householdId, 'trip', { tripId: trip.id });
    res.json({ trip: tripPayload(trip) });
  } catch (err) {
    next(err);
  }
});

/** Lembrou de uma lista inteira depois de comecar: entra no carrinho. */
tripsRouter.post('/:id/add-list', (req, res, next) => {
  try {
    const trip = assertTripInHousehold(Number(req.params.id), req.user.householdId);
    if (trip.status !== 'active') return res.status(409).json({ error: 'este carrinho ja foi fechado' });
    const list = assertListInHousehold(Number(req.body?.listId), req.user.householdId);
    if (sourceLists(trip.id).some((l) => l.id === list.id)) {
      return res.status(409).json({ error: 'esta lista ja esta no carrinho' });
    }
    const added = mergeListIntoTrip(trip, list, trip.market);
    publish(req.user.householdId, 'trip', { tripId: trip.id });
    res.json({ trip: tripPayload(db.prepare('SELECT * FROM trips WHERE id = ?').get(trip.id)), added });
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
              -- Mesma regra do carrinho aberto: vale o preco corrigido a mao e,
              -- sem correcao, o que foi congelado na lista. Somar so unit_price
              -- zerava o total de quem nao digitou nada -- que e o caso normal.
              (SELECT COALESCE(SUM(COALESCE(ti.unit_price, ti.expected) * COALESCE(ti.picked_qty, ti.qty)), 0)
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
 * Fecha o carrinho. A resposta e a pergunta do fim da fila: pegamos tudo?
 *
 * Se sobrou algo -- porque faltou na loja, porque o preco ali nao valia, ou
 * por qualquer outro motivo -- o que ficou volta como uma lista nova, pronta
 * para outro mercado ou outro dia. E o unico destino que faz sentido: o item
 * continua sendo preciso.
 *
 * As listas de uso unico (a geral e as de sobra) sao consumidas, porque tudo
 * que estava nelas agora esta comprado ou na lista nova. As listas rapidas
 * cadastradas ficam intactas -- foram feitas para repetir.
 */
tripsRouter.post('/:id/finish', (req, res, next) => {
  try {
    const trip = assertTripInHousehold(Number(req.params.id), req.user.householdId);
    if (trip.status !== 'active') return res.status(409).json({ error: 'este carrinho ja foi fechado' });

    let leftoverId = null;
    const finish = db.transaction(() => {
      const items = db.prepare('SELECT * FROM trip_items WHERE trip_id = ?').all(trip.id);
      const missing = items.filter((i) => !i.picked);

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

      if (missing.length) {
        const quando = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const onde = trip.market ? MARKET_BY_KEY.get(trip.market)?.label || trip.market : null;
        const nome = onde ? `Faltou no ${onde} · ${quando}` : `Faltou · ${quando}`;
        const info = db
          .prepare("INSERT INTO lists (household_id, name, kind, emoji, reusable, created_by) VALUES (?, ?, 'quick', '🔁', 0, ?)")
          .run(req.user.householdId, nome, req.user.id);
        leftoverId = info.lastInsertRowid;
        const insert = db.prepare(
          `INSERT INTO list_items (list_id, product_id, name, qty, unit, category, image_url, note, position, added_by, price_snapshot, snapshot_at)
           SELECT ?, product_id, name, qty, unit, category, image_url, note, position, added_by, price_snapshot, snapshot_at
             FROM list_items WHERE id = ?`,
        );
        // O item de origem carrega o preco congelado; quando ele nao existe
        // mais (item nascido dentro do carrinho), recria do proprio carrinho.
        const insertNovo = db.prepare(
          `INSERT INTO list_items (list_id, product_id, name, qty, unit, category, image_url, note, position, added_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const [indice, item] of missing.entries()) {
          const origem = item.list_item_id
            ? db.prepare('SELECT id FROM list_items WHERE id = ?').get(item.list_item_id)
            : null;
          if (origem) insert.run(leftoverId, origem.id);
          else
            insertNovo.run(
              leftoverId, item.product_id, item.name, item.qty, item.unit, item.category, item.image_url, item.note, indice,
              req.user.id,
            );
        }
      }

      // Consome as listas de uso unico -- mas so o que de fato entrou neste
      // carrinho. Cada item do carrinho terminou comprado ou copiado para a
      // lista nova, entao sai da origem; o que foi anotado na lista DEPOIS de
      // o carrinho ser montado (o outro mexeu na lista enquanto voce estava no
      // mercado) nunca esteve aqui e tem de continuar la.
      const unicas = new Set(sourceLists(trip.id).filter((l) => l.id && !l.reusable).map((l) => l.id));
      const origens = db
        .prepare(
          `SELECT s.list_item_id, s.list_id
             FROM trip_item_sources s
             JOIN trip_items ti ON ti.id = s.trip_item_id
            WHERE ti.trip_id = ?`,
        )
        .all(trip.id);
      for (const origem of origens) {
        if (!unicas.has(origem.list_id)) continue;
        db.prepare('DELETE FROM list_items WHERE id = ?').run(origem.list_item_id);
      }

      // A lista geral e permanente e fica com o que sobrou dela. Uma lista de
      // sobra so desaparece se tiver zerado -- se ainda tem item, ela continua
      // valendo.
      for (const source of sourceLists(trip.id)) {
        if (!source.id || source.reusable) continue;
        const restam = db.prepare('SELECT COUNT(*) AS n FROM list_items WHERE list_id = ?').get(source.id).n;
        if (source.kind !== 'general' && restam === 0) db.prepare('DELETE FROM lists WHERE id = ?').run(source.id);
        else db.prepare("UPDATE lists SET updated_at = datetime('now') WHERE id = ?").run(source.id);
      }

      db.prepare("UPDATE trips SET status = 'done', finished_at = datetime('now') WHERE id = ?").run(trip.id);
    });
    finish();

    const updated = db.prepare('SELECT * FROM trips WHERE id = ?').get(trip.id);
    const payload = tripPayload(updated);
    publish(req.user.householdId, 'trip', { tripId: trip.id, finished: true });
    publish(req.user.householdId, 'general');
    publish(req.user.householdId, 'lists');
    res.json({
      trip: payload,
      complete: payload.progress.missing === 0,
      leftover: leftoverId
        ? {
            id: leftoverId,
            name: db.prepare('SELECT name FROM lists WHERE id = ?').get(leftoverId).name,
            itemCount: db.prepare('SELECT COUNT(*) AS n FROM list_items WHERE list_id = ?').get(leftoverId).n,
          }
        : null,
    });
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
