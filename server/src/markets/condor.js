import { getJson, getText } from './http.js';
import { classify, fold } from '../categories.js';
import { findEan } from './vtex.js';
import { metaGet, metaSet } from '../db.js';

/**
 * O Condor, lido pelas paginas de produto -- nao pela busca.
 *
 * A busca dele (sense.osuper.com.br) passou a responder com desafio de
 * Cloudflare, e o robots.txt do site diz a mesma coisa em texto:
 *
 *     Disallow: /busca
 *     Disallow: /search
 *     Allow: /produtos/
 *     Allow: /categorias
 *
 * Ou seja: nao e "sem robos", e "nao na busca". Entao o caminho passou a ser
 * o que eles permitem. Duas pecas:
 *
 * 1. o sitemap.xml lista as 16 mil paginas de produto, e o endereco de cada
 *    uma carrega o nome ("/produtos/7572149/amido-de-milho-condor-200g").
 *    Isso da um indice pesquisavel sem consultar nada -- procurar "amido de
 *    milho" e casar palavras contra os enderecos que ja temos;
 * 2. a pagina de produto publica preco, nome, marca, foto e disponibilidade
 *    em JSON-LD (schema.org/Product) -- o dado estruturado que o site expoe
 *    de proposito para ser lido por maquina, e que o Google Shopping consome.
 *
 * O que se perde: a busca ao vivo do site, que ordenaria melhor e acharia o
 * que o nome do endereco nao diz. O que se ganha: o Condor volta a ter preco
 * de hoje, por um caminho que o proprio site autoriza.
 */
export function createCondorMarket(config) {
  const self = { ...config, platform: 'osuper' };
  const base = () => `${config.searchEngineUrl}/${config.storeId}`;
  const site = config.site.replace(/\/$/, '');

  /** Quantas paginas de produto abrir por busca. Cada uma e uma requisicao. */
  const PAGINAS_POR_BUSCA = Number(process.env.CONDOR_PAGINAS || 8);
  /** Quantos dias o indice do sitemap vale antes de valer a pena refazer. */
  const DIAS_DO_INDICE = 7;
  const CHAVE_INDICE = 'condor_indice';

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
      url: hit.slug ? `${site}/produtos/${hit.id}/${hit.slug}` : null,
    };
  }

  // ------------------------------------------------------------- o indice

  let indiceNaMemoria = null;

  /** "/produtos/7572149/amido-de-milho-condor-200g" -> {id, slug} */
  function lerSitemap(xml) {
    const vistos = new Set();
    const itens = [];
    for (const [, id, slug] of xml.matchAll(/\/produtos\/(\d+)\/([a-z0-9-]+)/g)) {
      if (vistos.has(id)) continue;
      vistos.add(id);
      itens.push({ id, slug });
    }
    return itens;
  }

  /**
   * O indice de produtos. Fica gravado porque o sitemap tem quase 7 MB: baixar
   * a cada reinicio seria pesado para os dois lados, e o catalogo de um
   * mercado nao muda de hora em hora.
   */
  async function indice({ forcar = false } = {}) {
    if (indiceNaMemoria && !forcar) return indiceNaMemoria;

    if (!forcar) {
      try {
        const guardado = JSON.parse((await metaGet(CHAVE_INDICE)) || 'null');
        const idade = guardado?.em ? (Date.now() - Date.parse(guardado.em)) / 86400000 : Infinity;
        if (guardado?.itens?.length && idade < DIAS_DO_INDICE) {
          indiceNaMemoria = guardado.itens;
          return indiceNaMemoria;
        }
      } catch {
        // Indice gravado ilegivel: refaz.
      }
    }

    const xml = await getText(`${site}/sitemap.xml`, { timeout: 45000 });
    const itens = xml ? lerSitemap(xml) : [];
    if (!itens.length) {
      // Sem sitemap novo, o velho (mesmo vencido) serve melhor que nada.
      const guardado = JSON.parse((await metaGet(CHAVE_INDICE)) || 'null');
      indiceNaMemoria = guardado?.itens || [];
      return indiceNaMemoria;
    }
    indiceNaMemoria = itens;
    await metaSet(CHAVE_INDICE, JSON.stringify({ em: new Date().toISOString(), itens }));
    console.log(`[condor] indice do sitemap: ${itens.length} produtos`);
    return itens;
  }

  self.indexar = () => indice({ forcar: true });
  self.tamanhoDoIndice = async () => (await indice()).length;

  // --------------------------------------------------------- casar o termo

  /**
   * Quanto este endereco casa com o que se procurou.
   *
   * O slug e o nome do produto em minusculas com hifens, entao casar palavra
   * por palavra chega perto do que a busca do site faria. Palavra inteira vale
   * mais que pedaco: "arroz" nao deve casar "arrozina" com o mesmo peso.
   */
  function nota(slug, palavras) {
    let pontos = 0;
    for (const palavra of palavras) {
      if (new RegExp(`(^|-)${palavra}(-|$)`).test(slug)) pontos += 2;
      else if (slug.includes(palavra)) pontos += 1;
    }
    return pontos;
  }

  // ------------------------------------------------------- ler uma pagina

  /** O JSON-LD do tipo Product que a pagina publica. */
  function lerProduto(html) {
    for (const [, bruto] of html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    )) {
      try {
        const dado = JSON.parse(bruto);
        const lista = Array.isArray(dado) ? dado : [dado];
        const produto = lista.find((d) => d && d['@type'] === 'Product');
        if (produto) return produto;
      } catch {
        // Um bloco torto nao impede os outros da mesma pagina.
      }
    }
    return null;
  }

  async function daPagina({ id, slug }) {
    const html = await getText(`${site}/produtos/${id}/${slug}`);
    if (!html) return null;
    const dado = lerProduto(html);
    if (!dado) return null;

    const oferta = dado.offers || {};
    const price = Number(oferta.price) || null;
    if (!price) return null;
    const imagem = Array.isArray(dado.image) ? dado.image[0] : dado.image || null;
    const nome = dado.name || slug.replace(/-/g, ' ');
    // A disponibilidade vem em schema.org: .../InStock ou .../OutOfStock.
    const emEstoque = !/OutOfStock|SoldOut|Discontinued/i.test(String(oferta.availability || ''));

    return {
      market: self,
      sku: String(dado.sku || id),
      name: nome,
      brand: dado.brand?.name || null,
      // O EAN vem no nome do arquivo da foto -- mesmo lugar de onde a API o
      // tirava, e por isso o casamento com os outros mercados continua igual.
      ean: findEan(imagem) || (/^\d{8,14}$/.test(String(dado.gtin13 || '')) ? String(dado.gtin13) : null),
      rawCategory: null,
      category: classify(null, nome),
      imageUrl: imagem,
      unit: 'un',
      price,
      listPrice: price,
      available: emEstoque && price > 0 ? 1 : 0,
      url: `${site}/produtos/${id}/${slug}`,
    };
  }

  /** Abre varias paginas ao mesmo tempo, mas poucas: e o site de alguem. */
  async function varias(alvos, concorrencia = 4) {
    const achados = [];
    for (let i = 0; i < alvos.length; i += concorrencia) {
      const lote = await Promise.allSettled(alvos.slice(i, i + concorrencia).map(daPagina));
      for (const r of lote) if (r.status === 'fulfilled' && r.value) achados.push(r.value);
    }
    return achados;
  }

  // ---------------------------------------------------------------- busca

  self.search = async (term, limit = 24) => {
    const palavras = fold(term)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length > 2);
    if (!palavras.length) return [];

    const lista = await indice();
    if (!lista.length) return [];

    const candidatos = [];
    for (const item of lista) {
      const pontos = nota(item.slug, palavras);
      // Exige o casamento de todas as palavras longas: sem isso "detergente
      // ype" traria qualquer detergente, e a pagina de cada um custa uma
      // requisicao.
      if (pontos >= palavras.length * 2) candidatos.push({ ...item, pontos });
    }
    // Sem casamento perfeito, aceita parcial -- melhor pouco que nada.
    const fila = (candidatos.length ? candidatos : lista.map((i) => ({ ...i, pontos: nota(i.slug, palavras) })))
      .filter((c) => c.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos || a.slug.length - b.slug.length)
      .slice(0, Math.min(limit, PAGINAS_POR_BUSCA));

    return varias(fila);
  };

  self.byEan = async (ean) => {
    // A pagina nao e pesquisavel por codigo de barras, mas o indice guarda o
    // que ja vimos: se o EAN estiver num slug (alguns tem), acha.
    const lista = await indice();
    const alvo = lista.filter((i) => i.slug.includes(String(ean)));
    if (alvo.length) {
      const achados = await varias(alvo.slice(0, 2));
      const certo = achados.find((p) => p.ean === String(ean));
      if (certo) return certo;
    }
    return null;
  };

  self.categoryTree = async () => {
    // A arvore vinha das facetas da busca, que nao responde mais. O sitemap
    // lista as categorias do site, que serve ao mesmo proposito.
    const xml = await getText(`${site}/sitemap.xml`, { timeout: 45000 }).catch(() => null);
    if (!xml) return [];
    const vistas = new Set();
    for (const [, caminho] of xml.matchAll(/\/categorias\/([a-z0-9/-]+)/g)) vistas.add(caminho.split('/')[0]);
    return [...vistas].map((name) => ({ name, count: 0 }));
  };

  self.browse = async (categoryName, limit = 48) => {
    // A busca por categoria era da API bloqueada. Aproxima pelo indice: os
    // enderecos que tem a palavra da categoria no nome.
    const palavra = fold(categoryName).split(/[^a-z0-9]+/).filter((p) => p.length > 2)[0];
    if (!palavra) return [];
    const lista = await indice();
    const alvo = lista.filter((i) => i.slug.includes(palavra)).slice(0, Math.min(limit, PAGINAS_POR_BUSCA));
    return varias(alvo);
  };

  /** A API antiga, para o dia em que voltar a atender. */
  self.buscaAntiga = async (term, limit = 24) => {
    const data = await getJson(`${base()}/search?search=${encodeURIComponent(term)}&size=${Math.min(limit, 50)}&from=0`);
    const hits = data?.hits;
    if (!Array.isArray(hits)) return [];
    return hits.map(normalize).filter((p) => p.name);
  };

  return self;
}
