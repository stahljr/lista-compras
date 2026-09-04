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

  /**
   * Rede que cobra preco diferente por regiao (o Atacadao e assim) precisa
   * dizer de onde se esta perguntando, senao a resposta vem sem preco ou com
   * o preco de outro estado.
   *
   * A propria VTEX resolve isso: /checkout/pub/regions devolve, para um CEP,
   * o `regionId` e as lojas que atendem ali. Guardamos o id e ele acompanha
   * cada consulta. Fica por CEP, e nao por loja escolhida a mao, porque a
   * lista de lojas por canal e privada (401) -- perguntar "quanto custa neste
   * CEP" e a pergunta que da para fazer, e e a certa.
   */
  let regiao = config.cep ? null : '';
  async function regionId() {
    if (regiao !== null) return regiao;
    try {
      const dado = await getJson(
        `https://${host}/api/checkout/pub/regions?country=BRA&postalCode=${encodeURIComponent(config.cep)}`,
      );
      regiao = Array.isArray(dado) && dado[0]?.id ? String(dado[0].id) : '';
      if (regiao) {
        const lojas = (dado[0].sellers || []).map((v) => v.name).filter(Boolean);
        console.log(`[${self.key}] regiao do CEP ${config.cep}: ${lojas.slice(0, 3).join(', ')}`);
      }
    } catch {
      // Sem regiao, a consulta ainda funciona -- so vem menos preco.
      regiao = '';
    }
    return regiao;
  }

  /**
   * Acrescenta a uma URL de catalogo o que a rede precisa para responder com
   * preco: o canal de venda e o recorte de regiao.
   *
   * Sao duas coisas, e uma nao substitui a outra -- medido no Atacadao: so
   * `regionId` traz zero preco em cinco produtos, so `sc=2` traz cinco de
   * cinco. O canal e quem carrega a tabela de preco; a regiao e quem diz de
   * qual praca. Juntos, cinco de cinco e a praca certa.
   */
  async function comContexto(url) {
    let saida = url;
    if (config.salesChannel) saida += `&sc=${encodeURIComponent(config.salesChannel)}`;
    const id = await regionId();
    return id ? `${saida}&regionId=${encodeURIComponent(id)}` : saida;
  }

  self.search = async (term, limit = 24) => {
    const to = Math.max(0, Math.min(limit, 50) - 1);
    const url = `https://${host}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(term)}&_from=0&_to=${to}`;
    const data = await getJson(await comContexto(url));
    if (!Array.isArray(data)) return [];
    return data.map((p) => normalize(p, self)).filter(Boolean);
  };

  self.byEan = async (ean) => {
    const url = `https://${host}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${encodeURIComponent(ean)}&_from=0&_to=9`;
    const data = await getJson(await comContexto(url));
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
    const data = await getJson(await comContexto(url));
    if (!Array.isArray(data)) return [];
    return data.map((p) => normalize(p, self)).filter(Boolean);
  };

  return self;
}
