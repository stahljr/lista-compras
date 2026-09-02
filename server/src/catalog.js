import { db } from './db.js';
import { fold, classify } from './categories.js';
import { MARKETS, MARKET_BY_KEY, acrossMarkets } from './markets/index.js';

const SEARCH_TTL_MINUTES = Number(process.env.SEARCH_TTL_MINUTES || 360);

/** Chave de identidade do produto: EAN quando existe, senao o nome normalizado. */
export function matchKey({ ean, name }) {
  if (ean && /^\d{8,14}$/.test(ean)) return `ean:${ean}`;
  return `name:${fold(name).replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

export function normalizeTerm(term) {
  return fold(term).replace(/\s+/g, ' ').trim();
}

const q = {
  productByKey: db.prepare('SELECT * FROM products WHERE match_key = ?'),
  productById: db.prepare('SELECT * FROM products WHERE id = ?'),
  insertProduct: db.prepare(`
    INSERT INTO products (ean, match_key, name, brand, category, image_url, unit)
    VALUES (@ean, @matchKey, @name, @brand, @category, @imageUrl, @unit)
  `),
  touchProduct: db.prepare(`
    UPDATE products
       SET name       = COALESCE(NULLIF(@name, ''), name),
           brand      = COALESCE(@brand, brand),
           image_url  = COALESCE(image_url, @imageUrl),
           category   = CASE WHEN category = 'outros' THEN @category ELSE category END,
           updated_at = datetime('now')
     WHERE id = @id
  `),
  upsertOffer: db.prepare(`
    INSERT INTO offers (product_id, market, market_sku, name, price, list_price, available, url, image_url, category, updated_at)
    VALUES (@productId, @market, @sku, @name, @price, @listPrice, @available, @url, @imageUrl, @rawCategory, datetime('now'))
    ON CONFLICT(market, market_sku) DO UPDATE SET
      product_id = @productId,
      name       = @name,
      price      = @price,
      list_price = @listPrice,
      available  = @available,
      url        = @url,
      image_url  = COALESCE(@imageUrl, offers.image_url),
      category   = @rawCategory,
      updated_at = datetime('now')
  `),
  offersFor: db.prepare('SELECT * FROM offers WHERE product_id = ? ORDER BY price'),
  readCache: db.prepare(`
    SELECT product_ids FROM search_cache
     WHERE market = ? AND term = ?
       AND fetched_at > datetime('now', ?)
  `),
  writeCache: db.prepare(`
    INSERT INTO search_cache (market, term, product_ids, fetched_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(market, term) DO UPDATE SET product_ids = excluded.product_ids, fetched_at = datetime('now')
  `),
};

/** Grava (ou atualiza) um produto vindo de um mercado e devolve o id interno. */
export const saveOffer = db.transaction((item) => {
  const key = matchKey(item);
  let product = q.productByKey.get(key);
  if (!product) {
    const info = q.insertProduct.run({
      ean: item.ean || null,
      matchKey: key,
      name: item.name,
      brand: item.brand || null,
      category: item.category || 'outros',
      imageUrl: item.imageUrl || null,
      unit: item.unit || 'un',
    });
    product = q.productById.get(info.lastInsertRowid);
  } else {
    q.touchProduct.run({
      id: product.id,
      name: item.name,
      brand: item.brand || null,
      imageUrl: item.imageUrl || null,
      category: item.category || 'outros',
    });
  }
  q.upsertOffer.run({
    productId: product.id,
    market: item.market.key,
    sku: item.sku,
    name: item.name,
    price: item.price,
    listPrice: item.listPrice,
    available: item.available,
    url: item.url,
    imageUrl: item.imageUrl,
    rawCategory: item.rawCategory || null,
  });
  return product.id;
});

const saveMany = db.transaction((items) => items.map(saveOffer));

/** Monta o objeto que o app consome: produto + preco em cada mercado. */
export function hydrate(productId) {
  const product = q.productById.get(productId);
  if (!product) return null;
  const offers = q.offersFor
    .all(productId)
    .filter((o) => o.price > 0)
    .map((o) => ({
      market: o.market,
      marketLabel: MARKET_BY_KEY.get(o.market)?.label || o.market,
      price: o.price,
      listPrice: o.list_price,
      available: !!o.available,
      url: o.url,
      name: o.name,
      updatedAt: o.updated_at,
    }));
  const withStock = offers.filter((o) => o.available);
  const cheapest = withStock[0] || offers[0] || null;
  return {
    id: product.id,
    ean: product.ean,
    matchKey: product.match_key,
    name: product.name,
    brand: product.brand,
    category: product.category,
    imageUrl: product.image_url,
    unit: product.unit,
    offers,
    cheapest,
    marketsCount: withStock.length,
  };
}

/**
 * Busca o termo nos quatro mercados em paralelo e devolve uma lista unica,
 * onde cada produto ja carrega o preco de cada mercado que o tem.
 * O resultado por mercado fica em cache para nao bater nos sites a cada tecla.
 */
export async function unifiedSearch(term, { limit = 24, fresh = false } = {}) {
  const normalized = normalizeTerm(term);
  if (normalized.length < 2) return { products: [], failed: [], markets: [] };

  const ttl = `-${SEARCH_TTL_MINUTES} minutes`;
  const ranking = new Map(); // productId -> { hits, score }
  const failed = [];
  const usedCache = [];

  const pending = [];
  for (const market of MARKETS) {
    const cached = fresh ? null : q.readCache.get(market.key, normalized, ttl);
    if (cached) {
      usedCache.push(market.key);
      JSON.parse(cached.product_ids).forEach((id, index) => rank(ranking, id, index));
    } else {
      pending.push(market);
    }
  }

  if (pending.length) {
    const { results, failed: errors } = await acrossMarkets((m) => m.search(normalized, limit), { markets: pending });
    failed.push(...errors);
    for (const { market, value } of results) {
      const ids = saveMany(value.filter((p) => p.name && p.price > 0));
      q.writeCache.run(market.key, normalized, JSON.stringify(ids));
      ids.forEach((id, index) => rank(ranking, id, index));
    }
  }

  const products = [...ranking.entries()]
    .sort((a, b) => b[1].hits - a[1].hits || b[1].score - a[1].score)
    .slice(0, limit)
    .map(([id]) => hydrate(id))
    .filter(Boolean);

  return { products, failed, cachedMarkets: usedCache };
}

function rank(ranking, id, index) {
  const entry = ranking.get(id) || { hits: 0, score: 0 };
  entry.hits += 1;
  entry.score += 1 / (index + 1);
  ranking.set(id, entry);
}

/**
 * Garante que o produto tenha preco em todos os mercados possiveis. Um produto
 * descoberto numa busca costuma vir de dois ou tres mercados; para comparar o
 * carrinho de verdade vale procurar o EAN nos que faltaram.
 */
export async function fillMissingOffers(productId, { maxAgeMinutes = 720 } = {}) {
  const product = q.productById.get(productId);
  if (!product?.ean) return hydrate(productId);

  const existing = q.offersFor.all(productId);
  const stale = new Set();
  for (const market of MARKETS) {
    const offer = existing.find((o) => o.market === market.key);
    if (!offer) stale.add(market.key);
    else {
      const age = (Date.now() - Date.parse(`${offer.updated_at.replace(' ', 'T')}Z`)) / 60000;
      if (age > maxAgeMinutes) stale.add(market.key);
    }
  }
  if (!stale.size) return hydrate(productId);

  const targets = MARKETS.filter((m) => stale.has(m.key));
  const { results } = await acrossMarkets((m) => m.byEan(product.ean), { markets: targets });
  const found = results.map((r) => r.value).filter(Boolean);
  if (found.length) saveMany(found);
  return hydrate(productId);
}

export function searchLocal(term, { limit = 30 } = {}) {
  const like = `%${normalizeTerm(term).replace(/\s+/g, '%')}%`;
  const rows = db
    .prepare(
      `SELECT p.id
         FROM products p
         JOIN offers o ON o.product_id = p.id AND o.price > 0
        WHERE lower(p.name) LIKE ?
        GROUP BY p.id
        ORDER BY COUNT(DISTINCT o.market) DESC, MIN(o.price)
        LIMIT ?`,
    )
    .all(like, limit);
  return rows.map((r) => hydrate(r.id)).filter(Boolean);
}

export function categoryCounts() {
  return db
    .prepare(
      `SELECT p.category AS category, COUNT(*) AS total
         FROM products p
         JOIN offers o ON o.product_id = p.id AND o.price > 0
        GROUP BY p.category`,
    )
    .all();
}

export function productsByCategory(category, { limit = 60, offset = 0 } = {}) {
  const rows = db
    .prepare(
      `SELECT p.id
         FROM products p
         JOIN offers o ON o.product_id = p.id AND o.price > 0
        WHERE p.category = ?
        GROUP BY p.id
        ORDER BY COUNT(DISTINCT o.market) DESC, p.name
        LIMIT ? OFFSET ?`,
    )
    .all(category, limit, offset);
  return rows.map((r) => hydrate(r.id)).filter(Boolean);
}

/** Media e ultimo preco realmente pago, por item. Usado para estimar a compra. */
export function priceStats(key) {
  return db
    .prepare(
      `SELECT COUNT(*) AS times, AVG(unit_price) AS avg, MIN(unit_price) AS min, MAX(unit_price) AS max,
              (SELECT unit_price FROM price_history WHERE match_key = ? ORDER BY recorded_at DESC LIMIT 1) AS last
         FROM price_history WHERE match_key = ?`,
    )
    .get(key, key);
}

export { classify };
