import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { getGeneralList } from '../households.js';
import { publish } from '../realtime.js';

export const backupRouter = express.Router();
backupRouter.use(requireAuth);

const VERSAO = 1;

/**
 * Uma copia das listas da casa em texto, para guardar fora do servidor.
 *
 * O backup nao leva id de produto: o catalogo se reconstroi sozinho a cada
 * instalacao e os ids nao batem entre dois bancos. Leva a chave de identidade
 * (EAN, ou o nome normalizado) mais nome, foto e o preco congelado -- assim a
 * lista volta inteira, e volta ligada ao produto quando ele ja existir aqui.
 * O que nao esta no arquivo e o que se refaz sozinho: catalogo e precos.
 */
backupRouter.get('/', (req, res) => {
  const casa = db.prepare('SELECT name FROM households WHERE id = ?').get(req.user.householdId);
  const listas = db
    .prepare('SELECT * FROM lists WHERE household_id = ? AND archived = 0 ORDER BY kind, name')
    .all(req.user.householdId);
  const itensDa = db.prepare(`
    SELECT i.name, i.qty, i.unit, i.category, i.image_url, i.note, i.position,
           i.price_snapshot, i.snapshot_at, i.market, p.match_key, p.ean
      FROM list_items i
      LEFT JOIN products p ON p.id = i.product_id
     WHERE i.list_id = ?
     ORDER BY i.position
  `);
  const historico = db
    .prepare(`
      SELECT h.match_key, h.name, h.market, h.unit_price, h.recorded_at
        FROM price_history h
        JOIN trips t ON t.id = h.trip_id
       WHERE t.household_id = ?
       ORDER BY h.recorded_at
    `)
    .all(req.user.householdId);

  res.json({
    version: VERSAO,
    exportedAt: new Date().toISOString(),
    household: casa?.name || 'Casa',
    lists: listas.map((l) => ({
      name: l.name,
      kind: l.kind,
      emoji: l.emoji,
      reusable: !!l.reusable,
      items: itensDa.all(l.id).map((i) => ({
        name: i.name,
        qty: i.qty,
        unit: i.unit,
        category: i.category,
        imageUrl: i.image_url,
        note: i.note,
        position: i.position,
        market: i.market,
        matchKey: i.match_key,
        ean: i.ean,
        priceSnapshot: i.price_snapshot,
        snapshotAt: i.snapshot_at,
      })),
    })),
    history: historico.map((h) => ({
      matchKey: h.match_key,
      name: h.name,
      market: h.market,
      unitPrice: h.unit_price,
      recordedAt: h.recorded_at,
    })),
  });
});

const acharProduto = db.prepare('SELECT id FROM products WHERE match_key = ?');
const acharLista = db.prepare(
  "SELECT * FROM lists WHERE household_id = ? AND kind = 'quick' AND archived = 0 AND lower(name) = lower(?)",
);
const criarLista = db.prepare(
  'INSERT INTO lists (household_id, name, kind, emoji, reusable, created_by) VALUES (?, ?, ?, ?, ?, ?)',
);
const itemIgual = db.prepare(
  'SELECT id FROM list_items WHERE list_id = ? AND lower(name) = lower(?) AND unit = ?',
);
const inserirItem = db.prepare(`
  INSERT INTO list_items (list_id, product_id, name, qty, unit, category, image_url, note, position,
                          added_by, price_snapshot, snapshot_at, market)
  VALUES (@listId, @productId, @name, @qty, @unit, @category, @imageUrl, @note, @position,
          @addedBy, @priceSnapshot, @snapshotAt, @market)
`);
const historicoIgual = db.prepare(
  'SELECT 1 FROM price_history WHERE match_key = ? AND recorded_at = ? AND unit_price = ?',
);
const inserirHistorico = db.prepare(`
  INSERT INTO price_history (product_id, match_key, name, market, unit_price, recorded_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

/**
 * Devolve o backup para dentro do app. Acrescenta, nao substitui: item que ja
 * existe na lista fica como esta, e lista rapida de mesmo nome recebe o que
 * falta. Restaurar duas vezes por engano nao duplica nada.
 */
backupRouter.post('/restore', (req, res) => {
  const dump = req.body || {};
  if (Number(dump.version) !== VERSAO) {
    return res.status(400).json({ error: 'este arquivo nao e um backup desta versao do app' });
  }
  if (!Array.isArray(dump.lists)) return res.status(400).json({ error: 'backup sem listas' });

  let itens = 0;
  let listas = 0;
  let precos = 0;

  const restaurar = db.transaction(() => {
    for (const origem of dump.lists) {
      const nome = String(origem?.name || '').trim();
      if (!nome) continue;
      let destino;
      if (origem.kind === 'general') {
        destino = getGeneralList(req.user.householdId);
      } else {
        destino = acharLista.get(req.user.householdId, nome);
        if (!destino) {
          const info = criarLista.run(
            req.user.householdId,
            nome,
            'quick',
            String(origem.emoji || '📝').slice(0, 8),
            origem.reusable === false ? 0 : 1,
            req.user.id,
          );
          destino = db.prepare('SELECT * FROM lists WHERE id = ?').get(info.lastInsertRowid);
          listas++;
        }
      }

      let posicao = db.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM list_items WHERE list_id = ?').get(destino.id).p;
      for (const item of origem.items || []) {
        const nomeItem = String(item?.name || '').trim();
        if (!nomeItem) continue;
        const unidade = String(item.unit || 'un');
        if (itemIgual.get(destino.id, nomeItem, unidade)) continue;
        posicao += 1;
        inserirItem.run({
          listId: destino.id,
          productId: item.matchKey ? (acharProduto.get(item.matchKey)?.id ?? null) : null,
          name: nomeItem,
          qty: Math.max(Number(item.qty) || 1, 0.01),
          unit: unidade,
          category: String(item.category || 'outros'),
          imageUrl: item.imageUrl || null,
          note: item.note || null,
          position: posicao,
          addedBy: req.user.id,
          priceSnapshot: typeof item.priceSnapshot === 'string' ? item.priceSnapshot : null,
          snapshotAt: item.snapshotAt || null,
          market: item.market || null,
        });
        itens++;
      }
    }

    for (const linha of Array.isArray(dump.history) ? dump.history : []) {
      const chave = String(linha?.matchKey || '');
      const preco = Number(linha?.unitPrice);
      if (!chave || !Number.isFinite(preco) || preco <= 0) continue;
      const quando = String(linha.recordedAt || '');
      if (historicoIgual.get(chave, quando, preco)) continue;
      inserirHistorico.run(
        acharProduto.get(chave)?.id ?? null,
        chave,
        String(linha.name || chave),
        linha.market || null,
        preco,
        quando || new Date().toISOString().replace('T', ' ').slice(0, 19),
      );
      precos++;
    }
  });
  restaurar();

  publish(req.user.householdId, 'lists');
  publish(req.user.householdId, 'general');
  res.json({ ok: true, listas, itens, precos });
});
