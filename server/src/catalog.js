import { db, metaGet, metaSet } from './db.js';
import { fold, classify, CATEGORIES } from './categories.js';
import { termosDe } from './catalog-terms.js';
import { subclassify, parseSize, subsOf } from './facets.js';
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
    RETURNING id
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
  setDerived: db.prepare(
    'UPDATE products SET subcategory = ?, size_label = ?, size_value = ?, size_kind = ? WHERE id = ?',
  ),
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

/**
 * Subdivisao e tamanho saem do nome, e o nome vem do mercado -- entao valem
 * ser recalculados sempre que o produto entra ou muda de categoria. A escrita
 * so acontece se algo mudou: no seed sao milhares de ofertas.
 */
async function refreshDerived(product) {
  const sub = subclassify(product.category, product.name);
  const size = parseSize(product.name);
  if (
    (product.subcategory ?? null) === sub &&
    (product.size_label ?? null) === (size?.label ?? null) &&
    (product.size_value ?? null) === (size?.value ?? null)
  ) {
    return;
  }
  await q.setDerived.run(sub, size?.label ?? null, size?.value ?? null, size?.kind ?? null, product.id);
}

/** Grava (ou atualiza) um produto vindo de um mercado e devolve o id interno. */
export const saveOffer = db.transaction(async (item) => {
  const key = matchKey(item);
  let product = await q.productByKey.get(key);
  if (!product) {
    const novo = await q.insertProduct.get({
      ean: item.ean || null,
      matchKey: key,
      name: item.name,
      brand: item.brand || null,
      category: item.category || 'outros',
      imageUrl: item.imageUrl || null,
      unit: item.unit || 'un',
    });
    product = await q.productById.get(novo.id);
  } else {
    await q.touchProduct.run({
      id: product.id,
      name: item.name,
      brand: item.brand || null,
      imageUrl: item.imageUrl || null,
      category: item.category || 'outros',
    });
    product = await q.productById.get(product.id);
  }
  await refreshDerived(product);
  await q.upsertOffer.run({
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

/**
 * Uma busca traz dezenas de ofertas de uma vez. Vao todas na mesma transacao:
 * com o banco fora do servidor, cada ida e volta custa, e abrir uma transacao
 * por produto multiplicaria isso por trinta.
 */
const saveMany = db.transaction(async (items) => {
  const ids = [];
  for (const item of items) ids.push(await saveOffer(item));
  return ids;
});

/** Monta o objeto que o app consome: produto + preco em cada mercado. */
function montar(product, rows) {
  const offers = rows
    .filter((o) => o.price > 0)
    .sort((a, b) => a.price - b.price)
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
    subcategory: product.subcategory,
    sizeLabel: product.size_label,
    imageUrl: product.image_url,
    unit: product.unit,
    categoryLocked: !!product.category_locked,
    offers,
    cheapest,
    marketsCount: withStock.length,
  };
}

export async function hydrate(productId) {
  const product = await q.productById.get(productId);
  if (!product) return null;
  return montar(product, await q.offersFor.all(productId));
}

/**
 * Hidrata uma lista de produtos em duas consultas, nao em duas por produto.
 * Um corredor tem sessenta itens: com o banco fora do servidor, o laco ingenuo
 * viraria cento e vinte idas e voltas de rede para desenhar uma tela.
 * A ordem dos ids e mantida -- e nela que vem a relevancia da busca.
 */
export async function hidratarVarios(ids) {
  if (!ids.length) return [];
  const produtos = await db.prepare('SELECT * FROM products WHERE id = ANY(?)').all(ids);
  const ofertas = await db.prepare('SELECT * FROM offers WHERE product_id = ANY(?)').all(ids);
  const porProduto = new Map();
  for (const oferta of ofertas) {
    if (!porProduto.has(oferta.product_id)) porProduto.set(oferta.product_id, []);
    porProduto.get(oferta.product_id).push(oferta);
  }
  const porId = new Map(produtos.map((p) => [p.id, p]));
  return ids
    .map((id) => (porId.has(id) ? montar(porId.get(id), porProduto.get(id) || []) : null))
    .filter(Boolean);
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
    const cached = fresh ? null : await q.readCache.get(market.key, normalized, ttl);
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
      const ids = await saveMany(value.filter((p) => p.name && p.price > 0));
      await q.writeCache.run(market.key, normalized, JSON.stringify(ids));
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
  for (const product of await hidratarVarios([...ranking.keys()])) {
    // Sem preco em nenhum mercado o produto nao serve para nada aqui: nao da
    // para comparar, nao entra na estimativa da lista.
    if (!product.marketsCount) continue;
    const entry = ranking.get(product.id);
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
  const product = await q.productById.get(productId);
  if (!product?.ean) return hydrate(productId);

  const existing = await q.offersFor.all(productId);
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
  if (found.length) await saveMany(found);
  return hydrate(productId);
}

export async function searchLocal(term, { limit = 30 } = {}) {
  const like = `%${normalizeTerm(term).replace(/\s+/g, '%')}%`;
  const rows = await db
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
  return hidratarVarios(rows.map((r) => r.id));
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

export async function productsByCategory(category, { limit = 60, offset = 0 } = {}) {
  const rows = await db
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
  return hidratarVarios(rows.map((r) => r.id));
}

/**
 * O corredor com os filtros que afunilam: tipo, marca e tamanho.
 *
 * A contagem de cada filtro ignora a propria dimensao -- com "Refrigerante"
 * marcado, a lista de marcas mostra quantos refrigerantes cada marca tem, e a
 * de tipos continua mostrando o corredor inteiro. E o que permite trocar de
 * tipo sem ficar sem resultado nenhum.
 *
 * Um corredor tem centenas de produtos, nao milhares: sai numa consulta e o
 * cruzamento e feito aqui, que fica mais simples de ler do que seis SQLs.
 */
export async function categoryView(category, { sub = null, brand = null, size = null, limit = 60, offset = 0 } = {}) {
  const rows = await db
    .prepare(
      `SELECT p.id, p.name, p.brand, p.subcategory, p.size_label, p.size_value,
              COUNT(DISTINCT o.market) AS mercados
         FROM products p
         JOIN offers o ON o.product_id = p.id AND o.price > 0
        WHERE p.category = ?
        GROUP BY p.id
        ORDER BY mercados DESC, p.name`,
    )
    .all(category);

  const casaSub = (r) => !sub || (sub === 'outros' ? !r.subcategory : r.subcategory === sub);
  const casaMarca = (r) => !brand || r.brand === brand;
  const casaTamanho = (r) => !size || r.size_label === size;
  const casa = (r, exceto) =>
    (exceto === 'sub' || casaSub(r)) && (exceto === 'brand' || casaMarca(r)) && (exceto === 'size' || casaTamanho(r));

  const contar = (exceto, campo) => {
    const mapa = new Map();
    for (const r of rows) {
      if (!casa(r, exceto)) continue;
      const valor = r[campo];
      if (valor == null || valor === '') continue;
      const atual = mapa.get(valor) || { count: 0, ordem: r.size_value ?? 0 };
      atual.count += 1;
      mapa.set(valor, atual);
    }
    return mapa;
  };

  const porSub = contar('sub', 'subcategory');
  const porMarca = contar('brand', 'brand');
  const porTamanho = contar('size', 'size_label');

  const subs = subsOf(category)
    .filter((s) => porSub.has(s.key))
    .map((s) => ({ ...s, count: porSub.get(s.key).count }));
  // Nem todo produto cai numa regra; sem esta linha eles ficariam invisiveis
  // para quem estivesse filtrando.
  const semSub = rows.filter((r) => casa(r, 'sub') && !r.subcategory).length;
  if (semSub && subs.length) subs.push({ key: 'outros', label: 'Outros', count: semSub });

  const brands = [...porMarca.entries()]
    .map(([key, v]) => ({ key, label: key, count: v.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, 24);

  // Corta pelos tamanhos mais comuns e so depois ordena do menor para o
  // maior: cortar na ordem de tamanho jogaria fora justamente o "5 kg".
  // Tamanho de um produto so nao e filtro, e ficava na frente da fila
  // empurrando o "1 kg" para fora da tela -- some, a menos que sobre pouco.
  const todosTamanhos = [...porTamanho.entries()]
    .map(([key, v]) => ({ key, label: key, count: v.count, ordem: v.ordem }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);
  const usados = todosTamanhos.filter((t) => t.count > 1);
  const sizes = (usados.length >= 2 ? usados : todosTamanhos)
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ ordem, ...resto }) => resto);

  const filtrados = rows.filter((r) => casa(r, null));
  const products = await hidratarVarios(filtrados.slice(offset, offset + limit).map((r) => r.id));

  return { products, total: filtrados.length, facets: { subs, brands, sizes } };
}

/**
 * As prateleiras da home: cada categoria com alguns produtos, numa consulta so.
 * Sem isso a tela inicial faria uma chamada por categoria.
 */
/**
 * Foto escolhida a mao para ilustrar o corredor. Guarda-se o produto, nao a
 * URL: o mercado troca o arquivo da imagem de vez em quando, e o produto
 * continua o mesmo.
 */
export async function setCategoryCover(category, productId) {
  if (productId == null) {
    await db.prepare('DELETE FROM meta WHERE key = ?').run(`cover:${category}`);
    return null;
  }
  const product = await q.productById.get(productId);
  if (!product) return null;
  await metaSet(`cover:${category}`, String(productId));
  return product.image_url;
}

async function coverOf(category, products) {
  const escolhido = await metaGet(`cover:${category}`);
  if (escolhido) {
    const p = await q.productById.get(Number(escolhido));
    if (p?.image_url) return { url: p.image_url, escolhida: true };
  }
  // Sem escolha, a foto do primeiro produto do corredor que tenha uma.
  return { url: products.find((p) => p.imageUrl)?.imageUrl || null, escolhida: false };
}

export async function shelves({ perCategory = 10 } = {}) {
  const counts = new Map((await categoryCounts()).map((c) => [c.category, Number(c.total)]));
  // Todos os corredores aparecem, inclusive os que ainda nao tem produto: um
  // mercado tem o corredor de higiene mesmo quando a prateleira esta por
  // encher, e esconde-lo faz o app parecer quebrado. Vazio, ele se enche na
  // primeira vez que alguem entra.
  const corredores = [];
  for (const c of CATEGORIES.filter((c) => c.key !== 'outros' || counts.get(c.key))) {
    const products = counts.get(c.key) ? await productsByCategory(c.key, { limit: perCategory }) : [];
    const cover = await coverOf(c.key, products);
    corredores.push({
      key: c.key,
      label: c.label,
      emoji: c.emoji,
      total: counts.get(c.key) || 0,
      coverUrl: cover.url,
      coverChosen: cover.escolhida,
      products,
    });
  }
  return corredores;
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
    const atual = Number(
      (
        await db
          .prepare(
            `SELECT COUNT(*) AS n FROM products p JOIN offers o ON o.product_id = p.id AND o.price > 0 WHERE p.category = ?`,
          )
          .get(key)
      ).n,
    );
    if (atual >= minimo) break;
    await unifiedSearch(termo, { limit: 24 }).catch(() => null);
    buscados++;
  }
  return { buscados };
}

// Suba este numero ao mexer nas regras de categoria: a categoria fica gravada
// no produto, entao corrigir a regra nao arruma sozinho o que ja foi salvo.
const CLASSIFIER_VERSION = 5;

/**
 * Reclassifica o catalogo com as regras atuais. Usa a categoria que o mercado
 * informou (guardada na oferta) mais o nome, do mesmo jeito que na entrada.
 */
export async function reclassifyAll() {
  // Produto com categoria travada tambem entra: a categoria dele nao se mexe,
  // mas subdivisao e tamanho vem do nome e podem estar por preencher.
  const rows = await db
    .prepare(
      `SELECT p.id, p.name, p.category, p.category_locked, p.subcategory, p.size_label, p.size_value,
              (SELECT o.category FROM offers o WHERE o.product_id = p.id AND o.category IS NOT NULL LIMIT 1) AS raw
         FROM products p`,
    )
    .all();
  const update = db.prepare('UPDATE products SET category = ? WHERE id = ?');
  let mudados = 0;
  const run = db.transaction(async () => {
    for (const row of rows) {
      let categoria = row.category;
      if (!row.category_locked) {
        categoria = classify(row.raw || '', row.name);
        if (categoria !== row.category) {
          await update.run(categoria, row.id);
          mudados++;
        }
      }
      await refreshDerived({ ...row, category: categoria });
    }
  });
  await run();
  return { total: rows.length, mudados };
}

/** Roda a reclassificacao uma vez quando as regras mudam de versao. */
export async function ensureClassifierFresh() {
  if (Number((await metaGet('classifier')) || 0) >= CLASSIFIER_VERSION) return null;
  const r = await reclassifyAll();
  await metaSet('classifier', CLASSIFIER_VERSION);
  return r;
}

/** Media e ultimo preco realmente pago, por item. Usado para estimar a compra. */
/**
 * Corrige a categoria de um produto a pedido de quem usa. Fica travada: o
 * classificador automatico acerta na maioria, mas quando erra e a pessoa
 * arruma, nao faz sentido a proxima versao das regras desfazer.
 */
export async function setCategory(productId, category) {
  const info = await db
    .prepare("UPDATE products SET category = ?, category_locked = 1, updated_at = datetime('now') WHERE id = ?")
    .run(category, productId);
  if (!info.changes) return null;
  // A subdivisao segue a categoria: mudar de corredor a mao tem de refazer o
  // "tipo", senao o produto vai para o corredor novo com o filtro do antigo.
  await refreshDerived(await q.productById.get(productId));
  return hydrate(productId);
}

/**
 * "O Festval nao tem esse arroz -- o que ele tem de parecido?"
 *
 * Procura no proprio catalogo, entre os produtos que aquele mercado tem em
 * estoque, o mais proximo do que se queria: mesma subdivisao do corredor,
 * mesmo tamanho, mesma marca, e o quanto o nome bate. Nao consulta a rede:
 * dentro do mercado o sinal e ruim e a resposta tem de ser imediata.
 */
export async function alternativesIn(market, { productId = null, name = '', limit = 6 } = {}) {
  const base = productId ? await q.productById.get(productId) : null;
  const alvo = fold(base?.name || name);
  if (!alvo) return [];
  const palavras = alvo.split(/[^a-z0-9]+/).filter((w) => w.length > 2);

  const rows = await db
    .prepare(
      `SELECT p.id, p.name, p.brand, p.subcategory, p.size_label, MIN(o.price) AS preco
         FROM products p
         JOIN offers o ON o.product_id = p.id AND o.market = ? AND o.price > 0 AND o.available = 1
        WHERE p.category = COALESCE(?, p.category) AND p.id != COALESCE(?, -1)
        GROUP BY p.id`,
    )
    .all(market, base?.category ?? null, base?.id ?? null);

  const pontuados = [];
  for (const row of rows) {
    const nome = fold(row.name);
    const casadas = palavras.filter((w) => nome.includes(w)).length;
    // Sem nenhuma palavra em comum nao e parecido, e so do mesmo corredor.
    if (!casadas && (!base || row.subcategory !== base.subcategory)) continue;
    let pontos = palavras.length ? (casadas / palavras.length) * 3 : 0;
    if (base) {
      if (base.subcategory && row.subcategory === base.subcategory) pontos += 4;
      if (base.size_label && row.size_label === base.size_label) pontos += 2;
      if (base.brand && row.brand === base.brand) pontos += 1;
    }
    pontuados.push({ id: row.id, pontos, preco: row.preco });
  }

  const melhores = pontuados.sort((a, b) => b.pontos - a.pontos || a.preco - b.preco).slice(0, limit);
  const produtos = new Map((await hidratarVarios(melhores.map((c) => c.id))).map((p) => [p.id, p]));
  return melhores
    .filter((c) => produtos.has(c.id))
    .map((c) => ({ product: produtos.get(c.id), priceHere: c.preco }));
}

/**
 * A chave com que o preco pago entra no historico -- e com que ele e lido
 * depois. Item com produto vinculado usa a chave do produto (o EAN, quando
 * existe); item escrito a mao usa o nome normalizado.
 *
 * Isso estava desencontrado: o fecho da compra gravava sempre pelo nome, e o
 * dialogo do produto lia pelo EAN. Resultado: "Ja pagamos" ficava vazio para
 * todo produto de catalogo, que e justamente a maioria.
 */
export async function historyKeyFor({ productId, name }) {
  if (productId) {
    const row = await db.prepare('SELECT match_key FROM products WHERE id = ?').get(productId);
    if (row?.match_key) return row.match_key;
  }
  return matchKey({ name });
}

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
