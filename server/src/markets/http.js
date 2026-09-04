const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Erro de mercado que fechou a porta -- nao e "deu erro", e "nao vai atender".
 *
 * A diferenca importa em dois lugares: nao vale retentar (a resposta seria a
 * mesma), e a tela tem de dizer outra coisa. Um 5xx sob carga passa; um muro
 * de protecao anti-robo, nao.
 */
export class MercadoBloqueado extends Error {
  constructor(host) {
    super(`${host} esta bloqueando consultas automaticas`);
    this.name = 'MercadoBloqueado';
    this.bloqueado = true;
  }
}

/** A resposta e um desafio de protecao, e nao os dados que se pediu? */
function ehDesafio(status, corpo) {
  if (status !== 403 && status !== 503 && status !== 429) return false;
  return /just a moment|challenges\.cloudflare|cf-browser-verification|captcha/i.test(corpo || '');
}

/**
 * GET de uma pagina, para quando o preco mora no HTML e nao numa API.
 *
 * Usa os mesmos cuidados do getJson -- timeout, retentativa, deteccao de muro
 * -- porque a diferenca aqui e so o formato da resposta.
 */
export async function getText(url, { timeout = 15000, retries = 1, headers = {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'pt-BR,pt;q=0.9',
          ...headers,
        },
      });
      if (res.status === 404) return null;
      const corpo = await res.text();
      if (!res.ok) {
        if (ehDesafio(res.status, corpo)) throw new MercadoBloqueado(new URL(url).host);
        throw new Error(`HTTP ${res.status}`);
      }
      return corpo;
    } catch (err) {
      lastError = err;
      if (err instanceof MercadoBloqueado) throw err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/**
 * GET JSON com timeout e retentativa. Os sites dos mercados as vezes devolvem
 * 5xx sob carga, entao vale tentar de novo antes de desistir do mercado --
 * menos quando a resposta e um muro de protecao, que retentar so piora.
 */
export async function getJson(url, { timeout = 15000, retries = 2, headers = {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: 'application/json', 'accept-language': 'pt-BR,pt;q=0.9', ...headers },
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        // Le o corpo antes de decidir: e o corpo que distingue "servidor
        // cansado" de "protecao anti-robo".
        const corpo = await res.text().catch(() => '');
        if (ehDesafio(res.status, corpo)) throw new MercadoBloqueado(new URL(url).host);
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch (err) {
      lastError = err;
      // Porta fechada nao se arromba tentando de novo: sai na primeira.
      if (err instanceof MercadoBloqueado) throw err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
