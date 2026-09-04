import { createVtexMarket } from './vtex.js';
import { createCondorMarket } from './condor.js';

/**
 * Loja usada em cada rede. Preco e disponibilidade variam por loja, entao
 * estes valores definem "de qual loja estamos falando". Podem ser trocados
 * por variavel de ambiente sem mexer no codigo.
 */
export const MARKETS = [
  createVtexMarket({
    key: 'angeloni',
    label: 'Angeloni',
    color: '#e11d48',
    site: 'https://www.angeloni.com.br',
    host: process.env.ANGELONI_HOST || 'superangeloni.vtexcommercestable.com.br',
  }),
  createVtexMarket({
    key: 'festval',
    label: 'Festval',
    color: '#16a34a',
    site: 'https://www.festval.com.br',
    host: process.env.FESTVAL_HOST || 'meufestval.vtexcommercestable.com.br',
  }),
  createVtexMarket({
    key: 'muffato',
    label: 'Muffato',
    color: '#f59e0b',
    site: 'https://www.supermuffato.com.br',
    host: process.env.MUFFATO_HOST || 'www.supermuffato.com.br',
  }),
  /**
   * O atacado, que e outro tipo de compra: fardo em vez de unidade, preco por
   * volume. Fica marcado como `wholesale` e por isso so entra na tela quando
   * alguem o escolhe -- misturado no corredor ele bagunçaria a comparacao,
   * porque R$ 30 de um fardo de doze nao se compara com R$ 3 de uma unidade.
   *
   * O Atacadao cobra preco por regiao, entao vai com um CEP: a consulta
   * pergunta "quanto custa aqui" em vez de aceitar o preco de outro estado.
   * ATACADAO_CEP troca a referencia sem mexer no codigo.
   */
  createVtexMarket({
    key: 'atacadao',
    label: 'Atacadão',
    color: '#1d4ed8',
    site: 'https://www.atacadao.com.br',
    host: process.env.ATACADAO_HOST || 'www.atacadao.com.br',
    cep: process.env.ATACADAO_CEP || '80010-010',
    salesChannel: process.env.ATACADAO_SC || '2',
    wholesale: true,
  }),
  createCondorMarket({
    key: 'condor',
    label: 'Condor',
    color: '#2563eb',
    site: 'https://www.condor.com.br',
    searchEngineUrl: process.env.CONDOR_SEARCH_URL || 'https://sense.osuper.com.br/314',
    storeId: process.env.CONDOR_STORE_ID || '1441',
  }),
];

export const MARKET_BY_KEY = new Map(MARKETS.map((m) => [m.key, m]));

export function marketInfo() {
  return MARKETS.map(({ key, label, color, site, wholesale }) => ({ key, label, color, site, wholesale: !!wholesale }));
}

/** As redes de varejo -- o que a tela mostra quando ninguem escolheu nada. */
export const MERCADOS_VAREJO = MARKETS.filter((m) => !m.wholesale).map((m) => m.key);
export const ehAtacado = (key) => !!MARKET_BY_KEY.get(key)?.wholesale;

/**
 * Mercados que fecharam a porta, e ate quando parar de bater nela.
 *
 * Quando uma rede passa a responder com desafio anti-robo, insistir custa
 * caro e nao traz nada: cada busca esperava o tempo dela para receber o mesmo
 * 403, e uma rodada de aquecimento faz dezenas de buscas. Aqui ela sai de
 * cena por um tempo -- as outras tres respondem no tempo delas -- e volta a
 * ser tentada depois, porque bloqueio de Cloudflare costuma ser temporario e
 * ninguem quer redeploy para reativar um mercado.
 */
const MINUTOS_DE_CASTIGO = Number(process.env.MARKET_BLOCK_MINUTES || 30);
const bloqueados = new Map();

/**
 * Poe um mercado em castigo. Chamado por quem detectou o bloqueio agora, e
 * tambem por quem leu o bloqueio gravado de um processo anterior -- o disjuntor
 * na memoria nao pode ser a unica memoria disso, senao cada reinicio o app
 * volta a achar que esta tudo bem.
 */
export function registrarBloqueio(key, motivo, ate = Date.now() + MINUTOS_DE_CASTIGO * 60000) {
  if (!MARKET_BY_KEY.has(key)) return;
  bloqueados.set(key, { motivo, ate });
}

/** Tira do castigo: o mercado voltou a atender. */
export function liberar(key) {
  if (bloqueados.delete(key)) console.log(`[mercado] ${key} voltou a atender`);
}

/** As chaves em castigo, para quem so precisa saber quem pular. */
export const bloqueiosConhecidos = () => new Set(marketsBloqueados().map((b) => b.market));

/** Quem esta em castigo agora, com o motivo. Vai para a tela. */
export function marketsBloqueados() {
  const agora = Date.now();
  const fora = [];
  for (const [key, info] of bloqueados) {
    if (info.ate <= agora) bloqueados.delete(key);
    else fora.push({ market: key, error: info.motivo, blocked: true, until: new Date(info.ate).toISOString() });
  }
  return fora;
}

const emCastigo = (key) => {
  const info = bloqueados.get(key);
  if (!info) return null;
  if (info.ate <= Date.now()) {
    bloqueados.delete(key);
    return null;
  }
  return info;
};

/**
 * Roda a mesma consulta nos quatro mercados ao mesmo tempo. Um mercado fora
 * do ar nao derruba os outros: cada um responde por si, e quem falhou volta
 * na lista de falhas para a tela poder dizer o que faltou.
 */
export async function acrossMarkets(fn, { markets = MARKETS } = {}) {
  const results = [];
  const failed = [];

  // Quem esta em castigo nem e consultado -- e ja entra como falha, para a
  // tela nao confundir "nao perguntei" com "nao tem".
  const alvos = [];
  for (const m of markets) {
    const castigo = emCastigo(m.key);
    if (castigo) failed.push({ market: m.key, error: castigo.motivo, blocked: true });
    else alvos.push(m);
  }

  const settled = await Promise.allSettled(alvos.map((m) => fn(m)));
  settled.forEach((r, i) => {
    const mercado = alvos[i];
    if (r.status === 'fulfilled') {
      results.push({ market: mercado, value: r.value });
      return;
    }
    const motivo = String(r.reason?.message || r.reason);
    if (r.reason?.bloqueado) {
      bloqueados.set(mercado.key, { motivo, ate: Date.now() + MINUTOS_DE_CASTIGO * 60000 });
      console.warn(`[mercado] ${mercado.key} bloqueado; fora por ${MINUTOS_DE_CASTIGO} min -- ${motivo}`);
      failed.push({ market: mercado.key, error: motivo, blocked: true });
      return;
    }
    failed.push({ market: mercado.key, error: motivo });
  });
  return { results, failed };
}
