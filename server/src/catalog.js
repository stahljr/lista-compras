import { db, metaGet, metaSet } from './db.js';
import { fold, classify, CATEGORIES, categoryLabel, categoryOrder } from './categories.js';
import { termosDe } from './catalog-terms.js';
import { subclassify, parseSize, facetar, filtrar } from './facets.js';
import { assinaturaDe } from './unificar.js';
import { MARKETS, MARKET_BY_KEY, acrossMarkets } from './markets/index.js';

const SEARCH_TTL_MINUTES = Number(process.env.SEARCH_TTL_MINUTES || 360);

/**
 * Depois de quantos dias um preco deixa de ser "o preco" e passa a ser "o
 * preco daquele dia".
 *
 * Tres dias porque o refresher reconsulta bem mais rapido que isso: se uma
 * etiqueta chegou a essa idade, aquele mercado parou de responder.
 */
const DIAS_ATE_ENVELHECER = Number(process.env.PRICE_STALE_DAYS || 3);

const precoEnvelhecido = (quando) => {
  if (!quando) return false;
  const texto = String(quando);
  const t = Date.parse(texto.includes('T') ? texto : `${texto.replace(' ', 'T')}Z`);
  return Number.isNaN(t) ? false : (Date.now() - t) / 86400000 > DIAS_ATE_ENVELHECER;
};

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
  // A chave achou um produto que ja foi reconhecido como repeticao: a oferta
  // pertence ao que ficou. Sem isto, a proxima consulta ao mercado ressuscita
  // o duplicado -- ele volta com oferta e reaparece na tela.
  for (let salto = 0; product?.merged_into && salto < 5; salto++) {
    const alvo = await q.productById.get(product.merged_into);
    if (!alvo) break;
    product = alvo;
  }
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
      // Calculado aqui, e nao na tela: a mesma regra vale para o cartao, para
      // o comparador e para a estimativa da compra. Duas implementacoes da
      // mesma regra acabariam discordando.
      stale: precoEnvelhecido(o.updated_at),
    }));
  const withStock = offers.filter((o) => o.available);
  const frescas = withStock.filter((o) => !o.stale);
  /**
   * O "mais barato" prefere preco fresco.
   *
   * Um mercado que parou de responder guarda o ultimo preco que deu, e com o
   * tempo ele vira o menor numero da lista so por estar velho. Sem esta
   * preferencia o comparador manda a compra para lá por um preco que talvez
   * nao exista mais -- e o selo de economia e calculado contra ele. Preco
   * velho so vira o mais barato quando nao ha nenhum fresco: ai e a unica
   * informacao que temos, e a tela diz de quando e.
   */
  const cheapest = frescas[0] || withStock[0] || offers[0] || null;
  return {
    id: product.id,
    ean: product.ean,
    matchKey: product.match_key,
    name: product.name,
    brand: product.brand,
    category: product.category,
    subcategory: product.subcategory,
    sizeLabel: product.size_label,
    sizeValue: product.size_value,
    imageUrl: product.image_url,
    unit: product.unit,
    categoryLocked: !!product.category_locked,
    offers,
    cheapest,
    marketsCount: withStock.length,
  };
}

export async function hydrate(productId) {
  let product = await q.productById.get(productId);
  if (!product) return null;
  /**
   * Segue o ponteiro da uniao.
   *
   * Uma lista feita antes da uniao guarda o id do produto que virou repeticao.
   * Sem seguir, aquele item abriria um produto sem oferta -- some da tela sem
   * explicacao. Seguindo, ele abre o produto que ficou, com os precos todos.
   * O `while` cobre a fusao em cadeia (A virou B, B virou C), e o teto evita
   * laco infinito se algum dia um ciclo aparecer.
   */
  for (let salto = 0; product.merged_into && salto < 5; salto++) {
    const alvo = await q.productById.get(product.merged_into);
    if (!alvo) break;
    product = alvo;
  }
  return montar(product, await q.offersFor.all(product.id));
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

  /**
   * Id que virou repeticao passa a valer pelo produto que ficou.
   *
   * O cache de busca guarda os ids de quando a busca foi feita, e alguns deles
   * podem ter sido unidos depois. Sem esta troca, um resultado de cache antigo
   * traria de volta o produto vazio -- e dois ids diferentes apontando para o
   * mesmo produto trariam o mesmo cartao duas vezes, que e exatamente o que a
   * uniao existe para acabar.
   */
  const paraOVencedor = new Map(produtos.filter((p) => p.merged_into).map((p) => [p.id, p.merged_into]));
  const alvos = [...new Set(ids.map((id) => paraOVencedor.get(id) ?? id))];
  const faltando = alvos.filter((id) => !produtos.some((p) => p.id === id));
  if (faltando.length) {
    produtos.push(...(await db.prepare('SELECT * FROM products WHERE id = ANY(?)').all(faltando)));
  }

  const ofertas = await db.prepare('SELECT * FROM offers WHERE product_id = ANY(?)').all(alvos);
  const porProduto = new Map();
  for (const oferta of ofertas) {
    if (!porProduto.has(oferta.product_id)) porProduto.set(oferta.product_id, []);
    porProduto.get(oferta.product_id).push(oferta);
  }
  const porId = new Map(produtos.map((p) => [p.id, p]));
  return alvos
    .map((id) => (porId.has(id) ? montar(porId.get(id), porProduto.get(id) || []) : null))
    .filter(Boolean);
}

/**
 * Busca o termo nos quatro mercados em paralelo e devolve uma lista unica,
 * onde cada produto ja carrega o preco de cada mercado que o tem.
 * O resultado por mercado fica em cache para nao bater nos sites a cada tecla.
 */
export async function unifiedSearch(term, { limit = 24, fresh = false, ordem = null } = {}) {
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
  let products = candidates.map((c) => c.product);
  // Ordem pedida a mao passa por cima da relevancia -- quem escolheu "menor
  // preco" quer o menor preco, nao o mais relevante entre os baratos.
  if (ORDENS[ordem]) {
    const linhas = ordenar(products.map(linhaDeProduto), ordem);
    const posicao = new Map(linhas.map((l, i) => [l.id, i]));
    products = [...products].sort((a, b) => (posicao.get(a.id) ?? 0) - (posicao.get(b.id) ?? 0));
  }
  products = products.slice(0, limit);

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
  if (!product) return null;

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
  const achados = [];

  // Primeiro pelo codigo de barras, que e a identidade exata do produto.
  if (product.ean) {
    const { results } = await acrossMarkets((m) => m.byEan(product.ean), { markets: targets });
    achados.push(...results.map((r) => r.value).filter(Boolean));
  }

  /**
   * Depois pelo nome, nos mercados que continuaram sem responder.
   *
   * Isto faltava, e o preco disso era o app afirmar "nao tem este item" sobre
   * mercado que nunca foi consultado. Duas situacoes caiam nesse buraco:
   *
   *   - produto sem EAN -- batata, pao, carne, tudo que se vende a peso. A
   *     funcao desistia na primeira linha, e ali estao justamente os itens
   *     que ele compra por quilo;
   *   - EAN diferente para a mesma coisa entre redes. "Arroz Urbano 1kg
   *     Parboilizado Saquinho" tem um codigo no Angeloni e outro no Condor,
   *     entao a busca por codigo nao achava -- e o Condor era mais barato.
   *
   * O que impede isto de virar preco errado: a assinatura da unificacao. Um
   * resultado so e aceito se marca, tamanho e as palavras do nome baterem com
   * o produto que se procura. E o mesmo criterio que decide se dois produtos
   * do catalogo sao um -- se e bom para juntar, e bom para comparar.
   */
  const jaTem = new Set(achados.map((a) => a.market.key));
  const faltam = targets.filter((m) => !jaTem.has(m.key));
  if (faltam.length) {
    const nossa = assinaturaDe(product);
    if (nossa) {
      const { results } = await acrossMarkets((m) => m.search(product.name, 8), { markets: faltam });
      for (const { value } of results) {
        const igual = (value || []).find(
          (candidato) =>
            candidato.price > 0 &&
            assinaturaDe({ name: candidato.name, brand: candidato.brand, size_label: null }) === nossa,
        );
        if (igual) achados.push(igual);
      }
    }
  }

  if (achados.length) await saveMany(achados);
  return hydrate(productId);
}

export async function searchLocal(term, { limit = 30 } = {}) {
  const like = `%${normalizeTerm(term).replace(/\s+/g, '%')}%`;
  const rows = await db
    .prepare(
      `SELECT p.id
         FROM products p
         JOIN offers o ON o.product_id = p.id AND o.price > 0
        WHERE p.merged_into IS NULL AND lower(p.name) LIKE ?
        GROUP BY p.id
        ORDER BY COUNT(DISTINCT o.market) DESC, MIN(o.price)
        LIMIT ?`,
    )
    .all(like, limit);
  return hidratarVarios(rows.map((r) => r.id));
}

/**
 * Quantos produtos por corredor. Com `mercados`, conta so o que aquelas redes
 * tem -- e o que faz o numero na etiqueta do corredor dizer a verdade quando
 * alguem escolheu onde vai comprar.
 */
export function categoryCounts(mercados = []) {
  const filtro = listaDeMercados(mercados);
  return db
    .prepare(
      `SELECT p.category AS category, COUNT(*) AS total
         FROM products p
         JOIN offers o ON o.product_id = p.id AND o.price > 0
              ${filtro.clausula}
        WHERE p.merged_into IS NULL
        GROUP BY p.category`,
    )
    .all(...filtro.args);
}

export async function productsByCategory(category, { limit = 60, offset = 0, mercados = [] } = {}) {
  const filtro = listaDeMercados(mercados);
  const rows = await db
    .prepare(
      `SELECT p.id
         FROM products p
         JOIN offers o ON o.product_id = p.id AND o.price > 0
              ${filtro.clausula}
        WHERE p.merged_into IS NULL AND p.category = ?
        GROUP BY p.id
        ORDER BY COUNT(DISTINCT o.market) DESC, p.name
        LIMIT ? OFFSET ?`,
    )
    .all(...filtro.args, category, limit, offset);
  return hidratarVarios(rows.map((r) => r.id));
}

/**
 * O recorte por mercado, como pedaco de SQL. Entra no ON do JOIN e nao no
 * WHERE de proposito: assim o produto so conta se a *oferta* for de uma das
 * redes escolhidas -- no WHERE, um produto do Condor entraria por ter
 * qualquer oferta e depois seria contado errado.
 */
function listaDeMercados(mercados) {
  const chaves = (Array.isArray(mercados) ? mercados : String(mercados || '').split(','))
    .map((m) => String(m).trim())
    .filter((m) => MARKET_BY_KEY.has(m));
  if (!chaves.length) return { clausula: '', args: [] };
  return { clausula: `AND o.market IN (${chaves.map(() => '?').join(', ')})`, args: chaves };
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
/**
 * O contexto que os filtros usam para se nomear e se ordenar.
 */
export const contextoDeFiltros = (category = null) => ({
  category,
  categoryLabel,
  categoryOrder,
  marketLabel: (key) => MARKET_BY_KEY.get(key)?.label || key,
  marketOrder: (key) => MARKETS.findIndex((m) => m.key === key),
});

export const DIMENSOES_CORREDOR = ['sub', 'brand', 'size', 'market'];
export const DIMENSOES_BUSCA = ['category', 'brand', 'size', 'market'];

/** Transforma o produto hidratado no formato que o motor de filtros entende. */
export const linhaDeProduto = (p) => {
  const validas = p.offers.filter((o) => o.available && o.price > 0);
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    subcategory: p.subcategory,
    size_label: p.sizeLabel,
    size_value: p.sizeValue,
    markets: validas.map((o) => o.market),
    // O preco do produto, para ordenar, e o mais barato que se acha dele: e a
    // resposta a "quanto me custa levar isto", que e a pergunta de quem
    // ordena por preco.
    // Preco envelhecido nao conta enquanto houver fresco: ordenar por "menor
    // preco" nao pode subir produto por causa de etiqueta vencida.
    preco: (() => {
      const frescas = validas.filter((o) => !o.stale);
      const fonte = frescas.length ? frescas : validas;
      return fonte.length ? Math.min(...fonte.map((o) => o.price)) : null;
    })(),
  };
};

/**
 * As ordens em que uma prateleira pode aparecer.
 *
 * Trabalham sobre a "linha" do produto -- a mesma que os filtros usam -- e por
 * isso servem tanto ao corredor (que ordena antes de hidratar, para nao
 * carregar centenas de produtos a toa) quanto a busca e aos favoritos.
 *
 * Sem preco vai para o fim em qualquer ordem de preco: produto sem preco nao e
 * o mais barato da prateleira, e no topo ele so atrapalharia.
 */
const semPreco = (r) => r.preco == null || r.preco <= 0;
export const ORDENS = {
  barato: (a, b) => (semPreco(a) ? 1 : semPreco(b) ? -1 : a.preco - b.preco),
  caro: (a, b) => (semPreco(a) ? 1 : semPreco(b) ? -1 : b.preco - a.preco),
  nome: (a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'),
  mercados: (a, b) => (b.markets?.length ?? 0) - (a.markets?.length ?? 0) || ORDENS.nome(a, b),
};

/**
 * Reordena a prateleira, se pediram. Sem `ordem`, cada tela mantem a sua
 * ordem natural -- o corredor mostra primeiro o que esta em mais mercados, a
 * busca mostra o que casa melhor com o que se digitou, e os favoritos vem na
 * ordem em que foram marcados. Trocar isso por um padrao unico seria perder
 * tres ordens boas para ganhar uma.
 */
export function ordenar(linhas, ordem) {
  const regra = ORDENS[ordem];
  return regra ? [...linhas].sort(regra) : linhas;
}

/**
 * O corredor com os filtros que afunilam: tipo, marca, tamanho e mercado.
 *
 * Um corredor tem centenas de produtos, nao milhares: as colunas que os filtros
 * precisam saem numa consulta, e o cruzamento e feito aqui -- fica mais simples
 * de ler do que oito SQLs, e e o mesmo motor que a busca usa.
 */
export async function categoryView(
  category,
  { sub = null, brand = null, size = null, market = null, ordem = null, limit = 60, offset = 0 } = {},
) {
  const rows = (
    await db
      .prepare(
        `SELECT p.id, p.name, p.brand, p.subcategory, p.size_label, p.size_value,
                COUNT(DISTINCT o.market) AS mercados,
                -- Preco de ordenar e o mais barato *disponivel*, igual ao que o
                -- cartao mostra. Sem o CASE, um produto em falta puxaria a
                -- prateleira para cima com um preco que ninguem pode pagar.
                MIN(CASE WHEN o.available = 1 THEN o.price END) AS preco,
                string_agg(DISTINCT o.market, ',') AS lojas
           FROM products p
           JOIN offers o ON o.product_id = p.id AND o.price > 0
          WHERE p.merged_into IS NULL AND p.category = ?
          GROUP BY p.id
          ORDER BY mercados DESC, p.name`,
      )
      .all(category)
  ).map((r) => ({ ...r, preco: r.preco == null ? null : Number(r.preco), markets: String(r.lojas || '').split(',').filter(Boolean) }));

  const filtros = { sub, brand, size, market };
  const ctx = contextoDeFiltros(category);
  const facets = facetar(rows, filtros, DIMENSOES_CORREDOR, ctx);
  // Ordenar depois de filtrar, e antes de paginar: a pagina 2 do "mais
  // barato" tem de continuar a pagina 1, e nao reordenar um punhado de
  // produtos ja escolhidos por outro critério.
  const filtrados = ordenar(filtrar(rows, filtros, DIMENSOES_CORREDOR), ordem);
  const products = await hidratarVarios(filtrados.slice(offset, offset + limit).map((r) => r.id));

  return { products, total: filtrados.length, facets };
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

export async function shelves({ perCategory = 10, mercados = [] } = {}) {
  const counts = new Map((await categoryCounts(mercados)).map((c) => [c.category, Number(c.total)]));
  // Todos os corredores aparecem, inclusive os que ainda nao tem produto: um
  // mercado tem o corredor de higiene mesmo quando a prateleira esta por
  // encher, e esconde-lo faz o app parecer quebrado. Vazio, ele se enche na
  // primeira vez que alguem entra.
  const corredores = [];
  for (const c of CATEGORIES.filter((c) => c.key !== 'outros' || counts.get(c.key))) {
    const products = counts.get(c.key) ? await productsByCategory(c.key, { limit: perCategory, mercados }) : [];
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
export async function fillCategory(key, { minimo = 40, maxTermos = 5 } = {}) {
  const termos = termosDe(key);
  if (!termos.length) return { buscados: 0, novos: 0 };

  // Termo que ja esta no cache nao traz nada de novo: a busca responderia do
  // proprio cache sem falar com os mercados. Entao cada rodada pega os termos
  // ainda nao usados -- e assim tocar "buscar mais" traz produto de verdade.
  const usados = new Set(
    (await db.prepare('SELECT DISTINCT term FROM search_cache').all()).map((r) => r.term),
  );
  const inéditos = termos.filter((t) => !usados.has(normalizeTerm(t)));
  const fila = (inéditos.length ? inéditos : termos).slice(0, maxTermos);

  const antes = await contarCategoria(key);
  let buscados = 0;
  for (const termo of fila) {
    if ((await contarCategoria(key)) >= minimo) break;
    await unifiedSearch(termo, { limit: 24 }).catch(() => null);
    buscados++;
  }
  const depois = await contarCategoria(key);
  return { buscados, novos: depois - antes, total: depois, restantes: Math.max(0, inéditos.length - buscados) };
}

async function contarCategoria(key) {
  const { n } = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM products p
         JOIN offers o ON o.product_id = p.id AND o.price > 0
        WHERE p.merged_into IS NULL AND p.category = ?`,
    )
    .get(key);
  return Number(n);
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
         FROM products p
        WHERE p.merged_into IS NULL`,
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
        WHERE p.merged_into IS NULL AND p.category = COALESCE(?, p.category) AND p.id != COALESCE(?, -1)
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

/** Marca ou desmarca o favorito da casa, e devolve como ficou. */
export async function toggleFavorite(householdId, productId) {
  const existe = await db
    .prepare('SELECT 1 FROM favorites WHERE household_id = ? AND product_id = ?')
    .get(householdId, productId);
  if (existe) {
    await db.prepare('DELETE FROM favorites WHERE household_id = ? AND product_id = ?').run(householdId, productId);
    return false;
  }
  await db
    .prepare('INSERT INTO favorites (household_id, product_id) VALUES (?, ?) ON CONFLICT DO NOTHING')
    .run(householdId, productId);
  return true;
}

export async function favoriteIds(householdId) {
  const rows = await db
    .prepare('SELECT product_id FROM favorites WHERE household_id = ? ORDER BY created_at DESC')
    .all(householdId);
  return rows.map((r) => r.product_id);
}

/** Os favoritos hidratados, na ordem em que foram marcados. */
/**
 * Os favoritos da casa, com os mesmos filtros das outras prateleiras. O
 * mercado e o que mais importa aqui: "do que eu sempre compro, o que este
 * mercado tem?" e a pergunta que se faz na porta da loja.
 */
export async function favorites(householdId, { limit = 40, filtros = {}, ordem = null } = {}) {
  const todos = await hidratarVarios(await favoriteIds(householdId));
  const porId = new Map(todos.map((p) => [p.id, p]));
  const rows = todos.map(linhaDeProduto);
  const ctx = contextoDeFiltros();
  const facets = facetar(rows, filtros, DIMENSOES_BUSCA, ctx);
  const escolhidas = ordenar(filtrar(rows, filtros, DIMENSOES_BUSCA), ordem);
  const products = escolhidas.slice(0, limit).map((r) => porId.get(r.id));
  return { products, total: escolhidas.length, facets };
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

/**
 * O que esta casa ja pagou por este produto. Por casa de proposito: "ja
 * pagamos" e memoria da familia. Sem o recorte, o preco que uma casa pagou
 * apareceria na tela da outra -- e isso e o inicio de contar o que a outra
 * comprou.
 */
export function priceStats(householdId, key) {
  return db
    .prepare(
      `SELECT COUNT(*) AS times, AVG(unit_price) AS avg, MIN(unit_price) AS min, MAX(unit_price) AS max,
              (SELECT unit_price FROM price_history
                WHERE household_id = ? AND match_key = ?
                ORDER BY recorded_at DESC LIMIT 1) AS last
         FROM price_history WHERE household_id = ? AND match_key = ?`,
    )
    .get(householdId, key, householdId, key);
}

export { classify };
