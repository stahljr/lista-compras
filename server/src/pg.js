import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A conexao com o Postgres, e uma casca fina que faz o resto do app falar com
 * ele do mesmo jeito que falava com o SQLite.
 *
 * Por que Postgres: o banco era um arquivo ao lado do processo, e hospedagem
 * gratuita apaga o disco a cada deploy -- junto com a conta e a lista. Com o
 * banco fora do servidor, o login passa a valer em qualquer aparelho e
 * sobrevive a qualquer reinicio.
 *
 * DATABASE_URL aponta para o Postgres de verdade (Supabase, Neon, qualquer um).
 * Sem ela, sobe um Postgres embutido em arquivo (PGlite) -- serve para rodar na
 * propria maquina sem instalar nada, e e o mesmo Postgres, mesmo dialeto.
 */

const armazem = new AsyncLocalStorage();
let conexao = null;

async function abrir() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: pg } = await import('pg');
    // COUNT(*) volta como bigint, e o driver entrega bigint como string para
    // nao perder precisao. Aqui sao contagens de itens de lista: cabem num
    // numero, e como string quebrariam toda comparacao (`n === 0`) e soma do
    // app. O PGlite ja devolve numero, entao os dois passam a concordar.
    pg.types.setTypeParser(20, (valor) => Number(valor));
    // Supabase e Neon exigem TLS; a cadeia deles nao vem no bundle do Node,
    // entao verificar o certificado aqui derrubaria a conexao sem ganho: o
    // trafego continua cifrado.
    const ssl = /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false };
    const pool = new pg.Pool({ connectionString: url, ssl, max: Number(process.env.PG_POOL || 8) });
    pool.on('error', (err) => console.error('[postgres] conexao caiu:', err.message));
    return {
      tipo: 'postgres',
      query: (text, params) => pool.query(text, params),
      exec: (text) => pool.query(text),
      client: async () => {
        const client = await pool.connect();
        return {
          query: (t, p) => client.query(t, p),
          exec: (t) => client.query(t),
          release: () => client.release(),
        };
      },
      close: () => pool.end(),
    };
  }

  let PGlite;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
  } catch {
    throw new Error(
      'sem DATABASE_URL e sem o Postgres embutido instalado. Defina DATABASE_URL ' +
        '(no Supabase: Connect > Connection string) ou rode "npm install" para desenvolver localmente.',
    );
  }
  const dir = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'pg');
  fs.mkdirSync(dir, { recursive: true });
  const pglite = await PGlite.create({ dataDir: dir });
  return {
    tipo: 'pglite',
    query: (text, params) => pglite.query(text, params),
    // Varios comandos numa string so: no PGlite isso e exec, nao query.
    exec: (text) => pglite.exec(text),
    // PGlite e um processo so, sem pool: a "transacao" usa a mesma conexao.
    client: async () => ({
      query: (t, p) => pglite.query(t, p),
      exec: (t) => pglite.exec(t),
      release: () => {},
    }),
    close: () => pglite.close(),
  };
}

export async function connect() {
  if (!conexao) conexao = await abrir();
  return conexao;
}

export const driver = () => conexao?.tipo ?? null;

/** A conexao da transacao em curso, quando ha uma. */
const atual = () => armazem.getStore() ?? conexao;

/**
 * O SQLite aceitava `?` e `@nome`; o Postgres quer $1, $2. A conversao fica
 * aqui para o SQL do app continuar legivel e igual ao que era.
 */
function traduzir(text, args) {
  const params = [];
  const nomeados = args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]);
  const objeto = nomeados ? args[0] : null;
  let posicao = 0;

  const sql = text.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)|\?/g, (achado, nome) => {
    if (nome !== undefined) {
      if (!objeto || !(nome in objeto)) throw new Error(`parametro @${nome} nao foi passado`);
      params.push(objeto[nome]);
    } else {
      params.push(args[posicao++]);
    }
    return `$${params.length}`;
  });

  // Coluna inteira recebendo true/false: o SQLite guardava 1/0 sozinho, o
  // Postgres recusa. As flags do app (picked, available, archived) sao inteiras.
  return [sql, params.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))];
}

class Statement {
  constructor(text) {
    this.text = text;
  }

  async all(...args) {
    const [sql, params] = traduzir(this.text, args);
    const r = await atual().query(sql, params);
    return r.rows;
  }

  async get(...args) {
    const rows = await this.all(...args);
    return rows[0];
  }

  /** Devolve { changes } -- e { id } quando o SQL termina em RETURNING id. */
  async run(...args) {
    const [sql, params] = traduzir(this.text, args);
    const r = await atual().query(sql, params);
    return { changes: r.rowCount ?? 0, id: r.rows?.[0]?.id ?? null, rows: r.rows ?? [] };
  }
}

export const db = {
  prepare: (text) => new Statement(text),

  /** Varios comandos de uma vez (a criacao do esquema). Sem parametros. */
  async exec(text) {
    const conn = atual();
    await (conn.exec ? conn.exec(text) : conn.query(text));
  },

  /**
   * Envolve a funcao numa transacao. Tudo que rodar dentro dela -- inclusive
   * db.prepare em funcoes chamadas la dentro -- usa a mesma conexao, por causa
   * do AsyncLocalStorage. E o que mantem o "ou tudo, ou nada" que o app
   * dependia no SQLite.
   */
  transaction(fn) {
    return async (...args) => {
      // Ja estamos dentro de uma transacao: entra nela em vez de abrir outra.
      // Abrir uma segunda conexao aqui seria pedir deadlock -- a de fora
      // segura os registros que a de dentro iria esperar.
      if (armazem.getStore()) return fn(...args);
      const client = await conexao.client();
      try {
        await client.query('BEGIN');
        const resultado = await armazem.run(client, () => fn(...args));
        await client.query('COMMIT');
        return resultado;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    };
  },
};
