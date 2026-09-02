import { getJson } from './http.js';
import { classify } from '../categories.js';

/** Extrai o EAN de 13 digitos de qualquer texto (nome de arquivo, referencia). */
export function findEan(text) {
  const m = /(?<!\d)(\d{13})(?!\d)/.exec(String(text || ''));
  return m ? m[1] : null;
}

function pickSku(product) {
  const items = product.items || [];
  // Prefere o SKU com preco e em estoque; senao o primeiro que existir.
  for (const item of items) {
    const offer = item.sellers?.[0]?.commertialOffer;
    if (offer && offer.Price > 0 && offer.AvailableQuantity > 0) return item;
  }
  return items[0] || null;
}

function deepestCategory(product) {
  const cats = product.categories || [];
  // A VTEX devolve do mais especifico ao mais raso: "/Mercearia/Arroz/", "/Mercearia/".
  return cats.reduce((best, c) => (c.split('/').filter(Boolean).length > best.split('/').filter(Boolean).length ? c : best), cats[0] || '');
}

function normalize(product, market) {
  const item = pickSku(product);
  if (!item) return null;
  const offer = item.sellers?.[0]?.commertialOffer || {};
  const rawCategory = deepestCategory(product);
  const ean = /^\d{13}$/.test(item.ean || '') ? item.ean : findEan(product.productReference) || findEan(item.ean);
  const price = Number(offer.Price) || null;
  return {
    market,
    sku: String(item.itemId || product.productId),
    name: product.productName || item.name || '',
    brand: product.brand || null,
    ean,
    rawCategory,
    category: classify(rawCategory, product.productName),
    imageUrl: item.images?.[0]?.imageUrl || null,
    unit: (item.measurementUnit || 'un').toLowerCase(),
    price,
    listPrice: Number(offer.ListPrice) || price,
    available: (offer.AvailableQuantity ?? 0) > 0 && price > 0 ? 1 : 0,
    url: product.linkText ? `${market.site}/${product.linkText}/p` : null,
  };
}

/**
 * Angeloni, Festval e Muffato rodam VTEX, entao compartilham a mesma API
 * publica de catalogo -- muda so a conta e o dominio.
 */
export function createVtexMarket(config) {
  const { host } = config;
  const self = { ...config, platform: 'vtex' };

  self.search = async (term, limit = 24) => {
    const to = Math.max(0, Math.min(limit, 50) - 1);
    const url = `https://${host}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(term)}&_from=0&_to=${to}`;
    const data = await getJson(url);
    if (!Array.isArray(data)) return [];
    return data.map((p) => normalize(p, self)).filter(Boolean);
  };

  self.byEan = async (ean) => {
    const url = `https://${host}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${encodeURIComponent(ean)}&_from=0&_to=9`;
    const data = await getJson(url);
    if (!Array.isArray(data) || !data.length) return null;
    const exact = data
      .map((p) => normalize(p, self))
      .filter(Boolean)
      .find((p) => p.ean === ean);
    return exact || normalize(data[0], self);
  };

  self.categoryTree = async (depth = 3) => {
    const data = await getJson(`https://${host}/api/catalog_system/pub/category/tree/${depth}`);
    return Array.isArray(data) ? data : [];
  };

  self.browse = async (categoryPath, limit = 48) => {
    const to = Math.max(0, Math.min(limit, 50) - 1);
    const path = String(categoryPath || '').replace(/^\/|\/$/g, '');
    const url = `https://${host}/api/catalog_system/pub/products/search/${path}?_from=0&_to=${to}`;
    const data = await getJson(url);
    if (!Array.isArray(data)) return [];
    return data.map((p) => normalize(p, self)).filter(Boolean);
  };

  return self;
}
