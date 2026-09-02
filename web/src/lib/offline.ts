/**
 * Dentro do mercado o sinal cai. As leituras vem do cache do service worker,
 * mas marcar item e anotar preco sao escritas -- e perder isso no corredor
 * seria o pior momento possivel. Entao a escrita que falha por falta de rede
 * fica numa fila no proprio aparelho e e reenviada quando a conexao volta.
 */
const CHAVE = 'lc_outbox';

export type Pendente = { id: string; method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown; at: number };

function ler(): Pendente[] {
  try {
    const cru = localStorage.getItem(CHAVE);
    return cru ? (JSON.parse(cru) as Pendente[]) : [];
  } catch {
    return [];
  }
}

function gravar(fila: Pendente[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(fila));
  } catch {
    // Armazenamento cheio ou bloqueado: nao ha o que fazer alem de seguir.
  }
}

const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function enfileirar(method: Pendente['method'], path: string, body?: unknown) {
  const fila = ler();
  // Marcar o item e anotar o preco sao dois toques na mesma rota, cada um com
  // um patch parcial. Eles precisam ser MESCLADOS: trocar um pelo outro perdia
  // o "pego" e so o preco chegava no servidor.
  const existente = fila.find((p) => p.method === method && p.path === path);
  if (existente && objeto(existente.body) && objeto(body)) {
    existente.body = { ...existente.body, ...body };
    existente.at = Date.now();
    gravar(fila);
    return;
  }
  if (existente && body === undefined && existente.body === undefined) return;
  fila.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, method, path, body, at: Date.now() });
  gravar(fila);
}

export function pendentes() {
  return ler().length;
}

/** Reenvia a fila em ordem. Devolve quantas escritas foram aceitas. */
export async function escoar(): Promise<number> {
  let fila = ler();
  let enviadas = 0;
  while (fila.length) {
    const item = fila[0];
    try {
      const res = await fetch(`/api${item.path}`, {
        method: item.method,
        credentials: 'same-origin',
        headers: item.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: item.body === undefined ? undefined : JSON.stringify(item.body),
      });
      // 4xx nao melhora com repeticao (item apagado, compra encerrada): descarta.
      if (!res.ok && res.status < 500) {
        fila = fila.slice(1);
        gravar(fila);
        continue;
      }
      if (!res.ok) break; // erro do servidor: tenta de novo depois
      fila = fila.slice(1);
      gravar(fila);
      enviadas++;
    } catch {
      break; // ainda sem rede
    }
  }
  return enviadas;
}

/** Ultimo estado conhecido, para o app abrir mostrando a lista mesmo offline. */
const CACHE = 'lc_cache';

export function guardar<T>(chave: string, valor: T) {
  try {
    const atual = JSON.parse(localStorage.getItem(CACHE) || '{}');
    atual[chave] = valor;
    localStorage.setItem(CACHE, JSON.stringify(atual));
  } catch {
    /* sem espaco: segue sem cache local */
  }
}

export function recuperar<T>(chave: string): T | null {
  try {
    const atual = JSON.parse(localStorage.getItem(CACHE) || '{}');
    return (atual[chave] as T) ?? null;
  } catch {
    return null;
  }
}

export function limparCache() {
  try {
    localStorage.removeItem(CACHE);
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada a fazer */
  }
}
