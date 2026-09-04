import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, metaGet, metaSet } from './db.js';
import { MARKET_BY_KEY } from './markets/index.js';
import { saveOffer } from './catalog.js';

/**
 * Catalogo semente de um mercado que fechou a porta.
 *
 * O Condor passou a recusar consulta automatica, e num banco novo isso
 * significa zero produto dele -- o filtro por Condor mostra prateleira vazia,
 * que e a resposta errada para "o que o Condor tem". Estes precos foram
 * coletados quando ele ainda atendia, e vem no repositorio para que um deploy
 * novo comece com o corredor cheio em vez de vazio.
 *
 * Duas regras que fazem disto uma semente e nao uma mentira:
 *
 * 1. so entra em banco onde aquele mercado nao tem nenhuma oferta. Onde ha
 *    dado coletado de verdade, o dado de verdade manda -- semente nunca
 *    sobrescreve preco vivo;
 * 2. a oferta guarda a data em que foi coletada, e nao a de hoje. E isso que
 *    permite a tela dizer "preço de 3/9" em vez de deixar parecer atual.
 */

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO = (market) => path.join(AQUI, '..', 'seed', `${market}.json`);

const contarOfertas = async (market) =>
  Number((await db.prepare('SELECT COUNT(*) AS n FROM offers WHERE market = ?').get(market))?.n || 0);

/**
 * Carrega a semente depois que a porta ja abriu.
 *
 * Sao 435 gravacoes, e contra um Postgres na rede cada uma custa uma ida e
 * volta -- dois minutos, faceis. Antes do listen isso reprovaria o health
 * check da hospedagem e derrubaria o deploy. Aqui o app responde primeiro e o
 * corredor do Condor enche em seguida, do mesmo jeito que o aquecimento.
 */
export function semanteNoBoot(market = 'condor', { atraso = 2000 } = {}) {
  setTimeout(() => {
    void carregarSemente(market)
      .then((r) => {
        if (r.gravados) console.log(`[semente] ${market}: ${r.gravados} ofertas de ${r.coletadoEm}`);
      })
      .catch((err) => console.warn(`[semente] ${market} falhou: ${err.message}`));
  }, atraso).unref?.();
}

export async function carregarSemente(market = 'condor') {
  const mercado = MARKET_BY_KEY.get(market);
  if (!mercado) return { pulou: 'mercado desconhecido' };

  const marca = `semente:${market}`;
  if (await metaGet(marca)) return { pulou: 'ja carregada' };

  const jaTem = await contarOfertas(market);
  if (jaTem > 0) {
    // Banco com dado vivo daquele mercado nao precisa de semente, e marcar
    // aqui evita reconferir a cada boot.
    await metaSet(marca, `dispensada: ${jaTem} ofertas proprias`);
    return { pulou: `ja havia ${jaTem} ofertas` };
  }

  let semente;
  try {
    semente = JSON.parse(fs.readFileSync(ARQUIVO(market), 'utf8'));
  } catch {
    return { pulou: 'sem arquivo de semente' };
  }
  if (!Array.isArray(semente.itens) || !semente.itens.length) return { pulou: 'semente vazia' };

  let gravados = 0;
  for (const item of semente.itens) {
    try {
      await saveOffer({ ...item, market: mercado });
      gravados++;
    } catch (err) {
      // Um item torto nao pode impedir os outros 434 de entrar.
      console.warn(`[semente] ${market}: ${item.name?.slice(0, 40)} ficou fora -- ${err.message}`);
    }
  }

  // A data e do lote, nao de agora: a oferta tem de nascer com a idade que tem.
  if (semente.coletadoEm) {
    await db.prepare('UPDATE offers SET updated_at = ? WHERE market = ?').run(semente.coletadoEm, market);
  }

  await metaSet(marca, `carregada em ${new Date().toISOString()}: ${gravados} ofertas de ${semente.coletadoEm}`);
  console.log(`[semente] ${market}: ${gravados} ofertas de ${semente.coletadoEm} carregadas`);
  return { gravados, coletadoEm: semente.coletadoEm };
}
