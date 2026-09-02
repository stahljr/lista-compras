import { db, metaGet, metaSet } from './db.js';
import { fold, classify, CATEGORIES } from './categories.js';
import { termosDe } from './catalog-terms.js';
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

  // Ordenar por numero de mercados primeiro era errado: "Detergente
  // Concentrado Ypê 406g" e "Detergente Concentrado Ypê 416g" sao EANs
  // diferentes, entao cada um aparece num mercado so e perdia para qualquer
  // produto presente em tres -- mesmo um cujo nome nao tem nada a ver com a
  // busca, porque a busca da VTEX tambem casa categoria e descricao.
  // Agora manda a relevancia: a posicao que cada mercado deu ao produto e,
  // sobretudo, se o nome dele contem o que foi digitado. Estar em varios
  // mercados vira um empurrao pequeno, para desempate.
  // Quem digita "detergente concentrado ype" espera, antes de tudo, os produtos
  // cujo nome tem as tres palavras. Entao o casamento do nome e o criterio
  // primario, e nao um peso somado -- somar deixava um produto presente em tres
  // mercados na frente de outro que casava o nome inteiro, porque a relevancia
  // se acumulava por mercado.
  // Dentro do mesmo grau de casamento, decide a posicao que o melhor mercado
  // deu ao produto e, por ultimo, estar em mais lojas.
  const palavras = normalized.split(' ').filter((w) => w.length > 2);
  const candidates = [];
  for (const [id, entry] of ranking) {
    const product = hydrate(id);
    // Sem preco em nenhum mercado o produto nao serve para nada aqui: nao da
    // para comparar, nao entra na estimativa da lista.
    if (!product || !product.marketsCount) continue;
    const nome = fold(product.name);
    const casadas = palavras.filter((w) => nome.includes(w)).length;
    const match = palavras.length ? casadas / palavras.length : 1;
    candidates.push({ product, match: Math.round(match * 20) / 20, best: entry.best, hits: entry.hits });
  }
  candidates.sort((a, b) => b.match - a.match || b.best - a.best || b.hits - a.hits);
  const products = candidates.slice(0, limit).map((c) => c.product);

  return { products, failed, cachedMarkets: usedCache };
}

/**
 * Guarda a melhor posicao que algum mercado deu ao produto -- a melhor, nao a
 * soma: somar era o mesmo que ordenar por numero de mercados de novo.
 */
function rank(ranking, id, index) {
  const entry = ranking.get(id) || { hits: 0, best: 0 };
  entry.hits += 1;
  entry.best = Math.max(entry.best, 1 / (index + 1));
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

/**
 * As prateleiras da home: cada categoria com alguns produtos, numa consulta so.
 * Sem isso a tela inicial faria uma chamada por categoria.
 */
export function shelves({ perCategory = 10 } = {}) {
  const counts = new Map(categoryCounts().map((c) => [c.category, c.total]));
  // Todos os corredores aparecem, inclusive os que ainda nao tem produto: um
  // mercado tem o corredor de higiene mesmo quando a prateleira esta por
  // encher, e esconde-lo faz o app parecer quebrado. Vazio, ele se enche na
  // primeira vez que alguem entra.
  return CATEGORIES.filter((c) => c.key !== 'outros' || counts.get(c.key)).map((c) => ({
    key: c.key,
    label: c.label,
    emoji: c.emoji,
    total: counts.get(c.key) || 0,
    products: counts.get(c.key) ? productsByCategory(c.key, { limit: perCategory }) : [],
  }));
}

/**
 * Enche um corredor buscando nos mercados os termos daquela categoria. E o que
 * permite abrir "Higiene" ou "Pet" e ver produto sem ter rodado o seed antes.
 */
export async function fillCategory(key, { minimo = 12 } = {}) {
  const termos = termosDe(key);
  if (!termos.length) return { buscados: 0 };
  let buscados = 0;
  for (const termo of termos) {
    const atual = db
      .prepare(
        `SELECT COUNT(*) AS n FROM products p JOIN offers o ON o.product_id = p.id AND o.price > 0 WHERE p.category = ?`,
      )
      .get(key).n;
    if (atual >= minimo) break;
    await unifiedSearch(termo, { limit: 24 }).catch(() => null);
    buscados++;
  }
  return { buscados };
}

// Suba este numero ao mexer nas regras de categoria: a categoria fica gravada
// no produto, entao corrigir a regra nao arruma sozinho o que ja foi salvo.
const CLASSIFIER_VERSION = 3;

/**
 * Reclassifica o catalogo com as regras atuais. Usa a categoria que o mercado
 * informou (guardada na oferta) mais o nome, do mesmo jeito que na entrada.
 */
export function reclassifyAll() {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.category,
              (SELECT o.category FROM offers o WHERE o.product_id = p.id AND o.category IS NOT NULL LIMIT 1) AS raw
         FROM products p`,
    )
    .all();
  const update = db.prepare('UPDATE products SET category = ? WHERE id = ?');
  let mudados = 0;
  const run = db.transaction(() => {
    for (const row of rows) {
      const nova = classify(row.raw || '', row.name);
      if (nova !== row.category) {
        update.run(nova, row.id);
        mudados++;
      }
    }
  });
  run();
  return { total: rows.length, mudados };
}

/** Roda a reclassificacao uma vez quando as regras mudam de versao. */
export function ensureClassifierFresh() {
  if (Number(metaGet('classifier') || 0) >= CLASSIFIER_VERSION) return null;
  const r = reclassifyAll();
  metaSet('classifier', CLASSIFIER_VERSION);
  return r;
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
