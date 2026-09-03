import express from 'express';
import {
  unifiedSearch,
  categoryCounts,
  productsByCategory,
  categoryView,
  contextoDeFiltros,
  linhaDeProduto,
  DIMENSOES_BUSCA,
  shelves,
  fillCategory,
  setCategory,
  setCategoryCover,
  hydrate,
  fillMissingOffers,
  priceStats,
  favorites,
  favoriteIds,
  toggleFavorite,
  ORDENS,
} from '../catalog.js';
import { facetar, filtrar } from '../facets.js';
import { CATEGORIES, CATEGORY_BY_KEY } from '../categories.js';
import { marketInfo, marketsBloqueados } from '../markets/index.js';
import { requireAuth } from '../auth.js';
import { warmupCatalog, warmupState, totalDoCatalogo } from '../warmup.js';

export const catalogRouter = express.Router();
// O catalogo e do app, nao da internet: sem sessao nao se consulta preco nem
// se dispara busca nos mercados. E o historico de precos, que sai daqui, e por
// casa -- precisa saber quem esta perguntando.
catalogRouter.use(requireAuth);

// `blocked` diz quais redes estao fora agora e por que. A tela precisa disso
// para nao mostrar "o Condor nao tem nada" quando a verdade e "o Condor nao
// deixou perguntar".
catalogRouter.get('/markets', (_req, res) =>
  res.json({ markets: marketInfo(), blocked: marketsBloqueados() }));

/** A ordem pedida, se for uma das que existem. Nome errado cai no padrao. */
const ordemDe = (req) => (ORDENS[String(req.query.sort || '')] ? String(req.query.sort) : null);

/**
 * Busca nos quatro mercados de uma vez e devolve o preco de cada um -- com os
 * mesmos filtros do corredor, porque quem busca "detergente" tambem quer
 * afunilar por marca, tamanho ou mercado. No corredor a primeira faixa e o
 * tipo; aqui e o corredor, ja que o resultado atravessa varios.
 */
catalogRouter.get('/search', async (req, res, next) => {
  try {
    const term = String(req.query.q || '');
    if (term.trim().length < 2) return res.json({ products: [], total: 0, failed: [], facets: {} });
    const { products, failed, cachedMarkets } = await unifiedSearch(term, {
      limit: Math.min(Number(req.query.limit) || 24, 40),
      fresh: req.query.fresh === '1',
      ordem: ordemDe(req),
    });

    const filtros = {
      category: req.query.category ? String(req.query.category) : null,
      brand: req.query.brand ? String(req.query.brand) : null,
      size: req.query.size ? String(req.query.size) : null,
      market: req.query.market ? String(req.query.market) : null,
    };
    const rows = products.map(linhaDeProduto);
    const ctx = contextoDeFiltros();
    const facets = facetar(rows, filtros, DIMENSOES_BUSCA, ctx);
    const escolhidos = new Set(filtrar(rows, filtros, DIMENSOES_BUSCA).map((r) => r.id));

    res.json({
      products: products.filter((p) => escolhidos.has(p.id)),
      total: escolhidos.size,
      facets,
      // Junta o que falhou nesta busca com quem ja estava fora: a tela precisa
      // saber de todos, nao so dos que foram tentados agora.
      failed: [...failed, ...marketsBloqueados().filter((b) => !failed.some((f) => f.market === b.market))],
      cachedMarkets,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Enche as prateleiras a pedido. Responde na hora e segue trabalhando: quem
 * pediu acompanha por GET, e a tela vai mostrando o que chega.
 */
catalogRouter.post('/warmup', (req, res) => {
  const estado = warmupState();
  if (!estado.rodando) void warmupCatalog({ porCategoria: Math.min(Number(req.body?.porCategoria) || 4, 8) });
  res.json({ warmup: warmupState() });
});

catalogRouter.get('/warmup', async (_req, res, next) => {
  try {
    res.json({ warmup: warmupState(), total: await totalDoCatalogo(), blocked: marketsBloqueados() });
  } catch (err) {
    next(err);
  }
});

/**
 * Os favoritos da casa. Com ?ids=1 devolve so os numeros -- e o que a tela
 * precisa para desenhar o coracao cheio em cada cartao, sem carregar produto.
 */
catalogRouter.get('/favorites', async (req, res, next) => {
  try {
    if (req.query.ids === '1') return res.json({ ids: await favoriteIds(req.user.householdId) });
    const filtros = {};
    for (const dim of ['category', 'brand', 'size', 'market']) if (req.query[dim]) filtros[dim] = String(req.query[dim]);
    const { products, total, facets } = await favorites(req.user.householdId, {
      limit: Math.min(Number(req.query.limit) || 40, 60),
      filtros,
      ordem: ordemDe(req),
    });
    res.json({ products, total, facets, ids: products.map((p) => p.id) });
  } catch (err) {
    next(err);
  }
});

catalogRouter.post('/products/:id/favorite', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!(await hydrate(id))) return res.status(404).json({ error: 'produto nao encontrado' });
    const favorito = await toggleFavorite(req.user.householdId, id);
    res.json({ id, favorite: favorito });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/categories', async (_req, res) => {
  const counts = new Map((await categoryCounts()).map((c) => [c.category, Number(c.total)]));
  res.json({
    categories: CATEGORIES.map((c) => ({ ...c, total: counts.get(c.key) || 0 })),
  });
});

/** Home no estilo mercado: as categorias com uma amostra de cada. */
catalogRouter.get('/shelves', async (req, res, next) => {
  try {
    res.json({
      shelves: await shelves({
        perCategory: Math.min(Number(req.query.perCategory) || 10, 20),
        // "Hoje eu vou no Angeloni": os corredores e as contagens passam a
        // falar so daquelas redes. Aceita mais de uma, separada por virgula.
        mercados: String(req.query.market || '').split(',').filter(Boolean),
      }),
    });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/categories/:key', async (req, res, next) => {
  try {
    const key = req.params.key;
    const filtros = {
      limit: Math.min(Number(req.query.limit) || 60, 100),
      offset: Number(req.query.offset) || 0,
      sub: req.query.sub ? String(req.query.sub) : null,
      brand: req.query.brand ? String(req.query.brand) : null,
      size: req.query.size ? String(req.query.size) : null,
      market: req.query.market ? String(req.query.market) : null,
      ordem: ordemDe(req),
    };
    let view = await categoryView(key, filtros);
    // Corredor vazio (ou quase) busca nos mercados na hora, para nao mostrar
    // prateleira vazia so porque o seed ainda nao passou por ali. Com filtro
    // marcado nao faz sentido: pouco resultado ali e o filtro funcionando.
    const semFiltro = !filtros.sub && !filtros.brand && !filtros.size && !filtros.market;
    if (req.query.fill !== '0' && semFiltro && !filtros.offset && view.products.length < 12) {
      await fillCategory(key, { minimo: 24, maxTermos: 4 });
      view = await categoryView(key, filtros);
    }
    res.json(view);
  } catch (err) {
    next(err);
  }
});

/**
 * Busca mais produtos deste corredor nos mercados, a pedido. Cada toque pega
 * os proximos termos ainda nao usados -- e por isso traz coisa nova, e nao a
 * mesma prateleira de novo.
 */
catalogRouter.post('/categories/:key/fill', async (req, res, next) => {
  try {
    const key = req.params.key;
    if (!CATEGORY_BY_KEY.has(key)) return res.status(400).json({ error: 'categoria desconhecida' });
    const r = await fillCategory(key, { minimo: 400, maxTermos: Math.min(Number(req.body?.termos) || 4, 8) });
    res.json(r);
  } catch (err) {
    next(err);
  }
});

/** Escolhe (ou solta) a foto que ilustra o corredor. */
catalogRouter.patch('/categories/:key/cover', async (req, res, next) => {
  try {
    const key = req.params.key;
    if (!CATEGORY_BY_KEY.has(key)) return res.status(400).json({ error: 'categoria desconhecida' });
    const productId = req.body?.productId == null ? null : Number(req.body.productId);
    const url = await setCategoryCover(key, productId);
    if (productId != null && !url) return res.status(404).json({ error: 'produto nao encontrado' });
    res.json({ coverUrl: url, coverChosen: productId != null });
  } catch (err) {
    next(err);
  }
});

/** Corrige a categoria de um produto (e trava contra a reclassificacao). */
catalogRouter.patch('/products/:id/category', async (req, res, next) => {
  try {
    const category = String(req.body?.category || '');
    if (!CATEGORY_BY_KEY.has(category)) return res.status(400).json({ error: 'categoria desconhecida' });
    const product = await setCategory(Number(req.params.id), category);
    if (!product) return res.status(404).json({ error: 'produto nao encontrado' });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/products/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const product = req.query.refresh === '1' ? await fillMissingOffers(id) : await hydrate(id);
    if (!product) return res.status(404).json({ error: 'produto nao encontrado' });
    res.json({ product, history: await priceStats(req.user.householdId, product.matchKey) });
  } catch (err) {
    next(err);
  }
});
