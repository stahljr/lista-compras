import { db, metaGet, metaSet } from './db.js';
import { fold } from './categories.js';
import { brandKey, parseSize } from './facets.js';

/**
 * Unificar produto repetido.
 *
 * O mesmo produto entra no catalogo mais de uma vez por tres motivos, e todos
 * apareceram no catalogo de verdade:
 *
 * 1. EAN contra nome. O Condor nao publica codigo de barras, entao o produto
 *    dele cai numa chave "name:..." e nunca encontra o mesmo produto que veio
 *    de outro mercado com "ean:...". Era o pior caso: o preco do Condor
 *    aparecia como se fosse outro produto;
 * 2. EANs diferentes para a mesma coisa. O fabricante troca o codigo e o
 *    catalogo passa a ter dois "Mucilon Arroz 180g", cada um num mercado;
 * 3. o nome escrito de outro jeito -- "Arroz Tio João 1kg - Branco" e "Arroz
 *    Branco TIO JOÃO 1kg" sao o mesmo arroz.
 *
 * A uniao e por ponteiro, nao por exclusao: o perdedor continua na tabela com
 * `merged_into` apontando para o vencedor, e as ofertas migram. Nenhum preco
 * se perde, nada que aponte para o id antigo quebra, e desfazer uma uniao
 * errada e limpar uma coluna. Apagar linha seria irreversivel, e a regra
 * abaixo -- por boa que fique -- vai errar alguma vez.
 */

/** Muda quando a regra muda: e o que dispara uma nova passada. */
const VERSAO = 1;

/**
 * Palavras que nao distinguem produto nenhum -- ficam fora da assinatura para
 * que "Molho de Tomate 500g" e "Molho Tomate 500g" caiam no mesmo grupo.
 *
 * O criterio para entrar nesta lista e estreito: a palavra so e ruido se a
 * ausencia dela nunca muda o que voce pegaria da prateleira. A primeira versao
 * era generosa e a primeira passada mostrou o preco disso -- ela juntou
 * "Amido Maizena 200g" com "Amido MAIZENA Leve 200g Pague 150g", que e outra
 * embalagem e outra base de preco, porque "leve" e "pague" estavam aqui.
 *
 * Por isso ficaram de fora, ainda que parecam ruido:
 *
 *   com, sem   -- em portugues sao a palavra que decide: "sem lactose",
 *                 "sem gluten", "com acucar";
 *   leve, pague, unidade(s), pacote, embalagem -- dizem qual embalagem e,
 *                 e embalagem diferente e produto diferente na hora de pagar.
 */
const VAZIAS = new Set(['de', 'da', 'do', 'dos', 'das', 'em', 'no', 'na', 'para', 'tipo', 'the', 'tradicional']);

/**
 * A assinatura do produto: marca, tamanho e as palavras do nome, ordenadas.
 *
 * Ordenar resolve o (3): a ordem das palavras deixa de importar. E o tamanho
 * entra normalizado, para "1kg" e "1 kg" nao virarem grupos diferentes.
 *
 * O que NAO se descarta: numero e letra sozinhos. "Nescafé Gold Intensidade 9"
 * e "Intensidade 6" sao cafes diferentes, e a unica coisa que os separa e um
 * digito. Filtrar palavra curta -- o reflexo obvio -- juntaria os dois.
 */
export function assinaturaDe(produto) {
  const nome = fold(produto.name || '');
  const marca = brandKey(produto.brand) || '';
  const tamanho = produto.size_label || parseSize(produto.name || '')?.label || '';

  // O tamanho sai do nome antes de sobrar palavra: senao "500g" entra duas
  // vezes, uma como tamanho e outra como palavra, e um produto sem tamanho
  // lido casaria com outro que tem.
  const semTamanho = nome.replace(/\b\d+[.,]?\d*\s*(kg|g|mg|l|ml|un|und|cm|m|pc|pcs|litros?|gramas?|quilos?)\b/g, ' ');

  const palavras = [
    ...new Set(
      semTamanho
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((p) => p && !VAZIAS.has(p))
        // Palavra da marca nao entra: ela ja e um campo, e o nome as vezes a
        // traz e as vezes nao.
        .filter((p) => !marca.split(' ').includes(p)),
    ),
  ].sort();

  if (!palavras.length) return null;
  return `${marca}|${tamanho}|${palavras.join(' ')}`;
}

/**
 * Quem fica de pe num grupo.
 *
 * Prefere quem tem EAN: e a identidade real do produto, e mante-la faz o
 * proximo mercado que trouxer aquele codigo encontrar este produto em vez de
 * criar outro. Depois, quem tem mais oferta (mais mercado ja casou nele), e
 * por fim o id menor -- um critério estavel, para duas passadas escolherem o
 * mesmo vencedor.
 */
function escolherVencedor(grupo) {
  return [...grupo].sort(
    (a, b) =>
      Number(!!b.ean) - Number(!!a.ean) ||
      (b.ofertas || 0) - (a.ofertas || 0) ||
      a.id - b.id,
  )[0];
}

/** As tabelas que apontam para produto, e a coluna onde. */
const APONTAM = [
  ['offers', 'product_id'],
  ['list_items', 'product_id'],
  ['trip_items', 'product_id'],
  ['price_history', 'product_id'],
  ['favorites', 'product_id'],
];

/**
 * Funde o perdedor no vencedor: as ofertas passam para ele, o que apontava
 * para o perdedor passa a apontar para o vencedor, e o perdedor fica marcado.
 */
const fundir = db.transaction(async (vencedorId, perdedorId) => {
  // Oferta e unica por (market, market_sku). Se o vencedor ja tem oferta
  // daquele mercado com o mesmo sku, a do perdedor sai -- e a mesma linha.
  await db
    .prepare(
      `DELETE FROM offers
        WHERE product_id = ?
          AND EXISTS (SELECT 1 FROM offers o2
                       WHERE o2.product_id = ? AND o2.market = offers.market AND o2.market_sku = offers.market_sku)`,
    )
    .run(perdedorId, vencedorId);

  for (const [tabela, coluna] of APONTAM) {
    await db.prepare(`UPDATE ${tabela} SET ${coluna} = ? WHERE ${coluna} = ?`).run(vencedorId, perdedorId);
  }

  // Favorito e chave (household_id, product_id): mover pode colidir com um
  // favorito que a casa ja tinha no vencedor. O DELETE acima nao cobre isso,
  // entao a colisao vira uma linha so.
  await db
    .prepare(
      `DELETE FROM favorites
        WHERE product_id = ?
          AND EXISTS (SELECT 1 FROM favorites f2
                       WHERE f2.product_id = ? AND f2.household_id = favorites.household_id)`,
    )
    .run(perdedorId, vencedorId);

  await db.prepare('UPDATE products SET merged_into = ? WHERE id = ?').run(vencedorId, perdedorId);
});

/**
 * Passa o catalogo inteiro, agrupa e funde. Idempotente: rodar duas vezes nao
 * muda nada na segunda, porque o vencedor e escolhido por criterio estavel e
 * o perdedor sai da consulta na passada seguinte.
 */
export async function unificarCatalogo({ aplicar = true } = {}) {
  const produtos = await db
    .prepare(
      `SELECT p.id, p.name, p.brand, p.ean, p.size_label, p.category,
              (SELECT COUNT(*) FROM offers o WHERE o.product_id = p.id) AS ofertas
         FROM products p
        WHERE p.merged_into IS NULL
        ORDER BY p.id`,
    )
    .all();

  const grupos = new Map();
  for (const produto of produtos) {
    const chave = assinaturaDe(produto);
    if (!chave) continue;
    // A categoria entra na chave do grupo, nao na assinatura: dois produtos de
    // corredores diferentes com o mesmo nome sao provavelmente classificacao
    // errada de um deles, e unir esconderia o erro em vez de mostra-lo.
    const cheia = `${produto.category || 'outros'}::${chave}`;
    if (!grupos.has(cheia)) grupos.set(cheia, []);
    grupos.get(cheia).push(produto);
  }

  const unioes = [];
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const vencedor = escolherVencedor(grupo);
    for (const perdedor of grupo) {
      if (perdedor.id === vencedor.id) continue;
      unioes.push({ vencedor, perdedor });
      if (aplicar) await fundir(vencedor.id, perdedor.id);
    }
  }

  return { produtos: produtos.length, grupos: grupos.size, unioes };
}

/** Roda uma vez quando a regra muda de versao. */
export async function garantirUnificado() {
  if (Number((await metaGet('unificador')) || 0) >= VERSAO) return null;
  const r = await unificarCatalogo();
  await metaSet('unificador', String(VERSAO));
  console.log(`[unificar] ${r.unioes.length} produtos fundidos de ${r.produtos}`);
  return r;
}
