import express from 'express';
import { unifiedSearch, categoryCounts, productsByCategory, categoryView, shelves, fillCategory, setCategory, setCategoryCover, hydrate, fillMissingOffers, priceStats } from '../catalog.js';
import { CATEGORIES, CATEGORY_BY_KEY } from '../categories.js';
import { marketInfo } from '../markets/index.js';
import { requireAuth } from '../auth.js';
import { warmupCatalog, warmupState, totalDoCatalogo } from '../warmup.js';

export const catalogRouter = express.Router();

catalogRouter.get('/markets', (_req, res) => res.json({ markets: marketInfo() }));

/** Busca nos quatro mercados de uma vez e devolve o preco de cada um. */
catalogRouter.get('/search', async (req, res, next) => {
  try {
    const term = String(req.query.q || '');
    if (term.trim().length < 2) return res.json({ products: [], failed: [] });
    const result = await unifiedSearch(term, {
      limit: Math.min(Number(req.query.limit) || 24, 40),
      fresh: req.query.fresh === '1',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Enche as prateleiras a pedido. Responde na hora e segue trabalhando: quem
 * pediu acompanha por GET, e a tela vai mostrando o que chega.
 */
catalogRouter.post('/warmup', requireAuth, (req, res) => {
  const estado = warmupState();
  if (!estado.rodando) void warmupCatalog({ porCategoria: Math.min(Number(req.body?.porCategoria) || 4, 8) });
  res.json({ warmup: warmupState() });
});

catalogRouter.get('/warmup', async (_req, res, next) => {
  try {
    res.json({ warmup: warmupState(), total: await totalDoCatalogo() });
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
    res.json({ shelves: await shelves({ perCategory: Math.min(Number(req.query.perCategory) || 10, 20) }) });
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
    };
    let view = await categoryView(key, filtros);
    // Corredor vazio (ou quase) busca nos mercados na hora, para nao mostrar
    // prateleira vazia so porque o seed ainda nao passou por ali. Com filtro
    // marcado nao faz sentido: pouco resultado ali e o filtro funcionando.
    const semFiltro = !filtros.sub && !filtros.brand && !filtros.size;
    if (req.query.fill !== '0' && semFiltro && !filtros.offset && view.products.length < 12) {
      await fillCategory(key);
      view = await categoryView(key, filtros);
    }
    res.json(view);
  } catch (err) {
    next(err);
  }
});

/** Escolhe (ou solta) a foto que ilustra o corredor. */
catalogRouter.patch('/categories/:key/cover', requireAuth, async (req, res, next) => {
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
catalogRouter.patch('/products/:id/category', requireAuth, async (req, res, next) => {
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
    res.json({ product, history: await priceStats(product.matchKey) });
  } catch (err) {
    next(err);
  }
});
