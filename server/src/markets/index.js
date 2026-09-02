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
  return MARKETS.map(({ key, label, color, site }) => ({ key, label, color, site }));
}

/**
 * Roda a mesma operacao nos quatro mercados sem deixar que um mercado fora do
 * ar derrube a busca inteira: cada falha vira um aviso e a busca segue.
 */
export async function acrossMarkets(fn, { markets = MARKETS } = {}) {
  const settled = await Promise.allSettled(markets.map((m) => fn(m)));
  const results = [];
  const failed = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') results.push({ market: markets[i], value: r.value });
    else failed.push({ market: markets[i].key, error: String(r.reason?.message || r.reason) });
  });
  return { results, failed };
}
