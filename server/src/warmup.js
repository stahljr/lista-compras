import { db } from './db.js';
import { unifiedSearch } from './catalog.js';
import { CATEGORIES } from './categories.js';
import { termosDe } from './catalog-terms.js';

/**
 * Enche o catalogo buscando nos mercados, corredor por corredor.
 *
 * O banco novo nasce vazio, e a home vazia parece app quebrado. Rodar o seed
 * pela mao exigiria um terminal no servidor -- que o plano gratuito do Render
 * nao da. Entao quem enche e o proprio app: um pouco no boot, e tudo de uma
 * vez quando alguem pede pelo botao.
 *
 * Vai devagar de proposito (uma busca por vez, com pausa): sao os sites dos
 * mercados do outro lado, e nao ha pressa nenhuma -- a tela ja mostra o que
 * chegou enquanto o resto vem.
 */
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let estado = { rodando: false, total: 0, feitos: 0, produtos: 0, corredor: null, terminadoEm: null };

export const warmupState = () => ({ ...estado });

async function comPreco(categoria) {
  const { n } = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM products p
         JOIN offers o ON o.product_id = p.id AND o.price > 0
        WHERE p.category = ?`,
    )
    .get(categoria);
  return n;
}

export async function totalDoCatalogo() {
  const { n } = await db
    .prepare('SELECT COUNT(DISTINCT p.id) AS n FROM products p JOIN offers o ON o.product_id = p.id AND o.price > 0')
    .get();
  return n;
}

/**
 * @param porCategoria quantos termos buscar em cada corredor
 * @param minimo       corredor que ja tem esse tanto de produto e pulado
 */
export async function warmupCatalog({ porCategoria = 4, minimo = 14 } = {}) {
  if (estado.rodando) return warmupState();

  const alvos = CATEGORIES.filter((c) => c.key !== 'outros');
  estado = {
    rodando: true,
    total: alvos.length * porCategoria,
    feitos: 0,
    produtos: 0,
    corredor: null,
    terminadoEm: null,
  };

  try {
    for (const categoria of alvos) {
      estado.corredor = categoria.label;
      const termos = termosDe(categoria.key).slice(0, porCategoria);
      for (const termo of termos) {
        // Confere antes de cada busca: o corredor pode ter enchido com o termo
        // anterior, e ai nao vale gastar outra ida aos quatro mercados.
        if ((await comPreco(categoria.key)) >= minimo) {
          estado.feitos += 1;
          continue;
        }
        try {
          const { products } = await unifiedSearch(termo, { limit: 24 });
          estado.produtos += products.length;
        } catch {
          // Mercado fora do ar nao interrompe os outros termos.
        }
        estado.feitos += 1;
        await pausa(350);
      }
    }
  } finally {
    estado.rodando = false;
    estado.corredor = null;
    estado.terminadoEm = new Date().toISOString();
    console.log(`[catalogo] aquecimento: ${estado.produtos} produtos em ${estado.feitos} buscas`);
  }
  return warmupState();
}

/**
 * No boot, se o catalogo esta praticamente vazio, comeca a enche-lo sozinho --
 * sem travar a subida do servidor e com folga para o processo atender as
 * primeiras telas.
 */
export function warmupOnBoot() {
  setTimeout(async () => {
    try {
      const total = await totalDoCatalogo();
      if (total >= 120) return;
      console.log(`[catalogo] ${total} produtos no banco: enchendo as prateleiras em segundo plano`);
      await warmupCatalog({ porCategoria: 3 });
    } catch (err) {
      console.error('[catalogo] aquecimento falhou:', err.message);
    }
  }, 8_000).unref();
}
