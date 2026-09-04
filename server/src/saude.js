import { db, metaGet, metaSet } from './db.js';
import { MARKETS, registrarBloqueio, bloqueiosConhecidos, marketsBloqueados } from './markets/index.js';

/**
 * Quem esta atendendo, e quem fechou a porta.
 *
 * O disjuntor de mercado vivia so na memoria, e isso o tornava inutil
 * justamente quando importava: a hospedagem gratuita derruba o processo por
 * inatividade, ele sobe de novo sem saber de nada, e a tela volta a mostrar
 * "o corredor esta vazio" em vez de "aquela rede nao deixa consultar". Quem
 * abre o app depois de um dia parado ve a versao errada da historia.
 *
 * Por isso duas coisas moram aqui: o bloqueio fica gravado (sobrevive ao
 * reinicio) e uma sondagem no boot descobre o estado sem esperar que alguem
 * tropece nele primeiro.
 */

const CHAVE = 'mercados_bloqueados';
/** Uma sondagem por boot, e so. Nao e monitoramento -- e nao bater na porta. */
const TERMO = 'arroz';

/** Le o que ficou gravado e devolve ao disjuntor da memoria. */
export async function carregarBloqueios() {
  try {
    const bruto = await metaGet(CHAVE);
    if (!bruto) return [];
    const salvos = JSON.parse(bruto);
    const vivos = [];
    for (const { market, motivo, ate } of salvos) {
      if (!ate || Date.parse(ate) <= Date.now()) continue;
      registrarBloqueio(market, motivo, Date.parse(ate));
      vivos.push(market);
    }
    return vivos;
  } catch {
    // Meta corrompida nao pode impedir o servidor de subir: no pior caso a
    // sondagem descobre tudo de novo.
    return [];
  }
}

/** Grava o estado atual, para o proximo boot ja saber. */
async function guardarBloqueios() {
  await metaSet(CHAVE, JSON.stringify(marketsBloqueados().map((b) => ({ market: b.market, motivo: b.error, ate: b.until }))));
}

/**
 * Pergunta a cada mercado se ele atende. Um termo, uma vez, e so nos que nao
 * sabemos estar bloqueados -- o objetivo e saber a verdade sem virar carga
 * para eles.
 */
export async function sondarMercados() {
  const conhecidos = bloqueiosConhecidos();
  const alvos = MARKETS.filter((m) => !conhecidos.has(m.key));
  if (!alvos.length) return marketsBloqueados();

  await Promise.allSettled(
    alvos.map(async (m) => {
      try {
        await m.search(TERMO, 1);
      } catch (err) {
        if (err?.bloqueado) {
          registrarBloqueio(m.key, String(err.message));
          console.warn(`[saude] ${m.key} esta bloqueando consultas automaticas`);
        }
        // Erro comum (rede, 5xx) nao vira bloqueio: a proxima busca de verdade
        // tenta de novo, e marcar aqui esconderia um mercado que esta bem.
      }
    }),
  );
  await guardarBloqueios();
  return marketsBloqueados();
}

/**
 * No boot: primeiro o que estava gravado (a tela ja fala a verdade na primeira
 * carga), depois a sondagem, com folga para nao competir com o inicio.
 */
export function sondarNoBoot({ atraso = 4000 } = {}) {
  setTimeout(() => {
    void (async () => {
      const vivos = await carregarBloqueios();
      if (vivos.length) console.warn(`[saude] bloqueio gravado ainda vale: ${vivos.join(', ')}`);
      await sondarMercados().catch(() => {});
    })();
  }, atraso).unref?.();
}

/** Quantas ofertas cada mercado tem no catalogo. Usado para explicar o vazio. */
export async function ofertasPorMercado() {
  const linhas = await db.prepare('SELECT market, COUNT(*) AS n FROM offers GROUP BY market').all();
  return Object.fromEntries(linhas.map((l) => [l.market, Number(l.n)]));
}
