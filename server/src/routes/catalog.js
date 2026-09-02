import express from 'express';
import { unifiedSearch, categoryCounts, productsByCategory, shelves, fillCategory, hydrate, fillMissingOffers, priceStats } from '../catalog.js';
import { CATEGORIES } from '../categories.js';
import { marketInfo } from '../markets/index.js';

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

catalogRouter.get('/categories', (_req, res) => {
  const counts = new Map(categoryCounts().map((c) => [c.category, c.total]));
  res.json({
    categories: CATEGORIES.map((c) => ({ ...c, total: counts.get(c.key) || 0 })),
  });
});

/** Home no estilo mercado: as categorias com uma amostra de cada. */
catalogRouter.get('/shelves', (req, res) => {
  res.json({ shelves: shelves({ perCategory: Math.min(Number(req.query.perCategory) || 10, 20) }) });
});

catalogRouter.get('/categories/:key', async (req, res, next) => {
  try {
    const key = req.params.key;
    const limit = Math.min(Number(req.query.limit) || 60, 100);
    const offset = Number(req.query.offset) || 0;
    let products = productsByCategory(key, { limit, offset });
    // Corredor vazio (ou quase) busca nos mercados na hora, para nao mostrar
    // prateleira vazia so porque o seed ainda nao passou por ali.
    if (req.query.fill !== '0' && !offset && products.length < 12) {
      await fillCategory(key);
      products = productsByCategory(key, { limit, offset });
    }
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/products/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const product = req.query.refresh === '1' ? await fillMissingOffers(id) : hydrate(id);
    if (!product) return res.status(404).json({ error: 'produto nao encontrado' });
    res.json({ product, history: priceStats(product.matchKey) });
  } catch (err) {
    next(err);
  }
});
