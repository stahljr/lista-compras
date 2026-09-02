import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { getGeneralList, assertListInHousehold } from '../households.js';
import { hydrate } from '../catalog.js';
import { compareBasket } from '../compare.js';
import { snapshotOf, writeSnapshot, readSnapshot, refreshListSnapshots } from '../snapshot.js';
import { categoryOrder } from '../categories.js';
import { publish } from '../realtime.js';

export const listsRouter = express.Router();
listsRouter.use(requireAuth);

function itemsOf(listId) {
  const rows = db
    .prepare(
      `SELECT i.*, u.name AS added_by_name, u.color AS added_by_color
         FROM list_items i
         LEFT JOIN users u ON u.id = i.added_by
        WHERE i.list_id = ?`,
    )
    .all(listId);
  return rows
    .map((r) => ({
      id: r.id,
      productId: r.product_id,
      name: r.name,
      qty: r.qty,
      unit: r.unit,
      category: r.category,
      imageUrl: r.image_url,
      note: r.note,
      position: r.position,
      addedBy: r.added_by ? { id: r.added_by, name: r.added_by_name, color: r.added_by_color } : null,
      createdAt: r.created_at,
      // Preco por mercado, congelado quando o item entrou na lista.
      priceSnapshot: readSnapshot(r),
      snapshotAt: r.snapshot_at,
    }))
    .sort(
      (a, b) =>
        categoryOrder(a.category) - categoryOrder(b.category) ||
        a.position - b.position ||
        a.name.localeCompare(b.name, 'pt-BR'),
    );
}

function listPayload(list) {
  return {
    id: list.id,
    name: list.name,
    kind: list.kind,
    emoji: list.emoji,
    reusable: !!list.reusable,
    archived: !!list.archived,
    items: itemsOf(list.id),
  };
}

/** Aceita o id numerico ou o apelido "geral" na URL. */
function resolveList(req) {
  const raw = String(req.params.id);
  if (raw === 'geral') return getGeneralList(req.user.householdId);
  return assertListInHousehold(Number(raw), req.user.householdId);
}

const touch = (listId) => db.prepare("UPDATE lists SET updated_at = datetime('now') WHERE id = ?").run(listId);

listsRouter.get('/', (req, res) => {
  const general = getGeneralList(req.user.householdId);
  const named = db
    .prepare("SELECT * FROM lists WHERE household_id = ? AND kind = 'quick' AND archived = 0 ORDER BY reusable DESC, name")
    .all(req.user.householdId);
  res.json({
    general: listPayload(general),
    lists: named.map((l) => ({
      id: l.id,
      name: l.name,
      emoji: l.emoji,
      kind: l.kind,
      reusable: !!l.reusable,
      itemCount: db.prepare('SELECT COUNT(*) AS n FROM list_items WHERE list_id = ?').get(l.id).n,
      updatedAt: l.updated_at,
    })),
  });
});

listsRouter.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'de um nome para a lista' });
  const emoji = String(req.body?.emoji || '📝').slice(0, 8);
  const info = db
    .prepare("INSERT INTO lists (household_id, name, kind, emoji, reusable, created_by) VALUES (?, ?, 'quick', ?, 1, ?)")
    .run(req.user.householdId, name, emoji, req.user.id);
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(info.lastInsertRowid);
  publish(req.user.householdId, 'lists');
  res.json({ list: listPayload(list) });
});

listsRouter.get('/geral', (req, res) => res.json({ list: listPayload(getGeneralList(req.user.householdId)) }));

listsRouter.get('/:id', (req, res, next) => {
  try {
    res.json({ list: listPayload(resolveList(req)) });
  } catch (err) {
    next(err);
  }
});

listsRouter.patch('/:id', (req, res, next) => {
  try {
    const list = resolveList(req);
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : list.name;
    const emoji = req.body?.emoji !== undefined ? String(req.body.emoji).slice(0, 8) : list.emoji;
    db.prepare("UPDATE lists SET name = ?, emoji = ?, updated_at = datetime('now') WHERE id = ?").run(name, emoji, list.id);
    publish(req.user.householdId, 'lists');
    res.json({ list: listPayload(db.prepare('SELECT * FROM lists WHERE id = ?').get(list.id)) });
  } catch (err) {
    next(err);
  }
});

listsRouter.delete('/:id', (req, res, next) => {
  try {
    const list = resolveList(req);
    if (list.kind === 'general') return res.status(400).json({ error: 'a lista geral nao pode ser apagada' });
    db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
    publish(req.user.householdId, 'lists');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Adiciona um item: ou do catalogo (productId) ou digitado a mao (name). */
listsRouter.post('/:id/items', (req, res, next) => {
  try {
    const list = resolveList(req);
    const body = req.body || {};
    const qty = Math.max(Number(body.qty) || 1, 0.01);

    let name = String(body.name || '').trim();
    let category = String(body.category || 'outros');
    let unit = String(body.unit || 'un');
    let imageUrl = body.imageUrl || null;
    let productId = body.productId ? Number(body.productId) : null;

    if (productId) {
      const product = hydrate(productId);
      if (!product) return res.status(404).json({ error: 'produto nao encontrado' });
      name = name || product.name;
      category = product.category;
      imageUrl = product.imageUrl;
      // A unidade do produto e o padrao, mas nao a lei: carne moida se compra
      // por bandeja ou por peso, e quem decide isso e quem vai comprar.
      unit = body.unit ? String(body.unit) : product.unit;
    }
    if (!name) return res.status(400).json({ error: 'informe o item' });

    // Item repetido soma na quantidade em vez de duplicar a linha -- mas a
    // unidade entra na conta: "1 bandeja" e "1,5 kg" do mesmo produto sao duas
    // compras diferentes e nao podem virar "2,5" de coisa nenhuma.
    const existing = productId
      ? db.prepare('SELECT * FROM list_items WHERE list_id = ? AND product_id = ? AND unit = ?').get(list.id, productId, unit)
      : db.prepare('SELECT * FROM list_items WHERE list_id = ? AND product_id IS NULL AND lower(name) = lower(?)').get(list.id, name);

    if (existing) {
      db.prepare("UPDATE list_items SET qty = qty + ?, updated_at = datetime('now') WHERE id = ?").run(qty, existing.id);
    } else {
      const nextPos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM list_items WHERE list_id = ?').get(list.id).p;
      const info = db
        .prepare(
          `INSERT INTO list_items (list_id, product_id, name, qty, unit, category, image_url, note, position, added_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(list.id, productId, name, qty, unit, category, imageUrl, body.note || null, nextPos, req.user.id);
      // Congela aqui o preco de cada mercado: e o numero que vai valer na compra.
      if (productId) writeSnapshot(info.lastInsertRowid, snapshotOf(productId));
    }
    touch(list.id);
    publish(req.user.householdId, list.kind === 'general' ? 'general' : 'lists', { listId: list.id });
    res.json({ list: listPayload(list) });
  } catch (err) {
    next(err);
  }
});

listsRouter.patch('/:id/items/:itemId', (req, res, next) => {
  try {
    const list = resolveList(req);
    const item = db.prepare('SELECT * FROM list_items WHERE id = ? AND list_id = ?').get(Number(req.params.itemId), list.id);
    if (!item) return res.status(404).json({ error: 'item nao encontrado' });
    const body = req.body || {};
    const qty = body.qty !== undefined ? Math.max(Number(body.qty) || 0, 0) : item.qty;
    if (qty === 0) {
      db.prepare('DELETE FROM list_items WHERE id = ?').run(item.id);
    } else {
      db.prepare(
        `UPDATE list_items SET qty = ?, name = ?, unit = ?, category = ?, note = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(
        qty,
        body.name !== undefined ? String(body.name).trim() || item.name : item.name,
        body.unit !== undefined ? String(body.unit) : item.unit,
        body.category !== undefined ? String(body.category) : item.category,
        body.note !== undefined ? body.note : item.note,
        item.id,
      );
    }
    touch(list.id);
    publish(req.user.householdId, list.kind === 'general' ? 'general' : 'lists', { listId: list.id });
    res.json({ list: listPayload(list) });
  } catch (err) {
    next(err);
  }
});

listsRouter.delete('/:id/items/:itemId', (req, res, next) => {
  try {
    const list = resolveList(req);
    db.prepare('DELETE FROM list_items WHERE id = ? AND list_id = ?').run(Number(req.params.itemId), list.id);
    touch(list.id);
    publish(req.user.householdId, list.kind === 'general' ? 'general' : 'lists', { listId: list.id });
    res.json({ list: listPayload(list) });
  } catch (err) {
    next(err);
  }
});

listsRouter.post('/:id/clear', (req, res, next) => {
  try {
    const list = resolveList(req);
    db.prepare('DELETE FROM list_items WHERE list_id = ?').run(list.id);
    touch(list.id);
    publish(req.user.householdId, list.kind === 'general' ? 'general' : 'lists', { listId: list.id });
    res.json({ list: listPayload(list) });
  } catch (err) {
    next(err);
  }
});

/**
 * Guarda a lista geral como uma lista rapida, para repetir depois. A lista
 * salva e reutilizavel: usa-la no carrinho nao a consome.
 */
listsRouter.post('/geral/save-as', (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'de um nome para a lista' });
    const general = getGeneralList(req.user.householdId);
    const info = db
      .prepare("INSERT INTO lists (household_id, name, kind, emoji, reusable, created_by) VALUES (?, ?, 'quick', ?, 1, ?)")
      .run(req.user.householdId, name, String(req.body?.emoji || '📝').slice(0, 8), req.user.id);
    const newId = info.lastInsertRowid;
    db.prepare(
      `INSERT INTO list_items (list_id, product_id, name, qty, unit, category, image_url, note, position, added_by, price_snapshot, snapshot_at)
       SELECT ?, product_id, name, qty, unit, category, image_url, note, position, added_by, price_snapshot, snapshot_at
         FROM list_items WHERE list_id = ?`,
    ).run(newId, general.id);
    publish(req.user.householdId, 'lists');
    res.json({ list: listPayload(db.prepare('SELECT * FROM lists WHERE id = ?').get(newId)) });
  } catch (err) {
    next(err);
  }
});

/** Onde vale mais a pena comprar esta lista. */
listsRouter.get('/:id/compare', async (req, res, next) => {
  try {
    const list = resolveList(req);
    const items = db.prepare('SELECT * FROM list_items WHERE list_id = ?').all(list.id);
    const result = await compareBasket(items, { refresh: req.query.refresh !== '0' });
    // O comparador acabou de consultar os mercados: este e o preco que a pessoa
    // viu ao decidir, entao e ele que fica gravado para a compra usar.
    refreshListSnapshots(list.id);
    res.json({ listId: list.id, listName: list.name, ...result });
  } catch (err) {
    next(err);
  }
});
