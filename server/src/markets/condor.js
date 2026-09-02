import { getJson } from './http.js';
import { classify } from '../categories.js';
import { findEan } from './vtex.js';

/**
 * O Condor nao roda VTEX: e a plataforma osuper, cuja busca fica num servico
 * proprio (sense). A API nao devolve EAN, mas o nome do arquivo da imagem
 * costuma carrega-lo -- e o que permite casar o produto com os outros
 * mercados. Quando nao da, sobra o casamento por nome.
 */
export function createCondorMarket(config) {
  const self = { ...config, platform: 'osuper' };
  const base = () => `${config.searchEngineUrl}/${config.storeId}`;

  function normalize(hit) {
    const cats = hit.categories || [];
    // "store1441:Mercearia > Alimentos Basicos > Arroz" -> pega o mais fundo
    const rawCategory = cats
      .map((c) => c.replace(/^store\d+:/, ''))
      .reduce((best, c) => (c.split('>').length > best.split('>').length ? c : best), '');
    const pricing = hit.pricing || {};
    const price = Number(pricing.promotionalPrice ?? pricing.price) || null;
    const listPrice = Number(pricing.price) || price;
    return {
      market: self,
      sku: String(hit.id),
      name: hit.name || '',
      brand: hit.brandName || null,
      ean: findEan(hit.image),
      rawCategory,
      category: classify(rawCategory, hit.name),
      imageUrl: hit.image || null,
      unit: (hit.saleUnit || 'un').toLowerCase(),
      price,
      listPrice,
      available: (hit.quantity?.inStock ?? 0) > 0 && price > 0 ? 1 : 0,
      url: hit.slug ? `${config.site}/produtos/${hit.id}/${hit.slug}` : null,
    };
  }

  self.search = async (term, limit = 24) => {
    const url = `${base()}/search?search=${encodeURIComponent(term)}&size=${Math.min(limit, 50)}&from=0`;
    const data = await getJson(url);
    const hits = data?.hits;
    if (!Array.isArray(hits)) return [];
    return hits.map(normalize).filter((p) => p.name);
  };

  self.byEan = async (ean) => {
    // Nao ha busca por codigo de barras: procura pelo numero e confere.
    const results = await self.search(ean, 10).catch(() => []);
    const direct = results.find((p) => p.ean === ean);
    if (direct) return direct;
    return null;
  };

  self.categoryTree = async () => {
    // As facetas da busca ja trazem a arvore de categorias em uso.
    const data = await getJson(`${base()}/search?search=&size=1&from=0`).catch(() => null);
    const cats = data?.extraData?.categories || [];
    return cats.map((c) => ({ name: String(c.key ?? c).replace(/^store\d+:/, ''), count: c.doc_count ?? 0 }));
  };

  self.browse = async (categoryName, limit = 48) => {
    const url = `${base()}/search?search=&categories=${encodeURIComponent(categoryName)}&size=${Math.min(limit, 50)}&from=0`;
    const data = await getJson(url);
    const hits = data?.hits;
    if (!Array.isArray(hits)) return [];
    return hits.map(normalize).filter((p) => p.name);
  };

  return self;
}
